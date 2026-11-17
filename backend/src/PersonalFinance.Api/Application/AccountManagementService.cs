using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record AccountDependency(string Name, long Count);
public sealed record AccountOrderRow(string Id, string Version);
public sealed record AccountOrderInput(AccountOrderRow[] Items, bool Reset = false);
[System.Text.Json.Serialization.JsonUnmappedMemberHandling(System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow)]
public sealed record AccountCardInput(string? LastFourDigits = null, string BankName = "", string CardHolderName = "", string CardBrand = "", string CardAlias = "", string? CardNumber = null);
public sealed record AccountGroupInput(string Name, int SortOrder = 0);
public sealed partial class FinanceService
{
    public async Task<object> AccountRelatedResources(string user,string id)
    {
        await Account(user,id,false);
        var businesses=await db.Businesses.Where(x=>x.UserId==user&&(x.AccountId==id||x.ContractAccountId==id)).Select(x=>new{x.Id,x.Kind,x.Counterparty,x.ContractAccountId,x.AccountId}).Take(100).ToArrayAsync();
        var assets=await db.Set<ManagedAsset>().Where(x=>x.UserId==user&&(x.AccountId==id||x.LiabilityAccountId==id)).Select(x=>new{x.Id,x.Name,x.Type,x.LiabilityAccountId,x.MaturityDate}).Take(100).ToArrayAsync();
        var investments=await db.Set<InvestmentAsset>().Where(x=>x.UserId==user&&x.AccountId==id).Select(x=>new{x.Id,x.Name}).Take(100).ToArrayAsync();
        var instruments=await db.Set<PaymentInstrument>().Where(x=>x.UserId==user&&x.AccountId==id).Select(x=>new{x.Id,x.Name,x.Type,x.State,x.EndsOn}).Take(100).ToArrayAsync();
        var recurring=await db.RecurringRules.Where(x=>x.UserId==user&&(x.AccountId==id||x.ToAccountId==id)).Select(x=>new{x.Id,x.Name,x.State,x.NextAt}).Take(100).ToArrayAsync();
        var reconciliations=await db.Reconciliations.Where(x=>x.UserId==user&&x.AccountId==id).OrderByDescending(x=>x.CreatedAt).Take(10).Select(x=>new{x.Id,x.CreatedAt}).ToArrayAsync();
        return new{dependencies=await AccountDependencies(user,id),businesses,assets,investments,instruments,recurring,reconciliations,limitPerKind=100};
    }
    public async Task<object> AccountAudit(string user,string id,IQueryCollection p)
    {
        // Deleted accounts retain immutable audit facts; access is still restricted to their owner.
        Require(await db.Accounts.AnyAsync(x=>x.UserId==user&&x.Id==id)||await db.AuditRecords.AnyAsync(x=>x.UserId==user&&x.ResourceType=="Account"&&x.ResourceId==id),"账户或删除审计不存在");
        var(page,size)=Paging(p);var query=db.AuditRecords.Where(x=>x.UserId==user&&x.ResourceType=="Account"&&x.ResourceId==id);
        return new{items=await query.OrderByDescending(x=>x.CreatedAt).Skip((page-1)*size).Take(size).Select(x=>new{x.Id,x.Action,x.CreatedAt,x.ChangesJson,x.OperationKey}).ToArrayAsync(),total=await query.CountAsync(),page,pageSize=size};
    }
    private static object AccountView(Account a, decimal balance, DateTimeOffset? lastTransactionAt = null, decimal? availableBalance = null) => new {
        a.Id, a.Name, a.Type, a.Currency, balance = M(balance), a.Institution, a.Status, a.Alias, a.AccountCode,
        a.GroupId, a.SortOrder, a.IsPinned, a.IsDefaultIncome, a.IsDefaultExpense, a.OpenedAt, a.ClosedAt, a.ArchivedAt, a.CreatedAt,
        availableBalance = availableBalance.HasValue ? M(availableBalance.Value) : null, a.BankBranch, a.Description, a.BillingMode, a.ContractNumber, a.LoanPurpose, a.CardBrand, a.CardAlias, a.CardHolderName, lastTransactionAt,
        cardNumber = a.CardNumber, lastFourDigits = a.CardLastFour, cardNumberMasked = a.CardLastFour == null ? null : "•••• " + a.CardLastFour,
        creditLimit = a.CreditLimit == null ? null : M(a.CreditLimit.Value), a.StatementDay, a.PaymentDay,
        debt = M((a.Type == "CreditCard" || a.Type == "ConsumerCredit") || AccountKinds.IsLoan(a.Type) ? Math.Max(0, -balance) : 0),
        availableCredit = (a.Type == "CreditCard" || a.Type == "ConsumerCredit") && a.CreditLimit.HasValue ? M(Math.Max(0, a.CreditLimit.Value + Math.Min(0, balance))) : null,
        version = a.Version.ToString()
    };
    private async Task ConfigureAccount(string user, Account a, SaveAccount b, bool creating)
    {
        Require(new[]{b.Alias,b.AccountCode,b.ContractNumber,b.LoanPurpose}.All(x=>x != null && x.Length<=200) && b.Description is { Length: <=2000 } && (b.Institution?.Length??0)<=200,"账户资料过长");
        Require(b.BankBranch == null || b.BankBranch.Length <=200, "银行网点过长");
        Require(string.IsNullOrEmpty(b.LastFourDigits) || System.Text.RegularExpressions.Regex.IsMatch(b.LastFourDigits,"^[0-9]{4}$"), "银行卡号仅保存末四位");
        Require(AccountKinds.IsBankCard(a.Type) || string.IsNullOrEmpty(b.LastFourDigits) && string.IsNullOrEmpty(b.BankBranch), "非银行卡账户不允许设置银行资料");
        SetAccountCardNumber(a, b.CardNumber, b.LastFourDigits);
        if(b.BankBranch!=null) a.BankBranch=b.BankBranch.Trim();
        Require(b.BillingMode is "Monthly" or "PerPurchase", "账期模式无效");
        Require(a.Type!="ConsumerCredit" || b.BillingMode!="Monthly" || b.StatementDay.HasValue && b.PaymentDay.HasValue,"消费信用月账期须明确账单日及还款日，不能推断产品规则");
        Require(b.ClosedAt == null || b.OpenedAt == null || b.ClosedAt >= b.OpenedAt, "销户日期早于开户日期");
        Require(b.Status != "Closed" || b.ClosedAt != null || a.Status == "Closed", "请提供机构实际销户日期");
        if (b.GroupId != null) Require(await db.Set<AccountGroup>().AnyAsync(x=>x.UserId==user && x.Id==b.GroupId),"账户分组不存在");
        if (a.Status != b.Status && b.Status != "Active") await EnsureAccountCanDeactivate(user,a.Id);
        Require(!AccountKinds.IsLoan(a.Type) || a.OpeningBalance==0,"贷款本金须通过既有借贷放款登记，不允许期初本金");
        Require(!(b.IsDefaultIncome||b.IsDefaultExpense) || b.Status=="Active" && !(a.Type == "Receivable" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan"),"默认账户必须为可用资金账户");
        Require(!b.IsDefaultIncome || !await db.Accounts.AnyAsync(x=>x.UserId==user && x.Id!=a.Id && x.IsDefaultIncome),"请先取消原默认收入账户");
        Require(!b.IsDefaultExpense || !await db.Accounts.AnyAsync(x=>x.UserId==user && x.Id!=a.Id && x.IsDefaultExpense),"请先取消原默认支出账户");
        a.Alias=b.Alias.Trim();a.AccountCode=b.AccountCode.Trim();a.GroupId=b.GroupId;a.IsPinned=b.IsPinned;
        a.IsDefaultIncome=b.IsDefaultIncome;a.IsDefaultExpense=b.IsDefaultExpense;a.OpenedAt=b.OpenedAt;a.ClosedAt=b.ClosedAt;
        a.Description=b.Description;a.BillingMode=b.BillingMode;a.ContractNumber=b.ContractNumber;a.LoanPurpose=b.LoanPurpose;
        a.ArchivedAt=b.Status=="Archived" ? a.ArchivedAt ?? DateTimeOffset.UtcNow : null;
        if(creating) a.SortOrder=(await db.Accounts.Where(x=>x.UserId==user).MaxAsync(x=>(int?)x.SortOrder)??-1)+1;
    }
    private static void SetAccountCardNumber(Account account, string? number, string? lastFour)
    {
        if (number != null)
        {
            Require(number.Length == 0 || System.Text.RegularExpressions.Regex.IsMatch(number, "\\A[0-9]{4,30}\\z"), "卡号须为4至30位数字或留空");
            Require(AccountKinds.IsBankCard(account.Type) || number.Length == 0, "非银行卡账户不允许设置银行资料");
            account.CardNumber = number.Length > 4 ? number : null;
            account.CardLastFour = number.Length == 0 ? null : number[^4..];
        }
        else if (lastFour != null)
        {
            // Legacy clients may send the displayed tail without editing the saved full number.
            if (lastFour != account.CardLastFour) account.CardNumber = null;
            account.CardLastFour = lastFour.Length == 0 ? null : lastFour;
        }
    }
    private async Task EnsureAccountCanDeactivate(string user,string id)
    {
        Require(!await db.RecurringRules.AnyAsync(x=>x.UserId==user && x.State=="Active" && (x.AccountId==id||x.ToAccountId==id)),"存在有效周期规则，请明确暂停或迁移后操作");
    }
    public async Task<object> AccountDetail(string user,string id) => AccountView(await Account(user,id,false),await Balance(user,id));
    public async Task<AccountDependency[]> AccountDependencies(string user,string id)
    {
        await Account(user,id,false);
        static string Q(string x)=>"["+x.Replace("]","]]")+"]";
        var queries=new List<string>();
        foreach(var entity in db.Model.GetEntityTypes())
        {
            if(entity.ClrType==typeof(Account)||entity.ClrType==typeof(AuditRecord)||entity.ClrType==typeof(Idempotency)||entity.ClrType==typeof(Session))continue;
            // Immutable AI scope snapshots are audit evidence, not live account bindings.
            // Keep them after deletion, just as we keep Account audit tombstones.
            if(entity.ClrType==typeof(AiRequestAudit)||entity.ClrType==typeof(AiToolAudit))continue;
            var table=entity.GetTableName();if(table==null)continue;
            var store=Microsoft.EntityFrameworkCore.Metadata.StoreObjectIdentifier.Table(table,entity.GetSchema());
            var tests=entity.GetProperties().Where(p=>p.ClrType==typeof(string) && (p.Name.EndsWith("AccountId",StringComparison.Ordinal)||p.Name=="AccountId"||p.Name.EndsWith("Json",StringComparison.Ordinal)))
                .Select(p=>Q(p.GetColumnName(store)!) + (p.Name.EndsWith("Json",StringComparison.Ordinal)?" LIKE @needle":" = @id")).ToArray();
            if(tests.Length==0)continue;
            queries.Add($"SELECT N'{entity.ClrType.Name}' AS [Name], COUNT_BIG(*) AS [Count] FROM {Q(entity.GetSchema()??"finance")}.{Q(table)} WHERE {string.Join(" OR ",tests)}");
        }
        // One set-based query includes deleted transactions, historical rules and JSON import/template bindings.
        return await db.Database.SqlQueryRaw<AccountDependency>(string.Join(" UNION ALL ",queries),new SqlParameter("@id",id),new SqlParameter("@needle","%"+id+"%"))
            .Where(x=>x.Count>0).ToArrayAsync();
    }
    public async Task<object> AccountDeletePreview(string user,string id)
    {
        var a=await Account(user,id,false);var dependencies=await AccountDependencies(user,id);var balance=await Balance(user,id);
        var reasons=dependencies.Select(x=>$"{AccountDependencyLabel(x.Name)} 存在 {x.Count} 条历史或关联记录").ToList();
        if(a.OpeningBalance!=0)reasons.Add("账户存在期初资金事实");
        if(a.IsDefaultIncome||a.IsDefaultExpense)reasons.Add("请先明确取消或更换默认账户");
        return new { allowed=reasons.Count==0,balance=M(balance),historicalTransactionCount=await db.Transactions.CountAsync(x=>x.UserId==user && (x.AccountId==id||x.ToAccountId==id||x.Entries.Any(e=>e.AccountId==id))),
            ledgerEntryCount=await db.Entries.CountAsync(x=>x.AccountId==id),dependencies,reasons,alternatives=new[]{"归档","停用"},version=a.Version.ToString() };
    }
    private static string AccountDependencyLabel(string name) => name switch
    {
        nameof(Entry) => "资金分录",
        nameof(FinanceTransaction) => "交易",
        _ => name
    };
    public async Task<object> DeleteAccount(string user,string id,string? version)
    {
        var a=await Account(user,id,false);Version(a,version);
        Require(a.OpeningBalance==0 && !a.IsDefaultIncome && !a.IsDefaultExpense,"期初资金或默认账户必须保留，请改为归档");
        Require((await AccountDependencies(user,id)).Length==0,"账户存在历史或业务引用，不能永久删除，请查看删除预览");
        db.Accounts.Remove(a);return new{id,deleted=true}; // CaptureAudit preserves a tombstone; no FK cascades.
    }
    public async Task<object> AccountArchive(string user,string id,string? version,bool restore)
    {
        var a=await Account(user,id,false);Version(a,version);
        if(!restore){await EnsureAccountCanDeactivate(user,id);Require(a.Status!="Closed","机构已销户账户不可改为软件归档");}
        else Require(a.Status=="Archived","只有归档账户可恢复");
        a.Status=restore?"Active":"Archived";a.ArchivedAt=restore?null:DateTimeOffset.UtcNow;
        a.IsDefaultIncome=false;a.IsDefaultExpense=false;a.Version++;return new{id,version=a.Version.ToString()};
    }
    public async Task<object> ReorderAccounts(string user,AccountOrderInput input)
    {
        Require(input.Items!=null && input.Items.Length<=2000 && input.Items.Select(x=>x.Id).Distinct().Count()==input.Items.Length,"排序账户重复或数量非法");
        var accounts=await db.Accounts.Where(x=>x.UserId==user).ToListAsync();
        Require(input.Items!.Length==accounts.Count && input.Items.All(x=>accounts.Any(a=>a.Id==x.Id)),"排序须包含当前用户所有账户，不得混入其他用户");
        foreach(var row in input.Items)Version(accounts.Single(a=>a.Id==row.Id),row.Version);
        var ids=input.Reset?accounts.OrderBy(a=>a.Name).ThenBy(a=>a.Id).Select(a=>a.Id).ToArray():input.Items.Select(x=>x.Id).ToArray();
        for(var i=0;i<ids.Length;i++){var a=accounts.Single(x=>x.Id==ids[i]);a.SortOrder=i;a.Version++;}
        return new{updated=ids.Length};
    }
    public async Task<object> SetAccountCard(string user,string id,AccountCardInput b,string? version)
    {
        var a=await Account(user,id,false);Version(a,version);Require(AccountKinds.IsBankCard(a.Type),"非银行卡账户不允许设置卡片资料");
        Require(b.LastFourDigits==null||System.Text.RegularExpressions.Regex.IsMatch(b.LastFourDigits,"^[0-9]{4}$"),"仅支持末四位，不接受完整卡号");
        Require(new[]{b.BankName,b.CardHolderName,b.CardBrand,b.CardAlias}.All(x=>x!=null&&x.Length<=200),"银行卡资料过长");
        SetAccountCardNumber(a,b.CardNumber,b.LastFourDigits);a.Institution=b.BankName;a.CardHolderName=b.CardHolderName;a.CardBrand=b.CardBrand;a.CardAlias=b.CardAlias;a.Version++;
        return new{id,cardNumber=a.CardNumber,lastFourDigits=a.CardLastFour,cardNumberMasked=a.CardLastFour==null?null:"•••• "+a.CardLastFour,version=a.Version.ToString()};
    }
    public async Task<object> SaveAccountGroup(string user,AccountGroupInput b,string? id,string? version)
    {
        Require(b.Name.Trim().Length is >0 and <=100 && b.SortOrder>=0,"分组名称或顺序无效");
        var group=id==null?new AccountGroup{UserId=user}:await db.Set<AccountGroup>().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id)??throw new ApiException(404,"分组不存在");
        if(id!=null){Version(group,version);group.Version++;}else db.Set<AccountGroup>().Add(group);
        group.Name=b.Name.Trim();group.SortOrder=b.SortOrder;return new{group.Id};
    }

    public async Task<object> DeleteAccountGroup(string user,string id,string? version)
    {
        var group=await db.Set<AccountGroup>().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id)??throw new ApiException(404,"分组不存在");
        Version(group,version);
        var members=await db.Accounts.Where(x=>x.UserId==user&&x.GroupId==id).ToListAsync();
        foreach(var a in members){a.GroupId=null;a.Version++;}
        db.Remove(group);return new{deleted=true,moved=members.Count};
    }
    public async Task<object> DeleteAllAccounts(string user,AccountOrderInput input)
    {
        var accounts=await db.Accounts.Where(x=>x.UserId==user).ToListAsync();
        Require(input.Items.Length==accounts.Count && input.Items.Select(x=>x.Id).Distinct().Count()==accounts.Count,"账户列表已变化，请刷新后重试");
        foreach(var a in accounts){var row=input.Items.SingleOrDefault(x=>x.Id==a.Id);Require(row!=null,"账户列表已变化");Version(a,row!.Version);}
        foreach(var a in accounts) await DeleteAccount(user,a.Id,a.Version.ToString());
        return new{deleted=accounts.Count};
    }
    public async Task<object> ImportAccounts(string user,SaveAccount[] items)
    {
        Require(items.Length is >0 and <=500,"每次导入1至500个账户");
        Require(items.All(x=>x.OpeningBalance=="0" && !x.IsDefaultIncome && !x.IsDefaultExpense),"导入仅创建空账户，不导入资金或默认设置");
        var names=await db.Accounts.Where(x=>x.UserId==user).Select(x=>x.Name).ToListAsync();
        var unique=new HashSet<string>(names,StringComparer.OrdinalIgnoreCase);
        var created=new List<object>();
        var nextOrder=(await db.Accounts.Where(x=>x.UserId==user).MaxAsync(x=>(int?)x.SortOrder)??-1)+1;
        foreach(var item in items){Require(unique.Add(item.Name.Trim()),"账户名称重复："+item.Name);created.Add(await SaveAccount(user,item,null,null));db.ChangeTracker.Entries<Account>().Last(e=>e.State==Microsoft.EntityFrameworkCore.EntityState.Added).Entity.SortOrder=nextOrder++;}
        return new{created=created.Count};
    }
}
