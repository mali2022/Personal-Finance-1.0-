param([string]$SessionFile='.local-run/million-20261026/reconciliation-test.private.json')
$ErrorActionPreference='Stop'
$s=Get-Content $SessionFile -Raw|ConvertFrom-Json
if($s.database -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$' -or $s.origin -notmatch '^http://127\.0\.0\.1:\d+$'){throw 'Only isolated fixture is allowed'}
$f=Get-Content (Join-Path $s.output 'reconciliation-fixture.json') -Raw|ConvertFrom-Json
function Login { $r=Invoke-RestMethod "$($s.origin)/api/auth/login" -Method Post -ContentType application/json -Body (@{email=$s.email;password=$s.password}|ConvertTo-Json);return @{Authorization="Bearer $($r.data.accessToken)"} }
$auth=Login
$task=(Invoke-RestMethod "$($s.origin)/api/smart-reconciliation/tasks?accountId=$($f.accountId)" -Headers $auth).data|Where-Object {$_.state -eq 'Running' -and $_.processed -ge 20}|Select-Object -First 1
if(!$task){throw 'A committed running task is required'}
$apiProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($s.apiPid)"
$dll=Join-Path $s.apiOut 'PersonalFinance.Api.dll'
if(!$apiProcess -or !$apiProcess.CommandLine.Contains($dll) -or (Split-Path $s.apiOut -Leaf) -notin @('reconciliation-indexed','reconciliation-delivery-final') -or (Split-Path $s.apiOut -Parent) -ne $s.work){throw 'API PID does not belong to this disposable candidate'}
Stop-Process -Id $s.apiPid
$settings=@{ASPNETCORE_ENVIRONMENT='Development';ASPNETCORE_URLS=$s.origin;ConnectionStrings__Finance="Server=(localdb)\CodexEntryVerification;Database=$($s.database);Trusted_Connection=True;TrustServerCertificate=True";Auth__SigningKey=$s.signingKey;Bootstrap__Email=$s.email;Bootstrap__Password=$s.password;Verification__Isolated='true';Ai__Enabled='false';DataProtection__KeyPath=(Join-Path $s.work 'keys');Database__SnapshotReads='true';Logging__LogLevel__Default='Warning';Logging__LogLevel__Microsoft='Warning'}
foreach($key in $settings.Keys){[Environment]::SetEnvironmentVariable($key,$settings[$key],'Process')}
$p=Start-Process (Get-Command dotnet).Source -ArgumentList @($dll) -WorkingDirectory $s.apiOut -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $s.output 'resume-api.log') -RedirectStandardError (Join-Path $s.output 'resume-api-error.log')
$s.apiPid=$p.Id;$s|ConvertTo-Json|Set-Content -Encoding utf8 $SessionFile
$ready=$false
for($i=0;$i -lt 60;$i++){try{$h=Invoke-RestMethod "$($s.origin)/api/health";if($h.code -eq 'READY'){$ready=$true;break}}catch{};Start-Sleep -Seconds 1}
if(!$ready){throw 'Restarted candidate is not ready'}
$auth=Login
$persisted=(Invoke-RestMethod "$($s.origin)/api/smart-reconciliation/tasks?accountId=$($f.accountId)" -Headers $auth).data|Where-Object {$_.id -eq $task.id}
if($persisted.processed -ne $task.processed -or $persisted.version -ne $task.version){throw 'Committed cursor changed across process restart'}
$headers=@{};foreach($key in $auth.Keys){$headers[$key]=$auth[$key]};$headers['Idempotency-Key']=[guid]::NewGuid().ToString()
$result=(Invoke-RestMethod "$($s.origin)/api/smart-reconciliation/tasks/$($task.id)/step" -Method Post -Headers $headers -ContentType application/json -Body (@{version=$persisted.version}|ConvertTo-Json)).data
if($result.processed -le $persisted.processed -or $result.processed -gt $persisted.processed+20){throw 'Task failed to resume within the batch limit'}
@{synthetic=$true;processRestarted=$true;committedCursorPreserved=$true;before=$persisted.processed;after=$result.processed;failureInjection='Process termination between committed steps, not during SQL commit';buildId=$h.buildId}|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $s.output 'task-process-resume.json')
Write-Output 'Committed task cursor survived process termination and resumed in a new API process'
