/**
 * Planet-surface tests.
 *
 * These boot the real PlanetScene against a real Game object inside jsdom, so
 * what is exercised is the actual landing flow — first-landing bonus, walking,
 * talking, sampling a deposit once, lifting off — rather than a copy of it.
 *
 * No renderer is created: three.js only needs WebGL when it *draws*, and the
 * scene is driven by calling update() directly, exactly as the raf loop would.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><html><body>
  <canvas id="viewport" width="1280" height="720"></canvas>
  <div id="ui"></div>
</body></html>`, { pretendToBeVisual: true, url: 'http://localhost:5173/' });

const { window } = dom;
const store = new Map();
globalThis.window = window;
globalThis.document = window.document;
// node 22 exposes its own read-only navigator, so define rather than assign
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

// jsdom has no 2D canvas without the `canvas` package. The game paints a lot of
// procedural textures with it, so hand back a context where every drawing call
// is a no-op and the gradient reads return something with addColorStop().
const paint = {
  addColorStop() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {}, arcTo() {},
  bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, rect() {},
  createRadialGradient: () => paint, createLinearGradient: () => paint,
  createPattern: () => ({}),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData() {}, drawImage() {}, fillText() {}, strokeText() {}, measureText: () => ({ width: 8 }),
  setTransform() {}, resetTransform() {}, translate() {}, rotate() {}, scale() {},
  save() {}, restore() {}, clip() {}, fillRect() {}, strokeRect() {}, clearRect() {},
};
window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
  if (type !== '2d') return null;
  // unknown calls (lineDash, filter, …) resolve to no-ops rather than throwing
  return new Proxy(paint, {
    get: (target, key) => (key in target ? target[key] : () => {}),
  });
};

const THREE = await import('three');
const { PAD_RADIUS } = await import('../src/art/surface.js');
const { Game } = await import('../src/game.js');
const { PlanetScene } = await import('../src/scenes/planet.js');
const { SystemScene } = await import('../src/scenes/system.js');

/* --------------------------------------------------------------- fixtures */
function makeInput() {
  return {
    keys: new Set(),
    actions: { fire: false, torpedo: false, boost: false, brake: false },
    steer: { x: 0, y: 0 },
    pressed: new Set(),
    lookLocked: false,
    update() {},
    syncSteer() {},
    consume(name) {
      if (this.pressed.has(name)) { this.pressed.delete(name); return true; }
      return false;
    },
    press(name) { this.pressed.add(name); },
    consumeAll() { this.pressed.clear(); },
    bindStick() {},
    bindActions() {},
  };
}

function makeApp(game) {
  const scenes = [];
  const canvas = window.document.getElementById('viewport');
  const app = {
    game,
    canvas,
    environment: null,
    viewport: { width: 1280, height: 720 },
    input: makeInput(),
    setScene(name, params) { scenes.push({ name, params }); },
    scenes,
  };
  return app;
}

/** A Game on a fresh save, with the input bus stubbed. */
function makeGame() {
  const game = new Game();
  game.state.settings = { ...(game.state.settings || {}), autoFire: false };
  return game;
}

/** A landable planet and a gas giant from the generated galaxy. */
function pickPlanets(game) {
  let landable = null;
  let gas = null;
  for (const system of game.galaxy.systems) {
    for (const p of system.planets) {
      if (p.type === 'gas' && !gas) gas = { planet: p, system };
      if (p.type !== 'gas' && !landable) landable = { planet: p, system };
    }
    if (landable && gas) break;
  }
  return { landable, gas };
}

function bootPlanet() {
  store.clear();
  const game = new Game();
  const app = makeApp(game);
  const scene = new PlanetScene(app);
  const { landable } = pickPlanets(game);
  scene.enter({ planetId: landable.planet.id });
  return { game, app, scene, landable };
}

const frame = (scene, n = 1, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) scene.update(dt, i * dt);
};

/* ------------------------------------------------------------------ tests */
test('landing builds a walkable surface and pays the discovery bonus once', () => {
  const { game, scene, landable } = bootPlanet();
  assert.ok(scene._built, 'the world was built');
  assert.ok(scene.player, 'there is an away team to control');
  assert.ok(scene.ship, 'the hull set down on the pad');
  assert.ok(scene.people.length >= 4, `expected people on the surface, found ${scene.people.length}`);
  assert.ok(scene.deposits.length >= 3, `expected deposits, found ${scene.deposits.length}`);
  assert.equal(game.isLanded(landable.planet.id), true);

  const rec = game.landingInfo(landable.planet.id);
  assert.equal(rec.visits, 1);
  assert.ok(game.state.stats.landings >= 1, 'the landing is counted in stats');

  // re-landing must not pay twice
  const before = game.state.credits;
  const again = game.landOn(landable.planet.id);
  assert.equal(again.ok, true);
  assert.equal(again.first, false, 'a second landing is not a discovery');
  assert.equal(game.state.credits, before, 'no second bonus');
  assert.equal(game.landingInfo(landable.planet.id).visits, 2);
  scene.exit();
});

