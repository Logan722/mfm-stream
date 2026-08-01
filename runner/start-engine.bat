@echo off
REM MFM engine — start on this Windows PC (run from the runner folder)
cd /d "%~dp0"
echo Starting the MFM engine (first run builds for a few minutes)...
docker compose up -d --build
echo.
echo ================================================================
echo  Engine starting up.
echo  1) Open your console:  https://streamr2.netlify.app/host.html
echo  2) Wait for the Engine panel to say "Cloud engine online"
echo  3) Check the live frame: http://localhost:8080/snap
echo ================================================================
echo.
pause
