using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> AnalyzeExpenseExclusion(string user, string start, string end, string currency, string? accountId, string? transactionId, CancellationToken ct, DateTimeOffset? asOf = null)
    {
        var (s, e) = Ai.AiAgentTools.DateRange(start, end);
        var from = new DateTimeOffset(s.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8));
        var until = new DateTimeOffset(e.ToDateTime(TimeOnly.MaxValue), TimeSpan.FromHours(8));
        if (asOf is { } cutoff && until > cutoff) until = cutoff;
        Require(CurrencyDefinitions.Supports(currency), "币种无效");
        if (accountId != null) await Account(user, accountId, false);
        var q = Range(user, from, until, currency, accountIds: accountId == null ? null : [accountId]);
        var candidates = q.Where(t => t.Type == "Expense");
        if (accountId != null) candidates = candidates.Where(t => !t.Entries.Any(entry => entry.Kind == "Account" && entry.AccountId != accountId));
        if (transactionId != null) candidates = candidates.Where(t => t.Id == transactionId);
        var selected = await candidates.OrderByDescending(t => t.Amount).ThenBy(t => t.Id).Select(t => new { t.Id, t.Amount }).FirstOrDefaultAsync(ct);
        var original = await Totals(user, q, accountId == null ? null : [accountId]);
        if (selected == null) return new { income = M(original.income), expense = M(original.expense), limitation = "没有符合范围的支出；未执行剔除。" };
        // Exclude the selected expense and its in-period refund entries together. Keep all
        // other fees, refunds, asset-loss/adjustment rules exactly as in the report service.
        var remaining = q.Where(t => t.Id != selected.Id && t.OriginalTransactionId != selected.Id);
        var revised = await Totals(user, remaining, accountId == null ? null : [accountId]);
        return new { transactionId = selected.Id, grossAmount = M(selected.Amount), income = M(original.income), expense = M(original.expense),
            expenseExcluding = M(revised.expense), expenseContribution = M(original.expense - revised.expense), surplusExcluding = M(revised.income - revised.expense),
            expenseContributionPercent = original.expense > 0 ? M((original.expense - revised.expense) / original.expense * 100m) : null,
            basis = "移除选定支出及本期间关联退款后，复用账本收支统计；跨期退款不移入当前期间。限定账户仅从单账户完整支出选择，跨账户拆分不作为该账户的完整支出。不是已确认的一次性支出，也不是实际账本变更。" };
    }
    public async Task<object> CompareAiPeriods(string user, string start, string end, string currency, string[]? accountIds, DateTimeOffset asOf, CancellationToken ct)
    {
        var (s, e) = Ai.AiAgentTools.DateRange(start, end);
        Require(s.Day == 1 && e == s.AddMonths(1).AddDays(-1) && CurrencyDefinitions.Supports(currency), "同期比较需要完整自然月及有效币种");
        var from = new DateTimeOffset(s.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8));
        var window = Ai.AiComparisonWindow.Month(from, asOf); var until = window.End;
        Require(until > from, "未来月份尚无已发生期间");
        var previousStart = window.PreviousStart; var previousEnd = window.PreviousEnd;
        var current = await Totals(user, Range(user, from, until.AddTicks(-1), currency, accountIds: accountIds), accountIds);
        ct.ThrowIfCancellationRequested();
        var previous = await Totals(user, Range(user, previousStart, previousEnd.AddTicks(-1), currency, accountIds: accountIds), accountIds);
        string? Rate(decimal now, decimal before) => before <= 0 ? null : M((now - before) / before * 100m);
        return new { start = from, endExclusive = until, previousStart, previousEndExclusive = previousEnd, currency,
            income = M(current.income), expense = M(current.expense), previousIncome = M(previous.income), previousExpense = M(previous.expense),
            incomeChange = M(current.income - previous.income), expenseChange = M(current.expense - previous.expense),
            incomeRate = Rate(current.income, previous.income), expenseRate = Rate(current.expense, previous.expense),
            basis = "未结束自然月按相同已过时长比较，受上月月末截断；已结束月比较完整自然月。原币、不混加；复用账本退款、手续费和统计开关；零或负基期不提供变化率。" };
    }
}
