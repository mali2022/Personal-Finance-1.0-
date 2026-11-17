Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# This helper runs with administrator rights and only starts the verified local instance.
try {
    $service = Get-Service -Name 'MSSQLSERVER' -ErrorAction Stop
    if ($service.Status -ne 'Running') {
        Start-Service -Name 'MSSQLSERVER' -ErrorAction Stop
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    }
    exit 0
} catch {
    exit 1
}
