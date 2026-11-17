namespace PersonalFinance.Api.Domain;

public sealed class PhysicalCategory : Owned
{
    public string Name { get; set; } = "";
    public string? ParentId { get; set; }
    public int Sort { get; set; }
    public bool Enabled { get; set; } = true;
    public string Tags { get; set; } = "";
    public string DefaultMethod { get; set; } = "Manual";
    public int DefaultLifeMonths { get; set; } = 60;
}
public sealed class PhysicalProfile : Owned
{
    public string AssetId { get; set; } = "";
    public string? CategoryId { get; set; }
    public string Code { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string Merchant { get; set; } = "";
    public string? PaymentAccountId { get; set; }
    public string PhotoUrl { get; set; } = "";
    public string ReceiptUrl { get; set; } = "";
    public string Location { get; set; } = "";
    public string Holder { get; set; } = "";
    public string Tags { get; set; } = "";
    public DateOnly? InServiceDate { get; set; }
    public DateOnly? WarrantyUntil { get; set; }
    public int MaintenanceDays { get; set; } = 180;
    public int InventoryDays { get; set; } = 365;
    public int StaleDays { get; set; } = 90;
    public int IdleDays { get; set; } = 90;
    public string InitialState { get; set; } = "Active";
    public decimal Quantity { get; set; } = 1;
}
// Rules are append-only: historical calculations always use the rule effective at that date.
public sealed class PhysicalValueRule : Owned
{
    public string AssetId { get; set; } = "";
    public DateOnly Date { get; set; }
    public string Method { get; set; } = "Manual";
    public int LifeMonths { get; set; } = 60;
    public decimal Residual { get; set; }
    public decimal AnnualRate { get; set; } = 20;
    public decimal? Amount { get; set; }
    public decimal? MarketValue { get; set; }
    public decimal? NetRealizableValue { get; set; }
    public decimal? ReplacementCost { get; set; }
    public string Source { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PhysicalEvent : Owned
{
    public string AssetId { get; set; } = "";
    public DateOnly Date { get; set; }
    public string Kind { get; set; } = "Active";
    public decimal Quantity { get; set; }
    public string Reason { get; set; } = "";
    public string? ReversesId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PhysicalCostLink : Owned
{
    public string AssetId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public string Kind { get; set; } = "Maintenance";
    public string Reason { get; set; } = "";
    public bool Reversed { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
