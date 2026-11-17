using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public partial class ConcertTests
{
 [ProfileSqlFact] public async Task InvestmentBoundaryAndTrendBudgetsUseBoundedRealSqlReads()
 {
  await using var f=await LifecycleFixture.Create();
  var accounts=Enumerable.Range(0,2).Select(n=>new Account{UserId=f.User.Id,Type="Investment",Currency="CNY",Name="Profile account "+n,OpeningBalance=10000}).ToArray();f.Db.AddRange(accounts);
  var assets=Enumerable.Range(0,8).Select(n=>new InvestmentAsset{UserId=f.User.Id,AccountId=accounts[n%2].Id,Currency="CNY",Name="Profile asset "+n}).ToArray();f.Db.AddRange(assets);
  foreach(var asset in assets){for(var n=0;n<200;n++){var date=new DateOnly(2025,1,1).AddDays(n);var tx=new FinanceTransaction{UserId=f.User.Id,AccountId=asset.AccountId,Type="InvestmentPrincipal",Amount=1,Currency="CNY",OccurredAt=new(date.ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(8)),AdjustmentDirection="Decrease"};tx.Entries.Add(new(){UserId=f.User.Id,Kind="Account",AccountId=asset.AccountId,Amount=-1,BaseAmount=-1,Currency="CNY",TransactionId=tx.Id});f.Db.Add(tx);f.Db.Add(new InvestmentTrade{UserId=f.User.Id,AssetId=asset.Id,Type="Buy",Quantity=1,Price=1,Amount=1,Date=date,SettlementDate=date,TransactionId=tx.Id,OwnsTransaction=true});}for(var n=0;n<12;n++)f.Db.Add(new InvestmentValuation{UserId=f.User.Id,AssetId=asset.Id,Date=new DateOnly(2025,n+1,1).AddMonths(1).AddDays(-1),Price=1.1m,Source="Isolated profile"});f.Db.Add(new InvestmentValuation{UserId=f.User.Id,AssetId=asset.Id,Date=new(2026,1,1),Price=1.1m,Source="Isolated profile"});}
  await f.Db.SaveChangesAsync();f.Db.ChangeTracker.Clear();
  foreach(var account in accounts)foreach(var pair in new[]{("2024-12-31","10000"),("2026-01-01","10080")})await Data(await Write(f.Client,"/investments/boundary-values",new{accountId=account.Id,date=pair.Item1,value=pair.Item2,source="Verified synthetic cash + all holdings",includesCashAndHoldings=true}));
  async Task<JsonElement> Boundary(string[] ids)=>await Data(await f.Client.PostAsJsonAsync("/api/investments/returns/boundary",new{accountIds=ids,start="2025-01-01",end="2026-01-01",currency="CNY"}));
  var samples=new Dictionary<string,List<double>>{{"account-cold",[]},{"portfolio-cold",[]},{"trend-cold",[]}};
  for(var n=0;n<20;n++){
   await f.Db.Database.ExecuteSqlInterpolatedAsync($"UPDATE finance.Users SET InvestmentReturnRevision=NEWID() WHERE Id={f.User.Id}");
   var clock=Stopwatch.StartNew();var account=await Boundary([accounts[0].Id]);samples["account-cold"].Add(clock.Elapsed.TotalMilliseconds);Assert.Equal(.008,account.GetProperty("xirr").GetProperty("rate").GetDouble(),8);
   clock.Restart();var portfolio=await Boundary(accounts.Select(x=>x.Id).ToArray());samples["portfolio-cold"].Add(clock.Elapsed.TotalMilliseconds);Assert.Equal(2,portfolio.GetProperty("cashFlows").GetArrayLength());Assert.Equal(.008,portfolio.GetProperty("xirr").GetProperty("rate").GetDouble(),8);
   clock.Restart();var trend=await Data(await f.Client.GetAsync($"/api/investments/assets/{assets[0].Id}/return-trend?start=2025-01-01&end=2026-01-01&currency=CNY"));samples["trend-cold"].Add(clock.Elapsed.TotalMilliseconds);Assert.Equal(13,trend.GetProperty("points").GetArrayLength());
  }
  foreach(var pair in samples){var sorted=pair.Value.Order().ToArray();var p95=sorted[18];Console.WriteLine($"Investment profile {pair.Key}: n=20 P50={sorted[9]:F2}ms P95={p95:F2}ms max={sorted[^1]:F2}ms P99=not-reported; account-transactions=1600 entries=1600 assets=8 trades=1600 valuations=104 snapshots=4; separate small SQL fixture, not million-size background");Assert.True(p95<=(pair.Key=="account-cold"?2000:3000),pair.Key+" budget exceeded");}
 }
}
