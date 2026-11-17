namespace PersonalFinance.Api.Domain;

public sealed class AiAgentSetting : Owned
{
    public string ConfigurationJson { get; set; } = "{}";
    public bool EmergencyStopped { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiAgentGrant : Owned
{
    public string Tool { get; set; } = "";
    public string AccountIdsJson { get; set; } = "[]";
    public int MaxAffectedRecords { get; set; } = 100;
    public bool HighRisk { get; set; }
    public string? TaskId { get; set; }
    public string? PlanHash { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiAgentTask : Owned
{
    public string Prompt { get; set; } = "";
    public string State { get; set; } = "Queued";
    public string Mode { get; set; } = "Suggest";
    public string ConfigurationJson { get; set; } = "{}";
    public string AccountIdsJson { get; set; } = "[]";
    public string MessagesJson { get; set; } = "[]";
    public string SourcesJson { get; set; } = "[]";
    public string? ConversationId { get; set; }
    public string? WorkflowId { get; set; }
    public string? Answer { get; set; }
    public string? ErrorCode { get; set; }
    public int ToolCalls { get; set; }
    public int ModelCalls { get; set; }
    public long TokensUsed { get; set; }
    public int RecoveryAttempts { get; set; }
    public long ActiveMilliseconds { get; set; }
    public string? LeaseOwner { get; set; }
    public DateTimeOffset? LeaseUntil { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
    public bool CancelRequested { get; set; }
}
public sealed class AiAgentStep : Owned
{
    public string TaskId { get; set; } = "";
    public int Sequence { get; set; }
    public string CallId { get; set; } = "";
    public string Tool { get; set; } = "";
    public string ArgumentsJson { get; set; } = "{}";
    public string PreviewJson { get; set; } = "{}";
    public string PlanHash { get; set; } = "";
    public string State { get; set; } = "Planned";
    public bool HighRisk { get; set; }
    public string? ApprovedHash { get; set; }
    public string? ResultJson { get; set; }
    public string? ErrorCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
public sealed class AiAgentMemory : Owned
{
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    public string AccountIdsJson { get; set; } = "[]";
    public bool Enabled { get; set; } = true;
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiAgentWorkflow : Owned
{
    public string Name { get; set; } = "";
    public string Prompt { get; set; } = "";
    public string AccountIdsJson { get; set; } = "[]";
    public int? IntervalMinutes { get; set; }
    public DateTimeOffset? NextRunAt { get; set; }
    public bool Enabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiAgentReport : Owned
{
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    public string SourcesJson { get; set; } = "[]";
    public string? TaskId { get; set; }
    public string Assumptions { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiAgentEvent : Owned
{
    public string? TaskId { get; set; }
    public string? StepId { get; set; }
    public string Kind { get; set; } = "";
    public string Detail { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
