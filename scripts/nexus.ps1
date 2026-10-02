<#
  NexusERP launcher for Windows: installs what is missing, then starts the app.
  Run it through NexusERP.bat (double-click). Safe to run again: every step is skipped when already done.

    -NoStart   install / update only, don't start the server
    -Port      web port (default 8000)
#>
param(
    [switch]$NoStart,
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root = Split-Path $PSScriptRoot -Parent
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$DataHome = Join-Path $env:LOCALAPPDATA 'NexusERP'
$PgData = Join-Path $DataHome 'pgdata'
$Utf8 = New-Object Text.UTF8Encoding $false

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) {
    Write-Host ''
    Write-Host "ERROR: $text" -ForegroundColor Red
    Write-Host 'See the Troubleshooting section of README.md.' -ForegroundColor Yellow
    exit 1
}

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Winget-Install($id, $name) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Fail "$name is missing and winget is not available. Install $name manually, then run NexusERP.bat again."
    }
    Say "Installing $name with winget (a Windows prompt may ask for permission)..." 'Yellow'
    winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
    Refresh-Path
}

function Run($exe, [string[]]$arguments, $what) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)." }
}

function Hash-Of($path) {
    if (Test-Path $path) { return (Get-FileHash $path -Algorithm SHA256).Hash }
    return ''
}

function Read-Env($key) {
    $file = Join-Path $Backend '.env'
    if (-not (Test-Path $file)) { return $null }
    $line = Get-Content $file | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
    if ($line) { return $line.Substring($key.Length + 1) }
    return $null
}

function New-Secret([int]$length) {
    $chars = (48..57) + (65..90) + (97..122)
    return -join (1..$length | ForEach-Object { [char]($chars | Get-Random) })
}

Write-Host ''
Write-Host '  NexusERP  -  the ERP you learn by using' -ForegroundColor Magenta
Write-Host "  $Root" -ForegroundColor DarkGray

# Python packages contain deep file paths; Windows refuses paths over 260 characters unless long paths are enabled.
$longPaths = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -ErrorAction SilentlyContinue).LongPathsEnabled
if ($Root.Length -gt 90 -and $longPaths -ne 1) {
    Fail "The folder path is too long ($($Root.Length) characters) and Windows may refuse to install. Move the NexusERP folder somewhere shorter (for example directly under C:) and run NexusERP.bat again."
}
# ---------------------------------------------------------------------------------------------
Step 'Checking Python'
$Python = $null
foreach ($candidate in @('py', 'python')) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notlike '*WindowsApps*') {
        $version = & $candidate -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($version -and [version]$version -ge [version]'3.11') { $Python = $candidate; break }
    }
}
if (-not $Python) {
    Winget-Install 'Python.Python.3.13' 'Python 3.13'
    foreach ($candidate in @('py', 'python')) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -notlike '*WindowsApps*') { $Python = $candidate; break }
    }
    if (-not $Python) { Fail 'Python was installed but is not on PATH yet. Close this window and run NexusERP.bat again.' }
}
Say ("Python " + (& $Python --version))

Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node -or [version]((node --version).TrimStart('v')) -lt [version]'20.0') {
    Winget-Install 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was installed but is not on PATH yet. Close this window and run NexusERP.bat again.' }
}
Say ("Node " + (node --version))

Step 'Checking PostgreSQL'
function Find-PgBin {
    $dirs = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending
    foreach ($d in $dirs) {
        $bin = Join-Path $d.FullName 'bin'
        if (Test-Path (Join-Path $bin 'initdb.exe')) { return $bin }
    }
    return $null
}
$PgBin = Find-PgBin
if (-not $PgBin) {
    Winget-Install 'PostgreSQL.PostgreSQL.17' 'PostgreSQL 17'
    $PgBin = Find-PgBin
    if (-not $PgBin) { Fail 'PostgreSQL could not be installed. Install it from https://www.postgresql.org/download/windows/ and run NexusERP.bat again.' }
}
Say "PostgreSQL tools: $PgBin"

# ---------------------------------------------------------------------------------------------
Step 'Preparing the NexusERP database'
New-Item -ItemType Directory -Force $DataHome | Out-Null
$PwFile = Join-Path $DataHome 'db_password.txt'
$DbPort = Read-Env 'DB_PORT'
if (-not $DbPort) { $DbPort = '5544' }  # a private port, so an existing PostgreSQL service is never touched

if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
    Say 'Creating a private PostgreSQL cluster (first run only)...'
    $pw = New-Secret 24
    [IO.File]::WriteAllText($PwFile, $pw, $Utf8)
    $tmp = Join-Path $DataHome 'pw.tmp'
    [IO.File]::WriteAllText($tmp, $pw, $Utf8)
    & (Join-Path $PgBin 'initdb.exe') -D $PgData -U postgres --pwfile=$tmp -A scram-sha-256 -E UTF8 --locale=C | Out-Null
    Remove-Item $tmp -Force
    if ($LASTEXITCODE -ne 0) { Fail 'initdb failed. If Windows blocked it, see "Smart App Control" in README.md.' }
}

