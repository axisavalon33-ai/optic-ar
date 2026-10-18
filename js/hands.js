// =====================================================================
//  HAND TOUCH (optional) – finds the visitor's index fingertip in the
//  rear-camera image with MediaPipe Hands. Loaded only when switched on.
// =====================================================================
const MP_VERSION = "0.10.14";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  constructor() {
    this.state = "off";        // off | loading | ready | failed
    this.landmarker = null;
    this.tip = null;           // { x, y } in camera-image fractions (0..1, y down), or null
    this.lastSeen = 0;
    this.lastRun = 0;
  }

  async start() {
    if (this.state === "loading" || this.state === "ready") return;
    this.state = "loading";
    try {
      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const make = delegate => vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: "VIDEO", numHands: 1,
        minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5
      });
      try { this.landmarker = await make("GPU"); } catch (e) { this.landmarker = await make("CPU"); }
      this.state = "ready";
    } catch (e) {
      console.warn("Hand tracking could not start", e);
      this.state = "failed";
    }
  }

  stop() {
    this.tip = null;
    if (this.landmarker) { try { this.landmarker.close(); } catch (e) {} }
    this.landmarker = null;
    this.state = "off";
  }

  // Call every frame; runs detection about 20 times a second.
  detect(video, now) {
    if (this.state !== "ready" || !video || video.readyState < 2) return this.tip;
    if (now - this.lastRun < 50) return this.tip;
    this.lastRun = now;
    try {
      const res = this.landmarker.detectForVideo(video, now);
      const lm = res && res.landmarks && res.landmarks[0];
      if (lm && lm[8]) { this.tip = { x: lm[8].x, y: lm[8].y }; this.lastSeen = now; }
      else if (now - this.lastSeen > 300) this.tip = null;
    } catch (e) {
      console.warn("Hand detection error", e);
      this.state = "failed";
      this.tip = null;
    }
    return this.tip;
  }
}
