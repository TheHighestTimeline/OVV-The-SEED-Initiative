/* ============================================================================
   spec/units.js — unit conversion, so standards can be written as published
   ----------------------------------------------------------------------------
   US infrastructure standards (MUTCD, AASHTO, PROWAG, IES) publish in inches
   and feet. Transcribing them to metres by hand is where accuracy dies: a
   "30 inch stop sign" silently becomes 0.75 m, a 7 ft mounting height becomes
   2.1 m, and after forty of those the world is a few percent wrong everywhere
   and nothing looks like it fits together.

   So every spec value below is written in the unit its standard publishes,
   wrapped in a converter. `IN(30)` reads as thirty inches and evaluates to
   0.7620 m. The source document stays legible in the code.

   The whole world is metres. These functions are the only place a non-metric
   number is allowed to exist.
   ========================================================================== */

/** inches → metres. 1 in = 25.4 mm exactly (international yard, 1959). */
export const IN = (n) => n * 0.0254;

/** feet → metres. 1 ft = 12 in = 0.3048 m exactly. */
export const FT = (n) => n * 0.3048;

/** feet + inches → metres, for dimensions published as 7'-6". */
export const FTIN = (ft, inch) => ft * 0.3048 + inch * 0.0254;

/** yards → metres, for dumpster capacities and earthwork. */
export const YD = (n) => n * 0.9144;

/** miles → metres. */
export const MI = (n) => n * 1609.344;

/** miles per hour → metres per second. Design speeds are published in mph. */
export const MPH = (n) => n * 0.44704;

/** US liquid gallons → cubic metres, for bin and tank capacities. */
export const GAL = (n) => n * 0.003785411784;

/** pounds → kilograms, for load ratings. */
export const LB = (n) => n * 0.45359237;

/** degrees → radians. Slopes and tilts are published in degrees or percent. */
export const DEG = (n) => (n * Math.PI) / 180;

/** percent grade → radians. A 8.33% ramp is atan(0.0833), not 0.0833 rad. */
export const GRADE = (pct) => Math.atan(pct / 100);

/** ratio slope (run:rise, e.g. 12 for 1:12) → radians. */
export const SLOPE = (run) => Math.atan(1 / run);

/* --------------------------------------------------------------- reverse */
/* Only for debug readouts and the measuring tool — never for authoring. */
export const toIN = (m) => m / 0.0254;
export const toFT = (m) => m / 0.3048;

/* ------------------------------------------------------------- formatting */
/** 2.134 → `7'-0"` — used by the in-world measuring overlay. */
export function ftin(m) {
  const total = Math.round(toIN(m) * 4) / 4;      /* nearest quarter inch */
  const ft = Math.floor(total / 12);
  const inch = total - ft * 12;
  const frac = Math.round((inch % 1) * 4);
  const whole = Math.floor(inch);
  const f = ['', '¼', '½', '¾'][frac] || '';
  return `${ft}'-${whole}${f}"`;
}

/** 2.134 → `2.13 m` */
export const metres = (m) => `${m.toFixed(2)} m`;

/** both, for labels: `2.13 m (7'-0")` */
export const dual = (m) => `${metres(m)} (${ftin(m)})`;
