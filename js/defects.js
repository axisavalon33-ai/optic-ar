// =====================================================================
//  DEFECT DATA  (shared by the controller diagram AND the headset)
//
//  Every condition is described once, here:
//    field(eye, t)  -> list of shapes that darken the visual field
//    filters        -> whole-image effects (blur, tint, glare, ...)
//
//  The controller draws field() into the two "Left eye / Right eye"
//  circles; the phone draws exactly the same field() into a mask texture
//  that its WebGL shader applies to the camera image. Same data, same
//  drawing code, so the diagram always matches the headset.
//
//  Field coordinates: the eye circle has radius 1, centre (0,0).
//  x: -1 = visitor's left field, +1 = right field.  y: +1 = up.
//  Sizes "% of the eye circle" use the circle's diameter (2 units),
//  so a 20%-wide blotch has radius 0.2.
// =====================================================================
import { TIMING } from "./config.js";

export const EYE_DISORDERS = ["cataract", "glaucoma", "amd", "neuritis"];
export const PATHWAY_DEFECTS = ["pOpticNerve", "pChiasm", "pTemporal", "pTract", "pMeyer", "pParietal", "pOccipital"];
export const ALL_CONDITIONS = [...EYE_DISORDERS, ...PATHWAY_DEFECTS];

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const SOFT = 0.07; // width of the blurred edge on hemifield / quadrant borders

// Fade in over 1.5 s, fade out over the last 1.5 s of the effect (T = effect length in seconds,
// set per condition in the calibration panel; 20 s if not given).
export function envelope(t, T = TIMING.effectTotal) {
  const F = TIMING.fade;
  return smooth(0, F, t) * smooth(T, T - F, t);
}

const NO_FILTER = { blur: 0, contrast: 0, tint: 0, glare: 0, desat: 0, redDesat: 0, dim: 0, warp: 0, maskBlur: 0, edge: 0 };

export const CONDITIONS = {
  // ---------------- Eye disorders ----------------
  cataract: {
    // Like the reference video: the view turns amber-brown at once (blue and green light are absorbed
    // by the yellowed lens), lights get glowing halos, then a milky orange veil slowly thickens,
    // the picture gets softer and the dark areas turn brown instead of black.
    field: (eye, t, T) => [{ kind: "haze", type: "full", a: lerp(0.25, 0.6, smooth(0, 1, clamp01(t / (T - 3)))) }],
    filters: (eye, t, T) => {
      const p = clamp01(t / (T - 3));   // 0 -> 1 over the effect (but the last 3 s)
      return { tint: 1, contrast: lerp(0.12, 0.56, smooth(0.15, 1, p)), blur: lerp(0.006, 0.02, p), glare: lerp(0.8, 1.5, p) };
    }
  },
  glaucoma: {
    // Like the US National Eye Institute simulation: almost black all round, with a wide, irregular
    // clear area in the middle. Its wavy, very soft edge keeps moving slowly; the edge zone looks blurred
    // and bluish-grey. Dark bulges push in from above and below, the nose side is lost a little more,
    // and the clear area slowly narrows. The two eyes are a little different.
    field: (eye, t, T) => {
      const q = smooth(0, 1, clamp01(t / (T - 3)));
      const L = eye === "L", nasal = L ? 1 : -1;   // nose side: right of the left eye's view, left of the right eye's
      return [{ kind: "dark", type: "tunnel", a: 0.97, nasal, seed: L ? 1 : 2.3, time: t,
        rx: lerp(1.05, 0.8, q), ry: lerp(0.62, 0.45, q), cx: -nasal * 0.05, cy: 0.02, soft: 0.42, dent: lerp(0.15, 0.3, q) }];
    },
    filters: { both: { maskBlur: 0.045, dim: 0.1, contrast: 0.1, desat: 0.15, edge: 0.8 } }
  },
  amd: {
    field: () => [
      { kind: "dark", type: "blob", r: 0.2, a: 0.88 },
      { kind: "warp", type: "warpRing", r: 0.35 }
    ],
    filters: { both: { warp: 1 } }
  },
  neuritis: {
    // One eye (left). The classic picture: blurred, washed-out, dimmer vision with faded colours
    // (reds look pinkish-brown) and a soft grey smudge in the centre that often stretches towards
    // the blind spot (temporal side = left in the left eye's view): a "centrocaecal" scotoma.
    field: eye => eye === "L" ? [
      { kind: "dark", type: "disc", r: 0.17, soft: 0.2, a: 0.42 },
      { kind: "dark", type: "disc", cx: -0.2, cy: -0.02, r: 0.1, soft: 0.16, a: 0.3 }
    ] : [],
    filters: { L: { blur: 0.007, contrast: 0.3, desat: 0.5, redDesat: 0.9, dim: 0.30, maskBlur: 0.04 } }
  },

  // ---------------- Visual pathway lesions (left side of brain) ----------------
  pOpticNerve: { field: eye => eye === "L" ? [{ kind: "dark", type: "full", a: 1 }] : [], filters: {} },
  pChiasm: {
    field: eye => [{ kind: "dark", type: "half", axis: "x", side: eye === "L" ? -1 : 1, a: 1 }],
    filters: {}
  },
  pTemporal: { field: eye => eye === "L" ? [{ kind: "dark", type: "half", axis: "x", side: 1, a: 1 }] : [], filters: {} },
  pTract: { field: () => [{ kind: "dark", type: "half", axis: "x", side: 1, a: 1 }], filters: {} },
  pMeyer: { field: () => [{ kind: "dark", type: "quadrant", sx: 1, sy: 1, a: 1 }], filters: {} },
  pParietal: { field: () => [{ kind: "dark", type: "quadrant", sx: 1, sy: -1, a: 1 }], filters: {} },
  pOccipital: {
    field: () => [{ kind: "dark", type: "half", axis: "x", side: 1, a: 1, hole: 0.1 }],
    filters: {}
  }
};

