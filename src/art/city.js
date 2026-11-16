/**
 * Your city on Earth.
 *
 * Every district the player has built on the Earth screen stands here as real
 * buildings around the landing pad: arcology towers, foundries with smoking
 * stacks, a research campus under glass, a shipyard gantry with a hull in it,
 * shield pylons, a fusion plant and farm domes — with Starfleet Command at the
 * heart of it. Higher-level districts grow taller and fuller.
 *
 * Returns the buildings (baked into a few draw calls), circles the away team
 * cannot walk through, and points for the floating name labels.
 */
import * as THREE from 'three';
import { bakeStaticMeshes } from './ships3d.js';
import { DISTRICTS } from '../data/tech.js';

/* ---------------------------------------------------------------- materials */
let facadeTex = null;
/** A tiling sheet of office/apartment windows: some lit, most reflecting sky. */
function facadeTexture() {
  if (facadeTex) return facadeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9d1d9';
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const lit = rnd() < 0.22;
      g.fillStyle = lit ? '#ffe2a8' : `hsl(208, 30%, ${22 + rnd() * 18}%)`;
      g.fillRect(x * 32 + 4, y * 32 + 6, 24, 20);
    }
  }
  facadeTex = new THREE.CanvasTexture(c);
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
  return facadeTex;
}

function cityMaterials() {
  const tex = facadeTexture();
  return {
    tower: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.2 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xc8c4bb, roughness: 0.85, metalness: 0.02 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.45, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8b939c, roughness: 0.4, metalness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.6, metalness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, envMapIntensity: 1.6, depthWrite: false }),
    green: new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 0.9 }),
    field: new THREE.MeshStandardMaterial({ color: 0x8fb04a, roughness: 0.95 }),
    plaza: new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 0.9, metalness: 0.02 }),
    hull: new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.4, metalness: 0.45 }),
    blue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x59e0ff).multiplyScalar(1.3), toneMapped: false }),
    amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(1.3), toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a3d).multiplyScalar(1.5), toneMapped: false }),
    shield: new THREE.MeshBasicMaterial({ color: 0xff8a7d, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
  };
}

/** A box whose texture repeats with its size, so windows stay the same size on every tower. */
function facadeBox(w, h, d, unit = 4) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z — 4 vertices each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit);
    }
  }
  return geo;
}

function facadeCylinder(r, h, seg = 20, unit = 4) {
  const geo = new THREE.CylinderGeometry(r, r, h, seg, 1, false);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.PI * 2 * r) / unit, uv.getY(i) * h / unit);
  return geo;
}

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/* ---------------------------------------------------------------- buildings */
// Each builder draws a block centred on (0, 0) with ground at y = 0, about 26 × 26 units.
// It returns the block group, its solid footprint circles, and its roof height.

function capital(M, lvl) {
  const g = new THREE.Group();
  const solids = [];
  // the long, curved headquarters wing
  const wing = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 6 + lvl, 40, 1, true, -1.1, 2.2), M.tower);
  wing.material = M.tower;
  wing.geometry = (() => { const geo = wing.geometry; const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * (6 + lvl) / 4); return geo; })();
  wing.position.set(0, (6 + lvl) / 2, -2);
  g.add(wing);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(12.2, 12.2, 0.5, 40, 1, false, -1.1, 2.2), M.white);
  roof.position.set(0, 6 + lvl, -2);
  g.add(roof);
  const roofIn = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6 + lvl, 40, 1, false, -1.1, 2.2), M.concrete);
  roofIn.position.set(0, (6 + lvl) / 2, -2);
  g.add(roofIn);
  // central tower with the command dish
  const th = 16 + lvl * 3;
  g.add(mesh(facadeCylinder(2.6, th), M.tower, 0, th / 2, 4));
  g.add(mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 24), M.white, 0, th + 0.3, 4));
  const dish = mesh(new THREE.SphereGeometry(2.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white, 0, th + 0.6, 4);
  g.add(dish);
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), M.metal, 0, th + 4, 4));
  g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), M.red, 0, th + 6.1, 4));
  // the delta in the plaza
  const delta = new THREE.Shape([[0, 2.2], [1.5, -1.6], [0, -0.7], [-1.5, -1.6]].map(([x, y]) => new THREE.Vector2(x, y)));
  const em = mesh(new THREE.ExtrudeGeometry(delta, { depth: 0.12, bevelEnabled: false }), M.amber, 0, 0.1, 13);
  em.rotation.x = -Math.PI / 2;
  g.add(em);
  // flagpoles
  for (const x of [-4, -1.4, 1.4, 4]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), M.metal, x, 3, 16));
  solids.push({ x: 0, z: 4, r: 3.4 }, { x: 0, z: -12, r: 5 }, { x: -8.5, z: -8, r: 4 }, { x: 8.5, z: -8, r: 4 }, { x: -11, z: 0, r: 3 }, { x: 11, z: 0, r: 3 });
  return { g, solids, top: th + 6 };
}

