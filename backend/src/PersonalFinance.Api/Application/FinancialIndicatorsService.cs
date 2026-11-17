using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> FinancialSummary(string user)
    {
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)); var month = now.ToString("yyyy-MM"); var (start, end) = Month(month); var (income, expense) = await Totals(user, Range(user, start, end, "CNY"));
        var budget = await db.Budgets.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Month == month); var carry = await CarryAmount(user, month);
        var goals = await db.Set<SavingsGoal>().AsNoTracking().Where(x => x.UserId == user && x.State == "Active" && x.Currency == "CNY").OrderBy(x => x.Priority).ThenBy(x => x.Id).Take(20).ToArrayAsync();
        var ids = goals.Select(g => g.Id).ToArray(); var reserved = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.GoalId)).GroupBy(x => x.GoalId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var today = DateOnly.FromDateTime(now.DateTime); var until = today.AddDays(7);
        var plans = await db.Set<FutureCashFlowItem>().AsNoTracking().Where(x => x.UserId == user && x.State == "Planned" && x.ScenarioId == null && x.ExpectedDate >= today && x.ExpectedDate < until).OrderBy(x => x.ExpectedDate).ThenBy(x => x.Id).Take(10).ToArrayAsync();
        return new { currency = "CNY", month, budgetRemaining = budget == null ? null : M(budget.Total + carry - expense), savingsRate = income > 0 ? M((income - expense) / income * 100) : null, goals = goals.Select(g => GoalView(g, reserved.GetValueOrDefault(g.Id))), emergencyCoverage = (string?)null, emergencyScope = "请在应急分析中明确选择储备目标与支出范围", upcoming = plans.Select(x => new { x.Id, x.Name, x.ExpectedDate, x.Currency, x.Type, amount = M(x.Amount) }), recurring = await PlanningSummary(user) };
    }
    public async Task<object> EssentialPolicies(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<EssentialExpensePolicy>().AsNoTracking().Where(x => x.UserId == user);
        var rows = await q.OrderBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.CategoryId, x.TransactionId, x.Necessity, essentialRate = M(x.EssentialRate), x.Excluded, x.Note, version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveEssentialPolicy(string user, EssentialPolicyInput input, string? version)
    {
        Require((input.CategoryId == null) != (input.TransactionId == null) && input.Necessity is "Essential" or "Adjustable" or "Optional" && input.Note is { Length: <= 2000 }, "必要支出规则无效");
        var rate = Money(input.EssentialRate); Require(rate is >= 0 and <= 100 && (input.Necessity != "Optional" || rate == 0), "必要支出分摊比例无效");
        if (input.CategoryId != null) await Category(user, input.CategoryId, "Expense", true);
        if (input.TransactionId != null) { var t = await Transaction(user, input.TransactionId); Require(t.Type == "Expense" && t.Status != "Deleted", "交易覆盖仅允许有效消费；退款继承原消费规则"); }
        var row = input.Id == null ? new EssentialExpensePolicy { UserId = user } : await db.Set<EssentialExpensePolicy>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == input.Id) ?? throw new ApiException(404, "规则不存在");
        Require(!await db.Set<EssentialExpensePolicy>().AnyAsync(x => x.UserId == user && x.Id != row.Id && (input.CategoryId != null && x.CategoryId == input.CategoryId || input.TransactionId != null && x.TransactionId == input.TransactionId)), "该分类或交易已有规则，请编辑原规则");
        if (input.Id == null) { Require(version == "0", "新规则版本应为0"); db.Add(row); } else { Version(row, version); row.Version++; }
        row.CategoryId = input.CategoryId; row.TransactionId = input.TransactionId; row.Necessity = input.Necessity; row.EssentialRate = rate; row.Excluded = input.Excluded; row.Note = input.Note; row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    private static (DateTimeOffset start, DateTimeOffset end) IndicatorRange(IQueryCollection query)
    {
        if (query["start"].Count > 0)
        {
            Require(DateOnly.TryParseExact(query["start"], "yyyy-MM-dd", out var s) && DateOnly.TryParseExact(query["end"], "yyyy-MM-dd", out _), "日期格式应为yyyy-MM-dd");
            var e = DateOnly.ParseExact(query["end"]!, "yyyy-MM-dd"); Require(s.Year >= 1900 && e.Year <= 9998, "分析日期必须为1900至9998年"); var start = new DateTimeOffset(s.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)); var end = new DateTimeOffset(e.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)).AddDays(1);
            Require(s.Year >= 1900 && e.Year <= 9998 && end > start, "分析范围无效"); return (start, end);
        }
        Require(int.TryParse(query["months"], out var months) && months is 3 or 6 or 12, "请选择最近3、6或12个完整自然月");
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)); var last = new DateTimeOffset(new DateTime(now.Year, now.Month, 1), TimeSpan.FromHours(8)); return (last.AddMonths(-months), last);
    }
    public async Task<object> EmergencyFund(string user, IQueryCollection query)
    {
        var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种"); var (start, end) = IndicatorRange(query);
        var ids = query["goalIds"].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries); Require(ids.Length is > 0 and <= 100 && ids.Distinct().Count() == ids.Length, "请明确选择应急目标（最多100个）");
        var goals = await db.Set<SavingsGoal>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.Id) && x.Type == "Emergency" && x.Currency == currency && x.State != "Cancelled").ToArrayAsync(); Require(goals.Length == ids.Length, "应急目标币种、状态或归属无效");
        var policies = await db.Set<EssentialExpensePolicy>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync(); var categoryPolicies = policies.Where(x => x.CategoryId != null).ToDictionary(x => x.CategoryId!); var overrides = policies.Where(x => x.TransactionId != null).ToDictionary(x => x.TransactionId!);
        var rules = await Rules(user); var range = Range(user, start, end.AddTicks(-1), currency);
        var amounts = await (from e in StatisticalExpenses(range, rules) join t in range on e.TransactionId equals t.Id group e by new { TransactionId = t.OriginalTransactionId ?? t.Id, e.CategoryId } into g select new { g.Key.TransactionId, g.Key.CategoryId, Amount = g.Sum(x => x.Amount) }).ToArrayAsync();
        decimal necessary = 0, excluded = 0, unspecified = 0; var details = new List<object>();
        foreach (var row in amounts)
        {
            var p = overrides.GetValueOrDefault(row.TransactionId) ?? (row.CategoryId == null ? null : categoryPolicies.GetValueOrDefault(row.CategoryId));
            var rate = p?.EssentialRate ?? 0; var included = p?.Excluded != true ? decimal.Round(row.Amount * rate / 100, 2, MidpointRounding.ToEven) : 0;
            necessary += included; if (p?.Excluded == true) excluded += row.Amount; if (p == null) unspecified += row.Amount;
            details.Add(new { row.TransactionId, row.CategoryId, amount = M(row.Amount), necessary = M(included), policyId = p?.Id, excluded = p?.Excluded ?? false });
        }
        var months = ReportPeriods(start, end.AddTicks(-1), "month").Count;
        decimal equivalentMonths = 0; var localStart = start.ToOffset(TimeSpan.FromHours(8));
        for (var cursor = new DateTimeOffset(new DateTime(localStart.Year, localStart.Month, 1), TimeSpan.FromHours(8)); cursor < end; cursor = cursor.AddMonths(1))
        {
            var next = cursor.AddMonths(1); var left = cursor < start ? start : cursor; var right = next > end ? end : next;
            equivalentMonths += (decimal)(right - left).TotalDays / DateTime.DaysInMonth(cursor.Year, cursor.Month);
        }
        var average = necessary > 0 ? necessary / equivalentMonths : 0;
        var allocations = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync(); var balances = (await Accounts(user)).Select(x => JsonSerializer.SerializeToNode(x, Json)!).ToDictionary(x => x["id"]!.GetValue<string>());
        decimal reserved = 0, available = 0;
        foreach (var g in allocations.Where(x => ids.Contains(x.GoalId)).GroupBy(x => x.AccountId))
        {
            var amount = g.Sum(x => x.Amount); var all = allocations.Where(x => x.AccountId == g.Key).Sum(x => x.Amount); var a = balances[g.Key]; var balance = Math.Max(0, PlanningDecimal(a["balance"]!.GetValue<string>()));
            var liquid = AccountKinds.IsLiquid(a["type"]!.GetValue<string>()) && a["status"]!.GetValue<string>() == "Active";
            reserved += amount; if (liquid) available += all <= balance ? amount : decimal.Floor(balance * amount / all * 100) / 100;
        }
        var (page, size) = Paging(query);
        return new { currency, start = start.ToString("yyyy-MM-dd"), endExclusive = end.ToString("yyyy-MM-dd"), months, equivalentMonths = M(equivalentMonths), necessaryExpense = M(necessary), averageMonthly = M(average), reserved = M(reserved), availableReserve = M(available), shortage = M(Math.Max(0, reserved - available)), coverageMonths = average > 0 ? M(available / average) : null, excludedExpense = M(excluded), unspecifiedExpense = M(unspecified), details = new { items = details.Skip((page - 1) * size).Take(size), total = details.Count, page, pageSize = size }, assumptions = "仅所选应急目标；分类默认不指定必要性。消费级覆盖优先，退款继承原消费规则。异常支出可排除；预留不足按同账户所有目标预留比例折减。平均值包含无支出月份；自定义范围按各自然月天数折算月数。分摊净费用逐项取两位小数，覆盖月数使用未截断的平均值。" };
    }
    public async Task<object> SavingsRate(string user, IQueryCollection query)
    {
        var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种"); var (start, end) = IndicatorRange(query); var range = Range(user, start, end.AddTicks(-1), currency); var (income, expense) = await Totals(user, range); var rules = await Rules(user);
        var (page, size) = Paging(query); var transactions = await range.Where(x => x.Entries.Any(e => e.Kind == "Expense" || e.Kind == "Income")).OrderByDescending(x => x.OccurredAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.Type, x.OccurredAt }).ToArrayAsync();
        return new { currency, start = start.ToString("yyyy-MM-dd"), endExclusive = end.ToString("yyyy-MM-dd"), income = M(income), expense = M(expense), surplus = M(income - expense), savingsRate = income > 0 ? M((income - expense) / income * 100) : null, formula = SavingsFormula, rules.IncludeFees, rules.IncludeAssetLoss, rules.IncludeDecreasingAdjustments, details = new { items = transactions, total = await range.CountAsync(x => x.Entries.Any(e => e.Kind == "Expense" || e.Kind == "Income")), page, pageSize = size } };
    }
}




