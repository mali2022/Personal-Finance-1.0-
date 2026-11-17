using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

[Collection("Finance SQL")]
public sealed class AdministrationSupportTests
{
    private sealed class Factory(string connection) : WebApplicationFactory<Program>
    {
        private readonly string folder = Path.Combine(Path.GetTempPath(), "pf-support-" + Guid.NewGuid().ToString("N"));
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Directory.CreateDirectory(folder); builder.UseContentRoot(folder).UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string,string?> {
                ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('S',64),
                ["DataProtection:KeyPath"] = Path.Combine(folder,".keys"), ["Verification:Isolated"] = "true" }));
            builder.ConfigureServices(services => {
                services.RemoveAll<DbContextOptions<FinanceDb>>(); services.AddDbContext<FinanceDb>(o => o.UseSqlServer(connection));
                services.RemoveAll<IHostedService>();
                services.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o =>
                    o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('S',64))));
            });
        }
    }
    private static async Task<JsonElement> Data(HttpResponseMessage r)
    {
        var raw = await r.Content.ReadAsStringAsync(); Assert.True(r.IsSuccessStatusCode,$"HTTP {(int)r.StatusCode}: {raw}");
        return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();
    }
    private static async Task Login(HttpClient client, AppUser u, string password)
    {
        var d = await Data(await client.PostAsJsonAsync("/api/auth/login",new {email=u.Email,password}));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", d.GetProperty("accessToken").GetString());
    }
    [PersonalFinance.Tests.ProfileSqlFact]
    public async Task AdministrationEnforcesRolesAndFeedbackIsolationWithConcurrentRepliesAndRevocation()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);
        await db.Database.MigrateAsync();
        var password = "Support-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(20));
        AppUser User(bool admin = false) { var u = new AppUser { Email=Guid.NewGuid().ToString("N")+"@support.test",IsAdmin=admin,DisplayName="Support test" };u.PasswordHash=new Microsoft.AspNetCore.Identity.PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u; }
        var owner=User(true);var first=User();var other=User();await db.SaveChangesAsync();
        using var factory = new Factory(connection);
        using var admin=factory.CreateClient();using var a=factory.CreateClient();using var b=factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await a.GetAsync("/api/admin/overview")).StatusCode);
        await Login(admin,owner,password);await Login(a,first,password);await Login(b,other,password);
        foreach(var path in new[]{"overview","users","tickets","audit"}) Assert.Equal(HttpStatusCode.Forbidden,(await a.GetAsync("/api/admin/"+path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await a.PostAsJsonAsync($"/api/admin/users/{other.Id}/revoke-sessions",new {})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await a.PutAsJsonAsync("/api/admin/tickets/missing",new{status="Resolved",reply="bad"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await a.PostAsJsonAsync("/api/support/tickets",new {subject=" ",content="x",kind="Bug"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await a.PostAsJsonAsync("/api/support/tickets",new {subject="x",content="x",kind="Invalid"})).StatusCode);
        var ticket=await Data(await a.PostAsJsonAsync("/api/support/tickets",new {subject="Test feedback",content="Steps to reproduce",kind="Bug"}));
        var id=ticket.GetProperty("id").GetString();
        Assert.Equal(1,(await Data(await a.GetAsync("/api/support/tickets"))).GetProperty("total").GetInt32());
        Assert.Equal(0,(await Data(await b.GetAsync("/api/support/tickets"))).GetProperty("total").GetInt32());
        Assert.Contains("admin:manage",(await Data(await admin.GetAsync("/api/auth/me"))).GetProperty("permissions").EnumerateArray().Select(x=>x.GetString()));
        Assert.DoesNotContain("admin:manage",(await Data(await a.GetAsync("/api/auth/me"))).GetProperty("permissions").EnumerateArray().Select(x=>x.GetString()));
        Assert.True((await Data(await admin.GetAsync("/api/admin/tickets?status=Open&keyword=Test%20feedback"))).GetProperty("total").GetInt32()>=1);
        var users=await Data(await admin.GetAsync("/api/admin/users?keyword="+first.Email));
        Assert.Equal(1,users.GetProperty("total").GetInt32());Assert.False(users.GetProperty("items")[0].TryGetProperty("passwordHash",out _));
        admin.DefaultRequestHeaders.TryAddWithoutValidation("If-Match","1");
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await admin.PutAsJsonAsync($"/api/admin/tickets/{id}",new{status="Resolved",reply=" "})).StatusCode);
        var updated=await Data(await admin.PutAsJsonAsync($"/api/admin/tickets/{id}",new{status="Resolved",reply="Fixed and verified"}));
        Assert.Equal("2",updated.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await admin.PutAsJsonAsync($"/api/admin/tickets/{id}",new{status="Open",reply="stale"})).StatusCode);
        var own=await Data(await a.GetAsync("/api/support/tickets"));Assert.Equal("Fixed and verified",own.GetProperty("items")[0].GetProperty("reply").GetString());
        for(var i=0;i<4;i++) await Data(await a.PostAsJsonAsync("/api/support/tickets",new {subject="Rate test "+i,content="test",kind="Question"}));
        Assert.Equal(HttpStatusCode.TooManyRequests,(await a.PostAsJsonAsync("/api/support/tickets",new {subject="Too many",content="test",kind="Question"})).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await admin.PostAsJsonAsync($"/api/admin/users/{owner.Id}/revoke-sessions",new{})).StatusCode);
        await Data(await admin.PostAsJsonAsync($"/api/admin/users/{first.Id}/revoke-sessions",new{}));
        Assert.Equal(HttpStatusCode.Unauthorized,(await a.GetAsync("/api/support/tickets")).StatusCode);
        Assert.True((await Data(await admin.GetAsync("/api/admin/audit"))).GetProperty("total").GetInt32()>=2);
        Assert.True((await Data(await admin.GetAsync("/api/admin/overview"))).GetProperty("resolvedTickets").GetInt32()>=1);
        // A role change in the database takes effect on the next request with the same JWT.
        await db.Users.Where(x=>x.Id==owner.Id).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsAdmin,false));
        Assert.Equal(HttpStatusCode.Forbidden,(await admin.GetAsync("/api/admin/overview")).StatusCode);
    }
}
