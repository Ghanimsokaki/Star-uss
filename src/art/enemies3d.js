import * as THREE from 'three';
import { bodyLathe, roundedBox, extrudeProfile, greeble } from './ships3d.js';
import { hullTextures, glowTexture } from './textures.js';
import { ENEMIES } from '../data/enemies.js';

function materials(def, quality = 1) {
  const tex = hullTextures(def.id === 'void' || def.id === 'voidlord' ? 'section31' : def.id === 'cube' ? 'section31' : 'starfleet', quality > 0.6 ? 1 : 0);
  const hull = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.colors.hull),
    map: tex.map,
    roughnessMap: tex.roughnessMap,
    bumpMap: tex.bumpMap,
    bumpScale: 0.02,
    metalness: def.id === 'void' || def.id === 'voidlord' ? 0.92 : 0.6,
    roughness: def.id === 'cube' ? 0.62 : 0.44,
    envMapIntensity: 1.1,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.colors.trim),
    metalness: 0.8,
    roughness: 0.4,
    map: tex.map,
  });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.colors.glow).multiplyScalar(1.5), toneMapped: false, side: THREE.DoubleSide });
  const glowSoft = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.colors.glow), transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  return { hull, trim, glow, glowSoft, tex };
}

function buildRaider(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();

  const hull = new THREE.Mesh(bodyLathe(2.6, 0.42, { segments: 28, front: 0.55, back: 0.5 }), m.hull);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  const pod = new THREE.Mesh(roundedBox(1.8, 0.34, 0.9, 0.12), m.trim);
  pod.position.set(0, 0.16, -0.4);
  g.add(pod);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(extrudeProfile([[0, 0.3], [1.3, 0.1], [1.5, -0.28], [0.3, -0.16]], 0.12, 0.04), m.hull);
    wing.position.set(s * 0.8, 0.02, -0.3);
    wing.rotation.z = s * 0.12;
    g.add(wing);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 1.1, 10), m.trim);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(s * 2.05, 0.02, 0.1);
    g.add(tip);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), m.glow);
    glow.position.set(s * 2.05, 0.02, 0.68);
    g.add(glow);
  }
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), m.glowSoft);
  cockpit.position.set(0, 0.3, 1.0);
  cockpit.scale.set(1, 0.6, 1.5);
  g.add(cockpit);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.1), m.glow);
  engine.position.set(0, 0.05, -1.4);
  g.add(engine);
  greeble(g, m.trim, 14, [1.4, 0.4, 1.8]);
  return { group: g, engines: [{ pos: new THREE.Vector3(0, 0.05, -1.45) }], radius: 2.2, materials: m };
}

function buildBop(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();

  const fuselage = new THREE.Mesh(bodyLathe(2.4, 0.38, { segments: 26, front: 0.5, back: 0.55 }), m.hull);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0.12, -0.4);
  g.add(fuselage);

  // neck sweeping down to the head
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.9), m.hull);
  neck.position.set(0, 0.0, 1.0);
  neck.rotation.x = 0.4;
  g.add(neck);
  const head = new THREE.Mesh(roundedBox(0.8, 0.32, 1.0, 0.12), m.trim);
  head.position.set(0, -0.2, 1.5);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 4), m.hull);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.2, 2.1);
  g.add(beak);

  // wings
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(extrudeProfile([
      [0.2, 0.35], [1.6, 0.15], [2.3, -0.5], [2.2, -0.66], [0.3, -0.3],
    ], 0.14, 0.05), m.hull);
    wing.position.set(s * 0.38, 0.16, 0.1);
    wing.rotation.z = s * -0.28;
    wing.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(wing);
    // disruptor cannon at wingtip
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.9, 10), m.trim);
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(s * 2.4, -0.32, 0.4);
    g.add(cannon);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), m.glow);
    glow.position.set(s * 2.4, -0.32, 0.87);
    g.add(glow);
    // engine
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.12), m.glow);
    eng.position.set(s * 0.62, 0.12, -1.35);
    g.add(eng);
  }

  // dorsal details + feather pattern
  greeble(g, m.trim, 18, [1.6, 0.5, 2.0]);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0), new THREE.MeshBasicMaterial({
    map: glowTexture('#2a1a12'), transparent: true, opacity: 0.7, depthWrite: false,
  }));
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.set(0, 0.42, -0.2);
  g.add(emblem);

  return {
    group: g,
    engines: [{ pos: new THREE.Vector3(-0.62, 0.12, -1.42) }, { pos: new THREE.Vector3(0.62, 0.12, -1.42) }],
    radius: 2.8, materials: m,
  };
}

