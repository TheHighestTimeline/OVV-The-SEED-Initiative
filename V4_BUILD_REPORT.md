# SEED Initiative Living Campus — v4 Build Report

**Built:** 2026-08-09
**Output:** `OVMG_SEED_3DCampusWorld_2026-08-09_v4.html` (872 KB, self-contained)
**Source:** `seed-v4/src/` (19 modules) · **Build:** `node seed-v4/tools/build.js`
**Engine:** three.js r170 (v3 used r128)

---

## 1. Verification results

Measured from the shipped file with `window.__seedTest()` on load. The default
build **throws on the first placement conflict**; it reached "ready", so every
number below is a real pass, not a suppressed warning.

| Gate | Result |
|---|---|
| Placement conflicts rejected during build | **0** |
| `auditWorld()` footprint re-check across the final registry | **0** |
| Scene-graph AABB sweep for volume intersections | **0** |
| Road graph problems (dead ends in grass, orphans, unreachable nodes) | **0** |
| Pedestrian reachability: 31 destinations × 5 sources | **0 failures** |
| Registered footprints validated | **7,647** |
| Deterministic rebuild (same seed → same scene hash) | pass |

**Content built:** 3,077 validated plantings · 792 luminaires · 88 houses ·
51 hotspot pins · 396k terrain triangles across 48 chunks · 18.6M triangles in
the full overview frame.

Everything that follows is honest about what was *not* met — see §5.

---

## 2. The v3 defects, and what happened to each

### The berm through the wall (headline defect)

v3 put the berm centreline at ±312 and the wall centreline at ±300 with a 38 m
berm base, so the 14 m wall was buried 4.7–7.3 m along its whole length and the
berm's inboard toe reached 5.5 m past the wall into the campus, swallowing
14.5 of the 15 m perimeter carriageway.

**v4 makes the failure inexpressible.** The berm is not a solid — it *is* the
terrain. `siteH()` computes a single perimeter offset `u(x,z)` from one
rounded-rectangle field, and the swale, the berm and the wall base are all
functions of `u` alone. The wall reads its base from the ground. Two things
derived from one scalar cannot cross.

Measured cross-section on the south axis, away from any gate:

```
u        y        feature
0        18.000   campus pad, dead flat
370      18.000   interior edge
374      18.000   perimeter sidewalk
385      18.000   perimeter ring road centreline
396      18.000   security fence
406.5    18.000   bioswale outer shoulder     ← 10.5 m setback (spec min 9.1)
415      16.800   bioswale invert, 1.2 m deep, 4:1
424      18.000   berm inner toe
469      30.000   BERM CREST + acoustic wall base
514      18.000   berm outer toe
```

Max berm face slope: **18.43°, i.e. exactly 3:1.** The first attempt came out at
32° because a smootherstep ramp peaks at 1.875× its average slope; real earthwork
batters are straight faces with rounded toe and crest, and that is now what
`batter()` generates.

### The other confirmed v3 defects

| v3 defect | v4 |
|---|---|
| 40+ interpenetrations, 3 spur roads through buildings | 0, enforced by `place()` |
| Perimeter "loop" with 20×70 m gaps at 4 corners | closed 10-edge ring with true 70 m corner returns |
| Both visitor lots marooned, no driveway | generated aprons with flare, radii, flush curb |
| 9 roads dead-ending in grass | 0; every terminus is a declared cul-de-sac, gate, dock or boundary |
| Truck docks facing the side with no road | `entryFace` / `serviceFace` declared per building |
| Community center: sealed drum, no door, silo through the roof, 2 paths through the middle | ring with glazed atrium courtyard, 2 real entrances, 5 visible program wedges, PV + green roof + clerestory |
| Roof slab swallowing the rooftop solar | parapet *ring*, membrane deck, roof allocator prevents plant/PV overlap |
| 3 greenhouse rotation bugs; opaque box hiding the interior | true 31° glazed slopes, ridge vent along the ridge, real modelled interior, headhouse |
| Reef tank 5 m through the aquaponics wall | inside the envelope, with a glazed viewing wall |
| Sidewalk score lines emitting 248 planes 500 m wide | joints sized to the walk, merged to one geometry per edge |
| No sRGB texture encoding | explicit `colorSpace` on every texture |
| Sky outside the tone-mapping chain (horizon seam) | sky writes linear HDR, `OutputPass` maps once |
| IBL = PMREM of an 8×64 gradient, never rebuilt at night | full sky render → PMREM, rebuilt on every time change |
| One 1,120-unit shadow frustum, `normalBias 0.9` | CSM, 1–4 cascades by tier, `normalBias 0.018` |
| Zero point/spot lights | 792 registered luminaires, pooled real `SpotLight`s |
| Shared-material mutation to DoubleSide | library frozen after build; variants are registered clones |
| Texture factories dropping the second repeat argument | `surface(name, repeatU, repeatV)` throws if either is missing |
| Ponds floating 0.48 m above grade | excavated bowls; verified below adjacent bank at every sampled point |
| Beyond-the-fence ignoring terrain (7.4 m in the air) | graded road corridors baked into `siteH` |
| 5 pins pointing at geometry that was never built | all built: agrivoltaics, solar carports + EV, bioswale, fence, rubberized roads |
| 20 of 45 hotspots filtered off | all 45 shown, plus 6 new Heritage entries |

