> **Correction (2026-08-09):** the hotspot total is **45**, not 41. The per-category
> counts in this document were right; the total was mis-added. Corrected throughout.

# SEED Initiative Living Campus — v3 Full Analysis and v4 Direction

**File analyzed:** `OVMG_SEED_3DCampusWorld_20260724_v3.html` (788 KB, 3,313 lines; three.js r128 inlined at line 264, application code lines 1–263 and 265–3313)
**Date:** 2026-08-09
**Prepared for:** OneVibeMediaGroup, Inc.

---

## 0. Executive summary

v3 is not a bad file. The *architecture* underneath it is genuinely good — there is a road registry, a spatial hash, a single tree-validation gate, a re-audit pass and a seed-test harness. That skeleton is worth keeping verbatim in v4.

The problem is that **only the trees go through the validator.** Every road, building, mast, lamp, bench, flower bed, pond and berm is hand-placed with literal coordinates and nothing checks them against each other. The result is 40+ provable interpenetrations, three roads driven through buildings, a 14-metre acoustic wall buried inside its own berm and running down the centreline of all four perimeter roads, and two footpaths that tunnel straight through the community center.

On top of that, the render pipeline has no image-based lighting, no ambient occlusion, no post-processing, no texture colour management, and one 1,120-unit shadow frustum covering a 5,200-unit world. That is why it reads as "3D model" rather than "place."

Seven defects account for most of what your eye is catching:

| # | What you are seeing | Root cause |
|---|---|---|
| 1 | Berm phases through the wall | Berm centre at x=±312, wall centre at x=±300. Berm is 38 wide. The wall is buried 4.7–7.3 m in earth along its whole length. |
| 2 | Roads look wrong / disappear | The perimeter "loop" has 20×70 m gaps at all four corners. It is not a loop. |
| 3 | Not many walkways | Sidewalks exist only on the four perimeter roads + 3 short stubs. The plaza, greenhouses, ponds, parking and community center have no connected pedestrian network. |
| 4 | Community center makes no sense | It is a sealed 80 m opaque drum with no door, no windows that read, and a 32 m solid concrete silo growing through the roof. Two footpaths run through the middle of it. |
| 5 | Giant grey stripes across the site | A one-character bug in `sidewalk()` emits 248 concrete score-lines that are **500 m wide** instead of 4 m. |
| 6 | Roofs and solar look buried | Every roof has a solid `box(w+1.2, 1.7, d+1.2)` parapet cap over the *entire* roof plan. The rooftop solar sits half inside it. |
| 7 | Everything looks flat / plasticky | No sRGB texture encoding, no AO, no roughness maps, `normalBias 0.9` kills every contact shadow, and the "environment map" is an 8×64 pixel gradient. |

---

# PART 1 — COMPLETE INVENTORY OF WHAT IS IN v3

## 1.1 Interactive hotspots (the clickable pins)

The dataset holds **45 systems** across 9 categories. Only **21 are shown as pins** — the filter at line 447 drops Sound, Workforce and Beyond the Fence entirely, plus `e6` and three of the five Community entries.

### WATER — 5 (all live)
- **w1 · Closed loop cooling plant** — 99.5% drift captured, 0 process discharge, 5–15K gal/day condensate, 60% less potable draw
- **w2 · 500,000 gallon cistern** — 218M gal/yr rainfall on site, 21.8M gal/yr at 10% capture, ~0 discharge
- **w3 · Berm valley and bioswale belt** — 0 net runoff increase, 5 ac bioswale belt, 30 ft berm setback, permeable paving
- **w4 · Detention pond wetlands** — 3 ponds, 1.5 ac surface, 100-yr storm capacity, no-fishing habitat zones
- **w5 · Greenhouse and aquaponics loop** — 90–95% less water, ~1% daily loss, 0 antibiotics

### ENERGY — 6 (5 live; `e6` excluded from pins)
- **e1 · Rooftop solar** — ~40 MW rooftop DC, bifacial mono, 4.5 peak sun hrs/day, cool roof SR 0.65+
- **e2 · Agrivoltaic ground array** — ~15 MW ground mount, 8 ft clearance, pollinator understory
- **e3 · Carport solar and EV charging** — 8–12 MW carport DC, public charger access
- **e4 · Battery energy storage** — 8 hr community zone runtime, LiFePO4
- **e5 · Waste to energy plant** — 100 tons/day, ~80% county waste diverted, 2–3 MW, +$2.56M net/yr
- **e6 · Substation and microgrid** — 15 yr PPA, 10–15% local rate reduction target, islandable *(no pin)*

