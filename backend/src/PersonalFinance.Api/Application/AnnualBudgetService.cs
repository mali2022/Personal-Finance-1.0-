using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static string AnnualSnapshot(AnnualBudget row) => JsonSerializer.Serialize(new { row.Year, row.Currency, total = M(row.Total), row.State, allocations = row.Allocations.Select(a => new { a.Month, a.CategoryId, amount = M(a.Amount) }) }, Json);
    public async Task<object> AnnualBudgetList(string user, IQueryCollection query)
    {
        var q = db.Set<AnnualBudget>().AsNoTracking().Where(x => x.UserId == user); var (page, size) = Paging(query);
        var rows = await q.OrderByDescending(x => x.Year).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Year, x.Currency, total = M(x.Total), x.State, version = x.Version.ToString(), x.CreatedAt, x.UpdatedAt }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> AnnualHistorySuggestion(string user, int year, string total)
    {
        var start = PlanningYearStart(year - 1); var points = await AggregateReportPoints(user, start, start.AddYears(1).AddTicks(-1), "CNY", "month", null); var value = Money(total);
        var weights = points.Select(p => Math.Max(0, PlanningDecimal(p.Expense))).ToArray(); var amounts = PlanningMath.WeightedMonths(value, weights);
        return new { sourceYear = year - 1, currency = "CNY", allocations = amounts.Select((amount, i) => new { month = i + 1, categoryId = (string?)null, amount = M(amount) }), scope = "上一年净费用，负净费用按0权重；无历史费用则平均分配。仅草稿，不写入月度预算。" };
    }
    private static DateTimeOffset PlanningYearStart(int year)
    {
        Require(year is >= 1900 and <= 9998, "年度无效");
        return new(new DateTime(year, 1, 1), TimeSpan.FromHours(8));
    }
    public Task<object> AnnualBudgetDetail(string user, int year) => AnnualBudgetDetailCore(user, year);

    private async Task<object> AnnualBudgetDetailCore(string user, int year,
        List<ReportPoint>? knownPoints = null, (decimal income, decimal expense)? knownTotals = null)
    {
        var start = PlanningYearStart(year); var end = start.AddYears(1).AddTicks(-1);
        var b = await db.Set<AnnualBudget>().AsNoTracking().Include(x => x.Allocations).SingleOrDefaultAsync(x => x.UserId == user && x.Year == year);
        var points = knownPoints ?? await AggregateReportPoints(user, start, end, "CNY", "month", null);
        var totals = knownTotals ?? await Totals(user, Range(user, start, end, "CNY"));
        var cats = await Categories(user);
        var expenseSums = await CategoryExpenseSums(Range(user, start, end, "CNY"), await Rules(user));
        var monthly = await db.Budgets.AsNoTracking().Where(x => x.UserId == user && x.Month.CompareTo(year + "-01") >= 0 && x.Month.CompareTo(year + "-12") <= 0).Select(x => new { x.Month, x.Total, x.Version }).ToArrayAsync();
        return new
        {
            id = b?.Id, year, currency = "CNY", total = M(b?.Total ?? 0), used = M(totals.expense), remaining = M((b?.Total ?? 0) - totals.expense),
            executionPercent = b?.Total > 0 ? M(totals.expense / b.Total * 100) : null,
            state = b?.State ?? "Missing", version = b?.Version.ToString() ?? "0", b?.CreatedAt, b?.UpdatedAt,
            allocations = (b?.Allocations ?? []).Select(a =>
            {
                var used = expenseSums.Where(e => a.CategoryId != null && new CategoryHierarchy(cats).Contains(a.CategoryId, e.Id)).Sum(e => e.Amount);
                return new { a.Month, a.CategoryId, amount = M(a.Amount), used = a.Month == 0 ? M(used) : null, remaining = a.Month == 0 ? M(a.Amount - used) : null, executionPercent = a.Month == 0 && a.Amount > 0 ? M(used / a.Amount * 100) : null, breakdown = a.Month == 0 ? expenseSums.Where(e => a.CategoryId != null && new CategoryHierarchy(cats).Contains(a.CategoryId, e.Id)).Select(e => new { categoryId = e.Id, used = M(e.Amount) }).ToArray() : [] };
            }),
            months = points.Select((p, i) => new { month = i + 1, allocated = M(b?.Allocations.Where(a => a.Month == i + 1 && a.CategoryId == null).Sum(a => a.Amount) ?? 0), used = p.Expense, monthlyBudget = M(monthly.SingleOrDefault(m => m.Month == p.Period)?.Total ?? 0), monthlyVersion = monthly.SingleOrDefault(m => m.Month == p.Period)?.Version.ToString() ?? "0" }),
            scope = "CNY；沿用正式统计规则，退款冲减费用；年度与月度额度不相加。分类包络与月份包络分别受年度总额约束。"
        };
    }
    public async Task<object> SaveAnnualBudget(string user, int year, AnnualBudgetInput input, string? version)
    {
        if (input.Allocations is null) throw new ApiException(422, "请提供年度分配明细");
        PlanningYearStart(year); var total = Money(input.Total);
        Require(total >= 0 && input.Currency == "CNY" && input.State is "Active" or "Archived", "年度预算金额、币种或状态无效");
        Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请填写调整原因（最多2000字）");
        Require(input.Allocations.Length <= 1300 && input.Allocations.All(a => a.Month is >= 0 and <= 12 && (a.Month != 0 || a.CategoryId != null) && Money(a.Amount) >= 0), "月份或分类分配无效");
        Require(input.Allocations.Select(a => (a.Month, a.CategoryId)).Distinct().Count() == input.Allocations.Length, "分配不能重复");
        var categoryIds = input.Allocations.Where(a => a.CategoryId != null).Select(a => a.CategoryId!).Distinct().ToArray();
        Require(categoryIds.Length <= 100, "分类最多100项");
        var cats = new List<Category>(); foreach (var id in categoryIds) cats.Add(await Category(user, id, "Expense", false));
        foreach (var group in input.Allocations.Where(a => a.CategoryId != null).GroupBy(a => a.Month))
        {
            var ids = group.Select(a => a.CategoryId).ToHashSet();
            Require(!new CategoryHierarchy(await Categories(user)).Overlaps(ids.Select(x => x!)), "同一分配期不能同时设置祖先及下级分类");
            var envelope = group.Key == 0 ? total : input.Allocations.Where(a => a.Month == group.Key && a.CategoryId == null).Sum(a => Money(a.Amount));
            Require(group.Sum(a => Money(a.Amount)) <= envelope, "分类额度超过该期总额度");
        }
        Require(input.Allocations.Where(a => a.Month > 0 && a.CategoryId == null).Sum(a => Money(a.Amount)) == total, "12个月总额度必须等于年度总额");
        var b = await db.Set<AnnualBudget>().Include(x => x.Allocations).SingleOrDefaultAsync(x => x.UserId == user && x.Year == year);
        var before = b == null ? "{}" : AnnualSnapshot(b); var oldVersion = b?.Version ?? 0;
        if (b == null) { if (version != "0") throw new ApiException(409, "年度预算版本无效", "VERSION_CONFLICT"); b = new() { UserId = user, Year = year }; db.Add(b); }
        else { Version(b, version); db.RemoveRange(b.Allocations); b.Version++; }
        b.Total = total; b.State = input.State; b.UpdatedAt = DateTimeOffset.UtcNow;
        b.Allocations = input.Allocations.Select(a => new AnnualBudgetAllocation { AnnualBudgetId = b.Id, Month = a.Month, CategoryId = a.CategoryId, Amount = Money(a.Amount) }).ToList();
        db.Add(new BudgetChangeHistory { UserId = user, BudgetId = b.Id, BeforeJson = before, AfterJson = AnnualSnapshot(b), Reason = input.Reason, BeforeVersion = oldVersion, AfterVersion = b.Version });
        return new { b.Id, version = b.Version.ToString() };
    }
    public async Task<object> AnnualHistory(string user, int year, IQueryCollection query)
    {
        PlanningYearStart(year); var id = await db.Set<AnnualBudget>().Where(x => x.UserId == user && x.Year == year).Select(x => x.Id).SingleOrDefaultAsync();
        var q = db.Set<BudgetChangeHistory>().AsNoTracking().Where(x => x.UserId == user && x.BudgetId == id); var (page, size) = Paging(query);
        return new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(), total = await q.CountAsync(), page, pageSize = size };
    }
    private async Task<(AnnualBudget annual, BudgetInput draft)> AnnualMonthlyDraft(string user, int year, AnnualMonthlyApply input)
    {
        PlanningYearStart(year); Require(input.Month is >= 1 and <= 12, "月份无效");
        var b = await db.Set<AnnualBudget>().Include(x => x.Allocations).SingleOrDefaultAsync(x => x.UserId == user && x.Year == year) ?? throw new ApiException(404, "年度预算不存在");
        Version(b, input.AnnualVersion); Require(b.State == "Active", "归档年度预算不可应用");
        return (b, new BudgetInput(M(b.Allocations.Where(a => a.Month == input.Month && a.CategoryId == null).Sum(a => a.Amount)), b.Allocations.Where(a => a.Month == input.Month && a.CategoryId != null).Select(a => new BudgetLineInput(a.CategoryId!, M(a.Amount))).ToArray()));
    }
    public async Task<object> AnnualMonthlyPreview(string user, int year, AnnualMonthlyApply input)
    {
        var (b, draft) = await AnnualMonthlyDraft(user, year, input); var month = $"{year}-{input.Month:00}";
        return new { annualVersion = b.Version.ToString(), month, before = await Budget(user, month), draft, requiresConfirmation = true };
    }
    public async Task<object> AnnualMonthlyConfirm(string user, int year, AnnualMonthlyApply input)
    {
        var (_, draft) = await AnnualMonthlyDraft(user, year, input); Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请填写应用原因");
        return await SaveBudget(user, $"{year}-{input.Month:00}", draft, input.MonthlyVersion, input.Reason);
    }
}

