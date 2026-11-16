/**
 * Life in a star system beyond the fight:
 *
 *  · YOUR SPACE STATION — found one in any system you have visited (Y), then
 *    build it up module by module. Turrets shoot hostiles, a repair dock fixes
 *    your ship when you fly close, a shield generator recharges your shields,
 *    and habitats, refineries and labs earn while you play.
 *
 *  · CARGO FREIGHTERS fly between the planets. Every so often pirates jump one:
 *    drive them off before it is destroyed and the shipping company pays you.
 *
 * A helper owned by SystemScene (`scene.life`); it reaches into the scene for
 * effects, enemies and the HUD.
 */
import * as THREE from 'three';
import { stationAt, MODULES, MODULE_ORDER, SLOTS, STATION_COST, SLOT_COUNT, moduleFits, moduleCounts } from '../data/stations.js';
import { buildStation, syncStation, showSlotMarkers, buildFreighter } from '../art/station3d.js';
import { makeEnemy } from '../data/enemies.js';
import { el, toast, fmtC } from '../ui/dom.js';
import { escapeHtml } from '../core/util.js';
import { audio } from '../core/audio.js';
import { disposeObject3D } from '../art/ships3d.js';
import { SYSTEM_IDS } from '../core/damage.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const STATION_POS = new THREE.Vector3(-200, 170, 470);   // above the planets' orbits, near where you arrive
const DOCK_RANGE = 75;
const SHIELD_RANGE = 95;
const TURRET_RANGE = 320;
const SLOT_LABEL = (i) => (i < 6 ? `Ring ${i + 1}` : i === 6 ? 'Top spire' : i === 7 ? 'Bottom spire' : `Pylon ${i - 7}`);

export class SpaceLife {
  constructor(scene) {
    this.sc = scene;
    this.station = null;          // THREE group of your station here (if any)
    this.freighters = [];
    this.raid = null;             // { freighter, pirates: [enemy], t }
    this.raidTimer = 0;
    this.builder = null;          // { el, slot, module, yaw } while the builder is open
    this._docked = false;
  }

  get sys() { return this.sc.system; }
  get game() { return this.sc.game; }

  init() {
    this._buildStation();
    this._spawnFreighters();
    this.raidTimer = 35 + Math.random() * 40;
    this._buildHud();
  }

  /* ---------------------------------------------------------------- station */
  _buildStation() {
    const data = stationAt(this.game.state, this.sys.id);
    if (!data) return;
    this.station = buildStation(data);
    this.station.position.copy(STATION_POS);
    this.sc.systemRoot.add(this.station);
  }

  hasStation() { return !!stationAt(this.game.state, this.sys.id); }
  counts() { return moduleCounts(stationAt(this.game.state, this.sys.id)); }

