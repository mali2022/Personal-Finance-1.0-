-- Actual historical database, no test rows and no financial amounts in output.
SET NOCOUNT ON;
SET LOCK_TIMEOUT 10000;
SET STATISTICS TIME ON;
PRINT 'actual_history_transaction_page';
SELECT COUNT_BIG(*) AS PageRows FROM (SELECT TOP(50) Id FROM finance.Transactions WHERE Status<>'Deleted' ORDER BY OccurredAt DESC,Id) p;
PRINT 'actual_history_account_balances';
SELECT COUNT_BIG(*) AS AccountsWithEntries FROM (SELECT e.UserId,e.AccountId FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId WHERE e.Kind='Account' AND t.Status<>'Deleted' GROUP BY e.UserId,e.AccountId) b;
PRINT 'actual_history_annual_report_grouping';
SELECT COUNT_BIG(*) AS ReportGroups FROM (SELECT e.UserId,e.Currency,e.Kind,DATEPART(month,t.OccurredAt) MonthNumber FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId WHERE t.Status<>'Deleted' AND t.OccurredAt>='2026-01-01' AND t.OccurredAt<'2027-01-01' AND e.Kind IN('Income','Expense') GROUP BY e.UserId,e.Currency,e.Kind,DATEPART(month,t.OccurredAt)) g;
PRINT 'actual_history_domain_samples';
SELECT 'PayrollPayment' Domain,COUNT_BIG(*) Samples FROM finance.PayrollPayment UNION ALL
SELECT 'AccountFundHold',COUNT_BIG(*) FROM finance.AccountFundHold UNION ALL
SELECT 'PrepaymentContract',COUNT_BIG(*) FROM finance.PrepaymentContract UNION ALL
SELECT 'AuthorizedPayment',COUNT_BIG(*) FROM finance.AuthorizedPayment UNION ALL
SELECT 'ThirdPartyAdvance',COUNT_BIG(*) FROM finance.ThirdPartyAdvance;
SET STATISTICS TIME OFF;
