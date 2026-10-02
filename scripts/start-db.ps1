# Starts the local PostgreSQL dev cluster used by NexusERP.
# The cluster lives outside the repo, in %LOCALAPPDATA%\NexusERP\pgdata.
$pg = 'C:\Program Files\PostgreSQL\17\bin'
$data = "$env:LOCALAPPDATA\NexusERP\pgdata"

& "$pg\pg_isready.exe" -h localhost -p 5432 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host 'PostgreSQL is already running on port 5432.'
    exit 0
}
& "$pg\pg_ctl.exe" -D $data -l "$env:LOCALAPPDATA\NexusERP\pg.log" start
