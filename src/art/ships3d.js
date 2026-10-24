import * as THREE from 'three';
import { hullTextures, registryTexture, emblemTexture, glowTexture, hexToRgb } from './textures.js';
import { SHIP_CLASSES, PALETTES } from '../data/ships.js';

/* ============================================================ geometry tools */
export function bodyLathe(len, radius, opts = {}) {
  const seg = opts.segments || 48;
  const front = opts.front ?? 0.55;      // 0 = pointy, 1 = bluff nose
  const back = opts.back ?? 0.55;
  const bulge = opts.bulge ?? 0.2;
  const pts = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                     // 0 = back, 1 = front
    const h = -len / 2 + t * len;
    let r;
    if (t < 0.5) {
      const q = t / 0.5;
      r = radius * (back + (1 - back) * Math.pow(Math.sin(q * Math.PI * 0.5), 1.6));
    } else {
      const q = (t - 0.5) / 0.5;
      r = radius * (front + (1 - front) * Math.pow(Math.cos(q * Math.PI * 0.5), 1.6));
    }
    r *= 1 + bulge * Math.sin(t * Math.PI) * 0.35;
    r = Math.max(0.0008, r);
    pts.push(new THREE.Vector2(r, h));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

export function saucerGeometry(radius, thickness, opts = {}) {
  const seg = opts.segments || 64;
  const pts = [];
  const N = 16;
  pts.push(new THREE.Vector2(0.002, thickness * 0.95));
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const y = thickness * 0.95 * (1 - Math.pow(t, 2.4)) + thickness * 0.06;
    pts.push(new THREE.Vector2(radius * t, y));
  }
  pts.push(new THREE.Vector2(radius * 1.012, 0.001));
  for (let i = N; i >= 1; i--) {
    const t = i / N;
    const y = -thickness * (0.42 + 0.58 * Math.pow(t, 2.1));
    pts.push(new THREE.Vector2(radius * t, y));
  }
  pts.push(new THREE.Vector2(0.002, -thickness * 0.42));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(1, 1, opts.scaleZ || 1);
  return g;
}

export function roundedBox(w, h, d, r = 0.08) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: Math.min(r, h * 0.5), bevelThickness: Math.min(r, h * 0.5), bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.center();
  return g;
}

export function extrudeProfile(points, depth, bevel = 0.05) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1] || 0)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.center();
  return g;
}

export function greeble(group, material, count, box, rng = Math.random) {
  const [w, h, d] = box;
  for (let i = 0; i < count; i++) {
    const g = new THREE.BoxGeometry(0.03 + rng() * w * 0.14, 0.02 + rng() * h * 0.5, 0.03 + rng() * d * 0.14);
    const m = new THREE.Mesh(g, material);
    m.position.set((rng() - 0.5) * w, (rng() - 0.5) * h, (rng() - 0.5) * d);
    m.rotation.set(rng() * 0.3, rng() * 0.3, rng() * 0.3);
    group.add(m);
  }
}

export function disposeObject3D(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        // textures are generated once and cached globally — never dispose those
        m.dispose?.();
      });
    }
  });
}

/* ============================================================ materials */
export function makeShipMaterials(cls, record, quality = 1) {
  const palette = PALETTES.find((p) => p.id === record.palette) || PALETTES[0];
  const detail = quality > 0.6 ? 1 : 0;
  const tex = hullTextures(palette.id, detail);
  const nacelleColor = record.nacelle || palette.accent;
  const deflectorColor = record.deflector || '#5ab7ff';

  const hull = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.hull),
    map: tex.map,
    roughnessMap: tex.roughnessMap,
    bumpMap: tex.bumpMap,
    bumpScale: 0.018,
    emissive: new THREE.Color(0xffd9a0),
    emissiveMap: tex.emissiveMap,
    emissiveIntensity: 0.75,
    metalness: 0.62,
    roughness: 0.46,
    envMapIntensity: 1.15,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.trim),
    map: tex.map,
    roughnessMap: tex.roughnessMap,
    metalness: 0.78,
    roughness: 0.38,
    envMapIntensity: 1.2,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.dark || '#20262e'),
    metalness: 0.7,
    roughness: 0.55,
    envMapIntensity: 0.9,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.accent),
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 1.8,
    metalness: 0.2,
    roughness: 0.3,
    toneMapped: false,
  });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(nacelleColor).multiplyScalar(1.35), toneMapped: false });
  const glowSoft = new THREE.MeshBasicMaterial({
    color: new THREE.Color(nacelleColor),
    transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const deflector = new THREE.MeshStandardMaterial({
    color: new THREE.Color(deflectorColor),
    emissive: new THREE.Color(deflectorColor),
    emissiveIntensity: 2.4,
    metalness: 0.1,
    roughness: 0.22,
    toneMapped: false,
  });
  const deflectorGlass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(deflectorColor).lerp(new THREE.Color('#ffffff'), 0.4),
    transmission: 0.55, roughness: 0.12, metalness: 0,
    transparent: true, opacity: 0.65, envMapIntensity: 1.6,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1420, metalness: 0.2, roughness: 0.08, transmission: 0.35,
    transparent: true, opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.05,
  });
  const decal = new THREE.MeshBasicMaterial({
    map: registryTexture(record.name || cls.hullName, record.registry || cls.registry, '#1b232e'),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.92,
  });
  const emblem = new THREE.MeshBasicMaterial({
    map: emblemTexture(), transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2,
  });
  return { hull, trim, dark, accent, glow, glowSoft, deflector, deflectorGlass, glass, decal, emblem, palette, nacelleColor, deflectorColor };
}

