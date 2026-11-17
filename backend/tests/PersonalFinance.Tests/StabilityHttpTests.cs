using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;

[Collection("Finance SQL")]
public sealed class StabilityHttpTests
{
    sealed class Factory(string connection) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b) { b.UseEnvironment("Development"); b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('S', 64), ["DataProtection:KeyPath"] = Path.Combine(Path.GetTempPath(), "pf-stability-keys") })); b.ConfigureServices(s => { s.RemoveAll<DbContextOptions<FinanceDb>>(); s.AddDbContext<FinanceDb>(o => o.UseSqlServer(connection)); s.RemoveAll<IHostedService>(); s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o => o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('S', 64)))); }); }
    }
    [ProfileSqlFact]
    public async Task MalformedFinancialPayloadsNeverReturnServerErrorsOrWritePartialData()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString(); await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options); await db.Database.MigrateAsync();
        var password = "Stability-" + Guid.NewGuid().ToString("N"); var user = new AppUser { Email = Guid.NewGuid().ToString("N") + "@stability.test", DisplayName = "Isolated stability test" }; user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, password); db.Add(user); await db.SaveChangesAsync();
        using var factory = new Factory(connection); using var client = factory.CreateClient(); var login = await client.PostAsJsonAsync("/api/auth/login", new { email = user.Email, password }); login.EnsureSuccessStatusCode(); var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("accessToken").GetString(); client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var accountCount = await db.Accounts.CountAsync(); var categoryCount = await db.Categories.CountAsync(); var transactionCount = await db.Transactions.CountAsync(); var entryCount = await db.Entries.CountAsync(); var auditCount = await db.AuditRecords.CountAsync();
        var requests = new[]{
            ("/api/accounts","{\"name\":null,\"type\":\"Cash\",\"currency\":\"CNY\"}"),
            ("/api/categories","{\"name\":null,\"kind\":\"Expense\"}"),
            ("/api/budgets/2026-10","{\"total\":\"100.00\",\"items\":null}"),
            ("/api/budgets/2026-10","{\"total\":\"100.00\",\"items\":[null]}"),
            ("/api/transactions/expense","{\"type\":\"Expense\",\"amount\":\"1.00\",\"accountId\":\"missing\",\"occurredAt\":\"2026-01-01T00:00:00+08:00\",\"payments\":[null]}"),
        };
        foreach (var (path, body) in requests) { var request = new HttpRequestMessage(path.Contains("budgets") ? HttpMethod.Put : HttpMethod.Post, path) { Content = new StringContent(body, Encoding.UTF8, "application/json") }; request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString()); request.Headers.TryAddWithoutValidation("If-Match", "0"); var response = await client.SendAsync(request); Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.Equal("INVALID_REQUEST", JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()); }
        Assert.Equal(accountCount, await db.Accounts.CountAsync()); Assert.Equal(categoryCount, await db.Categories.CountAsync()); Assert.Equal(transactionCount, await db.Transactions.CountAsync()); Assert.Equal(entryCount, await db.Entries.CountAsync()); Assert.Equal(auditCount, await db.AuditRecords.CountAsync());
    }
}
