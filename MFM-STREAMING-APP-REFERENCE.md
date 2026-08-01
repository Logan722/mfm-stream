# MFM Mega Region 2 — Live Streaming App (Project Blueprint)

> Canonical cross-session reference. Every new chat in this project reads this file first,
> does its scoped work, then updates this doc. (Same pattern as `WEBSITE-REFERENCE.md`.)

---

## Purpose

A custom, **self-owned** live streaming platform for MFM Mega Region 2 USA — built to do the
one thing no off-the-shelf studio could: host the full ministry team (15–20) in a **true
interactive meeting** AND broadcast a **professionally composed** service to multiple
platforms at once, with **scripture, prayer points, and lower thirds built in**.

**This replaces nothing immediately.** It is built and proven *in parallel* with the existing
Zoom + OBS + Aitum setup, and only trusted live once it has earned it.

**Form factor: a web application.** No native app, no installs. Everyone opens a link in a
browser (laptop or phone). Two views of the same app:

1. **Host/producer console** — the control board: manage participants, spotlight, layouts,
   push scripture/lower thirds/prayer points, start/stop the broadcast.
2. **Participant join page** — the ~15–20 ministers: open a link, allow camera + mic,
   toggle their own camera/mic, set their display name. No controls, no board.

---

## Why build it (the gap nothing else filled)

- Browser studios (StreamYard / Restream) cap interactive guests at ~10, and their "backstage"
  people **cannot see or hear each other** — so they can't host the 30-min, 15-person
  pre-program discussion & prayer.
- Those studios have **no Bible / scripture display** at all.
- Zoom + OBS works, but it's fragile, hands-on, and not self-owned.
- Building our own = **total control** of layout, scripture, branding, and no per-platform compromise.

---

## Core technology

| Piece | Choice | Notes |
|-------|--------|-------|
| Media platform | **Daily.co** video API (managed WebRTC) | Rooms (interactive) + meeting tokens now; Daily's RTMP live-streaming for the multistream broadcast later |
| Room UI (Phase 1) | **Daily Prebuilt** via `daily-js` | Joinable fast, themed in Royal Flame; goes fully custom in later phases |
| Hosting | **Netlify** | Static frontend + serverless token function — same workflow as the MFM sites |
| Scripture | **bible-api.com** (free KJV API) | KJV = public domain, no key, no cost, no licensing |

> ⚠️ **Switched from LiveKit to Daily.co (July 2026).** Earlier versions of this doc were
> written around LiveKit. Daily was chosen as the managed platform: simpler API, built-in
> Prebuilt UI for a fast start, first-class RTMP live streaming for the broadcast phase.
>
> ⚠️ **Daily VIDEO product only** — `dashboard.daily.co`. NOT `pipecat.daily.co` (Daily's
> AI-agents product). We never use agents.

### Daily account (already set up)

| Item | Detail |
|------|--------|
| Dashboard | dashboard.daily.co (video product) |
| Domain | `mfmmegaregion2` → rooms live at `mfmmegaregion2.daily.co` |
| API key | Developers tab → lives ONLY in Netlify env var `DAILY_API_KEY` — never in the repo, frontend, or chat |
| Free allowance | 10,000 participant-minutes/month + $15 dev credit; card on file, billing only past free limits |

---

## Architecture (high level)

```
[ Ministers ]  --join link-->  [ Web app on Netlify ]
                                       |
                             POST /api/token  (serverless fn — DAILY_API_KEY stays server-side)
                                       |
                       creates private room + mints meeting token
                       (owner token for host, join token for participants)
                                       v
                        [ Daily room @ mfmmegaregion2.daily.co ]   <-- interactive audio/video
                                       |
                        Daily live streaming (RTMP out, composed layout)   [later phases]
                                       |
                     +-----------------+------------------+
                     v                                    v
         16:9 landscape composition            9:16 vertical composition
         -> YouTube + Facebook (RTMP)          -> Instagram (RTMP, optional)
```

- **Frontend:** join page (`index.html`), host entrance (`host.html`) — later a full producer console.
- **Token service:** Netlify function issues short-lived Daily meeting tokens (6h). The
  Daily API key lives in Netlify env only. Owner tokens are guarded by a second env var,
  `HOST_KEY` (a passphrase the host page asks for).
- **Broadcast (later):** Daily's live-streaming API pushes an RTMP feed with a composed
  layout; supports multiple RTMP endpoints at once (YouTube + Facebook), with custom
  composition for overlays/branding — 16:9 primary, 9:16 vertical secondary.

---

## Feature set

