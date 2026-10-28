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
    this.clock = new THREE.Clock();

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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.62, 0.72);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);

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
    this.composer.renderTarget1.samples = QUALITY[q].samples;
    this.composer.renderTarget2.samples = QUALITY[q].samples;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
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
    if (this.quality === 'low') {
      // still route through the composer so tone mapping / colour space stay consistent
      this.bloom.enabled = false;
    } else {
      this.bloom.enabled = QUALITY[this.quality].bloom;
    }
    this.composer.render();
  }
}
