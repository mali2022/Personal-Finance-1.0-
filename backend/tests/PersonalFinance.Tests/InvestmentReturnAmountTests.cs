using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class InvestmentReturnAmountTests
{
    [Fact] public void PartialSaleIncomeAndFeesReconcileWithoutDoubleDeduction()
    {
        InvestmentTrade[] trades = [
            new() { Type="Buy",Quantity=10,Amount=1000,Commission=10,Date=new(2025,1,1),SettlementDate=new(2025,1,1) },
            new() { Type="Sell",Quantity=4,Amount=480,Commission=5,Date=new(2025,6,1),SettlementDate=new(2025,6,1) },
            new() { Type="Dividend",Amount=50,Tax=5,Date=new(2025,7,1),SettlementDate=new(2025,7,1) },
            new() { Type="Interest",Amount=10,Date=new(2025,8,1),SettlementDate=new(2025,8,1) },
            new() { Type="Fee",Amount=3,Date=new(2025,9,1),SettlementDate=new(2025,9,1) } ];
        var analysis = InvestmentReturnCashFlows.Calculate(trades,[new(){Date=new(2026,1,1),Price=120}],new(2025,1,1),new(2026,1,1));
        var result = InvestmentReturnAmounts.Calculate(trades,analysis,new(2025,1,1),new(2026,1,1));
        Assert.True(result.Reconciled); Assert.Equal(237m,result.TotalProfit);
        Assert.Equal(68m,result.NetRealized); Assert.Equal(114m,result.UnrealizedChange);
        Assert.Equal(45m,result.NetDividends); Assert.Equal(10m,result.NetInterest); Assert.Equal(23m,result.IncludedFees);
        var period = InvestmentReturnCashFlows.Calculate(trades,[new(){Date=new(2025,5,31),Price=110},new(){Date=new(2026,1,1),Price=120}],new(2025,6,1),new(2026,1,1));
        var periodResult = InvestmentReturnAmounts.Calculate(trades,period,new(2025,6,1),new(2026,1,1));
        Assert.True(periodResult.Reconciled); Assert.Equal(147m,periodResult.TotalProfit); Assert.Equal(24m,periodResult.UnrealizedChange);
    }
    [Fact] public void MissingValuationDoesNotPublishPartialProfit()
    {
        InvestmentTrade[] rows = [new(){Type="Buy",Quantity=1,Amount=100,Date=new(2025,1,1),SettlementDate=new(2025,1,1)}];
        var analysis=InvestmentReturnCashFlows.Calculate(rows,[],new(2025,1,1),new(2026,1,1));
        Assert.Null(InvestmentReturnAmounts.Calculate(rows,analysis,new(2025,1,1),new(2026,1,1)).TotalProfit);
    }
}
