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
public sealed class AiAnalysisSqlTests
{
    private static string Json(object x) => JsonSerializer.Serialize(x, FinanceService.Json);
    private sealed class Model : IAiProvider
    {
        public Func<int, JsonObject>? Reply;
        public int Calls;
        public HashSet<string> Advertised = [];
        public void EnsureAvailable() { }
        public Task<DeepSeekCompletion> Complete(string u, JsonArray m, JsonArray? tools, string feature, CancellationToken ct,
            bool json = false, bool reasoning = false, Func<string, Task>? onDelta = null) {
            foreach (var tool in tools ?? []) Advertised.Add(tool!["function"]!["name"]!.ToString());
            Calls++;
            return Task.FromResult(new DeepSeekCompletion(Reply?.Invoke(Calls) ?? Tool("SubmitAnalysis", Json(new AiNarrative("依据本次账本进行分析。", [new("支出追踪", "已查询大额交易及同口径汇总，原因仍需结合实际用途核对。", "inference", ["e0"])], [], []))), null));
        }
        public static JsonObject Tool(string name, string arguments) => new() { ["role"] = "assistant", ["tool_calls"] = new JsonArray(new JsonObject { ["id"] = "call_" + Guid.NewGuid().ToString("N"), ["type"] = "function", ["function"] = new JsonObject { ["name"] = name, ["arguments"] = arguments } }) };
    }
    private sealed class Fixture : IAsyncDisposable
    {
        public readonly string User = Guid.NewGuid().ToString(), Account = Guid.NewGuid().ToString(), OtherAccount = Guid.NewGuid().ToString();
        public readonly ServiceProvider Services;
        public readonly Model Model = new();
        public string Expense = "";
        public string Month = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM");
        public Fixture() {
            var services = new ServiceCollection(); services.AddLogging();
            services.AddDbContext<FinanceDb>(o => o.UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()));
            services.AddSingleton<IOptions<AiOptions>>(Options.Create(new AiOptions { Enabled = true, MaxContextBytes = 200000, DeepSeek = new() { ApiKey = "synthetic" } }));
            services.AddSingleton<IAiProvider>(Model); services.AddSingleton<AiContextService>();
            services.AddScoped<FinanceService>(); services.AddScoped<AiPrivacyService>(); services.AddScoped<AiFinancialTools>();
            services.AddScoped<DeepSeekToolDispatcher>(); services.AddScoped<AiAgentTools>(); services.AddScoped<AiReadToolExecutor>();
            services.AddScoped<AiConversationService>(); services.AddScoped<AiRequestAuditService>(); services.AddScoped<DeepSeekChatService>();
            services.AddScoped<AiAgentConfigurationService>();
            Services = services.BuildServiceProvider();
        }
        public async Task Seed() {
            await using var scope = Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
            await db.Database.MigrateAsync();
            db.Add(new AppUser { Id = User, Email = User + "@analysis.test", PasswordHash = "synthetic-only" });
            db.Add(new Account { Id = Account, UserId = User, Name = "现金", OpeningBalance = 100000 });
            db.Add(new Account { Id = OtherAccount, UserId = User, Name = "另一个账户", OpeningBalance = 10000 });
            var expenseRoot = new Category { UserId = User, Name = "生活", Kind = "Expense" }; db.Add(expenseRoot);
            var category = new Category { UserId = User, Name = "车辆", Kind = "Expense", ParentId = expenseRoot.Id }; db.Add(category);
            var incomeRoot = new Category { UserId = User, Name = "收入", Kind = "Income" }; db.Add(incomeRoot);
            var income = new Category { UserId = User, Name = "工资", Kind = "Income", ParentId = incomeRoot.Id }; db.Add(income);
            db.Add(new StatisticsRules { UserId = User }); await db.SaveChangesAsync();
            var finance = scope.ServiceProvider.GetRequiredService<FinanceService>();
            var date = DateTimeOffset.Parse(Month + "-01T12:00:00+08:00");
            var expense = JsonSerializer.SerializeToNode(await finance.SaveTransaction(User, new("Expense", "3399", Account, date, CategoryId: category.Id)), FinanceService.Json)!;
            Expense = expense["id"]!.ToString(); await db.SaveChangesAsync();
            await finance.SaveTransaction(User, new("Expense", "100", Account, date.AddHours(1), CategoryId: category.Id)); await db.SaveChangesAsync();
            await finance.SaveTransaction(User, new("Refund", "399", Account, date.AddHours(2), OriginalTransactionId: Expense)); await db.SaveChangesAsync();
            await finance.SaveTransaction(User, new("Income", "10000", Account, date, CategoryId: income.Id)); await db.SaveChangesAsync();
            await finance.SaveTransaction(User, new("Transfer", "100", Account, date, ToAccountId: OtherAccount)); await db.SaveChangesAsync();
            await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Save(User, new(true, false, false, false, false, false, true), default);
        }
        public async Task<AiChatResult> Chat(string text, string? conversation = null, string[]? accounts = null) {
            await using var scope = Services.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<DeepSeekChatService>().Chat(User, new(text, conversation, accounts), default);
        }
        public async ValueTask DisposeAsync() => await Services.DisposeAsync();
    }
    [DeletionSqlFact] public async Task MonthlyAnalysisInvestigatesTransactionsAndMatchesTheRealReport()
    {
        await using var f = new Fixture(); await f.Seed(); var result = await f.Chat("分析我本月的财务状况。");
        Assert.Contains(result.Sources, s => s.Tool == "SearchTransactions"); Assert.Contains(result.Sources, s => s.Tool == "GetTransactionDetail");
        var investigated = result.Sources.Single(s => s.Tool == "GetTransactionDetail");
        Assert.Contains(investigated.Data!["relatedTransactions"]!.AsArray(), row => row?["type"]?.ToString() == "Refund");
        Assert.Contains("AnalyzeDimensions", f.Model.Advertised); Assert.DoesNotContain("SaveTransaction", f.Model.Advertised);
        Assert.Equal("3100.00", result.Analysis!.KeyMetrics.Single(m => m.Key == "expense").Value);
        Assert.Equal("10000.00", result.Analysis.KeyMetrics.Single(m => m.Key == "income").Value);
        Assert.Equal("6900.00", result.Analysis.KeyMetrics.Single(m => m.Key == "surplus").Value);
        Assert.NotEmpty(result.Analysis.TrendSeries); Assert.NotEmpty(result.Analysis.CategoryBreakdown);
        await using var scope = f.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        Assert.Contains(await db.Set<AiToolAudit>().Where(a => a.UserId == f.User).ToArrayAsync(), a => a.Tool == "SearchTransactions" && a.Succeeded);
        var stored = await scope.ServiceProvider.GetRequiredService<AiConversationService>().Detail(f.User, result.ConversationId, 1, default);
        Assert.Contains("schemaVersion", Json(stored)); Assert.Contains("3100.00", Json(stored));
    }
    [DeletionSqlFact] public async Task FollowUpRetainsPeriodAndUsesDecimalExclusionWithRefunds()
    {
        await using var f = new Fixture(); await f.Seed(); var first = await f.Chat("为什么本月支出这么高？");
        Assert.Contains(first.Sources, s => s.Tool == "GetIncomeExpenseSummary");
        await using (var scope = f.Services.CreateAsyncScope()) {
            var history = await scope.ServiceProvider.GetRequiredService<AiConversationService>().History(f.User, first.ConversationId, default);
            Assert.Contains(history, text => text.Contains("调查定位"));
            Assert.NotEmpty(AiInvestigationPlan.Monthly("排除最大的一笔交易后呢？", history, DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime), false, []));
        }
        var call = f.Model.Calls;
        f.Model.Reply = n => n == call + 1 ? Model.Tool("AnalyzeExpenseExclusion", Json(new AgentExclusion(f.Month + "-01", f.Month + "-" + DateTime.DaysInMonth(int.Parse(f.Month[..4]), int.Parse(f.Month[5..])), "CNY", TransactionId: f.Expense)))
            : new JsonObject { ["role"] = "assistant", ["content"] = "剔除后请查看服务端计算依据。" };
        var follow = await f.Chat("排除最大的一笔交易后呢？", first.ConversationId);
        Assert.Equal(first.ConversationId, follow.ConversationId);
        var exclusion = follow.Sources.Single(s => s.Tool == "AnalyzeExpenseExclusion");
        Assert.Equal("100.00", exclusion.Data!["expenseExcluding"]!.ToString());
        Assert.Equal("3000.00", exclusion.Data["expenseContribution"]!.ToString());
        Assert.Contains(follow.Sources, s => s.Tool == "GetIncomeExpenseSummary" && s.Start == f.Month + "-01");
        var beforeThird = f.Model.Calls;
        var previousMonth = DateOnly.Parse(f.Month + "-01").AddMonths(-1);
        var previousEnd = previousMonth.AddMonths(1).AddDays(-1);
        f.Model.Reply = n => n == beforeThird + 1 ? Model.Tool("CompareFinancialPeriods", Json(new AgentComparison(previousMonth.ToString("yyyy-MM-dd"), previousEnd.ToString("yyyy-MM-dd"))))
            : new JsonObject { ["role"] = "assistant", ["content"] = "已查询上月完整自然月及其可比期间；缺少历史记录不能解释为已确认的消费改善。" };
        var third = await f.Chat("对比上个月的日常支出。", follow.ConversationId);
        Assert.Equal(first.ConversationId, third.ConversationId);
        var previous = third.Sources.Single(s => s.Tool == "CompareFinancialPeriods" && s.Start == previousMonth.ToString("yyyy-MM-dd"));
        Assert.Equal("CNY", previous.Currency); Assert.Equal("0.00", previous.Data!["expense"]!.ToString()); Assert.Null(previous.Data["expenseRate"]);
    }
    [DeletionSqlFact] public async Task ScopedAndCrossUserReadsRemainEnforcedAndWritesCannotUseReadExecutor()
    {
        await using var f = new Fixture(); await f.Seed();
        await using var scope = f.Services.CreateAsyncScope();
        var executor = scope.ServiceProvider.GetRequiredService<AiReadToolExecutor>();
        var p = await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Require(f.User, default);
        var context = await scope.ServiceProvider.GetRequiredService<DeepSeekToolDispatcher>().CreateContext(f.User, [f.Account], default);
        var denied = await Assert.ThrowsAsync<ApiException>(() => executor.Read(f.User, "GetAccountBalances", Json(new AiQuery(f.Month + "-01", f.Month + "-02", "CNY", f.OtherAccount)), p, context, default));
        Assert.Equal("AI_SCOPE_FORBIDDEN", denied.Code);
        Assert.Equal("AI_WRITE_CONFIRMATION_REQUIRED", (await Assert.ThrowsAsync<ApiException>(() => executor.Read(f.User, "SaveTransaction", "{}", p, context, default))).Code);
        Assert.Equal("AI_SCOPE_FORBIDDEN", (await Assert.ThrowsAsync<ApiException>(() => executor.Read("other-user", "GetStatisticsRules", "{}", p, context, default))).Code);
    }
    [DeletionSqlFact] public async Task ToolFailureIsPartialEvidenceRatherThanFakeSuccess()
    {
        await using var f = new Fixture(); await f.Seed();
        f.Model.Reply = n => n == 1 ? Model.Tool("SearchTransactions", "{\"start\":\"invalid\",\"end\":\"invalid\"}") : new JsonObject { ["role"] = "assistant", ["content"] = "部分查询失败。" };
        var result = await f.Chat("分析本月支出");
        Assert.Contains(result.Sources, s => s.Tool == "ToolFailure");
        Assert.Contains(result.Analysis!.Limitations, l => l.Contains("查询失败"));
        Assert.Contains(result.Sources, s => s.Tool == "GetFinancialReport");
    }
    [DeletionSqlFact] public async Task RepeatedQueriesUseOneAuditedReadAndThenStopTheLoop()
    {
        await using var f = new Fixture(); await f.Seed();
        f.Model.Reply = n => n <= 4 ? Model.Tool("GetStatisticsRules", n % 2 == 0 ? "{ }" : "{}") : new JsonObject { ["role"] = "assistant", ["content"] = "查询已完成。" };
        await f.Chat("查询统计规则");
        await using var scope = f.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        Assert.Equal(1, await db.Set<AiToolAudit>().CountAsync(a => a.UserId == f.User && a.Tool == "GetStatisticsRules"));
        Assert.Equal(5, f.Model.Calls);
    }
    [DeletionSqlFact] public async Task ProviderTimeoutPreservesPartialEvidenceAndAResumableConversation()
    {
        await using var f = new Fixture(); await f.Seed();
        f.Model.Reply = _ => throw new ApiException(504, "synthetic timeout", "AI_TIMEOUT");
        var partial = await f.Chat("分析本月财务状况");
        Assert.Equal("partial", partial.Analysis!.Confidence); Assert.False(partial.FinancialDataVerified);
        Assert.Contains(partial.Sources, s => s.Tool == "GetFinancialReport"); Assert.Contains(partial.Sources, s => s.Tool == "ToolFailure");
        f.Model.Reply = _ => new JsonObject { ["role"] = "assistant", ["content"] = "继续核对已定位期间。" };
        var resumed = await f.Chat("继续分析本月支出", partial.ConversationId);
        Assert.Equal(partial.ConversationId, resumed.ConversationId);
        await using var scope = f.Services.CreateAsyncScope();
        Assert.Contains(await scope.ServiceProvider.GetRequiredService<FinanceDb>().Set<AiRequestAudit>().Where(x => x.UserId == f.User).ToArrayAsync(), a => a.State == "Partial");
    }
    [DeletionSqlFact] public async Task NarrowerAdvancedScopeAppliesToCopilotAndRejectsOldWiderConversation()
    {
        await using var f = new Fixture(); await f.Seed(); var first = await f.Chat("分析本月支出"); var calls = f.Model.Calls;
        await using (var scope = f.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<AiAgentConfigurationService>()
            .Save(f.User, new() { AccountIds = [f.Account] }, "0", default);
        Assert.Equal("AI_SCOPE_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => f.Chat("继续", first.ConversationId))).Code);
        Assert.Equal(calls, f.Model.Calls);
        Assert.Equal("AI_SCOPE_FORBIDDEN", (await Assert.ThrowsAsync<ApiException>(() => f.Chat("分析本月支出", accounts: [f.OtherAccount]))).Code);
        var restricted = await f.Chat("分析本月支出");
        Assert.DoesNotContain(restricted.Sources, s => s.Tool == "GetFinancialReport");
        Assert.All(restricted.Sources.Where(s => s.Tool != "ToolFailure"), s => Assert.Equal(new[] { f.Account }, s.AccountIds));
    }
    [DeletionSqlFact] public async Task ExplicitCancellationDoesNotSaveAnUnfinishedAnswer()
    {
        await using var f = new Fixture(); await f.Seed(); using var cancellation = new CancellationTokenSource();
        f.Model.Reply = _ => { cancellation.Cancel(); throw new OperationCanceledException(cancellation.Token); };
        await using var scope = f.Services.CreateAsyncScope();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => scope.ServiceProvider.GetRequiredService<DeepSeekChatService>()
            .Chat(f.User, new("分析本月支出"), cancellation.Token));
        var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
        Assert.False(await db.Set<AiMessage>().AnyAsync(m => m.UserId == f.User));
    }
    [DeletionSqlFact] public async Task TransactionInvestigationSupportsRealPagingAndKeepsCurrenciesSeparate()
    {
        await using var f = new Fixture(); await f.Seed(); await using var scope = f.Services.CreateAsyncScope();
        var p = await scope.ServiceProvider.GetRequiredService<AiPrivacyService>().Require(f.User, default);
        var context = await scope.ServiceProvider.GetRequiredService<DeepSeekToolDispatcher>().CreateContext(f.User, null, default);
        var reads = scope.ServiceProvider.GetRequiredService<AiReadToolExecutor>();
        var args = new AgentQuery(f.Month + "-01", f.Month + "-28", PageSize: 1, Type: "Expense", Sort: "amount:desc");
        var first = await reads.Read(f.User, "SearchTransactions", Json(args), p, context, default);
        var second = await reads.Read(f.User, "SearchTransactions", Json(args with { Page = 2 }), p, context, default);
        Assert.True(first.Truncated); Assert.NotEqual(first.Data!["items"]![0]!["id"]!.ToString(), second.Data!["items"]![0]!["id"]!.ToString());
        var dollars = await reads.Read(f.User, "SearchTransactions", Json(args with { Currency = "USD" }), p, context, default);
        Assert.Empty(dollars.Data!["items"]!.AsArray()); Assert.Equal("USD", dollars.Currency);
    }
    [DeletionSqlFact] public async Task FutureDatedIncomeIsExcludedAndMonthComparisonUsesTheSameElapsedTime()
    {
        await using var f = new Fixture(); await f.Seed();
        await using (var scope = f.Services.CreateAsyncScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
            var income = await db.Categories.FirstAsync(c => c.UserId == f.User && c.Kind == "Income" && c.ParentId != null);
            await scope.ServiceProvider.GetRequiredService<FinanceService>().SaveTransaction(f.User,
                new("Income", "7777", f.Account, DateTimeOffset.UtcNow.AddHours(1), CategoryId: income.Id));
            await db.SaveChangesAsync();
        }
        var result = await f.Chat("分析本月财务状况");
        Assert.Equal("10000.00", result.Analysis!.KeyMetrics.Single(m => m.Key == "income").Value);
        var summary = result.Sources.Single(s => s.Tool == "GetIncomeExpenseSummary"); Assert.Equal("10000.00", summary.Data!["income"]!.ToString());
        var comparison = result.Sources.Single(s => s.Tool == "CompareFinancialPeriods").Data!;
        Assert.Equal("10000.00", comparison["income"]!.ToString());
        var currentDuration = DateTimeOffset.Parse(comparison["endExclusive"]!.ToString()) - DateTimeOffset.Parse(comparison["start"]!.ToString());
        var previousDuration = DateTimeOffset.Parse(comparison["previousEndExclusive"]!.ToString()) - DateTimeOffset.Parse(comparison["previousStart"]!.ToString());
        Assert.Equal(currentDuration, previousDuration);
    }
    [DeletionSqlFact] public async Task LegacyChatBudgetDoesNotBlockWhenNoDurableAgentIsAttached()
    {
        await using var f = new Fixture(); await f.Seed(); await using var scope = f.Services.CreateAsyncScope();
        var context = await scope.ServiceProvider.GetRequiredService<DeepSeekToolDispatcher>().CreateContext(f.User, null, default);
        var usage = new DeepSeekUsageService(scope.ServiceProvider.GetRequiredService<FinanceDb>(), Options.Create(new AiOptions {
            InputPricePerMillion = 1, OutputPricePerMillion = 2, PriceEffectiveDate = "2026-10-28", PriceCurrency = "CNY" }));
        usage.AttachContext(context with { DailyCostBudget = .001m });
        await usage.Reserve(f.User, "synthetic", "chat", 0, default);
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<FinanceDb>().Set<AiUsageRecord>().CountAsync(x => x.UserId == f.User));
    }
    [DeletionSqlFact] public async Task ParallelToolCallsSerializeConsentChecksAndKeepReadContextsSeparate()
    {
        await using var f = new Fixture(); await f.Seed();
        f.Model.Reply = n => {
            if (n > 1) return new JsonObject { ["role"] = "assistant", ["content"] = "已核对统计口径与账户余额。" };
            var first = Model.Tool("GetStatisticsRules", "{}");
            first["tool_calls"]!.AsArray().Add(Model.Tool("GetAccountBalances", "{\"start\":\"2026-10-01\",\"end\":\"2026-10-31\",\"currency\":\"CNY\"}")["tool_calls"]![0]!.DeepClone());
            return first;
        };
        var result = await f.Chat("并行核对统计口径和账户余额");
        Assert.Contains(result.Sources, s => s.Tool == "GetStatisticsRules");
        Assert.Contains(result.Sources, s => s.Tool == "GetAccountBalances");
        Assert.DoesNotContain(result.Sources, s => s.Tool == "ToolFailure");
    }
}
