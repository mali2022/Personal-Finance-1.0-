namespace PersonalFinance.Api.Contracts;
public sealed record ManagedAssetInput(string Name, string Type, string Currency, string Cost, DateOnly AcquiredDate, string? AccountId = null, string? LiabilityAccountId = null, DateOnly? MaturityDate = null, string AnnualRate = "0", string DayCount = "Actual365", string Institution = "", string MaturityAction = "Manual", string State = "Active", string Note = "", string? FundingTransactionId = null, bool BalanceAlreadyIncludesPrincipal = false);
public sealed record ManagedValuationInput(DateOnly Date, string Amount, string Source);
public sealed record DepositSettlementInput(string TransactionId, string? InterestTransactionId, string ActualInterest, string State, string Reason, string? EarlyAnnualRate = null);
public sealed record FxValuationInput(string BaseCurrency, string TargetCurrency, string Rate, DateOnly Date, string Source);
public sealed record AggregationPolicyInput(string AccountId, string Mode, string Reason);
public sealed record CustomReportInput(string Name, string Start, string End, string Currency, string GroupBy = "category", string? AccountId = null, string? CategoryId = null, string? ProjectId = null, string? Merchant = null, string? TagId = null, string Theme = "Ledger", string[]? Metrics = null, string Sort = "label", string ChartType = "table", string? TransactionType = null);
public sealed record CustomReportExportInput(CustomReportInput Definition, string Format);


