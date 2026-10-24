import { RNG } from '../core/rng.js';
import { FACTION_INFO } from './enemies.js';

/* ------------------------------------------------------------------ planets */
export const PLANET_TYPES = {
  m: {
    id: 'm', name: 'Class-M Terrestrial', short: 'Terrestrial',
    atmosphere: 'Nitrogen–Oxygen, breathable', life: 'Complex biosphere',
    colors: ['#2f6fae', '#3f8a52', '#c9c3a6'], water: 0.7, habitability: 0.95,
    lore: 'A rare world with liquid water, a stable magnetosphere and a breathable atmosphere. Prime colony candidate.',
    yield: { credits: 420, dilithium: 16, research: 26 },
  },
  ocean: {
    id: 'ocean', name: 'Class-O Pelagic World', short: 'Ocean World',
    atmosphere: 'Nitrogen–Oxygen, humid', life: 'Marine biosphere',
    colors: ['#123f6e', '#1f6fa8', '#9fd8e8'], water: 0.97, habitability: 0.7,
    lore: 'A world almost entirely covered by a single world-ocean. Storms the size of continents roam the equator.',
    yield: { credits: 360, dilithium: 10, research: 34 },
  },
  desert: {
    id: 'desert', name: 'Class-K Arid World', short: 'Desert World',
    atmosphere: 'Thin carbon dioxide', life: 'Microbial',
    colors: ['#b0743a', '#d8a76a', '#7a4c28'], water: 0.05, habitability: 0.35,
    lore: 'Sun-blasted rock and dust seas. Deep aquifers and rare mineral veins make it worth the heat.',
    yield: { credits: 300, dilithium: 26, research: 18 },
  },
  ice: {
    id: 'ice', name: 'Class-P Glacial World', short: 'Ice World',
    atmosphere: 'Thin nitrogen–methane', life: 'Subsurface microbial',
    colors: ['#9fc7de', '#dcecf5', '#5b7f96'], water: 0.2, habitability: 0.2,
    lore: 'Kilometres of ice over a liquid ocean. Cryo-volcanic geysers vent from the poles.',
    yield: { credits: 280, dilithium: 34, research: 28 },
  },
  volcanic: {
    id: 'volcanic', name: 'Class-Y Volcanic World', short: 'Volcanic',
    atmosphere: 'Sulphur dioxide, toxic', life: 'None detected',
    colors: ['#7a2b1c', '#ff7a3d', '#2a1410'], water: 0, habitability: 0.05,
    lore: 'A young, violent world of lava seas. The crust is rich in duranium and other refractory metals.',
    yield: { credits: 340, dilithium: 30, research: 22 },
  },
  gas: {
    id: 'gas', name: 'Class-J Gas Giant', short: 'Gas Giant',
    atmosphere: 'Hydrogen–helium, crushing', life: 'Possible aerial fauna',
    colors: ['#c9a06a', '#e6d3b0', '#8a5a38'], water: 0, habitability: 0,
    lore: 'A banded giant with storm vortices older than human civilisation. Its upper atmosphere is a fuel refinery.',
    yield: { credits: 260, dilithium: 44, research: 24 },
  },
  barren: {
    id: 'barren', name: 'Class-D Barren World', short: 'Barren',
    atmosphere: 'Trace / none', life: 'None',
    colors: ['#8d8b86', '#bdbab4', '#5a5955'], water: 0, habitability: 0,
    lore: 'An airless rock. Nothing lives here, but impact craters expose valuable mineral seams.',
    yield: { credits: 180, dilithium: 22, research: 10 },
  },
  toxic: {
    id: 'toxic', name: 'Class-L Marginal World', short: 'Toxic',
    atmosphere: 'Chlorine–ammonia, corrosive', life: 'Extremophile mats',
    colors: ['#6b7a2c', '#b9c94a', '#3d4418'], water: 0.1, habitability: 0.08,
    lore: 'A chemical nightmare of acid rain and ammonia lakes. Sparse extremophile life clings to volcanic vents.',
    yield: { credits: 240, dilithium: 18, research: 40 },
  },
  rogue: {
    id: 'rogue', name: 'Rogue Planetary Mass', short: 'Rogue Planet',
    atmosphere: 'Frozen hydrogen', life: 'None detected',
    colors: ['#2b3a52', '#4a6480', '#131a24'], water: 0, habitability: 0,
    lore: 'A world flung from its star long ago, drifting through interstellar space with a heat signature nobody can explain.',
    yield: { credits: 400, dilithium: 48, research: 60 },
  },
};

