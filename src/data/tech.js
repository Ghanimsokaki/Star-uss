/** Civilization districts (built on the Earth globe) */
export const DISTRICTS = {
  capital: {
    id: 'capital', name: 'Starfleet Command', icon: '🏛️', color: '#59e0ff',
    desc: 'San Francisco complex. Coordinates the fleet and collects the Federation\u2019s tax base.',
    cost: 0, maxLevel: 6, unique: true,
    yield: (lvl) => ({ credits: 78 + lvl * 46, research: 3 + lvl * 2 }),
    popCap: 0, requires: null,
  },
  residential: {
    id: 'residential', name: 'Arcology District', icon: '🏙️', color: '#9fd8ff',
    desc: 'Vertical cities built with clean fusion power. Raises your population ceiling.',
    cost: 2400, maxLevel: 8,
    yield: (lvl) => ({ credits: 22 + lvl * 16, research: 0 }),
    popCap: 1.4, requires: null,
  },
  industry: {
    id: 'industry', name: 'Industrial Replicator', icon: '⚙️', color: '#ffb347',
    desc: 'Matter synthesis foundries. Produces energy credits per second.',
    cost: 3200, maxLevel: 8,
    yield: (lvl) => ({ credits: 48 + lvl * 34, research: 0 }),
    popCap: 0, requires: null,
  },
  research: {
    id: 'research', name: 'Research Campus', icon: '🔬', color: '#b47bff',
    desc: 'Daystrom Institute annex. Generates research points used to unlock fleet technology.',
    cost: 3800, maxLevel: 8,
    yield: (lvl) => ({ credits: 8, research: 10 + lvl * 7 }),
    popCap: 0, requires: null,
  },
  shipyard: {
    id: 'shipyard', name: 'Orbital Shipyard', icon: '🛠️', color: '#5ff0c8',
    desc: 'Utopia Planitia dry-docks. Reduces the price of new ships and repairs your hull between missions.',
    cost: 5200, maxLevel: 6,
    yield: (lvl) => ({ credits: 18, research: 2 }),
    popCap: 0, requires: null,
    special: (lvl) => ({ shipDiscount: lvl * 0.04, repair: lvl * 0.08 }),
  },
  defense: {
    id: 'defense', name: 'Planetary Shield', icon: '🛡️', color: '#ff8a7d',
    desc: 'Theatre shields and orbital platforms. Lowers the frequency of raids on Earth.',
    cost: 4400, maxLevel: 8,
    yield: (lvl) => ({ credits: 6, research: 1 }),
    popCap: 0, requires: null,
    special: (lvl) => ({ defense: lvl }),
  },
  energy: {
    id: 'energy', name: 'Fusion Grid', icon: '⚡', color: '#ffd36b',
    desc: 'Continent-scale power distribution. Multiplies the credit output of every district.',
    cost: 6000, maxLevel: 6,
    yield: (lvl) => ({ credits: 0, research: 0 }),
    popCap: 0, requires: null,
    special: (lvl) => ({ creditMul: lvl * 0.07 }),
  },
  biodome: {
    id: 'biodome', name: 'Agricultural Biodome', icon: '🌾', color: '#62f2a6',
    desc: 'Vertical farms and ocean kelp arrays. Speeds population growth and lifts morale.',
    cost: 2800, maxLevel: 6,
    yield: (lvl) => ({ credits: 14, research: 1 }),
    popCap: 0.8, requires: null,
    special: (lvl) => ({ growth: lvl * 0.14 }),
  },
};
export const DISTRICT_ORDER = ['residential', 'industry', 'research', 'shipyard', 'defense', 'energy', 'biodome'];

export function districtUpgradeCost(type, level) {
  const d = DISTRICTS[type];
  return Math.round((d.cost || 2200) * Math.pow(level, 1.35) * 0.85);
}