  _updateStation(dt) {
    const st = this.station;
    if (!st) return;
    const t = this.sc.time;
    st.rotation.y += dt * 0.03;
    st.userData.beacons.forEach((b, i) => b.scale.setScalar(((t + i * 0.37) % 1.6) < 0.12 ? 3.6 : 2.0));
    const counts = this.counts();
    const p = this.sc.player.position;
    const d = p.distanceTo(st.position);

    // turrets: each one picks the nearest hostile in range
    if (counts.turret) {
      for (const head of st.userData.turrets) {
        head.updateMatrixWorld();
        const hp = head.getWorldPosition(V());
        let best = null, bd = TURRET_RANGE;
        for (const e of this.sc.enemies) {
          if (e.dead || e.cloaked) continue;
          const ed = e.group.position.distanceTo(hp);
          if (ed < bd) { bd = ed; best = e; }
        }
        if (!best) continue;
        // swing the barrels round to the target (lookAt takes a world point)
        head.lookAt(best.group.position);
        head.userData.cd = (head.userData.cd || Math.random()) - dt;
        if (head.userData.cd <= 0) {
          head.userData.cd = 1.1;
          this.sc._spawnBeam(hp, best.group.position.clone(), '#ff8a5c', 1.6);
          this.sc._damageEnemy(best, 70);
        }
      }
    }

    // repair dock: fly close and the crew patches you up
    const docked = counts.dock && d < DOCK_RANGE && !this.sc.dead;
    if (docked) {
      const sc = this.sc;
      sc.hull = Math.min(sc.maxHull, sc.hull + sc.maxHull * 0.08 * dt);
      sc.shield = Math.min(sc.maxShield, sc.shield + sc.maxShield * 0.12 * dt);
      const dmg = this.game.damage;
      if (dmg) for (const k of SYSTEM_IDS) dmg[k] = Math.min(1, (dmg[k] ?? 1) + 0.12 * dt);
      if (!this._docked) { toast('Docked at your station — repair crews at work', 'good', 2200); audio.ui(); }
    }
    this._docked = !!docked;
    // shield generator: your shields recharge fast inside the bubble
    if (counts.shield && d < SHIELD_RANGE && !docked) {
      this.sc.shield = Math.min(this.sc.maxShield, this.sc.shield + this.sc.maxShield * 0.06 * dt);
    }
    if (st.userData.shield) st.userData.shield.material.opacity = 0.05 + Math.sin(t * 2) * 0.02;
  }

  /* ---------------------------------------------------------------- freighters */
  _spawnFreighters() {
    const nodes = (this.sc.planetNodes || []).filter((n) => !n.moon);
    if (nodes.length < 2 || this.sys.boss || this.sys.blackhole) return;
    const n = Math.min(2, nodes.length - 1);
    for (let i = 0; i < n; i++) {
      const g = buildFreighter(7 + i * 13 + this.sys.id.length);
      const from = nodes[i], to = nodes[(i + 1) % nodes.length];
      g.position.copy(from.node.getWorldPosition(V())).add(V(0, from.radius + 40, 0));
      this.sc.shipRoot.add(g);
      this.freighters.push({ group: g, to, hp: 900, maxHp: 900, dead: false, radius: 9, speed: 14 + i * 3 });
    }
  }

  _updateFreighters(dt) {
    const nodes = (this.sc.planetNodes || []).filter((n) => !n.moon);
    for (const f of this.freighters) {
      if (f.dead) continue;
      const goal = f.to.node.getWorldPosition(V()).add(V(0, f.to.radius + 40, 0));
      const to = goal.clone().sub(f.group.position);
      const dist = to.length();
      if (dist < f.to.radius + 30) {
        // arrived: on to another planet
        const others = nodes.filter((n) => n !== f.to);
        f.to = others[Math.floor(Math.random() * others.length)] || f.to;
        continue;
      }
      // a freighter under attack runs for it
      const speed = f.speed * (this.raid?.freighter === f ? 1.5 : 1);
      f.group.position.addScaledVector(to.normalize(), speed * dt);
      const look = f.group.position.clone().add(to);
      f.group.lookAt(look);
    }
  }

  /** A pirate bolt hit a freighter. */
  hitFreighter(f, dmg) {
    if (!f || f.dead) return;
    f.hp -= dmg;
    if (f.hp <= 0) {
      f.dead = true;
      this.sc._explosion(f.group.position.clone(), 2, '#ffb347');
      this.sc.shipRoot.remove(f.group);
      disposeObject3D(f.group);
      if (this.raid?.freighter === f) {
        this.sc.addLog('The freighter is lost. The pirates turn on you!', 'hostile');
        toast('Freighter destroyed', 'bad', 2400);
        for (const e of this.raid.pirates) e.prey = null;
        this.raid = null;
        this.raidTimer = 120 + Math.random() * 60;
      }
    }
  }

