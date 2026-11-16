/** Hostile contacts of the Alpha and Delta quadrants (game-balanced). */
export const ENEMIES = {
  raider: {
    id: 'raider',
    name: 'Nausicaan Raider',
    faction: 'Nausicaan Pirates',
    icon: '🏴‍☠️',
    tier: 1,
    hp: 330, shield: 90, regen: 4,
    dmg: 10, fireRate: 0.7, speed: 58, turn: 1.6,
    reward: { credits: 180, dilithium: 8, xp: 30 },
    colors: { hull: '#5a4b3c', trim: '#2b241d', glow: '#ffb347' },
    lore: 'Opportunistic marauders who strip derelicts and ambush lone survey ships on the frontier.',
  },
  bop: {
    id: 'bop',
    name: "B'rel-class Bird-of-Prey",
    faction: 'Klingon Empire',
    icon: '🦅',
    tier: 2,
    hp: 620, shield: 300, regen: 9,
    dmg: 18, fireRate: 0.85, speed: 54, turn: 1.5,
    reward: { credits: 320, dilithium: 16, xp: 55 },
    colors: { hull: '#54604b', trim: '#2c3327', glow: '#ff6a3d' },
    cloak: 0.25,
    lore: 'The definitive Klingon raider: 109 metres of wings, disruptors and a cloaking device. Crewed by as few as a dozen warriors, she punches far above her size.',
  },
  galor: {
    id: 'galor',
    name: 'Galor-class Warship',
    faction: 'Cardassian Union',
    icon: '🐍',
    tier: 3,
    hp: 1150, shield: 620, regen: 14,
    dmg: 24, fireRate: 1.0, speed: 42, turn: 1.05,
    reward: { credits: 520, dilithium: 24, xp: 85 },
    colors: { hull: '#8a7a52', trim: '#4a3f28', glow: '#ffd36b' },
    lore: 'The backbone of the Cardassian Guard. Heavily armed and armoured, Galor-class warships escort convoys and patrol the Union border with grim efficiency.',
  },
  warbird: {
    id: 'warbird',
    name: "D'deridex-class Warbird",
    faction: 'Romulan Star Empire',
    icon: '🦑',
    tier: 4,
    hp: 2100, shield: 1500, regen: 22,
    dmg: 32, fireRate: 0.9, speed: 40, turn: 0.85,
    reward: { credits: 880, dilithium: 38, xp: 140 },
    colors: { hull: '#4d6b58', trim: '#25332b', glow: '#7dffcf' },
    cloak: 0.4,
    lore: 'Over 1,300 metres of Romulan engineering, powered by an artificial quantum singularity and armed with disruptors that can carve through a Galaxy-class saucer. She can vanish into cloak at will.',
  },
  cube: {
    id: 'cube',
    name: 'Borg Cube',
    faction: 'Borg Collective',
    icon: '🟩',
    tier: 6,
    hp: 7200, shield: 3000, regen: 60,
    dmg: 52, fireRate: 0.65, speed: 26, turn: 0.4,
    reward: { credits: 3200, dilithium: 120, xp: 500 },
    colors: { hull: '#3a3f42', trim: '#1a1d1f', glow: '#7dff9a' },
    adapt: true,
    lore: 'Three kilometres of tritanium and adaptive shielding. Every shot that lands makes the next one weaker. Resistance, as they say, is not advisable.',
  },
  void: {
    id: 'void',
    name: 'Void Reaver',
    faction: 'The Void',
    icon: '🕳️',
    tier: 7,
    hp: 5200, shield: 3000, regen: 40,
    dmg: 44, fireRate: 1.1, speed: 62, turn: 1.4,
    reward: { credits: 2400, dilithium: 140, xp: 420 },
    colors: { hull: '#1c1426', trim: '#0a0710', glow: '#b47bff' },
    lore: 'Obsidian-hulled hunters from beyond the event horizon. Their weapons do not burn; they erase. Starfleet Science has catalogued exactly four encounters, none with survivors.',
  },
  orion: {
    id: 'orion',
    name: 'Orion Interceptor',
    faction: 'Orion Syndicate',
    icon: '💚',
    tier: 1,
    hp: 240, shield: 70, regen: 5,
    dmg: 8, fireRate: 1.15, speed: 76, turn: 2.3,
    reward: { credits: 160, dilithium: 7, xp: 26 },
    colors: { hull: '#3f6b3a', trim: '#1f3a1d', glow: '#9dff6a' },
    lore: 'Small, fast and cheap. Syndicate pilots swarm in, fire, and dart away before you can lock on. Hit them while they turn.',
  },
  vorcha: {
    id: 'vorcha',
    name: "Vor'cha-class Attack Cruiser",
    faction: 'Klingon Empire',
    icon: '🗡️',
    tier: 3,
    hp: 1300, shield: 720, regen: 15,
    dmg: 27, fireRate: 0.95, speed: 46, turn: 1.0,
    reward: { credits: 600, dilithium: 28, xp: 95 },
    colors: { hull: '#5d6650', trim: '#2b3126', glow: '#ff5a3d' },
    lore: 'A Klingon cruiser with a long neck and a big forward disruptor. Slower than a Bird-of-Prey, but it hits much harder and takes a beating.',
  },
  jemhadar: {
    id: 'jemhadar',
    name: "Jem'Hadar Attack Ship",
    faction: 'The Dominion',
    icon: '🪲',
    tier: 3,
    hp: 900, shield: 520, regen: 12,
    dmg: 30, fireRate: 1.25, speed: 68, turn: 1.8,
    reward: { credits: 560, dilithium: 26, xp: 90 },
    colors: { hull: '#6b6f86', trim: '#33364a', glow: '#b48cff' },
    lore: 'Beetle-shaped Dominion fighters with purple phased polaron beams that cut through shields. They never retreat and they attack in packs.',
  },
  hunter: {
    id: 'hunter',
    name: 'Hirogen Venatic Hunter',
    faction: 'Hirogen Hunters',
    icon: '🎯',
    tier: 4,
    hp: 1800, shield: 950, regen: 18,
    dmg: 31, fireRate: 1.0, speed: 58, turn: 1.15,
    reward: { credits: 820, dilithium: 36, xp: 130 },
    colors: { hull: '#5b5f63', trim: '#2a2d30', glow: '#ff3b30' },
    lore: 'Hirogen hunt for sport. Their long, forked ships track prey across whole sectors and only stop when the hunt is over.',
  },
  sphere: {
    id: 'sphere',
    name: 'Borg Sphere',
    faction: 'Borg Collective',
    icon: '🟢',
    tier: 5,
    hp: 4200, shield: 2000, regen: 45,
    dmg: 44, fireRate: 0.75, speed: 34, turn: 0.6,
    reward: { credits: 2000, dilithium: 80, xp: 320 },
    colors: { hull: '#3a3f42', trim: '#1a1d1f', glow: '#7dff9a' },
    adapt: true,
    lore: 'A smaller Borg scout ship, still bigger than most starships. Its shields learn your weapons just like a Cube does.',
  },
  wraith: {
    id: 'wraith',
    name: 'Void Wraith',
    faction: 'The Void',
    icon: '👻',
    tier: 6,
    hp: 3000, shield: 1800, regen: 32,
    dmg: 38, fireRate: 1.4, speed: 82, turn: 2.1,
    reward: { credits: 1800, dilithium: 110, xp: 360 },
    colors: { hull: '#1a1224', trim: '#0a0710', glow: '#e07bff' },
    cloak: 0.3,
    lore: 'A crescent of black glass that flickers in and out of sight. Wraiths hunt in pairs ahead of the larger Void ships.',
  },
  voidlord: {
    id: 'voidlord',
    name: 'Void Dreadnought "The Silence"',
    faction: 'The Void',
    icon: '💀',
    tier: 9,
    hp: 16000, shield: 9000, regen: 90,
    dmg: 60, fireRate: 0.9, speed: 30, turn: 0.55,
    reward: { credits: 12000, dilithium: 600, xp: 2000 },
    colors: { hull: '#140e1c', trim: '#07040b', glow: '#c58bff' },
    lore: 'The flagship of the entity that waits inside the singularity. Its hull measures four kilometres from prow to tail and seems to absorb light itself.',
  },
};

