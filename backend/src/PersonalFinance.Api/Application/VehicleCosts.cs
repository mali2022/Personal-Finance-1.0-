using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record VehicleCostInput(string VehicleId,string TransactionId,string Category,string Amount,string Kind="Expense",string? OriginalCostId=null,string? FuelRecordId=null,string Note="");
public sealed record VehicleCostCreate(VehicleCostInput Cost,SaveTransaction Transaction,bool ConfirmNew=false);
public sealed record VehicleCostRow(string Id,string Version,VehicleCostInput Input,string Currency,DateOnly Date,decimal SignedAmount,string TransactionVersion,string? Merchant);
public static class VehicleCostRules
{
 public static readonly string[] Categories=["Fuel","Charging","Insurance","Tax","Maintenance","Repair","Tyres","Parking","Tolls","Cleaning","Fines","LoanInterest","Other"];
 public static decimal Validate(VehicleCostInput b,FinanceTransaction t,decimal allocated){
  FinanceService.Require(Categories.Contains(b.Category)&&b.Kind is "Expense" or "Refund" or "Reimbursement","车辆费用分类或类型无效");
  FinanceService.Require((b.Note??"").Length<=1000,"备注过长");
  FinanceService.Require(t.Status=="Confirmed","只可关联已确认交易");
  FinanceService.Require(b.Kind=="Expense"?t.Type=="Expense":b.Kind=="Refund"?t.Type=="Refund":t.Type=="Income","费用/退款/报销须分别对应支出/退款/收入交易");
  FinanceService.Require(b.Kind=="Expense"?b.OriginalCostId==null:b.OriginalCostId!=null,"退款或报销须关联原车辆费用");
  var amount=FinanceService.Money(b.Amount,true);FinanceService.Require(amount+allocated<=t.Amount,"车辆分摊总额超过原交易金额");return amount;
 }
 public static object[] Summary(IEnumerable<VehicleCostRow> rows)=>rows.GroupBy(r=>r.Currency).OrderBy(g=>g.Key).Select(g=>(object)new{currency=g.Key,paid=g.Where(r=>r.Input.Kind=="Expense").Sum(r=>r.SignedAmount),refunds=-g.Where(r=>r.Input.Kind=="Refund").Sum(r=>r.SignedAmount),reimbursements=-g.Where(r=>r.Input.Kind=="Reimbursement").Sum(r=>r.SignedAmount),net=g.Sum(r=>r.SignedAmount)}).ToArray();
}
public sealed partial class FinanceService
{
 const string VehicleCostKind="VehicleCost";
 static VehicleCostInput ReadVehicleCost(StoredDocument doc)=>JsonSerializer.Deserialize<VehicleCostInput>(doc.Content,Json)!;
 public async Task<object> VehicleCostCandidates(string user,string vehicleId,string? fuelRecordId,string? keyword){
  await FuelOwned<FuelVehicle>(user,vehicleId);
  var query=db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&t.Status=="Confirmed"&&(t.Type=="Expense"||t.Type=="Refund"||t.Type=="Income"));
  if(fuelRecordId!=null){var fill=await FuelOwned<FuelRecord>(user,fuelRecordId);Require(fill.VehicleId==vehicleId,"加油记录不属于车辆");var from=new DateTimeOffset(fill.Date.AddDays(-3).ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(8));var until=from.AddDays(7);query=query.Where(t=>t.Type=="Expense"&&t.Currency==fill.Currency&&t.Amount==fill.Amount&&t.OccurredAt>=from&&t.OccurredAt<until);}
  if(!string.IsNullOrWhiteSpace(keyword)){Require(keyword.Length<=100,"搜索过长");query=query.Where(t=>t.Id.Contains(keyword)||t.Note.Contains(keyword)||(t.Merchant!=null&&t.Merchant.Contains(keyword)));}
  return await query.OrderByDescending(t=>t.OccurredAt).Take(50).Select(t=>new{t.Id,t.Type,t.Amount,t.Currency,t.OccurredAt,t.Merchant,t.AccountId,version=t.Version.ToString(),allocated=db.Documents.Count(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.TransactionId==t.Id)}).ToArrayAsync();
 }
 public async Task<object> VehicleCostSave(string user,VehicleCostInput b){
  var vehicle=await FuelOwned<FuelVehicle>(user,b.VehicleId);Require(vehicle.Status!="Archived","车辆已归档，请恢复后关联新费用");
  var t=await db.Transactions.SingleOrDefaultAsync(t=>t.Id==b.TransactionId&&t.UserId==user)??throw new ApiException(404,"交易不存在");
  var same=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.TransactionId==t.Id).ToArrayAsync();
  var amount=VehicleCostRules.Validate(b,t,same.Sum(d=>Money(ReadVehicleCost(d).Amount)));
  if(b.Kind!="Expense"){
   var original=await Document(user,b.OriginalCostId!,VehicleCostKind);var originalInput=ReadVehicleCost(original);
   Require(originalInput.Kind=="Expense"&&originalInput.VehicleId==b.VehicleId&&originalInput.Category==b.Category,"原费用车辆或分类不一致");
   var originalTx=await db.Transactions.AsNoTracking().SingleAsync(x=>x.Id==originalInput.TransactionId&&x.UserId==user);
   Require(originalTx.Currency==t.Currency&&(b.Kind!="Refund"||t.OriginalTransactionId==originalTx.Id),"退款原交易或原币不一致");
   var related=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.Name==b.VehicleId).ToArrayAsync();
   Require(related.Select(ReadVehicleCost).Where(x=>x.OriginalCostId==original.Id).Sum(x=>Money(x.Amount))+amount<=Money(originalInput.Amount),"退款和报销分摊超过原费用");
  }
  if(b.FuelRecordId!=null){
   Require(b.Kind=="Expense"&&b.Category=="Fuel","只有燃油支出可关联加油记录");
   var fill=await FuelOwned<FuelRecord>(user,b.FuelRecordId);
   Require(fill.VehicleId==b.VehicleId&&fill.Currency==t.Currency&&fill.Amount==amount,"加油记录车辆、原币或实付金额不一致");
   var fuelLinks=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.Name==b.VehicleId).ToArrayAsync();
   Require(!fuelLinks.Any(d=>ReadVehicleCost(d).FuelRecordId==b.FuelRecordId),"加油记录已关联交易，不能重复入账");
  }
  var doc=new StoredDocument{UserId=user,Kind=VehicleCostKind,Name=b.VehicleId,TransactionId=t.Id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(b,Json)};db.Add(doc);return new{doc.Id};
 }
 public async Task<object> VehicleCostCreateTransaction(string user,VehicleCostCreate b){
  Require(b.ConfirmNew&&string.IsNullOrEmpty(b.Cost.TransactionId)&&b.Cost.Kind=="Expense"&&b.Transaction.Type=="Expense","须确认这是新的车辆支出，已有交易请直接关联");
  var created=await SaveTransaction(user,b.Transaction);var id=JsonSerializer.SerializeToElement(created,Json).GetProperty("id").GetString()!;
  // Flush inside the outer transaction so the standard ownership query sees the new ledger transaction.
  await db.SaveChangesAsync();return await VehicleCostSave(user,b.Cost with {TransactionId=id});
 }
 public async Task<object> VehicleCostUnlink(string user,string id,string? version){
  var doc=await Document(user,id,VehicleCostKind);Version(doc,version);
  var all=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.Name==doc.Name).ToArrayAsync();
  Require(!all.Any(d=>ReadVehicleCost(d).OriginalCostId==id),"请先解除原费用关联的退款/报销分摊");db.Remove(doc);return new{id};
 }
 async Task<VehicleCostRow[]> VehicleCostRows(string user,string? vehicleId){
  var docs=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleCostKind&&(vehicleId==null||d.Name==vehicleId)).ToArrayAsync();
  var ids=docs.Select(d=>d.TransactionId!).Distinct().ToArray();var transactions=await db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&ids.Contains(t.Id)&&t.Status=="Confirmed").ToDictionaryAsync(t=>t.Id);
  return docs.Where(d=>transactions.ContainsKey(d.TransactionId!)).Select(d=>{var b=ReadVehicleCost(d);var t=transactions[d.TransactionId!];return new VehicleCostRow(d.Id,d.Version.ToString(),b,t.Currency,DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime),Money(b.Amount)*(b.Kind=="Expense"?1:-1),t.Version.ToString(),t.Merchant);}).ToArray();
 }
 public async Task<object> VehicleCostReport(string user,string? vehicleId,DateOnly from,DateOnly to){
  Require(from<=to&&to.DayNumber-from.DayNumber<=3660,"日期范围无效");if(vehicleId!=null)await FuelOwned<FuelVehicle>(user,vehicleId);
  var all=await VehicleCostRows(user,vehicleId);var rows=all.Where(r=>r.Date>=from&&r.Date<=to).OrderByDescending(r=>r.Date).ToArray();
  var fuel=await db.Set<FuelRecord>().AsNoTracking().Where(r=>r.UserId==user&&(vehicleId==null||r.VehicleId==vehicleId)&&r.Date<=to).ToArrayAsync();
  var distanceCosts=VehicleDistanceCosts.Analyze(fuel,FuelIntervalAnalysis.Analyze(fuel),rows,from,to);
  return new{annualCategories=all.GroupBy(r=>new{year=r.Date.Year,r.Input.Category,r.Currency}).OrderByDescending(g=>g.Key.year).ThenBy(g=>g.Key.Category).Select(g=>new{g.Key.year,g.Key.Category,g.Key.Currency,amount=g.Sum(r=>r.SignedAmount)}),maintenanceMonthly=rows.Where(r=>r.Input.Category=="Maintenance"||r.Input.Category=="Repair").GroupBy(r=>new{month=r.Date.ToString("yyyy-MM"),r.Input.Category,r.Currency}).OrderBy(g=>g.Key.month).Select(g=>new{g.Key.month,g.Key.Category,g.Key.Currency,amount=g.Sum(r=>r.SignedAmount)}),distanceCosts,lifetimeSummary=VehicleCostRules.Summary(all),annual=all.GroupBy(r=>new{year=r.Date.Year,r.Currency}).OrderByDescending(g=>g.Key.year).Select(g=>new{g.Key.year,g.Key.Currency,amount=g.Sum(r=>r.SignedAmount)}),rows,originalExpenses=all.Where(r=>r.Input.Kind=="Expense"),summary=VehicleCostRules.Summary(rows),monthly=rows.GroupBy(r=>new{month=r.Date.ToString("yyyy-MM"),r.Currency}).OrderBy(g=>g.Key.month).Select(g=>new{g.Key.month,g.Key.Currency,amount=g.Sum(r=>r.SignedAmount)}),categories=rows.GroupBy(r=>new{r.Input.Category,r.Currency}).OrderBy(g=>g.Key.Currency).ThenBy(g=>g.Key.Category).Select(g=>new{g.Key.Category,g.Key.Currency,amount=g.Sum(r=>r.SignedAmount)}),vehicles=rows.GroupBy(r=>new{r.Input.VehicleId,r.Currency}).Select(g=>new{g.Key.VehicleId,g.Key.Currency,amount=g.Sum(r=>r.SignedAmount)}),rule="Linked confirmed ledger allocations only; unlinked fuel purchases are not added. Original currencies remain separate. Purchase price and loan principal are excluded; this is cash flow, not complete TCO."};
 }
}