// Effect length (seconds) for a condition, from the calibration settings: 10–40 s, default 20 s.
export function effectLength(calib, condition) {
  const v = Number(calib && calib.durations && calib.durations[condition]);
  return v >= 10 && v <= 40 ? v : TIMING.effectTotal;
}

// Whole-image filter strengths for one eye at time t (already faded).
export function filtersAt(condition, eye, t, T = TIMING.effectTotal) {
  const c = CONDITIONS[condition];
  const out = { ...NO_FILTER };
  if (!c) return out;
  const src = typeof c.filters === "function" ? c.filters(eye, t, T) : (c.filters[eye] || c.filters.both || {});
  const e = envelope(t, T);
  for (const k in src) out[k] = src[k] * e;
  return out;
}

// ---------------------------------------------------------------------
//  PAINTER
//  paintField(ctx, size, condition, eye, t, {color, kinds, extent, total})
//  Draws the field shapes into a square area of `size` px whose centre
//  is the eye centre and whose half-width is `extent` field units.
//  Only shapes whose kind is listed in `kinds` are drawn.
//  The ctx should be a layer canvas (it uses cut-outs).
// ---------------------------------------------------------------------
let scratch = null;
function getScratch(size) {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width !== size) { scratch.width = size; scratch.height = size; }
  const sctx = scratch.getContext("2d");
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = "source-over";
  sctx.globalAlpha = 1;
  sctx.clearRect(0, 0, size, size);
  return sctx;
}

