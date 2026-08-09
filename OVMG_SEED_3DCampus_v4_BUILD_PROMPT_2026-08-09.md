# CLAUDE CODE BUILD PROMPT — SEED Initiative Living Campus v4

> Paste everything below the line into Claude Code, with `OVMG_SEED_3DCampusWorld_20260724_v3.html` in the working directory.

---

# MISSION

Rebuild `OVMG_SEED_3DCampusWorld_20260724_v3.html` into **v4**: a photoreal, real-time 3D world of the SEED Initiative Living Campus for OneVibeMediaGroup, Inc.

v3 works but is structurally broken. There are 40+ provable interpenetrations, roads driven through buildings, a 14 m acoustic wall buried inside its own berm, a community center with no door, footpaths tunnelling through buildings, and a render pipeline with no image-based lighting, no ambient occlusion, no post-processing and no texture colour management.

**v4 is not a patch. It is a rebuild on top of v3's good bones.**

Non-negotiables:
1. **Nothing intersects anything.** Every object is placed through a validator that can reject it. A build with any unresolved intersection fails.
2. **Everything sits on the ground.** One height field is the single source of truth. Nothing floats, nothing sinks.
3. **The circulation network is real.** Concrete sidewalks and asphalt roadways with curbs, gutters, lane markings, crosswalks, intersection radii and ADA ramps — generated from a graph, not hand-placed rectangles.
4. **Buildings read as buildings.** Real entries, real glazing, real roof plant, real ground contact. No blank boxes.
5. **It looks photographed, not modelled.** Correct colour management, IBL, cascaded shadows, AO, post-processing.

---

# GROUND RULES FOR THE WHOLE BUILD

- **Work in phases. Each phase ends in a hard gate.** Do not start phase N+1 until phase N's gate passes and you have reported the result. If a gate fails, fix it before moving on. Never disable or weaken a gate to make it pass.
- **Every gate is a script that prints PASS or FAIL with counts.** Put them in `tools/`. They run headless via Node against the scene graph — do not rely on visual inspection.
- **Take a screenshot at the end of every phase.** Use Playwright with the pre-installed Chromium. Save to `shots/phaseNN_<view>.png`. Look at it. If something is visibly wrong, fix it in that phase.
- **Deterministic.** One seeded PRNG. Same seed → byte-identical scene. Keep v3's `rnd()` and `WORLD_SEED` with `?seed=` override.
- **No invented facts.** Where copy needs a real number that is not already in v3's hotspot dataset, write `TODO_FACT: <what is needed>` and list it in the final report. Do not make up figures.
- **Ask before deviating.** If a requirement here conflicts with something you find in the code, stop and ask.

---

# WHAT TO KEEP FROM v3 (do not rewrite these)

Port these over intact; they are the good part of v3:

- The road/surface registry: `regSeg`, `regRect`, `regPolyline`, `distToSeg`, `curve2`
- The spatial hash (`TREEGRID`, `gridKey`, `gridInsert`, `gridNear`) and the `isValidTreePosition` gate
- `auditTrees` — the post-placement re-check against the complete registry
- `window.__seedTest` — the seed-regression harness
- `buildDebugOverlay` (`?debug=1`, press G)
- The full 45-entry `SPOTS_ALL` hotspot dataset and the detail-card UI
- The day/night structure, quality tiers, and the deterministic `rnd()`
- The procedural noise functions `h2`, `sm`, `vnoise`, `fbm`, `speckle`

**The core change: in v3 only trees went through the validator. In v4 every single object does.**

---

# PROJECT STRUCTURE

```
seed-v4/
  src/
    00-config.js        constants, seed, PRNG, layer/elevation ledger, quality tiers
    01-terrain.js       height field, biome masks, terrain mesh, water table
    02-registry.js      placement registry + collision validator + audit (from v3)
    03-materials.js     PBR material library, texture factory, colour management
    04-render.js        renderer, CSM, GTAO, post stack, sky, IBL, day/night
    05-roads.js         road graph → carriageway, curb, gutter, markings, intersections
    06-walks.js         sidewalk graph → concrete, joints, ramps, crossings
    07-buildings.js     building kit of parts
    08-campus.js        industrial + living-systems zone placement
    09-community.js     community center, plaza, greenhouses, food hub, academy
    10-perimeter.js     berm, wall, fence, gate, bioswale valley
    11-beyond.js        public road, neighbourhood, water plant, childcare, transit
    12-watershed.js     creek, riparian corridor, estuary, marsh
    13-coast.js         dune, beach, ocean, cleanup fleet, heritage promenade
    14-vegetation.js    all planting, through the validator
    15-props.js         benches, lamps, signage, bollards, litter, detail pass
    16-ui.js            markers, cards, filters, views, controls
  tools/
    gate-*.js           one script per gate
    build.js            inlines everything into the single-file output
    shoot.js            Playwright screenshot harness
  vendor/
    three.min.js        pin a modern three.js (r160+), not r128
  dist/
    OVMG_SEED_3DCampusWorld_<YYYYMMDD>_v4.html
```

**Output:** one self-contained `.html` that opens by double-clicking, with three.js, all shaders, all textures and all code inlined. No external requests except the Google Fonts link already in v3 (keep it, with a local fallback stack).

---

# PHASE 0 — FOUNDATION AND LEDGERS

## 0.1 Upgrade three.js
Replace r128 with **r160 or newer**. This is required for `WebGLRenderer.outputColorSpace`, modern `THREE.SRGBColorSpace`, and `BatchedMesh`. Port every deprecated call. Do not skip this — half the render fixes below depend on it.

## 0.2 The elevation ledger — kills all z-fighting
Create a single exported table in `00-config.js`. **Every** ground-level surface in the entire project reads its Y from here. No literal Y values for ground surfaces anywhere else in the codebase.

```js
export const Y = {
  terrain:      0.000,
  subgrade:     0.010,
  asphalt:      0.040,
  gutter:       0.055,
  roadMarking:  0.070,
  crosswalk:    0.075,
  concreteWalk: 0.090,
  walkJoint:    0.100,
  paver:        0.110,
  pavementEdge: 0.120,
  decal:        0.140,
};
```

Rules:
- Adjacent layers are separated by ≥ 0.015 world units.
- Every decal-class surface gets `polygonOffset: true`, `polygonOffsetFactor: -2`, `polygonOffsetUnits: -2`.
- Set `camera.near = 4.0` (walk mode is gone — see 0.5). With `far = 12000` this buys roughly 8× the depth precision v3 had.
- **The merge pass must preserve `renderOrder`.** v3's `mergeStatic` silently dropped it, undoing the one z-fighting fix that existed. Copy `renderOrder` onto the merged mesh.

