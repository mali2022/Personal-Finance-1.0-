using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public static class FxRateSelection
{
    // Shared with asset valuation: direct quotes only, never future or inferred inverse rates.
    public static FxValuationRate? Select(IEnumerable<FxValuationRate> rates, string source, string target, DateOnly date, string strategy = "LatestOnOrBefore")
    {
        FinanceService.Require(strategy is "ExactDate" or "LatestOnOrBefore", "汇率匹配策略无效");
        return rates.Where(x => x.BaseCurrency == source && x.TargetCurrency == target &&
            (strategy == "ExactDate" ? x.Date == date : x.Date <= date))
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id, StringComparer.Ordinal).FirstOrDefault();
    }
}
