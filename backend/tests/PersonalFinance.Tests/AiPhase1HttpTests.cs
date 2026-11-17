using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

[Collection("Finance SQL")]
public sealed class AiPhase1HttpTests
{
    private sealed class ModelHandler : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var payload = JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct))!;
            var hasTools = payload["messages"]!.AsArray().Any(x => x?["role"]?.GetValue<string>() == "tool");
            if (payload["stream"]?.GetValue<bool>() == true && !hasTools) return new(HttpStatusCode.OK) { Content = new StringContent("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"query1\",\"type\":\"function\",\"function\":{\"name\":\"GetIncomeExpenseSummary\",\"arguments\":\"{\\\"start\\\":\\\"2026-10-01\\\",\\\"end\\\":\\\"2026-10-31\\\",\\\"currency\\\":\\\"CNY\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n") };
            if (payload["stream"]?.GetValue<bool>() == true) return new(HttpStatusCode.OK) { Content = new StringContent("data: {\"choices\":[{\"delta\":{\"content\":\"本期支出10.00元\"},\"finish_reason\":null}]}\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":30,\"completion_tokens\":10}}\n\ndata: [DONE]\n\n") };
            var isDraft = payload["response_format"] != null;
            JsonObject message;
            if (isDraft) message = new() { ["role"] = "assistant", ["content"] = """{"intent":"Expense","amount":"38","currency":"CNY","date":"2026-10-12","accountHint":"HTTP现金","categoryHint":"HTTP餐饮","merchant":"测试餐厅","amountAmbiguous":false,"unconfirmedFields":[],"confidence":0.8,"categoryPath":["HTTP生活","HTTP餐饮"],"tagHints":["HTTP聚餐"],"note":"人工核对"}""" };
            else if (hasTools) message = new() { ["role"] = "assistant", ["content"] = "本期支出10.00元" };
            else message = new() { ["role"] = "assistant", ["tool_calls"] = JsonNode.Parse("""[{"id":"query1","type":"function","function":{"name":"GetIncomeExpenseSummary","arguments":"{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\",\"currency\":\"CNY\"}"}}]""") };
            return new(HttpStatusCode.OK) { Content = new StringContent(new JsonObject { ["choices"] = new JsonArray(new JsonObject { ["message"] = message, ["finish_reason"] = message["tool_calls"] == null ? "stop" : "tool_calls" }),
                ["usage"] = new JsonObject { ["prompt_tokens"] = 30, ["completion_tokens"] = 10 } }.ToJsonString()) };
        }
    }
    private sealed class Factory(string connection) : WebApplicationFactory<Program>
    {
        private readonly string folder = Path.Combine(Path.GetTempPath(), "pf-ai-http-" + Guid.NewGuid().ToString("N"));
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Directory.CreateDirectory(folder); builder.UseContentRoot(folder).UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?> {
                ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('H', 64), ["Ai:Enabled"] = "true",
                ["Ai:DeepSeek:ApiKey"] = "isolated-http-mock", ["Ai:DailyCallLimit"] = "1000", ["Verification:Isolated"] = "true",
                ["DataProtection:KeyPath"] = Path.Combine(folder, ".keys") }));
            builder.ConfigureServices(services => {
                services.RemoveAll<DbContextOptions<FinanceDb>>(); services.AddDbContext<FinanceDb>(o => o.UseSqlServer(connection));
                services.RemoveAll<IHostedService>();
                // Program captures its verification key before WebApplicationFactory's late
                // configuration callbacks. Align test JWT validation with the test signing key.
                services.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o =>
                    o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('H', 64))));
                services.AddHttpClient<DeepSeekClient>().ConfigurePrimaryHttpMessageHandler(() => new ModelHandler());
            });
        }
    }
    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        var raw = await response.Content.ReadAsStringAsync(); Assert.True(response.IsSuccessStatusCode, $"HTTP {(int)response.StatusCode}: {raw}");
        return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();
    }
    private static async Task Login(HttpClient client, AppUser user, string password)
    {
        var data = await Data(await client.PostAsJsonAsync("/api/auth/login", new { user.Email, password }));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", data.GetProperty("accessToken").GetString());
    }
    [DeletionSqlFact] public async Task RealHttpAuthSseDraftConfirmationReplayAndUserIsolationUseOnlyIsolatedSql()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        var database = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(connection).InitialCatalog;
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);
        var password = "HTTP-" + Guid.NewGuid().ToString("N");
        var user = new AppUser { Email = Guid.NewGuid().ToString("N") + "@ai-http.test", DisplayName = "HTTP测试" };
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, password); db.Add(user);
        var victim = new AppUser { Email = Guid.NewGuid().ToString("N") + "@ai-http.test" }; victim.PasswordHash = new PasswordHasher<AppUser>().HashPassword(victim, password); db.Add(victim);
        var account = new Account { UserId = user.Id, Name = "HTTP现金", OpeningBalance = 1000 }; db.Add(account);
        var root = new Category { UserId = user.Id, Name = "HTTP生活" }; db.Add(root);
        var category = new Category { UserId = user.Id, Name = "HTTP餐饮", ParentId = root.Id }; db.Add(category);
        db.Add(new DirectoryItem { UserId = user.Id, Name = "HTTP聚餐", Kind = "tags" });
        var seed = new FinanceTransaction { UserId = user.Id, Amount = 10, AccountId = account.Id, CategoryId = category.Id, OccurredAt = new DateTimeOffset(2026, 10, 12, 1, 0, 0, TimeSpan.FromHours(8)) };
        seed.Entries.Add(new() { UserId = user.Id, TransactionId = seed.Id, AccountId = account.Id, Kind = "Account", Amount = -10, BaseAmount = -10 });
        seed.Entries.Add(new() { UserId = user.Id, TransactionId = seed.Id, CategoryId = category.Id, Kind = "Expense", Amount = 10, BaseAmount = 10 }); db.Add(seed);
        await db.SaveChangesAsync();
        // All committed records remain solely in a random test database and are removed with that database after the run.
        using var factory = new Factory(connection); using var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope()) Assert.Equal(database, scope.ServiceProvider.GetRequiredService<FinanceDb>().Database.GetDbConnection().Database);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/ai/conversations")).StatusCode);
        await Login(client, user, password);
        await Data(await client.PutAsJsonAsync("/api/ai/privacy", new AiPrivacyInput(true, true, true, false, false, false, true)));
        var stream = await client.PostAsJsonAsync("/api/ai/chat/stream", new AiChatInput("本月支出", AccountIds: [account.Id]));
        Assert.Equal(HttpStatusCode.OK, stream.StatusCode); var events = await stream.Content.ReadAsStringAsync();
        Assert.Contains("event: completed", events); Assert.Contains("10.00", events); Assert.DoesNotContain("event: error", events);
        Assert.Contains("event: progress", events); Assert.Contains("Preparing", events); Assert.Contains("Running", events); Assert.Contains("Succeeded", events); Assert.Contains("Generating", events);
        var progressEvents = events.Split("\n\n").Where(e => e.StartsWith("event: progress")).ToArray();
        Assert.All(progressEvents, e => { Assert.DoesNotContain("arguments", e); Assert.DoesNotContain("2026-10-01", e); Assert.DoesNotContain("HTTP现金", e); });
        var conversation = (await Data(await client.GetAsync("/api/ai/conversations"))).GetProperty("items")[0];
        var conversationId = conversation.GetProperty("id").GetString();
        var report = await Data(await client.PostAsJsonAsync("/api/ai/chat", new AiChatInput("生成本月财务报告", AccountIds:[account.Id], Report:true)));
        var reportId = report.GetProperty("conversationId").GetString();
        var reports = await Data(await client.GetAsync("/api/ai/conversations?kind=Report"));
        Assert.Single(reports.GetProperty("items").EnumerateArray()); Assert.Equal(reportId, reports.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal("Report", (await db.Set<AiConversation>().AsNoTracking().SingleAsync(x=>x.Id==reportId)).Kind);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/ai/chat", new AiChatInput("再生成报告", ConversationId:reportId, Report:true))).StatusCode);
        var draft = await Data(await client.PostAsJsonAsync("/api/ai/drafts", new AiDraftInput("昨天晚餐38元，HTTP现金支付，HTTP聚餐标签")));
        Assert.Equal(1, await db.Transactions.CountAsync(x => x.UserId == user.Id));
        var id = draft.GetProperty("draftId").GetString(); var version = draft.GetProperty("version").GetString();
        var tag = draft.GetProperty("tagIds")[0].GetString();
        var transaction = new SaveTransaction("Expense", "38", account.Id, new DateTimeOffset(2026, 10, 12, 12, 0, 0, TimeSpan.FromHours(8)), CategoryId: category.Id,
            Merchant: "测试餐厅", TagIds: [tag!], Origin: "AiConfirmed", AiDraftId: id, AiDraftVersion: version);
        client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var confirmation = await Data(await client.PostAsJsonAsync("/api/transactions/expense", transaction));
        var replay = await Data(await client.PostAsJsonAsync("/api/transactions/expense", transaction));
        Assert.Equal(confirmation.GetProperty("id").GetString(), replay.GetProperty("id").GetString());
        Assert.Equal(2, await db.Transactions.CountAsync(x => x.UserId == user.Id));
        var stored = await db.Set<AiTransactionDraft>().AsNoTracking().SingleAsync(x => x.Id == id); Assert.Equal("Confirmed", stored.State); Assert.Equal(confirmation.GetProperty("id").GetString(), stored.TransactionId);
        var batch = await Data(await client.PostAsJsonAsync("/api/ai/drafts/batch", new AiDraftBatchInput([new("晚餐38元，HTTP现金支付"), new("午餐38元，HTTP现金支付")])));
        var batchRows = batch.GetProperty("items");
        var batchBody = new AiDraftBatchConfirmation(batchRows.EnumerateArray().Select(x => x.GetProperty("draft")).Select(x => new AiDraftConfirmation(
            x.GetProperty("draftId").GetString()!, x.GetProperty("version").GetString()!, transaction with { AiDraftId = null, AiDraftVersion = null, AiDuplicateAcknowledged = true })).ToArray());
        client.DefaultRequestHeaders.Remove("Idempotency-Key"); client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        await Data(await client.PostAsJsonAsync("/api/ai/drafts/confirm-batch", batchBody)); await Data(await client.PostAsJsonAsync("/api/ai/drafts/confirm-batch", batchBody));
        Assert.Equal(4, await db.Transactions.CountAsync(x => x.UserId == user.Id));
        var agentSettings = await Data(await client.GetAsync("/api/ai/agent/settings"));
        Assert.Equal("Suggest", agentSettings.GetProperty("configuration").GetProperty("mode").GetString());
        var configuration = agentSettings.GetProperty("configuration").Deserialize<AiAgentConfiguration>(FinanceService.Json)!;
        await Data(await client.PutAsJsonAsync("/api/ai/agent/settings", new AgentSettingsInput(configuration with { Mode = "Auto", ToolBudget = 500 }, agentSettings.GetProperty("version").GetString()!)));
        var registered = await Data(await client.GetAsync("/api/ai/tools"));
        Assert.Contains(registered.GetProperty("definitions").EnumerateArray(), t => t.GetProperty("function").GetProperty("name").GetString() == "SaveTransaction");
        client.DefaultRequestHeaders.Remove("Idempotency-Key"); client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var grant = await Data(await client.PostAsJsonAsync("/api/ai/agent/grants", new AgentGrantInput("BatchUpdateTransactions", [account.Id], 20)));
        using (var revoke = new HttpRequestMessage(HttpMethod.Delete, "/api/ai/agent/grants/" + grant.GetProperty("id").GetString()) { Content = JsonContent.Create(new AgentVersion(grant.GetProperty("version").GetInt64().ToString())) }) await Data(await client.SendAsync(revoke));
        var memoryId = Guid.NewGuid().ToString();
        await Data(await client.PutAsJsonAsync("/api/ai/agent/memories/" + memoryId, new AgentMemoryInput("分类偏好", "通勤归入交通", Version: "0")));
        using (var removeMemory = new HttpRequestMessage(HttpMethod.Delete, "/api/ai/agent/memories/" + memoryId) { Content = JsonContent.Create(new AgentVersion("2")) }) await Data(await client.SendAsync(removeMemory));
        client.DefaultRequestHeaders.Remove("Idempotency-Key"); client.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var agentTask = await Data(await client.PostAsJsonAsync("/api/ai/agent/tasks", new AgentTaskInput("跨年度分析与整理")));
        var agentTaskId = agentTask.GetProperty("id").GetString();
        Assert.Equal("Queued", agentTask.GetProperty("state").GetString());
        // Hosted services are disabled: durable task creation never invokes a paid provider or mutates the ledger.
        await Data(await client.PostAsync("/api/ai/agent/stop", null));
        Assert.Equal("Cancelled", (await Data(await client.GetAsync("/api/ai/agent/tasks/" + agentTaskId))).GetProperty("task").GetProperty("state").GetString());
        Assert.Equal(4, await db.Transactions.CountAsync(x => x.UserId == user.Id));
        using var other = factory.CreateClient(); await Login(other, victim, password);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync("/api/ai/agent/tasks/" + agentTaskId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync("/api/ai/conversations/" + conversationId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync("/api/ai/conversations/" + reportId)).StatusCode);
        Assert.Empty((await Data(await other.GetAsync("/api/ai/conversations?kind=Report"))).GetProperty("items").EnumerateArray());
        other.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync("/api/transactions/expense", transaction)).StatusCode);
        // The victim cannot adopt the first user's account scope.
        await Data(await other.PutAsJsonAsync("/api/ai/privacy", new AiPrivacyInput(true, true, false, false, false, false)));
        var denied = await other.PostAsJsonAsync("/api/ai/chat", new AiChatInput("查看这个账户", AccountIds: [account.Id])); Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        await Data(await client.DeleteAsync("/api/ai/conversations/" + conversationId));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/ai/conversations/" + conversationId)).StatusCode);
    }
    [DeletionSqlFact] public async Task UnifiedConsentHttpRoundTripRevokesCachesWithoutAffectingAnotherUser()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);
        await db.Database.MigrateAsync();
        var password = "Consent-Test-" + Guid.NewGuid().ToString("N");
        var user = new AppUser { Email = Guid.NewGuid().ToString("N") + "@consent.test" };
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, password); db.Add(user); await db.SaveChangesAsync();
        using var factory = new Factory(connection); using var client = factory.CreateClient(); await Login(client, user, password);
        var enabled = new AiPrivacyInput(true,false,false,false,false,false,PersonalReadAccess:false,FullFinancialAccess:true);
        await Data(await client.PutAsJsonAsync("/api/ai/privacy", enabled));
        var granted = (await Data(await client.GetAsync("/api/ai/settings"))).GetProperty("privacy");
        Assert.True(granted.GetProperty("fullFinancialAccess").GetBoolean()); Assert.True(granted.GetProperty("allowDetails").GetBoolean());
        var cache = factory.Services.GetRequiredService<AiContextService>(); var id = Guid.NewGuid().ToString();
        cache.Save(user.Id, id, ["synthetic private context"]); cache.Save("other-synthetic-user", id, ["other context"]);
        await Data(await client.PutAsJsonAsync("/api/ai/privacy", enabled with { FullFinancialAccess = false }));
        var revoked = (await Data(await client.GetAsync("/api/ai/settings"))).GetProperty("privacy");
        Assert.False(revoked.GetProperty("fullFinancialAccess").GetBoolean()); Assert.False(revoked.GetProperty("allowSummary").GetBoolean());
        Assert.True(revoked.GetProperty("consentVersion").GetInt64() > granted.GetProperty("consentVersion").GetInt64());
        Assert.Throws<ApiException>(() => cache.Read(user.Id,id)); Assert.Equal("other context", Assert.Single(cache.Read("other-synthetic-user",id)));
        Assert.Equal(0, await db.Transactions.CountAsync(x => x.UserId == user.Id));
        Assert.Equal(2, await db.Set<AuditRecord>().CountAsync(x => x.UserId == user.Id && x.ResourceType == "AiPrivacySetting"));
    }
}
