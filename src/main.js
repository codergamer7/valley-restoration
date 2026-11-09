// Scroll engine: maps scroll position to the valley's state, camera, and page animations.
import { createValley, ZERO, FULL, scores, riverX, terrainH, groundH } from './valley.js';
import { initPredict, initQuiz, initSim, initPlan } from './widgets.js';
import { initLab } from './lab.js';
import { initPosters } from './posters.js';
import { initLake, initBiomag, SCENE_STOPS } from './scenes.js';
import { initScroller } from './scroller.js';
import { createEarth } from './earth.js';
import { toggleSound, updateSound } from './sound.js';
import { initPresenter } from './presenter.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* camera poses: [from pos, to pos, look target, side]. side moves the subject away from the note. */
const POSES = {
  hero: [[44, 64, 128], [34, 54, 106], [2, 0, 6], 0],
  damage: [[2, 70, 104], [-8, 62, 96], [0, 2, 6], 'R'],
  part1: [[-14, 36, 58], [-12, 32, 50], [-26, 8, 10], 0],
  forest: [[2, 40, 58], [-5, 32, 50], [-36, 5, 8], 'R'],
  wetland: [[36, 24, -8], [33, 19, 0], [12, 0, 9], 'L'],
  corridor: [[-2, 34, -36], [-6, 28, -30], [-32, 3, -8], 'R'],
  part2: [[-8, 36, 22], [-12, 32, 14], [20, 8, -24], 0],
  air: [[-16, 34, 6], [-9, 28, 1], [20, 10, -30], 'L'],
  pipe: [[-22, 24, 2], [-16, 19, -3], [6, 3, -24], 'R'],
  waste: [[-1, 34, 30], [-5, 28, 31], [-28, 6, 42], 'R'],
  part3: [[6, 30, 66], [10, 26, 62], [32, 2, 34], 0],
  farm: [[-2, 26, 60], [3, 21, 56], [36, 3, 33], 'L'],
  school: [[3, 17, 34], [1, 13, 31], [-16, 4, 14], 'R'],
  monitor: [[24, 13, 40], [20, 10, 36], [2, 0, 19], 'L'],
  // while a diagram fills the screen the camera waits close to the place it explains,
  // then pulls back as the diagram shrinks away (from pos, to pos, look, side, zoom out)
  soil: [[-3, 26, 42], [-8, 21, 37], [-32, 6, 20], 'R'],
  organic: [[3, 21, 56], [8, 16, 50], [36, 3, 33], 'L'],
  lake: [[29, 11, -1], [34, 21, -7], [15, 2, 7], 0, true],
  biomag: [[16, 15, 52], [6, 24, 58], [36, 5, 33], 0, true],
  compare: [[0, 78, 128], [0, 78, 128], [0, -2, 0], 0],
  effects: [[0, 78, 128], [0, 78, 128], [0, -2, 0], 0],
};

/* labels on the model for each chapter */
const PINS = {
  lake: [[15, 2.8, 7, 'This reed bed']],
  biomag: [[36, 2.6, 33, 'No more spraying']],
  forest: [[-40, 6.5, 14, 'Native mixed forest'], [-23, 2.2, 22, 'Coir mats on steep ground']],
  wetland: [[15, 2.8, 7, 'Reed bed'], [8.5, 6, -3, 'Buffer strip']],
  corridor: [[-30, 7, -8, 'Green bridge'], [-36, 8, -50, 'Protected old forest']],
  air: [[14.5, 9, -42.2, 'Scrubbers'], [40, 3, 5, 'Solar field'], [47, 15, -33, 'Wind']],
  pipe: [[15, 3.2, -18, 'Treatment tanks'], [0, 3, -25, 'Outfall pipe']],
  waste: [[-30, 3.2, 39, 'Capped dump'], [-17, 4.5, 46, 'Recycling centre'], [-14.6, 2.6, 41.2, 'Compost rows']],
  farm: [[25.8, 3.6, 28, 'Hedgerow'], [31, 2.6, 40, 'Mixed strips'], [53, 2.6, 44, 'Bee boxes']],
  school: [[-18, 6.4, 12, 'School'], [-13, 2.4, 19, 'Student garden']],
  monitor: [[riverX(20), 5.6, 20, 'River buoy'], [riverX(24) - 5.2, 3, 24, 'River insect survey'], [9.5, 4.2, 30, 'Sensor mast']],
};
Object.values(PINS).forEach((list) => list.forEach((q) => { q[1] += groundH(q[0], q[2]); }));

