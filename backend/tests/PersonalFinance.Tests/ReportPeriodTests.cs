using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;

namespace PersonalFinance.Tests;
public sealed class ReportPeriodTests
{
    [Fact]
    public void PreservesClippedMonthAnchorAndExactEndBoundary()
    {
        var start = DateTimeOffset.Parse("2024-01-31T10:00:00+08:00");
        var end = DateTimeOffset.Parse("2024-03-29T10:00:00+08:00");
        var periods = FinanceService.ReportPeriods(start, end, "month");
        Assert.Equal(3, periods.Count);
        Assert.Equal(DateTimeOffset.Parse("2024-02-29T10:00:00+08:00"), periods[1].Start);
        Assert.Equal(end, periods[2].Start);
        Assert.Equal(end, periods[2].End);
        for (var i = 1; i < periods.Count; i++) Assert.Equal(periods[i - 1].End.AddTicks(1), periods[i].Start);
    }
    [Theory]
    [InlineData("day", 10)]
    [InlineData("week", 2)]
    [InlineData("month", 1)]
    [InlineData("year", 1)]
    public void CoversEveryTickWithoutGaps(string granularity, int count)
    {
        var start = DateTimeOffset.Parse("2025-12-31T16:00:00Z");
        var end = start.AddDays(10).AddTicks(-1);
        var periods = FinanceService.ReportPeriods(start, end, granularity);
        Assert.Equal(count, periods.Count);
        Assert.Equal(start, periods[0].Start);
        Assert.Equal(end, periods[^1].End);
        for (var i = 1; i < periods.Count; i++) Assert.Equal(periods[i - 1].End.AddTicks(1), periods[i].Start);
    }
    [Fact]
    public void RejectsExcessiveDailyPointsBeforeQuerying()
        => Assert.Throws<ApiException>(() => FinanceService.ReportPeriods(DateTimeOffset.Parse("2024-01-01Z"), DateTimeOffset.Parse("2025-12-31Z"), "day"));
}
