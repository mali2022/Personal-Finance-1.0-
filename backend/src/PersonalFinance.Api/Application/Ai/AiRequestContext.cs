using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiRequestContext(string UserId, string RequestId, string LedgerId, string[] AccountIds,
    bool Restricted, string Language, string TimeZone, long? ConsentVersion = null, AiAgentConfiguration? Agent = null, bool TransmitDescriptions = false, DateTimeOffset? DataAsOf = null,
    decimal? DailyCostBudget = null, decimal? MonthlyCostBudget = null)
{
    public static string[]? LimitToConfiguration(string[]? requested, string[]? configured) {
        if (requested != null && configured != null && requested.Except(configured).Any())
            throw new ApiException(403, "查询范围超过高级设置授权", "AI_SCOPE_FORBIDDEN");
        return requested ?? configured;
    }
    public static void ValidateSelection(string[]? ids)
    {
        if (ids != null && (ids.Length < 1 || ids.Distinct(StringComparer.Ordinal).Count() != ids.Length ||
            ids.Any(id => !Guid.TryParseExact(id, "D", out _))))
            throw new ApiException(400, "请选择不重复的有效账户", "AI_SCOPE_INVALID");
    }
    public static async Task<AiRequestContext> Create(FinanceDb db, string user, string[]? selected, CancellationToken ct)
    {
        ValidateSelection(selected);
        var profile = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == user, ct)
            ?? throw new ApiException(401, "请先登录", "UNAUTHORIZED");
        var accounts = db.Accounts.AsNoTracking().Where(x => x.UserId == user);
        if (selected != null) accounts = accounts.Where(x => selected.Contains(x.Id));
        var ids = await accounts.OrderBy(x => x.Id).Select(x => x.Id).ToArrayAsync(ct);
        if (selected != null && ids.Length != selected.Length)
            throw new ApiException(403, "查询范围包含不可访问的账户", "AI_SCOPE_FORBIDDEN");
        return new(user, Guid.NewGuid().ToString(), "personal:" + user, ids, selected != null,
            profile.Language is "en" ? "en" : "zh-CN", profile.TimeZone, DataAsOf: DateTimeOffset.UtcNow);
    }
    public string[] Resolve(string? accountId)
    {
        if (accountId == null) return AccountIds;
        if (!AccountIds.Contains(accountId, StringComparer.Ordinal))
            throw new ApiException(403, "工具请求超出当前账户范围", "AI_SCOPE_FORBIDDEN");
        return [accountId];
    }
}
