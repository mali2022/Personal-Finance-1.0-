using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

namespace PersonalFinance.Tests;

[Collection("Finance SQL")]
public sealed class TransactionWorkspaceTests
{
    private static QueryCollection Query(params (string Key, string Value)[] items) => new(items.ToDictionary(x => x.Key, x => new StringValues(x.Value)));
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    [Theory]
    [InlineData("amount:desc,occurredAt:asc")]
    [InlineData("createdAt:desc")]
    public void ValidatesMultipleSortFields(string sort) => Assert.NotEmpty(FinanceService.TransactionSort(sort));
    [Theory]
    [InlineData("amount:desc,amount:asc")]
    [InlineData("amount:bad")]
    [InlineData("userId:asc")]
    [InlineData("amount:asc;DROP TABLE x")]
    public void RejectsUnknownDuplicateAndInjectedSort(string sort) => Assert.Throws<ApiException>(() => FinanceService.TransactionSort(sort));
    [Fact] public void RejectsOversizedOrEmptyMultiSelect() {
        Assert.Throws<ApiException>(() => FinanceService.QueryValues(Query(("tagIds", "x,,y")), "tagIds"));
        Assert.Throws<ApiException>(() => FinanceService.QueryValues(Query(("tagIds", string.Join(',', Enumerable.Range(0,101)))), "tagIds"));
        Assert.Equal(new[]{"a","b"}, FinanceService.QueryValues(Query(("tagIds","a,b,a")),"tagIds"));
        Assert.Equal(new[]{"A, Inc.","B"},FinanceService.QueryValues(Query(("merchants","[\"A, Inc.\",\"B\"]")),"merchants"));
    }
    [Theory]
    [InlineData("{\"sql\":\"SELECT * FROM Transactions\"}")]
    [InlineData("{\"pageSize\":\"100000\"}")]
    [InlineData("{\"keyword\":[\"a\"]}")]
    [InlineData("{\"keyword\":\"a\",\"keyword\":\"b\"}")]
    [InlineData("{\"start\":\"2026-10-01\"}")]
    public void AiSearchIsStrictlyWhitelisted(string json) {
        using var document=JsonDocument.Parse(json);
        Assert.Throws<ApiException>(()=>TransactionAiEndpoints.SearchQuery(document.RootElement));
    }
    [Fact] public void AccountBatchRejectsTransfersAndMultiplePayers() {
        Assert.NotNull(FinanceService.BatchProtection(new(){Type="Transfer"},new(AccountId:"a"),false,false));
        Assert.NotNull(FinanceService.BatchProtection(new(){Type="Expense",Entries=[new(){Kind="Account"},new(){Kind="Account"}]},new(AccountId:"a"),false,false));
        Assert.NotNull(FinanceService.BatchProtection(new(){Type="Expense"},new(Status:"Deleted"),false,false));
    }
    [DeletionSqlFact] public async Task ReviewSummaryReusesSimpleScopeAndPreservesReviewStatesAndUserIsolation() {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account();
        var open = f.Expense(account); open.Status = "NeedsReview";
        var ignored = f.Expense(account);
        var deferred = f.Expense(account);
        var deleted = f.Expense(account); deleted.Status = "Deleted";
        f.Db.Users.Add(new AppUser { Id="other-user", Email="other-user@workspace.test", PasswordHash="no-login" });
        var other = f.Expense(account); other.UserId = "other-user";
        foreach (var entry in other.Entries) entry.UserId = other.UserId;
        f.Db.AddRange(new TransactionReview { UserId=f.User, TransactionId=ignored.Id, State="Ignored" },
            new TransactionReview { UserId=f.User, TransactionId=deferred.Id, State="Deferred", DeferredUntil=DateTimeOffset.UtcNow.AddDays(1) });
        await f.Db.SaveChangesAsync();
        foreach (var state in new[] { "Open", "Ignored", "Deferred", "All" }) {
            var parameters = Query(("status", "NeedsReview"), ("reviewState", state));
            var filtered = await f.Service.Filter(f.User, parameters);
            // The previous query expanded all eight rules into UNION ALL subqueries.
            Assert.DoesNotContain("UNION ALL", filtered.ToQueryString(), StringComparison.OrdinalIgnoreCase);
            var rows = await filtered.Select(t => t.Id).ToArrayAsync();
            var expected = state switch { "Open" => new[]{open.Id}, "Ignored" => new[]{ignored.Id}, "Deferred" => new[]{deferred.Id}, _ => new[]{open.Id,ignored.Id,deferred.Id} };
            Assert.Equal(expected.Order(), rows.Order());
            var summary = Json(await f.Service.TransactionSummary(f.User, parameters));
            Assert.Equal(expected.Length, summary.GetProperty("total").GetInt32());
            Assert.Equal(expected.Length, summary.GetProperty("anomalies").GetInt32());
            Assert.Equal(expected.Length, summary.GetProperty("uncategorized").GetInt32());
        }
        Assert.Empty(await (await f.Service.Filter("unrelated-user", Query(("status", "NeedsReview")))).ToArrayAsync());
    }

