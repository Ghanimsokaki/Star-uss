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

| Action | Desktop | Touch |
| --- | --- | --- |
| Steer / fly | mouse (steer toward the cursor) or `W A S D` | drag the virtual stick (bottom-left) |
| Fire phasers | hold `Space` / left mouse | hold **FIRE** |
| Photon torpedo | `F` / right mouse | **TORPEDO** |
| Evasive boost | hold `Shift` | **BOOST** |
| Class ability | `E` | **✷ ABILITY** |
| Cycle target | `Q` or `Tab` | tap a contact |
| Scan / survey | `R` (or the scan prompt) | tap **⌖ SCAN** |
| Throttle / brake | `Z` / `X` | auto |
| Shipyard | `H` | top bar |
| Home world | `J` | top bar |
| Galaxy map | `G` | top bar |
| Mission log | `M` | top bar |
| Close dialog | `Esc` | tap outside |

---

## What is in the game

**Home base — Earth.** A real NASA-derived day/night globe (day map, city lights, cloud layer, topology bump) with a live terminator that follows your local clock. You place districts directly on the globe: arcologies, industrial replicators, research campuses, orbital shipyards, planetary shields, fusion grids and biodomes. Districts generate credits and research in real time — including while the game is closed (capped offline income). Population grows toward the ceiling set by housing and food.

**Starships.** You start with a **Miranda-class** light cruiser (U.S.S. Reliant) and work up through the legendary **Constitution-class U.S.S. Enterprise, NCC-1701**, then the **Intrepid**, **Akira**, **Defiant**, **Sovereign** and finally the **Prometheus**-class multi-vector assault cruiser. The Enterprise comes with her own signature ability, the **Corbomite Maneuver**: a convincing bluff that makes hostiles hold fire for six seconds while your shields recharge. Each hull is procedurally modelled from a saucer, secondary hull, pylons and nacelles, with real registry decals, custom palettes, nacelle and deflector colours. Sizes, crew complements, weapon counts and speeds follow the canon figures researched for the project.

Five ship systems — hull, shields, weapons, engines, sensors — upgrade independently per hull, and the visual model changes with them (more phaser strips, brighter warp glow). Research unlocks fleet-wide modifiers: SIF reinforcement, phaser tuning, quantum torpedoes, ablative armour, transwarp, and **Singularity Physics**.

**The galaxy.** 47 star systems and 61 warp lanes, from Sol and Qo'noS to Deep Space 9, Wolf 359, the Black Cluster and the Vela Singularity. Every system has a star class, threat rating, faction and procedurally textured planets you can survey for credits, research and dilithium. Anomalies give one-off finds; warp travel costs dilithium scaled by distance and threat.

**Combat.** A third-person flight scene with a chase camera: phaser beams that track targets inside your forward arc, photon torpedoes with splash damage, shield bubbles that flare on impact, hull damage, evasive burns, warp-core breaches and per-class special abilities (cloak detection, attack-pattern phaser spreads, multi-vector separation and so on). Hostiles include Klingon B'rel Birds-of-Prey (they cloak), Romulan D'deridex warbirds, Cardassian Galor cruisers, Jem'Hadar fighters, Borg cubes — and at the end of the chain, the Void.

**The black hole.** A shader-driven stellar-mass black hole: pure-black event horizon, photon ring, a turbulent doppler-beamed accretion disk, infalling debris and relativistic jets. The hole's gravity pulls your ship in, drags your hull, and kills you if you cross the horizon. The Vela Singularity hides the endgame boss and the final missions.

**Progression.** Ranks, a mission chain with rewards, a codex of ships/factions/locations, achievements-ish mission log, autosave every 20 s and a save in `localStorage`.

---

## Project layout

```
index.html               app shell, boot screen, WebGL fallback
vite.config.js           dev server (0.0.0.0), manual chunking
public/assets/earth/     real Earth day / night / water / topology / cloud JPEGs

src/main.js              App: viewport + input + scene registry, chrome, warp overlay, RAF loop
src/style.css            LCARS-flavoured glass UI, responsive + touch layouts
src/game.js              Game state machine: economy, ships, research, travel, missions, save/load
src/core/                util, seeded rng, input + virtual stick, procedural audio, Viewport
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

---

## Known limitations

- Very large fleet battles on low-end phones will drop frames; quality auto-scales down.
- Saves are per-browser (`localStorage`), not per-account.
- Balance is tuned by simulation, not by a full playtest ladder.
