using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class PhysicalAssetTests
{
    static readonly DateOnly Start = new(2024, 1, 1);
    static ManagedAsset Asset() => new() { Cost = 1200, AcquiredDate = Start, Type = "Other" };
    [Fact] public void StraightLineUsesServiceDateAndFloorsAtResidual()
    {
        var a = Asset(); var p = new PhysicalProfile { InServiceDate = new(2024, 7, 1), Quantity = 2 };
        var rule = new PhysicalValueRule { Date = Start, Method = "StraightLine", LifeMonths = 12, Residual = 120 };
        Assert.Equal(1200, PhysicalAssetMath.Calculate(a, p, [rule], [], [], new(2024, 6, 1)).BookValue);
        var end = PhysicalAssetMath.Calculate(a, p, [rule], [], [], new(2025, 7, 1));
        Assert.Equal(120, end.BookValue); Assert.Equal(120, end.Value); Assert.Equal(1200, end.OriginalCost); Assert.Null(end.MarketValue);
    }
    [Fact] public void PartialDisposalAndReversalAreDateEffectiveAndKeepOriginalCost()
    {
        var a = Asset(); var p = new PhysicalProfile { Quantity = 4 };
        var rule = new PhysicalValueRule { Date = Start, Method = "QuantityPrice", Amount = 200, MarketValue = 1000, NetRealizableValue = 900 };
        var sale = new PhysicalEvent { Id = "sale", Date = new(2024, 2, 1), Kind = "Sold", Quantity = 1 };
        var reversal = new PhysicalEvent { Date = new(2024, 3, 1), Kind = "Reverse", ReversesId = "sale" };
        var mid = PhysicalAssetMath.Calculate(a, p, [rule], [], [sale, reversal], new(2024, 2, 15));
        Assert.Equal(3, mid.Quantity); Assert.Equal(600, mid.Value); Assert.Equal(900, mid.RemainingCost); Assert.Equal(1200, mid.OriginalCost); Assert.Equal(750, mid.MarketValue); Assert.Equal("Active", mid.State);
        var after = PhysicalAssetMath.Calculate(a, p, [rule], [], [sale, reversal], new(2024, 3, 1));
        Assert.Equal(4, after.Quantity); Assert.Equal(800, after.Value);
    }
    [Fact] public void RulesAndLegacyObservationsNeverLeakIntoEarlierSnapshots()
    {
        var a = Asset(); var first = new PhysicalValueRule { Date = Start, Method = "Fixed", Amount = 500 };
        var second = new PhysicalValueRule { Date = new(2024, 3, 1), Method = "Market", MarketValue = 900 };
        var legacy = new ManagedAssetValuation { Date = new(2024, 2, 1), Amount = 600, Source = "observed" };
        Assert.Null(PhysicalAssetMath.Calculate(a, null, [second], [], [], Start).Value);
        Assert.Equal(500, PhysicalAssetMath.Calculate(a, null, [first, second], [legacy], [], Start).Value);
        Assert.Equal(600, PhysicalAssetMath.Calculate(a, null, [first, second], [legacy], [], new(2024, 2, 1)).Value);
        Assert.Equal(900, PhysicalAssetMath.Calculate(a, null, [first, second], [legacy], [], new(2024, 3, 1)).Value);
    }
    [Theory][InlineData(0, 1200)][InlineData(100, 0)][InlineData(20, 960)]
    public void DecliningBalanceHandlesRateBounds(decimal rate, decimal expected)
    {
        var rule = new PhysicalValueRule { Date = Start, Method = "DecliningBalance", AnnualRate = rate, LifeMonths = 60 };
        var v = PhysicalAssetMath.Calculate(Asset(), null, [rule], [], [], Start.AddDays(365));
        Assert.InRange(v.BookValue, expected - 0.2m, expected + 0.2m);
    }
    [Fact] public void ArchiveAndFullDisposalRetainHistoricalFacts()
    {
        var a = Asset(); var e = new PhysicalEvent { Date = Start.AddDays(1), Kind = "Sold", Quantity = 1 };
        var r = new PhysicalValueRule { Date = Start, Method = "Manual", Amount = 800 };
        var v = PhysicalAssetMath.Calculate(a, null, [r], [], [e], Start.AddDays(2));
        Assert.Equal(0, v.Value); Assert.Equal(0, v.Quantity); Assert.Equal("Sold", v.State); Assert.Equal(1200, v.OriginalCost);
        Assert.Equal(800, PhysicalAssetMath.Calculate(a, null, [r], [], [e], Start).Value);
    }
}
