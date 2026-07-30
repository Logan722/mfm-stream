/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Program Engine (program.html) — the self-composited broadcast
   ------------------------------------------------------------
   Joins the room via the daily-js call object as PROGRAM and
   paints every pixel of the broadcast on a 1920×1080 canvas:
   layouts (grid / speaker / split / PiP / featured), Royal Flame
   cards with REAL Fraunces + Inter Tight, and a WebAudio mix of
   everyone's audio (per-source gain). The canvas + mix publish
   as PROGRAM's camera and mic; the console's Go Live locks the
   stream to this participant with Daily's bulletproof
   single-participant preset — set once, never updated mid-stream.

   Echo safety: nobody in the room can hear PROGRAM — the token
   function blocks PROGRAM's audio via canReceive for everyone.

   Control: the host console sends app-messages —
     { t:"mfm-cmd", cmd:"scene", scene:{ mode, spot, card } }
     { t:"mfm-cmd", cmd:"gain",  source:"media"|"master", value }
     { t:"mfm-cmd", cmd:"ping" }
   The engine replies to owners with:
     { t:"mfm-engine", state:{ mode, spot, card, live, tiles, fps } }

   Demo mode (?demo=1&mode=…&card=…&n=…) composites fake tiles
   with no Daily connection — for design checks and screenshots.
   ============================================================ */

