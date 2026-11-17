namespace PersonalFinance.Api.Domain;

public sealed class AnnualBudget : Owned
{
    public int Year { get; set; }
    public string Currency { get; set; } = "CNY";
    public decimal Total { get; set; }
    public string State { get; set; } = "Active";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<AnnualBudgetAllocation> Allocations { get; set; } = [];
}
public sealed class AnnualBudgetAllocation
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string AnnualBudgetId { get; set; } = "";
    // Month 0 is an annual category envelope; months 1..12 are monthly envelopes.
    public int Month { get; set; }
    public string? CategoryId { get; set; }
    public decimal Amount { get; set; }
}
public sealed class BudgetChangeHistory : Owned
{
    public string BudgetId { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public string Reason { get; set; } = "";
    public string Source { get; set; } = "User";
    public long BeforeVersion { get; set; }
    public long AfterVersion { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class BudgetCarryover : Owned
{
    public string SourceMonth { get; set; } = "";
    public string TargetMonth { get; set; } = "";
    public string? CategoryId { get; set; }
    public decimal Amount { get; set; }
    public string Rule { get; set; } = "None";
    public decimal Parameter { get; set; }
    public decimal? Cap { get; set; }
    public bool CarryOverspend { get; set; }
    public string State { get; set; } = "Confirmed";
    public string SourceFingerprint { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class BudgetTemplate : Owned
{
    public string Name { get; set; } = "";
    public string BudgetJson { get; set; } = "{}";
    public string State { get; set; } = "Active";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class BudgetAlertSetting : Owned
{
    public string ThresholdsJson { get; set; } = "[70,90,100]";
    public bool Enabled { get; set; } = true;
    public bool Silent { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class BudgetAlertState : Owned
{
    public string BudgetId { get; set; } = "";
    public string Month { get; set; } = "";
    public int Threshold { get; set; }
    public decimal Used { get; set; }
    public decimal EffectiveBudget { get; set; }
    public bool Silent { get; set; }
    public bool Dismissed { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class SavingsGoal : Owned
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Other";
    public decimal Target { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateOnly StartDate { get; set; }
    public DateOnly TargetDate { get; set; }
    public decimal MonthlySaving { get; set; }
    public int Priority { get; set; } = 1;
    public string State { get; set; } = "Planned";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class GoalAllocation : Owned
{
    public string GoalId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public decimal Amount { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class GoalAllocationHistory : Owned
{
    public string GoalId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string? ToGoalId { get; set; }
    public string Action { get; set; } = "Allocate";
    public decimal Before { get; set; }
    public decimal After { get; set; }
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class EssentialExpensePolicy : Owned
{
    public string? CategoryId { get; set; }
    public string? TransactionId { get; set; }
    public string Necessity { get; set; } = "Essential";
    public decimal EssentialRate { get; set; } = 100;
    public bool Excluded { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class FutureCashFlowItem : Owned
{
    public string Name { get; set; } = "";
    public DateOnly ExpectedDate { get; set; }
    public string Type { get; set; } = "Expense";
    public string AccountId { get; set; } = "";
    public string? ToAccountId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "CNY";
    public decimal? ReceivedAmount { get; set; }
    public string Certainty { get; set; } = "Estimated";
    public string State { get; set; } = "Planned";
    public string? TransactionId { get; set; }
    public string? ScenarioId { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class CashFlowScenario : Owned
{
    public string ChangesJson { get; set; } = "[]";
    public string Name { get; set; } = "";
    public string State { get; set; } = "Active";
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class ScenarioCalculation : Owned
{
    public string ScenarioId { get; set; } = "";
    public string InputJson { get; set; } = "{}";
    public string ResultJson { get; set; } = "{}";
    public string SourceHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
