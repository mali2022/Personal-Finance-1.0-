using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public class SpendingApprovalConstraintTests
{
    [Theory]
    [InlineData(100, 0, 0, 900, 900, false)]
    [InlineData(100, 100, 0, 800, 900, true)]
    [InlineData(100, 200, 300, 400, 700, true)]
    public void UnknownOverlapProducesBounds(decimal goal, decimal emergency, decimal future, decimal lower, decimal upper, bool unresolved)
    {
        var r = SpendingApprovalRules.AssessUnreconciled(new(100, 1000, 0, goal, emergency, future, 1000, 1000, true));
        Assert.Equal(lower, r.LowerAvailable); Assert.Equal(upper, r.UpperAvailable); Assert.Equal(unresolved, r.OverlapUnresolved);
        if (unresolved) Assert.Null(r.Safety.DiscretionaryCash);
    }
    [Fact] public void AmbiguousOverlapDoesNotInventCashShortfall()
    {
        var r = SpendingApprovalRules.AssessUnreconciled(new(600, 1000, 0, 300, 300, 0, 1000, 1000, true));
        Assert.Equal("NEEDS_INFORMATION", r.Safety.Verdict); Assert.DoesNotContain("CASH_RESERVES_BREACHED", r.Safety.Reasons);
    }
    [Fact] public void DefiniteShortfallStillDefers() => Assert.Equal("DEFERRED", SpendingApprovalRules.AssessUnreconciled(new(800, 1000, 0, 300, 300, 0, 1000, 1000, true)).Safety.Verdict);
    [Fact] public void MissingValuationHasNoBounds() => Assert.Null(SpendingApprovalRules.AssessUnreconciled(new(100, 1000, 0, 300, 300, 0, 1000, 1000, false)).UpperAvailable);
}
