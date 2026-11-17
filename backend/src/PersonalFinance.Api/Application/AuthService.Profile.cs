using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using SkiaSharp;

namespace PersonalFinance.Api.Application;

public sealed record RegisterInput(string Email, string Password, string DisplayName, string Language = "zh-CN", string? InviteCode = null);
public sealed record ProfileInput(string DisplayName, string RealName, string Phone, DateOnly? Birthday, string Gender,
    string Country, string Region, string City, string Occupation, string Bio, string Language, string TimeZone, string PreferredCurrency);
public sealed record PasswordInput(string CurrentPassword, string NewPassword);

public sealed partial class AuthService
{
    public static bool RegistrationEnabled(IConfiguration configuration) => configuration.GetValue("Auth:PublicRegistrationEnabled", false);
    private static void Invalid(string message, string code = "PROFILE_INVALID") => throw new ApiException(422, message, code);
    public static void ValidatePassword(string? password)
    {
        if (password is null || password.Length is < 12 or > 128 || !password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            Invalid("密码需为12至128个字符，并包含字母和数字", "PASSWORD_WEAK");
    }
    public static string NormalizeEmail(string? email)
    {
        var value = (email ?? "").Trim().ToLowerInvariant();
        if (value.Length > 256 || !MailAddress.TryCreate(value, out var address) || address.Address != value || !value.Contains('@'))
            Invalid("请输入有效邮箱", "EMAIL_INVALID");
        return value;
    }
    private static string Text(string? value, int max, bool required = false)
    {
        var result = (value ?? "").Trim();
        if (result.Length > max || required && result.Length == 0 || result.Any(c => char.IsControl(c) && c != '\n' && c != '\r'))
            Invalid("资料内容为空、过长或含有无效字符");
        return result;
    }
    public static string BrowserTimeZone(string value) => value == "UTC" ? value :
        TimeZoneInfo.TryConvertWindowsIdToIanaId(value, out var iana) ? iana : value;
    public static string NormalizeTimeZone(string? value)
    {
        var zone = Text(value, 100, true);
        try { TimeZoneInfo.FindSystemTimeZoneById(zone); }
        catch (TimeZoneNotFoundException) { Invalid("时区无效"); }
        catch (InvalidTimeZoneException) { Invalid("时区无效"); }
        return BrowserTimeZone(zone);
    }
    private async Task Lock(string resource) => await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Profile lock timeout',1;");
    private void Audit(AppUser user, string action, HttpContext context) => db.Set<AuditRecord>().Add(new()
    {
        UserId = user.Id, ResourceType = "UserProfile", ResourceId = user.Id, Action = action,
        ChangesJson = "[]", TraceId = context.TraceIdentifier
    }); // Personal details, passwords and image bytes never enter the audit payload.
    public async Task<object> Register(RegisterInput input, HttpContext context)
    {
        if (string.IsNullOrWhiteSpace(input.InviteCode) && !RegistrationEnabled(config)) throw new ApiException(403, "公开注册已关闭，请使用管理员提供的邀请码", "INVITATION_REQUIRED");
        var email = NormalizeEmail(input.Email); ValidatePassword(input.Password);
        var name = Text(input.DisplayName, 100, true);
        if (input.Language is not ("zh-CN" or "en")) Invalid("不支持该语言");
        await using var transaction = await db.Database.BeginTransactionAsync();
        Invitation? invitation = null;
        if (!string.IsNullOrWhiteSpace(input.InviteCode)) {
            if (!InvitationActivationEnabled(config)) throw new ApiException(403, "邀请激活已关闭", "INVITATION_ACTIVATION_DISABLED");
            var hash = InvitationHash(input.InviteCode);
            await Lock("invitation:" + hash);
            invitation = await db.Set<Invitation>().SingleOrDefaultAsync(x => x.TokenHash == hash);
            ValidateInvitation(invitation, email);
        }
        await Lock("registration:" + Hash(email));
        if (await db.Users.AnyAsync(x => x.Email == email)) throw new ApiException(409, "该邮箱无法用于注册，请登录或联系管理员", "EMAIL_UNAVAILABLE");
        var user = new AppUser { Email = email, DisplayName = name, Language = input.Language };
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, input.Password);
        if (invitation != null) { invitation.UsedAt = DateTimeOffset.UtcNow; invitation.UpdatedAt = invitation.UsedAt.Value; invitation.UsedByUserId = user.Id; invitation.Version++; InvitationAudit(user.Id, "RedeemInvitation", invitation.Id, context); }
        db.Users.Add(user); Bootstrap.SeedDefaults(db, user); Audit(user, "Register", context);
        var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(48));
        var session = new Session { UserId = user.Id, RefreshHash = Hash(raw), ExpiresAt = DateTimeOffset.UtcNow.AddDays(14) };
        db.Sessions.Add(session); await db.SaveChangesAsync(); await transaction.CommitAsync(); Cookie(context, raw);
        return new { user = UserDto(user), accessToken = Token(user, session) };
    }
    public static object ProfileDto(AppUser u) => new { u.Id, u.Email, u.DisplayName, u.RealName, u.Phone, u.Birthday, u.Gender,
        u.Country, u.Region, u.City, u.Occupation, u.Bio, u.Language, timeZone = BrowserTimeZone(u.TimeZone), u.PreferredCurrency, u.CreatedAt,
        version = u.ProfileVersion, u.AvatarUpdatedAt, hasAvatar = u.AvatarPng != null };
    public async Task<object> Profile(string userId) => ProfileDto(await db.Users.AsNoTracking().SingleAsync(x => x.Id == userId));
    private static void Version(AppUser user, HttpContext context)
    {
        var header = context.Request.Headers.IfMatch.ToString().Trim('"');
        if (!long.TryParse(header, out var version)) throw new ApiException(428, "请提供资料版本", "VERSION_REQUIRED");
        if (version != user.ProfileVersion) throw new ApiException(409, "资料已更新，请刷新后重试", "VERSION_CONFLICT");
    }
    public async Task<object> UpdateProfile(string userId, ProfileInput input, HttpContext context)
    {
        if (input.Language is not ("zh-CN" or "en") || input.Gender is not ("Unspecified" or "Female" or "Male" or "Other")) Invalid("语言或性别选项无效");
        if (input.Birthday > DateOnly.FromDateTime(DateTime.UtcNow) || input.Birthday < new DateOnly(1900, 1, 1)) Invalid("出生日期无效");
        var timeZone = NormalizeTimeZone(input.TimeZone);
        if (!CurrencyDefinitions.Supports(input.PreferredCurrency) ||
            await db.Set<CurrencyPreference>().AnyAsync(x => x.UserId == userId && x.Currency == input.PreferredCurrency && !x.Enabled))
            Invalid("请选择已启用的币种");
        await using var transaction = await db.Database.BeginTransactionAsync(); await Lock("user:" + userId);
        var user = await db.Users.SingleAsync(x => x.Id == userId); Version(user, context);
        user.DisplayName = Text(input.DisplayName, 100, true); user.RealName = Text(input.RealName, 100); user.Phone = Text(input.Phone, 100);
        user.Birthday = input.Birthday; user.Gender = input.Gender; user.Country = Text(input.Country, 100); user.Region = Text(input.Region, 100);
        user.City = Text(input.City, 100); user.Occupation = Text(input.Occupation, 100); user.Bio = Text(input.Bio, 1000);
        user.Language = input.Language; user.TimeZone = timeZone; user.PreferredCurrency = input.PreferredCurrency;
        user.ProfileVersion++; Audit(user, "UpdateProfile", context); await db.SaveChangesAsync(); await transaction.CommitAsync();
        return ProfileDto(user);
    }
    public async Task<object> ChangePassword(string userId, PasswordInput input, HttpContext context)
    {
        ValidatePassword(input.NewPassword);
        await using var transaction = await db.Database.BeginTransactionAsync(); await Lock("user:" + userId);
        var user = await db.Users.SingleAsync(x => x.Id == userId);
        if (new PasswordHasher<AppUser>().VerifyHashedPassword(user, user.PasswordHash, input.CurrentPassword ?? "") == PasswordVerificationResult.Failed)
            throw new ApiException(403, "当前密码不正确", "PASSWORD_INCORRECT");
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, input.NewPassword);
        await db.Sessions.Where(x => x.UserId == userId).ExecuteUpdateAsync(s => s.SetProperty(x => x.Revoked, true));
        Audit(user, "ChangePassword", context); await db.SaveChangesAsync(); await transaction.CommitAsync();
        context.Response.Cookies.Delete("pf-refresh", new CookieOptions { Path = "/api/auth" });
        return new { signInRequired = true };
    }
    public static byte[] NormalizeAvatar(byte[] bytes)
    {
        if (bytes.Length is 0 or > 2097152) Invalid("头像不得超过2MB", "AVATAR_INVALID");
        try
        {
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data);
            if (codec == null || codec.EncodedFormat is not (SKEncodedImageFormat.Png or SKEncodedImageFormat.Jpeg) ||
                codec.Info.Width <= 0 || codec.Info.Height <= 0 || codec.Info.Width > 4096 || codec.Info.Height > 4096 ||
                (long)codec.Info.Width * codec.Info.Height > 16000000)
                Invalid("仅支持尺寸不超过4096像素的PNG或JPEG头像", "AVATAR_INVALID");
            using var decoded = SKBitmap.Decode(codec!);
            if (decoded == null) Invalid("头像文件无效", "AVATAR_INVALID");
            using var target = new SKBitmap(256, 256);
            using (var canvas = new SKCanvas(target))
            {
                canvas.Clear(SKColors.Transparent);
                // EXIF describes the display orientation; decoding JPEG pixels alone leaves phone photos rotated or mirrored.
                // Apply its orthogonal transform around the image centre and crop directly into the target, without another full-size bitmap.
                (float a, float b, float c, float d) = codec!.EncodedOrigin switch
                {
                    SKEncodedOrigin.TopRight => (-1, 0, 0, 1),
                    SKEncodedOrigin.BottomRight => (-1, 0, 0, -1),
                    SKEncodedOrigin.BottomLeft => (1, 0, 0, -1),
                    SKEncodedOrigin.LeftTop => (0, 1, 1, 0),
                    SKEncodedOrigin.RightTop => (0, -1, 1, 0),
                    SKEncodedOrigin.RightBottom => (0, -1, -1, 0),
                    SKEncodedOrigin.LeftBottom => (0, 1, -1, 0),
                    _ => (1, 0, 0, 1)
                };
                var scale = 256f / Math.Min(decoded!.Width, decoded.Height);
                var matrix = new SKMatrix(scale * a, scale * b, 128 - scale * (a * decoded.Width + b * decoded.Height) / 2,
                    scale * c, scale * d, 128 - scale * (c * decoded.Width + d * decoded.Height) / 2, 0, 0, 1);
                canvas.SetMatrix(matrix);
                canvas.DrawBitmap(decoded, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
            }
            using var encoded = target.Encode(SKEncodedImageFormat.Png, 100);
            return encoded.ToArray();
        }
        catch (ApiException) { throw; }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException)
        { throw new ApiException(422, "头像文件无效，请选择PNG或JPEG图片", "AVATAR_INVALID"); }
    }
    public async Task<object> Avatar(string userId, byte[]? bytes, HttpContext context)
    {
        var png = bytes == null ? null : NormalizeAvatar(bytes);
        await using var transaction = await db.Database.BeginTransactionAsync(); await Lock("user:" + userId);
        var user = await db.Users.SingleAsync(x => x.Id == userId); Version(user, context);
        user.AvatarPng = png; user.AvatarUpdatedAt = png == null ? null : DateTimeOffset.UtcNow; user.ProfileVersion++;
        Audit(user, png == null ? "RemoveAvatar" : "UpdateAvatar", context); await db.SaveChangesAsync(); await transaction.CommitAsync();
        return ProfileDto(user);
    }
}

