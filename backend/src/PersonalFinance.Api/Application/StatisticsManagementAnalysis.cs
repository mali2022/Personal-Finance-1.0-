using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> PreviewStatisticsManagement(string user, StatisticsManagementPreview input, bool includeComparison = true, bool includeDetails = true, DateTimeOffset? asOf = null)
    {
        var o = input.Options;
        var (start, plannedEnd) = StatisticsManagementPeriod(o, input.Anchor, input.Period);
        var now = asOf ?? DateTimeOffset.UtcNow;
        var end = plannedEnd < now ? plannedEnd : now;
        Require(start <= now, "未来账期尚无已发生统计");
        var currency = input.Currency ?? o.BaseCurrency;
        Require(CurrencyDefinitions.Supports(currency), "统计币种无效");
        // Analysis uses settled facts only; future dates and draft records never affect actual amounts.
        var transactions = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Status == "Confirmed" && t.OccurredAt >= start && t.OccurredAt < end);
        var range = transactions.Where(t => t.Currency == currency);
        var rules = new StatisticsRules { IncludeFees = input.LedgerRules.IncludeFees, IncludeAssetLoss = input.LedgerRules.IncludeAssetLoss, IncludeDecreasingAdjustments = input.LedgerRules.IncludeDecreasingAdjustments };
        var expense = await StatisticalExpenses(range, rules).Take(100001).ToArrayAsync();
        Require(expense.Length <= 100000, "统计记录过多，请缩小账期");
        var incomeEntries = await (from e in db.Entries.AsNoTracking() join t in range on e.TransactionId equals t.Id where e.Kind == "Income" select e).Take(100001).ToArrayAsync();
        Require(incomeEntries.Length <= 100000, "统计记录过多，请缩小账期");
        var rewardIds = await db.Set<CashbackReceivable>().Where(x => x.UserId == user && x.Treatment == "RewardIncome" && x.SettlementTransactionId != null).Select(x => x.SettlementTransactionId!).ToArrayAsync();
        var subsidyIds = await db.Set<PromotionTransferDraft>().Where(x => x.UserId == user && x.SubsidyTransactionId != null).Select(x => x.SubsidyTransactionId!).ToArrayAsync();
        var rewardRecoveries = await (from r in db.Set<CashbackRecovery>() join b in db.Set<CashbackReceivable>() on r.CashbackId equals b.Id where r.UserId == user && b.UserId == user && b.Treatment == "RewardIncome" && r.State == "Active" select r.TransactionId).ToArrayAsync();
        var rewardSet = rewardIds.Concat(subsidyIds).Concat(rewardRecoveries).ToHashSet();
        var depositSet = (await db.Set<ManagedAsset>().Where(x => x.UserId == user && x.InterestTransactionId != null).Select(x => x.InterestTransactionId!).ToArrayAsync()).ToHashSet();
        var investmentSet = (await db.Set<InvestmentTrade>().Where(x => x.UserId == user && x.State == "Active" && (x.Type == "Dividend" || x.Type == "Interest") && x.TransactionId != null).Select(x => x.TransactionId!).ToArrayAsync()).ToHashSet();
        decimal IncomeFor(HashSet<string> ids) => -incomeEntries.Where(e => ids.Contains(e.TransactionId)).Sum(e => e.Amount);
        var rewardIncome = IncomeFor(rewardSet); var depositInterest = IncomeFor(depositSet); var investmentCashIncome = IncomeFor(investmentSet);
        bool Included(Entry e) => (o.IncludeCashRewards || !rewardSet.Contains(e.TransactionId)) && (o.IncludeDepositInterest || !depositSet.Contains(e.TransactionId)) && (o.IncludeInvestmentCashIncome || !investmentSet.Contains(e.TransactionId));
        var includedIncome = incomeEntries.Where(Included).ToArray();
        var income = -includedIncome.Sum(e => e.Amount);
        var loss = await range.Where(t => t.Type == "AssetLoss").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var adjustment = await range.Where(t => t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var extra = (rules.IncludeAssetLoss ? loss : 0) + (rules.IncludeDecreasingAdjustments ? adjustment : 0);
        var grossExpense = expense.Where(e => e.Amount > 0).Sum(e => e.Amount) + extra;
        var refunds = -expense.Where(e => e.Amount < 0).Sum(e => e.Amount);
        var netExpense = grossExpense - refunds;
        var attributes = await db.Set<TransactionAnalysisAttribute>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var categories = await db.Categories.AsNoTracking().Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id);
        var transactionAttributes = attributes.Where(x => x.TransactionId != null).ToDictionary(x => x.TransactionId!, x => x.Behavior);
        var categoryAttributes = attributes.Where(x => x.CategoryId != null).ToDictionary(x => x.CategoryId!, x => x.Behavior);
        string Behavior(Entry e)
        {
            if (transactionAttributes.TryGetValue(e.TransactionId, out var behavior)) return behavior;
            var id = e.CategoryId;
            var visited = new HashSet<string>();
            while (id != null && visited.Add(id)) { if (categoryAttributes.TryGetValue(id, out behavior)) return behavior; id = categories.GetValueOrDefault(id)?.ParentId; }
            return "Unknown";
        }
        var oneTimeIncome = -includedIncome.Where(e => Behavior(e) == "OneTimeIncome").Sum(e => e.Amount);
        var savingsIncome = income - (o.IncludeOneTimeIncomeInSavings ? 0 : oneTimeIncome);
        var savedRules = await Rules(user);
        var savedTotals = await Totals(user, range);
        var ledgerIncome = -incomeEntries.Sum(e => e.Amount);
        var ledgerExpense = expense.Sum(e => e.Amount) + extra;
        var first = DateOnly.FromDateTime(start.ToOffset(TimeSpan.FromHours(8)).Date);
        var last = DateOnly.FromDateTime(end.AddTicks(-1).ToOffset(TimeSpan.FromHours(8)).Date);
        object? accounts = includeDetails && o.ShowAccountFlows ? await StatisticsManagementFlows(user, transactions, currency) : null;
        object? debt = includeDetails && o.ShowDebtAnalysis ? await StatisticsManagementDebt(user, start, end, plannedEnd, currency) : null;
        object? investment = null;
        if (includeDetails && o.ShowInvestmentAnalysis)
        {
            var investmentQuery = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = first.ToString("yyyy-MM-dd"), ["end"] = last.ToString("yyyy-MM-dd"), ["currency"] = currency });
            investment = await InvestmentPerformance(user, investmentQuery);
        }
        object? wealth = null;
        if (includeDetails && o.ShowWealthAnalysis)
        {
            var opening = await Worth(user, currency, start.AddTicks(-1)); var closing = await Worth(user, currency, end.AddTicks(-1));
            var valuation = await AssetAllocation(user, new QueryCollection(new Dictionary<string, StringValues> { ["date"] = last.ToString("yyyy-MM-dd"), ["currency"] = currency }));
            wealth = new { openingNetWorth = M(opening.netWorth), closingNetWorth = M(closing.netWorth), change = M(closing.netWorth - opening.netWorth),
                nonSurplusChange = M(closing.netWorth - opening.netWorth - (income - netExpense)), consolidatedValuation = valuation,
                note = "账户净资产为账本余额推算；综合估值另列，不与账户余额或投资损益重复相加。历史期初生效日缺失，差额不等同投资收益。" };
        }
        var payroll = includeDetails ? await StatisticsManagementPayroll(user, first, last.AddDays(1), end, currency, o) : null;
        var threshold = Money(o.LargeTransactionThreshold);
        var large = includeDetails && o.HighlightLargeTransactions ? await range.Where(t => t.Type == "Expense" && t.Amount >= threshold).OrderByDescending(t => t.Amount).Take(20).Select(t => new { t.Id, amount = M(t.Amount), t.OccurredAt }).ToArrayAsync() : [];
        var unclassified = expense.Where(e => e.CategoryId == null).Sum(e => e.Amount);
        object? comparison = null;
        if (includeComparison)
        {
            var doc = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Kind == StatisticsManagementKind);
            var savedOptions = doc == null ? new StatisticsManagementOptions() : JsonSerializer.Deserialize<StatisticsManagementOptions>(doc.Content, Json)!;
            var savedInput = input with { Options = savedOptions, LedgerRules = new(savedRules.IncludeFees, savedRules.IncludeAssetLoss, savedRules.IncludeDecreasingAdjustments) };
            var saved = JsonSerializer.SerializeToElement(await PreviewStatisticsManagement(user, savedInput, false, false, now), Json);
            comparison = new { start = saved.GetProperty("start"), endExclusive = saved.GetProperty("endExclusive"), daily = saved.GetProperty("daily"), samePeriod = StatisticsManagementPeriod(savedOptions, input.Anchor, input.Period).start == start };
        }
        return new {
            schemaVersion = 1, currency, timeZone = "Asia/Shanghai", start, endExclusive = end, plannedEndExclusive = plannedEnd, generatedAt = now,
            isPeriodClosed = plannedEnd <= now, transactionCount = await range.CountAsync(),
            daily = new { income = M(income), grossExpense = M(grossExpense), refunds = M(refunds), netExpense = M(netExpense),
                displayedExpense = M(o.RefundDisplay == "Net" ? netExpense : grossExpense), surplus = M(income - netExpense),
                cashRewardIncome = M(rewardIncome), depositInterest = M(depositInterest), investmentCashIncome = M(investmentCashIncome),
                excludedIncome = M(ledgerIncome - income), oneTimeIncome = M(oneTimeIncome), savingsIncome = M(savingsIncome),
                savingsRate = savingsIncome > 0 ? M((savingsIncome - netExpense) / savingsIncome * 100) : null,
                ledgerIncome = M(ledgerIncome), ledgerExpense = M(ledgerExpense), savedLedgerExpense = M(savedTotals.expense), ledgerExpenseDifference = M(ledgerExpense - savedTotals.expense), savedLedgerVersion = savedRules.Version.ToString() },
            accounts, debt, investment, wealth, payroll, comparison,
            quality = new { unclassifiedExpense = M(unclassified), unclassifiedCount = expense.Count(e => e.CategoryId == null),
                futureExcluded = await db.Transactions.CountAsync(t => t.UserId == user && t.Currency == currency && t.Status == "Confirmed" && t.OccurredAt >= start && t.OccurredAt < plannedEnd && t.OccurredAt >= now),
                unsettledExcluded = await db.Transactions.CountAsync(t => t.UserId == user && t.Currency == currency && t.OccurredAt >= start && t.OccurredAt < plannedEnd && t.Status != "Confirmed" && t.Status != "Deleted"), largeTransactions = large },
            notes = new[] { "原币统计。基准货币决定默认查询币种，不自动折算历史交易。",
                "三个全账本开关作用于现有报表；其余方案配置作用于本页口径分析，现有预算仍按自然月与全账本规则计算。",
                "奖励、利息与投资现金收益仅按明确业务关联识别；未建立关联的手工收入保留为其他收入，不按名称猜测。",
                "净日常结余、流动账户现金流结余及净资产变化为不同指标。退款不计收入，跨期退款按到账日展示。",
                "工资、投资与债务附表不再次加入日常收支；未来计划始终与已发生金额分列。" }
        };
    }

    private async Task<object> StatisticsManagementFlows(string user, IQueryable<FinanceTransaction> transactions, string currency)
    {
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.UserId == user && a.Currency == currency).ToArrayAsync();
        var liquidIds = accounts.Where(a => AccountKinds.IsLiquid(a.Type)).Select(a => a.Id).ToArray();
        var flows = await (from e in db.Entries join t in transactions on e.TransactionId equals t.Id
            where e.Kind == "Account" && e.Currency == currency && e.UserId == user
            select new { e.AccountId, e.Amount, t.Id, t.Type, t.OccurredAt }).ToArrayAsync();
        Require(flows.Length <= 200000, "资金分录过多，请缩小账期");
        var cash = flows.Where(e => liquidIds.Contains(e.AccountId) && e.Type is not ("Adjustment" or "AssetLoss"));
        // Net both sides of transfers between liquid accounts before computing cash inflows/outflows.
        var net = cash.GroupBy(x => x.Id).Select(g => g.Sum(x => x.Amount)).ToArray();
        var inflow = net.Where(x => x > 0).Sum(); var outflow = -net.Where(x => x < 0).Sum();
        return new { inflow = M(inflow), outflow = M(outflow), surplus = M(inflow - outflow),
            surplusRate = inflow > 0 ? M((inflow - outflow) / inflow * 100) : null,
            items = accounts.Select(a => new { a.Id, a.Name, a.Type, a.Status,
                inflow = M(flows.Where(e => e.AccountId == a.Id && e.Amount > 0).Sum(e => e.Amount)),
                outflow = M(-flows.Where(e => e.AccountId == a.Id && e.Amount < 0).Sum(e => e.Amount)),
                change = M(flows.Where(e => e.AccountId == a.Id).Sum(e => e.Amount)) }),
            note = "现金流指标仅含现金、银行、支付宝、微信和电子钱包；同币种流动账户间转账按交易抵销，手续费保留，余额调整与损失排除。账户逐行资金变动含转账和调整，不能直接相加为现金流入流出。" };
    }

    private async Task<object> StatisticsManagementPayroll(string user, DateOnly first, DateOnly until, DateTimeOffset end, string currency, StatisticsManagementOptions o)
    {
        var slips = await db.Set<PayrollStatement>().AsNoTracking().Where(p => p.UserId == user && p.Currency == currency && (p.State == "Confirmed" || p.State == "Paid" || p.State == "Reconciled")).ToArrayAsync();
        Require(slips.Length <= 10000, "工资条过多，请使用薪酬中心查询");
        var selected = slips.Where(p => { var date = o.PayrollTimeBasis == "Paid" ? p.PayDate : DateOnly.ParseExact(p.Month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture); return date >= first && date < until; }).ToArray();
        var ids = selected.Select(p => p.Id).ToArray();
        var parts = await db.Set<PayrollComponent>().AsNoTracking().Where(p => p.UserId == user && ids.Contains(p.PayrollId) && p.Status == "Active").ToArrayAsync();
        var (gross, deductions, net) = PayrollMath.Calculate(parts);
        var actual = await (from p in db.Set<PayrollPayment>() join t in db.Transactions on p.TransactionId equals t.Id where p.UserId == user && ids.Contains(p.PayrollId) && t.UserId == user && t.Status == "Confirmed" && t.OccurredAt < end select (decimal?)t.Amount).SumAsync() ?? 0;
        decimal Part(string category) => parts.Where(p => p.Kind == "Deduction" && p.Category == category).Sum(p => p.Amount);
        return new { count = selected.Length, gross = M(gross), deductions = M(deductions), net = M(net),
            displayedSalary = M(o.PayrollBasis == "Gross" ? gross : net), actual = M(actual), tax = M(Part("Tax")),
            personalSocial = M(Part("Pension") + Part("Medical") + Part("Unemployment")), personalHousing = M(Part("HousingFund")),
            annualBonus = M(parts.Where(p => p.Kind == "Earning" && p.Category == "AnnualBonus").Sum(p => p.Amount)),
            adjustments = M(parts.Where(p => p.Kind == "Adjustment").Sum(p => p.Amount)),
            note = "工资独立附表，不代替银行到账。归属口径将工资月份视为该月1日；actual为所选工资条截至报告时点关联的到账。实发=应发-扣缴+更正项，单位缴费不计可支配收入。" };
    }

    private async Task<object> StatisticsManagementDebt(string user, DateTimeOffset start, DateTimeOffset end, DateTimeOffset plannedEnd, string currency)
    {
        var facts = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Currency == currency && t.Status == "Confirmed" && t.OccurredAt < end);
        var period = facts.Where(t => t.OccurredAt >= start);
        var received = await period.Where(t => t.Type == "LoanReceived").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var repaid = await period.Where(t => t.Type == "LoanRepaymentPaid").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var card = await period.Where(t => t.Type == "CreditCardPayment").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var allocations = await (from a in db.Set<DebtPaymentAllocation>() join t in facts on a.TransactionId equals t.Id
            where a.UserId == user && a.State == "Active" && !db.Transactions.Any(r => r.UserId == user && r.OriginalTransactionId == t.Id && r.Status == "Confirmed" && r.OccurredAt < end)
            select new { a.PlanId, a.Sequence, a.Component, a.FeeNature, a.Amount, t.Type, t.OccurredAt }).ToArrayAsync();
        var paidFees = allocations.Where(a => a.OccurredAt >= start && a.Component == "Fee" && a.Type == "Expense").ToArray();
        var businesses = await db.Businesses.AsNoTracking().Where(b => b.UserId == user && b.Currency == currency && b.Kind == "Borrowed" && b.OccurredAt < end
            && facts.Any(t => t.BusinessId == b.Id && t.Type == "LoanReceived")).ToArrayAsync();
        var principalPaid = await facts.Where(t => t.Type == "LoanRepaymentPaid").GroupBy(t => t.BusinessId).Select(g => new { id = g.Key, amount = g.Sum(t => t.Amount) }).ToArrayAsync();
        var outstanding = businesses.Sum(b => Math.Max(0, b.Principal - (principalPaid.FirstOrDefault(x => x.id == b.Id)?.amount ?? 0)));
        var plans = await db.Set<DebtRepaymentPlan>().AsNoTracking().Where(p => p.UserId == user && p.Currency == currency && p.State == "Active").ToArrayAsync();
        Require(plans.Length <= 1000, "偿还计划过多，请使用债务管理查询");
        var first = DateOnly.FromDateTime(start.ToOffset(TimeSpan.FromHours(8)).Date); var until = DateOnly.FromDateTime(plannedEnd.ToOffset(TimeSpan.FromHours(8)).Date);
        decimal plannedPrincipal = 0, plannedFees = 0;
        foreach (var p in plans)
        {
            var rows = JsonSerializer.Deserialize<DebtScheduleRow[]>(p.ScheduleJson, Json) ?? [];
            foreach (var row in rows.Where(r => r.Date >= first && r.Date < until))
            {
                plannedPrincipal += Math.Max(0, row.Principal - allocations.Where(a => a.PlanId == p.Id && a.Sequence == row.Sequence && a.Component == "Principal").Sum(a => a.Amount));
                plannedFees += Math.Max(0, row.Fee - allocations.Where(a => a.PlanId == p.Id && a.Sequence == row.Sequence && a.Component == "Fee").Sum(a => a.Amount));
            }
        }
        var months = await period.Where(t => t.Type == "LoanReceived" || t.Type == "LoanRepaymentPaid" || t.Type == "CreditCardPayment").Select(t => new { t.Type, t.Amount, t.OccurredAt }).ToArrayAsync();
        return new { received = M(received), principalRepaid = M(repaid), cardRepaid = M(card), remainingPrincipal = M(outstanding),
            interest = M(paidFees.Where(a => a.FeeNature == "Interest").Sum(a => a.Amount)), serviceFees = M(paidFees.Where(a => a.FeeNature == "ServiceFee").Sum(a => a.Amount)),
            unclassifiedFees = M(paidFees.Where(a => a.FeeNature == "Unclassified").Sum(a => a.Amount)),
            plannedPrincipal = M(plannedPrincipal), plannedFees = M(plannedFees), plannedRemainingPayment = M(plannedPrincipal + plannedFees),
            months = months.Select(t => t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"))
                .Concat(paidFees.Select(a => a.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"))).Distinct().OrderBy(key => key).Select(key => new { month = key,
                    received = M(months.Where(t => t.Type == "LoanReceived" && t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM") == key).Sum(t => t.Amount)),
                    principalRepaid = M(months.Where(t => t.Type == "LoanRepaymentPaid" && t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM") == key).Sum(t => t.Amount)),
                    cardRepaid = M(months.Where(t => t.Type == "CreditCardPayment" && t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM") == key).Sum(t => t.Amount)),
                    interest = M(paidFees.Where(a => a.FeeNature == "Interest" && a.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM") == key).Sum(a => a.Amount)),
                    serviceFees = M(paidFees.Where(a => a.FeeNature == "ServiceFee" && a.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM") == key).Sum(a => a.Amount)),
                    unclassifiedFees = M(paidFees.Where(a => a.FeeNature == "Unclassified" && a.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM") == key).Sum(a => a.Amount)) }),
            note = "借款与本金偿还按真实业务流水；剩余本金仅含已登记借入业务。利息和手续费仅含有效已核对分项，未核对不能视为零费用。预计剩余还款来自当前有效偿还计划及核对，不新增消费或负债；当前计划和分类不构成历史快照。" };
    }
}
