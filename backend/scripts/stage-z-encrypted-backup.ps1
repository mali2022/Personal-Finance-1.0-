#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('Encrypt','Decrypt')][string]$Mode,[Parameter(Mandatory)][string]$InputFile,[Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $OutputFile){throw '目标已存在，禁止覆盖'}
$key=[Convert]::FromBase64String($env:PF_BACKUP_KEY_BASE64)
if($key.Length -ne 32){throw '必须从安全环境提供独立32字节加密密钥'}
$source=[IO.File]::OpenRead([IO.Path]::GetFullPath($InputFile))
$destination=[IO.File]::Open([IO.Path]::GetFullPath($OutputFile),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
$cipher=[Security.Cryptography.AesGcm]::new($key,16)
function Read-Exactly([IO.Stream]$stream,[byte[]]$buffer){$at=0;while($at -lt $buffer.Length){$n=$stream.Read($buffer,$at,$buffer.Length-$at);if($n -le 0){throw '加密文件截断，拒绝接受'};$at+=$n}}
try {
 $header=[byte[]]::new(16)
 if($Mode -eq 'Encrypt'){
  [Text.Encoding]::ASCII.GetBytes('PFZENC01').CopyTo($header,0)
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(8).CopyTo($header,8)
  $destination.Write($header,0,$header.Length)
 }else{Read-Exactly $source $header;if([Text.Encoding]::ASCII.GetString($header,0,8) -cne 'PFZENC01'){throw '加密格式无效'}}
 [uint32]$counter=0;$finished=$false
 while(-not $finished){
  if($counter -eq [uint32]::MaxValue){throw '备份超过当前格式分块上限'}
  $nonce=[byte[]]::new(12);[Array]::Copy($header,8,$nonce,0,8);[BitConverter]::GetBytes($counter).CopyTo($nonce,8)
  if($Mode -eq 'Encrypt'){
   $plain=[byte[]]::new(4194304);$length=0
   while($length -lt $plain.Length){$n=$source.Read($plain,$length,$plain.Length-$length);if($n -eq 0){break};$length+=$n}
   if($length -lt $plain.Length){$plain=$plain[0..($length-1)];if($length -eq 0){$plain=[byte[]]::new(0)}}
   $lengthBytes=[BitConverter]::GetBytes([int]$length);$aad=[byte[]]($header+$nonce+$lengthBytes)
   $encrypted=[byte[]]::new($length);$tag=[byte[]]::new(16)
   $cipher.Encrypt($nonce,$plain,$encrypted,$tag,$aad)
   $destination.Write($lengthBytes,0,$lengthBytes.Length);$destination.Write($encrypted,0,$encrypted.Length);$destination.Write($tag,0,$tag.Length)
   if($length -eq 0){$finished=$true}
  }else{
   $lengthBytes=[byte[]]::new(4);Read-Exactly $source $lengthBytes;$length=[BitConverter]::ToInt32($lengthBytes)
   if($length -lt 0 -or $length -gt 4194304){throw '加密块长度无效'}
   $encrypted=[byte[]]::new($length);$tag=[byte[]]::new(16);Read-Exactly $source $encrypted;Read-Exactly $source $tag
   $plain=[byte[]]::new($length);$aad=[byte[]]($header+$nonce+$lengthBytes)
   $cipher.Decrypt($nonce,$encrypted,$tag,$plain,$aad);$destination.Write($plain,0,$plain.Length)
   if($length -eq 0){if($source.ReadByte() -ne -1){throw '认证结束标记后存在额外数据'};$finished=$true}
  }
  $counter++
 }
 Write-Output '认证加密操作完成；独立介质、密钥保管及恢复验证仍须另行确认。'
} catch {throw '认证加密操作失败；输出必须视为未验证残片，不得用于恢复。'}
finally{$source.Dispose();$destination.Dispose();$cipher.Dispose();[Array]::Clear($key)}

