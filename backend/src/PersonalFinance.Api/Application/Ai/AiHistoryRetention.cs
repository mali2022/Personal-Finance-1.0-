using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed class AiHistoryRetention(IServiceScopeFactory scopes, ILogger<AiHistoryRetention> logger, Microsoft.Extensions.Options.IOptions<AiOptions> options) : BackgroundService
{
    public static async Task<int> Purge(FinanceDb db, CancellationToken ct, int retentionDays = 90)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now.AddDays(-retentionDays);
        await using var tx = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(ct) : null;
        var expired = db.Set<AiConversation>().Where(x => x.ExpiresAt <= now).Select(x => x.Id);
        await db.Set<AiMessage>().Where(x => expired.Contains(x.ConversationId)).ExecuteDeleteAsync(ct);
        var count = await db.Set<AiConversation>().Where(x => x.ExpiresAt <= now).ExecuteDeleteAsync(ct);
        var settings = await db.Set<AiAgentSetting>().AsNoTracking().ToArrayAsync(ct);
        foreach (var setting in settings) {
            var days = System.Text.Json.JsonSerializer.Deserialize<AiAgentConfiguration>(setting.ConfigurationJson, FinanceService.Json)?.HistoryRetentionDays;
            if (days == null) continue;
            var taskCutoff = now.AddDays(-days.Value); var user = setting.UserId;
            var tasks = db.Set<AiAgentTask>().Where(t => t.UserId == user && AiAgentService.TerminalStates.Contains(t.State) && t.UpdatedAt < taskCutoff).Select(t => t.Id);
            await db.Set<AiAgentStep>().Where(s => s.UserId == user && tasks.Contains(s.TaskId)).ExecuteDeleteAsync(ct);
            await db.Set<AiAgentGrant>().Where(g => g.UserId == user && g.HighRisk && tasks.Contains(g.TaskId!)).ExecuteDeleteAsync(ct);
            await db.Set<AiAgentTask>().Where(t => tasks.Contains(t.Id)).ExecuteDeleteAsync(ct);
        }
        if (tx != null) await tx.CommitAsync(ct); return count;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        try {
            while (await timer.WaitForNextTickAsync(stoppingToken)) {
                try { using var scope = scopes.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
                    if (!(await db.Database.GetPendingMigrationsAsync(stoppingToken)).Any()) await Purge(db, stoppingToken, options.Value.ConversationRetentionDays);
                } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception e) { logger.LogWarning("AI history retention failed {ErrorType}", e.GetType().Name); }
            }
        } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
