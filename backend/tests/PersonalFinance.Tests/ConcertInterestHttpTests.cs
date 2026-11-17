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
 [ProfileSqlFact] public async Task MusicPurchasesUseRealLedgerAndExplicitAllocationsAcrossRefundsScenesAndUnlinking() {
  var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
  var password="Music-Test-"+Guid.NewGuid().ToString("N");var user=new AppUser{Email=Guid.NewGuid().ToString("N")+"@music.test",DisplayName="Music test"};user.PasswordHash=new PasswordHasher<AppUser>().HashPassword(user,password);
  var cash=new Account{UserId=user.Id,Name="隔离现金",Type="Cash",Currency="CNY",OpeningBalance=10000};var parent=new Category{UserId=user.Id,Name="兴趣",Kind="Expense"};var cat=new Category{UserId=user.Id,Name="周边",Kind="Expense",ParentId=parent.Id};db.AddRange(user,cash,parent,cat);await db.SaveChangesAsync();
  var requestTrace=new ConcertPaginationTrace();using var factory=new Factory(connection,requestTrace);using var client=factory.CreateClient();var login=await Data(await client.PostAsJsonAsync("/api/auth/login",new{email=user.Email,password}));client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());
  await Data(await Write(client,"/settings/modules",new ConcertModules(true),put:true));
  var artist=(await Data(await Write(client,"/concerts/interests/topics",new InterestTopic("五月天","Artist","个人专题")))).GetProperty("id").GetString()!;
  var brand=(await Data(await Write(client,"/concerts/interests/topics",new InterestTopic("STAYREAL","Brand","")))).GetProperty("id").GetString()!;
  var date=new DateTimeOffset(2026,10,29,10,0,0,TimeSpan.FromHours(8));
  async Task<string> Expense(string amount)=> (await Data(await Write(client,"/transactions/expense",new SaveTransaction("Expense",amount,cash.Id,date,CategoryId:cat.Id)))).GetProperty("id").GetString()!;
  var tx=await Expense("499");var baseline=await db.Transactions.CountAsync(x=>x.UserId==user.Id);
  var item=new InterestItem(Guid.NewGuid().ToString(),"STAYREAL T恤",brand,"服装","黑色 M",1,"499","100","0","0","399","Daily","Held",[new(artist,"399")]);
  var other=item with{Id=Guid.NewGuid().ToString(),Name="普通商品",BrandId=null,UnitPrice="100",Discount="0",Paid="100",Artists=[],Related=false};
  var purchase=new InterestPurchase(new(2026,10,29),"CNY","网店","STAYREAL","order-test",tx,null,"Daily","Purchased",[item,other],[],[],"");
  var key=Guid.NewGuid().ToString();var saved=await Data(await Write(client,"/concerts/interests/purchases",purchase,key:key));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  Assert.Equal(id,(await Data(await Write(client,"/concerts/interests/purchases",purchase,key:key))).GetProperty("id").GetString());Assert.Equal(baseline,await db.Transactions.CountAsync(x=>x.UserId==user.Id));
  async Task<System.Text.Json.JsonElement> Report()=>await Data(await client.GetAsync("/api/concerts/interests/report?currency=CNY&year=2026&artist="+artist));
  Assert.Equal("399.00",(await Report()).GetProperty("totals").GetProperty("net").GetString());
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/interests/purchases",purchase)).StatusCode);
  var refund=(await Data(await Write(client,"/transactions/refund",new SaveTransaction("Refund","100",cash.Id,date.AddDays(1),CategoryId:cat.Id,OriginalTransactionId:tx)))).GetProperty("id").GetString()!;
  purchase=purchase with{Refunds=[new(refund,item.Id,"100")]};saved=await Data(await Write(client,"/concerts/interests/purchases/"+id,purchase,version,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal("299.00",(await Report()).GetProperty("totals").GetProperty("net").GetString());
  purchase=purchase with{Items=[item with{Artists=[]},other]};saved=await Data(await Write(client,"/concerts/interests/purchases/"+id,purchase,version,put:true));Assert.Equal("0.00",(await Report()).GetProperty("totals").GetProperty("net").GetString());
  Assert.Equal(baseline+1,await db.Transactions.CountAsync(x=>x.UserId==user.Id));Assert.Equal(499,(await db.Transactions.SingleAsync(x=>x.Id==tx)).Amount);
  var scene=(await Data(await Write(client,"/concerts",Scene()))).GetProperty("id").GetString()!;var liveTx=await Expense("180");
  var live=purchase with{TransactionId=liveTx,SceneId=scene,Type="LiveMerch",Items=[item with{Id=Guid.NewGuid().ToString(),UnitPrice="180",Discount="0",Paid="180",Artists=[new(artist,"180")]}],Refunds=[]};
  await Data(await Write(client,"/concerts/interests/purchases",live));Assert.Equal("180.00",(await Data(await client.GetAsync("/api/concerts/"+scene))).GetProperty("report").GetProperty("actual").GetString());
  var plan=live with{TransactionId=null,SceneId=null,Type="Daily",State="Planned",Items=[item with{Id=Guid.NewGuid().ToString()}],Refunds=[]};await Data(await Write(client,"/concerts/interests/purchases",plan));Assert.Equal("180.00",(await Report()).GetProperty("totals").GetProperty("net").GetString());
  var usd=(await Data(await client.GetAsync("/api/concerts/interests/report?currency=USD&year=2026"))).GetProperty("totals").GetProperty("net").GetString();Assert.Equal("0.00",usd);
  Assert.Equal("180.00",(await Data(await client.GetAsync("/api/concerts/interests/report?currency=CNY&year=0&artist="+artist))).GetProperty("totals").GetProperty("net").GetString());
  await Data(await Write(client,"/concerts/interests/budgets",new InterestBudget("艺人日常年度预算",artist,null,"Daily",2026,null,"CNY","1000")));
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/interests/batch-link",new InterestBatch([liveTx],artist,brand,false))).StatusCode);
  var latest=(await Data(await client.GetAsync("/api/concerts/interests/purchases?page=1&size=100"))).GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("id").GetString()==id);version=latest.GetProperty("version").GetString()!;
  using var form=new MultipartFormDataContent();form.Add(new ByteArrayContent(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4 isolated-test")),"file","receipt.pdf");var request=new HttpRequestMessage(HttpMethod.Post,"/api/concerts/interests/purchases/"+id+"/attachments"){Content=form};request.Headers.TryAddWithoutValidation("If-Match",version);var attachment=await Data(await client.SendAsync(request));
  Assert.Equal(1,(await Data(await client.GetAsync("/api/concerts/interests/purchases/"+id+"/attachments"))).GetArrayLength());
  Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/concerts/interests/purchases/"+id+"/attachments/"+attachment.GetProperty("id").GetString())).StatusCode);
  Assert.True((await Data(await client.GetAsync("/api/concerts/interests/purchases/"+id+"/history"))).GetArrayLength()>0);
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/interests/purchases/"+id,purchase,version,put:true)).StatusCode);
  Assert.Equal(3,(await Data(await client.GetAsync("/api/concerts/interests/purchases?page=1&size=1"))).GetProperty("total").GetInt32());
  // Query performance uses disposable planned records, never production transactions.
  var bulk=Enumerable.Range(0,2000).Select(n=>new StoredDocument{UserId=user.Id,Kind="MusicPurchase",ContentType="application/json",Content=System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(plan with{Items=[item with{Id=Guid.NewGuid().ToString(),Name="隔离性能计划 "+n}]},FinanceService.Json)}).ToArray();db.AddRange(bulk);await db.SaveChangesAsync();
  using var pageRequest=new HttpRequestMessage(HttpMethod.Get,"/api/concerts/interests/purchases?page=50&size=20");pageRequest.Headers.Add("X-Test-Pagination-Trace","1");
  var watch=System.Diagnostics.Stopwatch.StartNew();using var pageResponse=await client.SendAsync(pageRequest);var responseMs=watch.ElapsedMilliseconds;
  var paged=await Data(pageResponse);var pageMs=watch.ElapsedMilliseconds;
  var timeline=(await requestTrace.Completed.WaitAsync(TimeSpan.FromSeconds(10))).ToString();
  Console.WriteLine($"Music same-request timing: client-response={responseMs}ms, client-total={pageMs}ms | {timeline}");
  Assert.Contains("server.start",timeline);Assert.Contains("sql.session.executed",timeline);Assert.Contains("sql.count.executed",timeline);Assert.Contains("sql.page.executed",timeline);
  Assert.Equal(2003,paged.GetProperty("total").GetInt32());Assert.Equal(20,paged.GetProperty("items").GetArrayLength());
  Assert.True(pageMs<5000,$"分页超过5秒: client-total={pageMs}ms | {timeline}");
  watch.Restart();await Report();Assert.True(watch.Elapsed<TimeSpan.FromSeconds(10),"专题报告超过10秒");Console.WriteLine($"Music isolated SQL: 2003 records, page50={pageMs}ms, report={watch.ElapsedMilliseconds}ms");
 }
}




