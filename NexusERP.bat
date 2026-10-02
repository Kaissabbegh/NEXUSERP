@echo off
title NexusERP
rem Double-click to install (first run) and start NexusERP. Run it again any time to start the app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\nexus.ps1" %*
if errorlevel 1 pause
