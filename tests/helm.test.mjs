/**
 * Helm direction tests.
 *
 * These exist because A and D were swapped in the live game: a positive steer
 * value was turned into a positive yaw about the hull's local +Y, which swings
 * the nose to port. The check below is the one that matters — where the nose
 * ends up on SCREEN, using the same chase camera the flight scene builds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyHelm, bankFor, assistFor, BANK } from '../src/core/helm.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CAM_DIST = 18;

/** The chase camera from SystemScene._handleInput, for an identity hull. */
function chase(hull) {
  const forward = V(0, 0, 1).applyQuaternion(hull.quaternion).normalize();
  const cam = new THREE.PerspectiveCamera(58, 1.7, 0.25, 250000);
  cam.position.copy(hull.position)
    .add(V(0, 1, 0).applyQuaternion(hull.quaternion).multiplyScalar(3.2))
    .add(forward.clone().multiplyScalar(-CAM_DIST));
  cam.lookAt(hull.position.clone().add(forward.clone().multiplyScalar(32)));
  cam.updateMatrixWorld(true);
  return cam;
}

const basis = (cam, axis) => V().setFromMatrixColumn(cam.matrixWorld, axis).normalize();

/** Fly one second of steering and report where the nose drifted, in screen axes. */
function steer(steerX, steerY = 0, { invertY = false, turn = 1.7 * 1.35, seconds = 0.5 } = {}) {
  const hull = new THREE.Group();
  const cam0 = chase(hull);
  const right0 = basis(cam0, 0);
  const up0 = basis(cam0, 1);
  const nose0 = V(0, 0, 1).applyQuaternion(hull.quaternion);
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    applyHelm(hull.quaternion, { x: steerX, y: steerY }, { turn, dt, invertY });
  }
  const nose1 = V(0, 0, 1).applyQuaternion(hull.quaternion);
  const delta = nose1.clone().sub(nose0);
  return { lateral: delta.dot(right0), vertical: delta.dot(up0), hull };
}

test('D / cursor-right / stick-right turn the ship to starboard (screen right)', () => {
  // +1 is what every input source produces for "right"
  for (const label of ['keyboard', 'cursor', 'thumb stick']) {
    const { lateral } = steer(+1);
    assert.ok(lateral > 0.1, `${label}: nose should drift right, got ${lateral.toFixed(3)}`);
  }
});

test('A / cursor-left / stick-left turn the ship to port (screen left)', () => {
  const { lateral } = steer(-1);
  assert.ok(lateral < -0.1, `nose should drift left, got ${lateral.toFixed(3)}`);
});

test('A and D are mirror images, not the same direction', () => {
  const d = steer(+1).lateral;
  const a = steer(-1).lateral;
  assert.ok(d > 0 && a < 0, 'A and D must steer opposite ways');
  assert.ok(Math.abs(d + a) < 1e-6, 'A and D should be symmetric');
});

test('W lifts the nose, S drops it, and invertY swaps them', () => {
  const w = steer(0, +1).vertical;
  const s = steer(0, -1).vertical;
  assert.ok(w > 0.05, `W should raise the nose, got ${w.toFixed(3)}`);
  assert.ok(s < -0.05, `S should lower the nose, got ${s.toFixed(3)}`);
  const wInv = steer(0, +1, { invertY: true }).vertical;
  assert.ok(wInv < 0, 'invertY should flip the pitch axis');
});

test('invertY never touches the yaw axis', () => {
  const normal = steer(+1, 0).lateral;
  const inverted = steer(+1, 0, { invertY: true }).lateral;
  assert.ok(Math.abs(normal - inverted) < 1e-9, 'yaw must be identical with invertY on');
});

test('the hull stays a unit quaternion after a long turn', () => {
  const { hull } = steer(+1, +0.3, { seconds: 30 });
  assert.ok(Math.abs(hull.quaternion.length() - 1) < 1e-6);
});

test('the model banks into the turn, never against it', () => {
  // positive roll about the nose axis lifts the port side = leans starboard
  assert.ok(bankFor(+1) > 0, 'starboard turn banks starboard');
  assert.ok(bankFor(-1) < 0, 'port turn banks port');
  assert.equal(bankFor(0), 0);
  assert.equal(BANK, Math.abs(bankFor(1)));

  const hull = new THREE.Group();
  hull.rotation.z = bankFor(+1);
  const up = V(0, 1, 0).applyQuaternion(hull.quaternion);
  assert.ok(up.x < 0, 'banking starboard tilts the hull up-vector toward -X (starboard)');
});

test('aim assist pulls toward a target on either bow', () => {
  // hull-local x < 0 means the target is off the starboard bow
  const starboard = assistFor(V(-0.5, 0, 1).normalize());
  assert.ok(starboard.x > 0, 'a target to starboard needs a positive (starboard) correction');

  const port = assistFor(V(+0.5, 0, 1).normalize());
  assert.ok(port.x < 0, 'a target to port needs a negative (port) correction');

  const above = assistFor(V(0, 0.5, 1).normalize());
  assert.ok(above.y > 0, 'a target above needs the nose lifted');

  assert.deepEqual(assistFor(null), { x: 0, y: 0 });
});

test('aim assist actually closes the angle to the target', () => {
  const hull = new THREE.Group();
  // target 20° off the starboard bow, in world space
  const target = V(-Math.sin(0.35), 0, Math.cos(0.35)).multiplyScalar(60);
  const before = angleTo(hull, target);
  const dt = 1 / 60;
  for (let i = 0; i < 90; i++) {
    const local = target.clone()
      .sub(hull.position)
      .applyQuaternion(hull.quaternion.clone().invert())
      .normalize();
    const a = assistFor(local);
    applyHelm(hull.quaternion, { x: a.x, y: a.y }, { turn: 2.3, dt });
  }
  const after = angleTo(hull, target);
  assert.ok(after < before - 0.05, `assist should reduce the angle (${before.toFixed(3)} -> ${after.toFixed(3)})`);
});

function angleTo(hull, target) {
  const nose = V(0, 0, 1).applyQuaternion(hull.quaternion);
  const toT = target.clone().sub(hull.position).normalize();
  return Math.acos(Math.min(1, Math.max(-1, nose.dot(toT))));
}
