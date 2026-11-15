import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { LoveSong } from './audio.js';
import { HeartFx } from './fx.js';

const NAME_A = 'Days';
const NAME_B = 'Naswa';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
const COUNT = mobile ? 9000 : 16000;
const MORPH_MS = reduced ? 1600 : 3400;

/* ------------------------------------------------------------------ renderer */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.6 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 14);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.22);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function visibleSize() {
  const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  return { w: h * camera.aspect, h };
}

/* ------------------------------------------------------------- shapes */
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const DUST = 0.1; // share of particles that float around each shape as stardust

function dust(out, i, spreadX, spreadY) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random());
  out[i * 3] = Math.cos(a) * r * spreadX;
  out[i * 3 + 1] = Math.sin(a) * r * spreadY;
  out[i * 3 + 2] = rand(-3, 3);
}

function galaxyShape() {
  const out = new Float32Array(COUNT * 3);
  const { w, h } = visibleSize();
  const R = Math.min(w, h * 1.4) * 0.55;
  const tilt = -1.05;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < COUNT; i++) {
    const arm = i % 3;
    const r = Math.pow(Math.random(), 1.6) * R;
    const ang = (arm / 3) * Math.PI * 2 + r * 0.75 + rand(-0.35, 0.35) * (1 - r / R + 0.3);
    const x = Math.cos(ang) * r + rand(-0.25, 0.25);
    const y = Math.sin(ang) * r + rand(-0.25, 0.25);
    const z = rand(-0.35, 0.35) * (1.2 - r / R);
    out[i * 3] = x;
    out[i * 3 + 1] = y * ct - z * st;
    out[i * 3 + 2] = y * st + z * ct;
  }
  return out;
}

function heartShape() {
  const out = new Float32Array(COUNT * 3);
  const { w, h } = visibleSize();
  const s = Math.min(h * 0.27, w * 0.33, 4.3);
  for (let i = 0; i < COUNT; i++) {
    if (i < COUNT * DUST) { dust(out, i, s * 2.2, s * 1.9); continue; }
    let x, y, f;
    // rejection-sample the interior of (x² + y² − 1)³ − x²y³ ≤ 0
    do {
      x = rand(-1.25, 1.25);
      y = rand(-1.1, 1.35);
      const a = x * x + y * y - 1;
      f = a * a * a - x * x * y * y * y;
    } while (f > 0);
    // bias toward the surface so the outline glows
    const shell = Math.random() < 0.82;
    if (shell) {
      for (let k = 0; k < 6; k++) {
        const nx = x * 1.04, ny = y * 1.04 + 0.01;
        const a = nx * nx + ny * ny - 1;
        if (a * a * a - nx * nx * ny * ny * ny > 0) break;
        x = nx; y = ny;
      }
    }
    const depth = Math.sqrt(Math.max(0, -f)) * 1.6;
    out[i * 3] = x * s;
    out[i * 3 + 1] = (y - 0.12) * s;
    out[i * 3 + 2] = rand(-1, 1) * depth * s * 0.45;
  }
  return out;
}

const SCRIPT_FONT = '"Great Vibes", "Brush Script MT", cursive';

function drawHeartPath(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 32, size / 32);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-20, -2, -16, -20, 0, -10);
  ctx.bezierCurveTo(16, -20, 20, -2, 0, 12);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws text (and inline hearts) on a canvas and returns its lit pixels as
 * points in world space, sized to fit the screen.
 */
function textShape(lines) {
  const cw = 1600;
  const fontPx = 260;
  const lineH = fontPx * 1.05;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = Math.ceil(lineH * lines.length + fontPx * 0.6);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.font = `${fontPx}px ${SCRIPT_FONT}`;

  // measure the widest line to scale the world size
  const parts = lines.map((line) => line.split(/(♥)/).filter(Boolean));
  const widthOf = (segs) => segs.reduce((acc, s) => acc + (s === '♥' ? fontPx * 0.75 : ctx.measureText(s).width), 0);
  const widest = Math.max(...parts.map(widthOf));
  const scale = Math.min(1, (cw * 0.94) / widest);
  ctx.font = `${fontPx * scale}px ${SCRIPT_FONT}`;

  parts.forEach((segs, li) => {
    const lw = widthOf(segs) * scale;
    let x = (cw - lw) / 2;
    const y = c.height / 2 + (li - (lines.length - 1) / 2) * lineH;
    segs.forEach((s) => {
      if (s === '♥') {
        const size = fontPx * 0.5 * scale;
        drawHeartPath(ctx, x + fontPx * 0.375 * scale, y + size * 0.05, size);
        x += fontPx * 0.75 * scale;
      } else {
        ctx.fillText(s, x, y);
        x += ctx.measureText(s).width;
      }
    });
  });

  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  let minX = Infinity, maxX = -Infinity;
  for (let py = 0; py < c.height; py += 2) {
    for (let px = 0; px < cw; px += 2) {
      if (data[(py * cw + px) * 4 + 3] > 140) {
        pts.push(px, py);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
      }
    }
  }

  const { w, h } = visibleSize();
  const inkW = Math.max(1, maxX - minX);
  const inkH = c.height;
  const worldW = Math.min(w * 0.86, 13, (h * 0.62 * inkW) / inkH);
  const k = worldW / inkW;
  const midX = (minX + maxX) / 2;

  const out = new Float32Array(COUNT * 3);
  const n = pts.length / 2;
  for (let i = 0; i < COUNT; i++) {
    if (i < COUNT * DUST || n === 0) { dust(out, i, w * 0.5, h * 0.42); continue; }
    const j = Math.floor(Math.random() * n) * 2;
    out[i * 3] = (pts[j] - midX + rand(-1, 1)) * k;
    out[i * 3 + 1] = -(pts[j + 1] - inkH / 2 + rand(-1, 1)) * k + h * 0.04;
    out[i * 3 + 2] = rand(-0.18, 0.18);
  }
  return out;
}

