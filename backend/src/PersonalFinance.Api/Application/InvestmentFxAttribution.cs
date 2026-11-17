namespace PersonalFinance.Api.Application;

public sealed record InvestmentFxContribution(decimal Amount, decimal? Rate);
public sealed record InvestmentFxBridge(string Status, decimal? LocalProfitAtClosingRate, decimal? CashFlowFxTimingImpact, decimal? ReportProfit, bool Reconciled);

public static class InvestmentFxAttribution
{
    // Explicit counterfactual: hold the reporting FX rate constant at the period-end quote.
    // Each timing contribution is CF_i * (historicalFX_i - closingFX), not an unexplained residual.
    public static InvestmentFxBridge Calculate(decimal? originalProfit, decimal? closingRate, IReadOnlyList<InvestmentFxContribution> flows)
    {
        if(originalProfit==null)return new("InsufficientData",null,null,null,false);
        if(closingRate is null or <=0||flows.Any(x=>x.Rate is null or <=0))return new("ExchangeRateMissing",null,null,null,false);
        if(flows.Sum(x=>x.Amount)!=originalProfit.Value)return new("InvalidCashFlow",null,null,null,false);
        var local=originalProfit.Value*closingRate.Value;
        var timing=flows.Sum(x=>x.Amount*(x.Rate!.Value-closingRate.Value));
        var report=flows.Sum(x=>x.Amount*x.Rate!.Value);
        var reconciled=local+timing==report;
        return new(reconciled?"Success":"ReconciliationFailed",local,timing,report,reconciled);
    }
}
