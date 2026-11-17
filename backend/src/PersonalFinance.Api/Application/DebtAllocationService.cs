using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed record DebtAllocationInput(string TransactionId, int Sequence, string Component, string Amount, string Explanation, string FeeNature = "Unclassified");
public sealed partial class FinanceService
{
    public async Task<object> AllocateDebtPayment(string user, string id, DebtAllocationInput input, string? version)
    {
        var plan = await DebtPlan(user, id); Version(plan, version);
        Require(input.FeeNature is "Unclassified" or "Interest" or "ServiceFee" && (input.Component=="Fee"||input.FeeNature=="Unclassified"),"费用分类无效，分类不改变实际资金");
        Require(plan.State == "Active" && input.Component is "Principal" or "Fee" && !string.IsNullOrWhiteSpace(input.Explanation) && input.Explanation.Length <= 2000, "计划已归档或核对参数无效");
        var schedule = JsonSerializer.Deserialize<DebtScheduleRow[]>(plan.ScheduleJson, Json)!;
        Require(schedule.Any(x => x.Sequence == input.Sequence), "计划期数不存在");
        var transaction = await Transaction(user, input.TransactionId); Require(transaction.Status != "Deleted", "实际交易已撤销");
        decimal available;
        if (input.Component == "Principal")
        {
            Require(transaction.CreatedAt >= plan.PrincipalBaselineAt, "该还款早于计划本金基准，可能已从基准剩余本金扣除，不能再次分配；请核对计划历史");
            if (plan.Kind == "LoanRepayment") { Require(transaction.BusinessId == plan.BusinessId && transaction.Type is "LoanRepaymentPaid" or "LoanRepaymentReceived", "只能关联本借贷的实际本金归还"); available = transaction.Amount; }
            else { Require(transaction.Type is "CreditCardPayment" or "Transfer", "只能关联信用卡实际还款"); available = await db.Entries.Where(x => x.UserId == user && x.TransactionId == transaction.Id && x.Kind == "Account" && x.AccountId == plan.AccountId && x.Amount > 0).SumAsync(x => (decimal?)x.Amount) ?? 0; }
        }
        else { Require(transaction.Currency == plan.Currency && transaction.Type is "Expense" or "Income", "费用只能关联同币种已发生的普通收支交易"); if (plan.Kind == "LoanRepayment") { var business = await BusinessEntity(user, plan.BusinessId!); Require(transaction.Type == (business.Kind == "Lent" ? "Income" : "Expense"), "利息收付方向与借贷不匹配"); } else Require(transaction.Type == "Expense", "分期费用需关联真实支出"); var refunds = await db.Transactions.Where(x => x.UserId == user && x.OriginalTransactionId == transaction.Id && x.Status != "Deleted").SumAsync(x => (decimal?)x.Amount) ?? 0; available = transaction.Amount - refunds; }
        var amount = Money(input.Amount, true);
        var used = await db.Set<DebtPaymentAllocation>().Where(x => x.UserId == user && x.TransactionId == transaction.Id && x.State == "Active").SumAsync(x => (decimal?)x.Amount) ?? 0;
        Require(amount + used <= available, "累计分配超过真实交易金额，不能重复关联");
        if (input.Component == "Principal") { var paid = await db.Set<DebtPaymentAllocation>().Where(x => x.UserId == user && x.PlanId == id && x.Component == "Principal" && x.State == "Active").SumAsync(x => (decimal?)x.Amount) ?? 0; Require(paid + amount <= plan.Principal, "分配本金超过计划本金"); }
        var row = new DebtPaymentAllocation { UserId = user, PlanId = id, TransactionId = transaction.Id, Sequence = input.Sequence, Component = input.Component, FeeNature=input.FeeNature, Amount = amount, Explanation = input.Explanation }; db.Add(row); plan.Version++; plan.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = plan.Version.ToString() };
    }
    public async Task<object> RevokeDebtAllocation(string user, string id, string allocationId, string? version)
    {
        var plan = await DebtPlan(user, id); Version(plan, version);
        var row = await db.Set<DebtPaymentAllocation>().SingleOrDefaultAsync(x => x.UserId == user && x.PlanId == id && x.Id == allocationId); Require(row != null && row.State == "Active", "分配记录不存在或已撤销"); row!.State = "Revoked"; row.Version++; plan.Version++; return new { row.Id, version = plan.Version.ToString() };
    }
    public async Task<object> DebtAllocationDetails(string user, string id)
    {
        await DebtPlan(user, id);
        var rows = await (from a in db.Set<DebtPaymentAllocation>().AsNoTracking() join t in db.Transactions on a.TransactionId equals t.Id where a.UserId == user && a.PlanId == id orderby a.CreatedAt select new { a.Id, a.TransactionId, a.Sequence, a.Component, a.FeeNature, a.Amount, a.State, a.Explanation, invalid = t.Status == "Deleted" || db.Transactions.Any(r => r.UserId == user && r.OriginalTransactionId == t.Id && r.Status != "Deleted") }).Take(2001).ToArrayAsync();
        Require(rows.Length <= 2000, "核对记录过多，请使用更小的计划");
        return rows.Select(a => new { a.Id, a.TransactionId, a.Sequence, a.Component, a.FeeNature, amount = M(a.Amount), a.State, a.Explanation, a.invalid });
    }
}

