/**
 * Dyas & Naswa — a short anime scene drawn entirely in code.
 *
 * Two people sit on a hill under a cherry tree, watching the sun go down over
 * the city. The sky turns to night, a comet crosses it, they hold hands, and
 * the title card comes up with fireworks. Everything is painted each frame on
 * a 2D canvas in a cel-shaded anime style: flat colour bands, hard shadows,
 * glowing rim light.
 */
import { LoveSong } from './audio.js';
import { HeartFx } from './fx.js';

const NAME_A = 'Dyas';
const NAME_B = 'Naswa';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const fx = new HeartFx(document.getElementById('fx'), reduced);

let W = 0, H = 0, U = 1, DPR = 1;

/* ----------------------------------------------------------------- helpers */
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const hexCache = new Map();
function hex(h) {
  if (!hexCache.has(h)) {
    const n = parseInt(h.slice(1), 16);
    hexCache.set(h, [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  return hexCache.get(h);
}
/** blend two hex colours; used with p = 0 at sunset and 1 at night */
function mix(a, b, t, alpha = 1) {
  const A = hex(a), B = hex(b);
  return `rgba(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))},${alpha})`;
}

/* ------------------------------------------------------------------- world */
let clouds = [], stars = [], city = [], canopy = [], petals = [], flies = [], fireworks = [];

function build() {
  stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random() * 0.62, r: rand(0.4, 1.6), s: Math.random() * 6 }));

  clouds = Array.from({ length: 7 }, (_, i) => {
    const size = rand(60, 130);
    const n = 5 + Math.floor(Math.random() * 4);
    return {
      x: (i / 7) * 1.3 - 0.15 + rand(-0.05, 0.05),
      y: rand(0.12, 0.46),
      speed: rand(0.004, 0.01),
      puffs: Array.from({ length: n }, (_, j) => {
        const f = j / (n - 1) - 0.5;
        return { dx: f * size * 3.2, dy: -Math.cos(f * Math.PI) * size * 0.55 - rand(0, size * 0.3), r: size * (0.55 + 0.45 * Math.cos(f * Math.PI)) * rand(0.8, 1.1) };
      }),
    };
  });

  city = [];
  for (let x = -20; x < 2600; ) {
    const w = rand(18, 54);
    const h = Math.random() < 0.15 ? rand(90, 150) : rand(22, 80);
    const wins = [];
    for (let wy = 8; wy < h - 6; wy += 9) for (let wx = 5; wx < w - 5; wx += 8) if (Math.random() < 0.55) wins.push({ wx, wy, on: Math.random() });
    city.push({ x, w, h, wins, tone: Math.random() });
    x += w + rand(-4, 6);
  }

  canopy = Array.from({ length: 34 }, () => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    return { x: Math.cos(a) * r * 150 + 10, y: Math.sin(a) * r * 75 - 235, r: rand(28, 52) };
  }).sort((a, b) => a.y - b.y);

  flies = Array.from({ length: 22 }, () => ({ x: Math.random(), y: rand(0.6, 0.95), s: Math.random() * 10 }));
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  U = Math.min(W / 760, H / 820);
  fx.resize();
}

/* geometry that depends on the screen */
const horizon = () => H * 0.68;
const crestX = () => (W > H ? W * 0.46 : W * 0.5);
const crestY = () => H * (W > H ? 0.74 : 0.72);
const hillY = (x) => crestY() + H * 0.42 * Math.pow((x - crestX()) / Math.max(W, 700), 2) * 2.4;

/* ------------------------------------------------------------- the timeline */
let T0 = 0;
let started = false;
const beats = {
  pan: [0, 7], // camera tilts down from the sky
  dusk: [17, 29], // sunset becomes night
  comet: [29.5, 33.5],
  hold: [35, 38],
  title: 40.5,
};

const SUBS = [
  [1.2, '', 'Every evening, two people climbed the same hill…'],
  [7.5, NAME_B, `${NAME_A}… do you think the sky remembers us?`],
  [13.5, NAME_A, 'It does. It’s watched me fall for you, one sunset at a time.'],
  [20, '', 'The sun went down. The city lit up. Neither of them moved.'],
  [26.5, NAME_B, 'Look — a shooting star! Quick, make a wish!'],
  [32.5, NAME_A, 'I don’t need one. Mine is sitting right here.'],
  [38.2, '', ''],
];
const AFTER = [
  [NAME_B, `Same hill tomorrow, ${NAME_A}?`],
  [NAME_A, 'Every tomorrow.'],
  [NAME_B, 'Of all the skies, this one is my favourite.'],
  [NAME_A, 'Because you’re in it.'],
  ['', `${NAME_A} ♥ ${NAME_B} — to be continued, forever.`],
];

