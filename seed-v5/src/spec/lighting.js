/* ============================================================================
   spec/lighting.js — roadway lighting, and the solar luminaire in particular
   ----------------------------------------------------------------------------
   Sources:
     IES RP-8-22  — Recommended Practice for Design of Roadway Lighting
     AASHTO       — Roadside Design Guide (pole offset, breakaway)
     MUTCD 2A.18  — shared-pole clearances
     PROWAG R402  — 80 in clear headroom over any pedestrian route

   The solar assembly is sized from an energy balance for the actual site
   (Bennettsville, South Carolina, 34.62 N) rather than being drawn as a
   generic panel. The derivation is in the comments so the panel area can be
   checked against the load it is claimed to carry — an off-grid light with a
   panel too small for its own luminaire is the most common way this detail
   is faked, and it is visible to anyone who knows the numbers.
   ========================================================================== */

import { IN, FT, DEG } from './units.js';
import { HUMAN } from './human.js';

/* ------------------------------------------------------------------- site */
export const SITE_SOLAR = {
  latitude:  34.617,          /* Bennettsville, SC                          */
  longitude: -79.685,
  /* NREL NSRDB typical-year plane-of-array insolation at a south-facing
     fixed tilt, kWh/m2/day. December is the sizing month for a dusk-to-dawn
     load: it has both the least sun and the longest night. */
  psh: { annual: 4.85, december: 3.20 },
  /* Longest night of the year, which the battery has to carry. */
  nightHoursMax: 14.2,        /* December solstice, civil twilight to twilight */
  nightHoursAvg: 11.5,
  /* Consecutive overcast days the battery must survive without sun. */
  autonomyDays: 3,
};

/* --------------------------------------------------------- roadway lighting
   IES RP-8 sets illuminance and uniformity targets by road and pedestrian
   conflict class; mounting height and spacing follow from the luminaire's
   distribution. These are the values used here, with the class each serves. */
export const LIGHTING = {
  arterial:  { mountHeight: FT(35), spacing: FT(120), armLength: FT(8), watts: 120,
               targetLux: 12.0, uniformityMax: 3.0 },
  collector: { mountHeight: FT(30), spacing: FT(110), armLength: FT(6), watts: 90,
               targetLux: 8.0,  uniformityMax: 4.0 },
  local:     { mountHeight: FT(25), spacing: FT(100), armLength: FT(6), watts: 60,
               targetLux: 6.0,  uniformityMax: 6.0 },
  /* 50 ft at a 14 ft mounting height is 3.6x, inside the uniformity envelope.
     The 60 ft first tried here came out at 4.3x and left dark pools between
     poles — caught by auditSpec(), not by eye. */
  pathway:   { mountHeight: FT(14), spacing: FT(50),  armLength: 0,     watts: 25,
               targetLux: 5.0,  uniformityMax: 10.0 },
  plaza:     { mountHeight: FT(16), spacing: FT(50),  armLength: 0,     watts: 35,
               targetLux: 10.0, uniformityMax: 6.0 },
  parking:   { mountHeight: FT(25), spacing: FT(90),  armLength: FT(4), watts: 80,
               targetLux: 5.0,  uniformityMax: 15.0 },
};

/* Spacing is conventionally expressed as a multiple of mounting height;
   3 to 4 is the usable range for a Type II or III distribution. Anything
   above 4 leaves dark pools between poles no matter the lumen package. */
export const SPACING_RATIO = { min: 3.0, max: 4.0 };

/* -------------------------------------------------------------- dark sky
   The campus states a dark-sky commitment, so these are constraints, not
   preferences. IDA/IES Model Lighting Ordinance and BUG ratings. */
export const DARK_SKY = {
  uplightPercent: 0,          /* U0 — full cutoff, no light above 90 deg     */
  cct:            2700,       /* K. IDA recommends 3000 K or warmer; 2700 K
                                 is chosen for insect and wildlife impact    */
  bugRating:      'B1-U0-G1',
  curfewDimming:  0.50,       /* dimmed to 50% after the curfew hour         */
  curfewHour:     23,
  motionBoost:    1.00,       /* pathway lights return to full on detection  */
};

