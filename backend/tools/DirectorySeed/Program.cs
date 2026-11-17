using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;

// This operator tool only creates directory metadata through the existing audited service.
// Preview is the default; --apply is required for permanent writes. It never migrates a database.
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true, UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow };
string? output = null;
string? planHash = null;
var completed = new List<BatchProof>();
try
{
    var options = ParseArguments(args);
    output = Path.GetFullPath(options["output"]);
    if (File.Exists(output)) throw new ToolException("OUTPUT_EXISTS");
    var database = options["database"];
    if (database != "PersonalFinanceWeb" && !Regex.IsMatch(database, "^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$"))
        throw new ToolException("DATABASE_NOT_ALLOWED");
    var input = Path.GetFullPath(options["input"]);
    var plan = JsonSerializer.Deserialize<SeedPlan>(await File.ReadAllTextAsync(input, Encoding.UTF8), json)
        ?? throw new ToolException("PLAN_INVALID");
    ValidatePlan(plan);
    // Hash the canonical request, rather than its whitespace or the caller's JSON property ordering.
    planHash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(plan, FinanceService.Json))).ToLowerInvariant();
    var apply = options.ContainsKey("apply");
    var allNames = plan.Merchants.Select(name => new Candidate("merchants", name))
        .Concat(plan.Tags.Select(name => new Candidate("tags", name))).ToArray();
    var builder = new SqlConnectionStringBuilder { DataSource = ".", InitialCatalog = database, IntegratedSecurity = true,
        TrustServerCertificate = true, ApplicationName = "PersonalFinance.DirectorySeed", ConnectTimeout = 15 };
    var dbOptions = new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(builder.ConnectionString, sql => sql.CommandTimeout(120)).Options;
    await using (var db = new FinanceDb(dbOptions))
    {
        if (!await db.Users.AsNoTracking().AnyAsync(x => x.Id == plan.UserId)) throw new ToolException("OWNER_NOT_FOUND");
        var metadata = await DirectoryMetadata(db);
        var duplicateGroups = await CandidateDuplicateGroups(db, metadata, allNames);
        if (duplicateGroups != 0) throw new ToolException("PLAN_SQL_COLLATION_DUPLICATES");
        completed = await LoadCompleted(db, plan, planHash);
        await ValidateCompleted(db, plan, completed);
        var seededIds = completed.SelectMany(x => x.Ids).ToArray();
        var conflicts = await ExistingConflicts(db, metadata, allNames, plan.UserId, seededIds);
        var before = new DirectoryCounts(await db.Directory.CountAsync(x => x.UserId == plan.UserId && x.Kind == "merchants"),
            await db.Directory.CountAsync(x => x.UserId == plan.UserId && x.Kind == "tags"));
        if (conflicts > 0)
        {
            await SaveProof(output, new { formatVersion = 1, mode = apply ? "apply" : "preview", state = "Blocked", planHash,
                planned = new DirectoryCounts(plan.Merchants.Length, plan.Tags.Length), completedBatches = completed.Count,
                completedIds = completed, conflictCount = conflicts, code = "EXISTING_NAME_CONFLICT" }, json);
            Console.WriteLine($"Blocked: {conflicts} existing name conflicts. No new directory writes were made.");
            return 2;
        }
        if (!apply)
        {
            await SaveProof(output, new { formatVersion = 1, mode = "preview", state = "Ready", planHash,
                planned = new DirectoryCounts(plan.Merchants.Length, plan.Tags.Length), completedBatches = completed.Count,
                completedIds = completed, conflictCount = 0, sqlCollationDuplicateGroups = 0 }, json);
            Console.WriteLine($"Preview ready: 5,000 merchants and 5,000 tags; {completed.Count} committed batches can be recovered. Plan {planHash}.");
            return 0;
        }
        // Remember only aggregate directory counts; no existing names or financial information enter proof files.
        var firstCounts = new DirectoryCounts(before.Merchants - completed.Where(x => x.Kind == "merchants").Sum(x => x.Ids.Length),
            before.Tags - completed.Where(x => x.Kind == "tags").Sum(x => x.Ids.Length));
        var batches = new[] { new { Kind = "merchants", Names = plan.Merchants }, new { Kind = "tags", Names = plan.Tags } };
        foreach (var group in batches)
        for (var index = 0; index < group.Names.Length / 100; index++)
        {
            // A fresh context per batch makes a rollback isolated and avoids retaining all 10,000 tracked rows.
            await using var batchDb = new FinanceDb(dbOptions);
            var service = new FinanceService(batchDb, null!, NullLogger<FinanceService>.Instance);
            var names = group.Names.Skip(index * 100).Take(100).ToArray();
            var body = new { formatVersion = 1, planHash, userId = plan.UserId, kind = group.Kind, batchIndex = index, names };
            var context = new DefaultHttpContext();
            context.Request.Method = "POST";
            context.Request.Path = $"/local-ops/directory-seed/{group.Kind}/{index}";
            context.Request.Headers["Idempotency-Key"] = BatchKey(planHash, group.Kind, index);
            context.Items["FinanceSource"] = "DirectorySeed";
            // Historical databases have a 36-character audit trace column. The operation key
            // retains the full plan/batch identity; a GUID trace also fits those older schemas.
            context.TraceIdentifier = Guid.NewGuid().ToString();
            var result = await service.Write(plan.UserId, context, body, async () =>
            {
                if (!await batchDb.Users.AsNoTracking().AnyAsync(x => x.Id == plan.UserId)) throw new ToolException("OWNER_NOT_FOUND");
                // FinanceService.Write holds the same user-level transaction applock as normal UI writes.
                // Recheck the complete plan under that lock before the first permanent batch.
                if (group.Kind == "merchants" && index == 0)
                {
                    var prior = await LoadCompleted(batchDb, plan, planHash);
                    await ValidateCompleted(batchDb, plan, prior);
                    if (await ExistingConflicts(batchDb, metadata, allNames, plan.UserId, prior.SelectMany(x => x.Ids).ToArray()) != 0)
                        throw new ToolException("EXISTING_NAME_CONFLICT");
                }
                // The final unique index also protects against writers that do not take the application lock.
                if (await ExistingConflicts(batchDb, metadata, names.Select(name => new Candidate(group.Kind, name)).ToArray(), plan.UserId, []) != 0)
                    throw new ToolException("EXISTING_NAME_CONFLICT");
                var ids = new List<string>(100);
                foreach (var name in names)
                {
                    var saved = await service.SaveDirectory(plan.UserId, group.Kind,
                        new SaveDirectory(name, Currency: "CNY", Budget: "0", Status: "Active"), null, null);
                    ids.Add(JsonSerializer.SerializeToElement(saved, FinanceService.Json).GetProperty("id").GetString()!);
                }
                return new BatchProof(planHash, group.Kind, index, ids.ToArray());
            }, idempotent: true);
            var proof = JsonSerializer.Deserialize<BatchProof>(JsonSerializer.Serialize(result, FinanceService.Json), json)
                ?? throw new ToolException("BATCH_RESPONSE_INVALID");
            ValidateBatch(proof, planHash);
            completed.RemoveAll(x => x.Kind == proof.Kind && x.BatchIndex == proof.BatchIndex);
            completed.Add(proof);
            // Idempotencies are authoritative recovery records if the process stops before writing its final proof.
            Console.WriteLine($"Committed or recovered {group.Kind} batch {index + 1}/50 ({proof.Ids.Length} records).");
        }
        await using var verification = new FinanceDb(dbOptions);
        var final = await LoadCompleted(verification, plan, planHash);
        await ValidateCompleted(verification, plan, final);
        if (final.Count != 100 || final.Sum(x => x.Ids.Length) != 10000) throw new ToolException("FINAL_COUNT_MISMATCH");
        var after = new DirectoryCounts(await verification.Directory.CountAsync(x => x.UserId == plan.UserId && x.Kind == "merchants"),
            await verification.Directory.CountAsync(x => x.UserId == plan.UserId && x.Kind == "tags"));
        await SaveProof(output, new { formatVersion = 1, mode = "apply", state = "Completed", planHash,
            planned = new DirectoryCounts(5000, 5000), countsBeforeSeed = firstCounts, countsAfter = after,
            committedCounts = new DirectoryCounts(final.Where(x => x.Kind == "merchants").Sum(x => x.Ids.Length), final.Where(x => x.Kind == "tags").Sum(x => x.Ids.Length)),
            completedBatches = final.Count, completedIds = final.OrderBy(x => x.Kind).ThenBy(x => x.BatchIndex).ToArray() }, json);
        Console.WriteLine("Completed and verified 5,000 merchant IDs and 5,000 tag IDs. No existing directory record was overwritten.");
    }
    return 0;
}
catch (Exception ex)
{
    // Do not print raw SQL errors, connection strings, plan names, user credentials or existing financial details.
    var code = ex switch { ToolException t => t.Code, ApiException a => a.Code, DbUpdateException => "DATABASE_WRITE_REJECTED",
        SqlException => "DATABASE_QUERY_FAILED", JsonException => "PLAN_JSON_INVALID", _ => "TOOL_FAILED" };
    var sqlNumber = ex is SqlException directSql ? directSql.Number : ex.InnerException is SqlException innerSql ? innerSql.Number : (int?)null;
    if (output is not null && !File.Exists(output))
    {
        try { await SaveProof(output, new { formatVersion = 1, state = "Interrupted", planHash, code, sqlNumber,
            completedBatches = completed.Count, completedIds = completed.OrderBy(x => x.Kind).ThenBy(x => x.BatchIndex).ToArray() }, json); }
        catch { /* SQL idempotencies still provide recovery if the local output path is unavailable. */ }
    }
    Console.Error.WriteLine($"Directory seed stopped: {code}{(sqlNumber is null ? "" : $" (SQL number {sqlNumber})")}. Repeat the identical plan with a new output path to recover committed batches.");
    return 2;
}

