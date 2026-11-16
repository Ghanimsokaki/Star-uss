import * as THREE from 'three';
import { bodyLathe, roundedBox, extrudeProfile, greeble, bakeStaticMeshes } from './ships3d.js';
import { hullTextures, glowTexture } from './textures.js';
import { ENEMIES } from '../data/enemies.js';

function materials(def, quality = 1) {
  const tex = hullTextures(['void', 'voidlord', 'wraith'].includes(def.id) ? 'section31' : 'starfleet', quality > 0.6 ? 1 : 0);
  // the colour tables are paint swatches; under a real star the plating reads
  // lighter, so lift each colour's lightness (keeping its hue) for the hull
  const lift = (hex, k, min) => {
    const c = new THREE.Color(hex);
    const hsl = c.getHSL({});
    return c.setHSL(hsl.h, hsl.s, Math.min(0.62, Math.max(min, hsl.l * k)));
  };
  const dark = ['void', 'voidlord', 'wraith'].includes(def.id);
  const hull = new THREE.MeshStandardMaterial({
    color: dark ? lift(def.colors.hull, 1.5, 0.12) : lift(def.colors.hull, 1.7, 0.34),
    map: tex.map,
    roughnessMap: tex.roughnessMap,
    bumpMap: tex.bumpMap,
    bumpScale: 0.02,
    metalness: dark ? 0.9 : 0.42,
    roughness: dark ? 0.26 : def.id === 'cube' ? 0.6 : 0.46,
    envMapIntensity: dark ? 1.6 : 1.1,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: dark ? lift(def.colors.trim, 1.5, 0.08) : lift(def.colors.trim, 1.8, 0.2),
    metalness: 0.7,
    roughness: 0.38,
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
    g.userData.rings = g.userData.rings || [];
    g.userData.rings.push(ring);
  }
  return { group: g, engines: [{ pos: new THREE.Vector3(0, 0, -6) }], radius: 9, materials: m, spin: 0.02 };
}

/* ---------------------------------------------------------------- new contacts */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const place = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => { mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); return mesh; };

/** Orion Interceptor: a slim green dart with two pods and big engines. */
function buildOrion(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  g.add(place(new THREE.Mesh(bodyLathe(2.4, 0.3, { segments: 24, front: 0.35, back: 0.6 }), m.hull), 0, 0, 0.1));
  for (const sx of [-1, 1]) {
    g.add(place(new THREE.Mesh(extrudeProfile([[0, 0.25], [0.9, -0.05], [0.95, -0.35], [0.1, -0.2]], 0.08, 0.03), m.trim), sx * 0.25, 0, -0.1, 0, 0, sx * -0.18));
    const pod = place(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.1, 4, 10), m.hull), sx * 1.15, -0.08, -0.25, Math.PI / 2);
    g.add(pod);
    g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), m.glow), sx * 1.15, -0.08, -0.95, 0, Math.PI));
  }
  const canopy = place(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), m.glowSoft), 0, 0.2, 0.75);
  canopy.scale.set(1, 0.55, 1.8);
  g.add(canopy);
  g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), m.glow), 0, 0, -1.1));
  greeble(g, m.trim, 8, [1.0, 0.3, 1.4]);
  return { group: g, engines: [{ pos: V3(-1.15, -0.08, -1.0) }, { pos: V3(1.15, -0.08, -1.0) }, { pos: V3(0, 0, -1.15) }], radius: 1.8, materials: m };
}

