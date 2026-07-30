/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Host console: Prebuilt video + production deck + people board
   ------------------------------------------------------------
   WYSIWYG rule: the card shown over the host's video is exactly
   what the broadcast composition shows — same content, same
   corner. Tagged LIVE when broadcasting, OFF AIR when not.

   Broadcast: two instances via Daily live streaming
     - main  16:9  (YouTube / Facebook / custom RTMP), VCS custom
     - vert  9:16  (Instagram), portrait preset — needs Daily
       support to allow a 2nd concurrent instance on the domain
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

  /* ---------- Scene: what the 16:9 broadcast shows ---------- */
  var scene = {
    card: null,       // null | { kind, title, subtitle }
    mode: "grid",     // grid | dominant | split | pip
    spot: null,       // null | session_id featured full-screen
  };
  var ppIdx = 0;

  /* ---------- Stream instances ---------- */
  var MAIN_ID = "a1a1a1a1-1111-4a11-8a11-a1a1a1a1a1a1"; // fixed UUIDs — Daily instance ids
  var VERT_ID = "b2b2b2b2-2222-4b22-8b22-b2b2b2b2b2b2";

  var bc = { live: false, starting: false, startedAt: 0, timerId: null, confirmingEnd: null };
  var vt = { live: false, starting: false, startedAt: 0, timerId: null, confirmingEnd: null };

  /* Every scene edit is instant: persist, push to the stream if live,
     and mirror on the video. What you see is what streams. */
  function applyScene() {
    persistState();
    if (bc.live) pushLayout();
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
    if (savedBc.mode) scene.mode = savedBc.mode;
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
        yt2On: els.yt2On ? els.yt2On.checked : false,
        yt2Key: els.yt2Key ? els.yt2Key.value : "",
        fbOn: els.fbOn ? els.fbOn.checked : false,
        fbKey: els.fbKey ? els.fbKey.value : "",
        customOn: els.customOn ? els.customOn.checked : false,
        customUrl: els.customUrl ? els.customUrl.value : "",
        igKey: els.igKey ? els.igKey.value : "",
        mode: scene.mode,
      }));
      localStorage.setItem(ovStoreKey, JSON.stringify({
        l3name: els.l3Name ? els.l3Name.value : "",
        l3role: els.l3Role ? els.l3Role.value : "",
        points: els.ppList ? els.ppList.value : "",
        ppIdx: ppIdx,
      }));
    } catch (e) { /* fine */ }
  }

  ["ytOn", "ytKey", "yt2On", "yt2Key", "fbOn", "fbKey", "customOn", "customUrl", "igKey", "l3Name", "l3Role", "ppList"]
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
        if (id && scene.spot === id) {
          scene.spot = null;
          applyScene();
        }
        queueRender();
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
      .on("left-meeting", endCall)
      .on("error", function (ev) {
        showError("Call error: " + ((ev && ev.errorMsg) || "unknown. Please rejoin."));
        endCall();
      });

    callFrame.join().catch(function () {
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

    params.showBannerOverlay = !!scene.card;
    if (scene.card) {
      params["banner.title"] = scene.card.title;
      params["banner.subtitle"] = scene.card.subtitle || "";
      params["banner.position"] = "bottom-left";
      params["banner.enableTransition"] = true;
      params["banner.maxW_pct_default"] = 0.65;
      params["banner.showIcon"] = false;
    }

    return params;
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

      try {
        callFrame.startLiveStreaming({
          instanceId: MAIN_ID,
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
      try { callFrame.stopLiveStreaming({ instanceId: MAIN_ID }); } catch (e) { onLiveStopped(); }
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
        instanceId: MAIN_ID,
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
    bc.timerId = setInterval(tickMain, 1000);
    tickMain();
    panelError("");
    renderScene();
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
    renderScene();
  }

  /* ---------- Vertical 9:16 (Instagram): go live / end ---------- */
  if (els.goVertBtn) {
    els.goVertBtn.addEventListener("click", function () {
      if (!callFrame) return;
      if (vt.live || vt.starting) { requestVertEnd(); return; }

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
      } else {
        els.frameGuide.hidden = true;
      }
      if (els.pvTag) {
        els.pvTag.textContent = bc.live ? "LIVE" : "ONLY YOU SEE THIS";
        els.pvTag.className = "pv-tag" + (bc.live ? " is-live" : "");
      }
    }
    setActiveModeButton(scene.mode);
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
