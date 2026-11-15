import * as THREE from 'three';
import { nebulaTexture, environmentTexture, starSpriteTexture, glowTexture, planetTexture, cloudTexture, ringTexture, starfield } from './textures.js';
import { disposeObject3D } from './ships3d.js';
import { device } from '../core/device.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';

let envMap = null;
export function getEnvironment(renderer) {
  if (envMap || !renderer) return envMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const tex = environmentTexture();
  envMap = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  return envMap;
}

export function glowSprite(color = '#ffffff', scale = 4, opacity = 0.8) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(color), color: new THREE.Color(color),
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

/* ------------------------------------------------------- photographic maps
   Planet surfaces and the Milky Way are real imagery from Solar System Scope
   (CC BY 4.0, based on NASA mission data) — see docs/CREDITS.md. They stream
   in after the scene is up; the procedural texture shows until then and stays
   as the fallback if a file is missing. */
const SPACE = '/assets/space/';
const texCache = new Map();
const loader = new THREE.TextureLoader();

/** Load (once) and cache a texture; resolves to null on failure. */
export function spaceTexture(file, { srgb = true } = {}) {
  if (texCache.has(file)) return texCache.get(file);
  const p = new Promise((resolve) => {
    loader.load(SPACE + file, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  texCache.set(file, p);
  return p;
}

/** Which photographic surface suits each planet class (picked by seed). */
export const REAL_SURFACES = {
  desert: [{ f: 'mars.jpg' }],
  volcanic: [{ f: 'venus-surface.jpg', tint: '#ffb48c' }, { f: 'mercury.jpg', tint: '#ff9a70' }],
  barren: [{ f: 'mercury.jpg' }, { f: 'moon.jpg' }, { f: 'ceres.jpg' }],
  gas: [{ f: 'jupiter.jpg' }, { f: 'saturn.jpg', ring: true }, { f: 'neptune.jpg' }, { f: 'uranus.jpg' }],
  toxic: [{ f: 'venus-atmosphere.jpg', tint: '#d8f07a' }],
  ice: [{ f: 'eris.jpg', tint: '#dff2ff' }, { f: 'haumea.jpg', tint: '#e6f6ff' }],
  rogue: [{ f: 'makemake.jpg', tint: '#7d8fb0' }, { f: 'eris.jpg', tint: '#6b7da0' }],
};
export function realSurfaceFor(typeId, seed = 0) {
  const list = REAL_SURFACES[typeId];
  if (!list) return null;
  return list[Math.abs(Math.floor(seed)) % list.length];
}

export function makeSky(seed = 1, radius = 60000, { real = true, hiRes = device.tier !== 'low' && device.form !== 'phone' } = {}) {
  const tex = nebulaTexture(seed);
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false, color: new THREE.Color(0.85, 0.9, 1) });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'sky';
  m.frustumCulled = false;
  if (real) {
    // the real Milky Way; the procedural nebula stays until it arrives
    spaceTexture(hiRes ? 'milky-way-4k.jpg' : 'milky-way-2k.jpg').then((t) => {
      if (!t) return;
      mat.map = t;
      mat.color.setRGB(0.9, 0.92, 1);
      mat.needsUpdate = true;
      m.rotation.set(0.35 + (seed % 5) * 0.2, seed * 0.7, 0.62);
    });
  }
  return m;
}

export function makeStars(count = 2600, radius = 30000) {
  const geo = starfield(count, radius, 1);
  const mat = new THREE.PointsMaterial({
    size: 42, map: starSpriteTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.95, toneMapped: false, fog: false,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

/**
 * A camera lens flare: the bright source plus ghost rings along the line
 * through the screen centre, the way real lenses bounce strong light.
 */
export function addLensFlare(light, color = '#ffd9a0') {
  const flare = new Lensflare();
  const c = new THREE.Color(color);
  flare.addElement(new LensflareElement(glowTexture('#ffffff'), 520, 0, c));
  const ring = glowTexture('#9fc8ff');
  for (const [size, dist, tint] of [[60, 0.35, '#a8d0ff'], [110, 0.55, '#ffd0a0'], [70, 0.75, '#c0a8ff'], [150, 1.0, '#8fd6ff']]) {
    flare.addElement(new LensflareElement(ring, size, dist, new THREE.Color(tint).multiplyScalar(0.35)));
  }
  light.add(flare);
  return flare;
}

export function makeStar({ radius = 60, color = '#ffd9a0', intensity = 2.2, light = true } = {}) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.1), toneMapped: false })
  );
  g.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(color), color: new THREE.Color(color), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  halo.scale.setScalar(radius * 9);
  g.add(halo);
  const halo2 = halo.clone();
  halo2.material = halo.material.clone();
  halo2.material.opacity = 0.22;
  halo2.scale.setScalar(radius * 22);
  g.add(halo2);
  // surface turbulence
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.02, 64, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  g.add(surface);
  if (light) {
    // decay 0: a star lights the whole system evenly at this scale
    const l = new THREE.PointLight(new THREE.Color(color), intensity * 0.62, 0, 0);
    l.position.set(0, 0, 0);
    g.add(l);
    // the camera's view of a star: lens flare (skipped on low-end devices)
    if (device.tier !== 'low') g.userData.flare = addLensFlare(l, color);
  }
  g.userData.core = core;
  g.userData.halo = halo;
  g.userData.radius = radius;
  return g;
}

