namespace PersonalFinance.Api.Domain;

public sealed class InvestmentAsset : Owned
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Stock";
    public string Code { get; set; } = "";
    public string Market { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public string AccountId { get; set; } = "";
    public string Unit { get; set; } = "份";
    public string State { get; set; } = "Active";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class InvestmentTrade : Owned
{
    public string AssetId { get; set; } = "";
    public string Type { get; set; } = "Buy";
    public DateOnly Date { get; set; }
    public DateOnly SettlementDate { get; set; }
    public decimal Quantity { get; set; }
    public decimal Price { get; set; }
    public decimal Amount { get; set; }
    public decimal Commission { get; set; }
    public decimal Tax { get; set; }
    public decimal OtherFee { get; set; }
    public string? TransactionId { get; set; }
    public bool OwnsTransaction { get; set; }
    public string State { get; set; } = "Active";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class InvestmentValuation : Owned
{
    public string AssetId { get; set; } = "";
    public DateOnly Date { get; set; }
    public decimal Price { get; set; }
    public string Source { get; set; } = "";
    public string Method { get; set; } = "Manual";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class InvestmentHistory : Owned
{
    public string AssetId { get; set; } = "";
    public string ResourceId { get; set; } = "";
    public string Kind { get; set; } = "";
    public string SnapshotJson { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
