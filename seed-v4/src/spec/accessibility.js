/* ============================================================================
   spec/accessibility.js — curb ramps, detectable warnings, transit stops
   ----------------------------------------------------------------------------
   PROWAG (Public Right-of-Way Accessibility Guidelines, 2023 final rule) and
   ADA Standards where PROWAG defers to them.

   These are the dimensions people notice are wrong without being able to say
   why: a curb ramp built at the wrong slope reads as a driveway, and a
   detectable warning pad with domes at the wrong pitch reads as a texture
   rather than a surface. The dome geometry in particular is specified to a
   tolerance that is visible at walking distance, so it is worth building
   correctly.
   ========================================================================== */

import { IN, FT, GRADE, SLOPE } from './units.js';

/* --------------------------------------------------------- detectable warning
   PROWAG R305. Truncated domes, in-line pattern, aligned with the direction
   of travel. Every dimension below is a published range with the built value
   named — the ranges are narrow and the pattern is unmistakable when right. */
export const DETECTABLE_WARNING = {
  domeBaseDiaMin: IN(0.9),
  domeBaseDiaMax: IN(1.4),
  domeBaseDia:    IN(0.9),

  /* Top diameter is a proportion of the base, not an absolute — 50 to 65%. */
  domeTopRatioMin: 0.50,
  domeTopRatioMax: 0.65,
  domeTopRatio:    0.55,

  domeHeight: IN(0.2),

  /* Centre-to-centre spacing, and the clear base-to-base minimum that stops
     a cane tip wedging between two domes. */
  spacingMin: IN(1.6),
  spacingMax: IN(2.4),
  spacing:    IN(2.35),
  baseClearMin: IN(0.65),

  /* R305.1.4: 24 in minimum depth in the direction of travel, and the full
     width of the ramp run or the flush landing. */
  depth: IN(24.0),

  /* R305.2: placed at the back of curb. Where the ramp is set back, the pad
     may be up to 5 ft from the curb line but no further. */
  setbackMax: FT(5.0),

  /* R305.1.6: must contrast visually, light-on-dark or dark-on-light, with
     the adjacent walking surface. Federal safety yellow against grey
     concrete is the common resolution and is what the campus uses. */
  colour: 0xf2b800,
  colourAlt: 0x8c1a11,        /* brick red, used against light paving       */
  contrastRatioMin: 0.70,
};

/* ------------------------------------------------------------- curb ramps */
export const CURB_RAMP = {
  /* R304.2.2: running slope 8.33% maximum (1:12). R304.5.3: cross slope 2%. */
  runningSlopeMax: 0.0833,
  runningSlopeUsed: 0.075,    /* built with tolerance, as any real job is   */
  crossSlopeMax:   0.020,

  /* R304.5.1: 4 ft minimum clear width, exclusive of flared sides. */
  widthMin:  FT(4.0),
  widthUsed: FT(5.0),

  /* R304.2.3: flared sides 10% maximum where a pedestrian could walk across
     them. A flare is not part of the ramp width and is not a route. */
  flareSlopeMax: 0.10,

  /* R304.2.1: a turning space at the top, 4 x 4 ft minimum, 2% max in both
     directions. This is the piece most often omitted, and its absence is
     what makes a ramp unusable rather than merely awkward. */
  landingWidth: FT(4.0),
  landingDepth: FT(4.0),
  landingSlopeMax: 0.020,

  /* R304.5.4: counter slope of the gutter at the foot of the ramp, 5% max.
     Steeper and a wheelchair footplate grounds out at the transition. */
  gutterCounterSlopeMax: 0.05,

  /* R304.5.5: the grade break at top and bottom must be perpendicular to the
     direction of travel and the transition flush — no lip at all. */
  lipMax: 0.0,

  /* Types. Perpendicular is preferred; a single diagonal ramp at a corner
     puts the user into the middle of the intersection and is used only where
     the corner geometry leaves nothing else. */
  types: ['perpendicular', 'parallel', 'combination', 'blended', 'diagonal'],
  preferredType: 'perpendicular',
  /* Two ramps per corner, one per crossing direction — a single diagonal
     ramp serving both is a legacy detail this world does not build. */
  rampsPerCorner: 2,
};

