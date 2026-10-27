// =====================================================================
//  CONTROLLER (tablet)
//  The operator controls everything from here. Every change of screen is
//  also written to Firebase (DB.show), so the headset phone shows the same
//  thing in "screen mode", or runs the AR effect.
// =====================================================================
import { DB, STATION, TIMING, MEDIA, DEFAULT_HOTSPOTS, DEFAULT_CALIBRATION, CALIBRATION_SLIDERS, changeStation } from "./config.js";
import { LANGUAGES, T, ADMIN, tr } from "./translations.js";
import { paintField, PATHWAY_DEFECTS, ALL_CONDITIONS, effectLength } from "./defects.js";
import { keepFullscreen } from "./fullscreen.js";
import { Synced, introMedia, pathwayNarration } from "./sync.js";
import { showSignIn } from "./signin.js";

const $ = id => document.getElementById(id);
const app = $("app");

// ---------------------------------------------------------------- state
const S = {
  lang: "en",
  screen: "lang",        // lang | introChoice | intro | eyeStill | pathStill | credits
  prevScreen: "lang",
  modal: null,           // null | card | choice
  cardCondition: null,
  locked: false,
  editing: false,
  hotspots: JSON.parse(JSON.stringify(DEFAULT_HOTSPOTS)),
  calib: { ...DEFAULT_CALIBRATION },
  fbOk: false, online: false, viewerSeen: 0,
  base: { screen: "lang" },   // what both devices show (without a selected part)
  muteVideo: false
};
let fb = null; // Firebase helpers once loaded
const serverNow = () => fb ? fb.serverNow() : Date.now();

// ---------------------------------------------------------------- Firebase
(async () => {
  try {
    fb = await import("./fb.js");
    S.user = await fb.authReady;                  // wait for the saved sign-in before connecting
    if (!S.user) showSignIn(fb);
    S.fbOk = true;
    fb.watchConnection(on => { S.online = on; updateStatus(); });
    fb.onValue(fb.ref(fb.db, DB.presence), s => { const v = s.val(); S.viewerSeen = v && v.lastSeen ? v.lastSeen : 0; S.viewerInfo = v; updateStatus(); showCamInfo(); });
    fb.onValue(fb.ref(fb.db, DB.hotspots), s => {
      const v = s.val() || {};
      for (const kind of ["eye", "pathway"]) {
        for (const id in DEFAULT_HOTSPOTS[kind]) {
          const saved = v[kind] && v[kind][id];
          if (saved && !S.editing) S.hotspots[kind][id] = { ...DEFAULT_HOTSPOTS[kind][id], ...saved };
        }
      }
      if (!S.editing) renderHotspots();
    });
    fb.onValue(fb.ref(fb.db, DB.calibLive), s => {
      const v = s.val();
      if (v && !calibDirty) { S.calib = { ...DEFAULT_CALIBRATION, ...v }; syncSliders(); applySound(); }
    });
    fb.onValue(fb.ref(fb.db, DB.calibProfiles), s => fillProfiles(s.val() || {}));
    pushShow(S.base);   // the phone follows whatever the tablet shows now
  } catch (e) {
    console.error("Firebase failed to load", e);
    toast("Firebase could not load – check the internet connection");
  }
})();
setInterval(updateStatus, 2000);

function viewerConnected() {
  return S.fbOk && S.online && S.viewerSeen && (fb.serverNow() - S.viewerSeen) < 12000;
}
function updateStatus() {
  const on = !!viewerConnected();
  $("dot").classList.toggle("on", on);
  $("statusTxt").textContent = `#${STATION} · ` + tr(S.lang, on ? "headsetOnline" : "headsetOffline");
}

// Tells the phone what to show. state.screen: lang | intro | eyeStill | pathStill | effect
function pushShow(state) {
  if (!fb) return;
  const clean = {};
  for (const [k, v] of Object.entries({ language: S.lang, ...state })) if (v !== undefined && v !== null) clean[k] = v;
  fb.set(fb.ref(fb.db, DB.show), clean).catch(e => toast("Could not send: " + e.message));
}

