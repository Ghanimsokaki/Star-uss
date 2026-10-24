import * as THREE from 'three';
import { buildShip, disposeObject3D } from '../art/ships3d.js';
import { buildEnemy, shieldBubble } from '../art/enemies3d.js';
import { makeSky, makeStars, makeStar, makePlanet, makeStation, makeAsteroids, glowSprite } from '../art/environment.js';
import { BlackHole } from '../art/blackhole.js';
import { glowTexture } from '../art/textures.js';
import { el, $, $$, toast, modal, bar, fmtC, fmt } from '../ui/dom.js';
import { fleetForSystem, makeEnemy } from '../data/enemies.js';
import { PLANET_TYPES as PT, STAR_LABEL } from '../data/galaxy.js';
import { audio } from '../core/audio.js';
import { escapeHtml, clamp, damp } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class SystemScene {
  constructor(app) {
    this.app = app;
    this.game = app.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.25, 250000);
    this.time = 0;
    this.built = false;
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.planetNodes = [];
    this.anomalyNodes = [];
    this.labels = [];
    this.hull = 1;
    this.shield = 1;
    this.boost = 1;
    this.lastDamage = 99;
    this.shieldHitTimer = 0;
    this.shake = 0;
    this.speed = 0;
    this.boosting = false;
    this.throttle = 0.72;
    this.fireCd = 0;
    this.torpCd = 0;
    this.abilityCd = 0;
    this.abilityTimer = 0;
    this.scanCd = 0;
    this.target = null;
    this.reticlePos = { x: 0, y: 0 };
    this.hudTimer = 0;
    this.dead = false;
    this.logLines = [];
    this.sysRng = null;
    this.clones = [];
    this.bh = null;
    this.bhKillTimer = 0;
    this.system = null;
    this._bindings = [];
  }

  /* ================================================================ build */
  _buildStatic() {
    const s = this.scene;
    s.add(makeSky(5, 80000));
    s.add(makeStars(3600, 48000));
    s.environment = this.app.environment || null;
    this.ambient = new THREE.AmbientLight(0x2b3f57, 0.7);
    s.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x3c5a80, 0x080c14, 0.55);
    s.add(this.hemi);
    this.systemRoot = new THREE.Group();
    s.add(this.systemRoot);
    this.fxRoot = new THREE.Group();
    s.add(this.fxRoot);
    this.shipRoot = new THREE.Group();
    s.add(this.shipRoot);
    this.built = true;
  }

  enter() {
    if (!this.built) this._buildStatic();
    audio.ensure();
    audio.startMusic();
    const sysNow = this.game.system;
    if (sysNow.blackhole || sysNow.boss) audio.startDrone();
    audio.startEngine();
    this._setupSystem();
    this._buildUI();
    if (!this.game.state.flags.introSeen) this.addLog('Welcome aboard, Captain. Starfleet Command is watching.', 'good');
    const mission = this.game.currentMission;
    if (mission && this.game.state.missionsDone.length === 0) {
      setTimeout(() => toast(`Orders: ${mission.title}`, 'warn', 3600), 900);
    }
    this._bindings = [
      this.game.bus.on('rankup', (d) => {
        this.addLog(`Promoted to ${d.title}. New ship classes may be available.`, 'good');
        toast(`Promoted to ${d.title}`, 'good');
      }),
      this.game.bus.on('mission', (d) => {
        toast(`Mission complete: ${d.mission.title}`, 'good', 4000);
        this.addLog(`Mission complete — ${d.mission.title}`, 'good');
      }),
    ];
    this.app.input.bindActions(this.ui);
    this.app.input.bindStick($('#stick', this.ui), $('#stick-knob', this.ui));
  }

  exit() {
    this._bindings.forEach((off) => off());
    this._bindings = [];
    this._teardown();
    this.ui?.remove();
    this.ui = null;
    audio.stopEngine();
    audio.stopDrone();
  }

  _teardown() {
    this.enemies.forEach((e) => {
      this.shipRoot.remove(e.group);
      disposeObject3D(e.group);
    });
    this.enemies = [];
    this.projectiles.forEach((p) => this._removeProjectile(p));
    this.projectiles = [];
    this.effects.forEach((e) => { this.fxRoot.remove(e.obj); });
    this.effects = [];
    if (this.player) {
      this.shipRoot.remove(this.player);
      disposeObject3D(this.player);
      this.player = null;
    }
    this.clones.forEach((c) => { this.shipRoot.remove(c); });
    this.clones = [];
    if (this.bh) { this.scene.remove(this.bh.group); this.bh = null; }
    if (this.systemRoot) {
      [...this.systemRoot.children].forEach((c) => {
        this.systemRoot.remove(c);
        disposeObject3D(c);
      });
    }
    this.planetNodes = [];
    this.anomalyNodes = [];
    this.labels = [];
    this.target = null;
    this.dead = false;
    this.hull = 1; this.shield = 1; this.boost = 1;
    this.fireCd = 0; this.torpCd = 0; this.abilityCd = 0; this.scanCd = 0;
    this.projectiles = [];
    this.effects = [];
    this._labelsEl = null;
    this._fxLights = [];
    this.sysRng = null;
    this.time = 0;
  }

  _setupSystem() {
    const g = this.game;
    const sys = g.system;
    this.system = sys;
    const stats = g.stats;
    this.quality = Math.max(0.55, this.app.viewport.detail);
    this.sysRng = this._rngFor(sys.id);
    this.maxHull = stats.hull;
    this.maxShield = stats.shield;
    this.hull = stats.hull;
    this.shield = stats.shield;
    this.stats = stats;
    this.dead = false;

    // star or black hole
    const starColor = sys.starColor || '#ffd9a0';
    if (sys.blackhole) {
      this.bh = new BlackHole({ radius: sys.boss ? 62 : 52, quality: this.quality, jets: true });
      this.bh.group.position.set(0, 0, 0);
      if (sys.boss) this.bh.group.rotation.set(0.12, 0, 0.2);
      this.systemRoot.add(this.bh.group);
      const halo = glowSprite(sys.boss ? '#b47bff' : '#ff9a3c', (sys.boss ? 62 : 52) * 20, 0.25);
      this.systemRoot.add(halo);
      this.systemRoot.add(new THREE.AmbientLight(0x2a1a3a, 0.9));
      const holeKey = new THREE.DirectionalLight(new THREE.Color(sys.boss ? '#b47bff' : '#ffab6a'), 1.5);
      holeKey.position.set(sys.boss ? -600 : 700, 420, sys.boss ? 500 : -380);
      this.systemRoot.add(holeKey);
    } else {
      const star = makeStar({ radius: sys.star === 'B' ? 115 : sys.star === 'N' ? 55 : 85, color: starColor, intensity: 3.2 });
      star.position.set(0, 0, 0);
      this.systemRoot.add(star);
      this.star = star;
      const bounce = new THREE.PointLight(0x6fa8ff, 1.2, 3200, 2);
      bounce.position.set(200, 120, 200);
      this.systemRoot.add(bounce);
    }
    this.scene.fog = sys.blackhole ? new THREE.FogExp2(0x05030a, 0.00009) : null;

    // planets
    const orbitBase = 340;
    (sys.planets || []).forEach((p, i) => {
      const radius = p.visualRadius * 9;
      const pivot = new THREE.Group();
      const orbitR = orbitBase + i * 260 + (p.orbit % 90);
      pivot.rotation.y = p.phase || i * 1.1;
      const node = new THREE.Group();
      node.position.x = orbitR;
      const planet = makePlanet({ typeId: p.type, seed: p.seed, radius, quality: this.quality, name: p.name });
      planet.rotation.z = p.tilt * 0.5;
      node.add(planet);
      // surveyed marker ring
      if (g.isSurveyed(p.id)) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.2, radius * 1.24, 64), new THREE.MeshBasicMaterial({ color: 0x62f2a6, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        node.add(ring);
      }
      pivot.add(node);
      this.systemRoot.add(pivot);
      this.planetNodes.push({ pivot, node, planet, data: p, orbitR, angle: p.phase || i * 1.1, speed: 0.006 / (1 + i * 0.4), radius });
    });

    // station
    if (sys.station || sys.id === 'sol') {
      const station = makeStation({ scale: sys.station ? 1.3 : 0.9 });
      station.position.set(-420, 90, -520);
      this.systemRoot.add(station);
      this.station = station;
    }

    // asteroid field
    if (['barren', 'desert', 'gas'].some((t) => (sys.planets || []).some((p) => p.type === t)) || sys.graveyard) {
      const belt = makeAsteroids({ count: 240, inner: 720, outer: 1150, quality: this.quality });
      belt.position.y = -40;
      this.systemRoot.add(belt);
      this.belt = belt;
    }

    // anomalies
    const anomalies = g.anomaliesFor(sys.id);
    anomalies.forEach((a) => {
      const group = new THREE.Group();
      const dist = 260 + (a.dist % 260);
      const ang = a.angle || 0;
      group.position.set(Math.cos(ang) * dist, 30 + Math.sin(ang * 3) * 60, Math.sin(ang) * dist);
      const color = new THREE.Color(a.color || '#b47bff');
      const coreTex = glowTexture(a.color || '#b47bff');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTex, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sprite.scale.setScalar(28);
      group.add(sprite);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.4, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false }));
      ring.rotation.x = Math.random() * 3;
      group.add(ring);
      const scanned = g.state.anomalies.includes(a.id);
      group.visible = !scanned;
      this.systemRoot.add(group);
      this.anomalyNodes.push({ group, data: a, sprite, ring, scanned });
    });

    // player
    this._buildPlayer();

    // enemies
    this._spawnFleet(sys);
  }

  _rngFor(id) {
    let seed = 0;
    for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
    let a = seed || 1;
    const rand = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next: rand,
      chance: (p) => rand() < p,
      pick: (arr) => arr[Math.floor(rand() * arr.length)],
      range: (a2, b) => a2 + rand() * (b - a2),
    };
  }

  _spawnFleet(sys) {
    const g = this.game;
    let fleet;
    if (sys.id === 'sol' || (sys.faction === 'federation' && sys.threat <= 1)) {
      fleet = [this._mkEnemySimple('raider', Math.max(2, Math.round(sys.threat) + 1))];
      if (sys.threat >= 2) fleet.push(this._mkEnemySimple('raider', 2));
    } else if (sys.boss) {
      fleet = [this._mkEnemySimple('voidlord', sys.threat)];
      for (let i = 0; i < 2; i++) fleet.push(this._mkEnemySimple('void', sys.threat));
    } else {
      fleet = fleetForSystem(sys, this.sysRng);
      if (fleet.length === 0) fleet = [this._mkEnemySimple('raider', sys.threat)];
    }
    this.fleetTotal = fleet.length;
    this.fleetKilled = 0;
    const forward = V(0, 0, 1).applyQuaternion(this.player.quaternion);
    const right = V(1, 0, 0).applyQuaternion(this.player.quaternion);
    fleet.forEach((def, i) => {
      const spread = fleet.length > 1 ? (i / (fleet.length - 1) - 0.5) * 2 : 0;
      const dist = 210 + this.sysRng.range(0, 130);
      const pos = this.player.position.clone()
        .addScaledVector(forward, dist)
        .addScaledVector(right, spread * 150 + this.sysRng.range(-30, 30))
        .add(V(0, this.sysRng.range(-30, 70), 0));
      this._spawnEnemy(def, pos);
    });
    this.addLog(`${sys.name}: ${fleet.length} hostile${fleet.length === 1 ? '' : 's'} on sensors`, 'hostile');
  }

  _mkEnemySimple(kind, threat) {
    return makeEnemy(kind, threat);
  }

  _buildPlayer() {
    if (this.player) {
      this.shipRoot.remove(this.player);
      disposeObject3D(this.player);
    }
    const g = this.game;
    this.player = buildShip(g.state.shipId, g.shipRecord, this.quality);
    const startAngle = Math.PI * 0.15;
    this.player.position.set(0, 70, 520);
    this.player.lookAt(0, 20, 0);
    this.shipRoot.add(this.player);
    // engine glow sprites
    const thrusters = this.player.userData.thrusters || [];
    this.engineSprites = thrusters.map((t) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(g.shipRecord.nacelle || '#59e0ff'),
        color: new THREE.Color(g.shipRecord.nacelle || '#59e0ff'),
        transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      s.position.copy(t.pos);
      s.scale.setScalar(2.2);
      this.player.add(s);
      return s;
    });
    this.camDist = Math.max(18, (this.player.userData.length || 6) * 2.6);
    this.camera.position.copy(this.player.position).add(V(0, 6, -this.camDist));
    this.camera.lookAt(this.player.position);
  }

  /* ================================================================ enemies */
  _spawnEnemy(def, pos) {
    const group = buildEnemy(def.id || def.kind, this.quality);
    group.position.copy(pos);
    group.lookAt(this.player.position);
    const bubble = shieldBubble((def.id === 'voidlord' ? 9 : def.id === 'cube' ? 5 : def.id === 'warbird' ? 5 : 3.2) * 1.25, new THREE.Color(def.colors.glow).getHex());
    group.add(bubble);
    this.shipRoot.add(group);
    const e = {
      def, group, bubble,
      hp: def.maxHp, maxHp: def.maxHp,
      shield: def.maxShield, maxShield: def.maxShield,
      fireCd: 1 + Math.random() * 2,
      strafe: Math.random() > 0.5 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      cloak: 0, cloaked: false,
      hitFlash: 0,
      dead: false,
      radius: group.userData.radius || 3,
      kind: def.id || def.kind,
      basePos: pos.clone(),
    };
    this.enemies.push(e);
    return e;
  }

  /* ================================================================ UI */
  _buildUI() {
    const g = this.game;
    const sys = this.system;
    const cls = g.shipClass;
    const ability = cls.ability;
    this.ui = el(`
      <div class="screen active">
        <div class="hud">
          <div class="hud-top">
            <div class="vitals">
              <div class="row between" style="margin-bottom:6px">
                <b style="font-family:var(--font-h);font-size:11px;letter-spacing:.1em">${escapeHtml(g.shipRecord.name)}</b>
                <span class="tiny" style="color:var(--amber)">${escapeHtml(g.state.shipId.toUpperCase())}</span>
              </div>
              <div class="vrow"><span>Hull</span><b id="hull-txt">100%</b></div>
              <div class="bar red" id="hull-bar"><i style="width:100%"></i></div>
              <div class="vrow"><span>Shields</span><b id="shield-txt">100%</b></div>
              <div class="bar" id="shield-bar"><i style="width:100%"></i></div>
              <div class="vrow" style="margin-top:6px"><span>Boost</span><b id="boost-txt">100%</b></div>
              <div class="bar amber thin" id="boost-bar"><i style="width:100%"></i></div>
            </div>
            <div class="vitals" style="padding:8px 12px">
              <div class="row between"><span class="small" style="letter-spacing:.06em">${escapeHtml(sys.name)}</span><span class="chip ${sys.threat >= 5 ? 'red' : sys.threat >= 3 ? 'amber' : 'green'}" style="padding:2px 7px;font-size:9px">${g.difficultyLabelFor(sys)}</span></div>
              <div class="row between" style="margin-top:6px">
                <span class="tiny faint" id="enemy-count"></span>
                <button class="btn sm ghost" id="leave-btn" style="min-height:26px;padding:4px 8px;font-size:9px">Galaxy map</button>
              </div>
            </div>
            <div class="vitals" style="padding:8px 12px">
              <div class="tiny upper faint" style="font-size:8.5px">Current orders</div>
              <div class="small" id="mission-line" style="line-height:1.35">—</div>
            </div>
          </div>

          <div class="enemy-vitals">
            <div class="vitals" id="target-card" style="display:none">
              <div class="row between"><span class="tiny" style="color:#ffb4ad" id="target-name">—</span><span class="tiny faint" id="target-dist"></span></div>
              <div class="bar red thin" id="target-hp" style="margin-top:5px"><i style="width:100%"></i></div>
              <div class="bar thin" id="target-shield" style="margin-top:3px"><i style="width:100%"></i></div>
            </div>
          </div>

          <div class="crosshair"><div class="c"></div></div>
          <div class="target-reticle" id="reticle"><div class="ring"></div><div class="tl" id="reticle-label">TARGET</div></div>
          <div class="syslog" id="syslog"></div>

          <div class="hud-actions">
            <button class="act-btn scan" data-action="scan" data-hold="0" id="scan-btn"><span class="ico">⌖</span><span>SCAN</span></button>
            <button class="act-btn ability" data-action="ability" data-hold="0" id="ability-btn"><span class="ico">✷</span><span>ABILITY</span></button>
            <button class="act-btn boost" data-action="boost" data-hold="1"><span class="ico">»</span><span>BOOST</span></button>
            <button class="act-btn torp" data-action="torpedo" data-hold="1"><span class="ico">◉</span><span>TORP</span></button>
            <button class="act-btn fire" data-action="fire" data-hold="1"><span class="ico">✦</span><span>FIRE</span></button>
          </div>
          <div class="stick-zone" id="stick"><div class="stick-base"></div><div class="stick-knob" id="stick-knob"></div></div>
          <div class="throttle-ui">
            <div class="track"><i id="throttle-fill" style="height:72%"></i></div>
            <div class="lbl">IMP</div>
          </div>
          <div class="globe-labels" id="obj-labels"></div>
        </div>
      </div>`);
    document.getElementById('ui').appendChild(this.ui);
    this._labelsEl = $('#obj-labels', this.ui);
    $('#leave-btn', this.ui).onclick = () => { audio.ui(); this.app.setScene('galaxy'); };
    const ab = $('#ability-btn', this.ui);
    ab.querySelector('span:last-child').textContent = (ability?.name || 'Ability').split(' ')[0].toUpperCase();
    ab.title = ability?.desc || '';
    this._refreshMissionLine();
    this.planetsSurveyed = 0;
    this._buildObjectLabels();
    this._logEl = $('#syslog', this.ui);
    this.logLines = [];
    this.addLog(`Entering ${sys.name} — ${STAR_LABEL[sys.star] || 'stellar body'}`, 'good');
    this.addLog('Phasers: Space / FIRE · Torpedoes: F / TORP · Scan: E / SCAN', '');
    this._updateHud(true);
  }

  addLog(text, kind = '') {
    this.logLines.push({ text, kind });
    if (this.logLines.length > 6) this.logLines.shift();
    if (!this._logEl) return;
    this._logEl.innerHTML = this.logLines.map((l) => `<div class="${l.kind}">${escapeHtml(l.text)}</div>`).join('');
  }

  _refreshMissionLine() {
    const m = this.game.currentMission;
    const node = $('#mission-line', this.ui);
    if (!node) return;
    node.textContent = m ? m.title : 'All orders complete';
    node.style.color = m ? 'var(--ink)' : 'var(--green)';
  }

  _buildObjectLabels() {
    if (!this._labelsEl) return;
    const items = [];
    this.planetNodes.forEach((p, i) => {
      items.push({ id: `p${i}`, kind: 'planet', text: p.data.name, sub: PT[p.data.type].short, node: p });
    });
    this.anomalyNodes.forEach((a, i) => {
      if (!a.scanned) items.push({ id: `a${i}`, kind: 'anomaly', text: a.data.name, sub: 'Anomaly', node: a });
    });
    this._labelsEl.innerHTML = items.map((it) => `<div class="globe-label obj-label" data-obj="${it.id}" style="--c:${it.kind === 'anomaly' ? (it.node.data.color || '#b47bff') : '#59e0ff'}">
      <span class="ic">${it.kind === 'anomaly' ? '✧' : '◍'}</span><span class="tx">${escapeHtml(it.text)}</span><span class="lv" data-dist></span>
    </div>`).join('');
    this.labels = items.map((it) => ({ ...it, el: this._labelsEl.querySelector(`[data-obj="${it.id}"]`) })).filter((l) => l.el);
  }

  /* ================================================================ input / flight */
  _handleInput(dt) {
    const input = this.app.input;
    input.update(dt);
    if (this.dead) return;
    const steer = input.steer;
    const stats = this.stats;
    const turn = stats.turn;
    const up = V(0, 1, 0);
    const right = V(1, 0, 0);

    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, steer.x * turn * 0.85 * dt);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -steer.y * turn * 0.62 * dt);
    this.player.quaternion.multiply(qYaw).multiply(qPitch);
    // prevent roll drift
    this.player.quaternion.normalize();

    const boosting = input.actions.boost && this.boost > 0.02;
    this.boosting = boosting;
    if (boosting) this.boost = Math.max(0, this.boost - dt * 0.34);
    else this.boost = Math.min(1, this.boost + dt * 0.16);
    const baseSpeed = stats.speed;
    this.speed = damp(this.speed, baseSpeed * this.throttle * (boosting ? 2.0 : 1), 2.2, dt);

    const forward = V(0, 0, 1).applyQuaternion(this.player.quaternion);
    this.player.position.addScaledVector(forward, this.speed * dt);

    // gravitational pull from the black hole
    if (this.bh) {
      const toHole = this.bh.group.position.clone().sub(this.player.position);
      const d = toHole.length();
      const danger = this.bh.radius * 9;
      if (d < danger) {
        const pull = (1 - d / danger) * 70;
        this.player.position.addScaledVector(toHole.normalize(), pull * dt);
        this.shake = Math.max(this.shake, (1 - d / danger) * 0.9);
        if (d < this.bh.radius * 2.6) {
          this._damagePlayer((1 - d / (this.bh.radius * 2.6)) * 55 * dt, true);
          if (this.time - this.bhKillTimer > 3) {
            this.bhKillTimer = this.time;
            this.addLog('Gravitational shear exceeding hull tolerance — pull up!', 'hostile');
            this._flashWarning('GRAVITATIONAL SHEAR');
            audio.alert();
          }
        }
      }
    }

    // player visual roll
    const modelRoll = damp(this.player.children[0]?.rotation?.z || 0, -steer.x * 0.45, 4, dt);
    if (this.player.children[0]) this.player.children[0].rotation.z = modelRoll;

    // engine glow pulsing
    if (this.engineSprites) {
      const e = boosting ? 1.6 : 0.72;
      this.engineSprites.forEach((s) => {
        s.material.opacity = 0.55 + Math.sin(this.time * 22) * 0.12 + (boosting ? 0.3 : 0);
        s.scale.setScalar(2.0 * e + Math.sin(this.time * 15) * 0.2);
      });
    }

    // camera chase
    const camGoal = this.player.position.clone()
      .add(V(0, 1, 0).applyQuaternion(this.player.quaternion).multiplyScalar(3.2))
      .add(forward.clone().multiplyScalar(-this.camDist));
    this.camera.position.lerp(camGoal, 1 - Math.exp(-6 * dt));
    const look = this.player.position.clone().add(forward.clone().multiplyScalar(32));
    this.camera.lookAt(look);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.4;
      this.shake = damp(this.shake, 0, 5, dt);
    }
    const fovTarget = 58 + (boosting ? 8 : 0);
    this.camera.fov = damp(this.camera.fov, fovTarget, 3, dt);
    this.camera.updateProjectionMatrix();

    // weapons
    this.fireCd -= dt;
    this.torpCd -= dt;
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.abilityTimer = Math.max(0, this.abilityTimer - dt);
    this.scanCd = Math.max(0, this.scanCd - dt);

    const autoFire = this.game.state.settings.autoFire;
    if ((input.actions.fire || autoFire) && this.fireCd <= 0) this._firePhasers();
    if (input.actions.torpedo && this.torpCd <= 0) this._fireTorpedo();
    if (input.consume('ability')) this._useAbility();
    if (input.consume('scan')) this._scanAction();
    if (input.consume('target')) this._cycleTarget();

    this._updateTargeting();
    this._updateScanPrompt();
  }

  /* ================================================================ targeting */
  _aliveEnemies() { return this.enemies.filter((e) => !e.dead); }

  _nearestEnemy() {
    let best = null, bestD = Infinity;
    for (const e of this._aliveEnemies()) {
      const d = e.group.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  _updateTargeting() {
    const nearest = this._nearestEnemy();
    if (!nearest) { this.target = null; return; }
    if (!this.target || this.target.dead) this.target = nearest;
    const d = this.target.group.position.distanceTo(this.player.position);
    // if the locked target is very far and another is much closer, switch
    if (d > 900) this.target = nearest;
  }

  _cycleTarget() {
    const alive = this._aliveEnemies();
    if (!alive.length) return;
    const idx = alive.indexOf(this.target);
    this.target = alive[(idx + 1) % alive.length];
    audio.ui();
  }

  /* ================================================================ weapons */
  _muzzleWorld(which = 'phaser') {
    const arr = which === 'phaser' ? this.player.userData.phaserMuzzles : this.player.userData.torpMuzzles;
    const list = arr && arr.length ? arr : [this.player];
    const pick = list[Math.floor(Math.random() * list.length)];
    return pick.getWorldPosition(V());
  }

  _firePhasers() {
    const stats = this.stats;
    this.fireCd = 1 / (stats.fireRate * (this.abilityTimer > 0 && this.game.shipClass.ability.id === 'overload' ? 2 : 1));
    const target = this.target;
    const forward = V(0, 0, 1).applyQuaternion(this.player.quaternion);
    const muzzle = this._muzzleWorld('phaser');
    let end;
    let hit = false;
    if (target && !target.dead) {
      const toT = target.group.position.clone().sub(muzzle);
      const dist = toT.length();
      const cos = toT.normalize().dot(forward);
      if (dist < 780 && cos > 0.35) {
        end = target.group.position.clone();
        hit = true;
      }
    }
    if (!end) end = muzzle.clone().addScaledVector(forward, 500);
    this._spawnBeam(muzzle, end, this.game.shipRecord.nacelle || '#59e0ff', hit ? 1 : 0.65);
    audio.phaser(0.2);
    if (hit) {
      const dmg = stats.phaser * (this.abilityTimer > 0 && this.game.shipClass.ability.id === 'overload' ? 1.5 : 1);
      this._damageEnemy(target, dmg);
      this._impact(end, this.game.shipRecord.nacelle || '#59e0ff');
      this.shake = Math.max(this.shake, 0.18);
    }
    // prometheus multi-vector clone beams
    if (this.clones.length && target) {
      this.clones.forEach((c) => {
        const cm = c.position.clone();
        this._spawnBeam(cm, target.group.position.clone(), '#c59bff', 0.6);
        this._damageEnemy(target, stats.phaser * 0.4);
      });
    }
  }

  _fireTorpedo() {
    const stats = this.stats;
    this.torpCd = 1 / stats.torpRate;
    const target = this.target && !this.target.dead ? this.target : null;
    const muzzle = this._muzzleWorld('torp');
    const forward = V(0, 0, 1).applyQuaternion(this.player.quaternion);
    const dir = target
      ? target.group.position.clone().sub(muzzle).normalize()
      : forward.clone();
    this._spawnTorpedo(muzzle, dir, stats.torp, target, 'player');
    audio.torpedo(0.25);
  }

  _useAbility() {
    if (this.abilityCd > 0) { toast('Ability recharging', 'warn'); return; }
    const ability = this.game.shipClass.ability;
    if (!ability || ability.id === 'none') {
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.3);
      this.addLog('Auxiliary power rerouted to shields (+30%)', 'good');
      this._impact(this.player.position, '#59e0ff');
    } else if (ability.id === 'slipstream') {
      const fwd = V(0, 0, 1).applyQuaternion(this.player.quaternion);
      this.player.position.addScaledVector(fwd, 320);
      this._warpFlash(this.player.position);
      this.addLog('Quantum slipstream burst — 320 units ahead', 'good');
      audio.warp();
    } else if (ability.id === 'salvo' || ability.id === 'quantumBurst') {
      const alive = this._aliveEnemies();
      const n = ability.id === 'quantumBurst' ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const muzzle = this._muzzleWorld('torp');
        let dir;
        const t = alive[i % Math.max(1, alive.length)];
        if (t) dir = t.group.position.clone().sub(muzzle).normalize();
        else dir = V(0, 0, 1).applyQuaternion(this.player.quaternion);
        this._spawnTorpedo(muzzle, dir, this.stats.torp * 0.75, t || null, 'player');
      }
      this.addLog(`${ability.name} — full spread away`, 'good');
      audio.torpedo(0.4);
    } else if (ability.id === 'overload') {
      this.abilityTimer = 6;
      this.addLog('Pulse cannons overloaded — fire rate doubled for 6s', 'good');
      audio.upgrade();
    } else if (ability.id === 'mva') {
      this.abilityTimer = 8;
      this._spawnClones();
      this.addLog('Multi-Vector Assault Mode engaged', 'good');
      audio.upgrade();
    }
    this.abilityCd = ability.cd || 20;
    this._updateHud(true);
  }

  _spawnClones() {
    this.clones.forEach((c) => this.shipRoot.remove(c));
    this.clones = [];
    for (const side of [-1, 1]) {
      const clone = buildShip(this.game.state.shipId, this.game.shipRecord, Math.max(0.5, this.quality * 0.7));
      clone.scale.setScalar(0.9);
      this.shipRoot.add(clone);
      this.clones.push(clone);
      clone.userData.side = side;
    }
  }

  _updateClones(dt) {
    if (!this.clones.length) return;
    if (this.abilityTimer <= 0) {
      this.clones.forEach((c) => this.shipRoot.remove(c));
      this.clones = [];
      return;
    }
    const fwd = V(0, 0, 1).applyQuaternion(this.player.quaternion);
    const right = V(1, 0, 0).applyQuaternion(this.player.quaternion);
    this.clones.forEach((c, i) => {
      const side = c.userData.side;
      c.position.copy(this.player.position).addScaledVector(right, side * 9).addScaledVector(fwd, -5).add(V(0, side * 1.5, 0));
      c.quaternion.copy(this.player.quaternion);
    });
  }

  _spawnBeam(from, to, color, intensity = 1) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    const geo = new THREE.CylinderGeometry(0.09 * intensity, 0.16 * intensity, len, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).addScaledVector(dir.normalize(), len / 2);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    this.fxRoot.add(mesh);
    this.effects.push({ obj: mesh, life: 0.16, maxLife: 0.16, kind: 'beam', mat });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * intensity, 0.06 * intensity, len, 5, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.position.copy(mesh.position);
    core.quaternion.copy(mesh.quaternion);
    this.fxRoot.add(core);
    this.effects.push({ obj: core, life: 0.12, maxLife: 0.12, kind: 'beam', mat: core.material });
  }

  _impact(pos, color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(color), color: new THREE.Color(color), transparent: true,
      opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(pos);
    sprite.scale.setScalar(1.6);
    this.fxRoot.add(sprite);
    this.effects.push({ obj: sprite, life: 0.32, maxLife: 0.32, kind: 'impact', grow: 14 });
  }

  _warpFlash(pos) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#a8e8ff'), color: new THREE.Color('#a8e8ff'), transparent: true,
      opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(pos);
    sprite.scale.setScalar(6);
    this.fxRoot.add(sprite);
    this.effects.push({ obj: sprite, life: 0.7, maxLife: 0.7, kind: 'impact', grow: 40 });
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 3.4, 90, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    trail.rotation.x = Math.PI / 2;
    trail.position.copy(pos);
    this.fxRoot.add(trail);
    this.effects.push({ obj: trail, life: 0.6, maxLife: 0.6, kind: 'beam', mat: trail.material });
  }

  _explosion(pos, size = 1, color = '#ffb066') {
    const count = Math.round(46 * size * (0.5 + this.quality));
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
      vel.push(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 28 * size));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      map: glowTexture(color), color: new THREE.Color(color).multiplyScalar(1.6), size: 4.2 * size,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false,
    });
    const pts = new THREE.Points(geo, mat);
    this.fxRoot.add(pts);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#fff3d0'), color: new THREE.Color('#fff3d0'), transparent: true,
      opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    flash.position.copy(pos);
    flash.scale.setScalar(6 * size);
    this.fxRoot.add(flash);
    const light = new THREE.PointLight(0xffa050, 24 * size, 400, 2);
    light.position.copy(pos);
    this.fxRoot.add(light);
    this.effects.push({ obj: pts, life: 1.2, maxLife: 1.2, kind: 'particles', vel, mat, geo });
    this.effects.push({ obj: flash, life: 0.5, maxLife: 0.5, kind: 'impact', grow: 30 * size });
    this.effects.push({ obj: light, life: 0.7, maxLife: 0.7, kind: 'light' });
    audio.explosion(size);
  }

  _spawnTorpedo(from, dir, damage, target, owner = 'player') {
    const color = owner === 'player' ? '#ffd36b' : '#ff5a3c';
    const geo = new THREE.CapsuleGeometry(0.28, 1.6, 4, 8);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }));
    mesh.position.copy(from);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(color), color: new THREE.Color(color), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.setScalar(4);
    mesh.add(glow);
    this.fxRoot.add(mesh);
    const proj = {
      mesh, type: 'torpedo', owner, target, damage,
      vel: dir.clone().normalize().multiplyScalar(owner === 'player' ? 320 : 190),
      life: 4.5, homing: owner === 'player' ? 1.6 : 0.4, radius: 1.5,
    };
    this.projectiles.push(proj);
    return proj;
  }

  _spawnEnemyBolt(from, dir, damage, color = '#ff7a4d') {
    const geo = new THREE.SphereGeometry(0.45, 8, 6);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4), toneMapped: false }));
    mesh.position.copy(from);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(color), color: new THREE.Color(color), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.setScalar(3.4);
    mesh.add(glow);
    this.fxRoot.add(mesh);
    this.projectiles.push({
      mesh, type: 'bolt', owner: 'enemy', damage,
      vel: dir.clone().normalize().multiplyScalar(200), life: 4.0, radius: 1.0,
    });
  }

  _removeProjectile(p) {
    this.fxRoot.remove(p.mesh);
    disposeObject3D(p.mesh);
  }

  /* ================================================================ damage */
  _damageEnemy(enemy, amount) {
    if (!enemy || enemy.dead) return;
    let dmg = amount;
    if (enemy.shield > 0) {
      enemy.shield -= dmg;
      enemy.bubble.material.opacity = 0.42;
      if (enemy.shield < 0) { enemy.hp += enemy.shield; enemy.shield = 0; }
    } else {
      enemy.hp -= dmg;
      enemy.hitFlash = 0.12;
      audio.hullHit();
    }
    enemy.bubble.visible = true;
    if (enemy.hp <= 0) this._killEnemy(enemy);
  }

  _killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const pos = enemy.group.position.clone();
    const size = enemy.kind === 'voidlord' ? 4.4 : enemy.kind === 'cube' ? 3.4 : enemy.kind === 'warbird' ? 2.6 : 1.4;
    this._explosion(pos, size, enemy.def.colors.glow || '#ffb066');
    setTimeout(() => {
      this.shipRoot.remove(enemy.group);
      disposeObject3D(enemy.group);
    }, 60);
    const reward = this.game.recordKill(enemy.def);
    this.addLog(`Destroyed ${enemy.def.label || enemy.def.name} · +${fmtC(reward.credits)} +${reward.dilithium}D`, 'good');
    toast(`+${fmtC(reward.credits)} · +${reward.dilithium} dilithium · +${reward.xp} XP`, 'good');
    this.fleetKilled++;
    if (this.target === enemy) this.target = null;
    this._refreshMissionLine();
    if (this._aliveEnemies().length === 0) this._onSystemCleared();
    if (enemy.kind === 'voidlord') this._onBossDefeated();
  }

  _damagePlayer(amount, ignoreShield = false) {
    if (this.dead) return;
    this.lastDamage = 0;
    let dmg = amount;
    if (!ignoreShield && this.shield > 0) {
      this.shield -= dmg;
      audio.shieldHit();
      this.shake = Math.max(this.shake, 0.35);
      if (this.shield < 0) { dmg = -this.shield; this.shield = 0; this.hull -= dmg; }
    } else {
      this.hull -= dmg;
      audio.hullHit();
      this.shake = Math.max(this.shake, 0.6);
      this._flashDamage();
    }
    if (this.hull <= 0) this._destroyPlayer();
  }

  _flashDamage() {
    if (!this.ui) return;
    const overlay = document.getElementById('vignette');
    overlay.style.background = 'radial-gradient(120% 90% at 50% 50%, transparent 30%, rgba(255,40,30,.35) 100%)';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      overlay.style.background = '';
    }, 240);
  }

  _flashWarning(text) {
    if (!this.ui) return;
    const n = el(`<div class="toast bad" style="position:absolute;left:50%;top:38%;transform:translateX(-50%);z-index:70">${text}</div>`);
    this.ui.appendChild(n);
    setTimeout(() => n.remove(), 1600);
  }

  _destroyPlayer() {
    if (this.dead) return;
    this.dead = true;
    this._explosion(this.player.position.clone(), 3.6, '#9fd8ff');
    this.player.visible = false;
    audio.stopEngine();
    this.shake = 2;
    const loss = Math.round(this.game.state.credits * 0.05);
    this.game.state.credits = Math.max(0, this.game.state.credits - loss);
    this.game.state.stats.deaths++;
    this.game.save(true);
    setTimeout(() => {
      const m = modal({
        title: 'Ship Destroyed', sub: 'Starfleet Command',
        body: `<p class="dim" style="line-height:1.65">The ${escapeHtml(this.game.shipRecord.name)} has been lost with all hands. A rescue flotilla recovered your escape pod. Insurance covers a replacement hull — at a cost of <b class="amber">${fmtC(loss)}</b>.</p>
        <div class="codex-entry" style="margin-top:12px"><h4>After-action report</h4><p>Hostiles destroyed: ${this.fleetKilled || 0} of ${this.fleetTotal || 0}. Systems charted: ${this.game.state.visited.length}. Recommendation: upgrade hull and shields before engaging forces above threat level 4.</p></div>`,
        footer: `<button class="btn primary" data-back>Return to Earth</button>`,
        closable: false,
      });
      m.el.querySelector('[data-back]').onclick = () => { m.close(); this.app.setScene('earth'); };
    }, 1300);
  }

  _onSystemCleared() {
    const bonus = this.game.recordClear(this.system.id);
    if (bonus) {
      toast(`System cleared! +${fmtC(bonus.credits)} · +${bonus.research} RP`, 'good', 4000);
      this.addLog(`Sector secure — salvage bonus ${fmtC(bonus.credits)}`, 'good');
      audio.upgrade();
    }
    this.target = null;
  }

  _onBossDefeated() {
    setTimeout(() => {
      const m = modal({
        title: 'The Void is Silent', sub: 'Vela Singularity · Campaign complete',
        body: `<p class="dim" style="line-height:1.7">The dreadnought's hull folds in on itself and vanishes past the event horizon. For the first time in a decade, the Vela Singularity is quiet.</p>
        <p class="dim" style="line-height:1.7">Starfleet Command has authorised a permanent research station at the anomaly. Your name will be in the history books, Captain.</p>
        <div class="codex-entry" style="margin-top:12px"><h4>Endgame rewards</h4><p>+₡30,000 and 1,500 research points credited. The galaxy remains open — keep exploring, upgrading and expanding your civilisation on Earth.</p></div>`,
        footer: `<button class="btn primary" data-home>Return to Earth in triumph</button>`,
      });
      m.el.querySelector('[data-home]').onclick = () => { m.close(); this.app.setScene('earth'); };
      this.game.addCredits(30000);
      this.game.addResearch(1500);
    }, 2200);
  }

  /* ================================================================ scanning */
  _nearestScannable() {
    const p = this.player.position;
    let best = null, bestD = Infinity, kind = null;
    for (const node of this.planetNodes) {
      if (this.game.isSurveyed(node.data.id)) continue;
      const d = node.node.getWorldPosition(V()).distanceTo(p);
      if (d < bestD) { bestD = d; best = node.data; kind = 'planet'; }
    }
    for (const a of this.anomalyNodes) {
      if (a.scanned) continue;
      const d = a.group.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = a.data; kind = 'anomaly'; }
    }
    if (!best) return null;
    const range = kind === 'planet' ? 160 : 130;
    return { data: best, kind, dist: bestD, inRange: bestD <= range, range };
  }

  _updateScanPrompt() {
    const btn = $('#scan-btn', this.ui);
    if (!btn) return;
    const near = this._nearestScannable();
    this.scanTarget = near;
    btn.classList.toggle('ready', !!(near && near.inRange));
    btn.disabled = !(near && near.inRange) || this.scanCd > 0;
    const label = btn.querySelector('span:last-child');
    if (label) label.textContent = (near && near.inRange) ? (near.kind === 'planet' ? 'SURVEY' : 'ANALYSE') : 'SCAN';
  }

  _scanAction() {
    if (this.scanCd > 0) return;
    const near = this._nearestScannable();
    if (!near || !near.inRange) {
      toast('No survey target in range — fly closer to a planet or anomaly', 'warn');
      audio.error();
      return;
    }
    this.scanCd = 0.8;
    audio.scan();
    if (near.kind === 'planet') {
      const res = this.game.survey(near.data.id);
      if (!res.ok) { toast(res.why || 'Cannot survey', 'warn'); return; }
      this._showSurvey(res);
      const node = this.planetNodes.find((n) => n.data.id === near.data.id);
      if (node) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(node.radius * 1.2, node.radius * 1.24, 64), new THREE.MeshBasicMaterial({ color: 0x62f2a6, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        node.node.add(ring);
      }
      this.addLog(`Survey complete: ${near.data.name}`, 'good');
      this._rebuildLabels();
    } else {
      const res = this.game.scanAnomaly(near.data.id);
      if (!res.ok) { toast(res.why || 'Cannot analyse', 'warn'); return; }
      const an = this.anomalyNodes.find((a) => a.data.id === near.data.id);
      if (an) { an.scanned = true; an.group.visible = false; }
      this._showAnomaly(res);
      this.addLog(`Anomaly catalogued: ${near.data.name}`, 'good');
      this._rebuildLabels();
    }
    this._refreshMissionLine();
  }

  _rebuildLabels() {
    if (!this.ui) return;
    this._buildObjectLabels();
  }

  _showSurvey(res) {
    const p = res.result.planet;
    const t = PT[p.type];
    const r = res.rewards;
    const bonusRows = res.result.bonus.map((b) => `<div class="survey-row"><span class="k">${escapeHtml(b.name)}</span><span class="v" style="color:var(--green)">+${fmtC(b.credits || 0)}${b.research ? ` · +${b.research} RP` : ''}${b.dilithium ? ` · +${b.dilithium} D` : ''}</span></div>`).join('');
    const m = modal({
      title: p.name, sub: 'Planetary survey report', wide: true,
      body: `
        <div class="survey-hero">
          <div class="survey-orb" style="background:radial-gradient(circle at 32% 28%, ${t.colors[2]}, ${t.colors[0]} 58%, ${t.colors[1]})"></div>
          <div class="survey-title">
            <h3>${escapeHtml(t.name)}</h3>
            <div class="row" style="margin-top:6px">
              <span class="chip cyan">${escapeHtml(t.short)}</span>
              <span class="chip ${t.habitability > 0.5 ? 'green' : ''}">${t.habitability > 0.5 ? 'Habitable' : 'Hostile'}</span>
              <span class="chip amber">${p.radiusKm.toLocaleString()} km</span>
            </div>
          </div>
        </div>
        <p class="small dim" style="line-height:1.55;margin-top:0">${escapeHtml(res.result.lore)}</p>
        <div class="survey-rows">
          <div class="survey-row"><span class="k">Atmosphere</span><span class="v">${escapeHtml(t.atmosphere)}</span></div>
          <div class="survey-row"><span class="k">Biosphere</span><span class="v">${escapeHtml(t.life)}</span></div>
          <div class="survey-row"><span class="k">Gravity</span><span class="v">${p.gravity} g</span></div>
          <div class="survey-row"><span class="k">Surface temp.</span><span class="v">${p.temperature} °C</span></div>
          <div class="survey-row"><span class="k">Moons</span><span class="v">${p.moons}</span></div>
          <div class="survey-row"><span class="k">Mineral survey</span><span class="v">${p.resources.minerals} RU</span></div>
          ${bonusRows}
        </div>
        <div class="reward-row">
          <span class="chip amber">+${fmtC(r.credits)}</span>
          <span class="chip cyan">+${r.dilithium} dilithium</span>
          <span class="chip violet">+${r.research} RP</span>
          <span class="chip green">+${r.xp} XP</span>
        </div>`,
      footer: `<button class="btn primary" data-close2>Log survey</button>`,
    });
    m.el.querySelector('[data-close2]').onclick = () => m.close();
    audio.credits();
  }

  _showAnomaly(res) {
    const a = res.anomaly;
    const r = res.rewards;
    const m = modal({
      title: a.name, sub: 'Anomaly analysis',
      body: `
        <div class="survey-hero">
          <div class="survey-orb" style="background:radial-gradient(circle at 40% 35%, ${a.color}, #0a0f18 70%);box-shadow:inset -10px -8px 20px rgba(0,0,0,.8), 0 0 30px ${a.color}55"></div>
          <div class="survey-title"><h3>${escapeHtml(a.name)}</h3><div class="small faint" style="margin-top:4px">Science division report</div></div>
        </div>
        <p class="small dim" style="line-height:1.6">${escapeHtml(a.text)}</p>
        <div class="reward-row">
          ${r.credits ? `<span class="chip amber">+${fmtC(r.credits)}</span>` : ''}
          ${r.dilithium ? `<span class="chip cyan">+${r.dilithium} dilithium</span>` : ''}
          ${r.research ? `<span class="chip violet">+${r.research} RP</span>` : ''}
          ${r.xp ? `<span class="chip green">+${r.xp} XP</span>` : ''}
        </div>`,
      footer: `<button class="btn primary" data-close2>File report</button>`,
    });
    m.el.querySelector('[data-close2]').onclick = () => m.close();
  }

  /* ================================================================ enemy update */
  _updateEnemies(dt) {
    const playerPos = this.player.position;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const pos = e.group.position;
      const toPlayer = playerPos.clone().sub(pos);
      const dist = toPlayer.length();
      const dir = toPlayer.clone().normalize();

      // face the player (models have +Z forward)
      if (!this._aim) this._aim = new THREE.Object3D();
      this._aim.position.copy(pos);
      this._aim.lookAt(playerPos);
      e.group.quaternion.slerp(this._aim.quaternion, Math.min(1, (e.def.turn || 1) * 0.9 * dt));

      // movement
      const forward = V(0, 0, 1).applyQuaternion(e.group.quaternion);
      const speed = e.def.speed || 40;
      if (dist > 150) pos.addScaledVector(forward, speed * dt);
      else if (dist < 80) pos.addScaledVector(forward, -speed * 0.7 * dt);
      else {
        const side = V().crossVectors(forward, V(0, 1, 0)).normalize().multiplyScalar(e.strafe);
        pos.addScaledVector(side, speed * 0.55 * dt);
        pos.addScaledVector(forward, speed * 0.18 * dt);
      }

      // keep near the fight if player runs
      if (dist > 1100) pos.lerp(playerPos.clone().sub(dir.multiplyScalar(180)), 0.02);

      // cloaking (Birds of Prey / Warbirds)
      if (e.def.cloak && dist > 90) {
        e.cloak += dt;
        if (e.cloak > 9 && !e.cloaked) {
          e.cloaked = true;
          e.cloak = 0;
          e.group.visible = false;
          this.addLog(`${e.def.label || e.def.name} has cloaked`, 'warn');
        }
      }
      if (e.cloaked) {
        e.cloak += dt;
        if (e.cloak > 3.6) {
          e.cloaked = false;
          e.group.visible = true;
          e.cloak = 0;
          this.addLog(`${e.def.label || e.def.name} decloaked off your bow`, 'hostile');
          audio.alert();
        }
      }

      // shields regen
      if (e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + (e.def.regen || 5) * dt);
      if (e.bubble.material.opacity > 0) e.bubble.material.opacity = Math.max(0, e.bubble.material.opacity - dt * 2.2);

      // firing
      e.fireCd -= dt;
      if (!e.cloaked && e.fireCd <= 0 && dist < 520) {
        const angle = forward.dot(dir);
        if (angle > 0.72) {
          e.fireCd = Math.max(0.5, 1.6 / (e.def.fireRate || 1)) * (0.7 + Math.random() * 0.6);
          const muzzle = pos.clone().addScaledVector(forward, e.radius * 0.8);
          const lead = playerPos.clone().addScaledVector(V(0, 0, 1).applyQuaternion(this.player.quaternion).multiplyScalar(this.speed * 0.4));
          const shotDir = lead.sub(muzzle).normalize();
          this._spawnEnemyBolt(muzzle, shotDir, e.def.dmg, e.def.colors.glow);
          audio.phaser(-0.3);
        }
      }
    }
  }

  _updateProjectiles(dt) {
    const stats = this.stats;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      // homing
      if (p.homing && p.target && !p.target.dead) {
        const desired = p.target.group.position.clone().sub(p.mesh.position).normalize().multiplyScalar(p.vel.length());
        p.vel.lerp(desired, Math.min(1, p.homing * dt));
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.z += dt * 3;
      let hit = false;
      if (p.owner === 'player') {
        // torpedo proximity
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (e.group.position.distanceTo(p.mesh.position) < e.radius + 2.4) {
            this._damageEnemy(e, p.damage);
            this._impact(p.mesh.position.clone(), '#ffd36b');
            audio.torpedoHit();
            this.shake = Math.max(this.shake, 0.4);
            hit = true;
            break;
          }
        }
      } else {
        if (p.mesh.position.distanceTo(this.player.position) < 5.5) {
          this._damagePlayer(p.damage);
          this._impact(p.mesh.position.clone(), '#ff8a6d');
          hit = true;
        }
      }
      if (hit || p.life <= 0) {
        if (!hit && p.owner === 'player') this._impact(p.mesh.position.clone(), '#ffd36b');
        this._removeProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= dt;
      const t = Math.max(0, fx.life / fx.maxLife);
      if (fx.kind === 'beam') {
        fx.mat.opacity = t;
      } else if (fx.kind === 'impact') {
        fx.obj.material.opacity = t;
        const s = 1 + (1 - t) * fx.grow;
        fx.obj.scale.setScalar(s);
      } else if (fx.kind === 'particles') {
        const attr = fx.geo.getAttribute('position');
        for (let j = 0; j < fx.vel.length; j++) {
          attr.array[j * 3] += fx.vel[j].x * dt;
          attr.array[j * 3 + 1] += fx.vel[j].y * dt;
          attr.array[j * 3 + 2] += fx.vel[j].z * dt;
          fx.vel[j].multiplyScalar(0.94);
        }
        attr.needsUpdate = true;
        fx.mat.opacity = t;
      } else if (fx.kind === 'light') {
        fx.obj.intensity = 24 * t;
      }
      if (fx.life <= 0) {
        this.fxRoot.remove(fx.obj);
        if (fx.mat) fx.mat.dispose?.();
        if (fx.geo) fx.geo.dispose?.();
        this.effects.splice(i, 1);
      }
    }
  }

  _updatePlanets(dt) {
    for (const p of this.planetNodes) {
      p.angle += p.speed * dt;
      p.pivot.rotation.y = p.angle;
      p.planet.rotation.y += dt * 0.05;
      if (p.planet.userData.clouds) p.planet.userData.clouds.rotation.y += dt * 0.07;
      p.planet.getWorldPosition(new THREE.Vector3());
    }
    for (const a of this.anomalyNodes) {
      if (a.scanned) continue;
      a.ring.rotation.z += dt * 0.5;
      a.sprite.material.opacity = 0.6 + Math.sin(this.time * 2 + a.data.angle) * 0.25;
    }
    if (this.station) this.station.rotation.y += dt * 0.04;
    if (this.belt) this.belt.rotation.y += dt * 0.006;
    if (this.star) this.star.rotation.y += dt * 0.02;
  }

  /* ================================================================ HUD */
  _updateHud(force = false) {
    if (!this.ui) return;
    const hp = clamp(this.hull / this.maxHull, 0, 1);
    const sp = clamp(this.shield / this.maxShield, 0, 1);
    const bp = clamp(this.boost, 0, 1);
    const setBar = (id, pct) => {
      const n = this.ui.querySelector(`#${id} > i`);
      if (n) n.style.width = `${pct * 100}%`;
    };
    setBar('hull-bar', hp);
    setBar('shield-bar', sp);
    setBar('boost-bar', bp);
    const ht = $('#hull-txt', this.ui); if (ht) ht.textContent = `${Math.round(hp * 100)}%`;
    const st = $('#shield-txt', this.ui); if (st) st.textContent = `${Math.round(sp * 100)}%`;
    const bt = $('#boost-txt', this.ui); if (bt) bt.textContent = `${Math.round(bp * 100)}%`;
    const ec = $('#enemy-count', this.ui);
    if (ec) {
      const alive = this._aliveEnemies().length;
      ec.textContent = alive ? `${alive} hostile${alive > 1 ? 's' : ''} · ${this.game.state.currentSystemId === 'sol' ? 'patrol' : 'engagement'}` : 'no hostiles';
      ec.style.color = alive ? '#ff9d94' : 'var(--green)';
    }
    const target = this.target;
    const card = $('#target-card', this.ui);
    if (card) {
      if (target && !target.dead) {
        card.style.display = '';
        $('#target-name', this.ui).textContent = target.def.label || target.def.name;
        $('#target-dist', this.ui).textContent = `${Math.round(target.group.position.distanceTo(this.player.position))} u`;
        const thp = clamp(target.hp / target.maxHp, 0, 1);
        const tsh = target.maxShield ? clamp(target.shield / target.maxShield, 0, 1) : 0;
        $('#target-hp > i', this.ui).style.width = `${thp * 100}%`;
        $('#target-shield > i', this.ui).style.width = `${tsh * 100}%`;
      } else card.style.display = 'none';
    }
    const ab = $('#ability-btn', this.ui);
    if (ab) {
      const ready = this.abilityCd <= 0;
      ab.classList.toggle('ready', ready);
      ab.disabled = !ready;
      const lbl = ab.querySelector('span:last-child');
      if (lbl) lbl.textContent = ready ? (this.game.shipClass.ability.name.split(' ')[0].toUpperCase()) : `${Math.ceil(this.abilityCd)}s`;
    }
    const tf = $('#throttle-fill', this.ui);
    if (tf) tf.style.height = `${(this.boosting ? 100 : 72)}%`;
    if (force) this._refreshMissionLine();
  }

  _updateReticle() {
    if (!this.ui) return;
    const ret = $('#reticle', this.ui);
    if (!ret) return;
    const t = this.target;
    if (!t || t.dead || this.dead) { ret.classList.remove('on'); return; }
    const pos = t.group.position.clone().project(this.camera);
    if (pos.z > 1) { ret.classList.remove('on'); return; }
    const rect = this.app.canvas.getBoundingClientRect();
    const x = ((pos.x + 1) / 2) * rect.width;
    const y = ((-pos.y + 1) / 2) * rect.height;
    ret.classList.add('on');
    ret.style.left = `${x}px`;
    ret.style.top = `${y}px`;
    const label = $('#reticle-label', this.ui);
    if (label) label.textContent = `${t.def.label || t.def.name} · ${Math.round(t.group.position.distanceTo(this.player.position))}u`;
  }

  _updateObjectLabels() {
    if (!this._labelsEl) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const p = this.player.position;
    for (const l of this.labels) {
      const node = l.kind === 'planet' ? l.node.node : l.node.group;
      if (!node || node.parent === null) { l.el.style.display = 'none'; continue; }
      const wp = node.getWorldPosition(V());
      const dist = wp.distanceTo(p);
      if (l.kind === 'anomaly' && l.node.scanned) { l.el.style.display = 'none'; continue; }
      if (dist > 1000) { l.el.style.display = 'none'; continue; }
      const proj = wp.project(this.camera);
      if (proj.z > 1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = 'flex';
      const x = ((proj.x + 1) / 2) * rect.width;
      const y = ((-proj.y + 1) / 2) * rect.height;
      l.el.style.transform = `translate(-50%, -160%) translate(${x}px, ${y}px)`;
      const d = l.el.querySelector('[data-dist]');
      if (d) d.textContent = `${Math.round(dist)}u`;
      l.el.style.opacity = dist < 160 ? 1 : 0.6;
    }
  }

  /* ================================================================ loop */
  update(dt, t) {
    this.time += dt;
    if (!this.built || !this.ui) return;
    const capped = Math.min(dt, 0.05);
    if (!this.dead) {
      this._handleInput(capped);
      this._updateEnemies(capped);
      this._updateProjectiles(capped);
      this._updateClones(capped);
      this.lastDamage += capped;
      if (this.lastDamage > 3.5 && this.shield < this.maxShield) {
        this.shield = Math.min(this.maxShield, this.shield + this.stats.regen * capped);
      }
      const speedLevel = clamp(this.speed / 100, 0, 1);
      audio.setEngine(speedLevel);
    }
    this._updatePlanets(capped);
    this._updateEffects(capped);
    if (this.bh) {
      this.bh.update(capped, this.camera);
      this.bh.group.rotation.z += capped * 0.01;
    }
    this._updateReticle();
    this._updateObjectLabels();
    this.hudTimer += capped;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this._updateHud();
    }
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