### CARBON — 5 (all live)
- **c1 · Carbon capture on exhaust** — 2–5K tons CO2e removed/yr, $25–50/ton, DAC on stack
- **c2 · Biochar production** — 1,000+ years stable, pyrolysis module
- **c3 · Carbon sequestering interiors** — mass timber, hempcrete, mycelium composite, 50–75 yr storage
- **c4 · Tree planting and native species** — 5,000 on site, 50,000 off site, 40% canopy target
- **c5 · Wildlife corridor** — 40 ac green zone, unlit eastern night zone, bird-safe fritted glass

### AIR — 4 (all live)
- **a1 · Emissions control and monitoring** — 80–90% NOx reduction, CEMS, below EPA MACT
- **a2 · Public air sensor network** — 12 sensors, 8 off-property, 7 pollutants, live dashboard
- **a3 · Living green walls** — 20–40% PM2.5 cut at wall face
- **a4 · Odor control and no idling** — negative hall pressure, biofilter, 200 ft no-idle boundary

### SOUND — 4 (**all hidden — no pins in v3**)
- **s1 · Six layer attenuation stack** — 4,000 LF wall, 15–20 ft tall, −25 to −40 dB roof panels
- **s2 · Infrasound monitoring array** — 1–20 Hz, 12 sensors, 6-mo pre-construction baseline
- **s3 · Neighbor window program** — $2,000/home, 0.5 mi radius, ~100 homes
- **s4 · Rubberized interior roads** — −6 to −10 dB tire noise

### INFRASTRUCTURE — 4 (all live)
- **i1 · Compute halls** — 4 halls, phased, cool roof + rooftop PV, waste heat recovered
- **i2 · Fiber and network spine** — diverse entry, community broadband pull-through, 150 public wifi nodes
- **i3 · Separated haul and access roads** — dedicated waste haul road, separate community entrance
- **i4 · Perimeter, security and access** — 24/7 zoned security, QR event registration, free Saturday tours

### COMMUNITY — 5 (**only 3 shown**: m1, m2, m3)
- **m1 · Community center** — free, 7 days, 4 third places (coffee house, maker space, teen center, senior hall), library branch, legal aid
- **m2 · Event plaza and stage** — 3 ac permeable plaza, 20×40 ft permanent stage, 400A service
- **m3 · Greenhouse network** — 53,000 sq ft, ~390K lbs produce/yr, waste-heat heated
- **m4 · Aquaponics and marine showcase** — 20,000 sq ft RAS, ~25K lbs fish, 5,000 gal reef tank *(no pin)*
- **m5 · Food hub and community kitchen** — $10–25/hr, first 20 hrs free, 1,000+ emergency meals/day *(no pin)*

### WORKFORCE — 3 (**all hidden — no pins in v3**)
- **k1 · Trades and vocational academy** — 16 training tracks, $10M/yr scholarship fund
- **k2 · Apprenticeship pipeline** — paid from week one, $0 tuition, local hire priority
- **k3 · Field training yard** — live systems training, on-site nursery, equipment pad

### BEYOND THE FENCE — 9 (**all hidden — no pins in v3**)
- **b1 · Road upgrades and smart signals** — 20 intersections, emergency preemption, USDOT RAISE funded
- **b2 · ADA sidewalk network** — 15 mi phase one, 40 mi full build, 5 ft min width
- **b3 · Solar street lighting** — 450 poles, 3+ days autonomy, $40.5K/yr municipal savings
- **b4 · Street tree canopy** — 7,000 trees, 40 miles, −5 to −8 °F under canopy
- **b5 · Community water treatment plant** — 0.5 MGD, 99%+ PFAS removal, ~5,000 people, 8 kiosks
- **b6 · Home solar and battery** — 300 homes phase one, $0 upfront, transfers at year 10
- **b7 · Microtransit shuttle** — 4 electric vans, free for residents, 6am–10pm Mon–Sat
- **b8 · Underground utility lines** — 10 mi target, 97% fewer storm outages, 75% FEMA cost share
- **b9 · Childcare and family support** — 10,000 seats, $2–5/day, 24 hr, $35–55M new taxable income

> **20 of your 45 stories are invisible in v3.** Every Sound, Workforce and Beyond-the-Fence pin is filtered off, and two of the best Community ones (marine showcase, food hub) are too.

## 1.2 Physical geometry actually built in the world

### Inside the fence — industrial
- 4 **compute halls**, 104 × 60 × 21 m, at x = −186, −62, 62, 186 / z = −220
- **Rooftop solar arrays** on all four halls (92 × 50 m each)
- **Meet-me / fiber building** (124, −146)
- **Turbine enclosure** with living-wall skin and wireframe trellis (−214, −100)
- **Cooling plant**: 4 cooling towers + fan assemblies (animated), z ≈ −106
- **Waste-to-energy plant**: main hall 84 × 66 × 28, secondary hall, biochar block, 2 exhaust stacks (71 m and 62 m), carbon-capture skids
- **Substation**: gravel yard 140 × 100, transformers, bushings, 3 lattice pylons (38 m)
- **BESS**: gravel pad 110 × 82, 12 battery containers, HVAC units
- **Cistern** (106, −56)
- 6 **perimeter instrument masts** with guy wires

