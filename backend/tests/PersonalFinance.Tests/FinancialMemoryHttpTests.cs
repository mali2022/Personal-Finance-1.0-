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
public class FinancialMemoryHttpTests
{
    sealed class Provider : IAiProvider {
        public string Sent=""; public void EnsureAvailable(){}
        public Task<DeepSeekCompletion> Complete(string user,JsonArray messages,JsonArray? tools,string feature,CancellationToken ct,bool json=false,bool reasoning=false,Func<string,Task>? onDelta=null) { Sent=messages.ToJsonString();return Task.FromResult(new DeepSeekCompletion(new JsonObject{["content"]="2024年10月21日净消费100元，仅基于记录。"},null)); }
    }
    sealed class Factory(string connection,Provider provider):WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder b){b.UseEnvironment("Development");b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('M',64),["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-memory-test-keys")}));b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();s.RemoveAll<IAiProvider>();s.AddSingleton<IAiProvider>(provider);s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('M',64))));});}
    }
    static async Task<JsonElement> Data(HttpResponseMessage r){var raw=await r.Content.ReadAsStringAsync();Assert.True(r.IsSuccessStatusCode,$"HTTP {(int)r.StatusCode}: {raw}");return JsonDocument.Parse(raw).RootElement.GetProperty("data").Clone();}
    static Task<HttpResponseMessage> Save(HttpClient c,object body,string version="0",string? key=null){var r=new HttpRequestMessage(HttpMethod.Put,"/api/memories/bookmarks"){Content=JsonContent.Create(body)};r.Headers.TryAddWithoutValidation("If-Match",version);r.Headers.Add("Idempotency-Key",key??Guid.NewGuid().ToString());return c.SendAsync(r);}
    [ProfileSqlFact] public async Task AuthIdempotencyPrivacyEvidenceAndOwnershipAreEnforcedOverHttp()
    {
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Memory-Test-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid()+"@memoryhttp.test",DisplayName="Memory test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}var user=User();var other=User();
        var cash=new Account{UserId=user.Id,Name="Cash"};var cat=new Category{UserId=user.Id,Name="Food"};db.AddRange(cash,cat);await db.SaveChangesAsync();
        var tx=new FinanceTransaction{UserId=user.Id,AccountId=cash.Id,CategoryId=cat.Id,OccurredAt=new(2024,10,21,12,0,0,TimeSpan.FromHours(8)),Amount=100,Merchant="Cafe",Note="PRIVATE_NOTE_NEVER_SEND",Entries=[new Entry{UserId=user.Id,Kind="Expense",CategoryId=cat.Id,Amount=100,BaseAmount=100}]};db.Add(tx);await db.SaveChangesAsync();
        var provider=new Provider();using var factory=new Factory(connection,provider);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/reports/on-this-day?date=2000-10-21")).StatusCode);
        foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        var key=Guid.NewGuid().ToString();var body=new MemoryInput("tx:"+tx.Id,tx.Id,true,"personal memory");var saved=await Data(await Save(client,body,key:key));Assert.Equal(saved.GetProperty("id").GetString(),(await Data(await Save(client,body,key:key))).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await Save(client,body,"99")).StatusCode);Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Save(stranger,body)).StatusCode);Assert.Empty((await Data(await stranger.GetAsync("/api/memories/bookmarks"))).EnumerateArray());
        const string analysis="/api/reports/on-this-day/analysis?date=2000-10-21&currency=CNY&keyword=PRIVATE_NOTE";
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync(analysis,new{sendSummary=true})).StatusCode);Assert.Equal("",provider.Sent);
        await Data(await client.PutAsJsonAsync("/api/ai/privacy",new AiPrivacyInput(true,true,false,false,false,false)));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await client.PostAsJsonAsync(analysis,new{sendSummary=false})).StatusCode);
        var result=await Data(await client.PostAsJsonAsync(analysis,new{sendSummary=true,mode="story"}));Assert.Contains("100",result.GetProperty("explanation").GetString());Assert.DoesNotContain("PRIVATE_NOTE",provider.Sent);Assert.DoesNotContain(tx.Id,provider.Sent);Assert.DoesNotContain("personal memory",provider.Sent);Assert.Contains("coveredYears",provider.Sent);Assert.Contains("2024",provider.Sent);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await client.PostAsJsonAsync("/api/reports/on-this-day/analysis?date=2000-01-01",new{sendSummary=true})).StatusCode);
    }
}
