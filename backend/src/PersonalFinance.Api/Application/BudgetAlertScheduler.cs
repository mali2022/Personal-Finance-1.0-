using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public sealed class BudgetAlertScheduler(IServiceScopeFactory scopes, IConfiguration config, ILogger<BudgetAlertScheduler> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue("Planning:AlertSchedulerEnabled", true)) return;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(60));
        do
        {
            try
            {
                var month = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"); string? cursor = null;
                while (!stoppingToken.IsCancellationRequested)
                {
                    using var lookup = scopes.CreateScope(); var db = lookup.ServiceProvider.GetRequiredService<FinanceDb>();
                    var users = await db.Budgets.AsNoTracking().Where(x => x.Month == month && (cursor == null || string.Compare(x.UserId, cursor) > 0)).OrderBy(x => x.UserId).Select(x => x.UserId).Take(100).ToArrayAsync(stoppingToken);
                    if (users.Length == 0) break;
                    foreach (var user in users)
                    {
                        try
                        {
                            using var scope = scopes.CreateScope(); var f = scope.ServiceProvider.GetRequiredService<FinanceService>(); var ctx = new DefaultHttpContext { TraceIdentifier = Guid.NewGuid().ToString() }; ctx.Items["FinanceSource"] = "System";
                            await f.Write(user, ctx, new { month, task = "BudgetAlerts" }, async () => await f.EvaluateBudgetAlerts(user, month));
                        }
                        catch (Exception e) { logger.LogError(e, "Budget alerts failed for user {UserId}; will retry", user); }
                    }
                    cursor = users[^1];
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception e) { logger.LogError(e, "Budget alert scheduler failed; will retry"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
