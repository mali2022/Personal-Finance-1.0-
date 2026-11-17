using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public sealed class AiOptions
{
    public AiModelRegistration[] Models { get; set; } = [];
    public int ModelContextTokens { get; set; } = 65536;
    public int MaxTaskTokens { get; set; } = 10000000;
    public int MaxTaskTools { get; set; } = 10000;
    public int MaxTaskModelCalls { get; set; } = 2000;
    public int MaxTaskSeconds { get; set; } = 86400;
    public int MaxResponseBytes { get; set; } = 16777216;
    public int MaxPendingTasksPerUser { get; set; } = 1000;
    public int MaxTaskEvidenceBytes { get; set; } = 33554432;
    public int MaxTaskStorageBytes { get; set; } = 67108864;
    public bool Enabled { get; set; }
    public string Provider { get; set; } = "DeepSeek";
    public DeepSeekOptions DeepSeek { get; set; } = new();
    public int MaxToolRounds { get; set; } = 64;
    public int MaxQueryDays { get; set; } = 0;
    public int MaxRecords { get; set; } = 50;
    public int DailyCallLimit { get; set; } = 0;
    public decimal? DailyCostBudget { get; set; }
    public decimal? MonthlyCostBudget { get; set; }
    public int TotalTimeoutSeconds { get; set; } = 120;
    public int MaxTotalTools { get; set; } = 128;
    public int MaxContextBytes { get; set; } = 128000;
    public int MaxConcurrentRequests { get; set; } = 4;
    public int QuickToolBudget { get; set; } = 8;
    public int AnalysisToolBudget { get; set; } = 32;
    public int ReadParallelism { get; set; } = 3;
    public int RepeatedQueryLimit { get; set; } = 3;
    public int ToolTimeoutSeconds { get; set; } = 20;
    public int ConversationRetentionDays { get; set; } = 0;
    public string ConfigurationVersion { get; set; } = "phase1-v1";
    public decimal? InputPricePerMillion { get; set; }
    public decimal? CachedInputPricePerMillion { get; set; }
    public decimal? OutputPricePerMillion { get; set; }
    public string PriceCurrency { get; set; } = "USD";
    public string? PriceEffectiveDate { get; set; }
}
public sealed class DeepSeekOptions
{
    public string BaseUrl { get; set; } = "https://api.deepseek.com";
    public string Model { get; set; } = "deepseek-chat";
    public string ReasoningModel { get; set; } = "deepseek-reasoner";
    public string? ApiKey { get; set; }
    public int TimeoutSeconds { get; set; } = 60;
    public int MaxOutputTokens { get; set; } = 4096;
    public int MaxRetries { get; set; } = 2;
    public bool EnableReasoningTools { get; set; }
    public bool SupportsTools { get; set; } = true;
    public bool SupportsJson { get; set; } = true;
    public bool SupportsStreaming { get; set; } = true;
    public string? VerifiedModel { get; set; }
    public string? VerifiedAt { get; set; }
    public static Uri ValidateUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            uri.Host != "api.deepseek.com" || uri.Port != 443 || uri.UserInfo != "" ||
            uri.Query != "" || uri.Fragment != "" || uri.AbsolutePath.TrimEnd('/') is not ("" or "/v1"))
            throw new ApiException(503, "DeepSeek 地址必须为官方 HTTPS 地址", "AI_CONFIG_INVALID");
        return new Uri(uri.AbsoluteUri.TrimEnd('/') + "/");
    }
}