/* five clickable damage markers */
const DAMAGE = [
  { p: [-36, 1.5, 10], t: 'Bare slopes', d: 'With no roots to hold it, rain washes the topsoil into the river.', side: 1 },
  { p: [14.5, 17.5, -38.8], t: 'Coal smoke', d: 'Sulphur dioxide forms acid rain and harms lungs, leaves and soil.', side: -1 },
  { p: [0, 1.6, -25], t: 'Raw waste pipe', d: 'Untreated waste uses up the oxygen in the river, so fish suffocate.', side: 1 },
  { p: [36, 2.5, 33], t: 'Sprayed single crop', d: 'Chemicals kill helpful insects, and spare fertiliser runs off into the river.', side: -1 },
  { p: [-30, 2.5, 39], t: 'Open dump', d: 'Smoke rises from burning rubbish, and toxic liquid leaks into the groundwater.', side: 1 },
];
DAMAGE.forEach((m) => { m.p[1] += groundH(m.p[0], m.p[2]); });

const canvas = $('#valley');
let valley = null;
try { valley = createValley(canvas); } catch (e) { document.documentElement.classList.add('no-webgl'); console.warn('WebGL unavailable', e); }
let earth = null;
try { if (valley) earth = createEarth(valley.renderer); } catch (e) { console.warn('Earth unavailable', e); }
const SWAP = .75; // inside the thickest cloud, the Earth is swapped for the valley

/* ---------- split kinetic headline ---------- */
function splitLetters(sel) {
  const out = [];
  $$(`${sel} .kline`).forEach((line) => {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');
    [...text].forEach((ch) => {
      const s = document.createElement('span');
      s.className = 'kchar';
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      line.appendChild(s);
      out.push(s);
    });
  });
  out.forEach((s, i) => { s.dataset.i = i / out.length; });
  return out;
}
const heroLetters = splitLetters('#heroTitle');
const earthLetters = splitLetters('#earthTitle');
const earthLines = $$('.earth-line');
const spaceEl = $('#space');
let earthIntro = reduced ? 1 : 0;

/* word-by-word lead sentences */
$$('.scrub').forEach((p) => {
  const words = p.textContent.trim().split(/\s+/);
  p.setAttribute('aria-label', p.textContent.trim());
  p.innerHTML = words.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
});

/* ---------- river progress rail ---------- */
const chapters = $$('section[data-title]');
const rail = $('#rail');
const RIVER_D = 'M18 0 C 30 40, 6 70, 18 110 S 32 180, 14 220 S 4 300, 20 340 S 32 410, 16 450 S 6 520, 18 560 S 28 600, 18 640';
rail.innerHTML = `<svg viewBox="0 0 36 640" preserveAspectRatio="none" aria-hidden="true">
  <path d="${RIVER_D}" fill="none" stroke="rgba(23,38,31,.28)" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  <path id="riverFill" d="${RIVER_D}" fill="none" stroke="#6b5a35" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
</svg>`;
const riverFill = $('#riverFill');
const riverLen = riverFill.getTotalLength();
riverFill.style.strokeDasharray = riverLen;
const railDots = chapters.map((sec) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `<span>${sec.dataset.title}</span>`;
  b.setAttribute('aria-label', `Go to ${sec.dataset.title}`);
  b.addEventListener('click', () => go(sec));
  rail.appendChild(b);
  return b;
});
function go(sec) {
  const y = absTop(sec) + (sec.classList.contains('beat') && !['hero', 'compare', 'flyover', 'earth'].includes(sec.id) ? innerHeight * .5 : 0);
  scroller.setAuto(false);
  scroller.glideTo(y, 3.5);
}

/* ---------- things the frame loop shares ---------- */
let introT = 0;
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
if (matchMedia('(hover: hover)').matches && !reduced) {
  addEventListener('pointermove', (e) => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; }, { passive: true });
}
const sceneList = [
  ['#lake', initLake, [15, 1.5, 7]],
  ['#biomag', initBiomag, [36, 2, 33]],
].map(([sel, init, site]) => {
  const el = $(sel);
  const q = site.slice();
  q[1] += groundH(q[0], q[2]);
  return { el, sticky: $('.scene-sticky', el), canvas: $('canvas', el), ui: $$('.scene-card, .scene-time, .scene-caveat', el), draw: init(el), site: q, stops: SCENE_STOPS[el.id] };
});
const ring = $('#irisRing');
const presenter = initPresenter(chapters);
const scroller = initScroller();

const soundBtn = $('#toolSound');
const flipSound = () => { const o = toggleSound(); soundBtn.setAttribute('aria-pressed', o); soundBtn.textContent = o ? 'Sound on' : 'Sound off'; };
soundBtn.addEventListener('click', flipSound);

/* ---------- layout cache ---------- */
const SCENE_END = .9; // the diagram plays until here, then shrinks back into the valley
let L = { vh: innerHeight, vw: innerWidth, max: 1, mobile: false, zones: [], keys: [], notes: [], parts: [], counts: [], chapterTops: [] };
const absTop = (el) => { let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t; };

