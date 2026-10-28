#!/usr/bin/env node
/**
 * Offline look check for the planet surface.
 *
 * There is no headless browser in this environment, so this boots the real
 * PlanetScene inside jsdom and draws it with a small software rasteriser
 * (z-buffered, flat-shaded, no textures). That is enough to check what matters
 * for composition — is the hull on the pad, is the away team framed, does the
 * horizon sit at a sane height, do the biomes look different — without claiming
 * to be a screenshot.
 *
 *   npm run shot -- --type=ice --out=shots/ice.png
 *   npm run shot -- --biome=volcanic --frames=80
 *
 * Everything it needs is already a dev dependency (jsdom, three).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { JSDOM } from 'jsdom';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const WANT = String(args.type || args.biome || '').trim();
const OUT = String(args.out || `shots/surface-${WANT || 'first'}.png`);
const FRAMES = Number(args.frames || 40);
const W = Number(args.w || 960);
const H = Number(args.h || 540);

/* ------------------------------------------------------------ browser-ish */
const dom = new JSDOM('<!doctype html><html><body><canvas id="viewport"></canvas><div id="ui"></div></body></html>',
  { pretendToBeVisual: true, url: 'http://localhost:5173/' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
// no 2D canvas without the `canvas` package; every paint call is a no-op
const paint = new Proxy({
  createRadialGradient: () => paint,
  createLinearGradient: () => paint,
  createPattern: () => ({}),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  measureText: () => ({ width: 8 }),
}, { get: (o, k) => (k in o ? o[k] : () => {}) });
window.HTMLCanvasElement.prototype.getContext = function (t) { return t === '2d' ? paint : null; };

const THREE = await import('three');
const { Game } = await import('../src/game.js');
const { PlanetScene } = await import('../src/scenes/planet.js');

/* ----------------------------------------------------------------- scene */
const game = new Game();
const input = {
  keys: new Set(), actions: {}, steer: { x: 0, y: 0 }, pressed: new Set(),
  consume: () => false, consumeAll() {}, bindStick() {}, bindActions() {}, update() {}, syncSteer() {},
};
const app = {
  game, canvas: document.getElementById('viewport'), viewport: { width: W, height: H },
  input, environment: null, setScene() {}, scenes: [],
};

const planets = game.galaxy.systems.flatMap((s) => s.planets);
const planet = (WANT && planets.find((p) => p.type === WANT)) || planets.find((p) => p.type !== 'gas');
if (!planet) throw new Error('no landable planet in this galaxy');

const scene = new PlanetScene(app);
scene.enter({ planetId: planet.id });
for (let i = 0; i < FRAMES; i++) scene.update(1 / 30, i / 30);

/* ------------------------------------------------------------- rasterise */
const cam = scene.camera;
cam.aspect = W / H;
cam.updateProjectionMatrix();
cam.updateMatrixWorld();
scene.scene.updateMatrixWorld(true);

const buf = new Float32Array(W * H * 3);
const zbuf = new Float32Array(W * H).fill(2);
const fog = scene.scene.fog;
const skyTop = new THREE.Color(0x05070f);
const skyLow = new THREE.Color(fog?.color?.getHex?.() ?? 0x1b2a3a);
for (let y = 0; y < H; y++) {
  const c = skyLow.clone().lerp(skyTop, Math.min(1, y / (H * 0.75)));
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    buf[i] = c.r; buf[i + 1] = c.g; buf[i + 2] = c.b;
  }
}

const view = cam.matrixWorldInverse.clone();
const proj = cam.projectionMatrix;
const sun = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
const tris = [];
const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

scene.scene.traverse((o) => {
  if (!o.isMesh || !o.geometry?.attributes?.position) return;
  const mat = o.material || {};
  // sprites, glow cards and shadow decals need their textures to read at all
  if (mat.transparent && (mat.opacity ?? 1) < 0.6) return;
  // emissives are weighted by their intensity, otherwise every glowing strip
  // renders at full saturation and the shot lies about the look
  const glow = (mat.emissiveIntensity ?? 1) * 0.45;
  const g = o.geometry;
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const idx = g.index ? g.index.array : null;
  const count = idx ? idx.length : pos.count;
  const base = new THREE.Color(mat.color?.getHex?.() ?? 0x8a8a8a);
  const emissive = mat.emissive && mat.emissive.getHex() !== 0
    ? new THREE.Color(mat.emissive.getHex()).multiplyScalar(glow) : null;

  for (let i = 0; i < count; i += 3) {
    const ids = idx ? [idx[i], idx[i + 1], idx[i + 2]] : [i, i + 1, i + 2];
    const p = ids.map((id, k) => v[k].fromBufferAttribute(pos, id).applyMatrix4(o.matrixWorld));
    const c = p.map((q) => q.clone().applyMatrix4(view).applyMatrix4(proj));
    if (c.some((q) => q.z <= -1 || q.z >= 1)) continue;
    const sx = c.map((q) => (q.x * 0.5 + 0.5) * W);
    const sy = c.map((q) => (-q.y * 0.5 + 0.5) * H);
    const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
    if (area > -0.3) continue;   // tiny slivers and back faces

    let r = base.r, gr = base.g, b = base.b;
    if (col) { r = col.getX(ids[0]); gr = col.getY(ids[0]); b = col.getZ(ids[0]); }
    const n = new THREE.Vector3().subVectors(p[1], p[0])
      .cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
    const lit = 0.3 + 0.7 * Math.abs(n.dot(sun));
    const centre = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3);
    tris.push({
      sx, sy, z0: c[0].z, z1: c[1].z, z2: c[2].z,
      dist: centre.distanceTo(cam.position),
      r: r * lit, g: gr * lit, b: b * lit, emissive,
      depth: (c[0].z + c[1].z + c[2].z) / 3,
    });
  }
});