  _updateRaid(dt) {
    if (this.raid) {
      const r = this.raid;
      r.t += dt;
      if (r.pirates.every((e) => e.dead)) {
        // saved it
        const th = this.sys.threat || 1;
        const reward = { credits: 900 + th * 300, dilithium: 10 + th * 4, xp: 60 + th * 15 };
        this.game.recordEscort(reward);
        toast(`Freighter saved! +${fmtC(reward.credits)} · +${reward.dilithium} dilithium`, 'good', 3200);
        this.sc.addLog(`Convoy secure — the shipping company pays ${fmtC(reward.credits)}`, 'good');
        audio.upgrade?.();
        this.raid = null;
        this.raidTimer = 90 + Math.random() * 70;
      }
    } else if (this.freighters.some((f) => !f.dead)) {
      this.raidTimer -= dt;
      if (this.raidTimer <= 0) this._startRaid();
    }
    this._updateHud();
  }

  _startRaid() {
    const alive = this.freighters.filter((f) => !f.dead);
    if (!alive.length) return;
    const f = alive[Math.floor(Math.random() * alive.length)];
    const th = this.sys.threat || 1;
    const n = th >= 4 ? 3 : 2;
    const pirates = [];
    for (let i = 0; i < n; i++) {
      const def = makeEnemy(i % 2 ? 'orion' : 'raider', th);
      const a = Math.random() * Math.PI * 2;
      const pos = f.group.position.clone().add(V(Math.cos(a) * 130, 20 + Math.random() * 30, Math.sin(a) * 130));
      const e = this.sc._spawnEnemy(def, pos);
      e.prey = f;
      pirates.push(e);
    }
    this.sc.fleetTotal = (this.sc.fleetTotal || 0) + n;
    this.raid = { freighter: f, pirates, t: 0 };
    this.sc.addLog(`Distress call: pirates attacking a freighter, ${Math.round(f.group.position.distanceTo(this.sc.player.position))}u away!`, 'hostile');
    toast('🚚 A freighter is under attack! Defend it', 'warn', 3200);
    this.sc._flashWarning?.('FREIGHTER UNDER ATTACK');
    audio.alert?.();
    if (!this.sc.target || this.sc.target.dead) this.sc.target = pirates[0];
  }

  /* ---------------------------------------------------------------- HUD */
  _buildHud() {
    const hud = this.sc.ui?.querySelector('.hud');
    if (!hud) return;
    this.hudEl = el('<div class="convoy-chip" hidden><span class="ic">🚚</span> Freighter under attack <b>100%</b><i><em></em></i></div>');
    hud.appendChild(this.hudEl);
    this.stationBtn = this.sc.ui.querySelector('#station-btn');
    this.stationBtn?.addEventListener('click', () => this.toggleBuilder());
    this._updateStationButton();
  }

  _updateHud() {
    if (!this.hudEl) return;
    const r = this.raid;
    this.hudEl.hidden = !r;
    if (r) {
      const pct = Math.max(0, Math.round((r.freighter.hp / r.freighter.maxHp) * 100));
      this.hudEl.querySelector('b').textContent = `${pct}%`;
      this.hudEl.querySelector('em').style.width = `${pct}%`;
    }
  }

  _updateStationButton() {
    if (!this.stationBtn) return;
    const lbl = this.stationBtn.querySelector('[data-lbl]');
    if (lbl) lbl.textContent = this.hasStation() ? 'Your station' : `Build a station · ${fmtC(STATION_COST)}`;
  }

