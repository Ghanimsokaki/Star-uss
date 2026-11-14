import { modal, toast, el, $, fmtC } from './dom.js';
import { modal as _m } from './dom.js';
import { SHIP_CLASSES, SHIP_ORDER, UPGRADE_SYSTEMS, UPGRADE_ORDER, PALETTES, TIMELINES } from '../data/ships.js';
import { ENEMIES } from '../data/enemies.js';
import { TECHS, TECH_ORDER, DISTRICTS, CODEX_ARTICLES } from '../data/tech.js';
import { MISSIONS, RANK_TITLES } from '../data/missions.js';

function rewardChips(r = {}) {
  return `${r.credits ? `<span class="chip amber">+${fmtC(r.credits)}</span>` : ''}${r.dilithium ? `<span class="chip cyan">+${r.dilithium} dilithium</span>` : ''}${r.research ? `<span class="chip violet">+${fmt(r.research)} RP</span>` : ''}`;
}

function progressBar(prog, done = false) {
  if (!prog && !done) return '';
  const [cur, max] = done ? [1, 1] : prog;
  const pct = Math.round((cur / Math.max(1, max)) * 100);
  const label = done ? 'Complete' : `${fmt(cur)} / ${fmt(max)}`;
  return `<div class="q-prog"><div class="bar thin ${done ? 'green' : ''}"><i style="width:${pct}%"></i></div><span>${label}</span></div>`;
}
import { audio } from '../core/audio.js';
import { escapeHtml, fmt } from '../core/util.js';
import { device, setControlPreference, describeDevice } from '../core/device.js';

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
          <div class="row between"><div class="tag">Tier ${c.tier} · ${(TIMELINES[c.timeline] || TIMELINES.prime).name}</div>${owned ? '<span class="chip green">Owned</span>' : ''}</div>
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
  const touch = device.scheme === 'touch';
  const phone = device.form === 'mobile';
  const m = modal({
    title: 'Captain\u2019s Handbook', sub: 'How to play', wide: true,
    body: `
      <div class="codex-entry" style="margin-bottom:10px">
        <h4>The Loop</h4>
        <p>Build your civilisation on Earth → earn credits &amp; research → upgrade your ship → chart new systems → destroy hostiles for bounty → commission bigger hulls → face the black hole.</p>
      </div>
      <div class="grid2" style="gap:10px">
        <div class="codex-entry" style="${touch ? 'opacity:.55' : ''}">
          <h4>Flight — Mouse &amp; keyboard</h4>
          <p><b>W</b> forward · <b>S</b> back · <b>A</b>/<b>D</b> turn · <b>Space</b> up · <b>Shift</b> down · <b>mouse</b>/arrows aim · <b>left click</b>/<b>K</b> phasers · <b>F</b> torpedoes · <b>E</b> ability · <b>B</b> boost · <b>P</b> autopilot · <b>Q</b> target · <b>R</b> scan · <b>T</b> warp · <b>Z</b>/<b>C</b> cruise speed · <b>X</b> all stop · <b>V</b> weapons assist · <b>right-drag</b> or two-finger swipe looks around · <b>Esc</b> close panels<br><span class="tiny faint">A gamepad works too: left stick steers, RT fires, LT torpedoes, A ability, B target, X scan, Y warp, d-pad throttle.</span></p>
        </div>
        <div class="codex-entry" style="${touch ? '' : 'opacity:.55'}">
          <h4>Flight — Touch</h4>
          <p><b>Drag anywhere</b> on the view to steer, then let go — no joystick to find. <b>Tap</b> the view to lock the nearest target. The right-hand arc is your thumb: <b>FIRE</b>, <b>TORP</b>, <b>✷</b> ability, <b>BOOST</b>, <b>SCAN</b>, <b>WARP</b>. The <b>▲▼</b> rail on the right edge is impulse throttle and the <b>■</b> button is all-stop.</p>
        </div>
        <div class="codex-entry">
          <h4>Earth &amp; Civilisation</h4>
          <p>Open <b>Earth</b>, pick a district, then tap the globe to place it. Upgrade districts for more credits, research and population. Income accrues in real time.</p>
        </div>
        <div class="codex-entry">
          <h4>Combat</h4>
          <p>Phasers lock automatically onto the nearest target inside the forward arc, and <b>weapons assist</b> gently steers you toward your locked target — turn it off with <b>V</b> if you prefer full manual control. Torpedoes are slower but hit far harder.</p>
        </div>
      </div>
      <div class="codex-entry" style="margin-top:10px">
        <h4>Travelling Between Stars</h4>
        <p>Press <b>T</b> (or the <b>WARP</b> button) to open the galaxy map. Pick a star on the left, then hit <b>Engage warp</b> or press <b>Enter</b> — you will get a full warp-jump sequence and arrive in the new system. Each jump costs dilithium based on distance and threat.</p>
      </div>
      <div class="codex-entry" style="margin-top:10px">
        <h4>Which controls am I using?</h4>
        <p>The game detects your device at boot and again whenever the window changes: a phone or tablet gets touch controls with an on-screen pad and thumb-sized buttons, a desktop gets mouse-plus-keyboard. Detected right now: <b>${escapeHtml(describeDevice())}</b>${phone ? ' — this looks like a phone, so the HUD is trimmed to fit.' : ''}. Force a scheme any time in <b>Settings → Controls</b>.</p>
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
        <div><div class="nm">Hold 60 FPS</div><div class="ds">Automatically lowers resolution, then anti-aliasing and bloom, whenever the frame rate dips — and raises them again when there is headroom</div></div>
        <div class="seg" data-seg="perf">
          <button data-p="on" class="${g.state.settings.autoPerf !== false ? 'on' : ''}">On</button>
          <button data-p="off" class="${g.state.settings.autoPerf === false ? 'on' : ''}">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Show FPS</div><div class="ds">Frame rate and render resolution in the corner</div></div>
        <div class="seg" data-seg="fps">
          <button data-fps="on" class="${g.state.settings.showFps ? 'on' : ''}">On</button>
          <button data-fps="off" class="${!g.state.settings.showFps ? 'on' : ''}">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Controls</div><div class="ds">Detected: ${escapeHtml(describeDevice())}</div></div>
        <div class="seg" data-seg="controls">
          <button data-c="auto" class="${(g.state.settings.controls || 'auto') === 'auto' ? 'on' : ''}">Auto</button>
          <button data-c="mobile" class="${g.state.settings.controls === 'mobile' ? 'on' : ''}">Touch</button>
          <button data-c="desktop" class="${g.state.settings.controls === 'desktop' ? 'on' : ''}">Mouse</button>
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
        <div><div class="nm">Auto-fire phasers</div><div class="ds">Fire continuously without pulling the trigger — off, so the ship only shoots when you do</div></div>
        <div class="seg" data-seg="auto">
          <button data-f="on" class="${g.state.settings.autoFire ? 'on' : ''}">On</button>
          <button data-f="off" class="${!g.state.settings.autoFire ? 'on' : ''}">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Weapons assist</div><div class="ds">Nudge the helm toward your locked target (toggle in flight with V)</div></div>
        <div class="seg" data-seg="assist">
          <button data-as="on" class="${g.state.settings.aimAssist !== false ? 'on' : ''}">On</button>
          <button data-as="off" class="${g.state.settings.aimAssist === false ? 'on' : ''}">Off</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="nm">Invert pitch</div><div class="ds">Pull back to climb instead of dive</div></div>
        <div class="seg" data-seg="invert">
          <button data-iy="off" class="${!g.state.settings.invertY ? 'on' : ''}">Normal</button>
          <button data-iy="on" class="${g.state.settings.invertY ? 'on' : ''}">Inverted</button>
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
      <p class="tiny faint" style="margin:14px 0 0;line-height:1.6">STAR TREK: ASCENSION — a fan-made 3D starship command game. Ships and factions are inspired by Star Trek. Most hulls, all textures and all audio are generated procedurally; Earth's maps are NASA-derived public-domain imagery, and two imported ship models come from MIT-licensed GitHub repositories (see docs/CREDITS.md).</p>`,
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
  elm.querySelectorAll('[data-seg="perf"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="perf"] button').forEach((x) => x.classList.toggle('on', x === b));
    const on = b.dataset.p === 'on';
    g.state.settings.autoPerf = on;
    app.viewport.governor.enabled = on;
    if (!on) app.viewport.governor.reset();
    g.save();
    audio.ui();
  }));
  elm.querySelectorAll('[data-seg="fps"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="fps"] button').forEach((x) => x.classList.toggle('on', x === b));
    g.state.settings.showFps = b.dataset.fps === 'on';
    app.setFpsMeter(g.state.settings.showFps);
    g.save();
    audio.ui();
  }));
  elm.querySelectorAll('[data-seg="assist"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="assist"] button').forEach((x) => x.classList.toggle('on', x === b));
    g.state.settings.aimAssist = b.dataset.as === 'on';
    g.save();
    audio.ui();
  }));
  elm.querySelectorAll('[data-seg="invert"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="invert"] button').forEach((x) => x.classList.toggle('on', x === b));
    g.state.settings.invertY = b.dataset.iy === 'on';
    g.save();
    audio.ui();
  }));
  elm.querySelectorAll('[data-seg="controls"] button').forEach((b) => b.addEventListener('click', () => {
    elm.querySelectorAll('[data-seg="controls"] button').forEach((x) => x.classList.toggle('on', x === b));
    const pref = b.dataset.c;
    g.state.settings.controls = pref;
    setControlPreference(pref);
    app.input?.applyScheme?.(device.scheme);
    g.save();
    audio.ui();
    toast(pref === 'auto'
      ? `Auto — ${device.scheme === 'touch' ? 'touch' : 'mouse + keys'} controls`
      : pref === 'mobile' ? 'Touch controls: drag to steer, tap to target' : 'Mouse + keyboard controls',
    'good', 2400);
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

export function showMissionLog(game, tab = 'story') {
  const mission = game.currentMission;
  const doneIds = new Set(game.state.missionsDone);
  const doneCount = MISSIONS.filter((m) => doneIds.has(m.id)).length;
  const contracts = game.contracts;
  const openC = contracts.filter((c) => !c.done)
    .sort((a, b) => (b.prog ? b.prog[0] / b.prog[1] : 0) - (a.prog ? a.prog[0] / a.prog[1] : 0));
  const doneC = contracts.filter((c) => c.done);

  const story = `
    <div class="q-summary">
      <span>Story progress</span><b>${doneCount} / ${MISSIONS.length}</b>
      <div class="bar thin"><i style="width:${Math.round((doneCount / MISSIONS.length) * 100)}%"></i></div>
    </div>
    ${mission ? `<div class="codex-entry quest-current">
        <div class="tag">Current orders · ${doneCount + 1} of ${MISSIONS.length}</div>
        <h4 style="color:var(--amber)">${escapeHtml(mission.title)}</h4>
        <p>${escapeHtml(mission.desc)}</p>
        <p class="q-hint">Hint: ${escapeHtml(mission.hint)}</p>
        ${progressBar(game.progressOf(mission))}
        <div class="reward-row">${rewardChips(mission.reward)}</div>
      </div>` : `<div class="codex-entry" style="border-color:rgba(98,242,166,.4)"><h4>All missions complete</h4><p>The sector is safe, Captain. Keep exploring and take on Starfleet contracts.</p></div>`}
    <ol class="quest-list">
      ${MISSIONS.map((m, i) => {
        const done = doneIds.has(m.id);
        const cur = mission && m.id === mission.id;
        const locked = !done && !cur;
        return `<li class="q-item ${done ? 'done' : ''} ${cur ? 'cur' : ''} ${locked ? 'locked' : ''}">
          <span class="q-num">${done ? '✓' : i + 1}</span>
          <div class="q-meta"><b>${locked ? 'Classified orders' : escapeHtml(m.title)}</b>
          <small>${locked ? 'Complete earlier missions to unseal.' : escapeHtml(m.desc)}</small></div>
        </li>`;
      }).join('')}
    </ol>`;

  const contractCard = (c) => `<div class="codex-entry contract ${c.done ? 'done' : ''}">
      <div class="row between"><h4 style="margin:0">${escapeHtml(c.title)}</h4>${c.done ? '<span class="chip green">Paid</span>' : ''}</div>
      <p style="margin-top:6px">${escapeHtml(c.desc)}</p>
      ${progressBar(c.prog, c.done)}
      <div class="reward-row">${rewardChips(c.reward)}</div>
    </div>`;
  const contractsHtml = `
    <div class="q-summary">
      <span>Contracts fulfilled</span><b>${doneC.length} / ${contracts.length}</b>
      <div class="bar thin amber"><i style="width:${Math.round((doneC.length / contracts.length) * 100)}%"></i></div>
    </div>
    <p class="dim small" style="margin:0 0 10px">Optional orders from Starfleet. They run alongside the story and pay out the moment you hit the target.</p>
    <div class="codex-grid">${openC.map(contractCard).join('')}${doneC.map(contractCard).join('')}</div>`;

  const m = modal({
    title: 'Mission Log', sub: 'Starfleet Command',
    body: `
      <div class="tabs q-tabs" role="tablist">
        <button class="tab ${tab === 'story' ? 'active' : ''}" data-qtab="story" role="tab">Story <span class="q-count">${doneCount}/${MISSIONS.length}</span></button>
        <button class="tab ${tab === 'contracts' ? 'active' : ''}" data-qtab="contracts" role="tab">Contracts <span class="q-count">${doneC.length}/${contracts.length}</span></button>
      </div>
      <div data-qpane="story" ${tab === 'story' ? '' : 'hidden'}>${story}</div>
      <div data-qpane="contracts" ${tab === 'contracts' ? '' : 'hidden'}>${contractsHtml}</div>`,
    footer: `<button class="btn ghost" data-close2>Close</button>`,
  });
  m.el.querySelectorAll('[data-qtab]').forEach((b) => {
    b.onclick = () => {
      audio.ui();
      m.el.querySelectorAll('[data-qtab]').forEach((x) => x.classList.toggle('active', x === b));
      m.el.querySelectorAll('[data-qpane]').forEach((p) => { p.hidden = p.dataset.qpane !== b.dataset.qtab; });
    };
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

/** Daily login reward: a seven-day streak that resets if you miss a day. */
export function showDaily(game) {
  const offer = game.dailyOffer();
  if (!offer) return null;
  const days = game.constructor.DAILY.map((r, i) => {
    const n = i + 1;
    const state = n < offer.day ? 'got' : n === offer.day ? 'today' : '';
    const label = [r.credits && fmtC(r.credits), r.dilithium && `${r.dilithium} D`, r.research && `${r.research} RP`].filter(Boolean).join('<br>');
    return `<div class="daily-day ${state}"><span>Day ${n}</span><b>${label}</b></div>`;
  }).join('');
  const m = modal({
    title: offer.streak > 1 ? `Day ${offer.streak} streak!` : 'Daily supply drop', sub: 'Starfleet Logistics',
    body: `<p class="dim" style="margin-top:0;line-height:1.6">Report for duty every day to keep the streak going — day seven pays the most.</p>
      <div class="daily-grid">${days}</div>`,
    footer: '<button class="btn primary" data-claim>Claim reward</button>',
  });
  m.el.querySelector('[data-claim]').onclick = () => {
    const got = game.claimDaily();
    if (got) {
      audio.upgrade();
      const r = got.reward;
      toast(`Supply drop: ${[r.credits && fmtC(r.credits), r.dilithium && r.dilithium + ' D', r.research && r.research + ' RP'].filter(Boolean).join(' · ')}`, 'good', 3600);
    }
    m.close();
  };
  return m;
}

/* ------------------------------------------------------------------ account */
export async function showAccount(app) {
  const cloud = await import('../core/cloud.js');
  const g = app.game;
  if (!cloud.cloudConfigured()) {
    const m = modal({
      title: 'Captain\u2019s Account', sub: 'Cloud saves · leaderboard',
      body: `<p class="dim" style="line-height:1.65;margin-top:0">Accounts are switched off in this build. Your progress is saved on this device.</p>
        <div class="codex-entry"><h4>For the game\u2019s owner</h4><p>Create a free Supabase project, run <code>supabase/schema.sql</code>, then set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README → Accounts).</p></div>`,
      footer: '<button class="btn ghost" data-close2>Close</button>',
    });
    m.el.querySelector('[data-close2]').onclick = () => m.close();
    return;
  }
  await cloud.initCloud();
  const u = cloud.user();
  if (u) return accountSignedIn(app, cloud, u);
  const m = modal({
    title: 'Captain\u2019s Account', sub: 'Sign in to sync across devices',
    body: `
      <div class="tabs q-tabs" role="tablist">
        <button class="tab active" data-acc="in">Sign in</button>
        <button class="tab" data-acc="up">Create account</button>
        <button class="tab" data-acc="link">Email link</button>
      </div>
      <form class="acc-form" data-acc-form autocomplete="on">
        <div class="field" data-f="captain" hidden><label for="acc-captain">Captain name (leaderboard)</label><input type="text" id="acc-captain" maxlength="24" autocomplete="nickname"></div>
        <div class="field"><label for="acc-email">Email</label><input type="text" id="acc-email" inputmode="email" autocomplete="email" required></div>
        <div class="field" data-f="pw"><label for="acc-pw">Password</label><input type="password" id="acc-pw" minlength="8" autocomplete="current-password"></div>
        <p class="tiny" data-acc-msg style="min-height:16px;margin:4px 0 0"></p>
        <button class="btn primary wide" type="submit" data-acc-go>Sign in</button>
      </form>`,
    footer: '<button class="btn ghost" data-close2>Not now</button>',
  });
  const E = m.el;
  let mode = 'in';
  const setMode = (k) => {
    mode = k;
    E.querySelectorAll('[data-acc]').forEach((t) => t.classList.toggle('active', t.dataset.acc === k));
    E.querySelector('[data-f="captain"]').hidden = k !== 'up';
    E.querySelector('[data-f="pw"]').hidden = k === 'link';
    E.querySelector('#acc-pw').autocomplete = k === 'up' ? 'new-password' : 'current-password';
    E.querySelector('[data-acc-go]').textContent = k === 'in' ? 'Sign in' : k === 'up' ? 'Create account' : 'Email me a sign-in link';
  };
  E.querySelectorAll('[data-acc]').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.acc)));
  const msg = (t, bad) => { const n = E.querySelector('[data-acc-msg]'); n.textContent = t; n.style.color = bad ? 'var(--red)' : 'var(--green)'; };
  E.querySelector('[data-acc-form]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = E.querySelector('#acc-email').value.trim();
    const pw = E.querySelector('#acc-pw').value;
    const btn = E.querySelector('[data-acc-go]');
    btn.disabled = true;
    msg('Contacting Starfleet\u2026');
    const res = mode === 'in' ? await cloud.signIn(email, pw)
      : mode === 'up' ? await cloud.signUp(email, pw, E.querySelector('#acc-captain').value)
      : await cloud.magicLink(email);
    btn.disabled = false;
    if (!res.ok) { msg(res.why, true); audio.error?.(); return; }
    if (mode === 'link') { msg('Check your inbox for the sign-in link.'); return; }
    if (res.needsConfirm) { msg('Account created — confirm the email we sent, then sign in.'); return; }
    m.close();
    audio.upgrade();
    toast('Signed in', 'good');
    await reconcileCloudSave(app, cloud);
    accountSignedIn(app, cloud, cloud.user());
  });
  E.querySelector('[data-close2]').onclick = () => m.close();
}

/** After sign-in: offer the cloud save if it is newer than this device's. */
export async function reconcileCloudSave(app, cloud) {
  const res = await cloud.pullSave();
  const g = app.game;
  if (!res.ok) return;
  if (!res.save) { await cloud.pushSave(g.state); return; }
  const cloudAt = Date.parse(res.updatedAt || 0) || 0;
  if (cloudAt <= (g.state.lastSave || 0) + 5000) { await cloud.pushSave(g.state); return; }
  const { confirmModal } = await import('./dom.js');
  const yes = await confirmModal({
    title: 'Load your cloud save?',
    body: `Your account has progress from ${new Date(cloudAt).toLocaleString()}, newer than this device. Load it here? (This device\u2019s save will be replaced.)`,
    ok: 'Load cloud save', cancel: 'Keep this device',
  });
  if (yes) app.loadSaveData?.(res.save);
  else await cloud.pushSave(g.state);
}

function accountSignedIn(app, cloud, u) {
  const g = app.game;
  const captain = u.user_metadata?.captain || 'Captain';
  const m = modal({
    title: escapeHtml(captain), sub: 'Captain\u2019s Account',
    body: `
      <div class="setting-row"><div><div class="nm">Signed in</div><div class="ds">${escapeHtml(u.email || '')}</div></div><span class="chip green">Cloud sync on</span></div>
      <div class="setting-row"><div><div class="nm">Sync now</div><div class="ds">Upload this device\u2019s progress and leaderboard score</div></div><button class="btn sm" data-sync>Sync</button></div>
      <div class="setting-row"><div><div class="nm">Load from cloud</div><div class="ds">Replace this device\u2019s save with your account\u2019s</div></div><button class="btn sm" data-pull>Load</button></div>
      <div class="setting-row"><div><div class="nm">Leaderboard</div><div class="ds">Top captains by experience</div></div><button class="btn sm" data-lb>Open</button></div>
      <div class="setting-row" style="border-bottom:0"><div><div class="nm">Sign out</div><div class="ds">Your local save stays on this device</div></div><button class="btn sm danger" data-out>Sign out</button></div>`,
    footer: '<button class="btn ghost" data-close2>Close</button>',
  });
  const E = m.el;
  E.querySelector('[data-sync]').onclick = async () => {
    const a = await cloud.pushSave(g.state);
    const b = await cloud.pushScore(g, captain);
    toast(a.ok && b.ok ? 'Synced to the cloud' : (a.why || b.why), a.ok && b.ok ? 'good' : 'warn');
  };
  E.querySelector('[data-pull]').onclick = async () => {
    const r = await cloud.pullSave();
    if (!r.ok || !r.save) { toast(r.why || 'No cloud save yet', 'warn'); return; }
    m.close();
    app.loadSaveData?.(r.save);
  };
  E.querySelector('[data-lb]').onclick = () => { m.close(); showLeaderboard(); };
  E.querySelector('[data-out]').onclick = async () => { await cloud.signOut(); m.close(); toast('Signed out', 'good'); };
  E.querySelector('[data-close2]').onclick = () => m.close();
}

export async function showLeaderboard() {
  const cloud = await import('../core/cloud.js');
  const res = await cloud.topScores(25);
  const me = cloud.user()?.id;
  const rows = res.ok ? res.rows : [];
  const m = modal({
    title: 'Leaderboard', sub: 'Top captains',
    body: res.ok ? (rows.length ? `<table class="lb"><thead><tr><th>#</th><th>Captain</th><th>Rank</th><th>XP</th><th>Kills</th><th>Systems</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.user_id === me ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(r.captain)}</td><td>${escapeHtml(r.rank)}</td><td>${fmt(r.xp)}</td><td>${fmt(r.kills)}</td><td>${r.systems}</td></tr>`).join('')}
      </tbody></table>` : '<p class="dim">No captains yet — be the first. Sync from your account to post a score.</p>')
      : `<p class="dim">${escapeHtml(res.why)}</p>`,
    footer: '<button class="btn ghost" data-close2>Close</button>',
  });
  m.el.querySelector('[data-close2]').onclick = () => m.close();
}
