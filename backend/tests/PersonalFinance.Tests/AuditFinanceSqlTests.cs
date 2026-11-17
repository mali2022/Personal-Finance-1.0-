using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

namespace PersonalFinance.Tests;

[Collection("Finance SQL")]
public sealed class AuditFinanceSqlTests
{
    private static JsonElement Result(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    private static QueryCollection Query(params (string key, string value)[] values)
        => new(values.ToDictionary(x => x.key, x => new StringValues(x.value)));
    private static DateOnly Today => DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
    private static DateTimeOffset At(DateOnly day) => new(day.ToDateTime(new TimeOnly(12, 0)), TimeSpan.FromHours(8));

    private static async Task<(InvestmentAsset asset, InvestmentTrade early)> InvestmentHistory(DeletionSqlTests.Fixture f)
    {
        var account = f.Account(); account.Type = "Investment";
        var asset = new InvestmentAsset { UserId = f.User, AccountId = account.Id, Name = "结算时序回归" };
        InvestmentTrade Trade(string type, int date, int settled) => new()
        {
            UserId = f.User, AssetId = asset.Id, Type = type, Date = new(2026, 1, date), SettlementDate = new(2026, 1, settled),
            Quantity = 10, Amount = 100, OwnsTransaction = true
        };
        var early = Trade("Buy", 2, 3);
        f.Db.AddRange(asset, Trade("Buy", 1, 10), early, Trade("Sell", 4, 4)); await f.Db.SaveChangesAsync();
        return (asset, early);
    }

    [DeletionSqlFact]
    public async Task SingleInvestmentRevocationRejectsNegativeSettlementHistoryForPreviewAndApply()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var (_, early) = await InvestmentHistory(f);
        foreach (var preview in new[] { true, false })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => f.Service.RevokeInvestmentTrade(f.User, early.Id, new("更正买入"), "1", preview));
            Assert.Contains("结算历史", error.Message);
        }
        Assert.Equal("Active", (await f.Db.Set<InvestmentTrade>().AsNoTracking().SingleAsync(x => x.Id == early.Id)).State);
        Assert.Empty(await f.Db.Set<InvestmentHistory>().Where(x => x.UserId == f.User).ToArrayAsync());
    }

    [DeletionSqlFact]
    public async Task GroupInvestmentRevocationUsesTheSameSettlementValidation()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var (asset, early) = await InvestmentHistory(f);
        var dividend = new InvestmentTrade { UserId = f.User, AssetId = asset.Id, Type = "Dividend", Date = early.Date, SettlementDate = early.SettlementDate, Amount = 100, OwnsTransaction = true };
        var history = new InvestmentHistory
        {
            UserId = f.User, AssetId = asset.Id, Kind = "Reinvestment",
            SnapshotJson = JsonSerializer.Serialize(new { dividendTradeId = dividend.Id, buyTradeId = early.Id })
        };
        f.Db.AddRange(dividend, history); await f.Db.SaveChangesAsync();
        foreach (var preview in new[] { true, false })
            Assert.Contains("结算历史", (await Assert.ThrowsAsync<ApiException>(() => f.Service.RevokeReinvestment(f.User, history.Id, new("成组更正"), "1", preview))).Message);
        Assert.Equal(4, await f.Db.Set<InvestmentTrade>().CountAsync(x => x.UserId == f.User && x.State == "Active"));
        Assert.False(await f.Db.Set<InvestmentHistory>().AnyAsync(x => x.UserId == f.User && x.Kind == "ReinvestmentRevoked"));
    }

    [DeletionSqlFact]
    public async Task ElectronicWalletReserveForecastAndFundHoldsUseTheSameLiquidFunds()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var wallet = f.Account(); wallet.Type = "ElectronicWallet"; wallet.OpeningBalance = 10000;
        var goal = new SavingsGoal { UserId = f.User, Name = "应急储备", Type = "Emergency", Target = 10000, State = "Active", StartDate = Today, TargetDate = Today.AddYears(1) };
        f.Db.AddRange(goal, new GoalAllocation { UserId = f.User, GoalId = goal.Id, AccountId = wallet.Id, Amount = 10000 },
            new AccountFundHold { UserId = f.User, AccountId = wallet.Id, State = "Confirmed", Amount = 1000 });
        await f.Db.SaveChangesAsync();
        var emergency = Result(await f.Service.EmergencyFund(f.User, Query(("currency", "CNY"), ("months", "3"), ("goalIds", goal.Id))));
        Assert.Equal("10000.00", emergency.GetProperty("availableReserve").GetString());
        Assert.Equal("0.00", emergency.GetProperty("shortage").GetString());
        var forecast = Result(await f.Service.CashFlowForecast(f.User, Query(("currency", "CNY"), ("start", Today.ToString("yyyy-MM-dd")), ("end", Today.AddDays(2).ToString("yyyy-MM-dd")), ("creditFundingAccountId", wallet.Id))));
        Assert.Equal("10000.00", forecast.GetProperty("availableCash").GetString());
        Assert.Equal("9000.00", forecast.GetProperty("availableCashAfterFundHolds").GetString());
        Assert.Equal("0.00", forecast.GetProperty("freelyAvailable").GetString());
    }

    [DeletionSqlFact]
    public async Task InternalPlannedTransferKeepsItsFeeInCashCommitments()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var source = f.Account(); var destination = f.Account(); destination.Name = "转入现金"; destination.OpeningBalance = 0;
        var date = Today.AddDays(1); var transaction = new SaveTransaction("Transfer", "100", source.Id, At(date), ToAccountId: destination.Id, Fee: "10");
        f.Db.RecurringRules.Add(new RecurringRule
        {
            UserId = f.User, Name = "账户内转账", State = "Active", Amount = "100", AccountId = source.Id, ToAccountId = destination.Id,
            PayloadJson = JsonSerializer.Serialize(transaction, FinanceService.Json), StartLocal = date.ToDateTime(new TimeOnly(12, 0)), NextAt = At(date)
        });
        await f.Db.SaveChangesAsync();
        var forecast = Result(await f.Service.CashFlowForecast(f.User, Query(("currency", "CNY"), ("start", Today.ToString("yyyy-MM-dd")), ("end", Today.AddDays(3).ToString("yyyy-MM-dd")))));
        Assert.Equal("990.00", forecast.GetProperty("closing").GetString());
        Assert.Equal("10.00", forecast.GetProperty("nearTermCommitments").GetString());
        Assert.Equal("990.00", forecast.GetProperty("freelyAvailable").GetString());
    }

    [DeletionSqlFact]
    public async Task CrossCurrencyTransferActivityIncludesTheDestinationAccountEntry()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var cny = f.Account(); var usd = f.Account(); usd.Name = "美元账户"; usd.Currency = "USD"; usd.OpeningBalance = 0; await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, new("Transfer", "720", cny.Id, DateTimeOffset.UtcNow, ToAccountId: usd.Id, ReceivedAmount: "100", ExchangeRate: "0.13888889"));
        await f.Db.SaveChangesAsync();
        var received = Result(await f.Service.AccountActivitySummary(f.User, usd.Id, Query())).GetProperty("items").EnumerateArray().Single(x => x.GetProperty("type").GetString() == "Transfer");
        Assert.Equal(1, received.GetProperty("count").GetInt32()); Assert.Equal("100.00", received.GetProperty("inflow").GetString()); Assert.Equal("0.00", received.GetProperty("outflow").GetString());
        var sent = Result(await f.Service.AccountActivitySummary(f.User, cny.Id, Query())).GetProperty("items").EnumerateArray().Single();
        Assert.Equal("720.00", sent.GetProperty("outflow").GetString()); Assert.Equal(100, await f.Service.Balance(f.User, usd.Id));
    }

    private static async Task<(string id, SubscriptionInput input)> CreateSubscription(DeletionSqlTests.Fixture f)
    {
        var account = f.Account(); var parent = new Category { UserId = f.User, Name = "生活服务", Kind = "Expense" };
        var category = new Category { UserId = f.User, Name = "订阅费用", Kind = "Expense", ParentId = parent.Id }; f.Db.AddRange(parent, category); await f.Db.SaveChangesAsync();
        var input = new SubscriptionInput("订阅价格回归", "服务商", new("订阅价格回归", "CNY", new("Expense", "10", account.Id, At(Today.AddDays(-1)), CategoryId: category.Id), Today.AddDays(-1).ToDateTime(new TimeOnly(12, 0)), Frequency: "Day"));
        var result = Result(await f.Service.SaveSubscription(f.User, input, null, null)); await f.Db.SaveChangesAsync();
        return (result.GetProperty("id").GetString()!, input);
    }

    [DeletionSqlFact]
    public async Task FutureSubscriptionPriceCannotReplaceFixedSplitsForEarlierPendingPeriods()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var (id, input) = await CreateSubscription(f);
        var changed = input with { PriceEffectiveAt = DateTimeOffset.UtcNow.AddDays(2), Rule = input.Rule with { Transaction = input.Rule.Transaction with { Amount = "20", Splits = [new(input.Rule.Transaction.CategoryId!, "20")] } } };
        Assert.Contains("取消固定拆分", (await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveSubscription(f.User, changed, id, "1"))).Message);
        Assert.Equal(1, await f.Db.SubscriptionPrices.CountAsync(x => x.SubscriptionId == id));
        Assert.Equal("10", JsonSerializer.Deserialize<SaveTransaction>((await f.Db.RecurringRules.AsNoTracking().SingleAsync(x => x.UserId == f.User)).PayloadJson, FinanceService.Json)!.Amount);
        Assert.DoesNotContain(f.Db.SubscriptionPrices.Local, x => f.Db.Entry(x).State == EntityState.Added);
    }

    [DeletionSqlFact]
    public async Task FutureSubscriptionPriceWithSingleCategoryKeepsEarlierGeneratedAmounts()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var (id, input) = await CreateSubscription(f);
        var changed = input with { PriceEffectiveAt = DateTimeOffset.UtcNow.AddDays(2), Rule = input.Rule with { Transaction = input.Rule.Transaction with { Amount = "20" } } };
        await f.Service.SaveSubscription(f.User, changed, id, "1"); await f.Db.SaveChangesAsync();
        await f.Service.GenerateOccurrences(f.User, DateTimeOffset.UtcNow.AddHours(13), "Test"); await f.Db.SaveChangesAsync();
        var occurrences = await f.Db.RecurringOccurrences.Where(x => x.UserId == f.User).ToArrayAsync(); Assert.NotEmpty(occurrences);
        Assert.All(occurrences, occurrence =>
        {
            var payload = JsonSerializer.Deserialize<SaveTransaction>(occurrence.PayloadJson, FinanceService.Json)!;
            Assert.Equal("10.00", occurrence.Amount); Assert.Equal(occurrence.Amount, payload.Amount); Assert.Null(payload.Splits); Assert.Equal(input.Rule.Transaction.CategoryId, payload.CategoryId);
        });
        Assert.Equal(new decimal[] { 10, 20 }, await f.Db.SubscriptionPrices.Where(x => x.SubscriptionId == id).OrderBy(x => x.EffectiveAt).Select(x => x.Amount).ToArrayAsync());
    }

    [DeletionSqlFact]
    public async Task LegacyMismatchedSubscriptionSplitsAreBlockedBeforeCreatingAnyOccurrence()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var (_, input) = await CreateSubscription(f);
        var rule = await f.Db.RecurringRules.SingleAsync(x => x.UserId == f.User);
        rule.Amount = "20"; rule.PayloadJson = JsonSerializer.Serialize(input.Rule.Transaction with { Amount = "20", Splits = [new(input.Rule.Transaction.CategoryId!, "20")] }, FinanceService.Json); await f.Db.SaveChangesAsync();
        Assert.Contains("取消固定拆分", (await Assert.ThrowsAsync<ApiException>(() => f.Service.GenerateOccurrences(f.User, DateTimeOffset.UtcNow.AddHours(13), "Test"))).Message);
        Assert.Empty(await f.Db.RecurringOccurrences.Where(x => x.UserId == f.User).ToArrayAsync());
    }
}
