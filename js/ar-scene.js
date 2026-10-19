// =====================================================================
//  3D SELECTION INSIDE THE HEADSET
//  A floating, cut-away 3D eye (and a 3D visual pathway) that the visitor
//  selects parts of by looking at them (or touching them with a finger).
//  The scene is rendered once per eye into two textures; viewer.js then
//  puts them through the same barrel-distortion shader as the camera image.
// =====================================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tr } from "./translations.js";
import { STEREO_IPD, MODELS } from "./config.js";

const R = 0.12;                 // eye radius in metres (a big, magnified eye)
const AMBER = 0xffa62b, RED = 0xff2a2a;
const FONT = '"Noto Sans", "Noto Sans Tamil", "Noto Sans Sinhala", sans-serif';

// What each selectable thing does
const ACTIONS = {
  lens: { cond: "cataract" }, retina: { cond: "amd" }, opticDisc: { cond: "glaucoma" },
  opticNerve: { choices: true },
  chNeuritis: { cond: "neuritis", glow: "opticNerve" }, chField: { pathway: true },
  pOpticNerve: { cond: "pOpticNerve" }, pChiasm: { cond: "pChiasm" }, pTemporal: { cond: "pTemporal" },
  pTract: { cond: "pTract" }, pMeyer: { cond: "pMeyer" }, pParietal: { cond: "pParietal" }, pOccipital: { cond: "pOccipital" },
  navBack: { back: true }, navHome: { home: true }
};
// Text key for every label / button
const LABEL_KEY = {
  lens: "hotspots.lens", retina: "retinaMacula", opticDisc: "hotspots.opticDisc", opticNerve: "hotspots.opticNerve",
  chNeuritis: "opticNeuritisBtn", chField: "visualFieldBtn", navBack: "back", navHome: "home",
  pOpticNerve: "hotspots.pOpticNerve", pChiasm: "hotspots.pChiasm", pTemporal: "hotspots.pTemporal",
  pTract: "hotspots.pTract", pMeyer: "hotspots.pMeyer", pParietal: "hotspots.pParietal", pOccipital: "hotspots.pOccipital",
  eyeL: "leftEye", eyeR: "rightEye"
};

const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- text textures
function drawText(canvas, text, kind) {
  const c = canvas.getContext("2d");
  const fs = kind === "button" ? 64 : 52, padX = kind === "button" ? 56 : 30, padY = kind === "button" ? 30 : 18;
  c.font = `700 ${fs}px ${FONT}`;
  const w = Math.ceil(c.measureText(text).width) + padX * 2, h = fs + padY * 2 + 8;
  canvas.width = Math.min(2048, w); canvas.height = h;
  c.font = `700 ${fs}px ${FONT}`;
  c.textAlign = "center"; c.textBaseline = "middle";
  const r = kind === "button" ? h / 2 : 22;
  c.beginPath(); c.roundRect(4, 4, canvas.width - 8, h - 8, r);
  c.fillStyle = kind === "button" ? "rgba(16, 35, 71, 0.92)" : "rgba(5, 12, 31, 0.78)"; c.fill();
  c.lineWidth = kind === "button" ? 6 : 3;
  c.strokeStyle = kind === "button" ? "rgba(255, 181, 71, 0.95)" : "rgba(255, 255, 255, 0.35)"; c.stroke();
  c.fillStyle = "#f3f1ea";
  c.fillText(text, canvas.width / 2, h / 2 + 2);
}

class TextThing {
  // kind "label" -> camera-facing sprite; kind "button" -> flat panel that can be selected
  constructor(key, kind, height) {
    this.key = key; this.kind = kind; this.height = height;
    this.canvas = document.createElement("canvas");
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    if (kind === "label") {
      this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false });
      this.obj = new THREE.Sprite(this.mat);
      this.obj.renderOrder = 10;
    } else {
      this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false });
      this.obj = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
      this.obj.renderOrder = 20;
    }
  }
  setText(lang) {
    drawText(this.canvas, tr(lang, LABEL_KEY[this.key] || this.key), this.kind);
    this.tex.needsUpdate = true;
    this.obj.scale.set(this.height * this.canvas.width / this.canvas.height, this.height, 1);
    this.baseScale = this.obj.scale.clone();
  }
}

// ---------------------------------------------------------------- materials
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, emissive: 0x000000, ...extra });
// invisible, larger "touch areas" so small parts are easy to hold the dot on
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const hitSphere = (pos, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), HIT); m.position.copy(pos); return m; };
const hitTube = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 6, false), HIT);

