// =====================================================================
//  VIEWER (phone inside the headset)
//  SCREEN MODE: shows what the tablet shows (video / picture / selected part) in both eyes.
//  AR MODE:     camera -> defect mask & filters -> barrel distortion -> two eyes (20 s).
//  The tablet operator controls everything; the visitor never needs to touch the phone.
// =====================================================================
import * as THREE from "three";
import { DB, STATION, TIMING, MEDIA, DEFAULT_CALIBRATION, DEFAULT_HOTSPOTS, changeStation } from "./config.js";
import { LANGUAGES, T, tr } from "./translations.js";
import { paintField, filtersAt, ALL_CONDITIONS } from "./defects.js";
import { isFullscreen, enterFullscreen, keepFullscreen, canFullscreen, IS_IPHONE } from "./fullscreen.js";
import { Synced } from "./sync.js";
import { showSignIn } from "./signin.js";

const $ = id => document.getElementById(id);
const canvas = $("gl");
const MASK_EXTENT = 1.5;   // mask texture covers field coords -1.5 … +1.5
const MASK_SIZE = 256;     // pixels per eye in the mask texture
const FONT = '"Noto Sans","Noto Sans Tamil","Noto Sans Sinhala",sans-serif';

let fb = null;
let calib = loadCachedCalib();
let started = false;
let running = null;        // AR effect: { cond, lang, t0 (performance time of the effect start), back }
let camOk = false, netOk = false, everConnected = false;
let video = null, stream = null;
let show = { screen: "lang" };        // what the tablet asked us to show
const serverNow = () => (fb ? fb.serverNow() : Date.now());

document.querySelector("#startScreen h1").textContent = `Eye Exhibit – Headset · Station ${STATION}`;
$("stationInput").value = STATION;                       // use the same number as this phone's tablet
$("stationSet").onclick = () => changeStation($("stationInput").value);

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
}

// ---------------------------------------------------------------- start-screen checks
// Shows whether this phone is signed in and receives the tablet's settings (on iPhone, the
// home-screen icon has its own memory: set the station and sign in again inside it).
let signedIn = null, settingsOk = false;
function updateChecks() {
  const box = $("checkRow"); if (!box) return;
  const who = signedIn
    ? `Signed in: <b class="ok">yes</b>`
    : `Signed in: <b class="no">no</b> – the tablet may not reach this phone <button id="signInNow">Sign in</button>`;
  box.innerHTML = `${who}<br>Settings from the tablet (station ${STATION}): ` +
    (settingsOk ? `<b class="ok">received</b>` : `<b class="no">not yet</b>`);
  const b = $("signInNow"); if (b) b.onclick = () => showSignIn(fb);
}

