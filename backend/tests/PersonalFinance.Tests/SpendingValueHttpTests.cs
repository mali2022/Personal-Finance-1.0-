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
public class SpendingValueHttpTests
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

    static Task<HttpResponseMessage> Save(HttpClient c, SpendingDecision body, string? id=null, string version="0")
    {
        var r=new HttpRequestMessage(id==null?HttpMethod.Post:HttpMethod.Put,"/api/spending-value"+(id==null?"":"/"+id)){Content=JsonContent.Create(body)};
        r.Headers.TryAddWithoutValidation("If-Match",version);r.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());return c.SendAsync(r);
    }
    [ProfileSqlFact] public async Task IsolatedPersistencePermissionsVersionReviewAndNoLedgerWrites()
    {
        var connection=IsolatedSqlTestDatabase.ConnectionString();
        await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Spending-Test-"+Guid.NewGuid().ToString("N");
        AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@spending.test",DisplayName="Spending test"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var owner=User();var other=User();var account=new Account{UserId=owner.Id,Name="Test cash",OpeningBalance=1000};db.Add(account);
        var tx=new FinanceTransaction{UserId=owner.Id,AccountId=account.Id,Amount=100,OccurredAt=DateTimeOffset.UtcNow};db.Add(tx);await db.SaveChangesAsync();
        if (Environment.GetEnvironmentVariable("PF_SPENDING_BROWSER_CREDENTIALS") is string file)
            await File.WriteAllTextAsync(file,JsonSerializer.Serialize(new{email=owner.Email,password}));
        using var factory=new Factory(connection);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        foreach(var pair in new[]{(client,owner),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        var count=await db.Transactions.CountAsync();var entries=await db.Entries.CountAsync();
        var b=new SpendingDecision("Test","CNY",new(2026,10,29),new(2026,11,29),["Joy"],new(1000,1000,100,10,[1],[new("A",[new("item",100,20,2,10)],[8],true),new("Keep",[],[5],true)]),[new("A",[tx.Id],3,7,"Used")]);
        var saved=await Data(await Save(client,b));var id=saved.GetProperty("id").GetString()!;var version=saved.GetProperty("version").GetString()!;
        var detail=await Data(await client.GetAsync("/api/spending-value/"+id));Assert.Equal(100,detail.GetProperty("reviews")[0].GetProperty("actualCost").GetDecimal());
        Assert.Equal(HttpStatusCode.NotFound,(await stranger.GetAsync("/api/spending-value/"+id)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await Save(client,b,id,"999")).StatusCode);
        await Data(await Save(client,b with{Name="Updated"},id,version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,(await Save(stranger,b)).StatusCode);
        Assert.Empty((await Data(await stranger.GetAsync("/api/spending-value"))).GetProperty("items").EnumerateArray());
        Assert.Equal(count,await db.Transactions.CountAsync());Assert.Equal(entries,await db.Entries.CountAsync());
        if(Environment.GetEnvironmentVariable("PF_SPENDING_MILLION")=="1")
        {
            db.Database.SetCommandTimeout(180);
            await db.Database.ExecuteSqlInterpolatedAsync($@";WITH n AS (SELECT TOP (1000000) ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) n FROM sys.all_objects a CROSS JOIN sys.all_objects b)
INSERT INTO finance.Transactions (Id,UserId,AccountId,Type,Amount,Currency,OccurredAt,Note,Status,Fee,CreatedAt,UpdatedAt,Version)
SELECT CONVERT(nvarchar(36),NEWID()),{owner.Id},{account.Id},'Expense',1,'CNY',DATEADD(second,-CONVERT(int,n),SYSDATETIMEOFFSET()),'spending-million-test','Confirmed',0,SYSDATETIMEOFFSET(),SYSDATETIMEOFFSET(),1 FROM n;");
            var watch=System.Diagnostics.Stopwatch.StartNew();
            await Data(await client.GetAsync("/api/spending-value/choices?currency=CNY"));
            await Data(await client.GetAsync("/api/spending-value/"+id));
            await Data(await client.GetAsync("/api/spending-value"));
            Assert.True(watch.Elapsed < TimeSpan.FromSeconds(10),"Million-row reads exceeded 10 seconds: "+watch.Elapsed);
            Console.WriteLine("SPENDING_MILLION_READS_MS="+watch.ElapsedMilliseconds);
        }
        Assert.True(await db.Set<AuditRecord>().AnyAsync(x=>x.UserId==owner.Id&&x.ResourceId==id));
    }
}