## 0.3 The layer ledger
Every object declares a layer at creation: `TERRAIN | WATER | ROAD | WALK | STRUCTURE | CANOPY | PROP | VEGETATION | UTILITY | MARKER`. The collision matrix in phase 1 is defined per layer pair. No object may be added to the scene without a layer.

## 0.4 Quality tiers
Four tiers, auto-detected then user-overridable, cycling on the existing Quality chip:

| Tier | Shadows | AO | Post | Pixel ratio | Vegetation |
|---|---|---|---|---|---|
| Ultra | 4-cascade CSM @ 2048 | GTAO full | Bloom + TAA + SSR water | min(dpr, 2) | 100% |
| High | 3-cascade @ 2048 | GTAO half-res | Bloom + TAA | min(dpr, 2) | 100% |
| Balanced | 2-cascade @ 1024 | SSAO half-res | Bloom | 1.0 | 60% |
| Mobile | 1 cascade @ 1024 | off | off | 1.0 | 35%, impostor far trees |

Detect via `renderer.capabilities`, `navigator.hardwareConcurrency`, `matchMedia('(pointer: coarse)')`, plus a 60-frame startup benchmark that steps down a tier if median frame time exceeds 22 ms.

## 0.5 Delete dead code
Remove entirely: walk mode (`walk` object, `updateWalk`, `setMode`, `blocked`, pointer-lock handlers, `MODE === 'walk'` branches, `#cross`, `#lockmsg` and their CSS), `function B()`, the degenerate `box(0,0,0)` in `coolTower`, `pw*cols*0.0`, the always-truthy `T.paver ? ... : null` guards, and the identical-branch ternaries in `building()`. Keep `COLLIDERS` — in v4 it becomes load-bearing.

## 0.6 Constants that were dead in v3
v3 set `toneMappingExposure = 0.96`, `sun.intensity = 3.1` and `SKYU.sunDir.y = 0.28`, then overwrote all three in `setTime(false)`. Define each value once.

**GATE 0** — `tools/gate-0-foundation.js`
- three.js version ≥ 160 ✓
- Every ground surface Y traces to the `Y` ledger (AST scan: no numeric literal in `0.0 … 0.5` passed as a Y position outside `00-config.js`) ✓
- No reference to any removed walk-mode symbol ✓
- Four quality tiers instantiate without error ✓
- Same seed twice → identical scene-graph hash ✓

---

# PHASE 1 — THE PLACEMENT VALIDATOR

This is the most important phase in the build. Everything after it depends on it.

## 1.1 Universal placement API
**No mesh is ever added to the world directly.** Everything goes through:

```js
place({
  id,            // unique string
  layer,         // from the layer ledger
  footprint,     // OBB: {x, z, w, d, rot} — or a polygon for non-rectangular
  yBase,         // 'ground' | 'ground+n' | explicit
  height,
  clearance,     // required gap to other objects, in world units
  build,         // () => THREE.Object3D
  allowOverlapWith, // explicit whitelist of layer names or ids
})
```

`place()`:
1. Resolves `yBase` against the height field (phase 2).
2. Builds the OBB in world space.
3. Tests it against every registered footprint using the collision matrix.
4. On conflict: **throws**, with a message naming both objects, the overlap extent in metres, and the file:line of each placement.
5. On success: registers the footprint and returns the object.

## 1.2 Collision matrix
Default is **forbid**. Whitelist only what is physically true:

| A | B | Allowed? |
|---|---|---|
| STRUCTURE | STRUCTURE | No — unless explicitly declared a connected complex (shared wall) |
| STRUCTURE | ROAD | **No** |
| STRUCTURE | WALK | **No** |
| ROAD | ROAD | Only at a declared intersection node |
| ROAD | WALK | Only at a declared crossing node |
| WALK | WALK | Only at a declared junction node |
| VEGETATION | anything | No, with a per-species trunk radius + canopy radius test |
| PROP | STRUCTURE | No |
| PROP | ROAD / WALK | Only for street furniture explicitly sited in the furnishing zone |
| WATER | STRUCTURE | No — bridges and boardwalks declare piers instead |
| UTILITY (berm/wall/fence) | anything | No |
| CANOPY (solar carport, entry canopy) | STRUCTURE | Yes, when declared as attached |

## 1.3 Overlap resolution rule
When two objects must be near each other, the validator does **not** silently nudge. It throws, and you fix the design. Automatic nudging is how v3's problems became invisible.

## 1.4 The audit pass
After the entire world is built, run `auditWorld()`:
- Re-test every registered footprint against the complete final registry (v3 did this for trees only — do it for everything).
- Build a real AABB tree from the actual scene graph, using `Box3.setFromObject` on every mesh, and sweep for volume intersections. This catches anything the footprint declaration got wrong.
- Report every pair, with overlap volume, sorted worst-first.

**GATE 1** — `tools/gate-1-collision.js`
- `place()` is the only path to `world.add` (AST scan: no direct `world.add` / `scene.add` outside `02-registry.js` and the render module) ✓
- `auditWorld()` reports **0 unresolved intersections** ✓
- Deliberately placing a building on a road throws with a useful message ✓

---

# PHASE 2 — TERRAIN AND WATER TABLE

## 2.1 One height field
`siteH(x, z)` is the single source of truth. **Every** object's base Y comes from it. In v3 the beyond-the-fence module ignored terrain entirely, so the public road hung 7.4 m in the air at one end and was buried 3.3 m at the other while its own lamps followed the ground.

Composition:
- Base rolling terrain: multi-octave fbm, Sandhills-appropriate relief
- **Graded pad mask** — flat at 0 across the campus, with a real graded transition (cut/fill batter slopes at 3:1, not a step)
- **Watershed channel mask** — the creek corridor cuts a valley
- **Coastal mask** — terrain ramps down to a beach profile then a nearshore bathymetric slope
- Everything blended with smoothstep, C1-continuous, no seams

## 2.2 Terrain mesh
- Quadtree LOD, not a single 148 × 148 plane. Near the camera, ≤ 2 m cells; far field, coarse.
- **Splat-mapped triplanar materials** — grass, meadow, sand, gravel, disturbed soil, wet sand — blended by slope, height and mask, so texel density is uniform everywhere. v3 had grass at 87 m per tile on the terrain and 0.042 m per tile on the berm. That must not recur.
- Vertex colour variation for large-scale tonal break-up.
- Cut/fill earthwork batters wherever the graded pad meets natural ground.

## 2.3 Water table
`waterY(x, z)` returns the water surface: pond level, creek level (falling downstream), estuary level, sea level. Sea level is the datum. Ponds and the creek sit at their own levels with **excavated banks** — v3's ponds were flat discs floating 0.48 m above surrounding grade on top of a coplanar paver slab.