// ---------------------------------------------------------------- Firebase
const hotspots = JSON.parse(JSON.stringify(DEFAULT_HOTSPOTS));
(async () => {
  try {
    fb = await import("./fb.js");
    signedIn = await fb.authReady;                 // wait for the saved sign-in before connecting
    if (!signedIn) showSignIn(fb);
    updateChecks();
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
    lastSeen: fb.serverTimestamp(), started, state: running ? running.cond : show.screen,
    camera: camInfo && { ...camInfo, received: video ? `${video.videoWidth}x${video.videoHeight}` : "" },
    screen: { width: canvas.width, height: canvas.height, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100, fps: Math.round(fps) },
    preload: preloadInfo
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

  fb.onValue(fb.ref(fb.db, DB.calibLive), s => {
    const v = s.val();
    settingsOk = true; updateChecks();
    if (v) { calib = { ...DEFAULT_CALIBRATION, ...v }; try { localStorage.setItem("calib-" + STATION, JSON.stringify(calib)); } catch (e) {} }
    layoutText(); applySound();
  });
  fb.onValue(fb.ref(fb.db, DB.hotspots), s => {
    const v = s.val() || {};
    for (const kind of ["eye", "pathway"]) for (const id in DEFAULT_HOTSPOTS[kind])
      hotspots[kind][id] = { ...DEFAULT_HOTSPOTS[kind][id], ...((v[kind] && v[kind][id]) || {}) };
  });
  fb.onValue(fb.ref(fb.db, DB.show), s => { const v = s.val(); if (v) { show = v; if (started) applyShow(); } });
})();

function loadCachedCalib() {
  try { return { ...DEFAULT_CALIBRATION, ...JSON.parse(localStorage.getItem("calib-" + STATION) || "{}") }; }
  catch (e) { return { ...DEFAULT_CALIBRATION }; }
}

// ---------------------------------------------------------------- media elements
const mk = (tag, loop) => {
  const el = document.createElement(tag);
  if (tag === "video") { el.playsInline = true; el.setAttribute("playsinline", ""); el.crossOrigin = "anonymous"; }
  el.loop = !!loop; el.preload = "auto";
  return el;
};
const introEl = mk("video"), homeEl = mk("video", true), narrEl = mk("audio");
homeEl.muted = true;
const intro = new Synced(introEl, serverNow), narr = new Synced(narrEl, serverNow);
setInterval(() => { intro.tick(); narr.tick(); }, 250);
let introMuted = false;
function phoneSound() { return calib.soundFrom !== "tablet"; }
function applySound() {
  introEl.muted = introMuted || !phoneSound();
  narrEl.muted = !phoneSound();
}

// ---------------------------------------------------------------- what to show
// show.screen: lang | introChoice | intro | eyeStill | pathStill | effect
function applyShow() {
  const s = show;
  const age = (serverNow() - (s.startAt || 0)) / 1000;
  if (s.screen === "effect") {
    const total = s.duration || TIMING.effectTotal;
    if (s.startAt && ALL_CONDITIONS.includes(s.condition) && age < total) {
      if (!running || running.key !== s.startAt) startEffect(s.condition, s.language || "en", s.startAt, s.returnTo, total);
      intro.stop(); narr.stop(); homeEl.pause();
      return;
    }
    show = s.returnTo || { screen: "lang" };          // an old effect: just show where it returned to
    return applyShow();
  }
  if (running) { running = null; clearNames(); }        // the tablet moved on
  if (s.screen === "intro") {
    homeEl.pause();
    introMuted = !!s.muteVideo; applySound();
    intro.play(s.src, s.startAt);
    if (s.narr) narr.play(s.narr, s.startAt); else narr.stop();
  } else if (s.screen === "eyeStill" || s.screen === "pathStill") {
    homeEl.pause(); intro.stop();
    if (s.narr && s.startAt) narr.play(s.narr, s.startAt); else narr.stop();
    stillTexture(s.still || (s.screen === "eyeStill" ? MEDIA.eyeStill : MEDIA.pathStill));
  } else if (s.screen === "introChoice") {             // "Watch the introduction?" – the guide answers on the tablet
    homeEl.pause(); intro.stop(); narr.stop();
  } else {                                              // language screen
    intro.stop(); narr.stop();
    if (homeOk) homeEl.play().catch(() => {});
  }
  applySound();
}

// ---------------------------------------------------------------- AR effect
let nameTimer = null;
function startEffect(cond, lang, startAt, back, total) {
  const lead = startAt - serverNow();                 // ms until the effect starts ("Loading…" until then)
  running = { cond, lang, key: startAt, t0: performance.now() + lead, back, total };
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const name = tr(lang, `conditions.${cond}.name`);
    for (const id of ["nameL", "nameR"]) { $(id).textContent = name; $(id).lang = lang; $(id).classList.add("on"); }
    nameTimer = setTimeout(clearNames, TIMING.nameShow * 1000);
  }, Math.max(0, lead));
}
function clearNames() { clearTimeout(nameTimer); for (const id of ["nameL", "nameR"]) $(id).classList.remove("on"); }
function endEffect() {
  const back = running && running.back;
  running = null;
  clearNames();
  // back to screen mode with the same picture (the tablet will confirm a moment later)
  if (show.screen === "effect") { show = back || { screen: "lang" }; applyShow(); }
}

