using System.Text.Json;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record VehicleDecisionOption(string Name,string Type,decimal Purchase,decimal SaleOld,bool SellsCurrent,decimal AnnualDistance,decimal EnergyPer100,decimal UnitPrice,decimal OtherMonthlyCost,decimal TerminalSale);
public sealed record VehicleDecisionInput(string SnapshotId,string Currency,int Years,decimal BaselineMonthlyVehicleCost,decimal CurrentVehicleBookValue,bool ConfirmAssumptions,VehicleDecisionOption[] Options);
public static class VehicleDecisionRules
{
 public static LifeInput[] Build(VehicleDecisionInput b,LifeInput baseline){
  FinanceService.Require(b.ConfirmAssumptions&&b.Options is {Length:>=2 and <=5},"请确认假设，并提供2至5个方案");
  FinanceService.Require(b.Currency==baseline.Currency&&b.SnapshotId==baseline.SnapshotId&&b.Years is >=1 and <=40,"币种、基线或期限无效");
  FinanceService.Require(b.BaselineMonthlyVehicleCost>=0&&b.BaselineMonthlyVehicleCost<=baseline.MonthlyExpense&&b.CurrentVehicleBookValue>=0&&b.CurrentVehicleBookValue<=baseline.RestrictedAssets,"剔除的原车月费用或从受限资产重分类的车辆账面值超出基线");
  var models=new List<LifeInput>();
  foreach(var o in b.Options){
   FinanceService.Require(!string.IsNullOrWhiteSpace(o.Name)&&o.Name.Length<=80&&o.Type is "Keep" or "Fuel" or "Electric" or "Reduce" or "Transit","方案名称或类型无效");
   FinanceService.Require(new[]{o.Purchase,o.SaleOld,o.OtherMonthlyCost,o.TerminalSale,b.BaselineMonthlyVehicleCost,b.CurrentVehicleBookValue}.All(n=>n>=0&&n<=1000000000&&decimal.Round(n,2)==n),"方案金额须为非负两位小数");
   FinanceService.Require(o.AnnualDistance>=0&&o.AnnualDistance<=1000000&&o.EnergyPer100>=0&&o.EnergyPer100<=200&&o.UnitPrice>=0&&o.UnitPrice<=10000,"里程/能耗/价格范围无效");
   FinanceService.Require(o.SellsCurrent||o.SaleOld==0,"未出售原车时不能填写出售收入");
   FinanceService.Require(o.Purchase==0||o.SellsCurrent,"本比较仅支持替换一辆车，购入新车前须明确处理原车");
   FinanceService.Require(o.Type is "Fuel" or "Electric"?o.Purchase>0&&o.SellsCurrent:o.Purchase==0,"换车方案须明确购置金额及出售原车；其他方案不新购车辆");
   var monthly=decimal.Round(o.AnnualDistance*o.EnergyPer100/100*o.UnitPrice/12+o.OtherMonthlyCost,2,MidpointRounding.AwayFromZero);
   var events=new List<LifeEvent>();var months=b.Years*12;
   if(o.SellsCurrent)events.Add(new("vehicle-01-sell-old","User-estimated old vehicle proceeds","SellAsset",baseline.Start,o.SaleOld,Currency:b.Currency,Basis:b.CurrentVehicleBookValue,Note:"User assumption, not market quote"));
   if(o.Purchase>0)events.Add(new("vehicle-02-buy","Assumed replacement purchase","BuyAsset",baseline.Start,o.Purchase,Currency:b.Currency));
   var basis=o.Purchase>0?o.Purchase:o.SellsCurrent?0:b.CurrentVehicleBookValue;
   FinanceService.Require(basis>0||o.TerminalSale==0,"无持有车辆账面值时不得虚构期末出售收入");
   if(basis>0)events.Add(new("vehicle-99-terminal-sale","User-estimated terminal residual","SellAsset",baseline.Start.AddMonths(months).AddDays(-1),o.TerminalSale,Currency:b.Currency,Basis:basis,Note:"All plans dispose of the vehicle at the end; no separate depreciation charge"));
   var model=baseline with{Name="Vehicle / "+o.Name,Months=months,MonthlyExpense=baseline.MonthlyExpense-b.BaselineMonthlyVehicleCost+monthly,OtherAssets=baseline.OtherAssets+b.CurrentVehicleBookValue,RestrictedAssets=baseline.RestrictedAssets-b.CurrentVehicleBookValue,OtherReturn=0,Events=[..baseline.Events,..events],AssumptionSource="Vehicle user assumptions; baseline monthly vehicle cost explicitly replaced; current book value reclassified, not added; no financing, inflation or live residual prices; terminal disposal; native life engine"};
   LifeSimulationEngine.Validate(model);models.Add(model);
  }return models.ToArray();
 }
}
public sealed partial class FinanceService
{
 public async Task<object> VehicleDecisions(string user,VehicleDecisionInput b,bool save,CancellationToken ct){
  var doc=await Document(user,b.SnapshotId,LifeSnapshotKind);var snapshot=JsonSerializer.Deserialize<LifeSnapshot>(doc.Content,Json)!;
  var models=VehicleDecisionRules.Build(b,snapshot.Suggested);var results=new List<object>();
  foreach(var model in models){await CheckLifeSnapshot(user,model);ct.ThrowIfCancellationRequested();var result=LifeSimulationEngine.Run(model,ct);object? scenario=null,run=null;
   if(save){scenario=await SaveLifeScenario(user,null,model,"0");run=await CalculateLife(user,model,ct);}
   results.Add(new{model.Name,input=model,finalNetWorth=result.FinalNetWorth,minimumCash=result.MinimumCash,firstShortfall=result.FirstShortfall,totalExpense=result.TotalExpense,warnings=result.Warnings,scenario,run});
  }return new{snapshotId=b.SnapshotId,results,modelVersion=LifeSimulationEngine.ModelVersion,rule="Native life financial simulator; user hypotheses only, no ledger changes. Baseline monthly costs are replaced, not duplicated; purchase and terminal sale affect assets/cash without adding a second depreciation expense."};
 }
 public async Task<object> VehicleApprovalDraft(string user,string vehicleId,ApprovalApplication b){await FuelOwned<Domain.FuelVehicle>(user,vehicleId);var result=await ApprovalSave(user,null,b,"0");var approvalId=JsonSerializer.SerializeToElement(result,Json).GetProperty("id").GetString();db.Add(new Domain.StoredDocument{UserId=user,Kind="VehicleApprovalLink",Name=vehicleId,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new{vehicleId,approvalId},Json)});return result;}
}
