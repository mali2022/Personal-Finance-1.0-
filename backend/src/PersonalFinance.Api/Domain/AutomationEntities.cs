namespace PersonalFinance.Api.Domain;
public sealed class Subscription : Owned
{
    public string Name { get; set; } = "";
    public string Provider { get; set; } = "";
    public string RuleId { get; set; } = "";
    public string State { get; set; } = "Active";
    public bool AutoRenew { get; set; } = true;
    public DateTimeOffset? CancelledAt { get; set; }
    public DateTimeOffset? ServiceEndsAt { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class SubscriptionPrice : Owned
{
    public string SubscriptionId { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTimeOffset EffectiveAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AutomationRule : Owned
{
    public string Name { get; set; } = "";
    public string State { get; set; } = "Active";
    public int Priority { get; set; }
    public string ConditionsJson { get; set; } = "{}";
    public string ActionsJson { get; set; } = "{}";
    public bool PreviewOnly { get; set; } = true;
    public long HitCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AutomationExecution : Owned
{
    public string RuleId { get; set; } = "";
    public string? OccurrenceId { get; set; }
    public string State { get; set; } = "";
    public string ChangedFieldsJson { get; set; } = "[]";
    public string? OperationKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
