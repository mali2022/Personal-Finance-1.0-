using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private static readonly MemoryCache InvestmentReturnCache = new(new MemoryCacheOptions { SizeLimit = 16 * 1024 * 1024 });
    public static PeriodicReturnResult CalculatePeriodicReturn(Contracts.PeriodicReturnInput input, CancellationToken ct)
    {
        Require(input.Amounts is { Length: >= 2 and <= 512 }, "等间隔现金流须为2至512期，缺少现金流的期间请填0");
        Require(double.IsFinite(input.PeriodsPerYear) && input.PeriodsPerYear > 0 && input.PeriodsPerYear <= 366, "每年周期数须大于0且不超过366");
        var amounts = input.Amounts!.Select(value => {
            Require(value != null && System.Text.RegularExpressions.Regex.IsMatch(value, @"^-?\d{1,18}(\.\d{1,8})?$"), "现金流金额格式无效，最多18位整数和8位小数");
            return decimal.Parse(value!, System.Globalization.CultureInfo.InvariantCulture);
        }).ToArray();
        return InvestmentReturns.PeriodicIrr(amounts, input.PeriodsPerYear, ct);
    }

    public async Task<object> InvestmentAssetReturn(string user, string id, IQueryCollection query, CancellationToken ct)
    {
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(10));
        try { return await InvestmentAssetReturnCore(user, id, query, budget.Token); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw new Contracts.ApiException(503, "收益计算超过交互预算，请缩小范围后重试", "INVESTMENT_RETURN_TIMEOUT"); }
        catch (OverflowException)
        { throw new Contracts.ApiException(422,"现金流或折算金额超出支持范围","INVESTMENT_RETURN_AMOUNT_OVERFLOW"); }
        catch (Microsoft.Data.SqlClient.SqlException e) when (e.Number is 51001 or 1205 or -2)
        { throw new Contracts.ApiException(503, "投资数据正在更新，请稍后重试", "INVESTMENT_RETURN_BUSY"); }
    }

    private async Task<object> InvestmentAssetReturnCore(string user, string id, IQueryCollection query, CancellationToken ct)
    {
        // Match the existing per-user writer lock. Serializable also protects against direct EF mutations.
        await using var snapshot = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct) : null;
        var resource = "finance-user:" + user;
        await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Shared',@LockOwner='Transaction',@LockTimeout=2000; IF @r<0 THROW 51001,'Investment read lock timeout',1;", ct);
        var asset = await db.Set<InvestmentAsset>().AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id,ct) ?? throw new Contracts.ApiException(404,"投资资产不存在");
        Require(DateOnly.TryParseExact(query["start"], "yyyy-MM-dd", out var start)
            && DateOnly.TryParseExact(query["end"], "yyyy-MM-dd", out _), "请选择有效的起止日期");
        var end = DateOnly.ParseExact(query["end"]!, "yyyy-MM-dd");
        Require(start.Year >= 1900 && start <= end && end <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date), "统计日期无效");
        var currency = query["currency"].ToString();
        if (currency == "") currency = asset.Currency;
        AssetCurrency(currency);
        var revision = await db.Database.SqlQuery<Guid>($"SELECT InvestmentReturnRevision AS Value FROM finance.Users WHERE Id={user}").SingleAsync(ct);
        var connection = db.Database.GetDbConnection();
        var cacheKey = (connection.DataSource, connection.Database, user, id, start, end, currency, revision, "Actual365-ExactDate-v4-FxBridge");
        if (InvestmentReturnCache.TryGetValue(cacheKey, out byte[]? cached) && cached != null)
        {
            if (snapshot != null) await snapshot.CommitAsync(ct);
            return System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(cached);
        }
        var trades = await db.Set<InvestmentTrade>().AsNoTracking()
            .Where(x => x.UserId == user && x.AssetId == id && x.State == "Active" && x.SettlementDate <= end)
            .OrderBy(x => x.SettlementDate).ThenBy(x => x.Id).Take(20001).ToArrayAsync(ct);
        Require(trades.Length <= 20000, "单资产历史超过计算上限");
        var openingDate = start.AddDays(-1);
        var values = await db.Set<InvestmentValuation>().AsNoTracking()
            .Where(x => x.UserId == user && x.AssetId == id && (x.Date == openingDate || x.Date == end)).ToArrayAsync(ct);
        var analysis = InvestmentReturnCashFlows.Calculate(trades, values, start, end, ct);
        var dates = analysis.CashFlows.Select(x => x.Type == "OpeningValue" ? openingDate : x.Date).Append(end).Distinct().ToArray();
        var rates = currency == asset.Currency ? [] : await db.Set<FxValuationRate>().AsNoTracking()
            .Where(x => x.UserId == user && x.BaseCurrency == asset.Currency && x.TargetCurrency == currency && dates.Contains(x.Date))
            .Take(20001).ToArrayAsync(ct);
        Require(rates.Length <= 20000, "汇率记录超过计算上限");
        var converted = analysis.CashFlows.Select(x => {
            var rateDate = x.Type == "OpeningValue" ? openingDate : x.Date;
            var fx = FxRateSelection.Select(rates, asset.Currency, currency, rateDate, "ExactDate");
            decimal? rate = currency == asset.Currency ? 1m : fx?.Rate;
            return new { x.Date, amount = rate > 0 ? (x.Amount * rate.Value).ToString(System.Globalization.CultureInfo.InvariantCulture) : null,
                originalAmount = x.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture), originalCurrency = asset.Currency, x.Type, x.SourceId,
                rate = rate > 0 ? D(rate.Value) : null, rateDate, rateSource = fx?.Source,
                rateId = fx?.Id };
        }).ToArray();
        var result = analysis.Xirr;
        if (currency != asset.Currency && result.Status is not ("ValuationMissing" or "TransferValuationMissing" or "InvalidCashFlow"))
            result = converted.Any(x => x.amount == null)
                ? new ReturnResult("ExchangeRateMissing", null, [], "XIRR-Actual365")
                : InvestmentReturns.Xirr(converted.Select(x => new DatedInvestmentCashFlow(x.Date, decimal.Parse(x.amount!, System.Globalization.CultureInfo.InvariantCulture))), ct);
        var attribution = InvestmentReturnAmounts.Calculate(trades, analysis, start, end);
        var closingFx=FxRateSelection.Select(rates,asset.Currency,currency,end,"ExactDate");
        decimal? closingRate=currency==asset.Currency?1m:closingFx?.Rate;
        var fxBridge=InvestmentFxAttribution.Calculate(attribution.TotalProfit,closingRate,converted.Select(x=>new InvestmentFxContribution(decimal.Parse(x.originalAmount,System.Globalization.CultureInfo.InvariantCulture),x.rate==null?null:decimal.Parse(x.rate,System.Globalization.CultureInfo.InvariantCulture))).ToArray());
        var paid=converted.Any(x=>x.amount==null)?(decimal?)null:-converted.Where(x=>x.amount!=null&&decimal.Parse(x.amount!,System.Globalization.CultureInfo.InvariantCulture)<0).Sum(x=>decimal.Parse(x.amount!,System.Globalization.CultureInfo.InvariantCulture));
        string? Exact(decimal? amount) => amount?.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var response = new { asset.Id, asset.Name, asset.Type, currency, originalCurrency = asset.Currency, start, end, xirr = result, analysis.Policy,
            amounts = new { attribution.Status, attribution.Reconciled, originalCurrency = asset.Currency,
                totalProfit = Exact(attribution.TotalProfit), netRealized = Exact(attribution.NetRealized),
                reportClosingValue = attribution.TotalProfit == null || converted.Any(x => x.amount == null) ? null : Exact(converted.Where(x => x.Type == "ClosingValue").Sum(x => decimal.Parse(x.amount!, System.Globalization.CultureInfo.InvariantCulture))),
                netCashInvested = attribution.TotalProfit == null || converted.Any(x => x.amount == null) ? null : Exact(-converted.Where(x => x.Type != "ClosingValue").Sum(x => decimal.Parse(x.amount!, System.Globalization.CultureInfo.InvariantCulture))),
                unrealizedChange = Exact(attribution.UnrealizedChange), netDividends = Exact(attribution.NetDividends),
                netInterest = Exact(attribution.NetInterest), includedFees = Exact(attribution.IncludedFees),
                reportTotalProfit = attribution.TotalProfit == null || converted.Any(x => x.amount == null) ? null : Exact(converted.Sum(x => decimal.Parse(x.amount!, System.Globalization.CultureInfo.InvariantCulture))),
                feePolicy = "Fees are included in net realized, cost and net cash income; do not subtract again",
                exchangeAttributionStatus = fxBridge.Status,
                exchangeAttribution=new{fxBridge.Status,fxBridge.Reconciled,method="ClosingRateConstantCurrencyBridge",baselineDate=end,baselineRate=Exact(closingRate),baselineRateId=closingFx?.Id,baselineSource=closingFx?.Source,
                    localProfitAtClosingRate=Exact(fxBridge.LocalProfitAtClosingRate),cashFlowFxTimingImpact=Exact(fxBridge.CashFlowFxTimingImpact),reportProfit=Exact(fxBridge.ReportProfit),
                    explanation="Original profit * closing FX + sum(CF_i * (historical FX_i - closing FX)); counterfactual timing attribution, not separately realized FX income or a decomposition of XIRR"} },
            calculationId = Guid.NewGuid(),
            firstRecordedTradeDate=trades.Length==0?(DateOnly?)null:trades.Min(x=>x.SettlementDate),
            simpleReturn=attribution.TotalProfit==null||paid==null||paid<=0?null:Exact(converted.Sum(x=>decimal.Parse(x.amount!,System.Globalization.CultureInfo.InvariantCulture))/paid.Value),
            simpleReturnPolicy="Profit divided by gross cash outlays (including opening value and fees); cumulative, not annualized",
            exchangeRatePolicy = "ExactDate; direct quotes only; opening value uses preceding-day quote; no rounding before root solving", cashFlows = converted };
        if (snapshot != null) await snapshot.CommitAsync(ct);
        var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(response, Json);
        if (bytes.Length <= 1024 * 1024)
            InvestmentReturnCache.Set(cacheKey, bytes, new MemoryCacheEntryOptions { Size = bytes.Length, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2) });
        return response;
    }
}
