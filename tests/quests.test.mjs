/**
 * Quest tests: the story chain and the parallel contracts board.
 *
 * Missions are checked in order and contracts all at once, and both pay out
 * exactly once — a save that reloads must not be paid twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { MISSIONS, CONTRACTS } = await import('../src/data/missions.js');
const { Game } = await import('../src/game.js');
const { buildGalaxy, PLANET_TYPES } = await import('../src/data/galaxy.js');

test('every mission and contract has a unique id, a check and a reward', () => {
  const ids = [...MISSIONS, ...CONTRACTS].map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate quest id');
  for (const q of [...MISSIONS, ...CONTRACTS]) {
    assert.equal(typeof q.check, 'function', `${q.id} has no check`);
    assert.ok(q.reward && Object.keys(q.reward).length, `${q.id} pays nothing`);
  }
  assert.ok(MISSIONS.length >= 20, 'story should have at least 20 missions');
  assert.ok(CONTRACTS.length >= 15, 'board should have at least 15 contracts');
});

test('a fresh game has nothing done and sane progress', () => {
  const g = new Game();
  assert.equal(g.currentMission.id, MISSIONS[0].id);
  for (const q of [...MISSIONS, ...CONTRACTS]) {
    assert.equal(q.check(g.state, g), false, `${q.id} is already complete on a new game`);
    const p = g.progressOf(q);
    if (p) assert.ok(p[0] >= 0 && p[0] <= p[1], `${q.id} progress out of range: ${p}`);
  }
});

test('contracts pay once, in parallel with the story', () => {
  const g = new Game();
  const before = g.state.credits;
  g.state.stats.kills = 10;
  g.checkMissions();
  assert.ok(g.state.contractsDone.includes('c-bounty'));
  // story is still on its first step: kills don't skip mission 1
  assert.equal(g.currentMission.id, MISSIONS[0].id);
  const after = g.state.credits;
  assert.ok(after > before);
  g.checkMissions();
  assert.equal(g.state.credits, after, 'contract paid twice');
});

test('talking to people is counted', () => {
  const g = new Game();
  const pid = g.galaxy.byId.sol.planets.find((p) => p.type !== 'gas').id;
  g.landOn(pid);
  g.meetPerson(pid, 'a');
  g.meetPerson(pid, 'a');
  g.meetPerson(pid, 'b');
  assert.equal(g.state.stats.met, 2);
});

test('planet temperatures fit their class', () => {
  const gal = buildGalaxy('alpha');
  for (const sys of gal.systems) {
    for (const p of sys.planets) {
      const [lo, hi] = PLANET_TYPES[p.type].temp;
      assert.ok(p.temperature >= lo && p.temperature <= hi, `${p.name} (${p.type}) is ${p.temperature}°C`);
    }
  }
});

test('daily reward: claim once a day, streak grows on consecutive days and resets after a gap', () => {
  const g = new Game();
  const d1 = new Date(2026, 10, 10, 9);
  const o1 = g.claimDaily(d1);
  assert.equal(o1.streak, 1);
  assert.equal(g.claimDaily(d1), null, 'second claim the same day pays nothing');
  assert.equal(g.claimDaily(new Date(2026, 10, 11, 20)).streak, 2);
  assert.equal(g.claimDaily(new Date(2026, 10, 14, 8)).streak, 1, 'missed days reset the streak');
});

test('kill streak multiplier scales the payout', () => {
  const g = new Game();
  const enemy = { reward: { credits: 100, dilithium: 10, xp: 20 } };
  const r = g.recordKill(enemy, { mult: 2 });
  assert.deepEqual(r, { credits: 200, dilithium: 20, xp: 40 });
});

test('designing a ship: stats, price, commission and reload', async () => {
  const { DEFAULT_DESIGN, sanitizeDesign, statsForDesign, registerCustomClass } = await import('../src/data/designer.js');
  const { SHIP_CLASSES } = await import('../src/data/ships.js');
  const bad = sanitizeDesign({ name: '<script>x', saucer: 99, nacelles: 3, hullColor: 'red' });
  assert.ok(!bad.name.includes('<') && bad.saucer <= 1.9 && bad.nacelles === 2 && bad.hullColor === DEFAULT_DESIGN.hullColor);
  const fast = statsForDesign({ ...DEFAULT_DESIGN, nacelles: 4, nacelleLen: 3.6 });
  assert.ok(fast.speed > statsForDesign(DEFAULT_DESIGN).speed);
  const g = new Game();
  g.state.credits = 1e6;
  const res = g.commissionDesign({ ...DEFAULT_DESIGN, name: 'U.S.S. Test' });
  assert.ok(res.ok && g.state.shipId === 'custom' && SHIP_CLASSES.custom.hullName === 'U.S.S. Test');
  assert.ok(g.stats.hull > 0);
  registerCustomClass(null);
  assert.equal(SHIP_CLASSES.custom, undefined);
});
