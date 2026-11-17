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
 [ProfileSqlFact] public async Task TicketTransfersAssociateRealReceiptsReturnsAndNeverDuplicateFinancialFacts() {
  var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
  var password="Transfer-Test-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@transfer.test",DisplayName="Transfer test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
  var user=User();var other=User();var cash=new Account{UserId=user.Id,Name="测试现金",Type="Cash",Currency="CNY",OpeningBalance=1000};var usd=new Account{UserId=user.Id,Name="测试美元",Type="Cash",Currency="USD",OpeningBalance=1000};var otherCash=new Account{UserId=other.Id,Name="另一用户现金",Type="Cash",Currency="CNY"};
  Category Category(string owner,string name,string kind,string? parent=null)=>new(){UserId=owner,Name=name,Kind=kind,ParentId=parent};var er=Category(user.Id,"支出","Expense");var ec=Category(user.Id,"门票","Expense",er.Id);var ir=Category(user.Id,"收入","Income");var ic=Category(user.Id,"转让回款","Income",ir.Id);var otherRoot=Category(other.Id,"收入","Income");var otherCat=Category(other.Id,"其他","Income",otherRoot.Id);db.AddRange(cash,usd,otherCash,er,ec,ir,ic,otherRoot,otherCat);await db.SaveChangesAsync();
  using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
  foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());await Data(await Write(pair.Item1,"/settings/modules",new ConcertModules(true),put:true));}
  var date=new DateTimeOffset(2026,1,1,10,0,0,TimeSpan.FromHours(8));
  async Task<string> Tx(string type,string amount,string? account=null)=>(await Data(await Write(client,"/transactions/"+type.ToLowerInvariant(),new SaveTransaction(type,amount,account??cash.Id,date,CategoryId:type=="Income"?ic.Id:ec.Id)))).GetProperty("id").GetString()!;
  var pay=await Tx("Expense","100");var ticket=new ConcertTicket(Guid.NewGuid().ToString(),"A区","1排1座","本人","Electronic","Received");var order=Order() with{Number="TRANSFER-ONE",State="Issued",Quantity=1,PaidOn=new(2026,1,1),PaidAmount="100",PaymentTransactionId=pay,Tickets=[ticket]};var scene=Scene() with{Orders=[order]};
  var saved=await Data(await Write(client,"/concerts",scene));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
  var sale=new ConcertTicketTransfer("本人","买家",new(2026,1,2),"80","Recorded",[],[],"",true);
  ConcertInput Body(ConcertTicketTransfer value)=>scene with{Orders=[order with{Tickets=[ticket with{Transfer=value}]}]};
  async Task<JsonElement> Detail()=>await Data(await client.GetAsync("/api/concerts/"+id));
  async Task Save(ConcertTicketTransfer value){saved=await Data(await Write(client,"/concerts/"+id,Body(value),version,put:true));version=saved.GetProperty("version").GetString()!;sale=value;}
  var initialCount=await db.Transactions.CountAsync();var key=Guid.NewGuid().ToString();var originalVersion=version;
  saved=await Data(await Write(client,"/concerts/"+id,Body(sale),version,key,put:true));version=saved.GetProperty("version").GetString()!;
  Assert.Equal(version,(await Data(await Write(client,"/concerts/"+id,Body(sale),originalVersion,key,put:true))).GetProperty("version").GetString());Assert.Equal(initialCount,await db.Transactions.CountAsync());
  var report=(await Detail()).GetProperty("report");Assert.Equal("0.00",report.GetProperty("ticketTransfers").GetProperty("received").GetString());Assert.Equal("80.00",report.GetProperty("ticketTransfers").GetProperty("uncollected").GetString());Assert.Equal("100.00",report.GetProperty("personalAfterTransfers").GetString());
  async Task Invalid(ConcertTicketTransfer value)=>Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/"+id,Body(value),version,put:true)).StatusCode);
  await Invalid(sale with{Buyer="本人"});await Invalid(sale with{PlatformAllowed=false});await Invalid(sale with{AgreedAmount="0"});await Invalid(sale with{TransferredOn=new(2026,1,21)});
  var income20=await Tx("Income","20");await Save(sale with{Receipts=[new(income20,"20")]});report=(await Detail()).GetProperty("report");Assert.Equal("60.00",report.GetProperty("ticketTransfers").GetProperty("uncollected").GetString());Assert.Equal("80.00",report.GetProperty("personalAfterTransfers").GetString());
  Assert.Equal(1,(await Data(await client.GetAsync("/api/concerts/transfer-transactions?currency=CNY&kind=Income&keyword="+income20))).GetArrayLength());Assert.Empty((await Data(await stranger.GetAsync("/api/concerts/transfer-transactions?currency=CNY&kind=Income&keyword="+income20))).EnumerateArray());
  await Invalid(sale with{Receipts=[new(income20,"21")]});await Invalid(sale with{Receipts=[new(income20,"10"),new(income20,"10")]});await Invalid(sale with{State="Revoked"});await Invalid(sale with{Returns=[new(pay,"20")]});
  var usdIncome=await Tx("Income","10",usd.Id);await Invalid(sale with{Receipts=[new(usdIncome,"10")]});
  var foreign=(await Data(await Write(stranger,"/transactions/income",new SaveTransaction("Income","10",otherCash.Id,date,CategoryId:otherCat.Id)))).GetProperty("id").GetString()!;await Invalid(sale with{Receipts=[new(foreign,"10")]});
  var unrelatedPay=await Tx("Expense","10");var ordinaryRefund=(await Data(await Write(client,"/transactions/refund",new SaveTransaction("Refund","5",cash.Id,date,CategoryId:ec.Id,OriginalTransactionId:unrelatedPay)))).GetProperty("id").GetString()!;await Invalid(sale with{Receipts=[new(ordinaryRefund,"5")]});
  var gifted=Body(sale) with{Orders=[order with{Tickets=[ticket with{Transfer=sale,Gift=new("本人","朋友",new(2026,1,2),"Given","",true)}]}]};Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/"+id,gifted,version,put:true)).StatusCode);
  db.ChangeTracker.Clear();var changed=await db.Transactions.SingleAsync(t=>t.Id==income20);changed.Status="NeedsReview";await db.SaveChangesAsync();report=(await Detail()).GetProperty("report");Assert.Equal("0.00",report.GetProperty("ticketTransfers").GetProperty("netRecovery").GetString());Assert.Contains(report.GetProperty("warnings").EnumerateArray(),w=>w.GetString()!.Contains("转让资金来源"));changed.Status="Confirmed";await db.SaveChangesAsync();
  var income60=await Tx("Income","60");await Save(sale with{Receipts=[new(income20,"20"),new(income60,"60")]});report=(await Detail()).GetProperty("report");Assert.Equal("100.00",report.GetProperty("personalNetCost").GetString());Assert.Equal("20.00",report.GetProperty("personalAfterTransfers").GetString());Assert.Equal("0.00",report.GetProperty("confirmedRefunds").GetString());Assert.Equal("900.00",report.GetProperty("remaining").GetString());
  var pay2=await Tx("Expense","100");var order2=order with{Id=Guid.NewGuid().ToString(),Number="TRANSFER-TWO",PaymentTransactionId=pay2,Tickets=[ticket with{Id=Guid.NewGuid().ToString(),Transfer=sale with{AgreedAmount="20",Receipts=[new(income20,"20")]}}]};
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts",Scene() with{Orders=[order2]})).StatusCode);
  await Save(sale with{AgreedAmount="70",Receipts=[new(income20,"10"),new(income60,"60")]});order2=order2 with{Tickets=[order2.Tickets![0] with{Transfer=sale with{AgreedAmount="10",Receipts=[new(income20,"10")]}}]};await Data(await Write(client,"/concerts",Scene() with{Orders=[order2]}));
  var annual=await Data(await client.GetAsync("/api/concerts/report?year=2026&currency=CNY"));Assert.Equal("200.00",annual.GetProperty("totalCost").GetString());Assert.Equal("80.00",annual.GetProperty("transferRecovery").GetString());Assert.Equal("120.00",annual.GetProperty("totalCostAfterTransfers").GetString());
  var back20=await Tx("Expense","20");await Save(sale with{AgreedAmount="50",Returns=[new(back20,"20")]});report=(await Detail()).GetProperty("report");Assert.Equal("50.00",report.GetProperty("personalAfterTransfers").GetString());
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/"+id,Body(sale) with{Costs=[new(Guid.NewGuid().ToString(),"Other",back20,null,"1","本人","本人")]},version,put:true)).StatusCode);
  var item=new InterestItem(Guid.NewGuid().ToString(),"不允许重复的商品",null,"其他","",1,"1","0","0","0","1","Daily","Held",[]);
  Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/concerts/interests/purchases",new InterestPurchase(new(2026,1,1),"CNY","渠道","商户","重复",back20,null,"Daily","Purchased",[item],[],[],""))).StatusCode);
  var back50=await Tx("Expense","50");var baseline=await db.Transactions.CountAsync();await Save(sale with{State="Revoked",Returns=[new(back20,"20"),new(back50,"50")]});report=(await Detail()).GetProperty("report");Assert.Equal("0.00",report.GetProperty("ticketTransfers").GetProperty("netRecovery").GetString());Assert.Equal("100.00",report.GetProperty("personalAfterTransfers").GetString());Assert.Equal(baseline,await db.Transactions.CountAsync());
  saved=await Data(await Write(client,"/concerts/"+id,scene,version,put:true));version=saved.GetProperty("version").GetString()!;Assert.Equal("Revoked",(await Detail()).GetProperty("input").GetProperty("orders")[0].GetProperty("tickets")[0].GetProperty("transfer").GetProperty("state").GetString());
  db.ChangeTracker.Clear();var staleReturn=await db.Transactions.SingleAsync(t=>t.Id==back50);staleReturn.Status="NeedsReview";await db.SaveChangesAsync();report=(await Detail()).GetProperty("report");Assert.Equal("50.00",report.GetProperty("ticketTransfers").GetProperty("pendingReturn").GetString());Assert.Equal("0.00",report.GetProperty("ticketTransfers").GetProperty("netRecovery").GetString());Assert.Equal("100.00",report.GetProperty("personalAfterTransfers").GetString());staleReturn.Status="Confirmed";await db.SaveChangesAsync();
  Assert.Equal(HttpStatusCode.Conflict,(await Write(client,"/concerts/"+id,Body(sale),originalVersion,put:true)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync("/api/concerts/"+id)).StatusCode);
  Assert.Contains((await Data(await client.GetAsync("/api/concerts/"+id+"/history"))).EnumerateArray(),h=>h.GetProperty("action").GetString()=="TicketsUpdated" && h.GetProperty("changes").GetString()!.Contains("Revoked"));
  // Existing null transfer properties retain the pre-field serialized contract.
  Assert.DoesNotContain("\"transfer\"",JsonSerializer.Serialize(scene,FinanceService.Json));
 }
}
