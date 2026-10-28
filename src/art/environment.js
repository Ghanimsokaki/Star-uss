import * as THREE from 'three';
import { nebulaTexture, environmentTexture, starSpriteTexture, glowTexture, planetTexture, cloudTexture, ringTexture, starfield } from './textures.js';
import { disposeObject3D } from './ships3d.js';

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

export function makeSky(seed = 1, radius = 60000) {
  const tex = nebulaTexture(seed);
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false, color: new THREE.Color(0.85, 0.9, 1) });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'sky';
  m.frustumCulled = false;
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
  // atmosphere rim
  if (['m', 'ocean', 'ice', 'toxic', 'gas'].includes(typeId)) {
    const atmoColor = { m: '#6fb5ff', ocean: '#78d0ff', ice: '#bfe9ff', toxic: '#c8e05a', gas: '#ffcf9a' }[typeId];
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.055, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(atmoColor) } },
        vertexShader: `varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0);
          vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
          void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 3.0);
          gl_FragColor = vec4(uColor * f * 1.6, f * 0.9); }`,
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
