using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record FuelQualityIssue(string RecordId, string Code, string Severity, string[] RelatedRecordIds,
    decimal? Observed = null, decimal? Baseline = null);
public sealed record FuelQualitySample(string VehicleId, int EligibleIntervals, int RequiredPriorIntervals = 5);
public sealed record FuelQualityResult(FuelQualityIssue[] Issues, FuelQualitySample[] Samples, string RuleVersion = "1.0");

public static class FuelQualityAnalysis
{
    public static FuelQualityResult Analyze(IEnumerable<FuelRecord> records, IEnumerable<FuelAssessment> assessments,
        IReadOnlyDictionary<string, decimal?> tankCapacities)
    {
        var issues = new List<FuelQualityIssue>();
        var samples = new List<FuelQualitySample>();
        var intervalById = assessments.Where(x => x.Status == "VALID").ToDictionary(x => x.RecordId);
        var assessmentById = assessments.ToDictionary(x => x.RecordId);
        foreach (var vehicle in records.GroupBy(x => x.VehicleId))
        {
            var ordered = FuelChronology.Order(vehicle).ToArray();
            var byId = ordered.ToDictionary(x => x.Id);
            var history = new Queue<(string Id, decimal Value)>();
            var eligibleCount = 0;
            FuelRecord? previous = null;
            var signatures = new Dictionary<(decimal, decimal, string, string), FuelRecord>();
            var duplicateMarked = new HashSet<string>();
            foreach (var r in ordered)
            {
                void Add(string code, string severity = "WARNING", decimal? observed = null, decimal? baseline = null, string[]? related = null)
                    => issues.Add(new(r.Id, code, severity, related ?? [], observed, baseline));
                if (r.Odometer == null) Add("MISSING_ODOMETER");
                if (r.TankStatus is not ("Full" or "Partial")) Add("UNKNOWN_TANK_STATUS");
                if (r.FuelGrade == "Unknown") Add("UNKNOWN_FUEL_GRADE", "INFO");
                if(r.OdometerReset){Add("ODOMETER_RESET","INFO");history.Clear();}
                if (r.MissedFill) Add("MISSED_FILL");
                if(r.OriginalAmount.HasValue&&Math.Abs(r.OriginalAmount.Value-(r.Discount??0)-(r.PointsRedemption??0)-r.Amount)>.05m)Add("DISCOUNT_AMOUNT_MISMATCH",observed:r.Amount,baseline:r.OriginalAmount.Value-(r.Discount??0)-(r.PointsRedemption??0));
                if(r.PostedUnitPrice.HasValue&&r.OriginalAmount.HasValue&&Math.Abs(r.PostedUnitPrice.Value*r.Litres-r.OriginalAmount.Value)>.05m)Add("POSTED_PRICE_MISMATCH",observed:r.OriginalAmount,baseline:r.PostedUnitPrice.Value*r.Litres);
                if (assessmentById.TryGetValue(r.Id, out var assessment) && assessment.Reason is "INVALID_ODOMETER" or "AMBIGUOUS_ORDER") Add(assessment.Reason, assessment.Status == "INVALID" ? "ERROR" : "WARNING");
                if (r.QuantitySource == "ReferenceSnapshot20261016") Add("ESTIMATED_QUANTITY", "INFO");
                if (r.Litres <= 0 || r.Amount < 0) Add("INVALID_QUANTITY_OR_AMOUNT", "ERROR");
                if (tankCapacities.TryGetValue(r.VehicleId, out var capacity) && capacity > 0 && r.Litres > capacity)
                    Add("EXCEEDS_TANK_CAPACITY", observed: r.Litres, baseline: capacity);
                if (previous != null && r.Date.DayNumber - previous.Date.DayNumber > 90)
                    Add("LONG_RECORD_GAP", observed: r.Date.DayNumber - previous.Date.DayNumber, baseline: 90, related: [previous.Id]);
                if (r.QuantitySource != "Manual" && r.EnteredUnitPrice > 0 && r.Litres > 0 &&
                    Math.Abs(r.Litres * r.EnteredUnitPrice.Value - r.Amount) > Math.Max(.02m, r.EnteredUnitPrice.Value * .0005m))
                    Add("PRICE_AMOUNT_MISMATCH", observed: r.Amount, baseline: r.Litres * r.EnteredUnitPrice.Value);
                var key = (r.Litres, r.Amount, r.Currency, r.FuelGrade);
                if (signatures.TryGetValue(key, out var match) && r.Date.DayNumber - match.Date.DayNumber <= 1)
                {
                    Add("POSSIBLE_DUPLICATE", related: [match.Id]);
                    if (duplicateMarked.Add(match.Id)) issues.Add(new(match.Id, "POSSIBLE_DUPLICATE", "WARNING", [r.Id]));
                    duplicateMarked.Add(r.Id);
                }
                signatures[key] = r;
                previous = r;
                // Exclude reference-price-derived quantities from statistical baselines.
                if (!intervalById.TryGetValue(r.Id, out var interval) || interval.HasEstimatedQuantity) continue;
                var consumption = interval.LitresPer100Km!.Value;
                if (history.Count >= 5)
                {
                    var recent = history.ToArray();
                    var median = recent.Select(x => x.Value).OrderBy(x => x).ElementAt(2);
                    if (median > 0 && (consumption > median * 1.3m || consumption < median * .7m))
                        Add(consumption > median ? "CONSUMPTION_INCREASE" : "CONSUMPTION_DECREASE", observed: consumption, baseline: median, related: recent.Select(x => x.Id).ToArray());
                    if (recent[^2].Value < recent[^1].Value && recent[^1].Value < consumption)
                        Add("RISING_CONSUMPTION", observed: consumption, baseline: recent[^2].Value, related: [recent[^2].Id, recent[^1].Id]);
                }
                history.Enqueue((r.Id, consumption));
                if (history.Count > 5) history.Dequeue();
                eligibleCount++;
            }
            samples.Add(new(vehicle.Key, eligibleCount));
        }
        return new(issues.ToArray(), samples.ToArray());
    }
}
