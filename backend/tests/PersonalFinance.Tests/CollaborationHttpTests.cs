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
public sealed class CollaborationHttpTests
{
    sealed class Provider : IAiProvider {
        public string Evidence = "";
        public void EnsureAvailable() { }
        public Task<DeepSeekCompletion> Complete(string user, JsonArray messages, JsonArray? tools, string feature, CancellationToken ct, bool json = false, bool reasoning = false, Func<string, Task>? onDelta = null) { Evidence = messages.ToJsonString(); return Task.FromResult(new DeepSeekCompletion(new JsonObject { ["content"] = "按提供汇总分析" }, null)); }
    }
    sealed class Factory(string connection, Provider provider) : WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder b) {
            b.UseEnvironment("Development"); b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string,string?> { ["ConnectionStrings:Finance"] = connection, ["Auth:SigningKey"] = new string('S',64), ["DataProtection:KeyPath"] = Path.Combine(Path.GetTempPath(), "pf-shared-test-keys") }));
            b.ConfigureServices(s => { s.RemoveAll<DbContextOptions<FinanceDb>>(); s.AddDbContext<FinanceDb>(o => o.UseSqlServer(connection)); s.RemoveAll<IHostedService>(); s.RemoveAll<IAiProvider>(); s.AddSingleton<IAiProvider>(provider); s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer", o => o.TokenValidationParameters.IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('S',64)))); });
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage r) { var text = await r.Content.ReadAsStringAsync(); Assert.True(r.IsSuccessStatusCode, $"{r.StatusCode}: {text}"); return JsonDocument.Parse(text).RootElement.GetProperty("data").Clone(); }
    static Task<HttpResponseMessage> Post(HttpClient c, string path, object body, string? key = null) { var r = new HttpRequestMessage(HttpMethod.Post,"/api"+path) { Content = JsonContent.Create(body) }; r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return c.SendAsync(r); }
    [ProfileSqlFact] public async Task HttpTransactionsShareAtomicallyAndNeverExposeAccountsOrSendDetailsToAi()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString(); await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options); await db.Database.MigrateAsync();
        var password = "Shared-Test-" + Guid.NewGuid().ToString("N");
        AppUser User() { var u = new AppUser { Email = Guid.NewGuid()+"@shared-http.test", DisplayName = "Private member name" }; u.PasswordHash = new PasswordHasher<AppUser>().HashPassword(u,password); db.Add(u); return u; }
        var owner = User(); var guest = User(); var stranger = User();
        var account = new Account { UserId = owner.Id, Name = "Secret private account" }; var parent = new Category { UserId = owner.Id, Name = "Food" }; var child = new Category { UserId = owner.Id, ParentId = parent.Id, Name = "Meals" }; db.AddRange(account,parent,child); db.Add(new AiPrivacySetting { UserId = owner.Id, Enabled = true, AllowSummary = true }); await db.SaveChangesAsync();
        var provider = new Provider(); using var factory = new Factory(connection,provider); using var client = factory.CreateClient(); using var reader = factory.CreateClient(); using var outsider = factory.CreateClient();
        foreach (var (http,user) in new[] { (client,owner),(reader,guest),(outsider,stranger) }) { var login = await Data(await http.PostAsJsonAsync("/api/auth/login",new { email = user.Email,password })); http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString()); }
        var key = Guid.NewGuid().ToString(); var create = new { name = "Shared book", kind = "Book" };
        var book = (await Data(await Post(client,"/spaces",create,key))).GetProperty("id").GetString()!;
        Assert.Equal(book,(await Data(await Post(client,"/spaces",create,key))).GetProperty("id").GetString());
        var invitation = (await Data(await Post(client,$"/spaces/{book}/invitations",new { email = guest.Email,role = "Viewer" }))).GetProperty("id").GetString()!;
        await Data(await Post(reader,$"/space-invitations/{invitation}/accept",new { }));
        var month = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM");
        var report = await Data(await client.GetAsync($"/api/spaces/{book}?month={month}"));
        var members = report.GetProperty("members").EnumerateArray().ToArray(); var payer = members.Single(m => m.GetProperty("role").GetString() == "Owner").GetProperty("id").GetString()!; var consumer = members.Single(m => m.GetProperty("role").GetString() == "Viewer").GetProperty("id").GetString()!;
        var body = new SaveTransaction("Expense","100.00",account.Id,DateTimeOffset.UtcNow,"private transaction note",child.Id,"Secret merchant",Collaboration: new(book,consumer,payer,"Equal",[new(payer,"1"),new(consumer,"1")]));
        var tx = (await Data(await Post(client,"/transactions/expense",body))).GetProperty("id").GetString()!;
        report = await Data(await reader.GetAsync($"/api/spaces/{book}?month={month}"));
        Assert.Single(report.GetProperty("transactions").EnumerateArray()); Assert.DoesNotContain(account.Id,report.GetRawText()); Assert.DoesNotContain("Secret private account",report.GetRawText());
        Assert.Equal(HttpStatusCode.NotFound,(await reader.GetAsync($"/api/transactions/{tx}")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await outsider.GetAsync($"/api/spaces/{book}")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Post(reader,$"/spaces/{book}/members",new { name = "invalid" })).StatusCode);
        var invalid = body with { Collaboration = new(book,consumer,payer,"Equal",[new(stranger.Id,"1")]) };
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Post(client,"/transactions/expense",invalid)).StatusCode);
        Assert.Equal(1,await db.Transactions.CountAsync(t => t.UserId == owner.Id));
        var settlement = new { fromMemberId = consumer, toMemberId = payer,currency = "CNY",amount = "20", note = "paid" }; var settleKey = Guid.NewGuid().ToString();
        await Data(await Post(client,$"/spaces/{book}/settlements",settlement,settleKey)); await Data(await Post(client,$"/spaces/{book}/settlements",settlement,settleKey));
        Assert.Equal(1,await db.Set<SpaceSettlement>().CountAsync(s => s.SpaceId == book));
        await Data(await Post(client,$"/spaces/{book}/analysis?month={month}",new { confirmTransmission = true }));
        Assert.DoesNotContain("private transaction note",provider.Evidence); Assert.DoesNotContain("Secret merchant",provider.Evidence); Assert.DoesNotContain("Private member name",provider.Evidence); Assert.DoesNotContain(account.Id,provider.Evidence); Assert.Contains("100.00",provider.Evidence);
        await Data(await Post(client,$"/book-comparison/analysis?month={month}",new { confirmTransmission = true,bookIds = new[] { book } }));
        Assert.DoesNotContain("Shared book",provider.Evidence);
        var comparison = await Data(await reader.GetAsync($"/api/book-comparison?ids={book}&month={month}")); Assert.Equal("100.00",comparison.GetProperty("totals")[0].GetProperty("expense").GetString());
        var assignment = await Data(await client.GetAsync($"/api/transactions/{tx}/collaboration")); Assert.Equal("Equal", assignment.GetProperty("rule").GetString()); Assert.Equal("1",assignment.GetProperty("shares")[0].GetProperty("value").GetString());
        var guestAccount = new Account { UserId = guest.Id, Name = "Guest private cash" }; var guestParent = new Category { UserId = guest.Id, Name = "Guest food" }; var guestChild = new Category { UserId = guest.Id, Name = "Guest meals", ParentId = guestParent.Id }; db.AddRange(guestAccount,guestParent,guestChild); await db.SaveChangesAsync();
        var guestInput = body with { AccountId = guestAccount.Id, CategoryId = guestChild.Id, Amount = "25.00", Collaboration = new(book,consumer,consumer,"Equal",[new(payer,"1"),new(consumer,"1")]) };
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Post(reader,"/transactions/expense",guestInput)).StatusCode);
        Assert.Equal(0,await db.Transactions.CountAsync(t => t.UserId == guest.Id));
        var roleRequest = new HttpRequestMessage(HttpMethod.Put,$"/api/spaces/{book}/members/{consumer}") { Content = JsonContent.Create(new MemberInput("Guest", "Editor", Version: members.Single(m => m.GetProperty("id").GetString() == consumer).GetProperty("version").GetString())) }; roleRequest.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString()); await Data(await client.SendAsync(roleRequest));
        var guestTx = (await Data(await Post(reader,"/transactions/expense",guestInput))).GetProperty("id").GetString();
        report = await Data(await client.GetAsync($"/api/spaces/{book}?month={month}")); Assert.Equal("125.00",report.GetProperty("totals")[0].GetProperty("expense").GetString()); Assert.DoesNotContain(guestAccount.Id,report.GetRawText());
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync($"/api/transactions/{guestTx}")).StatusCode);
    }
}
