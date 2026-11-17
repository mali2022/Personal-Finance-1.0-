namespace PersonalFinance.Api.Application;

/// <summary>Calendar boundaries in the existing business timezone and next-month due-date convention.</summary>
public sealed record CreditStatementWindow(DateTimeOffset CycleStart, DateTimeOffset StatementEndExclusive, DateTimeOffset DueEndExclusive)
{
    public DateTimeOffset StatementEnd => StatementEndExclusive.AddTicks(-1);
    public DateTimeOffset DueDate => DueEndExclusive.AddDays(-1);

    public static CreditStatementWindow Create(int year, int month, int statementDay, int paymentDay)
    {
        if (statementDay is < 1 or > 31 || paymentDay is < 1 or > 31)
            throw new ArgumentOutOfRangeException(nameof(statementDay), "账单日及还款日必须在 1 至 31 之间");
        var first = new DateTimeOffset(year, month, 1, 0, 0, 0, TimeSpan.FromHours(8));
        static DateTimeOffset Day(DateTimeOffset first, int day) => first.AddDays(Math.Min(day, DateTime.DaysInMonth(first.Year, first.Month)) - 1);
        return new(Day(first.AddMonths(-1), statementDay).AddDays(1), Day(first, statementDay).AddDays(1), Day(first.AddMonths(1), paymentDay).AddDays(1));
    }
}
