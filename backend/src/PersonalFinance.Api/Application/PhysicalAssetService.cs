using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private async Task<ManagedAsset> Physical(string user, string id) { var a = await Managed(user, id); Require(a.Type != "TermDeposit", "仅适用于实物资产"); return a; }
    private static void PhysicalReason(string reason) => Require(reason.Trim().Length is > 0 and <= 1000, "请填写不超过1000字的依据或原因");
    private static object PhysicalCategoryView(PhysicalCategory x) => new { x.Id, x.Name, x.ParentId, x.Sort, x.Enabled, x.Tags, x.DefaultMethod, x.DefaultLifeMonths, version = x.Version.ToString() };
    public async Task<object> PhysicalCategories(string user) => (await db.Set<PhysicalCategory>().AsNoTracking().Where(x => x.UserId == user).OrderBy(x => x.Sort).ThenBy(x => x.Name).ToArrayAsync()).Select(PhysicalCategoryView);
    public async Task<object> SavePhysicalCategory(string user, PhysicalCategoryInput b, string? id, string? version)
    {
        Require(b.Name.Trim().Length is > 0 and <= 100 && b.Tags.Length <= 500 && PhysicalAssetMath.Methods.Contains(b.DefaultMethod) && b.DefaultLifeMonths is >= 1 and <= 1200 && b.Sort is >= -100000 and <= 100000, "分类名称、标签或默认配置无效");
        var all = await db.Set<PhysicalCategory>().Where(x => x.UserId == user).ToArrayAsync();
        var item = id == null ? new PhysicalCategory { UserId = user } : all.SingleOrDefault(x => x.Id == id) ?? throw new ApiException(404, "分类不存在");
        if (id != null) Version(item, version);
        Require(!all.Any(x => x.Id != id && x.ParentId == b.ParentId && x.Name == b.Name.Trim()), "同级分类名称重复");
        var parents = new HashSet<string> { item.Id }; var parent = b.ParentId; var depth = 1;
        while (parent != null) { Require(parents.Add(parent), "分类不能循环引用"); var p = all.SingleOrDefault(x => x.Id == parent) ?? throw new ApiException(404, "上级分类不存在"); Require(!b.Enabled || p.Enabled, "启用分类不能置于停用分类下"); parent = p.ParentId; depth++; }
        int Height(string key) => 1 + all.Where(x => x.ParentId == key).Select(x => Height(x.Id)).DefaultIfEmpty(0).Max();
        Require(depth + Height(item.Id) - 1 <= 3, "资产分类最多三级");
        Require(b.Enabled || !all.Any(x => x.ParentId == item.Id && x.Enabled), "请先停用子分类");
        item.Name = b.Name.Trim(); item.ParentId = b.ParentId; item.Sort = b.Sort; item.Enabled = b.Enabled; item.Tags = b.Tags; item.DefaultMethod = b.DefaultMethod; item.DefaultLifeMonths = b.DefaultLifeMonths;
        if (id == null) db.Add(item); else item.Version++;
        return PhysicalCategoryView(item);
    }
    public async Task<object> PhysicalCategoryAction(string user, string id, PhysicalCategoryAction b, string? version)
    {
        PhysicalReason(b.Reason);
        var c = await db.Set<PhysicalCategory>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "分类不存在"); Version(c, version);
        Require(!await db.Set<PhysicalCategory>().AnyAsync(x => x.UserId == user && x.ParentId == id), "请先处理子分类");
        var profiles = await db.Set<PhysicalProfile>().Where(x => x.UserId == user && x.CategoryId == id).ToArrayAsync();
        if (b.TargetId == null) { Require(profiles.Length == 0, "有资产引用的分类不能删除，请停用或合并"); db.Remove(c); }
        else {
            var target = await db.Set<PhysicalCategory>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == b.TargetId) ?? throw new ApiException(404, "目标分类不存在"); Require(target.Enabled && target.Id != id, "请选择其他启用分类");
            foreach (var p in profiles) { p.CategoryId = target.Id; p.Version++; var a = await Physical(user, p.AssetId); a.Version++; }
            db.Remove(c);
        }
        return new { updated = true, moved = profiles.Length };
    }
    public async Task<object> SavePhysicalProfile(string user, string id, PhysicalProfileInput b, string? version)
    {
        var a = await Physical(user, id); Version(a, version);
        Require((b.Name == null || b.Name.Trim().Length is > 0 and <= 150) && (b.Note == null || b.Note.Length <= 2000), "名称或备注无效");
        if (b.Name != null) a.Name = b.Name.Trim(); if (b.Note != null) a.Note = b.Note;
        Require(b.Quantity is > 0 and <= 100000000 && decimal.Round(b.Quantity, 4) == b.Quantity && b.MaintenanceDays is >= 0 and <= 36500 && b.InventoryDays is >= 0 and <= 36500 && b.StaleDays is >= 1 and <= 36500 && b.IdleDays is >= 1 and <= 36500, "数量或提醒周期无效，周期0表示关闭");
        Require(b.InitialState is "New" or "Active" or "Idle", "初始状态无效，后续变更请使用生命周期");
        Require(new[] { b.Code, b.Brand, b.Model, b.SerialNumber, b.Merchant, b.Location, b.Holder }.All(x => x.Length <= 150) && b.Tags.Length <= 500, "档案字段超出长度");
        static bool SafeUrl(string s) => s.Length <= 2000 && (s == "" || Uri.TryCreate(s, UriKind.Absolute, out var uri) && uri.Scheme == "https");
        Require(SafeUrl(b.PhotoUrl) && SafeUrl(b.ReceiptUrl), "照片与凭证须为HTTPS链接");
        Require(b.InServiceDate == null || b.InServiceDate >= a.AcquiredDate && b.InServiceDate <= AssetToday, "启用日期无效");
        Require(b.WarrantyUntil == null || b.WarrantyUntil >= a.AcquiredDate, "保修到期不可早于购置日期");
        if (b.PaymentAccountId != null) { var payment = await Account(user, b.PaymentAccountId, false); Require(payment.Currency == a.Currency, "付款账户币种不一致"); }
        if (b.CategoryId != null) Require(await db.Set<PhysicalCategory>().AnyAsync(x => x.UserId == user && x.Id == b.CategoryId && x.Enabled), "分类不存在或已停用");
        Require(b.Code == "" || !await db.Set<PhysicalProfile>().AnyAsync(x => x.UserId == user && x.AssetId != id && x.Code == b.Code), "资产编码重复");
        var p = await db.Set<PhysicalProfile>().SingleOrDefaultAsync(x => x.UserId == user && x.AssetId == id);
        if (p == null) { p = new PhysicalProfile { UserId = user, AssetId = id, InitialState = a.State == "Archived" ? "Archived" : b.InitialState }; db.Add(p); }
        else { Require(p.Quantity == b.Quantity && p.InitialState == b.InitialState, "原始数量与初始状态不可改写，请使用处置和撤销"); p.Version++; }
        Require(!await db.Set<PhysicalValueRule>().AnyAsync(x => x.UserId == user && x.AssetId == id) || p.InServiceDate == b.InServiceDate, "已登记估值规则后不可改写启用日期");
        p.CategoryId = b.CategoryId; p.Code = b.Code; p.Brand = b.Brand; p.Model = b.Model; p.SerialNumber = b.SerialNumber; p.Merchant = b.Merchant; p.PaymentAccountId = b.PaymentAccountId; p.PhotoUrl = b.PhotoUrl; p.ReceiptUrl = b.ReceiptUrl; p.Location = b.Location; p.Holder = b.Holder; p.Tags = b.Tags; p.InServiceDate = b.InServiceDate; p.WarrantyUntil = b.WarrantyUntil; p.Quantity = b.Quantity; p.MaintenanceDays = b.MaintenanceDays; p.InventoryDays = b.InventoryDays; p.StaleDays = b.StaleDays; p.IdleDays = b.IdleDays;
        a.Version++; return new { updated = true, version = a.Version.ToString() };
    }
    public async Task<object> SavePhysicalRule(string user, string id, PhysicalRuleInput b, string? version)
    {
        var a = await Physical(user, id); Version(a, version); AssetDate(b.Date); PhysicalReason(b.Source);
        Require(b.Date >= a.AcquiredDate && PhysicalAssetMath.Methods.Contains(b.Method) && b.LifeMonths is >= 1 and <= 1200 && b.Residual >= 0 && b.Residual <= a.Cost && b.AnnualRate is >= 0 and <= 100, "估值规则参数无效");
        Require(new[] { b.Amount, b.MarketValue, b.NetRealizableValue, b.ReplacementCost }.All(x => x == null || x is >= 0 and <= 999999999999999m && decimal.Round(x.Value, 2) == x), "价值最多两位小数且不可为负");
        Require(!(b.Method is "Manual" or "Fixed" or "QuantityPrice") || b.Amount != null, "请填写金额或单价"); Require(b.Method != "Market" || b.MarketValue != null, "市场估值须填写实际观察金额及来源");
        var rule = new PhysicalValueRule { UserId = user, AssetId = id, Date = b.Date, Method = b.Method, LifeMonths = b.LifeMonths, Residual = b.Residual, AnnualRate = b.AnnualRate, Amount = b.Amount, MarketValue = b.MarketValue, NetRealizableValue = b.NetRealizableValue, ReplacementCost = b.ReplacementCost, Source = b.Source.Trim() };
        db.Add(rule); a.Version++; return new { rule.Id, version = a.Version.ToString() };
    }
    public async Task<object> SavePhysicalEvent(string user, string id, PhysicalEventInput b, string? version)
    {
        var a = await Physical(user, id); Version(a, version); AssetDate(b.Date); PhysicalReason(b.Reason); Require(b.Date >= a.AcquiredDate, "事件不可早于购置日期");
        var events = await db.Set<PhysicalEvent>().Where(x => x.UserId == user && x.AssetId == id).ToArrayAsync();
        Require(!events.Any(x => x.Date > b.Date), "生命周期须按日期顺序追加");
        var p = await db.Set<PhysicalProfile>().SingleOrDefaultAsync(x => x.UserId == user && x.AssetId == id);
        if (p == null) { p = new PhysicalProfile { UserId = user, AssetId = id, InitialState = a.State }; db.Add(p); }
        var before = PhysicalAssetMath.Calculate(a, p, [], [], events, b.Date);
        Require(PhysicalAssetMath.States.Contains(b.Kind) || b.Kind is "Reverse" or "Inventory" or "Maintenance", "生命周期事件无效");
        if (b.Kind == "Reverse") {
            var original = events.LastOrDefault(x => x.Id == b.ReversesId); Require(original != null && original.Kind != "Reverse" && !events.Any(x => x.ReversesId == b.ReversesId), "原事件不存在或已冲销");
            // Reversing the latest effective event prevents rewriting later dependent states or quantities.
            var last = events.Where(x => x.Kind != "Reverse" && !events.Any(r => r.ReversesId == x.Id)).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).FirstOrDefault();
            Require(last?.Id == b.ReversesId && b.Quantity == 0, "请从最近事件依次撤销，冲销数量须为0");
        } else {
            Require(b.ReversesId == null && before.State != "Archived" && (before.Quantity > 0 || b.Kind == "Archived"), "归档或已全部处置的资产须先撤销原事件");
            Require(PhysicalAssetMath.Disposals.Contains(b.Kind) ? b.Quantity > 0 && b.Quantity <= before.Quantity && decimal.Round(b.Quantity, 4) == b.Quantity : b.Quantity == 0, "处置数量超出剩余数量或非处置事件数量不为0");
        }
        var e = new PhysicalEvent { UserId = user, AssetId = id, Date = b.Date, Kind = b.Kind, Quantity = b.Quantity, Reason = b.Reason.Trim(), ReversesId = b.ReversesId }; db.Add(e); a.Version++; return new { e.Id, version = a.Version.ToString() };
    }
    public async Task<object> SavePhysicalCost(string user, string id, PhysicalCostInput b, string? version)
    {
        var a = await Physical(user, id); Version(a, version);
        Require(new[] { "Repair", "Maintenance", "Insurance", "Energy", "Upkeep", "Other" }.Contains(b.Kind) && b.Reason.Length <= 1000, "费用分类或说明无效");
        var t = await Transaction(user, b.TransactionId); Require(t.Type == "Expense" && t.Status == "Confirmed" && t.Currency == a.Currency && DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date) >= a.AcquiredDate && t.OccurredAt <= DateTimeOffset.UtcNow, "须关联购置后已确认的同币种支出");
        Require(!await db.Set<PhysicalCostLink>().AnyAsync(x => x.UserId == user && x.TransactionId == t.Id && !x.Reversed), "此交易已归属实物资产，禁止重复计费");
        db.Add(new PhysicalCostLink { UserId = user, AssetId = id, TransactionId = t.Id, Kind = b.Kind, Reason = b.Reason }); a.Version++; return new { linked = true, version = a.Version.ToString() };
    }
    public async Task<object> ReversePhysicalCost(string user, string id, string linkId, PhysicalCategoryAction b, string? version)
    {
        var a = await Physical(user, id); Version(a, version); PhysicalReason(b.Reason);
        var link = await db.Set<PhysicalCostLink>().SingleOrDefaultAsync(x => x.UserId == user && x.AssetId == id && x.Id == linkId) ?? throw new ApiException(404, "费用关联不存在"); Require(!link.Reversed, "已撤销关联"); link.Reversed = true; link.Reason += "\n撤销：" + b.Reason; link.Version++; a.Version++; return new { reversed = true };
    }
}
