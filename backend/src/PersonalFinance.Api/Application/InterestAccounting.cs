using System.Text.Json;
using System.Numerics;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public sealed record InterestArtistShare(string ArtistId, string Amount);
public sealed record InterestItem(string Id, string Name, string? BrandId, string Category, string Specification, int Quantity,
    string UnitPrice, string Discount, string Shipping, string Tax, string Paid, string Purpose, string State,
    InterestArtistShare[] Artists, string Note = "", bool Related = true);
public sealed record InterestRefund(string TransactionId, string ItemId, string Amount);
public sealed record InterestPurchase(DateOnly PurchasedOn, string Currency, string Channel, string Merchant, string OrderNumber,
    string? TransactionId, string? SceneId, string Type, string State, InterestItem[] Items, InterestRefund[] Refunds,
    string[] Tags, string Note);
public sealed record InterestMember(string ArtistId, string Role, DateOnly? JoinedOn, DateOnly? LeftOn);
public sealed record InterestArtistProfile(string Type, string[] Aliases, InterestMember[] Members);
public sealed record InterestTopic(string Name, string Kind, string Note, InterestArtistProfile? ArtistProfile = null);
public sealed record InterestBrandLink(string ArtistId, string BrandId, DateOnly? StartsOn, DateOnly? EndsOn, string Note);
public sealed record InterestBudget(string Name, string? ArtistId, string? BrandId, string Scope, int Year, int? Month, string Currency, string Amount);
public static class InterestRules
{
    public static decimal Amount(string s) => FestivalRules.Amount(s);
    public static decimal Share(InterestItem item, decimal amount, string artist) {
        var paid=Paid(item); if(paid==0 || amount==0) return 0;
        var weights=item.Artists.Select(a=>(Id:a.ArtistId,Weight:Amount(a.Amount))).ToList();
        weights.Add(("",paid-weights.Sum(x=>x.Weight)));
        return Apportion(amount,weights).GetValueOrDefault(artist);
    }
    public static Dictionary<string,decimal> Apportion(decimal amount,IEnumerable<(string Id,decimal Weight)> source) {
        var weights=source.ToArray();var total=weights.Sum(x=>x.Weight);
        FinanceService.Require(weights.All(x=>x.Weight>=0 && decimal.Truncate(x.Weight*100)==x.Weight*100) && weights.Select(x=>x.Id).Distinct().Count()==weights.Length && decimal.Truncate(amount*100)==amount*100,"分币权重或金额无效");
        if(total==0) {FinanceService.Require(amount==0,"零权重不能分配非零金额");return weights.ToDictionary(x=>x.Id,_=>0m);}
        var absolute=new BigInteger(Math.Abs(amount)*100);var denominator=new BigInteger(total*100);
        var parts=weights.Select(x=>{var cents=BigInteger.DivRem(absolute*new BigInteger(x.Weight*100),denominator,out var remainder);return new {x.Id,Cents=cents,Remainder=remainder};}).ToArray();
        var cents=parts.ToDictionary(x=>x.Id,x=>x.Cents);
        var remaining=(int)(absolute-cents.Values.Aggregate(BigInteger.Zero,(sum,value)=>sum+value));
        FinanceService.Require(remaining>=0 && remaining<=weights.Length,"分币校验失败");
        foreach(var p in parts.OrderByDescending(x=>x.Remainder).ThenBy(x=>x.Id,StringComparer.Ordinal).Take(remaining)) cents[p.Id]++;
        return cents.ToDictionary(x=>x.Key,x=>Math.Sign(amount)*(decimal)x.Value/100);
    }
    public static decimal Paid(InterestItem i) {
        FinanceService.Require(i.Quantity is > 0 and <= 10000, "数量须为1至10000");
        var gross = Amount(i.UnitPrice) * i.Quantity;
        var discount = Amount(i.Discount); FinanceService.Require(discount <= gross, "优惠超过原价");
        var paid = gross - discount + Amount(i.Shipping) + Amount(i.Tax);
        FinanceService.Require(paid == Amount(i.Paid), "商品实付须等于数量乘单价减优惠加运费及税费");
        FinanceService.Require(i.Artists != null && i.Artists.Select(x => x.ArtistId).Distinct().Count() == i.Artists.Length && i.Artists.Sum(x => Amount(x.Amount)) <= paid, "艺人分配重复或超过商品实付");
        return paid;
    }
}
public sealed partial class FinanceService
{
    const string InterestPurchaseKind = "MusicPurchase";
    static T InterestRead<T>(StoredDocument d) => JsonSerializer.Deserialize<T>(d.Content, Json)!;
    async Task<StoredDocument[]> InterestDocs(string user, string kind) => await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == kind).OrderByDescending(x => x.CreatedAt).ToArrayAsync();
    public async Task<object> InterestCatalog(string user) {
        await RequireConcerts(user);
        return new { topics = (await InterestDocs(user, "MusicTopic")).Select(d => new { d.Id, version = d.Version.ToString(), input = InterestRead<InterestTopic>(d) }),
            links = (await InterestDocs(user,"MusicBrandLink")).Select(d => new {d.Id, version=d.Version.ToString(),input=InterestRead<InterestBrandLink>(d)}),
            budgets = (await InterestDocs(user,"MusicBudget")).Select(d => new {d.Id,version=d.Version.ToString(),input=InterestRead<InterestBudget>(d)}) };
    }
    async Task<object> SaveInterestDocument<T>(string user, string kind, string? id, T input, string? version) {
        var d = id == null ? new StoredDocument {UserId=user,Kind=kind,ContentType="application/json"} : await Document(user,id,kind);
        if (id == null) { Require(version=="0", "新记录版本应为0"); db.Add(d); } else {Version(d,version); d.Version++;}
        var before = id == null ? null : Convert.ToBase64String(d.Content);
        d.Content=JsonSerializer.SerializeToUtf8Bytes(input,Json);
        ConcertAudit(user,d.Id,"InterestUpdate",new { kind, before, after=input });
        return new {d.Id,version=d.Version.ToString()};
    }
    public async Task<object> SaveInterestTopic(string user,string? id,InterestTopic b,string? version) {
        await RequireConcerts(user); ConcertText(b.Name,100,true);ConcertText(b.Note,2000);
        Require(b.Kind is "Artist" or "Brand", "专题类型无效");
        if(id!=null) {
            var old=InterestRead<InterestTopic>(await Document(user,id,"MusicTopic"));
            Require(old.Kind==b.Kind,"不能更改专题类型");
            b=b with{ArtistProfile=b.ArtistProfile??old.ArtistProfile};
        }
        b=await ValidateArtistProfile(user,id,b);
        return await SaveInterestDocument(user,"MusicTopic",id,b,version);
    }
    async Task RequireInterestTopic(string user,string? id,string kind) {
        if(id!=null) Require(InterestRead<InterestTopic>(await Document(user,id,"MusicTopic")).Kind==kind,"专题类型不匹配");
    }
    public async Task<object> SaveInterestLink(string user,string? id,InterestBrandLink b,string? version) {
        await RequireConcerts(user); ConcertIds([b.ArtistId,b.BrandId]); await RequireInterestTopic(user,b.ArtistId,"Artist");await RequireInterestTopic(user,b.BrandId,"Brand");
        Require(b.EndsOn==null || b.StartsOn==null || b.EndsOn>=b.StartsOn,"关联有效期无效");ConcertText(b.Note,2000);
        return await SaveInterestDocument(user,"MusicBrandLink",id,b,version);
    }
    public async Task<object> SaveInterestBudget(string user,string? id,InterestBudget b,string? version) {
        await RequireConcerts(user);await RequireInterestTopic(user,b.ArtistId,"Artist");await RequireInterestTopic(user,b.BrandId,"Brand");
        ConcertText(b.Name,100,true);InterestRules.Amount(b.Amount);
        Require(b.Year is >=1900 and <=9900 && (b.Month==null || b.Month is >=1 and <=12) && CurrencyDefinitions.Supports(b.Currency) && b.Scope is "All" or "Daily" or "Concert","预算范围无效");
        return await SaveInterestDocument(user,"MusicBudget",id,b,version);
    }
    public async Task<object> SaveInterestPurchase(string user,string? id,InterestPurchase b,string? version) {
        await RequireConcerts(user);
        Require(b.Items is {Length:>0 and <=200} && b.Refunds is {Length:<=200} && b.Tags is {Length:<=30},"商品、退款或标签数量无效");
        Require(CurrencyDefinitions.Supports(b.Currency) && b.PurchasedOn.Year is >=1900 and <=9900 && b.State is "Planned" or "Purchased" or "Cancelled" && b.Type is "Daily" or "LiveMerch" or "Album" or "Collection" or "ConcertDirect" or "Travel","购买状态或类型无效");
        foreach(var s in new[]{b.Channel,b.Merchant,b.OrderNumber}) ConcertText(s);ConcertText(b.Note,2000);foreach(var s in b.Tags) ConcertText(s,80);
        ConcertIds(b.Items.Select(x=>x.Id));
        foreach(var i in b.Items) {
            ConcertText(i.Name,200,true);ConcertText(i.Specification);ConcertText(i.Category,80,true);ConcertText(i.Note,2000);
            Require(new[]{"Pending","Held","Gifted","Sold","Returned"}.Contains(i.State) && new[]{"Daily","Support","Collection","Gift","Other"}.Contains(i.Purpose),"商品状态或用途无效");
            Require(i.Related || i.BrandId==null && i.Artists.Length==0,"普通商品不能同时关联艺人或品牌");ConcertIds(i.Artists.Select(x=>x.ArtistId));InterestRules.Paid(i);await RequireInterestTopic(user,i.BrandId,"Brand");foreach(var a in i.Artists) await RequireInterestTopic(user,a.ArtistId,"Artist");
        }
        Require(b.State=="Purchased" ? b.TransactionId!=null : b.TransactionId==null && b.Refunds.Length==0,"计划和取消记录不得关联付款或退款");
        if(b.SceneId!=null) {var scene=ConcertRead(await ConcertDoc(user,b.SceneId));Require(scene.Currency==b.Currency,"场次与商品币种须一致");}
        Require(b.SceneId==null || b.Type is "LiveMerch" or "ConcertDirect" or "Travel","日常商品不应关联场次，请明确选择现场周边、演出直接消费或行程类型");
        var others=(await InterestDocs(user,InterestPurchaseKind)).Where(d=>d.Id!=id).Select(InterestRead<InterestPurchase>).ToArray();
        Require(!others.SelectMany(x=>x.Items).Any(x=>b.Items.Any(i=>i.Id==x.Id)),"商品稳定ID已用于另一购买记录");
        if(b.TransactionId!=null) {
            await ValidateCollectionSourceExclusion(user,[],[b.TransactionId]);
            Require(b.PurchasedOn<=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime),"实际购买日期不能晚于今天，请使用购买计划");
            var t=await db.Transactions.AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==b.TransactionId);
            Require(t!=null && t.Type=="Expense" && t.Status=="Confirmed" && t.OccurredAt<=DateTimeOffset.UtcNow && t.BusinessId==null && t.Currency==b.Currency,"须关联本人已确认的同币种真实消费");
            Require(others.Where(x=>x.TransactionId==b.TransactionId).SelectMany(x=>x.Items).Sum(InterestRules.Paid)+b.Items.Sum(InterestRules.Paid)<=t!.Amount,"商品跨订单分配超过交易金额");
            var scenes=(await ConcertDocs(user)).Select(ConcertRead).ToArray();
            var sceneAlloc=scenes.SelectMany(ConcertRules.EffectiveCosts).Where(x=>x.TransactionId==b.TransactionId).Sum(x=>InterestRules.Amount(x.Amount));
            var transferReturnAlloc=ConcertReturnLinks(scenes).Where(p=>p.TransactionId==b.TransactionId).Sum(p=>ConcertRules.Amount(p.Amount));
            Require(sceneAlloc + transferReturnAlloc + others.Where(x=>x.TransactionId==b.TransactionId).SelectMany(x=>x.Items).Sum(InterestRules.Paid)+b.Items.Sum(InterestRules.Paid)<=t.Amount,"商品、原场次费用与转让返款分配合计超过付款，请先解除重复关联");
            foreach(var r in b.Refunds) {
                var item=b.Items.SingleOrDefault(x=>x.Id==r.ItemId);Require(item!=null,"退款商品不存在");
                var refund=await db.Transactions.AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==r.TransactionId);
                Require(refund!=null && refund.Type=="Refund" && refund.Status=="Confirmed" && refund.Currency==b.Currency && refund.OriginalTransactionId==b.TransactionId,"退款须关联原付款下已确认的真实退款");
                Require(others.SelectMany(x=>x.Refunds).Concat(b.Refunds).Where(x=>x.TransactionId==r.TransactionId).Sum(x=>InterestRules.Amount(x.Amount))+scenes.SelectMany(x=>x.Refunds).Where(x=>x.TransactionId==r.TransactionId).Sum(x=>InterestRules.Amount(x.ReceivedAmount))<=refund!.Amount,"分配超过实际退款");
                Require(b.Refunds.Where(x=>x.ItemId==r.ItemId).Sum(x=>InterestRules.Amount(x.Amount))<=InterestRules.Paid(item!),"退款超过商品实付");
            }
            Require(b.Refunds.Select(x=>(x.TransactionId,x.ItemId)).Distinct().Count()==b.Refunds.Length,"退款分配重复");
        }
        return await SaveInterestDocument(user,InterestPurchaseKind,id,b,version);
    }
    public async Task<object> InterestPurchases(string user,int page,int size) {
        await RequireConcerts(user);Require(page is >0 and <=1000000 && size is >0 and <=100,"分页参数无效");
        var q=db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind==InterestPurchaseKind);
        var total=await q.CountAsync();var docs=await q.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new {total,items=docs.Select(d=>new{d.Id,version=d.Version.ToString(),input=InterestRead<InterestPurchase>(d)})};
    }
}





