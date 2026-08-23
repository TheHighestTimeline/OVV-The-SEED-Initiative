/* ============================================================================
   16-ui.js — markers, detail cards, filters, views, tour, time, accessibility
   ----------------------------------------------------------------------------
   v3 filtered off 20 of its 45 hotspots: every Sound, Workforce and
   Beyond-the-Fence entry, plus the marine showcase and the food hub. All of
   them are shown here, plus a new Heritage set, managed by distance culling
   and clustering so the density stays readable.
   ========================================================================== */

import * as THREE from 'three';
import { SITE, TIER_ORDER, TIME_STATES, clamp, lerp, smoothstep } from './00-config.js';
import { groundH } from './01-terrain.js';
import { CATS_ALL, SPOTS_ALL } from './17-hotspot-data.js';
import { updateWaters } from './water.js';
import { updateWind } from './14-vegetation.js';

/* ------------------------------------------------------- the heritage set */
const HERITAGE_SPOTS = [
  { id: 'h1', cat: 'heritage', t: 'Heritage promenade',
    k: 'One marker for every cleanup we ran before there was a site to build on. Walking toward the water walks you forward through the history.',
    stats: [['TODO_FACT', 'cleanups to date'], ['TODO_FACT', 'volunteers'],
            ['TODO_FACT', 'lb recovered'], ['1', 'marker left blank']],
    rows: [['Why it is here', 'We were pulling things out of the water long before we had a site to build on. The cleanups did not stop when the campus started. They are the reason it looks like this.'],
           ['The markers', 'Each plinth carries a year, a location, a volunteer count and a recovered weight. The last marker is undated and blank. It is captioned "next one".'],
           ['Data needed', 'TODO_FACT: which cleanups, what years, where, roughly how many volunteers, and roughly how much material recovered. No figure goes on a public marker without measured data behind it.']],
    note: 'The promenade runs along the dune crossover, so the walk from the campus to the beach is the walk through the record.',
    tags: ['heritage', 'cleanups', 'TODO_FACT'] },
  { id: 'h2', cat: 'heritage', t: 'Recovered-material sculpture',
    k: 'An anchor piece at the dune crest, assembled from net, rope, plastic, buoys and metal taken out of the water.',
    stats: [['11 m', 'tall'], ['TODO_FACT', 'total mass'], ['4', 'source cleanups'], ['Yes', 'lit at night']],
    rows: [['What it is made of', 'Only recovered material. Nothing was bought to build it.'],
           ['Where it sits', 'At the crest of the dune crossover, visible from the beach and from the estuary overlook.'],
           ['Data needed', 'TODO_FACT: total mass and the source cleanup for each component.']],
    note: 'This is the image people photograph, which is the point.',
    tags: ['sculpture', 'recovered material', 'TODO_FACT'] },
  { id: 'h3', cat: 'heritage', t: 'Living shoreline',
    k: 'Oyster-bag sills, marsh-grass plugs and coir logs. No bulkhead and no riprap.',
    stats: [['0', 'm of bulkhead'], ['680 m', 'of treated shoreline'], ['3', 'sill types'], ['Yes', 'self-maintaining']],
    rows: [['Method', 'Oyster-bag sills break the wave energy, marsh plugs hold the sediment, coir logs buy the planting time to establish. The shoreline gains material instead of losing it.'],
           ['Why not a wall', 'A bulkhead reflects wave energy and scours the toe. Within a decade it needs a bigger wall. A living shoreline gets stronger.']],
    note: 'The same principle as the berm: work with the load rather than against it.',
    tags: ['oyster reef', 'marsh', 'no bulkhead'] },
  { id: 'h4', cat: 'heritage', t: 'Ocean and beach cleanup',
    k: 'A skimmer, two RIBs, a collection barge and a shore crew. The operation did not stop when the campus opened.',
    stats: [['TODO_FACT', 'cleanups per year'], ['TODO_FACT', 'lb per cleanup'], ['7', 'monitoring buoys'], ['2', 'beach stretches compared']],
    rows: [['On the water', 'A skimmer works a slow loop inside a debris boom, with two RIBs feeding it and a barge taking the load ashore.'],
           ['On the beach', 'The stretch east of the crossover is cleared by hand. The stretch west of it is left as found, so the difference is visible rather than claimed.'],
           ['Data needed', 'TODO_FACT: cadence, crew size and recovered weight per cleanup.']],
    note: 'The uncleaned stretch is deliberate. It is the control.',
    tags: ['cleanup', 'skimmer', 'before and after', 'TODO_FACT'] },
  { id: 'h5', cat: 'heritage', t: 'Watershed corridor',
    k: 'Campus stormwater to bioswale to creek to river to estuary to ocean. One continuous, walkable ribbon.',
    stats: [['150 mi', 'to the Atlantic'], ['1.4 km', 'of trail'], ['3', 'planting bands'], ['1', 'monitoring station']],
    rows: [['The continuum', 'Bennettsville sits in the Yadkin–Pee Dee basin and the Great Pee Dee runs southeast into Winyah Bay and the Atlantic. Water that leaves this site ends up in that ocean.'],
           ['Shown compressed', 'The corridor here is a compressed model, not a map. A marker on the overlook says so.'],
           ['The works', 'A headwall and level spreader at the outfall, cobble check dams down the creek, three riparian planting bands, and a footbridge at the estuary head.']],
    note: 'The reason the ocean belongs in this model is that the campus already drains to it.',
    tags: ['Pee Dee', 'watershed', 'riparian'] },
  { id: 'h6', cat: 'heritage', t: 'Then and now',
    k: 'Three paired markers linking a past practice to the campus program it became.',
    stats: [['3', 'pairs'], ['0', 'invented figures'], ['—', 'undated final marker'], ['—', '']],
    rows: [['Cleanup crews to academy', 'The volunteer crews are where the trades and vocational academy came from.'],
           ['Festival diversion to waste to energy', 'Diverting festival waste is where the waste-to-energy plant came from.'],
           ['Carbon Sponge to capture and biochar', 'Carbon Sponge is where the carbon capture and biochar line came from.']],
    note: 'We want to implement our past into our future. These three markers are where that is literally spelled out.',
    tags: ['then and now', 'lineage'] },
];