  /* ---------------------------------------------------------------- builder */
  toggleBuilder(on = !this.builder) {
    if (on === !!this.builder) return;
    if (!on) {
      this.builder.el.remove();
      this.builder.off();
      this.builder = null;
      if (this.station) showSlotMarkers(this.station, false);
      this.sc.ui?.classList.remove('station-building');
      return;
    }
    const root = this.sc.ui;
    const panel = el('<div class="station-builder" role="dialog" aria-label="Station builder"></div>');
    root.appendChild(panel);
    root.classList.add('station-building');
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      const k = e.key.toLowerCase();
      const b = this.builder;
      if (!b) return;
      let handled = true;
      if (k === 'escape' || k === 'y') this.toggleBuilder(false);
      else if (!this.hasStation()) { if (k === 'enter') this._found(); else handled = false; }
      else if (k === 'arrowright' || k === 'd') this._select((b.slot + 1) % SLOT_COUNT);
      else if (k === 'arrowleft' || k === 'a') this._select((b.slot + SLOT_COUNT - 1) % SLOT_COUNT);
      else if (k >= '1' && k <= String(MODULE_ORDER.length)) { b.module = MODULE_ORDER[Number(k) - 1]; this._render(); }
      else if (k === 'enter') this._build();
      else if (k === 'delete' || k === 'backspace') this._remove();
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    this.builder = { el: panel, slot: 0, module: 'habitat', yaw: 0, off: () => window.removeEventListener('keydown', onKey, true) };
    this._render();
  }

  _select(slot) { this.builder.slot = slot; this._render(); audio.ui(); }

  _found() {
    const res = this.game.foundStation(this.sys.id, `${this.sys.name} Station`);
    if (!res.ok) { toast(res.why, 'warn'); return; }
    toast(`${this.sys.name} Station founded! Now add modules.`, 'good', 3000);
    audio.upgrade?.();
    this._buildStation();
    this._updateStationButton();
    this._render();
  }

