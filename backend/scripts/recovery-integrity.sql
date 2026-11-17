-- Run only in a restored verification database, never modify the source.
IF DB_NAME() NOT LIKE 'PersonalFinanceWeb[_]RestoreCheck[_]%' THROW 51000,'Not a restore verification database',1;
DBCC CHECKDB WITH NO_INFOMSGS, ALL_ERRORMSGS;
CREATE TABLE #violations([Table] nvarchar(512),[Constraint] nvarchar(512),[Where] nvarchar(max));
INSERT #violations EXEC('DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS, ALL_ERRORMSGS, NO_INFOMSGS');
IF EXISTS(SELECT 1 FROM #violations) THROW 51000,'Constraint validation failed',1;
IF EXISTS(SELECT TransactionId FROM finance.Entries GROUP BY TransactionId HAVING SUM(BaseAmount)<>0)
THROW 51000,'Unbalanced transaction',1;
IF EXISTS(SELECT 1 FROM finance.Transactions t LEFT JOIN finance.Accounts a ON a.Id=t.AccountId AND a.UserId=t.UserId WHERE a.Id IS NULL)
THROW 51000,'Invalid transaction account',1;
IF EXISTS(SELECT 1 FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId
LEFT JOIN finance.Accounts a ON a.Id=e.AccountId AND a.UserId=e.UserId
LEFT JOIN finance.Categories c ON c.Id=e.CategoryId AND c.UserId=e.UserId
WHERE e.UserId<>t.UserId OR (e.AccountId IS NOT NULL AND a.Id IS NULL) OR (e.CategoryId IS NOT NULL AND c.Id IS NULL)
OR (e.Kind='Account' AND e.Currency<>a.Currency)) THROW 51000,'Invalid entry ownership or currency',1;
IF EXISTS(SELECT 1 FROM finance.Transactions r LEFT JOIN finance.Transactions t ON t.Id=r.OriginalTransactionId AND t.UserId=r.UserId
WHERE r.Type='Refund' AND r.Status<>'Deleted' AND (t.Id IS NULL OR t.Type<>'Expense' OR t.Status='Deleted' OR t.Currency<>r.Currency))
THROW 51000,'Invalid refund origin',1;
-- Match FinanceService.PriceRecoveryTransactions: active price-adjustment recoveries
-- restore refundable principal and the original category allowance. Reward-income
-- recoveries and revoked/deleted recoveries never increase this allowance.
CREATE TABLE #priceRecoveryTransactions(OriginalTransactionId nvarchar(36),TransactionId nvarchar(36) PRIMARY KEY,UserId nvarchar(36),Amount decimal(28,4));
IF OBJECT_ID('finance.CashbackRecovery') IS NOT NULL AND OBJECT_ID('finance.CashbackReceivable') IS NOT NULL
EXEC(N'INSERT #priceRecoveryTransactions
SELECT b.TransactionId,t.Id,t.UserId,t.Amount FROM finance.CashbackRecovery r
JOIN finance.CashbackReceivable b ON b.Id=r.CashbackId AND b.UserId=r.UserId
JOIN finance.Transactions t ON t.Id=r.TransactionId AND t.UserId=r.UserId
WHERE b.Treatment=''PriceAdjustment'' AND r.State=''Active'' AND t.Status<>''Deleted'';');
SELECT OriginalTransactionId,SUM(Amount) AS Amount INTO #priceRecoveryTotals FROM #priceRecoveryTransactions GROUP BY OriginalTransactionId;
IF EXISTS(SELECT t.Id FROM finance.Transactions t JOIN finance.Transactions r ON r.OriginalTransactionId=t.Id
AND r.UserId=t.UserId AND r.Type='Refund' AND r.Status<>'Deleted'
LEFT JOIN #priceRecoveryTotals recovered ON recovered.OriginalTransactionId=t.Id
GROUP BY t.Id,t.Amount,recovered.Amount HAVING SUM(r.Amount)>t.Amount+COALESCE(recovered.Amount,0))
THROW 51000,'Refund exceeds original',1;
-- Materialize once so the optimizer cannot turn the refund aggregate into a per-original scan.
SELECT r.OriginalTransactionId,re.CategoryId,SUM(re.Amount) AS Amount
INTO #categoryRefundTotals
FROM finance.Transactions r JOIN finance.Entries re ON re.TransactionId=r.Id
WHERE r.Type='Refund' AND r.Status<>'Deleted' AND re.Kind='Expense'
GROUP BY r.OriginalTransactionId,re.CategoryId;
CREATE INDEX IX_CategoryRefundTotals ON #categoryRefundTotals(OriginalTransactionId,CategoryId);
SELECT r.OriginalTransactionId,e.CategoryId,SUM(e.Amount) AS Amount INTO #categoryRecoveryTotals
FROM #priceRecoveryTransactions r JOIN finance.Entries e ON e.TransactionId=r.TransactionId AND e.UserId=r.UserId AND e.Kind='Expense'
GROUP BY r.OriginalTransactionId,e.CategoryId;
IF EXISTS(SELECT 1 FROM (
SELECT original.Id,oe.CategoryId,SUM(oe.Amount) AS Amount FROM finance.Transactions original
JOIN finance.Entries oe ON oe.TransactionId=original.Id AND oe.Kind='Expense'
WHERE original.Type='Expense'
GROUP BY original.Id,oe.CategoryId) original
LEFT JOIN #categoryRefundTotals refunded
ON refunded.OriginalTransactionId=original.Id AND refunded.CategoryId=original.CategoryId
LEFT JOIN #categoryRecoveryTotals recovered ON recovered.OriginalTransactionId=original.Id AND recovered.CategoryId=original.CategoryId
WHERE original.Amount+COALESCE(recovered.Amount,0) < -COALESCE(refunded.Amount,0)) THROW 51000,'Category refund exceeds original',1;
IF EXISTS(SELECT 1 FROM finance.Documents d LEFT JOIN finance.Transactions t ON t.Id=d.TransactionId AND t.UserId=d.UserId
WHERE d.Kind='Attachment' AND t.Id IS NULL) THROW 51000,'Orphan attachment',1;
IF EXISTS(SELECT 1 FROM finance.Businesses b CROSS APPLY(SELECT COALESCE(SUM(t.Amount),0) AS settled FROM finance.Transactions t
WHERE t.BusinessId=b.Id AND t.UserId=b.UserId AND t.Status<>'Deleted'
AND (t.Type IN('LoanRepaymentReceived','LoanRepaymentPaid','ReimbursementReceived') OR b.Kind='Advance' AND t.Type IN('Expense','AssetLoss'))) s WHERE s.settled>b.Principal)
THROW 51000,'Business settlement exceeds principal',1;
-- Match contract balance to active principal, repayments and losses using the existing cash basis.
IF EXISTS(SELECT 1 FROM finance.Businesses b JOIN finance.Accounts a ON a.Id=b.ContractAccountId
CROSS APPLY(SELECT COALESCE(SUM(CASE
WHEN t.Type IN('LoanGiven','ReimbursementAdvance') THEN t.Amount
WHEN t.Type='LoanReceived' THEN -t.Amount
WHEN t.Type IN('LoanRepaymentReceived','ReimbursementReceived','AssetLoss') THEN -t.Amount
WHEN t.Type='LoanRepaymentPaid' THEN t.Amount
WHEN t.Type='Expense' THEN -t.Amount ELSE 0 END),0) AS expected
FROM finance.Transactions t WHERE t.BusinessId=b.Id AND t.UserId=b.UserId AND t.Status<>'Deleted'
AND (t.Type<>'Expense' OR b.Kind='Advance')) p
CROSS APPLY(SELECT COALESCE(SUM(e.Amount),0) AS actual FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId
WHERE e.AccountId=a.Id AND e.UserId=b.UserId AND t.Status<>'Deleted') q
WHERE a.UserId<>b.UserId OR a.Currency<>b.Currency OR a.OpeningBalance+q.actual<>p.expected)
THROW 51000,'Business contract balance mismatch',1;
IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id IN(SELECT object_id FROM sys.tables WHERE schema_id=SCHEMA_ID('finance'))
AND (is_disabled=1 OR is_not_trusted=1)) THROW 51000,'Disabled or untrusted constraint',1;
PRINT 'PF_INTEGRITY_PASSED';
