using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class LedgerAnomalyEquivalenceTests
{
    [DeletionSqlFact]
    public async Task DuplicateBlockingPreservesExactEqualityAndRejectsChecksumCollisions()
    {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();var a=f.Account();var when=DateTimeOffset.Parse("2026-10-20T12:00:00+08:00");
        FinanceTransaction Create(string? merchant){var t=f.Expense(a);t.Merchant=merchant;t.OccurredAt=when;return t;}
        var first=Create("Shared merchant");var second=Create("Shared merchant");second.OccurredAt=when.ToUniversalTime();
        var nullFirst=Create(null);var nullSecond=Create(null);var collisionFirst=Create("a-b");var collisionSecond=Create("ab");
        var caseFirst=Create("Merchant case");var caseSecond=Create("MERCHANT CASE");
        var deleted=Create("Shared merchant");deleted.Status="Deleted";
        var own=Create("Cross scope");var otherUser=new AppUser{Email=Guid.NewGuid()+"@duplicate.test",PasswordHash="no-login"};f.Db.Add(otherUser);var other=new FinanceTransaction{UserId=otherUser.Id,AccountId=a.Id,Type="Expense",Amount=10,Currency="CNY",Merchant="Cross scope",OccurredAt=when};f.Db.Add(other);await f.Db.SaveChangesAsync();
        var ids=new[]{first,second,nullFirst,nullSecond,collisionFirst,collisionSecond,caseFirst,caseSecond,deleted,own}.Select(t=>t.Id).ToArray();
        var evidence=JsonSerializer.SerializeToElement(await f.Service.TransactionIssueEvidence(f.User,ids),FinanceService.Json);var expected=evidence.EnumerateArray().Single(x=>x.GetProperty("rule").GetString()=="Duplicate").GetProperty("transactionIds").EnumerateArray().Select(x=>x.GetString()!).Order().ToArray();
        var query=await f.Service.Filter(f.User,new QueryCollection(new Dictionary<string,StringValues>{{"anomaly","Duplicate"}}));var actual=await query.Select(t=>t.Id).OrderBy(id=>id).ToArrayAsync();Assert.Equal(expected,actual);Assert.Contains(first.Id,actual);Assert.Contains(nullFirst.Id,actual);Assert.DoesNotContain(collisionFirst.Id,actual);Assert.DoesNotContain(collisionSecond.Id,actual);Assert.DoesNotContain(own.Id,actual);Assert.DoesNotContain(other.Id,actual);Assert.DoesNotContain(deleted.Id,actual);
    }
    [DeletionSqlFact]
    public async Task PreaggregatedLedgerChecksEqualIndependentPerTransactionRules()
    {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();
        var a=f.Account();var b=f.Account();b.Name="Target";var c=f.Account();c.Name="Third source";
        var expenseCategory=new Category{UserId=f.User,Name="Valid expense"};var incomeCategory=new Category{UserId=f.User,Name="Valid income",Kind="Income"};
        var otherUser=new AppUser{Email=Guid.NewGuid()+"@parity.test",PasswordHash="no-login"};
        var foreignCategory=new Category{UserId=otherUser.Id,Name="Foreign category"};f.Db.AddRange(expenseCategory,incomeCategory,otherUser,foreignCategory);
        FinanceTransaction Expense(){var t=f.Expense(a);t.Entries.Single(e=>e.Kind=="Expense").CategoryId=expenseCategory.Id;return t;}
        var valid=Expense();var noCategory=f.Expense(a);var foreign=Expense();foreign.Entries.Single(e=>e.Kind=="Expense").CategoryId=foreignCategory.Id;
        var unbalanced=Expense();unbalanced.Entries.Single(e=>e.Kind=="Expense").BaseAmount=9;
        var noAccount=Expense();noAccount.Entries.RemoveAll(e=>e.Kind=="Account");
        var noClassification=Expense();noClassification.Entries.RemoveAll(e=>e.Kind=="Expense");
        var income=Expense();income.Type="Income";foreach(var e in income.Entries){e.Amount=-e.Amount;e.BaseAmount=-e.BaseAmount;if(e.Kind=="Expense"){e.Kind="Income";e.CategoryId=incomeCategory.Id;}}
        FinanceTransaction Transfer(bool reverse=false){var t=Expense();t.Type="Transfer";t.ToAccountId=b.Id;t.Entries.RemoveAll(e=>e.Kind=="Expense");if(reverse){var debit=t.Entries.Single();debit.Amount=10;debit.BaseAmount=10;}t.Entries.Add(new(){UserId=f.User,TransactionId=t.Id,Kind="Account",AccountId=b.Id,Amount=reverse?-10:10,BaseAmount=reverse?-10:10});return t;}
        var transfer=Transfer();var reversed=Transfer(true);var multiple=Transfer();var first=multiple.Entries.Single(e=>e.AccountId==a.Id);first.Amount=-4;first.BaseAmount=-4;multiple.Entries.Add(new(){UserId=f.User,TransactionId=multiple.Id,Kind="Account",AccountId=c.Id,Amount=-6,BaseAmount=-6});
        var missingCredit=Expense();missingCredit.Type="CreditCardPayment";missingCredit.ToAccountId=b.Id;
        var deleted=Expense();deleted.Status="Deleted";deleted.Entries.RemoveAll(e=>e.Kind=="Account");
        var unrelated=Expense();unrelated.Type="LoanGiven";unrelated.Entries.RemoveAll(e=>e.Kind=="Account");
        var other=new FinanceTransaction{UserId=otherUser.Id,Type="Expense",AccountId=a.Id,Amount=10};f.Db.Add(other);
        await f.Db.SaveChangesAsync();
        var ids=new[]{valid,noCategory,foreign,unbalanced,noAccount,noClassification,income,transfer,reversed,multiple,missingCredit,deleted,unrelated}.Select(t=>t.Id).ToArray();
        // These independent EF predicates are also used for individual issue evidence.
        var evidence=JsonSerializer.SerializeToElement(await f.Service.TransactionIssueEvidence(f.User,ids),FinanceService.Json);
        foreach(var rule in new[]{"Balance","Category","Transfer"}){
            var expected=evidence.EnumerateArray().Single(x=>x.GetProperty("rule").GetString()==rule).GetProperty("transactionIds").EnumerateArray().Select(x=>x.GetString()!).Order().ToArray();
            var query=await f.Service.Filter(f.User,new QueryCollection(new Dictionary<string,StringValues>{{"anomaly",rule}}));
            var actual=await query.Select(t=>t.Id).OrderBy(id=>id).ToArrayAsync();Assert.Equal(expected,actual);Assert.DoesNotContain(other.Id,actual);
        }
    }
}
