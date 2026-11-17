using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class FinancialReviewTests
{
    [Fact] public void ZeroComparisonHasNoPercentage() => Assert.Null(FinanceService.ReviewChangeRate(100, 0));
    [Theory]
    [InlineData(150, 100, 50)]
    [InlineData(-50, -100, 50)]
    [InlineData(-150, -100, -50)]
    [InlineData(0, 100, -100)]
    public void ChangeUsesAbsoluteComparisonDenominator(decimal current, decimal previous, decimal expected)
        => Assert.Equal(expected, FinanceService.ReviewChangeRate(current, previous));
}
