using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

[Collection("Finance SQL")]
public sealed class AiAgentTests
{
    private static string Json(object value) => JsonSerializer.Serialize(value, FinanceService.Json);
    private sealed class Model : IAiProvider
    {
        public string Tool = "SaveTransaction";
        public string Arguments = "{}";
        public int Calls;
        public Func<JsonArray, JsonObject>? Reply;
        public void EnsureAvailable() { }
        public Task<DeepSeekCompletion> Complete(string user, JsonArray messages, JsonArray? tools, string feature, CancellationToken ct,
            bool json = false, bool reasoning = false, Func<string, Task>? onDelta = null)
        {
            Calls++;
            JsonObject message = messages.Any(x => x?["role"]?.GetValue<string>() == "tool")
                ? new() { ["role"] = "assistant", ["content"] = "已根据工具结果完成任务，详见记录。" }
                : new() { ["role"] = "assistant", ["tool_calls"] = new JsonArray(new JsonObject { ["id"] = "call-" + Calls,
                    ["type"] = "function", ["function"] = new JsonObject { ["name"] = Tool, ["arguments"] = Arguments } }) };
            return Task.FromResult(new DeepSeekCompletion(Reply?.Invoke(messages) ?? message, new JsonObject { ["prompt_tokens"] = 300, ["completion_tokens"] = 100 }));
        }
    }
    private sealed class Fixture : IAsyncDisposable
    {
        public readonly string User = Guid.NewGuid().ToString();
        public readonly string Account = Guid.NewGuid().ToString();
        public readonly string Category = Guid.NewGuid().ToString();
        public readonly Model Model = new();
        public readonly ServiceProvider Provider;
        public Fixture()
        {
            var s = new ServiceCollection(); s.AddLogging(); s.AddDbContext<FinanceDb>(o => o.UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()));
            s.AddSingleton<IOptions<AiOptions>>(Options.Create(new AiOptions { Enabled = true, DeepSeek = new() { ApiKey = "isolated-fake", MaxRetries = 0 } }));
            s.AddSingleton<IAiProvider>(Model); s.AddScoped<FinanceService>(); s.AddScoped<AiAgentConfigurationService>(); s.AddScoped<AiAgentService>();
            s.AddSingleton<AiAgentRuntime>();
            s.AddScoped<AiAgentTools>(); s.AddScoped<AiPrivacyService>(); s.AddScoped<AiFinancialTools>(); s.AddScoped<DeepSeekToolDispatcher>();
            Provider = s.BuildServiceProvider();
        }
        public async Task Seed(string mode = "Confirm")
        {
            await using var scope = Provider.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
            await db.Database.MigrateAsync();
            db.Add(new AppUser { Id = User, Email = User + "@agent.test", PasswordHash = "not-a-login" });
            db.Add(new Account { Id = Account, UserId = User, Name = "Agent现金", OpeningBalance = 1000 });
            var root = new Category { UserId = User, Name = "生活" }; db.Add(root); db.Add(new Category { Id = Category, UserId = User, Name = "餐饮", ParentId = root.Id });
            db.Add(new StatisticsRules { UserId = User }); await db.SaveChangesAsync();
            await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Save(User, new(true, true, true, false, false, false, true), default);
            await scope.ServiceProvider.GetRequiredService<AiAgentConfigurationService>().Save(User, new() { Mode = mode, Model = "deepseek-chat" }, "0", default);
            Model.Arguments = Json(new AgentSave<SaveTransaction>(new("Expense", "12.34", Account, DateTimeOffset.UtcNow, CategoryId: Category)));
        }
        public async Task<string> Create()
        {
            await using var scope = Provider.CreateAsyncScope(); return (await scope.ServiceProvider.GetRequiredService<AiAgentService>().Create(User, new("分析并整理我的财务"), default)).Id;
        }
        public async Task Slice(string id)
        {
            await using var scope = Provider.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
            var task = await db.Set<AiAgentTask>().SingleAsync(x => x.Id == id);
            task.State = "Running"; task.LeaseOwner = Guid.NewGuid().ToString(); task.LeaseUntil = DateTimeOffset.UtcNow.AddMinutes(5); task.Version++; await db.SaveChangesAsync();
            await scope.ServiceProvider.GetRequiredService<AiAgentService>().RunSlice(task, default);
        }
        public async Task<(AiAgentTask Task, AiAgentStep[] Steps)> Read(string id)
        {
            await using var scope = Provider.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
            return (await db.Set<AiAgentTask>().AsNoTracking().SingleAsync(x => x.Id == id), await db.Set<AiAgentStep>().AsNoTracking().Where(x => x.TaskId == id).OrderBy(x => x.Sequence).ToArrayAsync());
        }
        public async ValueTask DisposeAsync() {
            await using (var scope = Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<FinanceDb>().Set<AiAgentTask>()
                .Where(t => t.UserId == User && !AiAgentService.TerminalStates.Contains(t.State)).ExecuteUpdateAsync(s => s.SetProperty(t => t.State, "Cancelled").SetProperty(t => t.CancelRequested, true));
            await Provider.DisposeAsync();
        }
    }
    [Fact] public void RegistryExportsAllRegisteredAuthorizedToolsWithStrictWritableSchemas()
    {
        var p = new AiPrivacySetting { Enabled = true, AllowSummary = true, AllowDetails = true, AllowPayroll = true, AllowFamily = true };
        var context = new AiRequestContext("u", "r", "l", [], false, "zh-CN", "Asia/Shanghai");
        var definitions = AiAgentTools.Definitions(p, context);
        Assert.Equal(AiFinancialTools.Registry.Length + AiAgentTools.Registry.Length, definitions.Count);
        Assert.All(definitions, definition => Assert.Equal("object", definition!["function"]!["parameters"]!["type"]!.GetValue<string>()));
        Assert.Contains(definitions, x => x?["function"]?["name"]?.GetValue<string>() == "SaveTransaction");
        Assert.True(AiContextBudget.Bytes(definitions) < 45000, $"Tool schemas must leave room for task context within the default conservative budget (bytes: {AiContextBudget.Bytes(definitions)})");
        Assert.Throws<ApiException>(() => AiAgentTools.Parse<AgentDelete>("{\"id\":\"one\",\"id\":\"two\",\"version\":\"1\"}"));
        Assert.Throws<ApiException>(() => AiAgentTools.Parse<AgentDelete>("{\"id\":\"one\",\"version\":\"1\",\"userId\":\"victim\"}"));
        Assert.Throws<ApiException>(() => AiAgentTools.Parse<TransactionBatch>("{\"Items\":[{\"id\":\"one\",\"version\":\"1\"}],\"changes\":{\"categoryId\":\"category\"}}"));
    }
    [Fact] public void ArbitraryHistoryAndLongForecastHaveNoFixedDateSpanCeiling()
    {
        var p = new AiPrivacySetting { Enabled = true, AllowSummary = true };
        Assert.NotNull(AiFinancialTools.Validate("GetIncomeExpenseSummary", "{\"start\":\"1901-01-01\",\"end\":\"2026-12-31\",\"currency\":\"CNY\"}", new(), p));
        var result = JsonSerializer.SerializeToNode(AiAgentTools.Forecast(new("2026-01-01", "2050-12-31", "CNY", "1000", "100", "50", Assumptions: "固定每月收支，不含通胀"), default), FinanceService.Json)!;
        Assert.Equal(300, result["rows"]!.AsArray().Count); Assert.False(result["actualData"]!.GetValue<bool>());
        Assert.Equal("16000.00", result["rows"]![299]!["predictedBalance"]!.GetValue<string>());
    }
    [Fact] public void PrivacyRedactionPreservesIdsVersionsAndMoneyButNeverCredentials()
    {
        var n = JsonNode.Parse("{\"id\":\"id\",\"version\":\"2\",\"amount\":\"10.00\",\"merchant\":\"private\",\"note\":\"private\",\"password\":\"secret\"}");
        var result = AiAgentTools.Redact(n, false)!; Assert.Equal("2", result["version"]!.GetValue<string>()); Assert.Null(result["merchant"]); Assert.Null(result["password"]);
    }
    [Fact] public void DetailConsentCannotBypassSummaryConsentThroughCatalogOrCrossAnalysis()
    {
        var p = new AiPrivacySetting { Enabled = true, AllowDetails = true, AllowSummary = false };
        Assert.False(AiAgentTools.Authorized(AiAgentTools.Registry.Single(t => t.Name == "GetFinanceCatalog"), p));
        Assert.False(AiAgentTools.Authorized(AiAgentTools.Registry.Single(t => t.Name == "AnalyzeDimensions"), p));
        Assert.True(AiAgentTools.Authorized(AiAgentTools.Registry.Single(t => t.Name == "SearchTransactions"), p));
    }
    [DeletionSqlFact] public async Task InvestmentHistoryLongerThanTenYearsUsesAnnualPointsWithoutChangingTotals()
    {
        await using var f = new Fixture(); await f.Seed(); await using var scope = f.Provider.CreateAsyncScope();
        var q = new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string, Microsoft.Extensions.Primitives.StringValues> { ["start"] = "1901-01-01", ["end"] = "2026-12-31", ["currency"] = "CNY" });
        var result = JsonSerializer.SerializeToNode(await scope.ServiceProvider.GetRequiredService<FinanceService>().InvestmentPerformance(f.User, q), FinanceService.Json)!;
        Assert.Equal("year", result["granularity"]!.GetValue<string>()); Assert.Equal(126, result["points"]!.AsArray().Count);
        Assert.Equal(0m, decimal.Parse(result["summary"]!["realizedInPeriod"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture));
    }
    [DeletionSqlFact] public async Task SuggestModeCreatesRealValidatedPreviewWithoutLedgerWrites()
    {
        await using var f = new Fixture(); await f.Seed("Suggest"); var id = await f.Create(); await f.Slice(id); await f.Slice(id);
        var (task, steps) = await f.Read(id); Assert.Equal("Suggested", task.State); Assert.NotEqual("{}", Assert.Single(steps).PreviewJson); Assert.Null(steps[0].ResultJson);
        await using var scope = f.Provider.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        Assert.False(await db.Transactions.AnyAsync(x => x.UserId == f.User)); Assert.False(await db.Entries.AnyAsync(x => x.UserId == f.User));
    }
    [DeletionSqlFact] public async Task ConfirmModeRequiresExactPlanAndCommitsFinanceAuditAndIdempotencyOnce()
    {
        await using var f = new Fixture(); await f.Seed(); var id = await f.Create(); await f.Slice(id); await f.Slice(id);
        var (task, steps) = await f.Read(id); Assert.Equal("AwaitingApproval", task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var s = scope.ServiceProvider.GetRequiredService<AiAgentService>();
            await Assert.ThrowsAsync<ApiException>(() => s.Approve(f.User, id, new(task.Version.ToString(), ["wrong"]), default));
        }
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(task.Version.ToString(), steps.Select(x => x.PlanHash).ToArray()), default);
        await f.Slice(id); await f.Slice(id); var done = await f.Read(id); Assert.Equal("Completed", done.Task.State); Assert.Equal("Completed", done.Steps[0].State);
        await using var check = f.Provider.CreateAsyncScope(); var db = check.ServiceProvider.GetRequiredService<FinanceDb>();
        Assert.Equal(1, await db.Transactions.CountAsync(x => x.UserId == f.User)); Assert.Equal(2, await db.Entries.CountAsync(x => x.UserId == f.User));
        Assert.Equal(1, await db.Idempotencies.CountAsync(x => x.UserId == f.User && x.Key == "ai-agent:" + steps[0].Id));
        Assert.Equal(987.66m, await check.ServiceProvider.GetRequiredService<FinanceService>().Balance(f.User, f.Account));
        Assert.True(await db.AuditRecords.AnyAsync(x => x.UserId == f.User && x.Source == "AiAgent"));
    }
    [DeletionSqlFact] public async Task AutoModeRequiresExactPlanDespiteScopedGrantAndDeleteNeedsSeparateAuthorization()
    {
        await using var f = new Fixture(); await f.Seed("Auto");
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("SaveTransaction", [f.Account]), default);
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); var pending = await f.Read(id);
        Assert.Equal("AwaitingApproval", pending.Task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            Assert.False(await scope.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.AnyAsync(t => t.UserId == f.User));
            await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(pending.Task.Version.ToString(), pending.Steps.Select(s => s.PlanHash).ToArray()), default);
        }
        await f.Slice(id); await f.Slice(id); var first = await f.Read(id); Assert.Equal("Completed", first.Task.State);
        string transaction;
        await using (var scope = f.Provider.CreateAsyncScope()) transaction = await scope.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.Where(x => x.UserId == f.User).Select(x => x.Id).SingleAsync();
        f.Model.Tool = "BatchDeleteTransactions"; f.Model.Arguments = Json(new TransactionDeletion([new(transaction, "1")]));
        var deleting = await f.Create(); await f.Slice(deleting); await f.Slice(deleting); var plan = await f.Read(deleting);
        Assert.Equal("AwaitingApproval", plan.Task.State); Assert.True(plan.Steps[0].HighRisk);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var s = scope.ServiceProvider.GetRequiredService<AiAgentService>();
            await Assert.ThrowsAsync<ApiException>(() => s.Grant(f.User, new("BatchDeleteTransactions", []), default));
            await Assert.ThrowsAsync<ApiException>(() => s.Approve(f.User, deleting, new(plan.Task.Version.ToString(), [plan.Steps[0].PlanHash]), default));
        }
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, deleting, new(plan.Task.Version.ToString(), [plan.Steps[0].PlanHash], true), default);
        await f.Slice(deleting); Assert.Equal("Completed", (await f.Read(deleting)).Steps[0].State);
        await using var check = f.Provider.CreateAsyncScope(); Assert.Equal("Deleted", (await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.SingleAsync(x => x.Id == transaction)).Status);
    }
    [DeletionSqlFact] public async Task CrossUserWriteAndExpiredGrantAreRejectedAndEmergencyStopCancelsAllTasks()
    {
        await using var f = new Fixture(); await f.Seed("Auto");
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); db.Add(new AiAgentGrant { UserId = f.User, Tool = "SaveTransaction", ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) }); await db.SaveChangesAsync();
        }
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); Assert.Equal("AwaitingApproval", (await f.Read(id)).Task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var s = scope.ServiceProvider.GetRequiredService<AiAgentService>(); await Assert.ThrowsAsync<ApiException>(() => s.Get("other-user", id, default));
            await s.Stop(f.User, null, default);
            await Assert.ThrowsAsync<ApiException>(() => s.Create(f.User, new("更多任务"), default));
        }
        Assert.Equal("Cancelled", (await f.Read(id)).Task.State);
        await using var check = f.Provider.CreateAsyncScope(); Assert.False(await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.AnyAsync(x => x.UserId == f.User));
    }
    [DeletionSqlFact] public async Task CrossUserAccountCannotBeUsedByWritableToolsEvenWithGlobalAutoGrant()
    {
        await using var f = new Fixture(); await f.Seed("Auto"); var victim = Guid.NewGuid().ToString(); var victimAccount = Guid.NewGuid().ToString();
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); db.Add(new AppUser { Id = victim, Email = victim + "@agent.test", PasswordHash = "none" });
            db.Add(new Account { Id = victimAccount, UserId = victim, Name = "私密", OpeningBalance = 1000000 }); await db.SaveChangesAsync();
            await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("SaveTransaction", []), default);
        }
        f.Model.Arguments = Json(new AgentSave<SaveTransaction>(new("Expense", "12.34", victimAccount, DateTimeOffset.UtcNow, CategoryId: f.Category)));
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); var result = await f.Read(id);
        Assert.Equal("Rejected", result.Steps[0].State); Assert.Equal("AI_SCOPE_FORBIDDEN", result.Steps[0].ErrorCode);
        await using var check = f.Provider.CreateAsyncScope(); Assert.False(await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.AnyAsync(t => t.UserId == f.User));
    }
    [DeletionSqlFact] public async Task RevokedAutomaticGrantBlocksThePreparedStepWithoutChangingLedger()
    {
        await using var f = new Fixture(); await f.Seed("Auto"); var id = await f.Create(); await f.Slice(id);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); db.Add(new AiAgentGrant { UserId = f.User, Tool = "SaveTransaction", RevokedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync();
        }
        await f.Slice(id); var result = await f.Read(id); Assert.Equal("AwaitingApproval", result.Task.State);
        await using var check = f.Provider.CreateAsyncScope(); Assert.False(await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.AnyAsync(t => t.UserId == f.User));
    }
    [DeletionSqlFact] public async Task VersionChangeAfterPreviewRejectsApprovedUpdateInsteadOfOverwritingNewData()
    {
        await using var f = new Fixture(); await f.Seed(); string txId;
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); var service = scope.ServiceProvider.GetRequiredService<FinanceService>();
            var result = await service.Write(f.User, AiAgentService.Context(Guid.NewGuid().ToString(), "/test", default), new { }, async () => await service.SaveTransaction(f.User, new("Expense", "10.00", f.Account, DateTimeOffset.UtcNow, CategoryId: f.Category)));
            txId = JsonSerializer.SerializeToNode(result, FinanceService.Json)!["id"]!.GetValue<string>();
        }
        f.Model.Arguments = Json(new AgentSave<SaveTransaction>(new("Expense", "20.00", f.Account, DateTimeOffset.UtcNow, CategoryId: f.Category), txId, "1"));
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); var plan = await f.Read(id); Assert.Equal("AwaitingApproval", plan.Task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); var tx = await db.Transactions.SingleAsync(t => t.Id == txId); tx.Merchant = "用户最新修改"; tx.Version++; await db.SaveChangesAsync();
        }
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(plan.Task.Version.ToString(), [plan.Steps[0].PlanHash]), default);
        await f.Slice(id); var rejected = await f.Read(id); Assert.Equal("Rejected", rejected.Steps[0].State); Assert.Equal("AI_PLAN_STALE", rejected.Steps[0].ErrorCode);
        await using var check = f.Provider.CreateAsyncScope(); var saved = await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.SingleAsync(t => t.Id == txId);
        Assert.Equal(10m, saved.Amount); Assert.Equal("用户最新修改", saved.Merchant);
    }
    [DeletionSqlFact] public async Task DynamicAgentCanRunMoreThanFourRoundsAndReuseProviderCallIdentifiers()
    {
        await using var f = new Fixture(); await f.Seed("Suggest");
        f.Model.Reply = _ => f.Model.Calls <= 8 ? new JsonObject { ["role"] = "assistant", ["tool_calls"] = new JsonArray(new JsonObject {
            ["id"] = "same-provider-id", ["type"] = "function", ["function"] = new JsonObject { ["name"] = "GetStatisticsRules", ["arguments"] = "{}" } }) }
            : new JsonObject { ["role"] = "assistant", ["content"] = "已完成多轮分析" };
        var id = await f.Create(); for (var i = 0; i < 17; i++) await f.Slice(id);
        var result = await f.Read(id); Assert.Equal("Completed", result.Task.State); Assert.Equal(9, result.Task.ModelCalls); Assert.Equal(8, result.Task.ToolCalls);
        Assert.Equal(8, result.Steps.Select(s => s.CallId).Distinct().Count());
    }
    [DeletionSqlFact] public async Task ConfigurationRejectsResourceOverflowAndForeignAccountScope()
    {
        await using var f = new Fixture(); await f.Seed(); await using var scope = f.Provider.CreateAsyncScope();
        var settings = scope.ServiceProvider.GetRequiredService<AiAgentConfigurationService>();
        Assert.Equal("AI_MODEL_UNREGISTERED", (await Assert.ThrowsAsync<ApiException>(() => settings.Validate(f.User, new() { Model = "arbitrary-host-model" }, default))).Code);
        Assert.Equal("AI_CONFIGURATION_INVALID", (await Assert.ThrowsAsync<ApiException>(() => settings.Validate(f.User, new() { ContextTokens = int.MaxValue }, default))).Code);
        await Assert.ThrowsAsync<ApiException>(() => settings.Validate(f.User, new() { AccountIds = [Guid.NewGuid().ToString()] }, default));
        var valid = await settings.Validate(f.User, new() { ToolBudget = 2000, ModelCallBudget = 1000, TokenBudget = 2000000, TimeoutSeconds = 3600 }, default);
        Assert.Equal(2000, valid.ToolBudget);
    }
    [DeletionSqlFact] public async Task OneCompleteApprovalExecutesMultipleStepsSharingAnAccountWithoutReconfirmation()
    {
        await using var f = new Fixture(); await f.Seed();
        f.Model.Reply = messages => messages.Any(m => m?["role"]?.GetValue<string>() == "tool") ? new JsonObject { ["role"] = "assistant", ["content"] = "已完成" } :
            new JsonObject { ["role"] = "assistant", ["tool_calls"] = new JsonArray(Enumerable.Range(1, 2).Select(n => (JsonNode)new JsonObject {
                ["id"] = "multi-" + n, ["type"] = "function", ["function"] = new JsonObject { ["name"] = "SaveTransaction", ["arguments"] = Json(new AgentSave<SaveTransaction>(new("Expense", n + ".00", f.Account, DateTimeOffset.UtcNow, CategoryId: f.Category))) } }).ToArray()) };
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); var plan = await f.Read(id); Assert.Equal("AwaitingApproval", plan.Task.State); Assert.Equal(2, plan.Steps.Length);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var s = scope.ServiceProvider.GetRequiredService<AiAgentService>();
            await Assert.ThrowsAsync<ApiException>(() => s.Approve(f.User, id, new(plan.Task.Version.ToString(), [plan.Steps[0].PlanHash]), default));
        }
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(plan.Task.Version.ToString(), plan.Steps.Select(s => s.PlanHash).ToArray()), default);
        await f.Slice(id); await f.Slice(id); var done = await f.Read(id); Assert.Equal("Completed", done.Task.State); Assert.All(done.Steps, s => Assert.Equal("Completed", s.State));
        await using var check = f.Provider.CreateAsyncScope(); Assert.Equal(997m, await check.ServiceProvider.GetRequiredService<FinanceService>().Balance(f.User, f.Account));
    }
    [Fact] public void EmergencyRuntimeCancellationIsUserScopedAndDisposalCannotRemoveAnotherLease()
    {
        var runtime = new AiAgentRuntime(); using var a = new CancellationTokenSource(); using var b = new CancellationTokenSource();
        using var one = runtime.Register("one", "a", a); using var two = runtime.Register("two", "b", b);
        runtime.Cancel("one"); Assert.True(a.IsCancellationRequested); Assert.False(b.IsCancellationRequested);
    }
    [Fact] public void OversizedToolResultKeepsLatestPairAndReturnsPagingGuidanceInsteadOfLosingTheRound()
    {
        var messages = new JsonArray(new JsonObject { ["role"] = "system", ["content"] = "system" }, new JsonObject { ["role"] = "user", ["content"] = "task" },
            new JsonObject { ["role"] = "assistant", ["tool_calls"] = new JsonArray(new JsonObject { ["id"] = "call", ["function"] = new JsonObject { ["name"] = "SearchTransactions", ["arguments"] = "{}" } }) },
            new JsonObject { ["role"] = "tool", ["tool_call_id"] = "call", ["content"] = Json(new { data = new string('x', 100000) }) });
        AiAgentService.FitContext(messages, 3000); Assert.Equal(4, messages.Count);
        Assert.Contains("AI_TOOL_RESULT_BUDGET", messages[3]!["content"]!.GetValue<string>()); Assert.True(Encoding.UTF8.GetByteCount(messages.ToJsonString()) <= 3000);
    }
    [DeletionSqlFact] public async Task AuthorizedReportWorkflowQueriesActualDataAndSavesReportWithSourcesWithoutLedgerWrites()
    {
        await using var f = new Fixture(); await f.Seed("Auto");
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("SaveFinancialReport", []), default);
        f.Model.Reply = _ => f.Model.Calls <= 2 ? new JsonObject { ["role"] = "assistant", ["tool_calls"] = new JsonArray(new JsonObject { ["id"] = "report-call", ["type"] = "function",
            ["function"] = new JsonObject { ["name"] = f.Model.Calls == 1 ? "GetIncomeExpenseSummary" : "SaveFinancialReport", ["arguments"] = f.Model.Calls == 1 ?
                "{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\",\"currency\":\"CNY\"}" : Json(new AgentReport("本月报告", "本期支出0.00元。")) } }) }
            : new JsonObject { ["role"] = "assistant", ["content"] = "报告已保存。" };
        var id = await f.Create(); for (var i = 0; i < 4; i++) await f.Slice(id);
        var prepared = await f.Read(id); Assert.Equal("AwaitingApproval", prepared.Task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(prepared.Task.Version.ToString(), prepared.Steps.Where(s => s.State == "Planned").Select(s => s.PlanHash).ToArray()), default);
        await f.Slice(id); await f.Slice(id);
        Assert.Equal("Completed", (await f.Read(id)).Task.State);
        await using var check = f.Provider.CreateAsyncScope(); var db = check.ServiceProvider.GetRequiredService<FinanceDb>();
        var report = await db.Set<AiAgentReport>().SingleAsync(r => r.UserId == f.User); Assert.Equal(id, report.TaskId); Assert.Contains("GetIncomeExpenseSummary", report.SourcesJson);
        Assert.False(await db.Transactions.AnyAsync(t => t.UserId == f.User));
    }
    [DeletionSqlFact] public async Task HostedSchedulerPreparesOnePlanButCannotWriteUsingLegacyBroadGrants()
    {
        await using var f = new Fixture(); await f.Seed("Auto"); var workflow = Guid.NewGuid().ToString();
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
            // The named RestoreCheck database contains test fixtures only. Stop leftover fixture tasks before exercising the real dispatcher.
            await db.Set<AiAgentTask>().Where(t => !AiAgentService.TerminalStates.Contains(t.State)).ExecuteUpdateAsync(s => s.SetProperty(t => t.State, "Cancelled").SetProperty(t => t.CancelRequested, true));
            db.Add(new AiAgentWorkflow { Id = workflow, UserId = f.User, Name = "隔离定时工作流", Prompt = "执行已授权操作", Enabled = true, IntervalMinutes = 1, NextRunAt = DateTimeOffset.UtcNow.AddMinutes(-1), AccountIdsJson = "null" });
            await db.SaveChangesAsync(); await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("SaveTransaction", [f.Account]), default);
        }
        using var worker = new AiAgentWorker(f.Provider.GetRequiredService<IServiceScopeFactory>(), f.Provider.GetRequiredService<IOptions<AiOptions>>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<AiAgentWorker>.Instance, f.Provider.GetRequiredService<AiAgentRuntime>());
        await worker.StartAsync(default);
        try {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25)); var complete = false;
            while (!complete) {
                await Task.Delay(200, deadline.Token); await using var scope = f.Provider.CreateAsyncScope();
                var task = await scope.ServiceProvider.GetRequiredService<FinanceDb>().Set<AiAgentTask>().AsNoTracking().SingleOrDefaultAsync(t => t.UserId == f.User && t.WorkflowId == workflow);
                complete = task?.State == "AwaitingApproval";
                Assert.NotEqual("Failed", task?.State);
            }
        } finally { using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10)); await worker.StopAsync(stop.Token); }
        await using var check = f.Provider.CreateAsyncScope(); var finalDb = check.ServiceProvider.GetRequiredService<FinanceDb>();
        Assert.Equal(0, await finalDb.Transactions.CountAsync(t => t.UserId == f.User));
        Assert.Equal(1, await finalDb.Set<AiAgentTask>().CountAsync(t => t.UserId == f.User && t.WorkflowId == workflow));
    }
    [DeletionSqlFact] public async Task LastAllowedToolStillAllowsFinalAnswerWithoutAnExtraToolBudget()
    {
        await using var f = new Fixture(); await f.Seed("Suggest");
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var settings = scope.ServiceProvider.GetRequiredService<AiAgentConfigurationService>(); var (row, config) = await settings.Get(f.User, default);
            await settings.Save(f.User, config with { ToolBudget = 1 }, row!.Version.ToString(), default);
        }
        f.Model.Tool = "GetStatisticsRules"; f.Model.Arguments = "{}";
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); await f.Slice(id);
        var result = await f.Read(id); Assert.Equal("Completed", result.Task.State); Assert.Equal(1, result.Task.ToolCalls); Assert.Equal(2, result.Task.ModelCalls);
    }
    [DeletionSqlFact] public async Task LegacyCallBudgetDoesNotInterruptCommittedFinancialSteps()
    {
        await using var f = new Fixture(); await f.Seed("Auto");
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var settings = scope.ServiceProvider.GetRequiredService<AiAgentConfigurationService>(); var (row, config) = await settings.Get(f.User, default);
            await settings.Save(f.User, config with { ModelCallBudget = 1 }, row!.Version.ToString(), default);
            await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("SaveTransaction", [f.Account]), default);
        }
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); var prepared = await f.Read(id);
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(prepared.Task.Version.ToString(), prepared.Steps.Select(s => s.PlanHash).ToArray()), default);
        await f.Slice(id); await f.Slice(id); var failed = await f.Read(id);
        Assert.Equal("Completed", failed.Task.State); Assert.Null(failed.Task.ErrorCode);
        Assert.Equal("Completed", failed.Steps[0].State); Assert.Equal(1, failed.Task.ToolCalls);
        await using var check = f.Provider.CreateAsyncScope(); Assert.Equal(1, await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.CountAsync(t => t.UserId == f.User));
    }
    [DeletionSqlFact] public async Task RevokingDataConsentWhileFailedPreventsRetryOfOldFinancialContext()
    {
        await using var f = new Fixture(); await f.Seed(); var id = await f.Create();
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); var task = await db.Set<AiAgentTask>().SingleAsync(t => t.Id == id);
            task.State = "Failed"; task.ErrorCode = "AI_NETWORK_ERROR"; task.Version++; await db.SaveChangesAsync();
            await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Save(f.User, new(true, false, false, false, false, false, true), default);
        }
        var failed = await f.Read(id);
        await using var retry = f.Provider.CreateAsyncScope(); var error = await Assert.ThrowsAsync<ApiException>(() => retry.ServiceProvider.GetRequiredService<AiAgentService>().Retry(f.User, id, failed.Task.Version.ToString(), default));
        Assert.Equal("AI_CONSENT_CHANGED", error.Code); Assert.Equal(0, f.Model.Calls);
    }
    [Fact] public void NarrowBatchToolsCannotModifyFieldsOutsideTheirAuthorizationType()
    {
        AiAgentTools.ValidateRestrictedBatch("BatchClassifyTransactions", new([], new(CategoryId: "category")));
        Assert.Throws<ApiException>(() => AiAgentTools.ValidateRestrictedBatch("BatchClassifyTransactions", new([], new(CategoryId: "category", SetMerchant: true, Merchant: "other"))));
        Assert.Throws<ApiException>(() => AiAgentTools.ValidateRestrictedBatch("BatchAddTags", new([], new(AddTagIds: ["tag"], RemoveTagIds: ["old"]))));
        Assert.Throws<ApiException>(() => AiAgentTools.ValidateRestrictedBatch("BatchNormalizeMerchants", new([], new(SetMerchant: true, Merchant: "name", SetNote: true, Note: "changed"))));
    }
    [DeletionSqlFact] public async Task ClassificationGrantCannotReplaceApprovalOfTheSpecificChanges()
    {
        await using var f = new Fixture(); await f.Seed("Auto"); string transaction; var category = Guid.NewGuid().ToString();
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>(); var finance = scope.ServiceProvider.GetRequiredService<FinanceService>();
            var parent = await db.Categories.Where(c => c.UserId == f.User && c.ParentId == null).Select(c => c.Id).SingleAsync();
            db.Add(new Category { Id = category, UserId = f.User, Name = "交通", ParentId = parent }); await db.SaveChangesAsync();
            var result = await finance.Write(f.User, AiAgentService.Context(Guid.NewGuid().ToString(), "/test", default), new { }, async () =>
                await finance.SaveTransaction(f.User, new("Expense", "10.00", f.Account, DateTimeOffset.UtcNow, "原备注", f.Category)));
            transaction = JsonSerializer.SerializeToNode(result, FinanceService.Json)!["id"]!.GetValue<string>();
        }
        f.Model.Tool = "BatchClassifyTransactions"; f.Model.Arguments = Json(new TransactionBatch([new(transaction, "1")], new(CategoryId: category)));
        var id = await f.Create(); await f.Slice(id); await f.Slice(id); Assert.Equal("AwaitingApproval", (await f.Read(id)).Task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("BatchClassifyTransactions", [f.Account]), default);
        Assert.Equal("Queued", (await f.Read(id)).Task.State); await f.Slice(id);
        var prepared = await f.Read(id); Assert.Equal("AwaitingApproval", prepared.Task.State);
        await using (var scope = f.Provider.CreateAsyncScope()) {
            Assert.Equal(f.Category, (await scope.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.SingleAsync(t => t.Id == transaction)).CategoryId);
            await scope.ServiceProvider.GetRequiredService<AiAgentService>().Approve(f.User, id, new(prepared.Task.Version.ToString(), prepared.Steps.Select(s => s.PlanHash).ToArray()), default);
        }
        await f.Slice(id); await f.Slice(id); Assert.Equal("Completed", (await f.Read(id)).Task.State);
        await using var check = f.Provider.CreateAsyncScope(); var tx = await check.ServiceProvider.GetRequiredService<FinanceDb>().Transactions.SingleAsync(t => t.Id == transaction);
        Assert.Equal(category, tx.CategoryId); Assert.Equal("原备注", tx.Note); Assert.Null(tx.Merchant);
    }
    [DeletionSqlFact] public async Task GeneralConversationDoesNotTransmitAccountIdsFromScopeOrGrantsWithoutFinancialConsent()
    {
        await using var f = new Fixture(); await f.Seed("Suggest");
        await using (var scope = f.Provider.CreateAsyncScope()) {
            var settings = scope.ServiceProvider.GetRequiredService<AiAgentConfigurationService>(); var (row, config) = await settings.Get(f.User, default);
            await settings.Save(f.User, config with { AccountIds = [f.Account] }, row!.Version.ToString(), default);
            await scope.ServiceProvider.GetRequiredService<AiAgentService>().Grant(f.User, new("SaveTransaction", [f.Account]), default);
            await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Save(f.User, new(true, false, false, false, false, false, true, PersonalReadAccess: false), default);
        }
        string? sent = null; f.Model.Reply = messages => { sent = messages.ToJsonString(); return new JsonObject { ["role"] = "assistant", ["content"] = "通用财务知识" }; };
        var id = await f.Create(); await f.Slice(id); Assert.Equal("Completed", (await f.Read(id)).Task.State);
        Assert.NotNull(sent); Assert.DoesNotContain(f.Account, sent); Assert.DoesNotContain("Agent现金", sent);
    }
    [DeletionSqlFact] public async Task CrossConversationReferenceCannotResendDataAfterConsentWasChanged()
    {
        await using var f = new Fixture(); await f.Seed("Suggest"); f.Model.Reply = _ => new JsonObject { ["role"] = "assistant", ["content"] = "历史回答" };
        var id = await f.Create(); await f.Slice(id);
        await using var scope = f.Provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Save(f.User, new(true, false, false, false, false, false, true), default);
        var error = await Assert.ThrowsAsync<ApiException>(() => scope.ServiceProvider.GetRequiredService<AiAgentService>().Create(f.User, new("继续", id), default));
        Assert.Equal("AI_CONSENT_CHANGED", error.Code); Assert.Equal(1, f.Model.Calls);
    }
    [DeletionSqlFact] public async Task AgentRetainsAnalysisAndAdviceInsteadOfReplacingItWithLedgerSummary()
    {
        await using var f = new Fixture(); await f.Seed("Suggest");
        const string analysis = "建议每周检查2次预算，连续观察3周后再调整分类目标。";
        f.Model.Reply = messages => messages.Any(m => m?["role"]?.GetValue<string>() == "tool")
            ? new JsonObject { ["role"] = "assistant", ["content"] = analysis }
            : new JsonObject { ["role"] = "assistant", ["tool_calls"] = new JsonArray(new JsonObject {
                ["id"] = "read-summary", ["type"] = "function", ["function"] = new JsonObject { ["name"] = "GetIncomeExpenseSummary", ["arguments"] = "{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\",\"currency\":\"CNY\"}" } }) };
        var id = await f.Create();
        for (var i = 0; i < 4 && (await f.Read(id)).Task.State != "Completed"; i++) await f.Slice(id);
        var result = await f.Read(id);
        Assert.Equal("Completed", result.Task.State); Assert.Equal(analysis, result.Task.Answer);
        Assert.Contains("GetIncomeExpenseSummary", result.Task.SourcesJson);
    }
}

