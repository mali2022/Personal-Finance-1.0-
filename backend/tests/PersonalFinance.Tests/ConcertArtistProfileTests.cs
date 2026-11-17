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
 [ProfileSqlFact] public async Task ArtistProfilesValidateAliasesMembersHistoryAndOnlySuggestLedgerLinks() {
  var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
  var password="Profile-Test-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@profile.test",DisplayName="Profile test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
  var user=User();var other=User();var cash=new Account{UserId=user.Id,Name="测试现金",Type="Cash",Currency="CNY",OpeningBalance=1000};var root=new Category{UserId=user.Id,Name="测试娱乐",Kind="Expense"};var cat=new Category{UserId=user.Id,ParentId=root.Id,Name="测试消费",Kind="Expense"};db.AddRange(cash,root,cat);await db.SaveChangesAsync();
  using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
  foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());await Data(await Write(pair.Item1,"/settings/modules",new ConcertModules(true),put:true));}
  async Task<System.Text.Json.JsonElement> Create(InterestTopic topic)=>await Data(await Write(client,"/concerts/interests/topics",topic));
  var person=await Create(new("成员甲","Artist","",new("Solo",["别名甲"],[])));var personId=person.GetProperty("id").GetString()!;
  var legacy=await Create(new("成员乙","Artist","旧档案"));var legacyId=legacy.GetProperty("id").GetString()!;
  var brand=(await Create(new("测试品牌","Brand",""))).GetProperty("id").GetString()!;
  var foreign=(await Data(await Write(stranger,"/concerts/interests/topics",new InterestTopic("另一用户艺人","Artist","")))).GetProperty("id").GetString()!;
  var members=new[]{new InterestMember(personId,"主唱",new(2000,1,1),null),new InterestMember(legacyId,"吉他",new(2000,1,1),new(2020,1,1))};
  var input=new InterestTopic("测试组合","Artist","",new("Band",[" MAYDAY "],members));var key=Guid.NewGuid().ToString();
  var saved=await Data(await Write(client,"/concerts/interests/topics",input,key:key));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  Assert.Equal(id,(await Data(await Write(client,"/concerts/interests/topics",input,key:key))).GetProperty("id").GetString());
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/interests/topics",input with{Note="changed"},key:key)).StatusCode);
  async Task Invalid(InterestTopic value)=>Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/interests/topics/"+id,value,version,put:true)).StatusCode);
  await Invalid(input with{ArtistProfile=new("Band",["alias"," ALIAS "],members)});
  await Invalid(input with{ArtistProfile=new("Band",[" 测试组合 "],members)});
  await Invalid(input with{ArtistProfile=new("Band",["  "],members)});
  // Malformed null JSON may be rejected by request binding (400) before domain validation (422).
  foreach(var malformed in new[]{input with{ArtistProfile=new("Band",null!,members)},input with{ArtistProfile=new("Band",[],[null!])}})
   Assert.Contains((await Write(client,"/concerts/interests/topics/"+id,malformed,version,put:true)).StatusCode,new[]{HttpStatusCode.BadRequest,HttpStatusCode.UnprocessableEntity});
  await Invalid(input with{ArtistProfile=new("Band",Enumerable.Range(0,21).Select(n=>"alias"+n).ToArray(),members)});
  await Invalid(input with{ArtistProfile=new("Solo",[],members)});
  await Invalid(input with{ArtistProfile=new("Band",[],[members[0],members[0]])});
  await Invalid(input with{ArtistProfile=new("Band",[],[members[0] with{ArtistId=id}])});
  await Invalid(input with{ArtistProfile=new("Band",[],[members[0] with{ArtistId=foreign}])});
  await Invalid(input with{ArtistProfile=new("Band",[],[members[0] with{ArtistId=brand}])});
  await Invalid(input with{ArtistProfile=new("Band",[],[members[0] with{JoinedOn=new(2020,1,1),LeftOn=new(2019,1,1)}])});
  var secondBand=(await Create(new("另一个组合","Artist","",new("Band",[],[])))).GetProperty("id").GetString()!;
  await Invalid(input with{ArtistProfile=new("Band",[],[members[0] with{ArtistId=secondBand}])});
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/interests/topics",new InterestTopic("无效品牌","Brand","",new("Solo",[],[])))).StatusCode);
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/interests/topics/"+legacyId,new InterestTopic("成员乙","Artist","",new("Band",[],[])),legacy.GetProperty("version").GetString()!,put:true)).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync("/api/concerts/interests/topics/"+id+"/history")).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/concerts/interests/topics/"+id,input,version,put:true)).StatusCode);
  saved=await Data(await Write(client,"/concerts/interests/topics/"+id,new InterestTopic("更名组合","Artist","旧客户端更新"),version,put:true));version=saved.GetProperty("version").GetString()!;
  var catalog=await Data(await client.GetAsync("/api/concerts/interests/catalog"));var profile=catalog.GetProperty("topics").EnumerateArray().Single(t=>t.GetProperty("id").GetString()==id).GetProperty("input").GetProperty("artistProfile");
  Assert.Equal("MAYDAY",profile.GetProperty("aliases")[0].GetString());Assert.Equal(2,profile.GetProperty("members").GetArrayLength());
  var tx=(await Data(await Write(client,"/transactions/expense",new SaveTransaction("Expense","19",cash.Id,new(2026,1,1,10,0,0,TimeSpan.FromHours(8)),"mayday 商品",cat.Id)))).GetProperty("id").GetString()!;var baseline=await db.Transactions.CountAsync();
  var candidates=await Data(await client.GetAsync("/api/concerts/interests/candidates?currency=CNY"));var recommendation=candidates.EnumerateArray().Single(t=>t.GetProperty("id").GetString()==tx).GetProperty("recommendations").EnumerateArray().Single(r=>r.GetProperty("id").GetString()==id);
  Assert.Equal("ReviewRequired",recommendation.GetProperty("confidence").GetString());
  Assert.Equal("0.00",(await Data(await client.GetAsync("/api/concerts/interests/report?currency=CNY&year=2026&artist="+id))).GetProperty("totals").GetProperty("net").GetString());
  Assert.Equal(0,(await Data(await client.GetAsync("/api/concerts/interests/purchases"))).GetProperty("total").GetInt32());
  saved=await Data(await Write(client,"/concerts/interests/topics/"+id,new InterestTopic("更名组合","Artist","",new("Band",[],[])),version,put:true));
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/interests/topics/"+id,input,version,put:true)).StatusCode);
  var history=await Data(await client.GetAsync("/api/concerts/interests/topics/"+id+"/history"));
  Assert.Contains(history.EnumerateArray(),h=>h.GetProperty("before").ValueKind!=System.Text.Json.JsonValueKind.Null && h.GetProperty("before").GetProperty("artistProfile").GetProperty("members").GetArrayLength()==2 && h.GetProperty("after").GetProperty("artistProfile").GetProperty("members").GetArrayLength()==0);
  Assert.Equal(baseline,await db.Transactions.CountAsync());
  candidates=await Data(await client.GetAsync("/api/concerts/interests/candidates?currency=CNY"));Assert.DoesNotContain(candidates[0].GetProperty("recommendations").EnumerateArray(),r=>r.GetProperty("id").GetString()==id);
  var prefs=await Data(await client.GetAsync("/api/settings/modules"));await Data(await Write(client,"/settings/modules",new ConcertModules(false),prefs.GetProperty("version").GetString()!,put:true));
  Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/concerts/interests/topics/"+id+"/history")).StatusCode);
 }
}
