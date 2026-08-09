import fs from 'node:fs';
const rw = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.warn('MISS', p, JSON.stringify(a.slice(0, 80))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s);
};

/* ---------------------------------------------------------- true arc fillets
   A quadratic through p1 -> corner -> p2 bulges well outside the circular arc
   it is meant to approximate: on a 70 m return radius it overshoots by 4.2 m,
   which pushed the ring road's corner out through the security fence. */
rw('src/geom.js', [
  [`      const p1 = { x: b.x + v1x * t, z: b.z + v1z * t };
      const p2 = { x: b.x + v2x * t, z: b.z + v2z * t };
      /* quadratic through p1 -> b -> p2 approximates the arc closely enough at
         the radii used here, and never overshoots */
      const n = Math.max(3, Math.round(ang * Math.max(radius, t) / Math.max(step, 1)));
      for (let k = 0; k <= n; k++) {
        const u = k / n, iu = 1 - u;
        out.push({
          x: iu * iu * p1.x + 2 * iu * u * b.x + u * u * p2.x,
          z: iu * iu * p1.z + 2 * iu * u * b.z + u * u * p2.z,
        });
      }`,
`      const p1 = { x: b.x + v1x * t, z: b.z + v1z * t };
      const p2 = { x: b.x + v2x * t, z: b.z + v2z * t };
      /* the true circular fillet: centre on the angle bisector, radius set by
         the tangent length actually used */
      const R = t * Math.tan(ang / 2);
      let bx = v1x + v2x, bz = v1z + v2z;
      const bl = Math.hypot(bx, bz);
      if (bl < 1e-6) { out.push(b); continue; }
      bx /= bl; bz /= bl;
      const cd = Math.sqrt(t * t + R * R);
      const cx = b.x + bx * cd, cz = b.z + bz * cd;
      let a1 = Math.atan2(p1.z - cz, p1.x - cx);
      let a2 = Math.atan2(p2.z - cz, p2.x - cx);
      let da = a2 - a1;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const n = Math.max(4, Math.round(Math.abs(da) * R / Math.max(step, 0.5)));
      for (let k = 0; k <= n; k++) {
        const a = a1 + da * (k / n);
        out.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });
      }`],
]);

/* ------------------------------------------------------------------- ponds */
rw('src/01-terrain.js', [
  ["{ id: 'pond-a', x: 316, z: -290, r: 40,", "{ id: 'pond-a', x: 330, z: -290, r: 40,"],
  ["{ id: 'pond-b', x: 322, z: -186, r: 35,", "{ id: 'pond-b', x: 332, z: -186, r: 35,"],
  ["{ id: 'pond-c', x: 312, z:  -92, r: 30,", "{ id: 'pond-c', x: 326, z:  -92, r: 30,"],
]);
rw('src/09-campus.js', [
  ["footprint: { poly: [[264, -336], [368, -336], [368, -56], [264, -56]] },",
   "footprint: { poly: [[286, -338], [374, -338], [374, -56], [286, -56]] },"],
]);

/* ------------------------------------------------------------- plot tweaks */
rw('src/08-siteplan.js', [
  ["turbine: { x: -240, z:  108, w:  74, d: 44,", "turbine: { x: -240, z:  118, w:  74, d: 36,"],
  /* the library sat on the utility corridor */
  ["{ id: 'library-branch', x: 60, z: -812,", "{ id: 'library-branch', x: 60, z: -820,"],
  /* the gatehouse and the pond walks */
  ["N('p-pondN', 316, -344, 'walk');", "N('p-pondN', 330, -348, 'walk');"],
  ["N('p-bwA', 300, -262, 'walk');", "N('p-bwA', 300, -258, 'walk');"],
  ["N('p-bwB', 348, -214, 'walk');", "N('p-bwB', 356, -214, 'walk');"],
  ["N('p-pondC', 300, -120, 'walk');", "N('p-pondC', 300, -126, 'walk');"],
  ["N('p-pondS', 286, -60, 'walk');", "N('p-pondS', 292, -72, 'walk');"],
  ["w.edge('pond-3', 'p-bwB', 'p-pondC', 'parkPath', [[352, -170]]);",
   "w.edge('pond-3', 'p-bwB', 'p-pondC', 'parkPath', [[362, -170]]);"],
  ["w.edge('pond-5', 'p-pondS', 'p-food', 'parkPath', [[262, -30], [200, -22]]);",
   "w.edge('pond-5', 'p-pondS', 'p-food', 'parkPath', [[268, -76], [190, -72]]);"],
  ["w.edge('w-meetme', 'p-iaN', 'p-meetme', 'sidewalk', [[-104, -350], [-62, -336]], { allow: ['road', 'apron'] });",
   "w.edge('w-meetme', 'p-iaN', 'p-meetme', 'sidewalk', [[-104, -350], [-92, -300], [-88, -276]], { allow: ['road', 'apron'] });"],
]);
rw('src/12-beyond.js', [
  ["{ id: 'library-branch', x: 60, z: -812,", "{ id: 'library-branch', x: 60, z: -820,"],
]);