### Inside the fence — living systems
- 4 **greenhouses**, gutter-connected gable glasshouses with interior benches, crops, grow-light bars
- **Aquaponics building** + 5,000 gal **marine showcase tank** (acrylic cylinder)
- **Food hub / community kitchen** with loading docks
- **Farm stand canopy**
- **3 detention ponds** (r = 30, 18, 21) + connecting channel + boardwalk
- **Boulder / rock clusters** (14)
- **Community garden plots** near greenhouses
- **Flower beds and planters** (5)

### Inside the fence — community
- **Community center**: 80 m glazed drum, clerestory, 26-sided roof disc, 32 m concrete core, 20-column colonnade, light halo ring
- **Event plaza**: 152 m paver disc, 4 inlay rings, permanent stage + 2 acoustic wing walls, 48 m canopy cone, string lights, 18 bollards
- **Unnamed plaza building** (132, 200) — blank box, no stated program
- **Workforce academy** + gravel training yard + 4 mock-up bays + pipe racks + 9 soil beds
- **Benches** (promenade), **picnic tables** (event lawn), **path lamps** with warm ground-glow pools

### Inside the fence — circulation
- Perimeter service road (4 segments, 15 m wide, **not closed at corners**)
- 4 spur roads (waste plant, substation, academy, water plant side)
- Community avenue + drop-off cul-de-sac
- Industrial service road (west loop → east loop)
- 4 dock stubs off the north road
- Entry drive from public road through the south gate
- **Gatehouse**: booth, barrier arm, 2 gate pillars
- 2 **visitor parking lots** (66 × 38 each, striped)
- Sidewalks: 4 perimeter + service road + avenue + entry drive + 3 stubs
- Crosswalks, lane arrows, street lamps
- 7 **footpath ribbons** (`PATHDEFS`) — promenade, pond loop, landing spurs

### Perimeter
- 5 **earth berms** (12 m high, 38 m base, 2,896 linear m)
- 5 **acoustic wall** segments (14 m tall, 3 m thick, 2,158 linear m) + caps
- Perimeter evergreen screen (planted at x/z = ±336, i.e. *outside* the berm)

### Beyond the fence
- **Public road** — 1,500 m of asphalt at z = 378, with centreline dashes, 2 sidewalks, meadow verge
- **2 signalised intersections** at x = −62 and x = +216 (crosswalk bars, signal masts, mast arms, heads, control cabinets)
- **62 solar street lamps** — 31 north row (z = 359), 31 south row (z = 397), each with PV panel, battery, light cone
- **24 houses** in two rows (z = 412 and z = 456), 17 with rooftop PV, each with a driveway
- **Utility corridor** — 760 m gravel strip with 26 vaults
- **Community water treatment plant** (272, 406) — 48 × 32 hall, 3 clarifiers, pipes, 4 control kiosks
- **Childcare and family centre** (178, 406) — 52 × 30 hall + entry canopy + play meadow
- **Transit shelter** (28, 398) + **electric shuttle** (−2, 388)
- **Street tree rows** along all three corridors
- 8 random distant meadow pads

### Environment
- Terrain plane 5,200 × 5,200 (148 × 148 segments, 35 m cells), height range −21 to +19
- Graded flat pad 700 × 760 over the campus
- Far horizon tree ring, radius 760 → 2,300 about (0, 40)
- Sky dome (procedural shader), linear fog, day/night switch
- Vegetation: canopy trees, pines, shrubs, berm screen, street trees, far trees — all instanced

### UI
- Loader, masthead, systems filter rail, 5 view presets (Overview / Compute core / Living systems / Community / Beyond the fence)
- Detail card with stats, rows, notes, tags, prev/next
- Golden hour / Night toggle, Community area toggle, Pins toggle, Quality toggle
- Orbit + pan + zoom-to-cursor + double-click fly-to, touch pinch, virtual joystick
- Debug overlay (`?debug=1` or press G), seed-test harness

---

# PART 2 — WHAT IS BROKEN

Every finding below was computed from the code, not eyeballed. Line numbers are relative to the application script (add 264 for the raw file).

## 2.1 The berm problem — exact numbers

```js
berm(650, 12, 38, 10, -312, 0, 0);   // west edge   → x ∈ [-331, -293]
[[-300, 0, 3, 624], ...]             // west wall    → x ∈ [-301.5, -298.5], 14 m tall
road(15, 500, -300, 20, 0, ...)      // west road    → x ∈ [-307.5, -292.5]
```

