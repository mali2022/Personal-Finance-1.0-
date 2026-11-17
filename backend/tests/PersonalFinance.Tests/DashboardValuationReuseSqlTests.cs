using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using Xunit;

[Collection("Finance SQL")]
public sealed class DashboardValuationReuseSqlTests
{
    static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    static QueryCollection Query(params (string Key,string Value)[] values) => new(values.ToDictionary(x=>x.Key,x=>new StringValues(x.Value)));

    [DeletionSqlFact]
    public async Task DashboardRecentTransactionsUseTheSameStableOrderAsTheTransactionList()
    {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();
        var at=DateTimeOffset.Parse("2025-12-15T12:00:00+08:00");
        for(var i=0;i<12;i++){var t=f.Expense(a);t.OccurredAt=at;t.CreatedAt=at.AddTicks(i/2);}
        var deleted=f.Expense(a);deleted.OccurredAt=at.AddDays(1);deleted.Status="Deleted";
        await f.Db.SaveChangesAsync();
        var expected=Json(await f.Service.Transactions(f.User,Query(("pageSize","10")))).GetProperty("items").EnumerateArray().Select(x=>x.GetProperty("id").GetString()).ToArray();
        var actual=Json(await f.Service.Dashboard(f.User,"2025-12")).GetProperty("recentTransactions").EnumerateArray().Select(x=>x.GetProperty("id").GetString()).ToArray();
        Assert.Equal(expected,actual);
    }

    [DeletionSqlFact]
    public async Task NetWorthReuseMatchesIndependentValuationAndKeepsForeignCurrencyCoverage()
    {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var usd=f.Account();usd.Name="USD";usd.Currency="USD";usd.OpeningBalance=2000;
        f.Expense(a).OccurredAt=DateTimeOffset.Parse("2025-01-02T12:00:00+08:00");
        f.Expense(a).OccurredAt=DateTimeOffset.Parse("2025-12-31T12:00:00+08:00");
        var foreign=f.Expense(usd);foreign.Currency="USD";foreign.OccurredAt=DateTimeOffset.Parse("2025-06-01T12:00:00+08:00");foreach(var e in foreign.Entries)e.Currency="USD";
        await f.Db.SaveChangesAsync();
        var actual=Json(await f.Service.NetWorthAnalysis(f.User,Query(("start","2025-01-01"),("end","2025-12-31"),("currency","CNY"))));
        Assert.Equal("980.00",actual.GetProperty("currentNetWorth").GetString());
        Assert.Equal(Json(await f.Service.AssetAllocation(f.User,Query(("date","2025-12-31"),("currency","CNY")))).GetRawText(),actual.GetProperty("consolidatedValuation").GetRawText());
        Assert.Equal(Json(await f.Service.AssetValuationChange(f.User,new DateOnly(2024,12,31),new DateOnly(2025,12,31),"CNY")).GetRawText(),actual.GetProperty("valuationChange").GetRawText());
    }
}