// ---------------------------------------------------------------- audio
// Web Audio is used for volume so that it also works on iPads.
const video = $("video"), still = $("still"), stage = $("stage");
const narration = new Audio();
const introSync = new Synced(video, serverNow);
const narrSync = new Synced(narration, serverNow);
setInterval(() => { introSync.tick(); narrSync.tick(); checkIntroEnd(); }, 250);
let actx = null, videoGain = null, narrGain = null;
function initAudio() {
  if (actx) { if (actx.state === "suspended") actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    videoGain = actx.createGain();
    narrGain = actx.createGain(); narrGain.gain.value = TIMING.narrationVolume;
    actx.createMediaElementSource(video).connect(videoGain).connect(actx.destination);
    actx.createMediaElementSource(narration).connect(narrGain).connect(actx.destination);
  } catch (e) {
    console.warn("Web Audio not available, using element volume", e);
    actx = null; narration.volume = TIMING.narrationVolume;
  }
  applySound();
}
// "Sound from" setting: the tablet is silent when it is set to "Phone only".
function applySound() {
  const tabletSound = S.calib.soundFrom !== "phone";
  const v = tabletSound && !S.muteVideo ? 1 : 0;
  video.muted = v === 0;
  if (videoGain) videoGain.gain.value = v; else video.volume = v;
  narration.muted = !tabletSound;
}
// Browsers only allow sound after a tap: start each element inside the tap (the sync pauses it again until startAt).
function unlock(el) { const p = el.play(); if (p) p.catch(() => {}); }
function stopMedia() {
  introSync.stop(); narrSync.stop();
  video.onerror = null;
}

// ---------------------------------------------------------------- language & text
function buildLanguageScreen() {
  $("chooseAll").innerHTML = LANGUAGES.map(l => `<span lang="${l.code}">${T[l.code].chooseLanguage}</span>`).join("");
  const box = $("langButtons");
  for (const l of LANGUAGES) {
    const b = document.createElement("button");
    b.className = "glass lang-btn"; b.textContent = l.label; b.lang = l.code;
    b.onclick = () => chooseLanguage(l.code);
    box.appendChild(b);
  }
}
function applyText() {
  const L = S.lang;
  document.body.className = "lang-" + L;
  document.documentElement.lang = L;
  $("backTxt").textContent = tr(L, "back");
  $("homeTxt").textContent = tr(L, "home");
  $("creditsBtn").textContent = tr(L, "credits");
  $("cardAR").textContent = tr(L, "showInAR");
  $("choiceTitle").textContent = tr(L, "opticNerveChoose");
  $("choiceNeuritis").textContent = tr(L, "opticNeuritisBtn");
  $("choiceField").textContent = tr(L, "visualFieldBtn");
  $("introQ").textContent = tr(L, "introQuestion");
  $("introWatch").textContent = tr(L, "watchIntro");
  $("introSkip").textContent = tr(L, "skipIntro");
  $("creditsTitle").textContent = tr(L, "creditsTitle");
  $("creditsBody").innerHTML = "";
  for (const line of tr(L, "creditsBody")) { const p = document.createElement("p"); p.textContent = line; $("creditsBody").appendChild(p); }
  renderHotspots();
  updateStatus();
}

// ---------------------------------------------------------------- screens
// Looping, silent background video on the language screen.
const homeVideo = $("homeVideo");
homeVideo.muted = true;
homeVideo.addEventListener("playing", () => { homeVideo.classList.add("ready"); $("langScreen").classList.add("has-video"); });
homeVideo.addEventListener("error", () => { homeVideo.classList.remove("ready"); $("langScreen").classList.remove("has-video"); });
function setHomeVideo(on) {
  if (on) homeVideo.play().catch(() => {}); else homeVideo.pause();
}

function setScreen(name) {
  S.screen = name;
  setHomeVideo(name === "lang");
  const section = name === "lang" ? "langScreen" : name === "credits" ? "creditsScreen" :
    name === "introChoice" ? "introChoiceScreen" : "stageScreen";
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("active", s.id === section);
  app.classList.toggle("lang-screen", name === "lang");
  const stillShown = name === "eyeStill" || name === "pathStill";
  stage.classList.toggle("show-hotspots", stillShown);
  renderHotspots();
  resetIdle();
  showHint();
}

