using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;

[Collection("Finance SQL")]
public class TransactionKeywordFlightTests
{
    sealed class Monitor : DbCommandInterceptor
    {
        public int Searches;
        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken ct=default)
        {
            if(command.CommandText.Contains("Merchant") && command.CommandText.Contains("LIKE") && command.Parameters.Cast<DbParameter>().Any(p=>p.Value?.ToString()?.Contains("flightneedle")==true)) { Interlocked.Increment(ref Searches); await Task.Delay(100,ct); }
            return result;
        }
    }
    sealed class Factory(string connection,Monitor monitor):WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b)
        {
            b.UseEnvironment("Development");b.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('K',64),["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-flight-keys")}));
            b.ConfigureServices(s=>{s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection).AddInterceptors(monitor));s.RemoveAll<IHostedService>();s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('K',64))));});
        }
    }
    static async Task<JsonElement> Data(HttpResponseMessage r) {var text=await r.Content.ReadAsStringAsync();Assert.Equal(HttpStatusCode.OK,r.StatusCode);return JsonDocument.Parse(text).RootElement.GetProperty("data").Clone();}
    [ProfileSqlFact] public async Task ConcurrentSearchesShareWorkCancelIndependentlyAndNeverCacheAfterAWrite()
    {
        var connection=IsolatedSqlTestDatabase.ConnectionString();await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);await db.Database.MigrateAsync();
        var password="Keyword-"+Guid.NewGuid().ToString("N");AppUser User(){var u=new AppUser{Email=Guid.NewGuid().ToString("N")+"@flight.test",DisplayName="Synthetic"};u.PasswordHash=new PasswordHasher<AppUser>().HashPassword(u,password);db.Add(u);return u;}
        var owner=User();var other=User();var account=new Account{UserId=owner.Id,Name="Cash",OpeningBalance=1000};db.Add(account);
        var tx=new FinanceTransaction{UserId=owner.Id,AccountId=account.Id,Type="Income",Amount=10,Note="flightneedle",OccurredAt=DateTimeOffset.UtcNow};tx.Entries.Add(new Entry{UserId=owner.Id,TransactionId=tx.Id,AccountId=account.Id,Amount=10,BaseAmount=10});tx.Entries.Add(new Entry{UserId=owner.Id,TransactionId=tx.Id,Kind="Income",Amount=-10,BaseAmount=-10});db.Add(tx);await db.SaveChangesAsync();
        var monitor=new Monitor();using var factory=new Factory(connection,monitor);using var client=factory.CreateClient();using var stranger=factory.CreateClient();
        foreach(var pair in new[]{(client,owner),(stranger,other)}){var login=await Data(await pair.Item1.PostAsJsonAsync("/api/auth/login",new{email=pair.Item2.Email,password}));pair.Item1.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",login.GetProperty("accessToken").GetString());}
        const string route="/api/transactions?keyword=flightneedle&pageSize=20";
        var responses=await Task.WhenAll(Enumerable.Range(0,8).Select(_=>client.GetAsync(route)));foreach(var r in responses)Assert.Equal(1,(await Data(r)).GetProperty("total").GetInt32());
        Assert.Equal(2,monitor.Searches); // Exactly one count and one page-ID query; no projection is skipped.
        Assert.Equal(0,(await Data(await stranger.GetAsync(route))).GetProperty("total").GetInt32());
        using var cancel=new CancellationTokenSource();var interrupted=client.GetAsync(route,cancel.Token);var survivors=Task.WhenAll(Enumerable.Range(0,4).Select(_=>client.GetAsync(route)));cancel.CancelAfter(30);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async()=>await interrupted);foreach(var r in await survivors)Assert.Equal(1,(await Data(r)).GetProperty("total").GetInt32());
        tx.Note="changed";tx.Version++;tx.UpdatedAt=DateTimeOffset.UtcNow;await db.SaveChangesAsync();
        Assert.Equal(0,(await Data(await client.GetAsync(route))).GetProperty("total").GetInt32());
        Assert.Equal(1010,account.OpeningBalance+await db.Entries.Where(e=>e.UserId==owner.Id&&e.Kind=="Account").SumAsync(e=>e.Amount));
    }
}
