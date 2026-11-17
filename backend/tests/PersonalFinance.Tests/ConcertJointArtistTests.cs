using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
public partial class ConcertTests {
 [ProfileSqlFact] public async Task JointArtistsSplitRefundsProductsAndConfirmedLossesWithoutDuplicatingLedger() {
  var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
  var password="Joint-Test-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@joint.test",DisplayName="Joint test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
  var user=User();var other=User();var cash=new Account{UserId=user.Id,Name="测试现金",Type="Cash",Currency="CNY",OpeningBalance=1000};var usd=new Account{UserId=user.Id,Name="测试美元",Type="Cash",Currency="USD",OpeningBalance=1000};var root=new Category{UserId=user.Id,Name="测试娱乐",Kind="Expense"};var cat=new Category{UserId=user.Id,ParentId=root.Id,Name="测试费用",Kind="Expense"};db.AddRange(cash,usd,root,cat);await db.SaveChangesAsync();
  using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
  foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());await Data(await Write(pair.Item1,"/settings/modules",new ConcertModules(true),put:true));}
  async Task<string> Topic(HttpClient c,string name,string kind="Artist")=>(await Data(await Write(c,"/concerts/interests/topics",new InterestTopic(name,kind,"")))).GetProperty("id").GetString()!;
  var a=await Topic(client,"艺人甲");var b=await Topic(client,"艺人乙");var c=await Topic(client,"商品艺人");var foreign=await Topic(stranger,"另一用户");var brand=await Topic(client,"品牌","Brand");
  var date=new DateTimeOffset(2026,1,1,10,0,0,TimeSpan.FromHours(8));
  async Task<string> Expense(string amount,string? account=null)=>(await Data(await Write(client,"/transactions/expense",new SaveTransaction("Expense",amount,account??cash.Id,date,CategoryId:cat.Id)))).GetProperty("id").GetString()!;
  var payment=await Expense("100");var refund=(await Data(await Write(client,"/transactions/refund",new SaveTransaction("Refund","20",cash.Id,date,CategoryId:cat.Id,OriginalTransactionId:payment)))).GetProperty("id").GetString()!;
  var advance=await Data(await Write(client,"/advances",new AdvanceInput("同行费用","同行",cash.Id,"100","40",date,CategoryId:cat.Id)));var advanceId=advance.GetProperty("id").GetString()!;
  var businessId=advance.GetProperty("businessId").GetString()!;var funding=await db.Transactions.AsNoTracking().SingleAsync(t=>t.UserId==user.Id && t.BusinessId==businessId && t.Type=="ReimbursementAdvance");
  var cost=new ConcertCost(Guid.NewGuid().ToString(),"Ticket",payment,null,"100","本人","本人");
  var input=Scene() with{Title="联合演出",ArtistLink=new(c),ArtistAllocation=new("Split",[new(a,60),new(b,30)]),Costs=[cost,new(Guid.NewGuid().ToString(),"Hotel",funding.Id,null,"60","本人","同行"),new(Guid.NewGuid().ToString(),"Hotel",advance.GetProperty("ownTransactionId").GetString()!,null,"40","本人","本人")],Refunds=[new(Guid.NewGuid().ToString(),cost.Id,"Full","20","0",refund,"20","")],Plans=[new(Guid.NewGuid().ToString(),"Transport","未发生计划","10","Planned",null)]};
  var countBeforeScene=await db.Transactions.CountAsync();var key=Guid.NewGuid().ToString();var saved=await Data(await Write(client,"/concerts",input,key:key));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  Assert.Equal(id,(await Data(await Write(client,"/concerts",input,key:key))).GetProperty("id").GetString());Assert.Equal(countBeforeScene,await db.Transactions.CountAsync());
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts",input with{ArtistAllocation=new("Split",[new(a,100)])},key:key)).StatusCode);
  async Task Invalid(ConcertArtistAllocation allocation,HttpStatusCode expected=HttpStatusCode.UnprocessableEntity)=>Assert.Equal(expected,(await Write(client,"/concerts/"+id,input with{ArtistAllocation=allocation},version,put:true)).StatusCode);
  await Invalid(new("Split",[new(a,60),new(b,50)]));await Invalid(new("Split",[new(a,-1)]));await Invalid(new("Split",[new(a,33.333m)]));await Invalid(new("Split",[new(a,50),new(a,50)]));await Invalid(new("Primary",[new(a,50)]));await Invalid(new("Split",[new(brand,100)]));await Invalid(new("Split",[new(foreign,100)]),HttpStatusCode.NotFound);
  async Task<JsonElement> Detail()=>await Data(await client.GetAsync("/api/concerts/"+id));
  async Task<string?> Net(string artist)=>(await Data(await client.GetAsync("/api/concerts/interests/report?currency=CNY&year=2026&artist="+artist))).GetProperty("totals").GetProperty("net").GetString();
  var detail=await Detail();var report=detail.GetProperty("report");Assert.Equal("180.00",report.GetProperty("actual").GetString());Assert.Equal("120.00",report.GetProperty("personalNetCost").GetString());Assert.Equal("60.00",report.GetProperty("pendingAdvances").GetString());Assert.Equal("10.00",report.GetProperty("planned").GetString());
  var attribution=report.GetProperty("artistAttribution");Assert.Equal("72.00",attribution.EnumerateArray().Single(p=>p.GetProperty("artistId").GetString()==a).GetProperty("personalNetCost").GetString());Assert.Equal("12.00",attribution.EnumerateArray().Single(p=>p.GetProperty("artistId").ValueKind==JsonValueKind.Null).GetProperty("personalNetCost").GetString());
  Assert.Equal("72.00",await Net(a));Assert.Equal("36.00",await Net(b));Assert.Equal("0.00",await Net(c));
  var productPayment=await Expense("10");var item=new InterestItem(Guid.NewGuid().ToString(),"独立归属商品",null,"其他","",1,"10","0","0","0","10","Daily","Held",[new(c,"10")]);
  await Data(await Write(client,"/concerts/interests/purchases",new InterestPurchase(new(2026,1,1),"CNY","现场","商户","商品订单",productPayment,id,"LiveMerch","Purchased",[item],[],[],"")));
  await Data(await Write(client,"/advances/"+advanceId+"/resolve",new AdvanceResolutionInput("Gift","10","自愿承担",cat.Id),advance.GetProperty("version").GetString()!));
  detail=await Detail();report=detail.GetProperty("report");attribution=report.GetProperty("artistAttribution");
  Assert.Equal("190.00",report.GetProperty("actual").GetString());Assert.Equal("140.00",report.GetProperty("personalNetCost").GetString());
  Assert.Equal(190,attribution.EnumerateArray().Sum(p=>FinanceService.Money(p.GetProperty("actual").GetString())));Assert.Equal(140,attribution.EnumerateArray().Sum(p=>FinanceService.Money(p.GetProperty("personalNetCost").GetString())));
  Assert.Equal("78.00",attribution.EnumerateArray().Single(p=>p.GetProperty("artistId").GetString()==a).GetProperty("personalNetCost").GetString());Assert.Equal("10.00",attribution.EnumerateArray().Single(p=>p.GetProperty("artistId").GetString()==c).GetProperty("personalNetCost").GetString());
  var annual=await Data(await client.GetAsync("/api/concerts/report?year=2026&currency=CNY"));Assert.Equal("140.00",annual.GetProperty("totalCost").GetString());Assert.Equal(140,annual.GetProperty("artists").EnumerateArray().Sum(p=>FinanceService.Money(p.GetProperty("cost").GetString())));Assert.Equal("72.00",await Net(a));Assert.Equal("10.00",await Net(c));
  var nextAdvance=await Data(await client.GetAsync("/api/advances/"+advanceId));await Data(await Write(client,"/advances/"+advanceId+"/resolve",new AdvanceResolutionInput("MerchantRefund","10","商家退回",Settlement:new(cash.Id,"10",date)),nextAdvance.GetProperty("version").GetString()!));
  report=(await Detail()).GetProperty("report");Assert.Equal("180.00",report.GetProperty("actual").GetString());Assert.Equal("140.00",report.GetProperty("personalNetCost").GetString());Assert.Equal(180,report.GetProperty("artistAttribution").EnumerateArray().Sum(p=>FinanceService.Money(p.GetProperty("actual").GetString())));
  var usdPayment=await Expense("30",usd.Id);await Data(await Write(client,"/concerts",Scene() with{Currency="USD",ArtistAllocation=input.ArtistAllocation,Costs=[cost with{Id=Guid.NewGuid().ToString(),TransactionId=usdPayment,Amount="30"}]}));
  Assert.Equal("30.00",(await Data(await client.GetAsync("/api/concerts/report?year=2026&currency=USD"))).GetProperty("totalCost").GetString());
  var ledgerCount=await db.Transactions.CountAsync();detail=await Detail();input=detail.GetProperty("input").Deserialize<ConcertInput>(FinanceService.Json)!;version=detail.GetProperty("version").GetString()!;
  saved=await Data(await Write(client,"/concerts/"+id,input with{ArtistAllocation=null},version,put:true));version=saved.GetProperty("version").GetString()!;Assert.Equal("Split",(await Detail()).GetProperty("input").GetProperty("artistAllocation").GetProperty("mode").GetString());
  saved=await Data(await Write(client,"/concerts/"+id,input with{ArtistAllocation=new("Split",[])},version,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal("0.00",await Net(a));Assert.Equal("0.00",await Net(b));Assert.Equal("10.00",await Net(c));report=(await Detail()).GetProperty("report");Assert.Equal("130.00",report.GetProperty("artistAttribution").EnumerateArray().Single(p=>p.GetProperty("artistId").ValueKind==JsonValueKind.Null).GetProperty("personalNetCost").GetString());
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/"+id,input,"0",put:true)).StatusCode);
  await Data(await Write(client,"/concerts/"+id,input with{ArtistAllocation=new("Primary",[])},version,put:true));Assert.Equal(JsonValueKind.Null,(await Detail()).GetProperty("report").GetProperty("artistAttribution").ValueKind);
  Assert.Equal(ledgerCount,await db.Transactions.CountAsync());Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync("/api/concerts/"+id)).StatusCode);
  Assert.Contains((await Data(await client.GetAsync("/api/concerts/"+id+"/history"))).EnumerateArray(),e=>e.GetProperty("action").GetString()=="ArtistSharesUpdated");
  // A pre-field pending operation must retain its old request hash when the new optional field is absent.
  var legacyBody=Scene();var legacyJson=JsonSerializer.Serialize(legacyBody,FinanceService.Json);
  Assert.DoesNotContain("\"artistAllocation\"",legacyJson);
  // Use the original DTO bytes; a JsonNode rewrite can change escaping (not the request meaning).
  var legacyKey=Guid.NewGuid().ToString();var oldHash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("POST/api/concerts"+legacyJson)));
  db.Idempotencies.Add(new(){UserId=user.Id,Key=legacyKey,Hash=oldHash,Method="POST",Path="/api/concerts",Response="{\"id\":\"legacy-response\",\"version\":\"1\"}",CompletedAt=DateTimeOffset.UtcNow});await db.SaveChangesAsync();
  var sceneCount=await db.Documents.CountAsync(d=>d.UserId==user.Id && d.Kind=="ConcertScene");
  Assert.Equal("legacy-response",(await Data(await Write(client,"/concerts",legacyBody,key:legacyKey))).GetProperty("id").GetString());
  Assert.Equal(sceneCount,await db.Documents.CountAsync(d=>d.UserId==user.Id && d.Kind=="ConcertScene"));
 }
}
