import * as THREE from 'three';
import { initDrawers } from '../ui/drawers.js';
import { bindKeys } from '../ui/keys.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildShip, disposeObject3D } from '../art/ships3d.js';
import { makeSky, makeStars, glowSprite } from '../art/environment.js';
import { el, $, $$, toast, fmtC, fmt, modal, bar } from '../ui/dom.js';
import { SHIP_CLASSES, SHIP_ORDER, UPGRADE_SYSTEMS, UPGRADE_ORDER, PALETTES, NACELLE_COLORS, DEFLECTOR_COLORS, MAX_UPGRADE, computeStats, TIMELINES } from '../data/ships.js';
import { TECHS, TECH_ORDER } from '../data/tech.js';
import { audio } from '../core/audio.js';
import { escapeHtml } from '../core/util.js';
import { CUSTOM_ID, DRAFT_ID, DEFAULT_DESIGN, DESIGN_LIMITS, SAUCER_SHAPES, NACELLE_STYLES, PYLON_STYLES, HULL_SHAPES, sanitizeDesign, statsForDesign, registerCustomClass } from '../data/designer.js';

export class HangarScene {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100000);
    this.camera.position.set(10, 6, 12);
    this.time = 0;
    this.previewId = null;
    this.tab = 'stats';
    this.ship = null;
    this._built = false;
  }

  _build() {
    const s = this.scene;
    s.add(makeSky(7, 3000));
    s.add(makeStars(1400, 2200));
    s.environment = this.app.environment || null;
    s.fog = new THREE.FogExp2(0x04070d, 0.008);

    // hangar shell
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x0c141f, metalness: 0.75, roughness: 0.55, side: THREE.BackSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 34, 24, 1, true), shellMat);
    shell.position.y = 4;
    shell.rotation.z = Math.PI / 2;
    s.add(shell);

    // deck
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x121c28, metalness: 0.7, roughness: 0.6 }));
    deck.position.y = -5.5;
    s.add(deck);
    const grid = new THREE.GridHelper(44, 44, 0x2a7f9e, 0x133042);
    grid.position.y = -5.2;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    s.add(grid);

    // glowing landing pad
    const pad = new THREE.Mesh(new THREE.RingGeometry(3.4, 6.2, 64), new THREE.MeshBasicMaterial({ color: 0x2b8fb3, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -5.15;
    s.add(pad);

    // dock pylons
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.5, 8, 40, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: 0x2a3442, metalness: 0.85, roughness: 0.4 }));
      arm.position.set(side * 8, 2, 0);
      arm.rotation.y = side > 0 ? 0 : Math.PI;
      arm.rotation.z = Math.PI * 0.18;
      s.add(arm);
      const strip = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.09, 6, 40, Math.PI * 0.62), new THREE.MeshBasicMaterial({ color: side > 0 ? '#59e0ff' : '#ffb347', toneMapped: false }));
      strip.position.copy(arm.position);
      strip.rotation.copy(arm.rotation);
      s.add(strip);
      const lamp = glowSprite(side > 0 ? '#59e0ff' : '#ffb347', 8, 0.45);
      lamp.position.set(side * 14, 8, -6);
      s.add(lamp);
    }
    // overhead gantry
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, 2), new THREE.MeshStandardMaterial({ color: 0x1c2632, metalness: 0.8, roughness: 0.4 }));
    gantry.position.set(0, 12, -4);
    s.add(gantry);
    for (let i = -2; i <= 2; i++) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), new THREE.MeshBasicMaterial({ color: '#dff2ff', toneMapped: false }));
      light.position.set(i * 5.6, 11.5, -4);
      s.add(light);
    }

    // lighting
    s.add(new THREE.AmbientLight(0x30435c, 0.9));
    const key = new THREE.DirectionalLight(0xa8d4ff, 2.2);
    key.position.set(-12, 16, 14);
    s.add(key);
    const fill = new THREE.PointLight(0xffb347, 90, 60, 2);
    fill.position.set(12, 2, 8);
    s.add(fill);
    const rim = new THREE.PointLight(0x3ba8ff, 70, 60, 2);
    rim.position.set(-14, 4, -10);
    s.add(rim);

    const back = glowSprite('#3c7fb0', 36, 0.22);
    back.position.set(0, 3, -22);
    s.add(back);

    // docked ship
    this.shipPivot = new THREE.Group();
    s.add(this.shipPivot);

    this.controls = new OrbitControls(this.camera, this.app.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.minPolarAngle = 0.32;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 34;
    this._built = true;
  }

  enter() {
    if (!this._built) this._build();
    this.scene.environment = this.app.environment || null;
    this.previewId = this.game.state.shipId;
    this.tab = 'stats';
    this._buildShip();
    this._buildUI();
    this._bindings = [this.game.bus.on('change', () => { this._refreshFleet(); this._refreshTab(); })];
    // drydock: docking at Utopia Planitia patches every damaged system
    this._bindHangarKeys();
    if (this.game.repairAll()) setTimeout(() => toast('Drydock crews repaired every damaged system', 'good', 2800), 400);
    audio.startMusic();
  }

  exit() {
    this._unkeys?.();
    this._unkeys = null;
    this._closeDesigner(false);
    this._bindings?.forEach((off) => off());
    this._bindings = [];
    this.drawers?.destroy();
    this.drawers = null;
    this.ui?.remove();
    this.ui = null;
    if (this.ship) {
      this.shipPivot.remove(this.ship);
      disposeObject3D(this.ship);
      this.ship = null;
    }
  }

  _previewRecord() {
    const id = this.previewId;
    if (id === DRAFT_ID && this._draft) {
      const d = sanitizeDesign(this._draft);
      return { levels: { hull: 1, shields: 1, weapons: 1, engines: 1, sensors: 1 }, palette: PALETTES[0].id, nacelle: d.glow, deflector: d.deflector, name: d.name, registry: d.registry, kills: 0 };
    }
    if (this.game.state.ships[id]) return this.game.state.ships[id];
    const cls = SHIP_CLASSES[id];
    return {
      levels: { hull: 1, shields: 1, weapons: 1, engines: 1, sensors: 1 },
      palette: PALETTES[0].id, nacelle: PALETTES[0].accent, deflector: '#5ab7ff',
      name: cls.hullName, registry: cls.registry, kills: 0,
    };
  }

  _buildShip() {
    if (this.ship) {
      this.shipPivot.remove(this.ship);
      disposeObject3D(this.ship);
      this.ship = null;
    }
    const rec = this._previewRecord();
    this.ship = buildShip(this.previewId, rec, Math.max(0.7, this.app.viewport.detail));
    const len = this.ship.userData.length || 6;
    this.shipPivot.add(this.ship);
    this.controls.minDistance = len * 1.15;
    this.controls.maxDistance = len * 4.4;
    this.camera.position.set(len * 1.35, len * 0.62, len * 1.55);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /* ---------------------------------------------------------------- UI */
  _buildUI() {
    this.ui = el(`
      <div class="screen active hangar-ui">
        <aside class="panel side-left">
          <div class="panel-head">
            <div><h3>Fleet</h3><span class="sub">Utopia Planitia Shipyards</span></div>
            <span class="chip amber" id="rank-chip"></span>
          </div>
          <div class="panel-body scroll" id="fleet-list"></div>
          <div class="panel-foot" style="padding:10px 14px">
            <div class="row between small dim"><span>Dilithium reserve</span><b class="cyan" id="dil-val"></b></div>
            <div class="row between small dim" style="margin-top:4px"><span>Research</span><b class="violet" id="rp-val"></b></div>
          </div>
        </aside>
        <aside class="panel side-right">
          <div class="tabs" id="hangar-tabs">
            <div class="tab active" data-tab="stats">Stats</div>
            <div class="tab" data-tab="upgrades">Upgrades</div>
            <div class="tab" data-tab="customize">Livery</div>
            <div class="tab" data-tab="research">Research</div>
          </div>
          <div class="panel-body scroll" id="tab-body"></div>
          <div class="panel-foot" id="hangar-foot"></div>
        </aside>
        <div class="ship-view-labels" id="ship-labels"></div>
      </div>`);
    document.getElementById('ui').appendChild(this.ui);
    // panels are drawers: closed by default so the 3D view gets the space
    this.drawers = initDrawers(this.ui, { key: 'hangar' });

    $$('#hangar-tabs .tab', this.ui).forEach((t) => {
      t.addEventListener('click', () => {
        this.tab = t.dataset.tab;
        $$('#hangar-tabs .tab', this.ui).forEach((x) => x.classList.toggle('active', x === t));
        audio.ui();
        this._refreshTab();
      });
    });
    this._refreshFleet();
    this._refreshTab();
  }

  _refreshFleet() {
    if (!this.ui) return;
    const g = this.game;
    $('#rank-chip', this.ui).textContent = `${g.rankTitle}`;
    $('#dil-val', this.ui).textContent = fmt(g.state.dilithium);
    $('#rp-val', this.ui).textContent = fmt(g.state.research);
    const list = $('#fleet-list', this.ui);
    const ids = g.state.customDesign ? [CUSTOM_ID, ...SHIP_ORDER] : SHIP_ORDER;
    list.innerHTML = `<button class="btn primary wide design-cta" id="open-designer">✎ ${g.state.customDesign ? 'Refit your design' : 'Design your own ship'}</button>` + ids.map((id) => {
      const cls = SHIP_CLASSES[id];
      const owned = g.state.ownedShips.includes(id);
      const active = g.state.shipId === id;
      const req = [];
      if (!owned) {
        if (g.rank < cls.rankReq) req.push(`Rank ${cls.rankReq}`);
        if (cls.researchReq && g.techCount() < cls.researchReq) req.push(`${cls.researchReq} techs`);
      }
      const tl = TIMELINES[cls.timeline] || TIMELINES.prime;
      const kelvin = cls.timeline === 'kelvin';
      return `<div class="ship-card ${id === this.previewId ? 'sel' : ''} ${owned ? '' : 'locked'}" data-ship="${id}">
        <div class="sc-ico">${cls.icon}</div>
        <div class="sc-meta">
          <div class="sc-nm">${escapeHtml(cls.name)} ${active ? '<span class="chip green" style="padding:1px 6px;font-size:8px">ACTIVE</span>' : ''}
            <span class="chip" title="${tl.name}" style="padding:1px 6px;font-size:8px;color:${tl.color};border-color:${tl.color}55">${kelvin ? 'KELVIN' : 'PRIME'}</span></div>
          <div class="sc-sub">${owned ? escapeHtml(g.state.ships[id].name) : (req.length ? 'Locked · ' + req.join(' · ') : fmtC(g.shipPrice(id)))}</div>
        </div>
        <div class="sc-tier">T${cls.tier}</div>
      </div>`;
    }).join('');
    $('#open-designer', list).onclick = () => this._openDesigner();
    $$('[data-ship]', list).forEach((card) => {
      card.addEventListener('click', () => {
        this.previewId = card.dataset.ship;
        audio.ui();
        this._buildShip();
        this._refreshFleet();
        this._refreshTab();
      });
    });
    this._refreshLabels();
  }

  _bindHangarKeys() {
    const ids = () => (this.game.state.customDesign ? [CUSTOM_ID, ...SHIP_ORDER] : SHIP_ORDER);
    const step = (dir) => {
      if (this._designer) return false;
      const list = ids();
      const i = Math.max(0, list.indexOf(this.previewId));
      this.previewId = list[(i + dir + list.length) % list.length];
      audio.ui();
      this._buildShip(); this._refreshFleet(); this._refreshTab();
      $(`[data-ship="${this.previewId}"]`, this.ui)?.scrollIntoView({ block: 'nearest' });
    };
    const turn = (a) => { if (this.shipPivot) this.shipPivot.rotation.y += a; };
    const tab = (name) => $(`#hangar-tabs [data-tab="${name}"]`, this.ui)?.click();
    this._unkeys = bindKeys({
      arrowdown: () => step(1), arrowup: () => step(-1),
      arrowleft: () => turn(0.2), a: () => turn(0.2), arrowright: () => turn(-0.2), d: () => turn(-0.2),
      enter: () => {
        if (this._designer) return false;
        const b = $('#hangar-foot .btn.primary:not([disabled])', this.ui);
        if (!b) return false;
        b.click();
      },
      n: () => (this._designer ? false : this._openDesigner()),
      escape: () => (this._designer ? this._closeDesigner(true) : false),
      1: () => tab('stats'), 2: () => tab('upgrades'), 3: () => tab('customize'), 4: () => tab('research'),
      '[': () => this.drawers?.toggle('left'), ']': () => this.drawers?.toggle('right'),
    });
  }

  /* ---------------------------------------------------------------- designer */
  _openDesigner(start = null) {
    audio.ui();
    this.drawers?.close?.();
    this._closeDesigner(false);
    this._draft = sanitizeDesign(start || this.game.state.customDesign || DEFAULT_DESIGN);
    this._prevPreview = this.previewId;
    this.previewId = DRAFT_ID;
    const L = DESIGN_LIMITS;
    const slider = (k, label, [lo, hi], step = 0.05) => `
      <label class="dz-row"><span>${label}</span>
        <input type="range" data-dz="${k}" min="${lo}" max="${hi}" step="${step}" value="${this._draft[k]}"></label>`;
    this._designer = el(`
      <aside class="panel designer" role="dialog" aria-label="Ship designer">
        <div class="panel-head"><div><h3>Ship Designer</h3><span class="sub">Utopia Planitia drafting room</span></div>
          <button class="close-x" data-dz-close aria-label="Close designer">✕</button></div>
        <div class="panel-body scroll">
          <div class="field"><label>Ship name</label><input type="text" data-dz="name" maxlength="28" value="${escapeHtml(this._draft.name)}"></div>
          <div class="field"><label>Registry</label><input type="text" data-dz="registry" maxlength="12" value="${escapeHtml(this._draft.registry)}"></div>
          <div class="dz-group">Primary hull</div>
          ${slider('saucer', 'Saucer size', L.saucer)}
          <div class="dz-row"><span>Saucer shape</span><div class="seg" data-dz-seg="shape">${SAUCER_SHAPES.map((x) => `<button data-v="${x}" class="${this._draft.shape === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>
          ${slider('weapons', 'Phaser strips', L.weapons, 1)}
          <div class="dz-row"><span>Roll bar weapons pod</span><div class="seg" data-dz-seg="rollbar"><button data-v="true" class="${this._draft.rollbar ? 'on' : ''}">On</button><button data-v="false" class="${!this._draft.rollbar ? 'on' : ''}">Off</button></div></div>
          <div class="dz-group">Engineering hull</div>
          ${slider('hull', 'Secondary hull length (0 = none)', L.hull)}
          <div class="dz-row"><span>Hull shape</span><div class="seg" data-dz-seg="hullShape">${HULL_SHAPES.map((x) => `<button data-v="${x}" class="${this._draft.hullShape === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>
          <div class="dz-row"><span>Neck</span><div class="seg" data-dz-seg="neck"><button data-v="true" class="${this._draft.neck ? 'on' : ''}">On</button><button data-v="false" class="${!this._draft.neck ? 'on' : ''}">Off</button></div></div>
          <div class="dz-group">Warp nacelles</div>
          <div class="dz-row"><span>Count</span><div class="seg" data-dz-seg="nacelles"><button data-v="2" class="${this._draft.nacelles === 2 ? 'on' : ''}">2</button><button data-v="4" class="${this._draft.nacelles === 4 ? 'on' : ''}">4</button></div></div>
          <div class="dz-row"><span>Style</span><div class="seg" data-dz-seg="nacelleStyle">${NACELLE_STYLES.map((x) => `<button data-v="${x}" class="${this._draft.nacelleStyle === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>
          <div class="dz-row"><span>Pylons</span><div class="seg" data-dz-seg="pylonStyle">${PYLON_STYLES.map((x) => `<button data-v="${x}" class="${this._draft.pylonStyle === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>
          ${slider('nacelleLen', 'Length', L.nacelleLen)}
          ${slider('nacelleSpan', 'Span', L.nacelleSpan)}
          ${slider('nacelleHeight', 'Height', L.nacelleHeight)}
          <div class="dz-group">Paint</div>
          <div class="dz-row"><span>Hull colour</span><input type="color" data-dz="hullColor" value="${this._draft.hullColor}"></div>
          <div class="dz-row"><span>Warp glow</span><input type="color" data-dz="glow" value="${this._draft.glow}"></div>
          <div class="dz-row"><span>Deflector</span><input type="color" data-dz="deflector" value="${this._draft.deflector}"></div>
          <div class="dz-group">Performance</div>
          <div class="dz-stats" id="dz-stats"></div>
        </div>
        <div class="panel-foot dz-foot">
          <button class="btn ghost" data-dz-reset>Reset</button>
          <button class="btn primary" data-dz-buy></button>
        </div>
      </aside>`);
    this.ui.appendChild(this._designer);
    this.ui.classList.add('designing');
    const D = this._designer;
    D.querySelectorAll('[data-dz]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.dz;
        this._draft[k] = inp.type === 'range' ? +inp.value : inp.value;
        this._redesign(k === 'name' || k === 'registry');
      });
    });
    D.querySelectorAll('[data-dz-seg]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const k = seg.dataset.dzSeg;
        const v = b.dataset.v;
        this._draft[k] = k === 'nacelles' ? +v : (k === 'neck' || k === 'rollbar') ? v === 'true' : v;
        audio.ui();
        this._redesign();
      }));
    });
    D.querySelector('[data-dz-close]').onclick = () => { audio.ui(); this._closeDesigner(true); };
    D.querySelector('[data-dz-reset]').onclick = () => {
      // back to the stock hull (keeps the name/registry the player typed)
      const { name, registry } = this._draft;
      this._closeDesigner(false);
      this._openDesigner({ ...DEFAULT_DESIGN, name, registry });
    };
    D.querySelector('[data-dz-buy]').onclick = () => {
      const res = this.game.commissionDesign(this._draft);
      if (!res.ok) { toast(res.why, 'warn'); audio.error?.(); return; }
      audio.upgrade();
      toast(`${escapeHtml(sanitizeDesign(this._draft).name)} commissioned · ${fmtC(res.price)}`, 'good', 3200);
      this._closeDesigner(false, true);
    };
    this._redesign();
  }

  /** Re-register the draft as the custom class and rebuild the preview (once per frame at most). */
  _redesign(textOnly = false) {
    if (!this._designer) return;
    const d = sanitizeDesign(this._draft);
    // the draft lives under its own class id so the ship you actually own (and
    // may be flying) keeps its paid-for stats while you experiment
    registerCustomClass(d, DRAFT_ID);
    if (!textOnly) {
      // a full hull build (greebles + mesh merge) is too heavy for every
      // slider tick: rebuild once the slider has paused for a moment
      clearTimeout(this._dzT);
      this._dzT = setTimeout(() => this._buildShip(), 90);
    }
    this._refreshLabels();
    const st = statsForDesign(d);
    const ref = statsForDesign(DEFAULT_DESIGN);
    const row = (k, label, v, max) => `<div class="statbar"><div class="lbl"><span>${label}</span><b>${v}</b></div>
      <div class="bar thin ${v >= ref[k] ? '' : 'amber'}"><i style="width:${Math.min(100, Math.round((v / max) * 100))}%"></i></div></div>`;
    $('#dz-stats', this._designer).innerHTML = [
      row('hull', 'Hull', st.hull, 3400), row('shield', 'Shields', st.shield, 2200),
      row('phaser', 'Phasers', st.phaser, 80), row('torp', 'Torpedoes', st.torp, 420),
      row('speed', 'Speed', st.speed, 90), row('turn', 'Agility', st.turn, 1.9),
    ].join('');
    const price = this.game.designPrice(d);
    const btn = this._designer.querySelector('[data-dz-buy]');
    btn.textContent = `${this.game.state.customDesign ? 'Refit' : 'Commission'} · ${fmtC(price)}`;
    btn.disabled = this.game.state.credits < price;
  }

  _closeDesigner(rebuild = true, keep = false) {
    if (!this._designer) return;
    clearTimeout(this._dzT);
    this._designer.remove();
    this._designer = null;
    this.ui?.classList.remove('designing');
    registerCustomClass(null, DRAFT_ID);
    if (keep) this.previewId = CUSTOM_ID;                     // just commissioned: show it
    else this.previewId = this._prevPreview || this.game.state.shipId;
    if (!SHIP_CLASSES[this.previewId]) this.previewId = this.game.state.shipId;
    if (rebuild || keep) { this._buildShip(); this._refreshFleet(); this._refreshTab(); }
  }

  _refreshLabels() {
    const node = $('#ship-labels', this.ui);
    if (!node) return;
    const cls = SHIP_CLASSES[this.previewId];
    const rec = this._previewRecord();
    node.innerHTML = `<div class="n">${escapeHtml(rec.name || cls.hullName)}</div><div class="r">${escapeHtml(rec.registry || cls.registry)} · ${escapeHtml(cls.name.toUpperCase())}</div>`;
  }

  _refreshTab() {
    if (!this.ui) return;
    const body = $('#tab-body', this.ui);
    const foot = $('#hangar-foot', this.ui);
    const g = this.game;
    const cls = SHIP_CLASSES[this.previewId];
    const owned = g.state.ownedShips.includes(this.previewId);
    const active = g.state.shipId === this.previewId;
    const rec = this._previewRecord();
    const scrollPos = body.scrollTop;

    if (this.tab === 'stats') {
      const s = computeStats(this.previewId, rec.levels, g.techSet);
      const maxHull = 7000, maxShield = 6000, maxDps = 700, maxSpeed = 90, maxTurn = 2.1, maxSens = 2.6;
      body.innerHTML = `
        <div class="row between" style="margin-bottom:10px">
          <div><div class="tiny upper faint">${escapeHtml(cls.role)}</div><div style="font-family:var(--font-h);font-size:16px;letter-spacing:.06em">${escapeHtml(cls.name)}</div></div>
          <span class="chip amber">Tier ${cls.tier}</span>
        </div>
        <div class="tiny" style="margin:-4px 0 10px;color:${(TIMELINES[cls.timeline] || TIMELINES.prime).color};letter-spacing:.12em;text-transform:uppercase;font-size:9px">
          ${escapeHtml((TIMELINES[cls.timeline] || TIMELINES.prime).name)}
        </div>
        <div class="stats-grid">
          ${statRow('Hull integrity', s.hull, maxHull, '')}
          ${statRow('Shield capacity', s.shield, maxShield, '')}
          ${statRow('Damage / second', s.dps, maxDps, 'amber')}
          ${statRow('Impulse speed', s.speed, maxSpeed, '')}
          ${statRow('Turn rate', s.turn, maxTurn, '')}
          ${statRow('Sensor range', s.sensor, maxSens, 'green')}
        </div>
        <div class="hr"></div>
        <div class="grid2">
          <div class="fact"><div class="k">Length</div><div class="v">${cls.specs.length}</div></div>
          <div class="fact"><div class="k">Crew</div><div class="v">${cls.specs.crew}</div></div>
          <div class="fact"><div class="k">Max warp</div><div class="v">${cls.specs.maxWarp}</div></div>
          <div class="fact"><div class="k">Mass</div><div class="v">${cls.specs.mass}</div></div>
          <div class="fact"><div class="k">Phaser arrays</div><div class="v">${cls.hardpoints.phasers}</div></div>
          <div class="fact"><div class="k">Torpedo tubes</div><div class="v">${cls.hardpoints.torpedoes}</div></div>
        </div>
        <div class="hr"></div>
        <p class="lore">${escapeHtml(cls.lore)}</p>
        <div class="codex-entry" style="margin-top:12px">
          <div class="tag">Special ability</div>
          <h4 style="margin-top:4px">${escapeHtml(cls.ability.name)}</h4>
          <p>${escapeHtml(cls.ability.desc)} · ${cls.ability.cd}s cooldown</p>
        </div>`;
      if (!owned) {
        const reqs = [];
        if (g.rank < cls.rankReq) reqs.push(`Requires rank ${cls.rankReq} (${g.rankTitle} now)`);
        if (cls.researchReq && g.techCount() < cls.researchReq) reqs.push(`Requires ${cls.researchReq} researched technologies`);
        foot.innerHTML = `
          ${reqs.length ? `<div class="tiny" style="color:var(--amber);margin-bottom:8px;width:100%">${reqs.join(' · ')}</div>` : ''}
          <button class="btn primary" id="commission" ${reqs.length || g.state.credits < g.shipPrice(this.previewId) ? 'disabled' : ''}>
            Commission · ${fmtC(g.shipPrice(this.previewId))}
          </button>
          <button class="btn ghost" id="tab-research">Research</button>`;
        $('#commission', foot)?.addEventListener('click', () => this._commission());
        $('#tab-research', foot)?.addEventListener('click', () => {
          this.tab = 'research';
          $$('#hangar-tabs .tab', this.ui).forEach((x) => x.classList.toggle('active', x.dataset.tab === 'research'));
          this._refreshTab();
        });
      } else {
        foot.innerHTML = `
          <button class="btn ${active ? 'ghost' : 'primary'}" id="set-active" ${active ? 'disabled' : ''}>${active ? 'Active flagship' : 'Take command'}</button>
          <button class="btn ghost" id="go-launch">Launch</button>`;
        $('#set-active', foot)?.addEventListener('click', () => {
          g.selectShip(this.previewId);
          audio.confirm();
          toast(`${g.state.ships[this.previewId].name} is now your flagship`, 'good');
          this._refreshFleet(); this._refreshTab();
        });
        $('#go-launch', foot)?.addEventListener('click', () => {
          audio.confirm();
          this.app.setScene('system');
        });
      }
    }

    if (this.tab === 'upgrades') {
      if (!owned) {
        body.innerHTML = `<p class="small dim" style="line-height:1.6">Commission this class to refit her systems. Upgrades increase hull, shields, weapons, engines and sensors by roughly 15–19% per level, up to level ${MAX_UPGRADE}.</p>`;
        foot.innerHTML = `<button class="btn" id="back-stats">View stats</button>`;
        $('#back-stats', foot).onclick = () => { this.tab = 'stats'; $$('#hangar-tabs .tab', this.ui).forEach((x) => x.classList.toggle('active', x.dataset.tab === 'stats')); this._refreshTab(); };
      } else {
        body.innerHTML = `
          <p class="tiny faint" style="margin:0 0 8px;line-height:1.5">Refit costs scale with class tier and level. Each level is a ~16% improvement.</p>
          ${UPGRADE_ORDER.map((sid) => {
            const def = UPGRADE_SYSTEMS[sid];
            const lvl = rec.levels[sid] || 1;
            const cost = Math.round(({ hull: 1500, shields: 1700, weapons: 1900, engines: 1500, sensors: 1200 }[sid]) * cls.tier * Math.pow(lvl, 1.55));
            const maxed = lvl >= MAX_UPGRADE;
            return `<div class="upgrade-row">
              <div class="ico" style="font-size:18px;width:28px;text-align:center">${def.icon}</div>
              <div class="u-meta">
                <div class="u-nm">${def.short}</div>
                <div class="u-ds">Level ${lvl} / ${MAX_UPGRADE} · ${def.desc}</div>
                <div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('')}</div>
              </div>
              <button class="btn sm" data-up="${sid}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : `Upgrade<br>${fmtC(cost)}`}</button>
            </div>`;
          }).join('')}`;
        body.querySelectorAll('[data-up]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const sys = btn.dataset.up;
            const oldClass = g.state.shipId;
            // upgrades always apply to the active ship record
            if (g.state.shipId !== this.previewId) {
              const res = g.selectShip(this.previewId);
              if (!res.ok) { toast('Take command of this ship first', 'warn'); return; }
            }
            const res = g.upgradeModule(sys);
            if (!res.ok) { toast(res.why || 'Cannot upgrade', 'warn'); audio.error(); return; }
            audio.upgrade();
            toast(`${UPGRADE_SYSTEMS[sys].short} upgraded to level ${g.shipRecord.levels[sys]}`, 'good');
            if (oldClass !== this.previewId) g.selectShip(oldClass);
            this._buildShip();
            this._refreshFleet();
            this._refreshTab();
          });
        });
        foot.innerHTML = `<div class="row between small dim" style="width:100%"><span>Refit budget</span><b class="amber">${fmtC(Math.floor(g.state.credits))}</b></div>`;
      }
    }

    if (this.tab === 'customize') {
      if (!owned) {
        body.innerHTML = `<p class="small dim">Commission the ${escapeHtml(cls.name)} to paint and rename her.</p>`;
        foot.innerHTML = '';
      } else {
        const activeRec = g.state.ships[this.previewId];
        body.innerHTML = `
          <div class="field">
            <label>Hull livery</label>
            <div class="swatches" id="palettes">
              ${PALETTES.map((p) => `<button class="swatch-btn ${activeRec.palette === p.id ? 'sel' : ''}" data-pal="${p.id}" title="${escapeHtml(p.name)}" style="background:linear-gradient(135deg, ${p.hull}, ${p.trim})"></button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Nacelle glow</label>
            <div class="swatches" id="nacelles">
              ${NACELLE_COLORS.map((c) => `<button class="swatch-btn ${activeRec.nacelle === c ? 'sel' : ''}" data-nac="${c}" style="background:${c};box-shadow:0 0 14px ${c}66"></button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Deflector colour</label>
            <div class="swatches" id="deflectors">
              ${DEFLECTOR_COLORS.map((c) => `<button class="swatch-btn ${activeRec.deflector === c ? 'sel' : ''}" data-def="${c}" style="background:${c}"></button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Ship name</label>
            <input type="text" id="ship-name" maxlength="26" value="${escapeHtml(activeRec.name)}" />
          </div>
          <div class="field">
            <label>Registry</label>
            <input type="text" id="ship-registry" maxlength="14" value="${escapeHtml(activeRec.registry)}" />
          </div>
          <p class="tiny faint">Changes appear instantly on the hull decals and nacelle glow.</p>`;
        const apply = (patch) => {
          if (g.state.shipId !== this.previewId) {
            g.selectShip(this.previewId);
            toast(`${g.state.ships[this.previewId].name} is now your flagship`, 'good', 2200);
          }
          g.customize(patch);
          audio.ui();
          this._buildShip();
          this._refreshTab();
          this._refreshLabels();
        };
        $$('[data-pal]', body).forEach((b) => b.onclick = () => apply({ palette: b.dataset.pal }));
        $$('[data-nac]', body).forEach((b) => b.onclick = () => apply({ nacelle: b.dataset.nac }));
        $$('[data-def]', body).forEach((b) => b.onclick = () => apply({ deflector: b.dataset.def }));
        const nameInput = $('#ship-name', body);
        const regInput = $('#ship-registry', body);
        const commit = () => apply({ name: nameInput.value, registry: regInput.value });
        nameInput.addEventListener('change', commit);
        regInput.addEventListener('change', commit);
        foot.innerHTML = `<div class="row between small dim" style="width:100%"><span>Kills by this hull</span><b class="cyan">${activeRec.kills || 0}</b></div>`;
      }
    }

    if (this.tab === 'research') {
      const rp = Math.floor(g.state.research);
      body.innerHTML = `
        <div class="row between" style="margin-bottom:10px">
          <div><div class="tiny upper faint">Daystrom Institute</div><div class="small dim">Spend research points to unlock fleet technology</div></div>
          <span class="chip violet">${fmt(rp)} RP</span>
        </div>
        ${TECH_ORDER.map((tid) => {
          const t = TECHS[tid];
          const done = g.hasTech(tid);
          const check = g.canResearch(tid);
          const missing = t.requires ? t.requires.filter((r) => !g.hasTech(r)) : [];
          return `<div class="upgrade-row">
            <div class="ico" style="font-size:16px;width:26px;text-align:center">${t.icon}</div>
            <div class="u-meta">
              <div class="u-nm" style="color:${done ? 'var(--green)' : 'var(--ink)'}">${escapeHtml(t.name)}</div>
              <div class="u-ds">${escapeHtml(t.desc)}</div>
              ${missing.length ? `<div class="tiny" style="color:var(--amber);margin-top:3px">Requires ${missing.map((r) => TECHS[r].name).join(', ')}</div>` : ''}
            </div>
            ${done ? `<span class="chip green">Done</span>` : `<button class="btn sm" data-res="${tid}" ${check.ok ? '' : 'disabled'}>${fmt(t.cost)} RP</button>`}
          </div>`;
        }).join('')}`;
      body.querySelectorAll('[data-res]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const res = g.research(btn.dataset.res);
          if (!res.ok) { toast(res.why || 'Cannot research', 'warn'); audio.error(); return; }
          audio.upgrade();
          const t = TECHS[btn.dataset.res];
          toast(`Researched ${t.name} — ${t.effect}`, 'good', 3600);
          this._refreshFleet();
          this._refreshTab();
        });
      });
      foot.innerHTML = `<div class="row between small dim" style="width:100%"><span>Research rate</span><b class="violet">${fmt(g.civStats().researchRate)}/s</b></div>`;
    }
    body.scrollTop = scrollPos;
    this._refreshLabels();
  }

  _commission() {
    const g = this.game;
    const res = g.shipUnlock(this.previewId);
    if (!res.ok) { toast(res.why || 'Cannot commission', 'warn'); audio.error(); return; }
    audio.confirm();
    toast(`${SHIP_CLASSES[this.previewId].hullName} commissioned — you are aboard`, 'good', 3600);
    this.previewId = g.state.shipId;
    this._buildShip();
    this._refreshFleet();
    this._refreshTab();
  }

  update(dt, t) {
    if (!this._built) return;
    this.time += dt;
    this.controls.update();
    if (this.ship) {
      this.shipPivot.position.y = Math.sin(this.time * 0.7) * 0.18;
      this.ship.rotation.z = Math.sin(this.time * 0.5) * 0.012;
    }
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}

function statRow(label, value, max, cls) {
  return `<div class="statbar"><div class="lbl"><span>${label}</span><b>${fmt(value)}</b></div>${bar((value / max) * 100, cls)}</div>`;
}
