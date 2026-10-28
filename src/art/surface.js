/**
 * Planetary surfaces — the ground you land on.
 *
 * Everything here is deterministic from a planet's seed, so the same world looks
 * the same every time you set down on it, and two players with the same save see
 * the same valley. No textures are fetched: the terrain is a displaced grid with
 * vertex colours, the rocks and plants are primitives, and the sky is a dome.
 *
 * Shapes are deliberately simple because they are seen from a walking distance,
 * where silhouette and colour do the work and a 4k normal map would not.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ noise */
/** Deterministic 0..1 hash of an integer lattice point. */
export function hash2(x, z, seed = 0) {
  let h = x * 374761393 + z * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Value noise over a square lattice, smoothly interpolated. */
export function noise2(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** Fractal sum of value noise, returns roughly 0..1. */
export function fbm(x, z, seed = 0, octaves = 4, gain = 0.5, lacunarity = 2) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/* ------------------------------------------------------------- biome looks */
export const BIOMES = {
  m: {
    ground: [0x4a7a3c, 0x6f9a4a, 0x8c9a55], rock: 0x6b6f63, dust: 0x9fbf7a,
    skyTop: 0x2f6fb0, skyBottom: 0xa8d8f0, sun: 0xfff3d6, fog: 0x9ec8e0,
    water: 0x2a5f8f, waterLevel: -0.6, tree: 'conifer', grass: true,
  },
  ocean: {
    ground: [0x2f6f52, 0x3f8f6a, 0x6f9f86], rock: 0x5f6f6f, dust: 0x9fd8e8,
    skyTop: 0x2a6fa8, skyBottom: 0xbcdff0, sun: 0xfff6e2, fog: 0xa8d4e8,
    water: 0x1f5f96, waterLevel: 0.4, tree: 'palm', grass: true,
  },
  desert: {
    ground: [0xb0743a, 0xd8a76a, 0xc08a52], rock: 0x8a5c33, dust: 0xe8cba0,
    skyTop: 0x7a5fa0, skyBottom: 0xf0c890, sun: 0xffe0a0, fog: 0xd8b483,
    water: 0x2a6f7a, waterLevel: -2.4, tree: 'rock', grass: false,
  },
  ice: {
    ground: [0xa8c8dc, 0xd8e8f2, 0xecf4fa], rock: 0x7f97a8, dust: 0xffffff,
    skyTop: 0x6f9fc8, skyBottom: 0xe0f0fa, sun: 0xdceaff, fog: 0xd0e4f0,
    water: 0x4f8fb0, waterLevel: -0.4, tree: 'spike', grass: false,
  },
  volcanic: {
    ground: [0x3a2a28, 0x5a3a30, 0x6f4436], rock: 0x2a1f1e, dust: 0x8a5a44,
    skyTop: 0x4a1f1f, skyBottom: 0xc0603a, sun: 0xff9a5a, fog: 0x8a4632,
    water: 0xff5a1e, waterLevel: -1.6, tree: 'spike', grass: false,
  },
  barren: {
    ground: [0x6f6f6a, 0x8a8a82, 0x9a9a92], rock: 0x55554f, dust: 0xb0b0a8,
    skyTop: 0x101826, skyBottom: 0x40506a, sun: 0xffffff, fog: 0x2a3446,
    water: 0x30404f, waterLevel: -3, tree: 'rock', grass: false,
  },
  gas: {
    ground: [0x8a7fa8, 0xa89ac0, 0xc0b0d0], rock: 0x6a6088, dust: 0xd8cce8,
    skyTop: 0x3a2a5a, skyBottom: 0xb090d0, sun: 0xffe8ff, fog: 0xa08ac0,
    water: 0x7a6a9a, waterLevel: -2, tree: 'none', grass: false,
  },
};

export const biomeFor = (typeId) => BIOMES[typeId] || BIOMES.barren;

/** Can you actually stand on it? Gas giants you orbit, not visit. */
export function isLandable(typeId) {
  return typeId !== 'gas';
}

/** Terrain radius kept flat for the landing pad, and the ramp to full relief. */
export const PAD_RADIUS = 17;
export const PAD_BLEND = 30;
/**
 * The landing site sits on a low rise. Without it an ocean world's sea plane
 * (which is 0.4 u above the pad) would flood the hull, and on wet worlds the
 * first steps off the pad would be under water.
 */
export const MESA = 2.6;

/**
 * Ground height at a point. The pad is levelled so a hull can sit on it.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} seed
 * @param {{ relief?: number }} [opts]
 */
export function heightAt(x, z, seed = 1, { relief = 1 } = {}) {
  const h = (fbm(x * 0.035, z * 0.035, seed, 5) - 0.5) * 7.5 * relief
    + (fbm(x * 0.12, z * 0.12, seed + 77, 3) - 0.5) * 1.6 * relief;
  const d = Math.hypot(x, z);
  const flat = d <= PAD_RADIUS ? 0 : Math.min(1, (d - PAD_RADIUS) / (PAD_BLEND - PAD_RADIUS));
  const f = smooth(flat);
  // a gentle table of land around the pad, fading back into the wilds by 150 u
  const mesa = MESA * f * (1 - smooth(Math.min(1, Math.max(0, (d - PAD_BLEND) / 120))));
  return h * f + mesa;
}

/**
 * Ground mesh: a displaced, vertex-coloured grid centred on the pad.
 * @returns {THREE.Mesh}
 */
export function buildTerrain({ seed = 1, type = 'm', size = 320, segments = 110, relief = 1 } = {}) {
  const biome = biomeFor(type);
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const palette = biome.ground.map((hex) => new THREE.Color(hex));
  const rock = new THREE.Color(biome.rock);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z, seed, { relief });
    pos.setY(i, y);

    // slope decides how much bare rock shows through
    const dx = heightAt(x + 1.5, z, seed, { relief }) - y;
    const dz = heightAt(x, z + 1.5, seed, { relief }) - y;
    const slope = Math.min(1, Math.hypot(dx, dz) * 1.6);
    const patch = fbm(x * 0.06, z * 0.06, seed + 13, 2);

    c.copy(palette[0]).lerp(palette[1], patch).lerp(palette[2], Math.max(0, y / 9));
    c.lerp(rock, slope * 0.75);
    // a little per-vertex grain so large flat areas are not dead colour
    const grain = 0.9 + hash2(Math.round(x * 3), Math.round(z * 3), seed) * 0.2;
    colours[i * 3] = c.r * grain;
    colours[i * 3 + 1] = c.g * grain;
    colours[i * 3 + 2] = c.b * grain;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.name = 'terrain';
  return mesh;
}

/** A sky dome with a vertical gradient, plus a matching fog colour. */
export function buildSky({ type = 'm' } = {}) {
  const biome = biomeFor(type);
  const geo = new THREE.SphereGeometry(1400, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(biome.skyTop) },
      bottom: { value: new THREE.Color(biome.skyBottom) },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vH = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying float vH;
      void main() {
        float t = clamp(vH * 1.35 + 0.28, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  return sky;
}

/* ----------------------------------------------------------------- props */
function conifer(rng, biome) {
  const g = new THREE.Group();
  const trunkH = 1.1 + rng() * 0.9;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, trunkH, 5),
    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
  );
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const needle = new THREE.MeshStandardMaterial({ color: biome.ground[0], roughness: 1, metalness: 0 });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85 - i * 0.2, 1.5, 7), needle);
    cone.position.y = trunkH + i * 0.62;
    g.add(cone);
  }
  return g;
}

