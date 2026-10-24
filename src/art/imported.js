/**
 * Meshy / GLB model import.
 *
 * Drop a GLB into public/models/ named after the ship class id
 * (constitution.glb, vengeance.glb, ...), run `npm run models:scan`, and every
 * scene that calls buildShip() will swap the procedural hull for your model.
 *
 * The swap is asynchronous and non-destructive: the procedural hull keeps
 * rendering until the GLB is parsed, and it also supplies the hardpoint anchors
 * (phaser/torpedo muzzles, thruster positions) that combat depends on.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const MANIFEST_URL = '/models/manifest.json';
const MODEL_DIR = '/models';

/** Resolve a public path against the page base (works in node and sub-path deploys). */
function absUrl(p) {
  try {
    const base = (typeof location !== 'undefined' && location.href) ? location.href
      : (typeof document !== 'undefined' && document.baseURI) ? document.baseURI
      : 'http://localhost:5173/';
    return new URL(p, base).href;
  } catch { return p; }
}

/* ------------------------------------------------------------------ state */
let manifestPromise = null;
const cache = new Map();        // url -> Promise<{ scene, size, error }>
const overrides = new Map();    // classId -> { yawDeg, scale, yOffset }

const listeners = new Set();
/** Subscribe to "a model finished loading" events (used to refresh open views). */
export function onModelLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(classId, ok, info) {
  listeners.forEach((fn) => { try { fn(classId, ok, info); } catch { /* ignore */ } });
}

/* ---------------------------------------------------------------- manifest */
/**
 * manifest.json looks like:
 *   { "models": { "constitution": { "file": "constitution.glb", "facing": "front" } } }
 * "facing": "front" (nose toward +Z, the three.js convention) or "back".
 */
export function loadManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(absUrl(MANIFEST_URL), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { models: {} }))
    .catch(() => ({ models: {} }))
    .then((m) => (m && typeof m === 'object' ? m : { models: {} }));
  return manifestPromise;
}

export function resetManifest() {
  manifestPromise = null;
  cache.clear();
}

export async function hasModel(classId) {
  const m = await loadManifest();
  return !!(m.models && m.models[classId]);
}

export async function listModels() {
  const m = await loadManifest();
  return Object.keys(m.models || {});
}

/* ------------------------------------------------------------------ loader */
function makeLoader() {
  const loader = new GLTFLoader();
  // Meshy can export Draco/meshopt-compressed GLBs. three ships its own decoder
  // and resolves it against the bundle, so there is nothing to host by hand.
  try {
    loader.setDRACOLoader(new DRACOLoader());
  } catch { /* decoders optional */ }
  return loader;
}

/** Load + cache a GLB. Returns { scene, size, error }. */
export function loadGLB(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve) => {
    makeLoader().load(
      absUrl(url),
      (gltf) => {
        try {
          prepareMaterials(gltf.scene);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          resolve({ scene: gltf.scene, size, error: null });
        } catch (e) {
          resolve({ scene: null, size: null, error: e });
        }
      },
      undefined,
      (err) => resolve({ scene: null, size: null, error: err || new Error('load failed') }),
    );
  });
  cache.set(url, p);
  return p;
}

/** Make imported PBR materials behave like the rest of the game. */
export function prepareMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      // Meshy often exports fully metal roughness 0, which reads as chrome
      if (typeof m.metalness === 'number' && m.metalness > 0.92) m.metalness = 0.92;
      if (typeof m.roughness === 'number') m.roughness = Math.min(1, Math.max(0.16, m.roughness));
      m.envMapIntensity = m.envMapIntensity ?? 1.1;
      m.side = THREE.FrontSide;
      m.shadowSide = THREE.FrontSide;
      // tone mapping is handled by the composer's OutputPass
      m.needsUpdate = true;
    }
  });
}

/* ------------------------------------------------------------ normalisation */
/**
 * Fit an arbitrary model into the game's ship convention:
 *  - forward = +Z, up = +Y
 *  - longest dimension scaled to `targetLength`
 *  - centred on the origin
 *
 * @returns {{ root: THREE.Group, length: number }}
 */
export function normalizeModel(source, {
  targetLength = 6,
  facing = 'front',
  yawDeg = 0,
  scale = 1,
  yOffset = 0,
  autoAxis = true,
} = {}) {
  const root = new THREE.Group();
  root.add(source);

  // 1. get the hull's long axis onto Z — Meshy exports arrive modelled along
  //    X, and occasionally standing on their tail along Y.
  if (autoAxis) {
    const box = new THREE.Box3().setFromObject(source);
    const s = box.getSize(new THREE.Vector3());
    if (s.y > Math.max(s.x, s.z) * 1.15) {
      // upright: lay it down so the long side runs along Z, belly still down
      source.rotation.x = -Math.PI / 2;
    } else if (s.x > s.z * 1.02) {
      source.rotation.y = Math.PI / 2;
    }
  }
  // 2. explicit facing correction
  if (facing === 'back') source.rotation.y += Math.PI;
  if (yawDeg) source.rotation.y += THREE.MathUtils.degToRad(yawDeg);
  source.rotation.y = normalizeAngle(source.rotation.y);

  // 3. scale so the longest dimension matches the ship's in-game length
  source.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(source);
  let size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const k = (targetLength / longest) * scale;
  source.scale.multiplyScalar(k);

  // 4. centre on the origin (world-space bbox after scaling)
  source.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());
  source.position.sub(center);
  // yOffset is expressed in hull lengths, so it means the same thing at any scale
  source.position.y += yOffset * targetLength;

  root.name = 'imported-ship';
  root.userData.imported = true;
  root.userData.sourceLength = longest;
  return { root, length: targetLength };
}

