/* ============================================================================
   spec/furniture.js — bins, benches, racks, bollards, hydrants, tree pits
   ----------------------------------------------------------------------------
   Manufacturer standard sizes where the item is a catalogue product (bins,
   benches, racks), code where it is regulated (hydrant nozzle heights, bench
   seat heights, bollard spacing), and NACTO/APBP where it is a placement
   practice rather than a dimension.

   Everything here sits in the furnishing zone between the curb face and the
   walking surface. Nothing here may reduce the clear walk width below the
   PROWAG minimum — enforced by `furnitureCheck` at the bottom of the file.
   ========================================================================== */

import { IN, FT, GAL, LB } from './units.js';
import { HUMAN } from './human.js';
import { WALK } from './street.js';

/* ------------------------------------------------------------ waste bins */
export const BIN = {
  /* Public street litter receptacle, the 45 gallon steel side-opening type
     that most municipal catalogues carry. Overall height includes the lid. */
  litter: {
    capacity: GAL(45),
    bodyDia:    IN(24.0),
    bodyHeight: IN(34.0),
    lidHeight:  IN(6.0),
    /* Side opening rather than a top hole: keeps rain out, and the opening
       lands at a height a seated user can reach. */
    openingWidth:  IN(11.0),
    openingHeight: IN(7.0),
    openingCentre: IN(31.0),   /* above grade — inside the 15 to 48 in reach */
    baseDia: IN(22.0),
    colour: 0x2f3a34,
  },
  /* Paired recycling, same body so they stand as a unit, blue lid and a
     restricted opening so the stream stays clean. */
  recycling: {
    capacity: GAL(45),
    bodyDia:    IN(24.0),
    bodyHeight: IN(34.0),
    lidHeight:  IN(6.0),
    openingDia: IN(6.0),       /* round hole, bottles and cans only          */
    openingCentre: IN(37.0),
    colour: 0x1c4f8f,
  },
  /* Organics, because the campus composts. Sealed lid, foot pedal. */
  organics: {
    capacity: GAL(23),
    bodyDia:    IN(19.0),
    bodyHeight: IN(30.0),
    lidHeight:  IN(5.0),
    colour: 0x4a6b2a,
  },
  /* Wheeled cart at the back of house. */
  cart96: {
    capacity: GAL(96),
    width: 0.737, depth: 0.864, height: 1.099,
    wheelDia: IN(10.0),
    colour: 0x33383d,
  },
  /* Front-load dumpster at a service dock, 8 cubic yards. */
  dumpster8: {
    capacityYd3: 8,
    width: IN(72), length: IN(96), height: IN(66),
    lidHeight: IN(4),
    colour: 0x2b5f4a,
  },

  /* Placement. Bins go at the crossing end of a block where people arrive
     with something in their hand, and at every seating group. */
  spacingCommercial: FT(200.0),
  spacingPark:       FT(300.0),
  clearFromCurb:     FT(1.5),
  pairGap:           IN(4.0),   /* gap between the litter and recycling body */
};

/* --------------------------------------------------------------- benches */
export const BENCH = {
  /* ADA 903 and standard catalogue. Seat 17 to 19 in above the ground —
     the same range as an accessible chair, and the reason a bench that is
     even an inch low reads as a child's. */
  seatHeight: IN(18.0),
  seatDepth:  IN(22.0),
  length:     FT(6.0),
  lengthShort: FT(4.0),
  backHeight: IN(32.0),        /* above grade, to the top of the back rail  */
  backAngleDeg: 10,            /* recline from vertical                     */
  slatThickness: IN(1.5),
  slatWidth:  IN(3.5),
  slatGap:    IN(0.5),
  frameThickness: IN(2.0),

  /* PROWAG R308 / ADA 903.6: armrests at the ends aid standing up; at least
     one end without an armrest allows a transfer. */
  armHeight: IN(26.0),
  /* Clear ground space beside the bench for a wheelchair to sit with a
     companion, rather than being parked in the walking route. */
  companionSpaceW: IN(30.0),
  companionSpaceD: IN(48.0),

  spacing: FT(150.0),          /* rest interval on a pedestrian route        */
  clearFromCurb: FT(2.0),
  colour: 0x6b5136,
};

/* ------------------------------------------------------------ bike racks */
export const BIKE_RACK = {
  /* Inverted-U ("staple"), APBP Bicycle Parking Guidelines. Supports the
     frame at two points, takes a U-lock, and cannot be tipped — which is why
     it is the only rack type built here. */
  height: IN(34.0),
  width:  IN(30.0),
  pipeOD: IN(1.9),             /* 1.5 in schedule 40, 1.9 in outside dia    */
  embedDepth: IN(12.0),
  /* APBP: 30 in minimum between racks in a row, 24 in from a wall, and a
     48 in aisle behind so a bike can be walked in. */
  rackSpacing: IN(30.0),
  clearFromWall: IN(24.0),
  aisle: IN(48.0),
  /* A bicycle needs this much space to actually park at the rack. */
  bikeLength: FT(6.0),
  bikeWidth:  IN(30.0),
  colour: 0x9aa2a8,
};

