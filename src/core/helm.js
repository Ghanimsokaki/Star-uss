/**
 * Helm maths — the single place where a steering value becomes hull rotation.
 *
 * Convention (used by every input source in the game):
 *   steer.x = +1  →  turn to STARBOARD — the player's right. The D key, a
 *                    cursor moving right, a rightward thumb drag and a
 *                    rightward gamepad stick all mean this.
 *   steer.y = +1  →  lift the nose.
 *
 * Every hull in this game is modelled nose along local +Z, up along local +Y.
 * In that frame the starboard side is local −X, so a POSITIVE rotation about
 * local +Y swings the nose toward local +X, i.e. to PORT. Turning to starboard
 * therefore needs a negative yaw angle. Getting that sign backwards is exactly
 * what makes A and D feel swapped, so it lives here, once, with a test.
 */
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const _yaw = new THREE.Quaternion();
const _pitch = new THREE.Quaternion();

export const YAW_RATE = 0.9;      // fraction of `turn` applied per second
export const PITCH_RATE = 0.68;   // pitch is deliberately a little slower
export const BANK = 0.45;         // max visual roll, in radians

/**
 * Rotate a hull quaternion by one frame of steering.
 *
 * @param {THREE.Quaternion} q      hull orientation, rotated in place
 * @param {{x:number,y:number}} steer steering input, +1 = starboard / nose up
 * @param {{turn:number, dt:number, invertY?:boolean}} opts
 * @returns {THREE.Quaternion} the same quaternion, normalised
 */
export function applyHelm(q, steer, { turn, dt, invertY = false }) {
  const sx = Number.isFinite(steer?.x) ? steer.x : 0;
  const sy = Number.isFinite(steer?.y) ? steer.y : 0;
  // starboard is a negative yaw about local +Y — see the note above
  _yaw.setFromAxisAngle(UP, -sx * turn * YAW_RATE * dt);
  // default: W lifts the nose. invertY flips the pitch axis only, never yaw.
  const pitchSign = invertY ? 1 : -1;
  _pitch.setFromAxisAngle(RIGHT, pitchSign * sy * turn * PITCH_RATE * dt);
  q.multiply(_yaw).multiply(_pitch);
  q.normalize();
  return q;
}

/**
 * Visual bank for the hull model, in radians about its own nose axis.
 * Positive roll lifts the port side, which leans the ship INTO a starboard turn.
 */
export function bankFor(steerX) {
  const sx = Number.isFinite(steerX) ? steerX : 0;
  return sx * BANK;
}

/**
 * Aim assist: nudge a locked target toward the reticle.
 *
 * Works in hull-local space, where the target's `x` is negative when it sits
 * off the starboard bow. Returns the correction to add to steer.x/y.
 */
export function assistFor(localDir, { strength = 1, xGain = 1.6, yGain = 1.6, xMax = 0.42, yMax = 0.34 } = {}) {
  if (!localDir) return { x: 0, y: 0 };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // local x > 0 is to port, so starboard correction is negative
  return {
    x: -clamp(localDir.x * xGain, -1, 1) * xMax * strength,
    y: clamp(localDir.y * yGain, -1, 1) * yMax * strength,
  };
}

/* ------------------------------------------------------------ flight helm */
export const MAX_PITCH = 1.3;      // ~75°: the nose can point steeply, but never flips over the top
export const LEVEL_RATE = 1.1;     // per second: how quickly the nose eases back to level when let go

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fwd = new THREE.Vector3();

/** Heading (yaw) and climb angle (pitch) of a hull's nose. */
export function headingOf(q) {
  _fwd.set(0, 0, 1).applyQuaternion(q);
  return {
    yaw: Math.atan2(_fwd.x, _fwd.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, _fwd.y))),
  };
}

/**
 * Plane-style steering. The ship turns about the world's up axis and tips its
 * nose up and down, but never rolls (the bank you see is purely visual) and
 * never pitches past MAX_PITCH, so it can't loop over and fly upside down.
 * With no pitch input the nose eases back to level on its own — let go of
 * the stick and the ship flies straight.
 *
 * @param {THREE.Quaternion} q   hull orientation, rewritten in place
 * @param {{x:number,y:number}} steer  +x = starboard, +y = nose up
 * @param {{turn:number, dt:number, invertY?:boolean, level?:number}} opts
 *        level: 0..1 how strongly to self-level (0 = off, e.g. autopilot)
 */
export function flyHelm(q, steer, { turn, dt, invertY = false, level = 1 }) {
  const sx = Number.isFinite(steer?.x) ? steer.x : 0;
  let sy = Number.isFinite(steer?.y) ? steer.y : 0;
  if (invertY) sy = -sy;
  let { yaw, pitch } = headingOf(q);
  // starboard is a negative yaw (same convention as applyHelm)
  yaw -= sx * turn * YAW_RATE * dt;
  pitch += sy * turn * PITCH_RATE * dt;
  if (Math.abs(sy) < 0.05 && level > 0) pitch -= pitch * Math.min(1, LEVEL_RATE * level * dt);
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
  _euler.set(-pitch, yaw, 0, 'YXZ');
  q.setFromEuler(_euler);
  return q;
}
