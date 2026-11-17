using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class InvestmentCashFactTests
{
    [Theory]
    [InlineData("Buy", -106)] [InlineData("Sell", 94)]
    [InlineData("Dividend", 94)] [InlineData("Interest", 94)]
    [InlineData("Fee", -100)] [InlineData("PositionIncrease", 0)] [InlineData("PositionDecrease", 0)]
    public void WritesAndReportsShareCashFacts(string type, int expected)
        => Assert.Equal(expected, InvestmentMath.CashMovement(new InvestmentTrade { Type = type, Amount = 100, Commission = 1, Tax = 2, OtherFee = 3 }));
}

[Collection("Finance SQL")]
public sealed class FinancialConsistency20SqlTests
{
    [DeletionSqlFact]
    public async Task InvalidLegacyInvestmentProducesFindingInsteadOfAbortingDiagnostics()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); account.Type = "Investment";
        var asset = new InvestmentAsset { UserId = f.User, AccountId = account.Id, Name = "Legacy invalid history" };
        f.Db.AddRange(asset, new InvestmentTrade { UserId = f.User, AssetId = asset.Id, Type = "Sell", Quantity = 1, Amount = 10, Date = new(2026, 10, 1), SettlementDate = new(2026, 10, 1) });
        await f.Db.SaveChangesAsync();
        var result = JsonSerializer.SerializeToElement(await f.Service.FinancialDiagnostics(f.User), FinanceService.Json);
        Assert.NotEmpty(result.GetProperty("investmentChecks").EnumerateArray());
        Assert.False(result.GetProperty("analysisBasis").GetProperty("valuationComplete").GetBoolean());
    }
    [DeletionSqlFact]
    public async Task RefundTransferBalanceBudgetAndReportShareNetSpending()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); var b = f.Account(); b.Name = "Second cash";
        var root = new Category { UserId = f.User, Name = "Synthetic root", Kind = "Expense" };
        var category = new Category { UserId = f.User, Name = "Synthetic expense", Kind = "Expense", ParentId = root.Id };
        f.Db.AddRange(root, category); await f.Db.SaveChangesAsync();
        var at = new DateTimeOffset(2026, 10, 10, 12, 0, 0, TimeSpan.FromHours(8));
        var saved = JsonSerializer.SerializeToElement(await f.Service.SaveTransaction(f.User, new("Expense", "10", a.Id, at, CategoryId: category.Id)), FinanceService.Json);
        await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, new("Refund", "3", a.Id, at.AddMinutes(1), CategoryId: category.Id, OriginalTransactionId: saved.GetProperty("id").GetString())); await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, new("Transfer", "100", a.Id, at.AddMinutes(2), ToAccountId: b.Id)); await f.Db.SaveChangesAsync();
        Assert.Equal(893, await f.Service.Balance(f.User, a.Id)); Assert.Equal(1100, await f.Service.Balance(f.User, b.Id));
        var query = new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> { ["start"]="2026-10-01", ["end"]="2026-10-31", ["currency"]="CNY", ["granularity"]="day" });
        var report = JsonSerializer.SerializeToElement(await f.Service.Report(f.User, query), FinanceService.Json);
        Assert.Equal("7.00", report.GetProperty("expense").GetString()); Assert.Equal("1993.00", report.GetProperty("netWorth").GetString());
        Assert.Equal(7, report.GetProperty("points").EnumerateArray().Sum(x => decimal.Parse(x.GetProperty("expense").GetString()!, System.Globalization.CultureInfo.InvariantCulture)));
        var budget = JsonSerializer.SerializeToElement(await f.Service.Budget(f.User, "2026-10"), FinanceService.Json);
        Assert.Equal("7.00", budget.GetProperty("used").GetString());
    }
    [DeletionSqlFact]
    public async Task InvestmentWriteHoldingValuationPerformanceAndLifeSnapshotCloseTheLoop()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); account.Type = "Investment";
        var asset = new InvestmentAsset { UserId = f.User, AccountId = account.Id, Name = "Synthetic holding" };
        f.Db.AddRange(asset, new AssetAggregationPolicy { UserId = f.User, AccountId = account.Id, Mode = "CashOnly", Reason = "Synthetic cash ledger" });
        await f.Db.SaveChangesAsync();
        var day = new DateOnly(2026, 10, 1);
        await f.Service.SaveInvestmentTrade(f.User, new(asset.Id, "Buy", day, day, Quantity: "10", Price: "10", Commission: "1"), "1"); await f.Db.SaveChangesAsync();
        await f.Service.SaveInvestmentTrade(f.User, new(asset.Id, "Sell", day.AddDays(1), day.AddDays(1), Quantity: "4", Price: "12", Commission: "1"), "2"); await f.Db.SaveChangesAsync();
        await f.Service.SaveInvestmentValuation(f.User, new(asset.Id, day.AddDays(2), "12", "Synthetic test"), null); await f.Db.SaveChangesAsync();
        Assert.Equal(946, await f.Service.Balance(f.User, account.Id));
        var query = new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> { ["start"]="2026-10-01", ["end"]="2026-10-28", ["currency"]="CNY" });
        var report = JsonSerializer.SerializeToElement(await f.Service.InvestmentPerformance(f.User, query), FinanceService.Json);
        Assert.Equal("6", report.GetProperty("assets")[0].GetProperty("quantity").GetString());
        Assert.Equal("6.6", report.GetProperty("summary").GetProperty("realizedInPeriod").GetString());
        Assert.Equal("72.00", report.GetProperty("summary").GetProperty("marketValueCovered").GetString());
        var snapshot = JsonSerializer.SerializeToElement(await f.Service.CreateLifeSnapshot(f.User, "CNY", default), FinanceService.Json);
        var group = snapshot.GetProperty("snapshot").GetProperty("allocation").GetProperty("groups")[0];
        Assert.Equal("1018.00", group.GetProperty("netWorth").GetString());
        Assert.Equal(2, f.Db.Transactions.Count(x => x.UserId == f.User));
    }
    [DeletionSqlFact]
    public async Task ExistingCategoryWithWrongKindIsDiagnosed()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); var expense = f.Expense(account);
        var category = new Category { UserId = f.User, Name = "Wrong income category", Kind = "Income" };
        f.Db.Add(category); expense.Entries.First(x => x.Kind == "Expense").CategoryId = category.Id;
        await f.Db.SaveChangesAsync();
        var result = JsonSerializer.SerializeToElement(await f.Service.FinancialDiagnostics(f.User), FinanceService.Json);
        Assert.Equal(1, result.GetProperty("findings").EnumerateArray().Single(x => x.GetProperty("rule").GetString() == "Category").GetProperty("count").GetInt32());
    }
    [DeletionSqlFact]
    public async Task ScopedIncomeSummaryMatchesItsPeriodPoints()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); var b = f.Account(); b.Name = "Attributed income";
        var t = new FinanceTransaction { UserId = f.User, AccountId = a.Id, Type = "Income", Amount = 20, OccurredAt = new(2026, 10, 10, 12, 0, 0, TimeSpan.FromHours(8)) };
        t.Entries.Add(new Entry { UserId = f.User, TransactionId = t.Id, Kind = "Account", AccountId = b.Id, Amount = 20, BaseAmount = 20 });
        t.Entries.Add(new Entry { UserId = f.User, TransactionId = t.Id, Kind = "Income", AccountId = b.Id, Amount = -20, BaseAmount = -20 });
        f.Db.Add(t); await f.Db.SaveChangesAsync();
        var query = new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> {
            ["start"] = "2026-10-01", ["end"] = "2026-10-31", ["currency"] = "CNY", ["granularity"] = "month" });
        var report = JsonSerializer.SerializeToElement(await f.Service.Report(f.User, query, [b.Id]), FinanceService.Json);
        Assert.Equal("20.00", report.GetProperty("income").GetString());
        Assert.Equal(report.GetProperty("income").GetString(), report.GetProperty("points")[0].GetProperty("income").GetString());
    }
    [DeletionSqlFact]
    public async Task DiagnosticsReevaluatesAfterRepairWithoutChangingHistory()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); var expense = f.Expense(account); expense.Entries.First(x => x.Kind == "Account").BaseAmount = -9;
        await f.Db.SaveChangesAsync();
        async Task<int> Count() => JsonSerializer.SerializeToElement(await f.Service.FinancialDiagnostics(f.User), FinanceService.Json)
            .GetProperty("findings").EnumerateArray().Single(x => x.GetProperty("rule").GetString() == "Balance").GetProperty("count").GetInt32();
        Assert.Equal(1, await Count());
        expense.Entries.First(x => x.Kind == "Account").BaseAmount = -10; await f.Db.SaveChangesAsync();
        Assert.Equal(0, await Count());
        Assert.Equal(990, await f.Service.Balance(f.User, account.Id));
        Assert.Single(f.Db.Transactions.Where(x => x.UserId == f.User));
    }
}
