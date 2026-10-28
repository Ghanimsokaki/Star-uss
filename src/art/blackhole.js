import * as THREE from 'three';
import { glowTexture } from './textures.js';

const NOISE = `
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

/**
 * A cinematic stellar-mass black hole:
 * event horizon, photon ring, doppler-beamed turbulent accretion disk, jets and infall.
 */
export class BlackHole {
  constructor({ radius = 40, quality = 1, jets = true } = {}) {
    this.radius = radius;
    this.quality = quality;
    this.group = new THREE.Group();
    this.time = 0;
    this._build(jets);
  }

  _build(jets) {
    const R = this.radius;
    const q = this.quality;

    // ---- event horizon (pure black, occludes the far side of the disk)
    this.horizon = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })
    );
    this.group.add(this.horizon);

    // ---- photon ring
    const photonMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd9a0').multiplyScalar(2.6),
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.photonRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.045, R * 0.018, 8, 160), photonMat);
    this.photonRing.rotation.x = Math.PI / 2;
    this.group.add(this.photonRing);

    const photonHalo = new THREE.Mesh(
      new THREE.RingGeometry(R * 1.05, R * 1.28, 128),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffcf8a'), transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      })
    );
    photonHalo.rotation.x = -Math.PI / 2;
    this.group.add(photonHalo);

    // ---- accretion disk
    const diskGeo = new THREE.RingGeometry(R * 1.35, R * 6.2, q > 0.6 ? 192 : 96, 1);
    this.diskUniforms = {
      uTime: { value: 0 },
      uHot: { value: new THREE.Color('#fff4d6') },
      uMid: { value: new THREE.Color('#ff9a3c') },
      uCool: { value: new THREE.Color('#8a2410') },
      uOpacity: { value: 1 },
    };
    const diskMat = new THREE.ShaderMaterial({
      uniforms: this.diskUniforms,
      vertexShader: `varying vec2 vUv; varying vec3 vPos;
        void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${NOISE}
        uniform float uTime; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool; uniform float uOpacity;
        varying vec2 vUv; varying vec3 vPos;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float ang = atan(p.y, p.x);
          float inner = 1.35 / 6.2;
          if (r < inner - 0.02) discard;
          float swirl = ang * 2.0 - uTime * (2.4 / pow(max(r, 0.12), 0.9)) + log(max(r, 0.01)) * 3.0;
          float n = fbm(vec2(swirl * 1.7, r * 8.0 - uTime * 0.25));
          float n2 = fbm(vec2(swirl * 4.5 + 7.0, r * 22.0));
          float turb = n * 0.62 + n2 * 0.38;
          float radial = smoothstep(1.0, 0.82, r) * smoothstep(inner - 0.02, inner + 0.1, r);
          float doppler = 0.45 + 0.85 * smoothstep(-0.2, 1.0, sin(ang + 0.5));
          float em = radial * (0.18 + turb * 2.0) * doppler;
          em += smoothstep(inner + 0.12, inner, r) * 1.9;
          vec3 col = mix(uCool, uMid, smoothstep(1.0, 0.55, r));
          col = mix(col, uHot, smoothstep(0.55, inner, r));
          em *= uOpacity;
          gl_FragColor = vec4(col * em * 2.2, clamp(em, 0.0, 1.0));
        }`,
      transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    this.disk = new THREE.Mesh(diskGeo, diskMat);
    this.disk.rotation.x = -Math.PI / 2;
    this.disk.rotation.z = 0.15;
    this.disk.scale.y = 1;
    this.group.add(this.disk);

    // a second, thinner and brighter under-disk to fake lensed light
    this.disk2 = new THREE.Mesh(diskGeo.clone(), diskMat.clone());
    this.disk2.rotation.x = -Math.PI / 2;
    this.disk2.rotation.z = 0.15;
    this.disk2.position.y = -R * 0.06;
    this.disk2.scale.set(0.82, 1, 0.82);
    this.group.add(this.disk2);

    // ---- glow behind the hole
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#ff9a3c'), color: new THREE.Color('#ff9a3c'),
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, toneMapped: false,
    }));
    glow.scale.setScalar(R * 13);
    glow.position.z = -R * 0.5;
    this.group.add(glow);
    this.glowSprite = glow;

    // ---- infalling matter
    const count = q > 0.6 ? 900 : 320;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const aAng = new Float32Array(count);
    const aRad = new Float32Array(count);
    const aSpd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const rad = R * (1.6 + Math.pow(Math.random(), 0.6) * 5.4);
      const ang = Math.random() * Math.PI * 2;
      aRad[i] = rad;
      aAng[i] = ang;
      aSpd[i] = 0.4 + Math.random() * 1.4;
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = (Math.random() - 0.5) * R * 0.16;
      pos[i * 3 + 2] = Math.sin(ang) * rad;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAng', new THREE.BufferAttribute(aAng, 1));
    geo.setAttribute('aRad', new THREE.BufferAttribute(aRad, 1));
    geo.setAttribute('aSpd', new THREE.BufferAttribute(aSpd, 1));
    this.particleUniforms = { uTime: { value: 0 }, uR: { value: R } };
    const pmat = new THREE.ShaderMaterial({
      uniforms: this.particleUniforms,
      vertexShader: `
        attribute float aAng; attribute float aRad; attribute float aSpd;
        uniform float uTime; uniform float uR;
        varying float vA;
        void main(){
          float phase = aAng + uTime * (0.35 + aSpd * 0.7) * (2.4 / pow(aRad / uR, 0.9));
          float shrink = mod(uTime * 0.02 + aSpd * 0.1, 1.0);
          float rad = mix(aRad, uR * 1.15, 0.0);
          vec3 p = vec3(cos(phase) * rad, sin(phase * 3.0) * uR * 0.02, sin(phase) * rad);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.4 + 0.6 * sin(phase * 5.0 + uTime * 2.0);
          gl_PointSize = (2.2 + 3.0 * aSpd) * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(1.6, 1.0, 0.55) * (0.6 + a), a * 0.9); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.particles = new THREE.Points(geo, pmat);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);

    // ---- relativistic jets
    if (jets) {
      const jetMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uR: { value: R } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform float uR; varying vec2 vUv;
          void main(){
            float along = vUv.y;
            float across = abs(vUv.x - 0.5) * 2.0;
            float flick = 0.65 + 0.35 * sin(along * 30.0 - uTime * 3.0 + sin(along * 12.0));
            float a = smoothstep(1.0, 0.0, across) * smoothstep(0.0, 0.25, along) * (1.0 - along) * flick;
            vec3 col = mix(vec3(0.45, 0.7, 1.6), vec3(0.9, 0.5, 1.6), along);
            gl_FragColor = vec4(col * a * 1.4, a * 0.5);
          }`,
        transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      const mk = (sign) => {
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.06, R * 0.5, R * 7, 24, 1, true), jetMat);
        jet.position.y = sign * R * 3.6;
        jet.rotation.z = sign > 0 ? 0 : Math.PI;
        return jet;
      };
      this.jets = [mk(1), mk(-1)];
      this.jets.forEach((j) => this.group.add(j));
      this.jetMat = jetMat;
    }

    // ---- illumination for nearby ships
    this.light = new THREE.PointLight(new THREE.Color('#ff9a4a'), 2.6, 0, 0.25);
    this.group.add(this.light);

    this.group.userData.radius = R;
    this.group.userData.blackhole = this;
  }

  update(dt, camera) {
    this.time += dt;
    this.diskUniforms.uTime.value = this.time * 0.85;
    this.disk2.material.uniforms.uTime.value = this.time * 1.15;
    this.particleUniforms.uTime.value = this.time;
    if (this.jetMat) this.jetMat.uniforms.uTime.value = this.time;
    this.photonRing.material.opacity = 0.8 + Math.sin(this.time * 2.2) * 0.12;
    if (camera) {
      if (this.glowSprite) this.glowSprite.quaternion.copy(camera.quaternion);
    }
  }

  /** strength of gravitational pull at a world position (0..1) */
  gravityAt(worldPos) {
    const d = worldPos.distanceTo(this.group.position);
    if (d <= this.radius) return 1;
    return Math.max(0, 1 - (d - this.radius) / (this.radius * 7));
  }
}
