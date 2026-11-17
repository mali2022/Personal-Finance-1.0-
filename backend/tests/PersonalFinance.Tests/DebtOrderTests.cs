using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public class DebtOrderTests
{
    [Fact]
    public void HighestRateReducesHypotheticalCostWithoutChangingSources()
    {
        DebtOrderBalance[] sources = [new("a", 1000, .02m), new("b", 200, .01m)];
        var high = DebtOrderMath.Calculate(sources, 300, 12, "HighestRate"); var small = DebtOrderMath.Calculate(sources, 300, 12, "SmallestBalance");
        Assert.Equal(0, high.RemainingPrincipal); Assert.Equal(0, small.RemainingPrincipal); Assert.True(high.Interest <= small.Interest); Assert.Equal(1000, sources[0].Principal);
    }
    [Fact]
    public void BudgetMustCoverInterest() => Assert.Throws<ArgumentException>(() => DebtOrderMath.Calculate([new("a", 1000, .02m)], 10, 12, "HighestRate"));
}
