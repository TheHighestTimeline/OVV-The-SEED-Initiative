# Scanned materials

Drop one directory per material here. Anything present overrides the
procedurally generated surface of the same name; anything absent leaves that
surface generated. The world builds either way — this directory can be empty.

## Layout

```
public/assets/materials/<set>/color.jpg      albedo, sRGB          (required)
public/assets/materials/<set>/normal.jpg     tangent normal, +Y up (optional)
public/assets/materials/<set>/roughness.jpg  linear greyscale      (required)
public/assets/materials/<set>/ao.jpg         linear greyscale      (optional)
```

These are exactly the maps ambientCG ships as **Color**, **NormalGL**,
**Roughness** and **AmbientOcclusion** — a downloaded set needs renaming and
nothing else. Take **NormalGL**, not NormalDX: three.js is OpenGL convention
and a DirectX normal map inverts the green channel, which lights every bump
as a dent.

2K is the right size. 4K quadruples the download for detail nobody sees at
1.6 m eye height, and 1K shows its tiling on a road.

## The sets this world looks for

| Directory | Replaces | Suggested ambientCG source |
|---|---|---|
| `asphalt/` | carriageway | Asphalt026 |
| `asphalt-worn/` | worn carriageway | Asphalt014 |
| `asphalt-rubber/` | rubberised interior roads | Asphalt023 |
| `concrete-walk/` | sidewalks | Concrete042 |
| `concrete-curb/` | curbs, precast, plinths | Concrete033 |
| `paving-stones/` | plaza and promenade | PavingStones131 |
| `gravel/` | park paths | Gravel023 |
| `metal-panel/` | panel walls | Metal046 |
| `roof-seam/` | standing-seam roofs | Metal032 |
| `timber-deck/` | boardwalk and decking | WoodFloor041 |

All ambientCG material scans are CC0 — no attribution required, commercial use
fine. Verify the licence on each page before shipping; CC0 is their default
but it is worth the ten seconds.

## index.json

The runtime probes `index.json` once and only requests the sets it lists, so a
world with no textures costs a single 404 instead of one per map.
`tools/fetch-assets.js` rewrites it from what is on disk. **If you assemble
this directory by hand, write it too:**

```json
{ "sets": ["asphalt", "concrete-walk", "paving-stones"] }
```

A set missing from `index.json` is never loaded, however complete it looks on
disk.

## Fetching them

Once `ambientcg.com` is reachable from the build environment:

```bash
node tools/fetch-assets.js          # all sets listed above
node tools/fetch-assets.js asphalt  # just one
```

## A tradeoff worth knowing

`npm run build:standalone` inlines everything into one HTML file. Real texture
sets are megabytes, and base64 inflates them by a third — with a full set of
2K scans that single file stops being practical. The multi-file `npm run build`
output that Netlify publishes is the better target once these exist: the
browser fetches textures in parallel and caches them across visits, which the
single-file build cannot do.