export function makePlanet({ typeId = 'm', seed = 1, radius = 20, quality = 1, name = '' } = {}) {
  const g = new THREE.Group();
  const tex = planetTexture(typeId, seed, quality);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: typeId === 'ocean' || typeId === 'm' ? 0.62 : 0.95,
    metalness: 0.02, envMapIntensity: 0.22,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, quality > 0.6 ? 72 : 40, quality > 0.6 ? 48 : 28), mat);
  g.add(body);
  g.userData.body = body;

  const real = realSurfaceFor(typeId, seed);
  if (real) {
    spaceTexture(real.f).then((t) => {
      if (!t) return;
      mat.map = t;
      if (real.tint) mat.color.set(real.tint);
      mat.roughness = typeId === 'gas' ? 0.75 : 0.92;
      mat.needsUpdate = true;
    });
    if (real.ring && g.userData.ring) g.userData.useSaturnRing = true;
  }

  if (['m', 'ocean', 'ice', 'toxic'].includes(typeId)) {
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.015, 56, 36),
      new THREE.MeshStandardMaterial({
        map: cloudTexture(seed, quality), transparent: true, opacity: typeId === 'ocean' ? 0.5 : 0.34,
        depthWrite: false, roughness: 1, metalness: 0,
      })
    );
    g.add(clouds);
    g.userData.clouds = clouds;
  }
  // atmosphere: thin shell that scatters sunlight — bright on the day side,
  // reddened where the sun is setting (the terminator), nearly gone at night.
  // uSunDir is world-space, planet → star; scenes update it every frame.
  if (['m', 'ocean', 'ice', 'toxic', 'gas', 'desert', 'volcanic'].includes(typeId)) {
    const atmoColor = { m: '#6fb5ff', ocean: '#78d0ff', ice: '#bfe9ff', toxic: '#c8e05a', gas: '#ffcf9a', desert: '#ffc59a', volcanic: '#ff8a5a' }[typeId];
    const thick = { desert: 0.45, volcanic: 0.6 }[typeId] ?? 1;
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.055, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(atmoColor) },
          uSunset: { value: new THREE.Color('#ff7a3a') },
          uSunDir: { value: new THREE.Vector3(1, 0.2, 0.3).normalize() },
          uThick: { value: thick },
        },
        vertexShader: `varying vec3 vN; varying vec3 vW;
          void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0);
          vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uColor; uniform vec3 uSunset; uniform vec3 uSunDir; uniform float uThick;
          varying vec3 vN; varying vec3 vW;
          void main(){
            vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); vec3 L = normalize(uSunDir);
            float rim = pow(1.0 - abs(dot(N, V)), 2.6);
            float sun = dot(N, L);
            float day = smoothstep(-0.25, 0.35, sun);
            float dusk = exp(-pow(sun * 4.0, 2.0));               // peaks right on the terminator
            float forward = pow(max(dot(-V, L), 0.0), 6.0);       // glow when looking toward the sun through the limb
            vec3 col = mix(uSunset, uColor, smoothstep(-0.05, 0.3, sun)) * (day * 1.5 + dusk * 0.9 + forward * 1.2);
            float a = rim * (0.05 + day * 0.95 + dusk * 0.6) * uThick;
            gl_FragColor = vec4(col * a, a);
          }`,
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
      })
    );
    g.add(atmo);
    g.userData.atmo = atmo;
  }
  if (typeId === 'gas') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.5, radius * 2.5, 96),
      new THREE.MeshBasicMaterial({ map: ringTexture('#d9c7a8'), transparent: true, side: THREE.DoubleSide, opacity: 0.55, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2 + 0.28;
    g.add(ring);
    g.userData.ring = ring;
    const real2 = realSurfaceFor(typeId, seed);
    if (real2?.ring) {
      // Saturn's real ring profile: remap UVs so u runs from inner to outer edge
      const pos = ring.geometry.attributes.position, uv = ring.geometry.attributes.uv;
      const r0 = radius * 1.5, r1 = radius * 2.5;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (r - r0) / (r1 - r0), 0.5);
      }
      uv.needsUpdate = true;
      spaceTexture('saturn-ring.png').then((t) => {
        if (!t) return;
        ring.material.map = t;
        ring.material.opacity = 0.95;
        ring.material.needsUpdate = true;
      });
    } else if (real2) {
      // only Saturn-like giants keep a bright ring; the others get a faint one
      ring.material.opacity = 0.18;
    }
  }
  g.userData.radius = radius;
  g.userData.typeId = typeId;
  g.userData.name = name;
  return g;
}

