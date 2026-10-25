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
