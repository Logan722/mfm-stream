# Cloud Engine Runner — set up the VPS (E2)

This folder turns any small cloud server into the broadcast machine:
it runs the Program Engine (`program.html`) in Chromium on a virtual display,
restarts it automatically if anything dies, and pushes the stream to
YouTube/Facebook **directly with FFmpeg** — no Daily streaming API, no
streaming fees, no instance limits. Your laptop stops carrying the broadcast.

You still run everything from the host console exactly as before. When the
cloud engine is online, the Engine panel says **"Cloud engine online"** and
**Go Live automatically streams from the VPS**.

---

## 1. Create the server (once, ~10 minutes)

Any provider works. Two good options:

- **Hetzner** (cheapest for the power): hetzner.com → Cloud → Add Server →
  location near you (US East: Ashburn) → Ubuntu 24.04 → **CPX31** (4 vCPU,
  8 GB — about €17/mo). Add your SSH key or use their console.
- **DigitalOcean**: digitalocean.com → Droplet → Ubuntu 24.04 →
  Basic → 4 vCPU / 8 GB.

Aim for **4 vCPUs** — Chromium + 1080p30 encoding is CPU work.

## 2. Install Docker on the server

SSH in (`ssh root@YOUR_SERVER_IP`), then:

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code and configure

```bash
git clone https://github.com/Logan722/mfm-stream.git
cd mfm-stream/runner
cp .env.example .env
nano .env        # set ENGINE_KEY (and ROOM if not sanctuary). Ctrl+O, Enter, Ctrl+X.
```

## 4. Start it

```bash
docker compose up -d --build
```

First build takes a few minutes. Check it:

```bash
docker compose logs -f        # Ctrl+C to stop watching
```

You should see `engine page loaded` — and in your **host console**, the
Engine panel turns green: **"Cloud engine online"**. From your browser:
`http://YOUR_SERVER_IP:8080/health` shows live status JSON.

## 5. Go Live

Open the console as usual, paste stream keys, **Go Live**. The button says
"Starting cloud stream…" and the Engine panel flips to
**"LIVE — streaming from the cloud runner"**. The stream now flows
VPS → YouTube/Facebook. You can close your laptop; **the broadcast keeps
going** (the room keeps running too — but remember viewers only see/hear
what's in the room).

To end: tap **End broadcast** (twice, as always).

## Day-to-day

| Task | Command (SSH) |
|---|---|
| Watch logs | `docker compose logs -f` |
| Restart everything | `docker compose restart` |
| Stop the runner | `docker compose down` |
| Update to latest code | `cd mfm-stream && git pull && cd runner && docker compose up -d --build` |
| Health check | `http://YOUR_SERVER_IP:8080/health` |

The runner watches itself: if the engine page stalls or falls out of the
room it reloads; if Chromium crashes it relaunches (mid-stream, FFmpeg keeps
pushing so viewers see a freeze rather than a dropped stream, then recover);
if FFmpeg dies unexpectedly it retries 3 times. `restart: always` brings the
whole thing back after a server reboot.

## Good to know

- **Don't run the engine in your browser at the same time** — one PROGRAM
  per room. Browser engine = backup if the VPS is ever down (Go Live then
  automatically uses the Daily path instead).
- Stream keys travel from your console to the runner through the room's
  message channel and live only in FFmpeg's process arguments; they are
  never written to disk on the server.
- The engine key sits in `.env` on the server — treat the server like it
  holds a password (it does). Keep SSH access to yourself.
- Optional hardening: block port 8080 in the provider firewall if you don't
  want the health page public (it contains no secrets, just status).
- If the Docker build ever fails on a Playwright version message: the tag in
  `Dockerfile` (`v1.62.1`) and the version in `package.json` (`1.62.1`)
  must be the same two numbers.
