using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static string CarrySnapshot(BudgetCarryover row) => JsonSerializer.Serialize(new { row.SourceMonth, row.TargetMonth, row.CategoryId, amount = M(row.Amount), row.Rule, parameter = M(row.Parameter), cap = row.Cap.HasValue ? M(row.Cap.Value) : null, row.CarryOverspend, row.State }, Json);
    public async Task<object> PlanningBudgetHistory(string user, string id, IQueryCollection query)
    {
        Require(await db.Budgets.AnyAsync(x => x.UserId == user && x.Id == id) || await db.Set<AnnualBudget>().AnyAsync(x => x.UserId == user && x.Id == id) || await db.Set<BudgetCarryover>().AnyAsync(x => x.UserId == user && x.Id == id), "规划预算资源不存在");
        var q = db.Set<BudgetChangeHistory>().AsNoTracking().Where(x => x.UserId == user && x.BudgetId == id); var (page, size) = Paging(query);
        return new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.BeforeJson, x.AfterJson, x.Reason, x.Source, x.BeforeVersion, x.AfterVersion, x.CreatedAt }).ToArrayAsync(), total = await q.CountAsync(), page, pageSize = size };
    }
    private async Task<decimal> CarryAmount(string user, string month, string? category = null)
        => await db.Set<BudgetCarryover>().Where(x => x.UserId == user && x.TargetMonth == month && x.State == "Confirmed" && (category == null || x.CategoryId == category)).SumAsync(x => (decimal?)x.Amount) ?? 0;
    public async Task<object> CarryPreview(string user, CarryoverInput input)
    {
        var (start, end) = Month(input.SourceMonth); var (target, _) = Month(input.TargetMonth);
        Require(start.AddMonths(1) == target, "结转仅限相邻自然月");
        var now = DateTimeOffset.UtcNow; var provisional = end >= now;
        var b = await db.Budgets.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.UserId == user && x.Month == input.SourceMonth) ?? throw new ApiException(404, "来源预算不存在");
        var rules = await Rules(user); var range = Range(user, start, end, "CNY");
        decimal basis, used, incoming;
        if (input.CategoryId is null)
        {
            basis = b.Total; used = (await Totals(user, range)).expense; incoming = await CarryAmount(user, input.SourceMonth);
        }
        else
        {
            var sourceCategoryIds = b.Items.Select(x => x.CategoryId).ToArray();
            Require(!new CategoryHierarchy(await Categories(user)).Overlaps(sourceCategoryIds), "历史来源预算存在祖先与下级重叠，请先人工调整，不能按分类结转");
            var line = b.Items.SingleOrDefault(x => x.CategoryId == input.CategoryId); Require(line != null, "来源预算没有该分类额度");
            var ids = new CategoryHierarchy(await Categories(user)).Descendants(input.CategoryId);
            basis = line!.Limit; used = await StatisticalExpenses(range, rules).Where(e => ids.Contains(e.CategoryId!)).SumAsync(e => (decimal?)e.Amount) ?? 0; incoming = await CarryAmount(user, input.SourceMonth, input.CategoryId);
        }
        var amount = PlanningMath.Carryover(basis + incoming - used, input.Rule, Money(input.Parameter), input.Cap == null ? null : Money(input.Cap), input.CarryOverspend);
        var versions = await range.OrderBy(x => x.Id).Select(x => new { x.Id, x.Version }).ToArrayAsync();
        var incomingVersions = await db.Set<BudgetCarryover>().AsNoTracking().Where(x => x.UserId == user && x.TargetMonth == input.SourceMonth).OrderBy(x => x.Id).Select(x => new { x.Id, x.Version, x.State }).ToArrayAsync();
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { budgetVersion = b.Version, basis, used, incoming, versions, incomingVersions, rulesVersion = rules.Version, rules.IncludeFees, rules.IncludeAssetLoss, rules.IncludeDecreasingAdjustments, input.SourceMonth, input.TargetMonth, input.CategoryId, input.Rule, input.Parameter, input.Cap, input.CarryOverspend }, Json))));
        return new { input.SourceMonth, input.TargetMonth, input.CategoryId, baseBudget = M(basis), incoming = M(incoming), used = M(used), remaining = M(basis + incoming - used), amount = M(amount), fingerprint, provisional, sourceVersion = b.Version.ToString(), target = await Budget(user, input.TargetMonth), scope = provisional ? "来源月未结束，仅保存待确认安排，不计入有效预算；月底后须重新预览并人工确认，可在生效前取消。" : "只改变预算额度；负向结转可使有效预算为负，此时显示超支，不计算执行率。" };
    }
    public async Task<object> CarryApply(string user, CarryoverInput input, string? version, string? correctionId = null)
    {
        Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请填写结转原因");
        Require(version == input.TargetVersion, "目标预算版本请求头无效");
        var preview = JsonSerializer.SerializeToNode(await CarryPreview(user, input), Json)!;
        if (input.Fingerprint != preview["fingerprint"]!.GetValue<string>()) throw new ApiException(409, "来源预算或费用已变化，请重新预览", "VERSION_CONFLICT");
        var target = await db.Budgets.Include(x => x.Items).SingleOrDefaultAsync(x => x.UserId == user && x.Month == input.TargetMonth) ?? throw new ApiException(404, "请先创建目标月份基础预算");
        Version(target, version);
        var existing = await db.Set<BudgetCarryover>().Where(x => x.UserId == user && x.SourceMonth == input.SourceMonth && x.TargetMonth == input.TargetMonth).ToArrayAsync();
        Require(!existing.Any(x => x.Id != correctionId && (x.State == "Confirmed" || x.State == "Scheduled") && (input.CategoryId == null || x.CategoryId == null || x.CategoryId == input.CategoryId)), "同一范围不能重复结转，总额结转与分类结转不能同时使用");
        if (input.CategoryId != null) Require(target.Items.Any(x => x.CategoryId == input.CategoryId), "目标月份必须已有相同分类额度");
        var row = existing.SingleOrDefault(x => x.CategoryId == input.CategoryId);
        if (row == null) { row = new() { UserId = user, SourceMonth = input.SourceMonth, TargetMonth = input.TargetMonth, CategoryId = input.CategoryId }; db.Add(row); }
        else { Require(row.State == "Cancelled" || row.Id == correctionId, "该结转已经确认"); row.Version++; }
        var before = CarrySnapshot(row);
        row.Amount = PlanningDecimal(preview["amount"]!.GetValue<string>()); row.Rule = input.Rule; row.Parameter = Money(input.Parameter); row.Cap = input.Cap == null ? null : Money(input.Cap); row.CarryOverspend = input.CarryOverspend; row.SourceFingerprint = input.Fingerprint!; row.Reason = input.Reason; row.State = preview["provisional"]!.GetValue<bool>() ? "Scheduled" : "Confirmed"; row.UpdatedAt = DateTimeOffset.UtcNow;
        db.Add(new BudgetChangeHistory { UserId = user, BudgetId = row.Id, BeforeJson = before, AfterJson = CarrySnapshot(row), Reason = input.Reason, Source = "Carryover", BeforeVersion = row.Version == 1 ? 0 : row.Version - 1, AfterVersion = row.Version });
        // Increment the target version so another preview cannot apply against a stale envelope.
        target.Version++;
        return new { row.Id, row.State, amount = M(row.Amount), version = row.Version.ToString(), budgetVersion = target.Version.ToString() };
    }
    public async Task<object> CorrectCarry(string user, string id, CarryoverInput input, string? version)
    {
        var row = await db.Set<BudgetCarryover>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "结转不存在"); Version(row, version);
        Require(row.State is "Confirmed" or "Scheduled" && row.SourceMonth == input.SourceMonth && row.TargetMonth == input.TargetMonth && row.CategoryId == input.CategoryId, "更正必须保留原来源、目标及分类");
        Require(!await db.Set<BudgetCarryover>().AnyAsync(x => x.UserId == user && x.SourceMonth == row.TargetMonth && x.State == "Confirmed"), "目标月份已继续结转，不能单独更正上游；请先核对整个链条");
        return await CarryApply(user, input, input.TargetVersion, id);
    }
    public async Task<object> CancelCarry(string user, string id, PlanningAction input, string? version)
    {
        var row = await db.Set<BudgetCarryover>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "结转不存在"); Version(row, version);
        var (start, _) = Month(row.TargetMonth); Require(start > DateTimeOffset.UtcNow && row.State is "Confirmed" or "Scheduled" && input.Action == "Cancel", "只能取消尚未生效的结转");
        Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请填写取消原因");
        var before = CarrySnapshot(row); var beforeVersion = row.Version;
        row.State = "Cancelled"; row.Reason = input.Reason; row.Version++; row.UpdatedAt = DateTimeOffset.UtcNow;
        db.Add(new BudgetChangeHistory { UserId = user, BudgetId = row.Id, BeforeJson = before, AfterJson = CarrySnapshot(row), Reason = input.Reason, Source = "Carryover", BeforeVersion = beforeVersion, AfterVersion = row.Version });
        var target = await db.Budgets.SingleAsync(x => x.UserId == user && x.Month == row.TargetMonth); target.Version++;
        return new { row.Id, version = row.Version.ToString() };
    }
    public async Task<object> CarryHistory(string user, IQueryCollection query)
    {
        var q = db.Set<BudgetCarryover>().AsNoTracking().Where(x => x.UserId == user); var (page, size) = Paging(query);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.SourceMonth, x.TargetMonth, x.CategoryId, amount = M(x.Amount), x.Rule, parameter = M(x.Parameter), cap = x.Cap.HasValue ? M(x.Cap.Value) : null, x.CarryOverspend, x.State, x.Reason, x.CreatedAt, version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
}


