using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    internal const string FestivalKind = "FestivalEvent";
    static FestivalInput FestivalRead(StoredDocument d) => JsonSerializer.Deserialize<FestivalInput>(d.Content, Json)!;
    static FestivalAllocationRecord FestivalLinkRead(StoredDocument d) => JsonSerializer.Deserialize<FestivalAllocationRecord>(d.Content, Json)!;
    static object FestivalDto(StoredDocument d) => new { d.Id, version = d.Version.ToString(), input = FestivalRead(d) };
    public async Task<object> FestivalList(string user, IQueryCollection query) {
        var (page,size) = Paging(query); var q = db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == FestivalKind);
        var total = await q.CountAsync(); var docs = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new { items = docs.Select(FestivalDto), total, page, pageSize = size };
    }
    void FestivalArchive(string user, StoredDocument doc, string action) => db.Add(new StoredDocument { UserId=user, Kind="FestivalHistory",Name=doc.Id, ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new { action, at=DateTimeOffset.UtcNow, version=doc.Version, input=FestivalRead(doc) },Json) });
    public async Task<object> FestivalSave(string user, string? id, FestivalInput input, string? version) {
        FestivalRules.Validate(input);
        var doc = id == null ? new StoredDocument { UserId=user,Kind=FestivalKind,ContentType="application/json" } : await Document(user,id,FestivalKind);
        if(id==null) { Require(version=="0","新计划版本须为0"); db.Add(doc); }
        else {
            Version(doc,version); var old=FestivalRead(doc);
            Require(old.Currency==input.Currency || !await db.Documents.AnyAsync(x=>x.UserId==user && x.Kind=="FestivalAllocation" && x.Name==doc.Id),"已有交易关联不能修改报告币种");
            FestivalArchive(user,doc,"Update"); doc.Version++;
        }
        var links = id == null ? [] : await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAllocation" && x.Name==doc.Id).ToArrayAsync();
        foreach(var p in input.Purchases.Where(x=>x.State is "Purchased" or "Delivered" or "Returned"))
            Require(links.Any(x=>!FestivalLinkRead(x).Revoked && FestivalLinkRead(x).Input.PurchaseId==p.Id),"已购买项目须先关联真实交易");
        doc.Name=input.Name;doc.Content=JsonSerializer.SerializeToUtf8Bytes(input,Json); return FestivalDto(doc);
    }
    public async Task<object> FestivalDetail(string user,string id) {
        var d=await Document(user,id,FestivalKind);return new { document=FestivalDto(d),report=await FestivalReport(user,d) };
    }
    public async Task<object> FestivalHistory(string user,string id) {
        await Document(user,id,FestivalKind);
        return (await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalHistory" && x.Name==id).OrderByDescending(x=>x.CreatedAt).Take(100).ToArrayAsync()).Select(x=>new {x.Id,x.CreatedAt, content=JsonSerializer.Deserialize<JsonElement>(x.Content,Json)});
    }
    public async Task<object> FestivalAllocate(string user,string id,FestivalAllocation b,string? version) {
        var d=await Document(user,id,FestivalKind);Version(d,version);var festival=FestivalRead(d);
        Require(festival.State!="Cancelled","已取消计划不能关联交易");
        var amount=FestivalRules.Amount(b.Amount); Require(amount>0 && !string.IsNullOrWhiteSpace(b.Category) && b.Category.Length<=80 && b.Note.Length<=1000,"归属金额或分类无效");
        var t=await db.Transactions.AsNoTracking().Include(x=>x.Entries).SingleOrDefaultAsync(x=>x.UserId==user && x.Id==b.TransactionId) ?? throw new ApiException(404,"交易不存在");
        Require(t.Status=="Confirmed" && t.Type is "Expense" or "Refund" && t.BusinessId==null,"仅可关联本人已确认普通支出或退款");
        Require(b.Rate>0 && b.Rate<=1000000 && decimal.Round(b.Rate,8)==b.Rate && b.RateSource.Length is >0 and <=100,"汇率无效");
        Require(t.Currency==festival.Currency ? b.Rate==1 && b.RateSource=="SameCurrency" : b.RateDate!=null && b.RateSource!="SameCurrency","跨币种须明确汇率日期及来源");
        Require(b.PurchaseId==null || festival.Purchases.Any(x=>x.Id==b.PurchaseId),"采购项目不存在");
        var same=await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAllocation" && x.TransactionId==t.Id).ToArrayAsync();
        var active=same.Select(FestivalLinkRead).Where(x=>!x.Revoked).Select(x=>x.Input).ToArray();
        Require(active.Sum(x=>Money(x.Amount))+amount<=t.Amount,"跨节日分配合计超过交易金额");
        Require(!same.Any(x=>x.Name==id && !FestivalLinkRead(x).Revoked && FestivalLinkRead(x).Input.EntryId==b.EntryId && FestivalLinkRead(x).Input.Category==b.Category && FestivalLinkRead(x).Input.PurchaseId==b.PurchaseId),"该交易归属已存在，请先撤销原关联");
        if(b.EntryId!=null) { var entry=t.Entries.SingleOrDefault(x=>x.Id==b.EntryId && (x.Kind=="Expense" || t.Type=="Refund")); Require(entry!=null && active.Where(x=>x.EntryId==b.EntryId).Sum(x=>Money(x.Amount))+amount<=Math.Abs(entry.Amount),"分录分配超过原分录金额"); }
        if(t.Type=="Refund") {
            Require(t.OriginalTransactionId!=null,"退款缺少原交易");
            var originals=await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAllocation" && x.Name==id && x.TransactionId==t.OriginalTransactionId).ToArrayAsync();
            var original=originals.Select(FestivalLinkRead).Where(x=>!x.Revoked).Select(x=>x.Input).Where(x=>x.Category==b.Category).ToArray();
            var refundDocs=await (from a in db.Documents join tx in db.Transactions on a.TransactionId equals tx.Id where a.UserId==user && a.Kind=="FestivalAllocation" && a.Name==id && tx.OriginalTransactionId==t.OriginalTransactionId && tx.Type=="Refund" select a).AsNoTracking().ToArrayAsync();
            Require(original.Length>0 && refundDocs.Select(FestivalLinkRead).Where(x=>!x.Revoked && x.Input.Category==b.Category).Sum(x=>Money(x.Input.Amount))+amount<=original.Sum(x=>Money(x.Amount)),"退款分配超过该节日分类原支出");
            Require(original.All(x=>x.Rate==b.Rate),"退款按原支出归属汇率冲减；汇兑损益由原账务系统单独处理");
        }
        var link=new StoredDocument {UserId=user,Kind="FestivalAllocation",Name=id,TransactionId=t.Id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new FestivalAllocationRecord(b, OriginalCurrency:t.Currency),Json)};
        db.Add(link);FestivalArchive(user,d,"Link:"+link.Id); d.Version++;
        return new {link.Id,version=d.Version.ToString()};
    }
    public async Task<object> FestivalRevoke(string user,string id,string linkId,string? version) {
        var d=await Document(user,id,FestivalKind);Version(d,version);var link=await Document(user,linkId,"FestivalAllocation");Require(link.Name==id,"关联不属于该节日");var record=FestivalLinkRead(link);
        Require(!record.Revoked,"关联已撤销");link.Content=JsonSerializer.SerializeToUtf8Bytes(record with {Revoked=true},Json);link.Version++;FestivalArchive(user,d,"Unlink:"+linkId);d.Version++;return new {version=d.Version.ToString()};
    }
    public async Task<object> FestivalTransactionChoices(string user,IQueryCollection query) {
        var (page,size)=Paging(query);var keyword=query["keyword"].ToString();Require(keyword.Length<=100,"搜索词过长");
        var q=db.Transactions.AsNoTracking().Where(x=>x.UserId==user && x.Status=="Confirmed" && (x.Type=="Expense" || x.Type=="Refund") && x.BusinessId==null);
        if(keyword!="") q=q.Where(x=>x.Id==keyword || x.Note.Contains(keyword) || x.Merchant!=null && x.Merchant.Contains(keyword));
        return new {items=await q.OrderByDescending(x=>x.OccurredAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).Select(x=>new {x.Id,x.Type,amount=M(x.Amount),x.Currency,x.Note,x.OccurredAt,x.OriginalTransactionId,entries=x.Entries.Where(e=>e.Kind=="Expense").Select(e=>new {e.Id,amount=M(e.Amount),e.CategoryId})}).ToArrayAsync(),total=await q.CountAsync(),page,pageSize=size};
    }
    internal sealed record FestivalReportData(StoredDocument[] Links, Dictionary<string,FinanceTransaction> Transactions, FinanceTransaction[] Refunds, ILookup<string,FestivalAllocation> Groups);
    internal async Task<FestivalReportData> FestivalLoadReports(string user) {
        var links=await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAllocation").ToArrayAsync(); var ids=links.Select(x=>x.TransactionId!).Distinct().ToArray();
        return new(links,await db.Transactions.AsNoTracking().Include(x=>x.Entries).Where(x=>x.UserId==user && ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id),await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && x.Type=="Refund" && x.Status=="Confirmed" && ids.Contains(x.OriginalTransactionId!)).ToArrayAsync(),links.Select(FestivalLinkRead).Where(x=>!x.Revoked).ToLookup(x=>x.Input.TransactionId,x=>x.Input));
    }
    internal async Task<object> FestivalReport(string user,StoredDocument doc,FestivalReportData? source=null) {
        var b=FestivalRead(doc);
        var links=source==null ? await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAllocation" && x.Name==doc.Id).ToArrayAsync() : source.Links.Where(x=>x.Name==doc.Id).ToArray();
        var active=links.Where(x=>!FestivalLinkRead(x).Revoked).ToArray();var ids=active.Select(x=>x.TransactionId!).Distinct().ToArray();
        var txs=source?.Transactions ?? await db.Transactions.AsNoTracking().Include(x=>x.Entries).Where(x=>x.UserId==user && ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id);
        var allLinks=source?.Links ?? await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAllocation" && ids.Contains(x.TransactionId!)).ToArrayAsync();
        var groups=source?.Groups ?? allLinks.Select(FestivalLinkRead).Where(x=>!x.Revoked).ToLookup(x=>x.Input.TransactionId,x=>x.Input);
        var warnings=new List<string>();var valid=new List<(StoredDocument Doc,FestivalAllocation Input,FinanceTransaction Tx,decimal Converted)>();
        foreach(var link in active) {
            var a=FestivalLinkRead(link).Input;var siblings=groups[a.TransactionId].ToArray();
            if(!txs.TryGetValue(a.TransactionId,out var t) || t.Status!="Confirmed" || t.Type is not ("Expense" or "Refund") || t.BusinessId!=null || siblings.Sum(x=>Money(x.Amount))>t.Amount || a.EntryId!=null && !t.Entries.Any(e=>e.Id==a.EntryId && siblings.Where(x=>x.EntryId==a.EntryId).Sum(x=>Money(x.Amount))<=Math.Abs(e.Amount))) { warnings.Add("交易关联失效，请核对："+link.Id);continue; }
            if(FestivalLinkRead(link).OriginalCurrency is string originalCurrency && originalCurrency!=t.Currency || t.Currency==b.Currency && a.Rate!=1 || t.Currency!=b.Currency && (a.RateDate==null || a.RateSource=="SameCurrency")) {warnings.Add("交易币种已变更，请重新关联："+link.Id);continue;}
            valid.Add((link,a,t,decimal.Round(Money(a.Amount)*a.Rate,2,MidpointRounding.AwayFromZero)));
        }
        var expenses=valid.Where(x=>x.Tx.Type=="Expense").ToArray();var refunds=valid.Where(x=>x.Tx.Type=="Refund" && expenses.Any(e=>e.Tx.Id==x.Tx.OriginalTransactionId && e.Input.Category==x.Input.Category && e.Input.Rate==x.Input.Rate)).ToArray();
        refunds=refunds.Where(r=>refunds.Where(x=>x.Tx.OriginalTransactionId==r.Tx.OriginalTransactionId && x.Input.Category==r.Input.Category).Sum(x=>Money(x.Input.Amount))<=expenses.Where(e=>e.Tx.Id==r.Tx.OriginalTransactionId && e.Input.Category==r.Input.Category).Sum(e=>Money(e.Input.Amount))).ToArray();
        foreach(var r in valid.Where(x=>x.Tx.Type=="Refund" && !refunds.Contains(x))) warnings.Add("退款原归属失效："+r.Doc.Id);
        var refundTxs=source?.Refunds ?? await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && x.Type=="Refund" && x.Status=="Confirmed" && ids.Contains(x.OriginalTransactionId!)).ToArrayAsync();
        foreach(var e in expenses.GroupBy(x=>x.Tx.Id)) {
            var refundAmount=refundTxs.Where(x=>x.OriginalTransactionId==e.Key).Sum(x=>x.Amount);
            var assigned=refunds.Where(x=>x.Tx.OriginalTransactionId==e.Key).Sum(x=>Money(x.Input.Amount));
            if(refundAmount>0 && assigned<Math.Min(refundAmount,e.Sum(x=>Money(x.Input.Amount)))) warnings.Add("原交易存在尚未明确归属的退款："+e.Key);
        }
        var gross=expenses.Sum(x=>x.Converted);var returned=refunds.Sum(x=>x.Converted);if(returned>gross) {warnings.Add("退款超过有效归属支出");returned=0;}
        var paidIds=expenses.Where(x=>x.Input.PurchaseId!=null).Select(x=>x.Input.PurchaseId).ToHashSet();
        var commitment=b.Purchases.Where(x=>x.State=="Approved" && !paidIds.Contains(x.Id)).Sum(x=>Money(x.Amount));
        var intention=b.Purchases.Where(x=>x.State is "Idea" or "Comparing" or "PendingApproval").Where(x=>!paidIds.Contains(x.Id)).Sum(x=>Money(x.Amount));
        var net=gross-returned;var budget=Money(b.Budget);var available=budget-net-commitment;
        var today=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        var months=Math.Max(1,(b.StartsOn.Year-today.Year)*12+b.StartsOn.Month-today.Month);
        return new {currency=b.Currency,budget=M(budget),gross=M(gross),refunds=M(returned),net=M(net),commitment=M(commitment),intention=M(intention),available=M(available),forecast=M(net+commitment+intention),variance=M(net+commitment+intention-budget),complete=warnings.Count==0,warnings,
            categories=expenses.Select(x=>x.Input.Category).Union(refunds.Select(x=>x.Input.Category)).Distinct().Select(c=>new {category=c,net=M(expenses.Where(x=>x.Input.Category==c).Sum(x=>x.Converted)-refunds.Where(x=>x.Input.Category==c).Sum(x=>x.Converted))}),
            allocations=valid.Select(x=>new {x.Doc.Id,input=x.Input,type=x.Tx.Type,originalCurrency=x.Tx.Currency,converted=M(x.Converted),occurredAt=x.Tx.OccurredAt}),
            saving=new {target=M(b.SavingTarget),plannedReserved=M(b.Reserved),gap=M(b.SavingTarget-b.Reserved),monthly=M(decimal.Ceiling((b.SavingTarget-b.Reserved)/months)),note="用户登记的计划预留，不代表存款或资金划转"},
            countdown=b.StartsOn.DayNumber-today.DayNumber,purchased=paidIds.Count,totalPurchases=b.Purchases.Length,
            scope="仅归集已关联交易；未关联流水、待返现与推测优惠不计入；部分退款需明确关联；跨币种按用户确认的归属汇率统计"};
    }
    public async Task<object> FestivalRecords(string user,string id,string kind) {
        await Document(user,id,FestivalKind);return (await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind==kind && x.Name==id).OrderByDescending(x=>x.CreatedAt).Take(50).ToArrayAsync()).Select(x=>new{x.Id,version=x.Version.ToString(),x.CreatedAt,content=JsonSerializer.Deserialize<JsonElement>(x.Content,Json)});
    }
    public async Task<object> FestivalReviewSave(string user,string id,FestivalReview b,string? version) {
        var d=await Document(user,id,FestivalKind);Version(d,version);Require(b.Satisfaction is null or >=1 and <=5 && b.Note!=null && b.Note.Length<=4000,"复盘内容无效");
        db.Add(new StoredDocument {UserId=user,Kind="FestivalReview",Name=id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new {review=b,report=await FestivalReport(user,d)},Json)});FestivalArchive(user,d,"Review");d.Version++;return new {version=d.Version.ToString()};
    }
}
public static class FestivalEndpoints
{
    public static void Map(RouteGroupBuilder api) {
        api.MapGet("/festivals/definitions",(int year,HttpContext c)=>FinanceEndpoints.Ok(c,FestivalRules.Definitions(year)));
        api.MapGet("/festivals",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalList(FinanceEndpoints.User(c),c.Request.Query)));
        api.MapGet("/festivals/transactions",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalTransactionChoices(FinanceEndpoints.User(c),c.Request.Query)));
        api.MapGet("/festivals/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalDetail(FinanceEndpoints.User(c),id)));
        api.MapGet("/festivals/{id}/history",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalHistory(FinanceEndpoints.User(c),id)));
        api.MapPost("/festivals",async(FestivalInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalSave(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/festivals/{id}",async(string id,FestivalInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalSave(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapPost("/festivals/{id}/allocations",async(string id,FestivalAllocation b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalAllocate(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapPost("/festivals/{id}/allocations/{linkId}/revoke",async(string id,string linkId,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id,linkId},async()=>await f.FestivalRevoke(FinanceEndpoints.User(c),id,linkId,c.Request.Headers.IfMatch),true));
        api.MapPost("/festivals/{id}/reviews",async(string id,FestivalReview b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalReviewSave(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/festivals/{id}/reviews",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalRecords(FinanceEndpoints.User(c),id,"FestivalReview")));
        api.MapGet("/festivals/annual",async(int year,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalAnnual(FinanceEndpoints.User(c),year)));
        api.MapGet("/festivals/recipients",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalRecipients(FinanceEndpoints.User(c))));
        api.MapPost("/festivals/recipients",async(FestivalRecipient b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalRecipientSave(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/festivals/recipients/{id}",async(string id,FestivalRecipient b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalRecipientSave(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/festivals/reminders",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalReminders(FinanceEndpoints.User(c))));
        api.MapPost("/festivals/{id}/repeat",async(string id,FestivalRepeatRequest b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FestivalRepeat(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/festivals/{id}/value-compare",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalValueCompare(FinanceEndpoints.User(c),id)));
        FestivalAiEndpoints.Map(api);
        FestivalAttachmentEndpoints.Map(api);
    }
}








