import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushOutOfSolids, insideSolid } from '../src/art/city.js';

test('walkers are pushed out of buildings to the edge plus body radius', () => {
  const solids = [{ x: 10, z: 0, r: 3 }];
  const p = pushOutOfSolids({ x: 9, z: 0 }, solids, 0.5);
  assert.ok(Math.abs(Math.hypot(p.x - 10, p.z) - 3.5) < 1e-9);
  assert.ok(p.x < 10, 'pushed back the way it came');
});

test('a walker exactly at a building centre still gets out', () => {
  const p = pushOutOfSolids({ x: 0, z: 0 }, [{ x: 0, z: 0, r: 2 }], 0.5);
  assert.ok(Math.hypot(p.x, p.z) >= 2.5 - 1e-9);
});

test('open ground is left alone, and insideSolid sees the margin', () => {
  const p = pushOutOfSolids({ x: 20, z: 5 }, [{ x: 0, z: 0, r: 2 }], 0.5);
  assert.deepEqual(p, { x: 20, z: 5 });
  assert.equal(insideSolid(3, 0, [{ x: 0, z: 0, r: 2 }]), false);
  assert.equal(insideSolid(3, 0, [{ x: 0, z: 0, r: 2 }], 1.5), true);
});
