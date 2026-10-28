# Third-party models, textures and sources

The game ships three high-detail ship models: two taken from public GitHub
repositories and one AI-generated mesh uploaded to this repository. They are fan-made recreations of Star Trek designs: the
underlying starship designs are the property of CBS Studios / Paramount, and
these files are used here for a non-commercial fan project. If you fork this
for anything commercial, replace them.

Both source repositories are MIT-licensed for their *code and repository
contents*; the model files themselves are fan recreations and are not
separately licensed by CBS or by the original mesh authors.

---

## `public/models/odyssey.glb`

- **Ship:** Odyssey-class — U.S.S. Enterprise-F (NCC-1701-F)
- **Source:** <https://github.com/kenny245/odyssey-desktop-pet>, file
  `sto_25c_fc5f_t1_odyssey.glb` (MIT repository)
- **In game:** used unchanged for `odyssey`. 86,607 triangles, 11 textures,
  10.95 MB. Modelled nose toward **−Z**, hence `"facing": "back"` in
  `models.config.json`.
- The file name pattern (`sto_…`) and the material names
  (`generic.sto_snw_hull` …) indicate the mesh originates from *Star Trek
  Online* material — it is a fan capture, not a licensed asset.

## `public/models/galaxy.glb`

- **Ship:** Galaxy-class — U.S.S. Enterprise-D (NCC-1701-D)
- **Source:** <https://github.com/yungrazr/StarTrekSim>, path
  `StarTrekBattle/Assets/Models/Enterprise NCC 1701 D/enterprise1701d.obj`
  (MIT repository, Blender-exported OBJ + 44 materials)
- **In game:** converted from the original 48 MB OBJ and 603,315-triangle
  mesh down to 141,178 triangles, materials joined into 24 meshes, textures
  capped at 2048 px and encoded as WebP — 5.33 MB. Modelled nose toward **+Z**,
  so no override is needed.

Conversion commands (reproducible, `npm` registry only):

```bash
npx obj2gltf -i enterprise1701d.obj -o entd.glb -b
npx @gltf-transform/cli optimize entd.glb public/models/galaxy.glb \
  --compress quantize --simplify-error 0.002 \
  --texture-size 2048 --texture-compress webp
```

`--compress quantize` is deliberate: Draco and meshopt would need a decoder at
runtime, and quantization (`KHR_mesh_quantization`) is supported by three.js
without one.

## `public/models/saber.glb`

- **Ship:** Saber-class frigate — U.S.S. Yeager (NCC-61947), tier 3. **The mesh
  is not canon-accurate.** It is a generic starship generated with
  [Tripo AI](https://www.tripo3d.ai/) and uploaded to this repository by the
  project owner (`starship+3d+model.zip` on `main`, file
  `tripo_convert_29b92b65-78e8-4d91-909e-e931593546bf.fbx`). It is used as the
  Saber's visual because its layout — forward saucer, compact engineering hull,
  twin nacelles on aft pylons — is the nearest match in the roster. No claim is
  made that it reproduces the studio design; replace the file with a real Saber
  mesh and nothing else needs to change.
- **In game:** converted from FBX (219,792 tris) to 49,662 tris, 2.54 MB. The
  AI albedo bake read as a patchwork of UV islands at runtime, so the base
  colour texture was removed and replaced with a neutral hull factor; the
  normal and metallic-roughness maps are kept for plating detail. Modelled nose
  toward **−Z**, hence `"facing": "back"` in `models.config.json`.

Conversion commands (reproducible; `fbx2gltf` is the BSD-3 Facebook converter,
`@gltf-transform/cli` the glTF optimiser — both npm only):

```bash
npx fbx2gltf --binary -i starship.fbx -o saber.glb      # 219,792 tris, 9.2 MB
# strip the AI albedo, keep normal + metal/rough
npx @gltf-transform/cli optimize saber.glb saber.opt.glb \
  --compress quantize --simplify-error 0.0015 \
  --texture-size 1024 --texture-compress webp          # 49,662 tris, 2.54 MB
```

---

## Where these two came from, and where the rest are stuck

Both files were found by searching GitHub (the only code host reachable from
the build sandbox). Roughly 140 Star Trek repositories were scanned for
`.glb` / `.gltf` / `.obj` / `.fbx` assets. The outcome:

- **Usable, non-LFS, licensed**: the two above.
- **Everything else with good Star Trek meshes is behind Git LFS.** The sandbox
  cannot fetch LFS objects (`403 Resource not accessible by integration`), and
  the working tree only contains 133-byte pointer files. Repositories affected
  include the well-stocked `siddharthgumballi/Star-Trek-Game` (Voyager,
  Enterprise-D, Odyssey, Sovereign, Excelsior, Ambassador, Earth Spacedock) and
  `jonjaques/inertialref` (Enterprise-D).
- **Non-LFS alternatives found were unusably low-poly** — 46 KB and 66 KB OBJ
  Enterprises, fewer triangles than the procedural hulls in this game.
- Sketchfab, CGTrader, TurboSquid, Thingiverse and the Star Trek Online asset
  archives are all outside the sandbox's network allowlist, so nothing from
  those can be pulled in automatically.

If you have a model file locally, or a Meshy export, drop it into
`public/models/` — see [MODELS.md](MODELS.md).

---

## Everything else

Ship hulls for the other fourteen classes, planets, stars, stations, nebulas
and the black hole are generated procedurally in `src/art/`. Earth's day,
night, water, topology and cloud maps are NASA-derived imagery already present
in `public/assets/earth/`.

Ship specifications (lengths, crews, armaments, deck counts) in
`src/data/ships.js` were researched from DITL, Memory Alpha / Memory Beta,
Trekpedia and the Star Trek Online wiki.
