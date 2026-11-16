/**
 * 3D models for the player's own space station and its modules, and for the
 * cargo freighters that fly between planets.
 */
import * as THREE from 'three';
import { SLOTS, MODULES } from '../data/stations.js';
import { hullTextures, glowTexture } from './textures.js';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const tex = hullTextures('starfleet', 1);
  const glow = (c, k = 1.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  MATS = {
    hull: new THREE.MeshStandardMaterial({ color: 0xc9ced6, map: tex.map, roughnessMap: tex.roughnessMap, metalness: 0.55, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3d434c, metalness: 0.7, roughness: 0.4 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.8, roughness: 0.22, emissive: 0x0a1630, emissiveIntensity: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd4ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false }),
    windows: glow('#ffe1a8', 1.1),
    cyan: glow('#59e0ff'),
    green: glow('#62f2a6'),
    amber: glow('#ffb347'),
    red: glow('#ff4a3d', 1.6),
    violet: glow('#b47bff'),
    shield: new THREE.MeshBasicMaterial({ color: 0x59e0ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    marker: new THREE.MeshBasicMaterial({ color: 0x59e0ff, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
    markerSel: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  };
  return MATS;
}

const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/** World-ish position of a slot (station units) and the direction it faces. */
export function slotTransform(slotId) {
  const s = SLOTS[slotId];
  const pos = new THREE.Vector3(Math.cos(s.angle) * s.r, s.y, Math.sin(s.angle) * s.r);
  const out = s.ring === 'top' ? new THREE.Vector3(0, 1, 0) : s.ring === 'bottom' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(Math.cos(s.angle), 0, Math.sin(s.angle));
  return { pos, out, ring: s.ring };
}

/* ---------------------------------------------------------------- modules */
// each builder draws a module standing on +Y (its "outward" direction)
const BUILD = {
  habitat(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(2.6, 2.6, 5.5, 20), m.hull, 0, 2.75, 0));
    for (let i = 0; i < 3; i++) g.add(M(new THREE.CylinderGeometry(2.64, 2.64, 0.28, 20), m.windows, 0, 1.2 + i * 1.5, 0));
    g.add(M(new THREE.SphereGeometry(2.6, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.hull, 0, 5.5, 0));
    return g;
  },
  solar(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), m.dark, 0, 3, 0));
    for (const s of [-1, 1]) {
      const p = M(new THREE.BoxGeometry(5.5, 0.12, 3.2), m.panel, s * 3.2, 5.2, 0);
      g.add(p);
      for (let i = -2; i <= 2; i++) g.add(M(new THREE.BoxGeometry(0.06, 0.14, 3.2), m.dark, s * 3.2 + i * 1.1, 5.2, 0));
    }
    return g;
  },
  refinery(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(1.4, 2, 3, 12), m.dark, 0, 1.5, 0));
    for (const [x, z] of [[-1.5, 0], [1.5, 0], [0, 1.6]]) g.add(M(new THREE.SphereGeometry(1.3, 16, 12), m.hull, x, 4, z));
    g.add(M(new THREE.TorusGeometry(2.3, 0.18, 8, 30), m.cyan, 0, 3.2, 0).rotateX(Math.PI / 2));
    return g;
  },
  lab(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(2.4, 2.4, 2.4, 20), m.hull, 0, 1.2, 0));
    g.add(M(new THREE.SphereGeometry(2.3, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, 0, 2.4, 0));
    g.add(M(new THREE.SphereGeometry(0.7, 12, 10), m.violet, 0, 3, 0));
    return g;
  },
  dock(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.BoxGeometry(1.4, 7, 1.4), m.dark, 0, 3.5, 0));
    for (const s of [-1, 1]) {
      g.add(M(new THREE.BoxGeometry(0.5, 0.5, 5), m.hull, s * 2.2, 6.6, 0));
      g.add(M(new THREE.BoxGeometry(2.2, 0.5, 0.5), m.hull, s * 1.1, 6.6, 2.3));
      g.add(M(new THREE.SphereGeometry(0.22, 8, 6), m.green, s * 2.2, 6.9, -2.4));
    }
    return g;
  },
  shield(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(0.8, 1.6, 2.4, 12), m.dark, 0, 1.2, 0));
    const dish = M(new THREE.SphereGeometry(2.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3), m.hull, 0, 3.6, 0);
    dish.rotation.x = Math.PI;
    g.add(dish);
    g.add(M(new THREE.SphereGeometry(0.5, 12, 10), m.cyan, 0, 2.6, 0));
    return g;
  },
  turret(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(1.6, 2, 1.4, 14), m.dark, 0, 0.7, 0));
    const head = new THREE.Group();
    head.position.y = 2;
    head.add(M(new THREE.SphereGeometry(1.2, 14, 10), m.hull));
    for (const s of [-1, 1]) {
      const barrel = M(new THREE.CylinderGeometry(0.16, 0.2, 3, 8), m.dark, s * 0.45, 0, 1.6);
      barrel.rotation.x = Math.PI / 2;
      head.add(barrel);
      head.add(M(new THREE.SphereGeometry(0.14, 8, 6), m.amber, s * 0.45, 0, 3.1));
    }
    head.userData.turretHead = true;
    g.add(head);
    g.userData.head = head;
    return g;
  },
  sensor(m) {
    const g = new THREE.Group();
    g.add(M(new THREE.CylinderGeometry(0.18, 0.35, 9, 8), m.dark, 0, 4.5, 0));
    const dish = M(new THREE.SphereGeometry(1.6, 16, 6, 0, Math.PI * 2, 0, Math.PI / 3.2), m.hull, 0, 6, 0.4);
    dish.rotation.x = -1.1;
    g.add(dish);
    const beacon = M(new THREE.SphereGeometry(0.3, 10, 8), m.red, 0, 9.2, 0);
    beacon.userData.blink = true;
    g.add(beacon);
    return g;
  },
};

