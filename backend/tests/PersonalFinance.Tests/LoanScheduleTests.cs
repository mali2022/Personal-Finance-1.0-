using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;

namespace PersonalFinance.Tests;
public class LoanScheduleTests
{
    static LoanScheduleInput Plan(string mode = "EqualPayment") => new("测试", "1000.00", new(2026, 1, 1), new(2026, 1, 31), 12, 6, 0.05m, mode, []);
    static readonly DateOnly Today = new(2026, 3, 2);
    [Theory]
    [InlineData("EqualPayment")]
    [InlineData("EqualPrincipal")]
    [InlineData("InterestOnly")]
    public void PrincipalReconcilesAndMonthEndsUseOriginalAnchor(string mode)
    {
        var rows = LoanScheduleMath.Generate(Plan(mode), Today);
        Assert.Equal(1000m, rows.Sum(x => x.Principal)); Assert.Equal(0m, rows[^1].RemainingPrincipal);
        Assert.Equal(new DateOnly(2026, 2, 28), rows[1].Date); Assert.Equal(new DateOnly(2026, 3, 31), rows[2].Date);
        Assert.All(rows, x => Assert.Equal(x.Principal + x.Interest + x.OverdueInterest, x.Total));
        if (mode == "InterestOnly") { Assert.Equal(0m, rows[0].Principal); Assert.Equal(1000m, rows[^1].Principal); }
        if (mode == "EqualPayment") { Assert.Equal(81.07m, rows[0].Principal); Assert.Equal(5m, rows[0].Interest); }
    }
    [Fact] public void OverridesRecalculateLaterInterestAndBalanceAndPreserveExplicitZero()
    {
        var rows = LoanScheduleMath.Generate(Plan() with { Overrides = [new(1, "200", "0", "7.25", new(2026, 2, 2))] }, Today);
        Assert.Equal(200m, rows[0].Principal); Assert.Equal(0m, rows[0].Interest); Assert.Equal(7.25m, rows[0].OverdueInterest);
        Assert.Equal(2, rows[0].OverdueDays); Assert.Equal("逾期已还", rows[0].Status);
        Assert.Equal(4m, rows[1].Interest); Assert.Equal(1000m, rows.Sum(x => x.Principal));
    }
    [Fact] public void OverdueUsesTodayUntilPaidAndStopsOnPaymentDate()
    {
        var p = Plan("EqualPrincipal");
        var rows = LoanScheduleMath.Generate(p, Today);
        Assert.Equal(30, rows[0].OverdueDays); Assert.Equal(1.25m, rows[0].OverdueInterest);
        rows = LoanScheduleMath.Generate(p with { Overrides = [new(1, PaidDate: new(2026, 1, 31))] }, Today);
        Assert.Equal(0m, rows[0].OverdueInterest); Assert.Equal("已还", rows[0].Status);
    }
    [Fact] public void InvalidAmountsDuplicateOverridesAndUnbalancedPrincipalAreRejected()
    {
        Assert.Throws<ApiException>(() => LoanScheduleMath.Generate(Plan() with { Principal = "-1" }, Today));
        Assert.Throws<ApiException>(() => LoanScheduleMath.Generate(Plan() with { Overrides = [new(1), new(1)] }, Today));
        Assert.Throws<ApiException>(() => LoanScheduleMath.Generate(Plan() with { Overrides = [new(1, "1001")] }, Today));
        Assert.Throws<ApiException>(() => LoanScheduleMath.Generate(Plan() with { Overrides = [new(12, "0")] }, Today));
        Assert.Throws<ApiException>(() => LoanScheduleMath.Generate(Plan() with { Overrides = [new(1, Interest: "1.001")] }, Today));
    }
    [Fact] public void ZeroRateAndMaximumInputsDoNotOverflow()
    {
        Assert.Equal(1000m, LoanScheduleMath.Generate(Plan() with { AnnualRate = 0 }, Today).Sum(x => x.Principal));
        Assert.Equal(999999999999.99m, LoanScheduleMath.Generate(Plan() with { Principal = "999999999999.99", AnnualRate = 100, Periods = 600 }, Today).Sum(x => x.Principal));
    }
}
