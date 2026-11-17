namespace PersonalFinance.Api.Domain;

public sealed class CurrencyPreference : Owned
{
    public string Currency { get; set; } = "CNY";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PaymentInstrument : Owned
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "FamilyCard";
    public string AccountId { get; set; } = "";
    public string Authorizer { get; set; } = "";
    public string Consumer { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal? MonthlyLimit { get; set; }
    public DateOnly StartsOn { get; set; }
    public DateOnly? EndsOn { get; set; }
    public string State { get; set; } = "Active";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AuthorizedPayment : Owned
{
    public decimal? ChargedAmount { get; set; }
    public string InstrumentId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string Consumer { get; set; } = "";
    public string Authorizer { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AccountFundHold : Owned
{
    public string AccountId { get; set; } = "";
    public string Type { get; set; } = "AuthorizationHold";
    public string Currency { get; set; } = "CNY";
    public decimal Amount { get; set; }
    public decimal ReleasedAmount { get; set; }
    public decimal SettledAmount { get; set; }
    public bool IncludedInBookBalance { get; set; } = true;
    public bool ReducesAvailable { get; set; } = true;
    public string State { get; set; } = "Draft";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class FundHoldEvent : Owned
{
    public string? ReversalOfId { get; set; }
    public string HoldId { get; set; } = "";
    public string Action { get; set; } = "";
    public decimal Amount { get; set; }
    public string? TransactionId { get; set; }
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PayrollStatement : Owned
{
    public string? EmploymentId { get; set; }
    public string? PlanId { get; set; }
    public string? AccountId { get; set; }
    public string? ImportJobId { get; set; }
    public string? ImportRowKey { get; set; }
    public string? CorrectionReason { get; set; }
    public string Month { get; set; } = "";
    public DateOnly PayDate { get; set; }
    public string Employer { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public string State { get; set; } = "Draft";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PayrollComponent : Owned
{
    public string Code { get; set; } = "Legacy";
    public string Category { get; set; } = "Other";
    public string TaxTreatment { get; set; } = "Unspecified";
    public bool InsuranceBasis { get; set; }
    public bool HousingBasis { get; set; }
    public decimal Quantity { get; set; } = 1;
    public decimal UnitRate { get; set; }
    public int SortOrder { get; set; }
    public string Status { get; set; } = "Active";
    public string PayrollId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "Earning";
    public decimal Amount { get; set; }
}
public sealed class PayrollPayment : Owned
{
    public string PayrollId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class SocialContributionRecord : Owned
{
    public string? EmploymentId { get; set; }
    public string? PolicyId { get; set; }
    public string? FundAccountId { get; set; }
    public decimal PersonalRate { get; set; }
    public decimal EmployerRate { get; set; }
    public decimal ExpectedPersonal { get; set; }
    public decimal ExpectedEmployer { get; set; }
    public string PaymentStatus { get; set; } = "Normal";
    public string SourceEvidence { get; set; } = "";
    public string? PayrollComponentId { get; set; }
    public string? LoanBusinessId { get; set; }
    public string Month { get; set; } = "";
    public DateOnly PaidDate { get; set; }
    public string Region { get; set; } = "";
    public string Kind { get; set; } = "Pension";
    public string Currency { get; set; } = "CNY";
    public decimal Basis { get; set; }
    public decimal PersonalAmount { get; set; }
    public decimal EmployerAmount { get; set; }
    public string State { get; set; } = "Confirmed";
    public bool Supplementary { get; set; }
    public string? PayrollId { get; set; }
    public string? AccountId { get; set; }
    public decimal? ReportedBalance { get; set; }
    public string BalanceSource { get; set; } = "NoBalance";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PrepaymentContract : Owned
{
    public string Counterparty { get; set; } = "";
    public string ContractReference { get; set; } = "";
    public string Name { get; set; } = "";
    public string Type { get; set; } = "RefundableDeposit";
    public string Currency { get; set; } = "CNY";
    public string FundingTransactionId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string? AssetAccountId { get; set; }
    public string AccountingMode { get; set; } = "TrackingOnly";
    public decimal Amount { get; set; }
    public decimal ConsumedAmount { get; set; }
    public decimal RefundedAmount { get; set; }
    public decimal WrittenOffAmount { get; set; }
    public DateOnly? ExpiresOn { get; set; }
    public string State { get; set; } = "Active";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PrepaymentSettlement : Owned
{
    public string? ReversalOfId { get; set; }
    public string ContractId { get; set; } = "";
    public string Action { get; set; } = "";
    public decimal Amount { get; set; }
    public string? TransactionId { get; set; }
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ThirdPartyAdvance : Owned
{
    public string Payer { get; set; } = "";
    public string Platform { get; set; } = "";
    public string Merchant { get; set; } = "";
    public string Consumer { get; set; } = "";
    public string Beneficiary { get; set; } = "";
    public string? GroupId { get; set; }
    public string Name { get; set; } = "";
    public string Counterparty { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public string AccountId { get; set; } = "";
    public string? BusinessId { get; set; }
    public string? OwnTransactionId { get; set; }
    public decimal Amount { get; set; }
    public decimal OwnAmount { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public decimal Quantity { get; set; } = 1;
    public string Unit { get; set; } = "件";
    public string DeliveryState { get; set; } = "Purchased";
    public DateOnly? DeliveredOn { get; set; }
    public string Recipient { get; set; } = "";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ProductPriceObservation : Owned
{
    public string Brand { get; set; } = "";
    public string ProductCategory { get; set; } = "";
    public string Merchant { get; set; } = "";
    public decimal? ListedAmount { get; set; }
    public bool Discontinued { get; set; }
    public string? SourceTransactionId { get; set; }
    public string Product { get; set; } = "";
    public string Specification { get; set; } = "";
    public string Unit { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public DateOnly Date { get; set; }
    public decimal Quantity { get; set; }
    public decimal Amount { get; set; }
    public string PriceKind { get; set; } = "Paid";
    public string Source { get; set; } = "";
    public bool Excluded { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class LivingCostBasket : Owned
{
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public DateOnly BaseDate { get; set; }
    public string PriceKind { get; set; } = "Paid";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class LivingCostBasketItem : Owned
{
    public string Brand { get; set; } = "";
    public string BasketId { get; set; } = "";
    public string Product { get; set; } = "";
    public string Specification { get; set; } = "";
    public string Unit { get; set; } = "";
    public decimal Quantity { get; set; }
}
public sealed class ExternalPaymentFact : Owned
{
    public string Name { get; set; } = "";
    public string Payer { get; set; } = "";
    public string Consumer { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Amount { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public string Nature { get; set; } = "ReferenceOnly";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AdvanceAdjustment : Owned
{
    public string AdvanceId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public string Action { get; set; } = "";
    public decimal Amount { get; set; }
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class AdvancePurchasePlan : Owned
{
    public string CancellationReason { get; set; } = "";
    public string Name { get; set; } = "";
    public string Counterparty { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal PlannedAmount { get; set; }
    public decimal PlannedOwnAmount { get; set; }
    public decimal Quantity { get; set; } = 1;
    public string Unit { get; set; } = "件";
    public string State { get; set; } = "Planned";
    public string? AdvanceId { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
