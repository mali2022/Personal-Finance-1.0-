using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

// Each parallel read gets a separate scoped FinanceService/DbContext. Never run EF queries
// concurrently on the conversation's DbContext, and never share cached data across requests.
public sealed class AiReadToolExecutor(IServiceScopeFactory scopes)
{
    public async Task<AiEvidence> Read(string user, string name, string arguments, AiPrivacySetting p, AiRequestContext context, CancellationToken ct)
    {
        if (context.UserId != user) throw new ApiException(403, "查询身份不一致", "AI_SCOPE_FORBIDDEN");
        if (AiAgentTools.Registry.SingleOrDefault(t => t.Name == name) is { Write: true })
            throw new ApiException(403, "只读分析不能执行财务变更，请创建待确认计划", "AI_WRITE_CONFIRMATION_REQUIRED");
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        var configuration = await db.Set<AiAgentSetting>().AsNoTracking().Where(x => x.UserId == user).Select(x => x.ConfigurationJson).SingleOrDefaultAsync(ct);
        if (configuration != null) {
            var current = JsonSerializer.Deserialize<AiAgentConfiguration>(configuration, FinanceService.Json)!;
            if (!p.FullFinancialAccess && current.AccountIds != null && context.AccountIds.Except(current.AccountIds).Any()) throw new ApiException(403, "账户范围已收窄", "AI_SCOPE_FORBIDDEN");
            if (!p.FullFinancialAccess && !current.TransmitDescriptions && (context.TransmitDescriptions || context.Agent?.TransmitDescriptions == true)) throw new ApiException(403, "描述文字授权已撤销", "AI_CONFIGURATION_CHANGED");
        }
        // Recheck revocation before every read, including cached-plan follow-ups.
        if (context.ConsentVersion is { } version && !await db.Set<AiPrivacySetting>().AsNoTracking()
            .AnyAsync(x => x.UserId == user && x.Enabled && x.ConsentVersion == version, ct))
            throw new ApiException(403, "AI授权已变化", "AI_CONSENT_CHANGED");
        var tools = scope.ServiceProvider.GetRequiredService<AiAgentTools>();
        if (AiFinancialTools.Registry.Any(t => t.Name == name)) return await tools.Read(user, name, arguments, p, context, ct);
        var watch = Stopwatch.StartNew();
        var audit = new AiToolAudit { UserId = user, RequestId = context.RequestId, Tool = AiAgentTools.Registry.Any(t => t.Name == name) ? name : "RejectedUnknownTool",
            AccountScopeJson = JsonSerializer.Serialize(context.AccountIds) };
        db.Database.SetCommandTimeout(15);
        try {
            var result = await tools.Read(user, name, arguments, p, context, ct);
            audit.Succeeded = true; audit.Start = result.Start; audit.End = result.End; audit.Currency = result.Currency;
            return result;
        }
        catch (ApiException e) { audit.ErrorCode = e.Code; throw; }
        catch (OperationCanceledException) { audit.ErrorCode = "AI_CANCELLED"; throw; }
        catch { audit.ErrorCode = "AI_TOOL_FAILED"; throw; }
        finally { audit.DurationMs = watch.ElapsedMilliseconds; db.Add(audit); await db.SaveChangesAsync(CancellationToken.None); }
    }
}
