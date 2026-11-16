import * as THREE from 'three';
import { buildShip, disposeObject3D, makeShipMaterials, saucerGeometry, roundedBox, bodyLathe } from '../art/ships3d.js';
import { onModelLoaded, loadGLB } from '../art/imported.js';
import { buildEnemy, shieldBubble, updateNavLights } from '../art/enemies3d.js';
import { makeSky, makeStars, makeStar, makePlanet, makeStation, makeAsteroids, glowSprite } from '../art/environment.js';
import { BlackHole } from '../art/blackhole.js';
import { EarthGlobe, EARTH_RADIUS } from '../art/earth.js';
import { glowTexture } from '../art/textures.js';
import { el, $, $$, toast, modal, bar, fmtC, fmt } from '../ui/dom.js';
import { fleetForSystem, makeEnemy } from '../data/enemies.js';
import { PLANET_TYPES as PT, STAR_LABEL } from '../data/galaxy.js';
import { audio } from '../core/audio.js';
import { device, isTouchScheme, onDeviceChange } from '../core/device.js';
import { escapeHtml, clamp, damp } from '../core/util.js';
import { flyHelm, bankFor, assistFor } from '../core/helm.js';
import { FreeCam } from '../core/freecam.js';
import { OrbitChase, chaseOffset } from '../core/orbitcam.js';
import { stepFlight, massFor, collideSphere, autopilotControls } from '../core/flight.js';
import { SYSTEMS, SYSTEM_IDS, applyHit, repairTick, effects as damageEffects, BROKEN } from '../core/damage.js';
import { ShipInterior, LAYOUT } from './interior.js';
import { bindKeys } from '../ui/keys.js';
import { floatNumber, destroyedStamp, hitArrow, redAlert, jolt } from '../ui/battlefx.js';
import { showMissionLog } from '../ui/menus.js';

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
    this.vel = new THREE.Vector3();   // real velocity — see core/flight.js
    this.autopilot = null;            // { kind, label } while engaged
    this.boosting = false;
    // cruise speed 0..1 (Space / Shift, Z / C, the touch strip). Keyboard pilots start stopped, so
    // cruise starts at zero there; touch has no W key and starts cruising.
    this.throttle = isTouchScheme() ? 0.6 : 0;
    this.fireCd = 0;
    this.torpCd = 0;
    this.abilityCd = 0;
    this.abilityTimer = 0;
    this.bluffTimer = 0;
    this.hullPlateTimer = 0;
    this.saucerTimer = 0;
    this.speedBoostTimer = 0;
    this.pointDefenseTimer = 0;
    // 24th/25th-century hull abilities
    this.evadeTimer = 0;        // Saber: incoming fire mostly misses
    this.guardTimer = 0;        // Ambassador: Last Stand damage soak
    this.markTimer = 0;         // Nebula: Sensor Sweep damage buff
    this.sporeTimer = 0;        // Crossfield: post-jump damage window
    this.overwatchTimer = 0;    // Constitution III: multi-target phasers
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

  enter(params = {}) {
    if (!this.built) this._buildStatic();
    audio.ensure();
    audio.startMusic();
    const sysNow = this.game.system;
    if (sysNow.blackhole || sysNow.boss) audio.startDrone();
    audio.startEngine();
    this._setupSystem();
    if (params.nearPlanet) this._spawnNear(params.nearPlanet);
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
        this._refreshMissionLine();
      }),
      this.game.bus.on('contract', (d) => {
        this.addLog(`Contract fulfilled — ${d.contract.title}`, 'good');
        this._refreshMissionLine();
      }),
    ];
    this.app.input.bindActions(this.ui);
    this.app.input.bindStick($('#stick', this.ui), $('#stick-knob', this.ui));
    this._showSchemeHint();
  }

  exit() {
    this._dropSaucerSection?.();
    this._bindings.forEach((off) => off());
    this._bindings = [];
    this._teardown();
    this._schemeOff?.();
    this._schemeOff = null;
    this._modelOff?.();
    this._modelOff = null;
    this.freecam?.dispose();
    this.freecam = null;
    this.orbit?.dispose();
    this.orbit = null;
    this._unkeys?.();
    this._unkeys = null;
    if (this.interior?.active) { this.interior.exit(); this.ui?.classList.remove('below-decks'); }
    document.body.classList.remove('below-decks');
    this.interior?.dispose();
    this.interior = null;
    for (const pool of [this._smoke, this._sparks]) if (pool) { this.fxRoot.remove(pool.pts); pool.pts.geometry.dispose(); pool.pts.material.dispose(); }
    this._smoke = this._sparks = null;
    this.loot?.forEach((L) => this.fxRoot.remove(L.g));
    this.loot = [];
    this.combo = null;
    this.app.input.lookLocked = false;
    this.app.setFreeCam?.(false);
    clearTimeout(this._hintTimer);
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
    for (const w of this.wrecks || []) { this.shipRoot.remove(w.group); disposeObject3D(w.group); }
    this.wrecks = [];
    for (const c of this.debris || []) { this.fxRoot.remove(c.mesh); c.mesh.geometry.dispose(); }
    this.debris = [];
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
    this.fireCd = 0; this.torpCd = 0; this.abilityCd = 0; this.scanCd = 0; this.bluffTimer = 0; this.hullPlateTimer = 0; this.saucerTimer = 0; this.speedBoostTimer = 0; this.pointDefenseTimer = 0;
    this.evadeTimer = 0; this.guardTimer = 0; this.markTimer = 0; this.sporeTimer = 0; this.overwatchTimer = 0;
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
      // Sol III is the real Earth: NASA day/night maps, clouds, city lights, oceans
      let planet, globe = null;
      if (p.id === 'sol-p2') {
        globe = new EarthGlobe(this.quality);
        if (globe.grid) globe.grid.visible = false;
        planet = globe.group;
        planet.scale.setScalar(radius / EARTH_RADIUS);
      } else {
        planet = makePlanet({ typeId: p.type, seed: p.seed, radius, quality: this.quality, name: p.name });
        planet.rotation.z = p.tilt * 0.5;
      }
      node.add(planet);
      // surveyed marker ring
      if (g.isSurveyed(p.id)) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.2, radius * 1.24, 64), new THREE.MeshBasicMaterial({ color: 0x62f2a6, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        node.add(ring);
      }
      pivot.add(node);
      this.systemRoot.add(pivot);
      this.planetNodes.push({ pivot, node, planet, data: p, orbitR, angle: p.phase || i * 1.1, speed: 0.006 / (1 + i * 0.4), radius, globe });
      // moons: orbit their planet, and can be landed on like any world
      (p.moonList || []).forEach((m, k) => {
        const mr = Math.max(4, m.visualRadius * 9);
        const mPivot = new THREE.Group();
        mPivot.rotation.x = m.tilt;
        const mNode = new THREE.Group();
        const dist = radius * (2.6 + k * 1.5) + mr * 2;
        mNode.position.x = dist;
        const moon = makePlanet({ typeId: m.type, seed: m.seed, radius: mr, quality: this.quality * 0.8, name: m.name });
        mNode.add(moon);
        mPivot.add(mNode);
        node.add(mPivot);
        this.planetNodes.push({ pivot: mPivot, node: mNode, planet: moon, data: m, orbitR: dist, angle: m.phase, speed: 0.05 / (1 + k), radius: mr, moon: true });
      });
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
      if (a.kind === 'voyager') this._loadVoyager(group, sprite, ring);
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
    // player (flight transform) → bankRig (visual roll only) → hull.
    // Rolling the whole rig keeps saucer, hull and nacelles together in a turn;
    // the hull's userData is shared so muzzles, thrusters and length still read
    // straight off this.player.
    const hull = buildShip(g.state.shipId, g.shipRecord, this.quality);
    this.player = new THREE.Group();
    this.player.name = 'player';
    this.player.userData = hull.userData;
    this.bankRig = new THREE.Group();
    this.bankRig.name = 'bank-rig';
    this.bankRig.add(hull);
    this.player.add(this.bankRig);
    this.hullModel = hull;
    this._glowBase = null;
    this._deflBase = undefined;
    this.player.position.set(-260, 96, 560);
    this.player.lookAt(0, 10, 0);
    this.player.rotateY(-0.28);
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
      this.bankRig.add(s);
      return s;
    });
    // look-around chase camera: right-drag (mouse) or right-half drag (touch)
    this.orbit?.dispose();
    this.orbit = new OrbitChase(this.app.canvas, {
      input: this.app.input,
      isTouch: () => isTouchScheme(),
      enabled: () => !this.freecam?.active && !this.dead && !this.interior?.active,
    });
    // keyboard camera: [ ] swing around the ship, - = zoom (N recenters)
    this._unkeys?.();
    this._unkeys = bindKeys({
      '[': () => (this.interior?.active ? false : this.orbit?.rotate(-60, 0)),
      ']': () => (this.interior?.active ? false : this.orbit?.rotate(60, 0)),
      '-': () => (this.interior?.active ? false : this.orbit?.zoomBy(1.15)),
      '=': () => (this.interior?.active ? false : this.orbit?.zoomBy(0.87)),
    });
    // free camera: O toggles a detached orbit rig so the hull can be inspected
    this.freecam?.dispose();
    this.freecam = new FreeCam(this.app.canvas, {
      onChange: (on) => {
        this.app.input.lookLocked = on;
        // the app owns the global buttons and the "hide every panel" switch
        this.app.setFreeCam?.(on);
        if (on) toast('Free camera · drag to orbit, wheel/pinch to zoom, O to exit', 'good', 3200);
        else toast('Chase camera', 'good', 1600);
        audio.ui();
      },
    });

    // a GLB hull lands a frame or two later: move the glow onto its real nacelles
    this._modelOff?.();
    this._modelOff = onModelLoaded((classId, ok) => {
      if (!ok || classId !== this.player?.userData.classId) return;
      this._alignEngineSprites();
    });
    this.camDist = Math.max(18, (this.player.userData.length || 6) * 2.6);
    this._mass = massFor(this.player.userData.length || 6);
    this.vel?.set(0, 0, 0);
    this.camera.position.copy(this.player.position).add(V(0, 6, -this.camDist));
    this.camera.lookAt(this.player.position);
  }

  /** Flip between the chase rig and the detached orbit camera (button + O key). */
  toggleFreeCam() {
    if (this.interior?.active) return false;
    return this.freecam?.toggle() ?? false;
  }

  /**
   * The cruise-speed strip works like a touchpad: drag anywhere on it (finger,
   * mouse or trackpad), scroll over it to nudge, double-tap for all stop,
   * arrow keys when it has focus. Momentum means the ship then catches up.
   */
  _bindThrottleStrip(strip) {
    if (!strip) return;
    const track = strip.querySelector('.track');
    const setFrom = (clientY) => {
      const r = track.getBoundingClientRect();
      this.throttle = clamp(1 - (clientY - r.top) / Math.max(1, r.height), 0, 1);
      if (this.throttle < 0.03) this.throttle = 0;
      this._toggleAutopilot(false);
      this._updateHud();
    };
    let dragging = null, lastTap = 0;
    strip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const now = performance.now();
      if (now - lastTap < 300) { this.throttle = 0; this._allStop = 0.8; toast('All stop', 'warn', 1000); lastTap = 0; this._updateHud(); return; }
      lastTap = now;
      dragging = e.pointerId;
      strip.setPointerCapture?.(e.pointerId);
      strip.classList.add('dragging');
      setFrom(e.clientY);
    });
    strip.addEventListener('pointermove', (e) => { if (dragging === e.pointerId) setFrom(e.clientY); });
    const end = (e) => { if (dragging === e.pointerId) { dragging = null; strip.classList.remove('dragging'); } };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
    strip.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.throttle = clamp(this.throttle - Math.sign(e.deltaY) * (Math.abs(e.deltaY) < 30 ? 0.02 : 0.08), 0, 1);
      this._updateHud();
    }, { passive: false });
    strip.addEventListener('keydown', (e) => {
      const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.25, PageDown: -0.25 }[e.key];
      if (step === undefined) return;
      e.preventDefault(); e.stopPropagation();
      this.throttle = clamp(this.throttle + step, 0, 1);
      this._updateHud();
    });
  }

  /* ================================================================ below decks */
  _toggleInterior(on = !this.interior?.active) {
    if (on === !!this.interior?.active || this.dead) return;
    const input = this.app.input;
    if (on) {
      this.freecam?.setActive(false);
      this._toggleAutopilot(false);
      this.interior ||= new ShipInterior(this.app, this.game);
      this.interior.resize(window.innerWidth, window.innerHeight);
      this.interior.enter();
      this.app.viewport.setScene(this.interior.scene, this.interior.camera);
      this.ui.classList.add('below-decks');
      document.body.classList.add('below-decks');
      audio.stopEngine();
      toast(isTouchScheme() ? 'Below decks · left side walks, right side looks · REPAIR at sparking stations' : 'Below decks · WASD walk, drag to look · hold E at a sparking station · I returns', 'good', 3600);
    } else {
      this.interior.exit();
      this.app.viewport.setScene(this.scene, this.camera);
      this.ui.classList.remove('below-decks');
      document.body.classList.remove('below-decks');
      audio.startEngine();
      toast('Back on the bridge viewscreen', 'good', 1400);
    }
    input.consumeAll();
    audio.ui();
  }

  _updateInterior(dt) {
    const input = this.app.input;
    input.update(dt);
    const r = this.interior.update(dt, this.time, input, this.crewJob);
    this._tickRepairs(dt);
    if (input.consume('interior') || input.consume('back')) { this._toggleInterior(false); return; }
    if (r.atLift && input.consume('ability')) { this._toggleInterior(false); return; }
    input.consume('ability');
    // HUD: where you are, what you can do here
    const room = $('#ih-room', this.ui);
    if (room) room.textContent = r.room.name;
    const prompt = $('#ih-prompt', this.ui);
    const btn = $('#ih-repair', this.ui);
    let msg = '';
    if (r.near && r.near.integrity < 0.999) {
      const S = SYSTEMS[r.near.sys];
      msg = this.interior.repairing ? `Repairing ${S.name}… ${Math.round(r.near.integrity * 100)}%` : `Hold ${isTouchScheme() ? 'REPAIR' : 'E'} to fix ${S.name} (${Math.round(r.near.integrity * 100)}%)`;
    } else if (r.near) msg = `${SYSTEMS[r.near.sys].name} · all green`;
    else if (r.atLift) msg = isTouchScheme() ? 'Turbolift — tap Back to flight' : 'Turbolift — press E to return to the bridge viewscreen';
    if (prompt) { prompt.textContent = msg; prompt.hidden = !msg; }
    if (btn) btn.hidden = !(r.near && r.near.integrity < 0.999);
    this._mapT = (this._mapT || 0) + dt;
    if (this._mapT > 0.15) { this._mapT = 0; this._drawMinimap(); }
  }

  /** Little deck plan: rooms, damaged ones red, you as an arrow, crew as dots. */
  _drawMinimap() {
    const cv = this.ui && $('#ih-map', this.ui);
    if (!cv) return;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const sx = (x) => W / 2 + x * (W / 18);
    const sz = (z) => H - 6 - (z + 32) * ((H - 12) / 60);
    const dmg = this.game.damage;
    const roomSys = { phasers: 'weapons', shields: 'shields', engines: 'engines', sensors: 'sensors', engineering: 'warp', bridge: 'structure' };
    const box = (a, fill) => { g.fillStyle = fill; g.fillRect(sx(a.x0), sz(a.z1), sx(a.x1) - sx(a.x0), sz(a.z0) - sz(a.z1)); };
    box(LAYOUT.corridor, 'rgba(120,160,200,.35)');
    for (const room of LAYOUT.rooms) {
      const sys = roomSys[room.id];
      const v = sys ? dmg[sys] : 1;
      box(room, v < 0.999 ? (v < BROKEN ? 'rgba(255,70,60,.75)' : 'rgba(255,170,60,.6)') : 'rgba(120,160,200,.5)');
    }
    for (const c of this.interior.crew) { g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(sx(c.g.position.x), sz(c.g.position.z), 2.5, 0, 7); g.fill(); }
    const p = this.interior.pos, y = this.interior.yaw;
    g.save(); g.translate(sx(p.x), sz(p.z)); g.rotate(y); g.fillStyle = '#59e0ff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
  }

  /** Put the engine glow sprites at the current hull's thruster anchors. */
  _alignEngineSprites() {
    const thrusters = this.player?.userData.thrusters || [];
    if (!thrusters.length || !this.engineSprites) return;
    this.engineSprites.forEach((s, i) => {
      const t = thrusters[i] || thrusters[thrusters.length - 1];
      if (t?.pos) s.position.copy(t.pos);
    });
  }

  /* ================================================================ enemies */
  _spawnEnemy(def, pos) {
    const group = buildEnemy(def.id || def.kind, this.quality);
    group.position.copy(pos);
    group.lookAt(this.player.position);
    // the shield bubble fits each hull: big ships get big bubbles
    const bubble = shieldBubble(Math.max(4, (group.userData.radius || 3) * 1.3), new THREE.Color(def.colors.glow).getHex());
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
                <button class="btn sm ghost" id="leave-btn" title="Galaxy map (G)" style="min-height:26px;padding:4px 8px;font-size:9px">Galaxy map <span class="kbd">G</span></button>
              </div>
            </div>
            <div class="vitals damage-panel" id="damage-panel" hidden>
              <div class="row between"><span class="tiny upper" style="font-size:8.5px;color:#ffb4ad">Damage report</span><span class="tiny faint">crew repairing</span></div>
              <div class="dp-list"></div>
              <button class="btn sm wide" id="below-btn" title="Walk inside the ship and repair it yourself (I)">⇩ Go below decks <span class="kbd">I</span></button>
            </div>
            <div class="vitals orders-card" id="orders-card" style="padding:8px 12px" title="Open the mission log (M)">
              <div class="tiny upper faint" style="font-size:8.5px">Current orders</div>
              <div class="small" id="mission-line" style="line-height:1.35">—</div>
              <div class="bar thin amber" id="mission-bar" hidden><i style="width:0%"></i></div>
              <div class="o-sub"><span id="mission-prog"></span><span id="contract-count"></span></div>
            </div>
          </div>

          <div class="enemy-vitals">
            <div class="vitals" id="target-card" style="display:none">
              <div class="row between"><span class="tiny" style="color:#ffb4ad" id="target-name">—</span><span class="tiny faint" id="target-dist"></span></div>
              <div class="bar red thin" id="target-hp" style="margin-top:5px"><i style="width:100%"></i></div>
              <div class="bar thin" id="target-shield" style="margin-top:3px"><i style="width:100%"></i></div>
            </div>
          </div>

          <div class="combo" id="combo" aria-live="polite"></div>
          <div class="bfx-layer" id="bfx-layer" aria-hidden="true"></div>
          <div class="interior-hud">
            <div class="ih-top"><span class="ih-room" id="ih-room">Bridge</span>
              <button class="btn sm" id="ih-back" title="Return to the bridge viewscreen (I or Esc)">⇧ Back to flight <span class="kbd">I</span></button></div>
            <canvas class="ih-map" id="ih-map" width="120" height="180" aria-label="Deck plan"></canvas>
            <div class="ih-prompt" id="ih-prompt" hidden></div>
            <button class="act-btn repair" id="ih-repair" data-action="repair" data-hold="1" hidden title="Hold to repair (E)"><span class="ico">🔧</span><span class="lbl">REPAIR</span><span class="kc">E</span></button>
            <div class="ih-cross"></div>
          </div>
          <div class="crosshair"><div class="c"></div></div>
          <div class="target-reticle" id="reticle"><div class="ring"></div><div class="tl" id="reticle-label">TARGET</div></div>
          <div class="syslog" id="syslog"></div>

          <div class="hud-actions">
            <button class="act-btn land" data-act="land" id="land-btn" title="Set down on the nearest planet (L)"><span class="ico">⤓</span><span class="lbl">LAND</span><span class="kc">L</span></button>
            <button class="act-btn warp" data-act="warp" id="warp-btn" title="Open the galaxy map and jump to another system (T)"><span class="ico">✧</span><span class="lbl">WARP</span><span class="kc">T</span></button>
            <button class="act-btn scan" data-action="scan" data-hold="0" id="scan-btn" title="Scan the nearest contact (R)"><span class="ico">⌖</span><span class="lbl">SCAN</span><span class="kc">R</span></button>
            <button class="act-btn ability" data-action="ability" data-hold="0" id="ability-btn" title="Ship special ability (E)"><span class="ico">✷</span><span class="lbl">ABILITY</span><span class="kc">E</span></button>
            <button class="act-btn auto" id="auto-btn" title="Autopilot — fly to your target, the nearest anomaly or planet (P)"><span class="ico">⟴</span><span class="lbl">AUTO</span><span class="kc">P</span></button>
            <button class="act-btn boost" data-action="boost" data-hold="1" title="Evasive boost (hold B)"><span class="ico">»</span><span class="lbl">BOOST</span><span class="kc">B</span></button>
            <button class="act-btn torp" data-action="torpedo" data-hold="1" title="Photon torpedo (F)"><span class="ico">◉</span><span class="lbl">TORP</span><span class="kc">F</span></button>
            <button class="act-btn fire" data-action="fire" data-hold="1" title="Fire phasers (hold left mouse or K)"><span class="ico">✦</span><span class="lbl">FIRE</span><span class="kc">K</span></button>
          </div>
          <div class="control-strip" id="control-strip">
            <span><b>W</b>/<b>S</b> thrust · <b>A</b>/<b>D</b> turn · <b>Space</b>/<b>Shift</b> up/down</span><span class="sep"></span>
            <span><b>Click</b>/<b>K</b> fire</span><span class="sep"></span>
            <span><b>P</b> autopilot</span><span class="sep"></span>
            <span><b>F</b> torpedo</span><span class="sep"></span>
            <span><b>E</b> ability</span><span class="sep"></span>
            <span><b>Q</b> target</span><span class="sep"></span>
            <span><b>T</b> warp</span><span class="sep"></span>
            <span><b>Z</b>/<b>C</b> cruise · <b>B</b> boost</span><span class="sep"></span>
            <span><b>X</b> brake</span><span class="sep"></span>
            <span><b>L</b> land</span><span class="sep"></span>
            <span><b>Right-drag</b> look · <b>wheel</b> zoom · <b>N</b> recenter</span><span class="sep"></span>
            <span><b>O</b> free cam</span>
          </div>
          <div class="stick-zone" id="stick"><div class="stick-base"></div><div class="stick-knob" id="stick-knob"></div></div>
          <div class="throttle-ui" id="throttle-ui" role="slider" tabindex="0" aria-label="Cruise speed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
               title="Cruise speed — drag, or two-finger scroll over it · double-tap for all stop">
            <div class="ts-read"><b id="ts-set">0%</b><span id="ts-speed">0 u/s</span></div>
            <div class="track">
              <i id="throttle-fill" style="height:0%"></i>
              <em id="throttle-actual" style="bottom:0%"></em>
              <span class="ts-knob" id="ts-knob" style="bottom:0%"></span>
              <s style="bottom:25%"></s><s style="bottom:50%"></s><s style="bottom:75%"></s>
            </div>
            <div class="lbl">CRUISE</div>
          </div>
          <div class="lift-pad" id="lift-pad">
            <button class="thr-btn" data-action="up" data-hold="1" title="Climb (Page Up)"><span>⤒</span></button>
            <button class="thr-btn fwd" data-action="thrust" data-hold="1" title="Speed up (Space)"><span>▲</span></button>
            <button class="thr-btn" data-action="reverse" data-hold="1" title="Slow down / back up (Shift)"><span>▼</span></button>
            <button class="thr-btn" data-action="down" data-hold="1" title="Descend (Page Down)"><span>⤓</span></button>
          </div>
          <div class="throttle-pad" id="throttle-pad">
            <button class="thr-btn up" data-action="throttleUp" data-hold="1" title="Speed up (Space)"><span>▲</span></button>
            <div class="thr-read" id="thr-read">72%</div>
            <button class="thr-btn down" data-action="throttleDown" data-hold="1" title="Slow down (Shift)"><span>▼</span></button>
            <button class="thr-btn brake" data-action="brake" data-hold="0" title="All stop (X)"><span>■</span></button>
          </div>
          <div class="touch-hint" id="touch-hint">Left: drag to steer · Right: drag to look</div>
          <div class="globe-labels" id="obj-labels"></div>
        </div>
      </div>`);
    document.getElementById('ui').appendChild(this.ui);
    this._labelsEl = $('#obj-labels', this.ui);
    this._fxLayer = $('#bfx-layer', this.ui);
    this._redAlerted = false;
    $('#leave-btn', this.ui).onclick = () => { audio.ui(); this.app.setScene('galaxy'); };
    $('#orders-card', this.ui).onclick = () => { audio.ui(); showMissionLog(this.game); };
    $('#land-btn', this.ui).onclick = () => this._landAtNearest();
    $('#auto-btn', this.ui).onclick = () => this._toggleAutopilot();
    this._bindThrottleStrip($('#throttle-ui', this.ui));
    $('#below-btn', this.ui).onclick = () => this._toggleInterior(true);
    $('#ih-back', this.ui).onclick = () => this._toggleInterior(false);
    $('#warp-btn', this.ui).onclick = () => {
      audio.ui();
      this.addLog('Opening the galaxy map — pick a star and engage warp.', 'good');
      this.app.setScene('galaxy');
      toast('Select a star system, then Engage warp', 'good', 3200);
    };
    const ab = $('#ability-btn', this.ui);
    ab.querySelector('.lbl').textContent = (ability?.name || 'Ability').split(' ')[0].toUpperCase();
    ab.title = `${ability?.name || 'Ability'} — ${ability?.desc || ''} (E)`;
    this._refreshMissionLine();
    this.planetsSurveyed = 0;
    this._buildObjectLabels();
    this._logEl = $('#syslog', this.ui);
    this.logLines = [];
    this.addLog(`Entering ${sys.name} — ${STAR_LABEL[sys.star] || 'stellar body'}`, 'good');
    this.addLog(isTouchScheme() ? 'Drag to steer · drag the speed strip for speed · AUTO flies for you' : 'W/S nose up/down · A/D turn · Space faster · Shift slower · click or K fires · P autopilot', '');
    this._updateHud(true);
  }

  /**
   * The HUD explains itself in whichever language the current device speaks:
   * a thumb gets a one-line gesture reminder, a keyboard gets the key strip.
   * Re-shown whenever the scheme flips (Settings, or a tablet keyboard popping in).
   */
  _showSchemeHint() {
    const hint = $('#touch-hint', this.ui);
    const strip = $('#control-strip', this.ui);
    const touch = isTouchScheme();
    if (strip) strip.hidden = touch;
    if (!hint) return;
    hint.hidden = !touch;
    if (!touch) return;
    hint.textContent = device.form === 'tablet'
      ? 'Left side: drag to steer · Right side: drag to look around · pinch to zoom · double-tap to recenter'
      : 'Left: drag to steer · Right: drag to look · double-tap recenters';
    hint.classList.remove('fade');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => hint.classList.add('fade'), 7000);
    this._schemeOff?.();
    this._schemeOff = onDeviceChange(() => this._showSchemeHint());
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
    const prog = m ? this.game.progressOf(m) : null;
    const bar = $('#mission-bar', this.ui);
    const txt = $('#mission-prog', this.ui);
    if (bar) {
      bar.hidden = !prog;
      if (prog) bar.querySelector('i').style.width = `${Math.round((prog[0] / Math.max(1, prog[1])) * 100)}%`;
    }
    if (txt) txt.textContent = prog ? `${prog[0]} / ${prog[1]}` : '';
    const cc = $('#contract-count', this.ui);
    if (cc) {
      const all = this.game.contracts;
      cc.textContent = `Contracts ${all.filter((c) => c.done).length}/${all.length}`;
    }
  }

  _buildObjectLabels() {
    if (!this._labelsEl) return;
    const items = [];
    this.planetNodes.forEach((p, i) => {
      items.push({ id: `p${i}`, kind: 'planet', text: p.data.name, sub: PT[p.data.type].short, node: p, moon: !!p.moon });
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
    const stats = this.stats;
    // gentler, more responsive helm — slower while the saucer is out of line
    const turn = stats.turn * 1.35 * damageEffects(this.game.damage).turn;

    // --- steering assist: if a target is locked and roughly ahead, drift toward it
    let assistX = 0, assistY = 0;
    if (this.target && !this.target.dead && this.game.state.settings.aimAssist !== false) {
      const toT = this.target.group.position.clone().sub(this.player.position);
      const dist = toT.length();
      if (dist > 4) {
        const local = toT.clone().applyQuaternion(this.player.quaternion.clone().invert()).normalize();
        const ahead = local.z > 0.35;
        if (ahead) {
          // thumbs are less precise than a mouse, so the helm helps a little more
          const strength = isTouchScheme() ? 1.35 : 1;
          const a = assistFor(local, { strength });
          assistX = a.x; assistY = a.y;
        }
      }
    }
    // --- autopilot: P / the AUTO button. Any manual stick, key or thrust takes over.
    if (input.consume('autopilot')) this._toggleAutopilot();
    // manual = a key, stick, thumb or a mouse that is MOVING — a cursor merely
    // resting off-centre (e.g. on the AUTO button) must not cancel autopilot
    const k = input.keys;
    const steering = ['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].some((x) => k.has(x)) || input.stick.active || (input.mouseActive && input.mouseIdle < 0.15 && (Math.abs(input.rawSteer.x) > 0.25 || Math.abs(input.rawSteer.y) > 0.25));
    const manual = steering || input.throttleRate !== 0 || input.lift !== 0;
    let ap = null;
    if (this.autopilot) {
      if (manual) this._toggleAutopilot(false, 'Manual control');
      else ap = this._autopilotStep();
    }
    const inSteerX = ap ? ap.steer.x : input.steer.x;
    const inSteerY = ap ? ap.steer.y : input.steer.y;
    const steerX = clamp(inSteerX + assistX * (1 - Math.min(1, Math.abs(inSteerX))), -1, 1);
    const steerY = clamp(inSteerY + assistY * (1 - Math.min(1, Math.abs(inSteerY))), -1, 1);

    // plane-style helm (core/helm.js): turns and tips the nose, never rolls or
    // loops over, and eases back to level when you let go of up/down
    flyHelm(this.player.quaternion, { x: steerX, y: steerY }, {
      turn,
      dt,
      invertY: this.game.state.settings.invertY === true,
      level: ap ? 0 : 1,
    });

    // --- speed: hold Space (or Z / ▲) to go faster, Shift (or C / ▼) to slow down.
    // Keep holding Shift once stopped and the ship backs up. X is all-stop.
    let reverse = 0;
    if (input.throttleRate) {
      this._autoReverseHold = input.throttleRate < 0 && this.throttle <= 0 ? (this._autoReverseHold || 0) + dt : 0;
      this.throttle = clamp(this.throttle + input.throttleRate * dt * (isTouchScheme() ? 0.55 : 0.75), 0, 1);
      if (this._autoReverseHold > 0.25) reverse = -0.6;   // backing up is gentle
    } else this._autoReverseHold = 0;
    let braking = false;
    if (input.consume('brake')) {
      this.throttle = 0;
      this._allStop = 0.8;
      this._toggleAutopilot(false);
      this._abilityRing('#9fd8ff', 8);
      toast('All stop', 'warn', 1200);
      audio.ui();
    }
    if (this._allStop > 0) { this._allStop -= dt; braking = true; }

    const boosting = input.actions.boost && this.boost > 0.02;
    this.boosting = boosting;
    if (boosting) this.boost = Math.max(0, this.boost - dt * 0.34);
    else this.boost = Math.min(1, this.boost + dt * 0.16);
    const baseSpeed = stats.speed * damageEffects(this.game.damage).speed;
    const sprint = this.speedBoostTimer > 0 ? 1.45 : 1;
    // --- physics: engines push a real velocity; momentum carries through turns
    stepFlight(this.vel, this.player.quaternion, {
      thrust: ap ? ap.thrust : reverse,
      lift: ap ? 0 : input.lift,
      cruise: ap ? 0 : this.throttle,
      boost: boosting,
      brake: braking,
    }, { maxSpeed: baseSpeed * sprint, mass: this._mass || 1 }, dt);
    this.player.position.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();
    this._collide(dt);

    const forward = V(0, 0, 1).applyQuaternion(this.player.quaternion);

    // stellar corona — fly too close to the star and the hull cooks
    if (this.star && !this.dead) {
      const sr = this.star.userData.radius || 85;
      const toStar = this.player.position.clone();
      const d = toStar.length();
      const burn = sr * 2.15;
      if (d < burn) {
        const heat = 1 - d / burn;
        this.player.position.addScaledVector(toStar.normalize(), -heat * 220 * dt);
        this._damagePlayer(heat * 46 * dt, true);
        this.shake = Math.max(this.shake, heat * 0.8);
        if (this.time - (this.starWarnTimer || 0) > 4) {
          this.starWarnTimer = this.time;
          this.addLog('Corona density critical — shields are boiling off. Break away.', 'hostile');
          this._flashWarning('STELLAR CORONA');
          audio.alert();
        }
      }
    }

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
    if (this.bankRig) this.bankRig.rotation.z = damp(this.bankRig.rotation.z, bankFor(steerX), 4, dt);

    // engine glow pulsing
    if (this.engineSprites) {
      const e = boosting ? 1.6 : 0.72;
      this.engineSprites.forEach((s) => {
        s.material.opacity = 0.55 + Math.sin(this.time * 22) * 0.12 + (boosting ? 0.3 : 0);
        s.scale.setScalar(2.0 * e + Math.sin(this.time * 15) * 0.2);
      });
    }

    // camera: a detached orbit rig when the player is inspecting the hull,
    // otherwise the usual chase rig sitting behind the nose
    if (this.freecam?.active) {
      this.freecam.update(dt, this.camera, this.player.position, this.player.userData.length || 6);
      // keep the shake from being lost while detached — it reads as hull impact
      if (this.shake > 0.001) this.shake = damp(this.shake, 0, 5, dt);
    } else {
      // chase camera with a player-controlled orbit offset (look around like a
      // third-person game); with no offset it is the classic behind-the-nose view
      if (input.consume('recenter')) this.orbit?.recenter();
      this.orbit?.update(dt);
      const look0 = this.orbit || { yaw: 0, pitch: 0, zoom: 1 };
      const { pos: camGoal, amount } = chaseOffset(this.player.position, this.player.quaternion, this.camDist, 3.2, look0);
      this.camera.position.lerp(camGoal, 1 - Math.exp(-(amount > 0 ? 10 : 6) * dt));
      const ahead = this.player.position.clone().add(forward.clone().multiplyScalar(32));
      const atShip = this.player.position.clone().add(V(0, 1, 0).applyQuaternion(this.player.quaternion).multiplyScalar(1.2));
      this.camera.lookAt(ahead.lerp(atShip, amount));
      if (this.shake > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.4;
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.4;
        this.shake = damp(this.shake, 0, 5, dt);
      }
    }
    const fovTarget = 58 + (boosting ? 8 : 0);
    this.camera.fov = damp(this.camera.fov, fovTarget, 3, dt);
    this.camera.updateProjectionMatrix();

    // weapons
    this.fireCd -= dt;
    this.torpCd -= dt;
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.abilityTimer = Math.max(0, this.abilityTimer - dt);
    this.bluffTimer = Math.max(0, this.bluffTimer - dt);
    this.hullPlateTimer = Math.max(0, this.hullPlateTimer - dt);
    this.saucerTimer = Math.max(0, this.saucerTimer - dt);
    this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
    this.pointDefenseTimer = Math.max(0, this.pointDefenseTimer - dt);
    this.evadeTimer = Math.max(0, this.evadeTimer - dt);
    this.guardTimer = Math.max(0, this.guardTimer - dt);
    this.markTimer = Math.max(0, this.markTimer - dt);
    this.sporeTimer = Math.max(0, this.sporeTimer - dt);
    this.overwatchTimer = Math.max(0, this.overwatchTimer - dt);
    this.scanCd = Math.max(0, this.scanCd - dt);

    const autoFire = this.game.state.settings.autoFire;
    if ((input.actions.fire || autoFire) && this.fireCd <= 0) this._firePhasers();
    if (input.actions.torpedo && this.torpCd <= 0) this._fireTorpedo();
    if (input.consume('cam')) this.freecam?.toggle();
    if (input.consume('interior')) { this._toggleInterior(true); return; }
    if (input.consume('land')) { this._landAtNearest(); return; }
    if (input.consume('ability')) this._useAbility();
    if (input.consume('scan')) this._scanAction();
    if (input.consume('target')) this._cycleTarget();
    if (input.consume('warp')) {
      if (!damageEffects(this.game.damage).warp) {
        toast('Warp core offline — repair it in Main Engineering (I)', 'warn', 2600);
        audio.error();
        return;
      }
      audio.ui();
      toast('Select a star system, then Engage warp', 'good', 3000);
      this.app.setScene('galaxy');
      return;
    }
    if (input.consume('assist')) {
      const on = this.game.state.settings.aimAssist === false;
      this.game.state.settings.aimAssist = on;
      this.game.save();
      this.addLog(`Weapons assist ${on ? 'engaged' : 'disengaged'}`, 'good');
      toast(`Weapons assist ${on ? 'ON' : 'OFF'}`, on ? 'good' : 'warn', 1600);
    }

    this._updateTargeting();
    this._updateScanPrompt();
    this._updateLandPrompt();
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
    this.fireCd = 1 / (stats.fireRate * damageEffects(this.game.damage).fireRate * (this.abilityTimer > 0 && ['overload', 'reactorOverdrive'].includes(this.game.shipClass.ability.id) ? 2 : 1));
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
      let mul = this.abilityTimer > 0 && ['overload', 'reactorOverdrive'].includes(this.game.shipClass.ability.id) ? 1.5 : 1;
      if (this.sporeTimer > 0) mul *= 1.5;
      const dmg = stats.phaser * mul;
      this._damageEnemy(target, dmg);
      this._impact(end, this.game.shipRecord.nacelle || '#59e0ff');
      this.shake = Math.max(this.shake, 0.18);
      // Overwatch: the turrets keep shooting at whatever else is in the arc
      if (this.overwatchTimer > 0) {
        const extra = this._aliveEnemies()
          .filter((e) => e !== target)
          .map((e) => ({ e, d: e.group.position.distanceTo(this.player.position), dir: e.group.position.clone().sub(muzzle) }))
          .filter((o) => o.d < 700 && o.dir.normalize().dot(forward) > 0.2)
          .sort((a, b) => a.d - b.d)
          .slice(0, 2);
        for (const o of extra) {
          this._spawnBeam(muzzle, o.e.group.position.clone(), this.game.shipRecord.nacelle || '#59e0ff', 0.5);
          this._damageEnemy(o.e, dmg * 0.6);
        }
      }
    }
    // separated saucer section adds its own beam
    if (this.saucerSection && target) {
      this._spawnBeam(this.saucerSection.position.clone(), target.group.position.clone(), '#9fe6ff', 0.55);
      this._damageEnemy(target, stats.phaser * 0.35);
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
    } else if (ability.id === 'corbomite') {
      this.bluffTimer = 6;
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.25);
      this._corbomiteBurst();
      this.addLog('Corbomite Maneuver — the hostiles are holding fire', 'good');
      toast('Corbomite Maneuver', 'good', 2200);
      audio.confirm();
    } else if (ability.id === 'polarizedHull') {
      this.hullPlateTimer = 8;
      this._abilityRing('#ffd08a', 20);
      this.addLog('Polarised hull plating energised — damage reduced 60% for 8s', 'good');
      audio.upgrade();
    } else if (ability.id === 'transwarp') {
      const fwd = V(0, 0, 1).applyQuaternion(this.player.quaternion);
      this.player.position.addScaledVector(fwd, 520);
      this.speedBoostTimer = 6;
      this._warpFlash(this.player.position);
      this.addLog('Transwarp sprint — 520 units ahead, 45% speed for 6s', 'good');
      audio.warp();
    } else if (ability.id === 'saucerSep') {
      this.saucerTimer = 8;
      this._spawnSaucerSection();
      this._abilityRing('#9fe6ff', 26);
      this.addLog('Saucer separation — both sections are engaging', 'good');
      audio.upgrade();
    } else if (ability.id === 'fleetBarrage') {
      const alive = this._aliveEnemies();
      for (let i = 0; i < 10; i++) {
        const muzzle = this._muzzleWorld('torp');
        const t = alive[i % Math.max(1, alive.length)];
        const dir = t
          ? t.group.position.clone().sub(muzzle).normalize()
          : V(0, 0, 1).applyQuaternion(this.player.quaternion);
        this._spawnTorpedo(muzzle, dir, this.stats.torp * 0.8, t || null, 'player');
      }
      this.hull = Math.min(this.maxHull, this.hull + this.maxHull * 0.22);
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.3);
      this._abilityRing('#c9a6ff', 30);
      this.addLog('Fleet barrage away — hull and shields regenerating', 'good');
      audio.torpedo(0.5);
    } else if (ability.id === 'pointDefense') {
      this.pointDefenseTimer = 5;
      const bolts = this.projectiles.filter((p) => p.owner === 'enemy');
      bolts.forEach((p) => this._impact(p.mesh.position.clone(), '#8fd6ff'));
      this._clearEnemyProjectiles();
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.3);
      this._abilityRing('#8fd6ff', 18);
      this.addLog(`Point defence active — ${bolts.length} incoming shot${bolts.length === 1 ? '' : 's'} intercepted`, 'good');
      audio.confirm();
    } else if (ability.id === 'reactorOverdrive') {
      this.abilityTimer = 6;
      this._abilityRing('#ffd08a', 22);
      this.addLog('Reactor overdrive — rate of fire doubled for 6s', 'good');
      audio.upgrade();
    } else if (ability.id === 'slingshot') {
      const fwd = V(0, 0, 1).applyQuaternion(this.player.quaternion);
      this.player.position.addScaledVector(fwd, 520);
      this.speedBoostTimer = 6;
      this._warpFlash(this.player.position);
      this.addLog('Time slingshot — thrown 520 units ahead', 'good');
      audio.warp();
    } else if (ability.id === 'refitSpread') {
      const alive = this._aliveEnemies();
      for (let i = 0; i < 6; i++) {
        const muzzle = this._muzzleWorld('torp');
        const t = alive[i % Math.max(1, alive.length)];
        const dir = t
          ? t.group.position.clone().sub(muzzle).normalize()
          : V(0, 0, 1).applyQuaternion(this.player.quaternion);
        this._spawnTorpedo(muzzle, dir, this.stats.torp * 0.85, t || null, 'player');
      }
      this.addLog('Full spread away — six photons', 'good');
      audio.torpedo(0.4);
    } else if (ability.id === 'dreadnoughtBarrage') {
      const alive = this._aliveEnemies();
      for (let i = 0; i < 10; i++) {
        const muzzle = this._muzzleWorld('torp');
        const t = alive[i % Math.max(1, alive.length)];
        const dir = t
          ? t.group.position.clone().sub(muzzle).normalize()
          : V(0, 0, 1).applyQuaternion(this.player.quaternion);
        this._spawnTorpedo(muzzle, dir, this.stats.torp * 0.8, t || null, 'player');
      }
      this.hull = Math.min(this.maxHull, this.hull + this.maxHull * 0.2);
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.35);
      this._abilityRing('#ff8a7d', 32);
      this.addLog('Dreadnought barrage away — reactor dumped to shields', 'good');
      audio.torpedo(0.5);
    } else if (ability.id === 'evasive') {
      this.evadeTimer = 4;
      this.speedBoostTimer = Math.max(this.speedBoostTimer, 3);
      this._abilityRing('#a7f0ff', 16);
      this.addLog('Evasive pattern — reaction control is jinking the hull', 'good');
      toast('Evasive Pattern', 'good', 1800);
      audio.upgrade();
    } else if (ability.id === 'torpedoRun') {
      const alive = this._aliveEnemies();
      for (let i = 0; i < 8; i++) {
        const muzzle = this._muzzleWorld('torp');
        const t = alive[i % Math.max(1, alive.length)];
        const dir = t
          ? t.group.position.clone().sub(muzzle).normalize()
          : V(0, 0, 1).applyQuaternion(this.player.quaternion);
        // a tight fan so a single pass can straddle a hull
        dir.applyAxisAngle(V(0, 1, 0), (i - 3.5) * 0.035).normalize();
        this._spawnTorpedo(muzzle, dir, this.stats.torp * 0.62, t || null, 'player');
      }
      this.torpCd = Math.min(this.torpCd, 0.2);
      this._abilityRing('#8fd6ff', 20);
      this.addLog('Torpedo run — eight away, magazines spent', 'good');
      audio.torpedo(0.5);
    } else if (ability.id === 'sensorSweep') {
      this.markTimer = 10;
      for (const e of this._aliveEnemies()) {
        if (e.cloaked) {
          e.cloaked = false;
          e.cloak = 0;
          if (e.group) e.group.visible = true;
        }
        this._abilityRing('#9fe6ff', 6);
      }
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.12);
      this._abilityRing('#9fe6ff', 26);
      this.addLog('Sensor sweep — cloaks collapsed, firing solutions locked (+35% damage, 10s)', 'good');
      audio.scan();
      audio.confirm();
    } else if (ability.id === 'lastStand') {
      this.guardTimer = 8;
      this.hull = Math.min(this.maxHull, this.hull + this.maxHull * 0.12);
      this._abilityRing('#ffd9a0', 28);
      this.addLog('Last Stand — structural integrity field at maximum, damage down 55%', 'good');
      toast('Last Stand', 'good', 2000);
      audio.upgrade();
    } else if (ability.id === 'sporeJump') {
      const enemy = this._nearestEnemy();
      const fwd = V(0, 0, 1).applyQuaternion(this.player.quaternion);
      if (enemy) {
        const eFwd = V(0, 0, 1).applyQuaternion(enemy.group.quaternion);
        // reappear astern of the target, nose already on it
        this.player.position.copy(enemy.group.position)
          .addScaledVector(eFwd, -80)
          .add(V(0, 14, 0));
        const m = new THREE.Matrix4().lookAt(this.player.position, enemy.group.position, V(0, 1, 0));
        this.player.quaternion.setFromRotationMatrix(m);
        this.addLog('Spore jump — emerged astern of the target, weapons hot', 'good');
      } else {
        this.player.position.addScaledVector(fwd, 300);
        this.addLog('Spore jump — displaced 300 units ahead', 'good');
      }
      this.sporeTimer = 6;
      this._warpFlash(this.player.position);
      this._abilityRing('#c9a6ff', 30);
      audio.warp();
    } else if (ability.id === 'overwatch') {
      this.overwatchTimer = 8;
      this._abilityRing('#a9e7ff', 24);
      this.addLog('Overwatch — turrets slaved to the plot, engaging multiple contacts', 'good');
      toast('Overwatch', 'good', 1800);
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

  _abilityRing(color = '#8fd6ff', size = 24) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      })
    );
    ring.position.copy(this.player.position);
    ring.quaternion.copy(this.camera.quaternion);
    this.fxRoot.add(ring);
    this.effects.push({ obj: ring, life: 0.8, maxLife: 0.8, kind: 'impact', grow: size });
  }

  /** Galaxy-class saucer separation: a real second model that flies alongside. */
  _spawnSaucerSection() {
    this._dropSaucerSection();
    const g = this.game;
    const mats = makeShipMaterials(g.shipClass, g.shipRecord, this.quality);
    const group = new THREE.Group();

    // the saucer itself
    const saucer = new THREE.Mesh(saucerGeometry(1.9, 0.2, { segments: 72, scaleZ: 1.2 }), mats.hull);
    saucer.position.y = 0.2;
    group.add(saucer);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.05, 6, 72), mats.trim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.2;
    group.add(rim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.trim);
    dome.position.y = 0.34;
    group.add(dome);
    // impulse engine glow on the saucer's aft edge
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.2), mats.glow);
    glow.position.set(0, 0.22, -1.9);
    glow.rotation.y = Math.PI;
    group.add(glow);

    // stardrive section behind and below
    const drive = new THREE.Group();
    const body = new THREE.Mesh(bodyLathe(3.4, 0.5, { segments: 32, front: 0.42, back: 0.6 }), mats.hull);
    body.scale.y = 0.9;
    drive.add(body);
    for (const sgn of [-1, 1]) {
      const nac = new THREE.Mesh(bodyLathe(2.6, 0.19, { segments: 20, front: 0.66, back: 0.58 }), mats.hull);
      nac.position.set(sgn * 1.1, 0.55, -0.3);
      drive.add(nac);
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), mats.glow);
      grille.position.set(sgn * 1.1, 0.55, -0.3);
      drive.add(grille);
    }
    const pod = new THREE.Mesh(roundedBox(0.4, 0.24, 1.0, 0.06), mats.trim);
    pod.position.set(0, 0.55, 0.4);
    drive.add(pod);
    drive.position.set(0, -1.5, -4.5);
    group.add(drive);

    this.shipRoot.add(group);
    this.saucerSection = group;
  }

  _dropSaucerSection() {
    if (!this.saucerSection) return;
    this.shipRoot.remove(this.saucerSection);
    disposeObject3D(this.saucerSection);
    this.saucerSection = null;
  }

  _updateSaucerSection(dt) {
    if (!this.saucerSection) return;
    if (this.saucerTimer <= 0 || this.dead) { this._dropSaucerSection(); return; }
    const fwd = V(0, 0, 1).applyQuaternion(this.player.quaternion);
    const right = V(1, 0, 0).applyQuaternion(this.player.quaternion);
    const goal = this.player.position.clone()
      .addScaledVector(right, 13)
      .addScaledVector(fwd, 4)
      .add(V(0, 2, 0));
    this.saucerSection.position.lerp(goal, 1 - Math.exp(-6 * dt));
    this.saucerSection.quaternion.slerp(this.player.quaternion, 1 - Math.exp(-6 * dt));
  }

  _corbomiteBurst() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 3.4, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#8fd6ff'), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      })
    );
    ring.position.copy(this.player.position);
    ring.quaternion.copy(this.camera.quaternion);
    this.fxRoot.add(ring);
    this.effects.push({ obj: ring, life: 0.9, maxLife: 0.9, kind: 'impact', grow: 26 });
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#bcaeff'), color: new THREE.Color('#bcaeff'), transparent: true,
      opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    flash.position.copy(this.player.position);
    flash.scale.setScalar(9);
    this.fxRoot.add(flash);
    this.effects.push({ obj: flash, life: 0.6, maxLife: 0.6, kind: 'impact', grow: 22 });
    // the bluff itself: a wash of false sensor returns
    this._spawnBeam(this.player.position.clone().add(V(0, 4, 0)), this.player.position.clone().add(V(0, 60, 0)), '#bcaeff', 1.4);
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

  _clearEnemyProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.owner !== 'enemy') continue;
      this._removeProjectile(p);
      this.projectiles.splice(i, 1);
    }
  }

  _removeProjectile(p) {
    this.fxRoot.remove(p.mesh);
    disposeObject3D(p.mesh);
  }

  /* ================================================================ damage */
  _damageEnemy(enemy, amount) {
    if (!enemy || enemy.dead) return;
    let dmg = this.markTimer > 0 ? amount * 1.35 : amount;
    enemy._numAcc = (enemy._numAcc || 0) + dmg;
    enemy._numKind = enemy.shield > 0 ? 'shield' : (amount > 120 ? 'crit' : 'hull');
    if (this.time - (enemy._numT || 0) > 0.22) {
      enemy._numT = this.time;
      floatNumber(this._fxLayer, this.camera, enemy.group.position, enemy._numAcc, enemy._numKind);
      enemy._numAcc = 0;
    }
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
    const size = enemy.kind === 'voidlord' ? 4.4 : enemy.kind === 'cube' ? 3.4 : Math.max(1.2, Math.min(3, (enemy.radius || 2.5) * 0.6));
    this._explosion(pos, size * 0.6, enemy.def.colors.glow || '#ffb066');
    this._wreck(enemy, size);
    // kill streak: chain kills inside the window for a growing multiplier
    this.combo = this.combo && this.combo.timer > 0 ? { count: this.combo.count + 1, timer: 10 } : { count: 1, timer: 10 };
    const mult = 1 + Math.min(this.combo.count - 1, 6) * 0.25;
    this.game.noteStreak(this.combo.count);
    const reward = this.game.recordKill(enemy.def, { mult });
    this.addLog(`Destroyed ${enemy.def.label || enemy.def.name} · +${fmtC(reward.credits)} +${reward.dilithium}D${mult > 1 ? ` · ×${mult} streak` : ''}`, 'good');
    toast(`+${fmtC(reward.credits)} · +${reward.dilithium} dilithium · +${reward.xp} XP${mult > 1 ? ` · ×${mult}` : ''}`, 'good');
    this._showCombo();
    this._spawnLoot(pos, enemy);
    destroyedStamp(this._fxLayer, this.camera, pos, escapeHtml(enemy.def.label || enemy.def.name), `+${fmtC(reward.credits)}${mult > 1 ? ` · ×${mult}` : ''}`);
    this.fleetKilled++;
    if (this.target === enemy) this.target = null;
    this._refreshMissionLine();
    if (this._aliveEnemies().length === 0) this._onSystemCleared();
    if (enemy.kind === 'voidlord') this._onBossDefeated();
  }

  /**
   * How an enemy looks right now: blinking nav lights, spinning parts, and
   * the damage it has taken — smoke and sparks venting from the hull, flickering
   * engines and a wounded ship listing off its course.
   */
  _enemyLooks(e, dt) {
    const g = e.group;
    updateNavLights(g, this.time);
    const spin = g.userData.spin;
    if (spin) for (const r of g.userData.rings || g.children[0]?.userData.rings || []) r.rotation.z += dt * spin * 20;
    const hurt = e.maxHp > 0 ? 1 - Math.max(0, e.hp) / e.maxHp : 0;
    if (!(hurt >= 0.25) || e.cloaked) { if (e._list) { g.rotation.z -= e._list; e._list = 0; } return; }
    if (!this._smoke) this._initDamageFx();
    const r = e.radius;
    if (Math.random() < (hurt - 0.2) * 20 * dt) {
      // a random spot on the hull, pushed out along the hull's surface
      const local = V((Math.random() - 0.5) * r, (Math.random() - 0.3) * r * 0.35, (Math.random() - 0.5) * r * 1.2);
      const p = local.applyMatrix4(g.matrixWorld);
      const out = local.clone().normalize();
      this._emit(this._smoke, p, out.clone().multiplyScalar(1.5 + Math.random()), 1.4 + hurt * 1.6);
      if (Math.random() < 0.55) this._emit(this._sparks, p, out.multiplyScalar(5 + Math.random() * 5), 0.3 + Math.random() * 0.3);
    }
    // engines sputter, and a badly hurt ship rolls off level
    const glow = g.userData.materials?.glow;
    if (glow) {
      if (!glow.userData.base) glow.userData.base = glow.color.clone();
      const flick = hurt > 0.6 && Math.random() < 0.12 ? 0.25 : 1;
      glow.color.copy(glow.userData.base).multiplyScalar(flick * (1 - hurt * 0.35));
    }
    const list = Math.sin(this.time * 1.3 + e.phase) * 0.18 * Math.max(0, hurt - 0.5);
    g.rotation.z += list - (e._list || 0);
    e._list = list;
  }

  /**
   * A destroyed ship doesn't just vanish: the dead hulk tumbles on, venting and
   * breaking up, with pieces of hull flying off, until its core goes up.
   */
  _wreck(enemy, size) {
    const g = enemy.group;
    enemy.bubble.visible = false;
    for (const s of g.userData.navLights || []) s.visible = false;
    const m = g.userData.materials;
    if (m?.glow) m.glow.color.multiplyScalar(0.15);
    if (m?.glowSoft) m.glowSoft.opacity = 0.05;
    if (m?.hull?.color) m.hull.color.multiplyScalar(0.55);      // scorched
    for (const wm of g.userData.glowMats || []) if (wm !== m?.glow && wm !== m?.glowSoft && wm.color) wm.color.multiplyScalar(0.1);
    const fwd = V(0, 0, 1).applyQuaternion(g.quaternion);
    const axis = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.wrecks = this.wrecks || [];
    const life = 1.4 + Math.min(2.2, size * 0.45);
    this.wrecks.push({ group: g, vel: fwd.multiplyScalar(8 + Math.random() * 8), axis, rate: 0.8 + Math.random() * 1.4, life, max: life, blast: 0.25, size, color: enemy.def.colors.glow || '#ffb066' });
    // chunks of hull plating thrown clear
    this.debris = this.debris || [];
    const n = Math.round((4 + size * 3) * (0.5 + this.quality * 0.5));
    for (let i = 0; i < n; i++) {
      const s = (0.18 + Math.random() * 0.5) * Math.min(2.4, size);
      const geo = new THREE.TetrahedronGeometry(s, 0);
      geo.scale(1 + Math.random(), 0.25 + Math.random() * 0.4, 1 + Math.random());
      const chunk = new THREE.Mesh(geo, m?.hull || new THREE.MeshStandardMaterial({ color: '#555' }));
      chunk.position.copy(g.position).add(V((Math.random() - 0.5) * enemy.radius, (Math.random() - 0.5) * enemy.radius * 0.5, (Math.random() - 0.5) * enemy.radius));
      this.fxRoot.add(chunk);
      const v = chunk.position.clone().sub(g.position).normalize().multiplyScalar(6 + Math.random() * 18).add(V(0, Math.random() * 3, 0));
      this.debris.push({ mesh: chunk, vel: v, spin: V(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3), life: 3 + Math.random() * 3, max: 6 });
    }
  }

  _updateWrecks(dt) {
    const ws = this.wrecks;
    if (ws?.length) {
      for (let i = ws.length - 1; i >= 0; i--) {
        const w = ws[i];
        w.life -= dt;
        w.group.position.addScaledVector(w.vel, dt);
        w.group.rotateOnAxis(w.axis, w.rate * dt);
        w.rate *= 1 + dt * 0.4;
        w.blast -= dt;
        if (w.blast <= 0) {
          // secondary blasts ripple across the hulk
          w.blast = 0.18 + Math.random() * 0.35;
          const r = (w.group.userData.radius || 3);
          const p = V((Math.random() - 0.5) * r, (Math.random() - 0.5) * r * 0.4, (Math.random() - 0.5) * r).applyMatrix4(w.group.matrixWorld);
          this._impact(p, Math.random() < 0.5 ? '#ffb066' : w.color);
          if (this._smoke) for (let k = 0; k < 3; k++) this._emit(this._smoke, p, V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4), 2 + Math.random());
        }
        if (w.life <= 0) {
          this._explosion(w.group.position.clone(), w.size, w.color);
          this.shake = Math.max(this.shake, Math.min(0.8, 4 * w.size / Math.max(30, w.group.position.distanceTo(this.player.position))));
          this.shipRoot.remove(w.group);
          disposeObject3D(w.group);
          ws.splice(i, 1);
        }
      }
    }
    const ds = this.debris;
    if (ds?.length) {
      for (let i = ds.length - 1; i >= 0; i--) {
        const c = ds[i];
        c.life -= dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
        if (c.life < 1) c.mesh.scale.setScalar(Math.max(0.001, c.life));
        if (c.life <= 0) { this.fxRoot.remove(c.mesh); c.mesh.geometry.dispose(); ds.splice(i, 1); }
      }
    }
  }

  _damagePlayer(amount, ignoreShield = false) {
    if (this.dead) return;
    const hullBefore = this.hull;
    this.lastDamage = 0;
    let dmg = amount;
    // polarised hull plating (NX) and a separated saucer (Galaxy) both soak damage
    if (!ignoreShield) {
      if (this.hullPlateTimer > 0) dmg *= 0.4;
      if (this.saucerTimer > 0) dmg *= 0.5;
      if (this.guardTimer > 0) dmg *= 0.45;
    }
    const shieldBefore = this.shield;
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
    if (this.hull <= 0) { this._destroyPlayer(); return; }
    if (this.hull < hullBefore) jolt(this.ui && $('.hud-top .vitals', this.ui));
    if (shieldBefore > this.maxShield * 0.2 && this.shield <= this.maxShield * 0.2 && !ignoreShield) {
      this._flashWarning('SHIELDS FAILING');
      audio.alert();
    }
    // hull damage can knock out a specific system somewhere on the ship
    // (heat from a star or a black hole's shear wears the hull, not systems)
    const hullHit = ignoreShield ? 0 : hullBefore - this.hull;
    if (hullHit > 0) {
      const hit = applyHit(this.game.damage, hullHit, this.maxHull);
      if (hit && hit.after < hit.before) this._onSystemHit(hit);
    }
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

  /** A system just took damage: tell the captain where, and what it costs. */
  _onSystemHit({ system, after }) {
    const S = SYSTEMS[system];
    const pct = Math.round(after * 100);
    const offline = after < BROKEN;
    this.addLog(`Hull breach — ${S.name} damaged (${S.place}) · ${pct}%${offline ? ' · OFFLINE' : ''}`, 'hostile');
    toast(`${S.name} hit! ${S.effect}${offline ? '' : ' (partly)'} — I to repair`, 'bad', 2600);
    if (offline) { this._flashWarning(`${S.name.toUpperCase()} OFFLINE`); audio.alert(); }
    this._refreshDamagePanel(true);
    this.game.scheduleSave();
  }

  /** Engineering team + any hands-on repair; announces systems coming back. */
  _tickRepairs(dt) {
    const hand = this.interior?.active ? this.interior.repairing : null;
    const { fixed, crewJob } = repairTick(this.game.damage, dt, { handSystem: hand });
    this.crewJob = crewJob;
    for (const f of fixed) {
      const [id, tag] = f.split(':');
      const S = SYSTEMS[id];
      if (tag === 'online') this.addLog(`Engineering: ${S.name} back online`, 'good');
      else {
        this.addLog(`Engineering: ${S.name} fully repaired`, 'good');
        toast(`${S.name} repaired`, 'good', 1800);
        audio.upgrade?.();
        this.game.state.stats.repairs = (this.game.state.stats.repairs || 0) + 1;
        if (id === hand) this.game.state.stats.handRepairs = (this.game.state.stats.handRepairs || 0) + 1;
        this.game.checkMissions();
      }
    }
    this._dmgPanelT = (this._dmgPanelT || 0) + dt;
    if (this._dmgPanelT > 0.3) { this._dmgPanelT = 0; this._refreshDamagePanel(); }
  }

  /* ------------------------------------------------------------ visible damage */
  /** Where each system lives on the hull, in hull-local units (nose = +Z). */
  _damageAnchor(sys) {
    const L = this.player.userData.length || 6;
    const sp = this.hullModel?.userData.saucerPart;
    const saucer = sp ? sp.position : V(0, L * 0.12, L * 0.18);
    switch (sys) {
      case 'weapons': return V(saucer.x, saucer.y + 0.15, saucer.z + L * 0.12);
      case 'shields': return V(0, 0.1, 0);
      case 'engines': return (this.player.userData.thrusters?.[0]?.pos?.clone()) || V(0, 0.4, -L * 0.3);
      case 'sensors': return V(0, -0.1, L * 0.3);
      case 'warp': return V((Math.random() < 0.5 ? -1 : 1) * L * 0.2, L * 0.15, -L * 0.25);
      case 'structure': return V(saucer.x, saucer.y - 0.25, saucer.z - L * 0.15);
      default: return V();
    }
  }

  _initDamageFx() {
    const make = (n, size, color, additive) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(-1e6), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size, map: glowTexture(color), color: new THREE.Color(color), transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.55, toneMapped: !additive,
      }));
      pts.frustumCulled = false;
      this.fxRoot.add(pts);
      return { pts, n, i: 0, vel: new Float32Array(n * 3), life: new Float32Array(n) };
    };
    this._smoke = make(320, 2.2, '#8a8f98', false);
    this._sparks = make(320, 0.55, '#ffb35a', true);
  }

  _emit(pool, pos, vel, life) {
    const k = pool.i = (pool.i + 1) % pool.n;
    const a = pool.pts.geometry.attributes.position.array;
    a[k * 3] = pos.x; a[k * 3 + 1] = pos.y; a[k * 3 + 2] = pos.z;
    pool.vel[k * 3] = vel.x; pool.vel[k * 3 + 1] = vel.y; pool.vel[k * 3 + 2] = vel.z;
    pool.life[k] = life;
  }

  _stepPool(pool, dt, drag) {
    const a = pool.pts.geometry.attributes.position.array;
    for (let k = 0; k < pool.n; k++) {
      if (pool.life[k] <= 0) continue;
      pool.life[k] -= dt;
      if (pool.life[k] <= 0) { a[k * 3 + 1] = -1e6; continue; }
      const f = Math.exp(-drag * dt);
      pool.vel[k * 3] *= f; pool.vel[k * 3 + 1] *= f; pool.vel[k * 3 + 2] *= f;
      a[k * 3] += pool.vel[k * 3] * dt; a[k * 3 + 1] += pool.vel[k * 3 + 1] * dt; a[k * 3 + 2] += pool.vel[k * 3 + 2] * dt;
    }
    pool.pts.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Show the damage: smoke and sparks venting where systems are hit, a saucer
   * knocked out of line, flickering nacelles, sputtering engines, a dim deflector.
   */
  _updateDamageVisuals(dt) {
    const hull = this.hullModel;
    if (!hull) return;
    if (!this._smoke) this._initDamageFx();
    const d = this.game.damage;
    const t = this.time;
    hull.updateMatrixWorld(true);
    for (const sys of SYSTEM_IDS) {
      const hurt = 1 - (d[sys] ?? 1);
      if (hurt < 0.02) continue;
      // venting: more and thicker the worse it is; left behind as the ship flies on
      if (Math.random() < hurt * 26 * dt) {
        const p = this._damageAnchor(sys).applyMatrix4(hull.matrixWorld);
        const out = V((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
        this._emit(this._smoke, p, out.clone().multiplyScalar(1.2), 1.6 + hurt * 1.4);
        if (Math.random() < 0.6) this._emit(this._sparks, p, out.multiplyScalar(6), 0.35 + Math.random() * 0.3);
      }
    }
    this._stepPool(this._smoke, dt, 0.6);
    this._stepPool(this._sparks, dt, 1.5);

    // the saucer: out of line and shuddering while Structural Integrity is down
    const sp = hull.userData.saucerPart;
    const rest = sp?.userData.rest;
    if (sp && rest) {
      const amt = 1 - (d.structure ?? 1);
      sp.rotation.set(
        rest.rot.x + (Math.sin(t * 6.3) * 0.05 + 0.07) * amt,
        rest.rot.y + Math.sin(t * 4.1) * 0.03 * amt,
        rest.rot.z + (Math.sin(t * 7.7) * 0.07 + 0.12) * amt,
      );
      sp.position.set(rest.pos.x + 0.08 * amt, rest.pos.y + (Math.sin(t * 9) * 0.04 - 0.06) * amt, rest.pos.z);
    }

    // nacelles flicker with a damaged warp core; engines sputter; deflector dims
    const mats = hull.userData.materials;
    if (mats?.glow) {
      this._glowBase ||= mats.glow.color.clone();
      const w = d.warp ?? 1;
      const f = w >= 0.999 ? 1 : (w < BROKEN ? (Math.random() < 0.25 ? 0.12 : 0.5) : 0.75 + Math.sin(t * 23) * 0.2);
      mats.glow.color.copy(this._glowBase).multiplyScalar(f);
    }
    if (mats?.deflector) {
      this._deflBase ??= mats.deflector.emissiveIntensity;
      mats.deflector.emissiveIntensity = this._deflBase * (0.2 + 0.8 * (d.sensors ?? 1));
    }
    const eng = d.engines ?? 1;
    if (eng < 0.999 && this.engineSprites) {
      for (const s of this.engineSprites) if (Math.random() < (1 - eng) * 0.5) s.material.opacity *= 0.2;
    }
  }

  _refreshDamagePanel(force = false) {
    const box = this.ui && $('#damage-panel', this.ui);
    if (!box) return;
    const d = this.game.damage;
    const hurt = SYSTEM_IDS.filter((k) => d[k] < 0.999).sort((a, b) => d[a] - d[b]);
    box.hidden = !hurt.length;
    if (!hurt.length) return;
    const key = hurt.map((k) => `${k}${Math.round(d[k] * 50)}`).join('|') + (this.crewJob || '');
    if (!force && key === this._dmgKey) return;
    this._dmgKey = key;
    box.querySelector('.dp-list').innerHTML = hurt.map((k) => {
      const S = SYSTEMS[k];
      const v = d[k];
      const cls = v < BROKEN ? 'red' : 'amber';
      return `<div class="dp-row ${v < BROKEN ? 'off' : ''}">
        <div class="row between"><b>${S.name}</b><span>${Math.round(v * 100)}%${this.crewJob === k ? ' · crew' : ''}</span></div>
        <div class="bar thin ${cls}"><i style="width:${v * 100}%"></i></div>
        <small>${S.place} · ${S.effect}</small>
      </div>`;
    }).join('');
  }

  _destroyPlayer() {
    if (this.dead) return;
    this.dead = true;
    this._dropSaucerSection();
    this._explosion(this.player.position.clone(), 3.6, '#9fd8ff');
    this.player.visible = false;
    audio.stopEngine();
    this.shake = 2;
    const loss = Math.round(this.game.state.credits * 0.05);
    this.game.state.credits = Math.max(0, this.game.state.credits - loss);
    this.game.state.stats.deaths++;
    this.game.repairAll();   // the replacement hull comes out of drydock whole
    this.game.save(true);
    this.game.checkMissions();
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

  /** Drop out of the sky next to the world we just lifted off from. */
  /** The real Voyager probe model (NASA 3D Resources) inside its anomaly marker. */
  async _loadVoyager(group, sprite, ring) {
    sprite.scale.setScalar(12);
    ring.visible = false;
    const { scene } = await loadGLB('/assets/nasa/voyager.glb');
    if (!scene || !group.parent) return;
    const model = scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length();
    model.scale.setScalar(14 / size);
    model.traverse((o) => { if (o.isMesh && o.material) { o.material.metalness = 0.7; o.material.roughness = 0.35; } });
    group.add(model);
    group.userData.spin = model;
  }

  /* ------------------------------------------------------------ loot + streaks */
  _showCombo() {
    const el2 = this.ui && $('#combo', this.ui);
    if (!el2) return;
    const c = this.combo;
    const on = c && c.timer > 0 && c.count > 1;
    el2.classList.toggle('on', !!on);
    if (on) {
      el2.innerHTML = `<b>×${(1 + Math.min(c.count - 1, 6) * 0.25).toFixed(2).replace(/0$/, '')}</b><span>${c.count} kill streak</span>`;
      el2.classList.remove('pop'); void el2.offsetWidth; el2.classList.add('pop');
    }
  }

  /** Salvage crates: fly through them. Bigger kills drop more, and a rare cache sometimes. */
  _spawnLoot(pos, enemy) {
    this.loot ||= [];
    const big = enemy.kind === 'voidlord' ? 6 : enemy.kind === 'cube' ? 4 : enemy.kind === 'warbird' ? 3 : 1;
    const n = big + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const rare = Math.random() < 0.08 * big;
      const kind = rare ? 'rare' : ['credits', 'dilithium', 'research'][Math.floor(Math.random() * 3)];
      const color = { credits: '#ffb347', dilithium: '#59e0ff', research: '#b47bff', rare: '#62f2a6' }[kind];
      const g = new THREE.Group();
      const core = new THREE.Mesh(this._lootGeo ||= new THREE.OctahedronGeometry(0.9, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false }));
      g.add(core);
      g.add(glowSprite(color, rare ? 9 : 6, 0.75));
      g.position.copy(pos);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18);
      this.fxRoot.add(g);
      this.loot.push({ g, core, vel, kind, life: 45, rare });
    }
  }

  _updateLoot(dt) {
    if (!this.loot?.length) return;
    const p = this.player.position;
    for (const L of this.loot) {
      if (L.done) continue;
      L.life -= dt;
      const to = p.clone().sub(L.g.position);
      const d = to.length();
      // tractor beam: crates drift toward the ship once you are close
      if (d < 45) L.vel.addScaledVector(to.normalize(), (45 - d) * 2.2 * dt);
      L.vel.multiplyScalar(Math.exp(-0.9 * dt));
      L.g.position.addScaledVector(L.vel, dt);
      L.core.rotation.x += dt * 1.6; L.core.rotation.y += dt * 2.1;
      if (d < 6) {
        L.done = true;
        const r = L.kind === 'rare' ? { credits: 2500, dilithium: 40, research: 120, xp: 60 }
          : L.kind === 'credits' ? { credits: 350 + Math.round(Math.random() * 400) }
          : L.kind === 'dilithium' ? { dilithium: 8 + Math.round(Math.random() * 10) }
          : { research: 20 + Math.round(Math.random() * 25) };
        this.game.collectLoot(r);
        audio.ui();
        const bits = [r.credits && `+${fmtC(r.credits)}`, r.dilithium && `+${r.dilithium} D`, r.research && `+${r.research} RP`].filter(Boolean).join(' · ');
        toast(L.rare ? `Rare cache! ${bits}` : bits, 'good', 1300);
      }
      if (L.done || L.life <= 0) { this.fxRoot.remove(L.g); L.core.material.dispose(); L.done = true; }
    }
    this.loot = this.loot.filter((L) => !L.done);
  }

  /* ------------------------------------------------------------ physics */
  /** Planets and hostile hulls are solid: bounce off, and hit hard = damage. */
  _collide() {
    const pos = this.player.position;
    const shipR = Math.max(1.5, (this.player.userData.length || 6) * 0.35);
    for (const p of this.planetNodes || []) {
      const c = p.node.getWorldPosition(V());
      const hit = collideSphere(pos, this.vel, c, p.radius * 1.02, shipR, 0.3);
      if (hit > 6) this._collisionImpact(hit, `Impact with ${p.data.name}`);
    }
    for (const e of this.enemies || []) {
      if (e.dead) continue;
      const hit = collideSphere(pos, this.vel, e.group.position, (e.radius || 3) * 0.8, shipR, 0.5);
      if (hit > 4) {
        this._collisionImpact(hit * 0.6, 'Collision!');
        if (typeof e.hp === 'number') { e.hp -= hit * 0.8; if (e.hp <= 0) this._killEnemy(e); }
      }
    }
  }

  /** A collision (not a weapon hit — that is _impact(pos, color) above). */
  _collisionImpact(speed, msg) {
    if (this.time - (this._lastImpact || 0) < 0.35) return;
    this._lastImpact = this.time;
    this._damagePlayer(Math.min(60, speed * 0.55));
    this.shake = Math.max(this.shake, Math.min(1.4, speed / 40));
    if (msg) this.addLog(msg, 'hostile');
  }

  /* ------------------------------------------------------------ autopilot */
  /** Pick where the autopilot should go: target → open anomaly → nearest planet. */
  _autopilotDest() {
    if (this.target && !this.target.dead) {
      return { pos: this.target.group.position.clone(), standoff: 70, label: this.target.def?.name || 'target', kind: 'target' };
    }
    const here = this.player.position;
    let best = null;
    for (const a of this.anomalyNodes || []) {
      if (a.scanned) continue;
      const p = (a.node || a.group).getWorldPosition(V());
      const d = p.distanceTo(here);
      if (!best || d < best.d) best = { d, pos: p, standoff: 24, label: a.data.name, kind: 'anomaly' };
    }
    if (best) return best;
    for (const p of this.planetNodes || []) {
      const c = p.node.getWorldPosition(V());
      const d = c.distanceTo(here);
      if (!best || d < best.d) best = { d, pos: c, standoff: p.radius * 1.9 + 20, label: p.data.name, kind: 'planet', live: p };
    }
    return best;
  }

  _toggleAutopilot(on = !this.autopilot, why = '') {
    const btn = this.ui && $('#auto-btn', this.ui);
    if (!on) {
      if (this.autopilot) toast(why ? `Autopilot off — ${why}` : 'Autopilot off', 'warn', 1400);
      this.autopilot = null;
      btn?.classList.remove('on');
      return;
    }
    const d = this._autopilotDest();
    if (!d) { toast('Autopilot: nothing to fly to', 'warn', 1600); return; }
    this.autopilot = { kind: d.kind, label: d.label };
    btn?.classList.add('on');
    this.addLog(`Autopilot engaged — course laid in for ${d.label}`, 'good');
    toast(`Autopilot → ${d.label}`, 'good', 1800);
    audio.ui();
  }

  _autopilotStep() {
    const d = this._autopilotDest();
    if (!d) { this._toggleAutopilot(false, 'no destination'); return null; }
    if (d.label !== this.autopilot.label) this.autopilot = { kind: d.kind, label: d.label };
    const out = autopilotControls(this.player.position, this.player.quaternion, this.vel, d.pos, d.standoff, this.stats.speed);
    if (out.arrived && d.kind !== 'target') {
      this._toggleAutopilot(false, `arrived at ${d.label}`);
      if (d.kind === 'planet') this.addLog('In orbit. Press L to land.', 'good');
      if (d.kind === 'anomaly') this.addLog('On station. Press R to scan.', 'good');
    }
    return out;
  }

  _spawnNear(planetId) {
    const entry = this.planetNodes?.find((n) => n.data.id === planetId);
    if (!entry || !this.player) return;
    const centre = entry.node.getWorldPosition(V());
    // park above the world (moons orbit around its middle, so up is always clear)
    // and a little sunward-out, looking down at what you just left
    const out = V(centre.x, 0, centre.z).normalize();
    const at = centre.clone()
      .add(V(0, entry.radius + 46, 0))
      .add(out.multiplyScalar(entry.radius * 0.6 + 12));
    this.player.position.copy(at);
    this.player.lookAt(centre.x, centre.y, centre.z); // nose +Z, so we face the planet
    this.speed = 0;
    this.vel.set(0, 0, 0);
    this.throttle = isTouchScheme() ? 0.4 : 0;
  }

  /** The nearest planet with a surface, within landing range. */
  _nearestLandable() {
    const p = this.player.position;
    let best = null;
    let bestD = Infinity;
    let bestCentre = Infinity;
    for (const node of this.planetNodes) {
      if (!this.game.constructor.canLand(node.data)) continue;
      const centre = node.node.getWorldPosition(V()).distanceTo(p);
      // closest SURFACE wins: hovering over a big planet beats its little moon's centre
      const d = centre - (node.radius || 0);
      if (d < bestD) { bestD = d; bestCentre = centre; best = node.data; }
    }
    return best ? { data: best, dist: Math.max(0, bestD), inRange: bestCentre <= 210 } : null;
  }

  _updateLandPrompt() {
    const btn = $('#land-btn', this.ui);
    if (!btn) return;
    const near = this._nearestLandable();
    btn.classList.toggle('ready', !!(near && near.inRange));
    btn.classList.toggle('dim', !(near && near.inRange));
    btn.title = near
      ? (near.inRange
        ? `Set down on ${near.data.name} (L)`
        : `${near.data.name} is ${Math.round(near.dist)} m away — fly closer to land`)
      : 'No planet in range';
  }

  /** Set the away team down on the closest planet. */
  _landAtNearest() {
    const near = this._nearestLandable();
    if (!near || !near.inRange) {
      toast('No planet close enough to land on — fly toward a world', 'warn');
      audio.error();
      return;
    }
    const planet = near.data;
    audio.ui();
    this.addLog(`Landing on ${planet.name}`, 'good');
    toast(`Descending to ${planet.name}…`, 'good', 2200);
    this.app.setScene('planet', { planetId: planet.id });
  }

  _updateScanPrompt() {
    const btn = $('#scan-btn', this.ui);
    if (!btn) return;
    const near = this._nearestScannable();
    this.scanTarget = near;
    btn.classList.toggle('ready', !!(near && near.inRange));
    btn.disabled = !(near && near.inRange) || this.scanCd > 0;
    const label = btn.querySelector('.lbl');
    if (label) label.textContent = (near && near.inRange) ? (near.kind === 'planet' ? 'SURVEY' : 'ANALYSE') : 'SCAN';
  }

  _scanAction() {
    if (this.scanCd > 0) return;
    if (!damageEffects(this.game.damage).sensors) {
      toast('Sensor Array offline — repair it (I: go below decks)', 'warn');
      audio.error();
      return;
    }
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
      footer: `${this.game.constructor.canLand({ type: p.type })
        ? `<button class="btn ghost" data-land>Land on the surface</button>`
        : '<span class="tiny faint" style="align-self:center">Gas giant — orbit only</span>'}
        <button class="btn primary" data-close2>Log survey</button>`,
    });
    m.el.querySelector('[data-close2]').onclick = () => m.close();
    const landBtn = m.el.querySelector('[data-land]');
    if (landBtn) {
      landBtn.onclick = () => {
        m.close();
        this.app.setScene('planet', { planetId: p.id });
      };
    }
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
      this._enemyLooks(e, dt);
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
      if (!e.cloaked && this.bluffTimer <= 0 && e.fireCd <= 0 && dist < 520) {
        const angle = forward.dot(dir);
        if (angle > 0.72) {
          e.fireCd = Math.max(0.5, 1.6 / (e.def.fireRate || 1)) * (0.7 + Math.random() * 0.6);
          const muzzle = pos.clone().addScaledVector(forward, e.radius * 0.8);
          const lead = playerPos.clone().addScaledVector(this.vel, 0.4);
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
        // point-defence window shreds incoming bolts before they reach the hull
        if (this.pointDefenseTimer > 0) {
          this._impact(p.mesh.position.clone(), '#8fd6ff');
          this._removeProjectile(p);
          this.projectiles.splice(i, 1);
          continue;
        }
        if (p.mesh.position.distanceTo(this.player.position) < 5.5) {
          if (this.evadeTimer > 0 && Math.random() < 0.7) {
            // Saber's Evasive Pattern: the bolt passes through where the hull was
            this._impact(p.mesh.position.clone(), '#a7f0ff');
          } else {
            this._damagePlayer(p.damage);
            if (p.vel) hitArrow(this._fxLayer, this.camera, this.player.position.clone().addScaledVector(p.vel, -1));
            this._impact(p.mesh.position.clone(), '#ff8a6d');
          }
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
      if (p.globe) {
        // aim the real Earth's day side at this system's star (at the origin)
        p.node.getWorldPosition(p.globe.sunDir).negate().normalize();
        p.globe.update(dt, this.time);
        continue;
      }
      p.planet.rotation.y += dt * 0.05;
      const atmo = p.planet.userData.atmo;
      if (atmo) p.node.getWorldPosition(atmo.material.uniforms.uSunDir.value).negate().normalize();
      if (p.planet.userData.clouds) p.planet.userData.clouds.rotation.y += dt * 0.07;
      p.planet.getWorldPosition(new THREE.Vector3());
    }
    for (const a of this.anomalyNodes) {
      if (a.scanned) continue;
      a.ring.rotation.z += dt * 0.5;
      const sp = a.group.userData.spin;
      if (sp) { sp.rotation.y += dt * 0.06; sp.rotation.x += dt * 0.017; }
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
      const lbl = ab.querySelector('.lbl');
      const key = (this.game.shipClass.ability.name || 'Ability').split(' ')[0].toUpperCase();
      if (lbl) lbl.textContent = ready ? key : `${Math.ceil(this.abilityCd)}s`;
    }
    const set = Math.round((this.boosting ? 1 : this.throttle) * 100);
    const tf = $('#throttle-fill', this.ui);
    if (tf) tf.style.height = `${set}%`;
    const knob = $('#ts-knob', this.ui);
    if (knob) knob.style.bottom = `${set}%`;
    // where the ship really is: momentum takes a moment to catch up with the lever
    const top = Math.max(1, this.stats.speed * (this.boosting ? 2 : 1));
    const actual = $('#throttle-actual', this.ui);
    if (actual) actual.style.bottom = `${Math.min(100, Math.round((this.speed / top) * 100))}%`;
    const tsSet = $('#ts-set', this.ui); if (tsSet) tsSet.textContent = `${set}%`;
    const tsSpd = $('#ts-speed', this.ui); if (tsSpd) tsSpd.textContent = `${Math.round(this.speed)} u/s`;
    const strip = $('#throttle-ui', this.ui); if (strip) strip.setAttribute('aria-valuenow', String(set));
    const tr = $('#thr-read', this.ui);
    if (tr) tr.textContent = `${Math.round((this.boosting ? 1 : this.throttle) * 100)}%`;
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
      // moons only label themselves when you are nearby, so planets stay readable
      if (dist > (l.moon ? 300 : 1000)) { l.el.style.display = 'none'; continue; }
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
    if (this.interior?.active) { this._updateInterior(capped); return; }
    if (!this.dead) {
      this._handleInput(capped);
      // input can leave the scene (land, warp, below decks): stop this frame there
      if (!this.player || this.app.current !== this || this.interior?.active) return;
      this._updateEnemies(capped);
      this._updateWrecks(capped);
      if (!this._redAlerted) {
        const close = this.enemies.some((e) => !e.dead && e.group.position.distanceTo(this.player.position) < 700);
        if (close) {
          this._redAlerted = true;
          redAlert(this._fxLayer);
          audio.alert();
          this.addLog('Red alert — hostile closing. Shields up.', 'hostile');
        }
      }
      this._updateProjectiles(capped);
      this._updateClones(capped);
      this._updateSaucerSection(capped);
      this._updateLoot(capped);
      this._tickRepairs(capped);
      this._updateDamageVisuals(capped);
      if (this.combo?.timer > 0) {
        this.combo.timer -= capped;
        if (this.combo.timer <= 0) this._showCombo();
      }
      this.lastDamage += capped;
      if (this.lastDamage > 3.5 && this.shield < this.maxShield) {
        this.shield = Math.min(this.maxShield, this.shield + this.stats.regen * damageEffects(this.game.damage).regen * capped);
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
    this.interior?.resize(w, h);
  }
}
