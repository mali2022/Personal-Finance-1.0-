using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record PhysicalValue(decimal Quantity, string State, decimal OriginalCost, decimal RemainingCost, decimal BookValue, decimal? MarketValue, decimal? NetRealizableValue, decimal? Value, decimal? ReplacementCost, DateOnly? ValuationDate, string Source, string Method);
public static class PhysicalAssetMath
{
    public static readonly string[] Methods = ["Manual", "StraightLine", "DecliningBalance", "Fixed", "Market", "QuantityPrice"];
    public static readonly string[] States = ["New", "Active", "Idle", "Lent", "Repair", "Rented", "Transferred", "Sold", "Scrapped", "Lost", "Archived"];
    public static readonly string[] Disposals = ["Transferred", "Sold", "Scrapped", "Lost"];
    public static decimal Round(decimal n) => decimal.Round(n, 2, MidpointRounding.AwayFromZero);
    public static PhysicalValue Calculate(ManagedAsset asset, PhysicalProfile? profile, IEnumerable<PhysicalValueRule> rules, IEnumerable<ManagedAssetValuation> valuations, IEnumerable<PhysicalEvent> history, DateOnly date)
    {
        var initial = profile?.Quantity ?? 1;
        var events = history.Where(x => x.Date <= date).OrderBy(x => x.Date).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id).ToArray();
        var reversed = events.Where(x => x.Kind == "Reverse").Select(x => x.ReversesId).ToHashSet();
        var effective = events.Where(x => x.Kind != "Reverse" && !reversed.Contains(x.Id)).ToArray();
        var quantity = initial - effective.Where(x => Disposals.Contains(x.Kind)).Sum(x => x.Quantity);
        var state = profile?.InitialState ?? asset.State;
        foreach (var e in effective.Where(x => States.Contains(x.Kind))) {
            if (Disposals.Contains(e.Kind)) { if (quantity == 0) state = e.Kind; }
            else state = e.Kind;
        }
        var ratio = initial == 0 ? 0 : quantity / initial;
        var cost = Round(asset.Cost * ratio);
        var rule = rules.Where(x => x.Date <= date).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).FirstOrDefault();
        var legacy = valuations.Where(x => x.Date <= date).OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).FirstOrDefault();
        // Legacy manual observations remain visible, including ones posted after a configured rule.
        if (legacy != null && (rule == null || legacy.Date > rule.Date || legacy.Date == rule.Date && legacy.CreatedAt > rule.CreatedAt))
            rule = new PhysicalValueRule { Date = legacy.Date, Amount = legacy.Amount, Method = "Manual", Source = legacy.Source };
        var activation = effective.FirstOrDefault(x => x.Kind == "Active")?.Date;
        var start = profile?.InServiceDate ?? activation ?? asset.AcquiredDate;
        var elapsed = state == "New" && activation == null && profile?.InServiceDate == null ? 0 : Math.Max(0, date.DayNumber - start.DayNumber);
        var lifeDays = Math.Max(1, start.AddMonths(rule?.LifeMonths ?? 60).DayNumber - start.DayNumber);
        var residual = rule?.Residual ?? 0;
        var book = asset.Cost;
        if (rule?.Method == "StraightLine") book = Math.Max(residual, asset.Cost - (asset.Cost - residual) * Math.Min(1m, (decimal)elapsed / lifeDays));
        if (rule?.Method == "DecliningBalance") book = elapsed >= lifeDays ? residual : Math.Max(residual, asset.Cost * (decimal)Math.Pow((double)(1 - rule.AnnualRate / 100), elapsed / 365.2425));
        book = Round(book * ratio);
        var market = rule?.MarketValue is decimal mv ? Round(mv * ratio) : (decimal?)null;
        var net = rule?.NetRealizableValue is decimal nv ? Round(nv * ratio) : (decimal?)null;
        decimal? value = rule?.Method switch {
            "StraightLine" or "DecliningBalance" => book,
            "Market" => market,
            "QuantityPrice" => rule.Amount is decimal unit ? Round(unit * quantity) : null,
            "Manual" or "Fixed" => rule.Amount is decimal amount ? Round(amount * ratio) : null,
            _ => null
        };
        if (quantity == 0 || state == "Archived") value = 0;
        return new(quantity, state, asset.Cost, cost, book, market, net, value, rule?.ReplacementCost is decimal rc ? Round(rc * ratio) : null, rule?.Date, rule?.Source ?? "未登记估值", rule?.Method ?? "Manual");
    }
}
