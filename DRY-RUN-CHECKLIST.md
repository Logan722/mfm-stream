# Dry-Run Checklist — before any real service

Run this full pass at least twice, days apart, before trusting a live Sunday.

## Before (30 min out)
1. VPS: `docker compose up -d` running · `http://IP:8080/health` shows ok, ffmpeg idle
2. Console joins · Engine panel green "Cloud engine online" · no red warnings
3. No stray engines (exactly one PROGRAM; no program.html tabs open anywhere)
4. Fresh stream keys pasted (YouTube persists; Instagram needs a NEW key each session)
5. Slate "Starting soon" up · master volume at 100 · card position where you want it

## Sound check (with 2–3 ministers)
6. Each speaks — engine page audio meter moves; mute/unmute from People works
7. Nobody hears PROGRAM (no echo) · ministers see no PROGRAM video

## Go Live (to unlisted YouTube first)
8. Go Live → "LIVE — streaming from the cloud runner" within ~15s
9. On YouTube: picture sharp, audio clean, ~5–20s behind (normal)
10. Push lower third, prayer point, scripture · switch all four layouts · Feature someone
11. Studio mode: stage a change → TAKE (fade) and CUT both land
12. Play a media file (volume slider works live) · stop it
13. Close the console laptop lid 60s — stream unaffected
14. End broadcast → YouTube shows stream ended cleanly

## After
15. `docker compose logs --tail 100` — no repeated errors/restarts
16. CPU graph peaked under ~80% (else resize the droplet)
17. Note anything odd in the blueprint's open questions