The berm's cross-section is a trapezoid: half-base 19, half-top 5, height 12. Surface height at horizontal offset *u* from the berm centreline:

> h(u) = 12 for u ≤ 5;  h(u) = 12·(19−u)/14 for 5 < u ≤ 19;  0 beyond

The wall centreline sits 12 m from the berm centreline, so:

| | |
|---|---|
| Berm surface height at the wall centreline | **6.00 m** |
| At the wall's inboard face | 7.29 m |
| Wall height | 14.0 m |
| **Wall buried in earth** | **4.7 – 7.3 m (≈43%)** |
| Berm toe reach past the wall, into the site | **5.5 m** |

That is your "phasing through the wall." It is not a rendering artifact — the two solids literally occupy the same space, and the berm's inboard toe continues 7 m past the wall centreline into the campus, where it swallows 14.5 of the 15 m perimeter carriageway.

**Three more berm faults:**
- **Length mismatch.** Berms are 650 m; walls are 624 m. The berm overshoots each wall end by 13 m.
- **Corners double up.** No mitres. West × North berms interpenetrate 32 × 32 m at 90°. Same at all four corners. Walls also produce a coincident 3 × 3 × 14 m box at each corner → z-fighting.
- **Slope is unbuildable.** 14 run over 12 rise = 1.17:1 (40.6°). Grassed embankments top out around 2:1; 3:1 is standard. And the berm carries zero planting — the "evergreen screen" is generated at ±336, five metres *outside* the outer toe.
- **Texture is 2,000× too fine.** Line 1320 multiplies the extrude UVs by 0.4, then `MAT.grass` applies repeat 60. Net: 0.042 m per texture tile on the berm vs 87 m on the lawn it rises out of. It renders as aliased noise and reads as a completely different material.

The berm also contradicts hotspot **w3**, which promises a 30-foot setback and a stormwater valley. The actual setback is **negative 7 metres**, there is no valley, no bioswale mesh, no check dams — and there is no fence object anywhere in the file.

## 2.2 Provable interpenetrations (40+)

**Roads through buildings**
| Road | Cuts through | Overlap |
|---|---|---|
| `road(120,13,-240,-238)` "to waste/energy plant" | **Compute Hall 1** | 58 × 13 m — and it terminates 160 m short of the plant, inside the hall |
| `road(120,13,240,-200)` "to substation" | **Compute Hall 4** | 58 × 13 m |
| `road(90,12,-252,150)` "to academy" | **Workforce Academy** | 55 × 12 m + a crosswalk painted inside the building |
| Industrial service road | **Meet-me / fiber building** | 50 × 6 m |
| `stub_fiber` | **Meet-me building** | the entire 12 × 26 stub is inside it |

**Building into building**
- WTE main × WTE secondary: 24 × 28 m
- WTE main × biochar block: 12 × 24 m
- WTE main × turbine enclosure: 25 × 5 m
- Aquaponics × marine showcase tank: the reef tank is 5 m inside the east wall
- Academy × pipe rack: 13 m of a 10 m rack is inside the building

**The west WTE building** at (−286, −44) manages to overlap **four things at once**: the west road (15 × 42), the acoustic wall, the west berm (buried 12 m — i.e. at full crest height), and the inner sidewalk.

**Yards and pads outside the property line**
- Substation gravel pad runs under the east berm, through the wall, and **3 m past the outer toe** — outside the site.
- BESS pad does the same, 14 m under the berm.
- **BESS containers sit in the east carriageway** (3.5 m of container in the road), and the service road cuts through the middle container row.
- Training yard pad slides 12 m under the community center drum.

**Poles, masts, stacks**
- 2 lattice pylons straddle the east wall — crossarms pass straight through it — with both legs planted 7.7 m inside the berm.
- 4 instrument masts buried 7.7–12 m in berms; 2 more standing in live roadways (one 4 m from the gate barrier arm).
- 6 street lamps at z = 313 are **entirely inside the south berm** — 9.5 m poles under 12 m of earth.
- 2 of 3 carbon-capture skids per stack sit inside the WTE hall; both stacks clip the hall's north wall.
- The plaza mast passes through the stage deck.

**Ponds**
- All three pond bowls sit at y = 0.05, **exactly coplanar** with the 560 × 120 paver slab → guaranteed z-fighting across every pond.
- Water discs float 0.48 m above surrounding grade with a flat-cut edge and no excavation.
- `PATHDEFS[2]` runs **6.6 m into pond 1** — a 5 m gravel path over open water, no bridge.
- Channel water sits 0.14 m *below* pond water — visible step at both ends.