  _build() {
    const b = this.builder;
    const res = this.game.buildStationModule(this.sys.id, b.slot, b.module);
    if (!res.ok) { toast(res.why, 'warn'); return; }
    syncStation(this.station, stationAt(this.game.state, this.sys.id));
    this.sc._abilityRing?.(MODULES[b.module].color, 10);
    toast(`${MODULES[b.module].name} built`, 'good', 1600);
    audio.upgrade?.();
    // jump to the next free slot this module fits
    const st = stationAt(this.game.state, this.sys.id);
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const s = (b.slot + i) % SLOT_COUNT;
      if (!st.modules[s]) { b.slot = s; break; }
    }
    this._render();
  }

  _remove() {
    const b = this.builder;
    const res = this.game.removeStationModule(this.sys.id, b.slot);
    if (!res.ok) { toast(res.why, 'warn'); return; }
    syncStation(this.station, stationAt(this.game.state, this.sys.id));
    toast(`Module removed · +${fmtC(res.refund)} back`, 'good', 1600);
    this._render();
  }

  _render() {
    const b = this.builder;
    if (!b) return;
    const g = this.game;
    const st = stationAt(g.state, this.sys.id);
    if (!st) {
      const can = g.state.credits >= STATION_COST;
      b.el.innerHTML = `
        <div class="sb-head"><b>Build a space station in ${escapeHtml(this.sys.name)}</b><button class="close-x" data-x aria-label="Close">✕</button></div>
        <p class="small dim">Your own station, in orbit high above the planets. Fill its 12 slots with modules: homes and refineries that earn while you play, a repair dock, a shield generator and phaser turrets that defend the system.</p>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary" data-found ${can ? '' : 'disabled'}>Found station · ${fmtC(STATION_COST)} <span class="kbd">Enter</span></button>
        ${can ? '' : `<span class="small" style="color:#ff9d94">You need ${fmtC(STATION_COST - g.state.credits)} more</span>`}</div>`;
      b.el.querySelector('[data-found]')?.addEventListener('click', () => this._found());
      b.el.querySelector('[data-x]').addEventListener('click', () => this.toggleBuilder(false));
      return;
    }
    showSlotMarkers(this.station, true, b.slot);
    const here = st.modules[b.slot];
    const counts = moduleCounts(st);
    const used = Object.keys(st.modules).length;
    const slotBtns = SLOTS.map((s) => {
      const t = st.modules[s.id];
      return `<button class="sb-slot ${s.id === b.slot ? 'sel' : ''} ${t ? 'full' : ''}" data-slot="${s.id}" title="${SLOT_LABEL(s.id)}${t ? ` · ${MODULES[t].name}` : ' · empty'}">
        <span class="ic">${t ? MODULES[t].icon : '+'}</span><span class="nm">${SLOT_LABEL(s.id)}</span></button>`;
    }).join('');
    const mods = MODULE_ORDER.map((id, i) => {
      const m = MODULES[id];
      const fits = moduleFits(id, b.slot);
      const afford = g.state.credits >= m.cost;
      return `<button class="sb-mod ${b.module === id ? 'sel' : ''}" data-mod="${id}" ${fits ? '' : 'data-nofit="1"'} title="${escapeHtml(m.desc)}">
        <span class="kc">${i + 1}</span><span class="ic">${m.icon}</span>
        <span class="nm">${m.name}</span>
        <span class="ct" style="color:${afford ? 'var(--amber)' : '#ff9d94'}">${fmtC(m.cost)}</span>
        ${counts[id] ? `<span class="have">×${counts[id]}</span>` : ''}
      </button>`;
    }).join('');
    const sel = MODULES[b.module];
    const fits = moduleFits(b.module, b.slot);
    b.el.innerHTML = `
      <div class="sb-head"><b>${escapeHtml(st.name)}</b><span class="small dim">${used}/${SLOT_COUNT} modules</span><button class="close-x" data-x aria-label="Close (Y)">✕</button></div>
      <div class="sb-slots">${slotBtns}</div>
      <div class="sb-mods">${mods}</div>
      <div class="sb-foot">
        <div class="small dim sb-desc">${here ? `<b>${SLOT_LABEL(b.slot)}:</b> ${MODULES[here].name}. ${escapeHtml(MODULES[here].desc)}` : `<b>${sel.name}:</b> ${escapeHtml(sel.desc)}${fits ? '' : ` <span style="color:#ff9d94">It doesn't fit on ${SLOT_LABEL(b.slot)}.</span>`}`}</div>
        <div class="row" style="gap:6px">
          ${here ? '<button class="btn sm danger" data-rm>Remove · half back <span class="kbd">Del</span></button>' : `<button class="btn sm primary" data-build ${fits ? '' : 'disabled'}>Build ${sel.name} <span class="kbd">Enter</span></button>`}
        </div>
      </div>
      <div class="tiny faint sb-keys">← → slot · 1–8 module · Enter build · Del remove · Y or Esc close</div>`;
    b.el.querySelectorAll('[data-slot]').forEach((x) => x.addEventListener('click', () => this._select(Number(x.dataset.slot))));
    b.el.querySelectorAll('[data-mod]').forEach((x) => x.addEventListener('click', () => { b.module = x.dataset.mod; this._render(); }));
    b.el.querySelector('[data-build]')?.addEventListener('click', () => this._build());
    b.el.querySelector('[data-rm]')?.addEventListener('click', () => this._remove());
    b.el.querySelector('[data-x]').addEventListener('click', () => this.toggleBuilder(false));
  }

  /** While building, the camera circles the station instead of chasing the ship. */
  builderCamera(camera, dt) {
    const b = this.builder;
    b.yaw += dt * 0.18;
    const c = STATION_POS;
    const goal = V(c.x + Math.sin(b.yaw) * 95, c.y + 42, c.z + Math.cos(b.yaw) * 95);
    camera.position.lerp(goal, 1 - Math.exp(-3 * dt));
    camera.lookAt(c);
  }

  /* ---------------------------------------------------------------- loop */
  update(dt) {
    this._updateStation(dt);
    this._updateFreighters(dt);
    this._updateRaid(dt);
  }

  dispose() {
    if (this.builder) this.toggleBuilder(false);
    if (this.station) { this.sc.systemRoot?.remove(this.station); disposeObject3D(this.station); this.station = null; }
    for (const f of this.freighters) { this.sc.shipRoot?.remove(f.group); disposeObject3D(f.group); }
    this.freighters = [];
    this.raid = null;
    this.hudEl?.remove();
  }
}
