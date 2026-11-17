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
public class LifeSimulationHttpTests
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
    static Task<HttpResponseMessage> Save(HttpClient c, LifeInput body, string? id = null, string version = "0", string? key = null)
    {
        var r = new HttpRequestMessage(id == null ? HttpMethod.Post : HttpMethod.Put, "/api/life-simulator/scenarios" + (id == null ? "" : "/" + id)) { Content = JsonContent.Create(body) };
        r.Headers.TryAddWithoutValidation("If-Match", version); r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return c.SendAsync(r);
    }

    static Task<HttpResponseMessage> Post(HttpClient c, string path, object body, string? key = null)
    {
        var r = new HttpRequestMessage(HttpMethod.Post, "/api/life-simulator/" + path) { Content = JsonContent.Create(body) };
        r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); r.Headers.TryAddWithoutValidation("If-Match", "0"); return c.SendAsync(r);
    }
    [ProfileSqlFact] public async Task SnapshotScenarioRunHistoryIsolationAndConcurrency()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options); await db.Database.MigrateAsync();
        var password = "Life-Test-" + Guid.NewGuid().ToString("N");
        AppUser User() { var u = new AppUser { Email = Guid.NewGuid().ToString("N") + "@life.test", DisplayName = "Life test" }; u.PasswordHash = new PasswordHasher<AppUser>().HashPassword(u, password); db.Add(u); return u; }
        var owner = User(); var other = User(); var account = new Account { UserId = owner.Id, Name = "Cash", OpeningBalance = 10000 };
        db.Accounts.Add(account); db.Accounts.Add(new() { UserId = other.Id, Name = "Private", OpeningBalance = 999999 }); await db.SaveChangesAsync();
        using var factory = new Factory(connection); using var client = factory.CreateClient(); using var stranger = factory.CreateClient();
        foreach (var pair in new[] { (client, owner), (stranger, other) }) { var login = await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login", new { email = pair.Item2.Email, password })); pair.Item1.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.GetProperty("accessToken").GetString()); }
        var transactions = await db.Transactions.CountAsync(); var entries = await db.Entries.CountAsync();
        var snapshot = await Data(await Post(client, "snapshots", new { currency = "CNY" }));
        var baseline = snapshot.GetProperty("snapshot").GetProperty("suggested").Deserialize<LifeInput>(FinanceService.Json)!;
        Assert.Equal(10000, baseline.Cash); Assert.Equal(0, baseline.UnscheduledDebt);
        var hold = new AccountFundHold { UserId = owner.Id, AccountId = account.Id, Amount = 1000, State = "Confirmed" }; db.Add(hold); await db.SaveChangesAsync();
        var held = await Data(await Post(client, "snapshots", new { currency = "CNY" }));
        Assert.Equal(9000, held.GetProperty("snapshot").GetProperty("suggested").GetProperty("cash").GetDecimal());
        Assert.Equal(1000, held.GetProperty("snapshot").GetProperty("suggested").GetProperty("restrictedAssets").GetDecimal());
        hold.State = "Revoked";
        var bank = new Account { UserId = owner.Id, Name = "Term bank", Type = "Bank", OpeningBalance = 20000 }; db.Add(bank);
        var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        db.Add(new ManagedAsset { UserId = owner.Id, Name = "Term", Type = "TermDeposit", AccountId = bank.Id, Cost = 15000, AcquiredDate = today, MaturityDate = today.AddYears(1), State = "Active" });
        db.Add(new AccountFundHold { UserId = owner.Id, AccountId = bank.Id, Amount = 15000, State = "Confirmed" }); await db.SaveChangesAsync();
        var term = await Data(await Post(client, "snapshots", new { currency = "CNY" }));
        Assert.Equal(15000, term.GetProperty("snapshot").GetProperty("suggested").GetProperty("cash").GetDecimal());
        Assert.Equal(15000, term.GetProperty("snapshot").GetProperty("suggested").GetProperty("restrictedAssets").GetDecimal());
        var b = baseline with { Name = "Rent", MonthlyIncome = 8000, MonthlyExpense = 5000, Months = 12, AssumptionSource = "Confirmed hypothetical net pay, no growth" };
        var documentsBeforePreview = await db.Documents.CountAsync(x => x.UserId == owner.Id);
        var retirementRequest = new LifeRetirementRequest(b,60,60,61,1000,0,60);
        var retirement = await Data(await Post(client,"retirement-preview",retirementRequest));
        Assert.InRange(retirement.GetProperty("targetRetirementAssets").GetDecimal(),12000,12000.02m);
        Assert.Equal(documentsBeforePreview,await db.Documents.CountAsync(x => x.UserId == owner.Id));
        Assert.Equal(HttpStatusCode.NotFound,(await Post(stranger,"retirement-preview",retirementRequest)).StatusCode);
        var key = Guid.NewGuid().ToString(); var saved = await Data(await Save(client, b, key: key)); var id = saved.GetProperty("id").GetString()!; var version = saved.GetProperty("version").GetString()!;
        Assert.Equal(id, (await Data(await Save(client, b, key: key))).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/life-simulator/scenarios/" + id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(stranger, "runs", b)).StatusCode);
        await Data(await Save(client, b with { Name = "Updated" }, id, version));
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, b, id, version)).StatusCode);
        var reopened = await Data(await client.GetAsync("/api/life-simulator/scenarios/" + id)); Assert.Equal("Updated", reopened.GetProperty("content").GetProperty("name").GetString());
        var runKey = Guid.NewGuid().ToString(); var run = await Data(await Post(client, "runs", b, runKey)); var runId = run.GetProperty("id").GetString()!;
        Assert.Equal(46000, run.GetProperty("result").GetProperty("finalNetWorth").GetDecimal());
        Assert.Equal(runId, (await Data(await Post(client, "runs", b, runKey))).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await Post(client, "runs", b with { Cash = 20000 }, runKey)).StatusCode);
        account.OpeningBalance = 20000; account.Version++; await db.SaveChangesAsync();
        var archived = await Data(await client.GetAsync("/api/life-simulator/runs/" + runId)); Assert.Equal(10000, archived.GetProperty("content").GetProperty("input").GetProperty("cash").GetDecimal());
        var next = await Data(await Post(client, "runs", b with { Name = "Save more", MonthlyExpense = 4000 }));
        var compare = await Data(await Post(client, "compare", new { ids = new[] { runId, next.GetProperty("id").GetString() } })); Assert.Equal(12000, compare[1].GetProperty("deltaNetWorth").GetDecimal());
        Assert.Equal(HttpStatusCode.NotFound, (await Post(stranger, "compare", new { ids = new[] { runId, next.GetProperty("id").GetString() } })).StatusCode);
        var different = await Data(await Post(client, "runs", b with { Months = 24 })); Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post(client, "compare", new { ids = new[] { runId, different.GetProperty("id").GetString() } })).StatusCode);
        var grid = await Data(await Post(client, "sensitivity", new LifeSensitivityInput(b, "MonthlyExpense", [4000, 5000, 6000]))); Assert.Equal(3, grid.GetProperty("cells").GetArrayLength());
        var risk = await Data(await Post(client, "monte-carlo", new LifeMonteCarloInput(b, 10, 1, .1m, .01m, .02m, 0)));
        var riskId = risk.GetProperty("id").GetString();
        await Data(await client.GetAsync("/api/life-simulator/risk-reports/" + riskId));
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/life-simulator/risk-reports/" + riskId)).StatusCode);
        Assert.Empty((await Data(await stranger.GetAsync("/api/life-simulator/risk-reports"))).GetProperty("items").EnumerateArray());
        var copy = await Data(await Save(client, b with { Name = "Copy" })); Assert.NotEqual(id, copy.GetProperty("id").GetString());
        Assert.Equal(transactions, await db.Transactions.CountAsync()); Assert.Equal(entries, await db.Entries.CountAsync());
        await db.Entry(account).ReloadAsync(); Assert.Equal(20000, account.OpeningBalance);
        Assert.Empty((await Data(await stranger.GetAsync("/api/life-simulator/runs"))).GetProperty("items").EnumerateArray());
    }
}


