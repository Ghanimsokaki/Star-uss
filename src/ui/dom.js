import { fmt, escapeHtml } from '../core/util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const fmtC = (n) => '₡' + fmt(n);
export const fmtR = (n) => fmt(n) + ' RP';
export const fmtD = (n) => fmt(n) + ' D';

export const ICONS = {
  earth: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18"/></svg>`,
  galaxy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 12c2-3 6-2.5 6 .5S13 18 9 16.5 4.5 10 8 7.5 17 5 19 9"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  ship: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l4 7 4 3-8-1-8 1 4-3z"/><path d="M12 12v8"/><path d="M8 20h8"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z"/><path d="M8 7h7M8 11h7M8 15h5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>`,
  warp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12h7l3-7 3 14 3-7h2"/></svg>`,
  scan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  fire: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 19L19 5M19 5h-6M19 5v6"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>`,
  close: '✕',
  play: '▶',
  chevron: '›',
};

/* --------------------------------------------------------------- toasts */
let toastLayer = null;
export function toast(text, kind = '', ms = 2800) {
  if (!toastLayer) {
    toastLayer = el('<div class="toasts"></div>');
    document.getElementById('ui').appendChild(toastLayer);
  }
  const t = el(`<div class="toast ${kind}"><span>${text}</span></div>`);
  toastLayer.appendChild(t);
  if (toastLayer.children.length > 4) toastLayer.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
  return t;
}

/* --------------------------------------------------------------- modal */
const modalStack = [];
export function modal({ title = '', sub = '', body = '', footer = '', wide = false, onClose = null, closable = true } = {}) {
  const layer = el(`<div class="modal-layer"></div>`);
  const m = el(`
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div><div class="sub">${escapeHtml(sub)}</div><h2>${escapeHtml(title)}</h2></div>
        ${closable ? `<button class="close-x" data-close aria-label="Close">✕</button>` : ''}
      </div>
      <div class="modal-body scroll">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`);
  layer.appendChild(m);
  document.getElementById('ui').appendChild(layer);
  const close = () => {
    if (!layer.isConnected) return;
    layer.remove();
    const i = modalStack.indexOf(api);
    if (i >= 0) modalStack.splice(i, 1);
    onClose?.();
  };
  const api = { el: m, layer, close };
  modalStack.push(api);
  if (closable) {
    layer.addEventListener('pointerdown', (e) => { if (e.target === layer) close(); });
    m.querySelector('[data-close]')?.addEventListener('click', close);
  }
  return api;
}

export function closeModals() {
  while (modalStack.length) modalStack.pop().close();
}
export const hasModal = () => modalStack.length > 0;

export function confirmModal({ title, body, ok = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const m = modal({
      title, sub: 'Confirmation', body: `<p style="color:var(--ink-dim);line-height:1.6">${body}</p>`,
      footer: `<button class="btn ghost" data-no>${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${ok}</button>`,
      onClose: () => resolve(false),
    });
    m.el.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
    m.el.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
  });
}

/* --------------------------------------------------------------- bars */
export const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

/* --------------------------------------------------------------- top bar */
let topbarEl = null;
let refs = null;

export function buildTopbar(game, active, onNav) {
  if (topbarEl) {
    topbarEl.remove();
    topbarEl = null;
  }
  const navItems = [
    { id: 'earth', label: 'Earth', icon: 'earth' },
    { id: 'galaxy', label: 'Galaxy', icon: 'galaxy' },
    { id: 'hangar', label: 'Shipyard', icon: 'ship' },
    { id: 'codex', label: 'Codex', icon: 'book' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
  ];
  topbarEl = el(`
    <div class="topbar">
      <div class="tb-brand"><b>STAR TREK</b><span>${escapeHtml(game.state.civ.name)}</span></div>
      <div class="tb-sep"></div>
      <div class="tb-stats">
        <div class="stat credits"><i>◈</i><div><span class="v" data-k="credits">0</span><span class="k">credits</span></div></div>
        <div class="stat dil"><i>◆</i><div><span class="v" data-k="dil">0</span><span class="k">dilithium</span></div></div>
        <div class="stat res"><i>✧</i><div><span class="v" data-k="res">0</span><span class="k">research</span></div></div>
        <div class="stat rank"><i>★</i><div><span class="v" data-k="rank">Ensign</span><span class="k" data-k="ship">Miranda</span></div></div>
      </div>
      <div class="tb-nav"></div>
    </div>`);
  const nav = topbarEl.querySelector('.tb-nav');
  navItems.forEach((n) => {
    const b = el(`<button class="navbtn" data-nav="${n.id}">${ICONS[n.icon]}<span class="lbl">${n.label}</span></button>`);
    b.classList.toggle('active', n.id === active);
    b.addEventListener('click', () => onNav(n.id));
    nav.appendChild(b);
  });
  refs = {
    credits: topbarEl.querySelector('[data-k="credits"]'),
    dil: topbarEl.querySelector('[data-k="dil"]'),
    res: topbarEl.querySelector('[data-k="res"]'),
    rank: topbarEl.querySelector('[data-k="rank"]'),
    ship: topbarEl.querySelector('[data-k="ship"]'),
    civ: topbarEl.querySelector('.tb-brand span'),
  };
  document.getElementById('ui').appendChild(topbarEl);
  updateTopbar(game);
  return topbarEl;
}

export function updateTopbar(game) {
  if (!refs) return;
  refs.credits.textContent = fmtC(Math.floor(game.state.credits));
  refs.dil.textContent = fmt(Math.floor(game.state.dilithium));
  refs.res.textContent = fmt(Math.floor(game.state.research));
  refs.rank.textContent = game.rankTitle;
  refs.ship.textContent = game.shipClass.name.replace('-Class', '');
  refs.civ.textContent = game.state.civ.name;
}

export function setNavActive(id) {
  if (!topbarEl) return;
  $$('.navbtn', topbarEl).forEach((b) => b.classList.toggle('active', b.dataset.nav === id));
}

/* --------------------------------------------------------------- cards */
export function statBar(label, value, max, cls = '') {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return `<div class="statbar"><div class="lbl"><span>${label}</span><b>${fmt(value)}</b></div>${bar(pct, cls)}</div>`;
}

export { fmt };
