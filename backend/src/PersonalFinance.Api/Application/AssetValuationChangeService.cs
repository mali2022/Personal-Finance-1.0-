using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public Task<object> AssetValuationChange(string user, DateOnly openingDate, DateOnly closingDate, string currency)
        => AssetValuationChangeCore(user, openingDate, closingDate, currency);

    private async Task<object> AssetValuationChangeCore(string user, DateOnly openingDate, DateOnly closingDate, string currency, object? closingSnapshot = null)
    {
        AssetDate(openingDate); AssetDate(closingDate); AssetCurrency(currency); Require(closingDate>=openingDate,"估值变动日期无效");
        async Task<JsonElement> Snapshot(DateOnly date) => JsonSerializer.SerializeToElement(await AssetAllocation(user,new QueryCollection(new Dictionary<string,StringValues>{["date"]=date.ToString("yyyy-MM-dd"),["currency"]=currency})),Json);
        var before=await Snapshot(openingDate); var after=closingSnapshot == null ? await Snapshot(closingDate) : JsonSerializer.SerializeToElement(closingSnapshot,Json);
        var left=before.GetProperty("items").EnumerateArray().ToDictionary(x=>x.GetProperty("id").GetString()!);
        var right=after.GetProperty("items").EnumerateArray().ToDictionary(x=>x.GetProperty("id").GetString()!);
        var investmentIds=(await db.Set<InvestmentAsset>().AsNoTracking().Where(x=>x.UserId==user).Select(x=>x.Id).ToArrayAsync()).ToHashSet();
        var trades=await db.Set<InvestmentTrade>().AsNoTracking().Where(x=>x.UserId==user && x.State=="Active" && x.SettlementDate<=closingDate).ToArrayAsync();
        var prices=await db.Set<InvestmentValuation>().AsNoTracking().Where(x=>x.UserId==user && x.Date<=closingDate).ToArrayAsync();
        Require(trades.Length<=100000 && prices.Length<=100000,"估值变动历史超过汇总上限");
        var tradeGroups=trades.GroupBy(x=>x.AssetId).ToDictionary(g=>g.Key,g=>g.ToArray());
        var priceGroups=prices.GroupBy(x=>x.AssetId).ToDictionary(g=>g.Key,g=>g.ToArray());
        var physicalIds=(await db.Set<ManagedAsset>().AsNoTracking().Where(x=>x.UserId==user && x.Type!="TermDeposit").Select(x=>x.Id).ToArrayAsync()).ToHashSet();
        decimal? Value(JsonElement x,string key) => x.ValueKind==JsonValueKind.Undefined || x.GetProperty(key).ValueKind==JsonValueKind.Null ? null : decimal.Parse(x.GetProperty(key).GetString()!,CultureInfo.InvariantCulture);
        decimal? Rate(JsonElement x) => x.ValueKind==JsonValueKind.Undefined ? null : x.GetProperty("currency").GetString()==currency ? 1 : Value(x,"rate");
        decimal Round(decimal value)=>decimal.Round(value,2,MidpointRounding.AwayFromZero);
        var rows=new List<object>(); decimal native=0,fx=0,ledger=0,nonCash=0,other=0,positionChange=0,change=0; var uncovered=0;
        foreach(var id in left.Keys.Union(right.Keys)) {
            left.TryGetValue(id,out var l);right.TryGetValue(id,out var r);
            var label=r.ValueKind!=JsonValueKind.Undefined?r.GetProperty("name").GetString():l.GetProperty("name").GetString();
            var v0=l.ValueKind==JsonValueKind.Undefined?0:Value(l,"originalAmount");var v1=r.ValueKind==JsonValueKind.Undefined?0:Value(r,"originalAmount");
            var r0=Rate(l)??(l.ValueKind==JsonValueKind.Undefined?Rate(r):null);var r1=Rate(r)??(r.ValueKind==JsonValueKind.Undefined?Rate(l):null);
            if(v0==null || v1==null || r0==null || r1==null) {uncovered++; rows.Add(new{id,name=label,change=(string?)null,missing="期初或期末缺少可靠估值/汇率，未纳入已覆盖变动"});continue;}
            var delta=Round(v1.Value*r1.Value)-Round(v0.Value*r0.Value);
            var originalEffect=Round((v1.Value-v0.Value)*r0.Value);var exchangeEffect=delta-originalEffect;
            var kind=investmentIds.Contains(id)||physicalIds.Contains(id)?"NonCashAssetValueChange":"AccountLedgerChange";
            decimal? priceEffect=null; decimal? quantityEffect=null;
            if(investmentIds.Contains(id)) {
                var history=tradeGroups.GetValueOrDefault(id,[]);
                var q0=InvestmentMath.Calculate(history.Where(x=>x.SettlementDate<=openingDate)).Quantity;
                var q1=InvestmentMath.Calculate(history).Quantity;
                var snapshots=priceGroups.GetValueOrDefault(id,[]);
                var p0=snapshots.Where(x=>x.Date<=openingDate).OrderByDescending(x=>x.Date).FirstOrDefault()?.Price;
                var p1=snapshots.OrderByDescending(x=>x.Date).FirstOrDefault()?.Price;
                // With no opening holding, use closing price for the quantity reference; no invented prior price gain.
                if(q0==0 && p0==null)p0=p1;
                if(p0!=null && p1!=null) {
                    priceEffect=Round(q1*(p1.Value-p0.Value)*r0.Value);
                    quantityEffect=originalEffect-priceEffect.Value;
                    positionChange+=quantityEffect.Value;
                }
            }
            // Newly appearing/disappearing physical assets lack a historical disposal/acquisition cash link.
            if(physicalIds.Contains(id) && (l.ValueKind==JsonValueKind.Undefined || r.ValueKind==JsonValueKind.Undefined))kind="OtherAdjustment";
            native+=originalEffect;fx+=exchangeEffect;change+=delta;
            if(kind=="AccountLedgerChange")ledger+=originalEffect;else if(kind=="NonCashAssetValueChange")nonCash+=priceEffect??originalEffect;else other+=originalEffect;
            rows.Add(new{id,name=label,openingOriginal=M(v0.Value),closingOriginal=M(v1.Value),openingRate=D(r0.Value),closingRate=D(r1.Value),originalValueEffect=M(originalEffect),priceValuationEffect=priceEffect==null?null:M(priceEffect.Value),positionQuantityEffect=quantityEffect==null?null:M(quantityEffect.Value),fxTranslationEffect=M(exchangeEffect),change=M(delta),kind,missing=(string?)null});
        }
        return new{openingDate,closingDate,currency,changeCovered=M(change),originalValueEffectCovered=M(native),fxTranslationEffectCovered=M(fx),accountLedgerChangeCovered=M(ledger),positionQuantityChangeCovered=M(positionChange),nonCashAssetValueChangeCovered=M(nonCash),otherAdjustmentCovered=M(other),unexplainedDifference=M(change-ledger-positionChange-nonCash-other-fx),complete=uncovered==0,uncovered,rows,scope="使用同一AssetAllocation期初期末快照；原币影响=(期末原币-期初原币)×期初汇率。证券价格影响=期末数量×价格差×期初汇率，数量影响为原币差额扣除价格影响；期初无持仓且无价格时以期末价格作数量参考，不虚构期间价格收益。汇率影响为剩余折算差额，合计可核对。折算不入现金账；实际外汇交易保留业务汇率与分录，不推算无成本依据的已实现汇兑损益。历史归属状态及期初生效日期仍为估算。"};
    }
}
