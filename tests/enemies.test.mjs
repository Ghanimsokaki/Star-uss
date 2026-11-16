import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { ENEMIES, makeEnemy, fleetForSystem } = await import('../src/data/enemies.js');
const { MISSIONS, killsOf } = await import('../src/data/missions.js');
const { Game } = await import('../src/game.js');

const rng = (seed = 1) => { let s = seed; const next = () => ((s = (s * 16807) % 2147483647) / 2147483647); return { next, chance: (p) => next() < p, pick: (a) => a[Math.floor(next() * a.length)] }; };

test('every enemy has complete stats', () => {
  assert.ok(Object.keys(ENEMIES).length >= 13);
  for (const e of Object.values(ENEMIES)) {
    for (const k of ['hp', 'shield', 'dmg', 'fireRate', 'speed', 'turn']) assert.ok(e[k] > 0, `${e.id}.${k}`);
    assert.ok(e.colors?.hull && e.colors?.glow && e.lore, e.id);
    const m = makeEnemy(e.id, 5, true);
    assert.ok(m.maxHp > e.hp && m.label.startsWith('Elite'));
  }
});

test('every enemy (except the boss) turns up somewhere, and fleets only hold known ships', () => {
  const seen = new Set();
  for (const faction of ['federation', 'neutral', 'klingon', 'romulan', 'cardassian', 'borg', 'void']) {
    for (let threat = 1; threat <= 8; threat++) {
      for (let i = 0; i < 25; i++) for (const e of fleetForSystem({ faction, threat }, rng(i + threat * 100))) { assert.ok(ENEMIES[e.kind], e.kind); seen.add(e.kind); }
    }
  }
  for (const id of Object.keys(ENEMIES)) assert.ok(seen.has(id), `${id} never spawns`);
});

test('weak space stays weak: no Hirogen or cruisers at threat 1', () => {
  for (let i = 0; i < 60; i++) {
    for (const e of fleetForSystem({ faction: 'federation', threat: 1 }, rng(i + 1))) assert.ok(['raider', 'orion'].includes(e.kind), e.kind);
  }
});

test('kills are counted by kind and elite, and missions see them', () => {
  const g = new Game();
  g.recordKill(makeEnemy('orion', 1));
  g.recordKill(makeEnemy('orion', 1, true));
  g.recordKill(makeEnemy('vorcha', 3));
  assert.equal(killsOf(g.state, 'orion'), 2);
  assert.equal(killsOf(g.state, 'orion', 'vorcha'), 3);
  assert.equal(g.state.stats.elites, 1);
  const pirates = MISSIONS.find((m) => m.id === 'm-pirates');
  assert.deepEqual(pirates.progress(g.state), [2, 3]);
  g.recordKill(makeEnemy('orion', 1));
  assert.equal(pirates.check(g.state), true);
});
