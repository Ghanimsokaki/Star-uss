/**
 * Ship damage — WHERE you got hit matters.
 *
 * Hull hits can knock out a specific system at a specific place on the ship.
 * Each system weakens something real while it is damaged. Repairs come from
 * two places: the engineering team works through the list on its own (slowly),
 * or the captain walks to the station inside the ship and fixes it by hand
 * (much faster). A drydock at Earth fixes everything.
 *
 * Integrity runs 0..1 (1 = working). Pure functions on a plain object so the
 * state can live in the save file and be unit-tested without a renderer.
 */

export const SYSTEMS = {
  weapons: { id: 'weapons', name: 'Phaser Bay', place: 'Deck 4 · forward', room: 'phasers', effect: 'Phasers fire slower' },
  shields: { id: 'shields', name: 'Shield Generator', place: 'Deck 6 · port', room: 'shields', effect: 'Shields stop recharging' },
  engines: { id: 'engines', name: 'Impulse Engines', place: 'Deck 9 · aft', room: 'engines', effect: 'Top speed reduced' },
  sensors: { id: 'sensors', name: 'Sensor Array', place: 'Deck 2 · starboard', room: 'sensors', effect: 'Scanners and targeting assist offline' },
  warp: { id: 'warp', name: 'Warp Core', place: 'Main Engineering', room: 'engineering', effect: 'Warp drive offline' },
};
export const SYSTEM_IDS = Object.keys(SYSTEMS);

export const CREW_RATE = 0.022;    // integrity per second the engineering team restores (~45 s per system)
export const HAND_RATE = 0.22;     // integrity per second when the captain repairs by hand (~5 s)
export const BROKEN = 0.35;        // below this a system is offline

export function freshDamage() {
  return Object.fromEntries(SYSTEM_IDS.map((k) => [k, 1]));
}

/** Make any stored value safe. */
export function normalizeDamage(d) {
  const out = freshDamage();
  if (d && typeof d === 'object') {
    for (const k of SYSTEM_IDS) {
      const v = Number(d[k]);
      if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

/**
 * A hull hit. Bigger hits are more likely to break something.
 * @param {object} dmg       integrity map, updated in place
 * @param {number} amount    hull damage dealt
 * @param {number} maxHull
 * @param {() => number} rng
 * @returns {null|{system:string, before:number, after:number}}
 */
export function applyHit(dmg, amount, maxHull, rng = Math.random) {
  if (!(amount > 0) || !(maxHull > 0)) return null;
  const chance = Math.min(0.75, (amount / maxHull) * 7);
  if (rng() > chance) return null;
  const system = SYSTEM_IDS[Math.floor(rng() * SYSTEM_IDS.length) % SYSTEM_IDS.length];
  const before = dmg[system];
  const after = Math.max(0, before - (0.22 + rng() * 0.28));
  dmg[system] = after;
  return { system, before, after };
}

/** The worst damaged system, or null if everything is fine. */
export function worstSystem(dmg) {
  let worst = null;
  for (const k of SYSTEM_IDS) if (dmg[k] < 0.999 && (!worst || dmg[k] < dmg[worst])) worst = k;
  return worst;
}

/**
 * Repair over time. The crew works on one job (the worst, unless the captain
 * is busy with it — then the next one). Returns systems that just came back.
 */
export function repairTick(dmg, dt, { handSystem = null } = {}) {
  const fixed = [];
  const bump = (k, rate) => {
    const before = dmg[k];
    dmg[k] = Math.min(1, dmg[k] + rate * dt);
    if (before < 1 && dmg[k] >= 1) fixed.push(k);
    else if (before < BROKEN && dmg[k] >= BROKEN) fixed.push(k + ':online');
  };
  if (handSystem && dmg[handSystem] < 1) bump(handSystem, HAND_RATE);
  let crewJob = worstSystem(dmg);
  if (crewJob && crewJob === handSystem) {
    const others = SYSTEM_IDS.filter((k) => k !== handSystem && dmg[k] < 0.999).sort((a, b) => dmg[a] - dmg[b]);
    crewJob = others[0] || null;
  }
  if (crewJob) bump(crewJob, CREW_RATE);
  return { fixed, crewJob };
}

/** Stat multipliers the flight scene applies. */
export function effects(dmg) {
  const d = dmg || freshDamage();
  const scale = (v) => 0.4 + 0.6 * v;        // a wrecked system still limps along at 40%
  return {
    fireRate: scale(d.weapons),
    speed: scale(d.engines),
    regen: d.shields < BROKEN ? 0 : d.shields,
    sensors: d.sensors >= BROKEN,
    warp: d.warp >= BROKEN,
  };
}

export function anyDamage(dmg) { return SYSTEM_IDS.some((k) => (dmg?.[k] ?? 1) < 0.999); }
