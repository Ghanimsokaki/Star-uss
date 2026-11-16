import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const db = await import('../src/core/savedb.js');

const memStorage = () => { const m = new Map(); return { get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)), del: (k) => m.delete(k) }; };
const fresh = async () => { db._resetForTests(); await new Promise((r) => { const q = indexedDB.deleteDatabase('star-uss'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); db._resetForTests(); };
const save = (credits, lastSave) => ({ version: 5, credits, lastSave, xp: 10, ships: { miranda: { name: 'Reliant' } }, shipId: 'miranda', civ: { districts: [{}] }, stats: { kills: 3 } });

test('writes and reads the current save', async () => {
  await fresh();
  assert.equal(await db.readSave(), null);
  assert.equal(await db.writeSave(save(100, 1)), true);
  assert.equal((await db.readSave()).credits, 100);
  await db.clearSave();
  assert.equal(await db.readSave(), null);
});

test('backups: one per interval, newest first, capped', async () => {
  await fresh();
  const t0 = 1_000_000;
  for (let i = 0; i < db.MAX_BACKUPS + 4; i++) await db.writeSave(save(i, t0 + i), { now: t0 + i * db.BACKUP_EVERY_MS });
  // saves inside the interval don't add backups
  await db.writeSave(save(999, 0), { now: t0 + (db.MAX_BACKUPS + 3) * db.BACKUP_EVERY_MS + 1000 });
  const list = await db.listBackups();
  assert.equal(list.length, db.MAX_BACKUPS);
  assert.ok(list[0].at > list[1].at, 'newest first');
  assert.equal(list[0].summary.credits, db.MAX_BACKUPS + 3);
  assert.equal(list[0].summary.shipName, 'Reliant');
  assert.equal((await db.readBackup(list[0].id)).credits, db.MAX_BACKUPS + 3);
  assert.equal((await db.readSave()).credits, 999, 'current save still updated');
});

test('reconcile: the newer save wins, and old localStorage saves move into IndexedDB', async () => {
  await fresh();
  const ls = memStorage();
  assert.equal(await db.reconcile(ls, 'k'), 'none');

  ls.set('k', save(5, 100));                       // a save from before this update
  assert.equal(await db.reconcile(ls, 'k'), 'local');
  assert.equal((await db.readSave()).credits, 5, 'moved into IndexedDB');
  assert.equal((await db.listBackups()).length, 1, 'and backed up');

  await db.writeSave(save(50, 200));              // IndexedDB newer
  assert.equal(await db.reconcile(ls, 'k'), 'idb');
  assert.equal(ls.get('k').credits, 50);

  ls.del('k');                                     // localStorage wiped
  assert.equal(await db.reconcile(ls, 'k'), 'idb');
  assert.equal(ls.get('k').credits, 50);
});

test('does nothing (and never throws) without IndexedDB', async () => {
  const keep = globalThis.indexedDB;
  delete globalThis.indexedDB;
  db._resetForTests();
  try {
    assert.equal(db.indexedDbAvailable(), false);
    assert.equal(await db.writeSave(save(1, 1)), false);
    assert.equal(await db.readSave(), null);
    assert.deepEqual(await db.listBackups(), []);
    const ls = memStorage(); ls.set('k', save(7, 1));
    assert.equal(await db.reconcile(ls, 'k'), 'local');
  } finally {
    globalThis.indexedDB = keep;
    db._resetForTests();
  }
});
