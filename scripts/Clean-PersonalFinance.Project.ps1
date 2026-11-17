#Requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$Apply,
    [ValidateRange(24, 87600)][int]$MinimumAgeHours = 24,
    [string]$ReportPath
)

# Preview by default. Only audited generated artifacts are candidates.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$separator = [IO.Path]::DirectorySeparatorChar
$comparison = [StringComparison]::OrdinalIgnoreCase
$cutoff = [DateTime]::UtcNow.AddHours(-$MinimumAgeHours)
$targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$publishRoots = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
$publishSnapshots = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
$projectProcesses = @(Get-CimInstance Win32_Process)
$skipped = [Collections.Generic.List[object]]::new()
$results = [Collections.Generic.List[object]]::new()
$protectedPaths = @(
    '.git', '.local-tools', '.tools', '.pnpm-store', '.local-run/wechat-import',
    '.local-run/cleanup-20261022', 'paper', 'verification', 'frontend/verification',
    'backend/verification', 'backend/.backups', 'backend/.nuget', 'backend/.runtime',
    'frontend/node_modules', 'frontend/dist', 'deploy/dist/api-linux',
    'deploy/dist/release-build-receipt.json', 'deploy/out/update-stage',
    'deploy/out/pf-update.tar.gz', 'releases/stage-z-release-20261011-validated'
) | ForEach-Object { [IO.Path]::GetFullPath((Join-Path $projectRoot $_)) }

function Test-Overlap([string]$First, [string]$Second) {
    $First.Equals($Second, $comparison) -or
        $First.StartsWith($Second + $separator, $comparison) -or
        $Second.StartsWith($First + $separator, $comparison)
}

function Get-GitProtectedPaths {
    $start = [Diagnostics.ProcessStartInfo]::new('git')
    $start.WorkingDirectory = $projectRoot
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.UseShellExecute = $false
    foreach ($arg in @('ls-files', '--cached', '--others', '--exclude-standard', '-z')) { $start.ArgumentList.Add($arg) }
    $process = [Diagnostics.Process]::Start($start)
    $output = $process.StandardOutput.ReadToEnd()
    $errors = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Cannot verify Git protection: $errors" }
    @($output.Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object {
        [IO.Path]::GetFullPath((Join-Path $projectRoot $_))
    })
}

