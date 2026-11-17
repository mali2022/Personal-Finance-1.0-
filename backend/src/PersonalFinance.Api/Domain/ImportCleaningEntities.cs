namespace PersonalFinance.Api.Domain;

public sealed class MerchantAlias : Owned
{
    public string MerchantId { get; set; } = "";
    public string Name { get; set; } = "";
    public string MatchKey { get; set; } = "";
    public string Source { get; set; } = "User";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ImportCleaningEvent : Owned
{
    public string ImportJobId { get; set; } = "";
    public string? RowId { get; set; }
    public int RowIndex { get; set; }
    public long JobVersion { get; set; }
    public string Action { get; set; } = "Normalize";
    public string RuleVersion { get; set; } = "4.1.2";
    public string Source { get; set; } = "Rule";
    public string Reason { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ImportRecognitionSuggestion : Owned
{
    public string ImportJobId { get; set; } = "";
    public string RowId { get; set; } = "";
    public string RowHash { get; set; } = "";
    public string RequestId { get; set; } = "";
    public string? MerchantId { get; set; }
    public string? CategoryId { get; set; }
    public string Reason { get; set; } = "";
    public decimal Confidence { get; set; }
    public string State { get; set; } = "Pending";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
