using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public static readonly string[] TransactionKinds = ["Expense", "Income", "Transfer", "CreditCardPayment", "Refund", "AssetLoss", "Adjustment", "LoanGiven", "LoanReceived", "LoanRepaymentPaid", "LoanRepaymentReceived", "ReimbursementAdvance", "ReimbursementReceived", "RewardReversal", "InvestmentPrincipal"];
    public static readonly string[] AnomalyRules = ["Extreme", "Duplicate", "Balance", "Category", "Merchant", "Refund", "Transfer", "Date"];

    // CSV fields are deliberately bounded; identifiers are always matched inside the authenticated user's query.
    public static string[] QueryValues(IQueryCollection p, string key)
    {
        var raw = p[key].ToString();
        Require(raw.Length <= 12000, "筛选参数过长");
        if (raw.Length == 0) return [];
        string[] values;
        if (key == "merchants" && raw.StartsWith('[')) {
            try {values = System.Text.Json.JsonSerializer.Deserialize<string[]>(raw) ?? throw new System.Text.Json.JsonException();}
            catch(System.Text.Json.JsonException) {throw new ApiException(422,"商户多选格式无效");}
        } else values = raw.Split(',').Select(x => x.Trim()).ToArray();
        Require(values.Length is > 0 and <= 100 && values.All(x => !string.IsNullOrWhiteSpace(x) && x.Length <= 200), "多选筛选无效，最多100项");
        return values.Distinct().ToArray();
    }

    public static (string Field, bool Descending)[] TransactionSort(string raw)
    {
        if (raw == "") raw = "occurredAt:desc";
        var parts = raw.Split(',');
        Require(parts.Length <= 3, "最多支持三个排序字段");
        var result = parts.Select(part => {
            var pair = part.Split(':');
            Require(pair.Length == 2 && pair[0] is "occurredAt" or "amount" or "createdAt" && pair[1] is "asc" or "desc", "排序参数无效");
            return (Field: pair[0], Descending: pair[1] == "desc");
        }).ToArray();
        Require(result.Select(x => x.Field).Distinct().Count() == result.Length, "排序字段不可重复");
        return result;
    }

    private static IQueryable<FinanceTransaction> SortWorkspace(IQueryable<FinanceTransaction> q, string raw)
    {
        IOrderedQueryable<FinanceTransaction>? ordered = null;
        foreach (var (field, descending) in TransactionSort(raw))
        {
            if (field == "amount") ordered = ordered == null ? descending ? q.OrderByDescending(t => t.Amount) : q.OrderBy(t => t.Amount) : descending ? ordered.ThenByDescending(t => t.Amount) : ordered.ThenBy(t => t.Amount);
            else {
                System.Linq.Expressions.Expression<Func<FinanceTransaction, DateTimeOffset>> key = field == "createdAt" ? t => t.CreatedAt : t => t.OccurredAt;
                ordered = ordered == null ? descending ? q.OrderByDescending(key) : q.OrderBy(key) : descending ? ordered.ThenByDescending(key) : ordered.ThenBy(key);
            }
        }
        return ordered!.ThenByDescending(t => t.CreatedAt).ThenByDescending(t => t.Id);
    }

    private IQueryable<FinanceTransaction> AnomalyQuery(string user, string rule)
    {
        var own = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Status != "Deleted");
        var tomorrow = DateTimeOffset.UtcNow.AddDays(1);
        return rule switch {
            "Extreme" => own.Where(t => t.Amount >= 100000),
            "Duplicate" => own.Join(own.GroupBy(t => new { t.AccountId, t.Type, t.Amount, t.Currency, t.OccurredAt, t.Merchant }).Where(g => g.Count() > 1).Select(g => g.Key), t => new { t.AccountId, t.Type, t.Amount, t.Currency, t.OccurredAt, t.Merchant }, key => key, (t, key) => t),
            "Balance" => own.Where(t => (t.Type == "Expense" || t.Type == "Income" || t.Type == "Transfer" || t.Type == "Refund" || t.Type == "CreditCardPayment") && (!t.Entries.Any(e=>e.Kind=="Account") || (t.Entries.Sum(e => (decimal?)e.BaseAmount) ?? 0) != 0)),
            "Category" => own.Where(t => (t.Type == "Expense" || t.Type == "Income") && (!t.Entries.Any(e => e.Kind == t.Type) || t.Entries.Any(e => e.Kind == t.Type && (e.CategoryId == null || !db.Categories.Any(c => c.UserId == user && c.Id == e.CategoryId && c.Kind == e.Kind))))),
            "Merchant" => own.Where(t => t.Merchant != null && db.Directory.Count(d => d.UserId == user && d.Kind == "merchants" && d.Name == t.Merchant && d.Status == "Active") > 1),
            "Refund" => own.Where(t => t.Type == "Refund" && !own.Any(o => o.Id == t.OriginalTransactionId && o.Type == "Expense" && o.Currency == t.Currency && o.OccurredAt <= t.OccurredAt)),
            "Transfer" => own.Where(t => (t.Type == "Transfer" || t.Type == "CreditCardPayment") && (t.ToAccountId == null || t.ToAccountId == t.AccountId || !t.Entries.Any(e => e.Kind == "Account" && e.AccountId == t.AccountId && e.Amount < 0) || !t.Entries.Any(e => e.Kind == "Account" && e.AccountId == t.ToAccountId && e.Amount > 0))),
            "Date" => own.Where(t => t.OccurredAt > tomorrow || t.OccurredAt < new DateTimeOffset(1900, 1, 1, 0, 0, 0, TimeSpan.Zero)),
            _ => throw new ApiException(422, "异常规则无效")
        };
    }

    private IQueryable<string> AnomalyIds(string user, string rule)
    {
        if (rule != "Any") return AnomalyQuery(user, rule).Select(t => t.Id);
        IQueryable<string> ids = AnomalyQuery(user, AnomalyRules[0]).Select(t => t.Id);
        foreach (var code in AnomalyRules.Skip(1)) ids = ids.Concat(AnomalyQuery(user, code).Select(t => t.Id));
        return ids;
    }

    // FinanceService is request-scoped: never cache financial matches across requests.
    private readonly Dictionary<(string User, string Rule), string[]> workspaceAnomalyMatches = new();

    private async Task<string[]> WorkspaceAnomalyIds(string user, string rule, CancellationToken ct)
    {
        if (workspaceAnomalyMatches.TryGetValue((user, rule), out var cached)) return cached;
        if (rule is "Balance" or "Category" or "Transfer") { await LoadLedgerAnomalies(user, ct); return workspaceAnomalyMatches[(user, rule)]; }
        string[] matches;
        if (rule == "Any")
        {
            var ids = new HashSet<string>();
            // Separate commands avoid SQL Server expanding the eight-rule UNION inside
            // every correlated predicate and aggregate. Keep DbContext operations sequential.
            foreach (var code in AnomalyRules)
                ids.UnionWith(await WorkspaceAnomalyIds(user, code, ct));
            matches = ids.ToArray();
        }
        else if(rule=="Duplicate") matches=await WorkspaceDuplicateIds(user,ct);
        else if (rule == "Merchant")
        {
            // Resolve ambiguous active metadata once before touching the ledger.
            // An ordinary or unregistered merchant name is not an anomaly.
            var names = await db.Directory.Where(d => d.UserId == user && d.Kind == "merchants" && d.Status == "Active")
                .GroupBy(d => d.Name).Where(g => g.Count() > 1).Select(g => g.Key).ToArrayAsync(ct);
            matches = names.Length == 0 ? [] : await db.Transactions.AsNoTracking()
                .Where(t => t.UserId == user && t.Status != "Deleted" && t.Merchant != null && names.Contains(t.Merchant))
                .Select(t => t.Id).ToArrayAsync(ct);
        }
        else matches = await AnomalyQuery(user, rule).Select(t => t.Id).Distinct().ToArrayAsync(ct);
        workspaceAnomalyMatches[(user, rule)] = matches;
        return matches;
    }

    private async Task<IQueryable<FinanceTransaction>> WorkspaceFilter(string user, IQueryable<FinanceTransaction> q, IQueryCollection p, CancellationToken ct = default)
    {
        var status = p["status"].ToString(); var type = p["type"].ToString(); var currency = p["currency"].ToString();
        Require(status is "" or "Confirmed" or "NeedsReview" or "Deleted", "交易状态无效");
        Require(type == "" || TransactionKinds.Contains(type), "交易类型无效");
        Require(currency == "" || CurrencyDefinitions.Supports(currency), "币种无效");
        Require(p["keyword"].ToString().Length <= 200 && p["merchant"].ToString().Length <= 200, "搜索条件过长");
        if (p["min"].Count > 0 && p["max"].Count > 0) Require(Money(p["min"]) <= Money(p["max"]), "最低金额不可大于最高金额");
        if (!string.IsNullOrEmpty(p["start"]) && !string.IsNullOrEmpty(p["end"])) Require(Date(p["start"]!) <= Date(p["end"]!), "开始日期不可晚于结束日期");
        var accounts = QueryValues(p, "accountIds"); if (accounts.Length > 0) q = q.Where(t => accounts.Contains(t.AccountId) || accounts.Contains(t.ToAccountId!) || t.Entries.Any(e => accounts.Contains(e.AccountId!)));
        var categories = QueryValues(p, "categoryIds");
        if (categories.Length > 0) { var tree = new CategoryHierarchy(await Categories(user, ct)); var descendants = categories.SelectMany(tree.Descendants).Distinct().ToArray(); q = q.Where(t => t.Entries.Any(e => descendants.Contains(e.CategoryId!))); }
        var merchants = QueryValues(p, "merchants"); if (merchants.Length > 0) q = q.Where(t => merchants.Contains(t.Merchant!));
        var projects = QueryValues(p, "projectIds"); if (projects.Length > 0) q = q.Where(t => projects.Contains(t.ProjectId!));
        var tags = QueryValues(p, "tagIds"); if (tags.Length > 0) q = q.Where(t => t.Tags.Any(tag => tags.Contains(tag.DirectoryId)));
        var source = p["source"].ToString(); Require(source is "" or "Imported" or "Manual" or "Ai", "来源筛选无效");
        if (source == "Imported") q = q.Where(t => t.ImportJobId != null);
        if (source == "Ai") q = q.Where(t => t.ImportJobId == null && db.AuditRecords.Any(a => a.UserId == user && a.TransactionId == t.Id && a.ResourceType == nameof(FinanceTransaction) && a.Action == "Create" && (a.Source == "AiConfirmed" || a.Source == "AiAgent")));
        if (source == "Manual") q = q.Where(t => t.ImportJobId == null && !db.AuditRecords.Any(a => a.UserId == user && a.TransactionId == t.Id && a.ResourceType == nameof(FinanceTransaction) && a.Action == "Create" && (a.Source == "AiConfirmed" || a.Source == "AiAgent")));
        var anomaly = p["anomaly"].ToString(); Require(anomaly == "" || anomaly == "Any" || AnomalyRules.Contains(anomaly), "异常规则无效");
        if (anomaly != "") { var ids = await WorkspaceAnomalyIds(user, anomaly, ct); q = q.Where(t => ids.Contains(t.Id)); }
        var reviewState=p["reviewState"].ToString(); Require(reviewState is "" or "Open" or "Resolved" or "Ignored" or "Deferred" or "All", "问题状态无效");
        if(anomaly!="" && status!="NeedsReview" && reviewState!="" && reviewState!="All") {
            var now=DateTimeOffset.UtcNow;
            if(reviewState=="Open") q=q.Where(t=>!db.Set<TransactionReview>().Any(r=>r.UserId==user&&r.TransactionId==t.Id) || db.Set<TransactionReview>().Any(r=>r.UserId==user&&r.TransactionId==t.Id&&(r.State=="Open"||r.State=="Deferred"&&r.DeferredUntil<=now)));
            else q=q.Where(t=>db.Set<TransactionReview>().Any(r=>r.UserId==user&&r.TransactionId==t.Id&&r.State==reviewState));
        }
        var reconciliation = p["reconciliation"].ToString(); Require(reconciliation is "" or "Matched" or "Unmatched", "对账状态无效");
        if (reconciliation != "") q = q.Where(t => db.Set<TransactionStatementMatch>().Any(m => m.UserId == user && m.TransactionId == t.Id && m.State == "Matched") == (reconciliation == "Matched"));
        return q;
    }

    public async Task<object> TransactionSummary(string user, IQueryCollection p, CancellationToken ct = default)
    {
        var q = await Filter(user, p, ct);
        // Resolve expensive anomaly predicates once, rather than repeating them in every aggregate.
        if (!string.IsNullOrEmpty(p["anomaly"]) || p["status"] == "NeedsReview") {
            var matchedIds = await q.Select(t => t.Id).ToArrayAsync(ct);
            q = db.Transactions.AsNoTracking().Where(t => t.UserId == user && matchedIds.Contains(t.Id));
        }
        var total = await q.CountAsync(ct);
        var ids = q.Select(t => t.Id);
        var entries = db.Entries.AsNoTracking().Where(e => e.UserId == user && ids.Contains(e.TransactionId));
        var amounts = await entries.GroupBy(e => e.Currency).Select(g => new {
            Currency = g.Key,
            Income = -g.Sum(e => e.Kind == "Income" ? e.Amount : 0),
            Expense = g.Sum(e => e.Kind == "Expense" && e.Amount > 0 ? e.Amount : 0),
            NetExpense = g.Sum(e => e.Kind == "Expense" ? e.Amount : 0)
        }).ToArrayAsync(ct);
        var accounts = await db.Accounts.AsNoTracking().Where(a=>a.UserId==user).Select(a=>new {a.Id,a.Type}).ToArrayAsync(ct);
        var liquidIds=accounts.Where(a=>AccountKinds.IsLiquid(a.Type)).Select(a=>a.Id).ToArray();
        // Share the liquidity definition and non-cash exclusions used by StatisticsManagementFlows.
        var cashFlow=await (from t in q where t.Type!="Adjustment" && t.Type!="AssetLoss" from e in t.Entries
            where e.UserId==user && e.Kind=="Account" && liquidIds.Contains(e.AccountId!)
            group e by e.Currency into g select new {Currency=g.Key,Amount=g.Sum(e=>e.Amount)}).ToDictionaryAsync(x=>x.Currency, ct);
        var expenses = await q.Where(t => t.Type == "Expense").GroupBy(t => t.Currency).Select(g => new { Currency = g.Key, Average = g.Average(t => t.Amount), Max = g.Max(t => t.Amount) }).ToDictionaryAsync(x => x.Currency, ct);
        var transfers = await (from t in q where t.Type == "Transfer" || t.Type == "CreditCardPayment" from e in t.Entries where e.Kind == "Account" group e by e.Currency into g select new { Currency = g.Key, In = g.Sum(e => e.Amount > 0 ? e.Amount : 0), Out = -g.Sum(e => e.Amount < 0 ? e.Amount : 0) }).ToDictionaryAsync(x => x.Currency, ct);
        var refunds = await q.Where(t => t.Type == "Refund").GroupBy(t => t.Currency).Select(g => new { Currency = g.Key, Amount = g.Sum(t => t.Amount) }).ToDictionaryAsync(x => x.Currency, ct);
        var anomalyIds = await WorkspaceAnomalyIds(user, "Any", ct); var categoryIds = await WorkspaceAnomalyIds(user, "Category", ct);
        return new { total, pending = await q.CountAsync(t => t.Status == "NeedsReview", ct), anomalies = p["anomaly"] == "Any" ? total : await q.CountAsync(t => anomalyIds.Contains(t.Id), ct), uncategorized = await q.CountAsync(t => categoryIds.Contains(t.Id), ct),
            currencies = amounts.Select(a => new { a.Currency, income = M(a.Income), expense = M(a.Expense), netExpense = M(a.NetExpense), netCashFlow = M(cashFlow.GetValueOrDefault(a.Currency)?.Amount ?? 0), transferIn = M(transfers.GetValueOrDefault(a.Currency)?.In ?? 0), transferOut = M(transfers.GetValueOrDefault(a.Currency)?.Out ?? 0), refunds = M(refunds.GetValueOrDefault(a.Currency)?.Amount ?? 0), averageExpense = M(expenses.GetValueOrDefault(a.Currency)?.Average ?? 0), maxExpense = M(expenses.GetValueOrDefault(a.Currency)?.Max ?? 0) }),
            basis = "Ledger entries; per original currency; refunds reduce net expense; transfers excluded from income/expense, fees included in expense. Net cash flow follows AccountKinds.IsLiquid (cash, bank, Alipay, WeChat, electronic wallet), excludes Adjustment and AssetLoss, and nets transfers between liquid accounts in each currency. Credit/contract account entries are excluded from cash flow. Deleted view shows deleted entries only; anomalies remain included." };
    }

    public async Task<object> TransactionIssues(string user, string id)
    {
        await Transaction(user, id);
        var codes = new List<string>();
        foreach (var rule in AnomalyRules) if (await AnomalyQuery(user, rule).AnyAsync(t => t.Id == id)) codes.Add(rule);
        return new { rules = codes, threshold = "Extreme: >=100000 in original currency; Duplicate: exact time/type/account/currency/amount/merchant; Balance: nonzero base-entry sum; Category: missing entry/category; Merchant: multiple active canonical mappings; Refund: missing/invalid/date-inverted original expense; Transfer: missing debit/credit leg; Date: before 1900 or more than 24h in future." };
    }

    public async Task<object> TransactionIssueEvidence(string user, string[] ids)
    {
        var evidence = new List<object>();
        foreach(var rule in AnomalyRules) {
            var matches = await AnomalyQuery(user,rule).Where(t=>ids.Contains(t.Id)).Select(t=>t.Id).ToArrayAsync();
            evidence.Add(new { rule, transactionIds = matches });
        }
        return evidence;
    }

    public async Task<object> TransactionDailySummary(string user, IQueryCollection p)
    {
        var days = QueryValues(p, "days");
        Require(days.Length is > 0 and <= 100 && days.All(d => DateOnly.TryParseExact(d, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)), "日期分组无效");
        var dates = days.Select(d => DateTime.ParseExact(d, "yyyy-MM-dd", CultureInfo.InvariantCulture)).ToArray();
        var q = await Filter(user, p);
        var rows = await (from t in q where dates.Contains(t.OccurredAt.AddHours(8).Date) from e in t.Entries
            where e.UserId == user && (e.Kind == "Expense" || e.Kind == "Income")
            group e by new { Day = t.OccurredAt.AddHours(8).Date, e.Currency } into g
            select new { g.Key.Day, g.Key.Currency, Income = -g.Sum(e => e.Kind == "Income" ? e.Amount : 0), Expense = g.Sum(e => e.Kind == "Expense" ? e.Amount : 0) }).ToArrayAsync();
        return rows.Select(r => new { day = r.Day.ToString("yyyy-MM-dd"), r.Currency, income = M(r.Income), expense = M(r.Expense) }).ToArray();
    }
}
