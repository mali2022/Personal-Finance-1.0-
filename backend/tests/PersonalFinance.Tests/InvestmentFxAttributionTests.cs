using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class InvestmentFxAttributionTests
{
 [Fact] public void LocalLossAndCurrencyTimingReconcileFromIndividualFlows(){var r=InvestmentFxAttribution.Calculate(-100,.2m,[new(-1000,.1m),new(900,.2m)]);Assert.Equal("Success",r.Status);Assert.Equal(-20,r.LocalProfitAtClosingRate);Assert.Equal(100,r.CashFlowFxTimingImpact);Assert.Equal(80,r.ReportProfit);Assert.True(r.Reconciled);}
 [Fact] public void IdentityRatesHaveNoCurrencyContribution(){var r=InvestmentFxAttribution.Calculate(100,1,[new(-1000,1),new(1100,1)]);Assert.Equal(100,r.LocalProfitAtClosingRate);Assert.Equal(0,r.CashFlowFxTimingImpact);}
 [Fact] public void MissingClosingQuoteDoesNotInventAttribution(){var r=InvestmentFxAttribution.Calculate(100,null,[new(-1000,.1m),new(1100,.11m)]);Assert.Equal("ExchangeRateMissing",r.Status);Assert.Null(r.ReportProfit);}
 [Fact] public void MismatchedProfitIsRejected(){Assert.Equal("InvalidCashFlow",InvestmentFxAttribution.Calculate(999,.2m,[new(-1000,.1m),new(1100,.2m)]).Status);}
}
