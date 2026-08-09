/* ============================================================================
   spec/signals.js — traffic signals, pedestrian signals, push buttons
   ----------------------------------------------------------------------------
   MUTCD 11th edition Part 4. Physical dimensions are the ITE/standard
   polycarbonate signal section that every US supplier builds to, so a head
   modelled from these numbers is the size of the real hardware.

   Timing is included because a signal that changes on invented intervals
   reads as fake within about ten seconds of watching it. Yellow change and
   red clearance are computed from the ITE kinematic equation, not guessed.
   ========================================================================== */

import { IN, FT, FTIN, MPH } from './units.js';
import { HUMAN } from './human.js';

/* --------------------------------------------------------- signal section */
export const SIGNAL = {
  /* MUTCD 4D.13: 12 in nominal lens is required for essentially every new
     installation; 8 in survives only on some existing pedestrian-scale
     applications. The world builds 12 in. */
  lensDia:        IN(12.0),
  lensDiaSmall:   IN(8.0),

  /* One 12 in section of a standard polycarbonate head. */
  sectionHeight:  IN(17.5),
  sectionWidth:   IN(16.5),
  sectionDepth:   IN(7.75),
  /* Tunnel visor, the common type — a full 12 in projection that cuts sun
     phantom and stops the head being read from the cross street. */
  visorProjection: IN(12.0),
  visorDrop:       IN(2.0),   /* how far the visor wraps below the lens     */

  /* A three-section head, plus the top and bottom caps. */
  headSections:   3,
  capHeight:      IN(1.5),

  /* MUTCD 4D.12 recommends a backplate with a 1 in retroreflective yellow
     border — it raises the contrast of the head against a bright sky and is
     one of the cheapest crash reductions in the manual. */
  backplateBorder: IN(5.0),
  backplateStripe: IN(1.0),
  backplateThick:  IN(0.1),

  /* MUTCD 4D.15 mounting. Over the roadway: 15 ft minimum, 25.5 ft maximum,
     measured to the bottom of the signal housing. Post-mounted at the side
     of the road and not over any lane: 8 ft minimum. */
  heightOverRoadMin: FT(15.0),
  heightOverRoadMax: FT(25.5),
  heightOverRoadUsed: FT(17.5),
  heightPostMin:     FT(8.0),
  heightPostUsed:    FT(10.0),

  /* MUTCD 4D.14: at least two signal faces for the through movement on each
     approach, and the primary face within a 20 degree cone of the approach
     centreline, between 40 and 180 ft back from the stop line. */
  facesPerApproach:  2,
  primaryConeDeg:    20,
  faceDistanceMin:   FT(40),
  faceDistanceMax:   FT(180),

  /* lens colours as they read when lit, and when dark */
  colourRed:    0xff2418,
  colourYellow: 0xffb400,
  colourGreen:  0x00d05a,
  colourDark:   0x14181c,
};

/* ------------------------------------------------------------ mast arm pole */
export const MAST = {
  /* Galvanised steel, round tapered shaft on a bolted base plate. Common
     signal pole: 20 to 25 ft shaft, 0.14 in taper per foot. */
  shaftHeight:    FT(22.0),
  shaftBaseDia:   IN(13.0),
  shaftTopDia:    IN(8.5),
  basePlate:      IN(22.0),
  basePlateThick: IN(2.0),
  /* Anchor-bolt cover skirt, the flared collar at the bottom. */
  skirtHeight:    IN(9.0),
  skirtDia:       IN(20.0),

  /* Arm reaches the far lane it must signal. 20 to 60 ft in 5 ft steps; the
     arm is sized per intersection from the actual crossing width. */
  armLengthMin:   FT(20.0),
  armLengthMax:   FT(60.0),
  armStep:        FT(5.0),
  armBaseDia:     IN(9.0),
  armTipDia:      IN(4.5),
  /* Arms are built with a slight upward rise so the tip does not sag below
     the clearance envelope once loaded. */
  armRise:        FT(1.5),
  armMountHeight: FT(19.5),   /* arm centreline at the pole                 */

  /* Luminaire arm is frequently combined on the same pole. */
  hasLuminaireArm: true,
};

/* ------------------------------------------------------- pedestrian signal */
export const PED_SIGNAL = {
  /* MUTCD 4E.04: 16 x 18 in housing carrying the UPRAISED HAND and WALKING
     PERSON symbols with a countdown display. */
  housingWidth:  IN(16.0),
  housingHeight: IN(18.0),
  housingDepth:  IN(6.0),
  symbolHeight:  IN(9.0),
  countdownDigitHeight: IN(6.0),

  /* MUTCD 4E.08: bottom of housing 7 ft minimum, 10 ft maximum above the
     sidewalk. */
  heightMin:  FT(7.0),
  heightMax:  FT(10.0),
  heightUsed: FT(8.0),

  colourHand: 0xff5a2b,      /* portland orange, the specified hue          */
  colourWalk: 0xf5f5f5,      /* white walking person                        */
};

/* --------------------------------------------------------- push button (APS)
   PROWAG R209 and MUTCD 4E.09. This is the single most reach-sensitive
   object in the whole street, so every constraint is recorded.             */
