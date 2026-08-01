# Run the engine on your own Windows PC (free · no cloud · no limits)

This runs the **same** engine as the cloud version, but on your own machine via
Docker. Your CPU/GPU do the work; your (very fast) internet carries the stream.
No monthly bill, no tier gate, nothing to unlock.

## One-time setup (~15–20 min)

1. **Install Docker Desktop for Windows** → https://www.docker.com/products/docker-desktop/
   - Accept the **WSL 2** option during install. Restart if it asks.
   - Launch Docker Desktop once and wait until the whale icon in the tray is steady (it's "running").
   - If it complains about *virtualization*, we'll enable it in your BIOS — tell me and I'll walk you through it.

2. **Get the code.** Easiest: download this repo as a ZIP
   (green **Code** button on github.com/Logan722/mfm-stream → **Download ZIP**),
   unzip it somewhere easy like `C:\mfm-stream`.
   *(Or, if you have Git: `git clone https://github.com/Logan722/mfm-stream.git`.)*

3. **Create the config file.** In the `mfm-stream\runner` folder, make a new text
   file named exactly **`.env`** with this inside (put your host passphrase where shown):

   ```
   SITE_URL=https://streamr2.netlify.app
   ROOM=sanctuary
   ENGINE_KEY=YOUR_HOST_PASSPHRASE
   VERTICAL=1
   X264_PRESET=superfast
   ```

## Start it (before each service)

Double-click **`start-engine.bat`** in the `runner` folder.
(First run builds for a few minutes; after that it's fast.)

Then open your console at **streamr2.netlify.app/host.html** — the Engine panel
should say **"Cloud engine online."** You can see the exact frame it's producing
at **http://localhost:8080/snap** and its status at **http://localhost:8080/health**.

Go Live from the console exactly as normal.

## Stop it (after the service)

Double-click **`stop-engine.bat`**.

## Notes
- Keep the laptop **plugged in** with good airflow during a service.
- Your 10-core CPU should carry this comfortably. If it's ever tight, tell me and
  I'll switch encoding to your **RTX 3060 (NVENC)** so the GPU takes over and the
  CPU barely notices.
- Ideal setup is the engine on this PC and the console on a second screen/device,
  but this machine is strong enough to likely do both — we'll test.
