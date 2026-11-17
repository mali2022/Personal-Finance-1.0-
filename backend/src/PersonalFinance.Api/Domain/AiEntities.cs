namespace PersonalFinance.Api.Domain;

// No key, prompt, model output, tool arguments or financial detail is stored here.
public sealed class AiPrivacySetting
{
    public string UserId { get; set; } = "";
    public bool Enabled { get; set; }
    public bool FullFinancialAccess { get; set; }
    public bool PersonalReadAccess { get; set; } = true;
    public bool AllowSummary { get; set; }
    public bool AllowDetails { get; set; }
    public bool AllowPayroll { get; set; }
    public bool AllowFamily { get; set; }
    public bool AllowRecognitionText { get; set; }
    public bool SaveHistory { get; set; }
    public long ConsentVersion { get; set; } = 1;
    public DateTimeOffset UpdatedAt { get; set; }
}
public sealed class AiUsageRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = "";
    public string Model { get; set; } = "";
    public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.UtcNow;
    public int? InputTokens { get; set; }
    public int? CachedInputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public decimal? EstimatedCost { get; set; }
    public string PriceCurrency { get; set; } = "USD";
    public string? PriceEffectiveDate { get; set; }
    public string? ErrorCode { get; set; }
    public int Attempt { get; set; }
    public string Feature { get; set; } = "chat";
    public string? RequestId { get; set; }
    public string? ConfigurationVersion { get; set; }
    public decimal? ReservedCost { get; set; }
    public string State { get; set; } = "Recorded";
}
public sealed class AiToolAudit
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = "";
    public string Tool { get; set; } = "";
    public string Start { get; set; } = "";
    public string End { get; set; } = "";
    public string Currency { get; set; } = "";
    public bool Succeeded { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? RequestId { get; set; }
    public string? AccountScopeJson { get; set; }
    public string? ErrorCode { get; set; }
    public long? DurationMs { get; set; }
}

public sealed class AiConfigurationSnapshot
{
    public string Id { get; set; } = "";
    public string ConfigurationJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiRequestAudit
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string LedgerId { get; set; } = "";
    public string AccountScopeJson { get; set; } = "[]";
    public string ConfigurationVersion { get; set; } = "";
    public long? ConsentVersion { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
    public string State { get; set; } = "Running";
    public string? ErrorCode { get; set; }
}
public sealed class AiConversation : Owned
{
    public string Kind { get; set; } = "Chat";
    public string Title { get; set; } = "";
    public string? AccountScopeJson { get; set; }
    public bool Archived { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
}
public sealed class AiMessage : Owned
{
    public string? AnalysisJson { get; set; }
    public string ConversationId { get; set; } = "";
    public string RequestId { get; set; } = "";
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public string SourcesJson { get; set; } = "[]";
    public string Model { get; set; } = "";
    public bool FinancialDataVerified { get; set; }
    public int Feedback { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AiTransactionDraft : Owned
{
    public string RequestId { get; set; } = "";
    public string ResultJson { get; set; } = "{}";
    public string SourceHash { get; set; } = "";
    public string Source { get; set; } = "typed";
    public string State { get; set; } = "Draft";
    public string? TransactionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
