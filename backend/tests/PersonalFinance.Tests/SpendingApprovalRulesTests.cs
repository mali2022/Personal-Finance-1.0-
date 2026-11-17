using PersonalFinance.Api.Application;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class SpendingApprovalRulesTests
{
    static SpendingApprovalFacts Facts => new(100m, 1000m, 100m, 100m, 200m, 100m, 500m, 300m, true);

    [Fact] public void ReservesAreExcluded()
    {
        var result = SpendingApprovalRules.Assess(Facts);
        Assert.Equal(500m, result.DiscretionaryCash);
        Assert.Equal(400m, result.CashAfter);
        Assert.Equal("NEEDS_INFORMATION", result.Verdict);
    }
    [Theory]
    [InlineData(99, 300, "MONTHLY_BUDGET_EXCEEDED")]
    [InlineData(500, 99, "CATEGORY_BUDGET_EXCEEDED")]
    public void BudgetPressureDefers(decimal monthly, decimal category, string reason)
    {
        var result = SpendingApprovalRules.Assess(Facts with { MonthlyRemaining = monthly, CategoryRemaining = category });
        Assert.Equal("DEFERRED", result.Verdict);
        Assert.Contains(reason, result.Reasons);
    }
    [Fact] public void MissingExchangeRateNeverInventsCash()
    {
        var result = SpendingApprovalRules.Assess(Facts with { ValuationComplete = false });
        Assert.Null(result.CashAfter);
        Assert.Contains("VALUATION_INCOMPLETE", result.Reasons);
    }
    [Fact] public void UnknownCashIsNotZero() => Assert.Null(SpendingApprovalRules.Assess(Facts with { AvailableCash = null }).DiscretionaryCash);
    [Fact] public void FrozenFundsPreventPurchase() => Assert.Equal("DEFERRED", SpendingApprovalRules.Assess(Facts with { FrozenCash = 900m }).Verdict);
    [Fact] public void FractionalCentsRejected() => Assert.Throws<ArgumentException>(() => SpendingApprovalRules.Assess(Facts with { Amount = 1.001m }));
}