/* ------------------------------------------------- the outfall and the swale */
rw('src/11-perimeter.js', [
  ["    const ox = 52, oz = SITE.bermToeOut + 4;", "    const ox = 82, oz = SITE.bermToeOut + 4;"],
  /* the bioswale is interrupted at every gate, so its registration must be too */
  [`    registerRun('bioswale', path, 8, -2.2, 0.6, LAYER.UTILITY,
      ['perimeter'], ['perimeter', 'road', 'walk', 'apron'], ['no-geom-audit']);`,
`    splitAtGates(path, 24).forEach((run, ri) =>
      registerRun('bioswale-' + ri, run, 8, -2.2, 0.6, LAYER.UTILITY,
        ['perimeter'], ['perimeter', 'road', 'walk', 'apron'], ['no-geom-audit']));`],
]);
rw('src/13-coast.js', [
  ["'Great Pee Dee River — 150 mi to the Atlantic. Shown compressed.'",
   "'Great Pee Dee River — 150 mi to the Atlantic. Shown compressed.'"],
]);
rw('src/16-ui.js', [
  ["w3: [52, 20, 484],", "w3: [82, 20, 500],"],
  ["m1: [-120, 30, 265],", "m1: [-90, 30, 280],"],
  ["m2: [30, 26, 290],", "m2: [55, 26, 296],"],
  ["m3: [232, 27, -266],", "m3: [227, 27, -266],"],
  ["m4: [228, 30, -88],", "m4: [228, 30, -100],"],
  ["m5: [230, 28, -6],", "m5: [230, 28, -40],"],
  ["w4: [320, 22, -200],", "w4: [332, 22, -200],"],
  ["w5: [232, 27, -214],", "w5: [227, 27, -214],"],
  ["e2: [330, 23, 190],", "e2: [324, 23, 332],"],
  ["e6: [-322, 36, 336],", "e6: [-255, 36, 320],"],
  ["a3: [-240, 34, 142],", "a3: [-240, 34, 118],"],
  ["c1: [-169, 35, 236],", "c1: [-163, 35, 236],"],
  ["c2: [-169, 32, 260],", "c2: [-163, 32, 260],"],
  ["c3: [-120, 30, 265],", "c3: [-90, 30, 280],"],
  ["a1: [-225, 60, 245],", "a1: [-218, 60, 245],"],
  ["s2: [-330, 24, 300],", "s2: [-330, 24, 280],"],
  ["b5: [-760, 32, -1120],", "b5: [-760, 32, -1120],"],
  ["target: [-30, 22, 262], dist: 380", "target: [0, 22, 276], dist: 400"],
]);

/* --------------------------------- vegetation: stand further off structures */
rw('src/14-vegetation.js', [
  ["{ clearance: 2.4 }];\n  });", "{ clearance: 4.0 }];\n  });"],
  ["  scatter(add, 'campus-grounds', 1400 * density, () => {", "  scatter(add, 'campus-grounds', 1400 * density, () => {"],
  ["      { clearance: 1.0 }];\n  });\n  for (const p of PONDS) {", "      { clearance: 2.0 }];\n  });\n  for (const p of PONDS) {"],
]);

console.log('patch3 applied');
