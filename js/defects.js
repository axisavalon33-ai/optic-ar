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

// Fade in over 1.5 s, fade out over the last 1.5 s of the 20 s.
export function envelope(t) {
  const T = TIMING.effectTotal, F = TIMING.fade;
  return smooth(0, F, t) * smooth(T, T - F, t);
}

const NO_FILTER = { blur: 0, contrast: 0, tint: 0, glare: 0, desat: 0, redDesat: 0, dim: 0, warp: 0 };

export const CONDITIONS = {
  // ---------------- Eye disorders ----------------
  cataract: {
    field: () => [{ kind: "haze", type: "full", a: 0.42 }],
    filters: { both: { blur: 0.011, contrast: 0.40, tint: 0.60, glare: 0.9, dim: 0.06 } }
  },
  glaucoma: {
    field: (eye, t) => {
      const p = clamp01(t / (TIMING.effectTotal - 4));       // 0 -> 1 over ~16 s
      const arcs = smooth(0.0, 0.35, p) * 0.92;               // arcs first
      const rIn = lerp(1.25, 0.25, smooth(0.3, 0.95, p));     // then periphery closes
      return [
        { kind: "dark", type: "arcs", r: 0.56, w: 0.17, span: 120, a: arcs },
        { kind: "dark", type: "periphery", rIn, soft: 0.2, a: 1 }
      ];
    },
    filters: {}
  },
  amd: {
    field: () => [
      { kind: "dark", type: "blob", r: 0.2, a: 0.88 },
      { kind: "warp", type: "warpRing", r: 0.35 }
    ],
    filters: { both: { warp: 1 } }
  },
  neuritis: {
    field: eye => eye === "L" ? [{ kind: "dark", type: "disc", r: 0.15, soft: 0.12, a: 0.6 }] : [],
    filters: { L: { desat: 0.55, redDesat: 0.85, dim: 0.30 } }
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

// Whole-image filter strengths for one eye at time t (already faded).
export function filtersAt(condition, eye, t) {
  const c = CONDITIONS[condition];
  const out = { ...NO_FILTER };
  if (!c) return out;
  const src = c.filters[eye] || c.filters.both || {};
  const e = envelope(t);
  for (const k in src) out[k] = src[k] * e;
  return out;
}

// ---------------------------------------------------------------------
//  PAINTER
//  paintField(ctx, size, condition, eye, t, {color, kinds, extent})
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
      const r0 = Math.max(0.001, sh.r - sh.soft / 2), r1 = sh.r + sh.soft / 2;
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r1);
      g.addColorStop(0, rgba(rgb, a)); g.addColorStop(r0 / r1, rgba(rgb, a)); g.addColorStop(1, rgba(rgb, 0));
      c.fillStyle = g; c.fillRect(-r1, -r1, 2 * r1, 2 * r1);
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
  const env = envelope(t);
  for (const sh of c.field(eye, t)) {
    if (!kinds.includes(sh.kind)) continue;
    const a = (sh.a === undefined ? 1 : sh.a) * env;
    if (a <= 0.001) continue;
    const s = getScratch(size);
    toField(s, size, E);
    drawShape(s, sh, rgb, a, E);
    ctx.drawImage(scratch, 0, 0);   // union of shapes (source-over)
  }
}
