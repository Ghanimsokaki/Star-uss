# STAR TREK: ASCENSION

A 3D starship-command game that runs in the browser — built with **three.js**, plain ES modules and Vite. No build-time assets, no server: the whole galaxy, every hull, every planet texture and every sound is generated at runtime.

> Fan project. Star Trek and all related marks are the property of their respective rights holders. This is a non-commercial tribute.

---

## Play

```bash
npm install
npm run dev        # http://localhost:5173  (binds 0.0.0.0, works on phones)
npm run build      # production bundle in dist/
npm run preview    # serve the built bundle on :4173
```

Requires WebGL 2 and hardware acceleration. On first load the game shows a boot sequence, then the title screen.

### Controls

The game detects your device at boot — phone, tablet or desktop — and switches control scheme automatically.
You can override the guess any time in **Settings → Controls** (Auto / Touch / Mouse). A gamepad is picked up
on the fly too.

| Action | Mouse + keyboard | Touch |
| --- | --- | --- |
| Steer / fly | move the mouse (fly toward the cursor) or `W A S D` / arrows | **drag anywhere** on the view |
| Fire phasers | hold `Space` / left mouse | hold **FIRE** |
| Photon torpedo | `F` / right mouse | **TORP** |
| Ship ability | `E` (or `1`) | **✷ ABILITY** |
| Evasive boost | hold `Shift` | **BOOST** |
| Throttle up / down | `Z` / `C` | **▲** / **▼** rail on the right edge |
| All stop | `X` | **■** |
| Cycle target | `Q` or `Tab` | **tap** the view |
| Scan / survey | `R` | **⌖ SCAN** |
| **Warp** | **`T`**, pick a star, `Enter` | **WARP** button |
| Weapons assist | `V` toggles | Settings |
| Shipyard / Earth / Galaxy / Missions | `H` / `J` / `G` / `M` | top bar |
| Close dialog | `Esc` | tap outside |
| Gamepad | left stick steers · RT fire · LT torpedo · A ability · B target · X scan · Y warp · d-pad throttle | — |

The helm is fly-by-wire: steering is smoothed, the mouse has a generous centre dead zone, and **weapons assist**
gently pulls you toward your locked target (toggle with `V` or in Settings, along with pitch inversion). On touch,
assist is 35% stronger because a thumb is less precise than a mouse.

---

## What is in the game

**Home base — Earth.** A real NASA-derived day/night globe (day map, city lights, cloud layer, topology bump) with a live terminator that follows your local clock. You place districts directly on the globe: arcologies, industrial replicators, research campuses, orbital shipyards, planetary shields, fusion grids and biodomes. Districts generate credits and research in real time — including while the game is closed (capped offline income). Population grows toward the ceiling set by housing and food.

**Starships.** Twenty-two playable hulls across **two timelines**, each with its own model, specs and signature ability.

*Prime timeline:* Miranda (U.S.S. Reliant), Saber (U.S.S. Yeager), NX-class Enterprise (NX-01), Steamrunner (U.S.S. Appalachia), Constitution-class Enterprise (NCC-1701), Intrepid, Excelsior, Nebula (U.S.S. Sutherland), Akira, Defiant, Ambassador-class Enterprise-C (NCC-1701-C), Sovereign (Enterprise-E), Galaxy-class Enterprise-D (NCC-1701-D), Crossfield-class Discovery (NCC-1031), Prometheus, Constitution III-class Enterprise-G (NCC-1701-G) and Odyssey-class Enterprise-F (NCC-1701-F).

*Kelvin timeline:* the Kelvin-type U.S.S. Kelvin, the huge Kelvin-universe Constitution-class Enterprise (NCC-1701), the Freedom-class U.S.S. Franklin, the refit Enterprise-A (NCC-1701-A) and the Dreadnought-class U.S.S. Vengeance. Kelvin hulls are marked with an amber badge in the shipyard and in the codex, and are freely mixed with prime-timeline ships.

Abilities: *Auxiliary Power* (Miranda), *Point Defence* (Kelvin), *Evasive Pattern* (Saber — most incoming fire misses), *Polarised Hull Plating* (NX-01), *Torpedo Run* (Steamrunner — eight torpedoes at once), *Corbomite Maneuver* (NCC-1701), *Reactor Overdrive* (Kelvin Constitution), *Slipstream Burst* (Intrepid), *Transwarp Sprint* (Excelsior), *Sensor Sweep* (Nebula — busts cloaks, +35% damage), *Time Slingshot* (Franklin), *Torpedo Salvo* (Akira), *Pulse Overload* (Defiant), *Last Stand* (Ambassador — 55% damage reduction), *Full Spread* (Enterprise-A), *Quantum Burst* (Sovereign), *Saucer Separation* (Enterprise-D), *Spore Jump* (Crossfield — reappear astern of your target), *Multi-Vector Assault* (Prometheus), *Dreadnought Barrage* (Vengeance), *Overwatch* (Enterprise-G — three targets at once) and *Fleet Barrage* (Enterprise-F).

Five ship systems — hull, shields, weapons, engines, sensors — upgrade independently per hull, and the visual model changes with them (more phaser strips, brighter warp glow). Research unlocks fleet-wide modifiers: SIF reinforcement, phaser tuning, quantum torpedoes, ablative armour, transwarp, and **Singularity Physics**.

