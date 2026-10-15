// Full-screen helpers shared by the tablet and the phone pages.

// True when the page already fills the screen (browser full screen, or opened from the home-screen icon).
export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement) ||
    matchMedia("(display-mode: fullscreen)").matches ||
    matchMedia("(display-mode: standalone)").matches;
}

// Must be called from a tap. Also turns the screen sideways where the device allows it.
export async function enterFullscreen() {
  if (isFullscreen()) return true;
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
  const again = () => { if (!isFullscreen()) enterFullscreen(); };
  document.addEventListener("click", again, true);
  document.addEventListener("touchend", again, true);
}
