using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record FuelEvidence(string Id, DateOnly Date, decimal? Odometer, decimal Litres, string TankStatus,TimeOnly? OccurredTime=null,bool OdometerReset=false);
public sealed record FuelAssessment(string RecordId, string Status, string Reason, FuelEvidence? Start,
    FuelEvidence End, FuelEvidence[] ParticipatingRecords, decimal Litres, decimal? Distance,
    decimal? LitresPer100Km, string RuleVersion, DateTimeOffset CalculatedAt,int ParticipatingRecordCount=0,bool EvidenceTruncated=false,bool HasEstimatedQuantity=false);

public static class FuelIntervalAnalysis
{
    public static FuelAssessment[] Analyze(IEnumerable<FuelRecord> records,string? detailedRecordId=null)
    {
        var result = new List<FuelAssessment>();
        var calculatedAt = DateTimeOffset.UtcNow;
        static FuelEvidence Evidence(FuelRecord r) => new(r.Id, r.Date, r.Odometer, r.Litres, r.TankStatus,r.OccurredTime,r.OdometerReset);
        foreach (var vehicle in records.GroupBy(r => r.VehicleId))
        {
            FuelRecord? baseline = null;
            decimal? previous = null;
            var included = new List<FuelRecord>();
            decimal runningLitres=0;bool estimated=false;
            var ambiguous = vehicle.GroupBy(r => r.Date)
                .Where(FuelChronology.Ambiguous)
                .Select(g => g.Key).ToHashSet();
            foreach (var r in FuelChronology.Order(vehicle))
            {
                string? reason = ambiguous.Contains(r.Date) ? "AMBIGUOUS_ORDER"
                    : r.OdometerReset ? "ODOMETER_RESET"
                    : r.Litres <= 0 ? "INVALID_QUANTITY"
                    : r.Odometer < 0 || r.Odometer.HasValue && previous.HasValue && r.Odometer <= previous ? "INVALID_ODOMETER"
                    : r.MissedFill ? "MISSED_FILL"
                    : r.TankStatus is not ("Full" or "Partial") ? "UNKNOWN_TANK_STATUS"
                    : r.TankStatus == "Full" && r.Odometer == null ? "MISSING_ENDPOINT_ODOMETER" : null;
                if (reason != null)
                {
                    var participants = baseline == null ? new[] { r } : included.Append(r).ToArray();
                    result.Add(new(r.Id, reason.StartsWith("INVALID_") ? "INVALID" : "PENDING", reason,
                        baseline == null ? null : Evidence(baseline), Evidence(r), participants.Select(Evidence).ToArray(),
                        participants.Sum(x => x.Litres), null, null, "2.0", calculatedAt,participants.Length,false,participants.Any(p=>p.QuantitySource=="ReferenceSnapshot20261016")));
                    baseline = null;
                    included.Clear();
                    runningLitres=0;estimated=false;
                    previous = r.Odometer;
                    // A known full fill after a gap/reset can establish a fresh baseline.
                    if (reason is "MISSED_FILL" or "INVALID_ODOMETER" or "ODOMETER_RESET" && r.TankStatus == "Full" && r.Odometer >= 0 && r.Litres > 0)
                        baseline = r;
                    continue;
                }
                if (r.Odometer.HasValue) previous = r.Odometer;
                if (baseline != null){included.Add(r);runningLitres+=r.Litres;estimated|=r.QuantitySource=="ReferenceSnapshot20261016";}
                var distance = baseline == null ? null : r.Odometer - baseline.Odometer;
                var valid = baseline != null && r.TankStatus == "Full" && distance > 0;
                var litres = runningLitres;
                result.Add(new(r.Id, valid ? "VALID" : "INSUFFICIENT_DATA",
                    valid ? "FULL_TO_FULL" : baseline == null ? "NO_BASELINE" : "OPEN_INTERVAL",
                    baseline == null ? null : Evidence(baseline), Evidence(r), (r.Id==detailedRecordId?included:included.TakeLast(20)).Select(Evidence).ToArray(), litres,
                    distance, valid ? decimal.Round(litres * 100 / distance!.Value, 2) : null, "2.0", calculatedAt,included.Count,r.Id!=detailedRecordId&&included.Count>20,estimated));
                if (r.TankStatus == "Full") { baseline = r; included.Clear();runningLitres=0;estimated=false; }
            }
        }
        return result.ToArray();
    }
}
