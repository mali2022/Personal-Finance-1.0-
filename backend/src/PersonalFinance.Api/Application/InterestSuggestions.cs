using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed record InterestBatch(string[] TransactionIds,string? ArtistId,string? BrandId,bool Confirm);
public sealed partial class FinanceService {
 public async Task<object> InterestCandidates(string user,string currency,int page,string? keyword) {
  await RequireConcerts(user);Require(page is >0 and <=100000 && CurrencyDefinitions.Supports(currency) && (keyword?.Length??0)<=100,"查询条件无效");
  var q=db.Transactions.AsNoTracking().Where(x=>x.UserId==user && x.Type=="Expense" && x.Status=="Confirmed" && x.OccurredAt<=DateTimeOffset.UtcNow && x.BusinessId==null && x.Currency==currency);
  if(!string.IsNullOrWhiteSpace(keyword))q=q.Where(x=>x.Note.Contains(keyword) || x.Merchant!=null && x.Merchant.Contains(keyword) || x.ProductName!=null && x.ProductName.Contains(keyword));
  // Reverse both existing index keys; page narrow identities before materializing wide transaction rows.
  var ids=await q.OrderByDescending(x=>x.OccurredAt).ThenByDescending(x=>x.Id).Select(x=>x.Id).Skip((page-1)*20).Take(20).ToArrayAsync();
  var order=ids.Select((id,index)=>(id,index)).ToDictionary(x=>x.id,x=>x.index);
  var rows=(await q.Where(x=>ids.Contains(x.Id)).ToArrayAsync()).OrderBy(x=>order[x.Id]).ToArray();
  var purchases=(await InterestDocs(user,InterestPurchaseKind)).Select(InterestRead<InterestPurchase>).Where(x=>x.State=="Purchased").ToArray();var scenes=(await ConcertDocs(user)).Select(ConcertRead).ToArray();var topics=(await InterestDocs(user,"MusicTopic")).Select(d=>(d.Id,Input:InterestRead<InterestTopic>(d))).ToArray();
  return rows.Select(t=>new {t.Id,t.Merchant,t.Note,t.ProductName,t.OccurredAt,t.Currency,amount=M(t.Amount),available=M(Math.Max(0,t.Amount-ConcertExpenseUse(t.Id,scenes,purchases))),recommendations=topics.Where(p=>new[]{p.Input.Name}.Concat(p.Input.ArtistProfile?.Aliases??[]).Any(name=>(t.Merchant+" "+t.Note+" "+t.ProductName).Contains(name,StringComparison.OrdinalIgnoreCase))).Select(p=>new {p.Id,p.Input.Name,p.Input.Kind,confidence="ReviewRequired",reason="名称或别名文字匹配；需核对商品及金额，不自动关联"})});
 }
 public async Task<object> InterestBatchLink(string user,InterestBatch b) {
  await RequireConcerts(user);Require(b.Confirm && b.TransactionIds is {Length:>0 and <=50} && b.TransactionIds.Distinct().Count()==b.TransactionIds.Length && (b.ArtistId!=null || b.BrandId!=null),"请明确确认最多50笔交易及专题归属");
  await RequireInterestTopic(user,b.ArtistId,"Artist");await RequireInterestTopic(user,b.BrandId,"Brand");var result=new List<object>();
  foreach(var id in b.TransactionIds) {
   var t=await db.Transactions.AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==id);Require(t!=null,"交易不存在");
   var i=new InterestItem(Guid.NewGuid().ToString(),t!.ProductName??t.Merchant??"历史商品",b.BrandId,"待分类","",1,M(t.Amount),"0","0","0",M(t.Amount),"Other","Held",b.ArtistId==null?[]:[new(b.ArtistId,M(t.Amount))],"用户确认批量关联；按整笔订单金额登记，请先确认不存在非专题商品");
   result.Add(await SaveInterestPurchase(user,null,new(DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime),t.Currency,"历史交易",t.Merchant??"","",id,null,"Daily","Purchased",[i],[],[],"ConfirmedHistoryMatch:"+id),"0"));
  }
  return result;
 }
}
