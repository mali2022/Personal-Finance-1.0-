param([Parameter(Mandatory)][string]$SessionFile,[Parameter(Mandatory)][string]$Name)
$ErrorActionPreference='Stop'
$s=Get-Content -LiteralPath $SessionFile -Raw|ConvertFrom-Json
if($s.database -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$' -or $Name -notmatch '^[a-z0-9-]+$'){throw 'Invalid isolated capture'}
$out=Join-Path $s.output $Name
if(Test-Path -LiteralPath $out){throw 'Capture already exists'}
New-Item -ItemType Directory -Path $out|Out-Null
$connection=[System.Data.SqlClient.SqlConnection]::new('Server=(localdb)\CodexEntryVerification;Database='+$s.database+';Integrated Security=True;TrustServerCertificate=True')
$connection.Open()
try {
 $command=$connection.CreateCommand();$command.CommandTimeout=60
 $command.CommandText=@'
SELECT TOP(30) q.execution_count,q.total_worker_time/1000.0/q.execution_count cpuMs,
 q.total_logical_reads*1.0/q.execution_count logicalReads,q.total_elapsed_time/1000.0/q.execution_count elapsedMs,
 q.last_elapsed_time/1000.0 lastElapsedMs,q.max_elapsed_time/1000.0 maxElapsedMs,
 SUBSTRING(t.text,q.statement_start_offset/2+1,(CASE WHEN q.statement_end_offset=-1 THEN DATALENGTH(t.text) ELSE q.statement_end_offset END-q.statement_start_offset)/2+1) sqlText,
 CAST(p.query_plan AS nvarchar(max)) planXml
FROM sys.dm_exec_query_stats q
CROSS APPLY sys.dm_exec_sql_text(q.sql_handle) t
CROSS APPLY sys.dm_exec_query_plan(q.plan_handle) p
CROSS APPLY sys.dm_exec_plan_attributes(q.plan_handle) a
WHERE a.attribute='dbid' AND CONVERT(int,a.value)=DB_ID()
 AND t.text NOT LIKE '%sys.dm_exec_query_stats%'
 AND (t.text LIKE '%Transactions%' OR t.text LIKE '%Entries%')
 AND t.text NOT LIKE '%INSERT %' AND t.text NOT LIKE '%CREATE %' AND t.text NOT LIKE '%UPDATE %'
ORDER BY q.total_worker_time DESC;
'@
 $reader=$command.ExecuteReader();$rows=@();$i=0
 while($reader.Read()){
  $plan=if($reader.IsDBNull(7)){''}else{$reader.GetString(7)}
  $file="plan-$i.xml";[IO.File]::WriteAllText((Join-Path $out $file),$plan)
  $rows+= [pscustomobject]@{executions=$reader.GetInt64(0);cpuMs=$reader.GetValue(1);logicalReads=$reader.GetValue(2);elapsedMs=$reader.GetValue(3);lastElapsedMs=$reader.GetValue(4);maxElapsedMs=$reader.GetValue(5);sql=$reader.GetString(6);plan=$file};$i++
 }
 $reader.Close();$rows|ConvertTo-Json -Depth 5|Set-Content -Encoding utf8 (Join-Path $out 'queries.json')
 Write-Output "Captured $($rows.Count) isolated SQL plans"
} finally {$connection.Dispose()}