// =====================================================================
export class ARScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a6a, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(0.6, 1, 1.2); this.scene.add(sun);

    // head = the visitor's head (mono camera, used for picking); two eye cameras ride on it
    this.head = new THREE.PerspectiveCamera(60, 1, 0.03, 20);
    this.eyeCams = [new THREE.PerspectiveCamera(60, 1, 0.03, 20), new THREE.PerspectiveCamera(60, 1, 0.03, 20)];
    this.eyeCams[0].position.x = -STEREO_IPD / 2;
    this.eyeCams[1].position.x = STEREO_IPD / 2;
    this.head.add(this.eyeCams[0], this.eyeCams[1]);
    this.scene.add(this.head);

    this.anchor = new THREE.Group();          // placed ~1 m in front of the visitor
    this.content = new THREE.Group();         // scaled by "model size"
    this.anchor.add(this.content);
    this.scene.add(this.anchor);

    // floating "cinema screen" that mirrors the tablet (videos, eye / pathway pictures)
    this.screenRoot = new THREE.Group();
    this.anchor.add(this.screenRoot);
    this.screenAlpha = 0; this.screenWanted = false;
    const flat = (order) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false })); m.renderOrder = order; return m; };
    this.screenBack = flat(28); this.screenBack.material.color.setHex(0x050c1f);
    this.screenMain = flat(29); this.screenOver = flat(30);
    this.screenRoot.add(this.screenBack, this.screenMain, this.screenOver);
    this.screenRoot.visible = false;

    this.sel = new Map();                     // id -> { id, meshes:[], label, button, scene }
    this.labels = [];                         // all TextThings
    this.raycaster = new THREE.Raycaster();
    this.lang = "en";
    this.active = false;
    this.view = "eye";                        // "eye" | "pathway"
    this.choicesOpen = false;
    this.phase = "hidden";                    // hidden | browse | glow | fadeOut | effect | fadeIn
    this.phaseT = 0;
    this.alpha = 0;                           // overlay opacity 0..1
    this.hold = { gaze: { id: null, t: 0, armed: false }, hand: { id: null, t: 0, armed: false } };
    this.selectedId = null; this.glowId = null; this.pendingCond = null;
    this.distance = 1; this.size = 1;
    this.time = 0;
    this.outOfView = 0;
    this.centred = false;
    this.onCondition = () => {};               // called when the AR effect should start
    this.onStatus = () => {};                  // called when something the tablet mirrors changes
    this._lastStatus = "";

    // head orientation from the phone's motion sensors
    this.targetQ = new THREE.Quaternion();
    this.hasOrientation = false;
    window.addEventListener("deviceorientation", e => this._onOrient(e));
  }

  // ------------------------------------------------------------ setup
  async init() {
    try {
      await Promise.all([
        document.fonts.load(`700 52px "Noto Sans"`, "Aa"),
        document.fonts.load(`700 52px "Noto Sans Tamil"`, "தமிழ்"),
        document.fonts.load(`700 52px "Noto Sans Sinhala"`, "සිංහල")
      ]);
    } catch (e) { /* fonts not reachable – system fonts are used */ }

    this.eyeRoot = new THREE.Group();
    this.pathRoot = new THREE.Group();
    this.content.add(this.eyeRoot, this.pathRoot);
    const eyeOk = await this._loadGLB(MODELS.eye, this.eyeRoot, "eye");
    if (!eyeOk) this._buildEye();
    const pathOk = await this._loadGLB(MODELS.pathway, this.pathRoot, "pathway");
    if (!pathOk) this._buildPathway();
    this._buildButtons();
    this.setLanguage(this.lang);
    this._applyView();
  }

  _register(id, meshes, scene, labelPos, anchorPos, parent) {
    const entry = { id, meshes, scene, button: null, label: null };
    for (const m of meshes) {
      m.userData.selId = id;
      // own copy of the material so highlighting one part never lights up another
      if (m.material && m.material !== HIT) { m.material = m.material.clone(); m.userData.baseEmissive = m.material.emissive ? m.material.emissive.getHex() : 0; }
    }
    if (labelPos) {
      const lab = new TextThing(id, "label", 0.026);
      lab.obj.position.copy(labelPos);
      parent.add(lab.obj);
      this.labels.push(lab);
      entry.label = lab;
      if (anchorPos) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchorPos, labelPos]),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }));
        line.renderOrder = 9;
        parent.add(line);
        entry.line = line;
      }
    }
    this.sel.set(id, entry);
    return entry;
  }

  // ------------------------------------------------------------ optional .glb models
  async _loadGLB(url, root, kind) {
    try {
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) return false;
      const gltf = await new GLTFLoader().loadAsync(url);
      const model = gltf.scene;
      // fit the model to a sensible size and centre it
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const s = (kind === "eye" ? 0.4 : 0.32) / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);
      model.position.copy(centre).multiplyScalar(-s);
      const holder = new THREE.Group(); holder.add(model);
      root.add(holder);
      if (kind === "eye") this.eyeSpin = holder; else this.pathSpin = holder;
      const rules = kind === "eye"
        ? [["lens", /lens/i], ["opticDisc", /disc|disk/i], ["opticNerve", /nerve/i], ["retina", /retina|macula/i]]
        : [["pChiasm", /chiasm/i], ["pTemporal", /temporal/i], ["pTract", /tract/i], ["pMeyer", /meyer/i],
           ["pParietal", /parietal/i], ["pOccipital", /occipital|cortex/i], ["pOpticNerve", /nerve/i]];
      const found = {};
      model.updateMatrixWorld(true);
      model.traverse(o => {
        if (!o.isMesh) return;
        const name = (o.name || "") + " " + (o.parent ? o.parent.name : "");
        const rule = rules.find(([, re]) => re.test(name));
        if (rule) (found[rule[0]] = found[rule[0]] || []).push(o);
      });
      for (const [id, meshes] of Object.entries(found)) {
        const b = new THREE.Box3(); meshes.forEach(m => b.expandByObject(m));
        const c = holder.worldToLocal(b.getCenter(new THREE.Vector3()));
        const lp = c.clone().add(new THREE.Vector3(c.x < 0 ? -0.07 : 0.07, 0.06, 0.03));
        this._register(id, meshes, kind, lp, c, holder);
      }
      console.info(`Loaded ${url}; selectable parts:`, Object.keys(found));
      return Object.keys(found).length > 0;
    } catch (e) {
      console.warn(`Could not use ${url}, using built-in shapes`, e);
      root.clear();
      return false;
    }
  }

  // ------------------------------------------------------------ built-in eye (cut-away)
  _buildEye() {
    const spin = new THREE.Group();          // rotates slowly around the eye centre
    spin.position.x = -0.5 * R;              // centre the whole composition (cornea … optic nerve)
    this.eyeRoot.add(spin);
    this.eyeSpin = spin;
    const back = { phiStart: Math.PI, phiLength: Math.PI };   // keep the half away from the visitor

    const half = (r, color, side) => new THREE.Mesh(
      new THREE.SphereGeometry(r, 40, 24, back.phiStart, back.phiLength),
      lambert(color, { side }));
    const sclera = half(R, 0xf2ede4, THREE.FrontSide);
    const choroid = half(R * 0.965, 0x6b1a1f, THREE.DoubleSide);
    const retina = half(R * 0.94, 0xd9603f, THREE.BackSide);
    spin.add(sclera, choroid, retina);

    // the cut face: rings showing the three layers
    const ring = (r1, r2, color) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 48), lambert(color, { side: THREE.DoubleSide }));
      return m;
    };
    spin.add(ring(R * 0.965, R, 0xf2ede4), ring(R * 0.94, R * 0.965, 0x8c2228));

    // macula (centre of the retina) – part of the "Retina" target
    const dirMac = new THREE.Vector3(0.97, 0.06, -0.24).normalize();
    const macula = new THREE.Mesh(new THREE.CircleGeometry(R * 0.11, 24), lambert(0xe8a23a, { side: THREE.DoubleSide }));
    macula.position.copy(dirMac).multiplyScalar(R * 0.93);
    macula.lookAt(0, 0, 0);
    spin.add(macula);

    // optic disc
    const dirDisc = new THREE.Vector3(0.93, -0.2, -0.3).normalize();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.085, 24), lambert(0xffe7b0, { side: THREE.DoubleSide, emissive: 0x332200 }));
    disc.position.copy(dirDisc).multiplyScalar(R * 0.925);
    disc.lookAt(0, 0, 0);
    spin.add(disc);

    // cornea (clear front cap) and iris
    const corneaGeo = new THREE.SphereGeometry(R * 0.52, 32, 12, back.phiStart, back.phiLength, 0, 0.95);
    corneaGeo.rotateZ(Math.PI / 2);
    const cornea = new THREE.Mesh(corneaGeo, lambert(0xbfe3ff, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    cornea.position.x = -R * 0.58;
    spin.add(cornea);
    const irisGeo = new THREE.RingGeometry(R * 0.13, R * 0.45, 40, 1, -Math.PI / 2, Math.PI);
    irisGeo.rotateY(Math.PI / 2);
    const iris = new THREE.Mesh(irisGeo, lambert(0x2f6f8f, { side: THREE.DoubleSide }));
    iris.position.x = -R * 0.86;
    spin.add(iris);

    // lens
    const lens = new THREE.Mesh(new THREE.SphereGeometry(R * 0.3, 32, 18), lambert(0xf3ecd2, { transparent: true, opacity: 0.92, emissive: 0x15120a }));
    lens.scale.set(0.45, 1, 1);
    lens.position.x = -R * 0.72;
    spin.add(lens);

    // optic nerve
    const nerveGeo = new THREE.CylinderGeometry(R * 0.15, R * 0.18, R * 1.35, 20, 1);
    nerveGeo.rotateZ(Math.PI / 2);
    const nerve = new THREE.Mesh(nerveGeo, lambert(0xf0c66a));
    nerve.position.set(R * 1.55, -R * 0.2, -R * 0.12);
    nerve.rotation.z = -0.12;
    spin.add(nerve);

    const V = (x, y, z) => new THREE.Vector3(x * R, y * R, z * R);
    this._register("lens", [lens], "eye", V(-1.05, 0.95, 0.2), V(-0.72, 0.15, 0), spin);
    this._register("retina", [retina, macula], "eye", V(0.35, 1.2, 0.2), V(0.25, 0.85, -0.3), spin);
    const discHit = hitSphere(disc.position, R * 0.2); spin.add(discHit);
    this._register("opticDisc", [disc, discHit], "eye", V(0.55, -1.15, 0.25), disc.position.clone(), spin);
    this._register("opticNerve", [nerve], "eye", V(1.95, 0.55, 0.15), V(1.7, -0.1, 0), spin);
  }

  // ------------------------------------------------------------ built-in visual pathway
  _buildPathway() {
    const tilt = new THREE.Group();
    tilt.rotation.x = 0.95;                 // lay the brain plane down, eyes far, back of head near the visitor
    tilt.scale.setScalar(1.05);
    this.pathRoot.position.y = 0.035;       // lift it a little so all of it stays in view
    this.pathRoot.add(tilt);
    this.pathSpin = tilt;
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    const tube = (pts, r, color) => new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8, false), lambert(color));

    // brain outline (faint)
    const brain = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 12),
      new THREE.MeshLambertMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.08, depthWrite: false }));
    brain.scale.set(0.95, 0.42, 1.12); brain.position.z = -0.005;
    tilt.add(brain);

    for (const s of [-1, 1]) {
      // eye ball
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), lambert(0xf2ede4));
      eye.position.set(s * 0.055, 0, -0.17);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), lambert(0x2f6f8f, { side: THREE.DoubleSide }));
      iris.position.set(s * 0.055, 0, -0.1925); iris.rotation.y = Math.PI;
      tilt.add(eye, iris);
      // LGN
      const lgn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), lambert(0xffb547));
      lgn.position.set(s * 0.05, 0, 0);
      tilt.add(lgn);
    }
    const NERVE = 0xf0c66a, NASAL = 0x5fd4e8, TEMPORAL = 0xffb547, MEYER = 0xff8a5c, PARIETAL = 0x8fb4ff, CORTEX = 0xd88aa6, GREY = 0x9a8f78;
    const leftNerve = tube([P(-0.055, 0, -0.148), P(-0.04, 0, -0.12), P(-0.02, 0, -0.095)], 0.0055, NERVE);
    const rightNerve = tube([P(0.055, 0, -0.148), P(0.04, 0, -0.12), P(0.02, 0, -0.095)], 0.0055, GREY);
    // chiasm: nasal fibres cross, temporal fibres stay on their own side
    const nasalLR = tube([P(-0.02, 0, -0.095), P(0, 0.002, -0.07), P(0.02, 0, -0.045)], 0.0032, NASAL);
    const nasalRL = tube([P(0.02, 0, -0.095), P(0, -0.002, -0.07), P(-0.02, 0, -0.045)], 0.0032, NASAL);
    const leftTemporal = tube([P(-0.02, 0, -0.095), P(-0.026, 0, -0.07), P(-0.02, 0, -0.045)], 0.0034, TEMPORAL);
    const rightTemporal = tube([P(0.02, 0, -0.095), P(0.026, 0, -0.07), P(0.02, 0, -0.045)], 0.0034, GREY);
    const chiasm = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 10),
      lambert(NASAL, { transparent: true, opacity: 0.55, depthWrite: false }));
    chiasm.position.set(0, 0, -0.07);
    const leftTract = tube([P(-0.02, 0, -0.045), P(-0.035, 0, -0.022), P(-0.05, 0, 0)], 0.0055, NERVE);
    const rightTract = tube([P(0.02, 0, -0.045), P(0.035, 0, -0.022), P(0.05, 0, 0)], 0.0055, GREY);
    const meyer = s => tube([P(s * 0.05, 0, 0), P(s * 0.085, -0.012, -0.018), P(s * 0.1, -0.014, 0.03), P(s * 0.075, -0.005, 0.08), P(s * 0.035, 0, 0.118)], 0.0045, s < 0 ? MEYER : GREY);
    const parietal = s => tube([P(s * 0.05, 0, 0), P(s * 0.062, 0.016, 0.04), P(s * 0.048, 0.01, 0.088), P(s * 0.032, 0, 0.118)], 0.0045, s < 0 ? PARIETAL : GREY);
    const leftMeyer = meyer(-1), rightMeyer = meyer(1), leftPar = parietal(-1), rightPar = parietal(1);
    const cortex = s => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12), lambert(s < 0 ? CORTEX : 0xa08890));
      m.scale.set(1, 0.6, 0.7); m.position.set(s * 0.032, 0, 0.135); return m;
    };
    const leftCortex = cortex(-1), rightCortex = cortex(1);
    tilt.add(leftNerve, rightNerve, nasalLR, nasalRL, leftTemporal, rightTemporal, chiasm, leftTract, rightTract,
      leftMeyer, rightMeyer, leftPar, rightPar, leftCortex, rightCortex);

    const thick = 0.011;
    const hits = {
      nerve: hitTube([P(-0.055, 0, -0.148), P(-0.04, 0, -0.12), P(-0.02, 0, -0.095)], thick),
      chiasm: hitSphere(P(0.004, 0, -0.07), 0.016),
      temporal: hitTube([P(-0.022, 0, -0.092), P(-0.03, 0, -0.07), P(-0.022, 0, -0.048)], 0.009),
      tract: hitTube([P(-0.022, 0, -0.042), P(-0.035, 0, -0.022), P(-0.05, 0, 0)], thick),
      meyer: hitTube([P(-0.055, 0, -0.004), P(-0.085, -0.012, -0.018), P(-0.1, -0.014, 0.03), P(-0.075, -0.005, 0.08), P(-0.04, 0, 0.115)], thick),
      parietal: hitTube([P(-0.052, 0.002, 0.006), P(-0.062, 0.016, 0.04), P(-0.048, 0.01, 0.088), P(-0.034, 0, 0.114)], thick)
    };
    for (const h of Object.values(hits)) tilt.add(h);
    this._register("pOpticNerve", [leftNerve, hits.nerve], "pathway", P(-0.135, 0.02, -0.135), P(-0.04, 0, -0.12), tilt);
    this._register("pChiasm", [chiasm, nasalLR, nasalRL, hits.chiasm], "pathway", P(0.1, 0.02, -0.085), P(0.006, 0, -0.07), tilt);
    this._register("pTemporal", [leftTemporal, hits.temporal], "pathway", P(-0.135, 0.02, -0.075), P(-0.026, 0, -0.07), tilt);
    this._register("pTract", [leftTract, hits.tract], "pathway", P(-0.135, 0.02, -0.02), P(-0.036, 0, -0.022), tilt);
    this._register("pMeyer", [leftMeyer, hits.meyer], "pathway", P(-0.16, 0, 0.035), P(-0.1, -0.014, 0.03), tilt);
    this._register("pParietal", [leftPar, hits.parietal], "pathway", P(-0.15, 0.03, 0.09), P(-0.05, 0.01, 0.085), tilt);
    this._register("pOccipital", [leftCortex], "pathway", P(-0.11, 0, 0.175), P(-0.035, 0, 0.14), tilt);
    // eye names (not selectable)
    for (const [key, x] of [["eyeL", -0.055], ["eyeR", 0.055]]) {
      const lab = new TextThing(key, "label", 0.022);
      lab.obj.position.set(x * 1.9, 0.03, -0.2);
      tilt.add(lab.obj);
      this.labels.push(lab);
      this.sel.set(key, { id: key, meshes: [], scene: "pathway", label: lab, passive: true });
    }
  }

  // ------------------------------------------------------------ floating buttons
  _buildButtons() {
    const btn = (id, x, y, z, h, scene) => {
      const t = new TextThing(id, "button", h);
      t.obj.position.set(x, y, z);
      this.content.add(t.obj);
      this.labels.push(t);
      const e = this._register(id, [t.obj], scene, null, null, this.content);
      e.button = t;
      return e;
    };
    btn("navBack", -0.085, -0.2, 0.05, 0.042, "nav");
    btn("navHome", 0.085, -0.2, 0.05, 0.042, "nav");
    btn("chNeuritis", 0, 0.05, 0.16, 0.05, "choice");
    btn("chField", 0, -0.035, 0.16, 0.05, "choice");
  }

  setLanguage(lang) {
    this.lang = lang;
    for (const l of this.labels) l.setText(lang);
  }

  // ------------------------------------------------------------ settings & cameras
  setSettings({ modelDistance = 1, modelSize = 1, cameraFov = 42, zoom = 1 }, extent) {
    this.distance = modelDistance;
    this.size = modelSize;
    this.content.scale.setScalar(modelSize);
    if (this._screenAspect) this._layoutScreen();
    // m-space radius 1 = edge of the eye circle = what the camera image shows at that radius
    this.tanHalf = Math.tan(THREE.MathUtils.degToRad(cameraFov) / 2) / Math.max(0.1, zoom);
    this.extent = extent;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(extent * this.tanHalf));
    for (const c of [this.head, ...this.eyeCams]) { c.fov = fov; c.updateProjectionMatrix(); }
    if (this.active) this._placeAnchor(false);
  }

  // ------------------------------------------------------------ head tracking
  _onOrient(e) {
    if (e.alpha == null && e.beta == null) return;
    const d = THREE.MathUtils.degToRad;
    const orient = d((screen.orientation && screen.orientation.angle) || window.orientation || 0);
    const euler = new THREE.Euler(d(e.beta || 0), d(e.alpha || 0), -d(e.gamma || 0), "YXZ");
    this.targetQ.setFromEuler(euler);
    this.targetQ.multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2));   // camera looks out of the back
    this.targetQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient));
    if (!this.hasOrientation) { this.hasOrientation = true; this.head.quaternion.copy(this.targetQ); if (this.active || this.screenWanted) this.recentre(); }
  }

  recentre() { this._placeAnchor(true); }

  // ------------------------------------------------------------ mirrored tablet screen
  // mainTex: video or picture; overTex: transparent layer with highlights / captions
  showScreen(mainTex, aspect, overTex) {
    const firstTime = !this.screenWanted;
    this.screenWanted = true;
    this.screenMain.material.map = mainTex; this.screenMain.material.needsUpdate = true;
    this.screenOver.material.map = overTex; this.screenOver.material.needsUpdate = true;
    this._screenAspect = aspect || 16 / 9;
    this._layoutScreen();
    if (firstTime && !this.active) this.recentre();
  }
  hideScreen() { this.screenWanted = false; }
  _layoutScreen() {
    const w = 0.6 * this.size, h = w / (this._screenAspect || 16 / 9);   // about 33° wide at 1 m: the whole frame fits in the lens view
    this.screenMain.scale.set(w, h, 1); this.screenOver.scale.set(w, h, 1);
    this.screenBack.scale.set(w * 1.03, h * 1.03 + 0.012, 1);
    this.screenRoot.position.y = Math.tan(THREE.MathUtils.degToRad(10)) * this.distance;   // back up to eye level
  }

  // testing helper: point the head at a selectable part
  _aimAt(id) {
    const e = this.sel.get(id); if (!e || !e.meshes[0]) return false;
    this.scene.updateMatrixWorld();
    const mesh = e.meshes[0], g = mesh.geometry;
    let p;
    if (g.type === "TubeGeometry") {           // centre of the middle ring = a point on the tube's centre line
      const { tubularSegments: ts, radialSegments: rs } = g.parameters, pos = g.attributes.position;
      const start = Math.floor(ts / 2) * (rs + 1); p = new THREE.Vector3();
      for (let i = 0; i <= rs; i++) p.add(new THREE.Vector3().fromBufferAttribute(pos, start + i));
      p.divideScalar(rs + 1).applyMatrix4(mesh.matrixWorld);
    } else p = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), p, new THREE.Vector3(0, 1, 0));
    this.targetQ.setFromRotationMatrix(m); this.head.quaternion.copy(this.targetQ); this.hasOrientation = true;
    return true;
  }

  _placeAnchor(fromHead) {
    if (fromHead || !this.heading) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.head.quaternion);
      f.y = 0;
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      this.heading = f.normalize();
    }
    this.anchor.position.copy(this.heading).multiplyScalar(this.distance);
    this.anchor.position.y = -Math.tan(THREE.MathUtils.degToRad(10)) * this.distance;  // a little below eye level
    this.anchor.lookAt(0, 0, 0);                    // +z of the model faces the visitor
    this.centred = true;
    this.outOfView = 0;
  }

  // ------------------------------------------------------------ flow
  start(lang) {
    if (lang && lang !== this.lang) this.setLanguage(lang);
    this.active = true;
    this.view = "eye"; this.choicesOpen = false;
    this.selectedId = null; this.glowId = null;
    this._setPhase("browse");
    this.recentre();
    this._applyView();
  }
  stop() { this.active = false; this._setPhase("hidden"); }
  goEye() { this.view = "eye"; this.choicesOpen = false; this._applyView(); this._status(); }

  // operator / tablet asked for a condition directly
  runCondition(cond) {
    if (!this.active) return false;
    if (!["browse", "fadeIn"].includes(this.phase)) return false;
    this.pendingCond = cond; this.selectedId = null; this.glowId = null;
    this._setPhase("fadeOut");
    return true;
  }
  effectDone() { if (this.phase === "effect") this._setPhase("fadeIn"); }

  _setPhase(p) {
    this.phase = p; this.phaseT = 0;
    if (p === "browse") for (const k of ["gaze", "hand"]) this.hold[k] = { id: null, t: 0, armed: false, block: undefined };
    this._status();
  }

  _select(id) {
    const a = ACTIONS[id];
    if (!a) return;
    this.selectedId = id;
    this.hold.gaze = { id: null, t: 0, armed: false, block: undefined }; this.hold.hand = { id: null, t: 0, armed: false, block: undefined };
    if (a.back) {
      if (this.choicesOpen) this.choicesOpen = false;
      else if (this.view === "pathway") this.view = "eye";
      this._applyView();
    } else if (a.home) {
      this.view = "eye"; this.choicesOpen = false; this._applyView();
    } else if (a.choices) {
      this.choicesOpen = true; this._applyView();
    } else if (a.pathway) {
      this.view = "pathway"; this.choicesOpen = false; this._applyView();
    } else if (a.cond) {
      this.pendingCond = a.cond;
      this.glowId = a.glow || id;
      this.choicesOpen = false; this._applyView();
      this._setPhase("glow");
      return;
    }
    this._status();
  }

  _applyView() {
    this.eyeRoot.visible = this.view === "eye";
    this.pathRoot.visible = this.view === "pathway";
    for (const e of this.sel.values()) {
      if (e.scene === "choice") e.meshes[0].visible = this.choicesOpen;
      if (e.id === "navBack") e.meshes[0].visible = this.choicesOpen || this.view === "pathway";
      if (e.id === "navHome") e.meshes[0].visible = this.view === "pathway";
      // part labels step back while the two choices are shown
      if (e.label && e.scene === "eye") e.label.obj.visible = !this.choicesOpen;
      if (e.line && e.scene === "eye") e.line.visible = !this.choicesOpen;
    }
  }

  _selectable(e) {
    if (e.passive || !e.meshes.length) return false;
    if (e.scene === "nav" || e.scene === "choice") return e.meshes[0].visible;
    if (this.choicesOpen) return false;
    return e.scene === this.view;
  }

  // ------------------------------------------------------------ per frame
  // pointers: [{ kind: "gaze"|"hand", ndc: {x, y}, holdTime }]
  update(dt, pointers) {
    this.time += dt;
    this.phaseT += dt;
    this.head.quaternion.slerp(this.targetQ, this.hasOrientation ? 0.4 : 0);

    // phase timing and overlay fade
    switch (this.phase) {
      case "hidden": this.alpha = Math.max(0, this.alpha - dt * 2); break;
      case "browse": this.alpha = Math.min(1, this.alpha + dt * 2); break;
      case "glow": if (this.phaseT >= 2) this._setPhase("fadeOut"); break;
      case "fadeOut":
        this.alpha = 1 - smooth(this.phaseT / 0.6);
        if (this.phaseT >= 0.6) { this.alpha = 0; this.onCondition(this.pendingCond); this._setPhase("effect"); }
        break;
      case "effect": this.alpha = 0; break;
      case "fadeIn":
        this.alpha = smooth(this.phaseT / 0.8);
        if (this.phaseT >= 0.8) { this.glowId = null; this._setPhase("browse"); }
        break;
    }

    // mirrored screen fades in / out (never together with the 3D eye)
    const showScr = this.screenWanted && !this.active;
    this.screenAlpha = Math.max(0, Math.min(1, this.screenAlpha + (showScr ? dt * 2.5 : -dt * 3)));
    this.screenRoot.visible = this.screenAlpha > 0.001;
    for (const m of [this.screenBack, this.screenMain, this.screenOver]) m.material.opacity = this.screenAlpha * (m === this.screenBack ? 0.85 : 1);
    this.content.visible = this.active || this.alpha > 0.001;

    // keep the model in view: if it has been out of sight for 4 s, bring it back in front
    if (((this.active && this.phase === "browse") || (showScr && this.screenAlpha > 0.9)) && this.hasOrientation) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.head.quaternion);
      const toModel = this.anchor.position.clone().normalize();
      this.outOfView = f.dot(toModel) < Math.cos(THREE.MathUtils.degToRad(45)) ? this.outOfView + dt : 0;
      if (this.outOfView > 4) this.recentre();
    }

    // picking
    const canPick = this.active && this.phase === "browse" && this.alpha > 0.95;
    const hits = {};
    const targets = [];
    if (canPick) for (const e of this.sel.values()) if (this._selectable(e)) targets.push(...e.meshes);
    this.scene.updateMatrixWorld();
    let hitDistance = this.distance;
    for (const p of pointers) {
      let id = null;
      if (canPick && p.ndc) {
        this.raycaster.setFromCamera(new THREE.Vector2(p.ndc.x, p.ndc.y), this.head);
        const hit = this.raycaster.intersectObjects(targets, false)[0];
        if (hit) { id = hit.object.userData.selId; if (p.kind === "gaze") hitDistance = hit.distance; }
      }
      const h = this.hold[p.kind];
      // after a selection the dot must first move off whatever it was on (to empty space or another part)
      if (!h.armed) { if (h.block === undefined) h.block = id; if (id !== h.block) h.armed = true; }
      // a short slip off the part (< 0.25 s, e.g. head wobble) does not restart the ring
      if (h.armed && h.id && h.t > 0 && id !== h.id) { h.lost = (h.lost || 0) + dt; if (h.lost < 0.25) id = h.id; }
      if (id === h.id) h.lost = 0;
      if (id && id === h.id && h.armed) h.t += dt; else { h.id = id; h.t = 0; h.lost = 0; }
      hits[p.kind] = { id, progress: id && h.armed ? Math.min(1, h.t / p.holdTime) : 0 };
      if (id && h.armed && h.t >= p.holdTime) this._select(id);
    }
    for (const k of ["gaze", "hand"]) if (!pointers.find(p => p.kind === k)) this.hold[k] = { ...this.hold[k], id: null, t: 0 };

    const hoverId = (hits.hand && hits.hand.id) || (hits.gaze && hits.gaze.id) || null;
    this.hoverId = hoverId;

    // slow rotation (paused while the visitor looks at something)
    if (this.eyeSpin && !hoverId && this.phase === "browse" && !this.choicesOpen) this.eyeSpinT = (this.eyeSpinT || 0) + dt;
    if (this.eyeSpin) this.eyeSpin.rotation.y = Math.sin((this.eyeSpinT || 0) * 0.35) * 0.55;
    if (this.pathSpin && !hoverId && this.phase === "browse") this.pathSpinT = (this.pathSpinT || 0) + dt;
    if (this.pathSpin && this.pathSpin.userData.baseTilt === undefined) this.pathSpin.userData.baseTilt = this.pathSpin.rotation.y;
    if (this.pathSpin) this.pathSpin.rotation.y = this.pathSpin.userData.baseTilt + Math.sin((this.pathSpinT || 0) * 0.3) * 0.18;

    this._highlight(hoverId);
    this._status();
    return { hits, hitDistance };
  }

  _highlight(hoverId) {
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 12);
    for (const e of this.sel.values()) {
      const glowing = e.id === this.glowId && (this.phase === "glow" || this.phase === "fadeOut");
      const hovered = e.id === hoverId;
      for (const m of e.meshes) {
        const mat = m.material;
        if (e.button) {
          mat.color.setHex(glowing ? 0xff7070 : hovered ? 0xffd28a : 0xffffff);
          const k = hovered || glowing ? 1.08 : 1;
          m.scale.set(e.button.baseScale.x * k, e.button.baseScale.y * k, 1);
        } else if (mat && mat.emissive) {
          if (glowing) { mat.emissive.setHex(RED); mat.emissiveIntensity = 0.6 + 0.6 * pulse; }
          else if (hovered) { mat.emissive.setHex(AMBER); mat.emissiveIntensity = 0.55; }
          else { mat.emissive.setHex(m.userData.baseEmissive || 0); mat.emissiveIntensity = 1; }
        }
      }
      if (e.label && e.label.baseScale) {
        const k = hovered || glowing ? 1.15 : 1;
        e.label.obj.scale.set(e.label.baseScale.x * k, e.label.baseScale.y * k, 1);
      }
    }
  }

  _status() {
    const s = {
      active: this.active, view: this.view, choices: this.choicesOpen, phase: this.phase,
      looking: this.hoverId || null, selected: this.selectedId || null,
      condition: this.phase === "effect" || this.phase === "glow" || this.phase === "fadeOut" ? this.pendingCond : null
    };
    const key = JSON.stringify(s);
    if (key !== this._lastStatus) { this._lastStatus = key; this.onStatus(s); }
  }

  // ------------------------------------------------------------ render both eyes
  render(rtL, rtR) {
    const r = this.renderer;
    const prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    this.scene.updateMatrixWorld();
    [rtL, rtR].forEach((rt, i) => {
      r.setRenderTarget(rt);
      r.clear(true, true, true);
      if (this.alpha > 0.001 || this.screenAlpha > 0.001) r.render(this.scene, this.eyeCams[i]);
    });
    r.setRenderTarget(null);
    r.setClearColor(prevColor, prevAlpha);
  }

  // how far each eye's reticle is shifted so the dot sits at the depth of what it points at
  // overall opacity of the 3D layer in the final image
  layerAlpha() { return this.active ? this.alpha : (this.screenAlpha > 0.001 ? 1 : this.alpha); }

  reticleOffset(distance) { return (STEREO_IPD / 2 / Math.max(0.2, distance)) / this.tanHalf; }
}
