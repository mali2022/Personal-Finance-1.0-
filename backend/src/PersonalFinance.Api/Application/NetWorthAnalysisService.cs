using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> NetWorthAnalysis(string user, IQueryCollection query)
    {
        var (start, end) = IndicatorRange(query); var currency = query["currency"].ToString();
        Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var opening = await Worth(user, currency, start.AddTicks(-1));
        var closing = await Worth(user, currency, end.AddTicks(-1));
        var current = await Worth(user, currency);
        var accounts = await db.Accounts.AsNoTracking().Where(x => x.UserId == user && x.Currency == currency).ToListAsync();
        var entries = from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id
                      join a in db.Accounts on e.AccountId equals a.Id
                      where e.UserId == user && t.UserId == user && a.UserId == user && a.Currency == currency && e.Kind == "Account" && t.Status != "Deleted"
                      select new { e.AccountId, e.Amount, t.OccurredAt, t.Type };
        var balances = await entries.Where(x => x.OccurredAt < end).GroupBy(x => x.AccountId!).Select(g => new { id = g.Key, amount = g.Sum(x => x.Amount), first = g.Min(x => x.OccurredAt) }).ToDictionaryAsync(x => x.id);
        var movements = await entries.Where(x => x.OccurredAt >= start && x.OccurredAt < end).GroupBy(x => x.Type).Select(g => new { type = g.Key, amount = g.Sum(x => x.Amount) }).ToArrayAsync();
        var explained = movements.Sum(x => x.amount);
        var valuationDate = DateOnly.FromDateTime(end.AddTicks(-1).ToOffset(TimeSpan.FromHours(8)).Date);
        if (valuationDate > AssetToday) valuationDate = AssetToday;
        var valuationQuery = new QueryCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> { ["date"] = valuationDate.ToString("yyyy-MM-dd"), ["currency"] = currency });
        var consolidatedValuation = await AssetAllocation(user, valuationQuery);
        var openingValuationDate=DateOnly.FromDateTime(start.AddTicks(-1).ToOffset(TimeSpan.FromHours(8)).Date);
        if(openingValuationDate>valuationDate)openingValuationDate=valuationDate;
        if(openingValuationDate.Year<1900)openingValuationDate=new DateOnly(1900,1,1);
        var valuationChange=await AssetValuationChangeCore(user,openingValuationDate,valuationDate,currency,consolidatedValuation);
        return new {
            consolidatedValuation, valuationChange, accountLedgerScope = "原字段继续为账户账本，consolidatedValuation为证券/实物/汇率的统一估值扩展；估值不写分录。", currency, start, endExclusive = end, currentNetWorth = M(current.netWorth), openingNetWorth = M(opening.netWorth),
            assets = M(closing.assets), liabilities = M(closing.liabilities), netWorth = M(closing.netWorth), change = M(closing.netWorth - opening.netWorth),
            changeRate = ReviewRateText(closing.netWorth, opening.netWorth),
            accounts = accounts.Select(a => { var balance = a.OpeningBalance + (balances.TryGetValue(a.Id, out var value) ? value.amount : 0); return new { a.Id, a.Name, a.Type, balance = M(balance), asset = M(Math.Max(0, balance)), liability = M(Math.Max(0, -balance)), firstRecordedAt = value?.first, historicalConfidence = "OpeningEffectiveDateUnknown" }; }),
            attribution = movements.Select(x => new { source = x.type, amount = M(x.amount), explanation = "同币种全部账户分录净变动；业务本金两端抵销，跨币种不强行抵销。此值为账本变化，非统计收入。" }),
            unexplainedDifference = M(closing.netWorth - opening.netWorth - explained),
            points = await AggregateReportPoints(user, start, end.AddTicks(-1), currency, end.Year - start.Year >= 49 ? "year" : "month", null),
            historicalConfidence = "Estimated", explanation = "历史余额复用原有核算引擎。账户期初余额缺少可靠生效日期，历史绝对金额为推算；新增账户或期初更正不能自动还原真实历史。未增加分期或未来费用负债。"
        };
    }
}