function measure() {
  const vh = innerHeight, vw = innerWidth;
  L.vh = vh; L.vw = vw; L.mobile = vw <= 860;
  L.max = document.documentElement.scrollHeight - vh;

  L.zones = $$('[data-zone]').map((sec) => {
    const t = absTop(sec), h = sec.offsetHeight;
    return { k: sec.dataset.zone, a: t - vh * .15, b: t + h - vh * 1.25 };
  });
  L.compare = { t: absTop($('#compare')), h: $('#compare').offsetHeight };
  L.opaqueFrom = absTop($('#effects'));
  const dn = $('#stormNote');
  L.damage = { a: absTop(dn) - vh * .85, b: absTop(dn) + dn.offsetHeight - vh * .3 };
  L.scenes = sceneList.map((s) => ({ ...s, t: absTop(s.el), h: s.el.offsetHeight }));
  L.reveals = $$('.reveal').map((el) => ({ el, t: absTop(el), title: el.classList.contains('section-title') }));

  // camera keys
  const keys = [];
  Object.entries(POSES).forEach(([id, p]) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    const t = absTop(sec), h = sec.offsetHeight;
    const side = p[3];
    let sx = 0, sy = 0;
    if (L.mobile) { sy = side ? .17 : 0; } else { sx = side === 'R' ? .16 : side === 'L' ? -.16 : 0; }
    keys.push({ y: t + (id === 'hero' ? 0 : vh * .05), pos: p[0], look: p[2], sx, sy });
    if (p[4]) keys.push({ y: t + (h - vh) * SCENE_END, pos: p[0], look: p[2], sx, sy, move: true });
    keys.push({ y: Math.max(t + vh * .1, t + h - vh), pos: p[1], look: p[2], sx, sy, move: true });
  });
  // the river flight follows a path instead of a straight line
  {
    const sec = $('#flyover'), t = absTop(sec), h = sec.offsetHeight;
    const a = flyPose(0), b = flyPose(1);
    keys.push({ y: t + vh * .05, pos: a.p, look: a.l, sx: 0, sy: 0, path: true, y1: t + h - vh });
    keys.push({ y: t + h - vh, pos: b.p, look: b.l, sx: 0, sy: 0, move: true });
  }
  keys.sort((a, b) => a.y - b.y);
  L.keys = keys;

  L.notes = $$('.note').map((el) => ({ el, t: absTop(el), h: el.offsetHeight, scrub: $$('.w', el), counts: $$('.count', el) }));
  L.parts = $$('.part').map((el) => ({ el, t: absTop(el), h: el.offsetHeight, sticky: $('.part-sticky', el), title: $('.stretch', el) }));
  L.hero = { t: absTop($('#hero')), h: $('#hero').offsetHeight };
  L.earth = { h: L.hero.t };
  L.chapterTops = chapters.map((c) => absTop(c));

  // place rail dots along the river
  const railH = rail.offsetHeight;
  railDots.forEach((b, i) => {
    const p = L.chapterTops[i] / L.max;
    const pt = riverFill.getPointAtLength(p * riverLen);
    b.style.top = `${(pt.y / 640) * railH}px`;
    b.style.left = `${pt.x}px`;
    b.dataset.p = p;
  });

  const pc = $('#posters');
  if (pc) L.posters = { t: absTop(pc), h: pc.offsetHeight, track: $('#posterTrack'), items: $$('#posterTrack canvas') };
  if (valley && (vw !== L.rw || vh !== L.rh)) { L.rw = vw; L.rh = vh; valley.resize(vw, vh); earth?.resize(vw, vh); }
  dirtyAll();
  buildStops();
}

/* ---------- slide stops: where Next and Back land ---------- */
function buildStops() {
  // a hidden or minimised window can report no height at all
  if (L.vh < 100 || L.max < 1) return;
  const vh = L.vh, out = [];
  const add = (y, title, hold = 5, pause = false) => out.push({ y: Math.max(0, y), title, hold, pause });
  const words = (el) => el.textContent.trim().split(/\s+/).length;
  const readTime = (el, min = 4.5) => clamp(words(el) / 2.6 + 1.5, min, 24);
  const titleOf = (el) => el.closest('section[data-title]')?.dataset.title ?? '';
  add(0, 'Earth', 7);
  add(L.earth.h * .3, 'Earth', 5);
  add(L.earth.h * .365, 'Earth', 4);
  add(L.hero.t, 'Start', 6);
  add(L.hero.t + (L.hero.h - vh) * .62, 'Start', 3.5);
  L.notes.forEach((n) => {
    const c = n.h > vh - 170 ? n.t - 76 : n.t + n.h / 2 - (vh - 60) / 2;
    add(c, titleOf(n.el), n.el.querySelector('.predict') ? 11 : readTime(n.el));
  });
  L.parts.forEach((p) => add(p.t + (p.h - vh) * .56, titleOf(p.el), 5.5));
  L.scenes.forEach((sc) => {
    const items = $$('.scene-steps li', sc.el);
    sc.stops.forEach((st, i) => {
      const pEnd = i === sc.stops.length - 1 ? .985 : sc.stops[i + 1] - .012;
      add(sc.t + (sc.h - vh) * SCENE_END * pEnd, sc.el.dataset.title, readTime(items[i], 5));
    });
  });
  $$('.fly-line').forEach((el) => { const t = absTop(el); add(t + el.offsetHeight / 2 - vh / 2, 'Fly the river', 4); });
  const c = L.compare;
  [.04, .42, .84].forEach((u) => add(c.t + (c.h - vh) * u, 'Year 0 and year 30', 4));
  const pauseAt = new Set(['simulator', 'lab', 'quiz', 'plan']);
  $$('.opaque').forEach((sec) => {
    const t = absTop(sec), h = sec.offsetHeight, title = sec.dataset.title;
    add(t, title, clamp(words(sec) / 6, 8, 22), pauseAt.has(sec.id));
    for (let q = t + vh * .8; q < t + h - vh * .85; q += vh * .8) add(q, title, 10, pauseAt.has(sec.id));
    if (h > vh * 1.05) add(t + h - vh, title, 10, pauseAt.has(sec.id));
  });
  const P = L.posters;
  if (P) P.items.forEach((_, i) => add(P.t + (P.h - vh) * (P.items.length > 1 ? i / (P.items.length - 1) : 0), 'Posters', 5));
  out.sort((a, b) => a.y - b.y);
  scroller.setStops(out.filter((s, i) => i === 0 || s.y - out[i - 1].y > 14));
}

