using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public static class AiAgentEndpoints
{
    public static void Map(WebApplication app)
    {
        var g = app.MapGroup("/api/ai/agent").RequireAuthorization();
        g.MapGet("/settings", async (HttpContext c, AiAgentConfigurationService service, IOptions<AiOptions> o, AiPrivacyService privacy) => {
            var (row, config) = await service.Get(FinanceEndpoints.User(c), c.RequestAborted);
            return FinanceEndpoints.Ok(c, new { configuration = config, version = row?.Version.ToString() ?? "0", emergencyStopped = row?.EmergencyStopped ?? false,
                enabled = o.Value.Enabled, configured = !string.IsNullOrWhiteSpace(o.Value.DeepSeek.ApiKey),
                models = service.Models, priceCurrency = o.Value.PriceCurrency, privacy = await privacy.Get(FinanceEndpoints.User(c), c.RequestAborted),
                limits = new { o.Value.MaxTaskTokens, o.Value.MaxTaskTools, o.Value.MaxTaskModelCalls, o.Value.MaxTaskSeconds, o.Value.MaxConcurrentRequests },
                tools = AiAgentTools.Registry.Select(t => new { t.Name, t.Description, t.Write, t.Permission }),
                readTools = AiFinancialTools.Registry });
        });
        g.MapPut("/settings", async (AgentSettingsInput b, HttpContext c, AiAgentConfigurationService service, FinanceService f) =>
            await FinanceEndpoints.Write(c, f, b, async () => await service.Save(FinanceEndpoints.User(c), b.Configuration, b.Version, c.RequestAborted)));
        g.MapPost("/resume", async (AgentVersion b, HttpContext c, FinanceDb db, FinanceService f) => await FinanceEndpoints.Write(c, f, b, async () => {
            var row = await db.Set<AiAgentSetting>().SingleOrDefaultAsync(x => x.UserId == FinanceEndpoints.User(c), c.RequestAborted) ?? throw new ApiException(404, "配置不存在");
            FinanceService.Version(row, b.Version); row.EmergencyStopped = false; row.Version++;
            db.Add(new AiAgentEvent { UserId = row.UserId, Kind = "AutomationResumed", Detail = "用户恢复AI任务；已取消任务和已停用工作流保持原状态" }); return new { resumed = true };
        }));
        g.MapPost("/stop", async (HttpContext c, AiAgentService s) => FinanceEndpoints.Ok(c, await s.Stop(FinanceEndpoints.User(c), null, c.RequestAborted)));
        g.MapGet("/tasks", async (HttpContext c, FinanceDb db, int page = 1) => {
            CheckPage(page); var q = db.Set<AiAgentTask>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c));
            return FinanceEndpoints.Ok(c, new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20)
                .Select(x => new { x.Id, prompt = x.Prompt.Length > 200 ? x.Prompt.Substring(0, 200) : x.Prompt, x.State, x.Mode, x.CreatedAt, x.UpdatedAt, version = x.Version.ToString() }).ToArrayAsync(c.RequestAborted), total = await q.CountAsync(c.RequestAborted), page });
        });
        g.MapPost("/tasks", async (AgentTaskInput b, HttpContext c, AiAgentService s, FinanceService f) =>
            await FinanceEndpoints.Write(c, f, b, async () => AiAgentService.View(await s.Create(FinanceEndpoints.User(c), b, c.RequestAborted)), true));
        g.MapGet("/tasks/{id}", async (string id, HttpContext c, AiAgentService s) => FinanceEndpoints.Ok(c, await s.Detail(FinanceEndpoints.User(c), id, c.RequestAborted)));
        g.MapPost("/tasks/{id}/approve", async (string id, AgentApproval b, HttpContext c, AiAgentService s) => FinanceEndpoints.Ok(c, await s.Approve(FinanceEndpoints.User(c), id, b, c.RequestAborted)));
        g.MapPost("/tasks/{id}/stop", async (string id, HttpContext c, AiAgentService s) => FinanceEndpoints.Ok(c, await s.Stop(FinanceEndpoints.User(c), id, c.RequestAborted)));
        g.MapPost("/tasks/{id}/retry", async (string id, AgentVersion b, HttpContext c, FinanceDb db, FinanceService f, AiAgentService s) => await FinanceEndpoints.Write(c, f, b, async () => {
            return await s.Retry(FinanceEndpoints.User(c), id, b.Version, c.RequestAborted);
        }));
        g.MapGet("/grants", async (HttpContext c, FinanceDb db) => FinanceEndpoints.Ok(c,
            await db.Set<AiAgentGrant>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c)).OrderByDescending(x => x.CreatedAt).ToArrayAsync(c.RequestAborted)));
        g.MapPost("/grants", async (AgentGrantInput b, HttpContext c, AiAgentService s, FinanceService f) => await FinanceEndpoints.Write(c, f, b, async () => await s.Grant(FinanceEndpoints.User(c), b, c.RequestAborted), true));
        g.MapDelete("/grants/{id}", async (string id, [Microsoft.AspNetCore.Mvc.FromBody] AgentVersion b, HttpContext c, FinanceDb db, FinanceService f) => await FinanceEndpoints.Write(c, f, b, async () => {
            var row = await db.Set<AiAgentGrant>().SingleOrDefaultAsync(x => x.UserId == FinanceEndpoints.User(c) && x.Id == id, c.RequestAborted) ?? throw new ApiException(404, "授权不存在");
            FinanceService.Version(row, b.Version); row.RevokedAt = DateTimeOffset.UtcNow; row.Version++;
            db.Add(new AiAgentEvent { UserId = row.UserId, Kind = "GrantRevoked", Detail = row.Tool }); return new { revoked = true };
        }));
        g.MapGet("/memories", async (HttpContext c, FinanceDb db) => FinanceEndpoints.Ok(c, await db.Set<AiAgentMemory>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c)).OrderByDescending(x => x.UpdatedAt).ToArrayAsync(c.RequestAborted)));
        g.MapPut("/memories/{id}", async (string id, AgentMemoryInput b, HttpContext c, FinanceDb db, FinanceService f) => await FinanceEndpoints.Write(c, f, b, async () => {
            var u = FinanceEndpoints.User(c); ValidateText(b.Title, 200); ValidateText(b.Content, 100000);
            if (b.AccountIds != null) await AiRequestContext.Create(db, u, b.AccountIds, c.RequestAborted);
            var row = await db.Set<AiAgentMemory>().SingleOrDefaultAsync(x => x.UserId == u && x.Id == id, c.RequestAborted);
            if (row == null) { RequireNewId(id, b.Version); row = new() { Id = id, UserId = u }; db.Add(row); } else FinanceService.Version(row, b.Version);
            await CancelMemoryTasks(db, u, c.RequestAborted); row.Title = b.Title; row.Content = b.Content; row.Enabled = b.Enabled; row.AccountIdsJson = JsonSerializer.Serialize(b.AccountIds ?? []); row.ExpiresAt = b.ExpiresAt; row.Version++; row.UpdatedAt = DateTimeOffset.UtcNow;
            db.Add(new AiAgentEvent { UserId = u, Kind = "MemoryChanged", Detail = "用户编辑授权记忆" }); return row;
        }));
        g.MapDelete("/memories/{id}", async (string id, [Microsoft.AspNetCore.Mvc.FromBody] AgentVersion b, HttpContext c, FinanceDb db, FinanceService f) => await FinanceEndpoints.Write(c, f, b, async () => {
            var row = await db.Set<AiAgentMemory>().SingleOrDefaultAsync(x => x.UserId == FinanceEndpoints.User(c) && x.Id == id, c.RequestAborted) ?? throw new ApiException(404, "记忆不存在");
            FinanceService.Version(row, b.Version); await CancelMemoryTasks(db, row.UserId, c.RequestAborted); db.Remove(row); db.Add(new AiAgentEvent { UserId = row.UserId, Kind = "MemoryDeleted", Detail = "用户删除授权记忆" }); return new { deleted = true };
        }));
        g.MapGet("/workflows", async (HttpContext c, FinanceDb db) => FinanceEndpoints.Ok(c, await db.Set<AiAgentWorkflow>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c)).OrderByDescending(x => x.UpdatedAt).ToArrayAsync(c.RequestAborted)));
        g.MapPut("/workflows/{id}", async (string id, AgentWorkflowInput b, HttpContext c, FinanceDb db, FinanceService f) => await FinanceEndpoints.Write(c, f, b, async () => {
            var u = FinanceEndpoints.User(c); ValidateText(b.Name, 200); ValidateText(b.Prompt, 100000);
            if (b.IntervalMinutes is < 1 || b.Enabled && b.IntervalMinutes == null) throw new ApiException(422, "定时工作流须设置大于零的分钟间隔", "AI_WORKFLOW_INVALID");
            if (b.AccountIds != null) await AiRequestContext.Create(db, u, b.AccountIds, c.RequestAborted);
            var row = await db.Set<AiAgentWorkflow>().SingleOrDefaultAsync(x => x.UserId == u && x.Id == id, c.RequestAborted);
            if (row == null) { RequireNewId(id, b.Version); row = new() { Id = id, UserId = u }; db.Add(row); } else FinanceService.Version(row, b.Version);
            row.Name = b.Name; row.Prompt = b.Prompt; row.Enabled = b.Enabled; row.IntervalMinutes = b.IntervalMinutes; row.NextRunAt = b.NextRunAt ?? DateTimeOffset.UtcNow.AddMinutes(b.IntervalMinutes ?? 1);
            row.AccountIdsJson = JsonSerializer.Serialize(b.AccountIds); row.Version++; row.UpdatedAt = DateTimeOffset.UtcNow;
            db.Add(new AiAgentEvent { UserId = u, Kind = "WorkflowChanged", Detail = "用户更新分析工作流及调度" }); return row;
        }));
        g.MapPost("/workflows/{id}/run", async (string id, HttpContext c, FinanceDb db, FinanceService f, AiAgentService s) => await FinanceEndpoints.Write(c, f, new { id }, async () => {
            var row = await db.Set<AiAgentWorkflow>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == FinanceEndpoints.User(c) && x.Id == id, c.RequestAborted) ?? throw new ApiException(404, "工作流不存在");
            return AiAgentService.View(await s.Create(row.UserId, new(row.Prompt, AccountIds: JsonSerializer.Deserialize<string[]?>(row.AccountIdsJson)), c.RequestAborted, row.Id));
        }, true));
        g.MapGet("/reports", async (HttpContext c, FinanceDb db, int page = 1) => {
            CheckPage(page); var q = db.Set<AiAgentReport>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c));
            return FinanceEndpoints.Ok(c, new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20).ToArrayAsync(c.RequestAborted), total = await q.CountAsync(c.RequestAborted) });
        });
        g.MapGet("/logs", async (HttpContext c, FinanceDb db, int page = 1) => {
            CheckPage(page); var q = db.Set<AiAgentEvent>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c));
            return FinanceEndpoints.Ok(c, new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(c.RequestAborted), total = await q.CountAsync(c.RequestAborted) });
        });
    }
    private static async Task CancelMemoryTasks(FinanceDb db, string user, CancellationToken ct) {
        await db.Set<AiAgentTask>().Where(t => t.UserId == user && !AiAgentService.TerminalStates.Contains(t.State)).ExecuteUpdateAsync(s =>
            s.SetProperty(t => t.CancelRequested, true).SetProperty(t => t.State, "Cancelled").SetProperty(t => t.ErrorCode, "AI_MEMORY_CHANGED")
                .SetProperty(t => t.Version, t => t.Version + 1).SetProperty(t => t.CompletedAt, DateTimeOffset.UtcNow), ct);
    }
    private static void CheckPage(int page) { if (page is < 1 or > 100000) throw new ApiException(422, "分页无效"); }
    private static void ValidateText(string text, int max) { if (string.IsNullOrWhiteSpace(text) || text.Length > max) throw new ApiException(422, "名称或内容为空或超过容量"); }
    private static void RequireNewId(string id, string? version) { if (!Guid.TryParseExact(id, "D", out _) || version is not (null or "0")) throw new ApiException(409, "记录不存在或版本冲突", "VERSION_CONFLICT"); }
}
public sealed record AgentSettingsInput(AiAgentConfiguration Configuration, string Version);
public sealed record AgentVersion(string Version);
