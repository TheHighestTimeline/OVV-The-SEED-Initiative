/* ============================================================================
   08-siteplan.js — the master plan: road graph, pedestrian graph, destinations
   ----------------------------------------------------------------------------
   One place where the whole campus geometry is declared. Everything downstream
   reads from here, and the validator checks it.
   ========================================================================== */

import { SITE, lerp } from './00-config.js';
import { RoadGraph } from './05-roads.js';
import { WalkGraph } from './06-walks.js';
import { resamplePath } from './geom.js';

/* the perimeter ring sits at SITE.ringOffset with SITE.ringRadius corners */
const R = SITE.ringOffset;            /* 385 */
const RR = SITE.ringRadius;           /* 70  */
const TAN = R - RR;                   /* 315 — where the corner arcs begin */

/* ============================================================ BUILDING PLOTS
   Declared here so roads, walks and the zone builders all agree.              */
export const PLOTS = {
  /* --- industrial, west band --- */
  hall1:   { x: -240, z: -288, w: 140, d: 56, entry: 'E', service: 'W' },
  hall2:   { x: -240, z: -208, w: 140, d: 56, entry: 'E', service: 'W' },
  hall3:   { x: -240, z: -128, w: 140, d: 56, entry: 'E', service: 'W' },
  hall4:   { x: -240, z:  -48, w: 140, d: 56, entry: 'E', service: 'W' },
  meetme:  { x:  -60, z: -300, w:  44, d: 34, entry: 'W', service: 'E' },
  cooling: { x: -240, z:   52, w:  92, d: 46, entry: 'E', service: 'W' },
  turbine: { x: -240, z:  118, w:  74, d: 36, entry: 'E', service: 'W' },
  wte:     { x: -231, z:  236, w: 106, d: 74, entry: 'E', service: 'W' },
  substation:{ x:-255, z:  320, w:  90, d: 56, entry: 'E', service: 'E' },
  bess:    { x:  -78, z:  118, w:  58, d: 34, entry: 'N', service: 'S' },

  /* --- living systems, east band --- */
  gh1:     { x: 227, z: -318, w: 102, d: 30, entry: 'W', service: 'E' },
  gh2:     { x: 227, z: -266, w: 102, d: 30, entry: 'W', service: 'E' },
  gh3:     { x: 227, z: -214, w: 102, d: 30, entry: 'W', service: 'E' },
  gh4:     { x: 227, z: -162, w: 102, d: 30, entry: 'W', service: 'E' },
  aquaponics:{ x: 228, z: -100, w: 84, d: 52, entry: 'W', service: 'E' },
  foodhub: { x: 230, z:  -40, w: 66, d: 42, entry: 'W', service: 'E' },

  /* --- community, south band --- */
  community:{ x: -90, z: 280, r: 56, rInner: 24 },
  plaza:   { x: 55, z: 272, r: 78 },
  stage:   { x: 55, z: 336, w: 30, d: 16 },
  academy: { x: 215, z: 250, w: 92, d: 56, entry: 'N', service: 'S' },
  trainyard:{ x: 325, z: 250, w: 80, d: 56 },
  agri:    { x: 322, z: 330, w: 72, d: 50 },
  lotA:    { x: 90, z: 95, w: 150, d: 70 },
  lotB:    { x: 237, z: 105, w: 105, d: 60 },
  /* just behind the east sidewalk of the approach — close enough to work
     the lane, clear of the walk. It used to float 21 m out in the grass. */
  gatehouse:{ x: 13.9, z: -410, w: 6.4, d: 7 },
  farmstand:{ x: 132, z: 200, w: 18, d: 10 },
  restroom:{ x: -34, z: 196, w: 16, d: 9 },
};

