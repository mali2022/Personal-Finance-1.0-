namespace PersonalFinance.Api.Application;

public sealed record ReturnResult(string Status, double? Rate, double[] Roots, string Method);
public sealed record DatedInvestmentCashFlow(DateOnly Date, decimal Amount);
public sealed record PeriodicReturnResult(ReturnResult PeriodReturn, double PeriodsPerYear, double? AnnualizedRate, string AnnualizationStatus);

/// <summary>Rates are fractions. XIRR uses actual days / 365; IRR returns a period rate.</summary>
public static class InvestmentReturns
{
    // Monthly=12, quarterly=4, yearly=1. Custom intervals must explicitly specify periods per year.
    public static PeriodicReturnResult PeriodicIrr(IReadOnlyList<decimal> amounts, double periodsPerYear, CancellationToken ct = default)
    {
        if (!double.IsFinite(periodsPerYear) || periodsPerYear <= 0 || periodsPerYear > 366)
            return new(new("InvalidCashFlow", null, [], "IRR-period"), 0, null, "InvalidPeriod");
        var result = Irr(amounts, ct);
        if (result.Rate == null) return new(result, periodsPerYear, null, "NotAvailable");
        var annualized = Math.Pow(1 + result.Rate.Value, periodsPerYear) - 1;
        return double.IsFinite(annualized) ? new(result, periodsPerYear, annualized, "Success")
            : new(result, periodsPerYear, null, "AnnualizationOverflow");
    }
    public static ReturnResult Irr(IReadOnlyList<decimal> amounts, CancellationToken ct = default) =>
        Solve(amounts.Select((a, i) => ((double)i, a)).ToArray(), "IRR-period", ct);

    public static ReturnResult Xirr(IEnumerable<DatedInvestmentCashFlow> flows, CancellationToken ct = default)
    {
        var rows = flows.GroupBy(x => x.Date).Select(g => new DatedInvestmentCashFlow(g.Key, g.Sum(x => x.Amount)))
            .Where(x => x.Amount != 0).OrderBy(x => x.Date).ToArray();
        if (rows.Length == 0) return new("InsufficientData", null, [], "XIRR-Actual365");
        return Solve(rows.Select(x => ((x.Date.DayNumber - rows[0].Date.DayNumber) / 365d, x.Amount)).ToArray(), "XIRR-Actual365", ct);
    }

    private static ReturnResult Solve((double Time, decimal Amount)[] rows, string method, CancellationToken ct)
    {
        ReturnResult Failure(string status) => new(status, null, [], method);
        if (rows.Length > 20000) return Failure("ResourceLimit");
        rows = rows.Where(x => x.Amount != 0).ToArray();
        if (rows.Length < 2) return Failure("InsufficientData");
        if (!rows.Any(x => x.Amount > 0) || !rows.Any(x => x.Amount < 0)) return Failure("NoSignChange");
        if (rows.Max(x => x.Time) == rows.Min(x => x.Time)) return Failure("InvalidCashFlow");
        var watch = System.Diagnostics.Stopwatch.StartNew();
        var terms = rows.Select(x => (x.Time, Sign: Math.Sign(x.Amount), LogAmount: Math.Log(Math.Abs((double)x.Amount)))).ToArray();
        // Solve in log(1+r), avoiding a singularity at r=-1. Scale exponential terms to avoid overflow.
        double Npv(double y)
        {
            var shift = terms.Max(x => x.LogAmount - x.Time * y);
            double sum = 0, compensation = 0;
            foreach (var term in terms)
            {
                var value = term.Sign * Math.Exp(term.LogAmount - term.Time * y - shift) - compensation;
                var next = sum + value;
                compensation = (next - sum) - value;
                sum = next;
            }
            return sum;
        }
        var roots = new List<double>();
        const int steps = 16384;
        const double lower = -27.6310211159, upper = 27.6310211159;
        var left = lower; var fl = Npv(left);
        for (var i = 1; i <= steps; i++)
        {
            ct.ThrowIfCancellationRequested();
            if (watch.Elapsed > TimeSpan.FromSeconds(2)) return Failure("ResourceLimit");
            var right = lower + (upper - lower) * i / steps; var fr = Npv(right);
            if (Math.Sign(fl) != Math.Sign(fr) || fr == 0)
            {
                var a = left; var b = right;
                for (var iteration = 0; iteration < 100 && b - a > 1e-13; iteration++)
                {
                    var mid = (a + b) / 2; var fm = Npv(mid);
                    if (Math.Sign(Npv(a)) == Math.Sign(fm)) a = mid; else b = mid;
                }
                var y = (a + b) / 2; var rate = Math.Exp(y) - 1;
                if (!double.IsFinite(rate) || Math.Abs(Npv(y)) > 1e-9) return Failure("NonConvergent");
                if (!roots.Any(r => Math.Abs(r - rate) < 1e-8)) roots.Add(rate);
            }
            left = right; fl = fr;
        }
        // A finite sign-change scan cannot prove uniqueness for nonconventional flows (including tangent roots).
        var signs = rows.Where(x => x.Amount != 0).Select(x => Math.Sign(x.Amount)).ToArray();
        var changes = signs.Zip(signs.Skip(1)).Count(x => x.First != x.Second);
        if (roots.Count > 1) return new("MultipleRoots", null, roots.ToArray(), method);
        if (changes > 1) return new("AmbiguousCashFlow", null, roots.ToArray(), method);
        return roots.Count == 1 ? new("Success", roots[0], roots.ToArray(), method) : Failure("NoRootInSearchRange");
    }
}
