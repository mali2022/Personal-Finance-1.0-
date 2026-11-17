namespace PersonalFinance.Api.Domain;
public sealed class ManagedAsset : Owned
{
 public string Name { get; set; } = "";
 public string Type { get; set; } = "TermDeposit";
 public string Currency { get; set; } = "CNY";
 public string? AccountId { get; set; }
 public string? LiabilityAccountId { get; set; }
 public string? FundingTransactionId { get; set; }
 public string? SettlementTransactionId { get; set; }
 public string? InterestTransactionId { get; set; }
 public decimal Cost { get; set; }
 public DateOnly AcquiredDate { get; set; }
 public DateOnly? MaturityDate { get; set; }
 public decimal AnnualRate { get; set; }
 public string DayCount { get; set; } = "Actual365";
 public string Institution { get; set; } = "";
 public string MaturityAction { get; set; } = "Manual";
 public string State { get; set; } = "Active";
 public string Note { get; set; } = "";
 public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ManagedAssetValuation : Owned
{
 public string AssetId { get; set; } = "";
 public DateOnly Date { get; set; }
 public decimal Amount { get; set; }
 public string Source { get; set; } = "";
 public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class FxValuationRate : Owned
{
 public string BaseCurrency { get; set; } = "CNY";
 public string TargetCurrency { get; set; } = "USD";
 public decimal Rate { get; set; }
 public DateOnly Date { get; set; }
 public string Source { get; set; } = "";
 public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AssetAggregationPolicy : Owned
{
 public string AccountId { get; set; } = "";
 public string Mode { get; set; } = "Unknown";
 public string Reason { get; set; } = "";
}
public sealed class CustomReportDefinition : Owned
{
 public string Name { get; set; } = "";
 public string DefinitionJson { get; set; } = "";
 public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
