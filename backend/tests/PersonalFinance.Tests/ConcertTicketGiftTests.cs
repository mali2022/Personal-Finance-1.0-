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
 [ProfileSqlFact] public async Task TicketGiftsKeepHistoryOwnershipVersionAndOriginalFinancialFacts() {
  var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
  var password="Gift-Test-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@gift.test",DisplayName="Gift test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
  var user=User();var other=User();var cash=new Account{UserId=user.Id,Name="测试现金",Type="Cash",Currency="CNY",OpeningBalance=1000};var root=new Category{UserId=user.Id,Name="测试娱乐",Kind="Expense"};var cat=new Category{UserId=user.Id,ParentId=root.Id,Name="测试门票",Kind="Expense"};db.AddRange(cash,root,cat);await db.SaveChangesAsync();
  using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
  foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());await Data(await Write(pair.Item1,"/settings/modules",new ConcertModules(true),put:true));}
  var date=new DateTimeOffset(2026,1,1,10,0,0,TimeSpan.FromHours(8));var tx=(await Data(await Write(client,"/transactions/expense",new SaveTransaction("Expense","100",cash.Id,date,CategoryId:cat.Id)))).GetProperty("id").GetString()!;
  var ticket=new ConcertTicket(Guid.NewGuid().ToString(),"A区","1排1座","本人","Electronic","Received");
  var order=Order() with{State="Issued",Quantity=1,PaidOn=new(2026,1,1),PaidAmount="100",PaymentTransactionId=tx,Tickets=[ticket]};var scene=Scene() with{Orders=[order]};
  var saved=await Data(await Write(client,"/concerts",scene));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;var baseline=await db.Transactions.CountAsync();
  var gift=new ConcertTicketGift(" 本人 "," 朋友甲 ",new(2026,1,2),"Given","生日礼物",true);
  ConcertInput WithGift(ConcertTicketGift g,string state="Received")=>scene with{Orders=[order with{Tickets=[ticket with{State=state,Gift=g}]}]};
  async Task Invalid(ConcertTicketGift g)=>Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/"+id,WithGift(g),version,put:true)).StatusCode);
  await Invalid(gift with{Recipient=" "});await Invalid(gift with{Recipient="本人"});await Invalid(gift with{PlatformAllowed=false});await Invalid(gift with{State="Invalid"});await Invalid(gift with{GiftedOn=new(1899,1,1)});await Invalid(gift with{GiftedOn=DateOnly.FromDateTime(DateTimeOffset.UtcNow.AddDays(3).DateTime)});await Invalid(gift with{GiftedOn=new(2026,1,21)});
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/"+id,WithGift(gift,"Pending"),version,put:true)).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/concerts/"+id,WithGift(gift),version,put:true)).StatusCode);
  var key=Guid.NewGuid().ToString();var firstVersion=version;saved=await Data(await Write(client,"/concerts/"+id,WithGift(gift),version,key,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal(version,(await Data(await Write(client,"/concerts/"+id,WithGift(gift),firstVersion,key,put:true))).GetProperty("version").GetString());
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/"+id,WithGift(gift with{Recipient="朋友乙"}),version,key,put:true)).StatusCode);
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/"+id,WithGift(gift),firstVersion,put:true)).StatusCode);
  async Task<JsonElement> Detail()=>await Data(await client.GetAsync("/api/concerts/"+id));
  var detail=await Detail();var readTicket=detail.GetProperty("input").GetProperty("orders")[0].GetProperty("tickets")[0];
  Assert.Equal("朋友甲",readTicket.GetProperty("gift").GetProperty("recipient").GetString());Assert.Equal("本人",readTicket.GetProperty("gift").GetProperty("from").GetString());Assert.Equal("本人",readTicket.GetProperty("attendee").GetString());
  Assert.Equal("100.00",detail.GetProperty("report").GetProperty("actual").GetString());Assert.Equal("100.00",detail.GetProperty("report").GetProperty("personalNetCost").GetString());Assert.Equal("0.00",detail.GetProperty("report").GetProperty("confirmedRefunds").GetString());Assert.Equal(baseline,await db.Transactions.CountAsync());
  // Older clients that know tickets but not Gift must not silently erase the record.
  saved=await Data(await Write(client,"/concerts/"+id,scene,version,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal("Given",(await Detail()).GetProperty("input").GetProperty("orders")[0].GetProperty("tickets")[0].GetProperty("gift").GetProperty("state").GetString());
  saved=await Data(await Write(client,"/concerts/"+id,WithGift(gift,"Used"),version,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/"+id,WithGift(gift with{GiftedOn=new(2026,1,21)},"Used"),version,put:true)).StatusCode);
  saved=await Data(await Write(client,"/concerts/"+id,WithGift(gift with{State="Revoked",Note="记录更正"},"Used"),version,put:true));version=saved.GetProperty("version").GetString()!;
  detail=await Detail();Assert.Equal("Revoked",detail.GetProperty("input").GetProperty("orders")[0].GetProperty("tickets")[0].GetProperty("gift").GetProperty("state").GetString());
  Assert.Equal("100.00",detail.GetProperty("report").GetProperty("personalNetCost").GetString());Assert.Equal(baseline,await db.Transactions.CountAsync());
  var history=await Data(await client.GetAsync("/api/concerts/"+id+"/history"));
  Assert.Contains(history.EnumerateArray(),h=>h.GetProperty("action").GetString()=="TicketsUpdated" && h.GetProperty("changes").GetString()!.Contains("Revoked"));
  // Cancelling the ticket preserves the historical gift, but does not invent a refund.
  var tx2=(await Data(await Write(client,"/transactions/expense",new SaveTransaction("Expense","10",cash.Id,date,CategoryId:cat.Id)))).GetProperty("id").GetString()!;
  var secondTicket=ticket with{Id=Guid.NewGuid().ToString(),Gift=gift};var secondOrder=order with{Id=Guid.NewGuid().ToString(),Number="GIFT-CANCELLED",PaymentTransactionId=tx2,PaidAmount="10",Tickets=[secondTicket]};
  var secondScene=Scene() with{Orders=[secondOrder]};var second=await Data(await Write(client,"/concerts",secondScene));var secondId=second.GetProperty("id").GetString()!;
  var secondBaseline=await db.Transactions.CountAsync();
  await Data(await Write(client,"/concerts/"+secondId,secondScene with{State="Cancelled",Orders=[secondOrder with{State="Cancelled",Tickets=[secondTicket with{State="Cancelled",Gift=null}]}]},second.GetProperty("version").GetString()!,put:true));
  var cancelled=await Data(await client.GetAsync("/api/concerts/"+secondId));
  Assert.Equal("Given",cancelled.GetProperty("input").GetProperty("orders")[0].GetProperty("tickets")[0].GetProperty("gift").GetProperty("state").GetString());
  Assert.Equal("10.00",cancelled.GetProperty("report").GetProperty("actual").GetString());Assert.Equal("0.00",cancelled.GetProperty("report").GetProperty("confirmedRefunds").GetString());Assert.Equal(secondBaseline,await db.Transactions.CountAsync());
  // The new null property must not change pre-Gift request bytes for idempotent replays.
  var raw=JsonSerializer.Serialize(scene,FinanceService.Json);Assert.DoesNotContain("\"gift\"",raw);var legacyKey=Guid.NewGuid().ToString();
  var hash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("POST/api/concerts"+raw)));
  db.Idempotencies.Add(new(){UserId=user.Id,Key=legacyKey,Hash=hash,Method="POST",Path="/api/concerts",Response="{\"id\":\"legacy-gift-response\",\"version\":\"1\"}",CompletedAt=DateTimeOffset.UtcNow});await db.SaveChangesAsync();
  var count=await db.Documents.CountAsync(d=>d.UserId==user.Id && d.Kind=="ConcertScene");Assert.Equal("legacy-gift-response",(await Data(await Write(client,"/concerts",scene,key:legacyKey))).GetProperty("id").GetString());Assert.Equal(count,await db.Documents.CountAsync(d=>d.UserId==user.Id && d.Kind=="ConcertScene"));
 }
}
