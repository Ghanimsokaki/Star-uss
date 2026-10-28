import * as THREE from 'three';
import { BlackHole } from '../art/blackhole.js';
import { buildShip, disposeObject3D } from '../art/ships3d.js';
import { makeSky, makeStars, glowSprite } from '../art/environment.js';
import { el, $, toast, fmtC } from '../ui/dom.js';
import { showCodex, showHowTo, showSettings, showIntro } from '../ui/menus.js';
import { audio } from '../core/audio.js';
import { Game, game } from '../game.js';
import { fmt } from '../core/util.js';
import { confirmModal } from '../ui/dom.js';

export class TitleScene {
  constructor(app) {
    this.app = app;
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200000);
    this.camera.position.set(0, 7, 58);
    this.camera.lookAt(0, 2, 0);
    this.time = 0;
    this.ship = null;
    this._build();
  }

  _build() {
    const s = this.scene;
    s.add(makeSky(11, 50000));
    s.add(makeStars(3200, 24000));
    s.add(new THREE.AmbientLight(0x24405c, 0.7));
    const key = new THREE.DirectionalLight(0xa8d8ff, 1.6);
    key.position.set(-30, 20, 30);
    s.add(key);
    const rim = new THREE.DirectionalLight(0xffa35c, 1.4);
    rim.position.set(40, -10, -30);
    s.add(rim);

    this.bh = new BlackHole({ radius: 22, quality: this.app.viewport.detail, jets: true });
    this.bh.group.position.set(0, 8, -105);
    this.bh.group.rotation.set(0.55, 0.2, 0.18);
    s.add(this.bh.group);
    this.scene.environment = this.app.environment || null;

    const sun = glowSprite('#ffce9a', 220, 0.22);
    sun.position.set(0, 8, -105);
    s.add(sun);

    this.shipPivot = new THREE.Group();
    this.shipPivot.position.set(13, -3, 6);
    s.add(this.shipPivot);
    this._buildShip();
  }

  _buildShip() {
    if (this.ship) {
      this.shipPivot.remove(this.ship);
      disposeObject3D(this.ship);
    }
    const rec = this.game.shipRecord;
    this.ship = buildShip(this.game.state.shipId, rec, Math.max(0.65, this.app.viewport.detail));
    this.ship.rotation.y = -0.4;
    this.ship.scale.setScalar(1.1);
    this.shipPivot.add(this.ship);
  }

  enter() {
    this.time = 0;
    this._buildShip();
    const hasSave = Game.hasSave();
    const g = this.game;
    const ui = el(`
      <div class="screen active title-screen">
        <div class="title-wrap">
          <div class="kicker">A 3D starship command game</div>
          <h1 class="game-title">STAR TREK<i>ASCENSION</i></h1>
          <p class="game-sub">Take command of the U.S.S. Reliant. Build humanity's future on a living Earth, chart hostile stars, refit your hull into a fleet flagship — and answer the signal coming from beyond the black hole.</p>
          <div class="menu">
            ${hasSave ? `<button class="btn primary" data-act="continue">Continue Mission <span class="kbd">${fmtC(g.state.credits)}</span></button>` : ''}
            <button class="btn ${hasSave ? '' : 'primary'}" data-act="new">New Mission</button>
            <button class="btn" data-act="howto">Captain's Handbook</button>
            <button class="btn" data-act="codex">Starfleet Codex</button>
            <button class="btn" data-act="settings">Settings</button>
          </div>
          ${hasSave ? `<div class="save-card">
            <div class="tag">Saved mission</div>
            <div class="small dim" style="line-height:1.5">
              <b style="color:var(--ink)">${g.state.civ.name}</b> · ${g.shipClass.name}<br>
              Rank ${g.rankTitle} · ${fmt(g.state.credits)} credits · ${g.state.visited.length} systems charted
            </div>
          </div>` : ''}
        </div>
        <div class="title-meta">
          Stardate ${new Date().getUTCFullYear() + 300}.${String(Math.floor(Date.now() / 1e7) % 99).padStart(2, '0')}<br>
          Procedural galaxy · Real-time civilisation<br>
          Fan project · build 1.0
        </div>
      </div>`);
    this.ui = ui;
    document.getElementById('ui').appendChild(ui);

    $('[data-act="howto"]', ui).onclick = () => { audio.ui(); showHowTo(); };
    $('[data-act="codex"]', ui).onclick = () => { audio.ui(); showCodex(this.game); };
    $('[data-act="settings"]', ui).onclick = () => { audio.ui(); showSettings(this.app); };
    const continueBtn = $('[data-act="continue"]', ui);
    if (continueBtn) continueBtn.onclick = () => {
      audio.ensure(); audio.ui();
      if (this.game.load()) {
        this.app.applyQuality(this.game.state.settings.quality);
        audio.setMuted(!!this.game.state.settings.muted);
        audio.startMusic();
        this._buildShip();
        this.app.setScene('earth');
        toast('Mission loaded — welcome back, Captain', 'good');
        this._offlineReport();
      } else {
        toast('No saved mission found', 'warn');
      }
    };
    $('[data-act="new"]', ui).onclick = async () => {
      audio.ensure(); audio.ui();
      if (Game.hasSave()) {
        const yes = await confirmModal({
          title: 'Start a new mission?',
          body: 'Your existing save will be overwritten. All ships, districts and discoveries will be lost.',
          ok: 'Start fresh', danger: true,
        });
        if (!yes) return;
      }
      this.game.reset();
      this.game.save(true);
      audio.startMusic();
      this.app.setScene('earth');
      showIntro(this.app);
    };
  }

  _offlineReport() {
    const r = this.game.offlineReport;
    if (!r) return;
    const h = Math.floor(r.away / 3600);
    const m = Math.floor((r.away % 3600) / 60);
    setTimeout(() => toast(`While you were away (${h}h ${m}m): +${fmtC(r.credits)}, +${fmt(r.research)} RP`, 'good', 5200), 700);
    this.game.offlineReport = null;
  }

  exit() {
    this.ui?.remove();
    this.ui = null;
  }

  update(dt, t) {
    this.time += dt;
    this.bh.update(dt, this.camera);
    if (this.ship) {
      this.shipPivot.position.y = -3 + Math.sin(this.time * 0.5) * 0.4;
      this.shipPivot.rotation.y = Math.sin(this.time * 0.16) * 0.16;
      this.ship.rotation.z = Math.sin(this.time * 0.4) * 0.03;
    }
    const a = Math.sin(this.time * 0.08) * 4;
    this.camera.position.x = a;
    this.camera.position.y = 7 + Math.sin(this.time * 0.13) * 1.2;
    this.camera.lookAt(2, 2, -10);
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}
