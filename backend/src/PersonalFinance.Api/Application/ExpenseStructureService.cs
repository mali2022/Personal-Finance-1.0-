using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record AnalysisAttributeInput(string? Id, string? CategoryId, string? TransactionId, string Behavior, string Note);
public sealed partial class FinanceService
{
    public async Task<object> AnalysisAttributes(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<TransactionAnalysisAttribute>().AsNoTracking().Where(x => x.UserId == user);
        return new { items = (await q.OrderBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync()).Select(x => new { x.Id, x.CategoryId, x.TransactionId, x.Behavior, x.Note, version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveAnalysisAttribute(string user, AnalysisAttributeInput input, string? version)
    {
        Require((input.CategoryId == null) != (input.TransactionId == null) && input.Note is { Length: <= 2000 }, "请选择一个分类或交易，备注最多2000字");
        string kind;
        if (input.CategoryId != null) { var c = await db.Categories.SingleOrDefaultAsync(x => x.UserId == user && x.Id == input.CategoryId) ?? throw new ApiException(404, "分类不存在"); kind = c.Kind; }
        else { var t = await Transaction(user, input.TransactionId!); Require(t.Status != "Deleted" && t.Type is "Expense" or "Income", "仅允许有效收入或消费，退款继承原消费"); kind = t.Type; }
        Require(kind is "Expense" or "Income" && (input.Behavior == "Unknown" || (kind == "Expense" ? input.Behavior is "FixedExpense" or "VariableExpense" : input.Behavior is "FixedIncome" or "VariableIncome" or "OneTimeIncome" or "OtherIncome")), "分析属性与收支类型不匹配");
        var row = input.Id == null ? new TransactionAnalysisAttribute { UserId = user } : await db.Set<TransactionAnalysisAttribute>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == input.Id) ?? throw new ApiException(404, "分析属性不存在");
        Require(!await db.Set<TransactionAnalysisAttribute>().AnyAsync(x => x.UserId == user && x.Id != row.Id && (input.CategoryId != null && x.CategoryId == input.CategoryId || input.TransactionId != null && x.TransactionId == input.TransactionId)), "已有属性，请编辑原记录");
        if (input.Id == null) { Require(version == "0", "新属性版本应为0"); db.Add(row); } else { Version(row, version); row.Version++; }
        row.CategoryId = input.CategoryId; row.TransactionId = input.TransactionId; row.Behavior = input.Behavior; row.Note = input.Note; row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    private sealed record StructureTotal(string Behavior, decimal Amount, int Index);
    private async Task<List<StructureTotal>> StructureTotals(string user, DateTimeOffset start, DateTimeOffset end, string currency, bool income, List<ReportPeriod> periods)
    {
        var transactions = Range(user, start, end.AddTicks(-1), currency); var rules = await Rules(user);
        var policies = db.Set<TransactionAnalysisAttribute>().Where(x => x.UserId == user);
        var entries = income ? db.Entries.Where(e => e.Kind == "Income") : StatisticalExpenses(transactions, rules);
        var classified = from e in entries join t in transactions on e.TransactionId equals t.Id
                         join cat in db.Categories on e.CategoryId equals cat.Id into cats from cat in cats.DefaultIfEmpty()
                         join parent in db.Categories on cat.ParentId equals parent.Id into parents from parent in parents.DefaultIfEmpty()
                         join tp in policies.Where(x => x.TransactionId != null) on (t.Type == "Refund" ? t.OriginalTransactionId : t.Id) equals tp.TransactionId into tps from tp in tps.DefaultIfEmpty()
                         join cp in policies.Where(x => x.CategoryId != null) on e.CategoryId equals cp.CategoryId into cps from cp in cps.DefaultIfEmpty()
                         join pp in policies.Where(x => x.CategoryId != null) on cat.ParentId equals pp.CategoryId into pps from pp in pps.DefaultIfEmpty()
                         join gp in policies.Where(x => x.CategoryId != null) on parent.ParentId equals gp.CategoryId into gps from gp in gps.DefaultIfEmpty()
                         select new { id = t.Id, behavior = tp != null ? tp.Behavior : cp != null ? cp.Behavior : pp != null ? pp.Behavior : gp != null ? gp.Behavior : "Unknown", amount = income ? -e.Amount : e.Amount };
        var windows = PeriodRelation(user, periods);
        var rows = await (from c in classified join w in windows on c.id equals w.Id group c by new { c.behavior, w.Index } into g select new { g.Key.behavior, g.Key.Index, amount = g.Sum(x => x.amount) }).ToArrayAsync();
        var result = rows.Select(x => new StructureTotal(x.behavior, x.amount, x.Index)).ToList();
        if (!income && (rules.IncludeAssetLoss || rules.IncludeDecreasingAdjustments)) {
            var includeLoss = rules.IncludeAssetLoss; var includeAdjustments = rules.IncludeDecreasingAdjustments;
            var extras = await (from t in transactions join w in windows on t.Id equals w.Id where includeLoss && t.Type == "AssetLoss" || includeAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease" group t by w.Index into g select new { index = g.Key, amount = g.Sum(x => x.Amount) }).ToArrayAsync();
            result.AddRange(extras.Select(x => new StructureTotal("OtherStatisticalExpense", x.amount, x.index)));
        }
        return result;
    }
    public async Task<object> ExpenseStructure(string user, IQueryCollection query, bool income)
    {
        var (start, end) = IndicatorRange(query); var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var periods = ReportPeriods(start, end.AddTicks(-1), "month"); Require(periods.Count <= 12, "结构趋势最多12个月");
        var rows = await StructureTotals(user, start, end, currency, income, periods); var total = rows.Sum(x => x.Amount); var totals = await Totals(user, Range(user, start, end.AddTicks(-1), currency));
        var trend = new List<object>(); var monthlyAmounts = new List<decimal>(); var recordedMonths = 0;
        var byPeriod = rows.ToLookup(x => x.Index);
        foreach (var p in periods) { var parts = byPeriod[p.Index].ToArray(); monthlyAmounts.Add(parts.Sum(x => x.Amount)); if (parts.Length > 0) recordedMonths++; trend.Add(new { period = p.Start.ToString("yyyy-MM"), items = parts.Select(x => new { x.Behavior, amount = M(x.Amount) }) }); }
        var fixedExpense = rows.Where(x => x.Behavior == "FixedExpense").Sum(x => x.Amount);
        var range = Range(user, start, end.AddTicks(-1), currency);
        var sourceAmounts = income ? await (from e in db.Entries join t in range on e.TransactionId equals t.Id where e.Kind == "Income" group e by e.CategoryId into g select new { id = g.Key, amount = -g.Sum(x => x.Amount) }).ToArrayAsync() : [];
        var suggestions = !income ? await range.Where(x => x.Type == "Expense" && x.Merchant != null).GroupBy(x => x.Merchant!).Where(g => g.Count() >= 3).Select(g => new { merchant = g.Key, count = g.Count() }).OrderByDescending(x => x.count).Take(10).ToArrayAsync() : [];
        var sourceRules = await db.RecurringRules.AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.State == "Active").OrderBy(x => x.Id).Take(100).ToArrayAsync();
        var subscriptionRuleIds = await db.Subscriptions.AsNoTracking().Where(x => x.UserId == user && x.State == "Active").Select(x => x.RuleId).ToArrayAsync();
        var recurringSuggestions = sourceRules.Select(x => new { rule = x, payload = System.Text.Json.JsonSerializer.Deserialize<SaveTransaction>(x.PayloadJson, Json)! }).Where(x => x.payload.Type == (income ? "Income" : "Expense")).Select(x => new { x.rule.Id, x.rule.Name, x.rule.CategoryId, source = subscriptionRuleIds.Contains(x.rule.Id) ? "Subscription" : "Recurring", suggestedBehavior = income ? "FixedIncome" : "FixedExpense", reason = "已登记周期来源，仅建议人工核对固定性质；不自动修改分析属性或过账" }).ToArray();
        return new { currency, start, endExclusive = end, total = M(total), items = rows.GroupBy(x => x.Behavior).Select(g => new { behavior = g.Key, amount = M(g.Sum(x => x.Amount)), share = total > 0 ? M(g.Sum(x => x.Amount) / total * 100) : null }),
            fixedExpenseIncomeRatio = !income && totals.income > 0 ? M(fixedExpense / totals.income * 100) : null,
            fixedIncomeRatio = income && totals.income > 0 ? M(rows.Where(x => x.Behavior == "FixedIncome").Sum(x => x.Amount) / totals.income * 100) : null,
            averageMonthlyIncome = income ? M(total / periods.Count) : null, incomeVolatilityRange = income ? M(monthlyAmounts.Max() - monthlyAmounts.Min()) : null,
            incomeSourceConcentration = income && total > 0 && sourceAmounts.Length > 0 ? M(sourceAmounts.Max(x => x.amount) / total * 100) : null,
            recurringSuggestions, incomeSourceBasis = "按收入分类ID衡量集中度；分类未必等于实际雇主，请按需要配置分类。",
            suggestions = suggestions.Select(x => new { x.merchant, x.count, suggestedBehavior = "FixedExpense", reason = "期间至少3次消费，仅提示检查是否固定费用，频率不能证明合同性质；须人工配置" }),
            trend, sampleMonths = periods.Count, recordedMonths, sampleWarning = recordedMonths < 6 ? "有收支记录的样本不足6个月；不能据此承诺未来稳定性" : "记录月份不证明数据完整；历史分析不能承诺未来收入", explanation = "交易覆盖优先，其次分类、父分类；退款继承原消费交易覆盖，但按退款分录分类归属。Unknown独立展示。资产损失及余额调减作为其他统计费用单列。净负费用不截断，占比可为负。月均包括零记录月份；波动范围=月度最高收入−最低收入，非风险评分。建议必须人工确认，不自动改变已发生事实。" };
    }
}
