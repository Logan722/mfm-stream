@echo off
REM MFM engine — start on this Windows PC (run from the runner folder)
cd /d "%~dp0"
echo Starting the MFM engine (first run builds for a few minutes)...
docker compose up -d --build
echo Opening your console...
start "" "https://streamr2.netlify.app/host.html"
echo.
echo ================================================================
echo  Engine starting. Your console just opened in the browser.
echo  Wait for the Engine panel to say "Cloud engine online".
echo  Live frame check: http://localhost:8080/snap
echo ================================================================
echo.
pause