// Language chosen: both devices ask "Would you like to watch an introduction to the eye?";
// the guide answers on the tablet.
let introMediaCache = {};
for (const l of LANGUAGES) introMedia(l.code).then(m => { introMediaCache[l.code] = m; });
async function chooseLanguage(code) {
  if (S.locked) return;
  S.lang = code;
  applyText();
  initAudio();
  stopMedia(); closeModal(); clearLesions();
  setScreen("introChoice");
  S.base = { screen: "introChoice" };
  pushShow(S.base);
  if (!viewerConnected()) toast(tr(S.lang, "headsetOffline"));
}
// "Watch the introduction": both devices start the intro video together, 2 seconds from now.
async function startIntro() {
  if (S.locked || S.screen !== "introChoice") return;
  initAudio();
  const m = introMediaCache[S.lang] || await introMedia(S.lang);
  const startAt = serverNow() + TIMING.startDelay * 1000;
  S.muteVideo = m.muteVideo; applySound();
  setStill(MEDIA.eyeStill);
  still.classList.remove("shown");
  video.classList.remove("hidden");
  setScreen("intro");
  introSync.play(m.src, startAt); unlock(video);
  if (m.narr) { narrSync.play(m.narr, startAt); unlock(narration); }
  introSync.tick(); narrSync.tick();
  video.onerror = () => { if (S.screen === "intro") { toast(tr(S.lang, "videoMissing")); showStillOnly("eye"); } };
  S.base = { screen: "intro", startAt, src: m.src, narr: m.narr, muteVideo: m.muteVideo };
  pushShow(S.base);
}
// When the intro video ends, both devices show the eye picture.
function checkIntroEnd() {
  if (S.screen === "intro" && (introSync.ended() || video.ended)) showStillOnly("eye");
}

function setStill(src) {
  if (still.getAttribute("src") !== src) {
    still.src = src;
    still.onload = () => stage.style.setProperty("--ar", (still.naturalWidth / still.naturalHeight).toFixed(4));
    still.onerror = () => toast("Image missing: " + src);
  }
}

// Shows a still picture on both devices. narr = narration that plays with it (pathway).
function showStillOnly(kind, narr = null) {
  stopMedia(); closeModal(true); clearLesions();
  const src = kind === "eye" ? MEDIA.eyeStill : MEDIA.pathStill;
  setStill(src);
  still.classList.add("shown");
  video.classList.add("hidden");
  const screen = kind === "eye" ? "eyeStill" : "pathStill";
  setScreen(screen);
  S.base = { screen, still: src };
  if (narr) {
    const startAt = serverNow() + TIMING.startDelay * 1000;
    narrSync.play(narr, startAt); unlock(narration); narrSync.tick();
    Object.assign(S.base, { narr, startAt });
  }
  pushShow(S.base);
}
// "Visual field defects": pathway picture + its narration, in step on both devices.
function showPathway() {
  initAudio();
  showStillOnly("pathway", pathwayNarration(S.lang));
}

function goBack() {
  if (S.locked) return;
  if (S.modal) { closeModal(); return; }
  switch (S.screen) {
    case "credits": setScreen(S.prevScreen === "credits" ? "lang" : S.prevScreen); break;
    case "introChoice": case "intro": case "eyeStill": goHome(); break;
    case "pathStill": showStillOnly("eye"); break;
  }
}
function goHome() {
  if (S.locked) return;
  stopMedia(); closeModal(true); clearLesions();
  setScreen("lang");
  S.base = { screen: "lang" };
  pushShow(S.base);
}

