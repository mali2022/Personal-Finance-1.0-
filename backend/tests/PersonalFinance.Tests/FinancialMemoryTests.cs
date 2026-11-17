using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class FinancialMemoryTests
{
    static IQueryCollection Query(params (string,string)[] values) => new QueryCollection(values.ToDictionary(x => x.Item1,x => new StringValues(x.Item2)));
    static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value,FinanceService.Json);
    [Theory]
    [InlineData(2023,2,29)] [InlineData(2024,0,1)] [InlineData(2024,13,1)] [InlineData(2024,1,0)] [InlineData(1899,1,1)]
    public void InvalidAnniversaryNeverRollsIntoAnotherDate(int year,int month,int day) => Assert.Null(FinanceService.AnniversaryRange(year,month,day));
    [ProfileSqlFact]
    public async Task StatisticsFiltersCandidatesAndBookmarksRemainScopedAndUseFinancialEntries()
    {
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
        await db.Database.MigrateAsync();
        var initialCount = await db.Transactions.CountAsync();
        var user = new AppUser { Email = Guid.NewGuid()+"@memory.test", DisplayName = "Memory" }; var stranger = new AppUser { Email = Guid.NewGuid()+"@memory.test", DisplayName = "Other" }; db.AddRange(user,stranger);
        var account = new Account { UserId = user.Id, Name = "Memory cash" }; var otherAccount = new Account { UserId = stranger.Id, Name = "Private" }; var category = new Category { UserId = user.Id, Name = "Food" }; var tag = new DirectoryItem { UserId = user.Id, Kind = "tags", Name = "Daily" }; db.AddRange(account,otherAccount,category,tag); await db.SaveChangesAsync();
        FinanceTransaction Tx(int year,int month,int day,string type,decimal amount,string merchant="Cafe",string currency="CNY",string status="Confirmed",bool other=false) {
            var owner=other?stranger.Id:user.Id;var acc=other?otherAccount.Id:account.Id;
            var t=new FinanceTransaction {UserId=owner,AccountId=acc,Type=type,Amount=amount,Currency=currency,OccurredAt=new(year,month,day,16,30,0,TimeSpan.Zero),Merchant=merchant,Note="recorded note",Status=status};
            if(type is "Expense" or "Refund" or "Income") t.Entries.Add(new Entry {UserId=owner,TransactionId=t.Id,Kind=type=="Income"?"Income":"Expense",CategoryId=other?null:category.Id,Amount=type=="Expense"?amount:-amount,Currency=currency,BaseAmount=type=="Expense"?amount:-amount});
            db.Add(t);return t;
        }
        // 16:30 UTC belongs to the following Shanghai calendar date.
        var expense=Tx(2024,10,20,"Expense",100); expense.Tags.Add(new(){TransactionId=expense.Id,DirectoryId=tag.Id});
        Tx(2024,10,20,"Refund",20);Tx(2024,10,20,"Income",300);Tx(2022,10,20,"Transfer",900);Tx(2023,10,20,"Expense",30);Tx(2023,10,20,"Refund",30);
        Tx(2024,10,20,"Expense",999,"Secret",other:true);Tx(2024,10,20,"Expense",777,status:"Pending");Tx(2024,10,20,"Expense",555,currency:"USD");Tx(2024,9,3,"Expense",15,"Bookstore");var privateTx=Tx(2024,9,3,"Expense",2000,"Private",other:true);
        await db.SaveChangesAsync();
        using var services=new ServiceCollection().BuildServiceProvider(); var f=new FinanceService(db,services.GetRequiredService<IServiceScopeFactory>(),NullLogger<FinanceService>.Instance);
        var report=Json(await f.OnThisDay(user.Id,Query(("date","2000-10-21"),("currency","CNY"),("type","All")))); var total=Assert.Single(report.GetProperty("aggregates").EnumerateArray());
        Assert.Equal("80.00",total.GetProperty("expense").GetString());Assert.Equal("300.00",total.GetProperty("income").GetString());Assert.Equal("50.00",total.GetProperty("refund").GetString());Assert.Equal(3,total.GetProperty("years").GetInt32());Assert.Equal("26.67",total.GetProperty("average").GetString());Assert.Equal(6,report.GetProperty("total").GetInt32());
        Assert.Equal("0.00",report.GetProperty("summaries").EnumerateArray().Single(x=>x.GetProperty("year").GetInt32()==2022).GetProperty("expense").GetString());Assert.DoesNotContain(report.GetProperty("items").EnumerateArray(),x=>x.GetProperty("merchant").GetString()=="Secret");
        var filtered=Json(await f.OnThisDay(user.Id,Query(("date","2026-10-21"),("years","2024,2023"),("tagId",tag.Id),("keyword","recorded"),("accountId",account.Id))));Assert.Equal(1,filtered.GetProperty("total").GetInt32());
        Assert.Equal(0,Json(await f.OnThisDay(user.Id,Query(("date","2026-10-21"),("accountId",otherAccount.Id)))).GetProperty("total").GetInt32());
        foreach(var mode in new[]{"date","nearest","year","expense","merchant"}) {
            var candidate=Json(await f.MemoryCandidate(user.Id,Query(("date","2000-10-21"),("years","2024"),("merchant","Cafe"),("mode",mode))));Assert.True(candidate.GetProperty("found").GetBoolean());Assert.Equal(2024,candidate.GetProperty("year").GetInt32());
        }
        Assert.False(Json(await f.MemoryCandidate(user.Id,Query(("date","2026-10-21"),("merchant","NoMatch"),("mode","date")))).GetProperty("found").GetBoolean());
        var saved=Json(await f.SaveMemory(user.Id,new("tx:"+expense.Id,expense.Id,true,"my own memory"),"0"));
        await Assert.ThrowsAsync<ApiException>(()=>f.SaveMemory(stranger.Id,new("tx:"+expense.Id,expense.Id,true,""),"0"));
        await Assert.ThrowsAsync<ApiException>(()=>f.SaveMemory(user.Id,new("tx:"+expense.Id,expense.Id,false,""),"0"));
        await f.SaveMemory(user.Id,new("day:02-29",null,true,"leap day"),"0");
        await Assert.ThrowsAsync<ApiException>(()=>f.SaveMemory(user.Id,new("day:02-30",null,true,""),"0"));
        Assert.Empty(Json(await f.MemoryBookmarks(stranger.Id)).EnumerateArray());
        await f.SaveMemory(user.Id,new("tx:"+expense.Id,expense.Id,false,""),saved.GetProperty("version").GetString());
        Assert.False(Json(await f.MemoryBookmarks(user.Id)).EnumerateArray().Single(x=>x.GetProperty("transactionId").GetString()==expense.Id).GetProperty("favorite").GetBoolean());
        var count=await db.Transactions.CountAsync();Assert.Equal(initialCount+11,count);
    }
}
