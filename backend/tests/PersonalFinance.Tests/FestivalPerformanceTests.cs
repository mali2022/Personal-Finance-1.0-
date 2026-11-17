using Microsoft.Data.SqlClient;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
using Xunit.Abstractions;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class FestivalPerformanceTests(ITestOutputHelper output) {
 [ProfileSqlFact]
 public async Task AnnualSummaryUsesBoundedLinkedTransactions(){
  await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);await db.Database.MigrateAsync();var user=new AppUser{Email=Guid.NewGuid()+"@festival-performance.test"};db.Add(user);var account=new Account{UserId=user.Id,Name="perf"};db.Add(account);
  for(var i=0;i<200;i++){
   var input=new FestivalInput("Performance "+i,new(2026,1,1),new(2026,1,2),"CNY","1000","Planning","",[]);var doc=new StoredDocument{UserId=user.Id,Kind="FestivalEvent",Name=input.Name,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(input,FinanceService.Json)};db.Add(doc);
   for(var j=0;j<5;j++){var tx=new FinanceTransaction{UserId=user.Id,AccountId=account.Id,Amount=10,Currency="CNY",Type="Expense",Status="Confirmed",OccurredAt=DateTimeOffset.UtcNow};db.Add(tx);db.Add(new StoredDocument{UserId=user.Id,Kind="FestivalAllocation",Name=doc.Id,TransactionId=tx.Id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new FestivalAllocationRecord(new(tx.Id,"10"),OriginalCurrency:"CNY"),FinanceService.Json)});}
  }
  await db.SaveChangesAsync();db.ChangeTracker.Clear();using var services=new ServiceCollection().BuildServiceProvider();var f=new FinanceService(db,services.GetRequiredService<IServiceScopeFactory>(),NullLogger<FinanceService>.Instance);var sw=Stopwatch.StartNew();var result=JsonSerializer.SerializeToElement(await f.FestivalAnnual(user.Id,2026),FinanceService.Json);sw.Stop();Assert.Equal(200,result.GetProperty("items").GetArrayLength());Assert.All(result.GetProperty("items").EnumerateArray(),x=>Assert.Equal("50.00",x.GetProperty("report").GetProperty("net").GetString()));
  output.WriteLine($"SQL Server isolated / {Environment.OSVersion} / events=200 / linked transactions=1000 / annual elapsed={sw.ElapsedMilliseconds}ms / not a million-row production test");
    await using var planConnection=new SqlConnection(IsolatedSqlTestDatabase.ConnectionString());await planConnection.OpenAsync();
  await using(var planCommand=planConnection.CreateCommand()) {
   planCommand.CommandText="SET STATISTICS XML ON; SELECT Id FROM finance.Documents WHERE UserId=@u AND Kind=N'FestivalAllocation'; SET STATISTICS XML OFF;";planCommand.Parameters.AddWithValue("@u",user.Id);
   await using var reader=await planCommand.ExecuteReaderAsync();string? plan=null;do {while(await reader.ReadAsync()){if(reader.FieldCount==1 && reader.GetName(0).Contains("Showplan",StringComparison.OrdinalIgnoreCase)) plan=reader.GetString(0);}}while(await reader.NextResultAsync());
   output.WriteLine(plan==null?"SQL execution plan unavailable from provider; query text recorded below":"Actual SQL plan operators: "+string.Join(", ",System.Text.RegularExpressions.Regex.Matches(plan,"PhysicalOp=\"([^\"]+)\"").Select(m=>m.Groups[1].Value).Distinct()));
  }  output.WriteLine(db.Documents.Where(x=>x.UserId==user.Id && x.Kind=="FestivalAllocation").ToQueryString());
 }
}


