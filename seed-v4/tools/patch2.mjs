import fs from 'node:fs';
const rw = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.warn('MISS', p, JSON.stringify(a.slice(0, 70))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s);
};

/* ---------------------------------------------------------------- site plan */
rw('src/08-siteplan.js', [
  /* the turbine sat on the community avenue; cooling moves with it */
  ["cooling: { x: -240, z:   62,", "cooling: { x: -240, z:   52,"],
  ["turbine: { x: -240, z:  142,", "turbine: { x: -240, z:  108,"],
  /* the WTE tipping hall sat in the haul carriageway */
  ["wte:     { x: -238, z:  236,", "wte:     { x: -231, z:  236,"],
  /* the substation sat in the ring corner and the haul cul-de-sac */
  ["substation:{ x:-322, z:  336,  w:  96, d: 62,", "substation:{ x:-255, z:  320,  w:  90, d: 56,"],
  /* the food hub and aquaponics sat on the cross street */
  ["aquaponics:{ x: 228, z: -88, w: 84, d: 52,", "aquaponics:{ x: 228, z: -100, w: 84, d: 52,"],
  ["foodhub: { x: 230, z:  -6, w: 66, d: 42,", "foodhub: { x: 230, z:  -40, w: 66, d: 42,"],
  /* greenhouse footprints now include the headhouse, so the walk clears it */
  ["gh1:     { x: 232, z: -318, w: 92, d: 30,", "gh1:     { x: 227, z: -318, w: 102, d: 30,"],
  ["gh2:     { x: 232, z: -266, w: 92, d: 30,", "gh2:     { x: 227, z: -266, w: 102, d: 30,"],
  ["gh3:     { x: 232, z: -214, w: 92, d: 30,", "gh3:     { x: 227, z: -214, w: 102, d: 30,"],
  ["gh4:     { x: 232, z: -162, w: 92, d: 30,", "gh4:     { x: 227, z: -162, w: 102, d: 30,"],
  /* the plaza overlapped the community center; both shift and the stage
     and drop-off follow */
  ["community:{ x: -120, z: 265, r: 62, rInner: 26 },", "community:{ x: -90, z: 280, r: 56, rInner: 24 },"],
  ["plaza:   { x: 30, z: 265, r: 85 },", "plaza:   { x: 55, z: 272, r: 78 },"],
  ["stage:   { x: 30, z: 330, w: 30, d: 16 },", "stage:   { x: 55, z: 336, w: 30, d: 16 },"],
  ["trainyard:{ x: 325, z: 250, w: 80, d: 56 },", "trainyard:{ x: 325, z: 250, w: 80, d: 56 },\n  agri:    { x: 324, z: 332, w: 84, d: 62 },"],
  ["farmstand:{ x: 132, z: 196, w: 18, d: 10 },", "farmstand:{ x: 132, z: 200, w: 18, d: 10 },"],

  /* drop-off follows the community center */
  ["N('cc-d', -120, 150, 'intersection');", "N('cc-d', -90, 150, 'intersection');"],
  ["N('cc-bulb', -120, 192, 'cul-de-sac');", "N('cc-bulb', -90, 186, 'cul-de-sac');"],

  /* --- walk nodes pulled back off the building faces --- */
  ["N('p-ghW', 176, -240, 'walk');", "N('p-ghW', 168, -240, 'walk');"],
  ["N('p-gh1', 184, -318, 'entry');", "N('p-gh1', 170, -318, 'entry');"],
  ["N('p-gh2', 184, -266, 'entry');", "N('p-gh2', 170, -266, 'entry');"],
  ["N('p-gh3', 184, -214, 'entry');", "N('p-gh3', 170, -214, 'entry');"],
  ["N('p-gh4', 184, -162, 'entry');", "N('p-gh4', 170, -162, 'entry');"],
  ["N('p-aqua', 184, -88, 'entry');", "N('p-aqua', 172, -100, 'entry');"],
  ["N('p-food', 195, -6, 'entry');", "N('p-food', 182, -40, 'entry');"],
  ["N('p-llx', 142, 0, 'walk');", "N('p-llx', 148, 0, 'walk');"],
  ["N('p-lln', 142, -340, 'walk');", "N('p-lln', 148, -344, 'walk');"],
  ["N('p-meetme', -60, -280, 'entry');", "N('p-meetme', -60, -272, 'entry');"],
  ["N('p-acad', 215, 210, 'entry');", "N('p-acad', 215, 208, 'entry');"],
  ["N('p-yard', 285, 250, 'entry');", "N('p-yard', 272, 250, 'entry');"],
  ["N('p-stand', 132, 188, 'walk');", "N('p-stand', 132, 184, 'walk');"],
  ["N('p-rest', -34, 188, 'walk');", "N('p-rest', -34, 184, 'walk');"],
  ["N('p-ccE', -52, 265, 'entry');", "N('p-ccE', -26, 280, 'entry');"],
  ["N('p-ccN', -120, 205, 'entry');", "N('p-ccN', -90, 216, 'entry');"],
  ["N('p-bulb', -120, 176, 'walk');", "N('p-bulb', -90, 172, 'walk');"],
  ["N('p-plazaN', 30, 178, 'plaza');", "N('p-plazaN', 55, 190, 'plaza');"],
  ["N('p-plazaC', 30, 262, 'plaza');", "N('p-plazaC', 55, 268, 'plaza');"],
  ["N('p-plazaS', 30, 316, 'plaza');", "N('p-plazaS', 55, 318, 'plaza');"],

  /* --- rerouted walks --- */
  ["w.edge('spine-lotA', 'p-lotA', 'p-plazaN', 'plazaSpine', [[60, 150]], { allow: ['road', 'apron', 'xcm', 'cave-2', 'cave-3'] });",
   "w.edge('spine-lotA', 'p-lotA', 'p-plazaN', 'plazaSpine', [[74, 148]], { allow: ['road', 'apron', 'lot', 'lotA', 'xcm', 'cave-2', 'cave-3'] });"],
  ["w.edge('spine-ccN', 'p-ccE', 'p-ccN', 'plazaSpine', [[-104, 224]]);",
   "w.edge('spine-ccN', 'p-ccE', 'p-ccN', 'plazaSpine', [[-30, 224], [-62, 214]], { allow: ['cc'] });"],
  ["w.edge('spine-stand', 'p-plazaN', 'p-stand', 'plazaSpine', [[92, 182]]);",
   "w.edge('spine-stand', 'p-plazaN', 'p-stand', 'plazaSpine', [[100, 186]]);"],
  ["w.edge('spine-rest', 'p-plazaN', 'p-rest', 'plazaSpine', [[-4, 184]]);",
   "w.edge('spine-rest', 'p-plazaN', 'p-rest', 'plazaSpine', [[10, 180]]);"],
  ["w.edge('gh-spine', 'p-lln', 'p-ghW', 'sidewalkWide', [[176, -330]]);",
   "w.edge('gh-spine', 'p-lln', 'p-ghW', 'sidewalkWide', [[168, -344]]);"],
  ["w.edge('gh-spine2', 'p-ghW', 'p-llx', 'sidewalkWide', [[176, -60], [160, -20]],\n    { allow: ['road', 'll-x', 'cross-4', 'cross-5', 'll-1'] });",
   "w.edge('gh-spine2', 'p-ghW', 'p-llx', 'sidewalkWide', [[168, -60], [152, -20]],\n    { allow: ['road', 'll-x', 'cross-4', 'cross-5', 'll-1'] });"],
  ["w.edge('w-aqua', 'p-ghW', 'p-aqua', 'sidewalk', [[176, -110]], { fillet: 3 });",
   "w.edge('w-aqua', 'p-ghW', 'p-aqua', 'sidewalk', [[168, -100]], { fillet: 3 });"],
  ["w.edge('w-food', 'p-llx', 'p-food', 'sidewalk', [[176, -6]], { fillet: 3 });",
   "w.edge('w-food', 'p-llx', 'p-food', 'sidewalk', [[168, -40]], { fillet: 3 });"],
  ["N('p-pondW', 272, -290, 'walk');", "N('p-pondW', 292, -348, 'walk');"],
  ["w.edge('pond-1', 'p-ghW', 'p-pondW', 'parkPath', [[250, -272]]);",
   "w.edge('pond-1', 'p-ghW', 'p-pondW', 'parkPath', [[168, -348]]);"],
  ["w.edge('pond-2', 'p-pondW', 'p-pondN', 'parkPath', [[286, -330]]);",
   "w.edge('pond-2', 'p-pondW', 'p-pondN', 'parkPath', [[306, -348]]);"],
  ["w.edge('pond-bw', 'p-pondW', 'p-bwA', 'boardwalk', [[288, -276]], { allow: ['water'] });",
   "w.edge('pond-bw', 'p-pondW', 'p-bwA', 'boardwalk', [[294, -300]], { allow: ['water'] });"],
  ["w.edge('pond-5', 'p-pondS', 'p-food', 'parkPath', [[240, -40]]);",
   "w.edge('pond-5', 'p-pondS', 'p-food', 'parkPath', [[262, -30], [200, -22]]);"],
  ["w.edge('w-acad', 'p-stand', 'p-acad', 'sidewalkWide', [[176, 192], [200, 202]]);",
   "w.edge('w-acad', 'p-stand', 'p-acad', 'sidewalkWide', [[176, 188], [204, 198]]);"],
  ["w.edge('w-yard', 'p-acad', 'p-yard', 'sidewalk', [[262, 226]]);",
   "w.edge('w-yard', 'p-acad', 'p-yard', 'sidewalk', [[266, 212]]);"],
  ["w.edge('w-gate2', 'p-gate', 'p-lln', 'sidewalk', [[70, -392], [120, -370]]);",
   "w.edge('w-gate2', 'p-gate', 'p-lln', 'sidewalk', [[10, -382], [70, -370]], { allow: ['road', 'apron'] });"],
  ["N('p-iaN', -138, -370, 'walk');", "N('p-iaN', -132, -368, 'walk');"],
  ["N('p-iaS', -138, 110, 'walk');", "N('p-iaS', -132, 112, 'walk');"],
  ["w.edge('ia-walk', 'p-iaN', 'p-iaS', 'sidewalk',\n    [[-138, -300], [-138, -140], [-138, 0]],",
   "w.edge('ia-walk', 'p-iaN', 'p-iaS', 'sidewalk',\n    [[-132, -300], [-132, -140], [-132, 0]],"],
  ["w.edge('w-' + k, 'p-iaS', 'p-' + k, 'sidewalk', [[-138, ez]], { fillet: 3 });",
   "w.edge('w-' + k, 'p-iaS', 'p-' + k, 'sidewalk', [[-132, ez]], { fillet: 3 });"],
  ["w.edge('w-meetme', 'p-iaN', 'p-meetme', 'sidewalk', [[-100, -352], [-60, -330]]);",
   "w.edge('w-meetme', 'p-iaN', 'p-meetme', 'sidewalk', [[-104, -350], [-62, -336]], { allow: ['road', 'apron'] });"],
  ["w.edge('w-gate', 'p-gate', 'p-iaN', 'sidewalk', [[-40, -390]]);",
   "w.edge('w-gate', 'p-gate', 'p-iaN', 'sidewalk', [[-40, -392]], { allow: ['road', 'apron'] });"],
]);

