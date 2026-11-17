using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed record DebtOrderInput(string MonthlyBudget, int HorizonMonths, string[] PlanIds, bool ConfirmMonthlyAssumptions);
public sealed partial class FinanceService
{
    public async Task<object> DebtOrderPreview(string user, DebtOrderInput input)
    {
        Require(input.ConfirmMonthlyAssumptions, "请明确确认无最低付款及提前还款费用的月度数学假设"); Require(input.PlanIds is { Length: > 0 and <= 100 } && input.PlanIds.Distinct().Count() == input.PlanIds.Length, "请选择1至100项计划");
        var plans = await db.Set<DebtRepaymentPlan>().Where(x => x.UserId == user && input.PlanIds.Contains(x.Id) && x.State == "Active").ToArrayAsync();
        Require(plans.Length == input.PlanIds.Length && plans.Select(x => x.Currency).Distinct().Count() == 1, "计划不存在、已归档或币种不同");
        Require(plans.All(x => x.FeeMode is "None" or "RemainingPrincipalRate"), "缺少可比较的剩余本金月利率或合同费用，不能输出节省金额");
        var borrowed = await db.Businesses.Where(x => x.UserId == user && x.Kind == "Borrowed").Select(x => x.Id).ToArrayAsync(); Require(plans.All(x => x.Kind == "CreditInstallment" || borrowed.Contains(x.BusinessId!)), "借出应收不属于偿债计划");
        var ids = input.PlanIds; var allocations = await (from a in db.Set<DebtPaymentAllocation>() join t in db.Transactions on a.TransactionId equals t.Id where a.UserId == user && ids.Contains(a.PlanId) && a.Component == "Principal" && a.State == "Active" && t.Status != "Deleted" && !db.Transactions.Any(r => r.UserId == user && r.OriginalTransactionId == t.Id && r.Status != "Deleted") select a).ToArrayAsync();
        var sources = plans.Select(x => new DebtOrderBalance(x.Id, Math.Max(0, x.Principal - allocations.Where(a => a.PlanId == x.Id).Sum(a => a.Amount)), x.PeriodRate / 100)).ToArray();
        object View(DebtOrderResult r) => new { r.Order, r.Months, interest = M(r.Interest), remainingPrincipal = M(r.RemainingPrincipal) }; try { return new { currency = plans[0].Currency, highestRate = View(DebtOrderMath.Calculate(sources, Money(input.MonthlyBudget, true), input.HorizonMonths, "HighestRate")), smallestBalance = View(DebtOrderMath.Calculate(sources, Money(input.MonthlyBudget, true), input.HorizonMonths, "SmallestBalance")), explanation = "仅假设每期为一个月、月末按剩余本金计息并优先付息、全部本金可自由提前偿还、无最低付款约束且无提前还款费的数学对比。利率沿用用户登记每期参数并明确当作月率；不能作为合同实际节省或替代正式计划。未核对还款须先核对，所有计算不写账本。" }; } catch (ArgumentException ex) { Require(false, ex.Message); throw; }
    }
    public async Task<object> DebtPressure(string user, IQueryCollection query)
    {
        var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var plans = await db.Set<DebtRepaymentPlan>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.State == "Active").OrderBy(x => x.Id).Take(1001).ToArrayAsync(); Require(plans.Length <= 1000, "有效计划过多，请缩小范围");
        var ids = plans.Select(x => x.Id).ToArray();
        var allocations = await (from a in db.Set<DebtPaymentAllocation>() join t in db.Transactions on a.TransactionId equals t.Id where a.UserId == user && ids.Contains(a.PlanId) && a.State == "Active" && t.Status != "Deleted" && !db.Transactions.Any(r => r.UserId == user && r.OriginalTransactionId == t.Id && r.Status != "Deleted") select a).AsNoTracking().ToArrayAsync();
        var businessIds = plans.Where(x => x.BusinessId != null).Select(x => x.BusinessId!).ToArray();
        var borrowed = await db.Businesses.Where(x => x.UserId == user && businessIds.Contains(x.Id) && x.Kind == "Borrowed").Select(x => x.Id).ToArrayAsync();
        var payablePlans = plans.Where(x => x.Kind == "CreditInstallment" || borrowed.Contains(x.BusinessId!)).ToArray();
        var paid = allocations.GroupBy(a => (a.PlanId, a.Sequence, a.Component)).ToDictionary(g => g.Key, g => g.Sum(a => a.Amount));
        var rows = payablePlans.SelectMany(p => JsonSerializer.Deserialize<DebtScheduleRow[]>(p.ScheduleJson, Json)!.Select(r => new { p.Id, p.Name, r.Date, principal = Math.Max(0, r.Principal - paid.GetValueOrDefault((p.Id, r.Sequence, "Principal"))), fee = Math.Max(0, r.Fee - paid.GetValueOrDefault((p.Id, r.Sequence, "Fee"))) })).ToArray();
        return new { currency, source = "仅已登记的活动应付计划；已核对实际金额扣除，借出应收不计偿债压力", plannedRemainingPrincipal = M(rows.Sum(x => x.principal)), plannedUnconfirmedFees = M(rows.Sum(x => x.fee)), estimatedPayoffDate = rows.Where(x => x.principal + x.fee > 0).Select(x => (DateOnly?)x.Date).Max(), months = rows.GroupBy(x => x.Date.ToString("yyyy-MM")).OrderBy(x => x.Key).Select(g => new { month = g.Key, principal = M(g.Sum(x => x.principal)), fee = M(g.Sum(x => x.fee)), total = M(g.Sum(x => x.principal + x.fee)) }), limitation = "不是全部真实负债；计划本金不能再加到信用卡欠款。未核对的已付款、延期及提前偿还需用户修订计划。缺少合同提前还款费用和利率变更规则时，不输出还款排序节省金额。该表不自动进入现金流，避免与已有手工付款重复。" };
    }
}



