#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$files=[Collections.Generic.List[object]]::new()
$pending=[Collections.Generic.Stack[string]]::new(); $pending.Push($root)
$skipped=[Collections.Generic.List[string]]::new()
while($pending.Count){
 foreach($item in Get-ChildItem -LiteralPath $pending.Pop() -Force){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){$skipped.Add($item.FullName);continue}
  if($item.PSIsContainer){$pending.Push($item.FullName)}else{$files.Add($item)}
 }
}
$groups=$files | Group-Object { [IO.Path]::GetRelativePath($root,$_.FullName).Split([IO.Path]::DirectorySeparatorChar)[0] } | ForEach-Object {
 [pscustomobject]@{path=$_.Name;count=$_.Count;bytes=($_.Group | Measure-Object Length -Sum).Sum}
} | Sort-Object bytes -Descending
$candidates=$files | Where-Object { $_.FullName -match '\\(node_modules|bin|obj|dist|\.pnpm-store)\\' -and $_.FullName -notmatch '\\(\.backups|test-results|\.local-run)\\' }
$preview=$candidates | Group-Object DirectoryName | ForEach-Object {
 [pscustomobject]@{path=$_.Name;count=$_.Count;bytes=($_.Group | Measure-Object Length -Sum).Sum;risk='需确认运行进程、离线依赖与迁移恢复证据；禁止自动删除';recovery='按锁文件安装依赖并重新构建；无Git时先独立备份源码'}
}
$duplicateCandidates=$files | Where-Object Length -gt 0 | Group-Object Length | Where-Object Count -gt 1
$duplicates=foreach($group in $duplicateCandidates){
 $group.Group | ForEach-Object { try { [pscustomobject]@{path=$_.FullName;bytes=$_.Length;hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash} } catch { $skipped.Add($_.TargetObject.ToString()) } } | Group-Object hash | Where-Object Count -gt 1 | ForEach-Object { [pscustomobject]@{hash=$_.Name;paths=$_.Group.path;bytesEach=$_.Group[0].bytes} }
}
[ordered]@{root=$root;time=[DateTimeOffset]::UtcNow.ToString('o');fileCount=$files.Count;totalBytes=($files|Measure-Object Length -Sum).Sum;directories=$groups;largestFiles=@($files|Sort-Object Length -Descending|Select-Object -First 30 FullName,Length);skippedReparsePoints=$skipped;duplicates=@($duplicates);cleanupPreview=@($preview);deletedFiles=0} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'disk-preview.json')
