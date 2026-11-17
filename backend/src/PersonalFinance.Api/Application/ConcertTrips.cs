using System.Text.Json;
using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed record ConcertTripStop(string Id,string Kind,string Title,DateTimeOffset StartsAt,DateTimeOffset EndsAt,string TimeZone,string State,string Reference,string Note);
public sealed record ConcertTripAttachment(string SceneId,string AttachmentId);
public sealed record ConcertTripAllocation(string SceneId,string CostId);
public sealed record ConcertTripExpense(string Id,string TransactionId,string Amount,ConcertTripAllocation[] Allocations,[property:System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? Currency=null);
public sealed record ConcertTripExpenseReport(string Id,string TransactionId,string Currency,bool Valid,string Amount,string Assigned,string Unassigned,string AllocatedRefund);
public sealed record ConcertTrip(string Name,string Currency,string Budget,string State,string[] SceneIds,ConcertTripStop[] Stops,ConcertTripExpense[] Expenses,string Note,[property:System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] ConcertTripAttachment[]? Attachments=null);
public sealed partial class FinanceService {
 const string ConcertTripKind="ConcertTrip";
 static decimal TripOutsideUse(string transaction,ConcertTrip[] trips,Dictionary<string,ConcertInput> scenes,InterestPurchase[] music) {
  var linked=trips.SelectMany(t=>t.Expenses).Where(e=>e.TransactionId==transaction).SelectMany(e=>e.Allocations).Distinct().Sum(l=>scenes.TryGetValue(l.SceneId,out var scene)?ConcertRules.EffectiveCosts(scene).Where(c=>c.Id==l.CostId && c.TransactionId==transaction).Sum(c=>Money(c.Amount)):0);
  return Math.Max(0,ConcertExpenseUse(transaction,scenes.Values,music)-linked);
 }
 public async Task<object> ConcertTrips(string user) {
  await RequireConcerts(user);var result=new List<object>();var documents=await InterestDocs(user,ConcertTripKind);var allTrips=documents.Select(InterestRead<ConcertTrip>).ToArray();
  foreach(var doc in documents) {
   var trip=InterestRead<ConcertTrip>(doc);result.Add(new{doc.Id,version=doc.Version.ToString(),input=trip,report=await ConcertTripReport(user,trip,allTrips)});
  }return result;
 }
 async Task<object> ConcertTripReport(string user,ConcertTrip trip,ConcertTrip[] allTrips) {
  var allScenes=(await ConcertDocs(user)).ToDictionary(d=>d.Id,ConcertRead);var scenes=allScenes.Where(d=>trip.SceneIds.Contains(d.Key)).ToDictionary();var music=(await InterestDocs(user,InterestPurchaseKind)).Select(InterestRead<InterestPurchase>).ToArray();var collectionReturns=(await CollectionInputs(user)).SelectMany(CollectionExpenseIds).ToHashSet();
  
  decimal occurred=0,assigned=0;var warnings=new List<string>();var rows=new List<ConcertTripExpenseReport>();
  foreach(var item in trip.Expenses) {
   var tx=await db.Transactions.AsNoTracking().SingleOrDefaultAsync(t=>t.UserId==user && t.Id==item.TransactionId);
   var currency=item.Currency??trip.Currency;var valid=!collectionReturns.Contains(item.TransactionId) && tx!=null && tx.Type=="Expense" && tx.BusinessId==null && tx.Status=="Confirmed" && tx.Currency==currency && tx.OccurredAt<=DateTimeOffset.UtcNow && allTrips.SelectMany(t=>t.Expenses).Where(e=>e.TransactionId==item.TransactionId).Sum(e=>Money(e.Amount))+TripOutsideUse(item.TransactionId,allTrips,allScenes,music)<=tx.Amount;
   var amount=valid?Money(item.Amount):0;decimal allocated=0,refund=0;
   foreach(var link in item.Allocations) if(scenes.TryGetValue(link.SceneId,out var scene)) {
    var cost=ConcertRules.EffectiveCosts(scene).SingleOrDefault(c=>c.Id==link.CostId && c.TransactionId==item.TransactionId);
    if(cost==null){warnings.Add("行程费用关联已变化："+item.Id);continue;}
    var sceneDoc=await ConcertDoc(user,link.SceneId);var report=JsonSerializer.SerializeToElement(await ConcertReport(user,sceneDoc),Json);
    if(report.GetProperty("costs").EnumerateArray().Any(c=>c.GetProperty("id").GetString()==cost.Id)) {
     allocated+=Money(cost.Amount);refund+=report.GetProperty("verifiedRefunds").EnumerateArray().Where(r=>r.GetProperty("costId").GetString()==cost.Id).Sum(r=>Money(r.GetProperty("receivedAmount").GetString()));
    }
   }
   if(!valid || allocated>amount)warnings.Add("行程原交易失效或分配超额："+item.Id);
   if(currency==trip.Currency){occurred+=amount;assigned+=Math.Min(amount,allocated);}rows.Add(new(item.Id,item.TransactionId,currency,valid,M(amount),M(Math.Min(amount,allocated)),M(Math.Max(0,amount-allocated)),M(refund)));
  }
  return new{currency=trip.Currency,occurred=M(occurred),assigned=M(assigned),unassigned=M(occurred-assigned),remainingBeforeRefunds=M(Money(trip.Budget)-occurred),rows,currencyTotals=rows.GroupBy(r=>r.Currency).Select(g=>new{currency=g.Key,occurred=M(g.Sum(r=>Money(r.Amount))),assigned=M(g.Sum(r=>Money(r.Assigned))),unassigned=M(g.Sum(r=>Money(r.Unassigned))),allocatedRefund=M(g.Sum(r=>Money(r.AllocatedRefund)))}),warnings,rule="行程仅整理原交易与已有场次费用引用，不新增费用或二次扣预算。主币预算与不同原币分别统计，绝不直接相加。未分配单列；退款及最终自担以场次权威报告为准；汇率查看原资金交易，不代填或改写历史汇率。"};
 }
 public async Task<object> SaveConcertTrip(string user,string? id,ConcertTrip trip,string? version) {
  await RequireConcerts(user);ConcertText(trip.Name,200,true);ConcertText(trip.Note,2000);Money(trip.Budget);Require(Money(trip.Budget)>=0 && CurrencyDefinitions.Supports(trip.Currency),"预算或币种无效");Require(trip.State is "Planning" or "Booked" or "Completed" or "Cancelled","行程状态无效");ConcertIds(trip.SceneIds);ConcertIds(trip.Stops.Select(s=>s.Id));ConcertIds(trip.Expenses.Select(s=>s.Id));Require(trip.Stops.Length<=200 && trip.Expenses.Length<=200,"行程明细最多200条");
  if(id!=null && trip.Attachments==null)trip=trip with{Attachments=InterestRead<ConcertTrip>(await Document(user,id,ConcertTripKind)).Attachments};Require((trip.Attachments?.Length??0)<=50,"最多关联50个已有场次行程凭证");foreach(var file in trip.Attachments??[]){Require(trip.SceneIds.Contains(file.SceneId),"行程凭证须属于关联场次");await ValidateExperienceAttachments(user,file.SceneId,[file.AttachmentId]);}
  var scenes=new Dictionary<string,ConcertInput>();foreach(var sceneId in trip.SceneIds)scenes[sceneId]=ConcertRead(await ConcertDoc(user,sceneId));
  foreach(var stop in trip.Stops){ConcertText(stop.Title,200,true);ConcertText(stop.Reference);ConcertText(stop.Note,1000);ConcertRules.Zone(stop.TimeZone);Require(stop.Kind is "Flight" or "Train" or "Hotel" or "Transport" or "Activity" && stop.State is "Planned" or "Booked" or "Cancelled" or "Changed" or "Completed" && stop.StartsAt.Year>=1900 && stop.EndsAt>=stop.StartsAt,"时间线类型、状态或日期无效");}
  var others=(await InterestDocs(user,ConcertTripKind)).Where(d=>d.Id!=id).Select(InterestRead<ConcertTrip>).ToArray();Require(trip.Expenses.Select(e=>e.TransactionId).Distinct().Count()==trip.Expenses.Length,"同一行程不得重复登记原交易");var links=new HashSet<string>();
  foreach(var expense in trip.Expenses){var amount=Money(expense.Amount,true);var expenseCurrency=expense.Currency??trip.Currency;Require(CurrencyDefinitions.Supports(expenseCurrency),"费用币种无效");var tx=await db.Transactions.AsNoTracking().SingleOrDefaultAsync(t=>t.UserId==user && t.Id==expense.TransactionId);Require(tx!=null && tx.Type=="Expense" && tx.BusinessId==null && tx.Status=="Confirmed" && tx.Currency==expenseCurrency && tx.OccurredAt<=DateTimeOffset.UtcNow,"行程仅关联本人已发生已确认同币种消费");Require(amount+others.SelectMany(t=>t.Expenses).Where(e=>e.TransactionId==expense.TransactionId).Sum(e=>Money(e.Amount))<=tx!.Amount,"跨行程归属超过实际付款");decimal allocated=0;foreach(var link in expense.Allocations){Require(scenes.TryGetValue(link.SceneId,out var scene) && scene.Currency==expenseCurrency,"分配须引用本行程的同币种场次");Require(links.Add(link.SceneId+":"+link.CostId),"费用引用重复");var cost=ConcertRules.EffectiveCosts(scene!).SingleOrDefault(c=>c.Id==link.CostId && c.TransactionId==expense.TransactionId);Require(cost!=null,"请先在场次明确真实费用分配，再关联行程");Require(!others.SelectMany(t=>t.Expenses).SelectMany(e=>e.Allocations).Any(l=>l.SceneId==link.SceneId && l.CostId==link.CostId),"该场次费用已归属其他行程");allocated+=Money(cost!.Amount);}Require(allocated<=amount,"场次分配超过本行程归属金额");}
  await ValidateCollectionSourceExclusion(user,[],trip.Expenses.Select(e=>e.TransactionId));var allScenes=(await ConcertDocs(user)).ToDictionary(d=>d.Id,ConcertRead);var music=(await InterestDocs(user,InterestPurchaseKind)).Select(InterestRead<InterestPurchase>).ToArray();var combined=others.Append(trip).ToArray();foreach(var expense in trip.Expenses){var tx=await db.Transactions.AsNoTracking().SingleAsync(t=>t.UserId==user && t.Id==expense.TransactionId);Require(combined.SelectMany(t=>t.Expenses).Where(e=>e.TransactionId==expense.TransactionId).Sum(e=>Money(e.Amount))+TripOutsideUse(expense.TransactionId,combined,allScenes,music)<=tx.Amount,"原付款还分配到行程之外的场次、商品或返款，请先明确归属");}
  return await SaveInterestDocument(user,ConcertTripKind,id,trip,version);
 }
}
