using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> PeriodReview(string user, IQueryCollection query, bool annual)
    {
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        DateTimeOffset start;
        if (annual) { Require(int.TryParse(query["year"], out var year), "请提供年度"); start = PlanningYearStart(year); }
        else { var month = query["month"].ToString(); start = Month(month).start; Require(start.Year is >= 1900 and <= 9998, "月份无效"); }
        var end = annual ? start.AddYears(1) : start.AddMonths(1);
        Require(start <= now, "未来期间没有已发生复盘数据");
        var effectiveEnd = end > now ? new DateTimeOffset(now.Date.AddDays(1), TimeSpan.FromHours(8)) : end;
        var previousStart = annual ? start.AddYears(-1) : start.AddMonths(-1);
        var previousEnd = annual ? effectiveEnd.AddYears(-1) : end > now ? previousStart.AddDays(Math.Min((effectiveEnd - start).Days, (start - previousStart).Days)) : start;
        var p = new QueryCollection(new Dictionary<string, StringValues> {
            ["start"] = start.ToString("yyyy-MM-dd"), ["end"] = effectiveEnd.AddDays(-1).ToString("yyyy-MM-dd"), ["currency"] = currency,
            ["comparisonStart"] = previousStart.ToString("yyyy-MM-dd"), ["comparisonEndExclusive"] = previousEnd.ToString("yyyy-MM-dd")
        });
        var q = Range(user, start, effectiveEnd.AddTicks(-1), currency); var rules = await Rules(user);
        var expenseEntries = from e in StatisticalExpenses(q, rules) join t in q on e.TransactionId equals t.Id select new { e.Amount, t.Merchant };
        var merchants = await expenseEntries.GroupBy(x => x.Merchant ?? "未登记商户").Select(g => new { name = g.Key, amount = g.Sum(x => x.Amount) }).OrderByDescending(x => x.amount).Take(20).ToArrayAsync();
        var frequent = await q.Where(t => t.Type == "Expense" && t.Merchant != null).GroupBy(x => x.Merchant!).Select(g => new { name = g.Key, count = g.Count() }).OrderByDescending(x => x.count).Take(20).ToArrayAsync();
        var income = await (from e in db.Entries join t in q on e.TransactionId equals t.Id where e.Kind == "Income" group e by e.CategoryId into g select new { id = g.Key, amount = -g.Sum(x => x.Amount) }).OrderByDescending(x => x.amount).ToArrayAsync();
        var names = await db.Categories.Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id, x => x.Name);
        var totals = await Totals(user, q); var points = await AggregateReportPoints(user, start, effectiveEnd.AddTicks(-1), currency, "month", null);
        var recordedMonths = await q.Select(x => new { x.OccurredAt.Year, x.OccurredAt.Month }).Distinct().CountAsync();
        var upcoming = await db.Set<FutureCashFlowItem>().Where(x => x.UserId == user && x.Currency == currency && x.State == "Planned" && x.ScenarioId == null).OrderBy(x => x.ExpectedDate).ThenBy(x => x.Id).Take(10).Select(x => new { x.Id, x.Name, x.ExpectedDate, x.Type }).ToArrayAsync();
        // Share aggregates only for the exact same period in this read operation.
        // A partial-year review must retain the budget's full-year scope.
        object? budget = currency != "CNY" ? null : annual
            ? effectiveEnd == end ? await AnnualBudgetDetailCore(user, start.Year, points, totals) : await AnnualBudgetDetail(user, start.Year)
            : await Budget(user, start.ToString("yyyy-MM"));
        var importantEvents = await q.Where(x => x.Type == "Adjustment" || x.Type == "AssetLoss" || x.Type == "LoanReceived" || x.Type == "LoanRepaymentPaid" || x.Type == "LoanRepaymentReceived" || x.Type == "Refund").OrderByDescending(x => x.OccurredAt).ThenBy(x => x.Id).Take(20).Select(x => new { x.Id, x.Type, x.OccurredAt }).ToArrayAsync();
        var openingWorth = await Worth(user, currency, start.AddTicks(-1)); var closingWorth = await Worth(user, currency, effectiveEnd.AddTicks(-1));
        var structure = await StructureTotals(user, start, effectiveEnd, currency, false, ReportPeriods(start, effectiveEnd.AddTicks(-1), "month"));
        return new { periodType = annual ? "Annual" : "Monthly", start, endExclusive = effectiveEnd, plannedEndExclusive = end, isPeriodClosed = end <= now,
            review = await FinancialReviewCore(user, p, points, totals), budget, merchants = merchants.Select(x => new { x.name, amount = M(x.amount) }), frequentMerchants = frequent,
            incomeSources = income.Select(x => new { categoryId = x.id, name = x.id == null ? "未分类" : names.GetValueOrDefault(x.id, "历史分类"), amount = M(x.amount) }),
            averageIncomePerElapsedCalendarMonth = M(totals.income / points.Count), averageExpensePerElapsedCalendarMonth = M(totals.expense / points.Count),
            highestIncomeMonth = points.OrderByDescending(x => PlanningDecimal(x.Income)).First().Period,
            highestExpenseMonth = points.OrderByDescending(x => PlanningDecimal(x.Expense)).First().Period,
            savingsRate = totals.income > 0 ? M((totals.income - totals.expense) / totals.income * 100) : null,
            fixedExpense = M(structure.Where(x => x.Behavior == "FixedExpense").Sum(x => x.Amount)), variableExpense = M(structure.Where(x => x.Behavior == "VariableExpense").Sum(x => x.Amount)), unclassifiedExpense = M(structure.Where(x => x.Behavior == "Unknown" || x.Behavior == "OtherStatisticalExpense").Sum(x => x.Amount)),
            openingNetWorth = M(openingWorth.netWorth), closingNetWorth = M(closingWorth.netWorth), netWorthChange = M(closingWorth.netWorth - openingWorth.netWorth),
            importantEvents, points, recordedMonths, elapsedCalendarMonths = points.Count, upcoming, coverageExplanation = "月均按已覆盖自然月数计算（含当月未结束部分），不是完整记录月份的平均。记录月份数不证明完整性；未来月份不包装成全年事实。期初余额生效日期缺失，历史净资产为推算。重要事件列出最近20条退款、调整和借贷事实，不推断原因。待办列出当前未执行计划，不作为历史期间事件。" };
    }
}