/* ================================================================== ROADS */
export function buildRoadNetwork() {
  const g = new RoadGraph();
  const N = (id, x, z, t) => g.node(id, x, z, t);

  /* ---- public arterial, north of the campus */
  N('pub-w', -1200, -700, 'boundary');
  N('pub-x1', -260, -700, 'signal');
  N('pub-entry', 0, -700, 'signal');
  N('pub-x2', 300, -700, 'signal');
  N('pub-pk', 640, -700, 'intersection');
  N('pub-e', 1200, -700, 'boundary');
  g.edge('art-1', 'pub-w', 'pub-x1', 'arterial');
  g.edge('art-2', 'pub-x1', 'pub-entry', 'arterial');
  g.edge('art-3', 'pub-entry', 'pub-x2', 'arterial');
  g.edge('art-4', 'pub-x2', 'pub-pk', 'arterial');
  g.edge('art-5', 'pub-pk', 'pub-e', 'arterial');

  /* ---- neighbourhood, north of the arterial */
  N('hm-w', -820, -880, 'cul-de-sac');
  N('hm-x1', -260, -880, 'intersection');
  N('hm-x2', 300, -880, 'intersection');
  N('hm-e', 820, -880, 'cul-de-sac');
  N('hc1-n', -260, -1180, 'cul-de-sac');
  N('hc2-n', 300, -1180, 'cul-de-sac');
  g.edge('hood-1', 'hm-w', 'hm-x1', 'avenue');
  g.edge('hood-2', 'hm-x1', 'hm-x2', 'avenue');
  g.edge('hood-3', 'hm-x2', 'hm-e', 'avenue');
  g.edge('hc1-a', 'hc1-n', 'hm-x1', 'avenue');
  g.edge('hc1-b', 'hm-x1', 'pub-x1', 'avenue');
  g.edge('hc2-a', 'hc2-n', 'hm-x2', 'avenue');
  g.edge('hc2-b', 'hm-x2', 'pub-x2', 'avenue');

  /* ---- the parkway down to the shore, and the shore road */
  N('sr-w', 180, 1215, 'cul-de-sac');
  N('sr-x', 640, 1215, 'intersection');
  N('sr-e', 1100, 1215, 'cul-de-sac');
  g.edge('parkway', 'pub-pk', 'sr-x', 'avenue',
    [[640, -400], [640, 0], [640, 400], [640, 700], [640, 900], [640, 1080]],
    { fillet: 90 });
  g.edge('shore-w', 'sr-x', 'sr-w', 'avenue');
  g.edge('shore-e', 'sr-x', 'sr-e', 'avenue');

  /* ---- campus approach through the north gate */
  N('gate-n', 0, -430, 'gate');
  N('rn', 0, -R, 'intersection');
  g.edge('approach', 'pub-entry', 'gate-n', 'avenue', [[0, -560]], { fillet: 70 });
  g.edge('gate-run', 'gate-n', 'rn', 'avenue');

  /* ---- the perimeter ring: a closed loop with real corner radii.
     v3's "loop" had 20 x 70 m gaps at all four corners. */
  N('ll-n', 130, -R, 'intersection');
  N('rne', TAN, -R, 'intersection');
  N('re', R, 0, 'intersection');
  N('ree', R, 150, 'intersection');
  N('rse', 200, R, 'intersection');
  N('rs', 40, R, 'gate');
  N('rw', -R, 0, 'intersection');
  N('rwg', -R, -120, 'intersection');
  N('ia-n', -150, -R, 'intersection');
  g.edge('ring-1', 'rn', 'll-n', 'campusLoop');
  g.edge('ring-2', 'll-n', 'rne', 'campusLoop');
  g.edge('ring-3', 'rne', 're', 'campusLoop', [[R, -R]], { fillet: RR });
  g.edge('ring-4', 're', 'ree', 'campusLoop');
  g.edge('ring-5', 'ree', 'rse', 'campusLoop', [[R, R]], { fillet: RR });
  g.edge('ring-6', 'rse', 'rs', 'campusLoop');
  g.edge('ring-7', 'rs', 'rw', 'campusLoop', [[-R, R]], { fillet: RR });
  g.edge('ring-8', 'rw', 'rwg', 'campusLoop');
  g.edge('ring-9', 'rwg', 'ia-n', 'campusLoop', [[-R, -R]], { fillet: RR });
  g.edge('ring-10', 'ia-n', 'rn', 'campusLoop');

  /* ---- south gate: service and trailhead access to the watershed corridor */
  N('gate-s', 40, 430, 'gate');
  N('trailhead', 40, 545, 'cul-de-sac');
  g.edge('gate-s-run', 'rs', 'gate-s', 'drive');
  g.edge('trail-drive', 'gate-s', 'trailhead', 'drive');

  /* ---- west utility gate: emergency and transmission access */
  N('gate-w', -430, -120, 'gate');
  N('util-w', -600, -120, 'boundary');
  g.edge('gate-w-run', 'rwg', 'gate-w', 'service');
  g.edge('util-run', 'gate-w', 'util-w', 'service');

  /* ---- central spine (community avenue) and cross street */
  N('sp-h', 0, -330, 'intersection');
  N('xc', 0, 0, 'intersection');
  N('xcm', 0, 150, 'intersection');
  g.edge('spine-1', 'rn', 'sp-h', 'avenue');
  g.edge('spine-2', 'sp-h', 'xc', 'avenue');
  g.edge('spine-3', 'xc', 'xcm', 'avenue');

  N('hx', -330, 0, 'intersection');
  N('ax', -150, 0, 'intersection');
  N('ll-x', 130, 0, 'intersection');
  g.edge('cross-1', 'rw', 'hx', 'campusLoop');
  g.edge('cross-2', 'hx', 'ax', 'campusLoop');
  g.edge('cross-3', 'ax', 'xc', 'campusLoop');
  g.edge('cross-4', 'xc', 'll-x', 'campusLoop');
  g.edge('cross-5', 'll-x', 're', 'campusLoop');

  /* ---- the haul route. It leaves the gate immediately and never touches the
     community entrance, which is the separation i3 describes. */
  N('hw1', -330, -330, 'intersection');
  N('cw', -330, 150, 'intersection');
  N('hs', -330, 300, 'cul-de-sac');
  g.edge('haul-1', 'sp-h', 'hw1', 'service');
  g.edge('haul-2', 'hw1', 'hx', 'service');
  g.edge('haul-3', 'hx', 'cw', 'service');
  g.edge('haul-4', 'cw', 'hs', 'service');

  /* ---- industrial avenue: the compute halls' entry side */
  N('ia-e', -150, 118, 'cul-de-sac');
  g.edge('ia-1', 'ia-n', 'ax', 'service');
  g.edge('ia-2', 'ax', 'ia-e', 'service');

  /* ---- living loop: the greenhouses, aquaponics and food hub */
  g.edge('ll-1', 'll-n', 'll-x', 'avenue');

  /* ---- community avenue */
  N('cc-d', -90, 150, 'intersection');
  N('cc-bulb', -90, 186, 'cul-de-sac');
  N('cae', 240, 150, 'intersection');
  N('acad', 215, 196, 'cul-de-sac');
  g.edge('cave-1', 'cw', 'cc-d', 'campusLoop');
  g.edge('cave-2', 'cc-d', 'xcm', 'campusLoop');
  g.edge('cave-3', 'xcm', 'cae', 'campusLoop');
  g.edge('cave-4', 'cae', 'ree', 'campusLoop');
  g.edge('dropoff', 'cc-d', 'cc-bulb', 'drive');
  g.edge('acad-run', 'cae', 'acad', 'drive');

  /* ---- stage load-in: a permanent stage with 400 A service needs a road */
  N('loadin', 120, 336, 'dock');
  g.edge('loadin-run', 'rse', 'loadin', 'service', [[200, 336]], { fillet: 22 });

  /* ---- fire lane ring behind the compute halls */
  N('fl-n', -348, -352, 'terminus');
  N('fl-s', -348, -20, 'terminus');
  g.edge('firelane', 'fl-n', 'fl-s', 'fire', [[-348, -200]]);
  g.edge('fl-tie-n', 'hw1', 'fl-n', 'fire');
  g.edge('fl-tie-s', 'hx', 'fl-s', 'fire');

  const problems = g.validate();
  g.build();

  /* ---- driveways. Every lot, dock and service entry gets a generated apron;
     in v3 both visitor lots had none at all. */
  const lotA = PLOTS.lotA, lotB = PLOTS.lotB;
  const cave2 = g.edges.find((e) => e.id === 'cave-2');
  const cave3 = g.edges.find((e) => e.id === 'cave-3');
  if (cave2) g.apron('lotA-w', cave2, distAlong(cave2, 30, 150), -1, 30, lotA.z + lotA.d / 2 - 1, 8);
  if (cave3) g.apron('lotA-e', cave3, distAlong(cave3, 150, 150), -1, 150, lotA.z + lotA.d / 2 - 1, 8);
  if (cave3) g.apron('lotB', cave3, distAlong(cave3, 237, 150), -1, 237, lotB.z + lotB.d / 2 - 1, 8);

  return { graph: g, problems };
}