function residential(M, lvl, rnd) {
  const g = new THREE.Group();
  const solids = [];
  const n = 2 + Math.min(3, Math.floor(lvl / 2));
  const spots = [[-6, -6], [6, 5], [-5, 7], [7, -7], [0, 0]];
  let top = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    const h = 14 + lvl * 4 + rnd() * 10;
    const round = rnd() < 0.4;
    const w = 5 + rnd() * 2;
    g.add(mesh(round ? facadeCylinder(w / 2, h) : facadeBox(w, h, w), M.tower, x, h / 2, z));
    // stepped crown and a rooftop garden
    g.add(mesh(round ? new THREE.CylinderGeometry(w / 2 - 0.6, w / 2, 1.2, 20) : new THREE.BoxGeometry(w - 1, 1.2, w - 1), M.white, x, h + 0.6, z));
    g.add(mesh(new THREE.CylinderGeometry(w / 2 - 1, w / 2 - 1, 0.3, 14), M.green, x, h + 1.3, z));
    g.add(mesh(new THREE.SphereGeometry(0.16, 6, 4), M.red, x, h + 1.6, z));
    solids.push({ x, z, r: w * 0.62 });
    top = Math.max(top, h + 2);
  }
  // a sky bridge between the first two towers
  if (n >= 2) {
    const bridge = mesh(new THREE.BoxGeometry(1.6, 1.4, Math.hypot(12, 11)), M.glass, 0, 11 + lvl, -0.5);
    bridge.lookAt(6, 11 + lvl, 5);
    g.add(bridge);
  }
  return { g, solids, top };
}

function industry(M, lvl, rnd) {
  const g = new THREE.Group();
  const solids = [];
  const hallW = 18, hallD = 10, hallH = 5 + lvl * 0.5;
  g.add(mesh(new THREE.BoxGeometry(hallW, hallH, hallD), M.concrete, 0, hallH / 2, -4));
  // sawtooth roof lights
  for (let i = 0; i < 5; i++) {
    const t = mesh(new THREE.BoxGeometry(3.2, 1.2, hallD), M.glass, -7 + i * 3.6, hallH + 0.5, -4);
    t.rotation.z = 0.5;
    g.add(t);
  }
  // stacks with hot tops, and storage tanks
  const stacks = 2 + Math.min(3, Math.floor(lvl / 2));
  for (let i = 0; i < stacks; i++) {
    const h = 12 + lvl * 1.5 + rnd() * 4;
    const x = -7 + i * 4;
    g.add(mesh(new THREE.CylinderGeometry(0.7, 1, h, 12), M.metal, x, h / 2, 4));
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12), M.amber, x, h, 4));
    for (let b = 0; b < 2; b++) g.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.25, 12), M.red, x, h * (0.45 + b * 0.25), 4));
    solids.push({ x, z: 4, r: 1.3 });
  }
  for (const [x, z] of [[8, 6], [8, 1.5]]) {
    g.add(mesh(new THREE.CylinderGeometry(2, 2, 4, 18), M.white, x, 2, z));
    g.add(mesh(new THREE.SphereGeometry(2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.white, x, 4, z));
    solids.push({ x, z, r: 2.2 });
  }
  // a pipe rack between the tanks and the hall
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 8), M.dark, 0, 3, 1).rotateZ(Math.PI / 2));
  solids.push({ x: -5, z: -4, r: 6 }, { x: 5, z: -4, r: 6 });
  return { g, solids, top: 14 + lvl * 1.5, smoke: Array.from({ length: stacks }, (_, i) => new THREE.Vector3(-7 + i * 4, 13 + lvl * 1.5, 4)) };
}

function research(M, lvl) {
  const g = new THREE.Group();
  const r = 7 + lvl * 0.4;
  // a ring of labs around a glass dome
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 1.6, 10, 40), M.white);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.6;
  ring.scale.z = 1.6;
  g.add(ring);
  g.add(mesh(new THREE.SphereGeometry(r - 1.5, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, 0, 0.1, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.4, 2, 6 + lvl, 12), M.tower, 0, (6 + lvl) / 2, 0));
  // the radio telescope
  const dish = mesh(new THREE.SphereGeometry(3.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3.5), M.white, r + 5, 5, 0);
  dish.rotation.z = 0.9;
  g.add(dish);
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.6, 4.5, 8), M.metal, r + 5, 2.25, 0));
  return { g, solids: [{ x: 0, z: 0, r: r + 1.6 }, { x: r + 5, z: 0, r: 1.6 }], top: 9 + lvl };
}

