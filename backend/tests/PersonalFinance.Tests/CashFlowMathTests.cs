using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class CashFlowMathTests
{
    private static readonly DateOnly Start = new(2024, 2, 28);
    [Fact] public void EmptyForecastRetainsLiveOpening()
    { var r = CashFlowMath.Calculate(100, Start, Start.AddDays(7), []); Assert.Equal(100, r.Closing); Assert.Equal(100, r.Minimum); Assert.Equal(7, r.Days.Length); }
    [Fact] public void LeapDayAndExclusiveEnd()
    { var r = CashFlowMath.Calculate(100, Start, Start.AddDays(2), [new(Start, -10, "a"), new(Start.AddDays(1), -200, "b"), new(Start.AddDays(2), 999, "c")]); Assert.Equal(-110, r.Closing); Assert.Equal(Start.AddDays(1), r.MinimumDate); Assert.Equal(-110, r.Minimum); }
    [Fact] public void SameDayUsesNetEndOfDay()
    { var r = CashFlowMath.Calculate(10, Start, Start.AddDays(1), [new(Start, -100, "a"), new(Start, 200, "b")]); Assert.Equal(110, r.Closing); Assert.Equal(10, r.Minimum); Assert.Equal(200, r.Inflow); Assert.Equal(100, r.Outflow); }
    [Fact] public void DecimalPrecisionDoesNotDrift()
    { var r = CashFlowMath.Calculate(.01m, Start, Start.AddDays(1), Enumerable.Range(0, 100).Select(i => new ForecastDelta(Start, .01m, i.ToString()))); Assert.Equal(1.01m, r.Closing); }
    [Fact] public void WeightedSuggestionPreservesTotal()
    { var values = PlanningMath.WeightedMonths(100.01m, Enumerable.Range(1, 12).Select(i => (decimal)i).ToArray()); Assert.Equal(100.01m, values.Sum()); Assert.All(values, n => Assert.Equal(n, decimal.Round(n, 2))); Assert.True(values[11] > values[0]); }
    [Fact] public void LongForecastSamplesDisplayButKeepsEveryEventAndExactMinimum()
    {
        var eventDay = Start.AddYears(50).AddDays(3);
        var r = CashFlowMath.Calculate(100, Start, Start.AddYears(100), [new(eventDay, -250, "a"), new(eventDay.AddDays(1), 400, "b")]);
        Assert.True(r.Sampled); Assert.True(r.Days.Length < 1100); Assert.Equal(250, r.Closing); Assert.Equal(-150, r.Minimum); Assert.Equal(eventDay, r.MinimumDate);
        Assert.Equal(400, r.Inflow); Assert.Equal(250, r.Outflow); Assert.Contains(r.Days, d => d.Date == eventDay && d.Outflow == 250);
    }
}
