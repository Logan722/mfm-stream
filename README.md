# MFM Mega Region 2 USA — Live Platform (`mfm-stream`)

A self-owned live streaming platform for Mountain of Fire and Miracles Ministries,
Mega Region 2 USA. The full ministry team joins a true interactive room (everyone
sees and hears each other), and — in later phases — a professionally composed
service is broadcast to YouTube + Facebook (16:9) with Instagram vertical (9:16)
as an optional secondary.

Built on **Daily.co** (WebRTC) + **Netlify** (hosting + serverless token function),
styled in the **Royal Flame** design system (navy `#142240`, gold `#c9952c`,
fire `#e85d26`, Fraunces + Inter Tight).

> This runs **in parallel** with the existing Zoom + OBS + Aitum rig and replaces
> nothing until proven. See `MFM-STREAMING-APP-REFERENCE.md` for the full blueprint.

---

## What's here

```
mfm-stream/
├── index.html                    Participant join page — name, camera/mic preview, join
├── host.html                     Host console — owner token + production deck (broadcast, cards, engine)
├── program.html                  Program Engine — composites the broadcast on a canvas (joins as PROGRAM)
├── css/stream.css                Royal Flame design system for the platform
├── js/join.js                    Shared join logic (Daily Prebuilt)
├── js/console.js                 Host console logic (deck, people, engine wiring, Go Live)
├── js/engine.js                  The compositor: layouts, Royal Flame cards, WebAudio mix
├── netlify/functions/token.js    Serverless: rooms + tokens (host / participant / engine roles)
├── netlify.toml                  Netlify config (/api/* → functions)
└── MFM-STREAMING-APP-REFERENCE.md   Project blueprint (canonical reference)
```

**How it works:** the browser never sees the Daily API key. The page POSTs to
`/api/token` with a name + room (+ host key for hosts). The function — using
`DAILY_API_KEY` from Netlify's environment — creates the room if needed
(private, token-only entry) and returns a short-lived meeting token (6 hours).
Hosts get **owner** tokens (mute/remove/manage powers in the room); participants
get standard join tokens.

---

## Deploy (one-time setup)

1. **Connect the repo to Netlify**
   - [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub** → pick `mfm-stream`.
   - Build settings are auto-read from `netlify.toml` (no build command, publish `.`). Deploy.

2. **Set environment variables** — Site configuration → **Environment variables**:
   | Variable | Value |
   |---|---|
   | `DAILY_API_KEY` | Your Daily API key — dashboard.daily.co → **Developers** tab. Paste it into Netlify only; never into the repo, frontend, or chat. |
   | `HOST_KEY` | A passphrase you invent. The host page asks for it before issuing an owner token. |
   | `ENGINE_KEY` | Optional. A separate passphrase for the Program Engine page (`/program.html`). If unset, the engine accepts `HOST_KEY`. |

3. **Redeploy** so the functions pick up the variables: Deploys → **Trigger deploy → Deploy site**.

4. **Test**
   - Open `https://<your-site>.netlify.app/host.html` → name + host key → **Enter as Host**.
   - In the call, click **Copy invite link** and open it on a phone or second device → join as a participant.

---

## Using it

- **Participants** open the invite link (`/?room=sanctuary`), enter their name,
  preview camera/mic, and join. They can toggle their own camera/mic and change
  their display name. Nothing else — no controls.
- **Hosts** open `/host.html`. Owner tokens unlock Daily's built-in host powers
  (mute others, remove participants). Different room names (e.g. `?room=rehearsal`
  or typed on the host page) create separate rooms on the fly.

## Daily account

- Product: **Daily video** at `dashboard.daily.co` (not pipecat.daily.co — the
  AI-agents product is not used here, ever).
- Domain: `mfmmegaregion2` → rooms live at `mfmmegaregion2.daily.co`.
- Free allowance: 10,000 participant-minutes/month + dev credit; billing only
  past those limits.

## Local development (optional)

```bash
npm i -g netlify-cli
# in the repo root, create .env (gitignored):
#   DAILY_API_KEY=...
#   HOST_KEY=...
netlify dev        # serves the site + functions at http://localhost:8888
```

---

## Roadmap

1. ✅ **Foundation room** — join link, token function, interactive room (Daily Prebuilt)
2. ✅ Host/co-host controls — hybrid console: participant board, mute, co-hosts
3. ✅ Broadcast — 16:9 multistream (YouTube ×2 / Facebook / custom RTMP), layouts, spotlight
4. ✅ Overlays — lower thirds + prayer points
5. ✅ Scripture — KJV via bible-api.com, one-tap brand scriptures
6. ✅ **Program Engine (E1)** — self-composited broadcast: `program.html` canvas + audio mix,
   PROGRAM-locked Go Live, console Engine panel (see the blueprint's E1 notes)
7. ⬜ E2 cloud runner (VPS + headless Chromium) · E3 studio mode v2, 9:16 portrait canvas
8. ⬜ Auth, scheduling, hardening, dry runs

## Security notes

- `DAILY_API_KEY` and `HOST_KEY` exist **only** as Netlify environment variables.
- Rooms are `private` — entry requires a token minted by our function.
- Meeting tokens expire after 6 hours.
- Owner tokens require the host key (checked server-side, timing-safe).
