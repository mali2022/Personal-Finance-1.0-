using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record AssetComponent(string Id, string Name, string Type, string Currency, decimal? Value, string? Missing, DateOnly? ValuationDate, string? Source);
public sealed partial class FinanceService
{
    public async Task<object> AssetAllocation(string user, IQueryCollection query)
    {
        var text = query["date"].ToString(); Require(text == "" || DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "日期格式无效");
        var date = text == "" ? AssetToday : DateOnly.ParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture); AssetDate(date);
        var target = query["currency"].ToString(); if (target != "") AssetCurrency(target);
        var end = new DateTimeOffset(date.ToDateTime(TimeOnly.MaxValue), TimeSpan.FromHours(8));
        var accounts = await db.Accounts.AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var balances = await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.UserId == user && t.UserId == user && e.Kind == "Account" && t.Status != "Deleted" && t.OccurredAt <= end group e by e.AccountId into g select new { Id = g.Key!, Value = g.Sum(e => e.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Value);
        var policies = await db.Set<AssetAggregationPolicy>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var managed = await db.Set<ManagedAsset>().AsNoTracking().Where(x => x.UserId == user && x.AcquiredDate <= date).ToArrayAsync();
        var physicalSnapshot = await LoadPhysicalSnapshot(user);
        var components = new List<AssetComponent>();
        foreach (var a in accounts)
        {
            if(managed.Any(x=>x.Type!="TermDeposit" && x.AccountId==a.Id)) continue;
            var balance = a.OpeningBalance + balances.GetValueOrDefault(a.Id);
            var mode = policies.SingleOrDefault(x => x.AccountId == a.Id)?.Mode ?? "Unknown";
            var term = managed.SingleOrDefault(x => x.AccountId == a.Id && x.State == "Active" && x.Type == "TermDeposit");
            if (term != null && balance > term.Cost)
            {
                components.Add(new(a.Id + ":term", a.Name + "（存款本金）", "TermDeposit", a.Currency, term.Cost, null, date, "专用账户内登记本金，剩余金额另归银行存款"));
                components.Add(new(a.Id, a.Name + "（其余余额）", "Bank", a.Currency, balance-term.Cost, null, date, "原账户余额扣除已归属定期本金"));
                continue;
            }
            components.Add(new(a.Id, a.Name, balance < 0 ? "Liability" : term != null ? "TermDeposit" : a.Type == "Bank" ? "Bank" : a.Type is "Cash" or "Alipay" or "WeChat" or "StoredValue" or "CreditCard" or "ElectronicWallet" or "ConsumerCredit" ? "Cash" : "Other", a.Currency, a.Type == "Investment" && mode == "Unknown" ? null : balance, a.Type == "Investment" && mode == "Unknown" ? "投资账户余额语义待确认" : null, date, "现有账户及有效资金分录；历史期初生效日期未知"));
        }
        var assets = await db.Set<InvestmentAsset>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var trades = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && x.State == "Active" && x.SettlementDate <= date).ToArrayAsync(); Require(trades.Length <= 100000, "投资历史超过汇总上限");
        var prices = await db.Set<InvestmentValuation>().AsNoTracking().Where(x => x.UserId == user && x.Date <= date && !db.Set<InvestmentValuation>().Any(v => v.UserId == user && v.AssetId == x.AssetId && v.Date <= date && v.Date > x.Date)).ToArrayAsync();
        foreach (var a in assets)
        {
            var cost = InvestmentMath.Calculate(trades.Where(x => x.AssetId == a.Id)); if (cost.Quantity == 0) continue;
            var mode = policies.SingleOrDefault(x => x.AccountId == a.AccountId)?.Mode ?? "Unknown";
            if (mode == "TotalAssets") continue;
            var v = prices.SingleOrDefault(x => x.AssetId == a.Id);
            components.Add(new(a.Id, a.Name, a.Type, a.Currency, mode == "CashOnly" && v != null ? InvestmentMath.Gross(cost.Quantity, v.Price) : null, mode == "Unknown" ? "账户余额语义待确认" : v == null ? "暂无估值" : null, v?.Date, v?.Source));
        }
        var physicalValues = await db.Set<ManagedAssetValuation>().AsNoTracking().Where(x => x.UserId == user && x.Date <= date).ToArrayAsync();
        foreach (var a in managed.Where(x => x.Type != "TermDeposit"))
        {
            var v = physicalSnapshot.Value(a, date);
            if (v.State == "Archived" || v.Quantity == 0) continue;
            components.Add(new(a.Id, a.Name, a.Type, a.Currency, v.Value, v.Value == null ? "暂无估值" : null, v.ValuationDate, v.Source));
        }
        var fx = await db.Set<FxValuationRate>().AsNoTracking().Where(x => x.UserId == user && x.Date <= date && (target == "" || x.TargetCurrency == target)).ToArrayAsync();
        var rows = components.Select(x => { var rate = FxRateSelection.Select(fx, x.Currency, target, date); decimal? converted = x.Value == null ? null : target == "" || target == x.Currency ? x.Value : rate == null ? null : decimal.Round(x.Value.Value * rate.Rate, 2, MidpointRounding.AwayFromZero); return new { x.Id, x.Name, x.Type, x.Currency, originalAmount = x.Value == null ? null : M(x.Value.Value), amount = converted == null ? null : M(converted.Value), reportCurrency = target == "" ? x.Currency : target, missing = x.Missing ?? (converted == null ? "缺少指定日期以前的直接汇率" : null), x.ValuationDate, x.Source, rate = target == x.Currency ? "1" : rate == null ? null : D(rate.Rate), rateDate = rate?.Date, rateSource = rate?.Source, stale = x.ValuationDate < date.AddDays(-90) }; }).ToArray();
        var groups = rows.Where(x => x.amount != null).GroupBy(x => x.reportCurrency).Select(g => { decimal Value(string? v) => decimal.Parse(v!, CultureInfo.InvariantCulture); var asset = g.Where(x => Value(x.amount) > 0).Sum(x => Value(x.amount)); var liability = -g.Where(x => Value(x.amount) < 0).Sum(x => Value(x.amount)); return new { currency = g.Key, assets = M(asset), liabilities = M(liability), netWorth = M(asset - liability), allocation = g.Where(x => Value(x.amount) > 0).GroupBy(x => x.Type).Select(t => new { type = t.Key, amount = M(t.Sum(x => Value(x.amount))), percent = asset == 0 ? null : D(t.Sum(x => Value(x.amount)) / asset * 100) }) }; });
        return new { date, items = rows, groups, complete = rows.All(x => x.missing == null), uncovered = rows.Count(x => x.missing != null), policies = policies.Select(x => new { x.AccountId, x.Mode, x.Reason, version = x.Version.ToString() }), scope = "账户原币余额复用E净资产口径；证券只加到已确认CashOnly账户，TotalAssets不再加持仓；定期本金只计账户，实物复用资产中心按日规则与生命周期估值，关联的专用实物账户不重复计入。缺口不计入已覆盖汇总。历史账户期初及归档状态缺少完整生效历史，历史绝对净资产仅供估算。" };
    }
    private static QueryCollection CustomQuery(CustomReportInput b)
    {
        Require(b.Name.Trim().Length is > 0 and <= 150 && b.GroupBy is "category" or "parentCategory" or "account" or "merchant" or "month" or "year" or "date" or "project" or "tag" or "type" or "currency", "报表名称或分组字段无效"); AssetCurrency(b.Currency);
        Require(b.Theme is "Ledger" or "Investment" or "InvestmentReturns" or "Assets" or "Budget" && b.Sort is "label" or "income" or "expense" && b.ChartType is "table" or "bar" or "line" or "pie", "报表主题、排序或图表无效");
        Require((b.Metrics ?? ["income", "expense", "surplus"]).All(x => new[] { "income", "expense", "surplus", "count", "average", "inflow", "outflow", "marketValue", "realized", "unrealized", "assets", "liabilities", "netWorth", "amount", "budget", "used", "executionPercent", "xirrPercent", "totalProfit" }.Contains(x)), "报表指标不在白名单");
        Require(b.TransactionType == null || new[] { "Expense", "Income", "Refund", "Transfer", "CreditCardPayment", "InvestmentPrincipal" }.Contains(b.TransactionType), "交易类型筛选无效");
        Require(b.Metrics == null || b.Metrics.All(x => x is not ("xirrPercent" or "totalProfit") || b.Theme == "InvestmentReturns"), "收益率指标仅适用于投资收益率主题");
        Require(DateOnly.TryParseExact(b.Start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) && DateOnly.TryParseExact(b.End, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var finish), "报表日期格式无效");
        start = DateOnly.ParseExact(b.Start, "yyyy-MM-dd", CultureInfo.InvariantCulture); var end = DateOnly.ParseExact(b.End, "yyyy-MM-dd", CultureInfo.InvariantCulture); Require(end >= start && start.Year >= 1901 && end.Year <= 9997, "报表日期范围无效");
        return new QueryCollection(new Dictionary<string, StringValues> { ["start"] = b.Start + "T00:00:00+08:00", ["end"] = b.End + "T23:59:59.9999999+08:00", ["currency"] = b.Currency, ["accountId"] = b.AccountId ?? "", ["categoryId"] = b.CategoryId ?? "", ["projectId"] = b.ProjectId ?? "", ["merchant"] = b.Merchant ?? "", ["tagId"] = b.TagId ?? "", ["type"] = b.TransactionType ?? "" });
    }
    public async Task<object> CustomReportPreview(string user, CustomReportInput b, DateTimeOffset? asOf = null)
    {
        var query = CustomQuery(b);
        if (asOf is { } cutoff && Date(query["end"]!) > cutoff)
            query = new QueryCollection(query.ToDictionary(x => x.Key, x => x.Key == "end" ? new StringValues(cutoff.ToString("O")) : x.Value));
        if (b.Theme == "Budget") return await CustomBudgetReport(user, b);
        if (b.Theme == "InvestmentReturns") return await CustomInvestmentReturnReport(user, b, asOf);
        if (b.Theme == "Investment")
        {
            var perfQuery = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = b.Start, ["end"] = b.End, ["currency"] = b.Currency });
            var perf = JsonSerializer.SerializeToElement(await InvestmentPerformance(user, perfQuery), Json);
            var resultRows = perf.GetProperty("assets").EnumerateArray().Select(x => new { key = x.GetProperty("id").GetString(), label = x.GetProperty("name").GetString(), income = "0.00", expense = "0.00", count = 0, marketValue = x.GetProperty("marketValue").GetString(), realized = x.GetProperty("realizedInPeriod").GetString(), unrealized = x.GetProperty("unrealized").GetString() }).ToArray();
            return new { b.Start, b.End, b.Currency, b.Theme, b.GroupBy, b.Metrics, income = "0.00", expense = "0.00", surplus = "0.00", rows = resultRows, scope = "投资资产主题：按资产分组、原币统计；marketValue与unrealized为期末，realized为期间值。未知估值返回空，不输出无依据的合并收益率。" };
        }
        if (b.Theme == "Assets")
        {
            var allocationQuery = new QueryCollection(new Dictionary<string, StringValues> { ["date"] = b.End, ["currency"] = b.Currency });
            var allocation = JsonSerializer.SerializeToElement(await AssetAllocation(user, allocationQuery), Json);
            var resultRows = allocation.GetProperty("items").EnumerateArray().Select(x => new { key = x.GetProperty("id").GetString(), label = x.GetProperty("name").GetString(), income = "0.00", expense = "0.00", count = 0, amount = x.GetProperty("amount").GetString(), missing = x.GetProperty("missing").GetString() }).ToArray();
            return new { b.Start, b.End, b.Currency, b.Theme, b.GroupBy, b.Metrics, income = "0.00", expense = "0.00", surplus = "0.00", rows = resultRows, valuation = allocation, scope = "资产估值主题：截止结束日期，复用E综合估值的同一汇总服务；只统计已覆盖部分，缺口逐项列明。" };
        }
        var transactions = await Filter(user, query); var (income, expense) = await Totals(user, transactions,b.AccountId==null?null:[b.AccountId]); var rules = await Rules(user);
        // Project only controlled statistical entries; no SQL or expressions from a report definition.
        var entries = await (from e in db.Entries join t in transactions on e.TransactionId equals t.Id where (e.Kind == "Income" || e.Kind == "Expense" && (rules.IncludeFees || (t.FeeCategoryId == null || e.CategoryId != t.FeeCategoryId))) && (b.AccountId==null || (e.AccountId??t.AccountId)==b.AccountId) select new CustomLedgerEntry(e.Kind, e.Amount, e.CategoryId, t.Id, e.AccountId??t.AccountId, t.Merchant, t.OccurredAt, t.ProjectId, t.Type, t.Currency)).Take(100001).ToArrayAsync();
        Require(entries.Length <= 100000, "报表明细超过计算上限，请缩小日期范围");
        var rows = await CustomLedgerGroups(user, b, entries);
        rows = b.Sort == "income" ? rows.OrderByDescending(x=>Money(x.income)).ToArray() : b.Sort == "expense" ? rows.OrderByDescending(x=>Money(x.expense)).ToArray() : rows.OrderBy(x=>x.label).ToArray();
        var flowParameters = query.ToDictionary(x=>x.Key,x=>x.Value); flowParameters.Remove("currency");
        var flowTransactions = await Filter(user,new QueryCollection(flowParameters));
        var flowQuery = from e in db.Entries join t in flowTransactions on e.TransactionId equals t.Id where e.Kind == "Account" && e.Currency == b.Currency && (b.AccountId == null || e.AccountId == b.AccountId) select e.Amount;
        var inflow = await flowQuery.Where(x=>x>0).SumAsync(x=>(decimal?)x) ?? 0;
        var outflow = -(await flowQuery.Where(x=>x<0).SumAsync(x=>(decimal?)x) ?? 0);
        return new { b.Start, b.End, b.Currency, b.Theme, b.GroupBy, b.Metrics, inflow = M(inflow), outflow = M(outflow), income = M(income), expense = M(expense), surplus = M(income - expense), rows, scope = "有效资金分录；退款保留负消费，拆分按分类分录。汇总遵从现有统计规则；单列调整/损失可能只在总额中，不在分类分组中。投资本金不计收支。" };
    }
    public async Task<object> SaveCustomReport(string user, CustomReportInput b, string? id, string? version)
    {
        CustomQuery(b); var r = id == null ? new CustomReportDefinition { UserId = user } : await db.Set<CustomReportDefinition>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "报表不存在");
        if (id != null) { Version(r, version); r.Version++; }
        Require(!await db.Set<CustomReportDefinition>().AnyAsync(x => x.UserId == user && x.Id != r.Id && x.Name == b.Name.Trim()), "报表名称重复"); r.Name = b.Name.Trim(); r.DefinitionJson = JsonSerializer.Serialize(b, Json); r.UpdatedAt = DateTimeOffset.UtcNow; if (id == null) db.Add(r); return new { r.Id, r.Name, definition = b, version = r.Version.ToString() };
    }
    public async Task<object> CustomReports(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<CustomReportDefinition>().AsNoTracking().Where(x => x.UserId == user); var rows = await q.OrderBy(x => x.Name).Skip((page - 1) * size).Take(size).ToArrayAsync(); return new { items = rows.Select(x => new { x.Id, x.Name, definition = JsonSerializer.Deserialize<CustomReportInput>(x.DefinitionJson, Json), version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> DeleteCustomReport(string user, string id, string? version)
    {
        var r = await db.Set<CustomReportDefinition>().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==id) ?? throw new ApiException(404,"报表不存在"); Version(r,version); db.Remove(r); return new { r.Id, deleted = true };
    }
    public async Task<object> ExecuteCustomReport(string user, string id)
    {
        var r = await db.Set<CustomReportDefinition>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "报表不存在"); return await CustomReportPreview(user, JsonSerializer.Deserialize<CustomReportInput>(r.DefinitionJson, Json)!);
    }
}







