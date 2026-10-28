import * as THREE from 'three';
import { initDrawers } from '../ui/drawers.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeSky, makeStars, glowSprite } from '../art/environment.js';
import { glowTexture } from '../art/textures.js';
import { BlackHole } from '../art/blackhole.js';
import { el, $, $$, toast, fmtC, fmt, modal } from '../ui/dom.js';
import { FACTION_INFO } from '../data/enemies.js';
import { PLANET_TYPES, STAR_LABEL } from '../data/galaxy.js';
import { audio } from '../core/audio.js';
import { escapeHtml, clamp } from '../core/util.js';

export class GalaxyScene {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 200000);
    this.camera.position.set(0, 420, 380);
    this.time = 0;
    this.selectedId = null;
    this._built = false;
    this._nodes = new Map();
  }

  _build() {
    const s = this.scene;
    s.add(makeSky(9, 60000));
    s.add(makeStars(3000, 40000));
    s.environment = this.app.environment || null;

    // circular sector grid
    const gridGroup = new THREE.Group();
    for (const r of [80, 160, 240, 320, 400]) {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1d4a63, transparent: true, opacity: 0.28 }));
      gridGroup.add(line);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * 420, 0, Math.sin(a) * 420),
      ]);
      gridGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1d4a63, transparent: true, opacity: 0.16 })));
    }
    s.add(gridGroup);

    // warp lanes
    const lanePositions = [];
    for (const lane of this.game.galaxy.lanes) {
      const a = this.game.galaxy.byId[lane.a];
      const b = this.game.galaxy.byId[lane.b];
      if (!a || !b) continue;
      lanePositions.push(a.x, 0, a.y, b.x, 0, b.y);
    }
    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(lanePositions, 3));
    const lanes = new THREE.LineSegments(laneGeo, new THREE.LineBasicMaterial({ color: 0x2f6f8e, transparent: true, opacity: 0.22 }));
    s.add(lanes);

    // systems
    for (const sys of this.game.galaxy.systems) {
      const g = new THREE.Group();
      g.position.set(sys.x, 0, sys.y);
      const factionColor = new THREE.Color(FACTION_INFO[sys.faction]?.color || '#9fb4c8');
      const size = sys.blackhole ? 16 : clamp(4 + sys.threat * 0.9, 5, 13);

      if (sys.blackhole) {
        const bh = new BlackHole({ radius: 3.2, quality: 0.6, jets: false });
        bh.group.rotation.x = 0.4;
        g.add(bh.group);
        sys._bh = bh;
        const halo = glowSprite(sys.boss ? '#b47bff' : '#ff9a3c', 26, 0.5);
        g.add(halo);
      } else {
        const star = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(sys.starColor), color: new THREE.Color(sys.starColor),
          transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        star.scale.setScalar(size * 2.6);
        g.add(star);
        if (sys.landmark || sys.capital) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(size * 1.6, size * 1.9, 48), new THREE.MeshBasicMaterial({
            color: factionColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
          }));
          ring.rotation.x = -Math.PI / 2;
          g.add(ring);
        }
      }

      // click/hover target sphere (invisible)
      const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(9, size * 1.3), 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.userData.systemId = sys.id;
      g.add(hit);
      g.userData.hit = hit;
      g.userData.sys = sys;

      // selection ring
      const sel = new THREE.Mesh(new THREE.RingGeometry(14, 16.5, 6), new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      }));
      sel.rotation.x = -Math.PI / 2;
      sel.visible = false;
      g.add(sel);
      g.userData.selRing = sel;

      s.add(g);
      this._nodes.set(sys.id, g);

      if (sys.boss) {
        const pulse = glowSprite('#b47bff', 60, 0.12);
        g.add(pulse);
      }
    }

    // current-system marker
    this.currentRing = new THREE.Mesh(new THREE.RingGeometry(12, 13.4, 64), new THREE.MeshBasicMaterial({
      color: 0x62f2a6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    this.currentRing.rotation.x = -Math.PI / 2;
    s.add(this.currentRing);

    s.add(new THREE.AmbientLight(0xffffff, 1.2));
    const p = new THREE.PointLight(0x88bbff, 40, 800, 2);
    p.position.set(0, 200, 200);
    s.add(p);

    this.controls = new OrbitControls(this.camera, this.app.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.minPolarAngle = 0.08;
    this.controls.minDistance = 90;
    this.controls.maxDistance = 900;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.8;
    this._built = true;
  }

  enter() {
    if (!this._built) this._build();
    this.scene.environment = this.app.environment || null;
    this.selectedId = this.game.state.currentSystemId;
    const cur = this.game.galaxy.byId[this.selectedId];
    this.controls.target.set(cur.x, 0, cur.y);
    this.camera.position.set(cur.x + cur.x * 0.35, 330, cur.y + 300);
    if (this.camera.position.length() < 120) this.camera.position.set(200, 360, 320);
    this.controls.update();
    this.currentRing.position.set(cur.x, 0.4, cur.y);
    this._buildUI();
    this._refresh();
    this._bindings = [this.game.bus.on('change', () => { this._refresh(); })];
    audio.startMusic();
  }

  exit() {
    if (this._enterKey) window.removeEventListener('keydown', this._enterKey);
    this._enterKey = null;
    this._bindings?.forEach((off) => off());
    this._bindings = [];
    this.drawers?.destroy();
    this.drawers = null;
    this.ui?.remove();
    this.ui = null;
    this._labels?.remove();
    this._labels = null;
  }

  _buildUI() {
    this.ui = el(`
      <div class="screen active galaxy-ui">
        <aside class="panel side-left">
          <div class="panel-head">
            <div><h3>Sector Map</h3><span class="sub">${this.game.galaxy.systems.length} systems</span></div>
            <span class="chip cyan" id="visited-chip"></span>
          </div>
          <div class="panel-body scroll" id="sys-list" style="padding-top:8px"></div>
          <div class="panel-foot" style="padding:10px 14px">
            <div class="row between small dim"><span>Dilithium</span><b class="cyan" id="gal-dil"></b></div>
            <div class="row between small dim" style="margin-top:4px"><span>Current position</span><b id="gal-cur" style="color:var(--green)"></b></div>
          </div>
        </aside>
        <aside class="panel side-right">
          <div class="panel-head">
            <div><h3>Navigation</h3><span class="sub">Stellar cartography</span></div>
            <span class="sub" id="gal-coords"></span>
          </div>
          <div class="panel-body scroll" id="sys-detail"></div>
          <div class="panel-foot" id="gal-foot"></div>
        </aside>
        <div class="globe-hint on" style="opacity:.75">Drag to orbit · scroll / pinch to zoom · tap a star to select</div>
      </div>`);
    document.getElementById('ui').appendChild(this.ui);
    // panels are drawers: closed by default so the 3D view gets the space
    this.drawers = initDrawers(this.ui, { key: 'galaxy' });
    this._labels = el('<div class="globe-labels"></div>');
    this.ui.appendChild(this._labels);
  }

  _sortedSystems() {
    const g = this.game;
    const cur = g.galaxy.byId[g.state.currentSystemId];
    return g.galaxy.systems.slice().sort((a, b) => {
      if (a.id === g.state.currentSystemId) return -1;
      if (b.id === g.state.currentSystemId) return 1;
      const av = g.state.visited.includes(a.id), bv = g.state.visited.includes(b.id);
      if (av !== bv) return av ? -1 : 1;
      return Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y);
    });
  }

  _refresh() {
    if (!this.ui) return;
    const g = this.game;
    const systems = this._sortedSystems();
    $('#visited-chip', this.ui).textContent = `${g.state.visited.length} charted`;
    $('#gal-dil', this.ui).textContent = fmt(g.state.dilithium);
    const cur = g.galaxy.byId[g.state.currentSystemId];
    $('#gal-cur', this.ui).textContent = cur.name;

    const list = $('#sys-list', this.ui);
    list.innerHTML = systems.map((sys) => {
      const fi = FACTION_INFO[sys.faction] || FACTION_INFO.neutral;
      const visited = g.state.visited.includes(sys.id);
      const current = sys.id === g.state.currentSystemId;
      const d = Math.hypot(sys.x - cur.x, sys.y - cur.y);
      return `<div class="sys-row ${sys.id === this.selectedId ? 'sel' : ''} ${current ? 'current' : ''} ${visited ? '' : 'locked'}" data-sys="${sys.id}">
        <span class="orb" style="color:${sys.blackhole ? '#b47bff' : fi.color};background:${sys.blackhole ? '#140a1f' : fi.color}"></span>
        <span class="nm">${escapeHtml(sys.name)}</span>
        ${sys.blackhole ? '<span class="chip violet" style="padding:1px 5px;font-size:8px">BH</span>' : ''}
        <span class="ly">${current ? 'HERE' : `${d.toFixed(0)} ly`}</span>
      </div>`;
    }).join('');
    $$('[data-sys]', list).forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedId = row.dataset.sys;
        audio.ui();
        this._selectSystem(this.selectedId);
      });
    });

    this._refreshDetail();
    this._refreshLabels();
    if (this._enterKey) window.removeEventListener('keydown', this._enterKey);
    this._enterKey = (e) => {
      if (e.key !== 'Enter' || !this.selectedId) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      const sys = this.game.galaxy.byId[this.selectedId];
      const cur = this.game.state.currentSystemId === this.selectedId;
      if (!sys || cur) return;
      const can = this.game.canWarpTo(sys.id);
      if (can.ok) this._engage(sys);
      else toast(can.why, 'warn');
    };
    window.addEventListener('keydown', this._enterKey);
    for (const [id, node] of this._nodes) {
      node.userData.selRing.visible = id === this.selectedId;
      node.userData.selRing.material.opacity = 0.9;
    }
  }

  _selectSystem(id) {
    this.selectedId = id;
    const sys = this.game.galaxy.byId[id];
    if (sys) {
      const node = this._nodes.get(id);
      if (node) this.controls.target.lerp(new THREE.Vector3(sys.x, 0, sys.y), 0.75);
    }
    this._refresh();
  }

  _refreshDetail() {
    if (!this.ui) return;
    const g = this.game;
    const sys = g.galaxy.byId[this.selectedId] || g.galaxy.byId[g.state.currentSystemId];
    const fi = FACTION_INFO[sys.faction] || FACTION_INFO.neutral;
    const current = sys.id === g.state.currentSystemId;
    const cost = g.warpCostTo(sys.id);
    const can = g.canWarpTo(sys.id);
    $('#gal-coords', this.ui).textContent = `${Math.round(sys.x)} · ${Math.round(sys.y)}`;

    const planets = sys.planets || [];
    const surveyedHere = planets.filter((p) => g.isSurveyed(p.id)).length;
    const detail = $('#sys-detail', this.ui);
    detail.innerHTML = `
      <div class="sys-hero">
        <div class="row between">
          <span class="chip" style="color:${fi.color};border-color:${fi.color}66">${escapeHtml(fi.name)}</span>
          ${sys.blackhole ? '<span class="chip violet">Singularity</span>' : ''}
          ${sys.landmark ? '<span class="chip amber">Landmark</span>' : ''}
        </div>
        <h2 style="margin-top:8px">${escapeHtml(sys.name)}</h2>
        <div class="small faint">${STAR_LABEL[sys.star] || 'Unknown stellar class'} · ${Math.round(sys.ly)} ly from Sol</div>
      </div>
      <div class="sys-facts">
        <div class="fact"><div class="k">Threat</div><div class="v" style="color:${sys.threat >= 5 ? 'var(--red)' : sys.threat >= 3 ? 'var(--amber)' : 'var(--green)'}">${g.difficultyLabelFor(sys)} (${sys.threat}/8)</div></div>
        <div class="fact"><div class="k">Planets</div><div class="v">${planets.length} · ${surveyedHere} surveyed</div></div>
        <div class="fact"><div class="k">Distress contacts</div><div class="v">${g.anomaliesFor(sys.id).filter((a) => !g.state.anomalies.includes(a.id)).length} open</div></div>
        <div class="fact"><div class="k">Warp cost</div><div class="v cyan">${cost} D</div></div>
      </div>
      <p class="small dim" style="line-height:1.55;margin:0 0 12px">${escapeHtml(sys.desc)}</p>
      <div class="tiny upper faint" style="margin-bottom:6px">Planetary bodies</div>
      <div class="planet-mini">
        ${planets.length ? planets.map((p) => {
          const t = PLANET_TYPES[p.type];
          return `<div class="planet-mini-row">
            <span class="swatch" style="background:radial-gradient(circle at 35% 30%, ${t.colors[2]}, ${t.colors[0]} 55%, ${t.colors[1]})"></span>
            <span style="flex:1">${escapeHtml(p.name)}</span>
            <span class="tiny faint">${t.short}</span>
            ${g.isSurveyed(p.id) ? '<span class="chip green" style="padding:1px 5px;font-size:8px">CHARTED</span>' : ''}
          </div>`;
        }).join('') : '<div class="small faint">No planetary bodies — station or deep-space facility only.</div>'}
      </div>
      ${sys.blackhole ? `<div class="codex-entry" style="margin-top:12px;border-color:rgba(180,123,255,.35)">
        <div class="tag" style="color:var(--violet)">Gravitational anomaly</div>
        <p style="margin-top:6px">Event horizon gravity well. Approach within two radii and your hull will be torn apart. Starfleet recommends Singularity Physics research before entry.</p>
      </div>` : ''}`;

    const foot = $('#gal-foot', this.ui);
    if (current) {
      foot.innerHTML = `<button class="btn primary wide" id="enter-sys">Enter system · Launch</button>`;
      $('#enter-sys', foot).onclick = () => { audio.confirm(); this.app.setScene('system'); };
    } else {
      foot.innerHTML = `
        ${!can.ok ? `<div class="tiny" style="color:var(--amber);margin-bottom:8px">${escapeHtml(can.why)}</div>` : ''}
        <button class="btn primary wide" id="engage" ${can.ok ? '' : 'disabled'}>✧ Engage warp · ${cost} dilithium <span class="kbd">Enter</span></button>
        <div class="row between small faint" style="margin-top:8px;width:100%"><span>Distance</span><span>${Math.hypot(sys.x - g.system.x, sys.y - g.system.y).toFixed(1)} ly</span></div>`;
      $('#engage', foot)?.addEventListener('click', () => this._engage(sys));
      // double-click a system row to jump straight there
      $$('[data-sys]', this.ui).forEach((row) => {
        row.addEventListener('dblclick', () => { if (can.ok) this._engage(sys); });
      });
    }
  }

  _engage(sys) {
    if (!sys || this._jumping) return;
    this._jumping = true;
    setTimeout(() => { this._jumping = false; }, 300);
    const g = this.game;
    const check = g.canWarpTo(sys.id);
    if (!check.ok) { toast(check.why, 'warn'); audio.error(); return; }
    audio.ensure();
    audio.warp();
    this.app.warpTransition({
      title: `Warp to ${sys.name}`,
      sub: `Factor ${(6 + Math.min(3.9, Math.hypot(sys.x - g.system.x, sys.y - g.system.y) / 60)).toFixed(1)} · ${check.cost} dilithium`,
      duration: 2100,
      onMid: () => {
        const res = g.warpTo(sys.id);
        if (!res.ok) return;
        this.app.setScene('system');
        const s = this.app.current;
        if (s?.addLog) s.addLog(`Arrived in ${sys.name} — ${g.difficultyLabelFor(sys)} threat`, 'warn');
      },
    });
  }

  _refreshLabels() {
    if (!this._labels) return;
    const g = this.game;
    const cur = g.galaxy.byId[g.state.currentSystemId];
    const showIds = new Set();
    for (const sys of g.galaxy.systems) {
      const near = Math.hypot(sys.x - cur.x, sys.y - cur.y) < 120;
      if (sys.landmark || sys.capital || near || g.state.visited.includes(sys.id) || sys.id === this.selectedId) showIds.add(sys.id);
    }
    this._labels.innerHTML = [...showIds].map((id) => {
      const sys = g.galaxy.byId[id];
      const fi = FACTION_INFO[sys.faction] || FACTION_INFO.neutral;
      const visited = g.state.visited.includes(id);
      return `<div class="globe-label map-label" data-syslabel="${id}" style="--c:${sys.blackhole ? '#b47bff' : fi.color};border-color:${sys.blackhole ? '#b47bff' : fi.color}66;opacity:${visited ? 1 : 0.6}">
        <span class="ic" style="color:${sys.blackhole ? '#b47bff' : fi.color}">${sys.blackhole ? '🕳' : sys.landmark ? '★' : '•'}</span>
        <span class="tx">${escapeHtml(sys.name)}</span>
      </div>`;
    }).join('');
    $$('[data-syslabel]', this._labels).forEach((n) => {
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectSystem(n.dataset.syslabel);
        audio.ui();
      });
    });
  }

  _updateLabels() {
    if (!this._labels) return;
    const rect = this.app.canvas.getBoundingClientRect();
    for (const node of this._labels.children) {
      const sys = this.game.galaxy.byId[node.dataset.syslabel];
      if (!sys) continue;
      const p = new THREE.Vector3(sys.x, 12, sys.y);
      const proj = p.project(this.camera);
      if (proj.z > 1) { node.style.display = 'none'; continue; }
      node.style.display = 'flex';
      const x = ((proj.x + 1) / 2) * rect.width;
      const y = ((-proj.y + 1) / 2) * rect.height;
      node.style.transform = `translate(-50%, -170%) translate(${x}px, ${y}px)`;
    }
  }

  update(dt, t) {
    if (!this._built) return;
    this.time += dt;
    this.controls.update();
    this._updateLabels();
    this.currentRing.rotation.z += dt * 0.25;
    const cur = this.game.galaxy.byId[this.game.state.currentSystemId];
    this.currentRing.position.set(cur.x, 0.5, cur.y);
    const pulse = 1 + Math.sin(this.time * 2) * 0.06;
    this.currentRing.scale.setScalar(pulse);
    for (const node of this._nodes.values()) {
      if (node.userData.selRing.visible) {
        node.userData.selRing.rotation.z += dt * 0.6;
        node.userData.selRing.scale.setScalar(1 + Math.sin(this.time * 3) * 0.05);
      }
    }
    const bh = this._nodes.get(this.game.state.currentSystemId)?.userData.sys?._bh;
    // animate every black hole we built
    for (const node of this._nodes.values()) {
      const sys = node.userData.sys;
      if (sys._bh) sys._bh.update(dt, this.camera);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
