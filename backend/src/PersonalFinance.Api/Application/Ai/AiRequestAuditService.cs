using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed class AiRequestAuditService(FinanceDb db, IOptions<AiOptions> options)
{
    public async Task Begin(AiRequestContext context, CancellationToken ct)
    {
        var config = AiGatewayControl.Configuration(options.Value);
        // A single SQL statement makes snapshot insertion safe across concurrent requests/processes.
        await db.Database.ExecuteSqlInterpolatedAsync($"MERGE [finance].[AiConfigurationSnapshot] WITH (HOLDLOCK) AS target USING (SELECT {config.Version} AS [Id]) AS source ON target.[Id]=source.[Id] WHEN NOT MATCHED THEN INSERT ([Id],[ConfigurationJson],[CreatedAt]) VALUES ({config.Version},{config.Json},{DateTimeOffset.UtcNow});", ct);
        db.Add(new AiRequestAudit { Id = context.RequestId, UserId = context.UserId, LedgerId = context.LedgerId,
            AccountScopeJson = System.Text.Json.JsonSerializer.Serialize(context.AccountIds), ConfigurationVersion = config.Version, ConsentVersion = context.ConsentVersion });
        await db.SaveChangesAsync(ct);
    }
    public async Task Finish(string id, string state, string? error)
    {
        var row = await db.Set<AiRequestAudit>().SingleAsync(x => x.Id == id);
        row.State = state; row.ErrorCode = error; row.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(CancellationToken.None);
    }
}
