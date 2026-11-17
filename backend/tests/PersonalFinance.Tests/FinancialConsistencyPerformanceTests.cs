using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using Xunit;
using Xunit.Abstractions;

namespace PersonalFinance.Tests;

[Collection("Finance SQL")]
public sealed class FinancialConsistencyPerformanceTests(ITestOutputHelper output)
{
    [DeletionSqlFact]
    public async Task HundredThousandRowsAcrossHundredAccountsHaveExactReportTotals()
    {
        // Opts out of the fixture transaction: undoing the seeded rows exceeds the timeout
        // SqlTransaction captured at BeginTransaction, so the fixture deletes them instead.
        await using var f = new DeletionSqlTests.Fixture(transactional: false);
        f.Db.Database.SetCommandTimeout(600);
        await f.Initialize();
        for (var i = 0; i < 100; i++) { var a = f.Account(); a.Name = "Synthetic " + i; }
        await f.Db.SaveChangesAsync();
        // Fixture generation includes index maintenance and is outside measured query time.
        await f.Db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @accounts TABLE(Id nvarchar(36),Num int);
            INSERT @accounts SELECT Id,ROW_NUMBER() OVER(ORDER BY Id)-1 FROM finance.Accounts WHERE UserId={f.User};
            DECLARE @rows TABLE(Id nvarchar(36),AccountId nvarchar(36));
            INSERT @rows SELECT CONVERT(nvarchar(36),NEWID()),a.Id FROM GENERATE_SERIES(1,100000) n JOIN @accounts a ON a.Num=(n.value-1)%100;
            INSERT finance.Transactions(Id,UserId,Version,Type,Amount,Currency,AccountId,OccurredAt,Note,Status,Fee,CreatedAt,UpdatedAt)
            SELECT Id,{f.User},1,N'Expense',10,N'CNY',AccountId,CONVERT(datetimeoffset,'2026-10-12T12:00:00+08:00'),N'',N'Confirmed',0,SYSUTCDATETIME(),SYSUTCDATETIME() FROM @rows;
            INSERT finance.Entries(Id,UserId,Version,TransactionId,Kind,AccountId,Amount,Currency,ExchangeRate,BaseAmount)
            SELECT CONVERT(nvarchar(36),NEWID()),{f.User},1,Id,N'Account',AccountId,-10,N'CNY',1,-10 FROM @rows;
            INSERT finance.Entries(Id,UserId,Version,TransactionId,Kind,Amount,Currency,ExchangeRate,BaseAmount)
            SELECT CONVERT(nvarchar(36),NEWID()),{f.User},1,Id,N'Expense',10,N'CNY',1,10 FROM @rows;
            """);
        var query = new QueryCollection(new Dictionary<string, StringValues> { ["start"]="2026-10-01", ["end"]="2026-10-31", ["currency"]="CNY", ["granularity"]="month" });
        var allocated = GC.GetTotalAllocatedBytes(); var process = Process.GetCurrentProcess(); var cpu = process.TotalProcessorTime; var clock = Stopwatch.StartNew();
        var result = JsonSerializer.SerializeToElement(await f.Service.Report(f.User, query), FinanceService.Json);
        clock.Stop();
        Assert.Equal("1000000.00", result.GetProperty("expense").GetString());
        Assert.Equal("-900000.00", result.GetProperty("netWorth").GetString());
        Assert.Equal(result.GetProperty("expense").GetString(), result.GetProperty("points")[0].GetProperty("expense").GetString());
        output.WriteLine(JsonSerializer.Serialize(new { transactions=100000, accounts=100, elapsedMs=clock.Elapsed.TotalMilliseconds, managedAllocatedBytes=GC.GetTotalAllocatedBytes()-allocated, clientCpuMs=(process.TotalProcessorTime-cpu).TotalMilliseconds, clientWorkingSetBytes=process.WorkingSet64, concurrency=1, samples=1, scope="isolated local SQL; client process resources only; no production capacity claim" }));
    }
}