function Assert-CleanupPath([string]$Path) {
    if (-not $Path.StartsWith($projectRoot + $separator, $comparison)) { throw 'Target is outside the project' }
    foreach ($protected in $protectedPaths) {
        if (Test-Overlap $Path $protected) { throw 'Protected project material' }
    }
    $relative = [IO.Path]::GetRelativePath($projectRoot, $Path).Replace('\', '/')
    if ($relative -match '(?i)(^|/)(Debug|\.keys|keys|node_modules|\.nuget|\.backups|verification|凭证)(/|$)') {
        throw 'Protected runtime, data, keys, dependencies, or verification evidence'
    }
    $cursor = $Path
    while ($cursor.Length -ge $projectRoot.Length) {
        if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked paths are excluded' }
        if ($cursor.Equals($projectRoot, $comparison)) { break }
        $cursor = Split-Path -Path $cursor -Parent
    }
}

function Add-Target([string]$Relative) {
    $path = [IO.Path]::GetFullPath((Join-Path $projectRoot $Relative))
    if (Test-Path -LiteralPath $path) { [void]$targets.Add($path) }
}

function Get-MetadataToken([object]$Item) {
    '{0}|{1}|{2}|{3}' -f $Item.PSIsContainer,
        $(if ($Item.PSIsContainer) { -1 } else { $Item.Length }),
        $Item.LastWriteTimeUtc.Ticks, [int]$Item.Attributes
}

function Get-PublishSnapshot([string]$Path, [switch]$CheckAge) {
    Assert-CleanupPath $Path
    $entries = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
    $queue = [Collections.Generic.Stack[object]]::new()
    $queue.Push((Get-Item -LiteralPath $Path -Force))
    while ($queue.Count) {
        $item = $queue.Pop()
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked publish content is excluded' }
        if ($CheckAge -and $item.LastWriteTimeUtc -gt $cutoff) {
            throw "Publish copy modified within the last $MinimumAgeHours hours"
        }
        $entries[$item.FullName] = Get-MetadataToken $item
        if ($item.PSIsContainer) {
            foreach ($child in Get-ChildItem -LiteralPath $item.FullName -Force) { $queue.Push($child) }
        }
    }
    [pscustomobject]@{ Entries=$entries }
}

function Assert-PublishSnapshot([object]$Expected, [object]$Actual) {
    if ($Expected.Count -ne $Actual.Count) { throw 'Publish copy gained or lost content after preview' }
    foreach ($key in $Expected.Keys) {
        if (-not $Actual.ContainsKey($key) -or $Actual[$key] -cne $Expected[$key]) {
            throw 'Publish copy metadata changed after preview'
        }
    }
}

function Add-PublishItems([string]$Directory) {
    $path = if ([IO.Path]::IsPathFullyQualified($Directory)) {
        [IO.Path]::GetFullPath($Directory)
    } else { [IO.Path]::GetFullPath((Join-Path $projectRoot $Directory)) }
    if (-not (Test-Path -LiteralPath $path -PathType Container)) { return }
    Assert-CleanupPath $path
    foreach ($process in $projectProcesses) {
        if ($process.ProcessId -eq $PID) { continue }
        if (($process.ExecutablePath -and (Test-Overlap $path $process.ExecutablePath)) -or
            ($process.CommandLine -and $process.CommandLine.IndexOf($path, $comparison) -ge 0)) {
            $skipped.Add([pscustomobject]@{ Path=$path; Reason="Running process uses publish copy (PID $($process.ProcessId))" })
            return
        }
    }
    # A new publish can contain dependency DLLs with old upstream timestamps.
    # Inspect the entire copy, including preserved configuration and directories.
    try { $publishSnapshots[$path] = (Get-PublishSnapshot $path -CheckAge).Entries }
    catch {
        $skipped.Add([pscustomobject]@{ Path=$path; Reason=$_.Exception.Message })
        return
    }
    foreach ($item in Get-ChildItem -LiteralPath $path -Force) {
        # Preserve configuration and keys inside obsolete copies.
        if ($item.Name -match '(?i)^(appsettings.*\.json|\.keys|keys|.*credential.*|\.env.*|key-.*\.xml)$') { continue }
        [void]$targets.Add($item.FullName)
        $publishRoots[$item.FullName] = $path
    }
}

foreach ($relative in @(
    'backend/.c2-build', 'backend/.d-build', 'backend/.f-build',
    'backend/test-results', 'frontend/test-results', 'test-results',
    'frontend/dist-f', 'frontend/tsconfig.tsbuildinfo'
)) { Add-Target $relative }

foreach ($relative in @(
    'backend/src/PersonalFinance.Api/bin/Release',
    'backend/src/PersonalFinance.Api/bin/AiValidation',
    'backend/src/PersonalFinance.Api/bin/PayrollBrowser',
    'backend/tests/PersonalFinance.Tests/bin/Release',
    'backend/tests/PersonalFinance.Tests/bin/AiValidation'
)) {
    $path = Join-Path $projectRoot $relative
    if (Test-Path -LiteralPath $path -PathType Container) {
        foreach ($framework in Get-ChildItem -LiteralPath $path -Directory -Force) { Add-PublishItems $framework.FullName }
    }
}
foreach ($relative in @(
    'backend/src/PersonalFinance.Api/obj/Release',
    'backend/src/PersonalFinance.Api/obj/AiValidation',
    'backend/src/PersonalFinance.Api/obj/PayrollBrowser',
    'backend/tests/PersonalFinance.Tests/obj/Release',
    'backend/tests/PersonalFinance.Tests/obj/AiValidation'
)) { Add-Target $relative }

$localRun = Join-Path $projectRoot '.local-run'
if (Test-Path -LiteralPath $localRun -PathType Container) {
    foreach ($directory in Get-ChildItem -LiteralPath $localRun -Directory -Force) {
        if ($directory.Name -match '^load-[0-9a-f]{32}$') { Add-PublishItems (Join-Path $directory.FullName 'api') }
    }
}

# Retain historical scripts, SQL, CSV templates and current deployment packages.
foreach ($relative in @(
    'deploy/dist/api', 'deploy/dist/cloudfix-api', 'deploy/dist/default-prices-api',
    'deploy/dist/default-tags-api', 'deploy/dist/default-tags-final-api',
    'deploy/dist/ai-center-20261014/api', 'deploy/dist/ai-center-20261014/web',
    'deploy/dist/global-copilot-20261014', 'deploy/out/cloudfix-20261014/api',
    'deploy/out/cloudfix-20261014/web', 'deploy/out/default-prices-20261014/api',
    'deploy/out/default-prices-20261014/web', 'deploy/out/default-tags-20261014/api',
    'deploy/out/default-tags-20261014/web', 'deploy/out/pf-deploy/api', 'deploy/out/pf-deploy/web'
)) { Add-PublishItems $relative }

function Get-CheckedManifest([string]$Path, [string[]]$GitPaths, [object[]]$Processes) {
    Assert-CleanupPath $Path
    foreach ($protected in $GitPaths) {
        if (Test-Overlap $Path $protected) { throw 'Git tracked or non-ignored untracked content' }
    }
    $processScope = if ($publishRoots.ContainsKey($Path)) { $publishRoots[$Path] } else { $Path }
    foreach ($process in $Processes) {
        if ($process.ProcessId -eq $PID) { continue }
        if (($process.ExecutablePath -and (Test-Overlap $processScope $process.ExecutablePath)) -or
            ($process.CommandLine -and $process.CommandLine.IndexOf($processScope, $comparison) -ge 0)) {
            throw "Running process uses target (PID $($process.ProcessId))"
        }
    }
    $item = Get-Item -LiteralPath $Path -Force
    $items = [Collections.Generic.List[object]]::new()
    $items.Add($item)
    if ($item.PSIsContainer) {
        $queue = [Collections.Generic.Stack[string]]::new()
        $queue.Push($Path)
        while ($queue.Count) {
            foreach ($child in Get-ChildItem -LiteralPath $queue.Pop() -Force) {
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked content is excluded' }
                $items.Add($child)
                if ($child.PSIsContainer) { $queue.Push($child.FullName) }
            }
        }
    }
    if (@($items | Where-Object { $_.LastWriteTimeUtc -gt $cutoff }).Count) { throw "Modified within the last $MinimumAgeHours hours" }
    foreach ($entry in $items) {
        $relative = [IO.Path]::GetRelativePath($projectRoot, $entry.FullName).Replace('\', '/')
        if ($relative -match '(?i)(^|/)(\.keys|keys|Debug|verification|node_modules|\.nuget|\.backups)(/|$)' -or
            $entry.Name -match '(?i)(credential|^appsettings.*\.json$|^\.env|^key-.*\.xml$)' -or
            $entry.Extension -in @('.mdf','.ldf','.bak','.pfz','.pfx','.pem','.key','.cer','.crt','.db','.sqlite','.sqlite3','.csv','.xlsx','.xls','.sql','.cs','.csproj','.ps1','.mjs','.ts','.tsx','.py','.md')) {
            throw 'Data, keys, configuration, source, or evidence content is preserved'
        }
    }
    $files = @($items | Where-Object { -not $_.PSIsContainer })
    $bytes = 0L
    foreach ($file in $files) { $bytes += $file.Length }
    [pscustomobject]@{
        Path = $Path
        RelativePath = [IO.Path]::GetRelativePath($projectRoot, $Path).Replace('\', '/')
        Files = $files.Count
        Bytes = $bytes
        Signature = (($items | Sort-Object FullName | ForEach-Object {
            '{0}|{1}|{2}' -f $_.FullName, $(if ($_.PSIsContainer) { -1 } else { $_.Length }), $_.LastWriteTimeUtc.Ticks
        }) -join [Environment]::NewLine)
    }
}

$gitPaths = @(Get-GitProtectedPaths)
$processes = @(Get-CimInstance Win32_Process)
$plan = @(foreach ($target in $targets | Sort-Object) {
    try { Get-CheckedManifest $target $gitPaths $processes }
    catch { $skipped.Add([pscustomobject]@{ Path=$target; Reason=$_.Exception.Message }) }
})
$plannedBytes = 0L
$plannedFiles = 0L
$removedBytes = 0L
$removedFiles = 0L
foreach ($entry in $plan) { $plannedBytes += $entry.Bytes; $plannedFiles += $entry.Files }

$reportFile = $null
if ($ReportPath) {
    $reportFile = [IO.Path]::GetFullPath($ReportPath)
    if ((Test-Path -LiteralPath $reportFile) -or @($targets | Where-Object { Test-Overlap $reportFile $_ }).Count) {
        throw 'Report must be a new file outside cleanup targets'
    }
    $reportParent = Split-Path -Path $reportFile -Parent
    if (-not (Test-Path -LiteralPath $reportParent -PathType Container)) { throw 'Report parent directory does not exist' }
}
if ($Apply) {
    $startedRoots = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $blockedRoots = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $processedTargets = 0
    Write-Host ('Applying checked cleanup: {0} targets, {1:N2} GiB.' -f $plan.Count, ($plannedBytes / 1GB))
    foreach ($entry in $plan) {
        $publishRoot = if ($publishRoots.ContainsKey($entry.Path)) { $publishRoots[$entry.Path] } else { $null }
        try {
            if ($publishRoot) {
                if ($blockedRoots.Contains($publishRoot)) { throw 'Publish group stopped after a safety check failed' }
                # Check the full root age once before its first deletion. Later
                # deletions update our expected snapshot rather than resetting age.
                $freshRoot = Get-PublishSnapshot $publishRoot -CheckAge:(-not $startedRoots.Contains($publishRoot))
                Assert-PublishSnapshot $publishSnapshots[$publishRoot] $freshRoot.Entries
                [void]$startedRoots.Add($publishRoot)
            }
            # Repeat every safety check immediately before deleting this exact manifest.
            $verified = Get-CheckedManifest $entry.Path @(Get-GitProtectedPaths) @(Get-CimInstance Win32_Process)
            if ($entry.Signature -cne $verified.Signature) { throw 'Target changed after preview' }
            Assert-CleanupPath $entry.Path
            Remove-Item -LiteralPath $entry.Path -Recurse -Force
            if ($publishRoot) {
                $expected = $publishSnapshots[$publishRoot]
                foreach ($key in @($expected.Keys)) {
                    if ($key.Equals($entry.Path, $comparison) -or $key.StartsWith($entry.Path + $separator, $comparison)) {
                        [void]$expected.Remove($key)
                    }
                }
                # Only this direct parent's timestamp is changed by our deletion.
                # All remaining entries are compared again before the next leaf.
                $expected[$publishRoot] = Get-MetadataToken (Get-Item -LiteralPath $publishRoot -Force)
            }
            $removedBytes += $entry.Bytes
            $removedFiles += $entry.Files
            $results.Add([pscustomobject]@{ Path=$entry.Path; Bytes=$entry.Bytes; Files=$entry.Files; Status='Removed' })
        }
        catch {
            if ($publishRoot) { [void]$blockedRoots.Add($publishRoot) }
            $skipped.Add([pscustomobject]@{ Path=$entry.Path; Reason=$_.Exception.Message })
        }
        $processedTargets++
        if ($processedTargets % 50 -eq 0) {
            Write-Host ('Processed {0}/{1}; removed {2:N2} GiB.' -f $processedTargets, $plan.Count, ($removedBytes / 1GB))
        }
    }
}

$report = [pscustomobject]@{
    GeneratedAtUtc = [DateTime]::UtcNow.ToString('o')
    ProjectRoot = $projectRoot
    Mode = $(if ($Apply) { 'Apply' } else { 'Preview' })
    MinimumAgeHours = $MinimumAgeHours
    PlannedBytes = $plannedBytes
    PlannedFiles = $plannedFiles
    RemovedBytes = $removedBytes
    RemovedFiles = $removedFiles
    Plan = @($plan | Select-Object Path,RelativePath,Bytes,Files)
    Removed = @($results)
    Skipped = @($skipped)
}
if ($reportFile) {
    $reportBytes = [Text.UTF8Encoding]::new($false).GetBytes(($report | ConvertTo-Json -Depth 8))
    $stream = [IO.File]::Open($reportFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($reportBytes, 0, $reportBytes.Length) } finally { $stream.Dispose() }
}
$plan | Select-Object -First 30 RelativePath,Files,@{Name='MiB';Expression={[math]::Round($_.Bytes/1MB,2)}} | Format-Table -AutoSize
Write-Host ('{0}: planned {1} files / {2:N2} GiB; removed {3} files / {4:N2} GiB; skipped {5} targets.' -f $report.Mode,$plannedFiles,($plannedBytes/1GB),$removedFiles,($removedBytes/1GB),$skipped.Count)
$skipped | Group-Object Reason | Select-Object Count,Name | Format-Table -AutoSize
if (-not $Apply) { Write-Host 'Preview only. No artifacts deleted. Add -Apply to perform the checked cleanup.' }