const CATS = { ...CATS_ALL, heritage: { label: 'Heritage', color: '#E0A458' } };
const SPOTS = SPOTS_ALL.concat(HERITAGE_SPOTS);

/* -------------------------------------------------------- anchors in world
   Every pin points at geometry that exists. In v3, five pins pointed at
   nothing: agrivoltaics, carport solar, the bioswale, rubberized roads and the
   security fence were all described but never built. */
const ANCHOR = {
  /* water */
  w1: [-240, 34, 76],   w2: [-60, 33, 60],    w3: [82, 20, 500],
  w4: [332, 22, -200],  w5: [227, 27, -214],
  /* energy */
  e1: [-240, 38, -288], e2: [324, 23, 332],   e3: [90, 25, 78],
  e4: [-78, 24, 118],   e5: [-238, 46, 236],  e6: [-255, 36, 320],
  /* carbon */
  c1: [-163, 35, 236],  c2: [-163, 32, 260],  c3: [-90, 30, 280],
  c4: [110, 30, 640],   c5: [64, 22, 760],
  /* air */
  a1: [-218, 60, 245],  a2: [126, 23, 832],   a3: [-240, 34, 118],
  a4: [-330, 24, -330],
  /* sound */
  s1: [-260, 40, 469],  s2: [-330, 24, 280],  s3: [-260, 26, -868],
  s4: [-330, 22, 60],
  /* infrastructure */
  i1: [-240, 40, -208], i2: [-60, 31, -300],  i3: [0, 26, -420],
  i4: [26, 25, -410],
  /* community */
  m1: [-90, 30, 280],  m2: [55, 26, 296],    m3: [227, 27, -266],
  m4: [228, 30, -100],   m5: [230, 28, -40],
  /* workforce */
  k1: [215, 32, 250],   k2: [215, 30, 222],   k3: [325, 26, 250],
  /* beyond the fence */
  b1: [0, 30, -700],    b2: [300, 27, -780],  b3: [-260, 30, -790],
  b4: [400, 30, -716],  b5: [-760, 32, -1120], b6: [180, 28, -905],
  b7: [-18, 26, -672],  b8: [190, 25, -800],  b9: [-60, 30, -1090],
  /* heritage */
  h1: [90, 12, 1272],   h2: [122, 18, 1292],  h3: [60, 6, 1158],
  h4: [200, 12, 1800],  h5: [150, 12, 900],   h6: [78, 8, 1226],
};

