using System.Security.Cryptography;
using System.Text.Json;

namespace PersonalFinance.Api.Application;

// Prediction-only DTOs. None of these types represent ledger commands.
public sealed record LifeEvent(string Id, string Name, string Type, DateOnly Date, decimal Amount,
    DateOnly? End = null, int EveryMonths = 0, decimal Growth = 0, string Currency = "CNY",
    decimal FxRate = 1, decimal Basis = 0, string? LoanId = null, string Note = "");
public sealed record LifeLoan(string Id, decimal Principal, decimal AnnualRate, int Months,
    DateOnly FirstPayment, string Mode = "EqualPayment", string PrepaymentMode = "ShortenTerm");
public sealed record LifeGoal(string Name, decimal Target, DateOnly Due);
public sealed record LifePath(decimal[] InvestmentMonthly, decimal[] InflationMonthly, decimal[] IncomeMonthly);
public sealed record LifeInput(string Name, DateOnly Start, int Months, string Currency,
    decimal Cash, decimal Investments, decimal OtherAssets, decimal RestrictedAssets,
    decimal MonthlyIncome, decimal MonthlyExpense, decimal IncomeGrowth, decimal ExpenseGrowth,
    decimal Inflation, decimal InvestmentReturn, decimal CashReturn, decimal OtherReturn,
    decimal ReserveFloor, LifeLoan[] Loans, LifeEvent[] Events, LifeGoal[] Goals,
    string AssumptionSource, string? SnapshotId = null, decimal UnscheduledDebt = 0, LifePath? Path = null,
    DateOnly? InvestmentDrawdownFrom = null, decimal DrawdownFeeRate = 0);
public sealed record LifeMonth(DateOnly Date, decimal OpeningCash, decimal Income, decimal Expense,
    decimal InvestmentContribution, decimal Borrowing, decimal Principal, decimal Interest,
    decimal AssetPurchase, decimal AssetProceeds, decimal ValuationChange, decimal ClosingCash,
    decimal Investments, decimal OtherAssets, decimal RestrictedAssets, decimal Debt,
    decimal NetWorth, decimal RealNetWorth, decimal MinimumCash);
public sealed record LifeResult(string ModelVersion, string Fingerprint, DateOnly PriceBase,
    string Currency, LifeMonth[] Months, DateOnly? FirstShortfall, decimal MinimumCash,
    decimal FinalNetWorth, decimal TotalIncome, decimal TotalExpense, decimal TotalInterest,
    object[] Goals, string[] Warnings)
{
    public decimal? SavingsRate => TotalIncome > 0 ? (TotalIncome - TotalExpense - TotalInterest) / TotalIncome : null;
    public decimal RequiredLiquidity => Math.Max(0, -MinimumCash);
    public int NegativeCashMonths => Months.Count(x => x.MinimumCash < 0);
    public decimal MinimumNetWorth => Months.Min(x => x.NetWorth);
    public decimal? FinalCoverageMonths => Months[^1].Expense + Months[^1].Interest + Months[^1].Principal > 0 ? Math.Max(0, Months[^1].ClosingCash) / (Months[^1].Expense + Months[^1].Interest + Months[^1].Principal) : null;
    public object[] Years => Months.GroupBy(x => x.Date.Year).Select(g => (object)new { year = g.Key, income = g.Sum(x => x.Income), expense = g.Sum(x => x.Expense), principal = g.Sum(x => x.Principal), interest = g.Sum(x => x.Interest), closingCash = g.Last().ClosingCash, netWorth = g.Last().NetWorth, realNetWorth = g.Last().RealNetWorth, debt = g.Last().Debt, partial = g.Count() != 12 }).ToArray();
}

