using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed record ConcertArtistCostPart(decimal Paid, decimal Refund, decimal Net, decimal Loss);
public static class ConcertArtistMath {
    // Round each original cost once. Refunds/losses use those actual cent weights, not a fresh ratio rounding.
    public static Dictionary<string,ConcertArtistCostPart> SplitCost(ConcertInput scene, decimal paid, decimal refunded, decimal loss=0, InterestItem? item=null) {
        FinanceService.Require(paid>=0 && refunded>=0 && loss>=0 && refunded+loss<=paid,"艺人费用分配超过原费用");
        var weights=item==null
            ? scene.ArtistAllocation!.Shares.Select(s=>(Id:s.ArtistId,Weight:s.Ratio)).Append((Id:"",Weight:100-scene.ArtistAllocation.Shares.Sum(s=>s.Ratio))).ToArray()
            : item.Artists.Select(a=>(Id:a.ArtistId,Weight:InterestRules.Amount(a.Amount))).Append((Id:"",Weight:paid-item.Artists.Sum(a=>InterestRules.Amount(a.Amount)))).ToArray();
        var payments=item==null?InterestRules.Apportion(paid,weights):weights.ToDictionary(w=>w.Id,w=>w.Weight);
        var refunds=InterestRules.Apportion(refunded,payments.Select(p=>(p.Key,p.Value)));
        var losses=InterestRules.Apportion(loss,payments.Select(p=>(p.Key,p.Value)));
        return payments.ToDictionary(p=>p.Key,p=>new ConcertArtistCostPart(p.Value,refunds[p.Key],p.Value-refunds[p.Key],losses[p.Key]));
    }
}
public sealed record ConcertArtistAttribution(string? ArtistId,string Name,decimal? SceneRatio,string OriginalCosts,string ConfirmedRefunds,string Actual,string OwnExpenseNet,string ConfirmedLoss,string PersonalNetCost);
public sealed partial class FinanceService {
    sealed class ArtistTotals { public decimal Paid,Refund,Net,Expense,Loss; }
    async Task<ConcertArtistAttribution[]?> ConcertArtistBreakdown(string user,string sceneId,ConcertInput scene,ConcertCost[] costs,ConcertRefund[] refunds,HashSet<string> expenseIds,Dictionary<string,decimal> merchantReturns,Dictionary<string,decimal> losses,InterestPurchase[] music) {
        if(scene.ArtistAllocation?.Mode!="Split") return null;
        var totals=scene.ArtistAllocation.Shares.ToDictionary(s=>s.ArtistId,_=>new ArtistTotals());totals[""]=new();
        var items=music.Where(p=>p.SceneId==sceneId && p.State=="Purchased" && p.TransactionId!=null).SelectMany(p=>p.Items.Select(i=>(Key:(p.TransactionId!,i.Id),Item:i))).ToDictionary(i=>i.Key,i=>i.Item);
        foreach(var cost in costs) {
            var returned=refunds.Where(r=>r.CostId==cost.Id).Sum(r=>ConcertRules.Amount(r.ReceivedAmount))+merchantReturns.GetValueOrDefault(cost.Id);
            var effective=cost.ArtistAllocation?.Mode=="Split"?scene with{ArtistAllocation=cost.ArtistAllocation}:scene;
            var parts=ConcertArtistMath.SplitCost(effective,ConcertRules.Amount(cost.Amount),returned,losses.GetValueOrDefault(cost.Id),items.GetValueOrDefault((cost.TransactionId,cost.Id)));
            foreach(var (id,part) in parts) {
                if(!totals.TryGetValue(id,out var total)) totals[id]=total=new();
                total.Paid+=part.Paid;total.Refund+=part.Refund;total.Net+=part.Net;
                if(expenseIds.Contains(cost.TransactionId)) total.Expense+=part.Net;
                total.Loss+=part.Loss;
            }
        }
        var names=(await InterestDocs(user,"MusicTopic")).Where(d=>InterestRead<InterestTopic>(d).Kind=="Artist").ToDictionary(d=>d.Id,d=>InterestRead<InterestTopic>(d).Name);
        return totals.Select(pair=>new ConcertArtistAttribution(pair.Key.Length==0?null:pair.Key,pair.Key.Length==0?"未分配":names.GetValueOrDefault(pair.Key)??pair.Key,
            pair.Key.Length==0?100-scene.ArtistAllocation.Shares.Sum(s=>s.Ratio):scene.ArtistAllocation.Shares.FirstOrDefault(s=>s.ArtistId==pair.Key)?.Ratio,
            M(pair.Value.Paid),M(pair.Value.Refund),M(pair.Value.Net),M(pair.Value.Expense),M(pair.Value.Loss),M(pair.Value.Expense+pair.Value.Loss))).ToArray();
    }
    static object[] ConcertYearArtistSummary(IEnumerable<JsonElement> rows,Dictionary<string,string> names) {
        var entries=new List<(string Key,string? Id,string Name,decimal Cost)>();
        foreach(var row in rows) {
            if(row.GetProperty("report").TryGetProperty("artistAttribution",out var attribution) && attribution.ValueKind==JsonValueKind.Array) {
                foreach(var part in attribution.EnumerateArray()) {
                    var id=part.GetProperty("artistId").GetString();var cost=Money(part.GetProperty("personalNetCost").GetString());
                    if(id==null && part.GetProperty("sceneRatio").GetDecimal()==0 && Money(part.GetProperty("originalCosts").GetString())==0 && cost==0) continue;
                    entries.Add((id==null?"unassigned":"id:"+id,id,id==null?"未分配（联合费用）":part.GetProperty("name").GetString()!,cost));
                }
            } else {
                var id=row.GetProperty("artistId").GetString();var name=names.GetValueOrDefault(id??"")??row.GetProperty("artist").GetString()!;
                entries.Add((id==null?"name:"+name:"id:"+id,id,name,Money(row.GetProperty("report").GetProperty("personalNetCost").GetString())));
            }
        }
        return entries.GroupBy(e=>e.Key).Select(g=>(object)new {key=g.Key,id=g.First().Id,name=g.First().Name,count=g.Count(),cost=M(g.Sum(e=>e.Cost))}).ToArray();
    }
}
