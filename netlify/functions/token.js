/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Netlify function: /api/token
   ------------------------------------------------------------
   Creates Daily rooms (if needed) and mints meeting tokens via
   the Daily REST API.

   - Owner tokens for the host (requires the HOST_KEY passphrase)
   - Standard join tokens for participants
   - The Daily API key lives ONLY in the Netlify environment
     variable DAILY_API_KEY. It never reaches the browser.

   Environment variables (set in Netlify → Environment variables):
     DAILY_API_KEY  — from dashboard.daily.co → Developers
     HOST_KEY       — any passphrase you choose; the host page
                      asks for it before issuing an owner token
   ============================================================ */

"use strict";

const crypto = require("crypto");

const DAILY_API = "https://api.daily.co/v1";
const TOKEN_TTL_SECONDS = 6 * 60 * 60; // tokens valid 6 hours — covers pre-program + service
const DEFAULT_ROOM = "sanctuary";

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
    enable_knocking: false,       // token holders come straight in
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

  const role = body.role === "host" ? "host" : "participant";

  const name = String(body.name || "").trim().slice(0, 40);
  if (!name) {
    return json(400, { error: "A display name is required." });
  }

  const room = cleanRoomName(body.room) || DEFAULT_ROOM;

  // Host role is guarded by HOST_KEY — owner tokens are powerful.
  if (role === "host") {
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

  try {
    const roomInfo = await ensureRoom(apiKey, room);
    const token = await mintToken(apiKey, {
      room_name: roomInfo.name,
      user_name: name,
      is_owner: role === "host",
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    });

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
  if (getRes.status === 200) return getRes.data;

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
