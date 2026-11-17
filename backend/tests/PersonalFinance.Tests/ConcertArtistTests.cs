using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
public partial class ConcertTests {
 [ProfileSqlFact] public async Task SceneArtistIdentitySurvivesRenameAndSupportsExplicitUnlinkWithoutInventingCash() {
  var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
  var password="Artist-Test-"+Guid.NewGuid().ToString("N");
  AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@artist.test",DisplayName="Artist test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
  var user=User();var other=User();var cash=new Account{UserId=user.Id,Name="测试现金",Type="Cash",Currency="CNY",OpeningBalance=1000};var root=new Category{UserId=user.Id,Name="测试娱乐",Kind="Expense"};var cat=new Category{UserId=user.Id,ParentId=root.Id,Name="测试门票",Kind="Expense"};db.AddRange(cash,root,cat);await db.SaveChangesAsync();
  using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
  foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());await Data(await Write(pair.Item1,"/settings/modules",new ConcertModules(true),put:true));}
  var artist=await Data(await Write(client,"/concerts/interests/topics",new InterestTopic("测试乐队","Artist","")));var artistId=artist.GetProperty("id").GetString()!;
  var sameName=(await Data(await Write(client,"/concerts/interests/topics",new InterestTopic("测试乐队","Artist","同名另一档案")))).GetProperty("id").GetString()!;
  var brand=(await Data(await Write(client,"/concerts/interests/topics",new InterestTopic("测试品牌","Brand","")))).GetProperty("id").GetString()!;
  var foreign=(await Data(await Write(stranger,"/concerts/interests/topics",new InterestTopic("另一用户艺人","Artist","")))).GetProperty("id").GetString()!;
  Assert.Equal(HttpStatusCode.NotFound,(await Write(client,"/concerts",Scene() with{ArtistLink=new(foreign)})).StatusCode);
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts",Scene() with{ArtistLink=new(brand)})).StatusCode);
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts",Scene() with{ArtistLink=new("not-a-guid")})).StatusCode);
  var date=new DateTimeOffset(2026,1,1,10,0,0,TimeSpan.FromHours(8));
  var payment=(await Data(await Write(client,"/transactions/expense",new SaveTransaction("Expense","150",cash.Id,date,CategoryId:cat.Id)))).GetProperty("id").GetString()!;
  var cost=new ConcertCost(Guid.NewGuid().ToString(),"Ticket",payment,null,"100","本人","本人");
  var input=Scene() with{Artist="不同的显示名称",ArtistLink=new(artistId),Costs=[cost]};var key=Guid.NewGuid().ToString();
  var saved=await Data(await Write(client,"/concerts",input,key:key));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  Assert.Equal(id,(await Data(await Write(client,"/concerts",input,key:key))).GetProperty("id").GetString());
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts",input with{ArtistLink=new(sameName)},key:key)).StatusCode);
  async Task<string?> Net(string artist)=> (await Data(await client.GetAsync("/api/concerts/interests/report?currency=CNY&year=2026&artist="+artist))).GetProperty("totals").GetProperty("net").GetString();
  Assert.Equal("100.00",await Net(artistId));Assert.Equal("0.00",await Net(sameName));
  Assert.Equal("测试乐队",(await Data(await client.GetAsync("/api/concerts/"+id))).GetProperty("input").GetProperty("artist").GetString());
  await Data(await Write(client,"/concerts/interests/topics/"+artistId,new InterestTopic("更名乐队","Artist",""),artist.GetProperty("version").GetString()!,put:true));
  Assert.Equal("100.00",await Net(artistId));
  await Data(await Write(client,"/concerts",Scene() with{ArtistLink=new(artistId),Title="更名后的另一场"}));
  var annual=await Data(await client.GetAsync("/api/concerts/report?year=2026&currency=CNY"));
  var grouped=annual.GetProperty("artists").EnumerateArray().Single(x=>x.GetProperty("id").GetString()==artistId);Assert.Equal("更名乐队",grouped.GetProperty("name").GetString());Assert.Equal(2,grouped.GetProperty("count").GetInt32());Assert.Equal("100.00",grouped.GetProperty("cost").GetString());
  await Data(await Write(client,"/concerts",Scene() with{Artist="更名乐队",Costs=[cost with{Id=Guid.NewGuid().ToString(),Amount="50"}]}));
  Assert.Equal("150.00",await Net(artistId));
  var refund=(await Data(await Write(client,"/transactions/refund",new SaveTransaction("Refund","20",cash.Id,date,CategoryId:cat.Id,OriginalTransactionId:payment)))).GetProperty("id").GetString()!;
  input=input with{ArtistLink=null,Refunds=[new(Guid.NewGuid().ToString(),cost.Id,"Full","20","0",refund,"20","")]};
  saved=await Data(await Write(client,"/concerts/"+id,input,version,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal(artistId,(await Data(await client.GetAsync("/api/concerts/"+id))).GetProperty("input").GetProperty("artistLink").GetProperty("artistId").GetString());
  Assert.Equal("130.00",await Net(artistId));
  var baseline=await db.Transactions.CountAsync();input=input with{Artist="更名乐队",ArtistLink=new(null)};
  saved=await Data(await Write(client,"/concerts/"+id,input,version,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal("50.00",await Net(artistId));
  Assert.Equal("130.00",(await Data(await client.GetAsync("/api/concerts/interests/report?currency=CNY&year=2026"))).GetProperty("totals").GetProperty("net").GetString());
  saved=await Data(await Write(client,"/concerts/"+id,input with{ArtistLink=new(sameName)},version,put:true));
  Assert.Equal("80.00",await Net(sameName));Assert.Equal("50.00",await Net(artistId));
  Assert.Equal(baseline,await db.Transactions.CountAsync());
  Assert.Contains((await Data(await client.GetAsync("/api/concerts/"+id+"/history"))).EnumerateArray(),x=>x.GetProperty("action").GetString()=="ArtistLinkUpdated");
  Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync("/api/concerts/"+id)).StatusCode);
 }
}
