using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiModelRegistration(string Id, int ContextTokens, int MaxOutputTokens, bool SupportsTools = true,
    bool Reasoning = false, decimal? InputPricePerMillion = null, decimal? OutputPricePerMillion = null);
public sealed record AiAgentConfiguration
{
    public string Mode { get; init; } = "Suggest";
    public string? Model { get; init; }
    public int ContextTokens { get; init; } = 60000;
    public int OutputTokens { get; init; } = 4096;
    public int TokenBudget { get; init; } = 250000;
    public int ToolBudget { get; init; } = 128;
    public int ModelCallBudget { get; init; } = 64;
    public int TimeoutSeconds { get; init; } = 1800;
    public int ConcurrentTasks { get; init; } = 2;
    public int MaxRetries { get; init; } = 3;
    public decimal? DailyCostBudget { get; init; }
    public decimal? MonthlyCostBudget { get; init; }
    public string[]? AccountIds { get; init; }
    public bool MemoryEnabled { get; init; }
    public bool TransmitDescriptions { get; init; }
    public int? HistoryRetentionDays { get; init; }
    public string Persona { get; init; } = "";
    public string Style { get; init; } = "";
    public string DetailLevel { get; init; } = "Detailed";
    public string AnalysisDepth { get; init; } = "";
    public string ClassificationPreferences { get; init; } = "";
    public string StatisticalPreferences { get; init; } = "";
    public string ReminderRules { get; init; } = "";
    public string ReportTemplate { get; init; } = "";
    public string AnalysisPeriod { get; init; } = "";
}
public sealed class AiAgentConfigurationService(FinanceDb db, IOptions<AiOptions> options)
{
    public AiModelRegistration[] Models => options.Value.Models.Length > 0 ? options.Value.Models :
        [new(options.Value.DeepSeek.Model, options.Value.ModelContextTokens, options.Value.DeepSeek.MaxOutputTokens,
            options.Value.DeepSeek.SupportsTools, false, options.Value.InputPricePerMillion, options.Value.OutputPricePerMillion),
         new(options.Value.DeepSeek.ReasoningModel, options.Value.ModelContextTokens, options.Value.DeepSeek.MaxOutputTokens,
            options.Value.DeepSeek.EnableReasoningTools, true, options.Value.InputPricePerMillion, options.Value.OutputPricePerMillion)];
    public async Task<(AiAgentSetting? Row, AiAgentConfiguration Config)> Get(string user, CancellationToken ct)
    {
        var row = await db.Set<AiAgentSetting>().SingleOrDefaultAsync(x => x.UserId == user, ct);
        return (row, row == null ? new AiAgentConfiguration { Model = options.Value.DeepSeek.Model,
            ContextTokens = Math.Min(60000, options.Value.ModelContextTokens - options.Value.DeepSeek.MaxOutputTokens),
            OutputTokens = options.Value.DeepSeek.MaxOutputTokens } : JsonSerializer.Deserialize<AiAgentConfiguration>(row.ConfigurationJson, FinanceService.Json)!);
    }
    public async Task<AiAgentConfiguration> Validate(string user, AiAgentConfiguration value, CancellationToken ct)
    {
        var o = options.Value;
        var model = Models.SingleOrDefault(x => x.Id == (value.Model ?? o.DeepSeek.Model))
            ?? throw new ApiException(422, "模型未在服务端注册", "AI_MODEL_UNREGISTERED");
        if (value.Mode is not ("Suggest" or "Confirm" or "Auto") || value.ContextTokens < 1024 ||
            value.OutputTokens < 128 || value.OutputTokens > model.MaxOutputTokens || value.ContextTokens + (long)value.OutputTokens > model.ContextTokens ||
            value.ConcurrentTasks < 1 || value.ConcurrentTasks > o.MaxConcurrentRequests || value.TimeoutSeconds < 10 || value.TimeoutSeconds > o.MaxTaskSeconds ||
            value.MaxRetries < 0 || value.MaxRetries > 10 || value.HistoryRetentionDays is < 1 or > 36500 ||
            value.DetailLevel is not ("Concise" or "Standard" or "Detailed"))
            throw new ApiException(422, "AI配置超出模型容量或运行时安全限额", "AI_CONFIGURATION_INVALID");
        if (new[] { value.Persona, value.Style, value.AnalysisDepth, value.ClassificationPreferences, value.StatisticalPreferences,
            value.ReminderRules, value.ReportTemplate, value.AnalysisPeriod }.Any(s => s == null || s.Length > 20000))
            throw new ApiException(422, "个性化配置过长", "AI_CONFIGURATION_INVALID");
        if (value.AccountIds != null) await AiRequestContext.Create(db, user, value.AccountIds, ct);
        return value with { Model = model.Id, DailyCostBudget = null, MonthlyCostBudget = null };
    }
    public async Task<object> Save(string user, AiAgentConfiguration value, string? version, CancellationToken ct)
    {
        value = await Validate(user, value, ct);
        var (row, _) = await Get(user, ct);
        if (row == null) { if (version is not (null or "0")) throw new ApiException(409, "配置版本冲突", "VERSION_CONFLICT"); row = new() { UserId = user }; db.Add(row); }
        else FinanceService.Version(row, version);
        var previous = JsonSerializer.Deserialize<AiAgentConfiguration>(row.ConfigurationJson, FinanceService.Json) ?? new();
        var narrowed = previous.TransmitDescriptions && !value.TransmitDescriptions || previous.MemoryEnabled && !value.MemoryEnabled ||
            value.AccountIds != null && (previous.AccountIds == null || previous.AccountIds.Except(value.AccountIds).Any()) || previous.Mode != value.Mode;
        if (narrowed) await db.Set<AiAgentTask>().Where(x => x.UserId == user && !AiAgentService.TerminalStates.Contains(x.State))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.CancelRequested, true).SetProperty(t => t.State, "Cancelled").SetProperty(t => t.ErrorCode, "AI_CONFIGURATION_CHANGED")
                .SetProperty(t => t.CompletedAt, DateTimeOffset.UtcNow).SetProperty(t => t.Version, t => t.Version + 1), ct);
        row.ConfigurationJson = JsonSerializer.Serialize(value, FinanceService.Json); row.Version++; row.UpdatedAt = DateTimeOffset.UtcNow;
        foreach (var conversation in await db.Set<AiConversation>().Where(x => x.UserId == user).ToArrayAsync(ct)) {
            conversation.ExpiresAt = value.HistoryRetentionDays is { } days ? conversation.UpdatedAt.AddDays(days) : DateTimeOffset.MaxValue; conversation.Version++;
        }
        db.Add(new AiAgentEvent { UserId = user, Kind = "ConfigurationChanged", Detail = "AI执行模式、资源预算或个性化配置已更新" });
        await db.SaveChangesAsync(ct); return new { configuration = value, version = row.Version.ToString(), row.EmergencyStopped };
    }
}
