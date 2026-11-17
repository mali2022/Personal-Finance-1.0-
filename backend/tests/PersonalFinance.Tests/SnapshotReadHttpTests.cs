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
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public sealed class SnapshotReadHttpTests
{
    sealed class Factory(string connection) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder b)
        {
            b.UseEnvironment("Development");
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string,string?> {
                ["ConnectionStrings:Finance"]=connection,["Auth:SigningKey"]=new string('S',64),["Database:SnapshotReads"]="true",
                ["DataProtection:KeyPath"]=Path.Combine(Path.GetTempPath(),"pf-snapshot-test-keys")
            }));
            b.ConfigureServices(s => {
                s.RemoveAll<DbContextOptions<FinanceDb>>();s.AddDbContext<FinanceDb>(o=>o.UseSqlServer(connection));s.RemoveAll<IHostedService>();
                s.Configure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>("Bearer",o=>o.TokenValidationParameters.IssuerSigningKey=new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(new string('S',64))));
            });
        }
    }
    [ProfileSqlFact]
    public async Task HttpReadUsesCommittedSnapshotWithoutWaitingForAnUncommittedWriter()
    {
        var connection=IsolatedSqlTestDatabase.ConnectionString();
        await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);
        await db.Database.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync("ALTER DATABASE CURRENT SET ALLOW_SNAPSHOT_ISOLATION ON");
        var password="Snapshot-"+Guid.NewGuid().ToString("N");var user=new AppUser{Email=Guid.NewGuid()+"@snapshot.test"};
        user.PasswordHash=new PasswordHasher<AppUser>().HashPassword(user,password);
        var account=new Account{UserId=user.Id,Name="Snapshot cash",OpeningBalance=100};
        var category=new Category{UserId=user.Id,Name="Snapshot expense",Kind="Expense"};
        var t=new FinanceTransaction{UserId=user.Id,Type="Expense",Amount=10,AccountId=account.Id,CategoryId=category.Id,Note="committed",OccurredAt=DateTimeOffset.UtcNow};
        t.Entries.Add(new(){UserId=user.Id,TransactionId=t.Id,Kind="Account",AccountId=account.Id,Amount=-10,BaseAmount=-10});
        t.Entries.Add(new(){UserId=user.Id,TransactionId=t.Id,Kind="Expense",CategoryId=category.Id,Amount=10,BaseAmount=10});
        db.AddRange(user,account,category,t);await db.SaveChangesAsync();
        using var factory=new Factory(connection);using var client=factory.CreateClient();
        var login=await client.PostAsJsonAsync("/api/auth/login",new{email=user.Email,password});login.EnsureSuccessStatusCode();
        var token=(await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data").GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",token);
        await using var writer=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);
        await using(var transaction=await writer.Database.BeginTransactionAsync()) {
            await writer.Database.ExecuteSqlInterpolatedAsync($"UPDATE finance.Transactions SET Note=N'uncommitted' WHERE Id={t.Id}");
            var response=await client.GetAsync("/api/transactions/"+t.Id).WaitAsync(TimeSpan.FromSeconds(5));response.EnsureSuccessStatusCode();
            var data=(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
            Assert.Equal("committed",data.GetProperty("note").GetString());
            Assert.Equal("90.00",data.GetProperty("accountBalances")[0].GetProperty("balance").GetString());
            await transaction.RollbackAsync();
        }
        await writer.Database.ExecuteSqlInterpolatedAsync($"UPDATE finance.Transactions SET Note=N'new committed' WHERE Id={t.Id}");
        var fresh=await client.GetFromJsonAsync<JsonElement>("/api/transactions/"+t.Id);
        Assert.Equal("new committed",fresh.GetProperty("data").GetProperty("note").GetString());
    }
}
