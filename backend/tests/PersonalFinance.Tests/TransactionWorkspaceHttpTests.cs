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
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public sealed class TransactionWorkspaceHttpTests
{
    sealed class Provider : IAiProvider {
        public string Answer="{\"type\":\"Expense\",\"min\":\"1.00\"}"; public void EnsureAvailable() { }
        public Task<DeepSeekCompletion> Complete(string user,JsonArray messages,JsonArray? tools,string feature,CancellationToken ct,bool json=false,bool reasoning=false,Func<string,Task>? onDelta=null)=>Task.FromResult(new DeepSeekCompletion(new JsonObject{["content"]=Answer},null));
    }
    sealed class Factory(string connection,Provider provider):WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder b) {
            b.UseEnvironment("Development");b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('T',64),["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-transaction-test-keys")}));
            b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();s.RemoveAll<IAiProvider>();s.AddSingleton<IAiProvider>(provider);s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('T',64))));});
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage response) {var text=await response.Content.ReadAsStringAsync();Assert.True(response.IsSuccessStatusCode,$"HTTP {(int)response.StatusCode}: {text}");return JsonDocument.Parse(text).RootElement.GetProperty("data").Clone();}
    static Task<HttpResponseMessage> Write(HttpClient client,string path,object body,string? version=null,string? key=null) {
        var request=new HttpRequestMessage(HttpMethod.Post,"/api"+path){Content=JsonContent.Create(body)};request.Headers.Add("Idempotency-Key",key??Guid.NewGuid().ToString());if(version!=null)request.Headers.TryAddWithoutValidation("If-Match",version);return client.SendAsync(request);
    }
    [ProfileSqlFact] public async Task MatchingBatchAndAiRespectOwnershipIdempotencyVersionsAuditAndWhitelist() {
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Transaction-Test-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@transaction.test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var user=User();var other=User();var a=new Account{UserId=user.Id,Name="A"};var b=new Account{UserId=user.Id,Name="B"};var foreign=new Account{UserId=other.Id,Name="private"};db.AddRange(a,b,foreign);
        var t=new FinanceTransaction{UserId=user.Id,AccountId=a.Id,Amount=10,OccurredAt=DateTimeOffset.UtcNow};
        t.Entries.Add(new(){UserId=user.Id,TransactionId=t.Id,Kind="Account",AccountId=a.Id,Amount=-10,BaseAmount=-10});t.Entries.Add(new(){UserId=user.Id,TransactionId=t.Id,Kind="Expense",Amount=10,BaseAmount=10});db.Add(t);
        db.Add(new AiPrivacySetting{UserId=user.Id,Enabled=true,AllowSummary=true,AllowDetails=true});await db.SaveChangesAsync();
        var provider=new Provider();using var factory=new Factory(connection,provider);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        foreach(var pair in new[]{(client,user),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        var path=$"/transactions/{t.Id}/statement-matches";var body=new{accountId=a.Id,statementReference="bank-row-1",amount="-10.00",note="checked",version="1"};
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,path,body)).StatusCode);
        var key=Guid.NewGuid().ToString();var matched=await Data(await Write(client,path,body,key:key));var matchId=matched.GetProperty("id").GetString();
        Assert.Equal(matchId,(await Data(await Write(client,path,body,key:key))).GetProperty("id").GetString());
        Assert.Equal("Matched",matched.GetProperty("state").GetString());Assert.Equal("0.00",matched.GetProperty("difference").GetString());
        Assert.Single(await db.Set<TransactionStatementMatch>().AsNoTracking().Where(m=>m.TransactionId==t.Id).ToArrayAsync());
        Assert.True(await db.AuditRecords.AnyAsync(r=>r.TransactionId==t.Id&&r.ResourceType==nameof(TransactionStatementMatch)));
        object Batch(string account,string version="2")=>new{items=new[]{new{id=t.Id,version}},changes=new{accountId=account}};
        var blocked=await Data(await Write(client,"/transactions/batch-preview",Batch(b.Id)));Assert.Equal(1,blocked.GetProperty("rejected").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,path,body)).StatusCode); // duplicate/stale request cannot create another match
        await Data(await Write(client,$"{path}/{matchId}/revoke",new{},"1"));
        var preview=await Data(await Write(client,"/transactions/batch-preview",Batch(b.Id,"3")));Assert.Equal(0,preview.GetProperty("rejected").GetInt32());
        var batchKey=Guid.NewGuid().ToString();var result=await Data(await Write(client,"/transactions/batch-apply",Batch(b.Id,"3"),key:batchKey));
        Assert.Equal(1,result.GetProperty("count").GetInt32());await Data(await Write(client,"/transactions/batch-apply",Batch(b.Id,"3"),key:batchKey));
        var updated=await db.Transactions.AsNoTracking().SingleAsync(x=>x.Id==t.Id);Assert.Equal(b.Id,updated.AccountId);Assert.Equal(4,updated.Version);
        var accountEntry=await db.Entries.AsNoTracking().SingleAsync(e=>e.TransactionId==t.Id&&e.Kind=="Account");Assert.Equal(b.Id,accountEntry.AccountId);Assert.Equal(-10,accountEntry.Amount);
        Assert.Equal(1,(await Data(await client.GetAsync("/api/transactions/summary?pageSize=1"))).GetProperty("total").GetInt32());
        var aiPath="/transactions/ai";object Ai()=>new{mode="search",question="expenses over one",confirmTransmission=true};
        Assert.Equal("Expense",(await Data(await Write(client,aiPath,Ai()))).GetProperty("query").GetProperty("type").GetString());
        provider.Answer="{\"sql\":\"DROP TABLE finance.Transactions\"}";Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,aiPath,Ai())).StatusCode);
        provider.Answer="{\"status\":\"Bogus\"}";Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,aiPath,Ai())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Write(stranger,aiPath,Ai())).StatusCode);
    }
}