function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp01(a)})`; }

function toField(c, size, extent) {
  const s = size / 2 / extent;
  c.setTransform(s, 0, 0, -s, size / 2, size / 2); // y up
}

function blobPath(c, r, scale) {
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const th = i / 48 * Math.PI * 2;
    const rr = r * scale * (1 + 0.22 * Math.sin(3 * th + 0.7) + 0.13 * Math.sin(5 * th + 2.1) + 0.08 * Math.cos(7 * th));
    const x = rr * Math.cos(th), y = rr * Math.sin(th) * 0.92;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}

function drawShape(c, sh, rgb, a, E) {
  const big = () => c.fillRect(-E, -E, 2 * E, 2 * E);
  switch (sh.type) {
    case "full":
      c.fillStyle = rgba(rgb, a); big(); break;
    case "half": {
      const g = sh.axis === "x" ? c.createLinearGradient(-SOFT * sh.side, 0, SOFT * sh.side, 0)
                                : c.createLinearGradient(0, -SOFT * sh.side, 0, SOFT * sh.side);
      g.addColorStop(0, rgba(rgb, 0)); g.addColorStop(1, rgba(rgb, a));
      c.fillStyle = g; big(); break;
    }
    case "quadrant": {
      const gx = c.createLinearGradient(-SOFT * sh.sx, 0, SOFT * sh.sx, 0);
      gx.addColorStop(0, rgba(rgb, 0)); gx.addColorStop(1, rgba(rgb, a));
      c.fillStyle = gx; big();
      c.globalCompositeOperation = "destination-in";
      const gy = c.createLinearGradient(0, -SOFT * sh.sy, 0, SOFT * sh.sy);
      gy.addColorStop(0, "rgba(0,0,0,0)"); gy.addColorStop(1, "rgba(0,0,0,1)");
      c.fillStyle = gy; big();
      c.globalCompositeOperation = "source-over";
      break;
    }
    case "periphery": {
      const r1 = sh.rIn + sh.soft;
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r1);
      g.addColorStop(0, rgba(rgb, 0)); g.addColorStop(sh.rIn / r1, rgba(rgb, 0)); g.addColorStop(1, rgba(rgb, a));
      c.fillStyle = g; big(); break;
    }
    case "disc": {
      const x = sh.cx || 0, y = sh.cy || 0;
      const r0 = Math.max(0.001, sh.r - sh.soft / 2), r1 = sh.r + sh.soft / 2;
      const g = c.createRadialGradient(x, y, 0, x, y, r1);
      g.addColorStop(0, rgba(rgb, a)); g.addColorStop(r0 / r1, rgba(rgb, a)); g.addColorStop(1, rgba(rgb, 0));
      c.fillStyle = g; c.fillRect(x - r1, y - r1, 2 * r1, 2 * r1);
      break;
    }
    case "island": { // dark everywhere except an irregular clear island with very soft, smudgy edges
      c.fillStyle = rgba(rgb, a); big();
      c.globalCompositeOperation = "destination-out";
      const N = 16, keep = 0.002, b = 1 - Math.pow(keep, 1 / N);   // centre left fully clear
      const ph = sh.seed * 1.7;
      const nasalAngle = sh.nasal > 0 ? 0 : Math.PI;
      c.fillStyle = `rgba(0,0,0,${b})`;
      for (let i = 0; i < N; i++) {
        const k = 1 + sh.soft * (1 - 2 * i / (N - 1));             // outer, faint … inner, fully clear
        c.beginPath();
        for (let j = 0; j <= 72; j++) {
          const th = j / 72 * Math.PI * 2;
          let rr = sh.r * (1 + 0.16 * Math.sin(2 * th + ph) + 0.11 * Math.sin(3 * th + ph * 2.3) + 0.07 * Math.sin(5 * th + ph * 0.7));
          rr *= 1 - 0.28 * Math.max(0, Math.cos(th - nasalAngle));  // nose side lost first (nasal step)
          rr *= 1 - 0.16 * Math.max(0, Math.sin(th));               // upper field a little worse
          const x = sh.cx + rr * k * Math.cos(th), y = sh.cy + rr * k * Math.sin(th);
          j ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.closePath(); c.fill();
      }
      c.globalCompositeOperation = "source-over";
      break;
    }
    case "tunnel": { // dark all round except a wide, irregular clear area whose wavy edge slowly moves
      c.fillStyle = rgba(rgb, a); big();
      c.globalCompositeOperation = "destination-out";
      const N = 18;
      const ph = sh.seed * 1.3, w = sh.time * 0.35;
      const nasalAngle = sh.nasal > 0 ? 0 : Math.PI;
      const bump = (th, at) => { const d = Math.atan2(Math.sin(th - at), Math.cos(th - at)); return Math.exp(-d * d / 0.25); };
      // each ring removes just enough that the darkness fades evenly (smoothly) from the outer to the inner ring
      const left = i => 1 - smooth(0, 1, (i + 1) / N);
      for (let i = 0; i < N; i++) {
        const k = 1 + sh.soft * (1 - 2 * i / (N - 1));             // outer, faint … inner, fully clear
        c.fillStyle = `rgba(0,0,0,${i === N - 1 ? 1 : 1 - left(i) / (i ? left(i - 1) : 1)})`;
        c.beginPath();
        for (let j = 0; j <= 96; j++) {
          const th = j / 96 * Math.PI * 2;
          let rr = 1 / Math.hypot(Math.cos(th) / sh.rx, Math.sin(th) / sh.ry);   // wide oval
          rr *= 1 + 0.09 * Math.sin(2 * th + ph + w) + 0.07 * Math.sin(3 * th + ph * 2.1 - w * 0.8) + 0.05 * Math.sin(5 * th + ph * 0.6 + w * 1.3);
          rr *= 1 - sh.dent * bump(th, Math.PI / 2 + 0.35 * Math.sin(w * 0.5 + ph))      // dark bulge from above
                  - 0.6 * sh.dent * bump(th, -Math.PI / 2 + 0.4 * Math.sin(w * 0.4 + ph * 2)); // and from below
          rr *= 1 - 0.15 * Math.max(0, Math.cos(th - nasalAngle));  // nose side lost a little more
          const x = sh.cx + rr * k * Math.cos(th), y = sh.cy + rr * k * Math.sin(th);
          j ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.closePath(); c.fill();
      }
      c.globalCompositeOperation = "source-over";
      break;
    }
    case "puffs": { // soft smudges along the arcs above and below fixation (Bjerrum area)
      if (a <= 0.001) break;
      let seed = sh.seed * 97;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 14; i++) {
        const upper = i < 9;                                      // the upper arc is usually worse
        const ang = (upper ? 1 : -1) * (0.35 + rnd() * 1.1) * sh.spread;   // radians from horizontal, nose side
        const th = sh.nasal > 0 ? ang : Math.PI - ang;
        const rr = 0.42 + rnd() * 0.32;
        const x = rr * Math.cos(th), y = rr * Math.sin(th), pr = 0.09 + rnd() * 0.11;
        const g = c.createRadialGradient(x, y, 0, x, y, pr);
        const pa = a * (0.55 + rnd() * 0.45) * (upper ? 1 : 0.75);
        g.addColorStop(0, rgba(rgb, pa)); g.addColorStop(0.5, rgba(rgb, pa * 0.6)); g.addColorStop(1, rgba(rgb, 0));
        c.fillStyle = g; c.fillRect(x - pr, y - pr, 2 * pr, 2 * pr);
      }
      break;
    }
    case "blob": { // irregular, soft-edged blotch: many stacked faint copies
      const N = 12, b = 1 - Math.pow(1 - clamp01(a), 1 / N);
      c.fillStyle = rgba(rgb, b);
      for (let i = 0; i < N; i++) { blobPath(c, sh.r, 1.4 - i * 0.07); c.fill(); }
      break;
    }
    case "arcs": { // arc-shaped bands above and below fixation, soft edges
      if (a <= 0.001) break;
      const N = 10, b = 1 - Math.pow(1 - clamp01(a), 1 / N);
      const half = sh.span / 2 * Math.PI / 180;
      c.strokeStyle = rgba(rgb, b); c.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const k = 1 - i / N;                        // wide & long -> narrow & short
        c.lineWidth = sh.w * (0.35 + 1.1 * k);
        const h = half * (0.6 + 0.4 * k);
        for (const mid of [Math.PI / 2, -Math.PI / 2]) {
          c.beginPath(); c.arc(0, 0, sh.r, mid - h, mid + h); c.stroke();
        }
      }
      break;
    }
    case "warpRing": { // diagram-only hint of wavy distortion around the blotch
      c.strokeStyle = rgba(rgb, a * 0.55); c.lineWidth = 0.025;
      for (const rr of [sh.r * 0.72, sh.r]) {
        c.beginPath();
        for (let i = 0; i <= 96; i++) {
          const th = i / 96 * Math.PI * 2, q = rr * (1 + 0.06 * Math.sin(10 * th));
          i ? c.lineTo(q * Math.cos(th), q * Math.sin(th)) : c.moveTo(q * Math.cos(th), q * Math.sin(th));
        }
        c.stroke();
      }
      break;
    }
  }
  if (sh.hole) { // clear central circle (macular sparing), soft edge
    c.globalCompositeOperation = "destination-out";
    const g = c.createRadialGradient(0, 0, 0, 0, 0, sh.hole * 1.4);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.6 / 1.4, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(-1.5, -1.5, 3, 3);
    c.globalCompositeOperation = "source-over";
  }
}

export function paintField(ctx, size, condition, eye, t, opts = {}) {
  const c = CONDITIONS[condition];
  if (!c) return;
  const rgb = opts.color || [255, 255, 255];
  const kinds = opts.kinds || ["dark"];
  const E = opts.extent || 1.5;
  const T = opts.total || TIMING.effectTotal;
  const env = envelope(t, T);
  for (const sh of c.field(eye, t, T)) {
    if (!kinds.includes(sh.kind)) continue;
    const a = (sh.a === undefined ? 1 : sh.a) * env;
    if (a <= 0.001) continue;
    const s = getScratch(size);
    toField(s, size, E);
    drawShape(s, sh, rgb, a, E);
    ctx.drawImage(scratch, 0, 0);   // union of shapes (source-over)
  }
}
