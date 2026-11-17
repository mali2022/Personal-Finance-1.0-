namespace PersonalFinance.Api.Application;

/// <summary>Deterministic safeguards; inputs must already be valued in the request currency.
/// Null means unavailable, never zero. Credit limits must not enter AvailableCash.</summary>
public sealed record SpendingApprovalFacts(decimal Amount, decimal? AvailableCash,
    decimal FrozenCash, decimal GoalReserves, decimal EmergencyReserve,
    decimal FutureNecessaryExpenses, decimal? MonthlyRemaining, decimal? CategoryRemaining,
    bool ValuationComplete);

public sealed record SpendingApprovalSafety(string RuleVersion, string Verdict,
    decimal? DiscretionaryCash, decimal? CashAfter, decimal? MonthlyAfter,
    decimal? CategoryAfter, string[] Reasons);

public static class SpendingApprovalRules
{
    public sealed record ConstraintRange(decimal? LowerAvailable, decimal? UpperAvailable, bool OverlapUnresolved, SpendingApprovalSafety Safety);
    /// <summary>Without source-level allocation, reserves may overlap. Bounds are not an exact deduction.</summary>
    public static ConstraintRange AssessUnreconciled(SpendingApprovalFacts facts)
    {
        var safety = Assess(facts);
        var constraints = new[] { facts.FrozenCash, facts.GoalReserves, facts.EmergencyReserve, facts.FutureNecessaryExpenses };
        var unresolved = constraints.Count(x => x > 0) > 1;
        decimal? lower = facts.ValuationComplete ? facts.AvailableCash - constraints.Sum() : null;
        decimal? upper = facts.ValuationComplete ? facts.AvailableCash - constraints.Max() : null;
        if (!unresolved) return new(lower, upper, false, safety);
        var reasons = safety.Reasons.Where(x => x != "CASH_RESERVES_BREACHED").ToList();
        if (upper - facts.Amount < 0) reasons.Add("CASH_RESERVES_BREACHED");
        reasons.Add("RESERVATION_OVERLAP_UNRESOLVED");
        safety = safety with { DiscretionaryCash = null, CashAfter = null,
            Verdict = reasons.Any(x => x.EndsWith("BREACHED") || x.EndsWith("EXCEEDED")) ? "DEFERRED" : "NEEDS_INFORMATION",
            Reasons = reasons.ToArray() };
        return new(lower, upper, true, safety);
    }
    public static SpendingApprovalSafety Assess(SpendingApprovalFacts facts)
    {
        decimal[] amounts = [facts.Amount, facts.FrozenCash, facts.GoalReserves,
            facts.EmergencyReserve, facts.FutureNecessaryExpenses];
        if (facts.Amount <= 0 || amounts.Any(x => x < 0 || x > 1_000_000_000_000m || decimal.Round(x, 2) != x)
            || new[] { facts.AvailableCash, facts.MonthlyRemaining, facts.CategoryRemaining }
                .Any(x => x.HasValue && (x.Value < -1_000_000_000_000m || x.Value > 1_000_000_000_000m || decimal.Round(x.Value, 2) != x)))
            throw new ArgumentException("Invalid monetary inputs");

        var reasons = new List<string>();
        decimal? cash = facts.ValuationComplete ? facts.AvailableCash - facts.FrozenCash
            - facts.GoalReserves - facts.EmergencyReserve - facts.FutureNecessaryExpenses : null;
        if (!facts.ValuationComplete) reasons.Add("VALUATION_INCOMPLETE");
        if (!facts.AvailableCash.HasValue) reasons.Add("CASH_DATA_MISSING");
        if (!facts.MonthlyRemaining.HasValue) reasons.Add("MONTHLY_BUDGET_UNKNOWN");
        if (!facts.CategoryRemaining.HasValue) reasons.Add("CATEGORY_BUDGET_UNKNOWN");
        if (cash - facts.Amount < 0) reasons.Add("CASH_RESERVES_BREACHED");
        if (facts.MonthlyRemaining - facts.Amount < 0) reasons.Add("MONTHLY_BUDGET_EXCEEDED");
        if (facts.CategoryRemaining - facts.Amount < 0) reasons.Add("CATEGORY_BUDGET_EXCEEDED");
        // Passing safeguards alone is never an AI approval.
        var verdict = reasons.Any(x => x.EndsWith("BREACHED") || x.EndsWith("EXCEEDED"))
            ? "DEFERRED" : "NEEDS_INFORMATION";
        return new("1.0", verdict, cash, cash - facts.Amount,
            facts.MonthlyRemaining - facts.Amount, facts.CategoryRemaining - facts.Amount, reasons.ToArray());
    }
}
