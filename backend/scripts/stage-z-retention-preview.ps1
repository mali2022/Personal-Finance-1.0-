#Requires -Version 7.0
param([Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
$items=foreach($folder in Get-ChildItem -LiteralPath (Get-RecoveryRoot) -Directory){
 if($folder.Name -cnotmatch '^\d{8}T\d{6}Z_[a-f0-9]{32}$'){continue}
 try {$manifest=Read-VerifiedManifest $folder.Name;$restores=@(Get-ChildItem -LiteralPath $folder.FullName -Filter verification.json -Recurse -File|ForEach-Object {Get-Content -LiteralPath $_.FullName -Raw|ConvertFrom-Json}|Where-Object state -eq 'Passed');[pscustomobject]@{backupId=$folder.Name;sha256Verified=$true;restoreProofs=$restores.Count;bytes=$manifest.fileBytes;action='Keep';reason='独立异地可恢复副本未建立，禁止删除'}}catch{[pscustomobject]@{backupId=$folder.Name;sha256Verified=$false;action='KeepInvestigate';reason='校验未通过，保留调查'}}
}
@{policy='建议每日7份、每周8份、每月12份；须先完成独立异地副本、解密、恢复及指纹验证，再逐项人工批准';independentCopyConfirmed=$false;deletedFiles=0;backups=@($items)}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $OutputFile
