/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Netlify function: /api/token
   ------------------------------------------------------------
   Creates Daily rooms (if needed) and mints meeting tokens via
   the Daily REST API.

   - Owner tokens for the host (requires the HOST_KEY passphrase)
   - Standard join tokens for participants
   - Engine tokens for the Program Engine (program.html) — the
     participant named PROGRAM that composites the broadcast
   - The Daily API key lives ONLY in the Netlify environment
     variable DAILY_API_KEY. It never reaches the browser.

   Environment variables (set in Netlify → Environment variables):
     DAILY_API_KEY  — from dashboard.daily.co → Developers
     HOST_KEY       — any passphrase you choose; the host page
                      asks for it before issuing an owner token
     ENGINE_KEY     — optional; a separate passphrase for the
                      engine page. Falls back to HOST_KEY if unset.

   Echo/visibility design (Program Engine):
   - The engine's mic is the broadcast MIX of everyone's audio.
     Nobody in the room may ever hear it (echo).
   - Host / engine / monitor hold tokens, so their canReceive rules
     are minted here (hosts get PROGRAM's video only — a confidence
     monitor — never its audio).
   - Participants (ministers) now hold NO token so they land in the
     waiting room (Aug 2026). A token would auto-admit them and skip
     the wait. Losing the token means losing its canReceive block, so
     the host re-applies it the instant it admits each minister —
     see applyEngineReceive() in console.js. Only an admin may set a
     participant's canReceive, which is exactly what the host is.
   ============================================================ */

"use strict";

const crypto = require("crypto");

const DAILY_API = "https://api.daily.co/v1";
const TOKEN_TTL_SECONDS = 6 * 60 * 60; // tokens valid 6 hours — covers pre-program + service
const ENGINE_TTL_SECONDS = 12 * 60 * 60; // engine runs longer (pre-checks + service + margin)
const DEFAULT_ROOM = "sanctuary";

// The Program Engine's fixed identity. The console finds the engine by this
// user_id; canReceive rules reference it; the display name is reserved.
const ENGINE_USER_ID = "mfm-program-engine";
const ENGINE_NAME = "PROGRAM";

// Rooms are private: nobody gets in without a token minted here.
const ROOM_PROPERTIES = {
  privacy: "private",
  properties: {
    enable_chat: true,
    enable_screenshare: true,
    enable_prejoin_ui: true,      // camera/mic preview before entering
    enable_people_ui: true,
    enable_emoji_reactions: true,
    enable_hand_raising: true,
    enable_knocking: true,        // waiting room: tokenless ministers knock,
                                  // the host admits them from the People board.
                                  // (Token holders — host/engine/monitor — still
                                  // bypass the wait; that's why participants are
                                  // now issued NO token — see the handler below.)
    start_video_off: false,
    start_audio_off: false,
  },
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST only." });
  }

  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "The streaming service isn't configured yet: DAILY_API_KEY is not set in Netlify environment variables.",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Invalid request body." });
  }

  const role =
    body.role === "host" ? "host" :
    body.role === "engine" ? "engine" :
    body.role === "monitor" ? "monitor" :
    body.role === "warden" ? "warden" :
    "participant";

  const name =
    role === "engine" ? ENGINE_NAME :
    role === "monitor" ? "MONITOR" :
    role === "warden" ? "WARDEN" :
    String(body.name || "").trim().slice(0, 40);
  if (!name) {
    return json(400, { error: "A display name is required." });
  }

  // The engine's name is reserved — nobody else may impersonate PROGRAM.
  if (role !== "engine" && name.toUpperCase() === ENGINE_NAME) {
    return json(400, { error: "That name is reserved for the broadcast engine. Please pick another." });
  }

  const room = cleanRoomName(body.room) || DEFAULT_ROOM;

  // Host, monitor and warden roles are guarded by HOST_KEY. (Monitor = the
  // console's preview/program window; warden = the console's hidden lobby
  // admitter — an owner that admits knockers, which Prebuilt can't do itself.)
  if (role === "host" || role === "monitor" || role === "warden") {
    const hostKey = process.env.HOST_KEY;
    if (!hostKey) {
      return json(500, {
        error: "Host access isn't configured yet: HOST_KEY is not set in Netlify environment variables.",
      });
    }
    if (!safeEqual(String(body.hostKey || ""), hostKey)) {
      return json(403, { error: "Host key incorrect." });
    }
  }

  // Engine role is guarded by ENGINE_KEY (or HOST_KEY until one is set).
  if (role === "engine") {
    const engineKey = process.env.ENGINE_KEY || process.env.HOST_KEY;
    if (!engineKey) {
      return json(500, {
        error: "Engine access isn't configured yet: set ENGINE_KEY (or HOST_KEY) in Netlify environment variables.",
      });
    }
    if (!safeEqual(String(body.engineKey || ""), engineKey)) {
      return json(403, { error: "Engine key incorrect." });
    }
  }

  try {
    const roomInfo = await ensureRoom(apiKey, room);

    // Participants get NO token on purpose. A private room admits token holders
    // straight through, so to place ministers in the waiting room they must join
    // tokenless and knock (join.js passes the name via join({ userName })). The
    // echo-prevention the token used to carry (block PROGRAM's mixed mic) is
    // re-applied by the host the moment it admits them — the host is a meeting
    // admin, and only an admin may change a participant's canReceive. See
    // applyEngineReceive() in console.js.
    if (role === "participant") {
      return json(200, {
        token: null,
        url: roomInfo.url,
        room: roomInfo.name,
        role: role,
        knock: true,
      });
    }

    const token = await mintTokenForRole(apiKey, role, roomInfo.name, name, body.hidden);

    return json(200, {
      token: token,
      url: roomInfo.url,
      room: roomInfo.name,
      role: role,
    });
  } catch (err) {
    console.error("token function error:", err);
    return json(502, {
      error: "Could not prepare the room. Please try again in a moment.",
      detail: String(err.message || err).slice(0, 300),
    });
  }
};

