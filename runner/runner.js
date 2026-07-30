/* ============================================================
   MFM Mega Region 2 USA — Cloud Engine Runner (E2)
   ------------------------------------------------------------
   Runs the Program Engine (program.html) in a real Chromium
   window on a virtual display (Xvfb), watches it like a hawk,
   and — when the console asks — pushes the broadcast to RTMP
   destinations with FFmpeg (x11grab video + Pulse audio).

   Control path (no new auth surface):
     console → Daily app-message {cmd:"rtmp"} → engine page
             → window.__mfmRunner (exposed here) → FFmpeg

   State path back:
     FFmpeg start/exit → page.evaluate(__mfmRunnerEvent)
             → engine heartbeats → console Engine panel

   Environment (.env via docker-compose):
     SITE_URL     e.g. https://streamr2.netlify.app
     ROOM         e.g. sanctuary
     ENGINE_KEY   the engine passphrase (ENGINE_KEY or HOST_KEY)
     HEALTH_PORT  default 8080 — GET /health returns JSON
   ============================================================ */

"use strict";

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");

const SITE = required("SITE_URL");
const ROOM = process.env.ROOM || "sanctuary";
const KEY = required("ENGINE_KEY");
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8080);
const DISPLAY = process.env.DISPLAY || ":99";

const W = 1920, H = 1080, FPS = 30;
const WATCH_EVERY_MS = 20000;
const FFMPEG_RETRIES = 3;

let browser = null;
let page = null;
let ffmpeg = null;
let ffmpegInfo = { running: false, startedAt: 0, detail: "" };
let lastUrls = null;          // for auto-retry after an unexpected exit
let ffmpegRetriesLeft = 0;
let intentionalStop = false;
let lastAlive = -1;
let stalledChecks = 0;
let notJoinedChecks = 0;
let browserRestarts = 0;
let shuttingDown = false;

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[runner] Missing required environment variable ${name} — set it in .env`);
    process.exit(1);
  }
  return v;
}

function log(...args) {
  console.log(`[runner ${new Date().toISOString()}]`, ...args);
}

function engineUrl() {
  return (
    SITE.replace(/\/+$/, "") +
    "/program.html?room=" + encodeURIComponent(ROOM) +
    "&key=" + encodeURIComponent(KEY) +
    "&autostart=1&capture=1&monitor=1&runner=cloud"
  );
}

/* ---------------- Browser ---------------- */

async function launchBrowser() {
  log("launching Chromium on display", DISPLAY);
  browser = await chromium.launch({
    headless: false, // real window on Xvfb — FFmpeg captures the display
    args: [
      "--no-sandbox",
      "--kiosk",
      "--window-position=0,0",
      `--window-size=${W},${H}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-infobars",
      "--hide-scrollbars",
    ],
  });

  page = await browser.newPage({ viewport: null });

  await page.exposeFunction("__mfmRunner", (cmdJson) => {
    try {
      handleCommand(JSON.parse(cmdJson));
    } catch (e) {
      log("bad command from page:", e.message);
    }
  });

  page.on("crash", () => {
    log("PAGE CRASHED");
    restartBrowser("page crashed");
  });
  page.on("pageerror", (e) => log("pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") log("page console.error:", m.text());
  });

  await page.goto(engineUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
  log("engine page loaded:", SITE + "/program.html (room " + ROOM + ")");
  lastAlive = -1;
  stalledChecks = 0;
  notJoinedChecks = 0;
}

async function restartBrowser(reason) {
  if (shuttingDown) return;
  log("RESTARTING BROWSER —", reason,
    ffmpegInfo.running ? "(FFmpeg keeps pushing so the stream shows a freeze, not a drop)" : "");
  browserRestarts++;
  try { if (browser) await browser.close(); } catch (e) { /* already gone */ }
  browser = null;
  page = null;
  await sleep(2000);
  try {
    await launchBrowser();
  } catch (e) {
    log("relaunch failed:", e.message, "— retrying in 10s");
    await sleep(10000);
    return restartBrowser("relaunch failed");
  }
}

/* ---------------- FFmpeg ---------------- */

function handleCommand(cmd) {
  if (!cmd || typeof cmd !== "object") return;
  if (cmd.action === "start") {
    const urls = (Array.isArray(cmd.urls) ? cmd.urls : [])
      .map(String)
      .filter((u) => /^rtmps?:\/\/\S+$/i.test(u));
    if (!urls.length) {
      log("rtmp start requested with no valid urls");
      pushFfmpegState("no valid RTMP destinations received");
      return;
    }
    lastUrls = urls;
    ffmpegRetriesLeft = FFMPEG_RETRIES;
    intentionalStop = false;
    startFfmpeg(urls);
  } else if (cmd.action === "stop") {
    intentionalStop = true;
    stopFfmpeg("stopped from the console");
  }
}

