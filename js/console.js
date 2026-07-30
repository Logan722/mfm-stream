/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Host console (Phase 2): Daily Prebuilt video + control board
   ------------------------------------------------------------
   The video area is Daily Prebuilt (proven UI). The board is
   ours: live participant list with per-person controls, co-host
   promotion, mute-all, invite link.

   Notes:
   - Hosts (owner tokens) and co-hosts (granted canAdmin) can
     mute/cam-off/remove participants.
   - Remote UNmute is impossible by design (browser privacy):
     you mute people; they unmute themselves.
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
    boardToggle: document.getElementById("board-toggle"),
    board: document.getElementById("board"),
    plist: document.getElementById("plist"),
    muteAllBtn: document.getElementById("mute-all"),
    boardNote: document.getElementById("board-note"),
    // Broadcast panel
    liveChip: document.getElementById("live-chip"),
    liveTimer: document.getElementById("live-timer"),
    bcToggle: document.getElementById("bc-toggle"),
    bcCaret: document.getElementById("bc-caret"),
    bcBody: document.getElementById("bc-body"),
    ytOn: document.getElementById("yt-on"),
    ytKey: document.getElementById("yt-key"),
    fbOn: document.getElementById("fb-on"),
    fbKey: document.getElementById("fb-key"),
    customOn: document.getElementById("custom-on"),
    customUrl: document.getElementById("custom-url"),
    modes: document.getElementById("bc-modes"),
    labelsOn: document.getElementById("labels-on"),
    titleText: document.getElementById("title-text"),
    goLiveBtn: document.getElementById("go-live"),
    bcError: document.getElementById("bc-error"),
    // Overlays panel
    ovToggle: document.getElementById("ov-toggle"),
    ovCaret: document.getElementById("ov-caret"),
    ovBody: document.getElementById("ov-body"),
    ovStatus: document.getElementById("ov-status"),
    l3Name: document.getElementById("l3-name"),
    l3Role: document.getElementById("l3-role"),
    l3Show: document.getElementById("l3-show"),
    l3Hide: document.getElementById("l3-hide"),
    ppList: document.getElementById("pp-list"),
    ppPrev: document.getElementById("pp-prev"),
    ppPush: document.getElementById("pp-push"),
    ppNext: document.getElementById("pp-next"),
    ppHide: document.getElementById("pp-hide"),
  };

  var callFrame = null;
  var joinedRoom = "sanctuary";
  var renderQueued = false;
  var confirmingEject = {}; // session_id -> timeout handle

  /* Broadcast state */
  var bc = {
    live: false,
    starting: false,
    startedAt: 0,
    timerId: null,
    mode: "grid",          // grid | dominant | split | pip
    spotlightId: null,     // session_id featured full-screen
    confirmingEnd: null,   // timeout handle for two-tap end
  };

  /* Overlay card state — one card slot shared by lower thirds,
     prayer points, and (Phase 5) scripture. */
  var ov = {
    banner: null,          // null | { kind, title, subtitle }
    ppIdx: 0,              // current prayer point index
  };

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

  /* ---------- Remember name + host key on this device ---------- */
  var storeKey = "mfm-stream-host";
  try {
    var saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
    if (saved.name && els.name && !els.name.value) els.name.value = saved.name;
    if (saved.hostKey && els.hostKey) els.hostKey.value = saved.hostKey;
  } catch (e) { /* storage unavailable — fine */ }

  function remember() {
    try {
      localStorage.setItem(storeKey, JSON.stringify({
        name: els.name.value.trim(),
        hostKey: els.hostKey ? els.hostKey.value : "",
      }));
    } catch (e) { /* fine */ }
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
        remember();
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
      .on("joined-meeting", queueRender)
      .on("participant-joined", queueRender)
      .on("participant-updated", queueRender)
      .on("participant-left", function (ev) {
        // If the featured person leaves, release the spotlight on stream
        if (bc.spotlightId && ev && ev.participant &&
            ev.participant.session_id === bc.spotlightId) {
          bc.spotlightId = null;
          if (bc.live) pushLayout();
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
  }

  function endCall() {
    onLiveStopped(); // clears LIVE UI + timer if we were streaming
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

    // Sort: you first, then hosts, then co-hosts, then alphabetical
    people.sort(function (a, b) {
      if (a.local !== b.local) return a.local ? -1 : 1;
      if (!!a.owner !== !!b.owner) return a.owner ? -1 : 1;
      var ac = isCohost(a), bc = isCohost(b);
      if (ac !== bc) return ac ? -1 : 1;
      return displayName(a).localeCompare(displayName(b));
    });

    if (els.barCount) {
      els.barCount.textContent = people.length + (people.length === 1 ? " in room" : " in room");
    }

    els.plist.innerHTML = "";

    people.forEach(function (p) {
      var li = document.createElement("li");
      li.className = "p-row";

      // --- identity line ---
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

      // --- Feature on stream (any person, including yourself) ---
      var featured = bc.spotlightId === p.session_id;
      var feat = actionBtn(
        featured ? "★ Featured" : "Feature",
        false,
        function () {
          bc.spotlightId = featured ? null : p.session_id;
          if (bc.live) pushLayout();
          queueRender();
        }
      );
      feat.classList.add("feature");
      if (featured) feat.classList.add("active");
      row.appendChild(feat);

      // --- moderation controls (not for yourself; not for other owner-token hosts) ---
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

  /* ---------- Board drawer on small screens ---------- */
  if (els.boardToggle && els.board) {
    els.boardToggle.addEventListener("click", function () {
      document.body.classList.toggle("board-open");
    });
  }

  /* ============================================================
     Broadcast (Phase 3) — 16:9 to YouTube/Facebook via Daily
     live streaming, composed with the VCS "custom" preset so
     overlays (Phases 4–5) can be layered in without restarting.
     ============================================================ */

  var YT_TEMPLATE = "rtmp://a.rtmp.youtube.com/live2/";
  var FB_TEMPLATE = "rtmps://live-api-s.facebook.com:443/rtmp/";
  var bcStoreKey = "mfm-stream-broadcast";

  /* ---------- Panel persistence (this device only) ---------- */
  try {
    var bcSaved = JSON.parse(localStorage.getItem(bcStoreKey) || "{}");
    if (els.ytOn && "ytOn" in bcSaved) els.ytOn.checked = !!bcSaved.ytOn;
    if (els.ytKey && bcSaved.ytKey) els.ytKey.value = bcSaved.ytKey;
    if (els.fbOn && "fbOn" in bcSaved) els.fbOn.checked = !!bcSaved.fbOn;
    if (els.fbKey && bcSaved.fbKey) els.fbKey.value = bcSaved.fbKey;
    if (els.customOn && "customOn" in bcSaved) els.customOn.checked = !!bcSaved.customOn;
    if (els.customUrl && bcSaved.customUrl) els.customUrl.value = bcSaved.customUrl;
    if (els.labelsOn && "labels" in bcSaved) els.labelsOn.checked = !!bcSaved.labels;
    if (els.titleText && bcSaved.title) els.titleText.value = bcSaved.title;
    if (bcSaved.mode) { bc.mode = bcSaved.mode; setActiveModeButton(bc.mode); }
  } catch (e) { /* fine */ }

  function bcRemember() {
    try {
      localStorage.setItem(bcStoreKey, JSON.stringify({
        ytOn: els.ytOn ? els.ytOn.checked : true,
        ytKey: els.ytKey ? els.ytKey.value : "",
        fbOn: els.fbOn ? els.fbOn.checked : false,
        fbKey: els.fbKey ? els.fbKey.value : "",
        customOn: els.customOn ? els.customOn.checked : false,
        customUrl: els.customUrl ? els.customUrl.value : "",
        labels: els.labelsOn ? els.labelsOn.checked : true,
        title: els.titleText ? els.titleText.value : "",
        mode: bc.mode,
      }));
    } catch (e) { /* fine */ }
  }

  ["ytOn", "ytKey", "fbOn", "fbKey", "customOn", "customUrl", "labelsOn", "titleText"]
    .forEach(function (k) {
      if (els[k]) els[k].addEventListener("change", function () {
        bcRemember();
        // Branding changes apply live without restarting the stream
        if (bc.live && (k === "labelsOn" || k === "titleText")) pushLayout();
      });
    });

  /* ---------- Collapse/expand ---------- */
  if (els.bcToggle && els.bcBody) {
    els.bcToggle.addEventListener("click", function () {
      var hidden = els.bcBody.style.display === "none";
      els.bcBody.style.display = hidden ? "" : "none";
      if (els.bcCaret) els.bcCaret.textContent = hidden ? "▾" : "▸";
      els.bcToggle.setAttribute("aria-expanded", hidden ? "true" : "false");
    });
  }

  /* ---------- Layout modes ---------- */
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
      bc.mode = btn.getAttribute("data-mode") || "grid";
      setActiveModeButton(bc.mode);
      bcRemember();
      if (bc.live) pushLayout();
    });
  }

  /* ---------- Endpoints & composition ---------- */
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
      mode: bc.spotlightId ? "single" : bc.mode,
      "videoSettings.showParticipantLabels": !!(els.labelsOn && els.labelsOn.checked),
      "videoSettings.preferScreenshare": true,
    };

    if (bc.spotlightId) {
      params["videoSettings.preferredParticipantIds"] = bc.spotlightId;
    }

    // Program title — small, bottom-right, out of the card's way
    var title = els.titleText ? els.titleText.value.trim().slice(0, 60) : "";
    params.showTextOverlay = !!title;
    if (title) {
      params["text.content"] = title;
      params["text.align_horizontal"] = "right";
      params["text.align_vertical"] = "bottom";
      params["text.offset_x"] = -24;
      params["text.fontFamily"] = "Bitter";
      params["text.color"] = "rgba(240, 230, 208, 0.96)";
    }

    // Overlay card (lower third / prayer point / scripture) — bottom-left
    params.showBannerOverlay = !!ov.banner;
    if (ov.banner) {
      params["banner.title"] = ov.banner.title;
      params["banner.subtitle"] = ov.banner.subtitle || "";
      params["banner.position"] = "bottom-left";
      params["banner.enableTransition"] = true;
      params["banner.maxW_pct_default"] = 0.65;
      params["banner.showIcon"] = false;
    }

    return params;
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
      bcRemember();

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
    bc.live = true;
    bc.starting = false;
    bc.startedAt = Date.now();
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
    updateOvStatus();
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
    updateOvStatus();
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
     Overlays (Phase 4) — lower thirds & prayer points
     One card slot on the stream (bottom-left); the three
     producers (lower third, prayer points, scripture in Phase 5)
     replace each other.
     ============================================================ */

  var ovStoreKey = "mfm-stream-overlays";

  try {
    var ovSaved = JSON.parse(localStorage.getItem(ovStoreKey) || "{}");
    if (els.l3Name && ovSaved.l3name) els.l3Name.value = ovSaved.l3name;
    if (els.l3Role && ovSaved.l3role) els.l3Role.value = ovSaved.l3role;
    if (els.ppList && ovSaved.points) els.ppList.value = ovSaved.points;
    if (typeof ovSaved.ppIdx === "number") ov.ppIdx = ovSaved.ppIdx;
  } catch (e) { /* fine */ }

  function ovRemember() {
    try {
      localStorage.setItem(ovStoreKey, JSON.stringify({
        l3name: els.l3Name ? els.l3Name.value : "",
        l3role: els.l3Role ? els.l3Role.value : "",
        points: els.ppList ? els.ppList.value : "",
        ppIdx: ov.ppIdx,
      }));
    } catch (e) { /* fine */ }
  }

  ["l3Name", "l3Role", "ppList"].forEach(function (k) {
    if (els[k]) els[k].addEventListener("change", ovRemember);
  });

  /* Collapse/expand — same pattern as the broadcast section */
  if (els.ovToggle && els.ovBody) {
    els.ovToggle.addEventListener("click", function () {
      var hidden = els.ovBody.style.display === "none";
      els.ovBody.style.display = hidden ? "" : "none";
      if (els.ovCaret) els.ovCaret.textContent = hidden ? "▾" : "▸";
      els.ovToggle.setAttribute("aria-expanded", hidden ? "true" : "false");
    });
  }

  function ppPoints() {
    if (!els.ppList) return [];
    return els.ppList.value
      .split("\n")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function setCard(card) {
    ov.banner = card;
    ovRemember();
    updateOvStatus();
    if (bc.live) pushLayout();
  }

  function updateOvStatus() {
    if (!els.ovStatus) return;
    if (!ov.banner) {
      els.ovStatus.textContent = bc.live ? "Nothing on stream." : "Nothing queued. Cards appear once you're live.";
    } else {
      var what = ov.banner.kind === "prayer" ? ov.banner.title
               : "Lower third — " + ov.banner.title;
      els.ovStatus.textContent = (bc.live ? "On stream: " : "Queued for stream: ") + what;
    }
    if (els.l3Show) {
      els.l3Show.textContent = (ov.banner && ov.banner.kind === "l3") ? "On ✓ (update)" : "Show";
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
    els.l3Hide.addEventListener("click", function () {
      if (ov.banner && ov.banner.kind === "l3") setCard(null);
    });
  }

  /* ---------- Prayer points ---------- */
  function pushPoint() {
    var pts = ppPoints();
    if (!pts.length) { els.ppList && els.ppList.focus(); return; }
    if (ov.ppIdx >= pts.length) ov.ppIdx = pts.length - 1;
    if (ov.ppIdx < 0) ov.ppIdx = 0;
    setCard({
      kind: "prayer",
      title: "Prayer Point " + (ov.ppIdx + 1) + " of " + pts.length,
      subtitle: pts[ov.ppIdx],
    });
  }

  if (els.ppPush) els.ppPush.addEventListener("click", pushPoint);

  if (els.ppNext) {
    els.ppNext.addEventListener("click", function () {
      var n = ppPoints().length;
      if (!n) return;
      ov.ppIdx = Math.min(ov.ppIdx + 1, n - 1);
      pushPoint();
    });
  }

  if (els.ppPrev) {
    els.ppPrev.addEventListener("click", function () {
      var n = ppPoints().length;
      if (!n) return;
      ov.ppIdx = Math.max(ov.ppIdx - 1, 0);
      pushPoint();
    });
  }

  if (els.ppHide) {
    els.ppHide.addEventListener("click", function () {
      if (ov.banner && ov.banner.kind === "prayer") setCard(null);
    });
  }

  updateOvStatus();
})();
