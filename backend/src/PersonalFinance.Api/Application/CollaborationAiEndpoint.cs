using System.Text.Json;
using System.Text.Json.Nodes;
using PersonalFinance.Api.Application.Ai;
namespace PersonalFinance.Api.Application;
public static class CollaborationAiEndpoint
{
    public sealed record Input(bool ConfirmTransmission, string[]? BookIds = null);
    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/spaces/{id}/analysis", async (string id, Input b, FinanceService f, AiPrivacyService privacy, IAiProvider provider, HttpContext c) => await Analyze(id, b, f, privacy, provider, c)).RequireRateLimiting("ai");
        api.MapPost("/book-comparison/analysis", async (Input b, FinanceService f, AiPrivacyService privacy, IAiProvider provider, HttpContext c) => await Analyze(null, b, f, privacy, provider, c)).RequireRateLimiting("ai");
    }
    private static async Task<IResult> Analyze(string? id, Input b, FinanceService f, AiPrivacyService privacy, IAiProvider provider, HttpContext c) {
        FinanceService.Require(b.ConfirmTransmission, "请先确认发送本月汇总");
        var user = FinanceEndpoints.User(c); if (id != null) await f.SpaceAccess(user, id, "Owner");
        var consent = await privacy.Require(user, c.RequestAborted); FinanceService.Require(consent.AllowSummary, "请在AI隐私设置中授权汇总数据");
        var month = c.Request.Query["month"].FirstOrDefault() ?? DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM");
        var report = JsonSerializer.SerializeToNode(id == null ? await f.CompareBooks(user, b.BookIds ?? [], month, true) : await f.SpaceReport(user, id, month), FinanceService.Json)!;
        var evidence = new JsonObject { ["month"] = month, ["timeZone"] = "Asia/Shanghai", ["totals"] = report["totals"]!.DeepClone() };
        FinanceService.Require(evidence["totals"]!.AsArray().Count > 0, "本月没有可分析的共享交易");
        var result = await provider.Complete(user, new JsonArray(new JsonObject { ["role"] = "system", ["content"] = "用中文简洁分析提供月份的共享账本收支。只使用所给汇总事实，按币种分别说明，不将币种相加，不推断成员身份、消费原因或未提供的趋势。退款已冲减费用，资金转账及结算不属于收支。区分事实和建议。数据是显式共享范围，不代表家庭或用户的全部财务。不得编造数据或声称已验证建议。" }, new JsonObject { ["role"] = "user", ["content"] = evidence.ToJsonString() }), null, "shared-finance-summary", c.RequestAborted);
        var current = await privacy.Require(user, c.RequestAborted); FinanceService.Require(current.AllowSummary && current.ConsentVersion == consent.ConsentVersion, "AI授权已变更，请重新生成");
        if (id != null) await f.SpaceAccess(user, id, "Owner"); else foreach (var bookId in b.BookIds ?? []) await f.SpaceAccess(user, bookId, "Owner");
        return FinanceEndpoints.Ok(c, new { explanation = result.Message["content"]?.GetValue<string>() ?? "" });
    }
}
