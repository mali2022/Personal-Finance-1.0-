namespace PersonalFinance.Api.Contracts;
public sealed record CurrencyPreferenceInput(string Name, bool Enabled, int SortOrder = 0);
public sealed record PaymentInstrumentInput(string Name, string Type, string AccountId, string Authorizer, string Consumer,
    DateOnly StartsOn, DateOnly? EndsOn = null, string? MonthlyLimit = null, string State = "Active", string Note = "");
public sealed record AuthorizedPaymentInput(string InstrumentId, string InstrumentVersion, SaveTransaction Transaction);
public sealed record FundHoldInput(string AccountId, string Type, string Amount, bool IncludedInBookBalance = true, bool ReducesAvailable = true, string Note = "");
public sealed record FundHoldAction(string Action, string Amount = "0", string Reason = "", SaveTransaction? Transaction = null);
public sealed record StageGCorrectionInput(string EventId, string Reason);
public sealed record PayrollComponentInput(string Name, string Kind, string Amount);
public sealed record PayrollInput(string Month, DateOnly PayDate, string Employer, string Currency, PayrollComponentInput[] Components, string State = "Draft", string Note = "");
public sealed record PayrollReconcileInput(string TransactionId);
public sealed record ContributionInput(string Month, DateOnly PaidDate, string Region, string Kind, string Currency, string Basis,
    string PersonalAmount, string EmployerAmount, string State = "Confirmed", bool Supplementary = false, string? PayrollId = null,
    string? AccountId = null, string? ReportedBalance = null, string BalanceSource = "NoBalance", string Note = "", string? PayrollComponentId = null, string? LoanBusinessId = null);
public sealed record PrepaymentInput(string Name, string Type, string FundingTransactionId, string AccountingMode, DateOnly? ExpiresOn = null, string Note = "", string Counterparty = "", string ContractReference = "");
public sealed record PrepaymentAction(string Action, string Amount, string Reason, SaveTransaction? Transaction = null);
public sealed record AdvanceInput(string Name, string Counterparty, string AccountId, string Amount, string OwnAmount, DateTimeOffset OccurredAt,
    string? CategoryId = null, string Quantity = "1", string Unit = "件", string Recipient = "", string Note = "", string? InstrumentId = null, string? InstrumentVersion = null, string Payer = "", string Platform = "", string Merchant = "", string Consumer = "", string Beneficiary = "");
public sealed record AdvanceDeliveryInput(string State, DateOnly? DeliveredOn = null, string Recipient = "");
public sealed record AdvancePlanInput(string Name, string Counterparty, string AccountId, string PlannedAmount, string PlannedOwnAmount, string Quantity = "1", string Unit = "件", string Note = "");
public sealed record AdvancePlanPurchaseInput(string Amount, string OwnAmount, DateTimeOffset OccurredAt, string? CategoryId = null, string? InstrumentId = null, string? InstrumentVersion = null);
public sealed record StageGReasonInput(string Reason);
public sealed record AdvanceShareInput(string Person, string Value = "1", bool Own = false);
public sealed record AdvanceGroupInput(string Name, string AccountId, string Amount, DateTimeOffset OccurredAt, string Strategy,
    AdvanceShareInput[] Shares, string? CategoryId = null, string Note = "");
public sealed record AdvanceResolutionInput(string Action, string Amount, string Reason, string? CategoryId = null, SettlementInput? Settlement = null);
public sealed record ExternalPaymentFactInput(string Name, string Payer, string Consumer, string Currency, string Amount, DateTimeOffset OccurredAt, string Nature = "ReferenceOnly", string Note = "");
public sealed record PriceObservationInput(string Product, string Specification, string Unit, string Currency, DateOnly Date, string Quantity, string Amount, string PriceKind, string Source, bool Excluded = false, string? SourceTransactionId = null, string Brand = "", string ProductCategory = "", string Merchant = "", string? ListedAmount = null, bool Discontinued = false);
public sealed record BasketItemInput(string Product, string Specification, string Unit, string Quantity, string Brand = "");
public sealed record BasketInput(string Name, string Currency, DateOnly BaseDate, string PriceKind, BasketItemInput[] Items);
