using System.Text.Json;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;
public sealed record LifeSensitivityInput(LifeInput Input, string Parameter, decimal[] Values, string? SecondParameter = null, decimal[]? SecondValues = null);
public sealed record LifeMonteCarloInput(LifeInput Input, int Iterations, int Seed, decimal InvestmentVolatility, decimal InflationVolatility, decimal IncomeVolatility, decimal Correlation, decimal AnnualFee = 0);
public sealed record LifeSensitivityCell(decimal X, decimal? Y, decimal NetWorth, decimal MinimumCash, DateOnly? FirstShortfall);
public sealed record LifeBand(DateOnly Date, decimal P10, decimal P50, decimal P90);
public sealed record LifeMonteCarloResult(string ModelVersion, int Seed, int Iterations, string Distribution, decimal Correlation, LifeBand[] Bands, decimal CashExhaustionRatio, decimal? GoalReachedRatio, decimal[] FinalValues, string[] Limitations);
public static class LifeSimulationRisk
{
    private static LifeInput Set(LifeInput b, string key, decimal value) => key switch {
        "InvestmentReturn" => b with { InvestmentReturn = value }, "Inflation" => b with { Inflation = value },
        "IncomeGrowth" => b with { IncomeGrowth = value }, "ExpenseGrowth" => b with { ExpenseGrowth = value },
        "OtherReturn" => b with { OtherReturn = value }, "MonthlyIncome" => b with { MonthlyIncome = value },
        "MonthlyExpense" => b with { MonthlyExpense = value },
        _ => throw new PersonalFinance.Api.Contracts.ApiException(422, "敏感性参数不在白名单") };
    public static LifeSensitivityCell[] Sensitivity(LifeSensitivityInput b, CancellationToken ct = default)
    {
        FinanceService.Require(b.Values.Length is >= 1 and <= 9 && (b.SecondParameter == null || b.SecondParameter != b.Parameter && b.SecondValues?.Length is >= 1 and <= 9), "敏感性网格参数无效");
        FinanceService.Require(b.Values.Length * (b.SecondParameter == null ? 1 : b.SecondValues!.Length) <= 49, "敏感性最多49次计算");
        var cells = new List<LifeSensitivityCell>();
        foreach (var x in b.Values) foreach (var y in b.SecondParameter == null ? new decimal?[] { null } : b.SecondValues!.Select(v => (decimal?)v)) {
            ct.ThrowIfCancellationRequested(); var input = Set(b.Input with { Path = null }, b.Parameter, x);
            if (y.HasValue) input = Set(input, b.SecondParameter!, y.Value);
            var r = LifeSimulationEngine.Run(input, ct); cells.Add(new(x, y, r.FinalNetWorth, r.MinimumCash, r.FirstShortfall));
        }
        return cells.ToArray();
    }
    // Explicit portable PRNG rather than runtime-dependent System.Random sequences.
    private sealed class Generator(int seed)
    {
        private uint state = unchecked((uint)seed) ^ 0x9e3779b9u;
        private double Uniform() { state = unchecked(state * 1664525u + 1013904223u); return (state + .5) / 4294967296.0; }
        public double Normal() => Math.Sqrt(-2 * Math.Log(Uniform())) * Math.Cos(2 * Math.PI * Uniform());
    }
    private static decimal Quantile(decimal[] values, double p) { var sorted = values.OrderBy(x => x).ToArray(); var pos = p * (sorted.Length - 1); var lo = (int)pos; return decimal.Round(sorted[lo] + (sorted[Math.Min(lo + 1, sorted.Length - 1)] - sorted[lo]) * (decimal)(pos - lo), 2); }
    public static LifeMonteCarloResult MonteCarlo(LifeMonteCarloInput b, CancellationToken ct = default)
    {
        LifeSimulationEngine.Validate(b.Input);
        FinanceService.Require(b.Iterations is >= 10 and <= 500 && b.Iterations * b.Input.Months <= 120000, "概率模拟为10至500次且总月步数不超过120000");
        FinanceService.Require(new[] { b.InvestmentVolatility, b.InflationVolatility, b.IncomeVolatility }.All(v => v is >= 0 and <= .8m) && b.Correlation is >= -.49m and <= .99m && b.AnnualFee is >= 0 and <= .1m, "波动率、相关性或费用无效");
        var random = new Generator(b.Seed); var rho = (double)b.Correlation;
        var a = Math.Sqrt(1 - rho * rho); var c = (rho - rho * rho) / a; var d = Math.Sqrt(1 - rho * rho - c * c);
        decimal Draw(decimal mean, decimal vol, double z) => (decimal)(Math.Exp(Math.Clamp((Math.Log(1 + (double)mean) - .5 * (double)(vol * vol)) / 12 + (double)vol / Math.Sqrt(12) * z, Math.Log(.1), Math.Log(8))) - 1);
        var trajectories = Enumerable.Range(0, b.Input.Months).Select(_ => new decimal[b.Iterations]).ToArray();
        var finals = new decimal[b.Iterations]; var exhausted = 0; var achieved = 0;
        for (var i = 0; i < b.Iterations; i++)
        {
            ct.ThrowIfCancellationRequested(); var investment = new decimal[b.Input.Months]; var inflation = new decimal[b.Input.Months]; var income = new decimal[b.Input.Months];
            for (var m = 0; m < b.Input.Months; m++) {
                var z1 = random.Normal(); var z2 = random.Normal(); var z3 = random.Normal();
                investment[m] = Draw(b.Input.InvestmentReturn, b.InvestmentVolatility, z1);
                investment[m] = Math.Max(-.9m, (1 + investment[m]) * (decimal)Math.Pow(1 - (double)b.AnnualFee, 1.0 / 12) - 1);
                inflation[m] = Draw(b.Input.Inflation, b.InflationVolatility, rho * z1 + a * z2);
                income[m] = Draw(b.Input.IncomeGrowth, b.IncomeVolatility, rho * z1 + c * z2 + d * z3);
            }
            var r = LifeSimulationEngine.Run(b.Input with { Path = new(investment, inflation, income) }, ct);
            finals[i] = r.FinalNetWorth; if (r.FirstShortfall != null) exhausted++;
            if (b.Input.Goals.Length > 0 && b.Input.Goals.All(g => b.Input.Cash + b.Input.Investments >= g.Target || r.Months.Any(m => m.Date <= g.Due && m.ClosingCash + m.Investments >= g.Target))) achieved++;
            for (var m = 0; m < b.Input.Months; m++) trajectories[m][i] = r.Months[m].NetWorth;
        }
        return new("life-lognormal-1/" + LifeSimulationEngine.ModelVersion, b.Seed, b.Iterations, "Correlated monthly lognormal factors; annual log drift log(1+mean)-variance/2; monthly factors truncated [0.1,8]", b.Correlation,
            trajectories.Select((x, m) => new LifeBand(b.Input.Start.AddMonths(m + 1).AddDays(-1), Quantile(x, .1), Quantile(x, .5), Quantile(x, .9))).ToArray(), (decimal)exhausted / b.Iterations,
            b.Input.Goals.Length == 0 ? null : (decimal)achieved / b.Iterations, finals,
            ["ASSUMPTIONS_NOT_REAL_WORLD_PROBABILITIES", "HISTORICAL_RETURNS_NOT_GUARANTEES", "INDEPENDENT_MONTHS_WITH_CONSTANT_CORRELATION", "GOALS_SHARE_UNALLOCATED_ASSETS", "INFLATION_CHANGES_REAL_VALUES_NOT_NOMINAL_SPENDING", "HOUSEHOLD_CHANGE_EVENTS_OVERRIDE_LEVELS_FROM_NEXT_PERIOD"]);
    }
}
public sealed partial class FinanceService
{
    public async Task<object> LifeSensitivity(string user, LifeSensitivityInput b, CancellationToken ct)
    { await CheckLifeSnapshot(user, b.Input); return new { modelVersion = LifeSimulationEngine.ModelVersion, input = b, cells = LifeSimulationRisk.Sensitivity(b, ct) }; }
    public async Task<object> LifeMonteCarlo(string user, LifeMonteCarloInput b, CancellationToken ct)
    {
        await CheckLifeSnapshot(user, b.Input); var result = LifeSimulationRisk.MonteCarlo(b, ct); ct.ThrowIfCancellationRequested();
        var doc = new StoredDocument { UserId = user, Kind = "LifeRiskReport", Name = b.Input.Name, ContentType = "application/json", Content = JsonSerializer.SerializeToUtf8Bytes(new { input = b, result, calculatedAt = DateTimeOffset.UtcNow }, Json) };
        db.Documents.Add(doc); return new { doc.Id, result };
    }
}
