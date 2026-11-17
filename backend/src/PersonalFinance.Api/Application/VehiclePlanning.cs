using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record VehicleAssetInput(string? AssetId);
public sealed record VehicleBudgetInput(string VehicleId,string Period,string Category,string Currency,string Amount);
public sealed record VehicleAssetRuleInput(string AssetVersion,PhysicalRuleInput Rule);
public static class VehicleBudgetRules
{
 public static (DateOnly From,DateOnly To) Period(string text){
  if(System.Text.RegularExpressions.Regex.IsMatch(text??"","^20[0-9]{2}(-[0-9]{2})?$")){
   if(text!.Length==4){var y=int.Parse(text);return(new(y,1,1),new(y,12,31));}
   if(DateOnly.TryParseExact(text+"-01","yyyy-MM-dd",out var start))return(start,start.AddMonths(1).AddDays(-1));
  }throw new ApiException(422,"预算期间须为2000至2099的年份或YYYY-MM");
 }
 public static decimal Validate(VehicleBudgetInput b){Period(b.Period);FinanceService.Require(b.Category is "All" or "Fuel","预算分类无效");FinanceService.Require(CurrencyDefinitions.Supports(b.Currency),"币种无效");var amount=FinanceService.Money(b.Amount,true);FinanceService.Require(amount<=100000000,"预算金额超出范围");return amount;}
}
public sealed partial class FinanceService
{
 const string VehicleAssetKind="VehicleAssetLink",VehicleBudgetKind="VehicleBudget";
 static object VehicleBudgetUsage(StoredDocument d,VehicleCostRow[] rows){var b=JsonSerializer.Deserialize<VehicleBudgetInput>(d.Content,Json)!;var period=VehicleBudgetRules.Period(b.Period);var actual=rows.Where(r=>r.Input.VehicleId==b.VehicleId&&r.Currency==b.Currency&&r.Date>=period.From&&r.Date<=period.To&&(b.Category=="All"||r.Input.Category=="Fuel")).Sum(r=>r.SignedAmount);var limit=Money(b.Amount);return new{d.Id,version=d.Version.ToString(),input=b,actual,remaining=limit-actual,usedPercent=decimal.Round(actual*100/limit,2)};}
 public async Task<object> VehicleBudgetOverview(string user,string period,string? vehicleId){VehicleBudgetRules.Period(period);if(vehicleId!=null)await FuelOwned<FuelVehicle>(user,vehicleId);var docs=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleBudgetKind&&d.Name.Contains("|"+period+"|")&&(vehicleId==null||d.Name.StartsWith(vehicleId+"|"))).ToArrayAsync();var rows=await VehicleCostRows(user,vehicleId);return docs.Select(d=>VehicleBudgetUsage(d,rows)).ToArray();}
 public async Task<object> VehicleLinkAsset(string user,string vehicleId,VehicleAssetInput b,string? version){
  await FuelOwned<FuelVehicle>(user,vehicleId);
  var links=await db.Documents.Where(d=>d.UserId==user&&d.Kind==VehicleAssetKind).ToArrayAsync();var doc=links.SingleOrDefault(d=>d.Name==vehicleId);
  if(doc!=null)Version(doc,version);
  if(b.AssetId!=null){var asset=await db.Set<ManagedAsset>().SingleOrDefaultAsync(a=>a.Id==b.AssetId&&a.UserId==user&&a.Type=="Vehicle")??throw new ApiException(404,"车辆资产不存在");Require(!links.Any(d=>d.Name!=vehicleId&&JsonSerializer.Deserialize<VehicleAssetInput>(d.Content,Json)!.AssetId==asset.Id),"该资产已关联其他车辆，避免重复估值");}
  if(doc==null){doc=new StoredDocument{UserId=user,Kind=VehicleAssetKind,Name=vehicleId,ContentType="application/json"};db.Add(doc);}else doc.Version++;
  doc.Content=JsonSerializer.SerializeToUtf8Bytes(b,Json);return new{doc.Id,version=doc.Version.ToString()};
 }
 public async Task<object> VehicleAssetRule(string user,string vehicleId,VehicleAssetRuleInput b){
  await FuelOwned<FuelVehicle>(user,vehicleId);var doc=await db.Documents.AsNoTracking().SingleOrDefaultAsync(d=>d.UserId==user&&d.Kind==VehicleAssetKind&&d.Name==vehicleId)??throw new ApiException(404,"请先关联实物车辆资产");
  var assetId=JsonSerializer.Deserialize<VehicleAssetInput>(doc.Content,Json)!.AssetId;Require(assetId!=null,"请先关联资产");return await SavePhysicalRule(user,assetId!,b.Rule,b.AssetVersion);
 }
 public async Task<object> VehicleSaveBudget(string user,VehicleBudgetInput b,string? id,string? version){
  await FuelOwned<FuelVehicle>(user,b.VehicleId);VehicleBudgetRules.Validate(b);
  var name=$"{b.VehicleId}|{b.Period}|{b.Category}|{b.Currency}";
  Require(!await db.Documents.AnyAsync(d=>d.UserId==user&&d.Kind==VehicleBudgetKind&&d.Name==name&&d.Id!=id),"该车辆同期间/分类/币种已有预算，请编辑原预算");
  var doc=id==null?new StoredDocument{UserId=user,Kind=VehicleBudgetKind,ContentType="application/json"}:await Document(user,id,VehicleBudgetKind);
  if(id==null)db.Add(doc);else{Version(doc,version);doc.Version++;}doc.Name=name;doc.Content=JsonSerializer.SerializeToUtf8Bytes(b,Json);return new{doc.Id};
 }
 public async Task<object> VehicleDeleteBudget(string user,string id,string? version){var doc=await Document(user,id,VehicleBudgetKind);Version(doc,version);db.Remove(doc);return new{id};}
 public async Task<object> VehiclePlanning(string user,string vehicleId,DateOnly from,DateOnly to){
  Require(from<=to&&to.DayNumber-from.DayNumber<=3660,"日期范围无效");var vehicle=await FuelOwned<FuelVehicle>(user,vehicleId);
  var link=await db.Documents.AsNoTracking().SingleOrDefaultAsync(d=>d.UserId==user&&d.Kind==VehicleAssetKind&&d.Name==vehicleId);
  var assetId=link==null?null:JsonSerializer.Deserialize<VehicleAssetInput>(link.Content,Json)!.AssetId;
  var snapshot=await LoadPhysicalSnapshot(user);var asset=snapshot.Assets.SingleOrDefault(a=>a.Id==assetId&&a.Type=="Vehicle");
  var opening=asset!=null&&asset.AcquiredDate<=from?snapshot.Value(asset,from):null;var closing=asset==null?null:snapshot.Value(asset,to);
  decimal? modelConsumption=opening!=null&&closing!=null&&opening.Method==closing.Method&&opening.Quantity==closing.Quantity&&opening.Method is "StraightLine" or "DecliningBalance"?Math.Max(0,opening.BookValue-closing.BookValue):null;
  var cashRows=await VehicleCostRows(user,vehicleId);var periodCash=cashRows.Where(r=>r.Date>=from&&r.Date<=to).ToArray();
  var budgetDocs=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==VehicleBudgetKind&&d.Name.StartsWith(vehicleId+"|")).ToArrayAsync();
  var budgets=budgetDocs.Select(d=>VehicleBudgetUsage(d,cashRows)).ToArray();
  return new{link=link==null?null:new{link.Id,version=link.Version.ToString(),assetId},asset=asset==null?null:new{asset.Id,asset.Name,asset.Currency,asset.Cost,asset.AcquiredDate,asset.State,version=asset.Version.ToString()},choices=snapshot.Assets.Where(a=>a.Type=="Vehicle").Select(a=>new{a.Id,a.Name,a.Currency}),opening,closing,modelConsumption,economicEstimate=asset==null||modelConsumption==null?null:(object)new{currency=asset.Currency,cashNet=periodCash.Where(r=>r.Currency==asset.Currency).Sum(r=>r.SignedAmount),modelConsumption,total=periodCash.Where(r=>r.Currency==asset.Currency).Sum(r=>r.SignedAmount)+modelConsumption,assumption="Linked cash costs assumed consumed in this period plus model book-value decline; excludes purchase price and principal. No accrual allocation of prepaid costs; not full accounting TCO."},rules=asset==null?[]:snapshot.Rules.Where(r=>r.AssetId==asset.Id).OrderByDescending(r=>r.Date).Select(r=>new{r.Id,r.Date,r.Method,r.Source,r.Amount,r.LifeMonths,r.Residual,r.AnnualRate}).ToArray(),valuations=asset==null?[]:snapshot.Valuations.Where(v=>v.AssetId==asset.Id).OrderByDescending(v=>v.Date).Select(v=>new{v.Id,v.Date,v.Amount,v.Source}).ToArray(),budgets,profilePurchase=new{vehicle.PurchaseAmount,vehicle.PurchaseCurrency,vehicle.PurchaseDate},rule="Existing physical-asset engine only; no new asset or net-worth item is created. Budget actuals include linked confirmed transactions only, excluding unlinked fuel logs."};
 }
}
