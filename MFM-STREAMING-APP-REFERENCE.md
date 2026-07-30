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
- **One card slot** on the stream (VCS banner overlay, bottom-left, fade transition);
  three producers replace each other in it: lower third, prayer point, scripture (Phase 5).
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

### Media panel (July 2026)
- Deck panel "Media — play a video": direct `.mp4`/`.m3u8` URL → Daily remote media
  player (`startRemoteMediaPlayer`) — the video joins as its own tile for the room AND
  the stream. Play / Pause / Resume / Stop; status + errors surfaced in the panel.
- **No server-side volume knob exists** for the media player. Full-volume-control
  alternative (documented in the panel): Share a browser tab playing the video with
  "Also share tab audio" — the tab player's slider controls what everyone hears.
- Per-participant volume rebalancing on the stream mix isn't a thing anywhere in the
  compositor: each person's level = their mic. Tools: mute, coaching, mic distance.

### ⚠️ OPEN INVESTIGATION — overlays still not applying (as of July 30, 2026)
- Even with `composition_id`, a field test showed NO card/labels on the YouTube output.
- Likely cause: Daily's **new VCS pipeline** (default for new customers since March
  2026; legacy EOL summer 2026; `enable_legacy_compositor` flag exists). The domain
  (created June 2026) is on the new pipeline; param support may differ.
- **Diagnostic endpoint shipped:** `GET /api/diag?k=<HOST_KEY>&room=sanctuary`
  (run while in the room, NOT broadcasting) returns domain config + Daily's verbatim
  response to our exact custom layout. Next session: read that JSON, then fix per facts.

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

### Current file structure (Phase 1)

```
mfm-stream/
├── index.html                    Participant join page (Royal Flame, camera/mic preview)
├── host.html                     Host console — pre-join (HOST_KEY) + Prebuilt video + control board
├── css/stream.css                Royal Flame design system (incl. console + broadcast styles)
├── js/join.js                    Participant join logic (Daily Prebuilt, themed)
├── js/console.js                 Host console: deck (broadcast, lower third, prayer points, scripture), people, preview
├── netlify/functions/token.js    Creates private rooms + mints tokens (Daily REST)
├── netlify.toml                  /api/* → functions; publish "."
└── MFM-STREAMING-APP-REFERENCE.md  This file
```

Deployed at **streamr2.netlify.app** (participants: `/?room=…` · host: `/host.html`).

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

## Open questions

- Who are the co-hosts / producers who'll run the board during services?
- Custom domain for the platform (e.g. `live.mfmmegaregion2usa.com`)?
- Recording: Daily cloud recording vs relying on YouTube archive?

---

Drafted June 2026 · Switched to Daily.co and Foundation room shipped July 2026.
Built in parallel with the live Zoom + OBS rig — never replacing it until proven.
