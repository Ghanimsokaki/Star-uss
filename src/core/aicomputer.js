/**
 * The ship's computer — optional AI via Puter.js (https://docs.puter.com).
 *
 * Off by default. When the player switches it on (Settings), Puter.js is
 * loaded from js.puter.com and every request runs on the player's own free
 * Puter account ("user pays"), so the game needs no API key and no server.
 * Puter shows its own sign-in the first time.
 *
 * Used for:
 *   · people on planets answering what you ask them, in character
 *   · "Ask the ship's computer" (F2), which knows where you are and what is broken
 *
 * Safety: the game is played by kids. Every request carries a fixed system
 * prompt that keeps answers short, kind and in-world, refuses anything
 * unsuitable, and never asks for personal information. Player text is
 * length-limited. If anything fails, callers fall back to built-in lines.
 */

const PUTER_SRC = 'https://js.puter.com/v2/';
const MAX_INPUT = 240;
const TIMEOUT_MS = 25000;

export const SAFETY = [
  'You are part of a family-friendly Star Trek-inspired space game. The player may be a child.',
  'Stay in character and inside the game world. Keep every reply under 70 words, warm and encouraging.',
  'Never use bad language, never describe gore or anything scary or adult, and never discuss real-world violence, politics, dating or other mature topics.',
  'Never ask for or repeat personal information (names, ages, addresses, schools, photos, contact details). If the player shares any, gently say they should keep that private.',
  'If asked for something unsuitable or outside the game, kindly steer back to the adventure.',
  'Do not claim to be a real person. You are a character in a game.',
].join(' ');

let loading = null;

export function aiEnabled(game) { return game?.state?.settings?.aiComputer === true; }

/** Load Puter.js once (only when the player has switched the feature on). */
export function loadPuter() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.puter?.ai) return Promise.resolve(window.puter);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = PUTER_SRC;
    s.async = true;
    s.onload = () => resolve(window.puter || null);
    s.onerror = () => { loading = null; resolve(null); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Trim and neutralise what the player typed before it goes anywhere. */
export function cleanInput(text) {
  return String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT);
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

function textOf(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  const c = res.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => x.text || '').join('');
  if (typeof res.text === 'string') return res.text;
  const str = typeof res.toString === 'function' ? res.toString() : '';
  return str && !str.startsWith('[object') ? str : '';
}

/**
 * One chat turn. history: [{role:'user'|'assistant', content}].
 * Resolves to { ok, text } — never throws.
 */
export async function chat(roleBrief, history) {
  const puter = await loadPuter();
  if (!puter?.ai?.chat) return { ok: false, text: '' };
  const messages = [
    { role: 'system', content: `${SAFETY} ${roleBrief}` },
    ...history.slice(-8).map((m) => ({ role: m.role, content: cleanInput(m.content) })),
  ];
  try {
    const res = await withTimeout(puter.ai.chat(messages), TIMEOUT_MS);
    const text = textOf(res).trim().slice(0, 700);
    return text ? { ok: true, text } : { ok: false, text: '' };
  } catch (e) {
    console.warn('[ai]', e?.message || e);
    return { ok: false, text: '' };
  }
}

/** Speak a line with Puter's text-to-speech (optional, best effort). */
export async function speak(text) {
  try {
    const puter = await loadPuter();
    const audio = await puter?.ai?.txt2speech?.(String(text).slice(0, 300));
    audio?.play?.();
  } catch { /* voice is a bonus */ }
}

/** What the computer knows about the captain's situation right now. */
export function situation(game, app) {
  const s = game.state;
  const sys = game.system;
  const m = game.currentMission;
  const dmg = game.damage || {};
  const broken = Object.entries(dmg).filter(([, v]) => v < 0.999).map(([k, v]) => `${k} ${Math.round(v * 100)}%`);
  return [
    `Ship: ${game.shipRecord?.name} (${game.shipClass?.name}). Captain rank: ${game.rankTitle}.`,
    `Location: ${sys?.name} system, screen: ${app?.currentName}.`,
    m ? `Current orders: ${m.title} — ${m.desc} Hint: ${m.hint}` : 'All story missions complete.',
    broken.length ? `Damaged systems: ${broken.join(', ')}. Repairs: press I to go below decks and hold E at the sparking station, or dock at the Shipyard.` : 'All ship systems green.',
    `Resources: ${Math.round(s.credits)} credits, ${Math.round(s.dilithium)} dilithium, ${Math.round(s.research)} research.`,
    'Controls: W/S thrust, A/D turn, Space/Shift up/down, K or click fire, F torpedo, P autopilot, T warp, L land, R scan, ? for all controls.',
  ].join(' ');
}
