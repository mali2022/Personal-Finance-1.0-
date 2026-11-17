using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public static class FuelInsightsAnalysis {
 public static object Analyze(IEnumerable<FuelRecord> source,IEnumerable<FuelAssessment> assessments){
  var records=source.ToDictionary(r=>r.Id);var valid=assessments.Where(a=>a.Status=="VALID"&&records.ContainsKey(a.RecordId)).ToArray();
  var windows=valid.GroupBy(a=>records[a.RecordId].VehicleId).SelectMany(g=>new[]{3,5,10}.Select(size=>{var selected=g.OrderByDescending(a=>a.End.Date).ThenByDescending(a=>records[a.RecordId].OccurredTime).ThenByDescending(a=>a.End.Odometer).Take(size).ToArray();var distance=selected.Sum(a=>a.Distance!.Value);var litres=selected.Sum(a=>a.Litres);return new{vehicleId=g.Key,requested=size,samples=selected.Length,sufficient=selected.Length==size,distance,litres,litresPer100Km=distance>0?(decimal?)decimal.Round(litres*100/distance,2):null,recordIds=selected.Select(a=>a.RecordId),estimated=selected.Any(a=>a.HasEstimatedQuantity)};})).ToArray();
  return new{windows,rule="Endpoint-filtered valid intervals only; distance weighted. Short windows are explicitly incomplete. No prediction or real-time price data."};
 }
}
