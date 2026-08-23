# OVV — The SEED Initiative

A real-time 3D browser world of the SEED Initiative campus at Bennettsville,
South Carolina, built to real-world dimensions. Three.js r170 + Vite.

**The app lives in [`seed-v5/`](seed-v5/) — see [its README](seed-v5/README.md)
for the full documentation.** `seed-v4/` is the previous generation, kept for
reference.

```bash
cd seed-v5
npm install
npm run dev
```

---

## What this is

Most 3D site models are drawn to look right. This one is built to real
published dimensions, and then checks itself.

The rule the project runs on: **no module outside `seed-v5/src/spec/` may write
a dimension as a bare number.** Standards are written in the units they are
published in and converted at the point of use, so the source document stays
legible in the code:

```js
revealVertical: IN(6.0),   // 6 in curb reveal      -> 0.1524 m
heightUrban:    FT(7.0),   // MUTCD 2A.18 mounting  -> 2.1336 m
```

Specified from MUTCD 11th ed., AASHTO Green Book 7th ed., PROWAG 2023,
IES RP-8-22, ADA 903, APBP, AWWA C502 and NFPA 24/291 — each value cited
inline at the point it is defined.

`auditSpec()` runs at boot and catches what inspection cannot: a solar array
too small for the luminaire it powers, a pole spacing outside the IES
uniformity envelope, an operable control outside the seated reach range, a
curb ramp whose run will not fit behind its own curb.

## In the world

- **Two time states** — a fixed afternoon with long soft shadows and a night
  where the lighting design shows: warm pools under the lamps, per-window
  lit patterns, the dark-sky eastern zone. Each state keeps its own baked
  environment map, so the toggle is a hard swap
- **798 solar street lights** — each carrying the PV array and battery its own
  luminaire needs, sized from a December energy balance for this latitude
- **15 signalised intersections**, 11 stop-controlled, **170 curb ramps** with
  PROWAG truncated domes — all placed by reading the road graph, so control
  cannot land in the wrong spot
- Signal timing **derived**, never typed: yellow change from the ITE kinematic
  equation, pedestrian clearance from crossing width at 3.5 ft/s
- **First-person walking** at a 1.591 m eye height — press `F`

7,264 registered footprints, zero placement conflicts, zero road-graph
problems, zero unreachable pedestrian destinations.

## Repository layout

| Path | |
|---|---|
| [`seed-v5/`](seed-v5/) | the Vite app — source, spec, build config |
| [`seed-v5/src/spec/`](seed-v5/src/spec/) | dimensional standards, with the self-audit |
| [`seed-v5/src/infra/`](seed-v5/src/infra/) | components built from those standards |
| [`V5_BUILD_REPORT.md`](V5_BUILD_REPORT.md) | the v5 build report |
| [`V4_BUILD_REPORT.md`](V4_BUILD_REPORT.md) | the v4 build report, including what was not met |
| [`seed-v4/`](seed-v4/) | the previous generation of the app |
| `OVMG_SEED_3DCampus_v3_Analysis_*.md` | the v3 defect analysis that drove v4 |
| `OVMG_SEED_3DCampusWorld_*.html` | legacy self-contained single-file builds |

## Deploying

`netlify.toml` at the repo root is configured — connect the repo and Netlify
runs `npm ci && npm run build` in `seed-v5/` and publishes `seed-v5/dist`.

## Known gaps

Stated plainly rather than papered over; the full list is in the
[app README](seed-v5/README.md#known-gaps).

The largest: **the world does not model raised sidewalks.** Curbs extrude at
the correct 6 in reveal, but the elevation ledger is a z-fighting stack rather
than a vertical model, so walking across a curb line produces no change in
walker height. Frame rate is also unverified on real GPU hardware — the
verification environment renders in software.
