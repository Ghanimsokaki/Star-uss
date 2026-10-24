#!/usr/bin/env node
/**
 * Scan public/models/ for Meshy (or any) GLB/GLTF exports and write the
 * manifest the game reads at runtime.
 *
 *   npm run models:scan
 *
 * File naming: <classId>.glb where classId is a key from src/data/ships.js
 * (miranda, kelvin, nx, constitution, kelvinconn, intrepid, excelsior,
 *  franklin, akira, defiant, kelvinA, sovereign, galaxy, prometheus,
 *  vengeance, odyssey).
 *
 * Common aliases are accepted too (enterprise -> constitution, reliant ->
 * miranda, voyager -> intrepid, ...). An optional models.config.json can set
 * per-model orientation:
 *
 *   { "constitution": { "facing": "back", "yawDeg": 90, "scale": 1.1, "yOffset": 0 } }
 *
 * Runs automatically before `npm run dev` / `npm run build`, and vite.config.js
 * re-runs it whenever a model file changes while the dev server is up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIP_CLASSES } from '../src/data/ships.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Meshy often names exports after the ship ("Enterprise", "USS_Voyager_NCC-74656").
// Keys are normalised: lower-case, a-z0-9 only.
const ALIASES = {
  enterprise: 'constitution',
  ussenterprise: 'constitution',
  ncc1701: 'constitution',
  reliant: 'miranda',
  ussreliant: 'miranda',
  voyager: 'intrepid',
  ussvoyager: 'intrepid',
  ncc74656: 'intrepid',
  enterprised: 'galaxy',
  ncc1701d: 'galaxy',
  enterprisee: 'sovereign',
  ncc1701e: 'sovereign',
  enterprisef: 'odyssey',
  ncc1701f: 'odyssey',
  ncc1701a: 'kelvinA',
  thunderchild: 'akira',
  ussthunderchild: 'akira',
  ussdefiant: 'defiant',
  ncc1764: 'defiant',
  ussprometheus: 'prometheus',
  ussfranklin: 'franklin',
  ncc2372: 'franklin',
  ussvengeance: 'vengeance',
  ussexcelsior: 'excelsior',
  ncc2000: 'excelsior',
  usskelvin: 'kelvin',
  ncc0514: 'kelvin',
  keldon: 'galaxy',
  kelvintype: 'kelvin',
  usskelvinncc0514: 'kelvin',
  kelvinconstitution: 'kelvinconn',
  kelvinenterprise: 'kelvinconn',
  ncc1701kelvin: 'kelvinconn',
};

// exporters sprinkle separators around ("NCC_1701-A.glb", "ncc 1701 a.glb")
const canon = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function scanModels({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const dir = path.join(root, 'public', 'models');
  const manifestPath = path.join(dir, 'manifest.json');
  const configPath = path.join(root, 'models.config.json');

  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (e) { console.warn(`! models.config.json is not valid JSON: ${e.message}`); }
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log('created public/models/');
  }

  const files = fs.readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f)).sort();
  const models = {};
  const skipped = [];

  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const key = canon(base);
    let classId = SHIP_CLASSES[base] ? base : null;
    if (!classId) classId = Object.keys(SHIP_CLASSES).find((id) => canon(id) === key) || null;
    if (!classId) classId = ALIASES[key] || null;
    if (!classId) { skipped.push(file); continue; }
    if (models[classId]) {
      console.warn(`! ${file} and ${models[classId].file} both map to ${classId} — keeping ${models[classId].file}`);
      skipped.push(file);
      continue;
    }

    const stat = fs.statSync(path.join(dir, file));
    const sizeMb = stat.size / (1024 * 1024);
    if (sizeMb > 40) {
      console.warn(`! ${file} is ${sizeMb.toFixed(1)} MB — consider a lighter export (Meshy: low-poly + 2k textures)`);
    }

    const extra = config[classId] || config[base] || {};
    models[classId] = { file, bytes: stat.size, ...extra };
    log(`✓ ${file} -> ${classId} (${sizeMb.toFixed(2)} MB)`);
  }

  if (skipped.length) {
    log(`\nskipped ${skipped.length} file(s) with no matching ship class:`);
    skipped.forEach((f) => log(`  · ${f}`));
    log(`  valid ids: ${Object.keys(SHIP_CLASSES).join(', ')}`);
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), models }, null, 2)}\n`);
  log(`\nwrote ${path.relative(root, manifestPath)} with ${Object.keys(models).length} model(s)`);
  if (!files.length) log('tip: drop <classId>.glb into public/models/ and run this again');
  return { models, skipped, manifestPath, dir };
}

if (import.meta.url === `file://${process.argv[1]}`) scanModels();
