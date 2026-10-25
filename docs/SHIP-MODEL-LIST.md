# Ship model list — every hull in the game

All **22** flyable hulls, in fleet-ladder order (tier 1 → 22). The **classId is
the filename**: save a model as `<classId>.fbx` (or `.glb`) and drop it in
`public/models/`. Nothing else needs editing.

> Fan project. The underlying starship designs belong to CBS Studios /
> Paramount. Model them as fan recreations, not as licensed assets.

---

## The roster

| # | classId | Class | Hull · registry | L × W × H | Real model in the repo? |
| --- | --- | --- | --- | --- | --- |
| 1 | `miranda` | **Miranda-Class** | U.S.S. Reliant · NCC-1864 | 237 × 141 × 58 m | — needs a model |
| 2 | `kelvin` | **Kelvin-Type** | U.S.S. Kelvin · NCC-0514 | 315 × 148 × 62 m | — needs a model |
| 3 | `saber` | **Saber-Class** | U.S.S. Yeager · NCC-61947 | 190 × 193 × 49 m | ✅ `saber.glb` 2.5 MB *(AI stand-in)* |
| 4 | `nx` | **NX-Class** | U.S.S. Enterprise · NX-01 | 225 × 135 × 55 m | — needs a model |
| 5 | `steamrunner` | **Steamrunner-Class** | U.S.S. Appalachia · NCC-52136 | 244 × 160 × 40 m | — needs a model |
| 6 | `constitution` | **Constitution-Class** | U.S.S. Enterprise · NCC-1701 | 289 × 127 × 72 m | — needs a model |
| 7 | `kelvinconn` | **Constitution-Class (Kelvin)** | U.S.S. Enterprise · NCC-1701 | 725 × 310 × 120 m | — needs a model |
| 8 | `intrepid` | **Intrepid-Class** | U.S.S. Voyager · NCC-74656 | 344 × 132 × 64 m | — needs a model |
| 9 | `excelsior` | **Excelsior-Class** | U.S.S. Excelsior · NX-2000 | 467 × 186 × 78 m | — needs a model |
| 10 | `nebula` | **Nebula-Class** | U.S.S. Sutherland · NCC-72015 | 442 × 318 × 130 m | — needs a model |
| 11 | `franklin` | **Freedom-Class** | U.S.S. Franklin · NX-326 | 156 × 96 × 48 m | — needs a model |
| 12 | `akira` | **Akira-Class** | U.S.S. Thunderchild · NCC-63549 | 464 × 316 × 87 m | — needs a model |
| 13 | `defiant` | **Defiant-Class** | U.S.S. Defiant · NX-74205 | 170 × 134 × 30 m | — needs a model |
| 14 | `ambassador` | **Ambassador-Class** | U.S.S. Enterprise · NCC-1701-C | 526 × 320 × 128 m | — needs a model |
| 15 | `kelvinA` | **Constitution-Class Refit (Kelvin)** | U.S.S. Enterprise-A · NCC-1701-A | 725 × 318 × 118 m | — needs a model |
| 16 | `sovereign` | **Sovereign-Class** | U.S.S. Enterprise-E · NCC-1701-E | 685 × 224 × 88 m | — needs a model |
| 17 | `galaxy` | **Galaxy-Class** | U.S.S. Enterprise-D · NCC-1701-D | 642 × 463 × 195 m | ✅ `galaxy.glb` 5.3 MB |
| 18 | `crossfield` | **Crossfield-Class** | U.S.S. Discovery · NCC-1031 | 750 × 625 × 70 m | — needs a model |
| 19 | `prometheus` | **Prometheus-Class** | U.S.S. Prometheus · NX-59650 | 415 × 180 × 80 m | — needs a model |
| 20 | `vengeance` | **Dreadnought-Class** | U.S.S. Vengeance · NX-9500 | 1,450 × 480 × 190 m | — needs a model |
| 21 | `constitution3` | **Constitution III-Class** | U.S.S. Enterprise · NCC-1701-G | 560 × 254 × 89 m | — needs a model |
| 22 | `odyssey` | **Odyssey-Class** | U.S.S. Enterprise-F · NCC-1701-F | 1,061 × 371 × 148 m | ✅ `odyssey.glb` 11.0 MB |

