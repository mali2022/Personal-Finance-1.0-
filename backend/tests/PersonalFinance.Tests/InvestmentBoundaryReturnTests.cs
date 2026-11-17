using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class InvestmentBoundaryReturnTests
{
    [Fact] public void InternalTradingIncomeAndFeesAreNotExternalCapital()
    {
        var result = InvestmentBoundaryReturns.Calculate(new HashSet<string> { "a", "b" }, new(2025,1,1), new(2026,1,1), 1000, 1100,
            [new("buy",new(2025,2,1),"a",null,700,"SecurityTrade"),
             new("sell",new(2025,3,1),null,"a",800,"SecurityTrade"),
             new("dividend",new(2025,4,1),null,"a",20,"InvestmentIncome"),
             new("fee",new(2025,4,1),"a",null,10,"InvestmentFee"),
             new("internal",new(2025,5,1),"a","b",500,"Transfer")]);
        Assert.Equal("Success", result.Xirr.Status);
        Assert.Equal(.1, result.Xirr.Rate!.Value, 8);
        Assert.Equal(2, result.CashFlows.Length);
    }
    [Fact] public void TransferCrossingSelectedBoundaryIsExternal()
    {
        var result = InvestmentBoundaryReturns.Calculate(new HashSet<string> { "a" }, new(2025,1,1), new(2026,1,1), 1000, 600,
            [new("out",new(2026,1,1),"a","b",500,"Transfer")]);
        Assert.Equal(.1, result.Xirr.Rate!.Value, 8);
        Assert.Equal(500, result.CashFlows.Single(x => x.Type == "ExternalWithdrawal").Amount);
    }
    [Fact] public void MissingHistoricalValueCannotBecomeZeroReturn()
    {
        var result = InvestmentBoundaryReturns.Calculate(new HashSet<string> { "a" }, new(2025,1,1), new(2026,1,1), null, 1000, []);
        Assert.Equal("ValuationMissing", result.Xirr.Status); Assert.Null(result.Xirr.Rate);
    }
    [Fact] public void UnknownEconomicClassificationBlocksCalculation()
    {
        var result = InvestmentBoundaryReturns.Calculate(new HashSet<string> { "a" }, new(2025,1,1), new(2026,1,1), 1000, 1100,
            [new("unknown",new(2025,2,1),null,"a",100,"Adjustment")]);
        Assert.Equal("UnclassifiedCashFlow", result.Xirr.Status);
    }
}