function startFfmpeg(urls) {
  if (ffmpeg) stopFfmpeg("replacing stream");

  const tee = urls.map((u) => `[f=flv:onfail=ignore]${u}`).join("|");
  const args = [
    "-hide_banner", "-loglevel", "warning",
    // Video: grab the Xvfb display (the engine canvas fills it exactly)
    "-f", "x11grab", "-draw_mouse", "0",
    "-framerate", String(FPS), "-video_size", `${W}x${H}`, "-i", DISPLAY,
    // Audio: the Pulse null sink the engine plays its mix into
    "-f", "pulse", "-i", "broadcast.monitor",
    // Encode once, push everywhere
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-b:v", "5000k", "-maxrate", "5500k", "-bufsize", "10000k",
    "-pix_fmt", "yuv420p", "-g", String(FPS * 2), "-keyint_min", String(FPS),
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-map", "0:v", "-map", "1:a",
    "-f", "tee", tee,
  ];

  log("starting FFmpeg →", urls.length, "destination(s)");
  ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  ffmpegInfo = {
    running: true,
    startedAt: Date.now(),
    detail: urls.length + " destination(s)",
  };
  pushFfmpegState();

  ffmpeg.stderr.on("data", (d) => {
    const line = String(d).trim();
    if (line) log("ffmpeg:", line.slice(0, 300));
  });

  ffmpeg.on("exit", (code, signal) => {
    const wasRunning = ffmpegInfo.running;
    ffmpeg = null;
    ffmpegInfo = {
      running: false,
      startedAt: 0,
      detail: intentionalStop || code === 0 || signal
        ? ""
        : "ffmpeg exited with code " + code,
    };
    log("FFmpeg exited", { code, signal, intentionalStop });
    pushFfmpegState();

    // Unexpected death while we should be live → retry
    if (wasRunning && !intentionalStop && !shuttingDown &&
        code !== 0 && lastUrls && ffmpegRetriesLeft > 0) {
      ffmpegRetriesLeft--;
      log("retrying FFmpeg in 3s —", ffmpegRetriesLeft, "retries left");
      setTimeout(() => {
        if (!ffmpeg && !intentionalStop && !shuttingDown) startFfmpeg(lastUrls);
      }, 3000);
    }
  });
}

function stopFfmpeg(reason) {
  if (!ffmpeg) return;
  log("stopping FFmpeg —", reason);
  try { ffmpeg.kill("SIGINT"); } catch (e) { /* already dead */ }
  // SIGKILL safety if it lingers
  const f = ffmpeg;
  setTimeout(() => { try { f && f.kill("SIGKILL"); } catch (e) { /* fine */ } }, 5000);
}

async function pushFfmpegState(extraDetail) {
  if (extraDetail) ffmpegInfo.detail = extraDetail;
  if (!page) return;
  try {
    await page.evaluate((st) => {
      if (window.__mfmRunnerEvent) window.__mfmRunnerEvent(st);
    }, { ffmpeg: ffmpegInfo });
  } catch (e) {
    log("could not push state to page:", e.message);
  }
}

/* ---------------- Watchdog ---------------- */

async function watchdog() {
  if (shuttingDown || !page) return;
  let info = null;
  try {
    info = await page.evaluate(() => window.__MFM || null);
  } catch (e) {
    log("watchdog: page unreachable —", e.message);
    return restartBrowser("page unreachable");
  }

  if (!info) {
    // Page loaded but the engine never started its loop (join form showing?)
    notJoinedChecks++;
    if (notJoinedChecks >= 3) {
      notJoinedChecks = 0;
      log("watchdog: engine never started — reloading page");
      try { await page.reload({ waitUntil: "domcontentloaded" }); } catch (e) { return restartBrowser("reload failed"); }
    }
    return;
  }

  if (info.alive === lastAlive) {
    stalledChecks++;
    log("watchdog: draw loop hasn't advanced (" + stalledChecks + "/3)");
    if (stalledChecks >= 3) return restartBrowser("draw loop stalled");
  } else {
    stalledChecks = 0;
  }
  lastAlive = info.alive;

  if (info.joined === false) {
    notJoinedChecks++;
    log("watchdog: engine not in the room (" + notJoinedChecks + "/3)");
    if (notJoinedChecks >= 3) {
      notJoinedChecks = 0;
      log("watchdog: reloading page to rejoin");
      try { await page.reload({ waitUntil: "domcontentloaded" }); } catch (e) { return restartBrowser("reload failed"); }
    }
  } else {
    notJoinedChecks = 0;
  }
}

/* ---------------- Health endpoint ---------------- */

const startedAt = Date.now();
http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      room: ROOM,
      pageAliveCounter: lastAlive,
      browserRestarts: browserRestarts,
      ffmpeg: ffmpegInfo,
    }, null, 2));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(HEALTH_PORT, () => log("health endpoint on :" + HEALTH_PORT + "/health"));

/* ---------------- Lifecycle ---------------- */

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function shutdown(sig) {
  log("shutting down (" + sig + ")");
  shuttingDown = true;
  intentionalStop = true;
  stopFfmpeg("shutdown");
  try { if (browser) await browser.close(); } catch (e) { /* fine */ }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log("unhandledRejection:", e && e.message));

(async () => {
  await launchBrowser();
  setInterval(watchdog, WATCH_EVERY_MS);
})().catch((e) => {
  log("fatal:", e.message);
  process.exit(1);
});
