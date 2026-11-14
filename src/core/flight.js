/**
 * Flight physics — Newtonian-ish, tuned to feel good rather than to be NASA.
 *
 * The ship has a velocity of its own. Engines push it toward a target speed
 * along the hull's axes, limited by how hard the hull can accelerate (heavier
 * hulls are slower to answer). Inertial dampeners bleed off sideways slip, but
 * not instantly, so a hard turn at speed carries you wide before you bite —
 * that drift is what makes flying feel physical.
 *
 *   W / S       forward / reverse thrust
 *   Space/Shift climb / descend (dorsal and ventral thrusters)
 *   cruise      a held forward speed (Z/C, the touch rail), 0..1
 *
 * Pure maths on plain vectors: unit-tested in tests/flight.test.mjs.
 */
import * as THREE from 'three';

export const FLIGHT = {
  reverse: 0.55,       // reverse thrust, as a fraction of top speed
  vertical: 0.6,       // climb / descend thrusters
  accel: 1.5,          // top speeds per second for a mass-1 hull
  brakeAccel: 2.4,     // engines fight harder when slowing down
  slipDamp: 1.6,       // per second: how fast dampeners kill sideways drift
  boost: 2.0,          // top-speed multiplier while boosting
};

/** Hull mass from its length: a frigate ~0.8, a Galaxy ~1.8, a dreadnought ~2.2. */
export function massFor(length = 6) {
  return Math.min(2.2, Math.max(0.7, length / 6.5));
}

const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();

function approach(cur, goal, maxStep) {
  const d = goal - cur;
  if (Math.abs(d) <= maxStep) return goal;
  return cur + Math.sign(d) * maxStep;
}

/**
 * Advance the ship's velocity by one frame.
 *
 * @param {THREE.Vector3} vel   world velocity, updated in place
 * @param {THREE.Quaternion} q  hull orientation (nose +Z, up +Y)
 * @param {{thrust:number, lift:number, cruise:number, boost?:boolean, brake?:boolean}} ctl
 * @param {{maxSpeed:number, mass?:number}} hull
 * @param {number} dt
 * @returns {THREE.Vector3} vel
 */
export function stepFlight(vel, q, ctl, hull, dt) {
  const max = hull.maxSpeed * (ctl.boost ? FLIGHT.boost : 1);
  const mass = hull.mass || 1;
  _inv.copy(q).invert();
  _local.copy(vel).applyQuaternion(_inv);

  // what the pilot is asking for, in hull space
  let goalZ;
  if (ctl.brake) goalZ = 0;
  else if (ctl.thrust > 0.05) goalZ = Math.max(ctl.cruise || 0, ctl.thrust) * max;
  else if (ctl.thrust < -0.05) goalZ = ctl.thrust * FLIGHT.reverse * max;
  else goalZ = (ctl.cruise || 0) * max;
  const goalY = (ctl.lift || 0) * FLIGHT.vertical * max;

  const accel = (hull.maxSpeed * FLIGHT.accel / mass) * (ctl.boost ? 1.6 : 1);
  const slowing = Math.abs(goalZ) < Math.abs(_local.z) || Math.sign(goalZ) !== Math.sign(_local.z);
  _local.z = approach(_local.z, goalZ, (slowing ? accel * FLIGHT.brakeAccel / 1.5 : accel) * dt);
  _local.y = approach(_local.y, goalY, accel * 0.8 * dt);
  // dampeners: sideways slip decays exponentially (this is the drift)
  _local.x *= Math.exp(-FLIGHT.slipDamp / mass * dt);
  if (!(ctl.lift)) _local.y *= Math.exp(-FLIGHT.slipDamp * 0.5 / mass * dt);

  return vel.copy(_local.applyQuaternion(q));
}

/**
 * Resolve a sphere-vs-sphere contact: push the ship out and bounce it.
 * @returns {number} impact speed along the contact normal (0 = no contact)
 */
export function collideSphere(pos, vel, center, radius, shipRadius = 2, restitution = 0.35) {
  const n = pos.clone().sub(center);
  const d = n.length();
  const minD = radius + shipRadius;
  if (d >= minD || d === 0) return 0;
  n.divideScalar(d);
  pos.copy(center).addScaledVector(n, minD);
  const vn = vel.dot(n);
  if (vn >= 0) return 0;
  vel.addScaledVector(n, -(1 + restitution) * vn);
  return -vn;
}

/**
 * Autopilot steering: which way to turn the helm to face `dest`, plus how much
 * thrust to use so the ship arrives at `standoff` and stops.
 * steer.x +1 = starboard (local -X), steer.y +1 = nose up — same as every input.
 */
export function autopilotControls(pos, q, vel, dest, standoff = 40, maxSpeed = 60) {
  const to = dest.clone().sub(pos);
  const dist = to.length();
  const local = to.clone().applyQuaternion(q.clone().invert()).normalize();
  const steerX = Math.max(-1, Math.min(1, -local.x * 2.4));
  const steerY = Math.max(-1, Math.min(1, local.y * 2.4));
  const facing = local.z;                 // 1 = dead ahead
  const remaining = dist - standoff;
  // brake distance at our current speed
  const speed = vel.length();
  const stopDist = (speed * speed) / (2 * Math.max(1, maxSpeed * FLIGHT.accel));
  let thrust = 0;
  if (remaining > stopDist + 4 && facing > 0.6) thrust = Math.min(1, remaining / 120 + 0.25);
  else if (remaining < -10) thrust = -0.5;
  return { steer: { x: steerX, y: steerY }, thrust, dist, arrived: Math.abs(remaining) < 12 && speed < maxSpeed * 0.15 };
}
