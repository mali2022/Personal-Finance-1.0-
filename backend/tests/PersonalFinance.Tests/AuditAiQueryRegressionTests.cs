using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Domain;
using Xunit;

public sealed class AuditQueryBoundaryTests
{
    [Fact] public void CalendarEndIncludesEveryInstantOfShanghaiDayAndExcludesNextMidnight()
    {
        var day = FinanceService.Date("2026-10-15");
        var moments = new[] { day.AddTicks(-1), day, day.AddHours(12), day.AddDays(1).AddTicks(-1), day.AddDays(1) };
        var rows = moments.Select((at, i) => new FinanceTransaction { Id = i.ToString(), OccurredAt = at }).AsQueryable();
        Assert.Equal(new[] { "1", "2", "3" }, FinanceService.ApplyTransactionDates(rows, "2026-10-15", "2026-10-15").Select(x => x.Id));
        // UTC timestamps naming the same instants obey the same Shanghai boundaries.
        Assert.Equal(new[] { "1", "2", "3" }, FinanceService.ApplyTransactionDates(rows, "2026-10-14T16:00:00Z", "2026-10-15T15:59:59.9999999Z").Select(x => x.Id));
    }

    [Theory]
    [InlineData("2026-10-15T12:00:00+08:00")]
    [InlineData("2026-10-15T04:00:00Z")]
    public void TimestampEndDoesNotExpandToWholeDay(string end)
    {
        var cutoff = DateTimeOffset.Parse(end);
        var rows = new[] { cutoff.AddTicks(-1), cutoff, cutoff.AddTicks(1) }
            .Select((at, i) => new FinanceTransaction { Id = i.ToString(), OccurredAt = at }).AsQueryable();
        Assert.Equal(new[] { "0", "1" }, FinanceService.ApplyTransactionDates(rows, null, end).Select(x => x.Id));
    }

    [Fact] public void LastRepresentableCalendarDayRemainsAValidBoundary()
    {
        var last = new DateTimeOffset(DateTime.MaxValue, TimeSpan.FromHours(8));
        var rows = new[] { new FinanceTransaction { OccurredAt = last } }.AsQueryable();
        Assert.Single(FinanceService.ApplyTransactionDates(rows, "9999-12-31", "9999-12-31"));
    }

    [Theory]
    [InlineData(120, 1, 50, true)]
    [InlineData(50, 1, 50, false)]
    [InlineData(0, 1, 0, false)]
    [InlineData(120, 3, 20, true)]
    public void PaginationMetadataMarksOmittedRowsWithoutRequiringAnOversizedArray(int total, int page, int count, bool expected)
    {
        var raw = JsonSerializer.SerializeToNode(new { items = Enumerable.Range(0, count).Select(x => new { amount = "10.00", merchant = "private" }), total, page, pageSize = 50 });
        var truncated = false;
        var data = AiFinancialTools.Sanitize(raw, 50, ref truncated)!;
        Assert.Equal(expected, truncated);
        Assert.Equal(total, data["total"]!.GetValue<int>());
        Assert.Equal(count, data["items"]!.AsArray().Count);
        Assert.DoesNotContain("private", data.ToJsonString());
    }

    [Fact] public void UnpagedResultsStillMarkLocalTruncation()
    {
        var truncated = false;
        var data = AiFinancialTools.Sanitize(JsonNode.Parse("[1,2,3]"), 2, ref truncated)!;
        Assert.True(truncated); Assert.Equal(2, data.AsArray().Count);
    }
}

public sealed class AuditLoginRateLimitTests
{
    private static DefaultHttpContext Client(string ip, string? forwarded = null)
    {
        var context = new DefaultHttpContext(); context.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        if (forwarded != null) context.Request.Headers["X-Forwarded-For"] = forwarded;
        return context;
    }

