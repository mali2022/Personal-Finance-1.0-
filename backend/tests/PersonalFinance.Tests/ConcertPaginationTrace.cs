using System.Collections.Concurrent;
using System.Data.Common;
using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;

namespace PersonalFinance.Tests;

// Installed only in the isolated test factory. Never logs SQL, parameters, tokens or DTO content.
internal sealed class ConcertPaginationTrace : ILoggerProvider, IStartupFilter {
    readonly AsyncLocal<Sample?> current = new();
    readonly TaskCompletionSource<Sample> completed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task<Sample> Completed => completed.Task;
    public DbCommandInterceptor Commands => new CommandTrace(this);
    public DbConnectionInterceptor Connections => new ConnectionTrace(this);
    public void Mark(string name, double? duration = null) => current.Value?.Mark(name, duration);
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app => {
        app.Use(async (context, run) => {
            if(context.Request.Path != "/api/concerts/interests/purchases" || context.Request.Headers["X-Test-Pagination-Trace"] != "1") { await run(); return; }
            var sample = new Sample(); current.Value = sample;
            context.Response.OnStarting(() => { sample.Mark("response.start"); return Task.CompletedTask; });
            try { await run(); }
            finally { sample.Finish(); current.Value = null; completed.TrySetResult(sample); }
        });
        next(app);
    };
    public ILogger CreateLogger(string categoryName) => new TraceLogger(this, categoryName);
    public void Dispose() { }
    sealed class TraceLogger(ConcertPaginationTrace trace, string category) : ILogger {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Information;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState,Exception?,string> formatter) {
            if(category == "Microsoft.AspNetCore.Routing.EndpointMiddleware") trace.Mark("endpoint." + (id.Name ?? id.Id.ToString()));
            else if(category.StartsWith("Microsoft.AspNetCore.Http.Result",StringComparison.Ordinal)) trace.Mark("result." + (id.Name ?? id.Id.ToString()));
        }
    }
    internal sealed class Sample {
        readonly Stopwatch watch = Stopwatch.StartNew();
        readonly ConcurrentQueue<string> events = new();
        readonly int[] gc = [GC.CollectionCount(0), GC.CollectionCount(1), GC.CollectionCount(2)];
        readonly long allocated = GC.GetTotalAllocatedBytes(false);
        public Sample() { Mark("server.start"); }
        public void Mark(string name, double? duration = null) => events.Enqueue($"{watch.Elapsed.TotalMilliseconds:F2}ms {name}" + (duration == null ? "" : $" duration={duration:F2}ms"));
        public void Finish() {
            Mark("server.end");
            ThreadPool.GetAvailableThreads(out var available, out _);
            events.Enqueue($"runtime: threads={ThreadPool.ThreadCount}, available={available}, queued={ThreadPool.PendingWorkItemCount}, gc={GC.CollectionCount(0)-gc[0]}/{GC.CollectionCount(1)-gc[1]}/{GC.CollectionCount(2)-gc[2]}, processAllocatedDelta={GC.GetTotalAllocatedBytes(false)-allocated}");
        }
        public override string ToString() => string.Join(" | ", events);
    }
    static string Query(DbCommand command) => command.CommandText.Contains("[Sessions]",StringComparison.Ordinal) ? "session"
        : command.CommandText.Contains("COUNT(",StringComparison.OrdinalIgnoreCase) ? "count"
        : command.CommandText.Contains("FETCH NEXT",StringComparison.OrdinalIgnoreCase) ? "page" : "document";
    sealed class CommandTrace(ConcertPaginationTrace trace) : DbCommandInterceptor {
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken token = default) {
            trace.Mark("sql."+Query(command)+".start"); return ValueTask.FromResult(result);
        }
        public override ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData data, DbDataReader result, CancellationToken token = default) {
            trace.Mark("sql."+Query(command)+".executed",data.Duration.TotalMilliseconds); return ValueTask.FromResult(result);
        }
        public override InterceptionResult DataReaderDisposing(DbCommand command, DataReaderDisposingEventData data, InterceptionResult result) {
            trace.Mark("sql."+Query(command)+".reader-dispose",data.Duration.TotalMilliseconds); return result;
        }
    }
    sealed class ConnectionTrace(ConcertPaginationTrace trace) : DbConnectionInterceptor {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection, ConnectionEventData data, InterceptionResult result, CancellationToken token = default) {
            trace.Mark("connection.open.start");return ValueTask.FromResult(result);
        }
        public override Task ConnectionOpenedAsync(DbConnection connection, ConnectionEndEventData data, CancellationToken token = default) {
            trace.Mark("connection.open.end",data.Duration.TotalMilliseconds); return Task.CompletedTask;
        }
    }
}
