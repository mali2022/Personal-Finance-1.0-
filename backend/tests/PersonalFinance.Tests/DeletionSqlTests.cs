using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

public sealed class DeletionSqlFactAttribute : FactAttribute
{
    public DeletionSqlFactAttribute()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PF_DELETION_TEST_DATABASE")))
            Skip = "Set PF_DELETION_TEST_DATABASE to an existing isolated RestoreCheck database; every test rolls back.";
    }
}

[Collection("Finance SQL")]
public sealed class DeletionSqlTests
{
    internal sealed class Fixture : IAsyncDisposable
    {
        public readonly string User = Guid.NewGuid().ToString();
        public readonly FinanceDb Db;
        public readonly FinanceService Service;
        private readonly ServiceProvider provider = new ServiceCollection().BuildServiceProvider();
        private Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction;
        public Fixture()
        {
            Db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
            Service = new FinanceService(Db, provider.GetRequiredService<IServiceScopeFactory>(), NullLogger<FinanceService>.Instance);
        }
        public async Task Initialize()
        {
            transaction = await Db.Database.BeginTransactionAsync();
            // Bring an older verification copy up to date only inside the rollback transaction.
            // No schema change, test user, or financial write survives DisposeAsync.
            var applied = (await Db.Database.GetAppliedMigrationsAsync()).LastOrDefault();
            var script = Db.GetService<IMigrator>().GenerateScript(applied, options: MigrationsSqlGenerationOptions.NoTransactions);
            foreach (var batch in System.Text.RegularExpressions.Regex.Split(script, @"^GO\s*$", System.Text.RegularExpressions.RegexOptions.Multiline | System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                if (!string.IsNullOrWhiteSpace(batch)) await Db.Database.ExecuteSqlRawAsync(batch);
            Db.Users.Add(new AppUser { Id = User, Email = User + "@deletion.test", PasswordHash = "no-login" });
            await Db.SaveChangesAsync();
        }
        public DirectoryItem Directory(string kind, string name) { var d = new DirectoryItem { UserId = User, Kind = kind, Name = name }; Db.Directory.Add(d); return d; }
        public FinanceTransaction Expense(Account account, DirectoryItem? project = null, DirectoryItem? tag = null)
        {
            var t = new FinanceTransaction { UserId = User, Type = "Expense", Amount = 10, AccountId = account.Id, ProjectId = project?.Id, Currency = "CNY", OccurredAt = DateTimeOffset.UtcNow, Merchant = "历史商户" };
            t.Entries.Add(new Entry { UserId = User, Kind = "Account", AccountId = account.Id, Amount = -10, BaseAmount = -10, TransactionId = t.Id });
            t.Entries.Add(new Entry { UserId = User, Kind = "Expense", Amount = 10, BaseAmount = 10, TransactionId = t.Id });
            if (tag != null) t.Tags.Add(new TransactionTag { TransactionId = t.Id, DirectoryId = tag.Id });
            Db.Transactions.Add(t); return t;
        }
        public Account Account() { var a = new Account { UserId = User, Name = "测试现金", OpeningBalance = 1000 }; Db.Accounts.Add(a); return a; }
        public async ValueTask DisposeAsync() { if (transaction != null) { await transaction.RollbackAsync(); await transaction.DisposeAsync(); } await Db.DisposeAsync(); await provider.DisposeAsync(); }
    }
    private static JsonElement Result(object result) => JsonSerializer.SerializeToElement(result, FinanceService.Json);
    private static DirectoryDeletion Selection(params DirectoryItem[] records) => new(records.Select(x => new DeleteItem(x.Id, x.Version.ToString())).ToArray());

    [DeletionSqlFact] public async Task FullAccountCardNumberRoundTripsAndLegacyTailRemainsCompatible()
    {
        await using var f = new Fixture(); await f.Initialize();
        const string number = "0012345678901234567";
        var created = Result(await f.Service.SaveAccount(f.User, new SaveAccount("完整卡号", "Bank", "CNY", CardNumber: number), null, null));
        await f.Db.SaveChangesAsync();
        var id = created.GetProperty("id").GetString()!;
        var account = await f.Db.Accounts.SingleAsync(x => x.Id == id);
        f.Db.ChangeTracker.Clear();
        var detail = Result(await f.Service.AccountDetail(f.User, id));
        Assert.Equal(number, detail.GetProperty("cardNumber").GetString());
        Assert.Equal("4567", detail.GetProperty("lastFourDigits").GetString());
        Assert.Equal("•••• 4567", detail.GetProperty("cardNumberMasked").GetString());
        await f.Service.SetAccountCard(f.User, id, new AccountCardInput("4567"), account.Version.ToString());
        await f.Db.SaveChangesAsync();
        Assert.Equal(number, (await f.Db.Accounts.SingleAsync(x => x.Id == id)).CardNumber);
        account = await f.Db.Accounts.SingleAsync(x => x.Id == id);
        await f.Service.SetAccountCard(f.User, id, new AccountCardInput(CardNumber: ""), account.Version.ToString());
        await f.Db.SaveChangesAsync();
        Assert.Null(account.CardNumber); Assert.Null(account.CardLastFour);
        await f.Service.SetAccountCard(f.User, id, new AccountCardInput("1234"), account.Version.ToString());
        await f.Db.SaveChangesAsync(); Assert.Equal("1234", account.CardLastFour); Assert.Null(account.CardNumber);
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SetAccountCard(f.User, id, new AccountCardInput(CardNumber: "123x5678"), account.Version.ToString()));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SetAccountCard(f.User, id, new AccountCardInput(CardNumber: new string('1', 31)), account.Version.ToString()));
        var cash = f.Account(); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SetAccountCard(f.User, cash.Id, new AccountCardInput(CardNumber: number), cash.Version.ToString()));
        Assert.Equal("[内容已脱敏]", FinanceService.AuditValue("CardNumber", number));
    }

    [DeletionSqlFact] public async Task AccountDeletionRetainsAiAuditsButProtectsFinancialHistory()
    {
        await using var f = new Fixture(); await f.Initialize();
        var account = f.Account(); account.OpeningBalance = 0;
        var scope = JsonSerializer.Serialize(new[] { account.Id });
        var request = new AiRequestAudit { Id = Guid.NewGuid().ToString(), UserId = f.User, AccountScopeJson = scope };
        var tool = new AiToolAudit { UserId = f.User, AccountScopeJson = scope };
        f.Db.AddRange(request, tool); await f.Db.SaveChangesAsync();
        Assert.True(Result(await f.Service.AccountDeletePreview(f.User, account.Id)).GetProperty("allowed").GetBoolean());
        var transaction = f.Expense(account); transaction.Status = "Deleted"; await f.Db.SaveChangesAsync();
        var preview = Result(await f.Service.AccountDeletePreview(f.User, account.Id));
        Assert.False(preview.GetProperty("allowed").GetBoolean());
        Assert.DoesNotContain("AiRequestAudit", preview.GetRawText());
        Assert.DoesNotContain("AiToolAudit", preview.GetRawText());
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteAccount(f.User, account.Id, account.Version.ToString()));
        var empty = f.Account(); empty.Name = "无历史空账户"; empty.OpeningBalance = 0;
        request.AccountScopeJson = tool.AccountScopeJson = JsonSerializer.Serialize(new[] { empty.Id });
        await f.Db.SaveChangesAsync();
        await f.Service.DeleteAccount(f.User, empty.Id, empty.Version.ToString()); await f.Db.SaveChangesAsync();
        Assert.False(await f.Db.Accounts.AnyAsync(x => x.Id == empty.Id));
        Assert.True(await f.Db.Set<AiRequestAudit>().AnyAsync(x => x.Id == request.Id));
        Assert.True(await f.Db.Set<AiToolAudit>().AnyAsync(x => x.Id == tool.Id));
    }

    [DeletionSqlFact] public async Task MerchantDeletionKeepsHistoricalTransactions()
    {
        await using var f = new Fixture(); await f.Initialize();
        var merchant = f.Directory("merchants", "历史商户"); var t = f.Expense(f.Account()); await f.Db.SaveChangesAsync();
        await f.Service.DeleteDirectory(f.User, "merchants", merchant.Id, "1"); await f.Db.SaveChangesAsync();
        Assert.False(await f.Db.Directory.AnyAsync(x => x.Id == merchant.Id));
        Assert.Equal("历史商户", (await f.Db.Transactions.AsNoTracking().SingleAsync(x => x.Id == t.Id)).Merchant);
        Assert.Equal(990, await f.Service.Balance(f.User, t.AccountId));
    }

    [DeletionSqlFact] public async Task TagAndProjectReferencesAreSkippedIncludingDeletedTransactions()
    {
        await using var f = new Fixture(); await f.Initialize();
        var project = f.Directory("projects", "已用项目"); var freeProject = f.Directory("projects", "未用项目");
        var tag = f.Directory("tags", "已用标签"); var freeTag = f.Directory("tags", "未用标签");
        var t = f.Expense(f.Account(), project, tag); t.Status = "Deleted"; await f.Db.SaveChangesAsync();
        foreach (var pair in new[] { ("projects", project, freeProject), ("tags", tag, freeTag) })
        {
            var preview = Result(await f.Service.DirectoryDeletionPreview(f.User, pair.Item1, new([], true)));
            Assert.Equal(1, preview.GetProperty("blocked").GetInt32());
            var result = Result(await f.Service.DeleteDirectories(f.User, pair.Item1, Selection(pair.Item2, pair.Item3)));
            Assert.Equal(1, result.GetProperty("deleted").GetInt32()); Assert.Equal(1, result.GetProperty("skipped").GetArrayLength());
            await f.Db.SaveChangesAsync(); Assert.True(await f.Db.Directory.AnyAsync(x => x.Id == pair.Item2.Id));
            Assert.False(await f.Db.Directory.AnyAsync(x => x.Id == pair.Item3.Id));
            await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteDirectory(f.User, pair.Item1, pair.Item2.Id, "1"));
        }
        Assert.Equal("Deleted", (await f.Db.Transactions.AsNoTracking().SingleAsync(x => x.Id == t.Id)).Status);
    }

    [DeletionSqlFact] public async Task FullPreviewSpans5000RecordsAndApplyUsesExactSnapshot()
    {
        await using var f = new Fixture(); await f.Initialize();
        for (var i = 0; i < 5000; i++) f.Directory("tags", "批量标签" + i.ToString("D5"));
        await f.Db.SaveChangesAsync();
        var preview = Result(await f.Service.DirectoryDeletionPreview(f.User, "tags", new([], true)));
        Assert.Equal(5000, preview.GetProperty("total").GetInt32());
        var items = preview.GetProperty("items").EnumerateArray().Select(x => new DeleteItem(x.GetProperty("id").GetString()!, x.GetProperty("version").GetString()!)).ToArray();
        var later = f.Directory("tags", "预览后新增"); await f.Db.SaveChangesAsync();
        Assert.Equal(5000, Result(await f.Service.DeleteDirectories(f.User, "tags", new(items))).GetProperty("deleted").GetInt32());
        await f.Db.SaveChangesAsync();
        Assert.Equal(later.Id, (await f.Db.Directory.SingleAsync(x => x.UserId == f.User && x.Kind == "tags")).Id);
    }

    [DeletionSqlFact] public async Task DirectoryVersionAndOwnershipConflictsPreventDeletion()
    {
        await using var f = new Fixture(); await f.Initialize(); var a = f.Directory("projects", "项目A"); var b = f.Directory("projects", "项目B"); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteDirectories(f.User, "projects", new([new(a.Id, "1"), new(b.Id, "0")])));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteDirectories(Guid.NewGuid().ToString(), "projects", Selection(a)));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteDirectories(f.User, "projects", new([], true)));
        Assert.Equal(2, await f.Db.Directory.CountAsync(x => x.UserId == f.User));
        Assert.DoesNotContain(f.Db.ChangeTracker.Entries(), x => x.State == EntityState.Deleted);
    }

    [DeletionSqlFact] public async Task RuleReferencesBlockTagsAndProjectsAndFullPreviewStaysUserScoped()
    {
        await using var f = new Fixture(); await f.Initialize();
        var project = f.Directory("projects", "规则项目"); var tag = f.Directory("tags", "规则标签");
        var other = new DirectoryItem { UserId = Guid.NewGuid().ToString(), Kind = "tags", Name = "其他用户标签" };
        f.Db.Users.Add(new AppUser { Id = other.UserId, Email = other.UserId + "@deletion.test", PasswordHash = "no-login" });
        await f.Db.SaveChangesAsync();
        f.Db.Directory.Add(other);
        f.Db.AutomationRules.Add(new AutomationRule { UserId = f.User, Name = "引用测试", ActionsJson = JsonSerializer.Serialize(new { projectId = project.Id, addTagIds = new[] { tag.Id } }) });
        await f.Db.SaveChangesAsync();
        foreach (var kind in new[] { "tags", "projects" })
        {
            var preview = Result(await f.Service.DirectoryDeletionPreview(f.User, kind, new([], true)));
            Assert.Equal(1, preview.GetProperty("total").GetInt32()); Assert.Equal(1, preview.GetProperty("blocked").GetInt32());
        }
        Assert.Equal(0, Result(await f.Service.DeleteDirectories(f.User, "tags", Selection(tag))).GetProperty("deleted").GetInt32());
        Assert.True(await f.Db.Directory.AnyAsync(x => x.Id == other.Id));
    }

    [DeletionSqlFact] public async Task TransactionBatchUpdatesBalancesAndRestores()
    {
        await using var f = new Fixture(); await f.Initialize(); var account = f.Account(); var a = f.Expense(account); var b = f.Expense(account); await f.Db.SaveChangesAsync();
        Assert.Equal(980, await f.Service.Balance(f.User, account.Id));
        await f.Service.DeleteTransactions(f.User, new([new(a.Id, "1"), new(b.Id, "1")])); await f.Db.SaveChangesAsync();
        Assert.Equal(1000, await f.Service.Balance(f.User, account.Id));
        Assert.Equal(2, await f.Db.Transactions.CountAsync(x => x.UserId == f.User && x.Status == "Deleted"));
        await f.Service.ChangeTransaction(f.User, a.Id, true, "2"); await f.Db.SaveChangesAsync();
        Assert.Equal(990, await f.Service.Balance(f.User, account.Id));
    }

    [DeletionSqlFact] public async Task TransactionBatchConflictDoesNotPersistEarlierChanges()
    {
        await using var f = new Fixture(); await f.Initialize(); var account = f.Account(); var a = f.Expense(account); var b = f.Expense(account); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteTransactions(f.User, new([new(a.Id, "1"), new(b.Id, "0")])));
        Assert.Equal(2, await f.Db.Transactions.AsNoTracking().CountAsync(x => x.UserId == f.User && x.Status == "Confirmed"));
        Assert.Equal(980, await f.Service.Balance(f.User, account.Id));
    }

    [DeletionSqlFact] public async Task DuplicateAndOversizedTransactionSelectionsAreRejected()
    {
        await using var f = new Fixture(); await f.Initialize(); var item = new DeleteItem(Guid.NewGuid().ToString(), "1");
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteTransactions(f.User, new([item, item])));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteTransactions(f.User, new(Enumerable.Range(0, 101).Select(_ => new DeleteItem(Guid.NewGuid().ToString(), "1")).ToArray())));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteTransactions(f.User, new([])));
    }
}