export const ANOMALY_TYPES = [
  { id: 'rift', name: 'Subspace Rift', color: '#b47bff', rewards: { research: 70, credits: 260 }, text: 'A tear in the subspace manifold crackles with violet energy. Your science officer records eleven new particle types before the rift collapses.', danger: 0.1 },
  { id: 'derelict', name: 'Derelict Hulk', color: '#9fb4c8', rewards: { credits: 620, dilithium: 30, research: 40 }, text: 'A dead freighter tumbles slowly, hull pitted by micrometeorites. Salvage teams recover cargo from a century-old manifest.', danger: 0.15 },
  { id: 'probe', name: 'Ancient Probe', color: '#ffd36b', rewards: { research: 120, credits: 200 }, text: 'A probe of unknown origin, still transmitting on a carrier wave older than the Federation. The data is extraordinary.', danger: 0.05 },
  { id: 'grav', name: 'Gravimetric Shear', color: '#ffb347', rewards: { dilithium: 60, research: 60 }, text: 'Local gravity fluctuates wildly. You harvest exotic matter from the shear boundary.', danger: 0.35 },
  { id: 'tachyon', name: 'Tachyon Field', color: '#59e0ff', rewards: { research: 90, credits: 180 }, text: 'Faster-than-light particles stream through the field. The sensors triplicate every reading — one of them may be from the future.', danger: 0.1 },
  { id: 'wreck', name: 'Battle Wreckage', color: '#ff4d3d', rewards: { credits: 500, dilithium: 40, xp: 60 }, text: 'The shattered remains of a fleet engagement. Warp cores long cold, but the armour plating is worth a small fortune.', danger: 0.2 },
  { id: 'wormhole', name: 'Wormhole Transit', color: '#7dffcf', rewards: { credits: 900, dilithium: 120, research: 150 }, text: 'A stable wormhole. Your navigator takes a precise gravitational fix — a shortcut worth a fortune.', danger: 0.25 },
];

