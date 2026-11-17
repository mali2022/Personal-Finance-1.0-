using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public partial class ConcertTests
{
 private static async Task VerifyInvestmentReturnsOnMillionLedger(LifecycleFixture f)
 {
  var account=new Account{UserId=f.User.Id,Name="Investment performance fixture",Type="Investment",Currency="CNY"};f.Db.Add(account);
  var assets=Enumerable.Range(0,8).Select(n=>new InvestmentAsset{UserId=f.User.Id,AccountId=account.Id,Name="Investment "+n,Currency="CNY"}).ToArray();f.Db.AddRange(assets);
  foreach(var asset in assets){f.Db.AddRange(Enumerable.Range(0,200).Select(n=>new InvestmentTrade{UserId=f.User.Id,AssetId=asset.Id,Type="Buy",Quantity=1,Price=1,Amount=1,Date=new DateOnly(2025,1,1).AddDays(n),SettlementDate=new DateOnly(2025,1,1).AddDays(n)}));for(var n=0;n<12;n++)f.Db.Add(new InvestmentValuation{UserId=f.User.Id,AssetId=asset.Id,Date=new DateOnly(2025,n+1,1).AddMonths(1).AddDays(-1),Price=1.1m,Source="Synthetic benchmark"});f.Db.Add(new InvestmentValuation{UserId=f.User.Id,AssetId=asset.Id,Date=new(2026,1,1),Price=1.1m,Source="Synthetic benchmark"});}
  await f.Db.SaveChangesAsync();f.Db.ChangeTracker.Clear();
  var path=$"/api/investments/assets/{assets[0].Id}/returns?start=2025-01-01&end=2026-01-01&currency=CNY";
  var cold=new List<double>();var warm=new List<double>();
  for(var n=0;n<20;n++){
   await f.Db.Database.ExecuteSqlInterpolatedAsync($"UPDATE finance.Users SET InvestmentReturnRevision=NEWID() WHERE Id={f.User.Id}");
   var clock=Stopwatch.StartNew();var result=await Data(await f.Client.GetAsync(path));cold.Add(clock.Elapsed.TotalMilliseconds);Assert.Equal("Success",result.GetProperty("xirr").GetProperty("status").GetString());
   clock.Restart();var cached=await Data(await f.Client.GetAsync(path));warm.Add(clock.Elapsed.TotalMilliseconds);Assert.Equal(result.GetProperty("calculationId").GetGuid(),cached.GetProperty("calculationId").GetGuid());
  }
  static double Percentile(List<double> values,double p)=>values.Order().ElementAt((int)Math.Ceiling(values.Count*p)-1);
  foreach(var (name,values) in new[]{("cold",cold),("warm",warm)})Console.WriteLine($"Investment HTTP {name}: samples={values.Count} P50={Percentile(values,.5):F2}ms P95={Percentile(values,.95):F2}ms max={values.Max():F2}ms P99=not-reported(n<100)");
  Assert.True(Percentile(cold,.95)<=1000,"Single-asset P95 exceeds 1 second");
  var parallelWatch=Stopwatch.StartNew();var parallel=await Task.WhenAll(Enumerable.Range(0,8).Select(async _=>await Data(await f.Client.GetAsync(path))));Assert.All(parallel,x=>Assert.Equal("Success",x.GetProperty("xirr").GetProperty("status").GetString()));Console.WriteLine($"Investment concurrency=8, successful={parallel.Length}, max-batch-wall={parallelWatch.Elapsed.TotalMilliseconds:F2}ms");
  await using var connection=new SqlConnection(IsolatedSqlTestDatabase.ConnectionString());await connection.OpenAsync();var info=new List<string>();connection.InfoMessage+=(_,e)=>info.Add(e.Message);
  await using var command=connection.CreateCommand();command.CommandText="SET STATISTICS IO ON; SET STATISTICS TIME ON; SELECT Id,Date,SettlementDate,Amount,Quantity,Commission,Tax,OtherFee FROM finance.InvestmentTrade WHERE UserId=@user AND AssetId=@asset AND State=N'Active' AND SettlementDate<=@end ORDER BY SettlementDate,Id; SET STATISTICS IO OFF; SET STATISTICS TIME OFF;";command.Parameters.AddWithValue("@user",f.User.Id);command.Parameters.AddWithValue("@asset",assets[0].Id);command.Parameters.AddWithValue("@end",new DateTime(2026,1,1));await using(var reader=await command.ExecuteReaderAsync()){while(await reader.ReadAsync()){}while(await reader.NextResultAsync()){while(await reader.ReadAsync()){}}}
  Console.WriteLine("Investment isolated SQL read diagnostics: "+string.Join(" | ",info));
  Console.WriteLine("Scope: same 1M real ledger/2M entries; 8 investment assets, 1600 investment trades, 104 valuations; not 1M investment trades; samples include HTTP/auth/database, seed excluded; cache cold epochs deliberately changed.");
 }
}
