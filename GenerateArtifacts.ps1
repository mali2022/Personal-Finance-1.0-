$ErrorActionPreference = 'Stop'
$scriptText = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Build.sql'))
$sqlDirectory = Join-Path $PSScriptRoot 'sql'
[System.IO.Directory]::CreateDirectory($sqlDirectory) | Out-Null
$encoding = [System.Text.UTF8Encoding]::new($true)
$moduleMatches = [regex]::Matches($scriptText, '(?m)^-- MODULE ([^\r\n]+)\r?$')
for ($i = 0; $i -lt $moduleMatches.Count; $i++) {
    $start = $moduleMatches[$i].Index
    $end = if ($i + 1 -lt $moduleMatches.Count) { $moduleMatches[$i + 1].Index } else { $scriptText.Length }
    $body = $scriptText.Substring($start, $end - $start)
    if ($i -gt 0) {
        $guard = @'
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
'@
        $body = $guard + "`r`n" + $body
    }
    [System.IO.File]::WriteAllText((Join-Path $sqlDirectory ($moduleMatches[$i].Groups[1].Value + '.sql')), $body, $encoding)
}
$dll = 'C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\Extensions\Application\Microsoft.SqlServer.TransactSql.ScriptDom.dll'
Add-Type -Path $dll
$parser = [Microsoft.SqlServer.TransactSql.ScriptDom.TSql150Parser]::new($true)
$errors = $null
$fragment = $parser.Parse([System.IO.StringReader]::new($scriptText), [ref]$errors)
if ($errors.Count -gt 0) { $errors | Format-Table; throw 'SQL Server 2019语法检查失败' }
$generator = [Microsoft.SqlServer.TransactSql.ScriptDom.Sql150ScriptGenerator]::new()
function Get-SqlText($node) {
    $out = $null
    $generator.GenerateScript($node, [ref]$out)
    return ($out -replace '\s+', ' ').Trim()
}
$purposes = @{
 Currencies='币种与原币小数精度'; Users='用户与固定本位币'; AccountTypes='账户性质、流动性与信用卡属性';
 TransactionTypes='有限业务类型'; Sources='标准数据来源'; Counterparties='个人/机构业务对象';
 Tags='辅助标签'; Projects='项目与整体预算'; Accounts='资金/应收/应付账户主数据'; Categories='两层损益分类';
 Merchants='商户主数据与默认分类'; Transactions='业务凭证头'; TransactionEntries='唯一财务事实：有符号平衡分录';
 TransactionTags='交易与标签多对多'; Attachments='外部凭证文件元数据'; Loans='贷款合同属性';
 Reimbursements='报销办理属性'; AccountReconciliations='账户对账快照'; ReconciledEntries='已核验账户分录';
 ExchangeRates='当前估值汇率历史'; AuditLogs='分类纠错审计'; Budgets='月度预算'; BudgetItems='分类预算条目';
 RecurringTransactions='定期交易规则'; RecurringEntries='定期交易分录模板'; RecurringOccurrences='到期日幂等发生记录'
}
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# 完整表结构字典')
$lines.Add('')
$lines.Add('由 Build.sql 的 SQL Server 2019 语法树生成。时间审计默认 UTC。主键列隐含 NOT NULL；计算列值由表达式产生。IDENTITY 从1递增1。无 DEFAULT 的非空字段必须由调用方提供。表级约束原文补充列级约束；所有外键默认 NO ACTION，无级联删除。')
foreach ($batch in $fragment.Batches) {
 foreach ($statement in $batch.Statements) {
  if ($statement -is [Microsoft.SqlServer.TransactSql.ScriptDom.CreateTableStatement]) {
   $name = $statement.SchemaObjectName.BaseIdentifier.Value
   $lines.Add(''); $lines.Add('## ' + $name); $lines.Add(''); $lines.Add($purposes[$name]); $lines.Add('')
   $lines.Add('| 字段 | 数据类型/计算式 | 可空 | 默认/自增 | 列级约束 |')
   $lines.Add('|---|---|---|---|---|')
   foreach ($column in $statement.Definition.ColumnDefinitions) {
    $type = if ($column.ComputedColumnExpression) { 'AS ' + (Get-SqlText $column.ComputedColumnExpression) } else { Get-SqlText $column.DataType }
    $nullState = '是'
    $constraints = [System.Collections.Generic.List[string]]::new()
    foreach ($constraint in $column.Constraints) {
     $s = Get-SqlText $constraint
     if ($s -eq 'NOT NULL' -or $s -match 'PRIMARY KEY') { $nullState = '否' }
     $constraints.Add($s)
    }
    if ($column.ComputedColumnExpression) { $nullState = '计算列' }
    $default = if ($column.DefaultConstraint) { Get-SqlText $column.DefaultConstraint } else { '—' }
    if ($column.IdentityOptions) { $default = 'IDENTITY(1,1)' }
    $lines.Add('| ' + $column.ColumnIdentifier.Value + ' | ' + $type + ' | ' + $nullState + ' | ' + $default + ' | ' + ($constraints -join '; ') + ' |')
   }
   if ($statement.Definition.TableConstraints.Count -gt 0) {
    $lines.Add(''); $lines.Add('表级主键、外键、唯一和 CHECK：'); $lines.Add(''); $lines.Add('```sql')
    foreach ($constraint in $statement.Definition.TableConstraints) { $lines.Add((Get-SqlText $constraint)) }
    $lines.Add('```')
   }
  }
 }
}
$lines.Add(''); $lines.Add('## 索引原文'); $lines.Add(''); $lines.Add('```sql')
foreach ($batch in $fragment.Batches) { foreach ($statement in $batch.Statements) {
 if ($statement -is [Microsoft.SqlServer.TransactSql.ScriptDom.CreateIndexStatement]) { $lines.Add((Get-SqlText $statement)) }
}}
$lines.Add('```')
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot 'Personal Finance 测试版 0.0.0 - 002 - Personal Finance 测试版 0.0.0 - 002 - Schema.md'), $lines, $encoding)
"Generated $($moduleMatches.Count) modules; SQL Server 2019 ParseErrors=0"
