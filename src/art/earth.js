import * as THREE from 'three';
import { DISTRICTS } from '../data/tech.js';
import { glowTexture, starSpriteTexture } from './textures.js';

const DEG = Math.PI / 180;
export const EARTH_RADIUS = 10;

export function latLonToVec3(lat, lon, r = EARTH_RADIUS) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

export function vec3ToLatLon(v) {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG;
  const theta = Math.atan2(n.z, -n.x);
  let lon = theta / DEG - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

function loadTex(url, srgb = true) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        resolve(t);
      },
      undefined,
      () => resolve(null)
    );
  });
}

/** A photoreal Earth: day/night terminator, ocean specular, city lights, clouds, atmosphere. */
export class EarthGlobe {
  constructor(quality = 1) {
    this.group = new THREE.Group();
    this.quality = quality;
    this.markers = new Map();
    this.radius = EARTH_RADIUS;
    this.sunDir = new THREE.Vector3(1, 0.32, 0.55).normalize();
    this.ready = false;
    this._buildBase();
    this._load();
  }

  _buildBase() {
    this.tilt = new THREE.Group();
    this.tilt.rotation.z = 23.4 * DEG;
    this.group.add(this.tilt);

    // placeholder (visible until textures load)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: null },
        uNight: { value: null },
        uWater: { value: null },
        uSunDir: { value: this.sunDir },
        uHasTex: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position,1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uWater;
        uniform vec3 uSunDir; uniform float uHasTex;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          vec3 L = normalize(uSunDir);
          float sun = dot(N, L);
          float dayAmount = smoothstep(-0.14, 0.3, sun);
          vec3 dayCol = mix(vec3(0.05,0.12,0.25), vec3(0.2,0.45,0.3), smoothstep(0.3,0.6,vUv.y));
          vec3 nightCol = vec3(0.0);
          float water = 0.0;
          if (uHasTex > 0.5) {
            dayCol = texture2D(uDay, vUv).rgb;
            nightCol = texture2D(uNight, vUv).rgb;
            water = texture2D(uWater, vUv).r;
          }
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 80.0) * water * 1.7;
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.4);
          vec3 lit = dayCol * (0.18 + 1.15 * max(sun, 0.0));
          vec3 night = nightCol * (1.0 - dayAmount) * 1.9 + vec3(0.004, 0.012, 0.03);
          vec3 col = mix(night, lit + vec3(0.85,0.95,1.0) * spec, dayAmount);
          col += vec3(0.12,0.4,1.0) * fres * (0.18 + dayAmount * 1.15);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, this.quality > 0.6 ? 128 : 72, this.quality > 0.6 ? 96 : 48),
      this.material
    );
    this.tilt.add(this.earth);

    // clouds
    this.cloudMat = new THREE.MeshStandardMaterial({
      transparent: true, opacity: 0.55, depthWrite: false, roughness: 1, metalness: 0,
      color: 0xffffff, alphaMap: null,
    });
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.012, this.quality > 0.6 ? 96 : 56, this.quality > 0.6 ? 64 : 36),
      this.cloudMat
    );
    this.tilt.add(this.clouds);

    // atmosphere shell
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.055, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: { value: this.sunDir },
          uColor: { value: new THREE.Color('#4aa8ff') },
        },
        vertexShader: `varying vec3 vN; varying vec3 vW;
          void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform vec3 uSunDir; uniform vec3 uColor; varying vec3 vN; varying vec3 vW;
          void main(){
            vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
            float rim = pow(1.0 - abs(dot(N, V)), 3.6);
            float sun = smoothstep(-0.55, 0.6, dot(-N, normalize(uSunDir)));
            float a = rim * (0.2 + 0.95 * sun);
            gl_FragColor = vec4(uColor * (0.9 + sun * 1.4), a * 0.85);
          }`,
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
      })
    );
    this.group.add(this.atmo);

    // graticule of orbital infrastructure (subtle wireframe sphere)
    const grid = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(this.radius * 1.14, 3)),
      new THREE.LineBasicMaterial({ color: 0x2b6f96, transparent: true, opacity: 0.08 })
    );
    this.group.add(grid);
    this.grid = grid;

    this.markerLayer = new THREE.Group();
    this.tilt.add(this.markerLayer);
  }

  async _load() {
    const [day, night, water, clouds] = await Promise.all([
      loadTex('/assets/earth/earth-day.jpg', true),
      loadTex('/assets/earth/earth-night.jpg', true),
      loadTex('/assets/earth/earth-water.jpg', false),
      loadTex('/assets/earth/earth-clouds.jpg', true),
    ]);
    if (day) {
      this.material.uniforms.uDay.value = day;
      this.material.uniforms.uNight.value = night || day;
      this.material.uniforms.uWater.value = water || day;
      this.material.uniforms.uHasTex.value = 1;
    }
    if (clouds) {
      this.cloudMat.alphaMap = clouds;
      this.cloudMat.map = clouds;
      this.cloudMat.transparent = true;
      this.cloudMat.opacity = 0.42;
      this.cloudMat.needsUpdate = true;
    }
    this.ready = true;
  }

  update(dt, elapsed) {
    this.earth.rotation.y += dt * 0.012;
    this.clouds.rotation.y += dt * 0.016;
    this.markerLayer.rotation.y += dt * 0.012;
    if (this.grid) this.grid.rotation.y -= dt * 0.004;
    if (this.clouds.material && this.ready) this.clouds.material.needsUpdate = true;
  }

  /* ---------------------------------------------------------- districts */
  markerGroup(district) {
    return this.markers.get(district.id) || null;
  }

  addDistrict(district) {
    if (this.markers.has(district.id)) return this.markers.get(district.id);
    const def = DISTRICTS[district.type] || DISTRICTS.residential;
    const pos = latLonToVec3(district.lat, district.lon, this.radius + 0.05);
    const normal = pos.clone().normalize();
    const g = new THREE.Group();
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    g.userData.districtId = district.id;

    const color = new THREE.Color(def.color);
    const scale = 0.8 + district.level * 0.13;

    // glowing pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 * scale, 0.5 * scale, 0.06, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    pad.position.y = 0.04;
    g.add(pad);

    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55 * scale, 0.62 * scale, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    g.add(ring);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.78 * scale, 0.8 * scale, 40), ringMat.clone());
    ring2.material.opacity = 0.3;
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.07;
    g.add(ring2);

    // city blocks / structures
    const city = new THREE.Group();
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x243342, metalness: 0.6, roughness: 0.4, emissive: color.clone().multiplyScalar(0.35), emissiveIntensity: 1.1 });
    const rng = mulberry(district.id);
    const blocks = 4 + Math.floor(rng() * 5) + district.level;
    for (let i = 0; i < blocks; i++) {
      const h = 0.12 + rng() * 0.3 * scale + district.level * 0.03;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08 + rng() * 0.12, h, 0.08 + rng() * 0.12), cityMat);
      const a = rng() * Math.PI * 2;
      const rr = rng() * 0.3 * scale;
      b.position.set(Math.cos(a) * rr, h / 2 + 0.02, Math.sin(a) * rr);
      b.rotation.y = rng() * Math.PI;
      city.add(b);
    }
    g.add(city);

    // vertical light beam
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.25 * scale, 2.6 * scale, 12, 1, true), beamMat);
    beam.position.y = 1.3 * scale;
    g.add(beam);

    // halo sprite for visibility at distance
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(def.color), color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    halo.scale.setScalar(1.4 * scale);
    halo.position.y = 0.1;
    g.add(halo);

    g.userData.pulse = 0;
    g.userData.ring = ring;
    g.userData.ring2 = ring2;
    g.userData.beam = beam;
    g.userData.halo = halo;
    g.userData.def = def;

    this.markerLayer.add(g);
    this.markers.set(district.id, g);
    return g;
  }

  removeDistrict(id) {
    const g = this.markers.get(id);
    if (!g) return;
    this.markerLayer.remove(g);
    this.markers.delete(id);
  }

  syncDistricts(districts) {
    const ids = new Set(districts.map((d) => d.id));
    for (const id of [...this.markers.keys()]) if (!ids.has(id)) this.removeDistrict(id);
    for (const d of districts) {
      const existing = this.markers.get(d.id);
      if (!existing) this.addDistrict(d);
    }
  }

  animateMarkers(t) {
    for (const g of this.markers.values()) {
      const p = 0.5 + 0.5 * Math.sin(t * 1.6 + (g.userData.districtId.charCodeAt(0) || 0));
      if (g.userData.ring) g.userData.ring.material.opacity = 0.35 + p * 0.5;
      if (g.userData.ring2) g.userData.ring2.material.opacity = 0.1 + p * 0.25;
      if (g.userData.beam) g.userData.beam.material.opacity = 0.12 + p * 0.22;
      if (g.userData.halo) g.userData.halo.material.opacity = 0.35 + p * 0.35;
    }
  }

  setSelected(id) {
    for (const [mid, g] of this.markers) {
      const sel = mid === id;
      g.scale.setScalar(sel ? 1.28 : 1);
      if (g.userData.ring) g.userData.ring.material.color.set(sel ? '#ffffff' : (g.userData.def?.color || '#59e0ff'));
    }
  }

  pickMarker(raycaster) {
    const objs = [...this.markers.values()];
    const hits = raycaster.intersectObjects(objs, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.districtId) o = o.parent;
    return o || null;
  }

  /** Intersect the globe itself. Returns world point or null. */
  pickSurface(raycaster) {
    const hits = raycaster.intersectObject(this.earth, false);
    return hits.length ? hits[0].point.clone() : null;
  }

  /** Convert a world point on the globe into lat/lon, accounting for tilt/rotation. */
  worldToLatLon(point) {
    const local = this.earth.worldToLocal(point.clone());
    return vec3ToLatLon(local);
  }

  districtWorldPosition(lat, lon) {
    const local = latLonToVec3(lat, lon, this.radius + 0.12);
    return this.tilt.localToWorld(local.clone());
  }

  createGhost(lat, lon, color = '#59e0ff') {
    this.removeGhost();
    const g = new THREE.Group();
    const pos = latLonToVec3(lat, lon, this.radius + 0.12);
    const normal = pos.clone().normalize();
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.18, 2.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    pillar.position.y = 1.2;
    g.add(pillar);
    this.markerLayer.add(g);
    this.ghost = g;
    return g;
  }
  removeGhost() {
    if (this.ghost) {
      this.markerLayer.remove(this.ghost);
      this.ghost = null;
    }
  }
  setGhostPulse(t) {
    if (!this.ghost) return;
    this.ghost.rotation.y = t * 1.2;
    this.ghost.scale.setScalar(0.9 + Math.sin(t * 4) * 0.08);
  }

  get sunLight() { return this._sunLight; }
}

function mulberry(seedStr) {
  let a = 0;
  for (let i = 0; i < seedStr.length; i++) a = (a * 31 + seedStr.charCodeAt(i)) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { starSpriteTexture };
