-- Read-only permanent data. Temp tables are session-local; no repairs or DB settings.
SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 10000;
CREATE TABLE #rules(Code varchar(40) PRIMARY KEY,Scope nvarchar(150),Samples bigint DEFAULT 0);
INSERT #rules(Code,Scope) VALUES
('01_account_ledger',N'余额镜像不存在：独立交易头资金变化与账户分录逐笔核对'),
('02_transfer',N'转账本金与手续费分离、本位币精确平衡'),
('03_credit_card',N'信用卡消费与还款有符号资金分录'),
('04_refund',N'原消费及分类可退金额含有效价格调整追回'),
('05_loan',N'借贷契约本金与归还、损失的专用账户余额'),
('06_reimbursement',N'报销应收与有效垫付、收回及放弃'),
('07_investment',N'投资交易现金、持仓历史、唯一现金来源'),
('08_term_deposit',N'定期专用本金账户唯一，关联本金/结算不再次过账'),
('09_prepayment',N'押金及预付核算模式与实际结算账户'),
('10_hold',N'冻结待到账剩余额及实际结算引用'),
('11_payroll',N'工资到账仅关联唯一实际收入'),
('12_social',N'缴费仅事实档案、个人缴费不超工资扣款'),
('13_authorization',N'授权只从唯一实际资金账户扣款'),
('14_advance',N'代付总支付=本人费用+应收，不重复消费'),
('15_cashback',N'返现到账及追回与实际交易一一对应'),
('16_currency',N'用户、账户原币和本位币分录平衡'),
('17_goal_reserve',N'目标预留仅档案，账户归属和金额合法');
CREATE TABLE #issues(Code varchar(40),ObjectId nvarchar(80),Evidence nvarchar(240));
SELECT e.TransactionId,e.AccountId,e.UserId,SUM(e.Amount) Amount,SUM(e.BaseAmount) BaseAmount
INTO #accountEntries FROM finance.Entries e WHERE e.Kind='Account' GROUP BY e.TransactionId,e.AccountId,e.UserId;
CREATE UNIQUE INDEX IX_AuditAccount ON #accountEntries(TransactionId,AccountId,UserId);
SELECT t.Id,t.UserId,t.AccountId,t.Type,t.Currency,t.Amount,t.Fee,t.ToAccountId,t.ReceivedAmount,t.BusinessId,
CASE WHEN t.Type IN('Income','Refund','LoanReceived','LoanRepaymentReceived','ReimbursementReceived') THEN t.Amount
WHEN t.Type IN('Transfer','CreditCardPayment') THEN -t.Amount-t.Fee
WHEN t.Type IN('Adjustment','InvestmentPrincipal') AND t.AdjustmentDirection='Increase' THEN t.Amount
ELSE -t.Amount END Expected
INTO #active FROM finance.Transactions t WHERE t.Status<>'Deleted';
INSERT #issues SELECT '01_account_ledger',t.Id,N'源账户分录与交易头资金方向/金额不符'
FROM #active t LEFT JOIN #accountEntries e ON e.TransactionId=t.Id AND e.AccountId=t.AccountId AND e.UserId=t.UserId
WHERE e.AccountId IS NULL OR e.Amount<>t.Expected;
INSERT #issues SELECT '01_account_ledger',Id,N'未定义交易类型，禁止静默推断'
FROM #active WHERE Type NOT IN('Income','Expense','Transfer','CreditCardPayment','Refund','LoanGiven','LoanReceived','LoanRepaymentReceived','LoanRepaymentPaid','ReimbursementAdvance','ReimbursementReceived','AssetLoss','Adjustment','InvestmentPrincipal','RewardReversal');
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM #active) WHERE Code='01_account_ledger';
INSERT #issues SELECT '02_transfer',t.Id,N'转入本金与账户分录不符或资金分录多于两个'
FROM #active t LEFT JOIN #accountEntries e ON e.TransactionId=t.Id AND e.AccountId=t.ToAccountId AND e.UserId=t.UserId
WHERE t.Type IN('Transfer','CreditCardPayment') AND (e.AccountId IS NULL OR e.Amount<>t.ReceivedAmount OR
(SELECT COUNT(*) FROM #accountEntries a WHERE a.TransactionId=t.Id)<>2);
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM #active WHERE Type='Transfer') WHERE Code='02_transfer';
INSERT #issues SELECT '03_credit_card',t.Id,N'还款目标不是同币种信用卡或源账户也是信用卡'
FROM #active t JOIN finance.Accounts a ON a.Id=t.AccountId LEFT JOIN finance.Accounts b ON b.Id=t.ToAccountId
WHERE t.Type='CreditCardPayment' AND (b.Type NOT IN('CreditCard','ConsumerCredit') OR b.Currency<>a.Currency OR a.Type IN('CreditCard','ConsumerCredit') OR b.Id IS NULL);
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM #active t JOIN finance.Accounts a ON a.Id=t.AccountId WHERE a.Type IN('CreditCard','ConsumerCredit') OR t.Type='CreditCardPayment') WHERE Code='03_credit_card';
SELECT b.TransactionId OriginalId,t.Id RecoveryId,t.Amount INTO #recoveries FROM finance.CashbackRecovery r
JOIN finance.CashbackReceivable b ON b.Id=r.CashbackId AND b.UserId=r.UserId
JOIN #active t ON t.Id=r.TransactionId AND t.UserId=r.UserId
WHERE r.State='Active' AND b.Treatment='PriceAdjustment';
INSERT #issues SELECT '04_refund',r.Id,N'退款原交易、用户或币种无效' FROM #active r
LEFT JOIN #active t ON t.Id=(SELECT OriginalTransactionId FROM finance.Transactions WHERE Id=r.Id) AND t.UserId=r.UserId
WHERE r.Type='Refund' AND (t.Id IS NULL OR t.Type<>'Expense' OR t.Currency<>r.Currency);
INSERT #issues SELECT '04_refund',o.Id,N'累计退款超过原消费加有效价格追回'
FROM #active o CROSS APPLY(SELECT COALESCE(SUM(r.Amount),0) Amount FROM finance.Transactions r WHERE r.OriginalTransactionId=o.Id AND r.UserId=o.UserId AND r.Type='Refund' AND r.Status<>'Deleted') refunds
CROSS APPLY(SELECT COALESCE(SUM(Amount),0) Amount FROM #recoveries r WHERE r.OriginalId=o.Id) recovered
WHERE o.Type='Expense' AND refunds.Amount>o.Amount+recovered.Amount;
SELECT e.TransactionId,e.CategoryId,SUM(e.Amount) Amount INTO #expenseCategories FROM finance.Entries e WHERE e.Kind='Expense' GROUP BY e.TransactionId,e.CategoryId;
INSERT #issues SELECT '04_refund',original.TransactionId,N'分类退款超过该原分类额度及追回'
FROM #expenseCategories original JOIN #active t ON t.Id=original.TransactionId AND t.Type='Expense'
CROSS APPLY(SELECT COALESCE(SUM(e.Amount),0) Amount FROM finance.Transactions r JOIN #expenseCategories e ON e.TransactionId=r.Id AND e.CategoryId=original.CategoryId WHERE r.OriginalTransactionId=t.Id AND r.Type='Refund' AND r.Status<>'Deleted') refunds
CROSS APPLY(SELECT COALESCE(SUM(e.Amount),0) Amount FROM #recoveries r JOIN #expenseCategories e ON e.TransactionId=r.RecoveryId AND e.CategoryId=original.CategoryId WHERE r.OriginalId=t.Id) recovered
WHERE original.Amount+refunds.Amount+recovered.Amount<0;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM #active WHERE Type='Refund') WHERE Code='04_refund';
SELECT b.Id,b.Kind,b.UserId,b.ContractAccountId,b.Currency,a.UserId AccountUser,a.Currency AccountCurrency,
a.OpeningBalance+COALESCE(actual.Amount,0) Actual,COALESCE(expected.Amount,0) Expected INTO #contracts
FROM finance.Businesses b LEFT JOIN finance.Accounts a ON a.Id=b.ContractAccountId
OUTER APPLY(SELECT SUM(e.Amount) Amount FROM #accountEntries e JOIN #active t ON t.Id=e.TransactionId WHERE e.AccountId=b.ContractAccountId AND e.UserId=b.UserId) actual
OUTER APPLY(SELECT SUM(CASE WHEN t.Type IN('LoanGiven','ReimbursementAdvance') THEN t.Amount WHEN t.Type='LoanReceived' THEN -t.Amount WHEN t.Type IN('LoanRepaymentReceived','ReimbursementReceived','AssetLoss','Expense') THEN -t.Amount WHEN t.Type='LoanRepaymentPaid' THEN t.Amount ELSE 0 END) Amount FROM #active t WHERE t.BusinessId=b.Id AND t.UserId=b.UserId AND (t.Type<>'Expense' OR b.Kind='Advance')) expected;
INSERT #issues SELECT CASE WHEN Kind IN('Lent','Borrowed') THEN '05_loan' ELSE '06_reimbursement' END,Id,N'契约余额与有效本金/结算不符或跨用户币种'
FROM #contracts WHERE Kind<>'Advance' AND (AccountUser IS NULL OR AccountUser<>UserId OR AccountCurrency<>Currency OR Actual<>Expected);
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM #contracts WHERE Kind IN('Lent','Borrowed')) WHERE Code='05_loan';
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM #contracts WHERE Kind='Reimbursement') WHERE Code='06_reimbursement';
INSERT #issues SELECT '07_investment',i.Id,N'投资资金流水净额/币种/用户不符或重复关联'
FROM finance.InvestmentTrade i JOIN finance.InvestmentAsset a ON a.Id=i.AssetId
LEFT JOIN #active t ON t.Id=i.TransactionId AND t.UserId=i.UserId
LEFT JOIN #accountEntries e ON e.TransactionId=t.Id AND e.AccountId=a.AccountId AND e.UserId=i.UserId
WHERE i.State='Active' AND i.Type NOT IN('PositionIncrease','PositionDecrease') AND
(t.Id IS NULL OR a.UserId<>i.UserId OR a.Currency<>t.Currency OR e.Amount IS NULL OR e.Amount<>
CASE WHEN i.Type='Buy' THEN -i.Amount-i.Commission-i.Tax-i.OtherFee WHEN i.Type IN('Sell','Dividend','Interest') THEN i.Amount-i.Commission-i.Tax-i.OtherFee ELSE -i.Amount END);
INSERT #issues SELECT '07_investment',TransactionId,N'同一资金流水被多个有效投资交易引用' FROM finance.InvestmentTrade WHERE State='Active' AND TransactionId IS NOT NULL GROUP BY TransactionId HAVING COUNT(*)>1;
INSERT #issues SELECT '07_investment',Id,N'历史交易日期产生负持仓' FROM
(SELECT Id,SUM(CASE WHEN Type IN('Buy','PositionIncrease') THEN Quantity WHEN Type IN('Sell','PositionDecrease') THEN -Quantity ELSE 0 END) OVER(PARTITION BY AssetId ORDER BY Date,CreatedAt,Id ROWS UNBOUNDED PRECEDING) Quantity FROM finance.InvestmentTrade WHERE State='Active') p WHERE Quantity<0;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.InvestmentTrade WHERE State='Active') WHERE Code='07_investment';
INSERT #issues SELECT '08_term_deposit',m.Id,N'定期账户/原本金引用无效或到账本金不等于登记成本'
FROM finance.ManagedAsset m LEFT JOIN finance.Accounts a ON a.Id=m.AccountId AND a.UserId=m.UserId
LEFT JOIN #active t ON t.Id=m.FundingTransactionId AND t.UserId=m.UserId
WHERE m.Type='TermDeposit' AND (a.Id IS NULL OR a.Currency<>m.Currency OR a.Type<>'Bank' OR m.FundingTransactionId IS NOT NULL AND (t.Id IS NULL OR t.Type<>'Transfer' OR t.ToAccountId<>m.AccountId OR t.ReceivedAmount<>m.Cost));
INSERT #issues SELECT '08_term_deposit',AccountId,N'同一账户存在多个有效定期本金权威档案' FROM finance.ManagedAsset WHERE Type='TermDeposit' AND State='Active' GROUP BY AccountId HAVING COUNT(*)>1;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.ManagedAsset WHERE Type='TermDeposit') WHERE Code='08_term_deposit';
INSERT #issues SELECT '09_prepayment',p.Id,N'预付本金剩余非法或资金来源不存在'
FROM finance.PrepaymentContract p LEFT JOIN #active t ON t.Id=p.FundingTransactionId AND t.UserId=p.UserId
WHERE t.Id IS NULL OR p.Amount-p.ConsumedAmount-p.RefundedAmount-p.WrittenOffAmount<0 OR p.Currency<>t.Currency;
INSERT #issues SELECT '09_prepayment',p.Id,N'资产模式专用账户余额与合同剩余不符'
FROM finance.PrepaymentContract p LEFT JOIN finance.Accounts a ON a.Id=p.AssetAccountId AND a.UserId=p.UserId
OUTER APPLY(SELECT SUM(e.Amount) Amount FROM #accountEntries e JOIN #active t ON t.Id=e.TransactionId WHERE e.AccountId=p.AssetAccountId AND e.UserId=p.UserId) b
WHERE p.AccountingMode='AssetAccount' AND (a.Id IS NULL OR a.Currency<>p.Currency OR a.OpeningBalance+COALESCE(b.Amount,0)<>p.Amount-p.ConsumedAmount-p.RefundedAmount-p.WrittenOffAmount);
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.PrepaymentContract) WHERE Code='09_prepayment';
INSERT #issues SELECT '09_prepayment',p.Id,N'预付款累计结算与未被更正的原事件不一致'
FROM finance.PrepaymentContract p OUTER APPLY(SELECT
SUM(CASE WHEN e.Action='Consume' THEN e.Amount ELSE 0 END) consumed,
SUM(CASE WHEN e.Action='Refund' THEN e.Amount ELSE 0 END) refunded,
SUM(CASE WHEN e.Action='WriteOff' THEN e.Amount ELSE 0 END) writtenOff
FROM finance.PrepaymentSettlement e WHERE e.ContractId=p.Id AND e.UserId=p.UserId AND e.ReversalOfId IS NULL
AND NOT EXISTS(SELECT 1 FROM finance.PrepaymentSettlement reversed WHERE reversed.ReversalOfId=e.Id)) history
WHERE p.ConsumedAmount<>COALESCE(history.consumed,0) OR p.RefundedAmount<>COALESCE(history.refunded,0) OR p.WrittenOffAmount<>COALESCE(history.writtenOff,0);
INSERT #issues SELECT '10_hold',h.Id,N'冻结档案剩额非法或账户币种归属错误'
FROM finance.AccountFundHold h LEFT JOIN finance.Accounts a ON a.Id=h.AccountId AND a.UserId=h.UserId
WHERE a.Id IS NULL OR a.Currency<>h.Currency OR h.Amount<h.SettledAmount+h.ReleasedAmount OR h.SettledAmount<0 OR h.ReleasedAmount<0;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.AccountFundHold) WHERE Code='10_hold';
INSERT #issues SELECT '10_hold',h.Id,N'冻结累计释放/结算与未被更正的原事件不一致'
FROM finance.AccountFundHold h OUTER APPLY(SELECT
SUM(CASE WHEN e.Action='Release' THEN e.Amount ELSE 0 END) released,
SUM(CASE WHEN e.Action='Settle' THEN e.Amount ELSE 0 END) settled
FROM finance.FundHoldEvent e WHERE e.HoldId=h.Id AND e.UserId=h.UserId AND e.ReversalOfId IS NULL
AND NOT EXISTS(SELECT 1 FROM finance.FundHoldEvent reversed WHERE reversed.ReversalOfId=e.Id)) history
WHERE h.ReleasedAmount<>COALESCE(history.released,0) OR h.SettledAmount<>COALESCE(history.settled,0);
INSERT #issues SELECT '11_payroll',p.Id,N'工资到账链接非有效同用户同币种收入'
FROM finance.PayrollPayment p LEFT JOIN finance.PayrollStatement s ON s.Id=p.PayrollId AND s.UserId=p.UserId
LEFT JOIN #active t ON t.Id=p.TransactionId AND t.UserId=p.UserId WHERE s.Id IS NULL OR t.Id IS NULL OR t.Type<>'Income' OR t.Currency<>s.Currency;
INSERT #issues SELECT '11_payroll',TransactionId,N'工资到账收入被重复链接' FROM finance.PayrollPayment GROUP BY TransactionId HAVING COUNT(*)>1;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.PayrollPayment) WHERE Code='11_payroll';
INSERT #issues SELECT '12_social',r.Id,N'缴费工资扣款引用、用户或币种不符'
FROM finance.SocialContributionRecord r LEFT JOIN finance.PayrollComponent c ON c.Id=r.PayrollComponentId AND c.UserId=r.UserId
LEFT JOIN finance.PayrollStatement p ON p.Id=c.PayrollId AND p.UserId=r.UserId
WHERE r.PayrollComponentId IS NOT NULL AND (c.Id IS NULL OR c.Kind<>'Deduction' OR c.PayrollId<>r.PayrollId OR p.Currency<>r.Currency);
INSERT #issues SELECT '12_social',c.Id,N'有效个人缴费合计超过工资扣款项目' FROM finance.PayrollComponent c
JOIN finance.SocialContributionRecord r ON r.PayrollComponentId=c.Id AND r.UserId=c.UserId AND r.State<>'Cancelled'
GROUP BY c.Id,c.Amount HAVING SUM(r.PersonalAmount)>c.Amount;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.SocialContributionRecord) WHERE Code='12_social';
INSERT #issues SELECT '13_authorization',p.Id,N'授权资金账户与实际交易或付款工具不符'
FROM finance.AuthorizedPayment p LEFT JOIN finance.Transactions t ON t.Id=p.TransactionId AND t.UserId=p.UserId
LEFT JOIN finance.PaymentInstrument i ON i.Id=p.InstrumentId AND i.UserId=p.UserId
WHERE t.Id IS NULL OR i.Id IS NULL OR p.AccountId<>t.AccountId OR i.AccountId<>p.AccountId;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.AuthorizedPayment) WHERE Code='13_authorization';
INSERT #issues SELECT '14_advance',a.Id,N'代付本人费用及应收本金拆分/实际资金来源不符'
FROM finance.ThirdPartyAdvance a LEFT JOIN finance.Businesses b ON b.Id=a.BusinessId AND b.UserId=a.UserId
LEFT JOIN finance.Transactions t ON t.Id=a.OwnTransactionId AND t.UserId=a.UserId
WHERE a.OwnAmount<0 OR a.OwnAmount>a.Amount OR a.Amount-a.OwnAmount>0 AND (b.Id IS NULL OR b.Kind<>'Advance' OR b.Principal<>a.Amount-a.OwnAmount OR b.Currency<>a.Currency OR b.AccountId<>a.AccountId)
OR a.OwnAmount>0 AND (t.Id IS NULL OR t.Type<>'Expense' OR t.Amount<>a.OwnAmount OR t.AccountId<>a.AccountId);
INSERT #issues SELECT '14_advance',Id,N'代付应收余额与有效结算/转赠/损失不符' FROM #contracts WHERE Kind='Advance' AND Actual<>Expected;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.ThirdPartyAdvance) WHERE Code='14_advance';
INSERT #issues SELECT '15_cashback',b.Id,N'返现到账金额、统计类型或原消费引用不符'
FROM finance.CashbackReceivable b LEFT JOIN #active t ON t.Id=b.SettlementTransactionId AND t.UserId=b.UserId
LEFT JOIN finance.Transactions original ON original.Id=b.TransactionId AND original.UserId=b.UserId
WHERE b.State='Settled' AND (t.Id IS NULL OR original.Id IS NULL OR t.Currency<>b.Currency OR t.Amount<>b.Amount OR b.Treatment='PriceAdjustment' AND (t.Type<>'Refund' OR (SELECT OriginalTransactionId FROM finance.Transactions WHERE Id=t.Id)<>b.TransactionId) OR b.Treatment='RewardIncome' AND t.Type<>'Income');
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.CashbackReceivable) WHERE Code='15_cashback';
INSERT #issues SELECT '15_cashback',b.Id,N'返现累计追回与有效实际资金事件不符'
FROM finance.CashbackReceivable b OUTER APPLY(SELECT SUM(r.Amount) Amount FROM finance.CashbackRecovery r JOIN #active t ON t.Id=r.TransactionId AND t.UserId=r.UserId WHERE r.CashbackId=b.Id AND r.UserId=b.UserId AND r.State='Active') recovered
WHERE b.RecoveredAmount<>COALESCE(recovered.Amount,0) OR b.RecoveredAmount>b.Amount;
INSERT #issues SELECT '16_currency',e.Id,N'分录用户或原币账户归属不符'
FROM finance.Entries e JOIN finance.Transactions t ON t.Id=e.TransactionId LEFT JOIN finance.Accounts a ON a.Id=e.AccountId
WHERE e.UserId<>t.UserId OR e.Kind='Account' AND (a.Id IS NULL OR a.UserId<>e.UserId OR a.Currency<>e.Currency);
INSERT #issues SELECT '16_currency',TransactionId,N'本位币分录不平衡' FROM finance.Entries GROUP BY TransactionId HAVING SUM(BaseAmount)<>0;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.Entries) WHERE Code='16_currency';
INSERT #issues SELECT '17_goal_reserve',g.Id,N'目标预留跨账户用户币种或金额非法'
FROM finance.GoalAllocation g LEFT JOIN finance.SavingsGoal s ON s.Id=g.GoalId AND s.UserId=g.UserId
LEFT JOIN finance.Accounts a ON a.Id=g.AccountId AND a.UserId=g.UserId WHERE s.Id IS NULL OR a.Id IS NULL OR a.Currency<>s.Currency OR g.Amount<0;
UPDATE #rules SET Samples=(SELECT COUNT_BIG(*) FROM finance.GoalAllocation) WHERE Code='17_goal_reserve';
PRINT 'PF_JSON_BEGIN';
SELECT DB_NAME() databaseName,JSON_QUERY((SELECT r.Code code,r.Scope scope,r.Samples samples,(SELECT COUNT_BIG(*) FROM #issues i WHERE i.Code=r.Code) violations FROM #rules r ORDER BY r.Code FOR JSON PATH)) rules,
JSON_QUERY(COALESCE((SELECT DISTINCT Code code,ObjectId objectId,Evidence evidence FROM #issues ORDER BY Code,ObjectId FOR JSON PATH),'[]')) findings,
CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM #issues) THEN 0 ELSE 1 END) passed
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
PRINT 'PF_JSON_END';
