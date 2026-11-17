using PersonalFinance.Api.Contracts;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record FuelStrategyInput(string Name, string Currency, decimal Litres, decimal BaselinePrice,
    decimal AlternativePrice, decimal Coupon, decimal PointsValue, decimal ExtraDistance, decimal Consumption,
    string Mode = "Detour", decimal MonthlyDistance = 0, decimal AnnualDistance = 0, decimal TargetConsumption = 0, int Years = 1);
public sealed record FuelStrategyResult(decimal BaselineCost, decimal AlternativeCost, decimal DetourLitres,
    decimal DetourCost, decimal NetSaving, string RuleVersion = "1.0", FuelEconomyResult? Economy = null);
public static class FuelStrategyMath
{
    public static FuelStrategyResult Calculate(FuelStrategyInput b)
    {
        if (string.IsNullOrWhiteSpace(b.Name) || b.Name.Length > 100 || !CurrencyDefinitions.Supports(b.Currency))
            throw new ApiException(422, "请检查方案名称和币种");
        if (b.Mode == "Economy") return FuelEconomyMath.Calculate(b);
        if (b.Mode != "Detour") throw new ApiException(422, "模拟模式无效");
        if (b.Litres is <= 0 or > 10000 || b.BaselinePrice is <= 0 or > 10000 || b.AlternativePrice is <= 0 or > 10000
            || b.Coupon is < 0 or > 100000000 || b.PointsValue is < 0 or > 100000000
            || b.ExtraDistance is < 0 or > 10000 || b.Consumption is <= 0 or > 100)
            throw new ApiException(422, "请检查油量、单价、优惠、额外里程和油耗范围");
        if (decimal.Round(b.Litres, 3) != b.Litres || decimal.Round(b.BaselinePrice, 3) != b.BaselinePrice
            || decimal.Round(b.AlternativePrice, 3) != b.AlternativePrice || decimal.Round(b.Coupon, 2) != b.Coupon
            || decimal.Round(b.PointsValue, 2) != b.PointsValue || decimal.Round(b.ExtraDistance, 1) != b.ExtraDistance
            || decimal.Round(b.Consumption, 2) != b.Consumption || b.Coupon + b.PointsValue > b.Litres * b.AlternativePrice)
            throw new ApiException(422, "小数精度无效，或优惠与积分抵扣超过备选方案油费");
        var baseline = b.Litres * b.BaselinePrice;
        var alternative = b.Litres * b.AlternativePrice - b.Coupon - b.PointsValue;
        var detourLitres = b.ExtraDistance * b.Consumption / 100;
        var detourCost = detourLitres * b.AlternativePrice;
        static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
        return new(Money(baseline), Money(alternative), decimal.Round(detourLitres, 4), Money(detourCost), Money(baseline - alternative - detourCost));
    }
}

public sealed partial class FinanceService
{
    const string FuelStrategyKind = "FuelStrategy";
    public async Task<object> FuelStrategies(string user)
    {
        var docs = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == FuelStrategyKind).OrderByDescending(x => x.CreatedAt).ToArrayAsync();
        return docs.Select(d => {
            var input = JsonSerializer.Deserialize<FuelStrategyInput>(d.Content, Json)!;
            return new { d.Id, version = d.Version.ToString(), input, result = FuelStrategyMath.Calculate(input) };
        }).ToArray();
    }
    public async Task<object> FuelSaveStrategy(string user, FuelStrategyInput input, string? id, string? version)
    {
        var result = FuelStrategyMath.Calculate(input);
        var doc = id == null ? new StoredDocument { UserId = user, Kind = FuelStrategyKind, ContentType = "application/json" } : await Document(user, id, FuelStrategyKind);
        if (id == null) db.Documents.Add(doc); else { Version(doc, version); doc.Version++; }
        doc.Name = input.Name.Trim();
        doc.Content = JsonSerializer.SerializeToUtf8Bytes(input with { Name = doc.Name }, Json);
        return new { doc.Id, version = doc.Version.ToString(), result };
    }
    public async Task<object> FuelDeleteStrategy(string user, string id, string? version)
    {
        var doc = await Document(user, id, FuelStrategyKind); Version(doc, version); db.Documents.Remove(doc); return new { id };
    }
}