/* ============================================================ builder */
class ShipBuilder {
  constructor(classId, record, quality) {
    this.cls = SHIP_CLASSES[classId];
    this.record = record;
    this.quality = quality;
    this.group = new THREE.Group();
    this.mats = makeShipMaterials(this.cls, record, quality);
    this.detail = quality > 0.6 ? 1 : 0;
    this.phaserMuzzles = [];
    this.torpMuzzles = [];
    this.thrusters = [];
    this.nacelles = [];
    this.pivots = [];
  }
  mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], parent = this.group) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }
  add(m) { this.group.add(m); return m; }

  saucer({ r, t, y = 0, z = 0, scaleZ = 1, segments = 64 }) {
    const g = new THREE.Group();
    g.position.set(0, y, z);
    const geo = saucerGeometry(r, t, { segments: this.detail ? segments : Math.round(segments * 0.6), scaleZ });
    const s = new THREE.Mesh(geo, this.mats.hull);
    g.add(s);
    // rim highlight ring
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.995, t * 0.18, 6, this.detail ? 72 : 40), this.mats.trim);
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = scaleZ;
    g.add(rim);
    // top superstructure
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.42, t * 0.55, this.detail ? 40 : 24), this.mats.hull);
    top.position.y = t * 0.9;
    g.add(top);
    // bridge dome
    const bridge = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.trim);
    bridge.position.y = t * 1.2;
    bridge.scale.y = 0.6;
    g.add(bridge);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.055, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.accent);
    dome.position.y = t * 1.35;
    g.add(dome);
    // phaser strips around rim
    const stripCount = this.cls.hardpoints?.phasers || 4;
    for (let i = 0; i < Math.min(6, stripCount); i++) {
      const a = -0.6 + i * (1.2 / Math.max(1, Math.min(6, stripCount) - 1));
      const strip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, t * 0.09, 4, 18, 0.3), this.mats.accent);
      strip.rotation.x = Math.PI / 2;
      strip.rotation.z = a + Math.PI;
      strip.position.y = t * 0.35;
      strip.scale.z = scaleZ;
      g.add(strip);
    }
    // windows below saucer rim
    const lowerDeck = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, t * 0.14, 8, 48), this.mats.dark);
    lowerDeck.rotation.x = Math.PI / 2;
    lowerDeck.position.y = -t * 0.35;
    lowerDeck.scale.z = scaleZ;
    g.add(lowerDeck);
    this.group.add(g);
    return g;
  }

  hullBody({ len, r, y = 0, z = 0, front = 0.5, back = 0.5, scaleY = 1, scaleX = 1 }) {
    const geo = bodyLathe(len, r, { segments: this.detail ? 40 : 24, front, back });
    const m = new THREE.Mesh(geo, this.mats.hull);
    m.position.set(0, y, z);
    m.scale.set(scaleX, scaleY, 1);
    this.group.add(m);
    return m;
  }

  deflector({ r, y, z, rotY = 0 }) {
    const g = new THREE.Group();
    g.position.set(0, y, z);
    g.rotation.y = rotY;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 8, 40), this.mats.trim);
    g.add(ring);
    const dish = new THREE.Mesh(new THREE.CircleGeometry(r * 0.94, 36), this.mats.deflector);
    dish.position.z = -r * 0.06;
    g.add(dish);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, r * 0.05, 6, 30), this.mats.accent);
    inner.position.z = r * 0.03;
    g.add(inner);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 18, 10), this.mats.deflectorGlass);
    hub.position.z = r * 0.04;
    g.add(hub);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 4.2, r * 4.2), new THREE.MeshBasicMaterial({
      map: glowTexture(this.mats.deflectorColor), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    halo.position.z = -r * 0.2;
    g.add(halo);
    this.group.add(g);
    return g;
  }

  nacelle({ x, y, z, len, r, tier = 0, tilt = 0, rudder = 0, group = null }) {
    const parent = group || this.group;
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = tilt;
    pivot.rotation.y = rudder;
    parent.add(pivot);

    const body = new THREE.Mesh(bodyLathe(len, r, { segments: this.detail ? 32 : 18, front: 0.66, back: 0.58 }), this.mats.hull);
    pivot.add(body);

    // bussard collector at front (+Z)
    const bussard = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 22, 12), new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.mats.nacelleColor).lerp(new THREE.Color('#ff5a3c'), 0.55),
      emissive: new THREE.Color('#ff4b2b'), emissiveIntensity: 1.6,
      metalness: 0.2, roughness: 0.15, transmission: 0.35, transparent: true, opacity: 0.92, toneMapped: false,
    }));
    bussard.position.z = len * 0.52;
    bussard.scale.set(0.95, 0.95, 0.8);
    pivot.add(bussard);
    this.nacelles.push(bussard);

    // warp grille on outer side
    const grille = new THREE.Mesh(new THREE.BoxGeometry(r * 0.34, r * 0.62, len * 0.62), this.mats.glow);
    grille.position.set(Math.sign(x) * r * 0.86, 0, -len * 0.04);
    pivot.add(grille);
    const grilleGlow = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.5, len * 0.7), this.mats.glowSoft);
    grilleGlow.position.set(Math.sign(x) * r * 1.35, 0, -len * 0.04);
    grilleGlow.rotation.y = Math.sign(x) * Math.PI / 2;
    pivot.add(grilleGlow);

    // tail cap
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.55, r * 0.4, 20), this.mats.trim);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -len * 0.5;
    pivot.add(tail);
    const tailGlow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 20), this.mats.accent);
    tailGlow.rotation.y = Math.PI;
    tailGlow.position.z = -len * 0.52;
    pivot.add(tailGlow);

    // ribs for detail
    if (this.detail) {
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, r * 0.045, 4, 18), this.mats.trim);
        rib.rotation.x = Math.PI / 2;
        rib.position.z = -len * 0.22 + i * len * 0.14;
        pivot.add(rib);
      }
    }
    this.pivots.push(pivot);
    return pivot;
  }

  pylon(points, thickness, mat = this.mats.trim, offset = [0, 0, 0], rot = [0, 0, 0]) {
    const geo = extrudeProfile(points, thickness, thickness * 0.35);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...offset);
    m.rotation.set(...rot);
    this.group.add(m);
    return m;
  }

  impulse(y, z, count = 2, spread = 0.5) {
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -spread + (i * spread * 2) / (count - 1);
      const engine = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.28), this.mats.trim);
      engine.position.set(x, y, z);
      this.group.add(engine);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.11), this.mats.glow);
      glow.position.set(x, y, z - 0.15);
      glow.rotation.y = Math.PI;
      this.group.add(glow);
      this.thrusters.push({ pos: new THREE.Vector3(x, y, z - 0.18) });
    }
  }

  phaserBank(x, y, z, rot = [0, 0, 0], scale = 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.035, 0.09), this.mats.accent);
    m.position.set(x, y, z);
    m.rotation.set(...rot);
    this.group.add(m);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, y, z);
    this.group.add(muzzle);
    this.phaserMuzzles.push(muzzle);
    return m;
  }

  torpTube(x, y, z) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 14, 1, true), this.mats.dark);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(x, y, z);
    this.group.add(tube);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), this.mats.accent);
    mouth.position.set(x, y, z + 0.09);
    this.group.add(mouth);
    const o = new THREE.Object3D();
    o.position.set(x, y, z + 0.1);
    this.group.add(o);
    this.torpMuzzles.push(o);
  }

  decalOnSaucer(r, t, y, z) {
    const g = new THREE.PlaneGeometry(r * 1.05, r * 0.33);
    const m = new THREE.Mesh(g, this.mats.decal);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y + t * 1.0, z + r * 0.22);
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  sideDecal(x, y, z, scale = 1, rotY = 0) {
    const g = new THREE.PlaneGeometry(1.5 * scale, 0.38 * scale);
    const mat = this.mats.decal.clone();
    mat.opacity = 0.75;
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  finish(extra = {}) {
    this.group.userData = {
      cls: this.cls,
      phaserMuzzles: this.phaserMuzzles,
      torpMuzzles: this.torpMuzzles,
      thrusters: this.thrusters,
      nacelles: this.nacelles,
      pivots: this.pivots,
      materials: this.mats,
      ...extra,
    };
    return this.group;
  }
}