**The galaxy.** 47 star systems and 61 warp lanes, from Sol and Qo'noS to Deep Space 9, Wolf 359, the Black Cluster and the Vela Singularity. Every system has a star class, threat rating, faction and procedurally textured planets you can survey for credits, research and dilithium. Anomalies give one-off finds; warp travel costs dilithium scaled by distance and threat.

**Combat.** A third-person flight scene with a chase camera: phaser beams that track targets inside your forward arc, photon torpedoes with splash damage, shield bubbles that flare on impact, hull damage, evasive burns, warp-core breaches and per-class special abilities (cloak detection, attack-pattern phaser spreads, multi-vector separation and so on). Hostiles include Klingon B'rel Birds-of-Prey (they cloak), Romulan D'deridex warbirds, Cardassian Galor cruisers, Jem'Hadar fighters, Borg cubes — and at the end of the chain, the Void.

**The black hole.** A shader-driven stellar-mass black hole: pure-black event horizon, photon ring, a turbulent doppler-beamed accretion disk, infalling debris and relativistic jets. The hole's gravity pulls your ship in, drags your hull, and kills you if you cross the horizon. The Vela Singularity hides the endgame boss and the final missions.

**Progression.** Ranks, a mission chain with rewards, a codex of ships/factions/locations, achievements-ish mission log, autosave every 20 s and a save in `localStorage`.

---

## Device detection

`src/core/device.js` decides, once at boot and again on every resize / rotation / gamepad plug-in:

- **form factor** — phone, tablet or desktop, from the user agent, touch points and pointer type
- **control scheme** — `touch` (drag-to-steer, on-screen rail, thumb-sized buttons) or `pointer` (mouse + keys)
- **hardware tier** — low / mid / high from core count, memory, DPR and the WebGL renderer string, which drives
  the graphics preset instead of a fixed guess
- **orientation, safe areas, reduced-motion and standalone/PWA state**

The result lands on `<body>` as `is-touch` / `is-pointer`, `is-mobile` / `is-tablet` / `is-desktop`,
`tier-low|mid|high` and `portrait`, so CSS can lay out for the actual device rather than window width.
Settings → Controls reports what was detected and lets the player force a scheme.

---

## Your own hulls (Meshy)

Every one of the sixteen classes can be replaced by a model you made yourself
(Meshy or any other tool). Drop a GLB into `public/models/` named after the
class, run the game, and the hull is swapped in — rescaled, centred and turned
to face the right way automatically:

```bash
cp ~/Downloads/meshy_export.glb public/models/sovereign.glb
npm run models:check -- public/models/sovereign.glb   # optional sanity check
npm run dev                                           # manifest rebuilds, hull loads
```

Three hulls already ship as imported models — the Odyssey-class Enterprise-F,
the Galaxy-class Enterprise-D and the Saber-class frigate — and the rest keep
their procedural hull as the instant first frame and as the fallback if a file
is missing or broken.
Export as **GLB**, 2K textures, low/medium poly, under ~15 MB. Full recipe, all class ids, per-ship orientation tuning and a
troubleshooting table: **[docs/MODELS.md](docs/MODELS.md)**. Per-ship tweaks
live in the ready-made `models.config.json`.

---

## Project layout

```
index.html               app shell, boot screen, WebGL fallback
vite.config.js           dev server (0.0.0.0), manual chunking
public/assets/earth/     real Earth day / night / water / topology / cloud JPEGs
public/models/           your ship GLBs (drop-in) + generated manifest.json
docs/MODELS.md           Meshy export recipe and the model import pipeline
docs/CREDITS.md          where the imported models come from, and their licences

src/main.js              App: viewport + input + scene registry, chrome, warp overlay, RAF loop
src/style.css            LCARS-flavoured glass UI, responsive + touch layouts
src/game.js              Game state machine: economy, ships, research, travel, missions, save/load
src/core/                util, device detection, input (mouse/keyboard/touch/gamepad), audio, Viewport
src/data/                ships, enemies, galaxy, tech/districts/codex, missions/ranks
src/art/                 procedural textures, ship & enemy builders, environment, Earth, black hole
src/ui/                  DOM toolkit + menus (codex, handbook, settings, mission log, rank-up)
src/scenes/              title, earth, hangar, galaxy, system (flight & combat)
```

### Architecture notes

- One `Viewport` owns the renderer, the `EffectComposer` (bloom + output pass) and quality tiers (`low | medium | high`). Quality is a `0..1` number handed to every procedural builder.
- `Game` is the single source of truth. Scenes read `game.state` and call methods; a tiny event bus broadcasts `change`, `rankup`, `mission`.
- Every scene follows the same contract: `constructor(app)`, lazy `_build()`, `enter()`, `exit()`, `update(dt, t)`, `resize(w, h)`.
- Procedural textures are cached by key and **never** disposed with the meshes that use them.
- `device.js` is the single source of truth for "what am I running on": form factor, control scheme and
  hardware tier. Nothing else sniffs the user agent. `viewport.js` takes its preset from it, `input.js` takes
  its scheme, and the body classes drive the responsive HUD.
- Ship models are a build-time manifest, not a hard dependency: `src/art/imported.js` fetches `public/models/manifest.json`, hot-swaps a GLB in when it exists, and leaves the procedural hull in place otherwise. The scanner (`scripts/scan-models.mjs`) runs before `dev`/`build` and watches the folder while the dev server is up.

---

## Known limitations

- Very large fleet battles on low-end phones will drop frames; quality auto-scales down.
- Saves are per-browser (`localStorage`), not per-account.
- Balance is tuned by simulation, not by a full playtest ladder.
