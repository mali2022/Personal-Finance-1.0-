namespace PersonalFinance.Api.Application;

public sealed record SpendingItem(string Name, decimal Amount, decimal FollowUpCost, decimal Hours, int? Uses);
public sealed record SpendingOption(string Id, SpendingItem[] Items, decimal[] Scores, bool ScoresConfirmed, string Type = "Other");
public sealed record SpendingInput(decimal Budget, decimal? AvailableCash, decimal SafetyFloor, decimal? AvailableHours,
    decimal[] Weights, SpendingOption[] Options, decimal? MinimumRemaining = null, decimal? MonthlySaving = null, decimal[]? MinimumScores = null);
public sealed record SpendingResult(string Id, decimal TotalCost, decimal Remaining, decimal Hours,
    decimal? CostPerUse, decimal? CashAfter, bool? FinanciallySafe, bool Feasible, decimal? PreferenceScore,
    string[] Reasons, bool NonDominated, decimal? GoalRecoveryMonths = null);

/// <summary>Pure decimal calculation. Cash and time assumptions must be explicitly supplied; no ledger writes.</summary>
public static class SpendingValueMath
{
    public static object Sensitivity(SpendingInput input)
    {
        var baseline = Compare(input);
        var variants = input.Weights.SelectMany((_, dimension) => new[] { .5m, 1.5m }.Select(factor =>
        {
            var weights = input.Weights.ToArray(); weights[dimension] *= factor;
            var ranked = weights.Sum() == 0 ? baseline : Compare(input with { Weights = weights });
            return new { dimension, factor, ranking = ranked.Where(r => r.Feasible && r.PreferenceScore.HasValue).Select(r => r.Id).ToArray() };
        })).ToArray();
        var eligible = baseline.Where(r => r.Feasible && r.PreferenceScore.HasValue).ToArray();
        return new { baseline, variants, leaders = eligible.Where(r => r.PreferenceScore == eligible[0].PreferenceScore).Select(r => r.Id).ToArray() };
    }
    public static SpendingResult[] Compare(SpendingInput input)
    {
        if (input.Budget > 1000000000000m || input.AvailableCash > 1000000000000m || input.MinimumRemaining < 0 || input.MonthlySaving < 0 ||
            input.MinimumScores != null && (input.MinimumScores.Length != input.Weights.Length || input.MinimumScores.Any(s => s < 0 || s > 10)) ||
            decimal.Round(input.Budget,2) != input.Budget || input.AvailableHours > 1000000 || input.SafetyFloor > 1000000000000m || input.Budget < 0 || input.SafetyFloor < 0 || input.AvailableCash < 0 || input.AvailableHours < 0 ||
            input.Options.Length is < 2 or > 50 || input.Weights.Length is < 1 or > 20 ||
            input.Weights.Any(w => w < 0 || w > 1000000) || input.Weights.Sum() <= 0 ||
            input.Options.Select(o => o.Id).Distinct().Count() != input.Options.Length)
            throw new ArgumentException("Invalid budget, constraints, dimensions or options");
        var results = input.Options.Select(o =>
        {
            if (!new[] { "Other", "Experience", "Learning", "Health", "Durable", "Combination", "KeepCash" }.Contains(o.Type) || o.Type == "KeepCash" && o.Items.Length != 0 || string.IsNullOrWhiteSpace(o.Id) || o.Id.Length > 100 || o.Items.Length > 100 || o.Scores.Length != input.Weights.Length ||
                o.Scores.Any(s => s < 0 || s > 10) || o.Items.Any(i => decimal.Round(i.Amount,2) != i.Amount || decimal.Round(i.FollowUpCost,2) != i.FollowUpCost || i.Name.Length > 100 || i.Amount > 1000000000000m || i.FollowUpCost > 1000000000000m || i.Hours > 1000000 || i.Amount < 0 || i.FollowUpCost < 0 || i.Hours < 0 || i.Uses <= 0))
                throw new ArgumentException("Invalid option");
            var cost = o.Items.Sum(i => i.Amount + i.FollowUpCost);
            var hours = o.Items.Sum(i => i.Hours);
            var reasons = new List<string>();
            if (input.MinimumRemaining.HasValue && input.Budget - cost < input.MinimumRemaining) reasons.Add("MINIMUM_REMAINING_BREACHED");
            if (input.MinimumScores != null && input.MinimumScores.Where((s, i) => s > 0 && (!o.ScoresConfirmed || o.Scores[i] < s)).Any()) reasons.Add("REQUIRED_VALUE_BREACHED");
            if (cost > input.Budget) reasons.Add("BUDGET_EXCEEDED");
            decimal? cash = input.AvailableCash - cost;
            bool? safe = cash.HasValue ? cash.Value >= input.SafetyFloor : null;
            if (safe == false) reasons.Add("SAFETY_FLOOR_BREACHED");
            if (safe == null) reasons.Add("CASH_DATA_INSUFFICIENT");
            if (input.AvailableHours == null) reasons.Add("TIME_DATA_INSUFFICIENT");
            else if (hours > input.AvailableHours) reasons.Add("TIME_EXCEEDED");
            if (!o.ScoresConfirmed) reasons.Add("SCORES_UNCONFIRMED");
            // A combined basket has no meaningful shared use count. Avoid dividing unrelated uses.
            decimal? perUse = o.Items.Length == 1 && o.Items[0].Uses is int uses ? cost / uses : null;
            decimal? score = o.ScoresConfirmed ? o.Scores.Zip(input.Weights, (s, w) => s * w).Sum() / input.Weights.Sum() : null;
            return new SpendingResult(o.Id, cost, input.Budget - cost, hours, perUse, cash, safe,
                reasons.All(r => r == "SCORES_UNCONFIRMED"), score, reasons.ToArray(), false, input.MonthlySaving > 0 ? decimal.Ceiling(cost / input.MonthlySaving.Value) : null);
        }).ToArray();
        // Pareto comparison preserves tradeoffs; equal outcomes remain tied.
        results = results.Select(r => r with { NonDominated = r.Feasible && r.PreferenceScore.HasValue && !results.Any(x =>
            x.Feasible && x.PreferenceScore.HasValue && x.TotalCost <= r.TotalCost && x.Hours <= r.Hours && x.PreferenceScore >= r.PreferenceScore &&
            (x.TotalCost < r.TotalCost || x.Hours < r.Hours || x.PreferenceScore > r.PreferenceScore)) }).ToArray();
        return results.OrderByDescending(r => r.Feasible).ThenByDescending(r => r.Feasible ? r.PreferenceScore : null).ToArray();
    }
}
