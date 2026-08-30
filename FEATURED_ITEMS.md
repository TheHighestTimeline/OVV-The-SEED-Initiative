# Featured items in the 3D world

Every interactive item the SEED Initiative campus world presents to a visitor —
one pin, one card, one anchor in world space each. Generated from the world's
own data, not written by hand: 45 systems in
[`seed-v5/src/17-hotspot-data.js`](seed-v5/src/17-hotspot-data.js) plus 6
heritage items in [`seed-v5/src/16-ui.js`](seed-v5/src/16-ui.js), anchored by
the `ANCHOR` map in the same file.

**51 items across 10 categories.** Every one is anchored to
geometry that exists in the world and is switchable from the category rail. In
v3, 20 of the 45 systems were filtered off and 5 pins pointed at nothing built;
in v5 all of them are shown and all of them point at real geometry.

★ = a stop on the cinematic tour · † = carries a `TODO_FACT` placeholder awaiting a real figure

---

## Summary

| Category | Items | Pin colour | Where it mostly sits |
|---|---|---|---|
| Water | 5 | `#44C7FF` | Compute core, Community, Living systems |
| Energy | 6 | `#1E6BFF` | Compute core, Community |
| Carbon | 5 | `#7C3AED` | Community, Watershed |
| Air | 4 | `#7ED8E8` | Community, Watershed, Compute core |
| Sound | 4 | `#A78BFA` | Community, Beyond the fence, Compute core |
| Infrastructure | 4 | `#D8DCE2` | Compute core, Living systems |
| Community | 5 | `#5FD39B` | Community, Living systems |
| Workforce | 3 | `#FFFFFF` | Community |
| Beyond the fence | 9 | `#FF8A5C` | Beyond the fence |
| Heritage | 6 | `#E0A458` | Coast, Ocean, Watershed |
| **Total** | **51** | | |

*Zone is the nearest camera view target, so it names the part of the world a
pin flies to, not a property boundary.*

---

## The items

### Water — 5 items  <sub>pin `#44C7FF`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 1 | `w1` | **Closed loop cooling plant** | Nothing leaves the loop. Cooling water is captured, treated and sent back into the campus instead of into a river. | **99.5%** drift captured · **0** process discharge · **5 to 15K** gal/day condensate · **60%** less potable draw | Compute core | -240, 34, 76 |
| 2 | `w2` | **500,000 gallon cistern** | The reservoir that makes the loop possible. Rain, condensate and treated blowdown all land here. | **500K** gallon capacity · **218M** gal/yr rainfall on site · **21.8M** gal/yr at 10% capture · **~0** discharge to environment | Community | -60, 33, 60 |
| 3 | `w3` | **Stormwater corridor** | Campus stormwater routes underground to the watershed corridor south of the wall. | **0** net runoff increase · **1.4 km** open corridor · **30 ft** wall setback · **100%** light rain infiltrated | Community | 82, 20, 500 |
| 4 | `w4` | **Detention pond wetlands** | Engineered as habitat first, retention second. | **3** ponds · **1.5 ac** total surface · **100 yr** storm capacity · **0** fishing zones | Living systems | 332, 22, -200 |
| 5 | `w5` | **Greenhouse and aquaponics loop** | Recirculating growing uses 90 to 95 percent less water than soil farming. | **90 to 95%** less water used · **~1%** daily loss · **0** antibiotics · **4** growing systems | Living systems | 227, 27, -214 |

### Energy — 6 items  <sub>pin `#1E6BFF`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 6 | `e1` | **Rooftop solar** | Every square foot of roof on this campus is generating. | **~40 MW** rooftop DC · **Bifacial** monocrystalline · **4.5** peak sun hours/day · **Cool roof** SR 0.65 or better | Compute core | -240, 38, -288 |
| 7 | `e2` | **Agrivoltaic ground array** | Panels raised eight feet so the land underneath keeps working. | **~15 MW** ground mount · **8 ft** clearance · **Pollinator** understory · **0** pesticides | Community | 324, 23, 332 |
| 8 | `e3` | **Carport solar and EV charging** | Shade for the cars, power for the campus, chargers for everyone. | **8 to 12 MW** carport DC · **Public** charger access · **Shade** plus generation · **Permeable** paving below | Community | 90, 25, 78 |
| 9 | `e4` | **Battery energy storage** | The campus can run its community half without the grid. | **8 hr** community zone runtime · **LiFePO4** chemistry · **Peak** solar absorption · **Backup** water plant power | Community | -78, 24, 118 |
| 10 | `e5` | **Waste to energy plant** | The only program on this campus that funds itself and then some. | **100** tons per day · **~80%** county waste diverted · **2 to 3 MW** continuous output · **+$2.56M** net per year | Community | -238, 46, 236 |
| 11 | `e6` | **Substation and microgrid** | Islandable by design, and a good neighbor on the grid. | **15 yr** power purchase agreement · **10 to 15%** local rate reduction target · **Islandable** community zone · **V2I** freight signal priority | Community | -255, 36, 320 |

