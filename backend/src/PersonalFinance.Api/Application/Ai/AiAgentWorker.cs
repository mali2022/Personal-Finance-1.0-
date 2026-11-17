using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed class AiAgentWorker(IServiceScopeFactory scopes, IOptions<AiOptions> options, ILogger<AiAgentWorker> log, AiAgentRuntime runtime) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var running = new List<Task>();
        while (!stoppingToken.IsCancellationRequested) {
            try {
                running.RemoveAll(t => t.IsCompleted);
                if (options.Value.Enabled) {
                    await ObserveCancellation(stoppingToken);
                    await Schedule(stoppingToken);
                    while (running.Count < options.Value.MaxConcurrentRequests) {
                        var scope = scopes.CreateAsyncScope();
                        try {
                            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
                            if ((await db.Database.GetPendingMigrationsAsync(stoppingToken)).Any()) { await scope.DisposeAsync(); break; }
                            var service = scope.ServiceProvider.GetRequiredService<AiAgentService>();
                            var task = await service.Claim(stoppingToken);
                            if (task == null) { await scope.DisposeAsync(); break; }
                            running.Add(Run(scope, service, task, stoppingToken));
                        } catch { await scope.DisposeAsync(); throw; }
                    }
                }
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            } catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) { log.LogWarning("AI agent dispatch failed {ErrorType}", e.GetType().Name); await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
        }
        await Task.WhenAll(running);
    }
    private async Task ObserveCancellation(CancellationToken ct)
    {
        var ids = runtime.ActiveTasks; if (ids.Length == 0) return;
        await using var scope = scopes.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        var cancelled = await db.Set<AiAgentTask>().AsNoTracking().Where(x => ids.Contains(x.Id) && (x.CancelRequested ||
            db.Set<AiAgentSetting>().Any(s => s.UserId == x.UserId && s.EmergencyStopped))).Select(x => new { x.Id, x.UserId }).ToArrayAsync(ct);
        foreach (var task in cancelled) runtime.Cancel(task.UserId, task.Id);
    }
    private async Task Run(AsyncServiceScope scope, AiAgentService service, AiAgentTask task, CancellationToken ct)
    {
        await using (scope) {
            try { await service.RunSlice(task, ct); }
            catch (Exception e) { log.LogWarning("AI agent task slice failed {TaskId} {ErrorType}; lease recovery enabled", task.Id, e.GetType().Name); }
        }
    }
    private async Task Schedule(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        if ((await db.Database.GetPendingMigrationsAsync(ct)).Any()) return;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource='ai-agent-schedule',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; IF @r<0 THROW 51000,'Agent schedule busy',1;", ct);
        var workflows = await db.Set<AiAgentWorkflow>().Where(w => w.Enabled && w.IntervalMinutes != null && w.NextRunAt <= DateTimeOffset.UtcNow)
            .OrderBy(w => w.NextRunAt).Take(100).ToArrayAsync(ct);
        foreach (var w in workflows) {
            if (await db.Set<AiAgentTask>().AnyAsync(t => t.UserId == w.UserId && t.WorkflowId == w.Id && !AiAgentService.TerminalStates.Contains(t.State), ct)) continue;
            try { await scope.ServiceProvider.GetRequiredService<AiAgentService>().Create(w.UserId,
                new(w.Prompt, AccountIds: System.Text.Json.JsonSerializer.Deserialize<string[]?>(w.AccountIdsJson)), ct, w.Id); }
            catch (ApiException e) { w.Enabled = false; db.Add(new AiAgentEvent { UserId = w.UserId, Kind = "WorkflowPaused", Detail = e.Code }); }
            w.NextRunAt = DateTimeOffset.UtcNow.AddMinutes(w.IntervalMinutes!.Value); w.Version++;
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
