using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record ConcertTransferRow(string TicketId,string Seller,string Buyer,string State,string Received,string Returned,string NetRecovery,string Uncollected,string PendingReturn,ConcertTransferPayment[] Receipts,ConcertTransferPayment[] Returns,string AdvanceSettlement);
public sealed record ConcertTransferSummary(string Received,string Returned,string NetRecovery,string Uncollected,string PendingReturn,ConcertTransferRow[] Rows);
public sealed partial class FinanceService {
    static decimal ConcertExpenseUse(string transaction,IEnumerable<ConcertInput> scenes,IEnumerable<InterestPurchase> music)=>scenes.SelectMany(ConcertRules.EffectiveCosts).Where(c=>c.TransactionId==transaction).Sum(c=>Money(c.Amount))
        +music.Where(p=>p.State=="Purchased" && p.TransactionId==transaction).SelectMany(p=>p.Items).Sum(InterestRules.Paid)
        +ConcertReturnLinks(scenes).Where(p=>p.TransactionId==transaction).Sum(p=>Money(p.Amount));
    static ConcertTransferSummary ConcertTransferReport(ConcertInput scene,ConcertInput[] allScenes,InterestPurchase[] music,Dictionary<string,FinanceTransaction> transactions,List<string> warnings,HashSet<string> adjustments) {
        var all=ConcertTransfers(allScenes).ToArray();var rows=new List<ConcertTransferRow>();
        foreach(var order in scene.Orders) foreach(var ticket in order.Tickets??[]) {
            if(ticket.Transfer is not {} sale) continue;
            bool Valid(ConcertTransferPayment payment,bool income) {
                var funding=order.PaymentParts is {Length:>0}?order.PaymentParts.Select(p=>p.TransactionId):order.PaymentTransactionId==null?[]:new[]{order.PaymentTransactionId};
                if(!transactions.TryGetValue(payment.TransactionId,out var t) || t.Status!="Confirmed" || !(t.Type==(income?"Income":"Expense") && t.BusinessId==null || income && t.Type=="ReimbursementReceived" && t.BusinessId!=null && !adjustments.Contains(t.Id) && funding.Any(id=>transactions.TryGetValue(id,out var source) && source.Status=="Confirmed" && source.Type=="ReimbursementAdvance" && source.BusinessId==t.BusinessId)) || t.Currency!=scene.Currency || t.OccurredAt>DateTimeOffset.UtcNow) return false;
                return (income?ConcertIncomeLinks(allScenes).Where(p=>p.TransactionId==t.Id).Sum(p=>Money(p.Amount)):ConcertExpenseUse(t.Id,allScenes,music))<=t.Amount;
            }
            var received=sale.Receipts.Where(p=>Valid(p,true)).Sum(p=>Money(p.Amount));var returned=sale.Returns.Where(p=>Valid(p,false)).Sum(p=>Money(p.Amount));
            if(sale.Receipts.Any(p=>!Valid(p,true)) || sale.Returns.Any(p=>!Valid(p,false))) warnings.Add("门票 "+ticket.Id+" 的转让资金来源已撤销、改动或超额；仅计入仍有效的实际流水，请核对。");
            var advance=sale.Receipts.Where(p=>Valid(p,true) && transactions[p.TransactionId].Type=="ReimbursementReceived").Sum(p=>Money(p.Amount));
            var net=received-returned;var cashNet=net-advance;var held=sale.State=="Revoked"?Math.Max(0,net):0;var heldCash=sale.State=="Revoked"?Math.Max(0,cashNet):0;
            if(held>0) warnings.Add("撤销转让记录 "+ticket.Id+" 存在尚未抵平回款，请核对买家返款，暂不冲减原成本。");
            if(order.State=="Cancelled" && sale.State=="Recorded" && net>0) warnings.Add("已取消门票 "+ticket.Id+" 仍有转让净回款，请核对平台与买家返款事实；系统不会自动退款。");
            rows.Add(new(ticket.Id,sale.Seller,sale.Buyer,sale.State,M(received),M(returned),M(cashNet-heldCash),M(sale.State=="Recorded"?Math.Max(0,Money(sale.AgreedAmount)-net):0),M(held),sale.Receipts,sale.Returns,M(advance)));
        }
        return new(M(rows.Sum(r=>Money(r.Received))),M(rows.Sum(r=>Money(r.Returned))),M(rows.Sum(r=>Money(r.NetRecovery))),M(rows.Sum(r=>Money(r.Uncollected))),M(rows.Sum(r=>Money(r.PendingReturn))),rows.ToArray());
    }
}