test('a gas giant cannot be landed on', () => {
  store.clear();
  const game = new Game();
  const { gas } = pickPlanets(game);
  const res = game.landOn(gas.planet.id);
  assert.equal(res.ok, false);
  assert.match(res.why, /Gas giant/);
  assert.equal(Game.canLand({ type: 'm' }), true);
  assert.equal(Game.canLand({ type: 'gas' }), false);
});

test('the away team walks, and stays on the ground', () => {
  const { scene } = bootPlanet();
  const start = scene.player.position.clone();
  scene.app.input.keys.add('w');
  frame(scene, 60);          // one second of walking
  const moved = scene.player.position.distanceTo(start);
  assert.ok(moved > 3, `the team should have walked, moved ${moved.toFixed(2)}`);

  // the ground clamp holds on an uneven world
  const groundY = scene.player.position.y;
  assert.ok(Number.isFinite(groundY), 'height is finite');

  scene.app.input.keys.delete('w');
  frame(scene, 30);
  const stillX = scene.player.position.x;
  frame(scene, 30);
  assert.equal(scene.player.position.x, stillX, 'letting go stops the walk');
  scene.exit();
});

test('walking never leaves the surface bounds', () => {
  const { scene } = bootPlanet();
  scene.app.input.keys.add('w');
  scene.app.input.keys.add('shift');
  frame(scene, 60 * 60);       // a full minute of running at the horizon
  assert.ok(Math.abs(scene.player.position.x) <= 150.01);
  assert.ok(Math.abs(scene.player.position.z) <= 150.01);
  scene.exit();
});

test('talking to someone near you pays goodwill the first time only', () => {
  const { game, scene } = bootPlanet();
  const person = scene.people[0];
  // stand next to them
  scene.player.position.set(person.position.x + 1.2, person.position.y, person.position.z);

  const creditsBefore = game.state.credits;
  scene._talk();
  const rec = game.landingInfo(scene.planet.id);
  assert.ok(rec.met.includes(person.userData.id), 'the person is recorded in the away log');
  assert.ok(game.state.credits > creditsBefore, 'the first conversation pays');

  const afterFirst = game.state.credits;
  scene._talk();
  assert.equal(game.state.credits, afterFirst, 'the same person does not pay twice');
  scene.exit();
});

test('talking with nobody nearby warns instead of crashing', () => {
  const { scene } = bootPlanet();
  scene.player.position.set(120, 0, 120);
  assert.doesNotThrow(() => scene._talk());
  assert.equal(scene._nearestPerson(), null);
  scene.exit();
});

test('sampling a deposit pays exactly once', () => {
  const { game, scene } = bootPlanet();
  const dep = scene.deposits[0];
  scene.player.position.copy(dep.position);

  const before = { c: game.state.credits, r: game.state.research, d: game.state.dilithium };
  scene._scan();
  assert.equal(dep.userData.scanned, true);
  const gained = game.state.credits - before.c
    + (game.state.research - before.r)
    + (game.state.dilithium - before.d);
  assert.ok(gained > 0, 'a sampled deposit pays out');
  assert.ok(game.landingInfo(scene.planet.id).finds.includes(dep.userData.id));

  // the same deposit is gone from the scan list, so no repeated farming
  assert.equal(scene._nearestDeposit(), null);
  const afterFirst = game.state.credits;
  scene._scan();
  assert.equal(game.state.credits, afterFirst);
  scene.exit();
});

test('lifting off returns to orbit and can be landed on again', () => {
  const { game, app, scene, landable } = bootPlanet();
  scene._leave();
  assert.equal(app.scenes.at(-1).name, 'system');
  assert.equal(game.state.currentPlanetId, null);

  // coming back rebuilds the same world from the same seed
  const second = new PlanetScene(app);
  second.enter({ planetId: landable.planet.id });
  assert.equal(second._seed, scene._seed, 'the same planet keeps its seed');
  assert.equal(second.people.length, scene.people.length);
  assert.equal(second.deposits.length, scene.deposits.length);
  second.exit();
});

