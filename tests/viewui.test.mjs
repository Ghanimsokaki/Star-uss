/**
 * Contract tests for the two view controls: the detached camera and the
 * "hide every panel" switch.
 *
 * The interaction itself needs a browser, so what is pinned down here is the
 * part that silently rots: the switch must hide the panels *and* stay
 * reachable, the choice must survive a reload, the camera must only exist in
 * the flight scene, and it must be torn down with the scene.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('"hide UI" is a default setting and survives a save/load round trip', () => {
  const game = read('src/game.js');
  assert.match(game, /hudHidden:\s*false/, 'hudHidden must exist in the defaults');
  const main = read('src/main.js');
  assert.match(main, /settings\.hudHidden\s*=\s*this\.uiHidden/, 'the choice is written to the save');
  assert.match(main, /settings\.hudHidden\)\s*this\.setUiHidden\(true, \{ persist: false \}\)/,
    'and restored at boot without triggering a save loop');
});

test('the hide-UI rule covers every scene, not just the flight HUD', () => {
  const css = read('src/style.css');
  for (const sel of ['.topbar', '.hud', '.galaxy-ui', '.earth-ui', '.hangar-ui']) {
    const rule = css.split('\n').find((l) => l.includes('body.ui-hidden') && l.includes(sel));
    assert.ok(rule, `body.ui-hidden must hide ${sel}, or that screen keeps its panels`);
  }
});

test('hiding the UI never hides the way to bring it back', () => {
  const css = read('src/style.css');
  // only a rule *scoped to* body.ui-hidden could hide the pill
  assert.doesNotMatch(
    css,
    /body\.ui-hidden[^{}]*\.view-controls/,
    'the view-controls pill must stay visible while the UI is hidden',
  );
  const main = read('src/main.js');
  assert.match(main, /document\.body\.appendChild\(this\.viewControls\)/,
    'the pill lives on <body>, outside the scenes that get hidden');
});

test('the view pill sits above the HUD but below dialogs', () => {
  const css = read('src/style.css');
  const block = css.slice(css.indexOf('.view-controls {'), css.indexOf('.view-controls {') + 300);
  const z = Number((block.match(/z-index:\s*(\d+)/) || [])[1]);
  assert.ok(z > 20, `z-index ${z} must be above the topbar (20)`);
  assert.ok(z < 60, `z-index ${z} must be below the modal layer (60)`);
});

test('there is a keyboard escape hatch for both controls', () => {
  const main = read('src/main.js');
  assert.match(main, /e\.key\.toLowerCase\(\) === 'u'/, 'U toggles the panels');
  const input = read('src/core/input.js');
  assert.match(input, /k === 'o'\)\s*this\._press\('cam'\)/, 'O toggles the camera');
});

test('the free camera only exists in the flight scene, and is disposed with it', () => {
  const sys = read('src/scenes/system.js');
  assert.match(sys, /new FreeCam\(this\.app\.canvas/, 'the flight scene owns the rig');
  assert.match(sys, /this\.freecam\?\.dispose\(\);/, 'and disposes it on exit');
  assert.match(sys, /toggleFreeCam\(\)/, 'the global button drives the scene, not its own copy');

  for (const scene of ['earth', 'galaxy', 'hangar', 'title']) {
    const src = read(`src/scenes/${scene}.js`);
    assert.doesNotMatch(src, /FreeCam/, `${scene} should not build a second rig`);
  }
});

test('a drag that orbits the camera cannot also fire the guns', () => {
  const cam = read('src/core/freecam.js');
  assert.match(cam, /e\.stopPropagation\(\)/, 'the orbit gesture is swallowed before the HUD sees it');
  assert.match(cam, /capture: true/, 'and it is captured before the flight controls');
  const input = read('src/core/input.js');
  assert.match(input, /lookLocked/, 'cursor steering is suspended while the camera owns the pointer');
});

test('the flight HUD advertises the camera key', () => {
  const sys = read('src/scenes/system.js');
  assert.match(sys, /<b>O<\/b> camera/, 'the key strip should mention O');
});

test('free cam hands the screen back the way it found it', () => {
  const main = read('src/main.js');
  // remembers the pre-existing choice instead of forcing the HUD back on
  assert.match(main, /this\._uiBeforeFreeCam\s*=\s*this\.uiHidden/);
  assert.match(main, /else if \(this\._uiBeforeFreeCam === false\)/,
    'a player who had the UI hidden should stay hidden after leaving free cam');
});

/* ---------------------------------------------------------------- viewer */
test('the hull viewer is a real second page, not just a link', () => {
  const html = read('viewer.html');
  assert.match(html, /src="\/src\/viewer\.js"/, 'the page must load its own entry');
  assert.match(html, /type="file"[^>]*accept="\.glb,\.gltf,\.fbx"/, 'it can open the formats people author');
  const js = read('src/viewer.js');
  assert.match(js, /new FBXLoader/, 'FBX is the format being authored, so it must be supported');
  assert.match(js, /new GLTFLoader/);
  assert.match(js, /new OrbitControls/, 'inspecting a hull needs an orbit rig');
  // it must not drag the game in behind it
  assert.doesNotMatch(js, /from '\.\/game\.js'/, 'the viewer must stay standalone');
  assert.doesNotMatch(js, /localStorage|game\.state/, 'and must never touch the save file');
});

test('vite builds both pages, so the viewer survives a deploy', () => {
  const cfg = read('vite.config.js');
  assert.match(cfg, /main: path\.resolve\(root, 'index\.html'\)/);
  assert.match(cfg, /viewer: path\.resolve\(root, 'viewer\.html'\)/);
  // a duplicated rollupOptions key would silently drop the input list
  assert.equal((cfg.match(/rollupOptions\s*:/g) || []).length, 1, 'rollupOptions must be declared once');
});
