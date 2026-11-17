# 模型字段、键、索引与关系参考

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：模型字段、键、索引与关系参考。

来源：[backend/src/PersonalFinance.Api/Infrastructure/Migrations/FinanceDbModelSnapshot.cs](<../../backend/src/PersonalFinance.Api/Infrastructure/Migrations/FinanceDbModelSnapshot.cs>)。这是源码模型，不是实测数据库结构。关系配置重复块保留。

## PersonalFinance.Api.Domain.Account

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountCode|string|nvarchar(200)|
|Alias|string|nvarchar(200)|
|ArchivedAt|DateTimeOffset?|datetimeoffset|
|BankBranch|string|nvarchar(200)|
|BillingMode|string|nvarchar(max)|
|CardAlias|string|nvarchar(200)|
|CardBrand|string|nvarchar(200)|
|CardHolderName|string|nvarchar(200)|
|CardLastFour|string|nvarchar(4)|
|CardNumber|string|nvarchar(30)|
|ClosedAt|DateOnly?|date|
|ContractNumber|string|nvarchar(200)|
|CreatedAt|DateTimeOffset?|datetimeoffset|
|CreditLimit|decimal?|decimal(28,4)|
|Currency|string|nvarchar(3)|
|Description|string|nvarchar(2000)|
|GroupId|string|nvarchar(36)|
|Institution|string|nvarchar(max)|
|IsDefaultExpense|bool|bit|
|IsDefaultIncome|bool|bit|
|IsPinned|bool|bit|
|LoanPurpose|string|nvarchar(200)|
|Name|string|nvarchar(150)|
|OpenedAt|DateOnly?|date|
|OpeningBalance|decimal|decimal(28,4)|
|PaymentDay|int?|int|
|SortOrder|int|int|
|StatementDay|int?|int|
|Status|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("GroupId");
b.HasIndex("UserId", "IsDefaultExpense") .IsUnique() .HasDatabaseName("UX_Account_DefaultExpense") .HasFilter("[IsDefaultExpense]=1");
b.HasIndex("UserId", "IsDefaultIncome") .IsUnique() .HasDatabaseName("UX_Account_DefaultIncome") .HasFilter("[IsDefaultIncome]=1");
b.HasIndex("UserId", "Name") .IsUnique();
b.HasIndex("UserId", "GroupId", "IsPinned", "SortOrder");
b.ToTable("Accounts", "finance", t => { t.HasCheckConstraint("CK_Account_CardNumber", "[CardNumber] IS NULL OR ([Type] IN ('Bank','CreditCard') AND LEN([CardNumber]) BETWEEN 5 AND 30 AND [CardNumber] NOT LIKE '%[^0-9]%' AND [CardLastFour] IS NOT NULL AND RIGHT([CardNumber],4)=[CardLastFour])");
```

## PersonalFinance.Api.Domain.AccountFundHold

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|IncludedInBookBalance|bool|bit|
|Note|string|nvarchar(2000)|
|ReducesAvailable|bool|bit|
|ReleasedAmount|decimal|decimal(28,4)|
|SettledAmount|decimal|decimal(28,4)|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "AccountId", "State");
b.ToTable("AccountFundHold", "finance", t => { t.HasCheckConstraint("CK_AccountFundHold", "[Amount]>0 AND [ReleasedAmount]>=0 AND [SettledAmount]>=0 AND [ReleasedAmount]+[SettledAmount]<=[Amount] AND [Version]>0 AND [State] IN ('Draft','Confirmed','Released','Settled','Expired','Revoked') AND [Type] IN ('AuthorizationHold','AccountRestriction','PendingDebit','PendingCredit','SettlementPending')");
```

## PersonalFinance.Api.Domain.AccountGroup

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Name|string|nvarchar(100)|
|SortOrder|int|int|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Name") .IsUnique();
b.ToTable("AccountGroup", "finance");
```

## PersonalFinance.Api.Domain.AdvanceAdjustment

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(max)|
|AdvanceId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Reason|string|nvarchar(2000)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AdvanceId");
b.HasIndex("TransactionId") .IsUnique();
b.HasIndex("UserId");
b.ToTable("AdvanceAdjustment", "finance");
```

## PersonalFinance.Api.Domain.AdvancePurchasePlan

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|AdvanceId|string|nvarchar(36)|
|CancellationReason|string|nvarchar(2000)|
|Counterparty|string|nvarchar(200)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Name|string|nvarchar(200)|
|Note|string|nvarchar(2000)|
|PlannedAmount|decimal|decimal(28,4)|
|PlannedOwnAmount|decimal|decimal(28,4)|
|Quantity|decimal|decimal(28,8)|
|State|string|nvarchar(40)|
|Unit|string|nvarchar(30)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("AdvanceId") .IsUnique() .HasFilter("[AdvanceId] IS NOT NULL");
b.HasIndex("UserId");
b.ToTable("AdvancePurchasePlan", "finance", t => { t.HasCheckConstraint("CK_AdvancePurchasePlan", "[PlannedAmount]>0 AND [PlannedOwnAmount]>=0 AND [PlannedOwnAmount]<=[PlannedAmount] AND [Quantity]>0 AND [Version]>0");
```

## PersonalFinance.Api.Domain.AiAgentEvent

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Detail|string|nvarchar(max)|
|Kind|string|nvarchar(40)|
|StepId|string|nvarchar(36)|
|TaskId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "CreatedAt");
b.ToTable("AiAgentEvent", "finance");
```

## PersonalFinance.Api.Domain.AiAgentGrant

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountIdsJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ExpiresAt|DateTimeOffset?|datetimeoffset|
|HighRisk|bool|bit|
|MaxAffectedRecords|int|int|
|PlanHash|string|nvarchar(max)|
|RevokedAt|DateTimeOffset?|datetimeoffset|
|TaskId|string|nvarchar(36)|
|Tool|string|nvarchar(100)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Tool");
b.ToTable("AiAgentGrant", "finance");
```

## PersonalFinance.Api.Domain.AiAgentMemory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountIdsJson|string|nvarchar(max)|
|Content|string|nvarchar(max)|
|Enabled|bool|bit|
|ExpiresAt|DateTimeOffset?|datetimeoffset|
|Title|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Enabled");
b.ToTable("AiAgentMemory", "finance");
```

## PersonalFinance.Api.Domain.AiAgentReport

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Assumptions|string|nvarchar(max)|
|Content|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|SourcesJson|string|nvarchar(max)|
|TaskId|string|nvarchar(36)|
|Title|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "CreatedAt");
b.ToTable("AiAgentReport", "finance");
```

## PersonalFinance.Api.Domain.AiAgentSetting

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ConfigurationJson|string|nvarchar(max)|
|EmergencyStopped|bool|bit|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId") .IsUnique();
b.ToTable("AiAgentSetting", "finance");
```

## PersonalFinance.Api.Domain.AiAgentStep

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ApprovedHash|string|nvarchar(max)|
|ArgumentsJson|string|nvarchar(max)|
|CallId|string|nvarchar(150)|
|CompletedAt|DateTimeOffset?|datetimeoffset|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ErrorCode|string|nvarchar(max)|
|HighRisk|bool|bit|
|PlanHash|string|nvarchar(max)|
|PreviewJson|string|nvarchar(max)|
|ResultJson|string|nvarchar(max)|
|Sequence|int|int|
|State|string|nvarchar(40)|
|TaskId|string|nvarchar(36)|
|Tool|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.HasIndex("TaskId", "CallId") .IsUnique();
b.HasIndex("TaskId", "Sequence") .IsUnique();
b.ToTable("AiAgentStep", "finance");
```

## PersonalFinance.Api.Domain.AiAgentTask

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountIdsJson|string|nvarchar(max)|
|ActiveMilliseconds|long|bigint|
|Answer|string|nvarchar(max)|
|CancelRequested|bool|bit|
|CompletedAt|DateTimeOffset?|datetimeoffset|
|ConfigurationJson|string|nvarchar(max)|
|ConversationId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ErrorCode|string|nvarchar(max)|
|LeaseOwner|string|nvarchar(36)|
|LeaseUntil|DateTimeOffset?|datetimeoffset|
|MessagesJson|string|nvarchar(max)|
|Mode|string|nvarchar(max)|
|ModelCalls|int|int|
|Prompt|string|nvarchar(max)|
|RecoveryAttempts|int|int|
|SourcesJson|string|nvarchar(max)|
|State|string|nvarchar(40)|
|TokensUsed|long|bigint|
|ToolCalls|int|int|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|
|WorkflowId|string|nvarchar(36)|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "CreatedAt");
b.HasIndex("State", "LeaseUntil", "CreatedAt");
b.ToTable("AiAgentTask", "finance");
```

## PersonalFinance.Api.Domain.AiAgentWorkflow

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountIdsJson|string|nvarchar(max)|
|Enabled|bool|bit|
|IntervalMinutes|int?|int|
|Name|string|nvarchar(max)|
|NextRunAt|DateTimeOffset?|datetimeoffset|
|Prompt|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.HasIndex("Enabled", "NextRunAt");
b.ToTable("AiAgentWorkflow", "finance");
```

## PersonalFinance.Api.Domain.AiConfigurationSnapshot

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(64)|
|ConfigurationJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|

```csharp
b.HasKey("Id");
b.ToTable("AiConfigurationSnapshot", "finance");
```

## PersonalFinance.Api.Domain.AiConversation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountScopeJson|string|nvarchar(max)|
|Archived|bool|bit|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ExpiresAt|DateTimeOffset|datetimeoffset|
|Kind|string|nvarchar(40)|
|Title|string|nvarchar(120)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ExpiresAt");
b.HasIndex("UserId", "Archived", "UpdatedAt");
b.ToTable("AiConversation", "finance");
```

## PersonalFinance.Api.Domain.AiMessage

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AnalysisJson|string|nvarchar(max)|
|Answer|string|nvarchar(max)|
|ConversationId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Feedback|int|int|
|FinancialDataVerified|bool|bit|
|Model|string|nvarchar(max)|
|Question|string|nvarchar(max)|
|RequestId|string|nvarchar(36)|
|SourcesJson|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ConversationId");
b.HasIndex("RequestId") .IsUnique();
b.HasIndex("UserId", "ConversationId", "CreatedAt", "Id");
b.ToTable("AiMessage", "finance", t => { t.HasCheckConstraint("CK_AiMessage_Feedback", "[Feedback] BETWEEN -1 AND 1");
```

## PersonalFinance.Api.Domain.AiPrivacySetting

|字段|CLR类型|SQL类型|
|---|---|---|
|UserId|string|nvarchar(36)|
|AllowDetails|bool|bit|
|AllowFamily|bool|bit|
|AllowPayroll|bool|bit|
|AllowRecognitionText|bool|bit|
|AllowSummary|bool|bit|
|ConsentVersion|long|bigint|
|Enabled|bool|bit|
|FullFinancialAccess|bool|bit|
|PersonalReadAccess|bool|bit|
|SaveHistory|bool|bit|
|UpdatedAt|DateTimeOffset|datetimeoffset|

```csharp
b.HasKey("UserId");
b.ToTable("AiPrivacySetting", "finance");
```

## PersonalFinance.Api.Domain.AiRequestAudit

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountScopeJson|string|nvarchar(max)|
|CompletedAt|DateTimeOffset?|datetimeoffset|
|ConfigurationVersion|string|nvarchar(64)|
|ConsentVersion|long?|bigint|
|ErrorCode|string|nvarchar(100)|
|LedgerId|string|nvarchar(64)|
|StartedAt|DateTimeOffset|datetimeoffset|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "StartedAt");
b.ToTable("AiRequestAudit", "finance");
```

## PersonalFinance.Api.Domain.AiToolAudit

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountScopeJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|DurationMs|long?|bigint|
|End|string|nvarchar(max)|
|ErrorCode|string|nvarchar(100)|
|RequestId|string|nvarchar(36)|
|Start|string|nvarchar(max)|
|Succeeded|bool|bit|
|Tool|string|nvarchar(100)|
|UserId|string|nvarchar(36)|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "CreatedAt");
b.ToTable("AiToolAudit", "finance");
```

## PersonalFinance.Api.Domain.AiTransactionDraft

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|RequestId|string|nvarchar(36)|
|ResultJson|string|nvarchar(max)|
|Source|string|nvarchar(max)|
|SourceHash|string|nvarchar(64)|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.HasIndex("UserId", "State", "CreatedAt");
b.ToTable("AiTransactionDraft", "finance", t => { t.HasCheckConstraint("CK_AiDraft_State", "[State] IN ('Draft','Confirmed','Deleted')");
```

## PersonalFinance.Api.Domain.AiUsageRecord

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Attempt|int|int|
|CachedInputTokens|int?|int|
|ConfigurationVersion|string|nvarchar(64)|
|ErrorCode|string|nvarchar(100)|
|EstimatedCost|decimal?|decimal(20,10)|
|Feature|string|nvarchar(40)|
|InputTokens|int?|int|
|Model|string|nvarchar(100)|
|OutputTokens|int?|int|
|PriceCurrency|string|nvarchar(max)|
|PriceEffectiveDate|string|nvarchar(max)|
|RequestId|string|nvarchar(36)|
|RequestedAt|DateTimeOffset|datetimeoffset|
|ReservedCost|decimal?|decimal(20,10)|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "RequestedAt");
b.ToTable("AiUsageRecord", "finance");
```

## PersonalFinance.Api.Domain.AnnualBudget

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|State|string|nvarchar(40)|
|Total|decimal|decimal(28,4)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|
|Year|int|int|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Year") .IsUnique();
b.ToTable("AnnualBudget", "finance", t => { t.HasCheckConstraint("CK_AnnualBudget_Values", "[Total]>=0 AND [Year] BETWEEN 1900 AND 9998 AND [Currency]='CNY' AND [Version]>0");
```

## PersonalFinance.Api.Domain.AnnualBudgetAllocation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|AnnualBudgetId|string|nvarchar(36)|
|CategoryId|string|nvarchar(36)|
|Month|int|int|

```csharp
b.HasKey("Id");
b.HasIndex("CategoryId");
b.HasIndex("AnnualBudgetId", "Month", "CategoryId") .IsUnique();
b.ToTable("AnnualBudgetAllocation", "finance", t => { t.HasCheckConstraint("CK_AnnualAllocation_Values", "[Amount]>=0 AND [Month] BETWEEN 0 AND 12 AND ([Month]>0 OR [CategoryId] IS NOT NULL)");
```

## PersonalFinance.Api.Domain.AppUser

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AvatarPng|byte[]|varbinary(max)|
|AvatarUpdatedAt|DateTimeOffset?|datetimeoffset|
|Bio|string|nvarchar(1000)|
|Birthday|DateOnly?|date|
|City|string|nvarchar(100)|
|Country|string|nvarchar(100)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|DisplayName|string|nvarchar(max)|
|Email|string|nvarchar(256)|
|Gender|string|nvarchar(20)|
|IsAdmin|bool|bit|
|Language|string|nvarchar(10)|
|Occupation|string|nvarchar(100)|
|PasswordHash|string|nvarchar(max)|
|Phone|string|nvarchar(100)|
|PreferredCurrency|string|nvarchar(3)|
|ProfileVersion|long|bigint|
|RealName|string|nvarchar(100)|
|Region|string|nvarchar(100)|
|TimeZone|string|nvarchar(100)|

```csharp
b.HasKey("Id");
b.HasIndex("Email") .IsUnique();
b.ToTable("Users", "finance");
```

## PersonalFinance.Api.Domain.AssetAggregationPolicy

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Mode|string|nvarchar(max)|
|Reason|string|nvarchar(2000)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "AccountId") .IsUnique();
b.ToTable("AssetAggregationPolicy", "finance", t => { t.HasCheckConstraint("CK_AggregationPolicy", "[Mode] IN ('Unknown','CashOnly','TotalAssets') AND [Version]>0");
```

## PersonalFinance.Api.Domain.AuditRecord

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(20)|
|ChangesJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|OperationKey|string|nvarchar(200)|
|ResourceId|string|nvarchar(36)|
|ResourceType|string|nvarchar(80)|
|Source|string|nvarchar(20)|
|TraceId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "ResourceId", "CreatedAt");
b.HasIndex("UserId", "TransactionId", "CreatedAt");
b.ToTable("AuditRecords", "finance");
```

## PersonalFinance.Api.Domain.AuthorizedPayment

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Authorizer|string|nvarchar(150)|
|ChargedAmount|decimal?|decimal(28,4)|
|Consumer|string|nvarchar(150)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|InstrumentId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("InstrumentId");
b.HasIndex("TransactionId") .IsUnique();
b.HasIndex("UserId", "InstrumentId");
b.ToTable("AuthorizedPayment", "finance");
```

## PersonalFinance.Api.Domain.AutomationExecution

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ChangedFieldsJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|OccurrenceId|string|nvarchar(36)|
|OperationKey|string|nvarchar(150)|
|RuleId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("OccurrenceId");
b.HasIndex("RuleId");
b.HasIndex("UserId", "CreatedAt");
b.ToTable("AutomationExecutions", "finance");
```

## PersonalFinance.Api.Domain.AutomationRule

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ActionsJson|string|nvarchar(max)|
|ConditionsJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|HitCount|long|bigint|
|Name|string|nvarchar(150)|
|PreviewOnly|bool|bit|
|Priority|int|int|
|State|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "State", "Priority", "Id");
b.ToTable("AutomationRules", "finance");
```

## PersonalFinance.Api.Domain.Budget

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Month|string|nvarchar(7)|
|Total|decimal|decimal(28,4)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Month") .IsUnique();
b.ToTable("Budgets", "finance", t => { t.HasCheckConstraint("CK_Budget_Total", "[Total] >= 0");
```

## PersonalFinance.Api.Domain.BudgetAlertSetting

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Enabled|bool|bit|
|Silent|bool|bit|
|ThresholdsJson|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId") .IsUnique();
b.ToTable("BudgetAlertSetting", "finance");
```

## PersonalFinance.Api.Domain.BudgetAlertState

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BudgetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Dismissed|bool|bit|
|EffectiveBudget|decimal|decimal(28,4)|
|Month|string|nvarchar(max)|
|Silent|bool|bit|
|Threshold|int|int|
|Used|decimal|decimal(28,4)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "BudgetId", "Threshold") .IsUnique();
b.ToTable("BudgetAlertState", "finance");
```

## PersonalFinance.Api.Domain.BudgetCarryover

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Cap|decimal?|decimal(28,4)|
|CarryOverspend|bool|bit|
|CategoryId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Parameter|decimal|decimal(28,4)|
|Reason|string|nvarchar(max)|
|Rule|string|nvarchar(max)|
|SourceFingerprint|string|nvarchar(64)|
|SourceMonth|string|nvarchar(7)|
|State|string|nvarchar(40)|
|TargetMonth|string|nvarchar(7)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("CategoryId");
b.HasIndex("UserId", "SourceMonth", "TargetMonth", "CategoryId") .IsUnique();
b.ToTable("BudgetCarryover", "finance");
```

## PersonalFinance.Api.Domain.BudgetChangeHistory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AfterJson|string|nvarchar(max)|
|AfterVersion|long|bigint|
|BeforeJson|string|nvarchar(max)|
|BeforeVersion|long|bigint|
|BudgetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Reason|string|nvarchar(2000)|
|Source|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "BudgetId", "CreatedAt");
b.ToTable("BudgetChangeHistory", "finance");
```

## PersonalFinance.Api.Domain.BudgetLine

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BudgetId|string|nvarchar(36)|
|CategoryId|string|nvarchar(36)|
|Limit|decimal|decimal(28,4)|

```csharp
b.HasKey("Id");
b.HasIndex("BudgetId");
b.ToTable("BudgetLine", "finance", t => { t.HasCheckConstraint("CK_BudgetLine_Limit", "[Limit] >= 0");
```

## PersonalFinance.Api.Domain.BudgetTemplate

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BudgetJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Name|string|nvarchar(150)|
|State|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Name") .IsUnique();
b.ToTable("BudgetTemplate", "finance");
```

## PersonalFinance.Api.Domain.Business

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|ContractAccountId|string|nvarchar(36)|
|Counterparty|string|nvarchar(max)|
|Currency|string|nvarchar(3)|
|Kind|string|nvarchar(40)|
|Note|string|nvarchar(max)|
|OccurredAt|DateTimeOffset|datetimeoffset|
|Principal|decimal|decimal(28,4)|
|Status|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("Businesses", "finance", t => { t.HasCheckConstraint("CK_Business_Principal", "[Principal] > 0");
```

## PersonalFinance.Api.Domain.CashFlowScenario

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ChangesJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(max)|
|State|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "State", "Id");
b.ToTable("CashFlowScenario", "finance");
```

## PersonalFinance.Api.Domain.CashbackReceivable

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Currency|string|nvarchar(3)|
|ExpiresAt|DateTimeOffset?|datetimeoffset|
|RecoveredAmount|decimal|decimal(28,4)|
|SettlementTransactionId|string|nvarchar(36)|
|Source|string|nvarchar(max)|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|Treatment|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("SettlementTransactionId") .IsUnique() .HasFilter("[SettlementTransactionId] IS NOT NULL");
b.HasIndex("TransactionId");
b.HasIndex("UserId");
b.ToTable("CashbackReceivable", "finance", t => { t.HasCheckConstraint("CK_CashbackRecoveredAmount", "[RecoveredAmount]>=0 AND [RecoveredAmount]<=[Amount]");
```

## PersonalFinance.Api.Domain.CashbackRecovery

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|CashbackId|string|nvarchar(36)|
|Reason|string|nvarchar(max)|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("CashbackId");
b.HasIndex("TransactionId") .IsUnique();
b.HasIndex("UserId");
b.ToTable("CashbackRecovery", "finance", t => { t.HasCheckConstraint("CK_CashbackRecovery", "[Amount]>0");
```

## PersonalFinance.Api.Domain.Category

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Kind|string|nvarchar(40)|
|Name|string|nvarchar(max)|
|ParentId|string|nvarchar(36)|
|SortOrder|int|int|
|Status|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ParentId");
b.HasIndex("UserId");
b.ToTable("Categories", "finance");
```

## PersonalFinance.Api.Domain.CompensationPlan

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EffectiveFrom|DateOnly|date|
|EffectiveTo|DateOnly?|date|
|EmploymentId|string|nvarchar(36)|
|ItemsJson|string|nvarchar(max)|
|Name|string|nvarchar(max)|
|PayBasis|string|nvarchar(max)|
|Revision|int|int|
|SeriesId|string|nvarchar(36)|
|Status|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("EmploymentId");
b.HasIndex("UserId", "EmploymentId", "EffectiveFrom");
b.HasIndex("UserId", "SeriesId", "Revision") .IsUnique();
b.ToTable("CompensationPlan", "finance");
```

## PersonalFinance.Api.Domain.CurrencyPreference

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Currency|string|nvarchar(3)|
|Enabled|bool|bit|
|Name|string|nvarchar(100)|
|SortOrder|int|int|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Currency") .IsUnique();
b.ToTable("CurrencyPreference", "finance", t => { t.HasCheckConstraint("CK_CurrencyPreference", "[Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [Version]>0 AND [SortOrder] BETWEEN 0 AND 1000");
```

## PersonalFinance.Api.Domain.CustomReportDefinition

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|DefinitionJson|string|nvarchar(max)|
|Name|string|nvarchar(150)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Name") .IsUnique();
b.ToTable("CustomReportDefinition", "finance");
```

## PersonalFinance.Api.Domain.DebtPaymentAllocation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Component|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Explanation|string|nvarchar(2000)|
|FeeNature|string|nvarchar(30)|
|PlanId|string|nvarchar(36)|
|Sequence|int|int|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("PlanId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "PlanId", "Sequence");
b.HasIndex("UserId", "TransactionId", "State");
b.ToTable("DebtPaymentAllocation", "finance", t => { t.HasCheckConstraint("CK_DebtAllocation", "[Amount]>0 AND [Sequence]>0 AND [Component] IN ('Principal','Fee') AND [State] IN ('Active','Revoked')");
```

## PersonalFinance.Api.Domain.DebtPlanHistory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|PlanId|string|nvarchar(36)|
|Reason|string|nvarchar(2000)|
|SnapshotJson|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("PlanId");
b.HasIndex("UserId", "PlanId", "CreatedAt");
b.ToTable("DebtPlanHistory", "finance");
```

## PersonalFinance.Api.Domain.DebtRepaymentPlan

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|BusinessId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|FeeMode|string|nvarchar(40)|
|FirstDate|DateOnly|date|
|FixedFee|decimal|decimal(28,4)|
|Kind|string|nvarchar(40)|
|MinimumDueDate|DateOnly?|date|
|MinimumPayment|decimal?|decimal(28,4)|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(2000)|
|OriginalTransactionId|string|nvarchar(36)|
|PeriodRate|decimal|decimal(28,8)|
|Periods|int|int|
|Principal|decimal|decimal(28,4)|
|PrincipalBaselineAt|DateTimeOffset|datetimeoffset|
|RepaymentMode|string|nvarchar(40)|
|ScheduleJson|string|nvarchar(max)|
|State|string|nvarchar(40)|
|StatementAmount|decimal?|decimal(28,4)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("BusinessId");
b.HasIndex("OriginalTransactionId");
b.HasIndex("UserId", "BusinessId") .IsUnique() .HasFilter("[BusinessId] IS NOT NULL AND [State]='Active'");
b.HasIndex("UserId", "OriginalTransactionId") .IsUnique() .HasFilter("[OriginalTransactionId] IS NOT NULL AND [State]='Active'");
b.HasIndex("UserId", "Kind", "State", "Id");
b.ToTable("DebtRepaymentPlan", "finance", t => { t.HasCheckConstraint("CK_DebtPlan_Values", "[Principal]>0 AND [Periods] BETWEEN 1 AND 600 AND [Version]>0 AND [Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [PeriodRate] BETWEEN 0 AND 100 AND [FixedFee]>=0 AND [State] IN ('Active','Archived') AND (([Kind]='CreditInstallment' AND [BusinessId] IS NULL) OR ([Kind]='LoanRepayment' AND [BusinessId] IS NOT NULL AND [OriginalTransactionId] IS NULL)) AND ([MinimumPayment] IS NULL OR [MinimumPayment]>=0 AND [StatementAmount] IS NOT NULL AND [MinimumPayment]<=[StatementAmount])");
```

## PersonalFinance.Api.Domain.DirectoryItem

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal?|decimal(28,4)|
|Budget|decimal|decimal(28,4)|
|CategoryId|string|nvarchar(36)|
|Currency|string|nvarchar(3)|
|EndDate|string|nvarchar(max)|
|Kind|string|nvarchar(40)|
|Name|string|nvarchar(150)|
|StartDate|string|nvarchar(max)|
|Status|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Kind", "Name") .IsUnique();
b.ToTable("Directory", "finance");
```

## PersonalFinance.Api.Domain.Entry

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|BaseAmount|decimal|decimal(28,4)|
|CategoryId|string|nvarchar(36)|
|Currency|string|nvarchar(3)|
|ExchangeRate|decimal|decimal(28,8)|
|Kind|string|nvarchar(40)|
|OriginalEntryId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("CategoryId");
b.HasIndex("TransactionId");
b.HasIndex("TransactionId"), new[] { "UserId", "Kind", "AccountId", "CategoryId", "Amount", "BaseAmount", "Currency" });
b.HasIndex("UserId", "AccountId", "TransactionId");
b.HasIndex("UserId", "Kind", "AccountId", "TransactionId");
b.HasIndex("UserId", "Kind", "AccountId", "TransactionId"), new[] { "Amount", "BaseAmount", "CategoryId", "Currency" });
b.ToTable("Entries", "finance", t => { t.HasCheckConstraint("CK_Entry_Values", "[Amount] <> 0 AND [BaseAmount] <> 0 AND [ExchangeRate] > 0");
```

## PersonalFinance.Api.Domain.EssentialExpensePolicy

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CategoryId|string|nvarchar(36)|
|EssentialRate|decimal|decimal(28,8)|
|Excluded|bool|bit|
|Necessity|string|nvarchar(max)|
|Note|string|nvarchar(max)|
|TransactionId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("CategoryId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "CategoryId") .IsUnique() .HasFilter("[CategoryId] IS NOT NULL");
b.HasIndex("UserId", "TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.ToTable("EssentialExpensePolicy", "finance", t => { t.HasCheckConstraint("CK_EssentialPolicy_Values", "([CategoryId] IS NULL AND [TransactionId] IS NOT NULL OR [CategoryId] IS NOT NULL AND [TransactionId] IS NULL) AND [EssentialRate] BETWEEN 0 AND 100");
```

## PersonalFinance.Api.Domain.ExternalPaymentFact

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Consumer|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Name|string|nvarchar(max)|
|Nature|string|nvarchar(max)|
|Note|string|nvarchar(2000)|
|OccurredAt|DateTimeOffset|datetimeoffset|
|Payer|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "OccurredAt");
b.ToTable("ExternalPaymentFact", "finance", t => { t.HasCheckConstraint("CK_ExternalPaymentFact", "[Amount]>0 AND [Nature] IN ('Gift','PromisedRepayment','ReferenceOnly') AND [Version]>0");
```

## PersonalFinance.Api.Domain.FinanceSpace

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Archived|bool|bit|
|Description|string|nvarchar(1000)|
|FamilyId|string|nvarchar(36)|
|Kind|string|nvarchar(40)|
|Name|string|nvarchar(100)|
|SortOrder|int|int|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("FamilyId");
b.HasIndex("UserId");
b.ToTable("FinanceSpace", "finance");
```

## PersonalFinance.Api.Domain.FinanceTransaction

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|AdjustmentDirection|string|nvarchar(max)|
|Amount|decimal|decimal(28,4)|
|BusinessId|string|nvarchar(36)|
|CategoryId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|ExchangeRate|decimal?|decimal(28,8)|
|ExternalId|string|nvarchar(256)|
|Fee|decimal|decimal(28,4)|
|FeeCategoryId|string|nvarchar(36)|
|ImportJobId|string|nvarchar(36)|
|Merchant|string|nvarchar(max)|
|Note|string|nvarchar(max)|
|OccurredAt|DateTimeOffset|datetimeoffset|
|OriginalTransactionId|string|nvarchar(36)|
|ProductName|string|nvarchar(200)|
|ProjectId|string|nvarchar(36)|
|PromotionJson|string|nvarchar(max)|
|ReceivedAmount|decimal?|decimal(28,4)|
|Status|string|nvarchar(40)|
|ToAccountId|string|nvarchar(36)|
|TransferKind|string|nvarchar(20)|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "ExternalId") .HasFilter("[ExternalId] IS NOT NULL");
b.HasIndex("UserId", "Id");
b.HasIndex("UserId", "Id"), new[] { "Status", "Type", "Currency", "OccurredAt", "CreatedAt", "Amount", "AccountId", "ToAccountId", "CategoryId", "FeeCategoryId", "ProjectId", "OriginalTransactionId" });
b.HasIndex("UserId", "ImportJobId");
b.HasIndex("UserId", "AccountId", "Status");
b.HasIndex("UserId", "OccurredAt", "Id");
b.HasIndex("UserId", "OriginalTransactionId", "Status") .HasFilter("[OriginalTransactionId] IS NOT NULL");
b.HasIndex("UserId", "OriginalTransactionId", "Status"), new[] { "Type", "Amount", "Currency" });
b.HasIndex("UserId", "Amount", "CreatedAt", "Id") .IsDescending(false, true, true, true);
b.HasIndex("UserId", "Amount", "CreatedAt", "Id"), new[] { "Status", "Type", "Currency", "OccurredAt", "AccountId", "ToAccountId" });
b.HasIndex("UserId", "OccurredAt", "CreatedAt", "Id");
b.HasIndex("UserId", "OccurredAt", "CreatedAt", "Id"), new[] { "Status", "Type", "Currency", "AccountId", "ToAccountId", "Amount" });
b.HasIndex("UserId", "ToAccountId", "OccurredAt", "CreatedAt", "Id") .HasFilter("[ToAccountId] IS NOT NULL");
b.HasIndex("UserId", "ToAccountId", "OccurredAt", "CreatedAt", "Id"), new[] { "Status", "Type", "Currency", "Amount", "AccountId" });
b.ToTable("Transactions", "finance", t => { t.HasCheckConstraint("CK_Transaction_Amounts", "[Amount] > 0 AND [Fee] >= 0 AND [Version] > 0");
```

## PersonalFinance.Api.Domain.FinancialMemory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Favorite|bool|bit|
|Key|string|nvarchar(64)|
|Note|string|nvarchar(2000)|
|TransactionId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "Key") .IsUnique();
b.ToTable("FinancialMemory", "finance");
```

## PersonalFinance.Api.Domain.FuelRecord

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Currency|string|nvarchar(3)|
|Date|DateOnly|date|
|DeletedAt|DateTimeOffset?|datetimeoffset|
|Discount|decimal?|decimal(28,4)|
|DrivingScene|string|nvarchar(100)|
|EnteredUnitPrice|decimal?|decimal(28,4)|
|FuelGrade|string|nvarchar(32)|
|FullTank|bool|bit|
|Litres|decimal|decimal(28,4)|
|MissedFill|bool|bit|
|Note|string|nvarchar(1000)|
|OccurredTime|TimeOnly?|time|
|Odometer|decimal?|decimal(28,4)|
|OdometerReset|bool|bit|
|OriginalAmount|decimal?|decimal(28,4)|
|PaymentMethod|string|nvarchar(100)|
|PointsRedemption|decimal?|decimal(28,4)|
|PostedUnitPrice|decimal?|decimal(28,4)|
|QuantitySource|string|nvarchar(max)|
|Station|string|nvarchar(200)|
|TankStatus|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|VehicleId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("VehicleId");
b.HasIndex("UserId", "Date") .HasFilter("[DeletedAt] IS NULL");
b.HasIndex("UserId", "VehicleId", "Date") .HasFilter("[DeletedAt] IS NULL");
b.HasIndex("UserId", "VehicleId", "Odometer") .HasFilter("[Odometer] IS NOT NULL AND [DeletedAt] IS NULL");
b.ToTable("FuelRecord", "finance");
```

## PersonalFinance.Api.Domain.FuelVehicle

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AnnualDistance|decimal?|decimal(28,4)|
|Brand|string|nvarchar(100)|
|CurrentOdometer|decimal?|decimal(28,4)|
|EnergyType|string|nvarchar(32)|
|Engine|string|nvarchar(200)|
|FuelType|string|nvarchar(max)|
|InitialOdometer|decimal?|decimal(28,4)|
|Model|string|nvarchar(100)|
|ModelYear|int?|int|
|Name|string|nvarchar(100)|
|Note|string|nvarchar(1000)|
|Plate|string|nvarchar(30)|
|PurchaseAmount|decimal?|decimal(28,4)|
|PurchaseCurrency|string|nvarchar(max)|
|PurchaseDate|DateOnly?|date|
|Status|string|nvarchar(40)|
|TankCapacity|decimal?|decimal(28,4)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("FuelVehicle", "finance");
```

## PersonalFinance.Api.Domain.FundHoldEvent

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(max)|
|Amount|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|HoldId|string|nvarchar(36)|
|Reason|string|nvarchar(2000)|
|ReversalOfId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("HoldId");
b.HasIndex("ReversalOfId") .IsUnique() .HasFilter("[ReversalOfId] IS NOT NULL");
b.HasIndex("TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.HasIndex("UserId", "HoldId", "CreatedAt");
b.ToTable("FundHoldEvent", "finance");
```

## PersonalFinance.Api.Domain.FutureCashFlowItem

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Certainty|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|ExpectedDate|DateOnly|date|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(max)|
|ReceivedAmount|decimal?|decimal(28,4)|
|ScenarioId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|ToAccountId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("ScenarioId");
b.HasIndex("ToAccountId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.HasIndex("UserId", "State", "ExpectedDate", "Id");
b.ToTable("FutureCashFlowItem", "finance", t => { t.HasCheckConstraint("CK_FutureCashflow_Amount", "[Amount]>0 AND ([ReceivedAmount] IS NULL OR [ReceivedAmount]>0) AND [Version]>0");
```

## PersonalFinance.Api.Domain.FxValuationRate

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BaseCurrency|string|nvarchar(3)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Date|DateOnly|date|
|Rate|decimal|decimal(28,8)|
|Source|string|nvarchar(200)|
|TargetCurrency|string|nvarchar(3)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "BaseCurrency", "TargetCurrency", "Date", "CreatedAt");
b.ToTable("FxValuationRate", "finance", t => { t.HasCheckConstraint("CK_FxValuation", "[Rate]>0 AND [BaseCurrency]<>[TargetCurrency] AND [BaseCurrency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [TargetCurrency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [Version]>0");
```

## PersonalFinance.Api.Domain.GoalAllocation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|GoalId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("GoalId");
b.HasIndex("UserId", "AccountId");
b.HasIndex("UserId", "GoalId", "AccountId") .IsUnique();
b.ToTable("GoalAllocation", "finance", t => { t.HasCheckConstraint("CK_GoalAllocation_Amount", "[Amount]>=0 AND [Version]>0");
```

## PersonalFinance.Api.Domain.GoalAllocationHistory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Action|string|nvarchar(max)|
|After|decimal|decimal(28,4)|
|Before|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|GoalId|string|nvarchar(36)|
|Reason|string|nvarchar(max)|
|ToGoalId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("GoalId");
b.HasIndex("ToGoalId");
b.HasIndex("UserId", "GoalId", "CreatedAt");
b.ToTable("GoalAllocationHistory", "finance");
```

## PersonalFinance.Api.Domain.HousingFundAccount

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|BalanceDate|DateOnly|date|
|BalanceSource|string|nvarchar(max)|
|City|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EmploymentId|string|nvarchar(36)|
|Evidence|string|nvarchar(max)|
|LoanBusinessId|string|nvarchar(36)|
|Name|string|nvarchar(max)|
|ReportedBalance|decimal|decimal(28,4)|
|Status|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId") .IsUnique() .HasFilter("[AccountId] IS NOT NULL");
b.HasIndex("EmploymentId");
b.HasIndex("LoanBusinessId");
b.HasIndex("UserId");
b.ToTable("HousingFundAccount", "finance");
```

## PersonalFinance.Api.Domain.HousingFundEvent

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|BusinessDate|DateOnly|date|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Evidence|string|nvarchar(max)|
|FundAccountId|string|nvarchar(36)|
|Kind|string|nvarchar(40)|
|Month|string|nvarchar(max)|
|Status|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("FundAccountId");
b.HasIndex("TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.HasIndex("UserId");
b.ToTable("HousingFundEvent", "finance");
```

## PersonalFinance.Api.Domain.Idempotency

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ClientFingerprint|string|nvarchar(64)|
|CompletedAt|DateTimeOffset?|datetimeoffset|
|Hash|string|nvarchar(max)|
|Key|string|nvarchar(200)|
|Method|string|nvarchar(10)|
|Path|string|nvarchar(300)|
|Response|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Key") .IsUnique();
b.ToTable("Idempotencies", "finance");
```

## PersonalFinance.Api.Domain.ImportAttempt

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Code|string|nvarchar(80)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ImportJobId|string|nvarchar(36)|
|Imported|int|int|
|Message|string|nvarchar(300)|
|OperationKey|string|nvarchar(150)|
|OutcomesJson|string|nvarchar(max)|
|Skipped|int|int|
|State|string|nvarchar(40)|
|Total|int|int|
|TraceId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ImportJobId");
b.HasIndex("UserId", "ImportJobId", "CreatedAt");
b.ToTable("ImportAttempts", "finance");
```

## PersonalFinance.Api.Domain.ImportCleaningEvent

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(max)|
|AfterJson|string|nvarchar(max)|
|BeforeJson|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ImportJobId|string|nvarchar(36)|
|JobVersion|long|bigint|
|Reason|string|nvarchar(max)|
|RowId|string|nvarchar(36)|
|RowIndex|int|int|
|RuleVersion|string|nvarchar(max)|
|Source|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ImportJobId");
b.HasIndex("UserId", "ImportJobId", "CreatedAt");
b.ToTable("ImportCleaningEvent", "finance");
```

## PersonalFinance.Api.Domain.ImportJob

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|FileName|string|nvarchar(max)|
|HeaderRow|int|int|
|HeadersJson|string|nvarchar(max)|
|Imported|int|int|
|MappingJson|string|nvarchar(max)|
|RawRowsJson|string|nvarchar(max)|
|Source|string|nvarchar(max)|
|SourceEncoding|string|nvarchar(40)|
|SourceHash|string|nvarchar(64)|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("Imports", "finance");
```

## PersonalFinance.Api.Domain.ImportRecognitionSuggestion

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CategoryId|string|nvarchar(36)|
|Confidence|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ImportJobId|string|nvarchar(36)|
|MerchantId|string|nvarchar(36)|
|Reason|string|nvarchar(max)|
|RequestId|string|nvarchar(36)|
|RowHash|string|nvarchar(64)|
|RowId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "ImportJobId", "State");
b.ToTable("ImportRecognitionSuggestion", "finance");
```

## PersonalFinance.Api.Domain.ImportRow

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|DataJson|string|nvarchar(max)|
|Fingerprint|string|nvarchar(64)|
|IdentityKey|string|nvarchar(64)|
|IdentityVersion|int|int|
|ImportJobId|string|nvarchar(36)|
|Index|int|int|
|ReviewDecision|string|nvarchar(12)|
|ReviewSignature|string|nvarchar(64)|
|ReviewedAt|DateTimeOffset?|datetimeoffset|
|Status|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ImportJobId");
b.HasIndex("UserId", "Fingerprint") .IsUnique() .HasFilter("[Status] = 'Imported'");
b.HasIndex("UserId", "IdentityKey") .IsUnique() .HasFilter("[Status] = 'Imported' AND [IdentityKey] IS NOT NULL");
b.HasIndex("UserId", "Fingerprint", "Status");
b.ToTable("ImportRows", "finance");
```

## PersonalFinance.Api.Domain.InvestmentAsset

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Code|string|nvarchar(80)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Market|string|nvarchar(80)|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(2000)|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|Unit|string|nvarchar(20)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "AccountId", "Market", "Type", "Code") .IsUnique() .HasFilter("[Code] <> ''");
b.ToTable("InvestmentAsset", "finance", t => { t.HasCheckConstraint("CK_InvestmentAsset", "[Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [State] IN ('Active','Archived') AND [Version]>0");
```

## PersonalFinance.Api.Domain.InvestmentHistory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AssetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Kind|string|nvarchar(40)|
|Reason|string|nvarchar(2000)|
|ResourceId|string|nvarchar(36)|
|SnapshotJson|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("UserId", "AssetId", "CreatedAt");
b.ToTable("InvestmentHistory", "finance");
```

## PersonalFinance.Api.Domain.InvestmentTrade

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|AssetId|string|nvarchar(36)|
|Commission|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Date|DateOnly|date|
|Note|string|nvarchar(2000)|
|OtherFee|decimal|decimal(28,4)|
|OwnsTransaction|bool|bit|
|Price|decimal|decimal(28,8)|
|Quantity|decimal|decimal(28,8)|
|SettlementDate|DateOnly|date|
|State|string|nvarchar(40)|
|Tax|decimal|decimal(28,4)|
|TransactionId|string|nvarchar(36)|
|Type|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL AND [State]='Active'");
b.HasIndex("UserId", "AssetId", "Date", "CreatedAt");
b.ToTable("InvestmentTrade", "finance", t => { t.HasCheckConstraint("CK_InvestmentTrade", "[Quantity]>=0 AND [Price]>=0 AND [Amount]>=0 AND [Commission]>=0 AND [Tax]>=0 AND [OtherFee]>=0 AND [SettlementDate]>=[Date] AND [State] IN ('Active','Revoked') AND [Type] IN ('Buy','Sell','Dividend','Interest','Fee','PositionIncrease','PositionDecrease') AND [Version]>0");
```

## PersonalFinance.Api.Domain.InvestmentValuation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AssetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Date|DateOnly|date|
|Method|string|nvarchar(max)|
|Price|decimal|decimal(28,8)|
|Source|string|nvarchar(200)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("UserId", "AssetId", "Date") .IsUnique();
b.ToTable("InvestmentValuation", "finance", t => { t.HasCheckConstraint("CK_InvestmentValuation", "[Price]>=0 AND [Version]>0");
```

## PersonalFinance.Api.Domain.Invitation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BoundEmail|string|nvarchar(256)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|CreatedByUserId|string|nvarchar(36)|
|ExpiresAt|DateTimeOffset|datetimeoffset|
|RevokedAt|DateTimeOffset?|datetimeoffset|
|TokenHash|string|nvarchar(64)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UsedAt|DateTimeOffset?|datetimeoffset|
|UsedByUserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("CreatedByUserId");
b.HasIndex("TokenHash") .IsUnique();
b.HasIndex("UsedByUserId");
b.HasIndex("CreatedAt", "Id");
b.ToTable("Invitation", "finance");
```

## PersonalFinance.Api.Domain.LivingCostBasket

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BaseDate|DateOnly|date|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Name|string|nvarchar(150)|
|PriceKind|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("LivingCostBasket", "finance");
```

## PersonalFinance.Api.Domain.LivingCostBasketItem

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BasketId|string|nvarchar(36)|
|Brand|string|nvarchar(max)|
|Product|string|nvarchar(200)|
|Quantity|decimal|decimal(28,8)|
|Specification|string|nvarchar(200)|
|Unit|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("BasketId");
b.HasIndex("UserId");
b.ToTable("LivingCostBasketItem", "finance", t => { t.HasCheckConstraint("CK_BasketQuantity", "[Quantity]>0");
```

## PersonalFinance.Api.Domain.ManagedAsset

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|AcquiredDate|DateOnly|date|
|AnnualRate|decimal|decimal(28,8)|
|Cost|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|DayCount|string|nvarchar(max)|
|FundingTransactionId|string|nvarchar(36)|
|Institution|string|nvarchar(150)|
|InterestTransactionId|string|nvarchar(36)|
|LiabilityAccountId|string|nvarchar(36)|
|MaturityAction|string|nvarchar(max)|
|MaturityDate|DateOnly?|date|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(2000)|
|SettlementTransactionId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId") .IsUnique() .HasFilter("[AccountId] IS NOT NULL AND [State]='Active'");
b.HasIndex("FundingTransactionId");
b.HasIndex("InterestTransactionId");
b.HasIndex("LiabilityAccountId");
b.HasIndex("SettlementTransactionId");
b.HasIndex("UserId", "Type", "State", "MaturityDate");
b.ToTable("ManagedAsset", "finance", t => { t.HasCheckConstraint("CK_ManagedAsset", "[Cost]>=0 AND [AnnualRate] BETWEEN 0 AND 100 AND [Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [Version]>0 AND [State] IN ('Active','Archived','Matured','EarlyWithdrawn')");
```

## PersonalFinance.Api.Domain.ManagedAssetValuation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|AssetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Date|DateOnly|date|
|Source|string|nvarchar(200)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("UserId", "AssetId", "Date", "CreatedAt");
b.ToTable("ManagedAssetValuation", "finance", t => { t.HasCheckConstraint("CK_ManagedValuation", "[Amount]>=0 AND [Version]>0");
```

## PersonalFinance.Api.Domain.MerchantAlias

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|MatchKey|string|nvarchar(64)|
|MerchantId|string|nvarchar(36)|
|Name|string|nvarchar(200)|
|Source|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("MerchantId");
b.HasIndex("UserId", "MatchKey") .IsUnique();
b.ToTable("MerchantAlias", "finance");
```

## PersonalFinance.Api.Domain.PaymentInstrument

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Authorizer|string|nvarchar(150)|
|Consumer|string|nvarchar(150)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EndsOn|DateOnly?|date|
|MonthlyLimit|decimal?|decimal(28,4)|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(2000)|
|StartsOn|DateOnly|date|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId");
b.ToTable("PaymentInstrument", "finance", t => { t.HasCheckConstraint("CK_PaymentInstrument", "[Version]>0 AND ([MonthlyLimit] IS NULL OR [MonthlyLimit]>0) AND ([EndsOn] IS NULL OR [EndsOn]>=[StartsOn]) AND [State] IN ('Active','Paused','Revoked')");
```

## PersonalFinance.Api.Domain.PayrollComponent

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Category|string|nvarchar(max)|
|Code|string|nvarchar(max)|
|HousingBasis|bool|bit|
|InsuranceBasis|bool|bit|
|Kind|string|nvarchar(40)|
|Name|string|nvarchar(100)|
|PayrollId|string|nvarchar(36)|
|Quantity|decimal|decimal(28,4)|
|SortOrder|int|int|
|Status|string|nvarchar(40)|
|TaxTreatment|string|nvarchar(max)|
|UnitRate|decimal|decimal(28,8)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("PayrollId");
b.HasIndex("UserId");
b.ToTable("PayrollComponent", "finance", t => { t.HasCheckConstraint("CK_PayrollComponent", "[Kind] IN ('Earning','Deduction','Adjustment') AND ([Kind]='Adjustment' OR [Amount]>=0)");
```

## PersonalFinance.Api.Domain.PayrollEmployer

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|City|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Name|string|nvarchar(200)|
|Note|string|nvarchar(max)|
|Status|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Name");
b.ToTable("PayrollEmployer", "finance");
```

## PersonalFinance.Api.Domain.PayrollEmployment

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Department|string|nvarchar(max)|
|EmployeeNumber|string|nvarchar(max)|
|EmployerId|string|nvarchar(36)|
|EndDate|DateOnly?|date|
|HousingCity|string|nvarchar(max)|
|InsuranceCity|string|nvarchar(max)|
|PayCycle|string|nvarchar(max)|
|PayDay|int|int|
|Position|string|nvarchar(max)|
|StartDate|DateOnly|date|
|Status|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|
|Workplace|string|nvarchar(max)|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("EmployerId");
b.HasIndex("UserId");
b.ToTable("PayrollEmployment", "finance");
```

## PersonalFinance.Api.Domain.PayrollImportJob

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|DocumentId|string|nvarchar(36)|
|FileName|string|nvarchar(max)|
|Fingerprint|string|nvarchar(64)|
|HeadersJson|string|nvarchar(max)|
|Imported|int|int|
|MappingJson|string|nvarchar(max)|
|PreviewJson|string|nvarchar(max)|
|RowsJson|string|nvarchar(max)|
|State|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("DocumentId");
b.HasIndex("UserId");
b.ToTable("PayrollImportJob", "finance");
```

## PersonalFinance.Api.Domain.PayrollPayment

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|PayrollId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("PayrollId");
b.HasIndex("TransactionId") .IsUnique();
b.HasIndex("UserId");
b.ToTable("PayrollPayment", "finance");
```

## PersonalFinance.Api.Domain.PayrollRevision

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|PayrollId|string|nvarchar(36)|
|PayrollVersion|long|bigint|
|Reason|string|nvarchar(max)|
|SnapshotJson|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("PayrollId");
b.HasIndex("UserId", "PayrollId", "PayrollVersion") .IsUnique();
b.ToTable("PayrollRevision", "finance");
```

## PersonalFinance.Api.Domain.PayrollStatement

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|CorrectionReason|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Employer|string|nvarchar(200)|
|EmploymentId|string|nvarchar(36)|
|ImportJobId|string|nvarchar(36)|
|ImportRowKey|string|nvarchar(64)|
|Month|string|nvarchar(450)|
|Note|string|nvarchar(2000)|
|PayDate|DateOnly|date|
|PlanId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("EmploymentId");
b.HasIndex("ImportJobId");
b.HasIndex("PlanId");
b.HasIndex("UserId", "ImportRowKey") .IsUnique() .HasFilter("[ImportRowKey] IS NOT NULL");
b.HasIndex("UserId", "Month");
b.ToTable("PayrollStatement", "finance");
```

## PersonalFinance.Api.Domain.PayrollTaxCalculation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|EmploymentId|string|nvarchar(36)|
|InputsJson|string|nvarchar(max)|
|Month|string|nvarchar(max)|
|ResultsJson|string|nvarchar(max)|
|RuleId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("EmploymentId");
b.HasIndex("RuleId");
b.HasIndex("UserId");
b.ToTable("PayrollTaxCalculation", "finance");
```

## PersonalFinance.Api.Domain.PayrollTaxDeclaration

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ApprovedAmount|decimal|decimal(28,4)|
|ClaimedAmount|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|EligibilityJson|string|nvarchar(max)|
|EmploymentId|string|nvarchar(36)|
|EndMonth|int|int|
|Evidence|string|nvarchar(max)|
|Kind|string|nvarchar(40)|
|RuleId|string|nvarchar(36)|
|StartMonth|int|int|
|Status|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|
|Year|int|int|

```csharp
b.HasKey("Id");
b.HasIndex("EmploymentId");
b.HasIndex("RuleId");
b.HasIndex("UserId");
b.ToTable("PayrollTaxDeclaration", "finance");
```

## PersonalFinance.Api.Domain.PayrollTaxRule

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|EffectiveFrom|DateOnly|date|
|EffectiveTo|DateOnly|date|
|Name|string|nvarchar(max)|
|PolicyVersion|string|nvarchar(100)|
|RulesJson|string|nvarchar(max)|
|Source|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Verified|bool|bit|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "PolicyVersion") .IsUnique();
b.ToTable("PayrollTaxRule", "finance");
```

## PersonalFinance.Api.Domain.PhysicalCategory

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|DefaultLifeMonths|int|int|
|DefaultMethod|string|nvarchar(max)|
|Enabled|bool|bit|
|Name|string|nvarchar(100)|
|ParentId|string|nvarchar(36)|
|Sort|int|int|
|Tags|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ParentId");
b.HasIndex("UserId", "ParentId", "Sort");
b.ToTable("PhysicalCategory", "finance");
```

## PersonalFinance.Api.Domain.PhysicalCostLink

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AssetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Kind|string|nvarchar(40)|
|Reason|string|nvarchar(max)|
|Reversed|bool|bit|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "TransactionId") .IsUnique() .HasFilter("[Reversed] = 0");
b.ToTable("PhysicalCostLink", "finance");
```

## PersonalFinance.Api.Domain.PhysicalEvent

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AssetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Date|DateOnly|date|
|Kind|string|nvarchar(40)|
|Quantity|decimal|decimal(28,4)|
|Reason|string|nvarchar(max)|
|ReversesId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("UserId", "AssetId", "Date", "CreatedAt");
b.ToTable("PhysicalEvent", "finance");
```

## PersonalFinance.Api.Domain.PhysicalProfile

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AssetId|string|nvarchar(36)|
|Brand|string|nvarchar(max)|
|CategoryId|string|nvarchar(36)|
|Code|string|nvarchar(max)|
|Holder|string|nvarchar(max)|
|IdleDays|int|int|
|InServiceDate|DateOnly?|date|
|InitialState|string|nvarchar(max)|
|InventoryDays|int|int|
|Location|string|nvarchar(max)|
|MaintenanceDays|int|int|
|Merchant|string|nvarchar(max)|
|Model|string|nvarchar(max)|
|PaymentAccountId|string|nvarchar(36)|
|PhotoUrl|string|nvarchar(max)|
|Quantity|decimal|decimal(28,4)|
|ReceiptUrl|string|nvarchar(max)|
|SerialNumber|string|nvarchar(max)|
|StaleDays|int|int|
|Tags|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|
|WarrantyUntil|DateOnly?|date|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("CategoryId");
b.HasIndex("PaymentAccountId");
b.HasIndex("UserId", "AssetId") .IsUnique();
b.ToTable("PhysicalProfile", "finance");
```

## PersonalFinance.Api.Domain.PhysicalValueRule

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal?|decimal(28,4)|
|AnnualRate|decimal|decimal(28,8)|
|AssetId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Date|DateOnly|date|
|LifeMonths|int|int|
|MarketValue|decimal?|decimal(28,4)|
|Method|string|nvarchar(max)|
|NetRealizableValue|decimal?|decimal(28,4)|
|ReplacementCost|decimal?|decimal(28,4)|
|Residual|decimal|decimal(28,4)|
|Source|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AssetId");
b.HasIndex("UserId", "AssetId", "Date", "CreatedAt");
b.ToTable("PhysicalValueRule", "finance");
```

## PersonalFinance.Api.Domain.PrepaymentContract

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|AccountingMode|string|nvarchar(max)|
|Amount|decimal|decimal(28,4)|
|AssetAccountId|string|nvarchar(36)|
|ConsumedAmount|decimal|decimal(28,4)|
|ContractReference|string|nvarchar(200)|
|Counterparty|string|nvarchar(200)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|ExpiresOn|DateOnly?|date|
|FundingTransactionId|string|nvarchar(36)|
|Name|string|nvarchar(200)|
|Note|string|nvarchar(2000)|
|RefundedAmount|decimal|decimal(28,4)|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|
|WrittenOffAmount|decimal|decimal(28,4)|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("AssetAccountId") .IsUnique() .HasFilter("[AssetAccountId] IS NOT NULL");
b.HasIndex("FundingTransactionId") .IsUnique();
b.HasIndex("UserId");
b.ToTable("PrepaymentContract", "finance", t => { t.HasCheckConstraint("CK_PrepaymentContract", "[Amount]>0 AND [ConsumedAmount]>=0 AND [RefundedAmount]>=0 AND [WrittenOffAmount]>=0 AND [ConsumedAmount]+[RefundedAmount]+[WrittenOffAmount]<=[Amount] AND [Version]>0");
```

## PersonalFinance.Api.Domain.PrepaymentSettlement

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(max)|
|Amount|decimal|decimal(28,4)|
|ContractId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Reason|string|nvarchar(2000)|
|ReversalOfId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ContractId");
b.HasIndex("ReversalOfId") .IsUnique() .HasFilter("[ReversalOfId] IS NOT NULL");
b.HasIndex("TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.HasIndex("UserId");
b.ToTable("PrepaymentSettlement", "finance");
```

## PersonalFinance.Api.Domain.ProductPriceObservation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Brand|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Date|DateOnly|date|
|Discontinued|bool|bit|
|Excluded|bool|bit|
|ListedAmount|decimal?|decimal(28,4)|
|Merchant|string|nvarchar(max)|
|PriceKind|string|nvarchar(max)|
|Product|string|nvarchar(200)|
|ProductCategory|string|nvarchar(max)|
|Quantity|decimal|decimal(28,8)|
|Source|string|nvarchar(200)|
|SourceTransactionId|string|nvarchar(36)|
|Specification|string|nvarchar(200)|
|Unit|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("SourceTransactionId");
b.HasIndex("UserId", "Currency", "Date");
b.ToTable("ProductPriceObservation", "finance", t => { t.HasCheckConstraint("CK_ProductListedAmount", "[ListedAmount] IS NULL OR [ListedAmount]>=[Amount]");
```

## PersonalFinance.Api.Domain.PromotionBenefit

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|ClaimedAt|DateTimeOffset?|datetimeoffset|
|Currency|string|nvarchar(3)|
|DiscountRate|decimal?|decimal(28,8)|
|ExpiresAt|DateTimeOffset|datetimeoffset|
|FaceValue|decimal|decimal(28,4)|
|MaximumDiscount|decimal?|decimal(28,4)|
|Merchant|string|nvarchar(max)|
|MinimumAmount|decimal|decimal(28,4)|
|Mode|string|nvarchar(max)|
|Name|string|nvarchar(max)|
|Note|string|nvarchar(max)|
|PaymentMethod|string|nvarchar(max)|
|Platform|string|nvarchar(max)|
|Quantity|int|int|
|RemainingValue|decimal|decimal(28,4)|
|Rules|string|nvarchar(max)|
|StartsAt|DateTimeOffset|datetimeoffset|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "State", "ExpiresAt");
b.ToTable("PromotionBenefit", "finance", t => { t.HasCheckConstraint("CK_PromotionBenefit", "[Quantity]>=0 AND [FaceValue]>=0 AND [RemainingValue]>=0 AND [MinimumAmount]>=0 AND [ExpiresAt]>=[StartsAt]");
```

## PersonalFinance.Api.Domain.PromotionTransferDraft

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Currency|string|nvarchar(3)|
|Evidence|string|nvarchar(max)|
|OccurredAt|DateTimeOffset|datetimeoffset|
|PaidAmount|decimal|decimal(28,4)|
|ReceivedAmount|decimal|decimal(28,4)|
|Source|string|nvarchar(max)|
|State|string|nvarchar(40)|
|SubsidyAmount|decimal|decimal(28,4)|
|SubsidyTransactionId|string|nvarchar(36)|
|ToAccountId|string|nvarchar(36)|
|TransferTransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("SubsidyTransactionId");
b.HasIndex("ToAccountId");
b.HasIndex("TransferTransactionId");
b.HasIndex("UserId");
b.ToTable("PromotionTransferDraft", "finance", t => { t.HasCheckConstraint("CK_SubsidizedTransferDraft", "[PaidAmount]>0 AND [SubsidyAmount]>0 AND [ReceivedAmount]=[PaidAmount]+[SubsidyAmount]");
```

## PersonalFinance.Api.Domain.PromotionUsage

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|BenefitId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|RefundTransactionId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("BenefitId");
b.HasIndex("RefundTransactionId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "TransactionId", "BenefitId");
b.ToTable("PromotionUsage", "finance");
```

## PersonalFinance.Api.Domain.Reconciliation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|ActualBalance|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|Difference|decimal|decimal(28,4)|
|Reason|string|nvarchar(max)|
|SystemBalance|decimal|decimal(28,4)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("Reconciliations", "finance");
```

## PersonalFinance.Api.Domain.RecurringExecution

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Action|string|nvarchar(30)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Message|string|nvarchar(300)|
|OccurrenceId|string|nvarchar(36)|
|OperationKey|string|nvarchar(150)|
|RuleId|string|nvarchar(36)|
|Source|string|nvarchar(20)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("OccurrenceId");
b.HasIndex("RuleId");
b.HasIndex("UserId", "RuleId", "CreatedAt");
b.ToTable("RecurringExecutions", "finance");
```

## PersonalFinance.Api.Domain.RecurringOccurrence

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|PayloadJson|string|nvarchar(max)|
|PreparedPayloadJson|string|nvarchar(max)|
|RuleId|string|nvarchar(36)|
|RuleVersion|long|bigint|
|ScheduledAt|DateTimeOffset|datetimeoffset|
|Sequence|long|bigint|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.HasIndex("RuleId", "ScheduledAt") .IsUnique();
b.HasIndex("RuleId", "Sequence") .IsUnique();
b.HasIndex("UserId", "State", "ScheduledAt");
b.ToTable("RecurringOccurrences", "finance");
```

## PersonalFinance.Api.Domain.RecurringRule

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|string|nvarchar(max)|
|CategoryId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|DetailedNote|string|nvarchar(max)|
|EndLocal|DateTime?|datetime2|
|Frequency|string|nvarchar(20)|
|Interval|int|int|
|MonthEndPolicy|string|nvarchar(10)|
|Name|string|nvarchar(150)|
|NextAt|DateTimeOffset?|datetimeoffset|
|NextSequence|long|bigint|
|PayloadJson|string|nvarchar(max)|
|ReminderDays|int|int|
|StartLocal|DateTime|datetime2|
|State|string|nvarchar(40)|
|TimeZone|string|nvarchar(100)|
|ToAccountId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("CategoryId");
b.HasIndex("ToAccountId");
b.HasIndex("UserId");
b.HasIndex("State", "NextAt", "UserId");
b.ToTable("RecurringRules", "finance", t => { t.HasCheckConstraint("CK_Recurring_Schedule", "[Interval] BETWEEN 1 AND 366 AND [ReminderDays] BETWEEN 0 AND 90 AND [NextSequence]>=0 AND [Version]>0");
```

## PersonalFinance.Api.Domain.SavingsGoal

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|MonthlySaving|decimal|decimal(28,4)|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(2000)|
|Priority|int|int|
|StartDate|DateOnly|date|
|State|string|nvarchar(40)|
|Target|decimal|decimal(28,4)|
|TargetDate|DateOnly|date|
|Type|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "State", "Priority", "Id");
b.ToTable("SavingsGoal", "finance", t => { t.HasCheckConstraint("CK_Goal_Values", "[Target]>0 AND [MonthlySaving]>=0 AND [TargetDate]>=[StartDate] AND [Priority] BETWEEN 1 AND 5 AND [Version]>0");
```

## PersonalFinance.Api.Domain.ScenarioCalculation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|InputJson|string|nvarchar(max)|
|ResultJson|string|nvarchar(max)|
|ScenarioId|string|nvarchar(36)|
|SourceHash|string|nvarchar(64)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("ScenarioId");
b.HasIndex("UserId", "ScenarioId", "CreatedAt");
b.ToTable("ScenarioCalculation", "finance");
```

## PersonalFinance.Api.Domain.Session

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ExpiresAt|DateTimeOffset|datetimeoffset|
|RefreshHash|string|nvarchar(64)|
|Revoked|bool|bit|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("RefreshHash") .IsUnique();
b.HasIndex("UserId");
b.ToTable("Sessions", "finance");
```

## PersonalFinance.Api.Domain.SharedTransaction

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|BookId|string|nvarchar(36)|
|ConsumerId|string|nvarchar(36)|
|InputsJson|string|nvarchar(max)|
|PayerId|string|nvarchar(36)|
|Rule|string|nvarchar(max)|
|SharesJson|string|nvarchar(max)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("BookId");
b.HasIndex("ConsumerId");
b.HasIndex("PayerId");
b.HasIndex("TransactionId") .IsUnique();
b.HasIndex("UserId");
b.ToTable("SharedTransaction", "finance");
```

## PersonalFinance.Api.Domain.SocialContributionRecord

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|BalanceSource|string|nvarchar(max)|
|Basis|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EmployerAmount|decimal|decimal(28,4)|
|EmployerRate|decimal|decimal(28,8)|
|EmploymentId|string|nvarchar(36)|
|ExpectedEmployer|decimal|decimal(28,4)|
|ExpectedPersonal|decimal|decimal(28,4)|
|FundAccountId|string|nvarchar(36)|
|Kind|string|nvarchar(40)|
|LoanBusinessId|string|nvarchar(36)|
|Month|string|nvarchar(450)|
|Note|string|nvarchar(2000)|
|PaidDate|DateOnly|date|
|PaymentStatus|string|nvarchar(max)|
|PayrollComponentId|string|nvarchar(36)|
|PayrollId|string|nvarchar(36)|
|PersonalAmount|decimal|decimal(28,4)|
|PersonalRate|decimal|decimal(28,8)|
|PolicyId|string|nvarchar(36)|
|Region|string|nvarchar(200)|
|ReportedBalance|decimal?|decimal(28,4)|
|SourceEvidence|string|nvarchar(max)|
|State|string|nvarchar(40)|
|Supplementary|bool|bit|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("EmploymentId");
b.HasIndex("FundAccountId");
b.HasIndex("LoanBusinessId");
b.HasIndex("PayrollComponentId");
b.HasIndex("PayrollId");
b.HasIndex("PolicyId");
b.HasIndex("UserId", "Month", "Kind");
b.ToTable("SocialContributionRecord", "finance", t => { t.HasCheckConstraint("CK_SocialContribution", "[Basis]>=0 AND [PersonalAmount]>=0 AND [EmployerAmount]>=0 AND ([ReportedBalance] IS NULL OR [ReportedBalance]>=0) AND [Version]>0");
```

## PersonalFinance.Api.Domain.SocialInsurancePolicy

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|EffectiveFrom|DateOnly|date|
|EffectiveTo|DateOnly|date|
|Name|string|nvarchar(max)|
|PolicyVersion|string|nvarchar(100)|
|RatesJson|string|nvarchar(max)|
|Region|string|nvarchar(200)|
|Source|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Verified|bool|bit|
|Version|long|bigint|
|Year|int|int|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "Region", "Year", "PolicyVersion") .IsUnique();
b.ToTable("SocialInsurancePolicy", "finance");
```

## PersonalFinance.Api.Domain.SpaceBudget

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Currency|string|nvarchar(3)|
|Month|string|nvarchar(450)|
|SpaceId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.HasIndex("SpaceId", "Month", "Currency") .IsUnique();
b.ToTable("SpaceBudget", "finance");
```

## PersonalFinance.Api.Domain.SpaceInvitation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Email|string|nvarchar(256)|
|ExpiresAt|DateTimeOffset|datetimeoffset|
|Role|string|nvarchar(max)|
|SpaceId|string|nvarchar(36)|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("SpaceId");
b.HasIndex("UserId");
b.ToTable("SpaceInvitation", "finance");
```

## PersonalFinance.Api.Domain.SpaceMember

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Active|bool|bit|
|LinkedUserId|string|nvarchar(36)|
|Name|string|nvarchar(100)|
|Profile|string|nvarchar(1000)|
|Role|string|nvarchar(max)|
|SpaceId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("LinkedUserId");
b.HasIndex("UserId");
b.HasIndex("SpaceId", "LinkedUserId") .IsUnique() .HasFilter("[LinkedUserId] IS NOT NULL");
b.ToTable("SpaceMember", "finance");
```

## PersonalFinance.Api.Domain.SpaceSettlement

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|FromMemberId|string|nvarchar(36)|
|Note|string|nvarchar(1000)|
|Revoked|bool|bit|
|SpaceId|string|nvarchar(36)|
|ToMemberId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("FromMemberId");
b.HasIndex("SpaceId");
b.HasIndex("ToMemberId");
b.HasIndex("UserId");
b.ToTable("SpaceSettlement", "finance");
```

## PersonalFinance.Api.Domain.StatementBalanceSnapshot

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|AdjustedDifference|decimal|decimal(28,4)|
|BankClosingBalance|decimal|decimal(28,4)|
|BankOnly|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EndsAt|DateTimeOffset|datetimeoffset|
|EvidenceJson|string|nvarchar(max)|
|LedgerOnly|decimal|decimal(28,4)|
|OpeningBalance|decimal|decimal(28,4)|
|StartsAt|DateTimeOffset|datetimeoffset|
|SystemClosingBalance|decimal|decimal(28,4)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "AccountId", "CreatedAt");
b.ToTable("StatementBalanceSnapshot", "finance");
```

## PersonalFinance.Api.Domain.StatementLink

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|ConfirmationMode|string|nvarchar(20)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|EngineScore|int|int|
|EngineVersion|string|nvarchar(max)|
|EvidenceJson|string|nvarchar(max)|
|Reason|string|nvarchar(max)|
|RevokedAt|DateTimeOffset?|datetimeoffset|
|RuleId|string|nvarchar(36)|
|RuleVersion|long?|bigint|
|State|string|nvarchar(40)|
|StatementRecordId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|TransactionVersion|long|bigint|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("RuleId");
b.HasIndex("StatementRecordId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "AccountId", "TransactionId") .HasFilter("[State] = N'Confirmed'");
b.HasIndex("UserId", "RuleId", "CreatedAt");
b.HasIndex("UserId", "StatementRecordId", "CreatedAt");
b.HasIndex("UserId", "StatementRecordId", "TransactionId") .IsUnique() .HasFilter("[State] = N'Confirmed'");
b.HasIndex("UserId", "TransactionId", "CreatedAt");
b.ToTable("StatementLink", "finance");
```

## PersonalFinance.Api.Domain.StatementRecord

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|CounterpartyHint|string|nvarchar(4)|
|CounterpartyKey|string|nvarchar(64)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|IdentityHash|string|nvarchar(64)|
|ImportJobId|string|nvarchar(36)|
|ImportRowId|string|nvarchar(36)|
|Merchant|string|nvarchar(200)|
|Note|string|nvarchar(2000)|
|OccurredAt|DateTimeOffset|datetimeoffset|
|PaymentSource|string|nvarchar(200)|
|PostedAt|DateTimeOffset?|datetimeoffset|
|Reference|string|nvarchar(200)|
|Resolution|string|nvarchar(max)|
|ResolutionHistoryJson|string|nvarchar(max)|
|SourceFactsHash|string|nvarchar(64)|
|State|string|nvarchar(40)|
|Type|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("ImportJobId");
b.HasIndex("ImportRowId");
b.HasIndex("UserId", "AccountId", "IdentityHash") .IsUnique();
b.HasIndex("UserId", "AccountId", "State", "OccurredAt");
b.ToTable("StatementRecord", "finance");
```

## PersonalFinance.Api.Domain.StatementRule

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|AmountTolerance|decimal|decimal(28,4)|
|AutoConfirm|bool|bit|
|Currency|string|nvarchar(3)|
|DateTolerance|int|int|
|Enabled|bool|bit|
|ExpectedAmount|decimal?|decimal(28,4)|
|Keyword|string|nvarchar(max)|
|Merchant|string|nvarchar(max)|
|Name|string|nvarchar(max)|
|Priority|int|int|
|RequireReference|bool|bit|
|Type|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "AccountId", "Priority");
b.ToTable("StatementRule", "finance");
```

## PersonalFinance.Api.Domain.StatementTask

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Cursor|string|nvarchar(max)|
|CursorDate|DateTimeOffset?|datetimeoffset|
|EndsAt|DateTimeOffset|datetimeoffset|
|Failed|int|int|
|Processed|int|int|
|ResultsJson|string|nvarchar(max)|
|StartsAt|DateTimeOffset|datetimeoffset|
|State|string|nvarchar(40)|
|Total|int|int|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("UserId", "AccountId", "CreatedAt");
b.ToTable("StatementTask", "finance");
```

## PersonalFinance.Api.Domain.StatementTaskStep

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|EngineVersion|string|nvarchar(max)|
|Failed|int|int|
|Processed|int|int|
|ResultsJson|string|nvarchar(max)|
|Sequence|int|int|
|StatementTaskId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("StatementTaskId");
b.HasIndex("UserId", "StatementTaskId", "Sequence") .IsUnique();
b.ToTable("StatementTaskStep", "finance");
```

## PersonalFinance.Api.Domain.StatisticsRules

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|IncludeAssetLoss|bool|bit|
|IncludeDecreasingAdjustments|bool|bit|
|IncludeFees|bool|bit|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId") .IsUnique();
b.ToTable("Rules", "finance");
```

## PersonalFinance.Api.Domain.StoredDocument

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Content|byte[]|varbinary(max)|
|ContentType|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Kind|string|nvarchar(40)|
|Name|string|nvarchar(max)|
|PayrollId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("PayrollId");
b.HasIndex("UserId", "Kind", "CreatedAt", "Id");
b.HasIndex("UserId", "Kind", "CreatedAt", "Id"), new[] { "Name" });
b.ToTable("Documents", "finance");
```

## PersonalFinance.Api.Domain.Subscription

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AutoRenew|bool|bit|
|CancelledAt|DateTimeOffset?|datetimeoffset|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Name|string|nvarchar(150)|
|Note|string|nvarchar(max)|
|Provider|string|nvarchar(150)|
|RuleId|string|nvarchar(36)|
|ServiceEndsAt|DateTimeOffset?|datetimeoffset|
|State|string|nvarchar(40)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("RuleId") .IsUnique();
b.HasIndex("UserId");
b.ToTable("Subscriptions", "finance");
```

## PersonalFinance.Api.Domain.SubscriptionPrice

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EffectiveAt|DateTimeOffset|datetimeoffset|
|SubscriptionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.HasIndex("SubscriptionId", "EffectiveAt") .IsUnique();
b.ToTable("SubscriptionPrices", "finance", t => { t.HasCheckConstraint("CK_SubscriptionPrice_Amount", "[Amount]>0");
```

## PersonalFinance.Api.Domain.SupportTicket

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Content|string|nvarchar(4000)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Kind|string|nvarchar(40)|
|Reply|string|nvarchar(4000)|
|Status|string|nvarchar(40)|
|Subject|string|nvarchar(120)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("Status", "CreatedAt");
b.HasIndex("UserId", "CreatedAt");
b.ToTable("SupportTicket", "finance");
```

## PersonalFinance.Api.Domain.ThirdPartyAdvance

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|Amount|decimal|decimal(28,4)|
|Beneficiary|string|nvarchar(200)|
|BusinessId|string|nvarchar(36)|
|Consumer|string|nvarchar(200)|
|Counterparty|string|nvarchar(200)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|DeliveredOn|DateOnly?|date|
|DeliveryState|string|nvarchar(max)|
|GroupId|string|nvarchar(36)|
|Merchant|string|nvarchar(200)|
|Name|string|nvarchar(200)|
|Note|string|nvarchar(2000)|
|OccurredAt|DateTimeOffset|datetimeoffset|
|OwnAmount|decimal|decimal(28,4)|
|OwnTransactionId|string|nvarchar(36)|
|Payer|string|nvarchar(200)|
|Platform|string|nvarchar(200)|
|Quantity|decimal|decimal(28,8)|
|Recipient|string|nvarchar(200)|
|Unit|string|nvarchar(max)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("BusinessId") .IsUnique() .HasFilter("[BusinessId] IS NOT NULL");
b.HasIndex("OwnTransactionId") .IsUnique() .HasFilter("[OwnTransactionId] IS NOT NULL");
b.HasIndex("UserId", "GroupId");
b.ToTable("ThirdPartyAdvance", "finance", t => { t.HasCheckConstraint("CK_ThirdPartyAdvance", "[Amount]>0 AND [OwnAmount]>=0 AND [OwnAmount]<=[Amount] AND [Quantity]>0 AND [Version]>0");
```

## PersonalFinance.Api.Domain.TimeActivity

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ActiveSince|DateTimeOffset?|datetimeoffset|
|Category|string|nvarchar(max)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Note|string|nvarchar(2000)|
|ProjectId|string|nvarchar(36)|
|SegmentsJson|string|nvarchar(max)|
|State|string|nvarchar(40)|
|Title|string|nvarchar(200)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId") .IsUnique() .HasFilter("[State] = 'Running'");
b.ToTable("TimeActivity", "finance");
```

## PersonalFinance.Api.Domain.TimeBudget

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Category|string|nvarchar(40)|
|Minutes|int|int|
|Period|string|nvarchar(450)|
|StartDate|DateOnly|date|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.HasIndex("UserId", "Period", "StartDate", "Category") .IsUnique();
b.ToTable("TimeBudget", "finance");
```

## PersonalFinance.Api.Domain.TimeFinanceLink

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ActivityId|string|nvarchar(36)|
|ProjectId|string|nvarchar(36)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("TransactionId");
b.HasIndex("UserId");
b.HasIndex("UserId", "TransactionId", "ActivityId", "ProjectId") .IsUnique();
b.ToTable("TimeFinanceLink", "finance");
```

## PersonalFinance.Api.Domain.TimeProject

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|ActualReturn|decimal|decimal(28,4)|
|BudgetMinutes|int|int|
|Goal|string|nvarchar(max)|
|Name|string|nvarchar(max)|
|ReturnUnit|string|nvarchar(max)|
|State|string|nvarchar(40)|
|TargetReturn|decimal|decimal(28,4)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("TimeProject", "finance");
```

## PersonalFinance.Api.Domain.TimeTemplate

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Category|string|nvarchar(max)|
|Minutes|int|int|
|Name|string|nvarchar(max)|
|ProjectId|string|nvarchar(36)|
|Repeat|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.ToTable("TimeTemplate", "finance");
```

## PersonalFinance.Api.Domain.TimeValuation

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|EffectiveFrom|DateOnly|date|
|HourlyRate|decimal|decimal(28,8)|
|Hours|decimal|decimal(28,4)|
|Income|decimal|decimal(28,4)|
|Method|string|nvarchar(max)|
|Revision|int|int|
|Source|string|nvarchar(max)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId");
b.HasIndex("UserId", "Revision") .IsUnique();
b.ToTable("TimeValuation", "finance");
```

## PersonalFinance.Api.Domain.TransactionAnalysisAttribute

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|Behavior|string|nvarchar(40)|
|CategoryId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Note|string|nvarchar(2000)|
|TransactionId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("CategoryId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "CategoryId") .IsUnique() .HasFilter("[CategoryId] IS NOT NULL");
b.HasIndex("UserId", "TransactionId") .IsUnique() .HasFilter("[TransactionId] IS NOT NULL");
b.ToTable("TransactionAnalysisAttribute", "finance", t => { t.HasCheckConstraint("CK_AnalysisAttribute_Values", "([CategoryId] IS NULL AND [TransactionId] IS NOT NULL OR [CategoryId] IS NOT NULL AND [TransactionId] IS NULL) AND [Behavior] IN ('Unknown','FixedExpense','VariableExpense','FixedIncome','VariableIncome','OneTimeIncome','OtherIncome') AND [Version]>0");
```

## PersonalFinance.Api.Domain.TransactionBatchRecord

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|ResultJson|string|nvarchar(max)|
|State|string|nvarchar(40)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("UserId", "CreatedAt");
b.ToTable("TransactionBatchRecord", "finance");
```

## PersonalFinance.Api.Domain.TransactionReview

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|DeferredUntil|DateTimeOffset?|datetimeoffset|
|Note|string|nvarchar(max)|
|State|string|nvarchar(40)|
|TransactionId|string|nvarchar(36)|
|UpdatedAt|DateTimeOffset|datetimeoffset|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "TransactionId") .IsUnique();
b.ToTable("TransactionReview", "finance");
```

## PersonalFinance.Api.Domain.TransactionStatementMatch

|字段|CLR类型|SQL类型|
|---|---|---|
|Id|string|nvarchar(36)|
|AccountId|string|nvarchar(36)|
|CreatedAt|DateTimeOffset|datetimeoffset|
|Currency|string|nvarchar(3)|
|LedgerAmount|decimal|decimal(28,4)|
|Note|string|nvarchar(2000)|
|State|string|nvarchar(40)|
|StatementAmount|decimal|decimal(28,4)|
|StatementReference|string|nvarchar(200)|
|TransactionId|string|nvarchar(36)|
|UserId|string|nvarchar(36)|
|Version|long|bigint|

```csharp
b.HasKey("Id");
b.HasIndex("AccountId");
b.HasIndex("TransactionId");
b.HasIndex("UserId", "TransactionId");
b.HasIndex("UserId", "AccountId", "StatementReference") .IsUnique() .HasFilter("[State] = N'Matched'");
b.ToTable("TransactionStatementMatch", "finance");
```

## PersonalFinance.Api.Domain.TransactionTag

|字段|CLR类型|SQL类型|
|---|---|---|
|TransactionId|string|nvarchar(36)|
|DirectoryId|string|nvarchar(36)|

```csharp
b.HasKey("TransactionId", "DirectoryId");
b.HasIndex("DirectoryId");
b.ToTable("TransactionTag", "finance");
```

## PersonalFinance.Api.Domain.Account

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AccountGroup", null) .WithMany() .HasForeignKey("GroupId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AccountFundHold

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AccountGroup

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AdvanceAdjustment

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ThirdPartyAdvance", null) .WithMany() .HasForeignKey("AdvanceId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AdvancePurchasePlan

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.ThirdPartyAdvance", null) .WithMany() .HasForeignKey("AdvanceId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentEvent

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentGrant

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentMemory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentReport

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentSetting

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentStep

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AiAgentTask", null) .WithMany() .HasForeignKey("TaskId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentTask

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiAgentWorkflow

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiConversation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiMessage

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AiConversation", null) .WithMany() .HasForeignKey("ConversationId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiRequestAudit

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AiTransactionDraft

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AnnualBudget

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AnnualBudgetAllocation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AnnualBudget", null) .WithMany("Allocations") .HasForeignKey("AnnualBudgetId") .OnDelete(DeleteBehavior.Cascade) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
```

## PersonalFinance.Api.Domain.AssetAggregationPolicy

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AuditRecord

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AuthorizedPayment

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.PaymentInstrument", null) .WithMany() .HasForeignKey("InstrumentId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AutomationExecution

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.RecurringOccurrence", null) .WithMany() .HasForeignKey("OccurrenceId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AutomationRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.AutomationRule

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Budget

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.BudgetAlertSetting

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.BudgetAlertState

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.BudgetCarryover

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.BudgetChangeHistory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.BudgetLine

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Budget", null) .WithMany("Items") .HasForeignKey("BudgetId") .OnDelete(DeleteBehavior.Cascade) .IsRequired();
```

## PersonalFinance.Api.Domain.BudgetTemplate

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Business

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.CashFlowScenario

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.CashbackReceivable

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("SettlementTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.CashbackRecovery

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.CashbackReceivable", null) .WithMany() .HasForeignKey("CashbackId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Category

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("ParentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.CompensationPlan

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployment", null) .WithMany() .HasForeignKey("EmploymentId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.CurrencyPreference

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.CustomReportDefinition

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.DebtPaymentAllocation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.DebtRepaymentPlan", null) .WithMany() .HasForeignKey("PlanId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.DebtPlanHistory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.DebtRepaymentPlan", null) .WithMany() .HasForeignKey("PlanId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.DebtRepaymentPlan

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.Business", null) .WithMany() .HasForeignKey("BusinessId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("OriginalTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.DirectoryItem

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Entry

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany("Entries") .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.Cascade) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.EssentialExpensePolicy

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ExternalPaymentFact

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FinanceSpace

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceSpace", null) .WithMany() .HasForeignKey("FamilyId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FinanceTransaction

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FinancialMemory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FuelRecord

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FuelVehicle", null) .WithMany() .HasForeignKey("VehicleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FuelVehicle

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FundHoldEvent

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AccountFundHold", null) .WithMany() .HasForeignKey("HoldId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FundHoldEvent", null) .WithMany() .HasForeignKey("ReversalOfId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FutureCashFlowItem

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.CashFlowScenario", null) .WithMany() .HasForeignKey("ScenarioId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("ToAccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.FxValuationRate

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.GoalAllocation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.SavingsGoal", null) .WithMany() .HasForeignKey("GoalId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.GoalAllocationHistory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.SavingsGoal", null) .WithMany() .HasForeignKey("GoalId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.SavingsGoal", null) .WithMany() .HasForeignKey("ToGoalId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.HousingFundAccount

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployment", null) .WithMany() .HasForeignKey("EmploymentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Business", null) .WithMany() .HasForeignKey("LoanBusinessId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.HousingFundEvent

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.HousingFundAccount", null) .WithMany() .HasForeignKey("FundAccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Idempotency

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ImportAttempt

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ImportJob", null) .WithMany() .HasForeignKey("ImportJobId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ImportCleaningEvent

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ImportJob", null) .WithMany() .HasForeignKey("ImportJobId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ImportJob

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ImportRecognitionSuggestion

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ImportRow

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ImportJob", null) .WithMany("Rows") .HasForeignKey("ImportJobId") .OnDelete(DeleteBehavior.Cascade) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.InvestmentAsset

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.InvestmentHistory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.InvestmentAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.InvestmentTrade

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.InvestmentAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.InvestmentValuation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.InvestmentAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Invitation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("CreatedByUserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UsedByUserId") .OnDelete(DeleteBehavior.NoAction);
```

## PersonalFinance.Api.Domain.LivingCostBasket

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.LivingCostBasketItem

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.LivingCostBasket", null) .WithMany() .HasForeignKey("BasketId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ManagedAsset

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("FundingTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("InterestTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("LiabilityAccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("SettlementTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ManagedAssetValuation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ManagedAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.MerchantAlias

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.DirectoryItem", null) .WithMany() .HasForeignKey("MerchantId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PaymentInstrument

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollComponent

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollStatement", null) .WithMany() .HasForeignKey("PayrollId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollEmployer

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollEmployment

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployer", null) .WithMany() .HasForeignKey("EmployerId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollImportJob

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.StoredDocument", null) .WithMany() .HasForeignKey("DocumentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollPayment

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollStatement", null) .WithMany() .HasForeignKey("PayrollId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollRevision

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollStatement", null) .WithMany() .HasForeignKey("PayrollId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollStatement

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployment", null) .WithMany() .HasForeignKey("EmploymentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollImportJob", null) .WithMany() .HasForeignKey("ImportJobId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.CompensationPlan", null) .WithMany() .HasForeignKey("PlanId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollTaxCalculation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployment", null) .WithMany() .HasForeignKey("EmploymentId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.PayrollTaxRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollTaxDeclaration

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployment", null) .WithMany() .HasForeignKey("EmploymentId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.PayrollTaxRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PayrollTaxRule

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PhysicalCategory

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PhysicalCategory", null) .WithMany() .HasForeignKey("ParentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PhysicalCostLink

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ManagedAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PhysicalEvent

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ManagedAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PhysicalProfile

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ManagedAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.PhysicalCategory", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("PaymentAccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PhysicalValueRule

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.ManagedAsset", null) .WithMany() .HasForeignKey("AssetId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PrepaymentContract

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AssetAccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("FundingTransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PrepaymentSettlement

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PrepaymentContract", null) .WithMany() .HasForeignKey("ContractId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.PrepaymentSettlement", null) .WithMany() .HasForeignKey("ReversalOfId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ProductPriceObservation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("SourceTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PromotionBenefit

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PromotionTransferDraft

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("SubsidyTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("ToAccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransferTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.PromotionUsage

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PromotionBenefit", null) .WithMany() .HasForeignKey("BenefitId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("RefundTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Reconciliation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.RecurringExecution

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.RecurringOccurrence", null) .WithMany() .HasForeignKey("OccurrenceId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.RecurringRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.RecurringOccurrence

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.RecurringRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.RecurringRule

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("ToAccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SavingsGoal

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ScenarioCalculation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.CashFlowScenario", null) .WithMany() .HasForeignKey("ScenarioId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Session

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SharedTransaction

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceSpace", null) .WithMany() .HasForeignKey("BookId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.SpaceMember", null) .WithMany() .HasForeignKey("ConsumerId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.SpaceMember", null) .WithMany() .HasForeignKey("PayerId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SocialContributionRecord

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollEmployment", null) .WithMany() .HasForeignKey("EmploymentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.HousingFundAccount", null) .WithMany() .HasForeignKey("FundAccountId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.Business", null) .WithMany() .HasForeignKey("LoanBusinessId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollComponent", null) .WithMany() .HasForeignKey("PayrollComponentId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.PayrollStatement", null) .WithMany() .HasForeignKey("PayrollId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.SocialInsurancePolicy", null) .WithMany() .HasForeignKey("PolicyId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SocialInsurancePolicy

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SpaceBudget

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceSpace", null) .WithMany() .HasForeignKey("SpaceId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SpaceInvitation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceSpace", null) .WithMany() .HasForeignKey("SpaceId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SpaceMember

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("LinkedUserId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceSpace", null) .WithMany() .HasForeignKey("SpaceId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SpaceSettlement

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.SpaceMember", null) .WithMany() .HasForeignKey("FromMemberId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceSpace", null) .WithMany() .HasForeignKey("SpaceId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.SpaceMember", null) .WithMany() .HasForeignKey("ToMemberId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatementBalanceSnapshot

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatementLink

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.StatementRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.StatementRecord", null) .WithMany() .HasForeignKey("StatementRecordId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatementRecord

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.ImportJob", null) .WithMany() .HasForeignKey("ImportJobId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.ImportRow", null) .WithMany() .HasForeignKey("ImportRowId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatementRule

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatementTask

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatementTaskStep

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.StatementTask", null) .WithMany() .HasForeignKey("StatementTaskId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StatisticsRules

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.StoredDocument

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.PayrollStatement", null) .WithMany() .HasForeignKey("PayrollId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.Subscription

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.RecurringRule", null) .WithMany() .HasForeignKey("RuleId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SubscriptionPrice

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Subscription", null) .WithMany() .HasForeignKey("SubscriptionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.SupportTicket

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.ThirdPartyAdvance

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.Business", null) .WithMany() .HasForeignKey("BusinessId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("OwnTransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TimeActivity

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TimeBudget

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TimeFinanceLink

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TimeProject

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TimeTemplate

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TimeValuation

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TransactionAnalysisAttribute

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Category", null) .WithMany() .HasForeignKey("CategoryId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction);
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TransactionBatchRecord

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TransactionReview

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TransactionStatementMatch

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.Account", null) .WithMany() .HasForeignKey("AccountId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany() .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.AppUser", null) .WithMany() .HasForeignKey("UserId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
```

## PersonalFinance.Api.Domain.TransactionTag

|字段|CLR类型|SQL类型|
|---|---|---|

```csharp
b.HasOne("PersonalFinance.Api.Domain.DirectoryItem", null) .WithMany() .HasForeignKey("DirectoryId") .OnDelete(DeleteBehavior.NoAction) .IsRequired();
b.HasOne("PersonalFinance.Api.Domain.FinanceTransaction", null) .WithMany("Tags") .HasForeignKey("TransactionId") .OnDelete(DeleteBehavior.Cascade) .IsRequired();
```

## PersonalFinance.Api.Domain.AnnualBudget

|字段|CLR类型|SQL类型|
|---|---|---|

## PersonalFinance.Api.Domain.Budget

|字段|CLR类型|SQL类型|
|---|---|---|

## PersonalFinance.Api.Domain.FinanceTransaction

|字段|CLR类型|SQL类型|
|---|---|---|

## PersonalFinance.Api.Domain.ImportJob

|字段|CLR类型|SQL类型|
|---|---|---|


## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