/* ============================================================ class builders */
function buildMiranda(b) {
  const m = b.mats;
  // Primary hull
  b.saucer({ r: 1.5, t: 0.16, y: 0.62, z: 0.75, scaleZ: 1.12 });
  // Engineering hull
  const hull = b.hullBody({ len: 2.5, r: 0.42, y: 0.06, z: -0.5, front: 0.4, back: 0.7, scaleY: 0.9 });
  // neck
  b.pylon([[-0.16, 0], [0.16, 0], [0.24, 0.55], [-0.24, 0.55]], 0.5, m.hull, [0, 0.18, -0.1], [0, 0, 0]);
  // roll bar above saucer
  const bar = b.mesh(roundedBox(3.15, 0.1, 0.42, 0.06), m.hull, [0, 0.98, -0.05]);
  bar.rotation.x = 0.02;
  b.mesh(roundedBox(1.1, 0.16, 0.3, 0.05), m.trim, [0, 0.9, -0.05]);
  // nacelle pylons
  b.pylon([[0.2, 0], [0.55, -0.28], [0.62, -0.2], [0.3, 0.1]], 0.1, m.hull, [0.45, 0.98, 0.12], [0, 0, 0]);
  b.pylon([[-0.2, 0], [-0.55, -0.28], [-0.62, -0.2], [-0.3, 0.1]], 0.1, m.hull, [-0.45, 0.98, 0.12], [0, 0, 0]);
  // nacelles
  b.nacelle({ x: -1.28, y: 1.0, z: -0.6, len: 2.5, r: 0.19, tilt: -0.02 });
  b.nacelle({ x: 1.28, y: 1.0, z: -0.6, len: 2.5, r: 0.19, tilt: 0.02 });
  // deflector
  b.deflector({ r: 0.3, y: 0.06, z: 0.72 });
  // impulse engines
  b.impulse(0.72, -0.62, 2, 0.42);
  // weapons
  b.phaserBank(0, 0.12, 0.78, [Math.PI / 2, 0, 0], 0.9);
  b.phaserBank(0.9, 0.72, -0.1, [0, 0, 0], 0.8);
  b.phaserBank(-0.9, 0.72, -0.1, [0, 0, 0], 0.8);
  b.torpTube(-0.22, 0.02, 0.78);
  b.torpTube(0.22, 0.02, 0.78);
  // decals + details
  b.decalOnSaucer(1.32, 0.16, 0.62, 0.75);
  b.sideDecal(-0.44, 0.06, -0.55, 0.55, -Math.PI / 2);
  b.sideDecal(0.44, 0.06, -0.55, 0.55, Math.PI / 2);
  greeble(b.group, m.dark, b.detail ? 26 : 10, [2.6, 0.5, 1.4]);
  return b.finish({ length: 6.4, radius: 2.2 });
}

