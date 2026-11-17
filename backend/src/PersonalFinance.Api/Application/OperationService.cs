using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    // An explicit allowlist keeps credentials, uploaded bytes and raw import payloads out of audit logs.
    private static readonly HashSet<string> AuditFields = new(StringComparer.Ordinal)
    {
        "Sort", "DefaultMethod", "DefaultLifeMonths", "InServiceDate", "WarrantyUntil", "MaintenanceDays", "InventoryDays", "StaleDays", "IdleDays", "InitialState", "LifeMonths", "Residual", "MarketValue", "NetRealizableValue", "ReplacementCost", "ReversesId", "Reversed", "PaymentAccountId",
        "StatementReference", "LedgerAmount",
        "ConfirmationMode", "EngineScore", "RevokedAt",
        "MerchantId", "MatchKey", "JobVersion", "RowIndex", "RequestId", "RuleVersion", "HeaderRow", "SourceHash", "SourceEncoding",
        "FeeNature", "GroupId", "IsPinned", "IsDefaultIncome", "IsDefaultExpense", "OpenedAt", "ClosedAt", "ArchivedAt", "BillingMode",
        "Nature", "Discontinued", "ListedAmount", "Enabled", "InstrumentId", "StartsOn", "EndsOn", "MonthlyLimit",
        "HoldId", "ReleasedAmount", "SettledAmount", "IncludedInBookBalance", "ReducesAvailable",
        "EmploymentId", "EmployerId", "SeriesId", "Revision", "PolicyId", "PolicyVersion", "Verified", "EffectiveFrom", "EffectiveTo", "FundAccountId", "RuleId", "ApprovedAmount", "ClaimedAmount", "ExpectedPersonal", "ExpectedEmployer", "PersonalRate", "EmployerRate", "PaymentStatus", "TaxTreatment", "Category", "InsuranceBasis", "HousingBasis", "UnitRate", "Code", "PayrollVersion", "PayCycle", "PayDay", "PayrollId", "PayDate", "PaidDate", "Basis", "PersonalAmount", "EmployerAmount", "Supplementary", "ReportedBalance", "BalanceSource",
        "ContractId", "AssetAccountId", "AccountingMode", "ConsumedAmount", "RefundedAmount", "WrittenOffAmount", "ExpiresOn",
        "OwnAmount", "OwnTransactionId", "DeliveryState", "DeliveredOn", "BasketId", "BaseDate", "PriceKind", "Unit", "Excluded",
        "SourceTransactionId", "AdvanceId", "GroupId", "ReversalOfId", "ChargedAmount", "PlannedAmount", "PlannedOwnAmount", "PayrollComponentId", "LoanBusinessId",
        "DiscountRate", "MaximumDiscount", "ClaimedAt", "PaymentMethod", "RecoveredAmount", "CashbackId", "TransferTransactionId", "SubsidyTransactionId", "BenefitId", "RefundTransactionId", "SettlementTransactionId", "FaceValue", "MinimumAmount", "RemainingValue", "Mode", "Treatment", "Platform", "StartsAt", "ExpiresAt", "PaidAmount", "SubsidyAmount",
        "AssetId", "Quantity", "Price", "Commission", "Tax", "OtherFee", "SettlementDate", "Date", "OwnsTransaction", "Cost", "AcquiredDate", "MaturityDate", "AnnualRate", "DayCount", "MaturityAction", "FundingTransactionId", "SettlementTransactionId", "InterestTransactionId", "BaseCurrency", "TargetCurrency", "Rate", "Mode", "LiabilityAccountId", "ResourceId", "Method", "Behavior",
        "Periods", "FirstDate", "RepaymentMode", "FeeMode", "PeriodRate", "FixedFee", "Principal", "PlanId", "StatementAmount", "MinimumPayment", "MinimumDueDate",
        "Id", "Version", "Type", "Kind", "Status", "State", "Amount", "Currency", "AccountId", "ToAccountId",
        "Year", "AnnualBudgetId", "BeforeVersion", "AfterVersion", "SourceMonth", "TargetMonth", "Parameter", "Cap", "CarryOverspend", "Threshold", "Used", "EffectiveBudget", "Silent", "Enabled", "Dismissed", "ThresholdsJson",
        "GoalId", "ToGoalId", "Target", "TargetDate", "MonthlySaving", "Before", "After", "Necessity", "EssentialRate", "Excluded", "ExpectedDate", "Certainty", "ScenarioId",
        "Rule", "BookId", "FamilyId", "SpaceId", "ConsumerId", "PayerId", "LinkedUserId", "Role", "Active", "Archived", "Revoked", "FromMemberId", "ToMemberId", "SharesJson", "ExpiresAt",
        "CategoryId", "OccurredAt", "ProjectId", "OriginalTransactionId", "BusinessId", "ImportJobId", "Fee", "FeeCategoryId",
        "ReceivedAmount", "ExchangeRate", "AdjustmentDirection", "OpeningBalance", "CreditLimit", "StatementDay", "PaymentDay",
        "ParentId", "SortOrder", "Budget", "StartDate", "EndDate", "Month", "Total", "Limit", "BudgetId", "Principal",
        "ContractAccountId", "TransactionId", "DirectoryId", "SystemBalance", "ActualBalance", "Difference", "Imported",
        "IncludeFees", "IncludeAssetLoss", "IncludeDecreasingAdjustments", "ContentType", "Index", "OriginalEntryId", "BaseAmount",
        "DeferredUntil", "UpdatedAt", "DirectoryId", "ReviewDecision", "ReviewedAt", "IdentityVersion", "RuleId", "Sequence", "ScheduledAt", "NextAt", "NextSequence", "Frequency", "Interval", "TimeZone", "MonthEndPolicy", "StartLocal", "EndLocal", "ReminderDays", "RuleVersion", "Action", "Source", "SubscriptionId", "EffectiveAt", "AutoRenew", "ServiceEndsAt", "CancelledAt", "Priority", "PreviewOnly", "HitCount", "OccurrenceId", "ChangedFieldsJson"
    };
    private static readonly HashSet<string> RedactedFields = new(StringComparer.Ordinal)
    { "Profile", "Email", "Alias", "AccountCode", "Description", "ContractNumber", "LoanPurpose", "CardLastFour", "CardNumber", "CardHolderName", "CardBrand", "CardAlias", "BankBranch", "Brand", "ProductCategory", "ContractReference", "Payer", "Beneficiary", "Recipient", "CancellationReason", "Employer", "Region", "Authorizer", "Consumer", "Name", "Note", "Merchant", "Counterparty", "Reason", "Institution", "ExternalId", "FileName", "Provider", "DetailedNote", "PayloadJson", "PreparedPayloadJson", "ConditionsJson", "ActionsJson", "PromotionJson", "Rules" };

    public static string? AuditValue(string field, object? value)
    {
        if (value is null) return null;
        if (RedactedFields.Contains(field)) return "[内容已脱敏]";
        return value switch
        {
            DateTimeOffset time => time.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture),
            decimal money => money.ToString("0.############################", CultureInfo.InvariantCulture),
            IFormattable formatted => formatted.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString()
        };
    }
    private void CaptureAudit(string user, HttpContext ctx, string? key)
    {
        db.ChangeTracker.DetectChanges();
        var changed = db.ChangeTracker.Entries().Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .Where(e => e.Entity is not (AuditRecord or Idempotency or AppUser or Session)).ToArray();
        foreach (var entry in changed)
        {
            var fields = new List<object>();
            foreach (var property in entry.Properties)
            {
                var name = property.Metadata.Name;
                if (!AuditFields.Contains(name) && !RedactedFields.Contains(name)) continue;
                if (entry.State == EntityState.Modified && !property.IsModified) continue;
                var before = entry.State == EntityState.Added ? null : property.OriginalValue;
                var after = entry.State == EntityState.Deleted ? null : property.CurrentValue;
                if (Equals(before, after)) continue;
                fields.Add(new { field = name, before = AuditValue(name, before), after = AuditValue(name, after) });
            }
            if (fields.Count == 0) continue;
            if (entry.Metadata.FindProperty("Currency") is not null)
                fields.Add(new { field = "CurrencyContext", before = entry.State == EntityState.Added ? null : AuditValue("Currency", entry.Property("Currency").OriginalValue),
                    after = entry.State == EntityState.Deleted ? null : AuditValue("Currency", entry.Property("Currency").CurrentValue) });
            string? Value(string name) => entry.Metadata.FindProperty(name) is null ? null : entry.Property(name).CurrentValue?.ToString();
            var transactionId = entry.Entity is FinanceTransaction ? Value("Id") : Value("TransactionId");
            var resourceId = Value("Id") ?? transactionId ?? Value("BudgetId") ?? "";
            db.AuditRecords.Add(new AuditRecord
            {
                UserId = user, ResourceType = entry.Metadata.ClrType.Name, ResourceId = resourceId, TransactionId = transactionId,
                Action = entry.State switch { EntityState.Added => "Create", EntityState.Deleted => "Remove",
                    _ when entry.Entity is FinanceTransaction && Value("Status") == "Deleted" => "Revoke",
                    _ when entry.Entity is FinanceTransaction && entry.Property("Status").OriginalValue?.ToString() == "Deleted" => "Restore",
                    _ => "Update" },
                ChangesJson = JsonSerializer.Serialize(fields, Json), OperationKey = key, TraceId = ctx.TraceIdentifier,
                Source = ctx.Items["FinanceSource"] as string ?? "User"
            });
        }
    }
    public async Task<object> OperationResult(string user, string key, string? fingerprint)
    {
        Require(key.Length is > 0 and <= 150, "请求编号无效");
        var saved = await db.Idempotencies.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Key == key);
        // Unknown is not a guarantee of failure: a concurrent transaction may still be committing.
        if (saved is null) return new { state = "Unknown", key };
        if (!string.IsNullOrEmpty(fingerprint) && saved.ClientFingerprint is not null && fingerprint != saved.ClientFingerprint)
            throw new PersonalFinance.Api.Contracts.ApiException(409, "请求内容与已保存结果不一致", "IDEMPOTENCY_CONFLICT");
        return new { state = "Completed", key, saved.Method, saved.Path, saved.CompletedAt,
            result = JsonSerializer.Deserialize<JsonElement>(saved.Response, Json), legacy = saved.CompletedAt is null };
    }
    public async Task<object> AuditHistory(string user, string? transactionId, IQueryCollection query)
    {
        if (transactionId is not null) await Transaction(user, transactionId);
        var (page, size) = Paging(query);
        var q = db.AuditRecords.AsNoTracking().Where(x => x.UserId == user);
        if (transactionId is not null) q = q.Where(x => x.TransactionId == transactionId);
        var total = await q.CountAsync();
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.ResourceType, x.ResourceId, x.TransactionId, x.Action, x.Source,
            x.CreatedAt, x.TraceId, x.OperationKey, changes = JsonSerializer.Deserialize<JsonElement>(x.ChangesJson, Json) }), total, page, pageSize = size };
    }
}



