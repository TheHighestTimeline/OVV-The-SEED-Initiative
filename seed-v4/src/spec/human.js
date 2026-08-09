/* ============================================================================
   spec/human.js — the scale reference everything else is checked against
   ----------------------------------------------------------------------------
   Every other spec in this folder exists to be usable by this body. If a
   handrail is at 1.4 m, a 1.62 m eye can see over it; if a push button is at
   1.4 m, a seated 1.24 m reach cannot get to it. Those two facts are why the
   anthropometrics live in their own file and are imported by the validator.

   Stature and reach figures: CDC/NCHS Anthropometric Reference Data for
   Children and Adults, United States (NHANES). Eye height is derived from
   stature at the standard 0.936 ratio (Pheasant, Bodyspace, 3rd ed.).
   Gait speeds: MUTCD/PROWAG use 3.5 ft/s for crossing time; observed free
   walking speed on level ground is faster, and both are recorded here because
   they are used for different things — signal timing vs. player movement.
   ========================================================================== */

import { IN, FT, FTIN, MPH } from './units.js';

export const HUMAN = {
  /* ------------------------------------------------------------- stature */
  /* NHANES 2015–2018, adults 20+. These bracket the world's character scale. */
  statureMale:    1.753,      /* mean, US adult male                        */
  statureFemale:  1.617,      /* mean, US adult female                      */
  stature5th:     1.500,      /* 5th percentile female, the short design case */
  stature95th:    1.880,      /* 95th percentile male, the tall design case  */

  /* The reference figure used for the walking POV and every scale check.
     Deliberately between the two means rather than a male default. */
  stature:        1.700,

  /* ---------------------------------------------------------- eye height */
  /* 0.936 x stature, standing, shoes on (Pheasant). This is the camera. */
  eyeHeight:      1.591,      /* 0.936 x 1.700                              */
  eyeHeightCrouch: 1.150,     /* crouched, for looking under things          */
  eyeHeightSeated: 1.180,     /* seated on a 0.45 m bench                    */
  eyeHeightDriver: 1.080,     /* passenger-car driver eye, AASHTO 3.5 ft     */
  eyeHeightTruck:  FT(7.6),   /* AASHTO large-truck driver eye height        */

  /* -------------------------------------------------------- body volume */
  shoulderWidth:  0.465,      /* bideltoid, mean adult                       */
  bodyDepth:      0.280,      /* chest depth                                 */
  /* The collision capsule. Radius is half the shoulder width plus clothing
     and swing, which is what a doorway actually has to clear. */
  capsuleRadius:  0.280,
  capsuleHeight:  1.700,

  /* -------------------------------------------------------------- reach */
  reachForwardMax: 0.635,     /* 25 in, standing forward reach               */
  reachHighStand:  IN(80),    /* comfortable high reach, standing            */
  reachHighSeated: IN(48),    /* PROWAG 4.5.2 unobstructed high side reach   */
  reachLowSeated:  IN(15),    /* PROWAG 4.5.2 low reach                      */
  /* Controls a wheelchair user must operate live between the two seated
     numbers. Push buttons and card readers are checked against this. */

  /* --------------------------------------------------------------- gait */
  walkSpeed:      1.40,       /* observed free walking speed, level, m/s     */
  walkSpeedSlow:  1.07,       /* 3.5 ft/s — MUTCD 4E.06 crossing time basis  */
  runSpeed:       3.50,       /* jog; a sprint is ~7 but nobody sprints here  */
  stepLength:     0.762,      /* 30 in, mean adult stride component          */
  stepFrequency:  1.84,       /* Hz at walkSpeed — drives the head bob        */

  /* ------------------------------------------------------- what it clears */
  stepUpMax:      IN(7.0),    /* IBC 1011.5.2 max riser — the tallest step a
                                 walker takes without thinking about it      */
  stepUpAuto:     IN(6.0),    /* standard curb reveal; auto-stepped in POV   */
  headroomMin:    FTIN(6, 8), /* IBC 1003.2 min ceiling / clearance          */
  doorWidthMin:   IN(32),     /* ADA 404.2.3 clear width at a doorway        */
  passageMin:     IN(36),     /* ADA 403.5.1 clear width, accessible route   */

  /* ----------------------------------------------------------- eye model */
  /* Horizontal FOV for a natural-feeling POV. Human binocular field is ~120
     deg but rendering that flat looks distorted; 70 deg horizontal is the
     standard compromise and matches a 28 mm lens. */
  fovHorizontal:  70,
  fovVertical:    50,
};

/* Vertical FOV for a given aspect, since three.js takes vertical FOV. */
export function vFovFor(aspect) {
  const h = (HUMAN.fovHorizontal * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI;
}

Object.freeze(HUMAN);

/* ============================================================== validation
   Called by the scale audit. Given a named object with a height and an
   optional operable-control height, report whether a human can use it.     */
export function scaleCheck(name, dims) {
  const out = [];
  if (dims.height != null) {
    if (dims.height > HUMAN.stature95th * 4 && !dims.isStructure) {
      out.push(`${name}: ${dims.height.toFixed(2)} m is over 4x a tall adult ` +
               `and is not flagged as a structure — probable unit error`);
    }
    if (dims.height > 0 && dims.height < 0.02) {
      out.push(`${name}: ${dims.height.toFixed(3)} m is under 20 mm — ` +
               `probable metre/millimetre confusion`);
    }
  }
  if (dims.clearance != null && dims.clearance < HUMAN.headroomMin) {
    out.push(`${name}: ${dims.clearance.toFixed(2)} m headroom is below the ` +
             `${HUMAN.headroomMin.toFixed(3)} m minimum`);
  }
  if (dims.control != null) {
    if (dims.control > HUMAN.reachHighSeated) {
      out.push(`${name}: control at ${dims.control.toFixed(2)} m exceeds the ` +
               `${HUMAN.reachHighSeated.toFixed(3)} m seated high reach`);
    }
    if (dims.control < HUMAN.reachLowSeated) {
      out.push(`${name}: control at ${dims.control.toFixed(2)} m is below the ` +
               `${HUMAN.reachLowSeated.toFixed(3)} m seated low reach`);
    }
  }
  if (dims.width != null && dims.isPassage && dims.width < HUMAN.passageMin) {
    out.push(`${name}: ${dims.width.toFixed(2)} m passage is below the ` +
             `${HUMAN.passageMin.toFixed(3)} m accessible route minimum`);
  }
  return out;
}
