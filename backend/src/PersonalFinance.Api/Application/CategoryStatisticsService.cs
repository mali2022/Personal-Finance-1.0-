using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record CategoryLedgerRow(string TransactionId, string CategoryId, string Type, DateTimeOffset Date, string Merchant, string AccountId, decimal Amount, decimal Discount = 0);
public static class CategoryStatisticsMath
{
    public static decimal? Change(decimal current, decimal previous) => previous == 0 ? null : decimal.Round((current - previous) / Math.Abs(previous) * 100, 2);
    public static Dictionary<string, decimal> Allocate(decimal total, Dictionary<string, decimal> weights)
    {
        var positive = weights.Where(x => x.Value > 0).ToArray(); var sum = positive.Sum(x => x.Value);
        if (sum == 0) return [];
        var exact = positive.ToDictionary(x => x.Key, x => total * x.Value / sum);
        var result = exact.ToDictionary(x => x.Key, x => decimal.Floor(x.Value * 100) / 100);
        var cents = (int)decimal.Round((total - result.Values.Sum()) * 100);
        foreach (var key in exact.OrderByDescending(x => x.Value - result[x.Key]).ThenBy(x => x.Key, StringComparer.Ordinal).Take(cents).Select(x => x.Key)) result[key] += .01m;
        return result;
    }
    public static object Summary(IEnumerable<CategoryLedgerRow> source)
    {
        var rows = source.ToArray(); var transactions = rows.GroupBy(x => x.TransactionId).Select(g => new { amount = g.Sum(x => x.Amount), date = g.First().Date }).ToArray();
        var positive = transactions.Where(x => x.amount > 0).ToArray();
        var gross = rows.Where(x => x.Amount > 0).Sum(x => x.Amount);
        var refund = -rows.Where(x => x.Type == "Refund" && x.Amount < 0).Sum(x => x.Amount);
        var credits = -rows.Where(x => x.Type != "Refund" && x.Amount < 0).Sum(x => x.Amount);
        return new { gross = FinanceService.M(gross), refunds = FinanceService.M(refund), otherCredits = FinanceService.M(credits), net = FinanceService.M(rows.Sum(x => x.Amount)),
            count = transactions.Length, positiveCount = positive.Length, refundCount = rows.Where(x => x.Type == "Refund").Select(x => x.TransactionId).Distinct().Count(),
            average = FinanceService.M(positive.Length == 0 ? 0 : positive.Sum(x => x.amount) / positive.Length), maximum = FinanceService.M(positive.Select(x => x.amount).DefaultIfEmpty(0).Max()),
            discount = FinanceService.M(rows.Sum(x => x.Discount)), firstDate = transactions.Length == 0 ? (DateTimeOffset?)null : transactions.Min(x => x.date), lastDate = transactions.Length == 0 ? (DateTimeOffset?)null : transactions.Max(x => x.date) };
    }
}