public static class LifeSimulationEngine
{
    public const string ModelVersion = "life-monthly-3";
    private static decimal Round(decimal n) => decimal.Round(n, 2, MidpointRounding.AwayFromZero);
    private static decimal Factor(decimal rate, decimal years) => (decimal)Math.Pow(1 + (double)rate, (double)years);
    private static readonly string[] Types = ["Income", "Expense", "IncomeChange", "ExpenseChange", "Invest", "Withdraw", "BuyAsset", "SellAsset", "Borrow", "Repay", "Transfer", "InvestmentShock"];
    public static string Fingerprint(LifeInput input) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new { ModelVersion, input }, FinanceService.Json)));
    public static void Validate(LifeInput b)
    {
        FinanceService.Require(b.Name.Trim().Length is > 0 and <= 150 && b.AssumptionSource.Trim().Length is > 0 and <= 4000, "请填写名称及假设来源");
        FinanceService.Require(b.Start.Year is >= 1900 and <= 9900 && b.Months is >= 1 and <= 480, "模拟期限为1至480个月");
        FinanceService.Require(CurrencyDefinitions.Supports(b.Currency), "币种无效");
        FinanceService.Require(new[] { b.Cash, b.Investments, b.OtherAssets, b.RestrictedAssets, b.MonthlyIncome, b.MonthlyExpense, b.ReserveFloor, b.UnscheduledDebt }.All(x => x >= 0 && x <= 1000000000000m), "起始金额须为非负且不超过一万亿");
        FinanceService.Require(new[] { b.IncomeGrowth, b.ExpenseGrowth, b.Inflation, b.InvestmentReturn, b.CashReturn, b.OtherReturn }.All(x => x is >= -.5m and <= .5m), "年增长及收益假设范围为-50%至50%");
        FinanceService.Require(b.Events.Length <= 200 && b.Loans.Length <= 30 && b.Goals.Length <= 50, "事件、贷款或目标数量超限");
        FinanceService.Require(b.DrawdownFeeRate is >= 0 and <= .3m && (b.InvestmentDrawdownFrom == null || b.InvestmentDrawdownFrom >= b.Start && b.InvestmentDrawdownFrom < b.Start.AddMonths(b.Months)), "投资提款日期或成本率无效");
        FinanceService.Require(b.Events.Select(x => x.Id).Distinct().Count() == b.Events.Length && b.Loans.Select(x => x.Id).Distinct().Count() == b.Loans.Length, "事件或贷款标识重复");
        foreach (var l in b.Loans)
            FinanceService.Require(l.Id.Length is > 0 and <= 100 && l.Principal is > 0 and <= 1000000000000m && l.AnnualRate is >= 0 and <= 1 && l.Months is >= 1 and <= 600 && l.FirstPayment >= b.Start && l.FirstPayment.Year <= 9900 && l.Mode is "EqualPayment" or "EqualPrincipal" && l.PrepaymentMode is "ShortenTerm" or "LowerPayment", "贷款参数无效");
        foreach (var e in b.Events)
        {
            FinanceService.Require(e.Id.Length is > 0 and <= 100 && e.Name.Length is > 0 and <= 150 && Types.Contains(e.Type) && e.Date >= b.Start && e.Date < b.Start.AddMonths(b.Months) && (e.End == null || e.End >= e.Date && e.End.Value.Year <= 9900) && e.EveryMonths is >= 0 and <= 480 && e.Amount is >= 0 and <= 1000000000000m && e.Growth is >= -.5m and <= .5m && e.Basis is >= 0 and <= 1000000000000m && e.Note.Length <= 2000, "事件日期、类型或金额无效");
            FinanceService.Require(CurrencyDefinitions.Supports(e.Currency) && e.FxRate is > 0 and <= 1000000 && (e.Currency != b.Currency || e.FxRate == 1), "事件汇率必须是明确的用户假设，同币种汇率为1");
            FinanceService.Require(e.Type is not ("Repay" or "Borrow") || b.Loans.Any(x => x.Id == e.LoanId), "借款或还本事件必须关联模拟贷款");
        }
        foreach (var l in b.Loans)
        {
            var borrow = b.Events.Where(x => x.Type == "Borrow" && x.LoanId == l.Id).ToArray();
            FinanceService.Require(borrow.Length <= 1 && (borrow.Length == 0 || borrow[0].EveryMonths == 0 && borrow[0].Amount * borrow[0].FxRate == l.Principal && borrow[0].Date < l.FirstPayment), "新增贷款须唯一、金额等于本金且早于首期还款");
        }
        FinanceService.Require(b.Goals.All(x => x.Name.Length is > 0 and <= 150 && x.Target is > 0 and <= 1000000000000m && x.Due >= b.Start), "目标无效");
        if (b.Path != null) FinanceService.Require(new[] { b.Path.InvestmentMonthly, b.Path.InflationMonthly, b.Path.IncomeMonthly }.All(x => x.Length == b.Months && x.All(v => v is >= -.9m and <= 7)), "随机路径长度或月变化超限");
    }
    public static LifeResult Run(LifeInput b, CancellationToken ct = default)
    {
        Validate(b);
        ct.ThrowIfCancellationRequested();
        try { return Calculate(b, ct); }
        catch (OverflowException) { throw new PersonalFinance.Api.Contracts.ApiException(422, "假设产生的金额超出精确计算范围，请缩短期限或调整增长及通胀假设", "SIMULATION_AMOUNT_OVERFLOW"); }
    }
    private static LifeResult Calculate(LifeInput b, CancellationToken ct)
    {
        var fingerprint = Fingerprint(b);
        decimal cash = b.Cash, investments = b.Investments, assets = b.OtherAssets, income = b.MonthlyIncome, expense = b.MonthlyExpense;
        var balances = b.Loans.ToDictionary(x => x.Id, x => b.Events.Any(e => e.Type == "Borrow" && e.LoanId == x.Id) ? 0 : x.Principal);
        var payments = b.Loans.ToDictionary(x => x.Id, x => LoanScheduleMath.Generate(new("Simulation", x.Principal.ToString(System.Globalization.CultureInfo.InvariantCulture), b.Start, x.FirstPayment, x.Months, x.AnnualRate * 100, 0, x.Mode, []), b.Start).ToDictionary(r => r.Date));
        var reprice = new HashSet<string>(); var adjustedPayment = new Dictionary<string, decimal>();
        var occurrences = new SortedDictionary<DateOnly, List<LifeEvent>>();
        foreach (var e in b.Events)
            for (var k = 0; ; k++)
            {
                var date = e.Date.AddMonths(k * e.EveryMonths);
                if (date >= b.Start.AddMonths(b.Months) || e.End != null && date > e.End) break;
                if (!occurrences.TryGetValue(date, out var list)) occurrences[date] = list = [];
                list.Add(e with { Date = date, Amount = Round(e.Amount * Factor(e.Growth, k * e.EveryMonths / 12m)) });
                if (e.EveryMonths == 0) break;
            }
        var rows = new List<LifeMonth>(); DateOnly? shortage = null; decimal minimum = cash, deflator = 1, incomeIndex = 1, fees = 0, contribution = 0;
        void Check(DateOnly date) {
            if (b.InvestmentDrawdownFrom != null && date >= b.InvestmentDrawdownFrom) {
                for (var attempt = 0; attempt < 2 && cash < 0 && investments > 0; attempt++) {
                    var gross = Math.Min(investments, decimal.Ceiling(-cash / (1 - b.DrawdownFeeRate) * 100) / 100);
                    var charge = Math.Min(gross, Round(gross * b.DrawdownFeeRate));
                    investments -= gross; cash += gross - charge; contribution -= gross; fees += charge;
                }
            }
            minimum = Math.Min(minimum, cash); if (cash < 0) shortage ??= date;
        }
        for (var m = 0; m < b.Months; m++)
        {
            ct.ThrowIfCancellationRequested();
            var start = b.Start.AddMonths(m); var end = b.Start.AddMonths(m + 1);
            decimal opening = cash, inflow = 0, borrowing = 0, principal = 0, interest = 0, purchase = 0, proceeds = 0, valuation = 0, localMin = cash; fees = 0; contribution = 0;
            if (m > 0 && b.Path != null) incomeIndex *= 1 + b.Path.IncomeMonthly[m - 1];
            var incomeFactor = b.Path == null ? Factor(b.IncomeGrowth, m / 12m) : incomeIndex;
            // Monthly household flows are explicitly due at the start of each projection period.
            if (occurrences.TryGetValue(start, out var initial))
                foreach (var e in initial.Where(x => x.Type is "IncomeChange" or "ExpenseChange").OrderBy(x => x.Id, StringComparer.Ordinal)) { if (e.Type == "IncomeChange") income = e.Amount * e.FxRate / incomeFactor; else expense = e.Amount * e.FxRate / Factor(b.ExpenseGrowth, m / 12m); }
            inflow = Round(income * (b.Path == null ? Factor(b.IncomeGrowth, m / 12m) : incomeIndex)) + (initial?.Where(e => e.Type == "Income").Sum(e => Round(e.Amount * e.FxRate)) ?? 0); fees = Round(expense * Factor(b.ExpenseGrowth, m / 12m)); cash += inflow - fees; Check(start); localMin = Math.Min(localMin, cash);
            for (var day = start; day < end; day = day.AddDays(1))
            {
                ct.ThrowIfCancellationRequested();
                if (occurrences.TryGetValue(day, out var events)) foreach (var e in events.OrderBy(x => x.Type == "Borrow" ? 0 : 1).ThenBy(x => x.Id, StringComparer.Ordinal))
                {
                    var a = Round(e.Amount * e.FxRate);
                    switch (e.Type)
                    {
                        case "Income": if (day != start) { cash += a; inflow += a; } break;
                        case "Expense": cash -= a; fees += a; break;
                        case "IncomeChange": if (day != start) income = a / incomeFactor; break;
                        case "ExpenseChange": if (day != start) expense = a / Factor(b.ExpenseGrowth, m / 12m); break;
                        case "Invest": cash -= a; investments += a; contribution += a; break;
                        case "Withdraw": FinanceService.Require(a <= investments, "投资提款超过模拟持仓"); cash += a; investments -= a; contribution -= a; break;
                        case "BuyAsset": cash -= a; assets += a; purchase += a; break;
                        case "SellAsset": FinanceService.Require(e.Basis <= assets, "出售账面价值超过模拟资产"); assets -= e.Basis; cash += a; proceeds += a; valuation += a - e.Basis; break;
                        case "Borrow": balances[e.LoanId!] += a; cash += a; borrowing += a; break;
                        case "Repay": var paid = Math.Min(a, balances[e.LoanId!]); balances[e.LoanId!] -= paid; cash -= paid; principal += paid; if (b.Loans.Single(x => x.Id == e.LoanId).PrepaymentMode == "LowerPayment") reprice.Add(e.LoanId!); break;
                        case "InvestmentShock": FinanceService.Require(a <= investments, "投资损失超过模拟持仓"); investments -= a; valuation -= a; break;
                    }
                    Check(day); localMin = Math.Min(localMin, cash);
                }
                foreach (var l in b.Loans)
                {
                    if (!payments[l.Id].TryGetValue(day, out var row) || balances[l.Id] == 0) continue;
                    if (reprice.Remove(l.Id)) {
                        var remainingPeriods = l.Months - row.Sequence + 1;
                        var revised = LoanScheduleMath.Generate(new("Repriced simulation", balances[l.Id].ToString(System.Globalization.CultureInfo.InvariantCulture), day, day, remainingPeriods, l.AnnualRate * 100, 0, l.Mode, []), day)[0];
                        adjustedPayment[l.Id] = l.Mode == "EqualPrincipal" ? revised.Principal : revised.Total;
                    }
                    var charge = Round(balances[l.Id] * l.AnnualRate / 12);
                    var scheduled = adjustedPayment.GetValueOrDefault(l.Id, l.Mode == "EqualPrincipal" ? row.Principal : row.Total);
                    var part = Math.Min(balances[l.Id], l.Mode == "EqualPrincipal" ? scheduled : Math.Max(0, scheduled - charge));
                    if (row.Sequence == l.Months) part = balances[l.Id];
                    balances[l.Id] -= part; cash -= part + charge; principal += part; interest += charge;
                    Check(day); localMin = Math.Min(localMin, cash);
                }
            }
            var gain = Round(investments * (b.Path?.InvestmentMonthly[m] ?? (Factor(b.InvestmentReturn, 1m / 12) - 1))); investments += gain; valuation += gain;
            var appreciation = Round(assets * (Factor(b.OtherReturn, 1m / 12) - 1)); assets += appreciation; valuation += appreciation;
            var cashInterest = cash > 0 ? Round(cash * (Factor(b.CashReturn, 1m / 12) - 1)) : 0; cash += cashInterest; inflow += cashInterest;
            Check(end.AddDays(-1)); localMin = Math.Min(localMin, cash);
            var debt = balances.Values.Sum() + b.UnscheduledDebt; var worth = cash + investments + assets + b.RestrictedAssets - debt;
            if (cash != opening + inflow - fees - contribution + borrowing - principal - interest - purchase + proceeds) throw new InvalidOperationException("Cash conservation failed");
            var previous = rows.Count == 0 ? b.Cash + b.Investments + b.OtherAssets + b.RestrictedAssets - b.UnscheduledDebt - b.Loans.Where(l => !b.Events.Any(e => e.Type == "Borrow" && e.LoanId == l.Id)).Sum(l => l.Principal) : rows[^1].NetWorth;
            if (worth != previous + inflow - fees - interest + valuation) throw new InvalidOperationException("Net worth conservation failed");
            deflator *= 1 + (b.Path?.InflationMonthly[m] ?? (Factor(b.Inflation, 1m / 12) - 1));
            rows.Add(new(end.AddDays(-1), opening, inflow, fees, contribution, borrowing, principal, interest, purchase, proceeds, valuation, cash, investments, assets, b.RestrictedAssets, debt, worth, Round(worth / deflator), localMin));
        }
        var warnings = new List<string> { "ASSUMPTIONS_NOT_GUARANTEES", "MONTH_START_HOUSEHOLD_FLOWS", "MIDMONTH_CHANGES_NEXT_PERIOD", "NO_AUTOMATIC_PROPERTY_OR_RESTRICTED_ASSET_LIQUIDATION" };
        if (minimum < b.ReserveFloor) warnings.Add("RESERVE_FLOOR_BREACHED");
        if (b.UnscheduledDebt > 0) warnings.Add("UNSCHEDULED_DEBT_NO_PAYMENTS_MODELED");
        if (b.InvestmentDrawdownFrom != null) warnings.Add("USER_ENABLED_IMMEDIATE_INVESTMENT_LIQUIDATION_WITH_ASSUMED_FEE");
        return new(ModelVersion, fingerprint, b.Start, b.Currency, rows.ToArray(), shortage, minimum, rows[^1].NetWorth,
            rows.Sum(x => x.Income), rows.Sum(x => x.Expense), rows.Sum(x => x.Interest),
            b.Goals.Select(g => { var reached = b.Cash + b.Investments >= g.Target ? (DateOnly?)b.Start : rows.FirstOrDefault(x => x.ClosingCash + x.Investments >= g.Target)?.Date;
                return (object)new { g.Name, g.Target, g.Due, reached, reachedByDue = reached != null && reached <= g.Due, delayMonths = reached != null ? (int?)Math.Max(0, (reached.Value.Year - g.Due.Year) * 12 + reached.Value.Month - g.Due.Month) : null, basis = "UnallocatedCashAndInvestments_NotReserved" }; }).ToArray(), warnings.ToArray());
    }
}

