namespace PersonalFinance.Api.Domain;
public sealed class TransactionAnalysisAttribute : Owned
{
    public string? CategoryId { get; set; }
    public string? TransactionId { get; set; }
    public string Behavior { get; set; } = "Unknown";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
