import { clamp } from './util.js';

/**
 * Unified input: keyboard, mouse and touch.
 * Space-flight steering is "follow the cursor / stick" — pleasant on both mouse and thumb.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.actions = { fire: false, torpedo: false, boost: false, scan: false, target: false, brake: false };
    this.pressed = new Set();
    this.steer = { x: 0, y: 0 };
    this.rawSteer = { x: 0, y: 0 };
    this.ndc = { x: 0, y: 0 };
    this.mouseActive = false;
    this.mouseIdle = 99;
    this.stick = { x: 0, y: 0, active: false, id: null };
    this.throttleDelta = 0;
    this.enabled = true;
    this.touchMode = false;
    this._bind();
  }

  _bind() {
    const isTyping = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === ' ') { this._press('fire'); this.actions.fire = true; }
      if (k === 'f' || k === 'shift') this._press(k === 'shift' ? 'boost' : 'torpedo');
      if (k === 'e' || k === '1') this._press('ability');
      if (k === 'r') this._press('scan');
      if (k === 'q' || k === 'tab') this._press('target');
      if (k === 'x') this._press('brake');
      if (k === 't') this._press('warp');
      if (k === 'v') this._press('assist');
    });
    window.addEventListener('keyup', (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === ' ') this.actions.fire = false;
      if (k === 'f') this.actions.torpedo = false;
      if (k === 'shift') this.actions.boost = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      for (const a of Object.keys(this.actions)) this.actions[a] = false;
    });

    // mouse moves steer the ship softly; clicks fire
    const onMove = (e) => {
      // only steer when the pointer is over the 3D viewport, not the HUD panels
      if (e.target !== this.canvas && e.target?.tagName !== 'CANVAS') return;
      const r = this.canvas.getBoundingClientRect();
      this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      this.mouseActive = true;
      this.mouseIdle = 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const onDown = (e) => {
      if (e.target !== this.canvas) return;
      this.mouseActive = true;
      if (e.button === 0) { this._press('fire'); this.actions.fire = true; }
      if (e.button === 2) { this._press('torpedo'); this.actions.torpedo = true; }
    };
    const onUp = (e) => {
      if (e.button === 0) this.actions.fire = false;
      if (e.button === 2) this.actions.torpedo = false;
    };
    this.canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch: first touch anywhere enables touch UI
    const onTouch = () => {
      if (!this.touchMode) {
        this.touchMode = true;
        document.body.classList.add('touch-mode');
      }
    };
    window.addEventListener('touchstart', onTouch, { passive: true, once: true });

    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) {
      this.touchMode = true;
      document.body.classList.add('touch-mode');
    }
  }

  _press(name) {
    this.pressed.add(name);
    // hold-type actions stay latched until released; one-shot actions only live in `pressed`
    if (name === 'fire' || name === 'torpedo' || name === 'boost') this.actions[name] = true;
  }

  consume(name) {
    if (this.pressed.has(name)) { this.pressed.delete(name); return true; }
    return false;
  }
  consumeAll() { this.pressed.clear(); }

  /** Attach a DOM button cluster: <button data-action="fire" data-hold="1"> */
  bindActions(root) {
    root.querySelectorAll('[data-action]').forEach((btn) => {
      const name = btn.dataset.action;
      const hold = btn.dataset.hold === '1';
      const down = (e) => {
        e.preventDefault();
        this.enabled = true;
        this._press(name);
        if (hold) this.actions[name] = true;
        btn.classList.add('pressed');
      };
      const up = () => {
        btn.classList.remove('pressed');
        if (hold) this.actions[name] = false;
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
  }

  /** Virtual joystick bound to a zone element (mobile flight). */
  bindStick(zone, knob) {
    let id = null;
    const setFrom = (e) => {
      const r = zone.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width * 0.44;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      this.stick.x = dx / max;
      this.stick.y = -dy / max;
      this.stick.active = true;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchMode = true;
      document.body.classList.add('touch-mode');
      id = e.pointerId;
      zone.setPointerCapture?.(id);
      setFrom(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) setFrom(e); });
    const reset = (e) => {
      if (id !== null && e.pointerId !== id) return;
      id = null;
      this.stick.x = 0; this.stick.y = 0; this.stick.active = false;
      knob.style.transform = 'translate(0px,0px)';
    };
    zone.addEventListener('pointerup', reset);
    zone.addEventListener('pointercancel', reset);
    zone.addEventListener('pointerleave', reset);
  }

  /** Called once per frame by the flight scene. */
  update(dt) {
    this.mouseIdle += dt;
    let kx = 0, ky = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) ky += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ky -= 1;

    let mx = 0, my = 0;
    if (this.stick.active) {
      mx = this.stick.x;
      my = this.stick.y;
    } else if (this.mouseActive && this.mouseIdle < 2.4) {
      // generous dead zone in the middle, exponential authority toward the edges
      const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (Math.abs(v) - 0.14) / 0.86);
      mx = Math.sign(this.ndc.x) * Math.pow(dz(this.ndc.x), 1.6);
      my = Math.sign(this.ndc.y) * Math.pow(dz(this.ndc.y), 1.6);
    }
    this.rawSteer.x = clamp(kx + mx, -1, 1);
    this.rawSteer.y = clamp(ky + my, -1, 1);
    // smooth steering so it feels like mass
    const s = 1 - Math.exp(-13 * dt);
    this.steer.x += (this.rawSteer.x - this.steer.x) * s;
    this.steer.y += (this.rawSteer.y - this.steer.y) * s;

    // throttle
    this.throttleDelta = 0;
    if (this.keys.has('z')) this.throttleDelta += 1;
    if (this.keys.has('x')) this.throttleDelta -= 1;
  }
}