const portrait = () => camera.aspect < 0.85;
const SHAPES = {
  galaxy: galaxyShape,
  heart: heartShape,
  a: () => textShape([NAME_A]),
  b: () => textShape([NAME_B]),
  both: () => textShape(portrait() ? [NAME_A, '♥', NAME_B] : [`${NAME_A} ♥ ${NAME_B}`]),
};

/* --------------------------------------------------------- particle system */
const geo = new THREE.BufferGeometry();
const from = new Float32Array(COUNT * 3);
const seeds = new Float32Array(COUNT * 4);
for (let i = 0; i < COUNT; i++) {
  // start as a wide cloud of scattered stars
  from[i * 3] = rand(-25, 25);
  from[i * 3 + 1] = rand(-15, 15);
  from[i * 3 + 2] = rand(-20, 6);
  seeds[i * 4] = Math.random();
  seeds[i * 4 + 1] = Math.random();
  seeds[i * 4 + 2] = Math.random();
  seeds[i * 4 + 3] = Math.random();
}
geo.setAttribute('position', new THREE.BufferAttribute(from.slice(), 3));
geo.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
geo.setAttribute('aTo', new THREE.BufferAttribute(galaxyShape(), 3));
geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

const uniforms = {
  uTime: { value: 0 },
  uMorph: { value: 0 },
  uPulse: { value: 0 },
  uHeart: { value: 0 },
  uSwirl: { value: reduced ? 0.4 : 1 },
  uPointer: { value: new THREE.Vector3(999, 999, 0) },
  uPointerAmt: { value: 0 },
  uShockPos: { value: new THREE.Vector3() },
  uShockAge: { value: 99 },
  uSize: { value: mobile ? 0.12 : 0.118 },
  uPR: { value: renderer.getPixelRatio() },
  uH: { value: window.innerHeight },
};