**Props inside buildings** (nothing but trees goes through the validator)
- 2 flower beds, 1 bench and 2 path lamps are inside the community center drum
- 1 path lamp is inside the aquaponics building
- `boulder()` rejects ponds only — not buildings, roads, paths or parking lots
- The farm-stand canopy is built on top of the food hub's loading dock and its posts block the dock doors

## 2.3 Roads and walkways

**The perimeter loop is not a loop.** There are no corner segments:

| Corner | Gap |
|---|---|
| NW | 20 × 70 m |
| NE | 20 × 70 m |
| SW | 20 × 30 m |
| SE | 20 × 30 m |

Worse, the code registers 26 × 26 m "intersection" tree keep-outs at all four corners — **for pavement that does not exist** — so the only effect is four bare holes in the tree cover.

**Nine roads and walks dead-end in grass**, including all four spurs (three of which end inside buildings).

**These destinations have no vehicle access at all:** all 4 greenhouses, aquaponics, marine showcase, food hub, farm stand, community center, event plaza and stage (no load-in for a permanent venue), training yard, the entire waste-to-energy plant, the cistern, and **both visitor parking lots**.

> The two striped 66 × 38 m parking lots have **no driveway**. Nearest pavement is 11.5 m of lawn to the south road, or 24.5 m to the avenue. No curb cut, no apron, nothing.

**Every truck dock faces the wrong way.** `building()` hard-codes the loading apron on the +Z face and the entry canopy on −Z. The compute halls carry `docks: 2`, putting their docks on the campus side at z ≈ −182, while the dock stub roads and concrete yards are on the *north* side. Same error at the WTE plant and the food hub.

**Sidewalk coverage is perimeter-only** — the four loop roads (inner side, open at the corners), the service road, the avenue, the entry drive, and three orphan stubs. Nothing serves the compute core, the industrial zone, the greenhouses, the plaza, the community buildings, or the ponds. Those depend on 7 footpath curves, two of which run through buildings.

**And the sidewalk code has three bugs:**
1. **Score lines are 500 m wide.** `PlaneGeometry(horiz?0.1:d, ...)` — for north-south walks the first argument becomes the walk's *length*. `sidewalk(4, 500, -291, 20)` emits 125 planes each 500 m across. With the east walk that is **248 giant grey stripes** slicing the whole campus at y = 0.115.
2. **A new material per score line** → ~771 unmergeable meshes and 771 unique materials, plus 69 road dashes and 20 crosswalk bars. ≈**860 permanent extra draw calls**, all also rasterised into the shadow map every frame.
3. **One pre-scaled material for every sidewalk** regardless of size — the 4 × 500 m walks get 40 texture repeats across their 4 m width and 1 along their 500 m length.

## 2.4 The community center — why it makes no sense

What is actually built at (−84, 174):

| Element | Geometry |
|---|---|
| Drum | open cylinder R 40, h 13, `MAT.glazing` |
| Inner | **opaque** cylinder R 39.4, `MAT.dark` |
| Clerestory | ring R 40.3, h 2.4, warm emissive |
| Roof | disc R 49→47, h 1.9, at y 13.05 |
| Core | **solid concrete cylinder R 16, h 21** |
| Crown | R 16.6 cap |
| Halo | glowing torus R 48 |
| 20 columns | R 0.55, h 13.6 at radius 46.6 |
| Apron | paver disc R 56 |

**The problems, in order of severity:**

1. **There is no entrance.** No door, no opening, no vestibule, no steps, no ramp, no canopy, no signage. It is a continuous 251 m sealed ring.
2. **The glazing is not glass.** `MAT.glazing` has no `transparent` and no `opacity` — it is fully opaque. So the inner dark cylinder is redundant, and the building has no visible windows at ground level and no interior.
3. **The core is incoherent.** A 32 m-diameter, 21 m-tall solid concrete cylinder is hidden below y=13 inside the opaque drum, so all you see is a windowless silo bursting 6 m through the roof under a plain flat cap. No lantern, no glazing, no articulation.
4. **The colonnade doesn't work.** 20 columns at 14.6 m centres carrying a 2.4 m cantilever; each column punches 0.45 m up through the soffit into the roof slab. The clerestory sits 0.25 m below the soffit under a 9 m overhang — permanently in shadow, never visible.
5. **Two footpaths tunnel through it.** `PATHDEFS[0]` and `PATHDEFS[1]` both use (−84, 174) — the building's exact centre — as a path node. Two paved ribbons render straight through the drum and out the far side.
6. **Furniture inside the building:** two flower beds, a bench, two path lamps and a ground-glow decal.
7. **The training yard slides 12 m underneath it.**
8. **No vehicle access.** Nearest pavement is the cul-de-sac, 87 m away across grass. The academy spur stops 27 m short of the apron and doesn't connect.
9. **The tree ring is a Lissajous, not a ring** — `cos(i)` against `sin(i*1.7)` at different frequencies, then filtered by a ±55 keep-out, which collapses 26 trees into four clumps on the cardinal axes.
10. **The apron is invisible** — a paver disc 4 cm above an identical paver slab.

