// Full-screen helpers shared by the tablet and the phone pages.

// iPhone: Safari cannot make a web page full screen (only videos). Opening the page from a
// home-screen icon ("Add to Home Screen") gives a full-screen page instead.
export const IS_IPHONE = /iPhone|iPod/.test(navigator.userAgent);
const el0 = document.documentElement;
export const canFullscreen = !!(el0.requestFullscreen || el0.webkitRequestFullscreen) && !IS_IPHONE;

// True when the page already fills the screen (browser full screen, or opened from the home-screen icon).
export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement) ||
    matchMedia("(display-mode: fullscreen)").matches ||
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
}

// Must be called from a tap. Also turns the screen sideways where the device allows it.
export async function enterFullscreen() {
  if (isFullscreen()) return true;
  if (!canFullscreen) return false;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else return false;
  } catch (e) {
    console.warn("Full screen refused", e);
    return false;
  }
  try { await screen.orientation.lock("landscape"); } catch (e) { /* not supported */ }
  return true;
}

// Any tap puts the page back into full screen if it has left it (swipe, permission pop-up, …).
export function keepFullscreen() {
  if (!canFullscreen) return;
  const again = () => { if (!isFullscreen()) enterFullscreen(); };
  document.addEventListener("click", again, true);
  document.addEventListener("touchend", again, true);
}
