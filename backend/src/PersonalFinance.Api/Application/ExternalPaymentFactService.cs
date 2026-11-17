using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static object ExternalFactView(ExternalPaymentFact x) => new { x.Id, x.Name, x.Payer, x.Consumer, x.Currency, amount = M(x.Amount), x.OccurredAt, x.Nature, x.Note, version = x.Version.ToString(), cashImpact = "0.00", rule = "实际出资账户在本人账本外，只记录第三方付款事实。赠与不虚构现金收入；承诺待还为核对提示，不自动创建借入到账或负债。" };
    public async Task<object> ExternalPaymentFacts(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<ExternalPaymentFact>().AsNoTracking().Where(x => x.UserId == user);
        var rows = await q.OrderByDescending(x => x.OccurredAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(ExternalFactView), total = await q.CountAsync(), page, pageSize = size };
    }
    public Task<object> SaveExternalPaymentFact(string user, ExternalPaymentFactInput b)
    {
        AssetCurrency(b.Currency); AssetDate(DateOnly.FromDateTime(b.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date));
        Require(new[] { b.Name, b.Payer, b.Consumer }.All(x => !string.IsNullOrWhiteSpace(x) && x.Length <= 200) && b.Note is not null && b.Note.Length <= 2000 && b.Nature is "Gift" or "PromisedRepayment" or "ReferenceOnly", "第三方付款事实、角色或经济性质无效");
        var fact = new ExternalPaymentFact { UserId = user, Name = b.Name.Trim(), Payer = b.Payer.Trim(), Consumer = b.Consumer.Trim(), Currency = b.Currency, Amount = Money(b.Amount, true), OccurredAt = b.OccurredAt.ToUniversalTime(), Nature = b.Nature, Note = b.Note! };
        db.Add(fact); return Task.FromResult(ExternalFactView(fact));
    }
}
