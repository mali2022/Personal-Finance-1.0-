using System.Globalization;
using System.Text.Json.Nodes;
namespace PersonalFinance.Api.Application.Ai;
public static class AiEvidenceConsistency
{
    public static AiEvidence? Conflict(IEnumerable<AiEvidence> sources)
    {
        var seen = new Dictionary<string, (decimal Income, decimal Expense)>();
        foreach (var source in sources.Where(s => s.Tool is "GetIncomeExpenseSummary" or "GetFinancialReport")) {
            if (source.Data is not JsonObject data) continue;
            var metrics = data["metrics"] ?? data;
            if (!decimal.TryParse(metrics["income"]?.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var income) ||
                !decimal.TryParse(metrics["expense"]?.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var expense)) continue;
            var scope = string.Join(',', (source.AccountIds ?? []).Order());
            var key = source.Start + ":" + source.End + ":" + source.Currency + ":" + scope;
            if (seen.TryGetValue(key, out var prior) && prior != (income, expense)) return source;
            seen[key] = (income, expense);
        }
        return null;
    }
}
