// =====================================================================
//  VIEWER (phone inside the headset)
//  Camera -> defect mask & filters -> 3D model layer -> barrel distortion -> two eyes.
// =====================================================================
import * as THREE from "three";
import { DB, STATION, TIMING, DEFAULT_CALIBRATION, HAND_HOLD_TIME, DEFAULT_HOTSPOTS } from "./config.js";
import { LANGUAGES, T, tr } from "./translations.js";
import { paintField, filtersAt, ALL_CONDITIONS } from "./defects.js";
import { isFullscreen, enterFullscreen, keepFullscreen } from "./fullscreen.js";
import { ARScene } from "./ar-scene.js";
import { HandTracker } from "./hands.js";

const $ = id => document.getElementById(id);
const canvas = $("gl");
const MASK_EXTENT = 1.5;   // mask texture covers field coords -1.5 … +1.5
const MASK_SIZE = 256;     // pixels per eye in the mask texture
const OV_EXTENT = 1.45;    // 3D layer covers field coords -1.45 … +1.45 (whole rounded eye shape)
const OV_SIZE = 640;       // pixels per eye for the 3D layer

let fb = null;
let calib = loadCachedCalib();
let started = false;
let running = null;        // { cond, lang, t0 }
let lastCmdTs = 0;
let camOk = false, netOk = false, everConnected = false;
let video = null, stream = null;
let exploreLang = "en";

document.querySelector("#startScreen h1").textContent = `Eye Exhibit – Headset · Station ${STATION}`;

// ---------------------------------------------------------------- text
$("waitL").innerHTML = $("waitR").innerHTML =
  LANGUAGES.map(l => `<span lang="${l.code}">${T[l.code].pleaseWait}</span>`).join("");

const ERR = {
  camera: "Camera not available.\nPlease allow camera access.",
  network: "No internet connection.\nReconnecting…",
  firebase: "Cannot reach the server.\nCheck the internet and reload."
};
let errState = null;
function showError(kind) {
  errState = kind;
  for (const id of ["errL", "errR"]) {
    $(id).textContent = kind ? ERR[kind] : "";
    $(id).style.whiteSpace = "pre-line";
    $(id).classList.toggle("on", !!kind);
  }
  if (!started && kind) { $("startStatus").textContent = ERR[kind].replace("\n", " "); $("startStatus").className = "bad"; }
  updateOverlay();
}

// ---------------------------------------------------------------- Firebase
let pushStatus = () => {};
(async () => {
  try {
    fb = await import("./fb.js");
  } catch (e) {
    console.error(e);
    showError("firebase");
    $("startBtn").disabled = false; // still allow camera-only use
    return;
  }
  $("startBtn").disabled = false;
  $("startStatus").textContent = "Ready";
  const presenceRef = fb.ref(fb.db, DB.presence);
  const beat = () => fb.set(presenceRef, {
    lastSeen: fb.serverTimestamp(), started, state: running ? running.cond : "waiting",
    camera: camInfo && { ...camInfo, received: video ? `${video.videoWidth}x${video.videoHeight}` : "" },
    screen: { width: canvas.width, height: canvas.height, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100, fps: Math.round(fps) }
  }).catch(() => {});
  let netTimer = null;
  fb.watchConnection(on => {
    netOk = on;
    if (on) {
      everConnected = true;
      clearTimeout(netTimer);
      if (errState === "network" || errState === "firebase") showError(camOk || !started ? null : "camera");
      fb.onDisconnect(presenceRef).remove();
      beat();
      if (!started) { $("startStatus").textContent = "Connected – ready"; $("startStatus").className = ""; }
    } else {
      clearTimeout(netTimer);
      netTimer = setTimeout(() => { if (!netOk) showError("network"); }, everConnected ? 4000 : 8000);
    }
  });
  setInterval(beat, 5000);
  window.addEventListener("online", beat);

  // what the visitor is doing in the 3D view -> tablet mirror (throttled)
  const exploreRef = fb.ref(fb.db, DB.explore);
  let pending = null, timer = null;
  pushStatus = s => {
    pending = s;
    if (timer) return;
    timer = setTimeout(() => { timer = null; fb.set(exploreRef, { ...pending, ts: fb.serverTimestamp() }).catch(() => {}); }, 150);
  };
  fb.onDisconnect(exploreRef).remove();

  fb.onValue(fb.ref(fb.db, DB.mirror), s => { mirrorState = s.val(); mirrorDirty = true; updateOverlay(); });
  fb.onValue(fb.ref(fb.db, DB.hotspots), s => {
    const v = s.val() || {};
    for (const kind of ["eye", "pathway"]) for (const id in DEFAULT_HOTSPOTS[kind])
      hotspots[kind][id] = { ...DEFAULT_HOTSPOTS[kind][id], ...((v[kind] && v[kind][id]) || {}) };
    mirrorDirty = true;
  });
  fb.onValue(fb.ref(fb.db, DB.calibLive), s => {
    const v = s.val();
    if (v) { calib = { ...DEFAULT_CALIBRATION, ...v }; try { localStorage.setItem("calib-" + STATION, JSON.stringify(calib)); } catch (e) {} }
    applySettings();
  });
  fb.onValue(fb.ref(fb.db, DB.command), s => {
    const v = s.val();
    if (!v || !v.timestamp) return;
    if (v.timestamp === lastCmdTs) return;
    const age = fb.serverNow() - v.timestamp;
    lastCmdTs = v.timestamp;
    if (age > 10000) return;            // old command left over in the database
    if (!started) return;
    handleCommand(v);
    beat();
  });
})();

