/**
 * The hull viewer's measurements, checked against the models that actually ship.
 *
 * A viewer that reports "long axis Z ✓" for a hull the game will then fly
 * sideways is worse than no viewer, so these tests parse the real GLBs and run
 * the same analyseModel() the viewer displays.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { analyseModel } from '../src/art/meshstats.js';

// GLTFLoader expects a browser-ish global for its texture blob URLs. Geometry
// parsing does not need images, so stub just enough and let texture loads fail.
globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};

const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const realWarn = console.warn;
async function parseGlb(file) {
  console.warn = () => {};                    // texture decode warnings are expected here
  try {
    const buf = fs.readFileSync(file);
    return await new Promise((res, rej) => new GLTFLoader().parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej,
    ));
  } finally {
    console.warn = realWarn;
  }
}

test('analyseModel reports counts, size and axis for a synthetic hull', () => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 6), new THREE.MeshStandardMaterial());
  const a = analyseModel(box);
  assert.equal(a.meshes, 1);
  assert.equal(a.triangles, 12, 'a box is 12 triangles');
  assert.equal(a.longestAxis, 'Z');
  assert.equal(a.needsRotation, false);
  assert.equal(a.textures, 0);

  // rotate it so the long side runs along X: the viewer must notice
  box.geometry.rotateY(Math.PI / 2);
  const b = analyseModel(box);
  assert.equal(b.longestAxis, 'X');
  assert.equal(b.needsRotation, true, 'a sideways hull must be flagged');
});

test('an empty scene is reported, not crashed on', () => {
  const a = analyseModel(new THREE.Group());
  assert.equal(a.empty, true);
  assert.equal(a.triangles, 0);
  assert.equal(a.meshes, 0);
});

test('textures and materials are counted once each', () => {
  const tex = new THREE.Texture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, normalMap: tex });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  const a = analyseModel(group);
  assert.equal(a.meshes, 2);
  assert.equal(a.materials, 1, 'a shared material counts once');
  assert.equal(a.textures, 1, 'a texture used by two slots counts once');
});

test('every shipped hull is measured correctly and needs no rotation', async () => {
  const expected = {
    galaxy: { tris: 141178, axis: 'Z' },
    odyssey: { tris: 86607, axis: 'Z' },
    saber: { tris: 49662, axis: 'Z' },
  };
  for (const [id, want] of Object.entries(expected)) {
    const gltf = await parseGlb(path.join(root, 'public', 'models', `${id}.glb`));
    const a = analyseModel(gltf.scene);
    assert.equal(a.triangles, want.tris, `${id}: triangle count changed`);
    assert.equal(a.longestAxis, want.axis, `${id}: long axis is ${a.longestAxis}, the game expects Z`);
    assert.equal(a.needsRotation, false, `${id}: the game should not have to rotate this hull`);
    assert.ok(a.size.z > a.size.x && a.size.z > a.size.y, `${id}: Z must be the longest side`);
    assert.ok(!a.empty);
  }
});

test('the viewer renders what analyseModel measured (no second copy of the maths)', () => {
  const js = fs.readFileSync(path.join(root, 'src', 'viewer.js'), 'utf8');
  assert.match(js, /analyseModel\(obj\)/, 'the viewer must use the shared measurement');
  assert.doesNotMatch(js, /let tris = 0;/, 'and must not keep a private copy of the triangle loop');
});
