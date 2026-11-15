import * as THREE from 'three';
import { initDrawers } from '../ui/drawers.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EarthGlobe, vec3ToLatLon, latLonToVec3, EARTH_RADIUS } from '../art/earth.js';
import { makeSky, makeStars, glowSprite } from '../art/environment.js';
import { loadGLB } from '../art/imported.js';
import { el, $, $$, toast, fmtC, fmt, modal } from '../ui/dom.js';
import { DISTRICT_ORDER, DISTRICTS, districtUpgradeCost } from '../data/tech.js';
import { audio } from '../core/audio.js';
import { escapeHtml, clamp } from '../core/util.js';

const MIN_SEP_DEG = 4.2;

export class EarthScene {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200000);
    this.camera.position.set(-14, 12, 26);
    this.time = 0;
    this.buildType = null;
    this.selectedId = null;
    this.ghostLL = null;
    this._built = false;
    this._bindings = [];
  }

  _build() {
    const s = this.scene;
    s.add(makeSky(3, 8000));
    s.add(makeStars(1800, 5000));
    s.environment = this.app.environment || null;

    this.globe = new EarthGlobe(this.app.viewport.detail);
    this.scene.add(this.globe.group);

    // lighting
    const sunDir = this.globe.sunDir;
    this.sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.sunLight.position.copy(sunDir).multiplyScalar(60);
    s.add(this.sunLight);
    s.add(new THREE.AmbientLight(0x24364a, 0.55));
    const rim = new THREE.DirectionalLight(0x3a6fa8, 0.5);
    rim.position.set(-30, -10, -20);
    s.add(rim);

    const sunGlow = glowSprite('#ffe4b8', 1200, 0.4);
    sunGlow.position.copy(sunDir).multiplyScalar(4200);
    s.add(sunGlow);

    // orbit ring decoration
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(12.4, 12.55, 180),
      new THREE.MeshBasicMaterial({ color: 0x59e0ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2.3;
    this.scene.add(ring);
    this.orbitRing = ring;

    this.controls = new OrbitControls(this.camera, this.app.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 14.5;
    this.controls.maxDistance = 48;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.32;
    this.controls.target.set(0, 0, 0);
    this._buildingsShown = false;
    this._loadISS();
    this._built = true;
  }

  enter() {
    if (!this._built) this._build();
    this.scene.environment = this.app.environment || null;
    this.globe.syncDistricts(this.game.state.civ.districts);
    this.selectedId = null;
    this.buildType = null;
    this.controls.autoRotate = true;
    this.controls.update();
    this._buildUI();
    this._subscribe();
    this.globe.ready = true;
  }

  exit() {
    this.globe.removeGhost();
    this._bindings.forEach((off) => off());
    this._bindings = [];
    this.drawers?.destroy();
    this.drawers = null;
    this.ui?.remove();
    this.ui = null;
    this._labels?.remove();
    this._labels = null;
  }

  _subscribe() {
    this._bindings.push(this.game.bus.on('change', () => { this._refreshPanels(); this._syncGlobeExtras(); }));
    this._bindings.push(this.game.bus.on('customize', () => this._refreshPanels()));
  }

  /* ---------------------------------------------------------------- UI */
  _buildUI() {
    this.ui = el(`
      <div class="screen active earth-ui">
        <aside class="panel side-left">
          <div class="panel-head">
            <div><h3>Homeworld</h3><span class="sub">Sol III · Earth</span></div>
            <span class="chip cyan"><span class="dot"></span> Online</span>
          </div>
          <div class="panel-body scroll" id="civ-panel"></div>
          <div class="panel-foot" style="padding:10px 16px">
            <button class="btn wide" id="goto-galaxy">Galaxy Map ${'›'}</button>
          </div>
        </aside>

        <aside class="panel side-right">
          <div class="panel-head">
            <div><h3>Construction</h3><span class="sub">Terraform the globe</span></div>
            <span class="sub" id="district-count"></span>
          </div>
          <div class="panel-body scroll" id="build-panel"></div>
          <div class="panel-foot">
            <button class="btn primary wide" id="launch-btn">Launch Starship</button>
          </div>
        </aside>

        <div class="globe-hint" id="globe-hint"></div>
        <div class="globe-layers panel" id="globe-layers" hidden>
          <div class="gl-head"><b>Globe layers</b><button class="close-x" id="layers-close" aria-label="Close layers">✕</button></div>
          ${[['clouds', 'Cloud cover'], ['lights', 'City lights'], ['satellites', 'Orbital traffic'], ['shield', 'Planetary shield'], ['grid', 'Orbital grid'], ['labels', 'District labels']]
            .map(([k, n]) => `<label class="gl-row"><input type="checkbox" data-layer="${k}" checked> <span>${n}</span></label>`).join('')}
          <div class="gl-sun">
            <div class="row between"><span>Sun position</span><b id="sun-read">Live</b></div>
            <input type="range" min="0" max="24" step="0.25" value="12" id="sun-range" aria-label="Time of day">
            <button class="btn sm ghost" id="sun-live">Live sun</button>
          </div>
          <div class="gl-stats" id="gl-stats"></div>
        </div>
        <div class="globe-tools">
          <button class="icon-btn" id="tool-layers" title="Layers, sun and orbital traffic" aria-label="Globe layers">☰</button>
          <button class="icon-btn" id="tool-next" title="Fly to the next district" aria-label="Next district">⌖</button>
          <button class="icon-btn" id="tool-zoomin" title="Zoom in" aria-label="Zoom in">＋</button>
          <button class="icon-btn" id="tool-zoomout" title="Zoom out" aria-label="Zoom out">－</button>
          <button class="icon-btn" id="tool-rotate" title="Auto-rotate" aria-label="Auto-rotate">⟳</button>
          <button class="icon-btn" id="tool-reset" title="Reset view" aria-label="Reset view">◎</button>
          <button class="icon-btn" id="tool-launch" title="Launch" aria-label="Launch starship">🚀</button>
        </div>
      </div>`);
    document.getElementById('ui').appendChild(this.ui);
    // panels are drawers: closed by default so the 3D view gets the space
    this.drawers = initDrawers(this.ui, { key: 'earth' });

    this._labels = el('<div class="globe-labels"></div>');
    this.ui.appendChild(this._labels);

    $('#goto-galaxy', this.ui).onclick = () => { audio.ui(); this.app.setScene('galaxy'); };
    $('#launch-btn', this.ui).onclick = () => this._launch();
    $('#tool-launch', this.ui).onclick = () => this._launch();
    $('#tool-rotate', this.ui).onclick = () => {
      this.controls.autoRotate = !this.controls.autoRotate;
      $('#tool-rotate', this.ui).classList.toggle('active', this.controls.autoRotate);
      audio.ui();
    };
    $('#tool-reset', this.ui).onclick = () => {
      this.camera.position.set(-14, 12, 26);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      audio.ui();
    };
    $('#tool-rotate', this.ui).classList.toggle('active', this.controls.autoRotate);
    this._bindGlobeTools();

    this._refreshPanels();
    this._bindGlobeInput();
  }

  /**
   * Real spacecraft from NASA 3D Resources (public domain): the International
   * Space Station and the Hubble Space Telescope, in their real inclinations.
   * Skipped on low-end devices — the ISS alone is 174k triangles.
   */
  async _loadISS() {
    if (this.app.viewport.quality === 'low') return;
    this.orbiters = [];
    // ISS: 51.6° inclination, low orbit. Hubble: 28.5°, a little higher and slower.
    const crafts = [
      { url: '/assets/nasa/iss.glb', size: 0.9, incl: 51.6, alt: 1.06, speed: 0.155, phase: 0 },
      { url: '/assets/nasa/hubble.glb', size: 0.55, incl: 28.5, alt: 1.09, speed: 0.13, phase: 2.4 },
    ];
    await Promise.all(crafts.map(async (c) => {
      const { scene } = await loadGLB(c.url);
      if (!scene || !this.scene) return;
      const model = scene.clone(true);
      model.traverse((o) => { if (o.isMesh && o.material) o.material.envMapIntensity = 1.2; });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length();
      model.scale.setScalar(c.size / size);
      const pivot = new THREE.Group();
      pivot.rotation.x = THREE.MathUtils.degToRad(c.incl);
      pivot.rotation.y = c.phase;
      const holder = new THREE.Group();
      holder.position.set(EARTH_RADIUS * c.alt, 0, 0);
      holder.rotation.y = -Math.PI / 2;
      holder.add(model);
      pivot.add(holder);
      this.scene.add(pivot);
      this.orbiters.push({ pivot, holder, speed: c.speed, url: c.url });
    }));
    this.iss = this.orbiters[0] || null;
  }

  /** Layers, sun, traffic, shield, district hopping and zoom. */
  _bindGlobeTools() {
    const ui = this.ui;
    const layers = $('#globe-layers', ui);
    const prefs = (this.game.state.settings.globe ||= {});
    $('#tool-layers', ui).onclick = () => { audio.ui(); layers.hidden = !layers.hidden; $('#tool-layers', ui).classList.toggle('active', !layers.hidden); };
    $('#layers-close', ui).onclick = () => { layers.hidden = true; $('#tool-layers', ui).classList.remove('active'); };
    ui.querySelectorAll('[data-layer]').forEach((box) => {
      const k = box.dataset.layer;
      box.checked = prefs[k] !== false;
      const apply = () => {
        prefs[k] = box.checked;
        if (k === 'labels') { if (this._labels) this._labels.hidden = !box.checked; } else this.globe.setLayer(k, box.checked);
      };
      box.onchange = () => { apply(); audio.ui(); this.game.scheduleSave(); };
      apply();
    });
    const range = $('#sun-range', ui);
    const read = $('#sun-read', ui);
    const fmtH = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    range.oninput = () => { this._sunHour = +range.value; this.globe.setSunHour(this._sunHour); read.textContent = fmtH(this._sunHour); };
    $('#sun-live', ui).onclick = () => { this._sunHour = null; this.globe.setSunHour(this._liveHour()); read.textContent = 'Live'; audio.ui(); };
    $('#tool-next', ui).onclick = () => this._flyToNextDistrict();
    $('#tool-zoomin', ui).onclick = () => this._zoom(0.8);
    $('#tool-zoomout', ui).onclick = () => this._zoom(1.25);
    this._syncGlobeExtras();
  }

  _liveHour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }

  /** Traffic and shield follow the civilisation; called whenever it changes. */
  _syncGlobeExtras() {
    if (!this.globe) return;
    const ds = this.game.state.civ.districts;
    const lvl = (type) => ds.filter((d) => d.type === type).reduce((a, d) => a + d.level, 0);
    this.globe.setTraffic(8 + ds.length * 4 + lvl('shipyard') * 6);
    this.globe.setShieldLevel(lvl('defense'));
    const prefs = this.game.state.settings.globe || {};
    this.globe.setLayer('satellites', prefs.satellites !== false);
    this.globe.setLayer('shield', prefs.shield !== false);
    const st = this.ui && $('#gl-stats', this.ui);
    if (st) st.innerHTML = `<span>${this.globe.satellites?.children.length || 0} craft in orbit</span><span>Shield ${lvl('defense') ? `level ${lvl('defense')}` : 'offline'}</span>`;
  }

  _zoom(f) {
    const c = this.controls;
    const dir = this.camera.position.clone().sub(c.target);
    const d = Math.min(c.maxDistance, Math.max(c.minDistance, dir.length() * f));
    this.camera.position.copy(c.target).add(dir.setLength(d));
    c.update();
    audio.ui();
  }

  _flyToNextDistrict() {
    const ds = this.game.state.civ.districts;
    if (!ds.length) return;
    this._hop = ((this._hop ?? -1) + 1) % ds.length;
    const d = ds[this._hop];
    const p = this.globe.districtWorldPosition(d.lat, d.lon);
    const dist = Math.max(this.controls.minDistance + 2, 20);
    this._flyTo = { from: this.camera.position.clone(), to: p.clone().setLength(dist), t: 0 };
    this.controls.autoRotate = false;
    $('#tool-rotate', this.ui)?.classList.remove('active');
    this.globe.setSelected?.(d.id);
    toast(`${DISTRICTS[d.type]?.name || 'District'} · level ${d.level}`, 'good', 1600);
    audio.ui();
  }

  _launch() {
    audio.ensure();
    audio.confirm();
    this.app.setScene('system');
  }

  _refreshPanels() {
    if (!this.ui) return;
    const g = this.game;
    const civ = g.civStats();
    const districts = g.state.civ.districts;
    this.globe.syncDistricts(districts);
    $('#district-count', this.ui).textContent = `${districts.length} / 22`;

    // ---- left: civilisation
    const civPanel = $('#civ-panel', this.ui);
    const scrollPos = civPanel.scrollTop;
    civPanel.innerHTML = `
      <div class="civ-head">
        <span class="civ-name">${escapeHtml(g.state.civ.name)}</span>
        <button class="icon-btn" id="rename-civ" style="width:26px;height:26px;font-size:11px;margin-left:auto" title="Rename">✎</button>
      </div>
      <div class="res-grid">
        <div class="res-cell"><div class="k">Population</div><div class="v" data-civ="pop">${fmt(civ.population)}</div><div class="s" data-civ="cap">of ${fmt(civ.popCap)}</div></div>
        <div class="res-cell"><div class="k">Income</div><div class="v amber" data-civ="income">${fmtC(civ.income)}</div><div class="s">per second</div></div>
        <div class="res-cell"><div class="k">Research</div><div class="v violet" data-civ="research">${fmt(civ.researchRate)}</div><div class="s">RP per second</div></div>
        <div class="res-cell"><div class="k">Defence</div><div class="v" data-civ="defense">${Math.round(civ.defense * 10)}</div><div class="s">planetary shield</div></div>
      </div>
      <div class="hr"></div>
      <div class="row between" style="margin-bottom:8px">
        <div class="tiny upper faint">Districts</div>
        <div class="tiny faint">tap to inspect</div>
      </div>
      <div class="district-list" id="district-list">
        ${districts.map((d) => {
          const def = DISTRICTS[d.type] || DISTRICTS.residential;
          const y = def.yield(d.level);
          return `<div class="district-row ${d.id === this.selectedId ? 'sel' : ''}" data-district="${d.id}">
            <div class="ico" style="color:${def.color}">${def.icon}</div>
            <div class="meta">
              <div class="nm">${escapeHtml(def.name)}</div>
              <div class="ds">Level ${d.level} · +₡${fmt(y.credits)}/s${y.research ? ` · +${y.research} RP/s` : ''}</div>
            </div>
            <span class="chip">${d.level}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="hr"></div>
      <div class="row between small dim">
        <span>Fleet flagship</span><b class="cyan">${escapeHtml(g.shipRecord.name)}</b>
      </div>
      <div class="row between small dim" style="margin-top:4px">
        <span>Ships in service</span><b>${g.state.ownedShips.length}</b>
      </div>
      <div class="row between small dim" style="margin-top:4px">
        <span>Systems charted</span><b>${g.state.visited.length}</b>
      </div>`;
    civPanel.scrollTop = scrollPos;

    $('#rename-civ', this.ui).onclick = () => {
      const name = window.prompt('Name your civilisation', g.state.civ.name);
      if (name) { g.renameCiv(name); toast('Civilisation renamed', 'good'); this._refreshPanels(); }
    };
    $$('[data-district]', civPanel).forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedId = row.dataset.district;
        this.globe.setSelected(this.selectedId);
        audio.ui();
        this._refreshPanels();
        this._refreshBuildPanel();
      });
    });

    this._refreshBuildPanel();
    this._refreshLabels();
  }

  _refreshBuildPanel() {
    if (!this.ui) return;
    const g = this.game;
    const panel = $('#build-panel', this.ui);
    const sel = g.state.civ.districts.find((d) => d.id === this.selectedId);
    const cards = DISTRICT_ORDER.map((tid) => {
      const def = DISTRICTS[tid];
      const check = g.canBuildDistrict(tid);
      const cost = g.districtCost(tid);
      return `<button class="build-card ${this.buildType === tid ? 'sel' : ''}" data-build="${tid}" ${check.ok ? '' : 'disabled'}>
        <div class="bc-ico" style="color:${def.color}">${def.icon}</div>
        <div class="bc-nm">${def.name.replace(' District', '')}</div>
        <div class="bc-cost">${cost ? fmtC(cost) : 'Built'}</div>
      </button>`;
    }).join('');

    let detail = '';
    if (sel) {
      const def = DISTRICTS[sel.type];
      const maxed = sel.level >= def.maxLevel;
      const cost = districtUpgradeCost(sel.type, sel.level + 1);
      const y = def.yield(sel.level);
      const yn = def.yield(sel.level + 1);
      detail = `
        <div class="hr"></div>
        <div class="row between">
          <div class="row"><span style="font-size:18px">${def.icon}</span><b style="letter-spacing:.06em">${escapeHtml(def.name)}</b></div>
          <span class="chip amber">Lv ${sel.level}</span>
        </div>
        <p class="small dim" style="line-height:1.5;margin:8px 0 10px">${escapeHtml(def.desc)}</p>
        <div class="grid2">
          <div class="res-cell"><div class="k">Credits</div><div class="v">+₡${fmt(y.credits)}/s</div>${yn.credits > y.credits ? `<div class="s">→ +₡${fmt(yn.credits)}/s</div>` : ''}</div>
          <div class="res-cell"><div class="k">Research</div><div class="v">+${fmt(y.research)}/s</div>${yn.research > y.research ? `<div class="s">→ +${fmt(yn.research)}/s</div>` : ''}</div>
        </div>
        <button class="btn primary wide" id="upgrade-district" style="margin-top:10px" ${maxed ? 'disabled' : ''}>
          ${maxed ? 'Maximum level' : `Upgrade · ${fmtC(cost)}`}
        </button>`;
    } else {
      detail = `<div class="hr"></div><p class="small faint" style="line-height:1.55;margin:0">Select a district type, then tap the globe to place it. Districts generate credits and research in real time — even while you are away.</p>`;
    }

    panel.innerHTML = `
      <div class="build-grid">${cards}</div>
      <div id="build-detail">${detail}</div>`;

    $$('[data-build]', panel).forEach((card) => {
      card.addEventListener('click', () => {
        const type = card.dataset.build;
        if (this.buildType === type) {
          this._cancelBuild();
          return;
        }
        const check = g.canBuildDistrict(type);
        if (!check.ok) { toast(check.why, 'warn'); audio.error(); return; }
        this.buildType = type;
        this.selectedId = null;
        this.globe.setSelected(null);
        this._showHint(true);
        audio.ui();
        this._refreshBuildPanel();
      });
    });

    const upBtn = $('#upgrade-district', panel);
    if (upBtn) {
      upBtn.onclick = () => {
        const res = g.upgradeDistrict(this.selectedId);
        if (!res.ok) { toast(res.why || 'Cannot upgrade', 'warn'); audio.error(); return; }
        audio.build();
        toast('District upgraded', 'good');
        this._refreshPanels();
        this.globe.syncDistricts(g.state.civ.districts);
      };
    }
  }

  _showHint(on) {
    const hint = $('#globe-hint', this.ui);
    if (!hint) return;
    if (on && this.buildType) {
      const def = DISTRICTS[this.buildType];
      hint.textContent = `Tap the globe to place ${def.name}`;
      hint.classList.add('on');
    } else hint.classList.remove('on');
  }

  _cancelBuild() {
    this.buildType = null;
    this.ghostLL = null;
    this.globe.removeGhost();
    this._showHint(false);
    if (this.ui) this._refreshBuildPanel();
  }

  /* ---------------------------------------------------------------- globe input */
  _pointerNDC(e) {
    const r = this.app.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -(((e.clientY - r.top) / r.height) * 2 - 1)
    );
  }

  _bindGlobeInput() {
    this.raycaster = new THREE.Raycaster();
    let down = null;
    const onDown = (e) => {
      if (e.target !== this.app.canvas) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onMove = (e) => {
      if (!this.buildType) return;
      this.raycaster.setFromCamera(this._pointerNDC(e), this.camera);
      const p = this.globe.pickSurface(this.raycaster);
      if (!p) { this.globe.removeGhost(); this.ghostLL = null; return; }
      const ll = this.globe.worldToLatLon(p);
      this.ghostLL = ll;
      if (!this.globe.ghost) this.globe.createGhost(ll.lat, ll.lon, DISTRICTS[this.buildType]?.color);
      else {
        const local = latLonToVec3(ll.lat, ll.lon, EARTH_RADIUS + 0.12);
        const world = this.globe.tilt.localToWorld(local.clone());
        this.globe.ghost.position.copy(this.globe.tilt.worldToLocal(world.clone()));
        this.globe.ghost.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local.clone().normalize());
      }
    };
    const onUp = (e) => {
      if (!down || e.target !== this.app.canvas) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dur = performance.now() - down.t;
      down = null;
      if (moved > 8 || dur > 700) return;
      // treat as click
      this.raycaster.setFromCamera(this._pointerNDC(e), this.camera);
      const marker = this.globe.pickMarker(this.raycaster);
      if (marker && !this.buildType) {
        this.selectedId = marker.userData.districtId;
        this.globe.setSelected(this.selectedId);
        audio.ui();
        this._refreshPanels();
        return;
      }
      if (this.buildType) {
        const p = this.globe.pickSurface(this.raycaster);
        if (!p) return;
        const ll = this.globe.worldToLatLon(p);
        this._placeDistrict(ll.lat, ll.lon);
      } else if (!marker) {
        this.selectedId = null;
        this.globe.setSelected(null);
        this._refreshPanels();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && this.buildType) this._cancelBuild();
    };
    this.app.canvas.addEventListener('pointerdown', onDown);
    this.app.canvas.addEventListener('pointermove', onMove);
    this.app.canvas.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    this._bindings.push(() => {
      this.app.canvas.removeEventListener('pointerdown', onDown);
      this.app.canvas.removeEventListener('pointermove', onMove);
      this.app.canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    });
  }

  _placeDistrict(lat, lon) {
    const g = this.game;
    const type = this.buildType;
    if (!type) return;
    // spacing check
    for (const d of g.state.civ.districts) {
      let dLon = Math.abs(d.lon - lon);
      if (dLon > 180) dLon = 360 - dLon;
      const y1 = Math.sin((lat * Math.PI) / 180), y2 = Math.sin((d.lat * Math.PI) / 180);
      const x1 = Math.cos((lat * Math.PI) / 180), x2 = Math.cos((d.lat * Math.PI) / 180);
      const cosA = y1 * y2 + x1 * x2 * Math.cos(((dLon) * Math.PI) / 180);
      const angle = (Math.acos(clamp(cosA, -1, 1)) * 180) / Math.PI;
      if (angle < MIN_SEP_DEG) {
        toast('Too close to an existing district', 'warn');
        audio.error();
        return;
      }
    }
    const res = g.buildDistrict(type, lat, lon);
    if (!res.ok) {
      toast(res.why || 'Cannot build here', 'warn');
      audio.error();
      this._refreshBuildPanel();
      return;
    }
    audio.build();
    const def = DISTRICTS[type];
    toast(`${def.name} established · ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`, 'good');
    this.globe.removeGhost();
    this.ghostLL = null;
    this.buildType = null;
    this._showHint(false);
    this.globe.syncDistricts(g.state.civ.districts);
    this._refreshPanels();
  }

  /* ---------------------------------------------------------------- labels */
  _refreshLabels() {
    if (!this._labels) return;
    const districts = this.game.state.civ.districts;
    this._labels.innerHTML = districts.map((d) => {
      const def = DISTRICTS[d.type] || DISTRICTS.residential;
      return `<div class="globe-label" data-label="${d.id}" style="--c:${def.color}">
        <span class="ic">${def.icon}</span><span class="tx">${escapeHtml(def.name.replace(' District', ''))}</span><span class="lv">${d.level}</span>
      </div>`;
    }).join('');
    $$('[data-label]', this._labels).forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedId = n.dataset.label;
        this.globe.setSelected(this.selectedId);
        audio.ui();
        this._refreshPanels();
      });
    });
  }

  _updateLabels() {
    if (!this._labels || !this.globe) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    for (const node of this._labels.children) {
      const id = node.dataset.label;
      const marker = this.globe.markers.get(id);
      if (!marker) { node.style.display = 'none'; continue; }
      const p = new THREE.Vector3();
      marker.getWorldPosition(p);
      const normal = p.clone().normalize();
      const toCam = this.camera.position.clone().sub(p).normalize();
      const visible = normal.dot(toCam) > 0.12;
      const proj = p.clone().project(this.camera);
      if (!visible || proj.z > 1) { node.style.display = 'none'; continue; }
      node.style.display = 'flex';
      const x = ((proj.x + 1) / 2) * rect.width;
      const y = ((-proj.y + 1) / 2) * rect.height;
      node.style.transform = `translate(-50%, -140%) translate(${x}px, ${y}px)`;
      node.style.opacity = clamp(0.35 + (1 - proj.z) * 0.9, 0.3, 1);
    }
  }

  update(dt, t) {
    if (!this._built) return;
    this.time += dt;
    if (this._sunHour == null && this.globe.setSunHour && (this._sunTick = (this._sunTick || 0) + dt) > 5) {
      this._sunTick = 0;
      this.globe.setSunHour(this._liveHour());
    }
    if (this._flyTo) {
      const f = this._flyTo;
      f.t = Math.min(1, f.t + dt * 1.4);
      const k = f.t * f.t * (3 - 2 * f.t);
      this.camera.position.lerpVectors(f.from, f.to, k).setLength(f.from.length() + (f.to.length() - f.from.length()) * k);
      if (f.t >= 1) this._flyTo = null;
    }
    this.globe.update(dt, t);
    if (this.orbiters) {
      const show = this.game.state.settings.globe?.satellites !== false;
      for (const o of this.orbiters) {
        o.pivot.rotation.y += dt * o.speed;   // ~40 s per orbit
        o.pivot.visible = show;
      }
    }
    this.globe.animateMarkers(this.time);
    this.globe.setGhostPulse(this.time);
    this.controls.update();
    if (this.orbitRing) this.orbitRing.rotation.z += dt * 0.02;
    this._updateLabels();
    if (this.sunLight) {
      this.sunLight.position.copy(this.globe.sunDir).multiplyScalar(60);
      this.sunLight.intensity = 2.4;
    }
    this._tickAcc = (this._tickAcc || 0) + dt;
    if (this._tickAcc > 0.5) {
      this._tickAcc = 0;
      this._updateReadouts();
    }
  }

  _updateReadouts() {
    if (!this.ui) return;
    const civ = this.game.civStats();
    const set = (k, v) => {
      const node = this.ui.querySelector(`[data-civ="${k}"]`);
      if (node) node.textContent = v;
    };
    set('pop', fmt(civ.population));
    set('cap', `of ${fmt(civ.popCap)}`);
    set('income', fmtC(civ.income));
    set('research', fmt(civ.researchRate));
    set('defense', Math.round(civ.defense * 10));
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