export function makeAsteroids({ count = 220, inner = 120, outer = 260, quality = 1 } = {}) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 0.95, metalness: 0.08, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, Math.round(count * quality));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < inst.count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = inner + Math.random() * (outer - inner);
    dummy.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 26, Math.sin(a) * r);
    const s = 0.6 + Math.random() * 3.4;
    dummy.scale.set(s, s * (0.6 + Math.random() * 0.7), s);
    dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

export function makeStation({ scale = 1 } = {}) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x8b93a0, metalness: 0.8, roughness: 0.42, emissive: 0x1a2a3a, emissiveIntensity: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: '#59e0ff', toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 2.2, 12, 72), hull);
  g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(18.2, 0.35, 6, 72), glow);
  ring2.rotation.x = Math.PI / 2;
  g.add(ring2);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 26, 16), hull);
  g.add(core);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 16), hull);
    spoke.rotation.y = (i / 6) * Math.PI * 2;
    spoke.position.set(Math.sin((i / 6) * Math.PI * 2) * 9, 0, Math.cos((i / 6) * Math.PI * 2) * 9);
    g.add(spoke);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), glow);
  g.add(light);
  const halo = glowSprite('#59e0ff', 22, 0.5);
  g.add(halo);
  g.scale.setScalar(scale);
  return g;
}

export function addSceneLights(scene, { ambient = 0.35, starPos = [0, 0, 0], color = '#ffd9a0', intensity = 3 } = {}) {
  const amb = new THREE.AmbientLight(0x2a3d55, ambient);
  scene.add(amb);
  const hemi = new THREE.HemisphereLight(0x3c5a80, 0x0a0f18, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(color), intensity);
  sun.position.set(...starPos);
  scene.add(sun);
  return { amb, hemi, sun };
}

export function disposeScene(scene) {
  if (!scene) return;
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
  });
}
