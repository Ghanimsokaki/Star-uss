/**
 * Filename → ship class id.
 *
 * The filename is the mapping, but people type class ids by hand, so matching is
 * case- and separator-insensitive: `kelvinA.fbx`, `kelvina.fbx`, `KELVIN_A.fbx`
 * and `kelvin a.fbx` all resolve to the class id `kelvinA`. The id written to
 * disk always uses the exact casing from src/data/ships.js.
 */
import { SHIP_CLASSES } from '../src/data/ships.js';

/** Normalise any text to a comparison key: lower-case, a-z0-9 only. */
export const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every class id, keyed by its normalised form. */
export const ID_BY_SLUG = new Map(
  Object.keys(SHIP_CLASSES).map((id) => [slug(id), id]),
);

// "Constitution III" is what people call the ship, so accept the roman numeral
// as well as the digit that appears in the class id.
const ROMAN = { ii: '2', iii: '3', iv: '4' };

/**
 * Resolve a filename (with or without its extension) to a class id.
 * @returns {string|null} the exact class id, or null when it is not a hull
 */
export function classIdFromName(name) {
  const base = String(name).replace(/\.(fbx|glb|gltf)$/i, '');
  const key = slug(base);
  const direct = ID_BY_SLUG.get(key);
  if (direct) return direct;
  // try the same key with a trailing roman numeral read as a digit
  for (const [roman, digit] of Object.entries(ROMAN)) {
    if (key.endsWith(roman)) {
      const swapped = ID_BY_SLUG.get(`${key.slice(0, -roman.length)}${digit}`);
      if (swapped) return swapped;
    }
  }
  return null;
}

export const CLASS_IDS = Object.keys(SHIP_CLASSES);
