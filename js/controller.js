// =====================================================================
//  CONTROLLER (tablet)
// =====================================================================
import { DB, STATION, TIMING, MEDIA, VIDEO_BUILT_IN_LANGUAGE, DEFAULT_HOTSPOTS, DEFAULT_CALIBRATION, CALIBRATION_SLIDERS } from "./config.js";
import { LANGUAGES, T, ADMIN, tr } from "./translations.js";
import { paintField, PATHWAY_DEFECTS, ALL_CONDITIONS } from "./defects.js";
import { keepFullscreen } from "./fullscreen.js";

const $ = id => document.getElementById(id);
const app = $("app");

// ---------------------------------------------------------------- state
const S = {
  lang: "en",
  screen: "lang",        // lang | eyeVideo | eyeStill | pathVideo | pathStill | headset | credits
  prevScreen: "lang",
  modal: null,           // null | card | choice
  cardCondition: null,
  locked: false,
  editing: false,
  hotspots: JSON.parse(JSON.stringify(DEFAULT_HOTSPOTS)),
  calib: { ...DEFAULT_CALIBRATION },
  fbOk: false, online: false, viewerSeen: 0,
  explore: null          // what the visitor is doing inside the headset (3D selection)
};
let fb = null; // Firebase helpers once loaded

// ---------------------------------------------------------------- Firebase
(async () => {
  try {
    fb = await import("./fb.js");
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
      if (v && !calibDirty) { S.calib = { ...DEFAULT_CALIBRATION, ...v }; syncSliders(); }
    });
    fb.onValue(fb.ref(fb.db, DB.calibProfiles), s => fillProfiles(s.val() || {}));
    fb.onValue(fb.ref(fb.db, DB.explore), s => { S.explore = s.val(); updateMirror(); });
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

// ---------------------------------------------------------------- audio
// Web Audio is used for volume so that 60 % also works on iPads.
const video = $("video"), still = $("still"), stage = $("stage");
const narration = new Audio();
narration.preload = "auto";
let actx = null, videoGain = null, narrGain = null;
function initAudio() {
  if (actx) { if (actx.state === "suspended") actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    videoGain = actx.createGain(); videoGain.gain.value = TIMING.videoVolume;
    narrGain = actx.createGain(); narrGain.gain.value = TIMING.narrationVolume;
    actx.createMediaElementSource(video).connect(videoGain).connect(actx.destination);
    actx.createMediaElementSource(narration).connect(narrGain).connect(actx.destination);
  } catch (e) {
    console.warn("Web Audio not available, using element volume", e);
    actx = null; video.volume = TIMING.videoVolume; narration.volume = TIMING.narrationVolume;
  }
}
function setVideoVolume(v) {
  video.muted = v === 0;
  if (videoGain) videoGain.gain.value = v; else video.volume = v;
}
function stopMedia() {
  video.pause(); narration.pause();
  video.onended = video.onerror = null;
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
  const section = name === "lang" ? "langScreen" : name === "credits" ? "creditsScreen" : name === "headset" ? "headsetScreen" : "stageScreen";
  for (const s of document.querySelectorAll(".screen")) s.classList.toggle("active", s.id === section);
  app.classList.toggle("lang-screen", name === "lang");
  const stillShown = name === "eyeStill" || name === "pathStill";
  stage.classList.toggle("show-hotspots", stillShown);
  renderHotspots();
  resetIdle();
  showHint();
}

function chooseLanguage(code) {
  S.lang = code;
  applyText();
  initAudio();
  playIntro("eye");
}

// Plays the video + narration, then shows the matching still image in the same box.
function playIntro(kind) {
  stopMedia();
  closeModal();
  clearLesions();
  const isEye = kind === "eye";
  const langSrc = (isEye ? MEDIA.eyeVideoLang : MEDIA.pathVideoLang).replace("{lang}", S.lang);
  const sharedSrc = isEye ? MEDIA.eyeVideo : MEDIA.pathVideo;
  const aSrc = (isEye ? MEDIA.eyeNarration : MEDIA.pathNarration).replace("{lang}", S.lang);
  const videoScreen = isEye ? "eyeVideo" : "pathVideo";
  setStill(isEye ? MEDIA.eyeStill : MEDIA.pathStill);
  still.classList.remove("shown");
  video.classList.remove("hidden");
  setScreen(videoScreen);

  const finish = () => {
    if (S.screen !== videoScreen) return;
    narration.pause();
    if (isEye && headsetSelection()) { startHeadsetSelection(); return; }
    still.classList.add("shown");
    video.classList.add("hidden");
    setScreen(isEye ? "eyeStill" : "pathStill");
  };
  video.onended = finish;

  // 1) the video made for this language, with its own sound
  setVideoVolume(1);
  video.onerror = () => {
    if (S.screen !== videoScreen) return;
    console.warn("No language video, using shared video:", langSrc);
    // 2) shared video + separate narration file
    video.onerror = () => { toast(tr(S.lang, "videoMissing")); finish(); };
    video.src = sharedSrc;
    video.play().catch(e => console.warn(e));
    if (VIDEO_BUILT_IN_LANGUAGE && S.lang === VIDEO_BUILT_IN_LANGUAGE) {
      setVideoVolume(1);                       // the video already speaks this language
    } else {
      setVideoVolume(VIDEO_BUILT_IN_LANGUAGE ? 0 : TIMING.videoVolume); // mute the built-in voice
      narration.src = aSrc;
      narration.onerror = () => console.warn("Narration missing:", aSrc);
      narration.play().catch(() => {});
    }
  };
  video.src = langSrc;
  video.play().catch(e => console.warn(e));
}

function setStill(src) {
  if (still.getAttribute("src") !== src) {
    still.src = src;
    still.onload = () => stage.style.setProperty("--ar", (still.naturalWidth / still.naturalHeight).toFixed(4));
    still.onerror = () => toast("Image missing: " + src);
  }
}

function goBack() {
  if (S.locked) return;
  if (S.modal) { closeModal(); return; }
  switch (S.screen) {
    case "credits": setScreen(S.prevScreen === "credits" ? "lang" : S.prevScreen); break;
    case "eyeVideo": case "eyeStill": case "headset": goHome(); break;
    case "pathVideo": case "pathStill": showStillOnly("eye"); break;
  }
}
function goHome() {
  if (S.locked) return;
  if (S.screen === "headset") sendCommand({ mode: "idle" });   // headset goes back to "Please wait"
  stopMedia(); closeModal(); clearLesions();
  stopMirrorDiagram();
  setScreen("lang");
}
function showStillOnly(kind) {
  stopMedia(); closeModal(); clearLesions();
  setStill(kind === "eye" ? MEDIA.eyeStill : MEDIA.pathStill);
  still.classList.add("shown");
  video.classList.add("hidden");
  setScreen(kind === "eye" ? "eyeStill" : "pathStill");
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

function hotspotTapped(kind, id) {
  if (S.locked || S.modal) return;
  hideHand();
  if (kind === "eye") {
    if (id === "lens") openCard("cataract");
    else if (id === "retina") openCard("amd");
    else if (id === "opticDisc") openCard("glaucoma");
    else if (id === "opticNerve") openChoice();
  } else if (PATHWAY_DEFECTS.includes(id)) {
    // red lesion for 2 s, then send automatically
    S.locked = true; app.classList.add("locked");
    const h = S.hotspots.pathway[id];
    const l = document.createElement("div");
    l.className = "lesion"; l.style.left = h.x + "%"; l.style.top = h.y + "%";
    $("lesions").appendChild(l);
    setTimeout(() => sendCondition(id), TIMING.lesionShow * 1000);
  }
}
function clearLesions() { $("lesions").innerHTML = ""; }

// ---------------------------------------------------------------- cards
function openCard(cond) {
  S.cardCondition = cond;
  $("cardTitle").textContent = tr(S.lang, `conditions.${cond}.name`);
  $("cardLine1").textContent = tr(S.lang, `conditions.${cond}.line1`);
  $("cardLine2").textContent = tr(S.lang, `conditions.${cond}.line2`);
  $("choice").classList.remove("open");
  $("card").classList.add("open");
  S.modal = "card";
}
function openChoice() {
  $("choice").classList.add("open");
  S.modal = "choice";
}
function closeModal() {
  $("card").classList.remove("open");
  $("choice").classList.remove("open");
  S.modal = null;
  resetIdle();
}

// ---------------------------------------------------------------- sending + countdown
let cdTimer = null, cdRaf = 0;
function sendCondition(cond) {
  const kindBefore = currentKind();
  S.locked = true; app.classList.add("locked");
  hideHand();
  if (fb) {
    fb.set(fb.ref(fb.db, DB.command), { condition: cond, language: S.lang, timestamp: fb.serverTimestamp() })
      .catch(e => toast("Could not send: " + e.message));
  }
  if (!viewerConnected()) toast(tr(S.lang, "headsetOffline"));

  // diagram panel
  $("lookText").textContent = tr(S.lang, "lookInHeadset");
  $("fieldName").textContent = tr(S.lang, `conditions.${cond}.name`);
  $("fieldLine").textContent = tr(S.lang, `conditions.${cond}.field`);
  app.classList.add("diagram");
  $("card").classList.remove("open"); $("choice").classList.remove("open");

  const t0 = performance.now();
  const total = TIMING.effectTotal;
  const frame = () => {
    const t = (performance.now() - t0) / 1000;
    drawDiagram(cond, Math.min(t, total));
    const left = Math.max(0, total - t);
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
    clearLesions();
    S.modal = null;
    // back to the screen the visitor was on (the still image)
    if (kindBefore) setScreen(kindBefore === "eye" ? "eyeStill" : "pathStill");
  }, total * 1000);
}

// Two patient-view visual field circles drawn from the shared defect data.
const layer = document.createElement("canvas");
function drawDiagram(cond, t, cv = $("fieldCanvas")) {
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
    paintField(lctx, size, cond, eye, t, { color: [92, 78, 56], kinds: ["dark", "haze", "warp"], extent: 1 });
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

// ---------------------------------------------------------------- HEADSET SELECTION (3D eye in the headset)
function headsetSelection() { return S.calib.selection === "headset"; }
function sendCommand(extra) {
  if (!fb) { toast("Firebase not connected"); return; }
  fb.set(fb.ref(fb.db, DB.command), { language: S.lang, ...extra, timestamp: fb.serverTimestamp() })
    .catch(e => toast("Could not send: " + e.message));
}
function startHeadsetSelection() {
  stopMedia();
  video.classList.add("hidden");
  S.explore = null;
  setScreen("headset");
  applyHeadsetText();
  updateMirror();
  sendCommand({ mode: "explore" });
  if (!viewerConnected()) toast(tr(S.lang, "headsetOffline"));
}
function applyHeadsetText() {
  const L = S.lang, m = S.calib.selectMethod;
  $("hsTitle").textContent = tr(L, "putOnHeadset");
  $("hsSub").textContent = tr(L, m === "hand" ? "fingerToSelect" : "lookToSelect");
  $("hsLookLbl").textContent = tr(L, "lookingAt");
  $("hsSelLbl").textContent = tr(L, "selectedLabel");
  $("opToggle").textContent = ADMIN.operator;
  $("opTitle").textContent = ADMIN.triggerTitle;
  $("opRecentre").textContent = ADMIN.recentreBtn;
  $("opEyeHome").textContent = ADMIN.eyeHomeBtn;
  const box = $("opConds");
  if (!box.childElementCount) {
    for (const c of ALL_CONDITIONS) {
      const b = document.createElement("button");
      b.className = "glass pill admin"; b.dataset.cond = c;
      b.onclick = () => sendCommand({ condition: c, source: "operator" });
      box.appendChild(b);
    }
  }
  for (const b of box.children) b.textContent = tr("en", `conditions.${b.dataset.cond}.name`);
}
// names the tablet shows for things the visitor looks at in the headset
const MIRROR_KEY = { lens: "hotspots.lens", retina: "retinaMacula", opticDisc: "hotspots.opticDisc", opticNerve: "hotspots.opticNerve",
  chNeuritis: "opticNeuritisBtn", chField: "visualFieldBtn", navBack: "back", navHome: "home" };
function mirrorName(id) {
  if (!id) return "—";
  return tr(S.lang, MIRROR_KEY[id] || `hotspots.${id}`);
}
let mirrorRaf = 0, mirrorCond = null;
function updateMirror() {
  if (S.screen !== "headset") return;
  const e = S.explore || {};
  $("hsLook").textContent = mirrorName(e.looking);
  const selName = e.condition ? tr(S.lang, `conditions.${e.condition}.name`) : mirrorName(e.selected);
  $("hsSel").textContent = selName;
  if (e.phase === "effect" && e.condition && e.effectStart) startMirrorDiagram(e.condition, e.effectStart);
  else if (e.phase !== "effect") stopMirrorDiagram();
}
function startMirrorDiagram(cond, startMs) {
  if (mirrorCond === cond + startMs) return;
  mirrorCond = cond + startMs;
  $("hsFieldName").textContent = tr(S.lang, `conditions.${cond}.name`);
  $("hsFieldLine").textContent = tr(S.lang, `conditions.${cond}.field`);
  $("headsetScreen").classList.add("effect");
  const total = TIMING.effectTotal;
  cancelAnimationFrame(mirrorRaf);
  const frame = () => {
    const t = Math.max(0, (fb.serverNow() - startMs) / 1000);
    drawDiagram(cond, Math.min(t, total), $("hsCanvas"));
    const left = Math.max(0, total - t);
    $("hsCdNum").textContent = Math.ceil(left);
    $("hsCdBar").style.strokeDashoffset = (276.5 * (1 - left / total)).toFixed(1);
    if (t < total + 0.5) mirrorRaf = requestAnimationFrame(frame); else stopMirrorDiagram();
  };
  mirrorRaf = requestAnimationFrame(frame);
}
function stopMirrorDiagram() {
  cancelAnimationFrame(mirrorRaf);
  mirrorCond = null;
  $("headsetScreen").classList.remove("effect");
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
  $("tpLabel").textContent = ADMIN.testPattern;
  $("calibReset").textContent = ADMIN.resetDefault;
  $("profileName").placeholder = ADMIN.profileName;
  $("profileSave").textContent = ADMIN.saveProfile;
  $("profileLoad").textContent = ADMIN.loadProfile;
  for (const s of CALIBRATION_SLIDERS) {
    const box = s.section === "3d" ? $("sliders3d") : $("sliders");
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `<div class="top"><span>${ADMIN.sliders[s.key]}</span><b id="v_${s.key}"></b></div>
      <input type="range" id="s_${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">`;
    box.appendChild(row);
    row.querySelector("input").addEventListener("input", e => {
      S.calib[s.key] = parseFloat(e.target.value);
      $("v_" + s.key).textContent = fmt(s, S.calib[s.key]);
      pushCalib();
    });
  }
  // 3D selection: Tablet / Headset and the selection method
  const sel = $("sel3d");
  sel.innerHTML = `<div class="cal-section">${ADMIN.section3d}</div>`;
  const seg = (key, title, options) => {
    const row = document.createElement("div");
    row.className = "seg-row";
    row.innerHTML = `<span>${title}</span><div class="seg"></div>`;
    for (const [value, label] of options) {
      const b = document.createElement("button");
      b.className = "glass admin"; b.textContent = label; b.dataset.key = key; b.dataset.value = value;
      b.onclick = () => { S.calib[key] = value; syncSliders(); pushCalib(); };
      row.querySelector(".seg").appendChild(b);
    }
    sel.appendChild(row);
  };
  seg("selection", ADMIN.selectionTitle, [["tablet", ADMIN.selTablet], ["headset", ADMIN.selHeadset]]);
  seg("selectMethod", ADMIN.methodTitle, [["gaze", ADMIN.mGaze], ["hand", ADMIN.mHand], ["both", ADMIN.mBoth]]);
  $("tpSwitch").addEventListener("change", e => { S.calib.testPattern = e.target.checked; pushCalib(); });
  const keepMode = () => ({ selection: S.calib.selection, selectMethod: S.calib.selectMethod });
  $("calibReset").onclick = () => { S.calib = { ...DEFAULT_CALIBRATION, ...keepMode() }; syncSliders(); pushCalib(); };
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
    S.calib = { ...DEFAULT_CALIBRATION, ...p, testPattern: S.calib.testPattern, ...keepMode() };
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
  for (const b of document.querySelectorAll("#sel3d .seg button")) b.classList.toggle("on", S.calib[b.dataset.key] === b.dataset.value);
  if (S.screen === "headset") applyHeadsetText();
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
  const v = S.viewerInfo;
  if (!v || !v.camera) { box.innerHTML = "Headset camera: <b>waiting for the phone…</b> (tap Start on the phone)"; return; }
  const c = v.camera, sc = v.screen || {};
  const low = c.width && c.width < 1280;
  box.innerHTML =
    `Headset camera: <b class="${low ? "warn" : ""}">${c.width}×${c.height}</b> at <b>${c.fps || "?"} fps</b>` +
    (low ? ` <span class="warn">(low – this phone/browser did not give HD)</span>` : "") +
    `<br>Autofocus: <b>${c.autofocus}</b> · Auto exposure: <b>${c.autoexposure}</b>` +
    `<br>Screen: <b>${sc.width}×${sc.height}</b> pixels (density ${sc.dpr}×) · <b>${sc.fps}</b> frames/s`;
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
$("cardClose").onclick = closeModal;
$("choiceClose").onclick = closeModal;
$("cardAR").onclick = () => { if (!S.locked && S.cardCondition) sendCondition(S.cardCondition); };
$("choiceNeuritis").onclick = () => openCard("neuritis");
$("choiceField").onclick = () => { closeModal(); playIntro("pathway"); };
$("opToggle").onclick = () => $("opPanel").classList.toggle("open");
$("opRecentre").onclick = () => sendCommand({ action: "recentre" });
$("opEyeHome").onclick = () => sendCommand({ action: "eyeHome" });
document.addEventListener("contextmenu", e => e.preventDefault());

keepFullscreen(); // first tap anywhere makes the tablet full screen
buildLanguageScreen();
buildCalibration();
applyText();
setScreen("lang");