// ---------------------------------------------------------------- hotspots
function currentKind() {
  return S.screen === "eyeStill" ? "eye" : S.screen === "pathStill" ? "pathway" : null;
}
function renderHotspots() {
  const box = $("hotspots");
  box.innerHTML = "";
  const kind = currentKind();
  if (!kind) return;
  let i = 0;
  for (const [id, h] of Object.entries(S.hotspots[kind])) {
    const b = document.createElement("button");
    b.className = "hotspot";
    b.dataset.id = id;
    b.style.left = h.x + "%"; b.style.top = h.y + "%"; b.style.width = (h.r * 2) + "%";
    b.style.setProperty("--delay", (i++ * 0.3) + "s");
    b.setAttribute("aria-label", tr(S.lang, "hotspots." + id));
    b.innerHTML = `<span class="lbl">${tr("en", "hotspots." + id)}</span><span class="handle"></span>`;
    b.addEventListener("click", () => { if (!S.editing) hotspotTapped(kind, id); });
    attachEditDrag(b, kind, id);
    box.appendChild(b);
  }
}

let highlight = null;
function hotspotTapped(kind, id) {
  if (S.locked || S.modal) return;
  hideHand();
  highlight = id;
  if (kind === "eye") {
    if (id === "lens") openCard("cataract");
    else if (id === "retina") openCard("amd");
    else if (id === "opticDisc") openCard("glaucoma");
    else if (id === "opticNerve") openChoice();
  } else if (PATHWAY_DEFECTS.includes(id)) {
    // red lesion on the tablet, glowing part + name on the phone, then the operator taps "Show in VR"
    const h = S.hotspots.pathway[id];
    const l = document.createElement("div");
    l.className = "lesion"; l.style.left = h.x + "%"; l.style.top = h.y + "%";
    $("lesions").appendChild(l);
    openCard(id);
  }
}
function clearLesions() { $("lesions").innerHTML = ""; }

// ---------------------------------------------------------------- cards
function openCard(cond) {
  S.cardCondition = cond;
  const pathway = PATHWAY_DEFECTS.includes(cond);
  $("cardTitle").textContent = tr(S.lang, `conditions.${cond}.name`);
  $("cardLine1").textContent = pathway ? tr(S.lang, `hotspots.${cond}`) : tr(S.lang, `conditions.${cond}.line1`);
  $("cardLine2").textContent = pathway ? tr(S.lang, `conditions.${cond}.field`) : tr(S.lang, `conditions.${cond}.line2`);
  $("choice").classList.remove("open");
  $("card").classList.add("open");
  S.modal = "card";
  const part = highlight || (cond === "neuritis" ? "opticNerve" : null);
  pushShow({ ...S.base, highlight: part, title: tr(S.lang, `conditions.${cond}.name`),
    subtitle: part ? tr(S.lang, `hotspots.${part}`) : null });
}
function openChoice() {
  $("choice").classList.add("open");
  S.modal = "choice";
  pushShow({ ...S.base, highlight: "opticNerve", title: tr(S.lang, "hotspots.opticNerve"),
    subtitle: `${tr(S.lang, "opticNeuritisBtn")}  ·  ${tr(S.lang, "visualFieldBtn")}` });
}
// quiet = the caller sends its own new screen to the phone
function closeModal(quiet = false) {
  const had = S.modal;
  $("card").classList.remove("open");
  $("choice").classList.remove("open");
  S.modal = null;
  highlight = null;
  if (currentKind() === "pathway") clearLesions();
  resetIdle();
  if (had && !quiet) pushShow(S.base);
}