/* ------------------------------------------------------------------- views */
export const VIEWS = [
  { id: 'overview', label: 'Overview', target: [0, 30, 60], dist: 1150, theta: -0.62, phi: 0.86 },
  { id: 'compute', label: 'Compute core', target: [-230, 24, -180], dist: 480, theta: -0.95, phi: 0.98 },
  { id: 'living', label: 'Living systems', target: [250, 22, -190], dist: 420, theta: 0.85, phi: 1.02 },
  { id: 'community', label: 'Community', target: [0, 22, 276], dist: 400, theta: -2.35, phi: 1.02 },
  { id: 'beyond', label: 'Beyond the fence', target: [0, 26, -840], dist: 620, theta: -0.30, phi: 0.92 },
  { id: 'watershed', label: 'Watershed', target: [90, 10, 780], dist: 430, theta: 2.55, phi: 1.05 },
  { id: 'coast', label: 'Coast', target: [110, 6, 1270], dist: 340, theta: 2.90, phi: 1.06 },
  { id: 'ocean', label: 'Ocean', target: [180, 2, 1620], dist: 640, theta: 3.05, phi: 1.16 },
];

/* the cinematic tour: eight zones, eased, in the afternoon state through the
   campus and the town, with the hard switch to night at the coast */
const TOUR = [
  { view: 0, hold: 5.0, state: 'afternoon', open: null },
  { view: 1, hold: 5.5, state: 'afternoon', open: 'i1' },
  { view: 2, hold: 5.5, state: 'afternoon', open: 'm3' },
  { view: 3, hold: 6.0, state: 'afternoon', open: 'm1' },
  { view: 4, hold: 5.5, state: 'afternoon', open: 'b9' },
  { view: 5, hold: 5.5, state: 'afternoon', open: 'h5' },
  { view: 6, hold: 6.5, state: 'night', open: 'h1' },
  { view: 7, hold: 8.0, state: 'night', open: 'h4' },
];

