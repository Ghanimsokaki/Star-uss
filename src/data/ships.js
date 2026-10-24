/**
 * Starfleet ship classes, with canon-inspired technical specifications.
 * Stats are game-balanced versions of the on-screen vessels.
 */
export const SHIP_CLASSES = {
  miranda: {
    id: 'miranda',
    name: 'Miranda-Class',
    hullName: 'U.S.S. Reliant',
    registry: 'NCC-1864',
    tier: 1,
    role: 'Light Cruiser',
    icon: '🛰️',
    cost: 0,
    rankReq: 1,
    researchReq: 0,
    lore: 'A dependable 23rd-century workhorse, the Miranda class has served the Federation for over a century in survey, escort and combat roles. The U.S.S. Reliant is the classic example: compact, modular and famously hard to kill.',
    specs: { length: '237 m', beam: '141 m', height: '58 m', crew: '360', mass: '655,000 t', maxWarp: '9.2', decks: '11' },
    base: { hull: 1600, shield: 950, regen: 16, phaser: 46, fireRate: 1.55, torp: 200, torpRate: 0.34, speed: 54, turn: 1.25, sensor: 1, cargo: 160 },
    hardpoints: { phasers: 2, torpedoes: 1, ability: null },
    ability: { id: 'none', name: 'Auxiliary Power', desc: 'Reroute reserve power to shields.', cd: 26 },
    accent: '#8fd6ff',
  },
  intrepid: {
    id: 'intrepid',
    name: 'Intrepid-Class',
    hullName: 'U.S.S. Voyager',
    registry: 'NCC-74656',
    tier: 2,
    role: 'Long-Range Explorer',
    icon: '🛸',
    cost: 26000,
    rankReq: 3,
    researchReq: 0,
    lore: 'Introduced in 2370, the Intrepid class paired bio-neural gel packs with variable-geometry warp nacelles. Devastatingly fast for her size, she can sustain a crew of 150 for five years with no resupply.',
    specs: { length: '344 m', beam: '132 m', height: '64 m', crew: '150', mass: '700,000 t', maxWarp: '9.975', decks: '15' },
    base: { hull: 2200, shield: 1500, regen: 24, phaser: 62, fireRate: 1.7, torp: 260, torpRate: 0.3, speed: 70, turn: 1.45, sensor: 1.6, cargo: 260 },
    hardpoints: { phasers: 4, torpedoes: 2, ability: 'slipstream' },
    ability: { id: 'slipstream', name: 'Slipstream Burst', desc: 'A short quantum-slipstream jump that outruns any pursuer.', cd: 30 },
    accent: '#5ff0c8',
  },
  akira: {
    id: 'akira',
    name: 'Akira-Class',
    hullName: 'U.S.S. Thunderchild',
    registry: 'NCC-63549',
    tier: 3,
    role: 'Heavy Torpedo Cruiser',
    icon: '🚀',
    cost: 58000,
    rankReq: 5,
    researchReq: 0,
    lore: 'The catamaran-hulled Akira was designed around torpedo volume of fire. Her weapons pod carries redundant launchers, making her the backbone of many Dominion War battle groups.',
    specs: { length: '464 m', beam: '316 m', height: '87 m', crew: '500', mass: '3,000,000 t', maxWarp: '9.8', decks: '26' },
    base: { hull: 3400, shield: 2100, regen: 26, phaser: 70, fireRate: 1.8, torp: 400, torpRate: 0.52, speed: 60, turn: 1.2, sensor: 1.2, cargo: 320 },
    hardpoints: { phasers: 6, torpedoes: 5, ability: 'salvo' },
    ability: { id: 'salvo', name: 'Torpedo Salvo', desc: 'Unleash a full spread of photon torpedoes.', cd: 24 },
    accent: '#ffd36b',
  },
  defiant: {
    id: 'defiant',
    name: 'Defiant-Class',
    hullName: 'U.S.S. Defiant',
    registry: 'NX-74205',
    tier: 4,
    role: 'Tactical Escort',
    icon: '🗡️',
    cost: 96000,
    rankReq: 7,
    researchReq: 0,
    lore: 'Built to fight the Borg, the Defiant is small, brutally over-armed and wrapped in ablative armour. Four pulse phaser cannons and quantum torpedoes make her punch far above her weight.',
    specs: { length: '170 m', beam: '134 m', height: '30 m', crew: '50', mass: '355,000 t', maxWarp: '9.5', decks: '4' },
    base: { hull: 3000, shield: 2400, regen: 34, phaser: 112, fireRate: 2.3, torp: 370, torpRate: 0.44, speed: 66, turn: 1.85, sensor: 1.1, cargo: 140 },
    hardpoints: { phasers: 4, torpedoes: 3, ability: 'overload' },
    ability: { id: 'overload', name: 'Pulse Overload', desc: 'Overcharge the pulse cannons for a devastating burst of fire.', cd: 22 },
    accent: '#ff9d7a',
  },
  sovereign: {
    id: 'sovereign',
    name: 'Sovereign-Class',
    hullName: 'U.S.S. Enterprise',
    registry: 'NCC-1701-E',
    tier: 5,
    role: 'Heavy Explorer / Assault Cruiser',
    icon: '⭐',
    cost: 185000,
    rankReq: 9,
    researchReq: 0,
    lore: 'The Sovereign project pushed every system to the edge after Wolf 359. Twelve Type-XII phaser arrays, regenerative shielding and a quantum torpedo arsenal make her the most capable exploration cruiser in the fleet.',
    specs: { length: '685 m', beam: '224 m', height: '88 m', crew: '855', mass: '3,255,000 t', maxWarp: '9.95', decks: '24' },
    base: { hull: 5200, shield: 3800, regen: 46, phaser: 134, fireRate: 2.2, torp: 500, torpRate: 0.62, speed: 62, turn: 1.3, sensor: 1.8, cargo: 520 },
    hardpoints: { phasers: 8, torpedoes: 6, ability: 'quantumBurst' },
    ability: { id: 'quantumBurst', name: 'Quantum Burst', desc: 'Fire a synchronized quantum torpedo volley from every launcher.', cd: 26 },
    accent: '#a9c8ff',
  },
  prometheus: {
    id: 'prometheus',
    name: 'Prometheus-Class',
    hullName: 'U.S.S. Prometheus',
    registry: 'NX-59650',
    tier: 6,
    role: 'Multi-Vector Assault Explorer',
    icon: '🔱',
    cost: 320000,
    rankReq: 12,
    researchReq: 6,
    lore: 'A top-secret prototype with four nacelles and the first Multi-Vector Assault Mode: the ship splits into three independent attack sections that fight as one. Her regenerative shields and advanced phaser arrays are decades ahead of their time.',
    specs: { length: '415 m', beam: '180 m', height: '80 m', crew: '200', mass: '2,400,000 t', maxWarp: '9.99', decks: '16' },
    base: { hull: 6200, shield: 5200, regen: 62, phaser: 150, fireRate: 2.5, torp: 560, torpRate: 0.7, speed: 78, turn: 1.5, sensor: 2.2, cargo: 480 },
    hardpoints: { phasers: 10, torpedoes: 8, ability: 'mva' },
    ability: { id: 'mva', name: 'Multi-Vector Assault', desc: 'Split into three attack vectors; phasers and torpedoes fire from all sections.', cd: 34 },
    accent: '#c59bff',
  },
};

