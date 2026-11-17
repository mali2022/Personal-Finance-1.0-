using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace PersonalFinance.Api.Application;

public sealed record TransactionRunningBalance(string TransactionId, string AccountId, string Name, string Currency, decimal Balance);

public sealed partial class FinanceService
{
    // Aggregate full Shanghai days before windowing, then subtract later transactions
    // in each requested day. Exact timestamp/creation/ID ordering is preserved.
    private async Task<List<TransactionRunningBalance>> RunningBalances(string user, string[] ids, CancellationToken ct = default)
    {
        return await db.Database.SqlQueryRaw<TransactionRunningBalance>("""
            WITH Requested AS (
             SELECT DISTINCT t.Id TransactionId,e.AccountId,t.OccurredAt,t.CreatedAt,CONVERT(date,SWITCHOFFSET(t.OccurredAt,'+08:00')) Day
             FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId
             WHERE e.UserId=@balanceUser AND t.UserId=@balanceUser AND e.Kind=N'Account' AND t.Status<>N'Deleted' AND t.Id IN (SELECT value FROM OPENJSON(@balanceIds))
            ), Bounds AS (SELECT AccountId,MAX(Day) LastDay FROM Requested GROUP BY AccountId),
            Daily AS (
             SELECT e.AccountId,CONVERT(date,SWITCHOFFSET(t.OccurredAt,'+08:00')) Day,SUM(e.Amount) Delta
             FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId JOIN Bounds b ON b.AccountId=e.AccountId
             WHERE e.UserId=@balanceUser AND t.UserId=@balanceUser AND e.Kind=N'Account' AND t.Status<>N'Deleted' AND t.OccurredAt<DATEADD(day,1,TODATETIMEOFFSET(CONVERT(datetime2,b.LastDay),'+08:00'))
             GROUP BY e.AccountId,CONVERT(date,SWITCHOFFSET(t.OccurredAt,'+08:00'))
            ), Running AS (SELECT *,SUM(Delta) OVER(PARTITION BY AccountId ORDER BY Day ROWS UNBOUNDED PRECEDING) Balance FROM Daily),
            AfterTarget AS (
             SELECT r.TransactionId,r.AccountId,SUM(e.Amount) Amount FROM Requested r
             JOIN finance.Transactions t ON t.UserId=@balanceUser AND t.Status<>N'Deleted' AND t.OccurredAt>=TODATETIMEOFFSET(CONVERT(datetime2,r.Day),'+08:00') AND t.OccurredAt<DATEADD(day,1,TODATETIMEOFFSET(CONVERT(datetime2,r.Day),'+08:00'))
             JOIN finance.Entries e ON e.TransactionId=t.Id AND e.UserId=@balanceUser AND e.Kind=N'Account' AND e.AccountId=r.AccountId
             WHERE t.OccurredAt>r.OccurredAt OR t.OccurredAt=r.OccurredAt AND (t.CreatedAt>r.CreatedAt OR t.CreatedAt=r.CreatedAt AND t.Id>r.TransactionId)
             GROUP BY r.TransactionId,r.AccountId
            )
            SELECT r.TransactionId,r.AccountId,a.Name,a.Currency,a.OpeningBalance+d.Balance-COALESCE(x.Amount,0) Balance
            FROM Requested r JOIN Running d ON d.AccountId=r.AccountId AND d.Day=r.Day JOIN finance.Accounts a ON a.Id=r.AccountId AND a.UserId=@balanceUser LEFT JOIN AfterTarget x ON x.TransactionId=r.TransactionId AND x.AccountId=r.AccountId;
            """, new SqlParameter("@balanceUser", user),
            new SqlParameter("@balanceIds", System.Data.SqlDbType.NVarChar, -1) { Value = JsonSerializer.Serialize(ids) }).ToListAsync(ct);
    }
}
