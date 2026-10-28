#!/usr/bin/env node
/**
 * Convert FBX hulls to the GLB the game loads.
 *
 *   npm run models:convert -- ~/models/miranda.fbx
 *   npm run models:convert -- ~/models/           (every .fbx in a folder)
 *   npm run models:convert -- ~/models/ --raw     (skip optimisation)
 *
 * Output lands in public/models/<classId>.glb and the manifest is rescanned, so
 * the next `npm run dev` — or the running dev server, which watches the folder —
 * picks the hull up.
 *
 * The converter is Facebook's BSD-licensed FBX2glTF. It is NOT a dependency of
 * this repo: nothing converts at runtime and the deployed site should never
 * download a native binary. Install the authoring tools once, together:
 *
 *   npm install --no-save fbx2gltf @gltf-transform/cli
 *
 * (--no-save keeps them out of package.json. Any later `npm install` prunes
 * them, so install again if this script says they are missing.)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanModels, root } from './scan-models.mjs';
import { classIdFromName, slug, CLASS_IDS } from './ship-ids.mjs';

const MODELS = path.join(root, 'public', 'models');
const TMP = path.join(root, '.cache', 'fbx');
const INSTALL = 'npm install --no-save fbx2gltf @gltf-transform/cli';

const [, , ...argv] = process.argv;
const raw = argv.includes('--raw');
const inputs = argv.filter((a) => !a.startsWith('--'));

// Matching rules live in scripts/ship-ids.mjs so they can be unit tested.
const resolveId = (file) => classIdFromName(path.basename(file));

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function expand(args) {
  const files = [];
  for (const arg of args) {
    const p = path.resolve(arg);
    if (!fs.existsSync(p)) fail(`no such file or folder: ${arg}`);
    if (fs.statSync(p).isDirectory()) {
      const found = fs.readdirSync(p).filter((f) => /\.fbx$/i.test(f)).map((f) => path.join(p, f));
      if (!found.length) fail(`${arg} contains no .fbx files`);
      files.push(...found);
    } else {
      if (!/\.fbx$/i.test(p)) fail(`${arg} is not an .fbx file`);
      files.push(p);
    }
  }
  return files;
}

/** Find the FBX2glTF binary: env override, this repo, then any npx cache. */
function findConverter() {
  const exe = os.type() === 'Windows_NT' ? 'FBX2glTF.exe' : 'FBX2glTF';
  const candidates = [
    process.env.FBX2GLTF,
    path.join(root, 'node_modules', 'fbx2gltf', 'bin', os.type(), exe),
    ...npxCaches(exe),
  ].filter(Boolean);
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

function npxCaches(exe) {
  const out = [];
  try {
    const dir = path.join(os.homedir(), '.npm', '_npx');
    for (const entry of fs.readdirSync(dir)) {
      out.push(path.join(dir, entry, 'node_modules', 'fbx2gltf', 'bin', os.type(), exe));
    }
  } catch { /* no npx cache */ }
  return out;
}

function findOptimiser() {
  const cli = path.join(root, 'node_modules', '.bin', 'gltf-transform');
  return fs.existsSync(cli) ? cli : null;
}

/**
 * Run the converter. `-o` takes a path *without* a suffix; the tool appends
 * `.glb` itself.
 */
function convertOne(bin, file) {
  const base = path.basename(file, path.extname(file));
  const classId = resolveId(file);
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(MODELS, { recursive: true });

  const stem = path.join(TMP, base);
  const staging = `${stem}.glb`;
  fs.rmSync(staging, { force: true });
  console.log(`\n· ${path.basename(file)}  ->  ${classId}.glb`);

  const res = spawnSync(bin, ['--binary', '--pbr-metallic-roughness', '-i', file, '-o', stem], {
    encoding: 'utf8',
  });
  const log = `${res.stdout || ''}${res.stderr || ''}`;
  if (res.status !== 0 || !fs.existsSync(staging)) {
    fail(`${base}: conversion failed\n${log.trim() || `(no output, exit ${res.status})`}`);
  }

  // FBX textures usually live in a sibling "<name>.fbm" folder. Losing that
  // folder silently produces a grey hull, so say it out loud.
  const missing = (log.match(/could not find a image file/g) || []).length;
  if (missing) {
    console.warn(`  ! ${missing} texture(s) referenced by the FBX were not found.`);
    console.warn(`    Keep the "${base}.fbm" folder (or textures/ next to the .fbx) and re-run;`);
    console.warn('    without it the hull loads but renders as flat grey.');
  }

  const finalPath = path.join(MODELS, `${classId}.glb`);
  const cli = raw ? null : findOptimiser();
  if (!cli) {
    fs.copyFileSync(staging, finalPath);
    const mb = (fs.statSync(finalPath).size / 1048576).toFixed(2);
    console.log(`  copied unoptimised · ${mb} MB${raw ? ' (--raw)' : ''}`);
    if (!raw) console.log(`  tip: ${INSTALL}  → then re-run for a ~70% smaller file`);
    return finalPath;
  }

  const opt = spawnSync(cli, [
    'optimize', staging, finalPath,
    '--compress', 'quantize',
    '--simplify-error', '0.0015',
    '--texture-size', '1024',
    '--texture-compress', 'webp',
  ], { encoding: 'utf8' });

  if (opt.status !== 0 || !fs.existsSync(finalPath)) {
    console.warn('  ! optimiser failed — keeping the unoptimised conversion');
    const tail = `${opt.stderr || ''}`.trim().split('\n').slice(-3).join('\n');
    if (tail) console.warn(`    ${tail.replace(/\n/g, '\n    ')}`);
    fs.copyFileSync(staging, finalPath);
    return finalPath;
  }
  const before = (fs.statSync(staging).size / 1048576).toFixed(2);
  const after = (fs.statSync(finalPath).size / 1048576).toFixed(2);
  console.log(`  optimised · ${before} MB -> ${after} MB`);
  return finalPath;
}

/* ------------------------------------------------------------------- run */
if (!inputs.length) {
  console.log(`
usage: npm run models:convert -- <file.fbx | folder> [--raw]

  <file.fbx>   one hull; the filename must be the class id (miranda.fbx)
  <folder>     every .fbx inside it
  --raw        skip simplification and texture downscaling

converter:  ${findConverter() || `not found — ${INSTALL}`}
optimiser:  ${findOptimiser() || `not found — ${INSTALL}`}
`);
  process.exit(0);
}

const files = expand(inputs);

const unknown = files.filter((f) => !resolveId(f));
if (unknown.length) {
  console.log('\n! these filenames are not ship class ids, so the game cannot map them:');
  for (const f of unknown) console.log(`    ${path.basename(f)}  (read as "${slug(path.basename(f, path.extname(f)))}")`);
  console.log(`  valid ids:\n    ${CLASS_IDS.join(', ')}`);
  console.log('\n  Rename to <classId>.fbx and run again. See docs/SHIP-MODEL-LIST.md.\n');
  process.exit(1);
}

const bin = findConverter();
if (!bin) fail(`FBX2glTF not found. Install it once:\n    ${INSTALL}`);

for (const file of files) convertOne(bin, file);

const { models } = scanModels({ quiet: false });
console.log(`\n${Object.keys(models).length} model(s) in the manifest.`);
if (files.length) console.log('Reload the page (or the running dev server) to fly the new hull.');
