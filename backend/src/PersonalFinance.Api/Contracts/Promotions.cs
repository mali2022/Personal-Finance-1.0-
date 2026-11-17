namespace PersonalFinance.Api.Contracts;
public sealed record SavePromotion(string Name, string Platform, string Merchant, string Type, string Mode, string Currency, string FaceValue, string MinimumAmount, int Quantity, DateTimeOffset StartsAt, DateTimeOffset ExpiresAt, string State = "Active", string? AccountId = null, string Rules = "", string Note = "", string? DiscountRate = null, string? MaximumDiscount = null, DateTimeOffset? ClaimedAt = null, string? PaymentMethod = null);
public sealed record RecoverCashback(string AccountId, string Amount, DateTimeOffset OccurredAt, string Reason);
public sealed record ConfirmSubsidizedTransfer(string CategoryId, string Nature);
public sealed record CreateCashback(string TransactionId, string Amount, string Source, string Treatment, DateTimeOffset? ExpiresAt = null);
public sealed record SettleCashback(string AccountId, DateTimeOffset OccurredAt, string? CategoryId = null);
public sealed record ReturnPromotion(string RefundTransactionId);
public sealed record SubsidizedTransfer(string AccountId, string ToAccountId, string PaidAmount, string ReceivedAmount, string SubsidyAmount, string Source, string Evidence, DateTimeOffset OccurredAt);
