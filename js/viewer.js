// =====================================================================
//  VIEWER (phone inside the headset)
//  Camera -> defect mask & filters -> barrel distortion -> two eyes.
// =====================================================================
import { DB, TIMING, DEFAULT_CALIBRATION } from "./config.js";
import { LANGUAGES, T, tr } from "./translations.js";
import { paintField, filtersAt, ALL_CONDITIONS } from "./defects.js";
import { isFullscreen, enterFullscreen, keepFullscreen } from "./fullscreen.js";

const $ = id => document.getElementById(id);
const canvas = $("gl");
const MASK_EXTENT = 1.5;   // mask texture covers field coords -1.5 … +1.5
const MASK_SIZE = 256;     // pixels per eye in the mask texture

let fb = null;
let calib = loadCachedCalib();
let started = false;
let running = null;        // { cond, lang, t0 }
let lastCmdTs = 0;
let camOk = false, netOk = false, everConnected = false;
let video = null, stream = null;

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
  const beat = () => fb.set(presenceRef, { lastSeen: fb.serverTimestamp(), started, state: running ? running.cond : "waiting" }).catch(() => {});
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
    if (v) { calib = { ...DEFAULT_CALIBRATION, ...v }; try { localStorage.setItem("calib", JSON.stringify(calib)); } catch (e) {} }
    layoutText();
  });
  fb.onValue(fb.ref(fb.db, DB.command), s => {
    const v = s.val();
    if (!v || !v.condition || !v.timestamp) return;
    if (v.timestamp === lastCmdTs) return;
    const age = fb.serverNow() - v.timestamp;
    lastCmdTs = v.timestamp;
    if (age > 10000) return;            // old command left over in the database
    if (!started || running) return;     // ignore while another one is running
    if (!ALL_CONDITIONS.includes(v.condition)) return;
    startEffect(v.condition, v.language || "en");
    beat();
  });
})();

function loadCachedCalib() {
  try { return { ...DEFAULT_CALIBRATION, ...JSON.parse(localStorage.getItem("calib") || "{}") }; }
  catch (e) { return { ...DEFAULT_CALIBRATION }; }
}

// ---------------------------------------------------------------- effects
let nameTimer = null;
function startEffect(cond, lang) {
  running = { cond, lang, t0: performance.now() };
  const name = tr(lang, `conditions.${cond}.name`);
  for (const id of ["nameL", "nameR"]) { $(id).textContent = name; $(id).lang = lang; $(id).classList.add("on"); }
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => { for (const id of ["nameL", "nameR"]) $(id).classList.remove("on"); }, TIMING.nameShow * 1000);
  updateOverlay();
}
function updateOverlay() {
  const waiting = started && !running && !errState;
  $("waitL").classList.toggle("hidden", !waiting);
  $("waitR").classList.toggle("hidden", !waiting);
}

