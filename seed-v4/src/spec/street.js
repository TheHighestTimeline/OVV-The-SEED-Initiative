/* ============================================================================
   spec/street.js — carriageway, curb, gutter, sidewalk, markings
   ----------------------------------------------------------------------------
   Sources, per value in the comments:
     AASHTO  — A Policy on Geometric Design of Highways and Streets, 7th ed.
     MUTCD   — Manual on Uniform Traffic Control Devices, 11th ed. (2023)
     PROWAG  — Public Right-of-Way Accessibility Guidelines (2023 final rule)
     NACTO   — Urban Street Design Guide, where it is the tighter urban value

   Where a standard gives a range, both ends are recorded and the value the
   world builds with is named `used`. Where a number is a design choice rather
   than a requirement it says so. Nothing here is invented to look right.
   ========================================================================== */

import { IN, FT, FTIN, MPH, GRADE, SLOPE } from './units.js';

/* ------------------------------------------------------------------ lanes */
export const LANE = {
  /* AASHTO 7th ed. Table 5-5. 12 ft is the arterial standard; NACTO and most
     urban agencies use 10 ft on local streets to hold speeds down, and the
     campus streets here are deliberately narrow for that reason. */
  arterial:   FT(12.0),
  collector:  FT(11.0),
  local:      FT(10.0),
  turn:       FT(10.0),     /* AASHTO min for an exclusive turn lane        */
  parking:    FT(8.0),      /* parallel parking bay, AASHTO 7 to 8 ft       */
  bike:       FT(6.0),      /* AASHTO Bike Guide: 5 ft min, 6 ft preferred  */
  bikeBuffer: FT(3.0),      /* buffered bike lane separation                */
  shoulder:   FT(8.0),      /* rural arterial, AASHTO Table 5-5             */
  shoulderMin: FT(4.0),

  /* Cross slope on the carriageway, for drainage. AASHTO 4.2: 1.5 to 2% on
     high-type pavement. Steeper reads as a crowned country road. */
  crossSlope: 0.020,
};

/* ------------------------------------------------------------------ curbs */
export const CURB = {
  /* AASHTO 4.5 / standard municipal detail. A vertical curb reveal of 6 in is
     the near-universal US value; 4 in appears on residential streets. */
  revealVertical: IN(6.0),
  revealMountable: IN(4.0),
  /* Barrier curb face batter — a "vertical" curb is actually raked back
     slightly so a tyre scuffs rather than catches. */
  faceBatter:    IN(1.0),
  /* Curb-and-gutter is cast as one piece. 24 in total is the common detail
     (6 in curb + 18 in gutter pan); 30 in appears on arterials. */
  width:         IN(6.0),   /* the curb stone itself                        */
  gutterWidth:   IN(18.0),
  gutterSlope:   0.0833,    /* 1 in per foot toward the inlet, standard      */
  depthBelow:    IN(12.0),  /* buried depth of the curb section             */

  /* Corner return radius at an intersection. AASHTO 9.5: 15 ft minimum for
     passenger vehicles, 25 to 30 ft where a bus or truck must turn. Small
     radii are a deliberate choice — they shorten the crossing and force the
     turn to be taken slowly. */
  radiusLocal:   FT(15.0),
  radiusBus:     FT(25.0),
  radiusTruck:   FT(35.0),
};

