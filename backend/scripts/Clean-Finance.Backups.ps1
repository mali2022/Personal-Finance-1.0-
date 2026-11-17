#Requires -Version 7.0
[CmdletBinding()]
param([switch]$Apply)

# Preview by default. This script removes old backup binaries only.
# It never drops databases or deletes source, credentials, keys, or metadata.
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
$backupRoot = Get-RecoveryRoot
$comparison = [StringComparison]::OrdinalIgnoreCase
$mutex = [Threading.Mutex]::new($false, 'Local\PersonalFinanceStageZBackup')
if (-not $mutex.WaitOne(0)) {
    $mutex.Dispose()
    throw 'A scheduled backup is active. Retry after it finishes.'
}
try {
    $verified = @(foreach ($folder in Get-ChildItem -LiteralPath $backupRoot -Directory) {
        if ($folder.Name -cnotmatch '^\d{8}T\d{6}Z_[a-f0-9]{32}$') { continue }
        $manifestPath = Join-Path $folder.FullName 'manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.state -eq 'Verified' -and $manifest.database -eq 'PersonalFinanceWeb') {
            [PSCustomObject]@{ BackupId=$folder.Name; FinishedAt=$manifest.finishedAt }
        }
    })
    $latest = $verified | Sort-Object FinishedAt -Descending | Select-Object -First 1
    if (-not $latest) { throw 'No verified backup is available; cleanup refused.' }
    $keptManifest = Read-VerifiedManifest $latest.BackupId
    $keptBackup = [IO.Path]::GetFullPath((Join-Path (Get-ProtectedBackupFolder $latest.BackupId) 'database.bak'))
    $targets = @(Get-ChildItem -LiteralPath $backupRoot -File -Force -Recurse | Where-Object {
        $_.Extension -in @('.bak', '.pfz', '.partial') -and
        -not $_.FullName.Equals($keptBackup, $comparison)
    })
    foreach ($file in $targets) {
        $absolute = [IO.Path]::GetFullPath($file.FullName)
        if (-not $absolute.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, $comparison)) {
            throw 'Cleanup target is outside the backup directory.'
        }
        Assert-NoReparsePoint $absolute
    }
    $bytes = 0L
    foreach ($file in $targets) { $bytes += $file.Length }
    $targets | Select-Object @{Name='BackupFile';Expression={
        [IO.Path]::GetRelativePath($backupRoot, $_.FullName)
    }}, @{Name='MiB';Expression={[math]::Round($_.Length / 1MB, 2)}} | Format-Table -AutoSize
    Write-Host ('Keep: ' + [IO.Path]::GetRelativePath($backupRoot, $keptBackup))
    Write-Host ('Old backup binaries: {0} files, {1:N2} MiB.' -f $targets.Count, ($bytes / 1MB))
    if (-not $Apply) {
        Write-Host 'Preview only. No files deleted. Add -Apply to remove the listed old backups.'
        return
    }
    $prunedAt = [DateTimeOffset]::UtcNow.ToString('o')
    foreach ($file in $targets) {
        $absolute = [IO.Path]::GetFullPath($file.FullName)
        if (-not $absolute.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, $comparison) -or
            $absolute.Equals($keptBackup, $comparison)) {
            throw 'Cleanup target changed or overlaps the retained backup.'
        }
        Assert-NoReparsePoint $absolute
        Remove-Item -LiteralPath $absolute -Force
        if ($file.Name -eq 'database.bak') {
            $manifestPath = Join-Path $file.DirectoryName 'manifest.json'
            if (Test-Path -LiteralPath $manifestPath) {
                $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable
                $manifest['previousState'] = $manifest['state']
                $manifest['state'] = 'Pruned'
                $manifest['prunedAt'] = $prunedAt
                $manifest['prunedReason'] = 'Project cleanup; newest verified backup retained.'
                Write-RecoveryJson $manifestPath $manifest
            }
        }
    }
    if ((Get-Item -LiteralPath $keptBackup).Length -ne $keptManifest.fileBytes -or
        (Get-FileHash -LiteralPath $keptBackup -Algorithm SHA256).Hash -cne $keptManifest.sha256) {
        throw 'The retained backup integrity check failed.'
    }
    Write-Host ('Removed {0:N2} MiB. Newest verified backup and all keys/metadata preserved.' -f ($bytes / 1MB))
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
