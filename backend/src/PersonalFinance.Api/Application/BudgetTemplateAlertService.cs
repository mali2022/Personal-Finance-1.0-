using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> BudgetCopy(string user, BudgetCopyInput input, bool apply, string? version)
    {
        Month(input.SourceMonth); Month(input.TargetMonth); Require(input.SourceMonth != input.TargetMonth, "来源与目标月份应不同");
        var source = await db.Budgets.Include(x => x.Items).SingleOrDefaultAsync(x => x.UserId == user && x.Month == input.SourceMonth) ?? throw new ApiException(404, "来源预算不存在"); Version(source, input.SourceVersion);
        var draft = new BudgetInput(M(source.Total), source.Items.Select(x => new BudgetLineInput(x.CategoryId, M(x.Limit))).ToArray()); await ValidateBudgetDraft(user, draft);
        if (!apply) return new { draft, before = await Budget(user, input.TargetMonth), sourceVersion = source.Version.ToString() };
        Require(version == input.TargetVersion && !string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请提交目标版本和复制原因");
        return await SaveBudget(user, input.TargetMonth, draft, input.TargetVersion, input.Reason);
    }
    private async Task ValidateBudgetDraft(string user, BudgetInput input)
    {
        if (input is null || input.Items is null) throw new ApiException(422, "预算草稿明细无效");
        var total = Money(input.Total); Require(total >= 0 && input.Items.Length <= 100, "预算草稿无效");
        Require(input.Items.Select(x => x.CategoryId).Distinct().Count() == input.Items.Length && input.Items.All(x => Money(x.Limit) >= 0) && input.Items.Sum(x => Money(x.Limit)) <= total, "分类预算重复或超过总额");
        var cats = new List<Category>(); foreach (var line in input.Items) cats.Add(await Category(user, line.CategoryId, "Expense", false));
        Require(!new CategoryHierarchy(await Categories(user)).Overlaps(cats.Select(c => c.Id)), "不能同时设置祖先及下级分类预算");
    }
    public async Task<object> SaveBudgetTemplate(string user, string? id, BudgetTemplateInput input, string? version)
    {
        Require(!string.IsNullOrWhiteSpace(input.Name) && input.Name.Length <= 150 && input.State is "Active" or "Archived", "模板名称或状态无效");
        await ValidateBudgetDraft(user, input.Budget);
        var row = id == null ? new BudgetTemplate { UserId = user } : await db.Set<BudgetTemplate>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "模板不存在");
        if (id == null) { Require(version == "0", "新模板版本应为0"); db.Add(row); } else { Version(row, version); row.Version++; }
        Require(!await db.Set<BudgetTemplate>().AnyAsync(x => x.UserId == user && x.Name == input.Name.Trim() && x.Id != row.Id), "模板名称重复");
        row.Name = input.Name.Trim(); row.State = input.State; row.BudgetJson = JsonSerializer.Serialize(input.Budget, Json); row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    public async Task<object> BudgetTemplates(string user, IQueryCollection query)
    {
        var q = db.Set<BudgetTemplate>().AsNoTracking().Where(x => x.UserId == user); var (page, size) = Paging(query);
        var rows = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Name, x.State, budget = JsonSerializer.Deserialize<BudgetInput>(x.BudgetJson, Json), version = x.Version.ToString(), x.CreatedAt, x.UpdatedAt }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> TemplatePreview(string user, string id, TemplateApply input)
    {
        Month(input.Month); var row = await db.Set<BudgetTemplate>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "模板不存在"); Version(row, input.TemplateVersion); Require(row.State == "Active", "模板已归档");
        var draft = JsonSerializer.Deserialize<BudgetInput>(row.BudgetJson, Json)!; await ValidateBudgetDraft(user, draft);
        return new { row.Id, templateVersion = row.Version.ToString(), before = await Budget(user, input.Month), draft, requiresConfirmation = true };
    }
    public async Task<object> TemplateConfirm(string user, string id, TemplateApply input, string? version)
    {
        Require(version == input.TemplateVersion && !string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请提交模板版本和应用原因");
        var row = await db.Set<BudgetTemplate>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "模板不存在"); Version(row, input.TemplateVersion); Require(row.State == "Active", "模板已归档");
        return await SaveBudget(user, input.Month, JsonSerializer.Deserialize<BudgetInput>(row.BudgetJson, Json)!, input.MonthlyVersion, input.Reason);
    }
    public async Task<object> AlertSettings(string user)
    {
        var row = await db.Set<BudgetAlertSetting>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user);
        return new { thresholds = JsonSerializer.Deserialize<int[]>(row?.ThresholdsJson ?? "[70,90,100]"), enabled = row?.Enabled ?? true, silent = row?.Silent ?? false, version = row?.Version.ToString() ?? "0" };
    }
    public async Task<object> SaveAlertSettings(string user, BudgetAlertInput input, string? version)
    {
        if (input.Thresholds is null) throw new ApiException(422, "请提供预警阈值");
        Require(input.Thresholds.Length is > 0 and <= 20 && input.Thresholds.All(x => x is >= 1 and <= 1000) && input.Thresholds.Distinct().Count() == input.Thresholds.Length, "阈值应为1至1000的整数百分比，最多20项");
        var row = await db.Set<BudgetAlertSetting>().SingleOrDefaultAsync(x => x.UserId == user);
        if (row == null) { if (version != "0") throw new ApiException(409, "预警设置版本冲突", "VERSION_CONFLICT"); row = new() { UserId = user }; db.Add(row); } else { Version(row, version); row.Version++; }
        row.ThresholdsJson = JsonSerializer.Serialize(input.Thresholds.Order()); row.Enabled = input.Enabled; row.Silent = input.Silent; row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    public async Task<object> EvaluateBudgetAlerts(string user, string month)
    {
        Month(month); var setting = await db.Set<BudgetAlertSetting>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user); if (setting?.Enabled == false) return new { created = 0 };
        var budget = await db.Budgets.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Month == month); if (budget == null) return new { created = 0 };
        var (start, end) = Month(month); var used = (await Totals(user, Range(user, start, end, "CNY"))).expense; var effective = budget.Total + await CarryAmount(user, month); if (effective <= 0) return new { created = 0 };
        var thresholds = JsonSerializer.Deserialize<int[]>(setting?.ThresholdsJson ?? "[70,90,100]")!;
        var existing = await db.Set<BudgetAlertState>().Where(x => x.UserId == user && x.BudgetId == budget.Id).Select(x => x.Threshold).ToArrayAsync(); var created = 0;
        foreach (var t in thresholds.Where(t => used * 100 >= effective * t && !existing.Contains(t)))
        { db.Add(new BudgetAlertState { UserId = user, BudgetId = budget.Id, Month = month, Threshold = t, Used = used, EffectiveBudget = effective, Silent = setting?.Silent ?? false }); created++; }
        return new { created };
    }
    public async Task<object> BudgetAlerts(string user, IQueryCollection query)
    {
        var q = db.Set<BudgetAlertState>().AsNoTracking().Where(x => x.UserId == user); var (page, size) = Paging(query);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Month, x.Threshold, used = M(x.Used), effectiveBudget = M(x.EffectiveBudget), x.Silent, x.Dismissed, x.CreatedAt, version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> DismissBudgetAlert(string user, string id, string? version)
    {
        var row = await db.Set<BudgetAlertState>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "预警不存在"); Version(row, version); row.Dismissed = true; row.Version++; return new { row.Id, version = row.Version.ToString() };
    }
}
