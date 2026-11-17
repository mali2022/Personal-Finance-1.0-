namespace PersonalFinance.Api.Domain;

// Evidence only: these records never participate in ledger balance calculations.
public sealed class StatementRecord : Owned
{
    public string AccountId { get; set; } = "";
    public string ImportJobId { get; set; } = "";
    public string ImportRowId { get; set; } = "";
    public string IdentityHash { get; set; } = "";
    public string SourceFactsHash { get; set; } = "";
    public string Reference { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Amount { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset? PostedAt { get; set; }
    public string CounterpartyKey { get; set; } = "";
    public string CounterpartyHint { get; set; } = "";
    public string PaymentSource { get; set; } = "";
    public string Merchant { get; set; } = "";
    public string Note { get; set; } = "";
    public string Type { get; set; } = "";
    public string State { get; set; } = "Pending";
    public string Resolution { get; set; } = "";
    public string ResolutionHistoryJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StatementLink : Owned
{
    public string StatementRecordId { get; set; } = "";
    public string TransactionId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public decimal Amount { get; set; }
    public long TransactionVersion { get; set; }
    public string EngineVersion { get; set; } = "rules-2.0.0";
    public string? RuleId { get; set; }
    public long? RuleVersion { get; set; }
    public int EngineScore { get; set; }
    public string ConfirmationMode { get; set; } = "Manual";
    public DateTimeOffset? RevokedAt { get; set; }
    public string EvidenceJson { get; set; } = "{}";
    public string State { get; set; } = "Confirmed";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StatementRule : Owned
{
    public string AccountId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Merchant { get; set; } = "";
    public string Type { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public string Keyword { get; set; } = "";
    public int DateTolerance { get; set; } = 3;
    public int Priority { get; set; }
    public decimal AmountTolerance { get; set; }
    public decimal? ExpectedAmount { get; set; }
    public bool RequireReference { get; set; } = true;
    public bool Enabled { get; set; } = true;
    public bool AutoConfirm { get; set; }
}

public sealed class StatementBalanceSnapshot : Owned
{
    public string AccountId { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public decimal OpeningBalance { get; set; }
    public decimal BankClosingBalance { get; set; }
    public decimal SystemClosingBalance { get; set; }
    public decimal BankOnly { get; set; }
    public decimal LedgerOnly { get; set; }
    public decimal AdjustedDifference { get; set; }
    public string EvidenceJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StatementTask : Owned
{
    public string AccountId { get; set; } = "";
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public string State { get; set; } = "Pending";
    public int Processed { get; set; }
    public int Total { get; set; }
    public int Failed { get; set; }
    public string Cursor { get; set; } = "";
    public DateTimeOffset? CursorDate { get; set; }
    public string ResultsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class StatementTaskStep : Owned
{
    public string StatementTaskId { get; set; } = "";
    public int Sequence { get; set; }
    public int Processed { get; set; }
    public int Failed { get; set; }
    public string EngineVersion { get; set; } = "rules-2.0.0";
    public string ResultsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
