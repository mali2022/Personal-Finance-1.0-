using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> RefundSources(string user, IQueryCollection p)
    {
        var (page, size) = Paging(p); var keyword = p["keyword"].ToString().Trim();
        var q = db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Type == "Expense" && x.Status != "Deleted"
            && !db.Set<CashbackRecovery>().Any(r => r.UserId == user && r.TransactionId == x.Id));
        if (keyword.Length > 0)
        {
            var hasAmount = decimal.TryParse(keyword, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount);
            var hasDate = DateOnly.TryParseExact(keyword, new[] { "yyyy-MM-dd", "yyyy/MM/dd", "yyyyMMdd" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date);
            var start = hasDate ? new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)).ToUniversalTime() : DateTimeOffset.MinValue;
            var end = hasDate ? start.AddDays(1) : start;
            q = q.Where(x => x.Merchant != null && x.Merchant.Contains(keyword) || x.Note.Contains(keyword)
                || x.ProductName != null && x.ProductName.Contains(keyword) || x.Id == keyword
                || hasAmount && x.Amount == amount || hasDate && x.OccurredAt >= start && x.OccurredAt < end);
        }
        var total = await q.CountAsync();
        if (total == 0) return new { items = Array.Empty<object>(), total, page, pageSize = size };
        var ids = await q.OrderByDescending(x => x.OccurredAt).ThenByDescending(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => x.Id).ToArrayAsync();
        // A choice needs no running balances, tags or full transaction detail.
        // Fetch the page and its refund/recovery totals in bounded set queries.
        var selected = await q.Where(t => ids.Contains(t.Id)).Select(t => new {
            t.Id, t.Amount, t.Currency, t.AccountId, t.Merchant, t.Note, t.OccurredAt
        }).ToDictionaryAsync(t => t.Id);
        var refunded = await db.Transactions.Where(t => t.UserId == user && t.Type == "Refund" && t.Status != "Deleted" && ids.Contains(t.OriginalTransactionId!))
            .GroupBy(t => t.OriginalTransactionId!).Select(g => new { Id = g.Key, Amount = g.Sum(t => t.Amount) }).ToDictionaryAsync(t => t.Id, t => t.Amount);
        var recovered = await (from r in db.Set<CashbackRecovery>() join b in db.Set<CashbackReceivable>() on r.CashbackId equals b.Id
            join t in db.Transactions on r.TransactionId equals t.Id
            where r.UserId == user && b.UserId == user && r.State == "Active" && b.Treatment == "PriceAdjustment" && t.Status != "Deleted" && ids.Contains(b.TransactionId)
            group r by b.TransactionId into g select new { Id = g.Key, Amount = g.Sum(r => r.Amount) }).ToDictionaryAsync(t => t.Id, t => t.Amount);
        var rows = ids.Select(id => {
            var t = selected[id]; var net = refunded.GetValueOrDefault(id) - recovered.GetValueOrDefault(id);
            return new { t.Id, type = "Expense", amount = M(t.Amount), t.Currency, t.AccountId, t.Merchant, t.Note, t.OccurredAt,
                refundedAmount = M(net), refundableAmount = M(t.Amount - net) };
        }).ToArray();
        return new { items = rows, total, page, pageSize = size };
    }
}
