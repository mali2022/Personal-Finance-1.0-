#Requires -Version 7.0
param([Parameter(Mandatory)][string]$Database,[Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference='Stop'
if($Database -cne 'PersonalFinanceWeb' -and $Database -cnotmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$'){throw '数据库未列入只读审计范围'}
if(Test-Path -LiteralPath $OutputFile){throw '审计输出已存在，拒绝覆盖证据'}
$auditOutput=& sqlcmd -S . -E -C -b -f 65001 -y 0 -w 65535 -d $Database -i (Join-Path $PSScriptRoot 'stage-z-financial-audit.sql')
if($LASTEXITCODE){throw '只读审计执行失败，不能标记通过'}
$match=[regex]::Match(($auditOutput -join "`n"),'(?s)PF_JSON_BEGIN\s*(.*?)\s*PF_JSON_END')
if(-not $match.Success){throw '审计未返回完整结果'}
$report=($match.Groups[1].Value -replace '[\r\n]','')|ConvertFrom-Json -Depth 100
$report|ConvertTo-Json -Depth 100|Set-Content -LiteralPath $OutputFile
if(-not $report.passed){throw '发现资金异常；仅已输出定位报告，未修复数据'}
Write-Output '17 类只读资金检查通过；无领域样本的规则仍须结合隔离业务测试。'