(function () {
  "use strict";

  var qs = new URLSearchParams(window.location.search);
  var DEMO = qs.get("demo") === "1";

  /* Cloud-runner modes (E2):
     ?capture=1  — fullscreen borderless canvas, exactly the broadcast frame,
                   so FFmpeg can x11grab the window 1:1
     ?monitor=1  — also play the mixed audio out of the system device, so
                   FFmpeg can capture it from the Pulse null sink
     ?runner=cloud — reports itself as the cloud engine; enables the FFmpeg
                   bridge (window.__mfmRunner is exposed by runner.js) */
  var CAPTURE = qs.get("capture") === "1";
  var MONITOR = qs.get("monitor") === "1";
  var RUNNER = qs.get("runner") === "cloud";
  var VERTICAL = qs.get("vertical") === "1"; // render the 9:16 portrait canvas too
  var ffmpegState = { running: false, startedAt: 0, detail: "" };
  var ffmpegVertState = { running: false, startedAt: 0, detail: "" };

  var W = 1920, H = 1080, FPS = 30;
  var FADE = 0.22; // card fade seconds

  /* ---------- Royal Flame tokens ---------- */
  var C = {
    navyDeep: "#0f1a30",
    navy: "#142240",
    panel: "#1a2d4d",
    cardBg: "rgba(10, 16, 28, 0.93)",
    cream: "#f0e6d0",
    subText: "#b9c4da",
    dim: "#8899b8",
    gold: "#c9952c",
    goldLight: "#d4a853",
    fire: "#e85d26",
    fireLight: "#ff7a3d",
  };
  var SERIF = "Fraunces, Georgia, serif";
  var SANS = "\"Inter Tight\", system-ui, sans-serif";

  /* ---------- Elements ---------- */
  var els = {
    form: document.getElementById("join-form"),
    key: document.getElementById("engine-key"),
    room: document.getElementById("room"),
    joinBtn: document.getElementById("join-btn"),
    error: document.getElementById("error"),
    stageWrap: document.getElementById("stage-wrap"),
    barRoom: document.getElementById("bar-room"),
    barCount: document.getElementById("bar-count"),
    liveChip: document.getElementById("live-chip"),
    demoChip: document.getElementById("demo-chip"),
    fpsLabel: document.getElementById("fps-label"),
    leaveBtn: document.getElementById("leave-btn"),
    stLayout: document.getElementById("st-layout"),
    stCard: document.getElementById("st-card"),
    stAudio: document.getElementById("st-audio"),
    stNote: document.getElementById("st-note"),
  };

  var canvas = document.getElementById("program-canvas");
  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext("2d", { alpha: false });

  // Preview canvas (studio monitor — published as PROGRAM's screen share)
  var previewCanvas = document.createElement("canvas");
  previewCanvas.width = W;
  previewCanvas.height = H;
  var previewCtx = previewCanvas.getContext("2d", { alpha: false });

  // Portrait canvas (9:16 — FFmpeg crops it from the wide display)
  var portraitCanvas = document.getElementById("portrait-canvas");
  var portraitCtx = null;
  if (portraitCanvas && VERTICAL) {
    portraitCanvas.width = 1080;
    portraitCanvas.height = 1920;
    portraitCtx = portraitCanvas.getContext("2d", { alpha: false });
    portraitCanvas.hidden = false;
  }

  /* ---------- State ---------- */
  var scene = { mode: "grid", spot: null, card: null, cardPos: "bl", slate: null, labels: false };
  var cardDraw = { card: null, alpha: 0 };

  /* Studio mode (E3): a second, STAGED scene the console edits without
     touching air; TAKE swaps it onto the program with a crossfade. */
  var studio = { on: false };
  var scenePreview = null;
  var cardDrawPrev = { card: null, alpha: 0 };
  var takeFx = { t: 0, dur: 0.35, snap: null }; // fade from a snapshot of the old program
  var SLATES = { soon: "WE'LL BEGIN SHORTLY", brb: "BE RIGHT BACK", end: "THANK YOU FOR JOINING US" };
  var call = null;
  var joined = false;
  var live = false;
  var joinedRoom = cleanRoom(qs.get("room")) || "sanctuary";
  var localId = null;

  // session_id -> { order, name, kind: "person"|"media", videoEl, videoTrackId, screenEl, screenTrackId }
  var people = {};
  var orderCounter = 0;

  var activeSpeaker = null; // session_id — computed from OUR audio graph, not
                            // Daily's event (the engine's own mix would win it)

  /* ---------- Audio graph ---------- */
  var AG = { ctx: null, master: null, dest: null, analyser: null, sources: {} };
  var gains = { media: 1, master: 1 };

  function initAudio() {
    if (AG.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    AG.ctx = new AC({ sampleRate: 48000 });
    AG.master = AG.ctx.createGain();
    AG.master.gain.value = gains.master;
    AG.dest = AG.ctx.createMediaStreamDestination();
    AG.analyser = AG.ctx.createAnalyser();
    AG.analyser.fftSize = 512;
    AG.master.connect(AG.dest);
    AG.master.connect(AG.analyser);
    // Cloud runner: the mix also plays out of the system device so FFmpeg
    // hears it (a Pulse null sink on the VPS — nobody's speakers).
    if (MONITOR) AG.master.connect(AG.ctx.destination);
  }

  /* One source per (participant, track kind). key: sid + ":a" | ":sa" */
  function addAudio(key, track, kind, sid) {
    var cur = AG.sources[key];
    if (cur && cur.trackId === track.id) return;
    removeAudio(key);

    var stream = new MediaStream([track]);
    // Chromium quirk: WebAudio stays SILENT for a remote WebRTC track unless
    // the stream is also attached to an audio element. Muted, so only the mix
    // (via AG.dest) is ever heard by the stream — never this page.
    var el = document.createElement("audio");
    el.muted = true;
    el.autoplay = true;
    el.srcObject = stream;
    el.play().catch(function () { /* resumes with the audio context */ });

    var src = AG.ctx.createMediaStreamSource(stream);
    var gain = AG.ctx.createGain();
    gain.gain.value = kind === "media" ? gains.media : 1;
    var an = AG.ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(gain);
    gain.connect(AG.master);
    gain.connect(an);

    AG.sources[key] = {
      node: src, gain: gain, analyser: an, el: el,
      kind: kind, sid: sid, trackId: track.id, ema: 0,
      buf: new Uint8Array(an.frequencyBinCount),
    };
  }

  function removeAudio(key) {
    var s = AG.sources[key];
    if (!s) return;
    try { s.node.disconnect(); } catch (e) { /* fine */ }
    try { s.gain.disconnect(); } catch (e) { /* fine */ }
    try { s.el.srcObject = null; } catch (e) { /* fine */ }
    delete AG.sources[key];
  }

  function setGain(source, value) {
    var v = Math.max(0, Math.min(2, Number(value)));
    if (isNaN(v)) return;
    if (source === "master" && AG.master) {
      gains.master = v;
      AG.master.gain.value = v;
    } else if (source === "media") {
      gains.media = v;
      Object.keys(AG.sources).forEach(function (k) {
        if (AG.sources[k].kind === "media") AG.sources[k].gain.gain.value = v;
      });
    }
  }

  /* Our own active-speaker detection: smoothed RMS per person source.
     (Daily's active-speaker event can't be trusted here — the engine's own
     published mix would register as the loudest "speaker" in the room.) */
  function stepSpeaker() {
    var bestId = null, bestVal = 0;
    Object.keys(AG.sources).forEach(function (k) {
      var s = AG.sources[k];
      if (s.kind !== "person") return;
      s.analyser.getByteTimeDomainData(s.buf);
      var sum = 0;
      for (var i = 0; i < s.buf.length; i++) {
        var d = (s.buf[i] - 128) / 128;
        sum += d * d;
      }
      var rms = Math.sqrt(sum / s.buf.length);
      s.ema = s.ema * 0.75 + rms * 0.25;
      if (s.ema > bestVal) { bestVal = s.ema; bestId = s.sid; }
    });
    if (bestId && bestVal > 0.015) activeSpeaker = bestId; // hold last otherwise
  }

  /* ---------- Participant registry ---------- */
  function cleanRoom(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function playableTrack(p, key) {
    var t = p.tracks && p.tracks[key];
    if (!t || t.state !== "playable") return null;
    return t.persistentTrack || t.track || null;
  }

  function syncParticipant(p) {
    if (!p || p.local) return;
    // Never composite or mix a FELLOW engine (someone left a second engine
    // running) — that way lies a mirror hall and doubled audio.
    if (p.user_name === "PROGRAM" || p.user_id === "mfm-program-engine") {
      dropParticipant(p.session_id);
      return;
    }
    var id = p.session_id;
    var rec = people[id];
    if (!rec) {
      rec = people[id] = {
        order: orderCounter++, name: "", kind: "person",
        videoEl: null, videoTrackId: null, screenEl: null, screenTrackId: null,
      };
    }
    rec.kind = p.participantType === "remote-media-player" ? "media" : "person";
    rec.name = rec.kind === "media" ? "Video" : (p.user_name || "Guest").slice(0, 40);

    syncVideoEl(rec, "videoEl", "videoTrackId", playableTrack(p, "video"));
    syncVideoEl(rec, "screenEl", "screenTrackId", playableTrack(p, "screenVideo"));

    var a = playableTrack(p, "audio");
    if (a) addAudio(id + ":a", a, rec.kind === "media" ? "media" : "person", id);
    else removeAudio(id + ":a");

    var sa = playableTrack(p, "screenAudio"); // tab-share audio workflow
    if (sa) addAudio(id + ":sa", sa, "person", id);
    else removeAudio(id + ":sa");

    updateBarCount();
  }

  function syncVideoEl(rec, elKey, idKey, track) {
    if (track) {
      if (rec[elKey] && rec[idKey] === track.id) return;
      dropVideoEl(rec, elKey);
      var v = document.createElement("video");
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.srcObject = new MediaStream([track]);
      v.play().catch(function () { /* draws once frames arrive */ });
      rec[elKey] = v;
      rec[idKey] = track.id;
    } else {
      dropVideoEl(rec, elKey);
      rec[idKey] = null;
    }
  }

  function dropVideoEl(rec, elKey) {
    if (rec[elKey]) {
      try { rec[elKey].srcObject = null; } catch (e) { /* fine */ }
      rec[elKey] = null;
    }
  }

  function dropParticipant(id) {
    var rec = people[id];
    if (rec) {
      dropVideoEl(rec, "videoEl");
      dropVideoEl(rec, "screenEl");
    }
    removeAudio(id + ":a");
    removeAudio(id + ":sa");
    delete people[id];
    if (scene.spot === id) scene.spot = null; // auto-release
    if (activeSpeaker === id) activeSpeaker = null;
    updateBarCount();
  }

  function updateBarCount() {
    if (!els.barCount) return;
    var n = Object.keys(people).length;
    els.barCount.textContent = DEMO ? n + " demo tiles" : n + " in room";
  }

  /* ---------- UI helpers ---------- */
  function showError(msg) {
    if (!els.error) return;
    if (!msg) { els.error.hidden = true; els.error.textContent = ""; return; }
    els.error.hidden = false;
    els.error.textContent = msg;
  }

  function setBusy(busy) {
    if (!els.joinBtn) return;
    els.joinBtn.disabled = busy;
    els.joinBtn.textContent = busy ? "Starting the engine…" : "Start the Engine";
  }

  function setNote(msg) {
    if (els.stNote) els.stNote.textContent = msg;
  }

  /* ---------- Fonts (canvas needs them loaded before drawing) ---------- */
  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load("650 40px Fraunces"),
      document.fonts.load("800 150px Fraunces"),
      document.fonts.load("400 28px \"Inter Tight\""),
      document.fonts.load("600 24px \"Inter Tight\""),
      document.fonts.load("700 22px \"Inter Tight\""),
    ]).catch(function () { /* fallback fonts still render */ });
  }

  /* ---------- Join flow ---------- */
  if (els.room) els.room.value = joinedRoom;
  if (qs.get("key") && els.key) els.key.value = qs.get("key");

  if (els.form) {
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      start();
    });
  }

  function enterStage() {
    document.body.classList.add("in-call");
    if (CAPTURE) document.body.classList.add("capture-mode");
    if (CAPTURE && VERTICAL) document.body.classList.add("capture-wide");
    if (els.stageWrap) els.stageWrap.hidden = false;
    if (els.barRoom) els.barRoom.textContent = DEMO ? "demo" : joinedRoom;
    if (els.demoChip) els.demoChip.hidden = !DEMO;
    acquireWakeLock();
    startLoop();
  }

  function start() {
    showError("");
    joinedRoom = cleanRoom(els.room ? els.room.value : "") || "sanctuary";

    var key = els.key ? els.key.value : "";
    if (!key) { showError("Please enter the engine key."); return; }

    setBusy(true);
    initAudio();
    if (AG.ctx.state === "suspended") AG.ctx.resume();

    loadFonts().then(function () {
      return fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "engine", room: joinedRoom, engineKey: key }),
      });
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          showError(result.data && result.data.error ? result.data.error : "Something went wrong. Please try again.");
          setBusy(false);
          return;
        }
        connect(result.data);
      })
      .catch(function () {
        showError(
          "Could not reach the token service. Make sure you opened the live site " +
          "(the Netlify link), not a local copy of this file."
        );
        setBusy(false);
      });
  }

  function connect(grant) {
    var Daily = window.Daily || window.DailyIframe;
    if (!Daily || !Daily.createCallObject) {
      showError("The video library failed to load. Please refresh and try again.");
      setBusy(false);
      return;
    }

    var videoTrack = canvas.captureStream(FPS).getVideoTracks()[0];
    var audioTrack = AG.dest.stream.getAudioTracks()[0];

    try {
      call = Daily.createCallObject({
        subscribeToTracksAutomatically: true,
        videoSource: videoTrack,
        audioSource: audioTrack,
        dailyConfig: { micAudioMode: "music" }, // stereo/high-bitrate mix — worship-safe
      });
    } catch (err) {
      // Some daily-js builds reject unknown config — retry without it.
      call = Daily.createCallObject({
        subscribeToTracksAutomatically: true,
        videoSource: videoTrack,
        audioSource: audioTrack,
      });
    }

    call
      .on("joined-meeting", function (ev) {
        joined = true;
        localId = ev && ev.participants && ev.participants.local
          ? ev.participants.local.session_id : null;
        setBusy(false);
        enterStage();
        setNote("Engine on. The console's Go Live locks the stream to this feed.");
        // Pick up anyone already in the room
        var map = call.participants() || {};
        Object.keys(map).forEach(function (k) {
          if (k !== "local") syncParticipant(map[k]);
        });
        // QUALITY PASS (field test, July 30 2026): without this, Daily serves
        // receivers a LOW simulcast layer of each camera — the canvas then
        // upscales blur to 1080p. Ask for the highest layer of everyone.
        requestHighLayers();
        // And publish the program feed hot: 1080p30, up to 4.5 Mbps top layer
        // (the stream takes this track as-is; costs upload on the engine machine).
        try {
          call.updateSendSettings({
            video: {
              encodings: {
                low: { maxBitrate: 400000, scaleResolutionDownBy: 4, maxFramerate: 15 },
                medium: { maxBitrate: 1400000, scaleResolutionDownBy: 2, maxFramerate: 30 },
                high: { maxBitrate: 4500000, scaleResolutionDownBy: 1, maxFramerate: 30 },
              },
            },
          }).catch(function () {
            // Custom encodings rejected — fall back to the strongest preset.
            return call.updateSendSettings({ video: "quality-optimized" }).catch(function () {});
          });
        } catch (e) { /* defaults still stream */ }
        startHeartbeat();
      })
      .on("participant-joined", function (ev) { syncParticipant(ev.participant); })
      .on("participant-updated", function (ev) { syncParticipant(ev.participant); })
      .on("track-started", function (ev) { syncParticipant(ev.participant); })
      .on("track-stopped", function (ev) { syncParticipant(ev.participant); })
      .on("participant-left", function (ev) {
        dropParticipant(ev && ev.participant && ev.participant.session_id);
      })
      .on("app-message", handleCommand)
      .on("live-streaming-started", function () { live = true; syncLiveChip(); })
      .on("live-streaming-stopped", function () { live = false; syncLiveChip(); })
      .on("live-streaming-error", function () { live = false; syncLiveChip(); })
      .on("nonfatal-error", function (ev) {
        setNote("Daily warning: " + ((ev && (ev.type + " " + (ev.errorMsg || ""))) || "unknown"));
      })
      .on("left-meeting", teardown)
      .on("error", function (ev) {
        showError("Engine call error: " + ((ev && ev.errorMsg) || "unknown") + " — start it again.");
        teardown();
      });

    call.join({ url: grant.url, token: grant.token }).catch(function () {
      showError("The engine could not join the room. Please try again.");
      teardown();
    });
  }

  /* Ask Daily for the top simulcast layer of every remote camera. Tries the
     current receiveSettings shape first, then the older one. */
  function requestHighLayers() {
    var attempts = [
      { base: { video: { maxSimulcastLayer: 2 } } },
      { base: { video: { layer: 2 } } },
    ];
    function tryNext(i) {
      if (!call || i >= attempts.length) return;
      try {
        call.updateReceiveSettings(attempts[i]).catch(function () { tryNext(i + 1); });
      } catch (e) { tryNext(i + 1); }
    }
    tryNext(0);
  }

  function teardown() {
    joined = false;
    live = false;
    stopHeartbeat();
    stopLoop();
    releaseWakeLock();
    Object.keys(people).forEach(dropParticipant);
    if (call) {
      try { call.destroy(); } catch (e) { /* already gone */ }
      call = null;
    }
    document.body.classList.remove("in-call");
    if (els.stageWrap) els.stageWrap.hidden = true;
    setBusy(false);
  }

  if (els.leaveBtn) {
    els.leaveBtn.addEventListener("click", function () {
      if (DEMO) { window.location.search = ""; return; }
      if (call) { try { call.leave(); } catch (e) { teardown(); } }
      else teardown();
    });
  }

  function syncLiveChip() {
    if (els.liveChip) els.liveChip.hidden = !(live || ffmpegState.running);
  }

  /* ---------- Commands from the console ---------- */
  var MODES = { grid: 1, dominant: 1, split: 1, pip: 1 };

  function handleCommand(ev) {
    var d = ev && ev.data;
    if (!d || d.t !== "mfm-cmd") return;
    var sender = call && call.participants ? (call.participants() || {})[ev.fromId] : null;
    if (!sender || !sender.owner) return; // only the host console drives the engine

    if (d.cmd === "scene" && d.scene) {
      scene = normalizeScene(d.scene, scene);
    } else if (d.cmd === "scene-preview" && d.scene) {
      studio.on = true;
      scenePreview = normalizeScene(d.scene, scenePreview || copyScene(scene));
      ensurePreviewShare();
    } else if (d.cmd === "studio") {
      studio.on = !!d.on;
      if (studio.on) {
        scenePreview = scenePreview || copyScene(scene);
        ensurePreviewShare();
      } else {
        scenePreview = null;
        cardDrawPrev = { card: null, alpha: 0 };
        stopPreviewShare();
      }
    } else if (d.cmd === "take") {
      if (studio.on && scenePreview) doTake(d.fx === "cut" ? "cut" : "fade");
    } else if (d.cmd === "gain") {
      setGain(d.source, d.value);
    } else if (d.cmd === "rtmp") {
      // Cloud runner only: start/stop the VPS-side FFmpeg push. The bridge
      // function is exposed by runner.js; in a normal browser this is a no-op.
      if (RUNNER && typeof window.__mfmRunner === "function") {
        try {
          window.__mfmRunner(JSON.stringify({ action: d.action, urls: d.urls || [] }));
        } catch (e) { /* runner gone — watchdog will notice */ }
      }
    } else if (d.cmd === "ping") {
      sendState(ev.fromId);
      return;
    }
    sendStateToOwners();
  }

  /* runner.js pushes FFmpeg state changes here (start/exit). */
  window.__mfmRunnerEvent = function (ev) {
    if (!ev) return;
    if (ev.ffmpeg) {
      ffmpegState = {
        running: !!ev.ffmpeg.running,
        startedAt: Number(ev.ffmpeg.startedAt) || 0,
        detail: String(ev.ffmpeg.detail || "").slice(0, 200),
      };
    }
    if (ev.ffmpegVert) {
      ffmpegVertState = {
        running: !!ev.ffmpegVert.running,
        startedAt: Number(ev.ffmpegVert.startedAt) || 0,
        detail: String(ev.ffmpegVert.detail || "").slice(0, 200),
      };
    }
    syncLiveChip();
    sendStateToOwners();
  };

  function normalizeCard(card) {
    if (!card || !card.title) return null;
    return {
      kind: String(card.kind || "l3"),
      title: String(card.title).slice(0, 80),
      subtitle: String(card.subtitle || "").slice(0, 320),
    };
  }

  function normalizeScene(sc, base) {
    var out = base ? copyScene(base) : { mode: "grid", spot: null, card: null, cardPos: "bl", slate: null, labels: false };
    out.labels = !!sc.labels; // Dawn (July 30): names OFF the broadcast by default
    if (MODES[sc.mode]) out.mode = sc.mode;
    out.spot = sc.spot && people[sc.spot] ? sc.spot : null;
    out.card = normalizeCard(sc.card);
    if (/^[tb][lcr]$/.test(sc.cardPos || "")) out.cardPos = sc.cardPos;
    out.slate = sc.slate && SLATES[sc.slate.kind]
      ? { kind: sc.slate.kind, line: String(sc.slate.line || "").slice(0, 90) }
      : null;
    return out;
  }

  function copyScene(sc) {
    return JSON.parse(JSON.stringify(sc));
  }

  function doTake(fx) {
    if (fx !== "cut") {
      if (!takeFx.snap) {
        takeFx.snap = document.createElement("canvas");
        takeFx.snap.width = W;
        takeFx.snap.height = H;
      }
      takeFx.snap.getContext("2d").drawImage(canvas, 0, 0);
      takeFx.t = takeFx.dur;
    }
    scene = copyScene(scenePreview);
    cardDraw = { card: scene.card, alpha: scene.card ? 1 : 0 }; // no re-fade on take
    sendStateToOwners();
  }

  /* Preview monitor: the preview canvas rides PROGRAM's screen-share track.
     Hosts/co-hosts can see it (canReceive allows screenVideo); ministers can't.
     Skipped while a Daily-locked stream is live — never risk the on-air path. */
  var previewShared = false;

  function ensurePreviewShare() {
    if (previewShared || !call || !joined || live) return;
    try {
      var track = previewCanvas.captureStream(12).getVideoTracks()[0];
      call.startScreenShare({ mediaStream: new MediaStream([track]) });
      previewShared = true;
    } catch (e) { /* monitor is optional — staging still works */ }
  }

  function stopPreviewShare() {
    if (!previewShared) return;
    try { call.stopScreenShare(); } catch (e) { /* fine */ }
    previewShared = false;
  }

  /* ---------- State back to the console ---------- */
  var heartbeatId = null;
  var fpsMeasured = 0;

  function engineState() {
    return {
      mode: scene.mode,
      spot: scene.spot,
      card: scene.card ? scene.card.kind : null,
      live: live,
      tiles: visibleTiles().length,
      fps: fpsMeasured,
      gains: { media: gains.media, master: gains.master },
      runner: RUNNER ? "cloud" : "browser",
      ffmpeg: ffmpegState,
      ffmpegVert: ffmpegVertState,
      vertical: VERTICAL,
      studio: studio.on,
      slate: scene.slate ? scene.slate.kind : null,
      preview: studio.on && scenePreview ? {
        mode: scenePreview.mode,
        spot: scenePreview.spot,
        card: scenePreview.card ? scenePreview.card.kind : null,
        slate: scenePreview.slate ? scenePreview.slate.kind : null,
      } : null,
    };
  }

  function sendState(to) {
    if (!call) return;
    try { call.sendAppMessage({ t: "mfm-engine", state: engineState() }, to); }
    catch (e) { /* transport hiccup — next heartbeat covers it */ }
  }

  function sendStateToOwners() {
    if (!call) return;
    var map = call.participants() || {};
    Object.keys(map).forEach(function (k) {
      if (k !== "local" && map[k].owner) sendState(map[k].session_id);
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatId = setInterval(sendStateToOwners, 3000);
  }

  function stopHeartbeat() {
    if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
  }

  /* ============================================================
     The compositor — layouts, tiles, labels, cards, slate
     ============================================================ */

  function visibleTiles() {
    var out = [];
    Object.keys(people)
      .sort(function (a, b) { return people[a].order - people[b].order; })
      .forEach(function (id) {
        var rec = people[id];
        if (rec.screenEl) {
          out.push({ id: id + ":screen", pid: id, el: rec.screenEl, name: rec.name + " — sharing", isScreen: true, kind: rec.kind });
        }
        if (rec.videoEl) {
          out.push({ id: id, pid: id, el: rec.videoEl, name: rec.name, isScreen: false, kind: rec.kind });
        }
      });
    return out;
  }

  /* Focus order: featured (console) → screenshare → playing video → speaker */
  function pickMain(tiles) {
    var i;
    if (scene.spot) {
      for (i = 0; i < tiles.length; i++) if (tiles[i].pid === scene.spot && !tiles[i].isScreen) return tiles[i];
      for (i = 0; i < tiles.length; i++) if (tiles[i].pid === scene.spot) return tiles[i];
    }
    for (i = 0; i < tiles.length; i++) if (tiles[i].isScreen) return tiles[i];
    for (i = 0; i < tiles.length; i++) if (tiles[i].kind === "media") return tiles[i];
    if (activeSpeaker) {
      for (i = 0; i < tiles.length; i++) if (tiles[i].pid === activeSpeaker && !tiles[i].isScreen) return tiles[i];
    }
    return tiles[0];
  }

  var curCardBox = null; // this frame's card rect — labels yield to it

  function draw(dt) {
    ctx.fillStyle = C.navyDeep;
    ctx.fillRect(0, 0, W, H);

    stepCard(dt);
    curCardBox = cardDraw.card && cardDraw.alpha > 0.05 ? layoutCard(cardDraw.card) : null;

    if (scene.slate) {
      drawSlate(scene.slate);
      return; // a slate owns the whole frame — no tiles, no card
    }

    var tiles = visibleTiles();

    if (!tiles.length) {
      drawSlate(null);
    } else if (scene.spot) {
      var spotTile = pickMain(tiles);
      drawTile(spotTile, 0, 0, W, H, { radius: 0, labelTop: true });
    } else if (scene.mode === "dominant") {
      drawDominant(tiles);
    } else if (scene.mode === "split") {
      drawSplit(tiles);
    } else if (scene.mode === "pip") {
      drawPip(tiles);
    } else {
      drawGrid(tiles);
    }

    drawCard(curCardBox);
  }

  /* Render the STAGED scene onto the preview canvas by swapping the module
     render state — same compositor, different target. */
  function renderPreview(dt) {
    if (!studio.on || !scenePreview) return;
    var oc = ctx, os = scene, ocd = cardDraw, ob = curCardBox;
    ctx = previewCtx;
    scene = scenePreview;
    cardDraw = cardDrawPrev;
    draw(dt);
    ctx.font = "700 30px " + SANS;
    ctx.fillStyle = "rgba(212, 168, 83, 0.92)";
    ctx.textBaseline = "top";
    ctx.fillText("PREVIEW", 24, 20);
    ctx = oc; scene = os; cardDraw = ocd; curCardBox = ob;
  }

  /* ---------- Layouts ---------- */
  var PAD = 24, GAP = 12;

  function drawGrid(tiles) {
    var n = Math.min(tiles.length, 12);
    var cols = Math.ceil(Math.sqrt(n));
    var rows = Math.ceil(n / cols);
    var availW = W - PAD * 2 - GAP * (cols - 1);
    var availH = H - PAD * 2 - GAP * (rows - 1);
    var tw = availW / cols;
    var th = availH / rows;

    for (var i = 0; i < n; i++) {
      var r = Math.floor(i / cols);
      var c = i % cols;
      var inRow = r === rows - 1 ? n - (rows - 1) * cols : cols;
      var rowOffset = r === rows - 1 ? (W - PAD * 2 - (inRow * tw + (inRow - 1) * GAP)) / 2 : 0;
      var x = PAD + rowOffset + c * (tw + GAP);
      var y = PAD + r * (th + GAP);
      drawTile(tiles[i], x, y, tw, th, { radius: 10 });
    }
    if (tiles.length > n) drawMoreChip(tiles.length - n);
  }

  function drawDominant(tiles) {
    var main = pickMain(tiles);
    var others = tiles.filter(function (t) { return t.id !== main.id; });
    var stripW = 330;
    var mainW = W - PAD * 2 - (others.length ? stripW + GAP : 0);
    drawTile(main, PAD, PAD, mainW, H - PAD * 2, { radius: 12 });

    var maxStrip = Math.min(others.length, 4);
    var th = (H - PAD * 2 - GAP * (maxStrip - 1)) / Math.max(maxStrip, 1);
    th = Math.min(th, stripW * 9 / 16 + 40);
    for (var i = 0; i < maxStrip; i++) {
      drawTile(others[i], W - PAD - stripW, PAD + i * (th + GAP), stripW, th, { radius: 10 });
    }
    if (others.length > maxStrip) drawMoreChip(others.length - maxStrip);
  }

  function drawSplit(tiles) {
    var main = pickMain(tiles);
    var second = null;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].id !== main.id) { second = tiles[i]; break; }
    }
    var tw = (W - PAD * 2 - GAP) / 2;
    if (!second) {
      drawTile(main, PAD, PAD, W - PAD * 2, H - PAD * 2, { radius: 12 });
      return;
    }
    drawTile(main, PAD, PAD, tw, H - PAD * 2, { radius: 12 });
    drawTile(second, PAD + tw + GAP, PAD, tw, H - PAD * 2, { radius: 12 });
  }

  function drawPip(tiles) {
    var main = pickMain(tiles);
    drawTile(main, 0, 0, W, H, { radius: 0, labelTop: true });
    var second = null;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].id !== main.id) { second = tiles[i]; break; }
    }
    if (second) {
      var pw = 420, ph = 236;
      drawTile(second, W - pw - 32, H - ph - 32, pw, ph, { radius: 12, shadow: true });
    }
  }

  function drawMoreChip(n) {
    var label = "+" + n + " more";
    ctx.font = "700 22px " + SANS;
    var w = ctx.measureText(label).width + 28;
    roundRect(W - PAD - w, PAD, w, 40, 8);
    ctx.fillStyle = "rgba(10, 16, 28, 0.85)";
    ctx.fill();
    ctx.fillStyle = C.goldLight;
    ctx.textBaseline = "middle";
    ctx.fillText(label, W - PAD - w + 14, PAD + 21);
  }

  /* ---------- One tile ---------- */
  function drawTile(t, x, y, w, h, opts) {
    opts = opts || {};
    var radius = opts.radius || 0;

    ctx.save();
    if (opts.shadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 10;
      roundRect(x, y, w, h, radius);
      ctx.fillStyle = C.navy;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    if (radius > 0) {
      roundRect(x, y, w, h, radius);
      ctx.clip();
    }

    var el = t.el;
    var vw = el.videoWidth || el.width || 0;
    var vh = el.videoHeight || el.height || 0;

    if (!vw || !vh) {
      drawPlaceholder(t, x, y, w, h);
    } else if (t.isScreen || t.kind === "media") {
      // Screens and videos letterbox (contain) — never crop slides or films
      ctx.fillStyle = "#0a101c";
      ctx.fillRect(x, y, w, h);
      var scale = Math.min(w / vw, h / vh);
      var dw = vw * scale, dh = vh * scale;
      ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      // Camera tiles cover-crop — cinematic, no bars
      var srcAspect = vw / vh, dstAspect = w / h;
      var sx = 0, sy = 0, sw = vw, sh = vh;
      if (srcAspect > dstAspect) {
        sw = vh * dstAspect;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / dstAspect;
        sy = (vh - sh) / 2;
      }
      ctx.drawImage(el, sx, sy, sw, sh, x, y, w, h);
    }

    drawLabel(t.name, x, y, w, h, opts.labelTop);
    ctx.restore();

    if (radius > 0) {
      roundRect(x, y, w, h, radius);
      ctx.strokeStyle = "rgba(201, 149, 44, 0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawPlaceholder(t, x, y, w, h) {
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, C.panel);
    g.addColorStop(1, C.navy);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    var r = Math.min(w, h) * 0.16;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(201, 149, 44, 0.2)";
    ctx.fill();
    ctx.fillStyle = C.goldLight;
    ctx.font = "650 " + Math.round(r) + "px " + SERIF;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((t.name || "?").charAt(0).toUpperCase(), x + w / 2, y + h / 2 + r * 0.05);
    ctx.textAlign = "left";
  }

  function drawLabel(name, x, y, w, h, top) {
    if (!name || !scene.labels) return; // room shows names; the stream only if toggled
    var fs = Math.max(17, Math.min(24, Math.round(w * 0.033)));
    ctx.font = "600 " + fs + "px " + SANS;
    var padX = Math.round(fs * 0.6);
    var text = name;
    var maxW = w - 24 - padX * 2;
    while (text.length > 2 && ctx.measureText(text).width > maxW) {
      text = text.slice(0, -2);
    }
    if (text !== name) text += "…";
    var tw = ctx.measureText(text).width;
    var bh = Math.round(fs * 1.75);
    var lx = x + 12;
    var ly = top ? y + 24 : y + h - 12 - bh;
    // A visible card owns its corner — labels that would collide step aside.
    if (curCardBox &&
        lx < curCardBox.x + curCardBox.w + 16 &&
        lx + tw + padX * 2 > curCardBox.x - 16 &&
        ly < curCardBox.y + curCardBox.h + 16 &&
        ly + bh > curCardBox.y - 16) {
      return;
    }
    roundRect(lx, ly, tw + padX * 2, bh, 6);
    ctx.fillStyle = "rgba(10, 16, 28, 0.78)";
    ctx.fill();
    ctx.fillStyle = C.cream;
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx + padX, ly + bh / 2 + 1);
  }

  /* ---------- Slate (empty room / pre-service / console slates) ---------- */
  function drawSlate(slate) {
    var g = ctx.createRadialGradient(W * 0.72, -H * 0.1, 100, W * 0.72, -H * 0.1, H * 1.1);
    g.addColorStop(0, "rgba(201, 149, 44, 0.16)");
    g.addColorStop(1, "rgba(201, 149, 44, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var g2 = ctx.createRadialGradient(W * 0.1, H * 1.05, 80, W * 0.1, H * 1.05, H * 0.9);
    g2.addColorStop(0, "rgba(232, 93, 38, 0.1)");
    g2.addColorStop(1, "rgba(232, 93, 38, 0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.gold;
    ctx.font = "800 150px " + SERIF;
    ctx.fillText("MFM", W / 2, H / 2 - 60);
    ctx.fillStyle = C.cream;
    ctx.font = "600 34px " + SANS;
    spacedText("MEGA REGION 2 · USA", W / 2, H / 2 + 20, 10);
    if (slate) {
      ctx.fillStyle = C.goldLight;
      ctx.font = "600 44px " + SANS;
      spacedText(SLATES[slate.kind] || "", W / 2, H / 2 + 126, 8);
      if (slate.line) {
        ctx.fillStyle = C.dim;
        ctx.font = "italic 400 30px " + SERIF;
        ctx.fillText(slate.line, W / 2, H / 2 + 190);
      }
    } else {
      ctx.fillStyle = C.dim;
      ctx.font = "italic 400 30px " + SERIF;
      ctx.fillText("“The mountain burned with fire unto the midst of heaven…” — Deuteronomy 4:11", W / 2, H / 2 + 110);
    }
    ctx.textAlign = "left";
  }

  /* ---------- Portrait (9:16) — simple focused composition ---------- */
  function drawPortrait() {
    if (!portraitCtx) return;
    var o = ctx;
    ctx = portraitCtx;
    try { portraitPaint(); } finally { ctx = o; }
  }

  function portraitPaint() {
    var PW = 1080, PH = 1920;
    ctx.fillStyle = C.navyDeep;
    ctx.fillRect(0, 0, PW, PH);

    if (scene.slate) { portraitSlate(PW, PH, scene.slate); return; }

    var tiles = visibleTiles();
    if (!tiles.length) { portraitSlate(PW, PH, null); return; }

    var main = pickMain(tiles);
    var el = main.el;
    var vw = el.videoWidth || el.width || 0;
    var vh = el.videoHeight || el.height || 0;
    if (vw && vh) {
      var srcAspect = vw / vh, dstAspect = PW / PH;
      var sx = 0, sy = 0, sw = vw, sh = vh;
      if (srcAspect > dstAspect) { sw = vh * dstAspect; sx = (vw - sw) / 2; }
      else { sh = vw / dstAspect; sy = (vh - sh) / 2; }
      ctx.drawImage(el, sx, sy, sw, sh, 0, 0, PW, PH);
    } else {
      drawPlaceholder(main, 0, 0, PW, PH);
    }

    if (main.name && scene.labels) {
      ctx.font = "600 30px " + SANS;
      var tw2 = ctx.measureText(main.name).width;
      roundRect(24, 30, tw2 + 34, 54, 8);
      ctx.fillStyle = "rgba(10, 16, 28, 0.78)";
      ctx.fill();
      ctx.fillStyle = C.cream;
      ctx.textBaseline = "middle";
      ctx.fillText(main.name, 41, 58);
    }

    if (cardDraw.card && cardDraw.alpha > 0.05) {
      portraitCard(PW, PH, cardDraw.card, Math.min(1, cardDraw.alpha));
    }
  }

  function portraitSlate(PW, PH, slate) {
    var g = ctx.createRadialGradient(PW * 0.7, -PH * 0.05, 80, PW * 0.7, -PH * 0.05, PH * 0.8);
    g.addColorStop(0, "rgba(201, 149, 44, 0.16)");
    g.addColorStop(1, "rgba(201, 149, 44, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PW, PH);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.gold;
    ctx.font = "800 130px " + SERIF;
    ctx.fillText("MFM", PW / 2, PH / 2 - 70);
    ctx.fillStyle = C.cream;
    ctx.font = "600 26px " + SANS;
    spacedText("MEGA REGION 2 · USA", PW / 2, PH / 2, 7);
    if (slate) {
      ctx.fillStyle = C.goldLight;
      ctx.font = "600 34px " + SANS;
      spacedText(SLATES[slate.kind] || "", PW / 2, PH / 2 + 96, 5);
    }
    ctx.textAlign = "left";
  }

  function portraitCard(PW, PH, card, alpha) {
    var padX = 26, padY = 22, barW = 6, maxW = 840, subLH = 38;
    ctx.font = CARD.titleFont;
    var titleW = Math.min(ctx.measureText(card.title).width, maxW);
    ctx.font = "400 27px " + SANS;
    var lines = card.subtitle ? wrapCanvasText(card.subtitle, maxW, 6) : [];
    var linesW = 0;
    lines.forEach(function (l) { linesW = Math.max(linesW, ctx.measureText(l).width); });
    var w = barW + padX * 2 + Math.max(titleW, linesW);
    var h = padY * 2 + 48 + (lines.length ? 10 + lines.length * subLH - 8 : 0);
    var x = 48, y = PH - 96 - h;

    ctx.save();
    ctx.globalAlpha = alpha;
    roundRect(x, y, w, h, 10);
    ctx.fillStyle = C.cardBg;
    ctx.fill();
    ctx.save();
    roundRect(x, y, w, h, 10);
    ctx.clip();
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y, barW, h);
    ctx.restore();
    var tx = x + barW + padX, ty = y + padY;
    ctx.textBaseline = "top";
    ctx.fillStyle = card.kind === "prayer" ? C.fireLight : C.cream;
    if (card.kind === "prayer") {
      ctx.font = "700 23px " + SANS;
      spacedTextLeft(card.title.toUpperCase(), tx, ty + 6, 2);
    } else {
      ctx.font = "650 38px " + SERIF;
      ctx.fillText(card.title, tx, ty, maxW);
    }
    ty += 48;
    if (lines.length) {
      ty += 10;
      ctx.font = "400 27px " + SANS;
      ctx.fillStyle = card.kind === "prayer" ? C.cream : C.subText;
      lines.forEach(function (l) { ctx.fillText(l, tx, ty); ty += subLH; });
    }
    ctx.restore();
  }

  function spacedText(text, cx, y, spacing) {
    var total = 0, i;
    for (i = 0; i < text.length; i++) total += ctx.measureText(text[i]).width + spacing;
    total -= spacing;
    var x = cx - total / 2;
    ctx.textAlign = "left";
    for (i = 0; i < text.length; i++) {
      ctx.fillText(text[i], x, y);
      x += ctx.measureText(text[i]).width + spacing;
    }
    ctx.textAlign = "center";
  }

  /* ---------- The card — boxed Royal Flame, real fonts ---------- */
  function stepCard(dt) {
    var want = scene.card;
    var same = want && cardDraw.card &&
      want.kind === cardDraw.card.kind &&
      want.title === cardDraw.card.title &&
      want.subtitle === cardDraw.card.subtitle;

    if (want && !cardDraw.card) {
      cardDraw.card = want;
      cardDraw.alpha = Math.min(1, cardDraw.alpha + dt / FADE);
    } else if (want && !same) {
      cardDraw.alpha -= dt / (FADE * 0.6); // quick out, then swap
      if (cardDraw.alpha <= 0) { cardDraw.card = want; cardDraw.alpha = 0; }
    } else if (want) {
      cardDraw.alpha = Math.min(1, cardDraw.alpha + dt / FADE);
    } else {
      cardDraw.alpha -= dt / FADE;
      if (cardDraw.alpha <= 0) { cardDraw.card = null; cardDraw.alpha = 0; }
    }
  }

  var CARD = {
    padX: 30, padY: 24, barW: 6, gap: 12, maxTextW: 660, subLH: 40,
    titleFont: "650 40px " + SERIF,
    subFont: "400 28px " + SANS,
    kickFont: "700 20px " + SANS,
  };

  /* Measure the card without drawing — labels use the rect to step aside. */
  function layoutCard(card) {
    var kicker = card.kind === "scripture" ? "THE WORD" : "";
    // Prayer titles ("Prayer Point 3 of 12") act as their own kicker.

    ctx.font = CARD.titleFont;
    var titleW = Math.min(ctx.measureText(card.title).width, CARD.maxTextW);
    ctx.font = CARD.subFont;
    var lines = card.subtitle ? wrapCanvasText(card.subtitle, CARD.maxTextW, 5) : [];
    var linesW = 0;
    lines.forEach(function (l) { linesW = Math.max(linesW, ctx.measureText(l).width); });

    var kickH = kicker ? 30 : 0;
    var w = CARD.barW + CARD.padX * 2 + Math.max(titleW, linesW);
    var h = CARD.padY * 2 + kickH + 48 +
      (lines.length ? CARD.gap + lines.length * CARD.subLH - (CARD.subLH - 30) : 0);

    // Position: tl/tc/tr/bl/bc/br — the console moves the card live.
    var pos = /^[tb][lcr]$/.test(scene.cardPos) ? scene.cardPos : "bl";
    var ph = pos.charAt(1);
    var x = ph === "l" ? 64 : ph === "r" ? W - 64 - w : (W - w) / 2;
    var y = pos.charAt(0) === "t" ? 64 : H - 64 - h;

    return { x: x, y: y, w: w, h: h, kicker: kicker, kickH: kickH, lines: lines };
  }

  function drawCard(box) {
    var card = cardDraw.card;
    if (!card || cardDraw.alpha <= 0 || !box) return;

    var a = Math.min(1, cardDraw.alpha);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 14); // gentle rise

    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 12;
    roundRect(box.x, box.y, box.w, box.h, 10);
    ctx.fillStyle = C.cardBg;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Gold bar (clipped to the card's rounded corners)
    ctx.save();
    roundRect(box.x, box.y, box.w, box.h, 10);
    ctx.clip();
    ctx.fillStyle = C.gold;
    ctx.fillRect(box.x, box.y, CARD.barW, box.h);
    ctx.restore();

    var tx = box.x + CARD.barW + CARD.padX;
    var ty = box.y + CARD.padY;

    if (box.kicker) {
      ctx.font = CARD.kickFont;
      ctx.fillStyle = C.goldLight;
      ctx.textBaseline = "top";
      spacedTextLeft(box.kicker, tx, ty, 3);
      ty += box.kickH;
    }

    ctx.font = CARD.titleFont;
    ctx.fillStyle = card.kind === "prayer" ? C.fireLight : C.cream;
    ctx.textBaseline = "top";
    if (card.kind === "prayer") {
      ctx.font = "700 24px " + SANS;
      spacedTextLeft(card.title.toUpperCase(), tx, ty + 6, 2);
    } else {
      ctx.fillText(card.title, tx, ty, CARD.maxTextW);
    }
    ty += 48;

    if (box.lines.length) {
      ty += CARD.gap;
      ctx.font = CARD.subFont;
      ctx.fillStyle = card.kind === "prayer" ? C.cream : C.subText;
      box.lines.forEach(function (l) {
        ctx.fillText(l, tx, ty);
        ty += CARD.subLH;
      });
    }

    ctx.restore();
  }

  function spacedTextLeft(text, x, y, spacing) {
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cx, y);
      cx += ctx.measureText(text[i]).width + spacing;
    }
  }

  function wrapCanvasText(str, maxW, maxLines) {
    var words = String(str).split(/\s+/);
    var lines = [];
    var cur = "";
    for (var i = 0; i < words.length; i++) {
      var probe = cur ? cur + " " + words[i] : words[i];
      if (ctx.measureText(probe).width > maxW && cur) {
        lines.push(cur);
        cur = words[i];
        if (lines.length === maxLines - 1) {
          var rest = words.slice(i + 1).join(" ");
          if (rest) cur = cur + " " + rest;
          break;
        }
      } else {
        cur = probe;
      }
    }
    if (cur) {
      while (ctx.measureText(cur).width > maxW && cur.length > 1) {
        cur = cur.replace(/\s*\S*$/, "") || cur.slice(0, -4);
        if (!/…$/.test(cur)) cur += "…";
      }
      lines.push(cur);
    }
    return lines;
  }

  function roundRect(x, y, w, h, r) {
    roundRectPath(x, y, w, h, r);
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ============================================================
     The loop — setInterval, NOT requestAnimationFrame.
     rAF stops in background tabs; interval timers keep firing on
     pages with an active WebRTC connection. Keep the tab visible
     in its own window anyway for the smoothest output.
     ============================================================ */
  var loopId = null;
  var lastTick = 0;
  var frames = 0;
  var fpsWindow = 0;
  var speakerTick = 0;
  var frameFlip = false; // preview & portrait render at half rate, alternating

  function startLoop() {
    stopLoop();
    lastTick = performance.now();
    loopId = setInterval(tick, 1000 / FPS);
  }

  function stopLoop() {
    if (loopId) { clearInterval(loopId); loopId = null; }
  }

  function tick() {
    var now = performance.now();
    var dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;

    // Liveness beacon for the cloud watchdog: a counter that must keep
    // moving, plus whether we're actually in the room.
    window.__MFM = {
      alive: (window.__MFM ? window.__MFM.alive : 0) + 1,
      joined: joined || DEMO,
    };

    if (DEMO) stepDemo(dt);

    speakerTick += dt;
    if (!DEMO && AG.ctx && speakerTick > 0.25) {
      speakerTick = 0;
      stepSpeaker();
    }

    draw(dt);

    // TAKE crossfade: the old program's last frame melts away over the new one
    if (takeFx.t > 0 && takeFx.snap) {
      ctx.globalAlpha = Math.max(0, takeFx.t / takeFx.dur);
      ctx.drawImage(takeFx.snap, 0, 0);
      ctx.globalAlpha = 1;
      takeFx.t -= dt;
    }

    frameFlip = !frameFlip;
    if (frameFlip) renderPreview(dt * 2);
    else if (VERTICAL) drawPortrait();

    frames++;
    fpsWindow += dt;
    if (fpsWindow >= 1) {
      fpsMeasured = Math.round(frames / fpsWindow);
      frames = 0;
      fpsWindow = 0;
      updateStatus();
    }
  }

  function updateStatus() {
    if (els.fpsLabel) els.fpsLabel.textContent = fpsMeasured + " fps";
    if (els.stLayout) {
      els.stLayout.textContent = "Layout: " + (scene.spot ? "featured" : scene.mode);
    }
    if (els.stCard) {
      els.stCard.textContent = "Card: " + (scene.card ? scene.card.kind : "none");
    }
    if (els.stAudio) {
      var n = Object.keys(AG.sources).length;
      var level = "";
      if (AG.analyser) {
        var buf = new Uint8Array(AG.analyser.frequencyBinCount);
        AG.analyser.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) {
          var d = (buf[i] - 128) / 128;
          sum += d * d;
        }
        var rms = Math.sqrt(sum / buf.length);
        var bars = Math.min(5, Math.round(rms * 40));
        level = " · " + "▮▮▮▮▮".slice(0, bars) + "▯▯▯▯▯".slice(0, 5 - bars);
      }
      els.stAudio.textContent = "Audio: " + n + " source" + (n === 1 ? "" : "s") + level;
    }
  }

  /* ---------- Hardening ---------- */
  var wakeLock = null;

  function acquireWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request("screen")
      .then(function (wl) { wakeLock = wl; })
      .catch(function () { /* non-fatal */ });
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (e) { /* fine */ }
      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && (joined || DEMO)) acquireWakeLock();
  });

  window.addEventListener("beforeunload", function (e) {
    if (joined) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ============================================================
     Demo mode — fake tiles, no Daily. For design checks and
     screenshots: ?demo=1&mode=dominant&card=scripture&n=6&spot=1
     ============================================================ */
  var demoT = 0;
  var DEMO_NAMES = [
    "Pastor Olumide Oni", "Minister Grace A.", "Bro. Emmanuel O.",
    "Sis. Ruth Adeyemi", "Pastor David K.", "Minister Joy N.",
    "Bro. Samuel T.", "Sis. Esther M.", "Deacon Peter O.",
  ];

  function initDemo() {
    var nRaw = parseInt(qs.get("n") || "6", 10);
    var n = isNaN(nRaw) ? 6 : Math.max(0, Math.min(9, nRaw)); // n=0 → slate
    for (var i = 0; i < n; i++) {
      var cv = document.createElement("canvas");
      cv.width = 640;
      cv.height = 360;
      people["demo-" + i] = {
        order: i, name: DEMO_NAMES[i % DEMO_NAMES.length],
        kind: "person", videoEl: cv, videoTrackId: null, screenEl: null, screenTrackId: null,
        hue: (i * 47) % 360,
      };
    }
    var mode = qs.get("mode");
    if (MODES[mode]) scene.mode = mode;
    if (/^[tb][lcr]$/.test(qs.get("pos") || "")) scene.cardPos = qs.get("pos");
    if (SLATES[qs.get("slate")]) scene.slate = { kind: qs.get("slate"), line: qs.get("line") || "" };
    if (qs.get("labels") === "1") scene.labels = true;
    if (qs.get("spot") === "1") scene.spot = "demo-0";
    var cardArg = qs.get("card");
    if (cardArg === "l3") {
      scene.card = { kind: "l3", title: "Pastor Olumide Oni", subtitle: "Principal Regional Overseer" };
    } else if (cardArg === "prayer") {
      scene.card = { kind: "prayer", title: "Prayer Point 3 of 12", subtitle: "Every power assigned against my breakthrough, scatter, in the name of Jesus." };
    } else if (cardArg === "scripture") {
      scene.card = { kind: "scripture", title: "Jeremiah 23:29 · KJV", subtitle: "Is not my word like as a fire? saith the LORD; and like a hammer that breaketh the rock in pieces?" };
    }
    updateBarCount();
    enterStage();
    setNote("Demo mode — fake tiles, no room. Remove ?demo=1 to run for real.");
  }

  function stepDemo(dt) {
    demoT += dt;
    var ids = Object.keys(people);
    ids.forEach(function (id, i) {
      var rec = people[id];
      var cv = rec.videoEl;
      var c2 = cv.getContext("2d");
      var t = demoT + i * 1.7;
      var g = c2.createLinearGradient(0, 0, 640, 360);
      g.addColorStop(0, "hsl(" + (215 + Math.sin(t * 0.4) * 8) + ", 45%, " + (16 + i * 2) + "%)");
      g.addColorStop(1, "hsl(" + (222 + Math.cos(t * 0.3) * 8) + ", 50%, " + (10 + i) + "%)");
      c2.fillStyle = g;
      c2.fillRect(0, 0, 640, 360);
      c2.beginPath();
      c2.arc(320 + Math.sin(t * 0.9) * 60, 150 + Math.cos(t * 0.7) * 24, 78, 0, Math.PI * 2);
      c2.fillStyle = "rgba(201, 149, 44, 0.28)";
      c2.fill();
      c2.fillStyle = "#f0e6d0";
      c2.font = "650 90px Fraunces, Georgia, serif";
      c2.textAlign = "center";
      c2.textBaseline = "middle";
      c2.fillText(rec.name.charAt(0), 320 + Math.sin(t * 0.9) * 60, 156 + Math.cos(t * 0.7) * 24);
      c2.textAlign = "left";
    });
    // Rotate the "speaker" so dominant/pip layouts move
    activeSpeaker = ids[Math.floor(demoT / 4) % ids.length];
  }

  /* ---------- Boot ---------- */
  if (DEMO) {
    loadFonts().then(initDemo);
  } else if (qs.get("autostart") === "1" && qs.get("key")) {
    // Headless/cloud runner path (E2): program.html?room=…&key=…&autostart=1
    start();
  }
})();
