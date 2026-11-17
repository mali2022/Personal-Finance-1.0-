using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiPrivacyInput(bool Enabled, bool AllowSummary, bool AllowDetails, bool AllowPayroll, bool AllowFamily, bool AllowRecognitionText, bool SaveHistory = false, bool PersonalReadAccess = true, bool FullFinancialAccess = false);
public sealed class AiPrivacyService(FinanceDb db, AiContextService? contexts = null)
{
    public static AiPrivacySetting Effective(AiPrivacySetting p)
    {
        if (p.Enabled && p.FullFinancialAccess) { p.AllowSummary = p.AllowDetails = p.AllowPayroll = p.AllowFamily = p.AllowRecognitionText = true; }
        if (p.Enabled && p.PersonalReadAccess) { p.AllowSummary = true; p.AllowDetails = true; p.AllowPayroll = true; }
        return p;
    }
    public async Task<AiPrivacySetting> Get(string user, CancellationToken ct) => Effective(
        await db.Set<AiPrivacySetting>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user, ct) ?? new() { UserId = user });
    public async Task<AiPrivacySetting> Save(string user, AiPrivacyInput b, CancellationToken ct, string traceId = "")
    {
        var row = await db.Set<AiPrivacySetting>().SingleOrDefaultAsync(x => x.UserId == user, ct);
        if (row == null) { row = new() { UserId = user }; db.Add(row); }
        var before = System.Text.Json.JsonSerializer.Serialize(row);
        row.Enabled = b.Enabled; row.AllowSummary = b.AllowSummary; row.AllowDetails = b.AllowDetails;
        row.FullFinancialAccess = b.FullFinancialAccess;
        row.PersonalReadAccess = b.PersonalReadAccess;
        row.AllowPayroll = b.AllowPayroll; row.AllowFamily = b.AllowFamily; row.AllowRecognitionText = b.AllowRecognitionText;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        row.SaveHistory = b.SaveHistory;
        row.ConsentVersion++;
        {
            await db.Set<AiAgentTask>().Where(x => x.UserId == user && !AiAgentService.TerminalStates.Contains(x.State)).ExecuteUpdateAsync(s =>
                s.SetProperty(t => t.CancelRequested, true).SetProperty(t => t.State, "Cancelled").SetProperty(t => t.ErrorCode, "AI_CONSENT_CHANGED")
                    .SetProperty(t => t.CompletedAt, DateTimeOffset.UtcNow).SetProperty(t => t.Version, t => t.Version + 1), ct);
            await db.Set<AiAgentWorkflow>().Where(x => x.UserId == user && x.Enabled).ExecuteUpdateAsync(s => s.SetProperty(w => w.Enabled, false).SetProperty(w => w.Version, w => w.Version + 1), ct);
        }
        db.Add(new AuditRecord { UserId = user, ResourceType = "AiPrivacySetting", ResourceId = user, Action = "UpdateConsent",
            TraceId = traceId, ChangesJson = System.Text.Json.JsonSerializer.Serialize(new { before, after = row }), Source = "User" });
        await db.SaveChangesAsync(ct); contexts?.InvalidateUser(user); return row;
    }
    public async Task<AiPrivacySetting> Require(string user, CancellationToken ct)
    {
        var p = await Get(user, ct);
        if (!p.Enabled) throw new ApiException(403, "请先开启 AI 并确认云端数据传输范围", "AI_CONSENT_REQUIRED");
        return p;
    }
}