    [DeletionSqlFact] public async Task SummaryUsesAllMatchingLedgerEntriesAndSeparatesCurrenciesTransfersAndRefunds() {
        await using var f=new DeletionSqlTests.Fixture(); await f.Initialize();
        var account=f.Account();var usd=f.Account();usd.Currency="USD";usd.Name="USD cash";
        var expense=f.Expense(account);expense.OccurredAt=new(2026,10,1,16,0,0,TimeSpan.Zero);
        expense.CategoryId=null; // Imported legacy unclassified record must remain in statistics.
        var category=new Category{UserId=f.User,Name="餐饮",ParentId=null}; f.Db.Add(category);
        var leaf=new Category{UserId=f.User,Name="午餐",ParentId=category.Id};f.Db.Add(leaf);
        expense.Entries.Single(e=>e.Kind=="Expense").CategoryId=leaf.Id;
        FinanceTransaction Row(string type, decimal amount, Account a, params (string Kind,decimal Amount,string Currency,string? AccountId)[] entries) {
            var t=new FinanceTransaction{UserId=f.User,Type=type,Amount=amount,AccountId=a.Id,Currency=a.Currency,OccurredAt=expense.OccurredAt};
            foreach(var e in entries)t.Entries.Add(new(){UserId=f.User,TransactionId=t.Id,Kind=e.Kind,Amount=e.Amount,BaseAmount=e.Amount,Currency=e.Currency,AccountId=e.AccountId});f.Db.Add(t);return t;
        }
        Row("Income",100,account,("Income",-100,"CNY",null),("Account",100,"CNY",account.Id));
        var refund=Row("Refund",2,account,("Expense",-2,"CNY",null),("Account",2,"CNY",account.Id));refund.OriginalTransactionId=expense.Id;
        var transfer=Row("Transfer",70,account,("Account",-71,"CNY",account.Id),("Account",10,"USD",usd.Id),("Expense",1,"CNY",null));transfer.ToAccountId=usd.Id;transfer.Fee=1;
        transfer.Entries.Single(e=>e.Currency=="USD").BaseAmount=70;
        var foreign=Row("Expense",5,usd,("Expense",5,"USD",null),("Account",-5,"USD",usd.Id));
        var deleted=f.Expense(account);deleted.Status="Deleted";
        await f.Db.SaveChangesAsync();
        var summary=Json(await f.Service.TransactionSummary(f.User,Query(("pageSize","1"),("page","999"))));
        Assert.Equal(5,summary.GetProperty("total").GetInt32());
        var cny=summary.GetProperty("currencies").EnumerateArray().Single(c=>c.GetProperty("currency").GetString()=="CNY");
        Assert.Equal("100.00",cny.GetProperty("income").GetString());Assert.Equal("11.00",cny.GetProperty("expense").GetString());
        Assert.Equal("9.00",cny.GetProperty("netExpense").GetString());Assert.Equal("2.00",cny.GetProperty("refunds").GetString());
        Assert.Equal("21.00",cny.GetProperty("netCashFlow").GetString());Assert.Equal("71.00",cny.GetProperty("transferOut").GetString());
        var usdSummary=summary.GetProperty("currencies").EnumerateArray().Single(c=>c.GetProperty("currency").GetString()=="USD");
        Assert.Equal("10.00",usdSummary.GetProperty("transferIn").GetString());Assert.Equal("5.00",usdSummary.GetProperty("expense").GetString());
        var categoryQuery=Query(("categoryIds",category.Id),("accountIds",account.Id),("sort","amount:desc,occurredAt:asc"));
        Assert.Equal(new[]{expense.Id},await (await f.Service.Filter(f.User,categoryQuery)).Select(t=>t.Id).ToArrayAsync());
        var daily=Json(await f.Service.TransactionDailySummary(f.User,Query(("days","2026-10-02"))));
        Assert.Equal("9.00",daily.EnumerateArray().Single(d=>d.GetProperty("currency").GetString()=="CNY").GetProperty("expense").GetString());
        Assert.Equal(5,(await (await f.Service.Filter(f.User,Query())).CountAsync()));
        Assert.Empty(await (await f.Service.Filter(Guid.NewGuid().ToString(),Query())).ToArrayAsync());
        foreach(var rule in FinanceService.AnomalyRules) _=await (await f.Service.Filter(f.User,Query(("anomaly",rule)))).CountAsync();
        Assert.Contains(foreign.Id,await (await f.Service.Filter(f.User,Query(("anomaly","Category")))).Select(t=>t.Id).ToArrayAsync());
        Assert.Empty(await (await f.Service.Filter(f.User,Query(("anomaly","Balance")))).ToArrayAsync());
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.Filter(f.User,Query(("min","20"),("max","1"))));
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.Filter(f.User,Query(("status","Bogus"))));
    }
    [DeletionSqlFact] public async Task CashFlowMatchesLiquidAccountPolicyWithoutCancellingBorrowedCashOrCountingAdjustments() {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();
        var cash=f.Account();var credit=f.Account();credit.Name="credit";credit.Type="CreditCard";var payable=f.Account();payable.Name="payable";payable.Type="Payable";
        var ordinary=f.Expense(cash);f.Expense(credit);
        FinanceTransaction Add(string type,decimal amount,params (Account Account,decimal Amount,string Kind)[] entries){
            var t=new FinanceTransaction{UserId=f.User,Type=type,AccountId=cash.Id,Amount=amount,OccurredAt=DateTimeOffset.UtcNow};
            foreach(var entry in entries)t.Entries.Add(new(){UserId=f.User,TransactionId=t.Id,AccountId=entry.Kind=="Account"?entry.Account.Id:null,Kind=entry.Kind,Amount=entry.Amount,BaseAmount=entry.Amount});f.Db.Add(t);return t;
        }
        Add("LoanReceived",30,(cash,30,"Account"),(payable,-30,"Account"));
        Add("Adjustment",100,(cash,100,"Account"),(cash,-100,"Equity"));
        Add("AssetLoss",5,(cash,-5,"Account"),(cash,5,"Expense"));
        Add("Refund",2,(cash,2,"Account"),(cash,-2,"Expense")).OriginalTransactionId=ordinary.Id;
        await f.Db.SaveChangesAsync();
        var summary=Json(await f.Service.TransactionSummary(f.User,Query()));var cny=summary.GetProperty("currencies")[0];
        Assert.Equal(6,summary.GetProperty("total").GetInt32());Assert.Equal("22.00",cny.GetProperty("netCashFlow").GetString());
        Assert.Equal("25.00",cny.GetProperty("expense").GetString());Assert.Equal("23.00",cny.GetProperty("netExpense").GetString());
        Assert.Equal(6,await (await f.Service.Filter(f.User,Query())).CountAsync());
    }

    [DeletionSqlFact] public async Task StatusFlagFilterMatchesPendingCountWithoutWideningTheReviewQueue() {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account();
        var category = new Category { UserId = f.User, Name = "餐饮" }; f.Db.Add(category);
        var flagged = f.Expense(account); flagged.Status = "NeedsReview";
        var anomalyConfirmed = f.Expense(account); // Missing category -> Category anomaly, status Confirmed.
        var reviewed = f.Expense(account); reviewed.Entries.Single(e => e.Kind == "Expense").CategoryId = category.Id;
        var plain = f.Expense(account); plain.Entries.Single(e => e.Kind == "Expense").CategoryId = category.Id;
        f.Db.Add(new TransactionReview { UserId = f.User, TransactionId = reviewed.Id, State = "Open" });
        f.Db.Users.Add(new AppUser { Id = "other-status-user", Email = "other-status@workspace.test", PasswordHash = "no-login" });
        var foreign = f.Expense(account); foreign.Status = "NeedsReview"; foreign.UserId = "other-status-user";
        foreach (var entry in foreign.Entries) entry.UserId = foreign.UserId;
        await f.Db.SaveChangesAsync();

        var strict = await (await f.Service.Filter(f.User, Query(("statusFlag", "NeedsReview")))).Select(t => t.Id).ToArrayAsync();
        Assert.Equal(new[] { flagged.Id }, strict);
        var queue = await (await f.Service.Filter(f.User, Query(("status", "NeedsReview"), ("reviewState", "Open")))).Select(t => t.Id).ToArrayAsync();
        Assert.Equal(new[] { flagged.Id, anomalyConfirmed.Id, reviewed.Id }.Order(), queue.Order());
        Assert.True(queue.Length > strict.Length);
        var summary = Json(await f.Service.TransactionSummary(f.User, Query()));
        Assert.Equal(strict.Length, summary.GetProperty("pending").GetInt32());
        Assert.Empty(await (await f.Service.Filter("unrelated-user", Query(("statusFlag", "NeedsReview")))).ToArrayAsync());
        await Assert.ThrowsAsync<ApiException>(() => f.Service.Filter(f.User, Query(("statusFlag", "Bogus"))));
        await Assert.ThrowsAsync<ApiException>(() => f.Service.Filter(f.User, Query(("statusFlag", "NeedsReview"), ("status", "Confirmed"))));
    }

    [DeletionSqlFact] public async Task MultiFiltersAndReviewStatesNeverWidenOwnership() {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var b=f.Account();b.Name="Second cash";var tag=f.Directory("tags","tag");var project=f.Directory("projects","project");
        var one=f.Expense(a,project,tag);var two=f.Expense(b);one.Merchant="A";two.Merchant="B";one.OccurredAt=two.OccurredAt=DateTimeOffset.UtcNow;
        await f.Db.SaveChangesAsync();
        Assert.Equal(2,await (await f.Service.Filter(f.User,Query(("accountIds",a.Id+","+b.Id),("merchants","A,B")))).CountAsync());
        one.Merchant="A, Inc.";await f.Db.SaveChangesAsync();
        Assert.Equal(new[]{one.Id},await (await f.Service.Filter(f.User,Query(("merchants","[\"A, Inc.\",\"B2\"]")))).Select(t=>t.Id).ToArrayAsync());
        Assert.Equal(new[]{one.Id},await (await f.Service.Filter(f.User,Query(("tagIds",tag.Id),("projectIds",project.Id)))).Select(t=>t.Id).ToArrayAsync());
        Assert.Empty(await (await f.Service.Filter(f.User,Query(("accountIds",Guid.NewGuid().ToString())))).ToArrayAsync());
        var review=Json(await f.Service.ReviewUpdate(f.User,one.Id,new("Ignored","checked"),"0"));await f.Db.SaveChangesAsync();
        Assert.Equal("Ignored",review.GetProperty("state").GetString());
        Assert.Equal(new[]{one.Id},await (await f.Service.Filter(f.User,Query(("anomaly","Category"),("reviewState","Ignored")))).Select(t=>t.Id).ToArrayAsync());
        Assert.Equal(new[]{two.Id},await (await f.Service.Filter(f.User,Query(("anomaly","Category"),("reviewState","Open")))).Select(t=>t.Id).ToArrayAsync());
        f.Db.AuditRecords.AddRange(new AuditRecord{UserId=f.User,ResourceType=nameof(FinanceTransaction),ResourceId=one.Id,TransactionId=one.Id,Action="Create",Source="User"},new AuditRecord{UserId=f.User,ResourceType=nameof(FinanceTransaction),ResourceId=one.Id,TransactionId=one.Id,Action="Update",Source="AiAgent"},new AuditRecord{UserId=f.User,ResourceType=nameof(FinanceTransaction),ResourceId=two.Id,TransactionId=two.Id,Action="Create",Source="AiConfirmed"});
        await f.Db.SaveChangesAsync();
        Assert.Equal(new[]{two.Id},await (await f.Service.Filter(f.User,Query(("source","Ai")))).Select(t=>t.Id).ToArrayAsync());
        Assert.Equal(new[]{one.Id},await (await f.Service.Filter(f.User,Query(("source","Manual")))).Select(t=>t.Id).ToArrayAsync());
    }
}
