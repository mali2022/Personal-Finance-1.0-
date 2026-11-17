using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class SpendingApprovalInstallmentTests
{
    [Fact] public void TotalCostIncludesEveryFeeAndFinalCent()
    {
        var result = JsonSerializer.SerializeToElement(ApprovalInstallmentMath.Calculate(1000, new(100, 900, 7, 31)), FinanceService.Json);
        Assert.Equal(1031, result.GetProperty("totalCost").GetDecimal());
        Assert.Equal(931, result.GetProperty("regularPayment").GetDecimal() * 6 + result.GetProperty("finalPayment").GetDecimal());
    }
    [Theory]
    [InlineData(100, 800, 12, 0)]
    [InlineData(100, 900, 0, 0)]
    [InlineData(100, 900, 12, -1)]
    [InlineData(100, 900, 12, 0.001)]
    public void InvalidPlanRejected(decimal down, decimal principal, int months, decimal fees) => Assert.Throws<ApiException>(() => ApprovalInstallmentMath.Calculate(1000, new(down, principal, months, fees)));
}