function palm(rng, biome) {
  const g = new THREE.Group();
  const h = 1.6 + rng() * 1.2;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.15, h, 5),
    new THREE.MeshStandardMaterial({ color: 0x7a6242, roughness: 1 }),
  );
  trunk.position.y = h / 2;
  trunk.rotation.z = (rng() - 0.5) * 0.28;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: biome.ground[1], roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.7, 4), leaf);
    frond.position.y = h;
    frond.rotation.z = 1.1;
    frond.rotation.y = (i / 5) * Math.PI * 2;
    frond.position.x = Math.cos(frond.rotation.y) * 0.5;
    frond.position.z = Math.sin(frond.rotation.y) * 0.5;
    g.add(frond);
  }
  return g;
}

function spike(rng, biome) {
  const g = new THREE.Group();
  const h = 0.9 + rng() * 2.6;
  const mat = new THREE.MeshStandardMaterial({
    color: biome.ground[1], roughness: 0.35, metalness: 0.15,
    emissive: new THREE.Color(biome.water), emissiveIntensity: 0.14,
  });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.18 + rng() * 0.16, h * (0.6 + rng() * 0.6), 5), mat);
    c.position.set((rng() - 0.5) * 0.7, c.geometry.parameters.height / 2, (rng() - 0.5) * 0.7);
    c.rotation.z = (rng() - 0.5) * 0.25;
    g.add(c);
  }
  return g;
}

