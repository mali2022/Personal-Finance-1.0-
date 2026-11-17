using System.Text.Json;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record ConcertRecoveryReport(string Received,string Returned,string NetRecovery,string PendingReturn,object[] Rows);
public sealed partial class FinanceService {
    static IEnumerable<ConcertTransferPayment> ConcertIncomeLinks(IEnumerable<ConcertInput> scenes)=>ConcertTransfers(scenes).SelectMany(s=>s.Receipts).Concat(scenes.SelectMany(s=>s.Insurance??[]).SelectMany(i=>i.Receipts));
    static IEnumerable<ConcertTransferPayment> ConcertReturnLinks(IEnumerable<ConcertInput> scenes)=>ConcertTransfers(scenes).SelectMany(s=>s.Returns).Concat(scenes.SelectMany(s=>s.Insurance??[]).SelectMany(i=>i.Returns));
    static void ValidateConcertClosingDetails(ConcertInput scene,ConcertInput? old,ConcertInput[] all,ConcertCost[] costs,Dictionary<string,FinanceTransaction> txs) {
        var claims=scene.Insurance??[];ConcertIds(claims.Select(c=>c.Id));Require(claims.Length<=100,"理赔记录最多100条");
        Require((old?.Insurance??[]).All(c=>claims.Any(n=>n.Id==c.Id)),"理赔记录须保留历史，请撤销记录");
        foreach(var claim in claims) {
            ConcertText(claim.Provider,200,true);ConcertText(claim.PolicyNumber);ConcertText(claim.Note,1000);var requested=Money(claim.RequestedAmount,true);
            Require(claim.State is "Open" or "Settled" or "Rejected" or "Revoked" && claim.Receipts.Length<=20 && claim.Returns.Length<=20,"理赔状态或明细数量无效");
            var ticket=scene.Orders.SelectMany(o=>o.Tickets??[]).SingleOrDefault(t=>t.Id==claim.TicketId);Require(ticket?.PaidShare!=null && requested<=Money(ticket.PaidShare),"理赔须关联已明确实付分配的门票，申请不得超过本票实付");
            ConcertIds(claim.Receipts.Select(p=>p.TransactionId));ConcertIds(claim.Returns.Select(p=>p.TransactionId));
            foreach(var p in claim.Receipts.Concat(claim.Returns)) {
                Money(p.Amount,true);var income=claim.Receipts.Contains(p);
                Require(txs.TryGetValue(p.TransactionId,out var tx) && tx.Status=="Confirmed" && tx.BusinessId==null && tx.Type==(income?"Income":"Expense") && tx.Currency==scene.Currency && tx.OccurredAt<=DateTimeOffset.UtcNow,"理赔资金须关联本人已发生已确认的同币种普通收入/返款支出");
                Require((income?ConcertIncomeLinks(all).Where(x=>x.TransactionId==p.TransactionId).Sum(x=>Money(x.Amount)):ConcertReturnLinks(all).Where(x=>x.TransactionId==p.TransactionId).Sum(x=>Money(x.Amount))+costs.Where(c=>c.TransactionId==p.TransactionId).Sum(c=>Money(c.Amount)))<=tx!.Amount,"理赔、转让或费用重复/超额分配资金来源");
            }
            var received=claim.Receipts.Sum(p=>Money(p.Amount));var returned=claim.Returns.Sum(p=>Money(p.Amount));Require(returned<=received && received-returned<=requested,"理赔返款不得超过实收，净实收不得超过申请额");
            Require(claim.State is not ("Rejected" or "Revoked") || received==returned,"拒绝或撤销理赔记录前须实际收支抵平");Require(claim.State!="Settled" || received>returned,"已到账结束的理赔须关联实际净回款");
        }
        foreach(var order in scene.Orders) foreach(var ticket in order.Tickets??[]) if(ticket.Outcome is {} outcome) {
            ConcertText(outcome.Note,1000);Require(outcome.State is "Open" or "Unused","门票结果无效");
            Require(outcome.State!="Unused" || ticket.PaidShare!=null && ticket.State!="Used" && (scene.StartsAt<=DateTimeOffset.UtcNow || scene.State=="Cancelled"),"未使用核算需明确实付，演出已结束或已取消，且不能已使用");
            Require(outcome.State!="Unused" || !scene.Refunds.Any(r=>ConcertRules.OrderCost(r.CostId,order.Id) && r.TransactionId!=null && r.TicketId==null),"请先明确该订单实际退款的逐票归属，再核算未使用损失");
            var mixed=ConcertRules.EffectiveCosts(scene with{Orders=[order],Costs=[]}).Any(c=>txs.TryGetValue(c.TransactionId,out var tx) && tx.Type=="ReimbursementAdvance");
            Require(outcome.State!="Unused" || !mixed || ticket.PersonalShare!=null,"含代垫本金的未使用票须明确本票本人承担分配，不能把他人本金算作本人损失");
        }
        if(scene.Closing is {} closing) {
            ConcertText(closing.Note,1000);Require(closing.State is "Open" or "Closed","结案状态无效");
            if(closing.State=="Closed") Require(closing.ClosedOn!=null && closing.ClosedOn.Value.Year>=1900 && closing.ClosedOn<=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,ConcertRules.Zone(scene.TimeZone)).DateTime) && (scene.State=="Cancelled" || scene.StartsAt<=DateTimeOffset.UtcNow && closing.ClosedOn>=DateOnly.FromDateTime(ConcertRules.LocalStart(scene).DateTime)),"结案需填写已发生日期且不早于演出；取消场次可按实际核对日期结案");
        }
    }
    static ConcertRecoveryReport ConcertInsuranceReport(ConcertInput scene,ConcertInput[] scenes,InterestPurchase[] music,Dictionary<string,FinanceTransaction> txs,List<string> warnings) {
        decimal received=0,returned=0,recovery=0,pending=0;var rows=new List<object>();
        foreach(var claim in scene.Insurance??[]) {
            bool Valid(ConcertTransferPayment p,bool income)=>txs.TryGetValue(p.TransactionId,out var t) && t.Status=="Confirmed" && t.Type==(income?"Income":"Expense") && t.BusinessId==null && t.Currency==scene.Currency && t.OccurredAt<=DateTimeOffset.UtcNow && (income?ConcertIncomeLinks(scenes).Where(x=>x.TransactionId==p.TransactionId).Sum(x=>Money(x.Amount)):ConcertExpenseUse(p.TransactionId,scenes,music))<=t.Amount;
            var r=claim.Receipts.Where(p=>Valid(p,true)).Sum(p=>Money(p.Amount));var back=claim.Returns.Where(p=>Valid(p,false)).Sum(p=>Money(p.Amount));var net=r-back;var held=claim.State is "Revoked" or "Rejected"?Math.Max(0,net):0;
            if(claim.Receipts.Any(p=>!Valid(p,true)) || claim.Returns.Any(p=>!Valid(p,false)) || held>0) warnings.Add("理赔 "+claim.Id+" 的实际资金来源已变化，请核对；待抵平款不冲减负担。");
            received+=r;returned+=back;recovery+=net-held;pending+=held;rows.Add(new {claim.Id,claim.TicketId,received=M(r),returned=M(back),netRecovery=M(net-held),pendingReturn=M(held)});
        }
        return new(M(received),M(returned),M(recovery),M(pending),rows.ToArray());
    }
}
