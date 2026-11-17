using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Application.Ai;
using Xunit;

public sealed class AiStreamingToolsTests
{
    private sealed class Recorder : IAiUsageRecorder
    {
        public Task CheckLimit(string u, CancellationToken ct) => Task.CompletedTask;
        public Task Record(string u, string m, string f, int a, JsonObject? tokens, string? e) => Task.CompletedTask;
    }
    private sealed class Handler(string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
    }
    [Fact] public async Task StreamingToolFragmentsAreReassembledWithoutLeakingReasoningOrGeneratingASecondAnswer()
    {
        string Event(object value) => "data: " + JsonSerializer.Serialize(value) + "\n\n";
        var body = Event(new { choices = new[] { new { delta = new { reasoning_content = "private reasoning", tool_calls = new[] { new { index = 0, id = "call_1", function = new { name = "SearchTransactions", arguments = "{\"start\":" } } } } } } })
            + Event(new { choices = new[] { new { delta = new { tool_calls = new[] { new { index = 0, function = new { arguments = "\"2026-10-01\"}" } } } }, finish_reason = "tool_calls" } } })
            + Event(new { choices = Array.Empty<object>(), usage = new { prompt_tokens = 10, completion_tokens = 20 } }) + "data: [DONE]\n\n";
        using var http = new HttpClient(new Handler(body));
        var client = new DeepSeekClient(http, Options.Create(new AiOptions { Enabled = true, DeepSeek = new() { ApiKey = "synthetic" } }), new Recorder());
        var emitted = "";
        var result = await client.Complete("u", new JsonArray(new JsonObject { ["role"] = "user", ["content"] = "query" }), null, "synthetic", default, onDelta: text => { emitted += text; return Task.CompletedTask; });
        Assert.Empty(emitted); var call = result.Message["tool_calls"]![0]!;
        Assert.Equal("SearchTransactions", call["function"]!["name"]!.ToString()); Assert.Equal("2026-10-01", JsonNode.Parse(call["function"]!["arguments"]!.ToString())!["start"]!.ToString());
        Assert.Equal(30, result.Usage!["prompt_tokens"]!.GetValue<int>() + result.Usage["completion_tokens"]!.GetValue<int>());
        Assert.DoesNotContain("private reasoning", result.Message.ToJsonString());
    }
}