**And the plaza next to it is no better:**
- The plaza disc sits on the *same* paver slab, so it has no edge — the whole community zone is already paved.
- A **48 m open cone floats over a 28 × 14 m stage on a single mast** that passes through the stage deck.
- **String lights terminate in mid-air** — arcs run from k/8 to (k+1.5)/8 of a circle while poles only exist at the k/8 end, so every catenary overshoots the next pole by half a sector.
- `can.material = MAT.stoneTrim; can.material.side = DoubleSide` **mutates the shared material globally** — every curb, cap, column, bench, ridge and post in the entire scene renders back faces from that one line. (Line 1615 does the same to `MAT.metal`.)
- An unnamed blank 28 × 15 × 8.5 box straddles the plaza edge with no program, no entry, no dock.
- 18 bollards form a **closed ring with no gap** for the avenue, the cul-de-sac or any path.

**Zone relationships are broken too.** Greenhouse doors face z = +82; the nearest path node is 68 m of unwalked grass away. Plaza-to-parking: no connection. Plaza-to-cul-de-sac: no walkway. Plaza-to-community-center: 150 m of identical paving with no defined route.

## 2.5 Floating, sinking and stub geometry

**Nothing in the beyond-the-fence module samples the terrain.** `padB()` plants planes at a fixed y. Measured terrain under the public road:

| Point | terrainH | Road plane |
|---|---|---|
| (−750, 378) | **+3.38** | 0.12 → **buried 3.3 m** |
| (0, 378) | 0.00 | 0.12 → correct |
| (+600, 378) | −5.43 | 0.12 → **floating 5.5 m** |
| (+750, 378) | **−7.31** | 0.12 → **floating 7.4 m** |

But the lamps, houses and street trees on that same corridor *do* call `terrainH` — so at the east end the road plane hangs 7 m in the air while its own lamps sit 9 m below it. The 8 random meadow pads sit in terrain ranging −21 to +19; most are underground or in mid-air.

**Every roof is a solid slab.** `cap = box(w+1.2, 1.7, d+1.2)` at y = h+0.85 covers the entire roof plan, so:
- the roof deck plane (h+0.02) is permanently inside it — the roof texture never renders
- rooftop mechanical units are buried ~1.5 m
- **the rooftop solar is half inside a stone slab** (cap spans y 21.0–22.7; panels span y 21.65–23.55), and panel legs run 1.8 m *below* the roof deck into the building core

That kills the single most-promoted feature on the campus: *"Every square foot of roof on this campus is generating."*

**Every greenhouse interior is invisible.** An opaque `back` box spanning y 1.4–7.4 is added inside each house, and then benches, legs, crops and grow-light bars are instanced *inside* that box. 100% of the interior detail is hidden — and the backdrop protrudes 2 m above the eave line, so a black block is visible through the translucent roof.

**Three rotation bugs in `greenhouse()`:**
- Ridge vents: `rotation.x = 0.5` after `rotation.y = π/2` gives XYZ-order composition, so each "vent" becomes an **89.6 m dark plane tilted 29°, running from y ≈ −13 (underground) to y ≈ +30** (well above the 9 m ridge). Twelve of them.
- Rafters render as **vertical 7 m posts** poking 1.7 m above the ridge cap. ~138 per house × 4.
- Glazed slopes are at **59° instead of 31°** (X and Y swapped in the `atan2`), leaving a **1.2 m open gap at every eave** and a spike above every ridge.

**Placeholder geometry where a real structure is implied:** the turbine "trellis" is a `wireframe: true` box (6 quads with diagonals); the "living wall" is a single green box that — because it inherits the wind-animated shrub material — **sways ±0.45 m every frame, as a building**; substation transformers have no fencing, busbar or gantry and no connection to the pylons 60 m away; the cul-de-sac island is a green decal painted on a solid asphalt disc; parking curbs are 1.5 cm *under* the asphalt and the lot is drawn twice.

**Pins pointing at empty grass:** `e2` agrivoltaics (no ground-mount solar exists — `solarField()` is only ever called for the four hall roofs), `e3` carport solar and EV charging (**no carports and no chargers anywhere**), `w3` berm valley (no swale, and the pin sits inside the west carriageway), `s4` rubberized roads (no road within 130 m), `i4` perimeter security (**no fence geometry exists in the entire file**).

**Walk mode is retired but fully present** — ~120 lines plus DOM and CSS, all unreachable. `COLLIDERS` is populated and never read. `camera.near = 0.6` exists only for a 1.75 m eye height that can never be reached, and is costing ~8× depth precision.