// ---------------------------------------------------------------- Show in VR + countdown
// Phone: "Loading…" for 2 s while it switches to the camera, then the AR effect for 20 s.
// Tablet: visual field diagram + countdown, buttons locked.
let cdTimer = null, cdRaf = 0;
function sendCondition(cond) {
  if (S.locked) return;
  S.locked = true; app.classList.add("locked");
  hideHand();
  narrSync.stop();
  const startAt = serverNow() + TIMING.loading * 1000;
  const total = effectLength(S.calib, cond);   // seconds, set per condition in the calibration panel
  const back = { ...S.base };
  delete back.narr; delete back.startAt;        // do not replay the narration afterwards
  pushShow({ screen: "effect", condition: cond, startAt, duration: total, returnTo: back });
  if (!viewerConnected()) toast(tr(S.lang, "headsetOffline"));

  // diagram panel
  $("lookText").textContent = tr(S.lang, "lookInHeadset");
  $("fieldName").textContent = tr(S.lang, `conditions.${cond}.name`);
  $("fieldLine").textContent = tr(S.lang, `conditions.${cond}.field`);
  app.classList.add("diagram");
  $("card").classList.remove("open"); $("choice").classList.remove("open");

  const frame = () => {
    const t = (serverNow() - startAt) / 1000;
    const loading = t < 0;
    $("lookText").textContent = tr(S.lang, loading ? "loading" : "lookInHeadset");
    drawDiagram(cond, Math.max(0, Math.min(t, total)), total);
    const left = Math.max(0, Math.min(total, total - t));
    $("cdNum").textContent = Math.ceil(left);
    $("cdBar").style.strokeDashoffset = (276.5 * (1 - left / total)).toFixed(1);
    if (t < total) cdRaf = requestAnimationFrame(frame);
  };
  cancelAnimationFrame(cdRaf);
  cdRaf = requestAnimationFrame(frame);

  clearTimeout(cdTimer);
  cdTimer = setTimeout(() => {
    cancelAnimationFrame(cdRaf);
    app.classList.remove("diagram", "locked");
    S.locked = false;
    S.modal = null;
    closeModal(true);
    clearLesions();
    S.base = back;
    pushShow(back);                              // the phone goes back to the same picture
  }, (TIMING.loading + total) * 1000);
}

// Two patient-view visual field circles drawn from the shared defect data.
const layer = document.createElement("canvas");
function drawDiagram(cond, t, total, cv = $("fieldCanvas")) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
  if (!W || !H) return;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const c = cv.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const R = Math.min(W / 4.5, H / 2.6);
  const size = Math.round(R * 2);
  if (layer.width !== size) { layer.width = size; layer.height = size; }
  const lctx = layer.getContext("2d");
  const fontPx = Math.round(R * 0.2);
  [["L", W * 0.27], ["R", W * 0.73]].forEach(([eye, cx]) => {
    const cy = R * 1.05;
    // background + axes
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = "rgba(214,222,238,0.92)"; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, size, size);
    paintField(lctx, size, cond, eye, t, { color: [92, 78, 56], kinds: ["dark", "haze", "warp"], extent: 1, total });
    c.drawImage(layer, cx - R, cy - R, 2 * R, 2 * R);
    c.strokeStyle = "rgba(8,18,42,0.22)"; c.lineWidth = 1 * dpr;
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    c.restore();
    // outline + fixation dot
    c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.5 * dpr;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#ffb547"; c.beginPath(); c.arc(cx, cy, 3 * dpr, 0, Math.PI * 2); c.fill();
    // label
    c.fillStyle = "#f3f1ea";
    c.font = `600 ${fontPx}px "Noto Sans","Noto Sans Tamil","Noto Sans Sinhala",sans-serif`;
    c.textAlign = "center"; c.textBaseline = "top";
    c.fillText(tr(S.lang, eye === "L" ? "leftEye" : "rightEye"), cx, cy + R + fontPx * 0.5);
  });
}

// ---------------------------------------------------------------- idle hand + hint
let idleTimer = null, handTimer = null, handIdx = 0;
function resetIdle() {
  hideHand();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showHand, TIMING.idleHand * 1000);
}
function showHand() {
  const kind = currentKind();
  if (!kind || S.locked || S.modal || S.editing) { resetIdle(); return; }
  const ids = Object.keys(S.hotspots[kind]);
  const place = () => {
    const h = S.hotspots[kind][ids[handIdx++ % ids.length]];
    const hand = $("hand");
    hand.style.left = h.x + "%"; hand.style.top = h.y + "%";
    hand.classList.add("on");
  };
  place();
  clearInterval(handTimer);
  handTimer = setInterval(place, 2800);
}
function hideHand() {
  $("hand").classList.remove("on");
  clearInterval(handTimer);
}
let hintTimer = null;
function showHint() {
  const kind = currentKind();
  const h = $("hint");
  clearTimeout(hintTimer);
  if (!kind) { h.classList.remove("on"); return; }
  h.textContent = tr(S.lang, kind === "eye" ? "tapToExplore" : "tapPathway");
  h.classList.add("on");
  hintTimer = setTimeout(() => h.classList.remove("on"), 4000);
}
document.addEventListener("pointerdown", () => { if (!S.locked) resetIdle(); }, true);

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3500);
}

