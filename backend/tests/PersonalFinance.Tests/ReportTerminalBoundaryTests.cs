using PersonalFinance.Api.Application;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class ReportTerminalBoundaryTests
{
    [Theory]
    [InlineData("day")]
    [InlineData("week")]
    [InlineData("month")]
    [InlineData("year")]
    public void TerminalCalendarRangeRemainsQueryable(string granularity)
    {
        var end = new DateTimeOffset(9999, 12, 31, 23, 59, 59, TimeSpan.FromHours(8));
        var periods = FinanceService.ReportPeriods(end.AddHours(-1), end, granularity);
        var period = Assert.Single(periods);
        Assert.Equal(end.AddHours(-1), period.Start);
        Assert.Equal(end, period.End);
        Assert.Single(FinanceService.ReportPeriods(end, end, granularity));
    }
}
