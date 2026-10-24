# Third-party models, textures and sources

The game ships two high-detail ship models taken from public GitHub
repositories. They are fan-made recreations of Star Trek designs: the
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

---

## Everything else

Ship hulls for the other fourteen classes, planets, stars, stations, nebulas
and the black hole are generated procedurally in `src/art/`. Earth's day,
night, water, topology and cloud maps are NASA-derived imagery already present
in `public/assets/earth/`.

Ship specifications (lengths, crews, armaments, deck counts) in
`src/data/ships.js` were researched from DITL, Memory Alpha / Memory Beta,
Trekpedia and the Star Trek Online wiki.
