using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed record LedgerAnomalyMatch(string Id, string Rule);
public sealed partial class FinanceService
{
    private async Task LoadLedgerAnomalies(string user, CancellationToken ct)
    {
        if (workspaceAnomalyMatches.ContainsKey((user, "Balance"))) return;
        // Aggregate entries before joining transactions; retain every balance, category and transfer check.
        var rows = await db.Database.SqlQueryRaw<LedgerAnomalyMatch>("""
            WITH EntryTotals AS (
             SELECT e.TransactionId, SUM(e.BaseAmount) Total,
              MAX(CASE WHEN e.Kind=N'Account' THEN 1 ELSE 0 END) HasAccount,
              MAX(CASE WHEN e.Kind=N'Expense' THEN 1 ELSE 0 END) HasExpense,
              MAX(CASE WHEN e.Kind=N'Income' THEN 1 ELSE 0 END) HasIncome
             FROM finance.Entries e WHERE e.UserId=@ledgerUser GROUP BY e.TransactionId
            ), InvalidCategories AS (
             SELECT e.TransactionId,
              MAX(CASE WHEN e.Kind=N'Expense' THEN 1 ELSE 0 END) InvalidExpense,
              MAX(CASE WHEN e.Kind=N'Income' THEN 1 ELSE 0 END) InvalidIncome
             FROM finance.Entries e LEFT JOIN finance.Categories c ON c.Id=e.CategoryId AND c.UserId=@ledgerUser
             WHERE e.UserId=@ledgerUser AND e.Kind IN(N'Expense',N'Income') AND (c.Id IS NULL OR c.Kind<>e.Kind) GROUP BY e.TransactionId
            ), TransferLegs AS (
             SELECT t.Id,
             MAX(CASE WHEN e.AccountId=t.AccountId AND e.Amount<0 THEN 1 ELSE 0 END) SourcePaid,
             MAX(CASE WHEN e.AccountId=t.ToAccountId AND e.Amount>0 THEN 1 ELSE 0 END) TargetReceived
             FROM finance.Transactions t LEFT JOIN finance.Entries e ON e.TransactionId=t.Id AND e.UserId=@ledgerUser AND e.Kind=N'Account'
             WHERE t.UserId=@ledgerUser AND t.Status<>N'Deleted' AND t.Type IN(N'Transfer',N'CreditCardPayment') GROUP BY t.Id
            ), Ledger AS (
             SELECT t.Id,t.Type,t.AccountId,t.ToAccountId,COALESCE(e.Total,0) Total,COALESCE(e.HasAccount,0) HasAccount,
              COALESCE(e.HasExpense,0) HasExpense,COALESCE(e.HasIncome,0) HasIncome,
              COALESCE(c.InvalidExpense,0) InvalidExpense,COALESCE(c.InvalidIncome,0) InvalidIncome,COALESCE(legs.SourcePaid,0) SourcePaid,COALESCE(legs.TargetReceived,0) TargetReceived
             FROM finance.Transactions t LEFT JOIN EntryTotals e ON e.TransactionId=t.Id LEFT JOIN InvalidCategories c ON c.TransactionId=t.Id LEFT JOIN TransferLegs legs ON legs.Id=t.Id
             WHERE t.UserId=@ledgerUser AND t.Status<>N'Deleted' AND t.Type IN(N'Expense',N'Income',N'Transfer',N'Refund',N'CreditCardPayment')
            )
            SELECT l.Id, flags.[Rule] FROM Ledger l CROSS APPLY (VALUES
             (N'Balance',CASE WHEN l.HasAccount=0 OR l.Total<>0 THEN 1 ELSE 0 END),
             (N'Category',CASE WHEN l.Type=N'Expense' AND (l.HasExpense=0 OR l.InvalidExpense=1) OR l.Type=N'Income' AND (l.HasIncome=0 OR l.InvalidIncome=1) THEN 1 ELSE 0 END),
             (N'Transfer',CASE WHEN l.Type IN(N'Transfer',N'CreditCardPayment') AND (l.ToAccountId IS NULL OR l.ToAccountId=l.AccountId
              OR l.SourcePaid=0
              OR l.TargetReceived=0) THEN 1 ELSE 0 END)
            ) flags([Rule],Invalid) WHERE flags.Invalid=1;
            """, new SqlParameter("@ledgerUser",user)).ToArrayAsync(ct);
        foreach (var rule in new[] { "Balance", "Category", "Transfer" })
            workspaceAnomalyMatches[(user,rule)] = rows.Where(r => r.Rule == rule).Select(r => r.Id).ToArray();
    }
}
