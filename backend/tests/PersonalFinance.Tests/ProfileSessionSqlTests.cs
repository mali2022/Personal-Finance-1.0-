using System.Data.Common;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class ProfileSqlFactAttribute : FactAttribute
{
    public ProfileSqlFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PF_TEST_SQL_CONNECTION_STRING")))
            Skip = "Requires an explicitly supplied isolated RestoreCheck SQL Server database.";
    }
}

[Collection("Finance SQL")]
public sealed class ProfileSessionSqlTests
{
    [ProfileSqlFact]
    public async Task PasswordChangeRevokesConcurrentLoginThatAlreadyVerifiedOldPassword()
    {
        var connectionString = IsolatedSqlTestDatabase.ConnectionString();
        var database = new SqlConnectionStringBuilder(connectionString).InitialCatalog;
        Assert.Matches("^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$", database);
        DbContextOptions<FinanceDb> Options(params IInterceptor[] interceptors) =>
            new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connectionString).AddInterceptors(interceptors).Options;
        var password = "Audit-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
        var user = new AppUser { Email = "audit-lock-" + Guid.NewGuid().ToString("N") + "@personal.finance", DisplayName = "Isolated login lock test" };
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, password);
        await using var setupDb = new FinanceDb(Options());
        setupDb.Users.Add(user);
        await setupDb.SaveChangesAsync();
        var pause = new PauseSessionInsert();
        await using var loginDb = new FinanceDb(Options(pause));
        await using var passwordDb = new FinanceDb(Options());
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Auth:SigningKey"] = Convert.ToHexString(RandomNumberGenerator.GetBytes(48)) }).Build();
        using var services = new ServiceCollection().AddSingleton<IHostEnvironment>(new TestEnvironment()).BuildServiceProvider();
        var loginContext = new DefaultHttpContext { RequestServices = services };
        var loginTask = new AuthService(loginDb, configuration).Login(new(user.Email, password), loginContext);
        Task<object>? passwordTask = null;
        try
        {
            await pause.BeforeInsert.Task.WaitAsync(TimeSpan.FromSeconds(10));
            passwordTask = new AuthService(passwordDb, configuration).ChangePassword(user.Id,
                new(password, password + "-Changed"), new DefaultHttpContext());
            var serialized = false;
            var deadline = DateTime.UtcNow.AddSeconds(10);
            // Observe the real SQL lock; do not assume serialization based on a timing delay.
            while (!passwordTask.IsCompleted && DateTime.UtcNow < deadline)
            {
                await using var monitor = new SqlConnection(connectionString);
                await monitor.OpenAsync();
                await using var query = monitor.CreateCommand();
                query.CommandText = "SELECT COUNT(*) FROM sys.dm_tran_locks WHERE resource_database_id=DB_ID() AND resource_type='APPLICATION' AND request_status='WAIT' AND resource_description LIKE @prefix";
                query.Parameters.AddWithValue("@prefix", "%" + ("user:" + user.Id)[..32] + "%");
                if (Convert.ToInt32(await query.ExecuteScalarAsync()) > 0) { serialized = true; break; }
                await Task.Delay(50);
            }
            pause.Release.TrySetResult(true);
            await loginTask.WaitAsync(TimeSpan.FromSeconds(15));
            await passwordTask.WaitAsync(TimeSpan.FromSeconds(15));
            var sessions = await setupDb.Sessions.AsNoTracking().Where(x => x.UserId == user.Id).ToArrayAsync();
            Assert.True(serialized, "Password change must wait on the login user lock until its session is committed.");
            Assert.Single(sessions);
            Assert.All(sessions, session => Assert.True(session.Revoked, "A concurrent old-password login must not leave an active session after password change."));
            await using var retryDb = new FinanceDb(Options());
            var error = await Assert.ThrowsAsync<ApiException>(() => new AuthService(retryDb, configuration)
                .Login(new(user.Email, password), new DefaultHttpContext { RequestServices = services }));
            Assert.Equal("INVALID_CREDENTIALS", error.Code);
        }
        finally
        {
            pause.Release.TrySetResult(true);
            try { await loginTask.WaitAsync(TimeSpan.FromSeconds(20)); } catch { /* Release only this test's own pending operation. */ }
            if (passwordTask is not null) try { await passwordTask.WaitAsync(TimeSpan.FromSeconds(20)); } catch { }
            await setupDb.Sessions.Where(x => x.UserId == user.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Revoked, true));
        }
    }

    private sealed class PauseSessionInsert : DbCommandInterceptor
    {
        public TaskCompletionSource<bool> BeforeInsert { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource<bool> Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int entered;
        private async Task Pause(DbCommand command, CancellationToken cancellationToken)
        {
            if (Regex.IsMatch(command.CommandText, @"INSERT\s+INTO\s+\[finance\]\.\[Sessions\]", RegexOptions.IgnoreCase) && Interlocked.Exchange(ref entered, 1) == 0)
            {
                BeforeInsert.TrySetResult(true);
                await Release.Task.WaitAsync(TimeSpan.FromSeconds(20), cancellationToken);
            }
        }
        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        { await Pause(command, cancellationToken); return result; }
        public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        { await Pause(command, cancellationToken); return result; }
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "ProfileSessionSqlTests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
