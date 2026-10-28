/**
 * Panel drawer tests.
 *
 * The bug these guard against is the one in the screenshots: two side panels
 * pinned open, stacking over the globe on a narrow screen. So the contract is
 * "closed by default, one at a time, and a tap on the world closes it".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="ui"></div></body></html>', { url: 'http://localhost/' });
const { window } = dom;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = window.document;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;

const { initDrawers, storedDrawer, storeDrawer } = await import('../src/ui/drawers.js');

/** A minimal screen that mirrors the galaxy map's markup. */
function makeScreen() {
  const ui = window.document.getElementById('ui');
  ui.innerHTML = `
    <div class="screen active galaxy-ui">
      <aside class="panel side-left">
        <div class="panel-head"><div><h3>Sector Map</h3><span class="sub">47 systems</span></div></div>
        <div class="panel-body scroll" id="sys-list"></div>
      </aside>
      <aside class="panel side-right">
        <div class="panel-head"><div><h3>Navigation</h3><span class="sub">Stellar cartography</span></div></div>
        <div class="panel-body scroll" id="sys-detail"></div>
      </aside>
      <div class="globe-hint">Drag to orbit</div>
    </div>`;
  return ui.querySelector('.screen');
}

const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const pointer = (node) => node.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));

test('panels start closed, so the map gets the whole screen', () => {
  store.clear();
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  assert.equal(d.current(), 'none', 'nothing is open by default');
  for (const p of screen.querySelectorAll('.panel')) {
    assert.equal(p.classList.contains('open'), false, 'a panel is open on arrival');
  }
  d.destroy();
});

test('the rail offers one button per panel, labelled from the panel itself', () => {
  store.clear();
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  const btns = [...screen.querySelectorAll('.drawer-btn')];
  assert.equal(btns.length, 2);
  assert.deepEqual(btns.map((b) => b.dataset.drawer), ['left', 'right']);
  assert.match(btns[0].textContent, /Sector Map/, 'the left button should say what it opens');
  assert.match(btns[1].textContent, /Navigation/);
  d.destroy();
});

test('opening one panel closes the other — they never stack', () => {
  store.clear();
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  const [left, right] = screen.querySelectorAll('.panel');

  d.open('left');
  assert.equal(left.classList.contains('open'), true);
  assert.equal(right.classList.contains('open'), false);

  d.open('right');
  assert.equal(left.classList.contains('open'), false, 'the left panel must give way');
  assert.equal(right.classList.contains('open'), true);
  assert.equal(d.current(), 'right');
  d.destroy();
});

test('the rail button toggles the panel it names', () => {
  store.clear();
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  const leftBtn = screen.querySelector('.drawer-btn[data-drawer="left"]');

  click(leftBtn);
  assert.equal(d.current(), 'left');
  assert.equal(leftBtn.getAttribute('aria-expanded'), 'true');
  click(leftBtn);
  assert.equal(d.current(), 'none', 'a second press closes it again');
  d.destroy();
});

test('the ✕ in the panel head closes it', () => {
  store.clear();
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  d.open('right');
  const closeBtn = screen.querySelector('.panel.side-right .drawer-close');
  assert.ok(closeBtn, 'every panel needs its own close button');
  click(closeBtn);
  assert.equal(d.current(), 'none');
  d.destroy();
});

test('a tap on the world dismisses the drawer; a tap on a panel does not', () => {
  store.clear();
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  d.open('left');

  pointer(screen.querySelector('#sys-list'));       // inside the panel
  assert.equal(d.current(), 'left', 'interacting with the panel must not close it');

  pointer(screen.querySelector('.globe-hint'));      // the 3D view behind
  assert.equal(d.current(), 'none', 'tapping the world closes it');
  d.destroy();
});

test('a tap on a HUD button is left alone', () => {
  store.clear();
  const screen = makeScreen();
  screen.insertAdjacentHTML('beforeend', '<button id="launch" class="btn primary">LAUNCH</button>');
  const d = initDrawers(screen, { key: 'galaxy' });
  d.open('right');
  pointer(screen.querySelector('#launch'));
  assert.equal(d.current(), 'right', 'the launch button must stay usable with a drawer open');
  d.destroy();
});

test('the choice is remembered per screen', () => {
  store.clear();
  const first = makeScreen();
  const d1 = initDrawers(first, { key: 'galaxy' });
  d1.open('right');
  d1.destroy();

  assert.equal(storedDrawer('galaxy'), 'right');
  const second = makeScreen();
  const d2 = initDrawers(second, { key: 'galaxy' });
  assert.equal(d2.current(), 'right', 'a player who wants the panel open keeps it open');
  assert.equal(second.querySelector('.side-right').classList.contains('open'), true);
  d2.destroy();

  // a different screen is unaffected
  assert.equal(storedDrawer('earth'), 'none');
  storeDrawer('earth', 'left');
  assert.equal(storedDrawer('earth'), 'left');
  store.clear();
});

test('garbage in storage is ignored, not rendered', () => {
  store.clear();
  store.set('startrek.ascension.panels.galaxy', JSON.stringify('sideways'));
  assert.equal(storedDrawer('galaxy'), 'none');
  const screen = makeScreen();
  const d = initDrawers(screen, { key: 'galaxy' });
  assert.equal(d.current(), 'none');
  d.destroy();
  store.clear();
});

test('destroy() leaves the screen exactly as it was', () => {
  store.clear();
  const screen = makeScreen();
  const before = screen.innerHTML;
  const d = initDrawers(screen, { key: 'galaxy' });
  d.destroy();
  assert.equal(screen.querySelector('.drawer-rail'), null);
  assert.equal(screen.querySelector('.drawer-scrim'), null);
  assert.equal(screen.querySelectorAll('.drawer-panel').length, 0);
  assert.equal(screen.querySelectorAll('.drawer-close').length, 0);
  assert.equal(screen.innerHTML, before, 'the panels should be back to plain markup');
});

test('a screen with no panels is a no-op', () => {
  const ui = window.document.getElementById('ui');
  ui.innerHTML = '<div class="screen active"><div>nothing</div></div>';
  const d = initDrawers(ui.querySelector('.screen'), { key: 'empty' });
  assert.equal(d, null);
  assert.equal(ui.querySelector('.drawer-rail'), null);
});
