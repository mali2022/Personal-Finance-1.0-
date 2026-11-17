using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class StageGRulesTests
{
    [Fact] public void FamilyAllocationBalancesCentsAndZeroWeights()
    {
        Assert.Equal(new[] { 33.34m, 33.33m, 33.33m }, AdvanceShareMath.Allocate(100, "Equal", new[] { 0m, 0m, 0m }));
        Assert.Equal(new[] { 0m, .01m, .01m }, AdvanceShareMath.Allocate(.02m, "Ratio", new[] { 0m, 1m, 1m }));
        Assert.Equal(new[] { 50m, 150m }, AdvanceShareMath.Allocate(200, "Fixed", new[] { 50m, 150m }));
        Assert.Throws<ApiException>(() => AdvanceShareMath.Allocate(200, "Fixed", new[] { 50m, 149.99m }));
    }
    [Fact] public void PayrollGrossAndActualAreNotAddedTogether()
    {
        var amounts = PayrollMath.Calculate([new() { Kind = "Earning", Amount = 10000 }, new() { Kind = "Deduction", Amount = 1800 }, new() { Kind = "Adjustment", Amount = -10 }]);
        Assert.Equal(10000, amounts.gross); Assert.Equal(1800, amounts.deduction); Assert.Equal(8190, amounts.net);
    }
    [Fact] public void BasketQuantityUsesComparableStandardUnits()
    {
        Assert.Equal(("kg", 0.5m), LivingCostMath.Normalize("g", 500)); Assert.Equal(("L", 0.25m), LivingCostMath.Normalize("ml", 250));
        Assert.Equal(("kg", 0.5m), LivingCostMath.Normalize("100g", 5)); Assert.Equal(("小时", 2m), LivingCostMath.Normalize("小时", 2)); Assert.Throws<ApiException>(() => LivingCostMath.Normalize("", 1));
        Assert.Equal(120, LivingCostMath.Index(20, 24, true)); Assert.Null(LivingCostMath.Index(20, 24, false)); Assert.Null(LivingCostMath.Index(0, 24, true));
    }
    [Fact] public void AnniversaryOnlyMatchesRealLeapDaysWithShanghaiBoundaries()
    {
        Assert.Null(FinanceService.AnniversaryRange(2023, 2, 29)); var range = FinanceService.AnniversaryRange(2024, 2, 29)!.Value;
        Assert.Equal(TimeSpan.FromHours(8), range.start.Offset); Assert.Equal(TimeSpan.FromDays(1), range.end - range.start);
        Assert.Equal(new DateTime(2024, 2, 28, 16, 0, 0, DateTimeKind.Utc), range.start.UtcDateTime);
    }
    [Fact] public void HoldPartialSettlementAndReleaseNeverDoubleCount()
    {
        var hold = new AccountFundHold { Amount = 500 };
        FundHoldRules.Apply(hold, "Confirm", 0);
        Assert.Equal(500, FundHoldRules.AvailabilityDeduction(hold));
        FundHoldRules.Apply(hold, "Settle", 300);
        FundHoldRules.Apply(hold, "Release", 200);
        Assert.Equal(300, hold.SettledAmount); Assert.Equal(200, hold.ReleasedAmount);
        Assert.Equal(0, FundHoldRules.AvailabilityDeduction(hold));
        Assert.Throws<ApiException>(() => FundHoldRules.Apply(hold, "Settle", 1));
    }
    [Fact] public void PendingCreditAndAlreadyDebitedDoNotReduceAvailable()
    {
        Assert.Equal(0, FundHoldRules.AvailabilityDeduction(new() { Amount = 500, State = "Confirmed", Type = "PendingCredit" }));
        Assert.Equal(0, FundHoldRules.AvailabilityDeduction(new() { Amount = 500, State = "Confirmed", IncludedInBookBalance = false }));
        Assert.Equal(0, FundHoldRules.AvailabilityDeduction(new() { Amount = 500, State = "Draft" }));
    }
    [Fact] public void HoldCannotSettleDraftOrExceedRemainder()
    {
        var h = new AccountFundHold { Amount = 500 };
        Assert.Throws<ApiException>(() => FundHoldRules.Apply(h, "Settle", 100));
        FundHoldRules.Apply(h, "Confirm", 0); FundHoldRules.Apply(h, "Release", 200);
        Assert.Throws<ApiException>(() => FundHoldRules.Apply(h, "Settle", 301));
        FundHoldRules.Apply(h, "Expire", 0); Assert.Equal(500, h.ReleasedAmount);
    }
    [Fact] public void HistoricalQuoteNeverUsesFutureInverseOrDifferentPair()
    {
        var rates = new[] {
            new FxValuationRate { BaseCurrency = "USD", TargetCurrency = "CNY", Date = new(2026, 1, 1), Rate = 7.2m },
            new FxValuationRate { BaseCurrency = "USD", TargetCurrency = "CNY", Date = new(2026, 2, 1), Rate = 8 },
            new FxValuationRate { BaseCurrency = "CNY", TargetCurrency = "USD", Date = new(2026, 1, 15), Rate = 0.1m }
        };
        Assert.Equal(7.2m, FxRateSelection.Select(rates, "USD", "CNY", new(2026, 1, 15))!.Rate);
        Assert.Null(FxRateSelection.Select(rates, "USD", "CNY", new(2026, 1, 15), "ExactDate"));
        Assert.Null(FxRateSelection.Select(rates, "HKD", "CNY", new(2026, 1, 15)));
        Assert.Throws<ApiException>(() => FxRateSelection.Select(rates, "USD", "CNY", new(2026, 1, 15), "Current"));
    }
}
