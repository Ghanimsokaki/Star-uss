import { SHIP_CLASSES, SHIP_ORDER, UPGRADE_ORDER, MAX_UPGRADE, computeStats, moduleCost, PALETTES } from './data/ships.js';
import { DISTRICTS, DISTRICT_ORDER, TECHS, districtUpgradeCost } from './data/tech.js';
import { buildGalaxy, planetById, surveyPlanet, warpCost } from './data/galaxy.js';
import { MISSIONS, RANK_TITLES, rankFor, nextRankXp } from './data/missions.js';
import { storage, uid, clamp } from './core/util.js';

const SAVE_KEY = 'startrek.ascension.save.v1';
const SAVE_VERSION = 4;

function defaultLevels() {
  return { hull: 1, shields: 1, weapons: 1, engines: 1, sensors: 1 };
}

export function makeShipRecord(classId) {
  const cls = SHIP_CLASSES[classId];
  const pal = PALETTES[0];
  return {
    levels: defaultLevels(),
    palette: pal.id,
    nacelle: PALETTES[0].accent,
    deflector: '#5ab7ff',
    name: cls.hullName,
    registry: cls.registry,
    kills: 0,
  };
}

export function newGameState(seed = 'alpha') {
  const ships = {};
  ships.miranda = makeShipRecord('miranda');
  return {
    version: SAVE_VERSION,
    seed,
    createdAt: Date.now(),
    lastSave: Date.now(),
    playtime: 0,
    credits: 6500,
    dilithium: 140,
    research: 0,
    xp: 0,
    shipId: 'miranda',
    ownedShips: ['miranda'],
    ships,
    civ: {
      name: 'United Earth',
      population: 4.2e9,
      districts: [{ id: uid(), type: 'capital', lat: 37.77, lon: -122.42, level: 1 }],
    },
    currentSystemId: 'sol',
    discovered: ['sol'],
    visited: ['sol'],
    cleared: [],
    surveyed: [],
    anomalies: [],
    techs: [],
    missionsDone: [],
    stats: { kills: 0, planets: 0, systems: 1, anomalies: 0, creditsEarned: 0, warps: 0, deaths: 0, boss: 0 },
    // autoFire is OFF: the weapons are the player's to pull. It stays a settings
    // toggle for anyone who wants the old hands-free behaviour.
    settings: { quality: 'auto', muted: false, autoFire: false, aimAssist: true, invertY: false, controls: 'auto' },
    flags: { blackholeEntered: false, bossDefeated: false, introSeen: false, capitalPlaced: true },
    log: [],
  };
}

class EventBus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.map.get(evt)?.delete(fn);
  }
  emit(evt, data) { this.map.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }
}

export class Game {
  constructor() {
    this.bus = new EventBus();
    this.state = newGameState();
    this.galaxy = buildGalaxy(this.state.seed);
    this._saveTimer = null;
    this._incomeAcc = { credits: 0, research: 0 };
    this.loaded = false;
  }

  /* ------------------------------------------------------------ persistence */
  static hasSave() {
    const s = storage.get(SAVE_KEY);
    return !!(s && s.version >= 1 && s.credits != null);
  }

  /** Settings as stored on disk, before `load()` has run (used at boot). */
  static storedSettings() {
    const s = storage.get(SAVE_KEY);
    return s?.settings && typeof s.settings === 'object' ? s.settings : null;
  }