### Carbon — 5 items  <sub>pin `#7C3AED`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 12 | `c1` | **Carbon capture on exhaust** | Not carbon neutral. Carbon negative. | **2 to 5K** tons CO2e removed/yr · **$25 to 50** per ton credit value · **DAC** on stack · **Permanent** sequestration | Community | -163, 35, 236 |
| 13 | `c2` | **Biochar production** | Organic waste becomes stable carbon locked in the soil for a thousand years. | **1,000+** years stable · **Soil** and growing media · **Pyrolysis** module · **On site** use only | Community | -163, 32, 260 |
| 14 | `c3` | **Carbon sequestering interiors** | The building materials themselves are storage. | **50 to 75** years CO2 stored · **Mass timber** structure and panels · **Hempcrete** wall fill · **Mycelium** composite panels | Community | -90, 30, 280 |
| 15 | `c4` | **Tree planting and native species** | Five thousand trees on site. Fifty thousand more off site. | **5,000** trees on site · **50,000** trees off site · **48 lbs** CO2 per tree per year · **~42** trees per ton offset | Watershed | 110, 30, 640 |
| 16 | `c5` | **Wildlife corridor** | Forty acres kept continuous so animals can still cross. | **40 ac** green zone · **Unlit** eastern night zone · **50 to 90%** bird strike reduction · **2 ac** pollinator meadow | Watershed | 64, 22, 760 |

### Air — 4 items  <sub>pin `#7ED8E8`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 17 | `a1` | **Emissions control and monitoring** | Continuous, public, and audited by someone who does not work here. | **80 to 90%** NOx reduction · **CEMS** continuous monitoring · **Below** EPA MACT standards · **Annual** third party audit | Community | -218, 60, 245 |
| 18 | `a2` | **Public air sensor network** | Twelve sensors. Eight of them are not on our property. | **12** sensors total · **8** in the community · **7** pollutants tracked · **Live** public dashboard | Watershed | 126, 23, 832 |
| 19 | `a3` | **Living green walls** | The turbine enclosures are covered in plants that filter the air at the wall face. | **20 to 40%** PM2.5 cut at wall · **Native** climbing species · **Visual** screening · **Thermal** buffer | Community | -240, 34, 118 |
| 20 | `a4` | **Odor control and no idling** | The waste hall is held at negative pressure so nothing escapes the tipping floor. | **Negative** hall pressure · **Biofilter** before release · **200 ft** no idling boundary · **Electric** yard trucks | Compute core | -330, 24, -330 |

### Sound — 4 items  <sub>pin `#A78BFA`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 21 | `s1` | **Six layer attenuation stack** | Sound is treated as a design constraint, not a complaint to manage later. | **6** layers of control · **4,000 LF** perimeter wall · **15 to 20 ft** wall height · **-25 to -40 dB** internal roof panels | Community | -260, 23, 396 |
| 22 | `s2` | **Infrasound monitoring array** | No data center on earth publicly monitors infrasound. This one does, before the first turbine fires. | **1 to 20 Hz** infrasound band · **12** sensors deployed · **8** in the community · **6 mo** pre construction baseline | Community | -330, 24, 280 |
| 23 | `s3` | **Neighbor window program** | If the modeling says a home might notice it, we pay for the windows. | **$2,000** rebate per home · **0.5 mi** radius · **~100** homes covered · **$200K** program budget | Beyond the fence | -260, 26, -868 |
| 24 | `s4` | **Rubberized interior roads** | Recycled tire rubber in the asphalt, quieter surface, longer life. | **-6 to -10 dB** tire noise · **Recycled** tire crumb · **All** interior roads · **Longer** service life | Compute core | -330, 22, 60 |

