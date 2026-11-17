using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public static class PlanningMath
{
    public static decimal[] WeightedMonths(decimal total, decimal[] weights)
    {
        FinanceService.Require(weights.Length == 12 && weights.All(w => w >= 0), "历史权重无效");
        if (weights.Sum() == 0) return EvenMonths(total);
        FinanceService.Require(total >= 0 && decimal.Round(total, 2) == total, "年度金额无效");
        var sum = weights.Sum(); var exact = weights.Select(w => w / sum * total * 100).ToArray(); var cents = exact.Select(decimal.Floor).ToArray();
        var remaining = total * 100 - cents.Sum();
        foreach (var i in Enumerable.Range(0, 12).OrderByDescending(i => exact[i] - cents[i]).ThenBy(i => i).Take((int)remaining)) cents[i]++;
        return cents.Select(x => x / 100).ToArray();
    }
    public static decimal[] EvenMonths(decimal total)
    {
        FinanceService.Require(total >= 0 && decimal.Round(total, 2) == total, "年度金额无效");
        var cents = total * 100m;
        var each = decimal.Floor(cents / 12m);
        var remainder = cents - each * 12m;
        return Enumerable.Range(0, 12).Select(i => (each + (i < remainder ? 1 : 0)) / 100m).ToArray();
    }
    public static decimal Carryover(decimal remaining, string rule, decimal parameter, decimal? cap, bool negative)
    {
        FinanceService.Require(rule is "None" or "Full" or "Fixed" or "Percent" && parameter >= 0 && (!cap.HasValue || cap >= 0) && (rule != "Percent" || parameter <= 100), "结转规则或参数无效");
        if (remaining < 0) return negative ? remaining : 0;
        var value = rule switch
        {
            "None" => 0,
            "Full" => remaining,
            "Fixed" => Math.Min(remaining, parameter),
            "Percent" when parameter <= 100 => decimal.Floor(remaining * parameter) / 100m,
            _ => throw new ApiException(422, "结转规则无效")
        };
        return cap.HasValue ? Math.Min(value, cap.Value) : value;
    }
}
