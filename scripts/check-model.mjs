#!/usr/bin/env node
/**
 * Inspect a GLB before you drop it in the game.
 *
 *   npm run models:check -- path/to/export.glb
 *
 * No dependencies: reads the glTF container directly (JSON chunk + BIN chunk)
 * so it works even when the model would choke the browser. It reports what
 * usually goes wrong with an AI-generator export: wrong container format,
 * unit scale, poly count, texture weight and which axis the hull is longest on.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!args.length) {
  console.error('usage: npm run models:check -- public/models/<classId>.glb');
  process.exit(1);
}

const file = path.resolve(args[0]);
if (!fs.existsSync(file)) {
  console.error(`✗ no such file: ${file}`);
  process.exit(1);
}

const buf = fs.readFileSync(file);
const mb = buf.length / (1024 * 1024);
const warn = [];
const ok = [];

const ext = path.extname(file).toLowerCase();
if (ext === '.gltf') {
  console.log('· .gltf is JSON + sidecar .bin/textures. The game loads it, but a single');
  console.log('  .glb is far less likely to lose a texture when you copy it around.');
}

if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error('✗ not a GLB (bad magic). Re-export as glTF Binary (.glb).');
  console.error('  If this is an .fbx/.obj/.usdz, convert it first — the game only reads GLB.');
  process.exit(1);
}
const version = buf.readUInt32LE(4);
if (version !== 2) warn.push(`glTF version is ${version}; the game targets 2`);

let off = 12;
let json = null;
const binLen = { bytes: 0 };
while (off + 8 <= buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  if (type === 0x004e4942) binLen.bytes = len;
  off += 8 + len + ((4 - (len % 4)) % 4);
}
if (!json) {
  console.error('✗ GLB has no JSON chunk — the file is truncated.');
  process.exit(1);
}

const g = json;
const nodes = g.nodes || [];
const meshes = g.meshes || [];
const materials = g.materials || [];
const images = g.images || [];
const animations = g.animations || [];
const accessors = g.accessors || [];

// --- triangles (indexed primitives use the index count, others the vertex count)
let tris = 0;
let prims = 0;
let skinned = 0;
for (const m of meshes) {
  for (const p of m.primitives || []) {
    prims++;
    const mode = p.mode ?? 4;
    if (mode !== 4) continue;
    const count = p.indices != null ? accessors[p.indices]?.count : accessors[p.attributes?.POSITION]?.count;
    if (count) tris += count / 3;
    if (p.attributes?.JOINTS_0 != null) skinned++;
  }
}

// --- bounding box in scene space: walk the node graph and transform each
// primitive's accessor box by its world matrix. Raw accessor min/max alone lie
// whenever the exporter baked the orientation into a node rotation.
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = v;
    }
  }
  return o;
};
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
const visit = (index, parent) => {
  const n = nodes[index];
  if (!n) return;
  const world = mul(parent, nodeMatrix(n));
  for (const p of meshes[n.mesh]?.primitives || []) {
    const a = accessors[p.attributes?.POSITION];
    if (!a?.min || !a?.max) continue;
    for (let i = 0; i < 8; i++) {
      const pt = apply(world,
        i & 1 ? a.max[0] : a.min[0],
        i & 2 ? a.max[1] : a.min[1],
        i & 4 ? a.max[2] : a.min[2]);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pt[k]); hi[k] = Math.max(hi[k], pt[k]); }
    }
  }
  for (const c of n.children || []) visit(c, world);
};
const sceneNodes = g.scenes?.[g.scene ?? 0]?.nodes || nodes.map((_, i) => i);
for (const i of sceneNodes) visit(i, IDENT);

const size = hi[0] === Infinity ? null : [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
const longest = size ? size.indexOf(Math.max(...size)) : -1;
const AXIS = ['X', 'Y', 'Z'];

// --- texture weight
let texBytes = 0;
for (const img of images) {
  if (img.bufferView != null) {
    const bv = (g.bufferViews || [])[img.bufferView];
    if (bv?.byteLength) texBytes += bv.byteLength;
  }
}
const fmt = (b) => (b > 0 ? `${(b / (1024 * 1024)).toFixed(2)} MB` : '—');

console.log(`\n${path.basename(file)}`);
console.log('─'.repeat(52));
console.log(`container      glTF ${version} binary, ${mb.toFixed(2)} MB`);
console.log(`geometry       ${tris.toLocaleString()} triangles · ${prims} primitive(s) · ${meshes.length} mesh(es)`);
console.log(`scene graph    ${nodes.length} node(s) · ${materials.length} material(s)`);
console.log(`textures       ${images.length} image(s) · ${fmt(texBytes)} embedded`);
if (animations.length) console.log(`animation      ${animations.length} clip(s) (the game ignores these)`);
if (skinned) console.log(`skinning       ${skinned} skinned primitive(s) (a hull should not be rigged)`);
if (size) {
  const biggest = Math.max(...size);
  console.log(`model bounds   ${size.map((v) => v.toFixed(2)).join(' × ')} units`);
  console.log(`long axis      ${AXIS[longest]} · longest side ${biggest.toFixed(1)}u`);
  const unitHint = biggest > 5000 ? 'likely centimetres or "1 unit = 1 m" at hull scale'
    : biggest < 5 ? 'likely metres at toy scale — the game rescales, so this is fine'
      : 'units are arbitrary — the game rescales to the hull length';
  console.log(`scale note     ${unitHint}`);
}

// --- verdicts
if (mb > 40) warn.push(`${mb.toFixed(1)} MB is above the 40 MB budget — expect a long load on mobile`);
if (mb > 15) warn.push(`${mb.toFixed(1)} MB is heavy for phones; 2K textures in Meshy keep you under ~10 MB`);
if (tris > 500000) warn.push(`${Math.round(tris).toLocaleString()} triangles is a hero-asset count; 60k–150k is the sweet spot for a flyable hull`);
if (images.some((i) => /png/i.test(i.mimeType || ''))) ok.push('PNG textures found — JPEG/WebP would be smaller (Meshy: enable texture compression)');
if (!materials.length) warn.push('no materials — the hull will render flat white');
if (animations.length) ok.push('animations are ignored; the game drives thruster glow itself');
if (longest === 0) ok.push('hull is modelled along X — the importer rotates it onto Z automatically');
if (longest === 2) ok.push('hull already runs along Z — no axis fix needed');

console.log('');
for (const w of warn) console.log(`! ${w}`);
for (const o of ok) console.log(`· ${o}`);
if (!warn.some((w) => /MB|triangles|materials/.test(w))) console.log('✓ looks game-ready — drop it in public/models/ and run npm run models:scan');
console.log('');
