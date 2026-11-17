using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

[Collection("Finance SQL")]
public sealed class InvitationAccessTests
{
    private sealed class Factory(string connection) : WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder b) {
            var folder=Path.Combine(Path.GetTempPath(),"pf-invites-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
            b.UseContentRoot(folder).UseEnvironment("Development");
            b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?> { ["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('I',64),["DataProtection:KeyPath"]=Path.Combine(folder,"keys"),["Verification:Isolated"]="true",["Auth:PublicRegistrationEnabled"]="false",["Auth:InvitationActivationEnabled"]="true" }));
            b.ConfigureServices(s=> {s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('I',64))));});
        }
    }
    private static async Task<JsonElement> Data(HttpResponseMessage r) {var raw=await r.Content.ReadAsStringAsync();Assert.True(r.IsSuccessStatusCode,$"HTTP {(int)r.StatusCode}: {raw}");return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();}
    private static async Task Csrf(HttpClient c) {var r=await c.GetAsync("/api/auth/csrf");var cookie=r.Headers.GetValues("Set-Cookie").First(x=>x.StartsWith("XSRF-TOKEN="));c.DefaultRequestHeaders.Remove("X-XSRF-TOKEN");c.DefaultRequestHeaders.Add("X-XSRF-TOKEN",Uri.UnescapeDataString(cookie.Split(';')[0][11..]));}
    [Fact] public void InvitationValidationAndProductIdentityAreDeterministic() {
        var raw="PF-"+Convert.ToHexString(RandomNumberGenerator.GetBytes(32));Assert.Equal(AuthService.Hash(raw),AuthService.InvitationHash(raw.ToLowerInvariant()));
        Assert.Throws<ApiException>(()=>AuthService.InvitationHash("guess"));
        var x=new Invitation{ExpiresAt=DateTimeOffset.UtcNow.AddDays(1),BoundEmail="a@example.test"};
        Assert.Equal("INVITATION_INVALID",Assert.Throws<ApiException>(()=>AuthService.ValidateInvitation(x,"b@example.test")).Code);
        x.BoundEmail=null;x.UsedAt=DateTimeOffset.UtcNow;Assert.Equal("INVITATION_USED",Assert.Throws<ApiException>(()=>AuthService.ValidateInvitation(x,"a@example.test")).Code);
        x.UsedAt=null;x.RevokedAt=DateTimeOffset.UtcNow;Assert.Equal("INVITATION_REVOKED",Assert.Throws<ApiException>(()=>AuthService.ValidateInvitation(x,"a@example.test")).Code);
        x.RevokedAt=null;x.ExpiresAt=DateTimeOffset.UtcNow;Assert.Equal("INVITATION_EXPIRED",Assert.Throws<ApiException>(()=>AuthService.ValidateInvitation(x,"a@example.test")).Code);
        Assert.Matches(@"^[0-9]+[.][0-9]+[.][0-9]+$",ProductRelease.Current.GetProperty("version").GetString()!);Assert.Matches(@"^[0-9]{4}[.][0-9]{2}[.][0-9]{2}[.][0-9]+$",ProductRelease.Current.GetProperty("releaseNumber").GetString()!);
        var conf=new ConfigurationBuilder().Build();Assert.False(AuthService.RegistrationEnabled(conf));Assert.True(AuthService.InvitationActivationEnabled(conf));
    }
    [PersonalFinance.Tests.ProfileSqlFact]
    public async Task InvitationsAreProtectedAuditedAndSingleUseAcrossConcurrentRedemptions() {
        var conn=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(conn).Options);await db.Database.MigrateAsync();
        var password="Invitation-Test-2026!";var tag=Guid.NewGuid().ToString("N");
        AppUser Make(bool admin){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@invite.test",DisplayName="Invitation test",IsAdmin=admin};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var owner=Make(true);var member=Make(false);await db.SaveChangesAsync();using var factory=new Factory(conn);using var admin=factory.CreateClient();using var normal=factory.CreateClient();using var guest=factory.CreateClient();
        async Task Login(HttpClient c,AppUser u) {var d=await Data(await c.PostAsJsonAsync("/api/auth/login",new{email=u.Email,password}));c.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",d.GetProperty("accessToken").GetString());}
        await Login(admin,owner);await Login(normal,member);
        Assert.Equal(HttpStatusCode.Unauthorized,(await guest.GetAsync("/api/admin/invitations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await normal.GetAsync("/api/admin/invitations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await normal.PostAsJsonAsync("/api/admin/invitations",new{expiresAt=DateTimeOffset.UtcNow.AddDays(1)})).StatusCode);
        var options=await Data(await guest.GetAsync("/api/auth/options"));Assert.False(options.GetProperty("registrationEnabled").GetBoolean());Assert.True(options.GetProperty("invitationActivationEnabled").GetBoolean());
        var publicVersion=await Data(await guest.GetAsync("/api/version"));
        Assert.Equal(ProductRelease.Current.GetProperty("releaseNumber").GetString(),publicVersion.GetProperty("releaseNumber").GetString());
        Assert.Equal(ProductRelease.Current.GetProperty("version").GetString(),publicVersion.GetProperty("version").GetString());
        await Csrf(guest);Assert.Equal(HttpStatusCode.Forbidden,(await guest.PostAsJsonAsync("/api/auth/register",new{email="no-invite-"+tag+"@invite.test",password,displayName="No invitation"})).StatusCode);
        var issued=await Data(await admin.PostAsJsonAsync("/api/admin/invitations",new{expiresAt=DateTimeOffset.UtcNow.AddDays(1)}));var code=issued.GetProperty("code").GetString()!;var id=issued.GetProperty("invitation").GetProperty("id").GetString()!;
        var listRaw=await (await admin.GetAsync("/api/admin/invitations")).Content.ReadAsStringAsync();Assert.DoesNotContain(code,listRaw);Assert.DoesNotContain("tokenHash",listRaw);
        Assert.Equal(AuthService.Hash(code),(await db.Set<Invitation>().AsNoTracking().SingleAsync(x=>x.Id==id)).TokenHash);
        async Task<bool> Redeem(string email) {using var scope=factory.Services.CreateScope();var a=scope.ServiceProvider.GetRequiredService<AuthService>();try{await a.Register(new RegisterInput(email,password,"Invited user","zh-CN",code),new DefaultHttpContext{RequestServices=scope.ServiceProvider});return true;}catch(ApiException e){Assert.Equal("INVITATION_USED",e.Code);return false;}}
        var results=await Task.WhenAll(Redeem("a-"+tag+"@invite.test"),Redeem("b-"+tag+"@invite.test"));Assert.Single(results.Where(x=>x));
        var used=await db.Set<Invitation>().AsNoTracking().SingleAsync(x=>x.Id==id);Assert.NotNull(used.UsedByUserId);Assert.NotNull(used.UsedAt);
        using var activated=factory.CreateClient();await Login(activated,await db.Users.AsNoTracking().SingleAsync(x=>x.Id==used.UsedByUserId));await Csrf(activated);await Data(await activated.PostAsJsonAsync("/api/auth/refresh",new{}));
        Assert.Equal(1,await db.Users.CountAsync(x=>x.Email=="a-"+tag+"@invite.test"||x.Email=="b-"+tag+"@invite.test"));
        var bound=await Data(await admin.PostAsJsonAsync("/api/admin/invitations",new{expiresAt=DateTimeOffset.UtcNow.AddDays(1),email="bound-"+tag+"@invite.test"}));var boundId=bound.GetProperty("invitation").GetProperty("id").GetString()!;
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await guest.PostAsJsonAsync("/api/auth/invitations/validate",new{code=bound.GetProperty("code").GetString(),email="wrong@invite.test"})).StatusCode);
        admin.DefaultRequestHeaders.TryAddWithoutValidation("If-Match","1");await Data(await admin.PostAsJsonAsync($"/api/admin/invitations/{boundId}/revoke",new{}));
        Assert.Equal(HttpStatusCode.Gone,(await guest.PostAsJsonAsync("/api/auth/invitations/validate",new{code=bound.GetProperty("code").GetString(),email="bound-"+tag+"@invite.test"})).StatusCode);
        Assert.True(await db.AuditRecords.AnyAsync(x=>x.ResourceId==id&&x.Action=="CreateInvitation"&&x.Source=="Admin"));Assert.True(await db.AuditRecords.AnyAsync(x=>x.ResourceId==id&&x.Action=="RedeemInvitation"));
        await Csrf(normal);await Data(await normal.PostAsJsonAsync("/api/auth/refresh",new{}));await Data(await normal.GetAsync("/api/auth/me"));
        for(var i=0;i<6;i++) await guest.PostAsJsonAsync("/api/auth/register",new{email="guess@invite.test",password,displayName="guess",inviteCode="bad"});
        Assert.Equal(HttpStatusCode.TooManyRequests,(await guest.PostAsJsonAsync("/api/auth/invitations/validate",new{code="bad",email="guess@invite.test"})).StatusCode);
    }
}