  load() {
    const s = storage.get(SAVE_KEY);
    if (!s) return false;
    const savedVersion = Number(s.version) || 1;
    const fresh = newGameState(s.seed || 'alpha');
    this.state = { ...fresh, ...s, stats: { ...fresh.stats, ...(s.stats || {}) }, settings: { ...fresh.settings, ...(s.settings || {}) }, flags: { ...fresh.flags, ...(s.flags || {}) }, civ: { ...fresh.civ, ...(s.civ || {}) } };
    // v4: phasers used to fire hands-free by default, which read as the ship
    // shooting on its own. One-time migration — an explicit "On" afterwards sticks.
    if (savedVersion < 4) this.state.settings.autoFire = false;
    this.state.version = SAVE_VERSION;
    // guarantee a capital exists
    if (!this.state.civ.districts?.length) this.state.civ.districts = fresh.civ.districts;
    if (!this.state.ships || !Object.keys(this.state.ships).length) {
      this.state.ships = { miranda: makeShipRecord('miranda') };
      this.state.ownedShips = ['miranda'];
      this.state.shipId = 'miranda';
    }
    // migrate older ship records so every system has a level
    for (const id of Object.keys(this.state.ships)) {
      const rec = this.state.ships[id];
      rec.levels = { ...defaultLevels(), ...(rec.levels || {}) };
      if (!rec.name) rec.name = SHIP_CLASSES[id]?.hullName || 'Starship';
      if (!rec.registry) rec.registry = SHIP_CLASSES[id]?.registry || 'NCC-0000';
      if (!rec.palette) rec.palette = PALETTES[0].id;
      if (!rec.nacelle) rec.nacelle = PALETTES[0].accent;
      if (!rec.deflector) rec.deflector = '#5ab7ff';
    }
    this.galaxy = buildGalaxy(this.state.seed);
    // offline progression — half rate, capped at six hours
    const away = clamp((Date.now() - (s.lastSave || Date.now())) / 1000, 0, 4 * 3600);
    if (away > 120) {
      const inc = this.income();
      const gainCredits = Math.min(250000, Math.round(inc.credits * away * 0.35));
      const gainResearch = Math.min(25000, Math.round(inc.research * away * 0.35));
      this.state.credits += gainCredits;
      this.state.research += gainResearch;
      this.offlineReport = { away, credits: gainCredits, research: gainResearch };
    }
    this.loaded = true;
    this.bus.emit('change');
    return true;
  }

