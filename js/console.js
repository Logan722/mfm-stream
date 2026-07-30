/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Host console: Prebuilt video + production deck + studio row
   ------------------------------------------------------------
   - People board: mute / cam-off / co-host / remove / feature
   - Broadcast: 16:9 RTMP to YouTube/Facebook (VCS custom preset)
   - Studio row (OBS-style): visual PREVIEW and PROGRAM monitors.
     Studio ON  -> edits (cards, layout, feature) stage in PREVIEW;
                   TAKE cuts the whole scene to PROGRAM.
     Studio OFF -> edits hit PROGRAM (and the stream) instantly.
   - Overlay card producers: lower third, prayer points, scripture.
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
    // Live status
    liveChip: document.getElementById("live-chip"),
    liveTimer: document.getElementById("live-timer"),
    // Studio row
    monitor: document.getElementById("monitor"),
    prevScreen: document.getElementById("prev-screen"),
    prevMock: document.getElementById("prev-mock"),
    progScreen: document.getElementById("prog-screen"),
    progMock: document.getElementById("prog-mock"),
    pvTag: document.getElementById("pv-tag"),
    takeBtn: document.getElementById("take-btn"),
    progClear: document.getElementById("prog-clear"),
    studioToggle: document.getElementById("studio-toggle"),
    // Broadcast panel
    goLiveBtn: document.getElementById("go-live"),
    bcError: document.getElementById("bc-error"),
    modes: document.getElementById("bc-modes"),
    ytOn: document.getElementById("yt-on"),
    ytKey: document.getElementById("yt-key"),
    fbOn: document.getElementById("fb-on"),
    fbKey: document.getElementById("fb-key"),
    customOn: document.getElementById("custom-on"),
    customUrl: document.getElementById("custom-url"),
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
    scBrand: document.getElementById("sc-brand"),
    scInput: document.getElementById("sc-input"),
    scGo: document.getElementById("sc-go"),
    scHide: document.getElementById("sc-hide"),
    scStatus: document.getElementById("sc-status"),
  };

  var callFrame = null;
  var joinedRoom = "sanctuary";
  var renderQueued = false;
  var confirmingEject = {}; // session_id -> timeout handle

  /* ---------- Broadcast state ---------- */
  var bc = {
    live: false,
    starting: false,
    startedAt: 0,
    timerId: null,
    confirmingEnd: null,
  };

  /* ---------- Scenes (OBS-style) ----------
     A scene = { card, mode, spot }
       card: null | { kind, title, subtitle }   (lower third / prayer / scripture)
       mode: grid | dominant | split | pip      (stream layout)
       spot: null | session_id                  (featured full-screen person)
     PROGRAM is what the broadcast shows. PREVIEW is the scene being edited.
     Studio OFF: every edit auto-commits preview -> program.
     Studio ON:  TAKE commits. */
  var studio = false;
  var program = { card: null, mode: "grid", spot: null };
  var preview = { card: null, mode: "grid", spot: null };
  var ppIdx = 0;

  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function scenesEqual() { return JSON.stringify(program) === JSON.stringify(preview); }

  /* Every edit funnels through here. */
  function afterEdit() {
    if (!studio) {
      program = clone(preview);
      if (bc.live) pushLayout();
    }
    persistState();
    renderStudio();
  }

  function takeScene() {
    if (scenesEqual()) return;
    program = clone(preview);
    if (bc.live) pushLayout();
    persistState();
    renderStudio();
    queueRender(); // feature-button states follow the edit scene
  }

  function clearProgramCard() {
    // Urgent hide: acts on PROGRAM directly, even in studio mode
    if (!program.card && !preview.card) return;
    program.card = null;
    if (!studio) preview.card = null;
    if (bc.live) pushLayout();
    persistState();
    renderStudio();
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
    if (els.fbOn && "fbOn" in savedBc) els.fbOn.checked = !!savedBc.fbOn;
    if (els.fbKey && savedBc.fbKey) els.fbKey.value = savedBc.fbKey;
    if (els.customOn && "customOn" in savedBc) els.customOn.checked = !!savedBc.customOn;
    if (els.customUrl && savedBc.customUrl) els.customUrl.value = savedBc.customUrl;
    if ("studio" in savedBc) studio = !!savedBc.studio;
    if (savedBc.mode) { program.mode = savedBc.mode; preview.mode = savedBc.mode; }
  } catch (e) { /* fine */ }

  try {
    var savedOv = JSON.parse(localStorage.getItem(ovStoreKey) || "{}");
    if (els.l3Name && savedOv.l3name) els.l3Name.value = savedOv.l3name;
    if (els.l3Role && savedOv.l3role) els.l3Role.value = savedOv.l3role;
    if (els.ppList && savedOv.points) els.ppList.value = savedOv.points;
    if (typeof savedOv.ppIdx === "number") ppIdx = savedOv.ppIdx;
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
        fbOn: els.fbOn ? els.fbOn.checked : false,
        fbKey: els.fbKey ? els.fbKey.value : "",
        customOn: els.customOn ? els.customOn.checked : false,
        customUrl: els.customUrl ? els.customUrl.value : "",
        studio: studio,
        mode: program.mode,
      }));
      localStorage.setItem(ovStoreKey, JSON.stringify({
        l3name: els.l3Name ? els.l3Name.value : "",
        l3role: els.l3Role ? els.l3Role.value : "",
        points: els.ppList ? els.ppList.value : "",
        ppIdx: ppIdx,
      }));
    } catch (e) { /* fine */ }
  }

  ["ytOn", "ytKey", "fbOn", "fbKey", "customOn", "customUrl", "l3Name", "l3Role", "ppList"]
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

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
        queueRender();
      })
      .on("participant-joined", queueRender)
      .on("participant-updated", queueRender)
      .on("participant-left", function (ev) {
        var id = ev && ev.participant && ev.participant.session_id;
        if (id) {
          var changed = false;
          if (program.spot === id) { program.spot = null; changed = true; }
          if (preview.spot === id) preview.spot = null;
          if (changed && bc.live) pushLayout();
          renderStudio();
        }
        queueRender();
      })
      .on("live-streaming-started", onLiveStarted)
      .on("live-streaming-stopped", onLiveStopped)
      .on("live-streaming-error", function (ev) {
        bc.starting = false;
        panelError("Broadcast error: " + ((ev && ev.errorMsg) || "unknown") +
          " — check your stream key and try again.");
        onLiveStopped();
      })
      .on("left-meeting", endCall)
      .on("error", function (ev) {
        showError("Call error: " + ((ev && ev.errorMsg) || "unknown. Please rejoin."));
        endCall();
      });

    callFrame.join().catch(function () {
      showError("Could not join the room. Please try again.");
      endCall();
    });

    renderStudio();
  }

  function endCall() {
    onLiveStopped();
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
      renderStudio(); // participant names feed the monitor mocks
    }, 150);
  }

  function allParticipants() {
    if (!callFrame) return [];
    var map = callFrame.participants() || {};
    return Object.keys(map).map(function (k) { return map[k]; });
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

    var people = allParticipants();

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

    var editScene = studio ? preview : program;

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

      // Feature on stream (stages in studio mode)
      var featured = editScene.spot === p.session_id;
      var feat = actionBtn(
        featured ? "★ Featured" : "Feature",
        false,
        function () {
          preview.spot = featured ? null : p.session_id;
          afterEdit();
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
            callFrame.updateParticipant(p.session_id, {
              updatePermissions: { canAdmin: cohost ? false : ["participants"] },
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
        if (!p.local && !p.owner && !isCohost(p) && p.audio) {
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
    if (bc.live) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ============================================================
     Broadcast — 16:9 RTMP via Daily live streaming (VCS custom)
     ============================================================ */

  var YT_TEMPLATE = "rtmp://a.rtmp.youtube.com/live2/";
  var FB_TEMPLATE = "rtmps://live-api-s.facebook.com:443/rtmp/";

  function panelError(msg) {
    if (!els.bcError) return;
    if (!msg) { els.bcError.hidden = true; els.bcError.textContent = ""; return; }
    els.bcError.hidden = false;
    els.bcError.textContent = msg;
  }

  function buildEndpoints() {
    var eps = [];
    if (els.ytOn && els.ytOn.checked && els.ytKey && els.ytKey.value.trim()) {
      eps.push(YT_TEMPLATE + els.ytKey.value.trim());
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
      mode: program.spot ? "single" : program.mode,
      "videoSettings.showParticipantLabels": true,
      "videoSettings.preferScreenshare": true,
    };

    if (program.spot) {
      params["videoSettings.preferredParticipantIds"] = program.spot;
    }

    params.showBannerOverlay = !!program.card;
    if (program.card) {
      params["banner.title"] = program.card.title;
      params["banner.subtitle"] = program.card.subtitle || "";
      params["banner.position"] = "bottom-left";
      params["banner.enableTransition"] = true;
      params["banner.maxW_pct_default"] = 0.65;
      params["banner.showIcon"] = false;
    }

    return params;
  }

  /* Layout mode buttons edit the scene */
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
      preview.mode = btn.getAttribute("data-mode") || "grid";
      afterEdit();
    });
  }

  /* ---------- Go live / end ---------- */
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

      try {
        callFrame.startLiveStreaming({
          rtmpUrl: eps.length === 1 ? eps[0] : eps,
          width: 1920,
          height: 1080,
          layout: {
            preset: "custom",
            composition_params: compositionParams(),
          },
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
    try {
      callFrame.updateLiveStreaming({
        layout: { preset: "custom", composition_params: compositionParams() },
      });
    } catch (e) { /* stream may be mid-transition; next change re-applies */ }
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
    bc.timerId = setInterval(tickTimer, 1000);
    tickTimer();
    panelError("");
    renderStudio();
  }

  function onLiveStopped() {
    bc.live = false;
    bc.starting = false;
    if (bc.timerId) { clearInterval(bc.timerId); bc.timerId = null; }
    if (bc.confirmingEnd) { clearTimeout(bc.confirmingEnd); bc.confirmingEnd = null; }
    if (els.liveChip) els.liveChip.hidden = true;
    if (els.goLiveBtn) {
      els.goLiveBtn.disabled = false;
      els.goLiveBtn.textContent = "Go Live";
      els.goLiveBtn.classList.remove("is-live");
    }
    renderStudio();
  }

  function tickTimer() {
    if (!els.liveTimer || !bc.startedAt) return;
    var s = Math.floor((Date.now() - bc.startedAt) / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = (m < 10 ? "0" : "") + m;
    var ss = (sec < 10 ? "0" : "") + sec;
    els.liveTimer.textContent = h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  /* ============================================================
     Studio row — visual PREVIEW / PROGRAM monitors (OBS-style)
     ============================================================ */

  if (els.takeBtn) els.takeBtn.addEventListener("click", takeScene);
  if (els.progClear) els.progClear.addEventListener("click", clearProgramCard);

  if (els.studioToggle) {
    els.studioToggle.addEventListener("click", function () {
      studio = !studio;
      preview = clone(program); // start (or stop) editing from what's on air
      persistState();
      renderStudio();
      queueRender();
    });
  }

  function spotName(scene) {
    if (!scene.spot) return null;
    var all = allParticipants();
    for (var i = 0; i < all.length; i++) {
      if (all[i].session_id === scene.spot) return displayName(all[i]);
    }
    return "(left the room)";
  }

  function mtile(name, cls) {
    return '<div class="mtile ' + cls + '"><span>' + esc(name) + "</span></div>";
  }

  function drawMock(mockEl, scene) {
    if (!mockEl) return;
    var names = allParticipants().map(displayName);
    if (!names.length) names = ["Waiting…"];

    var html = "";
    var featured = spotName(scene);

    if (featured) {
      html += mtile("★ " + featured, "t-full");
    } else if (scene.mode === "split") {
      html += '<div class="t-grid g2">' + mtile(names[0] || "—", "t-cell") +
              mtile(names[1] || "—", "t-cell") + "</div>";
    } else if (scene.mode === "pip") {
      html += mtile("Active speaker", "t-full") + mtile(names[1] || "…", "t-pip");
    } else if (scene.mode === "dominant") {
      html += '<div class="t-dom-wrap">' + mtile("Active speaker", "t-dom") +
              '<div class="t-strip">' +
              names.slice(0, 4).map(function (n) { return mtile(n, "t-mini"); }).join("") +
              "</div></div>";
    } else { // grid
      var show = names.slice(0, 6);
      var cols = show.length <= 1 ? "g1" : show.length <= 4 ? "g2" : "g3";
      html += '<div class="t-grid ' + cols + '">' +
              show.map(function (n) { return mtile(n, "t-cell"); }).join("") + "</div>";
    }

    if (scene.card) {
      html += '<div class="mock-card"><p class="mc-t">' + esc(scene.card.title) + "</p>" +
              (scene.card.subtitle ? '<p class="mc-s">' + esc(scene.card.subtitle) + "</p>" : "") +
              "</div>";
    }

    mockEl.innerHTML = html;
  }

  function renderStudio() {
    if (!els.monitor) return;

    if (els.prevScreen) els.prevScreen.hidden = !studio;
    if (els.takeBtn) {
      els.takeBtn.hidden = !studio;
      els.takeBtn.disabled = scenesEqual();
    }

    if (studio) drawMock(els.prevMock, preview);
    drawMock(els.progMock, program);

    if (els.pvTag) {
      els.pvTag.textContent = bc.live ? "LIVE" : "OFF AIR";
      els.pvTag.className = "pv-tag" + (bc.live ? " is-live" : "");
    }
    if (els.progClear) els.progClear.disabled = !program.card;

    if (els.studioToggle) {
      els.studioToggle.textContent = studio ? "Studio: On" : "Studio: Off";
      els.studioToggle.classList.toggle("studio-on", studio);
    }

    setActiveModeButton((studio ? preview : program).mode);

    if (els.l3Show) els.l3Show.textContent = studio ? "Stage" : "Show";
    if (els.scGo) els.scGo.textContent = studio ? "Stage verse" : "Show verse";
    if (els.ppPush) els.ppPush.textContent = studio ? "Stage" : "Push";
  }

  /* ============================================================
     Overlay card producers
     ============================================================ */

  function setCard(card) {
    preview.card = card;
    afterEdit();
  }

  function hideKind(kind) {
    var changed = false;
    if (preview.card && preview.card.kind === kind) { preview.card = null; changed = true; }
    if (!studio && program.card && program.card.kind === kind) { program.card = null; changed = true; }
    if (changed) afterEdit();
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
  renderStudio();
})();
