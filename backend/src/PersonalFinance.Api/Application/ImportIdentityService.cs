using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public static string? ImportIdentityKey(string account, string source, string? external)
        => string.IsNullOrWhiteSpace(external) ? null : AuthService.Hash("v2|" + account + "|" + source + "|" + external.Trim());

    // Classification, merchant spelling and notes do not change the original financial identity.
    public static string ImportCoreSignature(JsonNode node)
    {
        string Text(string field) => node[field]?.GetValue<string>() ?? "";
        string Normalized(string field, string fallback) => decimal.TryParse(Text(field), NumberStyles.Number, CultureInfo.InvariantCulture, out var value) ? value.ToString("0.########", CultureInfo.InvariantCulture) : fallback;
        var amount = decimal.Parse(Text("amount"), CultureInfo.InvariantCulture).ToString("0.0000", CultureInfo.InvariantCulture);
        var instant = DateTimeOffset.Parse(Text("occurredAt"), CultureInfo.InvariantCulture).UtcTicks.ToString(CultureInfo.InvariantCulture);
        return AuthService.Hash(JsonSerializer.Serialize(new[] { Text("accountId"), Text("currency"), Text("type"), amount, instant, Text("toAccountId"), decimal.Parse(string.IsNullOrEmpty(Text("fee")) ? "0" : Text("fee"), CultureInfo.InvariantCulture).ToString("0.0000", CultureInfo.InvariantCulture), Normalized("receivedAmount", decimal.Parse(amount, CultureInfo.InvariantCulture).ToString("0.########", CultureInfo.InvariantCulture)), Normalized("exchangeRate", "1") }));
    }
    private sealed record ImportCandidate(string Kind, string Id, int? Index, string Signature);
    private sealed record ImportCandidateQuery(string User, string JobId, string Account, string Currency, string Type, decimal Amount, long UtcTicks, string Merchant, bool HasExternal, string? Target, decimal Fee);
    // Request-scoped only. Import validation runs under the existing user write lock,
    // before any transactions are created; manual row candidates are still rebuilt below.
    private readonly Dictionary<ImportCandidateQuery, (int Count, ImportCandidate[] Candidates)> importCandidateCache = [];
    private readonly Dictionary<string,string[]> importMerchantNames = [];
    private async Task ClassifyImportIdentity(string user, ImportJob job, ImportRow row, JsonObject node, List<string> issues)
    {
        // Keep legacy imported fingerprints untouched. V2 uses an instance fingerprint, with a separate strong unique key.
        row.Fingerprint = AuthService.Hash("import-v2-row:" + row.Id);
        row.IdentityKey = ImportIdentityKey(node["accountId"]?.GetValue<string>() ?? job.AccountId!, job.Source, node["externalId"]?.GetValue<string>());
        node["duplicateKind"] = "None"; node["duplicateCandidates"] = new JsonArray(); node["candidateCount"] = 0;
        row.Status = "Ready";
        if (issues.Count == 0)
        {
            ImportRow? exact = null;
            if (row.IdentityKey is not null)
            {
                exact = await db.ImportRows.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.IdentityKey == row.IdentityKey && x.Status == "Imported");
                exact ??= job.Rows.OrderBy(x => x.Index).FirstOrDefault(x => x.Index < row.Index && x.IdentityKey == row.IdentityKey && x.Status is "Ready" or "Duplicate" or "Suspected");
            }
            if (exact is not null)
            {
                var matches = ImportCoreSignature(node) == ImportCoreSignature(JsonNode.Parse(exact.DataJson)!);
                node["duplicateKind"] = matches ? "Deterministic" : "Conflict";
                row.Status = matches ? "Duplicate" : "Invalid";
                issues.Add(matches ? "同一来源、账户与流水号已存在，本行不会重复入账" : "流水号身份相同，但金额、时间、币种、类型或转入账户冲突；请核对原始账单");
                ClearImportDecision(row);
            }
            else
            {
                var occurred = DateTimeOffset.Parse(node["occurredAt"]!.GetValue<string>(), CultureInfo.InvariantCulture);
                var start = occurred.AddMinutes(-5); var end = occurred.AddMinutes(5);
                var amount = decimal.Parse(node["amount"]!.GetValue<string>(), CultureInfo.InvariantCulture);
                var type = node["type"]!.GetValue<string>(); var currency = node["currency"]!.GetValue<string>();
                var accountId = node["accountId"]!.GetValue<string>(); var toAccountId = node["toAccountId"]?.GetValue<string>(); var fee = Money(node["fee"]?.GetValue<string>() ?? "0");
                var merchant = (node["merchant"]?.GetValue<string>() ?? "").Trim();
                var names=new[]{merchant};
                if(node["merchantId"]?.GetValue<string>() is {} masterId){
                    var cacheId=user+":"+masterId;
                    if(!importMerchantNames.TryGetValue(cacheId,out var known)){
                        known=(await db.Set<MerchantAlias>().AsNoTracking().Where(x=>x.UserId==user && x.MerchantId==masterId).Select(x=>x.Name).ToArrayAsync()).Append(merchant).Distinct().ToArray();importMerchantNames[cacheId]=known;
                    }
                    names=known;
                }
                var external = node["externalId"]?.GetValue<string>() ?? "";
                // Distinct IDs within one known source are distinct records. Across sources or without IDs, ask the user.
                var query = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Status != "Deleted" && t.AccountId == accountId && t.ToAccountId == toAccountId && t.Fee == fee && t.Currency == currency && t.Type == type && t.Amount == amount && t.OccurredAt >= start && t.OccurredAt <= end && names.Contains((t.Merchant ?? "").Trim()) &&
                    (external == "" || t.ExternalId == null || t.ExternalId == "" || !db.Imports.Any(j => j.Id == t.ImportJobId && j.UserId == user && j.Source == job.Source)));
                var cacheKey = new ImportCandidateQuery(user, job.Id, accountId, currency, type, amount, occurred.UtcTicks, merchant, external.Length > 0, toAccountId, fee);
                if (!importCandidateCache.TryGetValue(cacheKey, out var cached))
                {
                    var transactions = await query.OrderBy(t => t.Id).Take(20).Select(t => new { t.Id, t.Version }).ToArrayAsync();
                    cached = (await query.CountAsync(), transactions.Select(t => new ImportCandidate("Transaction", t.Id, null, t.Version.ToString(CultureInfo.InvariantCulture))).ToArray());
                    importCandidateCache.Add(cacheKey, cached);
                }
                var count = cached.Count;
                var candidates = cached.Candidates.ToList();
                // Distinct known IDs in the same batch cannot be suspected duplicates.
                // Legacy rows without IdentityKey still go through the existing JSON check.
                var prior = job.Rows.Where(r => r.Index < row.Index && r.Status is "Ready" or "Suspected")
                .Where(r => external.Length == 0 || r.IdentityKey is null).Where(r =>
                {
                    var previous = JsonNode.Parse(r.DataJson)!;
                    if (external.Length > 0 && !string.IsNullOrEmpty(previous["externalId"]?.GetValue<string>())) return false;
                    return previous["accountId"]?.GetValue<string>() == accountId && previous["toAccountId"]?.GetValue<string>() == toAccountId && Money(previous["fee"]?.GetValue<string>() ?? "0") == fee && previous["type"]?.GetValue<string>() == type && previous["currency"]?.GetValue<string>() == currency &&
                        decimal.Parse(previous["amount"]!.GetValue<string>(), CultureInfo.InvariantCulture) == amount &&
                        Math.Abs((DateTimeOffset.Parse(previous["occurredAt"]!.GetValue<string>(), CultureInfo.InvariantCulture) - occurred).TotalMinutes) <= 5 &&
                        string.Equals((previous["merchant"]?.GetValue<string>() ?? "").Trim(), merchant, StringComparison.OrdinalIgnoreCase);
                }).OrderBy(r => r.Index).ToArray();
                count += prior.Length;
                candidates.AddRange(prior.Take(20).Select(r => new ImportCandidate("Row", r.Id, r.Index, ImportCoreSignature(JsonNode.Parse(r.DataJson)!))));
                candidates = candidates.OrderBy(c => c.Kind).ThenBy(c => c.Id, StringComparer.Ordinal).Take(20).ToList();
                node["candidateCount"] = count;
                node["duplicateCandidates"] = JsonSerializer.SerializeToNode(candidates.Select(c => new { c.Kind, c.Id, c.Index }), Json);
                if (count > 0)
                {
                    node["duplicateKind"] = "Suspected";
                    var signature = AuthService.Hash(ImportCoreSignature(node) + "|" + count + "|" + JsonSerializer.Serialize(candidates));
                    if (row.ReviewSignature != signature) ClearImportDecision(row);
                    row.Status = row.ReviewDecision switch { "Keep" => "Ready", "Skip" => "Skipped", _ => "Suspected" };
                    node["reviewSignature"] = signature;
                    issues.Add("同账户、币种、类型、金额及商户在前后5分钟内存在相似记录，请人工核对");
                }
                else { ClearImportDecision(row); node.Remove("reviewSignature"); }
            }
        }
        else row.Status = "Invalid";
        node["status"] = row.Status; node["issues"] = JsonSerializer.SerializeToNode(issues.Distinct()); row.DataJson = node.ToJsonString();
    }
    private static void ClearImportDecision(ImportRow row)
    { row.ReviewDecision = null; row.ReviewSignature = null; row.ReviewedAt = null; }

    public async Task<object> ReviewImportDuplicate(string user, string id, string rowId, string decision, string? version)
    {
        var job = await Import(user, id); Version(job, version); Require(job.State == "Preview", "只有待确认导入可以处理疑似重复");
        Require(decision is "Keep" or "Skip" or "Clear", "请选择保留、跳过或撤销判定");
        var row = job.Rows.SingleOrDefault(r => r.Id == rowId) ?? throw new Contracts.ApiException(404, "导入行不存在");
        var beforeReview=row.DataJson;
        Require(row.IdentityVersion == 2, "请先重新检查旧预览");
        var previewSignature = JsonNode.Parse(row.DataJson)?["reviewSignature"]?.GetValue<string>();
        if (decision == "Clear") ClearImportDecision(row);
        await ValidateImportRow(user, job, row);
        var node = JsonNode.Parse(row.DataJson)!;
        if (previewSignature != node["reviewSignature"]?.GetValue<string>()) throw new Contracts.ApiException(409, "相似记录已变化，请重新检查预览后判定", "IMPORT_PREVIEW_STALE");
        Require(node["duplicateKind"]?.GetValue<string>() == "Suspected", "当前行没有可人工覆盖的疑似重复；确定性重复和身份冲突不能强制导入");
        if (decision != "Clear")
        {
            row.ReviewDecision = decision; row.ReviewSignature = node["reviewSignature"]!.GetValue<string>(); row.ReviewedAt = DateTimeOffset.UtcNow;
            row.Status = decision == "Keep" ? "Ready" : "Skipped";
        }
        node["reviewDecision"]=row.ReviewDecision;node["status"]=row.Status;row.DataJson=node.ToJsonString();
        row.Version++; job.Version++;RecordImportCleaning(user,job,row,"DuplicateReview","User","人工判定疑似重复："+decision,beforeReview); return ImportDto(job);
    }
}
