using Microsoft.Extensions.Caching.Memory;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public sealed class AiContextService : IDisposable
{
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = 2000 });
    // Striped gates bound memory and serialize quota checks, conversation edits and privacy changes per user.
    private readonly SemaphoreSlim[] gates = Enumerable.Range(0, 128).Select(_ => new SemaphoreSlim(1, 1)).ToArray();
    public SemaphoreSlim Gate(string user) => gates[(uint)StringComparer.Ordinal.GetHashCode(user) % gates.Length];
    public string[] Read(string user, string? id)
    {
        if (id == null) return [];
        if (!Guid.TryParseExact(id, "D", out _) || !cache.TryGetValue<string[]>(user + ":" + id, out var turns))
            throw new ApiException(404, "会话不存在或已过期", "AI_CONVERSATION_NOT_FOUND");
        return turns!;
    }
    public void Save(string user, string id, IEnumerable<string> turns, string[]? scope = null) {
        cache.Set(user + ":" + id, turns.TakeLast(8).ToArray(), new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) });
        cache.Set(user + ":scope:" + id, scope == null ? "all" : string.Join(',', scope.Order()), new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30) });
    }
    public void RequireScope(string user, string? id, string[]? scope) {
        if (id != null && cache.TryGetValue<string>(user + ":scope:" + id, out var saved) && saved != (scope == null ? "all" : string.Join(',', scope.Order())))
            throw new ApiException(409, "查询范围改变，请新建会话", "AI_SCOPE_CHANGED");
    }
    public void InvalidateUser(string user) {
        foreach (var key in cache.Keys.OfType<string>().Where(k => k.StartsWith(user + ":", StringComparison.Ordinal)).ToArray()) cache.Remove(key);
    }
    public void Delete(string user, string id) { Read(user, id); cache.Remove(user + ":" + id); cache.Remove(user + ":scope:" + id); }
    public void Dispose() { cache.Dispose(); foreach (var gate in gates) gate.Dispose(); }
}
