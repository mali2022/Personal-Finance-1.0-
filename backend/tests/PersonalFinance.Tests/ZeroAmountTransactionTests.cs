using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class ZeroAmountTransactionTests
{
    static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    static DateTimeOffset Now() => DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
    static string Month(DateTimeOffset now) => new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.FromHours(8)).ToString("yyyy-MM");
    static async Task<string> Category(DeletionSqlTests.Fixture f, string name, string kind, string? parent = null)
    {
        var result = Json(await f.Service.SaveCategory(f.User, new(name, kind, parent), null));
        await f.Db.SaveChangesAsync();
        return result.GetProperty("id").GetString()!;
    }
    // Transactions only accept a second or third level category.
    static async Task<string> Leaf(DeletionSqlTests.Fixture f, string name, string kind)
        => await Category(f, name, kind, await Category(f, name + "根", kind));
    static Account Account(DeletionSqlTests.Fixture f, string name, string currency = "CNY")
    {
        var account = new Account { UserId = f.User, Name = name, Currency = currency, OpeningBalance = 1000 };
        f.Db.Accounts.Add(account); return account;
    }
    static async Task<FinanceTransaction> Saved(DeletionSqlTests.Fixture f, object result)
    {
        var id = Json(result).GetProperty("id").GetString();
        await f.Db.SaveChangesAsync();
        return await f.Db.Transactions.Include(x => x.Entries).SingleAsync(x => x.Id == id);
    }

    [Fact] public void ZeroFormsAreAcceptedAndNegativeOrMalformedAmountsRejected()
    {
        Assert.Equal(0m, FinanceService.MoneyAllowZero("0"));
        Assert.Equal(0m, FinanceService.MoneyAllowZero("0.0"));
        Assert.Equal(0m, FinanceService.MoneyAllowZero("0.00"));
        Assert.Equal(12.34m, FinanceService.MoneyAllowZero("12.34"));
        Assert.Contains("金额必须大于零", Assert.Throws<ApiException>(() => FinanceService.MoneyAllowZero("-1")).Message);
        Assert.Contains("金额必须大于零", Assert.Throws<ApiException>(() => FinanceService.MoneyAllowZero("-0.01")).Message);
        Assert.Contains("金额格式无效", Assert.Throws<ApiException>(() => FinanceService.MoneyAllowZero("0.000")).Message);
        Assert.Contains("金额格式无效", Assert.Throws<ApiException>(() => FinanceService.MoneyAllowZero("abc")).Message);
        Assert.Throws<ApiException>(() => FinanceService.Money("0", true));
    }

    [DeletionSqlFact] public async Task ZeroAmountExpenseWritesNoEntriesAndShowsAsZeroInCategoryStatistics()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元支出账户"); await f.Db.SaveChangesAsync();
        var category = await Leaf(f, "零元支出验证", "Expense");
        var sibling = await Leaf(f, "零元支出对照", "Expense");
        var now = Now();
        var t = await Saved(f, await f.Service.SaveTransaction(f.User, new SaveTransaction("Expense", "0.00", account.Id, now, CategoryId: category, Merchant: "优惠券全抵扣")));
        Assert.Equal(0m, t.Amount); Assert.Equal(category, t.CategoryId); Assert.Empty(t.Entries);
        var stats = Json(await f.Service.CategoryStatistics(f.User, category, "CNY", Month(now)));
        var cumulative = stats.GetProperty("cumulative");
        Assert.Equal(1, cumulative.GetProperty("count").GetInt32());
        Assert.Equal(0, cumulative.GetProperty("positiveCount").GetInt32());
        Assert.Equal("0.00", cumulative.GetProperty("net").GetString());
        Assert.Equal("0.00", cumulative.GetProperty("gross").GetString());
        Assert.Equal("0.00", cumulative.GetProperty("average").GetString());
        Assert.Equal("0.00", stats.GetProperty("currentMonth").GetProperty("net").GetString());
        var merchant = Assert.Single(stats.GetProperty("merchants").EnumerateArray());
        Assert.Equal("优惠券全抵扣", merchant.GetProperty("name").GetString());
        Assert.Equal(1, merchant.GetProperty("summary").GetProperty("count").GetInt32());
        Assert.Equal(1, Assert.Single(stats.GetProperty("accounts").EnumerateArray()).GetProperty("summary").GetProperty("count").GetInt32());
        var overview = Json(await f.Service.CategoryOverview(f.User, "CNY")).GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetString() == category);
        Assert.Equal(1, overview.GetProperty("summary").GetProperty("count").GetInt32());
        Assert.Equal(0, Json(await f.Service.CategoryStatistics(f.User, sibling, "CNY", Month(now))).GetProperty("cumulative").GetProperty("count").GetInt32());
    }

    [DeletionSqlFact] public async Task ZeroAmountIncomeWritesNoEntriesAndShowsAsZeroInCategoryStatistics()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元收入账户"); await f.Db.SaveChangesAsync();
        var category = await Leaf(f, "零元收入验证", "Income");
        var now = Now();
        var t = await Saved(f, await f.Service.SaveTransaction(f.User, new SaveTransaction("Income", "0.0", account.Id, now, CategoryId: category)));
        Assert.Equal(0m, t.Amount); Assert.Empty(t.Entries);
        var cumulative = Json(await f.Service.CategoryStatistics(f.User, category, "CNY", Month(now))).GetProperty("cumulative");
        Assert.Equal(1, cumulative.GetProperty("count").GetInt32());
        Assert.Equal(0, cumulative.GetProperty("positiveCount").GetInt32());
        Assert.Equal("0.00", cumulative.GetProperty("net").GetString());
    }

    [DeletionSqlFact] public async Task ZeroAmountSameCurrencyTransferWritesNoEntries()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元转账转出"); var target = Account(f, "零元转账转入"); await f.Db.SaveChangesAsync();
        var t = await Saved(f, await f.Service.SaveTransaction(f.User, new SaveTransaction("Transfer", "0", account.Id, Now(), ToAccountId: target.Id)));
        Assert.Equal(0m, t.Amount); Assert.Equal(0m, t.ReceivedAmount ?? -1); Assert.Empty(t.Entries);
    }

    [DeletionSqlFact] public async Task ZeroAmountTransferWithFeeKeepsFeeEntryBaseAmount()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元含费转出"); var target = Account(f, "零元含费转入"); await f.Db.SaveChangesAsync();
        var feeCategory = await Leaf(f, "零元转账手续费", "Expense");
        var t = await Saved(f, await f.Service.SaveTransaction(f.User, new SaveTransaction("Transfer", "0.00", account.Id, Now(), ToAccountId: target.Id, Fee: "10", FeeCategoryId: feeCategory)));
        Assert.Equal(0m, t.Amount); Assert.Equal(10m, t.Fee); Assert.Equal(0m, t.ReceivedAmount ?? -1);
        Assert.Equal(2, t.Entries.Count);
        var fee = Assert.Single(t.Entries, x => x.Kind == "Expense");
        Assert.Equal(feeCategory, fee.CategoryId);
        Assert.Equal(10m, fee.Amount); Assert.Equal(10m, fee.BaseAmount);
        Assert.Equal(-10m, Assert.Single(t.Entries, x => x.Kind == "Account").Amount);
        Assert.Equal(0m, t.Entries.Sum(x => x.BaseAmount));
    }

    [DeletionSqlFact] public async Task ZeroAmountExpenseDoesNotDuplicateAssetLossCompensation()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元损失共存账户"); f.Db.Rules.Add(new StatisticsRules { UserId = f.User, IncludeAssetLoss = true }); await f.Db.SaveChangesAsync();
        var category = await Leaf(f, "零元损失共存验证", "Expense");
        var now = Now();
        await f.Service.SaveTransaction(f.User, new SaveTransaction("Expense", "0.00", account.Id, now, CategoryId: category)); await f.Db.SaveChangesAsync();
        var loss = new FinanceTransaction { UserId = f.User, Type = "AssetLoss", Amount = 100, AccountId = account.Id, CategoryId = category, Currency = "CNY", OccurredAt = now, Note = "零元补偿对照" };
        loss.Entries.Add(new Entry { UserId = f.User, TransactionId = loss.Id, Kind = "Account", AccountId = account.Id, Amount = -100, BaseAmount = -100 });
        loss.Entries.Add(new Entry { UserId = f.User, TransactionId = loss.Id, Kind = "Equity", Amount = 100, BaseAmount = 100 });
        f.Db.Transactions.Add(loss); await f.Db.SaveChangesAsync();
        var cumulative = Json(await f.Service.CategoryStatistics(f.User, category, "CNY", Month(now))).GetProperty("cumulative");
        Assert.Equal(2, cumulative.GetProperty("count").GetInt32());
        Assert.Equal("100.00", cumulative.GetProperty("net").GetString());
        Assert.Equal("100.00", cumulative.GetProperty("gross").GetString());
    }

    [DeletionSqlFact] public async Task OnlyExpenseIncomeTransferAcceptZero()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元类型校验账户"); await f.Db.SaveChangesAsync();
        var now = Now();
        async Task Reject(string type, string amount, string expected)
            => Assert.Contains(expected, (await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new SaveTransaction(type, amount, account.Id, now)))).Message);
        await Reject("Refund", "0", "金额必须大于零");
        await Reject("CreditCardPayment", "0.00", "金额必须大于零");
        await Reject("AssetLoss", "0", "金额必须大于零");
        await Reject("Adjustment", "0.0", "金额必须大于零");
        await Reject("Expense", "-1", "金额必须大于零");
        await Reject("Income", "-0.01", "金额必须大于零");
        await Reject("Transfer", "-1", "金额必须大于零");
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new SaveTransaction("Expense", "0.000", account.Id, now)));
    }

    [DeletionSqlFact] public async Task ZeroAmountExpenseRejectsMultiplePaymentsOrSplits()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元拆分付款甲"); var second = Account(f, "零元拆分付款乙"); await f.Db.SaveChangesAsync();
        var category = await Leaf(f, "零元拆分验证", "Expense");
        var now = Now();
        var payments = new[] { new PaymentSplit(account.Id, "0"), new PaymentSplit(second.Id, "0.00") };
        Assert.Contains("金额为零时只能使用一个付款账户", (await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new SaveTransaction("Expense", "0.00", account.Id, now, CategoryId: category, Payments: payments)))).Message);
        var splits = new[] { new Split(category, "0"), new Split(category, "0.00") };
        Assert.Contains("金额为零时只能使用一条拆分", (await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new SaveTransaction("Expense", "0.00", account.Id, now, CategoryId: category, Splits: splits)))).Message);
    }

    [DeletionSqlFact] public async Task ZeroAmountCrossCurrencyTransferIsRejected()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "跨币种零元转出"); var usd = Account(f, "跨币种零元转入", "USD"); await f.Db.SaveChangesAsync();
        var ex = await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new SaveTransaction("Transfer", "0", account.Id, Now(), ToAccountId: usd.Id)));
        Assert.Contains("跨币种转账的本金金额必须大于零", ex.Message);
    }

    [DeletionSqlFact] public async Task DatabaseCheckConstraintRejectsZeroAmountForOtherTypes()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = Account(f, "零元约束校验账户"); await f.Db.SaveChangesAsync();
        f.Db.Transactions.Add(new FinanceTransaction { UserId = f.User, Type = "Expense", Amount = 0, AccountId = account.Id, Currency = "CNY", OccurredAt = Now() });
        await f.Db.SaveChangesAsync();
        f.Db.Transactions.Add(new FinanceTransaction { UserId = f.User, Type = "Refund", Amount = 0, AccountId = account.Id, Currency = "CNY", OccurredAt = Now() });
        var rejected = await Assert.ThrowsAsync<DbUpdateException>(() => f.Db.SaveChangesAsync());
        Assert.Contains("CK_Transaction_Amounts", rejected.ToString());
    }
}
