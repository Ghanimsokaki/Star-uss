/**
 * Your own space stations.
 *
 * Found a station in any system you have visited, then build it up one module
 * at a time on twelve docking slots: an inner ring of six round the core, two
 * spires (above and below), and four outer pylons. Every module does
 * something — earns credits, refines dilithium, runs research, repairs your
 * ship when you fly close, shields you, or shoots at hostiles.
 *
 * Pure functions on the plain save state, so the rules are unit-tested.
 */

export const STATION_COST = 6000;
export const MAX_STATIONS = 6;
export const SLOT_COUNT = 12;
export const REFUND = 0.5;

/** Where each slot sits, in station units (the 3D model reads this too). */
export const SLOTS = [
  // inner ring
  ...Array.from({ length: 6 }, (_, i) => ({ id: i, ring: 'inner', angle: (i / 6) * Math.PI * 2, r: 13, y: 0 })),
  // spires
  { id: 6, ring: 'top', angle: 0, r: 0, y: 11 },
  { id: 7, ring: 'bottom', angle: 0, r: 0, y: -11 },
  // outer pylons
  ...Array.from({ length: 4 }, (_, i) => ({ id: 8 + i, ring: 'outer', angle: (i / 4) * Math.PI * 2 + Math.PI / 4, r: 26, y: 0 })),
];

/**
 * Module types. `rate` is per second; `place` limits where a module fits
 * (spires suit antennas and shields; turrets want the outer pylons).
 */
export const MODULES = {
  habitat: { id: 'habitat', name: 'Habitat Ring', icon: '🏠', color: '#9fd8ff', cost: 2400, rate: { credits: 6 }, desc: 'Homes for 400 crew and families. Earns credits.' },
  solar: { id: 'solar', name: 'Solar Array', icon: '☀️', color: '#ffd36b', cost: 1200, rate: { credits: 2.5 }, desc: 'Cheap power from the star. A little income.' },
  refinery: { id: 'refinery', name: 'Dilithium Refinery', icon: '💎', color: '#59e0ff', cost: 4200, rate: { dilithium: 0.05 }, desc: 'Turns raw ore into dilithium for upgrades.' },
  lab: { id: 'lab', name: 'Science Lab', icon: '🔬', color: '#b47bff', cost: 3600, rate: { research: 0.5 }, desc: 'Studies the system. Earns research points.' },
  dock: { id: 'dock', name: 'Repair Dock', icon: '🔧', color: '#62f2a6', cost: 3000, rate: {}, desc: 'Fly close and your hull, shields and damaged systems are repaired.' },
  shield: { id: 'shield', name: 'Shield Generator', icon: '🛡️', color: '#59e0ff', cost: 3400, rate: {}, place: ['top', 'bottom', 'inner'], desc: 'A shield bubble round the station. Your shields recharge fast nearby.' },
  turret: { id: 'turret', name: 'Phaser Turret', icon: '🔫', color: '#ff8a5c', cost: 3800, rate: {}, place: ['outer', 'top', 'bottom'], desc: 'Fires at hostile ships that come near. More turrets, more firepower.' },
  sensor: { id: 'sensor', name: 'Sensor Spire', icon: '📡', color: '#7dffcf', cost: 2000, rate: { research: 0.15 }, place: ['top', 'bottom'], desc: 'Long-range sensors. A little research, and a beacon you can see from far away.' },
};
export const MODULE_ORDER = ['habitat', 'solar', 'refinery', 'lab', 'dock', 'shield', 'turret', 'sensor'];

export function stationsOf(state) {
  if (!state.stations || typeof state.stations !== 'object') state.stations = {};
  return state.stations;
}

export function stationAt(state, systemId) {
  return stationsOf(state)[systemId] || null;
}

export function moduleFits(type, slotId) {
  const m = MODULES[type];
  const slot = SLOTS[slotId];
  if (!m || !slot) return false;
  return !m.place || m.place.includes(slot.ring);
}

/** Found a station in a system. */
export function foundStation(state, systemId, name = '') {
  const all = stationsOf(state);
  if (all[systemId]) return { ok: false, why: 'You already have a station here' };
  if (Object.keys(all).length >= MAX_STATIONS) return { ok: false, why: `You can run ${MAX_STATIONS} stations at most` };
  if (!(state.visited || []).includes(systemId)) return { ok: false, why: 'Visit the system first' };
  if (state.credits < STATION_COST) return { ok: false, why: `Needs ₡${STATION_COST.toLocaleString()}` };
  state.credits -= STATION_COST;
  all[systemId] = { name: String(name || 'Deep Space Station').slice(0, 40), modules: {}, founded: Date.now() };
  return { ok: true };
}

/** Build a module on a free slot. */
export function buildModule(state, systemId, slotId, type) {
  const st = stationAt(state, systemId);
  const m = MODULES[type];
  if (!st) return { ok: false, why: 'No station here yet' };
  if (!m) return { ok: false, why: 'Unknown module' };
  if (!(slotId >= 0 && slotId < SLOT_COUNT)) return { ok: false, why: 'No such slot' };
  if (st.modules[slotId]) return { ok: false, why: 'That slot is taken' };
  if (!moduleFits(type, slotId)) return { ok: false, why: `${m.name} doesn't fit there` };
  if (state.credits < m.cost) return { ok: false, why: `Needs ₡${m.cost.toLocaleString()}` };
  state.credits -= m.cost;
  st.modules[slotId] = type;
  return { ok: true };
}

/** Take a module off again, for half its price back. */
export function removeModule(state, systemId, slotId) {
  const st = stationAt(state, systemId);
  const type = st?.modules?.[slotId];
  if (!type) return { ok: false, why: 'Nothing to remove' };
  delete st.modules[slotId];
  const refund = Math.round((MODULES[type]?.cost || 0) * REFUND);
  state.credits += refund;
  return { ok: true, refund };
}

/** How many of each module a station has. */
export function moduleCounts(st) {
  const c = {};
  for (const t of Object.values(st?.modules || {})) c[t] = (c[t] || 0) + 1;
  return c;
}

/** What all your stations earn per second, added together. */
export function stationIncome(state) {
  const out = { credits: 0, research: 0, dilithium: 0 };
  for (const st of Object.values(stationsOf(state))) {
    for (const t of Object.values(st.modules || {})) {
      const r = MODULES[t]?.rate || {};
      out.credits += r.credits || 0;
      out.research += r.research || 0;
      out.dilithium += r.dilithium || 0;
    }
  }
  return out;
}

export const totalModules = (state) => Object.values(stationsOf(state)).reduce((n, st) => n + Object.keys(st.modules || {}).length, 0);
