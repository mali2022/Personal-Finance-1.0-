-- No permanent writes. Findings contain rule names/counts only, never financial values.
SET NOCOUNT ON;
SET LOCK_TIMEOUT 10000;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;
SELECT 'transaction_balance' AS [Rule],COUNT_BIG(*) AS Violations FROM
(SELECT TransactionId FROM finance.Entries GROUP BY TransactionId HAVING SUM(BaseAmount)<>0) x;
SELECT 'entry_ownership_currency' AS [Rule],COUNT_BIG(*) AS Violations
FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId
LEFT JOIN finance.Accounts a ON a.Id=e.AccountId AND a.UserId=e.UserId
LEFT JOIN finance.Categories c ON c.Id=e.CategoryId AND c.UserId=e.UserId
WHERE e.UserId<>t.UserId OR (e.AccountId IS NOT NULL AND a.Id IS NULL)
OR (e.CategoryId IS NOT NULL AND c.Id IS NULL) OR (e.Kind='Account' AND e.Currency<>a.Currency);
SELECT 'refund_origin' AS [Rule],COUNT_BIG(*) AS Violations FROM finance.Transactions r
LEFT JOIN finance.Transactions t ON t.Id=r.OriginalTransactionId AND t.UserId=r.UserId
WHERE r.Type='Refund' AND r.Status<>'Deleted' AND
(t.Id IS NULL OR t.Type<>'Expense' OR t.Status='Deleted' OR t.Currency<>r.Currency);
SELECT 'attachment_ownership' AS [Rule],COUNT_BIG(*) AS Violations FROM finance.Documents d
LEFT JOIN finance.Transactions t ON t.Id=d.TransactionId AND t.UserId=d.UserId
WHERE d.Kind='Attachment' AND t.Id IS NULL;
SELECT 'constraint_trust' AS [Rule],COUNT_BIG(*) AS Violations FROM sys.check_constraints
WHERE parent_object_id IN(SELECT object_id FROM sys.tables WHERE schema_id=SCHEMA_ID('finance'))
AND (is_disabled=1 OR is_not_trusted=1);
SELECT 'sample_size' AS [Rule],COUNT_BIG(*) AS Transactions FROM finance.Transactions;
SELECT 'hold_remaining' AS [Rule],COUNT_BIG(*) AS Violations FROM finance.AccountFundHold
WHERE Amount<0 OR ReleasedAmount<0 OR SettledAmount<0 OR ReleasedAmount+SettledAmount>Amount;
SELECT 'payroll_payment_link' AS [Rule],COUNT_BIG(*) AS Violations FROM finance.PayrollPayment p
LEFT JOIN finance.PayrollStatement s ON s.Id=p.PayrollId AND s.UserId=p.UserId
LEFT JOIN finance.Transactions t ON t.Id=p.TransactionId AND t.UserId=p.UserId
WHERE s.Id IS NULL OR t.Id IS NULL OR t.Type<>'Income' OR t.Status='Deleted' OR t.Currency<>s.Currency;
SELECT 'authorization_single_funding' AS [Rule],COUNT_BIG(*) AS Violations FROM finance.AuthorizedPayment p
LEFT JOIN finance.Transactions t ON t.Id=p.TransactionId AND t.UserId=p.UserId
LEFT JOIN finance.PaymentInstrument i ON i.Id=p.InstrumentId AND i.UserId=p.UserId
WHERE t.Id IS NULL OR i.Id IS NULL OR t.AccountId<>p.AccountId OR i.AccountId<>p.AccountId;
SELECT 'prepayment_asset_balance' AS [Rule],COUNT_BIG(*) AS Violations
FROM finance.PrepaymentContract p JOIN finance.Accounts a ON a.Id=p.AssetAccountId
CROSS APPLY(SELECT COALESCE(SUM(e.Amount),0) amount FROM finance.Entries e
JOIN finance.Transactions t ON t.Id=e.TransactionId WHERE e.UserId=p.UserId AND e.AccountId=a.Id AND t.Status<>'Deleted') b
WHERE p.AccountingMode='AssetAccount' AND (a.UserId<>p.UserId OR a.Currency<>p.Currency OR
a.OpeningBalance+b.amount<>p.Amount-p.ConsumedAmount-p.RefundedAmount-p.WrittenOffAmount);
COMMIT;

