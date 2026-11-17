namespace PersonalFinance.Api.Application.Ai;
public sealed record AiComparisonWindow(DateTimeOffset Start, DateTimeOffset End, DateTimeOffset PreviousStart, DateTimeOffset PreviousEnd)
{
    public static AiComparisonWindow Month(DateTimeOffset start, DateTimeOffset asOf)
    {
        var plannedEnd = start.AddMonths(1); var end = plannedEnd < asOf ? plannedEnd : asOf;
        var previousStart = start.AddMonths(-1); var previousPlannedEnd = previousStart.AddMonths(1);
        var previousEnd = plannedEnd <= asOf ? previousPlannedEnd : previousStart.Add(end - start);
        if (previousEnd > previousPlannedEnd) previousEnd = previousPlannedEnd;
        return new(start, end, previousStart, previousEnd);
    }
}
