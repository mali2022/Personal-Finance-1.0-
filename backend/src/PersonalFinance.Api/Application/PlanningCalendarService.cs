using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private sealed record CalendarItem(string Id, string RuleId, string? OccurrenceId, string Name, string Source, string Type, string AccountId, string Currency, string Amount, DateTimeOffset At, string State, string? TransactionId);
    public async Task<object> CalendarEvents(string user, IQueryCollection query)
    {
        var result = await CalendarRows(user, query); var (page, size) = Paging(query);
        return new { items = result.Skip((page - 1) * size).Take(size), total = result.Length, page, pageSize = size, scope = "周期交易、订阅及已有信用卡账期；日历查询不会创建或过账交易" };
    }
    private async Task<CalendarItem[]> CalendarRows(string user, IQueryCollection query)
    {
        var now = DateTimeOffset.UtcNow;
        Require(DateTimeOffset.TryParse(query["start"], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var start) && DateTimeOffset.TryParse(query["end"], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _), "请输入带时区的起止时间");
        var end = DateTimeOffset.Parse(query["end"]!, CultureInfo.InvariantCulture); Require(end > start && end - start <= TimeSpan.FromDays(93), "日历范围必须在93天以内");
        var account = query["accountId"].ToString(); var type = query["type"].ToString(); var state = query["state"].ToString();
        var rules = await db.RecurringRules.AsNoTracking().Where(x => x.UserId == user && (account == "" || x.AccountId == account || x.ToAccountId == account)).Take(501).ToArrayAsync(); Require(rules.Length <= 500, "请按账户缩小日历范围");
        var ids = rules.Select(x => x.Id).ToArray(); var subs = await db.Subscriptions.AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.RuleId)).ToDictionaryAsync(x => x.RuleId);
        var prices = await db.SubscriptionPrices.AsNoTracking().Where(x => x.UserId == user && subs.Values.Select(s => s.Id).Contains(x.SubscriptionId)).ToArrayAsync();
        var occurred = await db.RecurringOccurrences.AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.RuleId) && x.ScheduledAt >= start && x.ScheduledAt < end).Take(2001).ToArrayAsync(); Require(occurred.Length <= 2000, "请缩小日历范围");
        var events = new List<CalendarItem>();
        foreach (var o in occurred)
        {
            var r = rules.Single(x => x.Id == o.RuleId); var t = JsonSerializer.Deserialize<SaveTransaction>(o.PreparedPayloadJson ?? o.PayloadJson, Json)!;
            events.Add(new(o.Id, r.Id, o.Id, r.Name, subs.ContainsKey(r.Id) ? "Subscription" : "Recurring", t.Type, t.AccountId, o.Currency, o.Amount, o.ScheduledAt, o.State == "Pending" && o.ScheduledAt < now ? "Overdue" : o.State, o.TransactionId));
        }
        foreach (var r in rules.Where(x => x.State == "Active"))
        {
            var t = JsonSerializer.Deserialize<SaveTransaction>(r.PayloadJson, Json)!;
            // Cursor seeks within a bounded horizon; never create an instance while reading.
            var sequence = r.NextSequence; var seek = 0;
            if (r.Frequency is "Day" or "Week" or "Custom")
            {
                var anchor = RecurringSchedule.At(r.StartLocal, "Day", 1, 0, "Clamp", r.TimeZone)!.Value; var step = r.Interval * (r.Frequency == "Week" ? 7 : 1); sequence = Math.Max(sequence, (long)Math.Max(0, (start - anchor).TotalDays / step - 2));
            }
            else
            {
                var localStart = TimeZoneInfo.ConvertTime(start, TimeZoneInfo.FindSystemTimeZoneById(r.TimeZone)); var months = (localStart.Year - r.StartLocal.Year) * 12 + localStart.Month - r.StartLocal.Month; var step = r.Interval * (r.Frequency switch { "Quarter" => 3, "HalfYear" => 6, "Year" => 12, _ => 1 }); sequence = Math.Max(sequence, Math.Max(0, months / step - 2));
            }
            for (; seek < 400; sequence++, seek++)
            {
                var at = RecurringSchedule.At(r.StartLocal, r.Frequency, r.Interval, sequence, r.MonthEndPolicy, r.TimeZone); if (at is null) continue; if (at >= end) break;
                if (r.EndLocal is not null && at > RecurringSchedule.At(r.EndLocal.Value, "Day", 1, 0, "Clamp", r.TimeZone)) break;
                if (at < start || occurred.Any(x => x.RuleId == r.Id && x.Sequence == sequence)) continue;
                var amount = r.Amount; if (subs.TryGetValue(r.Id, out var s)) { var p = prices.Where(x => x.SubscriptionId == s.Id && x.EffectiveAt <= at).OrderByDescending(x => x.EffectiveAt).FirstOrDefault(); if (p is null) continue; amount = M(p.Amount); }
                events.Add(new(r.Id + ":" + sequence, r.Id, null, r.Name, subs.ContainsKey(r.Id) ? "Subscription" : "Recurring", t.Type, r.AccountId, r.Currency, amount, at.Value, "Planned", null));
                Require(events.Count <= 2000, "请缩小日历范围");
            }
        }
        if (type == "" || type == "CreditCardPayment")
        {
            var cards = await db.Accounts.AsNoTracking().Where(x => x.UserId == user && (x.Type == "CreditCard" || x.Type == "ConsumerCredit") && x.BillingMode=="Monthly" && x.Status == "Active" && x.StatementDay != null && x.PaymentDay != null && (account == "" || x.Id == account)).Take(101).ToArrayAsync(); Require(cards.Length <= 100, "请按账户缩小信用卡日历范围");
            foreach (var card in cards)
            {
                    var localNow = now.ToOffset(TimeSpan.FromHours(8)); var m = new DateTime(localNow.Year, localNow.Month, 1); var window = CreditStatementWindow.Create(m.Year, m.Month, card.StatementDay!.Value, card.PaymentDay!.Value);
                    if (window.StatementEndExclusive > now) { m = m.AddMonths(-1); window = CreditStatementWindow.Create(m.Year, m.Month, card.StatementDay.Value, card.PaymentDay.Value); }
                    var at = window.DueDate; if (at < start || at >= end) continue;
                    var statement = JsonSerializer.SerializeToNode(await CardStatement(user, card.Id, m.ToString("yyyy-MM")), Json)!; var amount = statement["remaining"]!.GetValue<string>(); if (Money(amount) <= 0) continue;
                    events.Add(new("card:" + card.Id + ":" + m.ToString("yyyy-MM"), card.Id, null, card.Name + " · 账期还款提醒", "CreditCard", "CreditCardPayment", card.Id, card.Currency, amount, at, at < now ? "Overdue" : "Planned", null));
            }
        }
        if (account == "" && (type == "" || type == "Festival")) {
            var festivalDocs = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == FestivalKind).OrderByDescending(x => x.CreatedAt).Take(2000).ToArrayAsync();
            foreach (var d in festivalDocs) { var b = FestivalRead(d); var at = new DateTimeOffset(b.StartsOn.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)); if (!b.Hidden && b.State != "Cancelled" && at >= start && at < end) events.Add(new("festival:" + d.Id, d.Id, null, b.Name, "Festival", "Festival", "", b.Currency, b.Budget, at, b.State, null)); }
        }
        return events.Where(x => (type == "" || x.Type == type) && (state == "" || x.State == state)).OrderBy(x => x.At).ThenBy(x => x.Id).ToArray();
    }
    public async Task<object> PlanningSummary(string user)
    {
        var now = DateTimeOffset.UtcNow; var pending = db.RecurringOccurrences.AsNoTracking().Where(x => x.UserId == user && x.State == "Pending"); var failed = db.RecurringOccurrences.AsNoTracking().Where(x => x.UserId == user && x.State == "Failed");
        var active = await db.RecurringRules.AsNoTracking().Where(x => x.UserId == user && x.State == "Active" && x.NextAt != null && x.NextAt <= now.AddDays(90)).OrderBy(x => x.NextAt).Take(501).ToArrayAsync();
        var reminders = new List<object>();
        foreach (var r in active.Where(x => x.NextAt <= now.AddDays(x.ReminderDays)).Take(10))
        {
            var amount = r.Amount; var subscription = await db.Subscriptions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.RuleId == r.Id);
            if (subscription is not null) { var price = await db.SubscriptionPrices.AsNoTracking().Where(x => x.UserId == user && x.SubscriptionId == subscription.Id && x.EffectiveAt <= r.NextAt).OrderByDescending(x => x.EffectiveAt).FirstOrDefaultAsync(); if (price is not null) amount = M(price.Amount); }
            reminders.Add(new { r.Id, r.Name, at = r.NextAt, r.Currency, amount });
        }
        reminders.AddRange(await FestivalReminders(user));
        return new { pending = await pending.CountAsync(), overdue = await pending.CountAsync(x => x.ScheduledAt < now), failed = await failed.CountAsync(), reminders, requiresConfirmation = true };
    }
}