    [Fact] public void TenRequestsFromOneClientDoNotBlockAnotherClient()
    {
        using var limiter = PartitionedRateLimiter.Create<HttpContext, string>(LoginRateLimitPolicy.Partition);
        for (var i = 0; i < 10; i++) { using var lease = limiter.AttemptAcquire(Client("203.0.113.10")); Assert.True(lease.IsAcquired); }
        using var blocked = limiter.AttemptAcquire(Client("203.0.113.10")); Assert.False(blocked.IsAcquired);
        using var otherClient = limiter.AttemptAcquire(Client("203.0.113.11")); Assert.True(otherClient.IsAcquired);
    }

    [Fact] public void MappedIpv4AndIpv4ShareOneBucket()
    {
        using var limiter = PartitionedRateLimiter.Create<HttpContext, string>(LoginRateLimitPolicy.Partition);
        for (var i = 0; i < 10; i++) { using var lease = limiter.AttemptAcquire(Client("::ffff:203.0.113.10")); Assert.True(lease.IsAcquired); }
        using var blocked = limiter.AttemptAcquire(Client("203.0.113.10")); Assert.False(blocked.IsAcquired);
    }

    [Fact] public async Task UntrustedClientCannotChooseItsBucketWithForwardedHeaders()
    {
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask, NullLoggerFactory.Instance,
            Options.Create(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor }));
        using var limiter = PartitionedRateLimiter.Create<HttpContext, string>(LoginRateLimitPolicy.Partition);
        for (var i = 0; i < 11; i++)
        {
            var request = Client("203.0.113.10", $"198.51.100.{i + 1}");
            await middleware.Invoke(request);
            using var lease = limiter.AttemptAcquire(request);
            Assert.Equal(i < 10, lease.IsAcquired);
            Assert.Equal(IPAddress.Parse("203.0.113.10"), request.Connection.RemoteIpAddress);
        }
    }

    [Fact] public async Task TrustedProxyClientsGetSeparateBuckets()
    {
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask, NullLoggerFactory.Instance,
            Options.Create(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor }));
        using var limiter = PartitionedRateLimiter.Create<HttpContext, string>(LoginRateLimitPolicy.Partition);
        for (var i = 0; i < 10; i++)
        {
            var request = Client("127.0.0.1", "203.0.113.10"); await middleware.Invoke(request);
            using var lease = limiter.AttemptAcquire(request); Assert.True(lease.IsAcquired);
        }
        var second = Client("127.0.0.1", "203.0.113.11"); await middleware.Invoke(second);
        using var accepted = limiter.AttemptAcquire(second); Assert.True(accepted.IsAcquired);
    }
}

[Collection("Finance SQL")]
public sealed class AuditAiQuerySqlTests
{
    [DeletionSqlFact] public async Task AiSameDayDetailsIncludeAfternoonAndExposeRealPaginationCoverage()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize(); var account = f.Account();
        var start = FinanceService.Date("2026-10-15");
        for (var i = 0; i < 120; i++) { var row = f.Expense(account); row.OccurredAt = start.AddHours(12).AddMinutes(i); }
        var nextDay = f.Expense(account); nextDay.OccurredAt = start.AddDays(1);
        var previousDay = f.Expense(account); previousDay.OccurredAt = start.AddTicks(-1);
        await f.Db.SaveChangesAsync();
        var tools = new AiFinancialTools(f.Service, Options.Create(new AiOptions { MaxRecords = 50 }));
        var evidence = await tools.Execute(f.User, "GetTransactions", new("2026-10-15", "2026-10-15", "CNY", null), default);
        Assert.Equal(120, evidence.Data!["total"]!.GetValue<int>());
        Assert.Equal(50, evidence.Data["items"]!.AsArray().Count);
        Assert.True(evidence.Truncated);
        Assert.Contains("第1页", evidence.Scope); Assert.Contains("发生时间降序", evidence.Scope); Assert.Contains("结果已截断", evidence.Scope);
        Assert.Equal(start.AddHours(12).AddMinutes(119), DateTimeOffset.Parse(evidence.Data["items"]![0]!["occurredAt"]!.GetValue<string>()));
        Assert.DoesNotContain(nextDay.Id, evidence.Data.ToJsonString()); Assert.DoesNotContain(previousDay.Id, evidence.Data.ToJsonString());
    }
}