## 2.6 Why it doesn't look real

**Colour management is broken.** `renderer.outputEncoding = sRGBEncoding` is set, but **not one texture is ever given `encoding = sRGBEncoding`**. All 16 procedural albedo canvases are decoded as linear data and re-encoded on output — everything textured is washed out and desaturated, and it lives in a different colour space from the flat-colour materials.

**The sky is outside the tone-mapping chain.** The sky `ShaderMaterial` has no `<tonemapping_fragment>` and no `<encodings_fragment>` include, so it writes raw colour to the framebuffer while every lit surface goes through ACES → sRGB. Concretely: fog `#B9C0CC` lands on screen at ≈`#D2D6DC` (cool grey) while the sky horizon lands at exactly `#E8C79A` (warm sand). **Distant terrain fades to cold grey against a warm sky.** That is a structural horizon seam, not a tuning problem.

**There is no image-based lighting.** `scene.environment` is a PMREM of an **8 × 64 pixel, 5-stop vertical gradient** plus one emissive blob. Glass at `roughness 0.06` mirroring a gradient *is* a gradient — hence flat plastic. And the environment is **never rebuilt at night**, so after dark every metal and glass surface still reflects a daytime blue sky at 1.28 exposure.

**No post-processing at all.** Zero hits for `EffectComposer`, `SSAO`, `Bloom`, `RenderPass`. `renderer.render(scene, camera)` is the whole pipeline. No AO means buildings meet the ground with no darkening and no contact.

**Shadows are one frustum over a world 4.6× larger.** A single 1,120 × 1,120 ortho camera at 3072² = 0.365 m per texel (1.09 m on "fast"). It re-centres on the orbit target every frame, so anything more than 560 m away casts and receives nothing — from the overview camera the compute halls and the whole beyond-the-fence strip are shadowless — and texels swim under static geometry because there is no snapping. `sun.shadow.autoUpdate` is never disabled, so the full 3072² depth buffer is re-rasterised every frame.

**`normalBias = 0.9` destroys every contact shadow.** That is 0.9 *world units* of offset. Anything under ~2 m — benches, bollards, curbs, road markings, picnic tables, lamp bases — loses ground contact and peter-pans.

**Materials are colour + one correlated normal map, nothing else.** Zero hits for `aoMap`, `roughnessMap`, `metalnessMap`, `displacementMap`. Where a normal map exists it is derived from the *same* drawing as the albedo, so it carries no independent surface information. `MAT.stoneTrim` — the most-used material in the scene, on every curb, cap, column, bench, ridge, post and fan blade — is a flat light grey with no maps at all. That is the dominant plastic read in the frame.

**Texel densities are all over the place:**

| Surface | Metres per texture tile |
|---|---|
| Terrain plane | **87 m** (≈3 px/m — a green blur) |
| Campus grass pad | 11.7 m (same material, 7.4× mismatch, 2 cm apart → tiling seam + z-fighting) |
| **Berm faces** | **0.042 m** |
| Paver plaza slab | 21.5 m |
| Path ribbons | ≈1.6 m |

**Foliage sways but its shadows don't** — `windify` uses `onBeforeCompile` with no `customDepthMaterial`, so the depth pass renders the static pose.

**Night mode has zero lights.** There is not a single `PointLight` or `SpotLight` in the file. The "light pools" are pre-baked radial-gradient quads laid flat on the ground, so they wash straight across curbs, water and building walls, and one of them is inside the community center. Every window in the campus lights at the same intensity at the same instant, because they share one material.

**Water** is an opaque-ish standard material with an animated normal offset — no reflection, no refraction, no depth transparency, no shoreline fade, no foam, and a polar UV singularity at the centre of every pond.

**Z-fighting is systemic.** `near 0.6` / `far 12000` gives ~0.088-unit depth resolution at overview range, while ground decals are separated by 0.005–0.06 units. Only two pads have `polygonOffset`. And `mergeStatic` **drops `renderOrder`**, silently undoing the one fix that was in place.

---

# PART 3 — v4 DIRECTION

## 3.1 The three approved decisions

1. **Ocean framing: watershed continuum.** Bennettsville sits in the Yadkin–Pee Dee basin. The Great Pee Dee flows southeast and empties into Winyah Bay near Georgetown, then the Atlantic. So the world gets a continuous water ribbon: campus stormwater → bioswale → detention wetland → creek → Great Pee Dee → estuary → beach → open ocean. Rendered compressed with a clear scale marker, this is geographically true and it is the strongest version of the argument: *every drop that leaves this site ends up there, so we own it all the way down.*
2. **Structure: modular source, single-file output.** ~14 JS modules plus a build script that inlines everything into one self-contained `.html`. Maintainable for v5, still one file to email.
3. **Fidelity: high-end real-time.** Cascaded shadow maps, GTAO, real PBR maps, bloom, TAA, screen-space water, 4 quality tiers down to mobile. Target 60 fps on a decent laptop.