// ---------------------------------------------------------------- Start button
$("startBtn").addEventListener("click", async () => {
  $("startBtn").disabled = true;
  await enterFullscreen();     // works straight away if the camera was allowed before
  requestWakeLock();
  // this tap also unlocks sound and video playback
  for (const el of [introEl, narrEl]) { el.muted = true; el.play().then(() => el.pause()).catch(() => {}); }
  await startCamera();         // the camera stays open in the background from now on
  started = true;
  $("startScreen").style.display = "none";
  await initRenderer();
  layoutText();
  updateFsPrompt();
  applyShow();
  preloadMedia();
  requestAnimationFrame(loop);
});

// iPhone in Safari: explain how to get full screen (open it from a home-screen icon).
if (IS_IPHONE && !isFullscreen()) $("iosTip").style.display = "block";

// If full screen was lost (e.g. by the camera question), ask for one more tap.
keepFullscreen();
function updateFsPrompt() {
  $("fsPrompt").classList.toggle("on", started && canFullscreen && !isFullscreen());
  $("turnPrompt").classList.toggle("on", started && window.innerHeight > window.innerWidth);   // must be sideways
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

// ---------------------------------------------------------------- preload (after Start)
let preloadInfo = { done: 0, total: 0 };
let homeOk = false;
async function preloadMedia() {
  homeEl.src = MEDIA.homeVideo;
  homeEl.addEventListener("canplay", () => { homeOk = true; if (show.screen === "lang") homeEl.play().catch(() => {}); }, { once: true });
  stillTexture(MEDIA.eyeStill); stillTexture(MEDIA.pathStill);
  const langs = LANGUAGES.map(l => l.code);
  const urls = [MEDIA.eyeVideo, ...langs.map(l => MEDIA.eyeVideoLang.replace("{lang}", l)),
    ...langs.map(l => MEDIA.eyeNarration.replace("{lang}", l)), ...langs.map(l => MEDIA.pathNarration.replace("{lang}", l))];
  preloadInfo = { done: 0, total: urls.length };
  for (const u of urls) {                       // one after another, so the camera and screen stay smooth
    try { const r = await fetch(u); if (r.ok) await r.blob(); } catch (e) {}
    preloadInfo.done++;
  }
}

// ---------------------------------------------------------------- camera (stays open the whole time)
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
  let st = track.getSettings ? track.getSettings() : {};
  if (st.width && st.width < 1280) {
    try { await track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }); } catch (e) {}
    try { await track.applyConstraints({ width: { min: 1280 }, height: { min: 720 } }); } catch (e) {}
  }
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

