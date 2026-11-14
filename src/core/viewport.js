import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { device, reportGPU } from './device.js';

const QUALITY = {
  low: { dpr: 1, bloom: false, samples: 0, detail: 0.45, shadows: false, particles: 0.4 },
  medium: { dpr: 1.35, bloom: true, samples: 2, detail: 0.75, shadows: false, particles: 0.75 },
  high: { dpr: 1.9, bloom: true, samples: 4, detail: 1, shadows: true, particles: 1 },
};

/**
 * Adaptive performance: the governor watches real frame rate and trades
 * resolution and effects for frames until the game holds 60 fps.
 *
 * Ladder, cheapest loss first: render scale steps down (the HUD stays crisp,
 * it is DOM), then MSAA goes, then bloom, then the last scale step. When the
 * frame rate has had headroom for a while it climbs back one rung, and a rung
 * that immediately drops frames is remembered as the ceiling for a minute.
 */
export const PERF_LADDER = [
  { scale: 1, msaa: true, bloom: true },
  { scale: 0.88, msaa: true, bloom: true },
  { scale: 0.76, msaa: true, bloom: true },
  { scale: 0.76, msaa: false, bloom: true },
  { scale: 0.66, msaa: false, bloom: true },
  { scale: 0.66, msaa: false, bloom: false },
  { scale: 0.55, msaa: false, bloom: false },
];
export const TARGET_FPS = 60;

export class PerfGovernor {
  constructor({ onChange = null, now = () => performance.now() } = {}) {
    this.level = 0;
    this.onChange = onChange;
    this.now = now;
    this.enabled = true;
    this.fps = TARGET_FPS;
    this._frames = 0;
    this._acc = 0;
    this._slow = 0;        // consecutive slow seconds
    this._fast = 0;        // consecutive good seconds
    this._ceiling = 0;     // best level known to hold, lower index = better
    this._ceilingUntil = 0;
    this._raisedAt = -1;
  }

  get rung() { return PERF_LADDER[this.level]; }

  /** Feed one frame. Returns true when the rung changed. */
  sample(dt) {
    if (!(dt > 0) || dt > 0.5) return false;       // tab switches, breakpoints
    this._frames++;
    this._acc += dt;
    if (this._acc < 1) return false;
    this.fps = this._frames / this._acc;
    this._frames = 0;
    this._acc = 0;
    // Goal is fixed at ~55 fps. (It used to "learn" the refresh rate from the
    // measured fps, which on a slow device just taught it to accept 30.)
    const goal = TARGET_FPS * 0.92;
    if (!this.enabled) return false;
    const t = this.now() / 1000;
    if (this.fps < goal) {
      this._slow++;
      this._fast = 0;
      // just climbed and it hurt: go straight back and remember the ceiling
      if (this._raisedAt >= 0 && t - this._raisedAt < 4) {
        this._ceiling = this.level + 1;
        this._ceilingUntil = t + 60;
        this._raisedAt = -1;
        return this._set(this.level + 1);
      }
      if (this._slow >= 2 && this.level < PERF_LADDER.length - 1) {
        this._slow = 0;
        return this._set(this.level + 1);
      }
    } else {
      this._slow = 0;
      this._fast++;
      const floor = t < this._ceilingUntil ? this._ceiling : 0;
      if (this._fast >= 8 && this.level > floor) {
        this._fast = 0;
        this._raisedAt = t;
        return this._set(this.level - 1);
      }
    }
    return false;
  }

  reset() { this._set(0); this._ceiling = 0; this._ceilingUntil = 0; }

  _set(level) {
    const next = Math.max(0, Math.min(PERF_LADDER.length - 1, level));
    if (next === this.level) return false;
    this.level = next;
    this.onChange?.(this.rung, next);
    return true;
  }
}

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    // read the GPU once — it is the most reliable quality signal we get
    reportGPU(this.renderer);
    this.renderer.setClearColor(0x02040a, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200000);

    this.quality = 'medium';
    this.detail = 0.75;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
      type: THREE.HalfFloatType,
      samples: QUALITY[this.quality].samples,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    // threshold high enough that only lights, engines and stars glow (hulls stay crisp)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.82);
    // bloom is a blur: rendering it at half resolution is visually identical
    // and cuts its cost by ~75% (it is one of the most expensive passes)
    const bloomSetSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => bloomSetSize(Math.max(2, Math.round(w * 0.5)), Math.max(2, Math.round(h * 0.5)));
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.renderScale = 1;
    this._msaaAllowed = true;
    this._bloomAllowed = true;
    this.governor = new PerfGovernor({
      onChange: (rung) => {
        this.renderScale = rung.scale;
        this._msaaAllowed = rung.msaa;
        this._bloomAllowed = rung.bloom;
        this._applySamples();
        this.resize();
      },
    });

    this.autoQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 220));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.resize(); });
  }

  autoQuality() {
    // one shared verdict from device.js — it already weighed cores, memory,
    // DPR, form factor and (when the browser allows it) the GPU string
    const q = device.tier === 'high' ? 'high' : device.tier === 'low' ? 'low' : 'medium';
    this.setQuality(q);
    return q;
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'medium';
    this.quality = q;
    this.detail = QUALITY[q].detail;
    this.bloom.enabled = QUALITY[q].bloom;
    this._applySamples();
    this.resize();
  }

  _applySamples() {
    const want = this._msaaAllowed === false ? 0 : QUALITY[this.quality].samples;
    if (this.composer.renderTarget1.samples === want) return;
    this.composer.renderTarget1.samples = want;
    this.composer.renderTarget2.samples = want;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
  }

  /** Called once per frame by the main loop with the real frame time. */
  frame(dt) {
    this.governor.sample(dt);
  }

  get fps() { return this.governor.fps; }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr) * (this.renderScale || 1));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  render() {
    // low quality (or a governor that needed the frames) skips bloom but still
    // routes through the composer so tone mapping / colour space stay consistent
    this.bloom.enabled = this.quality !== 'low' && QUALITY[this.quality].bloom && this._bloomAllowed !== false;
    this.composer.render();
  }
}
