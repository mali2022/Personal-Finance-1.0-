using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public interface IAiProvider
{
    void EnsureAvailable();
    void AttachContext(AiRequestContext context) { }
    Task<DeepSeekCompletion> Complete(string user, System.Text.Json.Nodes.JsonArray messages, System.Text.Json.Nodes.JsonArray? tools,
        string feature, CancellationToken ct, bool json = false, bool reasoning = false, Func<string, Task>? onDelta = null);
}
public sealed class AiGatewayControl(IOptions<AiOptions> options) : IDisposable
{
    private readonly SemaphoreSlim gate = new(options.Value.MaxConcurrentRequests);
    public async Task<IDisposable> Acquire(CancellationToken ct)
    {
        if (!await gate.WaitAsync(0, ct)) throw new ApiException(429, "AI并发已满，请稍后重试", "AI_BUSY");
        return new Lease(gate);
    }
    private sealed class Lease(SemaphoreSlim gate) : IDisposable
    {
        private int released;
        public void Dispose() { if (Interlocked.Exchange(ref released, 1) == 0) gate.Release(); }
    }
    public static (string Version, string Json) Configuration(AiOptions o)
    {
        // Deliberately exclude BaseUrl credentials, API key and all user content.
        var json = JsonSerializer.Serialize(new { buildVersion = typeof(IAiProvider).Assembly.ManifestModule.ModuleVersionId.ToString(), o.Provider, o.ConfigurationVersion, o.DeepSeek.Model, o.DeepSeek.ReasoningModel,
            o.DeepSeek.SupportsTools, o.DeepSeek.SupportsJson, o.DeepSeek.SupportsStreaming, o.DeepSeek.EnableReasoningTools,
            o.DeepSeek.MaxOutputTokens, o.DeepSeek.TimeoutSeconds, o.DeepSeek.MaxRetries, o.TotalTimeoutSeconds, o.Models, o.ModelContextTokens,
            o.MaxTaskSeconds,
            o.MaxRecords, o.MaxContextBytes, o.MaxConcurrentRequests, o.ConversationRetentionDays,
            o.ReadParallelism, o.RepeatedQueryLimit, o.ToolTimeoutSeconds,
            o.InputPricePerMillion, o.CachedInputPricePerMillion, o.OutputPricePerMillion, o.PriceCurrency, o.PriceEffectiveDate });
        return (Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))), json);
    }
    public void Dispose() => gate.Dispose();
}
