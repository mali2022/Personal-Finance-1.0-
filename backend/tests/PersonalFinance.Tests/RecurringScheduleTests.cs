using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class RecurringScheduleTests
{
    [Theory]
    [InlineData("Day", 1, "2024-02-01")]
    [InlineData("Week", 1, "2024-02-07")]
    [InlineData("Month", 1, "2024-02-29")]
    [InlineData("Quarter", 1, "2024-04-30")]
    [InlineData("HalfYear", 1, "2024-07-31")]
    [InlineData("Year", 1, "2025-01-31")]
    [InlineData("Custom", 10, "2024-02-10")]
    public void UsesCalendarAnchor(string frequency, int interval, string expected)
    {
        var date = RecurringSchedule.At(new DateTime(2024,1,31,12,30,25), frequency, interval, 1, "Clamp", "Asia/Shanghai");
        Assert.Equal(expected, date!.Value.ToString("yyyy-MM-dd")); Assert.Equal(25, date.Value.Second);
    }
    [Fact] public void MonthEndDoesNotDrift() { var anchor = new DateTime(2025,1,31); Assert.Equal(28, RecurringSchedule.At(anchor,"Month",1,1,"Clamp","Asia/Shanghai")!.Value.Day); Assert.Equal(31,RecurringSchedule.At(anchor,"Month",1,2,"Clamp","Asia/Shanghai")!.Value.Day); Assert.Null(RecurringSchedule.At(anchor,"Month",1,1,"Skip","Asia/Shanghai")); }
    [Fact] public void LeapYearRetainsAnchor() { var anchor=new DateTime(2024,2,29); Assert.Null(RecurringSchedule.At(anchor,"Year",1,1,"Skip","Asia/Shanghai")); Assert.Equal(29,RecurringSchedule.At(anchor,"Year",1,4,"Skip","Asia/Shanghai")!.Value.Day); }
    [Fact] public void DstGapAndOverlapAreDeterministic() { var gap=RecurringSchedule.At(new DateTime(2026,3,8,2,30,0),"Day",1,0,"Clamp","America/New_York")!.Value; Assert.Equal(3,gap.Hour); var overlap=RecurringSchedule.At(new DateTime(2026,11,1,1,30,0),"Day",1,0,"Clamp","America/New_York")!.Value; Assert.Equal(TimeSpan.FromHours(-4),overlap.Offset); }
}
