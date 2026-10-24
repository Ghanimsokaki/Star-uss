import { modal, toast, el, $, fmtC } from './dom.js';
import { modal as _m } from './dom.js';
import { SHIP_CLASSES, SHIP_ORDER, UPGRADE_SYSTEMS, UPGRADE_ORDER, PALETTES } from '../data/ships.js';
import { ENEMIES } from '../data/enemies.js';
import { TECHS, TECH_ORDER, DISTRICTS, CODEX_ARTICLES } from '../data/tech.js';
import { MISSIONS, RANK_TITLES } from '../data/missions.js';
import { audio } from '../core/audio.js';
import { escapeHtml, fmt, isMobile } from '../core/util.js';

const tabBtn = (id, label, on) => `<button class="tab ${on ? 'active' : ''}" data-tab="${id}">${label}</button>`;

export function showCodex(game) {
  const tabs = [
    { id: 'ships', label: 'Fleet' },
    { id: 'enemies', label: 'Hostiles' },
    { id: 'tech', label: 'Research' },
    { id: 'civ', label: 'Civilisation' },
    { id: 'articles', label: 'Archives' },
  ];
  const render = (id) => {
    if (id === 'ships') {
      return `<div class="codex-grid">${SHIP_ORDER.map((sid) => {
        const c = SHIP_CLASSES[sid];
        const owned = game.state.ownedShips.includes(sid);
        const s = c.specs;
        return `<div class="codex-entry">
          <div class="row between"><div class="tag">Tier ${c.tier} · ${owned ? 'In service' : 'Not commissioned'}</div>${owned ? '<span class="chip green">Owned</span>' : ''}</div>
          <h4>${escapeHtml(c.name)} — ${escapeHtml(c.role)}</h4>
          <p>${escapeHtml(c.lore)}</p>
          <p style="margin-top:8px;color:var(--ink-faint)">Length ${s.length} · Beam ${s.beam} · Crew ${s.crew} · Mass ${s.mass} · Max warp ${s.maxWarp} · Decks ${s.decks}</p>
        </div>`;
      }).join('')}</div>`;
    }
    if (id === 'enemies') {
      return `<div class="codex-grid">${Object.values(ENEMIES).map((e) => `
        <div class="codex-entry">
          <div class="row between"><div class="tag">${escapeHtml(e.faction)}</div><span class="chip" style="color:${e.colors.glow}">Threat tier ${e.tier}</span></div>
          <h4>${escapeHtml(e.name)}</h4>
          <p>${escapeHtml(e.lore)}</p>
          <p style="margin-top:8px;color:var(--ink-faint)">Hull ${fmt(e.hp)} · Shields ${fmt(e.shield)} · Damage ${e.dmg} · Bounty ≈ ₡${fmt(e.reward.credits)}</p>
        </div>`).join('')}</div>`;
    }
    if (id === 'tech') {
      return `<div class="codex-grid">${TECH_ORDER.map((tid) => {
        const t = TECHS[tid];
        const done = game.hasTech(tid);
        return `<div class="codex-entry" style="${done ? 'border-color:rgba(98,242,166,.35)' : ''}">
          <div class="row between"><div class="tag">Tier ${t.tier} · ${t.cost} RP</div>${done ? '<span class="chip green">Researched</span>' : `<span class="chip amber">${fmt(t.cost)} RP</span>`}</div>
          <h4>${escapeHtml(t.name)}</h4>
          <p>${escapeHtml(t.desc)}</p>
        </div>`;
      }).join('')}</div>`;
    }
    if (id === 'civ') {
      return `<p class="dim small" style="margin-top:0">Build these districts on the Earth globe. Each works in real time — even while you are away.</p>
      <div class="codex-grid">${Object.values(DISTRICTS).map((d) => `
        <div class="codex-entry">
          <div class="row between"><div class="tag">${d.icon} District</div><span class="chip cyan">${d.cost ? fmtC(d.cost) : 'Starting structure'}</span></div>
          <h4>${escapeHtml(d.name)}</h4>
          <p>${escapeHtml(d.desc)}</p>
          <p style="margin-top:8px;color:var(--ink-faint)">Max level ${d.maxLevel} · Base output +₡${fmt(d.yield(1).credits)}/s${d.yield(1).research ? ` · +${d.yield(1).research} RP/s` : ''}</p>
        </div>`).join('')}</div>`;
    }
    return `<div class="codex-grid">${CODEX_ARTICLES.map((a) => `
      <div class="codex-entry"><div class="tag">${escapeHtml(a.tag)}</div><h4>${escapeHtml(a.title)}</h4><p>${escapeHtml(a.body)}</p></div>`).join('')}</div>`;
  };
  const m = modal({
    title: 'Starfleet Codex', sub: 'Research archive', wide: true,
    body: `<div class="tabs" style="padding:0 0 12px">${tabs.map((t, i) => tabBtn(t.id, t.label, i === 0)).join('')}</div><div id="codex-body">${render('ships')}</div>`,
    footer: `<button class="btn ghost" data-close2>Close</button>`,
  });
  m.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    m.el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    m.el.querySelector('#codex-body').innerHTML = render(b.dataset.tab);
  }));
  m.el.querySelector('[data-close2]').onclick = () => m.close();
}