const subEl = document.getElementById('sub');
const whoEl = subEl.querySelector('.who');
const lineEl = subEl.querySelector('.line');
let subIndex = -1;
function showSub(who, text) {
  subEl.classList.remove('show');
  setTimeout(() => {
    whoEl.textContent = who;
    whoEl.dataset.who = who === NAME_A ? 'a' : who === NAME_B ? 'b' : '';
    lineEl.textContent = text;
    if (text) subEl.classList.add('show');
  }, 350);
}

/* ------------------------------------------------------------ draw: sky */
function drawSky(p, t, pan) {
  const g = ctx.createLinearGradient(0, -pan * 0.2, 0, horizon() + pan * 0.2);
  g.addColorStop(0, mix('#2f45a8', '#030720', p));
  g.addColorStop(0.35, mix('#8a63cf', '#0b1446', p));
  g.addColorStop(0.62, mix('#ff8aa1', '#211f63', p));
  g.addColorStop(0.82, mix('#ffbd7f', '#45357a', p));
  g.addColorStop(1, mix('#ffe9ad', '#6a4a88', p));
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, W + 80, H + 80);

  if (p > 0.05) {
    for (const s of stars) {
      const a = p * (0.45 + 0.55 * Math.sin(t * 1.3 + s.s * 7) ** 2);
      const x = s.x * W, y = s.y * H + pan * 0.15;
      ctx.fillStyle = `rgba(255,248,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r * Math.max(U, 0.7), 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.4) {
        // four-point anime sparkle
        ctx.strokeStyle = `rgba(255,240,255,${a * 0.6})`;
        ctx.lineWidth = 0.7;
        const L = 5 * s.r;
        ctx.beginPath();
        ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.stroke();
      }
    }
  }

  // crescent moon
  if (p > 0.1) {
    const mx = W * 0.22, my = H * 0.16 + pan * 0.15, mr = 26 * Math.max(U, 0.75);
    const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
    glow.addColorStop(0, `rgba(190,200,255,${0.35 * p})`);
    glow.addColorStop(1, 'rgba(190,200,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = `rgba(255,250,235,${p})`;
    ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // the setting sun with soft god-rays
  const sunA = 1 - smooth(0.55, 0.95, p);
  if (sunA > 0) {
    const sx = W * 0.62, sy = horizon() - H * 0.06 + p * H * 0.16 + pan * 0.3, sr = 46 * U;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.28 + Math.sin(t * 0.2 + i) * 0.03;
      const len = H * 1.1;
      ctx.fillStyle = `rgba(255,220,170,${0.045 * sunA})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - 0.05) * len, sy + Math.sin(a - 0.05) * len);
      ctx.lineTo(sx + Math.cos(a + 0.05) * len, sy + Math.sin(a + 0.05) * len);
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 7);
    glow.addColorStop(0, `rgba(255,236,190,${0.9 * sunA})`);
    glow.addColorStop(0.15, `rgba(255,190,140,${0.5 * sunA})`);
    glow.addColorStop(1, 'rgba(255,140,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - sr * 7, sy - sr * 7, sr * 14, sr * 14);
    ctx.restore();
    ctx.fillStyle = `rgba(255,248,225,${sunA})`;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }
}