function buildConstitution(b) {
  const m = b.mats;
  // big circular primary hull, set forward and high
  b.saucer({ r: 1.62, t: 0.19, y: 1.02, z: 1.35, scaleZ: 1.0, segments: 88 });
  // lower sensor dome under the saucer
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.trim);
  sensor.position.set(0, 1.02 - 0.19 * 0.95, 1.35);
  b.add(sensor);
  // slim dorsal neck sweeping aft and down to the engineering hull
  b.pylon([[0.3, 0], [0.3, 0.68], [-0.26, 0.68], [-0.26, 0]], 0.26, m.hull, [0, 0.34, 0.82], [0, 0, 0]);
  b.mesh(roundedBox(0.26, 0.12, 0.86, 0.04), m.trim, [0, 0.7, 0.9]);
  // slim cylindrical secondary hull
  const hull = b.hullBody({ len: 2.9, r: 0.4, y: 0.3, z: -1.15, front: 0.55, back: 0.78, scaleY: 0.94 });
  hull.rotation.x = 0.006;
  // aft end cap / shuttlebay
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.27, 0.24, 28), m.trim);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(0, 0.3, -2.52);
  b.add(cap);
  b.mesh(roundedBox(0.42, 0.26, 0.1, 0.04), m.dark, [0, 0.36, -2.62]);
  // main deflector dish at the bow of the engineering hull
  b.deflector({ r: 0.27, y: 0.3, z: 0.5 });
  // warp nacelle pylons: straight, swept up and out
  for (const sgn of [-1, 1]) {
    b.pylon([[0.35, -0.16], [1.32, 0.42], [1.32, 0.66], [0.2, 0.1]], 0.13, m.hull, [sgn * 1.05, 0.34, -1.62], [0, 0, 0]);
  }
  // twin cylindrical nacelles
  b.nacelle({ x: -1.7, y: 1.08, z: -2.2, len: 3.2, r: 0.205, tilt: -0.02 });
  b.nacelle({ x: 1.7, y: 1.08, z: -2.2, len: 3.2, r: 0.205, tilt: 0.02 });
  // impulse engines on the aft face of the saucer rim
  b.impulse(1.0, -0.12, 2, 0.5);
  // phaser banks
  b.phaserBank(0, 0.42, 2.55, [Math.PI / 2, 0, 0], 1.0);
  b.phaserBank(0, 1.22, 1.5, [0, 0, 0], 1.1);
  b.phaserBank(1.15, 1.06, 1.0, [0, 0.7, 0], 0.6);
  b.phaserBank(-1.15, 1.06, 1.0, [0, -0.7, 0], 0.6);
  b.phaserBank(0, 0.3, -2.6, [0, 0, 0], 0.6);
  // photon torpedo launchers under the saucer
  b.torpTube(-0.26, 0.72, 2.1);
  b.torpTube(0.26, 0.72, 2.1);
  // hull markings
  b.decalOnSaucer(1.4, 0.19, 1.02, 1.3);
  b.sideDecal(-0.42, 0.32, -1.1, 0.58, -Math.PI / 2);
  b.sideDecal(0.42, 0.32, -1.1, 0.58, Math.PI / 2);
  // hull plating detail, kept on the engineering hull where it belongs
  const detailRoot = new THREE.Group();
  detailRoot.position.set(0, 0.34, -1.5);
  b.group.add(detailRoot);
  greeble(detailRoot, m.dark, b.detail ? 22 : 8, [0.7, 0.3, 1.9]);
  return b.finish({ length: 7.2, radius: 2.6 });
}

