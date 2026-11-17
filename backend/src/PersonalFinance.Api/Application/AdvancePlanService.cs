using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static object AdvancePlanView(AdvancePurchasePlan p) => new { p.Id, p.Name, p.Counterparty, p.AccountId, p.Currency, plannedAmount = M(p.PlannedAmount), plannedOwnAmount = M(p.PlannedOwnAmount), quantity = D(p.Quantity), p.Unit, p.State, p.AdvanceId, p.Note, p.CancellationReason, p.CreatedAt, version = p.Version.ToString(), cashImpact = "0.00", receivable = "0.00", rule = "待购计划只记录预计价格；确认实际采购前没有现金、负债或应收分录。" };
    public async Task<object> AdvancePlans(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<AdvancePurchasePlan>().AsNoTracking().Where(x => x.UserId == user);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(AdvancePlanView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveAdvancePlan(string user, AdvancePlanInput b, string? id, string? version)
    {
        Require(b.Name.Trim().Length is > 0 and <= 200 && b.Counterparty.Trim().Length is > 0 and <= 200 && b.Unit.Trim().Length is > 0 and <= 30 && b.Note.Length <= 2000, "待购事项信息无效");
        var account = await Account(user, b.AccountId); Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "请选择预计实际付款账户");
        var total = Money(b.PlannedAmount, true); var own = Money(b.PlannedOwnAmount); Require(own >= 0 && own <= total, "预计本人承担额无效");
        var p = id == null ? new AdvancePurchasePlan { UserId = user } : await db.Set<AdvancePurchasePlan>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "待购计划不存在");
        if (id != null) { Version(p, version); Require(p.State == "Planned", "已取消或采购的计划不能改写"); p.Version++; }
        p.Name = b.Name.Trim(); p.Counterparty = b.Counterparty.Trim(); p.AccountId = account.Id; p.Currency = account.Currency; p.PlannedAmount = total; p.PlannedOwnAmount = own; p.Quantity = InvestmentDecimal(b.Quantity, true); p.Unit = b.Unit.Trim(); p.Note = b.Note; p.UpdatedAt = DateTimeOffset.UtcNow;
        if (id == null) db.Add(p); return AdvancePlanView(p);
    }
    public async Task<object> CancelAdvancePlan(string user, string id, StageGReasonInput b, string? version)
    {
        var p = await db.Set<AdvancePurchasePlan>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "待购计划不存在"); Version(p, version);
        Require(p.State == "Planned" && b.Reason.Trim().Length is > 0 and <= 2000, "只有待购计划可取消，须填写原因");
        p.State = "Cancelled"; p.CancellationReason = b.Reason.Trim(); p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow; return AdvancePlanView(p);
    }
    public async Task<object> PurchaseAdvancePlan(string user, string id, AdvancePlanPurchaseInput b, string? version, bool preview)
    {
        var p = await db.Set<AdvancePurchasePlan>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "待购计划不存在"); Version(p, version); Require(p.State == "Planned", "计划已经采购或取消");
        var account = await Account(user, p.AccountId); Require(account.Currency == p.Currency, "计划账户币种已改变");
        var input = new AdvanceInput(p.Name, p.Counterparty, p.AccountId, b.Amount, b.OwnAmount, b.OccurredAt, b.CategoryId, D(p.Quantity), p.Unit, Note: p.Note, InstrumentId: b.InstrumentId, InstrumentVersion: b.InstrumentVersion);
        var result = await CreateAdvance(user, input, preview); if (preview) return result;
        p.AdvanceId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); p.State = "Purchased"; p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow;
        return AdvancePlanView(p);
    }
}


