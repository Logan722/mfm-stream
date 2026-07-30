#!/usr/bin/env bash
# Boots the virtual display + audio the engine and FFmpeg share, then the runner.
set -e

export DISPLAY="${DISPLAY:-:99}"

# `docker compose restart` reuses the container — clean up anything a previous
# run left behind, or Xvfb/Pulse refuse to start (field-found July 30).
DNUM="${DISPLAY#:}"
rm -f "/tmp/.X${DNUM}-lock" "/tmp/.X11-unix/X${DNUM}" 2>/dev/null || true
pulseaudio --kill 2>/dev/null || true

# Virtual display for Chromium (FFmpeg grabs this).
# VERTICAL=1 widens it: program 16:9 at (0,0) + portrait 9:16 at x=1920.
if [ "${VERTICAL:-1}" != "0" ]; then GEOM="3000x1920x24"; else GEOM="1920x1080x24"; fi
Xvfb "$DISPLAY" -screen 0 "$GEOM" -nolisten tcp &

# Pulse null sink: Chromium plays the engine's mix into it; FFmpeg records
# its monitor. Nobody's actual speakers involved.
pulseaudio --start --exit-idle-time=-1 || true
sleep 1
pactl load-module module-null-sink sink_name=broadcast \
  sink_properties=device.description=broadcast || true
export PULSE_SINK=broadcast

exec node /app/runner.js
