using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class InvestmentReturnTests
{
    [Theory] [InlineData(12)] [InlineData(4)] [InlineData(1)] [InlineData(26)]
    public void PeriodicReturnUsesCompoundAnnualization(double periods)
    {
        var result = InvestmentReturns.PeriodicIrr([-100m, 110m], periods);
        Assert.Equal(.1, result.PeriodReturn.Rate!.Value, 8);
        Assert.Equal(Math.Pow(1.1, periods) - 1, result.AnnualizedRate!.Value, 8);
    }
    [Fact] public void InvalidPeriodDoesNotProduceNaN() => Assert.Null(InvestmentReturns.PeriodicIrr([-100m,110m], double.NaN).AnnualizedRate);
    [Fact] public void ZeroReturnIsAValidRoot()
    {
        var result = InvestmentReturns.Irr([-100m,100m]);
        Assert.Equal("Success", result.Status); Assert.Equal(0, result.Rate!.Value, 8);
    }
    [Fact] public void AlmostTotalLossRemainsFinite()
    {
        var result = InvestmentReturns.Xirr([new(new(2025,1,1),-1000000),new(new(2026,1,1),1)]);
        Assert.Equal("Success", result.Status); Assert.Equal(-.999999, result.Rate!.Value, 9);
    }
    [Fact] public void LongHistoryWithTrailingZeroDoesNotCreateFalseRoots()
    {
        var result = InvestmentReturns.Xirr([new(new(1950,1,1),-1_000_000_000m),new(new(2000,1,1),2_000_000_000m),new(new(2050,1,1),0)]);
        Assert.Equal("Success", result.Status);
        var years = (new DateOnly(2000,1,1).DayNumber - new DateOnly(1950,1,1).DayNumber) / 365d;
        Assert.Equal(Math.Pow(2, 1 / years)-1, result.Rate!.Value, 8);
    }
    [Fact] public void HeldAssetRequiresClosingValuation()
    {
        var trade = new PersonalFinance.Api.Domain.InvestmentTrade { Type = "Buy", Amount = 1000, Quantity = 1, Date = new(2025,1,1), SettlementDate = new(2025,1,1) };
        var missing = InvestmentReturnCashFlows.Calculate([trade], [], new(2025,1,1), new(2026,1,1));
        Assert.Equal("ValuationMissing", missing.Xirr.Status);
        var result = InvestmentReturnCashFlows.Calculate([trade], [new() { Date = new(2026,1,1), Price = 1100 }], new(2025,1,1), new(2026,1,1));
        Assert.Equal("Success", result.Xirr.Status);
        Assert.Equal(.1, result.Xirr.Rate!.Value, 8);
        Assert.Equal(2, result.CashFlows.Length);
    }
    [Fact] public void FullExitDoesNotAddTerminalValue()
    {
        var result = InvestmentReturnCashFlows.Calculate([
            new() { Type = "Buy", Amount = 1000, Quantity = 1, SettlementDate = new(2025,1,1), Date = new(2025,1,1) },
            new() { Type = "Sell", Amount = 1100, Quantity = 1, SettlementDate = new(2026,1,1), Date = new(2026,1,1) }
        ], [], new(2025,1,1), new(2026,1,1));
        Assert.Equal("Success", result.Xirr.Status);
        Assert.DoesNotContain(result.CashFlows, x => x.Type == "ClosingValue");
    }
    [Fact] public void StandardIrr() { var r = InvestmentReturns.Irr([-100m, 60m, 60m]); Assert.Equal("Success", r.Status); Assert.Equal(0.1306623863, r.Rate!.Value, 8); }
    [Theory] [InlineData(1100, .1)] [InlineData(900, -.1)]
    public void Actual365(int ending, double expected) { var r = InvestmentReturns.Xirr([new(new(2025,1,1), -1000), new(new(2026,1,1), ending)]); Assert.Equal("Success", r.Status); Assert.Equal(expected, r.Rate!.Value, 8); }
    [Fact] public void MultipleRoots() { var r = InvestmentReturns.Irr([-100m,230m,-132m]); Assert.Equal("MultipleRoots", r.Status); Assert.Null(r.Rate); Assert.Equal(2, r.Roots.Length); Assert.Equal(.1, r.Roots[0], 8); Assert.Equal(.2, r.Roots[1], 8); }
    [Fact] public void NegativeOnlyIsNotZero() { var r = InvestmentReturns.Irr([-100m,-10m]); Assert.Equal("NoSignChange", r.Status); Assert.Null(r.Rate); }
    [Fact] public void SameDateIsInsufficient() { var r = InvestmentReturns.Xirr([new(new(2025,1,1),-100),new(new(2025,1,1),110)]); Assert.Null(r.Rate); }
}
