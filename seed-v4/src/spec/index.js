/* ============================================================================
   spec/index.js — the single import point, and the spec's own audit
   ----------------------------------------------------------------------------
   Rule for the rest of the codebase: no module outside this folder may write
   a dimension as a bare number. If a wall is 6 inches thick, that fact lives
   here and the builder imports it. The point is not tidiness — it is that a
   dimension used in three places drifts in two of them, and drifted
   dimensions are exactly what makes a modelled street read as fake.

   `auditSpec()` runs the internal consistency checks at boot. It catches the
   class of error that is invisible by inspection: a solar panel too small
   for the luminaire it powers, a push button above the reach range, a
   furnishing zone too narrow for the pole standing in it.
   ========================================================================== */

export * from './units.js';
export * from './human.js';
export * from './street.js';
export * from './signage.js';
export * from './signals.js';
export * from './lighting.js';
export * from './accessibility.js';
export * from './furniture.js';

import { HUMAN, scaleCheck } from './human.js';
import { WALK, CURB, LANE, MARKING } from './street.js';
import { MOUNT } from './signage.js';
import { SIGNAL, PED_SIGNAL, PUSH_BUTTON, phasePlan } from './signals.js';
import { LIGHTING, POLE, SOLAR, SPACING_RATIO, solarBalance, poleBaseDia } from './lighting.js';
import { CURB_RAMP, DETECTABLE_WARNING, ROUTE, rampGeometry, rampCheck } from './accessibility.js';
import { BIN, BENCH, BOLLARD, HYDRANT, BIKE_RACK } from './furniture.js';

/**
 * Internal consistency audit. Returns an array of problems; empty means the
 * spec hangs together. Called from main() and exposed as __seedSpec().
 */
