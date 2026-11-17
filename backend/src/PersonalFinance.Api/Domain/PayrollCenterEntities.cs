namespace PersonalFinance.Api.Domain;
public abstract class PayrollOwned : Owned
{
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PayrollEmployer : PayrollOwned
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Enterprise";
    public string City { get; set; } = "";
    public string Status { get; set; } = "Active";
    public string Note { get; set; } = "";
}
public sealed class PayrollEmployment : PayrollOwned
{
    public string EmployerId { get; set; } = "";
    public string Workplace { get; set; } = "";
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string Position { get; set; } = "";
    public string Department { get; set; } = "";
    public string EmployeeNumber { get; set; } = "";
    public string PayCycle { get; set; } = "Monthly";
    public int PayDay { get; set; } = 15;
    public string? AccountId { get; set; }
    public string InsuranceCity { get; set; } = "";
    public string HousingCity { get; set; } = "";
    public string Status { get; set; } = "Active";
}
public sealed class CompensationPlan : PayrollOwned
{
    public string EmploymentId { get; set; } = "";
    public string Name { get; set; } = "";
    public string SeriesId { get; set; } = Guid.NewGuid().ToString();
    public int Revision { get; set; } = 1;
    public string PayBasis { get; set; } = "Monthly";
    public string Currency { get; set; } = "CNY";
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public string ItemsJson { get; set; } = "[]";
    public string Status { get; set; } = "Active";
}
public sealed class SocialInsurancePolicy : PayrollOwned
{
    public string Name { get; set; } = "";
    public string Region { get; set; } = "";
    public int Year { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly EffectiveTo { get; set; }
    public string PolicyVersion { get; set; } = "";
    public string Source { get; set; } = "";
    public bool Verified { get; set; }
    public string RatesJson { get; set; } = "[]";
}
public sealed class HousingFundAccount : PayrollOwned
{
    public string Name { get; set; } = "";
    public string? EmploymentId { get; set; }
    public string City { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public string? AccountId { get; set; }
    public string? LoanBusinessId { get; set; }
    public decimal ReportedBalance { get; set; }
    public DateOnly BalanceDate { get; set; }
    public string BalanceSource { get; set; } = "ManualStatement";
    public string Evidence { get; set; } = "";
    public string Status { get; set; } = "Active";
}
public sealed class HousingFundEvent : PayrollOwned
{
    public string FundAccountId { get; set; } = "";
    public string Kind { get; set; } = "Deposit";
    public string Month { get; set; } = "";
    public DateOnly BusinessDate { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public string Status { get; set; } = "Expected";
    public string? TransactionId { get; set; }
    public string Evidence { get; set; } = "";
}
public sealed class PayrollTaxRule : PayrollOwned
{
    public string Name { get; set; } = "";
    public string PolicyVersion { get; set; } = "";
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly EffectiveTo { get; set; }
    public string Source { get; set; } = "";
    public bool Verified { get; set; }
    public string RulesJson { get; set; } = "{}";
}
public sealed class PayrollTaxDeclaration : PayrollOwned
{
    public string EmploymentId { get; set; } = "";
    public string RuleId { get; set; } = "";
    public string Kind { get; set; } = "ChildEducation";
    public int Year { get; set; }
    public int StartMonth { get; set; } = 1;
    public int EndMonth { get; set; } = 12;
    public decimal ClaimedAmount { get; set; }
    public decimal ApprovedAmount { get; set; }
    public string EligibilityJson { get; set; } = "{}";
    public string Evidence { get; set; } = "";
    public string Status { get; set; } = "Pending";
}
public sealed class PayrollTaxCalculation : PayrollOwned
{
    public string RuleId { get; set; } = "";
    public string EmploymentId { get; set; } = "";
    public string Month { get; set; } = "";
    public string InputsJson { get; set; } = "{}";
    public string ResultsJson { get; set; } = "{}";
}
public sealed class PayrollImportJob : PayrollOwned
{
    public string FileName { get; set; } = "";
    public string? DocumentId { get; set; }
    public string State { get; set; } = "Uploaded";
    public string HeadersJson { get; set; } = "[]";
    public string RowsJson { get; set; } = "[]";
    public string PreviewJson { get; set; } = "[]";
    public string MappingJson { get; set; } = "{}";
    public string Fingerprint { get; set; } = "";
    public int Imported { get; set; }
}
public sealed class PayrollRevision : PayrollOwned
{
    public string PayrollId { get; set; } = "";
    public long PayrollVersion { get; set; }
    public string Action { get; set; } = "";
    public string Reason { get; set; } = "";
    public string SnapshotJson { get; set; } = "{}";
}
