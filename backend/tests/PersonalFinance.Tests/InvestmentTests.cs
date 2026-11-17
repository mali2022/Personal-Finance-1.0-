using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class InvestmentTests
{
 private static InvestmentTrade Trade(string type, decimal quantity, decimal amount, int day, decimal fee = 0) => new() { Type = type, Quantity = quantity, Amount = amount, Date = new DateOnly(2026, 1, day), Commission = fee };
 [Fact] public void WeightedCostAndRealizedAreSeparated() { var r = InvestmentMath.Calculate([Trade("Buy", 10, 100, 1, 1), Trade("Buy", 10, 200, 2, 1), Trade("Sell", 5, 100, 3, 2)]); Assert.Equal(15, r.Quantity); Assert.Equal(226.5m, r.Cost); Assert.Equal(22.5m, r.Realized); Assert.Equal(4, r.Fees); }
 [Fact] public void FullLiquidationClearsAllCostRemainders() { var r = InvestmentMath.Calculate([Trade("Buy", 3, 100, 1), Trade("Sell", 1, 30, 2), Trade("Sell", 2, 70, 3)]); Assert.Equal(0, r.Quantity); Assert.Equal(0, r.Cost); Assert.Equal(0, r.Realized); }
 [Fact] public void OversellingRejectsHistory() => Assert.Throws<ApiException>(() => InvestmentMath.Calculate([Trade("Buy", 1, 10, 1), Trade("Sell", 2, 30, 2)]));
 [Fact] public void RevokedBuyCannotSupportLaterSale() { var buy = Trade("Buy", 1, 10, 1); buy.State = "Revoked"; Assert.Throws<ApiException>(() => InvestmentMath.Calculate([buy, Trade("Sell", 1, 30, 2)])); }
 [Fact] public void DividendsInterestAndFeesDoNotChangeQuantity() { var r = InvestmentMath.Calculate([Trade("Buy", 1, 100, 1), Trade("Dividend", 0, 5, 2, 1), Trade("Interest", 0, 2, 3), Trade("Fee", 0, 3, 4)]); Assert.Equal(1, r.Quantity); Assert.Equal(100, r.Cost); Assert.Equal(6, r.Income); Assert.Equal(-3, r.Realized); Assert.Equal(4, r.Fees); }
 [Fact] public void LossIsPreserved() { var r = InvestmentMath.Calculate([Trade("Buy", 2, 100, 1), Trade("Sell", 1, 40, 2)]); Assert.Equal(-10, r.Realized); }
 [Fact] public void PositionAdjustmentCarriesCostWithoutCashGain() { var r = InvestmentMath.Calculate([Trade("PositionIncrease", 4, 100, 1), Trade("PositionDecrease", 1, 0, 2), Trade("Sell", 1, 30, 3)]); Assert.Equal(2, r.Quantity); Assert.Equal(50, r.Cost); Assert.Equal(5, r.Realized); Assert.Equal(0, r.Income); }
 [Fact] public void FullPositionRemovalClearsCostWithoutRealizingLoss() { var r = InvestmentMath.Calculate([Trade("PositionIncrease", 3, 100, 1), Trade("PositionDecrease", 3, 0, 2)]); Assert.Equal(0, r.Cost); Assert.Equal(0, r.Realized); }
 [Theory] [InlineData("1.12345678")] [InlineData("0.00000001")] public void SupportsEightDecimalPrecision(string value) => Assert.True(FinanceService.InvestmentDecimal(value, true) > 0);
 [Theory] [InlineData("1.123456789")] [InlineData("-1")] [InlineData("1e4")] [InlineData("NaN")] public void RejectsInvalidPreciseValues(string value) => Assert.Throws<ApiException>(() => FinanceService.InvestmentDecimal(value));
 [Fact] public void PriceProductRoundsAwayFromZero() => Assert.Equal(0.01m, InvestmentMath.Gross(0.5m, 0.01m));
 [Fact] public void LeapYearDayCountIsExplicit() { Assert.Equal(100.27m, FinanceService.DepositInterest(10000, 1, new(2024, 1, 1), new(2025, 1, 1), "Actual365")); Assert.Equal(101.67m, FinanceService.DepositInterest(10000, 1, new(2024, 1, 1), new(2025, 1, 1), "Actual360")); }
 [Fact] public void UnspecifiedDayCountIsRejected() => Assert.Throws<ApiException>(() => FinanceService.DepositInterest(100, 1, new(2024, 1, 1), new(2025, 1, 1), "Unknown"));
}