**GATE 2** — `tools/gate-2-terrain.js`
- Sample 10,000 random points: `|object.y - siteH(x,z)| < 0.05` for every ground-placed object ✓
- No terrain triangle steeper than 45° outside declared cut/fill batters ✓
- Water surfaces are below adjacent ground at every sampled bank point ✓
- Screenshot: grazing-angle shot at each biome boundary shows no texel-density seam ✓

---

# PHASE 3 — MATERIALS AND COLOUR MANAGEMENT

## 3.1 Fix colour management first
v3 set `outputEncoding = sRGBEncoding` but never set `encoding` on a single texture, so all 16 albedo maps were decoded as linear — everything textured was washed out and in a different colour space from the flat-colour materials.

- `renderer.outputColorSpace = THREE.SRGBColorSpace`
- **Every albedo / emissive map:** `texture.colorSpace = THREE.SRGBColorSpace`
- **Every normal / roughness / metalness / AO map:** `texture.colorSpace = THREE.NoColorSpace`
- All flat material colours authored in sRGB and converted once
- `renderer.toneMapping = THREE.AgXToneMapping` (or ACESFilmic if AgX reads too desaturated for this palette — compare both and pick)
- `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()`, not a hardcoded 8

## 3.2 Full PBR material set
Every material gets, at minimum: **albedo + normal + roughness + AO**, with metalness where relevant. v3 had zero roughness maps, zero AO maps and zero metalness maps in the entire file.

Generate procedurally at 1024² (512² on Mobile tier) into a texture array, and **decorrelate the maps** — v3 derived its normal maps from the same drawing as the albedo, so they carried no independent surface information.

Required materials, each with all four maps:

| Material | Must show |
|---|---|
| Asphalt (new / weathered / rubberized) | aggregate, tyre polish in wheel paths, tar seams, edge ravel |
| Concrete sidewalk | broom finish direction, control joints, cold-joint colour shift, edge chips |
| Concrete curb | float finish, form lines, staining at the gutter |
| Concrete paver | running bond, per-unit colour variance, joint sand |
| Metal wall panel | seam ribs, fastener lines, subtle oil-canning in the normal map |
| Standing-seam roof | ribs, panel-length variation, weathering streaks below penetrations |
| Architectural glass | mullion grid, fritted bird-safe UV pattern (this is a stated feature — `c5`), real reflectance |
| Greenhouse glazing | diffusion, condensation variation, glazing bar shadowing |
| PV module | cell grid, busbars, anti-reflective coat, frame, dust accumulation |
| Grass (short / meadow / bioswale) | blade direction, seasonal tonal variance, wear paths |
| Sand (dry / wet / wrack line) | grain, ripple, moisture darkening |
| Bark ×4 species, foliage ×6 species | — |
| Gravel, soil, mulch, crushed shell | — |
| Painted steel, galvanised steel, weathering steel, aluminium | — |
| Water (pond / creek / estuary / ocean) | see phase 12 |

## 3.3 Kill shared-material mutation
v3 had two lines that flipped `MAT.stoneTrim` and `MAT.metal` to `DoubleSide` globally — affecting every curb, cap, column, bench and post in the scene. In v4, **materials are frozen after creation.** Any per-object variant must be an explicit clone with a registered id. Add a dev-mode `Object.freeze` guard on the material library.

## 3.4 Detail texturing
- Macro/micro detail layering: a second high-frequency detail normal at ~1 m tiling on all large surfaces, to kill the "one texture stretched over 87 m" read.
- Triplanar on terrain and berms so slopes never smear.
- Per-instance colour and roughness jitter on repeated elements (pavers, panels, panes, planks).

## 3.5 Fix the argument bug
`T.panelWall`, `T.panelWallN`, `T.glassGrid` and `T.bark` were declared with one parameter but called with two — the second repeat value was silently discarded, so tree bark tiled 1:1 instead of 1:3 and boardwalk planks 1:1 instead of 1:6. Give every texture factory explicit `(repeatU, repeatV)`.

**GATE 3** — `tools/gate-3-materials.js`
- Every texture has an explicit `colorSpace` ✓
- Every non-emissive material has albedo + normal + roughness + AO ✓
- No material is mutated after creation (freeze guard reports 0 violations) ✓
- Texel density across all surfaces stays within a 4× band (measure world-units-per-texel per material and report the histogram) ✓
- Screenshot: a flat-lit material chart of every material at 1 m, 10 m and 100 m viewing distance ✓

---

# PHASE 4 — RENDER PIPELINE

## 4.1 Sky and atmosphere
- **Physical sky** — Hosek-Wilkie or Preetham, with turbidity, ground albedo and a real sun disc, driven by a time-of-day parameter rather than two hardcoded states.
- **The sky must go through the tone-mapping chain.** v3's sky shader omitted `<tonemapping_fragment>` and `<encodings_fragment>`, so it wrote raw colour while every lit surface went through ACES → sRGB. Result: distant terrain faded to cold grey against a warm sky — a permanent horizon seam. Fix this before tuning anything else.
- **Aerial perspective** — height-based exponential fog with Rayleigh-tinted distance scattering, so the sea meets the sky correctly. `FogExp2` at minimum; a custom scattering term is better.
- Volumetric light shafts at low sun angles (Ultra/High only).
- Night: real star field, moon disc with correct phase-appropriate terminator, Milky Way band. The eastern side stays unlit — that is a stated feature (`c5` dark sky).

## 4.2 Image-based lighting
v3's `scene.environment` was a PMREM of an **8 × 64 pixel gradient**. Replace with a full-resolution render of the physical sky into a cube target, PMREM-filtered, **regenerated whenever the time of day changes**. v3 never rebuilt it at night, so after dark every metal and glass surface still reflected a daytime blue sky.

Add a small set of **reflection probes** (box-projected) at: the plaza, the community center interior, the greenhouse block, the ponds, and the beach.

## 4.3 Shadows
v3 used one 1,120 × 1,120 ortho frustum over a 5,200-unit world, re-centred every frame, with `normalBias = 0.9` — which detached the shadow of every object under ~2 m.

- **Cascaded shadow maps**, 3–4 cascades, practical split scheme, blended at cascade boundaries.
- **Texel snapping** on every cascade so shadows don't swim when the camera moves.
- `normalBias` ≤ 0.02, `bias` tuned per cascade. Benches, curbs, bollards and road markings must all show ground contact.
- `shadow.autoUpdate = false` on static cascades; update only on time-of-day change or camera move beyond a threshold.
- **Foliage needs a `customDepthMaterial`** carrying the same wind vertex displacement. In v3 foliage swayed and its shadows stood still.
- Alpha-tested shadows for foliage cards.

## 4.4 Post-processing
Composer stack: `Render → GTAO → SSR (water only) → Bloom → TAA → Tone map → Output`.

