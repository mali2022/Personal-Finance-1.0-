using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> SaveInvestmentBoundaryValue(string user, InvestmentBoundaryValueInput input)
    {
        var account = await Account(user, input.AccountId, false);
        Require(account.Type == "Investment" && input.IncludesCashAndHoldings, "须确认投资账户快照同时包括现金和全部持仓");
        Require(input.Date.Year >= 1900 && input.Date <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date), "估值日期无效");
        Require(input.Source?.Trim().Length is > 0 and <= 200, "请填写完整账户估值的核对依据");
        var value = Money(input.Value); Require(value >= 0, "账户完整价值不能为负");
        // Append-only confirmed values reuse the existing owned document store and standard Write audit.
        var doc = new StoredDocument { UserId = user, Kind = "InvestmentBoundaryValue", Name = account.Id + ":" + input.Date.ToString("yyyy-MM-dd"), ContentType = "application/json", Content = JsonSerializer.SerializeToUtf8Bytes(new { account.Id, input.Date, value = M(value), account.Currency, input.Source, input.IncludesCashAndHoldings }, Json) };
        db.Add(doc); return new { doc.Id, accountId = account.Id, input.Date, value = M(value), account.Currency, input.Source, doc.CreatedAt };
    }

    public async Task<object> InvestmentBoundaryReturn(string user, InvestmentBoundaryReturnInput input, CancellationToken ct)
    {
        Require(input.AccountIds is { Length: >= 1 and <= 20 } && input.AccountIds.Distinct().Count() == input.AccountIds.Length, "请选择1至20个不重复投资账户");
        Require(DateOnly.TryParseExact(input.Start, "yyyy-MM-dd", out var first) && DateOnly.TryParseExact(input.End, "yyyy-MM-dd", out _), "统计日期无效");
        var last = DateOnly.ParseExact(input.End, "yyyy-MM-dd");
        Require(first.Year >= 1901 && last >= first && last <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date), "统计日期无效");
        AssetCurrency(input.Currency);
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct); budget.CancelAfter(TimeSpan.FromSeconds(10));
        try {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, budget.Token);
            var resource = "finance-user:" + user;
            await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Shared',@LockOwner='Transaction',@LockTimeout=2000; IF @r<0 THROW 51001,'Investment boundary read timeout',1;", budget.Token);
            var accounts = await db.Accounts.AsNoTracking().Where(x => x.UserId == user && input.AccountIds.Contains(x.Id) && x.Type == "Investment").ToArrayAsync(budget.Token);
            if (accounts.Length != input.AccountIds.Length) throw new ApiException(404, "投资账户不存在");
            var revision=await db.Database.SqlQuery<Guid>($"SELECT InvestmentReturnRevision AS Value FROM finance.Users WHERE Id={user}").SingleAsync(budget.Token);
            var connection=db.Database.GetDbConnection();
            var cacheKey=("boundary-v2",connection.DataSource,connection.Database,user,string.Join(",",input.AccountIds.OrderBy(x=>x,StringComparer.Ordinal)),input.Start,input.End,input.Currency,revision);
            if(InvestmentReturnCache.TryGetValue(cacheKey,out byte[]? cached)&&cached!=null){await transaction.CommitAsync(budget.Token);return JsonSerializer.Deserialize<JsonElement>(cached);}
            var names = input.AccountIds.SelectMany(id => new[] { id + ":" + first.AddDays(-1).ToString("yyyy-MM-dd"), id + ":" + last.ToString("yyyy-MM-dd") }).ToArray();
            var snapshots = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == "InvestmentBoundaryValue" && names.Contains(x.Name))
                .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(10001).ToArrayAsync(budget.Token);
            Require(snapshots.Length <= 10000, "账户估值更正历史超过读取上限");
            var from = new DateTimeOffset(first.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)); var until = new DateTimeOffset(last.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8));
            var transactions = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Status != "Deleted" && x.OccurredAt >= from && x.OccurredAt < until && (input.AccountIds.Contains(x.AccountId) || input.AccountIds.Contains(x.ToAccountId!)))
                .OrderBy(x => x.OccurredAt).ThenBy(x => x.Id).Take(20001).ToArrayAsync(budget.Token);
            Require(transactions.Length <= 20000, "账户期间交易超过上限，请缩小范围");
            var ids = transactions.Select(x => x.Id).ToArray();
            var linked = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && x.State == "Active" && ids.Contains(x.TransactionId!)).Select(x => x.TransactionId).ToArrayAsync(budget.Token);
            var rates = await db.Set<FxValuationRate>().AsNoTracking().Where(x => x.UserId == user && x.TargetCurrency == input.Currency && x.Date >= first.AddDays(-1) && x.Date <= last).Take(20001).ToArrayAsync(budget.Token);
            Require(rates.Length <= 20000, "历史汇率超过读取上限");
            string? failure = await db.Set<InvestmentTrade>().AsNoTracking().AnyAsync(x=>x.UserId==user&&x.State=="Active"&&x.SettlementDate>=first&&x.SettlementDate<=last&&(x.Type=="PositionIncrease"||x.Type=="PositionDecrease")&&db.Set<InvestmentAsset>().Any(a=>a.UserId==user&&a.Id==x.AssetId&&input.AccountIds.Contains(a.AccountId)),budget.Token) ? "TransferValuationMissing" : null;
            var exchangeRates=new List<object>();
            decimal? ConvertValue(decimal value, string currency, DateOnly date) {
                if (currency == input.Currency) return value;
                var rate = FxRateSelection.Select(rates, currency, input.Currency, date, "ExactDate");
                if (rate == null || rate.Rate <= 0) { failure = "ExchangeRateMissing"; return null; }
                exchangeRates.Add(new{rate.Id,date,sourceCurrency=currency,targetCurrency=input.Currency,rate=rate.Rate.ToString(System.Globalization.CultureInfo.InvariantCulture),rate.Source});
                return value * rate.Rate;
            }
            decimal? Snapshot(DateOnly date) {
                decimal total = 0;
                foreach (var account in accounts) {
                    var doc = snapshots.FirstOrDefault(x => x.Name == account.Id + ":" + date.ToString("yyyy-MM-dd"));
                    if (doc == null) { failure ??= "ValuationMissing"; return null; }
                    var value = JsonSerializer.Deserialize<JsonElement>(doc.Content);
                    if (value.GetProperty("currency").GetString() != account.Currency) { failure = "InvalidCashFlow"; return null; }
                    var converted = ConvertValue(decimal.Parse(value.GetProperty("value").GetString()!, System.Globalization.CultureInfo.InvariantCulture), account.Currency, date);
                    if (converted == null) return null; total += converted.Value;
                }
                return total;
            }
            var opening = Snapshot(first.AddDays(-1)); var closing = Snapshot(last);
            var flows = new List<InvestmentReturnFlow>();
            if (opening != null) flows.Add(new(first, -opening.Value, "OpeningFullAccountValue", "boundary:opening"));
            foreach (var tx in transactions) {
                if (tx.Status != "Confirmed") { failure ??= "UnconfirmedCashFlow"; continue; }
                if (linked.Contains(tx.Id)) continue; // Security trades/income/fees stay inside the boundary.
                if (tx.Type != "Transfer") { failure ??= "UnclassifiedCashFlow"; continue; }
                var insideFrom = input.AccountIds.Contains(tx.AccountId); var insideTo = input.AccountIds.Contains(tx.ToAccountId!);
                if (insideFrom && insideTo) continue;
                var date = DateOnly.FromDateTime(tx.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date);
                var account = accounts.Single(x => x.Id == (insideFrom ? tx.AccountId : tx.ToAccountId));
                var value = ConvertValue(insideFrom ? tx.Amount : tx.ReceivedAmount ?? tx.Amount, account.Currency, date);
                if (value != null) flows.Add(new(date, insideFrom ? value.Value : -value.Value, insideFrom ? "ExternalWithdrawal" : "ExternalContribution", tx.Id));
            }
            if (closing != null) flows.Add(new(last, closing.Value, "ClosingFullAccountValue", "boundary:closing"));
            var result = failure != null ? new ReturnResult(failure, null, [], "XIRR-Actual365") : InvestmentReturns.Xirr(flows.Select(x => new DatedInvestmentCashFlow(x.Date, x.Amount)), budget.Token);
            var response = new { input.AccountIds, input.Start, input.End, input.Currency, xirr = result, calculationId=Guid.NewGuid(),exchangeRates,valueSource = "UserConfirmedFullAccountSnapshot", totalProfit = failure == null ? flows.Sum(x => x.Amount).ToString(System.Globalization.CultureInfo.InvariantCulture) : null,
                cashFlows = flows.Select(x => new { x.Date, amount = x.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture), x.Type, x.SourceId }),
                valuations = snapshots.GroupBy(x => x.Name).Select(g => new { g.First().Id, g.First().Name, g.First().CreatedAt, value = JsonSerializer.Deserialize<JsonElement>(g.First().Content) }),
                policy = "Full-account cash and holdings snapshots; exact-date direct FX; internal trades and selected-account transfers excluded; unknown or unconfirmed movements block calculation. Fees are included in closing value, not external withdrawals." };
            await transaction.CommitAsync(budget.Token);
            var bytes=JsonSerializer.SerializeToUtf8Bytes(response,Json);if(bytes.Length<=1024*1024)InvestmentReturnCache.Set(cacheKey,bytes,new MemoryCacheEntryOptions{Size=bytes.Length,AbsoluteExpirationRelativeToNow=TimeSpan.FromMinutes(2)});
            return response;
        } catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ApiException(503, "计算超时，请缩小范围", "INVESTMENT_RETURN_TIMEOUT"); }
        catch(OverflowException){throw new ApiException(422,"现金流或折算金额超出支持范围","INVESTMENT_RETURN_AMOUNT_OVERFLOW");}
        catch (Microsoft.Data.SqlClient.SqlException e) when (e.Number is 51001 or 1205 or -2) { throw new ApiException(503, "数据正在更新，请重试", "INVESTMENT_RETURN_BUSY"); }
    }
}
