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
public sealed class CollaborationTests
{
    static JsonElement Json(object x) => JsonSerializer.SerializeToElement(x, FinanceService.Json);
    [Fact] public void SplitsAreExactDeterministicAndRejectInvalidRules()
    {
        var members = new[] { new ShareInput("a", "1"), new ShareInput("b", "1"), new ShareInput("c", "1") };
        var shares = FinanceService.CalculateShares(10, 2, "Equal", members);
        Assert.Equal(new[] { 3.34m, 3.33m, 3.33m }, shares.Select(s => s.Amount));
        Assert.Equal(10m, shares.Sum(s => s.Amount));
        Assert.Equal(new[] { 3.33m, 6.67m }, FinanceService.CalculateShares(10, 2, "Percent", [new("a", "33.33"), new("b", "66.67")]).Select(s => s.Amount));
        Assert.Equal(10, FinanceService.CalculateShares(10, 2, "Amount", [new("a", "6"), new("b", "4")]).Sum(s => s.Amount));
        Assert.Throws<ApiException>(() => FinanceService.CalculateShares(10, 2, "Percent", [new("a", "20"), new("b", "20")]));
        Assert.Throws<ApiException>(() => FinanceService.CalculateShares(10, 2, "Equal", [new("a", "1"), new("a", "1")]));
        Assert.Throws<ApiException>(() => FinanceService.CalculateShares(10, 2, "Amount", [new("a", "1")]));
        Assert.Throws<ApiException>(() => FinanceService.CalculateShares(10, 2, "BadRule", members));
        Assert.Equal(4.01m, FinanceService.AllocateRemaining(4.01m, shares).Sum(s => s.Amount));
    }
    [ProfileSqlFact] public async Task SharingPermissionsRefundsBudgetsAndSettlementRemainIsolated()
    {
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
        await db.Database.MigrateAsync();
        using var services = new ServiceCollection().BuildServiceProvider();
        var f = new FinanceService(db, services.GetRequiredService<IServiceScopeFactory>(), NullLogger<FinanceService>.Instance);
        var owner = new AppUser { Email = Guid.NewGuid()+"@shared.test", DisplayName = "Owner" }; var guest = new AppUser { Email = Guid.NewGuid()+"@shared.test", DisplayName = "Guest" }; var stranger = new AppUser { Email = Guid.NewGuid()+"@shared.test", DisplayName = "Stranger" }; db.AddRange(owner, guest, stranger); await db.SaveChangesAsync();
        async Task<JsonElement> Write(string user, object b, Func<Task<object?>> action) => Json((await f.Write(user, new DefaultHttpContext(), b, action))!);
        var family = (await Write(owner.Id, new { }, async () => await f.SaveSpace(owner.Id, new("Family", "Family"), null))).GetProperty("id").GetString()!;
        var book = (await Write(owner.Id, new { }, async () => await f.SaveSpace(owner.Id, new("Shared", FamilyId: family), null))).GetProperty("id").GetString()!;
        await Write(owner.Id, new { }, async () => await f.SaveSpaceMember(owner.Id, family, null, new("Child")));
        var invite = (await Write(owner.Id, new { }, async () => await f.InviteSpace(owner.Id, family, new(guest.Email, "Editor")))).GetProperty("id").GetString()!;
        await Assert.ThrowsAsync<ApiException>(() => f.AcceptSpace(stranger.Id, invite));
        await Write(guest.Id, new { }, async () => await f.AcceptSpace(guest.Id, invite));
        await Assert.ThrowsAsync<ApiException>(() => f.SpaceAccess(stranger.Id, family));
        await Assert.ThrowsAsync<ApiException>(() => f.SpaceAccess(guest.Id, family, "Owner"));
        await Assert.ThrowsAsync<ApiException>(() => f.SpaceAccess(guest.Id, book));
        var members = await db.Set<SpaceMember>().Where(m => m.SpaceId == family).ToArrayAsync();
        var payer = members.Single(m => m.LinkedUserId == owner.Id).Id; var consumer = members.Single(m => m.LinkedUserId == guest.Id).Id;
        var account = new Account { UserId = owner.Id, Name = "Private account" }; var category = new Category { UserId = owner.Id, Name = "Food" }; db.AddRange(account, category); await db.SaveChangesAsync();
        var tx = new FinanceTransaction { UserId = owner.Id, AccountId = account.Id, Type = "Expense", Amount = 100, OccurredAt = new(2026,10,10,0,0,0,TimeSpan.Zero), Note = "Shared dinner" };
        tx.Entries.Add(new Entry { UserId = owner.Id, TransactionId = tx.Id, Kind = "Expense", CategoryId = category.Id, Amount = 100, BaseAmount = 100 }); db.Add(tx); await db.SaveChangesAsync();
        await Write(owner.Id, new { }, async () => { await f.ApplyCollaboration(owner.Id, tx.Id, new(book, consumer, payer, "Equal", [new(payer,"1"), new(consumer,"1")])); return new { tx.Id }; });
        var report = Json(await f.SpaceReport(guest.Id, family, "2026-10"));
        Assert.Equal("100.00", report.GetProperty("totals")[0].GetProperty("expense").GetString());
        Assert.DoesNotContain("accountId", report.GetRawText()); Assert.DoesNotContain("Private account", report.GetRawText());
        Assert.Equal(50m, (await f.SpaceBalances(owner.Id, family)).Single(b => b.MemberId == payer).Net);
        await Assert.ThrowsAsync<ApiException>(() => f.Account(guest.Id, account.Id));
        await Assert.ThrowsAsync<ApiException>(() => f.SettleSpace(owner.Id, family, new(consumer, payer, "CNY", "51", "too much")));
        await Write(owner.Id, new { }, async () => await f.SettleSpace(owner.Id, family, new(consumer, payer, "CNY", "20", "paid")));
        Assert.Equal(-30m, (await f.SpaceBalances(owner.Id, family)).Single(b => b.MemberId == consumer).Net);
        var refund = new FinanceTransaction { UserId = owner.Id, AccountId = account.Id, Type = "Refund", Amount = 40, OriginalTransactionId = tx.Id, OccurredAt = tx.OccurredAt.AddDays(1) }; db.Add(refund); await db.SaveChangesAsync();
        Assert.Equal(10m, (await f.SpaceBalances(owner.Id, family)).Single(b => b.MemberId == payer).Net);
        await Write(owner.Id, new { }, async () => await f.SaveSpaceBudget(owner.Id, family, new("2026-10", "CNY", "120")));
        report = Json(await f.SpaceReport(guest.Id, family, "2026-10"));
        Assert.Equal("60.00", report.GetProperty("budgets")[0].GetProperty("actual").GetString());
        await Assert.ThrowsAsync<ApiException>(() => f.SaveSpaceBudget(guest.Id, family, new("2026-10", "CNY", "1")));
        await Assert.ThrowsAsync<ApiException>(() => f.SaveSpaceBudget(owner.Id, family, new("2026-10", "CNY", "1", "0")));
        Assert.Empty(Json(await f.SpaceList(stranger.Id)).EnumerateArray());
        Assert.Equal(1, await db.Set<SpaceSettlement>().CountAsync(s => s.SpaceId == family));
        Assert.Equal(2, await db.Transactions.CountAsync(t => t.UserId == owner.Id));
    }
}