/* -------------------------------------------------------- pedestrian route */
export const ROUTE = {
  /* R302: continuous clear width 4 ft min, 2% cross slope max, running slope
     not exceeding the adjacent street grade. */
  clearWidthMin: FT(4.0),
  crossSlopeMax: 0.020,

  /* R302.7: vertical surface discontinuity. Up to 1/4 in may be vertical;
     1/4 to 1/2 in must be bevelled at 1:2. Above that it is a step and needs
     a ramp. This is the tolerance a sidewalk panel lift is judged against. */
  discontinuityVertical: IN(0.25),
  discontinuityBevelled: IN(0.5),
  bevelSlope: 2.0,

  /* R302.7.3: horizontal openings in a grate or joint must not pass a 1/2 in
     sphere, and elongated openings run perpendicular to travel. */
  openingMax: IN(0.5),

  /* R402: 80 in vertical clearance over the full route. */
  headroom: IN(80.0),
};

/* ----------------------------------------------------------- transit stop */
export const TRANSIT_STOP = {
  /* R308.1: boarding and alighting area 8 ft (perpendicular to the curb) by
     5 ft (parallel), connected to the pedestrian route. */
  boardingDepth: FT(8.0),
  boardingLength: FT(5.0),
  boardingSlopeMax: 0.020,

  /* Shelter: 32 in min clear entry, 30 x 48 in clear floor space inside. */
  shelterEntryMin: IN(32.0),
  shelterClearW: IN(30.0),
  shelterClearD: IN(48.0),
  shelterWidth:  FT(12.0),
  shelterDepth:  FT(5.0),
  shelterHeight: FT(8.5),
  benchSeatHeight: IN(18.0),
};

Object.freeze(DETECTABLE_WARNING); Object.freeze(CURB_RAMP);
Object.freeze(ROUTE); Object.freeze(TRANSIT_STOP);

/**
 * Geometry for one curb ramp, derived from the curb reveal it has to climb.
 * Returns the run length needed at the built slope, the landing, and the
 * detectable warning pad — so a ramp is never drawn at a length that does
 * not match the height it climbs.
 */
export function rampGeometry(curbReveal, width = CURB_RAMP.widthUsed) {
  const run = curbReveal / CURB_RAMP.runningSlopeUsed;
  const flareRun = curbReveal / CURB_RAMP.flareSlopeMax;
  return {
    rise: curbReveal,
    run,
    slope: CURB_RAMP.runningSlopeUsed,
    slopePercent: +(CURB_RAMP.runningSlopeUsed * 100).toFixed(2),
    width,
    flareRun,
    landing: { w: CURB_RAMP.landingWidth, d: CURB_RAMP.landingDepth },
    warning: {
      depth: DETECTABLE_WARNING.depth,
      width,
      /* dome grid, computed rather than assumed */
      cols: Math.floor(width / DETECTABLE_WARNING.spacing),
      rows: Math.floor(DETECTABLE_WARNING.depth / DETECTABLE_WARNING.spacing),
    },
  };
}

/** Compliance check for a built ramp. Used by the world audit. */
export function rampCheck(id, g) {
  const bad = [];
  if (g.rise / g.run > CURB_RAMP.runningSlopeMax + 1e-6) {
    bad.push(`${id}: running slope ${((g.rise / g.run) * 100).toFixed(1)}% ` +
             `exceeds the 8.33% maximum`);
  }
  if (g.width < CURB_RAMP.widthMin - 1e-6) {
    bad.push(`${id}: ${g.width.toFixed(2)} m ramp is under the ` +
             `${CURB_RAMP.widthMin.toFixed(3)} m minimum width`);
  }
  if (g.warning && g.warning.depth < DETECTABLE_WARNING.depth - 1e-6) {
    bad.push(`${id}: detectable warning ${g.warning.depth.toFixed(3)} m deep, ` +
             `needs ${DETECTABLE_WARNING.depth.toFixed(3)} m`);
  }
  return bad;
}