function shipyard(M, lvl) {
  const g = new THREE.Group();
  const len = 20, h = 12 + lvl;
  // gantry frame
  for (const z of [-len / 2, -len / 6, len / 6, len / 2]) {
    for (const x of [-6, 6]) g.add(mesh(new THREE.BoxGeometry(0.6, h, 0.6), M.metal, x, h / 2, z));
    g.add(mesh(new THREE.BoxGeometry(12.6, 0.6, 0.6), M.metal, 0, h, z));
  }
  for (const x of [-6, 6]) g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, len), M.metal, x, h, 0));
  // a starship hull being built, with work lights
  const hull = mesh(new THREE.CapsuleGeometry(2.4, 11, 6, 16), M.hull, 0, 5.5, 0);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  const saucer = mesh(new THREE.CylinderGeometry(5, 5.4, 1, 32), M.hull, 0, 8.2, 4);
  g.add(saucer);
  g.add(mesh(new THREE.CylinderGeometry(5.05, 5.05, 0.18, 32), M.blue, 0, 7.75, 4));
  for (const z of [-8, 0, 8]) g.add(mesh(new THREE.SphereGeometry(0.25, 6, 4), M.amber, -5.6, h - 0.5, z), mesh(new THREE.SphereGeometry(0.25, 6, 4), M.amber, 5.6, h - 0.5, z));
  // crane
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.8, 14), M.dark, 0, h + 2.5, -2), mesh(new THREE.BoxGeometry(0.8, 3, 0.8), M.dark, 0, h + 1, -8));
  const solids = [];
  for (const z of [-10, -3.3, 3.3, 10]) for (const x of [-6, 6]) solids.push({ x, z, r: 0.8 });
  solids.push({ x: 0, z: -4, r: 3 }, { x: 0, z: 4, r: 5.4 });
  return { g, solids, top: h + 3 };
}

function defense(M, lvl) {
  const g = new THREE.Group();
  const h = 18 + lvl * 2;
  g.add(mesh(new THREE.CylinderGeometry(0.8, 3, h, 6), M.dark, 0, h / 2, 0));
  for (let i = 0; i < 3; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.4, h * 0.6, 4), M.metal, 0, h * 0.3, 0);
    fin.rotation.y = (i / 3) * Math.PI * 2;
    fin.translateZ(2.2);
    g.add(fin);
  }
  g.add(mesh(new THREE.SphereGeometry(1.4, 16, 10), M.red, 0, h + 1, 0));
  const dome = mesh(new THREE.SphereGeometry(13, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.shield, 0, 0, 0);
  dome.renderOrder = 2;
  g.add(dome);
  return { g, solids: [{ x: 0, z: 0, r: 3.4 }], top: h + 3 };
}

function energy(M, lvl) {
  const g = new THREE.Group();
  // hyperboloid cooling towers
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(3.6 - Math.sin(t * Math.PI) * 1.3 + (t > 0.8 ? 0.3 : 0), t * (12 + lvl))); }
  const towerGeo = new THREE.LatheGeometry(prof, 28);
  for (const [x, z] of [[-6, -5], [6, -5]]) {
    g.add(mesh(towerGeo, M.concrete, x, 0, z));
  }
  // the fusion reactor building with a glowing core
  g.add(mesh(new THREE.CylinderGeometry(4.2, 4.6, 5, 24), M.white, 0, 2.5, 6));
  g.add(mesh(new THREE.SphereGeometry(2.4, 20, 12), M.blue, 0, 6, 6));
  g.add(mesh(new THREE.TorusGeometry(3.2, 0.3, 8, 30), M.metal, 0, 6, 6).rotateX(Math.PI / 2));
  // power pylons
  for (const x of [-10, 10]) {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.5, 11, 4), M.metal, x, 5.5, 8));
    g.add(mesh(new THREE.BoxGeometry(3.6, 0.25, 0.25), M.metal, x, 10, 8));
  }
  return { g, solids: [{ x: -6, z: -5, r: 3.8 }, { x: 6, z: -5, r: 3.8 }, { x: 0, z: 6, r: 4.8 }], top: 13 + lvl, steam: [new THREE.Vector3(-6, 12 + lvl, -5), new THREE.Vector3(6, 12 + lvl, -5)] };
}