function loadCachedCalib() {
  try { return { ...DEFAULT_CALIBRATION, ...JSON.parse(localStorage.getItem("calib-" + STATION) || "{}") }; }
  catch (e) { return { ...DEFAULT_CALIBRATION }; }
}

// ---------------------------------------------------------------- commands from the tablet
function handleCommand(v) {
  if (v.language) exploreLang = v.language;
  if (v.mode === "explore") { if (ar) { ar.start(exploreLang); handBlocked = false; exploreT0 = performance.now(); } updateOverlay(); return; }
  if (v.mode === "idle") { if (ar) ar.stop(); updateOverlay(); return; }
  if (v.action === "recentre") { if (ar) ar.recentre(); return; }
  if (v.action === "eyeHome") {
    if (ar) { if (ar.active) ar.goEye(); else { ar.start(exploreLang); exploreT0 = performance.now(); } }
    updateOverlay(); return;
  }
  if (v.condition && ALL_CONDITIONS.includes(v.condition)) {
    if (ar && ar.active) ar.runCondition(v.condition);     // model fades out, then the effect
    else if (!running) startEffect(v.condition, v.language || "en");
  }
}

// ---------------------------------------------------------------- effects
let nameTimer = null;
let effectStartMs = 0;
function startEffect(cond, lang) {
  running = { cond, lang, t0: performance.now() };
  effectStartMs = fb ? fb.serverNow() : Date.now();
  const name = tr(lang, `conditions.${cond}.name`);
  for (const id of ["nameL", "nameR"]) { $(id).textContent = name; $(id).lang = lang; $(id).classList.add("on"); }
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => { for (const id of ["nameL", "nameR"]) $(id).classList.remove("on"); }, TIMING.nameShow * 1000);
  updateOverlay();
}
function updateOverlay() {
  const waiting = started && !running && !errState && !(ar && ar.active) && !mirrorShown;
  $("waitL").classList.toggle("hidden", !waiting);
  $("waitR").classList.toggle("hidden", !waiting);
}

// ---------------------------------------------------------------- Start button
$("startBtn").addEventListener("click", async () => {
  $("startBtn").disabled = true;
  await enterFullscreen();     // works straight away if the camera was allowed before
  requestWakeLock();
  // iPhone/iPad ask for motion-sensor permission; Android does not
  try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch (e) {}
  await startCamera();         // the camera question may take the page out of full screen
  started = true;
  $("startScreen").style.display = "none";
  await initRenderer();
  layoutText();
  updateOverlay();
  updateFsPrompt();
  requestAnimationFrame(loop);
});

// If full screen was lost (e.g. by the camera question), ask for one more tap.
keepFullscreen();
function updateFsPrompt() {
  $("fsPrompt").classList.toggle("on", started && !isFullscreen());
}
for (const ev of ["fullscreenchange", "webkitfullscreenchange", "resize"]) {
  document.addEventListener(ev, () => { updateFsPrompt(); if (isFullscreen()) requestWakeLock(); });
  window.addEventListener(ev, updateFsPrompt);
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (e) { console.warn("Wake lock failed", e); }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && started) {
    requestWakeLock();
    if (!camOk) startCamera();
  }
});

