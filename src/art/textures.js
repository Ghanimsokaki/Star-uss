import * as THREE from 'three';

const cache = new Map();
const S = (n) => Math.round((value) => value * n);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, { srgb = false, repeat = 1, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* ---------------------------------------------------------------- noise */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function noise2(x, y, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function fbm(x, y, seed = 1, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(x * f, y * f, seed + i * 17);
    amp *= 0.5; f *= 2.03;
  }
  return v;
}

/* ---------------------------------------------------------------- hull */
/** Starfleet hull plating: albedo + bump + roughness + window lights. */
export function hullTextures(paletteId = 'starfleet', detail = 1) {
  const key = `hull:${paletteId}:${detail}`;
  if (cache.has(key)) return cache.get(key);
  const size = detail > 0.7 ? 768 : 512;
  const base = {
    starfleet: ['#b9c3cf', '#8e9aa8'],
    refit: ['#e8eef5', '#b7c2cd'],
    terran: ['#333a45', '#1b2028'],
    andorian: ['#93b6cf', '#6f93ac'],
    vulcan: ['#a0937f', '#7a6f5e'],
    section31: ['#242a33', '#141a21'],
  }[paletteId] || ['#b9c3cf', '#8e9aa8'];

  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = base[0]; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const [r1, g1, b1] = hexToRgb(base[0]);
  const [r2, g2, b2] = hexToRgb(base[1]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = fbm(x / 64, y / 64, 7, 4);
      const grime = fbm(x / 20, y / 20, 31, 3) * 0.16;
      const t = n * 0.55 + grime;
      d[i] = r1 * (1 - t) + r2 * t;
      d[i + 1] = g1 * (1 - t) + g2 * t;
      d[i + 2] = b1 * (1 - t) + b2 * t;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // panel lines
  g.lineWidth = 1;
  const panels = 18;
  for (let i = 0; i <= panels; i++) {
    const p = (i / panels) * size;
    g.strokeStyle = 'rgba(20,30,42,0.30)';
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    if (i % 3 === 0) {
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.beginPath(); g.moveTo(p + 1, 0); g.lineTo(p + 1, size); g.stroke();
      g.beginPath(); g.moveTo(0, p + 1); g.lineTo(size, p + 1); g.stroke();
    }
  }
  // hull plate variations
  for (let i = 0; i < 46; i++) {
    const w = 20 + Math.random() * 110;
    const h = 14 + Math.random() * 80;
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '20,28,40'},${0.02 + Math.random() * 0.05})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(15,22,32,0.24)';
    g.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  // tiny greebles
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.fillStyle = `rgba(10,16,24,${0.1 + Math.random() * 0.25})`;
    g.fillRect(x, y, 2 + Math.random() * 7, 1 + Math.random() * 4);
  }

  // window lights (emissive map)
  const e = canvas(size, size);
  const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, size, size);
  for (let row = 0; row < 26; row++) {
    const y = 20 + row * (size / 27);
    for (let col = 0; col < 40; col++) {
      if (Math.random() > 0.55) continue;
      const x = 14 + col * (size / 41) + Math.random() * 3;
      const lit = Math.random() > 0.25;
      ge.fillStyle = lit ? `rgba(255,${200 + Math.random() * 40},${140 + Math.random() * 60},${0.5 + Math.random() * 0.5})` : 'rgba(90,120,150,0.25)';
      ge.fillRect(x, y, 3 + Math.random() * 2, 1.4);
    }
  }
  const rough = canvas(size, size);
  const gr = rough.getContext('2d');
  gr.fillStyle = '#8c8c8c'; gr.fillRect(0, 0, size, size);
  for (let i = 0; i < 200; i++) {
    gr.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '40,40,40'},${0.05 + Math.random() * 0.15})`;
    gr.fillRect(Math.random() * size, Math.random() * size, 30 + Math.random() * 120, 20 + Math.random() * 90);
  }

  const roughnessTex = toTex(rough, { repeat: 2, aniso: 8 });
  const out = {
    map: toTex(c, { srgb: true, repeat: 2, aniso: 8 }),
    emissiveMap: toTex(e, { repeat: 2, aniso: 8 }),
    roughnessMap: roughnessTex,
    bumpMap: roughnessTex,
  };
  cache.set(key, out);
  return out;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* ---------------------------------------------------------------- sprites */
export function glowTexture(inner = '#ffffff', outer = 'rgba(255,255,255,0)', size = 128) {
  const key = `glow:${inner}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner);
  grd.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = toTex(c, { srgb: true, aniso: 1 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

export function starSpriteTexture() {
  if (cache.has('starsprite')) return cache.get('starsprite');
  const size = 64;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(220,240,255,0.9)');
  grd.addColorStop(0.4, 'rgba(150,200,255,0.25)');
  grd.addColorStop(1, 'rgba(80,140,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(size / 2, 3); g.lineTo(size / 2, size - 3); g.stroke();
  g.beginPath(); g.moveTo(3, size / 2); g.lineTo(size - 3, size / 2); g.stroke();
  const t = toTex(c, { srgb: true, aniso: 1 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('starsprite', t);
  return t;
}

export function ringTexture(color = '#d9c7a8') {
  const key = `ring:${color}`;
  if (cache.has(key)) return cache.get(key);
  const w = 512, h = 8;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, 0);
  const [r, gg, b] = hexToRgb(color);
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const a = 0.4 + 0.5 * Math.abs(Math.sin(t * 22 + 1.4)) * (t < 0.12 ? 0.3 : 1);
    grd.addColorStop(t, `rgba(${r},${gg},${b},${a.toFixed(3)})`);
  }
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const t = toTex(c, { srgb: true, aniso: 4 });
  t.wrapS = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

/* ---------------------------------------------------------------- sky */
export function nebulaTexture(seed = 1, w = 1536, h = 768) {
  seed = seed % 2;
  const key = `nebula:${seed}:${w}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#02040a';
  g.fillRect(0, 0, w, h);

  // deep-space dust clouds
  const hues = [[90, 60, 160], [40, 90, 160], [160, 70, 130], [30, 120, 140], [120, 90, 60]];
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 90 + Math.random() * 380;
    const [rr, gg, bb] = hues[i % hues.length];
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + Math.random() * 0.1;
    grd.addColorStop(0, `rgba(${rr},${gg},${bb},${a})`);
    grd.addColorStop(0.55, `rgba(${rr},${gg},${bb},${a * 0.4})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // bright nebula core
  for (let i = 0; i < 6; i++) {
    const x = w * (0.15 + Math.random() * 0.7);
    const y = h * (0.2 + Math.random() * 0.6);
    const r = 120 + Math.random() * 220;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(150,120,255,0.16)');
    grd.addColorStop(0.4, 'rgba(90,160,255,0.07)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // stars
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const s = Math.random();
    if (s < 0.82) {
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
      g.fillRect(x, y, 1, 1);
    } else if (s < 0.96) {
      g.fillStyle = `rgba(200,225,255,${0.4 + Math.random() * 0.55})`;
      g.fillRect(x, y, 1.6, 1.6);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(x, y, 2.4, 2.4);
      g.fillStyle = 'rgba(170,210,255,0.25)';
      g.fillRect(x - 2, y, 6.5, 1);
      g.fillRect(x, y - 2, 1, 6.5);
    }
  }
  // subtle galactic band
  const band = g.createLinearGradient(0, h * 0.35, 0, h * 0.65);
  band.addColorStop(0, 'rgba(120,140,220,0)');
  band.addColorStop(0.5, 'rgba(150,170,255,0.05)');
  band.addColorStop(1, 'rgba(120,140,220,0)');
  g.fillStyle = band; g.fillRect(0, h * 0.35, w, h * 0.3);

  const t = toTex(c, { srgb: true, aniso: 2 });
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.wrapS = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

export function environmentTexture() {
  if (cache.has('env')) return cache.get('env');
  const c = canvas(1024, 512);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#0a1220');
  grd.addColorStop(0.45, '#060b14');
  grd.addColorStop(0.5, '#132033');
  grd.addColorStop(1, '#03060c');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512;
    const r = 4 + Math.random() * 26;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${140 + Math.random() * 80},${180 + Math.random() * 60},255,${0.12 + Math.random() * 0.25})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = toTex(c, { srgb: true, aniso: 2 });
  t.mapping = THREE.EquirectangularReflectionMapping;
  cache.set('env', t);
  return t;
}

/* ---------------------------------------------------------------- planets */
export function planetTexture(typeId, seed = 1, detail = 1) {
  const key = `planet:${typeId}:${seed % 4}:0`;
  if (cache.has(key)) return cache.get(key);
  const w = detail > 0.7 ? 512 : 384;
  const h = w / 2;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const palettes = {
    m: ['#1d4f7d', '#2d6f8f', '#3f7f4a', '#6f8f4e', '#cfc9a8'],
    ocean: ['#0d2d55', '#14507f', '#1d6f9f', '#63b6d8'],
    desert: ['#8a5426', '#b8763a', '#d3a469', '#e0c38c'],
    ice: ['#5b7f96', '#9fc7de', '#cfe4f0', '#f0f8ff'],
    volcanic: ['#1a0e0a', '#5c2118', '#a8421f', '#ff7a3d'],
    gas: ['#8a5a38', '#c9a06a', '#e6d3b0', '#a87a4a'],
    barren: ['#4a4945', '#7a7873', '#a8a49e', '#c8c4bd'],
    toxic: ['#2a3010', '#5c6b1e', '#8a9a32', '#c9d95a'],
    rogue: ['#0d1420', '#1f2f45', '#33475f', '#5a6f85'],
  };
  const pal = palettes[typeId] || palettes.barren;
  const cols = pal.map(hexToRgb);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const nx = x / w, ny = y / h;
      let v;
      if (typeId === 'gas') {
        const band = Math.sin(ny * 42 + fbm(nx * 3, ny * 9, seed, 3) * 3.2) * 0.5 + 0.5;
        v = band * 0.75 + fbm(nx * 8, ny * 30, seed + 3, 4) * 0.25;
        // great storm
        const sx = 0.32 + 0.06 * Math.sin(seed), sy = 0.62;
        const ds = Math.hypot((nx - sx) * 2.2, (ny - sy) * 4.2);
        if (ds < 0.13) v = Math.min(1, v + (0.13 - ds) * 3.4);
      } else if (typeId === 'ice') {
        v = fbm(nx * 4, ny * 8, seed, 5) * 0.55 + Math.pow(Math.abs(Math.sin(lat)), 0.6) * 0.45;
      } else if (typeId === 'volcanic') {
        v = Math.pow(fbm(nx * 5, ny * 5, seed, 5), 1.6);
        const lava = fbm(nx * 12, ny * 12, seed + 9, 3);
        if (lava > 0.66) v = Math.min(1, v + (lava - 0.66) * 3.6);
      } else if (typeId === 'm') {
        const n = fbm(nx * 3.4, ny * 6.4, seed, 5);
        const cont = fbm(nx * 2 + 10, ny * 4 + 4, seed + 21, 4);
        v = n * 0.45 + cont * 0.55;
        v = v > 0.52 ? 0.55 + (v - 0.52) * 1.1 : v * 0.5;
      } else {
        v = fbm(nx * 4, ny * 7, seed, 5) * 0.7 + fbm(nx * 14, ny * 20, seed + 5, 3) * 0.3;
      }
      v = Math.max(0, Math.min(0.999, v));
      const t = v * (cols.length - 1);
      const i0 = Math.floor(t), i1 = Math.min(cols.length - 1, i0 + 1);
      const ft = t - i0;
      const i = (y * w + x) * 4;
      d[i] = cols[i0][0] * (1 - ft) + cols[i1][0] * ft;
      d[i + 1] = cols[i0][1] * (1 - ft) + cols[i1][1] * ft;
      d[i + 2] = cols[i0][2] * (1 - ft) + cols[i1][2] * ft;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // polar caps for water/terrestrial worlds
  if (['m', 'ocean', 'desert', 'ice'].includes(typeId)) {
    const cap = g.createLinearGradient(0, 0, 0, h);
    cap.addColorStop(0, 'rgba(255,255,255,0.55)');
    cap.addColorStop(0.12, 'rgba(255,255,255,0.0)');
    cap.addColorStop(0.88, 'rgba(255,255,255,0.0)');
    cap.addColorStop(1, 'rgba(255,255,255,0.55)');
    g.fillStyle = cap; g.fillRect(0, 0, w, h);
  }
  const t = toTex(c, { srgb: true, aniso: 4, repeat: 1 });
  t.wrapS = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

export function cloudTexture(seed = 3, detail = 1) {
  const key = `clouds:${seed % 5}:${detail}`;
  if (cache.has(key)) return cache.get(key);
  const w = detail > 0.7 ? 512 : 384;
  const h = w / 2;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w, ny = y / h;
      let v = fbm(nx * 6, ny * 12, seed + 4, 5);
      v = Math.max(0, v - 0.42) * 2.4;
      v *= 0.7 + Math.sin(ny * Math.PI) * 0.4;
      const i = (y * w + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.min(255, v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = toTex(c, { srgb: true, aniso: 4 });
  t.wrapS = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/* ---------------------------------------------------------------- decals */
export function registryTexture(name, registry, accent = '#20262e') {
  const key = `registry:${name}:${registry}:${accent}`;
  if (cache.has(key)) return cache.get(key);
  const w = 1024, h = 256;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = accent;
  g.font = '600 62px "Rajdhani", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(name).toUpperCase(), w / 2, h * 0.38);
  g.font = '500 46px "Rajdhani", "Segoe UI", sans-serif';
  g.fillStyle = accent;
  g.fillText(String(registry).toUpperCase(), w / 2, h * 0.68);
  g.fillStyle = accent;
  g.fillRect(w * 0.32, h * 0.53, w * 0.36, 2);
  const t = toTex(c, { srgb: true, aniso: 4 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

export function emblemTexture() {
  if (cache.has('emblem')) return cache.get('emblem');
  const s = 256;
  const c = canvas(s, s);
  const g = c.getContext('2d');
  g.clearRect(0, 0, s, s);
  g.strokeStyle = '#1b2430';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.12);
  g.bezierCurveTo(s * 0.9, s * 0.2, s * 0.85, s * 0.7, s * 0.5, s * 0.9);
  g.bezierCurveTo(s * 0.15, s * 0.7, s * 0.1, s * 0.2, s * 0.5, s * 0.12);
  g.stroke();
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.22);
  g.bezierCurveTo(s * 0.78, s * 0.32, s * 0.72, s * 0.66, s * 0.5, s * 0.78);
  g.bezierCurveTo(s * 0.28, s * 0.66, s * 0.22, s * 0.32, s * 0.5, s * 0.22);
  g.stroke();
  const t = toTex(c, { srgb: true, aniso: 2 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set('emblem', t);
  return t;
}

/** Full-screen starfield points for scene backgrounds (efficient). */
export function starfield(count = 2400, radius = 900, spread = 0.35) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const colors = [
    [0.75, 0.85, 1], [1, 1, 1], [1, 0.9, 0.75], [0.7, 0.95, 1], [1, 0.75, 0.7],
  ];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = radius * (0.6 + Math.random() * 0.4);
    const phi = Math.acos(u);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * spread;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = colors[(Math.random() * colors.length) | 0];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    size[i] = Math.random() < 0.04 ? 3.2 : 0.8 + Math.random() * 1.6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  return geo;
}
