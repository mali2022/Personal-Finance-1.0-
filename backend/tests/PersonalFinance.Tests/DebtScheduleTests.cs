using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class DebtScheduleTests
{
    [Theory]
    [InlineData(3)] [InlineData(6)] [InlineData(12)] [InlineData(24)] [InlineData(600)]
    public void PrincipalIsExactAndFinalBalanceZero(int periods) {
        var rows = DebtScheduleMath.Generate(1000.01m, periods, new(2024, 1, 31), "EqualPrincipal", "None", 0);
        Assert.Equal(1000.01m, rows.Sum(x => x.Principal)); Assert.Equal(0, rows[^1].RemainingPrincipal);
        Assert.All(rows, x => Assert.Equal(x.OpeningPrincipal - x.Principal, x.RemainingPrincipal));
        Assert.Equal(new DateOnly(2024, 2, 29), rows[1].Date);
    }
    [Fact] public void RemainingInterestUsesOpeningBalanceAndPaymentTail() {
        var rows = DebtScheduleMath.Generate(10000, 12, new(2026, 12, 31), "EqualPayment", "RemainingPrincipalRate", 1);
        Assert.Equal(10000, rows.Sum(x => x.Principal)); Assert.Equal(100, rows[0].Fee); Assert.Equal(0, rows[^1].RemainingPrincipal);
        Assert.Equal(new DateOnly(2027, 1, 31), rows[1].Date);
        Assert.Equal(rows[0].Principal + rows[0].Fee, rows[1].Principal + rows[1].Fee);
    }
    [Fact] public void BulletDoesNotPayPrincipalBeforeMaturity() {
        var rows = DebtScheduleMath.Generate(100, 3, new(2026, 1, 1), "Bullet", "FixedPerPeriod", 2);
        Assert.Equal(0, rows[0].Principal); Assert.Equal(100, rows[2].Principal); Assert.Equal(6, rows.Sum(x => x.Fee));
    }
}
