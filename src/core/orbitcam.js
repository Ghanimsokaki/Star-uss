/**
 * Orbit chase camera — "look around while you fly", the way third-person games
 * like Roblox do it.
 *
 *   · mouse: hold the RIGHT button and drag to swing the camera around the
 *     ship; the wheel zooms. A right-click without a drag still fires a torpedo.
 *   · touch: drag on the RIGHT half of the screen to look around, pinch to
 *     zoom. The left half keeps steering, and a quick tap still locks a target.
 *   · the view stays where you leave it; double-click / double-tap (or B)
 *     swings it back behind the ship.
 *
 * Yaw and pitch are offsets relative to the hull, so the camera turns with the
 * ship. The listeners run in the capture phase and stop the event, so a look
 * drag never also steers or fires.
 */
import * as THREE from 'three';

export const LOOK_LIMITS = { minPitch: -1.1, maxPitch: 1.25, minZoom: 0.45, maxZoom: 3.2 };
const DRAG_PX = 5;             // movement before a press counts as a drag
const RAD_PER_PX = 0.0065;

export const clampLook = (yaw, pitch) => {
  // wrap yaw to (-PI, PI] so recentering always takes the short way home
  let y = yaw % (Math.PI * 2);
  if (y > Math.PI) y -= Math.PI * 2;
  if (y <= -Math.PI) y += Math.PI * 2;
  return [y, Math.min(LOOK_LIMITS.maxPitch, Math.max(LOOK_LIMITS.minPitch, pitch))];
};
export const clampZoom = (z) => Math.min(LOOK_LIMITS.maxZoom, Math.max(LOOK_LIMITS.minZoom, z));

/**
 * Where the chase camera sits, given the hull orientation and the look offsets.
 * @param {THREE.Vector3} shipPos
 * @param {THREE.Quaternion} shipQuat
 * @param {number} dist   distance behind the ship at zoom 1
 * @param {number} height height above the ship at zoom 1
 * @param {{yaw:number,pitch:number,zoom:number}} look
 * @returns {{pos:THREE.Vector3, amount:number}} amount: 0 = straight behind, 1 = fully orbiting
 */
export function chaseOffset(shipPos, shipQuat, dist, height, look) {
  const z = clampZoom(look.zoom ?? 1);
  // base: behind and above, in hull space (+Z is the nose)
  const local = new THREE.Vector3(0, height * z, -dist * z);
  local.applyAxisAngle(new THREE.Vector3(1, 0, 0), -look.pitch);
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), look.yaw);
  const pos = local.applyQuaternion(shipQuat).add(shipPos);
  const amount = Math.min(1, Math.abs(look.yaw) / 0.5 + Math.abs(look.pitch) / 0.5);
  return { pos, amount };
}

