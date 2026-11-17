using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record FuelStationPrices(string Station, string VehicleId, string FuelGrade, string Currency,
    int Count, decimal Litres, decimal Amount, decimal WeightedUnitPrice, decimal MinimumUnitPrice,
    decimal MaximumUnitPrice, int EstimatedQuantityCount, string[] RecordIds, FuelPricePoint[] Trend);
public sealed record FuelPricePoint(DateOnly Date, decimal UnitPrice);

public static class FuelPriceAnalysis
{
    // Station labels are normalized for reporting only; original record text is retained.
    public static FuelStationPrices[] Analyze(IEnumerable<FuelRecord> records, IReadOnlyDictionary<string,string>? aliases=null) => records
        .Where(r => r.Litres > 0 && r.Amount >= 0)
        .GroupBy(r => new { Station = aliases?.GetValueOrDefault(FuelStationRules.Normalize(r.Station)) ?? FuelStationRules.Normalize(r.Station),
            r.VehicleId, r.FuelGrade, r.Currency })
        .Select(g => new FuelStationPrices(g.Key.Station, g.Key.VehicleId, g.Key.FuelGrade, g.Key.Currency,
            g.Count(), g.Sum(r => r.Litres), g.Sum(r => r.Amount),
            decimal.Round(g.Sum(r => r.Amount) / g.Sum(r => r.Litres), 3),
            decimal.Round(g.Min(r => r.Amount / r.Litres), 3), decimal.Round(g.Max(r => r.Amount / r.Litres), 3),
            g.Count(r => r.QuantitySource == "ReferenceSnapshot20261016"),
            g.OrderBy(r => r.Date).ThenBy(r => r.Id).Select(r => r.Id).ToArray(),
            g.GroupBy(r => r.Date).OrderBy(d => d.Key)
                .Select(d => new FuelPricePoint(d.Key, decimal.Round(d.Sum(r => r.Amount) / d.Sum(r => r.Litres), 3))).ToArray()))
        .OrderBy(g => g.VehicleId).ThenBy(g => g.Currency).ThenBy(g => g.FuelGrade).ThenBy(g => g.Station).ToArray();
}
