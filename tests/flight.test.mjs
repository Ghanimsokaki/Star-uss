/**
 * Flight physics: W/S/Space/Shift, momentum, dampeners, collisions, autopilot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { stepFlight, massFor, collideSphere, autopilotControls, FLIGHT } from '../src/core/flight.js';

const run = (ctl, secs = 3, q = new THREE.Quaternion(), vel = new THREE.Vector3(), hull = { maxSpeed: 60, mass: 1 }) => {
  for (let t = 0; t < secs; t += 1 / 60) stepFlight(vel, q, ctl, hull, 1 / 60);
  return vel;
};

test('W accelerates forward to top speed, S reverses', () => {
  const v = run({ thrust: 1, lift: 0, cruise: 0 });
  assert.ok(Math.abs(v.z - 60) < 0.5, `forward ${v.z}`);
  const r = run({ thrust: -1, lift: 0, cruise: 0 });
  assert.ok(Math.abs(r.z + 60 * FLIGHT.reverse) < 0.5, `reverse ${r.z}`);
});

test('Space climbs and Shift descends along the hull up axis', () => {
  assert.ok(run({ thrust: 0, lift: 1, cruise: 0 }).y > 30);
  assert.ok(run({ thrust: 0, lift: -1, cruise: 0 }).y < -30);
});

test('heavy hulls take longer to reach speed', () => {
  const light = run({ thrust: 1, lift: 0 }, 0.3, undefined, undefined, { maxSpeed: 60, mass: massFor(4) });
  const heavy = run({ thrust: 1, lift: 0 }, 0.3, undefined, undefined, { maxSpeed: 60, mass: massFor(14) });
  assert.ok(light.z > heavy.z * 1.3, `${light.z} vs ${heavy.z}`);
});

test('momentum carries through a turn, then the dampeners bite', () => {
  const vel = new THREE.Vector3(0, 0, 60);                               // flying +Z
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // nose now +X
  stepFlight(vel, q, { thrust: 1, lift: 0 }, { maxSpeed: 60, mass: 1 }, 1 / 60);
  assert.ok(vel.z > 50, 'still sliding the old way right after the turn');
  run({ thrust: 1, lift: 0 }, 4, q, vel);
  assert.ok(Math.abs(vel.z) < 2 && vel.x > 55, `settled onto the new heading: ${vel.toArray()}`);
});

test('letting go with no cruise coasts down to a stop', () => {
  const v = run({ thrust: 0, lift: 0, cruise: 0 }, 4, undefined, new THREE.Vector3(0, 0, 60));
  assert.ok(v.length() < 1);
});

test('planets are solid', () => {
  const pos = new THREE.Vector3(0, 0, 9);
  const vel = new THREE.Vector3(0, 0, -40);
  const hit = collideSphere(pos, vel, new THREE.Vector3(), 10, 1);
  assert.ok(hit > 39 && pos.z >= 11 - 1e-6 && vel.z > 0);
});

test('autopilot turns toward and flies at its destination', () => {
  const q = new THREE.Quaternion();
  const right = autopilotControls(new THREE.Vector3(), q, new THREE.Vector3(), new THREE.Vector3(-100, 0, 10));
  assert.ok(right.steer.x > 0.5, 'destination to starboard (local -X) means steer.x > 0');
  const ahead = autopilotControls(new THREE.Vector3(), q, new THREE.Vector3(), new THREE.Vector3(0, 0, 400));
  assert.ok(ahead.thrust > 0.5);
});

test('keys: W/S thrust, Space/Shift lift, weapons moved off Space/Shift', () => {
  const src = fs.readFileSync(new URL('../src/core/input.js', import.meta.url), 'utf8');
  assert.match(src, /this\.keys\.has\('w'\)\) th \+= 1/);
  assert.match(src, /this\.keys\.has\(' '\)\) lift \+= 1/);
  assert.match(src, /this\.keys\.has\('shift'\)\) lift -= 1/);
  assert.doesNotMatch(src, /k === ' '\) \{ this\._press\('fire'\)/);
});