function buildIntrepid(b) {
  const m = b.mats;
  b.saucer({ r: 1.42, t: 0.15, y: 0.5, z: 0.85, scaleZ: 1.35 });
  // integrated secondary hull: teardrop running aft
  const hull = b.hullBody({ len: 3.4, r: 0.55, y: 0.16, z: -1.05, front: 0.28, back: 0.62, scaleY: 0.92 });
  hull.rotation.x = -0.06;
  // raised spine
  b.mesh(roundedBox(0.46, 0.16, 2.6, 0.08), m.hull, [0, 0.5, -0.55]);
  // deflector recessed in the nose
  b.deflector({ r: 0.34, y: 0.14, z: 0.66 });
  // pylons sweeping up and out
  b.pylon([[0.1, -0.1], [1.05, 0.34], [1.05, 0.52], [0.35, 0.2]], 0.12, m.hull, [0.9, 0.32, -0.75], [0, 0, 0]);
  b.pylon([[-0.1, -0.1], [-1.05, 0.34], [-1.05, 0.52], [-0.35, 0.2]], 0.12, m.hull, [-0.9, 0.32, -0.75], [0, 0, 0]);
  // variable-geometry nacelles
  b.nacelle({ x: -1.3, y: 0.58, z: -1.9, len: 3.0, r: 0.2, tilt: 0.16 });
  b.nacelle({ x: 1.3, y: 0.58, z: -1.9, len: 3.0, r: 0.2, tilt: -0.16 });
  // impulse + weapons
  b.impulse(0.58, -1.0, 2, 0.5);
  b.phaserBank(0.55, 0.42, 1.1, [0, 0.2, 0], 1);
  b.phaserBank(-0.55, 0.42, 1.1, [0, -0.2, 0], 1);
  b.phaserBank(0, 0.36, -0.35, [0, 0, 0], 0.7);
  b.torpTube(-0.18, 0.62, 1.35);
  b.torpTube(0.18, 0.62, 1.35);
  b.decalOnSaucer(1.25, 0.15, 0.5, 0.9);
  b.sideDecal(-0.56, 0.2, -1.0, 0.6, -Math.PI / 2);
  b.sideDecal(0.56, 0.2, -1.0, 0.6, Math.PI / 2);
  greeble(b.group, m.dark, b.detail ? 22 : 8, [2.4, 0.5, 2.6]);
  return b.finish({ length: 7.0, radius: 2.4 });
}

