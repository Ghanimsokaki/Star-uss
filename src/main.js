import './style.css';
import * as THREE from 'three';
import { Viewport } from './core/viewport.js';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { getEnvironment } from './art/environment.js';
import { game } from './game.js';
import { TitleScene } from './scenes/title.js';
import { EarthScene } from './scenes/earth.js';
import { HangarScene } from './scenes/hangar.js';
import { GalaxyScene } from './scenes/galaxy.js';
import { SystemScene } from './scenes/system.js';
import { buildTopbar, updateTopbar, setNavActive, toast, el, $, hasModal, closeModals } from './ui/dom.js';
import { showCodex, showSettings, showHowTo, showMissionLog, showRankUp, showIntro } from './ui/menus.js';
import { isMobile, storage, clamp } from './core/util.js';

const SCENES = { title: TitleScene, earth: EarthScene, hangar: HangarScene, galaxy: GalaxyScene, system: SystemScene };
const SCENE_LABEL = { title: 'Title', earth: 'Earth', hangar: 'Shipyard', galaxy: 'Galaxy map', system: 'Space' };

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.game = game;
    this.viewport = new Viewport(canvas);
    this.input = new Input(canvas);
    this.environment = getEnvironment(this.viewport.renderer);
    this.scenes = {};
    this.currentName = null;
    this.current = null;
    this.uiRoot = document.getElementById('ui');
    this.time = 0;
    this._hudTimer = 0;
    this._chromeShown = false;

    this.viewport.setQuality('medium');
    this.viewport.autoQuality();
    this._bindGlobal();
    this._bindContextLoss();
    this._bootSequence();
  }

  _bindContextLoss() {
    // mobile GPUs reset the context when backgrounded; recover gracefully instead of freezing
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      try { audio.stopEngine(); audio.stopDrone(); audio.stopMusic?.(); } catch (e) { /* audio may be gone */ }
      const fatal = document.getElementById('fatal');
      const msg = document.getElementById('fatal-msg');
      if (msg) msg.textContent = 'The graphics context was lost (this usually happens after backgrounding a tab for a long time). Your progress is saved.';
      if (fatal) fatal.hidden = false;
      game.save(true);
    }, false);
    this.canvas.addEventListener('webglcontextrestored', () => {
      setTimeout(() => window.location.reload(), 400);
    }, false);
  }

  _bootSequence() {
    const statuses = [
      [120, 'Aligning inertial dampeners'],
      [520, 'Spooling matter/antimatter reaction'],
      [980, 'Loading stellar cartography'],
      [1420, 'Calibrating deflector shields'],
    ];
    const bar = document.getElementById('boot-fill');
    const status = document.getElementById('boot-status');
    const tip = document.getElementById('boot-tip');
    const tips = [
      'Tip: income from your Earth districts accrues even while you are away.',
      'Tip: phasers lock onto the nearest hostile inside your forward arc.',
      'Tip: a D\u2019deridex can cloak. Watch your sensors when she vanishes.',
      'Tip: research Singularity Physics before you enter the Vela Singularity.',
      'Tip: every ship class has a unique special ability — bind it to the ✷ button.',
    ];
    tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    statuses.forEach(([t, msg]) => setTimeout(() => { status.textContent = msg; }, t));
    let p = 0;
    const tick = setInterval(() => {
      p = Math.min(96, p + 8 + Math.random() * 12);
      if (bar) bar.style.width = p + '%';
      if (p >= 96) clearInterval(tick);
    }, 160);

    this.setScene('title');
    this._startLoop();

    // finish the loading screen after the first frames render
    setTimeout(() => {
      if (bar) bar.style.width = '100%';
      status.textContent = 'All systems nominal';
      setTimeout(() => {
        const boot = document.getElementById('boot');
        boot?.classList.add('done');
        setTimeout(() => boot?.remove(), 900);
        this.uiFadeIn();
      }, 320);
    }, 1500);
  }

  uiFadeIn() {
    const screen = document.querySelector('.screen.active');
    if (screen) screen.classList.add('fade-in');
    if (!game.state.flags.introSeen && TitleScene) {
      // intro is presented when a new mission starts, not for returning saves
    }
  }

  _scene(name) {
    if (!this.scenes[name]) {
      const Ctor = SCENES[name];
      if (!Ctor) throw new Error('Unknown scene ' + name);
      this.scenes[name] = new Ctor(this);
    }
    return this.scenes[name];
  }

  setScene(name, params = {}) {
    if (!SCENES[name]) return;
    try {
      if (this.current) this.current.exit();
      const scene = this._scene(name);
      this.current = scene;
      this.currentName = name;
      if (scene.scene && scene.camera) this.viewport.setScene(scene.scene, scene.camera);
      scene.enter?.(params);
      scene.resize?.(window.innerWidth, window.innerHeight);
      document.body.dataset.scene = name;

      if (name === 'title') {
        this._hideChrome();
      } else {
        this._showChrome(name === 'system' ? 'galaxy' : name);
      }
      this.input.consumeAll();
      const el2 = document.querySelector('.screen.active');
      if (el2) el2.classList.add('fade-in');
    } catch (err) {
      console.error('[scene error]', err);
      toast(`Scene error: ${err.message}`, 'bad', 6000);
      if (name !== 'title') this.setScene('title');
    }
  }

  navigate(id) {
    audio.ensure();
    audio.ui();
    if (id === 'codex') { showCodex(game); return; }
    if (id === 'settings') { showSettings(this); return; }
    if (id === 'system') { this.setScene('system'); return; }
    if (id === this.currentName) return;
    this.setScene(id);
  }

  _showChrome(active) {
    document.querySelectorAll('.topbar').forEach((n) => n.remove());
    const bar = buildTopbar(game, active, (id) => this.navigate(id));
    this._chromeShown = true;
    updateTopbar(game);
    return bar;
  }

  _hideChrome() {
    document.querySelectorAll('.topbar').forEach((n) => n.remove());
    this._chromeShown = false;
  }

  applyQuality(q) {
    if (!q || q === 'auto') this.viewport.autoQuality();
    else this.viewport.setQuality(q);
    this.current?.resize?.(window.innerWidth, window.innerHeight);
  }

  warpTransition({ title = 'Warp', sub = '', duration = 2000, onMid = null } = {}) {
    const overlay = el(`
      <div class="big-overlay">
        <div class="warp-lines">${Array.from({ length: 28 }, () => `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 1.1).toFixed(2)}s;animation-duration:${(0.6 + Math.random() * 0.9).toFixed(2)}s"></i>`).join('')}</div>
        <div style="position:relative;text-align:center">
          <div class="warp-title">${title}</div>
          <div class="warp-sub">${sub}</div>
          <div class="boot-bar" style="margin-top:22px"><i id="warp-fill"></i></div>
        </div>
      </div>`);
    document.getElementById('ui').appendChild(overlay);
    const fill = overlay.querySelector('#warp-fill');
    requestAnimationFrame(() => { if (fill) fill.style.width = '100%'; });
    setTimeout(() => {
      try { onMid?.(); } catch (e) { console.error(e); }
    }, Math.max(300, duration * 0.55));
    setTimeout(() => {
      overlay.style.transition = 'opacity .5s ease';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 520);
    }, duration);
  }

  _bindGlobal() {
    window.addEventListener('pointerdown', () => {
      audio.ensure();
    }, { once: true });

    window.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.key === 'Escape') {
        if (hasModal()) closeModals();
      }
      if (e.key.toLowerCase() === 'm' && this.currentName !== 'title') showMissionLog(game);
      if (e.key.toLowerCase() === 'j' && this.currentName !== 'title') this.navigate('earth');
      if (e.key.toLowerCase() === 'g' && this.currentName !== 'title') this.navigate('galaxy');
      if (e.key.toLowerCase() === 'h' && this.currentName !== 'title') this.navigate('hangar');
    });

    window.addEventListener('resize', () => this.current?.resize?.(window.innerWidth, window.innerHeight));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) game.save(true);
    });
    window.addEventListener('beforeunload', () => game.save(true));

    game.bus.on('rankup', (d) => showRankUp(d));
    game.bus.on('mission', (d) => {
      const r = d.reward || {};
      const bits = [];
      if (r.credits) bits.push('₡' + Math.round(r.credits).toLocaleString());
      if (r.research) bits.push(r.research + ' RP');
      if (r.dilithium) bits.push(r.dilithium + ' D');
      if (bits.length) toast(`Orders complete · ${bits.join(' · ')}`, 'good', 4200);
    });
    game.bus.on('change', () => {
      if (this._chromeShown) updateTopbar(game);
    });

    setInterval(() => {
      if (this.currentName !== 'title') game.save();
    }, 20000);

    window.addEventListener('error', (e) => {
      console.error(e.error || e.message);
    });
    window.addEventListener('unhandledrejection', (e) => console.error(e.reason));
  }

  _startLoop() {
    const clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = clamp(clock.getDelta(), 0, 0.1);
      this.time += dt;
      try {
        game.tick(dt);
        this.current?.update?.(dt, this.time);
        this.viewport.render();
      } catch (err) {
        console.error('[loop]', err);
      }
      this._hudTimer += dt;
      if (this._hudTimer > 0.25) {
        this._hudTimer = 0;
        if (this._chromeShown) updateTopbar(game);
      }
    };
    loop();
  }
}

/* ------------------------------------------------------------------ boot */
function boot() {
  const canvas = document.getElementById('viewport');
  try {
    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2') || test.getContext('webgl');
    if (!gl) throw new Error('WebGL is not available');
    const app = new App(canvas);
    window.__app = app;
    window.__game = game;
    console.log('%cSTAR TREK: ASCENSION', 'font: 700 18px Orbitron, sans-serif; color:#59e0ff', '— warp core online');
  } catch (err) {
    console.error(err);
    const fatal = document.getElementById('fatal');
    const msg = document.getElementById('fatal-msg');
    if (msg) msg.textContent = `The game could not start: ${err.message}. Enable WebGL 2 / hardware acceleration and reload.`;
    if (fatal) fatal.hidden = false;
    const bootEl = document.getElementById('boot');
    if (bootEl) bootEl.style.display = 'none';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
