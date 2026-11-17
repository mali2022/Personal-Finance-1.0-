using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record FuelVehicleInput(string Name,string Plate,string FuelType,string? Brand=null,string? Model=null,int? ModelYear=null,string EnergyType="Unknown",decimal? TankCapacity=null,string? Engine=null,DateOnly? PurchaseDate=null,decimal? PurchaseAmount=null,string? PurchaseCurrency=null,decimal? InitialOdometer=null,decimal? CurrentOdometer=null,decimal? AnnualDistance=null,string Status="Active",string? Note=null);
public sealed record FuelRecordInput(string VehicleId,DateOnly Date,decimal? Odometer,decimal Litres,decimal Amount,string Currency,bool FullTank,bool MissedFill,string Station,string Note,bool HistoricalBackfill=false,decimal? EnteredUnitPrice=null,string QuantitySource="Manual",string TankStatus="Unknown",string FuelGrade="Unknown",decimal? PostedUnitPrice=null,decimal? OriginalAmount=null,decimal? Discount=null,decimal? PointsRedemption=null,string? PaymentMethod=null,string? DrivingScene=null,TimeOnly? OccurredTime=null,bool OdometerReset=false);
public sealed record FuelInterval(string RecordId,decimal Distance,decimal Litres,decimal LitresPer100Km,string StartRecordId="",string[]? ParticipatingRecordIds=null,string RuleVersion="2.0",string Status="VALID",int ParticipatingRecordCount=0,bool EvidenceTruncated=false);
public static class FuelMath
{
    public static decimal LitresFromPrice(decimal amount,decimal unitPrice) => decimal.Round(amount/unitPrice,3,MidpointRounding.AwayFromZero);
    // The starting full tank is a baseline, not fuel consumed in the next interval.
    public static FuelInterval[] Intervals(IEnumerable<FuelRecord> records)
    {
        return FuelIntervalAnalysis.Analyze(records).Where(x=>x.Status=="VALID")
            .Select(x=>new FuelInterval(x.RecordId,x.Distance!.Value,x.Litres,x.LitresPer100Km!.Value,
                x.Start!.Id,x.ParticipatingRecords.Select(r=>r.Id).ToArray(),x.RuleVersion,x.Status,x.ParticipatingRecordCount,x.EvidenceTruncated)).ToArray();
    }
}
public sealed partial class FinanceService
{
    async Task<T> FuelOwned<T>(string user,string id) where T:Owned=>await db.Set<T>().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id)??throw new ApiException(404,"记录不存在");
    public async Task<FuelAssessment> FuelAssessmentDetail(string user,string id){var record=await FuelOwned<FuelRecord>(user,id);var rows=await db.Set<FuelRecord>().AsNoTracking().Where(r=>r.UserId==user&&r.VehicleId==record.VehicleId&&r.Date<=record.Date).ToArrayAsync();return FuelIntervalAnalysis.Analyze(rows,id).Single(a=>a.RecordId==id);}
    public async Task<object> FuelVehicles(string user)=>await db.Set<FuelVehicle>().AsNoTracking().Where(x=>x.UserId==user).OrderBy(x=>x.Name).Select(x=>new{x.Id,x.Name,x.Plate,x.FuelType,x.Brand,x.Model,x.ModelYear,x.EnergyType,x.TankCapacity,x.Engine,x.PurchaseDate,x.PurchaseAmount,x.PurchaseCurrency,x.InitialOdometer,x.CurrentOdometer,x.AnnualDistance,x.Status,x.Note,latestRecordedOdometer=db.Set<FuelRecord>().Where(r=>r.UserId==user&&r.VehicleId==x.Id).Max(r=>r.Odometer),version=x.Version.ToString()}).ToArrayAsync();
    public async Task<object> FuelSaveVehicle(string user,FuelVehicleInput b,string? id,string? version){
        FuelVehicleRules.Validate(b,DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime));
        var v=id==null?new FuelVehicle{UserId=user}:await FuelOwned<FuelVehicle>(user,id);if(id!=null){Version(v,version);v.Version++;}
        v.Name=b.Name.Trim();v.Plate=(b.Plate??"").Trim();v.FuelType=b.FuelType;v.Brand=b.Brand?.Trim();v.Model=b.Model?.Trim();v.ModelYear=b.ModelYear;v.EnergyType=b.EnergyType;v.TankCapacity=b.TankCapacity;v.Engine=b.Engine?.Trim();v.PurchaseDate=b.PurchaseDate;v.PurchaseAmount=b.PurchaseAmount;v.PurchaseCurrency=b.PurchaseCurrency;v.InitialOdometer=b.InitialOdometer;v.CurrentOdometer=b.CurrentOdometer;v.AnnualDistance=b.AnnualDistance;v.Status=b.Status;v.Note=b.Note?.Trim();if(id==null)db.Add(v);return new{v.Id};
    }
    public async Task<object> FuelSaveRecord(string user,FuelRecordInput b,string? id,string? version){
        Require(b.TankStatus is "Full" or "Partial" or "Unknown","加满状态无效");
        Require(b.FuelGrade is "Unknown" or "Petrol92" or "Petrol95" or "Petrol98" or "Diesel0" or "DieselMinus10" or "Other","油品无效");
        var vehicle=await FuelOwned<FuelVehicle>(user,b.VehicleId);
        Require(id!=null||vehicle.Status!="Archived","车辆已归档，请恢复后再新增加油；历史记录仍可编辑");
        FuelRecordRules.Validate(b,DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime));
        var others=await db.Set<FuelRecord>().Where(x=>x.UserId==user&&x.VehicleId==b.VehicleId&&x.Id!=id).ToArrayAsync();
        var proposed=new FuelRecord{UserId=user};FuelRecordRules.Apply(proposed,b);FuelChronology.Validate(others.Append(proposed));
        var r=id==null?new FuelRecord{UserId=user}:await FuelOwned<FuelRecord>(user,id);if(id!=null){Version(r,version);r.Version++;}
        if(id!=null&&(r.VehicleId!=b.VehicleId||r.Currency!=b.Currency||r.Amount!=b.Amount)){
            var links=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.Name==r.VehicleId).ToArrayAsync();
            Require(!links.Any(d=>ReadVehicleCost(d).FuelRecordId==id),"加油记录已关联财务交易，修改所属车辆、原币或实付前请先解除费用关联");
        }
        FuelRecordRules.Apply(r,b);if(id==null)db.Add(r);return new{r.Id};
    }
    public async Task<object> FuelDelete(string user,string kind,string id,string? version){
        Require(kind is "vehicles" or "records","记录类型无效");
        Owned r=kind=="vehicles"?await FuelOwned<FuelVehicle>(user,id):await FuelOwned<FuelRecord>(user,id);Version(r,version);
        if(r is FuelVehicle)Require(!await db.Documents.AnyAsync(d=>d.UserId==user&&((d.Kind==VehicleCostKind||d.Kind==VehicleAssetKind||d.Kind=="VehicleApprovalLink")&&d.Name==id||d.Kind==VehicleBudgetKind&&d.Name.StartsWith(id+"|"))),"车辆有关联费用、资产、预算或审批，请归档保留历史");
        if(r is FuelVehicle)Require(!await db.Set<FuelRecord>().IgnoreQueryFilters().AnyAsync(x=>x.VehicleId==id&&x.UserId==user),"车辆仍有加油记录（含回收站），请归档以保留历史");
        if(r is FuelRecord record){record.DeletedAt=DateTimeOffset.UtcNow;record.Version++;}else db.Remove(r);return new{id};
    }
    public async Task<object> FuelReport(string user,string? vehicleId,DateOnly from,DateOnly to,string currency){
        Require(from<=to&&to.DayNumber-from.DayNumber<=3660,"日期范围无效或超过10年");Require(CurrencyDefinitions.Items.Any(x=>x.Code==currency),"币种无效");
        if(vehicleId!=null)await FuelOwned<FuelVehicle>(user,vehicleId);
        var all=await db.Set<FuelRecord>().AsNoTracking().Where(x=>x.UserId==user&&(vehicleId==null||x.VehicleId==vehicleId)&&x.Date<=to).ToArrayAsync();
        var assessments=FuelIntervalAnalysis.Analyze(all).ToDictionary(x=>x.RecordId);
        var capacities=await db.Set<FuelVehicle>().AsNoTracking().Where(x=>x.UserId==user&&(vehicleId==null||x.Id==vehicleId)).ToDictionaryAsync(x=>x.Id,x=>x.TankCapacity);
        var quality=FuelQualityAnalysis.Analyze(all,assessments.Values,capacities);
        var visibleIds=all.Where(x=>x.Date>=from).Select(x=>x.Id).ToHashSet();
        var visibleQuality=quality with {Issues=quality.Issues.Where(x=>visibleIds.Contains(x.RecordId)).ToArray()};
        var intervals=assessments.Values.Where(x=>x.Status=="VALID").ToDictionary(x=>x.RecordId,x=>new FuelInterval(x.RecordId,x.Distance!.Value,x.Litres,x.LitresPer100Km!.Value,x.Start!.Id,x.ParticipatingRecords.Select(r=>r.Id).ToArray(),x.RuleVersion,x.Status,x.ParticipatingRecordCount,x.EvidenceTruncated));var rows=all.Where(x=>x.Date>=from).OrderByDescending(x=>x.Date).ThenByDescending(x=>x.OccurredTime).ThenByDescending(x=>x.Odometer).ThenBy(x=>x.Id).ToArray();
        var completed=rows.Where(x=>intervals.ContainsKey(x.Id)).Select(x=>intervals[x.Id]).ToArray();var distance=completed.Sum(x=>x.Distance);var consumed=completed.Sum(x=>x.Litres);
        return new{comparison=FuelPeriodComparison.Analyze(all,from,to,currency),insights=FuelInsightsAnalysis.Analyze(all,assessments.Values.Where(a=>a.End.Date>=from)),quality=visibleQuality,stationPrices=FuelPriceAnalysis.Analyze(rows,await FuelStationAliases(user)),records=rows.Select(x=>new{x.Id,x.VehicleId,x.Date,x.Odometer,x.Litres,x.Amount,x.Currency,x.FullTank,x.TankStatus,x.FuelGrade,x.MissedFill,x.Station,x.Note,x.EnteredUnitPrice,x.QuantitySource,x.OccurredTime,x.OdometerReset,x.PostedUnitPrice,x.OriginalAmount,x.Discount,x.PointsRedemption,x.PaymentMethod,x.DrivingScene,version=x.Version.ToString(),unitPrice=x.EnteredUnitPrice??(x.Litres>0?(decimal?)decimal.Round(x.Amount/x.Litres,3):null),assessment=assessments.GetValueOrDefault(x.Id),interval=intervals.GetValueOrDefault(x.Id)}),summary=new{weightedUnitPrice=rows.Where(r=>r.Currency==currency).Sum(r=>r.Litres)>0?(decimal?)decimal.Round(rows.Where(r=>r.Currency==currency).Sum(r=>r.Amount)/rows.Where(r=>r.Currency==currency).Sum(r=>r.Litres),3):null,count=rows.Length,litres=rows.Sum(x=>x.Litres),amount=rows.Where(x=>x.Currency==currency).Sum(x=>x.Amount),currency,otherCurrencyCount=rows.Count(x=>x.Currency!=currency),completedIntervals=completed.Length,distance,consumedLitres=consumed,litresPer100Km=distance>0?(decimal?)decimal.Round(consumed*100/distance,2):null},monthly=rows.GroupBy(x=>x.Date.ToString("yyyy-MM")).OrderBy(x=>x.Key).Select(g=>new{month=g.Key,litres=g.Sum(x=>x.Litres),amount=g.Where(x=>x.Currency==currency).Sum(x=>x.Amount)})};
    }
}
