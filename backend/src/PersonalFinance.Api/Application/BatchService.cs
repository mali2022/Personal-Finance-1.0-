using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public static string? BatchProtection(FinanceTransaction t, BatchChanges c, bool refunded, bool reconciled)
    {
        if (c.AccountId != null && (t.Type is not ("Expense" or "Income") || t.PromotionJson != null || t.Entries.Count(e => e.Kind == "Account") != 1)) return "仅无优惠的单账户普通收支允许批量更换账户";
        if (c.Status != null && c.Status is not ("Confirmed" or "NeedsReview")) return "批量状态无效";
        if (t.Status == "Deleted") return "已删除交易不可编辑";
        if (t.BusinessId != null || t.Type is not ("Expense" or "Income" or "Transfer" or "CreditCardPayment" or "AssetLoss" or "Refund" or "Adjustment")) return "借贷及报销专项交易须从业务详情处理";
        if (reconciled || t.Type == "Adjustment") return "对账关联及调整交易受保护";
        if (t.Type == "Refund" || refunded) return "退款及存在有效退款的原交易受保护";
        if (c.CategoryId != null && (t.Type is not ("Expense" or "Income") || t.Entries.Count(e => e.Kind == t.Type) != 1)) return "仅普通未拆分收支允许批量修改分类";
        if (c.SetNote && t.Type == "AssetLoss" && string.IsNullOrWhiteSpace(c.Note)) return "资产损失原因不可清空";
        return null;
    }
    private async Task<(List<FinanceTransaction> Transactions, object Preview, int Rejected)> BuildBatch(string user, TransactionBatch b)
    {
        if (b.Items == null || b.Changes == null) throw new ApiException(422, "批量请求不完整");
        Require(b.Items.Length is > 0 and <= 100, "每批须选择1至100笔交易");
        Require(b.Items.All(x => x != null && !string.IsNullOrWhiteSpace(x.Id) && !string.IsNullOrWhiteSpace(x.Version)) && b.Items.Select(x => x.Id).Distinct().Count() == b.Items.Length, "选择无效或包含重复交易");
        var c = b.Changes;
        if(c.SetMerchant && !string.IsNullOrWhiteSpace(c.Merchant))c=c with{Merchant=(await ResolveMerchant(user,c.Merchant))?.Name??c.Merchant.Trim()};
        Require(c.AccountId != null || c.Status != null || c.CategoryId != null || c.SetMerchant || c.SetNote || c.SetProject || (c.AddTagIds?.Length ?? 0) + (c.RemoveTagIds?.Length ?? 0) > 0, "请选择至少一项修改");
        Require((c.Merchant?.Length ?? 0) <= 200 && (c.Note?.Length ?? 0) <= 2000, "商户或备注过长");
        var add = c.AddTagIds ?? []; var remove = c.RemoveTagIds ?? [];
        Require(add.Length <= 30 && remove.Length <= 30 && !add.Intersect(remove).Any(), "标签数量超限或同时添加和移除同一标签");
        DirectoryItem? targetProject = null;
        if (c.SetProject && c.ProjectId != null) { targetProject = await db.Directory.SingleOrDefaultAsync(x => x.UserId == user && x.Id == c.ProjectId && x.Kind == "projects" && x.Status == "Active"); Require(targetProject != null, "项目无效或已停用"); }
        foreach (var tag in add.Distinct()) Require(await db.Directory.AnyAsync(x => x.UserId == user && x.Id == tag && x.Kind == "tags" && x.Status == "Active"), "新增标签无效或已停用");
        foreach (var tag in remove.Distinct()) Require(await db.Directory.AnyAsync(x => x.UserId == user && x.Id == tag && x.Kind == "tags"), "移除标签不存在");
        Account? targetAccount = c.AccountId == null ? null : await Account(user, c.AccountId);
        if(targetAccount != null) Require(!new[]{"Receivable","Payable","ConsumerLoan","SecuredLoan"}.Contains(targetAccount.Type) && !await db.Set<PrepaymentContract>().AnyAsync(x=>x.UserId==user && x.AssetAccountId==targetAccount.Id), "不能使用业务专用账户");
        Category? category = c.CategoryId == null ? null : await Category(user, c.CategoryId);
        var ids = b.Items.Select(x => x.Id).ToArray();
        var rows = await db.Transactions.Include(x => x.Entries).Include(x => x.Tags).AsSplitQuery().Where(x => x.UserId == user && ids.Contains(x.Id)).ToListAsync();
        var refunded = await db.Transactions.Where(x => x.UserId == user && x.Status != "Deleted" && ids.Contains(x.OriginalTransactionId!)).Select(x => x.OriginalTransactionId!).ToArrayAsync();
        var reconciled = await db.Reconciliations.Where(x => x.UserId == user && ids.Contains(x.TransactionId!)).Select(x => x.TransactionId!).Union(db.Set<TransactionStatementMatch>().Where(x => x.UserId == user && x.State != "Revoked" && ids.Contains(x.TransactionId)).Select(x => x.TransactionId)).ToArrayAsync();
        var protectedAssets = await db.Set<InvestmentTrade>().Where(x => x.UserId == user && ids.Contains(x.TransactionId!)).Select(x => x.TransactionId!).ToArrayAsync(); var protectedDeposits = await db.Set<ManagedAsset>().Where(x => x.UserId == user).Select(x => new { x.FundingTransactionId, x.SettlementTransactionId, x.InterestTransactionId }).ToArrayAsync();
        var outcomes = new List<object>(); var rejected = 0;
        foreach (var item in b.Items)
        {
            var t = rows.SingleOrDefault(x => x.Id == item.Id);
            var reason = t == null ? "交易不存在或不可访问" : item.Version != t.Version.ToString() ? "版本冲突，请刷新并重新选择" : BatchProtection(t, c, refunded.Contains(t.Id), reconciled.Contains(t.Id));
            if (reason == null) { try { await ProtectSharedTransaction(user, item.Id); } catch (ApiException error) { reason = error.Message; } }
            if (protectedAssets.Contains(item.Id) || protectedDeposits.Any(x => x.FundingTransactionId == item.Id || x.SettlementTransactionId == item.Id || x.InterestTransactionId == item.Id)) reason = "投资或存款关联流水受保护";
            if(reason==null && c.AccountId!=null) {
                try { await ProtectStageGTransaction(user,item.Id); }
                catch(ApiException error) {reason=error.Message;}
                if(await db.Set<AuthorizedPayment>().AnyAsync(x=>x.UserId==user&&x.TransactionId==item.Id) || await db.Set<CashbackReceivable>().AnyAsync(x=>x.UserId==user&&(x.TransactionId==item.Id||x.SettlementTransactionId==item.Id)) || await db.Set<CashbackRecovery>().AnyAsync(x=>x.UserId==user&&x.TransactionId==item.Id) || await db.Set<PromotionTransferDraft>().AnyAsync(x=>x.UserId==user&&(x.TransferTransactionId==item.Id||x.SubsidyTransactionId==item.Id)))reason="关联业务资金账户受保护";
            }
            if (reason == null && targetAccount != null && targetAccount.Currency != t!.Currency) reason = "账户与交易币种不同";
            if (reason == null && c.AccountId != null && await db.Set<PrepaymentContract>().AnyAsync(x=>x.UserId==user && x.AssetAccountId==t!.AccountId)) reason = "预付款专用账户交易受保护";
            if (reason == null && category != null && category.Kind != t!.Type) reason = "分类收支类型不匹配";
            if (reason == null && targetProject != null && targetProject.Currency != t!.Currency) reason = "项目与交易币种不同";
            if (reason == null && t!.Tags.Select(x => x.DirectoryId).Except(remove).Union(add).Count() > 30) reason = "修改后的标签不得超过30个";
            if (reason != null) rejected++;
            object? before = t == null ? null : new { t.AccountId, t.Status, t.CategoryId, t.Merchant, t.ProjectId, t.Note, tagIds = t.Tags.Select(x => x.DirectoryId).Order().ToArray() };
            object? after = reason != null ? null : new { accountId = c.AccountId ?? t!.AccountId, status = c.Status ?? t!.Status, categoryId = c.CategoryId ?? t!.CategoryId, merchant = c.SetMerchant ? c.Merchant : t!.Merchant, projectId = c.SetProject ? c.ProjectId : t!.ProjectId, note = c.SetNote ? c.Note ?? "" : t!.Note, tagIds = t!.Tags.Select(x => x.DirectoryId).Except(remove).Union(add).Order().ToArray() };
            outcomes.Add(new { item.Id, requestedVersion = item.Version, version = t?.Version.ToString(), nextVersion = reason == null ? (t!.Version + 1).ToString() : null, allowed = reason == null, reason, before, after });
        }
        var preview = new { targetVersions = new { category = category == null ? null : new { category.Id, version = category.Version.ToString() } }, selected = b.Items.Length, allowed = b.Items.Length - rejected, rejected, items = outcomes, affected = new { months = rows.Select(x => x.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM")).Distinct().Order().ToArray(), currencies = rows.Select(x => x.Currency).Distinct().ToArray(), accountIds = rows.SelectMany(x => x.Entries.Where(e => e.AccountId != null).Select(e => e.AccountId)).Distinct().ToArray(), categoryIds = rows.SelectMany(x => x.Entries.Where(e => e.CategoryId != null).Select(e => e.CategoryId)).Append(c.CategoryId).Where(x => x != null).Distinct().ToArray(), projectIds = rows.Select(x => x.ProjectId).Append(c.ProjectId).Where(x => x != null).Distinct().ToArray(), reports = new[] { "budgets", "reports", "dashboard", "project-analysis" } } };
        return (rows, preview, rejected);
    }
    public async Task<object> BatchPreview(string user, TransactionBatch b) => (await BuildBatch(user, b)).Preview;
    public async Task<IResult> BatchExecute(HttpContext ctx, TransactionBatch b)
    {
        var user = FinanceEndpoints.User(ctx);
        var batchId = Guid.NewGuid().ToString();
        try { return FinanceEndpoints.Ok(ctx, await Write(user, ctx, b, async () => await BatchApply(user, b, batchId), true)); }
        catch (Exception error)
        {
            var status = error is ApiException api ? api.Status : error is DbUpdateConcurrencyException ? 409 : 500;
            var code = error is ApiException known ? known.Code : status == 409 ? "VERSION_CONFLICT" : "SERVER_ERROR";
            var message = error is ApiException expected ? expected.Message : status == 409 ? "数据已更新，请重新预览" : "批量执行失败，交易修改已回滚";
            var result = new { batchId, state = "Failed", count = 0, code, message };
            var resultSaved = false;
            object? recovered = null;
            // The financial transaction has already rolled back. Persist only the attempt result
            // through a fresh context so failed tracked ledger changes can never be retried here.
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var freshDb = scope.ServiceProvider.GetRequiredService<PersonalFinance.Api.Infrastructure.FinanceDb>();
                var fresh = scope.ServiceProvider.GetRequiredService<FinanceService>();
                await fresh.Write(user, ctx, new { batchId, code }, async () => {
                    // A transport failure around COMMIT can mean the transaction did commit.
                    // Recheck its atomic idempotency record under the user lock before recording failure.
                    if (status == 500)
                    {
                        var key = ctx.Request.Headers["Idempotency-Key"].ToString();
                        var saved = await freshDb.Idempotencies.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Key == key);
                        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(ctx.Request.Method + ctx.Request.Path + System.Text.Json.JsonSerializer.Serialize(b, Json))));
                        if (saved?.Hash == hash) { recovered = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(saved.Response, Json); return recovered; }
                    }
                    freshDb.Add(new TransactionBatchRecord { Id = batchId, UserId = user, State = "Failed", ResultJson = System.Text.Json.JsonSerializer.Serialize(result, Json) });
                    return result;
                });
                resultSaved = true;
            }
            catch (Exception recordError) { logger.LogError(recordError, "Failed to persist batch attempt {BatchId}", batchId); }
            if (recovered != null) return FinanceEndpoints.Ok(ctx, recovered);
            if (status == 500 && !resultSaved) message = "执行结果暂时无法核实，请通过待核实提交查询原请求结果";
            if (status == 500) logger.LogError(error, "Batch execution failed {BatchId}", batchId);
            return Results.Json(new { message, code, batchId, resultSaved, details = new Dictionary<string, string[]> { ["batchId"] = [batchId], ["resultSaved"] = [resultSaved.ToString()] }, traceId = ctx.TraceIdentifier }, statusCode: status);
        }
    }
    public async Task<object> BatchApply(string user, TransactionBatch b, string batchId)
    {
        var (rows, preview, rejected) = await BuildBatch(user, b);
        if (rejected != 0) throw new ApiException(409, "批量校验失败，整批未执行；请重新预览查看拒绝原因", "BATCH_REJECTED");
        var c = b.Changes;
        if(c.SetMerchant && !string.IsNullOrWhiteSpace(c.Merchant))c=c with{Merchant=(await ResolveMerchant(user,c.Merchant))?.Name??c.Merchant.Trim()};
        if (c.AccountId != null)
        {
            var accountIds = rows.Select(t => t.AccountId).Append(c.AccountId).Distinct().ToArray();
            foreach (var account in await db.Accounts.Where(a => a.UserId == user && accountIds.Contains(a.Id)).ToListAsync()) account.Version++;
        }
        foreach (var t in rows)
        {
            if (c.AccountId != null)
            {
                var previousAccount = t.AccountId;
                t.AccountId = c.AccountId;
                foreach (var entry in t.Entries.Where(e => e.AccountId == previousAccount)) { entry.AccountId = c.AccountId; entry.Version++; }
            }
            if (c.Status != null) t.Status = c.Status;
            if (c.CategoryId != null) { t.CategoryId = c.CategoryId; var entry = t.Entries.Single(x => x.Kind == t.Type); entry.CategoryId = c.CategoryId; entry.Version++; }
            if (c.SetMerchant) t.Merchant = c.Merchant;
            if (c.SetProject) t.ProjectId = c.ProjectId;
            if (c.SetNote) t.Note = c.Note ?? "";
            foreach (var tag in t.Tags.Where(x => (c.RemoveTagIds ?? []).Contains(x.DirectoryId)).ToArray()) { db.Remove(tag); t.Tags.Remove(tag); }
            foreach (var tag in (c.AddTagIds ?? []).Distinct().Where(id => !t.Tags.Any(x => x.DirectoryId == id))) t.Tags.Add(new TransactionTag { TransactionId = t.Id, DirectoryId = tag });
            t.Version++; t.UpdatedAt = DateTimeOffset.UtcNow;
        }
        var record = new TransactionBatchRecord { Id = batchId, UserId = user };
        var result = new { batchId = record.Id, state = "Completed", count = rows.Count, preview, versions = rows.Select(x => new { x.Id, version = x.Version.ToString() }) };
        record.ResultJson = System.Text.Json.JsonSerializer.Serialize(result, Json); db.Add(record);
        return result;
    }
    public async Task<object> BatchResult(string user, string id) => System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>((await db.Set<TransactionBatchRecord>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "批量操作不存在")).ResultJson, Json);
    private static string[] ReviewReasons(FinanceTransaction t) => new[] { t.Status == "NeedsReview" ? "原有待整理标记" : null, t.Type == "Expense" && t.CategoryId == null ? "支出分类缺失" : null }.Where(x => x != null).Cast<string>().ToArray();
    public async Task<object> ReviewDetail(string user, string id)
    {
        var t = await Transaction(user, id); var detected = new List<string>(ReviewReasons(t)); foreach(var rule in AnomalyRules) if(await AnomalyQuery(user, rule).AnyAsync(x => x.Id == id)) detected.Add(rule); var issue = await db.Set<TransactionReview>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.TransactionId == id);
        var history = issue == null ? [] : await db.AuditRecords.AsNoTracking().Where(x => x.UserId == user && x.ResourceType == nameof(TransactionReview) && x.ResourceId == issue.Id).OrderByDescending(x => x.CreatedAt).Take(100).ToArrayAsync();
        return new { transactionId = id, reasons = detected.ToArray(), state = issue?.State ?? "Open", version = issue?.Version.ToString() ?? "0", issue?.DeferredUntil, issue?.Note, history = history.Select(x => new { x.CreatedAt, x.Action, x.OperationKey, changes = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(x.ChangesJson, Json) }) };
    }
    public async Task<object> ReviewUpdate(string user, string id, ReviewAction b, string? version)
    {
        var t = await Transaction(user, id); Require(t.Status != "Deleted", "已删除交易不能处理问题");
        Require(b.State is "Open" or "Resolved" or "Ignored" or "Deferred", "处理状态无效"); Require(b.Note != null && b.Note.Trim().Length is > 0 and <= 2000, "请填写处理说明，最多2000字");
        Require(b.State != "Deferred" || b.DeferredUntil > DateTimeOffset.UtcNow, "延后时间须在未来");
        var issue = await db.Set<TransactionReview>().SingleOrDefaultAsync(x => x.UserId == user && x.TransactionId == id);
        if (issue == null) { Require(ReviewReasons(t).Length > 0 || await AnomalyIds(user, "Any").AnyAsync(x => x == id), "交易没有待整理问题"); if (version != "0") throw new ApiException(409, "问题状态已更新", "VERSION_CONFLICT"); issue = new TransactionReview { UserId = user, TransactionId = id }; db.Add(issue); }
        else { Version(issue, version); issue.Version++; }
        issue.State = b.State; issue.Note = b.Note!.Trim(); issue.DeferredUntil = b.State == "Deferred" ? b.DeferredUntil : null; issue.UpdatedAt = DateTimeOffset.UtcNow;
        return new { state = issue.State, version = issue.Version.ToString() };
    }
}



