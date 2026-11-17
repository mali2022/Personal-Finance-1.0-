using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class RunningBalanceRangeSqlTests
{
    [DeletionSqlFact]
    public async Task PagedBalancesMatchIndependentLedgerAcrossPrefixesTiesOffsetsAndBackdatedChanges()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); var b = f.Account(); b.Name = "Other cash"; b.OpeningBalance = 2000;
        var at = DateTimeOffset.Parse("2026-10-26T00:00:00+08:00");
        var created = at.AddDays(1);
        var rows = new List<FinanceTransaction>();
        FinanceTransaction Add(decimal amount, DateTimeOffset occurred, DateTimeOffset creation) {
            var t = f.Expense(a); t.Id = $"00000000-0000-0000-0000-{rows.Count + 1:000000000000}";
            t.Amount = amount; t.OccurredAt = occurred; t.CreatedAt = creation;
            foreach (var e in t.Entries) { e.TransactionId = t.Id; e.Amount = e.BaseAmount = e.Kind == "Account" ? -amount : amount; }
            rows.Add(t); return t;
        }
        Add(1, at.AddYears(-6), created);
        Add(20, at, created);
        Add(30, at.ToUniversalTime(), created); // Same instant and creation: ID decides.
        Add(40, at, created.AddTicks(1));
        var moved = Add(50, at.AddTicks(1), created);
        Add(60, at.AddTicks(-1), created); // Opposite sides of Shanghai midnight.
        var deleted = Add(70, at.AddYears(-1), created); deleted.Status = "Deleted";
        var transfer = Add(10, at.AddDays(1), created); transfer.Type = "Transfer"; transfer.ToAccountId = b.Id;
        var second = transfer.Entries.Single(e => e.Kind == "Expense"); second.Kind = "Account"; second.AccountId = b.Id;
        var multi = Add(10, at.AddDays(2), created);
        var firstPayment = multi.Entries.Single(e => e.Kind == "Account"); firstPayment.Amount = firstPayment.BaseAmount = -6;
        multi.Entries.Add(new Entry { UserId = f.User, TransactionId = multi.Id, Kind = "Account", AccountId = b.Id, Amount = -4, BaseAmount = -4 });
        await f.Db.SaveChangesAsync();

        async Task Verify() {
            var ledger = await f.Db.Transactions.AsNoTracking().Include(t => t.Entries).Where(t => t.UserId == f.User && t.Status != "Deleted").ToArrayAsync();
            var openings = new Dictionary<string, decimal> { [a.Id] = a.OpeningBalance, [b.Id] = b.OpeningBalance };
            foreach (var filter in new[] {
                new Dictionary<string,StringValues> { ["pageSize"]="3" },
                new() { ["pageSize"]="3", ["sort"]="amount:desc" },
                new() { ["pageSize"]="3", ["sort"]="amount:asc" },
                new() { ["pageSize"]="3", ["page"]="2" },
                new() { ["pageSize"]="100", ["sort"]="occurredAt:asc" },
                new() { ["pageSize"]="3", ["accountId"]=b.Id }
            }) {
                var result = JsonSerializer.SerializeToElement(await f.Service.Transactions(f.User, new QueryCollection(filter)), FinanceService.Json);
                foreach (var item in result.GetProperty("items").EnumerateArray()) {
                    var target = ledger.Single(t => t.Id == item.GetProperty("id").GetString());
                    foreach (var balance in item.GetProperty("accountBalances").EnumerateArray()) {
                        var account = balance.GetProperty("accountId").GetString()!;
                        var expected = openings[account] + ledger.Where(t =>
                            t.OccurredAt < target.OccurredAt || t.OccurredAt == target.OccurredAt &&
                            (t.CreatedAt < target.CreatedAt || t.CreatedAt == target.CreatedAt && string.CompareOrdinal(t.Id, target.Id) <= 0))
                            .SelectMany(t => t.Entries).Where(e => e.Kind == "Account" && e.AccountId == account).Sum(e => e.Amount);
                        Assert.Equal(expected.ToString("F2", CultureInfo.InvariantCulture), balance.GetProperty("balance").GetString());
                    }
                }
            }
        }
        await Verify();
        moved.OccurredAt = at.AddYears(-4); deleted.Status = "Confirmed";
        await f.Db.SaveChangesAsync();
        await Verify();
    }
}