### Rooms & participants
- 15–20 active ministers easily (Daily rooms scale well beyond that on camera).
- **Pre-program interactive meeting:** everyone sees & hears each other (the part the studios couldn't do).
- Private rooms — entry only with a token minted by our function.

### Host & co-host controls (Phase 2 ✅ — hybrid console)
- `host.html` is now a console: Daily Prebuilt video area + custom Royal Flame control board.
- Board (live, auto-updating): participant list with mic/cam status, per-person **mute**,
  **camera-off**, **remove** (two-tap confirm), **mute-all** (spares hosts/co-hosts).
- **Co-host promotion, live:** grants Daily permission `canAdmin: ['participants']` —
  the co-host gets admin powers (incl. in their own Prebuilt People panel). Demote reverses it.
- Remote **unmute is impossible by design** (browser privacy): hosts mute; people unmute themselves.
- Decision: hybrid over full-custom video UI — the must-not-fail part (seeing/hearing 20 people)
  stays on Daily's proven Prebuilt; custom video comes with the broadcast phase.
- Still to come on this board: bring-to-stage/spotlight & layouts (with Phase 3 composition),
  overlays, scripture, start/stop broadcast.

### Broadcast (Phase 3 ✅ — 16:9 primary)
- Console **Broadcast panel**: YouTube + Facebook stream keys (saved in localStorage on the
  host's device ONLY), optional custom RTMP destination, **Go Live / End** (two-tap),
  LIVE badge + timer in the top bar.
- All streams run on Daily's **VCS `custom` preset** so overlays (Phases 4–5) can be added
  live without restarting the stream. 1920×1080.
- ⚠️ **Root cause of "overlays never reached the stream" (found July 2026 field test):**
  the custom layout now requires **`composition_id: "daily:baseline"`** — without it Daily
  silently discards the whole custom composition and falls back to a plain default layout
  (no banner, no name labels). Always include it in `startLiveStreaming` AND every
  `updateLiveStreaming`. The main 16:9 also runs as the **default instance** (no
  `instanceId`) for compatibility; only the 9:16 uses an explicit instance id. Streaming
  errors/warnings (`live-streaming-error`, `nonfatal-error`) surface in the Broadcast
  panel — nothing fails silently.
- **Layouts, switchable live:** Grid / Speaker (dominant) / Split / PiP.
- **Feature (spotlight):** any participant can be locked full-screen on the stream
  (`videoSettings.preferredParticipantIds` + mode `single`); auto-releases if they leave.
- **Branding on stream:** name labels toggle, optional program-title text overlay
  (bottom-right; Bitter font — closest bundled VCS font to Fraunces; exact brand fonts
  need a custom VCS composition later). *Logo watermark was built, then removed at
  Dawn's request (July 2026) — re-add via `showImageOverlay` + `session_assets` if wanted.*
- **9:16 vertical (Instagram) — BUILT (July 2026), pending Daily enablement.**
  Broadcast panel has an Instagram key field + **Go Live 9:16**: a second streaming
  instance (fixed `instanceId` UUIDs — main `a1a1…`, vert `b2b2…`) with the `portrait`
  preset (variant `vertical`, 1080×1920, up to 2 on camera). Separate 9:16 chip + timer.
  ⚠️ Until Daily support raises `max_streaming_instances_per_room` for the
  `mfmmegaregion2` domain, starting it alongside the 16:9 will error (the console says
  so). IG notes: fresh key each session from the IG app, ~1 hr cap, Professional account.
  Each instance bills its own streaming minutes.
- Endpoint templates: YouTube `rtmp://a.rtmp.youtube.com/live2/<key>`,
  Facebook `rtmps://live-api-s.facebook.com:443/rtmp/<key>` (FB requires RTMPS).
- **Destinations vs instances (important):** ONE 16:9 instance feeds MANY platforms at
  once — the console has slots for **YouTube ch.1 + YouTube ch.2 + Facebook + custom
  RTMP**, all simultaneous, no Daily enablement needed. The instance limit only affects
  the SECOND composition (9:16 Instagram) — like OBS needing Aitum for a vertical output.
- **WYSIWYG card position:** the card pins to the bottom-left of an invisible centered
  16:9 frame (the broadcast frame) over the video area — same corner viewers see. The
  dashed outline that visualized this frame was removed at Dawn's request (July 2026).
  Tag reads **ONLY YOU SEE THIS** off air, **LIVE** while broadcasting.

### Overlays (Phase 4 ✅ — lower thirds & prayer points)
- **One card slot** on the stream (bottom-left by default, fade transition);
  three producers replace each other in it: lower third, prayer point, scripture (Phase 5).
- **Card position picker (July 30, 2026, Dawn's request):** 6 positions — top/bottom ×
  left/center/right — one control in the Lower third panel, applies to every card kind,
  moves live. Engine draws at the chosen corner (labels step aside); WYSIWYG preview
  mirrors it; the legacy VCS fallback maps it to text-overlay alignment.
- **Lower third:** name + line-2 inputs on the board → `banner.title` / `banner.subtitle`.
- **Prayer points:** textarea (one point per line, saved on the host's device),
  **Prev / Push / Next / Hide** — card shows "Prayer Point n of m" + the point text.
  Next/Prev push immediately (run the points live, one tap per point).
- Cards can be queued before going live; they appear when the stream starts.
- **Royal Flame branding:** navy `#142240`, gold `#c9952c`, fire `#e85d26`; Fraunces + Inter Tight.

### Bible / scripture (Phase 5 ✅)
- Scripture panel on the deck: type any reference → bible-api.com returns **KJV** →
  pushed into the shared card slot ("Reference · KJV" + verse text, long passages trimmed ~260 chars).
- **Brand scriptures as one-tap buttons:** Jer 23:29, Deut 4:11, Jer 20:9, Obadiah 1:17
  (all four verified working against the API). Verses cached per session; Enter key works.

### Media panel (July 2026 · reworked July 30 with two options)
- **Option 1 — link:** direct `.mp4`/`.m3u8` URL → Daily remote media player
  (`startRemoteMediaPlayer`) — the video joins as its own tile for the room AND the
  stream. No volume control (server-side player has none).
- **Option 2 — a FILE from the host's computer (new, July 30):** file picker → hidden
  `<video>` → `startScreenShare({ mediaStream })` publishes it through the host's Share
  slot. Audio routes file → GainNode → published track + host's speakers, so the panel's
  **volume slider controls what the room AND the stream hear, live** — the volume knob
  the link option never had. Works regardless of where the engine runs (browser or the
  future VPS): the engine letterboxes the share into the big slot and mixes its audio
  like any screen share. One media source at a time (starting one stops the other);
  a playing file occupies the host's Share slot; MP4 (H.264) is the safe format;
  shared transport: Pause (stream holds last frame) / Resume / Stop; ends cleanly when
  the file finishes. Chrome/Edge on desktop (needs `captureStream`).
- Per-participant volume rebalancing of MICS still isn't a thing: each person's level =
  their mic. Tools: mute, coaching, mic distance. (Engine-side per-source gain exists
  for media/master via app-message; slider UI for that lands in E3.)

### Overlay investigation — RESOLVED for composition, one check open (July 30, 2026)
- ✅ **The `composition_id: "daily:baseline"` fix works**: a 3-person field test showed
  participant name labels rendering on the YouTube output — the custom composition is
  applying. (Before the fix: bare default layout, no labels, no cards, ever.)
- Diag also proved: `max_streaming_instances_per_room: 2` (9:16 vertical enabled NOW,
  no support ticket), `max_rmp_sessions_per_room: 2` (Media panel supported),
  new compositor active (`enable_legacy_compositor: false`).
- ❌ **Banner overlay confirmed NOT supported on the new pipeline** (labels rendered,
  cards never did, even after waiting out the delay). ✅ **Fix: cards now render via the
  TEXT overlay** (`showTextOverlay` + `text.*` — in the new pipeline's current docs):
  title line + subtitle wrapped ~58 chars/line (max 4 lines), bottom-left, warm white
  with dark stroke, Bitter. No card box on stream — styled text instead; the boxed
  Royal Flame card look returns with the self-composited overlay phase if wanted.
- `/api/diag` still available (host key, or investigation key on `diag-*` rooms;
  actions: config | layout-test | rec-start | rec-stop | rec-link). Remove when closed.
- Nonfatal Daily warnings now surface with full type/msg/details in the Broadcast panel.

### Console layout (reworked July 2026 after field feedback)
- **Production deck** along the bottom of the video: four side-by-side panels —
  Broadcast · Lower third · Prayer points · Scripture. "Deck" button collapses it for full video.
- **Right sidebar = People only** (list, statuses, moderation, mute-all).
- **Studio mode REMOVED (Dawn, July 2026).** OBS-style preview/program was tried twice
  (text row, then visual mock monitors); without real video feeds in the panes it wasn't
  useful and ate screen space. Decision: **WYSIWYG instead** — every push is instant, and
  the card renders over the host's video bottom-left exactly as the stream shows it,
  tagged **LIVE** (broadcasting) or **OFF AIR**. Real preview/program returns only if the
  custom-video phase (call-object mode, real tracks) is ever built.
- **Bug fixed:** the LIVE chip showed while off air — display rules were overriding the
  `hidden` attribute; global `[hidden]{display:none!important}` now guards this.
- **Branding controls removed** (Dawn, July 2026): no name-labels toggle (labels
  hardcoded ON), no program-title overlay.
- **Broadcast panel order:** Go Live at the top, then layout, destinations, branding —
  the critical control is never below the fold.
- Hardening: screen wake lock while in a call (re-acquired on tab return); browser
  confirm before closing the tab mid-broadcast; LIVE timer survives repeat events.
- Mobile: deck stacks vertically (scrollable), People stays a slide-in drawer.

### Multistream
- **YouTube + Facebook simultaneously (landscape) = rock-solid primary.**
- **Instagram (vertical) = optional secondary.** IG limits: per-session keys, ~1hr cap,
  Professional account required, cannot be scheduled. Design around the platforms that behave.

---

## Repo & hosting

| Item | Detail |
|------|--------|
| Repo | `github.com/Logan722/mfm-stream` (separate from the website repo) |
| Host | Netlify — auto-deploys on push to `main` |
| Env vars (Netlify) | `DAILY_API_KEY` (Daily dashboard → Developers), `HOST_KEY` (host passphrase) |
| API endpoint | `POST /api/token` → `netlify/functions/token.js` |

### Current file structure

```
mfm-stream/
├── index.html                    Participant join page (Royal Flame, camera/mic preview)
├── host.html                     Host console — pre-join (HOST_KEY) + Prebuilt video + deck (incl. Engine panel)
├── program.html                  PROGRAM ENGINE — joins as PROGRAM, composites the broadcast (E1)
├── css/stream.css                Royal Flame design system (console + broadcast + engine styles)
├── js/join.js                    Participant join logic (Daily Prebuilt, themed)
├── js/console.js                 Host console: deck, people, engine wiring, PROGRAM-locked Go Live
├── js/engine.js                  The compositor: canvas layouts, Royal Flame cards, WebAudio mix, app-message control
├── netlify/functions/token.js    Rooms + tokens (host / participant / engine roles, canReceive echo rules)
├── netlify.toml                  /api/* → functions; publish "."
├── runner/                       E2 cloud runner: Dockerfile, compose, runner.js watchdog+FFmpeg, VPS README
└── MFM-STREAMING-APP-REFERENCE.md  This file
```

Deployed at **streamr2.netlify.app** (participants: `/?room=…` · host: `/host.html` · engine: `/program.html`).

### Workflow note for future chats
Browser chats push via the GitHub API (PAT with Contents read/write, re-fetch each file's
SHA right before updating). **Cowork cloud sessions:** the sandbox blocks raw GitHub REST
API calls — use git-over-HTTPS with the PAT instead (`git push https://x-access-token:<PAT>@github.com/Logan722/mfm-stream.git`).
Rotate the PAT after each session.

---

## Cost

- **Development:** Netlify free tier + Daily free allowance (10k participant-min/mo + $15 credit) = **$0 to start.**
- **Production:** Daily bills per participant-minute, plus live-streaming/recording minutes —
  **verify current rates at daily.co/pricing before going live** (20 people × 2.5 hrs/service
  adds up; estimate before trusting it weekly).
- **Bible API:** free.

---

## ★ DECISION (July 30, 2026): self-composited broadcast — the "Program Engine"

Daily's new compositor (mandatory once legacy EOLs this summer) proved unfit live:
banner overlay unsupported, mid-stream layout updates not applying (warnings with
actionTraceId per action), YouTube reporting underfed video. Dawn chose to **composite
the broadcast ourselves** (hybrid): we paint every pixel; Daily keeps doing transport.

### Architecture
- **Room: unchanged.** Participants on Prebuilt; console People board as-is.
- **`program.html` — the Program Engine**: joins the room via daily-js call object
  (participant named `PROGRAM`), receives all tracks, composites the broadcast on a
  1920×1080 canvas: layouts (grid/speaker/split/PiP/featured), Royal Flame overlays
  with REAL Fraunces/Inter Tight, boxed gold cards, multiple simultaneous layers,
  animated transitions, slates. Audio mixed via WebAudio → **per-source volume**
  (media clips, even per-participant gain). Publishes canvas.captureStream() + mixed
  audio as its cam/mic.
- **Delivery:** Daily live streaming with the bulletproof `single-participant` preset
  locked to PROGRAM's session id — set once at start, never updated mid-stream, no
  custom compositions. Sidesteps every new-pipeline bug. Multistream (YT×2/FB) and the
  9:16 second instance (portrait engine canvas later) unchanged.
- **Control:** console buttons send `sendAppMessage` commands to the engine
  (layout/cards/spotlight/media volume) — instant, all switching happens in-canvas.
  Console needs an Engine status indicator + Go Live path that targets PROGRAM.
- **Engine token:** extend `token.js` with an `engine` role (guard with HOST_KEY or a
  dedicated ENGINE_KEY env var); engine page takes room + key via its join form/URL.
- **Hosting (Dawn's choice): CLOUD from day one** — a small VPS (~4 vCPU, ~$25/mo class,
  e.g. Hetzner/DO) running headless Chromium (Playwright) with program.html open;
  Dockerfile + exact setup steps to be provided in-repo. Build/test path: the engine
  page works in ANY browser tab first; cloud is the deployment target once proven.
  (Note: Cowork cloud sandboxes cannot join Daily calls — WSS blocked — so engine
  testing happens in Dawn's browser until the VPS exists.)
- True OBS studio mode (real video preview/program) becomes buildable once the engine
  holds the tracks; boxed-card design returns; one-card limit dies.

### E2 SHIPPED (July 30, 2026) — cloud runner + our own RTMP pipe
- **`runner/` in the repo**: Dockerfile (Playwright image v1.62.1 + FFmpeg + Xvfb +
  Pulse), docker-compose (`restart: always`, 1GB shm, port 8080 health), entrypoint
  (Xvfb 1920×1080 + Pulse null sink `broadcast`), `runner.js`, step-by-step README
  (Hetzner CPX31 / DO 4vCPU, install docker, clone, .env, `docker compose up -d --build`).
- **runner.js**: launches a REAL Chromium window (kiosk, 1920×1080) on the virtual
  display with throttling disabled and autoplay allowed, opens
  `program.html?room&key&autostart=1&capture=1&monitor=1&runner=cloud`.
  Watchdog every 20s: draw-loop counter stalled 3× → relaunch browser; not joined 3× →
  reload (autostart rejoins); page crash → relaunch. During a mid-stream browser restart
  FFmpeg keeps pushing (viewers see a freeze, not a drop). Health JSON at `:8080/health`.
- **E2b — our own broadcast pipe**: console Go Live (when the cloud engine is online)
  sends `{cmd:"rtmp", action:"start", urls}` over the room; the engine page bridges it to
  runner.js via an exposed function; runner spawns **FFmpeg: x11grab (display) + Pulse
  monitor (the mix) → libx264 1080p30 5 Mbps veryfast/zerolatency + AAC 160k → tee muxer
  to ALL destinations at once** (`onfail=ignore` — one platform failing doesn't kill the
  rest). Unexpected FFmpeg exit → 3 auto-retries; state flows back through engine
  heartbeats to the console (LIVE chip, timer, Engine panel "streaming from the cloud
  runner"). **No Daily streaming API involved — no streaming fees, no instance limits.**
- **Engine page modes (E2)**: `?capture=1` fullscreen borderless canvas (verified
  1920×1080 1:1), `?monitor=1` mix → system audio (the null sink), `?runner=cloud`
  reported in heartbeats; `window.__MFM` liveness beacon; `window.__mfmRunnerEvent`
  receives FFmpeg state.
- **Go Live priority (automatic)**: cloud FFmpeg → Daily single-participant PROGRAM lock
  (engine in a browser) → legacy VCS. Console closing does NOT stop the cloud stream
  (that's the point).
- **Duplicate-engine defenses (field-found July 30 — a leftover browser engine tab ran
  alongside the fresh VPS engine)**: engines never composite/mix a fellow PROGRAM (no
  mirror-hall); the console tracks the CLOUD engine's session id from its heartbeats —
  commands, Go Live, and FFmpeg state all bind to it, never to a stray browser engine;
  Engine panel shows a red warning while two engines are present.
- **9:16 vertical**: still parked; becomes a second FFmpeg encode once the E3 portrait
  canvas exists. FFmpeg tee shape validated in sandbox; full Docker pipeline untestable
  from the sandbox (no Daily WSS) — first field test = first VPS deploy per runner/README.

### E3 SHIPPED (July 30, 2026)
- **Studio mode**: console "Studio" toggle → deck edits stage on a PREVIEW scene;
  **TAKE** (crossfade ~0.35s from a program snapshot) or **CUT** puts it on air. Engine
  renders the preview on a second canvas (half rate, "PREVIEW" watermark) and publishes
  it as PROGRAM's screen share — hosts/co-hosts see the monitor in Prebuilt (canReceive
  already allowed screenVideo); ministers can't. Preview share is skipped while a
  Daily-locked stream is live (never risk the on-air path). WYSIWYG card tag reads
  "PREVIEW — TAKE to air". Commands: scene-preview / studio {on} / take {fx}.
- **Slates**: Engine panel — None / Starting soon / BRB / Goodbye + optional custom line;
  part of the scene (stages under studio). Slate owns the whole frame (no tiles/cards).
- **Volume sliders** (engine mix, throttled `gain` cmds): Broadcast panel master;
  Media panel "link volume on the stream" (media). File playback keeps its own local slider.
- **9:16 portrait canvas**: `VERTICAL=1` in runner .env → Xvfb widens to 3000×1920;
  engine renders a 1080×1920 canvas at x=1920 (featured-person composition: cover-crop,
  top label, bottom card, portrait slates). Main FFmpeg crops 1920:1080:0:0; console
  "Go Live 9:16" starts a second FFmpeg (crop 1080:1920:1920:0, 3.5 Mbps) via
  start-vert/stop-vert. Heavier CPU — verify headroom or resize the droplet.
  Engine heartbeats carry vertical/studio/preview/ffmpegVert; console cv state drives
  the 9:16 chip/timer. Legacy Daily-portrait path only when NO engine is online.
- **DRY-RUN-CHECKLIST.md** added at repo root — run twice before any real service.
- E3 field test pending: studio + take, preview monitor, slates, sliders, 9:16 on a
  VERTICAL=1 runner.

### Studio monitors v2 (July 30, evening — Dawn: "I want OBS")
- Prebuilt-embedded preview wasn't it. Now: **Studio ON → an OBS-style monitor strip
  appears in the console** — PREVIEW | PROGRAM side by side above the deck, real video.
- How: `monitor.html` in an iframe (one Daily instance per page) joins as MONITOR via a
  new `monitor` token role (HOST_KEY-guarded, `user_id mfm-monitor`, publishes nothing,
  canReceive base:false + engine-only) and subscribes ONLY to the engine's camera
  (program) + screen share (preview). Console fetches the token and postMessages it in;
  People/mute-all filter MONITOR out. Ministers see one more inert tile while studio is on.
- ⚠️ The VPS engine loads its page ONCE — after every deploy run `docker compose restart`
  or new engine features silently don't exist. This bit us in the field.
- Next asks from Dawn's OBS comparison (not yet built): saved SCENES (one-tap named
  looks), image FLIERS as slates (her H&D flier — likely via /fliers/ images in the repo
  + URL slate), fade-to-black. Candidate scope for the hardening/E4 chat.

### Field round 2 (July 30, late) — studio approved; new asks
- ✅ Studio monitors + transition approved by Dawn ("did exactly what I loved").
- **Name labels now OFF the broadcast by default** — scene.labels, toggle in the Engine
  panel ("Name labels on the stream"), persists, stages under studio. Room always shows names.
- **MONITOR is now presence-hidden** (token `permissions.hasPresence: false`, plain-token
  fallback if rejected) — ministers shouldn't see it at all. **PROGRAM still shows an
  inert tile**: hiding ITS presence would break how the console finds/commands the engine —
  needs a session-id-from-heartbeats refactor + careful test. Dawn wants it gone: queued.
- **NEXT CHAT SCOPE (Dawn's asks, from her OBS mixer screenshots): AUDIO MIXER** —
  per-participant faders in People (engine already has per-source gain nodes; add
  cmd gain {source:"person", sid}), master compressor/limiter chain in the engine mix,
  meters if feasible. Plus: saved SCENES (one-tap looks), image FLIERS as slates,
  fade-to-black, hide PROGRAM presence test, phone-rotation guidance (engine already
  adapts to rotated tracks live; rotation lock is the usual culprit).

### Field round 3 (July 30, night)
- **Audio mixer v1**: a gold fader on EVERY People row — that person's level in the
  broadcast mix (engine `gain {source:"person", sid}`; gain remembered across
  mute/unmute). Room hearing unchanged. Fader values live on the console device.
- **Media panel grouped**: dropdown "From a link / From this computer" shows only the
  chosen option's controls.
- **Slates fully editable**: big line + small line are free text (60/90 chars); preset
  buttons just fill the big line; NO forced MFM branding on custom slates (Dawn runs
  multiple programs); brand appears only on the default empty-room slate. Slate format
  is now {title, line} (kind accepted for back-compat).
- "Layout on stream" renamed "Layout" — in studio mode it stages to PREVIEW then TAKEs,
  which is the intended answer to "layout should show on preview".
- Labels toggle NOTE: needs the VPS engine restarted after deploy, and in studio mode
  the change waits on TAKE like everything else.
- Still queued: vertical (9:16) monitor pane (needs engine custom-track publish +
  monitor subscription — test carefully), PROGRAM presence hiding, master
  compressor/limiter, saved scenes, image fliers, fade-to-black.

### Position-shaped cards (July 31, 2026 — Dawn)
- The Position control (Left / Center / Right) now SHAPES the card, not just moves it:
  **Left** = classic card, gold bar on the LEFT edge (unchanged) · **Right** = mirrored
  card, gold bar rides the RIGHT edge · **Center** = a LONG lower-third banner —
  fixed 1300px of the 1920 frame (~2/3 width), centered, with full-width gold bars
  along the TOP + BOTTOM instead of a side bar (Dawn picked top/bottom over side
  bars/full frame). Text wrap widens to fill the banner; slight extra padding clears
  the bars. Applies to every card kind (l3 / prayer / scripture); labels still step aside.
- **Prayer card: the "Prayer Point n of m" line is now GOLD** (`goldLight #d4a853`)
  instead of fire orange — on both the 16:9 and the 9:16 portrait card. The point text
  itself stays cream (Dawn's pick: counter line only).
- Engine `BUILD jul31-n15`. Verified in demo mode (all six shots). Legacy VCS fallback
  untouched (styled text has no bars). ⚠️ Remember: `docker compose restart` on the VPS
  after deploy or the engine keeps the old card.

### Console layout: Option B "Monitors First" (July 31, 2026 — Dawn)
Dawn reviewed four full-console mockups (A polished current / B monitors-first OBS /
C command rail / D theater) and picked **B**. Shipped:
- **console-main order:** monitors (hero, flex 1) → room filmstrip → deck tabs → deck.
- **Monitor bezels** live INSIDE monitor.html now: PREVIEW gold header, PROGRAM fire
  header with live dot, 9:16 pane header — rounded panes, gold hairline, shadow.
  ⚠️ `.wrap` gap (128px / 90px has-vert) + 6px side padding must stay in sync with
  `positionMonControls()` in console.js — TAKE/CUT float in that gap.
- **The room no longer disappears in studio mode** — the Daily call can show as a
  strip under the monitors via the **Room ▾** button (`body.room-hidden`).
  Field-adjusted same day: the strip starts COLLAPSED and the choice persists
  (`localStorage mfm-room-strip`) — on real laptop heights Daily Prebuilt's own
  chrome (~110px header+toolbar) swallowed a short strip, so open it now sits at
  clamp(220px, 30vh, 340px) where a real row of faces fits. Deck slimmed to
  clamp(205px, 26vh, 300px).
- **The deck is tabbed:** Broadcast / Lower Third / Prayer / Scripture / Media /
  Engine — one `.deck-page` at a time, each page a row of floating `.dp-card`
  Royal Flame cards. ALL original element IDs preserved (console.js queries by ID
  only, so no wiring changed). Chosen tab persists (`localStorage mfm-deck-tab`).
- Slates moved into the Engine tab; prayer points got their own tab with a tall
  textarea; destinations + vertical split into their own Broadcast-page cards.
- Engine-offline mode unchanged: monitors hidden, room full-height, tabs still work.
- Same day: Royal Flame scrollbars everywhere (thin rounded gold thumb on navy).
- Netlify deploy only — no VPS restart needed for console/monitor page changes.

### Field fixes round 2 (July 31, 2026 — Dawn's live test)
- **Monitors went black ("subscribed by id" then nothing):** monitor.html only
  subscribed once, by a session id the console captured earlier — stale after any
  engine restart, and it never handled the engine already being in the room.
  Now it sweeps `call.participants()` on join, re-subscribes on every
  participant event AND on a 4s retry timer until each feed attaches, and the
  pane messages say what's wrong in plain words (engine missing / attempt N).
- **Media "Show full-screen" / "Back to layout" buttons** on the Media tab —
  same `scene.spot` mechanism as People→Feature (media session id: link mode =
  remote-media-player sid; file mode = the MEDIA participant). Studio on →
  stages on PREVIEW, TAKE airs it; studio off → instant.
- Earlier same day: media file audio-only fixed (canvas pump in media.html +
  160×90 near-invisible helper frame); FFmpeg stderr tail now surfaces in the
  console error (runner.js — needs `git pull && docker compose up -d --build`
  on the droplet); page-links (YouTube etc.) rejected with a plain-words
  message instead of "[object Object]".
- Engine build jul31-n15 confirmed on the VPS during the test.

### ROOT CAUSE of the black monitors (July 31, late): HIDDEN=1 on the runner
- `HIDDEN=1` in runner/.env makes the engine join presence-hidden
  (`permissions.hasPresence:false`). A presence-hidden participant CANNOT be
  found via `participants()` or subscribed via `updateParticipant` by other
  clients — so the console monitors can never attach, even though heartbeats
  (app-messages) still flow and the Engine tab says "online". Also explains the
  missing PROGRAM tile in the room.
- **Rule: monitors and HIDDEN=1 are mutually exclusive. Keep HIDDEN unset.**
  Fix on the droplet: remove HIDDEN from runner/.env → `docker compose up -d --build`.
  Participants still get no PROGRAM media (canReceive in token.js); they just see
  a quiet tile. Hiding the TILE without killing presence = future work (queued).
- monitor.html now says this in the pane message and also falls back to the
  console-supplied engine sid hint.

### First real YouTube stream (July 31, night) — 2fps: CPU starvation, and the fixes
- Dawn went LIVE to YouTube from the cloud runner (pipeline works end to end!)
  but YouTube received ~2fps ("Poor" health). Cause: 4 SHARED vCPUs carrying
  Chromium (program + preview renders) AND FFmpeg x11grab of the **3000×1920**
  wide display (VERTICAL defaults ON) + libx264 veryfast.
- Software relief shipped: `X264_PRESET` env (default now **superfast**, ~30%
  less encode CPU) and `FPS` env; runner comments warn that the wide display
  nearly triples grab load. **If not streaming 9:16, set `VERTICAL=0` in
  runner/.env** — Xvfb drops to 1920×1080 (entrypoint.sh handles it), the crop
  filter disappears, portrait render stops. Re-enable VERTICAL=1 only for
  Instagram nights (needs a stronger box).
- Droplet note: Dawn bought a resize to Basic **4 vCPU SHARED** $48/mo — same
  class as before, hence "no change". If software fixes aren't enough, the
  meaningful upgrade is **CPU-Optimized (dedicated vCPU)**; resizes only apply
  after Power off → Resize → Power on.
- HIDDEN=1 was found in her .env and removed (see root-cause entry above).

### STANDING REMINDER (Dawn's request, July 31) — say this at session start/end
- **End of a work/stream session:** on the droplet run
  `cd mfm-stream/runner && docker compose down` (stops CPU burn + Daily
  participant-minutes), then close the console tab. Powering off the droplet
  saves nothing (DO bills powered-off droplets).
- **Start of a session:** `cd mfm-stream && git pull && cd runner && docker
  compose up -d --build`, then open the console and hard-refresh once.
- Every chat working this app should proactively remind Dawn of this ritual.

### CONFIRMED (July 31, ~11pm): VERTICAL=0 + superfast → YouTube "Excellent"
- Same 4-vCPU shared droplet went from "Poor"/2fps to **Excellent** — CPU
  starvation confirmed as the whole story. 16:9 works on the $48 box.
- 9:16 stays off until Dawn resizes to CPU-Optimized (dedicated) and sets
  VERTICAL=1 back. Console message guides this correctly.
- **NEW BUG for next session (cosmetic, visible to viewers):** the stream
  picture shows a thin strip of Chromium's address bar at the top — the engine
  window isn't truly fullscreen on Xvfb. Likely cause: runner.js launches with
  `--kiosk` but then `browser.newPage()` opens a SECOND window that kiosk
  doesn't apply to. Fix: `chromium.launchPersistentContext` (headless:false,
  viewport:null, same args) and use its first page instead of newPage — or
  offset the x11grab below the chrome. Verify by screenshotting the display.

### Bundle (July 31, afternoon) — kiosk fix · health strip · per-kind styles · bitrate
- **Browser strip on stream FIXED:** runner.js now uses `launchPersistentContext`
  (kiosk window IS the page) instead of launch+newPage (which opened a second,
  non-kiosk window). Verify after deploy via `http://IP:8080/snap` — a JPEG of
  the exact display FFmpeg grabs.
- **Stream Health strip** in the Engine tab: FFmpeg `-progress` vitals (fps,
  bitrate, speed, drops) ride heartbeats → green/amber/red verdict ("speed <
  0.9x = falling behind" would have caught the 2fps night). Plus deep-link
  buttons to YouTube Studio / FB Live Producer. `/snap` endpoint added.
- **Bitrate:** default 8000k (was 5000k), `BITRATE` env knob (YouTube asked for
  more; dedicated box handles it).
- **Per-kind card styles (Dawn):** scene.cardStyles {l3, prayer, scripture},
  each with pos/align/titleSize/bodySize (s-m-l-xl, INDEPENDENT — body is what
  people read)/colors/lift (0-300px raise). Style card per tab (.cs-card
  data-kind). Engine defaults: prayer+scripture = center banner, S gold title,
  L body. Legacy cardStyle/cardPos still accepted by engine normalizeScene.
- **Prayer points NOT persisted anymore** (Dawn: fresh list each service).
- Engine BUILD jul31-n17. Deploy = Netlify + droplet `git pull && docker
  compose up -d --build` (runner changed → full rebuild).

### NEXT SESSION — top of queue (July 30, end of day)
1. **Card style controls, modeled on Dawn's OBS "Lower Thirds" plugin screenshot**
   (analyzed): text alignment L/C/R, font size, line spacing, font choice, BOLD toggles,
   per-line colors (title #F2F2F2, subtitle #8A8A8A), accent color (#D54141), background
   color/opacity, corner radius, scale. Apply to ALL card kinds (l3/prayer/scripture) —
   one styling system + the existing 6-position grid. Console controls in the merged
   lower-third panel; style travels in the scene like everything else.
2. **BUG: studio 9:16 pane shows "waiting for portrait feed" while engine build jul30-n7
   reports vertical** — the portrait CUSTOM TRACK (engine `startCustomTrack` trackName
   "portrait" → monitor `setSubscribedTracks {custom:true}`) is the one untested API in
   the chain. Debug with droplet `docker compose logs` (look for page console.error) +
   browser console on monitor.html. Fallbacks if custom tracks won't fly: subscribe shape
   `{custom:{portrait:true}}`, or draw the 9:16 inside the PREVIEW share as an inset.
3. **Engine at 9 fps** on the wide display (3000×1920 + preview + portrait on 4 vCPU) —
   profile; likely needs the droplet resized (8 vCPU or CPU-Optimized) or portrait/preview
   render rates lowered. Program fps must stay ~25-30.
4. Then: saved scenes, image fliers, fade-to-black, full live test (DRY-RUN-CHECKLIST).

### Engine build phases (new chats)
| Chat | Scope | Status |
|------|-------|--------|
| E1 | program.html engine: join, canvas compositor (grid/speaker/featured), Royal Flame cards (l3/prayer/scripture), audio mix, app-message control, console Engine panel + PROGRAM-locked Go Live | ✅ July 30, 2026 |
| E2 | Cloud runner: Dockerfile (Playwright+Chromium), VPS setup steps, watchdog/auto-restart, engine health in console — PLUS the E2b FFmpeg direct-RTMP exit from Daily streaming | ✅ built July 30, 2026 · ⏳ first VPS deploy pending |
| E3 | Studio mode v2, 9:16 portrait canvas, volume sliders, slates/transitions, dry-run checklist | ✅ built July 30, 2026 · ⏳ field test pending |

### E1 SHIPPED (July 30, 2026) — how it actually works
- **`program.html` + `js/engine.js`.** Call-object join as `PROGRAM` (fixed
  `user_id: mfm-program-engine`), 1920×1080 canvas at 30fps published as its camera,
  WebAudio mix (mics + screen-share audio + media player, per-source gain — media/master
  gain commands ready; slider UI lands in E3) published as its mic
  (`micAudioMode: "music"` + `quality-optimized` send settings).
  Layouts: grid / speaker (dominant) / split / PiP / featured — featured full-bleeds any
  participant; screenshare and playing media auto-take the big slot. Boxed Royal Flame
  cards (lower third / prayer / scripture) with REAL Fraunces + Inter Tight, gold bar,
  fade + rise, "THE WORD" kicker on scripture; tile name labels step aside under the card.
  Empty room → branded slate. **Demo mode** for design checks with no Daily connection:
  `/program.html?demo=1&mode=dominant&card=scripture&n=6&spot=1`.
  `?room=…&key=…&autostart=1` is the headless/VPS path for E2.
- **Active speaker is computed IN the engine** (per-source RMS) — Daily's
  active-speaker event can't be used: the engine's own published mix would always win it.
- **Echo & visibility (the audio trap, solved).** The engine's mic is the mix of the
  whole room — anyone hearing it hears themselves delayed. Daily docs: the
  `single-participant` preset streams ONLY that participant's audio+video, so the
  broadcast carries the mix exactly once. In the room, tokens carry
  `permissions.canReceive` rules: **participants receive NOTHING from PROGRAM**
  (Dawn's choice — ministers see only an inert navy tile named PROGRAM, no media, no
  bandwidth), **hosts receive video only** (confidence monitor, never audio; the console
  also self-blocks at runtime as belt-and-braces). Co-host promotion grants PROGRAM
  video; demotion removes it. The name PROGRAM is reserved server-side.
- **token.js `engine` role**: guarded by `ENGINE_KEY` env var, falling back to
  `HOST_KEY` until one is set (body field `engineKey`); engine tokens last 12h.
  If Daily ever rejects the canReceive shape, minting retries plain so joining never breaks.
- **Console.** New **Engine deck panel** (status dot, heartbeat readout — layout/tiles/fps,
  "Open engine page", red alerts). **Go Live: engine online → locks the stream to
  PROGRAM's session id (`single-participant`), set once, NEVER updated mid-stream; engine
  offline → auto-fallback to the legacy VCS custom composition with a visible warning**
  (Dawn's choice: a service is never blocked). Every deck action (layout, feature, cards)
  reaches the engine as one idempotent `{t:"mfm-cmd", cmd:"scene"}` app-message (owners
  only are obeyed); the engine heartbeats `{t:"mfm-engine", state}` to owners every 3s.
  The engine is excluded from People, mute-all, and the room count. If the engine drops
  mid-broadcast: loud red alert — viewers see a frozen frame; a rejoined engine has a NEW
  session id, so the fix is End broadcast → Go Live again (re-lock). The **9:16 button is
  parked while the engine runs** (Daily's portrait layout mixes ALL room audio → doubled
  sound; the portrait engine canvas lands in E3).
- **FIELD-PROVEN same day (July 30, 2026):** 3-person live test to YouTube — locked
  stream, featured layout, real-font boxed card on the output, PROGRAM confidence tile
  for the host, engine hidden from People. YouTube ingest reported "Excellent."
- **Quality pass (same day, after the test — video was soft):** root cause: Daily serves
  receivers a LOW simulcast layer by default, so the engine composited low-res frames and
  upscaled blur. Fixes: engine requests the top layer of every camera
  (`updateReceiveSettings` `maxSimulcastLayer: 2`, legacy `layer: 2` fallback); engine
  publishes explicit encodings — 1080p30 up to 4.5 Mbps top layer (preset fallback);
  participants + host capture at 720p (`userMediaVideoConstraints`) and send
  `quality-optimized`. Remaining truth: quality is bounded by each camera and by the
  ENGINE MACHINE's connection — it downloads everyone and uploads ~4.5 Mbps. Run the
  engine on the strongest machine/connection available (it can be a different computer
  than the console — any browser + the engine key). The E2 VPS removes this entirely.
- **Operational notes:** keep the engine tab visible in its own window (background-tab
  throttling; the draw loop is interval-based and WebRTC pages are exempt from the worst
  of it, but don't tempt it — the VPS in E2 removes this concern). `/api/diag` stays for
  reference (remove in E3).

### Waiting room / admit-before-join — SHIPPED (Aug 1, 2026) · Feature 4, pending dry-run
Hardening (Phase 7): the host now approves each minister before they enter.
- **Rooms carry `enable_knocking:true`** (token.js sets it on create AND enables it
  in-place on pre-existing rooms). **Ministers join TOKENLESS** — token.js returns
  `token:null` for the participant role. This is mandatory: Daily auto-admits ANY
  meeting-token holder past the wait (verified in Daily docs), so only tokenless users
  knock. Host / engine / monitor / warden keep their tokens and bypass the wait.
- **join.js:** tokenless Prebuilt join passes the display name via `join({ userName })`
  (no token to carry it); Daily Prebuilt shows its native "waiting to be let in" screen.
  Client-side guard rejects the reserved name PROGRAM.
- **Echo block moved to the host (console.js `applyEngineReceive`).** A tokenless
  minister arrives with default `canReceive` and would hear PROGRAM's mic (the whole-room
  MIX = echo). The token used to block that. Now the HOST re-applies it via
  `updateParticipant(sid,{updatePermissions:{canReceive:{…engine:false}}})` on
  `participant-joined` + a `joined-meeting` sweep. This is valid ONLY because the host is
  a meeting admin — **Daily forbids a participant from restricting its own `canReceive`,
  and `setSubscribedTracks` throws while auto-subscribe is on**, so a participant-side
  fix in join.js is impossible (both confirmed in Daily docs). Co-hosts keep PROGRAM
  VIDEO (confidence monitor), never audio. ⚠️ Known window: the block lands a beat AFTER
  the minister joins, so admitting someone *while the engine is already broadcasting
  audio* can briefly echo (~0.5–2s) until the permission round-trips. Harmless when the
  engine isn't live; watch it if admitting mid-service.
- **Admit UI is board-integrated (Dawn's pick, Option 2) via a hidden "warden."**
  Daily's `updateWaitingParticipant`/`updateWaitingParticipants` are **✗ Prebuilt** —
  the console's Prebuilt frame can SEE the lobby (`waitingParticipants()` + events are
  ✓ Prebuilt) but can't ACT on it. So the console spawns **`lobby.html` in a hidden
  `#lobby-frame`**: a presence-hidden OWNER call-object (new `warden` token role,
  HOST_KEY-guarded, `user_id mfm-warden`, publishes/receives nothing) that watches the
  lobby and performs admit/deny. Same-origin postMessage bridge: warden → console sends
  the waiting list; console → warden sends admit / deny / admit-all (admit-all loops the
  singular method — the bulk one takes an updates-object, an easy footgun). Warden id ==
  admit id, so its list is the single source of truth. Buttons disable until the warden
  reports ready; a plain-words note shows while it connects.
- **"New knock" alert (Dawn asked for pulsing):** the People-board strip breathes gold
  the whole time anyone waits, one-shot fire-flash on a genuinely NEW id (diffed by id,
  not count), a pulsing dot in the strip header, a pulsing gold dot on the People toggle
  (`body.has-knocks`), and a soft two-note WebAudio chime — **chime muted while `bc.live`**
  so it can't bleed through the host mic onto the on-air mix.
- **engine.js** now also drops MONITOR/WARDEN tiles (insurance if the hidden mint ever
  falls back to visible).
- ⚠️ **TWO risks that only a live dry-run can settle (sandbox can't join Daily/WSS):**
  (1) does a `hasPresence:false` OWNER actually receive waiting events and admit? If the
  board never shows knockers, that assumption failed — flip the warden to a visible owner
  (remove `hasPresence:false` in token.js) or admit from Daily Prebuilt's OWN native
  People-panel admit UI, which still works as a fallback. (2) does tokenless Prebuilt
  knocking behave as expected on a phone? **Behavior change to tell the host:** the host
  must be IN the console for anyone to be admitted (the warden only runs while in-call),
  and the room can no longer fill before the host arrives.
- **Files:** `lobby.html` (new), `js/console.js`, `js/join.js`, `js/engine.js`,
  `netlify/functions/token.js`, `host.html`, `css/stream.css`. Netlify-only deploy — no
  VPS restart needed (console/participant pages). New env need: none (warden reuses
  HOST_KEY). Repo is PUBLIC — no keys committed.

## Phased roadmap

1. **Foundation room** — join link + multi-person interactive room. *Prove the core.* ✅
2. **Host controls** — hybrid console: participant board, mute/cam/remove, co-hosts. ✅
   *(spotlight & layouts land with Phase 3 composition, where they affect what viewers see)*
3. **Broadcast layouts** — 16:9 composition, layouts, spotlight, branding. ✅
   *(9:16 vertical moves to Phase 6 with the Instagram work — needs a 2nd streaming instance)*
4. **Overlays** — lower thirds + prayer points on the board. ✅ *(scripture next)*
5. **Bible / scripture** — KJV overlay + one-tap brand scriptures. ✅
6. **Multistream extras** — Instagram 9:16 vertical (2nd streaming instance). ✅ built;
   ⚠️ inactive until Daily support raises the domain's instance limit.
7. **Hardening** — auth, scheduling, reliability, dry runs before any live use.

---

## Multi-chat workflow

| Chat | Scope | Status |
|------|-------|--------|
| 0 | Setup — repo, Netlify, Daily account + token function | ✅ July 2026 |
| 1 | Foundation room (join + interactive room, Daily Prebuilt) | ✅ July 2026 |
| 2 | Host / co-host controls (hybrid console: Prebuilt video + custom board) | ✅ July 2026 |
| 3 | Broadcast composition — 16:9, layouts, spotlight, branding (9:16 → chat 6) | ✅ July 2026 |
| 4 | Overlays — lower thirds + prayer points (shared banner card slot) | ✅ July 2026 |
| 5 | Bible / scripture (KJV panel + brand one-taps) + console deck redesign + on-screen preview | ✅ July 2026 |
| 6 | Multistream (YT/FB + IG vertical) | ⬜ |
| 7 | Auth, scheduling, hardening, dry runs | ⬜ |

**Each chat:** read this blueprint → do its scope → commit to the repo → update this doc.

---

## Key decisions log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Media platform | **Daily.co** (switched from LiveKit, July 2026) | Managed service, meeting tokens, Prebuilt UI for fast start, built-in RTMP live streaming for multistream phase |
| Daily product | Video (`dashboard.daily.co`) | NOT pipecat/agents — never used |
| Room UI (Phase 1) | Daily Prebuilt, themed | Joinable this week; custom UI comes with the console phases |
| Room privacy | `private` + token-only entry | Nobody joins without a token from our function |
| Owner-token guard | `HOST_KEY` env var | Anyone could otherwise request host powers from the public endpoint |
| Token lifetime | 6 hours | Covers pre-program + full service |
| Default room | `sanctuary` | Host can spin up others (e.g. `rehearsal`) on the fly |
| Repo | Dedicated `mfm-stream` | Separate from the website; own deploy pipeline |
| Console architecture (Phase 2) | Hybrid: Prebuilt video + custom board | Must-not-fail video stays on Daily's proven UI; custom video arrives with broadcast phase |
| Co-host mechanism | Live grant of `canAdmin: ['participants']` | No rejoin needed; demotable; scoped to participant admin (not streaming) |
| Broadcast composition | Always VCS `custom` preset | Overlays (Phases 4–5) layer in live; switching to native presets would drop them |
| Stream keys | localStorage on host device only | Never server-side, never in repo; host pastes once, browser remembers |
| Stream spotlight | `videoSettings.preferredParticipantIds` + mode `single` | Verified baseline param; auto-release when the person leaves |
| Engine Go Live fallback (E1) | Auto: engine → PROGRAM lock; offline → legacy VCS + warning | Dawn, July 2026 — a service is never blocked on the engine |
| PROGRAM visibility (E1) | Ministers: blocked entirely (inert tile only); hosts/co-hosts: video, never audio | Dawn, July 2026 — clean room view; echo impossible by construction |
| Engine echo prevention (E1) | Token `permissions.canReceive` byUserId + single-participant preset (streams only PROGRAM's a/v per Daily docs) | Server-enforced; Prebuilt untouched; console self-blocks as backup |
| Engine key (E1) | `ENGINE_KEY` env var, HOST_KEY fallback until set | Separate rotatable secret for the future VPS without touching the host key |
| Active speaker in engine (E1) | Own per-source RMS detection in WebAudio | Daily's event would always flag the engine's own mix as the speaker |

## Open questions

- Who are the co-hosts / producers who'll run the board during services?
- Custom domain for the platform (e.g. `live.mfmmegaregion2usa.com`)?
- Recording: Daily cloud recording vs relying on YouTube archive?

---

Drafted June 2026 · Switched to Daily.co and Foundation room shipped July 2026.
Built in parallel with the live Zoom + OBS rig — never replacing it until proven.
