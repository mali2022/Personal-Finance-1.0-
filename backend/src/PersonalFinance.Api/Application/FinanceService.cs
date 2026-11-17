using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService(FinanceDb db, IServiceScopeFactory scopes, ILogger<FinanceService> logger, IConfiguration? configuration = null)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static string M(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    public static decimal Money(string? value, bool positive = false)
    {
        if (value is null || !System.Text.RegularExpressions.Regex.IsMatch(value, @"^-?\d{1,18}(\.\d{1,2})?$") ||
            !decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var n) || (positive && n <= 0))
            throw new ApiException(422, positive ? "金额必须大于零，最多两位小数" : "金额格式无效");
        return n;
    }
    public static decimal MoneyAllowZero(string? value)
    {
        var n = Money(value);
        if (n < 0) throw new ApiException(422, "金额必须大于零，最多两位小数");
        return n;
    }
    public static void Require(bool valid, string message) { if (!valid) throw new ApiException(422, message); }
    public static void Version(Owned entity, string? version)
    { if (version != entity.Version.ToString(CultureInfo.InvariantCulture)) throw new ApiException(409, "数据已更新，请刷新后重试", "VERSION_CONFLICT"); }
    public async Task<object?> Write(string user, HttpContext ctx, object body, Func<Task<object?>> action, bool idempotent = false)
    {
        if (body is SaveTransaction { Origin: "AiConfirmed" }) ctx.Items["FinanceSource"] = "AiConfirmed";
        var key = ctx.Request.Headers["Idempotency-Key"].ToString();
        if (idempotent) Require(key.Length is > 0 and <= 150, "缺少合法 Idempotency-Key");
        var fingerprint = ctx.Request.Headers["X-Operation-Fingerprint"].ToString();
        Require(fingerprint.Length == 0 || System.Text.RegularExpressions.Regex.IsMatch(fingerprint, "^[a-f0-9]{64}$"), "请求摘要格式无效");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        var resource = "finance-user:" + user;
        await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Finance lock timeout',1;");
        if (body is SaveTransaction || body is VehicleCostCreate || ctx.Request.Path.StartsWithSegments("/api/smart-reconciliation") || ctx.Request.Path.StartsWithSegments("/api/spaces") || ctx.Request.Path.StartsWithSegments("/api/space-invitations") || ctx.Request.Path.StartsWithSegments("/api/transactions") || ctx.Request.Path.StartsWithSegments("/api/ai"))
        await db.Database.ExecuteSqlRawAsync("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource='finance-collaboration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Collaboration lock timeout',1;");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(ctx.Request.Method + ctx.Request.Path + JsonSerializer.Serialize(body, Json))));
        if (idempotent)
        {
            var existing = await db.Idempotencies.SingleOrDefaultAsync(x => x.UserId == user && x.Key == key);
            if (existing is not null)
            {
                if (existing.Hash != hash) throw new ApiException(409, "该幂等键已用于不同请求", "IDEMPOTENCY_CONFLICT");
                if (existing.ClientFingerprint is not null && fingerprint.Length > 0 && existing.ClientFingerprint != fingerprint)
                    throw new ApiException(409, "该幂等键已用于不同请求", "IDEMPOTENCY_CONFLICT");
                await transaction.CommitAsync();
                return JsonSerializer.Deserialize<JsonElement>(existing.Response, Json);
            }
        }
        PersonalFinance.Api.Domain.AiTransactionDraft? aiDraft = null;
        if (body is SaveTransaction { AiDraftId: not null } draftInput) {
            Require(ctx.Request.Method == "POST" && idempotent, "AI草稿必须通过幂等的新建交易流程确认");
            aiDraft = await PersonalFinance.Api.Application.Ai.AiDraftService.Prepare(db, user, draftInput, ctx.RequestAborted);
        }
        var result = await action();

        if (aiDraft != null) {
            aiDraft.State = "Confirmed"; aiDraft.Version++;
            aiDraft.TransactionId = JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString();
        }
        if (idempotent) db.Idempotencies.Add(new() { UserId = user, Key = key, Hash = hash, Response = JsonSerializer.Serialize(result, Json),
            Method = ctx.Request.Method, Path = ctx.Request.Path, ClientFingerprint = fingerprint.Length > 0 ? fingerprint : null, CompletedAt = DateTimeOffset.UtcNow });
        CaptureAudit(user, ctx, idempotent ? key : null);
        if (ctx.Request.Path.StartsWithSegments("/api/life-simulator")) ctx.RequestAborted.ThrowIfCancellationRequested();
        if (ctx.Items["FinanceSource"] as string == "AiAgent") ctx.RequestAborted.ThrowIfCancellationRequested();
        await db.SaveChangesAsync();
        if (ctx.Items["FinanceSource"] as string == "AiAgent") ctx.RequestAborted.ThrowIfCancellationRequested();
        await transaction.CommitAsync();
        workspaceAnomalyMatches.Clear();
        return result;
    }
    public async Task<Account> Account(string user, string id, bool active = true)
    {
        var a = await db.Accounts.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "账户不存在");
        Require(!active || a.Status == "Active", "账户已停用或关闭"); return a;
    }
    public async Task<Category> Category(string user, string id, string? kind = null, bool leaf = true)
    {
        var categories = await Categories(user);
        var c = categories.SingleOrDefault(x => x.Id == id) ?? throw new ApiException(404, "分类不存在");
        Require(c.Status == "Active" && (kind is null || c.Kind == kind), "分类已停用或类型不匹配");
        if (leaf) Require(c.ParentId is not null, "请选择二级或三级分类");
        Require(new CategoryHierarchy(categories).Path(id).All(x => x.Status == "Active"), "上级分类已停用");
        return c;
    }
    public async Task<decimal> Balance(string user, string id, DateTimeOffset? at = null)
    {
        var a = await Account(user, id, false);
        var q = from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id
                where e.UserId == user && e.AccountId == id && t.Status != "Deleted" && (at == null || t.OccurredAt <= at)
                select e.Amount;
        return a.OpeningBalance + (await q.SumAsync(x => (decimal?)x) ?? 0);
    }
    private sealed record CurrentAccountLedger(string Id, decimal Amount, DateTimeOffset? At);
    private async Task<Dictionary<string, CurrentAccountLedger>> CurrentAccountBalances(string user, string[]? accountIds = null)
    {
        var values = await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id
            where e.UserId == user && t.UserId == user && e.Kind == "Account" && t.Status != "Deleted" && (accountIds == null || accountIds.Contains(e.AccountId!))
            group new { e, t } by e.AccountId into g select new CurrentAccountLedger(g.Key!, g.Sum(x => x.e.Amount), g.Max(x => (DateTimeOffset?)x.t.OccurredAt))).ToDictionaryAsync(x => x.Id);
        return values;
    }
    public async Task<object[]> Accounts(string user)
        => await AccountViews(user, await CurrentAccountBalances(user));
    private async Task<object[]> AccountViews(string user, Dictionary<string, CurrentAccountLedger> balances)
    {
        var accounts = await (from a in db.Accounts join g in db.Set<AccountGroup>() on a.GroupId equals g.Id into groups from g in groups.DefaultIfEmpty()
            where a.UserId == user orderby g == null ? 0 : g.SortOrder, g == null ? "" : g.Name, a.IsPinned descending, a.SortOrder, a.Name, a.Id select a).ToListAsync();
        var holds=await db.Set<AccountFundHold>().AsNoTracking().Where(x=>x.UserId==user && x.State=="Confirmed" && x.IncludedInBookBalance && x.ReducesAvailable && x.Type!="PendingCredit").ToListAsync();
        var deductions=holds.GroupBy(x=>x.AccountId).ToDictionary(g=>g.Key,g=>g.Sum(FundHoldRules.AvailabilityDeduction));
        return accounts.Select(a => AccountView(a, a.OpeningBalance + (balances.GetValueOrDefault(a.Id)?.Amount ?? 0), balances.GetValueOrDefault(a.Id)?.At, a.OpeningBalance + (balances.GetValueOrDefault(a.Id)?.Amount ?? 0) - deductions.GetValueOrDefault(a.Id))).ToArray();
    }
    public async Task<object> SaveAccount(string user, SaveAccount input, string? id, string? version)
    {
        if (id == null) await RequireEnabledCurrency(user, input.Currency);
        Require(input.Name.Trim().Length is > 0 and <= 150, "账户名称必填，最多150字");
        Require(AccountKinds.All.Contains(input.Type), "账户类型无效");
        Require(CurrencyDefinitions.Supports(input.Currency) && new[] { "Active", "Paused", "Disabled", "Archived", "Closed" }.Contains(input.Status), "账户币种或状态无效");
        Require(input.StatementDay is null or >= 1 and <= 31 && input.PaymentDay is null or >= 1 and <= 31, "账单/还款日须为1至31");
        var a = id is null ? new Account { UserId = user, Type = input.Type, Currency = input.Currency, OpeningBalance = Money(input.OpeningBalance) } : await Account(user, id, false);
        if (id is not null) { Version(a, version); Require(a.Type == input.Type && a.Currency == input.Currency, "已有账户不可修改类型或币种"); a.Version++; }
        await ConfigureAccount(user, a, input, id == null);
        a.Name = input.Name.Trim(); a.Status = input.Status; a.Institution = input.Institution; a.CreditLimit = input.CreditLimit is null ? null : Money(input.CreditLimit);
        Require(a.CreditLimit is null or >= 0, "信用额度不可为负"); a.StatementDay = input.StatementDay; a.PaymentDay = input.PaymentDay;
        if (id is null) db.Accounts.Add(a); return new { a.Id };
    }
    public async Task<object> SaveCategory(string user, SaveCategory input, string? id, string? version = null)
    {
        Require(input.Name.Trim().Length is > 0 and <= 100 && new[] { "Expense", "Income" }.Contains(input.Kind), "分类名称或类型无效");
        Require(new[] { "Active", "Disabled" }.Contains(input.Status), "分类状态无效");
        var c = id is null ? new Category { UserId = user } : await db.Categories.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "分类不存在");
        if (id is not null) Version(c, version);
        if (id is not null) Require(c.ParentId == input.ParentId && c.Kind == input.Kind, "已有分类不可改变层级或收支类型");
        if (input.ParentId is not null && id is null) { var parent = await Category(user, input.ParentId, input.Kind, false); Require(new CategoryHierarchy(await Categories(user)).Path(parent.Id).Length < 3 && parent.Id != c.Id, "分类最多支持三级"); }
        c.Name = input.Name.Trim(); c.Kind = input.Kind; c.ParentId = input.ParentId; c.Status = input.Status; c.SortOrder = input.SortOrder; c.Version++;
        if (id is null) db.Categories.Add(c); return new { c.Id };
    }
    public Task<List<Category>> Categories(string user, CancellationToken ct = default) => db.Categories.AsNoTracking().Where(x => x.UserId == user).OrderBy(x => x.SortOrder).ToListAsync(ct);
    public async Task<IQueryable<FinanceTransaction>> Filter(string user, IQueryCollection p, CancellationToken ct = default)
    {
        var q = db.Transactions.AsNoTracking().Where(x => x.UserId == user);
        var status = p["status"].ToString(); q = status == "Deleted" ? q.Where(x => x.Status == "Deleted") : q.Where(x => x.Status != "Deleted");
        var statusFlag = p["statusFlag"].ToString();
        Require(statusFlag is "" or "NeedsReview", "状态标记无效");
        if (statusFlag != "")
        {
            // Strict stored-status filter, used by the Home/Dashboard pending count
            // drill-down. It must not widen into the review queue (flagged anomalies
            // and reviewed rows) the way status=NeedsReview does.
            Require(status is "" or "NeedsReview", "状态标记不能与其他状态同时使用");
            q = q.Where(x => x.Status == statusFlag);
        }
        if (status == "NeedsReview")
        {
            var state = p["reviewState"].ToString();
            if (state == "") state = "Open";
            Require(state is "Open" or "Resolved" or "Ignored" or "Deferred" or "All", "问题状态无效");
            var flaggedIds = await WorkspaceAnomalyIds(user, "Any", ct);
            q = q.Where(x => x.Status == "NeedsReview" || flaggedIds.Contains(x.Id) || db.Set<TransactionReview>().Any(r => r.UserId == user && r.TransactionId == x.Id));
            var now = DateTimeOffset.UtcNow;
            if (state == "Open") q = q.Where(x => !db.Set<TransactionReview>().Any(r => r.UserId == user && r.TransactionId == x.Id) || db.Set<TransactionReview>().Any(r => r.UserId == user && r.TransactionId == x.Id && (r.State == "Open" || r.State == "Deferred" && r.DeferredUntil <= now)));
            else if (state != "All") q = q.Where(x => db.Set<TransactionReview>().Any(r => r.UserId == user && r.TransactionId == x.Id && r.State == state));
        }
        else if (status == "Confirmed") q = q.Where(x => x.Status == "Confirmed");
        var type = p["type"].ToString(); if (type.Length > 0) q = q.Where(x => x.Type == type);
        var transferKind = p["transferKind"].ToString(); if (transferKind.Length > 0) { Require(transferKind is "TopUp" or "Withdrawal", "无效的转账用途"); q = q.Where(x => x.Type == "Transfer" && x.TransferKind == transferKind); }
        var currency = p["currency"].ToString(); if (currency.Length > 0) q = q.Where(x => x.Currency == currency);
        var account = p["accountId"].ToString(); if (account.Length > 0) {
            var own = db.Transactions.Where(t => t.UserId == user);
            var linked = own.Where(t => t.AccountId == account).Select(t => t.Id)
                .Union(own.Where(t => t.ToAccountId == account).Select(t => t.Id))
                .Union(db.Entries.Where(e => e.UserId == user && e.AccountId == account).Select(e => e.TransactionId));
            q = q.Where(t => linked.Contains(t.Id));
        }
        var category = p["categoryId"].ToString(); if (category.Length > 0) { var ids = new CategoryHierarchy(await Categories(user, ct)).Descendants(category); q = q.Where(x => x.Entries.Any(e => ids.Contains(e.CategoryId!))); }
        var project = p["projectId"].ToString(); if (project.Length > 0) q = q.Where(x => x.ProjectId == project);
        var tag = p["tagId"].ToString(); if (tag.Length > 0) q = q.Where(x => x.Tags.Any(t => t.DirectoryId == tag));
        var import = p["importJobId"].ToString(); if (import.Length > 0) q = q.Where(x => x.ImportJobId == import);
        var merchant = p["merchant"].ToString(); if (merchant.Length > 0) q = q.Where(x => x.Merchant == merchant);
        q = ApplyTransactionDates(q, p["start"].ToString(), p["end"].ToString());
        if (!string.IsNullOrEmpty(p["min"])) { var amount = Money(p["min"]!); Require(amount >= 0, "金额范围不可为负"); q = q.Where(x => x.Amount >= amount); }
        if (!string.IsNullOrEmpty(p["max"])) { var amount = Money(p["max"]!); Require(amount >= 0, "金额范围不可为负"); q = q.Where(x => x.Amount <= amount); }
        var keyword = p["keyword"].ToString().Trim();
        if (keyword.Length > 0)
        {
            var isMoney = decimal.TryParse(keyword, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount);
            // Resolve small metadata sets once, without loading transaction rows.
            var accountIds = await db.Accounts.Where(a => a.UserId == user && a.Name.Contains(keyword)).Select(a => a.Id).ToArrayAsync(ct);
            // Prove full coverage of this filtered ledger before omitting expensive
            // text/category/tag predicates. Never assume account ownership or cache
            // this proof across requests; a later write can change the matching set.
            var accountsCoverLedger = accountIds.Length >= 8 && !await q.AnyAsync(t => !accountIds.Contains(t.AccountId), ct);
            if (!accountsCoverLedger)
            {
            var allCategories = await Categories(user, ct); var hierarchy = new CategoryHierarchy(allCategories);
            var categoryIds = allCategories.Where(c => c.Name.Contains(keyword, StringComparison.OrdinalIgnoreCase)).SelectMany(c => hierarchy.Descendants(c.Id)).Distinct().ToArray();
            var directoryIds = await db.Directory.Where(d => d.UserId == user && d.Name.Contains(keyword)).Select(d => d.Id).ToArrayAsync(ct);
            if (accountIds.Length >= 8 || categoryIds.Length >= 32 || directoryIds.Length >= 32)
            {
                // Broad metadata matches make UNION repeatedly sort the same large
                // ledger. Keep one filtered relation; selective searches use ID unions below.
                q = q.Where(x => (x.Merchant != null && x.Merchant.Contains(keyword))
                    || (x.ProductName != null && x.ProductName.Contains(keyword)) || x.Note.Contains(keyword)
                    || isMoney && x.Amount == amount
                    || accountIds.Contains(x.AccountId!) || accountIds.Contains(x.ToAccountId!)
                    || x.Entries.Any(e => e.UserId == user && categoryIds.Contains(e.CategoryId!))
                    || directoryIds.Contains(x.ProjectId!) || x.Tags.Any(tag => directoryIds.Contains(tag.DirectoryId)));
            }
            else
            {
            // Independent ID sets let SQL use joins and deduplicate matches once,
            // instead of evaluating metadata subqueries inside a wide OR for every row.
            var own = db.Transactions.AsNoTracking().Where(x => x.UserId == user);
            IQueryable<string> matches = own.Where(x => (x.Merchant != null && x.Merchant.Contains(keyword))
                || (x.ProductName != null && x.ProductName.Contains(keyword)) || x.Note.Contains(keyword)
                || isMoney && x.Amount == amount).Select(x => x.Id);
            if (accountIds.Length > 0)
                matches = matches.Union(own.Where(x => accountIds.Contains(x.AccountId!) || accountIds.Contains(x.ToAccountId!)).Select(x => x.Id));
            if (categoryIds.Length > 0)
                matches = matches.Union(db.Entries.Where(e => e.UserId == user && categoryIds.Contains(e.CategoryId!)).Select(e => e.TransactionId));
            if (directoryIds.Length > 0)
            {
                matches = matches.Union(own.Where(x => directoryIds.Contains(x.ProjectId!)).Select(x => x.Id));
                matches = matches.Union(from tagMatch in db.Set<TransactionTag>()
                    join transactionMatch in own on tagMatch.TransactionId equals transactionMatch.Id
                    where directoryIds.Contains(tagMatch.DirectoryId)
                    select transactionMatch.Id);
            }
            q = q.Where(x => matches.Contains(x.Id));
            }
            }
        }
        q = await WorkspaceFilter(user, q, p, ct);
        return SortWorkspace(q, p["sort"].ToString());
    }
    public static DateTimeOffset Date(string value)
    {
        if (DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var local)) return new DateTimeOffset(local, TimeSpan.FromHours(8));
        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d)) throw new ApiException(422, "日期格式无效"); return d.ToUniversalTime();
    }
    public static IQueryable<FinanceTransaction> ApplyTransactionDates(IQueryable<FinanceTransaction> query, string? start, string? end)
    {
        if (!string.IsNullOrEmpty(start)) { var first = Date(start); query = query.Where(x => x.OccurredAt >= first); }
        if (!string.IsNullOrEmpty(end))
        {
            var last = Date(end);
            if (DateOnly.TryParseExact(end, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) && day != DateOnly.MaxValue)
            {
                // Calendar dates name a whole Shanghai business day; explicit timestamps remain exact.
                var endExclusive = last.AddDays(1);
                query = query.Where(x => x.OccurredAt < endExclusive);
            }
            else
            {
                if (day == DateOnly.MaxValue) last = new DateTimeOffset(DateTime.MaxValue, TimeSpan.FromHours(8));
                query = query.Where(x => x.OccurredAt <= last);
            }
        }
        return query;
    }
    public static (int page, int size) Paging(IQueryCollection p)
    {
        var page = string.IsNullOrEmpty(p["page"]) ? 1 : int.TryParse(p["page"], out var n) ? n : 0;
        var size = string.IsNullOrEmpty(p["pageSize"]) ? 20 : int.TryParse(p["pageSize"], out var s) ? s : 0;
        Require(page is > 0 and <= 1000000 && size is > 0 and <= 100, "分页参数无效"); return (page, size);
    }
    private async Task<object> TransactionsUnshared(string user, IQueryCollection p, CancellationToken ct = default)
    {
        var (page, size) = Paging(p); var q = await Filter(user, p, ct);
        if (!string.IsNullOrEmpty(p["anomaly"]) || p["status"] == "NeedsReview") {
            var matchedIds = await q.Select(t => t.Id).ToArrayAsync(ct);
            q = SortWorkspace(db.Transactions.AsNoTracking().Where(t => t.UserId == user && matchedIds.Contains(t.Id)), p["sort"].ToString());
        }
        var total = await q.CountAsync(ct);
        if (total == 0) return new { items = Array.Empty<object>(), total, page, pageSize = size };
        // Bound related-row queries to this page. Reapplying the full keyword
        // union inside every split include can produce expensive nested plans.
        var pageIds = await q.Skip((page - 1) * size).Take(size).Select(x => x.Id).ToArrayAsync(ct);
        var selected = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && pageIds.Contains(x.Id))
            .Include(x => x.Entries).Include(x => x.Tags).AsSplitQuery().ToDictionaryAsync(x => x.Id, ct);
        var rows = pageIds.Where(selected.ContainsKey).Select(id => selected[id]).ToList();
        return new { items = await ProjectTransactions(user, rows, ct), total, page, pageSize = size };
    }
    public async Task<object[]> ProjectTransactions(string user, List<FinanceTransaction> rows, CancellationToken ct = default)
    {
        if(rows.Count==0)return [];
        var ids = rows.Select(x => x.Id).ToArray();
        var runningBalances = (await RunningBalances(user, ids, ct)).ToLookup(x => x.TransactionId);
        var refunded = await db.Transactions.Where(x => x.UserId == user && x.Status != "Deleted" && x.Type == "Refund" && ids.Contains(x.OriginalTransactionId!)).GroupBy(x => x.OriginalTransactionId!).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var recovered = await (from r in db.Set<CashbackRecovery>() join b in db.Set<CashbackReceivable>() on r.CashbackId equals b.Id join rt in db.Transactions on r.TransactionId equals rt.Id where r.UserId == user && b.UserId == user && rt.Status != "Deleted" && r.State == "Active" && b.Treatment == "PriceAdjustment" && ids.Contains(b.TransactionId) group r by b.TransactionId into g select new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var directoryIds = rows.SelectMany(t => t.Tags.Select(x => x.DirectoryId))
            .Concat(rows.Where(t => t.ProjectId is not null).Select(t => t.ProjectId!)).Distinct().ToArray();
        var directory = await db.Directory.AsNoTracking().Where(x => x.UserId == user && directoryIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return rows.Select(t => (object)new { t.Id, t.Type, amount = M(t.Amount), t.Currency, t.AccountId, t.ToAccountId, t.CategoryId, t.Merchant, t.ProductName, t.TransferKind,
            t.OccurredAt, t.Note, tagIds = t.Tags.Select(x => x.DirectoryId).ToArray(), tagNames = t.Tags.Select(x => directory.GetValueOrDefault(x.DirectoryId)?.Name ?? "").ToArray(), t.ProjectId,
            projectName = t.ProjectId is null ? null : directory.GetValueOrDefault(t.ProjectId)?.Name, t.Status, t.OriginalTransactionId, refundedAmount = M(refunded.GetValueOrDefault(t.Id) - recovered.GetValueOrDefault(t.Id)),
            fee = M(t.Fee), t.FeeCategoryId, receivedAmount = t.ReceivedAmount is null ? null : M(t.ReceivedAmount.Value), exchangeRate = t.ExchangeRate?.ToString(CultureInfo.InvariantCulture),
            payments = t.Type=="Expense" ? t.Entries.Where(e=>e.Kind=="Account" && e.Amount<0).GroupBy(e=>e.AccountId!).Select(g=>new {accountId=g.Key,amount=M(-g.Sum(e=>e.Amount))}).OrderBy(p=>p.accountId==t.AccountId?0:1).ThenBy(p=>p.accountId).ToArray() : [],
            accountBalances=runningBalances[t.Id].Select(a=>new{accountId=a.AccountId,name=a.Name,currency=a.Currency,balance=M(a.Balance)}).ToArray(),
            splits = t.Entries.Where(e => e.Kind == "Expense" && e.CategoryId != t.FeeCategoryId && t.Entries.Where(line=>line.Kind=="Expense" && line.CategoryId!=t.FeeCategoryId).Select(line=>line.CategoryId).Distinct().Count()>1).GroupBy(e=>e.CategoryId).Select(g=>new {categoryId=g.Key,amount=M(Math.Abs(g.Sum(e=>e.Amount)))}).ToArray(),
            promotion = t.PromotionJson is null ? null : JsonSerializer.Deserialize<PromotionInput>(t.PromotionJson, Json),
            version = t.Version.ToString(), t.CreatedAt, t.UpdatedAt, t.BusinessId, t.ImportJobId, t.ExternalId, t.AdjustmentDirection }).ToArray();
    }
    public async Task<FinanceTransaction> Transaction(string user, string id) => await db.Transactions.Include(x => x.Entries).Include(x => x.Tags).AsSplitQuery().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "交易不存在");
    public async Task<object> Detail(string user, string id)
    {
        var t = await Transaction(user, id);
        var dto = JsonSerializer.SerializeToNode((await ProjectTransactions(user, [t]))[0], Json)!.AsObject();
        dto["entries"] = JsonSerializer.SerializeToNode(t.Entries.Select(e => new { e.Id, e.Kind, e.AccountId, e.CategoryId, amount = M(e.Amount), e.Currency, exchangeRate = e.ExchangeRate.ToString(CultureInfo.InvariantCulture), baseAmount = M(e.BaseAmount), e.OriginalEntryId }), Json);
        dto["attachments"] = JsonSerializer.SerializeToNode(await Attachments(user, id), Json);
        var related = await db.Transactions.Include(x => x.Entries).Include(x => x.Tags).AsSplitQuery().Where(x => x.UserId == user && (x.Id == t.OriginalTransactionId || x.OriginalTransactionId == id)).Take(100).ToListAsync();
        dto["relatedTransactions"] = JsonSerializer.SerializeToNode(await ProjectTransactions(user, related), Json); return dto;
    }
    public async Task<object> SaveTransaction(string user, SaveTransaction input, string? id = null, string? version = null, bool internalOperation = false, bool stageGOperation = false)
    {
        if (id != null) Require(!await db.Documents.AnyAsync(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.TransactionId==id),"交易已关联车辆费用，请先解除关联后修改");
        if (id != null) await ProtectSharedTransaction(user, id);
        if (id != null) Require(!await db.Set<TransactionStatementMatch>().AnyAsync(m => m.UserId == user && m.TransactionId == id && m.State != "Revoked"), "交易存在账单核对记录，请先撤销匹配");
        if (id != null) Require(!await db.Set<AuthorizedPayment>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "授权付款金额及扣款账户不可直接改写，请撤销后重新登记");
        if (id != null) await ProtectStageGTransaction(user, id);
        if (!stageGOperation) Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && (x.AssetAccountId == input.AccountId || x.AssetAccountId != null && x.AssetAccountId == input.ToAccountId || input.OriginalTransactionId != null && x.FundingTransactionId == input.OriginalTransactionId)), "预付款专用账户和退款必须从合同结算入口处理");
        Require(new[] { "Expense", "Income", "Transfer", "CreditCardPayment", "Refund", "AssetLoss", "Adjustment" }.Contains(input.Type) || internalOperation, "交易类型无效");
        Require(input.Note.Length <= 2000 && (input.Merchant?.Length ?? 0) <= 200, "备注或商户名称过长");
        Require(input.TransferKind is null or "" or "TopUp" or "Withdrawal", "无效的转账用途");
        Require(input.Type == "Transfer" || string.IsNullOrEmpty(input.TransferKind), "充值和提现仅适用于转账");
        Require((input.ProductName?.Trim().Length ?? 0) <= 200, "商品名最多200个字符");
        Require(input.Type == "Expense" || string.IsNullOrWhiteSpace(input.ProductName), "商品名仅适用于支出交易");
        var amount = input.Type is "Expense" or "Income" or "Transfer" ? MoneyAllowZero(input.Amount) : Money(input.Amount, true); var fee = Money(input.Fee); Require(fee >= 0, "手续费不可为负");
        if (input.Type is not ("Transfer" or "CreditCardPayment")) Require(fee == 0, "该交易类型不能带手续费");
        var account = await Account(user, input.AccountId);
        Require(input.Currency == null || input.Currency == account.Currency, "记账币种必须与资金账户币种一致，请重新选择账户");
        if (input.Promotion is not null)
        {
            Require(input.Type is "Expense" or "Transfer" or "CreditCardPayment", "该交易不能使用直接优惠");
            var net = PromotionMath.Calculate(input.Promotion, account.Currency, input.Type != "Expense");
            Require(net == (input.Type == "Expense" ? amount : fee), "实际支付或手续费与优惠计算不一致");
        }
        if (!internalOperation) Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "应收应付账户须通过借贷/报销操作");
        Require(input.Payments == null || input.Type == "Expense" || input.Payments.Length == 0,"仅消费支持多账户付款");
        var payments = input.Payments is {Length:>0} ? input.Payments : new[]{new PaymentSplit(input.AccountId,input.Amount)};
        Require(payments.All(p=>p!=null && !string.IsNullOrWhiteSpace(p.AccountId)),"付款明细不完整");
        Require(payments.Length <= 10 && payments.Select(p=>p.AccountId).Distinct().Count()==payments.Length && payments[0].AccountId==input.AccountId,"付款账户须唯一，首个付款账户须与主账户一致，最多10个");
        Require(payments.Sum(p=>MoneyAllowZero(p.Amount))==amount,"付款合计必须等于消费实付金额");
        Require(amount > 0 || payments.Length == 1,"金额为零时只能使用一个付款账户");
        if(input.Type=="Expense") foreach(var payment in payments) {
            var payer=await Account(user,payment.AccountId);
            Require(payer.Currency==account.Currency,"多账户付款须使用相同币种");
            if(!internalOperation)Require(!new[]{"Receivable","Payable","ConsumerLoan","SecuredLoan"}.Contains(payer.Type),"借贷专用账户不能普通消费");
            if(!stageGOperation)Require(!await db.Set<PrepaymentContract>().AnyAsync(c=>c.UserId==user && c.AssetAccountId==payer.Id),"预付款专用账户须通过合同结算入口处理");
        }
        var t = id is null ? new FinanceTransaction { UserId = user } : await Transaction(user, id);
        if(id!=null && t.Type=="Expense" && t.Entries.Count(e=>e.Kind=="Account" && e.Amount<0)>1)Require(input.Payments!=null,"修改多账户消费时必须明确保留或取消付款拆分");
        if (id != null) Require(!await db.Set<CashbackRecovery>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "返现追回流水须从返现管理处理");
        if (id != null) Require(!await db.Set<PromotionTransferDraft>().AnyAsync(x => x.UserId == user && (x.TransferTransactionId == id || x.SubsidyTransactionId == id)), "补贴复合业务流水不能单独修改");
        var oldAccountIds = t.Entries.Where(x => x.Kind == "Account").Select(x => x.AccountId!).ToArray();
        if (id is not null)
        {
            Require(!await db.Set<CashbackReceivable>().AnyAsync(x => x.UserId == user && (x.SettlementTransactionId == id || x.TransactionId == id && x.State != "Revoked")), "关联返现的交易须先处理返现记录");
            Require(!await db.Set<PromotionUsage>().AnyAsync(x => x.UserId == user && x.RefundTransactionId == id), "关联权益返还的退款不能直接编辑；请撤销后重新登记");
            Version(t, version); Require(!await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && (x.FundingTransactionId == id || x.SettlementTransactionId == id || x.InterestTransactionId == id)), "存款关联流水不可直接编辑"); Require(!await db.Set<InvestmentTrade>().AnyAsync(x => x.UserId == user && x.TransactionId == id && x.State == "Active"), "关联投资的资金流水不能直接编辑"); Require(t.Status != "Deleted" && (t.Type == input.Type || new[] { "Expense", "Income", "Transfer", "CreditCardPayment", "Refund", "AssetLoss" }.Contains(t.Type) && new[] { "Expense", "Income", "Transfer", "CreditCardPayment", "Refund", "AssetLoss" }.Contains(input.Type)) && t.BusinessId is null, "该交易不可直接编辑");
            Require(!await db.Transactions.AnyAsync(x => x.UserId == user && x.OriginalTransactionId == id && x.Status != "Deleted"), "存在退款的消费不能修改；请先处理关联退款");
            db.Entries.RemoveRange(t.Entries); t.Entries = []; db.RemoveRange(t.Tags); t.Tags = []; t.Version++;
        }
        if (input.ProjectId is not null) Require(await db.Directory.AnyAsync(x => x.UserId == user && x.Id == input.ProjectId && x.Kind == "projects" && x.Status == "Active" && x.Currency == account.Currency), "项目无效或币种不同");
        var tags = (input.TagIds ?? []).Distinct().ToArray();
        Require(tags.Length <= 30 && await db.Directory.CountAsync(x => x.UserId == user && tags.Contains(x.Id) && x.Kind == "tags" && x.Status == "Active") == tags.Length, "标签无效");
        t.PromotionJson = input.Promotion is null ? null : JsonSerializer.Serialize(input.Promotion, Json);
        t.Type = input.Type; t.Amount = amount; t.Currency = account.Currency; t.AccountId = account.Id;
        t.ToAccountId = input.Type is "Transfer" or "CreditCardPayment" ? input.ToAccountId : null;
        t.CategoryId = input.Type is "Expense" or "Income" or "Refund" or "RewardReversal" ? input.CategoryId : null;
        t.Merchant = string.IsNullOrWhiteSpace(input.Merchant)?input.Merchant:(await ResolveMerchant(user,input.Merchant))?.Name??input.Merchant.Trim(); t.OccurredAt = input.OccurredAt.ToUniversalTime(); t.Note = input.Note; t.ProjectId = input.ProjectId; t.Fee = fee;
        t.TransferKind = input.Type == "Transfer" ? input.TransferKind == null ? t.TransferKind : string.IsNullOrEmpty(input.TransferKind) ? null : input.TransferKind : null;
        t.ProductName = input.Type == "Expense" ? input.ProductName == null ? t.ProductName : string.IsNullOrWhiteSpace(input.ProductName) ? null : input.ProductName.Trim() : null;
        t.FeeCategoryId = fee > 0 && (input.Type is "Transfer" or "CreditCardPayment") ? input.FeeCategoryId : null;
        t.OriginalTransactionId = input.Type == "Refund" ? input.OriginalTransactionId : null; t.ReceivedAmount = null; t.ExchangeRate = null; t.UpdatedAt = DateTimeOffset.UtcNow;
        t.AdjustmentDirection = input.Type is "Adjustment" or "InvestmentPrincipal" ? input.AdjustmentDirection : null;
        t.Tags = tags.Select(tag => new TransactionTag { TransactionId = t.Id, DirectoryId = tag }).ToList();
        Entry? Add(string kind, decimal value, string? aid = null, string? cid = null, string? currency = null, decimal rate = 1, string? original = null)
        {
            if (value == 0) return null;
            var entry = new Entry { UserId = user, TransactionId = t.Id, Kind = kind, AccountId = aid, CategoryId = cid, Amount = value, Currency = currency ?? account.Currency, ExchangeRate = rate, BaseAmount = decimal.Round(value * rate, 4), OriginalEntryId = original };
            t.Entries.Add(entry); return entry;
        }
        if (t.Type is "Expense" or "Income")
        {
            Require(fee == 0, "普通收支不应带转账手续费");
            var splits = input.Splits is { Length: > 0 } ? input.Splits : [new Split(input.CategoryId ?? "", input.Amount)];
            Require(splits.Length <= 50 && splits.Sum(x => MoneyAllowZero(x.Amount)) == amount, "拆分金额必须等于总金额");
            Require(amount > 0 || splits.Length == 1, "金额为零时只能使用一条拆分");
            foreach(var split in splits)await Category(user,split.CategoryId,t.Type);
            if(t.Type=="Expense" && payments.Length>1) {
                foreach(var line in ExpensePaymentAllocation.Allocate(splits,payments))Add("Expense",line.Amount,line.AccountId,line.CategoryId);
                foreach(var payment in payments)Add("Account",-Money(payment.Amount),payment.AccountId);
            } else {
                foreach(var split in splits)Add(t.Type,Money(split.Amount)*(t.Type=="Income"?-1:1),cid:split.CategoryId);
                Add("Account",amount*(t.Type=="Income"?1:-1),account.Id);
            }
            t.CategoryId = splits[0].CategoryId;
            t.Status = t.Type == "Expense" && await db.Categories.AnyAsync(x => x.UserId == user && x.Id == t.CategoryId && x.Name == "不明消费") ? "NeedsReview" : "Confirmed";
        }
        else if (t.Type == "RewardReversal" && internalOperation)
        {
            var category = await Category(user, input.CategoryId ?? "", "Income");
            Require(input.Promotion == null && fee == 0, "奖励追回不能带优惠或手续费");
            Add("Income", amount, cid: category.Id); Add("Account", -amount, account.Id);
        }
        else if (t.Type is "Transfer" or "CreditCardPayment")
        {
            Require(input.ToAccountId is not null && input.ToAccountId != account.Id, "转出和转入账户不能相同");
            var target = await Account(user, input.ToAccountId!);
            Require(!(target.Type == "Receivable" || target.Type == "Payable" || target.Type == "ConsumerLoan" || target.Type == "SecuredLoan"), "业务应收应付账户不能普通转账");
            if (t.Type == "CreditCardPayment") Require((target.Type == "CreditCard" || target.Type == "ConsumerCredit") && !(account.Type == "CreditCard" || account.Type == "ConsumerCredit") && target.Currency == account.Currency, "信用卡还款账户或币种无效");
            var received = amount; decimal rate = 1;
            if (target.Currency != account.Currency)
            {
                Require(amount > 0, "跨币种转账的本金金额必须大于零");
                received = Money(input.ReceivedAmount, true);
                Require(decimal.TryParse(input.ExchangeRate, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var exchange) && exchange >= 0.00000001m && exchange <= 1000000 && decimal.Round(exchange, 8) == exchange, "汇率无效，最多八位小数");
                Require(decimal.Round(amount * exchange, 2, MidpointRounding.AwayFromZero) == received, "汇率与转入金额不一致");
                rate = amount / received; t.ExchangeRate = exchange;
            }
            t.ReceivedAmount = received; Add("Account", -(amount + fee), account.Id); var credited = Add("Account", received, target.Id, currency: target.Currency, rate: rate);
            // The base preview is exact even when inverse FX has repeating decimals.
            if (credited is not null) credited.BaseAmount = amount;
            if (fee > 0) { var c = await Category(user, input.FeeCategoryId ?? "", "Expense"); Add("Expense", fee, cid: c.Id); }
        }
        else if (t.Type == "Refund")
        {
            var original = await Transaction(user, input.OriginalTransactionId ?? ""); Require(!await db.Set<InvestmentTrade>().AnyAsync(x=>x.UserId==user && x.TransactionId==original.Id && x.State=="Active"), "投资费用退款须先从投资详情受控撤销并重新登记净费用");
            Require(!await db.Set<CashbackRecovery>().AnyAsync(x => x.UserId == user && x.TransactionId == original.Id), "返现追回流水不可作为普通退款来源");
            Require(original.Type == "Expense" && original.Status != "Deleted" && original.Currency == account.Currency && original.BusinessId is null, "原消费无效或币种不同");
            var refunds = await db.Transactions.Include(x => x.Entries).Where(x => x.UserId == user && x.OriginalTransactionId == original.Id && x.Status != "Deleted" && x.Id != t.Id).ToListAsync();
            var recoveries = await PriceRecoveryTransactions(user, original.Id);
            Require(refunds.Sum(x => x.Amount) + amount <= original.Amount + recoveries.Sum(x => x.Amount), "累计退款超过原消费");
            var allocations = input.Splits is { Length: > 0 } ? input.Splits : AllocateRefund(original, refunds.Concat(recoveries).ToList(), amount);
            Require(allocations.Sum(x => Money(x.Amount, true)) == amount, "退款拆分合计不正确");
            foreach (var group in allocations.GroupBy(x => x.CategoryId))
            {
                var value = group.Sum(x => Money(x.Amount, true));
                var available = original.Entries.Where(x => x.Kind == "Expense" && x.CategoryId == group.Key).Sum(x => x.Amount) + refunds.Concat(recoveries).SelectMany(x => x.Entries).Where(x => x.Kind == "Expense" && x.CategoryId == group.Key).Sum(x => x.Amount);
                Require(value <= available, "退款超过该分类的剩余额度");
                Add("Expense", -value, cid: group.Key, original: original.Entries.First(x => x.Kind == "Expense" && x.CategoryId == group.Key).Id);
            }
            Add("Account", amount, account.Id); t.CategoryId = original.CategoryId; t.Merchant = original.Merchant; t.ProjectId = original.ProjectId;
            t.Tags = original.Tags.Select(x => new TransactionTag { TransactionId = t.Id, DirectoryId = x.DirectoryId }).ToList();
        }
        else if (t.Type is "AssetLoss" or "Adjustment" or "InvestmentPrincipal")
        {
            Require(input.Note.Trim().Length > 0 && fee == 0 && (input.Splits?.Length ?? 0) == 0, "损失或调整须填写原因且不可拆分");
            if (t.Type == "AssetLoss") Require(!(account.Type == "CreditCard" || account.Type == "ConsumerCredit"), "信用卡不能登记资产损失");
            if (t.Type is "Adjustment" or "InvestmentPrincipal") Require(input.AdjustmentDirection is "Increase" or "Decrease", "调整方向无效");
            var sign = t.Type is "Adjustment" or "InvestmentPrincipal" && input.AdjustmentDirection == "Increase" ? 1 : -1;
            Add("Account", amount * sign, account.Id); Add("Equity", -amount * sign);
        }
        Require(t.Entries.Count == 0 ? amount == 0 : t.Entries.Count >= 2 && t.Entries.Sum(x => x.BaseAmount) == 0, "交易金额未平衡");
        await ApplyBenefits(user, t, input.Promotion);
        if (id is null) db.Transactions.Add(t);
        // Account version captures every balance-affecting write, including reconciliation races.
        foreach (var aid in t.Entries.Where(x => x.Kind == "Account").Select(x => x.AccountId!).Concat(oldAccountIds).Distinct()) { var a = await Account(user, aid, false); a.Version++; }
        await CompleteSharedTransaction(user, t, input.Collaboration);
        return new { t.Id };
    }
    private static Split[] AllocateRefund(FinanceTransaction original, List<FinanceTransaction> refunds, decimal amount)
    {
        var result = new List<Split>(); var remaining = amount;
        foreach (var group in original.Entries.Where(x => x.Kind == "Expense").GroupBy(x => x.CategoryId!))
        { var available = group.Sum(x => x.Amount) + refunds.SelectMany(x => x.Entries).Where(x => x.Kind == "Expense" && x.CategoryId == group.Key).Sum(x => x.Amount); var take = Math.Min(available, remaining); if (take > 0) result.Add(new(group.Key, M(take))); remaining -= take; }
        Require(remaining == 0, "退款分配额度不足"); return result.ToArray();
    }
    public async Task<object> ChangeTransaction(string user, string id, bool restore, string? version, bool business = false, bool investmentOperation = false, bool cashbackOperation = false, bool promotionCompositeOperation = false, bool stageGOperation = false)
    {
        Require(!await db.Documents.AnyAsync(d=>d.UserId==user&&d.Kind==VehicleCostKind&&d.TransactionId==id),"交易已关联车辆费用，请先解除关联后变更");
        await ProtectSharedTransaction(user, id);
        Require(!await db.Set<TransactionStatementMatch>().AnyAsync(m=>m.UserId==user && m.TransactionId==id && m.State!="Revoked"), "交易存在账单核对记录，请先撤销匹配");
        if (!stageGOperation) await ProtectStageGTransaction(user, id);
        if (restore) await ValidateAuthorizedRestore(user, id);
        Require(cashbackOperation || !await db.Set<CashbackReceivable>().AnyAsync(x => x.UserId == user && (x.SettlementTransactionId == id || x.TransactionId == id && x.State != "Revoked")), "关联返现的交易须先处理返现记录");
        Require(promotionCompositeOperation || !await db.Set<PromotionTransferDraft>().AnyAsync(x => x.UserId == user && (x.TransferTransactionId == id || x.SubsidyTransactionId == id)), "补贴复合业务流水不能单独撤销或恢复");
        Require(cashbackOperation || !await db.Set<CashbackRecovery>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "返现追回流水须从返现管理处理");
        var t = await Transaction(user, id); Version(t, version); Require(investmentOperation || !await db.Set<InvestmentTrade>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "关联投资的资金流水须从投资详情受控撤销");
        Require(!await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && (x.FundingTransactionId == id || x.SettlementTransactionId == id || x.InterestTransactionId == id)), "存款关联流水受保护，请先核对存款历史"); Require(business || t.BusinessId is null, "关联业务交易须从借贷/报销详情处理");
        Require(restore ? t.Status == "Deleted" : t.Status != "Deleted", "交易状态已经改变");
        Require(!await db.Transactions.AnyAsync(x => x.UserId == user && x.OriginalTransactionId == id && x.Status != "Deleted"), "请先处理有效的关联退款");
        if (restore && t.Type == "Refund")
        {
            var original = await Transaction(user, t.OriginalTransactionId!);
            Require(original.Status != "Deleted", "原消费已删除，不能恢复退款");
            var refunds = await db.Transactions.Include(x => x.Entries).Where(x => x.UserId == user && x.OriginalTransactionId == original.Id && x.Status != "Deleted").ToListAsync();
            var recoveries = await PriceRecoveryTransactions(user, original.Id);
            Require(refunds.Sum(x => x.Amount) + t.Amount <= original.Amount + recoveries.Sum(x => x.Amount), "恢复后将超过可退款金额");
            foreach (var e in t.Entries.Where(x => x.Kind == "Expense")) Require(-e.Amount <= original.Entries.Where(x => x.CategoryId == e.CategoryId && x.Kind == "Expense").Sum(x => x.Amount) + refunds.Concat(recoveries).SelectMany(x => x.Entries).Where(x => x.Kind == "Expense" && x.CategoryId == e.CategoryId).Sum(x => x.Amount), "恢复后分类退款超额");
        }
        if (t.Type == "Refund") await ChangeRefundBenefits(user, id, restore);
        await ApplyBenefits(user, t, restore && t.PromotionJson != null ? JsonSerializer.Deserialize<PromotionInput>(t.PromotionJson, Json) : null, true);
        t.Status = restore ? "Confirmed" : "Deleted"; t.Version++; t.UpdatedAt = DateTimeOffset.UtcNow;
        var occurrence = await db.RecurringOccurrences.SingleOrDefaultAsync(x => x.UserId == user && x.TransactionId == id);
        if (occurrence is not null)
        {
            occurrence.State = restore ? "Posted" : "Revoked"; occurrence.Version++; occurrence.UpdatedAt = DateTimeOffset.UtcNow;
            RecurringLog(await Recurring(user, occurrence.RuleId), restore ? "TransactionRestore" : "TransactionRevoke", occurrence: occurrence);
        }
        foreach (var aid in t.Entries.Where(x => x.Kind == "Account").Select(x => x.AccountId!).Distinct()) (await Account(user, aid, false)).Version++;
        return new { t.Id };
    }
    public async Task<object[]> Attachments(string user, string transactionId) => await db.Documents.Where(x => x.UserId == user && x.TransactionId == transactionId && x.Kind == "Attachment").Select(x => (object)new { x.Id, name = x.Name, size = x.Content.Length, contentType = x.ContentType, uploadedAt = x.CreatedAt, downloadUrl = "/api/transactions/" + transactionId + "/attachments/" + x.Id + "/content", version = x.Version.ToString() }).ToArrayAsync();
}