/* the extra ties that join the four islands into one network */
rw('src/08-siteplan.js', [
  ["  return w;\n}\n\nfunction swInner(e) {",
`  /* ---- the ties that make the network one connected graph. Every one of
     these is a designed route, not an automatic stitch: parking to the living
     systems, the compute core to the civic spine, and the plaza to the
     watershed trailhead. */
  N('p-eastTie', 148, 120, 'walk');
  w.edge('tie-east-1', 'p-llx', 'p-eastTie', 'sidewalkWide', [[148, 60]],
    { allow: ['road', 'apron', 'lot', 'lotB', 'cave-3', 'cave-4', 'cae'] });
  w.edge('tie-east-2', 'p-eastTie', 'p-stand', 'sidewalkWide', [[148, 160]],
    { allow: ['road', 'apron', 'lot', 'lotB', 'cave-3', 'cave-4', 'cae', 'xcm'] });
  N('p-westTie', -132, 168, 'walk');
  w.edge('tie-west-1', 'p-iaS', 'p-westTie', 'sidewalk', null,
    { allow: ['road', 'apron', 'cw', 'cave-1', 'ia-2', 'ia-e'] });
  w.edge('tie-west-2', 'p-westTie', 'p-bulb', 'sidewalkWide', [[-120, 172]],
    { allow: ['road', 'apron', 'cave-1', 'cc-d', 'dropoff', 'cc-bulb'] });
  N('p-southTie', 46, 400, 'walk');
  w.edge('tie-south-1', 'p-plazaS', 'p-southTie', 'parkPath', [[50, 360]],
    { allow: ['road', 'apron', 'plaza', 'rs', 'ring-6', 'ring-7', 'gate-s-run', 'gate-s'] });
  w.edge('tie-south-2', 'p-southTie', 'p-trailhead', 'parkPath', [[46, 470]],
    { allow: ['road', 'apron', 'gate-s-run', 'trail-drive', 'gate-s', 'trailhead'] });
  N('p-lotBw', 184, 140, 'walk');
  w.edge('tie-lotB', 'p-lotBw', 'p-eastTie', 'sidewalk', null,
    { allow: ['road', 'apron', 'lot', 'lotB', 'cave-3'] });

  return w;
}

function swInner(e) {`],
]);

