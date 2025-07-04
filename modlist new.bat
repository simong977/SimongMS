@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\generate_modlist.ps1"
pause