// ---------------------------------------------------------------- hidden long-press corners
function longPress(el, ms, fn) {
  let timer = null;
  el.addEventListener("pointerdown", e => { e.preventDefault(); timer = setTimeout(fn, ms); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => clearTimeout(timer));
  el.addEventListener("contextmenu", e => e.preventDefault());
}
longPress($("cornerTL"), 3000, () => setEditing(!S.editing));
longPress($("cornerTR"), 3000, () => $("calibPanel").classList.toggle("open"));
$("gearBtn").onclick = () => $("calibPanel").classList.toggle("open");   // visible settings button

// ---------------------------------------------------------------- EDIT MODE
function setEditing(on) {
  S.editing = on;
  app.classList.toggle("editing", on);
  if (on) {
    if (!currentKind()) showStillOnly("eye");
    hideHand();
    toast(ADMIN.editTitle);
  } else {
    renderHotspots();
  }
}
function attachEditDrag(el, kind, id) {
  let mode = null, start = null;
  el.addEventListener("pointerdown", e => {
    if (!S.editing) return;
    e.preventDefault(); e.stopPropagation();
    mode = e.target.classList.contains("handle") ? "resize" : "move";
    el.setPointerCapture(e.pointerId);
    start = { ...S.hotspots[kind][id] };
  });
  el.addEventListener("pointermove", e => {
    if (!S.editing || !mode) return;
    const r = stage.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * 100, py = (e.clientY - r.top) / r.height * 100;
    const h = S.hotspots[kind][id];
    if (mode === "move") {
      h.x = Math.max(0, Math.min(100, px)); h.y = Math.max(0, Math.min(100, py));
    } else {
      const dx = (px - h.x), dy = (py - h.y) * r.height / r.width;
      h.r = Math.max(1, Math.min(25, Math.hypot(dx, dy) / 1.36));
    }
    el.style.left = h.x + "%"; el.style.top = h.y + "%"; el.style.width = (h.r * 2) + "%";
  });
  const end = () => { mode = null; };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}
const round2 = v => Math.round(v * 100) / 100;
$("editEye").onclick = () => showStillOnly("eye");
$("editPath").onclick = () => showStillOnly("pathway");
$("editReset").onclick = () => {
  const kind = currentKind(); if (!kind) return;
  S.hotspots[kind] = JSON.parse(JSON.stringify(DEFAULT_HOTSPOTS[kind]));
  renderHotspots();
};
$("editSave").onclick = () => {
  if (!fb) { toast("Firebase not connected"); return; }
  const data = {};
  for (const kind of ["eye", "pathway"]) {
    data[kind] = {};
    for (const [id, h] of Object.entries(S.hotspots[kind])) data[kind][id] = { x: round2(h.x), y: round2(h.y), r: round2(h.r) };
  }
  fb.set(fb.ref(fb.db, DB.hotspots), data).then(() => toast(ADMIN.saved)).catch(e => toast(e.message));
};
$("editDone").onclick = () => setEditing(false);

// ---------------------------------------------------------------- CALIBRATION MODE
let calibDirty = false, calibSendTimer = null;
function buildCalibration() {
  $("calibTitle").textContent = `${ADMIN.calibTitle} – station ${STATION}`;
  // which station this tablet controls (its phones must use the same number)
  $("stationInput").value = STATION;
  $("stationSet").onclick = () => changeStation($("stationInput").value);
  $("tpLabel").textContent = ADMIN.testPattern;
  $("calibReset").textContent = ADMIN.resetDefault;
  $("profileName").placeholder = ADMIN.profileName;
  $("profileSave").textContent = ADMIN.saveProfile;
  $("profileLoad").textContent = ADMIN.loadProfile;
  for (const s of CALIBRATION_SLIDERS) {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `<div class="top"><span>${ADMIN.sliders[s.key]}</span><b id="v_${s.key}"></b></div>
      <input type="range" id="s_${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">`;
    $("sliders").appendChild(row);
    row.querySelector("input").addEventListener("input", e => {
      S.calib[s.key] = parseFloat(e.target.value);
      $("v_" + s.key).textContent = fmt(s, S.calib[s.key]);
      pushCalib();
    });
  }
  // Sound from: Both / Phone only / Tablet only
  const row = document.createElement("div");
  row.className = "seg-row";
  row.innerHTML = `<span>${ADMIN.soundTitle}</span><div class="seg"></div>`;
  for (const [value, label] of [["both", ADMIN.sBoth], ["phone", ADMIN.sPhone], ["tablet", ADMIN.sTablet]]) {
    const b = document.createElement("button");
    b.className = "glass admin"; b.textContent = label; b.dataset.key = "soundFrom"; b.dataset.value = value;
    b.onclick = () => { S.calib.soundFrom = value; syncSliders(); applySound(); pushCalib(); };
    row.querySelector(".seg").appendChild(b);
  }
  $("segs").appendChild(row);
  // Effect length for each condition: 10–40 s in steps of 5 s
  const dur = $("durations");
  dur.innerHTML = `<div class="seg-row"><span>${ADMIN.durationTitle}</span></div>`;
  for (const c of ALL_CONDITIONS) {
    const r = document.createElement("div");
    r.className = "dur-row";
    r.innerHTML = `<span>${tr("en", `conditions.${c}.name`)}</span><input type="range" min="10" max="40" step="5" data-cond="${c}"><b></b>`;
    r.querySelector("input").addEventListener("input", e => {
      S.calib.durations = { ...(S.calib.durations || {}), [c]: Number(e.target.value) };
      r.querySelector("b").textContent = e.target.value;
      pushCalib();
    });
    dur.appendChild(r);
  }
  $("tpSwitch").addEventListener("change", e => { S.calib.testPattern = e.target.checked; pushCalib(); });
  // "Reset to default" resets the headset fit; sound and effect lengths stay as they are
  $("calibReset").onclick = () => { S.calib = { ...DEFAULT_CALIBRATION, soundFrom: S.calib.soundFrom, durations: S.calib.durations }; syncSliders(); pushCalib(); };
  $("calibClose").onclick = () => $("calibPanel").classList.remove("open");
  showCamInfo();
  $("profileSave").onclick = () => {
    const name = $("profileName").value.trim().replace(/[.#$\[\]\/]/g, "-");
    if (!name) { toast(ADMIN.profileName + "?"); return; }
    if (!fb) { toast("Firebase not connected"); return; }
    fb.set(fb.ref(fb.db, `${DB.calibProfiles}/${name}`), { ...S.calib, testPattern: false })
      .then(() => toast(ADMIN.saved + ": " + name)).catch(e => toast(e.message));
  };
  $("profileLoad").onclick = () => {
    const p = profiles[$("profileList").value];
    if (!p) return;
    S.calib = { ...DEFAULT_CALIBRATION, ...p, testPattern: S.calib.testPattern, soundFrom: S.calib.soundFrom, durations: S.calib.durations };
    $("profileName").value = $("profileList").value;
    syncSliders(); pushCalib();
  };
  for (const b of $("calibPanel").querySelectorAll("button")) b.classList.add("admin");
  for (const b of $("editBar").querySelectorAll("button")) b.classList.add("admin");
  $("editEye").textContent = ADMIN.eyeImage; $("editPath").textContent = ADMIN.pathwayImage;
  $("editReset").textContent = ADMIN.resetHotspots; $("editSave").textContent = ADMIN.save;
  $("editDone").textContent = ADMIN.done; $("editTitle").textContent = ADMIN.editTitle;
  $("editHelp").textContent = ADMIN.editHelp;
  syncSliders();
}
function syncSliders() {
  for (const s of CALIBRATION_SLIDERS) {
    const v = S.calib[s.key];
    $("s_" + s.key).value = v;
    $("v_" + s.key).textContent = fmt(s, v);
  }
  $("tpSwitch").checked = !!S.calib.testPattern;
  for (const b of document.querySelectorAll("#segs .seg button")) b.classList.toggle("on", S.calib[b.dataset.key] === b.dataset.value);
  for (const i of document.querySelectorAll("#durations input")) {
    i.value = effectLength(S.calib, i.dataset.cond);
    i.nextElementSibling.textContent = i.value;
  }
}
function pushCalib() {
  calibDirty = true;
  clearTimeout(calibSendTimer);
  calibSendTimer = setTimeout(() => {
    if (fb) fb.set(fb.ref(fb.db, DB.calibLive), S.calib).finally(() => { calibDirty = false; });
    else calibDirty = false;
  }, 60);
}
// What the headset phone actually got from its camera and screen
function showCamInfo() {
  const box = $("camInfo"); if (!box) return;
  const who = S.user ? `Signed in as <b>${S.user.email}</b> · <a href="#" id="signOut">Sign out</a><br>` : `<span class="warn">Not signed in</span> · <a href="#" id="signInNow">Sign in</a><br>`;
  setTimeout(() => {
    const o = $("signOut"); if (o) o.onclick = e => { e.preventDefault(); fb.signOut().then(() => location.reload()); };
    const n = $("signInNow"); if (n) n.onclick = e => { e.preventDefault(); if (fb) showSignIn(fb); };
  });
  const v = S.viewerInfo;
  if (!v || !v.camera) { box.innerHTML = who + "Headset camera: <b>waiting for the phone…</b> (tap Start on the phone)"; return; }
  const c = v.camera, sc = v.screen || {};
  const low = c.width && c.width < 1280;
  box.innerHTML = who +
    `Headset camera: <b class="${low ? "warn" : ""}">${c.width}×${c.height}</b> at <b>${c.fps || "?"} fps</b>` +
    (low ? ` <span class="warn">(low – this phone/browser did not give HD)</span>` : "") +
    `<br>Autofocus: <b>${c.autofocus}</b> · Auto exposure: <b>${c.autoexposure}</b>` +
    `<br>Screen: <b>${sc.width}×${sc.height}</b> pixels (density ${sc.dpr}×) · <b>${sc.fps}</b> frames/s` +
    (v.preload && v.preload.total ? `<br>Videos and sounds stored on the phone: <b>${v.preload.done} of ${v.preload.total}</b>` : "");
}
function fmt(s, v) { const d = s.step >= 1 ? 0 : s.step >= 0.05 ? 2 : 3; return Number(v).toFixed(d); }
let profiles = {};
function fillProfiles(p) {
  profiles = p;
  const sel = $("profileList");
  sel.innerHTML = Object.keys(p).length ? "" : "<option value=''>—</option>";
  for (const name of Object.keys(p)) { const o = document.createElement("option"); o.value = o.textContent = name; sel.appendChild(o); }
}

// ---------------------------------------------------------------- wire up
$("backBtn").onclick = goBack;
$("homeBtn").onclick = goHome;
$("creditsBtn").onclick = () => { S.prevScreen = S.screen; setScreen("credits"); };
$("cardClose").onclick = () => closeModal();
$("choiceClose").onclick = () => closeModal();
$("cardAR").onclick = () => { if (!S.locked && S.cardCondition) sendCondition(S.cardCondition); };
$("choiceNeuritis").onclick = () => openCard("neuritis");
$("choiceField").onclick = () => showPathway();
$("introWatch").onclick = () => startIntro();
$("introSkip").onclick = () => { if (!S.locked && S.screen === "introChoice") { initAudio(); showStillOnly("eye"); } };
document.addEventListener("contextmenu", e => e.preventDefault());

keepFullscreen(); // first tap anywhere makes the tablet full screen
buildLanguageScreen();
buildCalibration();
applyText();
setScreen("lang");
