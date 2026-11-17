namespace PersonalFinance.Api.Application;

public sealed record LifeRetirementRequest(LifeInput Baseline, int CurrentAge, int RetirementAge, int EndAge,
    decimal MonthlySpending, decimal MonthlyPension, int PensionAge, decimal PartTimeIncome = 0,
    decimal AnnualMedicalCost = 0, decimal DrawdownFeeRate = 0);
public sealed record LifeRetirementPlan(LifeInput Input, LifeResult Result, DateOnly RetirementDate, DateOnly EndExclusive,
    decimal FinancialAssetsAtRetirement, decimal? TargetRetirementAssets, decimal? AdditionalCapitalToday,
    decimal? AdditionalMonthlySaving, DateOnly? FinancialAssetsDepleted, string[] Limitations);

public static class LifeRetirementPlanning
{
    private static decimal Round(decimal n) => decimal.Round(n, 2, MidpointRounding.AwayFromZero);
    public static LifeRetirementPlan Preview(LifeRetirementRequest b, CancellationToken ct = default)
    {
        FinanceService.Require(b.Baseline.Path == null, "退休资金目标求解采用固定假设，请移除随机路径");
        FinanceService.Require(b.CurrentAge is >= 0 and <= 110 && b.RetirementAge >= b.CurrentAge && b.EndAge > b.RetirementAge && b.EndAge <= 120 && (b.EndAge - b.CurrentAge) * 12 <= 480 && b.PensionAge >= b.CurrentAge && b.PensionAge <= 120, "年龄或规划终点无效；规划最多40年");
        FinanceService.Require(new[] { b.MonthlySpending, b.MonthlyPension, b.PartTimeIncome, b.AnnualMedicalCost }.All(v => v is >= 0 and <= 1000000000000m) && b.DrawdownFeeRate is >= 0 and <= .3m, "退休收入、支出或提款成本无效");
        var start = b.Baseline.Start; var months = (b.EndAge - b.CurrentAge) * 12;
        var retire = start.AddMonths((b.RetirementAge - b.CurrentAge) * 12); var end = start.AddMonths(months);
        var pension = start.AddMonths((b.PensionAge - b.CurrentAge) * 12); if (pension < retire) pension = retire;
        var existing = b.Baseline.Events.Where(e => !e.Id.StartsWith("retirement:", StringComparison.Ordinal)).ToArray();
        FinanceService.Require(existing.All(e => e.Date < end), "规划终点之前仍有未纳入的未来事件，请调整终点或事件");
        FinanceService.Require(!existing.Any(e => e.Date >= retire && e.Type is "IncomeChange" or "ExpenseChange"), "退休日期之后已有月收入或支出变更，请先移除或调整，避免覆盖退休假设");
        LifeEvent Event(string id, string name, string type, DateOnly date, decimal amount, int frequency = 0) => new("retirement:" + id, name, type, date, amount, EveryMonths: frequency, Currency: b.Baseline.Currency, Note: "Explicit retirement assumption; ages measured as complete years from baseline start");
        var events = new List<LifeEvent>(existing) {
            Event("income", "Retirement part-time net income", "IncomeChange", retire, b.PartTimeIncome),
            Event("spending", "Retirement monthly spending", "ExpenseChange", retire, b.MonthlySpending)
        };
        if (pension < end && b.MonthlyPension > 0) events.Add(Event("pension", "Assumed pension, not a policy guarantee", "Income", pension, b.MonthlyPension, 1));
        if (b.AnnualMedicalCost > 0) events.Add(Event("medical", "Assumed annual medical spending", "Expense", retire, b.AnnualMedicalCost, 12));
        var plan = b.Baseline with { Name = b.Baseline.Name[..Math.Min(b.Baseline.Name.Length,137)] + " / Retirement", Months = months, Events = events.ToArray(), InvestmentDrawdownFrom = retire, DrawdownFeeRate = b.DrawdownFeeRate,
            AssumptionSource = (b.Baseline.AssumptionSource.Length > 3000 ? b.Baseline.AssumptionSource[..3000] : b.Baseline.AssumptionSource) + "; Retirement: user-specified net pension and costs, immediate investment liquidation from retirement, no home-equity withdrawals; ages are years from snapshot start." };
        var result = LifeSimulationEngine.Run(plan, ct);
        decimal AtRetirement(LifeInput input, LifeResult r) => retire == start ? input.Cash + input.Investments : r.Months.Last(x => x.Date < retire).ClosingCash + r.Months.Last(x => x.Date < retire).Investments;
        var financial = AtRetirement(plan, result);
        var limitations = new List<string> { "PENSION_IS_USER_ASSUMPTION_NOT_LAW", "AGE_YEAR_OFFSETS_FROM_BASELINE_DATE", "NO_PROPERTY_OR_RESTRICTED_ASSET_WITHDRAWALS", "ADDITIONAL_SAVING_REQUIRES_REAL_INCOME_OR_SPENDING_ADJUSTMENT", "TARGET_IS_SUFFICIENT_FOR_THIS_DETERMINISTIC_PATH_NOT_A_SAFE_WITHDRAWAL_GUARANTEE" };
        decimal? target = null, capital = null, monthly = null;
        if (result.FirstShortfall is { } first && first < retire) limitations.Add("FIX_PRE_RETIREMENT_LIQUIDITY_BEFORE_SOLVING_TARGET");
        else if (plan.UnscheduledDebt > 0) limitations.Add("UNSCHEDULED_DEBT_PREVENTS_A_RELIABLE_FUNDING_TARGET");
        else {
            if (result.FirstShortfall == null) {
                // Solve a funding target even for an already funded plan, rather than
                // incorrectly reporting all existing wealth as the amount required.
                LifeInput Reduce(decimal removal) {
                    var investmentPart = Math.Min(plan.Investments, removal);
                    var cashPart = Math.Min(Math.Max(0, plan.Cash - plan.ReserveFloor), removal - investmentPart);
                    return plan with { Investments = plan.Investments - investmentPart, Cash = plan.Cash - cashPart };
                }
                decimal safeRemoval = 0, unsafeRemoval = plan.Investments + Math.Max(0, plan.Cash - plan.ReserveFloor);
                for (var i = 0; i < 48 && unsafeRemoval - safeRemoval > .01m; i++) {
                    var mid = (safeRemoval + unsafeRemoval) / 2;
                    try { var trial = LifeSimulationEngine.Run(Reduce(mid), ct); if (trial.FirstShortfall == null) safeRemoval = mid; else unsafeRemoval = mid; }
                    catch (PersonalFinance.Api.Contracts.ApiException) { unsafeRemoval = mid; }
                }
                var minimum = Reduce(decimal.Floor(safeRemoval * 100) / 100);
                target = Round(AtRetirement(minimum, LifeSimulationEngine.Run(minimum, ct))); capital = 0; monthly = 0;
                limitations.Add("TARGET_REDUCES_INITIAL_INVESTMENTS_THEN_CASH_ABOVE_RESERVE_FLOOR");
            }
            else {
                var maximum = 1000000000000m - plan.Investments;
                var high = Math.Min(1000m, maximum); decimal low = 0; LifeResult? best = null;
                while (high > 0) {
                    ct.ThrowIfCancellationRequested(); var trial = LifeSimulationEngine.Run(plan with { Investments = plan.Investments + high }, ct);
                    if (trial.FirstShortfall == null) { best = trial; break; }
                    if (high == maximum) break; high = Math.Min(maximum, high * 2);
                }
                if (best == null) limitations.Add("NO_FEASIBLE_TARGET_WITHIN_RESOURCE_AND_AMOUNT_LIMITS");
                else {
                    for (var i = 0; i < 48 && high - low > .01m; i++) {
                        ct.ThrowIfCancellationRequested(); var mid = (high + low) / 2;
                        var trial = LifeSimulationEngine.Run(plan with { Investments = plan.Investments + mid }, ct);
                        if (trial.FirstShortfall == null) { high = mid; best = trial; } else low = mid;
                    }
                    capital = decimal.Ceiling(high * 100) / 100;
                    var funded = plan with { Investments = plan.Investments + capital.Value };
                    var final = LifeSimulationEngine.Run(funded, ct); target = Round(AtRetirement(funded, final));
                    var periods = (b.RetirementAge - b.CurrentAge) * 12;
                    if (periods > 0) {
                        var factor = (decimal)System.Math.Pow(1 + (double)plan.InvestmentReturn, 1.0 / 12);
                        var growth = (decimal)System.Math.Pow((double)factor, periods);
                        var annuityDue = factor == 1 ? periods : (growth - 1) / (factor - 1) * factor;
                        monthly = decimal.Ceiling(capital.Value * growth / annuityDue * 100) / 100;
                    }
                }
            }
        }
        return new(plan, result, retire, end, Round(financial), target, capital, monthly,
            result.Months.FirstOrDefault(x => x.Date >= retire && x.ClosingCash + x.Investments <= 0)?.Date, limitations.ToArray());
    }
}
public sealed partial class FinanceService
{
    public async Task<object> LifeRetirementPreview(string user, LifeRetirementRequest b, CancellationToken ct)
    { await CheckLifeSnapshot(user, b.Baseline); var plan = LifeRetirementPlanning.Preview(b, ct); await CheckLifeSnapshot(user, plan.Input); return plan; }
}
