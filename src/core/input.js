import { clamp } from './util.js';
import { device, isTouchScheme, onDeviceChange } from './device.js';

/**
 * Unified input: keyboard, mouse, touch and gamepad.
 *
 * The scheme is decided by `device.js`:
 *   · pointer — mouse steers by following the cursor, Space/left-click fires
 *   · touch   — drag anywhere on the viewport to steer, on-screen pad also works,
 *               a quick tap locks the nearest target
 *
 * Steering is deliberately "point where you want to go" rather than
 * "tank controls", in both schemes. Everything is smoothed so a thumb twitch
 * cannot snap the hull around.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.actions = {
      fire: false, torpedo: false, boost: false, brake: false,
      throttleUp: false, throttleDown: false,
    };
    this.pressed = new Set();
    this.steer = { x: 0, y: 0 };
    this.rawSteer = { x: 0, y: 0 };
    this.ndc = { x: 0, y: 0 };
    this.mouseActive = false;
    this.mouseIdle = 99;
    this.stick = { x: 0, y: 0, active: false, id: null };
    this.drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: false };
    this.throttleRate = 0;
    this.enabled = true;
    this.touchMode = isTouchScheme();
    this.scheme = device.scheme;
    this.gamepadIndex = null;
    this._padPrev = {};
    this._unwatch = onDeviceChange(() => this.applyScheme(device.scheme));
    this._bind();
  }

  /** Swap control scheme live (settings override, tablet rotation, …). */
  applyScheme(scheme) {
    this.scheme = scheme;
    this.touchMode = scheme === 'touch';
    if (this.touchMode) {
      // a thumb is not a mouse — drop any lingering cursor steering
      this.mouseActive = false;
      this.ndc.x = 0; this.ndc.y = 0;
    } else {
      this.stick.x = 0; this.stick.y = 0; this.stick.active = false;
    }
  }

  destroy() {
    this._unwatch?.();
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
      if (k === 'h') this._press('help');
      if (k === 'p') this._press('pause');
    });
    window.addEventListener('keyup', (e) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === ' ') this.actions.fire = false;
      if (k === 'f') this.actions.torpedo = false;
      if (k === 'shift') this.actions.boost = false;
    });
    window.addEventListener('blur', () => this.releaseAll());

    /* ---------------------------------------------------------------- mouse */
    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;   // thumbs use the drag path
      if (this.scheme !== 'pointer') return;
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
      if (e.pointerType === 'mouse' || e.pointerType === undefined) {
        this.mouseActive = true;
        if (e.button === 0) { this._press('fire'); this.actions.fire = true; }
        if (e.button === 2) { this._press('torpedo'); this.actions.torpedo = true; }
        return;
      }
      this._beginDrag(e);
    };
    const onUp = (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === undefined) {
        if (e.button === 0) this.actions.fire = false;
        if (e.button === 2) this.actions.torpedo = false;
        return;
      }
      this._endDrag(e);
    };
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') this._moveDrag(e);
    }, { passive: true });
    window.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', (e) => this._endDrag(e, true));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch anywhere in the app bumps us into touch mode (covers "auto" guesses)
    window.addEventListener('touchstart', () => {
      if (this.scheme !== 'touch' && device.pref === 'auto') this.applyScheme('touch');
    }, { passive: true });
  }

  /* --------------------------------------------------- drag-to-steer (touch) */
  _beginDrag(e) {
    if (this.drag.id !== null) return;          // ignore a second finger
    const r = this.canvas.getBoundingClientRect();
    this.drag.id = e.pointerId;
    this.drag.sx = e.clientX;
    this.drag.sy = e.clientY;
    this.drag.x = 0;
    this.drag.y = 0;
    this.drag.t0 = performance.now();
    this.drag.moved = false;
    this.drag.maxR = Math.min(r.width, r.height) * 0.28;
    this.stick.active = false;
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* not fatal */ }
  }

  _moveDrag(e) {
    if (this.drag.id !== e.pointerId) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    const max = this.drag.maxR || 140;
    const d = Math.hypot(dx, dy);
    if (d > 8) this.drag.moved = true;
    const k = d > max ? max / d : 1;
    this.drag.x = (dx * k) / max;
    this.drag.y = (-dy * k) / max;
    this.stick.x = this.drag.x;
    this.stick.y = this.drag.y;
    this.stick.active = d > 4;
    // the origin slowly follows the thumb so long drags do not run out of travel
    if (d > max) {
      this.drag.sx = e.clientX - dx * k;
      this.drag.sy = e.clientY - dy * k;
    }
  }

  _endDrag(e, cancelled = false) {
    if (this.drag.id !== e.pointerId) return;
    const held = performance.now() - this.drag.t0;
    const wasTap = !cancelled && !this.drag.moved && held < 320;
    this.drag.id = null;
    this.drag.x = 0; this.drag.y = 0;
    this.stick.x = 0; this.stick.y = 0;
    this.stick.active = false;
    if (wasTap) {
      // a quick tap is a "what is that?" — lock the nearest contact
      this._press('target');
      this.haptic(10);
    }
  }

  /* ------------------------------------------------------------- actions */
  _press(name) {
    this.pressed.add(name);
    if (name === 'fire' || name === 'torpedo' || name === 'boost') this.actions[name] = true;
    if (name === 'throttleUp' || name === 'throttleDown') this.actions[name] = true;
    this.haptic(name === 'fire' ? 0 : 8);
  }

  /** Short haptic tick on phones that support it — free feedback, no visual cost. */
  haptic(ms = 8) {
    if (this.scheme !== 'touch') return;
    try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
  }

  releaseAll() {
    this.keys.clear();
    for (const a of Object.keys(this.actions)) this.actions[a] = false;
    this.stick.active = false;
    this.stick.x = 0; this.stick.y = 0;
    this.drag.id = null;
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
        e.stopPropagation();
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
    if (!zone || !knob) return;
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
      e.stopPropagation();
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

  /* --------------------------------------------------------------- gamepad */
  _readPad(dt) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.gamepad = !!pad;
    if (!pad) return null;

    const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
    const ax = dz(pad.axes[0] || 0);
    const ay = -dz(pad.axes[1] || 0);
    const trig = (i) => (pad.buttons[i]?.value || (pad.buttons[i]?.pressed ? 1 : 0));
    const btn = (i) => !!pad.buttons[i]?.pressed;

    // edge-triggered buttons (one press = one action)
    const edge = (i, action) => {
      const now = btn(i);
      if (now && !this._padPrev[i]) this._press(action);
      this._padPrev[i] = now;
    };
    edge(0, 'ability');       // A / cross
    edge(1, 'target');        // B / circle
    edge(2, 'scan');          // X / square
    edge(3, 'warp');          // Y / triangle
    edge(9, 'help');          // start

    this.actions.fire = trig(7) > 0.4 || btn(5);          // RT / RB
    this.actions.torpedo = trig(6) > 0.4 || btn(4);       // LT / LB
    this.actions.boost = btn(10) || btn(11);              // L3 / R3
    this.actions.throttleUp = btn(12);                    // d-pad up
    this.actions.throttleDown = btn(13);                  // d-pad down
    void dt;
    return { x: ax, y: ay };
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
    const pad = this._readPad(dt);
    if (pad && (Math.abs(pad.x) > 0.02 || Math.abs(pad.y) > 0.02)) {
      mx = pad.x;
      my = pad.y;
    } else if (this.stick.active) {
      mx = this.stick.x;
      my = this.stick.y;
    } else if (this.mouseActive && this.mouseIdle < 2.4 && this.scheme === 'pointer') {
      // generous dead zone in the middle, exponential authority toward the edges
      const dead = 0.14;
      const dz = (v) => (Math.abs(v) < dead ? 0 : (Math.abs(v) - dead) / (1 - dead));
      mx = Math.sign(this.ndc.x) * Math.pow(dz(this.ndc.x), 1.6);
      my = Math.sign(this.ndc.y) * Math.pow(dz(this.ndc.y), 1.6);
    }
    this.rawSteer.x = clamp(kx + mx, -1, 1);
    this.rawSteer.y = clamp(ky + my, -1, 1);
    // smooth steering so it feels like mass
    const s = 1 - Math.exp(-13 * dt);
    this.steer.x += (this.rawSteer.x - this.steer.x) * s;
    this.steer.y += (this.rawSteer.y - this.steer.y) * s;

    // throttle: keys z/x, on-screen hold buttons, or the d-pad
    this.throttleRate = 0;
    if (this.keys.has('z') || this.actions.throttleUp) this.throttleRate += 1;
    if (this.keys.has('c') || this.actions.throttleDown) this.throttleRate -= 1;
    if (this.actions.throttleUp && this.actions.throttleDown) this.throttleRate = 0;
  }

}