export function initUI(state) {
  const { pipeline, orbit } = state;
  const cam = pipeline.camera;

  /* ------------------------------------------------------------ category rail */
  const rail = document.getElementById('rail');
  const active = new Set(Object.keys(CATS));
  for (const key of Object.keys(CATS)) {
    const c = CATS[key];
    const b = document.createElement('button');
    b.className = 'cat';
    b.type = 'button';
    b.innerHTML = `<span class="dot" style="background:${c.color};color:${c.color}"></span>` +
                  `<span class="nm">${c.label}</span>`;
    b.setAttribute('aria-pressed', 'true');
    b.onclick = () => {
      if (active.has(key)) active.delete(key); else active.add(key);
      b.classList.toggle('off', !active.has(key));
      b.setAttribute('aria-pressed', String(active.has(key)));
      refreshPins();
    };
    rail.appendChild(b);
  }

  /* ------------------------------------------------------------------ views */
  const viewBar = document.getElementById('views');
  VIEWS.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'view' + (i === 0 ? ' on' : '');
    b.type = 'button';
    b.textContent = v.label;
    b.setAttribute('role', 'tab');
    b.onclick = () => {
      stopTour();
      orbit.goTo(v);
      [...viewBar.children].forEach((c, j) => c.classList.toggle('on', j === i));
    };
    viewBar.appendChild(b);
  });

  /* ------------------------------------------------------------------- pins */
  const pinLayer = document.getElementById('pins');
  const pins = [];
  const unanchored = [];
  for (const s of SPOTS) {
    const a = ANCHOR[s.id];
    if (!a) { unanchored.push(s.id); continue; }
    const el = document.createElement('button');
    el.className = 'pin';
    el.type = 'button';
    el.style.color = CATS[s.cat] ? CATS[s.cat].color : '#fff';
    el.innerHTML = `<span class="ring"><i></i></span><span class="lbl">${s.t}</span>`;
    el.setAttribute('aria-label', `${CATS[s.cat] ? CATS[s.cat].label : s.cat}: ${s.t}`);
    el.onclick = (ev) => { ev.stopPropagation(); openCard(s); };
    pinLayer.appendChild(el);
    pins.push({ spot: s, el, pos: new THREE.Vector3(a[0], a[1], a[2]), vis: true });
  }
  if (unanchored.length) console.warn('[ui] unanchored hotspots:', unanchored);
  state.pinCount = pins.length;

  let labelsOn = true;
  function refreshPins() {
    for (const p of pins) {
      p.vis = active.has(p.spot.cat);
      if (!p.vis) p.el.style.display = 'none';
    }
  }

  /* --------------------------------------------------------------- the card */
  const card = document.getElementById('card');
  const elCat = document.getElementById('cardCat');
  const elTitle = document.getElementById('cardTitle');
  const elKick = document.getElementById('cardKick');
  const elStats = document.getElementById('stats');
  const elRows = document.getElementById('rows');
  const elNote = document.getElementById('note');
  const elTags = document.getElementById('tags');
  let selected = null;

  const todoify = (t) => String(t).replace(/TODO_FACT(:[^.<]*)?/g,
    (m) => `<span class="todofact">${m}</span>`);

  function openCard(s) {
    selected = s;
    const c = CATS[s.cat] || { label: s.cat, color: '#fff' };
    elCat.innerHTML = `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block"></span> ${c.label}`;
    elTitle.textContent = s.t;
    elKick.innerHTML = todoify(s.k || '');
    elStats.innerHTML = (s.stats || []).map(([v, l]) =>
      `<div><b>${todoify(v)}</b><span>${l}</span></div>`).join('');
    elRows.innerHTML = (s.rows || []).map(([h, b]) =>
      `<h3>${h}</h3><p>${todoify(b)}</p>`).join('');
    elNote.innerHTML = s.note ? todoify(s.note) : '';
    elNote.style.display = s.note ? '' : 'none';
    elTags.innerHTML = (s.tags || []).map((t) => `<span>${t}</span>`).join('');
    card.classList.add('open');
    card.focus({ preventScroll: true });
    for (const p of pins) p.el.classList.toggle('sel', p.spot.id === s.id);
    const a = ANCHOR[s.id];
    if (a) {
      orbit.target.set(a[0], a[1], a[2]);
      orbit.dist = Math.max(orbit.minDist, Math.min(orbit.dist, 260));
      orbit.clampTarget();
    }
  }
  function closeCard() {
    selected = null;
    card.classList.remove('open');
    for (const p of pins) p.el.classList.remove('sel');
  }
  document.getElementById('close').onclick = closeCard;
  state.openCard = openCard;

  /* --------------------------------------------------------------- controls */
  /* Two time states, no scrubber. The swap is hard: same physical pipeline,
     but only these two hours exist and each keeps its baked environment. */
  const stateBtns = [...document.querySelectorAll('#timestates .tstate')];
  const setTimeState = (name) => {
    if (!(name in TIME_STATES)) return;
    state.timeState = name;
    pipeline.setTimeOfDay(TIME_STATES[name], true);
    for (const b of stateBtns) {
      const on = b.dataset.state === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  };
  state.setTimeState = setTimeState;
  for (const b of stateBtns) {
    b.onclick = () => { stopTour(); setTimeState(b.dataset.state); };
  }

  const qBtn = document.getElementById('qBtn');
  const setQLabel = () => { qBtn.textContent = 'Quality: ' + pipeline.tier.name; };
  setQLabel();
  qBtn.onclick = () => {
    const i = TIER_ORDER.indexOf(pipeline.tierName);
    pipeline.setTier(TIER_ORDER[(i + 1) % TIER_ORDER.length]);
    setQLabel();
  };

  const labelBtn = document.getElementById('labelBtn');
  labelBtn.classList.add('on');
  labelBtn.onclick = () => {
    labelsOn = !labelsOn;
    labelBtn.classList.toggle('on', labelsOn);
    pinLayer.classList.toggle('nolabels', !labelsOn);
    for (const p of pins) p.el.querySelector('.lbl').style.display = labelsOn ? '' : 'none';
  };

  /* ------------------------------------------------------------- text view */
  const a11y = document.getElementById('a11y');
  const textBtn = document.getElementById('textBtn');
  textBtn.onclick = () => {
    if (!a11y.dataset.built) {
      const w = a11y.querySelector('.wrap');
      w.innerHTML = '<h1>SEED Initiative — Living Campus</h1>' +
        '<p class="st">Text version of every system in the model. ' +
        `${SPOTS.length} systems across ${Object.keys(CATS).length} categories.</p>` +
        '<p><button id="a11yClose" style="background:none;border:1px solid #333;border-radius:8px;padding:6px 12px;color:#eee">Back to the model</button></p>' +
        Object.keys(CATS).map((k) => {
          const list = SPOTS.filter((s) => s.cat === k);
          if (!list.length) return '';
          return `<h2>${CATS[k].label}</h2>` + list.map((s) =>
            `<h3>${s.t}</h3><p>${todoify(s.k || '')}</p>` +
            `<p class="st">${(s.stats || []).map(([v, l]) => `${v} ${l}`).join(' · ')}</p>` +
            (s.rows || []).map(([h, b]) => `<p><strong>${h}.</strong> ${todoify(b)}</p>`).join('') +
            (s.note ? `<p><em>${todoify(s.note)}</em></p>` : '')).join('');
        }).join('');
      a11y.dataset.built = '1';
      w.querySelector('#a11yClose').onclick = () => a11y.classList.remove('on');
    }
    a11y.classList.add('on');
  };

  /* ------------------------------------------------------------------ tour */
  const tourBtn = document.getElementById('tourBtn');
  function startTour() {
    let i = 0, t = 0;
    tourBtn.classList.add('on');
    tourBtn.textContent = '■ Stop';
    orbit.enabled = false;
    state.tour = {
      update(dt) {
        t += dt;
        const leg = TOUR[i];
        const v = VIEWS[leg.view];
        orbit.target.lerp(new THREE.Vector3(v.target[0], v.target[1], v.target[2]), 0.018);
        orbit.dist += (v.dist - orbit.dist) * 0.018;
        let dth = v.theta - orbit.theta;
        while (dth > Math.PI) dth -= Math.PI * 2;
        while (dth < -Math.PI) dth += Math.PI * 2;
        orbit.theta += dth * 0.018;
        orbit.phi += (v.phi - orbit.phi) * 0.018;
        if (state.timeState !== leg.state) setTimeState(leg.state);
        if (t > leg.hold * 0.35 && leg.open && selected !== leg.open) {
          const s = SPOTS.find((q) => q.id === leg.open);
          if (s && (!selected || selected.id !== s.id)) openCard(s);
        }
        if (t > leg.hold) {
          t = 0; i++;
          if (i >= TOUR.length) { stopTour(); return; }
          [...viewBar.children].forEach((c, j) => c.classList.toggle('on', j === TOUR[i].view));
        }
      },
    };
  }
  function stopTour() {
    if (!state.tour) return;
    state.tour = null;
    orbit.enabled = true;
    tourBtn.classList.remove('on');
    tourBtn.textContent = '▶ Tour';
  }
  tourBtn.onclick = () => (state.tour ? stopTour() : startTour());

  /* -------------------------------------------------------------- keyboard */
  let kbIndex = -1;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCard(); a11y.classList.remove('on'); stopTour(); }
    if (e.key === 'Tab' && e.altKey) {
      e.preventDefault();
      const vis = pins.filter((p) => p.vis);
      if (!vis.length) return;
      kbIndex = (kbIndex + 1) % vis.length;
      openCard(vis[kbIndex].spot);
      vis[kbIndex].el.focus();
    }
    /* E opens the nearest marker. In v3 this key was bound twice and also
       raised the camera target; the two are separated here. */
    if (e.key === 'e' || e.key === 'E') {
      let best = null, bd = Infinity;
      for (const p of pins) {
        if (!p.vis) continue;
        const d = p.pos.distanceToSquared(cam.position);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) openCard(best.spot);
    }
    if (e.key === 'r' || e.key === 'R') { stopTour(); orbit.goTo(VIEWS[0]); }
    if (e.key === 't' || e.key === 'T') { state.tour ? stopTour() : startTour(); }
  });

  /* ------------------------------------------------- per-frame marker layout
     placeMarkers runs BEFORE render, so the pins do not lag a frame as v3's
     did. Distance culling plus clustering keeps the density readable. */
  const v = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let clock = 0;

  state.onFrame = (dt, now) => {
    clock += dt;

    updateWaters(clock, pipeline);
    updateWind(clock);
    if (state.zones.coast && state.zones.coast.update) state.zones.coast.update(clock, dt);
    if (state.zones.props && state.zones.props.update) state.zones.props.update(clock, dt);

    /* spinning cooling-tower fans */
    if (!state.fans) {
      state.fans = [];
      state.world.traverse((o) => { if (o.userData && o.userData.spin) state.fans.push(o); });
    }
    for (const f of state.fans) f.rotation.y += f.userData.spin * dt;

    cam.getWorldDirection(camDir);
    const w = window.innerWidth, h = window.innerHeight;
    const shown = [];
    for (const p of pins) {
      if (!p.vis) { p.el.style.display = 'none'; continue; }
      v.copy(p.pos);
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      const behind = v.z > 1;
      const off = v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05;
      const tooFar = dist > 1650;
      if (behind || off || tooFar) { p.el.style.display = 'none'; continue; }
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      /* cluster: hide a pin that lands within 26 px of one already shown */
      let clustered = false;
      for (const s of shown) {
        if (Math.abs(s.x - sx) < 26 && Math.abs(s.y - sy) < 26) { clustered = true; break; }
      }
      if (clustered && p.spot.id !== (selected && selected.id)) {
        p.el.style.display = 'none';
        continue;
      }
      shown.push({ x: sx, y: sy });
      p.el.style.display = '';
      p.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
      p.el.style.opacity = String(clamp(1 - (dist - 900) / 750, 0.25, 1));
    }
  };

  refreshPins();
  return { openCard, closeCard, pins, VIEWS };
}
