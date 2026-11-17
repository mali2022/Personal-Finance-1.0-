using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    // Only for strings produced by our own authoritative projections. Request amounts still use Money's input limits.
    private static decimal PlanningDecimal(string value) => decimal.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
    private async Task<SavingsGoal> Goal(string user, string id)
        => await db.Set<SavingsGoal>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "储蓄目标不存在");
    private static void GoalAllocatable(SavingsGoal g) => Require(g.State is "Planned" or "Active", "该状态的目标不能新增预留");
    public async Task<object> SaveGoal(string user, string? id, GoalInput input, string? version)
    {
        Require(!string.IsNullOrWhiteSpace(input.Name) && input.Name.Length <= 150 && input.Note is { Length: <= 2000 }, "目标名称或备注无效");
        Require(new[] { "Emergency", "Travel", "Renovation", "Car", "Home", "Education", "Electronics", "Other" }.Contains(input.Type) && CurrencyDefinitions.Supports(input.Currency), "目标类型或币种无效");
        Require(input.State is "Planned" or "Active" or "Completed" or "Paused" or "Cancelled" && input.Priority is >= 1 and <= 5 && input.StartDate.Year is >= 1900 and <= 9998 && input.TargetDate.Year <= 9998 && input.TargetDate >= input.StartDate && Money(input.MonthlySaving) >= 0, "目标日期、状态或计划金额无效");
        var target = Money(input.Target, true); var g = id == null ? new SavingsGoal { UserId = user } : await Goal(user, id);
        if (id == null) { Require(version == "0", "新目标版本应为0"); db.Add(g); } else
        {
            Version(g, version); var allocated = await db.Set<GoalAllocation>().Where(x => x.UserId == user && x.GoalId == id).SumAsync(x => (decimal?)x.Amount) ?? 0;
            Require(g.Currency == input.Currency || allocated == 0, "存在预留时不能修改目标币种");
            Require(input.State != "Cancelled" || allocated == 0, "请先释放或转移所有预留，再取消目标"); g.Version++;
        }
        g.Name = input.Name.Trim(); g.Type = input.Type; g.Target = target; g.Currency = input.Currency; g.StartDate = input.StartDate; g.TargetDate = input.TargetDate; g.MonthlySaving = Money(input.MonthlySaving); g.Priority = input.Priority; g.State = input.State; g.Note = input.Note; g.UpdatedAt = DateTimeOffset.UtcNow;
        return new { g.Id, version = g.Version.ToString() };
    }
    private async Task<object[]> ReservationAccounts(string user)
    {
        // Reuse the existing authoritative balance projection, including all active ledger entries.
        var values = (await Accounts(user)).Select(a => JsonSerializer.SerializeToNode(a, Json)!).ToArray();
        var allocated = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user).GroupBy(x => x.AccountId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        return values.Select(a => (object)new { id = a["id"]!.GetValue<string>(), name = a["name"]!.GetValue<string>(), type = a["type"]!.GetValue<string>(), currency = a["currency"]!.GetValue<string>(), balance = a["balance"]!.GetValue<string>(), version = a["version"]!.GetValue<string>(), status = a["status"]!.GetValue<string>(), reserved = M(allocated.GetValueOrDefault(a["id"]!.GetValue<string>())), available = M(Math.Max(0, PlanningDecimal(a["balance"]!.GetValue<string>()) - allocated.GetValueOrDefault(a["id"]!.GetValue<string>()))), shortage = M(Math.Max(0, allocated.GetValueOrDefault(a["id"]!.GetValue<string>()) - Math.Max(0, PlanningDecimal(a["balance"]!.GetValue<string>())))), eligible = AccountKinds.IsLiquid(a["type"]!.GetValue<string>()) }).ToArray();
    }
    private object GoalView(SavingsGoal g, decimal allocated)
    {
        var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        var remaining = Math.Max(0, g.Target - allocated); var months = Math.Max(1, (g.TargetDate.Year - today.Year) * 12 + g.TargetDate.Month - today.Month + (g.TargetDate.Day >= today.Day ? 1 : 0));
        var requiredMonths = g.MonthlySaving > 0 ? decimal.Ceiling(remaining / g.MonthlySaving) : (decimal?)null;
        DateOnly? estimated = requiredMonths is >= 0 and <= 1200 && today.Year + requiredMonths / 12 < 9999 ? today.AddMonths((int)requiredMonths.Value) : null;
        return new { g.Id, g.Name, g.Type, target = M(g.Target), g.Currency, g.StartDate, g.TargetDate, allocated = M(allocated), remaining = M(remaining), progress = M(allocated / g.Target * 100), monthlySaving = M(g.MonthlySaving), recommendedMonthly = M(decimal.Ceiling(remaining * 100 / months) / 100), estimatedCompletion = estimated, overdue = g.TargetDate < today && remaining > 0, g.Priority, g.State, g.Note, g.CreatedAt, g.UpdatedAt, version = g.Version.ToString() };
    }
    public async Task<object> Goals(string user, IQueryCollection query)
    {
        var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确目标币种");
        var q = db.Set<SavingsGoal>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency); var (page, size) = Paging(query);
        var rows = await q.OrderBy(x => x.Priority).ThenBy(x => x.TargetDate).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        var allocations = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user).GroupBy(x => x.GoalId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var totalTarget = await q.SumAsync(x => (decimal?)x.Target) ?? 0;
        var totalReserved = await (from a in db.Set<GoalAllocation>() join g in q on a.GoalId equals g.Id where a.UserId == user select (decimal?)a.Amount).SumAsync() ?? 0;
        return new { items = rows.Select(g => GoalView(g, allocations.GetValueOrDefault(g.Id))), total = await q.CountAsync(), active = await q.CountAsync(x => x.State == "Active"), completed = await q.CountAsync(x => x.State == "Completed"), target = M(totalTarget), reserved = M(totalReserved), currency, page, pageSize = size, accounts = await ReservationAccounts(user) };
    }
    public async Task<object> GoalDetail(string user, string id, IQueryCollection query)
    {
        var g = await Goal(user, id); var rows = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user && x.GoalId == id).ToArrayAsync();
        var h = db.Set<GoalAllocationHistory>().AsNoTracking().Where(x => x.UserId == user && x.GoalId == id); var (page, size) = Paging(query); var history = await h.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        var stateHistory = db.AuditRecords.AsNoTracking().Where(x => x.UserId == user && x.ResourceId == id && x.ResourceType == "SavingsGoal");
        return new { goal = GoalView(g, rows.Sum(x => x.Amount)), allocations = rows.Select(x => new { x.Id, x.AccountId, amount = M(x.Amount), version = x.Version.ToString() }), accounts = await ReservationAccounts(user), history = new { items = history.Select(x => new { x.Id, x.AccountId, x.ToGoalId, x.Action, before = M(x.Before), after = M(x.After), x.Reason, x.CreatedAt }), total = await h.CountAsync(), page, pageSize = size }, changes = new { items = await stateHistory.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.Action, x.ChangesJson, x.CreatedAt }).ToArrayAsync(), total = await stateHistory.CountAsync(), page, pageSize = size } };
    }
    private async Task<(SavingsGoal goal, Account account, decimal balance, decimal reserved, string fingerprint)> AllocationState(string user, string id, GoalAllocationInput input)
    {
        var g = await Goal(user, id); var a = await Account(user, input.AccountId, false); var balance = await Balance(user, a.Id);
        var allocations = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user && x.AccountId == a.Id).OrderBy(x => x.Id).ToArrayAsync();
        var reserved = allocations.Sum(x => x.Amount);
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { goalId = g.Id, goalVersion = g.Version, accountId = a.Id, accountVersion = a.Version, balance, allocations = allocations.Select(x => new { x.Id, x.Version, x.Amount }) }, Json))));
        return (g, a, balance, reserved, fingerprint);
    }
    public async Task<object> GoalAllocationPreview(string user, string id, GoalAllocationInput input)
    {
        var (g, a, balance, reserved, fingerprint) = await AllocationState(user, id, input); var amount = Money(input.Amount, true);
        var eligible = AccountKinds.IsLiquid(a.Type);
        return new { goalId = id, goalVersion = g.Version.ToString(), accountVersion = a.Version.ToString(), currency = a.Currency, balance = M(balance), reserved = M(reserved), available = M(Math.Max(0, balance - reserved)), amount = M(amount), shortage = M(Math.Max(0, reserved - Math.Max(0, balance))), allowed = eligible && a.Status == "Active" && a.Currency == g.Currency && g.State is "Planned" or "Active" && amount <= Math.Max(0, balance - reserved), fingerprint, scope = "用途预留，不是转账或新增资产；确认时重新读取实际余额。" };
    }
    private void AllocationHistory(string user, string goal, string account, string action, decimal before, decimal after, string reason, string? to = null)
        => db.Add(new GoalAllocationHistory { UserId = user, GoalId = goal, AccountId = account, Action = action, Before = before, After = after, Reason = reason, ToGoalId = to });
    public async Task<object> ChangeGoalAllocation(string user, string id, GoalAllocationInput input, string? version, bool release)
    {
        Require(!string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "请填写预留调整原因");
        var (g, a, balance, reserved, fingerprint) = await AllocationState(user, id, input); Version(g, version); Version(a, input.AccountVersion); var amount = Money(input.Amount, true);
        var row = await db.Set<GoalAllocation>().SingleOrDefaultAsync(x => x.UserId == user && x.GoalId == id && x.AccountId == a.Id);
        var before = row?.Amount ?? 0;
        if (release) Require(amount <= before, "释放金额超过已有预留");
        else
        {
            GoalAllocatable(g); Require(a.Status == "Active" && AccountKinds.IsLiquid(a.Type) && a.Currency == g.Currency, "账户状态、类型或币种不适合预留");
            if (input.Fingerprint != fingerprint) throw new ApiException(409, "账户余额或预留已变化，请重新预览", "VERSION_CONFLICT");
            Require(reserved + amount <= Math.Max(0, balance), "账户可分配余额不足");
        }
        if (row == null) { row = new() { UserId = user, GoalId = id, AccountId = a.Id }; db.Add(row); } else row.Version++;
        row.Amount = before + (release ? -amount : amount); row.UpdatedAt = DateTimeOffset.UtcNow; g.Version++; g.UpdatedAt = DateTimeOffset.UtcNow;
        AllocationHistory(user, id, a.Id, release ? "Release" : "Allocate", before, row.Amount, input.Reason);
        return new { g.Id, version = g.Version.ToString(), allocated = M(row.Amount), scope = "实际账户余额保持不变" };
    }
    public async Task<object> TransferGoalAllocation(string user, string id, GoalTransferInput input, string? version)
    {
        Require(id != input.ToGoalId && !string.IsNullOrWhiteSpace(input.Reason) && input.Reason.Length <= 2000, "目标或原因无效");
        var g = await Goal(user, id); var to = await Goal(user, input.ToGoalId); Version(g, version); Version(to, input.ToGoalVersion); GoalAllocatable(to);
        var a = await Account(user, input.AccountId, false); Version(a, input.AccountVersion); Require(g.Currency == to.Currency && a.Currency == to.Currency, "预留转移币种必须一致");
        var amount = Money(input.Amount, true); var from = await db.Set<GoalAllocation>().SingleOrDefaultAsync(x => x.UserId == user && x.GoalId == id && x.AccountId == a.Id); Require(from != null && from.Amount >= amount, "原目标预留不足");
        var dest = await db.Set<GoalAllocation>().SingleOrDefaultAsync(x => x.UserId == user && x.GoalId == to.Id && x.AccountId == a.Id);
        if (dest == null) { dest = new() { UserId = user, GoalId = to.Id, AccountId = a.Id }; db.Add(dest); } else dest.Version++;
        var before = from!.Amount; var toBefore = dest.Amount; from.Amount -= amount; dest.Amount += amount; from.Version++; from.UpdatedAt = dest.UpdatedAt = DateTimeOffset.UtcNow; g.Version++; to.Version++; g.UpdatedAt = to.UpdatedAt = DateTimeOffset.UtcNow;
        AllocationHistory(user, id, a.Id, "TransferOut", before, from.Amount, input.Reason, to.Id); AllocationHistory(user, to.Id, a.Id, "TransferIn", toBefore, dest.Amount, input.Reason, id);
        return new { g.Id, version = g.Version.ToString(), toGoalId = to.Id, toVersion = to.Version.ToString() };
    }
}