// ---------------------------------------------------------------- Start button
$("startBtn").addEventListener("click", async () => {
  $("startBtn").disabled = true;
  await enterFullscreen();     // works straight away if the camera was allowed before
  requestWakeLock();
  await startCamera();         // the camera question may take the page out of full screen
  started = true;
  $("startScreen").style.display = "none";
  initGL();
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

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
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

// ---------------------------------------------------------------- WebGL
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform sampler2D uCam;  uniform float uCamAspect; uniform float uHasCam;
uniform sampler2D uMask; uniform float uMaskExtent;
uniform float uK, uZoom, uIpd, uVert, uEye, uRound, uDiv, uTest;
uniform vec2 uNose;
uniform vec4 uFxA0, uFxB0, uFxA1, uFxB1; // A: blur, contrast, tint, glare   B: desat, redDesat, dim, warp

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
  // radius 1 = edge of the eye circle. Masks are applied in m-space, i.e. before distortion.
  float r2 = dot(p, p);
  float k1 = uK, k2 = uK * 0.5;
  vec2 m = p * (1.0 + k1 * r2 + k2 * r2 * r2) / (1.0 + k1 + k2);

  // AMD wavy distortion around the centre
  float warp = B.w * (1.0 - smoothstep(0.16, 0.36, length(m)));
  vec2 cc = (m + warp * 0.022 * vec2(sin(m.y * 46.0), sin(m.x * 46.0 + 1.3))) / uZoom;

  vec3 col;
  if (uTest > 0.5 || uHasCam < 0.5) {
    col = testPattern(m);
  } else {
    col = cam(cc);
    if (A.x > 0.0001) {               // blur
      vec3 s = col;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996;
        float rr = A.x * sqrt((float(i) + 0.5) / 12.0);
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
  vec2 mu = clamp(m / uMaskExtent * 0.5 + 0.5, 0.0, 1.0);
  float dark = texture2D(uMask, vec2((eye + mu.x) * 0.5, mu.y)).a;
  col = mix(col, vec3(0.02), dark);

  col *= vign * cut;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

let gl, prog, U = {}, camTex, maskTex;
const maskCanvas = document.createElement("canvas");
maskCanvas.width = MASK_SIZE * 2; maskCanvas.height = MASK_SIZE;
const maskCtx = maskCanvas.getContext("2d");
const eyeLayer = document.createElement("canvas");
eyeLayer.width = eyeLayer.height = MASK_SIZE;
const eyeCtx = eyeLayer.getContext("2d");
let maskEmpty = false;

function initGL() {
  if (gl) return;
  gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { alert("WebGL is not supported on this phone."); return; }
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ["uRes", "uCam", "uCamAspect", "uHasCam", "uMask", "uMaskExtent", "uK", "uZoom", "uIpd", "uVert", "uEye",
    "uRound", "uDiv", "uTest", "uNose", "uFxA0", "uFxB0", "uFxA1", "uFxB1"]) U[n] = gl.getUniformLocation(prog, n);
  const mkTex = unit => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return t;
  };
  camTex = mkTex(0); maskTex = mkTex(1);
  gl.uniform1i(U.uCam, 0); gl.uniform1i(U.uMask, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  resize();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (gl) gl.viewport(0, 0, w, h);
}
window.addEventListener("resize", () => { resize(); layoutText(); });

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
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
}

function setFx(eyeIdx, fx) {
  gl.uniform4f(U["uFxA" + eyeIdx], fx.blur, fx.contrast, fx.tint, fx.glare);
  gl.uniform4f(U["uFxB" + eyeIdx], fx.desat, fx.redDesat, fx.dim, fx.warp);
}

function loop() {
  requestAnimationFrame(loop);
  if (!gl) return;
  resize();

  let t = 0;
  if (running) {
    t = (performance.now() - running.t0) / 1000;
    if (t >= TIMING.effectTotal) { running = null; updateOverlay(); }
  }

  // camera frame
  const hasCam = camOk && video && video.readyState >= 2 && video.videoWidth > 0;
  if (hasCam) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, camTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
  }
  updateMask(t);

  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform1f(U.uCamAspect, hasCam ? video.videoWidth / video.videoHeight : 1);
  gl.uniform1f(U.uHasCam, hasCam ? 1 : 0);
  gl.uniform1f(U.uMaskExtent, MASK_EXTENT);
  gl.uniform1f(U.uK, calib.distortion);
  gl.uniform1f(U.uZoom, Math.max(0.1, calib.zoom));
  gl.uniform1f(U.uIpd, calib.ipd);
  gl.uniform1f(U.uVert, calib.vertical);
  gl.uniform1f(U.uEye, calib.eyeSize);
  gl.uniform1f(U.uRound, calib.roundness);
  gl.uniform1f(U.uDiv, calib.divider);
  gl.uniform1f(U.uTest, calib.testPattern ? 1 : 0);
  gl.uniform2f(U.uNose, calib.noseWidth, calib.noseHeight);
  const none = filtersAt("", "L", 0);
  setFx(0, running ? filtersAt(running.cond, "L", t) : none);
  setFx(1, running ? filtersAt(running.cond, "R", t) : none);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
