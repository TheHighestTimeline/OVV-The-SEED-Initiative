/* ============================================================================
   spec/signage.js — MUTCD regulatory, warning and guide signs
   ----------------------------------------------------------------------------
   MUTCD 11th edition (2023). Sizes are Table 2B-1 (regulatory), 2C-2
   (warning) and 2D-1 (guide). Mounting is 2A.18, colours are 2A.11 and the
   colour chips are the published PMS equivalents converted to sRGB.

   A sign in this world is never drawn at an arbitrary size. It is drawn at
   the size the code publishes for the class of road it stands on, which is
   why every entry carries `conventional` and `multilane` variants.
   ========================================================================== */

import { IN, FT, FTIN } from './units.js';

/* ------------------------------------------------------------- mounting */
export const MOUNT = {
  /* MUTCD 2A.18. Height is measured from the bottom of the sign to the level
     of the near edge of the travelled way, not to the ground under the post. */
  heightRural:   FT(5.0),   /* rural district minimum                       */
  heightUrban:   FT(7.0),   /* where parking or pedestrian movement occurs  */
  heightSecondary: FT(4.0), /* a plaque mounted below a primary sign        */
  /* Over a sidewalk the controlling number is not MUTCD but PROWAG R402:
     80 in of clear headroom. Where a sign overhangs a walk this wins. */
  heightOverWalk: IN(80.0),

  /* Lateral offset. Urban, curbed: 2 ft from the curb face to the near edge
     of the sign, 1 ft absolute minimum. Rural: 6 ft from the shoulder edge,
     12 ft desirable. Measured to the sign edge, not the post centre. */
  offsetUrban:    FT(2.0),
  offsetUrbanMin: FT(1.0),
  offsetRural:    FT(6.0),
  offsetRuralDesirable: FT(12.0),

  /* Panel is 0.080 in aluminium; two posts once a panel exceeds ~4 ft wide,
     because a single post lets a wide panel spin in a wind load. */
  panelThickness: IN(0.080),
  twoPostAbove:   FT(4.0),
  twoPostSpacing: 0.6,      /* fraction of panel width between the posts    */
};

/* ---------------------------------------------------------------- posts */
export const POST = {
  /* Perforated square steel tube, the standard breakaway small-sign support.
     2 in nominal, 12 gauge, in a 2.25 in sleeve driven to 3 ft. */
  squareTubeSide: IN(2.0),
  sleeveSide:     IN(2.25),
  embedDepth:     FT(3.0),
  /* U-channel, the other common support: 3 lb/ft, 2.5 in flange. */
  uChannelFlange: IN(2.5),
  uChannelWeb:    IN(1.5),
  /* Anchor stub projecting above grade before the post starts. */
  stubHeight:     IN(4.0),
};

/* --------------------------------------------------------------- colours
   MUTCD 2A.11 standard colours, PMS equivalents converted to sRGB. These are
   the actual specified hues — sign red is a warm PMS 187, not pure red, and
   the difference is visible the moment two signs stand next to each other. */
export const SIGN_COLOUR = {
  red:        0xaf1e2d,   /* PMS 187 — STOP, DO NOT ENTER, WRONG WAY        */
  white:      0xf2f2f2,   /* regulatory background and legend               */
  black:      0x1a1a1a,   /* regulatory legend                              */
  yellow:     0xffcc00,   /* PMS 116 — warning                              */
  fluorGreen: 0xd6e64b,   /* fluorescent yellow-green — pedestrian, school  */
  orange:     0xf58220,   /* PMS 152 — temporary traffic control            */
  green:      0x006747,   /* PMS 342 — guide, permissive regulatory         */
  blue:       0x00558c,   /* PMS 294 — motorist services                    */
  brown:      0x604020,   /* PMS 476 — recreational and cultural interest   */
  purple:     0x653279,   /* PMS 259 — toll / electronic collection lanes   */
  pink:       0xe8adc4,   /* PMS 205 — incident management                  */
};

/* ------------------------------------------------------------ sign table
   `w` and `h` are the panel dimensions. `shape` drives the geometry
   builder. `mount` is the height to the BOTTOM of the panel, defaulting to
   the urban 7 ft where pedestrians are present.                            */
