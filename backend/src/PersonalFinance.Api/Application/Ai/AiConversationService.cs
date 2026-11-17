using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiConversationChange(string Version, string? Title = null, bool? Archived = null);
public sealed record AiConversationPage(string? Search = null, bool Archived = false, int Page = 1, string? Kind = null);
public sealed class AiConversationService(FinanceDb db, IOptions<AiOptions> options)
{
    public async Task<AiConversation> Get(string user, string id, CancellationToken ct)
    {
        if (!Guid.TryParseExact(id, "D", out _)) throw new ApiException(404, "会话不存在", "AI_CONVERSATION_NOT_FOUND");
        return await db.Set<AiConversation>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id && x.ExpiresAt > DateTimeOffset.UtcNow, ct)
            ?? throw new ApiException(404, "会话不存在或已过期", "AI_CONVERSATION_NOT_FOUND");
    }
    public async Task<string[]> History(string user, string id, CancellationToken ct)
    {
        var remaining = options.Value.MaxContextBytes / 2; var history = new List<string>();
        await foreach (var message in db.Set<AiMessage>().AsNoTracking().Where(x => x.UserId == user && x.ConversationId == id).OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Select(x => new { x.Question, x.SourcesJson }).AsAsyncEnumerable().WithCancellation(ct)) {
            var question = message.Question + AiInvestigationMemory.Anchor(JsonSerializer.Deserialize<AiEvidence[]>(message.SourcesJson, FinanceService.Json) ?? []);
            var bytes = System.Text.Encoding.UTF8.GetByteCount(question); if (bytes > remaining) break;
            history.Add(question); remaining -= bytes;
        }
        history.Reverse(); return history.ToArray();
    }
    public async Task<object> List(string user, AiConversationPage input, CancellationToken ct)
    {
        if (input.Page is < 1 or > 10000 || input.Search?.Length > 100) throw new ApiException(400, "搜索或分页参数无效", "AI_INPUT_INVALID");
        var q = db.Set<AiConversation>().AsNoTracking().Where(x => x.UserId == user && x.Archived == input.Archived && x.ExpiresAt > DateTimeOffset.UtcNow);
        if (input.Kind is not (null or "Chat" or "Report")) throw new ApiException(400, "会话类型无效", "AI_INPUT_INVALID");
        if (input.Kind != null) q = q.Where(x => x.Kind == input.Kind);
        if (!string.IsNullOrWhiteSpace(input.Search)) q = q.Where(x => x.Title.Contains(input.Search) || db.Set<AiMessage>().Any(m => m.UserId == user && m.ConversationId == x.Id && (m.Question.Contains(input.Search) || m.Answer.Contains(input.Search))));
        var rows = await q.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Skip((input.Page - 1) * 20).Take(20)
            .Select(x => new { x.Id, x.Title, x.Kind, x.Archived, x.AccountScopeJson, x.UpdatedAt, version = x.Version.ToString(),
                original = x.Title.StartsWith("页面上下文仅用于") || x.Title.StartsWith("Page context identifies")
                    ? db.Set<AiMessage>().Where(m => m.UserId == user && m.ConversationId == x.Id).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).Select(m => m.Question).FirstOrDefault() : null }).ToArrayAsync(ct);
        return new { items = rows.Select(x => new { x.Id, title = DisplayTitle(x.Title, x.original), x.Kind, x.Archived, x.AccountScopeJson, x.UpdatedAt, x.version }),
            total = await q.CountAsync(ct), page = input.Page, pageSize = 20 };
    }
    public async Task<object> Detail(string user, string id, int page, CancellationToken ct)
    {
        var c = await Get(user, id, ct);
        if (page is < 1 or > 10000) throw new ApiException(400, "分页参数无效", "AI_INPUT_INVALID");
        var q = db.Set<AiMessage>().AsNoTracking().Where(x => x.UserId == user && x.ConversationId == id);
        var rows = await q.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20).ToArrayAsync(ct);
        var first = c.Title.StartsWith("页面上下文仅用于") || c.Title.StartsWith("Page context identifies")
            ? await q.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Select(x => x.Question).FirstOrDefaultAsync(ct) : null;
        return new { conversation = new { c.Id, title = DisplayTitle(c.Title, first), c.Archived, accountIds = c.AccountScopeJson == null ? null : JsonSerializer.Deserialize<string[]>(c.AccountScopeJson), version = c.Version.ToString() },
            items = rows.Select(x => new { x.Id, x.Question, result = StoredResult(x, c), x.Feedback }),
            total = await q.CountAsync(ct), page, pageSize = 20 };
    }
    private static AiChatResult StoredResult(AiMessage message, AiConversation conversation)
    {
        var sources = JsonSerializer.Deserialize<AiEvidence[]>(message.SourcesJson, FinanceService.Json) ?? [];
        var answer = message.Answer; var verified = message.FinancialDataVerified;
        // Repair the display of previously blocked explanations using their saved evidence snapshot.
        // Never re-query or treat historical values as current ledger facts.
        if (!verified && answer.StartsWith("模型解释包含本次查询无法核实的数值，已拦截该解释。", StringComparison.Ordinal)) {
            var resolved = AiAnswerValidator.Resolve(answer, sources, "zh-CN", preferSummary: true);
            if (resolved.Verified && sources.Any(s => s.Tool == "GetIncomeExpenseSummary")) { answer = resolved.Answer; verified = true; }
        }
        return new(conversation.Id, AiAnswerValidator.DisplaySavedAnswer(answer)!, sources, message.Model, verified, message.RequestId,
            conversation.AccountScopeJson == null ? null : JsonSerializer.Deserialize<string[]>(conversation.AccountScopeJson), message.Id,
            message.AnalysisJson == null ? AiAnalysisReports.Build(answer, sources, verified) with { GeneratedAt = message.CreatedAt }
                : JsonSerializer.Deserialize<AiAnalysisReport>(message.AnalysisJson, FinanceService.Json));
    }
    public async Task<string> Save(string user, string id, string question, AiChatResult result, AiRequestContext context, CancellationToken ct, bool report = false)
    {
        var c = await db.Set<AiConversation>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct);
        if (c == null) { c = new AiConversation { Id = id, UserId = user, Title = QuestionTitle(question),
            Kind = report ? "Report" : "Chat", AccountScopeJson = context.Restricted ? JsonSerializer.Serialize(context.AccountIds) : null }; db.Add(c); }
        if (c.Archived) throw new ApiException(409, "已归档会话不能继续生成", "AI_CONVERSATION_ARCHIVED");
        c.UpdatedAt = DateTimeOffset.UtcNow;
        var setting = await db.Set<AiAgentSetting>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user, ct);
        var retention = setting == null ? options.Value.ConversationRetentionDays : JsonSerializer.Deserialize<AiAgentConfiguration>(setting.ConfigurationJson, FinanceService.Json)?.HistoryRetentionDays ?? 0;
        c.ExpiresAt = retention > 0 ? c.UpdatedAt.AddDays(retention) : DateTimeOffset.MaxValue; c.Version++;
        var message = new AiMessage { UserId = user, ConversationId = id, RequestId = context.RequestId, Question = question,
            Answer = result.Answer, SourcesJson = JsonSerializer.Serialize(result.Sources, FinanceService.Json), Model = result.Model, FinancialDataVerified = result.FinancialDataVerified,
            AnalysisJson = result.Analysis == null ? null : JsonSerializer.Serialize(result.Analysis, FinanceService.Json) };
        db.Add(message);
        await db.SaveChangesAsync(ct);
        return message.Id;
    }
    public static string QuestionTitle(string question)
    {
        var lines = question.Replace("\r\n", "\n").Split('\n');
        if (lines.Length >= 4 && (lines[0].StartsWith("页面上下文仅用于", StringComparison.Ordinal) || lines[0].StartsWith("Page context identifies", StringComparison.Ordinal)) && lines[2] is "我的问题：" or "My question:") {
            try {
                if (JsonNode.Parse(lines[1]) is JsonObject) {
                    var actual = string.Join('\n', lines.Skip(3)).Trim();
                    if (actual.Length > 0) question = actual;
                }
            } catch (JsonException) { /* Preserve ordinary text that is not a structured Copilot request. */ }
        }
        return question[..Math.Min(60, question.Length)];
    }
    private static string DisplayTitle(string title, string? original) => original != null && title == original[..Math.Min(60, original.Length)] ? QuestionTitle(original) : title;
    public async Task<object> Change(string user, string id, AiConversationChange change, CancellationToken ct)
    {
        var c = await Get(user, id, ct); FinanceService.Version(c, change.Version);
        if (change.Title != null) {
            if (change.Title.Trim().Length is < 1 or > 120) throw new ApiException(400, "会话标题长度应为1至120", "AI_INPUT_INVALID");
            c.Title = change.Title.Trim();
        }
        if (change.Archived.HasValue) c.Archived = change.Archived.Value;
        c.Version++; c.UpdatedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct);
        return new { c.Id, c.Title, c.Archived, version = c.Version.ToString() };
    }
    public async Task Delete(string user, string id, CancellationToken ct)
    {
        await Get(user, id, ct);
        await using var tx = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(ct) : null;
        await db.Set<AiMessage>().Where(x => x.UserId == user && x.ConversationId == id).ExecuteDeleteAsync(ct);
        await db.Set<AiConversation>().Where(x => x.UserId == user && x.Id == id).ExecuteDeleteAsync(ct);
        if (tx != null) await tx.CommitAsync(ct);
    }
    public async Task Feedback(string user, string id, int rating, CancellationToken ct)
    {
        if (rating is < -1 or > 1) throw new ApiException(400, "反馈无效", "AI_INPUT_INVALID");
        var m = await db.Set<AiMessage>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct)
            ?? throw new ApiException(404, "消息不存在", "AI_MESSAGE_NOT_FOUND");
        await Get(user, m.ConversationId, ct); m.Feedback = rating; m.Version++; await db.SaveChangesAsync(ct);
    }
}
