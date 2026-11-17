using PersonalFinance.Api.Contracts;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;

public static class SupportEndpoints
{
    public sealed record TicketInput(string Subject, string Content, string Kind);
    public sealed record ReplyInput(string Status, string Reply);
    public static async Task Admin(FinanceDb db, HttpContext c)
    {
        if (!await db.Users.AnyAsync(x => x.Id == FinanceEndpoints.User(c) && x.IsAdmin))
            throw new ApiException(403, "仅管理员可访问后台", "ADMIN_REQUIRED");
    }
    static object Dto(SupportTicket x) => new { x.Id, x.UserId, x.Subject, x.Content, x.Kind, x.Status, x.Reply, x.CreatedAt, x.UpdatedAt, version = x.Version.ToString() };
    static void Audit(FinanceDb db, HttpContext c, string action, string resourceId) => db.AuditRecords.Add(new() {
        UserId = FinanceEndpoints.User(c), ResourceType = "Administration", ResourceId = resourceId,
        Action = action, Source = "Admin", TraceId = c.TraceIdentifier });
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/support/tickets", async (FinanceDb db, HttpContext c) => {
            var (page, size) = FinanceService.Paging(c.Request.Query);
            var q = db.Set<SupportTicket>().AsNoTracking().Where(x => x.UserId == FinanceEndpoints.User(c));
            var total = await q.CountAsync();
            var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
            return FinanceEndpoints.Ok(c, new { items = rows.Select(Dto), total, page, pageSize = size });
        });
        api.MapPost("/support/tickets", async (TicketInput input, FinanceDb db, FinanceService f, HttpContext c) =>
            await FinanceEndpoints.Write(c, f, input, async () => {
                var subject = input.Subject?.Trim() ?? ""; var content = input.Content?.Trim() ?? "";
                FinanceService.Require(subject.Length is > 0 and <= 120 && content.Length is > 0 and <= 4000, "请填写标题与反馈内容，并检查长度");
                FinanceService.Require(input.Kind is "Question" or "Bug" or "Suggestion", "反馈类型无效");
                var recent = DateTimeOffset.UtcNow.AddMinutes(-10);
                if (await db.Set<SupportTicket>().CountAsync(x => x.UserId == FinanceEndpoints.User(c) && x.CreatedAt > recent) >= 5)
                    throw new ApiException(429, "反馈提交过于频繁，请稍后重试", "SUPPORT_RATE_LIMIT");
                var ticket = new SupportTicket { UserId = FinanceEndpoints.User(c), Subject = subject, Content = content, Kind = input.Kind };
                db.Add(ticket); return Dto(ticket);
            }));
        var admin = api.MapGroup("/admin");
        admin.AddEndpointFilter(async (context, next) => {
            await Admin(context.HttpContext.RequestServices.GetRequiredService<FinanceDb>(), context.HttpContext);
            return await next(context);
        });
        admin.MapGet("/overview", async (FinanceDb db, HttpContext c) => FinanceEndpoints.Ok(c, new {
            users = await db.Users.CountAsync(),
            activeSessions = await db.Sessions.CountAsync(x => !x.Revoked && x.ExpiresAt > DateTimeOffset.UtcNow),
            openTickets = await db.Set<SupportTicket>().CountAsync(x => x.Status != "Resolved"),
            resolvedTickets = await db.Set<SupportTicket>().CountAsync(x => x.Status == "Resolved")
        }));
        admin.MapGet("/users", async (FinanceDb db, HttpContext c) => {
            var (page, size) = FinanceService.Paging(c.Request.Query);
            var keyword = c.Request.Query["keyword"].ToString().Trim();
            var q = db.Users.AsNoTracking().Where(x => keyword == "" || x.Email.Contains(keyword) || x.DisplayName.Contains(keyword));
            var total = await q.CountAsync();
            var items = await q.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size)
                .Select(x => new { x.Id, x.Email, x.DisplayName, x.IsAdmin, x.CreatedAt,
                    activeSessions = db.Sessions.Count(s => s.UserId == x.Id && !s.Revoked && s.ExpiresAt > DateTimeOffset.UtcNow) }).ToArrayAsync();
            return FinanceEndpoints.Ok(c, new { items, total, page, pageSize = size });
        });
        admin.MapPost("/users/{id}/revoke-sessions", async (string id, FinanceDb db, HttpContext c) => {
            FinanceService.Require(id != FinanceEndpoints.User(c), "请使用退出登录结束自己的会话");
            if (!await db.Users.AnyAsync(x => x.Id == id)) throw new ApiException(404, "用户不存在");
            await using var tx = await db.Database.BeginTransactionAsync();
            // Share the password/login lock so concurrent login cannot escape revocation.
            var resource = "user:" + id;
            await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'User lock timeout',1;");
            var count = await db.Sessions.Where(x => x.UserId == id && !x.Revoked).ExecuteUpdateAsync(s => s.SetProperty(x => x.Revoked, true));
            Audit(db, c, "RevokeSessions", id); await db.SaveChangesAsync(); await tx.CommitAsync();
            return FinanceEndpoints.Ok(c, new { revoked = count });
        });
        admin.MapGet("/tickets", async (FinanceDb db, HttpContext c) => {
            var (page, size) = FinanceService.Paging(c.Request.Query);
            var status = c.Request.Query["status"].ToString(); var keyword = c.Request.Query["keyword"].ToString().Trim();
            var q = db.Set<SupportTicket>().AsNoTracking().Where(x => (status == "" || x.Status == status) && (keyword == "" || x.Subject.Contains(keyword) || x.Content.Contains(keyword)));
            var total = await q.CountAsync();
            var rows = await q.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
            return FinanceEndpoints.Ok(c, new { items = rows.Select(Dto), total, page, pageSize = size });
        });
        admin.MapPut("/tickets/{id}", async (string id, ReplyInput input, FinanceDb db, HttpContext c) => {
            FinanceService.Require(input.Status is "Open" or "InProgress" or "Resolved", "反馈状态无效");
            var reply = input.Reply?.Trim() ?? "";
            FinanceService.Require(reply.Length <= 4000 && (input.Status != "Resolved" || reply.Length > 0), "解决反馈时请填写回复，最多4000字");
            var ticket = await db.Set<SupportTicket>().SingleOrDefaultAsync(x => x.Id == id) ?? throw new ApiException(404, "反馈不存在");
            FinanceService.Version(ticket, c.Request.Headers.IfMatch);
            ticket.Status = input.Status; ticket.Reply = reply; ticket.UpdatedAt = DateTimeOffset.UtcNow; ticket.Version++;
            Audit(db, c, "ReplyTicket", id); await db.SaveChangesAsync();
            return FinanceEndpoints.Ok(c, Dto(ticket));
        });
        admin.MapGet("/audit", async (FinanceDb db, HttpContext c) => {
            var (page, size) = FinanceService.Paging(c.Request.Query);
            var q = db.AuditRecords.AsNoTracking().Where(x => x.Source == "Admin");
            var total = await q.CountAsync();
            var items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size)
                .Select(x => new { x.Id, x.UserId, x.Action, x.ResourceId, x.CreatedAt }).ToArrayAsync();
            return FinanceEndpoints.Ok(c, new { items, total, page, pageSize = size });
        });
    }
}
