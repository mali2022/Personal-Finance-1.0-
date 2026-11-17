SET NOEXEC OFF;
USE master;
GO
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 RAISERROR(N'中止：PersonalFinance不存在，禁止在系统数据库执行模块。',16,1);
 SET NOEXEC ON;
END;
GO
USE PersonalFinance;
GO
IF DB_NAME()<>N'PersonalFinance'
BEGIN
 RAISERROR(N'中止：当前数据库不是PersonalFinance。',16,1);
 SET NOEXEC ON;
END;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
-- MODULE 10_SeedData
INSERT dbo.Currencies(CurrencyCode,CurrencyName,CurrencySymbol,DecimalPlaces)
VALUES('CNY',N'人民币',N'¥',2),('USD',N'美元',N'$',2),('HKD',N'港币',N'HK$',2),('JPY',N'日元',N'¥',0),('EUR',N'欧元',N'€',2);
INSERT dbo.Users(UserName,DisplayName,DefaultCurrencyId) SELECT N'demo',N'示例用户',CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY';
INSERT dbo.AccountTypes(AccountTypeCode,AccountTypeName,BalanceNature,IsLiquid,IsCreditCard) VALUES
('Cash',N'现金','Asset',1,0),('Bank',N'银行账户','Asset',1,0),('DebitCard',N'借记卡','Asset',1,0),
('CreditCard',N'信用卡','Liability',0,1),('Alipay',N'支付宝','Asset',1,0),('WeChat',N'微信支付','Asset',1,0),
('Wallet',N'数字钱包','Asset',1,0),('StoredValue',N'储值账户','Asset',0,0),('Investment',N'投资账户','Asset',0,0),
('Securities',N'证券账户','Asset',0,0),('Loan',N'借款账户','Liability',0,0),('Receivable',N'应收账户','Asset',0,0),
('Payable',N'应付账户','Liability',0,0),('OtherAsset',N'其他资产','Asset',0,0),('OtherLiability',N'其他负债','Liability',0,0);
INSERT dbo.TransactionTypes(TransactionTypeCode,TransactionTypeName) VALUES
('Expense',N'个人费用'),('Income',N'个人收入'),('Transfer',N'内部转账'),('Refund',N'消费退款'),
('CreditCardPayment',N'信用卡还款'),('LoanGiven',N'借出本金'),('LoanReceived',N'借入本金'),
('LoanRepaymentReceived',N'收回本金'),('LoanRepaymentPaid',N'偿还本金'),('ReimbursementAdvance',N'报销垫付'),
('ReimbursementReceived',N'报销到账'),('AssetLoss',N'资产损失'),('Adjustment',N'会计调整'),('OpeningBalance',N'期初余额');
INSERT dbo.TransactionTypes(TransactionTypeCode,TransactionTypeName) VALUES('Exchange',N'货币兑换');
INSERT dbo.Sources(SourceCode,SourceName) VALUES('Manual',N'手工'),('Alipay',N'支付宝'),('WeChat',N'微信'),
('BankImport',N'银行导入'),('CreditCardImport',N'信用卡导入'),('CSV',N'CSV'),('API',N'API'),('Other',N'其他');
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo'),@C BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY');
INSERT dbo.Categories(UserId,CategoryName,CategoryType,CategoryCode,CategoryLevel,IsConsumption,SortOrder)
SELECT @U,Name,'Expense',Code,1,Consumption,Sort FROM (VALUES
(N'餐饮食品','Food',1,1),(N'生鲜食材','Fresh',1,2),(N'粮油调味','Grocery',1,3),(N'居家生活','Household',1,4),
(N'交通出行','Transport',1,5),(N'购物消费','Shopping',1,6),(N'医疗健康','Health',1,7),(N'教育学习','Education',1,8),
(N'娱乐休闲','Entertainment',1,9),(N'社交人情','Social',1,10),(N'住房居住','Housing',1,11),(N'通讯网络','Communication',1,12),
(N'金融费用','Finance',1,13),(N'宠物','Pets',1,14),(N'旅行','Travel',1,15),(N'其他支出','OtherExpense',1,16),
(N'资产损失','AssetLoss',0,17)) x(Name,Code,Consumption,Sort);
INSERT dbo.Categories(UserId,CategoryName,CategoryType,CategoryCode,CategoryLevel,IsConsumption)
SELECT @U,Name,'Income',Code,1,0 FROM (VALUES(N'工资收入','Salary'),(N'奖金收入','Bonus'),(N'经营收入','Business'),
(N'投资收益','InvestmentIncome'),(N'利息收入','Interest'),(N'礼金红包','Gifts'),(N'其他收入','OtherIncome')) x(Name,Code);
INSERT dbo.Categories(UserId,ParentCategoryId,CategoryName,CategoryType,CategoryCode,CategoryLevel,ParentLevel,IsConsumption)
SELECT @U,p.CategoryId,x.Name,'Expense',x.Code,2,1,x.Consumption FROM (VALUES
('Food',N'日常午餐','Lunch',1),('Food',N'食品','FoodGoods',1),('Household',N'日用品','DailyGoods',1),
('Pets',N'宠物用品','PetGoods',1),('Shopping',N'普通购物','GeneralShopping',1),('OtherExpense',N'不明消费','Unknown',1),
('AssetLoss',N'现金遗失','CashLoss',0),('Finance',N'手续费','Fees',1),('Finance',N'借款利息','LoanInterest',1)) x(ParentCode,Name,Code,Consumption)
JOIN dbo.Categories p ON p.UserId=@U AND p.CategoryCode=x.ParentCode;
INSERT dbo.Accounts(UserId,AccountTypeId,AccountName,CurrencyId,OpeningDate,CreditLimit,BillingDay,PaymentDueDay)
SELECT @U,at.AccountTypeId,x.Name,@C,'2026-01-01',CASE WHEN x.Code='CreditCard' THEN 20000 END,
CASE WHEN x.Code='CreditCard' THEN 10 END,CASE WHEN x.Code='CreditCard' THEN 28 END
FROM (VALUES('Cash',N'现金'),('Alipay',N'支付宝'),('WeChat',N'微信支付'),('DebitCard',N'招商银行储蓄卡'),('CreditCard',N'信用卡'),
('Receivable',N'张三借款应收'),('Receivable',N'公司报销应收'),('Loan',N'个人借款应付')) x(Code,Name)
JOIN dbo.AccountTypes at ON at.AccountTypeCode=x.Code;
INSERT dbo.Counterparties(UserId,CounterpartyName,CounterpartyKind) VALUES(@U,N'张三','Person'),(@U,N'公司','Organization');
INSERT dbo.Loans(UserId,AccountId,CounterpartyId,Direction,StartDate)
SELECT @U,a.AccountId,c.CounterpartyId,'Given','2026-01-01' FROM dbo.Accounts a CROSS JOIN dbo.Counterparties c
WHERE a.UserId=@U AND a.AccountName=N'张三借款应收' AND c.UserId=@U AND c.CounterpartyName=N'张三';
INSERT dbo.Loans(UserId,AccountId,CounterpartyId,Direction,StartDate)
SELECT @U,a.AccountId,c.CounterpartyId,'Received','2026-01-01' FROM dbo.Accounts a CROSS JOIN dbo.Counterparties c
WHERE a.UserId=@U AND a.AccountName=N'个人借款应付' AND c.UserId=@U AND c.CounterpartyName=N'张三';
INSERT dbo.Reimbursements(UserId,AccountId,CounterpartyId,WorkflowStatus)
SELECT @U,a.AccountId,c.CounterpartyId,'Submitted' FROM dbo.Accounts a CROSS JOIN dbo.Counterparties c
WHERE a.UserId=@U AND a.AccountName=N'公司报销应收' AND c.UserId=@U AND c.CounterpartyName=N'公司';
INSERT dbo.Merchants(UserId,MerchantName) VALUES(@U,N'示例超市'),(@U,N'午餐店');
INSERT dbo.Tags(UserId,TagName) VALUES(@U,N'工作'),(@U,N'家庭'),(@U,N'旅游');
INSERT dbo.Projects(UserId,ProjectName,StartDate,CurrencyId,BudgetAmount) VALUES(@U,N'日本旅游','2026-10-01',@C,20000);
INSERT dbo.Budgets(UserId,BudgetPeriod,CurrencyId) VALUES(@U,'2026-10-01',@C);
INSERT dbo.BudgetItems(UserId,BudgetId,CategoryId,BudgetAmount)
SELECT @U,b.BudgetId,c.CategoryId,2000 FROM dbo.Budgets b CROSS JOIN dbo.Categories c WHERE b.UserId=@U AND c.UserId=@U AND c.CategoryCode='Food';
GO
