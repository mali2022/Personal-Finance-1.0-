namespace PersonalFinance.Api.Domain;

public sealed class RecurringRule : Owned
{
    public string Name { get; set; } = "";
    public string State { get; set; } = "Draft";
    public string Currency { get; set; } = "CNY";
    public string Amount { get; set; } = "0";
    public string AccountId { get; set; } = "";
    public string? ToAccountId { get; set; }
    public string? CategoryId { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public string DetailedNote { get; set; } = "";
    public DateTime StartLocal { get; set; }
    public DateTime? EndLocal { get; set; }
    public string TimeZone { get; set; } = "Asia/Shanghai";
    public string Frequency { get; set; } = "Month";
    public int Interval { get; set; } = 1;
    public string MonthEndPolicy { get; set; } = "Clamp";
    public long NextSequence { get; set; }
    public DateTimeOffset? NextAt { get; set; }
    public int ReminderDays { get; set; } = 3;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class RecurringOccurrence : Owned
{
    public string RuleId { get; set; } = "";
    public long Sequence { get; set; }
    public DateTimeOffset ScheduledAt { get; set; }
    public string State { get; set; } = "Pending";
    public string PayloadJson { get; set; } = "{}";
    public string Currency { get; set; } = "CNY";
    public string? PreparedPayloadJson { get; set; }
    public string Amount { get; set; } = "0";
    public long RuleVersion { get; set; }
    public string? TransactionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class RecurringExecution : Owned
{
    public string RuleId { get; set; } = "";
    public string? OccurrenceId { get; set; }
    public string Action { get; set; } = "";
    public string Source { get; set; } = "User";
    public string? TransactionId { get; set; }
    public string? OperationKey { get; set; }
    public string Message { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
