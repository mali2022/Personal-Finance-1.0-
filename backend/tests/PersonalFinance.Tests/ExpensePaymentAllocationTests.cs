using System.Text.Json;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public sealed class ExpensePaymentAllocationTests
{
 [Fact] public void IndependentCategoryAndAccountTotalsStayExactAtCentPrecision() {
  var categories=new[]{new Split("c1","33.33"),new Split("c2","66.67")};
  var payments=new[]{new PaymentSplit("a","40.00"),new PaymentSplit("b","60.00")};
  var entries=ExpensePaymentAllocation.Allocate(categories,payments);
  Assert.Equal(100,entries.Sum(x=>x.Amount));Assert.Equal(40,entries.Where(x=>x.AccountId=="a").Sum(x=>x.Amount));Assert.Equal(60,entries.Where(x=>x.AccountId=="b").Sum(x=>x.Amount));
  Assert.Equal(33.33m,entries.Where(x=>x.CategoryId=="c1").Sum(x=>x.Amount));Assert.All(entries,e=>Assert.True(e.Amount>0&&e.Amount==decimal.Round(e.Amount,2)));
 }
 [Fact] public void TinyAmountsAndLargeValuesDoNotLoseCentsOrOverflow() {
  var tiny=ExpensePaymentAllocation.Allocate([new("x","0.01"),new("y","0.01")],[new("a","0.01"),new("b","0.01")]);Assert.Equal(2,tiny.Length);
  var large=ExpensePaymentAllocation.Allocate([new("x","999999999999999999.99")],[new("a","500000000000000000.00"),new("b","499999999999999999.99")]);Assert.Equal(999999999999999999.99m,large.Sum(x=>x.Amount));
 }
 [Fact] public void LegacyPayloadSerializationDoesNotAddPaymentsOrChangeExistingHashes() {
  var input=new SaveTransaction("Expense","1.00","a",DateTimeOffset.UnixEpoch);
  Assert.DoesNotContain("payments",System.Text.Json.JsonSerializer.Serialize(input,FinanceService.Json));
 }

 [DeletionSqlFact] public async Task SelectedAccountReportCountsOnlyItsShareAndGlobalExpenseOnce() {
  await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var b=f.Account();b.Name="第二付款账户";
  var root=new Category{UserId=f.User,Name="消费根类",Kind="Expense"};var category=new Category{UserId=f.User,Name="消费子类",Kind="Expense",ParentId=root.Id};f.Db.Categories.AddRange(root,category);await f.Db.SaveChangesAsync();
  var input=new SaveTransaction("Expense","1.00",a.Id,new DateTimeOffset(2026,10,12,12,0,0,TimeSpan.FromHours(8)),CategoryId:category.Id,Payments:[new(a.Id,"0.33"),new(b.Id,"0.67")]);
  await f.Service.SaveTransaction(f.User,input);await f.Db.SaveChangesAsync();
  var q=new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string,StringValues>{{"start","2026-10-01"},{"end","2026-10-31"},{"currency","CNY"},{"granularity","day"}});
  var global=JsonSerializer.SerializeToElement(await f.Service.Report(f.User,q),FinanceService.Json);var scoped=JsonSerializer.SerializeToElement(await f.Service.Report(f.User,q,[b.Id]),FinanceService.Json);
  Assert.Equal("1.00",global.GetProperty("expense").GetString());Assert.Equal("0.67",scoped.GetProperty("expense").GetString());Assert.Equal("0.67",scoped.GetProperty("categories")[0].GetProperty("amount").GetString());
  Assert.Equal(0.67m,scoped.GetProperty("points").EnumerateArray().Sum(p=>decimal.Parse(p.GetProperty("expense").GetString()!,System.Globalization.CultureInfo.InvariantCulture)));
 }
}
