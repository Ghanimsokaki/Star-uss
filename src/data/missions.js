/**
 * Main story: a gentle chain that teaches every system and ends at the black hole.
 * Only the first unfinished mission is active. `check(state, game)` decides when it
 * is done; optional `progress(state, game)` returns [current, target] for the UI.
 */
/** How many ships of these kinds the captain has destroyed. */
export const killsOf = (s, ...kinds) => kinds.reduce((n, k) => n + (s.stats?.killsBy?.[k] || 0), 0);
const kindsBeaten = (s) => Object.values(s.stats?.killsBy || {}).filter((n) => n > 0).length;

export const MISSIONS = [
  {
    id: 'm-district',
    title: 'Found Your First District',
    desc: 'Open Earth and raise an Arcology District on the globe.',
    hint: 'Earth → Build → Arcology District → tap the globe',
    reward: { credits: 2200 },
    check: (s) => Object.keys(s.ships).length > 0 && s.civ.districts.length > 1,
    progress: (s) => [Math.max(0, s.civ.districts.length - 1), 1],
  },
  {
    id: 'm-upgrade',
    title: 'Refit the Reliant',
    desc: 'Visit the shipyard and upgrade any ship system.',
    hint: 'Shipyard → Upgrades',
    reward: { credits: 1800, research: 40 },
    check: (s) => Object.values(s.ships).some((sh) => Object.values(sh.levels).some((l) => l > 1)),
  },
  {
    id: 'm-survey',
    title: 'Chart a New World',
    desc: 'Fly to the Sol system and survey a planet.',
    hint: 'Galaxy → Sol → Launch → Scan planet',
    reward: { dilithium: 45, research: 60 },
    check: (s) => s.stats.planets >= 1,
    progress: (s) => [s.stats.planets, 1],
  },
  {
    id: 'm-landing',
    title: 'Boots on the Ground',
    desc: 'Fly close to any rocky planet and land the away team on its surface.',
    hint: 'System map → approach a planet → LAND (L)',
    reward: { credits: 1500, research: 50 },
    check: (s) => (s.stats.landings || 0) >= 1,
    progress: (s) => [s.stats.landings || 0, 1],
  },
  {
    id: 'm-moon',
    title: 'One Small Step',
    desc: 'Land on Luna, Earth\u2019s moon, and take a low-gravity jump.',
    hint: 'Sol → fly to Luna beside Sol III → LAND (L) → Space to jump',
    reward: { credits: 2500, research: 120 },
    check: (s) => !!s.landings?.['sol-p2-m0'] && (s.stats.jumps || 0) >= 1,
    progress: (s) => [(s.landings?.['sol-p2-m0'] ? 1 : 0) + ((s.stats.jumps || 0) >= 1 ? 1 : 0), 2],
  },
  {
    id: 'm-contact',
    title: 'First Contact Protocols',
    desc: 'Talk to three people you meet on planetary surfaces.',
    hint: 'On a planet → walk up to someone → TALK (E)',
    reward: { credits: 1800, research: 80 },
    check: (s) => (s.stats.met || 0) >= 3,
    progress: (s) => [s.stats.met || 0, 3],
  },
  {
    id: 'm-hunt',
    title: 'Clear the Patrol',
    desc: 'Destroy two hostile ships anywhere in the sector.',
    hint: 'System map → target hostiles → fire phasers',
    reward: { credits: 3200, dilithium: 25 },
    check: (s) => s.stats.kills >= 2,
    progress: (s) => [s.stats.kills, 2],
  },
  {
    id: 'm-pirates',
    title: 'Pirate Trouble',
    desc: 'Orion Interceptors are raiding cargo ships near home. Destroy three of them.',
    hint: 'They are small, fast and green. Hit them while they turn. Sol and nearby systems.',
    reward: { credits: 3600, dilithium: 30 },
    check: (s) => killsOf(s, 'orion') >= 3,
    progress: (s) => [Math.min(3, killsOf(s, 'orion')), 3],
  },
  {
    id: 'm-convoy',
    title: 'Convoy Escort',
    desc: 'Cargo freighters fly between the planets. When pirates attack one, drive them off before it is destroyed.',
    hint: 'Fly around any system with two or more planets. Watch for the "Freighter under attack" alarm.',
    reward: { credits: 4000, dilithium: 35 },
    check: (s) => (s.stats.escorts || 0) >= 1,
    progress: (s) => [Math.min(1, s.stats.escorts || 0), 1],
  },
  {
    id: 'm-station',
    title: 'Home Among the Stars',
    desc: 'Found your own space station and build three modules on it.',
    hint: 'In any system you have visited, press Y (or the 🛰 Station button), found it, then pick modules and slots.',
    reward: { credits: 6000, research: 200 },
    check: (s) => Object.values(s.stations || {}).some((st) => Object.keys(st.modules || {}).length >= 3),
    progress: (s) => [Math.min(3, Math.max(0, ...Object.values(s.stations || {}).map((st) => Object.keys(st.modules || {}).length))), 3],
  },
  {
    id: 'm-prospect',
    title: 'Prospector\u2019s Luck',
    desc: 'Scan five glowing deposits on planetary surfaces.',
    hint: 'On a planet → walk to a glowing deposit → SCAN (R)',
    reward: { dilithium: 70, credits: 2000 },
    check: (s) => (s.stats.finds || 0) >= 5,
    progress: (s) => [s.stats.finds || 0, 5],
  },
  {
    id: 'm-warp',
    title: 'Leave the Nest',
    desc: 'Warp to a star system beyond Sol.',
    hint: 'Galaxy map → select a system → Engage',
    reward: { credits: 2600, dilithium: 60 },
    check: (s) => s.stats.systems >= 2,
    progress: (s) => [s.stats.systems, 2],
  },
  {
    id: 'm-clear',
    title: 'Secure the Lanes',
    desc: 'Destroy every hostile in a star system to declare it secure.',
    hint: 'Pick a system with a low threat rating and clear it',
    reward: { credits: 4200, research: 120 },
    check: (s) => (s.cleared || []).length >= 1,
    progress: (s) => [(s.cleared || []).length, 1],
  },
  {
    id: 'm-repair',
    title: 'Damage Control',
    desc: 'After a battle, go below decks and repair a damaged system with your own hands.',
    hint: 'Take a hit → I (Go below decks) → walk to the sparking station → hold E',
    reward: { credits: 3000, research: 150 },
    check: (s) => (s.stats.handRepairs || 0) >= 1,
    progress: (s) => [Math.min(1, s.stats.handRepairs || 0), 1],
  },
  {
    id: 'm-science',
    title: 'Science Is a Weapon',
    desc: 'Complete three research projects.',
    hint: 'Earth → Research → spend research points',
    reward: { credits: 5000, research: 200 },
    check: (s) => (s.techs || []).length >= 3,
    progress: (s) => [(s.techs || []).length, 3],
  },
  {
    id: 'm-intrepid',
    title: 'A Longer Reach',
    desc: 'Commission the Intrepid-class U.S.S. Voyager.',
    hint: 'Shipyard → Fleet → Intrepid-class',
    reward: { credits: 9000, research: 150 },
    check: (s) => s.ownedShips.includes('intrepid'),
  },
  {
    id: 'm-anomaly',
    title: 'The Strange Signal',
    desc: 'Scan three anomalies or wrecks for the Daystrom Institute.',
    hint: 'System map → anomaly contacts',
    reward: { research: 500, credits: 5000 },
    check: (s) => s.stats.anomalies >= 3,
    progress: (s) => [s.stats.anomalies, 3],
  },
  {
    id: 'm-voyager',
    title: 'Hello From Earth',
    desc: 'Find NASA\u2019s Voyager 1 drifting in the Sol system and scan it gently.',
    hint: 'Sol → look for the Voyager 1 label → fly close → SCAN (R)',
    reward: { research: 400, credits: 2000 },
    check: (s) => (s.anomalies || []).includes('sol-voyager'),
    progress: (s) => [(s.anomalies || []).includes('sol-voyager') ? 1 : 0, 1],
  },
  {
    id: 'm-diplomacy',
    title: 'Many Flags',
    desc: 'Visit star systems held by four different powers.',
    hint: 'Galaxy map → Federation, Klingon, Romulan, Cardassian, neutral space…',
    reward: { credits: 8000, dilithium: 60, research: 180 },
    check: (s, g) => factionsVisited(s, g) >= 4,
    progress: (s, g) => [factionsVisited(s, g), 4],
  },
  {
    id: 'm-honour',
    title: 'A Matter of Honour',
    desc: 'A Klingon captain has challenged you. Defeat a Vor\u2019cha-class Attack Cruiser in Klingon space.',
    hint: 'Galaxy map → any red Klingon system. Shields up, it hits hard!',
    reward: { credits: 7000, dilithium: 50, research: 150 },
    check: (s) => killsOf(s, 'vorcha') >= 1,
    progress: (s) => [Math.min(1, killsOf(s, 'vorcha')), 1],
  },
  {
    id: 'm-dominion',
    title: 'The Dominion Arrives',
    desc: 'Jem\u2019Hadar Attack Ships are helping the Cardassians. Destroy three of them.',
    hint: 'Galaxy map → yellow Cardassian systems. They come in packs, so keep moving.',
    reward: { credits: 9000, dilithium: 60, research: 200 },
    check: (s) => killsOf(s, 'jemhadar') >= 3,
    progress: (s) => [Math.min(3, killsOf(s, 'jemhadar')), 3],
  },
  {
    id: 'm-elite',
    title: 'Ace Hunter',
    desc: 'Destroy an Elite enemy ship: they are tougher, hit harder and pay double.',
    hint: 'Elite ships have "Elite" in their name. Higher threat systems have more of them.',
    reward: { credits: 8000, research: 250 },
    check: (s) => (s.stats.elites || 0) >= 1,
    progress: (s) => [Math.min(1, s.stats.elites || 0), 1],
  },
  {
    id: 'm-rank',
    title: 'Command Presence',
    desc: 'Earn a promotion to the rank of Commander.',
    hint: 'Every kill, survey, landing and scan earns experience',
    reward: { credits: 10000, research: 250 },
    check: (s) => rankFor(s.xp) >= 5,
    progress: (s) => [Math.min(rankFor(s.xp), 5), 5],
  },
  {
    id: 'm-fleet',
    title: 'Build a Real Fleet',
    desc: 'Expand Earth\u2019s civilisation to six districts.',
    hint: 'Earth → build on the globe',
    reward: { credits: 12000, research: 250 },
    check: (s) => s.civ.districts.length >= 6,
    progress: (s) => [s.civ.districts.length, 6],
  },
  {
    id: 'm-enterprise',
    title: 'The Legend Herself',
    desc: 'Commission the Constitution-class U.S.S. Enterprise, NCC-1701.',
    hint: 'Shipyard → Fleet → Constitution-class',
    reward: { credits: 7500, research: 120, dilithium: 40 },
    // lenient on old saves: any hull of the Enterprise's tier or above counts
    check: (s) => s.ownedShips.some((id) => ['constitution', 'akira', 'defiant', 'sovereign', 'prometheus'].includes(id)),
  },
  {
    id: 'm-hunted',
    title: 'The Hunters Become the Hunted',
    desc: 'A Hirogen Venatic Hunter is stalking Federation ships. Find it and destroy it.',
    hint: 'Hirogen hunt in dangerous neutral and Federation systems (threat 4 or more) and deep in Romulan space.',
    reward: { credits: 12000, dilithium: 70, research: 300 },
    check: (s) => killsOf(s, 'hunter') >= 1,
    progress: (s) => [Math.min(1, killsOf(s, 'hunter')), 1],
  },
  {
    id: 'm-sphere',
    title: 'Scout of the Collective',
    desc: 'A Borg Sphere is scouting ahead of the Cube. Destroy it before it learns too much.',
    hint: 'Borg space (green, threat 8). Its shields adapt, so switch between phasers and torpedoes!',
    reward: { credits: 20000, dilithium: 120, research: 500 },
    check: (s) => killsOf(s, 'sphere', 'cube') >= 1,
    progress: (s) => [Math.min(1, killsOf(s, 'sphere', 'cube')), 1],
  },
  {
    id: 'm-blackhole',
    title: 'The Black Cluster',
    desc: 'Travel to the Black Cluster and face what waits there.',
    hint: 'Galaxy map → The Black Cluster (north-west)',
    reward: { credits: 15000, dilithium: 120, research: 400 },
    check: (s) => s.flags.blackholeEntered,
  },
  {
    id: 'm-singularity',
    title: 'Physics of the Abyss',
    desc: 'Research Singularity Physics so your ship can survive the Vela Singularity.',
    hint: 'Earth → Research → Singularity Physics',
    reward: { credits: 12000, dilithium: 100 },
    check: (s) => (s.techs || []).includes('singularity'),
    progress: (s) => [(s.techs || []).includes('singularity') ? 1 : 0, 1],
  },
  {
    id: 'm-wraiths',
    title: 'Shadows at the Edge',
    desc: 'Void Wraiths guard the way to the Singularity. Destroy two of them.',
    hint: 'Vela Singularity. Wraiths are fast and can turn invisible, so watch for them decloaking.',
    reward: { credits: 18000, dilithium: 150, research: 600 },
    check: (s) => killsOf(s, 'wraith') >= 2,
    progress: (s) => [Math.min(2, killsOf(s, 'wraith')), 2],
  },
  {
    id: 'm-boss',
    title: 'Silence the Void',
    desc: 'Destroy the Void Dreadnought at the Vela Singularity.',
    hint: 'Research Singularity Physics, then travel to Vela',
    reward: { credits: 60000, research: 1500 },
    check: (s) => s.flags.bossDefeated,
  },
  {
    id: 'm-enterprise-d',
    title: 'All Good Things',
    desc: 'Commission a Galaxy-class starship \u2014 the Enterprise-D\u2019s hull.',
    hint: 'Shipyard \u2192 Fleet \u2192 Galaxy-class',
    reward: { credits: 26000, research: 400, dilithium: 80 },
    check: (s) => s.ownedShips.some((id) => ['galaxy', 'prometheus', 'odyssey'].includes(id)),
  },
  {
    id: 'm-flagship',
    title: 'A Name Worth Carrying',
    desc: 'Take command of the Odyssey-class U.S.S. Enterprise-F.',
    hint: 'Research seven technologies, reach rank 12, then buy the Odyssey-class',
    reward: { credits: 80000, research: 2000, dilithium: 200 },
    check: (s) => s.ownedShips.includes('odyssey'),
  },
];