// ---------------------------------------------------------------- final (screen) shader
const VERT = `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
uniform vec2 uRes;
uniform sampler2D uCam;  uniform float uCamAspect; uniform float uHasCam;
uniform sampler2D uMask; uniform float uMaskExtent;
uniform float uScreenOn;                 // 1 = screen mode (picture / video), 0 = AR (camera)
uniform sampler2D uScrMain; uniform float uScrHasMain; uniform sampler2D uScrOver;
uniform float uScrAspect, uScrSize;
uniform vec3 uScrBg;                     // colour of the round eye area around the picture
uniform float uK, uZoom, uIpd, uVert, uEye, uRound, uDiv, uTest;
uniform float uHoriz;                    // left/right shift of the whole layout, fraction of W
uniform vec2 uNose;
uniform vec4 uFxA0, uFxB0, uFxA1, uFxB1; // A: blur, contrast, tint, glare   B: desat, redDesat, dim, warp
uniform vec2 uMaskBlur;                  // extra blur inside the dark (affected) areas, per eye
uniform vec2 uEdge;                      // bluish-grey haze where the dark areas begin (glaucoma), per eye

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

void main() {
  vec2 f = gl_FragCoord.xy;
  float W = uRes.x, H = uRes.y;
  float mid = W * (0.5 + uHoriz);           // middle of the layout (between the two lenses)
  float eye = f.x < mid ? 0.0 : 1.0;
  vec4 A = eye < 0.5 ? uFxA0 : uFxA1;
  vec4 B = eye < 0.5 ? uFxB0 : uFxB1;

  // eye centre and size
  vec2 c = vec2(mid + (eye < 0.5 ? -1.0 : 1.0) * uIpd * W * 0.5, H * 0.5 + uVert * H);
  float R = uEye * H * 0.5;
  vec2 p = (f - c) / R;

  // rounded eye shape (roundness 1 = circle)
  float cr = clamp(uRound, 0.05, 1.0);
  float d = length(max(abs(p) - (1.0 - cr), 0.0)) - cr;
  float vign = smoothstep(0.0, -0.16, d);
  if (d > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // divider and nose cutout
  float dv = abs(f.x - mid) - uDiv * W * 0.5;
  vec2 nr = vec2(max(uNose.x * W * 0.5, 1.0), max(uNose.y * H, 1.0));
  vec2 nq = (f - vec2(mid, 0.0)) / nr;
  float nose = length(nq) - 1.0;
  float cut = min(smoothstep(-1.0, 1.0, dv), smoothstep(-0.02, 0.02, nose));

  // barrel distortion (Cardboard style). m = undistorted field coordinate,
  // radius 1 = edge of the eye circle. Masks and the screen picture are placed in m-space, i.e. before distortion.
  float r2 = dot(p, p);
  float k1 = uK, k2 = uK * 0.5;
  vec2 m = p * (1.0 + k1 * r2 + k2 * r2 * r2) / (1.0 + k1 + k2);

  // ---- SCREEN MODE: the same picture / video in both eyes, centred in the round eye area
  if (uScreenOn > 0.5 && uTest < 0.5) {
    // uScrSize = 0.5 … 1: share of the largest size at which the whole picture (corners too) fits inside the circle
    vec2 halfSize = normalize(vec2(1.0, 1.0 / uScrAspect)) * 0.97 * uScrSize;
    vec2 su = m / (2.0 * halfSize) + 0.5;
    vec3 sc = uScrBg;                          // the round eye area around the picture, in the picture's edge colour
    if (su.x >= 0.0 && su.x <= 1.0 && su.y >= 0.0 && su.y <= 1.0) {
      vec3 pic = uScrBg;
      if (uScrHasMain > 0.5) pic = texture2D(uScrMain, su).rgb;
      vec4 o = texture2D(uScrOver, su);
      pic = o.rgb + pic * (1.0 - o.a);            // highlights / names / "Loading…" (premultiplied)
      vec2 fw = 0.07 / (2.0 * halfSize);          // soft edge: the picture fades into the circle
      vec2 ee = smoothstep(vec2(0.0), fw, su) * smoothstep(vec2(0.0), fw, 1.0 - su);
      sc = mix(uScrBg, pic, ee.x * ee.y);
    }
    gl_FragColor = vec4(clamp(sc, 0.0, 1.0) * vign * cut, 1.0);
    return;
  }

  // ---- AR MODE
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
  // amber-brown tint (cataract: the yellowed lens absorbs blue and green light)
  col = mix(col, col * vec3(0.92, 0.64, 0.36) + vec3(0.09, 0.03, 0.0), A.z);
  // contrast reduction: towards grey, or towards a milky orange veil when tinted (cataract)
  col = mix(mix(vec3(0.52), vec3(0.80, 0.47, 0.20), clamp(A.z, 0.0, 1.0)), col, 1.0 - A.y);
  // desaturation, especially reds
  float L = lum(col);
  col = mix(col, vec3(L), B.x);
  float red = max(col.r - max(col.g, col.b), 0.0);
  col.r -= red * B.y * 0.85;
  // brightness
  col *= 1.0 - B.z;

  // bluish-grey haze where the dark areas begin (glaucoma)
  float eg = (eye < 0.5 ? uEdge.x : uEdge.y) * smoothstep(0.05, 0.7, dark);
  col = mix(col, vec3(lum(col)) * vec3(0.70, 0.80, 1.0) + vec3(0.02, 0.03, 0.06), eg * 0.6);
  // defect mask (dark grey to black)
  col = mix(col, vec3(0.02), dark);

  col *= vign * cut;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

let renderer, fsScene, fsCam, U, camTex = null, maskTex, overTex;
const maskCanvas = document.createElement("canvas");
maskCanvas.width = MASK_SIZE * 2; maskCanvas.height = MASK_SIZE;
const maskCtx = maskCanvas.getContext("2d");
const eyeLayer = document.createElement("canvas");
eyeLayer.width = eyeLayer.height = MASK_SIZE;
const eyeCtx = eyeLayer.getContext("2d");
let maskEmpty = false;
const overCanvas = document.createElement("canvas");
overCanvas.width = 1280; overCanvas.height = 720;
const overCtx = overCanvas.getContext("2d");
let fps = 60;

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
  overTex = new THREE.CanvasTexture(overCanvas);
  overTex.minFilter = THREE.LinearFilter; overTex.generateMipmaps = false;

  const u = {};
  for (const [k, v] of Object.entries({
    uRes: new THREE.Vector2(), uCam: blank, uCamAspect: 1, uHasCam: 0, uMask: maskTex, uMaskExtent: MASK_EXTENT,
    uScreenOn: 1, uScrMain: blank, uScrHasMain: 0, uScrOver: overTex, uScrAspect: 16 / 9, uScrSize: 1.6, uScrBg: new THREE.Vector3(),
    uK: 0, uZoom: 1, uIpd: 0.5, uVert: 0, uHoriz: 0, uEye: 0.9, uRound: 1, uDiv: 0, uTest: 0, uNose: new THREE.Vector2(),
    uFxA0: new THREE.Vector4(), uFxB0: new THREE.Vector4(), uFxA1: new THREE.Vector4(), uFxB1: new THREE.Vector4(),
    uMaskBlur: new THREE.Vector2(), uEdge: new THREE.Vector2()
  })) u[k] = { value: v };
  U = u;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, depthTest: false, depthWrite: false });
  fsScene = new THREE.Scene();
  fsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
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

// Position the HTML text (condition name, errors) under each lens.
function layoutText() {
  const W = window.innerWidth, H = window.innerHeight;
  const cy = H / 2 - calib.vertical * H;  // screen y grows downwards
  const R = calib.eyeSize * H / 2;
  [["L", -1], ["R", 1]].forEach(([e, s]) => {
    const cx = W * (0.5 + (calib.horizontal || 0)) + s * calib.ipd * W / 2;
    const put = (id, y) => { $(id).style.left = cx + "px"; $(id).style.top = y + "px"; };
    put("name" + e, cy - R * 0.5);
    put("err" + e, cy);
    for (const k of ["name", "err"]) $(k + e).style.width = Math.min(R * 1.6, W * 0.45) + "px";
  });
}

function updateMask(t) {
  if (!running || t < 0) {
    if (maskEmpty) return;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskEmpty = true;
  } else {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ["L", "R"].forEach((eye, i) => {
      eyeCtx.setTransform(1, 0, 0, 1, 0, 0);
      eyeCtx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
      paintField(eyeCtx, MASK_SIZE, running.cond, eye, t, { kinds: ["dark"], extent: MASK_EXTENT, total: running.total });
      maskCtx.drawImage(eyeLayer, i * MASK_SIZE, 0);
    });
    maskEmpty = false;
  }
  maskTex.needsUpdate = true;
}

function setFx(eyeIdx, fx) {
  U["uFxA" + eyeIdx].value.set(fx.blur, fx.contrast, fx.tint, fx.glare);
  U["uFxB" + eyeIdx].value.set(fx.desat, fx.redDesat, fx.dim, fx.warp);
  if (eyeIdx === 0) { U.uMaskBlur.value.x = fx.maskBlur || 0; U.uEdge.value.x = fx.edge || 0; }
  else { U.uMaskBlur.value.y = fx.maskBlur || 0; U.uEdge.value.y = fx.edge || 0; }
}

// ---------------------------------------------------------------- screen-mode content
const stillCache = {};
function stillTexture(src) {
  if (!stillCache[src]) {
    const t = new THREE.TextureLoader().load(src, tex => { tex.userData.edge = edgeColour(tex.image); });
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    stillCache[src] = t;
  }
  return stillCache[src];
}
// average colour of a picture's border (0–1), used to fill the round eye area around it
function edgeColour(img) {
  try {
    const cv = document.createElement("canvas"); cv.width = 32; cv.height = 18;
    const c = cv.getContext("2d"); c.drawImage(img, 0, 0, 32, 18);
    const d = c.getImageData(0, 0, 32, 18).data; const sum = [0, 0, 0]; let n = 0;
    for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) {
      if (x > 1 && x < 30 && y > 1 && y < 16) continue;
      const i = (y * 32 + x) * 4; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++;
    }
    return sum.map(v => v / n / 255);
  } catch (e) { return null; }
}
const NAVY = [8 / 255, 18 / 255, 42 / 255];        // same blue as the "Please wait" / question screens
const videoTex = new Map();
function videoTexture(el) {
  if (!videoTex.has(el)) {
    const t = new THREE.VideoTexture(el);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    videoTex.set(el, t);
  }
  return videoTex.get(el);
}

// Draws the transparent layer on top of the picture: glowing part, big disease name, "Loading…", etc.
function drawOver(aspect, mode, now) {
  const Wc = 1280, Hc = Math.round(Wc / aspect);
  if (overCanvas.height !== Hc) {                 // a picture with another shape: the layer needs a new texture
    overCanvas.height = Hc;
    overTex.dispose();
    overTex = new THREE.CanvasTexture(overCanvas);
    overTex.minFilter = THREE.LinearFilter; overTex.generateMipmaps = false;
    U.uScrOver.value = overTex;
  }
  const c = overCtx;
  c.clearRect(0, 0, Wc, Hc);
  c.textAlign = "center"; c.textBaseline = "middle";
  const fit = (text, px, weight, maxW) => { let f = px; do { c.font = `${weight} ${f}px ${FONT}`; f -= 2; } while (c.measureText(text).width > maxW && f > 14); };

  if (mode === "loading") {
    c.fillStyle = "#000"; c.fillRect(0, 0, Wc, Hc);
    const a = now / 180;
    c.lineWidth = 16; c.lineCap = "round";
    c.strokeStyle = "rgba(255,255,255,0.15)"; c.beginPath(); c.arc(Wc / 2, Hc * 0.42, 70, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "#ffb547"; c.beginPath(); c.arc(Wc / 2, Hc * 0.42, 70, a, a + Math.PI * 1.3); c.stroke();
    const txt = tr(running ? running.lang : "en", "loading");
    fit(txt, 72, 700, Wc - 80); c.fillStyle = "#f3f1ea"; c.fillText(txt, Wc / 2, Hc * 0.68);
    return;
  }
  if (mode === "choice") {                         // "Would you like to watch an introduction to the eye?"
    const lang = show.language || "en";
    c.fillStyle = "#08122a"; c.fillRect(0, 0, Wc, Hc);
    // the question on two lines (split at the space nearest the middle), as large as fits
    const q = tr(lang, "introQuestion"), sp = [...q.matchAll(/ /g)].map(m => m.index);
    const cut = sp.length ? sp.reduce((a, b) => Math.abs(b - q.length / 2) < Math.abs(a - q.length / 2) ? b : a) : -1;
    const lines = cut > 0 ? [q.slice(0, cut), q.slice(cut + 1)] : [q];
    let f = 72; do { c.font = `700 ${f}px ${FONT}`; f -= 2; } while (Math.max(...lines.map(l => c.measureText(l).width)) > Wc - 100 && f > 14);
    c.fillStyle = "#ffcf7a";
    lines.forEach((l, i) => c.fillText(l, Wc / 2, Hc * (lines.length > 1 ? 0.27 + i * 0.13 : 0.34)));
    [["watchIntro", Wc * 0.3], ["skipIntro", Wc * 0.7]].forEach(([k, x]) => {
      const t = tr(lang, k), w = Wc * 0.34, h = 110, y = Hc * 0.62;
      c.fillStyle = "rgba(255,255,255,0.10)"; c.strokeStyle = "rgba(255,181,71,0.9)"; c.lineWidth = 4;
      c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, 55); c.fill(); c.stroke();
      fit(t, 46, 700, w - 40); c.fillStyle = "#f3f1ea"; c.fillText(t, x, y);
    });
    return;
  }
  if (mode === "lang") {
    if (!homeOk || homeEl.readyState < 2) { c.fillStyle = "#08122a"; c.fillRect(0, 0, Wc, Hc); }
    const lines = LANGUAGES.map(l => T[l.code].pleaseWait);
    c.fillStyle = "rgba(5,12,31,0.78)"; c.fillRect(0, Hc - 190, Wc, 190);
    lines.forEach((t, i) => { fit(t, 40, 600, Wc - 80); c.fillStyle = "#f3f1ea"; c.fillText(t, Wc / 2, Hc - 150 + i * 55); });
    return;
  }
  if (mode === "still") {
    const s = show, lang = s.language || "en";
    const kind = s.screen === "eyeStill" ? "eye" : "pathway";
    const spot = s.highlight && hotspots[kind] && hotspots[kind][s.highlight];
    if (spot) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 160);
      const x = spot.x / 100 * Wc, y = spot.y / 100 * Hc, r = Math.max(16, spot.r / 100 * Wc);
      const red = kind === "pathway";
      const g = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, red ? `rgba(255,50,50,${0.85 * pulse})` : `rgba(255,181,71,${0.6 * pulse})`);
      g.addColorStop(0.45, red ? `rgba(255,30,30,${0.45 * pulse})` : `rgba(255,181,71,${0.28 * pulse})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      c.lineWidth = 6; c.strokeStyle = red ? "rgba(255,80,80,0.95)" : "rgba(255,190,90,0.95)";
      c.beginPath(); c.arc(x, y, r * (1 + 0.08 * pulse), 0, Math.PI * 2); c.stroke();
    }
    if (s.title) {                                   // large, clear disease name
      const bh = s.subtitle ? 190 : 140;
      c.fillStyle = "rgba(5,12,31,0.88)"; c.fillRect(0, Hc - bh, Wc, bh);
      fit(s.title, 80, 700, Wc - 60); c.fillStyle = "#ffcf7a"; c.fillText(s.title, Wc / 2, Hc - bh + 68);
      if (s.subtitle) { fit(s.subtitle, 40, 500, Wc - 60); c.fillStyle = "#f3f1ea"; c.fillText(s.subtitle, Wc / 2, Hc - 48); }
    }
  }
}

