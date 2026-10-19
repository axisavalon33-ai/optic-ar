// =====================================================================
//  SYNCHRONISED PLAYBACK – used by both the tablet and the phone.
//  Each device plays the same file so that it is at time
//      (server time now − startAt) seconds,
//  using Firebase's server clock, and corrects itself if it drifts.
// =====================================================================
import { TIMING, MEDIA, USE_LANGUAGE_VIDEOS, VIDEO_BUILT_IN_LANGUAGE } from "./config.js";

export class Synced {
  constructor(el, serverNow) {
    this.el = el;
    this.serverNow = serverNow;
    this.active = false;
    this.seekBroken = false;
    el.preload = "auto";
  }
  // src: file to play; startAt: server time (ms) at which time 0 of the file plays
  play(src, startAt) {
    if (!src) { this.stop(); return; }
    if (this.src !== src) {
      this.src = src; this.seekBroken = false;
      this.el.src = src; this.el.load();
    }
    this.startAt = startAt;
    this.active = true;
    this.tick();
  }
  stop() {
    this.active = false;
    clearTimeout(this._timer);
    try { this.el.pause(); } catch (e) {}
  }
  // seconds into the file the devices should be at now (negative = not started yet)
  target() { return (this.serverNow() - this.startAt) / 1000; }
  ended() { const d = this.el.duration; return this.active && isFinite(d) && this.target() >= d - 0.05; }
  // call often (a few times a second)
  tick() {
    if (!this.active) return;
    const t = this.target(), el = this.el;
    clearTimeout(this._timer);
    if (t < 0) {                                  // not started yet: wait at the first frame
      if (!el.paused) el.pause();
      if (el.currentTime > 0.05 && el.readyState >= 1) el.currentTime = 0;
      this._timer = setTimeout(() => this.tick(), Math.min(-t * 1000, 500));
      return;
    }
    const d = el.duration;
    if (isFinite(d) && t >= d) { if (!el.paused) el.pause(); return; }
    if (el.paused) el.play().catch(() => {});
    if (el.readyState >= 1 && !el.seeking && !this.seekBroken && Math.abs(el.currentTime - t) > TIMING.maxDrift) {
      const before = el.currentTime;
      el.currentTime = t;
      // if jumping is not supported, stop trying (it would restart the file again and again)
      if (this._lastSeek && Math.abs(before - this._lastSeek.to - (performance.now() - this._lastSeek.at) / 1000) > 1.5) this.seekBroken = true;
      this._lastSeek = { to: t, at: performance.now() };
    }
  }
}

// Which files make up the intro for a language.
// Returns { src, narr, muteVideo }: the video, the narration (or null) and whether the video's own voice must be muted.
const existsCache = {};
async function exists(url) {
  if (url in existsCache) return existsCache[url];
  try { const r = await fetch(url, { method: "HEAD" }); existsCache[url] = r.ok; }
  catch (e) { existsCache[url] = false; }
  return existsCache[url];
}
export async function introMedia(lang) {
  if (USE_LANGUAGE_VIDEOS) {
    const own = MEDIA.eyeVideoLang.replace("{lang}", lang);
    if (await exists(own)) return { src: own, narr: null, muteVideo: false };
  }
  const builtIn = VIDEO_BUILT_IN_LANGUAGE && lang === VIDEO_BUILT_IN_LANGUAGE;
  return {
    src: MEDIA.eyeVideo,
    narr: builtIn ? null : MEDIA.eyeNarration.replace("{lang}", lang),
    muteVideo: !!VIDEO_BUILT_IN_LANGUAGE && !builtIn
  };
}
export const pathwayNarration = lang => MEDIA.pathNarration.replace("{lang}", lang);
