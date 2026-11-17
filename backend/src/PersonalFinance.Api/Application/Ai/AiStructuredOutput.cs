using System.Text.Json.Nodes;
namespace PersonalFinance.Api.Application.Ai;
public static class AiStructuredOutput
{
    public static JsonObject Definition()
    {
        var result = JsonNode.Parse("""
        {"type":"function","function":{"name":"SubmitAnalysis","description":"完成调查后提交结构化分析。只能引用本次依据e0/e1等；解释与建议不直接执行财务变更。数值卡和图表由服务器生成，不接受模型计算的金额。","parameters":{"type":"object","additionalProperties":false,"properties":{"executiveSummary":{"type":"string"},"insights":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"title":{"type":"string"},"text":{"type":"string"},"status":{"type":"string","enum":["inference","hypothesis"]},"evidenceIds":{"type":"array","items":{"type":"string"}},"followUp":{"type":["string","null"]}},"required":["title","text","status","evidenceIds"]}},"recommendations":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"title":{"type":"string"},"text":{"type":"string"},"status":{"type":"string","enum":["recommendation"]},"evidenceIds":{"type":"array","items":{"type":"string"}},"followUp":{"type":["string","null"]}},"required":["title","text","status","evidenceIds"]}},"limitations":{"type":"array","items":{"type":"string"}}},"required":["executiveSummary","insights","recommendations","limitations"]}}}
        """)!.AsObject();
        foreach (var key in new[] { "insights", "recommendations" })
            result["function"]!["parameters"]!["properties"]![key]!["items"]!["properties"]!["priority"] =
                new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("urgent", "attention", "long-term") };
        return result;
    }
}
