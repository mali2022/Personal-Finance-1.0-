using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record PhysicalSnapshot(ManagedAsset[] Assets, PhysicalProfile[] Profiles, PhysicalValueRule[] Rules, ManagedAssetValuation[] Valuations, PhysicalEvent[] Events)
{
    public PhysicalValue Value(ManagedAsset a, DateOnly date) => PhysicalAssetMath.Calculate(a, Profiles.SingleOrDefault(x => x.AssetId == a.Id), Rules.Where(x => x.AssetId == a.Id), Valuations.Where(x => x.AssetId == a.Id), Events.Where(x => x.AssetId == a.Id), date);
}
public sealed partial class FinanceService
{
    public async Task<PhysicalSnapshot> LoadPhysicalSnapshot(string user) => new(
        await db.Set<ManagedAsset>().AsNoTracking().Where(x => x.UserId == user && x.Type != "TermDeposit").ToArrayAsync(),
        await db.Set<PhysicalProfile>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync(),
        await db.Set<PhysicalValueRule>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync(),
        await db.Set<ManagedAssetValuation>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync(),
        await db.Set<PhysicalEvent>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync());
    public async Task<object> PhysicalCenter(string user, IQueryCollection query)
    {
        var dateText = query["date"].ToString(); var date = AssetToday;
        if (dateText != "") { Require(DateOnly.TryParseExact(dateText, "yyyy-MM-dd", out date), "日期格式无效"); AssetDate(date); }
        var snapshot = await LoadPhysicalSnapshot(user);
        var categories = await db.Set<PhysicalCategory>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var links = await db.Set<PhysicalCostLink>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var tids = links.Select(x => x.TransactionId).ToArray();
        var transactions = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && tids.Contains(x.Id)).ToArrayAsync();
        var end = new DateTimeOffset(date.ToDateTime(TimeOnly.MaxValue), TimeSpan.FromHours(8));
        var entries = await db.Entries.AsNoTracking().Where(x => x.UserId == user && tids.Contains(x.TransactionId) && x.Kind == "Expense").ToArrayAsync();
        var search = query["search"].ToString(); var currency = query["currency"].ToString(); if (currency != "") AssetCurrency(currency);
        var assets = snapshot.Assets.Where(x => x.AcquiredDate <= date && (currency == "" || x.Currency == currency)).Where(a => {
            var p = snapshot.Profiles.SingleOrDefault(x => x.AssetId == a.Id);
            return (query["categoryId"].ToString() == "" || p?.CategoryId == query["categoryId"].ToString()) && (search == "" || string.Join(" ", a.Name, p?.Code, p?.Brand, p?.Model, p?.SerialNumber, p?.Location, p?.Holder, p?.Tags).Contains(search, StringComparison.OrdinalIgnoreCase));
        }).OrderBy(x => x.Name).ThenBy(x => x.Id).ToArray();
        var reminders = new List<object>();
        var rows = assets.Select(a => {
            var p = snapshot.Profiles.SingleOrDefault(x => x.AssetId == a.Id); var v = snapshot.Value(a, date);
            var active = v.Quantity > 0 && v.State != "Archived";
            var events = snapshot.Events.Where(x => x.AssetId == a.Id && x.Date <= date).ToArray();
            DateOnly Last(string kind) => events.Where(x => x.Kind == kind && !events.Any(r => r.Kind == "Reverse" && r.ReversesId == x.Id)).Select(x => x.Date).DefaultIfEmpty(a.AcquiredDate).Max();
            void Reminder(string kind, DateOnly due) { if (active && due <= date.AddDays(30)) reminders.Add(new { assetId = a.Id, a.Name, kind, due, overdue = due < date }); }
            if (p?.WarrantyUntil != null) Reminder("Warranty", p.WarrantyUntil.Value);
            if ((p?.MaintenanceDays ?? 180) > 0) Reminder("Maintenance", Last("Maintenance").AddDays(p?.MaintenanceDays ?? 180));
            if ((p?.InventoryDays ?? 365) > 0) Reminder("Inventory", Last("Inventory").AddDays(p?.InventoryDays ?? 365));
            Reminder("Valuation", (v.ValuationDate ?? a.AcquiredDate).AddDays(p?.StaleDays ?? 90));
            if (v.State == "Idle") Reminder("Idle", events.Where(x => x.Kind == "Idle" && !events.Any(r => r.ReversesId == x.Id)).Select(x => x.Date).DefaultIfEmpty(a.AcquiredDate).Max().AddDays(p?.IdleDays ?? 90));
            var costs = links.Where(x => x.AssetId == a.Id).Select(l => { var t = transactions.SingleOrDefault(x => x.Id == l.TransactionId); var valid = !l.Reversed && t is { Status: "Confirmed", Type: "Expense" } && t.Currency == a.Currency && t.OccurredAt <= end; return new { l.Id, l.TransactionId, l.Kind, l.Reason, l.Reversed, valid, date = t == null ? (DateOnly?)null : DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date), amount = valid ? entries.Where(x => x.TransactionId == l.TransactionId && x.Currency == a.Currency).Sum(x => x.Amount) : 0 }; }).ToArray();
            var usageCost = costs.Sum(x => x.amount); var depreciation = v.RemainingCost - v.BookValue;
            return new { a.Id, a.Name, a.Type, a.Currency, a.AcquiredDate, a.Note, a.AccountId, a.LiabilityAccountId, version = a.Version.ToString(), profile = p, value = v, categoryName = categories.SingleOrDefault(x => x.Id == p?.CategoryId)?.Name ?? "未分类", usageCost, depreciation, ownershipCost = usageCost + depreciation, retentionPercent = v.RemainingCost == 0 || v.Value == null ? (decimal?)null : PhysicalAssetMath.Round(v.Value.Value / v.RemainingCost * 100), costs, events = events.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt), rules = snapshot.Rules.Where(x => x.AssetId == a.Id).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt), valuations = snapshot.Valuations.Where(x => x.AssetId == a.Id).OrderByDescending(x => x.Date), anomalies = new[] { v.Value == null ? "缺少估值" : null, p?.CategoryId == null ? "未分类" : null, costs.Any(x => !x.valid && !x.Reversed) ? "关联支出失效或不在统计日内" : null }.Where(x => x != null) };
        }).Where(x => query["state"].ToString() == "" || x.value.State == query["state"].ToString()).ToArray();
        var rowIds = rows.Select(x => x.Id).ToHashSet(); reminders = reminders.Where(x => rowIds.Contains((string)x.GetType().GetProperty("assetId")!.GetValue(x)!)).ToList();
        var groups = rows.GroupBy(x => x.Currency).Select(g => {
            var held = g.Where(x => x.value.State != "Archived" && x.value.Quantity > 0).ToArray();
            var cost = held.Sum(x => x.value.RemainingCost); var covered = held.Where(x => x.value.Value != null).ToArray(); var total = covered.Sum(x => x.value.Value!.Value);
            var distribution = held.GroupBy(x => x.categoryName).Select(c => new { name = c.Key, value = c.Sum(x => x.value.Value ?? 0), missing = c.Count(x => x.value.Value == null), quantity = c.Sum(x => x.value.Quantity) }).ToArray();
            var trend = Enumerable.Range(0, 12).Select(i => { var d = date.AddMonths(i - 11); var values = assets.Where(x => rowIds.Contains(x.Id) && x.Currency == g.Key && x.AcquiredDate <= d).Select(a => snapshot.Value(a, d)).Where(v => v.State != "Archived" && v.Quantity > 0).ToArray(); return new { date = d, value = values.Sum(v => v.Value ?? 0), missing = values.Count(v => v.Value == null) }; }).ToArray();
            var previous = trend.Length > 1 ? trend[^2] : trend[^1];
            return new { currency = g.Key, totalValue = total, originalCost = held.Sum(x => x.value.OriginalCost), remainingCost = cost, bookValue = held.Sum(x => x.value.BookValue), depreciation = held.Sum(x => x.depreciation), quantity = held.Sum(x => x.value.Quantity), missing = held.Length - covered.Length, retentionPercent = covered.Sum(x => x.value.RemainingCost) == 0 ? (decimal?)null : PhysicalAssetMath.Round(total / covered.Sum(x => x.value.RemainingCost) * 100), usageCost = held.Sum(x => x.usageCost), ownershipCost = held.Sum(x => x.ownershipCost), idlePercent = held.Length == 0 ? (decimal?)null : PhysicalAssetMath.Round((decimal)held.Count(x => x.value.State == "Idle") / held.Length * 100), concentrationPercent = total == 0 ? (decimal?)null : PhysicalAssetMath.Round(distribution.Max(x => x.value) / total * 100), replacementCost = held.Sum(x => x.value.ReplacementCost ?? 0), replacementMissing = held.Count(x => x.value.ReplacementCost == null), valueChange = held.Length == 0 || previous.missing > 0 || covered.Length != held.Length ? (decimal?)null : total - previous.value, distribution, trend };
        });
        return new { date, scope = "physical-v1：按统计日有效规则及事件计算；原币分组，不跨币种相加。持有范围排除归档和全部处置。原始成本永久保留，剩余成本按剩余数量分摊；折旧=剩余成本-账面价值；保值率仅以有估值资产的剩余成本为分母。使用成本取关联有效交易的费用分录（含手续费），失效交易排除；持有成本=折旧+使用成本。闲置率按资产档案数；集中度按分类已覆盖估值。缺失估值和更换成本不当作零，趋势为相同筛选资产的逐月同日快照，价值变化含增减持影响。", items = rows, groups, reminders };
    }
}


