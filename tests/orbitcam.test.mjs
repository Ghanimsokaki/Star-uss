/**
 * Look-around chase camera + "clicks reach the 3D view" regression tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { chaseOffset, clampLook, clampZoom, LOOK_LIMITS } from '../src/core/orbitcam.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('with no look offset the camera sits behind and above the ship', () => {
  const { pos, amount } = chaseOffset(new THREE.Vector3(), new THREE.Quaternion(), 20, 3, { yaw: 0, pitch: 0, zoom: 1 });
  assert.equal(amount, 0);
  assert.ok(pos.z < -19.9 && pos.y > 2.9, `got ${pos.toArray()}`);
});

test('a half-turn of yaw puts the camera in front of the nose', () => {
  const { pos, amount } = chaseOffset(new THREE.Vector3(), new THREE.Quaternion(), 20, 0, { yaw: Math.PI, pitch: 0, zoom: 1 });
  assert.ok(pos.z > 19.9, `got ${pos.toArray()}`);
  assert.equal(amount, 1);
});

test('the offset turns with the ship', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const { pos } = chaseOffset(new THREE.Vector3(), q, 20, 0, { yaw: 0, pitch: 0, zoom: 1 });
  // nose now points +X, so "behind" is -X
  assert.ok(pos.x < -19.9, `got ${pos.toArray()}`);
});

test('pitch and zoom are clamped, yaw wraps', () => {
  assert.equal(clampLook(0, 9)[1], LOOK_LIMITS.maxPitch);
  assert.equal(clampLook(0, -9)[1], LOOK_LIMITS.minPitch);
  assert.ok(Math.abs(clampLook(Math.PI * 2 + 0.1, 0)[0] - 0.1) < 1e-9);
  assert.equal(clampZoom(99), LOOK_LIMITS.maxZoom);
  assert.equal(clampZoom(0), LOOK_LIMITS.minZoom);
});

test('full-screen UI layers let pointer input through to the canvas', () => {
  const css = read('src/style.css');
  assert.match(css, /#ui \.screen \{ pointer-events: none; \}/);
  assert.doesNotMatch(css, /#ui \.screen,[^{]*\{ pointer-events: auto/);
});

test('the ship banks as one piece', () => {
  const sys = read('src/scenes/system.js');
  assert.match(sys, /this\.bankRig\.add\(hull\)/);
  assert.doesNotMatch(sys, /children\[0\]\.rotation\.z/, 'rolling only the first child tilts the saucer alone');
  assert.doesNotMatch(sys, /this\.hull = hull/, 'this.hull is hit points, not the model');
});

test('the galaxy map has a warp bar outside the drawers', () => {
  const gal = read('src/scenes/galaxy.js');
  assert.match(gal, /id="warp-bar"/);
  assert.match(gal, /data-wb="warp"/);
  assert.match(gal, /data-wb="launch"/);
});

test('trackpad gestures are told apart from a mouse wheel', async () => {
  const { wheelKind } = await import('../src/core/orbitcam.js');
  assert.equal(wheelKind({ ctrlKey: true, deltaY: 3, deltaX: 0, deltaMode: 0 }), 'pinch');
  assert.equal(wheelKind({ deltaY: 2, deltaX: 14, deltaMode: 0 }), 'swipe');
  assert.equal(wheelKind({ deltaY: 4.5, deltaX: 0, deltaMode: 0 }), 'swipe');
  assert.equal(wheelKind({ deltaY: 100, deltaX: 0, deltaMode: 0, wheelDeltaY: -120 }), 'wheel');
  assert.equal(wheelKind({ deltaY: 3, deltaX: 0, deltaMode: 1 }), 'wheel');
});
