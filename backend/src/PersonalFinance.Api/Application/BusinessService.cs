using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> Directory(string user, string kind, IQueryCollection p)
    {
        Require(new[] { "projects", "merchants", "tags", "templates" }.Contains(kind), "目录类型无效");
        var (page, size) = Paging(p); var keyword = p["keyword"].ToString();
        var q = db.Directory.Where(x => x.UserId == user && x.Kind == kind);
        if (kind == "tags")
        {
            var group = p["group"].ToString();
            if (group.Length > 0)
            {
                Require(DefaultTags.Groups.Contains(group), "默认标签分组无效");
                var names = DefaultTags.Data.Items.Where(x => x.Group == group).Select(x => x.Name).ToArray();
                q = q.Where(x => names.Contains(x.Name));
            }
            if (keyword.Length > 0)
            {
                var names = DefaultTags.Data.Items.Where(x => x.Code.Contains(keyword) || x.Group.Contains(keyword)).Select(x => x.Name).ToArray();
                q = q.Where(x => x.Name.Contains(keyword) || names.Contains(x.Name));
            }
        }
        else q = q.Where(x => x.Name.Contains(keyword));
        var total = await q.CountAsync();
        List<DirectoryItem> rows;
        if (kind == "tags")
        {
            // Default codes are catalog metadata, so existing tag IDs and names remain untouched.
            // Fetch only identities to page in catalog order; ledger aggregation still covers this page only.
            var identities = await q.AsNoTracking().Select(x => new { x.Id, x.Name }).ToArrayAsync();
            var ids = identities.OrderBy(x => DefaultTags.Find(x.Name)?.Code ?? "9999", StringComparer.Ordinal)
                .ThenBy(x => x.Name).Skip((page - 1) * size).Take(size).Select(x => x.Id).ToArray();
            rows = (await q.Where(x => ids.Contains(x.Id)).ToListAsync())
                .OrderBy(x => DefaultTags.Find(x.Name)?.Code ?? "9999", StringComparer.Ordinal).ThenBy(x => x.Name).ToList();
        }
        else rows = await q.OrderBy(x => x.Name).Skip((page - 1) * size).Take(size).ToListAsync();
        var items = new List<object>();
        var metrics = new Dictionary<string, (int Count, DateTimeOffset? Last)>();
        var spentById = new Dictionary<string, decimal>();
        if (rows.Count > 0 && kind != "templates")
        {
            var ids = rows.Select(x => x.Id).ToArray();
            var selected = db.Directory.Where(d => d.UserId == user && ids.Contains(d.Id));
            var transactions = db.Transactions.Where(t => t.UserId == user && t.Status != "Deleted");
            // Limit aggregation to this page; no per-directory ledger queries.
            var links = from d in selected join t in transactions on d.Id equals t.ProjectId
                        where t.Currency == d.Currency select new { d.Id, Transaction = t };
            if (kind == "merchants")
                links = from d in selected join t in transactions on d.Name equals t.Merchant
                        where t.Currency == d.Currency select new { d.Id, Transaction = t };
            else if (kind == "tags")
                links = from d in selected join tag in db.Set<TransactionTag>() on d.Id equals tag.DirectoryId
                        join t in transactions on tag.TransactionId equals t.Id
                        where t.Currency == d.Currency select new { d.Id, Transaction = t };
            var counts = await links.GroupBy(x => x.Id).Select(g => new { Id = g.Key, Count = g.Count(), Last = g.Max(x => (DateTimeOffset?)x.Transaction.OccurredAt) }).ToListAsync();
            metrics = counts.ToDictionary(x => x.Id, x => (x.Count, x.Last));
            var rules = await Rules(user); var includeFees = rules.IncludeFees;
            spentById = await (from link in links join e in db.Entries on link.Transaction.Id equals e.TransactionId
                               where e.Kind == "Expense" && (includeFees || (link.Transaction.FeeCategoryId == null || e.CategoryId != link.Transaction.FeeCategoryId))
                               group e by link.Id into g select new { Id = g.Key, Amount = g.Sum(e => e.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
            if (rules.IncludeAssetLoss || rules.IncludeDecreasingAdjustments)
            {
                var includeLoss = rules.IncludeAssetLoss; var includeAdjustments = rules.IncludeDecreasingAdjustments;
                var extra = await links.Where(x => includeLoss && x.Transaction.Type == "AssetLoss" || includeAdjustments && x.Transaction.Type == "Adjustment" && x.Transaction.AdjustmentDirection == "Decrease")
                    .GroupBy(x => x.Id).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Transaction.Amount) }).ToListAsync();
                foreach (var value in extra) spentById[value.Id] = spentById.GetValueOrDefault(value.Id) + value.Amount;
            }
        }
        foreach (var d in rows)
        {
            var tag = kind == "tags" ? DefaultTags.Find(d.Name) : null;
            var spent = spentById.GetValueOrDefault(d.Id); var (count, last) = metrics.GetValueOrDefault(d.Id);
            items.Add(new { d.Id, d.Kind, d.Name, d.Currency, budget = M(d.Budget), spent = M(spent), transactionCount = count, d.CategoryId, d.AccountId, amount = d.Amount is null ? null : M(d.Amount.Value), d.StartDate, d.EndDate, d.Status, version = d.Version.ToString(), lastTransactionAt = last,
                defaultCode = tag?.Code, defaultGroup = tag?.Group });
        }
        return new { items, total, page, pageSize = size, defaultLibrary = kind == "tags" ? new { count = DefaultTags.Data.Items.Length, groups = DefaultTags.Groups } : null };
    }
    public async Task<object> ImportDefaultTags(string user)
    {
        var existing = await db.Directory.AsNoTracking().Where(x => x.UserId == user && x.Kind == "tags").Select(x => x.Name).ToArrayAsync();
        var missing = DefaultTags.Missing(user, existing);
        db.Directory.AddRange(missing);
        return new { imported = missing.Count, skipped = 600 - missing.Count, total = 600, groups = DefaultTags.Groups.Length, cashImpact = "0.00" };
    }
    public async Task<object> SaveDirectory(string user, string kind, SaveDirectory input, string? id, string? version)
    {
        Require(new[] { "projects", "merchants", "tags", "templates" }.Contains(kind) && input.Name.Trim().Length is > 0 and <= 150, "目录类型或名称无效");
        Require(CurrencyDefinitions.Supports(input.Currency) && new[] { "Active", "Disabled", "Completed" }.Contains(input.Status), "目录币种或状态无效");
        if (input.CategoryId is not null) await Category(user, input.CategoryId);
        if (input.AccountId is not null) { var a = await Account(user, input.AccountId); Require(a.Currency == input.Currency, "模板账户币种不一致"); }
        if (input.StartDate is not null) Date(input.StartDate);
        if (input.EndDate is not null) Require(input.StartDate is not null && Date(input.EndDate) >= Date(input.StartDate), "结束日期不能早于开始日期");
        var d = id is null ? new DirectoryItem { UserId = user, Kind = kind } : await db.Directory.SingleOrDefaultAsync(x => x.UserId == user && x.Kind == kind && x.Id == id) ?? throw new ApiException(404, "记录不存在");
        if(kind=="merchants")await EnsureMerchantName(user,input.Name.Trim(),id);
        if(kind=="merchants" && id!=null && d.Name!=input.Name.Trim()){
            Version(d,version);var key=MerchantMatchKey(d.Name);
            if(!await db.Set<MerchantAlias>().AnyAsync(x=>x.UserId==user && x.MatchKey==key))db.Add(new MerchantAlias{UserId=user,MerchantId=d.Id,Name=d.Name,MatchKey=key,Source="Rename"});
            foreach(var tx in await db.Transactions.Where(x=>x.UserId==user && x.Merchant==d.Name).ToArrayAsync()){tx.Merchant=input.Name.Trim();tx.Version++;}
        }
        if (id is not null) { Version(d, version); Require(d.Currency == input.Currency, "已有目录不可改变币种"); d.Version++; }
        d.Name = input.Name.Trim(); d.Currency = input.Currency; d.Budget = Money(input.Budget); Require(d.Budget >= 0, "预算不可为负");
        d.CategoryId = input.CategoryId; d.AccountId = input.AccountId; d.Amount = input.Amount is null ? null : Money(input.Amount, true); d.StartDate = input.StartDate; d.EndDate = input.EndDate; d.Status = input.Status;
        if (id is null) db.Directory.Add(d);if(kind=="merchants")InvalidateMerchantCache(user); return new { d.Id };
    }
    public async Task<object> DeleteDirectory(string user, string kind, string id, string? version)
    {
        var (records, rows) = await BuildDirectoryDeletion(user, kind, new DirectoryDeletion([new(id, version ?? "")]));
        if (!rows[0].Allowed) throw new ApiException(409, rows[0].Reason!, "DIRECTORY_IN_USE");
        db.Directory.Remove(records[0]);
        if(kind=="merchants")InvalidateMerchantCache(user);
        return new { records[0].Id, records[0].Kind, records[0].Name };
    }
    private async Task<Business> BusinessEntity(string user, string id) => await db.Businesses.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "借贷或报销记录不存在");
    private async Task<decimal> Settled(string user, Business b)
    { var types = new[] { "LoanRepaymentReceived", "LoanRepaymentPaid", "ReimbursementReceived" }; return await db.Transactions.Where(x => x.UserId == user && x.BusinessId == b.Id && x.Status != "Deleted" && (types.Contains(x.Type) || b.Kind=="Borrowed" && x.Type=="Refund" && x.AccountId==b.ContractAccountId || b.Kind == "Advance" && (x.Type == "AssetLoss" || x.Type == "Expense"))).SumAsync(x => (decimal?)x.Amount) ?? 0; }
    private async Task RequireActiveBusiness(string user, Business b)
    { Require(await db.Transactions.AnyAsync(x => x.UserId == user && x.BusinessId == b.Id && x.Status != "Deleted" && (x.Type == "LoanGiven" || x.Type == "LoanReceived" || x.Type == "ReimbursementAdvance")), "原始借贷/垫付交易已删除，请先恢复"); }
    public async Task<object> BusinessDetail(string user, string id)
    {
        var b = await BusinessEntity(user, id); var settled = await Settled(user, b);
        var history = await db.Transactions.Include(x => x.Entries).Include(x => x.Tags).AsSplitQuery().Where(x => x.UserId == user && x.BusinessId == id).OrderBy(x => x.OccurredAt).ToListAsync();
        return new { b.Id, b.Kind, b.Counterparty, b.Currency, principal = M(b.Principal), settled = M(settled), outstanding = M(b.Status == "Abandoned" ? 0 : b.Principal - settled), b.AccountId, b.ContractAccountId, b.OccurredAt, b.Note, status = b.Status == "Abandoned" ? "Abandoned" : settled == b.Principal ? "Settled" : settled > 0 ? "Partial" : b.Status, version = b.Version.ToString(), history = await ProjectTransactions(user, history) };
    }
    public async Task<object> Businesses(string user, IQueryCollection p)
    {
        var kind = p["kind"].ToString(); Require(new[] { "Lent", "Borrowed", "Reimbursement" }.Contains(kind), "业务类型无效");
        var (page, size) = Paging(p); var q = db.Businesses.Where(x => x.UserId == user && x.Kind == kind && db.Transactions.Any(t => t.UserId == user && t.BusinessId == x.Id && t.Status != "Deleted" && (t.Type == "LoanGiven" || t.Type == "LoanReceived" || t.Type == "ReimbursementAdvance"))); var total = await q.CountAsync();
        var ids = await q.OrderByDescending(x => x.OccurredAt).Skip((page - 1) * size).Take(size).Select(x => x.Id).ToArrayAsync(); var items = new List<object>();
        foreach (var id in ids) items.Add(await BusinessDetail(user, id)); return new { items, total, page, pageSize = size };
    }
    private void BusinessTransaction(string user, Business b, Account money, decimal amount, DateTimeOffset date, string note, string type, decimal moneySign, decimal contractSign, bool loss = false, string? categoryId = null)
    {
        var t = new FinanceTransaction { UserId = user, Type = type, Amount = amount, Currency = b.Currency, AccountId = loss ? b.ContractAccountId : money.Id, BusinessId = b.Id, CategoryId = categoryId, Merchant = b.Counterparty, OccurredAt = date.ToUniversalTime(), Note = note };
        t.Entries.Add(new Entry { UserId = user, TransactionId = t.Id, Kind = "Account", AccountId = loss ? b.ContractAccountId : money.Id, Currency = b.Currency, Amount = amount * moneySign, BaseAmount = amount * moneySign });
        t.Entries.Add(new Entry { UserId = user, TransactionId = t.Id, Kind = loss ? type == "Expense" ? "Expense" : "Equity" : "Account", AccountId = loss ? null : b.ContractAccountId, CategoryId = categoryId, Currency = b.Currency, Amount = amount * contractSign, BaseAmount = amount * contractSign });
        db.Transactions.Add(t); money.Version++;
    }
    public async Task<object> CreateBusiness(string user, BusinessInput input, bool stageGOperation = false)
    {
        Require(input.Kind != "Advance" || stageGOperation, "代付业务请从代买代付入口创建");
        Require(new[] { "Lent", "Borrowed", "Reimbursement", "Advance" }.Contains(input.Kind) && input.Counterparty.Trim().Length is > 0 and <= 200 && input.Note.Length <= 2000, "业务类型、对象或备注无效");
        Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.AssetAccountId == input.AccountId), "预付款专用账户不能创建借贷或垫付");
        var account = await Account(user, input.AccountId); Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan") && (!(account.Type == "CreditCard" || account.Type == "ConsumerCredit") || stageGOperation && input.Kind == "Advance"), "请选择实际资金账户；信用卡代付须使用受控代付入口"); var amount = Money(input.Amount, true);
        var b = new Business { UserId = user, Kind = input.Kind, Counterparty = input.Counterparty.Trim(), Currency = account.Currency, Principal = amount, AccountId = account.Id, OccurredAt = input.OccurredAt, Note = input.Note };
        var contract = new Account { UserId = user, Type = input.Kind == "Borrowed" ? "Payable" : "Receivable", Currency = account.Currency, Name = $"{(input.Kind == "Borrowed" ? "应付" : "应收")} · {b.Counterparty} · {b.Id[..8]}" };
        if (input.ContractAccountId != null)
        {
            Require(input.Kind == "Borrowed", "指定贷款账户仅适用于借入");
            contract = await Account(user, input.ContractAccountId);
            Require(AccountKinds.IsLoan(contract.Type) && contract.Currency == account.Currency && contract.OpeningBalance == 0, "贷款账户或币种不匹配");
            Require(!await db.Businesses.AnyAsync(x => x.ContractAccountId == contract.Id) && !await db.Entries.AnyAsync(x => x.AccountId == contract.Id), "贷款账户已有合同或本金，请从原合同还款");
        }
        else db.Accounts.Add(contract);
        b.ContractAccountId = contract.Id; db.Businesses.Add(b);
        BusinessTransaction(user, b, account, amount, input.OccurredAt, input.Note, input.Kind switch { "Borrowed" => "LoanReceived", "Lent" => "LoanGiven", _ => "ReimbursementAdvance" }, input.Kind == "Borrowed" ? 1 : -1, input.Kind == "Borrowed" ? -1 : 1);
        return new { b.Id };
    }
    public async Task<object> SettleBusiness(string user, string id, SettlementInput input, string? version, bool stageGOperation = false)
    {
        Require(stageGOperation || !await db.Businesses.AnyAsync(x => x.UserId == user && x.Id == id && x.Kind == "Advance"), "代付结算请从代买代付入口处理");
        Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.AssetAccountId == input.AccountId), "预付款专用账户不能用于专项往来结算");
        var b = await BusinessEntity(user, id); Version(b, version); await RequireActiveBusiness(user, b); Require(b.Status != "Abandoned", "已放弃的报销不可继续到账");
        var amount = Money(input.Amount, true); Require(amount <= b.Principal - await Settled(user, b), "金额超过剩余应收/应付"); Require(input.OccurredAt >= b.OccurredAt, "到账日期不能早于原始垫付/借款日期");
        var account = await Account(user, input.AccountId); Require(account.Currency == b.Currency && !(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan") && (!(account.Type == "CreditCard" || account.Type == "ConsumerCredit") || stageGOperation && b.Kind == "Advance"), "结算账户或币种无效");
        BusinessTransaction(user, b, account, amount, input.OccurredAt, input.Note, b.Kind switch { "Borrowed" => "LoanRepaymentPaid", "Lent" => "LoanRepaymentReceived", _ => "ReimbursementReceived" }, b.Kind == "Borrowed" ? -1 : 1, b.Kind == "Borrowed" ? 1 : -1);
        (await Account(user, b.ContractAccountId, false)).Version++; b.Version++; return new { b.Id };
    }
    public async Task<object> BusinessStatus(string user, string id, string status, string? version)
    {
        var b = await BusinessEntity(user, id); Version(b, version); await RequireActiveBusiness(user, b); Require(b.Kind == "Reimbursement" && b.Status != "Abandoned", "业务状态不可修改");
        Require(status is "Submitted" or "Abandoned", "状态无效");
        if (status == "Submitted") Require(b.Status == "Draft", "只有待提交报销可提交");
        else
        {
            var remaining = b.Principal - await Settled(user, b); Require(remaining > 0, "没有剩余报销金额"); var contract = await Account(user, b.ContractAccountId, false);
            BusinessTransaction(user, b, contract, remaining, DateTimeOffset.UtcNow, "放弃报销", "AssetLoss", -1, 1, true);
        }
        b.Status = status; b.Version++; return new { b.Id };
    }
    public async Task<object> DeleteLoan(string user, string id, string? version)
    {
        var b = await BusinessEntity(user, id); Version(b, version);
        Require(b.Kind is "Lent" or "Borrowed", "仅借出与借入支持此删除操作");
        var rows = await db.Transactions.Where(t => t.UserId == user && t.BusinessId == id && t.Status != "Deleted")
            .OrderBy(t => t.Type == "LoanGiven" || t.Type == "LoanReceived" ? 1 : 0).ThenByDescending(t => t.OccurredAt).ToListAsync();
        Require(rows.Count > 0, "借贷记录已删除");
        foreach (var row in rows) await ChangeTransaction(user, row.Id, false, row.Version.ToString(), true);
        foreach (var plan in await db.Set<DebtRepaymentPlan>().Where(p => p.UserId == user && p.BusinessId == id && p.State == "Active").ToListAsync())
        { plan.State = "Archived"; plan.Version++; plan.UpdatedAt = DateTimeOffset.UtcNow; }
        b.Version++;
        return new { b.Id, deleted = rows.Count };
    }
    public async Task<object> BusinessChange(string user, string id, string transactionId, bool restore, string? version)
    {
        Require(!await db.Businesses.AnyAsync(x => x.UserId == user && x.Id == id && x.Kind == "Advance"), "代付关联业务流水受保护，请从代付记录核对");
        var b = await BusinessEntity(user, id); Version(b, version); var t = await Transaction(user, transactionId); Require(t.BusinessId == id, "交易不属于该业务");
        var originalTypes = new[] { "LoanGiven", "LoanReceived", "ReimbursementAdvance" };
        if (originalTypes.Contains(t.Type))
            Require(!await db.Transactions.AnyAsync(x => x.UserId == user && x.BusinessId == id && x.Id != transactionId && x.Status != "Deleted"), "请先处理有效结算或损失记录");
        else if (restore && t.Type != "AssetLoss") { await RequireActiveBusiness(user, b); Require(b.Status != "Abandoned" && t.Amount <= b.Principal - await Settled(user, b), "恢复结算将超过剩余额度"); }
        else if (restore) Require(t.Amount == b.Principal - await Settled(user, b), "剩余报销金额已改变，不能恢复原损失");
        if (t.Type == "AssetLoss") b.Status = restore ? "Abandoned" : "Submitted";
        await ChangeTransaction(user, transactionId, restore, t.Version.ToString(), true); b.Version++; return new { b.Id };
    }
}


