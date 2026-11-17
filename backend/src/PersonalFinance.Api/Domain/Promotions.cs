namespace PersonalFinance.Api.Domain;
public sealed class PromotionTransferDraft : Owned
{
    public string? TransferTransactionId { get; set; }
    public string? SubsidyTransactionId { get; set; }
    public string AccountId { get; set; } = "";
    public string ToAccountId { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal PaidAmount { get; set; }
    public decimal ReceivedAmount { get; set; }
    public decimal SubsidyAmount { get; set; }
    public string Source { get; set; } = "";
    public string Evidence { get; set; } = "";
    public string State { get; set; } = "PendingConfirmation";
    public DateTimeOffset OccurredAt { get; set; }
}
public sealed class PromotionBenefit : Owned
{
    public decimal? DiscountRate { get; set; }
    public decimal? MaximumDiscount { get; set; }
    public DateTimeOffset? ClaimedAt { get; set; }
    public string? PaymentMethod { get; set; }
    public string Name { get; set; } = "";
    public string Platform { get; set; } = "";
    public string Merchant { get; set; } = "";
    public string Type { get; set; } = "MerchantCoupon";
    public string Mode { get; set; } = "Single";
    public string Currency { get; set; } = "CNY";
    public decimal FaceValue { get; set; }
    public decimal MinimumAmount { get; set; }
    public decimal RemainingValue { get; set; }
    public int Quantity { get; set; } = 1;
    public string? AccountId { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public string State { get; set; } = "Active";
    public string Rules { get; set; } = "";
    public string Note { get; set; } = "";
}
public sealed class PromotionUsage : Owned
{
    public string? RefundTransactionId { get; set; }
    public string BenefitId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public decimal Amount { get; set; }
    public string State { get; set; } = "Used";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class CashbackReceivable : Owned
{
    public decimal RecoveredAmount { get; set; }
    public string TransactionId { get; set; } = "";
    public string? SettlementTransactionId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public string Source { get; set; } = "";
    public string Treatment { get; set; } = "PriceAdjustment";
    public string State { get; set; } = "Pending";
    public DateTimeOffset? ExpiresAt { get; set; }
}
public sealed class CashbackRecovery : Owned
{
    public string CashbackId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public decimal Amount { get; set; }
    public string Reason { get; set; } = "";
    public string State { get; set; } = "Active";
}
