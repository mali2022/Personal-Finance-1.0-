using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Encodings.Web;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application.Ai;

public sealed record DeepSeekCompletion(JsonObject Message, JsonObject? Usage);
public sealed class DeepSeekClient(HttpClient http, IOptions<AiOptions> options, IAiUsageRecorder usage, AiGatewayControl? control = null) : IAiProvider
{
    private static readonly JsonSerializerOptions WireJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    public static string ProviderModel(string model) => model switch { "deepseek-chat" => "deepseek-flash", "deepseek-reasoner" => "deepseek-v4-pro", _ => model };
    private AiRequestContext? requestContext;
    public void AttachContext(AiRequestContext context) { requestContext = context; usage.AttachContext(context); }
    public static string ErrorCode(HttpStatusCode status) => (int)status switch {
        401 => "AI_KEY_INVALID", 402 => "AI_BALANCE_INSUFFICIENT", 429 => "AI_RATE_LIMIT",
        400 or 422 => "AI_PARAMETERS_INVALID", >= 500 => "AI_UPSTREAM_UNAVAILABLE", _ => "AI_UPSTREAM_ERROR" };
    public void EnsureAvailable()
    {
        if (!options.Value.Enabled) throw new ApiException(503, "服务端 AI 功能已关闭", "AI_DISABLED");
        if (string.IsNullOrWhiteSpace(options.Value.DeepSeek.ApiKey)) throw new ApiException(503, "服务端尚未配置 DeepSeek 密钥", "AI_NOT_CONFIGURED");
        DeepSeekOptions.ValidateUrl(options.Value.DeepSeek.BaseUrl);
    }
    public async Task<DeepSeekCompletion> Complete(string user, JsonArray messages, JsonArray? tools, string feature,
        CancellationToken ct, bool json = false, bool reasoning = false, Func<string, Task>? onDelta = null)
    {
        EnsureAvailable(); var o = options.Value.DeepSeek;
        if (tools?.Count > 0 && !o.SupportsTools || json && !o.SupportsJson || onDelta != null && !o.SupportsStreaming)
            throw new ApiException(422, "当前模型配置不支持所需能力", "AI_CAPABILITY_UNSUPPORTED");
        var agent = requestContext?.Agent;
        if (Encoding.UTF8.GetByteCount(messages.ToJsonString(WireJson)) > (agent?.ContextTokens ?? options.Value.MaxContextBytes))
            throw new ApiException(400, "会话上下文过长，请缩小范围或新建会话", "AI_CONTEXT_LIMIT");
        using var capacity = control == null ? null : await control.Acquire(ct);
        var model = agent?.Model ?? (reasoning ? o.ReasoningModel : o.Model);
        if (model.Length is < 1 or > 100 || model.Any(char.IsControl)) throw new ApiException(503, "模型配置无效", "AI_CONFIG_INVALID");
        if (agent != null && tools?.Count > 0 && options.Value.Models.SingleOrDefault(m => m.Id == model) is { SupportsTools: false }) throw new ApiException(422, "注册模型不支持工具", "AI_CAPABILITY_UNSUPPORTED");
        if ((reasoning || model == o.ReasoningModel) && tools != null && !o.EnableReasoningTools) throw new ApiException(400, "推理模型工具调用尚未启用联调", "AI_REASONING_TOOLS_PENDING");
        var wireModel = ProviderModel(model);
        var payload = new JsonObject { ["model"] = wireModel, ["messages"] = messages.DeepClone(), ["max_tokens"] = agent?.OutputTokens ?? o.MaxOutputTokens, ["stream"] = onDelta != null };
        // Current V4 defaults to thinking. Non-thinking financial queries avoid exposing reasoning to clients.
        if (!reasoning && model != o.ReasoningModel && (wireModel.StartsWith("deepseek-v4", StringComparison.Ordinal) || wireModel == "deepseek-flash")) payload["thinking"] = new JsonObject { ["type"] = "disabled" };
        if (tools != null) payload["tools"] = tools.DeepClone();
        if (json) payload["response_format"] = new JsonObject { ["type"] = "json_object" };
        if (onDelta != null) payload["stream_options"] = new JsonObject { ["include_usage"] = true };
        if (Encoding.UTF8.GetByteCount(payload.ToJsonString(WireJson)) > (agent?.ContextTokens ?? options.Value.MaxContextBytes))
            throw new ApiException(400, "请求上下文与工具定义超出限制", "AI_CONTEXT_LIMIT");
        var endpoint = new Uri(DeepSeekOptions.ValidateUrl(o.BaseUrl), "chat/completions");
        for (var attempt = 0; ; attempt++)
        {
            await usage.Reserve(user, wireModel, feature, attempt, ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(o.TimeoutSeconds, 5, 180)));
            string? error = null; JsonObject? tokens = null; var emitted = false; var recorded = false;
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", o.ApiKey);
                request.Content = new StringContent(payload.ToJsonString(WireJson), Encoding.UTF8, "application/json");
                using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                if (!response.IsSuccessStatusCode)
                {
                    error = ErrorCode(response.StatusCode);
                    var retry = response.StatusCode == HttpStatusCode.TooManyRequests || (int)response.StatusCode >= 500;
                    if (retry && attempt < Math.Clamp(o.MaxRetries, 0, 2)) {
                        await usage.Record(user, wireModel, feature, attempt, null, error);
                        recorded = true;
                        var delay = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromMilliseconds(500 * Math.Pow(2, attempt) + Random.Shared.Next(100));
                        await Task.Delay(TimeSpan.FromSeconds(Math.Clamp(delay.TotalSeconds, .1, 5)), ct); continue;
                    }
                    throw new ApiException(503, error switch { "AI_KEY_INVALID" => "DeepSeek 密钥无效", "AI_BALANCE_INSUFFICIENT" => "DeepSeek 余额不足",
                        "AI_RATE_LIMIT" => "DeepSeek 请求限流，请稍后重试", "AI_PARAMETERS_INVALID" => "模型名称或请求参数不受支持，请检查官方文档与配置", _ => "DeepSeek 暂时不可用" }, error);
                }
                JsonObject message;
                if (onDelta != null)
                {
                    using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
                    using var reader = new StreamReader(stream);
                    var content = new StringBuilder(); var done = false; var finished = false; var size = 0;
                    var streamedCalls = new SortedDictionary<int, JsonObject>();
                    while (await reader.ReadLineAsync(timeout.Token) is { } line)
                    {
                        size += line.Length; if (size > options.Value.MaxResponseBytes) throw new JsonException();
                        if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;
                        var data = line[5..].Trim(); if (data == "[DONE]") { done = true; break; }
                        if (data.Length == 0) continue;
                        var chunk = JsonNode.Parse(data)!.AsObject();
                        if (chunk["choices"] is JsonArray finishChoices && finishChoices.Count > 0 && finishChoices[0]?["finish_reason"]?.GetValue<string>() is { } reason) {
                            if (reason == "length") throw new ApiException(502, "模型回复超出长度限制", "AI_OUTPUT_TRUNCATED");
                            if (reason is not ("stop" or "tool_calls")) throw new ApiException(502, "流式回复未正常结束", "AI_STREAM_INTERRUPTED");
                            finished = true;
                        }
                        if (chunk["usage"] is JsonObject u) tokens = (JsonObject)u.DeepClone();
                        if (chunk["choices"] is JsonArray choices && choices.Count > 0 && choices[0]?["delta"]?["content"]?.GetValue<string>() is { } delta)
                        { content.Append(delta); emitted = true; await onDelta(delta); }
                        if (chunk["choices"] is JsonArray { Count: > 0 } toolChoices && toolChoices[0]?["delta"]?["tool_calls"] is JsonArray fragments) foreach (var fragment in fragments) {
                            var index = fragment?["index"]?.GetValue<int>() ?? -1;
                            if (index is < 0 or > 7) throw new JsonException();
                            if (!streamedCalls.TryGetValue(index, out var call)) {
                                call = new JsonObject { ["id"] = "", ["type"] = "function", ["function"] = new JsonObject { ["name"] = "", ["arguments"] = "" } };
                                streamedCalls[index] = call;
                            }
                            if (fragment?["id"] != null) call["id"] = call["id"]!.GetValue<string>() + fragment["id"]!.GetValue<string>();
                            foreach (var field in new[] { "name", "arguments" }) if (fragment?["function"]?[field] != null)
                                call["function"]![field] = call["function"]![field]!.GetValue<string>() + fragment["function"]![field]!.GetValue<string>();
                        }
                    }
                    if (!done || !finished) throw new ApiException(502, "流式回复中断，未完成内容不可作为财务结论", "AI_STREAM_INTERRUPTED");
                    message = new JsonObject { ["role"] = "assistant", ["content"] = content.ToString() };
                    if (streamedCalls.Count > 0) message["tool_calls"] = new JsonArray(streamedCalls.Values.Select(c => (JsonNode?)c).ToArray());
                }
                else
                {
                    using var body = await response.Content.ReadAsStreamAsync(timeout.Token);
                    using var buffer = new MemoryStream(); var bytes = new byte[8192]; int count;
                    while ((count = await body.ReadAsync(bytes, timeout.Token)) > 0) { if (buffer.Length + count > options.Value.MaxResponseBytes) throw new JsonException(); await buffer.WriteAsync(bytes.AsMemory(0, count), timeout.Token); }
                    var root = JsonNode.Parse(buffer.ToArray())!.AsObject(); tokens = root["usage"] as JsonObject;
                    if (root["choices"]?[0]?["finish_reason"]?.GetValue<string>() == "length") throw new ApiException(502, "模型回复超出长度限制，请缩小问题范围", "AI_OUTPUT_TRUNCATED");
                    message = root["choices"]?[0]?["message"]?.DeepClone().AsObject() ?? throw new JsonException();
                    if (message["role"]?.GetValue<string>() != "assistant") throw new JsonException();
                }
                await usage.Record(user, wireModel, feature, attempt, tokens, null); return new(message, tokens);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                if (!recorded) await usage.Record(user, wireModel, feature, attempt, tokens, "AI_TIMEOUT");
                // A timeout may already have incurred billing: do not silently replay.
                throw new ApiException(504, "DeepSeek 请求超时", emitted ? "AI_STREAM_INTERRUPTED" : "AI_TIMEOUT");
            }
            catch (OperationCanceledException) { if (!recorded) await usage.Record(user, wireModel, feature, attempt, tokens, "AI_CANCELLED"); throw; }
            catch (Exception e) when (e is JsonException or InvalidOperationException or FormatException) { if (!recorded) await usage.Record(user, wireModel, feature, attempt, tokens, "AI_INVALID_JSON"); throw new ApiException(502, "模型返回无效 JSON", "AI_INVALID_JSON"); }
            catch (HttpRequestException) { if (!recorded) await usage.Record(user, wireModel, feature, attempt, tokens, "AI_NETWORK_ERROR"); throw new ApiException(503, "DeepSeek 网络连接失败", "AI_NETWORK_ERROR"); }
            catch (ApiException e) { if (!recorded) await usage.Record(user, wireModel, feature, attempt, tokens, e.Code); throw; }
        }
    }
}