- **GTAO** — this is the single biggest photorealism win available. v3 had no occlusion of any kind, which is why buildings met the ground with no darkening. Half-res with bilateral upsample on High.
- **Bloom** — threshold-based, tight. Night emissives at `emissiveIntensity 3.2` currently just clip to white with hard edges.
- **TAA** with proper motion vectors and a static-camera accumulation path. When the camera is still for > 500 ms, accumulate 16–32 jittered samples for a near-offline-quality still. This is what makes screen recordings and screenshots look expensive.
- Subtle chromatic aberration and a filmic grain matched to the vignette already in v3's CSS — move that vignette into the post stack so it composites correctly.

## 4.5 Real lights
v3 had **zero** point or spot lights. Every "light pool" was a flat radial-gradient decal painted on the ground, which washed across curbs, water and building walls, and one of which sat inside the community center.

- Real `SpotLight` per street lamp and path lamp, warm 2700 K, downward, full cutoff — matching the stated dark-sky spec (`c5`, `b3`).
- Cull to the ~24 nearest lights to the camera; the rest fall back to baked emissive + a *projected*, terrain-conforming light decal (not a flat quad).
- Per-building and per-floor emissive variation with a random on/off pattern and a slow flicker on a few units. In v3 every window in the campus lit at identical intensity at the identical instant because they shared one material.
- Light pools must respect the surface they land on.

## 4.6 Performance architecture
- **`BatchedMesh`** (r160+) for static geometry — keeps per-object frustum culling, unlike v3's merged meshes with `frustumCulled = false`, which meant nothing was ever culled from any angle.
- Preserve `renderOrder`, `castShadow`, `receiveShadow` and material through the batch.
- `InstancedMesh` with per-instance colour for all repeated elements.
- **Never allocate a material inside a loop.** v3's `sidewalk()` created a new `MeshStandardMaterial` per score line, producing ~771 unmergeable meshes and ~860 permanent extra draw calls, all also rasterised into the shadow map every frame.
- Hierarchical LOD on buildings and vegetation, with impostor billboards beyond 400 m.
- **Dispose everything.** v3 never disposed a single geometry, material or texture.
- Budget: **Ultra ≤ 900 draw calls, High ≤ 600, Balanced ≤ 350, Mobile ≤ 200.**

**GATE 4** — `tools/gate-4-render.js`
- Draw-call budget met at every tier ✓
- 60 fps median at High on a 2560×1440 viewport, measured over a 20-second scripted camera fly ✓
- Shadow contact verified: render a bench, a curb and a bollard at 2 m; the contact shadow touches the object ✓
- Sky/fog colour match: sample the horizon pixel of the sky and of distant terrain — ΔE < 3 ✓
- Screenshots at all 4 tiers, day and night, from the overview camera ✓

---

# PHASE 5 — ROADS

**Build roads from a graph, not from rectangles.** Every road in v3 was a hand-placed `road(w, d, x, z)` box, which is why three of them run through buildings and the perimeter "loop" has 20 × 70 m gaps at all four corners.

## 5.1 The road graph
```js
RoadGraph {
  nodes: [{id, x, z, type: 'intersection'|'terminus'|'cul-de-sac'|'gate'}],
  edges: [{from, to, class, lanes, width, geometry: 'straight'|'arc'|'spline', controls}],
}
```

Road classes, each with its own cross-section:

| Class | Width | Cross-section |
|---|---|---|
| Public arterial | 22 m | 2 lanes each way, centre turn lane, curb + gutter, sidewalk both sides, verge |
| Campus loop | 15 m | 2 lanes, curb + gutter, sidewalk inner side, shoulder outer |
| Service / haul | 13 m | 2 lanes, heavy-duty section, no sidewalk, wide truck radii |
| Community avenue | 13 m | 2 lanes, curb, sidewalk both sides, street trees in the verge |
| Parking aisle | 7 m | curb only |
| Fire lane | 6 m | flush, marked |

## 5.2 Generate, step by step, per edge
For each edge, in this order:
1. **Centreline** — resample the spline at 1 m
2. **Subgrade** — extruded ribbon at `Y.subgrade`, following `siteH` with proper crown (2% cross-slope) and superelevation on curves
3. **Carriageway** — asphalt ribbon at `Y.asphalt`, correctly crowned
4. **Gutter pan** — 0.6 m concrete strip at `Y.gutter`, sloped to the curb face
5. **Curb** — extruded profile along the edge: 0.15 m face, 0.45 m total, with a real batter. Drop to a flush profile at every driveway and ramp.
6. **Markings** at `Y.roadMarking` — generated from the lane spec, not hand-placed:
   - Yellow centreline (solid / double / dashed by class)
   - White edge lines
   - Lane dividers with correct dash-gap ratio
   - Stop bars at every signal and stop node
   - Turn arrows in turn lanes
   - "ONLY", bike symbols, accessible-stall symbols where applicable
7. **Drainage** — catch basins at every low point in the gutter profile, on real spacing, with grates

## 5.3 Intersections (v3 had none — roads just butted)
At every intersection node:
1. Compute the true intersection polygon from the two carriageway edges
2. Generate **corner return radii** — 6 m residential, 12 m truck route
3. Lay the intersection paving as one continuous surface, clipped to the polygon
4. **ADA curb ramps** at every corner — perpendicular or parallel type, with truncated-dome detectable warning panels
5. **Crosswalks** — continental (ladder) bars, correctly aligned to the ramps
6. Signals or stop signs per node type, with mast arms, heads, backplates, pedestrian heads with countdown, push buttons, and a control cabinet
7. Register the intersection footprint so nothing else can be placed there

## 5.4 Driveways and aprons
Every parking lot, loading dock, building service entry and dock stub connects to a road by a **generated apron**: flare, radii, flush curb transition, cross-slope tie-in. In v3 both visitor parking lots had **no driveway at all** — two fully striped lots marooned 11.5 m from the nearest pavement across open lawn.

## 5.5 Parking lots
Generated from a bay spec: stall size, angle, aisle width, module count. Produces:
- Asphalt with correct cross-slope
- Painted stalls, ADA stalls with hatched access aisles and correct signage
- **Perimeter curb** — v3's curb sat 1.5 cm *under* the asphalt, invisible, and the lot was drawn twice
- Landscape islands with real trees (one island per 10–12 stalls)
- Wheel stops, light poles on bases
- **Solar carport canopies with EV chargers** — this is stated feature `e3` and does not exist in v3

## 5.6 Rebuild the campus network correctly
- **Close the perimeter loop.** Four corner segments with proper radii. Delete v3's four phantom intersection keep-outs.
- **Reroute every spur** so it reaches its actual destination and does not pass through a building:
  - Waste-plant haul road → the WTE plant tipping floor, on a route that never crosses the community entrance (stated feature `i3`)
  - Substation spur → the substation yard
  - Academy spur → the academy's front door and its training-yard gate
  - Fiber spur → the meet-me room, not through it
