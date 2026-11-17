using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed class DeepSeekToolDispatcher(AiFinancialTools tools, FinanceDb db, IOptions<AiOptions> options)
{
    public Task<AiRequestContext> CreateContext(string user, string[]? accounts, CancellationToken ct) => AiRequestContext.Create(db, user, accounts, ct);
    public async Task<AiEvidence> Dispatch(string user, string name, string arguments, AiPrivacySetting privacy, CancellationToken ct, AiRequestContext? context = null)
    {
        var timer = System.Diagnostics.Stopwatch.StartNew();
        var audit = new AiToolAudit { UserId = user, Tool = AiFinancialTools.Registry.Any(x => x.Name == name) ? name : "RejectedUnknownTool",
            RequestId = context?.RequestId, AccountScopeJson = context == null ? null : System.Text.Json.JsonSerializer.Serialize(context.AccountIds) };
        var timeout = db.Database.GetCommandTimeout();
        try {
            var b = AiFinancialTools.Validate(name, arguments, options.Value, privacy);
            if (context?.ConsentVersion is { } consentVersion && !await db.Set<AiPrivacySetting>().AsNoTracking().AnyAsync(x => x.UserId == user && x.Enabled && x.ConsentVersion == consentVersion, ct))
                throw new PersonalFinance.Api.Contracts.ApiException(403, "AI授权已变化，请重新确认范围", "AI_CONSENT_CHANGED");
            audit.Start = b.Start; audit.End = b.End; audit.Currency = b.Currency;
            db.Database.SetCommandTimeout(15);
            var result = await tools.Execute(user, name, b, ct, context); audit.Succeeded = true; return result;
        }
        catch (PersonalFinance.Api.Contracts.ApiException e) { audit.ErrorCode = e.Code; throw; }
        catch (OperationCanceledException) { audit.ErrorCode = "AI_CANCELLED"; throw; }
        catch { audit.ErrorCode = "AI_TOOL_FAILED"; throw; }
        finally { audit.DurationMs = timer.ElapsedMilliseconds; db.Database.SetCommandTimeout(timeout); db.Add(audit); await db.SaveChangesAsync(CancellationToken.None); }
    }
}
