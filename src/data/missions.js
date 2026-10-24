/** A gentle mission chain that teaches every system and ends at the black hole. */
export const MISSIONS = [
  {
    id: 'm-district',
    title: 'Found Your First District',
    desc: 'Open Earth and raise an Arcology District on the globe.',
    hint: 'Earth → Build → Arcology District → tap the globe',
    reward: { credits: 2200 },
    check: (s) => Object.keys(s.ships).length > 0 && s.civ.districts.length > 1,
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
  },
  {
    id: 'm-hunt',
    title: 'Clear the Patrol',
    desc: 'Destroy two hostile ships anywhere in the sector.',
    hint: 'System map → target hostiles → fire phasers',
    reward: { credits: 3200, dilithium: 25 },
    check: (s) => s.stats.kills >= 2,
  },
  {
    id: 'm-warp',
    title: 'Leave the Nest',
    desc: 'Warp to a star system beyond Sol.',
    hint: 'Galaxy map → select a system → Engage',
    reward: { credits: 2600, dilithium: 60 },
    check: (s) => s.stats.systems >= 2,
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
  },
  {
    id: 'm-fleet',
    title: 'Build a Real Fleet',
    desc: 'Expand Earth\u2019s civilisation to six districts.',
    hint: 'Earth → build on the globe',
    reward: { credits: 12000, research: 250 },
    check: (s) => s.civ.districts.length >= 6,
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
    id: 'm-boss',
    title: 'Silence the Void',
    desc: 'Destroy the Void Dreadnought at the Vela Singularity.',
    hint: 'Research Singularity Physics, then travel to Vela',
    reward: { credits: 60000, research: 1500 },
    check: (s) => s.flags.bossDefeated,
  },
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