export const SHIP_ORDER = ['miranda', 'intrepid', 'akira', 'defiant', 'sovereign', 'prometheus'];

export const UPGRADE_SYSTEMS = {
  hull: { id: 'hull', name: 'Structural Integrity', short: 'Hull', icon: '🛡️', desc: 'Reinforced duranium-tritanium lattice with ablative layering.' },
  shields: { id: 'shields', name: 'Deflector Shields', short: 'Shields', icon: '🔵', desc: 'Regenerative multi-spectral shield emitters.' },
  weapons: { id: 'weapons', name: 'Phaser Arrays', short: 'Weapons', icon: '🔶', desc: 'Tuned emitter banks and faster recharge cycles.' },
  engines: { id: 'engines', name: 'Impulse Engines', short: 'Engines', icon: '🔥', desc: 'Higher sublight acceleration and turn authority.' },
  sensors: { id: 'sensors', name: 'Sensor Suite', short: 'Sensors', icon: '📡', desc: 'Longer survey range and better anomaly detection.' },
};
export const UPGRADE_ORDER = ['hull', 'shields', 'weapons', 'engines', 'sensors'];

export const PALETTES = [
  { id: 'starfleet', name: 'Starfleet Standard', hull: '#b9c3cf', trim: '#3d4a5c', accent: '#59e0ff', dark: '#6a7686' },
  { id: 'refit', name: 'Refit White', hull: '#dfe6ee', trim: '#5b6b80', accent: '#8be8ff', dark: '#8c99a9' },
  { id: 'terran', name: 'Terran Empire', hull: '#2a303a', trim: '#c9a24a', accent: '#ffb347', dark: '#141920' },
  { id: 'andorian', name: 'Andorian Guard', hull: '#93b6cf', trim: '#24405c', accent: '#87e7ff', dark: '#4c6d88' },
  { id: 'vulcan', name: 'Vulcan Bronze', hull: '#9a8f7d', trim: '#5d4a33', accent: '#ffd9a0', dark: '#544a3d' },
  { id: 'section31', name: 'Section 31 Black', hull: '#1b2028', trim: '#3a4552', accent: '#7ce8c0', dark: '#0c1014' },
];