// Ask for the best rear-camera picture: 1920×1080, then 1280×720, at 30 fps.
const CAMERA_TRIES = [
  { width: { ideal: 1920 }, height: { ideal: 1080 } },
  { width: { ideal: 1280 }, height: { ideal: 720 } },
  {}
];
let camInfo = null;   // what the phone actually gave us (shown on the tablet's calibration panel)
async function openCamera() {
  let last = null;
  for (const size of CAMERA_TRIES) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, frameRate: { ideal: 30 }, ...size }
      });
    } catch (e) {
      last = e;
      if (e.name === "NotAllowedError" || e.name === "SecurityError") throw e;   // permission refused: stop
    }
  }
  throw last;
}
async function tuneCamera(track) {
  // if the phone picked a small size, ask once more for at least 1280×720
  let st = track.getSettings ? track.getSettings() : {};
  if (st.width && st.width < 1280) {
    try { await track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }); } catch (e) {}
    try { await track.applyConstraints({ width: { min: 1280 }, height: { min: 720 } }); } catch (e) {}
  }
  // continuous autofocus / exposure / white balance where the browser supports it
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const adv = {};
  for (const k of ["focusMode", "exposureMode", "whiteBalanceMode"])
    if (caps[k] && caps[k].includes("continuous")) adv[k] = "continuous";
  let auto = [];
  if (Object.keys(adv).length) {
    try { await track.applyConstraints({ advanced: [adv] }); auto = Object.keys(adv); } catch (e) { console.warn("Auto focus/exposure not applied", e); }
  }
  st = track.getSettings ? track.getSettings() : {};
  camInfo = {
    width: st.width || 0, height: st.height || 0, fps: Math.round(st.frameRate || 0),
    autofocus: auto.includes("focusMode") ? "on" : (caps.focusMode ? "not continuous" : "not supported"),
    autoexposure: auto.includes("exposureMode") ? "on" : (caps.exposureMode ? "not continuous" : "not supported")
  };
  console.info("Camera:", camInfo);
}

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await openCamera();
    await tuneCamera(stream.getVideoTracks()[0]);
    if (!video) {
      video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.setAttribute("playsinline", "");
    }
    video.srcObject = stream;
    await video.play();
    camOk = true;
    if (errState === "camera") showError(netOk || !fb ? null : "network");
    stream.getVideoTracks()[0].addEventListener("ended", () => { camOk = false; showError("camera"); retryCamera(); });
  } catch (e) {
    console.error("Camera error", e);
    camOk = false;
    showError("camera");
    retryCamera();
  }
}
let camRetry = null;
function retryCamera() { clearTimeout(camRetry); camRetry = setTimeout(() => { if (!camOk) startCamera(); }, 4000); }

// ---------------------------------------------------------------- MIRROR: show what the tablet shows
// The tablet's videos (silent here – the sound comes from the tablet) and pictures float in front of
// the visitor, with the part someone touched on the tablet lit up and named.
let mirrorState = null, mirrorDirty = true, mirrorShown = false;
const hotspots = JSON.parse(JSON.stringify(DEFAULT_HOTSPOTS));
let mVideo = null, mVideoTex = null, mLastSync = 0, mSeek = null;
const stillCache = {};
const overCanvas = document.createElement("canvas");
overCanvas.width = 1280; overCanvas.height = 720;
const overCtx = overCanvas.getContext("2d");
let overTex = null, overDrawn = "";