---

## 3. New in v4

**Watershed corridor** (z 520–900): bioswale outfall with headwall, level
spreader and riprap apron; check-dam creek with riffle-pool sequence and woody
debris; three riparian planting bands with interpretive signs; water-quality
monitoring station with a public display board; overlook deck carrying the
honest scale marker *"Great Pee Dee River — 150 mi to the Atlantic. Shown
compressed."*

**Estuary** (900–1180): Spartina marsh on a real tidal platform cut by dendritic
creeks; oyster reef beds; living shoreline of oyster-bag sills, marsh plugs and
coir logs — no bulkhead, no riprap; research dock on piles.

**Tidal inlet:** cuts the dune line so the marsh, the creek and the ocean are one
connected body of water. Without it the estuary was a sealed basin.

**Dune and beach** (1250–1392): ridge with blowouts and a staggered sand fence;
elevated timber crossovers on piles; real beach profile; wrack line of shell
hash, weed and driftwood — with a deliberately **uncleaned stretch west of the
crossover and a cleared stretch east of it**, so the before/after is visible
rather than claimed.

**Ocean** (1392–3400): 6–8 Gerstner components, depth colour ramp,
Beer-Lambert absorption, fresnel sky reflection, shoreline foam from a depth
test, crest foam from the wave Jacobian, a breaking band at the bar, caustics in
the shallows, and subsurface scattering in the wave face at low sun.

**Cleanup fleet:** skimmer with an active collection boom on a slow loop, two
RIBs, a collection barge, a debris boom arc, seven monitoring buoys, and a shore
crew with a sorting station and weigh-in board.

**Heritage promenade:** five plinths along the dune crossover in chronological
order, walking seaward; a recovered-material sculpture at the dune crest; three
then/now marker pairs. Plus a new **Heritage** hotspot category (6 entries).

**Also new:** solar carports with EV chargers, the agrivoltaic array with grazing
sheep, the security fence (zoned secure/open), the gatehouse with separated
visitor and truck lanes, acoustic baffle returns at every gate, the childcare
centre (`b9`) and the community water treatment plant (`b5`) — both named in v3's
copy but never built.

---

## 4. Outstanding facts needed from you

The heritage markers are built and laid out, but they carry visible
`TODO_FACT` placeholders instead of numbers, in both the 3D plinths and the
hotspot cards. Nothing was invented.

| Where | What is needed |
|---|---|
| 5 timeline plinths | which cleanups, what year, what location — one per marker |
| each plinth | volunteer count |
| each plinth | material recovered (weight) |
| Recovered-material sculpture | total mass, and the source cleanup for each component |
| Ocean/beach cleanup card | cadence per year, crew size, recovered weight per cleanup |
| Untreated-stretch sign | date of last survey |

The last plinth is deliberately undated and blank, captioned *"next one"*.

---

## 5. What was NOT met

Stated plainly rather than papered over.

**Draw-call budget missed.** The spec set Ultra ≤ 900 / High ≤ 600 / Balanced
≤ 350. Actual: **5,154 at High** on the overview. `renderer.info.render.calls`
counts every pass, so each visible object is drawn once for colour, once per
shadow cascade, and again for the AO depth/normal prepass — with 3 cascades that
is a ~5× multiplier on ~820 unique meshes. The budget as written was not
achievable with cascaded shadows over a world this size. Fixing it properly means
`BatchedMesh` (r160+) and shadow-cascade culling, which is a v5 job.

**No GPU-measured frame rate.** The verification environment has no GPU; all
rendering was software (SwiftShader), so a 60 fps claim would be fabricated. The
tier system, the 60-frame startup benchmark and the automatic step-down are
implemented and run, but the fps target is unverified on real hardware.

