using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public static class VehicleDistanceCosts {
 public static object[] Analyze(FuelRecord[] records,FuelAssessment[] assessments,VehicleCostRow[] costs,DateOnly from,DateOnly to){
  var byId=records.ToDictionary(r=>r.Id);var valid=assessments.Where(a=>a.Status=="VALID"&&a.End.Date>=from&&a.End.Date<=to).ToArray();
  var ordered=records.GroupBy(r=>r.VehicleId).ToDictionary(g=>g.Key,g=>FuelChronology.Order(g).ToArray());
  var positions=ordered.Values.SelectMany(rows=>rows.Select((r,i)=>new{r.Id,index=i})).ToDictionary(x=>x.Id,x=>x.index);
  var fills=valid.ToDictionary(a=>a.RecordId,a=>ordered[byId[a.RecordId].VehicleId][(positions[a.Start!.Id]+1)..(positions[a.RecordId]+1)]);
  return valid.GroupBy(a=>byId[a.RecordId].VehicleId).SelectMany(vehicle=>costs.Where(c=>c.Input.VehicleId==vehicle.Key).Select(c=>c.Currency).Concat(vehicle.SelectMany(a=>fills[a.RecordId].Select(p=>p.Currency))).Distinct().Select(currency=>{
   var km=vehicle.Sum(a=>a.Distance!.Value);var net=costs.Where(c=>c.Input.VehicleId==vehicle.Key&&c.Currency==currency).Sum(c=>c.SignedAmount);
   var comparable=vehicle.Where(a=>fills[a.RecordId].All(p=>p.Currency==currency)).ToArray();var fuelKm=comparable.Sum(a=>a.Distance!.Value);var paid=comparable.Sum(a=>fills[a.RecordId].Sum(p=>p.Amount));
   return (object)new{vehicleId=vehicle.Key,currency,validDistance=km,linkedNet=net,linkedCashPerValidKm=km>0?(decimal?)decimal.Round(net/km,4):null,fuelDistance=fuelKm,intervalFuelPaid=paid,fuelCostPerKm=fuelKm>0?(decimal?)decimal.Round(paid/fuelKm,4):null,validIntervals=vehicle.Count(),rule="Fuel cost uses paid fills within same-currency valid full intervals, excluding starting fuel. Cash-per-valid-km is a coverage-limited reference, not total odometer distance or complete TCO. Missing intervals and unlinked expenses may understate mileage/cost."};
  })).ToArray();
 }
}
