/**
 * Surface generation tests.
 *
 * A planet must look the same every time you set down on it, the landing pad
 * must actually be flat enough to put a hull on, and the props must not spawn
 * inside the ship. Those three are what make landing feel like a place rather
 * than a random field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  heightAt, noise2, fbm, hash2, mulberry, biomeFor, isLandable,
  buildTerrain, buildScatter, buildPerson, ringPoint, PAD_RADIUS, PAD_BLEND, BIOMES,
} from '../src/art/surface.js';

test('the noise is deterministic and bounded', () => {
  for (const [x, z] of [[0, 0], [1.5, -2.25], [40, 13]]) {
    assert.equal(noise2(x, z, 7), noise2(x, z, 7), 'same input, same noise');
    const n = noise2(x, z, 7);
    assert.ok(n >= 0 && n <= 1, `noise out of range: ${n}`);
    const f = fbm(x, z, 7);
    assert.ok(f >= 0 && f <= 1, `fbm out of range: ${f}`);
  }
  assert.notEqual(noise2(0.3, 0.4, 1), noise2(0.3, 0.4, 2), 'the seed changes the world');
  assert.ok(hash2(3, 4, 5) >= 0 && hash2(3, 4, 5) <= 1);
});

test('the landing pad is flat, and the ground rises away from it', () => {
  const seed = 4242;
  for (const [x, z] of [[0, 0], [4, 0], [0, -6], [-7, 5], [7, 7]]) {
    assert.ok(Math.hypot(x, z) <= PAD_RADIUS, `${x},${z} is outside the pad`);
    assert.ok(Math.abs(heightAt(x, z, seed)) < 1e-9, `pad is not flat at ${x},${z}`);
  }
  // somewhere out in the terrain there is real relief
  let relief = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    relief = Math.max(relief, Math.abs(heightAt(Math.cos(a) * 70, Math.sin(a) * 70, seed)));
  }
  assert.ok(relief > 0.5, `the world is featureless (max relief ${relief.toFixed(2)})`);
});

test('the terrain blends out of the pad instead of stepping off a cliff', () => {
  const seed = 99;
  let maxJump = 0;
  for (let d = PAD_RADIUS - 2; d < PAD_BLEND + 6; d += 0.25) {
    const a = heightAt(d, 0, seed);
    const b = heightAt(d + 0.25, 0, seed);
    maxJump = Math.max(maxJump, Math.abs(a - b));
  }
  assert.ok(maxJump < 0.6, `the pad edge steps ${maxJump.toFixed(2)}u in a quarter metre`);
});

test('a planet is reproducible from its seed', () => {
  const a = buildTerrain({ seed: 777, type: 'desert', segments: 24, size: 120 });
  const b = buildTerrain({ seed: 777, type: 'desert', segments: 24, size: 120 });
  const pa = a.geometry.attributes.position.array;
  const pb = b.geometry.attributes.position.array;
  assert.equal(pa.length, pb.length);
  for (let i = 0; i < pa.length; i += 97) assert.equal(pa[i], pb[i], 'the same seed builds the same ground');

  const c = buildTerrain({ seed: 778, type: 'desert', segments: 24, size: 120 });
  const pc = c.geometry.attributes.position.array;
  let differs = 0;
  for (let i = 0; i < pa.length; i += 97) if (pa[i] !== pc[i]) differs++;
  assert.ok(differs > 5, 'a different seed should build different ground');
});

test('the terrain carries per-vertex colour, not a flat material', () => {
  const t = buildTerrain({ seed: 3, type: 'ice', segments: 16, size: 80 });
  const colours = t.geometry.attributes.color;
  assert.ok(colours, 'vertex colours are present');
  assert.equal(colours.count, t.geometry.attributes.position.count);
  const distinct = new Set();
  for (let i = 0; i < colours.count; i += 7) {
    distinct.add(`${colours.getX(i).toFixed(3)},${colours.getY(i).toFixed(3)}`);
  }
  assert.ok(distinct.size > 3, 'the ground should not be one uniform colour');
});

test('every biome is described, and gas giants are not landable', () => {
  for (const id of ['m', 'ocean', 'desert', 'ice', 'volcanic', 'barren']) {
    const b = biomeFor(id);
    assert.ok(b, `${id} has no biome`);
    assert.equal(b.ground.length, 3, `${id} needs three ground tones`);
    assert.ok(typeof b.skyTop === 'number' && typeof b.skyBottom === 'number');
    assert.equal(isLandable(id), true);
  }
  assert.equal(isLandable('gas'), false);
  assert.equal(biomeFor('gas'), BIOMES.gas, 'gas giants still need a look from orbit');
  assert.equal(biomeFor('nonsense'), BIOMES.barren, 'unknown types fall back safely');
});

test('props spawn around the pad, never on it', () => {
  const rng = mulberry(21);
  for (let i = 0; i < 200; i++) {
    const p = ringPoint(rng, 100);
    assert.ok(Math.hypot(p.x, p.z) >= PAD_BLEND + 1.9, 'a prop spawned inside the pad');
  }
  const scatter = buildScatter({ seed: 5, type: 'm', count: 40, radius: 90, rng: mulberry(5) });
  assert.ok(scatter.children.length > 20, 'the world should have props');
  for (const child of scatter.children) {
    assert.ok(Math.hypot(child.position.x, child.position.z) > PAD_RADIUS, 'a prop landed on the pad');
    assert.ok(Number.isFinite(child.position.y), 'props sit on the ground');
  }
});

test('people are built standing on the ground, about two metres tall', () => {
  for (const role of ['crew', 'colonist', 'trader', 'surveyor', 'engineer']) {
    const p = buildPerson({ role, type: 'm', rng: mulberry(3) });
    const box = new THREE.Box3().setFromObject(p);
    const height = box.max.y - box.min.y;
    assert.ok(height > 1.2 && height < 2.4, `${role} is ${height.toFixed(2)}u tall`);
    assert.ok(box.min.y > -0.05, `${role} is sunk into the ground (min y ${box.min.y.toFixed(2)})`);
    assert.ok(p.userData.parts?.head && p.userData.parts?.torso, 'a figure needs a head and torso to animate');
  }
});

test('the seeded rng is repeatable and stays in range', () => {
  const a = mulberry(1234);
  const b = mulberry(1234);
  for (let i = 0; i < 50; i++) {
    const v = a();
    assert.equal(v, b(), 'the same seed produces the same sequence');
    assert.ok(v >= 0 && v < 1);
  }
  const c = mulberry(1235);
  assert.notEqual(c(), mulberry(1234)(), 'different seeds diverge');
});
