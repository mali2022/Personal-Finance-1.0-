using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
[Collection("Finance SQL")]
public sealed class EntryWorkflowSqlTests
{
    static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    static QueryCollection Query(params (string Key, string Value)[] values) => new(values.ToDictionary(v => v.Key, v => new StringValues(v.Value)));
    [DeletionSqlFact] public async Task RefundSearchMatchesNoteProductAmountAndShanghaiDate()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); var t = f.Expense(a); t.Note = "refund-note"; t.ProductName = "refund-product";
        t.OccurredAt = DateTimeOffset.Parse("2026-10-24T16:30:00Z");
        var deleted = f.Expense(a); deleted.Status = "Deleted"; deleted.Note = "refund-note";
        await f.Db.SaveChangesAsync();
        foreach (var keyword in new[] { "refund-note", "refund-product", "10.00", "2026-10-25", t.Id }) {
            var result = Json(await f.Service.RefundSources(f.User, Query(("keyword", keyword))));
            Assert.Equal(1, result.GetProperty("total").GetInt32());
            Assert.Equal(t.Id, result.GetProperty("items")[0].GetProperty("id").GetString());
        }
        Assert.Equal(0, Json(await f.Service.RefundSources(f.User, Query(("keyword", "2026-10-24")))).GetProperty("total").GetInt32());
    }
    [DeletionSqlFact] public async Task RefundChoicesMatchDetailAfterPartialRefundWithoutLoadingBalances()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account();
        var root = new Category { UserId = f.User, Name = "Expense root", Kind = "Expense" };
        var category = new Category { UserId = f.User, Name = "Expense leaf", Kind = "Expense", ParentId = root.Id };
        f.Db.AddRange(root, category);
        var t = f.Expense(a); t.CategoryId = category.Id;
        t.Entries.Single(e => e.Kind == "Expense").CategoryId = category.Id;
        await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, new SaveTransaction("Refund", "3", a.Id, t.OccurredAt.AddMinutes(1),
            CategoryId: category.Id, OriginalTransactionId: t.Id));
        await f.Db.SaveChangesAsync();
        var choice = Json(await f.Service.RefundSources(f.User, Query(("keyword", t.Id)))).GetProperty("items")[0];
        var detail = Json(await f.Service.RefundSource(f.User, t.Id));
        Assert.Equal("7.00", choice.GetProperty("refundableAmount").GetString());
        Assert.Equal(detail.GetProperty("refundableAmount").GetString(), choice.GetProperty("refundableAmount").GetString());
        Assert.Equal(detail.GetProperty("refundedAmount").GetString(), choice.GetProperty("refundedAmount").GetString());
        Assert.False(choice.TryGetProperty("accountBalances", out _));
    }
    [DeletionSqlFact] public async Task ChangeTypeRebuildsEntriesAndAccountListsIncludeBothSides()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); var b = f.Account(); b.Name = "Target"; var expense = f.Expense(a); await f.Db.SaveChangesAsync();
        await f.Service.SaveTransaction(f.User, new SaveTransaction("Transfer", "10", a.Id, expense.OccurredAt, ToAccountId: b.Id, Payments: []), expense.Id, "1");
        await f.Db.SaveChangesAsync();
        Assert.Equal("Transfer", expense.Type); Assert.DoesNotContain(expense.Entries, e => e.Kind == "Expense");
        Assert.Equal(10, expense.Entries.Single(e => e.AccountId == b.Id).Amount);
        foreach (var account in new[] { a, b }) {
            var result = Json(await f.Service.Transactions(f.User, Query(("accountId", account.Id))));
            Assert.Equal(1, result.GetProperty("total").GetInt32());
            Assert.Equal(2, result.GetProperty("items")[0].GetProperty("accountBalances").GetArrayLength());
        }
        await Assert.ThrowsAsync<ApiException>(() => f.Service.SaveTransaction(f.User, new SaveTransaction("Income", "10", a.Id, expense.OccurredAt), expense.Id, "1"));
    }
    [DeletionSqlFact] public async Task DeleteLoanReversesPrincipalAndRepaymentsForBothDirections()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); await f.Db.SaveChangesAsync();
        foreach (var kind in new[] { "Lent", "Borrowed" }) {
            var id = Json(await f.Service.CreateBusiness(f.User, new BusinessInput(kind, "test", a.Id, "100", DateTimeOffset.UtcNow.AddDays(-2)))).GetProperty("id").GetString()!;
            await f.Db.SaveChangesAsync();
            var b = await f.Db.Businesses.SingleAsync(x => x.Id == id);
            await f.Service.SettleBusiness(f.User, id, new SettlementInput(a.Id, "40", DateTimeOffset.UtcNow), b.Version.ToString());
            await f.Db.SaveChangesAsync();
            var plan = new DebtRepaymentPlan { UserId = f.User, Kind = "LoanRepayment", AccountId = a.Id, BusinessId = id, Name = "plan", Principal = 60, Periods = 1, FirstDate = new DateOnly(2026, 11, 1) };
            f.Db.Add(plan); await f.Db.SaveChangesAsync();
            await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteLoan(f.User, id, "0"));
            await Assert.ThrowsAsync<ApiException>(() => f.Service.DeleteLoan("other-user", id, b.Version.ToString()));
            await f.Service.DeleteLoan(f.User, id, b.Version.ToString()); await f.Db.SaveChangesAsync();
            Assert.Equal("Archived", plan.State);
            Assert.All(await f.Db.Transactions.Where(t => t.BusinessId == id).ToListAsync(), t => Assert.Equal("Deleted", t.Status));
            Assert.Equal(0, Json(await f.Service.Businesses(f.User, Query(("kind", kind)))).GetProperty("total").GetInt32());
            Assert.Equal(0, await f.Db.Entries.Where(e => e.AccountId == b.ContractAccountId && f.Db.Transactions.Any(t => t.Id == e.TransactionId && t.Status != "Deleted")).SumAsync(e => e.Amount));
        }
    }
}