/** One module, oriented to face out from its slot. */
export function buildModuleMesh(type, slotId) {
  const make = BUILD[type];
  if (!make) return null;
  const g = make(mats());
  const { pos, out } = slotTransform(slotId);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
  g.userData.type = type;
  g.userData.slot = slotId;
  return g;
}

/**
 * The whole station: core hub, ring and pylons, plus every built module.
 * userData: { modules: Map(slot → group), turrets: [head], markers: [mesh], shield, beacons }
 */
export function buildStation(station) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'player-station';
  // core hub with a lit band and docking lights
  g.add(M(new THREE.CylinderGeometry(4.2, 4.2, 9, 28), m.hull));
  g.add(M(new THREE.CylinderGeometry(4.26, 4.26, 0.7, 28), m.windows, 0, 1.6, 0));
  g.add(M(new THREE.CylinderGeometry(4.26, 4.26, 0.7, 28), m.windows, 0, -1.6, 0));
  g.add(M(new THREE.CylinderGeometry(3, 4.2, 2, 28), m.hull, 0, 5.5, 0));
  g.add(M(new THREE.CylinderGeometry(4.2, 3, 2, 28), m.hull, 0, -5.5, 0));
  // the inner ring the modules dock onto, on six spokes
  const ring = M(new THREE.TorusGeometry(13, 0.9, 10, 64), m.hull);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const band = M(new THREE.TorusGeometry(13, 0.95, 4, 64, Math.PI * 2), m.cyan);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1, 0.12);
  g.add(band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const spoke = M(new THREE.BoxGeometry(9, 0.6, 0.6), m.dark, Math.cos(a) * 8.6, 0, Math.sin(a) * 8.6);
    spoke.rotation.y = -a;
    g.add(spoke);
  }
  // pylons out to the four outer slots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = M(new THREE.BoxGeometry(13, 0.5, 0.5), m.dark, Math.cos(a) * 19.5, 0, Math.sin(a) * 19.5);
    arm.rotation.y = -a;
    g.add(arm);
    g.add(M(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 12), m.hull, Math.cos(a) * 26, 0, Math.sin(a) * 26));
  }
  // running lights
  const beacons = [];
  for (const [x, y, z, c] of [[0, 6.6, 0, '#ff4a3d'], [0, -6.6, 0, '#ff4a3d'], [13, 0, 0, '#62f2a6'], [-13, 0, 0, '#ff4a3d']]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(c), color: new THREE.Color(c).multiplyScalar(1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.position.set(x, y, z);
    s.scale.setScalar(2.2);
    g.add(s);
    beacons.push(s);
  }
  g.userData = { modules: new Map(), turrets: [], markers: [], shield: null, beacons, station };
  syncStation(g, station);
  return g;
}