function buildAkira(b) {
  const m = b.mats;
  // wide, flat catamaran saucer
  b.saucer({ r: 1.72, t: 0.17, y: 0.5, z: 0.55, scaleZ: 1.32 });
  // central hull / deflector assembly below saucer
  const hull = b.hullBody({ len: 2.5, r: 0.52, y: 0.16, z: -0.35, front: 0.35, back: 0.75, scaleY: 0.85 });
  b.deflector({ r: 0.38, y: 0.16, z: 0.95 });
  // catamaran struts
  b.pylon([[0.15, 0.1], [1.25, 0.45], [1.25, 0.72], [0.4, 0.3]], 0.14, m.hull, [1.2, 0.62, -0.2], [0, 0, 0]);
  b.pylon([[-0.15, 0.1], [-1.25, 0.45], [-1.25, 0.72], [-0.4, 0.3]], 0.14, m.hull, [-1.2, 0.62, -0.2], [0, 0, 0]);
  // nacelles high and wide
  b.nacelle({ x: -2.05, y: 1.18, z: -1.4, len: 3.2, r: 0.23, tilt: 0.02 });
  b.nacelle({ x: 2.05, y: 1.18, z: -1.4, len: 3.2, r: 0.23, tilt: -0.02 });
  // weapons pod aft dorsal
  const pod = b.mesh(roundedBox(1.5, 0.3, 1.1, 0.1), m.trim, [0, 0.98, -1.05]);
  b.mesh(roundedBox(0.8, 0.12, 0.6, 0.05), m.hull, [0, 1.18, -1.05]);
  for (let i = 0; i < 4; i++) {
    b.torpTube(-0.55 + (i * 1.1) / 3, 0.98, -1.6);
  }
  b.impulse(0.62, -1.15, 4, 0.8);
  b.phaserBank(0, 0.36, 1.15, [0, 0, 0], 1.1);
  b.phaserBank(1.2, 0.55, 0.15, [0, 0.4, 0], 0.7);
  b.phaserBank(-1.2, 0.55, 0.15, [0, -0.4, 0], 0.7);
  b.decalOnSaucer(1.5, 0.17, 0.5, 0.85);
  b.sideDecal(-0.55, 0.2, -0.5, 0.55, -Math.PI / 2);
  b.sideDecal(0.55, 0.2, -0.5, 0.55, Math.PI / 2);
  greeble(b.group, m.dark, b.detail ? 30 : 10, [3.4, 0.6, 2.4]);
  return b.finish({ length: 7.6, radius: 3.0 });
}