## 3.2 New content outside the fence

### The Watershed Corridor (new zone, z = 500 → 1,100)
- Bioswale outfall from the berm valley → a **check-dam creek** with riffles, cobble, native plantings
- **Riparian buffer** planting bands with species markers
- A **water-quality monitoring station** — the same public-dashboard hardware as the on-site sensors
- Interpretive **trail with signage nodes** along the creek
- A **scale marker** in the world: "Great Pee Dee River — 150 mi to the Atlantic, shown compressed"

### The Estuary and Beach (new zone, z = 1,100 → 1,700)
- Tidal marsh with **Spartina flats**, oyster reef beds, tidal creek fingers
- **Living shoreline** restoration — oyster bag sills, marsh grass plugs, no bulkhead
- **Dune line** with sea oats, sand fence, boardwalk crossings on pilings (elevated, not on grade)
- **Beach** with real wet/dry sand transition, wrack line, shell hash
- **Cleanup staging pavilion** — bins for sorted recovered material, a rinse station, a bin-weight board that shows live totals

### The Ocean (z = 1,700 → 3,500)
- Proper water: screen-space reflections, depth-based colour ramp, refraction, foam at the shoreline, animated swell with wave-set crossing
- **Breaking surf** at the bar, whitewater on the beach face
- **Cleanup fleet**: a skimmer vessel, two RIBs, a debris boom arc, a collection barge
- **Buoy line** for the monitoring array
- Optional: a **reef ball / artificial reef** field visible under clear water

### Heritage — "We didn't start at the fence line"
This is the emotional core of the new zone and it needs a dedicated treatment, not a pin.

- A **timeline promenade** along the dune boardwalk: bronze-style markers, one per past cleanup, each with year, location, volunteers, pounds recovered. Walking from the campus toward the water walks you forward through OVMG's history.
- A **recovered-material sculpture** at the dune crest, built from what was pulled out of the water — the visual anchor of the zone.
- A **"then / now" pin** that pairs a past cleanup with the campus program it grew into (Carbon Sponge → carbon capture; festival waste diversion → the waste-to-energy plant; volunteer cleanup crews → the trades academy).
- Copy line to build the section around, in your voice:
  > *"We were pulling things out of the water long before we had a site to build on. The cleanups did not stop when the campus started. They are the reason it looks like this."*

> **I need your numbers for this section.** The project files document Carbon Sponge and the carbon-negative festival origin, but not the cleanup history itself. To write the markers I need: which cleanups, what years, where, roughly how many volunteers, and roughly how much material recovered. Until you send those, the build prompt writes the markers with clearly-flagged `TODO_FACT` placeholders rather than inventing numbers — which matters, because your own claim-discipline rules say no number goes in a public asset without measured data behind it.

### Other additions that fix the "pins pointing at grass" problem
Build the geometry the existing 45 hotspots already promise:
- **Agrivoltaic ground array** with 8 ft clearance, pollinator understory and grazing sheep (`e2`)
- **Solar carports with EV chargers** over both parking lots (`e3`)
- **The actual fence line** — it is referenced by `i4` and does not exist (`i4`)
- **Bioswale belt** in the berm valley with check dams and native grasses (`w3`)
- **Rubberized asphalt** as a distinct material on interior roads (`s4`)
- Turn all 20 hidden pins back on, grouped so the map stays readable

## 3.3 What to keep from v3

Do not throw this away — it is the good part:
- The road registry (`regSeg` / `regRect` / `regPolyline` / `distToSeg` / `curve2`)
- The spatial hash and `isValidTreePosition` gate
- `auditTrees` — the re-check against the complete registry after everything is placed
- `window.__seedTest` — the seed-regression harness
- The debug overlay
- The hotspot dataset and the card UI
- The day/night structure and quality tiers
- The deterministic `rnd()` seed

**The single biggest change in v4 is to make every object go through the validator, not just trees.**

---

## Sources

- [Pee Dee River — South Carolina Encyclopedia](https://www.scencyclopedia.org/sce/entries/pee-dee-river/)
- [Yadkin–Pee Dee River Basin — Wikipedia](https://en.wikipedia.org/wiki/Yadkin%E2%80%93Pee_Dee_River_Basin)
- [Watershed Conditions: Pee Dee River Basin — SC DNR](https://www.dnr.sc.gov/water/hydro/HydroPubs/assessment/SCWA_Ch_5.pdf)
- [Bennettsville, South Carolina — Wikipedia](https://en.wikipedia.org/wiki/Bennettsville,_South_Carolina)
