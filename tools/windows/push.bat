@echo off
REM Runs push.ps1 from this folder. PowerShell blocks downloaded scripts by
REM default, so bypass the policy for this one process only. The pause is not
REM decoration: without it a parse error closes the window before it can be
REM read, which is indistinguishable from the script doing nothing.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1"
echo.
pause