**Missing: 19 hulls.** The three that exist are the ones worth replacing last —
two are genuine fan meshes, and `saber` is a generic AI stand-in that a real
Saber would improve.

**Filenames are forgiving.** Matching ignores case and separators, so
`kelvinA.fbx`, `kelvina.fbx`, `KELVIN_A.fbx` and `kelvin a.fbx` are all the
same hull; `Constitution-III.fbx` and `constitution3.fbx` are both the
Constitution III. The file written to disk always uses the exact class id from
the table (e.g. `kelvinA.glb`), so the manifest maps it without guessing.
Anything that is not a hull — `uss-enterprise.fbx`, `my-ship.fbx` — is rejected
with the list of valid ids rather than silently ignored.

---

## What makes a model drop straight in

| | Requirement | Why |
| --- | --- | --- |
| Format | **`.fbx`** or `.glb` | `npm run models:convert` turns FBX into GLB |
| Filename | `<classId>.fbx`, e.g. `intrepid.fbx` | the filename *is* the mapping |
| Scale | metres, anything from 100 m to 1.5 km | the game rescales to 6 units either way |
| Forward | **nose toward +Z**, up toward +Y | matches every procedural hull |
| Units/orientation | whatever your DCC exports | the loader auto-detects the long axis, and `models.config.json` fixes the rest |
| Textures | keep the `<name>.fbm` folder next to the `.fbx` | lose it and the hull loads flat grey (the converter warns you) |
| Poly budget | ≤ ~150k triangles after decimation | the converter simplifies ~4x automatically |
| File size | under ~15 MB after conversion | streamed on demand, but big files hurt first load |

**Don't worry about orientation.** If a hull comes out nose-first toward the
camera, add one line to `models.config.json`:

```json
{ "intrepid": { "facing": "back" } }
```

…or `"yawDeg": 90`, `"scale": 1.1`, `"yOffset": 0.04`. All four are hot-tunable
without touching code. `docs/MODELS.md` §6 has the full table.

### Blender FBX export settings that work

- **Forward: −Z, Up: Y** (Blender's default) — the converter handles the axis change.
- Apply modifiers and **apply transforms** (`Object → Apply → All Transforms`); an
  un-applied 0.01 scale is the single most common cause of a ship that arrives
  the wrong size.
- One mesh object per ship (or a handful) beats a hundred separate objects with
  duplicated materials.
- Textures: Principled BSDF, base colour + normal + metallic/roughness packed, and
  keep them under 2K. The converter downsamples to 1024 and re-encodes to WebP.
- No animation, no armature, no cameras or lights — the game flies the hull itself.

---

## Workflow

```bash
# once — the authoring tools, not repo dependencies
npm install --no-save fbx2gltf @gltf-transform/cli

# convert one hull, or a whole folder, into public/models/
npm run models:convert -- ~/models/intrepid.fbx
npm run models:convert -- ~/models/

# inspect what came out
npm run models:check -- public/models/intrepid.glb

# fly it
npm run dev
```

The converter prints the resulting triangle count and file size, warns if the
`.fbm` texture folder is missing, refuses filenames that are not class ids, and
regenerates the manifest at the end. A running dev server reloads the page by
itself when a `.glb` lands in `public/models/`.

### Suggested order

Start with the hulls whose silhouettes are hardest to fake procedurally, since
that is where a real mesh pays off most: **`constitution`** (the classic saucer +
two nacelles everyone recognises), **`defiant`** (compact, heavily greebled),
**`sovereign`** and **`intrepid`** (sleek, curved, hard to approximate),
**`akira`** and **`crossfield`** (unusual massing), then the rest.

---

## Where the rest of the details live

- `docs/MODELS.md` — the full import pipeline, orientation tuning, troubleshooting.
- `docs/CREDITS.md` — provenance and licences of the three shipped meshes.
- `models.config.json` — per-ship orientation overrides.
- `scripts/fbx-to-glb.mjs` — the converter this document drives.
