using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Infrastructure;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private sealed class KeywordFlight
    {
        public required CancellationTokenSource Cancellation { get; init; }
        public required Task<object> Task { get; init; }
        public int Waiters;
    }
    private static readonly Dictionary<string, KeywordFlight> KeywordFlights = new();

    // Only concurrent identical requests share work. No completed financial response is cached.
    public async Task<object> Transactions(string user, IQueryCollection query, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query["keyword"]) || db.Database.CurrentTransaction != null) return await TransactionsUnshared(user, query, ct);
        var values = query.ToDictionary(p => p.Key, p => new StringValues(p.Value.ToArray()), StringComparer.OrdinalIgnoreCase);
        var canonical = JsonSerializer.Serialize(values.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase).Select(p => new { key = p.Key.ToLowerInvariant(), values = p.Value.ToArray() }));
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(db.Database.GetConnectionString() + "\n" + user + "\n" + canonical)));
        KeywordFlight? flight;
        lock (KeywordFlights)
        {
            KeywordFlights.TryGetValue(key, out flight);
            if (flight?.Task.IsCompleted == true) { KeywordFlights.Remove(key); flight = null; }
            if (flight == null && KeywordFlights.Count < 128)
            {
                var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(15));
                var completion = new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
                flight = new KeywordFlight { Task = completion.Task, Cancellation = cancellation };
                _ = Task.Run(async () => { try {
                    using var scope = scopes.CreateScope();
                    var service = scope.ServiceProvider.GetRequiredService<FinanceService>();
                    var scopedDb = scope.ServiceProvider.GetRequiredService<FinanceDb>();
                    var token = cancellation.Token;
                    // Same user lock used by FinanceService.Write. Writes cannot commit between
                    // the count, page selection, balance projection and shared result publication.
                    await using var transaction = await scopedDb.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, token);
                    var resource = "finance-user:" + user;
                    await scopedDb.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Shared',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Finance read lock timeout',1;", token);
                    var result = await service.TransactionsUnshared(user, new QueryCollection(values), token);
                    // Publish while the shared user lock is still held. Disposing this
                    // read-only transaction then releases it; there are no changes to commit.
                    completion.TrySetResult(result);
                } catch (OperationCanceledException) { completion.TrySetException(new PersonalFinance.Api.Contracts.ApiException(504,"交易搜索超时或已取消，请缩小日期或账户范围后重试","SEARCH_TIMEOUT")); }
                  catch (Exception error) { completion.TrySetException(error); }
                });
                KeywordFlights.Add(key, flight);
                var owned = flight;
                _ = flight.Task.ContinueWith(completed => {
                    _ = completed.Exception; // Observe failures even when all request waiters cancel.
                    lock (KeywordFlights) {
                        if (KeywordFlights.TryGetValue(key, out var current) && ReferenceEquals(current, owned)) KeywordFlights.Remove(key);
                        if (owned.Waiters == 0) owned.Cancellation.Dispose();
                    }
                }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
            if (flight != null) flight.Waiters++;
        }
        if (flight == null) return await TransactionsUnshared(user, query, ct);
        try { return await flight.Task.WaitAsync(ct); }
        finally {
            lock (KeywordFlights) {
                flight.Waiters--;
                if (flight.Waiters == 0) {
                    if (KeywordFlights.TryGetValue(key, out var current) && ReferenceEquals(current, flight)) KeywordFlights.Remove(key);
                    if (!flight.Task.IsCompleted) flight.Cancellation.Cancel(); else flight.Cancellation.Dispose();
                }
            }
        }
    }
}