/* ------------------------------------------------------------------ research */
export const TECHS = {
  sif: {
    id: 'sif', name: 'Structural Integrity Field', icon: '🛡️', cost: 220,
    desc: 'Reinforced duranium-tritanium weave. +5% hull strength fleet-wide.',
    effect: '+5% hull', tier: 1,
  },
  phaserTuning: {
    id: 'phaserTuning', name: 'Phaser Frequency Tuning', icon: '🔶', cost: 320,
    desc: 'Adaptive emitter frequencies. +6% phaser damage.',
    effect: '+6% phaser damage', tier: 1,
  },
  sensorNet: {
    id: 'sensorNet', name: 'Deep Space Sensor Net', icon: '📡', cost: 380,
    desc: 'A subspace telescope array. +10% sensor range and better anomaly yields.',
    effect: '+10% sensors', tier: 1,
  },
  regenShields: {
    id: 'regenShields', name: 'Regenerative Shielding', icon: '🔵', cost: 540,
    desc: 'Auto-modulating shield geometry. +7% shield capacity and +5% regeneration.',
    effect: '+7% shields', tier: 2, requires: ['sif'],
  },
  replicator: {
    id: 'replicator', name: 'Industrial Replicators', icon: '⚙️', cost: 620,
    desc: 'Matter-energy conversion at scale. +20% civilization credit income.',
    effect: '+20% income', tier: 2,
  },
  impulse: {
    id: 'impulse', name: 'Impulse Dynamics', icon: '🔥', cost: 700,
    desc: 'Deuterium injector upgrades. +5% speed and +3% turn rate.',
    effect: '+5% speed', tier: 2, requires: ['phaserTuning'],
  },
  terraforming: {
    id: 'terraforming', name: 'Terraforming Protocols', icon: '🌱', cost: 850,
    desc: 'Atmospheric processors. +50% population growth and +1 population ceiling per world.',
    effect: '+50% growth', tier: 2, requires: ['replicator'],
  },
  quantum: {
    id: 'quantum', name: 'Quantum Torpedoes', icon: '💠', cost: 1100,
    desc: 'Zero-point warhead yield. +5% phaser/torpedo damage and a stronger alpha strike.',
    effect: '+5% weapons', tier: 3, requires: ['regenShields', 'impulse'],
  },
  orbitalYards: {
    id: 'orbitalYards', name: 'Orbital Shipyard Network', icon: '🛠️', cost: 1300,
    desc: 'Automated Utopia Planitia lines. All ship purchases cost 15% less.',
    effect: '\u221215% ship cost', tier: 3, requires: ['replicator'],
  },
  slipstream: {
    id: 'slipstream', name: 'Quantum Slipstream Drive', icon: '🌀', cost: 1600,
    desc: 'Benamite-cored slipstream. Warp travel costs 35% less dilithium.',
    effect: '\u221235% warp cost', tier: 3, requires: ['impulse'],
  },
  ablat: {
    id: 'ablat', name: 'Ablative Armour Layers', icon: '🧱', cost: 1800,
    desc: 'Adaptive ablative plating. +8% hull strength.',
    effect: '+8% hull', tier: 3, requires: ['sif', 'quantum'],
  },
  singularity: {
    id: 'singularity', name: 'Singularity Physics', icon: '🕳️', cost: 2600,
    desc: 'Gravimetric shielding and frame-dragging compensation. Required to enter the Vela Singularity and survive.',
    effect: 'Unlocks the black hole endgame', tier: 4, requires: ['quantum', 'sensorNet'],
  },
  mvam: {
    id: 'mvam', name: 'Multi-Vector Assault Mode', icon: '🔱', cost: 3400,
    desc: 'Prometheus-class separation protocols. Unlocks the Prometheus-class and grants +5% shields/weapons.',
    effect: 'Unlocks Prometheus-class', tier: 4, requires: ['quantum', 'ablat'],
  },
};
export const TECH_ORDER = ['sif', 'phaserTuning', 'sensorNet', 'regenShields', 'replicator', 'impulse', 'terraforming', 'quantum', 'orbitalYards', 'slipstream', 'ablat', 'singularity', 'mvam'];