/* ---------- world pins and damage markers ---------- */
const pinLayer = $('#pins');
const pinEls = [];
Object.entries(PINS).forEach(([id, list]) => list.forEach(([x, y, z, text]) => {
  const d = document.createElement('div');
  d.className = 'pin';
  d.innerHTML = `<span class="pin-label">${text}</span>`;
  d.style.opacity = 0;
  pinLayer.appendChild(d);
  pinEls.push({ id, x, y, z, el: d, op: 0 });
}));
const found = new Set();
const spots = DAMAGE.map((m, i) => {
  const b = document.createElement('button');
  b.className = 'spot';
  b.type = 'button';
  b.setAttribute('aria-label', `Damage marker: ${m.t}`);
  pinLayer.appendChild(b);
  const card = document.createElement('div');
  card.className = 'spot-card';
  card.hidden = true;
  card.innerHTML = `<b>${m.t}</b>${m.d}`;
  pinLayer.appendChild(card);
  b.addEventListener('click', () => {
    const wasOpen = !card.hidden;
    spots.forEach((s) => { s.card.hidden = true; });
    card.hidden = wasOpen;
    found.add(i);
    b.classList.add('done');
    const n = found.size;
    $('#foundCount').textContent = n === 5 ? '5 of 5 found. Press Next to carry on.' : `${n} of 5 found`;
  });
  return { b, card, m };
});

/* ---------- frame loop ---------- */
let sy = scrollY;
let manualWipe = null;
let lastBars = '';

function stateAt(y) {
  const s = { ...ZERO };
  for (const z of L.zones) s[z.k] = clamp((y - z.a) / (z.b - z.a));
  const d = L.damage;
  if (d) s.storm = sstep(clamp((y - d.a) / (L.vh * .35))) * (1 - sstep(clamp((y - d.b) / (L.vh * .55))));
  return s;
}

/* Low flight down the river, then up and over the waterfall. */
function flyPose(u) {
  const rise = sstep(clamp((u - .78) / .22));
  const z = u < .78 ? lerp(-52, 50, u / .78) : lerp(50, 100, (u - .78) / .22);
  const zz = Math.min(z, 59);
  const x = riverX(zz) + Math.sin(u * 14) * 1.2 * (1 - rise);
  const y = Math.max(5.5 + Math.sin(u * 9.4) * 1.3, terrainH(x, zz) + 3.2) + rise * 34;
  // past the waterfall the camera climbs and swings round to face the whole valley
  const th = rise * Math.PI, ahead = riverX(Math.min(z + 15, 59)) - x;
  return { p: [x, y, z], l: [x + ahead * (1 - rise) + Math.sin(th) * 22, y - lerp(3.6, 20, rise), z + Math.cos(th) * 15 * (1 + rise)] };
}

function poseAt(y) {
  const k = L.keys;
  if (y <= k[0].y) return { ...k[0], p: k[0].pos, l: k[0].look };
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (y <= b.y) {
      const raw = (y - a.y) / Math.max(1, b.y - a.y);
      if (a.path) { const f = flyPose(raw); return { p: f.p, l: f.l, sx: 0, sy: 0 }; }
      const t = a.move ? sstep(raw) : raw; // holds are linear, moves are eased
      return {
        p: [lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t)],
        l: [lerp(a.look[0], b.look[0], t), lerp(a.look[1], b.look[1], t), lerp(a.look[2], b.look[2], t)],
        sx: lerp(a.sx, b.sx, t), sy: lerp(a.sy, b.sy, t),
      };
    }
  }
  const e = k[k.length - 1];
  return { p: e.pos, l: e.look, sx: e.sx, sy: e.sy };
}

/* DOM animation, only touching what is near the viewport */
function dirtyAll() { lastScrubY = -1; }
let lastScrubY = -1;