function buildGalor(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();

  // main hull
  const hull = new THREE.Mesh(roundedBox(1.25, 0.55, 3.3, 0.22), m.hull);
  hull.position.y = 0.1;
  g.add(hull);
  const head = new THREE.Mesh(roundedBox(1.5, 0.6, 1.3, 0.28), m.hull);
  head.position.set(0, 0.12, 1.75);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), m.trim);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.05, 2.55);
  g.add(beak);
  // tail fin
  const fin = new THREE.Mesh(extrudeProfile([[-0.4, 0], [0.4, 0], [0.24, 1.5], [-0.1, 1.6]], 0.16, 0.04), m.trim);
  fin.position.set(0, 1.0, -1.0);
  g.add(fin);
  // side pylons + warp pods
  for (const s of [-1, 1]) {
    const pylon = new THREE.Mesh(roundedBox(0.8, 0.16, 1.5, 0.06), m.trim);
    pylon.position.set(s * 1.0, -0.06, -0.3);
    pylon.rotation.z = s * 0.22;
    g.add(pylon);
    const pod = new THREE.Mesh(bodyLathe(2.0, 0.22, { segments: 20, front: 0.6, back: 0.5 }), m.hull);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(s * 1.5, -0.24, -0.1);
    g.add(pod);
    const glow = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.9, 4, 10), m.glow);
    glow.position.set(s * 1.5, 0.02, -0.1);
    g.add(glow);
  }
  // weapon emitters
  const banks = [];
  for (const s of [-0.5, 0.5]) {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), m.glow);
    bank.position.set(s, 0.42, 1.4);
    g.add(bank);
    banks.push(bank);
  }
  greeble(g, m.trim, 26, [2.2, 0.6, 3.0]);
  return {
    group: g,
    engines: [{ pos: new THREE.Vector3(-1.5, -0.24, -1.1) }, { pos: new THREE.Vector3(1.5, -0.24, -1.1) }],
    radius: 3.4, materials: m,
  };
}

function buildWarbird(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  const win = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1a14'), emissive: new THREE.Color('#7dffcf'), emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 });

  // central "beak" hull
  const core = new THREE.Mesh(bodyLathe(4.6, 0.62, { segments: 30, front: 0.25, back: 0.5 }), win);
  core.rotation.x = Math.PI / 2;
  g.add(core);
  // command section
  const cmd = new THREE.Mesh(roundedBox(1.6, 0.5, 2.0, 0.2), m.hull);
  cmd.position.set(0, 0.45, 0.9);
  g.add(cmd);
  // two huge curved hull arms
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.42, 12, 40, Math.PI * 0.95), m.hull);
    arm.rotation.x = Math.PI / 2;
    arm.rotation.z = s > 0 ? -0.15 : Math.PI + 0.15;
    arm.position.set(s * 1.55, 0.15, -0.4);
    arm.scale.set(1, 1, 1.9);
    g.add(arm);
    const wing = new THREE.Mesh(extrudeProfile([[0, 0.5], [1.5, 0.2], [1.8, -0.5], [0.5, -0.35]], 0.2, 0.06), m.trim);
    wing.position.set(s * 1.1, 0.05, -0.3);
    wing.rotation.z = s * 0.2;
    g.add(wing);
    const glow = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.6, 4, 10), m.glow);
    glow.rotation.z = Math.PI / 2;
    glow.position.set(s * 2.0, 0.15, -2.4);
    g.add(glow);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.3, 16), m.glow);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s * 1.5, 0.15, -4.4);
    g.add(eng);
  }
  // nose detail
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), m.trim);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.1, 3.0);
  g.add(nose);
  greeble(g, m.trim, 34, [3.4, 0.8, 5.0]);
  return {
    group: g,
    engines: [{ pos: new THREE.Vector3(-1.5, 0.15, -4.5) }, { pos: new THREE.Vector3(1.5, 0.15, -4.5) }],
    radius: 4.6, materials: m,
  };
}

