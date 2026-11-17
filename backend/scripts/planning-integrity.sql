-- Read-only checks, included in restored backup verification after Stage B migrations.
IF EXISTS(SELECT 1 FROM finance.RecurringRules r JOIN finance.Accounts a ON a.Id=r.AccountId WHERE r.UserId<>a.UserId OR r.Currency<>a.Currency)
THROW 51000,'Recurring account ownership/currency mismatch',1;
IF EXISTS(SELECT 1 FROM finance.RecurringRules WHERE ISJSON(PayloadJson)<>1 OR (TRY_CONVERT(decimal(28,2),Amount) IS NULL OR TRY_CONVERT(decimal(28,2),Amount)<=0))
THROW 51000,'Invalid recurring snapshot',1;
IF EXISTS(SELECT 1 FROM finance.RecurringOccurrences o JOIN finance.RecurringRules r ON r.Id=o.RuleId WHERE o.UserId<>r.UserId OR o.Currency<>r.Currency)
THROW 51000,'Occurrence ownership/currency mismatch',1;
IF EXISTS(SELECT 1 FROM finance.RecurringOccurrences WHERE ISJSON(PayloadJson)<>1 OR (PreparedPayloadJson IS NOT NULL AND ISJSON(PreparedPayloadJson)<>1)
OR (TRY_CONVERT(decimal(28,2),Amount) IS NULL OR TRY_CONVERT(decimal(28,2),Amount)<=0) OR (State IN('Posted','Revoked') AND TransactionId IS NULL) OR (State NOT IN('Posted','Revoked') AND TransactionId IS NOT NULL))
THROW 51000,'Invalid occurrence state/snapshot',1;
IF EXISTS(SELECT 1 FROM finance.RecurringOccurrences o JOIN finance.Transactions t ON t.Id=o.TransactionId WHERE o.UserId<>t.UserId OR o.Currency<>t.Currency OR (o.State='Posted' AND t.Status='Deleted') OR (o.State='Revoked' AND t.Status<>'Deleted'))
THROW 51000,'Occurrence posting state mismatch',1;
IF EXISTS(SELECT 1 FROM finance.Subscriptions s JOIN finance.RecurringRules r ON r.Id=s.RuleId WHERE s.UserId<>r.UserId)
THROW 51000,'Subscription ownership mismatch',1;
IF EXISTS(SELECT 1 FROM finance.SubscriptionPrices p JOIN finance.Subscriptions s ON s.Id=p.SubscriptionId JOIN finance.RecurringRules r ON r.Id=s.RuleId WHERE p.UserId<>s.UserId OR p.Currency<>r.Currency)
THROW 51000,'Subscription price ownership/currency mismatch',1;
IF EXISTS(SELECT 1 FROM finance.AutomationRules WHERE ISJSON(ConditionsJson)<>1 OR ISJSON(ActionsJson)<>1)
THROW 51000,'Invalid automation rule snapshot',1;
IF EXISTS(SELECT 1 FROM finance.AutomationExecutions e JOIN finance.AutomationRules r ON r.Id=e.RuleId LEFT JOIN finance.RecurringOccurrences o ON o.Id=e.OccurrenceId WHERE e.UserId<>r.UserId OR (o.Id IS NOT NULL AND e.UserId<>o.UserId))
THROW 51000,'Automation execution ownership mismatch',1;
IF EXISTS(SELECT 1 FROM finance.RecurringExecutions e JOIN finance.RecurringRules r ON r.Id=e.RuleId LEFT JOIN finance.RecurringOccurrences o ON o.Id=e.OccurrenceId WHERE e.UserId<>r.UserId OR (o.Id IS NOT NULL AND (e.UserId<>o.UserId OR e.RuleId<>o.RuleId)))
THROW 51000,'Recurring history ownership mismatch',1;
PRINT 'PF_PLANNING_INTEGRITY_PASSED';

