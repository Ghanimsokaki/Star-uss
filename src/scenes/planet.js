/**
 * Planet surface — the away mission.
 *
 * You do not just look at a planet, you land on it: the hull sets down on a
 * levelled pad, an away team steps out, and the world around them is walkable.
 *
 *   · terrain, sky, water and props are generated from the planet's own seed, so
 *     the same world looks the same on every visit
 *   · the away team walks with WASD / arrows, the on-screen stick, or by
 *     pointing with the mouse; the camera trails them and can be dragged round
 *   · people are out there — crew, colonists, traders, a surveyor. Walk up and
 *     talk: they have lines drawn from the planet's own biome and lore, and a
 *     first conversation can pay out
 *   · mineral deposits glow. Scan them (R / SCAN) for credits, dilithium and
 *     research; each one only pays once
 *   · two drawer panels hold the planet dossier and the away-team log, so the
 *     surface itself is never covered
 */
import * as THREE from 'three';
import { buildShip } from '../art/ships3d.js';
import { makeStars, glowSprite } from '../art/environment.js';
import {
  buildTerrain, buildSky, buildScatter, buildDeposit, buildPerson,
  heightAt, biomeFor, BIOMES, PAD_RADIUS, PAD_BLEND, mulberry, ringPoint,
} from '../art/surface.js';
import { planetById } from '../data/galaxy.js';
import { el, $, toast, modal, fmtC } from '../ui/dom.js';
import { initDrawers } from '../ui/drawers.js';
import { audio } from '../core/audio.js';
import { isTouchScheme } from '../core/device.js';
import { escapeHtml, clamp, damp } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const WALK_SPEED = 9.5;
const HULL_LENGTH = 21;   // drawn size of your ship on the pad, in world units
const PAD_REST_Y = 0.5;   // landing-gear clearance above the pad
const RUN_SPEED = 17;
const TALK_RANGE = 4.6;
const SCAN_RANGE = 7.5;

/** Names and lines for the people you meet, keyed by role. */
const ROLE_LINES = {
  crew: [
    'Away team reporting, Captain. Perimeter is clear — no hostiles within two kilometres.',
    'The hull took no damage on the descent. I would still like to re-check the starboard nacelle before we lift.',
    'Scans show a stable magnetic field here. Good place to stretch your legs, if you ask me.',
  ],
  colonist: [
    'You came down in person. Most captains just send a shuttle and a list of forms.',
    'This valley feeds the whole settlement. Two seasons of weather like this and we will be exporting.',
    'If you are heading north, mind the ridge — the ground gives way after rain.',
  ],
  trader: [
    'Dilithium, ore, seed stock — name it, I can move it off-world by the end of the week.',
    'Your ship is beautiful. I would trade you half a hold of ore for a look inside her engine room.',
    'Everything on this world is for sale except the view. And the view is not cheap either.',
  ],
  surveyor: [
    'I have mapped eleven kilometres of this basin. The minerals read high on every core sample.',
    'There is something under the rock here. Buried, old, and not natural — but the tricorder will not resolve it.',
    'Mark my words: this planet will be in the history books within a decade.',
  ],
  engineer: [
    'Give me an hour and a decent plasma torch and I will have a sensor relay running off that crystal.',
    'The soil here is almost all silicates. Chews through boots, but it holds a foundation like rock.',
  ],
};

const SURFACE_SMALL_TALK = {
  m: 'Grass, oxygen, water. You could put a city on this without breathing gear.',
  ocean: 'Salt in the air and nothing but water to the horizon. Bring a boat next time.',
  desert: 'Keep your suit sealed and your canteen full. The wind alone will strip paint.',
  ice: 'Ice a kilometre thick underfoot and a geyser venting ten metres from the pad. Careful where you step.',
  volcanic: 'The ground is warm through the boots. If the tremors start, do not wait for orders.',
  barren: 'Airless, silent, and beautiful in the way a dead world always is.',
  gas: 'Nothing but cloud. No surface to stand on.',
};

