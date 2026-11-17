#Requires -Version 7.0
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
$root = Get-RecoveryRoot
if (-not (Test-Path -LiteralPath $root)) { Write-Output '暂无备份。'; return }
Get-ChildItem -LiteralPath $root -Directory | Sort-Object Name -Descending | ForEach-Object {
    $backupFolderName = $_.Name
    $file = Join-Path $_.FullName 'manifest.json'
    if (Test-Path -LiteralPath $file) {
        try {
            $m = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json -Depth 100
            $runs = @(Get-ChildItem -LiteralPath $_.FullName -Directory -Filter 'restore-*' | ForEach-Object {
                $result = Join-Path $_.FullName 'verification.json'
                if (Test-Path -LiteralPath $result) {
                    (Get-Content -LiteralPath $result -Raw | ConvertFrom-Json).state
                }
            })
            [pscustomobject]@{ BackupId=$m.backupId; Database=$m.database; State=$m.state; StartedAt=$m.startedAt; RestoreChecks=($runs -join ', ') }
        } catch {
            [pscustomobject]@{ BackupId=$backupFolderName; Database='Unknown'; State='UnreadableManifest'; StartedAt=''; RestoreChecks='' }
        }
    }
}