public sealed partial class FinanceService
{
    private async Task<List<CategoryLedgerRow>> CategoryLedger(string user, string kind, string currency, string[] ids, bool summaryOnly = false)
    {
        var rules = await Rules(user); var now = DateTimeOffset.UtcNow;
        var transactions = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Status != "Deleted" && t.Currency == currency && t.OccurredAt <= now);
        var entries = db.Entries.AsNoTracking().Where(e => e.UserId == user && ids.Contains(e.CategoryId!) && e.Kind == kind);
        var source = from e in entries join t in transactions on e.TransactionId equals t.Id
                     where kind != "Expense" || rules.IncludeFees || (t.FeeCategoryId == null || e.CategoryId != t.FeeCategoryId)
                     select new { e, t };
        // Overview summaries do not use merchant or account names. Keep separate
        // projections so SQL can omit those columns rather than CASE over them.
        var rows = await (summaryOnly
            ? source.Select(x => new CategoryLedgerRow(x.t.Id, x.e.CategoryId!, x.t.Type, x.t.OccurredAt, "", "", kind == "Income" ? -x.e.Amount : x.e.Amount, 0))
            : source.Select(x => new CategoryLedgerRow(x.t.Id, x.e.CategoryId!, x.t.Type, x.t.OccurredAt, x.t.Merchant ?? "", x.t.AccountId!, kind == "Income" ? -x.e.Amount : x.e.Amount, 0))).ToListAsync();
        if (kind == "Expense" && (rules.IncludeAssetLoss || rules.IncludeDecreasingAdjustments)) {
            var extra = transactions.Where(t => ids.Contains(t.CategoryId!) && (rules.IncludeAssetLoss && t.Type == "AssetLoss" || rules.IncludeDecreasingAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease"));
            rows.AddRange(await (summaryOnly
                ? extra.Select(t => new CategoryLedgerRow(t.Id, t.CategoryId!, t.Type, t.OccurredAt, "", "", t.Amount, 0))
                : extra.Select(t => new CategoryLedgerRow(t.Id, t.CategoryId!, t.Type, t.OccurredAt, t.Merchant ?? "", t.AccountId!, t.Amount, 0))).ToListAsync());
        }
        // Collapse split entries before counting transactions or allocating benefits.
        rows = rows.GroupBy(x => new { x.TransactionId, x.CategoryId }).Select(g => g.First() with { Amount = g.Sum(x => x.Amount) }).ToList();
        // A zero-amount transaction writes no entries; carry its category so the zero row, and its count, stay visible.
        var zeroType = kind == "Income" ? "Income" : "Expense";
        var zeroAmount = transactions.Where(t => t.Amount == 0 && t.Type == zeroType && t.CategoryId != null && ids.Contains(t.CategoryId!)
            && !db.Entries.Any(e => e.UserId == user && e.TransactionId == t.Id && e.Kind == kind && e.CategoryId == t.CategoryId));
        rows.AddRange(await (summaryOnly
            ? zeroAmount.Select(t => new CategoryLedgerRow(t.Id, t.CategoryId!, t.Type, t.OccurredAt, "", "", 0, 0))
            : zeroAmount.Select(t => new CategoryLedgerRow(t.Id, t.CategoryId!, t.Type, t.OccurredAt, t.Merchant ?? "", t.AccountId!, 0, 0))).ToListAsync());
        if (kind == "Expense")
        {
            var promotions = await transactions.Where(t => t.Type == "Expense" && t.PromotionJson != null
                && t.Entries.Any(e => e.Kind == "Expense" && ids.Contains(e.CategoryId!)))
                .Select(t => new { t.Id, t.PromotionJson }).ToArrayAsync();
            if (promotions.Length == 0) return rows;
            var transactionIds = promotions.Select(t => t.Id).ToArray();
            var weights = await (from e in db.Entries join t in transactions on e.TransactionId equals t.Id
                                 where transactionIds.Contains(t.Id) && e.Kind == "Expense" && e.Amount > 0 && (t.FeeCategoryId == null || e.CategoryId != t.FeeCategoryId)
                                 group e by new { t.Id, e.CategoryId } into g select new { g.Key.Id, Category = g.Key.CategoryId!, Amount = g.Sum(x => x.Amount) }).ToArrayAsync();
            var weightGroups = weights.GroupBy(x => x.Id).ToDictionary(g => g.Key, g => g.ToDictionary(x => x.Category, x => x.Amount));
            var discounts = new Dictionary<(string, string), decimal>();
            foreach (var promotion in promotions)
            {
                var input = JsonSerializer.Deserialize<PromotionInput>(promotion.PromotionJson!, Json)!;
                var total = input.Lines.Where(x => x.Type != "FeeWaiver").Sum(x => Money(x.Amount));
                foreach (var allocation in CategoryStatisticsMath.Allocate(total, weightGroups.GetValueOrDefault(promotion.Id, []))) discounts[(promotion.Id, allocation.Key)] = allocation.Value;
            }
            rows = rows.Select(x => x with { Discount = discounts.GetValueOrDefault((x.TransactionId, x.CategoryId)) }).ToList();
        }
        return rows;
    }

    public async Task<object> CategoryOverview(string user, string currency)
    {
        Require(CurrencyDefinitions.Supports(currency), "币种无效");
        var categories = await Categories(user); var tree = new CategoryHierarchy(categories);
        var rows = await CategoryLedger(user, "Expense", currency, categories.Where(x => x.Kind == "Expense").Select(x => x.Id).ToArray(), summaryOnly: true);
        rows.AddRange(await CategoryLedger(user, "Income", currency, categories.Where(x => x.Kind == "Income").Select(x => x.Id).ToArray(), summaryOnly: true));
        var buckets = categories.ToDictionary(c => c.Id, _ => new List<CategoryLedgerRow>());
        foreach (var row in rows)
            foreach (var ancestor in tree.Path(row.CategoryId)) buckets[ancestor.Id].Add(row);
        return new { currency, items = categories.Select(c => new { c.Id, level = tree.Path(c.Id).Length, summary = CategoryStatisticsMath.Summary(buckets[c.Id]) }) };
    }

    public async Task<object> CategoryStatistics(string user, string id, string currency, string month)
    {
        Require(CurrencyDefinitions.Supports(currency), "币种无效");
        var categories = await Categories(user); var category = categories.SingleOrDefault(x => x.Id == id) ?? throw new ApiException(404, "分类不存在");
        var tree = new CategoryHierarchy(categories); var path = tree.Path(id); var ids = tree.Descendants(id).ToHashSet();
        var all = await CategoryLedger(user, category.Kind, currency, tree.Descendants(path[0].Id));
        var rows = all.Where(x => ids.Contains(x.CategoryId)).ToArray();
        var (start, _) = Month(month); var next = start.AddMonths(1); var year = start.Year;
        var yearStart = new DateTimeOffset(year, 1, 1, 0, 0, 0, TimeSpan.FromHours(8));
        CategoryLedgerRow[] In(DateTimeOffset from, DateTimeOffset to) => rows.Where(x => x.Date >= from && x.Date < to).ToArray();
        var currentMonth = In(start, next); var previousMonth = In(start.AddMonths(-1), start); var sameMonth = In(start.AddYears(-1), next.AddYears(-1));
        var currentYear = In(yearStart, yearStart.AddYears(1));
        var months = Enumerable.Range(0, 12).Select(i => new { period = yearStart.AddMonths(i).ToString("yyyy-MM"), summary = CategoryStatisticsMath.Summary(In(yearStart.AddMonths(i), yearStart.AddMonths(i + 1))) }).ToArray();
        var years = rows.GroupBy(x => x.Date.ToOffset(TimeSpan.FromHours(8)).Year).OrderBy(g => g.Key).Select(g => new { period = g.Key.ToString(), summary = CategoryStatisticsMath.Summary(g) }).ToArray();
        var childContributions = categories.Where(c => c.ParentId == id).Select(c => new {
            c.Id, c.Name, summary = CategoryStatisticsMath.Summary(rows.Where(x => tree.Contains(c.Id, x.CategoryId))),
            share = rows.Sum(x => x.Amount) == 0 ? (string?)null : M(rows.Where(x => tree.Contains(c.Id, x.CategoryId)).Sum(x => x.Amount) / rows.Sum(x => x.Amount) * 100)
        }).ToList<object>();
        if (categories.Any(c => c.ParentId == id) && rows.Any(x => x.CategoryId == id)) childContributions.Add(new { id, name = "本级直接记账", summary = CategoryStatisticsMath.Summary(rows.Where(x => x.CategoryId == id)), share = rows.Sum(x => x.Amount) == 0 ? (string?)null : M(rows.Where(x => x.CategoryId == id).Sum(x => x.Amount) / rows.Sum(x => x.Amount) * 100) });
        var accountNames = await db.Accounts.Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id, x => x.Name);
        var merchants = rows.GroupBy(x => x.Merchant).OrderByDescending(g => g.Sum(x => x.Amount)).ThenBy(g => g.Key).Take(20).Select(g => new { name = g.Key == "" ? "未填写商户" : g.Key, summary = CategoryStatisticsMath.Summary(g) }).ToArray();
        var accounts = rows.GroupBy(x => x.AccountId).OrderByDescending(g => g.Sum(x => x.Amount)).ThenBy(g => g.Key).Select(g => new { id = g.Key, name = accountNames.GetValueOrDefault(g.Key, "原账户"), summary = CategoryStatisticsMath.Summary(g), share = rows.Sum(x => x.Amount) == 0 ? (string?)null : M(g.Sum(x => x.Amount) / rows.Sum(x => x.Amount) * 100) }).ToArray();
        var refunds = rows.Where(x => x.Type == "Refund").GroupBy(x => x.Date.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM")).OrderBy(g => g.Key).Select(g => new { period = g.Key, amount = M(-g.Sum(x => x.Amount)), count = g.Select(x => x.TransactionId).Distinct().Count() }).ToArray();
        var discounts = rows.Where(x => x.Discount > 0).GroupBy(x => x.Date.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM")).OrderBy(g => g.Key).Select(g => new { period = g.Key, amount = M(g.Sum(x => x.Discount)), count = g.Select(x => x.TransactionId).Distinct().Count() }).ToArray();
        return new { category = new { category.Id, category.Name, category.Kind, category.Status, category.ParentId, effectiveActive = path.All(c => c.Status == "Active"), level = path.Length, path = path.Select(x => new { x.Id, x.Name }) }, currency, month, year,
            cumulative = CategoryStatisticsMath.Summary(rows), currentMonth = CategoryStatisticsMath.Summary(currentMonth), previousMonth = CategoryStatisticsMath.Summary(previousMonth), currentYear = CategoryStatisticsMath.Summary(currentYear), lastYearSameMonth = CategoryStatisticsMath.Summary(sameMonth),
            monthOverMonth = CategoryStatisticsMath.Change(currentMonth.Sum(x => x.Amount), previousMonth.Sum(x => x.Amount)), yearOverYear = CategoryStatisticsMath.Change(currentMonth.Sum(x => x.Amount), sameMonth.Sum(x => x.Amount)),
            monthlyTrend = months, annualTrend = years, merchants, accounts, childContributions, refunds, discounts,
            budgets = await CategoryBudgetStatistics(user, id, currency, month, year, all, tree, categories),
            scope = "北京时间；仅有效、截至当前时刻的交易；父级含所有下级，笔数按交易去重。金额沿用统计规则，优惠已体现在实付金额中，不再次扣减；优惠展示原始发生额，不因退款回退。环比为所选月与上月，同比分别为所选月与去年同月；零基期显示无可比数据。平均及最大单笔按分类分配后的正向交易金额。付款账户按交易资金账户统计，退款归入实际退款到账账户。" };
    }

    private async Task<object> CategoryBudgetStatistics(string user, string id, string currency, string month, int year, List<CategoryLedgerRow> all, CategoryHierarchy tree, List<Category> categories)
    {
        var category = categories.Single(c => c.Id == id); var supported = currency == "CNY" && category.Kind == "Expense";
        if (!supported) return new { supported = false, reason = category.Kind == "Income" ? "收入分类不使用支出预算" : "现有预算仅支持人民币，请切换至 CNY" };
        var (start, _) = Month(month); var monthRows = all.Where(x => x.Date >= start && x.Date < start.AddMonths(1)).ToArray();
        var yearStart = new DateTimeOffset(year, 1, 1, 0, 0, 0, TimeSpan.FromHours(8)); var yearRows = all.Where(x => x.Date >= yearStart && x.Date < yearStart.AddYears(1)).ToArray();
        var budget = await db.Budgets.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.UserId == user && x.Month == month);
        var annual = await db.Set<AnnualBudget>().AsNoTracking().Include(x => x.Allocations).SingleOrDefaultAsync(x => x.UserId == user && x.Year == year);
        var monthlyLimits = new Dictionary<string, decimal>();
        if (budget != null) foreach (var line in budget.Items) monthlyLimits[line.CategoryId] = line.Limit + await CarryAmount(user, month, line.CategoryId);
        var yearlyLimits = annual?.Allocations.Where(x => x.Month == 0 && x.CategoryId != null).ToDictionary(x => x.CategoryId!, x => x.Amount) ?? [];
        object BudgetSummary(Dictionary<string, decimal> limits, CategoryLedgerRow[] ledger)
        {
            object Line(string key, decimal limit) { var used = ledger.Where(x => tree.Contains(key, x.CategoryId)).Sum(x => x.Amount); return new { id = key, name = categories.Single(x => x.Id == key).Name, limit = M(limit), used = M(used), remaining = M(limit - used), executionPercent = limit == 0 ? (string?)null : M(used / limit * 100) }; }
            var allocated = limits.Where(x => tree.Contains(id, x.Key)).ToArray();
            var overlapping = tree.Overlaps(allocated.Select(x => x.Key));
            var cap = allocated.Length == 0 || overlapping ? (decimal?)null : allocated.Sum(x => x.Value);
            var used = ledger.Where(x => tree.Contains(id, x.CategoryId)).Sum(x => x.Amount);
            return new { limit = cap == null ? null : M(cap.Value), used = M(used), remaining = cap == null ? null : M(cap.Value - used), executionPercent = cap is null or 0 ? (string?)null : M(used / cap.Value * 100), overlapping,
                allocatedLines = allocated.Select(x => Line(x.Key, x.Value)), sharedLines = limits.Where(x => x.Key != id && tree.Contains(x.Key, id)).Select(x => Line(x.Key, x.Value)) };
        }
        return new { supported = true, currency = "CNY", monthly = BudgetSummary(monthlyLimits, monthRows), annual = BudgetSummary(yearlyLimits, yearRows), annualState = annual?.State,
            scope = "独立额度只合计本分类及下级预算；祖先共享额度单列，不自动分配给子分类。无独立额度显示未设置。年度分类额度采用年度分配，不与月度重复相加；历史重叠额度单列并禁止合计。" };
    }
}
