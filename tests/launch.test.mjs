/**
 * Launch tests: the weapon defaults and the Vercel deployment contract.
 *
 * The second half is deliberately boring — it fails loudly if someone edits
 * vercel.json into something that would stop the site (or its 19 MB of .glb
 * models) from being served.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ storage */
// game.js reads localStorage at import time; give node a real one to talk to.
const store = new Map();
const localStorageShim = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.localStorage = localStorageShim;

const { Game, game } = await import('../src/game.js');
const SAVE_KEY = 'startrek.ascension.save.v1';

/* ------------------------------------------------------------- weapon state */
test('a new game does not fire on its own', () => {
  const g = new Game();
  assert.equal(g.state.settings.autoFire, false, 'auto-fire must default to OFF');
});

test('the shipped singleton is not in hands-free mode either', () => {
  assert.equal(game.state.settings.autoFire, false);
});

test('an old save that had auto-fire on is migrated off, once', () => {
  const old = new Game();
  old.state.version = 3;
  old.state.settings.autoFire = true;
  store.set(SAVE_KEY, JSON.stringify(old.state));

  const loaded = new Game();
  assert.equal(loaded.load(), true);
  assert.equal(loaded.state.settings.autoFire, false, 'v3 saves are migrated to manual fire');
  assert.equal(loaded.state.version, 4, 'the migration is stamped so it cannot run twice');

  // the player may turn it back on, and that choice must survive a reload
  loaded.state.settings.autoFire = true;
  loaded.save(true);
  const again = new Game();
  again.load();
  assert.equal(again.state.settings.autoFire, true, 'an explicit opt-in sticks');
  store.clear();
});

test('manual fire still has a working path in the settings UI', () => {
  const menus = fs.readFileSync(path.join(root, 'src/ui/menus.js'), 'utf8');
  assert.match(menus, /data-f="on"/);
  assert.match(menus, /data-f="off"/);
  assert.doesNotMatch(menus, /Keep firing while a target is in arc/, 'the misleading copy is gone');
});

/* ------------------------------------------------------------------- vercel */
const vercelPath = path.join(root, 'vercel.json');
const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

test('vercel.json builds this repo as a static Vite site', () => {
  assert.equal(vercel.framework, 'vite');
  assert.equal(vercel.outputDirectory, 'dist');
  assert.equal(vercel.buildCommand, 'npm run build');
});

test('npm run build still regenerates the model manifest first', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts.prebuild, 'node scripts/scan-models.mjs');
});

test('no catch-all rewrite can shadow the model files', () => {
  for (const r of vercel.rewrites || []) {
    const src = String(r.source || '');
    assert.ok(
      !/^\/?\(.*\)$/.test(src) && !src.startsWith('/:path'),
      `rewrite ${src} -> ${r.destination} would swallow /models/*.glb`,
    );
  }
});

test('models are revalidated, hashed assets are immutable', () => {
  const bySource = Object.fromEntries((vercel.headers || []).map((h) => [h.source, h.headers]));
  const models = JSON.stringify(bySource['/models/(.*)'] || []);
  const assets = JSON.stringify(bySource['/assets/(.*)'] || []);
  assert.match(models, /must-revalidate|max-age=0/, 'a replaced .glb must not be cached forever');
  assert.match(assets, /immutable/);
});

test('the model folder the build ships is complete and matches the manifest', () => {
  const dir = path.join(root, 'public', 'models');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const ids = Object.keys(manifest.models);
  assert.ok(ids.length >= 3, `expected the three imported hulls, found ${ids.join(', ')}`);
  for (const [id, entry] of Object.entries(manifest.models)) {
    const file = path.join(dir, entry.file);
    assert.ok(fs.existsSync(file), `${id}: ${entry.file} is in the manifest but missing on disk`);
    assert.equal(fs.statSync(file).size, entry.bytes, `${id}: manifest size is stale, re-run models:scan`);
  }
});

/* ---------------------------------------------------------------- build out */
const dist = path.join(root, 'dist');
test('a production build exists and contains the app and the models', { skip: !fs.existsSync(dist) }, () => {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'dist/index.html');
  assert.ok(fs.existsSync(path.join(dist, 'models', 'manifest.json')), 'dist/models/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'models', 'manifest.json'), 'utf8'));
  for (const entry of Object.values(manifest.models)) {
    assert.ok(fs.existsSync(path.join(dist, 'models', entry.file)), `dist/models/${entry.file}`);
  }
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /\/@vite\/client/, 'dev-only client must not ship');
  assert.doesNotMatch(html, /localhost:\d+/, 'no dev URLs in the shipped html');
});
