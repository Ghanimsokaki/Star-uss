/**
 * Device + input-profile detection.
 *
 * Everything the game needs to know about the machine it is running on lives
 * here: the form factor (phone / tablet / desktop), whether the primary pointer
 * is a thumb or a mouse, how powerful the GPU looks, and which *control scheme*
 * should therefore be switched on. The rest of the game reads `device` instead
 * of sniffing user agents, and reacts to `onDeviceChange()` when a tablet gets
 * rotated, a gamepad is plugged in, or the player overrides the guess in
 * Settings.
 *
 * Resolution order for the control scheme:
 *   1. the player's explicit choice in Settings (desktop / mobile)
 *   2. "auto": touch-first if the device is a phone/tablet or the primary
 *      pointer is coarse (no hover), otherwise mouse + keyboard
 */

const UA = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');

function match(q) {
  try {
    return typeof matchMedia === 'function' ? matchMedia(q).matches : false;
  } catch { return false; }
}

export const device = {
  /** mobile | tablet | desktop */
  form: 'desktop',
  /** touch | pointer — which control scheme is active right now */
  scheme: 'pointer',
  /** auto | mobile | desktop — the player's preference */
  pref: 'auto',
  /** the raw facts the guess is built from */
  touch: false,
  coarse: false,
  hover: true,
  gamepad: false,
  /** low | mid | high */
  tier: 'mid',
  cores: 4,
  memory: 4,
  dpr: 1,
  gpu: 'unknown',
  orientation: 'landscape',
  w: 1280,
  h: 720,
  ios: false,
  android: false,
  standalone: false,
  reducedMotion: false,
  /** free-form notes for the settings panel, e.g. ["iPadOS", "touch", "high"] */
  notes: [],
};

const listeners = new Set();
let lastSignature = '';

function detectForm() {
  const ua = UA();
  const touchPoints = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0;
  const isIPadOS = /Macintosh/.test(ua) && touchPoints > 1;
  const isIPhone = /iPhone|iPod/.test(ua);
  const isIPad = /iPad/.test(ua) || isIPadOS;
  const isAndroid = /Android/.test(ua);
  const isPhoneUA = /Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry/i.test(ua);
  const minSide = Math.min(
    (typeof screen !== 'undefined' && screen.width) || 1280,
    (typeof screen !== 'undefined' && screen.height) || 720,
  );
  const coarse = match('(pointer: coarse)') || match('(any-pointer: coarse)');
  const hover = match('(hover: hover)') || match('(any-hover: hover)');

  let form = 'desktop';
  if (isIPad || (isAndroid && !isPhoneUA)) form = 'tablet';
  else if (isPhoneUA || isIPhone) form = 'mobile';
  else if (coarse && !hover && minSide < 820) form = 'mobile';
  else if (coarse && !hover) form = 'tablet';

  return {
    form,
    ios: /iPhone|iPad|iPod|Macintosh/.test(ua) && (touchPoints > 0),
    android: isAndroid,
    touch: touchPoints > 0 || coarse,
    coarse,
    hover,
  };
}

function detectTier(facts) {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const memory = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const gpu = device.gpu === 'unknown' ? '' : device.gpu.toLowerCase();

  let score = 0;
  score += cores >= 8 ? 2 : cores >= 5 ? 1 : 0;
  score += memory >= 8 ? 2 : memory >= 4 ? 1 : 0;
  // a retina phone is not slow because of DPR, but a 3x phone GPU is doing 9x the work
  if (facts.form === 'desktop') score += dpr > 1.5 ? 0 : 1;
  else score -= dpr > 2.5 ? 1 : 0;

  // GPU class is the strongest signal when we can read it
  if (/rtx|radeon rx|apple m\d|arc a\d|geforce gtx 1[6-9]|apple gpu/.test(gpu)) score += 2;
  else if (/intel|uhd|iris|mali-[gt]7|mali-g5|adreno 6|adreno 7/.test(gpu)) score += 0;
  else if (/mali-4|adreno [23]|powervr|swiftshader|software/.test(gpu)) score -= 2;

  if (facts.form === 'mobile' && score > 1) score -= 1;   // never call a phone "high"
  if (facts.form === 'tablet' && score > 2) score -= 1;

  const tier = score >= 3 ? 'high' : score >= 1 ? 'mid' : 'low';
  return { tier, cores, memory, dpr, gpu };
}

function resolveScheme(pref, facts) {
  if (pref === 'mobile') return 'touch';
  if (pref === 'desktop') return 'pointer';
  if (facts.coarse || (facts.touch && !facts.hover)) return 'touch';
  if (facts.form === 'mobile' || facts.form === 'tablet') return 'touch';
  return 'pointer';
}

