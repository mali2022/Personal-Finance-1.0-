using System.Text.Json.Serialization;
namespace PersonalFinance.Api.Contracts;
public sealed record PaymentSplit(string AccountId,string Amount);
public sealed record Split(string CategoryId, string Amount);
public sealed record SaveTransaction(string Type, string Amount, string AccountId, DateTimeOffset OccurredAt,
    string Note = "", string? CategoryId = null, string? Merchant = null, string? ToAccountId = null,
    string Fee = "0", string? FeeCategoryId = null, string? ReceivedAmount = null, string? ExchangeRate = null,
    string? OriginalTransactionId = null, string? ProjectId = null, string[]? TagIds = null, Split[]? Splits = null,
    string? Version = null, string? AdjustmentDirection = null, PromotionInput? Promotion = null, string? Origin = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? AiDraftId = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? AiDraftVersion = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] bool AiDuplicateAcknowledged = false,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ProductName = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TransferKind = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Currency = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PaymentSplit[]? Payments = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PersonalFinance.Api.Application.CollaborationInput? Collaboration = null);
public sealed record PromotionLine(string Type, string Amount, int Order, string Source = "", string Activity = "", string Note = "", string? BenefitId = null, string? BenefitVersion = null);
public sealed record PromotionInput(string OriginalAmount, string Currency, PromotionLine[] Lines, string ShippingAmount = "0");
public sealed record SaveAccount(string Name, string Type, string Currency, string Status = "Active", string? Institution = null,
    string? CreditLimit = null, int? StatementDay = null, int? PaymentDay = null, string OpeningBalance = "0",
    string Alias = "", string AccountCode = "", string? GroupId = null, bool IsPinned = false,
    bool IsDefaultIncome = false, bool IsDefaultExpense = false, DateOnly? OpenedAt = null, DateOnly? ClosedAt = null,
    string Description = "", string BillingMode = "Monthly", string ContractNumber = "", string LoanPurpose = "", string? LastFourDigits = null, string? BankBranch = null, string? CardNumber = null);
public sealed record SaveCategory(string Name, string Kind, string? ParentId = null, string Status = "Active", int SortOrder = 0);
public sealed record SaveDirectory(string Name, string Currency = "CNY", string Budget = "0", string? CategoryId = null,
    string? AccountId = null, string? Amount = null, string? StartDate = null, string? EndDate = null, string Status = "Active");
public sealed record BudgetInput(string Total, BudgetLineInput[] Items);
public sealed record BudgetLineInput(string CategoryId, string Limit);
public sealed record BusinessInput(string Kind, string Counterparty, string AccountId, string Amount, DateTimeOffset OccurredAt, string Note = "", string? ContractAccountId = null);
public sealed record SettlementInput(string AccountId, string Amount, DateTimeOffset OccurredAt, string Note = "");
public sealed record LoginInput(string Email, string Password);
public sealed record ReconcileInput(string AccountId, string ActualBalance, string? SystemBalance = null, string? Version = null, string Reason = "");
public sealed record RulesInput(bool IncludeFees, bool IncludeAssetLoss, bool IncludeDecreasingAdjustments);
public sealed class ApiException(int status, string message, string code = "VALIDATION_ERROR") : Exception(message)
{ public int Status { get; } = status; public string Code { get; } = code; }

public sealed record CategoryOrderItem(string Id, string Version);
public sealed record CategoryOrderInput(CategoryOrderItem[] Items);
public sealed record ImportCommitOptions(bool SkipDuplicates = false, bool SkipInvalid = false);
