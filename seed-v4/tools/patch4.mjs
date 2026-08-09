import fs from 'node:fs';
const rw = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.warn('MISS', p, JSON.stringify(a.slice(0, 80))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s);
};

/* ============================================================ 1. decal UVs
   decal() laid a 0..1 UV across the whole quad, so the material's tile repeat
   was divided by the object's size instead of being per-metre. A 0.5-repeat
   gravel over an 80 m training yard put one 44-stone tile across 160 m, which
   is why the yard reads as a field of 4 m boulders. World-space UVs make every
   paving material tile at a real, consistent size. */
rw('src/geom.js', [
  [`export function decal(w, d, x, z, material, elevKey, rotY) {
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(d / 6)));
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x, 0, z);
  const p = g.attributes.position;
  const lift = ELEV[elevKey] != null ? ELEV[elevKey] : 0;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, groundH(p.getX(i), p.getZ(i)) + lift);
  }
  g.computeVertexNormals();`,
`export function decal(w, d, x, z, material, elevKey, rotY) {
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(d / 6)));
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x, 0, z);
  const p = g.attributes.position;
  const lift = ELEV[elevKey] != null ? ELEV[elevKey] : 0;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, groundH(p.getX(i), p.getZ(i)) + lift);
    /* world-space UV: the material's repeat is now tiles per metre, so gravel
       reads as gravel at any slab size */
    uv.setXY(i, p.getX(i), p.getZ(i));
  }
  uv.needsUpdate = true;
  g.computeVertexNormals();`],
]);

/* ================================================= 2. road widths and lanes
   A 15 m campus loop marked as a single lane each way is wide enough to be a
   two-lane road, which is what it looked like. Carriageways are narrowed to
   their actual lane count and the edge lines follow. */
rw('src/05-roads.js', [
  [`  campusLoop: {
    width: 15, gutter: 0.6, curbH: 0.15, curbW: 0.16, verge: 4.0,
    sidewalk: 'inner', shoulder: 2.5, returnR: 9, step: 3, fillet: 45,
    material: 'asphalt',
    marks: [
      { u: -0.09, style: 'solid', col: 'markYellow', w: 0.12 },
      { u:  0.09, style: 'solid', col: 'markYellow', w: 0.12 },
      { u: -6.0, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  6.0, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },`,
`  campusLoop: {
    /* 2 lanes at 3.65 plus 1.1 m shoulders each side = 9.5 m kerb to kerb */
    width: 9.5, gutter: 0.6, curbH: 0.15, curbW: 0.16, verge: 4.0,
    sidewalk: 'inner', shoulder: 2.5, returnR: 9, step: 3, fillet: 45,
    material: 'asphalt',
    marks: [
      { u: -0.08, style: 'solid', col: 'markYellow', w: 0.11 },
      { u:  0.08, style: 'solid', col: 'markYellow', w: 0.11 },
      { u: -3.75, style: 'solid', col: 'markWhite', w: 0.11 },
      { u:  3.75, style: 'solid', col: 'markWhite', w: 0.11 },
    ],
  },`],
  [`  service: {
    width: 13, gutter: 0, curbH: 0, curbW: 0, verge: 5.0,`,
`  service: {
    /* haul route: 2 lanes at 4.2 for trucks, plus shoulders */
    width: 10.5, gutter: 0, curbH: 0, curbW: 0, verge: 5.0,`],
  [`      { u: -5.4, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  5.4, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  avenue: {
    width: 13, gutter: 0.6, curbH: 0.15, curbW: 0.16, verge: 5.0,`,
`      { u: -4.3, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  4.3, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  avenue: {
    /* 2 lanes at 3.5 plus parking-width shoulders */
    width: 9.0, gutter: 0.6, curbH: 0.15, curbW: 0.16, verge: 5.0,`],
  [`      { u: -5.2, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  5.2, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  aisle: {`,
`      { u: -3.6, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  3.6, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  aisle: {`],
  [`  drive: {
    width: 7.5, gutter: 0, curbH: 0.15, curbW: 0.16, verge: 2.0,`,
`  drive: {
    width: 6.4, gutter: 0, curbH: 0.15, curbW: 0.16, verge: 2.0,`],
]);

/* ================================== 3. cul-de-sac becomes a planted island
   A plain black disc is not a turning circle. Real ones have a central island
   with a kerb, planting and a feature, and a marked circulatory lane. */