/* ------------------------------------------------------------------ codex */
export const CODEX_ARTICLES = [
  {
    title: 'The Kelvin Timeline',
    tag: 'Timelines',
    body: 'When the Romulan mining vessel Narada fell through a singularity in 2233, it arrived 154 years early and destroyed the U.S.S. Kelvin. The Federation that rebuilt itself afterwards had the same flag and a different history: larger ships, earlier wars, and a James T. Kirk who never knew his father. Both timelines are real; the divergence happened at the Kelvin, and everything since carries her name.',
  },
  {
    title: 'The Narada and the Red Matter',
    tag: 'Timelines',
    body: 'A 24th-century Romulan mining ship retrofitted with Borg-derived technology, crewed by miners who blamed the Federation for the loss of Romulus. Her captain used red matter \u2014 a volatile substance that collapses matter into a singularity \u2014 to destroy Vulcan. The Narada was later destroyed by the Enterprise, but not before she had redrawn the map of the quadrant.',
  },
  {
    title: 'The United Federation of Planets',
    tag: 'Politics',
    body: 'Founded in 2161 by Humans, Vulcans, Andorians and Tellarites. Over 150 member worlds share science, defence and trade under the Articles of Federation. Starfleet is its exploratory and defensive arm — not a military, whatever the Klingons say.',
  },
  {
    title: 'Warp Drive',
    tag: 'Technology',
    body: 'A matter/antimatter reaction chamber feeds plasma to warp nacelles, which create a subspace field that contracts space ahead of the ship and expands it behind. Warp factors are non-linear; Warp 9.975 is roughly 2,900 times the speed of light. Above Warp 9.99, subspace begins to degrade — a problem the Intrepid-class variable-geometry nacelles were built to solve.',
  },
  {
    title: 'Deflector Shields',
    tag: 'Technology',
    body: 'Navigational deflectors push dust and micrometeorites aside at warp. In combat, shield emitters project layered graviton fields that absorb and disperse energy. Shield geometry can be rotated and re-modulated so incoming fire meets a fresh frequency — the basis of regenerative shielding.',
  },
  {
    title: 'The Black Cluster',
    tag: 'Astrophysics',
    body: 'A stellar-mass black hole has no surface, only an event horizon: the radius at which escape velocity exceeds light speed. Matter spiralling inward forms an accretion disk heated to millions of kelvin, radiating X-rays. Gravitational lensing bends background starlight into a ring around the shadow. Nothing that crosses the horizon returns.',
  },
  {
    title: 'Klingon Defence Force',
    tag: 'Factions',
    body: 'Klingon ships favour forward disruptors, cloaking devices and aggressive close-range tactics. Honour governs everything: a warrior who retreats without cause loses more than a ship. The B\u2019rel Bird-of-Prey is their most common raider, and their most beloved.',
  },
  {
    title: 'Romulan Star Empire',
    tag: 'Factions',
    body: 'Romulan warbirds are powered by artificial quantum singularities and armed with disruptors, and they can cloak. Their doctrine is patience: observe, position, then strike once. A D\u2019deridex is over 1,300 metres long and can outgun most ships twice her age.',
  },
  {
    title: 'Borg Collective',
    tag: 'Factions',
    body: 'A hive intelligence of assimilated species. Borg adaptive shielding analyses incoming fire and becomes immune to repeated frequencies; rotating your weapon frequency is the only reliable counter. A single cube has destroyed fleets. Resistance is, historically, inadvisable.',
  },
  {
    title: 'Survey Protocol',
    tag: 'Starfleet',
    body: 'A standard survey charts the planet\u2019s atmosphere, gravity, biosphere and mineral wealth, then transmits the data to the Daystrom Institute. Habitable worlds are flagged for colonisation. Unexplained readings are flagged for a second pass — those are where the interesting science lives.',
  },
  {
    title: 'Starship Classes',
    tag: 'Starfleet',
    body: 'Starfleet builds for roles, not for one-upmanship: science vessels like the Intrepid, torpedo cruisers like the Akira, escorts like the Defiant, and heavy explorers like the Sovereign. A good captain knows which hull the mission needs — and upgrades the systems the mission will stress.',
  },
  {
    title: 'Civilisation on Earth',
    tag: 'Homeworld',
    body: 'Earth is the Federation capital: San Francisco hosts Starfleet Command, Paris the Federation Council. Arcologies, fusion grids, orbital yards and research campuses are built where the geography allows. Population and industry drive the credit base that funds your fleet.',
  },
];
