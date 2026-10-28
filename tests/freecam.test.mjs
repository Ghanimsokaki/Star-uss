/**
 * Free camera + "hide the UI" tests.
 *
 * The camera is pure maths (a sphere around a smoothed focus), so it can be
 * tested without a renderer. The part worth guarding is the contract a player
 * feels: drag right orbits one way and stays smooth, zoom stays in bounds, the
 * ship stays framed, and no input can make the position go NaN.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FreeCam, orbitPosition, clampZoom, clampPitch } from '../src/core/freecam.js';

/** A stand-in canvas that records listeners so the rig can be driven directly. */
function fakeCanvas() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    setPointerCapture: () => {},
    emit(type, event) {
      const fn = listeners.get(type);
      if (fn) fn({ stopPropagation() {}, preventDefault() {}, ...event });
    },
  };
}

function mkCam() {
  return new THREE.PerspectiveCamera(58, 1.7, 0.25, 250000);
}

test('the orbit rig places the camera at the requested distance, all round', () => {
  const focus = new THREE.Vector3(10, 20, -30);
  const d = 14;
  for (const yaw of [0, 1, 2.5, -2.5, Math.PI]) {
    for (const pitch of [-1, 0, 0.9]) {
      const p = orbitPosition(focus, d, yaw, pitch);
      assert.ok(Math.abs(p.distanceTo(focus) - d) < 1e-9, `radius drifts at yaw ${yaw}`);
    }
  }
});

test('yaw 0 sits behind the focus and up-pitch lifts the camera', () => {
  const focus = new THREE.Vector3(0, 0, 0);
  const behind = orbitPosition(focus, 10, 0, 0);
  assert.ok(behind.z > 0 && Math.abs(behind.y) < 1e-9);
  const high = orbitPosition(focus, 10, 0, 0.8);
  assert.ok(high.y > 0, 'positive pitch should raise the camera');
});

test('update() frames the ship and never produces a NaN position', () => {
  const canvas = fakeCanvas();
  const rig = new FreeCam(canvas);
  rig.setActive(true);
  const camera = mkCam();
  const ship = new THREE.Vector3(5, 2, -40);

  for (let i = 0; i < 120; i++) rig.update(1 / 60, camera, ship, 6);

  assert.ok(Number.isFinite(camera.position.x + camera.position.y + camera.position.z));
  assert.ok(camera.position.distanceTo(ship) > 6, 'camera should stay outside the hull');
  assert.ok(camera.position.distanceTo(ship) < 40, 'and within a sane envelope');
  // the smoothing should have converged on the moving focus
  const before = camera.position.clone();
  rig.update(1 / 60, camera, ship, 6);
  assert.ok(camera.position.distanceTo(before) < 0.5, 'the rig should be settled, not chasing');
});

test('it follows a moving hull instead of leaving it behind', () => {
  const rig = new FreeCam(fakeCanvas());
  rig.setActive(true);
  const camera = mkCam();
  const ship = new THREE.Vector3();
  rig.update(1 / 60, camera, ship, 6);
  // full impulse in this game is ~74 units/s — the hull must stay centred there
  const step = new THREE.Vector3(74 / 60, 0, 0);
  for (let i = 0; i < 240; i++) {
    ship.add(step);
    rig.update(1 / 60, camera, ship, 6);
  }
  const drift = rig.focus.distanceTo(ship);
  assert.ok(drift < 6, `the focus lagged ${drift.toFixed(2)}u behind a hull at full impulse`);
  assert.ok(camera.position.distanceTo(rig.focus) < 30, 'and the camera stays at orbit distance');
});

test('dragging orbits, pinch and wheel zoom, and both stay clamped', () => {
  const canvas = fakeCanvas();
  const rig = new FreeCam(canvas);
  rig.setActive(true);
  const camera = mkCam();
  const ship = new THREE.Vector3();
  rig.update(1 / 60, camera, ship, 6);

  const yaw0 = rig.yaw;
  canvas.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  canvas.emit('pointermove', { pointerId: 1, clientX: 160, clientY: 100 });
  assert.notEqual(rig.yaw, yaw0, 'a horizontal drag should orbit');

  const pitch0 = rig.pitch;
  canvas.emit('pointermove', { pointerId: 1, clientX: 160, clientY: 400 });
  assert.ok(rig.pitch > pitch0, 'dragging down should tilt the view');
  canvas.emit('pointerup', { pointerId: 1 });

  // wheel zoom, driven past both ends
  for (let i = 0; i < 40; i++) canvas.emit('wheel', { deltaY: -400 });
  assert.ok(rig.zoom <= 4.5 + 1e-9, 'zoom must stay bounded (in)');
  for (let i = 0; i < 80; i++) canvas.emit('wheel', { deltaY: 400 });
  assert.ok(rig.zoom >= 0.4 - 1e-9, 'zoom must stay bounded (out)');
  assert.ok(rig.pitch <= clampPitch(99) && rig.pitch >= clampPitch(-99));
});