function animateDom(y) {
  const vh = L.vh;
  // Hero letters: thin and pinched at first, swelling to full weight as you scroll.
  const hy = y - L.hero.t, hp = clamp(hy / (L.hero.h - vh));
  introT = clamp((hy + vh * .24) / (vh * .24));
  if (hy > -vh * 1.1 && hp < 1.02) {
    heroLetters.forEach((s) => {
      const i = +s.dataset.i;
      const t = clamp((hp * 1.5 - i * .5));
      const e = t * t * (3 - 2 * t);
      s.style.setProperty('--w', Math.round(lerp(reduced ? 800 : 420, 900, e)));
      s.style.setProperty('--wd', Math.round(lerp(reduced ? 100 : 66, 150, e)));
      if (!reduced && introT < 1) {
        const q = clamp((introT * 1.7 - i * .7));
        const qe = 1 - Math.pow(1 - q, 3);
        s.style.transform = `translateY(${(1 - qe) * 46}px)`;
        s.style.opacity = qe;
      } else if (s.style.opacity !== '') { s.style.transform = ''; s.style.opacity = ''; }
    });
    const hero = $('#heroTitle');
    hero.style.transform = `translateY(${-Math.max(0, hp - .7) * vh * .55}px)`;
    hero.style.opacity = (1 - clamp((hp - .84) / .16)) * (reduced ? 1 : Math.min(1, introT * 2.5));
    $('.hero-foot').style.opacity = (1 - clamp(hp / .3)) * introT;
  }
  // The topic title: letters rise at load, then stretch out and lift away as the dive begins.
  const eh = L.earth.h, ep = clamp(y / (eh * .2));
  if (y < eh * 1.02 || earthIntro < 1) {
    earthLetters.forEach((s) => {
      const i = +s.dataset.i, t = clamp(ep * 1.5 - i * .5), e = t * t * (3 - 2 * t);
      s.style.setProperty('--w', Math.round(lerp(reduced ? 800 : 760, 900, e)));
      s.style.setProperty('--wd', Math.round(lerp(reduced ? 100 : 88, 150, e)));
      if (earthIntro < 1) {
        const q = clamp(earthIntro * 1.7 - i * .7), qe = 1 - Math.pow(1 - q, 3);
        s.style.transform = `translateY(${(1 - qe) * 46}px)`;
        s.style.opacity = qe;
      } else if (s.style.opacity !== '') { s.style.transform = ''; s.style.opacity = ''; }
    });
    const head = $('.earth-head');
    head.style.opacity = 1 - clamp((ep - .3) / .5);
    head.style.transform = `translateY(${-ep * vh * .22}px)`;
    $('.earth-cue').style.opacity = (1 - clamp(ep / .25)) * clamp((earthIntro - .6) / .4);
    $('.earth-sub').style.opacity = clamp((earthIntro - .45) / .4);
  }
  earthLines.forEach((el) => {
    const a = +el.dataset.a, b = +el.dataset.b, u = y / eh;
    const o = clamp((u - a) / .05) * (1 - clamp((u - b) / .05));
    el.style.opacity = o;
    el.style.transform = `translateY(${(1 - o) * 26}px)`;
  });
  // Part dividers: wipe open, stretch the title, wipe shut.
  for (const p of L.parts) {
    const a = (y - (p.t - vh)) / vh, u = (y - p.t) / (p.h - vh);
    if (a < -.1 || u > 1.1) continue;
    const open = sstep(clamp(a * 1.1));
    const close = sstep(clamp((u - .68) / .32));
    const clip = (1 - open) * 50 + close * 50;
    p.sticky.style.setProperty('--clip', `${clip.toFixed(2)}%`);
    const g = clamp(u / .7);
    p.title.style.setProperty('--w', Math.round(lerp(200, 880, g)));
    p.title.style.setProperty('--wd', Math.round(lerp(50, L.mobile ? 96 : 124, g)));
  }
  // Pinned biology scenes wipe open and play as you scroll.
  for (const sc of L.scenes) {
    const a = (y - (sc.t - vh)) / vh, u = (y - sc.t) / (sc.h - vh);
    if (a < -.05 || u > 1.05) { if (sc.ringOn) { sc.ringOn = false; ring.style.display = 'none'; } continue; }
    // The diagram opens out of the exact spot in the valley it explains, then shrinks back into it.
    const k = sstep(clamp(a * 1.04)) * (1 - sstep(clamp((u - SCENE_END) / (.992 - SCENE_END))));
    const q = valley ? valley.project(...sc.site) : { x: L.vw / 2, y: vh / 2 };
    const X = clamp(q.x, 0, L.vw), Y = clamp(q.y, 0, vh);
    const R = Math.hypot(Math.max(X, L.vw - X), Math.max(Y, vh - Y)) + 4;
    const r = R * k;
    if (k > .998) sc.sticky.style.clipPath = 'none';
    else sc.sticky.style.clipPath = `circle(${r.toFixed(1)}px at ${X.toFixed(1)}px ${Y.toFixed(1)}px)`;
    sc.sticky.style.visibility = k < .002 ? 'hidden' : 'visible';
    sc.ui.forEach((e) => { e.style.opacity = clamp((k - .72) / .24).toFixed(3); });
    sc.canvas.style.transformOrigin = `${X}px ${Y}px`;
    sc.canvas.style.transform = reduced ? '' : `scale(${(1 + (1 - k) * .6).toFixed(3)})`;
    const showRing = k > .002 && k < .998 && !reduced;
    sc.ringOn = showRing;
    if (showRing) {
      ring.style.display = 'block';
      ring.style.width = ring.style.height = `${(r * 2).toFixed(1)}px`;
      ring.style.transform = `translate3d(${(X - r).toFixed(1)}px,${(Y - r).toFixed(1)}px,0)`;
    } else if (L.scenes.every((o) => !o.ringOn)) ring.style.display = 'none';
    if (k > .002) sc.draw(clamp(u / SCENE_END), performance.now() / 1000);
  }
  // Section titles stretch out and table rows rise into place.
  for (const r of L.reveals) {
    const top = r.t - y;
    if (top > vh * 1.1 || top < -vh * .6) continue;
    const e = clamp((vh * 1.02 - top) / (vh * .3));
    if (reduced) continue;
    if (r.title) r.el.style.setProperty('--wd', Math.round(lerp(60, 118, 1 - (1 - e) * (1 - e))));
    else { r.el.style.opacity = e; r.el.style.transform = `translateY(${(1 - e) * 26}px)`; }
  }
  // Notes rise in, then drift off with a slight tilt.
  for (const n of L.notes) {
    const top = n.t - y;
    if (top > vh * 1.15 || top + n.h < -vh * .2) continue;
    const enter = clamp((vh * 1.02 - top) / (vh * .4));
    const e = 1 - (1 - enter) * (1 - enter);
    if (!reduced) {
      const side = n.el.classList.contains('left') ? -1 : 1;
      const sway = L.mobile ? 0 : side; // sideways entrances would widen the page on a phone
      n.el.style.transform = `translate3d(${(1 - e) * sway * 90}px, ${(1 - e) * 60}px, 0) rotate(${(1 - e) * sway * 2.2}deg)`;
      n.el.style.opacity = e;
    }
    if (n.scrub.length) {
      const prog = clamp((vh * .9 - top) / (vh * .55));
      const lit = Math.round(prog * n.scrub.length);
      n.scrub.forEach((w, i) => w.classList.toggle('lit', reduced || i < lit));
    }
    for (const c of n.counts) {
      const prog = clamp((vh * .85 - top) / (vh * .42));
      const e2 = 1 - Math.pow(1 - prog, 3);
      const from = +(c.dataset.from || 0), to = +c.dataset.to;
      c.textContent = Math.round(lerp(from, to, e2));
    }
  }
  // Posters move sideways as you scroll down.
  const P = L.posters;
  if (P && y > P.t - vh && y < P.t + P.h) {
    const u = clamp((y - P.t) / (P.h - vh));
    const dist = Math.max(0, P.track.scrollWidth - L.vw);
    P.track.style.transform = `translate3d(${-u * dist}px,0,0)`;
    P.items.forEach((c) => {
      const r = c.getBoundingClientRect();
      const off = (r.left + r.width / 2 - L.vw / 2) / L.vw;
      if (!reduced) c.style.transform = `rotateY(${clamp(off * -26, -26, 26)}deg) scale(${1 - Math.min(Math.abs(off) * .14, .14)})`;
    });
  }
  // River rail and chapter markers
  const p = clamp(y / L.max);
  riverFill.style.strokeDashoffset = riverLen * (1 - p);
  railDots.forEach((b) => b.classList.toggle('on', +b.dataset.p <= p + .002));
  const hideRail = (P && y > P.t - vh * .6 && y < P.t + P.h - vh * .4) || y < L.hero.t - vh * .3;
  rail.style.opacity = hideRail ? 0 : 1;
  rail.style.pointerEvents = hideRail ? 'none' : '';
}