/* ---------- Daily REST helpers ---------- */

async function ensureRoom(apiKey, roomName) {
  // Does the room already exist?
  const getRes = await daily(apiKey, "GET", "/rooms/" + encodeURIComponent(roomName));
  if (getRes.status === 200) {
    // Rooms created before the waiting room existed have knocking OFF. Turn it
    // on in place so ministers can knock. Harmless when it's already enabled.
    // If the update fails we proceed with the room as-is: host/engine/monitor
    // (token holders) still get in, but tokenless ministers would be refused
    // by Daily until knocking is on — rare, since the same key just read it.
    const cfg = getRes.data && getRes.data.config;
    if (!cfg || cfg.enable_knocking !== true) {
      const upd = await daily(apiKey, "POST", "/rooms/" + encodeURIComponent(roomName), {
        properties: { enable_knocking: true },
      });
      if (upd.status === 200) return upd.data;
    }
    return getRes.data;
  }

  if (getRes.status !== 404) {
    throw new Error("Daily rooms lookup failed (" + getRes.status + "): " + summarize(getRes.data));
  }

  // Create it.
  const createRes = await daily(apiKey, "POST", "/rooms", {
    name: roomName,
    ...ROOM_PROPERTIES,
  });
  if (createRes.status !== 200) {
    throw new Error("Daily room create failed (" + createRes.status + "): " + summarize(createRes.data));
  }
  return createRes.data;
}

/* Mint a token for a role, with the canReceive rules that keep the
   Program Engine's mixed audio out of everyone's ears (echo prevention):
   - engine:       identity token (PROGRAM, fixed user_id), receives everything
   - host:         sees PROGRAM's video (confidence monitor) but never hears it
   - participant:  neither sees nor hears PROGRAM (Dawn's choice, July 2026)
   If Daily ever rejects the permissions shape, fall back to a plain token so
   joining is never blocked — the console also enforces its own rules live. */
async function mintTokenForRole(apiKey, role, roomName, userName, hidden) {
  const exp = Math.floor(Date.now() / 1000) +
    (role === "engine" ? ENGINE_TTL_SECONDS : TOKEN_TTL_SECONDS);

  const base = {
    room_name: roomName,
    user_name: userName,
    is_owner: role === "host",
    exp: exp,
  };

  if (role === "engine") {
    const props = { ...base, user_id: ENGINE_USER_ID };
    if (hidden === true || hidden === "1" || hidden === 1) {
      // Invisible engine: no tile for anyone. Falls back to visible if
      // Daily rejects the permission — joining is never blocked.
      try {
        return await mintToken(apiKey, { ...props, permissions: { hasPresence: false } });
      } catch (err) {
        console.error("hidden engine mint failed — visible fallback:", err);
      }
    }
    return mintToken(apiKey, props);
  }

  if (role === "monitor") {
    // Receives nothing but the engine's camera (program) + screen (preview);
    // publishes nothing at all.
    const onlyEngine = {};
    onlyEngine[ENGINE_USER_ID] = { video: true, screenVideo: true, audio: false, screenAudio: false };
    try {
      return await mintToken(apiKey, {
        ...base,
        user_id: "mfm-monitor",
        permissions: { hasPresence: false, canReceive: { base: false, byUserId: onlyEngine } },
      });
    } catch (err) {
      console.error("monitor mint with canReceive failed — retrying plain:", err);
      return mintToken(apiKey, { ...base, user_id: "mfm-monitor" });
    }
  }

  if (role === "warden") {
    // The console's hidden lobby admitter. It must be an OWNER so it may admit
    // knockers (updateWaitingParticipant is owner-only AND unavailable in Daily
    // Prebuilt — hence this separate call-object connection). Presence-hidden so
    // ministers never see a tile; receives no media (control only). If Daily
    // rejects the hidden permission, fall back to a visible owner — an inert
    // tile is better than losing admit control.
    const wbase = { ...base, is_owner: true, user_id: "mfm-warden" };
    try {
      return await mintToken(apiKey, {
        ...wbase,
        permissions: { hasPresence: false, canReceive: { base: false } },
      });
    } catch (err) {
      console.error("warden hidden mint failed — visible owner fallback:", err);
      return mintToken(apiKey, wbase);
    }
  }

  const blockEngine = {};
  blockEngine[ENGINE_USER_ID] = role === "host"
    ? { video: true, screenVideo: true, audio: false, screenAudio: false }
    : false; // participants: no media from PROGRAM at all

  try {
    return await mintToken(apiKey, {
      ...base,
      permissions: { canReceive: { base: true, byUserId: blockEngine } },
    });
  } catch (err) {
    console.error("token mint with canReceive failed — retrying plain:", err);
    return mintToken(apiKey, base);
  }
}

async function mintToken(apiKey, properties) {
  const res = await daily(apiKey, "POST", "/meeting-tokens", { properties: properties });
  if (res.status !== 200 || !res.data.token) {
    throw new Error("Daily token mint failed (" + res.status + "): " + summarize(res.data));
  }
  return res.data.token;
}

async function daily(apiKey, method, path, payload) {
  const res = await fetch(DAILY_API + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) { /* non-JSON response */ }
  return { status: res.status, data: data };
}

/* ---------- Utilities ---------- */

function cleanRoomName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function summarize(data) {
  try {
    return JSON.stringify(data).slice(0, 200);
  } catch (e) {
    return "unreadable error body";
  }
}

function json(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
