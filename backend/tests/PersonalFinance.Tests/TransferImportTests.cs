using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class TransferImportTests
{
    private static JsonElement Body(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    private static ImportJob Job(DeletionSqlTests.Fixture f, params string[][] rows)
    {
        var job = new ImportJob { UserId = f.User, Source = "CSV", FileName = "transfer.csv",
            HeadersJson = JsonSerializer.Serialize(new[] { "日期时间", "交易类型", "转出账户", "转入账户", "金额", "币种", "手续费", "手续费分类", "到账金额", "汇率", "流水号" }),
            RawRowsJson = JsonSerializer.Serialize(rows) };
        f.Db.Imports.Add(job); return job;
    }
    private static JsonElement Mapping(string fallback) => Body(new { accountId = fallback, mapping = new {
        occurredAt = "日期时间", type = "交易类型", account = "转出账户", toAccount = "转入账户", amount = "金额", currency = "币种",
        fee = "手续费", feeCategory = "手续费分类", receivedAmount = "到账金额", exchangeRate = "汇率", externalId = "流水号" } });
    private static string[] Row(string type, string from, string to, string amount = "100", string fee = "0", string feeCategory = "", string received = "", string rate = "", string external = "")
        => ["2026-10-17 10:00:00", type, from, to, amount, "CNY", fee, feeCategory, received, rate, external];

    [DeletionSqlFact] public async Task TopUpAndWithdrawalPersistAsTransfersAndOnlyFeesCountAsExpense()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var bank = f.Account(); bank.Name = "银行卡"; var wallet = f.Account(); wallet.Name = "微信";
        var root = new Category { UserId = f.User, Kind = "Expense", Name = "金融" };
        var fee = new Category { UserId = f.User, Kind = "Expense", Name = "手续费", ParentId = root.Id };
        f.Db.Categories.AddRange(root, fee); await f.Db.SaveChangesAsync();
        var created = Body(await f.Service.SaveTransaction(f.User, new("Transfer", "100", bank.Id, DateTimeOffset.UtcNow, ToAccountId: wallet.Id, TransferKind: "TopUp")));
        await f.Db.SaveChangesAsync();
        var detail = Body(await f.Service.Detail(f.User, created.GetProperty("id").GetString()!));
        Assert.Equal("Transfer", detail.GetProperty("type").GetString()); Assert.Equal("TopUp", detail.GetProperty("transferKind").GetString());
        await f.Service.SaveTransaction(f.User, new("Transfer", "50", wallet.Id, DateTimeOffset.UtcNow, ToAccountId: bank.Id, Fee: "0.10", FeeCategoryId: fee.Id, TransferKind: "Withdrawal")); await f.Db.SaveChangesAsync();
        Assert.Equal(950m, await f.Service.Balance(f.User, bank.Id)); Assert.Equal(1049.90m, await f.Service.Balance(f.User, wallet.Id));
        Assert.Equal(0.10m, await f.Db.Entries.Where(x => x.UserId == f.User && x.Kind == "Expense").SumAsync(x => x.Amount));
        Assert.False(await f.Db.Entries.AnyAsync(x => x.UserId == f.User && x.Kind == "Income"));
        var tx = await f.Db.Transactions.SingleAsync(x => x.Id == created.GetProperty("id").GetString());
        await f.Service.SaveTransaction(f.User, new("Transfer", "100", bank.Id, tx.OccurredAt, ToAccountId: wallet.Id), tx.Id, tx.Version.ToString());
        Assert.Equal("TopUp", tx.TransferKind);
        await f.Service.SaveTransaction(f.User, new("Transfer", "100", bank.Id, tx.OccurredAt, ToAccountId: wallet.Id, TransferKind: ""), tx.Id, tx.Version.ToString());
        Assert.Null(tx.TransferKind);
    }

    [DeletionSqlFact] public async Task ImportUsesEachRowsAccountsRatherThanFallbackAndKeepsSubtypesAndFees()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var fallback = f.Account(); fallback.Name = "默认账户"; var bank = f.Account(); bank.Name = "银行"; bank.AccountCode = "BANK-01"; var wallet = f.Account(); wallet.Name = "微信"; wallet.Alias = "钱包别名";
        var root = new Category { UserId = f.User, Kind = "Expense", Name = "金融" }; var fee = new Category { UserId = f.User, Kind = "Expense", Name = "手续费", ParentId = root.Id }; f.Db.Categories.AddRange(root, fee);
        var job = Job(f, Row("充值", "BANK-01", "钱包别名", external: "001"), Row("提现", wallet.Id, bank.Id, "50", "0.10", fee.Id, external: "002"));
        await f.Db.SaveChangesAsync(); await f.Service.MapImport(f.User, job.Id, Mapping(fallback.Id), job.Version.ToString()); await f.Db.SaveChangesAsync();
        Assert.All(job.Rows, x => Assert.Equal("Ready", x.Status));
        await f.Service.CommitImport(f.User, job.Id, job.Version.ToString(), new(), "test-transfer", "test-trace"); await f.Db.SaveChangesAsync();
        var transactions = await f.Db.Transactions.Where(x => x.UserId == f.User).ToListAsync(); Assert.Equal(2, transactions.Count);
        Assert.Contains(transactions, x => x.Type == "Transfer" && x.TransferKind == "TopUp" && x.AccountId == bank.Id && x.ToAccountId == wallet.Id);
        Assert.Contains(transactions, x => x.TransferKind == "Withdrawal" && x.AccountId == wallet.Id && x.Fee == 0.10m);
        Assert.Equal(1000m, await f.Service.Balance(f.User, fallback.Id)); Assert.Equal(950m, await f.Service.Balance(f.User, bank.Id)); Assert.Equal(1049.90m, await f.Service.Balance(f.User, wallet.Id));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.CommitImport(f.User, job.Id, job.Version.ToString(), new(), "again", "trace"));
        Assert.Equal(2, await f.Db.Transactions.CountAsync(x => x.UserId == f.User));
        var repeat = Job(f, Row("充值", bank.Id, wallet.Id, external: "001")); await f.Db.SaveChangesAsync();
        await f.Service.MapImport(f.User, repeat.Id, Mapping(fallback.Id), repeat.Version.ToString()); Assert.Equal("Duplicate", repeat.Rows.Single().Status);
    }

    [DeletionSqlFact] public async Task InvalidAmbiguousSameAndOtherUsersAccountsAreNotSilentlyReplaced()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); a.Name = "账户A"; a.Alias = "同名"; var b = f.Account(); b.Name = "账户B"; b.Alias = "同名"; var inactive = f.Account(); inactive.Name = "已归档"; inactive.Status = "Archived";
        var foreignUser = new AppUser { Email = Guid.NewGuid()+"@test.invalid", PasswordHash = "no-login" }; f.Db.Users.Add(foreignUser);
        var foreign = new Account { UserId = foreignUser.Id, Name = "别人账户" }; f.Db.Accounts.Add(foreign);
        var job = Job(f, Row("转账", "不存在", b.Id), Row("充值", "同名", b.Id), Row("提现", a.Id, a.Id), Row("转账", foreign.Id, b.Id), Row("转账", a.Id, inactive.Id));
        await f.Db.SaveChangesAsync(); await f.Service.MapImport(f.User, job.Id, Mapping(a.Id), job.Version.ToString());
        Assert.All(job.Rows, row => Assert.Equal("Invalid", row.Status)); Assert.False(await f.Db.Transactions.AnyAsync(x => x.UserId == f.User));
        var row = job.Rows.First(); await f.Service.PatchImport(f.User, job.Id, row.Id, Body(new { accountId = a.Id }), job.Version.ToString()); Assert.Equal("Ready", row.Status);
    }

    [DeletionSqlFact] public async Task ForeignCurrencyImportValidatesAndAppliesReceivedAmount()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var cny = f.Account(); var usd = f.Account(); usd.Name = "美元账户"; usd.Currency = "USD";
        var job = Job(f, Row("转账", cny.Id, usd.Id, "700", received: "100", rate: "0.14285714")); await f.Db.SaveChangesAsync();
        await f.Service.MapImport(f.User, job.Id, Mapping(cny.Id), job.Version.ToString()); Assert.Equal("Ready", job.Rows.Single().Status);
        await f.Service.CommitImport(f.User, job.Id, job.Version.ToString(), new(), "fx", "fx-trace"); await f.Db.SaveChangesAsync();
        Assert.Equal(300m, await f.Service.Balance(f.User, cny.Id)); Assert.Equal(1100m, await f.Service.Balance(f.User, usd.Id));
        var invalid = Job(f, Row("转账", cny.Id, usd.Id, "700", received: "200", rate: "0.14285714")); await f.Db.SaveChangesAsync();
        await f.Service.MapImport(f.User, invalid.Id, Mapping(cny.Id), invalid.Version.ToString()); Assert.Equal("Invalid", invalid.Rows.Single().Status);
    }

    [DeletionSqlFact] public async Task MissingFeeCategoryAndInvalidTransferKindsAreRejected()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var a = f.Account(); var b = f.Account(); b.Name = "钱包"; await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new("Income", "1", a.Id, DateTimeOffset.UtcNow, TransferKind: "TopUp")));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new("Transfer", "1", a.Id, DateTimeOffset.UtcNow, ToAccountId: b.Id, TransferKind: "arbitrary")));
        var job = Job(f, Row("提现", a.Id, b.Id, fee: "0.10"), Row("充值", a.Id, b.Id, fee: "-1")); await f.Db.SaveChangesAsync();
        await f.Service.MapImport(f.User, job.Id, Mapping(a.Id), job.Version.ToString()); Assert.All(job.Rows, x => Assert.Equal("Invalid", x.Status));
    }

    [Fact] public void IdentityIncludesFeeAndFxButIgnoresPresentationSubtype()
    {
        var a = JsonNode.Parse("""{"accountId":"a","toAccountId":"b","currency":"CNY","type":"Transfer","amount":"100","occurredAt":"2026-10-17T10:00:00Z"}""")!;
        var b = a.DeepClone(); b["fee"] = "0.00"; b["transferKind"] = "TopUp"; Assert.Equal(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
        b["fee"] = "0.10"; Assert.NotEqual(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
        b = a.DeepClone(); b["receivedAmount"] = "10"; b["exchangeRate"] = "0.1"; Assert.NotEqual(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
    }
}
