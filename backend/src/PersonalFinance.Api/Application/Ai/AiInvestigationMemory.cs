using System.Text.Json.Nodes;
namespace PersonalFinance.Api.Application.Ai;
public static class AiInvestigationMemory
{
    // Keep scope/transaction anchors, never carry historical amounts forward as current facts.
    public static string Anchor(IEnumerable<AiEvidence> sources)
    {
        var list = sources.ToArray();
        var primary = list.FirstOrDefault(s => s.Tool is "GetFinancialReport" or "GetIncomeExpenseSummary");
        if (primary == null) return "";
        var ids = list.Where(s => s.Tool == "GetTransactionDetail").Select(s => s.Data?["id"]?.ToString()).Where(s => Guid.TryParse(s, out _)).Take(4);
        return "\n[调查定位，仅作范围参考，金额必须重新查询] " + primary.Start + " — " + primary.End + " " + primary.Currency + "；交易ID=" + string.Join(',', ids);
    }
    public static string Canonical(string json)
    {
        JsonNode? Order(JsonNode? n) => n switch {
            JsonObject obj => new JsonObject(obj.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => new KeyValuePair<string, JsonNode?>(p.Key, Order(p.Value)))),
            JsonArray array => new JsonArray(array.Select(Order).ToArray()), _ => n?.DeepClone()
        };
        try { return Order(JsonNode.Parse(json))?.ToJsonString() ?? json; } catch { return json; }
    }
}
