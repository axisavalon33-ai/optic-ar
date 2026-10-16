// =====================================================================
//  SETTINGS FILE
//  Firebase connection details, timings, default hotspot positions and
//  default headset calibration. Shared by controller.html and viewer.html.
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAuC7yFfRlwXBIAe-co-7K21Odiu1wYeRQ",
  authDomain: "optic-ar-1bf1f.firebaseapp.com",
  databaseURL: "https://optic-ar-1bf1f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "optic-ar-1bf1f",
  storageBucket: "optic-ar-1bf1f.firebasestorage.app",
  messagingSenderId: "92528346789",
  appId: "1:92528346789:web:5c29850b341d5d0dfd2f4c",
  measurementId: "G-PX37C5MX5L"
};

// Firebase SDK version loaded from Google's CDN.
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";

// STATION NUMBER – lets several tablet + phone pairs run at the same time.
// Open  controller.html?station=3  on a tablet and  viewer.html?station=3  on its phone.
// The device remembers its number, so later the plain link (or home-screen icon) is enough.
// No number ever given = station 1.
function readStation() {
  const clean = v => String(v || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 20);
  let st = clean(new URLSearchParams(location.search).get("station"));
  try {
    if (st) localStorage.setItem("station", st);
    else st = clean(localStorage.getItem("station"));
  } catch (e) { /* storage blocked */ }
  return st || "1";
}
export const STATION = readStation();

// Where things are stored inside the Realtime Database.
export const DB = {
  command: `exhibit/stations/${STATION}/command`,     // {condition, language, timestamp}
  presence: `exhibit/stations/${STATION}/presence`,   // phone heartbeat
  calibLive: `exhibit/stations/${STATION}/calibration`, // this station's headset settings
  hotspots: "exhibit/hotspots",                       // shared by all stations
  calibProfiles: "exhibit/calibration/profiles"       // shared, so any station can load them
};

// Timings (seconds)
export const TIMING = {
  effectTotal: 20,     // AR effect length; also the controller countdown
  nameShow: 2,         // condition name shown in the headset
  fade: 1.5,           // fade in / fade out
  lesionShow: 2,       // red lesion on the pathway before sending
  idleHand: 5,         // show tapping hand after this many idle seconds
  shimmerEvery: 4,     // hotspot shimmer interval
  videoVolume: 0.6,    // video's own soundtrack
  narrationVolume: 1.0
};

// Which language is already spoken inside the videos' own soundtrack.
//   "en"  -> English visitors hear the video's own sound at full volume (no extra file);
//            Tamil / Sinhala visitors: the video is muted and audio/...-ta.mp3 / -si.mp3 plays instead.
//   null  -> videos have only music/effects: they play at 60 % with the narration file on top, for every language.
export const VIDEO_BUILT_IN_LANGUAGE = "en";

// Media files. {lang} is replaced with ta / en / si.
export const MEDIA = {
  eyeVideo: "videos/eye-intro.mp4",
  eyeNarration: "audio/eye-intro-{lang}.mp3",
  eyeStill: "images/eye-still.jpg",
  pathVideo: "videos/pathway.mp4",
  pathNarration: "audio/pathway-{lang}.mp3",
  pathStill: "images/pathway-still.jpg"
};

// Hotspot defaults: x, y = centre as % of image width / height,
// r = radius as % of image width. Edit mode overrides these in Firebase.
export const DEFAULT_HOTSPOTS = {
  eye: {
    lens:       { x: 32.7, y: 50.8, r: 5.0 },
    retina:     { x: 58.4, y: 29.9, r: 3.2 },
    opticDisc:  { x: 66.0, y: 56.9, r: 2.6 },
    opticNerve: { x: 84.0, y: 62.5, r: 4.0 }
  },
  pathway: {
    pOpticNerve: { x: 39.1, y: 20.9, r: 2.8 },
    pChiasm:     { x: 49.0, y: 28.9, r: 2.0 },
    pTemporal:   { x: 45.2, y: 30.5, r: 2.0 },
    pTract:      { x: 38.6, y: 38.1, r: 2.8 },
    pMeyer:      { x: 28.2, y: 49.0, r: 3.0 },
    pParietal:   { x: 32.5, y: 58.2, r: 3.0 },
    pOccipital:  { x: 42.9, y: 83.4, r: 3.5 }
  }
};

// Headset calibration defaults (the "Reset to default" values).
// Units: fractions of the phone screen in landscape (W = width, H = height).
export const DEFAULT_CALIBRATION = {
  distortion: 0.25,  // barrel distortion strength (0 = none)
  zoom: 1.0,         // image size inside each eye
  ipd: 0.50,         // distance between eye centres, fraction of W
  vertical: 0.0,     // vertical shift of both eyes, fraction of H
  eyeSize: 0.92,     // eye shape diameter, fraction of H
  roundness: 1.0,    // 1 = circle, 0 = square with soft corners
  noseWidth: 0.12,   // nose cutout width, fraction of W
  noseHeight: 0.22,  // nose cutout height, fraction of H
  divider: 0.006,    // black centre divider width, fraction of W
  testPattern: false
};

// Slider ranges for calibration mode.
export const CALIBRATION_SLIDERS = [
  { key: "distortion", min: 0,    max: 1,    step: 0.01 },
  { key: "zoom",       min: 0.4,  max: 2.5,  step: 0.01 },
  { key: "ipd",        min: 0.30, max: 0.70, step: 0.002 },
  { key: "vertical",   min: -0.25, max: 0.25, step: 0.002 },
  { key: "eyeSize",    min: 0.4,  max: 1.3,  step: 0.005 },
  { key: "roundness",  min: 0,    max: 1,    step: 0.01 },
  { key: "noseWidth",  min: 0,    max: 0.4,  step: 0.002 },
  { key: "noseHeight", min: 0,    max: 0.6,  step: 0.002 },
  { key: "divider",    min: 0,    max: 0.06, step: 0.001 }
];