/* ------------------------------------------------------------- the pole */
export const POLE = {
  /* Round tapered aluminium, 0.14 in taper per foot of height. Spun
     aluminium is the standard for a solar pole because the assembly is
     already heavy and a steel shaft pushes the foundation up a size. */
  taperPerFoot: IN(0.14),
  topDia:       IN(5.0),
  wallThick:    IN(0.188),
  /* Bolted to a cast base on a drilled pier. The base cover is the flared
     collar you see at the bottom. */
  baseCoverHeight: IN(10.0),
  baseCoverDia:    IN(13.0),
  basePlate:       IN(15.0),
  foundationDia:   IN(24.0),
  foundationDepth: FT(6.0),
  foundationReveal: IN(4.0),  /* concrete standing proud of the grade       */

  /* AASHTO Roadside Design Guide: 1.5 ft minimum from the curb face to the
     face of the pole in a curbed urban section, 2 ft preferred. Measured to
     the pole face, so the centreline offset adds the radius. */
  setbackFromCurbMin: FT(1.5),
  setbackFromCurb:    FT(2.0),
  /* Clear width of walk must survive the pole standing in the furnishing
     zone — checked by the validator against WALK.clearMin. */

  /* Hand hole for the wiring, at a height a technician can work at. */
  handHoleHeight: FT(1.5),
  handHoleW: IN(3.0), handHoleH: IN(5.0),
};

/** Base diameter of a tapered pole of a given height. */
export function poleBaseDia(heightM) {
  const ft = heightM / 0.3048;
  return POLE.topDia + POLE.taperPerFoot * ft;
}

/* ------------------------------------------------------------ luminaire */
export const LUMINAIRE = {
  /* A modern flat-panel LED roadway luminaire, not a 1970s cobra. Housing is
     a die-cast aluminium wedge with the driver in the upper section. */
  length:  IN(30.0),
  width:   IN(15.0),
  depth:   IN(4.5),
  /* Mounted with a slight uptilt on the arm; more than 5 degrees starts
     throwing light above horizontal and breaks the U0 rating. */
  tiltDeg: 2.5,
  /* Slipfitter that clamps to the arm tenon. */
  tenonDia: IN(2.375),        /* 2 in nominal pipe, the universal tenon      */
  tenonLength: IN(6.0),
  /* Optical face inset from the housing edge. */
  lensInset: IN(1.0),
  efficacy: 140,              /* lm/W, current mid-range LED roadway         */
};

/* ---------------------------------------------------------- the arm */
export const ARM = {
  /* Single-member tapered elliptical arm with an upsweep, which is what
     stops the tip drooping into the clearance envelope under ice load. */
  riseOverRun: 0.12,
  baseDia: IN(4.0),
  tipDia:  IN(2.375),
  /* Clearance from the arm and luminaire to anything below. PROWAG R402 is
     the binding constraint over a walk; over a lane it is the truck envelope. */
  clearanceOverWalk: HUMAN.headroomMin,
  clearanceOverRoad: FT(16.5),
};

/* ================================================== the solar assembly ====
   Sizing for the `local` class luminaire (60 W), which is what the campus
   streets carry. The arithmetic is spelled out so it can be checked.

   Nightly load
     60 W x 11.5 h average night          =  690 Wh
     dimmed to 50% after 23:00 for ~6 h   = -180 Wh
     effective                            =  510 Wh/night
     December worst case, full night      =  690 Wh/night   <- size to this

   Array
     system efficiency (charge controller, wiring, temperature, soiling,
     battery round trip) taken at 0.72
     December plane-of-array PSH          =  3.20 h
     required Wp = 690 / (3.20 x 0.72)    =  299 W  ->  320 W module

   A 320 W monocrystalline module is a standard 60-cell format:
     1.755 m x 1.038 m x 0.035 m, 1.82 m2, 18.7 kg

   Battery
     3 days autonomy x 690 Wh             = 2070 Wh
     LiFePO4 at 80% usable depth of charge= 2588 Wh
     at 25.6 V nominal                    =  101 Ah  ->  100 Ah pack

   Tilt
     Annual optimum for 34.6 N is about latitude, 35 degrees. A dusk-to-dawn
     load is worst in December, so the tilt is biased up to 45 degrees: it
     gives up roughly 4% annually to gain roughly 14% in December, which is
     the month that actually sizes the system.
   ======================================================================== */