static Dictionary<string, string> ParseArguments(string[] args)
{
    var values = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var i = 0; i < args.Length; i++)
    {
        if (args[i] == "--apply") { if (!values.TryAdd("apply", "true")) throw new ToolException("ARGUMENTS_INVALID"); continue; }
        if (args[i] is not ("--database" or "--input" or "--output") || i + 1 == args.Length) throw new ToolException("ARGUMENTS_INVALID");
        if (!values.TryAdd(args[i][2..], args[++i])) throw new ToolException("ARGUMENTS_INVALID");
    }
    if (!new[] { "database", "input", "output" }.All(values.ContainsKey)) throw new ToolException("ARGUMENTS_INVALID");
    return values;
}

static void ValidatePlan(SeedPlan plan)
{
    if (plan.FormatVersion != 1 || !Guid.TryParseExact(plan.UserId, "D", out _) || plan.Merchants is null || plan.Tags is null
        || plan.Merchants.Length != 5000 || plan.Tags.Length != 5000) throw new ToolException("PLAN_INVALID");
    foreach (var names in new[] { plan.Merchants, plan.Tags })
    {
        if (names.Any(name => string.IsNullOrWhiteSpace(name) || name != name.Trim() || name.Length > 150 || name.Any(char.IsControl))
            || names.Distinct(StringComparer.Ordinal).Count() != 5000) throw new ToolException("PLAN_NAMES_INVALID");
    }
}

