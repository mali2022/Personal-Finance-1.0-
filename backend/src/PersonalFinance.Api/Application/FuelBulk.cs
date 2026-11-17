using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record FuelBulkTarget(string Id,string Version);
public sealed record FuelBulkInput(string Action,FuelBulkTarget[] Targets,string? TankStatus=null,bool FullTankConfirmed=false);
public static class FuelBulkRules
{
 public static void Validate(string user,FuelBulkInput b,IEnumerable<FuelRecord> source){
  FinanceService.Require(b.Targets is {Length:>0 and <=200},"每批须选择1至200条记录");
  FinanceService.Require(b.Action is "Delete" or "Restore" or "SetTankStatus","批量操作无效");
  FinanceService.Require(b.Targets.All(t=>t!=null&&!string.IsNullOrWhiteSpace(t.Id))&&b.Targets.Select(t=>t.Id).Distinct().Count()==b.Targets.Length,"记录ID无效或重复");
  if(b.Action=="SetTankStatus"){
   FinanceService.Require(b.TankStatus is "Full" or "Partial" or "Unknown","加满状态无效");
   FinanceService.Require(b.TankStatus!="Full"||b.FullTankConfirmed,"须明确核实所有所选记录确实加满");
  }
  var records=source.Where(r=>r.UserId==user).ToDictionary(r=>r.Id);
  foreach(var target in b.Targets){
   if(!records.TryGetValue(target.Id,out var r))throw new ApiException(404,"记录不存在");
   FinanceService.Version(r,target.Version);
   FinanceService.Require(b.Action=="Restore"?r.DeletedAt!=null:r.DeletedAt==null,"记录状态已变化，请刷新后重试");
  }
 }
 public static void Apply(FuelBulkInput b,IEnumerable<FuelRecord> records,DateTimeOffset now){
  foreach(var r in records){if(b.Action=="Delete")r.DeletedAt=now;else if(b.Action=="Restore")r.DeletedAt=null;else{r.TankStatus=b.TankStatus!;r.FullTank=b.TankStatus=="Full";}r.Version++;}
 }
 public static void ValidateRestore(IEnumerable<FuelRecord> restoring,IEnumerable<FuelRecord> active){
  var restore=restoring.ToArray();var all=active.Concat(restore).ToArray();
  foreach(var scope in restore.Select(r=>new{r.UserId,r.VehicleId}).Distinct())FuelChronology.Validate(all.Where(r=>r.UserId==scope.UserId&&r.VehicleId==scope.VehicleId));
 }
}
public sealed partial class FinanceService
{
 public async Task<object> FuelBulk(string user,FuelBulkInput b){
  Require(b.Targets is {Length:>0 and <=200},"每批须选择1至200条记录");
  var ids=b.Targets.Where(x=>x!=null).Select(x=>x.Id).ToArray();
  var rows=await db.Set<FuelRecord>().IgnoreQueryFilters().Where(r=>r.UserId==user&&ids.Contains(r.Id)).ToArrayAsync();
  FuelBulkRules.Validate(user,b,rows);
  if(b.Action=="Restore"){
   var vehicles=rows.Select(r=>r.VehicleId).Distinct().ToArray();
   var active=await db.Set<FuelRecord>().AsNoTracking().Where(r=>r.UserId==user&&vehicles.Contains(r.VehicleId)).ToArrayAsync();
   FuelBulkRules.ValidateRestore(rows,active);
  }
  FuelBulkRules.Apply(b,rows,DateTimeOffset.UtcNow);
  return new{count=rows.Length,action=b.Action};
 }
 public async Task<object> FuelTrash(string user,int page=1){
  Require(page is >=1 and <=1000000,"回收站页码无效");
  var query=db.Set<FuelRecord>().IgnoreQueryFilters().AsNoTracking().Where(r=>r.UserId==user&&r.DeletedAt!=null);
  var count=await query.CountAsync();
  var records=await query.OrderByDescending(r=>r.DeletedAt).ThenBy(r=>r.Id).Skip((page-1)*50).Take(50).Select(r=>new{r.Id,r.VehicleId,r.Date,r.Odometer,r.Litres,r.Amount,r.Currency,r.FullTank,r.TankStatus,r.FuelGrade,r.MissedFill,r.Station,r.Note,r.QuantitySource,r.EnteredUnitPrice,r.DeletedAt,version=r.Version.ToString(),unitPrice=r.Litres>0?(decimal?)decimal.Round(r.Amount/r.Litres,3):null,interval=(FuelInterval?)null}).ToArrayAsync();
  return new{records,total=count,limit=50,page};
 }
}
