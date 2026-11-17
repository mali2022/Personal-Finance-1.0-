using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using Xunit;
using Xunit.Abstractions;

[Collection("Finance SQL")]
public sealed class AiPhase1PerformanceTests(ITestOutputHelper output)
{
    [DeletionSqlFact] public async Task ScopedSummaryUsesExactAmountsForTenThousandTransactions()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var account = f.Account(); account.OpeningBalance = 200000;
        await f.Db.SaveChangesAsync();
        await f.Db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @ids TABLE(Id nvarchar(36));
            INSERT @ids SELECT CONVERT(nvarchar(36),NEWID()) FROM GENERATE_SERIES(1,10000);
            INSERT finance.Transactions(Id,UserId,Version,Type,Amount,Currency,AccountId,OccurredAt,Note,Status,Fee,CreatedAt,UpdatedAt)
            SELECT Id,{f.User},1,N'Expense',10,N'CNY',{account.Id},CONVERT(datetimeoffset,'2026-10-12T12:00:00+08:00'),N'',N'Confirmed',0,SYSUTCDATETIME(),SYSUTCDATETIME() FROM @ids;
            INSERT finance.Entries(Id,UserId,Version,TransactionId,Kind,AccountId,Amount,Currency,ExchangeRate,BaseAmount)
            SELECT CONVERT(nvarchar(36),NEWID()),{f.User},1,Id,N'Account',{account.Id},-10,N'CNY',1,-10 FROM @ids;
            INSERT finance.Entries(Id,UserId,Version,TransactionId,Kind,Amount,Currency,ExchangeRate,BaseAmount)
            SELECT CONVERT(nvarchar(36),NEWID()),{f.User},1,Id,N'Expense',10,N'CNY',1,10 FROM @ids;
            """);
        var query = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = "2026-10-01", ["end"] = "2026-10-31", ["currency"] = "CNY", ["granularity"] = "month" });
        var elapsed = new List<double>();
        for (var i = 0; i < 6; i++) {
            var clock = Stopwatch.StartNew(); var result = JsonSerializer.SerializeToElement(await f.Service.Report(f.User, query, [account.Id]), FinanceService.Json);
            Assert.Equal("100000.00", result.GetProperty("expense").GetString()); Assert.Equal("100000.00", result.GetProperty("netWorth").GetString());
            Assert.Equal("100000.00", result.GetProperty("points")[0].GetProperty("expense").GetString());
            if (i > 0) elapsed.Add(clock.Elapsed.TotalMilliseconds);
        }
        output.WriteLine(JsonSerializer.Serialize(new { transactions = 10000, entries = 20000, warmSamples = elapsed, p95Ms = elapsed.Order().Last(),
            concurrency = 1, scope = "one isolated user and account; deterministic SQL aggregation; excludes provider latency" }));
    }
}
