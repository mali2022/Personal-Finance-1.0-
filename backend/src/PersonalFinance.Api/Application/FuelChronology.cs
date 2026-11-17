using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public static class FuelChronology {
 public static bool Ambiguous(IEnumerable<FuelRecord> day){var rows=day.ToArray();return rows.Length>1&&!(rows.All(r=>r.OccurredTime.HasValue)&&rows.Select(r=>r.OccurredTime).Distinct().Count()==rows.Length)&&(rows.Any(r=>r.OdometerReset||r.Odometer==null)||rows.Select(r=>r.Odometer).Distinct().Count()!=rows.Length);}
 public static IEnumerable<FuelRecord> Order(IEnumerable<FuelRecord> records)=>records.GroupBy(r=>r.Date).OrderBy(g=>g.Key).SelectMany(g=>g.All(r=>r.OccurredTime.HasValue)&&g.Select(r=>r.OccurredTime).Distinct().Count()==g.Count()?g.OrderBy(r=>r.OccurredTime).ThenBy(r=>r.Id):g.OrderBy(r=>r.Odometer).ThenBy(r=>r.Id));
 public static void Validate(IEnumerable<FuelRecord> records){foreach(var vehicle in records.GroupBy(r=>r.VehicleId)){
  FinanceService.Require(!vehicle.GroupBy(r=>r.Date).Any(g=>g.Any(r=>r.OdometerReset)&&Ambiguous(g)),"同日里程重置须为当天所有记录填写明确且不同的时间");
  decimal? previous=null;foreach(var r in Order(vehicle)){if(r.OdometerReset)previous=null;if(r.Odometer.HasValue){FinanceService.Require(previous==null||r.Odometer>previous,"里程与记录顺序冲突；更换里程表请明确标记重置并填写原因");previous=r.Odometer;}}
 }}
}
