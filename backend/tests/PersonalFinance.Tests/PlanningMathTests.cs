using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class PlanningMathTests
{
    [Theory]
    [InlineData("0")]
    [InlineData("0.01")]
    [InlineData("100.01")]
    [InlineData("999999999999999999.99")]
    public void EvenAllocationPreservesEveryCent(string text)
    {
        var total = FinanceService.Money(text); var months = PlanningMath.EvenMonths(total);
        Assert.Equal(12, months.Length); Assert.Equal(total, months.Sum());
        Assert.All(months, m => Assert.Equal(m, decimal.Round(m, 2)));
        Assert.InRange(months.Max() - months.Min(), 0, .01m);
    }
    [Theory]
    [InlineData("None", "100", "0", null, "0")]
    [InlineData("Full", "100", "0", null, "100")]
    [InlineData("Fixed", "20", "30", null, "20")]
    [InlineData("Percent", "1.01", "70", null, "0.70")]
    [InlineData("Full", "100", "0", "35", "35")]
    public void CarryRulesAreBounded(string rule, string remaining, string parameter, string? cap, string expected)
        => Assert.Equal(FinanceService.Money(expected), PlanningMath.Carryover(FinanceService.Money(remaining), rule, FinanceService.Money(parameter), cap == null ? null : FinanceService.Money(cap), false));
    [Fact]
    public void OverspendIsOptIn()
    {
        Assert.Equal(0, PlanningMath.Carryover(-10, "Full", 0, null, false));
        Assert.Equal(-10, PlanningMath.Carryover(-10, "Full", 0, null, true));
    }
    [Fact] public void NegativeBalanceDoesNotBypassRuleValidation()
    { Assert.Throws<PersonalFinance.Api.Contracts.ApiException>(() => PlanningMath.Carryover(-10, "Invalid", 0, null, true)); Assert.Throws<PersonalFinance.Api.Contracts.ApiException>(() => PlanningMath.Carryover(-10, "Percent", 101, null, true)); }
}