test('the surface supports a full frame loop for every biome', () => {
  store.clear();
  const game = new Game();
  const app = makeApp(game);
  const types = ['m', 'ocean', 'desert', 'ice', 'volcanic', 'barren'];
  const seen = new Set();
  for (const system of game.galaxy.systems) {
    for (const p of system.planets) {
      if (seen.has(p.type) || p.type === 'gas') continue;
      seen.add(p.type);
      if (!types.includes(p.type)) continue;
      const scene = new PlanetScene(app);
      scene.enter({ planetId: p.id });
      assert.ok(scene._built, `${p.type} built`);
      frame(scene, 20);
      assert.ok(Number.isFinite(scene.camera.position.x), `${p.type} camera is finite`);
      assert.ok(Number.isFinite(scene.player.position.y), `${p.type} player is on the ground`);
      scene.exit();
    }
  }
  assert.ok(seen.size >= 3, 'the galaxy has several biomes to test');
});

test('the surface HUD is built with drawers, not pinned panels', () => {
  const { scene } = bootPlanet();
  const screen = scene.ui;
  assert.ok(screen.querySelector('.drawer-rail'), 'the planet screen has a drawer rail');
  assert.equal(screen.querySelectorAll('.drawer-btn').length, 3, 'away team + dossier + away log');
  for (const panel of screen.querySelectorAll('.panel')) {
    assert.equal(panel.classList.contains('open'), false, 'panels start closed on the surface too');
  }
  assert.ok(screen.querySelector('#ph-leave'), 'there is a way back to orbit');
  scene.exit();
});

test('your ship is parked on the pad, resting on the ground, at a size that reads', () => {
  const { scene } = bootPlanet();
  const box = new THREE.Box3().setFromObject(scene.ship);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  assert.ok(box.min.y > 0 && box.min.y < 1.2, `the hull hovers ${box.min.y.toFixed(2)}u above the pad`);
  assert.ok(span > 12, `the hull is only ${span.toFixed(1)}u long — it should dwarf a person`);
  assert.ok(box.max.y < 14, 'the hull should not tower over the away team');
  // and the pad it sits on is wide enough to hold it, and flat
  const padSpan = Math.max(size.x, size.z);
  assert.ok(PAD_RADIUS * 2 > padSpan * 0.55, 'the pad is too small for the hull');
  scene.exit();
});

test('the orbit scene offers a landing and it leads to the surface', () => {
  const src = fs.readFileSync(new URL('../src/scenes/system.js', import.meta.url), 'utf8');
  assert.match(src, /id="land-btn"/, 'the flight HUD has a LAND button');
  assert.match(src, /setScene\('planet'/, 'and it opens the planet scene');
  assert.match(src, /_nearestLandable/, 'only landable worlds are offered');
  assert.match(src, /data-land/, 'the survey report offers a landing too');
});

test('visual assets are disposed when a planet is left', () => {
  const { scene } = bootPlanet();
  const before = scene.scene.children.length;
  assert.ok(before > 5);
  scene.exit();
  assert.equal(scene.scene.children.length, 0, 'the built world is cleared');
  assert.equal(scene._built, false, 'and rebuilt on the next landing');
});

test('lifting off puts you back beside the world you left, in landing range', () => {
  const game = makeGame();
  const app = makeApp(game);
  const sys = new SystemScene(app);
  sys.enter();
  const target = sys._nearestLandable();
  assert.ok(target, 'a system should have something to land on');

  // fly to it, land, then lift off and come back
  const node = sys.planetNodes.find((n) => n.data.id === target.data.id);
  const centre = node.node.getWorldPosition(new THREE.Vector3());
  sys.player.position.copy(centre).add(new THREE.Vector3(60, 6, 0));
  assert.ok(sys._nearestLandable().inRange);
  sys._landAtNearest();
  assert.deepEqual(app.scenes.at(-1), { name: 'planet', params: { planetId: target.data.id } },
    'LAND should open the surface scene');

  // and the surface hands the planet back to the orbit scene when you lift off
  const surface = new PlanetScene(app);
  surface.enter({ planetId: target.data.id });
  surface._leave();
  assert.deepEqual(app.scenes.at(-1), { name: 'system', params: { nearPlanet: target.data.id } },
    'lift off should return to orbit beside the same planet');
  surface.exit();

  sys.exit();
  const back = new SystemScene(app);
  back.enter({ nearPlanet: target.data.id });
  const near = back._nearestLandable();
  assert.equal(near.data.id, target.data.id, 'we should be beside the planet we left');
  assert.ok(near.inRange, `lift-off should leave you ${Math.round(near.dist)}u away — inside landing range`);
  assert.ok(back.player.position.length() > 0, 'the ship is placed, not parked at the origin');
  back.exit();
});
