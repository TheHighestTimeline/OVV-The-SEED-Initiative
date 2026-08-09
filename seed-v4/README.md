# SEED Initiative — Living Campus (v5)

A real-time 3D model of the SEED Initiative campus at Bennettsville, South
Carolina, built to real-world dimensions. Three.js r170, Vite, no runtime
dependencies beyond three.

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # -> dist/, what Netlify publishes
```

```bash
npm run build:standalone   # -> dist/*.html, one self-contained file
```

---

## The rule this project runs on

**No module outside `src/spec/` may write a dimension as a bare number.**

If a curb is 6 inches, that fact lives in `src/spec/street.js` and every
consumer imports it. This is not tidiness. A dimension used in three places
drifts in two of them, and drifted dimensions are what make a modelled street
read as fake even when nobody can say why.

Standards are written in the units they are published in and converted at the
point of use:

```js
import { IN, FT } from './spec/units.js';
revealVertical: IN(6.0),      // reads as six inches, evaluates to 0.1524 m
heightUrban:    FT(7.0),      // MUTCD 2A.18 mounting height
```

### What is specified, and from where

| File | Covers | Source |
|---|---|---|
| `spec/units.js` | in/ft/mph/gal conversion, dual formatting | — |
| `spec/human.js` | stature, eye height, reach, gait, step height | CDC/NCHS NHANES, Pheasant |
| `spec/street.js` | lanes, curbs, sidewalks, crosswalks, markings, drainage | AASHTO Green Book 7th ed., MUTCD 11th ed., NACTO |
| `spec/signage.js` | sign shapes, sizes, colours, mounting, posts | MUTCD 11th ed. Tables 2B-1, 2C-2, 2D-1; §2A.18 |
| `spec/signals.js` | signal heads, mast arms, ped signals, APS, timing | MUTCD Part 4, ITE kinematic equation |
| `spec/lighting.js` | mounting heights, spacing, dark-sky, **solar sizing** | IES RP-8-22, AASHTO RDG, IDA MLO |
| `spec/accessibility.js` | curb ramps, truncated domes, transit stops | PROWAG 2023 final rule |
| `spec/furniture.js` | bins, benches, racks, bollards, hydrants, tree pits | ADA 903, APBP, AWWA C502, NFPA 24/291 |

Sizes are transcribed from these standards from working knowledge, not from a
licensed copy of each document. They are correct to the best of that
knowledge and are individually cited in the comments so any one of them can be
checked against the source. Sign legends use a condensed sans at the correct
cap height rather than the FHWA Series typeface, which is not redistributable
— the sizes and spacing are right, the letterforms are an approximation, and
that is noted in `infra/sign.js`.

---

## The spec audits itself

`auditSpec()` runs at boot and in the console via `__seedSpec()`. It catches
the class of error that is invisible by inspection:

- a solar array too small for the luminaire it powers
- a pole spacing outside the IES uniformity envelope
- an operable control outside the seated reach range
- a curb ramp whose run will not fit behind its own curb
- truncated domes outside the PROWAG R305 pitch
- bollards spaced too tightly to pass a wheelchair

It found real errors during construction. The first version sized one solar
kit for the 60 W local luminaire and then hung it on the 120 W arterial pole,
where it was short by a factor of two; the fix was to *derive* the kit from
the load (`solarKit()`), so it cannot drift again. It also caught a pathway
pole spacing at 4.3× mounting height, which would have left dark pools between
poles.

### Solar sizing is a calculation, not a decoration

Every street light carries the PV array and battery its own luminaire needs,
sized for this latitude from a December energy balance — the worst month for a
dusk-to-dawn load. The derivation is written out in `spec/lighting.js`.

| Class | Luminaire | Array | Battery | December margin |
|---|---|---|---|---|
| arterial | 120 W | 2 × 320 W | 7680 Wh | +7% |
| collector | 90 W | 1 × 450 W | 5120 Wh | 0% |
| local | 60 W | 1 × 320 W | 3840 Wh | +7% |
| pathway | 25 W | 1 × 320 W | 1280 Wh | +156% |

---

## Walking mode

Press **F**, or the Walk chip. The camera drops to an eye at **1.591 m**
(0.936 × a 1.70 m stature), walks at 1.4 m/s, runs at 3.5 m/s, and steps up
anything under a 7 in riser without slowing.

`WASD` move · `Shift` run · `C` crouch · `Space` step up · `Esc` exit

This is the honest test of everything above. The overview camera forgives a
curb at the wrong height or a sign mounted too low; standing on the sidewalk
does not.

Colliders come from the placement **registry**, not the scene graph — the
optimisation pass merges meshes by material and dissolves the per-building
objects, so harvesting the graph after it found ten structures in a campus of
eighty-eight houses.

---

## Traffic control

`18-intersections.js` reads the road graph rather than a list of positions, so
control cannot be placed in the wrong spot and a new road cannot be added
without its control appearing. Every node of degree ≥ 3 is furnished:

- **signalised** where any approach is an arterial or collector — mast arm per
  approach, two through faces plus a near-side face, pedestrian heads, APS
  buttons at 42 in
- **all-way stop** at a four-way of local streets
- **two-way stop** on the minor approaches of a T or unequal junction
- **curb ramps at every corner regardless**, because a crossing without a ramp
  is not a crossing

Signal timing is derived, never typed: the yellow change from the ITE
kinematic equation, the pedestrian clearance from the crossing width at
3.5 ft/s. Widen an intersection and its walk phase lengthens on its own. Each
intersection runs on its own cycle offset, so the campus does not change phase
in lockstep.

Current world: **15 signalised, 11 stop-controlled, 170 curb ramps, 798 solar
street lights**.

---

## Deploying

`netlify.toml` is configured. Connect the repo and Netlify will run
`npm ci && npm run build` in `seed-v4/` and publish `dist/`. Hashed assets are
cached immutably; `index.html` is not cached, so a deploy never serves stale
asset references.

---

## Runtime hooks

`__seedReport()` · `__seedSpec()` · `__seedStats()` · `__seedHash()` ·
`__seedTest()` · `__seedTime(h)` · `__seedView(i)` · `__seedWalk(x, z, heading)` ·
`__seedPlayer()`

URL flags: `?seed=N` · `?tier=ultra|high|balanced|mobile` · `?debug=1` (G for
the HUD) · `?audit=1` · `?fast=1` · `?tex=1024`

---

## Known gaps

### The world does not model raised sidewalks (found by walking it)

This is the most visible one at eye height, and it is a real defect rather
than a missing polish pass.

Curbs are extruded at 0.15–0.16 m, which is the correct 6 in reveal. But the
sidewalk slab is drawn at `ELEV.concreteWalk` = 0.138 m and the carriageway at
`ELEV.asphalt` = 0.055 m, and that ledger is a z-fighting stack — a set of tiny
offsets that stop coplanar surfaces flickering — not a vertical model. So the
walk sits 83 mm above the road, while the curb between them stands 160 mm
proud of both. The sidewalk is effectively at grade with the street with a lip
running along it.

The player walks on `groundH()`, the terrain height field, which knows about
none of it. Measured by walking perpendicular across an arterial curb line:

```
lat 14.18 m  y 23.411     (behind the walk)
lat 11.45 m  y 23.411     (crossing the curb face)
lat  5.15 m  y 23.411     (in the carriageway)
yRange 0.000
```

The step-up logic itself works — it is verified against building colliders,
where the player stops at the wall face and slides along it. Curbs simply are
not walkable surfaces.

Fixing it properly means giving the world a real walking-surface height, either
by baking the walk elevation into the height field in `01-terrain.js` or by
rasterising the road and walk ribbons into a surface-height grid the player
samples alongside `groundH()`. Both are a terrain/roads change, not a player
change, which is why it was not bolted onto the controller.

### Road classes still carry their own dimension literals

`ROAD_CLASS` in `05-roads.js` declares `width`, `curbH`, `curbW` and `verge` as
numbers typed in place (`curbH: 0.16`, `width: 9.5`). These predate the spec and
happen to be close to it — 0.16 against the specified 0.1524 — but they are a
second source of truth for the same dimensions and should be reading from
`spec/street.js`. `crossSection()` exists to replace them and is currently used
only by the new intersection code.

### Carried forward from the v4 build report

- **Draw calls are over budget.** The spec set Ultra ≤ 900; the real number is
  in the thousands. `renderer.info` counts every pass, so each object is drawn
  once for colour, once per shadow cascade and again for the AO prepass. Fixing
  it properly needs `BatchedMesh` and per-cascade shadow culling.
- **No GPU-measured frame rate.** Verification here ran without a compositing
  browser pane, so a fps claim would be fabricated. The tier system and
  automatic step-down are implemented but the 60 fps target is unverified on
  real hardware.
- Load time is roughly 20–40 s, most of it procedural texture generation.
  Moving that to a Web Worker is the next real win.
- Volumetric shafts, reflection probes and water SSR are declared in the Ultra
  tier but not implemented.
- Heritage markers still carry `TODO_FACT` placeholders; see the v4 report.