/** Vor'cha: a long neck with a heavy disruptor head, swept wings and low nacelles. */
function buildVorcha(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  // aft body
  g.add(place(new THREE.Mesh(roundedBox(2.4, 0.6, 2.2, 0.2), m.hull), 0, 0, -1.4));
  for (const sx of [-1, 1]) {
    g.add(place(new THREE.Mesh(extrudeProfile([[0, 0.6], [2.2, 0.0], [2.4, -0.9], [0, -1.0]], 0.18, 0.05), m.hull), sx * 0.9, -0.05, -1.1, 0, 0, sx * -0.08));
    const nac = place(new THREE.Mesh(bodyLathe(2.6, 0.24, { segments: 18, front: 0.6, back: 0.6 }), m.trim), sx * 2.7, -0.45, -1.6);
    g.add(nac);
    g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 2.0), m.glow), sx * 2.7, -0.2, -1.6));
    // wingtip disruptors
    g.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 8), m.trim), sx * 3.2, -0.3, -0.5, Math.PI / 2));
  }
  // the neck and the head
  g.add(place(new THREE.Mesh(roundedBox(0.55, 0.42, 2.6, 0.12), m.hull), 0, 0.1, 1.1, -0.06));
  const head = place(new THREE.Mesh(bodyLathe(1.5, 0.55, { segments: 22, front: 0.7, back: 0.5 }), m.hull), 0, 0.18, 2.9);
  head.scale.set(1.2, 1, 0.7);
  g.add(head);
  g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), m.glow), 0, 0.12, 3.68));
  g.add(place(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.1), m.glow), 0, 0.05, -2.52));
  greeble(g, m.trim, 22, [2.6, 0.5, 4.2]);
  return { group: g, engines: [{ pos: V3(0, 0.05, -2.6) }], radius: 3.8, materials: m };
}

/** Jem'Hadar Attack Ship: a beetle with forward prongs and a purple glow. */
function buildJemhadar(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  const shell = place(new THREE.Mesh(new THREE.SphereGeometry(1.2, 28, 16), m.hull), 0, 0, -0.2);
  shell.scale.set(1.25, 0.42, 1.55);
  g.add(shell);
  // ridged back plates
  for (let i = 0; i < 5; i++) {
    const r = place(new THREE.Mesh(new THREE.TorusGeometry(0.9 - i * 0.08, 0.04, 6, 30, Math.PI), m.trim), 0, 0.2, -1.2 + i * 0.45, 0, 0, 0);
    r.scale.set(1.3, 0.55, 1);
    g.add(r);
  }
  for (const sx of [-1, 1]) {
    // forward prongs
    const prong = place(new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.9, 8), m.hull), sx * 0.75, -0.05, 1.7, Math.PI / 2, 0, sx * 0.05);
    g.add(prong);
    g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.2), m.glow), sx * 0.75, 0.06, 1.4));
    // side engine pods with purple glow
    g.add(place(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.2, 4, 10), m.trim), sx * 1.5, -0.1, -0.5, Math.PI / 2));
    g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 1.1), m.glow), sx * 1.72, -0.1, -0.5));
  }
  g.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), m.glowSoft), 0, -0.05, 1.3));
  g.add(place(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.1), m.glow), 0, 0, -2.05));
  greeble(g, m.trim, 14, [1.4, 0.35, 1.6]);
  return { group: g, engines: [{ pos: V3(0, 0, -2.1) }], radius: 2.4, materials: m };
}

/** Hirogen Venatic Hunter: a long angular hull that splits into a fork at the front. */
function buildHunter(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  g.add(place(new THREE.Mesh(roundedBox(1.3, 0.7, 4.2, 0.15), m.hull), 0, 0, -1.2));
  for (const sx of [-1, 1]) {
    // the fork
    g.add(place(new THREE.Mesh(roundedBox(0.45, 0.5, 3.4, 0.1), m.hull), sx * 0.75, 0, 2.2, 0, sx * -0.08));
    g.add(place(new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 4), m.trim), sx * 0.9, 0, 4.1, Math.PI / 2, 0, Math.PI / 4));
    g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 2.4), m.glow), sx * 1.0, 0.1, 2.2));
    // angular side plates and engines
    g.add(place(new THREE.Mesh(extrudeProfile([[0, 0.4], [1.6, 0.1], [1.7, -0.4], [0, -0.35]], 0.12, 0.04), m.trim), sx * 0.6, 0, -2.2, 0, 0, sx * -0.25));
    g.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.4, 8), m.trim), sx * 1.4, -0.25, -3.0, Math.PI / 2));
    g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.26, 10), m.glow), sx * 1.4, -0.25, -3.72, 0, Math.PI));
  }
  g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.3), m.glowSoft), 0, 0.38, 0.6));
  greeble(g, m.trim, 24, [1.2, 0.5, 3.6]);
  return { group: g, engines: [{ pos: V3(-1.4, -0.25, -3.8) }, { pos: V3(1.4, -0.25, -3.8) }], radius: 4.2, materials: m };
}