/** Add/remove module meshes so the model matches the saved station. */
export function syncStation(g, station) {
  const ud = g.userData;
  const want = station?.modules || {};
  for (const [slot, mesh] of ud.modules) {
    if (want[slot] !== mesh.userData.type) {
      g.remove(mesh);
      mesh.traverse((o) => o.geometry?.dispose?.());
      ud.modules.delete(slot);
    }
  }
  for (const [slotKey, type] of Object.entries(want)) {
    const slot = Number(slotKey);
    if (ud.modules.has(slot) || !MODULES[type]) continue;
    const mesh = buildModuleMesh(type, slot);
    if (!mesh) continue;
    g.add(mesh);
    ud.modules.set(slot, mesh);
  }
  ud.turrets = [...ud.modules.values()].filter((x) => x.userData.type === 'turret').map((x) => x.userData.head);
  const shielded = [...ud.modules.values()].some((x) => x.userData.type === 'shield');
  if (shielded && !ud.shield) {
    ud.shield = M(new THREE.SphereGeometry(34, 40, 24), mats().shield);
    ud.shield.renderOrder = 2;
    g.add(ud.shield);
  } else if (!shielded && ud.shield) {
    g.remove(ud.shield);
    ud.shield.geometry.dispose();
    ud.shield = null;
  }
}

/** Glowing rings on the slots while building; the selected one is amber. */
export function showSlotMarkers(g, on, selected = -1) {
  const ud = g.userData;
  if (!ud.markers.length) {
    for (let i = 0; i < SLOTS.length; i++) {
      const { pos, out } = slotTransform(i);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.2, 6, 28), mats().marker);
      ring.position.copy(pos).addScaledVector(out, 0.6);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      ring.visible = false;
      g.add(ring);
      ud.markers.push(ring);
    }
  }
  ud.markers.forEach((r, i) => {
    r.visible = on && (!ud.modules.has(i) || i === selected);
    r.material = i === selected ? mats().markerSel : mats().marker;
    r.scale.setScalar(i === selected ? 1.4 : 1);
  });
}

/* ---------------------------------------------------------------- freighter */
/** A long-haul cargo freighter: cab, spine, rows of containers, big engines. */
export function buildFreighter(seed = 1) {
  const m = mats();
  const g = new THREE.Group();
  const colors = ['#c8553d', '#3d7cc8', '#d6a23a', '#4fa36b', '#8a5cc8', '#c8c8c8'];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.add(M(new THREE.BoxGeometry(0.8, 0.8, 16), m.dark));
  const cab = M(new THREE.BoxGeometry(3, 2.2, 3), m.hull, 0, 0.4, 8.6);
  g.add(cab);
  g.add(M(new THREE.BoxGeometry(2.6, 0.5, 0.1), m.windows, 0, 0.9, 10.12));
  const crates = new Map();
  for (let i = 0; i < 5; i++) {
    for (const [x, y] of [[-1.15, 0.9], [1.15, 0.9], [-1.15, -0.9], [1.15, -0.9]]) {
      if (rnd() < 0.12) continue;
      const c = colors[Math.floor(rnd() * colors.length)];
      if (!crates.has(c)) crates.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3 }));
      g.add(M(new THREE.BoxGeometry(2.1, 1.7, 2.6), crates.get(c), x, y, 5 - i * 2.9));
    }
  }
  for (const x of [-1.4, 1.4]) {
    g.add(M(new THREE.CylinderGeometry(1, 1.2, 3, 12), m.hull, x, 0, -9.5).rotateX(Math.PI / 2));
    g.add(M(new THREE.CircleGeometry(0.85, 14), m.amber, x, 0, -11.02).rotateY(Math.PI));
  }
  for (const [x, c] of [[-1.6, '#ff4a3d'], [1.6, '#62f2a6']]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(c), color: new THREE.Color(c).multiplyScalar(1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.position.set(x, 1.4, 9);
    sp.scale.setScalar(1.4);
    g.add(sp);
  }
  g.userData.radius = 9;
  return g;
}