function normalizeAngle(a) {
  const t = Math.PI * 2;
  let v = a % t;
  if (v > Math.PI) v -= t;
  if (v < -Math.PI) v += t;
  return v;
}

/* -------------------------------------------------------------------- swap */
/**
 * Replace the procedural geometry on a ship group with an imported model.
 * Anchors (Object3D muzzles) and userData survive, so combat keeps working.
 */
export function attachModel(shipGroup, importedRoot, targetLength) {
  if (!shipGroup || !importedRoot) return false;
  if (shipGroup.userData.importedApplied) return false;

  // park the procedural skin instead of disposing it — the player can toggle back
  const visuals = shipGroup.children.filter((c) => c.isMesh || c.isSprite || c.isPoints || c.isGroup || c.isLine);
  for (const v of visuals) v.visible = false;
  shipGroup.userData.proceduralVisuals = visuals;

  shipGroup.add(importedRoot);
  shipGroup.userData.importedApplied = true;
  shipGroup.userData.modelLength = targetLength;

  // engine glow positions: put them at the aft face of the real model
  const b = new THREE.Box3().setFromObject(importedRoot);
  const size = b.getSize(new THREE.Vector3());
  const aftZ = b.min.z + size.z * 0.04;
  const yMid = (b.min.y + b.max.y) / 2;
  const halfX = size.x * 0.16;
  shipGroup.userData.thrusters = [
    { pos: new THREE.Vector3(-halfX, yMid, aftZ) },
    { pos: new THREE.Vector3(halfX, yMid, aftZ) },
  ];
  shipGroup.userData.importedBounds = { size, min: b.min.clone(), max: b.max.clone() };
  return true;
}

/** Show the procedural skin again (used when a model fails to load). */
export function detachModel(shipGroup) {
  if (!shipGroup || !shipGroup.userData.importedApplied) return false;
  const root = shipGroup.children.find((c) => c.userData?.imported);
  if (root) shipGroup.remove(root);
  (shipGroup.userData.proceduralVisuals || []).forEach((v) => { v.visible = true; });
  shipGroup.userData.proceduralVisuals = null;
  shipGroup.userData.importedApplied = false;
  return true;
}

/* ---------------------------------------------------------- high-level API */
/**
 * Try to swap a ship group over to an imported model. Safe to call on every
 * buildShip(): it resolves to false instantly when no model is configured.
 */
export async function tryApplyModel(shipGroup, classId, cls) {
  const manifest = await loadManifest();
  const entry = manifest.models?.[classId];
  if (!entry || !shipGroup) return false;
  // the group may have been disposed while we were loading
  if (shipGroup.userData.disposed) return false;

  const url = entry.url || `${MODEL_DIR}/${entry.file || `${classId}.glb`}`;
  const { scene, error } = await loadGLB(url);
  if (error || !scene) {
    console.warn(`[models] ${classId}: ${error?.message || 'empty scene'} — keeping procedural hull`);
    emit(classId, false, error);
    return false;
  }
  if (shipGroup.userData.disposed || shipGroup.userData.importedApplied) return false;

  const o = overrides.get(classId) || {};
  const targetLength = shipGroup.userData.length || 6;
  // Mesh sources are clones so the same GLB can appear many times at once
  const clone = cloneModel(scene);
  const { root } = normalizeModel(clone, {
    targetLength,
    facing: o.facing || entry.facing || 'front',
    yawDeg: (entry.yawDeg || 0) + (o.yawDeg || 0),
    scale: (entry.scale || 1) * (o.scale || 1),
    yOffset: o.yOffset ?? entry.yOffset ?? 0,
  });
  const ok = attachModel(shipGroup, root, targetLength);
  if (ok) emit(classId, true, { url });
  return ok;
}

/** Clone a loaded GLB scene. Meshy ships are not skinned, so a deep clone is enough. */
export function cloneModel(scene) {
  const c = scene.clone(true);
  c.traverse((o) => {
    if (o.isMesh) {
      // share geometry (memory) but keep materials independent so tweaks are local
      if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
      else if (o.material) o.material = o.material.clone();
    }
  });
  return c;
}

/* --------------------------------------------------------------- overrides */
export function setOverride(classId, patch) {
  overrides.set(classId, { ...(overrides.get(classId) || {}), ...patch });
  return overrides.get(classId);
}
export function getOverride(classId) {
  return overrides.get(classId) || {};
}
export function clearOverride(classId) {
  overrides.delete(classId);
}