static string BatchKey(string hash, string kind, int batchIndex) => $"directory-seed:{hash}:{kind}:{batchIndex:D3}";

static async Task<List<BatchProof>> LoadCompleted(FinanceDb db, SeedPlan plan, string hash)
{
    var prefix = $"directory-seed:{hash}:";
    var saved = await db.Idempotencies.AsNoTracking().Where(x => x.UserId == plan.UserId && x.Key.StartsWith(prefix))
        .Select(x => new { x.Key, x.Response }).ToArrayAsync();
    var completed = new List<BatchProof>();
    foreach (var item in saved)
    {
        var proof = JsonSerializer.Deserialize<BatchProof>(item.Response, FinanceService.Json) ?? throw new ToolException("RECOVERY_PROOF_INVALID");
        ValidateBatch(proof, hash);
        if (item.Key != BatchKey(hash, proof.Kind, proof.BatchIndex)) throw new ToolException("RECOVERY_PROOF_INVALID");
        completed.Add(proof);
    }
    if (completed.Select(x => x.Kind + ":" + x.BatchIndex).Distinct().Count() != completed.Count
        || completed.SelectMany(x => x.Ids).Distinct(StringComparer.Ordinal).Count() != completed.Count * 100)
        throw new ToolException("RECOVERY_PROOF_INVALID");
    return completed;
}