/* ------------------------------------------------------------------ names */
const N_PRE = ['Ar', 'Bel', 'Cor', 'Dra', 'Eri', 'Fon', 'Gal', 'Hal', 'Ith', 'Jar', 'Kel', 'Lyr', 'Mor', 'Nex', 'Or', 'Par', 'Qua', 'Rho', 'Sel', 'Tar', 'Ux', 'Vel', 'Wren', 'Xan', 'Yal', 'Zet', 'Amber', 'Cael', 'Deven', 'Elan'];
const N_SUF = ['ara', 'ion', 'us', 'ex', 'ora', 'ti', 'vos', 'na', 'dor', 'iel', 'kar', 'uum', 'is', 'eth', 'ax', 'yen', 'eos', 'ari', 'une', 'ory'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Omicron', 'Rho', 'Upsilon', 'Chi', 'Psi', 'Omega'];
const CATALOG = ['NGC', 'IC', 'HD', 'HIP', 'TYC', 'PSR'];

export function systemName(rng, used) {
  for (let i = 0; i < 40; i++) {
    let name;
    const roll = rng.next();
    if (roll < 0.45) name = rng.pick(N_PRE) + rng.pick(N_SUF);
    else if (roll < 0.72) name = `${rng.pick(GREEK)} ${rng.pick(N_PRE)}${rng.pick(N_SUF)}`;
    else if (roll < 0.86) name = `${rng.pick(CATALOG)}-${rng.int(100, 9999)}`;
    else name = `Tauri ${rng.int(1, 40)}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  const fallback = `Uncharted ${rng.int(1000, 9999)}`;
  used.add(fallback);
  return fallback;
}

/* ------------------------------------------------------------------ landmarks */
const LANDMARKS = [
  { name: 'Sol', x: 0, y: 0, faction: 'federation', threat: 1, star: 'G', starColor: '#ffd9a0', planets: ['m', 'barren', 'm', 'barren', 'gas', 'gas', 'ice', 'ice'], desc: 'Home. Eight planets, one blue jewel, and the capital of the United Federation of Planets.', capital: true },
  { name: 'Vulcan', x: -52, y: 34, faction: 'federation', threat: 1, star: 'K', starColor: '#ffc07a', planets: ['desert', 'barren', 'gas'], desc: 'Homeworld of the Vulcans. Logic, kolinahr, and the oldest spacefaring culture in the sector.', landmark: true },
  { name: 'Andoria', x: -18, y: 64, faction: 'federation', threat: 2, star: 'A', starColor: '#cfe4ff', planets: ['ice', 'ice', 'gas'], desc: 'A frozen moon orbiting a gas giant. The Andorians have defended it for millennia.', landmark: true },
  { name: 'Tellar Prime', x: -74, y: -22, faction: 'federation', threat: 1, star: 'G', starColor: '#ffe0a8', planets: ['m', 'barren', 'gas'], desc: 'Industrial heartland of the founding four. Tellarites argue for sport and build for centuries.', landmark: true },
  { name: 'Alpha Centauri', x: -24, y: -30, faction: 'federation', threat: 1, star: 'G', starColor: '#ffe6b8', planets: ['m', 'm', 'gas'], desc: 'Humanity\u2019s first interstellar colony and a major shipyard cluster.', landmark: true },
  { name: 'Qo\u2019noS', x: 96, y: 62, faction: 'klingon', threat: 4, star: 'K', starColor: '#ffb07a', planets: ['volcanic', 'm', 'barren', 'gas'], desc: 'The Klingon homeworld. Honour is not optional here.', landmark: true },
  { name: 'Khitomer', x: 124, y: 32, faction: 'klingon', threat: 3, star: 'M', starColor: '#ff9a6a', planets: ['barren', 'ice'], desc: 'Site of the Khitomer Accords, and of a massacre that shaped a generation.', landmark: true },
  { name: 'Romulus', x: 146, y: -82, faction: 'romulan', threat: 5, star: 'K', starColor: '#ffe0b0', planets: ['m', 'm', 'gas'], desc: 'Seat of the Romulan Star Empire. The Senate\u2019s reach is long and very quiet.', landmark: true },
  { name: 'Remus', x: 152, y: -72, faction: 'romulan', threat: 5, star: 'K', starColor: '#ffcf90', planets: ['volcanic', 'barren'], desc: 'Tidally locked twin of Romulus. Its dilithium mines are worked by the Remans.', landmark: true },
  { name: 'Cardassia Prime', x: 34, y: -124, faction: 'cardassian', threat: 4, star: 'G', starColor: '#ffdca0', planets: ['desert', 'm', 'barren'], desc: 'Capital of the Cardassian Union. Order, as they define it, at any cost.', landmark: true },
  { name: 'Bajor', x: -8, y: -104, faction: 'neutral', threat: 2, star: 'K', starColor: '#ffcf88', planets: ['m', 'barren', 'gas'], desc: 'A spiritual people rebuilding after occupation, orbiting the Celestial Temple.', landmark: true },
  { name: 'Deep Space 9', x: 2, y: -96, faction: 'federation', threat: 3, star: 'B', starColor: '#a8c8ff', planets: [], desc: 'Former Cardassian mining station turned Federation outpost beside a stable wormhole.', landmark: true, station: true },
  { name: 'Wolf 359', x: 62, y: 20, faction: 'neutral', threat: 5, star: 'M', starColor: '#ff8060', planets: ['barren'], desc: 'A graveyard of thirty-nine starships. The wreckage still glows faintly in the sensors.', landmark: true, graveyard: true },
  { name: 'The Black Cluster', x: -156, y: 112, faction: 'neutral', threat: 6, star: 'BH', starColor: '#000000', planets: ['rogue', 'rogue'], desc: 'A cluster of gravitational singularities. Ships that enter are never heard from again.', landmark: true, blackhole: true },
  { name: 'Vela Singularity', x: 208, y: 158, faction: 'void', threat: 7, star: 'BH', starColor: '#000000', planets: ['rogue'], desc: 'The source of the Void incursion. Its accretion disk spans a solar system.', landmark: true, blackhole: true, boss: true },
  { name: 'Borg Transwarp Hub', x: 236, y: -168, faction: 'borg', threat: 8, star: 'M', starColor: '#9affc0', planets: ['barren', 'ice'], desc: 'A lattice of transwarp conduits. Uncountable cubes sleep within.', landmark: true },
  { name: 'Orion', x: 44, y: 78, faction: 'neutral', threat: 2, star: 'A', starColor: '#cfe0ff', planets: ['desert', 'm'], desc: 'Orion Syndicate space. Everything is for sale, including the sensors watching you buy it.', landmark: true },
];

/* ------------------------------------------------------------------ systems */
function makePlanets(system, rng) {
  const planets = [];
  const forced = system.planetTypes || null;
  const count = forced ? forced.length : rng.int(1, 4);
  const types = Object.keys(PLANET_TYPES);
  for (let i = 0; i < count; i++) {
    const typeId = forced ? forced[i] : rng.pick(types);
    const type = PLANET_TYPES[typeId];
    const radius = (typeId === 'gas' ? rng.range(7, 13) : rng.range(2.2, 4.6)).toFixed(1);
    planets.push({
      id: `${system.id}-p${i}`,
      name: `${system.name} ${'I' === 'I' ? roman(i + 1) : i + 1}`,
      type: typeId,
      typeName: type.name,
      radiusKm: Math.round((typeId === 'gas' ? rng.range(48000, 142000) : rng.range(3200, 15800))),
      orbit: 26 + i * rng.range(13, 24),
      phase: rng.range(0, Math.PI * 2),
      tilt: rng.range(-0.5, 0.5),
      visualRadius: parseFloat(radius),
      moons: rng.int(0, 4),
      gravity: +(type.habitability * rng.range(0.6, 1.25) + 0.2).toFixed(2),
      temperature: Math.round(rng.range(-210, 460)),
      resources: {
        dilithium: Math.round(rng.range(4, 34) * (typeId === 'gas' ? 1.6 : 1)),
        minerals: Math.round(rng.range(20, 240)),
        research: Math.round(rng.range(10, 90)),
      },
      signs: {
        ruins: rng.chance(0.12),
        life: rng.chance(type.habitability * 0.8),
        anomaly: rng.chance(0.2),
      },
      seed: rng.int(1, 999999),
      surveyed: false,
    });
  }
  return planets;
}

function roman(n) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][n - 1] || String(n);
}

export function buildGalaxy(seed = 'alpha') {
  const rng = new RNG(seed);
  const used = new Set();
  const systems = [];
  const lanes = [];

  for (const lm of LANDMARKS) {
    used.add(lm.name);
    const id = lm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sys = {
      id,
      name: lm.name,
      x: lm.x,
      y: lm.y,
      faction: lm.faction,
      threat: lm.threat,
      star: lm.star,
      starColor: lm.starColor,
      desc: lm.desc,
      landmark: true,
      capital: !!lm.capital,
      blackhole: !!lm.blackhole,
      boss: !!lm.boss,
      station: !!lm.station,
      graveyard: !!lm.graveyard,
      planetTypes: lm.planets,
      discovered: lm.name === 'Sol',
      ly: Math.hypot(lm.x, lm.y),
    };
    sys.planets = makePlanets(sys, rng.fork(sys.id));
    systems.push(sys);
  }

  // procedurally scattered systems, avoiding the exact centre
  for (let i = 0; i < 30; i++) {
    let x, y, tries = 0;
    do {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(46, 300);
      x = Math.cos(a) * r;
      y = Math.sin(a) * r * 0.78;
      tries++;
    } while (tries < 60 && systems.some((s) => Math.hypot(s.x - x, s.y - y) < 26));
    const name = systemName(rng, used);
    const dist = Math.hypot(x, y);
    // Faction territories radiate outward: frontier gets hostile
    let faction = 'neutral';
    const f = rng.next();
    if (dist > 70) {
      if (f < 0.32) faction = 'klingon';
      else if (f < 0.52) faction = 'romulan';
      else if (f < 0.7) faction = 'cardassian';
      else if (f < 0.76 && dist > 160) faction = 'borg';
      else if (f < 0.82 && dist > 190) faction = 'void';
      else if (f < 0.92) faction = 'federation';
    } else if (f < 0.5) faction = 'federation';
    const threat = Math.max(1, Math.min(8, Math.round(1 + dist / 42 + rng.range(-0.6, 1.1))));
    const starRoll = rng.next();
    const star = starRoll < 0.42 ? 'G' : starRoll < 0.62 ? 'K' : starRoll < 0.78 ? 'M' : starRoll < 0.9 ? 'A' : starRoll < 0.96 ? 'B' : 'N';
    const starColor = { G: '#ffe0a8', K: '#ffc07a', M: '#ff9a6a', A: '#cfe4ff', B: '#a8c8ff', N: '#e6f0ff' }[star];
    const sys = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name, x, y, faction, threat, star, starColor,
      desc: `${FACTION_INFO[faction].name} space. Threat assessment ${threat}/8.`,
      ly: Math.hypot(x, y),
      discovered: false,
      landmark: false,
      blackhole: false,
    };
    sys.planets = makePlanets(sys, rng.fork(sys.id));
    systems.push(sys);
  }

  // warp lanes: connect each system to its 2 nearest neighbours
  systems.forEach((s) => {
    const near = systems
      .filter((o) => o !== s)
      .map((o) => ({ o, d: Math.hypot(o.x - s.x, o.y - s.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach(({ o }) => {
      const key = [s.id, o.id].sort().join('~');
      if (!lanes.find((l) => l.key === key)) lanes.push({ key, a: s.id, b: o.id });
    });
  });

  const byId = Object.fromEntries(systems.map((s) => [s.id, s]));
  return { systems, lanes, byId, seed };
}

export function warpCost(from, to) {
  if (!from || !to) return 12;
  const ly = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(6, Math.round(6 + ly * 0.62));
}

export function systemById(galaxy, id) {
  return galaxy.byId[id] || null;
}

export function planetById(galaxy, id) {
  for (const system of galaxy.systems) {
    const planet = system.planets.find((p) => p.id === id);
    if (planet) return { system, planet };
  }
  return null;
}

export function surveyPlanet(planet, system, rng = Math.random) {
  const type = PLANET_TYPES[planet.type];
  const y = type.yield;
  const richness = 0.75 + (planet.seed % 100) / 140;
  const credits = Math.round(y.credits * richness);
  const dilithium = Math.round(y.dilithium * richness * 0.7);
  const research = Math.round(y.research * richness);
  const bonus = [];
  if (planet.signs.ruins) bonus.push({ id: 'ruins', name: 'Ancient ruins', credits: 320, research: 90, text: 'A pre-warp settlement, abandoned centuries ago. The glyphs are not any known language.' });
  if (planet.signs.life && planet.type !== 'barren') bonus.push({ id: 'life', name: 'Living biosphere', research: 70, credits: 120, text: 'Genetic sampling confirms an independent origin of life. The exobiology team is ecstatic.' });
  if (planet.signs.anomaly) bonus.push({ id: 'anomaly', name: 'Energy anomaly', dilithium: 30, research: 50, text: 'Subsurface energy readings with no natural explanation. Possibly a buried structure.' });
  return {
    planet, type, credits, dilithium, research, bonus,
    habitability: type.habitability,
    atmosphere: type.atmosphere,
    life: type.life,
    lore: type.lore,
    xp: 35 + Math.round(type.habitability * 40) + (planet.signs.ruins ? 25 : 0),
  };
}

export const STAR_LABEL = { G: 'G-type main sequence', K: 'K-type orange dwarf', M: 'M-type red dwarf', A: 'A-type white star', B: 'B-type blue giant', N: 'Neutron star', BH: 'Black hole' };