- **Turn the compute-hall docks around.** v3's `building()` hard-coded loading aprons on +Z and entries on −Z, so every truck dock in the compute core faced the side with no road. Make dock face and entry face explicit per building.
- Add the plaza and community-center **service/load-in access** — a permanent 20 × 40 ft stage with 400 A service and no load-in road is not credible.
- Connect both parking lots.

**GATE 5** — `tools/gate-5-roads.js`
- Graph connectivity: every node reachable from the public road entry ✓
- **0 road-vs-structure intersections** ✓
- Every road terminus is an intersection, a cul-de-sac, or a declared site boundary — **no road ends in grass** ✓
- Every intersection has return radii, crosswalks and ADA ramps ✓
- Every destination in the destination list has a vehicle route ✓
- Curb is continuous and above the asphalt along every edge ✓
- Screenshot: top-down orthographic road plan; overlay the graph on the render and confirm they match ✓

---

# PHASE 6 — SIDEWALKS AND PATHS

Your note that there aren't many walkways is exactly right: v3 has sidewalks on the four perimeter roads and three orphan stubs, and that is it.

## 6.1 The pedestrian graph
Build it as a **separate graph** that must satisfy a connectivity requirement: **every public destination must be reachable on foot from every parking lot, from the transit shelter and from the public sidewalk, without crossing grass.**

Destination list (all must connect):
> Community center · event plaza · stage · all 4 greenhouses · aquaponics · marine showcase · food hub · farm stand · workforce academy · training yard · both parking lots · cul-de-sac drop-off · gatehouse · transit shelter · all 3 ponds · the boardwalk · the bioswale trail · the watershed corridor trailhead · the beach and every heritage marker

## 6.2 Sidewalk generation, step by step
Per edge:
1. Resample the centreline at 1 m
2. **Concrete ribbon**, 1.5 m minimum (5 ft ADA), 2.5 m on the promenade, 3.5 m on the plaza spine, at `Y.concreteWalk`, conforming to `siteH` with a 2% cross-slope and running slope ≤ 5% (or a ramp with landings and handrails where steeper)
3. **Control joints** every 1.5 m and **expansion joints** every 9 m — as a *joint decal at `Y.walkJoint` sized to the walk width*, not v3's 500 m-wide planes
4. **Thickened edge** — a visible 0.1 m concrete edge, so the walk reads as a slab and not a painted stripe
5. **Furnishing zone** — a 0.6 m strip on the street side where benches, lamps, signs, bins and bike racks are allowed to be placed, and only there
6. Where the walk meets a road: **curb ramp + detectable warning panel + crosswalk**, generated as one assembly
7. Where the walk meets water or wetland: a **boardwalk on piles** with decking, handrail and kick rail — never a paved surface across water. v3 ran a 5 m gravel path 6.6 m into a pond.

## 6.3 The promenade and trail hierarchy
| Type | Width | Surface |
|---|---|---|
| Civic promenade | 6 m | Paver, with tree grates, seating alcoves, lighting |
| Campus sidewalk | 1.8 m | Broom-finish concrete |
| Park path | 2.4 m | Stabilised decomposed granite with a steel edge |
| Nature trail | 1.2 m | Mulch/aggregate, no curb |
| Boardwalk | 2.4 m | Timber deck on piles |
| Beach access | 2.4 m | Elevated dune crossover with stairs and a switchback ramp |

## 6.4 Fix v3's specific path faults
- Remove the two `PATHDEFS` nodes that sit at the community center's exact centre and tunnel two paved ribbons through the building
- Remove the path node inside the aquaponics building
- Reroute the pond path onto a boardwalk at the water crossing
- Connect the greenhouse doors — currently 68 m of unwalked grass to the nearest path node
- Connect both parking-lot walks to the network (currently dead-ending in grass 20 m and 54 m short)
- Move the gate-approach sidewalk out of the south carriageway

**GATE 6** — `tools/gate-6-walks.js`
- **Pathfind test:** from each of {both lots, transit shelter, public sidewalk, gate} to every destination — all reachable, staying on WALK-layer surfaces, 0 failures ✓
- **0 walk-vs-structure intersections** ✓
- Every road crossing on a pedestrian route has a ramp + warning panel + crosswalk ✓
- No walk segment exceeds 5% running slope without a compliant ramp assembly ✓
- Longest unwalked gap between any two connected destinations = 0 m ✓
- Screenshot: top-down walk plan with the reachability graph overlaid ✓

---

# PHASE 7 — BUILDING KIT

Replace v3's `building()` — which produced a box with a solid slab on top — with a parametric kit of parts. Every building is assembled, not extruded.

## 7.1 Required parts on every building
1. **Foundation and ground contact** — a plinth, a 0.15 m reveal, and a **1.2 m concrete apron or landscape bed at the base**. This is what makes a building look attached to the ground rather than dropped on it. Nothing in v3 has it.
2. **Wall system** — panel modules with real joints, corner trim, base flashing, reveals
3. **Fenestration** — punched openings or a curtain wall, with **frames, mullions, transoms, sills, head trim, and glass set back in the reveal**. Glass must be genuinely transparent with real reflectance, plus the bird-safe UV frit (stated feature `c5`). v3's `MAT.glazing` had no `transparent` flag at all — it was solid.
4. **A real entrance** — doors, a vestibule, a canopy, steps or a ramp with handrails, a landing, bollards, signage, and a mat. Every public building.
5. **Roof** — a *parapet ring*, not v3's solid box over the whole roof plan. Coping cap, a visible membrane roof deck, crickets, roof drains, scuppers, downspouts, and a **penetration keep-out zone** so rooftop equipment cannot intersect the array.
6. **Roof plant** — RTUs, ductwork, condenser banks, screens, ladders, hatches, safety rails, walk pads — all placed via `place()` against the roof's own registry
7. **Rooftop PV** — mounted **above** the parapet plane, with racking, ballast, walk pads and inverter strings. In v3 the panels sat half inside the parapet slab and their legs went 1.8 m down into the building core.
8. **Service face** — dock levellers, bumpers, doors, bollards, transformer pad, generator, gas meter, hose bibs
9. **Weathering** — streaks below scuppers, dirt at grade, edge wear on corners

## 7.2 Explicit orientation
Every building declares `entryFace` and `serviceFace`. The validator asserts the entry faces a walk-connected route and the service face faces a road-connected apron. v3 hardcoded these and got every one of them backwards.

