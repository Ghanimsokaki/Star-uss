/**
 * Hull viewer — a standalone page for inspecting a model before it ships.
 *
 *   /viewer.html   (npm run dev → http://localhost:5173/viewer.html)
 *
 * Drop an .fbx, .glb or .gltf and it renders with an orbit rig, reports the
 * numbers that decide whether a hull is game-ready — triangle count, texture
 * budget, bounding box, and which way the nose points — and lets you check the
 * orientation the loader expects (forward is +Z, up is +Y).
 *
 * It is deliberately separate from the game: it never touches `Game`, the save
 * file or the manifest, so you can throw half-finished meshes at it.
 */
import './viewer.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { analyseModel } from './art/meshstats.js';

const $ = (id) => document.getElementById(id);
const canvas = $('viewer-canvas');

/* --------------------------------------------------------------- renderer */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070e);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50000);
camera.position.set(3, 2, 4);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

/* ------------------------------------------------------------------ lights */
scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1018, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(6, 9, 7);
scene.add(key);
const rim = new THREE.DirectionalLight(0x59e0ff, 1.1);
rim.position.set(-7, 3, -6);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd9a0, 0.5);
fill.position.set(0, -5, 4);
scene.add(fill);

/* ------------------------------------------------------------- scene props */
const grid = new THREE.GridHelper(20, 20, 0x2a4a63, 0x16283a);
grid.position.y = 0;
scene.add(grid);
const axes = new THREE.AxesHelper(2.2);   // red +X, green +Y, blue +Z (nose)
scene.add(axes);

let model = null;
let spin = true;

/* ------------------------------------------------------------------ loaders */
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

function loadFile(file) {
  const name = file.name.toLowerCase();
  const url = URL.createObjectURL(file);
  $('file-name').textContent = file.name;
  setTip('Loading…');

  const done = (root) => {
    URL.revokeObjectURL(url);
    if (!root) return;
    document.body.classList.add('loaded');
    if (model) {
      // free the previous hull's geometry and textures, not the new one
      scene.remove(model);
      dispose(model);
    }
    model = root;
    scene.add(model);
    frame(model);
    report(model, file);
  };

  const failed = (err) => {
    URL.revokeObjectURL(url);
    document.body.classList.remove('loaded');
    console.error(err);
    setTip(`That file did not load: ${err?.message || err}. FBX textures must sit next to the .fbx (a .fbm folder) to appear.`);
  };

  if (name.endsWith('.fbx')) {
    fbxLoader.load(url, (obj) => done(obj), undefined, failed);
  } else if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    gltfLoader.load(url, (gltf) => done(gltf.scene), undefined, failed);
  } else {
    URL.revokeObjectURL(url);
    setTip('Pick an .fbx, .glb or .gltf file.');
  }
}

/** Point the camera at a box that contains the model, whatever scale it is. */
function frame(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.75 || 1;

  grid.scale.setScalar(Math.max(0.001, radius / 5));
  axes.scale.setScalar(Math.max(0.001, radius / 2));
  controls.target.copy(centre);
  camera.position.copy(centre).add(new THREE.Vector3(radius * 1.5, radius * 0.9, radius * 1.9));
  camera.near = Math.max(0.001, radius / 500);
  camera.far = radius * 900;
  camera.updateProjectionMatrix();
  controls.update();
}

/** Numbers that decide whether a hull is game-ready. */
function report(obj, file) {
  const { triangles: tris, meshes, textures, skinned, size, longestAxis } = analyseModel(obj);
  const nose = longestAxis === 'Z' ? 'Z ✓ (as the game expects)' : `${longestAxis} — the game will rotate it`;

  const mb = (file.size / 1048576).toFixed(2);
  const budget = tris > 200000 ? 'red' : tris > 120000 ? 'amber' : 'green';

  $('stats').innerHTML = `
    <span class="st ${budget}"><b>${tris.toLocaleString()}</b> tris</span>
    <span class="st"><b>${meshes}</b> mesh${meshes === 1 ? '' : 'es'}</span>
    <span class="st ${textures ? 'green' : 'amber'}"><b>${textures}</b> tex</span>
    <span class="st"><b>${mb}</b> MB</span>
    <span class="st"><b>${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}</b></span>
    <span class="st">long axis <b>${nose}</b></span>
    ${skinned ? '<span class="st amber"><b>skinned</b> — the game will not animate it</span>' : ''}
  `;

  const notes = [];
  if (tris > 120000) notes.push(`${tris.toLocaleString()} triangles is heavy — the converter simplifies to ~50k`);
  if (!textures) notes.push('no textures found — the hull will load but render as flat grey');
  if (skinned) notes.push('rigged meshes load as static geometry');
  setTip(notes.length ? notes.join(' · ') : 'Looks game-ready. Name the file <classId>.fbx and run npm run models:convert.');
}

function setTip(text) {
  $('tip').innerHTML = text;
}

function dispose(obj) {
  obj.traverse?.((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
      m.dispose?.();
    });
  });
}

/* ------------------------------------------------------------------- input */
const drop = $('drop');
$('file').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) loadFile(f);
});
['dragenter', 'dragover'].forEach((t) => window.addEventListener(t, (e) => {
  e.preventDefault();
  drop.classList.add('hot');
}));
['dragleave', 'drop'].forEach((t) => window.addEventListener(t, (e) => {
  e.preventDefault();
  if (t === 'dragleave' && e.relatedTarget) return;
  drop.classList.remove('hot');
}));
window.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
$('btn-open').addEventListener('click', () => $('file').click());

function toggleWire() {
  if (!model) return;
  let on = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (on === null) on = !(o.material?.wireframe);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { if (m) { m.wireframe = on; m.needsUpdate = true; } });
  });
  $('btn-wire').classList.toggle('on', !!on);
}
$('btn-wire').addEventListener('click', toggleWire);

$('btn-grid').addEventListener('click', (e) => {
  const on = !grid.visible;
  grid.visible = on;
  axes.visible = on;
  e.currentTarget.classList.toggle('on', on);
});

$('btn-spin').addEventListener('click', (e) => {
  spin = !spin;
  controls.autoRotate = spin;
  e.currentTarget.classList.toggle('on', spin);
});

$('btn-front').addEventListener('click', () => {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.y, size.z) * 2;
  controls.target.copy(centre);
  camera.position.set(centre.x, centre.y + size.y * 0.12, centre.z + d);
  controls.update();
  setTip('Looking down the <b>+Z</b> axis — the nose should point at you. In-game forward is +Z.');
});

window.addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'w') toggleWire();
  if (k === 'g') $('btn-grid').click();
  if (k === 's') $('btn-spin').click();
  if (k === 'n' || k === 'f') $('btn-front').click();
});

/* -------------------------------------------------------------------- loop */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.update(dt);
  // keep the key light orbiting so a matte hull still reads as 3D
  key.position.setFromSpherical(new THREE.Spherical(12, 1.05, now / 4200));
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

/* A ?model=/models/sovereign.glb query string loads a file straight away, which
   makes it easy to send someone a link to a specific hull. */
const wanted = new URLSearchParams(location.search).get('model');
if (wanted) {
  fetch(wanted)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status} ${wanted}`))))
    .then((blob) => {
      const name = wanted.split('/').pop() || 'model.glb';
      loadFile(new File([blob], name));
    })
    .catch((e) => setTip(`Could not fetch ${wanted}: ${e.message}`));
}
