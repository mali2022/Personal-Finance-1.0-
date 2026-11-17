using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public static (DateTimeOffset start, DateTimeOffset end) Month(string value)
    {
        Require(DateTime.TryParseExact(value + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d), "月份格式应为 yyyy-MM");
        var start = new DateTimeOffset(d, TimeSpan.FromHours(8)); return (start, start.AddMonths(1).AddTicks(-1));
    }
    private IQueryable<FinanceTransaction> Range(string user, DateTimeOffset start, DateTimeOffset end, string currency, string? project = null, string[]? accountIds = null)
        => db.Transactions.Where(t => t.UserId == user && t.Status != "Deleted" && t.OccurredAt >= start && t.OccurredAt <= end && t.Currency == currency && (project == null || t.ProjectId == project) && (accountIds == null || accountIds.Contains(t.AccountId) || t.Entries.Any(e=>e.UserId==user && e.Kind=="Account" && accountIds.Contains(e.AccountId!))));
    public async Task<StatisticsRules> Rules(string user)
    { return await db.Rules.SingleOrDefaultAsync(x => x.UserId == user) ?? new() { UserId = user }; }
    private IQueryable<Entry> StatisticalExpenses(IQueryable<FinanceTransaction> transactions, StatisticsRules rules, string[]? accountIds=null)
        => from entry in db.Entries join t in transactions on entry.TransactionId equals t.Id
           where entry.Kind == "Expense" && (accountIds==null || accountIds.Contains(entry.AccountId??t.AccountId)) && (rules.IncludeFees || (t.FeeCategoryId == null || entry.CategoryId != t.FeeCategoryId)) select entry;
    private async Task<(decimal income, decimal expense)> Totals(string user, IQueryable<FinanceTransaction> transactions, string[]? accountIds=null)
    {
        var rules = await Rules(user);
        var totals = await (from entry in db.Entries join t in transactions on entry.TransactionId equals t.Id
            where entry.Kind == "Income" || entry.Kind == "Expense"
            group new { entry, t } by 1 into g select new {
                Income = -g.Sum(x => x.entry.Kind == "Income" && (accountIds == null || accountIds.Contains(x.entry.AccountId ?? x.t.AccountId)) ? x.entry.Amount : 0),
                Expense = g.Sum(x => x.entry.Kind == "Expense" && (accountIds == null || accountIds.Contains(x.entry.AccountId ?? x.t.AccountId))
                    && (rules.IncludeFees || x.t.FeeCategoryId == null || x.entry.CategoryId != x.t.FeeCategoryId) ? x.entry.Amount : 0)
            }).SingleOrDefaultAsync();
        decimal expense = totals?.Expense ?? 0;
        if (rules.IncludeAssetLoss) expense += await transactions.Where(x => x.Type == "AssetLoss").SumAsync(x => (decimal?)x.Amount) ?? 0;
        if (rules.IncludeDecreasingAdjustments) expense += await transactions.Where(x => x.Type == "Adjustment" && x.AdjustmentDirection == "Decrease").SumAsync(x => (decimal?)x.Amount) ?? 0;
        return (totals?.Income ?? 0, expense);
    }
    private async Task<(decimal assets, decimal liabilities, decimal netWorth)> Worth(string user, string currency, DateTimeOffset? end = null, string[]? accountIds = null, Dictionary<string, CurrentAccountLedger>? currentLedger = null)
    {
        var accounts = await db.Accounts.Where(x => x.UserId == user && x.Currency == currency && (accountIds == null || accountIds.Contains(x.Id))).ToListAsync();
        var selectedAccounts = accounts.Select(a => a.Id).ToArray();
        if (end is null) {
            var current = currentLedger ?? await CurrentAccountBalances(user, selectedAccounts);
            var currentValues = accounts.Select(a => a.OpeningBalance + (current.GetValueOrDefault(a.Id)?.Amount ?? 0)).ToArray();
            return (currentValues.Where(x => x > 0).Sum(), -currentValues.Where(x => x < 0).Sum(), currentValues.Sum());
        }
        var entries = await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.UserId == user && t.UserId == user && e.Kind == "Account" && t.Status != "Deleted" && (end == null || t.OccurredAt <= end) && selectedAccounts.Contains(e.AccountId!)
                             group e by e.AccountId into g select new { Id = g.Key!, Amount = g.Sum(e => e.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var values = accounts.Select(x => x.OpeningBalance + entries.GetValueOrDefault(x.Id)).ToArray();
        return (values.Where(x => x > 0).Sum(), -values.Where(x => x < 0).Sum(), values.Sum());
    }
    private async Task<object[]> CategoryStats(string user, IQueryable<FinanceTransaction> transactions, string? parent = null, string[]? accountIds=null)
    {
        var rules = await Rules(user);
        var sums = await CategoryExpenseSums(transactions, rules, accountIds);
        var cats = await Categories(user); var hierarchy = new CategoryHierarchy(cats); var totals = new Dictionary<string, decimal>();
        foreach (var sum in sums)
        { var id = hierarchy.Bucket(sum.Id!, parent); if (id != null) totals[id] = totals.GetValueOrDefault(id) + sum.Amount; }
        var total = totals.Values.Where(x => x > 0).Sum();
        return totals.Where(x => x.Value > 0).OrderByDescending(x => x.Value).Select(x => (object)new { categoryId = x.Key, name = cats.Single(c => c.Id == x.Key).Name, amount = M(x.Value), share = total == 0 ? 0 : decimal.Round(x.Value / total * 100, 2) }).ToArray();
    }
    public async Task<object> Budget(string user, string month, DateTimeOffset? asOf = null)
    {
        var (start, end) = Month(month); var b = await db.Budgets.Include(x => x.Items).SingleOrDefaultAsync(x => x.UserId == user && x.Month == month);
        if (asOf is { } cutoff && end > cutoff) end = cutoff;
        var range = Range(user, start, end, "CNY"); var (_, used) = await Totals(user, range);
        var rules = await Rules(user); var items = new List<object>();
        if (b is not null) foreach (var item in b.Items)
        {
            var ids = new CategoryHierarchy(await Categories(user)).Descendants(item.CategoryId);
            var amount = await (from e in StatisticalExpenses(range, rules) where ids.Contains(e.CategoryId!) select (decimal?)e.Amount).SumAsync() ?? 0;
            amount += await range.Where(t => ids.Contains(t.CategoryId!) && (rules.IncludeAssetLoss && t.Type == "AssetLoss" || rules.IncludeDecreasingAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease")).SumAsync(t => (decimal?)t.Amount) ?? 0;
            var carried = await CarryAmount(user, month, item.CategoryId);
            items.Add(new { item.Id, item.CategoryId, limit = M(item.Limit + carried), baseLimit = M(item.Limit), carryover = M(carried), used = M(amount) });
        }
        var carryover = await CarryAmount(user, month);
        return new { id = b?.Id ?? month, month, total = M((b?.Total ?? 0) + carryover), baseTotal = M(b?.Total ?? 0), carryover = M(carryover), used = M(used), items, version = b?.Version.ToString() ?? "0" };
    }
    private sealed record CategoryExpenseSum(string? Id, decimal Amount);
    private async Task<List<CategoryExpenseSum>> CategoryExpenseSums(IQueryable<FinanceTransaction> transactions, StatisticsRules rules, string[]? accountIds=null)
    {
        var sums = await StatisticalExpenses(transactions, rules, accountIds).GroupBy(e => e.CategoryId).Select(g => new CategoryExpenseSum(g.Key, g.Sum(e => e.Amount))).ToListAsync();
        sums.AddRange(await transactions.Where(t => rules.IncludeAssetLoss && t.Type == "AssetLoss" || rules.IncludeDecreasingAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease")
            .GroupBy(t => t.CategoryId).Select(g => new CategoryExpenseSum(g.Key, g.Sum(t => t.Amount))).ToListAsync());
        return sums.Where(x => x.Id != null).GroupBy(x => x.Id).Select(g => new CategoryExpenseSum(g.Key, g.Sum(x => x.Amount))).ToList();
    }
    public async Task<object> SaveBudget(string user, string month, BudgetInput input, string? version, string reason = "月度预算人工确认")
    {
        Month(month); var total = Money(input.Total); Require(total >= 0 && input.Items.Length <= 100 && input.Items.Select(x => x.CategoryId).Distinct().Count() == input.Items.Length, "预算或分类明细无效");
        Require(input.Items.Sum(x => Money(x.Limit)) <= total && input.Items.All(x => Money(x.Limit) >= 0), "分类预算不能超过总预算");
        var selectedCategories = new List<Category>();
        foreach (var line in input.Items) selectedCategories.Add(await Category(user, line.CategoryId, "Expense", false));
        Require(!new CategoryHierarchy(await Categories(user)).Overlaps(selectedCategories.Select(c => c.Id)), "同月不能同时设置父分类及其下级分类预算，请保留其中一层");
        var b = await db.Budgets.Include(x => x.Items).SingleOrDefaultAsync(x => x.UserId == user && x.Month == month);
        var beforeBudget = b == null ? "{}" : JsonSerializer.Serialize(new { total = M(b.Total), items = b.Items.Select(x => new { x.CategoryId, limit = M(x.Limit) }) }, Json);
        var previousVersion = b?.Version ?? 0;
        if (b is null) { Require(version == "0", "预算版本无效"); b = new() { UserId = user, Month = month }; db.Budgets.Add(b); }
        else { Version(b, version); db.RemoveRange(b.Items); b.Version++; }
        b.Total = total; b.Items = input.Items.Select(x => new BudgetLine { BudgetId = b.Id, CategoryId = x.CategoryId, Limit = Money(x.Limit) }).ToList();
        db.Add(new BudgetChangeHistory { UserId = user, BudgetId = b.Id, BeforeJson = beforeBudget, AfterJson = JsonSerializer.Serialize(input, Json), Reason = reason, BeforeVersion = previousVersion, AfterVersion = b.Version });
        return new { b.Id };
    }
    public async Task<object> Dashboard(string user, string month)
    {
        var currency = await db.Users.Where(x=>x.Id==user).Select(x=>x.PreferredCurrency).SingleAsync();
        var (start, end) = Month(month); var q = Range(user, start, end, currency); var (income, expense) = await Totals(user, q);
        var (pi, pe) = await Totals(user, Range(user, start.AddMonths(-1), start.AddTicks(-1), currency));
        var currentLedger = await CurrentAccountBalances(user); var worth = await Worth(user, currency, currentLedger: currentLedger);
        var points = await AggregateReportPoints(user, start.AddMonths(-5), end, currency, "month", null);
        var trend = points.Select(p => new { month = p.Period, income = p.Income, expense = p.Expense, netWorth = p.NetWorth }).ToArray();
        var recent = await db.Transactions.Include(x => x.Entries).Include(x => x.Tags).AsSplitQuery().Where(x => x.UserId == user && x.Status != "Deleted")
            .OrderByDescending(x => x.OccurredAt).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(10).ToListAsync();
        return new { month, currency, income = M(income), expense = M(expense), surplus = M(income - expense), assets = M(worth.assets), liabilities = M(worth.liabilities), netWorth = M(worth.netWorth), previousIncome = M(pi), previousExpense = M(pe), accounts = await AccountViews(user, currentLedger), budget = await Budget(user, month), categories = await CategoryStats(user, q), trend, recentTransactions = await ProjectTransactions(user, recent) };
    }
    public async Task<object> Report(string user, IQueryCollection p, string[]? accountIds = null)
    {
        var start = Date(p["start"]!); var end = Date(p["end"]!); if (p["end"].ToString().Length == 10) end = end.AddDays(1).AddTicks(-1); var currency = p["currency"].ToString(); var granularity = p["granularity"].ToString();
        Require(end >= start && CurrencyDefinitions.Supports(currency), "统计时间范围或币种无效");
        Require(new[] { "day", "week", "month", "year" }.Contains(granularity), "统计粒度无效");
        var project = string.IsNullOrEmpty(p["projectId"]) ? null : p["projectId"].ToString(); var q = Range(user, start, end, currency, project, accountIds);
        var points = await AggregateReportPoints(user, start, end, currency, granularity, project, accountIds);
        var totals = await Totals(user, q, accountIds); var worth = await Worth(user, currency, end, accountIds);
        return new { income = M(totals.income), expense = M(totals.expense), assets = M(worth.assets), liabilities = M(worth.liabilities), netWorth = M(worth.netWorth), currency, categories = await CategoryStats(user, q, string.IsNullOrEmpty(p["parentId"]) ? null : p["parentId"].ToString(), accountIds), points, excludedCurrencies = await db.Accounts.Where(x => x.UserId == user && x.Currency != currency && (accountIds == null || accountIds.Contains(x.Id))).Select(x => x.Currency).Distinct().ToArrayAsync() };
    }
    public async Task<object> RefundSource(string user, string id, string? exclude = null)
    {
        var original = await Transaction(user, id); Require(original.Type == "Expense" && original.Status != "Deleted" && !await db.Set<CashbackRecovery>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "原消费不可退款");
        var refunds = await db.Transactions.Include(x => x.Entries).Where(x => x.UserId == user && x.OriginalTransactionId == id && x.Status != "Deleted" && x.Id != exclude).ToListAsync();
        var dto = JsonSerializer.SerializeToNode((await ProjectTransactions(user, [original]))[0], Json)!.AsObject();
        var recoveries = await PriceRecoveryTransactions(user, original.Id);
        dto["refundableAmount"] = M(original.Amount - refunds.Sum(x => x.Amount) + recoveries.Sum(x => x.Amount));
        dto["refundableSplits"] = JsonSerializer.SerializeToNode(original.Entries.Where(x => x.Kind == "Expense").GroupBy(x => x.CategoryId!).Select(g => new { categoryId = g.Key, amount = M(g.Sum(x => x.Amount) + refunds.Concat(recoveries).SelectMany(x => x.Entries).Where(x => x.CategoryId == g.Key && x.Kind == "Expense").Sum(x => x.Amount)) }), Json); return dto;
    }
    public async Task<object> CardStatement(string user, string id, string month)
    {
        var a = await Account(user, id, false); Require((a.Type == "CreditCard" || a.Type == "ConsumerCredit") && a.BillingMode=="Monthly", "该账户不使用月账期，请查看逐笔消费与实际还款计划"); var (start, _) = Month(month); var local = start.ToOffset(TimeSpan.FromHours(8));
        var window = CreditStatementWindow.Create(local.Year, local.Month, a.StatementDay ?? 20, a.PaymentDay ?? 10);
        var statement = window.StatementEnd; var cycle = window.CycleStart; var due = window.DueDate;
        var statementEndExclusive = window.StatementEndExclusive; var dueEndExclusive = window.DueEndExclusive;
        var cardTransactions = db.Transactions.Where(x => x.UserId == user && x.Status != "Deleted");
        var purchases = -(await (from e in db.Entries join t in cardTransactions on e.TransactionId equals t.Id where e.Kind=="Account" && e.AccountId==id && t.Type=="Expense" && t.OccurredAt>=cycle && t.OccurredAt<statementEndExclusive select (decimal?)e.Amount).SumAsync()??0);
        var refunds = await cardTransactions.Where(x => x.AccountId == id && x.Type == "Refund" && x.OccurredAt >= cycle && x.OccurredAt < statementEndExclusive).SumAsync(x => (decimal?)x.Amount) ?? 0;
        var credits = from e in db.Entries join t in cardTransactions on e.TransactionId equals t.Id
                      where e.UserId == user && e.Kind == "Account" && e.AccountId == id && e.Amount > 0 && t.OccurredAt >= statementEndExclusive && t.OccurredAt < dueEndExclusive
                      select new { e.Amount, t.Type };
        var repaid = await credits.Where(x => x.Type == "CreditCardPayment" || x.Type == "Transfer").SumAsync(x => (decimal?)x.Amount) ?? 0;
        var otherCredits = await credits.Where(x => x.Type != "CreditCardPayment" && x.Type != "Transfer").SumAsync(x => (decimal?)x.Amount) ?? 0;
        var billed = Math.Max(0, -(await Balance(user, id, statement))); var current = Math.Max(0, -(await Balance(user, id)));
        var remaining = Math.Max(0, billed - repaid - otherCredits);
        return new { accountId = id, a.Currency, cycleStart = cycle.ToString("yyyy-MM-dd"), statementDate = statement.ToString("yyyy-MM-dd"), dueDate = due.ToString("yyyy-MM-dd"), purchases = M(purchases), refunds = M(refunds), statementAmount = M(billed), repaid = M(repaid), postStatementCredits = M(otherCredits), remaining = M(remaining), unbilled = M(Math.Max(0, current - remaining)) };
    }
}






