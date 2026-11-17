using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private async Task<PaymentInstrument> ValidateAdvanceAuthorization(string user, string id, string? version, string accountId, decimal total, DateTimeOffset occurredAt)
    {
        var p = await db.Set<PaymentInstrument>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "付款授权不存在"); Version(p, version);
        var local = occurredAt.ToOffset(TimeSpan.FromHours(8)); var date = DateOnly.FromDateTime(local.Date);
        Require(p.AccountId == accountId && p.State == "Active" && date >= p.StartsOn && (p.EndsOn == null || date <= p.EndsOn), "代付账户与授权不一致，或授权未生效/已暂停/已到期");
        var start = new DateTimeOffset(local.Year, local.Month, 1, 0, 0, 0, TimeSpan.FromHours(8)); var end = start.AddMonths(1);
        var used = await (from link in db.Set<AuthorizedPayment>() join tx in db.Transactions on link.TransactionId equals tx.Id where link.UserId == user && link.InstrumentId == id && tx.Status != "Deleted" && tx.OccurredAt >= start && tx.OccurredAt < end select link.ChargedAmount ?? tx.Amount).SumAsync(x => (decimal?)x) ?? 0;
        Require(p.MonthlyLimit == null || used + total <= p.MonthlyLimit, "代付实际总额超过本月授权限额"); return p;
    }
}
