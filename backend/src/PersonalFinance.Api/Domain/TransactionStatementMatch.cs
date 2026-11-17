namespace PersonalFinance.Api.Domain;

public sealed class TransactionStatementMatch : Owned
{
    public string TransactionId { get; set; } = "";
    public string StatementReference { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal StatementAmount { get; set; }
    public decimal LedgerAmount { get; set; }
    public string State { get; set; } = "Matched";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
