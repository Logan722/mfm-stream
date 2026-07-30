/* ============================================================
   MFM Mega Region 2 USA — Live Platform
   Diagnostic endpoint: GET /api/diag?k=<HOST_KEY>&room=<room>
   ------------------------------------------------------------
   Captures Daily's VERBATIM responses so overlay/layout issues
   can be diagnosed with facts instead of guesses:
     1. Domain configuration (compositor/instance flags)
     2. REST live-streaming/start with our exact custom layout,
        pointed at an unreachable RTMP endpoint (validates the
        layout server-side without a real broadcast)
     3. Best-effort stop

   Run it while IN the room but NOT broadcasting — it starts and
   stops a throwaway stream attempt on the room.
   ============================================================ */

"use strict";

const crypto = require("crypto");
const DAILY_API = "https://api.daily.co/v1";

exports.handler = async (event) => {
  const apiKey = process.env.DAILY_API_KEY;
  const hostKey = process.env.HOST_KEY;
  if (!apiKey || !hostKey) {
    return json(500, { error: "DAILY_API_KEY / HOST_KEY not configured in Netlify." });
  }

  const params = event.queryStringParameters || {};
  const room = cleanRoom(params.room) || "sanctuary";

  // Two ways in: the real host key (any room), or the investigation key,
  // which ONLY works on throwaway rooms named diag-*.
  const DIAG_KEY = "mfm-inv-x92k41-temporary";
  const k = String(params.k || "");
  const hostOk = safeEqual(k, hostKey);
  const diagOk = safeEqual(k, DIAG_KEY) && room.indexOf("diag-") === 0;
  if (!hostOk && !diagOk) {
    return json(403, { error: "Append your host key: /api/diag?k=YOUR_HOST_KEY" });
  }

  const action = String(params.action || "layout-test");
  const out = { when: new Date().toISOString(), room: room, action: action, steps: [] };

  // Layout under test — overridable pieces via query for iteration
  const layout = {
    preset: "custom",
    composition_id: "daily:baseline",
    composition_params: {
      mode: "grid",
      "videoSettings.showParticipantLabels": true,
      showBannerOverlay: true,
      "banner.title": "Diagnostic",
      "banner.subtitle": "MFM overlay test",
      showTextOverlay: true,
      "text.content": "DIAG",
    },
  };
  if (params.no_comp_id === "1") delete layout.composition_id;

  if (action === "config") {
    const dc = await daily(apiKey, "GET", "/");
    out.steps.push({ step: "domain-config", status: dc.status, body: redact(dc.data) });

  } else if (action === "layout-test") {
    const st = await daily(apiKey, "POST", "/rooms/" + encodeURIComponent(room) + "/live-streaming/start", {
      rtmpUrl: "rtmp://127.0.0.1/dead/key",
      width: 1920,
      height: 1080,
      layout: layout,
    });
    out.steps.push({ step: "start-custom-layout", sent_layout: layout, status: st.status, body: st.data });
    if (st.status === 200 || st.status === 202) {
      const sp = await daily(apiKey, "POST", "/rooms/" + encodeURIComponent(room) + "/live-streaming/stop", {});
      out.steps.push({ step: "stop", status: sp.status, body: sp.data });
    }

  } else if (action === "rec-start") {
    const rs = await daily(apiKey, "POST", "/rooms/" + encodeURIComponent(room) + "/recordings/start", {
      width: 1920,
      height: 1080,
      layout: layout,
    });
    out.steps.push({ step: "recording-start", sent_layout: layout, status: rs.status, body: rs.data });

  } else if (action === "rec-stop") {
    const rp = await daily(apiKey, "POST", "/rooms/" + encodeURIComponent(room) + "/recordings/stop", {});
    out.steps.push({ step: "recording-stop", status: rp.status, body: rp.data });

  } else if (action === "rec-link") {
    const rl = await daily(apiKey, "GET", "/recordings?limit=3");
    out.steps.push({ step: "recordings", status: rl.status, body: rl.data });
    const first = rl.data && rl.data.data && rl.data.data[0];
    if (first && first.id) {
      const al = await daily(apiKey, "GET", "/recordings/" + first.id + "/access-link");
      out.steps.push({ step: "access-link", status: al.status, body: al.data });
    }

  } else if (action === "set-legacy" || action === "unset-legacy") {
    // Domain-level change — host key required (never the investigation key)
    if (!hostOk) return json(403, { error: "Host key required for domain actions." });
    const want = action === "set-legacy";
    const res = await daily(apiKey, "POST", "/", {
      properties: { enable_legacy_compositor: want },
    });
    out.steps.push({ step: action, status: res.status, body: redact(res.data) });
    const check = await daily(apiKey, "GET", "/");
    out.steps.push({
      step: "verify",
      enable_legacy_compositor: check.data && check.data.config &&
        check.data.config.enable_legacy_compositor,
    });

  } else {
    out.steps.push({ step: "unknown-action", note: "use action=config|layout-test|rec-start|rec-stop|rec-link|set-legacy" });
  }

  return json(200, out);
};

async function daily(apiKey, method, path, payload) {
  try {
    const res = await fetch(DAILY_API + path, {
      method: method,
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    return { status: res.status, data: data };
  } catch (err) {
    return { status: 0, data: { fetch_error: String(err.message || err) } };
  }
}

function redact(obj) {
  // Drop anything that smells like a credential before echoing config back
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    if (/key|secret|token|password/i.test(k)) { out[k] = "<redacted>"; continue; }
    const v = obj[k];
    out[k] = (v && typeof v === "object") ? redact(v) : v;
  }
  return out;
}

function cleanRoom(value) {
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

function json(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj, null, 2),
  };
}