function drawClouds(p, t, pan) {
  const lit = mix('#ffd3ad', '#3c3f80', p);
  const shade = mix('#c86a93', '#1b1e52', p);
  const high = mix('#fff3dc', '#7b80c4', p);
  const k = Math.max(U, 0.6);
  for (const c of clouds) {
    const x = ((((c.x + t * c.speed) % 1.4) + 1.4) % 1.4) * W - W * 0.2;
    const y = c.y * H + pan * 0.45;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 600 * k, y - 400 * k, 1200 * k, 400 * k); // flat cloud bottoms
    ctx.clip();
    ctx.fillStyle = shade;
    for (const q of c.puffs) { ctx.beginPath(); ctx.arc(x + q.dx * k, y + q.dy * k, q.r * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = lit;
    for (const q of c.puffs) { ctx.beginPath(); ctx.arc(x + (q.dx - q.r * 0.12) * k, y + (q.dy - q.r * 0.16) * k, q.r * 0.86 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = high;
    for (const q of c.puffs) { ctx.beginPath(); ctx.arc(x + (q.dx - q.r * 0.25) * k, y + (q.dy - q.r * 0.34) * k, q.r * 0.5 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function drawComet(T) {
  const [a, b] = beats.comet;
  if (T < a || T > b + 1) return;
  const k = clamp((T - a) / (b - a));
  const hx = lerp(W * 1.08, W * -0.1, k);
  const hy = lerp(H * 0.05, H * 0.34, k);
  const dx = W * 1.18, dy = -H * 0.29;
  const tail = 0.32;
  const fade = 1 - smooth(b, b + 1, T);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const [off, w, col] of [[0, 7, '170,230,255'], [0, 2.5, '255,255,255'], [0.012, 3, '255,170,210']]) {
    const g = ctx.createLinearGradient(hx, hy, hx + dx * tail, hy + dy * tail);
    g.addColorStop(0, `rgba(${col},${0.9 * fade})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = w * Math.max(U, 0.7);
    ctx.beginPath();
    ctx.moveTo(hx, hy + off * H);
    ctx.lineTo(hx + dx * tail, hy + dy * tail + off * H * 3);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 40 * U);
  glow.addColorStop(0, `rgba(255,255,255,${fade})`);
  glow.addColorStop(1, 'rgba(160,220,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(hx - 40 * U, hy - 40 * U, 80 * U, 80 * U);
  ctx.restore();
}

/* ----------------------------------------------------------- fireworks */
function launchFirework() {
  fireworks.push({
    x: rand(0.12, 0.88) * W,
    y: horizon(),
    ty: rand(0.12, 0.38) * H,
    vy: -rand(0.9, 1.2) * H,
    heart: Math.random() < 0.35,
    color: ['255,120,170', '255,210,120', '150,220,255', '255,255,255', '210,150,255'][Math.floor(Math.random() * 5)],
    sparks: null,
    life: 0,
  });
}

function drawFireworks(dt) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const f = fireworks[i];
    if (!f.sparks) {
      f.y += f.vy * dt;
      ctx.fillStyle = `rgba(${f.color},0.9)`;
      ctx.fillRect(f.x - 1, f.y, 2, 10);
      if (f.y <= f.ty) {
        const n = reduced ? 30 : 70;
        const sp = rand(0.16, 0.22) * Math.min(W, H);
        f.sparks = Array.from({ length: n }, (_, j) => {
          let vx, vy;
          if (f.heart) {
            const a = (j / n) * Math.PI * 2;
            vx = Math.sin(a) ** 3;
            vy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16;
          } else {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random());
            vx = Math.cos(a) * r; vy = Math.sin(a) * r;
          }
          return { x: f.x, y: f.y, vx: vx * sp, vy: vy * sp };
        });
      }
    } else {
      f.life += dt;
      const a = 1 - f.life / 2.2;
      if (a <= 0) { fireworks.splice(i, 1); continue; }
      if (f.life < 0.15) {
        const g = ctx.createRadialGradient(f.x, f.ty, 0, f.x, f.ty, 120 * U);
        g.addColorStop(0, `rgba(${f.color},${0.5 * (1 - f.life / 0.15)})`);
        g.addColorStop(1, `rgba(${f.color},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(f.x - 120 * U, f.ty - 120 * U, 240 * U, 240 * U);
      }
      ctx.strokeStyle = `rgba(${f.color},${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const drag = Math.pow(0.35, dt);
      for (const s of f.sparks) {
        s.vx *= drag;
        s.vy = s.vy * drag + 40 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.moveTo(s.x - s.vx * 0.06, s.y - s.vy * 0.06);
        ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------ draw: distance */
function drawCity(p, t, pan) {
  const base = horizon() + pan * 0.85;
  ctx.fillStyle = mix('#c98fae', '#272d63', p);
  ctx.beginPath();
  ctx.moveTo(-40, base);
  for (let x = -40; x <= W + 40; x += 40) ctx.lineTo(x, base - (28 + 22 * Math.sin(x * 0.006) + 14 * Math.sin(x * 0.017 + 1)) * U);
  ctx.lineTo(W + 40, base + 10); ctx.lineTo(-40, base + 10); ctx.fill();

  const k = Math.max(U, 0.65);
  for (const b of city) {
    const x = b.x * k - 30;
    if (x > W + 30) break;
    const h = b.h * k * 0.8;
    ctx.fillStyle = mix(b.tone > 0.5 ? '#9a6c9c' : '#8a6192', b.tone > 0.5 ? '#151a40' : '#10143a', p);
    ctx.fillRect(x, base - h, b.w * k, h + 40);
    for (const w of b.wins) {
      if (w.on > p * 1.15 - 0.05) continue; // windows light up as night falls
      const flick = 0.75 + 0.25 * Math.sin(t * 0.7 + w.on * 50);
      ctx.fillStyle = `rgba(255,${210 + Math.round(w.on * 40)},140,${0.85 * flick})`;
      ctx.fillRect(x + w.wx * k, base - h + w.wy * k, 3.2 * k, 4 * k);
    }
  }
  const haze = ctx.createLinearGradient(0, base - 70 * U, 0, base + 10);
  haze.addColorStop(0, mix('#ffd0a0', '#6a4a9a', p, 0));
  haze.addColorStop(1, mix('#ffd0a0', '#6a4a9a', p, 0.45));
  ctx.fillStyle = haze;
  ctx.fillRect(-40, base - 70 * U, W + 80, 80 * U);
}

/* ------------------------------------------------------- draw: the hill */
function drawPole(p, pan) {
  const x = W * (W > H ? 0.86 : 0.9);
  const y = hillY(x) + pan;
  const h = 360 * U;
  ctx.strokeStyle = mix('#3a2a44', '#080a1c', p);
  ctx.lineWidth = 7 * U;
  ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, y - h); ctx.stroke();
  ctx.lineWidth = 5 * U;
  for (const [dy, w] of [[0, 46], [26, 34]]) {
    ctx.beginPath(); ctx.moveTo(x - w * U, y - h + dy * U); ctx.lineTo(x + w * U, y - h + dy * U); ctx.stroke();
  }
  // wires sagging away across the sky
  ctx.lineWidth = 1.4;
  for (const [dx, dy] of [[-46, 0], [-20, 0], [20, 0], [46, 0], [-34, 26], [34, 26]]) {
    const ax = x + dx * U, ay = y - h + dy * U;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(lerp(ax, -40, 0.5), ay + 90 * U + dy * U, -40, ay - 60 * U - dx * 0.6);
    ctx.stroke();
  }
}

function drawHill(p, t, pan) {
  const cy = crestY() + pan;
  const g = ctx.createLinearGradient(0, cy - 10, 0, H + pan);
  const lit = mix('#e8b170', '#5d6fb5', p);
  const top = mix('#5d8a52', '#1b2a52', p);
  const base = mix('#2f5442', '#0b1430', p);
  g.addColorStop(0, lit);
  g.addColorStop(0.03, lit);
  g.addColorStop(0.031, top);
  g.addColorStop(0.2, top);
  g.addColorStop(0.201, base); // cel-shaded hard band
  g.addColorStop(1, base);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-40, H + 40);
  for (let x = -40; x <= W + 40; x += 8) ctx.lineTo(x, hillY(x) + pan);
  ctx.lineTo(W + 40, H + 40);
  ctx.fill();

  // grass along the crest, leaning with the wind
  ctx.strokeStyle = mix('#7fae5f', '#2a3c6e', p);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let x = -30; x <= W + 30; x += 4.5) {
    const y = hillY(x) + pan + 3;
    const h = (6 + ((x * 7.3) % 9 + 9) % 9) * Math.max(U, 0.7);
    const sway = Math.sin(t * 2.2 + x * 0.025) * 3 + 3;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway * 0.4, y - h * 0.6, x + sway, y - h);
  }
  ctx.stroke();
}

function drawTree(p, t, pan) {
  const k = U;
  const x = crestX() - 250 * k;
  const y = hillY(x) + pan + 4;
  const sway = Math.sin(t * 0.8) * 3;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = mix('#5a3a3e', '#140e24', p);
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.bezierCurveTo(-10, -80, -22, -150, 4 + sway * 0.3, -225);
  ctx.lineTo(14 + sway * 0.3, -222);
  ctx.bezierCurveTo(4, -150, 14, -80, 18, 0);
  ctx.fill();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2, w] of [[0, -150, -90, -215, 7], [6, -170, 95, -230, 6], [2, -200, -40, -260, 5], [8, -195, 60, -270, 4]]) {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, y1 - 10, x2 + sway * 0.6, y2); ctx.stroke();
  }
  ctx.strokeStyle = mix('#ffc48a', '#8fa2ff', p, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(17, -2); ctx.bezierCurveTo(14, -80, 4, -150, 14 + sway * 0.3, -222); ctx.stroke();

  // blossom clusters, cel-shaded in three tones
  const tones = [
    [mix('#e07aa6', '#45347a', p), 0, 0, 1],
    [mix('#ffb8d2', '#7b62ac', p), -0.14, -0.18, 0.82],
    [mix('#ffe4ef', '#b19ad8', p), -0.28, -0.36, 0.45],
  ];
  for (const [col, ox, oy, rs] of tones) {
    ctx.fillStyle = col;
    for (const c of canopy) {
      const s = sway * (1 + c.y / -200);
      ctx.beginPath();
      ctx.arc(c.x + s + c.r * ox, c.y + c.r * oy, c.r * rs, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* -------------------------------------------------- draw: the two of them */
function palette(p) {
  return {
    skin: mix('#f3c3a6', '#6a587e', p),
    rim: mix('#ffcf94', '#a9b9ff', p, 0.85),
    boyHair: mix('#2b2236', '#100d20', p),
    boyHairHi: mix('#5a4a6e', '#2c2a52', p),
    jacket: mix('#3a5aa8', '#1a2252', p),
    jacketSh: mix('#2a3f7c', '#10163a', p),
    girlHair: mix('#5b2c3a', '#1d0f22', p),
    girlHairHi: mix('#9a4d5e', '#3c2650', p),
    cardigan: mix('#f6dbe4', '#4b3e6a', p),
    cardiganSh: mix('#d9aec0', '#2f2750', p),
    ribbon: mix('#e8304f', '#7c1f44', p),
  };
}

function rimStroke(c, w = 1.6) {
  ctx.strokeStyle = c.rim;
  ctx.lineWidth = w;
  ctx.stroke();
}

function limb(c, color, x1, y1, ex, ey, x2, y2, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(ex, ey, x2, y2);
  ctx.stroke();
  ctx.fillStyle = c.skin;
  ctx.beginPath(); ctx.arc(x2, y2, w * 0.42, 0, Math.PI * 2); ctx.fill();
}

function drawDyas(c, t, hold) {
  // sitting, seen from behind
  limb(c, c.jacket, -22, -86, -40, -50, -38, -6, 12);
  limb(c, c.jacket, 22, -86, 38 + hold * 6, -48, lerp(34, 49, hold), -6 + hold * 2, 12); // reaching for Naswa

  ctx.fillStyle = c.jacketSh;
  ctx.beginPath(); ctx.ellipse(0, -2, 30, 8, 0, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-25, 0);
  ctx.lineTo(-27, -60);
  ctx.quadraticCurveTo(-30, -92, -12, -96);
  ctx.lineTo(12, -96);
  ctx.quadraticCurveTo(30, -92, 27, -60);
  ctx.lineTo(25, 0);
  ctx.closePath();
  ctx.fillStyle = c.jacket;
  ctx.fill();
  rimStroke(c);
  ctx.save(); ctx.clip();
  ctx.fillStyle = c.jacketSh;
  ctx.fillRect(6, -100, 30, 104);
  ctx.fillRect(-30, -14, 60, 4);
  ctx.restore();
  ctx.fillStyle = c.jacketSh;
  ctx.beginPath(); ctx.ellipse(0, -90, 15, 9, 0, 0, Math.PI); ctx.fill(); // hood

  ctx.fillStyle = c.skin;
  ctx.beginPath(); ctx.ellipse(-21, -120, 4, 6, 0, 0, Math.PI * 2); ctx.ellipse(21, -120, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-6, -106, 12, 12);
  const w = Math.sin(t * 2.6) * 1.6;
  ctx.beginPath();
  ctx.arc(0, -124, 22, Math.PI * 0.95, Math.PI * 0.05, false);
  const nape = [[22, -112], [17, -103], [12, -108], [6, -99], [0, -107], [-6, -99], [-12, -108], [-17, -102], [-22, -112]];
  for (const [x, y] of nape) ctx.lineTo(x + w * 0.3, y);
  ctx.closePath();
  ctx.fillStyle = c.boyHair;
  ctx.fill();
  rimStroke(c);
  // spiky tufts in the breeze
  ctx.beginPath();
  ctx.moveTo(-10, -144); ctx.lineTo(-4 + w, -156); ctx.lineTo(2, -145);
  ctx.moveTo(4, -146); ctx.lineTo(14 + w * 1.4, -152); ctx.lineTo(13, -140);
  ctx.moveTo(-18, -136); ctx.lineTo(-28 + w, -140); ctx.lineTo(-21, -128);
  ctx.fill();
  ctx.strokeStyle = c.boyHairHi;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-4, -128, 13, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
}

function drawNaswa(c, t, hold) {
  limb(c, c.cardigan, 20, -82, 36, -46, 34, -6, 11);
  limb(c, c.cardigan, -20, -82, -34 - hold * 6, -46, lerp(-33, -47, hold), -6 + hold * 2, 11);

  ctx.fillStyle = c.cardiganSh;
  ctx.beginPath(); ctx.ellipse(0, -2, 30, 9, 0, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.lineTo(-23, -58);
  ctx.quadraticCurveTo(-25, -86, -10, -90);
  ctx.lineTo(10, -90);
  ctx.quadraticCurveTo(25, -86, 23, -58);
  ctx.lineTo(24, 0);
  ctx.closePath();
  ctx.fillStyle = c.cardigan;
  ctx.fill();
  rimStroke(c);
  ctx.save(); ctx.clip();
  ctx.fillStyle = c.cardiganSh;
  ctx.fillRect(5, -95, 30, 100);
  ctx.restore();

  // her head leans onto Dyas' shoulder as they hold hands
  ctx.save();
  ctx.translate(0, -100);
  ctx.rotate(-0.22 * hold);
  ctx.translate(-hold * 4, 0);
  ctx.fillStyle = c.skin;
  ctx.fillRect(-5, -8, 10, 12);

  // long hair, streaming with the wind
  const w1 = Math.sin(t * 1.9) * 4 + 4;
  const w2 = Math.sin(t * 1.9 - 0.8) * 7 + 8;
  ctx.beginPath();
  ctx.moveTo(-21, -18);
  ctx.arc(0, -20, 21, Math.PI, 0, false);
  ctx.bezierCurveTo(26, 4, 26 + w1, 30, 24 + w2, 58);
  const tips = 7;
  for (let i = 0; i <= tips; i++) {
    const f = i / tips;
    ctx.lineTo(lerp(24 + w2, -22 + w2 * 0.6, f), 58 + (i % 2 ? -7 : 2) + Math.sin(t * 3 + i) * 1.5);
  }
  ctx.bezierCurveTo(-24 + w1 * 0.5, 30, -26, 4, -21, -18);
  ctx.fillStyle = c.girlHair;
  ctx.fill();
  rimStroke(c);
  ctx.strokeStyle = c.girlHairHi;
  ctx.lineWidth = 1.6;
  for (const dx of [-10, 0, 10]) {
    ctx.beginPath();
    ctx.moveTo(dx, -30);
    ctx.bezierCurveTo(dx + 2, 0, dx + w1 * 0.5, 25, dx + w2 * 0.7, 48);
    ctx.stroke();
  }
  // ribbon
  ctx.fillStyle = c.ribbon;
  ctx.save();
  ctx.translate(6, -26);
  ctx.rotate(Math.sin(t * 2.4) * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-13, -8); ctx.lineTo(-12, 7); ctx.closePath();
  ctx.moveTo(0, 0); ctx.lineTo(13, -8); ctx.lineTo(12, 7); ctx.closePath();
  ctx.moveTo(-2, 2); ctx.lineTo(-6 + w1 * 0.4, 18); ctx.lineTo(-2, 16); ctx.closePath();
  ctx.moveTo(2, 2); ctx.lineTo(5 + w1 * 0.5, 19); ctx.lineTo(7, 15); ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

let heartBorn = 0;
function drawCouple(p, t, pan, hold) {
  const c = palette(p);
  const k = U * 0.95;
  const cx = crestX();
  for (const [x, draw] of [[cx - 50 * k, drawDyas], [cx + 50 * k, drawNaswa]]) {
    ctx.save();
    ctx.translate(x, hillY(x) + pan + 6 * k);
    ctx.scale(k, k);
    draw(c, t, hold);
    ctx.restore();
  }
  // a little heart rises from where their hands meet
  if (heartBorn) {
    const age = t - heartBorn;
    const a = clamp(1 - age / 2.6);
    if (a > 0) {
      ctx.fillStyle = `rgba(255,95,150,${a})`;
      ctx.save();
      ctx.translate(cx, hillY(cx) + pan - (30 + age * 26) * k);
      const s = (1 + Math.sin(age * 10) * 0.1) * k * 0.8;
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.bezierCurveTo(-20, -2, -16, -20, 0, -10);
      ctx.bezierCurveTo(16, -20, 20, -2, 0, 12);
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ------------------------------------------------- petals & fireflies */
function updatePetals(dt, t, p, pan) {
  const want = reduced ? 25 : W < 600 ? 60 : 110;
  while (petals.length < want) {
    const fromTree = Math.random() < 0.6;
    const tx = crestX() - 250 * U;
    petals.push({
      x: fromTree ? tx + rand(-150, 160) * U : rand(-0.2, 1) * W,
      y: fromTree ? hillY(tx) - rand(180, 300) * U : rand(-0.1, 0.5) * H,
      vx: rand(20, 55), vy: rand(14, 34),
      r: rand(3, 6) * Math.max(U, 0.7),
      rot: Math.random() * 6, spin: rand(-2.5, 2.5), flip: Math.random() * 6,
      ph: Math.random() * 6,
    });
  }
  ctx.fillStyle = mix('#ffc6da', '#c9a6e6', p, 0.92);
  for (let i = petals.length - 1; i >= 0; i--) {
    const q = petals[i];
    q.x += (q.vx + Math.sin(t + q.ph) * 18) * dt;
    q.y += q.vy * dt;
    q.rot += q.spin * dt;
    q.flip += dt * 3;
    if (q.x > W + 20 || q.y > H + 20) { petals.splice(i, 1); continue; }
    ctx.save();
    ctx.translate(q.x, q.y + pan * 0.9);
    ctx.rotate(q.rot);
    ctx.scale(Math.cos(q.flip), 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, q.r, q.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFireflies(p, t, pan) {
  if (p < 0.4) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flies) {
    const x = f.x * W + Math.sin(t * 0.4 + f.s) * 30;
    const y = Math.max(hillY(x) + 14, f.y * H) + Math.cos(t * 0.5 + f.s * 2) * 14 + pan;
    const a = (p - 0.4) * 1.6 * (0.3 + 0.7 * Math.sin(t * 1.7 + f.s) ** 2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
    g.addColorStop(0, `rgba(255,250,170,${a})`);
    g.addColorStop(1, 'rgba(200,255,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 9, y - 9, 18, 18);
  }
  ctx.restore();
}

/* ------------------------------------------------------------ title card */
const titleEl = document.getElementById('title-card');
let titleShown = false;
function showTitle() {
  titleShown = true;
  titleEl.hidden = false;
  requestAnimationFrame(() => titleEl.classList.add('show'));
  fx.ambient = true;
  fx.celebrate();
  document.getElementById('replay').hidden = false;
  document.getElementById('tap-hint').hidden = false;
}

/* ------------------------------------------------------------ the loop */
let last = performance.now();
let nextFirework = 0;
let afterIndex = 0;
let nextAfter = 0;
const look = { x: 0, y: 0, tx: 0, ty: 0 };

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;
  const T = started ? (now - T0) / 1000 : 0;

  const p = smooth(beats.dusk[0], beats.dusk[1], T);
  const pan = (1 - smooth(beats.pan[0], beats.pan[1], T)) * H * 0.5;
  const hold = smooth(beats.hold[0], beats.hold[1], T);
  if (hold > 0.95 && !heartBorn) heartBorn = t;

  if (started) {
    while (subIndex + 1 < SUBS.length && T >= SUBS[subIndex + 1][0]) {
      subIndex++;
      showSub(SUBS[subIndex][1], SUBS[subIndex][2]);
    }
    if (T >= beats.title && !titleShown) {
      showTitle();
      nextAfter = T + 6;
    }
    if (titleShown && T > nextAfter) {
      const [who, line] = AFTER[afterIndex % AFTER.length];
      showSub(who, line);
      afterIndex++;
      nextAfter = T + 7;
    }
    if (T > beats.title - 0.5 && T > nextFirework && !reduced) {
      launchFirework();
      nextFirework = T + rand(0.6, 1.6);
    }
  }
  fx.night = p > 0.8;

  look.x += (look.tx - look.x) * Math.min(1, dt * 2);
  look.y += (look.ty - look.y) * Math.min(1, dt * 2);

  ctx.clearRect(0, 0, W, H);
  // three parallax layers: sky, distance, foreground
  ctx.save();
  ctx.translate(-look.x * 6, -look.y * 4);
  drawSky(p, t, pan);
  drawFireworks(dt);
  drawComet(T);
  ctx.restore();
  ctx.save();
  ctx.translate(-look.x * 10, -look.y * 6);
  drawClouds(p, t, pan);
  drawCity(p, t, pan);
  ctx.restore();
  ctx.save();
  ctx.translate(-look.x * 18, -look.y * 10);
  drawPole(p, pan);
  drawHill(p, t, pan);
  drawTree(p, t, pan);
  drawCouple(p, t, pan, hold);
  drawFireflies(p, t, pan);
  ctx.restore();
  updatePetals(dt, t, p, pan);

  // warm light leak in the corner while the sun is up
  const leak = (1 - p) * 0.35;
  if (leak > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(W, 0, 0, W, 0, Math.max(W, H) * 0.8);
    g.addColorStop(0, `rgba(255,190,140,${leak})`);
    g.addColorStop(1, 'rgba(255,120,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  fx.update(dt, started);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------- controls */
// the soundtrack: "Calm" by prettyjohn1; if it can't load, the built-in song plays instead
const MUSIC_URL = 'https://raw.githubusercontent.com/Ghanimsokaki/jbuf/main/prettyjohn1-calm-537656.mp3';
const track = new Audio(MUSIC_URL);
track.loop = true;
track.preload = 'auto';
track.volume = 0;
const song = new LoveSong({ music: false });
let muted = false;

function fadeTrack(to, ms = 2500) {
  const from = track.volume;
  const start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / ms);
    track.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function playMusic() {
  song.start();
  track.currentTime = 0;
  track.play().then(() => fadeTrack(muted ? 0 : 0.8)).catch(() => {
    // no recorded song available: fall back to the generated one
    song.music = true;
    song.ctx && song.ctx.close();
    song.ctx = null;
    song.start();
    song.setMuted(muted);
  });
}

const intro = document.getElementById('intro');
const soundBtn = document.getElementById('sound');

function begin() {
  started = true;
  T0 = performance.now();
  subIndex = -1;
  heartBorn = 0;
  titleShown = false;
  afterIndex = 0;
  nextFirework = 0;
  fireworks = [];
  fx.ambient = false;
  titleEl.classList.remove('show');
  titleEl.hidden = true;
  subEl.classList.remove('show');
  document.getElementById('replay').hidden = true;
  document.getElementById('tap-hint').hidden = true;
}

document.getElementById('start').addEventListener('click', () => {
  intro.classList.add('gone');
  soundBtn.hidden = false;
  playMusic();
  begin();
});

soundBtn.addEventListener('click', () => {
  const on = soundBtn.getAttribute('aria-pressed') === 'true';
  soundBtn.setAttribute('aria-pressed', String(!on));
  soundBtn.setAttribute('aria-label', on ? 'Play music' : 'Mute music');
  muted = on;
  song.setMuted(on);
  fadeTrack(on ? 0 : 0.8, 500);
});

document.getElementById('replay').addEventListener('click', () => {
  track.currentTime = 0;
  begin();
});

window.addEventListener('pointerdown', (e) => {
  if (!started || e.target.closest('button')) return;
  fx.burst(e.clientX, e.clientY);
  song.chime();
});
window.addEventListener('pointermove', (e) => {
  look.tx = (e.clientX / W) * 2 - 1;
  look.ty = (e.clientY / H) * 2 - 1;
});
window.addEventListener('resize', resize);

resize();
build();
requestAnimationFrame(frame);
