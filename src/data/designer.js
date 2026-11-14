/**
 * Ship designer — the player's own hull.
 *
 * A design is a handful of sliders and choices. Everything else (stats, cost,
 * the class record the rest of the game reads) is derived from it here, so a
 * design can be saved as plain JSON and rebuilt identically anywhere.
 *
 * Balance: every part trades something. A big saucer is tough but slow to
 * turn; long nacelles are fast but fragile; four nacelles are faster still
 * and cost more. The total lands around a tier-3 hull — strong, never the best.
 */
import { SHIP_CLASSES } from './ships.js';

export const CUSTOM_ID = 'custom';
export const DRAFT_ID = 'custom-draft';   // the designer's live preview, never owned

export const DESIGN_LIMITS = {
  saucer: [0.8, 1.9],        // primary hull radius
  hull: [0, 4.2],            // engineering hull length (0 = no secondary hull)
  nacelleLen: [1.4, 3.6],
  nacelleSpan: [0.8, 2.4],   // distance from the centreline
  nacelleHeight: [-0.6, 1.4],
  weapons: [1, 6],           // phaser strips
};
export const SAUCER_SHAPES = ['round', 'oval', 'arrow'];
export const NACELLE_COUNTS = [2, 4];

export const DEFAULT_DESIGN = {
  name: 'U.S.S. Endeavour',
  registry: 'NCC-71805',
  saucer: 1.4,
  shape: 'round',
  hull: 2.6,
  neck: true,
  nacelles: 2,
  nacelleLen: 2.6,
  nacelleSpan: 1.4,
  nacelleHeight: 0.7,
  weapons: 3,
  hullColor: '#c3ccd6',
  glow: '#59e0ff',
};

const clampTo = (v, [lo, hi], dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);
const hex = (v, dflt) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : dflt);

/** Make any stored or user-entered design safe to build. */
export function sanitizeDesign(d = {}) {
  const D = DEFAULT_DESIGN;
  return {
    name: String(d.name ?? D.name).replace(/[<>]/g, '').slice(0, 28) || D.name,
    registry: String(d.registry ?? D.registry).replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) || D.registry,
    saucer: clampTo(d.saucer, DESIGN_LIMITS.saucer, D.saucer),
    shape: SAUCER_SHAPES.includes(d.shape) ? d.shape : D.shape,
    hull: clampTo(d.hull, DESIGN_LIMITS.hull, D.hull),
    neck: d.neck !== false,
    nacelles: NACELLE_COUNTS.includes(+d.nacelles) ? +d.nacelles : D.nacelles,
    nacelleLen: clampTo(d.nacelleLen, DESIGN_LIMITS.nacelleLen, D.nacelleLen),
    nacelleSpan: clampTo(d.nacelleSpan, DESIGN_LIMITS.nacelleSpan, D.nacelleSpan),
    nacelleHeight: clampTo(d.nacelleHeight, DESIGN_LIMITS.nacelleHeight, D.nacelleHeight),
    weapons: Math.round(clampTo(d.weapons, DESIGN_LIMITS.weapons, D.weapons)),
    hullColor: hex(d.hullColor, D.hullColor),
    glow: hex(d.glow, D.glow),
  };
}

/** Base stats for a design (same shape as SHIP_CLASSES[x].base). */
export function statsForDesign(raw) {
  const d = sanitizeDesign(raw);
  const mass = d.saucer * 1.2 + d.hull * 0.45 + d.nacelles * 0.25;
  const engines = d.nacelleLen * (d.nacelles === 4 ? 1.45 : 1);
  return {
    hull: Math.round(1300 + d.saucer * 900 + d.hull * 260),
    shield: Math.round(900 + d.saucer * 520 + d.nacelles * 90),
    regen: Math.round(14 + d.saucer * 5),
    phaser: Math.round(36 + d.weapons * 7),
    fireRate: +(1.4 + d.weapons * 0.06).toFixed(2),
    torp: Math.round(160 + d.hull * 55),
    torpRate: +(0.3 + d.hull * 0.03).toFixed(2),
    speed: Math.round(40 + engines * 9 - mass * 2.5),
    turn: +Math.max(0.7, 1.75 - mass * 0.22 + (d.nacelleSpan < 1.2 ? 0.08 : 0)).toFixed(2),
    sensor: +(1 + (d.shape === 'oval' ? 0.15 : 0) + d.hull * 0.03).toFixed(2),
    cargo: Math.round(120 + d.hull * 40),
  };
}

/** Commissioning price: bigger, faster and better armed costs more. */
export function costForDesign(raw) {
  const d = sanitizeDesign(raw);
  const b = statsForDesign(d);
  return Math.round((b.hull * 4 + b.shield * 5 + b.phaser * 120 + b.speed * 160 + b.torp * 18) / 100) * 100;
}

/** Hull length in world units, for cameras and physics mass. */
export function lengthForDesign(raw) {
  const d = sanitizeDesign(raw);
  return Math.max(d.saucer * 2.2, d.saucer * 1.2 + d.hull + 0.6, d.nacelleLen + 1);
}

/**
 * Put the design into SHIP_CLASSES so every scene can build and fly it.
 * Not added to SHIP_ORDER: the canon roster stays as it is.
 */
export function registerCustomClass(raw, id = CUSTOM_ID) {
  if (!raw) { delete SHIP_CLASSES[id]; return null; }
  const d = sanitizeDesign(raw);
  const base = statsForDesign(d);
  SHIP_CLASSES[id] = {
    id,
    timeline: 'prime',
    name: 'Custom Design',
    hullName: d.name,
    registry: d.registry,
    tier: 3,
    role: 'Your design',
    icon: '✎',
    cost: costForDesign(d),
    rankReq: 1,
    researchReq: 0,
    lore: 'Drawn up by her own captain at Utopia Planitia. No two are alike.',
    specs: { length: `${Math.round(lengthForDesign(d) * 55)} m`, beam: `${Math.round((d.nacelleSpan * 2 + 0.6) * 55)} m`, height: '—', crew: String(Math.round(120 + d.saucer * 300)), mass: '—', maxWarp: (9 + d.nacelleLen * 0.2).toFixed(1), decks: String(Math.round(6 + d.saucer * 9)) },
    base,
    hardpoints: { phasers: d.weapons, torpedoes: d.hull > 1.5 ? 2 : 1, ability: null },
    ability: { id: 'none', name: 'Auxiliary Power', desc: 'Reroute reserve power to shields.', cd: 24 },
    accent: d.glow,
    design: d,
  };
  return SHIP_CLASSES[id];
}