test('two fingers pinch to zoom instead of orbiting', () => {
  const canvas = fakeCanvas();
  const rig = new FreeCam(canvas);
  rig.setActive(true);
  rig.update(1 / 60, mkCam(), new THREE.Vector3(), 6);

  canvas.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  canvas.emit('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
  canvas.emit('pointermove', { pointerId: 2, clientX: 200, clientY: 100 }); // seeds the spread
  const zoom0 = rig.zoom;
  const yaw0 = rig.yaw;
  canvas.emit('pointermove', { pointerId: 2, clientX: 300, clientY: 100 }); // fingers apart
  assert.ok(rig.zoom < zoom0, 'spreading fingers should pull the camera back');
  assert.equal(rig.yaw, yaw0, 'a pinch must not also orbit');
});

test('it drifts on its own when left alone, and stops while you drag', () => {
  const canvas = fakeCanvas();
  const rig = new FreeCam(canvas);
  rig.setActive(true);
  const camera = mkCam();
  const ship = new THREE.Vector3();

  const yaw0 = rig.yaw;
  for (let i = 0; i < 240; i++) rig.update(1 / 60, camera, ship, 6);   // 4 seconds idle
  assert.notEqual(rig.yaw, yaw0, 'the idle rig should orbit the hull');

  canvas.emit('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
  const held = rig.yaw;
  for (let i = 0; i < 120; i++) rig.update(1 / 60, camera, ship, 6);
  assert.equal(rig.yaw, held, 'it must hold still while a finger is down');
});

test('reset() and inactive updates are inert', () => {
  const canvas = fakeCanvas();
  const rig = new FreeCam(canvas);
  const camera = mkCam();
  camera.position.set(1, 2, 3);
  assert.equal(rig.update(1 / 60, camera, new THREE.Vector3(), 6), false);
  assert.deepEqual(camera.position.toArray(), [1, 2, 3], 'an inactive rig must not move the camera');

  rig.setActive(true);
  rig.update(1 / 60, camera, new THREE.Vector3(), 6);
  rig.yaw = 0.1; rig.pitch = 1.2; rig.zoom = 0.5;
  rig.reset();
  assert.equal(rig.zoom, 1);
  assert.ok(rig.pitch < 0.5);
});

test('input during a drag is swallowed so it cannot fire the ship', () => {
  const canvas = fakeCanvas();
  const rig = new FreeCam(canvas);
  rig.setActive(true);
  let stopped = 0;
  const ev = (extra) => ({ stopPropagation: () => { stopped++; }, preventDefault() {}, ...extra });
  canvas.listeners.get('pointerdown')(ev({ pointerId: 1, clientX: 5, clientY: 5 }));
  canvas.listeners.get('pointermove')(ev({ pointerId: 1, clientX: 25, clientY: 5 }));
  assert.ok(stopped >= 2, 'the orbit gesture must not reach the flight controls');

  // …but only while the rig is active
  rig.setActive(false);
  stopped = 0;
  canvas.listeners.get('pointerdown')(ev({ pointerId: 2, clientX: 5, clientY: 5 }));
  assert.equal(stopped, 0, 'inactive rigs must not touch input');
});

test('clamps are exported and sane', () => {
  assert.equal(clampZoom(99), 4.5);
  assert.equal(clampZoom(0), 0.4);
  assert.equal(clampZoom(1), 1);
  assert.ok(clampPitch(99) <= 1.32 && clampPitch(-99) >= -1.32);
});

test('the zoom range keeps the hull in view at both ends', () => {
  const L = 6; // in-game hull length
  const rig = new FreeCam(fakeCanvas());
  rig.setActive(true);
  rig.zoom = 0.4;
  const near = rig.distanceFor(L);
  rig.zoom = 4.5;
  const far = rig.distanceFor(L);
  assert.ok(near > L * 0.5, `closest zoom (${near.toFixed(2)}u) would clip into a ${L}u hull`);
  assert.ok(far < L * 12, `furthest zoom (${far.toFixed(2)}u) would lose the hull`);
});