## 7.3 Fix the specific broken structures
- **Greenhouses** — fix all three rotation bugs (ridge vents becoming 89.6 m planes running from y −13 to +30; rafters rendering as vertical posts above the ridge; glazed slopes at 59° instead of 31° leaving a 1.2 m gap at every eave). **Delete the opaque interior backdrop box** and light the real interior — v3 modelled benches, crops and grow lights and then hid all of them inside an opaque block that also protruded 2 m above the eave line.
- **Turbine enclosure** — replace the `wireframe: true` box "trellis" with real trellis geometry, and build the living wall as a planted surface with instanced vines, not a green box on a wind-animated material that makes the building sway.
- **WTE plant** — separate the three interpenetrating volumes (24 × 28, 12 × 24 and 25 × 5 m of overlap), move the carbon-capture skids out of the main hall, and stop the stacks clipping the roof.
- **Substation** — add the fence, busbar, gantry, insulator strings, and actually connect the transformers to the pylons 60 m away.
- **Aquaponics** — move the 5,000 gal reef tank inside the building envelope (it is currently 5 m through the east wall) and glaze the viewing wall so it reads as the public showcase it is described as.
- **The two blank boxes** at (132, 200) and (302, 142) — give them a program or delete them.

**GATE 7** — `tools/gate-7-buildings.js`
- Every building has all 9 required parts ✓
- Every entry face is walk-connected; every service face is road-connected ✓
- **0 rooftop-equipment vs PV-array intersections** ✓
- No mesh penetrates a building envelope from outside without a declared opening ✓
- Screenshot: elevation and 3/4 view of each building type at 40 m ✓

---

# PHASE 8 — PERIMETER (the berm fix)

## 8.1 The correct cross-section
Working outward from inside the campus:

```
campus grade
  → 4 m landscape verge
  → SIDEWALK (Y.concreteWalk)
  → 2 m verge
  → PERIMETER ROAD (15 m, curb + gutter both sides)
  → 3 m shoulder
  → SECURITY FENCE (this is stated feature i4 and does not exist in v3 at all)
  → 9.1 m (30 ft) SETBACK — this is the stated w3 setback and it is currently NEGATIVE 7 m
  → BIOSWALE VALLEY: 5 m wide, 1.2 m deep, 4:1 side slopes, cobble check dams every 30 m,
    native grass and wildflower planting  ← w3's promised stormwater valley, absent in v3
  → BERM inner toe
  → BERM: 12 m high, 3:1 side slopes (72 m base, not v3's unbuildable 1.17:1),
    planted with the evergreen screen ON THE BERM (v3 planted it 5 m outside the outer toe)
  → ACOUSTIC WALL on the berm CREST — s1 says "berm + wall", which means stacked, not coincident
  → BERM outer toe → natural grade
```

**The v3 failure in one line:** the berm centreline sat at ±312 and the wall centreline at ±300, with a 38 m berm base. The berm surface at the wall centreline is 6.00 m, so the 14 m wall was buried 4.7–7.3 m along its entire length, and the berm's inboard toe reached 5.5 m past the wall into the campus, swallowing 14.5 of the 15 m carriageway.

## 8.2 Generate the berm as a swept profile
Build it as a **swept cross-section along a closed centreline polyline**, not five separate extruded boxes:
- Mitred corners — v3's berms interpenetrated 32 × 32 m at each of the four corners
- The berm centreline and the wall centreline are the *same* polyline, offset vertically. Physically impossible to interpenetrate.
- Terrain-conforming toes that blend into `siteH`
- Triplanar material so the slope faces never smear
- Real planting: the evergreen screen on the outer face, native grass on the inner face and in the valley

## 8.3 Fence, gate, security
- Perimeter fence: posts, mesh or palisade, top rail, gates. Zoned — industrial half secured, community half genuinely open, as `i4` describes.
- Gatehouse with booth, canopy, barrier arms, tyre spikes, camera masts, ANPR, a turnaround, and a **visitor lane separate from the truck lane** (stated `i3`)
- Move the gatehouse booth, the gate pillars and the two masts out of the carriageway

**GATE 8** — `tools/gate-8-perimeter.js`
- Berm and wall share a centreline; **0 intersecting volume** ✓
- Berm side slopes ≤ 3:1 everywhere ✓
- Setback from fence to berm inner toe ≥ 9.1 m along the entire perimeter ✓
- Bioswale invert is continuous and drains to a declared outfall ✓
- Corners are mitred with no double geometry ✓
- No lamp, mast, pole, building or road overlaps the berm or the wall ✓
- Screenshot: perimeter cross-section render at 4 stations + a 3/4 corner view ✓

---

# PHASE 9 — COMMUNITY ZONE REDESIGN

The community center in v3 is a sealed 80 m opaque drum with no door, no readable windows, and a 32 m solid concrete silo growing through its roof, with two footpaths running through the middle of it and a bench, two flower beds and two lamp posts inside it. It has to be redesigned, not repaired.

## 9.1 Design the community center around its actual program
`m1` describes four third places plus a services wing. Build that:

- **Form:** keep the round idea — it is a good one and it is the campus's visual signature — but make it a **ring with a glazed atrium courtyard at the centre**, not a solid drum with a concrete plug. The former core becomes a light-filled commons.
- **Entrances:** a primary entry facing the plaza and a secondary facing the parking/drop-off. Each with a canopy, a set of doors, a vestibule, glazing, signage and a landing. This is the single most important fix in the phase.
- **Program wedges**, visible from outside through real glass:
  - $1 coffee house — street-facing, with outdoor seating
  - Maker space — 3D printers, sewing, woodworking, soldering benches, roll-up door to a work yard
  - Teen center — music studio, homework tables
  - Senior hall — daylit, garden-facing
  - Services wing — library branch, legal aid rooms, notary, voter registration
- **Roof:** a real roof — clerestory that is actually visible (not buried under a 9 m overhang), skylights over the atrium, a green roof over the services wing, PV over the rest
- **Structure:** a colonnade with columns that stop at the beam, not through the soffit
- **Site:** an entry plaza, bike racks, benches, shade trees in grates, a bus/shuttle pull-in, an accessible drop-off with a striped aisle
- Extend the drop-off cul-de-sac so it actually serves the building — v3's was 87 m away across grass

## 9.2 Event plaza
- Give the plaza a **defined edge** — a raised curb, a change of paving, a tree bosque, a low seat wall. Currently it is a paver disc on an identical paver slab, so it has no boundary at all.
- **Stage:** a real permanent structure — deck, proscenium, wings, backstage room, cable trenches, rigging grid, flush power pedestals every 30 ft (a stated `m2` feature), and a **load-in road**
- **Canopy:** replace the 48 m open cone balanced on a single mast with a real tensile or truss canopy on a proper column grid, sized to the stage, correctly attached
- **String lights:** fix the arc/pole mismatch — every catenary must start and end at a pole. v3's arcs overshot by half a sector and terminated in mid-air.
- Restroom/security building (stated in `m2`), farm-stand structure, a mobile-vendor pad
- Bollard ring **with gaps** at the avenue, the cul-de-sac and every path

