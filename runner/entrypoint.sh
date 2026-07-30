#!/usr/bin/env bash
# Boots the virtual display + audio the engine and FFmpeg share, then the runner.
set -e

export DISPLAY="${DISPLAY:-:99}"

# Virtual display for Chromium (FFmpeg grabs this).
# VERTICAL=1 widens it: program 16:9 at (0,0) + portrait 9:16 at x=1920.
if [ "${VERTICAL:-0}" = "1" ]; then GEOM="3000x1920x24"; else GEOM="1920x1080x24"; fi
Xvfb "$DISPLAY" -screen 0 "$GEOM" -nolisten tcp &

# Pulse null sink: Chromium plays the engine's mix into it; FFmpeg records
# its monitor. Nobody's actual speakers involved.
pulseaudio --start --exit-idle-time=-1 || true
sleep 1
pactl load-module module-null-sink sink_name=broadcast \
  sink_properties=device.description=broadcast || true
export PULSE_SINK=broadcast

exec node /app/runner.js