/** Scale a base enemy to a threat level, returning an instance-ready stat block. */
export function makeEnemy(kind, threat = 1, elite = false) {
  const e = ENEMIES[kind] || ENEMIES.raider;
  const t = Math.max(1, threat);
  const hpMul = (1 + 0.18 * (t - 1)) * (elite ? 1.35 : 1);
  const dmgMul = (1 + 0.14 * (t - 1)) * (elite ? 1.15 : 1);
  const hp = Math.round(e.hp * hpMul);
  const shield = Math.round(e.shield * hpMul);
  const credits = Math.round(e.reward.credits * (1 + 0.22 * (t - 1)) * (elite ? 2.2 : 1));
  const dil = Math.round(e.reward.dilithium * (1 + 0.2 * (t - 1)) * (elite ? 1.8 : 1));
  const xp = Math.round(e.reward.xp * (1 + 0.2 * (t - 1)) * (elite ? 2 : 1));
  return {
    ...e,
    kind: e.id,
    threat: t,
    elite,
    maxHp: hp, hp, maxShield: shield, shield,
    regen: Math.round(e.regen * hpMul * 0.6),
    dmg: Math.round(e.dmg * dmgMul),
    speed: Math.round(e.speed * (1 + 0.03 * (t - 1))),
    reward: { credits, dilithium: dil, xp },
    label: elite ? `Elite ${e.name}` : e.name,
  };
}

