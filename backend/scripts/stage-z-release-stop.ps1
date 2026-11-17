#Requires -Version 7.0
param([Parameter(Mandatory)][string]$ReleaseDirectory)
$ErrorActionPreference='Stop'
$record=Get-Content -LiteralPath (Join-Path $ReleaseDirectory 'owned-process.json') -Raw|ConvertFrom-Json
$process=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if(-not $process){return}
if($process.Path -cne $record.exe -or $process.StartTime.ToUniversalTime().Ticks -ne ([DateTimeOffset]$record.startTime).UtcTicks){throw 'PID 已复用或进程路径不符，拒绝终止'}
Stop-Process -Id $process.Id