/* ------------------------------------------------ registry: STRUCTURE|WALK */
rw('src/02-registry.js', [
  ["rule(L.STRUCTURE, L.WALK,      'forbid');",
   "/* 'declared', not 'forbid': a stage inside a plaza and a restroom block on a\n   paved square are legitimate, but each one has to say so explicitly. The\n   default is still to reject. */\nrule(L.STRUCTURE, L.WALK,      'declared');"],
]);

/* ------------------------------------- roads: tighter, more accurate footprints */
rw('src/05-roads.js', [
  ["    const step = Math.max(10, Math.round(sm.total / Math.max(1, Math.round(sm.total / 18))));",
   "    /* short registration chords: an 18 m chord across a 70 m corner radius\n       bulges 0.6 m outside the true carriageway and collided with the fence */\n    const step = Math.max(6, Math.round(sm.total / Math.max(1, Math.round(sm.total / 8))));"],
  ["    const halfTotal = h + sp.curbW + 0.9;", "    const halfTotal = h + sp.curbW + 0.35;"],
  ["      footprint: { x: n.x, z: n.z, r: rad + 0.5 },",
   "      footprint: { poly: poly.filter((p, k) => k % 2 === 0) },"],
]);

/* --------------------------------------- campus: follow the plot relocations */
rw('src/09-campus.js', [
  ["    const tx = p.x - p.w / 2 - 19, tz = p.z;", "    const tx = p.x - p.w / 2 - 18, tz = p.z;"],
  ["    const cx = p.x + p.w / 2 + 16;", "    const cx = p.x + p.w / 2 + 15;"],
  ["    const pyX = [-430, -560, -720];", "    const pyX = [-545, -700, -860];"],
  ["      place({\n        id: 'pylon-' + i, layer: LAYER.UTILITY,\n        footprint: { x: px, z: 336, w: 16, d: 16 },\n        y0: groundH(px, 336) - 1, y1: groundH(px, 336) + 44,",
   "      place({\n        id: 'pylon-' + i, layer: LAYER.UTILITY,\n        footprint: { x: px, z: 320, w: 16, d: 16 },\n        y0: groundH(px, 320) - 1, y1: groundH(px, 320) + 44,"],
  ["          const by = groundH(px, 336);", "          const by = groundH(px, 320);"],
  ["336 + sz * 2.6, { rotZ: -sx * 0.055, rotX: sz * 0.055 }));", "320 + sz * 2.6, { rotZ: -sx * 0.055, rotX: sz * 0.055 }));"],
  ["            grp.add(mesh(box(s, 0.12, 0.12), MAT.galv, px, yy, 336 + 2.6));\n            grp.add(mesh(box(s, 0.12, 0.12), MAT.galv, px, yy, 336 - 2.6));",
   "            grp.add(mesh(box(s, 0.12, 0.12), MAT.galv, px, yy, 322.6));\n            grp.add(mesh(box(s, 0.12, 0.12), MAT.galv, px, yy, 317.4));"],
  ["            grp.add(mesh(box(0.12, 0.12, 17), MAT.galv, px, yy, 336));",
   "            grp.add(mesh(box(0.12, 0.12, 17), MAT.galv, px, yy, 320));"],
  ["                  px, yy - 0.4 - d2 * 0.26, 336 + sz * 7.4));", "                  px, yy - 0.4 - d2 * 0.26, 320 + sz * 7.4));"],
  /* agrivoltaics relocated into the south-east pocket */
  ["    const ax = 330, az = 190, aw = 76, ad = 300;", "    const ax = PLOTS.agri.x, az = PLOTS.agri.z, aw = PLOTS.agri.w, ad = PLOTS.agri.d;"],
  ["        const rows = 11, perRow = 26;", "        const rows = 12, perRow = 9;"],
  /* heat main is an elevated pipe rack: register it above the walks it crosses */
  ["        y0: groundH(60, -352) + 0.2, y1: groundH(60, -352) + 5.6,",
   "        y0: groundH(60, -352) + 3.4, y1: groundH(60, -352) + 5.6,"],
]);

