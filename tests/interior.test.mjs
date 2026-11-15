/**
 * Ship damage + below decks: located system damage, crew and hands-on repair,
 * and the walkable deck plan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHit, repairTick, effects, freshDamage, normalizeDamage, worstSystem, BROKEN, HAND_RATE, CREW_RATE, SYSTEM_IDS } from '../src/core/damage.js';
import { walkable, roomAt, LAYOUT } from '../src/scenes/interior.js';

test('big hull hits break a system; tiny ones rarely do', () => {
  const d = freshDamage();
  const hit = applyHit(d, 500, 2000, () => 0.01);
  assert.ok(hit && d[hit.system] < 1);
  const d2 = freshDamage();
  assert.equal(applyHit(d2, 1, 2000, () => 0.5), null);
});

test('broken systems weaken the ship', () => {
  const d = freshDamage();
  d.weapons = 0; d.engines = 0.5; d.shields = 0.1; d.sensors = 0.1; d.warp = 0.1;
  const e = effects(d);
  assert.equal(e.fireRate, 0.4);
  assert.ok(e.speed > 0.4 && e.speed < 1);
  assert.equal(e.regen, 0);
  assert.equal(e.sensors, false);
  assert.equal(e.warp, false);
  const ok = effects(freshDamage());
  assert.deepEqual([ok.fireRate, ok.speed, ok.regen, ok.sensors, ok.warp], [1, 1, 1, true, true]);
});

test('fixing by hand is much faster than waiting for the crew', () => {
  assert.ok(HAND_RATE > CREW_RATE * 5);
  const a = freshDamage(); a.warp = 0.2;
  const b = freshDamage(); b.warp = 0.2;
  repairTick(a, 3);
  repairTick(b, 3, { handSystem: 'warp' });
  assert.ok(b.warp > a.warp + 0.4);
});

test('crew works the worst job; the captain frees them for the next one', () => {
  const d = freshDamage(); d.warp = 0.1; d.weapons = 0.5;
  assert.equal(worstSystem(d), 'warp');
  assert.equal(repairTick(d, 0.1).crewJob, 'warp');
  assert.equal(repairTick(d, 0.1, { handSystem: 'warp' }).crewJob, 'weapons');
});

test('a system coming back is announced', () => {
  const d = freshDamage(); d.sensors = BROKEN - 0.01;
  const { fixed } = repairTick(d, 1, { handSystem: 'sensors' });
  assert.ok(fixed.includes('sensors:online'));
});

test('stored damage is sanitised', () => {
  const d = normalizeDamage({ warp: -5, weapons: 'x', shields: 9 });
  assert.equal(d.warp, 0); assert.equal(d.weapons, 1); assert.equal(d.shields, 1);
  assert.deepEqual(Object.keys(d).sort(), [...SYSTEM_IDS].sort());
});

test('deck plan: corridor and rooms walkable, walls solid, doors open', () => {
  assert.ok(walkable(0, 0), 'corridor');
  assert.ok(walkable(0, 23), 'bridge');
  assert.ok(walkable(0, -26 + 2.5), 'engineering');
  assert.ok(!walkable(4, 5), 'between rooms is solid');
  assert.ok(!walkable(1.5, 5), 'corridor wall with no door');
  assert.ok(walkable(1.5, 12), 'sensors doorway');
  assert.ok(walkable(-1.5, 0), 'shields doorway');
  assert.equal(roomAt(4, 12).id, 'sensors');
  assert.equal(roomAt(0, 0), LAYOUT.corridor);
});
