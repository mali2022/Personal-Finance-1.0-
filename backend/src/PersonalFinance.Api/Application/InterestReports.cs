using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> InterestReport(string user,string currency,int year,string? artist,string? brand,string? merchant,string? scene) {
        await RequireConcerts(user);Require(CurrencyDefinitions.Supports(currency) && (year==0 || year is >=1900 and <=9900),"报表参数无效");
        var docs=await InterestDocs(user,InterestPurchaseKind);var purchases=docs.Select(d=>(d.Id,Input:InterestRead<InterestPurchase>(d))).ToArray();
        var ids=purchases.Where(x=>x.Input.TransactionId!=null).Select(x=>x.Input.TransactionId!).Distinct().ToArray();
        var txs=await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id);
        var refunds=await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && x.Type=="Refund" && x.Status=="Confirmed" && ids.Contains(x.OriginalTransactionId!)).ToArrayAsync();
        var sceneDocs=await ConcertDocs(user); var manualRefunds=sceneDocs.Select(ConcertRead).SelectMany(x=>x.Refunds).ToArray();
        var payableBusinesses=await ConcertPayableBusinesses(user);
        var warnings=new List<string>();var rows=new List<InterestReportRow>();
        foreach(var (id,b) in purchases) {
            if(b.Currency!=currency || year!=0 && b.PurchasedOn.Year!=year || merchant!=null && !b.Merchant.Contains(merchant) || scene!=null && b.SceneId!=scene) continue;
            if(b.State!="Purchased") continue;
            if(!txs.TryGetValue(b.TransactionId!,out var t) || t.Type!="Expense" || t.Status!="Confirmed" || t.OccurredAt>DateTimeOffset.UtcNow || t.Currency!=currency || t.BusinessId!=null || ConcertExpenseUse(t.Id,sceneDocs.Select(ConcertRead).ToArray(),purchases.Select(x=>x.Input))>t.Amount) {warnings.Add("购买记录 "+id+" 原交易已变化，暂不计入");continue;}
            foreach(var item in b.Items) {
                if(!item.Related) continue;
                if(brand!=null && item.BrandId!=brand || artist!=null && !item.Artists.Any(x=>x.ArtistId==artist)) continue;
                var paid=InterestRules.Paid(item);var share=artist==null ? paid : item.Artists.Where(x=>x.ArtistId==artist).Sum(x=>InterestRules.Amount(x.Amount));
                decimal returned=0;
                foreach(var r in b.Refunds.Where(x=>x.ItemId==item.Id)) {
                    var refund=refunds.SingleOrDefault(x=>x.Id==r.TransactionId && x.OriginalTransactionId==t.Id && x.Currency==currency);
                    if(refund!=null && purchases.SelectMany(x=>x.Input.Refunds).Where(x=>x.TransactionId==r.TransactionId).Sum(x=>InterestRules.Amount(x.Amount))+manualRefunds.Where(x=>x.TransactionId==r.TransactionId).Sum(x=>InterestRules.Amount(x.ReceivedAmount))<=refund.Amount) returned+=InterestRules.Amount(r.Amount);else warnings.Add("退款分配已失效："+r.TransactionId);
                }
                returned=Math.Min(paid,returned);
                rows.Add(new(id,item.Id,item.Name,item.BrandId,item.Category,b.PurchasedOn,b.Type,b.SceneId,t.Id,b.Merchant, M(artist==null?InterestRules.Amount(item.UnitPrice)*item.Quantity:InterestRules.Share(item,InterestRules.Amount(item.UnitPrice)*item.Quantity,artist)),M(artist==null?InterestRules.Amount(item.Discount):InterestRules.Share(item,InterestRules.Amount(item.Discount),artist)),M(share),M(artist==null?returned:InterestRules.Share(item,returned,artist)),M(share-(artist==null?returned:InterestRules.Share(item,returned,artist)))));
            }
            if(refunds.Where(x=>x.OriginalTransactionId==t.Id).Sum(x=>x.Amount)>purchases.SelectMany(x=>x.Input.Refunds).Where(x=>refunds.Any(r=>r.Id==x.TransactionId && r.OriginalTransactionId==t.Id)).Sum(x=>InterestRules.Amount(x.Amount))) warnings.Add("订单 "+id+" 有未分配退款，请明确分配到商品");
        }
        // Prefer an explicit identity. Only legacy scenes retain exact-name attribution;
        // an explicit unlink must never fall back to name matching.
        if(brand==null) {
            string? artistName=null;
            if(artist!=null) artistName=InterestRead<InterestTopic>(await Document(user,artist,"MusicTopic")).Name;
            foreach(var d in sceneDocs) {
                var c=ConcertRead(d);if(c.Currency!=currency || scene!=null && d.Id!=scene || artistName!=null && !ConcertRules.BelongsToArtist(c,artist!,artistName)) continue;
                if(artistName!=null && c.ArtistLink==null && c.ArtistAllocation?.Mode!="Split") warnings.Add("场次 "+d.Id+" 尚未关联艺人档案，当前沿用名称匹配；同名档案请先明确关联。");
                var report=System.Text.Json.JsonSerializer.SerializeToElement(await ConcertReport(user,d),Json);
                var validIds=report.GetProperty("costs").EnumerateArray().Select(x=>x.GetProperty("id").GetString()).ToHashSet();
                var costs=ConcertRules.EffectiveCosts(c).Where(x=>validIds.Contains(x.Id)).ToArray();
                var costIds=costs.Select(x=>x.TransactionId).ToArray();
                var original=await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && costIds.Contains(x.Id) && (x.Type=="Expense" && x.BusinessId==null || x.Type=="LoanReceived" && payableBusinesses.Contains(x.BusinessId!)) && x.Status=="Confirmed").ToDictionaryAsync(x=>x.Id);
                var refundIds=c.Refunds.Where(x=>x.TransactionId!=null).Select(x=>x.TransactionId!).ToArray();
                var verifiedRefunds=await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && refundIds.Contains(x.Id) && x.Type=="Refund" && x.Status=="Confirmed" && x.Currency==currency).ToDictionaryAsync(x=>x.Id);
                foreach(var cost in costs) {
                    if(!original.TryGetValue(cost.TransactionId,out var tx))continue;
                    var date=DateOnly.FromDateTime(tx.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime);
                    if(year!=0 && date.Year!=year || merchant!=null && !(tx.Merchant??"").Contains(merchant))continue;
                    var paid=InterestRules.Amount(cost.Amount);
                    var returned=c.Refunds.Where(r=>r.CostId==cost.Id && r.TransactionId!=null && verifiedRefunds.TryGetValue(r.TransactionId,out var rt) && rt.OriginalTransactionId==tx.Id && manualRefunds.Where(x=>x.TransactionId==r.TransactionId).Sum(x=>InterestRules.Amount(x.ReceivedAmount))+purchases.SelectMany(x=>x.Input.Refunds).Where(x=>x.TransactionId==r.TransactionId).Sum(x=>InterestRules.Amount(x.Amount))<=rt.Amount).Sum(r=>InterestRules.Amount(r.ReceivedAmount));
                    returned=Math.Min(paid,returned);
                    var effective=cost.ArtistAllocation?.Mode=="Split"?c with{ArtistAllocation=cost.ArtistAllocation}:c;
                    var attributed=artist!=null && effective.ArtistAllocation?.Mode=="Split" ? ConcertArtistMath.SplitCost(effective,paid,returned).GetValueOrDefault(artist,new(0,0,0,0)) : new ConcertArtistCostPart(paid,returned,paid-returned,0);
                    rows.Add(new(d.Id,"concert:"+cost.Id,c.Title,null,cost.Category,date,cost.Category=="Ticket"?"ConcertDirect":cost.Category=="Merch"?"LiveMerch":"Travel",d.Id,tx.Id,tx.Merchant??"",M(attributed.Paid),"0.00",M(attributed.Paid),M(attributed.Refund),M(attributed.Net)));
                }
            }
        }
        object Totals(IEnumerable<InterestReportRow> source) {var a=source.ToArray();return new {gross=M(a.Sum(x=>Money(x.Gross))),discount=M(a.Sum(x=>Money(x.Discount))),paid=M(a.Sum(x=>Money(x.Paid))),refund=M(a.Sum(x=>Money(x.Refund))),net=M(a.Sum(x=>Money(x.Net)))};}
        var budgets=(await InterestDocs(user,"MusicBudget")).Select(InterestRead<InterestBudget>).Where(b=>b.Currency==currency && b.Year==year && (b.ArtistId==null || b.ArtistId==artist) && (b.BrandId==null || b.BrandId==brand)).Select(b=>{var actual=rows.Where(x=>(b.Month==null || x.Date.Month==b.Month) && (b.Scope=="All" || b.Scope=="Daily" && x.SceneId==null || b.Scope=="Concert" && x.SceneId!=null)).Sum(x=>Money(x.Net));return new {input=b,actual=M(actual),remaining=M(InterestRules.Amount(b.Amount)-actual),warning=actual>=InterestRules.Amount(b.Amount)*0.8m};}).ToArray();
        return new {currency,year,totals=Totals(rows),daily=Totals(rows.Where(x=>x.SceneId==null)),concert=Totals(rows.Where(x=>x.SceneId!=null)),brands=rows.GroupBy(x=>x.BrandId).OrderByDescending(g=>g.Sum(x=>Money(x.Net))).Select(g=>new{id=g.Key,totals=Totals(g)}),categories=rows.GroupBy(x=>x.Category).Select(g=>new{name=g.Key,totals=Totals(g)}),months=Enumerable.Range(1,12).Select(m=>new{month=m,totals=Totals(rows.Where(x=>x.Date.Month==m))}),years=rows.GroupBy(x=>x.Date.Year).OrderBy(g=>g.Key).Select(g=>new{year=g.Key,totals=Totals(g)}),types=rows.GroupBy(x=>x.Type).Select(g=>new{name=g.Key,totals=Totals(g)}),rows,budgets,warnings=warnings.Distinct(),rule="按购买日期归属年度；原币分别汇总，不同币种不可相加。商品及专题为附属分析，不影响分类预算、账户余额或净资产。退款必须明确分配；多艺人退款按已确认实付分配比例冲减。联合场次原费用逐笔按明确比例分币，退款按原分币金额冲减；商品沿用自身分配，不继承场次比例。本报告原场次行只含本人普通消费，代付赠送/核销损失另见场次自担报告。"};
    }
}
public sealed record InterestReportRow(string PurchaseId,string ItemId,string Name,string? BrandId,string Category,DateOnly Date,string Type,string? SceneId,string TransactionId,string Merchant,string Gross,string Discount,string Paid,string Refund,string Net);





