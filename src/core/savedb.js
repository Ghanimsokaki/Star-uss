/**
 * The save game, kept in IndexedDB.
 *
 * IndexedDB is the browser's real database: it holds far more than
 * localStorage, survives better, and lets us keep a history. Here it stores
 *
 *   · the current save ("current"), written a moment after every change
 *   · automatic backups: a snapshot every few minutes of play, newest 10 kept,
 *     so a mistake (or a reset) can be undone from Settings
 *
 * localStorage still gets a copy on every save: it is synchronous, so the game
 * can read it instantly at start-up and on the way out of the page. At boot,
 * whichever of the two is newer wins.
 *
 * Every function here is safe to call when IndexedDB is missing (old
 * browsers, some private modes, tests): it simply does nothing.
 */

const DB_NAME = 'star-uss';
const DB_VERSION = 1;
const CURRENT = 'current';
export const MAX_BACKUPS = 10;
export const BACKUP_EVERY_MS = 5 * 60 * 1000;

let dbPromise = null;
let lastBackupAt = 0;

const idb = () => (typeof indexedDB !== 'undefined' ? indexedDB : null);
export const indexedDbAvailable = () => !!idb();

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

/** Open (and on first run create) the database. Resolves to null if unavailable. */
export function openDb() {
  const factory = idb();
  if (!factory) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let r;
    try { r = factory.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
      if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => {
      const db = r.result;
      // another tab upgrading the database: step aside cleanly
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => { dbPromise = null; resolve(null); };
    r.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/** Plain-data copy of a state object (drops anything IndexedDB can't clone). */
const plain = (state) => JSON.parse(JSON.stringify(state));

/** A short description of a save, for the backups list. */
export function summarize(state) {
  const ships = Object.keys(state?.ships || {}).length;
  return {
    credits: Math.round(state?.credits || 0),
    xp: Math.round(state?.xp || 0),
    kills: state?.stats?.kills || 0,
    districts: state?.civ?.districts?.length || 0,
    ships,
    shipName: state?.ships?.[state?.shipId]?.name || '',
  };
}

/**
 * Store the current save. Every BACKUP_EVERY_MS of play it also files a
 * backup snapshot and trims the oldest beyond MAX_BACKUPS.
 * @returns {Promise<boolean>} true when written
 */
export async function writeSave(state, { forceBackup = false, now = Date.now() } = {}) {
  const db = await openDb();
  if (!db || !state) return false;
  try {
    const data = plain(state);
    const tx = db.transaction(['saves', 'backups'], 'readwrite');
    tx.objectStore('saves').put(data, CURRENT);
    if (forceBackup || now - lastBackupAt >= BACKUP_EVERY_MS) {
      lastBackupAt = now;
      tx.objectStore('backups').add({ at: now, summary: summarize(data), state: data });
    }
    await done(tx);
    await trimBackups(db);
    return true;
  } catch (e) {
    console.warn('[save] IndexedDB write failed', e);
    return false;
  }
}

async function trimBackups(db) {
  const tx = db.transaction('backups', 'readwrite');
  const store = tx.objectStore('backups');
  const keys = await req(store.getAllKeys());
  keys.sort((a, b) => a - b);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) store.delete(k);
  await done(tx);
}

/** The current save from IndexedDB, or null. */
export async function readSave() {
  const db = await openDb();
  if (!db) return null;
  try {
    return (await req(db.transaction('saves').objectStore('saves').get(CURRENT))) || null;
  } catch { return null; }
}

/** Remove the current save (backups stay, so a reset can be undone). */
export async function clearSave() {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').delete(CURRENT);
    await done(tx);
  } catch { /* nothing to clear */ }
}

/** Backups, newest first, without the (large) state bodies. */
export async function listBackups() {
  const db = await openDb();
  if (!db) return [];
  try {
    const all = await req(db.transaction('backups').objectStore('backups').getAll());
    return all.map(({ id, at, summary }) => ({ id, at, summary })).sort((a, b) => b.at - a.at);
  } catch { return []; }
}

export async function readBackup(id) {
  const db = await openDb();
  if (!db) return null;
  try { return (await req(db.transaction('backups').objectStore('backups').get(id)))?.state || null; } catch { return null; }
}

/**
 * At start-up: pick the newer of the IndexedDB save and the localStorage
 * copy. If IndexedDB is newer (or localStorage was wiped), copy it back so
 * the game loads it. If only localStorage has one (a save from before this
 * update), move it into IndexedDB.
 * @param {{get:Function,set:Function}} storage  the localStorage helper
 * @returns {Promise<'idb'|'local'|'none'>} which one is in use
 */
export async function reconcile(storage, key) {
  const local = storage.get(key);
  const saved = await readSave();
  const t = (s) => Number(s?.lastSave) || 0;
  if (saved && (!local || t(saved) > t(local))) {
    storage.set(key, saved);
    return 'idb';
  }
  if (local) {
    await writeSave(local, { forceBackup: !saved });
    return 'local';
  }
  return 'none';
}

/** Ask the browser not to clear our data when space runs low. */
export async function askPersistent() {
  try {
    if (navigator?.storage?.persisted && await navigator.storage.persisted()) return true;
    return (await navigator?.storage?.persist?.()) || false;
  } catch { return false; }
}

/** Testing hook: forget the open connection and backup timer. */
export function _resetForTests() {
  dbPromise = null;
  lastBackupAt = 0;
}