function distAlong(edge, x, z) {
  const sm = edge.geomSamples || edge.samples;
  let best = 0, bd = Infinity;
  for (const p of sm) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p.s; }
  }
  return best;
}

/* ================================================================== WALKS */
export function buildWalkNetwork(roads) {
  const w = new WalkGraph();
  const N = (id, x, z, k) => w.node(id, x, z, k);

  /* ---- sidewalks generated alongside every road that declares them.
     This is what turns "three orphan stubs" into an actual network. */
  const made = new Set();
  for (const e of roads.edges) {
    const sp = e.spec;
    if (sp.sidewalk === 'none' || !e.geomSamples) continue;
    const sides = sp.sidewalk === 'both' ? [-1, 1] : [swInner(e)];
    for (const side of sides) {
      const off = e.half + (sp.curbW || 0) + Math.min(sp.verge, 4.2) * 0.55 + 0.9;
      const sm = e.geomSamples;
      const pts = [];
      const stride = Math.max(1, Math.floor(sm.length / 24));
      for (let i = 0; i < sm.length; i += stride) {
        const p = sm[i];
        pts.push([p.x + p.nx * side * off, p.z + p.nz * side * off]);
      }
      const last = sm[sm.length - 1];
      pts.push([last.x + last.nx * side * off, last.z + last.nz * side * off]);
      if (pts.length < 2) continue;
      const aId = `sw-${e.id}-${side > 0 ? 'l' : 'r'}-a`;
      const bId = `sw-${e.id}-${side > 0 ? 'l' : 'r'}-b`;
      N(aId, pts[0][0], pts[0][1], 'sidewalk-end');
      N(bId, pts[pts.length - 1][0], pts[pts.length - 1][1], 'sidewalk-end');
      const cls = sp === roads.edges[0].spec ? 'sidewalkWide' : 'sidewalk';
      w.edge(`sw-${e.id}-${side > 0 ? 'l' : 'r'}`, aId, bId,
        e.cls === 'arterial' ? 'sidewalkWide' : 'sidewalk',
        pts.slice(1, -1), { allow: ['road', e.id, e.a.id, e.b.id, 'apron'] });
      made.add(e.id + '|' + side);
      e.walkNodes = e.walkNodes || {};
      e.walkNodes[side] = { a: aId, b: bId };
    }
  }

  /* ---- stitch the sidewalks together at every shared road node.
     The old rule connected ANY two ends under 26 m with a straight walk —
     which included ends on opposite sides of a mouth, so sidewalks ran
     straight across the middle of every intersection — and linked ends 26 to
     70 m apart as "crossings", which included the diagonals. A real corner
     is: walks on the SAME corner sweep around the kerb return; walks on
     opposite sides of the SAME road cross at the marked crosswalk; nothing
     ever cuts the diagonal. */
  for (const n of roads.nodes.values()) {
    const ends = [];
    for (const { e, end } of n.edges) {
      if (!e.walkNodes) continue;
      for (const side of Object.keys(e.walkNodes)) {
        const id = e.walkNodes[side][end === 'a' ? 'a' : 'b'];
        const wn = w.nodes.get(id);
        if (!wn) continue;
        ends.push({
          id, e, side: +side, x: wn.x, z: wn.z,
          ang: Math.atan2(wn.z - n.z, wn.x - n.x),
          dist: Math.hypot(wn.x - n.x, wn.z - n.z),
        });
      }
    }
    /* corner connectors: angularly adjacent ends of two DIFFERENT roads,
       routed through a waypoint on the corner arc so the walk goes around
       the return, never across the pavement */
    ends.sort((a, b) => a.ang - b.ang);
    for (let i = 0; i < ends.length; i++) {
      const A = ends[i], B = ends[(i + 1) % ends.length];
      if (!B || A === B) continue;
      if (A.e === B.e && A.side !== B.side) continue;   /* that pair is a crossing */
      let dAng = B.ang - A.ang;
      if (dAng <= 0) dAng += Math.PI * 2;
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d < 0.5 || d > 34 || dAng > 2.4) continue;
      /* The corner walk hugs the kerb return: radius interpolates from one
         end's offset to the other's (two roads of different widths meet at
         every corner), pulled slightly inside the chord so it stays over
         road-owned ground instead of swinging into the corner lot. */
      const r1 = lerp(A.dist, B.dist, 0.33) * 0.93;
      const r2 = lerp(A.dist, B.dist, 0.67) * 0.93;
      const w1 = A.ang + dAng * 0.33, w2 = A.ang + dAng * 0.67;
      w.edge(`swx-${n.id}-${i}`, A.id, B.id, 'sidewalk',
        [[n.x + Math.cos(w1) * r1, n.z + Math.sin(w1) * r1],
         [n.x + Math.cos(w2) * r2, n.z + Math.sin(w2) * r2]],
        { allow: ['road', 'apron', n.id, A.e.id, B.e.id], fillet: 5 });
    }
    /* crossings: the two sides of one road, at this node's mouth, linked
       across the carriageway where the road builder paints the crosswalk */
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const A = ends[i], B = ends[j];
        if (A.e !== B.e || A.side === B.side) continue;
        const d = Math.hypot(A.x - B.x, A.z - B.z);
        if (d < 0.5 || d > 46) continue;
        w.crossing(`cross-${n.id}-${i}-${j}`, A.id, B.id, n.id);
      }
    }
  }

  /* ---- the civic spine: parking to plaza to community center to greenhouses
     to aquaponics to food hub to the ponds and the boardwalk */
  N('p-lotA', 90, 128, 'plaza');
  N('p-plazaN', 55, 190, 'plaza');
  N('p-plazaC', 55, 268, 'plaza');
  N('p-plazaS', 55, 318, 'plaza');
  N('p-ccE', -26, 280, 'entry');
  N('p-ccN', -90, 216, 'entry');
  N('p-bulb', -90, 172, 'walk');
  N('p-stand', 132, 184, 'walk');
  N('p-rest', -34, 184, 'walk');
  w.edge('spine-lotA', 'p-lotA', 'p-plazaN', 'plazaSpine', [[74, 148]], { allow: ['road', 'apron', 'lot', 'lotA', 'xcm', 'cave-2', 'cave-3'] });
  w.edge('spine-plaza1', 'p-plazaN', 'p-plazaC', 'promenade');
  w.edge('spine-plaza2', 'p-plazaC', 'p-plazaS', 'promenade');
  w.edge('spine-ccE', 'p-plazaC', 'p-ccE', 'promenade');
  w.edge('spine-ccN', 'p-ccE', 'p-ccN', 'plazaSpine', [[-30, 224], [-62, 214]], { allow: ['cc'] });
  w.edge('spine-bulb', 'p-ccN', 'p-bulb', 'sidewalkWide', null, { allow: ['road', 'cc-bulb', 'dropoff'] });
  w.edge('spine-stand', 'p-plazaN', 'p-stand', 'plazaSpine', [[100, 186]]);
  w.edge('spine-rest', 'p-plazaN', 'p-rest', 'plazaSpine', [[10, 180]]);

  /* ---- east: living systems */
  N('p-ghW', 168, -240, 'walk');
  N('p-gh1', 170, -318, 'entry');
  N('p-gh2', 170, -266, 'entry');
  N('p-gh3', 170, -214, 'entry');
  N('p-gh4', 170, -162, 'entry');
  N('p-aqua', 172, -100, 'entry');
  N('p-food', 182, -40, 'entry');
  N('p-llx', 148, 0, 'walk');
  N('p-lln', 148, -344, 'walk');
  w.edge('gh-spine', 'p-lln', 'p-ghW', 'sidewalkWide', [[168, -344]]);
  w.edge('gh-spine2', 'p-ghW', 'p-llx', 'sidewalkWide', [[168, -60], [152, -20]],
    { allow: ['road', 'll-x', 'cross-4', 'cross-5', 'll-1'] });
  for (const k of ['gh1', 'gh2', 'gh3', 'gh4']) {
    w.edge('w-' + k, 'p-ghW', 'p-' + k, 'sidewalk', null, { fillet: 3 });
  }
  w.edge('w-aqua', 'p-ghW', 'p-aqua', 'sidewalk', [[168, -100]], { fillet: 3 });
  w.edge('w-food', 'p-llx', 'p-food', 'sidewalk', [[168, -40]], { fillet: 3 });

  /* the ponds and the boardwalk. Where the route crosses water it becomes a
     boardwalk on piles; v3 ran a gravel path 6.6 m into a pond. */
  N('p-pondW', 292, -348, 'walk');
  N('p-pondN', 330, -348, 'walk');
  N('p-bwA', 300, -258, 'walk');
  N('p-bwB', 356, -214, 'walk');
  N('p-pondC', 300, -126, 'walk');
  N('p-pondS', 292, -72, 'walk');
  w.edge('pond-1', 'p-ghW', 'p-pondW', 'parkPath', [[168, -348]]);
  w.edge('pond-2', 'p-pondW', 'p-pondN', 'parkPath', [[306, -348]]);
  w.edge('pond-bw', 'p-pondW', 'p-bwA', 'boardwalk', [[294, -300]], { allow: ['water'] });
  w.edge('pond-bw2', 'p-bwA', 'p-bwB', 'boardwalk', [[330, -240]], { allow: ['water'] });
  w.edge('pond-3', 'p-bwB', 'p-pondC', 'parkPath', [[362, -170]]);
  w.edge('pond-4', 'p-pondC', 'p-pondS', 'parkPath');
  w.edge('pond-5', 'p-pondS', 'p-food', 'parkPath', [[272, -68], [190, -66]]);

  /* ---- academy and training yard */
  N('p-acad', 215, 208, 'entry');
  N('p-yard', 272, 250, 'entry');
  w.edge('w-acad', 'p-stand', 'p-acad', 'sidewalkWide', [[176, 188], [204, 198]]);
  w.edge('w-yard', 'p-acad', 'p-yard', 'sidewalk', [[266, 212]]);

  /* ---- compute core: every hall entry connects to the industrial avenue */
  const hallEntries = [
    ['hall1', -168, -288], ['hall2', -168, -208], ['hall3', -168, -128], ['hall4', -168, -48],
  ];
  N('p-iaN', -132, -368, 'walk');
  N('p-iaS', -132, 112, 'walk');
  w.edge('ia-walk', 'p-iaN', 'p-iaS', 'sidewalk',
    [[-132, -300], [-132, -140], [-132, 0]],
    { allow: ['road', 'ia-1', 'ia-2', 'ax', 'cross-2', 'cross-3', 'ia-n'] });
  for (const [k, ex, ez] of hallEntries) {
    N('p-' + k, ex, ez, 'entry');
    w.edge('w-' + k, 'p-iaS', 'p-' + k, 'sidewalk', [[-132, ez]], { fillet: 3 });
  }
  N('p-meetme', -60, -272, 'entry');
  w.edge('w-meetme', 'p-iaN', 'p-meetme', 'sidewalk', [[-104, -350], [-92, -300], [-88, -276]], { allow: ['road', 'apron'] });

  /* ---- gatehouse and transit */
  N('p-gate', 14, -404, 'entry');
  N('p-transit', -18, -672, 'transit');
  /* the pedestrian route passes THROUGH the gate opening beside the road,
     then turns west inside the wall — it used to cut the wall line 23 m west
     of the opening, straight through where the wall now stands */
  w.edge('w-gate', 'p-gate', 'p-iaN', 'sidewalk', [[-8, -393], [-70, -378]], { allow: ['road', 'apron'] });
  w.edge('w-gate2', 'p-gate', 'p-lln', 'sidewalk', [[10, -382], [70, -370]], { allow: ['road', 'apron'] });

  /* ---- the watershed corridor trail, running from the south gate to the
     coast. This is the spine of the environmental story. */
  N('p-trailhead', 46, 548, 'trailhead');
  N('p-outfall', 52, 540, 'walk');
  N('p-creek1', 96, 640, 'walk');
  N('p-creek2', 64, 760, 'walk');
  N('p-wq', 120, 830, 'walk');
  N('p-bridge-a', 70, 872, 'walk');
  N('p-bridge-b', 40, 896, 'walk');
  N('p-marsh', -30, 980, 'walk');
  N('p-dock', -86, 1042, 'walk');
  N('p-shore', 120, 1196, 'walk');
  N('p-duneW', 40, 1236, 'walk');
  N('p-heritage1', 60, 1258, 'heritage');
  N('p-heritage2', 92, 1274, 'heritage');
  N('p-crest', 120, 1290, 'heritage');
  N('p-beach', 150, 1330, 'beach');
  N('p-lotBeach', 620, 1246, 'lot');

  w.edge('trail-1', 'p-trailhead', 'p-outfall', 'parkPath', null, { allow: ['road', 'trailhead', 'trail-drive'] });
  w.edge('trail-2', 'p-outfall', 'p-creek1', 'natureTrail', [[70, 580]]);
  w.edge('trail-3', 'p-creek1', 'p-creek2', 'natureTrail', [[110, 700]]);
  w.edge('trail-4', 'p-creek2', 'p-wq', 'natureTrail', [[80, 800]]);
  w.edge('trail-5', 'p-wq', 'p-bridge-a', 'natureTrail', [[104, 856]]);
  w.edge('trail-bridge', 'p-bridge-a', 'p-bridge-b', 'boardwalk', null, { allow: ['water'], rail: true });
  w.edge('trail-6', 'p-bridge-b', 'p-marsh', 'natureTrail', [[8, 934]]);
  w.edge('trail-7', 'p-marsh', 'p-dock', 'boardwalk', [[-56, 1010]], { allow: ['water'] });
  w.edge('trail-8', 'p-marsh', 'p-shore', 'natureTrail', [[40, 1080], [96, 1150]]);
  w.edge('trail-9', 'p-shore', 'p-duneW', 'parkPath', [[70, 1216]],
    { allow: ['road', 'shore-w', 'sr-w'] });
  w.edge('dune-1', 'p-duneW', 'p-heritage1', 'beachAccess', null, { allow: ['water'] });
  w.edge('dune-2', 'p-heritage1', 'p-heritage2', 'beachAccess', null, { allow: ['water'] });
  w.edge('dune-3', 'p-heritage2', 'p-crest', 'beachAccess', null, { allow: ['water'] });
  w.edge('dune-4', 'p-crest', 'p-beach', 'beachAccess', [[136, 1312]], { allow: ['water'] });

  /* beach parking connects to the shore road and to the crossover */
  N('p-lotBeachW', 560, 1250, 'walk');
  w.edge('beach-lot', 'p-lotBeach', 'p-lotBeachW', 'sidewalkWide', null,
    { allow: ['road', 'shore-w', 'shore-e', 'sr-x'] });
  N('p-crossE', 500, 1262, 'walk');
  N('p-crestE', 470, 1292, 'heritage');
  N('p-beachE', 450, 1332, 'beach');
  w.edge('beach-cross', 'p-lotBeachW', 'p-crossE', 'parkPath');
  w.edge('dune-e1', 'p-crossE', 'p-crestE', 'beachAccess', null, { allow: ['water'] });
  w.edge('dune-e2', 'p-crestE', 'p-beachE', 'beachAccess', null, { allow: ['water'] });

  /* link the shore road sidewalk into the trail network */
  N('p-shoreRoad', 200, 1196, 'walk');
  w.edge('shore-tie', 'p-shore', 'p-shoreRoad', 'sidewalk');
  w.edge('shore-tie2', 'p-shoreRoad', 'p-lotBeachW', 'sidewalkWide',
    [[340, 1200], [470, 1230]], { allow: ['road', 'shore-w', 'sr-x', 'sr-w'] });

  /* ---- the ties that make the network one connected graph. Every one of
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

function swInner(e) {
  /* the inner side of the ring faces the campus centre */
  const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2;
  const sm = e.geomSamples || e.samples;
  const p = sm[Math.floor(sm.length / 2)];
  const toCentre = [-p.x, -p.z];
  const dot = p.nx * toCentre[0] + p.nz * toCentre[1];
  return dot > 0 ? 1 : -1;
}

