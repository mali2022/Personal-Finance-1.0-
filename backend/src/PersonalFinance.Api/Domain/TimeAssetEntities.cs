namespace PersonalFinance.Api.Domain;

public sealed class TimeActivity : Owned
{
    public string Title { get; set; } = "";
    public string Category { get; set; } = "Other";
    public string Note { get; set; } = "";
    public string? ProjectId { get; set; }
    public string State { get; set; } = "Completed";
    public string SegmentsJson { get; set; } = "[]";
    public DateTimeOffset? ActiveSince { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class TimeValuation : Owned
{
    public string Method { get; set; } = "Custom";
    public string Source { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public DateOnly EffectiveFrom { get; set; }
    public decimal Income { get; set; }
    public decimal Hours { get; set; }
    public decimal HourlyRate { get; set; }
    public int Revision { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class TimeBudget : Owned
{
    public string Period { get; set; } = "Week";
    public DateOnly StartDate { get; set; }
    public string? Category { get; set; }
    public int Minutes { get; set; }
}
public sealed class TimeTemplate : Owned
{
    public string Name { get; set; } = "";
    public string Category { get; set; } = "Other";
    public int Minutes { get; set; } = 30;
    public string? ProjectId { get; set; }
    public string Repeat { get; set; } = "Daily";
}
public sealed class TimeProject : Owned
{
    public string Name { get; set; } = "";
    public string Goal { get; set; } = "";
    public int BudgetMinutes { get; set; }
    public string ReturnUnit { get; set; } = "";
    public decimal TargetReturn { get; set; }
    public decimal ActualReturn { get; set; }
    public string State { get; set; } = "Active";
}
public sealed class TimeFinanceLink : Owned
{
    public string TransactionId { get; set; } = "";
    public string? ActivityId { get; set; }
    public string? ProjectId { get; set; }
}
