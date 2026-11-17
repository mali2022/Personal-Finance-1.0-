$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'GenerateArtifacts.ps1')
$parser = [Microsoft.SqlServer.TransactSql.ScriptDom.TSql150Parser]::new($true)
$files = @((Join-Path $PSScriptRoot 'Build.sql'), (Join-Path $PSScriptRoot '13_ExtendedTests.sql'), (Join-Path $PSScriptRoot '14_IntegrityTests.sql'), (Join-Path $PSScriptRoot '15_DiagnoseInstallation.sql'))
$files += @(Get-ChildItem (Join-Path $PSScriptRoot 'sql') -Filter '*.sql' | Select-Object -ExpandProperty FullName)
$results = [System.Collections.Generic.List[string]]::new()
$results.Add('# 验证记录')
$results.Add('')
$results.Add('使用 SSMS 自带 ScriptDom TSql150Parser 对全部 SQL 文件做 SQL Server 2019 语法解析。此记录不代表数据库编译、绑定或断言执行已通过。')
$results.Add('')
$results.Add('| 文件 | 语法错误数 |')
$results.Add('|---|---|')
foreach ($file in $files) {
    $errors = $null
    $fragment = $parser.Parse([System.IO.StringReader]::new([System.IO.File]::ReadAllText($file)), [ref]$errors)
    if ($errors.Count -gt 0) { $errors | Format-Table; throw "Syntax errors in $file" }
    $results.Add('| ' + [System.IO.Path]::GetFileName($file) + ' | 0 |')
}
$results.Add('')
$results.Add('本次修复的实际执行仍待验证：开发工具连接localhost遇到加密/SSPI错误。请在已经连接的SSMS先运行15_DiagnoseInstallation.sql，再运行修复后的Build.sql及附加测试。用户截图中基准断言通过但建库失败，不能当作PersonalFinance安装成功。')
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot 'Personal Finance 测试版 0.0.0 - 003 - Personal Finance 测试版 0.0.0 - 003 - Validation.md'), $results, [System.Text.UTF8Encoding]::new($true))
"Parsed $($files.Count) SQL files; no SQL Server 2019 syntax errors."