## 9.3 Zone connectivity
Explicit designed routes: **parking → plaza → community center → greenhouses → aquaponics → food hub → ponds → boardwalk.** With a legible spine, wayfinding signage, lighting, seating at intervals, and shade.

**GATE 9** — `tools/gate-9-community.js`
- Community center has ≥ 2 entrances, each walk-connected and road-adjacent ✓
- **0 objects inside any building envelope** ✓
- **0 paths through any building** ✓
- Plaza has a continuous defined edge ✓
- Stage has a load-in route ✓
- Every string-light catenary terminates at a pole ✓
- Screenshot: plaza-level eye-height view + community center approach ✓

---

# PHASE 10 — BEYOND THE FENCE

## 10.1 Fix what exists
- **Everything conforms to terrain.** The public road, its sidewalks, the meadow verge, the markings, the utility corridor and all four building groups currently ignore `siteH` — at the east end the road hangs 7.4 m above ground while its own lamps sit 9 m below it.
- Rebuild the public road through the phase-5 road generator: real curb, gutter, catch basins, markings, and the two signalised intersections as full assemblies
- Rebuild the sidewalks through phase 6 — this is stated feature `b2` and deserves to be legible
- Delete the 8 random floating meadow pads

## 10.2 Expand the neighbourhood
- Vary the housing: 4–5 house types, varied setbacks, driveways, mailboxes, fences, porches, sheds, yard trees, parked cars, basketball hoops. 24 identical houses in two rows reads as a diagram.
- Add: a small grocery, a clinic, a church, a school with a bus loop, a park with a playground and a ball field, a corner store. `b7` names the grocery, the clinic and the library as fixed shuttle stops — build them.
- **Home solar + battery** on the 300-home program houses (`b6`) — visible panels and a wall-mounted battery
- Underground utility corridor with vaults, pedestals and a trench-in-progress vignette (`b8`)
- 7,000-tree street canopy at one tree per 30 ft on the priority corridors (`b4`)
- Microtransit shuttle stops, shelters, and 4 vans on route (`b7`)
- Water kiosks in the housing areas (`b5`)

---

# PHASE 11 — THE WATERSHED CORRIDOR

New zone, roughly z = 500 → 1,100. **This is the bridge that makes the ocean make sense.** Bennettsville sits in the Yadkin–Pee Dee basin; the Great Pee Dee runs southeast into Winyah Bay and the Atlantic.

Build a continuous, walkable water story:
1. **Bioswale outfall** from the berm valley — a headwall, a level spreader, an energy dissipator
2. **Check-dam creek** — cobble weirs, riffle-pool sequence, meanders, gravel bars, undercut banks, woody debris
3. **Riparian buffer** — three planting bands (emergent, shrub, canopy) with species markers
4. **Water-quality monitoring station** — the same public-dashboard hardware as `a2`/`s2`, with a live display board
5. **Interpretive trail** — nature trail from phase 6, with signage nodes, a small overlook deck and a footbridge
6. **A scale marker in the world:** *"Great Pee Dee River — 150 mi to the Atlantic. Shown compressed."* Honest and it defuses the obvious objection.
7. Wetland pockets, beaver-dam analogues, wildlife: herons, turtles, deer at the tree line

The creek water level falls continuously downstream via `waterY`. The trail follows it.

---

# PHASE 12 — ESTUARY, BEACH AND OCEAN

## 12.1 Estuary (z ≈ 1,100 → 1,400)
- Tidal marsh — Spartina flats with a real tidal-creek dendritic pattern
- Oyster reef beds, exposed at low water
- **Living shoreline** — oyster-bag sills, marsh-grass plugs, coir logs. No bulkhead, no riprap. That is the point.
- A research/monitoring dock on piles
- Wading birds, fiddler-crab burrow texture on the mud flats

## 12.2 Dune and beach (z ≈ 1,400 → 1,600)
- Dune line with sea oats, sand fence, blowout patterns
- **Elevated dune crossovers** — timber boardwalks on piles with stairs and a switchback accessible ramp. Never a path on the dune.
- Beach with a real profile: dry sand → wrack line → wet sand → swash → surf
- Wrack line detail: shell hash, seaweed, driftwood — and, deliberately, **a small amount of debris in the untreated stretch and none in the cleaned stretch**, so the before/after is legible
- Beach access parking with a rinse station and bins

## 12.3 Ocean (z ≈ 1,600 → 3,500)
This is the money shot. Build the water properly:
- **Gerstner wave sum** — 6–8 components, wind-driven, with a swell direction
- **Depth-based colour ramp** — sand-lit shallows through green to deep blue
- **Screen-space reflections** on Ultra/High; a planar reflection probe as fallback
- **Refraction** with depth-based absorption (Beer-Lambert), so you can see the bottom in the shallows
- **Foam:** shoreline foam from a depth test, wave-crest foam from Jacobian/steepness, wake foam behind vessels
- **Breaking surf** at the bar — a wave-set that actually crosses and breaks, whitewater on the beach face, retreating swash on the sand
- **Caustics** projected onto the seabed in the shallows
- Subsurface scattering in the wave face at low sun angles
- Optional (Ultra): an artificial reef ball field visible under clear water

## 12.4 The cleanup fleet
- Skimmer vessel with an active collection boom, moving on a slow loop
- 2 RIBs, a collection barge, a debris boom arc
- Shore crew: figures with bags and grabbers, a sorting station, a weigh-in board with a running total
- Monitoring buoys on a line, matching the `a2` and `s2` sensor network
- A dive flag and a small dive support boat

---

# PHASE 13 — THE HERITAGE PROMENADE

**This is the emotional core of the new zone.** The brief: *our commitment to cleaning up the environment did not start when we broke ground and does not stop because we build.*

## 13.1 The timeline promenade
Along the dune boardwalk, walking from the campus toward the water:
- One marker per past OVMG cleanup, in chronological order — plinth, bronze-style plate, year, location, volunteer count, pounds recovered
- Walking seaward walks you forward through the history
- The last marker is **undated and blank**, captioned *"next one"*

> **`TODO_FACT`** — the marker content needs real data from Tanner: which cleanups, what years, where, roughly how many volunteers, roughly how much material recovered. Build the geometry and the layout with visible `TODO_FACT` placeholders. **Do not invent numbers.** OVMG's own claim-discipline rule is that no figure goes into a public asset without measured data behind it.

## 13.2 The recovered-material sculpture
At the dune crest, an anchor sculpture assembled from recovered material — nets, rope, plastic, buoys, metal. Lit at night. Visible from the beach and from the estuary overlook. This is the image people photograph.

## 13.3 The "then / now" pairs
Three paired markers, each linking a past cleanup practice to the campus program it became:
- Volunteer cleanup crews → the trades and vocational academy (`k1`)
- Festival waste diversion → the waste-to-energy plant (`e5`)
- Carbon Sponge → carbon capture and biochar (`c1`, `c2`)

