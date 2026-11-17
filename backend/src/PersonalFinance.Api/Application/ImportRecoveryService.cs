using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public sealed record ImportOutcome(string Id, int Index, string Status, string[] Issues);
    private sealed class ImportPreviewChanged(ImportOutcome[] outcomes, string code = "IMPORT_PREVIEW_STALE", string message = "导入条件已变化，请重新检查预览后确认") : Exception(message)
    { public ImportOutcome[] Outcomes { get; } = outcomes; public string Code { get; } = code; }
    private static ImportOutcome Outcome(ImportRow row) => new(row.Id, row.Index, row.Status,
        JsonNode.Parse(row.DataJson)?["issues"]?.Deserialize<string[]>(Json) ?? []);
    public async Task<object?> ExecuteImport(string user, string id, JsonElement body, HttpContext ctx)
    {
        try
        {
            return await Write(user, ctx, body, async () => await CommitImport(user, id, ctx.Request.Headers.IfMatch,
                body.Deserialize<ImportCommitOptions>(Json) ?? new(), ctx.Request.Headers["Idempotency-Key"].ToString(), ctx.TraceIdentifier), true);
        }
        catch (Exception error)
        {
            // Write has disposed/rolled back its transaction before this independent scope is opened.
            // If COMMIT succeeded but its acknowledgement was lost, return the durable result instead.
            try
            {
                using var scope = scopes.CreateScope();
                var recoveryDb = scope.ServiceProvider.GetRequiredService<FinanceDb>();
                var key = ctx.Request.Headers["Idempotency-Key"].ToString();
                var result = await recoveryDb.Idempotencies.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Key == key);
                if (result is not null)
                {
                    // Content conflicts must still fail; never return a result for another request.
                    var expected = AuthService.Hash(ctx.Request.Method + ctx.Request.Path + JsonSerializer.Serialize(body, Json));
                    var fingerprint = ctx.Request.Headers["X-Operation-Fingerprint"].ToString();
                    if (result.Hash == expected && (result.ClientFingerprint is null || fingerprint.Length == 0 || result.ClientFingerprint == fingerprint))
                        return JsonSerializer.Deserialize<JsonElement>(result.Response, Json);
                    throw new ApiException(409, "该幂等键已用于不同请求", "IDEMPOTENCY_CONFLICT");
                }
                var job = await recoveryDb.Imports.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id);
                if (job is not null)
                {
                    var attempt = new ImportAttempt
                    {
                        UserId = user, ImportJobId = id, OperationKey = key.Length <= 150 ? key : "",
                        TraceId = ctx.TraceIdentifier[..Math.Min(36, ctx.TraceIdentifier.Length)],
                        Code = error is ImportPreviewChanged preview ? preview.Code : error is ApiException a ? a.Code : "IMPORT_COMMIT_FAILED",
                        Message = error is ImportPreviewChanged ? error.Message : error is ApiException known ? known.Message : "本次导入未完成，请检查处理记录；重试前先查询提交结果。",
                        Total = await recoveryDb.ImportRows.CountAsync(x => x.UserId == user && x.ImportJobId == id),
                        OutcomesJson = JsonSerializer.Serialize(error is ImportPreviewChanged changed ? changed.Outcomes : [], Json)
                    };
                    recoveryDb.ImportAttempts.Add(attempt);
                    await recoveryDb.SaveChangesAsync();
                }
            }
            catch (ApiException) { throw; }
            catch { logger.LogError("Import recovery record unavailable. Trace {TraceId}", ctx.TraceIdentifier); }
            if (error is ImportPreviewChanged failure) throw new ApiException(409, error.Message, failure.Code);
            throw;
        }
    }
    public async Task<object> RecheckImport(string user, string id, string? version)
    {
        var job = await Import(user, id); Version(job, version); Require(job.State == "Preview", "只有待确认导入可以重新检查");
        Require(!await db.Set<StatementRecord>().AnyAsync(x=>x.UserId==user&&x.ImportJobId==id),"已接收的来源记录已冻结，请在对账工作台复核");
        job.Version++;
        foreach (var row in job.Rows.OrderBy(x => x.Index))
        {
            var before=row.DataJson;row.IdentityVersion = 2;
            try { await ValidateImportRow(user, job, row); }
            catch (ApiException error)
            { var node = JsonNode.Parse(row.DataJson)!.AsObject(); row.Status = "Invalid"; node["issues"] = JsonSerializer.SerializeToNode(new[] { error.Message }); row.DataJson = node.ToJsonString(); }
            RecordImportCleaning(user,job,row,"Recheck","Rule","重新核对数据有效性与重复身份",before);
        }
        return ImportDto(job);
    }
    public async Task<object> ImportAttempts(string user, string id, IQueryCollection query)
    {
        Require(await db.Imports.AnyAsync(x => x.UserId == user && x.Id == id), "导入任务不存在");
        var (page, size) = Paging(query); var q = db.ImportAttempts.AsNoTracking().Where(x => x.UserId == user && x.ImportJobId == id);
        var total = await q.CountAsync();
        var items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size)
            .Select(x => new { x.Id, x.State, x.Code, x.Message, x.Total, x.Imported, x.Skipped, x.CreatedAt, x.TraceId }).ToListAsync();
        return new { items, total, page, pageSize = size };
    }
    public async Task<object> ImportAttemptRows(string user, string id, string attemptId, IQueryCollection query)
    {
        var attempt = await db.ImportAttempts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.ImportJobId == id && x.Id == attemptId)
            ?? throw new ApiException(404, "导入处理记录不存在");
        var (page, size) = Paging(query); var rows = JsonSerializer.Deserialize<ImportOutcome[]>(attempt.OutcomesJson, Json) ?? [];
        return new { items = rows.OrderBy(x => x.Index).Skip((page - 1) * size).Take(size), total = rows.Length, page, pageSize = size };
    }
}
