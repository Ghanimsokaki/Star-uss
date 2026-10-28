/**
 * Free camera — a detached orbit rig for the flight scene.
 *
 * Normal flight glues the camera behind the hull. That is right for flying and
 * wrong for looking at a ship: you can never see the top, the nacelles, or the
 * paint you just bought. This rig hands the camera to the player:
 *
 *   · drag to orbit the ship from any angle
 *   · wheel or pinch to zoom
 *   · let go and it slowly circles on its own, so the hull is always showing
 *     you something while you fly
 *
 * The ship keeps flying and shooting the whole time — the rig only moves the
 * camera. Input is captured in the capture phase and stopped there, so a drag
 * that orbits the camera never also fires phasers or steers the ship.
 *
 * The maths is deliberately trivial (spherical around a smoothed focus point)
 * so it can be unit tested without a renderer: see orbitPosition() below.
 */
import * as THREE from 'three';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4.5;
const MIN_PITCH = -1.32;
const MAX_PITCH = 1.32;
const IDLE_BEFORE_ORBIT = 1.6;   // seconds of no input before it drifts
const ORBIT_SPEED = 0.14;        // radians per second

/**
 * Where the camera sits for a given orbit.
 * @param {THREE.Vector3} focus  point the camera looks at
 * @param {number} distance      metres from the focus
 * @param {number} yaw            radians around the vertical axis
 * @param {number} pitch          radians above/below the horizon
 * @returns {THREE.Vector3} camera position
 */
export function orbitPosition(focus, distance, yaw, pitch) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(
    focus.x + Math.sin(yaw) * cp * distance,
    focus.y + Math.sin(pitch) * distance,
    focus.z + Math.cos(yaw) * cp * distance,
  );
}

/** Clamp helpers exposed for tests and for the drag handler. */
export const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
export const clampPitch = (p) => Math.min(MAX_PITCH, Math.max(MIN_PITCH, p));

export class FreeCam {
  /**
   * @param {HTMLCanvasElement} canvas  the WebGL canvas (input surface)
   * @param {{ onChange?: (active: boolean) => void }} [opts]
   */
  constructor(canvas, { onChange = null } = {}) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.active = false;

    // start three-quarters behind and slightly above: the classic beauty shot
    this.yaw = Math.PI * 0.78;
    this.pitch = 0.26;
    this.zoom = 1;
    this.autoOrbit = true;
    this.idle = 0;

    this.focus = new THREE.Vector3();
    this._initialised = false;
    this._pointers = new Map();
    this._pinchDist = 0;

    this._bind();
  }

  /** Default distance for a hull of `length` units, including the zoom factor. */
  distanceFor(length) {
    return Math.max(3, length * 2.05) * clampZoom(this.zoom);
  }

  setActive(on) {
    const next = !!on;
    if (next === this.active) return this.active;
    this.active = next;
    this._pointers.clear();
    this.idle = 0;
    this.onChange?.(next);
    return this.active;
  }

  toggle() {
    return this.setActive(!this.active);
  }

  /** Snap back to the beauty shot without leaving free cam. */
  reset() {
    this.yaw = Math.PI * 0.78;
    this.pitch = 0.26;
    this.zoom = 1;
    this.idle = 0;
    this._initialised = false;
  }

  /**
   * Advance the rig and move the camera.
   *
   * @param {number} dt
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} focusPos  the hull's world position
   * @param {number} hullLength       the hull length in world units
   */
  update(dt, camera, focusPos, hullLength = 6) {
    if (!this.active) return false;

    if (!this._initialised) {
      this.focus.copy(focusPos);
      this._initialised = true;
    }
    // Follow tightly. A laggy focus looks lovely until the ship is doing
    // 74 units/s and the hull slides out of frame — which defeats the point of
    // orbiting it. This keeps the drift to a couple of units at full impulse.
    const follow = 1 - Math.exp(-18 * dt);
    this.focus.lerp(focusPos, follow);

    this.idle += dt;
    const dragging = this._pointers.size > 0;
    if (dragging) this.idle = 0;
    if (this.autoOrbit && this.idle > IDLE_BEFORE_ORBIT) this.yaw += ORBIT_SPEED * dt;

    const d = this.distanceFor(hullLength);
    camera.position.copy(orbitPosition(this.focus, d, this.yaw, this.pitch));
    camera.up.set(0, 1, 0);
    camera.lookAt(this.focus);
    return true;
  }

  /* ---------------------------------------------------------------- input */
  _bind() {
    const canvas = this.canvas;
    if (!canvas) return;

    const capture = { capture: true, passive: false };

    this._onDown = (e) => {
      if (!this.active) return;
      // keep the flight controls from also seeing this gesture
      e.stopPropagation();
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._pinchDist = 0;
      this.idle = 0;
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* optional */ }
      if (e.preventDefault) e.preventDefault();
    };

    this._onMove = (e) => {
      if (!this.active) return;
      const prev = this._pointers.get(e.pointerId);
      if (!prev) return;
      e.stopPropagation();

      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...this._pointers.values()];

      if (pts.length >= 2) {
        // two fingers: pinch to zoom, and do not also orbit
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchDist) this.zoom = clampZoom(this.zoom * (this._pinchDist / Math.max(1, dist)));
        this._pinchDist = dist;
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.yaw -= dx * 0.0062;
      this.pitch = clampPitch(this.pitch + dy * 0.0052);
      this.idle = 0;
      if (e.preventDefault) e.preventDefault();
    };

    this._onUp = (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      this.idle = 0;
    };

    this._onWheel = (e) => {
      if (!this.active) return;
      e.stopPropagation();
      if (e.preventDefault) e.preventDefault();
      this.zoom = clampZoom(this.zoom * Math.exp((e.deltaY || 0) * 0.0012));
      this.idle = 0;
    };

    canvas.addEventListener('pointerdown', this._onDown, capture);
    canvas.addEventListener('pointermove', this._onMove, capture);
    canvas.addEventListener('pointerup', this._onUp, capture);
    canvas.addEventListener('pointercancel', this._onUp, capture);
    canvas.addEventListener('wheel', this._onWheel, capture);
    // a double-click is the quickest "put it back"
    this._onDbl = () => { if (this.active) this.reset(); };
    canvas.addEventListener('dblclick', this._onDbl, capture);
  }

  dispose() {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', this._onDown, true);
    canvas.removeEventListener('pointermove', this._onMove, true);
    canvas.removeEventListener('pointerup', this._onUp, true);
    canvas.removeEventListener('pointercancel', this._onUp, true);
    canvas.removeEventListener('wheel', this._onWheel, true);
    canvas.removeEventListener('dblclick', this._onDbl, true);
    this._pointers.clear();
  }
}
