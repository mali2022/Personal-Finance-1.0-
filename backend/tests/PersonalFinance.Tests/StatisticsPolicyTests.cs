using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class StatisticsPolicyTests
{
    [ProfileSqlFact]
    public async Task PreviewUsesLedgerRefundsCurrencyDatesAndUserIsolationWithoutWriting()
    {
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
        await db.Database.MigrateAsync();
        var user = new AppUser { Email = Guid.NewGuid()+"@policy.test", DisplayName = "Policy" };
        db.Add(user);
        var account = new Account { UserId = user.Id, Name = "Policy cash" };
        var category = new Category { UserId = user.Id, Name = "Food" };
        var feeCategory = new Category { UserId = user.Id, Name = "Fee" };
        db.AddRange(account, category, feeCategory, new StatisticsRules { UserId = user.Id, IncludeFees = true });
        void Tx(string type, decimal amount, string currency = "CNY", string status = "Confirmed", bool outside = false)
        {
            var t = new FinanceTransaction { UserId = user.Id, AccountId = account.Id, Type = type, Amount = amount, Currency = currency, Status = status, AdjustmentDirection = type == "Adjustment" ? "Decrease" : null, FeeCategoryId = feeCategory.Id, OccurredAt = outside ? new(2026,10,31,16,0,0,TimeSpan.Zero) : new(2026,9,30,16,0,0,TimeSpan.Zero) };
            if (type is "Income" or "Expense" or "Refund") t.Entries.Add(new Entry { UserId = user.Id, Kind = type == "Income" ? "Income" : "Expense", CategoryId = category.Id, Currency = currency, Amount = type == "Expense" ? amount : -amount });
            if (type == "Expense") t.Entries.Add(new Entry { UserId = user.Id, Kind = "Expense", CategoryId = feeCategory.Id, Currency = currency, Amount = 2 });
            foreach (var entry in t.Entries) entry.BaseAmount = entry.Amount;
            db.Add(t);
        }
        Tx("Income",100); Tx("Expense",20); Tx("Refund",30); Tx("AssetLoss",3); Tx("Adjustment",4);
        Tx("Expense",999,"USD"); Tx("Expense",999,status:"Deleted"); Tx("Expense",999,outside:true);
        await db.SaveChangesAsync();
        using var services = new ServiceCollection().BuildServiceProvider();
        var f = new FinanceService(db, services.GetRequiredService<IServiceScopeFactory>(), NullLogger<FinanceService>.Instance);
        JsonElement J(object x) => JsonSerializer.SerializeToElement(x, FinanceService.Json);
        var preview = J(await f.PreviewStatisticsPolicy(user.Id,"2026-10","CNY",new(false,true,true)));
        Assert.Equal("-10.00",preview.GetProperty("baseExpense").GetString());
        Assert.Equal("-8.00",preview.GetProperty("currentExpense").GetString());
        Assert.Equal("-3.00",preview.GetProperty("proposedExpense").GetString());
        Assert.Equal("103.00",preview.GetProperty("proposedSurplus").GetString());
        Assert.Equal(5,preview.GetProperty("transactionCount").GetInt32());
        for (var mask = 0; mask < 8; mask++)
        {
            var fee = (mask & 1) != 0; var loss = (mask & 2) != 0; var adjustment = (mask & 4) != 0;
            var result = J(await f.PreviewStatisticsPolicy(user.Id,"2026-10","CNY",new(fee,loss,adjustment)));
            Assert.Equal(FinanceService.M(-10 + (fee ? 2 : 0) + (loss ? 3 : 0) + (adjustment ? 4 : 0)), result.GetProperty("proposedExpense").GetString());
        }
        Assert.Equal(0,J(await f.PreviewStatisticsPolicy("other","2026-10","CNY",new(true,true,true))).GetProperty("transactionCount").GetInt32());
        Assert.False(db.ChangeTracker.HasChanges());
        await Assert.ThrowsAsync<ApiException>(() => f.PreviewStatisticsPolicy(user.Id,"bad","CNY",new(true,false,false)));
        await Assert.ThrowsAsync<ApiException>(() => f.PreviewStatisticsPolicy(user.Id,"2026-10","BAD",new(true,false,false)));
        Assert.Empty((IEnumerable<object>)await f.StatisticsPolicyHistory("other"));
    }
}
