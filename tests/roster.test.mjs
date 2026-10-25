/**
 * Roster + filename tests.
 *
 * The filename is the only thing linking a model file to a ship, so the naming
 * rules are worth pinning down: `kelvinA` is a class id whose slug is "kelvina",
 * and a naive lower-casing of the filename used to be enough to make the
 * converter refuse a perfectly valid hull.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classIdFromName, slug, CLASS_IDS } from '../scripts/ship-ids.mjs';
import { SHIP_CLASSES, SHIP_ORDER } from '../src/data/ships.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every hull has a class id, and the ladder covers them all', () => {
  assert.equal(SHIP_ORDER.length, 22);
  assert.equal(CLASS_IDS.length, 22);
  const missing = CLASS_IDS.filter((id) => !SHIP_ORDER.includes(id));
  assert.deepEqual(missing, [], `not in SHIP_ORDER: ${missing.join(', ')}`);
  for (const id of SHIP_ORDER) {
    assert.ok(SHIP_CLASSES[id], `${id} has no class record`);
    assert.ok(SHIP_CLASSES[id].name && SHIP_CLASSES[id].hullName, `${id} is missing a name`);
  }
});

test('filenames resolve to the exact class id, including mixed case', () => {
  const cases = [
    ['miranda.fbx', 'miranda'],
    ['kelvinA.fbx', 'kelvinA'],
    ['kelvina.fbx', 'kelvinA'],
    ['KELVIN_A.FBX', 'kelvinA'],
    ['kelvin a.glb', 'kelvinA'],
    ['kelvinconn.fbx', 'kelvinconn'],
    ['constitution3.fbx', 'constitution3'],
    ['Constitution-III.fbx', 'constitution3'],
    ['steamrunner.obj', null],           // unknown extension ⇒ not a hull name
    ['uss-enterprise.fbx', null],        // not a class id
    ['', null],
  ];
  for (const [file, want] of cases) {
    assert.equal(classIdFromName(file), want, `${file} should resolve to ${want}`);
  }
});

test('a class id slug is stable for every hull', () => {
  for (const id of CLASS_IDS) {
    assert.equal(classIdFromName(`${id}.fbx`), id, `${id}.fbx must map back to ${id}`);
  }
});

test('class ids stay distinct once slugged (no silent collisions)', () => {
  const seen = new Map();
  for (const id of CLASS_IDS) {
    const key = slug(id);
    assert.ok(!seen.has(key), `${id} and ${seen.get(key)} collide on "${key}"`);
    seen.set(key, id);
  }
});

test('the docs roster lists exactly the ships the game has', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'SHIP-MODEL-LIST.md'), 'utf8');
  const rows = doc.split('\n').filter((l) => /^\| \d+ \| `/.test(l));
  assert.equal(rows.length, 22, `the roster table has ${rows.length} rows, expected 22`);
  const listed = rows.map((r) => r.split('`')[1]);
  assert.deepEqual(listed, SHIP_ORDER, 'the roster order must match the fleet ladder');
  for (const id of SHIP_ORDER) {
    assert.ok(doc.includes(`\`${id}\``), `${id} is missing from the roster table`);
  }
});

test('the converter handles every id the docs advertise', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'SHIP-MODEL-LIST.md'), 'utf8');
  for (const id of SHIP_ORDER) {
    // the doc promises <classId>.fbx works
    assert.equal(classIdFromName(`${id}.fbx`), id, `docs promise ${id}.fbx but it does not resolve`);
    assert.ok(doc.includes('`' + id + '`'));
  }
});

test('the models the manifest advertises actually exist', () => {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'public', 'models', 'manifest.json'), 'utf8'));
  for (const [id, entry] of Object.entries(man.models)) {
    assert.ok(SHIP_CLASSES[id], `${id} is in the manifest but is not a ship class`);
    assert.ok(fs.existsSync(path.join(root, 'public', 'models', entry.file)), `${entry.file} is missing`);
  }
});