### Infrastructure — 4 items  <sub>pin `#D8DCE2`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 25 | `i1` | **Compute halls** ★ | The reason the rest of it can be paid for. | **4** hall structures · **Phased** delivery · **Cool roof** plus rooftop PV · **Waste heat** recovered | Compute core | -240, 40, -208 |
| 26 | `i2` | **Fiber and network spine** | Redundant paths in, and capacity left for the community on the way out. | **Diverse** entry paths · **Conduit** sized for growth · **Community** broadband pull through · **150** public wifi nodes | Compute core | -60, 31, -300 |
| 27 | `i3` | **Separated haul and access roads** | Waste trucks and school buses never meet. | **Dedicated** waste haul road · **Separate** community entrance · **Electric** yard fleet · **0** truck routes through housing | Compute core | 0, 26, -420 |
| 28 | `i4` | **Perimeter, security and access** | A working fence line that still lets the public in where it should. | **24/7** security across zones · **Public** community zone access · **QR** event registration · **0** personal data sold | Living systems | 13.9, 25, -410 |

### Community — 5 items  <sub>pin `#5FD39B`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 29 | `m1` | **Community center** ★ | The building that has nothing to do with data and everything to do with why this works. | **Free** to use · **7 days** open · **4** third places inside · **0** purchase required | Community | -90, 30, 280 |
| 30 | `m2` | **Event plaza and stage** | Three acres built as a permanent venue, not a parking lot with a rented tent. | **3 ac** permeable plaza · **20x40 ft** permanent stage · **400A** stage service · **$0** rental equipment | Community | 55, 26, 296 |
| 31 | `m3` | **Greenhouse network** ★ | Four houses, roughly 390,000 pounds of food a year, heated by the compute halls. | **53,000 sq ft** under glass · **~390K lbs** produce per year · **~875** people fed on produce · **Waste heat** primary heating | Living systems | 227, 27, -266 |
| 32 | `m4` | **Aquaponics and marine showcase** | Fish, shrimp, and a 5,000 gallon reef tank that school groups will remember for life. | **20,000 sq ft** recirculating system · **~25K lbs** fish per year · **~8K lbs** shrimp per year · **0** antibiotics | Living systems | 228, 30, -100 |
| 33 | `m5` | **Food hub and community kitchen** | A commercial kitchen rented by the hour launches food businesses that could never afford one. | **$10 to 25** per hour · **First 20 hrs** free for new businesses · **1,000+** emergency meals per day · **Sat 8am** farm stand | Living systems | 230, 28, -40 |

### Workforce — 3 items  <sub>pin `#FFFFFF`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 34 | `k1` | **Trades and vocational academy** | Every system on this campus is also a classroom. You do not import the workforce, you build it. | **16** training tracks · **Earn** while you learn · **Guaranteed** interview on completion · **$10M/yr** scholarship fund | Community | 215, 32, 250 |
| 35 | `k2` | **Apprenticeship pipeline** | Paid from day one, credentialed at the end, hired if you want the job. | **Paid** from week one · **0** tuition cost · **Tools** and transport covered · **Local** hire priority | Community | 215, 30, 222 |
| 36 | `k3` | **Field training yard** | Where the pipe actually gets threaded and the sod actually gets laid. | **Live** systems training · **Mock ups** plumbing and electrical · **Nursery** for site planting · **Year round** operation | Community | 325, 26, 250 |

