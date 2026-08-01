@echo off
REM MFM engine — stop on this Windows PC (run from the runner folder)
cd /d "%~dp0"
echo Stopping the MFM engine...
docker compose down
echo Engine stopped.
pause
