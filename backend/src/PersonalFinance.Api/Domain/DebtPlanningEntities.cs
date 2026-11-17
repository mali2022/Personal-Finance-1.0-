namespace PersonalFinance.Api.Domain;
// Both kinds are future plans. They never create Account/Expense/Income entries.
public sealed class DebtRepaymentPlan : Owned
{
    public string Kind { get; set; } = "CreditInstallment";
    public string AccountId { get; set; } = "";
    public string? BusinessId { get; set; }
    public string? OriginalTransactionId { get; set; }
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Principal { get; set; }
    public DateTimeOffset PrincipalBaselineAt { get; set; } = DateTimeOffset.UtcNow;
    public int Periods { get; set; }
    public DateOnly FirstDate { get; set; }
    public string RepaymentMode { get; set; } = "EqualPrincipal";
    public string FeeMode { get; set; } = "None";
    public decimal PeriodRate { get; set; }
    public decimal FixedFee { get; set; }
    public string State { get; set; } = "Active";
    public string ScheduleJson { get; set; } = "[]";
    public string Note { get; set; } = "";
    public decimal? StatementAmount { get; set; }
    public decimal? MinimumPayment { get; set; }
    public DateOnly? MinimumDueDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class DebtPlanHistory : Owned
{
    public string PlanId { get; set; } = "";
    public string SnapshotJson { get; set; } = "{}";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class DebtPaymentAllocation : Owned
{
    public string PlanId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public int Sequence { get; set; }
    public string Component { get; set; } = "Principal";
    public string FeeNature { get; set; } = "Unclassified";
    public decimal Amount { get; set; }
    public string State { get; set; } = "Active";
    public string Explanation { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
