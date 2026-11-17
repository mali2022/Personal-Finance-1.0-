using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class PhysicalAssetHttpTests
{
    sealed class Provider : IAiProvider {
        public string Sent = ""; public void EnsureAvailable() { }
        public Task<DeepSeekCompletion> Complete(string user, JsonArray messages, JsonArray? tools, string feature, CancellationToken ct, bool json = false, bool reasoning = false, Func<string, Task>? onDelta = null) { Sent = messages.ToJsonString(); return Task.FromResult(new DeepSeekCompletion(new JsonObject { ["content"] = "缺少市场价，无法推算。" }, null)); }
    }
    sealed class Factory(string connection, Provider provider) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b)
        {
            b.UseEnvironment("Development");
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('L', 64), ["DataProtection:KeyPath"] = Path.Combine(Path.GetTempPath(), "pf-loan-test-keys") }));
            b.ConfigureServices(s => {
                s.RemoveAll<DbContextOptions<FinanceDb>>(); s.AddDbContext<FinanceDb>(o => o.UseSqlServer(connection)); s.RemoveAll<IHostedService>();
                s.RemoveAll<IAiProvider>(); s.AddSingleton<IAiProvider>(provider);
                s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o => o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('L', 64))));
            });
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage r)
    {
        var raw = await r.Content.ReadAsStringAsync(); Assert.True(r.IsSuccessStatusCode, $"HTTP {(int)r.StatusCode}: {raw}");
        return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();
    }
    static Task<HttpResponseMessage> Save(HttpClient c, string path, object body, string? version = null, bool put = false, string? key = null)
    {
        var r = new HttpRequestMessage(put ? HttpMethod.Put : HttpMethod.Post, "/api" + path) { Content = JsonContent.Create(body) };
        if (version != null) r.Headers.TryAddWithoutValidation("If-Match", version);
        r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return c.SendAsync(r);
    }
    [ProfileSqlFact] public async Task CenterEnforcesOwnershipCategoryDepthVersionsPartialDisposalAndLedgerInvariance()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options); await db.Database.MigrateAsync();
        var password = "Physical-Test-" + Guid.NewGuid().ToString("N");
        AppUser User() { var u = new AppUser { Email = Guid.NewGuid().ToString("N") + "@physical.test", DisplayName = "Physical test" }; u.PasswordHash = new PasswordHasher<AppUser>().HashPassword(u, password); db.Add(u); return u; }
        var user = User(); var other = User(); var account = new Account { UserId = user.Id, Name = "Test cash", Currency = "CNY" }; db.Add(account);
        var t = new FinanceTransaction { UserId = user.Id, Type = "Expense", Status = "Confirmed", AccountId = account.Id, Amount = 100, Currency = "CNY", OccurredAt = new(2026, 9, 5, 0, 0, 0, TimeSpan.FromHours(8)) }; db.Add(t);
        db.Add(new Entry { UserId = user.Id, TransactionId = t.Id, Kind = "Expense", Amount = 105, Currency = "CNY", BaseAmount = 105 });
        db.Add(new Entry { UserId = user.Id, TransactionId = t.Id, Kind = "Account", AccountId = account.Id, Amount = -105, Currency = "CNY", BaseAmount = -105 });
        await db.SaveChangesAsync();
        var provider = new Provider(); using var factory = new Factory(connection, provider); using var client = factory.CreateClient(); using var stranger = factory.CreateClient();
        foreach (var pair in new[] { (client, user), (stranger, other) }) { var login = await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login", new { email = pair.Item2.Email, password })); pair.Item1.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.GetProperty("accessToken").GetString()); }
        var transactions = await db.Transactions.CountAsync(); var entries = await db.Entries.CountAsync();
        async Task<JsonElement> Category(string name, string? parent = null) => await Data(await Save(client, "/physical-categories", new { name, parentId = parent }));
        var c1 = await Category("一级"); var c1id = c1.GetProperty("id").GetString()!;
        var c2 = await Category("二级", c1id); var c2id = c2.GetProperty("id").GetString()!;
        var c3 = await Category("三级", c2id); var c3id = c3.GetProperty("id").GetString()!;
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Save(client, "/physical-categories", new { name = "四级", parentId = c3id })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Save(client, "/physical-categories/" + c1id, new { name = "循环", parentId = c3id }, "1", true)).StatusCode);
        var key = Guid.NewGuid().ToString(); var input = new ManagedAssetInput("测试设备", "Other", "CNY", "1000", new(2026, 9, 1));
        var a = await Data(await Save(client, "/physical-assets", input, key: key)); var id = a.GetProperty("id").GetString()!;
        Assert.Equal(id, (await Data(await Save(client, "/physical-assets", input, key: key))).GetProperty("id").GetString());
        var profile = new PhysicalProfileInput(CategoryId: c3id, Quantity: 4, Code: "DEVICE-01", Holder: "Private holder", SerialNumber: "Private serial");
        Assert.Equal(HttpStatusCode.NotFound, (await Save(stranger, $"/physical-assets/{id}/profile", profile, "1", true)).StatusCode);
        await Data(await Save(client, $"/physical-assets/{id}/profile", profile, "1", true));
        Assert.Equal(HttpStatusCode.Conflict, (await Save(client, $"/physical-assets/{id}/profile", profile, "1", true)).StatusCode);
        await Data(await Save(client, $"/physical-assets/{id}/rules", new PhysicalRuleInput(new(2026, 9, 1), "QuantityPrice", "实际单价", Amount: 200, MarketValue: 900), "2"));
        var sale = await Data(await Save(client, $"/physical-assets/{id}/events", new PhysicalEventInput(new(2026, 9, 10), "Sold", "部分出售", 1), "3"));
        await Data(await Save(client, $"/physical-assets/{id}/costs", new PhysicalCostInput(t.Id, "Repair"), "4"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Save(client, $"/physical-assets/{id}/costs", new PhysicalCostInput(t.Id, "Energy"), "5")).StatusCode);
        var report = await Data(await client.GetAsync("/api/physical-center?date=2026-09-15"));
        var row = report.GetProperty("items")[0]; Assert.Equal(3, row.GetProperty("value").GetProperty("quantity").GetDecimal()); Assert.Equal(600, row.GetProperty("value").GetProperty("value").GetDecimal()); Assert.Equal(105, row.GetProperty("usageCost").GetDecimal());
        Assert.Single(report.GetProperty("groups").EnumerateArray());
        var past = await Data(await client.GetAsync("/api/physical-center?date=2026-09-05")); Assert.Equal(4, past.GetProperty("items")[0].GetProperty("value").GetProperty("quantity").GetDecimal());
        var allocation = await Data(await client.GetAsync("/api/assets/allocation?date=2026-09-15")); Assert.Equal("600.00", allocation.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetString() == id).GetProperty("originalAmount").GetString());
        Assert.Equal(0, (await Data(await stranger.GetAsync("/api/physical-center"))).GetProperty("items").GetArrayLength());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Save(client, $"/physical-assets/{id}/events", new PhysicalEventInput(new(2026, 9, 11), "Sold", "超量", 4), "5")).StatusCode);
        await Data(await Save(client, $"/physical-assets/{id}/events", new PhysicalEventInput(new(2026, 9, 12), "Reverse", "撤销出售", ReversesId: sale.GetProperty("id").GetString()), "5"));
        var restored = await Data(await client.GetAsync("/api/physical-center?date=2026-09-15")); Assert.Equal(4, restored.GetProperty("items")[0].GetProperty("value").GetProperty("quantity").GetDecimal());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Save(client, $"/physical-categories/{c3id}/remove", new { reason = "有资产不能删除" }, "1")).StatusCode);
        var target = await Category("目标"); await Data(await Save(client, $"/physical-categories/{c3id}/remove", new { reason = "合并", targetId = target.GetProperty("id").GetString() }, "1"));
        var moved = await Data(await client.GetAsync("/api/physical-center")); Assert.Equal("目标", moved.GetProperty("items")[0].GetProperty("categoryName").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync("/api/physical-center/analysis", new { sendSummary = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/physical-center/analysis", new { sendSummary = true })).StatusCode);
        db.Add(new AiPrivacySetting { UserId = user.Id, Enabled = true, AllowSummary = true }); await db.SaveChangesAsync();
        await Data(await client.PostAsJsonAsync("/api/physical-center/analysis", new { sendSummary = true, mode = "replacement", question = "更换建议" }));
        Assert.DoesNotContain("Private holder", provider.Sent); Assert.DoesNotContain("Private serial", provider.Sent); Assert.Contains("physical-v1", provider.Sent);
        Assert.Equal(transactions, await db.Transactions.CountAsync()); Assert.Equal(entries, await db.Entries.CountAsync());
        Assert.True(await db.AuditRecords.AnyAsync(x => x.UserId == user.Id && x.ResourceId == id));
    }
}
