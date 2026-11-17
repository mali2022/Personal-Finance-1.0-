using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record InvitationCreate(DateTimeOffset ExpiresAt, string? Email = null);
public sealed record InvitationValidate(string Code, string Email);
public sealed partial class AuthService
{
    public static bool InvitationActivationEnabled(IConfiguration configuration) => configuration.GetValue("Auth:InvitationActivationEnabled", true);
    public static string InvitationHash(string? code) {
        var value = (code ?? "").Trim().ToUpperInvariant();
        if (!Regex.IsMatch(value, "^PF-[A-F0-9]{64}$")) throw new ApiException(422, "邀请码无效或邮箱不匹配", "INVITATION_INVALID");
        return Hash(value);
    }
    public static void ValidateInvitation(Invitation? row, string email) {
        if (row == null || row.BoundEmail != null && row.BoundEmail != email) throw new ApiException(422, "邀请码无效或邮箱不匹配", "INVITATION_INVALID");
        if (row.UsedAt != null) throw new ApiException(409, "邀请码已使用，请使用账号密码登录", "INVITATION_USED");
        if (row.RevokedAt != null) throw new ApiException(410, "邀请码已撤销，请联系管理员", "INVITATION_REVOKED");
        if (row.ExpiresAt <= DateTimeOffset.UtcNow) throw new ApiException(410, "邀请码已过期，请联系管理员", "INVITATION_EXPIRED");
    }
    private void InvitationAudit(string user, string action, string id, HttpContext context) => db.AuditRecords.Add(new AuditRecord { UserId = user, Source = "Admin", ResourceType = "Invitation", ResourceId = id, Action = action, ChangesJson = "[]", TraceId = context.TraceIdentifier });
    private async Task InvitationAdmin(string user) {
        if (!await db.Users.AnyAsync(x => x.Id == user && x.IsAdmin)) throw new ApiException(403, "仅管理员可管理邀请码", "ADMIN_REQUIRED");
    }
    private static object InvitationDto(Invitation x) => new { x.Id, x.BoundEmail, x.CreatedByUserId, x.CreatedAt, x.UpdatedAt, x.ExpiresAt, x.UsedAt, x.UsedByUserId, x.RevokedAt, version = x.Version.ToString(), status = x.UsedAt != null ? "Used" : x.RevokedAt != null ? "Revoked" : x.ExpiresAt <= DateTimeOffset.UtcNow ? "Expired" : "Active" };
    public async Task<object> CreateInvitation(string user, InvitationCreate input, HttpContext context) {
        await InvitationAdmin(user);
        var now = DateTimeOffset.UtcNow;
        if (input.ExpiresAt <= now || input.ExpiresAt > now.AddDays(90)) throw new ApiException(422, "有效期须在未来90天内", "INVITATION_EXPIRY_INVALID");
        var raw = "PF-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var row = new Invitation { TokenHash = Hash(raw), BoundEmail = string.IsNullOrWhiteSpace(input.Email) ? null : NormalizeEmail(input.Email), CreatedByUserId = user, ExpiresAt = input.ExpiresAt };
        db.Add(row); InvitationAudit(user, "CreateInvitation", row.Id, context); await db.SaveChangesAsync();
        context.Response.Headers.CacheControl = "no-store";
        return new { invitation = InvitationDto(row), code = raw };
    }
    public async Task<object> Invitations(string user, int page) {
        await InvitationAdmin(user); if (page < 1 || page > 1000000) throw new ApiException(422, "分页参数无效");
        var q = db.Set<Invitation>().AsNoTracking(); var total = await q.CountAsync();
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page-1)*20).Take(20).ToArrayAsync();
        return new { items = rows.Select(InvitationDto), total, page, pageSize = 20 };
    }
    public async Task<object> RevokeInvitation(string user, string id, HttpContext context) {
        await InvitationAdmin(user);
        var hash = await db.Set<Invitation>().Where(x => x.Id == id).Select(x => x.TokenHash).SingleOrDefaultAsync() ?? throw new ApiException(404, "邀请码不存在");
        await using var tx = await db.Database.BeginTransactionAsync(); await Lock("invitation:" + hash);
        var row = await db.Set<Invitation>().SingleAsync(x => x.Id == id);
        if (context.Request.Headers.IfMatch.ToString().Trim('"') != row.Version.ToString()) throw new ApiException(409, "邀请码状态已变化，请刷新", "VERSION_CONFLICT");
        if (row.UsedAt != null) throw new ApiException(409, "已使用的邀请码不能撤销", "INVITATION_USED");
        if (row.RevokedAt == null) { row.RevokedAt = DateTimeOffset.UtcNow; row.UpdatedAt = row.RevokedAt.Value; row.Version++; InvitationAudit(user, "RevokeInvitation", id, context); await db.SaveChangesAsync(); }
        await tx.CommitAsync(); return InvitationDto(row);
    }
    public async Task<object> CheckInvitation(InvitationValidate input) {
        if (!InvitationActivationEnabled(config)) throw new ApiException(403, "邀请激活已关闭", "INVITATION_ACTIVATION_DISABLED");
        var email = NormalizeEmail(input.Email); var hash = InvitationHash(input.Code);
        var row = await db.Set<Invitation>().AsNoTracking().SingleOrDefaultAsync(x => x.TokenHash == hash);
        ValidateInvitation(row, email); return new { valid = true, expiresAt = row!.ExpiresAt };
    }
}
public static class InvitationEndpoints
{
    public static void Map(WebApplication app) {
        app.MapPost("/api/auth/invitations/validate", async (InvitationValidate b, AuthService a, HttpContext c) => FinanceEndpoints.Ok(c, await a.CheckInvitation(b))).RequireRateLimiting("registration");
        var admin = app.MapGroup("/api/admin/invitations").RequireAuthorization().RequireRateLimiting("profile");
        admin.MapGet("", async (AuthService a, HttpContext c, int page = 1) => FinanceEndpoints.Ok(c, await a.Invitations(FinanceEndpoints.User(c),page)));
        admin.MapPost("", async (InvitationCreate b, AuthService a, HttpContext c) => FinanceEndpoints.Ok(c, await a.CreateInvitation(FinanceEndpoints.User(c),b,c)));
        admin.MapPost("/{id}/revoke", async (string id, AuthService a, HttpContext c) => FinanceEndpoints.Ok(c, await a.RevokeInvitation(FinanceEndpoints.User(c),id,c)));
    }
}