/* -------------------------------------------------------------- sidewalks */
export const WALK = {
  /* PROWAG R302.3: 4 ft minimum continuous clear width, exclusive of the
     curb. R302.4: a 5 ft x 5 ft passing space at least every 200 ft where
     the walk is under 5 ft. Building at 5 ft avoids needing passing spaces;
     6 ft is the campus standard so two people pass without stepping off. */
  clearMin:      FT(4.0),
  clearStandard: FT(5.0),
  clearCampus:   FT(6.0),
  clearPromenade: FT(12.0),
  passingSpace:  FT(5.0),
  passingInterval: FT(200.0),

  /* PROWAG R302.6: cross slope 2% max. R302.5: running slope not steeper
     than the general grade of the adjacent street — a sidewalk is allowed to
     follow a steep road, but not to be steeper than it. */
  crossSlopeMax: 0.020,
  crossSlopeUsed: 0.015,    /* built at 1.5% to leave tolerance             */

  /* The furnishing zone between curb face and walking surface. Everything
     vertical — poles, signs, hydrants, bins, trees — lives here and nowhere
     else. NACTO: 4 ft minimum where street trees are planted, 6 ft preferred. */
  furnishWidth:   FT(6.0),
  furnishMin:     FT(4.0),
  /* Frontage zone at a building face, so doors and window shoppers do not
     block the through walk. */
  frontageWidth:  FT(2.0),

  /* Vertical clearance over any walking surface. PROWAG R402: 80 in min to
     the lowest part of a sign, awning or branch. */
  headroom:      IN(80.0),

  /* Concrete detail: 4 in slab on 4 in aggregate base, control joints at
     intervals equal to the slab width so panels crack where intended. */
  slabThickness: IN(4.0),
  baseThickness: IN(4.0),
  jointDepth:    IN(1.0),
  jointWidth:    IN(0.25),
  jointSpacing:  FT(5.0),   /* = the 5 ft walk width, square panels          */
  expansionSpacing: FT(20.0),
};

/* ------------------------------------------------ crosswalks and markings */
export const MARKING = {
  /* MUTCD 3B.18. Transverse crosswalk lines 6 to 24 in wide, spaced 6 ft
     minimum apart. Continental (ladder) bars are 12 to 24 in wide at 12 to
     60 in spacing and are markedly more visible to drivers, which is why
     they are used at every campus crossing. */
  crosswalkLineWidth:   IN(12.0),
  crosswalkBarWidth:    IN(24.0),
  crosswalkBarGap:      IN(24.0),
  crosswalkWidthMin:    FT(6.0),
  crosswalkWidthUsed:   FT(10.0),
  /* Continental bars are laid to avoid the wheel paths so they wear slower. */
  crosswalkWheelPathGap: FT(2.5),

  /* MUTCD 3B.16: stop line 12 to 24 in wide, set 4 ft in advance of the
     nearest crosswalk line. */
  stopLineWidth:    IN(24.0),
  stopLineSetback:  FT(4.0),

  /* MUTCD 3A.05: normal line 4 to 6 in, wide line at least twice normal. */
  lineNormal:   IN(4.0),
  lineWide:     IN(8.0),
  /* MUTCD 3B.01: broken line 10 ft segment, 30 ft gap on most roads. */
  dashSegment:  FT(10.0),
  dashGap:      FT(30.0),
  /* Dotted extension line through an intersection or across a ramp. */
  dotSegment:   FT(3.0),
  dotGap:       FT(9.0),

  /* Thermoplastic build thickness — enough to catch a headlight at a low
     angle and to read as raised in a grazing sun. */
  thickness:    IN(0.09),

  /* MUTCD 3B.20 pavement word and symbol markings are elongated so they read
     correctly in perspective from a driver's eye. */
  wordHeight:   FT(8.0),
  arrowLength:  FT(9.5),
  bikeSymbolLength: FT(6.0),
};

/* --------------------------------------------------------- design speeds */
export const SPEED = {
  campusService: MPH(15),
  campusLoop:    MPH(25),
  collector:     MPH(35),
  arterial:      MPH(45),
  /* AASHTO 3.2.2 stopping sight distance at each, for placing signs far
     enough ahead of what they warn about. */
  ssd: { 15: FT(80), 25: FT(155), 35: FT(250), 45: FT(360) },
};

/* ------------------------------------------------------------- driveways */
export const DRIVEWAY = {
  widthResidential: FT(12.0),
  widthCommercial:  FT(24.0),
  widthService:     FT(30.0),
  flareRadius:      FT(10.0),
  /* Apron cross slope must stay at or under the sidewalk maximum where the
     walk crosses it — this is the single most commonly violated PROWAG rule
     in the built world, so it gets an explicit value here. */
  apronCrossSlopeMax: 0.020,
};

