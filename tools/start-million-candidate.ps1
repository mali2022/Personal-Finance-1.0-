param([string]$SessionFile = '.local-run/million-20261026/session.private.json', [string]$Name='candidate', [switch]$TraceSql)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$s=Get-Content (Join-Path $root $SessionFile) -Raw|ConvertFrom-Json
if($s.database -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$' -or $Name -notmatch '^[a-z0-9-]+$'){throw 'Invalid isolated session'}
$out=Join-Path $s.work $Name
New-Item -ItemType Directory -Force $out|Out-Null
$env:DOTNET_CLI_HOME=Join-Path $root 'backend/.runtime';$env:NUGET_PACKAGES=Join-Path $root 'backend/.nuget/packages'
dotnet publish (Join-Path $root 'backend/src/PersonalFinance.Api') --no-restore -c Release -o $out *> (Join-Path $s.output "$Name-build.log")
if($LASTEXITCODE -ne 0){throw 'Candidate build failed'}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$settings=@{ASPNETCORE_ENVIRONMENT='Development';ASPNETCORE_URLS="http://127.0.0.1:$port";ConnectionStrings__Finance="Server=(localdb)\CodexEntryVerification;Database=$($s.database);Trusted_Connection=True;TrustServerCertificate=True";Auth__SigningKey=$s.signingKey;Bootstrap__Email=$s.email;Bootstrap__Password=$s.password;Verification__Isolated='true';Ai__Enabled='false';DataProtection__KeyPath=(Join-Path $s.work 'keys');Logging__LogLevel__Default='Warning';Logging__LogLevel__Microsoft='Warning'}
$settings['Database__SnapshotReads']='true'
if($TraceSql){$settings['Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command']='Information'}
foreach($key in $settings.Keys){[Environment]::SetEnvironmentVariable($key,$settings[$key],'Process')}
$dll=Join-Path $out 'PersonalFinance.Api.dll'
Push-Location $out
try{dotnet $dll --initialize-db *> (Join-Path $s.output "$Name-initialize.log");if($LASTEXITCODE -ne 0){throw 'Candidate migrations failed'}}finally{Pop-Location}
$p=Start-Process (Get-Command dotnet).Source -ArgumentList @($dll) -WorkingDirectory $out -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $s.output "$Name-api.log") -RedirectStandardError (Join-Path $s.output "$Name-api-error.log")
for($i=0;$i -lt 90;$i++){try{$h=Invoke-RestMethod "http://127.0.0.1:$port/api/health";if($h.code -eq 'READY'){break}}catch{};if($p.HasExited){throw 'Candidate exited'};Start-Sleep -Seconds 1}
if($h.code -ne 'READY'){throw 'Candidate not ready'}
$s.origin="http://127.0.0.1:$port";$s.apiPid=$p.Id;$s.apiOut=$out
$s|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $s.work "$Name.private.json")
[pscustomobject]@{ready=$true;pid=$p.Id;name=$Name;buildId=$h.buildId}|ConvertTo-Json