function buildDefiant(b) {
  const m = b.mats;
  // wedge-shaped hull
  const wedge = extrudeProfile([
    [0, 2.0], [0.72, 0.55], [1.02, -0.85], [0.6, -1.5], [0, -1.68], [-0.6, -1.5], [-1.02, -0.85], [-0.72, 0.55],
  ], 0.34, 0.09);
  wedge.rotateX(-Math.PI / 2);
  const body = b.mesh(wedge, m.hull, [0, 0.3, 0.1]);
  body.scale.set(1, 1, 1.02);
  // raised centre spine
  b.mesh(roundedBox(0.9, 0.3, 2.5, 0.12), m.hull, [0, 0.62, -0.15]);
  // bridge
  b.mesh(roundedBox(0.62, 0.16, 0.7, 0.06), m.trim, [0, 0.82, 0.35]);
  b.mesh(new THREE.BoxGeometry(0.3, 0.05, 0.4), m.accent, [0, 0.92, 0.4]);
  // nacelles recessed in hull sides
  b.nacelle({ x: -1.0, y: 0.36, z: -0.6, len: 1.9, r: 0.17, tilt: 0.02 });
  b.nacelle({ x: 1.0, y: 0.36, z: -0.6, len: 1.9, r: 0.17, tilt: -0.02 });
  // small forward deflector
  b.deflector({ r: 0.2, y: 0.16, z: 1.85 });
  // pulse phaser cannons
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? -0.42 - i * 0.16 : 0.28 + (i - 2) * 0.16;
    b.phaserBank(x, 0.12, 1.62, [0, 0, 0], 0.6);
  }
  // torpedo launchers dorsal
  b.torpTube(-0.2, 0.8, 0.9);
  b.torpTube(0.2, 0.8, 0.9);
  b.impulse(0.36, -1.35, 2, 0.36);
  b.decalOnSaucer(0.6, 0.1, 0.55, 0.3);
  b.sideDecal(-0.72, 0.34, -0.5, 0.5, -Math.PI / 2);
  b.sideDecal(0.72, 0.34, -0.5, 0.5, Math.PI / 2);
  greeble(b.group, m.dark, b.detail ? 24 : 10, [1.8, 0.5, 2.6]);
  return b.finish({ length: 5.4, radius: 2.0 });
}

function buildSovereign(b) {
  const m = b.mats;
  // elongated command saucer
  b.saucer({ r: 2.0, t: 0.2, y: 0.85, z: 1.35, scaleZ: 1.45, segments: 80 });
  // sleek engineering hull
  const hull = b.hullBody({ len: 5.0, r: 0.72, y: 0.3, z: -1.15, front: 0.38, back: 0.55, scaleY: 0.9 });
  // dorsal spine and shuttlebay
  b.mesh(roundedBox(1.15, 0.34, 2.8, 0.12), m.hull, [0, 0.92, -0.9]);
  b.mesh(roundedBox(0.8, 0.2, 0.7, 0.06), m.trim, [0, 1.1, -2.2]);
  // pylons sweeping aft
  b.pylon([[0.2, 0.1], [1.0, 0.4], [1.05, 0.72], [0.42, 0.3]], 0.16, m.hull, [1.05, 0.55, -1.7], [0, 0, 0]);
  b.pylon([[-0.2, 0.1], [-1.0, 0.4], [-1.05, 0.72], [-0.42, 0.3]], 0.16, m.hull, [-1.05, 0.55, -1.7], [0, 0, 0]);
  // nacelles
  b.nacelle({ x: -1.62, y: 1.02, z: -2.35, len: 4.0, r: 0.24, tilt: 0.03 });
  b.nacelle({ x: 1.62, y: 1.02, z: -2.35, len: 4.0, r: 0.24, tilt: -0.03 });
  // main deflector
  b.deflector({ r: 0.5, y: 0.3, z: 1.5 });
  // impulse engines
  b.impulse(0.95, -2.1, 4, 0.62);
  // captain's yacht recess
  b.mesh(roundedBox(0.44, 0.1, 0.8, 0.05), m.trim, [0, 0.4, 0.1]);
  // phaser strips
  b.phaserBank(0, 0.5, 1.9, [0, 0, 0], 1.3);
  b.phaserBank(1.35, 0.8, 1.1, [0, 0.5, 0], 0.7);
  b.phaserBank(-1.35, 0.8, 1.1, [0, -0.5, 0], 0.7);
  b.phaserBank(0, 1.0, -0.9, [0, 0, 0], 0.8);
  b.phaserBank(0, 0.25, -3.0, [0, 0, 0], 0.7);
  // quantum torpedo launchers
  b.torpTube(-0.28, 0.78, 1.9);
  b.torpTube(0.28, 0.78, 1.9);
  b.torpTube(-0.42, 0.62, 1.72);
  b.torpTube(0.42, 0.62, 1.72);
  b.decalOnSaucer(1.7, 0.2, 0.85, 1.3);
  b.sideDecal(-0.72, 0.4, -1.2, 0.8, -Math.PI / 2);
  b.sideDecal(0.72, 0.4, -1.2, 0.8, Math.PI / 2);
  greeble(b.group, m.dark, b.detail ? 40 : 14, [3.6, 0.8, 4.4]);
  return b.finish({ length: 9.4, radius: 3.4 });
}