/** Borg Sphere: a greebled ball, cut with green circuitry. */
function buildSphere(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  const R = 3.2;
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 3), m.hull));
  const n = 70;
  for (let i = 0; i < n; i++) {
    // even spread over the surface (golden spiral)
    const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
    const dir = V3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.9, 0.3 + Math.random() * 0.7, 0.2), i % 5 ? m.trim : m.hull);
    box.position.copy(dir).multiplyScalar(R + 0.06);
    box.lookAt(dir.clone().multiplyScalar(10));
    g.add(box);
  }
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.035, 4, 64), m.glow);
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    g.add(ring);
  }
  g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), m.glowSoft), 0, 0, R + 0.1));
  return { group: g, engines: [], radius: 3.6, materials: m, spin: 0.08 };
}

/** Void Wraith: a crescent blade of black glass with a burning edge. */
function buildWraith(def, quality) {
  const m = materials(def, quality);
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.32, 8, 40, Math.PI * 1.2), m.hull);
  blade.rotation.set(Math.PI / 2, 0, Math.PI * 0.4 + Math.PI / 2);
  blade.scale.set(1, 1, 0.45);
  g.add(blade);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.05, 4, 40, Math.PI * 1.2), m.glow);
  edge.rotation.copy(blade.rotation);
  g.add(edge);
  const core = place(new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), m.hull), 0, 0, -1.2);
  core.scale.set(1, 0.6, 1.6);
  g.add(core);
  const heart = place(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), m.glowSoft), 0, 0, -1.2);
  heart.scale.set(1, 0.6, 1.6);
  g.add(heart);
  for (const sx of [-1, 1]) g.add(place(new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.6, 4), m.hull), sx * 0.7, 0, -2.2, -Math.PI / 2));
  return { group: g, engines: [{ pos: V3(0, 0, -2.4) }], radius: 2.6, materials: m };
}

const BUILDERS = {
  raider: buildRaider, bop: buildBop, galor: buildGalor, warbird: buildWarbird, cube: buildCube, void: buildVoid, voidlord: buildVoidlord,
  orion: buildOrion, vorcha: buildVorcha, jemhadar: buildJemhadar, hunter: buildHunter, sphere: buildSphere, wraith: buildWraith,
};

/* ------------------------------------------------------------ realism details */
/** Window light colour per hull: warm cabin light, tinted toward each faction. */
const WINDOW_TINT = { orion: '#c8ffa0', vorcha: '#ff9a5a', jemhadar: '#d6b8ff', hunter: '#ffb08a', sphere: '#7dff9a', wraith: '#e0a6ff', raider: '#ffd9a0', bop: '#ff9a5a', galor: '#ffd27a', warbird: '#9dffb8', cube: '#7dff9a', void: '#c9a6ff', voidlord: '#c9a6ff' };

const spotCache = new Map();
/**
 * Find places on the outer hull to put lit windows: cast rays at the model
 * from all around and keep the hits on hull plating. Cached per ship kind,
 * so it only runs once for each kind of enemy.
 */
