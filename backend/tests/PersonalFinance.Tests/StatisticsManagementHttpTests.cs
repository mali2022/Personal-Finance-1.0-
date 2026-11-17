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
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class StatisticsManagementHttpTests
{
    sealed class Factory(string connection):WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b)
        {
            b.UseEnvironment("Development");
            b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('S',64),["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-statistics-test-keys")}));
            b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('S',64))));});
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        var raw=await response.Content.ReadAsStringAsync();Assert.True(response.IsSuccessStatusCode,$"HTTP {(int)response.StatusCode}: {raw}");return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();
    }
    static Task<HttpResponseMessage> Save(HttpClient client,StatisticsManagementInput input,string version)
    {
        var request=new HttpRequestMessage(HttpMethod.Put,"/api/settings/statistics/management"){Content=JsonContent.Create(input)};request.Headers.TryAddWithoutValidation("If-Match",version);return client.SendAsync(request);
    }
    [ProfileSqlFact]
    public async Task HttpRoutesEnforceAuthenticationAtomicVersionsAuditAndUserIsolation()
    {
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Policy-Test-"+Guid.NewGuid().ToString("N");
        AppUser User(){var u=new AppUser{Email=Guid.NewGuid()+"@policy-http.test",DisplayName="Policy"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var user=User();var other=User();await db.SaveChangesAsync();
        using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/settings/statistics/management")).StatusCode);
        foreach(var pair in new[]{(client,user),(stranger,other)}){var token=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token.GetProperty("accessToken").GetString());}
        var initial=await Data(await client.GetAsync("/api/settings/statistics/management"));Assert.Equal("0",initial.GetProperty("version").GetString());
        var transactionCount=await db.Transactions.CountAsync();var entryCount=await db.Entries.CountAsync();
        var input=new StatisticsManagementInput(new(Mode:"Custom",MonthStartDay:15,IncludeOneTimeIncomeInSavings:false),new(false,true,false),"1");
        var saved=await Data(await Save(client,input,"0"));Assert.Equal("1",saved.GetProperty("version").GetString());
        var ledger=await Data(await client.GetAsync("/api/settings/statistics"));Assert.False(ledger.GetProperty("includeFees").GetBoolean());Assert.True(ledger.GetProperty("includeAssetLoss").GetBoolean());
        var current=await Data(await client.GetAsync("/api/settings/statistics/management"));Assert.Equal(15,current.GetProperty("options").GetProperty("monthStartDay").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict,(await Save(client,input,"0")).StatusCode);
        var conflict=input with{LedgerVersion="1",Options=input.Options with{MonthStartDay=20}};
        Assert.Equal(HttpStatusCode.Conflict,(await Save(client,conflict,"1")).StatusCode);
        current=await Data(await client.GetAsync("/api/settings/statistics/management"));Assert.Equal(15,current.GetProperty("options").GetProperty("monthStartDay").GetInt32());
        var history=await Data(await client.GetAsync("/api/settings/statistics/management/history"));Assert.Contains(history.EnumerateArray(),x=>x.GetProperty("resourceType").GetString()=="StatisticsManagementPolicy");
        Assert.Empty((await Data(await stranger.GetAsync("/api/settings/statistics/management/history"))).EnumerateArray());
        Assert.Equal("0",(await Data(await stranger.GetAsync("/api/settings/statistics/management"))).GetProperty("version").GetString());
        var preview=new StatisticsManagementPreview(input.Options,input.LedgerRules,"2026-09-20");var report=await Data(await client.PostAsJsonAsync("/api/settings/statistics/management/preview",preview));Assert.Equal("2026-09-15",DateTimeOffset.Parse(report.GetProperty("start").GetString()!).ToString("yyyy-MM-dd"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await client.PostAsJsonAsync("/api/settings/statistics/management/preview",preview with{Options=input.Options with{WeekStartsOn=9}})).StatusCode);
        Assert.Equal(transactionCount,await db.Transactions.CountAsync());Assert.Equal(entryCount,await db.Entries.CountAsync());
    }
}
