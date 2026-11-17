using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
 static ConcertInput InterestMerge(StoredDocument scene,InterestPurchase[] music) {
  var c=ConcertRead(scene);var purchases=music.Where(x=>x.SceneId==scene.Id && x.State=="Purchased" && x.TransactionId!=null).ToArray();
  return c with {Costs=[..c.Costs,..purchases.SelectMany(p=>p.Items.Where(i=>i.Related).Select(i=>new ConcertCost(i.Id,p.Type=="Travel"?"Transport":p.Type=="ConcertDirect"?"Other":"Merch",p.TransactionId!,null,i.Paid,"本人","本人")))],Refunds=[..c.Refunds,..purchases.SelectMany(p=>p.Refunds.Where(r=>p.Items.Any(i=>i.Id==r.ItemId && i.Related)).Select(r=>new ConcertRefund("music:"+r.TransactionId+":"+r.ItemId,r.ItemId,"Partial",r.Amount,"0",r.TransactionId,r.Amount,"商品退款分配")))]};
 }
}



