/** On-foot physics: jumps scale with gravity, landings, slopes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVertical, jumpHeight, airTime, slopeLimited } from '../src/core/walker.js';

const simulateJump = (g) => {
  const body = { y: 0, vy: 0, grounded: true };
  let peak = 0, t = 0;
  stepVertical(body, 0, g, true, 1 / 120);
  while (!body.grounded && t < 30) { stepVertical(body, 0, g, false, 1 / 120); peak = Math.max(peak, body.y); t += 1 / 120; }
  return { peak, t };
};

test('same legs, different worlds: lower gravity, higher jump', () => {
  const earth = simulateJump(1), luna = simulateJump(0.17);
  assert.ok(Math.abs(earth.peak - jumpHeight(1)) < 0.05, `earth ${earth.peak}`);
  assert.ok(luna.peak > earth.peak * 5, `luna ${luna.peak} vs ${earth.peak}`);
  assert.ok(Math.abs(luna.t - airTime(0.17)) < 0.1);
});

test('walking follows the ground; walking off a ledge falls', () => {
  const body = { y: 0, vy: 0, grounded: true };
  stepVertical(body, 0.2, 1, false, 1 / 60);
  assert.equal(body.y, 0.2);
  stepVertical(body, -3, 1, false, 1 / 60);
  assert.equal(body.grounded, false, 'a 3 m drop is a fall, not a step');
  let landed = null;
  for (let i = 0; i < 200 && !landed; i++) { const r = stepVertical(body, -3, 1, false, 1 / 60); if (r.landed) landed = r; }
  assert.ok(landed && landed.impact > 5);
});

test('slopes too steep to climb stop you; in the air they do not', () => {
  const cliff = (x) => (x > 0.5 ? 10 : 0);
  assert.deepEqual(slopeLimited(0, 0, 1, 0, cliff, true), [0, 0]);
  assert.deepEqual(slopeLimited(0, 0, 1, 0, () => 0, true), [1, 0]);
  assert.deepEqual(slopeLimited(0, 0, 1, 0, cliff, false), [1, 0]);
});