const particles = new THREE.Points(
  geo,
  new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uMorph, uPulse, uHeart, uSwirl, uPointerAmt, uShockAge, uSize, uPR, uH;
      uniform vec3 uPointer, uShockPos;
      attribute vec3 aFrom, aTo;
      attribute vec4 aSeed;
      varying vec3 vColor;
      varying float vAlpha;

      float easeInOut(float t) { return t < .5 ? 4. * t * t * t : 1. - pow(-2. * t + 2., 3.) / 2.; }

      void main() {
        float delay = aSeed.x * .4;
        float p = easeInOut(clamp((uMorph - delay) / (1. - .4), 0., 1.));
        vec3 pos = mix(aFrom, aTo, p);

        // swirl through space while travelling between shapes
        float travel = sin(p * 3.14159);
        float a = aSeed.y * 6.2832 + uTime * .6;
        pos += uSwirl * travel * vec3(cos(a) * 2.2, sin(a * 1.3) * 1.6, sin(a) * 2.5) * (.4 + aSeed.z);

        // gentle breathing drift
        pos += vec3(
          sin(uTime * (.3 + aSeed.z * .5) + aSeed.x * 40.),
          cos(uTime * (.25 + aSeed.w * .5) + aSeed.y * 40.),
          sin(uTime * .2 + aSeed.w * 30.)) * .035 * uSwirl;

        // heartbeat
        pos.xy *= 1. + uPulse * (.025 + .075 * uHeart);

        // the pointer gently parts the stars
        vec2 dp = pos.xy - uPointer.xy;
        float d2 = dot(dp, dp);
        pos.xy += normalize(dp + 1e-4) * uPointerAmt * exp(-d2 * .9) * .85;
        pos.z += uPointerAmt * exp(-d2 * .9) * .8;

        // a tap sends a ripple out through everything
        vec2 ds = pos.xy - uShockPos.xy;
        float dist = length(ds);
        float front = uShockAge * 7.;
        float ring = exp(-pow(dist - front, 2.) * 1.4) * exp(-uShockAge * 1.6);
        pos.xy += normalize(ds + 1e-4) * ring * .55;
        pos.z += ring * 1.2;

        vec4 mv = modelViewMatrix * vec4(pos, 1.);
        gl_Position = projectionMatrix * mv;

        float twinkle = .65 + .35 * sin(uTime * (1.5 + aSeed.w * 3.) + aSeed.x * 60.);
        gl_PointSize = uSize * (.45 + aSeed.z * 1.1) * (1. + ring * 1.5) * uPR * uH / -mv.z * .6;

        vec3 rose = vec3(1., .16, .45);
        vec3 blush = vec3(1., .45, .66);
        vec3 gold = vec3(1., .72, .45);
        vec3 white = vec3(1., .88, .93);
        float c = aSeed.w * aSeed.w;
        vec3 col = c < .45 ? mix(rose, blush, c / .45) : c < .8 ? mix(blush, gold, (c - .45) / .35) : mix(gold, white, (c - .8) / .2);
        vColor = col * (1.22 + uPulse * uHeart * .7 + ring * 1.5);
        vAlpha = twinkle * (.7 + travel * .1);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - .5);
        float core = smoothstep(.5, .0, d);
        float a = pow(core, 1.8) * vAlpha;
        if (a < .01) discard;
        gl_FragColor = vec4(vColor * a, a);
      }
    `,
  }),
);
scene.add(particles);

/* ------------------------------------------------------------ star dome */
let starDome;
{
  const n = mobile ? 1500 : 3000;
  const pos = new Float32Array(n * 3);
  const sd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const r = rand(40, 90);
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(t) * s * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = Math.sin(t) * s * r - 30;
    sd[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const stars = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uPR: uniforms.uPR },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uPR;
        attribute float aSeed;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * mv;
          vA = .35 + .65 * pow(.5 + .5 * sin(uTime * (.4 + aSeed * 2.) + aSeed * 90.), 3.);
          gl_PointSize = (1. + aSeed * 2.2) * uPR;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - .5);
          float a = smoothstep(.5, 0., d) * vA * .8;
          gl_FragColor = vec4(vec3(1., .9, .95) * a, a);
        }`,
    }),
  );
  scene.add(stars);
  starDome = stars;
}

/* --------------------------------------------------------------- morphing */
let morphStart = performance.now();
let currentShape = 'galaxy';
const aFrom = geo.getAttribute('aFrom');
const aTo = geo.getAttribute('aTo');

function morphTo(name) {
  currentShape = name;
  aFrom.array.set(aTo.array); // the last target is where the particles now rest
  aFrom.needsUpdate = true;
  aTo.array.set(SHAPES[name]());
  aTo.needsUpdate = true;
  morphStart = performance.now();
  uniforms.uMorph.value = 0;
}

/* ----------------------------------------------------------------- story */
const captionEl = document.getElementById('caption');
function caption(text) {
  captionEl.classList.remove('show');
  setTimeout(() => {
    captionEl.innerHTML = '';
    text.split(' ').forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w;
      span.style.animationDelay = `${i * 0.09}s`;
      captionEl.append(span, ' ');
    });
    captionEl.classList.add('show');
  }, 700);
}

const STORY = [
  { shape: 'galaxy', text: 'Among a hundred billion stars, scattered across the dark…', hold: 7000 },
  { shape: 'a', text: `…one of them was called ${NAME_A}.`, hold: 6500 },
  { shape: 'b', text: `And far across the sky, another shone, called ${NAME_B}.`, hold: 6500 },
  { shape: 'heart', text: 'When their light finally met, the universe learned a new rhythm.', hold: 8000 },
  { shape: 'both', text: 'Written in the stars, forever and always.', hold: 9000 },
];
const AFTER = [
  { shape: 'heart', text: 'Every heartbeat says your name.' },
  { shape: 'both', text: 'Of all the stars in the sky, I would still choose you.' },
  { shape: 'heart', text: 'Two souls, one orbit.' },
  { shape: 'both', text: 'You are my favourite place in the universe.' },
  { shape: 'heart', text: 'Here’s to every day, and every night, together.' },
  { shape: 'both', text: `${NAME_A} & ${NAME_B} — always.` },
];

let storyTimer = null;
function runStory(i = 0) {
  clearTimeout(storyTimer);
  if (i < STORY.length) {
    const s = STORY[i];
    if (i > 0 || currentShape !== s.shape) morphTo(s.shape);
    caption(s.text);
    if (i === STORY.length - 1) {
      setTimeout(() => {
        document.getElementById('tap-hint').hidden = false;
        document.getElementById('replay').hidden = false;
        fx.celebrate();
      }, 2600);
    }
    storyTimer = setTimeout(() => runStory(i + 1), s.hold);
  } else {
    const s = AFTER[(i - STORY.length) % AFTER.length];
    morphTo(s.shape);
    caption(s.text);
    storyTimer = setTimeout(() => runStory(i + 1), 9000);
  }
}