export class OrbitChase {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ input?: object, isTouch?: () => boolean, enabled?: () => boolean, onRecenter?: () => void }} opts
   */
  constructor(canvas, { input = null, isTouch = () => false, enabled = () => true, onLook = null } = {}) {
    this.canvas = canvas;
    this.input = input;
    this.isTouch = isTouch;
    this.enabled = enabled;
    this.onLook = onLook;
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 1;
    this._goal = null;        // set while easing back behind the ship
    this._ptrs = new Map();
    this._pinch = 0;
    this._lastTap = 0;
    this._bind();
  }

  get looking() { return Math.abs(this.yaw) > 0.04 || Math.abs(this.pitch) > 0.04; }

  recenter() { this._goal = { yaw: 0, pitch: 0 }; }

  rotate(dx, dy) {
    this._goal = null;
    [this.yaw, this.pitch] = clampLook(this.yaw - dx * RAD_PER_PX, this.pitch + dy * RAD_PER_PX);
    this.onLook?.();
  }

  zoomBy(f) { this.zoom = clampZoom(this.zoom * f); }

  update(dt) {
    if (!this._goal) return;
    const k = 1 - Math.exp(-7 * dt);
    this.yaw += (this._goal.yaw - this.yaw) * k;
    this.pitch += (this._goal.pitch - this.pitch) * k;
    if (Math.abs(this.yaw) < 0.002 && Math.abs(this.pitch) < 0.002) {
      this.yaw = 0; this.pitch = 0; this._goal = null;
    }
  }

  /* ------------------------------------------------------------------ input */
  _isLookPress(e) {
    if (!this.enabled()) return false;
    if (e.pointerType === 'mouse' || e.pointerType === undefined) return e.button === 2;
    // touch / pen: the right half of the view is the look pad
    const r = this.canvas.getBoundingClientRect();
    return e.clientX - r.left > r.width * 0.5;
  }

  _bind() {
    const c = this.canvas;
    if (!c) return;
    const cap = { capture: true, passive: false };

    this._down = (e) => {
      // a second finger anywhere while looking = pinch zoom
      if (this._ptrs.size === 1 && e.pointerType !== 'mouse' && this.enabled()) {
        this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: true });
        this._pinch = 0;
        e.stopPropagation();
        return;
      }
      if (!this._isLookPress(e)) return;
      e.stopPropagation();
      e.preventDefault?.();
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() });
      if (this.input) this.input.lookLocked = true;
      try { c.setPointerCapture?.(e.pointerId); } catch { /* optional */ }
    };

    this._move = (e) => {
      const p = this._ptrs.get(e.pointerId);
      if (!p) return;
      e.stopPropagation();
      if (this._ptrs.size >= 2) {
        const [a, b] = [...this._ptrs.values()];
        p.x = e.clientX; p.y = e.clientY;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinch) this.zoomBy(this._pinch / Math.max(1, d));
        this._pinch = d;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > DRAG_PX) p.moved = true;
      if (p.moved) this.rotate(dx, dy);
    };

    this._up = (e) => {
      const p = this._ptrs.get(e.pointerId);
      if (!p) return;
      e.stopPropagation();
      this._ptrs.delete(e.pointerId);
      if (this._ptrs.size < 2) this._pinch = 0;
      if (this._ptrs.size === 0 && this.input) this.input.lookLocked = false;
      if (p.moved || e.type === 'pointercancel') return;
      // a press that never became a drag keeps its old meaning
      const now = performance.now();
      if (e.pointerType === 'mouse' || e.pointerType === undefined) {
        this._fireTorpedo();
      } else if (now - this._lastTap < 320) {
        this.recenter();
      } else if (now - (p.t || now) < 320) {
        this.input?._press?.('target');
      }
      this._lastTap = now;
    };

    this._wheel = (e) => {
      if (!this.enabled()) return;
      e.preventDefault();
      this.zoomBy(Math.exp(Math.sign(e.deltaY) * 0.1));
    };
    this._dbl = (e) => { if (this.enabled()) { e.preventDefault(); this.recenter(); } };

    c.addEventListener('pointerdown', this._down, cap);
    c.addEventListener('pointermove', this._move, cap);
    window.addEventListener('pointerup', this._up, true);
    c.addEventListener('pointercancel', this._up, true);
    c.addEventListener('wheel', this._wheel, { passive: false });
    c.addEventListener('dblclick', this._dbl);
  }

  _fireTorpedo() {
    const inp = this.input;
    if (!inp) return;
    inp._press?.('torpedo');
    inp.actions.torpedo = true;
    clearTimeout(this._torpT);
    this._torpT = setTimeout(() => { inp.actions.torpedo = false; }, 80);
  }

  dispose() {
    const c = this.canvas;
    if (!c) return;
    c.removeEventListener('pointerdown', this._down, true);
    c.removeEventListener('pointermove', this._move, true);
    window.removeEventListener('pointerup', this._up, true);
    c.removeEventListener('pointercancel', this._up, true);
    c.removeEventListener('wheel', this._wheel);
    c.removeEventListener('dblclick', this._dbl);
    clearTimeout(this._torpT);
    if (this.input) this.input.lookLocked = false;
  }
}
