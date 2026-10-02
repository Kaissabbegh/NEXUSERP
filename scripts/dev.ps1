# Starts the database, the Django API (port 8000) and the Vite UI (port 5173).
$root = Split-Path $PSScriptRoot -Parent

& "$PSScriptRoot\start-db.ps1"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\backend'; .\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\frontend'; npm run dev"
Write-Host 'Open http://localhost:5173'
