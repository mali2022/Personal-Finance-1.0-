using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private sealed record ForecastEvent(string Id, DateOnly Date, string Name, string Type, string AccountId, string? ToAccountId, decimal Amount, string Currency, decimal? ReceivedAmount, string Source, string Certainty, decimal Fee = 0);
    public async Task<object> CashFlowForecast(string user, IQueryCollection query, CancellationToken ct = default)
    {
        var (start, end) = ForecastRange(query); var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var accountId = query["accountId"].ToString(); if (accountId.Length > 0) { var a = await Account(user, accountId); Require(a.Currency == currency && !(a.Type == "Receivable" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan"), "账户币种与预测币种不一致或辅助账户不适用"); }
        var scenarioId = query["scenarioId"].ToString(); if (scenarioId.Length > 0) Require(await db.Set<CashFlowScenario>().AnyAsync(x => x.UserId == user && x.Id == scenarioId && x.State == "Active"), "情景不可用");
        var allAccounts = await db.Accounts.AsNoTracking().Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id);
        var chosen = allAccounts.Values.Where(x => x.Currency == currency && x.Status == "Active" && !(x.Type == "Receivable" || x.Type == "Payable" || x.Type == "ConsumerLoan" || x.Type == "SecuredLoan") && (accountId.Length == 0 || x.Id == accountId)).OrderBy(x => x.Id).ToArray(); Require(chosen.Length <= 100, "请缩小账户范围");
        var balances = (await Accounts(user)).Select(x => JsonSerializer.SerializeToNode(x, Json)!).ToDictionary(x => x["id"]!.GetValue<string>(), x => PlanningDecimal(x["balance"]!.GetValue<string>()));
        var manual = await db.Set<FutureCashFlowItem>().AsNoTracking().Where(x => x.UserId == user && x.State == "Planned" && x.TransactionId == null && x.ExpectedDate >= start && x.ExpectedDate < end && (x.ScenarioId == null || x.ScenarioId == scenarioId)).OrderBy(x => x.Id).Take(2001).ToArrayAsync(); Require(manual.Length <= 2000, "未来计划超过2000笔，请缩小范围");
        var events = manual.Select(x => new ForecastEvent("manual:" + x.Id, x.ExpectedDate, x.Name, x.Type, x.AccountId, x.ToAccountId, x.Amount, x.Currency, x.ReceivedAmount, x.ScenarioId == null ? "Manual" : "Scenario", x.Certainty)).ToList();
        var debtWarnings = new List<object>();
        if (query["includeLoanPlans"] == "true")
        {
            var plans = await db.Set<DebtRepaymentPlan>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.Kind == "LoanRepayment" && x.State == "Active").OrderBy(x => x.Id).Take(201).ToArrayAsync(); Require(plans.Length <= 200, "借贷计划过多，请先归档无效计划");
            var ids = plans.Select(x => x.Id).ToArray(); var businessIds = plans.Select(x => x.BusinessId!).ToArray();
            var businesses = await db.Businesses.AsNoTracking().Where(x => x.UserId == user && businessIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
            var allocations = await (from a in db.Set<DebtPaymentAllocation>() join t in db.Transactions on a.TransactionId equals t.Id where a.UserId == user && ids.Contains(a.PlanId) && a.State == "Active" && t.Status != "Deleted" && !db.Transactions.Any(r => r.UserId == user && r.OriginalTransactionId == t.Id && r.Status != "Deleted") select a).AsNoTracking().ToArrayAsync();
            var paid = allocations.GroupBy(a => (a.PlanId, a.Sequence, a.Component)).ToDictionary(g => g.Key, g => g.Sum(a => a.Amount));
            foreach (var plan in plans)
            {
                var business = businesses[plan.BusinessId!]; var actualPrincipal = allocations.Where(a => a.PlanId == plan.Id && a.Component == "Principal").Sum(a => a.Amount);
                if (Math.Abs(balances[business.ContractAccountId]) != Math.Max(0, plan.Principal - actualPrincipal)) { debtWarnings.Add(new { sourceId = plan.Id, reason = "真实本金与核对后的计划本金不一致，请先更正或核对；当前不纳入借贷预测" }); continue; }
                foreach (var row in JsonSerializer.Deserialize<DebtScheduleRow[]>(plan.ScheduleJson, Json)!.Where(r => r.Date >= start && r.Date < end))
                {
                    var amount = Math.Max(0, row.Principal - paid.GetValueOrDefault((plan.Id, row.Sequence, "Principal"))) + Math.Max(0, row.Fee - paid.GetValueOrDefault((plan.Id, row.Sequence, "Fee"))); if (amount == 0) continue;
                    if (events.Any(e => e.AccountId == plan.AccountId && e.Date == row.Date && e.Type == (business.Kind == "Borrowed" ? "Expense" : "Income") && e.Source != "Scenario")) { debtWarnings.Add(new { sourceId = plan.Id, reason = "同账户同日已有手工收支，可能重复；本期借贷计划暂不纳入，请核对来源" }); continue; }
                    events.Add(new("loan-plan:" + plan.Id + ":" + row.Sequence, row.Date, plan.Name, business.Kind == "Borrowed" ? "Expense" : "Income", plan.AccountId, null, amount, currency, null, "LoanPlan", "Estimated"));
                }
            }
        }
        var rules = await db.RecurringRules.AsNoTracking().Where(x => x.UserId == user).ToDictionaryAsync(x => x.Id);
        var payloads = rules.ToDictionary(x => x.Key, x => JsonSerializer.Deserialize<SaveTransaction>(x.Value.PayloadJson, Json)!);
        var occurrences = await db.RecurringOccurrences.AsNoTracking().Where(x => x.UserId == user && x.ScheduledAt >= new DateTimeOffset(start.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)) && x.ScheduledAt < new DateTimeOffset(end.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8))).ToDictionaryAsync(x => x.Id);
        var unresolved = debtWarnings; var calendars = new List<CalendarItem>();
        for (var cursor = start; cursor < end;)
        {
            ct.ThrowIfCancellationRequested();
            var next = cursor.AddDays(Math.Min(90, end.DayNumber - cursor.DayNumber));
            var p = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = new DateTimeOffset(cursor.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)).ToString("o"), ["end"] = new DateTimeOffset(next.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)).ToString("o") });
            calendars.AddRange(await CalendarRows(user, p)); cursor = next;
        }
        foreach (var c in calendars.DistinctBy(x => x.Id).Where(x => x.Source != "CreditCard" && x.TransactionId == null && x.State is "Pending" or "Planned" or "Overdue" or "Failed"))
        {
            var t = c.OccurrenceId != null && occurrences.TryGetValue(c.OccurrenceId, out var occurrence) ? JsonSerializer.Deserialize<SaveTransaction>(occurrence.PreparedPayloadJson ?? occurrence.PayloadJson, Json)! : payloads[c.RuleId];
            var date = DateOnly.FromDateTime(c.At.ToOffset(TimeSpan.FromHours(8)).DateTime);
            if (t.Type is not ("Income" or "Expense" or "Transfer" or "CreditCardPayment")) { unresolved.Add(new { sourceId = c.Id, reason = "来源交易类型暂不支持现金流投影" }); continue; }
            var received = t.ReceivedAmount == null ? null : (decimal?)Money(t.ReceivedAmount);
            events.Add(new("recurring:" + c.RuleId + ":" + (c.OccurrenceId != null ? occurrences[c.OccurrenceId].Sequence.ToString() : c.Id.Split(':').Last()), date, c.Name, t.Type, t.AccountId, t.ToAccountId, Money(c.Amount), c.Currency, received, c.Source, "Certain", Money(t.Fee ?? "0")));
        }
        var fundingId = query["creditFundingAccountId"].ToString(); Account? funding = null;
        if (fundingId.Length > 0) { funding = await Account(user, fundingId); Require(funding.Currency == currency && AccountKinds.IsLiquid(funding.Type), "信用卡预测付款账户应为同币种现金账户"); }
        foreach (var c in calendars.DistinctBy(x => x.Id).Where(x => x.Source == "CreditCard" && x.Currency == currency))
        {
            var date = DateOnly.FromDateTime(c.At.ToOffset(TimeSpan.FromHours(8)).DateTime);
            // Calendar is an aggregate, never an additional independent recurring source.
            var plannedPayments = events.Where(x => x.Type is "CreditCardPayment" or "Transfer" && x.ToAccountId == c.AccountId && x.Currency == currency && x.Date <= date && x.Source != "Scenario").Sum(x => x.ReceivedAmount ?? x.Amount);
            var remaining = Math.Max(0, PlanningDecimal(c.Amount) - plannedPayments); if (remaining == 0) continue;
            if (funding == null) { unresolved.Add(new { sourceId = c.Id, name = c.Name, date, amount = M(remaining), currency, reason = "请指定信用卡预测付款账户；当前未假设现金流出账户" }); continue; }
            events.Add(new(c.Id, date, c.Name, "CreditCardPayment", funding.Id, c.AccountId, remaining, currency, null, "CreditCard", "Certain"));
        }
        foreach (var e in events.Where(e => allAccounts[e.AccountId].Status != "Active" || e.ToAccountId != null && allAccounts[e.ToAccountId].Status != "Active")) unresolved.Add(new { sourceId = e.Id, name = e.Name, reason = "来源或目标账户已停用，计划暂不纳入预测，请先调整计划账户" });
        events = events.Where(e => allAccounts[e.AccountId].Status == "Active" && (e.ToAccountId == null || allAccounts[e.ToAccountId].Status == "Active")).DistinctBy(x => x.Id).OrderBy(x => x.Date).ThenBy(x => x.Id).ToList(); Require(events.Count <= 4000, "预测事件过多，请缩小范围");
        var duplicateLoans = events.Where(e => e.Source == "LoanPlan" && events.Any(other => other.Id != e.Id && other.Source != "LoanPlan" && other.Source != "Scenario" && other.AccountId == e.AccountId && other.Date == e.Date && other.Type == e.Type)).ToArray();
        foreach (var duplicate in duplicateLoans) { unresolved.Add(new { sourceId = duplicate.Id, reason = "同账户同日存在其他手工或周期收支，借贷计划疑似重复，暂不计入" }); events.Remove(duplicate); }
        if (scenarioId.Length > 0)
        {
            var scenario = await db.Set<CashFlowScenario>().AsNoTracking().SingleAsync(x => x.UserId == user && x.Id == scenarioId);
            var changes = JsonSerializer.Deserialize<ScenarioSourceChange[]>(string.IsNullOrWhiteSpace(scenario.ChangesJson) ? "[]" : scenario.ChangesJson, Json) ?? [];
            foreach (var change in changes)
            {
                if (change.SourceId.StartsWith("reserve:")) continue;
                var index = events.FindIndex(x => x.Id == change.SourceId && x.Source != "Scenario" && x.Currency == currency);
                if (index < 0) { unresolved.Add(new { sourceId = change.SourceId, reason = "情景替换来源未出现在本期预测，请核对范围或重新计算来源" }); continue; }
                var source = events[index];
                if (source.Type is not ("Income" or "Expense")) { unresolved.Add(new { sourceId = change.SourceId, reason = "仅普通收入或支出允许替换，债务或转账需单独明确合同计划" }); continue; }
                var replacement = Money(change.Amount);
                events[index] = source with { Amount = replacement, Source = "ScenarioReplacement", Certainty = "Scenario" };
            }
        }
        var chosenIds = chosen.Select(x => x.Id).ToHashSet(); var selectedEvents = events.Where(x => chosenIds.Contains(x.AccountId) || x.ToAccountId != null && chosenIds.Contains(x.ToAccountId)).ToArray();
        var overdueManual = await db.Set<FutureCashFlowItem>().AsNoTracking().CountAsync(x => x.UserId == user && x.State == "Planned" && x.ScenarioId == null && x.ExpectedDate < start && (chosenIds.Contains(x.AccountId) || x.ToAccountId != null && chosenIds.Contains(x.ToAccountId)));
        var overdueRecurring = await db.RecurringOccurrences.AsNoTracking().CountAsync(x => x.UserId == user && (x.State == "Pending" || x.State == "Failed") && x.ScheduledAt < new DateTimeOffset(start.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)) && x.Currency == currency);
        if (overdueManual + overdueRecurring > 0) unresolved.Add(new { sourceId = "overdue", reason = $"{overdueManual}笔手工计划、{overdueRecurring}笔周期实例已逾期且未过账；请明确新的预计日期后纳入，系统不擅自移动付款日期" });
        decimal Delta(ForecastEvent e, string id) => e.AccountId == id ? e.Type == "Income" ? e.Amount : -e.Amount - e.Fee : e.ToAccountId == id ? e.ReceivedAmount ?? e.Amount : 0;
        var plotPoints = Math.Clamp(configuration?.GetValue<int>("Finance:ForecastPlotPoints") ?? 1000, 2, 100000);
        var results = chosen.ToDictionary(a => a.Id, a => CashFlowMath.Calculate(balances[a.Id], start, end, selectedEvents.Select(e => new ForecastDelta(e.Date, Delta(e, a.Id), e.Id)), ct, plotPoints));
        var consolidated = CashFlowMath.Calculate(chosen.Sum(a => balances[a.Id]), start, end, selectedEvents.Select(e => new ForecastDelta(e.Date, chosen.Sum(a => Delta(e, a.Id)), e.Id)), ct, plotPoints);
        var reserve = await db.Set<GoalAllocation>().AsNoTracking().Where(x => x.UserId == user && chosenIds.Contains(x.AccountId)).SumAsync(x => (decimal?)x.Amount) ?? 0;
        if (scenarioId.Length > 0)
        {
            var scenario = await db.Set<CashFlowScenario>().AsNoTracking().SingleAsync(x => x.UserId == user && x.Id == scenarioId);
            var changes = JsonSerializer.Deserialize<ScenarioSourceChange[]>(string.IsNullOrWhiteSpace(scenario.ChangesJson) ? "[]" : scenario.ChangesJson, Json) ?? [];
            var reserveChange = changes.SingleOrDefault(x => x.SourceId == "reserve:" + currency);
            if (reserveChange != null) reserve = Money(reserveChange.Amount);
        }
        var liquidIds = chosen.Where(x => AccountKinds.IsLiquid(x.Type)).Select(x => x.Id).ToHashSet();
        var openingCash = chosen.Where(x => liquidIds.Contains(x.Id)).Sum(a => balances[a.Id]);
        var activeFundHolds = await db.Set<AccountFundHold>().AsNoTracking().Where(x => x.UserId == user && liquidIds.Contains(x.AccountId) && x.State == "Confirmed").ToArrayAsync();
        var unavailableFunds = activeFundHolds.Sum(FundHoldRules.AvailabilityDeduction);
        var committed = selectedEvents.Sum(x => CashFlowMath.Commitment(x.Type, x.Amount, x.Fee, liquidIds.Contains(x.AccountId), x.ToAccountId != null && liquidIds.Contains(x.ToAccountId)));
        var (page, size) = Paging(query);
        return new
        {
            currency, start, endExclusive = end, calculatedAt = DateTimeOffset.UtcNow, scenarioId = scenarioId.Length == 0 ? null : scenarioId,
            sampled = consolidated.Sampled, samplingRule = "长期图表保留全部非零事件日及均匀采样日期；缺口日期列表为展示样本，汇总、期末余额和最低余额仍按全部事件精确计算。",
            opening = M(consolidated.Opening), inflow = M(consolidated.Inflow), outflow = M(consolidated.Outflow), closing = M(consolidated.Closing), minimum = M(consolidated.Minimum), minimumDate = consolidated.MinimumDate,
            reserved = M(reserve), availableCash = M(openingCash), nearTermCommitments = M(committed), freelyAvailable = M(openingCash - reserve - committed),
            confirmedUnavailableFunds = M(unavailableFunds), availableCashAfterFundHolds = M(openingCash - unavailableFunds),
            fundStatusRule = "冻结仅解释当前可用余额，不生成未来现金事件；计划付款可能与冻结重叠，不把冻结与目标预留、未来承诺机械重复相减。原预测仍按实际账面资金与明确计划计算。",
            days = consolidated.Days.Select(d => new { date = d.Date, inflow = M(d.Inflow), outflow = M(d.Outflow), balance = M(d.Balance) }),
            accounts = chosen.Select(a => new { a.Id, a.Name, a.Type, a.Currency, opening = M(results[a.Id].Opening), closing = M(results[a.Id].Closing), minimum = M(results[a.Id].Minimum), minimumDate = results[a.Id].MinimumDate, gap = M((a.Type == "CreditCard" || a.Type == "ConsumerCredit") ? Math.Max(0, -results[a.Id].Minimum - (a.CreditLimit ?? 0)) : Math.Max(0, -results[a.Id].Minimum)) }),
            gaps = chosen.SelectMany(a => results[a.Id].Days.Where(d => (a.Type == "CreditCard" || a.Type == "ConsumerCredit") ? a.CreditLimit.HasValue && d.Balance < -a.CreditLimit : d.Balance < 0).Select(d => new { accountId = a.Id, a.Name, date = d.Date, amount = M((a.Type == "CreditCard" || a.Type == "ConsumerCredit") ? -d.Balance - a.CreditLimit!.Value : -d.Balance), kind = (a.Type == "CreditCard" || a.Type == "ConsumerCredit") ? "CreditLimit" : "CashShortage" })),
            events = new { items = selectedEvents.Skip((page - 1) * size).Take(size).Select(e => new { e.Id, e.Date, e.Name, e.Type, e.AccountId, e.ToAccountId, amount = M(e.Amount), e.Currency, receivedAmount = e.ReceivedAmount.HasValue ? M(e.ReceivedAmount.Value) : null, e.Source, e.Certainty, fee = M(e.Fee) }), total = selectedEvents.Length, page, pageSize = size }, unresolved,
            assumptions = "起始余额来自实时账本；仅活动账户，辅助债权债务账户排除。自由现金只采用现金、银行、支付宝、微信及电子钱包账户，不把投资账户或信用额度视为自由现金。结束日期不包含，Asia/Shanghai业务日期，同日事件按净额计算日末余额，不保证日内最低余额。同币种选中账户内部转账本金抵销；跨币种分别投影，无汇率合并。周期/订阅使用同一稳定来源键，日历仅聚合；已过账实例退出。信用卡账期仅预测未被计划还款覆盖的余额，并需明确付款账户。借贷没有实际到期字段，不凭空生成事件，可手工录入计划。自由资金为现金余额减预留与期间计划付款，不提前计入预计收入；待完善来源不纳入金额，存在待完善来源时此数值仅为已纳入计划的估计。"
        };
    }
}