function windowSpots(kind, group, hullMats, count, rng) {
  if (spotCache.has(kind)) return spotCache.get(kind);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const reach = size.length();
  const targets = [];
  group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && hullMats.has(o.material)) targets.push(o); });
  const ray = new THREE.Raycaster();
  const spots = [];
  const n = new THREE.Vector3();
  for (let tries = 0; tries < count * 5 && spots.length < count; tries++) {
    // mostly from the sides and above, where real ships have their decks
    const a = rng() * Math.PI * 2;
    const elev = (rng() - 0.35) * 1.1;
    const dir = new THREE.Vector3(Math.cos(a), elev, Math.sin(a)).normalize();
    const along = (rng() - 0.5) * size.z * 0.8;
    const from = center.clone().addScaledVector(dir, reach);
    from.z += along;
    const to = center.clone(); to.z += along; to.y += (rng() - 0.5) * size.y * 0.3;
    ray.set(from, to.sub(from).normalize());
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit?.face) continue;
    n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    if (Math.abs(n.y) > 0.8) continue;            // windows look out sideways, not up
    spots.push({ p: hit.point.clone().addScaledVector(n, 0.012), n: n.clone() });
  }
  spotCache.set(kind, spots);
  return spots;
}

function addWindows(kind, group, m, def, quality) {
  if (quality < 0.45) return null;
  const rng = (() => { let h = 0; for (const c of kind) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const spots = windowSpots(kind, group, new Set([m.hull, m.trim]), kind === 'cube' ? 90 : kind === 'voidlord' ? 70 : 46, rng);
  if (!spots.length) return null;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(WINDOW_TINT[kind] || '#ffd9a0').multiplyScalar(1.15), toneMapped: false });
  const geo = new THREE.PlaneGeometry(0.075, 0.035);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const o = new THREE.Object3D();
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  spots.forEach((s, i) => {
    o.position.copy(s.p).applyMatrix4(inv);
    o.lookAt(o.position.clone().add(s.n));
    o.scale.setScalar(0.8 + rng() * 0.6);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'windows';
  group.add(mesh);
  return mat;
}

/**
 * Navigation lights like a real spacecraft: red to port, green to
 * starboard, and a white anti-collision strobe on top that blinks.
 */
function addNavLights(group, radius) {
  const box = new THREE.Box3().setFromObject(group);
  const lights = [];
  const make = (color, x, y, z, size, strobe) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(color), color: new THREE.Color(color).multiplyScalar(1.6), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    s.userData = { base: size, strobe, phase: Math.random() * 3 };
    group.add(s);
    lights.push(s);
  };
  const r = Math.max(0.3, radius * 0.12);
  make('#ff3b30', box.min.x * 0.96, (box.min.y + box.max.y) / 2, box.min.z * 0.15, r, false);
  make('#34ff6a', box.max.x * 0.96, (box.min.y + box.max.y) / 2, box.min.z * 0.15, r, false);
  make('#ffffff', 0, box.max.y * 0.98, box.min.z * 0.6, r * 1.3, true);
  return lights;
}

/** Blink the nav lights. Call every frame with the scene time. */
export function updateNavLights(group, t) {
  for (const s of group.userData.navLights || []) {
    const { base, strobe, phase } = s.userData;
    const on = strobe ? ((t + phase) % 1.4) < 0.09 : 0.75 + 0.25 * Math.sin((t + phase) * 2);
    s.scale.setScalar(base * (strobe ? (on ? 2.4 : 0.001) : on));
  }
}

export function buildEnemy(kind, quality = 1) {
  const def = ENEMIES[kind] || ENEMIES.raider;
  const build = BUILDERS[kind] || BUILDERS.raider;
  const built = build(def, quality);
  const group = built.group;
  // the voidlord's rings and spinning parts stay separate so they can move
  for (const r of group.userData.rings || []) r.userData.keep = true;
  if (built.ring) built.ring.userData.keep = true;
  bakeStaticMeshes(group);
  const windowMat = addWindows(kind, group, built.materials, def, quality);
  const navLights = addNavLights(group, built.radius);
  group.name = `enemy-${kind}`;
  group.userData = {
    ...group.userData,
    kind,
    def,
    engines: built.engines,
    radius: built.radius,
    materials: built.materials,
    glowMats: [built.materials.glow, built.materials.glowSoft, windowMat].filter(Boolean),
    navLights,
    spin: built.spin || 0,
  };
  return group;
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
