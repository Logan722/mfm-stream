/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Shared join logic (participant + host) · Daily Prebuilt
   ============================================================
   Each page sets window.MFM_STREAM_CONFIG = { role: "participant" | "host" }
   before loading this script.
============================================================ */

(function () {
  "use strict";

  var cfg = window.MFM_STREAM_CONFIG || { role: "participant" };
  var isHost = cfg.role === "host";

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
    meLabel: document.getElementById("me-label"),
    editNameBtn: document.getElementById("edit-name"),
    nameEdit: document.getElementById("name-edit"),
    copyLinkBtn: document.getElementById("copy-link"),
  };

  var callFrame = null;

  /* ---------- Room name: ?room=... on both pages; editable on host ---------- */
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

  /* ---------- Remember name (and host key) on this device ---------- */
  var storeKey = isHost ? "mfm-stream-host" : "mfm-stream-participant";
  try {
    var saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
    if (saved.name && els.name && !els.name.value) els.name.value = saved.name;
    if (isHost && saved.hostKey && els.hostKey) els.hostKey.value = saved.hostKey;
  } catch (e) { /* storage unavailable — fine */ }

  function remember() {
    try {
      var data = { name: els.name.value.trim() };
      if (isHost && els.hostKey) data.hostKey = els.hostKey.value;
      localStorage.setItem(storeKey, JSON.stringify(data));
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
    els.joinBtn.textContent = busy
      ? "Preparing the room…"
      : (isHost ? "Enter as Host" : "Join the Room");
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

    var payload = { role: cfg.role, name: name, room: currentRoom() };
    if (isHost) {
      payload.hostKey = els.hostKey ? els.hostKey.value : "";
      if (!payload.hostKey) { showError("Please enter the host key."); return; }
    }

    setBusy(true);

    fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        startCall(result.data, name);
      })
      .catch(function () {
        showError(
          "Could not reach the token service. Make sure you opened the live site " +
          "(the Netlify link), not a local copy of this file."
        );
        setBusy(false);
      });
  }

  /* ---------- Daily Prebuilt ---------- */
  function startCall(grant, name) {
    var Factory = window.DailyIframe || window.Daily;
    if (!Factory) {
      showError("The video library failed to load. Please refresh and try again.");
      setBusy(false);
      return;
    }

    document.body.classList.add("in-call");
    if (els.stageWrap) els.stageWrap.hidden = false;
    if (els.meLabel) els.meLabel.textContent = name;

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

    callFrame.on("left-meeting", endCall);
    callFrame.on("error", function (ev) {
      showError("Call error: " + ((ev && ev.errorMsg) || "unknown. Please rejoin."));
      endCall();
    });

    callFrame.join().catch(function () {
      showError("Could not join the room. Please try again.");
      endCall();
    });
  }

  function endCall() {
    if (callFrame) {
      try { callFrame.destroy(); } catch (e) { /* already gone */ }
      callFrame = null;
    }
    document.body.classList.remove("in-call");
    if (els.stageWrap) els.stageWrap.hidden = true;
    setBusy(false);
  }

  /* ---------- Change display name mid-call ---------- */
  if (els.editNameBtn && els.nameEdit) {
    els.editNameBtn.addEventListener("click", function () {
      els.nameEdit.style.display = "inline-block";
      els.nameEdit.value = els.meLabel ? els.meLabel.textContent : "";
      els.nameEdit.focus();
      els.editNameBtn.style.display = "none";
    });

    function applyName() {
      var v = els.nameEdit.value.trim().slice(0, 40);
      if (v && callFrame) {
        callFrame.setUserName(v);
        if (els.meLabel) els.meLabel.textContent = v;
        try {
          var data = JSON.parse(localStorage.getItem(storeKey) || "{}");
          data.name = v;
          localStorage.setItem(storeKey, JSON.stringify(data));
        } catch (e) { /* fine */ }
      }
      els.nameEdit.style.display = "none";
      els.editNameBtn.style.display = "";
    }

    els.nameEdit.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); applyName(); }
      if (e.key === "Escape") {
        els.nameEdit.style.display = "none";
        els.editNameBtn.style.display = "";
      }
    });
    els.nameEdit.addEventListener("blur", applyName);
  }

  /* ---------- Host: copy participant invite link ---------- */
  if (els.copyLinkBtn) {
    els.copyLinkBtn.addEventListener("click", function () {
      var link = window.location.origin + "/?room=" + encodeURIComponent(currentRoom());
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
})();