/** Rocks, plants and crystals scattered around the pad. */
export function buildScatter({
  seed = 1, type = 'm', count = 70, radius = 120, relief = 1, rng = mulberry(seed),
} = {}) {
  const biome = biomeFor(type);
  const group = new THREE.Group();
  group.name = 'scatter';

  const rockMat = new THREE.MeshStandardMaterial({ color: biome.rock, roughness: 0.95, metalness: 0.03 });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockCount = Math.round(count * 0.55);
  for (let i = 0; i < rockCount; i++) {
    const p = ringPoint(rng, radius);
    const r = 0.35 + rng() * 1.7;
    const m = new THREE.Mesh(rockGeo, rockMat);
    m.position.set(p.x, heightAt(p.x, p.z, seed, { relief }) + r * 0.35, p.z);
    m.scale.set(r, r * (0.6 + rng() * 0.5), r);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    group.add(m);
  }

  if (biome.tree !== 'none') {
    const maker = biome.tree === 'conifer' ? conifer : biome.tree === 'palm' ? palm : spike;
    const plantCount = Math.round(count * 0.45);
    for (let i = 0; i < plantCount; i++) {
      const p = ringPoint(rng, radius);
      const g = maker(rng, biome);
      g.position.set(p.x, heightAt(p.x, p.z, seed, { relief }), p.z);
      g.rotation.y = rng() * Math.PI * 2;
      group.add(g);
    }
  }
  return group;
}

/** Points on an annulus, so nothing spawns on top of the landing pad. */
export function ringPoint(rng, radius, inner = PAD_BLEND + 2) {
  const a = rng() * Math.PI * 2;
  const r = inner + rng() * Math.max(1, radius - inner);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Glowing mineral deposits: the thing an away team beams down for. */
export function buildDeposit({ seed = 1, type = 'm', relief = 1, x = 0, z = 0, index = 0 } = {}) {
  const biome = biomeFor(type);
  const g = new THREE.Group();
  const hue = [0x59e0ff, 0x62f2a6, 0xffb347, 0xb47bff][index % 4];
  const mat = new THREE.MeshStandardMaterial({
    color: biome.ground[1], emissive: new THREE.Color(hue), emissiveIntensity: 0.55,
    roughness: 0.25, metalness: 0.6,
  });
  const rng = mulberry(seed + index * 31);
  const base = heightAt(x, z, seed, { relief });
  for (let i = 0; i < 5; i++) {
    const h = 0.5 + rng() * 1.1;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16 + rng() * 0.14, h, 5), mat);
    shard.position.set((rng() - 0.5) * 1.1, base + h / 2, (rng() - 0.5) * 1.1);
    shard.rotation.z = (rng() - 0.5) * 0.5;
    g.add(shard);
  }
  const glow = new THREE.PointLight(hue, 1.6, 9, 1.8);
  glow.position.set(0, base + 1, 0);
  g.add(glow);
  g.userData.kind = 'deposit';
  return g;
}

/* ---------------------------------------------------------------- people */
/**
 * A low-poly humanoid — about 1.8 units tall, standing on y = 0.
 * `role` tints the uniform: crew wear Starfleet grey/black, colonists wear the
 * biome's own colour so they read as belonging to the planet.
 */
export function buildPerson({ role = 'crew', type = 'm', rng = mulberry(1) } = {}) {
  const biome = biomeFor(type);
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc78f6a + (Math.floor(rng() * 3) * 0x0a0806), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({
    color: role === 'crew' ? 0x2a3440 : role === 'colonist' ? biome.ground[1] : 0x4a4238,
    roughness: 0.85,
  });
  const trousers = new THREE.MeshStandardMaterial({ color: role === 'crew' ? 0x1a1f26 : 0x3a3830, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 8), shirt);
  torso.position.y = 1.15;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 2, 6), shirt);
    arm.position.set(side * 0.29, 1.14, 0);
    arm.rotation.z = side * 0.12;
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.5, 2, 6), trousers);
    leg.position.set(side * 0.12, 0.45, 0);
    g.add(leg);
  }

  // tricorder / tool, so the silhouette is not a plain stick figure
  const tool = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.16, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x22282f, emissive: 0x59e0ff, emissiveIntensity: 0.5 }),
  );
  tool.position.set(0.28, 1.0, 0.12);
  g.add(tool);

  g.userData.parts = { torso, head };
  return g;
}

/* --------------------------------------------------------------- helpers */
/** Small seeded PRNG (mulberry32) — deterministic props per planet. */
export function mulberry(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