function buildCube(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  const size = 5.6;
  const core = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), m.hull);
  g.add(core);
  // tritanium greebles across faces
  const greebleMat = m.trim;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 9; i++) {
      const w = 0.4 + Math.random() * 1.4;
      const h = 0.3 + Math.random() * 1.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), greebleMat);
      const a = Math.random() * size - size / 2;
      const b2 = Math.random() * size - size / 2;
      if (f === 0) box.position.set(a, size / 2, b2);
      else if (f === 1) box.position.set(a, -size / 2, b2);
      else if (f === 2) { box.position.set(size / 2, a, b2); box.rotation.y = Math.PI / 2; }
      else if (f === 3) { box.position.set(-size / 2, a, b2); box.rotation.y = Math.PI / 2; }
      else if (f === 4) { box.position.set(a, b2, size / 2); box.rotation.x = Math.PI / 2; }
      else { box.position.set(a, b2, -size / 2); box.rotation.x = Math.PI / 2; }
      g.add(box);
    }
  }
  // glowing green circuitry lines
  const lineMat = m.glow;
  for (let i = 0; i < 26; i++) {
    const horiz = Math.random() > 0.5;
    const len = 0.8 + Math.random() * 3.4;
    const line = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.07, horiz ? 0.07 : len, 0.06), lineMat);
    const face = Math.random() > 0.5 ? 1 : -1;
    if (Math.random() > 0.5) {
      line.position.set((Math.random() - 0.5) * (size - len), (Math.random() - 0.5) * (size - len), face * (size / 2 + 0.08));
    } else {
      line.position.set(face * (size / 2 + 0.08), (Math.random() - 0.5) * (size - len), (Math.random() - 0.5) * (size - len));
      line.rotation.y = Math.PI / 2;
    }
    g.add(line);
  }
  // central glowing eye
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), m.glowSoft);
  eye.position.z = size / 2 + 0.12;
  g.add(eye);
  return { group: g, engines: [], radius: 4.4, materials: m, spin: 0.12 };
}

function buildVoid(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), m.hull);
  core.scale.set(1.1, 0.62, 2.1);
  g.add(core);
  const shardGeo = new THREE.ConeGeometry(0.28, 2.4, 4);
  for (let i = 0; i < 10; i++) {
    const shard = new THREE.Mesh(shardGeo, m.hull);
    const a = (i / 10) * Math.PI * 2;
    shard.position.set(Math.cos(a) * 1.5, Math.sin(a) * 0.6, -0.4 + Math.sin(a * 2) * 0.8);
    shard.rotation.set(Math.PI / 2 + Math.sin(a) * 0.5, a, Math.cos(a) * 0.6);
    g.add(shard);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), m.glow);
    glow.position.copy(shard.position);
    glow.rotation.copy(shard.rotation);
    g.add(glow);
  }
  // glowing core
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 2), m.glowSoft);
  heart.scale.set(1, 0.7, 2);
  heart.position.z = -0.6;
  g.add(heart);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 6, 64), m.glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -1.0;
  g.add(ring);
  greeble(g, m.trim, 20, [2.2, 1.0, 3.2]);
  return {
    group: g,
    engines: [{ pos: new THREE.Vector3(0, 0, -2.2) }],
    radius: 3.2, materials: m, ring,
  };
}

function buildVoidlord(def, quality) {
  const base = buildVoid(def, quality);
  const g = new THREE.Group();
  base.group.scale.setScalar(1.9);
  g.add(base.group);
  const m = base.materials;
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7 + i * 0.9, 0.09, 6, 90), m.glow);
    ring.rotation.x = Math.PI / 2 + i * 0.3;
    ring.rotation.z = i * 0.5;
    g.add(ring);
    base.group.userData.rings = base.group.userData.rings || [];
    base.group.userData.rings.push(ring);
  }
  return { group: g, engines: [{ pos: new THREE.Vector3(0, 0, -6) }], radius: 9, materials: m, spin: 0.02 };
}

const BUILDERS = { raider: buildRaider, bop: buildBop, galor: buildGalor, warbird: buildWarbird, cube: buildCube, void: buildVoid, voidlord: buildVoidlord };

export function buildEnemy(kind, quality = 1) {
  const def = ENEMIES[kind] || ENEMIES.raider;
  const build = BUILDERS[kind] || BUILDERS.raider;
  const built = build(def, quality);
  built.group.name = `enemy-${kind}`;
  built.group.userData = {
    ...built.group.userData,
    kind,
    def,
    engines: built.engines,
    radius: built.radius,
    materials: built.materials,
    glowMats: [built.materials.glow, built.materials.glowSoft],
  };
  return built.group;
}

/** A glowing shield bubble used when hits land. */
export function shieldBubble(radius, color = '#59e0ff') {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.0, side: THREE.BackSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20), mat);
  return mesh;
}