  save(force = false) {
    this.state.lastSave = Date.now();
    storage.set(SAVE_KEY, this.state);
    if (force) this.bus.emit('saved');
  }
  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.save(); }, 1500);
  }
  reset() {
    storage.del(SAVE_KEY);
    this.state = newGameState();
    this.galaxy = buildGalaxy(this.state.seed);
    this.bus.emit('change');
  }

  /* ------------------------------------------------------------ helpers */
  get shipClass() { return SHIP_CLASSES[this.state.shipId] || SHIP_CLASSES.miranda; }
  get shipRecord() { return this.state.ships[this.state.shipId] || (this.state.ships[this.state.shipId] = makeShipRecord(this.state.shipId)); }
  get techSet() { return new Set(this.state.techs); }
  get rank() { return rankFor(this.state.xp); }
  get rankTitle() { return RANK_TITLES[this.rank - 1] || 'Ensign'; }
  get nextRank() { return nextRankXp(this.rank); }
  get stats() { return computeStats(this.state.shipId, this.shipRecord.levels, this.techSet); }
  get system() { return this.galaxy.byId[this.state.currentSystemId] || this.galaxy.byId.sol; }
  get sol() { return this.galaxy.byId.sol; }

  statsFor(classId) {
    const rec = this.state.ships[classId] || makeShipRecord(classId);
    return computeStats(classId, rec.levels, this.techSet);
  }

  hasTech(id) { return this.state.techs.includes(id); }
  techCount() { return this.state.techs.length; }

  shipPrice(classId) {
    const cls = SHIP_CLASSES[classId];
    let p = cls.cost;
    if (this.hasTech('orbitalYards')) p *= 0.85;
    const yard = this.state.civ.districts.filter((d) => d.type === 'shipyard').reduce((a, d) => a + d.level * 0.04, 0);
    p *= Math.max(0.55, 1 - yard);
    return Math.round(p);
  }

  /* ------------------------------------------------------------ civilisation */
  civStats() {
    let popCap = 8e9;
    let growth = 0.00006;
    let creditMul = 1;
    let credits = 0;
    let research = 0;
    let defense = 0;
    let shipDiscount = 0;
    let repair = 0;
    let popCapBonus = 0;
    for (const d of this.state.civ.districts) {
      const def = DISTRICTS[d.type];
      if (!def) continue;
      const y = def.yield(d.level);
      credits += y.credits;
      research += y.research;
      popCap += (def.popCap || 0) * d.level * 1e9;
      const sp = def.special ? def.special(d.level) : null;
      if (sp) {
        creditMul += sp.creditMul || 0;
        defense += sp.defense || 0;
        shipDiscount += sp.shipDiscount || 0;
        repair += sp.repair || 0;
        growth += (sp.growth || 0) * 0.00007;
      }
      if (d.type === 'capital') popCapBonus += d.level * 1e9;
    }
    popCap += popCapBonus;
    if (this.hasTech('replicator')) creditMul += 0.2;
    if (this.hasTech('terraforming')) { growth *= 1.5; popCap += 1e9; }
    const popFactor = 1 + Math.min(1.6, this.state.civ.population / 22e9);
    const income = credits * creditMul * popFactor;
    const researchRate = research * (this.hasTech('sensorNet') ? 1.15 : 1);
    return {
      income, researchRate, popCap, growth, creditMul, defense, shipDiscount, repair,
      population: this.state.civ.population,
      districts: this.state.civ.districts.length,
      morale: clamp(0.7 + defense * 0.03 + this.state.civ.population / 60e9, 0.7, 1.25),
    };
  }

  districtCost(type) {
    const def = DISTRICTS[type];
    if (!def) return Infinity;
    const count = this.state.civ.districts.length;
    return Math.round((def.cost || 0) * (1 + count * 0.16));
  }

  canBuildDistrict(type) {
    const def = DISTRICTS[type];
    if (!def) return { ok: false, why: 'Unknown district' };
    if (def.unique && this.state.civ.districts.some((d) => d.type === type)) return { ok: false, why: 'Already built — upgrade it instead' };
    if (this.state.civ.districts.length >= 22) return { ok: false, why: 'Earth is at capacity (22 districts)' };
    const cost = this.districtCost(type);
    if (this.state.credits < cost) return { ok: false, why: `Needs ₡${cost.toLocaleString()}` };
    return { ok: true, cost };
  }

  buildDistrict(type, lat, lon) {
    const check = this.canBuildDistrict(type);
    if (!check.ok) return check;
    this.state.credits -= check.cost;
    const d = { id: uid(), type, lat: clamp(lat, -85, 85), lon, level: 1 };
    this.state.civ.districts.push(d);
    this.state.civ.population = Math.max(this.state.civ.population, 4.2e9);
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true, district: d };
  }

  upgradeDistrict(id) {
    const d = this.state.civ.districts.find((x) => x.id === id);
    if (!d) return { ok: false };
    const def = DISTRICTS[d.type];
    if (!def) return { ok: false };
    if (d.level >= def.maxLevel) return { ok: false, why: 'Maximum level reached' };
    const cost = districtUpgradeCost(d.type, d.level + 1);
    if (this.state.credits < cost) return { ok: false, why: `Needs ₡${cost.toLocaleString()}` };
    this.state.credits -= cost;
    d.level++;
    this.save(true);
    this.bus.emit('change');
    return { ok: true, cost };
  }

  renameCiv(name) {
    this.state.civ.name = String(name).slice(0, 28) || 'United Earth';
    this.save(true);
    this.bus.emit('change');
  }

  /* ------------------------------------------------------------ economy tick */
  income() {
    const c = this.civStats();
    return { credits: c.income, research: c.researchRate, growth: c.growth };
  }

  tick(dt) {
    const civ = this.civStats();
    this.state.playtime += dt;
    this.state.credits += civ.income * dt;
    this.state.research += civ.researchRate * dt;
    if (this.state.civ.population < civ.popCap) {
      this.state.civ.population = Math.min(civ.popCap, this.state.civ.population * (1 + civ.growth * dt));
    }
    this.state.stats.creditsEarned += civ.income * dt;
  }

  /* ------------------------------------------------------------ ships & upgrades */
  moduleLevel(system) { return this.shipRecord.levels[system] || 1; }
  moduleCost(system) { return moduleCost(this.shipClass, system, this.moduleLevel(system)); }
  upgradeModule(system) {
    const lvl = this.moduleLevel(system);
    if (lvl >= MAX_UPGRADE) return { ok: false, why: 'System at maximum level' };
    const cost = this.moduleCost(system);
    if (this.state.credits < cost) return { ok: false, why: `Needs ₡${cost.toLocaleString()}` };
    this.state.credits -= cost;
    this.shipRecord.levels[system] = lvl + 1;
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true, cost };
  }

  shipUnlock(classId) {
    const cls = SHIP_CLASSES[classId];
    if (this.state.ownedShips.includes(classId)) return { ok: true, owned: true };
    if (this.rank < cls.rankReq) return { ok: false, why: `Requires rank ${cls.rankReq} (${RANK_TITLES[cls.rankReq - 1]})` };
    if (cls.researchReq && this.techCount() < cls.researchReq) return { ok: false, why: `Requires ${cls.researchReq} researched technologies` };
    const price = this.shipPrice(classId);
    if (this.state.credits < price) return { ok: false, why: `Needs ₡${price.toLocaleString()}` };
    this.state.credits -= price;
    this.state.ownedShips.push(classId);
    this.state.ships[classId] = makeShipRecord(classId);
    this.state.shipId = classId;
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true, price };
  }

  selectShip(classId) {
    if (!this.state.ownedShips.includes(classId)) return { ok: false };
    this.state.shipId = classId;
    this.save(true);
    this.bus.emit('change');
    return { ok: true };
  }

  customize(patch) {
    const rec = this.shipRecord;
    if (patch.palette !== undefined) rec.palette = patch.palette;
    if (patch.nacelle !== undefined) rec.nacelle = patch.nacelle;
    if (patch.deflector !== undefined) rec.deflector = patch.deflector;
    if (patch.name !== undefined) rec.name = String(patch.name).slice(0, 26) || this.shipClass.hullName;
    if (patch.registry !== undefined) rec.registry = String(patch.registry).toUpperCase().slice(0, 14) || this.shipClass.registry;
    this.save(true);
    this.bus.emit('customize');
    return { ok: true };
  }

  repairCost() {
    return Math.round(this.stats.hull * 0.08);
  }
  repairShip() {
    const cost = this.repairCost();
    if (this.state.credits < cost) return { ok: false, why: `Needs ₡${cost}` };
    this.state.credits -= cost;
    this.save(true);
    this.bus.emit('change');
    return { ok: true };
  }

  /* ------------------------------------------------------------ research */
  canResearch(id) {
    const t = TECHS[id];
    if (!t) return { ok: false };
    if (this.hasTech(id)) return { ok: false, why: 'Already researched' };
    if (t.requires && !t.requires.every((r) => this.hasTech(r))) {
      const missing = t.requires.filter((r) => !this.hasTech(r)).map((r) => TECHS[r]?.name || r);
      return { ok: false, why: `Requires: ${missing.join(', ')}` };
    }
    if (this.state.research < t.cost) return { ok: false, why: `Needs ${t.cost.toLocaleString()} research` };
    return { ok: true };
  }

  research(id) {
    const check = this.canResearch(id);
    if (!check.ok) return check;
    this.state.research -= TECHS[id].cost;
    this.state.techs.push(id);
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true };
  }

  /* ------------------------------------------------------------ travel */
  warpCostTo(systemId) {
    const sys = this.galaxy.byId[systemId];
    if (!sys) return 0;
    let c = warpCost(this.system, sys);
    if (this.hasTech('slipstream')) c = Math.round(c * 0.65);
    return Math.max(4, c);
  }

  canWarpTo(systemId) {
    const sys = this.galaxy.byId[systemId];
    if (!sys) return { ok: false, why: 'No such system' };
    if (sys.id === this.state.currentSystemId) return { ok: false, why: 'Already in this system' };
    if (sys.boss && !this.hasTech('singularity')) return { ok: false, why: 'Requires Singularity Physics research' };
    const cost = this.warpCostTo(systemId);
    if (this.state.dilithium < cost) return { ok: false, why: `Needs ${cost} dilithium — refine more or synthesise it` };
    return { ok: true, cost };
  }

  warpTo(systemId) {
    const check = this.canWarpTo(systemId);
    if (!check.ok) return check;
    this.state.dilithium -= check.cost;
    this.state.currentSystemId = systemId;
    this.state.stats.warps++;
    if (!this.state.discovered.includes(systemId)) this.state.discovered.push(systemId);
    if (!this.state.visited.includes(systemId)) {
      this.state.visited.push(systemId);
      this.state.stats.systems = this.state.visited.length;
    }
    if (this.galaxy.byId[systemId].blackhole) this.state.flags.blackholeEntered = true;
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true, cost: check.cost };
  }

  buyDilithium(amount = 20) {
    const cost = amount * 320;
    if (this.state.credits < cost) return { ok: false, why: `Needs ₡${cost.toLocaleString()}` };
    this.state.credits -= cost;
    this.state.dilithium += amount;
    this.save(true);
    this.bus.emit('change');
    return { ok: true };
  }

  /* ------------------------------------------------------------ exploration & combat rewards */
  isSurveyed(planetId) { return this.state.surveyed.includes(planetId); }

  survey(planetId) {
    if (this.isSurveyed(planetId)) return { ok: false, why: 'Already surveyed' };
    const found = planetById(this.galaxy, planetId);
    if (!found) return { ok: false, why: 'Unknown planet' };
    const { system, planet } = found;
    const result = surveyPlanet(planet, system);
    let credits = result.credits;
    let dilithium = result.dilithium;
    let research = result.research;
    for (const b of result.bonus) {
      credits += b.credits || 0;
      dilithium += b.dilithium || 0;
      research += b.research || 0;
    }
    credits = Math.round(credits * (this.stats.sensor > 1.3 ? 1.1 : 1));
    if (this.hasTech('sensorNet')) research = Math.round(research * 1.2);
    this.state.credits += credits;
    this.state.dilithium += dilithium;
    this.state.research += research;
    this.state.surveyed.push(planetId);
    this.state.stats.planets++;
    this.state.stats.creditsEarned += credits;
    this.addXp(result.xp);
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true, result, rewards: { credits, dilithium, research, xp: result.xp } };
  }

  scanAnomaly(anomalyId) {
    if (this.state.anomalies.includes(anomalyId)) return { ok: false, why: 'Already catalogued' };
    const sys = this.system;
    const anomaly = (sys.anomalies || []).find((a) => a.id === anomalyId);
    if (!anomaly) return { ok: false, why: 'Contact lost' };
    this.state.anomalies.push(anomalyId);
    const r = anomaly.rewards || { research: 50 };
    const credits = Math.round((r.credits || 0) * (1 + this.rank * 0.06));
    this.state.credits += credits;
    this.state.dilithium += r.dilithium || 0;
    this.state.research += r.research || 0;
    this.state.stats.anomalies++;
    this.state.stats.creditsEarned += credits;
    this.addXp(r.xp || 30);
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return { ok: true, anomaly, rewards: { ...r, credits } };
  }

  recordKill(enemy) {
    const r = enemy.reward || { credits: 100, dilithium: 5, xp: 20 };
    this.state.credits += r.credits;
    this.state.dilithium += r.dilithium;
    this.state.stats.creditsEarned += r.credits;
    this.state.stats.kills++;
    this.shipRecord.kills = (this.shipRecord.kills || 0) + 1;
    this.addXp(r.xp);
    if (enemy.kind === 'voidlord') {
      this.state.flags.bossDefeated = true;
      this.state.stats.boss++;
      this.state.credits += 30000;
      this.state.research += 1500;
    }
    this.save(true);
    this.bus.emit('change');
    this.checkMissions();
    return r;
  }

  recordClear(systemId) {
    if (this.state.cleared.includes(systemId)) return null;
    this.state.cleared.push(systemId);
    const bonus = { credits: 1200 + (this.galaxy.byId[systemId]?.threat || 1) * 350, research: 60 };
    this.state.credits += bonus.credits;
    this.state.research += bonus.research;
    this.save(true);
    this.bus.emit('change');
    return bonus;
  }

  addXp(amount) {
    const before = this.rank;
    this.state.xp += Math.max(0, Math.round(amount));
    const after = this.rank;
    if (after > before) {
      this.bus.emit('rankup', { rank: after, title: RANK_TITLES[after - 1], prev: before });
    }
    this.bus.emit('change');
  }

  addCredits(amount) {
    this.state.credits += amount;
    this.state.stats.creditsEarned += Math.max(0, amount);
    this.bus.emit('change');
  }
  spendCredits(amount) {
    if (this.state.credits < amount) return false;
    this.state.credits -= amount;
    this.bus.emit('change');
    return true;
  }
  addDilithium(n) { this.state.dilithium += n; this.bus.emit('change'); }
  addResearch(n) { this.state.research = Math.max(0, this.state.research + n); this.bus.emit('change'); }

  /* ------------------------------------------------------------ missions */
  get currentMission() {
    const done = new Set(this.state.missionsDone);
    return MISSIONS.find((m) => !done.has(m.id)) || null;
  }

  checkMissions() {
    let guard = 0;
    while (guard++ < 12) {
      const m = this.currentMission;
      if (!m) return;
      let ok = false;
      try { ok = m.check(this.state); } catch (e) { ok = false; }
      if (!ok) return;
      this.state.missionsDone.push(m.id);
      const r = m.reward || {};
      if (r.credits) this.state.credits += r.credits;
      if (r.dilithium) this.state.dilithium += r.dilithium;
      if (r.research) this.state.research += r.research;
      this.save();
      this.bus.emit('mission', { mission: m, reward: r });
      this.bus.emit('change');
    }
  }

  /* ------------------------------------------------------------ galaxy flavours */
  anomaliesFor(systemId) {
    const sys = this.galaxy.byId[systemId];
    if (!sys) return [];
    if (sys.anomalies) return sys.anomalies;
    // deterministic per-system anomaly set
    const seedNum = (sys.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 7919) % 9973;
    const rng = (n) => ((Math.sin(seedNum * (n + 1.7)) * 10000) % 1 + 1) % 1;
    const count = sys.blackhole ? 2 : 1 + Math.floor(rng(1) * 2.4);
    sys.anomalies = [];
    const pool = ['rift', 'derelict', 'probe', 'grav', 'tachyon', 'wreck', 'wormhole'];
    for (let i = 0; i < count; i++) {
      const id = pool[Math.floor(rng(i + 3) * pool.length) % pool.length];
      const templates = {
        rift: { name: 'Subspace Rift', color: '#b47bff', rewards: { research: 80, credits: 300 }, text: 'A tear in the subspace manifold crackles with violet energy. Your science officer logs eleven new particle types before it collapses.' },
        derelict: { name: 'Derelict Hulk', color: '#9fb4c8', rewards: { credits: 700, dilithium: 32, research: 45 }, text: 'A dead freighter tumbles slowly, hull pitted by micrometeorites. Salvage teams recover cargo from a century-old manifest.' },
        probe: { name: 'Ancient Probe', color: '#ffd36b', rewards: { research: 140, credits: 240 }, text: 'A probe of unknown origin, still transmitting on a carrier wave older than the Federation. The data is extraordinary.' },
        grav: { name: 'Gravimetric Shear', color: '#ffb347', rewards: { dilithium: 65, research: 65 }, text: 'Local gravity fluctuates wildly. You harvest exotic matter from the shear boundary.' },
        tachyon: { name: 'Tachyon Field', color: '#59e0ff', rewards: { research: 100, credits: 200 }, text: 'Faster-than-light particles stream through the field. The sensors triplicate every reading — one may be from the future.' },
        wreck: { name: 'Battle Wreckage', color: '#ff4d3d', rewards: { credits: 560, dilithium: 44, xp: 70 }, text: 'The shattered remains of a fleet engagement. Warp cores long cold, but the armour plating is worth a small fortune.' },
        wormhole: { name: 'Wormhole Transit', color: '#7dffcf', rewards: { credits: 1000, dilithium: 130, research: 170 }, text: 'A stable wormhole. Your navigator takes a precise gravitational fix — a shortcut worth a fortune.' },
      };
      const t = templates[id];
      sys.anomalies.push({
        id: `${sys.id}-a${i}`,
        kind: id,
        name: t.name,
        color: t.color,
        rewards: t.rewards,
        text: t.text,
        angle: rng(i + 7) * Math.PI * 2,
        dist: 160 + rng(i + 11) * 220,
      });
    }
    return sys.anomalies;
  }

  /* ------------------------------------------------------------ misc */
  difficultyLabelFor(sys) {
    const t = (sys || this.system).threat || 1;
    return ['', 'Minimal', 'Low', 'Moderate', 'Elevated', 'Severe', 'Critical', 'Extreme', 'Suicidal'][t] || 'Unknown';
  }

  difficultyLabel() {
    return this.difficultyLabelFor(this.system);
  }

  logEntry(text, kind = 'info') {
    this.state.log.push({ t: Date.now(), text, kind });
    if (this.state.log.length > 60) this.state.log.shift();
  }
}

export const game = new Game();
