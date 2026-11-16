/**
 * Below decks — walk around inside your own ship.
 *
 * A compact starship interior: the bridge forward, a long corridor, four
 * system rooms off it, and main engineering aft with the warp core. Damaged
 * systems spark and flash red at their station; walk up and hold E (or the
 * REPAIR button) to fix one by hand. Two engineers walk to whatever the crew
 * is working on. The turbolift on the bridge (or I / Esc) goes back to flight.
 *
 * This is a mode of the flight scene rather than a scene of its own, so the
 * battle outside is paused exactly as you left it.
 *
 * Coordinates are metres. Forward (the bridge) is +Z, starboard is +X.
 */
import * as THREE from 'three';
import { SYSTEMS, BROKEN } from '../core/damage.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { canvas as makeCanvas, glowTexture } from '../art/textures.js';

/**
 * Wall panelling and deck plating, drawn once. 1 texture repeat = 2 m.
 * Returns colour + bump maps so the seams catch the light.
 */
function surfaceTextures(kind) {
  const c = makeCanvas(256, 256), b = makeCanvas(256, 256);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  let seed = kind === 'wall' ? 11 : 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, 256, 256);
  if (kind === 'wall') {
    // tall beige panels with dark seams and a darker waist band
    g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2; i++) {
      const x = i * 128;
      const grad = g.createLinearGradient(x, 0, x + 128, 0);
      grad.addColorStop(0, '#cfc7b9'); grad.addColorStop(0.5, '#ddd6ca'); grad.addColorStop(1, '#c9c1b2');
      g.fillStyle = grad; g.fillRect(x + 3, 0, 122, 256);
      g.fillStyle = '#7d7466'; g.fillRect(x, 0, 3, 256);
      gb.fillStyle = '#303030'; gb.fillRect(x, 0, 3, 256);
    }
    g.fillStyle = '#8f8576'; g.fillRect(0, 170, 256, 14);
    gb.fillStyle = '#a0a0a0'; gb.fillRect(0, 170, 256, 14);
    g.fillStyle = '#6d6457'; g.fillRect(0, 168, 256, 2); g.fillRect(0, 184, 256, 2);
  } else {
    // deck plating: brushed grey-blue squares with seams and wear
    g.fillStyle = '#2f3644'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = `hsl(220, 14%, ${20 + rnd() * 5}%)`;
      g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`;
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 6, 1);
    }
    g.fillStyle = '#151922';
    g.fillRect(0, 0, 256, 2); g.fillRect(0, 128, 256, 2); g.fillRect(0, 0, 2, 256); g.fillRect(128, 0, 2, 256);
    gb.fillStyle = '#202020';
    gb.fillRect(0, 0, 256, 2); gb.fillRect(0, 128, 256, 2); gb.fillRect(0, 0, 2, 256); gb.fillRect(128, 0, 2, 256);
    // little anti-slip studs
    gb.fillStyle = '#b0b0b0';
    for (let y = 16; y < 256; y += 32) for (let x = 16; x < 256; x += 32) gb.fillRect(x, y, 3, 3);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(b);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map, bump };
}

/** Scale a geometry's UVs so its texture repeats every `unit` metres. */
function metreUVs(geo, w, h, unit = 2) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / unit, uv.getY(i) * h / unit);
  return geo;
}

const EYE = 1.65;
const RED = new THREE.Color(0xff2a1a);
const RED_STRIP = new THREE.Color('#ff3b30').multiplyScalar(1.3);
const damp1 = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const RADIUS = 0.35;
const WALK = 3.2;
const RUN = 5.6;

/** Walkable areas (before the body-radius margin), plus door connectors. */
export const LAYOUT = {
  corridor: { x0: -1.5, x1: 1.5, z0: -20, z1: 18, name: 'Main Corridor · Deck 5' },
  rooms: [
    { id: 'bridge', name: 'Bridge', x0: -6, x1: 6, z0: 18, z1: 28 },
    { id: 'sensors', name: 'Sensor Array · Deck 2', x0: 1.5, x1: 7.5, z0: 9, z1: 15 },
    { id: 'phasers', name: 'Phaser Bay · Deck 4', x0: -7.5, x1: -1.5, z0: 9, z1: 15 },
    { id: 'shields', name: 'Shield Generator · Deck 6', x0: -7.5, x1: -1.5, z0: -3, z1: 3 },
    { id: 'engines', name: 'Impulse Engines · Deck 9', x0: 1.5, x1: 7.5, z0: -12, z1: -6 },
    { id: 'engineering', name: 'Main Engineering', x0: -7, x1: 7, z0: -32, z1: -20 },
  ],
};
// one door per room, on the side that touches the corridor
const DOORS = {
  bridge: { axis: 'z', at: 18, c: 0 },
  sensors: { axis: 'x', at: 1.5, c: 12 },
  phasers: { axis: 'x', at: -1.5, c: 12 },
  shields: { axis: 'x', at: -1.5, c: 0 },
  engines: { axis: 'x', at: 1.5, c: -9 },
  engineering: { axis: 'z', at: -20, c: 0 },
};
const DOOR_W = 1.8;
const ROOM_FOR = { weapons: 'phasers', shields: 'shields', engines: 'engines', sensors: 'sensors', warp: 'engineering', structure: 'bridge' };

/** Is this floor point inside the ship (keeping the body radius off the walls)? */
export function walkable(x, z, r = RADIUS) {
  const inside = (a) => x > a.x0 + r && x < a.x1 - r && z > a.z0 + r && z < a.z1 - r;
  if (inside(LAYOUT.corridor)) return true;
  for (const room of LAYOUT.rooms) {
    if (inside(room)) return true;
    const d = DOORS[room.id];
    const half = DOOR_W / 2 - r;
    // the doorway itself: a short channel straddling the shared wall
    if (d.axis === 'x' && Math.abs(z - d.c) < half && Math.abs(x - d.at) < 1) return true;
    if (d.axis === 'z' && Math.abs(x - d.c) < half && Math.abs(z - d.at) < 1) return true;
  }
  return false;
}

export function roomAt(x, z) {
  for (const room of LAYOUT.rooms) if (x > room.x0 && x < room.x1 && z > room.z0 && z < room.z1) return room;
  return LAYOUT.corridor;
}

/* ------------------------------------------------------------------ art */
function lcarsTexture(seed = 1) {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#05070c'; g.fillRect(0, 0, 256, 128);
  const cols = ['#ff9c3a', '#cc99cc', '#9999ff', '#ffcc66', '#6688cc', '#cc6666'];
  let r = seed * 9301;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = cols[0]; g.beginPath(); g.roundRect(6, 6, 46, 116, 14); g.fill();
  for (let y = 8; y < 120; y += 14) {
    const w = 30 + rnd() * 150;
    g.fillStyle = cols[1 + Math.floor(rnd() * 5)];
    g.beginPath(); g.roundRect(60, y, w, 9, 4.5); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 40; i++) g.fillRect(70 + rnd() * 170, 8 + rnd() * 112, 2 + rnd() * 6, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ShipInterior {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.active = false;
    this.repairing = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05070c');
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    this.yaw = Math.PI;        // looking forward (+Z): yaw 0 faces -Z in our convention
    this.pitch = 0;
    this.pos = new THREE.Vector3(0, 0, 21);
    this.stations = {};
    this.crew = [];
    this._build();
  }

  /* ---------------------------------------------------------------- build */
  _build() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f38, 0.9));
    const wt = surfaceTextures('wall'), ft = surfaceTextures('floor');
    // (no bump maps: on some GPUs their derivatives go NaN on edge-on floors and bloom spreads it over the screen)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xece7de, map: wt.map, roughnessMap: wt.bump, roughness: 0.75, metalness: 0.05 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.42, metalness: 0.35 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ft.map, roughnessMap: ft.bump, roughness: 0.8, metalness: 0.35 });
    // ceilings face down, away from the sky light: give them a little glow so they aren't black
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.8, emissive: 0x3b3833 });
    const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4e0').multiplyScalar(1.4), toneMapped: false });
    this._mats = { wallMat, trimMat, floorMat, ceilMat, lightMat };
    this._lamps = [];
    this._stripBase = lightMat.color.clone();
    const H = 3;
    const areas = [LAYOUT.corridor, ...LAYOUT.rooms];

    for (const a of areas) {
      const w = a.x1 - a.x0, d = a.z1 - a.z0, cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
      const h = a.id === 'engineering' ? 6 : a.id === 'bridge' ? 3.6 : H;
      const floor = new THREE.Mesh(metreUVs(new THREE.PlaneGeometry(w, d), w, d), floorMat);
      floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); s.add(floor);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
      ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, h, cz); s.add(ceil);
      // recessed light strips
      const strips = a === LAYOUT.corridor ? [[0, d * 0.95, 0.35]] : [[-w * 0.3, d * 0.7, 0.25], [w * 0.3, d * 0.7, 0.25]];
      for (const [ox, len, wid] of strips) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(a === LAYOUT.corridor ? wid : wid, len), lightMat);
        l.rotation.x = Math.PI / 2; l.position.set(cx + ox, h - 0.01, cz); s.add(l);
      }
      // warm ceiling light per room (two along the corridor)
      const lamps = a === LAYOUT.corridor ? [cz - d * 0.25, cz + d * 0.25] : [cz];
      for (const lz of lamps) {
        const pl = new THREE.PointLight(a.id === 'engineering' ? 0x9fd8ff : 0xffe6c4, a === LAYOUT.corridor ? 9 : 12, Math.max(w, d) * 1.3, 1.6);
        pl.position.set(cx, h - 0.4, lz);
        s.add(pl);
        this._lamps.push({ light: pl, base: pl.color.clone(), power: pl.intensity });
      }
      // walls with door gaps
      const doorsHere = this._doorsOn(a);
      this._wall(a.x0, a.z0, a.x1, a.z0, h, doorsHere);   // aft
      this._wall(a.x0, a.z1, a.x1, a.z1, h, doorsHere);   // fore
      this._wall(a.x0, a.z0, a.x0, a.z1, h, doorsHere);   // port
      this._wall(a.x1, a.z0, a.x1, a.z1, h, doorsHere);   // starboard
    }
    // corridor detail: handrail glow line and wall panels
    const rail = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fb8ff').multiplyScalar(0.9), toneMapped: false });
    for (const sx of [-1.48, 1.48]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 37), rail);
      r.position.set(sx, 0.95, -1); s.add(r);
    }
    for (let z = -17; z < 17; z += 4.5) {
      for (const sx of [-1.47, 1.47]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: lcarsTexture(Math.abs(z * 7 + sx * 3)), toneMapped: false }));
        p.position.set(sx, 1.55, z); p.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; s.add(p);
      }
    }

    for (const room of LAYOUT.rooms) {
      if (room.id === 'bridge' || room.id === 'engineering') continue;
      const cz = (room.z0 + room.z1) / 2, cx = (room.x0 + room.x1) / 2;
      for (const wz of [room.z0 + 0.07, room.z1 - 0.07]) {
        const pnl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshBasicMaterial({ map: lcarsTexture(Math.abs(cx * 3 + wz)), toneMapped: false }));
        pnl.position.set(cx, 1.6, wz); pnl.rotation.y = wz < cz ? 0 : Math.PI; s.add(pnl);
      }
    }
    this._buildBridge();
    this._buildWarpCore();
    // a console per system, against the far wall of its room
    for (const [sys, roomId] of Object.entries(ROOM_FOR)) {
      const room = LAYOUT.rooms.find((r) => r.id === roomId);
      this._station(sys, room);
    }
    this._buildCrew();
  }

  _doorsOn(area) {
    const out = [];
    for (const room of LAYOUT.rooms) {
      const d = DOORS[room.id];
      if (area === room || area === LAYOUT.corridor) out.push(d);
    }
    return out;
  }

  /** A straight wall from (x0,z0) to (x1,z1), leaving gaps where doors are. */
  _wall(x0, z0, x1, z1, h, doors) {
    const alongX = z0 === z1;
    const a = alongX ? x0 : z0, b = alongX ? x1 : z1, fixed = alongX ? z0 : x0;
    const gaps = doors.filter((d) => (alongX ? d.axis === 'z' : d.axis === 'x') && Math.abs(d.at - fixed) < 0.01)
      .map((d) => [d.c - DOOR_W / 2, d.c + DOOR_W / 2]).filter(([g0, g1]) => g1 > a && g0 < b).sort((p, q) => p[0] - q[0]);
    let cur = a;
    const seg = (s0, s1) => {
      if (s1 - s0 < 0.01) return;
      const len = s1 - s0, mid = (s0 + s1) / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.12, h, alongX ? 0.12 : len), this._mats.wallMat);
      // wall panels: repeat every 2 m along the wall and keep their height
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 2, uv.getY(i) * h / 3);
      m.position.set(alongX ? mid : fixed, h / 2, alongX ? fixed : mid);
      this.scene.add(m);
      const base = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.16, 0.18, alongX ? 0.16 : len), this._mats.trimMat);
      base.position.set(alongX ? mid : fixed, 0.09, alongX ? fixed : mid);
      this.scene.add(base);
    };
    for (const [g0, g1] of gaps) { seg(cur, Math.max(cur, g0)); cur = Math.max(cur, g1); }
    seg(cur, b);
  }

  _buildBridge() {
    const s = this.scene;
    // viewscreen showing space
    const stars = makeCanvas(512, 256);
    const g = stars.getContext('2d');
    g.fillStyle = '#01030a'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * 512, Math.random() * 256, 1.5, 1.5); }
    const tex = new THREE.CanvasTexture(stars); tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.set(0, 2, 27.92); screen.rotation.y = Math.PI; s.add(screen);
    this.viewscreen = { tex, g, canvas: stars };
    // captain's chair and the two forward stations
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x6b2a2a, roughness: 0.7 }));
    chair.position.set(0, 0.55, 22.5); s.add(chair);
    for (const sx of [-1.6, 1.6]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.7), this._mats.trimMat);
      c.position.set(sx, 0.45, 25); s.add(c);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.6), new THREE.MeshBasicMaterial({ map: lcarsTexture(sx > 0 ? 3 : 5), toneMapped: false }));
      top.rotation.x = -Math.PI / 2.6; top.position.set(sx, 0.92, 25); s.add(top);
    }
    // turbolift: walk in and press E to return to the viewscreen
    const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 24, 1, true, Math.PI * 0.2, Math.PI * 1.6),
      new THREE.MeshStandardMaterial({ color: 0x8a7a66, side: THREE.DoubleSide, roughness: 0.6 }));
    lift.position.set(-5, 1.7, 26.9); lift.rotation.y = Math.PI; s.add(lift);
    const liftGlow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf7a'), toneMapped: false }));
    liftGlow.rotation.x = -Math.PI / 2; liftGlow.position.set(-5, 0.02, 26.9); s.add(liftGlow);
    this.turbolift = new THREE.Vector3(-5, 0, 26.6);
  }

  _buildWarpCore() {
    const s = this.scene;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#59c8ff'), toneMapped: false, transparent: true, opacity: 0.9 });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 32, 1, true), mat);
    core.position.set(0, 3, -26); s.add(core);
    const rings = [];
    for (let i = 0; i < 7; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.09, 8, 32), this._mats.trimMat);
      r.rotation.x = Math.PI / 2; r.position.set(0, 0.5 + i * 0.85, -26); s.add(r); rings.push(r);
    }
    const light = new THREE.PointLight(0x59c8ff, 6, 14, 1.6);
    light.position.set(0, 2.5, -26); s.add(light);
    // railing around the core
    const rail = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.05, 6, 48), new THREE.MeshStandardMaterial({ color: 0x9a8f7f }));
    rail.rotation.x = Math.PI / 2; rail.position.set(0, 1, -26); s.add(rail);
    this.warpCore = { mat, light, rings };
  }

  _station(sys, room) {
    // station on the wall furthest from the door
    const d = DOORS[room.id];
    let x, z, rotY;
    if (room.id === 'engineering') { x = 3.8; z = -24; rotY = -Math.PI / 2; }
    else if (d.axis === 'x') { x = d.at > 0 ? room.x1 - 0.55 : room.x0 + 0.55; z = (room.z0 + room.z1) / 2; rotY = d.at > 0 ? -Math.PI / 2 : Math.PI / 2; }
    else { x = 0; z = room.z1 - 0.55; rotY = Math.PI; }
    const grp = new THREE.Group();
    grp.position.set(x, 0, z); grp.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.6), this._mats.trimMat);
    body.position.y = 0.5; grp.add(body);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshBasicMaterial({ map: lcarsTexture(sys.length * 13), toneMapped: false }));
    // the display faces the person standing at the console (local +Z)
    panel.position.set(0, 1.55, -0.29); grp.add(panel);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: lcarsTexture(sys.length * 7 + 2), toneMapped: false }));
    top.rotation.x = -Math.PI / 2.8; top.position.set(0, 1.02, 0.05); grp.add(top);
    const alarm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30').multiplyScalar(2), toneMapped: false }));
    alarm.position.set(0, 2.35, -0.2); grp.add(alarm);
    const glow = new THREE.PointLight(0xff3b30, 0, 6, 2);
    glow.position.set(0, 2, 0.6); grp.add(glow);
    // sparks (a small burst that keeps re-spawning while broken)
    const n = 40;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc070, size: 0.045, map: glowTexture('#ffc070'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sparks.frustumCulled = false;
    grp.add(sparks);
    const vel = new Float32Array(n * 3), life = new Float32Array(n);
    this.scene.add(grp);
    // where you stand to repair it, in world space
    const stand = new THREE.Vector3(0, 0, 1.7).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(grp.position);
    this.stations[sys] = { sys, room, grp, alarm, glow, sparks, vel, life, stand };
  }

  _buildCrew() {
    const uniform = [0xc9a227, 0xc9a227];   // operations gold — they are engineers
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 10), new THREE.MeshStandardMaterial({ color: uniform[i], roughness: 0.7 }));
      body.position.y = 0.85; g.add(body);
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1a1d24 }));
      legs.position.y = 0.42; g.add(legs);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), new THREE.MeshStandardMaterial({ color: i ? 0x8d5a3b : 0xe0b48f, roughness: 0.8 }));
      head.position.y = 1.62; g.add(head);
      g.position.set(i ? 2 : -2, 0, -24);
      this.scene.add(g);
      this.crew.push({ g, path: [], phase: i * 1.7 });
    }
  }

  /* ---------------------------------------------------------------- mode */
  enter() {
    this.active = true;
    // soft reflections from the room itself, so metal and glass read as metal and glass
    const r = this.app?.viewport?.renderer;
    if (!this._envRT && r?.getRenderTarget) {
      try {
        const pmrem = new THREE.PMREMGenerator(r);
        this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
        pmrem.dispose();
        this.scene.environment = this._envRT.texture;
        this.scene.environmentIntensity = 0.22;
      } catch (e) { console.warn('[interior] environment failed', e); }
    }
    this.pos.set(-4.4, 0, 25.4);
    this.yaw = -0.35; this.pitch = 0;   // facing aft, toward the corridor
    this._bindLook();
  }

  exit() {
    this.active = false;
    this.repairing = null;
    this._unbindLook?.();
  }

  resize(w, h) { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }

  /** Drag to look: mouse anywhere, touch on the right half (left half walks). */
  _bindLook() {
    const c = this.app.canvas;
    let last = null;
    const down = (e) => {
      if (e.target !== c) return;
      if (e.pointerType !== 'mouse') {
        const r = c.getBoundingClientRect();
        if (e.clientX - r.left < r.width * 0.5) return;   // left half = walk stick
        e.stopPropagation();
      }
      last = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e) => {
      if (!last || e.pointerId !== last.id) return;
      this.yaw -= (e.clientX - last.x) * 0.005;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - (e.clientY - last.y) * 0.004));
      last.x = e.clientX; last.y = e.clientY;
    };
    const up = (e) => { if (last && e.pointerId === last.id) last = null; };
    c.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this._unbindLook = () => {
      c.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  /* ---------------------------------------------------------------- tick */
  /**
   * @returns {{room:object, near:object|null, atLift:boolean}}
   */
  update(dt, t, input, crewJob) {
    // --- walking: W/S + A/D (or the touch stick / thrust pads); arrows turn
    const k = input.keys;
    let fwd = 0, side = 0;
    if (k.has('w')) fwd += 1;
    if (k.has('s')) fwd -= 1;
    if (k.has('a')) side -= 1;
    if (k.has('d')) side += 1;
    if (input.actions.thrust) fwd += 1;
    if (input.actions.reverse) fwd -= 1;
    if (input.stick?.active) { fwd += input.stick.y; side += input.stick.x; }
    if (k.has('arrowleft')) this.yaw += dt * 2.2;
    if (k.has('arrowright')) this.yaw -= dt * 2.2;
    if (k.has('arrowup')) this.pitch = Math.min(1.1, this.pitch + dt * 1.4);
    if (k.has('arrowdown')) this.pitch = Math.max(-1.1, this.pitch - dt * 1.4);
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }
    const speed = (k.has('shift') ? RUN : WALK) * dt;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const nx = this.pos.x + (fx * fwd + rx * side) * speed;
    const nz = this.pos.z + (fz * fwd + rz * side) * speed;
    // slide along walls: try both axes, then each alone
    if (walkable(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (walkable(nx, this.pos.z)) this.pos.x = nx;
    else if (walkable(this.pos.x, nz)) this.pos.z = nz;
    const bob = len > 0.1 ? Math.sin(t * (k.has('shift') ? 13 : 9)) * 0.035 : 0;
    this.camera.position.set(this.pos.x, EYE + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // --- the ship around you
    const dmg = this.game.damage;
    const pulse = 0.75 + Math.sin(t * 5) * 0.25;
    const warpOk = dmg.warp >= BROKEN;
    this.warpCore.mat.color.set(warpOk ? '#59c8ff' : '#ff5a3a').multiplyScalar(warpOk ? 0.8 + pulse * 0.6 : (Math.sin(t * 17) > 0 ? 1.4 : 0.35));
    this.warpCore.light.color.set(warpOk ? 0x59c8ff : 0xff5a3a);
    this.warpCore.light.intensity = warpOk ? 4 + pulse * 3 : 2 + (Math.sin(t * 17) > 0 ? 4 : 0);
    // red alert: while a system is knocked out, the lights pulse red
    const alert = Object.values(this.stations).some((st) => dmg[st.sys] < BROKEN);
    const ra = alert ? 0.55 + Math.sin(t * 3.2) * 0.45 : 0;
    this._alert = damp1(this._alert || 0, ra, 6, dt);
    const a = this._alert;
    for (const L of this._lamps) {
      L.light.color.copy(L.base).lerp(RED, a * 0.85);
      L.light.intensity = L.power * (1 - a * 0.35);
    }
    this._mats.lightMat.color.copy(this._stripBase).lerp(RED_STRIP, a * 0.8);
    let near = null;
    for (const st of Object.values(this.stations)) {
      const v = dmg[st.sys];
      const broken = v < 0.999;
      st.alarm.visible = broken && Math.sin(t * 8) > 0;
      st.glow.intensity = broken ? (Math.sin(t * 8) > 0 ? 3 : 0.4) * (1 - v) : 0;
      this._sparks(st, dt, broken ? (1 - v) : 0);
      const dist = Math.hypot(this.pos.x - st.stand.x, this.pos.z - st.stand.z);
      if (dist < 1.8 && (!near || dist < near.dist)) near = { ...st, dist, integrity: v };
    }
    // the crew heads for the job engineering is on
    this._moveCrew(dt, t, crewJob);
    // hands-on repair: hold E or the REPAIR button while at a damaged station
    const holding = k.has('e') || input.actions.repair;
    this.repairing = near && near.integrity < 0.999 && holding ? near.sys : null;
    const atLift = Math.hypot(this.pos.x - this.turbolift.x, this.pos.z - this.turbolift.z) < 1.1;
    return { room: roomAt(this.pos.x, this.pos.z), near, atLift };
  }

  _sparks(st, dt, amount) {
    const pos = st.sparks.geometry.attributes.position;
    const a = pos.array;
    for (let i = 0; i < st.life.length; i++) {
      st.life[i] -= dt;
      if (st.life[i] <= 0) {
        if (Math.random() < amount * 0.35) {
          st.life[i] = 0.4 + Math.random() * 0.5;
          a[i * 3] = (Math.random() - 0.5) * 0.6; a[i * 3 + 1] = 1.1; a[i * 3 + 2] = 0.1;
          st.vel[i * 3] = (Math.random() - 0.5) * 2; st.vel[i * 3 + 1] = 1 + Math.random() * 2; st.vel[i * 3 + 2] = 0.5 + Math.random() * 1.5;
        } else { a[i * 3 + 1] = -10; continue; }
      }
      st.vel[i * 3 + 1] -= 9.8 * dt;
      a[i * 3] += st.vel[i * 3] * dt; a[i * 3 + 1] += st.vel[i * 3 + 1] * dt; a[i * 3 + 2] += st.vel[i * 3 + 2] * dt;
      if (a[i * 3 + 1] < 0) { a[i * 3 + 1] = 0; st.vel[i * 3 + 1] *= -0.3; }
    }
    pos.needsUpdate = true;
  }

  _moveCrew(dt, t, job) {
    const target = job ? this.stations[job]?.stand : new THREE.Vector3(0, 0, -23.5);
    this.crew.forEach((c, i) => {
      const goal = target.clone().add(new THREE.Vector3(i ? 0.7 : -0.7, 0, 0));
      if (!c.goal || c.goal.distanceTo(goal) > 0.1) { c.goal = goal; c.path = this._route(c.g.position, goal); }
      const next = c.path[0];
      if (next) {
        const to = next.clone().sub(c.g.position); to.y = 0;
        const d = to.length();
        if (d < 0.15) c.path.shift();
        else {
          c.g.position.addScaledVector(to.normalize(), Math.min(d, 2.4 * dt));
          c.g.rotation.y = Math.atan2(to.x, to.z);
          c.g.position.y = Math.abs(Math.sin(t * 9 + c.phase)) * 0.05;
        }
      } else {
        // at the job: lean in and work
        c.g.position.y = 0;
        c.g.rotation.y += Math.sin(t * 2 + c.phase) * 0.004;
      }
    });
  }

  /** Corridor-first route: out of the current room, along the corridor, into the target room. */
  _route(from, to) {
    const pts = [];
    const fromRoom = roomAt(from.x, from.z), toRoom = roomAt(to.x, to.z);
    const doorPt = (room) => {
      const d = DOORS[room.id];
      return d.axis === 'x' ? new THREE.Vector3(0, 0, d.c) : new THREE.Vector3(0, 0, d.at + (d.at > 0 ? -1 : 1));
    };
    const doorMouth = (room) => {
      const d = DOORS[room.id];
      return d.axis === 'x' ? new THREE.Vector3(d.at + (d.at > 0 ? 1 : -1), 0, d.c) : new THREE.Vector3(0, 0, d.at + (d.at > 0 ? 1 : -1));
    };
    if (fromRoom !== toRoom) {
      if (fromRoom !== LAYOUT.corridor) { pts.push(doorMouth(fromRoom)); pts.push(doorPt(fromRoom)); }
      if (toRoom !== LAYOUT.corridor) { pts.push(doorPt(toRoom)); pts.push(doorMouth(toRoom)); }
    }
    pts.push(to.clone());
    return pts;
  }

  dispose() {
    this.exit();
    this._envRT?.dispose();
    this._envRT = null;
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
    });
  }
}

export { SYSTEMS };