export const PUSH_BUTTON = {
  /* PROWAG R209.4: operable part 42 in maximum above the ground surface.
     MUTCD 4E.09 says 3.5 ft, which is the same number. */
  heightMax:  IN(42.0),
  heightMin:  IN(15.0),
  heightUsed: IN(42.0),

  /* MUTCD 4E.09: within 5 ft of the crosswalk extension, within 10 ft of the
     edge of the curb line, and with a 30 x 48 in level clear space in front
     so a wheelchair can reach it. */
  offsetFromCrosswalk: FT(5.0),
  offsetFromCurb:      FT(10.0),
  clearSpaceWidth:     IN(30.0),
  clearSpaceDepth:     IN(48.0),

  /* Button face 2 in minimum diameter, high contrast, with a raised arrow
     aligned with the crossing direction and a locator tone. */
  buttonDia:    IN(2.5),
  buttonRaise:  IN(0.15),
  housingWidth: IN(4.5),
  housingHeight: IN(6.5),
  housingDepth: IN(3.0),
  /* R10-3e instruction sign directly above the button. */
  signWidth:  IN(9.0),
  signHeight: IN(15.0),

  poleDia:    IN(4.5),       /* dedicated pedestal where no signal pole is  */
};

/* =================================================================== timing
   MUTCD 4E.06 and the ITE kinematic equation. These are computed rather
   than typed so a change to the crossing width or the approach speed moves
   the timing with it — which is the point of having a spec at all.        */

export const TIMING = {
  /* MUTCD 4E.06: walk interval 7 s minimum. */
  walkMin: 7.0,
  /* Pedestrian clearance at 3.5 ft/s from the curb to the far side. */
  pedSpeed: HUMAN.walkSpeedSlow,
  /* Driver perception-reaction, ITE standard. */
  reactionTime: 1.0,
  /* Comfortable deceleration, ITE: 10 ft/s^2. */
  deceleration: 3.048,
  /* Gravity, for the grade term. */
  g: 9.80665,
  /* Bounds MUTCD places on the yellow change interval. */
  yellowMin: 3.0,
  yellowMax: 6.0,
  /* Typical fixed-time cycle bounds for a two-phase campus intersection. */
  cycleMin: 60,
  cycleMax: 120,
};

/**
 * ITE yellow change interval.
 *   y = t + v / (2a + 2gG)
 * where t is reaction time, v the approach speed, a the deceleration rate
 * and G the approach grade as a decimal (downhill negative).
 * Clamped to the MUTCD 3 to 6 second range.
 */
export function yellowInterval(speedMps, grade = 0) {
  const { reactionTime: t, deceleration: a, g, yellowMin, yellowMax } = TIMING;
  const y = t + speedMps / (2 * a + 2 * g * grade);
  return Math.min(yellowMax, Math.max(yellowMin, y));
}

/**
 * Red clearance: the time to travel the width of the intersection plus the
 * length of the vehicle, at the approach speed.
 */
export function redClearance(crossWidth, speedMps, vehicleLength = 6.1) {
  return (crossWidth + vehicleLength) / speedMps;
}

/**
 * Pedestrian phase for a crossing. MUTCD 4E.06: the clearance interval is
 * measured from the curb to the FAR SIDE of the travelled way, not to the
 * far curb — a detail that shortens the timing on a wide street and is the
 * usual source of a phase that feels wrong.
 */
export function pedPhase(crossWidth, curbToTravelledWay = 0) {
  const clearance = (crossWidth - curbToTravelledWay) / TIMING.pedSpeed;
  return {
    walk: TIMING.walkMin,
    clearance: Math.ceil(clearance * 10) / 10,
    total: TIMING.walkMin + Math.ceil(clearance * 10) / 10,
  };
}

/**
 * Full phase plan for a simple two-phase intersection, with every interval
 * derived rather than typed. The signal controller in the world runs this.
 */
export function phasePlan({ mainWidth, crossWidth, mainSpeed, crossSpeed }) {
  const mainPed = pedPhase(mainWidth);
  const crossPed = pedPhase(crossWidth);
  const mainYellow = yellowInterval(mainSpeed);
  const crossYellow = yellowInterval(crossSpeed);
  const mainRed = redClearance(crossWidth, mainSpeed);
  const crossRed = redClearance(mainWidth, crossSpeed);

  /* Green must at least cover the pedestrian phase running concurrently. */
  const mainGreen = Math.max(crossPed.total, 15);
  const crossGreen = Math.max(mainPed.total, 12);

  return {
    main:  { green: mainGreen,  yellow: +mainYellow.toFixed(1),  red: +mainRed.toFixed(1),  ped: crossPed },
    cross: { green: crossGreen, yellow: +crossYellow.toFixed(1), red: +crossRed.toFixed(1), ped: mainPed },
    cycle: +(mainGreen + mainYellow + mainRed + crossGreen + crossYellow + crossRed).toFixed(1),
  };
}

Object.freeze(SIGNAL); Object.freeze(MAST); Object.freeze(PED_SIGNAL);
Object.freeze(PUSH_BUTTON); Object.freeze(TIMING);
