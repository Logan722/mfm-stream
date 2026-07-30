/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Host console: Prebuilt video + production deck + people board
   ------------------------------------------------------------
   WYSIWYG rule: the card shown over the host's video is exactly
   what the broadcast composition shows — same content, same
   corner. Tagged LIVE when broadcasting, OFF AIR when not.

   Broadcast (since E1, July 2026):
     - Engine online → the stream locks to PROGRAM (program.html's
       canvas) with the single-participant preset, set once and
       never updated mid-stream. All switching happens in-canvas,
       driven from here by app-messages.
     - Engine offline → legacy Daily VCS composition as a fallback
       (cards/mid-stream changes unreliable on the new pipeline).
     - vert 9:16 (Instagram): Daily portrait preset; parked while
       the engine runs (double audio) until the E3 portrait canvas.
   ============================================================ */

(function () {
  "use strict";

  var qs = new URLSearchParams(window.location.search);

  var els = {
    form: document.getElementById("join-form"),
    name: document.getElementById("name"),
    hostKey: document.getElementById("host-key"),
    room: document.getElementById("room"),
    roomLabel: document.getElementById("room-label"),
    joinBtn: document.getElementById("join-btn"),
    error: document.getElementById("error"),
    stageWrap: document.getElementById("stage-wrap"),
    stage: document.getElementById("stage"),
    barRoom: document.getElementById("bar-room"),
    barCount: document.getElementById("bar-count"),
    copyLinkBtn: document.getElementById("copy-link"),
    deckToggle: document.getElementById("deck-toggle"),
    boardToggle: document.getElementById("board-toggle"),
    board: document.getElementById("board"),
    plist: document.getElementById("plist"),
    muteAllBtn: document.getElementById("mute-all"),
    boardNote: document.getElementById("board-note"),
    // Live chips
    liveChip: document.getElementById("live-chip"),
    liveTimer: document.getElementById("live-timer"),
    vertChip: document.getElementById("vert-chip"),
    vertTimer: document.getElementById("vert-timer"),
    // WYSIWYG card on video
    frameGuide: document.getElementById("frame-guide"),
    liveCard: document.getElementById("live-card"),
    pvTag: document.getElementById("pv-tag"),
    lcTitle: document.getElementById("lc-title"),
    lcSub: document.getElementById("lc-sub"),
    // Broadcast panel
    goLiveBtn: document.getElementById("go-live"),
    bcError: document.getElementById("bc-error"),
    modes: document.getElementById("bc-modes"),
    ytOn: document.getElementById("yt-on"),
    ytKey: document.getElementById("yt-key"),
    yt2On: document.getElementById("yt2-on"),
    yt2Key: document.getElementById("yt2-key"),
    fbOn: document.getElementById("fb-on"),
    fbKey: document.getElementById("fb-key"),
    customOn: document.getElementById("custom-on"),
    customUrl: document.getElementById("custom-url"),
    igKey: document.getElementById("ig-key"),
    goVertBtn: document.getElementById("go-vert"),
    vertStatus: document.getElementById("vert-status"),
    // Overlay panels
    l3Name: document.getElementById("l3-name"),
    l3Role: document.getElementById("l3-role"),
    l3Show: document.getElementById("l3-show"),
    l3Hide: document.getElementById("l3-hide"),
    ppList: document.getElementById("pp-list"),
    ppPrev: document.getElementById("pp-prev"),
    ppPush: document.getElementById("pp-push"),
    ppNext: document.getElementById("pp-next"),
    ppHide: document.getElementById("pp-hide"),
    mdUrl: document.getElementById("md-url"),
    mdPlay: document.getElementById("md-play"),
    mdChoose: document.getElementById("md-choose"),
    mdFile: document.getElementById("md-file"),
    mdVol: document.getElementById("md-vol"),
    mdPause: document.getElementById("md-pause"),
    mdStop: document.getElementById("md-stop"),
    mdStatus: document.getElementById("md-status"),
    cardPosRow: document.getElementById("card-pos"),
    scBrand: document.getElementById("sc-brand"),
    scInput: document.getElementById("sc-input"),
    scGo: document.getElementById("sc-go"),
    scHide: document.getElementById("sc-hide"),
    scStatus: document.getElementById("sc-status"),
    // Engine panel
    engDot: document.getElementById("eng-dot"),
    engStatus: document.getElementById("eng-status"),
    engOpen: document.getElementById("eng-open"),
    engAlert: document.getElementById("eng-alert"),
  };

  var callFrame = null;
  var joinedRoom = "sanctuary";
  var renderQueued = false;
  var confirmingEject = {}; // session_id -> timeout handle

  /* ---------- Program Engine (program.html) ---------- */
  // The engine joins as PROGRAM with this fixed user_id. When it's online,
  // Go Live locks the stream to it (single-participant preset — set once,
  // never updated mid-stream) and every scene change travels by app-message.
  // Offline → legacy Daily composition as a fallback (Dawn, July 2026).
  var ENGINE_UID = "mfm-program-engine";
  var eng = {
    lastState: null,   // last { mode, spot, card, live, tiles, fps } heartbeat
    lastSeen: 0,       // Date.now() of that heartbeat
    alert: "",         // sticky red message (engine dropped mid-broadcast)
  };

  /* ---------- Scene: what the 16:9 broadcast shows ---------- */
  var scene = {
    card: null,       // null | { kind, title, subtitle }
    cardPos: "bl",    // tl | tc | tr | bl | bc | br — applies to every card
    mode: "grid",     // grid | dominant | split | pip
    spot: null,       // null | session_id featured full-screen
  };
  var ppIdx = 0;

  /* ---------- Stream instances ----------
     Main 16:9 = Daily's default instance (no explicit id).
     Vertical 9:16 = a second instance with a fixed UUID. */
  var VERT_ID = "b2b2b2b2-2222-4b22-8b22-b2b2b2b2b2b2";

  var bc = { live: false, starting: false, startedAt: 0, timerId: null, confirmingEnd: null,
             engineLocked: null }; // session_id the live stream is locked to (engine mode)
  var vt = { live: false, starting: false, startedAt: 0, timerId: null, confirmingEnd: null };

  /* Every scene edit is instant: persist, hand it to the engine (or the
     legacy stream if the engine is offline), mirror on the video. */
  function applyScene() {
    persistState();
    if (engineOnline()) sendEngineScene(); // keep the canvas current (even warm, off-stream)
    if (bc.live && !bc.engineLocked) pushLayout(); // fallback stream still gets pushes
    renderScene();
  }

  /* ---------- Room name ---------- */
  function cleanRoom(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  var initialRoom = cleanRoom(qs.get("room")) || "sanctuary";
  if (els.room) els.room.value = initialRoom;
  if (els.roomLabel) els.roomLabel.textContent = initialRoom;

  function currentRoom() {
    var v = els.room ? cleanRoom(els.room.value) : initialRoom;
    return v || "sanctuary";
  }

  /* ---------- Persistence (this device only) ---------- */
  var idStoreKey = "mfm-stream-host";
  var bcStoreKey = "mfm-stream-broadcast";
  var ovStoreKey = "mfm-stream-overlays";

  try {
    var savedId = JSON.parse(localStorage.getItem(idStoreKey) || "{}");
    if (savedId.name && els.name && !els.name.value) els.name.value = savedId.name;
    if (savedId.hostKey && els.hostKey) els.hostKey.value = savedId.hostKey;
  } catch (e) { /* storage unavailable — fine */ }

  try {
    var savedBc = JSON.parse(localStorage.getItem(bcStoreKey) || "{}");
    if (els.ytOn && "ytOn" in savedBc) els.ytOn.checked = !!savedBc.ytOn;
    if (els.ytKey && savedBc.ytKey) els.ytKey.value = savedBc.ytKey;
    if (els.yt2On && "yt2On" in savedBc) els.yt2On.checked = !!savedBc.yt2On;
    if (els.yt2Key && savedBc.yt2Key) els.yt2Key.value = savedBc.yt2Key;
    if (els.fbOn && "fbOn" in savedBc) els.fbOn.checked = !!savedBc.fbOn;
    if (els.fbKey && savedBc.fbKey) els.fbKey.value = savedBc.fbKey;
    if (els.customOn && "customOn" in savedBc) els.customOn.checked = !!savedBc.customOn;
    if (els.customUrl && savedBc.customUrl) els.customUrl.value = savedBc.customUrl;
    if (els.igKey && savedBc.igKey) els.igKey.value = savedBc.igKey;
    if (els.mdUrl && savedBc.mdUrl) els.mdUrl.value = savedBc.mdUrl;
    if (savedBc.mode) scene.mode = savedBc.mode;
  } catch (e) { /* fine */ }

  try {
    var savedOv = JSON.parse(localStorage.getItem(ovStoreKey) || "{}");
    if (els.l3Name && savedOv.l3name) els.l3Name.value = savedOv.l3name;
    if (els.l3Role && savedOv.l3role) els.l3Role.value = savedOv.l3role;
    if (els.ppList && savedOv.points) els.ppList.value = savedOv.points;
    if (typeof savedOv.ppIdx === "number") ppIdx = savedOv.ppIdx;
    if (/^[tb][lcr]$/.test(savedOv.cardPos || "")) scene.cardPos = savedOv.cardPos;
  } catch (e) { /* fine */ }

  function rememberIdentity() {
    try {
      localStorage.setItem(idStoreKey, JSON.stringify({
        name: els.name.value.trim(),
        hostKey: els.hostKey ? els.hostKey.value : "",
      }));
    } catch (e) { /* fine */ }
  }

  function persistState() {
    try {
      localStorage.setItem(bcStoreKey, JSON.stringify({
        ytOn: els.ytOn ? els.ytOn.checked : true,
        ytKey: els.ytKey ? els.ytKey.value : "",
        yt2On: els.yt2On ? els.yt2On.checked : false,
        yt2Key: els.yt2Key ? els.yt2Key.value : "",
        fbOn: els.fbOn ? els.fbOn.checked : false,
        fbKey: els.fbKey ? els.fbKey.value : "",
        customOn: els.customOn ? els.customOn.checked : false,
        customUrl: els.customUrl ? els.customUrl.value : "",
        igKey: els.igKey ? els.igKey.value : "",
        mdUrl: els.mdUrl ? els.mdUrl.value : "",
        mode: scene.mode,
      }));
      localStorage.setItem(ovStoreKey, JSON.stringify({
        l3name: els.l3Name ? els.l3Name.value : "",
        l3role: els.l3Role ? els.l3Role.value : "",
        points: els.ppList ? els.ppList.value : "",
        ppIdx: ppIdx,
        cardPos: scene.cardPos,
      }));
    } catch (e) { /* fine */ }
  }

  ["ytOn", "ytKey", "yt2On", "yt2Key", "fbOn", "fbKey", "customOn", "customUrl", "igKey", "mdUrl", "l3Name", "l3Role", "ppList"]
    .forEach(function (k) {
      if (els[k]) els[k].addEventListener("change", persistState);
    });

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
    els.joinBtn.textContent = busy ? "Preparing the room…" : "Enter as Host";
  }

  /* ---------- Join flow ---------- */
  if (els.form) {
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      join();
    });
  }

  function join() {
    showError("");
    var name = els.name.value.trim().slice(0, 40);
    if (!name) { showError("Please enter your name."); return; }
    var hostKey = els.hostKey ? els.hostKey.value : "";
    if (!hostKey) { showError("Please enter the host key."); return; }

    setBusy(true);

    fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "host", name: name, room: currentRoom(), hostKey: hostKey }),
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
        rememberIdentity();
        startCall(result.data);
      })
      .catch(function () {
        showError(
          "Could not reach the token service. Make sure you opened the live site " +
          "(the Netlify link), not a local copy of this file."
        );
        setBusy(false);
      });
  }

  /* ---------- Daily Prebuilt + events ---------- */
  function startCall(grant) {
    var Factory = window.DailyIframe || window.Daily;
    if (!Factory) {
      showError("The video library failed to load. Please refresh and try again.");
      setBusy(false);
      return;
    }

    joinedRoom = grant.room;
    document.body.classList.add("in-call");
    if (els.stageWrap) els.stageWrap.hidden = false;
    if (els.barRoom) els.barRoom.textContent = joinedRoom;

    callFrame = Factory.createFrame(els.stage, {
      url: grant.url,
      token: grant.token,
      showLeaveButton: true,
      showFullscreenButton: true,
      // Quality pass (July 2026): the host is on camera too — capture at 720p.
      dailyConfig: {
        userMediaVideoConstraints: { width: { ideal: 1280 }, height: { ideal: 720 } },
      },
      iframeStyle: {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0",
      },
      theme: {
        colors: {
          accent: "#c9952c",
          accentText: "#142240",
          background: "#0f1a30",
          backgroundAccent: "#1a2d4d",
          baseText: "#f0e6d0",
          border: "#233a63",
          mainAreaBg: "#0f1a30",
          mainAreaBgAccent: "#1a2d4d",
          mainAreaText: "#f0e6d0",
          supportiveText: "#8899b8",
        },
      },
    });

    callFrame
      .on("joined-meeting", function () {
        acquireWakeLock();
        // Belt & braces: never hear the engine's mix (its mic IS the room —
        // hearing it would be an echo of everyone, including yourself).
        try {
          var recv = { base: true, byUserId: {} };
          recv.byUserId[ENGINE_UID] = { video: true, screenVideo: true, audio: false, screenAudio: false };
          callFrame.updateParticipant("local", { updatePermissions: { canReceive: recv } });
        } catch (e) { /* token-side rules still apply */ }
        pingEngine();
        queueRender();
      })
      .on("participant-joined", function (ev) {
        if (isEngine(ev && ev.participant)) {
          eng.alert = "";
          sendEngineScene(); // a fresh engine picks up the current scene
          if (bc.live && bc.engineLocked &&
              ev.participant.session_id !== bc.engineLocked) {
            eng.alert = "The engine is back, but the live stream is still locked to its old identity — End broadcast, then Go Live again to re-lock.";
          }
          updateEnginePanel();
        }
        queueRender();
      })
      .on("participant-updated", queueRender)
      .on("participant-left", function (ev) {
        var id = ev && ev.participant && ev.participant.session_id;
        if (id && scene.spot === id) {
          scene.spot = null;
          applyScene();
        }
        if (isEngine(ev && ev.participant)) {
          eng.lastState = null;
          if (bc.live && bc.engineLocked === id) {
            eng.alert = "ENGINE DISCONNECTED while live — viewers see a frozen frame. Reopen the engine page; when it's back, End broadcast and Go Live again to re-lock.";
            panelError("Engine disconnected while live — see the Engine panel.");
          }
          updateEnginePanel();
        }
        queueRender();
      })
      .on("app-message", function (ev) {
        var d = ev && ev.data;
        if (d && d.t === "mfm-engine" && d.state) {
          eng.lastState = d.state;
          eng.lastSeen = Date.now();
          updateEnginePanel();
        }
      })
      .on("live-streaming-started", function (ev) {
        if (isVert(ev)) vertStarted(); else onLiveStarted();
      })
      .on("live-streaming-stopped", function (ev) {
        if (isVert(ev)) vertStopped(); else onLiveStopped();
      })
      .on("live-streaming-error", function (ev) {
        var msg = (ev && ev.errorMsg) || "unknown";
        if (isVert(ev)) {
          vt.starting = false;
          vertStopped();
          vertNote("9:16 error: " + msg +
            (/instance|limit|maximum/i.test(msg)
              ? " — the domain likely allows only one stream at a time; ask Daily support to raise it."
              : " — check the Instagram key (they expire per session)."));
        } else {
          bc.starting = false;
          panelError("Broadcast error: " + msg + " — check your stream key and try again.");
          onLiveStopped();
        }
      })
      .on("nonfatal-error", function (ev) {
        // Surface warnings Daily raises without killing the call (e.g. a
        // rejected layout) — with everything Daily sends, not just a type.
        var detail = "";
        try {
          detail = JSON.stringify({
            type: ev && ev.type,
            msg: (ev && ev.errorMsg) || undefined,
            details: (ev && ev.details) || undefined,
          }).slice(0, 280);
        } catch (e) { detail = String(ev && ev.type); }
        var text = (ev && (ev.type + " " + (ev.errorMsg || ""))) || "";
        if (/media-player/i.test(text)) {
          mdNote("Media: " + detail);
        } else if (/stream|layout|composition/i.test(text)) {
          panelError("Daily warning: " + detail);
        }
      })
      .on("remote-media-player-started", function (ev) {
        md.sessionId = ev && ev.session_id;
        md.paused = false;
        mdNote("Playing — visible to the room and the stream.");
        mdButtons();
      })
      .on("remote-media-player-updated", function (ev) {
        var st = ev && ev.remoteMediaPlayerState && ev.remoteMediaPlayerState.state;
        if (st === "paused") { md.paused = true; mdNote("Paused."); }
        else if (st === "playing") { md.paused = false; mdNote("Playing."); }
        mdButtons();
      })
      .on("remote-media-player-stopped", function (ev) {
        md.sessionId = null;
        md.paused = false;
        var why = ev && ev.reason ? " (" + ev.reason + ")" : "";
        if (!mf.active) mdNote("Stopped" + why + ".");
        mdButtons();
      })
      .on("left-meeting", endCall)
      .on("error", function (ev) {
        showError("Call error: " + ((ev && ev.errorMsg) || "unknown. Please rejoin."));
        endCall();
      });

    callFrame.join()
      .then(function () {
        try {
          callFrame.updateSendSettings({ video: "quality-optimized" })
            .catch(function () { /* defaults are fine */ });
        } catch (e) { /* fine */ }
      })
      .catch(function () {
        showError("Could not join the room. Please try again.");
        endCall();
      });

    renderScene();
  }

  function isVert(ev) {
    return !!(ev && ev.instanceId === VERT_ID);
  }

  function endCall() {
    onLiveStopped();
    vertStopped();
    stopFilePlayback(true);
    eng.lastState = null;
    eng.alert = "";
    releaseWakeLock();
    if (callFrame) {
      try { callFrame.destroy(); } catch (e) { /* already gone */ }
      callFrame = null;
    }
    document.body.classList.remove("in-call");
    if (els.stageWrap) els.stageWrap.hidden = true;
    if (els.plist) els.plist.innerHTML = "";
    setBusy(false);
  }

  /* ---------- Participant board ---------- */
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(function () {
      renderQueued = false;
      renderBoard();
    }, 150);
  }

  function allParticipants() {
    if (!callFrame) return [];
    var map = callFrame.participants() || {};
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ---------- Engine helpers ---------- */
  function isEngine(p) {
    return !!p && !p.local &&
      (p.user_id === ENGINE_UID || p.user_name === "PROGRAM");
  }

  function engineParticipant() {
    var people = allParticipants();
    for (var i = 0; i < people.length; i++) {
      if (isEngine(people[i])) return people[i];
    }
    return null;
  }

  function engineOnline() {
    return !!engineParticipant();
  }

  function sendEngineScene() {
    var p = engineParticipant();
    if (!p || !callFrame) return;
    try {
      callFrame.sendAppMessage({
        t: "mfm-cmd",
        cmd: "scene",
        scene: { mode: scene.mode, spot: scene.spot, card: scene.card, cardPos: scene.cardPos },
      }, p.session_id);
    } catch (e) { /* heartbeat mismatch will show in the panel */ }
  }

  function pingEngine() {
    var p = engineParticipant();
    if (!p || !callFrame) return;
    try {
      callFrame.sendAppMessage({ t: "mfm-cmd", cmd: "ping" }, p.session_id);
    } catch (e) { /* fine */ }
    sendEngineScene();
  }

  function updateEnginePanel() {
    if (!els.engDot || !els.engStatus) return;
    var p = engineParticipant();
    var locked = bc.live && bc.engineLocked;
    els.engDot.className = "eng-dot" + (locked && p ? " locked" : p ? " on" : "");
    if (!p) {
      els.engStatus.textContent = "Engine offline — Go Live would use the Daily fallback";
    } else if (locked) {
      els.engStatus.textContent = "LIVE — stream locked to PROGRAM";
    } else {
      var st = eng.lastState;
      var stale = Date.now() - eng.lastSeen > 10000;
      els.engStatus.textContent = st && !stale
        ? "Engine online · " + (st.spot ? "featured" : st.mode) + " · " + st.tiles + " tile" + (st.tiles === 1 ? "" : "s") + " · " + st.fps + " fps"
        : "Engine online";
    }
    if (els.engAlert) {
      if (eng.alert) {
        els.engAlert.hidden = false;
        els.engAlert.textContent = eng.alert;
      } else {
        els.engAlert.hidden = true;
        els.engAlert.textContent = "";
      }
    }
  }

  function isCohost(p) {
    var ca = p && p.permissions && p.permissions.canAdmin;
    if (!ca) return false;
    if (ca === true) return true;
    if (Array.isArray(ca)) return ca.length > 0;
    if (typeof ca.size === "number") return ca.size > 0; // Set
    return !!ca;
  }

  function displayName(p) {
    return (p.user_name || "Guest").slice(0, 40);
  }

  function renderBoard() {
    if (!els.plist || !callFrame) return;

    updateEnginePanel();

    // The engine isn't a person — it lives in the Engine panel, not People.
    var people = allParticipants().filter(function (p) { return !isEngine(p); });

    people.sort(function (a, b) {
      if (a.local !== b.local) return a.local ? -1 : 1;
      if (!!a.owner !== !!b.owner) return a.owner ? -1 : 1;
      var ac = isCohost(a), bc2 = isCohost(b);
      if (ac !== bc2) return ac ? -1 : 1;
      return displayName(a).localeCompare(displayName(b));
    });

    if (els.barCount) {
      els.barCount.textContent = people.length + " in room";
    }

    els.plist.innerHTML = "";

    people.forEach(function (p) {
      var li = document.createElement("li");
      li.className = "p-row";

      var top = document.createElement("div");
      top.className = "p-top";

      var nm = document.createElement("span");
      nm.className = "p-name";
      nm.textContent = displayName(p);
      top.appendChild(nm);

      if (p.local) top.appendChild(badge("You", "you"));
      else if (p.owner) top.appendChild(badge("Host", "host"));
      else if (isCohost(p)) top.appendChild(badge("Co-host", "cohost"));

      var state = document.createElement("span");
      state.className = "p-state";
      state.appendChild(chip("MIC", !!p.audio));
      state.appendChild(chip("CAM", !!p.video));
      top.appendChild(state);

      li.appendChild(top);

      var row = document.createElement("div");
      row.className = "p-actions";

      // Feature on stream (instant)
      var featured = scene.spot === p.session_id;
      var feat = actionBtn(
        featured ? "★ Featured" : "Feature",
        false,
        function () {
          scene.spot = featured ? null : p.session_id;
          applyScene();
          queueRender();
        }
      );
      feat.classList.add("feature");
      if (featured) feat.classList.add("active");
      row.appendChild(feat);

      // Moderation (not yourself; not other owner-token hosts)
      if (!p.local && !p.owner) {
        row.appendChild(actionBtn(
          p.audio ? "Mute" : "Muted",
          !p.audio,
          function () { callFrame.updateParticipant(p.session_id, { setAudio: false }); }
        ));

        row.appendChild(actionBtn(
          p.video ? "Cam off" : "Cam is off",
          !p.video,
          function () { callFrame.updateParticipant(p.session_id, { setVideo: false }); }
        ));

        var cohost = isCohost(p);
        row.appendChild(actionBtn(
          cohost ? "Demote" : "Make co-host",
          false,
          function () {
            // Co-hosts also get to SEE the PROGRAM feed (still never hear it);
            // demoting hides it again (participants joined with it blocked).
            var recv = { base: true, byUserId: {} };
            recv.byUserId[ENGINE_UID] = cohost
              ? false
              : { video: true, screenVideo: true, audio: false, screenAudio: false };
            callFrame.updateParticipant(p.session_id, {
              updatePermissions: {
                canAdmin: cohost ? false : ["participants"],
                canReceive: recv,
              },
            });
          }
        ));

        var eject = actionBtn(
          confirmingEject[p.session_id] ? "Confirm remove?" : "Remove",
          false,
          function () {
            if (confirmingEject[p.session_id]) {
              clearTimeout(confirmingEject[p.session_id]);
              delete confirmingEject[p.session_id];
              callFrame.updateParticipant(p.session_id, { eject: true });
            } else {
              confirmingEject[p.session_id] = setTimeout(function () {
                delete confirmingEject[p.session_id];
                queueRender();
              }, 4000);
              queueRender();
            }
          }
        );
        eject.classList.add("danger");
        if (confirmingEject[p.session_id]) eject.classList.add("confirming");
        row.appendChild(eject);
      }

      li.appendChild(row);
      els.plist.appendChild(li);
    });
  }

  function badge(text, kind) {
    var b = document.createElement("span");
    b.className = "p-badge " + kind;
    b.textContent = text;
    return b;
  }

  function chip(label, on) {
    var c = document.createElement("span");
    c.className = "p-chip " + (on ? "on" : "off");
    c.textContent = label;
    c.title = label === "MIC" ? (on ? "Microphone on" : "Microphone off")
                              : (on ? "Camera on" : "Camera off");
    return c;
  }

  function actionBtn(text, disabled, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "p-btn";
    b.textContent = text;
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- Mute all (spares you, hosts, co-hosts) ---------- */
  if (els.muteAllBtn) {
    els.muteAllBtn.addEventListener("click", function () {
      if (!callFrame) return;
      allParticipants().forEach(function (p) {
        // Never mute the engine — its "mic" is the broadcast audio itself.
        if (!p.local && !p.owner && !isCohost(p) && !isEngine(p) && p.audio) {
          callFrame.updateParticipant(p.session_id, { setAudio: false });
        }
      });
      els.muteAllBtn.textContent = "Muted everyone ✓";
      setTimeout(function () { els.muteAllBtn.textContent = "Mute all"; }, 2200);
    });
  }

  /* ---------- Invite link ---------- */
  if (els.copyLinkBtn) {
    els.copyLinkBtn.addEventListener("click", function () {
      var link = window.location.origin + "/?room=" + encodeURIComponent(joinedRoom);
      var done = function () {
        els.copyLinkBtn.textContent = "Link copied ✓";
        setTimeout(function () { els.copyLinkBtn.textContent = "Copy invite link"; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done).catch(function () {
          window.prompt("Copy this invite link:", link);
        });
      } else {
        window.prompt("Copy this invite link:", link);
      }
    });
  }

  /* ---------- Engine panel: open the engine page ---------- */
  if (els.engOpen) {
    els.engOpen.addEventListener("click", function () {
      window.open("/program.html?room=" + encodeURIComponent(joinedRoom), "_blank");
    });
  }

  /* ---------- Drawers ---------- */
  if (els.boardToggle && els.board) {
    els.boardToggle.addEventListener("click", function () {
      document.body.classList.toggle("board-open");
    });
  }

  if (els.deckToggle) {
    els.deckToggle.addEventListener("click", function () {
      var hidden = document.body.classList.toggle("deck-hidden");
      els.deckToggle.innerHTML = hidden ? "Deck &#9656;" : "Deck &#9662;";
    });
  }

  /* ---------- Hardening: wake lock + unload guard ---------- */
  var wakeLock = null;

  function acquireWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request("screen")
      .then(function (wl) { wakeLock = wl; })
      .catch(function () { /* battery saver etc. — non-fatal */ });
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (e) { /* fine */ }
      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" &&
        document.body.classList.contains("in-call")) {
      acquireWakeLock();
    }
  });

  window.addEventListener("beforeunload", function (e) {
    if (bc.live || vt.live) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ============================================================
     Broadcast — main 16:9 (VCS custom) + vertical 9:16 (portrait)
     ============================================================ */

  var YT_TEMPLATE = "rtmp://a.rtmp.youtube.com/live2/";
  var FB_TEMPLATE = "rtmps://live-api-s.facebook.com:443/rtmp/";
  var IG_TEMPLATE = "rtmps://live-upload.instagram.com:443/rtmp/";

  function panelError(msg) {
    if (!els.bcError) return;
    if (!msg) { els.bcError.hidden = true; els.bcError.textContent = ""; return; }
    els.bcError.hidden = false;
    els.bcError.textContent = msg;
  }

  function vertNote(msg) {
    if (els.vertStatus) els.vertStatus.textContent = msg;
  }

  function buildEndpoints() {
    var eps = [];
    if (els.ytOn && els.ytOn.checked && els.ytKey && els.ytKey.value.trim()) {
      eps.push(YT_TEMPLATE + els.ytKey.value.trim());
    }
    if (els.yt2On && els.yt2On.checked && els.yt2Key && els.yt2Key.value.trim()) {
      eps.push(YT_TEMPLATE + els.yt2Key.value.trim());
    }
    if (els.fbOn && els.fbOn.checked && els.fbKey && els.fbKey.value.trim()) {
      eps.push(FB_TEMPLATE + els.fbKey.value.trim());
    }
    if (els.customOn && els.customOn.checked && els.customUrl && els.customUrl.value.trim()) {
      eps.push(els.customUrl.value.trim());
    }
    return eps;
  }

  function compositionParams() {
    var params = {
      mode: scene.spot ? "single" : scene.mode,
      "videoSettings.showParticipantLabels": true,
      "videoSettings.preferScreenshare": true,
    };

    if (scene.spot) {
      params["videoSettings.preferredParticipantIds"] = scene.spot;
    }

    // Cards render via the TEXT overlay — the banner overlay of the legacy
    // compositor is not supported on Daily's new pipeline (field-verified:
    // labels rendered, banner never did). Text overlay is in current docs.
    params.showTextOverlay = !!scene.card;
    if (scene.card) {
      var lines = [scene.card.title];
      if (scene.card.subtitle) lines = lines.concat(wrapText(scene.card.subtitle, 58, 4));
      var pv = (scene.cardPos || "bl").charAt(0);
      var ph = (scene.cardPos || "bl").charAt(1);
      params["text.content"] = lines.join("\n");
      params["text.align_horizontal"] = ph === "l" ? "left" : ph === "r" ? "right" : "center";
      params["text.align_vertical"] = pv === "t" ? "top" : "bottom";
      params["text.offset_x"] = ph === "l" ? 40 : ph === "r" ? -40 : 0;
      params["text.offset_y"] = pv === "t" ? 40 : -40;
      params["text.color"] = "rgba(255, 252, 245, 0.98)";
      params["text.strokeColor"] = "rgba(10, 16, 28, 0.9)";
      params["text.fontFamily"] = "Bitter";
      params["text.fontSize_gu"] = 2.0;
    }

    return params;
  }

  /* Wrap a long line into at most maxLines lines of ~width chars, breaking
     on spaces, so verses stay readable on the stream. */
  function wrapText(str, width, maxLines) {
    var words = String(str).split(/\s+/);
    var lines = [];
    var cur = "";
    for (var i = 0; i < words.length; i++) {
      if ((cur + " " + words[i]).trim().length > width && cur) {
        lines.push(cur);
        cur = words[i];
        if (lines.length === maxLines - 1) {
          var rest = words.slice(i + 1).join(" ");
          if (rest) cur = cur + " " + rest;
          break;
        }
      } else {
        cur = (cur + " " + words[i]).trim();
      }
    }
    if (cur) lines.push(cur.length > width + 12 ? cur.slice(0, width + 9) + "…" : cur);
    return lines;
  }

  function setActiveModeButton(mode) {
    if (!els.modes) return;
    Array.prototype.forEach.call(els.modes.querySelectorAll(".mode-btn"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  }

  if (els.modes) {
    els.modes.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".mode-btn") : null;
      if (!btn) return;
      scene.mode = btn.getAttribute("data-mode") || "grid";
      applyScene();
    });
  }

  /* ---------- Card position (applies to every card kind) ---------- */
  if (els.cardPosRow) {
    els.cardPosRow.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".pos-btn") : null;
      if (!btn) return;
      var pos = btn.getAttribute("data-pos");
      if (!/^[tb][lcr]$/.test(pos)) return;
      scene.cardPos = pos;
      applyScene();
    });
  }

  /* ---------- Main 16:9: go live / end ---------- */
  if (els.goLiveBtn) {
    els.goLiveBtn.addEventListener("click", function () {
      if (!callFrame) return;
      if (bc.live || bc.starting) { requestEnd(); return; }

      panelError("");
      var eps = buildEndpoints();
      if (!eps.length) {
        panelError("Tick at least one destination and paste its stream key first.");
        return;
      }

      bc.starting = true;
      els.goLiveBtn.disabled = true;
      els.goLiveBtn.textContent = "Connecting…";
      persistState();

      // Engine online → lock the stream to PROGRAM with the bulletproof
      // single-participant preset. Set ONCE at start, never updated
      // mid-stream — every switch happens inside the engine's canvas.
      // Engine offline → legacy Daily composition (auto fallback).
      var engp = engineParticipant();
      bc.engineLocked = engp ? engp.session_id : null;
      var layout;
      if (engp) {
        sendEngineScene(); // make sure the canvas shows the current scene
        layout = { preset: "single-participant", session_id: engp.session_id };
      } else {
        layout = {
          preset: "custom",
          composition_id: "daily:baseline", // REQUIRED — without it Daily discards the custom layout
          composition_params: compositionParams(),
        };
        panelError("Engine offline — streaming with the Daily fallback. Cards and mid-stream changes may not reach viewers. Open the engine page for the reliable path.");
      }

      try {
        // Main 16:9 runs as the DEFAULT instance (no instanceId) for maximum
        // compatibility; only the vertical stream uses an explicit instance.
        callFrame.startLiveStreaming({
          rtmpUrl: eps.length === 1 ? eps[0] : eps,
          width: 1920,
          height: 1080,
          fps: 30,
          layout: layout,
        });
      } catch (err) {
        bc.starting = false;
        els.goLiveBtn.disabled = false;
        els.goLiveBtn.textContent = "Go Live";
        panelError("Could not start the broadcast: " + (err.message || err));
      }
    });
  }

  function requestEnd() {
    if (!bc.live && !bc.starting) return;
    if (bc.confirmingEnd) {
      clearTimeout(bc.confirmingEnd);
      bc.confirmingEnd = null;
      try { callFrame.stopLiveStreaming(); } catch (e) { onLiveStopped(); }
      els.goLiveBtn.textContent = "Ending…";
      els.goLiveBtn.disabled = true;
    } else {
      bc.confirmingEnd = setTimeout(function () {
        bc.confirmingEnd = null;
        if (bc.live) els.goLiveBtn.textContent = "End broadcast";
      }, 4000);
      els.goLiveBtn.textContent = "Tap again to end";
    }
  }

  function pushLayout() {
    if (!callFrame || !bc.live) return;
    if (bc.engineLocked) return; // engine mode: the stream layout is never touched
    try {
      callFrame.updateLiveStreaming({
        layout: {
          preset: "custom",
          composition_id: "daily:baseline",
          composition_params: compositionParams(),
        },
      });
      panelError("");
    } catch (e) {
      // Never fail silently — the host must know a push didn't reach the stream
      panelError("Overlay/layout push failed: " + (e.message || e));
    }
  }

  function onLiveStarted() {
    if (!bc.live) bc.startedAt = Date.now();
    bc.live = true;
    bc.starting = false;
    if (els.goLiveBtn) {
      els.goLiveBtn.disabled = false;
      els.goLiveBtn.textContent = "End broadcast";
      els.goLiveBtn.classList.add("is-live");
    }
    if (els.liveChip) els.liveChip.hidden = false;
    if (bc.timerId) clearInterval(bc.timerId);
    bc.timerId = setInterval(tickMain, 1000);
    tickMain();
    if (bc.engineLocked) panelError("");
    updateEnginePanel();
    renderScene();
  }

  function onLiveStopped() {
    bc.live = false;
    bc.starting = false;
    bc.engineLocked = null;
    if (eng.alert && eng.alert.indexOf("ENGINE DISCONNECTED") === 0) eng.alert = "";
    updateEnginePanel();
    if (bc.timerId) { clearInterval(bc.timerId); bc.timerId = null; }
    if (bc.confirmingEnd) { clearTimeout(bc.confirmingEnd); bc.confirmingEnd = null; }
    if (els.liveChip) els.liveChip.hidden = true;
    if (els.goLiveBtn) {
      els.goLiveBtn.disabled = false;
      els.goLiveBtn.textContent = "Go Live";
      els.goLiveBtn.classList.remove("is-live");
    }
    renderScene();
  }

  /* ---------- Vertical 9:16 (Instagram): go live / end ---------- */
  if (els.goVertBtn) {
    els.goVertBtn.addEventListener("click", function () {
      if (!callFrame) return;
      if (vt.live || vt.starting) { requestVertEnd(); return; }

      // The 9:16 still uses Daily's portrait composition, which mixes ALL
      // room audio — with the engine running, viewers would hear everything
      // twice (mics + the engine's mix). The portrait engine canvas lands in E3.
      if (engineOnline()) {
        vertNote("9:16 is parked while the engine runs — Daily's portrait layout would double the audio. The portrait engine comes in the next phase.");
        return;
      }

      var key = els.igKey ? els.igKey.value.trim() : "";
      if (!key) {
        vertNote("Paste your Instagram stream key first (Instagram issues a fresh one per session).");
        return;
      }

      vt.starting = true;
      els.goVertBtn.disabled = true;
      els.goVertBtn.textContent = "Connecting 9:16…";
      persistState();

      try {
        callFrame.startLiveStreaming({
          instanceId: VERT_ID,
          rtmpUrl: key.indexOf("rtmp") === 0 ? key : IG_TEMPLATE + key,
          width: 1080,
          height: 1920,
          layout: { preset: "portrait", variant: "vertical" },
        });
      } catch (err) {
        vt.starting = false;
        els.goVertBtn.disabled = false;
        els.goVertBtn.textContent = "Go Live 9:16";
        vertNote("Could not start 9:16: " + (err.message || err));
      }
    });
  }

  function requestVertEnd() {
    if (!vt.live && !vt.starting) return;
    if (vt.confirmingEnd) {
      clearTimeout(vt.confirmingEnd);
      vt.confirmingEnd = null;
      try { callFrame.stopLiveStreaming({ instanceId: VERT_ID }); } catch (e) { vertStopped(); }
      els.goVertBtn.textContent = "Ending 9:16…";
      els.goVertBtn.disabled = true;
    } else {
      vt.confirmingEnd = setTimeout(function () {
        vt.confirmingEnd = null;
        if (vt.live) els.goVertBtn.textContent = "End 9:16";
      }, 4000);
      els.goVertBtn.textContent = "Tap again to end";
    }
  }

  function vertStarted() {
    if (!vt.live) vt.startedAt = Date.now();
    vt.live = true;
    vt.starting = false;
    if (els.goVertBtn) {
      els.goVertBtn.disabled = false;
      els.goVertBtn.textContent = "End 9:16";
      els.goVertBtn.classList.add("is-live-vert");
    }
    if (els.vertChip) els.vertChip.hidden = false;
    if (vt.timerId) clearInterval(vt.timerId);
    vt.timerId = setInterval(tickVert, 1000);
    tickVert();
    vertNote("9:16 vertical is live (portrait layout, up to 2 on camera).");
  }

  function vertStopped() {
    vt.live = false;
    vt.starting = false;
    if (vt.timerId) { clearInterval(vt.timerId); vt.timerId = null; }
    if (vt.confirmingEnd) { clearTimeout(vt.confirmingEnd); vt.confirmingEnd = null; }
    if (els.vertChip) els.vertChip.hidden = true;
    if (els.goVertBtn) {
      els.goVertBtn.disabled = false;
      els.goVertBtn.textContent = "Go Live 9:16";
      els.goVertBtn.classList.remove("is-live-vert");
    }
  }

  function fmtClock(startedAt) {
    var s = Math.floor((Date.now() - startedAt) / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = (m < 10 ? "0" : "") + m;
    var ss = (sec < 10 ? "0" : "") + sec;
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function tickMain() {
    if (els.liveTimer && bc.startedAt) els.liveTimer.textContent = fmtClock(bc.startedAt);
  }

  function tickVert() {
    if (els.vertTimer && vt.startedAt) els.vertTimer.textContent = fmtClock(vt.startedAt);
  }

  /* ============================================================
     WYSIWYG card on the video — mirrors the stream exactly
     ============================================================ */

  function renderScene() {
    if (els.frameGuide) {
      if (scene.card) {
        els.frameGuide.hidden = false;
        els.lcTitle.textContent = scene.card.title;
        els.lcSub.textContent = scene.card.subtitle || "";
        els.lcSub.hidden = !scene.card.subtitle;
        positionPreviewCard();
      } else {
        els.frameGuide.hidden = true;
      }
      if (els.pvTag) {
        els.pvTag.textContent = bc.live ? "LIVE" : "ONLY YOU SEE THIS";
        els.pvTag.className = "pv-tag" + (bc.live ? " is-live" : "");
      }
    }
    setActiveModeButton(scene.mode);
    if (els.cardPosRow) {
      Array.prototype.forEach.call(els.cardPosRow.querySelectorAll(".pos-btn"), function (b) {
        b.classList.toggle("active", b.getAttribute("data-pos") === scene.cardPos);
      });
    }
  }

  /* The WYSIWYG card mirrors the broadcast corner exactly. */
  function positionPreviewCard() {
    if (!els.liveCard) return;
    var pos = /^[tb][lcr]$/.test(scene.cardPos) ? scene.cardPos : "bl";
    var s = els.liveCard.style;
    s.left = "auto"; s.right = "auto"; s.top = "auto"; s.bottom = "auto";
    s.transform = "none";
    var v = pos.charAt(0), h = pos.charAt(1);
    if (h === "l") s.left = "16px";
    else if (h === "r") s.right = "16px";
    else { s.left = "50%"; s.transform = "translateX(-50%)"; }
    if (v === "t") s.top = "16px";
    else s.bottom = "68px";
  }

  /* ============================================================
     Overlay card producers (all instant — what you see streams)
     ============================================================ */

  function setCard(card) {
    scene.card = card;
    applyScene();
  }

  function hideKind(kind) {
    if (scene.card && scene.card.kind === kind) {
      scene.card = null;
      applyScene();
    }
  }

  /* ---------- Lower third ---------- */
  if (els.l3Show) {
    els.l3Show.addEventListener("click", function () {
      var name = els.l3Name ? els.l3Name.value.trim().slice(0, 48) : "";
      if (!name) { els.l3Name && els.l3Name.focus(); return; }
      var role = els.l3Role ? els.l3Role.value.trim().slice(0, 60) : "";
      setCard({ kind: "l3", title: name, subtitle: role });
    });
  }
  if (els.l3Hide) {
    els.l3Hide.addEventListener("click", function () { hideKind("l3"); });
  }

  /* ---------- Prayer points ---------- */
  function ppPoints() {
    if (!els.ppList) return [];
    return els.ppList.value
      .split("\n")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function pushPoint() {
    var pts = ppPoints();
    if (!pts.length) { els.ppList && els.ppList.focus(); return; }
    if (ppIdx >= pts.length) ppIdx = pts.length - 1;
    if (ppIdx < 0) ppIdx = 0;
    setCard({
      kind: "prayer",
      title: "Prayer Point " + (ppIdx + 1) + " of " + pts.length,
      subtitle: pts[ppIdx],
    });
  }

  if (els.ppPush) els.ppPush.addEventListener("click", pushPoint);

  if (els.ppNext) {
    els.ppNext.addEventListener("click", function () {
      var n = ppPoints().length;
      if (!n) return;
      ppIdx = Math.min(ppIdx + 1, n - 1);
      pushPoint();
    });
  }

  if (els.ppPrev) {
    els.ppPrev.addEventListener("click", function () {
      var n = ppPoints().length;
      if (!n) return;
      ppIdx = Math.max(ppIdx - 1, 0);
      pushPoint();
    });
  }

  if (els.ppHide) {
    els.ppHide.addEventListener("click", function () { hideKind("prayer"); });
  }

  /* ============================================================
     Media — two sources, one transport:
       Option 1 (link): Daily remote media player (server fetches
                        a public .mp4/.m3u8; no volume control)
       Option 2 (file): a video FILE from this computer, played in
                        a hidden <video> and published through the
                        host's Share slot (startScreenShare with a
                        custom mediaStream). Audio routes through a
                        gain node → the slider controls what the
                        room AND the stream hear, live. The engine
                        letterboxes it into the big slot and mixes
                        its audio like any screen share.
     ============================================================ */
  var md = { sessionId: null, paused: false }; // link mode
  var mf = { active: false, paused: false, el: null, ac: null, gain: null, url: null, name: "" }; // file mode

  function mdNote(msg) {
    if (els.mdStatus) els.mdStatus.textContent = msg;
  }

  function mdMode() {
    return mf.active ? "file" : (md.sessionId ? "link" : null);
  }

  function mdButtons() {
    var mode = mdMode();
    var paused = mode === "file" ? mf.paused : md.paused;
    if (els.mdPause) {
      els.mdPause.disabled = !mode;
      els.mdPause.textContent = paused ? "Resume" : "Pause";
    }
    if (els.mdStop) els.mdStop.disabled = !mode;
    if (els.mdPlay) els.mdPlay.disabled = mode === "file";
  }
  mdButtons();

  /* ---------- Option 1: link ---------- */
  if (els.mdPlay) {
    els.mdPlay.addEventListener("click", function () {
      if (!callFrame || mf.active) return;

      // Resume if paused
      if (md.sessionId) {
        try {
          callFrame.updateRemoteMediaPlayer({ session_id: md.sessionId, settings: { state: "play" } });
        } catch (e) { mdNote("Could not resume: " + (e.message || e)); }
        return;
      }

      var url = els.mdUrl ? els.mdUrl.value.trim() : "";
      if (!url || !/^https?:\/\//i.test(url)) {
        mdNote("Paste a direct video link first (must start with https:// and point at an .mp4 or .m3u8 file).");
        els.mdUrl && els.mdUrl.focus();
        return;
      }

      mdNote("Loading video…");
      persistState();
      try {
        callFrame.startRemoteMediaPlayer({ url: url, settings: { state: "play" } })
          .then(function (res) {
            if (res && res.session_id) md.sessionId = res.session_id;
          })
          .catch(function (err) {
            mdNote("Could not play: " + ((err && err.errorMsg) || (err && err.message) || err) +
              " — the link must be a direct, publicly reachable video file.");
            mdButtons();
          });
      } catch (e) {
        mdNote("Could not play: " + (e.message || e));
      }
    });
  }

  /* ---------- Option 2: a file on this computer ---------- */
  if (els.mdChoose) {
    els.mdChoose.addEventListener("click", function () {
      if (!callFrame) { mdNote("Join the room first, then choose a file."); return; }
      els.mdFile && els.mdFile.click();
    });
  }

  if (els.mdFile) {
    els.mdFile.addEventListener("change", function () {
      var f = els.mdFile.files && els.mdFile.files[0];
      els.mdFile.value = ""; // so the same file can be chosen again later
      if (f) startFilePlayback(f);
    });
  }

  function mdVolValue() {
    var raw = els.mdVol ? Number(els.mdVol.value) : 90;
    if (isNaN(raw)) raw = 90;
    return Math.max(0, Math.min(1, raw / 100));
  }

  if (els.mdVol) {
    els.mdVol.addEventListener("input", function () {
      if (mf.gain) mf.gain.gain.value = mdVolValue();
    });
  }

  function startFilePlayback(file) {
    if (!callFrame) return;
    // One media source at a time
    if (md.sessionId) { try { callFrame.stopRemoteMediaPlayer(md.sessionId); } catch (e) { /* fine */ } }
    stopFilePlayback(true);

    var v = document.createElement("video");
    mf.url = URL.createObjectURL(file);
    mf.el = v;
    mf.name = file.name;
    v.src = mf.url;
    v.playsInline = true;

    mdNote("Loading “" + file.name + "”…");

    v.play().then(function () {
      var cap = v.captureStream ? v.captureStream()
        : (v.mozCaptureStream ? v.mozCaptureStream() : null);
      var videoTrack = cap && cap.getVideoTracks()[0];
      if (!videoTrack) {
        stopFilePlayback(true);
        mdNote("This browser can't capture the file — use Chrome or Edge on a computer.");
        return;
      }

      // Audio: file → gain (the slider) → published track + your speakers.
      var AC = window.AudioContext || window.webkitAudioContext;
      mf.ac = new AC();
      var src = mf.ac.createMediaElementSource(v);
      mf.gain = mf.ac.createGain();
      mf.gain.gain.value = mdVolValue();
      var dest = mf.ac.createMediaStreamDestination();
      src.connect(mf.gain);
      mf.gain.connect(dest);               // → the room + the stream
      mf.gain.connect(mf.ac.destination);  // → your speakers (you hear what they hear)

      var tracks = [videoTrack];
      var at = dest.stream.getAudioTracks()[0];
      if (at) tracks.push(at);

      try {
        callFrame.startScreenShare({ mediaStream: new MediaStream(tracks) });
      } catch (err) {
        stopFilePlayback(true);
        mdNote("Could not share the file: " + (err.message || err));
        return;
      }

      mf.active = true;
      mf.paused = false;
      v.onended = function () { stopFilePlayback(); mdNote("File finished."); };
      mdNote("Playing “" + mf.name + "” for the room and the stream. Slider = live volume. (Uses your Share slot.)");
      mdButtons();
    }).catch(function () {
      stopFilePlayback(true);
      mdNote("Couldn't play that file — MP4 (H.264) works best.");
    });
  }

  function stopFilePlayback(silent) {
    var was = mf.active;
    mf.active = false;
    mf.paused = false;
    if (was && callFrame) { try { callFrame.stopScreenShare(); } catch (e) { /* fine */ } }
    if (mf.el) {
      mf.el.onended = null;
      try { mf.el.pause(); mf.el.removeAttribute("src"); mf.el.load(); } catch (e) { /* fine */ }
      mf.el = null;
    }
    if (mf.url) { try { URL.revokeObjectURL(mf.url); } catch (e) { /* fine */ } mf.url = null; }
    if (mf.ac) { try { mf.ac.close(); } catch (e) { /* fine */ } mf.ac = null; }
    mf.gain = null;
    if (!silent && was) mdNote("Stopped.");
    mdButtons();
  }

  /* ---------- Shared transport ---------- */
  if (els.mdPause) {
    els.mdPause.addEventListener("click", function () {
      if (mf.active) {
        if (mf.paused) {
          mf.el && mf.el.play();
          mf.paused = false;
          mdNote("Playing.");
        } else {
          mf.el && mf.el.pause();
          mf.paused = true;
          mdNote("Paused — the stream holds the last frame.");
        }
        mdButtons();
        return;
      }
      if (!callFrame || !md.sessionId) return;
      try {
        callFrame.updateRemoteMediaPlayer({
          session_id: md.sessionId,
          settings: { state: md.paused ? "play" : "pause" },
        });
      } catch (e) { mdNote("Could not pause: " + (e.message || e)); }
    });
  }

  if (els.mdStop) {
    els.mdStop.addEventListener("click", function () {
      if (mf.active) { stopFilePlayback(); return; }
      if (!callFrame || !md.sessionId) return;
      try {
        callFrame.stopRemoteMediaPlayer(md.sessionId);
      } catch (e) { mdNote("Could not stop: " + (e.message || e)); }
    });
  }

  /* ---------- Scripture (KJV via bible-api.com) ---------- */
  var scCache = {}; // reference -> { reference, text }

  function scNote(msg) {
    if (els.scStatus) els.scStatus.textContent = msg;
  }

  function showScripture(ref) {
    ref = String(ref || "").trim().slice(0, 60);
    if (!ref) { els.scInput && els.scInput.focus(); return; }

    var key = ref.toLowerCase();
    if (scCache[key]) { pushVerse(scCache[key]); return; }

    scNote("Fetching " + ref + "…");
    fetch("https://bible-api.com/" + encodeURIComponent(ref) + "?translation=kjv")
      .then(function (res) {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.text) throw new Error("empty");
        var verse = {
          reference: data.reference || ref,
          text: String(data.text).replace(/\s+/g, " ").trim(),
        };
        scCache[key] = verse;
        pushVerse(verse);
      })
      .catch(function () {
        scNote("Couldn't find \"" + ref + "\" — check the reference (e.g. Psalm 144:1).");
      });
  }

  function pushVerse(verse) {
    var text = verse.text.length > 260 ? verse.text.slice(0, 257).replace(/\s+\S*$/, "") + "…" : verse.text;
    setCard({ kind: "scripture", title: verse.reference + " · KJV", subtitle: text });
    scNote("King James Version · bible-api.com");
  }

  if (els.scGo) {
    els.scGo.addEventListener("click", function () {
      showScripture(els.scInput ? els.scInput.value : "");
    });
  }

  if (els.scInput) {
    els.scInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); showScripture(els.scInput.value); }
    });
  }

  if (els.scBrand) {
    els.scBrand.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-ref]") : null;
      if (btn) showScripture(btn.getAttribute("data-ref"));
    });
  }

  if (els.scHide) {
    els.scHide.addEventListener("click", function () { hideKind("scripture"); });
  }

  /* ---------- Init ---------- */
  renderScene();
})();
