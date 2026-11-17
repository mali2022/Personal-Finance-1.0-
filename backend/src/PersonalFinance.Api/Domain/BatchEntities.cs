namespace PersonalFinance.Api.Domain;
public sealed class TransactionReview : Owned
{
    public string TransactionId { get; set; } = "";
    public string State { get; set; } = "Open";
    public DateTimeOffset? DeferredUntil { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class TransactionBatchRecord : Owned
{
    public string State { get; set; } = "Completed";
    public string ResultJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