/** Produce a plausible patrol group for a system. */
export function fleetForSystem(system, rng) {
  const threat = system.threat || 1;
  const faction = system.faction || 'neutral';
  const pool = [];
  // stronger ships only turn up where the threat level is high enough
  const add = (kind, n = 1, minThreat = 1) => { if (threat >= minThreat) for (let i = 0; i < n; i++) pool.push(kind); };
  if (faction === 'klingon') { add('bop', 2); add('raider'); add('vorcha', 2, 3); }
  else if (faction === 'romulan') { add('warbird', 2); add('bop'); add('hunter', 1, 5); }
  else if (faction === 'cardassian') { add('galor', 2); add('raider'); add('jemhadar', 2, 3); }
  else if (faction === 'borg') { add('cube'); add('sphere', 2); }
  else if (faction === 'void') { add('void', 2); add('wraith', 2); add('voidlord'); }
  else { add('raider', 2); add('orion', 2); add('hunter', 1, 4); }

  const count = Math.min(4, 1 + Math.floor(threat / 2) + (rng.chance(0.35) ? 1 : 0));
  const fleet = [];
  for (let i = 0; i < count; i++) {
    const kind = rng.pick(pool);
    fleet.push(makeEnemy(kind, threat, rng.chance(0.12 + threat * 0.02)));
  }
  return fleet;
}

export const FACTION_INFO = {
  federation: { name: 'United Federation of Planets', color: '#59e0ff', blurb: 'Diplomacy, science and the common good.' },
  klingon: { name: 'Klingon Empire', color: '#ff4d3d', blurb: 'Honour and battle, above all.' },
  romulan: { name: 'Romulan Star Empire', color: '#7dffcf', blurb: 'Patience, secrecy and precision.' },
  cardassian: { name: 'Cardassian Union', color: '#ffd36b', blurb: 'Order at any cost.' },
  borg: { name: 'Borg Collective', color: '#7dff9a', blurb: 'You will be assimilated.' },
  void: { name: 'The Void', color: '#b47bff', blurb: 'Unknown. Unforgiving.' },
  neutral: { name: 'Unclaimed Space', color: '#9fb4c8', blurb: 'No flag flies here. Yet.' },
};