function mirrorVideoEl() {
  if (!mVideo) {
    mVideo = document.createElement("video");
    mVideo.muted = true; mVideo.playsInline = true; mVideo.setAttribute("playsinline", ""); mVideo.preload = "auto";
    mVideo.crossOrigin = "anonymous";
  }
  return mVideo;
}
function stillTexture(src) {
  if (!stillCache[src]) {
    const t = new THREE.TextureLoader().load(src, () => { mirrorDirty = true; });
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    stillCache[src] = t;
  }
  return stillCache[src];
}
function drawOverlay(aspect, m, now) {
  const W = 1280, H = Math.round(W / aspect);
  if (overCanvas.height !== H) overCanvas.height = H;
  const c = overCtx;
  c.clearRect(0, 0, W, H);
  if (!m || !(m.highlight || m.caption || m.lesion)) return;
  const pulse = 0.6 + 0.4 * Math.sin(now / 160);
  const spot = m.highlight && hotspots[m.kind] && hotspots[m.kind][m.highlight];
  if (spot) {
    const x = spot.x / 100 * W, y = spot.y / 100 * H, r = Math.max(14, spot.r / 100 * W);
    const red = m.lesion === m.highlight;
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, red ? `rgba(255,50,50,${0.85 * pulse})` : `rgba(255,181,71,${0.5 * pulse})`);
    g.addColorStop(0.45, red ? `rgba(255,30,30,${0.45 * pulse})` : `rgba(255,181,71,${0.22 * pulse})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    c.lineWidth = 5; c.strokeStyle = red ? "rgba(255,80,80,0.95)" : "rgba(255,190,90,0.95)";
    c.beginPath(); c.arc(x, y, r * (1 + 0.08 * pulse), 0, Math.PI * 2); c.stroke();
    // name tag next to the part
    const name = tr(m.lang || "en", `hotspots.${m.highlight}`);
    c.font = `700 30px "Noto Sans","Noto Sans Tamil","Noto Sans Sinhala",sans-serif`;
    const tw = c.measureText(name).width + 28, tx = Math.min(W - tw - 8, Math.max(8, x - tw / 2)), ty = Math.max(8, y - r - 58);
    c.fillStyle = "rgba(5,12,31,0.85)"; c.beginPath(); c.roundRect(tx, ty, tw, 44, 22); c.fill();
    c.fillStyle = "#ffcf7a"; c.textBaseline = "middle"; c.textAlign = "left"; c.fillText(name, tx + 14, ty + 23);
  }
  if (m.caption && (m.caption.title || m.caption.line)) {
    const bh = 118;
    c.fillStyle = "rgba(5,12,31,0.86)"; c.fillRect(0, H - bh, W, bh);
    c.textAlign = "center"; c.textBaseline = "middle";
    const fit = (text, px, weight) => { let f = px; do { c.font = `${weight} ${f}px "Noto Sans","Noto Sans Tamil","Noto Sans Sinhala",sans-serif`; f -= 2; } while (c.measureText(text).width > W - 60 && f > 14); };
    if (m.caption.title) { fit(m.caption.title, 42, 700); c.fillStyle = "#ffb547"; c.fillText(m.caption.title, W / 2, H - bh + 38); }
    if (m.caption.line) { fit(m.caption.line, 28, 400); c.fillStyle = "#f3f1ea"; c.fillText(m.caption.line, W / 2, H - bh + 86); }
  }
}
function updateMirror(now) {
  const m = mirrorState;
  const isVideo = m && (m.screen === "eyeVideo" || m.screen === "pathVideo") && m.src;
  const isStill = m && (m.screen === "eyeStill" || m.screen === "pathStill") && m.still;
  const want = calib.mirrorScreen !== "off" && started && !running && !(ar && ar.active) && (isVideo || isStill);
  if (!ar) return;
  if (!want) {
    if (mirrorShown) { ar.hideScreen(); mirrorShown = false; updateOverlay(); }
    if (mVideo && !mVideo.paused && !isVideo) mVideo.pause();
    return;
  }
  if (!overTex) { overTex = new THREE.CanvasTexture(overCanvas); overTex.minFilter = THREE.LinearFilter; overTex.generateMipmaps = false; }
  let tex, aspect;
  if (isVideo) {
    const v = mirrorVideoEl();
    if (v.getAttribute("src") !== m.src) { v.src = m.src; v.load(); }
    if (v.paused && !v.ended) v.play().catch(() => {});
    // stay in step with the tablet (it tells us when its video started)
    if (m.startedAt && fb && now - mLastSync > 1000 && v.readyState >= 2 && !v.seeking) {
      mLastSync = now;
      const expect = (fb.serverNow() - m.startedAt) / 1000;
      if (mSeek && mSeek.src === m.src && Math.abs(v.currentTime - (mSeek.target + (now - mSeek.at) / 1000)) > 1.5) {
        mSeek.failed = true;            // this server/phone cannot jump inside the video: just let it play
      }
      const canSeek = !(mSeek && mSeek.src === m.src && mSeek.failed);
      if (canSeek && isFinite(v.duration) && expect < v.duration - 0.2 && Math.abs(v.currentTime - expect) > 0.4) {
        v.currentTime = Math.max(0, expect);
        mSeek = { src: m.src, target: Math.max(0, expect), at: now };
      }
    }
    if (!mVideoTex) { mVideoTex = new THREE.VideoTexture(v); mVideoTex.minFilter = THREE.LinearFilter; mVideoTex.magFilter = THREE.LinearFilter; mVideoTex.generateMipmaps = false; }
    tex = mVideoTex;
    aspect = v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
  } else {
    if (mVideo && !mVideo.paused) mVideo.pause();
    tex = stillTexture(m.still);
    aspect = tex.image && tex.image.width ? tex.image.width / tex.image.height : 16 / 9;
  }
  // redraw the highlight layer when something changed (and a few times a second while it pulses)
  const key = JSON.stringify([isStill ? m.highlight : null, isStill ? m.lesion : null, isStill ? m.caption : null, aspect.toFixed(3)]);
  const pulsing = isStill && (m.highlight || m.lesion);
  if (mirrorDirty || key !== overDrawn || (pulsing && now % 100 < 40)) {
    drawOverlay(aspect, isStill ? m : null, now);
    overTex.needsUpdate = true; overDrawn = key; mirrorDirty = false;
  }
  ar.showScreen(tex, aspect, overTex);
  if (!mirrorShown) { mirrorShown = true; updateOverlay(); }
}

// ---------------------------------------------------------------- final (screen) shader
const VERT = `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
uniform vec2 uRes;
uniform sampler2D uCam;  uniform float uCamAspect; uniform float uHasCam;
uniform sampler2D uMask; uniform float uMaskExtent;
uniform sampler2D uOvL;  uniform sampler2D uOvR; uniform float uOvExtent; uniform float uOvAlpha;
uniform vec4 uRet;       // on, gaze progress, hovering, reticle x-offset per eye
uniform vec4 uTip;       // fingertip x, y (field coords), on, progress
uniform float uK, uZoom, uIpd, uVert, uEye, uRound, uDiv, uTest;
uniform vec2 uNose;
uniform vec4 uFxA0, uFxB0, uFxA1, uFxB1; // A: blur, contrast, tint, glare   B: desat, redDesat, dim, warp
uniform vec2 uMaskBlur;                    // extra blur inside the dark (affected) areas, per eye

vec3 cam(vec2 c) {
  // c: camera coords, -1..1 covers the camera's height (centre square crop)
  vec2 uv = vec2(0.5 + c.x * 0.5 / uCamAspect, 0.5 + c.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  return texture2D(uCam, uv).rgb;
}
vec3 testPattern(vec2 m) {
  vec2 g = abs(fract(m * 5.0 + 0.5) - 0.5) / 5.0;      // grid every 0.2
  float line = 1.0 - smoothstep(0.004, 0.009, min(g.x, g.y));
  float cross = (1.0 - smoothstep(0.008, 0.016, min(abs(m.x), abs(m.y)))) * step(max(abs(m.x), abs(m.y)), 0.35);
  float ring = 1.0 - smoothstep(0.006, 0.012, abs(length(m) - 1.0));
  vec3 col = vec3(0.04) + vec3(0.85) * line;
  col = mix(col, vec3(1.0, 0.25, 0.2), cross);
  col = mix(col, vec3(1.0, 0.75, 0.3), ring);
  return col;
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// progress ring around a point: returns (dot, ring track, filled ring)
vec3 ringAt(vec2 p, float rDot, float rRing, float progress) {
  float rr = length(p);
  float d = 1.0 - smoothstep(rDot, rDot + 0.004, rr);
  float track = 1.0 - smoothstep(0.003, 0.006, abs(rr - rRing));
  float a = atan(p.x, p.y);
  if (a < 0.0) a += 6.2831853;
  float filled = track * step(a / 6.2831853, progress) * step(0.001, progress);
  return vec3(d, track, filled);
}

void main() {
  vec2 f = gl_FragCoord.xy;
  float W = uRes.x, H = uRes.y;
  float eye = f.x < W * 0.5 ? 0.0 : 1.0;
  vec4 A = eye < 0.5 ? uFxA0 : uFxA1;
  vec4 B = eye < 0.5 ? uFxB0 : uFxB1;

  // eye centre and size
  vec2 c = vec2(W * 0.5 + (eye < 0.5 ? -1.0 : 1.0) * uIpd * W * 0.5, H * 0.5 + uVert * H);
  float R = uEye * H * 0.5;
  vec2 p = (f - c) / R;

  // rounded eye shape (roundness 1 = circle)
  float cr = clamp(uRound, 0.05, 1.0);
  float d = length(max(abs(p) - (1.0 - cr), 0.0)) - cr;
  float vign = smoothstep(0.0, -0.16, d);
  if (d > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // divider and nose cutout
  float dv = abs(f.x - W * 0.5) - uDiv * W * 0.5;
  vec2 nr = vec2(max(uNose.x * W * 0.5, 1.0), max(uNose.y * H, 1.0));
  vec2 nq = (f - vec2(W * 0.5, 0.0)) / nr;
  float nose = length(nq) - 1.0;
  float cut = min(smoothstep(-1.0, 1.0, dv), smoothstep(-0.02, 0.02, nose));

  // barrel distortion (Cardboard style). m = undistorted field coordinate,
  // radius 1 = edge of the eye circle. Masks and the 3D layer are applied in m-space, i.e. before distortion.
  float r2 = dot(p, p);
  float k1 = uK, k2 = uK * 0.5;
  vec2 m = p * (1.0 + k1 * r2 + k2 * r2 * r2) / (1.0 + k1 + k2);

  // AMD wavy distortion around the centre
  float warp = B.w * (1.0 - smoothstep(0.16, 0.36, length(m)));
  vec2 cc = (m + warp * 0.022 * vec2(sin(m.y * 46.0), sin(m.x * 46.0 + 1.3))) / uZoom;

  // defect mask (looked up first: affected areas are also blurred)
  vec2 mu = clamp(m / uMaskExtent * 0.5 + 0.5, 0.0, 1.0);
  float dark = texture2D(uMask, vec2((eye + mu.x) * 0.5, mu.y)).a;
  float blurR = A.x + (eye < 0.5 ? uMaskBlur.x : uMaskBlur.y) * dark;

  vec3 col;
  if (uTest > 0.5 || uHasCam < 0.5) {
    col = testPattern(m);
  } else {
    col = cam(cc);
    if (blurR > 0.002) {              // blur (only where an effect asks for it; clear areas stay sharp)
      vec3 s = col;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996;
        float rr = blurR * sqrt((float(i) + 0.5) / 12.0);
        s += cam(cc + rr * vec2(cos(a), sin(a)));
      }
      col = s / 13.0;
    }
    if (A.w > 0.0001) {               // glare halos around bright areas
      vec3 g = vec3(0.0);
      for (int i = 0; i < 10; i++) {
        float a = float(i) * 0.6283 + 0.3;
        vec3 s = cam(cc + 0.07 * vec2(cos(a), sin(a)));
        vec3 s2 = cam(cc + 0.035 * vec2(cos(a + 0.31), sin(a + 0.31)));
        g += max(s - 0.62, 0.0) + max(s2 - 0.62, 0.0);
      }
      col += A.w * g / 20.0 * 3.2 * vec3(1.0, 0.92, 0.75);
      col += A.w * max(col - 0.7, 0.0) * 1.2;   // bloom
    }
  }
  // contrast reduction
  col = mix(vec3(0.52), col, 1.0 - A.y);
  // yellow-brown tint
  col = mix(col, col * vec3(1.0, 0.84, 0.55) + vec3(0.05, 0.03, 0.0), A.z);
  // desaturation, especially reds
  float L = lum(col);
  col = mix(col, vec3(L), B.x);
  float red = max(col.r - max(col.g, col.b), 0.0);
  col.r -= red * B.y * 0.85;
  // brightness
  col *= 1.0 - B.z;

  // defect mask (dark grey to black)
  col = mix(col, vec3(0.02), dark);

  // floating 3D model (rendered separately for each eye, premultiplied alpha)
  if (uOvAlpha > 0.001) {
    vec2 ou = m / uOvExtent * 0.5 + 0.5;
    if (ou.x > 0.0 && ou.x < 1.0 && ou.y > 0.0 && ou.y < 1.0) {
      vec4 a0 = texture2D(uOvL, ou), a1 = texture2D(uOvR, ou);
      vec4 ov = (eye < 0.5 ? a0 : a1) * uOvAlpha;
      col = ov.rgb + col * (1.0 - ov.a);
    }
  }

  // look-and-hold reticle (shifted per eye so it sits at the depth of the model)
  if (uRet.x > 0.5) {
    vec2 rp = m - vec2(eye < 0.5 ? uRet.w : -uRet.w, 0.0);
    vec3 r = ringAt(rp, 0.011, 0.042, uRet.y);
    float shadow = 1.0 - smoothstep(0.013, 0.02, length(rp));
    col = mix(col, vec3(0.0), shadow * 0.55);
    col = mix(col, vec3(1.0), r.x);
    col = mix(col, vec3(1.0), r.y * 0.35 * uRet.z);
    col = mix(col, vec3(1.0, 0.72, 0.28), r.z);
  }
  // fingertip dot (hand touch)
  if (uTip.z > 0.5) {
    vec2 tp = m - uTip.xy;
    vec3 r = ringAt(tp, 0.016, 0.05, uTip.w);
    float glow = exp(-dot(tp, tp) / 0.0016);
    col += vec3(0.25, 0.85, 1.0) * glow * 0.7;
    col = mix(col, vec3(0.75, 0.97, 1.0), r.x);
    col = mix(col, vec3(1.0, 0.72, 0.28), r.z);
  }

  col *= vign * cut;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

let renderer, composite, fsScene, fsCam, U, camTex = null, maskTex, rtL, rtR, ar = null;
const maskCanvas = document.createElement("canvas");
maskCanvas.width = MASK_SIZE * 2; maskCanvas.height = MASK_SIZE;
const maskCtx = maskCanvas.getContext("2d");
const eyeLayer = document.createElement("canvas");
eyeLayer.width = eyeLayer.height = MASK_SIZE;
const eyeCtx = eyeLayer.getContext("2d");
let maskEmpty = false;
const hands = new HandTracker();
let handBlocked = false, lowFpsT = 0, fps = 60, exploreT0 = 0;

async function initRenderer() {
  if (renderer) return;
  THREE.ColorManagement.enabled = false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch (e) { alert("WebGL is not supported on this phone."); return; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(window.devicePixelRatio || 1);     // full physical resolution of the screen
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  maskTex = new THREE.CanvasTexture(maskCanvas);
  maskTex.minFilter = THREE.LinearFilter; maskTex.generateMipmaps = false;
  const rtOpts = { samples: renderer.capabilities.isWebGL2 ? 2 : 0 };
  rtL = new THREE.WebGLRenderTarget(OV_SIZE, OV_SIZE, rtOpts);
  rtR = new THREE.WebGLRenderTarget(OV_SIZE, OV_SIZE, rtOpts);

  const u = {};
  for (const [k, v] of Object.entries({
    uRes: new THREE.Vector2(), uCam: blank, uCamAspect: 1, uHasCam: 0, uMask: maskTex, uMaskExtent: MASK_EXTENT,
    uOvL: rtL.texture, uOvR: rtR.texture, uOvExtent: OV_EXTENT, uOvAlpha: 0,
    uRet: new THREE.Vector4(), uTip: new THREE.Vector4(),
    uK: 0, uZoom: 1, uIpd: 0.5, uVert: 0, uEye: 0.9, uRound: 1, uDiv: 0, uTest: 0, uNose: new THREE.Vector2(),
    uFxA0: new THREE.Vector4(), uFxB0: new THREE.Vector4(), uFxA1: new THREE.Vector4(), uFxB1: new THREE.Vector4(),
    uMaskBlur: new THREE.Vector2()
  })) u[k] = { value: v };
  U = u;
  composite = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, depthTest: false, depthWrite: false });
  fsScene = new THREE.Scene();
  fsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite));
  fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  ar = new ARScene(renderer);
  ar.onCondition = cond => startEffect(cond, exploreLang);
  ar.onStatus = s => pushStatus({ ...s, method: activeMethod(), lang: exploreLang,
    effectStart: s.phase === "effect" ? effectStartMs : null, condition: s.condition });
  try { await ar.init(); } catch (e) { console.error("3D scene failed", e); }
  if (/[?&]debug/.test(location.search)) {   // for testing only
    window.__ar = ar;
    window.__mirror = () => ({ screen: mirrorState && mirrorState.screen, v: mVideo && { src: mVideo.currentSrc, t: +mVideo.currentTime.toFixed(2), rs: mVideo.readyState, paused: mVideo.paused, w: mVideo.videoWidth, err: mVideo.error && mVideo.error.code } });
  }
  applySettings();
}

function resize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = window.devicePixelRatio || 1;
  if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
  if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
}
window.addEventListener("resize", () => { resize(); layoutText(); });

// Settings that come from the hidden calibration panel
function applySettings() {
  layoutText();
  if (ar) ar.setSettings(calib, OV_EXTENT);
  const wantHands = (calib.selectMethod === "hand" || calib.selectMethod === "both") && !handBlocked;
  if (wantHands && hands.state === "off") hands.start();
  if (!wantHands && hands.state !== "off") hands.stop();
}
function activeMethod() { return calib.selectMethod || "gaze"; }

// Position the HTML text under each lens.
function layoutText() {
  const W = window.innerWidth, H = window.innerHeight;
  const cy = H / 2 - calib.vertical * H;  // screen y grows downwards
  const R = calib.eyeSize * H / 2;
  [["L", -1], ["R", 1]].forEach(([e, s]) => {
    const cx = W / 2 + s * calib.ipd * W / 2;
    const put = (id, y) => { $(id).style.left = cx + "px"; $(id).style.top = y + "px"; };
    put("wait" + e, cy + R * 0.62);
    put("name" + e, cy - R * 0.5);
    put("err" + e, cy);
    put("hint" + e, cy + R * 0.84);
    for (const k of ["name", "err"]) $(k + e).style.width = Math.min(R * 1.6, W * 0.45) + "px";
  });
}

function updateMask(t) {
  if (!running) {
    if (maskEmpty) return;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskEmpty = true;
  } else {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ["L", "R"].forEach((eye, i) => {
      eyeCtx.setTransform(1, 0, 0, 1, 0, 0);
      eyeCtx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
      paintField(eyeCtx, MASK_SIZE, running.cond, eye, t, { kinds: ["dark"], extent: MASK_EXTENT });
      maskCtx.drawImage(eyeLayer, i * MASK_SIZE, 0);
    });
    maskEmpty = false;
  }
  maskTex.needsUpdate = true;
}

function setFx(eyeIdx, fx) {
  U["uFxA" + eyeIdx].value.set(fx.blur, fx.contrast, fx.tint, fx.glare);
  U["uFxB" + eyeIdx].value.set(fx.desat, fx.redDesat, fx.dim, fx.warp);
  if (eyeIdx === 0) U.uMaskBlur.value.x = fx.maskBlur || 0; else U.uMaskBlur.value.y = fx.maskBlur || 0;
}

let hintText = "";
function setHint(text) {
  if (text === hintText) return;
  hintText = text;
  for (const id of ["hintL", "hintR"]) { $(id).textContent = text; $(id).lang = exploreLang; $(id).classList.toggle("on", !!text); }
}

let lastFrame = performance.now();
function loop() {
  requestAnimationFrame(loop);
  if (!renderer) return;
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  resize();

  let t = 0;
  if (running) {
    t = (now - running.t0) / 1000;
    if (t >= TIMING.effectTotal) { running = null; updateOverlay(); if (ar) ar.effectDone(); }
  }

  // camera frame
  const hasCam = camOk && video && video.readyState >= 2 && video.videoWidth > 0;
  if (hasCam && (!camTex || camTex.image !== video)) {
    camTex = new THREE.VideoTexture(video);
    camTex.minFilter = THREE.LinearFilter; camTex.magFilter = THREE.LinearFilter; camTex.generateMipmaps = false;
    U.uCam.value = camTex;
  }
  updateMask(t);
  const aspect = hasCam ? video.videoWidth / video.videoHeight : 1;

  // ---- selection pointers (look-and-hold reticle, fingertip)
  const exploring = ar && ar.active;
  const method = activeMethod();
  const wantsHand = method === "hand" || method === "both";
  let tip = null;
  if (exploring && wantsHand && !handBlocked && hands.state === "ready") tip = hands.detect(video, now);
  // fall back to look and hold if the phone is too slow for hand tracking
  if (exploring && wantsHand && !handBlocked && hands.state === "ready") {
    lowFpsT = fps < 20 ? lowFpsT + dt : 0;
    if (lowFpsT > 3) { handBlocked = true; hands.stop(); console.warn("Hand tracking switched off: frame rate too low"); }
  }
  const handFailed = hands.state === "failed" || handBlocked;
  const handMissing = !tip && (now - hands.lastSeen > 2000);
  const gazeOn = method === "gaze" || method === "both" || (method === "hand" && (handFailed || handMissing || hands.state !== "ready"));
  const pointers = [];
  if (gazeOn) pointers.push({ kind: "gaze", ndc: { x: 0, y: 0 }, holdTime: calib.holdTime || 2 });
  let tipM = null;
  if (tip) {
    tipM = { x: (tip.x - 0.5) * 2 * aspect * calib.zoom, y: (0.5 - tip.y) * 2 * calib.zoom };
    pointers.push({ kind: "hand", ndc: { x: tipM.x / OV_EXTENT, y: tipM.y / OV_EXTENT }, holdTime: HAND_HOLD_TIME });
  }
  updateMirror(now);
  let sel = { hits: {}, hitDistance: 1 };
  if (ar) {
    sel = ar.update(dt, exploring ? pointers : []);
    ar.render(rtL, rtR);
  }
  const browsing = exploring && ar.phase === "browse";
  const g = sel.hits.gaze, h = sel.hits.hand;
  U.uRet.value.set(browsing && gazeOn ? 1 : 0, g ? g.progress : 0, g && g.id ? 1 : 0, ar ? ar.reticleOffset(sel.hitDistance) : 0);
  U.uTip.value.set(tipM ? tipM.x : 0, tipM ? tipM.y : 0, browsing && tipM ? 1 : 0, h ? h.progress : 0);
  U.uOvAlpha.value = ar ? ar.layerAlpha() : 0;

  // small instruction under each lens while exploring
  let hint = "";
  if (browsing && !(g && g.id) && !(h && h.id)) {
    if (wantsHand && tip) hint = tr(exploreLang, "fingerToSelect");
    else if (method === "hand" && (handFailed || handMissing) && now - exploreT0 > 3000) hint = tr(exploreLang, "handLost");
    else hint = tr(exploreLang, "lookToSelect");
  }
  setHint(hint);

  U.uRes.value.set(canvas.width, canvas.height);
  U.uCamAspect.value = aspect;
  U.uHasCam.value = hasCam ? 1 : 0;
  U.uK.value = calib.distortion;
  U.uZoom.value = Math.max(0.1, calib.zoom);
  U.uIpd.value = calib.ipd;
  U.uVert.value = calib.vertical;
  U.uEye.value = calib.eyeSize;
  U.uRound.value = calib.roundness;
  U.uDiv.value = calib.divider;
  U.uTest.value = calib.testPattern ? 1 : 0;
  U.uNose.value.set(calib.noseWidth, calib.noseHeight);
  const none = filtersAt("", "L", 0);
  setFx(0, running ? filtersAt(running.cond, "L", t) : none);
  setFx(1, running ? filtersAt(running.cond, "R", t) : none);

  renderer.render(fsScene, fsCam);
}