/* ------------------------------------------------------------- heartbeat */
const song = new LoveSong();
let pulseTarget = 0;
function beat() {
  pulseTarget = 1;
  setTimeout(() => (pulseTarget = 0.6), 200);
}
song.onBeat = beat;
// a silent heartbeat when there is no audio (muted or unsupported)
setInterval(() => { if (!song.ctx || song.muted) beat(); }, (60 / 72) * 2000);

/* ------------------------------------------------------------- pointer */
const fx = new HeartFx(document.getElementById('fx'), reduced);
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hit = new THREE.Vector3();
let pointerActive = 0;
let lastMove = 0;
const look = { x: 0, y: 0 };

function toWorld(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.ray.intersectPlane(plane, hit);
  return hit;
}

window.addEventListener('pointermove', (e) => {
  uniforms.uPointer.value.copy(toWorld(e.clientX, e.clientY));
  pointerActive = 1;
  lastMove = performance.now();
  look.x = (e.clientX / window.innerWidth) * 2 - 1;
  look.y = (e.clientY / window.innerHeight) * 2 - 1;
});
window.addEventListener('pointerleave', () => (pointerActive = 0));

let started = false;
window.addEventListener('pointerdown', (e) => {
  if (!started || e.target.closest('button')) return;
  uniforms.uShockPos.value.copy(toWorld(e.clientX, e.clientY));
  uniforms.uShockAge.value = 0;
  fx.burst(e.clientX, e.clientY);
  song.chime();
});

/* -------------------------------------------------------------- controls */
const intro = document.getElementById('intro');
const soundBtn = document.getElementById('sound');
const replayBtn = document.getElementById('replay');

document.getElementById('start').addEventListener('click', async () => {
  started = true;
  intro.classList.add('gone');
  soundBtn.hidden = false;
  song.start();
  await document.fonts.load(`200px ${SCRIPT_FONT}`).catch(() => {});
  setTimeout(() => runStory(0), 900);
});

soundBtn.addEventListener('click', () => {
  const on = soundBtn.getAttribute('aria-pressed') === 'true';
  soundBtn.setAttribute('aria-pressed', String(!on));
  soundBtn.setAttribute('aria-label', on ? 'Play music' : 'Mute music');
  song.setMuted(on);
});

replayBtn.addEventListener('click', () => {
  document.getElementById('tap-hint').hidden = true;
  replayBtn.hidden = true;
  runStory(0);
});

/* ----------------------------------------------------------------- resize */
let resizeTimer;
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  uniforms.uH.value = h;
  fx.resize();
  clearTimeout(resizeTimer);
  // refit the current shape to the new screen
  resizeTimer = setTimeout(() => started && morphTo(currentShape), 300);
});

/* ----------------------------------------------------------------- loop */
const clock = new THREE.Clock();
let swayAmt = 0.18;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  uniforms.uTime.value = t;
  uniforms.uMorph.value = Math.min(1, (performance.now() - morphStart) / MORPH_MS);
  uniforms.uShockAge.value += dt;

  if (performance.now() - lastMove > 2500) pointerActive = 0;
  uniforms.uPointerAmt.value += (pointerActive - uniforms.uPointerAmt.value) * Math.min(1, dt * 4);

  uniforms.uPulse.value += (pulseTarget - uniforms.uPulse.value) * Math.min(1, dt * 18);
  pulseTarget *= Math.pow(0.02, dt);
  const wantHeart = currentShape === 'heart' ? 1 : 0;
  uniforms.uHeart.value += (wantHeart - uniforms.uHeart.value) * Math.min(1, dt * 2);

  // a slow sway, and the camera leans toward the pointer
  const sway = reduced ? 0.3 : 1;
  const isText = currentShape === 'a' || currentShape === 'b' || currentShape === 'both';
  swayAmt += ((isText ? 0.06 : 0.18) - swayAmt) * Math.min(1, dt);
  particles.rotation.y = Math.sin(t * 0.25) * swayAmt * sway;
  particles.rotation.x = Math.sin(t * 0.18) * 0.06 * sway;
  starDome.rotation.y = t * 0.008;
  camera.position.x += (look.x * 0.8 * sway - camera.position.x) * Math.min(1, dt * 1.5);
  camera.position.y += (-look.y * 0.5 * sway - camera.position.y) * Math.min(1, dt * 1.5);
  camera.lookAt(0, 0, 0);

  composer.render();
  fx.update(dt, started);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// begin with the scattered stars gathering into a galaxy behind the intro
morphStart = performance.now();