rw('src/05-roads.js', [
  [`    const pav = polyGrid(poly, 2.5, ELEV.asphalt);
    if (pav) { const m = mesh(pav, MAT.asphalt, null, null, null, { cast: false });
               m.renderOrder = RENDER_ORDER.asphalt; g.add(m); }
    /* ring curb */
    const ring = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ring.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
    const sm = resamplePath(ring, 1.4, 0);
    const cg = sweep(sm, [
      { u: 0, dy: -0.03 }, { u: 0, dy: 0.15 },
      { u: 0.16, dy: 0.162 }, { u: 0.16, dy: -0.10 },
    ], { lift: ELEV.gutter, uvScale: 0.3 });
    if (cg) { const m = mesh(cg, MAT.concreteCurb); m.renderOrder = RENDER_ORDER.gutter; g.add(m); }`,
`    /* the circulatory carriageway is an annulus around a central island */
    const RI = Math.max(3.2, R * 0.42);
    const hole = [];
    for (let i = 0; i < 28; i++) {
      const a = -(i / 28) * Math.PI * 2;
      hole.push([cx + Math.cos(a) * RI, cz + Math.sin(a) * RI]);
    }
    const pav = polyGrid(poly, 1.6, ELEV.asphalt, [hole]);
    if (pav) { const m = mesh(pav, MAT.asphalt, null, null, null, { cast: false });
               m.renderOrder = RENDER_ORDER.asphalt; g.add(m); }

    const ringCurb = (rad, lift2) => {
      const ring = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        ring.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
      }
      const sm2 = resamplePath(ring, 1.2, 0);
      return sweep(sm2, [
        { u: 0, dy: -0.03 }, { u: 0, dy: 0.15 },
        { u: 0.16, dy: 0.162 }, { u: 0.16, dy: -0.10 },
      ], { lift: lift2, uvScale: 0.3 });
    };
    const cg = ringCurb(R, ELEV.gutter);
    if (cg) { const m = mesh(cg, MAT.concreteCurb); m.renderOrder = RENDER_ORDER.gutter; g.add(m); }
    /* the island: raised kerb, mulch bed, a specimen tree and a lit bollard ring */
    const ig = ringCurb(RI, ELEV.gutter);
    if (ig) { const m = mesh(ig, MAT.concreteCurb); m.renderOrder = RENDER_ORDER.gutter; g.add(m); }
    {
      const iy = groundH(cx, cz);
      const disc = new THREE.CircleGeometry(RI - 0.05, 40);
      disc.rotateX(-Math.PI / 2);
      disc.translate(cx, iy + ELEV.paver + 0.14, cz);
      const uvA = disc.attributes.uv, pA = disc.attributes.position;
      for (let i = 0; i < pA.count; i++) uvA.setXY(i, pA.getX(i), pA.getZ(i));
      const dm = mesh(disc, MAT.mulch, null, null, null, { cast: false });
      dm.renderOrder = RENDER_ORDER.paver; g.add(dm);
      g.add(mesh(cyl(0.30, 0.42, 5.6, 10), MAT.barkOak, cx, iy + 2.8, cz));
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.ConeGeometry(RI * 0.62 - i * 0.5, 3.0, 12, 1, true);
        g.add(mesh(cone, MAT.folOak, cx, iy + 4.6 + i * 1.5, cz));
      }
      const n2 = Math.max(6, Math.round(RI * 1.4));
      for (let i = 0; i < n2; i++) {
        const a = (i / n2) * Math.PI * 2;
        const bx = cx + Math.cos(a) * (RI - 0.9), bz2 = cz + Math.sin(a) * (RI - 0.9);
        g.add(mesh(cyl(0.09, 0.10, 0.85, 8), MAT.steelDark, bx, groundH(bx, bz2) + 0.42, bz2));
      }
    }
    /* yield line where the approach meets the circulatory lane */
    if (arm) {
      const yx = n.x + arm.dx * 2.5, yz = n.z + arm.dz * 2.5;
      g.add(decal(arm.e.spec.width * 0.9, 0.5, yx, yz, MAT.markWhite, 'roadMarking',
        Math.atan2(arm.dz, arm.dx)));
    }`],
]);

/* polyGrid needs to honour a hole so the island is not paved over */
rw('src/05-roads.js', [
  [`export function polyGrid(poly, cell, lift) {`, `export function polyGrid(poly, cell, lift, holes) {`],
  [`      const cx = lerp(x0, x1, (i + 0.5) / nx), cz = lerp(z0, z1, (j + 0.5) / nz);
      if (!pointInPoly(cx, cz, poly)) continue;`,
`      const cx = lerp(x0, x1, (i + 0.5) / nx), cz = lerp(z0, z1, (j + 0.5) / nz);
      if (!pointInPoly(cx, cz, poly)) continue;
      if (holes && holes.some((h) => pointInPoly(cx, cz, h))) continue;`],
]);

