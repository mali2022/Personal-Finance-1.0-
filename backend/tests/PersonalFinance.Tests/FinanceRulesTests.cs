using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class FinanceRulesTests
{
    [Theory]
    [InlineData("25", "25.00")]
    [InlineData("25.5", "25.50")]
    [InlineData("0.01", "0.01")]
    [InlineData("999999999999999999.99", "999999999999999999.99")]
    public void DecimalInputRetainsExactValue(string input, string expected) => Assert.Equal(expected, FinanceService.M(FinanceService.Money(input, true)));
    [Theory]
    [InlineData("0")][InlineData("-1")][InlineData("1.001")][InlineData("NaN")][InlineData("1e2")][InlineData("1,200")][InlineData("")][InlineData("1000000000000000000")]
    public void InvalidAmountRejected(string input) => Assert.Throws<ApiException>(() => FinanceService.Money(input, true));
    [Theory]
    [InlineData("2026-02", "2026-02-01", "2026-02-28")]
    [InlineData("2024-02", "2024-02-01", "2024-02-29")]
    [InlineData("2026-10", "2026-10-01", "2026-10-31")]
    [InlineData("2026-12", "2026-12-01", "2026-12-31")]
    public void MonthPreservesShanghaiBoundary(string input, string first, string last)
    { var range = FinanceService.Month(input); Assert.Equal(first, range.start.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd")); Assert.Equal(last, range.end.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd")); Assert.Equal(16, range.start.UtcDateTime.Hour); }
    [Fact]
    public void CalendarDateIsShanghaiDate() => Assert.Equal(new DateTimeOffset(2026, 10, 7, 16, 0, 0, TimeSpan.Zero), FinanceService.Date("2026-10-08").ToUniversalTime());
    [Fact]
    public void StaleVersionCannotOverwrite()
    { var account = new Account { Version = 2 }; Assert.Throws<ApiException>(() => FinanceService.Version(account, "1")); FinanceService.Version(account, "2"); }
    [Fact]
    public void AuditFreeTextIsRedactedAndMoneyRetainsPrecision()
    {
        Assert.Equal("[内容已脱敏]", FinanceService.AuditValue("Note", "private receipt reference"));
        Assert.Equal("[内容已脱敏]", FinanceService.AuditValue("Counterparty", "private person"));
        Assert.Equal("1234567890123456.78", FinanceService.AuditValue("Amount", 1234567890123456.78m));
        Assert.Null(FinanceService.AuditValue("Note", null));
    }
}
