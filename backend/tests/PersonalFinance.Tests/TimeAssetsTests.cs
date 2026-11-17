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
public sealed class TimeAssetsTests
{
    static DateTimeOffset At(int day,int hour=0)=>new(2026,9,day,hour,0,0,TimeSpan.FromHours(8));
    [Fact] public void CrossDayClippingAndUnknownTimeHaveExplicitDenominators() {
        var segment=new TimeSegment(At(1,23),At(2,1));
        Assert.Equal(3600,TimeAssetMath.Seconds(segment,At(1),At(2)));
        Assert.Equal(3600,TimeAssetMath.Seconds(segment,At(2),At(3)));
        Assert.Equal(0,TimeAssetMath.Seconds(segment,At(3),At(4)));
        Assert.Equal(4.17m,TimeAssetMath.Percent(3600,86400));Assert.Null(TimeAssetMath.Percent(0,0));
    }
    [Fact] public void UnionClipsOverlapsAndExcludesGaps() {
        Assert.Equal(3*3600,TimeAssetMath.UnionSeconds([new(At(1,1),At(1,3)),new(At(1,2),At(1,4)),new(At(1,8),At(1,9))],At(1,2),At(1,9)));
        Assert.Equal(0,TimeAssetMath.UnionSeconds([new(At(1),At(2))],At(3),At(2)));
    }
    [Theory] [InlineData("LaborIncome",10000,100,0,100)] [InlineData("DisposableIncome",8000,100,0,80)] [InlineData("OpportunityCost",0,0,120,120)] [InlineData("Custom",0,0,60,60)]
    public void ValuationMethodsAreDeterministic(string method,decimal income,decimal hours,decimal custom,decimal expected)=>Assert.Equal(expected,TimeAssetMath.Rate(method,income,hours,custom));
    [Fact] public void InvalidValuationAndUnalignedBudgetsAreRejected() {
        Assert.Throws<ApiException>(()=>TimeAssetMath.Rate("LaborIncome",100,0,0));Assert.Throws<ApiException>(()=>TimeAssetMath.Rate("Custom",0,0,-1));
        Assert.Throws<ApiException>(()=>TimeAssetMath.BudgetEnd("Week",new(2026,9,1)));Assert.Equal(new DateOnly(2026,10,1),TimeAssetMath.BudgetEnd("Month",new(2026,9,1)));
    }
    [Fact] public void InputTimesRequireExplicitOffsets() {
        Assert.Throws<JsonException>(()=>JsonSerializer.Deserialize<TimeSegment>("{\"start\":\"2026-09-01T09:00:00\",\"end\":\"2026-09-01T10:00:00\"}",FinanceService.Json));
        Assert.NotNull(JsonSerializer.Deserialize<TimeSegment>("{\"start\":\"2026-09-01T09:00:00+08:00\",\"end\":\"2026-09-01T10:00:00+08:00\"}",FinanceService.Json));
    }
    sealed class Provider:IAiProvider {
        public string Sent="";public void EnsureAvailable(){}public Task<DeepSeekCompletion> Complete(string user,JsonArray messages,JsonArray? tools,string feature,CancellationToken ct,bool json=false,bool reasoning=false,Func<string,Task>? onDelta=null){Sent=messages.ToJsonString();return Task.FromResult(new DeepSeekCompletion(new JsonObject{["content"]="Interpretation based on supplied evidence."},null));}
    }
    sealed class Factory(string connection,Provider provider):WebApplicationFactory<Program> {
        protected override void ConfigureWebHost(IWebHostBuilder b){b.UseEnvironment("Development");b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('T',64),["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-time-test-keys")}));b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();s.RemoveAll<IAiProvider>();s.AddSingleton<IAiProvider>(provider);s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('T',64))));});}
    }
    static async Task<JsonElement> Data(HttpResponseMessage r){var body=await r.Content.ReadAsStringAsync();Assert.True(r.IsSuccessStatusCode,$"HTTP {(int)r.StatusCode}: {body}");return JsonDocument.Parse(body).RootElement.GetProperty("data").Clone();}
    static async Task<HttpResponseMessage> Write(HttpClient client,string path,object body,string? version=null,string? key=null,bool put=false){var r=new HttpRequestMessage(put?HttpMethod.Put:HttpMethod.Post,"/api/time-assets"+path){Content=JsonContent.Create(body)};r.Headers.Add("Idempotency-Key",key??Guid.NewGuid().ToString());if(version!=null)r.Headers.TryAddWithoutValidation("If-Match",version);return await client.SendAsync(r);}
    [ProfileSqlFact] public async Task IsolatedHttpLifecycleValuationBudgetsProjectsAndPrivacyDoNotWriteLedger() {
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="TimeAssets-"+Guid.NewGuid().ToString("N");AppUser NewUser(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@time.test",DisplayName="Time test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var user=NewUser();var other=NewUser();await db.SaveChangesAsync();var provider=new Provider();using var factory=new Factory(connection,provider);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        foreach(var p in new[]{(client,user),(stranger,other)}){var login=await Data(await p.Item1.PostAsJsonAsync("/api/auth/login",new{email=p.Item2.Email,password}));p.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        var initialTransactions=await db.Transactions.CountAsync();var initialEntries=await db.Entries.CountAsync();
        var project=await Data(await Write(client,"/projects",new TimeProjectInput("Private project","Read",300,"pages",100,20)));var pid=project.GetProperty("id").GetString();
        await Data(await Write(client,"/valuations",new TimeValuationInput("Custom","Hourly assumption","CNY",new(2026,9,1),HourlyRate:60)));
        await Data(await Write(client,"/valuations",new TimeValuationInput("Custom","Revised assumption","CNY",new(2026,9,2),HourlyRate:120)));
        var activity=new TimeActivityInput("Private activity","Learning",At(1,23),At(2,1),"Private note",pid);var key=Guid.NewGuid().ToString();
        var saved=await Data(await Write(client,"/activities",activity,key:key));var id=saved.GetProperty("id").GetString();
        Assert.Equal(id,(await Data(await Write(client,"/activities",activity,key:key))).GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/activities",activity)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,$"/activities/{id}",activity,"1",put:true)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,$"/activities/{id}",activity,"999",put:true)).StatusCode);
        await Data(await Write(client,"/budgets",new TimeBudgetInput("Month",new(2026,9,1),"Learning",90)));
        var report=await Data(await client.GetAsync("/api/time-assets/report?from=2026-09-01&to=2026-09-03&currency=CNY"));
        var summary=report.GetProperty("summary");Assert.Equal(7200,summary.GetProperty("recordedSeconds").GetDecimal());Assert.Equal(180,summary.GetProperty("referenceCost").GetDecimal());Assert.Equal(4.17m,summary.GetProperty("coveragePercent").GetDecimal());Assert.Equal(100,summary.GetProperty("valuationCoveragePercent").GetDecimal());
        Assert.Equal(30,report.GetProperty("budgets")[0].GetProperty("overMinutes").GetDecimal());
        var foreign=await Data(await client.GetAsync("/api/time-assets/report?from=2026-09-01&to=2026-09-03&currency=USD"));Assert.Equal(JsonValueKind.Null,foreign.GetProperty("summary").GetProperty("referenceCost").ValueKind);
        var batch=new[]{new TimeActivityInput("Batch A","Health",At(3,1),At(3,2)),new TimeActivityInput("Batch B","Health",At(3,1),At(3,3))};Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Write(client,"/batch",batch)).StatusCode);
        var timer=await Data(await Write(client,"/timer",new TimeTimerInput("Timer","Work")));var tid=timer.GetProperty("id").GetString();await Data(await Write(client,$"/timer/{tid}/pause",new{},"1"));await Data(await Write(client,$"/timer/{tid}/resume",new{},"2"));await Data(await Write(client,$"/timer/{tid}/stop",new{},"3"));
        var aiBody=new TimeAssetEndpoints.AnalysisInput(new(2026,9,1),new(2026,9,3),"CNY","project",true,ProjectId:pid);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync("/api/time-assets/analysis",aiBody)).StatusCode);
        db.Add(new AiPrivacySetting{UserId=user.Id,Enabled=true,AllowSummary=true});await db.SaveChangesAsync();
        await Data(await client.PostAsJsonAsync("/api/time-assets/analysis",aiBody));Assert.DoesNotContain("Private activity",provider.Sent);Assert.DoesNotContain("Private note",provider.Sent);Assert.DoesNotContain("Private project",provider.Sent);Assert.Contains("projects",provider.Sent);
        Assert.Equal(initialTransactions,await db.Transactions.CountAsync());Assert.Equal(initialEntries,await db.Entries.CountAsync());
        // Synthetic financial data exists only in the disposable test database.
        var account=new Account{UserId=user.Id,Name="Test USD",Currency="USD"};db.Add(account);
        var transaction=new FinanceTransaction{UserId=user.Id,AccountId=account.Id,Amount=120,Currency="USD",OccurredAt=At(2),Type="Expense"};db.Add(transaction);
        db.Add(new Entry{UserId=user.Id,TransactionId=transaction.Id,Kind="Expense",Amount=120,Currency="USD",BaseAmount=120});
        db.Add(new Entry{UserId=user.Id,TransactionId=transaction.Id,Kind="Account",AccountId=account.Id,Amount=-120,Currency="USD",BaseAmount=-120});
        await db.SaveChangesAsync();
        await Data(await Write(client,"/links",new TimeLinkInput(transaction.Id,id)));
        await Data(await Write(client,"/links",new TimeLinkInput(transaction.Id,ProjectId:pid)));
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,"/links",new TimeLinkInput(transaction.Id,ProjectId:pid))).StatusCode);
        var noFx=await Data(await client.GetAsync("/api/time-assets/report?from=2026-09-01&to=2026-09-03&currency=CNY"));Assert.Equal(JsonValueKind.Null,noFx.GetProperty("summary").GetProperty("linkedExpense").ValueKind);
        db.Add(new FxValuationRate{UserId=user.Id,BaseCurrency="USD",TargetCurrency="CNY",Rate=7,Date=new(2026,9,2),Source="Isolated test"});await db.SaveChangesAsync();
        var linked=await Data(await client.GetAsync("/api/time-assets/report?from=2026-09-01&to=2026-09-03&currency=CNY"));Assert.Equal(840,linked.GetProperty("summary").GetProperty("linkedExpense").GetDecimal());Assert.Equal(1,linked.GetProperty("financialTransactions").GetArrayLength());Assert.Equal(1020,linked.GetProperty("summary").GetProperty("combinedResourceCost").GetDecimal());Assert.Equal(7,linked.GetProperty("financialTransactions")[0].GetProperty("laborHours").GetDecimal());
        Assert.Equal(initialTransactions+1,await db.Transactions.CountAsync());Assert.Equal(initialEntries+2,await db.Entries.CountAsync());
        await Data(await Write(client,$"/activities/{id}/delete",new{},"1"));Assert.False(await db.Set<TimeActivity>().AnyAsync(x=>x.Id==id));
    }
}
