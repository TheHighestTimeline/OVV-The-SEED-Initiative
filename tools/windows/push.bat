@echo off
REM Runs push.ps1 from this folder. PowerShell blocks downloaded scripts by
REM default, so bypass the policy for this one process only.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1"