static void ValidateBatch(BatchProof proof, string hash)
{
    if (proof.PlanHash != hash || proof.Kind is not ("merchants" or "tags") || proof.BatchIndex is < 0 or >= 50
        || proof.Ids is null || proof.Ids.Length != 100 || proof.Ids.Any(id => !Guid.TryParseExact(id, "D", out _))
        || proof.Ids.Distinct(StringComparer.Ordinal).Count() != 100) throw new ToolException("RECOVERY_PROOF_INVALID");
}

static async Task ValidateCompleted(FinanceDb db, SeedPlan plan, List<BatchProof> completed)
{
    foreach (var batch in completed)
    {
        var rows = await db.Directory.AsNoTracking().Where(x => x.UserId == plan.UserId && batch.Ids.Contains(x.Id))
            .Select(x => new { x.Id, x.Kind, x.Name, x.Currency, x.Budget, x.Status }).ToDictionaryAsync(x => x.Id, StringComparer.Ordinal);
        var names = batch.Kind == "merchants" ? plan.Merchants : plan.Tags;
        for (var i = 0; i < 100; i++)
        {
            if (!rows.TryGetValue(batch.Ids[i], out var row) || row.Kind != batch.Kind || row.Name != names[batch.BatchIndex * 100 + i]
                || row.Currency != "CNY" || row.Budget != 0 || row.Status != "Active") throw new ToolException("COMMITTED_RECORD_CHANGED");
        }
    }
}

static async Task<DirectorySqlMetadata> DirectoryMetadata(FinanceDb db)
{
    var entity = db.Model.FindEntityType(typeof(PersonalFinance.Api.Domain.DirectoryItem))!;
    var schema = entity.GetSchema() ?? "dbo";
    var table = entity.GetTableName()!;
    // Schema/table are derived from the compiled EF model; collation is read from SQL Server metadata.
    await db.Database.OpenConnectionAsync();
    using var command = db.Database.GetDbConnection().CreateCommand();
    command.CommandText = "SELECT c.name,c.collation_name FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@schema AND t.name=@table AND c.name IN ('Id','Name','Kind')";
    AddParameter(command, "@schema", schema); AddParameter(command, "@table", table);
    using var reader = await command.ExecuteReaderAsync();
    var collations = new Dictionary<string, string>();
    while (await reader.ReadAsync()) collations.Add(reader.GetString(0), reader.GetString(1));
    if (collations.Count != 3 || collations.Values.Any(value => !Regex.IsMatch(value, "^[A-Za-z0-9_]+$"))) throw new ToolException("DIRECTORY_SCHEMA_INVALID");
    return new DirectorySqlMetadata($"[{schema.Replace("]", "]]")}].[{table.Replace("]", "]]")}]", collations["Kind"], collations["Name"], collations["Id"]);
}