export function showHowTo() {
  const touch = isMobile();
  const m = modal({
    title: 'Captain\u2019s Handbook', sub: 'How to play', wide: true,
    body: `
      <div class="codex-entry" style="margin-bottom:10px">
        <h4>The Loop</h4>
        <p>Build your civilisation on Earth → earn credits &amp; research → upgrade your ship → chart new systems → destroy hostiles for bounty → commission bigger hulls → face the black hole.</p>
      </div>
      <div class="grid2" style="gap:10px">
        <div class="codex-entry">
          <h4>Flight — Desktop</h4>
          <p><b>Mouse</b> steers · <b>W A S D</b> steer · <b>Space / Left click</b> phasers · <b>F / Right click</b> torpedoes · <b>Shift</b> boost · <b>Q</b> target · <b>E</b> scan · <b>Esc</b> close panels</p>
        </div>
        <div class="codex-entry">
          <h4>Flight — Touch</h4>
          <p>Drag the <b>left stick</b> to steer. Tap <b>FIRE</b> for phasers, <b>TORP</b> for torpedoes, <b>BOOST</b> for a burst of speed and <b>SCAN</b> when you are close to a planet or anomaly.</p>
        </div>
        <div class="codex-entry">
          <h4>Earth &amp; Civilisation</h4>
          <p>Open <b>Earth</b>, pick a district, then tap the globe to place it. Upgrade districts for more credits, research and population. Income accrues in real time.</p>
        </div>
        <div class="codex-entry">
          <h4>Combat</h4>
          <p>Phasers lock automatically onto the nearest target inside the forward arc. Torpedoes are slower but hit far harder. Keep your bow pointed at the enemy and watch your shield regeneration.</p>
        </div>
      </div>
      <div class="codex-entry" style="margin-top:10px">
        <h4>Survive the Singularity</h4>
        <p>Research <b>Singularity Physics</b> before entering the Vela Singularity. Get too close to an event horizon and gravity will tear your ship apart.</p>
      </div>`,
    footer: `<button class="btn primary" data-close2>Understood</button>`,
  });
  m.el.querySelector('[data-close2]').onclick = () => m.close();
}

