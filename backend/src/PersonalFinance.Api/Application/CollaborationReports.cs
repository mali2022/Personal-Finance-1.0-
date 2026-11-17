using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> CompareBooks(string user, string[] ids, string month, bool ownerOnly = false)
    {
        Require(ids.Length is > 0 and <= 50 && ids.Distinct().Count() == ids.Length, "请选择1至50个不同账本");
        var items = new List<object>(); var totals = new Dictionary<string, (decimal Income, decimal Expense)>();
        foreach (var id in ids) {
            var book = await SpaceAccess(user, id, ownerOnly ? "Owner" : "Viewer"); Require(book.Kind == "Book", "跨账本报表只接受账本");
            var report = JsonSerializer.SerializeToElement(await SpaceReport(user, id, month), Json);
            foreach (var value in report.GetProperty("totals").EnumerateArray()) {
                var currency = value.GetProperty("currency").GetString()!; var income = Money(value.GetProperty("income").GetString()); var expense = Money(value.GetProperty("expense").GetString());
                var old = totals.GetValueOrDefault(currency); totals[currency] = (old.Income + income, old.Expense + expense);
                items.Add(new { bookId = book.Id, name = book.Name, currency, income = M(income), expense = M(expense), balance = M(income - expense) });
            }
        }
        return new { month, items, totals = totals.Select(t => new { currency = t.Key, income = M(t.Value.Income), expense = M(t.Value.Expense), balance = M(t.Value.Income - t.Value.Expense) }) };
    }
    public sealed record SpaceBalance(string MemberId, string Currency, decimal Paid, decimal Share, decimal Net);
    public async Task<SpaceBalance[]> SpaceBalances(string user, string id)
    {
        var space = await SpaceAccess(user, id);
        var books = await db.Set<FinanceSpace>().Where(s => s.Id == id || space.Kind == "Family" && s.FamilyId == id).Select(s => s.Id).ToArrayAsync();
        var links = await db.Set<SharedTransaction>().Where(x => books.Contains(x.BookId)).ToArrayAsync();
        var ids = links.Select(l => l.TransactionId).ToArray();
        var transactions = await db.Transactions.Where(t => ids.Contains(t.Id) && t.Status != "Deleted").ToArrayAsync();
        var refunds = await db.Transactions.Where(t => t.OriginalTransactionId != null && ids.Contains(t.OriginalTransactionId) && t.Status != "Deleted" && t.Type == "Refund").ToArrayAsync();
        var balances = new Dictionary<(string Member, string Currency), (decimal Paid, decimal Share, decimal Settled)>();
        void Add(string member, string currency, decimal paid, decimal share, decimal settled = 0) {
            var key = (member, currency); var v = balances.GetValueOrDefault(key); balances[key] = (v.Paid + paid, v.Share + share, v.Settled + settled);
        }
        foreach (var t in transactions.Where(t => t.Type == "Expense")) {
            var link = links.Single(l => l.TransactionId == t.Id);
            var shares = JsonSerializer.Deserialize<CalculatedShare[]>(link.SharesJson, Json) ?? [];
            if (shares.Length == 0 || link.PayerId == null) continue;
            var remaining = Math.Max(0, t.Amount - refunds.Where(r => r.OriginalTransactionId == t.Id).Sum(r => r.Amount));
            var effective = remaining == 0 ? shares.Select(s => new CalculatedShare(s.MemberId, 0)).ToArray() : AllocateRemaining(remaining, shares);
            Add(link.PayerId, t.Currency, remaining, 0);
            foreach (var share in effective) Add(share.MemberId, t.Currency, 0, share.Amount);
        }
        var settlementScope = space.FamilyId ?? space.Id;
        foreach (var s in await db.Set<SpaceSettlement>().Where(s => s.SpaceId == settlementScope && !s.Revoked).ToArrayAsync()) {
            Add(s.FromMemberId, s.Currency, 0, 0, s.Amount); Add(s.ToMemberId, s.Currency, 0, 0, -s.Amount);
        }
        return balances.Select(x => new SpaceBalance(x.Key.Member, x.Key.Currency, x.Value.Paid, x.Value.Share, x.Value.Paid - x.Value.Share + x.Value.Settled)).ToArray();
    }
    public static CalculatedShare[] AllocateRemaining(decimal amount, CalculatedShare[] shares)
    {
        var total = shares.Sum(s => s.Amount); Require(total > 0, "分摊合计无效");
        var raw = shares.Select(s => amount * 100 * s.Amount / total).ToArray();
        var units = raw.Select(decimal.Floor).ToArray();
        foreach (var i in Enumerable.Range(0, shares.Length).OrderByDescending(i => raw[i] - units[i]).ThenBy(i => shares[i].MemberId).Take((int)(amount * 100 - units.Sum()))) units[i]++;
        return shares.Select((s, i) => new CalculatedShare(s.MemberId, units[i] / 100)).ToArray();
    }
    public async Task<object> SpaceReport(string user, string id, string month)
    {
        var space = await SpaceAccess(user, id);
        Require(DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date), "月份无效");
        var start = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)); var end = start.AddMonths(1);
        var books = await db.Set<FinanceSpace>().Where(s => s.Id == id || space.Kind == "Family" && s.FamilyId == id).Select(s => s.Id).ToArrayAsync();
        var links = await db.Set<SharedTransaction>().Where(x => books.Contains(x.BookId)).ToArrayAsync(); var ids = links.Select(l => l.TransactionId).ToArray();
        var transactions = await db.Transactions.AsNoTracking().Where(t => t.Status != "Deleted" && (ids.Contains(t.Id) || t.Type == "Refund" && t.OriginalTransactionId != null && ids.Contains(t.OriginalTransactionId)) && t.OccurredAt >= start && t.OccurredAt < end).OrderByDescending(t => t.OccurredAt).ToArrayAsync();
        if (space.FamilyId != null) await SpaceAccess(user, space.FamilyId);
        var memberScope = space.FamilyId ?? space.Id;
        var members = await db.Set<SpaceMember>().Where(m => m.SpaceId == memberScope).Select(m => new { m.Id, m.Name, m.Role, m.Profile, m.Active, m.LinkedUserId, version = m.Version.ToString() }).ToArrayAsync();
        var ownMembers = space.FamilyId == null ? members : await db.Set<SpaceMember>().Where(m => m.SpaceId == id).Select(m => new { m.Id, m.Name, m.Role, m.Profile, m.Active, m.LinkedUserId, version = m.Version.ToString() }).ToArrayAsync();
        var budgets = await db.Set<SpaceBudget>().Where(b => b.SpaceId == id && b.Month == month).ToArrayAsync();
        return new {
            space = new { space.Id, space.Name, space.Kind, space.FamilyId, space.Description, space.SortOrder, space.Archived, version = space.Version.ToString() }, members, ownMembers,
            totals = transactions.GroupBy(t => t.Currency).Select(g => new { currency = g.Key, income = M(g.Where(t => t.Type == "Income").Sum(t => t.Amount)), expense = M(g.Where(t => t.Type == "Expense").Sum(t => t.Amount) - g.Where(t => t.Type == "Refund").Sum(t => t.Amount)) }),
            transactions = transactions.Select(t => { var link = links.FirstOrDefault(l => l.TransactionId == t.Id || l.TransactionId == t.OriginalTransactionId); return new { t.Id, t.Type, t.Amount, t.Currency, t.OccurredAt, t.Merchant, t.Note, link?.BookId, link?.ConsumerId, link?.PayerId, link?.Rule, shares = JsonSerializer.Deserialize<CalculatedShare[]>(link?.SharesJson ?? "[]", Json), own = t.UserId == user }; }),
            balances = space.FamilyId == null ? await SpaceBalances(user, id) : [],
            budgets = budgets.Select(b => new { b.Currency, b.Month, amount = M(b.Amount), actual = M(transactions.Where(t => t.Currency == b.Currency).Sum(t => t.Type == "Expense" ? t.Amount : t.Type == "Refund" ? -t.Amount : 0)), version = b.Version.ToString() }),
            settlements = await db.Set<SpaceSettlement>().Where(s => s.SpaceId == memberScope).OrderByDescending(s => s.CreatedAt).Select(s => new { s.Id, s.FromMemberId, s.ToMemberId, s.Currency, s.Amount, s.Note, s.CreatedAt, s.Revoked, version = s.Version.ToString() }).ToArrayAsync(),
            invitations = space.UserId == user ? await db.Set<SpaceInvitation>().Where(i => i.SpaceId == id).Select(i => new { i.Id, i.Email, i.Role, i.State, i.ExpiresAt, version = i.Version.ToString() }).ToArrayAsync() : null
        };
    }
    public async Task<object> SaveSpaceBudget(string user, string id, SharedBudgetInput b)
    {
        await SpaceAccess(user, id, "Owner");
        Require(DateOnly.TryParseExact(b.Month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) && CurrencyDefinitions.Items.Any(c => c.Code == b.Currency), "月份或币种无效");
        var amount = Money(b.Amount); Require(amount >= 0, "预算不能为负数");
        var budget = await db.Set<SpaceBudget>().SingleOrDefaultAsync(x => x.SpaceId == id && x.Month == b.Month && x.Currency == b.Currency);
        if (budget == null) { Require(b.Version == null || b.Version == "0", "预算版本无效"); budget = new() { UserId = user, SpaceId = id, Month = b.Month, Currency = b.Currency }; db.Add(budget); }
        else { Version(budget, b.Version); budget.Version++; }
        budget.Amount = amount; return new { budget.Id };
    }
    public async Task<object> SettleSpace(string user, string id, SharedSettlementInput b)
    {
        var space = await SpaceAccess(user, id, "Owner"); Require(space.FamilyId == null, "家庭账本请在家庭中心结算");
        var amount = Money(b.Amount); Require(amount > 0 && b.FromMemberId != b.ToMemberId && b.Note.Length is > 0 and <= 1000, "结算金额、成员或说明无效");
        var balances = await SpaceBalances(user, id);
        var from = balances.SingleOrDefault(x => x.MemberId == b.FromMemberId && x.Currency == b.Currency)?.Net ?? 0;
        var to = balances.SingleOrDefault(x => x.MemberId == b.ToMemberId && x.Currency == b.Currency)?.Net ?? 0;
        Require(from < 0 && to > 0 && amount <= Math.Min(-from, to), "结算不能超过当前成员应付及应收余额");
        var settlement = new SpaceSettlement { UserId = user, SpaceId = id, FromMemberId = b.FromMemberId, ToMemberId = b.ToMemberId, Currency = b.Currency, Amount = amount, Note = b.Note.Trim() }; db.Add(settlement); return new { settlement.Id };
    }
}
