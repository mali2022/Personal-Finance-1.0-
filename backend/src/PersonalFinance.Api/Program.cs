using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Data;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;
using PersonalFinance.Api.Application.Ai;

var builder = WebApplication.CreateBuilder(args);
var localFile = Path.Combine(builder.Environment.ContentRootPath, "appsettings.Local.json");
if (builder.Environment.IsDevelopment() && !File.Exists(localFile))
    File.WriteAllText(localFile, JsonSerializer.Serialize(new { Auth = new { SigningKey = Convert.ToHexString(RandomNumberGenerator.GetBytes(48)) } }));
if (builder.Environment.IsDevelopment()) builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true);
builder.Configuration.AddEnvironmentVariables();
var signingKey = builder.Configuration["Auth:SigningKey"] ?? throw new InvalidOperationException("请设置 Auth__SigningKey");
if (signingKey.Length < 32) throw new InvalidOperationException("Auth__SigningKey 至少32字符");
builder.Services.AddDbContext<FinanceDb>(o => o.UseSqlServer(builder.Configuration.GetConnectionString("Finance") ?? throw new InvalidOperationException("缺少 ConnectionStrings__Finance")));
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<LiveFxService>(http => http.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddScoped<FinanceService>(); builder.Services.AddScoped<AuthService>();
AiEndpoints.Register(builder.Services, builder.Configuration);
builder.Services.AddHostedService<RecurringScheduler>();
builder.Services.AddHostedService<BudgetAlertScheduler>();
var keyPath = builder.Configuration["DataProtection:KeyPath"] ?? Path.Combine(builder.Environment.ContentRootPath, ".keys");
var protection = builder.Services.AddDataProtection().SetApplicationName("PersonalFinance").PersistKeysToFileSystem(new DirectoryInfo(keyPath));
if (OperatingSystem.IsWindows()) protection.ProtectKeysWithDpapi();
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-XSRF-TOKEN"; o.Cookie.Name = "pf-antiforgery"; o.Cookie.SameSite = SameSiteMode.Strict; o.Cookie.HttpOnly = true; o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; });
builder.Services.Configure<ForwardedHeadersOptions>(o => { o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto; foreach (var network in builder.Configuration.GetSection("TrustedProxyNetworks").Get<string[]>() ?? []) o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network)); });
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new() { ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), ValidateIssuer = true, ValidIssuer = "PersonalFinance", ValidateAudience = true, ValidAudience = "PersonalFinance", ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(20) };
    o.Events = new JwtBearerEvents
    {
        OnTokenValidated = async ctx =>
        {
            var user = ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier); var sid = ctx.Principal?.FindFirstValue("sid");
            var db = ctx.HttpContext.RequestServices.GetRequiredService<FinanceDb>();
            if (!await db.Sessions.AnyAsync(s => s.Id == sid && s.UserId == user && !s.Revoked && s.ExpiresAt > DateTimeOffset.UtcNow)) ctx.Fail("Session revoked");
        },
        OnChallenge = ctx => { ctx.HandleResponse(); ctx.Response.StatusCode = 401; return ctx.Response.WriteAsJsonAsync(new { message = "请先登录", code = "UNAUTHORIZED", traceId = ctx.HttpContext.TraceIdentifier }); }
    };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o => {
    o.AddPolicy("life-simulation", c => System.Threading.RateLimiting.RateLimitPartition.GetConcurrencyLimiter(c.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous", _ => new() { PermitLimit = 1, QueueLimit = 0 }));
    o.AddPolicy("ai", c => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(c.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous",
        _ => new() { PermitLimit = builder.Configuration.GetValue("Ai:HttpRequestsPerMinute", 600), Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("login", LoginRateLimitPolicy.Partition);
    o.AddPolicy("registration", c => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new() { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("profile", c => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(c.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? c.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new() { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.RejectionStatusCode = 429;
});
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 12 * 1024 * 1024);
var app = builder.Build();
if (args.Contains("--protect-deepseek-key") || args.Contains("--protect-deepseek-key-stdin"))
{
    var key = args.Contains("--protect-deepseek-key-stdin")
        ? Console.In.ReadToEnd().Trim()
        : Environment.GetEnvironmentVariable("Ai__DeepSeek__ApiKey") ?? throw new InvalidOperationException("请通过当前服务账户的临时环境变量 Ai__DeepSeek__ApiKey 提供密钥，不能放入命令行参数。");
    DeepSeekKeyStore.Store(key, app.Services.GetRequiredService<IDataProtectionProvider>(), builder.Configuration, builder.Environment);
    Console.WriteLine("DeepSeek 密钥已保存为受保护文件；请清除临时环境变量并限制密钥目录的服务账户访问权限。");
    return;
}
app.UseForwardedHeaders();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.CacheControl = "no-store"; ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    try { await next(); }
    catch (ApiException e) { ctx.Response.StatusCode = e.Status; await ctx.Response.WriteAsJsonAsync(new { message = e.Message, code = e.Code, traceId = ctx.TraceIdentifier }); }
    catch (BadHttpRequestException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { message = "请求内容格式无效", code = "INVALID_REQUEST", traceId = ctx.TraceIdentifier }); }
    catch (AntiforgeryValidationException) { ctx.Response.StatusCode = 403; await ctx.Response.WriteAsJsonAsync(new { message = "安全凭据过期，请刷新页面", code = "CSRF_INVALID", traceId = ctx.TraceIdentifier }); }
    catch (DbUpdateConcurrencyException) { ctx.Response.StatusCode = 409; await ctx.Response.WriteAsJsonAsync(new { message = "数据已更新，请重新加载", code = "VERSION_CONFLICT", traceId = ctx.TraceIdentifier }); }
    catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 }) { ctx.Response.StatusCode = 409; await ctx.Response.WriteAsJsonAsync(new { message = "名称或记录已存在", code = "DUPLICATE_RECORD", traceId = ctx.TraceIdentifier }); }
    catch (Exception e) { app.Logger.LogError(e, "Request failed {TraceId}", ctx.TraceIdentifier); ctx.Response.StatusCode = 500; await ctx.Response.WriteAsJsonAsync(new { message = "服务器暂时无法处理，请稍后重试", code = "SERVER_ERROR", traceId = ctx.TraceIdentifier }); }
});
// Anonymous antiforgery tokens are generated and validated before bearer authentication.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api/auth"))
    {
        var anti = ctx.RequestServices.GetRequiredService<IAntiforgery>();
        if (HttpMethods.IsGet(ctx.Request.Method))
        { var tokens = anti.GetAndStoreTokens(ctx); ctx.Response.Cookies.Append("XSRF-TOKEN", tokens.RequestToken!, new() { HttpOnly = false, Secure = !app.Environment.IsDevelopment() || ctx.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/" }); }
        else
        {
            var origin = ctx.Request.Headers.Origin.ToString(); var allowed = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
            if (origin.Length > 0 && !allowed.Contains(origin) && origin != $"{ctx.Request.Scheme}://{ctx.Request.Host}") throw new ApiException(403, "请求来源不受信任", "ORIGIN_INVALID");
            if (ctx.Request.Path != "/api/auth/login") await anti.ValidateRequestAsync(ctx);
            else if (ctx.Request.Headers["Sec-Fetch-Site"] == "cross-site") throw new ApiException(403, "请求来源不受信任", "ORIGIN_INVALID");
        }
    }
    await next();
});
app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
var snapshotReads = builder.Configuration.GetValue<bool>("Database:SnapshotReads");
app.Use(async (ctx, next) =>
{
    if (!snapshotReads || !HttpMethods.IsGet(ctx.Request.Method) || !ctx.Request.Path.StartsWithSegments("/api") || ctx.User.Identity?.IsAuthenticated != true) {
        await next(); return;
    }
    var db = ctx.RequestServices.GetRequiredService<FinanceDb>();
    await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.Snapshot, ctx.RequestAborted);
    await next();
    await snapshot.CommitAsync();
});
// Production assets are optional so the existing development workflow is preserved.
app.UseDefaultFiles();
app.UseStaticFiles();
FinanceEndpoints.Map(app);
AiEndpoints.Map(app);
if (Directory.Exists(Path.Combine(app.Environment.ContentRootPath, "wwwroot")))
    app.MapFallbackToFile("{*path:nonfile}", "index.html").AddEndpointFilter(async (context, next) =>
    {
        if (context.HttpContext.Request.Path.StartsWithSegments("/api")) return Results.NotFound();
        return await next(context);
    });
if (builder.Configuration.GetValue<bool>("Verification:Isolated"))
{
    var verificationDb = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(builder.Configuration.GetConnectionString("Finance")).InitialCatalog;
    if (!app.Environment.IsDevelopment() || !System.Text.RegularExpressions.Regex.IsMatch(verificationDb, "^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$"))
        throw new InvalidOperationException("隔离测试模式只允许随机命名的恢复验证库");
    app.MapGet("/api/verification-context", () => Results.Json(new { database = verificationDb })).RequireAuthorization();
}
if (args.Contains("--initialize-db"))
{
    if (!app.Environment.IsDevelopment() && builder.Configuration["Bootstrap:Password"] is null) throw new InvalidOperationException("生产初始化必须设置 Bootstrap__Password");
    using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
    var connection = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(builder.Configuration.GetConnectionString("Finance"));
    if (!connection.InitialCatalog.StartsWith("PersonalFinanceWeb", StringComparison.Ordinal)) throw new InvalidOperationException("初始化仅允许 PersonalFinanceWeb 开头的应用数据库");
    var migrationTimeout = builder.Configuration.GetValue("Database:MigrationCommandTimeoutSeconds", 600);
    if (migrationTimeout is < 30 or > 3600) throw new InvalidOperationException("数据库迁移超时须为30至3600秒");
    db.Database.SetCommandTimeout(migrationTimeout);
    await db.Database.MigrateAsync();
    if (snapshotReads) await db.Database.ExecuteSqlRawAsync("ALTER DATABASE CURRENT SET ALLOW_SNAPSHOT_ISOLATION ON");
    await Bootstrap.Initialize(db, builder.Configuration, builder.Environment.ContentRootPath); return;
}
if (snapshotReads) {
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<FinanceDb>();
    var state = await db.Database.SqlQueryRaw<int>("SELECT CAST(snapshot_isolation_state AS int) AS [Value] FROM sys.databases WHERE name=DB_NAME()").SingleAsync();
    if (state != 1) throw new InvalidOperationException("快照读取尚未初始化，请先执行数据库初始化");
}
await app.RunAsync();
public partial class Program { }