export function showSettings(app) {
  const g = app.game;
  const quality = g.state.settings.quality || 'auto';
  const m = modal({
    title: 'Settings', sub: 'Systems configuration',
    body: `
      <div class="setting-row">
        <div><div class="nm">Graphics</div><div class="ds">Resolution, bloom and model detail</div></div>
        <div class="seg" data-seg="quality">
          ${['auto', 'low', 'medium', 'high'].map((q) => `<button data-q="${q}" class="${quality === q ? 'on' : ''}">${q}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Audio</div><div class="ds">Procedural soundtrack and effects</div></div>
        <div class="seg" data-seg="audio">
          <button data-a="on" class="${!audio.muted ? 'on' : ''}">On</button>
          <button data-a="off" class="${audio.muted ? 'on' : ''}">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Auto-fire phasers</div><div class="ds">Keep firing while a target is in arc (mobile-friendly)</div></div>
        <div class="seg" data-seg="auto">
          <button data-f="on" class="${g.state.settings.autoFire ? 'on' : ''}">On</button>
          <button data-f="off" class="${!g.state.settings.autoFire ? 'on' : ''}">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Save game</div><div class="ds">Last saved ${new Date(g.state.lastSave || Date.now()).toLocaleString()}</div></div>
        <button class="btn sm" data-save>Save now</button>
      </div>
      <div class="setting-row" style="border-bottom:0">
        <div><div class="nm" style="color:#ff9d94">Reset universe</div><div class="ds">Erase your save and start a new mission</div></div>
        <button class="btn sm danger" data-reset>Reset</button>
      </div>
      <p class="tiny faint" style="margin:14px 0 0;line-height:1.6">STAR TREK: ASCENSION — a fan-made 3D starship command game. Ships and factions are inspired by Star Trek; all models, textures and audio assets are generated procedurally or sourced from public-domain NASA Earth imagery.</p>`,
    footer: `<button class="btn ghost" data-close2>Done</button>`,
  });
  const elm = m.el;
  elm.querySelectorAll('[data-seg="quality"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="quality"] button').forEach((x) => x.classList.toggle('on', x === b));
    const q = b.dataset.q;
    g.state.settings.quality = q;
    app.applyQuality(q);
    g.save();
  }));
  elm.querySelectorAll('[data-seg="audio"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="audio"] button').forEach((x) => x.classList.toggle('on', x === b));
    audio.ensure();
    audio.setMuted(b.dataset.a === 'off');
    g.state.settings.muted = audio.muted;
    audio.ui();
    g.save();
  }));
  elm.querySelectorAll('[data-seg="auto"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="auto"] button').forEach((x) => x.classList.toggle('on', x === b));
    g.state.settings.autoFire = b.dataset.f === 'on';
    g.save();
  }));
  elm.querySelector('[data-save]').onclick = () => { g.save(true); toast('Mission data saved', 'good'); };
  elm.querySelector('[data-reset]').onclick = async () => {
    const { confirmModal } = await import('./dom.js');
    const yes = await confirmModal({ title: 'Reset universe?', body: 'Every ship, district and discovery will be erased. This cannot be undone.', ok: 'Erase and restart', danger: true });
    if (yes) {
      g.reset();
      m.close();
      app.setScene('title');
    }
  };
  elm.querySelector('[data-close2]').onclick = () => m.close();
}

export function showMissionLog(game) {
  const mission = game.currentMission;
  const done = MISSIONS.filter((m) => game.state.missionsDone.includes(m.id));
  const m = modal({
    title: 'Mission Log', sub: 'Starfleet Command',
    body: `
      ${mission ? `<div class="codex-entry" style="margin-bottom:12px;border-color:rgba(255,179,71,.4)">
        <div class="tag">Current orders</div>
        <h4 style="color:var(--amber)">${escapeHtml(mission.title)}</h4>
        <p>${escapeHtml(mission.desc)}</p>
        <p style="margin-top:8px;color:var(--ink-faint)">Hint: ${escapeHtml(mission.hint)}</p>
        <div class="reward-row">
          ${mission.reward.credits ? `<span class="chip amber">+${fmtC(mission.reward.credits)}</span>` : ''}
          ${mission.reward.dilithium ? `<span class="chip cyan">+${mission.reward.dilithium} dilithium</span>` : ''}
          ${mission.reward.research ? `<span class="chip violet">+${fmt(mission.reward.research)} RP</span>` : ''}
        </div>
      </div>` : `<div class="codex-entry" style="border-color:rgba(98,242,166,.4)"><h4>All missions complete</h4><p>The sector is safe, Captain. Keep exploring — the galaxy is procedurally endless.</p></div>`}
      <div class="codex-grid">
        ${done.map((d) => `<div class="codex-entry" style="opacity:.72"><div class="row between"><h4 style="margin:0">${escapeHtml(d.title)}</h4><span class="chip green">Complete</span></div><p style="margin-top:6px">${escapeHtml(d.desc)}</p></div>`).join('')}
      </div>`,
    footer: `<button class="btn ghost" data-close2>Close</button>`,
  });
  m.el.querySelector('[data-close2]').onclick = () => m.close();
}

export function showRankUp(rankData) {
  toast(`Promoted to ${rankData.title}`, 'good', 4200);
  audio.upgrade();
}

export function showIntro(app) {
  const m = modal({
    title: 'Welcome Aboard, Captain', sub: 'Stardate 52136.4 · San Francisco',
    body: `
      <p class="dim" style="line-height:1.7;margin-top:0">Starfleet Command has given you the <b>U.S.S. Reliant</b>, a Miranda-class light cruiser, and a single blue planet to defend.</p>
      <p class="dim" style="line-height:1.7">Earth is yours to build. The frontier is yours to chart. Somewhere beyond the Black Cluster, something is charting back.</p>
      <div class="codex-entry" style="margin-top:14px">
        <h4>Your first orders</h4>
        <p>1. Raise an Arcology District on the Earth globe.<br>2. Refit the Reliant in the shipyard.<br>3. Launch, survey a planet, and clear the patrol.</p>
      </div>`,
    footer: `<button class="btn primary" data-close2>Take command</button>`,
    onClose: () => { app?.game && (app.game.state.flags.introSeen = true, app.game.save()); },
  });
  m.el.querySelector('[data-close2]').onclick = () => m.close();
}