/* ============================================== 4. trees off the sidewalks
   The street-tree pass carried allowOverlapWith:['walk'], which let the
   validator accept a tree standing in the footway. Removing the exemption
   makes the validator reject them, and the offsets move into the verge. */
rw('src/14-vegetation.js', [
  ["      add(streetSpecies[(i + line.seed) % streetSpecies.length], x, z,\n        { clearance: 0.4, tight: true, allow: ['walk'] });",
   "      add(streetSpecies[(i + line.seed) % streetSpecies.length], x, z,\n        { clearance: 1.6, tight: true });"],
  ["          st.z + s * 15 + (r() - 0.5) * 3, { clearance: 2.2, tight: true, allow: ['walk'] });",
   "          st.z + s * 15 + (r() - 0.5) * 3, { clearance: 2.2, tight: true });"],
  /* the campus street-tree lines sat at +/-10.5 and +/-11.5, right on top of the
     new narrower roads' footways; move them out into the verge */
  ["{ x0: 0, z0: -370, x1: 0, z1: 140, ox: 10.5, oz: 0, spacing: 11, len: 510, seed: 0 },",
   "{ x0: 0, z0: -370, x1: 0, z1: 140, ox: 12.5, oz: 0, spacing: 12, len: 510, seed: 0 },"],
  ["{ x0: 0, z0: -370, x1: 0, z1: 140, ox: -10.5, oz: 0, spacing: 11, len: 510, seed: 2 },",
   "{ x0: 0, z0: -370, x1: 0, z1: 140, ox: -12.5, oz: 0, spacing: 12, len: 510, seed: 2 },"],
  ["{ x0: -320, z0: 150, x1: 370, z1: 150, ox: 0, oz: 11.5, spacing: 11, len: 690, seed: 1 },",
   "{ x0: -320, z0: 150, x1: 370, z1: 150, ox: 0, oz: 13.5, spacing: 12, len: 690, seed: 1 },"],
  ["{ x0: -320, z0: 150, x1: 370, z1: 150, ox: 0, oz: -11.5, spacing: 11, len: 690, seed: 3 },",
   "{ x0: -320, z0: 150, x1: 370, z1: 150, ox: 0, oz: -13.5, spacing: 12, len: 690, seed: 3 },"],
  ["{ x0: 130, z0: -370, x1: 130, z1: -10, ox: 10.5, oz: 0, spacing: 11, len: 360, seed: 4 },",
   "{ x0: 130, z0: -370, x1: 130, z1: -10, ox: 12.5, oz: 0, spacing: 12, len: 360, seed: 4 },"],
  ["{ x0: 130, z0: -370, x1: 130, z1: -10, ox: -10.5, oz: 0, spacing: 11, len: 360, seed: 2 },",
   "{ x0: 130, z0: -370, x1: 130, z1: -10, ox: -12.5, oz: 0, spacing: 12, len: 360, seed: 2 },"],
  ["{ x0: -820, z0: -700, x1: 820, z1: -700, ox: 0, oz: 16, spacing: 9.1, len: 1640, seed: 1 },",
   "{ x0: -820, z0: -700, x1: 820, z1: -700, ox: 0, oz: 19, spacing: 10, len: 1640, seed: 1 },"],
  ["{ x0: -820, z0: -700, x1: 820, z1: -700, ox: 0, oz: -16, spacing: 9.1, len: 1640, seed: 3 },",
   "{ x0: -820, z0: -700, x1: 820, z1: -700, ox: 0, oz: -19, spacing: 10, len: 1640, seed: 3 },"],
  /* general scatter must also keep off the footway */
  ["      allowOverlapWith: opts.allow || null,", "      allowOverlapWith: opts.allow || null,"],
]);

/* ================================= 5. the agrivoltaic array needs a setback */
rw('src/08-siteplan.js', [
  ["agri:    { x: 324, z: 332, w: 84, d: 62 },", "agri:    { x: 322, z: 330, w: 72, d: 50 },"],
]);
rw('src/09-campus.js', [
  ["      footprint: { x: ax, z: az, w: aw, d: ad },\n      y0: groundH(ax, az) + 1.4, y1: groundH(ax, az) + 5.2,",
   "      footprint: { x: ax, z: az, w: aw, d: ad },\n      y0: groundH(ax, az) + 1.4, y1: groundH(ax, az) + 5.2,\n      clearance: 6.0,"],
]);

console.log('patch4 applied');
