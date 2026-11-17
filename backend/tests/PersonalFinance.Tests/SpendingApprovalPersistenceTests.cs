using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class SpendingApprovalPersistenceTests
{
    [ProfileSqlFact]
    public async Task LifecyclePreservesLedgerAndOwnership()
    {
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
        await db.Database.MigrateAsync();
        var user = new AppUser { Email = Guid.NewGuid() + "@approval.test", DisplayName = "Approval test" };
        var other = new AppUser { Email = Guid.NewGuid() + "@approval.test", DisplayName = "Other test" };
        db.AddRange(user, other);
        var account = new Account { UserId = user.Id, Name = "Test cash", OpeningBalance = 1000 };
        db.Add(account);
        var tx = new FinanceTransaction { UserId = user.Id, AccountId = account.Id, Type = "Expense", Status = "Confirmed", Amount = 100, Currency = "CNY", OccurredAt = DateTimeOffset.UtcNow };
        db.Add(tx); await db.SaveChangesAsync();
        using var services = new ServiceCollection().BuildServiceProvider();
        var f = new FinanceService(db, services.GetRequiredService<IServiceScopeFactory>(), NullLogger<FinanceService>.Instance);
        var transactionCount = await db.Transactions.CountAsync(); var entryCount = await db.Entries.CountAsync();
        async Task<JsonElement> Write(object body, Func<Task<object?>> action)
        {
            var c = new DefaultHttpContext(); c.Request.Method = "POST"; c.Request.Path = "/api/spending-approvals";
            c.Request.Headers["Idempotency-Key"] = Guid.NewGuid().ToString();
            return JsonSerializer.SerializeToElement(await f.Write(user.Id, c, body, action, true), FinanceService.Json);
        }
        var application = new ApprovalApplication("Headphones", 100, "CNY", "Daily use");
        var lease = await SpendingApprovalLease.Acquire(IsolatedSqlTestDatabase.ConnectionString(), user.Id, default);
        await Assert.ThrowsAsync<ApiException>(() => SpendingApprovalLease.Acquire(IsolatedSqlTestDatabase.ConnectionString(), user.Id, default));
        await lease.DisposeAsync();
        await using (var recoveredLease = await SpendingApprovalLease.Acquire(IsolatedSqlTestDatabase.ConnectionString(), user.Id, default)) { }
        var settings = new ApprovalSettings("Balanced", "CNY", 100, "Prefer durable goods");
        await Write(settings, async () => await f.ApprovalSaveSettings(user.Id, settings, "0"));
        var evidence = JsonSerializer.SerializeToElement(await f.ApprovalEvidence(user.Id, application), FinanceService.Json);
        Assert.Equal(1000, evidence.GetProperty("availableSameCurrencyCash").GetDecimal());
        Assert.Equal(100, evidence.GetProperty("emergencyReserve").GetDecimal());
        Assert.Contains("MONTHLY_BUDGET_UNKNOWN", evidence.GetProperty("missing").EnumerateArray().Select(x => x.GetString()));
        var saved = await Write(application, async () => await f.ApprovalSave(user.Id, null, application, "0"));
        var id = saved.GetProperty("id").GetString()!; var version = saved.GetProperty("version").GetString()!;
        var answer = new ApprovalAnswer("旧耳机是否可用？", "已损坏，用于日常工作");
        saved = await Write(answer, async () => await f.ApprovalAddNote(user.Id, id, answer, "ApprovalAnswer", version)); version = saved.GetProperty("version").GetString()!;
        var installment = new ApprovalInstallment(0, 100, 3, 2);
        saved = await Write(installment, async () => await f.ApprovalAddNote(user.Id, id, installment, "ApprovalInstallment", version)); version = saved.GetProperty("version").GetString()!;
        var supplementary = JsonSerializer.SerializeToElement(await f.ApprovalNotes(user.Id, id), FinanceService.Json);
        Assert.Equal(2, supplementary.GetProperty("records").GetArrayLength());
        await Assert.ThrowsAsync<ApiException>(() => f.ApprovalDetail(other.Id, id));
        await Assert.ThrowsAsync<ApiException>(() => f.ApprovalChange(user.Id, id, new("LINK", TransactionId: tx.Id), version));
        async Task Change(ApprovalAction action)
        {
            saved = await Write(action, async () => await f.ApprovalChange(user.Id, id, action, version)); version = saved.GetProperty("version").GetString()!;
        }
        await Change(new("SUBMIT")); await Change(new("COOLDOWN", Hours: 168));
        Assert.Equal("COOLING_DOWN", saved.GetProperty("content").GetProperty("state").GetString());
        await Change(new("END_COOLDOWN")); await Change(new("BUY")); await Change(new("LINK", TransactionId: tx.Id));
        var refund1 = new FinanceTransaction { UserId = user.Id, AccountId = account.Id, Type = "Refund", Status = "Confirmed", Amount = 20, Currency = "CNY", OccurredAt = DateTimeOffset.UtcNow, OriginalTransactionId = tx.Id };
        var refund2 = new FinanceTransaction { UserId = user.Id, AccountId = account.Id, Type = "Refund", Status = "Confirmed", Amount = 10, Currency = "CNY", OccurredAt = DateTimeOffset.UtcNow, OriginalTransactionId = tx.Id };
        db.AddRange(refund1, refund2); await db.SaveChangesAsync(); transactionCount += 2;
        var refundDetail = JsonSerializer.SerializeToElement(await f.ApprovalDetail(user.Id, id), FinanceService.Json);
        Assert.Equal("PARTIAL", refundDetail.GetProperty("refundState").GetString()); Assert.Equal(70, refundDetail.GetProperty("netActualCost").GetDecimal());
        refund1.Amount = 90; await db.SaveChangesAsync();
        refundDetail = JsonSerializer.SerializeToElement(await f.ApprovalDetail(user.Id, id), FinanceService.Json);
        Assert.Equal("FULL", refundDetail.GetProperty("refundState").GetString()); Assert.Equal(0, refundDetail.GetProperty("netActualCost").GetDecimal());
        await Change(new("REVIEW", "Useful", Satisfaction: 8, ActualUses: 12));
        var detail = JsonSerializer.SerializeToElement(await f.ApprovalDetail(user.Id, id), FinanceService.Json);
        Assert.True(detail.GetProperty("purchaseVerified").GetBoolean());
        tx.Status = "Deleted"; await db.SaveChangesAsync();
        detail = JsonSerializer.SerializeToElement(await f.ApprovalDetail(user.Id, id), FinanceService.Json);
        Assert.False(detail.GetProperty("purchaseVerified").GetBoolean()); Assert.True(detail.GetProperty("linkedTransactionMissing").GetBoolean());
        await Change(new("UNLINK"));
        Assert.Equal(transactionCount, await db.Transactions.CountAsync()); Assert.Equal(entryCount, await db.Entries.CountAsync());
        var loadContent = JsonSerializer.SerializeToUtf8Bytes(new ApprovalRecord(application, "DRAFT", []), FinanceService.Json);
        await db.Database.ExecuteSqlInterpolatedAsync($@"INSERT INTO finance.Documents (Id,UserId,Kind,Name,ContentType,Content,CreatedAt,Version)
SELECT TOP(10000) CONVERT(nvarchar(36),NEWID()),{user.Id},'SpendingApproval','Isolated load','application/json',{loadContent},SYSDATETIMEOFFSET(),1 FROM sys.all_objects a CROSS JOIN sys.all_objects b;");
        var watch = System.Diagnostics.Stopwatch.StartNew();
        var load = JsonSerializer.SerializeToElement(await f.ApprovalList(user.Id, new QueryCollection()), FinanceService.Json);
        Assert.Equal(10001, load.GetProperty("total").GetInt32());
        Assert.InRange(load.GetProperty("items").GetArrayLength(), 1, 100);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(5), "Approval pagination exceeded five seconds");
        Console.WriteLine("APPROVAL_10001_PAGINATION_MS=" + watch.ElapsedMilliseconds);
        Assert.Equal(1000, account.OpeningBalance);
        Assert.Equal(new[] { "CREATE", "ApprovalAnswer", "ApprovalInstallment", "SUBMIT", "COOLDOWN", "END_COOLDOWN", "BUY", "LINK", "REVIEW", "UNLINK" }, saved.GetProperty("content").GetProperty("history").EnumerateArray().Select(e => e.GetProperty("action").GetString()));
        await Assert.ThrowsAsync<ApiException>(() => f.ApprovalChange(user.Id, id, new("SUBMIT"), "0"));
        await Change(new("ABANDON"));
        await Write(new { id }, async () => await f.ApprovalDelete(user.Id, id, version));
        await Assert.ThrowsAsync<ApiException>(() => f.ApprovalDetail(user.Id, id));
        Assert.Equal(transactionCount, await db.Transactions.CountAsync()); Assert.Equal(entryCount, await db.Entries.CountAsync());
    }
}
