using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record FuelImportInput(FuelRecordInput[] Records);
public sealed record FuelImportRow(int Row, string Status, string? Reason, string[] DuplicateIds);
public sealed record FuelImportPlan(FuelImportRow[] Rows, int Ready, int Duplicates, int Errors);
public static class FuelImportRules
{
    public static FuelImportPlan Plan(FuelImportInput input, IEnumerable<FuelVehicle> vehicles, IEnumerable<FuelRecord> existing, DateOnly today)
    {
        FinanceService.Require(input.Records is { Length: > 0 and <= 200 }, "每批须包含1至200条记录");
        var owned=vehicles.ToDictionary(v=>v.Id);var known=existing.ToList();var rows=new List<FuelImportRow>();
        for(var i=0;i<input.Records.Length;i++)
        {
            var b=input.Records[i];
            try {
                FinanceService.Require(b!=null&&!string.IsNullOrWhiteSpace(b.VehicleId),"缺少车辆");
                FuelRecordRules.Validate(b!,today);
                FinanceService.Require(owned.TryGetValue(b!.VehicleId,out var vehicle),"车辆不存在或不属于当前用户");
                FinanceService.Require(vehicle!.Status!="Archived","车辆已归档，请恢复后导入");
                var others=known.Where(x=>x.VehicleId==b.VehicleId).ToArray();
                var duplicates=others.Where(x=>Math.Abs(x.Date.DayNumber-b.Date.DayNumber)<=1&&x.OdometerReset==b.OdometerReset&&x.OccurredTime==b.OccurredTime&&x.Amount==b.Amount&&x.Litres==b.Litres&&x.Currency==b.Currency&&(x.FuelGrade==b.FuelGrade||x.FuelGrade=="Unknown"||b.FuelGrade=="Unknown")).Take(20).Select(x=>x.Id).ToArray();
                if(duplicates.Length>0){rows.Add(new(i+2,"DUPLICATE","疑似重复，导入时跳过；核对后可用单条录入处理特殊情况",duplicates));continue;}

                var record=new FuelRecord{Id=$"csv-row-{i+2}",VehicleId=b.VehicleId};FuelRecordRules.Apply(record,b);FuelChronology.Validate(others.Append(record));known.Add(record);
                rows.Add(new(i+2,"READY",null,[]));
            } catch(ApiException ex){rows.Add(new(i+2,"ERROR",ex.Message,[]));}
        }
        return new(rows.ToArray(),rows.Count(r=>r.Status=="READY"),rows.Count(r=>r.Status=="DUPLICATE"),rows.Count(r=>r.Status=="ERROR"));
    }
}
public sealed partial class FinanceService
{
    public async Task<FuelImportPlan> FuelPreviewImport(string user,FuelImportInput input)
    {
        Require(input.Records is {Length:>0 and <=200},"每批须包含1至200条记录");
        var ids=input.Records.Where(x=>x!=null).Select(x=>x.VehicleId).Distinct().ToArray();
        var vehicles=await db.Set<FuelVehicle>().AsNoTracking().Where(v=>v.UserId==user&&ids.Contains(v.Id)).ToArrayAsync();
        var existing=await db.Set<FuelRecord>().AsNoTracking().Where(r=>r.UserId==user&&ids.Contains(r.VehicleId)).ToArrayAsync();
        return FuelImportRules.Plan(input,vehicles,existing,DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime));
    }
    public async Task<object> FuelConfirmImport(string user,FuelImportInput input)
    {
        // FinanceEndpoints.Write holds the per-user lock and commits this batch atomically.
        var plan=await FuelPreviewImport(user,input);
        Require(plan.Errors==0,"导入包含错误，本批未写入；请重新预览并修正");
        var created=new List<string>();
        foreach(var row in plan.Rows.Where(x=>x.Status=="READY")){
            var r=new FuelRecord{UserId=user};FuelRecordRules.Apply(r,input.Records[row.Row-2]);db.Add(r);created.Add(r.Id);
        }
        return new{imported=created.Count,skippedDuplicates=plan.Duplicates,recordIds=created};
    }
}