/* the destinations that Gate 6 requires to be walkable, and the sources it
   requires them to be walkable FROM */
export function wireDestinations(w, roads) {
  const D = (id, node, label) => { if (w.nodes.has(node)) w.destination(id, node, label); };
  const S = (node) => { if (w.nodes.has(node)) w.source(node); };

  D('community-center', 'p-ccE', 'Community center');
  D('event-plaza', 'p-plazaC', 'Event plaza');
  D('stage', 'p-plazaS', 'Stage');
  D('greenhouse-1', 'p-gh1', 'Greenhouse 1');
  D('greenhouse-2', 'p-gh2', 'Greenhouse 2');
  D('greenhouse-3', 'p-gh3', 'Greenhouse 3');
  D('greenhouse-4', 'p-gh4', 'Greenhouse 4');
  D('aquaponics', 'p-aqua', 'Aquaponics and marine showcase');
  D('food-hub', 'p-food', 'Food hub');
  D('farm-stand', 'p-stand', 'Farm stand');
  D('academy', 'p-acad', 'Workforce academy');
  D('training-yard', 'p-yard', 'Training yard');
  D('pond-a', 'p-pondN', 'Pond A');
  D('pond-b', 'p-bwB', 'Pond B');
  D('pond-c', 'p-pondC', 'Pond C');
  D('boardwalk', 'p-bwA', 'Pond boardwalk');
  D('gatehouse', 'p-gate', 'Gatehouse');
  D('meet-me', 'p-meetme', 'Meet-me room');
  D('trailhead', 'p-trailhead', 'Watershed trailhead');
  D('water-quality', 'p-wq', 'Water quality station');
  D('marsh-dock', 'p-dock', 'Estuary research dock');
  D('heritage-1', 'p-heritage1', 'Heritage marker 1');
  D('heritage-2', 'p-heritage2', 'Heritage marker 2');
  D('sculpture', 'p-crest', 'Recovered-material sculpture');
  D('beach', 'p-beach', 'Beach');
  D('beach-east', 'p-beachE', 'Beach (east crossover)');
  D('restroom', 'p-rest', 'Restrooms');
  for (const k of ['hall1', 'hall2', 'hall3', 'hall4']) {
    D(k, 'p-' + k, 'Compute hall ' + k.slice(-1));
  }

  S('p-lotA');           /* community parking */
  S('p-lotBeach');       /* beach parking */
  S('p-gate');           /* the gatehouse */
  S('p-bulb');           /* the accessible drop-off */
  S('p-lln');            /* the public sidewalk at the north gate */
}
