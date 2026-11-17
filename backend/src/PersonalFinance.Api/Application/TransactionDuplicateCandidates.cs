using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace PersonalFinance.Api.Application;

public sealed record WorkspaceDuplicateMatch(string Id);

public sealed partial class FinanceService
{
    private async Task<string[]> WorkspaceDuplicateIds(string user,CancellationToken ct)
    {
        // CHECKSUM is a blocking key only. Full SQL equality below is mandatory:
        // collisions, including SQL Server's ignored dashes, must not create duplicates.
        // https://learn.microsoft.com/sql/t-sql/functions/checksum-transact-sql
        var rows=await db.Database.SqlQueryRaw<WorkspaceDuplicateMatch>("""
            DROP TABLE IF EXISTS #PFWorkspaceDuplicateCandidates;
            WITH BlockKeys AS (
                SELECT CHECKSUM(AccountId,Type,Amount,Currency,OccurredAt,Merchant) HashKey
                FROM finance.Transactions
                WHERE UserId=@duplicateUser AND Status<>N'Deleted'
                GROUP BY CHECKSUM(AccountId,Type,Amount,Currency,OccurredAt,Merchant)
                HAVING COUNT_BIG(*)>1
            )
            SELECT t.Id,t.AccountId,t.Type,t.Amount,t.Currency,t.OccurredAt,t.Merchant
            INTO #PFWorkspaceDuplicateCandidates
            FROM finance.Transactions t INNER JOIN BlockKeys b
                ON CHECKSUM(t.AccountId,t.Type,t.Amount,t.Currency,t.OccurredAt,t.Merchant)=b.HashKey
            WHERE t.UserId=@duplicateUser AND t.Status<>N'Deleted';

            WITH ExactKeys AS (
                SELECT AccountId,Type,Amount,Currency,OccurredAt,Merchant
                FROM #PFWorkspaceDuplicateCandidates
                GROUP BY AccountId,Type,Amount,Currency,OccurredAt,Merchant
                HAVING COUNT_BIG(*)>1
            )
            SELECT t.Id FROM #PFWorkspaceDuplicateCandidates t INNER JOIN ExactKeys e
                ON (t.AccountId=e.AccountId OR t.AccountId IS NULL AND e.AccountId IS NULL)
                AND t.Type=e.Type AND t.Amount=e.Amount AND t.Currency=e.Currency
                AND t.OccurredAt=e.OccurredAt
                AND (t.Merchant=e.Merchant OR t.Merchant IS NULL AND e.Merchant IS NULL);
            DROP TABLE #PFWorkspaceDuplicateCandidates;
            """,new SqlParameter("@duplicateUser",user)).ToArrayAsync(ct);
        return rows.Select(r=>r.Id).ToArray();
    }
}
