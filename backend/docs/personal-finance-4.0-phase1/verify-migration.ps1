param(
    [Parameter(Mandatory)][string]$BackupId,
    [Parameter(Mandatory)][string]$RestoredDatabase
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../scripts/recovery-common.ps1')
Assert-FinanceTarget $RestoredDatabase
$manifest = Read-VerifiedManifest $BackupId
$folder = Get-ProtectedBackupFolder $BackupId
$sqlFile = Join-Path $PSScriptRoot 'migration-phase1.sql'
if (-not (Test-Path -LiteralPath $sqlFile)) { throw 'Missing reviewed migration script' }
$copyLiteral = $RestoredDatabase
$null = Invoke-RecoverySql '.' "ALTER DATABASE [$copyLiteral] SET READ_WRITE WITH NO_WAIT;" $folder
try {
    foreach ($run in 1..2) {
        & sqlcmd -S . -E -C -I -b -f 65001 -d $RestoredDatabase -i $sqlFile -o (Join-Path $folder "phase1-migration-$run.log")
        if ($LASTEXITCODE -ne 0) { throw 'Migration or idempotent replay failed on the isolated restored copy' }
    }
    $snapshotSql = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../scripts/recovery-snapshot.sql') -Raw
    $after = ConvertFrom-RecoverySqlJson (Invoke-RecoverySql '.' "USE [$copyLiteral];`n$snapshotSql" $folder)
    $afterMap = @{}
    foreach ($table in $after.tables) { $afterMap[$table.name] = $table }
    foreach ($table in $manifest.baseline.tables | Where-Object name -notlike 'Ai*') {
        if (-not $afterMap.ContainsKey($table.name)) { throw ('Missing table: ' + $table.name) }
        $beforeHash = if ($table.PSObject.Properties['hash']) { $table.hash } else { $null }
        $afterHash = if ($afterMap[$table.name].PSObject.Properties['hash']) { $afterMap[$table.name].hash } else { $null }
        if ($afterMap[$table.name].count -ne $table.count -or $afterHash -cne $beforeHash -or ($table.count -gt 0 -and -not $beforeHash)) {
            throw ('Financial table changed during migration: ' + $table.name)
        }
    }
    foreach ($table in $manifest.baseline.tables | Where-Object name -like 'Ai*') {
        if (-not $afterMap.ContainsKey($table.name) -or $afterMap[$table.name].count -ne $table.count) { throw 'Existing AI records changed' }
    }
    if ($manifest.baseline.accountBalancesHash -cne $after.accountBalancesHash -or
        $manifest.baseline.attachmentCount -ne $after.attachmentCount -or $manifest.baseline.attachmentBytes -ne $after.attachmentBytes) {
        throw 'Account balances or attachments changed'
    }
    $record = [ordered]@{ backupId = $BackupId; restoredDatabase = $RestoredDatabase; migrationRuns = 2;
        financialTablesUnchanged = $true; accountBalancesUnchanged = $true; attachmentsUnchanged = $true;
        migrationCount = @($after.migrations).Count; checkedAt = [DateTimeOffset]::UtcNow.ToString('o') }
    Write-RecoveryJson (Join-Path $PSScriptRoot 'migration-verification.json') $record
    Write-Output 'Isolated restored copy: migration replay and all financial fingerprints passed.'
} finally {
    $null = Invoke-RecoverySql '.' "ALTER DATABASE [$copyLiteral] SET READ_ONLY WITH NO_WAIT;" $folder
}
