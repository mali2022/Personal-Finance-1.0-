namespace PersonalFinance.Api.Domain;

public abstract class Owned
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = "";
    public long Version { get; set; } = 1;
}
public sealed class AppUser
{
    public bool IsAdmin { get; set; }
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public long ProfileVersion { get; set; } = 1;
    public string RealName { get; set; } = "";
    public string Phone { get; set; } = "";
    public DateOnly? Birthday { get; set; }
    public string Gender { get; set; } = "Unspecified";
    public string Country { get; set; } = "";
    public string Region { get; set; } = "";
    public string City { get; set; } = "";
    public string Occupation { get; set; } = "";
    public string Bio { get; set; } = "";
    public string Language { get; set; } = "zh-CN";
    public string TimeZone { get; set; } = "Asia/Shanghai";
    public string PreferredCurrency { get; set; } = "CNY";
    public byte[]? AvatarPng { get; set; }
    public DateTimeOffset? AvatarUpdatedAt { get; set; }
}
public sealed class Session : Owned
{
    public string RefreshHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public bool Revoked { get; set; }
}
public sealed class Account : Owned
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Cash";
    public string Currency { get; set; } = "CNY";
    public decimal OpeningBalance { get; set; }
    public string? Institution { get; set; }
    public string Status { get; set; } = "Active";
    public decimal? CreditLimit { get; set; }
    public int? StatementDay { get; set; }
    public int? PaymentDay { get; set; }
    public string Alias { get; set; } = "";
    public string AccountCode { get; set; } = "";
    public string? GroupId { get; set; }
    public int SortOrder { get; set; }
    public bool IsPinned { get; set; }
    public bool IsDefaultIncome { get; set; }
    public bool IsDefaultExpense { get; set; }
    public DateOnly? OpenedAt { get; set; }
    public DateOnly? ClosedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset? CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string Description { get; set; } = "";
    public string BillingMode { get; set; } = "Monthly";
    public string ContractNumber { get; set; } = "";
    public string LoanPurpose { get; set; } = "";
    public string BankBranch { get; set; } = "";
    public string? CardLastFour { get; set; }
    public string? CardNumber { get; set; }
    public string CardHolderName { get; set; } = "";
    public string CardBrand { get; set; } = "";
    public string CardAlias { get; set; } = "";
}
public sealed class AccountGroup : Owned
{
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}
public sealed class Category : Owned
{
    public string Name { get; set; } = "";
    public string? ParentId { get; set; }
    public string Kind { get; set; } = "Expense";
    public string Status { get; set; } = "Active";
    public int SortOrder { get; set; }
}
public sealed class FinanceTransaction : Owned
{
    public string? PromotionJson { get; set; }
    public string Type { get; set; } = "Expense";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public string AccountId { get; set; } = "";
    public string? ToAccountId { get; set; }
    public string? CategoryId { get; set; }
    public string? Merchant { get; set; }
    public string? ProductName { get; set; }
    public string? TransferKind { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public string Note { get; set; } = "";
    public string? ProjectId { get; set; }
    public string Status { get; set; } = "Confirmed";
    public string? OriginalTransactionId { get; set; }
    public string? BusinessId { get; set; }
    public string? ImportJobId { get; set; }
    public string? ExternalId { get; set; }
    public decimal Fee { get; set; }
    public string? FeeCategoryId { get; set; }
    public decimal? ReceivedAmount { get; set; }
    public decimal? ExchangeRate { get; set; }
    public string? AdjustmentDirection { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Entry> Entries { get; set; } = [];
    public List<TransactionTag> Tags { get; set; } = [];
}
public sealed class Entry : Owned
{
    public string TransactionId { get; set; } = "";
    public string Kind { get; set; } = "Account";
    public string? AccountId { get; set; }
    public string? CategoryId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public decimal ExchangeRate { get; set; } = 1;
    public decimal BaseAmount { get; set; }
    public string? OriginalEntryId { get; set; }
}
public sealed class TransactionTag
{
    public string TransactionId { get; set; } = "";
    public string DirectoryId { get; set; } = "";
}
public sealed class DirectoryItem : Owned
{
    public string Kind { get; set; } = "tags";
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Budget { get; set; }
    public string? CategoryId { get; set; }
    public string? AccountId { get; set; }
    public decimal? Amount { get; set; }
    public string? StartDate { get; set; }
    public string? EndDate { get; set; }
    public string Status { get; set; } = "Active";
}
public sealed class Budget : Owned
{
    public string Month { get; set; } = "";
    public decimal Total { get; set; }
    public List<BudgetLine> Items { get; set; } = [];
}
public sealed class BudgetLine
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string BudgetId { get; set; } = "";
    public string CategoryId { get; set; } = "";
    public decimal Limit { get; set; }
}
public sealed class Business : Owned
{
    public string Kind { get; set; } = "Lent";
    public string Counterparty { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Principal { get; set; }
    public string AccountId { get; set; } = "";
    public string ContractAccountId { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; }
    public string Note { get; set; } = "";
    public string Status { get; set; } = "Draft";
}
public sealed class StatisticsRules : Owned
{
    public bool IncludeFees { get; set; } = true;
    public bool IncludeAssetLoss { get; set; }
    public bool IncludeDecreasingAdjustments { get; set; }
}
public sealed class Idempotency : Owned
{
    public string Key { get; set; } = "";
    public string Hash { get; set; } = "";
    public string Response { get; set; } = "";
    public string? Method { get; set; }
    public string? Path { get; set; }
    public string? ClientFingerprint { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
public sealed class AuditRecord : Owned
{
    public string ResourceType { get; set; } = "";
    public string ResourceId { get; set; } = "";
    public string? TransactionId { get; set; }
    public string Action { get; set; } = "";
    public string ChangesJson { get; set; } = "[]";
    public string Source { get; set; } = "User";
    public string TraceId { get; set; } = "";
    public string? OperationKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class StoredDocument : Owned
{
    public string? PayrollId { get; set; }
    public string Kind { get; set; } = "Attachment";
    public string? TransactionId { get; set; }
    public string Name { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ImportJob : Owned
{
    public string SourceHash { get; set; } = "";
    public string SourceEncoding { get; set; } = "";
    public int HeaderRow { get; set; } = 1;
    public string FileName { get; set; } = "";
    public string Source { get; set; } = "CSV";
    public string HeadersJson { get; set; } = "[]";
    public string RawRowsJson { get; set; } = "[]";
    public string MappingJson { get; set; } = "{}";
    public string? AccountId { get; set; }
    public string State { get; set; } = "Uploaded";
    public int Imported { get; set; }
    public List<ImportRow> Rows { get; set; } = [];
}
public sealed class ImportRow : Owned
{
    public string ImportJobId { get; set; } = "";
    public int Index { get; set; }
    public string DataJson { get; set; } = "{}";
    public string Fingerprint { get; set; } = "";
    public string Status { get; set; } = "Invalid";
    public int IdentityVersion { get; set; }
    public string? IdentityKey { get; set; }
    public string? ReviewDecision { get; set; }
    public string? ReviewSignature { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
}
public sealed class ImportAttempt : Owned
{
    public string ImportJobId { get; set; } = "";
    public string OperationKey { get; set; } = "";
    public string State { get; set; } = "Failed";
    public string Code { get; set; } = "";
    public string Message { get; set; } = "";
    public string TraceId { get; set; } = "";
    public int Total { get; set; }
    public int Imported { get; set; }
    public int Skipped { get; set; }
    public string OutcomesJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class Reconciliation : Owned
{
    public string AccountId { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal SystemBalance { get; set; }
    public decimal ActualBalance { get; set; }
    public decimal Difference { get; set; }
    public string? TransactionId { get; set; }
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
