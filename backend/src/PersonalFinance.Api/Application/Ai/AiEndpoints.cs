using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public static class AiEndpoints
{
    private static string Verification(AiOptions o) => DeepSeekClient.ProviderModel(o.DeepSeek.Model) == o.DeepSeek.Model && o.DeepSeek.Model == o.DeepSeek.VerifiedModel && o.DeepSeek.VerifiedAt != null ?
        $"已于{o.DeepSeek.VerifiedAt}完成真实 DeepSeek 联调；当前可用性仍需连接测试" : "待当前模型真实联调";
    public static void Register(IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<AiOptions>().Bind(configuration.GetSection("Ai")).Validate(o => o.Provider == "DeepSeek" &&
            o.MaxRecords is >= 1 and <= 100 &&
            o.TotalTimeoutSeconds >= 5 && o.MaxContextBytes >= 8000 &&
            o.ReadParallelism is >= 1 and <= 8 && o.RepeatedQueryLimit is >= 1 and <= 5 && o.ToolTimeoutSeconds is >= 1 and <= 120 &&
            o.MaxConcurrentRequests is >= 1 and <= 128 && o.ConversationRetentionDays >= 0 &&
            o.MaxTaskSeconds > 0 && o.MaxResponseBytes >= 1024 && o.MaxPendingTasksPerUser > 0 && o.MaxTaskEvidenceBytes >= 8000 && o.MaxTaskStorageBytes >= o.MaxTaskEvidenceBytes && o.ModelContextTokens >= 8192 &&
            o.Models.All(m => m.Id.Length is > 0 and <= 100 && m.ContextTokens > m.MaxOutputTokens && m.MaxOutputTokens >= 128) &&
            o.Models.Select(m => m.Id).Distinct().Count() == o.Models.Length, "AI 配置范围无效")
            .PostConfigure<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider, IHostEnvironment>((o, protection, env) => {
                if (string.IsNullOrWhiteSpace(o.DeepSeek.ApiKey)) o.DeepSeek.ApiKey = DeepSeekKeyStore.Read(protection, configuration, env);
            });
        services.AddSingleton<AiContextService>();
        services.AddSingleton<AiGatewayControl>();
        services.AddSingleton<AiAgentRuntime>();
        services.AddScoped<AiConversationService>(); services.AddScoped<AiRequestAuditService>();
        services.AddHostedService<AiHistoryRetention>();
        services.AddScoped<AiPrivacyService>(); services.AddScoped<DeepSeekUsageService>();
        services.AddScoped<IAiUsageRecorder>(sp => sp.GetRequiredService<DeepSeekUsageService>());
        services.AddScoped<AiFinancialTools>(); services.AddScoped<DeepSeekToolDispatcher>();
        services.AddScoped<AiReadToolExecutor>();
        services.AddScoped<DeepSeekChatService>(); services.AddScoped<AiDraftValidator>();
        services.AddScoped<AiDraftService>();
        services.AddScoped<AiDraftMatchingService>();
        services.AddScoped<ImportRecognitionService>();
        services.AddScoped<AiAgentConfigurationService>(); services.AddScoped<AiAgentTools>(); services.AddScoped<AiAgentService>();
        services.AddHostedService<AiAgentWorker>();
        services.AddScoped<IAiProvider>(sp => sp.GetRequiredService<DeepSeekClient>());
        services.AddHttpClient<DeepSeekClient>(http => http.Timeout = Timeout.InfiniteTimeSpan)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false, PooledConnectionLifetime = TimeSpan.FromMinutes(5), ConnectTimeout = TimeSpan.FromSeconds(10), MaxConnectionsPerServer = 8 });
    }
    public static void Map(WebApplication app)
    {
        AiAgentEndpoints.Map(app);
        var group = app.MapGroup("/api/ai").RequireAuthorization().RequireRateLimiting("ai");
        group.MapGet("/settings", async (HttpContext c, IOptions<AiOptions> o, AiPrivacyService privacy) => FinanceEndpoints.Ok(c, new {
            provider = "DeepSeek", enabled = o.Value.Enabled, configured = !string.IsNullOrWhiteSpace(o.Value.DeepSeek.ApiKey),
            foundationVersion = 1,
            authorizationVersion = 2,
            model = DeepSeekClient.ProviderModel(o.Value.DeepSeek.Model), reasoningModel = DeepSeekClient.ProviderModel(o.Value.DeepSeek.ReasoningModel),
            privacy = await privacy.Get(FinanceEndpoints.User(c), c.RequestAborted), dailyCallLimit = 0, budgetMode = "UNRESTRICTED", internalQuotaEnabled = false, priceRequired = false,
            capabilities = new { text = Verification(o.Value), tools = o.Value.DeepSeek.SupportsTools ? Verification(o.Value) : "当前配置禁用工具", json = o.Value.DeepSeek.SupportsJson ? Verification(o.Value) : "当前配置禁用JSON", streaming = o.Value.DeepSeek.SupportsStreaming ? Verification(o.Value) : "当前配置禁用流式", images = "本应用使用独立识别层，尚未配置", audio = "尚未配置独立ASR", reasoningTools = o.Value.DeepSeek.EnableReasoningTools ? "已启用，待真实联调" : "禁用，待联调" },
            historyRetentionDays = o.Value.ConversationRetentionDays,
            transmission = "开启AI后，默认允许在本人账本及选定账户内自动进行只读调查，包括汇总、交易和薪酬；关闭自动只读可恢复分项限制。家庭数据、描述文字和识别文字分别控制。数据发送到DeepSeek，默认剔除姓名、商户、备注及敏感标识。所有财务变更必须确认具体计划，高风险另行授权。临时调查定位保留30分钟；开启历史后，回答、结构化报告及依据保存在本机数据库，可删除。",
            documentation = "https://api-docs.deepseek.com/quick_start/pricing/", legacyModels = "官方当前推荐 deepseek-flash / deepseek-v4-pro。deepseek-chat 已于2026-10-12真实验证可用；deepseek-reasoner 尚未联调。旧模型别名仍可能变更。" }));
        group.MapPut("/privacy", async (AiPrivacyInput b, HttpContext c, AiPrivacyService service, AiContextService context, FinanceService finance) => {
            var user = FinanceEndpoints.User(c); var gate = context.Gate(user); await gate.WaitAsync(c.RequestAborted);
            try { return await FinanceEndpoints.Write(c, finance, b, async () => await service.Save(user, b, c.RequestAborted, c.TraceIdentifier)); } finally { gate.Release(); }
        });
        group.MapGet("/usage", async (HttpContext c, DeepSeekUsageService service) => FinanceEndpoints.Ok(c, await service.History(FinanceEndpoints.User(c), c.RequestAborted)));
        group.MapGet("/tools", async (HttpContext c, AiPrivacyService privacy, IOptions<AiOptions> options, AiAgentConfigurationService settings, DeepSeekToolDispatcher dispatcher) => {
            var p = await privacy.Get(FinanceEndpoints.User(c), c.RequestAborted);
            var (_, config) = await settings.Get(FinanceEndpoints.User(c), c.RequestAborted);
            var context = await dispatcher.CreateContext(FinanceEndpoints.User(c), config.AccountIds, c.RequestAborted);
            return FinanceEndpoints.Ok(c, new { definitions = AiAgentTools.Definitions(p, context), policies = AiFinancialTools.Registry.Select(s => (object)new {
                s.Name, s.Description, s.Permission, permissionLevel = "L1", authorized = AiFinancialTools.Authorized(s, p), readOnly = true, canWrite = false,
                maxQueryDays = 0, maxRecords = options.Value.MaxRecords, sqlCommandTimeoutSeconds = 15,
                logging = "仅记录工具名、认证用户、时间范围、币种及成功状态；不保存参数原文或结果",
                outputSchema = new { type = "object", required = new[] { "tool", "start", "end", "currency", "scope", "source", "detailLink", "queriedAt", "data", "truncated" } }
            }).Concat(AiAgentTools.Registry.Select(s => (object)new { s.Name, s.Description, s.Permission, permissionLevel = s.Write ? s.Name is "DeleteTransaction" or "BatchDeleteTransactions" ? "L4" : "L3" : "L1", authorized = AiAgentTools.Authorized(s, p), readOnly = !s.Write, canWrite = s.Write,
                executionRequiresPolicy = s.Write, executionEndpoint = "/api/ai/agent/tasks", highRiskStrategy = "删除、账本调整及非零期初资产等高风险操作须逐计划独立授权" })) });
        });
        group.MapPost("/test-connection", async (HttpContext c, DeepSeekClient client, AiPrivacyService privacy, AiContextService context) => {
            var user = FinanceEndpoints.User(c); var gate = context.Gate(user); await gate.WaitAsync(c.RequestAborted);
            try {
                await privacy.Require(user, c.RequestAborted);
                var result = await client.Complete(user, new JsonArray { new JsonObject { ["role"] = "user", ["content"] = "只回复：连接成功" } }, null, "connection", c.RequestAborted);
                return FinanceEndpoints.Ok(c, new { connected = true, testedAt = DateTimeOffset.UtcNow, usage = result.Usage });
            } finally { gate.Release(); }
        });
        group.MapPost("/chat", async (AiChatInput b, HttpContext c, DeepSeekChatService service) => FinanceEndpoints.Ok(c, await service.Chat(FinanceEndpoints.User(c), b, c.RequestAborted)));
        group.MapPost("/chat/stream", async (AiChatInput b, HttpContext c, DeepSeekChatService service) => {
            // Headers start only when there is a delta or a structured completion/error. Failed partial answers are never retained as completed conversations.
            async Task Event(string type, object value) {
                if (!c.Response.HasStarted) { c.Response.ContentType = "text/event-stream"; c.Response.Headers["X-Accel-Buffering"] = "no"; }
                await c.Response.WriteAsync($"event: {type}\ndata: {JsonSerializer.Serialize(value, FinanceService.Json)}\n\n", c.RequestAborted);
                await c.Response.Body.FlushAsync(c.RequestAborted);
            }
            try { var result = await service.Chat(FinanceEndpoints.User(c), b, c.RequestAborted, delta => Event("delta", new { text = delta }), progress => Event("progress", progress)); await Event("completed", result); }
            catch (ApiException e) { await Event("error", new { code = e.Code, message = e.Message }); }
            catch (OperationCanceledException) when (c.RequestAborted.IsCancellationRequested) { }
            catch (Exception e) {
                app.Logger.LogWarning("AI stream failed {ErrorType} {TraceId}", e.GetType().Name, c.TraceIdentifier);
                await Event("error", new { code = "AI_STREAM_INTERRUPTED", message = "回复中断，未完成内容不可作为财务结论" });
            }
        });
        group.MapGet("/conversations", async (string? search, bool? archived, int? page, string? kind, HttpContext c, AiConversationService service) =>
            FinanceEndpoints.Ok(c, await service.List(FinanceEndpoints.User(c), new(search, archived ?? false, page ?? 1, kind), c.RequestAborted)));
        group.MapGet("/conversations/{id}", async (string id, int? page, HttpContext c, AiConversationService service) =>
            FinanceEndpoints.Ok(c, await service.Detail(FinanceEndpoints.User(c), id, page ?? 1, c.RequestAborted)));
        group.MapPatch("/conversations/{id}", async (string id, AiConversationChange b, HttpContext c, AiConversationService service, AiContextService context) => {
            var gate = context.Gate(FinanceEndpoints.User(c)); await gate.WaitAsync(c.RequestAborted);
            try { return FinanceEndpoints.Ok(c, await service.Change(FinanceEndpoints.User(c), id, b, c.RequestAborted)); } finally { gate.Release(); }
        });
        group.MapPut("/messages/{id}/feedback", async (string id, AiFeedbackInput b, HttpContext c, AiConversationService service) => {
            await service.Feedback(FinanceEndpoints.User(c), id, b.Rating, c.RequestAborted); return FinanceEndpoints.Ok(c, new { saved = true });
        });
        group.MapDelete("/conversations/{id}", async (string id, HttpContext c, AiContextService context, AiConversationService service) => {
            var user = FinanceEndpoints.User(c); var gate = context.Gate(user); await gate.WaitAsync(c.RequestAborted);
            try {
                try { await service.Delete(user, id, c.RequestAborted); }
                catch (ApiException e) when (e.Code == "AI_CONVERSATION_NOT_FOUND") { context.Delete(user, id); }
                return FinanceEndpoints.Ok(c, new { cleared = true });
            } finally { gate.Release(); }
        });
        group.MapPost("/drafts", async (AiDraftInput b, HttpContext c, AiDraftService service) => FinanceEndpoints.Ok(c, await service.Generate(FinanceEndpoints.User(c), b, c.RequestAborted)));
        group.MapPost("/drafts/batch", async (AiDraftBatchInput b, HttpContext c, AiDraftService service) => FinanceEndpoints.Ok(c, await service.GenerateBatch(FinanceEndpoints.User(c), b, c.RequestAborted)));
        group.MapGet("/drafts", async (int? page, HttpContext c, AiDraftService service) => FinanceEndpoints.Ok(c, await service.List(FinanceEndpoints.User(c), page ?? 1, c.RequestAborted)));
        group.MapPost("/drafts/confirm-batch", async (AiDraftBatchConfirmation b, HttpContext c, AiDraftService service) => FinanceEndpoints.Ok(c, await service.ConfirmBatch(c, b)));
        group.MapDelete("/drafts/{id}", async (string id, [Microsoft.AspNetCore.Mvc.FromBody] AiDraftDelete b, HttpContext c, FinanceService finance, PersonalFinance.Api.Infrastructure.FinanceDb db) =>
            await FinanceEndpoints.Write(c, finance, b, async () => {
                var row = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.SingleOrDefaultAsync(db.Set<PersonalFinance.Api.Domain.AiTransactionDraft>().Where(x => x.UserId == FinanceEndpoints.User(c) && x.Id == id));
                if (row == null) throw new ApiException(404, "草稿不存在", "AI_DRAFT_NOT_FOUND");
                FinanceService.Version(row, b.Version); if (row.State != "Draft") throw new ApiException(409, "草稿已处理", "AI_DRAFT_CONFLICT");
                row.State = "Deleted"; row.Version++; return new { deleted = true };
            }, true));
    }
}
public sealed record AiFeedbackInput(int Rating);
public sealed record AiDraftDelete(string Version);