/* ------------------------------------ community: declare the plaza occupants */
rw('src/10-community.js', [
  ["      parent: g, site: 'permanent stage',\n      allowOverlapWith: ['plaza'],",
   "      parent: g, site: 'permanent stage',\n      allowOverlapWith: ['plaza', 'walk'],"],
  ["      clearance: 1.0, parent: g, site: 'restrooms and event security',",
   "      clearance: 1.0, parent: g, site: 'restrooms and event security',\n      allowOverlapWith: ['plaza', 'walk'],"],
  ["    clearance: 2.0, parent: g, site: 'community center',\n    groups: ['cc'],",
   "    clearance: 2.0, parent: g, site: 'community center',\n    groups: ['cc'], allowOverlapWith: ['walk'],"],
  ["      parent: g, site: 'farm stand',",
   "      parent: g, site: 'farm stand', allowOverlapWith: ['walk'],"],
]);

/* ----------------------------- vegetation: keep out of building envelopes */
rw('src/14-vegetation.js', [
  ["  scatter(add, 'hood-yards', 900, () => {\n    const x = -900 + r() * 1800, z = -1260 + r() * 520;\n    return [r.pick(['whiteoak', 'sweetgum', 'redcedar', 'liveoak']), x, z, { clearance: 1.0 }];\n  });",
   "  scatter(add, 'hood-yards', 900, () => {\n    const x = -900 + r() * 1800, z = -1260 + r() * 520;\n    return [r.pick(['whiteoak', 'sweetgum', 'redcedar', 'liveoak']), x, z, { clearance: 2.4 }];\n  });"],
  ["      { clearance: 0.6, tight: true, allow: ['walk'] });\n      }\n    }\n  }",
   "      { clearance: 2.2, tight: true, allow: ['walk'] });\n      }\n    }\n  }"],
]);

console.log('patch2 applied');
