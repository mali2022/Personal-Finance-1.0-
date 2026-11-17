using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;

public static class LivingCostMath
{
    public static decimal Cost(decimal basketQuantity, decimal sampleAmount, decimal sampleQuantity)
    {
        try { return checked(basketQuantity * sampleAmount / sampleQuantity); }
        catch (OverflowException) { throw new ApiException(422, "样本与篮子计算超出精确数值范围，请核对金额和数量"); }
    }
    public static (string unit, decimal quantity) Normalize(string unit, decimal quantity) => (unit?.Trim() ?? "") switch
    {
        "g" => ("kg", quantity / 1000), "100g" => ("kg", quantity / 10), "kg" => ("kg", quantity), "ml" => ("L", quantity / 1000), "L" => ("L", quantity),
        _ when !string.IsNullOrWhiteSpace(unit) && unit.Trim().Length <= 30 => (unit.Trim(), quantity), _ => throw new ApiException(422, "单位不能为空且最多30字；自定义单位只按完全相同的单位和规格比较，不猜测换算")
    };
    public static decimal? Index(decimal baseline, decimal current, bool complete) => complete && baseline > 0 ? decimal.Round(current / baseline * 100, 8, MidpointRounding.AwayFromZero) : null;
}
public sealed partial class FinanceService
{
    private static void PriceIdentity(string product, string spec) => Require(product.Trim().Length is > 0 and <= 200 && spec.Trim().Length is > 0 and <= 200, "商品与可比规格必填，最多200字");
    public async Task<object> SavePriceObservation(string user, PriceObservationInput b)
    {
        PriceIdentity(b.Product, b.Specification); AssetCurrency(b.Currency); AssetDate(b.Date); Require(b.PriceKind is "Paid" or "Listed" && b.Source.Trim().Length is > 0 and <= 200, "价格口径或来源无效");
        Require(new[] { b.Brand, b.ProductCategory, b.Merchant }.All(x => x is not null && x.Length <= 200), "品牌、类别或商户无效"); decimal? listed = b.ListedAmount == null ? null : Money(b.ListedAmount, true); Require(listed == null || listed >= Money(b.Amount), "标价不能低于本条价格样本金额");
        var quantity = InvestmentDecimal(b.Quantity, true); var normalized = LivingCostMath.Normalize(b.Unit, quantity); Require(normalized.quantity >= 0.00000001m && decimal.Round(normalized.quantity, 8) == normalized.quantity, "标准单位换算后最多八位小数且不得小于0.00000001"); var amount = Money(b.Amount, true);
        if (b.SourceTransactionId != null) { var source = await Transaction(user, b.SourceTransactionId); Require(source.Status == "Confirmed" && source.Type == "Expense" && source.Currency == b.Currency && DateOnly.FromDateTime(source.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date) == b.Date, "来源须为同币种、同购买日的已确认实际消费；不从集中采购猜测商品价格"); Require(b.PriceKind != "Paid" || amount <= source.Amount, "该商品实际到手价不能超过来源交易总额"); }
        var p = new ProductPriceObservation { UserId = user, Product = b.Product.Trim(), Specification = b.Specification.Trim(), Unit = normalized.unit, Currency = b.Currency, Date = b.Date, Quantity = normalized.quantity, Amount = amount, PriceKind = b.PriceKind, Source = b.Source.Trim(), Excluded = b.Excluded, SourceTransactionId = b.SourceTransactionId, Brand = b.Brand.Trim(), ProductCategory = b.ProductCategory.Trim(), Merchant = b.Merchant.Trim(), ListedAmount = listed, Discontinued = b.Discontinued }; db.Add(p);
        return new { p.Id, unit = p.Unit, normalizedQuantity = D(p.Quantity), unitPrice = D(p.Amount / p.Quantity), cashImpact = "0.00" };
    }
    public async Task<object> ProductPrices(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<ProductPriceObservation>().AsNoTracking().Where(x => x.UserId == user);
        var rows = await q.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        var defaults = DefaultProductPrices.Data;
        return new { items = rows.Select(x => new { x.Id, x.Product, x.Brand, x.ProductCategory, x.Merchant, x.Specification, x.Unit, x.Currency, x.Date, quantity = D(x.Quantity), amount = M(x.Amount), listedAmount = x.ListedAmount == null ? null : M(x.ListedAmount.Value), discountAmount = x.PriceKind == "Paid" && x.ListedAmount != null ? M(x.ListedAmount.Value - x.Amount) : null, unitPrice = D(x.Amount / x.Quantity), x.PriceKind, x.Source, x.SourceTransactionId, x.Excluded, x.Discontinued }), total = await q.CountAsync(), page, pageSize = size,
            defaultPrices = new { defaults.Title, defaults.SourceUrl, defaults.Date, defaults.Currency, defaults.Description, count = defaults.Items.Length } };
    }
    public async Task<object> ImportDefaultProductPrices(string user)
    {
        var defaults = DefaultProductPrices.Create(user);
        var existing = await db.Set<ProductPriceObservation>().AsNoTracking()
            .Where(x => x.UserId == user && x.Source == DefaultProductPrices.Source)
            .Select(x => new { x.Product, x.Specification }).ToArrayAsync();
        var identities = existing.Select(x => (x.Product, x.Specification)).ToHashSet();
        var missing = defaults.Where(x => !identities.Contains((x.Product, x.Specification))).ToArray();
        db.AddRange(missing);
        return new { imported = missing.Length, skipped = defaults.Count - missing.Length, total = defaults.Count,
            currency = "CNY", priceKind = "Listed", sourceUrl = DefaultProductPrices.Data.SourceUrl, cashImpact = "0.00" };
    }
    public async Task<object> SaveBasket(string user, BasketInput b)
    {
        AssetCurrency(b.Currency); AssetDate(b.BaseDate); Require(b.Name.Trim().Length is > 0 and <= 150 && b.PriceKind is "Paid" or "Listed" && b.Items is { Length: > 0 and <= 100 }, "篮子名称、口径或条目数无效");
        var basket = new LivingCostBasket { UserId = user, Name = b.Name.Trim(), Currency = b.Currency, BaseDate = b.BaseDate, PriceKind = b.PriceKind }; var identities = new HashSet<string>();
        foreach (var item in b.Items!) { PriceIdentity(item.Product, item.Specification); Require(item.Brand is not null && item.Brand.Length <= 200, "品牌无效"); var norm = LivingCostMath.Normalize(item.Unit, InvestmentDecimal(item.Quantity, true));
            Require(norm.quantity >= 0.00000001m && decimal.Round(norm.quantity, 8) == norm.quantity && identities.Add(item.Product.Trim() + "\0" + item.Brand!.Trim() + "\0" + item.Specification.Trim() + "\0" + norm.unit), "篮子条目重复或单位换算后超过八位精度");
            db.Add(new LivingCostBasketItem { UserId = user, BasketId = basket.Id, Product = item.Product.Trim(), Brand = item.Brand!.Trim(), Specification = item.Specification.Trim(), Unit = norm.unit, Quantity = norm.quantity }); }
        db.Add(basket); return new { basket.Id, version = basket.Version.ToString(), cashImpact = "0.00", rule = "固定基准数量；后续实际采购量不改变篮子。规格替代须创建新篮子。" };
    }
    public async Task<object> Baskets(string user) => await db.Set<LivingCostBasket>().AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.CreatedAt).Select(x => new { x.Id, x.Name, x.Currency, x.BaseDate, x.PriceKind, version = x.Version.ToString() }).ToArrayAsync();
    public async Task<object> LivingCostIndex(string user, IQueryCollection query)
    {
        var id = query["basketId"].ToString(); var b = await db.Set<LivingCostBasket>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "篮子不存在");
        Require(DateOnly.TryParseExact(query["date"], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) && date >= b.BaseDate, "日期须不早于基准期"); AssetDate(date);
        var items = await db.Set<LivingCostBasketItem>().AsNoTracking().Where(x => x.UserId == user && x.BasketId == id).ToArrayAsync();
        var products = items.Select(x => x.Product).Distinct().ToArray();
        var observations = await db.Set<ProductPriceObservation>().AsNoTracking().Where(x => x.UserId == user && x.Currency == b.Currency && x.PriceKind == b.PriceKind && !x.Excluded && x.Date <= date && products.Contains(x.Product)).ToArrayAsync();
        decimal? ComparableCost(DateOnly target)
        {
            if (target < b.BaseDate) return null; decimal sum = 0;
            foreach (var item in items) { var sample = observations.Where(x => x.Product == item.Product && x.Brand == item.Brand && x.Specification == item.Specification && x.Unit == item.Unit && x.Date <= target).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id, StringComparer.Ordinal).FirstOrDefault(); if (sample == null || sample.Discontinued) return null; sum += LivingCostMath.Cost(item.Quantity, sample.Amount, sample.Quantity); }
            return sum;
        }
        decimal baseline = 0, current = 0; var covered = 0;
        var rows = items.Select(item => {
            var comparable = observations.Where(x => x.Product == item.Product && x.Brand == item.Brand && x.Specification == item.Specification && x.Unit == item.Unit).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id, StringComparer.Ordinal).ToArray();
            var p0 = comparable.FirstOrDefault(x => x.Date <= b.BaseDate); var pt = comparable.FirstOrDefault(x => x.Date <= date);
            var discontinued = pt?.Discontinued == true; if (p0?.Discontinued == true) p0 = null; if (discontinued) pt = null;
            decimal? c0 = p0 == null ? null : LivingCostMath.Cost(item.Quantity, p0.Amount, p0.Quantity); decimal? ct = pt == null ? null : LivingCostMath.Cost(item.Quantity, pt.Amount, pt.Quantity);
            if (c0 != null && ct != null) { baseline += c0.Value; current += ct.Value; covered++; }
            return new { item.Product, item.Brand, item.Specification, item.Unit, quantity = D(item.Quantity), baseCost = c0 == null ? null : D(c0.Value), currentCost = ct == null ? null : D(ct.Value),
                baseSampleId = p0?.Id, currentSampleId = pt?.Id, baseSampleDate = p0?.Date, currentSampleDate = pt?.Date, baseSource = p0?.Source, currentSource = pt?.Source, currentSourceTransactionId = pt?.SourceTransactionId,
                baseAgeDays = p0 == null ? (int?)null : b.BaseDate.DayNumber - p0.Date.DayNumber, currentAgeDays = pt == null ? (int?)null : date.DayNumber - pt.Date.DayNumber,
                missing = discontinued ? "商品已标记停售；替代品牌或规格须人工确认并创建新篮子" : p0 == null || pt == null ? "缺少同商品、同品牌、同规格、同标准单位的价格样本" : null };
        }).ToArray();
        var index = LivingCostMath.Index(baseline, current, covered == items.Length);
        var previousMonth = ComparableCost(date.AddMonths(-1)); var previousYear = ComparableCost(date.AddYears(-1));
        return new { b.Id, b.Name, b.Currency, b.BaseDate, date, b.PriceKind, baseCost = D(baseline), currentCost = D(current), change = D(current - baseline), index = index == null ? null : D(index.Value),
            monthOverMonthPercent = index == null || previousMonth is null or <= 0 ? null : D((current - previousMonth.Value) / previousMonth.Value * 100), yearOverYearPercent = index == null || previousYear is null or <= 0 ? null : D((current - previousYear.Value) / previousYear.Value * 100),
            covered, total = items.Length, coverage = items.Length == 0 ? "0" : D((decimal)covered / items.Length * 100), complete = covered == items.Length,
            items = rows, formula = "Σ(当前可比单价×固定基准数量) / Σ(基准单价×固定基准数量) ×100", strategy = "同规格最新不晚于目标日期样本；展示补值日期和龄期；缺失不填零，覆盖不全不输出完整指数", cashImpact = "0.00" };
    }
}
