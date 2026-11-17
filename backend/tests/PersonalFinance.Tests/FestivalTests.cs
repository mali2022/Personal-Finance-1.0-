using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
public class FestivalRulesTests {
    [Theory]
    [InlineData(2025,1,1,"2025-01-29")][InlineData(2026,1,1,"2026-02-17")][InlineData(2026,8,15,"2026-09-25")]
    public void LunarDates(int year,int month,int day,string expected)=>Assert.Equal(expected,FestivalRules.Lunar(year,month,day).ToString("yyyy-MM-dd"));
    [Fact] public void LeapMonthIsExplicit(){Assert.Throws<ApiException>(()=>FestivalRules.Lunar(2026,6,1,true));Assert.Equal("2025-07-25",FestivalRules.Lunar(2025,6,1,true).ToString("yyyy-MM-dd"));}
    [Fact] public void ThanksgivingRule()=>Assert.Equal(new DateOnly(2026,11,26),FestivalRules.Weekday(2026,11,DayOfWeek.Thursday,4));
    [Theory][InlineData("-1")][InlineData("NaN")][InlineData("1.001")][InlineData("1000000000001")]
    public void InvalidAmounts(string value)=>Assert.Throws<ApiException>(()=>FestivalRules.Amount(value));
    [Fact] public void AiRejectsFabricatedTotals(){var option=new FestivalAiOption("节约",101,0,[new("礼物","Gift",100,"")],[],[],"优点","代价","未知","未知","原因");var result=new FestivalAiResult([option,option,option],[],[],"");Assert.Throws<ApiException>(()=>FestivalAiEndpoints.Validate(JsonSerializer.Serialize(result,FinanceService.Json),100));}
    [Fact] public void AiAcceptsReservedBudget(){var option=new FestivalAiOption("节约",60,40,[new("礼物","Gift",60,"")],[],[],"优点","代价","未知","未知","原因");var result=new FestivalAiResult([option,option,option],[],[],"");Assert.Equal(3,FestivalAiEndpoints.Validate(JsonSerializer.Serialize(result,FinanceService.Json),100).Plans.Length);}
}
[Collection("Finance SQL")]
public class FestivalPersistenceTests {
 [ProfileSqlFact]
 public async Task AllocationsPreserveLedgerAndReconcileRefunds(){
  await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);await db.Database.MigrateAsync();
  var user=new AppUser{Email=Guid.NewGuid()+"@festival.test"};var other=new AppUser{Email=Guid.NewGuid()+"@festival.test"};db.AddRange(user,other);
  var account=new Account{UserId=user.Id,Name="Festival cash"};db.Add(account);
  var t=new FinanceTransaction{UserId=user.Id,AccountId=account.Id,Amount=800,Currency="CNY",Type="Expense",Status="Confirmed",OccurredAt=DateTimeOffset.UtcNow};db.Add(t);await db.SaveChangesAsync();
  using var services=new ServiceCollection().BuildServiceProvider();var f=new FinanceService(db,services.GetRequiredService<IServiceScopeFactory>(),NullLogger<FinanceService>.Instance);
  async Task<JsonElement> Write(object body,Func<Task<object?>> action){var c=new DefaultHttpContext();c.Request.Method="POST";c.Request.Path="/api/festivals";c.Request.Headers["Idempotency-Key"]=Guid.NewGuid().ToString();return JsonSerializer.SerializeToElement(await f.Write(user.Id,c,body,action,true),FinanceService.Json);}
  var purchase=new FestivalPurchase(Guid.NewGuid().ToString(),"礼物","家人","600","Approved");
  var input=new FestivalInput("春节",new(2027,2,6),new(2027,2,8),"CNY","1000","Planning","",[purchase]);
  var saved=await Write(input,async()=>await f.FestivalSave(user.Id,null,input,"0"));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  await Assert.ThrowsAsync<ApiException>(()=>f.FestivalDetail(other.Id,id));
  var allocation=new FestivalAllocation(t.Id,"600","Gift",PurchaseId:purchase.Id);
  saved=await Write(allocation,async()=>await f.FestivalAllocate(user.Id,id,allocation,version));version=saved.GetProperty("version").GetString()!;var linkId=saved.GetProperty("id").GetString()!;
  var report=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json).GetProperty("report");Assert.Equal("600.00",report.GetProperty("net").GetString());Assert.Equal("0.00",report.GetProperty("commitment").GetString());Assert.Equal("400.00",report.GetProperty("available").GetString());
  await Assert.ThrowsAsync<ApiException>(()=>f.FestivalAllocate(user.Id,id,allocation,version));
  await Assert.ThrowsAsync<ApiException>(()=>f.FestivalSave(user.Id,id,input,"1"));
  // Failed service validations do not mutate tracked records; clear before next real transaction.
  db.ChangeTracker.Clear();
  var refund=new FinanceTransaction{UserId=user.Id,AccountId=account.Id,Amount=100,Currency="CNY",Type="Refund",Status="Confirmed",OriginalTransactionId=t.Id,OccurredAt=DateTimeOffset.UtcNow.AddMonths(1)};db.Add(refund);await db.SaveChangesAsync();
  report=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json).GetProperty("report");Assert.False(report.GetProperty("complete").GetBoolean());
  saved=await Write(new{},async()=>await f.FestivalAllocate(user.Id,id,new(refund.Id,"100","Gift"),version));version=saved.GetProperty("version").GetString()!;
  report=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json).GetProperty("report");Assert.Equal("500.00",report.GetProperty("net").GetString());Assert.True(report.GetProperty("complete").GetBoolean());
  Assert.Equal(2,await db.Transactions.CountAsync(x=>x.UserId==user.Id));Assert.Equal(0,await db.Entries.CountAsync(x=>x.UserId==user.Id));
  var tracked=await db.Transactions.SingleAsync(x=>x.Id==t.Id);tracked.Status="Deleted";await db.SaveChangesAsync();
  report=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json).GetProperty("report");Assert.False(report.GetProperty("complete").GetBoolean());Assert.Equal("0.00",report.GetProperty("net").GetString());
  tracked.Status="Confirmed";await db.SaveChangesAsync();report=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json).GetProperty("report");Assert.Equal("500.00",report.GetProperty("net").GetString());
  saved=await Write(new{},async()=>await f.FestivalRevoke(user.Id,id,linkId,version));
  report=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json).GetProperty("report");Assert.Equal("0.00",report.GetProperty("net").GetString());
 }
}
