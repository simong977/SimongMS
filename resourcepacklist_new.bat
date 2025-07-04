@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\generate_resourcepacklist.ps1"
pause