// ---------------------------------------------------------------- frame loop
let lastFrame = performance.now();
function loop() {
  requestAnimationFrame(loop);
  if (!renderer) return;
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  resize();

  // AR effect timing ("Loading…" until it starts)
  let t = -1;
  if (running) {
    t = (now - running.t0) / 1000;
    if (t >= running.total) { endEffect(); t = -1; }
  }
  const arOn = running && t >= 0;
  const loading = running && t < 0;

  // the phone's own intro video finished: show the picture straight away
  if (show.screen === "intro" && intro.ended()) { show = { ...show, screen: "eyeStill", still: MEDIA.eyeStill }; applyShow(); }

  // camera frame (kept running in the background; only shown during the AR effect)
  const hasCam = camOk && video && video.readyState >= 2 && video.videoWidth > 0;
  if (hasCam && (!camTex || camTex.image !== video)) {
    camTex = new THREE.VideoTexture(video);
    camTex.minFilter = THREE.LinearFilter; camTex.magFilter = THREE.LinearFilter; camTex.generateMipmaps = false;
    U.uCam.value = camTex;
  }
  updateMask(t);

  // screen-mode content
  let main = null, aspect = 16 / 9, mode = "lang", bg = NAVY;
  if (loading) mode = "loading";
  else if (show.screen === "introChoice") mode = "choice";
  else if (show.screen === "intro") { main = introEl.readyState >= 2 ? videoTexture(introEl) : null; mode = "video";
    if (introEl.videoWidth) aspect = introEl.videoWidth / introEl.videoHeight; }
  else if (show.screen === "eyeStill" || show.screen === "pathStill") {
    const tex = stillTexture(show.still || (show.screen === "eyeStill" ? MEDIA.eyeStill : MEDIA.pathStill));
    if (tex.image && tex.image.width) { main = tex; aspect = tex.image.width / tex.image.height; bg = tex.userData.edge || NAVY; }
    mode = "still";
  } else if (homeOk && homeEl.readyState >= 2) {
    main = videoTexture(homeEl); aspect = homeEl.videoWidth ? homeEl.videoWidth / homeEl.videoHeight : aspect;
  }
  if (!arOn) { drawOver(aspect, mode, now); overTex.needsUpdate = true; }
  U.uScreenOn.value = arOn ? 0 : 1;
  U.uScrMain.value = main || U.uCam.value;
  U.uScrHasMain.value = main ? 1 : 0;
  U.uScrAspect.value = aspect;
  U.uScrSize.value = Math.min(1, Math.max(0.3, calib.screenFit || 0.95));
  if (loading) U.uScrBg.value.set(0, 0, 0); else U.uScrBg.value.set(bg[0], bg[1], bg[2]);

  U.uRes.value.set(canvas.width, canvas.height);
  U.uCamAspect.value = hasCam ? video.videoWidth / video.videoHeight : 1;
  U.uHasCam.value = hasCam ? 1 : 0;
  U.uK.value = calib.distortion;
  U.uZoom.value = Math.max(0.1, calib.zoom);
  U.uIpd.value = calib.ipd;
  U.uVert.value = calib.vertical;
  U.uHoriz.value = calib.horizontal || 0;
  U.uEye.value = calib.eyeSize;
  U.uRound.value = calib.roundness;
  U.uDiv.value = calib.divider;
  U.uTest.value = calib.testPattern ? 1 : 0;
  U.uNose.value.set(calib.noseWidth, calib.noseHeight);
  const none = filtersAt("", "L", 0);
  setFx(0, arOn ? filtersAt(running.cond, "L", t, running.total) : none);
  setFx(1, arOn ? filtersAt(running.cond, "R", t, running.total) : none);

  renderer.render(fsScene, fsCam);
}

if (/[?&]debug/.test(location.search)) {          // for automated tests only
  window.__dbg = () => ({ screen: show.screen, running: running && { cond: running.cond, t: +((performance.now() - running.t0) / 1000).toFixed(2) },
    intro: { src: introEl.currentSrc.split("/").pop(), t: +introEl.currentTime.toFixed(2), paused: introEl.paused, muted: introEl.muted },
    narr: { src: narrEl.currentSrc.split("/").pop(), t: +narrEl.currentTime.toFixed(2), paused: narrEl.paused },
    screenOn: U && U.uScreenOn.value, show });
}