function applyClasses() {
  if (typeof document === 'undefined' || !document.body) return;
  const b = document.body;
  const isTouch = device.scheme === 'touch';
  b.classList.toggle('touch-mode', isTouch);
  b.classList.toggle('is-touch', isTouch);
  b.classList.toggle('is-pointer', !isTouch);
  b.classList.toggle('is-mobile', device.form === 'mobile');
  b.classList.toggle('is-tablet', device.form === 'tablet');
  b.classList.toggle('is-desktop', device.form === 'desktop');
  b.classList.toggle('tier-low', device.tier === 'low');
  b.classList.toggle('tier-mid', device.tier === 'mid');
  b.classList.toggle('tier-high', device.tier === 'high');
  b.classList.toggle('portrait', device.orientation === 'portrait');
  b.dataset.platform = device.form;
  b.dataset.scheme = device.scheme;
  b.dataset.tier = device.tier;
}

function noteList() {
  const out = [];
  if (device.form === 'mobile') out.push(device.ios ? 'Phone (iOS)' : device.android ? 'Phone (Android)' : 'Phone');
  else if (device.form === 'tablet') out.push(device.ios ? 'Tablet (iPadOS)' : 'Tablet');
  else out.push('Desktop');
  out.push(device.scheme === 'touch' ? 'touch controls' : 'mouse + keyboard');
  out.push(`${device.tier} graphics`);
  return out;
}

/** Re-read the environment. Cheap enough to call on resize (debounced by the caller). */
export function refreshDevice() {
  const facts = detectForm();
  const w = (typeof window !== 'undefined' && window.innerWidth) || 1280;
  const h = (typeof window !== 'undefined' && window.innerHeight) || 720;
  const tierInfo = detectTier(facts);

  device.form = facts.form;
  device.ios = facts.ios;
  device.android = facts.android;
  device.touch = facts.touch;
  device.coarse = facts.coarse;
  device.hover = facts.hover;
  device.cores = tierInfo.cores;
  device.memory = tierInfo.memory;
  device.dpr = tierInfo.dpr;
  device.tier = tierInfo.tier;
  device.w = w;
  device.h = h;
  device.orientation = h >= w ? 'portrait' : 'landscape';
  device.standalone = match('(display-mode: standalone)') || (typeof navigator !== 'undefined' && navigator.standalone === true);
  device.reducedMotion = match('(prefers-reduced-motion: reduce)');
  device.gamepad = !!(typeof navigator !== 'undefined' && navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
  device.scheme = resolveScheme(device.pref, facts);
  device.notes = noteList();
  applyClasses();

  const signature = `${device.form}|${device.scheme}|${device.tier}|${device.orientation}|${device.gamepad}|${device.w}x${device.h}`;
  if (signature !== lastSignature) {
    lastSignature = signature;
    listeners.forEach((fn) => { try { fn(device, signature); } catch (e) { console.warn('[device] listener failed', e); } });
  }
  return device;
}

/** Player override from Settings: auto (default), mobile (touch pad), desktop (mouse + keys). */
export function setControlPreference(pref) {
  device.pref = ['auto', 'mobile', 'desktop'].includes(pref) ? pref : 'auto';
  return refreshDevice();
}

/** Called once by a renderer that can read the GPU string (big tier signal). */
export function reportGPU(renderer) {
  try {
    if (!renderer?.getContext) return device.gpu;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    device.gpu = String(raw || 'unknown').slice(0, 90);
    // re-tier now that we know the GPU
    refreshDevice();
  } catch { /* privacy modes hide it — the CPU heuristic stands */ }
  return device.gpu;
}

export function onDeviceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** One-line summary, used by the settings panel. */
export function describeDevice() {
  return device.notes.join(' · ');
}

/** True when the touch control scheme should be showing. */
export const isTouchScheme = () => device.scheme === 'touch';

let bound = false;
/** Wire up the global listeners once (main.js calls this at boot). */
export function watchDevice() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  let t = 0;
  const later = () => {
    clearTimeout(t);
    t = setTimeout(() => refreshDevice(), 160);
  };
  window.addEventListener('resize', later, { passive: true });
  window.addEventListener('orientationchange', later, { passive: true });
  window.addEventListener('gamepadconnected', later);
  window.addEventListener('gamepaddisconnected', later);
  if (typeof matchMedia === 'function') {
    try {
      matchMedia('(pointer: coarse)').addEventListener('change', later);
      matchMedia('(hover: hover)').addEventListener('change', later);
    } catch { /* older Safari */ }
  }
  refreshDevice();
}