/** How many different powers' systems the captain has visited. */
export function factionsVisited(s, g) {
  if (!g?.galaxy) return 0;
  const set = new Set();
  for (const id of s.visited || []) {
    const f = g.galaxy.byId[id]?.faction;
    if (f) set.add(f);
  }
  return set.size;
}

const count = (get, target) => ({
  check: (s, g) => get(s, g) >= target,
  progress: (s, g) => [Math.min(get(s, g), target), target],
});

/**
 * Starfleet contracts: optional side quests that all run in parallel with the
 * main story. Each one pays out once, the moment its target is reached.
 */
export const CONTRACTS = [
  { id: 'c-bounty', title: 'Bounty Hunter', desc: 'Destroy 10 hostile ships.', reward: { credits: 6000, dilithium: 40 }, ...count((s) => s.stats.kills, 10) },
  { id: 'c-ace', title: 'Ace of the Fleet', desc: 'Destroy 40 hostile ships.', reward: { credits: 25000, research: 400 }, ...count((s) => s.stats.kills, 40) },
  { id: 'c-cartographer', title: 'Stellar Cartographer', desc: 'Visit 10 different star systems.', reward: { credits: 9000, dilithium: 90 }, ...count((s) => (s.visited || []).length, 10) },
  { id: 'c-explorer', title: 'Where No One Has Gone', desc: 'Visit 25 different star systems.', reward: { credits: 30000, research: 600 }, ...count((s) => (s.visited || []).length, 25) },
  { id: 'c-surveyor', title: 'Survey Corps', desc: 'Survey 8 planets from orbit.', reward: { research: 260, dilithium: 50 }, ...count((s) => s.stats.planets, 8) },
  { id: 'c-lander', title: 'Away Team Veteran', desc: 'Land on 6 different planets.', reward: { credits: 8000, research: 200 }, ...count((s) => s.stats.landings || 0, 6) },
  { id: 'c-xeno', title: 'Xenoanthropologist', desc: 'Talk to 12 people across the galaxy.', reward: { research: 450, credits: 4000 }, ...count((s) => s.stats.met || 0, 12) },
  { id: 'c-salvage', title: 'Salvage Rights', desc: 'Scan 15 surface deposits.', reward: { dilithium: 140, credits: 7000 }, ...count((s) => s.stats.finds || 0, 15) },
  { id: 'c-daystrom', title: 'Daystrom Fellowship', desc: 'Scan 8 anomalies or wrecks.', reward: { research: 900 }, ...count((s) => s.stats.anomalies, 8) },
  { id: 'c-peace', title: 'Peacekeeper', desc: 'Secure 5 star systems by clearing every hostile.', reward: { credits: 20000, research: 300 }, ...count((s) => (s.cleared || []).length, 5) },
  { id: 'c-hauler', title: 'Long Hauler', desc: 'Make 20 warp jumps.', reward: { dilithium: 160 }, ...count((s) => s.stats.warps || 0, 20) },
  { id: 'c-metropolis', title: 'Metropolis', desc: 'Grow Earth to 12 districts.', reward: { credits: 22000, research: 300 }, ...count((s) => s.civ.districts.length, 12) },
  { id: 'c-collector', title: 'Fleet Collector', desc: 'Own 5 starships.', reward: { credits: 15000, research: 250 }, ...count((s) => (s.ownedShips || []).length, 5) },
  { id: 'c-refit', title: 'Fully Refitted', desc: 'Raise every system on one ship to level 3.', reward: { credits: 9000, research: 150 },
    ...count((s) => Math.max(0, ...Object.values(s.ships || {}).map((sh) => Math.min(...Object.values(sh.levels || { a: 1 })))), 3) },
  { id: 'c-scholar', title: 'Academy Scholar', desc: 'Complete 8 research projects.', reward: { credits: 18000, dilithium: 80 }, ...count((s) => (s.techs || []).length, 8) },
  { id: 'c-shipwright', title: 'Shipwright', desc: 'Design and commission your own starship.', reward: { credits: 5000, research: 150 }, ...count((s) => s.stats.designs || 0, 1) },
  { id: 'c-damage-control', title: 'Damage Control', desc: 'Repair 5 damaged ship systems.', reward: { credits: 6000, research: 200 }, ...count((s) => s.stats.repairs || 0, 5) },
  { id: 'c-moonwalker', title: 'Moonwalker', desc: 'Land on 5 different moons.', reward: { credits: 9000, research: 300 }, ...count((s) => Object.keys(s.landings || {}).filter((k) => /-m\d+$/.test(k)).length, 5) },
  { id: 'c-jumper', title: 'Kangaroo Captain', desc: 'Jump 50 times on planet and moon surfaces.', reward: { credits: 3000, dilithium: 30 }, ...count((s) => s.stats.jumps || 0, 50) },
  { id: 'c-hands-on', title: 'Chief Engineer', desc: 'Repair 10 damaged systems by hand, below decks.', reward: { credits: 12000, research: 400 }, ...count((s) => s.stats.handRepairs || 0, 10) },
  { id: 'c-streak', title: 'Unstoppable', desc: 'Reach a 5-kill streak in one battle.', reward: { credits: 10000, dilithium: 60 }, ...count((s) => s.stats.bestStreak || 0, 5) },
  { id: 'c-phoenix', title: 'Phoenix', desc: 'Lose a ship in battle — and come back for more.', reward: { credits: 3000, research: 100 }, ...count((s) => s.stats.deaths || 0, 1) },
  { id: 'c-diplomat', title: 'Galactic Diplomat', desc: 'Visit systems held by six different powers.', reward: { credits: 16000, research: 500 }, ...count((s, g) => factionsVisited(s, g), 6) },
  { id: 'c-orion-bounty', title: 'Syndicate Bounty', desc: 'Destroy 10 Orion Interceptors.', reward: { credits: 7000, dilithium: 40 }, ...count((s) => killsOf(s, 'orion'), 10) },
  { id: 'c-klingon', title: 'Blood Oath', desc: 'Destroy 6 Klingon ships (Birds-of-Prey or Vor\u2019chas).', reward: { credits: 12000, dilithium: 70 }, ...count((s) => killsOf(s, 'bop', 'vorcha'), 6) },
  { id: 'c-cardassian', title: 'Border Patrol', desc: 'Destroy 6 Cardassian or Dominion ships.', reward: { credits: 14000, research: 300 }, ...count((s) => killsOf(s, 'galor', 'jemhadar'), 6) },
  { id: 'c-romulan', title: 'Cloak and Dagger', desc: 'Destroy 3 Romulan Warbirds.', reward: { credits: 18000, research: 450 }, ...count((s) => killsOf(s, 'warbird'), 3) },
  { id: 'c-hirogen', title: 'Trophy Room', desc: 'Destroy 3 Hirogen Hunters.', reward: { credits: 20000, dilithium: 120 }, ...count((s) => killsOf(s, 'hunter'), 3) },
  { id: 'c-borg', title: 'Resistance Is Not Futile', desc: 'Destroy 3 Borg ships (Spheres or Cubes).', reward: { credits: 40000, research: 1000 }, ...count((s) => killsOf(s, 'sphere', 'cube'), 3) },
  { id: 'c-void', title: 'Into the Dark', desc: 'Destroy 6 Void ships (Reavers or Wraiths).', reward: { credits: 36000, dilithium: 300 }, ...count((s) => killsOf(s, 'void', 'wraith'), 6) },
  { id: 'c-elite', title: 'Elite Squadron', desc: 'Destroy 5 Elite enemy ships.', reward: { credits: 22000, research: 500 }, ...count((s) => s.stats.elites || 0, 5) },
  { id: 'c-know-enemy', title: 'Know Your Enemy', desc: 'Destroy 8 different kinds of enemy ship.', reward: { credits: 25000, research: 800, dilithium: 100 }, ...count((s) => kindsBeaten(s), 8) },
  { id: 'c-legend', title: 'Living Legend', desc: 'Destroy 100 hostile ships.', reward: { credits: 60000, research: 1500, dilithium: 250 }, ...count((s) => s.stats.kills, 100) },
  { id: 'c-convoy', title: 'Convoy Guardian', desc: 'Save 10 freighters from pirates.', reward: { credits: 15000, dilithium: 120 }, ...count((s) => s.stats.escorts || 0, 10) },
  { id: 'c-station-full', title: 'Fully Loaded', desc: 'Fill all 12 slots on one of your stations.', reward: { credits: 20000, research: 600 }, ...count((s) => Math.max(0, ...Object.values(s.stations || {}).map((st) => Object.keys(st.modules || {}).length)), 12) },
  { id: 'c-station-net', title: 'Station Network', desc: 'Run stations in 3 different systems.', reward: { credits: 25000, research: 800, dilithium: 150 }, ...count((s) => Object.keys(s.stations || {}).length, 3) },
  { id: 'c-tycoon', title: 'Tycoon', desc: 'Earn ₡250,000 over your career.', reward: { research: 1200, dilithium: 120 }, ...count((s) => Math.floor(s.stats.creditsEarned || 0), 250000) },
];

export const RANK_TITLES = [
  'Ensign', 'Lieutenant (JG)', 'Lieutenant', 'Lt. Commander', 'Commander',
  'Captain', 'Fleet Captain', 'Commodore', 'Rear Admiral', 'Vice Admiral',
  'Admiral', 'Fleet Admiral',
];
export const RANK_XP = [0, 500, 1400, 3000, 5400, 8800, 13500, 19500, 27500, 38000, 52000, 72000, 98000];

export function rankFor(xp) {
  let r = 1;
  for (let i = 0; i < RANK_XP.length; i++) if (xp >= RANK_XP[i]) r = i + 1;
  return Math.min(r, RANK_TITLES.length);
}
export function nextRankXp(rank) {
  return RANK_XP[rank] ?? RANK_XP[RANK_XP.length - 1];
}