// fog: blend toward the scene fog colour with view depth
const fogColor = fog ? new THREE.Color(fog.color.getHex()) : null;
tris.sort((a, b) => b.depth - a.depth);
for (const t of tris) {
  const { sx, sy } = t;
  const minY = Math.max(0, Math.floor(Math.min(...sy)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(...sy)));
  const minX = Math.max(0, Math.floor(Math.min(...sx)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(...sx)));
  const d = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2]);
  if (Math.abs(d) < 1e-6) continue;
  let { r, g, b } = t;
  if (t.emissive) { r = t.r * 0.5 + t.emissive.r; g = t.g * 0.5 + t.emissive.g; b = t.b * 0.5 + t.emissive.b; }
  if (fogColor) {
    const near = fog.near ?? 90, far = fog.far ?? 460;
    const k = Math.min(1, Math.max(0, (t.dist - near) / (far - near))) ** 1.4;
    r += (fogColor.r - r) * k; g += (fogColor.g - g) * k; b += (fogColor.b - b) * k;
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((sy[1] - sy[2]) * (px - sx[2]) + (sx[2] - sx[1]) * (py - sy[2])) / d;
      const w1 = ((sy[2] - sy[0]) * (px - sx[2]) + (sx[0] - sx[2]) * (py - sy[2])) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const depth = w0 * t.z0 + w1 * t.z1 + w2 * t.z2;
      const zi = y * W + x;
      if (depth >= zbuf[zi]) continue;
      zbuf[zi] = depth;
      const i = zi * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
}

/* ------------------------------------------------------------------- png */
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const o = y * (W * 3 + 1) + 1 + x * 3;
    for (let c = 0; c < 3; c++) {
      raw[o + c] = Math.round(Math.max(0, Math.min(1, buf[i + c])) * 255);
    }
  }
}
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc = (b) => {
  let c = ~0;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return ~c;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const cc = Buffer.alloc(4);
  cc.writeUInt32BE(crc(td) >>> 0);
  return Buffer.concat([len, td, cc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // truecolour
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.resolve(process.cwd(), OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`${planet.name} (${planet.type}) · ${tris.length} triangles → ${path.relative(process.cwd(), outPath)}`);
