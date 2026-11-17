using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class AiPhase1Tests
{
    private static readonly string A = Guid.NewGuid().ToString(), B = Guid.NewGuid().ToString();
    private static AiRequestContext Context => new("alice", Guid.NewGuid().ToString(), "personal:alice", [A], true, "zh-CN", "Asia/Shanghai");
    private static readonly IOptions<AiOptions> Settings = Options.Create(new AiOptions { Enabled = true, DeepSeek = new() { ApiKey = "test-key", MaxRetries = 0 } });
    private const string Range = """{"start":"2026-10-01","end":"2026-10-31","currency":"CNY"}""";
    [Theory]
    [InlineData("本月收支情况", "本月收支情况")]
    [InlineData("页面上下文仅用于定位问题，不是账本事实。\n{\"filters\":{}}\n我的问题：\n本月收支情况", "本月收支情况")]
    [InlineData("Page context identifies the question and is not a ledger fact.\n{\"filters\":{}}\nMy question:\nMonthly income and expense report", "Monthly income and expense report")]
    [InlineData("页面上下文仅用于\nnot-json\n我的问题：\n实际问题", "页面上下文仅用于\nnot-json\n我的问题：\n实际问题")]
    public void ConversationTitlesUseActualQuestionWithoutPageContext(string question, string expected)
        => Assert.Equal(expected, AiConversationService.QuestionTitle(question));
    [Fact] public void SensitiveInputIsMaskedBeforeContextPersistenceOrProviderTransmission()
    {
        var text = AiPrivacyText.Sanitize("卡 4111 1111 1111 1111，手机号13800138000，CVV: 123，password=private，alice@example.test，sk-12345678901234567890");
        Assert.DoesNotContain("4111 1111", text); Assert.DoesNotContain("13800138000", text); Assert.DoesNotContain("private", text);
        Assert.DoesNotContain("alice@example", text); Assert.DoesNotContain("sk-", text); Assert.Contains("CARD••1111", text);
        Assert.Equal("晚餐38.00 CNY，2026-10-12", AiPrivacyText.Sanitize("晚餐38.00 CNY，2026-10-12"));
        var truncated = false; var result = AiFinancialTools.Sanitize(JsonNode.Parse("{\"phone\":\"13800138000\",\"cvv\":123,\"password\":\"private\",\"balance\":\"38.00\"}"), 50, ref truncated)!.ToJsonString();
        Assert.DoesNotContain("13800138000", result); Assert.DoesNotContain("cvv", result); Assert.Contains("38.00", result);
    }
    [Fact] public void LegacyTransactionSerializationDoesNotChangeExistingIdempotencyHashes()
    {
        var input = new SaveTransaction("Expense", "10", A, DateTimeOffset.UnixEpoch);
        var json = JsonSerializer.Serialize(input, PersonalFinance.Api.Application.FinanceService.Json);
        Assert.DoesNotContain("aiDraftId", json); Assert.DoesNotContain("aiDraftVersion", json); Assert.DoesNotContain("aiDuplicateAcknowledged", json);
        Assert.Contains("aiDraftId", JsonSerializer.Serialize(input with { AiDraftId = B }, PersonalFinance.Api.Application.FinanceService.Json));
    }
    [Fact] public void EmptyInvalidAndRepeatedScopesNeverBecomeAllAccounts()
    {
        Assert.Throws<ApiException>(() => AiRequestContext.ValidateSelection([]));
        Assert.Throws<ApiException>(() => AiRequestContext.ValidateSelection([A, A]));
        Assert.Throws<ApiException>(() => AiRequestContext.ValidateSelection(["SQL"]));
        Assert.Equal("AI_SCOPE_FORBIDDEN", Assert.Throws<ApiException>(() => Context.Resolve(B)).Code);
        Assert.Equal(new[] { A }, Context.Resolve(null));
    }
    [Fact] public void RestrictedScopeHidesUnsupportedToolsAndCannotChangeWithinTemporaryConversation()
    {
        var definitions = AiFinancialTools.Definitions(new() { Enabled = true, AllowSummary = true, AllowDetails = true, AllowFamily = true }, Context).ToJsonString();
        Assert.Contains("GetIncomeExpenseSummary", definitions); Assert.DoesNotContain("GetBudgetExecution", definitions); Assert.DoesNotContain("GetFamilyAdvanceSummary", definitions);
        using var memory = new AiContextService(); var id = Guid.NewGuid().ToString(); memory.Save("alice", id, ["Q"], [A]);
        Assert.Throws<ApiException>(() => memory.RequireScope("alice", id, null));
        Assert.Throws<ApiException>(() => memory.RequireScope("alice", id, [B])); memory.RequireScope("alice", id, [A]);
    }
    [Fact] public void ConfigurationVersionTracksPolicyWithoutPersistingTheKey()
    {
        var o = new AiOptions(); o.DeepSeek.ApiKey = "private-key-never-logged";
        var first = AiGatewayControl.Configuration(o); Assert.DoesNotContain(o.DeepSeek.ApiKey, first.Json);
        o.MaxTotalTools++; Assert.Equal(first.Version, AiGatewayControl.Configuration(o).Version);
        o.TotalTimeoutSeconds++; Assert.NotEqual(first.Version, AiGatewayControl.Configuration(o).Version);
    }
    [Fact] public async Task GatewayConcurrencyIsBoundedAndLeasesAreReleased()
    {
        using var gate = new AiGatewayControl(Options.Create(new AiOptions { MaxConcurrentRequests = 1 }));
        var lease = await gate.Acquire(default);
        Assert.Equal("AI_BUSY", (await Assert.ThrowsAsync<ApiException>(() => gate.Acquire(default))).Code);
        lease.Dispose(); lease.Dispose(); using var next = await gate.Acquire(default);
    }
    private sealed class NoUsage : IAiUsageRecorder
    {
        public Task CheckLimit(string u, CancellationToken ct) => Task.CompletedTask;
        public Task Record(string u, string m, string f, int a, JsonObject? t, string? e) => Task.CompletedTask;
    }
    private sealed class Handler(Func<string, string> reply) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            new(HttpStatusCode.OK) { Content = new StringContent(reply(await request.Content!.ReadAsStringAsync(ct))) };
    }
    [Fact] public async Task UnsupportedCapabilitiesAndOversizedContextNeverReachProvider()
    {
        var calls = 0; using var http = new HttpClient(new Handler(_ => { calls++; return "{}"; }));
        var o = new AiOptions { Enabled = true, MaxContextBytes = 100, DeepSeek = new() { ApiKey = "test", SupportsJson = false } };
        var client = new DeepSeekClient(http, Options.Create(o), new NoUsage());
        Assert.Equal("AI_CAPABILITY_UNSUPPORTED", (await Assert.ThrowsAsync<ApiException>(() => client.Complete("u", [], null, "test", default, json: true))).Code);
        Assert.Equal("AI_CONTEXT_LIMIT", (await Assert.ThrowsAsync<ApiException>(() => client.Complete("u", new JsonArray(new JsonObject { ["role"] = "user", ["content"] = new string('a', 101) }), null, "test", default))).Code);
        Assert.Equal(0, calls);
    }
    [Fact] public async Task GatewayUsesCurrentModelAndCountsActualUtf8Payload()
    {
        string? sent = null;
        using var http = new HttpClient(new Handler(body => { sent = body; return """{"choices":[{"message":{"role":"assistant","content":"ok"}}]}"""; }));
        var o = new AiOptions { Enabled = true, MaxContextBytes = 500, DeepSeek = new() { ApiKey = "test", Model = "deepseek-chat" } };
        var client = new DeepSeekClient(http, Options.Create(o), new NoUsage());
        await client.Complete("u", new JsonArray(new JsonObject { ["role"] = "user", ["content"] = new string('财', 100) }), null, "test", default);
        var payload = JsonNode.Parse(sent!)!;
        Assert.Equal("deepseek-flash", payload["model"]!.GetValue<string>());
        Assert.Equal("disabled", payload["thinking"]!["type"]!.GetValue<string>());
        Assert.Contains("财", sent);
    }
    [DeletionSqlFact] public async Task ScopeAppliesToTotalsTrendsWorthBalancesAndNeverDisclosesOtherAccounts()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var a = f.Account();
        var b = new Account { UserId = f.User, Name = "禁止纳入范围", OpeningBalance = 50000 }; f.Db.Add(b);
        var first = f.Expense(a); var second = f.Expense(b); second.Amount = 700; second.Entries.First(e => e.Kind == "Expense").Amount = 700;
        second.Entries.First(e => e.Kind == "Account").Amount = -700;
        first.OccurredAt = second.OccurredAt = new DateTimeOffset(2026, 10, 12, 0, 0, 0, TimeSpan.FromHours(8)); await f.Db.SaveChangesAsync();
        var consent = new AiPrivacySetting { Enabled = true, AllowSummary = true };
        var dispatcher = new DeepSeekToolDispatcher(new(f.Service, Settings), f.Db, Settings);
        var scope = await dispatcher.CreateContext(f.User, [a.Id], default);
        var report = await dispatcher.Dispatch(f.User, "GetIncomeExpenseSummary", Range, consent, default, scope);
        Assert.Equal("10.00", report.Data!["expense"]!.GetValue<string>()); Assert.Equal("990.00", report.Data["netWorth"]!.GetValue<string>());
        Assert.Equal("10.00", report.Data["points"]![0]!["expense"]!.GetValue<string>());
        Assert.Equal("990.00", report.Data["points"]![0]!["netWorth"]!.GetValue<string>());
        var balances = await dispatcher.Dispatch(f.User, "GetAccountBalances", Range, consent, default, scope);
        Assert.Single(balances.Data!.AsArray()); Assert.Equal(a.Id, balances.Data[0]!["id"]!.GetValue<string>());
        Assert.DoesNotContain(b.Id, JsonSerializer.Serialize(report)); Assert.DoesNotContain(b.Id, balances.Data.ToJsonString());
        Assert.Equal("AI_SCOPE_FORBIDDEN", (await Assert.ThrowsAsync<ApiException>(() => dispatcher.Dispatch(f.User, "GetAccountBalances", Range[..^1] + ",\"accountId\":\"" + b.Id + "\"}", consent, default, scope))).Code);
        Assert.Equal("AI_SCOPE_UNSUPPORTED", (await Assert.ThrowsAsync<ApiException>(() => dispatcher.Dispatch(f.User, "GetBudgetExecution", Range, consent, default, scope))).Code);
        var both = await dispatcher.CreateContext(f.User, [a.Id, b.Id], default);
        var combined = await dispatcher.Dispatch(f.User, "GetIncomeExpenseSummary", Range, consent, default, both);
        Assert.Equal("710.00", combined.Data!["expense"]!.GetValue<string>());
    }
    [DeletionSqlFact] public async Task ScopeRejectsCrossUserAndInventedAccountIdsBeforeProviderCalls()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var a = f.Account(); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => AiRequestContext.Create(f.Db, f.User, [Guid.NewGuid().ToString()], default));
        var victim = Guid.NewGuid().ToString(); f.Db.Users.Add(new AppUser { Id = victim, Email = victim + "@test.local" });
        var account = new Account { UserId = victim, Name = "受保护账户" }; f.Db.Add(account); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => AiRequestContext.Create(f.Db, f.User, [account.Id], default));
    }
    [DeletionSqlFact] public async Task PersistentHistoryIsUserScopedVersionedAndDoesNotCreateLedgerEntries()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var a = f.Account(); await f.Db.SaveChangesAsync();
        var service = new AiConversationService(f.Db, Settings); var c = await AiRequestContext.Create(f.Db, f.User, [a.Id], default); var id = Guid.NewGuid().ToString();
        var result = new AiChatResult(id, "当前数据不足", [], "mock", false, c.RequestId);
        var message = await service.Save(f.User, id, "我的问题", result, c, default);
        Assert.Equal(0, await f.Db.Transactions.CountAsync(x => x.UserId == f.User)); Assert.Equal(0, await f.Db.Entries.CountAsync(x => x.UserId == f.User));
        Assert.Single(await service.History(f.User, id, default)); await Assert.ThrowsAsync<ApiException>(() => service.Get("victim", id, default));
        await Assert.ThrowsAsync<ApiException>(() => service.Feedback("victim", message, 1, default));
        var version = (await service.Get(f.User, id, default)).Version.ToString();
        await service.Change(f.User, id, new(version, "新标题", true), default);
        await Assert.ThrowsAsync<ApiException>(() => service.Change(f.User, id, new(version, "冲突标题"), default));
        await service.Feedback(f.User, message, -1, default); Assert.Equal(-1, (await f.Db.Set<AiMessage>().SingleAsync(x => x.Id == message)).Feedback);
        var page = JsonSerializer.SerializeToNode(await service.List(f.User, new("新标题", true), default), PersonalFinance.Api.Application.FinanceService.Json);
        Assert.Equal(1, page!["total"]!.GetValue<int>());
    }
    [DeletionSqlFact] public async Task LegacyQuotasDoNotBlockAttemptsAndUnknownCostRemainsUnknown()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var o = new AiOptions { DailyCallLimit = 1, InputPricePerMillion = 1, CachedInputPricePerMillion = .1m, OutputPricePerMillion = 2, PriceEffectiveDate = "2026-10-13", DailyCostBudget = 1 };
        var usage = new DeepSeekUsageService(f.Db, Options.Create(o)); await usage.Reserve(f.User, "mock", "chat", 0, default);
        await new DeepSeekUsageService(f.Db, Options.Create(o)).Reserve(f.User, "mock", "chat", 0, default);
        await usage.Record(f.User, "mock", "chat", 0, null, "AI_NETWORK_ERROR");
        var record = await f.Db.Set<AiUsageRecord>().SingleAsync(x => x.UserId == f.User && x.State == "Unresolved"); Assert.Equal("Unresolved", record.State);
        Assert.Null(record.EstimatedCost); Assert.Null(record.ReservedCost); Assert.Equal(2, await f.Db.Set<AiUsageRecord>().CountAsync(x => x.UserId == f.User));
    }
    [DeletionSqlFact] public async Task TinyLegacyBudgetDoesNotBlockModelAttempt()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var o = new AiOptions { InputPricePerMillion = 100, CachedInputPricePerMillion = 1, OutputPricePerMillion = 200, PriceEffectiveDate = "2026-10-13", DailyCostBudget = .000001m };
        var usage = new DeepSeekUsageService(f.Db, Options.Create(o));
        await usage.Reserve(f.User, "mock", "chat", 0, default);
        Assert.Equal(1, await f.Db.Set<AiUsageRecord>().CountAsync(x => x.UserId == f.User));
    }
    [DeletionSqlFact] public async Task RevokedConsentStopsNextModelAttemptAndToolAndExpiredHistoryIsPurged()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var a = f.Account(); await f.Db.SaveChangesAsync();
        var privacy = new AiPrivacyService(f.Db); await privacy.Save(f.User, new(true, true, false, false, false, false), default);
        var p = await privacy.Get(f.User, default);
        var context = (await AiRequestContext.Create(f.Db, f.User, [a.Id], default)) with { ConsentVersion = p.ConsentVersion };
        await privacy.Save(f.User, new(false, false, false, false, false, false), default);
        var usage = new DeepSeekUsageService(f.Db, Settings); usage.AttachContext(context);
        Assert.Equal("AI_CONSENT_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => usage.Reserve(f.User, "mock", "chat", 0, default))).Code);
        var dispatcher = new DeepSeekToolDispatcher(new(f.Service, Settings), f.Db, Settings);
        Assert.Equal("AI_CONSENT_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => dispatcher.Dispatch(f.User, "GetIncomeExpenseSummary", Range, p, default, context))).Code);
        var service = new AiConversationService(f.Db, Settings); var id = Guid.NewGuid().ToString();
        await service.Save(f.User, id, "过期提问", new(id, "过期答案", [], "mock", false), context, default);
        var conversation = await service.Get(f.User, id, default); conversation.ExpiresAt = DateTimeOffset.UtcNow.AddDays(-1); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() => service.Get(f.User, id, default));
        await AiHistoryRetention.Purge(f.Db, default);
        Assert.False(await f.Db.Set<AiMessage>().AnyAsync(x => x.ConversationId == id)); Assert.False(await f.Db.Set<AiConversation>().AnyAsync(x => x.Id == id));
    }
    [DeletionSqlFact] public async Task CompletedChatPersistsHistoryAndLinksRequestToolsAndUsageAudit()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var a = f.Account(); var expense = f.Expense(a);
        expense.OccurredAt = new DateTimeOffset(2026, 10, 12, 0, 0, 0, TimeSpan.FromHours(8)); await f.Db.SaveChangesAsync();
        await new AiPrivacyService(f.Db).Save(f.User, new(true, true, false, false, false, false, true), default);
        var bodies = new List<string>(); using var http = new HttpClient(new Handler(body => {
            bodies.Add(body); var tools = JsonNode.Parse(body)!["messages"]!.AsArray().Any(x => x?["role"]?.GetValue<string>() == "tool");
            return tools ? """{"choices":[{"message":{"role":"assistant","content":"本期支出10.00元"},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":10}}""" :
                """{"choices":[{"message":{"role":"assistant","tool_calls":[{"id":"call1","type":"function","function":{"name":"GetIncomeExpenseSummary","arguments":"{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\",\"currency\":\"CNY\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":20,"completion_tokens":10}}""";
        }));
        using var memory = new AiContextService(); var usage = new DeepSeekUsageService(f.Db, Settings);
        var history = new AiConversationService(f.Db, Settings);
        var chat = new DeepSeekChatService(new DeepSeekClient(http, Settings, usage), new(new(f.Service, Settings), f.Db, Settings), new(f.Db), memory, Settings, history, new(f.Db, Settings));
        var result = await chat.Chat(f.User, new("本月支出", AccountIds: [a.Id]), default); Assert.True(result.FinancialDataVerified); Assert.NotNull(result.MessageId);
        Assert.Equal("Completed", (await f.Db.Set<AiRequestAudit>().SingleAsync(x => x.Id == result.RequestId)).State);
        Assert.Equal(2, await f.Db.Set<AiUsageRecord>().CountAsync(x => x.RequestId == result.RequestId));
        Assert.Single(await f.Db.Set<AiToolAudit>().Where(x => x.RequestId == result.RequestId).ToArrayAsync());
        var second = await chat.Chat(f.User, new("再查本月支出", result.ConversationId), default); Assert.Equal(result.ConversationId, second.ConversationId);
        Assert.Equal(2, (await history.History(f.User, result.ConversationId, default)).Length);
        Assert.DoesNotContain("本期支出10.00元", bodies[2]);
        var configVersion = AiGatewayControl.Configuration(Settings.Value).Version;
        Assert.Equal(1, await f.Db.Set<AiConfigurationSnapshot>().CountAsync(x => x.Id == configVersion));
        await Assert.ThrowsAsync<ApiException>(() => chat.Chat(f.User, new("扩大范围", result.ConversationId, [Guid.NewGuid().ToString()]), default));
    }
    [DeletionSqlFact] public async Task MonthlySummaryQueriesLedgerWhenModelSkipsToolsAndNeverBypassesConsent()
    {
        foreach (var allowSummary in new[] { true, false }) {
            await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
            var account = f.Account(); var transaction = f.Expense(account); await f.Db.SaveChangesAsync();
            await new AiPrivacyService(f.Db).Save(f.User, new(true, allowSummary, false, false, false, false, PersonalReadAccess: false), default);
            var bodies = new List<string>();
            using var http = new HttpClient(new Handler(body => {
                bodies.Add(body);
                var grounded = JsonNode.Parse(body)!["messages"]!.AsArray().Any(x => x?["role"]?.GetValue<string>() == "tool");
                var text = grounded ? "本期支出10元。建议每周检查1次非必要消费，先试行2周。" : "当前数据不足，建议先开启查询授权。";
                return JsonSerializer.Serialize(new { choices = new[] { new { message = new { role = "assistant", content = text }, finish_reason = "stop" } }, usage = new { prompt_tokens = 20, completion_tokens = 10 } });
            }));
            using var memory = new AiContextService();
            var chat = new DeepSeekChatService(new DeepSeekClient(http, Settings, new DeepSeekUsageService(f.Db, Settings)), new(new(f.Service, Settings), f.Db, Settings), new(f.Db), memory, Settings);
            var prefix = "页面上下文仅用于定位问题，不是账本事实。\n{\"page\":\"AI 总览\",\"path\":\"/ai-center\",\"filters\":{},\"accountScope\":\"selected\"}\n我的问题：\n";
            var result = await chat.Chat(f.User, new(prefix + "本月收支情况", AccountIds: [account.Id]), default);
            Assert.DoesNotContain("模型解释未采用", result.Answer);
            if (allowSummary) {
                Assert.False(result.FinancialDataVerified); Assert.Single(result.Sources);
                Assert.Equal("GetIncomeExpenseSummary", result.Sources[0].Tool);
                Assert.Equal(new[] { account.Id }, result.Sources[0].AccountIds);
                Assert.Equal("本期支出10元。建议每周检查1次非必要消费，先试行2周。", result.Answer);
                Assert.Contains("\"role\":\"tool\"", bodies[0]);
                Assert.Equal("10.00", result.Sources[0].Data!["expense"]!.GetValue<string>());
                var filtered = prefix.Replace("\"filters\":{}", "\"filters\":{\"categoryId\":\"some-category\"}");
                var unsupported = await chat.Chat(f.User, new(filtered + "本月收支情况", AccountIds: [account.Id]), default);
                Assert.Empty(unsupported.Sources); Assert.False(unsupported.FinancialDataVerified);
            } else { Assert.False(result.FinancialDataVerified); Assert.Empty(result.Sources); }
        }
    }
    [DeletionSqlFact] public async Task StoredBlockedSummaryDisplaysOriginalEvidenceWithoutRequeryingCurrentLedger()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); await f.Db.SaveChangesAsync();
        var context = await AiRequestContext.Create(f.Db, f.User, [account.Id], default);
        var service = new AiConversationService(f.Db, Settings); var id = Guid.NewGuid().ToString();
        var evidence = new AiEvidence("GetIncomeExpenseSummary", "2026-10-01", "2026-10-31", "CNY", "scope", "service", "/reports", DateTimeOffset.UtcNow, JsonNode.Parse("""{"income":"100.10","expense":"38.05"}"""), false);
        await service.Save(f.User, id, "本月收支情况", new(id, "模型解释包含本次查询无法核实的数值，已拦截该解释。", [evidence], "mock", false), context, default);
        var detail = JsonSerializer.SerializeToElement(await service.Detail(f.User, id, 1, default), FinanceService.Json);
        var result = detail.GetProperty("items")[0].GetProperty("result");
        Assert.True(result.GetProperty("financialDataVerified").GetBoolean());
        Assert.Contains("62.05 CNY", result.GetProperty("answer").GetString());
        Assert.Equal(0, await f.Db.Set<AiToolAudit>().CountAsync(x => x.UserId == f.User));
        Assert.Contains("已拦截", (await f.Db.Set<AiMessage>().SingleAsync(x => x.ConversationId == id)).Answer);
    }
    [DeletionSqlFact] public async Task ConversationListAndDetailRecoverLegacyAutomaticTitlesButPreserveRenames()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); await f.Db.SaveChangesAsync();
        var context = await AiRequestContext.Create(f.Db, f.User, [account.Id], default);
        var service = new AiConversationService(f.Db, Settings); var id = Guid.NewGuid().ToString();
        var question = "页面上下文仅用于定位问题，不是账本事实。分类、状态或情景等筛选若工具不支持，请明确说明，不可冒充已按这些条件查询。\n{\"page\":\"AI中心\",\"filters\":{}}\n我的问题：\n本月收支情况";
        await service.Save(f.User, id, question, new(id, "answer", [], "mock", false), context, default);
        var stored = await service.Get(f.User, id, default); Assert.Equal("本月收支情况", stored.Title);
        stored.Title = question[..60]; await f.Db.SaveChangesAsync();
        var list = JsonSerializer.SerializeToElement(await service.List(f.User, new(), default), FinanceService.Json);
        Assert.Equal("本月收支情况", list.GetProperty("items")[0].GetProperty("title").GetString());
        var detail = JsonSerializer.SerializeToElement(await service.Detail(f.User, id, 1, default), FinanceService.Json);
        Assert.Equal("本月收支情况", detail.GetProperty("conversation").GetProperty("title").GetString());
        Assert.Equal(question[..60], stored.Title); // Display repair does not rewrite stored history.
        stored.Title = "自定义会话名称"; await f.Db.SaveChangesAsync();
        list = JsonSerializer.SerializeToElement(await service.List(f.User, new(), default), FinanceService.Json);
        Assert.Equal("自定义会话名称", list.GetProperty("items")[0].GetProperty("title").GetString());
    }
}
