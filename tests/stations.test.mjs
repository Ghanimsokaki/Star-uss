import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const S = await import('../src/data/stations.js');
const { Game } = await import('../src/game.js');
const { MISSIONS, CONTRACTS } = await import('../src/data/missions.js');

const rich = () => ({ credits: 1e6, visited: ['sol', 'vulcan'], stations: {} });

test('slots: 12 of them, with sensible places', () => {
  assert.equal(S.SLOTS.length, S.SLOT_COUNT);
  assert.equal(S.SLOTS.filter((s) => s.ring === 'inner').length, 6);
  assert.equal(S.SLOTS.filter((s) => s.ring === 'outer').length, 4);
  assert.ok(S.moduleFits('turret', 8) && !S.moduleFits('turret', 0), 'turrets go on pylons, not the inner ring');
  assert.ok(S.moduleFits('habitat', 0) && S.moduleFits('habitat', 9));
  for (const id of S.MODULE_ORDER) assert.ok(S.MODULES[id].cost > 0 && S.MODULES[id].desc, id);
});

test('founding a station: costs credits, needs a visit, one per system', () => {
  const st = rich();
  assert.equal(S.foundStation(st, 'romulus').ok, false, 'not visited');
  assert.ok(S.foundStation(st, 'sol').ok);
  assert.equal(st.credits, 1e6 - S.STATION_COST);
  assert.equal(S.foundStation(st, 'sol').ok, false, 'already one here');
  const poor = { credits: 10, visited: ['sol'], stations: {} };
  assert.match(S.foundStation(poor, 'sol').why, /Needs/);
});

test('building and removing modules', () => {
  const st = rich();
  S.foundStation(st, 'sol');
  const before = st.credits;
  assert.ok(S.buildModule(st, 'sol', 0, 'habitat').ok);
  assert.equal(st.credits, before - S.MODULES.habitat.cost);
  assert.equal(S.buildModule(st, 'sol', 0, 'solar').ok, false, 'slot taken');
  assert.equal(S.buildModule(st, 'sol', 1, 'turret').ok, false, 'turret does not fit the ring');
  assert.ok(S.buildModule(st, 'sol', 8, 'turret').ok);
  assert.equal(S.buildModule(st, 'vulcan', 0, 'habitat').ok, false, 'no station there');
  const r = S.removeModule(st, 'sol', 0);
  assert.ok(r.ok && r.refund === S.MODULES.habitat.cost / 2);
  assert.equal(S.removeModule(st, 'sol', 0).ok, false);
});

test('stations earn: credits, research and dilithium per second', () => {
  const st = rich();
  S.foundStation(st, 'sol');
  S.buildModule(st, 'sol', 0, 'habitat');
  S.buildModule(st, 'sol', 1, 'refinery');
  S.buildModule(st, 'sol', 2, 'lab');
  const inc = S.stationIncome(st);
  assert.equal(inc.credits, S.MODULES.habitat.rate.credits);
  assert.equal(inc.dilithium, S.MODULES.refinery.rate.dilithium);
  assert.equal(inc.research, S.MODULES.lab.rate.research);
});

test('the game adds station income, and missions see stations and escorts', () => {
  const g = new Game();
  g.state.credits = 1e6;
  const base = g.income().credits;
  assert.ok(g.foundStation('sol').ok);
  assert.ok(g.buildStationModule('sol', 0, 'habitat').ok);
  assert.ok(g.income().credits > base);
  const d0 = g.state.dilithium;
  g.buildStationModule('sol', 1, 'refinery');
  g.tick(100);
  assert.ok(g.state.dilithium > d0);
  g.buildStationModule('sol', 2, 'solar');
  assert.ok(MISSIONS.find((m) => m.id === 'm-station').check(g.state));
  g.recordEscort({ credits: 100, dilithium: 1, xp: 5 });
  assert.equal(g.state.stats.escorts, 1);
  assert.ok(MISSIONS.find((m) => m.id === 'm-convoy').check(g.state));
  assert.deepEqual(CONTRACTS.find((c) => c.id === 'c-station-net').progress(g.state), [1, 3]);
});