export class PlanetScene {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
    this.time = 0;
    this.planet = null;
    this.system = null;
    this._built = false;
    this._bindings = [];
    this._off = [];
    this.people = [];
    this.deposits = [];
    this.labels = [];
    this.camYaw = 0.35;
    this.camPitch = 0.23;
    this.camZoom = 1;
    this.walkPhase = 0;
    this.nearest = null;
  }

  /* ================================================================ entry */
  enter(params = {}) {
    this.planetId = params.planetId || this.game.state.currentPlanetId || this.game.system.planets?.[0]?.id;
    const found = this.planetId ? planetById(this.game.galaxy, this.planetId) : null;
    if (!found) {
      toast('No planet selected to land on', 'warn');
      this.app.setScene('system');
      return;
    }
    const landing = this.game.landOn(found.planet.id);
    if (!landing.ok) {
      toast(landing.why || 'Cannot land here', 'warn');
      this.app.setScene('system');
      return;
    }
    this.planet = found.planet;
    this.system = found.system;
    this.biome = biomeFor(this.planet.type);
    this._seed = this.planet.seed || 1;
    this.rng = mulberry(this._seed + 17);

    if (!this._built) this._build();
    this._buildUI();
    this._applyLanding(landing);
    this._bindInput();
    this._updateCamera(1, true);   // frame the away team before the first paint
    this._rebuildLabels();
    audio.landing?.();
  }

  _applyLanding(landing) {
    if (landing.first && landing.bonus) {
      const b = landing.bonus;
      setTimeout(() => {
        modal({
          title: `${this.planet.name} — first landing`,
          sub: 'Away team on the surface',
          body: `
            <div class="landing-hero">
              <div class="landing-orb" style="background:radial-gradient(circle at 32% 28%, ${this.biome.skyBottom ? '#' + new THREE.Color(this.biome.skyBottom).getHexString() : '#9cf'}, ${'#' + new THREE.Color(this.biome.ground[0]).getHexString()} 60%, ${'#' + new THREE.Color(this.biome.ground[1]).getHexString()})"></div>
              <div>
                <p class="small dim" style="margin:0 0 8px">${escapeHtml(SURFACE_SMALL_TALK[this.planet.type] || 'A new world under your boots.')}</p>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <span class="chip cyan">${escapeHtml(this.planet.typeName || 'Planet')}</span>
                  <span class="chip amber">${this.planet.gravity} g</span>
                  <span class="chip">${this.planet.temperature} °C</span>
                </div>
              </div>
            </div>
            <div class="survey-rows" style="margin-top:12px">
              <div class="survey-row"><span class="k">Discovery bonus</span><span class="v" style="color:var(--amber)">+${fmtC(b.credits)}</span></div>
              <div class="survey-row"><span class="k">Research data</span><span class="v" style="color:var(--cyan)">+${b.research} RP</span></div>
              <div class="survey-row"><span class="k">Dilithium sample</span><span class="v">+${b.dilithium} D</span></div>
              <div class="survey-row"><span class="k">Experience</span><span class="v">+${b.xp} XP</span></div>
            </div>
            <p class="small dim" style="margin-top:12px">Walk with <b>WASD</b> or the stick, drag to look around. Talk to the people out here with <b>E</b>, scan the glowing deposits with <b>R</b>.</p>`,
          footer: '<button class="btn primary" data-go>Begin the survey</button>',
        }).el.querySelector('[data-go]').onclick = () => document.querySelector('.modal-layer')?.remove();
      }, 900);
    }
  }

  /* ================================================================ build */
  _build() {
    const s = this.scene;
    this._built = true;
    const b = this.biome;

    s.fog = new THREE.Fog(b.fog, 90, 460);
    s.add(buildSky({ type: this.planet.type }));
    s.add(makeStars(1200, 3800));

    // sun
    const sunPos = V(-260, 180, -320);
    const sunGlow = glowSprite('#' + new THREE.Color(b.sun).getHexString(), 320, 0.55);
    sunGlow.position.copy(sunPos).normalize().multiplyScalar(1200);
    s.add(sunGlow);
    const sun = new THREE.DirectionalLight(b.sun, 2.6);
    sun.position.copy(sunPos);
    s.add(sun);
    s.add(new THREE.HemisphereLight(b.skyBottom, b.ground[0], 0.85));
    const rim = new THREE.DirectionalLight(b.water, 0.5);
    rim.position.set(180, 60, 220);
    s.add(rim);

    // ground
    this.terrain = buildTerrain({ seed: this._seed, type: this.planet.type, size: 340, segments: 116 });
    s.add(this.terrain);

    // water, for the worlds that have any
    if (b.waterLevel > -2.5) {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(900, 48),
        new THREE.MeshStandardMaterial({
          color: b.water, transparent: true, opacity: 0.82,
          roughness: 0.12, metalness: 0.35,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = b.waterLevel;
      water.name = 'water';
      s.add(water);
      this.water = water;
    }

    // props
    s.add(buildScatter({
      seed: this._seed, type: this.planet.type, count: 110,
      radius: 150, rng: this.rng,
    }));

    this._buildPad();
    this._buildShip();
    this._buildAwayTeam();
    this._buildPeople();
    this._buildDeposits();

    // drifting motes: dust, snow or spores depending on the world
    this.motes = this._buildMotes();
    s.add(this.motes);
  }

  _buildPad() {
    const pad = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(12.6, 16.2, 72),
      new THREE.MeshStandardMaterial({
        color: 0x3d4b5b, roughness: 0.55, metalness: 0.6,
        emissive: 0x59e0ff, emissiveIntensity: 0.12, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    pad.add(ring);

    // landing marks
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.06, 3.2),
        new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.3 }),
      );
      stripe.position.set(Math.cos(a) * 14.4, 0.06, Math.sin(a) * 14.4);
      stripe.rotation.y = -a;
      pad.add(stripe);
    }

    // beacon lights so the pad is findable from across the valley
    this.beacons = [];
    for (const [x, z] of [[16.6, 16.6], [-16.6, 16.6], [16.6, -16.6], [-16.6, -16.6]]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.8 }),
      );
      post.position.set(x, 0.8, z);
      pad.add(post);
      const lamp = glowSprite('#7dffcf', 2.4, 0.9);
      lamp.position.set(x, 1.75, z);
      pad.add(lamp);
      this.beacons.push(lamp);
    }
    this.scene.add(pad);
    this.pad = pad;
  }

  _buildShip() {
    this.ship = buildShip(this.game.state.shipId, this.game.shipRecord, 1, { importModel: false });
    // the away ship is drawn at a good-looking size rather than true metres:
    // 26 units long reads as a starship next to a 1.8-unit person
    const scale = HULL_LENGTH / (this.ship.userData.length || 6);
    this.ship.scale.setScalar(scale);
    this.ship.rotation.y = Math.PI * 0.12;

    // sit the hull on the pad instead of guessing a height offset
    this.ship.position.set(0, 0, -9);
    this.ship.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.ship);
    this.ship.position.y += PAD_REST_Y - box.min.y;
    this.scene.add(this.ship);

    // shadow under the hull so it reads as landed, not floating
    const size = box.getSize(V());
    const footprint = Math.max(size.x, size.z) * 1.15;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(footprint * 0.92, footprint * 0.92),
      new THREE.MeshBasicMaterial({ map: shadowDisc(), transparent: true, opacity: 0.42, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(this.ship.position.x, 0.05, this.ship.position.z);
    this.scene.add(shadow);
  }

  _buildAwayTeam() {
    this.player = buildPerson({ role: 'crew', type: this.planet.type, rng: this.rng });
    this.player.position.set(5.5, 0, 6.5);
    this.player.name = 'player';
    this.scene.add(this.player);

    // two officers who follow the captain around
    this.followers = [];
    for (let i = 0; i < 2; i++) {
      const f = buildPerson({ role: 'crew', type: this.planet.type, rng: this.rng });
      f.position.set(5.5 - 1.4 - i * 0.9, 0, 6.5 + 1.1 + i * 0.4);
      f.userData.offset = i;
      this.scene.add(f);
      this.followers.push(f);
    }
  }

  _buildPeople() {
    const roles = ['colonist', 'trader', 'surveyor', 'crew', 'engineer'];
    const count = 4 + Math.floor(this.rng() * 3);
    const firstNames = ['T\'Pel', 'Reyes', 'Okafor', 'Sato', 'Varga', 'Lindqvist', 'Adeyemi', 'Chapel', 'Noor', 'Bashir', 'Imani', 'Costa'];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      const role = roles[i % roles.length];
      const person = buildPerson({ role, type: this.planet.type, rng: this.rng });
      // the first person is close enough to walk up to as soon as you land
      const p = i === 0 ? ringPoint(this.rng, PAD_RADIUS + 9, PAD_RADIUS + 5) : ringPoint(this.rng, 52, PAD_BLEND + 2);
      person.position.set(p.x, heightAt(p.x, p.z, this._seed), p.z);
      person.rotation.y = this.rng() * Math.PI * 2;

      let name = firstNames[Math.floor(this.rng() * firstNames.length)];
      let guard = 0;
      while (used.has(name) && guard++ < 20) name = firstNames[Math.floor(this.rng() * firstNames.length)];
      used.add(name);

      const id = `npc-${i}`;
      const lines = ROLE_LINES[role] || ROLE_LINES.crew;
      person.userData = {
        ...person.userData,
        id, role, name,
        line: lines[Math.floor(this.rng() * lines.length)],
        home: person.position.clone(),
        wanderTarget: person.position.clone(),
        wanderTimer: 1 + this.rng() * 4,
        speed: 0.8 + this.rng() * 0.7,
        met: false,
        talking: false,
      };
      this.scene.add(person);
      this.people.push(person);
    }
  }

  _buildDeposits() {
    const count = 3 + Math.floor(this.rng() * 3);
    for (let i = 0; i < count; i++) {
      const p = ringPoint(this.rng, 54, PAD_BLEND + 3);
      const dep = buildDeposit({
        seed: this._seed, type: this.planet.type, x: p.x, z: p.z, index: i,
      });
      dep.position.set(p.x, 0, p.z);
      dep.userData = {
        ...dep.userData,
        id: `find-${i}`,
        index: i,
        name: DEPOSIT_NAMES[this.planet.type] || DEPOSIT_NAMES.barren,
        scanned: false,
        baseY: 0,
      };
      this.scene.add(dep);
      this.deposits.push(dep);
    }
  }

  _buildMotes() {
    const count = isTouchScheme() ? 90 : 220;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (this.rng() - 0.5) * 90;
      pos[i * 3 + 1] = this.rng() * 26;
      pos[i * 3 + 2] = (this.rng() - 0.5) * 90;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: this.biome.dust, size: 0.22, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'motes';
    return pts;
  }

  /* ================================================================== UI */
  _buildUI() {
    const g = this.game;
    const p = this.planet;
    const sys = this.system;
    const record = g.landingInfo(p.id) || { visits: 1, finds: [], met: [] };
    const onSurface = record.finds?.length || 0;

    this.ui = el(`
      <div class="screen active planet-ui">
        <div class="planet-hud">
          <div class="planet-banner">
            <div class="pb-name">${escapeHtml(p.name)}</div>
            <div class="pb-sub">${escapeHtml(sys.name)} system · visit ${record.visits}</div>
          </div>
        </div>

        <aside class="panel side-left">
          <div class="panel-head">
            <div><h3>Away Team</h3><span class="sub">${escapeHtml(g.shipRecord.name)}</span></div>
          </div>
          <div class="panel-body">
            <div class="vitals">
              <div class="vrow"><span>${escapeHtml(p.name)}</span><b class="cyan">${escapeHtml(p.typeName || 'Surface')}</b></div>
              <div class="vrow"><span>Gravity</span><b>${p.gravity} g</b></div>
              <div class="vrow"><span>Surface temp.</span><b>${p.temperature} °C</b></div>
              <div class="vrow" style="margin-top:6px"><span>Samples</span><b id="ph-finds">${onSurface}</b></div>
              <div class="bar amber thin" id="ph-find-bar"><i style="width:${Math.min(100, onSurface * 20)}%"></i></div>
            </div>
            <p class="small dim" style="margin:12px 0 0;line-height:1.55">
              Walk with <b>WASD</b> or drag. <b>E</b> talk · <b>R</b> scan · <b>L</b> lift off.
            </p>
          </div>
        </aside>

        <aside class="panel side-left">
          <div class="panel-head">
            <div><h3>Planet Dossier</h3><span class="sub">${escapeHtml(p.typeName || 'Planet')}</span></div>
          </div>
          <div class="panel-body scroll" id="ph-dossier"></div>
        </aside>

        <aside class="panel side-right">
          <div class="panel-head">
            <div><h3>Away Log</h3><span class="sub">surface survey</span></div>
          </div>
          <div class="panel-body scroll" id="ph-log"></div>
        </aside>

        <div class="planet-actions">
          <button class="act-btn talk" id="ph-talk" data-ph="talk" title="Talk to the nearest person (E)">
            <span class="ico">☍</span><span class="lbl">TALK</span><span class="kc">E</span>
          </button>
          <button class="act-btn scan" id="ph-scan" data-ph="scan" title="Scan the nearest deposit (R)">
            <span class="ico">⌖</span><span class="lbl">SCAN</span><span class="kc">R</span>
          </button>
          <button class="act-btn leave" id="ph-leave" data-ph="leave" title="Return to orbit (L)">
            <span class="ico">⤒</span><span class="lbl">ORBIT</span><span class="kc">L</span>
          </button>
        </div>

        <div class="planet-prompt" id="ph-prompt"></div>
        <div class="stick-zone" id="stick"><div class="stick-base"></div><div class="stick-knob" id="stick-knob"></div></div>
        <div class="globe-labels" id="ph-labels"></div>
      </div>`);
    document.getElementById('ui').appendChild(this.ui);
    this.drawers = initDrawers(this.ui, { key: 'planet' });
    this._labelsEl = $('#ph-labels', this.ui);

    $('#ph-leave', this.ui).onclick = () => this._leave();
    $('#ph-talk', this.ui).onclick = () => this._talk();
    $('#ph-scan', this.ui).onclick = () => this._scan();

    // the flight stick is an input method here too, so walking works on a phone
    this.app.input.bindStick($('#stick', this.ui), $('#stick-knob', this.ui));

    this._renderDossier();
    this._renderLog();
    this._bindings.push(this.game.bus.on('change', () => {
      this._renderLog();
      this._updateSampleCount();
    }));
  }

  _renderDossier() {
    const p = this.planet;
    const b = this.biome;
    const nodes = $('#ph-dossier', this.ui);
    if (!nodes) return;
    const rows = [
      ['Biome', p.typeName || 'Unknown'],
      ['Atmosphere', b === BIOMES.gas ? 'Hydrogen–helium' : (p.type === 'm' || p.type === 'ocean' ? 'Breathable' : 'Sealed suit required')],
      ['Gravity', `${p.gravity} g`],
      ['Mean temp.', `${p.temperature} °C`],
      ['Radius', `${(p.radiusKm || 0).toLocaleString()} km`],
      ['Moons', `${p.moons ?? 0}`],
      ['Dilithium', `${p.resources?.dilithium ?? 0} D potential`],
      ['Minerals', `${p.resources?.minerals ?? 0} RU`],
    ];
    nodes.innerHTML = `
      <p class="small dim" style="line-height:1.55;margin:0 0 12px">${escapeHtml(SURFACE_SMALL_TALK[p.type] || '')}</p>
      <div class="survey-rows">
        ${rows.map(([k, v]) => `<div class="survey-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span></div>`).join('')}
      </div>
      <div class="codex-entry" style="margin-top:12px">
        <h4>Life signs</h4>
        <p>${p.signs?.life ? 'Confirmed biological activity in the valley.' : 'No native biology detected — the people here are all yours.'}
        ${p.signs?.ruins ? ' Long-range scan also flagged a structure under the ridge, older than the colony.' : ''}</p>
      </div>`;
  }

  _renderLog() {
    const nodes = $('#ph-log', this.ui);
    if (!nodes) return;
    const rec = this.game.landingInfo(this.planet.id) || { finds: [], met: [] };
    const metRows = this.people.map((per) => {
      const known = rec.met?.includes(per.userData.id);
      return `<div class="away-row ${known ? '' : 'unknown'}">
        <span class="dot">${known ? '●' : '○'}</span>
        <span class="nm">${known ? escapeHtml(per.userData.name) : 'Unidentified'}</span>
        <span class="role">${known ? escapeHtml(per.userData.role) : '—'}</span>
      </div>`;
    }).join('');
    const findRows = this.deposits.map((d) => {
      const got = rec.finds?.includes(d.userData.id);
      return `<div class="away-row ${got ? '' : 'unknown'}">
        <span class="dot" style="color:${got ? 'var(--green)' : 'var(--ink-faint)'}">◆</span>
        <span class="nm">${got ? escapeHtml(d.userData.name) : 'Unscanned deposit'}</span>
        <span class="role">${got ? 'sampled' : 'unknown'}</span>
      </div>`;
    }).join('');
    nodes.innerHTML = `
      <div class="tiny upper faint" style="margin-bottom:6px">Away team contacts</div>
      ${metRows}
      <div class="tiny upper faint" style="margin:14px 0 6px">Surface finds</div>
      ${findRows}
      <div class="codex-entry" style="margin-top:14px">
        <h4>Getting around</h4>
        <p>Move with WASD, the stick, or by pointing. <b>E</b> talks to whoever is closest, <b>R</b> scans a deposit, <b>L</b> lifts off.</p>
      </div>`;
  }

  _updateSampleCount() {
    const rec = this.game.landingInfo(this.planet.id);
    const n = rec?.finds?.length || 0;
    const txt = $('#ph-finds', this.ui);
    if (txt) txt.textContent = String(n);
    const fill = $('#ph-find-bar i', this.ui);
    if (fill) fill.style.width = `${Math.min(100, n * 20)}%`;
  }

  /* ================================================================ input */
  _bindInput() {
    const input = this.app.input;
    input.lookLocked = false;

    // drag anywhere on the canvas to swing the camera round the away team
    const canvas = this.app.canvas;
    let dragging = null;
    const down = (e) => {
      if (e.target !== canvas) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!dragging || dragging.id !== e.pointerId) return;
      const dx = e.clientX - dragging.x;
      const dy = e.clientY - dragging.y;
      dragging.x = e.clientX;
      dragging.y = e.clientY;
      this.camYaw -= dx * 0.006;
      this.camPitch = clamp(this.camPitch + dy * 0.004, -0.15, 1.1);
    };
    const up = () => { dragging = null; };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const wheel = (e) => {
      if (e.target !== canvas) return;
      this.camZoom = clamp(this.camZoom * Math.exp((e.deltaY || 0) * 0.0011), 0.5, 2.6);
    };
    window.addEventListener('wheel', wheel, { passive: true });

    this._off.push(() => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('wheel', wheel);
    });
  }

  _interactKeys() {
    const input = this.app.input;
    if (input.consume('ability')) this._talk();
    if (input.consume('scan')) this._scan();
    if (input.consume('brake') || input.consume('land')) this._leave();
  }

  /* ============================================================== actions */
  _nearestPerson() {
    let best = null;
    let bestD = TALK_RANGE;
    for (const p of this.people) {
      const d = p.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  _nearestDeposit() {
    let best = null;
    let bestD = SCAN_RANGE;
    for (const d of this.deposits) {
      if (d.userData.scanned) continue;
      const dist = d.position.distanceTo(this.player.position);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  _talk() {
    const person = this._nearestPerson();
    if (!person) {
      toast('Nobody close enough to talk to — walk up to someone', 'warn', 2200);
      return;
    }
    const u = person.userData;
    const res = this.game.meetPerson(this.planet.id, u.id);
    u.met = true;
    u.talking = true;
    setTimeout(() => { u.talking = false; }, 4000);
    audio.ui();

    let reward = '';
    if (res.first) {
      const r = { credits: 120 + Math.floor(this.rng() * 180), research: 6 + Math.floor(this.rng() * 10) };
      this.game.addCredits(r.credits);
      this.game.addResearch(r.research);
      reward = `<div class="survey-rows" style="margin-top:12px">
        <div class="survey-row"><span class="k">Goodwill</span><span class="v" style="color:var(--amber)">+${fmtC(r.credits)}</span></div>
        <div class="survey-row"><span class="k">Local knowledge</span><span class="v" style="color:var(--cyan)">+${r.research} RP</span></div>
      </div>`;
    }

    const m = modal({
      title: u.name,
      sub: `${u.role} · ${this.planet.name}`,
      body: `
        <p class="small dim" style="line-height:1.6;margin-top:0">${escapeHtml(u.line)}</p>
        ${reward}
        <p class="tiny faint" style="margin-top:12px">The away team will remember this conversation.</p>`,
      footer: '<button class="btn primary" data-close>Understood</button>',
    });
    m.el.querySelector('[data-close]').onclick = () => m.close();
    this._renderLog();
  }

  _scan() {
    const dep = this._nearestDeposit();
    if (!dep) {
      toast('No deposit in range — look for the glowing crystals', 'warn', 2400);
      return;
    }
    const u = dep.userData;
    u.scanned = true;
    audio.scan?.();
    const kind = ['dilithium', 'research', 'minerals'][u.index % 3];
    const reward = kind === 'dilithium'
      ? { dilithium: 8 + Math.floor(this.rng() * 10), research: 6 }
      : kind === 'research'
        ? { research: 22 + Math.floor(this.rng() * 18) }
        : { credits: 320 + Math.floor(this.rng() * 260) };
    const res = this.game.logFind(this.planet.id, u.id, { ...reward, xp: 12 });

    const rows = [
      reward.dilithium ? ['Dilithium', `+${reward.dilithium} D`, 'cyan'] : null,
      reward.research ? ['Research data', `+${reward.research} RP`, 'cyan'] : null,
      reward.credits ? ['Mineral value', fmtC(reward.credits), 'amber'] : null,
    ].filter(Boolean);

    const m = modal({
      title: u.name,
      sub: res.first ? 'New surface find' : 'Already sampled',
      body: `
        <p class="small dim" style="margin-top:0">${escapeHtml(depositFlavour(this.planet.type))}</p>
        <div class="survey-rows" style="margin-top:10px">
          ${rows.map(([k, v, c]) => `<div class="survey-row"><span class="k">${k}</span><span class="v" style="color:var(--${c})">${v}</span></div>`).join('')}
        </div>`,
      footer: '<button class="btn primary" data-close>Bag it</button>',
    });
    m.el.querySelector('[data-close]').onclick = () => m.close();
    this._renderLog();
    this._updateSampleCount();
  }

  _leave() {
    audio.ui();
    this.game.leavePlanet();
    toast('Away team recovered — returning to orbit', 'good', 2400);
    this.app.setScene('system', { nearPlanet: this.planet?.id });
  }

  /* ================================================================ labels */
  _rebuildLabels() {
    if (!this._labelsEl) return;
    this.labels = [];
    const items = [];
    for (const p of this.people) {
      items.push({ node: p, text: p.userData.name, sub: p.userData.role, kind: 'npc' });
    }
    for (const d of this.deposits) {
      items.push({ node: d, text: d.userData.name, sub: d.userData.scanned ? 'sampled' : 'deposit', kind: 'deposit' });
    }
    this._labelsEl.innerHTML = items.map((it, i) =>
      `<div class="globe-label obj-label" data-i="${i}" style="--c:${it.kind === 'deposit' ? '#ffb347' : '#59e0ff'}">
        <span class="ic">${it.kind === 'deposit' ? '◆' : '☍'}</span>
        <span class="tx">${escapeHtml(it.text)}</span>
        <span class="lv" data-dist></span>
      </div>`).join('');
    this.labels = items.map((it, i) => ({
      ...it, el: this._labelsEl.querySelector(`[data-i="${i}"]`),
    })).filter((l) => l.el);
  }

  _updateLabels() {
    const cam = this.camera;
    const w = this.app.viewport?.width || window.innerWidth;
    const h = this.app.viewport?.height || window.innerHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      const world = l.node.position.clone();
      world.y += 2.1;
      const dist = world.distanceTo(this.player.position);
      v.copy(world).project(cam);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const el2 = l.el;
      if (behind || x < -80 || x > w + 80 || y < -60 || y > h + 60) {
        el2.style.display = 'none';
        continue;
      }
      el2.style.display = '';
      el2.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      el2.style.opacity = clamp(1.15 - dist / 90, 0.15, 1);
      const dEl = el2.querySelector('[data-dist]');
      if (dEl) dEl.textContent = `${Math.round(dist)} m`;
      el2.classList.toggle('near', dist < TALK_RANGE && l.kind === 'npc');
    }
  }

  /* ================================================================ update */
  update(dt, t) {
    if (!this._built) return;
    this.time += dt;
    const input = this.app.input;
    input.update?.(dt);
    this._interactKeys();

    this._moveAwayTeam(dt);
    this._updateFollowers(dt);
    this._updatePeople(dt);
    this._updateDeposits(dt);
    this._updateCamera(dt);
    this._updateLabels();
    this._updatePrompt();
    this._updateMotes(dt);
    void t;
  }

  _moveAwayTeam(dt) {
    const input = this.app.input;
    // steering comes from every scheme: keys, stick, or the cursor
    let sx = input.steer?.x || 0;
    let sy = input.steer?.y || 0;
    const keys = input.keys || new Set();
    if (keys.has('w') || keys.has('arrowup')) sy = 1;
    if (keys.has('s') || keys.has('arrowdown')) sy = -1;
    if (keys.has('a') || keys.has('arrowleft')) sx = -1;
    if (keys.has('d') || keys.has('arrowright')) sx = 1;
    if (Math.abs(sx) < 0.12) sx = 0;
    if (Math.abs(sy) < 0.12) sy = 0;

    const moving = sx !== 0 || sy !== 0;
    const running = keys.has('shift') || input.actions?.boost;
    const speed = (running ? RUN_SPEED : WALK_SPEED) * (this.camZoom > 1.4 ? 1.15 : 1);

    if (moving) {
      // move relative to where the camera is looking
      const forward = V(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
      const right = V(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();
      const dir = V()
        .addScaledVector(forward, sy)
        .addScaledVector(right, sx);
      if (dir.lengthSq() > 0.0001) {
        dir.normalize();
        this.player.position.addScaledVector(dir, speed * dt);
        // face the way we walk, smoothly
        const want = Math.atan2(dir.x, dir.z);
        this.player.rotation.y = dampAngleLocal(this.player.rotation.y, want, 12, dt);
        this.walkPhase += dt * (running ? 13 : 9);
      }
    } else {
      this.walkPhase = damp(this.walkPhase, 0, 8, dt);
    }

    // bob + stride so the walk reads as walking
    const bob = Math.sin(this.walkPhase) * (moving ? 0.06 : 0);
    const ground = heightAt(this.player.position.x, this.player.position.z, this._seed);
    this.player.position.y = Math.max(ground, this.biome.waterLevel + 0.2) + 0.02;
    this.player.userData.parts.head.position.y = 1.62 + bob * 0.4;
    this.player.userData.parts.torso.rotation.z = Math.sin(this.walkPhase) * (moving ? 0.05 : 0);

    // stay on the map
    const lim = 150;
    this.player.position.x = clamp(this.player.position.x, -lim, lim);
    this.player.position.z = clamp(this.player.position.z, -lim, lim);
  }

  _updateFollowers(dt) {
    this.followers.forEach((f, i) => {
      const behind = V(
        Math.sin(this.camYaw) * (1.6 + i * 0.7),
        0,
        Math.cos(this.camYaw) * (1.6 + i * 0.7),
      );
      const target = this.player.position.clone().add(behind);
      const d = f.position.distanceTo(target);
      if (d > 1.4) {
        const dir = target.clone().sub(f.position).normalize();
        f.position.addScaledVector(dir, Math.min(d, 8 * dt));
        f.rotation.y = Math.atan2(dir.x, dir.z);
      }
      const ground = heightAt(f.position.x, f.position.z, this._seed);
      f.position.y = Math.max(ground, this.biome.waterLevel + 0.2);
    });
    void dt;
  }

  _updatePeople(dt) {
    for (const p of this.people) {
      const u = p.userData;
      // idle sway so a standing figure is not a statue
      p.position.y = Math.max(
        heightAt(p.position.x, p.position.z, this._seed),
        this.biome.waterLevel + 0.2,
      ) + Math.sin(this.time * 1.6 + u.wanderTimer) * 0.012;

      if (u.talking) {
        // face the captain while talking
        const dir = this.player.position.clone().sub(p.position);
        p.rotation.y = Math.atan2(dir.x, dir.z);
        continue;
      }

      u.wanderTimer -= dt;
      if (u.wanderTimer <= 0) {
        u.wanderTimer = 3 + this.rng() * 6;
        const a = this.rng() * Math.PI * 2;
        const r = 1 + this.rng() * 6;
        u.wanderTarget = u.home.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const to = u.wanderTarget.clone().sub(p.position);
      to.y = 0;
      const d = to.length();
      if (d > 0.35) {
        const dir = to.normalize();
        p.position.addScaledVector(dir, u.speed * dt);
        p.rotation.y = dampAngleLocal(p.rotation.y, Math.atan2(dir.x, dir.z), 5, dt);
      }
    }
  }

  _updateDeposits(dt) {
    for (const d of this.deposits) {
      d.rotation.y += dt * 0.25;
      const glow = d.children.find((c) => c.isPointLight);
      if (glow) {
        const base = d.userData.scanned ? 0.35 : 1.6;
        glow.intensity = base + Math.sin(this.time * 2.4 + d.userData.index) * 0.35;
      }
    }
  }

  _updateCamera(dt, snap = false) {
    const focus = this.player.position.clone().add(V(0, 1.35, 0));
    const dist = 12.5 * this.camZoom;
    const cp = Math.cos(this.camPitch);
    const goal = V(
      focus.x + Math.sin(this.camYaw) * cp * dist,
      focus.y + Math.sin(this.camPitch) * dist + 1.2,
      focus.z + Math.cos(this.camYaw) * cp * dist,
    );
    // never sink under the ground
    const groundAt = heightAt(goal.x, goal.z, this._seed);
    goal.y = Math.max(goal.y, groundAt + 1.6, this.biome.waterLevel + 1.6);

    if (snap) this.camera.position.copy(goal);
    else this.camera.position.lerp(goal, 1 - Math.exp(-9 * dt));
    this.camera.lookAt(focus);
  }

  _updatePrompt() {
    const node = $('#ph-prompt', this.ui);
    if (!node) return;
    const person = this._nearestPerson();
    const dep = this._nearestDeposit();
    let text = '';
    if (person) text = `Press <b>E</b> to talk to ${escapeHtml(person.userData.name)}`;
    else if (dep) text = `Press <b>R</b> to scan the ${escapeHtml(dep.userData.name.toLowerCase())}`;
    else if (isTouchScheme()) text = 'Drag to look · stick to walk · TALK and SCAN buttons';
    else text = 'WASD to walk · drag to look · E talk · R scan · L lift off';
    node.innerHTML = text;

    const talkBtn = $('#ph-talk', this.ui);
    const scanBtn = $('#ph-scan', this.ui);
    if (talkBtn) talkBtn.classList.toggle('ready', !!person);
    if (scanBtn) scanBtn.classList.toggle('ready', !!dep);
  }

  _updateMotes(dt) {
    if (!this.motes) return;
    const pos = this.motes.geometry.attributes.position;
    const drift = this.planet.type === 'ice' ? -3.2 : this.planet.type === 'volcanic' ? -1.2 : 0.7;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + drift * dt;
      let x = pos.getX(i) + Math.sin(this.time * 0.4 + i) * dt * 0.6;
      if (y < 0) y = 26;
      if (y > 26) y = 0;
      // keep the motes around the away team
      if (Math.abs(x - this.player.position.x) > 55) x = this.player.position.x + (this.rng() - 0.5) * 90;
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }

  /* ================================================================ teardown */
  exit() {
    this._off.forEach((fn) => fn());
    this._off = [];
    this._bindings.forEach((off) => off());
    this._bindings = [];
    this.labels = [];
    this.drawers?.destroy();
    this.drawers = null;
    this.ui?.remove();
    this.ui = null;
    this.app.input.lookLocked = false;
    // the scene object is reused for the next planet: clear the built world
    if (this._built) {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m) { m.map?.dispose?.(); m.dispose?.(); } });
      });
      this.scene.clear();
      this._built = false;
      this.people = [];
      this.deposits = [];
      this.followers = [];
      this.labels = [];
    }
    audio.stopEngine?.();
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}

/* --------------------------------------------------------------- helpers */
const DEPOSIT_NAMES = {
  m: 'Duranium outcrop',
  ocean: 'Coral limestone vein',
  desert: 'Benamite crystal',
  ice: 'Cryo-volcanic vent',
  volcanic: 'Sulphur crystal',
  barren: 'Regolith ore seam',
  gas: 'Trace gas pocket',
};

function depositFlavour(type) {
  return {
    m: 'A vein of duranium under the grass. The tricorder reads structural-grade purity all the way down.',
    ocean: 'Limestone and coral composite, saturated with trace metals. The colony uses it for foundations.',
    desert: 'Benamite crystals, grown in the deep aquifer. Worth a fortune to the right engineer.',
    ice: 'The vent is venting hot. Whatever is down there, it is still active.',
    volcanic: 'Sulphur and rare-earth salts, fused by the heat into something the refineries will fight over.',
    barren: 'Regolith bound with nickel-iron. Unromantic, and absolutely everywhere in the shipyards.',
  }[type] || 'A deposit worth sampling.';
}

/** Shortest-arc angular damping, used for turning figures. */
function dampAngleLocal(current, target, lambda, dt) {
  let d = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + d * (1 - Math.exp(-lambda * dt));
}

/** Soft radial shadow texture for under the hull. */
function shadowDisc() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