/* ------------------------------------------------------------ drainage */
export const DRAINAGE = {
  /* Curb inlet: throat opening height and length, standard municipal detail. */
  inletThroatHeight: IN(6.0),
  inletThroatLength: FT(4.0),
  inletSpacingMax:   FT(300.0),
  /* Grate inlet in the gutter line. */
  grateWidth:  FT(2.0),
  grateLength: FT(3.0),
  /* Manhole: 24 in clear opening is the code minimum for entry with a
     self-contained breathing apparatus; the frame is larger. */
  manholeClearOpening: IN(24.0),
  manholeFrameDia:     IN(32.0),
  manholeCoverThick:   IN(1.75),
  manholeSpacing:      FT(400.0),
  /* Valve box in the pavement. */
  valveBoxDia: IN(8.0),
};

Object.freeze(LANE); Object.freeze(CURB); Object.freeze(WALK);
Object.freeze(MARKING); Object.freeze(SPEED); Object.freeze(DRIVEWAY);
Object.freeze(DRAINAGE);

/* ============================================================ cross-section
   Builds an ordered list of lateral bands for a street class, from the
   centreline outward. The road builder consumes this instead of the ad-hoc
   half-widths it used before, so a sidewalk can never end up inside a travel
   lane and the total right-of-way is the sum of real parts.               */
export function crossSection(cls) {
  const bands = [];
  const add = (name, width, kind) => {
    if (width > 0) bands.push({ name, width, kind });
  };

  switch (cls) {
    case 'arterial':
      add('travel', LANE.arterial, 'pavement');
      add('travel', LANE.arterial, 'pavement');
      add('bike', LANE.bike, 'pavement');
      add('gutter', CURB.gutterWidth, 'gutter');
      add('curb', CURB.width, 'curb');
      add('furnish', WALK.furnishWidth, 'furnishing');
      add('walk', WALK.clearCampus, 'walk');
      break;
    case 'collector':
    case 'avenue':
      add('travel', LANE.collector, 'pavement');
      add('parking', LANE.parking, 'pavement');
      add('gutter', CURB.gutterWidth, 'gutter');
      add('curb', CURB.width, 'curb');
      add('furnish', WALK.furnishWidth, 'furnishing');
      add('walk', WALK.clearCampus, 'walk');
      break;
    case 'campusLoop':
      add('travel', LANE.local, 'pavement');
      add('bike', LANE.bike, 'pavement');
      add('gutter', CURB.gutterWidth, 'gutter');
      add('curb', CURB.width, 'curb');
      add('furnish', WALK.furnishWidth, 'furnishing');
      add('walk', WALK.clearCampus, 'walk');
      break;
    case 'service':
      add('travel', LANE.turn, 'pavement');
      add('travel', LANE.turn, 'pavement');
      add('shoulder', LANE.shoulderMin, 'shoulder');
      break;
    default:
      add('travel', LANE.local, 'pavement');
      add('gutter', CURB.gutterWidth, 'gutter');
      add('curb', CURB.width, 'curb');
      add('walk', WALK.clearStandard, 'walk');
  }

  /* running offsets from the centreline, so a consumer can ask "where does
     the curb face sit" without re-adding the widths itself */
  let o = 0;
  for (const b of bands) { b.inner = o; o += b.width; b.outer = o; }
  return { bands, halfWidth: o };
}

/** Lateral offset from centreline to the curb face for a street class. */
export function curbFaceOffset(cls) {
  const { bands } = crossSection(cls);
  const curb = bands.find((b) => b.kind === 'curb');
  return curb ? curb.inner : crossSection(cls).halfWidth;
}

/** Centre of the furnishing zone — where every pole and sign is planted. */
export function furnishOffset(cls) {
  const { bands } = crossSection(cls);
  const f = bands.find((b) => b.kind === 'furnishing');
  if (f) return (f.inner + f.outer) / 2;
  return curbFaceOffset(cls) + WALK.furnishMin / 2;
}
