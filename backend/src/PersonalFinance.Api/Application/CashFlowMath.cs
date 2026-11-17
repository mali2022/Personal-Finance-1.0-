namespace PersonalFinance.Api.Application;
public sealed record ForecastDelta(DateOnly Date, decimal Amount, string SourceId);
public sealed record ForecastDay(DateOnly Date, decimal Inflow, decimal Outflow, decimal Balance);
public sealed record ForecastResult(decimal Opening, decimal Inflow, decimal Outflow, decimal Closing, decimal Minimum, DateOnly MinimumDate, ForecastDay[] Days, bool Sampled = false);
public static class CashFlowMath
{
    public static decimal Commitment(string type, decimal amount, decimal fee, bool sourceIsLiquid, bool destinationIsLiquid)
        => !sourceIsLiquid || type == "Income" ? 0 : type == "Transfer" && destinationIsLiquid ? fee : amount + fee;

    // The opening balance is the live ledger balance at evaluation time, never another ledger.
    public static ForecastResult Calculate(decimal opening, DateOnly start, DateOnly end, IEnumerable<ForecastDelta> events, CancellationToken ct = default, int plotPoints = 1000)
    {
        FinanceService.Require(end > start && plotPoints >= 2, "预测日期或图表资源预算无效，结束日期不包含");
        var byDay = events.Where(x => x.Date >= start && x.Date < end && x.Amount != 0).GroupBy(x => x.Date).ToDictionary(g => g.Key, g => g.ToArray());
        var step = Math.Max(1, (int)Math.Ceiling((end.DayNumber - start.DayNumber) / (decimal)plotPoints));
        var dates = new SortedSet<DateOnly>(byDay.Keys) { start, end.AddDays(-1) };
        for (var day = start; day < end;) { ct.ThrowIfCancellationRequested(); dates.Add(day); var remaining = end.DayNumber - day.DayNumber; day = day.AddDays(Math.Min(step, remaining)); }
        var balance = opening; var minimum = opening; var minimumDate = start; decimal totalIn = 0, totalOut = 0; var days = new List<ForecastDay>();
        foreach (var day in dates)
        {
            ct.ThrowIfCancellationRequested();
            var rows = byDay.GetValueOrDefault(day) ?? []; var incoming = rows.Where(x => x.Amount > 0).Sum(x => x.Amount); var outgoing = -rows.Where(x => x.Amount < 0).Sum(x => x.Amount);
            balance += incoming - outgoing; totalIn += incoming; totalOut += outgoing; if (balance < minimum) { minimum = balance; minimumDate = day; }
            days.Add(new(day, incoming, outgoing, balance));
        }
        return new(opening, totalIn, totalOut, balance, minimum, minimumDate, days.ToArray(), step > 1);
    }
}
