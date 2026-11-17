using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiDraftBatchInput(AiDraftInput[] Items);
public sealed record AiDraftConfirmation(string Id, string Version, SaveTransaction Transaction);
public sealed record AiDraftBatchConfirmation(AiDraftConfirmation[] Items);
public sealed class AiDraftService(FinanceDb db, FinanceService finance, AiDraftValidator validator, IAiProvider provider,
    AiRequestAuditService audit, AiPrivacyService privacy, IOptions<AiOptions> options)
{
    public async Task<AiValidatedDraft> Generate(string user, AiDraftInput input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.Text) || input.Text.Length > 4000) throw new ApiException(400, "草稿输入无效", "AI_INPUT_INVALID");
        input = input with { Text = AiPrivacyText.Sanitize(input.Text) };
        var consent = await privacy.Require(user, ct);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(options.Value.TotalTimeoutSeconds));
        var context = await AiRequestContext.Create(db, user, null, timeout.Token); context = context with { ConsentVersion = consent.ConsentVersion }; provider.AttachContext(context); await audit.Begin(context, timeout.Token);
        try {
            var result = await validator.Generate(user, input, timeout.Token);
            var warnings = result.Warnings.ToList();
            if (result.AccountId != null && result.Parsed.Amount != null && result.Parsed.Date != null &&
                await IsDuplicate(db, user, new SaveTransaction(result.Parsed.Intent, result.Parsed.Amount, result.AccountId,
                    new DateTimeOffset(DateOnly.ParseExact(result.Parsed.Date, "yyyy-MM-dd").ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)), Merchant: result.Parsed.Merchant), timeout.Token))
                warnings.Add("可能重复，请对照现有交易核对；再次入账需要明确确认。");
            result = result with { Warnings = warnings.ToArray() };
            var row = new AiTransactionDraft { UserId = user, RequestId = context.RequestId, ResultJson = JsonSerializer.Serialize(result, FinanceService.Json),
                Source = input.Source, SourceHash = AuthService.Hash(input.Text) }; db.Add(row); await db.SaveChangesAsync(timeout.Token);
            await audit.Finish(context.RequestId, "Drafted", null); return result with { DraftId = row.Id, Version = row.Version.ToString() };
        } catch (OperationCanceledException) {
            await audit.Finish(context.RequestId, "Cancelled", ct.IsCancellationRequested ? "AI_CANCELLED" : "AI_TOTAL_TIMEOUT");
            if (!ct.IsCancellationRequested) throw new ApiException(504, "AI任务超过总耗时限制", "AI_TOTAL_TIMEOUT"); throw;
        } catch (ApiException e) { await audit.Finish(context.RequestId, "Failed", e.Code); throw; }
        catch { await audit.Finish(context.RequestId, "Failed", "AI_DRAFT_FAILED"); throw; }
    }
    public async Task<object> GenerateBatch(string user, AiDraftBatchInput input, CancellationToken ct)
    {
        if (input.Items == null || input.Items.Length is < 1 or > 10) throw new ApiException(400, "批量解析限1至10条", "AI_INPUT_INVALID");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct); deadline.CancelAfter(TimeSpan.FromSeconds(options.Value.TotalTimeoutSeconds));
        var rows = new List<object>();
        for (var i = 0; i < input.Items.Length; i++) {
            try { rows.Add(new { index = i, draft = await Generate(user, input.Items[i], deadline.Token), error = (string?)null }); }
            catch (ApiException e) { rows.Add(new { index = i, draft = (AiValidatedDraft?)null, error = e.Code }); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { rows.Add(new { index = i, draft = (AiValidatedDraft?)null, error = "AI_TOTAL_TIMEOUT" }); break; }
        }
        return new { items = rows, total = input.Items.Length, unprocessed = input.Items.Length - rows.Count, posted = false };
    }
    public async Task<object> List(string user, int page, CancellationToken ct)
    {
        if (page is < 1 or > 10000) throw new ApiException(400, "分页参数无效", "AI_INPUT_INVALID");
        var q = db.Set<AiTransactionDraft>().AsNoTracking().Where(x => x.UserId == user && x.State == "Draft");
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20).ToArrayAsync(ct);
        return new { items = rows.Select(x => JsonSerializer.Deserialize<AiValidatedDraft>(x.ResultJson, FinanceService.Json)! with { DraftId = x.Id, Version = x.Version.ToString() }),
            total = await q.CountAsync(ct), page, pageSize = 20 };
    }
    public async Task<object?> ConfirmBatch(HttpContext c, AiDraftBatchConfirmation b) => await finance.Write(FinanceEndpoints.User(c), c, b, async () => {
        if (b.Items == null || b.Items.Length is < 1 or > 10 || b.Items.Select(x => x.Id).Distinct().Count() != b.Items.Length)
            throw new ApiException(400, "请选择1至10条不同草稿", "AI_INPUT_INVALID");
        var ids = new List<string>();
        foreach (var item in b.Items) {
            var transaction = item.Transaction with { AiDraftId = item.Id, AiDraftVersion = item.Version, Origin = "AiConfirmed" };
            var row = await Prepare(db, FinanceEndpoints.User(c), transaction, c.RequestAborted);
            var result = await finance.SaveTransaction(FinanceEndpoints.User(c), transaction);
            var id = JsonSerializer.SerializeToElement(result, FinanceService.Json).GetProperty("id").GetString()!;
            row.State = "Confirmed"; row.TransactionId = id; row.Version++; ids.Add(id);
        }
        c.Items["FinanceSource"] = "AiConfirmed"; return new { transactionIds = ids, confirmed = ids.Count };
    }, true);
    public static async Task<AiTransactionDraft> Prepare(FinanceDb db, string user, SaveTransaction input, CancellationToken ct)
    {
        var row = await db.Set<AiTransactionDraft>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == input.AiDraftId, ct)
            ?? throw new ApiException(404, "草稿不存在", "AI_DRAFT_NOT_FOUND");
        FinanceService.Version(row, input.AiDraftVersion);
        if (row.State != "Draft" || input.Type is not ("Expense" or "Income") || input.Origin != "AiConfirmed")
            throw new ApiException(409, "草稿已处理或交易类型不支持", "AI_DRAFT_CONFLICT");
        var result = JsonSerializer.Deserialize<AiValidatedDraft>(row.ResultJson, FinanceService.Json)!;
        if (result.RequiresSpecialWorkflow || result.Parsed.AmountAmbiguous || !result.CanOpenEntry)
            throw new ApiException(422, "草稿仍需消除歧义或进入专项流程", "AI_DRAFT_REVIEW_REQUIRED");
        var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == input.AccountId, ct);
        if (account == null || account.Currency != result.Parsed.Currency) throw new ApiException(422, "草稿账户或币种不一致", "AI_DRAFT_ACCOUNT_INVALID");
        if (!input.AiDuplicateAcknowledged && await IsDuplicate(db, user, input, ct))
            throw new ApiException(409, "可能重复，请核对并明确确认再次入账", "AI_DUPLICATE_CONFIRMATION_REQUIRED");
        return row;
    }
    public static async Task<bool> IsDuplicate(FinanceDb db, string user, SaveTransaction input, CancellationToken ct)
    {
        var local = input.OccurredAt.ToOffset(TimeSpan.FromHours(8)); var start = new DateTimeOffset(local.Date, TimeSpan.FromHours(8)); var end = start.AddDays(1);
        var amount = FinanceService.Money(input.Amount);
        return await db.Transactions.AnyAsync(x => x.UserId == user && x.Status != "Deleted" && x.Type == input.Type && x.AccountId == input.AccountId && x.Amount == amount &&
            x.OccurredAt >= start && x.OccurredAt < end && (x.Merchant == input.Merchant || input.Merchant == null), ct);
    }
}
