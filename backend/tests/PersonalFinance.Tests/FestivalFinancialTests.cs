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
[Collection("Finance SQL")]
public class FestivalFinancialTests {
 [ProfileSqlFact]
 public async Task SplitAndForeignCurrencyAllocationsAreConserved(){
  await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);await db.Database.MigrateAsync();var user=new AppUser{Email=Guid.NewGuid()+"@festival-fx.test"};db.Add(user);var account=new Account{UserId=user.Id,Name="foreign",Currency="USD"};db.Add(account);var tx=new FinanceTransaction{UserId=user.Id,AccountId=account.Id,Type="Expense",Status="Confirmed",Amount=100,Currency="USD",OccurredAt=DateTimeOffset.UtcNow};var entry=new Entry{UserId=user.Id,TransactionId=tx.Id,Kind="Expense",Amount=40,Currency="USD",BaseAmount=280};tx.Entries.Add(entry);db.Add(tx);await db.SaveChangesAsync();
  using var services=new ServiceCollection().BuildServiceProvider();var f=new FinanceService(db,services.GetRequiredService<IServiceScopeFactory>(),NullLogger<FinanceService>.Instance);
  async Task<JsonElement> Write(string path,object body,Func<Task<object?>> action,string? key=null){var c=new DefaultHttpContext();c.Request.Method="POST";c.Request.Path=path;c.Request.Headers["Idempotency-Key"]=key??Guid.NewGuid().ToString();return JsonSerializer.SerializeToElement(await f.Write(user.Id,c,body,action,true),FinanceService.Json);}
  var input=new FestivalInput("FX",new(2026,12,30),new(2027,1,2),"CNY","1000","Planning","",[]);var key=Guid.NewGuid().ToString();var saved=await Write("/api/festivals",input,async()=>await f.FestivalSave(user.Id,null,input,"0"),key);var duplicate=await Write("/api/festivals",input,async()=>throw new Exception("must not execute"),key);Assert.Equal(saved.GetProperty("id").GetString(),duplicate.GetProperty("id").GetString());var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  await Assert.ThrowsAsync<ApiException>(()=>Write("/api/festivals",input with{Name="changed"},async()=>null,key));
  var allocation=new FestivalAllocation(tx.Id,"40","Gift",entry.Id,Rate:7,RateDate:new(2026,10,29),RateSource:"UserConfirmed");saved=await Write("/api/festivals/"+id+"/allocations",allocation,async()=>await f.FestivalAllocate(user.Id,id,allocation,version));version=saved.GetProperty("version").GetString()!;
  var detail=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json);Assert.Equal("280.00",detail.GetProperty("report").GetProperty("net").GetString());
  var second=await Write("/api/festivals",input with{Name="Second"},async()=>await f.FestivalSave(user.Id,null,input with{Name="Second"},"0"));var secondId=second.GetProperty("id").GetString()!;var secondVersion=second.GetProperty("version").GetString()!;
  await Assert.ThrowsAsync<ApiException>(()=>Write("/api/festivals/"+secondId+"/allocations",allocation,async()=>await f.FestivalAllocate(user.Id,secondId,allocation,secondVersion)));
  await Assert.ThrowsAsync<ApiException>(()=>Write("/api/festivals/"+secondId+"/allocations",allocation with{Amount="70",EntryId=null},async()=>await f.FestivalAllocate(user.Id,secondId,allocation with{Amount="70",EntryId=null},secondVersion)));
  db.ChangeTracker.Clear();var actual=await db.Transactions.SingleAsync(x=>x.Id==tx.Id);actual.Amount=30;await db.SaveChangesAsync();detail=JsonSerializer.SerializeToElement(await f.FestivalDetail(user.Id,id),FinanceService.Json);Assert.Equal("0.00",detail.GetProperty("report").GetProperty("net").GetString());Assert.False(detail.GetProperty("report").GetProperty("complete").GetBoolean());
 }
}