**Terrain normal aliasing.** At long range the grass reads with a faint moiré.
Reduced substantially (normal influence 0.9 → 0.20, detail tiling 1.9 → 0.31
per metre, softened height field) but not eliminated. Needs a proper normal-map
mip strategy or a roughness-from-normal-variance term.

**Load time ~22 s** on a CPU-only machine: 9.2 s of that is procedural texture
generation. Already cut from 65 s (separable blur instead of O(R²), cache by
surface name rather than by name+tile, 512² maps, half-res ORM). Moving
generation to a Web Worker is the next step.

**Volumetric light shafts** (Ultra/High) — not implemented.
**Box-projected reflection probes** — not implemented; the PMREM environment is
used everywhere.
**Screen-space reflections on water** — declared in the Ultra tier but the water
shader uses fresnel sky reflection only.

---

## 5b. Post-ship fixes (same day)

Two defects found when Tanner reported roads and sidewalks looking absent:

**10. Every  ribbon had inverted triangle winding.** The winding was
hard-coded for a cross-section listed in decreasing lateral offset. Every
section listed left-to-right — carriageways, sidewalk slabs, lane markings,
subgrade, shoulders, boardwalk decks — therefore had a downward normal and was
backface-culled from above. Only 3D extrusions survived, so 14.4 km of road read
as a pair of thin curb lines on bare grass.  now derives the winding
from the sign of the section's net offset change.

**11. Image-based lighting was at intensity 1.0 against an unnormalised
physical sky.** Preetham returns radiance in arbitrary units, typically 1-20, so
ambient sky flooded every surface: dark asphalt and PV read as mid grey and the
whole scene lost contrast. Environment intensity is now 0.30 and the hemisphere
light drops from 0.52 to 0.14, since a real IBL already supplies the sky term.

## 6. Bugs found in v4's own code during verification

Worth recording, because the validator earned its place by catching them:

1. **The berm batter came out at 32°, not 18.4°** — smootherstep peaks at 1.875×
   its average slope. Replaced with a straight face and rounded toe/crest.
2. **Corner fillets were quadratic Béziers, not arcs** — a nominal 70 m return
   overshot by 4.2 m and pushed the ring road out through the fence.
3. **Fillet tangent length was clamped to 0.48 of both neighbouring segments** —
   which silently halved every ring corner radius. It is only half toward
   *another corner*; toward a path end it may use nearly the whole run.
4. **The spatial hash inserted by raw footprint but queried by the inflated one**
   — a clearance band could straddle a cell boundary, so a pair passed placement
   and then appeared in the audit. Three plantings did exactly that.
5. **`mergeStatic` was consuming `InstancedMesh`** (it extends `Mesh`), baking one
   instance and deleting the rest — the wrack line, oyster beds, sand fence, PV
   arrays and plantings were all silently being destroyed.
6. **The sky probe read a half-float target into a `Float32Array`**, returning
   zeros, so the fog colour was black — defeating the sky/fog matching that the
   probe existed for.
7. **Trees were scaled catastrophically** — canopy width and trunk radius were
   authored in metres and then multiplied by the instance height, giving a 30 m
   loblolly a 250 m canopy and a 9 m trunk.
8. **Perimeter paths sampled only the corner arcs**, so no vertex ever landed near
   a gate and the wall ran straight across every opening.
9. **The boot sequence awaited `requestAnimationFrame`**, which never fires in a
   background tab — the loader stalled forever there.

---

## 7. How to work on it

```bash
cd "seed-v4" && node tools/build.js          # production single file
```

```bash
cd "seed-v4" && node tools/build.js --dev    # unminified, for debugging
```

```bash
cd "seed-v4" && node tools/probe-terrain.js  # height-field structural probe
```

URL flags: `?seed=N` · `?tier=ultra|high|balanced|mobile` · `?debug=1` (press G
for the HUD) · `?audit=1` (collect every conflict instead of throwing on the
first) · `?fast=1` (coarse terrain, for quick iteration) · `?tex=1024`.

Runtime hooks: `__seedTest()` · `__seedReport()` · `__seedStats()` ·
`__seedHash()` · `__seedTime(h)` · `__seedView(i)`.

---

## 8. What v5 should do

1. `BatchedMesh` and per-cascade shadow culling to get draw calls into budget.
2. Texture generation in a Web Worker; ship the load under 5 s.
3. Real interiors for the community center wedges, visible through the glass.
4. Volumetric shafts, reflection probes, water SSR.
5. Replace every `TODO_FACT` with measured data.
6. A guided narrative mode: one continuous camera move with voiceover cues,
   built for a 90-second investor cut rather than free orbit.
