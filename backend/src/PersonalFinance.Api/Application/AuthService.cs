using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public sealed partial class AuthService(FinanceDb db, IConfiguration config)
{
    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    public static object UserDto(AppUser u) => new { u.Id, u.Email, u.DisplayName, u.Language, u.AvatarUpdatedAt, permissions = u.IsAdmin ? new[] { "finance:read", "finance:write", "admin:manage" } : new[] { "finance:read", "finance:write" } };
    private string Token(AppUser user, Session session)
    {
        var token = new JwtSecurityToken("PersonalFinance", "PersonalFinance", [new(ClaimTypes.NameIdentifier, user.Id), new("sid", session.Id)],
            expires: DateTime.UtcNow.AddMinutes(10), signingCredentials: new(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Auth:SigningKey"]!)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
    private static void Cookie(HttpContext ctx, string value) => ctx.Response.Cookies.Append("pf-refresh", value, new() { HttpOnly = true, Secure = !ctx.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment() || ctx.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/api/auth", MaxAge = TimeSpan.FromDays(14) });
    public async Task<object> Login(LoginInput input, HttpContext ctx)
    {
        if (string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrEmpty(input.Password))
            throw new ApiException(401, "邮箱或密码不正确", "INVALID_CREDENTIALS");
        var email = input.Email.Trim().ToLowerInvariant();
        var userId = await db.Users.Where(x => x.Email == email).Select(x => x.Id).SingleOrDefaultAsync();
        if (userId is null) throw new ApiException(401, "邮箱或密码不正确", "INVALID_CREDENTIALS");
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Use the password-change lock before reading the hash, and hold it until the new session is committed.
        await Lock("user:" + userId);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId && x.Email == email);
        var valid = user is not null && new PasswordHasher<AppUser>().VerifyHashedPassword(user, user.PasswordHash, input.Password) != PasswordVerificationResult.Failed;
        if (!valid) throw new ApiException(401, "邮箱或密码不正确", "INVALID_CREDENTIALS");
        var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(48));
        var session = new Session { UserId = user!.Id, RefreshHash = Hash(raw), ExpiresAt = DateTimeOffset.UtcNow.AddDays(14) };
        db.Sessions.Add(session); await db.SaveChangesAsync(); await transaction.CommitAsync(); Cookie(ctx, raw);
        return new { user = UserDto(user), accessToken = Token(user, session) };
    }
    public async Task<object> Refresh(HttpContext ctx)
    {
        var raw = ctx.Request.Cookies["pf-refresh"] ?? ""; var hash = Hash(raw);
        await using var tx = await db.Database.BeginTransactionAsync();
        var resource = "session:" + hash;
        await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Session lock timeout',1;");
        var s = await db.Sessions.SingleOrDefaultAsync(x => x.RefreshHash == hash && !x.Revoked && x.ExpiresAt > DateTimeOffset.UtcNow);
        if (s is null) throw new ApiException(401, "登录已过期，请重新登录", "SESSION_EXPIRED");
        var user = await db.Users.SingleAsync(x => x.Id == s.UserId);
        var next = Convert.ToHexString(RandomNumberGenerator.GetBytes(48)); s.RefreshHash = Hash(next); s.Version++;
        await db.SaveChangesAsync(); await tx.CommitAsync(); Cookie(ctx, next); return new { accessToken = Token(user, s) };
    }
    public async Task<object> Logout(HttpContext ctx)
    {
        var hash = Hash(ctx.Request.Cookies["pf-refresh"] ?? ""); var sid = ctx.User.FindFirstValue("sid");
        await using var tx = await db.Database.BeginTransactionAsync();
        var resource = "session:" + hash;
        await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Session lock timeout',1;");
        await db.Sessions.Where(x => x.RefreshHash == hash || sid != null && x.Id == sid).ExecuteUpdateAsync(s => s.SetProperty(x => x.Revoked, true));
        await tx.CommitAsync(); ctx.Response.Cookies.Delete("pf-refresh", new CookieOptions { Path = "/api/auth" }); return new { loggedOut = true };
    }
}
