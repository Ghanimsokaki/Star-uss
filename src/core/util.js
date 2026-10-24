// Small math / formatting helpers shared across the game.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// frame-rate independent damping
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const dampAngle = (current, target, lambda, dt) => {
  let d = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + d * (1 - Math.exp(-lambda * dt));
};
export const randRange = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

export function fmt(n) {
  n = Number(n) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (abs >= 1000) return Math.round(n).toLocaleString('en-US');
  return Math.round(n).toString();
}
export const fmtPct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const pad = (n, l = 2) => String(n).padStart(l, '0');

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// localStorage helpers that never throw (private mode / disabled storage)
export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
};

export const isMobile = () => {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
};

export const uid = () => Math.random().toString(36).slice(2, 9);
