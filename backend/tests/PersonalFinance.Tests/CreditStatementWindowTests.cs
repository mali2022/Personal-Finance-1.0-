using PersonalFinance.Api.Application;
using Xunit;

namespace PersonalFinance.Tests;
public sealed class CreditStatementWindowTests
{
    [Theory]
    [InlineData(2024, 2, 31, 31, "2024-02-01", "2024-02-29", "2024-03-31")]
    [InlineData(2025, 2, 31, 31, "2025-02-01", "2025-02-28", "2025-03-31")]
    [InlineData(2026, 3, 31, 31, "2026-03-01", "2026-03-31", "2026-04-30")]
    [InlineData(2026, 12, 20, 10, "2026-11-21", "2026-12-20", "2027-01-10")]
    public void ClipsNaturalMonthsAndPreservesNextMonthConvention(int year, int month, int statementDay, int paymentDay, string start, string statement, string due)
    {
        var w = CreditStatementWindow.Create(year, month, statementDay, paymentDay);
        Assert.Equal(start, w.CycleStart.ToString("yyyy-MM-dd"));
        Assert.Equal(statement, w.StatementEnd.ToString("yyyy-MM-dd"));
        Assert.Equal(due, w.DueDate.ToString("yyyy-MM-dd"));
        Assert.Equal(TimeSpan.FromHours(8), w.CycleStart.Offset);
    }

    [Fact]
    public void IncludesLastSqlServerTickAndEntireDueDayButExcludesNextMidnight()
    {
        var w = CreditStatementWindow.Create(2026, 10, 20, 10);
        var last = DateTimeOffset.Parse("2026-10-20T23:59:59.9999999+08:00");
        Assert.Equal(last, w.StatementEnd);
        Assert.True(last >= w.CycleStart && last < w.StatementEndExclusive);
        var dueLast = DateTimeOffset.Parse("2026-11-10T15:59:59.9999999Z");
        Assert.True(dueLast >= w.StatementEndExclusive && dueLast < w.DueEndExclusive);
        Assert.Equal(dueLast.AddTicks(1), w.DueEndExclusive);
        Assert.False(w.DueEndExclusive < w.DueEndExclusive);
    }

    [Theory]
    [InlineData(0, 10)]
    [InlineData(32, 10)]
    [InlineData(20, 0)]
    [InlineData(20, 32)]
    public void RejectsInvalidContractDays(int statement, int due)
        => Assert.Throws<ArgumentOutOfRangeException>(() => CreditStatementWindow.Create(2026, 10, statement, due));
}
