Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-FinanceSource([string]$Database) {
    if ($Database -cne 'PersonalFinanceWeb') { throw '只允许备份 PersonalFinanceWeb。' }
}
function Assert-FinanceTarget([string]$Database) {
    if ($Database -cnotmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') {
        throw '只允许恢复到随机命名的 RestoreCheck 新库，禁止覆盖正式库。'
    }
}
function Assert-LocalSqlServer([string]$Server) {
    if ($Server -notin @('.', '(local)', 'localhost', $env:COMPUTERNAME)) {
        throw '本工具只支持本机默认 SQL 实例，不接受远程服务器或任意连接字符串。'
    }
}
function ConvertTo-SqlLiteral([string]$Value) { return "N'" + $Value.Replace("'", "''") + "'" }
function Assert-NoReparsePoint([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and
            ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw '备份路径及其父目录不得为链接或重解析点。'
        }
        $parent = Split-Path -Path $cursor -Parent
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Get-RecoveryRoot {
    $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.backups'))
    Assert-NoReparsePoint $root
    return $root
}
function Get-ProtectedBackupFolder([string]$BackupId) {
    if ($BackupId -cnotmatch '^\d{8}T\d{6}Z_[a-f0-9]{32}$') { throw '备份编号无效。' }
    $folder = Join-Path (Get-RecoveryRoot) $BackupId
    Assert-NoReparsePoint $folder
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw '备份不存在。' }
    return $folder
}
function Protect-RecoveryRoot {
    if (-not $IsWindows) { throw '当前版本仅支持 Windows 本地 SQL Server。' }
    $root = Get-RecoveryRoot
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $acl = Get-Acl -LiteralPath $root
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existing in @($acl.Access)) { $null = $acl.RemoveAccessRuleSpecific($existing) }
    $identities = @(
        [Security.Principal.WindowsIdentity]::GetCurrent().User,
        [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
        [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'),
        [Security.Principal.NTAccount]::new('NT SERVICE\MSSQLSERVER')
    )
    foreach ($identity in $identities) {
        $rights = if ($identity -is [Security.Principal.NTAccount]) { 'Modify' } else { 'FullControl' }
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $identity, $rights, 'ContainerInherit, ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($root), $acl)
    return $root
}
function Invoke-RecoverySql([string]$Server, [string]$Sql, [string]$WorkFolder) {
    Assert-LocalSqlServer $Server
    $command = (Get-Command sqlcmd -ErrorAction Stop).Source
    $inputFile = Join-Path $WorkFolder ('query-' + [Guid]::NewGuid().ToString('N') + '.sql')
    [IO.File]::WriteAllText($inputFile, "SET NOCOUNT ON;`n" + $Sql, [Text.UTF8Encoding]::new($false))
    try {
        $output = & $command -S $Server -E -C -No -b -V 11 -I -f 65001 -y 0 -w 65535 -t 300 -i $inputFile 2>&1
        if ($LASTEXITCODE -ne 0) {
            [IO.File]::WriteAllText((Join-Path $WorkFolder 'sql-error.log'), ($output -join "`n"))
            throw 'SQL 运维操作失败；详细日志保存在受保护的备份目录。'
        }
        return ($output -join "`n")
    } finally {
        Remove-Item -LiteralPath $inputFile -ErrorAction SilentlyContinue
    }
}
function ConvertFrom-RecoverySqlJson([string]$Output) {
    $match = [regex]::Match($Output, '(?s)PF_JSON_BEGIN\s*(.*?)\s*PF_JSON_END')
    if (-not $match.Success) { throw 'SQL 未返回完整校验数据。' }
    # sqlcmd may wrap a JSON value across physical lines; these values contain only metadata/hashes.
    return ($match.Groups[1].Value -replace '[\r\n]', '') | ConvertFrom-Json -Depth 100
}
function Write-RecoveryJson([string]$Path, $Value) {
    $temporary = $Path + '.tmp'
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Read-VerifiedManifest([string]$BackupId) {
    $folder = Get-ProtectedBackupFolder $BackupId
    $manifest = Get-Content -LiteralPath (Join-Path $folder 'manifest.json') -Raw | ConvertFrom-Json -Depth 100
    if ($manifest.formatVersion -ne 1 -or $manifest.backupId -cne $BackupId -or $manifest.state -ne 'Verified') {
        throw '备份清单版本、编号或状态无效。'
    }
    Assert-FinanceSource $manifest.database
    $file = Join-Path $folder 'database.bak'
    Assert-NoReparsePoint $file
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw '备份文件缺失。' }
    if ((Get-Item -LiteralPath $file).Length -ne $manifest.fileBytes -or
        (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -cne $manifest.sha256) {
        throw '备份文件大小或 SHA-256 校验失败，拒绝恢复。'
    }
    return $manifest
}
