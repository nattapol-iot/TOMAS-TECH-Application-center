@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Resume-TeamTest.ps1"
if errorlevel 1 pause