## 13.4 The copy
Build the section around this line, in the OVMG operator voice — short sentences, concrete, no hype adjectives, no em dashes:

> *"We were pulling things out of the water long before we had a site to build on. The cleanups did not stop when the campus started. They are the reason it looks like this."*

## 13.5 New hotspot category
Add a **Heritage** category (colour: a warm sand/amber, distinct from the existing 9) with pins for: the timeline promenade, the recovered-material sculpture, the living shoreline, the cleanup fleet, the watershed corridor, and the water-quality station.

---

# PHASE 14 — VEGETATION AND DETAIL

## 14.1 Planting
- Every plant goes through `place()`. Species-specific trunk radius, canopy radius, mature height, and a minimum spacing rule.
- 8+ tree species matching the stated native list (`c4`): loblolly pine, eastern red cedar, tulip poplar, white oak, river birch, sweetgum, black walnut, willow oak — plus sea oats, Spartina, wax myrtle and live oak in the coastal zone
- 3 LOD levels per species plus a cross-billboard impostor
- Age variation, lean, asymmetry, and a few dead/leaning specimens
- Ground cover: grass cards near the camera, meadow, mulch beds, leaf litter under canopies
- **Wind: one system, with a matching `customDepthMaterial`, so shadows sway too**
- **Agrivoltaic understory** with grazing sheep (`e2`) — pins currently point at empty grass

## 14.2 The detail pass — what sells realism
- **Wear paths** — worn grass where the desire line cuts a corner
- **Dirt accumulation** at wall bases, in curb lines, in gutters
- **Puddles** in low points on asphalt (roughness-map driven, no geometry)
- **Utilities:** manholes, valve boxes, hydrants, meters, junction boxes, conduits — on believable spacing
- **Signage:** stop signs, street blades, wayfinding, building ID, regulatory, interpretive
- **Street furniture:** benches, bins, bike racks, bollards, planters — only in the furnishing zone
- **Life:** parked vehicles with variety, a few moving vehicles on the loop, the shuttle on route, forklifts at the docks, pedestrian figures at plaza scale, birds
- **Weathering:** streaking under scuppers, rust at fasteners, sun-fade on south faces, tyre polish in wheel paths, sand drift against the dune fence

---

# PHASE 15 — UI, VIEWS AND POLISH

## 15.1 Turn the hidden content back on
v3 filtered off **20 of its 45 hotspots** — every Sound, Workforce and Beyond-the-Fence entry, plus the marine showcase and the food hub. Show all of them, plus the new Heritage set, managed by:
- Category filters (existing rail)
- Distance-based marker culling and clustering, so density stays readable
- A "zone" grouping so pins fade in as you enter a zone

## 15.2 Views
Extend to: Overview · Compute core · Living systems · Community · Beyond the fence · **Watershed** · **Coast** · **Ocean**. Note that all five v3 presets look north — the coastal presets must look south, toward the water.

Add a **cinematic tour mode**: a scripted camera path through all eight zones with eased transitions, auto-opening cards, and a day→night transition at the coast. This is what you screen-record for investors.

## 15.3 Time of day
Replace the two-state toggle with a **continuous scrubber**: dawn → golden hour → midday → dusk → blue hour → night. Sky, sun position, IBL, exposure, lights and emissives all interpolate. Preset buttons remain.

## 15.4 Fix the interaction bugs
- The `E` key both opens the nearest marker *and* raises the camera target (it is bound twice) — separate them
- Beyond-the-fence light pools are parented to `world` instead of `beyond`, so toggling the community area off leaves 32 glowing discs floating over empty terrain at night
- `groundAt()` raycasts a flat plane at y=0, so zoom-to-cursor is wrong by up to 21 m over the hills — raycast the terrain
- Widen the orbit target clamp to include the new coastal zones
- Call `placeMarkers()` before `render()`, not after — markers currently lag one frame

## 15.5 Accessibility
Keyboard navigation for all markers, ARIA on the card, focus-visible states, `prefers-reduced-motion` honoured throughout, and a text-only fallback listing every system with its full copy.

---

# PHASE 16 — BUILD, VERIFY, SHIP

## 16.1 The build script
`tools/build.js` inlines three.js, all modules, all shaders and all generated textures into a single self-contained `.html`. Target under 12 MB. Minify. Verify the output opens from `file://` with no network requests except the fonts link.

## 16.2 Final verification — run every gate again
1. All 16 gates pass ✓
2. `auditWorld()` → **0 intersections** ✓
3. Terrain conformance → **0 floating or sunken objects** ✓
4. Walk connectivity → **100% of destinations reachable** ✓
5. Road connectivity → **0 dead ends in grass** ✓
6. Performance → all four tiers within budget ✓
7. Determinism → 3 runs, identical hash ✓
8. Seed sweep → `__seedTest` across 20 seeds, 0 violations ✓
9. Console → 0 errors, 0 warnings ✓
10. Memory → no leak across a 5-minute tour, all disposals verified ✓

## 16.3 Screenshot set
Render at 2560 × 1440: all 8 views × 4 times of day = 32 images. Plus eye-height shots at the plaza, the community center entrance, the greenhouse interior, the boardwalk, the dune crossover and the beach. Look at every one. Anything that reads wrong goes back into the relevant phase.

## 16.4 Final report
Write `V4_BUILD_REPORT.md` containing:
- Every gate result
- A full before/after defect table against the v3 audit
- Complete object inventory with counts
- Performance numbers per tier
- **Every `TODO_FACT` still outstanding**
- Known limitations
- What v5 should do next

---

# SUMMARY OF THE HARD REQUIREMENTS

| # | Requirement | Verified by |
|---|---|---|
| 1 | Zero interpenetration, anywhere | Gate 1, `auditWorld()` |
| 2 | Everything conforms to one height field | Gate 2 |
| 3 | Correct colour management, full PBR | Gate 3 |
| 4 | CSM + GTAO + post, 60 fps at High | Gate 4 |
| 5 | Roads from a graph: curb, gutter, markings, intersections, ramps | Gate 5 |
| 6 | Every destination walkable, no gaps | Gate 6 |
| 7 | Buildings with entries, glazing, roof plant, ground contact | Gate 7 |
| 8 | Berm and wall stacked on one centreline, 30 ft setback, bioswale valley | Gate 8 |
| 9 | Community center redesigned with real entrances and program | Gate 9 |
| 10 | Ocean, beach, estuary, watershed corridor, cleanup fleet | Phases 11–12 |
| 11 | Heritage promenade with `TODO_FACT` placeholders, no invented numbers | Phase 13 |
| 12 | All 45 hotspots visible plus the new Heritage set | Phase 15 |
| 13 | Single self-contained HTML output | Phase 16 |

**Start with Phase 0. Report the gate result after each phase before continuing.**
