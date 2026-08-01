@echo off
REM Launches the MFM Broadcast Engine control window (Start / Stop buttons)
powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0engine-control.ps1"