export function auditSpec() {
  const bad = [];

  /* --- the solar assembly must actually run its luminaire --------------- */
  for (const [cls, cfg] of Object.entries(LIGHTING)) {
    const bal = solarBalance(cfg.watts);
    if (!bal.panelOk) {
      bad.push(`solar/${cls}: ${SOLAR.panelWatts} W panel harvests ` +
               `${bal.harvestWh} Wh in December but the ${cfg.watts} W luminaire ` +
               `needs ${bal.nightlyWh} Wh — needs ${bal.requiredWp} Wp`);
    }
    if (!bal.batteryOk) {
      bad.push(`solar/${cls}: ${SOLAR.batteryWh} Wh battery gives under ` +
               `${SOLAR.autonomyDays} days autonomy for a ${cfg.watts} W load ` +
               `— needs ${bal.requiredBatteryWh} Wh`);
    }
  }

  /* --- pole spacing must stay inside the uniformity envelope ------------ */
  for (const [cls, cfg] of Object.entries(LIGHTING)) {
    const ratio = cfg.spacing / cfg.mountHeight;
    if (ratio > SPACING_RATIO.max + 1e-6) {
      bad.push(`lighting/${cls}: spacing is ${ratio.toFixed(2)}x mounting ` +
               `height, above the ${SPACING_RATIO.max}x limit — dark pools ` +
               `between poles`);
    }
    if (ratio < SPACING_RATIO.min - 1e-6) {
      bad.push(`lighting/${cls}: spacing is only ${ratio.toFixed(2)}x mounting ` +
               `height — over-lit and over-poled`);
    }
  }

  /* --- a pole in the furnishing zone must not eat the walk -------------- */
  for (const [cls, cfg] of Object.entries(LIGHTING)) {
    if (!cfg.armLength && cls !== 'pathway' && cls !== 'plaza') continue;
    const base = poleBaseDia(cfg.mountHeight);
    const needed = POLE.setbackFromCurb + base;
    if (needed > WALK.furnishWidth + 1e-6) {
      bad.push(`lighting/${cls}: a ${base.toFixed(2)} m pole at a ` +
               `${POLE.setbackFromCurb.toFixed(2)} m setback needs ` +
               `${needed.toFixed(2)} m but the furnishing zone is ` +
               `${WALK.furnishWidth.toFixed(2)} m`);
    }
  }

  /* --- every operable control inside the seated reach range ------------- */
  bad.push(...scaleCheck('push button', { control: PUSH_BUTTON.heightUsed }));
  bad.push(...scaleCheck('litter bin opening', { control: BIN.litter.openingCentre }));
  bad.push(...scaleCheck('recycling opening', { control: BIN.recycling.openingCentre }));

  /* --- headroom under anything that overhangs a walk -------------------- */
  bad.push(...scaleCheck('ped signal', { clearance: PED_SIGNAL.heightUsed }));
  bad.push(...scaleCheck('sign over walk', { clearance: MOUNT.heightOverWalk }));
  if (PED_SIGNAL.heightUsed < PED_SIGNAL.heightMin - 1e-6 ||
      PED_SIGNAL.heightUsed > PED_SIGNAL.heightMax + 1e-6) {
    bad.push(`ped signal: ${PED_SIGNAL.heightUsed.toFixed(2)} m is outside the ` +
             `MUTCD 4E.08 range of ${PED_SIGNAL.heightMin.toFixed(2)} to ` +
             `${PED_SIGNAL.heightMax.toFixed(2)} m`);
  }
  if (SIGNAL.heightOverRoadUsed < SIGNAL.heightOverRoadMin - 1e-6 ||
      SIGNAL.heightOverRoadUsed > SIGNAL.heightOverRoadMax + 1e-6) {
    bad.push(`signal head: ${SIGNAL.heightOverRoadUsed.toFixed(2)} m is outside ` +
             `the MUTCD 4D.15 range`);
  }

  /* --- curb ramp geometry ---------------------------------------------- */
  const ramp = rampGeometry(CURB.revealVertical);
  bad.push(...rampCheck('standard curb ramp', ramp));
  /* the ramp plus its landing must fit in the space actually available
     between the curb face and the back of walk */
  const available = WALK.furnishWidth + WALK.clearCampus;
  if (ramp.run + CURB_RAMP.landingDepth > available + 1e-6) {
    bad.push(`curb ramp: ${ramp.run.toFixed(2)} m run plus a ` +
             `${CURB_RAMP.landingDepth.toFixed(2)} m landing needs ` +
             `${(ramp.run + CURB_RAMP.landingDepth).toFixed(2)} m but only ` +
             `${available.toFixed(2)} m exists behind the curb`);
  }

  /* --- detectable warning dome geometry inside PROWAG R305 -------------- */
  const dw = DETECTABLE_WARNING;
  if (dw.domeBaseDia < dw.domeBaseDiaMin - 1e-9 || dw.domeBaseDia > dw.domeBaseDiaMax + 1e-9) {
    bad.push('detectable warning: dome base diameter is outside PROWAG R305');
  }
  if (dw.spacing < dw.spacingMin - 1e-9 || dw.spacing > dw.spacingMax + 1e-9) {
    bad.push('detectable warning: dome spacing is outside PROWAG R305');
  }
  const baseClear = dw.spacing - dw.domeBaseDia;
  if (baseClear < dw.baseClearMin - 1e-9) {
    bad.push(`detectable warning: ${(baseClear * 1000).toFixed(1)} mm base-to-base ` +
             `clearance is below the ${(dw.baseClearMin * 1000).toFixed(1)} mm minimum`);
  }

  /* --- bollard spacing must leave an accessible opening ----------------- */
  const bollardClear = BOLLARD.spacingOnCentre - BOLLARD.dia;
  if (bollardClear < HUMAN.passageMin - 1e-6) {
    bad.push(`bollards: ${bollardClear.toFixed(2)} m clear between bollards is ` +
             `below the ${HUMAN.passageMin.toFixed(3)} m accessible minimum`);
  }

  /* --- bench seat inside the ADA 903.5 range --------------------------- */
  if (BENCH.seatHeight < 0.4318 || BENCH.seatHeight > 0.4826) {
    bad.push(`bench: ${BENCH.seatHeight.toFixed(3)} m seat is outside the ` +
             `17 to 19 inch range`);
  }

  /* --- a crosswalk must be at least as wide as the ramp feeding it ------ */
  if (MARKING.crosswalkWidthUsed < CURB_RAMP.widthUsed - 1e-6) {
    bad.push(`crosswalk: ${MARKING.crosswalkWidthUsed.toFixed(2)} m is narrower ` +
             `than the ${CURB_RAMP.widthUsed.toFixed(2)} m ramp that lands in it`);
  }

  /* --- signal timing must resolve to something a person can cross ------- */
  const plan = phasePlan({
    mainWidth: LANE.local * 2 + LANE.bike * 2,
    crossWidth: LANE.local * 2,
    mainSpeed: 11.2, crossSpeed: 11.2,
  });
  if (plan.cycle < 20 || plan.cycle > 200) {
    bad.push(`signal timing: derived cycle of ${plan.cycle} s is implausible`);
  }

  /* --- hydrant nozzle must clear the ground for a coupling ------------- */
  if (HYDRANT.nozzleHeight < 0.4064) {
    bad.push('hydrant: hose nozzle centreline is below the 16 in practical minimum');
  }

  /* --- bike rack must hold a bicycle ------------------------------------ */
  if (BIKE_RACK.height < 0.79) {
    bad.push('bike rack: under 31 in, too low to support a frame at two points');
  }

  return bad;
}

/** Human-readable summary, for the debug HUD and the report. */
export function specSummary() {
  const bal = solarBalance(LIGHTING.local.watts);
  const ramp = rampGeometry(CURB.revealVertical);
  return {
    eyeHeight: HUMAN.eyeHeight,
    walkWidth: WALK.clearCampus,
    curbReveal: CURB.revealVertical,
    laneWidth: LANE.local,
    poleHeight: LIGHTING.local.mountHeight,
    poleSpacing: LIGHTING.local.spacing,
    solarPanel: `${SOLAR.panelWatts} W, ${SOLAR.panelLength.toFixed(2)} x ` +
                `${SOLAR.panelWidth.toFixed(2)} m at ${SOLAR.tiltDeg} deg`,
    solarMargin: `${bal.marginPercent}% over the December load`,
    rampRun: ramp.run,
    rampSlope: `${ramp.slopePercent}%`,
    signalHeight: SIGNAL.heightOverRoadUsed,
  };
}
