using System.Collections.Concurrent;
namespace PersonalFinance.Api.Application.Ai;

public sealed class AiAgentRuntime
{
    private readonly ConcurrentDictionary<string, (string User, CancellationTokenSource Source)> tasks = new();
    public IDisposable Register(string user, string task, CancellationTokenSource source)
    {
        tasks[task] = (user, source); return new Lease(() => tasks.TryRemove(new KeyValuePair<string, (string, CancellationTokenSource)>(task, (user, source))));
    }
    public void Cancel(string user, string? task = null)
    {
        foreach (var pair in tasks.Where(x => x.Value.User == user && (task == null || task == x.Key)))
            try { pair.Value.Source.Cancel(); } catch (ObjectDisposedException) { }
    }
    public string[] ActiveTasks => tasks.Keys.ToArray();
    private sealed class Lease(Action remove) : IDisposable { public void Dispose() => remove(); }
}
