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
public sealed class SmartReconciliationHttpTests
{
    sealed class Factory(string connection):WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder b){
            b.UseEnvironment("Development");b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('R',64),["Ai:Enabled"]="false",["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-smart-reconciliation-test-keys")}));
            b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('R',64))));});
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage r){var text=await r.Content.ReadAsStringAsync();Assert.True(r.IsSuccessStatusCode,$"HTTP {(int)r.StatusCode}: {text}");return JsonDocument.Parse(text).RootElement.GetProperty("data").Clone();}
    static Task<HttpResponseMessage> Post(HttpClient client,string path,object body,string? key=null){var request=new HttpRequestMessage(HttpMethod.Post,"/api/smart-reconciliation"+path){Content=JsonContent.Create(body)};request.Headers.Add("Idempotency-Key",key??Guid.NewGuid().ToString());return client.SendAsync(request);}
    [ProfileSqlFact] public async Task ConcurrentBrowsersRetriesOwnershipAndDurableTaskStepsAreSafe(){
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Synthetic-Smart-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@smart.test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}var user=User();var stranger=User();var account=new Account{UserId=user.Id,Name="Synthetic HTTP account",OpeningBalance=1000};var job=new ImportJob{UserId=user.Id,SourceHash=new string('C',64)};db.AddRange(account,job);
        (FinanceTransaction,StatementRecord) Pair(int index){var t=new FinanceTransaction{UserId=user.Id,AccountId=account.Id,Type="Expense",Amount=10,Merchant="Synthetic HTTP",OccurredAt=DateTimeOffset.UtcNow};t.Entries.Add(new(){UserId=user.Id,TransactionId=t.Id,Kind="Account",AccountId=account.Id,Amount=-10,BaseAmount=-10});t.Entries.Add(new(){UserId=user.Id,TransactionId=t.Id,Kind="Expense",Amount=10,BaseAmount=10});var source=new ImportRow{UserId=user.Id,ImportJobId=job.Id,Index=index};var row=new StatementRecord{UserId=user.Id,AccountId=account.Id,ImportJobId=job.Id,ImportRowId=source.Id,IdentityHash=Guid.NewGuid().ToString("N"),Amount=-10,OccurredAt=t.OccurredAt,Type="Expense",Merchant=t.Merchant};db.AddRange(t,source,row);return(t,row);}
        var(t1,r1)=Pair(1);var(t2,r2)=Pair(2);await db.SaveChangesAsync();using var factory=new Factory(connection);using var client=factory.CreateClient();using var other=factory.CreateClient();
        foreach(var pair in new[]{(client,user),(other,stranger)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        object Confirm(FinanceTransaction t,string reason="SYNTHETIC PRIVATE REVIEW")=>new{transactionId=t.Id,version="1",transactionVersion="1",reason};
        Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/smart-reconciliation/{r1.Id}/candidates")).StatusCode);
        var competing=await Task.WhenAll(Post(client,$"/{r1.Id}/confirm",Confirm(t1)),Post(client,$"/{r1.Id}/confirm",Confirm(t1)));Assert.Single(competing,r=>r.StatusCode==HttpStatusCode.OK);Assert.Single(competing,r=>r.StatusCode==HttpStatusCode.Conflict);
        var key=Guid.NewGuid().ToString();var repeated=await Task.WhenAll(Post(client,$"/{r2.Id}/confirm",Confirm(t2),key),Post(client,$"/{r2.Id}/confirm",Confirm(t2),key));var first=await Data(repeated[0]);var retry=await Data(repeated[1]);Assert.Equal(first.GetProperty("id").GetString(),retry.GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await Post(client,$"/{r2.Id}/confirm",Confirm(t2,"different request"),key)).StatusCode);
        Assert.Equal(2,await db.Set<StatementLink>().CountAsync(l=>l.UserId==user.Id&&l.State=="Confirmed"));Assert.Equal(2,await db.Transactions.CountAsync(t=>t.UserId==user.Id));Assert.Equal(4,await db.Entries.CountAsync(e=>e.UserId==user.Id));
        Assert.DoesNotContain("SYNTHETIC PRIVATE REVIEW",string.Join(" ",await db.AuditRecords.Where(a=>a.UserId==user.Id).Select(a=>a.ChangesJson).ToArrayAsync()));
        var task=await Data(await Post(client,"/tasks",new{accountId=account.Id,startsAt=DateTimeOffset.UtcNow.AddDays(-1),endsAt=DateTimeOffset.UtcNow.AddDays(1)}));var taskId=task.GetProperty("id").GetString();var stepKey=Guid.NewGuid().ToString();await Data(await Post(client,$"/tasks/{taskId}/step",new{version="1"},stepKey));await Data(await Post(client,$"/tasks/{taskId}/step",new{version="1"},stepKey));
        var history=await Data(await client.GetAsync($"/api/smart-reconciliation/tasks/{taskId}/steps"));Assert.Equal(1,history.GetProperty("total").GetInt32());Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/smart-reconciliation/tasks/{taskId}/steps")).StatusCode);
        await db.Entry(t2).ReloadAsync();t2.Note="changed after confirmation";t2.Version++;await db.SaveChangesAsync();var changed=await Data(await client.GetAsync($"/api/smart-reconciliation/{r2.Id}/history"));Assert.True(changed.GetProperty("items")[0].GetProperty("conflict").GetBoolean());
    }
}
