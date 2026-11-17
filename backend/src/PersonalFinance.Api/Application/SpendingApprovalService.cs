using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;

namespace PersonalFinance.Api.Application;

public sealed record ApprovalApplication(string Name, decimal Amount, string Currency, string Reason,
    string? CategoryId = null, string? AccountId = null, string? ProductUrl = null,
    bool? Essential = null, bool? ExistingItemUsable = null, int? WeeklyUses = null, int? Years = null);
public sealed record ApprovalEvent(DateTimeOffset At, string Actor, string Action, string Reason);
public sealed record ApprovalReview(int Satisfaction, int ActualUses, string Notes, DateTimeOffset At);
public sealed record ApprovalRecord(ApprovalApplication Application, string State, ApprovalEvent[] History,
    DateTimeOffset? CoolingUntil = null, string? Decision = null, string? TransactionId = null,
    ApprovalReview? Review = null, decimal? AllocatedAmount = null);
public sealed record ApprovalAction(string Action, string Reason = "", int? Hours = null, string? TransactionId = null,
    int? Satisfaction = null, int? ActualUses = null, decimal? AllocatedAmount = null);

public sealed partial class FinanceService
{
    const string ApprovalKind = "SpendingApproval";
    public async Task<object> ApprovalList(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query);
        var q = db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == ApprovalKind);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(ApprovalDto), total = await q.CountAsync(), page, pageSize = size };
    }
    static ApprovalRecord ApprovalRead(StoredDocument d) => JsonSerializer.Deserialize<ApprovalRecord>(d.Content, Json)!;
    static object ApprovalDto(StoredDocument d) => new { d.Id, version = d.Version.ToString(), content = ApprovalRead(d), d.CreatedAt };
    public async Task<object> ApprovalDetail(string user, string id)
    {
        var d = await Document(user, id, ApprovalKind); var record = ApprovalRead(d);
        var transaction = record.TransactionId == null ? null : await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == user && t.Id == record.TransactionId && t.Status == "Confirmed" && t.Type == "Expense" && t.Currency == record.Application.Currency)
            .Select(t => new { t.Id, t.Amount, t.OccurredAt }).SingleOrDefaultAsync();
        var refunded = transaction == null ? 0 : await db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.OriginalTransactionId == transaction.Id && t.Type == "Refund" && t.Status == "Confirmed" && t.Currency == record.Application.Currency).SumAsync(t => (decimal?)t.Amount) ?? 0;
        var allocated = record.AllocatedAmount ?? transaction?.Amount;
        var allocationValid = transaction != null && allocated <= transaction.Amount;
        if (transaction != null)
        {
            var receiptLinks = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == ApprovalKind && x.TransactionId == transaction.Id).ToArrayAsync();
            allocationValid = allocationValid && receiptLinks.Sum(x => ApprovalRead(x).AllocatedAmount ?? transaction.Amount) <= transaction.Amount;
        }
        var refundAmbiguous = allocationValid && refunded > 0 && refunded < transaction!.Amount && allocated < transaction.Amount;
        return new { document = ApprovalDto(d), transaction, refunded, allocatedAmount = allocated, allocationValid,
            netActualCost = !allocationValid || refunded > transaction!.Amount || refundAmbiguous ? (decimal?)null : refunded == transaction.Amount ? 0 : allocated - refunded,
            netCostLower = !allocationValid ? (decimal?)null : Math.Max(0, allocated!.Value - refunded), netCostUpper = !allocationValid ? (decimal?)null : Math.Min(allocated!.Value, Math.Max(0, transaction!.Amount - refunded)), refundAllocationUnresolved = refundAmbiguous,
            refundState = transaction == null ? "UNVERIFIED" : refunded > transaction.Amount ? "INCONSISTENT" : refunded == 0 ? "NONE" : refunded == transaction.Amount ? "FULL" : "PARTIAL", purchaseVerified = allocationValid && refunded <= transaction!.Amount,
            coolingExpired = record.CoolingUntil <= DateTimeOffset.UtcNow,
            linkedTransactionMissing = record.TransactionId != null && transaction == null };
    }
    public async Task<object> ApprovalSave(string user, string? id, ApprovalApplication b, string? version)
    {
        Require(!string.IsNullOrWhiteSpace(b.Name) && b.Name.Length <= 100 && b.Reason.Length <= 4000,
            "请输入商品名称和有效购买理由");
        Require(CurrencyDefinitions.Supports(b.Currency) && b.Amount > 0 && b.Amount <= 1_000_000_000_000m && decimal.Round(b.Amount, 2) == b.Amount, "金额或币种无效");
        Require(b.WeeklyUses is null or > 0 and <= 1000 && b.Years is null or > 0 and <= 100, "使用频率或年限无效");
        Require(b.ProductUrl == null || b.ProductUrl.Length <= 2000 && Uri.TryCreate(b.ProductUrl, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https", "商品链接无效");
        if (b.AccountId != null) { var account = await Account(user, b.AccountId); Require(account.Currency == b.Currency, "支付账户币种不符"); }
        if (b.CategoryId != null) await Category(user, b.CategoryId);
        var d = id == null ? new StoredDocument { UserId = user, Kind = ApprovalKind, ContentType = "application/json" } : await Document(user, id, ApprovalKind);
        ApprovalRecord record;
        if (id == null) { Require(version == "0", "新申请版本应为0"); db.Documents.Add(d); record = new(b, "DRAFT", []); }
        else { Version(d, version); record = ApprovalRead(d); Require(record.State is "DRAFT" or "SUBMITTED" or "NEEDS_INFORMATION" or "EVALUATED" or "COOLING_DOWN", "当前状态不能编辑"); d.Version++; record = record with { Application = b, State = "DRAFT", CoolingUntil = null }; }
        record = record with { History = [.. record.History, new(DateTimeOffset.UtcNow, user, id == null ? "CREATE" : "REVISE", "")] };
        d.Name = b.Name; d.Content = JsonSerializer.SerializeToUtf8Bytes(record, Json);
        ApprovalAudit(user, d.Id, id == null ? "Create" : "Revise"); return ApprovalDto(d);
    }
    public async Task<object> ApprovalDelete(string user, string id, string? version)
    {
        var d = await Document(user, id, ApprovalKind); Version(d, version); var r = ApprovalRead(d);
        Require(r.State is "DRAFT" or "CANCELLED" or "ABANDONED", "请先放弃申请，已购买申请需先解绑交易");
        var evaluations = await db.Documents.Where(x => x.UserId == user && x.Name == id && (x.Kind == "SpendingApprovalEvaluation" || x.Kind == "ApprovalAnswer" || x.Kind == "ApprovalImage" || x.Kind == "ApprovalInstallment")).ToArrayAsync();
        db.RemoveRange(evaluations); db.Remove(d); ApprovalAudit(user, id, "Delete"); return new { id, deleted = true };
    }
    void ApprovalAudit(string user, string id, string action) => db.Add(new AuditRecord { UserId = user, ResourceId = id, ResourceType = ApprovalKind, Action = action, ChangesJson = "{}" });
    public async Task<object> ApprovalCandidates(string user, string id, IQueryCollection query)
    {
        var d = await Document(user, id, ApprovalKind); var r = ApprovalRead(d); var (page, size) = Paging(query);
        var q = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Status == "Confirmed" && t.Type == "Expense" && t.Currency == r.Application.Currency);
        var keyword = query["keyword"].ToString(); Require(keyword.Length <= 100, "关键词过长");
        if (keyword.Length > 0) q = q.Where(t => t.Note.Contains(keyword) || t.Merchant != null && t.Merchant.Contains(keyword) || t.Id == keyword);
        return new { items = await q.OrderByDescending(t => t.OccurredAt).ThenBy(t => t.Id).Skip((page - 1) * size).Take(size).Select(t => new { t.Id, t.Amount, t.Note, t.OccurredAt }).ToArrayAsync(), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> ApprovalChange(string user, string id, ApprovalAction b, string? version)
    {
        var d = await Document(user, id, ApprovalKind); Version(d, version); var r = ApprovalRead(d);
        Require(b.Reason.Length <= 2000, "说明过长");
        switch (b.Action)
        {
            case "SUBMIT": Require(r.State == "DRAFT", "仅草稿可提交"); r = r with { State = "SUBMITTED" }; break;
            case "COOLDOWN": Require(r.State is "SUBMITTED" or "EVALUATED" or "NEEDS_INFORMATION" or "DECIDED", "当前状态不能设置冷静期"); Require(b.Hours is > 0 and <= 8760, "冷静期须为1至8760小时"); r = r with { State = "COOLING_DOWN", CoolingUntil = DateTimeOffset.UtcNow.AddHours(b.Hours!.Value) }; break;
            case "END_COOLDOWN": Require(r.State == "COOLING_DOWN", "不在冷静期"); r = r with { State = "SUBMITTED", CoolingUntil = null }; break;
            case "BUY": Require(r.State is "SUBMITTED" or "EVALUATED" or "NEEDS_INFORMATION" or "COOLING_DOWN", "当前状态不能决定购买"); r = r with { State = "DECIDED", Decision = "BUY", CoolingUntil = null }; break;
            case "MARK_PURCHASED": Require(r.State == "DECIDED", "请先记录购买决定"); r = r with { State = "PURCHASED_UNRECORDED" }; break;
            case "ABANDON": Require(r.State is not ("PURCHASED" or "PURCHASED_UNRECORDED" or "ARCHIVED" or "CANCELLED"), "当前状态不能放弃"); r = r with { State = "ABANDONED", Decision = "ABANDON", CoolingUntil = null }; break;
            case "LINK":
                Require(r.State is "DECIDED" or "PURCHASED" or "PURCHASED_UNRECORDED", "请先记录购买决定");
                Require(await db.Transactions.AnyAsync(t => t.UserId == user && t.Id == b.TransactionId && t.Type == "Expense" && t.Status == "Confirmed" && t.Currency == r.Application.Currency), "交易不存在、非有效支出或币种不符");
                var receipt = await db.Transactions.AsNoTracking().SingleAsync(t => t.UserId == user && t.Id == b.TransactionId);
                var allocation = b.AllocatedAmount ?? receipt.Amount;
                Require(allocation > 0 && allocation <= receipt.Amount && decimal.Round(allocation, 2) == allocation, "商品分摊金额无效");
                var otherLinks = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == ApprovalKind && x.Id != id && x.TransactionId == b.TransactionId).ToArrayAsync();
                Require(otherLinks.Sum(x => ApprovalRead(x).AllocatedAmount ?? receipt.Amount) + allocation <= receipt.Amount, "关联商品分摊合计超过真实交易金额");
                r = r with { State = "PURCHASED", TransactionId = b.TransactionId, AllocatedAmount = allocation }; break;
            case "UNLINK": Require(r.TransactionId != null, "没有关联交易"); r = r with { State = "DECIDED", TransactionId = null, Review = null, AllocatedAmount = null }; break;
            case "REVIEW":
                Require(r.State == "PURCHASED" && await db.Transactions.AnyAsync(t => t.UserId == user && t.Id == r.TransactionId && t.Status == "Confirmed" && t.Type == "Expense" && t.Currency == r.Application.Currency), "请先关联有效购买交易");
                Require(b.Satisfaction is >= 0 and <= 10 && b.ActualUses is >= 0 and <= 1000000, "满意度或使用次数无效");
                r = r with { Review = new(b.Satisfaction!.Value, b.ActualUses!.Value, b.Reason, DateTimeOffset.UtcNow) }; break;
            case "CANCEL": Require(r.State == "DRAFT", "仅草稿可取消"); r = r with { State = "CANCELLED" }; break;
            default: throw new ApiException(422, "不支持的状态操作");
        }
        r = r with { History = [.. r.History, new(DateTimeOffset.UtcNow, user, b.Action, b.Reason)] };
        d.TransactionId = r.TransactionId;
        d.Version++; d.Content = JsonSerializer.SerializeToUtf8Bytes(r, Json); ApprovalAudit(user, id, b.Action); return ApprovalDto(d);
    }
}

public static class SpendingApprovalEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        SpendingApprovalAi.Map(api);
        SpendingApprovalExtras.Map(api);
        api.MapPost("/spending-approvals/{id}/delete", async (string id, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, new { id }, async () => await f.ApprovalDelete(FinanceEndpoints.User(c), id, c.Request.Headers.IfMatch), true));
        api.MapGet("/spending-approvals/{id}/transaction-candidates", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ApprovalCandidates(FinanceEndpoints.User(c), id, c.Request.Query)));
        api.MapGet("/spending-approvals/settings", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ApprovalGetSettings(FinanceEndpoints.User(c))));
        api.MapPut("/spending-approvals/settings", async (ApprovalSettings b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalSaveSettings(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/spending-approvals", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ApprovalList(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/spending-approvals/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ApprovalDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/spending-approvals", async (ApprovalApplication b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalSave(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/spending-approvals/{id}", async (string id, ApprovalApplication b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalSave(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/spending-approvals/{id}/actions", async (string id, ApprovalAction b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ApprovalChange(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
    }
}