/* -------------------------------------------------------------- bollards */
export const BOLLARD = {
  /* Standard pedestrian-zone bollard: defines an edge without blocking it. */
  height: IN(36.0),
  dia:    IN(6.0),
  baseDia: IN(8.0),
  baseHeight: IN(4.0),
  /* Spacing must leave an accessible opening between bollards: ADA 403.5.1
     wants 36 in clear, so a 6 in bollard at 42 in on centre gives exactly
     that. Wider than 60 in on centre and a vehicle fits through. */
  spacingOnCentre: IN(42.0),
  clearBetween: IN(36.0),
  spacingMax: IN(60.0),
  colour: 0x35403a,

  /* Security bollard at a vehicle-restricted entry: bigger, deeper, and on
     a foundation designed for the impact rather than for standing up. */
  security: {
    height: IN(36.0),
    dia:    IN(10.75),         /* 10 in schedule 40 pipe, concrete filled    */
    embedDepth: FT(4.0),
    foundationDia: FT(3.0),
    spacingOnCentre: IN(48.0),
    rating: 'ASTM F2656 M30',
  },
  /* Removable, for a fire lane that must open. */
  removable: { height: IN(36.0), dia: IN(4.5), sleeveDepth: IN(18.0) },

  /* Reflective band, so the bollard exists at night. */
  bandHeight: IN(3.0),
  bandCentre: IN(30.0),
};

/* -------------------------------------------------------- fire hydrants */
export const HYDRANT = {
  /* AWWA C502 dry-barrel, the type used everywhere the ground freezes and
     the standard across South Carolina. */
  barrelDia:  IN(7.0),
  bonnetDia:  IN(9.5),
  /* Nozzle centreline 18 in minimum above the finished grade so a hose can
     be coupled. Operating nut on top, roughly 36 in up on a standard bury. */
  nozzleHeight: IN(18.0),
  operatingNutHeight: IN(36.0),
  bonnetHeight: IN(40.0),
  /* Two 2.5 in hose nozzles at 90 degrees and one 4.5 in pumper facing the
     street — the pumper orientation is a real placement rule, not a detail. */
  hoseNozzleDia:   IN(2.5),
  pumperNozzleDia: IN(4.5),
  nozzleProjection: IN(4.0),
  /* Breakaway flange at grade: the barrel shears rather than tearing out the
     main when a car hits it. Visible as a bolted collar just above the
     ground, and its absence is a common tell in a modelled street. */
  breakawayFlangeHeight: IN(3.0),
  breakawayFlangeDia: IN(10.0),

  /* NFPA 24: 3 ft clear all round. Placement 2 to 6 ft behind the curb face,
     and never inside the walking route. Spacing from fire code: 500 ft in a
     commercial district, 300 ft where the hazard is higher. */
  clearRadius: FT(3.0),
  setbackFromCurb: FT(3.0),
  spacingCommercial: FT(500.0),
  spacingHighHazard: FT(300.0),

  colour: 0xc4232a,            /* red barrel                                 */
  bonnetColourHighFlow: 0x1a9e4b,  /* NFPA 291 flow colour coding:           */
  bonnetColourMedFlow:  0xf5a623,  /*   green >1000 gpm, orange 500 to 1000, */
  bonnetColourLowFlow:  0xc4232a,  /*   red under 500 gpm                    */
};

/* -------------------------------------------------------- street trees */
export const TREE_PIT = {
  /* A street tree needs soil volume, not just a hole. 1000 cubic feet is the
     figure that actually grows a large canopy tree to maturity; the pit
     opening is the visible part of a much larger structural soil cell. */
  soilVolumeLarge: 28.3,       /* m3, = 1000 cubic feet                      */
  soilVolumeMedium: 17.0,
  openingWidth:  FT(5.0),
  openingLength: FT(5.0),
  openingMin:    FT(4.0),
  depth: FT(3.0),
  /* Grate keeps the walking surface continuous over the pit. Openings must
     not pass a 1/2 in sphere and must run perpendicular to travel. */
  grateThickness: IN(1.5),
  grateOpeningMax: IN(0.5),
  /* Trunk guard on a young tree. */
  guardHeight: FT(5.0),
  guardDia: IN(18.0),
  /* Clear trunk height so a canopy does not intrude on the route. */
  clearTrunkWalk: IN(80.0),
  clearTrunkRoad: FT(16.5),
  spacing: FT(30.0),
};

/* ------------------------------------------------- planters and railings */
export const PLANTER = {
  width: FT(3.0), length: FT(6.0), height: IN(30.0),
  wallThickness: IN(4.0),
  /* At 30 in the rim doubles as perch seating, which is why it is that height
     rather than the 18 in a purely horticultural planter would be. */
  soilDepth: IN(24.0),
};

export const RAILING = {
  /* IBC 1015: guard 42 in where a fall of over 30 in is possible. Handrail
     34 to 38 in, ADA 505.4. Balusters must not pass a 4 in sphere. */
  guardHeight: IN(42.0),
  handrailHeight: IN(34.0),
  handrailDia: IN(1.5),
  balusterGapMax: IN(4.0),
  postSpacing: FT(6.0),
  postDia: IN(2.5),
};

Object.freeze(BIN); Object.freeze(BENCH); Object.freeze(BIKE_RACK);
Object.freeze(BOLLARD); Object.freeze(HYDRANT); Object.freeze(TREE_PIT);
Object.freeze(PLANTER); Object.freeze(RAILING);

/**
 * Everything in the furnishing zone is checked against the walk it stands
 * beside. A bin that pushes the clear width under 4 ft is a violation no
 * matter how correct the bin itself is.
 */
export function furnitureCheck(id, { footprintWidth, furnishZoneWidth, walkWidth }) {
  const bad = [];
  if (footprintWidth > furnishZoneWidth + 1e-6) {
    bad.push(`${id}: ${footprintWidth.toFixed(2)} m footprint overhangs the ` +
             `${furnishZoneWidth.toFixed(2)} m furnishing zone and intrudes ` +
             `on the walk`);
  }
  if (walkWidth < WALK.clearMin - 1e-6) {
    bad.push(`${id}: leaves ${walkWidth.toFixed(2)} m of clear walk, below ` +
             `the ${WALK.clearMin.toFixed(3)} m PROWAG minimum`);
  }
  return bad;
}