### Beyond the fence — 9 items  <sub>pin `#FF8A5C`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 37 | `b1` | **Road upgrades and smart signals** | The road in front of your house gets fixed whether or not you ever set foot on this campus. | **20** intersections · **$120 to 180K** per intersection · **Preemption** for emergency vehicles · **USDOT** RAISE grant funded | Beyond the fence | 0, 30, -700 |
| 38 | `b2` | **ADA sidewalk network** | Workers here walk in the road shoulder to reach a bus stop. That is solvable. | **15 mi** phase one · **40 mi** full build · **5 ft** minimum ADA width · **30 yr** concrete life | Beyond the fence | 300, 27, -780 |
| 39 | `b3` | **Solar street lighting** | 450 poles with no utility bill, ever, and they stay on when the grid does not. | **450** pole units · **3+ days** battery autonomy · **$0** utility cost · **$40.5K/yr** municipal savings | Beyond the fence | -260, 30, -790 |
| 40 | `b4` | **Street tree canopy** | Seven thousand trees along forty miles of street, planted where people actually walk. | **7,000** trees at full build · **2,500** phase one · **-5 to -8 F** under canopy · **+5 to 15%** property value | Beyond the fence | 400, 30, -716 |
| 41 | `b5` | **Community water treatment plant** | Clean drinking water for about 5,000 people, and the backup supply when something goes wrong. | **0.5 MGD** capacity · **99%+** PFAS removal · **~5,000** people served · **8** community kiosks | Beyond the fence | -760, 32, -1120 |
| 42 | `b6` | **Home solar and battery** | Zero upfront, 30 to 50 percent lower bills, and the system is yours after ten years. | **300** homes phase one · **$0** upfront to homeowner · **30 to 50%** bill reduction · **Yr 10** transfers to owner | Beyond the fence | 180, 28, -905 |
| 43 | `b7` | **Microtransit shuttle** | The keystone. Without a ride, every other program is harder to reach. | **4** electric vans · **Free** for area residents · **6am to 10pm** Mon to Sat · **On demand** app or phone call | Beyond the fence | -18, 26, -672 |
| 44 | `b8` | **Underground utility lines** | Overhead lines fail in storms and blight the street. Bury them while the trench is open. | **10 mi** target · **97%** fewer storm outages · **75%** FEMA cost share · **30 to 35 yr** service life | Beyond the fence | 190, 25, -800 |
| 45 | `b9` | **Childcare and family support** ★ | Ten thousand seats at two to five dollars a day, open on the shifts people actually work. | **10,000** seats at full build · **$2 to 5** per day · **24 hr** operation · **$35 to 55M** new taxable income | Beyond the fence | -60, 30, -1090 |

### Heritage — 6 items  <sub>pin `#E0A458`</sub>

| # | ID | Item | What it is | Headline figures | Zone | Anchor (x, y, z) |
|---|---|---|---|---|---|---|
| 46 | `h1` | **Heritage promenade** ★ † | One marker for every cleanup we ran before there was a site to build on. Walking toward the water walks you forward through the history. | **TODO_FACT** cleanups to date · **TODO_FACT** volunteers · **TODO_FACT** lb recovered · **1** marker left blank | Coast | 90, 12, 1272 |
| 47 | `h2` | **Recovered-material sculpture** † | An anchor piece at the dune crest, assembled from net, rope, plastic, buoys and metal taken out of the water. | **11 m** tall · **TODO_FACT** total mass · **4** source cleanups · **Yes** lit at night | Coast | 122, 18, 1292 |
| 48 | `h3` | **Living shoreline** | Oyster-bag sills, marsh-grass plugs and coir logs. No bulkhead and no riprap. | **0** m of bulkhead · **680 m** of treated shoreline · **3** sill types · **Yes** self-maintaining | Coast | 60, 6, 1158 |
| 49 | `h4` | **Ocean and beach cleanup** ★ † | A skimmer, two RIBs, a collection barge and a shore crew. The operation did not stop when the campus opened. | **TODO_FACT** cleanups per year · **TODO_FACT** lb per cleanup · **7** monitoring buoys · **2** beach stretches compared | Ocean | 200, 12, 1800 |
| 50 | `h5` | **Watershed corridor** ★ | Campus stormwater to bioswale to creek to river to estuary to ocean. One continuous, walkable ribbon. | **150 mi** to the Atlantic · **1.4 km** of trail · **3** planting bands · **1** monitoring station | Watershed | 150, 12, 900 |
| 51 | `h6` | **Then and now** | Three paired markers linking a past practice to the campus program it became. | **3** pairs · **0** invented figures · **—** undated final marker | Coast | 78, 8, 1226 |

---

## Cinematic tour stops

The tour runs 8 legs; leg 1 is the overview with no card open.

| Leg | View | Opens | Card |
|---|---|---|---|
| 2 | Compute core | `i1` | Compute halls |
| 3 | Living systems | `m3` | Greenhouse network |
| 4 | Community | `m1` | Community center |
| 5 | Beyond the fence | `b9` | Childcare and family support |
| 6 | Watershed | `h5` | Watershed corridor |
| 7 | Coast (night) | `h1` | Heritage promenade |
| 8 | Ocean (night) | `h4` | Ocean and beach cleanup |

---

## Items still carrying placeholders

These cards show `TODO_FACT` in the world rather than an invented number.
They need measured data from Tanner before the world is shown publicly.

- `h1` **Heritage promenade** — cleanups to date, volunteers, lb recovered
- `h2` **Recovered-material sculpture** — total mass
- `h4` **Ocean and beach cleanup** — cleanups per year, lb per cleanup

