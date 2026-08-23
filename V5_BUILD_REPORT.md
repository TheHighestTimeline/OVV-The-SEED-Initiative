# SEED Initiative Living Campus — v5 Build Report

**Built:** 2026-08-23
**Output:** `seed-v5/dist/OVMG_SEED_CityWorld_20260823_v5.html` (self-contained)
**Source:** `seed-v5/src/` · **Build:** `node seed-v5/tools/build.js`
**Engine:** three.js r170

v5 is an evolution of the v4 engine, which already ran on the derivation-first
architecture the v5 spec demands (no hand-typed positions outside the seed
layer, a placement registry that throws on conflict, props placed by rule
along parent edges). Rebuilding 13,500 proven lines from scratch was the
highest-risk path to *new* bugs, so v5 keeps the engine and delivers the v5
goals on top of it: no errors, no overlapping objects, half the draw calls,
two fixed time states, and a world that can actually be explored on foot.

---

## 1. Verification results

Measured from the shipped file with the headless harness
(`node tools/shoot.js`). The build **throws on the first placement
conflict**; it reached "ready", so every number below is a real pass.

| Gate | v4 | v5 |
|---|---|---|
| Placement conflicts rejected during build | 0 | **0** |
| `auditWorld()` footprint re-check | 0 | **0** |
| Scene-graph AABB sweep for volume intersections | 0 | **0** |
| Road graph problems (dead ends, orphans, unreachable) | 0 | **0** |
| Pedestrian reachability: 31 destinations × 5 sources | 0 failures | **0 failures** |
| Material mutations after freeze (debug guard) | 622 flagged* | **0** |
| Draw calls, High tier, overview frame | 7,733 | **3,749** |
| Unique drawable objects | 1,678 | **736** |
| Console errors | 0 | **0** |
| Registered footprints | 7,264 | 7,264 |

\* v4's 622 were three.js's own legitimate per-frame `.side` toggling on
transparent double-sided glass, mis-flagged by the debug guard — but the
guard also grew that violations array unboundedly every frame, a debug-mode
memory leak. Both fixed.

---

## 2. What changed in v5

### Draw calls halved (7,733 → 3,749 at High)

Two structural fixes, no visual change:

**Signal lenses.** v4 cloned a material per lens so the controller could
drive each head individually — 624 unmergeable meshes. Every head on the
same leg of the same intersection shows the same aspect at the same
instant, so v5 clones one material set per *controller leg* and the merge
pass collapses the meshes. The controller drives the shared material;
nothing about the phasing changed.

**`collapseInstanced`.** The generators instance honestly but per call
site: 124 curb-ramp dome pads, 111 bioswale cobble runs, 109 PV racks,
97 tactile panels — each its own `InstancedMesh`, each its own draw.
Identical parametric geometries are re-created per call
(`new DodecahedronGeometry(0.42, 0)` at every check dam), so the new pass
buckets by geometry *parameter signature* rather than uuid and concatenates
instance matrices into world space. Instances stay instances — the
per-instance wind shader and instance colours survive.

The remaining ~5× multiplier over the 736 objects is cascaded shadows
(3 cascades) plus the AO prepass, working as designed.

### Two time states, no scrubber

Afternoon (sun ~27°, long soft shadows) and Night (street lights, per-window
lit patterns, dark-sky east). The 0–24 h slider and six presets are gone;
the bottom bar is a two-button hard toggle. Each state's PMREM environment
map **and** fog probe (a GPU read-back) are baked on first visit and cached,
so the toggle is a texture swap. The cinematic tour runs the campus and town
in the afternoon and hard-switches to night at the coast, per spec.

### Light pools: night streets now read from the air