function buildPrometheus(b) {
  const m = b.mats;
  // narrow, long command section
  b.saucer({ r: 1.62, t: 0.18, y: 0.72, z: 1.6, scaleZ: 1.9, segments: 72 });
  const hull = b.hullBody({ len: 4.4, r: 0.62, y: 0.24, z: -1.2, front: 0.32, back: 0.5, scaleY: 0.85 });
  // twin spine ridges (multi-vector seams)
  b.mesh(roundedBox(0.34, 0.26, 3.2, 0.08), m.hull, [-0.34, 0.78, -0.6]);
  b.mesh(roundedBox(0.34, 0.26, 3.2, 0.08), m.hull, [0.34, 0.78, -0.6]);
  // four nacelles on swept pylons
  b.pylon([[0.15, 0.1], [1.15, 0.5], [1.2, 0.8], [0.4, 0.3]], 0.14, m.hull, [1.1, 0.6, -1.4], [0, 0, 0]);
  b.pylon([[-0.15, 0.1], [-1.15, 0.5], [-1.2, 0.8], [-0.4, 0.3]], 0.14, m.hull, [-1.1, 0.6, -1.4], [0, 0, 0]);
  b.pylon([[0.2, -0.1], [1.35, -0.35], [1.4, -0.16], [0.45, 0.1]], 0.1, m.trim, [1.5, 0.28, -1.7], [0, 0, 0]);
  b.pylon([[-0.2, -0.1], [-1.35, -0.35], [-1.4, -0.16], [-0.45, 0.1]], 0.1, m.trim, [-1.5, 0.28, -1.7], [0, 0, 0]);
  b.nacelle({ x: -1.75, y: 1.12, z: -2.3, len: 3.3, r: 0.19, tilt: 0.06 });
  b.nacelle({ x: 1.75, y: 1.12, z: -2.3, len: 3.3, r: 0.19, tilt: -0.06 });
  b.nacelle({ x: -1.95, y: 0.18, z: -2.15, len: 3.0, r: 0.16, tilt: 0.05 });
  b.nacelle({ x: 1.95, y: 0.18, z: -2.15, len: 3.0, r: 0.16, tilt: -0.05 });
  b.deflector({ r: 0.4, y: 0.24, z: 1.8 });
  b.impulse(0.86, -2.5, 4, 0.7);
  b.phaserBank(0, 0.42, 2.1, [0, 0, 0], 1.2);
  b.phaserBank(1.1, 0.7, 1.4, [0, 0.45, 0], 0.7);
  b.phaserBank(-1.1, 0.7, 1.4, [0, -0.45, 0], 0.7);
  b.torpTube(-0.25, 0.66, 2.05);
  b.torpTube(0.25, 0.66, 2.05);
  b.torpTube(-0.25, 0.66, -3.0);
  b.torpTube(0.25, 0.66, -3.0);
  b.decalOnSaucer(1.35, 0.18, 0.72, 1.7);
  b.sideDecal(-0.6, 0.34, -1.4, 0.7, -Math.PI / 2);
  b.sideDecal(0.6, 0.34, -1.4, 0.7, Math.PI / 2);
  greeble(b.group, m.dark, b.detail ? 42 : 16, [3.2, 0.7, 4.0]);
  return b.finish({ length: 8.6, radius: 3.2, quadNacelle: true });
}

const BUILDERS = {
  miranda: buildMiranda,
  constitution: buildConstitution,
  intrepid: buildIntrepid,
  akira: buildAkira,
  defiant: buildDefiant,
  sovereign: buildSovereign,
  prometheus: buildPrometheus,
};

/** Build a complete starship. Forward is +Z. */
export function buildShip(classId, record = {}, quality = 1) {
  const cls = SHIP_CLASSES[classId] || SHIP_CLASSES.miranda;
  const b = new ShipBuilder(cls.id, record, quality);
  const build = BUILDERS[cls.id] || BUILDERS.miranda;
  const group = build(b);
  group.name = `ship-${cls.id}`;
  group.userData.classId = cls.id;
  group.userData.length = group.userData.length || 6;
  return group;
}

/* ============================================================ engine FX */
export function engineTrail(scene, count = 26, color = '#7fd8ff') {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      attribute float aAlpha; varying float vA;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = 26.0 * aAlpha * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
      float a = smoothstep(0.5, 0.0, d) * vA;
      gl_FragColor = vec4(uColor * (1.4 + vA), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
