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
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hullTextures(paletteId = 'starfleet', detail = 1) {
  const key = `hull:${paletteId}:${detail}`;
  if (cache.has(key)) return cache.get(key);
  const size = detail > 0.7 ? 1024 : 512;
  const base = {
    starfleet: ['#c2ccd8', '#94a1b0'],
    refit: ['#eef3f8', '#c3ccd6'],
    terran: ['#39404c', '#1e242c'],
    andorian: ['#9cbfd8', '#7498b2'],
    vulcan: ['#a89b86', '#7f7462'],
    section31: ['#282f39', '#171d24'],
  }[paletteId] || ['#c2ccd8', '#94a1b0'];

  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = base[0]; g.fillRect(0, 0, size, size);

  // ---- base plating: layered fbm gives a brushed, slightly weathered alloy
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const [r1, g1, b1] = hexToRgb(base[0]);
  const [r2, g2, b2] = hexToRgb(base[1]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = fbm(x / 150, y / 150, 7, 4) * 0.5 + fbm(x / 34, y / 34, 19, 3) * 0.34;
      const grime = fbm(x / 12, y / 12, 31, 2) * 0.09;
      const t = clamp01(n * 0.6 + grime);
      d[i] = r1 * (1 - t) + r2 * t;
      d[i + 1] = g1 * (1 - t) + g2 * t;
      d[i + 2] = b1 * (1 - t) + b2 * t;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // ---- hull plating: staggered rectangles with bevel highlights, like a real starship skin
  const plateRows = 16;
  const rowH = size / plateRows;
  for (let row = 0; row < plateRows; row++) {
    let x = -Math.random() * 90;
    while (x < size) {
      const w = 60 + Math.random() * 140;
      const y = row * rowH;
      const shade = Math.random();
      g.fillStyle = shade > 0.5
        ? `rgba(255,255,255,${0.02 + Math.random() * 0.05})`
        : `rgba(18,26,38,${0.02 + Math.random() * 0.06})`;
      g.fillRect(x, y, w, rowH);
      // seam lines: dark inside, light bevel above
      g.strokeStyle = 'rgba(10,16,26,0.34)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w, rowH);
      g.strokeStyle = 'rgba(255,255,255,0.13)';
      g.beginPath(); g.moveTo(x + 1, y + 1.5); g.lineTo(x + w, y + 1.5); g.stroke();
      x += w;
    }
  }

  // ---- longitudinal seams and a few larger structural bands
  g.strokeStyle = 'rgba(8,14,22,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const x = (i / 7) * size + Math.random() * 8;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke();
  }
  g.strokeStyle = 'rgba(8,14,22,0.34)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * size;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 90, size); g.stroke();
  }

  // ---- micro detail: fasteners, hatches, vents
  for (let i = 0; i < 520; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.fillStyle = `rgba(12,18,26,${0.08 + Math.random() * 0.22})`;
    g.fillRect(x, y, 1.5 + Math.random() * 5, 1 + Math.random() * 2.4);
  }
  for (let i = 0; i < 44; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const w = 10 + Math.random() * 30, h = 6 + Math.random() * 16;
    g.fillStyle = 'rgba(16,24,34,0.22)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.strokeRect(x + 0.5, y + 0.5, w, h);
    // vent slats
    g.fillStyle = 'rgba(8,12,18,0.3)';
    for (let k = 1; k < 5; k++) g.fillRect(x + 2, y + (h / 5) * k, w - 4, 1);
  }

  // ---- registry / hull stripes (faint, uniform-accurate)
  g.fillStyle = 'rgba(196,84,64,0.22)';
  g.fillRect(0, size * 0.46, size, 3);
  g.fillStyle = 'rgba(90,150,190,0.16)';
  g.fillRect(0, size * 0.478, size, 2);

  // ---- window lights (emissive map): rows of lit windows with occasional dark ones
  const e = canvas(size, size);
  const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, size, size);
  const rows = 30, cols = 46;
  for (let row = 0; row < rows; row++) {
    const y = 18 + row * (size / (rows + 2));
    for (let col = 0; col < cols; col++) {
      if (Math.random() > 0.5) continue;
      const x = 12 + col * (size / (cols + 2)) + Math.random() * 2;
      const lit = Math.random() > 0.22;
      ge.fillStyle = lit
        ? `rgba(255,${205 + Math.random() * 35 | 0},${150 + Math.random() * 60 | 0},${0.55 + Math.random() * 0.45})`
        : 'rgba(70,100,130,0.22)';
      ge.fillRect(x, y, 3 + Math.random() * 2.5, 1.3);
    }
  }
  // a couple of big windows on the saucer rim
  ge.fillStyle = 'rgba(150,220,255,0.75)';
  for (let i = 0; i < 10; i++) ge.fillRect(Math.random() * size, size * 0.2 + Math.random() * 24, 9, 2);

  // ---- roughness / bump: mid rough metal with smooth plate tops and scuffed patches
  const rough = canvas(size, size);
  const gr = rough.getContext('2d');
  gr.fillStyle = '#7a7a7a'; gr.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const v = Math.random() > 0.5 ? '255,255,255' : '30,30,30';
    gr.fillStyle = `rgba(${v},${0.04 + Math.random() * 0.14})`;
    gr.fillRect(Math.random() * size, Math.random() * size, 40 + Math.random() * 160, 24 + Math.random() * 110);
  }
  // repaint seams slightly rougher so the bump catches them
  gr.strokeStyle = 'rgba(20,20,20,0.30)';
  gr.lineWidth = 1.4;
  for (let row = 0; row <= plateRows; row++) {
    const y = row * rowH;
    gr.beginPath(); gr.moveTo(0, y); gr.lineTo(size, y); gr.stroke();
  }

  // ---- normal map derived from the same seam pattern (gives real panel relief)
  const normalSrc = canvas(size, size);
  const gn = normalSrc.getContext('2d');
  gn.fillStyle = '#8080ff'; gn.fillRect(0, 0, size, size);
  const nimg = gn.getImageData(0, 0, size, size);
  const nd = nimg.data;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const seamX = Math.abs((x % (size / 7)) - 0) < 3 ? 1 : 0;
      const seamY = Math.abs((y % rowH)) < 2 ? 1 : 0;
      height[y * size + x] = fbm(x / 26, y / 26, 5, 3) * 0.55 + (seamX || seamY ? 0.6 : 0);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const xl = height[y * size + Math.max(0, x - 1)];
      const xr = height[y * size + Math.min(size - 1, x + 1)];
      const yu = height[Math.max(0, y - 1) * size + x];
      const yd = height[Math.min(size - 1, y + 1) * size + x];
      const nx = (xl - xr) * 2.2;
      const ny = (yu - yd) * 2.2;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nd[i] = ((nx / len) * 0.5 + 0.5) * 255;
      nd[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nd[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }
  gn.putImageData(nimg, 0, 0);

  const roughnessTex = toTex(rough, { repeat: 2, aniso: 8 });
  const out = {
    map: toTex(c, { srgb: true, repeat: 2, aniso: 16 }),
    emissiveMap: toTex(e, { srgb: true, repeat: 2, aniso: 8 }),
    roughnessMap: roughnessTex,
    bumpMap: roughnessTex,
    normalMap: toTex(normalSrc, { repeat: 2, aniso: 8 }),
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
