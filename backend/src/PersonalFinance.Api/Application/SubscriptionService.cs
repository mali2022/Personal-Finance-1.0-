using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private static object PriceDto(SubscriptionPrice p) => new { p.Id, amount = M(p.Amount), p.Currency, p.EffectiveAt, p.CreatedAt };
    private async Task<object> SubscriptionDto(Subscription s)
    {
        var prices = await db.SubscriptionPrices.AsNoTracking().Where(x => x.SubscriptionId == s.Id && x.UserId == s.UserId).OrderByDescending(x => x.EffectiveAt).ToArrayAsync();
        var current = prices.FirstOrDefault(x => x.EffectiveAt <= DateTimeOffset.UtcNow);
        return new { s.Id, s.Name, s.Provider, s.State, s.AutoRenew, s.CancelledAt, s.ServiceEndsAt, s.Note, s.CreatedAt, s.UpdatedAt, version = s.Version.ToString(), rule = RecurringDto(await Recurring(s.UserId, s.RuleId)), prices = prices.Select(PriceDto), currentPrice = current is null ? null : PriceDto(current) };
    }
    public async Task<object> Subscriptions(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var state = query["state"].ToString(); var q = db.Subscriptions.AsNoTracking().Where(x => x.UserId == user && (state == "" || x.State == state));
        var total = await q.CountAsync(); var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(); var items = new List<object>(); foreach (var s in rows) items.Add(await SubscriptionDto(s)); return new { items, total, page, pageSize = size };
    }
    public async Task<object> SaveSubscription(string user, SubscriptionInput input, string? id, string? version)
    {
        Require(input.Name.Trim().Length is > 0 and <= 150 && input.Provider.Length <= 150 && input.Note.Length <= 2000, "名称、服务商或备注长度无效");
        Require(input.State is "Active" or "Paused" or "CancelledUntilEnd" or "Ended", "订阅状态无效");
        Require(input.Rule.Transaction.Type == "Expense", "订阅只支持支出计划");
        Require(input.State != "CancelledUntilEnd" || input.ServiceEndsAt > DateTimeOffset.UtcNow, "取消续费但服务未到期时，请填写未来的服务到期时间");
        Require(id is not null || input.State is "Active" or "Paused", "新订阅只能创建为活跃或暂停");
        var s = id is null ? new Subscription { UserId = user } : await db.Subscriptions.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "订阅不存在");
        if (id is not null) { Version(s, version); Require(s.State is not ("CancelledUntilEnd" or "Ended"), "已取消订阅请创建新订阅，保留价格历史"); s.Version++; }
        var state = input.State == "Active" && input.AutoRenew ? "Active" : "Paused";
        var ruleInput = input.Rule with { Name = input.Name, State = state };
        RecurringRule rule;
        if (id is null)
        {
            var result = await SaveRecurring(user, ruleInput, null, null); var ruleId = JsonSerializer.SerializeToNode(result, Json)!["id"]!.GetValue<string>(); rule = db.RecurringRules.Local.Single(x => x.Id == ruleId); s.RuleId = ruleId; db.Subscriptions.Add(s);
            var at = RecurringSchedule.At(rule.StartLocal, "Day", 1, 0, "Clamp", rule.TimeZone)!.Value;
            db.SubscriptionPrices.Add(new() { UserId = user, SubscriptionId = s.Id, Amount = Money(ruleInput.Transaction.Amount, true), Currency = rule.Currency, EffectiveAt = at });
        }
        else
        {
            rule = await Recurring(user, s.RuleId); Require(rule.Currency == input.Rule.Currency, "订阅币种不可改变，请建立新订阅");
            var original = JsonSerializer.Deserialize<SaveTransaction>(rule.PayloadJson, Json)!;
            var prices = await db.SubscriptionPrices.AsNoTracking().Where(x => x.SubscriptionId == s.Id && x.UserId == user).ToListAsync();
            SubscriptionPrice? newPrice = null;
            if (Money(original.Amount) != Money(ruleInput.Transaction.Amount))
            {
                var effective = input.PriceEffectiveAt ?? DateTimeOffset.UtcNow; Require(effective >= DateTimeOffset.UtcNow.AddSeconds(-5), "费用变更不能追溯覆盖历史价格");
                Require(!await db.SubscriptionPrices.AnyAsync(x => x.SubscriptionId == s.Id && x.EffectiveAt == effective), "该时间已存在价格记录");
                newPrice = new SubscriptionPrice { UserId = user, SubscriptionId = s.Id, Amount = Money(ruleInput.Transaction.Amount, true), Currency = rule.Currency, EffectiveAt = effective };
                prices.Add(newPrice);
            }
            if (input.State is "Active" or "Paused") SubscriptionPayloadRules.ValidateFixedSplits(ruleInput.Transaction, prices, rule.NextAt);
            if (newPrice is not null) db.SubscriptionPrices.Add(newPrice);
            await SaveRecurring(user, ruleInput, rule.Id, rule.Version.ToString(), true);
        }
        s.Name = input.Name.Trim(); s.Provider = input.Provider.Trim(); s.State = input.State; s.AutoRenew = input.AutoRenew; s.ServiceEndsAt = input.ServiceEndsAt; s.Note = input.Note; s.UpdatedAt = DateTimeOffset.UtcNow;
        if (input.State is "CancelledUntilEnd" or "Ended") { s.CancelledAt = DateTimeOffset.UtcNow; await RuleAction(user, rule.Id, new("Cancel", "订阅取消续费"), rule.Version.ToString(), true); }
        // Newly added rows are included before SaveChanges by the outer atomic Write.
        var history = await db.SubscriptionPrices.Where(x => x.SubscriptionId == s.Id).ToListAsync(); history.AddRange(db.SubscriptionPrices.Local.Where(x => x.SubscriptionId == s.Id && !history.Any(h => h.Id == x.Id)));
        return new { s.Id, s.Name, s.Provider, s.State, s.AutoRenew, s.ServiceEndsAt, s.Note, version = s.Version.ToString(), rule = RecurringDto(rule), prices = history.OrderByDescending(x => x.EffectiveAt).Select(PriceDto) };
    }
}
