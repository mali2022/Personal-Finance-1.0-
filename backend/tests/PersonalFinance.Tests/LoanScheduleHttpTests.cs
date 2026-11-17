using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
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

namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class LoanScheduleHttpTests
{
    sealed class Factory(string connection) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b)
        {
            b.UseEnvironment("Development");
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('L', 64), ["DataProtection:KeyPath"] = Path.Combine(Path.GetTempPath(), "pf-loan-test-keys") }));
            b.ConfigureServices(s => {
                s.RemoveAll<DbContextOptions<FinanceDb>>(); s.AddDbContext<FinanceDb>(o => o.UseSqlServer(connection)); s.RemoveAll<IHostedService>();
                s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o => o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('L', 64))));
            });
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage r)
    {
        var raw = await r.Content.ReadAsStringAsync(); Assert.True(r.IsSuccessStatusCode, $"HTTP {(int)r.StatusCode}: {raw}");
        return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();
    }
    static Task<HttpResponseMessage> Save(HttpClient c, LoanScheduleInput body, string? id = null, string version = "0", string? key = null)
    {
        var r = new HttpRequestMessage(id == null ? HttpMethod.Post : HttpMethod.Put, "/api/loan-schedules" + (id == null ? "" : "/" + id)) { Content = JsonContent.Create(body) };
        r.Headers.TryAddWithoutValidation("If-Match", version); r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return c.SendAsync(r);
    }
    [ProfileSqlFact] public async Task PlansPersistWithOwnershipVersionAndIdempotencyWithoutLedgerWrites()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options); await db.Database.MigrateAsync();
        var password = "Loan-Test-" + Guid.NewGuid().ToString("N");
        AppUser User() { var u = new AppUser { Email = Guid.NewGuid().ToString("N") + "@loan.test", DisplayName = "Loan test" }; u.PasswordHash = new PasswordHasher<AppUser>().HashPassword(u, password); db.Add(u); return u; }
        var user = User(); var other = User(); await db.SaveChangesAsync();
        using var factory = new Factory(connection); using var client = factory.CreateClient(); using var stranger = factory.CreateClient();
        foreach (var pair in new[] { (client, user), (stranger, other) }) { var login = await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login", new { email = pair.Item2.Email, password })); pair.Item1.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.GetProperty("accessToken").GetString()); }
        var transactions = await db.Transactions.CountAsync(); var entries = await db.Entries.CountAsync();
        var input = new LoanScheduleInput("示例", "1000", new(2026, 1, 1), new(2026, 2, 1), 12, 6, 0.05m, "EqualPayment", []);
        var key = Guid.NewGuid().ToString(); var created = await Data(await Save(client, input, key: key)); var id = created.GetProperty("id").GetString()!; var version = created.GetProperty("version").GetString()!;
        Assert.Equal(id, (await Data(await Save(client, input, key: key))).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/loan-schedules/" + id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Save(stranger, input, id, version)).StatusCode);
        Assert.Equal(0, (await Data(await stranger.GetAsync("/api/loan-schedules"))).GetArrayLength());
        var updated = input with { Principal = "1200", Overrides = [new(1, "200", "0", "2.50")] };
        await Data(await Save(client, updated, id, version));
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, input, id, version)).StatusCode);
        using var reopened = factory.CreateClient(); reopened.DefaultRequestHeaders.Authorization = client.DefaultRequestHeaders.Authorization;
        var detail = await Data(await reopened.GetAsync("/api/loan-schedules/" + id));
        Assert.Equal("1200", detail.GetProperty("input").GetProperty("principal").GetString());
        var row = detail.GetProperty("schedule")[0]; Assert.Equal(200m, row.GetProperty("principal").GetDecimal()); Assert.Equal(0m, row.GetProperty("interest").GetDecimal()); Assert.Equal(2.50m, row.GetProperty("overdueInterest").GetDecimal()); Assert.Equal(202.50m, row.GetProperty("total").GetDecimal());
        Assert.Equal(transactions, await db.Transactions.CountAsync()); Assert.Equal(entries, await db.Entries.CountAsync());
    }
}