const colA = [[0x8c, 0x8a, 0x70], [0xc9, 0xb7, 0x7f]], colB = [[0x4f, 0xa8, 0xd8], [0xd9, 0xf1, 0xee]];
const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join()})`;
const skyAmount = (s) => clamp(s.air * .72 + s.forest * .08 + s.wetland * .04 + s.final * .16);
const barCol = (v) => (v < 35 ? '#b23a22' : v < 65 ? '#c98a00' : '#1f7a45');

function updateHud(s, y) {
  const sc = scores(s);
  const key = Object.values(sc).map((v) => v.toFixed(0)).join();
  if (key !== lastBars) {
    lastBars = key;
    Object.entries(sc).forEach(([k, v]) => {
      const u = document.querySelector(`[data-bar="${k}"]`);
      u.style.transform = `scaleX(${clamp(v / 100).toFixed(3)})`;
      u.style.background = barCol(v);
    });
  }
  const c = L.zones;
  const yearProg = c.length ? clamp((y - c[0].a) / (c[c.length - 1].b - c[0].a)) : 0;
  $('#year').textContent = Math.round(yearProg * 30);
  $('#hud').classList.toggle('gone', y > L.opaqueFrom - L.vh * .35 || y < L.hero.t - L.vh * .2);
}

function updatePins(y, active) {
  const inDamage = active === 'damage';
  pinEls.forEach((p) => {
    const want = p.id === active ? 1 : 0;
    p.op += (want - p.op) * .12;
    if (p.op < .01) { if (p.el.style.display !== 'none') p.el.style.display = 'none'; return; }
    p.el.style.display = '';
    const q = valley.project(p.x, p.y, p.z);
    p.el.style.opacity = q.on ? p.op : 0;
    p.el.style.transform = `translate3d(${q.x}px,${q.y}px,0)`;
  });
  spots.forEach((s) => {
    s.b.style.display = inDamage ? '' : 'none';
    if (!inDamage) { s.card.hidden = true; return; }
    const q = valley.project(...s.m.p);
    s.b.style.transform = `translate3d(${q.x}px,${q.y}px,0)`;
    if (!s.card.hidden) {
      const w = s.card.offsetWidth;
      const x = clamp(s.m.side > 0 ? q.x + 26 : q.x - w - 26, 8, L.vw - w - 8);
      s.card.style.transform = `translate3d(${x}px,${clamp(q.y - 40, 70, L.vh - 150)}px,0)`;
    }
  });
}

function activeChapter(y) {
  const mid = y + L.vh * .5;
  let id = 'earth';
  for (let i = 0; i < chapters.length; i++) if (L.chapterTops[i] <= mid) id = chapters[i].id;
  return id;
}

/* wipe handle */
const handle = $('#wipeHandle');
const skyBefore = $('.sky-before');
const skyEl = $('.sky');
let dragging = false;
const setManual = (cx) => { manualWipe = clamp(cx / L.vw, .02, .98); };
handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); setManual(e.clientX); });
handle.addEventListener('pointermove', (e) => { if (dragging) setManual(e.clientX); });
handle.addEventListener('pointerup', () => { dragging = false; });
handle.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation();
    manualWipe = clamp((manualWipe ?? handleX) + (e.key === 'ArrowLeft' ? -.05 : .05), .02, .98);
  }
});
let handleX = 1;

let firstValleyDrawn = false, pinsOn = true;
let last = performance.now(), slow = 0, fast = 0, stageVisible = true;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(.1, rawDt);
  last = now;
  scroller.tick(rawDt);
  const target = scrollY;
  // A long gap means the tab was hidden or throttled: jump straight to the scroll position.
  const throttled = rawDt > .25;
  sy = reduced || throttled ? target : lerp(sy, target, 1 - Math.exp(-dt * 7));
  if (Math.abs(target - sy) < .2) sy = target;

  animateDom(target);

  const s = stateAt(sy);
  const amt = skyAmount(s);
  const c = L.compare;
  const inCompare = c && sy > c.t - L.vh * .1 && sy < L.opaqueFrom + L.vh * .1;
  const pastStage = target > L.opaqueFrom + L.vh * .2;

  updateHud(s, sy);

  const dark = s.storm * .72;
  const mixDark = (c) => c.map((v, i) => lerp(v, [70, 72, 70][i], dark));
  const top0 = colA[0].map((v, i) => lerp(v, colB[0][i], amt)), bot0 = colA[1].map((v, i) => lerp(v, colB[1][i], amt));
  skyEl.style.setProperty('--sky-t', `rgb(${mixDark(top0).map(Math.round).join()})`);
  skyEl.style.setProperty('--sky-b', `rgb(${mixDark(bot0).map(Math.round).join()})`);
  const active = activeChapter(sy);
  presenter.update(active);
  updateSound(scores(target > L.opaqueFrom ? FULL : s), s.storm, target > L.opaqueFrom + L.vh || target < L.hero.t - L.vh);
  // once the stage is hidden behind opaque sections, stop drawing it
  const vis = !pastStage;
  if (vis !== stageVisible) {
    stageVisible = vis;
    canvas.style.visibility = vis ? 'visible' : 'hidden';
    pinLayer.style.visibility = vis ? 'visible' : 'hidden';
  }
  // the opening: space, then down through the cloud
  const E = L.earth ? clamp(sy / L.earth.h) : 1;
  earthIntro = Math.min(1, earthIntro + dt / 2.4);
  if (E < .999) spaceEl.style.opacity = E < SWAP ? 1 : 0;
  else if (spaceEl.style.opacity !== '0') spaceEl.style.opacity = 0;
  const cloudAmt = reduced ? 0 : sstep(clamp((E - .52) / .2)) * (1 - sstep(clamp((E - .77) / .13)));
  const cloudZ = E * 5.5 + now * .00006;
  const cloudDirty = sstep(clamp((E - .72) / .09));
  if (!valley || !vis) return;
  if (!firstValleyDrawn) {
    // prepare the valley now, so nothing stutters when it first appears
    firstValleyDrawn = true;
    valley.apply({ ...ZERO });
    valley.setPose(44, 64, 128, 2, 0, 6);
    valley.render();
  }
  // labels and markers belong to the valley, so keep them out of the Earth shots
  const showPins = !earth || E >= SWAP;
  if (showPins !== pinsOn) { pinsOn = showPins; pinLayer.style.display = showPins ? '' : 'none'; }
  if (earth && E < SWAP) {
    earth.render(E, now / 1000, reduced ? 1 : sstep(Math.min(1, earthIntro * 1.6)));
    earth.overlay(cloudAmt, cloudZ, cloudDirty);
    return;
  }

  const pose = poseAt(sy);
  // coming out of the cloud, the camera sweeps down from high above the valley
  const land = clamp((E - SWAP) / (1 - SWAP));
  const far = reduced ? 0 : 1 - (1 - Math.pow(1 - land, 2.2));
  // the view leans gently toward the pointer
  ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 3);
  ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 3);
  const px = pose.p[0] + ptr.x * 3.2 + far * -46, py = pose.p[1] - ptr.y * 1.8 + far * 150, pz = pose.p[2] + far * 190;
  valley.setPose(px, py, pz, pose.l[0], pose.l[1], pose.l[2], pose.sx, pose.sy);
  valley.animate(now / 1000);

  if (inCompare) {
    // the wipe follows scroll until someone drags it
    const u = clamp((sy - c.t) / (c.h - L.vh));
    handleX = manualWipe ?? lerp(.97, .03, sstep(clamp(u / .85)));
    handle.style.left = `${handleX * 100}%`;
    skyBefore.style.clipPath = `inset(0 ${(1 - handleX) * 100}% 0 0)`;
    valley.renderWipe({ ...ZERO }, { ...FULL }, handleX);
  } else {
    skyBefore.style.clipPath = 'inset(0 100% 0 0)';
    if (target < (c?.t ?? 0)) manualWipe = null;
    valley.apply(target > L.opaqueFrom ? { ...FULL } : s);
    valley.render();
  }
  earth?.overlay(cloudAmt, cloudZ, cloudDirty);
  updatePins(sy, active);

  // drop resolution on slow laptops so scrolling stays smooth
  if (rawDt > .034 && !throttled) slow++; else if (rawDt < .02) fast++;
  if (slow > 40) { slow = fast = 0; if (valley.dpr > .8) valley.setDPR(Math.max(.8, valley.dpr * .8)); }
  if (fast > 600) { slow = fast = 0; }
}

/* ---------- keyboard ---------- */
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,[contenteditable],textarea,select')) return;
  if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.()?.catch(() => {});
  }
  if (e.key === 'n' || e.key === 'N') presenter.toggle();
  if (e.key === 'm' || e.key === 'M') flipSound();
  if (e.key === 'p' || e.key === 'P') scroller.toggleAuto();
  if (e.key === 's' || e.key === 'S') scroller.cycleSpeed();
  if (e.key === '?' || e.key === 'h' || e.key === 'H') presenter.toggleHelp();
  if (e.key === '+' || e.key === '=') scroller.faster();
  if (e.key === '-') scroller.slower();
  const onButton = e.target.closest && e.target.closest('button,a');
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !onButton && !e.shiftKey)) { e.preventDefault(); scroller.setAuto(false); scroller.next(); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && !onButton && e.shiftKey)) { e.preventDefault(); scroller.setAuto(false); scroller.prev(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); scroller.nudge(1); }
  if (e.key === 'ArrowUp') { e.preventDefault(); scroller.nudge(-1); }
  if (e.key === 'Home') { e.preventDefault(); scroller.setAuto(false); scroller.glideTo(0, 3.5); }
  if (e.key === 'End') { e.preventDefault(); scroller.setAuto(false); scroller.glideTo(1e9, 3.5); }
});

/* ---------- start ---------- */
initPredict();
initSim();
initQuiz();
initPlan();
initLab();
initPosters().then(measure);

const names = $('#groupNames');
const showNames = () => { const t = names.textContent.trim(); $('#earthNames').textContent = t ? `Presented by ${t}` : ''; };
try { names.textContent = localStorage.getItem('valley-names') || ''; } catch {}
showNames();
names.addEventListener('input', () => { showNames(); try { localStorage.setItem('valley-names', names.textContent); } catch {} });
$('#backTop').addEventListener('click', () => { scroller.setAuto(false); scroller.glideTo(0, 3.5); });

measure();
addEventListener('resize', measure);
addEventListener('load', measure);
document.fonts?.ready.then(measure);
new ResizeObserver(() => { if (document.documentElement.scrollHeight - innerHeight !== L.max) measure(); }).observe(document.body);
requestAnimationFrame(frame);