/* Real module formats. A solar luminaire is not built with a panel drawn to
   fit the pole — it is built with whatever module the supplier stocks, and
   the pole bracket is sized to that. These are current standard formats. */
export const PV_MODULES = [
  { watts: 320, length: 1.755, width: 1.038, thick: 0.035, mass: 18.7, cellsWide: 6,  cellsLong: 10 },
  { watts: 450, length: 2.094, width: 1.134, thick: 0.035, mass: 23.5, cellsWide: 6,  cellsLong: 12 },
  { watts: 550, length: 2.278, width: 1.134, thick: 0.035, mass: 27.2, cellsWide: 6,  cellsLong: 12 },
];

/* LiFePO4 pack sizes, 25.6 V nominal. */
export const BATTERY_PACKS = [
  { wh: 1280, ah: 50,  w: 0.480, h: 0.300, d: 0.220, mass: 14 },
  { wh: 2560, ah: 100, w: 0.600, h: 0.360, d: 0.250, mass: 26 },
  { wh: 3840, ah: 150, w: 0.660, h: 0.400, d: 0.280, mass: 38 },
  { wh: 5120, ah: 200, w: 0.720, h: 0.440, d: 0.310, mass: 49 },
  { wh: 7680, ah: 300, w: 0.840, h: 0.500, d: 0.340, mass: 72 },
];

export const SOLAR = {
  /* --- module ------------------------------------------------------- */
  /* Defaults, for the 60 W local street luminaire the campus mostly uses.
     Other classes get their kit from solarKit() rather than these. */
  panelWatts:  320,
  panelWidth:  1.038,
  panelLength: 1.755,
  panelThick:  0.035,
  panelFrameWidth: 0.030,
  panelMass:   18.7,
  cellsWide: 6, cellsLong: 10,      /* 60-cell layout, for the surface grid */
  cellSize:  0.156,                 /* 156 mm pseudo-square cell            */
  cellGap:   0.003,

  /* --- orientation --------------------------------------------------- */
  tiltDeg:    45,                   /* winter-biased, see derivation above  */
  tiltAnnualOptimum: 35,
  azimuthDeg: 180,                  /* due south, northern hemisphere       */
  /* Mounted above the luminaire so the panel never shades the optic and the
     optic never up-lights the panel. Clearance is to the top of the pole. */
  mountAbovePole: 0.15,

  /* --- battery ------------------------------------------------------- */
  batteryWh:     3840,
  batteryChem:   'LiFePO4',
  batteryVolts:  25.6,
  batteryAh:     150,
  /* Usable depth of discharge. LiFePO4 tolerates 90% but cycle life at 80%
     is roughly double, and a street light does 365 cycles a year. */
  batteryDoD:    0.80,
  /* Pole-mounted vented enclosure. Height on the pole is set so a technician
     works standing, and so the box is above a flood and out of easy reach. */
  boxWidth:  0.600, boxHeight: 0.360, boxDepth: 0.250,
  boxMountHeight: 3.000,
  boxMass: 26.0,

  /* --- controller ---------------------------------------------------- */
  controller: 'MPPT',
  systemEfficiency: 0.72,
  autonomyDays: SITE_SOLAR.autonomyDays,

  /* --- structure ----------------------------------------------------- */
  /* The panel bracket has to carry the module against wind uplift. Marlboro
     County is Exposure C, ultimate design wind speed about 120 mph, so the
     bracket is a real truss rather than a single strut. */
  bracketTube: IN(2.0),
  bracketDepth: 0.42,
  designWindMph: 120,
};

