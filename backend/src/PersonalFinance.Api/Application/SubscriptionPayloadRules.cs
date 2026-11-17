using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public static class SubscriptionPayloadRules
{
    public static void ValidateFixedSplits(SaveTransaction payload, IEnumerable<SubscriptionPrice> prices, DateTimeOffset? nextAt)
    {
        if (payload.Splits is not { Length: > 0 } || nextAt is null) return;
        var history = prices.OrderByDescending(x => x.EffectiveAt).ToArray();
        var current = history.FirstOrDefault(x => x.EffectiveAt <= nextAt);
        var pending = history.Where(x => x.EffectiveAt > nextAt).Concat(current is null ? [] : new[] { current });
        FinanceService.Require(pending.All(x => x.Amount == FinanceService.Money(payload.Amount)),
            "尚未生成的订阅价格与固定拆分金额不同，请取消固定拆分并选择单一分类，或建立独立订阅；已生成实例和历史价格保持不变");
    }

    public static SaveTransaction AtPrice(SaveTransaction payload, decimal price)
    {
        FinanceService.Require(payload.Splits is not { Length: > 0 } || payload.Splits.Sum(x => FinanceService.Money(x.Amount, true)) == price,
            "订阅该期价格与固定拆分金额不同，请先在订阅管理中取消固定拆分并选择单一分类，再生成实例；历史价格保持不变");
        return payload with { Amount = FinanceService.M(price) };
    }
}
