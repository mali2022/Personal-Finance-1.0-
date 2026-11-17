using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public sealed record FuelEconomySensitivity(decimal PriceFactor, decimal FuelPrice, decimal MonthlySaving, decimal AnnualSaving, decimal TotalSaving);
public sealed record FuelEconomyResult(decimal AnnualBaselineCost, decimal AnnualTargetCost, decimal AnnualSaving,
    decimal TotalSaving, FuelEconomySensitivity[] Sensitivity);

public static class FuelEconomyMath
{
    public static FuelStrategyResult Calculate(FuelStrategyInput b)
    {
        if (b.MonthlyDistance is < 0 or > 100000 || b.AnnualDistance is < 0 or > 1200000
            || b.Consumption is <= 0 or > 100 || b.TargetConsumption is <= 0 or > 100
            || b.BaselinePrice is <= 0 or > 10000 || b.Years is < 1 or > 50
            || decimal.Round(b.MonthlyDistance, 1) != b.MonthlyDistance || decimal.Round(b.AnnualDistance, 1) != b.AnnualDistance
            || decimal.Round(b.Consumption, 2) != b.Consumption || decimal.Round(b.TargetConsumption, 2) != b.TargetConsumption
            || decimal.Round(b.BaselinePrice, 3) != b.BaselinePrice)
            throw new ApiException(422, "请检查月/年里程、当前/目标油耗、油价、周期与小数精度");
        static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
        decimal Cost(decimal distance, decimal consumption) => distance * consumption / 100 * b.BaselinePrice;
        var monthlyBaseline = Cost(b.MonthlyDistance, b.Consumption);
        var monthlyTarget = Cost(b.MonthlyDistance, b.TargetConsumption);
        var annualBaseline = Cost(b.AnnualDistance, b.Consumption);
        var annualTarget = Cost(b.AnnualDistance, b.TargetConsumption);
        var monthlySaving = monthlyBaseline - monthlyTarget;
        var annualSaving = annualBaseline - annualTarget;
        var sensitivity = new[] { .8m, 1m, 1.2m }.Select(f => new FuelEconomySensitivity(f, b.BaselinePrice*f,
            Money(monthlySaving*f), Money(annualSaving*f), Money(annualSaving*b.Years*f))).ToArray();
        return new(Money(monthlyBaseline), Money(monthlyTarget), 0, 0, Money(monthlySaving), "economy-1.0",
            new(Money(annualBaseline), Money(annualTarget), Money(annualSaving), Money(annualSaving*b.Years), sensitivity));
    }
}
