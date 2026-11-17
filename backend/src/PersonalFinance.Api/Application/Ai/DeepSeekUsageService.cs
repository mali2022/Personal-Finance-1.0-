using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public interface IAiUsageRecorder
{
    void AttachContext(AiRequestContext context) { }
    Task Reserve(string user, string model, string feature, int attempt, CancellationToken ct) => CheckLimit(user, ct);
    Task CheckLimit(string user, CancellationToken ct);
    Task Record(string user, string model, string feature, int attempt, JsonObject? usage, string? error);
}
public sealed class DeepSeekUsageService(FinanceDb db, IOptions<AiOptions> options) : IAiUsageRecorder
{
    private AiRequestContext? context;
    private string? reservationId;
    public void AttachContext(AiRequestContext value) => context = value;
    public async Task Reserve(string user, string model, string feature, int attempt, CancellationToken ct)
    {
        var o = options.Value;
        if (context?.ConsentVersion is { } consentVersion && !await db.Set<AiPrivacySetting>().AsNoTracking().AnyAsync(x => x.UserId == user && x.Enabled && x.ConsentVersion == consentVersion, ct))
            throw new ApiException(403, "AI授权已变化，请重新确认范围", "AI_CONSENT_CHANGED");
        decimal? boundedCost = null;
        var row = new AiUsageRecord { UserId = user, Model = model, Feature = feature, Attempt = attempt, State = "Reserved",
            ReservedCost = boundedCost, PriceCurrency = o.PriceCurrency, PriceEffectiveDate = o.PriceEffectiveDate,
            RequestId = context?.RequestId, ConfigurationVersion = AiGatewayControl.Configuration(o).Version };
        db.Add(row); await db.SaveChangesAsync(ct); reservationId = row.Id;
    }
    public Task CheckLimit(string user, CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.CompletedTask; }
    public static decimal? Estimate(AiOptions o, int? input, int? cached, int? output)
    {
        if (input is null || output is null || o.InputPricePerMillion is null || o.OutputPricePerMillion is null ||
            string.IsNullOrWhiteSpace(o.PriceEffectiveDate) || cached is > 0 && o.CachedInputPricePerMillion is null) return null;
        return ((input.Value - (cached ?? 0)) * o.InputPricePerMillion.Value +
            (cached ?? 0) * (o.CachedInputPricePerMillion ?? o.InputPricePerMillion.Value) + output.Value * o.OutputPricePerMillion.Value) / 1_000_000m;
    }
    public async Task Record(string user, string model, string feature, int attempt, JsonObject? usage, string? error)
    {
        int? Read(string key) => usage?[key] is JsonValue v && v.TryGetValue<int>(out var n) && n >= 0 ? n : null;
        var input = Read("prompt_tokens"); var output = Read("completion_tokens"); var cached = Read("prompt_cache_hit_tokens");
        if (cached > input) { input = null; cached = null; }
        var row = reservationId == null ? new AiUsageRecord { UserId = user, Model = model, Feature = feature, Attempt = attempt,
            PriceCurrency = options.Value.PriceCurrency, PriceEffectiveDate = options.Value.PriceEffectiveDate,
            RequestId = context?.RequestId, ConfigurationVersion = AiGatewayControl.Configuration(options.Value).Version } :
            await db.Set<AiUsageRecord>().SingleAsync(x => x.Id == reservationId && x.UserId == user);
        if (reservationId == null) db.Add(row);
        row.InputTokens = input; row.OutputTokens = output; row.CachedInputTokens = cached;
        row.EstimatedCost = Estimate(Rates(options.Value, model), input, cached, output); row.ErrorCode = error;
        row.State = row.EstimatedCost == null ? "Unresolved" : "Recorded"; reservationId = null;
        await db.SaveChangesAsync(CancellationToken.None);
    }
    public async Task<object> History(string user, CancellationToken ct) => new {
        items = await db.Set<AiUsageRecord>().AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.RequestedAt).Take(100).ToArrayAsync(ct),
        costNote = "费用仅按配置费率估算；未知Usage不算零费用。费用统计不影响任务执行，不代表上游实际账单。" };
    private static AiOptions Rates(AiOptions o, string model)
    {
        var m = o.Models.SingleOrDefault(x => x.Id == model);
        return m == null ? o : new AiOptions { InputPricePerMillion = m.InputPricePerMillion, OutputPricePerMillion = m.OutputPricePerMillion,
            CachedInputPricePerMillion = m.InputPricePerMillion, PriceEffectiveDate = o.PriceEffectiveDate, PriceCurrency = o.PriceCurrency };
    }
}
