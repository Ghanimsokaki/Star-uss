/**
 * Accounts and cloud saves, backed by Supabase.
 *
 * Optional by design: with no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the
 * game runs exactly as before on its local save, and none of this code (or the
 * Supabase SDK) is even downloaded — the client is imported lazily.
 *
 * Security model: the anon key is public, so every table is protected by
 * row-level security (see supabase/schema.sql). A player can only read and
 * write their own save and their own leaderboard row; the leaderboard is
 * readable by everyone.
 */

const URL_ = import.meta.env?.VITE_SUPABASE_URL || '';
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';
export const MAX_SAVE_BYTES = 256 * 1024;

let clientPromise = null;
let currentUser = null;
const listeners = new Set();

export const cloudConfigured = () => !!(URL_ && KEY);

async function client() {
  if (!cloudConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const c = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      c.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
      c.auth.onAuthStateChange((_evt, session) => setUser(session?.user || null));
      return c;
    }).catch((e) => { console.warn('[cloud] SDK failed to load', e); clientPromise = null; return null; });
  }
  return clientPromise;
}

function setUser(u) {
  currentUser = u;
  listeners.forEach((fn) => { try { fn(u); } catch (e) { console.error(e); } });
}

export const user = () => currentUser;
export function onUserChange(fn) { listeners.add(fn); fn(currentUser); return () => listeners.delete(fn); }

/** Kick off the session restore early (no-op without config). */
export function initCloud() { return client(); }

const ok = (data) => ({ ok: true, ...data });
const fail = (why) => {
  let msg = typeof why === 'string' ? why : why?.message || 'Request failed';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) msg = 'Can\u2019t reach the account server — check your connection and try again.';
  if (/invalid login credentials/i.test(msg)) msg = 'That email and password don\u2019t match an account.';
  return { ok: false, why: msg };
};

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }

export async function signUp(email, password, captain) {
  const c = await client();
  if (!c) return fail('Accounts are not configured for this build');
  if (!validEmail(email)) return fail('Enter a valid email address');
  if (String(password || '').length < 8) return fail('Password needs at least 8 characters');
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { captain: cleanName(captain) } } });
  if (error) return fail(error);
  return ok({ user: data.user, needsConfirm: !data.session });
}

export async function signIn(email, password) {
  const c = await client();
  if (!c) return fail('Accounts are not configured for this build');
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  return error ? fail(error) : ok({ user: data.user });
}

/** Passwordless: email a one-time sign-in link. */
export async function magicLink(email) {
  const c = await client();
  if (!c) return fail('Accounts are not configured for this build');
  if (!validEmail(email)) return fail('Enter a valid email address');
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  return error ? fail(error) : ok({});
}

export async function signOut() {
  const c = await client();
  if (c) await c.auth.signOut();
  setUser(null);
  return ok({});
}

export function cleanName(s) {
  return String(s || '').replace(/[^\p{L}\p{N} .'\-]/gu, '').trim().slice(0, 24) || 'Captain';
}

/* ------------------------------------------------------------------ saves */
export async function pushSave(state) {
  const c = await client();
  if (!c || !currentUser) return fail('Not signed in');
  const json = JSON.stringify(state);
  if (json.length > MAX_SAVE_BYTES) return fail('Save is too large to sync');
  const { error } = await c.from('saves').upsert({
    user_id: currentUser.id, data: state, version: state.version || 1, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  return error ? fail(error) : ok({ at: Date.now() });
}

export async function pullSave() {
  const c = await client();
  if (!c || !currentUser) return fail('Not signed in');
  const { data, error } = await c.from('saves').select('data, updated_at').eq('user_id', currentUser.id).maybeSingle();
  if (error) return fail(error);
  return ok({ save: data?.data || null, updatedAt: data?.updated_at || null });
}

/* ------------------------------------------------------------ leaderboard */
/** Publish this captain's headline numbers (own row only — enforced by RLS). */
export async function pushScore(game, captain) {
  const c = await client();
  if (!c || !currentUser) return fail('Not signed in');
  const s = game.state;
  const row = {
    user_id: currentUser.id,
    captain: cleanName(captain || currentUser.user_metadata?.captain),
    xp: Math.max(0, Math.floor(s.xp || 0)),
    kills: Math.max(0, Math.floor(s.stats.kills || 0)),
    systems: Math.max(0, (s.visited || []).length),
    rank: game.rankTitle,
    updated_at: new Date().toISOString(),
  };
  const { error } = await c.from('leaderboard').upsert(row, { onConflict: 'user_id' });
  return error ? fail(error) : ok({});
}

export async function topScores(limit = 20) {
  const c = await client();
  if (!c) return fail('Accounts are not configured for this build');
  const { data, error } = await c.from('leaderboard').select('captain, xp, kills, systems, rank, user_id').order('xp', { ascending: false }).limit(limit);
  return error ? fail(error) : ok({ rows: data || [] });
}
