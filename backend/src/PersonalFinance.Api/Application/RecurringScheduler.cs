using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;

public sealed class RecurringScheduler(IServiceScopeFactory scopes, IConfiguration config, ILogger<RecurringScheduler> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue("Automation:SchedulerEnabled", true)) return;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(60));
        do
        {
            try
            {
                string? cursor = null;
                while (!stoppingToken.IsCancellationRequested)
                {
                    using var lookup = scopes.CreateScope(); var db = lookup.ServiceProvider.GetRequiredService<FinanceDb>();
                    var now = DateTimeOffset.UtcNow;
                    var candidates = db.RecurringRules.Where(r => r.State == "Active" && r.NextAt <= now).Select(r => r.UserId).Union(db.Subscriptions.Where(s => s.State == "CancelledUntilEnd" && s.ServiceEndsAt <= now).Select(s => s.UserId));
                    var users = await candidates.Where(x => cursor == null || string.Compare(x, cursor) > 0).OrderBy(x => x).Take(100).ToArrayAsync(stoppingToken);
                    if (users.Length == 0) break;
                    foreach (var user in users)
                    {
                        try
                        {
                            using var scope = scopes.CreateScope(); var f = scope.ServiceProvider.GetRequiredService<FinanceService>(); var ctx = new DefaultHttpContext(); ctx.Items["FinanceSource"] = "System"; ctx.TraceIdentifier = Guid.NewGuid().ToString();
                            await f.Write(user, ctx, new { task = "RecurringGenerate" }, async () => await f.GenerateOccurrences(user, DateTimeOffset.UtcNow, "System"));
                        }
                        catch (Exception error) { logger.LogError(error, "Recurring generation failed for user {UserId}", user); }
                    }
                    cursor = users[^1];
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogError(error, "Recurring scheduler failed; will retry next minute"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
