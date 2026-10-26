/**
 * Panel drawers — every side panel opens from a button.
 *
 * The galaxy map, Earth and the shipyard all used to pin a panel to each edge.
 * On a phone (or a laptop with the window snapped) those two panels cover most
 * of the globe they are supposed to be describing. So the panels became
 * drawers:
 *
 *   · closed by default — the reason you are on the screen (the globe, the map,
 *     the ship) gets the whole viewport
 *   · a small rail of buttons opens one, labelled with the panel's own title
 *   · only one is open at a time, and any tap on the 3D view closes it again
 *   · the choice is remembered per screen, so a player who always wants the
 *     sector map open keeps it open
 *
 * Nothing in the scenes changes: the panels keep their ids and their innerHTML
 * is still written by the scene. This module only decides what is on screen.
 */
import { storage } from '../core/util.js';

const KEY_PREFIX = 'startrek.ascension.panels.';

/** Which drawer (if any) is remembered as open for a screen. */
export function storedDrawer(screenKey) {
  try {
    const v = storage.get(`${KEY_PREFIX}${screenKey}`, null);
    return v === 'left' || v === 'right' ? v : 'none';
  } catch { return 'none'; }
}

export function storeDrawer(screenKey, which) {
  try { storage.set(`${KEY_PREFIX}${screenKey}`, which === 'left' || which === 'right' ? which : 'none'); } catch { /* private mode */ }
}

/** Icons for the rail, keyed by which side the panel lives on. */
const ICON = { left: '◧', right: '◨' };

/**
 * Turn the side panels inside `screen` into drawers with a toggle rail.
 *
 * @param {HTMLElement} screen  the scene's `.screen` element
 * @param {{ key: string, open?: 'left'|'right'|'none' }} opts
 *        key    stable name for remembering the state ("galaxy", "earth", …)
 *        open   force an initial drawer instead of the remembered one
 * @returns {{ open:(s:string)=>void, close:()=>void, toggle:(s:string)=>void,
 *             current:()=>string, destroy:()=>void }} controller
 */
export function initDrawers(screen, { key, open = null } = {}) {
  if (!screen) return null;
  const panels = [...screen.querySelectorAll('.panel.side-left, .panel.side-right')];
  if (!panels.length) return null;

  let current = open || storedDrawer(key);
  if (current !== 'none' && !panels.some((p) => sideOf(p) === current)) current = 'none';

  /* ---------------------------------------------------------------- panels */
  panels.forEach((panel) => {
    const side = sideOf(panel);
    panel.dataset.drawer = side;
    panel.classList.add('drawer-panel');

    // a way out that does not require aiming at the rail
    const head = panel.querySelector('.panel-head');
    if (head && !head.querySelector('.drawer-close')) {
      const btn = document.createElement('button');
      btn.className = 'drawer-close';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Close panel');
      btn.textContent = '✕';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
      });
      head.appendChild(btn);
    }
  });

  /* ------------------------------------------------------------------ rail */
  const rail = document.createElement('div');
  rail.className = 'drawer-rail';
  rail.innerHTML = panels.map((panel) => {
    const side = sideOf(panel);
    const title = panel.querySelector('.panel-head h3')?.textContent?.trim() || (side === 'left' ? 'Panel' : 'Details');
    const sub = panel.querySelector('.panel-head .sub')?.textContent?.trim() || '';
    return `<button type="button" class="drawer-btn" data-drawer="${side}"
              aria-expanded="false" title="${escapeAttr(title)} — open the panel">
        <span class="ic" aria-hidden="true">${ICON[side]}</span>
        <span class="tx"><b>${escapeAttr(title)}</b>${sub ? `<i>${escapeAttr(sub)}</i>` : ''}</span>
      </button>`;
  }).join('');
  screen.appendChild(rail);

  // tapping the world (anything that is not a panel or the rail) shuts the drawer
  const scrim = document.createElement('div');
  scrim.className = 'drawer-scrim';
  screen.appendChild(scrim);
  scrim.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    close();
  });
  screen.addEventListener('pointerdown', (e) => {
    if (current === 'none') return;
    if (e.target.closest('.panel')) return;
    if (e.target.closest('.drawer-rail')) return;
    // the HUD's own buttons keep working; only a tap on empty space closes
    if (e.target.closest('button')) return;
    close();
  });

  /* -------------------------------------------------------------- behaviour */
  function sideOf(panel) {
    return panel.classList.contains('side-left') ? 'left' : 'right';
  }

  function apply(animate = true) {
    panels.forEach((panel) => {
      const on = sideOf(panel) === current;
      panel.classList.toggle('open', on);
      if (!animate) panel.classList.add('no-anim');
      if (!animate) requestAnimationFrame(() => panel.classList.remove('no-anim'));
    });
    screen.classList.toggle('has-drawer', current !== 'none');
    rail.querySelectorAll('.drawer-btn').forEach((b) => {
      const on = b.dataset.drawer === current;
      b.classList.toggle('on', on);
      b.setAttribute('aria-expanded', String(on));
    });
  }

  function openDrawer(side) {
    current = side === 'left' || side === 'right' ? side : 'none';
    storeDrawer(key, current);
    apply();
  }
  function close() {
    current = 'none';
    storeDrawer(key, current);
    apply();
  }
  function toggle(side) {
    openDrawer(current === side ? 'none' : side);
  }

  rail.querySelectorAll('.drawer-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle(btn.dataset.drawer);
    });
  });

  apply(false);

  return {
    open: openDrawer,
    close,
    toggle,
    current: () => current,
    destroy() {
      rail.remove();
      scrim.remove();
      panels.forEach((p) => {
        p.classList.remove('drawer-panel', 'open', 'no-anim');
        delete p.dataset.drawer;
        p.querySelector('.drawer-close')?.remove();
      });
    },
  };
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
