namespace PersonalFinance.Api.Domain;
public sealed class FinancialMemory : Owned
{
    public string Key { get; set; } = "";
    public string? TransactionId { get; set; }
    public bool Favorite { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