function biodome(M, lvl) {
  const g = new THREE.Group();
  const domes = [[0, 0, 7 + lvl * 0.4], [-9, 7, 4], [9, 6, 4.5]];
  const solids = [];
  for (const [x, z, r] of domes) {
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.6, 24), M.white, x, 0.3, z));
    // farm rows inside
    for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(r * 1.4, 0.6, r * 0.18), M.field, x, 0.8, z + i * r * 0.3));
    g.add(mesh(new THREE.SphereGeometry(r, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, x, 0.6, z));
    // the geodesic frame
    g.add(mesh(new THREE.IcosahedronGeometry(r * 1.002, 1), new THREE.MeshBasicMaterial({ color: 0xdfe8ef, wireframe: true, transparent: true, opacity: 0.35 }), x, 0.6, z));
    solids.push({ x, z, r: r + 0.3 });
  }
  // fields outside
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(5, 0.2, 7), i % 2 ? M.green : M.field, -8 + i * 6, 0.1, -9));
  return { g, solids, top: 8 + lvl * 0.4 };
}

const BUILDERS = { capital, residential, industry, research, shipyard, defense, energy, biodome };

/**
 * Lay out the player's districts around the landing pad.
 * @param {Array<{id:string,type:string,level:number}>} districts
 * @param {(x:number,z:number)=>number} groundAt  terrain height
 */
export function buildCity(districts, groundAt) {
  const M = cityMaterials();
  const root = new THREE.Group();
  root.name = 'city';
  const solids = [];
  const labels = [];
  const chimneys = [];
  const list = [...districts].sort((a, b) => (a.type === 'capital' ? -1 : b.type === 'capital' ? 1 : 0));
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  list.forEach((d, i) => {
    const make = BUILDERS[d.type] || residential;
    // Starfleet Command faces the pad; the rest ring the valley, inner ring first
    const inner = i < 8;
    const k = inner ? i : i - 8;
    const n = inner ? Math.min(8, list.length) : Math.min(14, list.length - 8);
    const a = (k / n) * Math.PI * 2 + (inner ? 0.35 : 0.6);
    const r = inner ? 66 : 108;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const lvl = Math.max(1, d.level || 1);
    const built = make(M, lvl, rnd);
    const block = built.g;
    // sit the block on the lowest ground under it, with a plaza and a deep foundation
    let base = Infinity;
    for (const [ox, oz] of [[0, 0], [12, 12], [-12, 12], [12, -12], [-12, -12]]) base = Math.min(base, groundAt(x + ox, z + oz));
    const yaw = a + Math.PI;            // front faces the pad
    block.position.set(x, base, z);
    block.rotation.y = yaw;
    const plaza = mesh(new THREE.CylinderGeometry(17, 18, 6, 32), M.plaza, 0, -2.95, 0);
    block.add(plaza);
    root.add(block);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toWorld = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    for (const c of built.solids) { const w = toWorld(c.x, c.z); solids.push({ x: w.x, z: w.z, r: c.r }); }
    for (const p of [...(built.smoke || []), ...(built.steam || [])]) {
      const w = toWorld(p.x, p.z);
      chimneys.push({ pos: new THREE.Vector3(w.x, base + p.y, w.z), steam: !!built.steam });
    }
    const node = new THREE.Object3D();
    node.position.set(x, base + built.top, z);
    const def = DISTRICTS[d.type] || {};
    labels.push({ node, name: def.name || d.type, level: lvl, color: def.color || '#59e0ff', icon: def.icon || '🏙️', pos: new THREE.Vector3(x, base, z) });
  });
  // a ring road linking the inner ring, laid on the ground
  const road = new THREE.Group();
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.92 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e2c8 });
  const segs = 132;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2, rr = 44;
    const x = Math.sin(am) * rr, z = Math.cos(am) * rr;
    const len = 2 * rr * Math.sin((a1 - a0) / 2) + 0.5;
    const seg = mesh(new THREE.BoxGeometry(5, 0.3, len), roadMat, x, groundAt(x, z) + 0.05, z);
    seg.rotation.y = am + Math.PI / 2;
    // follow the slope so it neither floats nor sinks
    const y0 = groundAt(Math.sin(a0) * rr, Math.cos(a0) * rr), y1 = groundAt(Math.sin(a1) * rr, Math.cos(a1) * rr);
    seg.rotateX(-Math.atan2(y1 - y0, len));
    road.add(seg);
    if (i % 3 === 0) {
      const dash = mesh(new THREE.BoxGeometry(0.18, 0.32, len * 0.6), lineMat, 0, 0.02, 0);
      seg.add(dash);
    }
  }
  root.add(road);
  bakeStaticMeshes(root);
  return { group: root, solids, labels, chimneys };
}

/** Push a walker out of any building it has walked into. */
export function pushOutOfSolids(pos, solids, bodyR = 0.5) {
  for (const c of solids) {
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + bodyR;
    if (d < min) {
      if (d < 1e-4) { pos.x = c.x + min; continue; }
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
  return pos;
}

export function insideSolid(x, z, solids, pad = 0) {
  return solids.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad);
}