export const NACELLE_COLORS = ['#ff5a3c', '#59e0ff', '#7dff9a', '#b47bff', '#ffd36b', '#ff8ae0'];
export const DEFLECTOR_COLORS = ['#5ab7ff', '#7dffcf', '#ffd36b', '#ff7b6b', '#c59bff'];

export const MAX_UPGRADE = 10;

export function moduleCost(cls, system, level) {
  const base = { hull: 1500, shields: 1700, weapons: 1900, engines: 1500, sensors: 1200 }[system] || 1500;
  return Math.round(base * cls.tier * Math.pow(level, 1.55));
}

const TECH_BONUS = {
  hull: { hull: 0.05 },
  shields: { shield: 0.07, regen: 0.05 },
  weapons: { phaser: 0.06 },
  engines: { speed: 0.05, turn: 0.03 },
  sensors: { sensor: 0.1 },
};

/**
 * @param {string} classId
 * @param {object} levels  per-system upgrade levels (1..10)
 * @param {Set<string>} techs unlocked research ids
 */
export function computeStats(classId, levels = {}, techs = new Set()) {
  const cls = SHIP_CLASSES[classId] || SHIP_CLASSES.miranda;
  const b = cls.base;
  const L = (k) => Math.max(1, Math.min(MAX_UPGRADE, levels[k] || 1));
  const techMul = (key) => {
    let m = 1;
    for (const t of techs) {
      const bonus = TECH_BONUS_LOOKUP[t]?.[key];
      if (bonus) m += bonus;
    }
    return m;
  };
  const hull = Math.round(b.hull * (1 + 0.17 * (L('hull') - 1)) * techMul('hull'));
  const shield = Math.round(b.shield * (1 + 0.19 * (L('shields') - 1)) * techMul('shield'));
  const regen = +(b.regen * (1 + 0.15 * (L('shields') - 1)) * techMul('regen')).toFixed(1);
  const phaser = +(b.phaser * (1 + 0.16 * (L('weapons') - 1)) * techMul('phaser')).toFixed(1);
  const fireRate = +(b.fireRate * (1 + 0.035 * (L('weapons') - 1))).toFixed(2);
  const torp = Math.round(b.torp * (1 + 0.16 * (L('weapons') - 1)) * techMul('phaser'));
  const torpRate = +(b.torpRate * (1 + 0.03 * (L('weapons') - 1))).toFixed(2);
  const speed = Math.round(b.speed * (1 + 0.06 * (L('engines') - 1)) * techMul('speed'));
  const turn = +(b.turn * (1 + 0.05 * (L('engines') - 1)) * techMul('turn')).toFixed(2);
  const sensor = +(b.sensor * (1 + 0.12 * (L('sensors') - 1)) * techMul('sensor')).toFixed(2);
  const dps = +(phaser * fireRate + torp * torpRate).toFixed(0);
  const score = Math.round(hull / 10 + shield / 8 + dps * 1.4 + speed * 2.2 + turn * 90 + sensor * 40);
  return { hull, shield, regen, phaser, fireRate, torp, torpRate, speed, turn, sensor, cargo: b.cargo, dps, score };
}

// flat lookup of research id -> stat bonus (kept in sync with data/tech.js)
export const TECH_BONUS_LOOKUP = {
  sif: { hull: 0.05 },
  regenShields: { shield: 0.07, regen: 0.05 },
  phaserTuning: { phaser: 0.06 },
  impulse: { speed: 0.05, turn: 0.03 },
  sensorNet: { sensor: 0.1 },
  quantum: { phaser: 0.05 },
  ablat: { hull: 0.08 },
  mvam: { shield: 0.05, phaser: 0.05 },
};
