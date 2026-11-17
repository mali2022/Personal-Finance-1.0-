using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class ConcertMillionFactAttribute:FactAttribute {
 public ConcertMillionFactAttribute(){if(Environment.GetEnvironmentVariable("PF_CONCERT_MILLION")!="true" || string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PF_DELETION_TEST_DATABASE")))Skip="Explicit disposable million-row database run required";}
}
public partial class ConcertTests {
 [ConcertMillionFact] public async Task MillionRealLedgerRowsSupportExplicitTopicLinksAggregatesAndPagedArtistSceneQueries() {
  await using var f=await LifecycleFixture.Create();f.Db.Database.SetCommandTimeout(600);var seed=Stopwatch.StartNew();
  // One million physical transactions and two million real entries. No production data, no in-memory stand-in.
  await f.Db.Database.ExecuteSqlInterpolatedAsync($"""
   DECLARE @batch int=0;
   CREATE TABLE #seed(Id nvarchar(36) NOT NULL,N int NOT NULL);
   WHILE @batch<10 BEGIN
    INSERT #seed SELECT N'00000000-0000-4000-8000-'+RIGHT(REPLICATE(N'0',12)+CONVERT(nvarchar(12),@batch*100000+value),12),@batch*100000+value FROM GENERATE_SERIES(1,100000);
    INSERT finance.Transactions(Id,UserId,Version,Type,Amount,Currency,AccountId,OccurredAt,Note,Status,Fee,CreatedAt,UpdatedAt,CategoryId,Merchant,ProductName)
     SELECT Id,{f.User.Id},1,N'Expense',10,N'CNY',{f.Cash.Id},CONVERT(datetimeoffset,'2026-01-01T10:00:00+08:00'),N'CONCERT-MILLION-'+CONVERT(nvarchar(12),N),N'Confirmed',0,SYSUTCDATETIME(),SYSUTCDATETIME(),{f.Expense.Id},N'百万隔离艺人',N'合成历史商品' FROM #seed;
    INSERT finance.Entries(Id,UserId,Version,TransactionId,Kind,AccountId,Amount,Currency,ExchangeRate,BaseAmount)
     SELECT N'10000000-0000-4000-8000-'+RIGHT(REPLICATE(N'0',12)+CONVERT(nvarchar(12),N),12),{f.User.Id},1,Id,N'Account',{f.Cash.Id},-10,N'CNY',1,-10 FROM #seed;
    INSERT finance.Entries(Id,UserId,Version,TransactionId,Kind,CategoryId,Amount,Currency,ExchangeRate,BaseAmount)
     SELECT N'20000000-0000-4000-8000-'+RIGHT(REPLICATE(N'0',12)+CONVERT(nvarchar(12),N),12),{f.User.Id},1,Id,N'Expense',{f.Expense.Id},10,N'CNY',1,10 FROM #seed;
    TRUNCATE TABLE #seed;SET @batch+=1;
   END;
   DROP TABLE #seed;
   """);
  seed.Stop();Assert.Equal(1000000,await f.Db.Transactions.CountAsync(t=>t.UserId==f.User.Id));Assert.Equal(2000000,await f.Db.Entries.CountAsync(e=>e.UserId==f.User.Id));Assert.Equal(10000000,await f.Db.Entries.Where(e=>e.UserId==f.User.Id && e.Kind=="Expense").SumAsync(e=>e.Amount));
  Console.WriteLine($"Concert real SQL seed: transactions=1000000 entries=2000000 seedMs={seed.ElapsedMilliseconds}; generation excluded from query measurements");
  var artist=(await Data(await Write(f.Client,"/concerts/interests/topics",new InterestTopic("百万隔离艺人","Artist","")))).GetProperty("id").GetString()!;
  var brand=(await Data(await Write(f.Client,"/concerts/interests/topics",new InterestTopic("隔离品牌","Brand","")))).GetProperty("id").GetString()!;
  var sourceIds=await f.Db.Transactions.AsNoTracking().Where(t=>t.UserId==f.User.Id).OrderBy(t=>t.Id).Take(110).Select(t=>t.Id).ToArrayAsync();
  var sceneIds=new List<string>();for(var n=100;n<105;n++){var cost=new ConcertCost(Guid.NewGuid().ToString(),"Ticket",sourceIds[n],null,"10","本人","本人");var scene=Scene() with{Title="百万背景隔离场次 "+n,ArtistLink=new(artist),Costs=[cost]};sceneIds.Add((await Data(await Write(f.Client,"/concerts",scene))).GetProperty("id").GetString()!);}
  var purchases=Enumerable.Range(0,100).Select(n=>new InterestPurchase(new(2026,1,1),"CNY","隔离渠道","百万隔离艺人","MILLION-ORDER-"+n,sourceIds[n],null,"Daily","Purchased",[new(Guid.NewGuid().ToString(),"隔离商品 "+n,brand,"其他","",1,"10","0","0","0","10","Daily","Held",[new(artist,"10")])],[],[],"")).ToArray();
  f.Db.AddRange(purchases.Select(p=>new StoredDocument{UserId=f.User.Id,Kind="MusicPurchase",ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(p,FinanceService.Json)}));
  f.Db.AddRange(Enumerable.Range(0,2000).Select(n=>new StoredDocument{UserId=f.User.Id,Kind="MusicPurchase",ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(purchases[0] with{TransactionId=null,State="Planned",OrderNumber="PLAN-"+n,Items=[purchases[0].Items[0] with{Id=Guid.NewGuid().ToString()}]},FinanceService.Json)}));await f.Db.SaveChangesAsync();f.Db.ChangeTracker.Clear();
  var timingFailures=new List<string>();
  async Task<JsonElement> Measure(string name,string path,int limit) {var clock=Stopwatch.StartNew();var value=await Data(await f.Client.GetAsync("/api"+path));clock.Stop();Console.WriteLine($"Concert million HTTP: {name} elapsedMs={clock.ElapsedMilliseconds} limitMs={limit}; concurrency=1 samples=1");if(clock.ElapsedMilliseconds>=limit)timingFailures.Add($"{name} exceeded {limit}ms: {clock.ElapsedMilliseconds}ms");return value;}
  var candidates=await Measure("historical candidates page 10000","/concerts/interests/candidates?currency=CNY&page=10000&keyword=CONCERT-MILLION",5000);Assert.Equal(20,candidates.GetArrayLength());
  var missing=await Measure("historical keyword miss","/concerts/interests/candidates?currency=CNY&page=1&keyword=NEVER-MATCH-CONCERT",5000);Assert.Empty(missing.EnumerateArray());
  var page=await Measure("product page 50","/concerts/interests/purchases?page=50&size=20",5000);Assert.Equal(2100,page.GetProperty("total").GetInt32());Assert.Equal(20,page.GetProperty("items").GetArrayLength());
  var report=await Measure("historical aggregate by artist","/concerts/interests/report?currency=CNY&year=2026&artist="+artist,10000);Assert.Equal("1050.00",report.GetProperty("totals").GetProperty("net").GetString());Assert.Equal("1000.00",report.GetProperty("daily").GetProperty("net").GetString());
  report=await Measure("scene and artist filter","/concerts/interests/report?currency=CNY&year=2026&artist="+artist+"&scene="+sceneIds[0],10000);Assert.Equal("10.00",report.GetProperty("totals").GetProperty("net").GetString());
  var linked=await Data(await Write(f.Client,"/concerts/interests/batch-link",new InterestBatch([sourceIds[105]],artist,brand,true)));Assert.Equal(1,linked.GetArrayLength());Assert.Equal(1000000,await f.Db.Transactions.CountAsync(t=>t.UserId==f.User.Id));
  var trip=await Data(await Write(f.Client,"/concerts/trips",new ConcertTrip("百万背景旅行","CNY","30","Booked",sceneIds.ToArray(),[],[new(Guid.NewGuid().ToString(),sourceIds[106],"10",[])],"")));
  var venue=await Data(await Write(f.Client,"/concerts/experiences/venues",new ConcertVenue("百万背景场馆","上海","","","")));
  await Data(await Write(f.Client,"/concerts/experiences/seats",new ConcertSeatExperience(sceneIds[0],venue.GetProperty("id").GetString()!,"A","1排1座",4,4,4,4,"",[],"")));
  await Data(await Write(f.Client,"/concerts/experiences/memories",new ConcertMemory(sceneIds[0],"百万背景回忆","日记","",4,[],[],"","")));
  var purchaseDoc=await f.Db.Documents.AsNoTracking().FirstAsync(d=>d.UserId==f.User.Id && d.Kind=="MusicPurchase" && d.Content!=null);var originalPurchase=JsonSerializer.Deserialize<InterestPurchase>(purchaseDoc.Content,FinanceService.Json)!;
  await Data(await Write(f.Client,"/concerts/collections",new ConcertCollection("百万背景收藏","CNY","商品","","","","","","Held",purchaseDoc.Id,originalPurchase.Items[0].Id,null,"10",null,null,[],"")));
  await Data(await Write(f.Client,"/concerts/planning-budgets",new ConcertPlanBudget("百万背景年度预算",2026,"CNY","Annual",null,"500",null,null,"100","")));
  var p1Trips=await Measure("P1 trip sources","/concerts/trips",5000);Assert.Equal("10.00",p1Trips[0].GetProperty("report").GetProperty("unassigned").GetString());
  Assert.Single((await Measure("P1 seat experiences","/concerts/experiences/seats",5000)).EnumerateArray());
  Assert.Single((await Measure("P1 collection report","/concerts/collections",5000)).EnumerateArray());
  var p1Budget=await Measure("P1 scoped budget","/concerts/planning-budgets",10000);Assert.Equal("50.00",p1Budget[0].GetProperty("report").GetProperty("actual").GetString());
  var p1Overview=await Measure("P1 overview and memories","/concerts/overview?currency=CNY&year=2026",10000);Assert.Single(p1Overview.GetProperty("memories").EnumerateArray());Assert.Equal("50.00",p1Overview.GetProperty("annual").GetProperty("totalCost").GetString());
  await using var planConnection=new SqlConnection(IsolatedSqlTestDatabase.ConnectionString());await planConnection.OpenAsync();await using var command=planConnection.CreateCommand();command.CommandTimeout=60;
  var planQuery=f.Db.Transactions.AsNoTracking().Where(t=>t.UserId==f.User.Id && t.Type=="Expense" && t.Status=="Confirmed" && t.BusinessId==null && t.Currency=="CNY" && t.OccurredAt<=DateTimeOffset.UtcNow && (t.Note.Contains("CONCERT-MILLION") || t.Merchant!=null && t.Merchant.Contains("CONCERT-MILLION") || t.ProductName!=null && t.ProductName.Contains("CONCERT-MILLION"))).OrderByDescending(t=>t.OccurredAt).ThenByDescending(t=>t.Id).Select(t=>t.Id).Skip(199980).Take(20);
  command.CommandText="SET STATISTICS XML ON; "+planQuery.ToQueryString()+"; SET STATISTICS XML OFF;";
  await using var reader=await command.ExecuteReaderAsync();string? plan=null;do{while(await reader.ReadAsync())if(reader.FieldCount==1 && reader.GetName(0).Contains("Showplan",StringComparison.OrdinalIgnoreCase))plan=reader.GetString(0);}while(await reader.NextResultAsync());Assert.NotNull(plan);Console.WriteLine("Concert million actual plan operators: "+string.Join(", ",System.Text.RegularExpressions.Regex.Matches(plan!,"PhysicalOp=\"([^\"]+)\"").Select(m=>m.Groups[1].Value).Distinct()));
  Console.WriteLine("Scope: synthetic disposable SQL Server; 1M ledger transactions, 2M entries, 2100 purchase/plan documents, five scenes; not 1M music documents, production capacity, concurrency or percentile certification.");
  await VerifyInvestmentReturnsOnMillionLedger(f);
  Assert.True(timingFailures.Count==0,string.Join("; ",timingFailures));
 }
}
