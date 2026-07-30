# Streaming Platform Decision Brief — Move off Daily, or Stage the Exit?

**MFM Mega Region 2 USA · July 30, 2026 · For Dawn**

## The question

Daily's limitations have cost us real pain: the compositor that silently dropped our cards,
mid-stream updates that never applied, an instance limit on the 9:16 vertical, no volume
control on their media player. Should we drop Daily entirely — find another platform or
build our own — or keep it in a reduced role?

## What Daily actually does for us today (after E1)

Since the Program Engine shipped, Daily no longer draws anything. Our engine paints every
pixel of the broadcast and mixes every sound. Daily is down to two plumbing jobs:

1. **The room** — moving 20 ministers' audio/video between phones and laptops: the SFU,
   TURN servers for hostile networks, reconnection after a dropped signal, echo
   cancellation, mobile browser quirks. This is the part that must never fail at 7am Sunday.
2. **The RTMP pipe** — taking the engine's feed and pushing it to YouTube/Facebook.

Every limitation that burned us lived in the parts we already stopped using or can stop
using next. None of the remaining pain is in the room; the room has been rock solid.

## The options, honestly

### A. Switch to another managed platform (Agora, 100ms, Vonage…)
Same category as Daily: per-minute billing, vendor rules, another compositor to fight.
Agora charges $3.99 per 1,000 HD participant-minutes with a 10k/month free tier — nearly
identical to Daily's $4.00/1,000 ($0.004/min). We would rewrite the entire room layer to
end up in the same place with a less battle-tested engine integration. **No real gain.**

### B. Full self-build now (LiveKit self-hosted + our engine, all at once)
LiveKit's server is free, open-source software we'd run on our own machine. Total control,
zero per-minute fees forever. The costs are real though: we run the room infrastructure —
domain + SSL, TURN config, Redis, port ranges, updates — and when a phone won't reconnect
on Sunday morning, there is no vendor; there is us. Doing this as one big cutover means
weeks with no working platform and a first live service on day-one infrastructure.
**Right destination for control, wrong way to travel.**

### C. Staged exit (recommended) — shrink Daily's job in safe steps
Each step ships alone, is tested alone, and never bets a service:

- **E2a — engine to a VPS (~$25–50/mo, e.g. Hetzner/DigitalOcean).** Headless Chromium
  runs program.html in the cloud. Your laptop stops carrying the broadcast; datacenter
  bandwidth carries it. Fixes the strain and most of the quality ceiling.
- **E2b — our own RTMP pipe.** FFmpeg on that same VPS captures the engine and pushes
  directly to YouTube/Facebook/Instagram. Daily's streaming API — its fees
  ($0.015/min ≈ $2.25/service), instance limits, preset quirks — becomes unnecessary.
  A 9:16 vertical is just a second FFmpeg process; nobody's permission needed.
  **After this, Daily = the room only.**
- **E4 — replace the room (optional, decided with data).** If Daily still chafes after a
  month of real Sundays, swap the room to self-hosted LiveKit on our own server. The
  engine, console, cards — everything you see — survives; only the join/track layer
  changes SDK. Decide with a month of real bills and reliability history in hand.

## Monthly cost at our scale
*(assumes ~4–5 services/month, 2.5 hrs, ~22 connections incl. host + engine ≈ 15,000
participant-minutes/month; verify against the first real Daily invoice)*

| Setup | Daily fees | Server | Total/mo | Who fixes Sunday problems |
|---|---|---|---|---|
| Today (all-Daily transport) | ~$20–30 | $0 | ~$20–30 | Daily (room), us (engine) |
| After E2a (engine on VPS) | ~$20–30 | $25–50 | ~$45–80 | Daily (room), us (engine+VPS) |
| After E2b (our RTMP) | ~$19 (room only) | $25–50 | ~$45–70 | Daily (room), us (rest) |
| E4 (LiveKit self-host) | $0 | $30–100 | ~$30–100 flat | **Us, entirely** |
| Switch to Agora instead | ~$20–35 | $0 | ~$20–35 | Agora — same trade as Daily |

Money is not the decider — every path lands within roughly $50/month of the others at our
size. The decision is **who owns the risk**: managed room (someone else's 3am problem,
their rules) vs self-hosted room (our rules, our 3am problem).

## Recommendation

Take path C. Start E2a now, E2b immediately after — that alone removes every Daily
limitation you have personally hit (laptop strain, streaming fees, instance limits,
compositor quirks; the volume and card-position asks are already shipped in our engine).
Hold the E4 room decision until we have a month of real invoices and a few clean Sundays;
if the appetite for full ownership is still there, LiveKit self-hosted is the proven
next step, and our engine + console carry over.

## Sources

- Daily pricing: daily.co/pricing/video-sdk ($0.004/participant-min video, $0.015/min RTMP streaming, 10k free min/mo)
- Agora pricing: agora.io/en/pricing/video-calling ($3.99/1k HD participant-min, 10k free/mo)
- LiveKit self-hosting requirements: docs.livekit.io/home/self-hosting/deployment (embedded TURN, Redis recommended, domain+SSL, port config)
- LiveKit Cloud pricing: livekit.com/pricing (now oriented to AI-agent plans; OSS server remains free to self-host)
