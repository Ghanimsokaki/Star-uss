/**
 * Physically based skies and water for planet surfaces.
 *
 * The sky is three.js's Sky (the Preetham daylight model): it scatters
 * sunlight through air the way real atmospheres do — deep blue overhead,
 * pale at the horizon, warm around a low sun. The same sky is baked into an
 * environment map, so the ground, the ship and the water are lit by it.
 *
 * Water is a glossy surface with a procedurally generated, scrolling wave
 * normal map; it reflects that sky.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/** Air for each world type: haze (turbidity), blue scatter (rayleigh), sun glow (mie). */
export const AIR = {
  m: { turbidity: 2.6, rayleigh: 1.6, mie: 0.004, g: 0.82, clouds: 0.4 },
  ocean: { turbidity: 2.2, rayleigh: 2.0, mie: 0.004, g: 0.8, clouds: 0.55 },
  ice: { turbidity: 1.4, rayleigh: 0.9, mie: 0.003, g: 0.86, clouds: 0.2 },
  desert: { turbidity: 5, rayleigh: 0.8, mie: 0.006, g: 0.86, clouds: 0.05 },   // dusty, pale, Mars-like
};
export const hasRealSky = (type) => !!AIR[type];

/**
 * The Preetham model outputs physical radiance meant for a camera exposure
 * around 0.3–0.5; the game renders at ~1.1 with bloom, so the raw sky would
 * glare white over everything. This brings it into the game's range.
 */
export const SKY_EXPOSURE = 0.1;

export function makeRealSky(type, sunDir, size = 4000) {
  const air = AIR[type] || AIR.m;
  const sky = new Sky();
  sky.scale.setScalar(size);
  const u = sky.material.uniforms;
  u.turbidity.value = air.turbidity;
  u.rayleigh.value = air.rayleigh;
  u.mieCoefficient.value = air.mie;
  u.mieDirectionalG.value = air.g;
  u.sunPosition.value.copy(sunDir).normalize();
  if ('cloudCoverage' in u) u.cloudCoverage.value = air.clouds ?? 0.35;
  // per-sky exposure: scale the radiance before tone mapping
  u.uExposure = { value: SKY_EXPOSURE };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main()', 'uniform float uExposure;\nvoid main()')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uExposure, 1.0 );');
  sky.material.needsUpdate = true;
  sky.name = 'real-sky';
  return sky;
}

/**
 * Bake a sky into an image-based-lighting environment.
 * @returns {THREE.WebGLRenderTarget} keep it to dispose later
 */
export function skyEnvironment(renderer, type, sunDir) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tmp = new THREE.Scene();
  tmp.add(makeRealSky(type, sunDir, 1000));
  const rt = pmrem.fromScene(tmp, 0, 0.1, 2000);
  pmrem.dispose();
  tmp.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return rt;
}

/** A tiling normal map of soft, overlapping waves (no image files needed). */
export function waterNormals(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const waves = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i;
    const k = (2 + (i % 4) * 2) * Math.PI * 2 / size;   // integer cycles per tile → seamless
    // whole-number cycles across the tile in x and y keep the texture seamless
    waves.push({ dx: Math.round(Math.cos(a) * 3) * k, dy: Math.round(Math.sin(a) * 3) * k, amp: 1 / (1 + i * 0.35), ph: i * 1.7 });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = 0, ny = 0;
      for (const w of waves) {
        const d = Math.cos(x * w.dx + y * w.dy + w.ph) * w.amp;
        nx += d * w.dx; ny += d * w.dy;
      }
      const s = 9;
      let vx = -nx * s, vy = -ny * s, vz = 1;
      const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (vx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (vy * 0.5 + 0.5) * 255;
      img.data[i + 2] = (vz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
