import { storage } from './util.js';

/**
 * Fully procedural audio — no external assets.
 * Warm LCARS-style ambient pad plus combat and UI effects.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = storage.get('sta.muted', false);
    this.started = false;
    this._musicTimer = null;
    this._engine = null;
    this._drone = null;
    this._warned = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.65;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this._noiseBuffer = this._makeNoise();
      return true;
    } catch (e) {
      return false;
    }
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    storage.set('sta.muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.65, this.ctx.currentTime, 0.05);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _noise(dur, { type = 'lowpass', freq = 900, q = 1, gain = 0.3, attack = 0.005, pan = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    src.connect(f);
    if (p) { f.connect(g); g.connect(p); p.connect(this.sfxGain); }
    else { f.connect(g); g.connect(this.sfxGain); }
    src.start(t); src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.18, to = null, attack = 0.01, pan = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    o.connect(g);
    if (p) { g.connect(p); p.connect(this.sfxGain); } else g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  ui() { this.ensure(); this._tone(880, 0.06, { type: 'sine', gain: 0.05 }); this._tone(1320, 0.05, { type: 'sine', gain: 0.03, delay: 0.02 }); }
  open() { this.ensure(); this._tone(420, 0.14, { type: 'triangle', gain: 0.07, to: 720 }); }
  close() { this.ensure(); this._tone(600, 0.12, { type: 'triangle', gain: 0.05, to: 320 }); }
  error() { this.ensure(); this._tone(160, 0.18, { type: 'square', gain: 0.06, to: 110 }); }
  confirm() { this.ensure(); this._tone(660, 0.1, { type: 'sine', gain: 0.09 }); this._tone(990, 0.16, { type: 'sine', gain: 0.07, delay: 0.07 }); this._tone(1320, 0.2, { type: 'sine', gain: 0.05, delay: 0.14 }); }
  credits() { this.ensure(); this._tone(1180, 0.08, { type: 'triangle', gain: 0.06 }); this._tone(1560, 0.14, { type: 'triangle', gain: 0.05, delay: 0.06 }); }

  phaser(pan = 0) {
    this.ensure();
    this._tone(1500 + Math.random() * 500, 0.19, { type: 'sawtooth', gain: 0.07, to: 220, pan });
    this._noise(0.13, { type: 'bandpass', freq: 2400, q: 4, gain: 0.05, pan });
  }
  torpedo(pan = 0) {
    this.ensure();
    this._tone(90, 0.5, { type: 'sine', gain: 0.12, to: 40, pan });
    this._noise(0.55, { type: 'lowpass', freq: 700, gain: 0.08, pan });
  }
  torpedoHit() {
    this.ensure();
    this._noise(0.5, { type: 'lowpass', freq: 500, gain: 0.2 });
    this._tone(60, 0.5, { type: 'sine', gain: 0.16, to: 30 });
  }
  explosion(size = 1) {
    this.ensure();
    const g = Math.min(0.34, 0.14 * size);
    this._noise(0.7 * size, { type: 'lowpass', freq: 420, gain: g });
    this._tone(70, 0.7 * size, { type: 'sine', gain: g * 0.8, to: 28 });
    this._noise(0.3, { type: 'highpass', freq: 2200, gain: g * 0.4 });
  }
  hullHit() {
    this.ensure();
    this._noise(0.25, { type: 'bandpass', freq: 300, q: 1.4, gain: 0.16 });
    this._tone(90, 0.2, { type: 'square', gain: 0.05, to: 55 });
  }
  shieldHit() {
    this.ensure();
    this._tone(700, 0.2, { type: 'sine', gain: 0.06, to: 1400 });
    this._noise(0.18, { type: 'bandpass', freq: 3200, q: 6, gain: 0.05 });
  }
  scan() {
    this.ensure();
    for (let i = 0; i < 4; i++) this._tone(620 + i * 180, 0.09, { type: 'sine', gain: 0.045, delay: i * 0.09 });
  }
  build() {
    this.ensure();
    this._tone(330, 0.5, { type: 'triangle', gain: 0.08, to: 660 });
    this._tone(495, 0.6, { type: 'sine', gain: 0.05, to: 990, delay: 0.08 });
  }
  upgrade() {
    this.ensure();
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.3, { type: 'sine', gain: 0.06, delay: i * 0.07 }));
  }
  warp() {
    this.ensure();
    this._tone(60, 1.5, { type: 'sawtooth', gain: 0.07, to: 1400 });
    this._noise(1.4, { type: 'bandpass', freq: 800, q: 1.2, gain: 0.09 });
  }
  alert() {
    this.ensure();
    this._tone(880, 0.18, { type: 'square', gain: 0.05 });
    this._tone(660, 0.18, { type: 'square', gain: 0.05, delay: 0.22 });
  }

  startEngine() {
    this.ensure();
    if (!this.ctx || this._engine) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 48;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine'; o2.frequency.value = 72;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.03, t, 0.6);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxGain);
    o.start(); o2.start();
    this._engine = { o, o2, g, f };
  }
  setEngine(level) {
    if (!this._engine) return;
    const t = this.ctx.currentTime;
    this._engine.f.frequency.setTargetAtTime(160 + level * 500, t, 0.2);
    this._engine.g.gain.setTargetAtTime(0.012 + level * 0.04, t, 0.2);
    this._engine.o.frequency.setTargetAtTime(42 + level * 30, t, 0.25);
  }
  stopEngine() {
    if (!this._engine) return;
    const { o, o2, g } = this._engine;
    g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    try { o.stop(this.ctx.currentTime + 1.2); o2.stop(this.ctx.currentTime + 1.2); } catch (e) {}
    this._engine = null;
  }

  startDrone() {
    this.ensure();
    if (!this.ctx || this._drone) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.09, t, 2.2);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 300;
    g.connect(f); f.connect(this.sfxGain);
    const oscs = [36.5, 55, 73.2, 110.3].map((hz, i) => {
      const o = this.ctx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = hz;
      o.detune.value = (i - 1.5) * 6;
      o.connect(g); o.start();
      return o;
    });
    this._drone = { g, oscs };
  }
  stopDrone() {
    if (!this._drone) return;
    const { g, oscs } = this._drone;
    g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.8);
    oscs.forEach((o) => { try { o.stop(this.ctx.currentTime + 2.5); } catch (e) {} });
    this._drone = null;
  }

  startMusic() {
    this.ensure();
    if (!this.ctx || this._musicTimer) return;
    const chords = [
      [110, 164.81, 220, 277.18],
      [98, 146.83, 196, 246.94],
      [123.47, 185, 246.94, 311.13],
      [87.31, 130.81, 174.61, 220],
    ];
    let idx = 0;
    const play = () => {
      if (!this.ctx) return;
      const chord = chords[idx % chords.length]; idx++;
      const t = this.ctx.currentTime;
      chord.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f * (i === 2 ? 2 : 1);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035 / (i + 1), t + 3.4);
        g.gain.linearRampToValueAtTime(0.0001, t + 9.5);
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 900;
        o.connect(g); g.connect(filt); filt.connect(this.musicGain);
        o.start(t); o.stop(t + 10);
      });
      const arp = [1, 2, 3, 2];
      arp.forEach((n, i) => {
        this._tone(chord[n - 1] * 2, 0.7, { type: 'sine', gain: 0.012, delay: 1.2 + i * 1.1 });
      });
    };
    play();
    this._musicTimer = setInterval(play, 9500);
  }
  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  }
}

export const audio = new AudioEngine();