static async Task<int> CandidateDuplicateGroups(FinanceDb db, DirectorySqlMetadata metadata, Candidate[] names)
{
    using var command = await QueryCommand(db);
    command.CommandText = $"SELECT COUNT(*) FROM (SELECT kind COLLATE {metadata.KindCollation} AS kind,name COLLATE {metadata.NameCollation} AS name FROM OPENJSON(@names) WITH (kind nvarchar(20) '$.kind',name nvarchar(150) '$.name') GROUP BY kind COLLATE {metadata.KindCollation},name COLLATE {metadata.NameCollation} HAVING COUNT(*)>1) duplicates";
    AddParameter(command, "@names", JsonSerializer.Serialize(names, FinanceService.Json));
    return Convert.ToInt32(await command.ExecuteScalarAsync());
}

static async Task<int> ExistingConflicts(FinanceDb db, DirectorySqlMetadata metadata, Candidate[] names, string user, string[] seededIds)
{
    using var command = await QueryCommand(db);
    var conflictsQuery = $"SELECT COUNT(*) FROM OPENJSON(@names) WITH (kind nvarchar(20) '$.kind',name nvarchar(150) '$.name') p JOIN {metadata.Table} d ON d.Kind=p.kind COLLATE {metadata.KindCollation} AND d.Name=p.name COLLATE {metadata.NameCollation} WHERE d.UserId=@user";
    // Parse recovery IDs once into an indexed temporary table. OPENJSON's default
    // nvarchar(4000) values in a correlated anti-join can scan the 10,000 IDs per row.
    command.CommandText = seededIds.Length == 0 ? conflictsQuery : $"""
        CREATE TABLE #DirectorySeedRecoveryIds (Id nvarchar(36) COLLATE {metadata.IdCollation} NOT NULL PRIMARY KEY);
        INSERT INTO #DirectorySeedRecoveryIds (Id) SELECT Id FROM OPENJSON(@ids) WITH (Id nvarchar(36) '$');
        {conflictsQuery} AND NOT EXISTS (SELECT 1 FROM #DirectorySeedRecoveryIds ids WHERE ids.Id=d.Id);
        DROP TABLE #DirectorySeedRecoveryIds;
        """;
    AddParameter(command, "@names", JsonSerializer.Serialize(names, FinanceService.Json));
    AddParameter(command, "@user", user); AddParameter(command, "@ids", JsonSerializer.Serialize(seededIds, FinanceService.Json));
    return Convert.ToInt32(await command.ExecuteScalarAsync());
}

static async Task<System.Data.Common.DbCommand> QueryCommand(FinanceDb db)
{
    await db.Database.OpenConnectionAsync();
    var command = db.Database.GetDbConnection().CreateCommand();
    command.CommandTimeout = 120;
    command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
    return command;
}

static void AddParameter(System.Data.Common.DbCommand command, string name, string value)
{
    var parameter = command.CreateParameter(); parameter.ParameterName = name; parameter.DbType = DbType.String;
    parameter.Size = -1; parameter.Value = value; command.Parameters.Add(parameter);
}

static async Task SaveProof(string output, object value, JsonSerializerOptions json)
{
    Directory.CreateDirectory(Path.GetDirectoryName(output)!);
    await using var file = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    await JsonSerializer.SerializeAsync(file, value, json);
    await file.FlushAsync();
}

sealed record SeedPlan(int FormatVersion, string UserId, string[] Merchants, string[] Tags);
sealed record Candidate(string Kind, string Name);
sealed record BatchProof(string PlanHash, string Kind, int BatchIndex, string[] Ids);
sealed record DirectoryCounts(int Merchants, int Tags);
sealed record DirectorySqlMetadata(string Table, string KindCollation, string NameCollation, string IdCollation);
sealed class ToolException(string code) : Exception(code) { public string Code { get; } = code; }