/**
 * Select the smallest real module/battery combination that carries a given
 * luminaire through a December night with the stated autonomy.
 *
 * This exists because the first version of this file sized one kit for the
 * 60 W local luminaire and then hung it on the 120 W arterial pole as well,
 * where it was short by a factor of two. A kit that is *derived* from the
 * load cannot drift away from it.
 *
 * Returns the module, how many of them, the battery pack, and the bracket
 * layout the geometry builder needs.
 */
export function solarKit(luminaireWatts, opts = {}) {
  const {
    nightHours = SITE_SOLAR.nightHoursAvg,
    psh = SITE_SOLAR.psh.december,
    eff = SOLAR.systemEfficiency,
    autonomy = SOLAR.autonomyDays,
    dod = SOLAR.batteryDoD,
  } = opts;

  const nightlyWh = luminaireWatts * nightHours;
  const requiredWp = nightlyWh / (psh * eff);
  const requiredWh = (nightlyWh * autonomy) / dod;

  /* Prefer one module; go to two only when no single stocked module carries
     the load. Two modules mount as a shallow V on the same bracket, which is
     what a real 120 W solar arterial light looks like. */
  let module = PV_MODULES.find((m) => m.watts >= requiredWp);
  let count = 1;
  if (!module) {
    const biggest = PV_MODULES[PV_MODULES.length - 1];
    count = Math.ceil(requiredWp / biggest.watts);
    module = PV_MODULES.find((m) => m.watts * count >= requiredWp) || biggest;
  }

  const battery = BATTERY_PACKS.find((b) => b.wh >= requiredWh)
    || BATTERY_PACKS[BATTERY_PACKS.length - 1];

  const arrayWatts = module.watts * count;
  const harvestWh = arrayWatts * psh * eff;

  return {
    luminaireWatts,
    module, count, arrayWatts,
    battery,
    nightlyWh: Math.round(nightlyWh),
    harvestWh: Math.round(harvestWh),
    requiredWp: Math.round(requiredWp),
    requiredWh: Math.round(requiredWh),
    marginPercent: Math.round(((harvestWh - nightlyWh) / nightlyWh) * 100),
    /* overall bounding footprint of the array, for the bracket and the
       shadow it casts on the walk below */
    arrayLength: module.length,
    arrayWidth: module.width * count + (count - 1) * 0.02,
    tiltDeg: SOLAR.tiltDeg,
    ok: harvestWh >= nightlyWh && battery.wh >= requiredWh,
  };
}

/**
 * Verify that a solar assembly can actually run its luminaire, and return
 * the shortfall if it cannot. Called by the spec audit — this is the check
 * that catches a panel drawn at a size that looks good but cannot carry the
 * load it is attached to.
 */
export function solarBalance(luminaireWatts, opts = {}) {
  const kit = solarKit(luminaireWatts, opts);
  const {
    panelWatts = kit.arrayWatts,
    batteryWh = kit.battery.wh,
    nightHours = SITE_SOLAR.nightHoursAvg,
    psh = SITE_SOLAR.psh.december,
    eff = SOLAR.systemEfficiency,
    autonomy = SOLAR.autonomyDays,
  } = opts;

  const nightlyWh = luminaireWatts * nightHours;
  const harvestWh = panelWatts * psh * eff;
  const requiredWp = nightlyWh / (psh * eff);
  const requiredBatteryWh = (nightlyWh * autonomy) / SOLAR.batteryDoD;

  return {
    nightlyWh: Math.round(nightlyWh),
    harvestWh: Math.round(harvestWh),
    requiredWp: Math.round(requiredWp),
    requiredBatteryWh: Math.round(requiredBatteryWh),
    panelOk: harvestWh >= nightlyWh,
    batteryOk: batteryWh >= requiredBatteryWh,
    marginPercent: Math.round(((harvestWh - nightlyWh) / nightlyWh) * 100),
  };
}

/** Panel area, for the energy check and for the shading footprint. */
export const panelArea = () => SOLAR.panelWidth * SOLAR.panelLength;

Object.freeze(SITE_SOLAR); Object.freeze(LIGHTING); Object.freeze(DARK_SKY);
Object.freeze(POLE); Object.freeze(LUMINAIRE); Object.freeze(ARM);
Object.freeze(SOLAR); Object.freeze(SPACING_RATIO);
