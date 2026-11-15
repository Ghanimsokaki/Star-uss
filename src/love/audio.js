/**
 * A small generative love song, made entirely with Web Audio (no audio files):
 * a warm pad, a music-box arpeggio and a soft heartbeat, all through a
 * hand-made reverb. Chords: Fmaj7 – G6 – Em7 – Am7 (IV–V–iii–vi), 72 bpm.
 */

const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// MIDI notes
const CHORDS = [
  { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { bass: 43, notes: [55, 59, 62, 64] }, // G6
  { bass: 40, notes: [52, 55, 59, 62] }, // Em7
  { bass: 45, notes: [57, 60, 64, 67] }, // Am7
];
const MELODY = [
  [72, 0, 2], [69, 2, 1], [72, 3, 1],
  [74, 4, 2], [71, 6, 2],
  [71, 8, 1.5], [67, 9.5, 0.5], [69, 10, 2],
  [72, 12, 1], [76, 13, 1], [74, 14, 2],
];

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function impulse(ctx, seconds = 3.4, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class LoveSong {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bar = 0;
    this.timer = null;
    this.onBeat = null; // callback(timeUntilBeatSeconds)
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 4);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dTone = ctx.createBiquadFilter();
    dTone.type = 'lowpass';
    dTone.frequency.value = 2400;
    this.delay.connect(dTone).connect(fb).connect(this.delay);
    dTone.connect(this.reverb);
    dTone.connect(this.master);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.7;
    this.dry.connect(this.master);
    this.dry.connect(this.reverb);

    this.next = ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 100);
    this.schedule();
  }

  schedule() {
    const ctx = this.ctx;
    while (this.next < ctx.currentTime + 0.6) {
      this.playBar(this.bar, this.next);
      this.next += BAR;
      this.bar++;
    }
  }

  playBar(n, t) {
    const chord = CHORDS[n % 4];
    const intro = n < 2;

    // pad
    chord.notes.forEach((m) => this.pad(hz(m), t, BAR + 0.4, intro ? 0.035 : 0.05));
    this.pad(hz(chord.bass), t, BAR + 0.4, 0.07, 'sine');

    // arpeggio (music box)
    const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
    pattern.forEach((idx, i) => {
      this.bell(hz(chord.notes[idx] + 12), t + i * (BEAT / 2), intro ? 0.05 : 0.07);
    });

    // melody after the first cycle
    if (n >= 4) {
      const phrase = MELODY.filter(([, b]) => Math.floor(b / 4) === n % 4);
      phrase.forEach(([m, b, len]) => this.lead(hz(m), t + (b % 4) * BEAT, len * BEAT));
    }

    // heartbeat: lub-dub on beats 1 and 3
    if (n >= 2) {
      [0, 2].forEach((b) => {
        const bt = t + b * BEAT;
        this.thump(bt, 0.5);
        this.thump(bt + 0.2, 0.32);
        if (this.onBeat) {
          const wait = (bt - ctx_now(this.ctx)) * 1000;
          setTimeout(() => this.onBeat && this.onBeat(), Math.max(0, wait));
        }
      });
    }
  }

  pad(f, t, dur, vol, type = 'sawtooth') {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.8);
    [-7, 7].forEach((detune) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 1);
    });
    lp.connect(g).connect(this.dry);
  }

  bell(f, t, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    [[1, 1], [2.01, 0.25], [3.98, 0.08]].forEach(([mul, amp]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    });
    g.connect(this.dry);
    g.connect(this.delay);
  }

  lead(f, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    o.type = 'triangle';
    o2.type = 'sine';
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    vib.frequency.value = 5;
    vg.gain.value = 3;
    vib.connect(vg).connect(o.detune);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.03, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.dry);
    g.connect(this.delay);
    [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + dur + 1.3); });
  }

  thump(t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** a sparkle when someone taps */
  chime() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const chord = CHORDS[(this.bar + 3) % 4].notes;
    [0, 1, 2].forEach((i) => this.bell(hz(chord[(i * 2 + Math.floor(Math.random() * 4)) % 4] + 24), t + i * 0.07, 0.05));
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.85, t, 0.25);
  }
}

function ctx_now(ctx) {
  return ctx.currentTime;
}