export const SIGNS = {
  /* --- regulatory, MUTCD Table 2B-1 --------------------------------- */
  stop: {
    code: 'R1-1', shape: 'octagon',
    conventional: { w: IN(30), h: IN(30) },
    multilane:    { w: IN(36), h: IN(36) },
    minimum:      { w: IN(24), h: IN(24) },
    face: SIGN_COLOUR.red, legend: SIGN_COLOUR.white,
    border: SIGN_COLOUR.white, borderWidth: IN(0.75),
    legendText: 'STOP', legendHeight: IN(10),
  },
  yield: {
    code: 'R1-2', shape: 'triangleDown',
    conventional: { w: IN(36), h: IN(36) },
    multilane:    { w: IN(48), h: IN(48) },
    face: SIGN_COLOUR.white, legend: SIGN_COLOUR.red,
    border: SIGN_COLOUR.red, borderWidth: IN(2.0),
    legendText: 'YIELD', legendHeight: IN(6),
  },
  allWayPlaque: {
    code: 'R1-3P', shape: 'rect',
    conventional: { w: IN(18), h: IN(6) },
    face: SIGN_COLOUR.red, legend: SIGN_COLOUR.white,
    legendText: 'ALL WAY', legendHeight: IN(4),
  },
  speedLimit: {
    code: 'R2-1', shape: 'rect',
    conventional: { w: IN(24), h: IN(30) },
    multilane:    { w: IN(30), h: IN(36) },
    face: SIGN_COLOUR.white, legend: SIGN_COLOUR.black,
    border: SIGN_COLOUR.black, borderWidth: IN(0.625),
    legendText: 'SPEED\nLIMIT', legendHeight: IN(4),
  },
  doNotEnter: {
    code: 'R5-1', shape: 'square',
    conventional: { w: IN(30), h: IN(30) },
    face: SIGN_COLOUR.white, legend: SIGN_COLOUR.red,
    legendText: 'DO NOT ENTER', legendHeight: IN(3),
  },
  noParking: {
    code: 'R7-1', shape: 'rect',
    conventional: { w: IN(12), h: IN(18) },
    face: SIGN_COLOUR.white, legend: SIGN_COLOUR.red,
    border: SIGN_COLOUR.red, borderWidth: IN(0.5),
    legendText: 'NO\nPARKING', legendHeight: IN(2.5),
  },
  accessibleParking: {
    code: 'R7-8', shape: 'rect',
    conventional: { w: IN(12), h: IN(18) },
    face: SIGN_COLOUR.white, legend: SIGN_COLOUR.blue,
    border: SIGN_COLOUR.blue, borderWidth: IN(0.5),
    /* R7-8 must be mounted so the bottom is 60 in above grade so it stays
       visible over a parked vehicle — this one overrides the urban default. */
    mount: IN(60),
  },
  pedCrossing: {
    /* MUTCD 2B.20 — in-street or post-mounted at an uncontrolled crossing. */
    code: 'R1-6', shape: 'rect',
    conventional: { w: IN(12), h: IN(36) },
    face: SIGN_COLOUR.fluorGreen, legend: SIGN_COLOUR.black,
    legendText: 'STATE LAW\nYIELD\nTO PEDESTRIANS',
    mount: IN(4),           /* in-street, on a flexible base at the line   */
  },

  /* --- warning, MUTCD Table 2C-2 (diamond, point up) ---------------- */
  pedCrossWarn: {
    code: 'W11-2', shape: 'diamond',
    conventional: { w: IN(30), h: IN(30) },
    multilane:    { w: IN(36), h: IN(36) },
    face: SIGN_COLOUR.fluorGreen, legend: SIGN_COLOUR.black,
    border: SIGN_COLOUR.black, borderWidth: IN(0.625),
  },
  bikeWarn: {
    code: 'W11-1', shape: 'diamond',
    conventional: { w: IN(30), h: IN(30) },
    face: SIGN_COLOUR.fluorGreen, legend: SIGN_COLOUR.black,
  },
  signalAhead: {
    code: 'W3-3', shape: 'diamond',
    conventional: { w: IN(36), h: IN(36) },
    face: SIGN_COLOUR.yellow, legend: SIGN_COLOUR.black,
  },
  stopAhead: {
    code: 'W3-1', shape: 'diamond',
    conventional: { w: IN(36), h: IN(36) },
    face: SIGN_COLOUR.yellow, legend: SIGN_COLOUR.black,
  },
  truckCrossing: {
    code: 'W11-10', shape: 'diamond',
    conventional: { w: IN(36), h: IN(36) },
    face: SIGN_COLOUR.yellow, legend: SIGN_COLOUR.black,
  },

  /* --- guide -------------------------------------------------------- */
  streetName: {
    /* MUTCD 2D.43. Letter height 6 in minimum on a multilane street, 4 in on
       a local street; the blade is sized to the legend, not the other way
       round. Blade height = letter height + 3 in of border and margin. */
    code: 'D3-1', shape: 'blade',
    letterHeightLocal: IN(4), letterHeightMultilane: IN(6),
    bladeHeight: IN(9), bladeThickness: IN(0.08),
    face: SIGN_COLOUR.green, legend: SIGN_COLOUR.white,
    border: SIGN_COLOUR.white, borderWidth: IN(0.5),
    /* Mounted above the stop sign on the same post, or on the signal mast. */
    mount: FT(7.0),
  },
  wayfinding: {
    code: 'D-series', shape: 'rect',
    conventional: { w: FT(4), h: FT(2) },
    face: SIGN_COLOUR.green, legend: SIGN_COLOUR.white,
    border: SIGN_COLOUR.white, borderWidth: IN(0.5),
  },
  trailhead: {
    code: 'D-series', shape: 'rect',
    conventional: { w: FT(3), h: FT(2) },
    face: SIGN_COLOUR.brown, legend: SIGN_COLOUR.white,
    border: SIGN_COLOUR.white, borderWidth: IN(0.5),
  },
};

Object.freeze(MOUNT); Object.freeze(POST); Object.freeze(SIGN_COLOUR);

/**
 * Resolve a sign's built dimensions for a road class.
 * Multilane sizes apply on arterials and anywhere a driver reads the sign
 * across more than one lane of traffic.
 */
export function signSize(key, roadClass) {
  const s = SIGNS[key];
  if (!s) throw new Error(`spec/signage: no sign named "${key}"`);
  const multi = roadClass === 'arterial' || roadClass === 'collector';
  const dim = (multi && s.multilane) ? s.multilane : s.conventional;
  if (!dim) throw new Error(`spec/signage: "${key}" has no panel dimensions`);
  return {
    ...s,
    key,
    w: dim.w,
    h: dim.h,
    mount: s.mount != null ? s.mount : MOUNT.heightUrban,
  };
}
