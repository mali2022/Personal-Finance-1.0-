using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public static decimal? ReviewChangeRate(decimal current, decimal previous)
        => previous == 0 ? null : decimal.Round((current - previous) / Math.Abs(previous) * 100, 2);
    private static string? ReviewRateText(decimal current, decimal previous)
        => ReviewChangeRate(current, previous) is decimal rate ? M(rate) : null;

    public Task<object> FinancialReview(string user, IQueryCollection query)
        => FinancialReviewCore(user, query);

    private async Task<object> FinancialReviewCore(string user, IQueryCollection query,
        List<ReportPoint>? currentPoints = null, (decimal income, decimal expense)? currentTotals = null)
    {
        var (start, end) = IndicatorRange(query);
        var currency = query["currency"].ToString();
        Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        Require(end > start, "复盘范围无效");
        Require(string.IsNullOrEmpty(query["comparisonStart"]) == string.IsNullOrEmpty(query["comparisonEndExclusive"]), "对比起止日期必须同时提供");
        var naturalMonth = start.Day == 1 && end == start.AddMonths(1);
        var naturalYear = start.Month == 1 && start.Day == 1 && end == start.AddYears(1);
        var defaultPreviousStart = naturalMonth ? start.AddMonths(-1) : naturalYear ? start.AddYears(-1) : start.AddTicks(-(end - start).Ticks);
        var previousStart = string.IsNullOrEmpty(query["comparisonStart"]) ? defaultPreviousStart : Date(query["comparisonStart"]!);
        var previousEnd = string.IsNullOrEmpty(query["comparisonEndExclusive"]) ? start : Date(query["comparisonEndExclusive"]!);
        Require(previousEnd > previousStart, "对比范围无效");
        var current = Range(user, start, end.AddTicks(-1), currency);
        var previous = Range(user, previousStart, previousEnd.AddTicks(-1), currency);
        var totals = currentTotals ?? await Totals(user, current);
        var prior = await Totals(user, previous);
        var rules = await Rules(user);
        async Task<Dictionary<string, decimal>> CategoriesFor(IQueryable<Domain.FinanceTransaction> range)
            => await StatisticalExpenses(range, rules).GroupBy(x => x.CategoryId ?? "unclassified").Select(g => new { id = g.Key, amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.id, x => x.amount);
        var amounts = await CategoriesFor(current);
        var priorAmounts = await CategoriesFor(previous);
        var names = await db.Categories.Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id, x => x.Name);
        var categories = amounts.Keys.Union(priorAmounts.Keys).Select(id => new {
            categoryId = id, name = names.GetValueOrDefault(id, "未分类"), amount = M(amounts.GetValueOrDefault(id)),
            previous = M(priorAmounts.GetValueOrDefault(id)), difference = M(amounts.GetValueOrDefault(id) - priorAmounts.GetValueOrDefault(id)),
            changeRate = ReviewRateText(amounts.GetValueOrDefault(id), priorAmounts.GetValueOrDefault(id)), reason = "原因待确认"
        }).ToArray();
        var first = await db.Transactions.Where(x => x.UserId == user && x.Currency == currency && x.Status != "Deleted").MinAsync(x => (DateTimeOffset?)x.OccurredAt);
        var refundAmount = await StatisticalExpenses(current.Where(x => x.Type == "Refund"), rules).SumAsync(x => (decimal?)x.Amount) ?? 0;
        object Comparison(decimal value, decimal before) => new { amount = M(value), previous = M(before), difference = M(value - before), changeRate = ReviewRateText(value, before), direction = value == before ? "unchanged" : value > before ? "increase" : "decrease" };
        return new {
            currency, start, endExclusive = end, comparisonStart = previousStart, comparisonEndExclusive = previousEnd,
            income = Comparison(totals.income, prior.income), expense = Comparison(totals.expense, prior.expense),
            surplus = Comparison(totals.income - totals.expense, prior.income - prior.expense),
            savingsRate = totals.income > 0 ? M((totals.income - totals.expense) / totals.income * 100) : null,
            categories, refundExpense = M(refundAmount),
            points = currentPoints ?? await AggregateReportPoints(user, start, end.AddTicks(-1), currency, end.Year - start.Year >= 49 ? "year" : "month", null),
            rules = new { rules.IncludeFees, rules.IncludeAssetLoss, rules.IncludeDecreasingAdjustments },
            coverage = new { firstRecordedAt = first, complete = false, explanation = "最早交易仅表示已记录数据起点，不能证明完整覆盖。账户缺少期初余额生效日期，历史净资产属于推算，不能视为可信历史估值。" },
            formula = "统计收支复用账本分录；退款按到账日冲减支出；储蓄率=(统计收入−统计支出)/统计收入。分类采用稳定ID，负净支出保留。资产损失与余额调减按统计开关计入总额，未必归属消费分类。"
        };
    }
}