The spec's fallback for lamps beyond the real spot-light pool ("baked
emissive plus a projected ground decal") had never been implemented — beyond
the nearest 24 lamps, every street went black at night. v5 gives each of the
850 luminaires a ground-conforming warm glow disc (each vertex sampled from
the height field — not a flat quad, which is what v3's pools did wrong),
merged into **one draw call**, pushed into HDR so the night bloom picks it
up, and driven by the time state. The night overview now reads as a city
from a plane window: every street traced in light, the dark-sky eastern
zone still dark.

Building it reproduced v4's most instructive bug class within the hour: the
disc fan was wound CCW in plan coordinates, which faces *downward* in
three.js, so front-face culling removed every pool. The fix is wound to
face +y and commented for the next person.

### Animated objects were being baked static (v4 visual bug, fixed)

The merge pass checked `noMerge` only on the mesh itself. A driving car's
*group* is animated but its body and tyres carried no flag — so the merge
baked them into a static batch at the build position and the only thing
left driving was the cabin: a ghost glass box on the arterial. The same
applied to the coast cleanup fleet (skimmer, RIBs, barge) and the bobbing
buoys. Both merge passes now prune whole subtrees on a group-level
`noMerge`, and every animated vehicle/vessel/buoy carries it. The ~90
*parked* cars stay mergeable.

### Shared-material mutations (v4 bugs, fixed)

- `signalHead()` set `.side = DoubleSide` on the shared `steelDark` library
  material — flipping every steelDark surface in the world to double-sided.
  Now a dedicated `steelDarkVisor` clone.
- The community plaza's tensile canopy did the same to the shared `canvas`
  material. Now a clone.
- The debug material-freeze guard now exempts the renderer's own legitimate
  `.side` toggling on transparent double-sided materials, and dedupes so it
  can never grow unboundedly.

### Carried in from the v4 work-in-progress (committed first)

- Curb ramps and signal furniture placed from each edge's **as-built**
  geometry rather than the divergent spec cross-section (ramps had landed
  up to 12.8 m out in the grass on curved returns)
- Foliage wind shader guards `instanceMatrix` behind `USE_INSTANCING`
  (merged single trees failed shader compilation)
- Pointer-lock failures reported in the walk HUD instead of silently
  breaking mouse-look

---

## 3. Outstanding facts needed from Tanner

Unchanged from v4: the heritage markers carry visible `TODO_FACT`
placeholders instead of invented numbers.

| Where | What is needed |
|---|---|
| 5 timeline plinths | which cleanups, what year, what location |
| each plinth | volunteer count, material recovered (weight) |
| Recovered-material sculpture | total mass, source cleanup per component |
| Ocean/beach cleanup card | cadence per year, crew size, weight per cleanup |
| Untreated-stretch sign | date of last survey |

---

## 4. What was NOT met

- **The ≤700 draw-call budget at High.** 3,749 is half of v4 but still 5×
  the spec number. `renderer.info` counts every pass; with 3 shadow
  cascades and the AO prepass, ≤700 total means ~140 unique drawables —
  not reachable without full `BatchedMesh` conversion and per-cascade
  culling, which remains the next engineering step.
- **No GPU-measured frame rate.** The verification environment renders in
  software (SwiftShader); a 60 fps claim would be fabricated. The tier
  system and automatic step-down are implemented and running.
- **Raised sidewalks are still not walkable surfaces.** Curbs extrude at
  the correct 6 in reveal but the walker samples the terrain height field,
  so crossing a curb line produces no height change. A terrain/roads
  change, documented in the app README.
- **435 walk slope warnings** (advisory, not failures): path segments
  steeper than the 5% comfort figure on natural terrain.

---

## 5. How to work on it

```bash
cd seed-v5 && node tools/build.js        # production single file
node tools/shoot.js                      # headless gates + report
node tools/shoot.js --shots              # + screenshot sweep of all views
node tools/diag.js                       # draw-call census by material
```

URL flags: `?seed=N` · `?tier=ultra|high|balanced|mobile` · `?debug=1`
(G for the HUD) · `?audit=1` · `?fast=1` · `?tex=1024`.

Runtime hooks: `__seedTest()` · `__seedReport()` · `__seedStats()` ·
`__seedHash()` · `__seedTime('afternoon'|'night')` · `__seedView(i)` ·
`__seedWalk(x, z, heading)`.