& (Join-Path $PgBin 'pg_isready.exe') -h localhost -p $DbPort | Out-Null
if ($LASTEXITCODE -ne 0) {
    Say "Starting PostgreSQL on port $DbPort..."
    # Started without inheriting this window's output handles, otherwise the server would keep them open.
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $PgBin 'pg_ctl.exe'
    $psi.Arguments = "-D `"$PgData`" -l `"$(Join-Path $DataHome 'pg.log')`" -o `"-p $DbPort`" -w start"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = [Diagnostics.Process]::Start($psi)
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) { Fail "PostgreSQL did not start. Look at $DataHome\pg.log" }
}
Say "PostgreSQL is running on port $DbPort" 'Green'

# ---------------------------------------------------------------------------------------------
Step 'Setting up the backend (Python packages)'
$Venv = Join-Path $Backend '.venv'
$Py = Join-Path $Venv 'Scripts\python.exe'
if (-not (Test-Path $Py)) {
    Run $Python @('-m', 'venv', $Venv) 'Creating the Python environment'
}
$reqHash = Hash-Of (Join-Path $Backend 'requirements.txt')
$reqStamp = Join-Path $Venv '.requirements-hash'
if (-not (Test-Path $reqStamp) -or (Get-Content $reqStamp) -ne $reqHash) {
    Run $Py @('-m', 'pip', 'install', '--quiet', '--upgrade', 'pip') 'Updating pip'
    Run $Py @('-m', 'pip', 'install', '--quiet', '-r', (Join-Path $Backend 'requirements.txt')) 'Installing Python packages'
    [IO.File]::WriteAllText($reqStamp, $reqHash, $Utf8)
}
Say 'Python packages ready' 'Green'

$EnvFile = Join-Path $Backend '.env'
if (-not (Test-Path $EnvFile)) {
    $dbPw = (Get-Content $PwFile -Raw).Trim()
    $content = @(
        "DJANGO_SECRET_KEY=$(New-Secret 50)",
        'DJANGO_DEBUG=1',
        'DB_NAME=nexuserp',
        'DB_USER=postgres',
        "DB_PASSWORD=$dbPw",
        'DB_HOST=localhost',
        "DB_PORT=$DbPort",
        'CORS_ALLOWED_ORIGINS=http://localhost:5173'
    ) -join "`n"
    [IO.File]::WriteAllText($EnvFile, $content + "`n", $Utf8)
    Say 'Created backend\.env'
}

Push-Location $Backend
try {
    Run $Py @((Join-Path $PSScriptRoot 'create_db.py')) 'Creating the database'
    Run $Py @('manage.py', 'migrate', '--verbosity', '0') 'Database migration'
    Run $Py @('manage.py', 'seed_demo') 'Loading the demo company'
} finally { Pop-Location }

# ---------------------------------------------------------------------------------------------
Step 'Building the frontend'
Push-Location $Frontend
try {
    $lockHash = Hash-Of (Join-Path $Frontend 'package-lock.json')
    $lockStamp = Join-Path $Frontend 'node_modules\.package-lock-hash'
    if (-not (Test-Path $lockStamp) -or (Get-Content $lockStamp) -ne $lockHash) {
        Say 'Installing JavaScript packages (a few minutes the first time)...'
        Run 'npm.cmd' @('install', '--no-fund', '--no-audit', '--loglevel=error') 'npm install'
        [IO.File]::WriteAllText($lockStamp, $lockHash, $Utf8)
    }
    $index = Join-Path $Frontend 'dist\index.html'
    $newest = Get-ChildItem (Join-Path $Frontend 'src'), (Join-Path $Frontend 'index.html') -Recurse -File |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not (Test-Path $index) -or $newest.LastWriteTime -gt (Get-Item $index).LastWriteTime) {
        Say 'Building the web interface...'
        Run 'npm.cmd' @('run', 'build', '--silent', '--', '--logLevel', 'error') 'Frontend build'
    }
} finally { Pop-Location }
Say 'Frontend ready' 'Green'

# ---------------------------------------------------------------------------------------------
$demoUser = Read-Env 'DEMO_USERNAME'
if (-not $demoUser) { $demoUser = 'demo' }
$demoPw = Read-Env 'DEMO_PASSWORD'
$url = "http://localhost:$Port"

Write-Host ''
Write-Host '  ------------------------------------------------------------' -ForegroundColor Magenta
Write-Host "   NexusERP is ready:  $url" -ForegroundColor White
Write-Host "   Username:           $demoUser" -ForegroundColor White
Write-Host "   Password:           $demoPw" -ForegroundColor White
Write-Host '  ------------------------------------------------------------' -ForegroundColor Magenta

if ($NoStart) { exit 0 }

$busy = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($busy) {
    Say "Something is already running on port $Port (probably NexusERP). Opening the browser." 'Yellow'
    Start-Process $url
    exit 0
}

Say 'Starting the server. Keep this window open; press Ctrl+C to stop NexusERP.' 'Yellow'
Start-Job -ScriptBlock { param($u) Start-Sleep 3; Start-Process $u } -ArgumentList $url | Out-Null
Push-Location $Backend
try {
    & $Py manage.py runserver "127.0.0.1:$Port" --noreload
} finally { Pop-Location }
