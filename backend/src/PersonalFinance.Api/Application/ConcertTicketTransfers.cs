using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService {
    static IEnumerable<ConcertTicketTransfer> ConcertTransfers(IEnumerable<ConcertInput> scenes)=>scenes.SelectMany(s=>s.Orders).SelectMany(o=>o.Tickets??[]).Where(t=>t.Transfer!=null).Select(t=>t.Transfer!);
    async Task ValidateConcertTransfers(ConcertInput scene,ConcertInput? old,ConcertInput[] allScenes,ConcertCost[] costs,Dictionary<string,FinanceTransaction> transactions,HashSet<string> payables) {
        foreach(var order in scene.Orders) foreach(var ticket in order.Tickets??[]) {
            if(ticket.Transfer is not {} sale) continue;
            ConcertText(sale.Seller,100,true);ConcertText(sale.Buyer,100,true);ConcertText(sale.Note,1000);
            Require(!sale.Seller.Trim().Equals(sale.Buyer.Trim(),StringComparison.OrdinalIgnoreCase),"转让人和买家不能相同");
            Require(sale.State is "Recorded" or "Revoked" && sale.Receipts is {Length:<=20} && sale.Returns is {Length:<=20},"转让状态或资金明细数量无效");
            Require(ticket.Gift?.State!="Given" || sale.State!="Recorded","有效赠送和有偿转让不能同时登记，请先核对赠送记录");
            var previous=old?.Orders.FirstOrDefault(o=>o.Id==order.Id)?.Tickets?.FirstOrDefault(t=>t.Id==ticket.Id)?.Transfer;
            var changed=System.Text.Json.JsonSerializer.Serialize(previous,Json)!=System.Text.Json.JsonSerializer.Serialize(sale,Json);
            var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,ConcertRules.Zone(scene.TimeZone)).DateTime);
            Require(sale.TransferredOn.Year is >=1900 and <=9900 && sale.TransferredOn<=today && sale.TransferredOn<=DateOnly.FromDateTime(ConcertRules.LocalStart(scene).DateTime),"转让日期须为不晚于演出当地日期的已发生日期");
            Require(sale.State!="Recorded" || sale.PlatformAllowed,"请确认符合票务平台规则，系统不执行平台转让");
            if(previous==null || sale.State=="Recorded" && changed) Require(ticket.State is "Received" or "Used" && order.State is "Issued" or "Used","仅已出票且已领取或使用门票可登记转让");
            var funding=(order.PaymentParts is {Length:>0}?order.PaymentParts.Select(p=>p.TransactionId):order.PaymentTransactionId==null?[]:new[]{order.PaymentTransactionId}).ToArray();
            Require(order.Origin?.Kind=="Gift" || funding.Length>0 && funding.All(id=>transactions.TryGetValue(id,out var t) && (ConcertPersonalSource(t,payables) || t.Type=="ReimbursementAdvance")),"转让须关联已核对付款、代付来源或明确免费获赠来源");
            var price=Money(sale.AgreedAmount,true);ConcertIds(sale.Receipts.Select(p=>p.TransactionId));ConcertIds(sale.Returns.Select(p=>p.TransactionId));
            foreach(var receipt in sale.Receipts) {
                var amount=Money(receipt.Amount,true);
                Require(transactions.TryGetValue(receipt.TransactionId,out var t) && (t.Type=="Income" && t.BusinessId==null || t.Type=="ReimbursementReceived" && t.BusinessId!=null && funding.Any(id=>transactions[id].Type=="ReimbursementAdvance" && transactions[id].BusinessId==t.BusinessId) && !await db.Set<AdvanceAdjustment>().AnyAsync(a=>a.UserId==t.UserId && a.TransactionId==t.Id)) && t.Status=="Confirmed" && t.Currency==scene.Currency && t.OccurredAt<=DateTimeOffset.UtcNow,"回款须为本人已发生已确认的同币种收入，或本订单原代付的真实结算；不能使用退款/减免/商家退回");
                Require(ConcertIncomeLinks(allScenes).Where(p=>p.TransactionId==receipt.TransactionId).Sum(p=>Money(p.Amount))<=t!.Amount,"该收入跨门票、理赔和场次分配超过实际到账");
            }
            foreach(var returned in sale.Returns) {
                Money(returned.Amount,true);
                Require(transactions.TryGetValue(returned.TransactionId,out var t) && t.Type=="Expense" && t.BusinessId==null && t.Status=="Confirmed" && t.Currency==scene.Currency && t.OccurredAt<=DateTimeOffset.UtcNow,"返款须关联本人已发生、已确认的同币种普通支出");
                Require(ConcertReturnLinks(allScenes).Where(p=>p.TransactionId==returned.TransactionId).Sum(p=>Money(p.Amount))+costs.Where(c=>c.TransactionId==returned.TransactionId).Sum(c=>Money(c.Amount))<=t!.Amount,"返款与场次/商品费用重复或超额分配");
                Require(sale.Receipts.Any(p=>transactions[p.TransactionId].OccurredAt<=t.OccurredAt),"返款日期不能早于全部实际收款");
            }
            var received=sale.Receipts.Sum(p=>Money(p.Amount));var paidBack=sale.Returns.Sum(p=>Money(p.Amount));
            Require(paidBack<=sale.Receipts.Where(p=>transactions[p.TransactionId].Type=="Income").Sum(p=>Money(p.Amount)),"本表仅关联普通转让收入的实际返款；原代付结算须在代付详情冲销后再解除关联，不能新建普通支出代替");
            Require(paidBack<=received && received-paidBack<=price,"实际返款不得超过实收，净回款不得超过约定票款");
            Require(sale.State!="Revoked" || received==paidBack,"存在未抵平票款时不能撤销记录，请先关联实际返款；系统不会自动退款");
        }
    }
    public async Task<object> ConcertTransferChoices(string user,string currency,string kind,string? keyword) {
        await RequireConcerts(user);Require(CurrencyDefinitions.Supports(currency) && kind is "Income" or "Expense" && (keyword?.Length??0)<=100,"查询参数无效");
        var q=db.Transactions.AsNoTracking().Where(t=>t.UserId==user && t.Currency==currency && (t.Type==kind && t.BusinessId==null || kind=="Income" && t.Type=="ReimbursementReceived") && t.Status=="Confirmed" && t.OccurredAt<=DateTimeOffset.UtcNow);
        if(!string.IsNullOrWhiteSpace(keyword)) q=q.Where(t=>t.Note.Contains(keyword) || t.Merchant!=null && t.Merchant.Contains(keyword) || t.Id==keyword);
        return await q.OrderByDescending(t=>t.OccurredAt).Take(50).Select(t=>new{t.Id,t.Type,amount=M(t.Amount),t.Currency,t.Note,t.Merchant}).ToArrayAsync();
    }
}
