// Predict questions, class quiz, farm simulator and action plan.
import { blip } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- predict-then-see questions ---------- */
export function initPredict() {
  $$('.predict').forEach((box) => {
    const btns = $$('button', box), ans = +box.dataset.answer, why = $('.predict-why', box);
    btns.forEach((b, i) => {
      b.type = 'button';
      b.addEventListener('click', () => {
        btns.forEach((x, j) => { x.disabled = true; if (j === ans) x.classList.add('right'); });
        if (i !== ans) b.classList.add('wrong');
        blip(i === ans);
        why.textContent = (i === ans ? 'Correct. ' : 'Not quite. ') + box.dataset.why;
      });
    });
  });
}

/* ---------- class quiz ---------- */
const QUESTIONS = [
  { s: 'Natural resources', q: 'Why plant a mix of native trees instead of one fast-growing species?', o: ['Native trees always grow fastest', 'Local wildlife depends on them, and a mix resists disease better', 'Mixed forests need no water', 'Single species are illegal to plant'], a: 1, w: 'Native species already fit local food webs. Variety also means one disease is less likely to kill the whole forest.' },
  { s: 'Natural resources', q: 'Why plough along the contour of a slope?', o: ['It makes the field look tidy', 'The furrows slow runoff, so less soil is lost', 'It adds nitrogen to the soil', 'It keeps birds away'], a: 1, w: 'Furrows that follow the slope hold water back. On moderate slopes this can cut soil loss by up to 50%.' },
  { s: 'Natural resources', q: 'What does a buffer strip of plants along a river do?', o: ['Speeds up the water', 'Traps runoff and shades the water', 'Adds fertiliser to the river', 'Stops all floods'], a: 1, w: 'The plants filter mud and nutrients before they reach the water, and their shade keeps the river cool.' },
  { s: 'Reducing pollution', q: 'What happens inside a wet limestone scrubber?', o: ['Smoke is cooled and released unchanged', 'Limestone reacts with sulphur dioxide and traps it as gypsum', 'Coal turns into solar energy', 'Carbon dioxide is destroyed'], a: 1, w: 'The sulphur is captured before it leaves the stack. Scrubbers do not remove carbon dioxide.' },
  { s: 'Reducing pollution', q: 'Which order describes eutrophication?', o: ['Fish die, then algae grow, then nutrients arrive', 'Nutrients arrive, algae bloom, plants die, bacteria use up the oxygen, fish die', 'Oxygen rises, plants grow, fish multiply', 'Bacteria arrive, then nutrients, then the fish grow'], a: 1, w: 'Extra nutrients start the chain. Decomposers feeding on dead matter use up the oxygen, and that is what kills the fish.' },
  { s: 'Reducing pollution', q: 'Which step comes first in the waste hierarchy?', o: ['Recycle', 'Burn for energy', 'Reduce', 'Landfill'], a: 2, w: 'Waste that is never made needs no collecting, sorting or treating. Only about 9% of plastic waste gets recycled.' },
  { s: 'Natural materials in agriculture', q: 'What was the effect of replacing bare winter soil with a non-legume cover crop?', o: ['About 70% less nitrate leached', 'Yields fell by half', 'The soil lost all its nitrogen', 'Pests doubled'], a: 0, w: 'The crop holds on to nutrients over winter. The study found no significant change in yield.' },
  { s: 'Natural materials in agriculture', q: 'In push-pull farming, what does Desmodium do?', o: ['Lures moths away from the field', 'Repels stemborer moths from the maize', 'Kills every insect nearby', 'Replaces the maize crop'], a: 1, w: 'Desmodium pushes moths away from maize, while Napier grass around the edge pulls them in.' },
  { s: 'Organic agriculture', q: 'What is the main trade-off of organic farming?', o: ['More species, but yields about 19% lower', 'Fewer species, but yields 19% higher', 'No change in species or yields', 'More pesticide, but better soil'], a: 0, w: 'Organic farms supported about 30% more species. Rotation and multi-cropping cut the yield gap to 8–9%.' },
  { s: 'Conservation methods', q: 'A wildlife corridor mainly helps a species by:', o: ['Reconnecting populations so genes can flow', 'Removing all its predators', 'Giving it free food', 'Making animals grow larger'], a: 0, w: 'Isolated groups inbreed and lose diversity. Corridors let animals move between them and breed.' },
  { s: 'Education', q: 'Which approach is most likely to change what people actually do?', o: ['A single warning leaflet', 'Hands-on projects with visible local results', 'Telling people once at school', 'Publishing a long report'], a: 1, w: 'Knowing about a problem is not always enough. People act more when they can do something practical and see it work.' },
  { s: 'Monitoring strategies', q: 'You find plenty of mayfly larvae in a stream. What does that suggest?', o: ['The water is probably fairly clean', 'The water is badly polluted', 'The stream is about to dry up', 'Fish have all left'], a: 0, w: 'Mayflies are sensitive to pollution, so they are good bioindicators. Chemical tests should back up what you find.' },
];
const TEAM_NAMES = ['Team Otter', 'Team Heron', 'Team Beaver', 'Team Mayfly'];
const SECONDS = 25;

export function initQuiz() {
  const root = $('#quizRoot');
  let teams = 2, scores = [], turn = 0, idx = 0, order = [], timer = null, answered = false;

  function intro() {
    root.innerHTML = `
      <h2 class="section-title">Class quiz</h2>
      <p class="lede">${QUESTIONS.length} questions, ${SECONDS} seconds each. Split the room into teams and take turns. The team whose turn it is gets 100 points, plus up to 50 more for answering quickly.</p>
      <p><b id="teamLabel">How many teams?</b></p>
      <div class="team-count" role="group" aria-labelledby="teamLabel">
        ${[1, 2, 3, 4].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === teams}">${n === 1 ? 'Solo' : n}</button>`).join('')}
      </div>
      <button class="btn go" id="quizStart" type="button">Start the quiz</button>`;
    $$('.team-count button', root).forEach((b) => b.addEventListener('click', () => { teams = +b.dataset.n; intro(); }));
    $('#quizStart', root).addEventListener('click', start);
  }
  function start() {
    scores = Array(teams).fill(0); turn = 0; idx = 0;
    order = QUESTIONS.map((_, i) => i).sort(() => Math.random() - .5);
    ask();
    root.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }
  const board = () => (teams === 1 ? `<div class="scoreboard"><div class="score on"><span>Your score</span><b>${scores[0]}</b></div></div>` :
    `<div class="scoreboard">${scores.map((s, i) => `<div class="score ${i === turn ? 'on' : ''}"><span>${TEAM_NAMES[i]}</span><b>${s}</b></div>`).join('')}</div>`);

  function ask() {
    answered = false;
    const Q = QUESTIONS[order[idx]];
    root.innerHTML = `${board()}
      <p class="q-progress">Question ${idx + 1} of ${QUESTIONS.length}, on ${Q.s.toLowerCase()}${teams > 1 ? `. ${TEAM_NAMES[turn]} to answer` : ''}</p>
      <div class="q-timer"><u id="qBar"></u></div>
      <h3 class="q-text">${Q.q}</h3>
      <div class="q-opts">${Q.o.map((o, i) => `<button class="q-opt" type="button" data-i="${i}">${o}</button>`).join('')}</div>
      <div id="qAfter" role="status"></div>`;
    $$('.q-opt', root).forEach((b) => b.addEventListener('click', () => answer(+b.dataset.i)));
    const t0 = performance.now(), bar = $('#qBar', root);
    cancelAnimationFrame(timer);
    const tick = (now) => {
      if (answered) return;
      const left = 1 - (now - t0) / (SECONDS * 1000);
      if (bar) bar.style.transform = `scaleX(${clamp(left)})`;
      bar.dataset.left = clamp(left);
      if (left <= 0) { answer(-1); return; }
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  }
  function answer(i) {
    if (answered) return;
    answered = true;
    const Q = QUESTIONS[order[idx]];
    const left = +($('#qBar', root)?.dataset.left || 0);
    const correct = i === Q.a;
    if (correct) { scores[turn] += 100 + Math.round(50 * left); burst(14); }
    blip(correct);
    $$('.q-opt', root).forEach((b, j) => { b.disabled = true; if (j === Q.a) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
    const board2 = $('.scoreboard', root);
    if (board2) board2.outerHTML = board();
    const lead = i === -1 ? 'Time is up. ' : correct ? 'Correct. ' : 'Not quite. ';
    $('#qAfter', root).innerHTML = `<p class="q-why">${lead}${Q.w}</p><button class="btn go" id="qNext" type="button">${idx === QUESTIONS.length - 1 ? 'See the results' : 'Next question'}</button>`;
    $('#qNext', root).addEventListener('click', () => {
      idx++; turn = (turn + 1) % teams;
      if (idx >= QUESTIONS.length) end(); else ask();
    });
    $('#qNext', root).focus({ preventScroll: true });
    $('#qNext', root).scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  function end() {
    const top = Math.max(...scores);
    const winners = scores.map((s, i) => (s === top ? TEAM_NAMES[i] : null)).filter(Boolean);
    const head = teams === 1 ? `${top} points` : winners.length > 1 ? `${winners.join(' and ')} tie` : `${winners[0]} wins`;
    root.innerHTML = `<p class="winner">${head}</p>${teams > 1 ? board() : ''}
      <p class="lede">${teams === 1 ? `The top possible score is ${QUESTIONS.length * 150}.` : 'Each answer also adds to what the class knows about restoring a real valley.'}</p>
      <button class="btn go" id="qAgain" type="button">Play again</button>`;
    $('#qAgain', root).addEventListener('click', intro);
    burst(70);
  }
  intro();
}

/* falling leaf burst for correct answers */
function burst(n) {
  if (reduced) return;
  let c = $('#leafBurst');
  if (!c) { c = document.createElement('canvas'); c.id = 'leafBurst'; document.body.appendChild(c); }
  c.width = innerWidth; c.height = innerHeight;
  const x = c.getContext('2d');
  const cols = ['#3c8a3f', '#6db33f', '#f2b705', '#2a9d8f', '#8aba45'];
  const p = Array.from({ length: n }, () => ({ x: innerWidth * (.15 + Math.random() * .7), y: innerHeight * (.25 + Math.random() * .3), vx: (Math.random() - .5) * 7, vy: -4 - Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .25, s: 6 + Math.random() * 9, c: cols[Math.floor(Math.random() * 5)] }));
  const t0 = performance.now();
  (function loop(now) {
    const age = now - t0;
    x.clearRect(0, 0, c.width, c.height);
    if (age > 1800) return;
    x.globalAlpha = 1 - Math.max(0, age - 1200) / 600;
    p.forEach((l) => {
      l.vy += .17; l.vx *= .99; l.x += l.vx + Math.sin(l.r) * 1.2; l.y += l.vy * .75; l.r += l.vr;
      x.save(); x.translate(l.x, l.y); x.rotate(l.r); x.fillStyle = l.c;
      x.beginPath(); x.moveTo(0, -l.s); x.quadraticCurveTo(l.s * .8, 0, 0, l.s); x.quadraticCurveTo(-l.s * .8, 0, 0, -l.s); x.fill(); x.restore();
    });
    requestAnimationFrame(loop);
  })(t0);
}

/* ---------- farm simulator ---------- */
export function initSim() {
  const svg = $('#simSvg');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a, parent = svg) => { const e = document.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); parent.appendChild(e); return e; };
  const GROUND = 150;
  el('circle', { cx: 575, cy: 42, r: 24, fill: '#f2b705' });
  const soil = el('rect', { x: 0, y: GROUND, width: 640, height: 150, fill: '#8a6f4a' });
  const humus = el('rect', { x: 0, y: GROUND, width: 640, height: 10, fill: '#3b2a1a' });
  const rootsG = el('g', { stroke: '#e7dcc0', fill: 'none', 'stroke-linecap': 'round' });
  const plantsG = el('g', {});
  const hedgeG = el('g', {});
  const coverG = el('g', {});
  const lifeG = el('g', {});
  const wormG = el('g', {});
  const runoff = el('path', { d: `M 0 ${GROUND + 4} L 640 ${GROUND + 4}`, stroke: '#c9472f', fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': '14 18', 'stroke-width': 8 });
  const label = el('text', { x: 14, y: GROUND - 8, 'font-size': 13, fill: '#7a2413', 'font-weight': 700 });
  label.textContent = 'Nitrate running off';

  const COUNT = 14;
  const plants = Array.from({ length: COUNT }, (_, i) => {
    const x = 34 + i * 44;
    const g = el('g', { transform: `translate(${x} ${GROUND})` }, plantsG);
    const stem = el('path', { d: '', stroke: '#4d8a32', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, g);
    const head = el('ellipse', { cx: 0, cy: 0, rx: 5, ry: 11, fill: '#d9b23c' }, g);
    const r = el('g', {}, rootsG);
    return { x, stem, head, r };
  });
  // hedge
  [300, 322].forEach((x) => el('circle', { cx: x, cy: GROUND - 46, r: 27, fill: '#3c8a3f' }, hedgeG));
  el('rect', { x: 306, y: GROUND - 34, width: 9, height: 34, fill: '#5d452f' }, hedgeG);
  // cover crop
  for (let x = 10; x < 640; x += 15) el('path', { d: `M ${x} ${GROUND} q 4 -13 8 0`, fill: '#5da63b' }, coverG);
  // insects: small dots that appear with biodiversity
  const insects = Array.from({ length: 22 }, (_, i) => el('circle', { cx: 25 + (i * 139) % 590, cy: 30 + (i * 47) % 75, r: i % 3 === 0 ? 3.5 : 2.6, fill: ['#e8604c', '#222', '#f5a623'][i % 3] }, lifeG));
  const worms = Array.from({ length: 8 }, (_, i) => el('path', { d: `M ${40 + i * 78} ${GROUND + 34 + (i % 3) * 22} q 10 -9 20 0 t 20 0`, stroke: '#d07c84', 'stroke-width': 4.5, fill: 'none', 'stroke-linecap': 'round' }, wormG));

  const inputs = $$('input[data-p]');
  const year = $('#simYear');
  const P = () => Object.fromEntries(inputs.map((i) => [i.dataset.p, i.checked ? 1 : 0]));

  function model(p, y) {
    const m = 1 - Math.exp(-y / 3.4); // slow biological build-up
    const soilV = 40 + m * (p.cover * 14 + p.compost * 20 + p.rotate * 9 + p.hedge * 3);
    const leach = (1 - .6 * p.cover) * (1 - .18 * p.compost) * (1 - .1 * p.hedge) * (1 - .1 * p.rotate);
    const nitrate = 100 * (1 - (1 - leach) * (1 - Math.exp(-y / .9)));
    const species = 30 + m * (p.natural * 22 + p.hedge * 22 + p.cover * 7 + p.compost * 6 + p.rotate * 6);
    const organic = (p.compost + p.natural) / 2;
    const gap = organic * 19 * (1 - .55 * (p.rotate * .7 + p.cover * .3));
    const dip = organic * 13 * Math.exp(-y / 2.4) * (y > 0 ? 1 : 0);
    const gain = m * (p.rotate * 2 + p.cover * 1 + p.hedge * 1.5);
    const yieldV = y === 0 ? 100 : 100 - gap * (1 - Math.exp(-y * 3)) - dip + gain;
    return { soil: soilV, nitrate, species, yield: yieldV };
  }
  function note(p, y, v) {
    const on = Object.values(p).reduce((a, b) => a + b, 0);
    if (!on) return 'Choose a practice, then drag through the years.';
    if (y === 0) return 'Nothing has changed yet. Drag the year slider to see what happens.';
    if (y <= 2 && (p.compost || p.natural)) return 'Yield falls first while the soil and its food web adjust. Many farmers need support during these years.';
    if (y <= 2 && p.cover) return 'Nitrate losses fall almost at once, but soil organic matter builds slowly.';
    if (v.yield < 90) return 'Soil and species are recovering, but yield stays lower. Rotation or cover crops would narrow the gap.';
    if (on >= 4) return 'Soil and wildlife are far better, and the yield gap is small. This is what we recommend for the valley.';
    return 'The benefits are building. Try adding another practice to see how the effects combine.';
  }
  const pen = (d, w) => { d.setAttribute('stroke-width', w); };
  function update() {
    const p = P(), y = +year.value, v = model(p, y);
    $('#simYearOut').textContent = y;
    Object.entries(v).forEach(([k, val]) => {
      const max = k === 'yield' ? 110 : 100;
      $(`[data-m="${k}"]`).style.transform = `scaleX(${clamp(val / max)})`;
      $(`[data-v="${k}"]`).textContent = Math.round(val);
    });
    $('#simNote').textContent = note(p, y, v);
    // picture
    const om = clamp((v.soil - 40) / 45);
    soil.setAttribute('fill', `rgb(${Math.round(138 - om * 58)},${Math.round(111 - om * 50)},${Math.round(74 - om * 34)})`);
    humus.setAttribute('height', 6 + om * 34);
    const h = 44 + (v.yield - 80) * 1.45;
    const rootDepth = 26 + om * 92;
    plants.forEach((pl, i) => {
      const hide = p.hedge && pl.x > 280 && pl.x < 340;
      const col = (p.rotate && i % 4 === 1) ? '#8f6ec0' : (p.rotate && i % 4 === 3) ? '#3f8e3a' : '#d9b23c';
      pl.stem.setAttribute('d', `M0 0 Q ${(i % 2) * 3 - 1.5} ${-h * .5} 0 ${-h}`);
      pl.head.setAttribute('cy', -h - 7);
      pl.head.setAttribute('fill', col);
      pl.stem.style.display = pl.head.style.display = hide ? 'none' : '';
      pl.r.style.display = hide ? 'none' : '';
      pl.r.innerHTML = '';
      [-1, 0, 1].forEach((d) => {
        const r = document.createElementNS(NS, 'path');
        r.setAttribute('d', `M ${pl.x} ${GROUND} q ${d * 10} ${rootDepth * .5} ${d * 15} ${rootDepth * (d === 0 ? 1 : .8)}`);
        r.setAttribute('stroke-width', d === 0 ? 2.4 : 1.6);
        pl.r.appendChild(r);
      });
    });
    hedgeG.style.display = p.hedge ? '' : 'none';
    hedgeG.style.transform = `scale(${.4 + .6 * clamp(y / 5)})`;
    hedgeG.style.transformOrigin = `310px ${GROUND}px`;
    coverG.style.display = p.cover ? '' : 'none';
    const nIns = Math.round((v.species - 30) / 58 * insects.length) + 1;
    insects.forEach((c, i) => { c.style.display = i < nIns ? '' : 'none'; });
    const nW = Math.round(om * worms.length);
    worms.forEach((c, i) => { c.style.display = i < nW ? '' : 'none'; });
    pen(runoff, Math.max(1, v.nitrate * .11));
    runoff.style.opacity = clamp(v.nitrate / 60, .3, 1);
  }
  inputs.forEach((i) => i.addEventListener('change', update));
  year.addEventListener('input', update);
  $('#simAll').addEventListener('click', () => {
    inputs.forEach((i) => { i.checked = true; });
    if (reduced) { year.value = 10; update(); return; }
    let y = 0; year.value = 0; update();
    const iv = setInterval(() => { y++; year.value = y; update(); if (y >= 10) clearInterval(iv); }, 380);
  });
  // flowing runoff
  if (!reduced) {
    let off = 0;
    const flow = () => { off -= 1.2; runoff.setAttribute('stroke-dashoffset', off); requestAnimationFrame(flow); };
    new IntersectionObserver(([e], ob) => { if (e.isIntersecting) { ob.disconnect(); flow(); } }).observe(svg);
  }
  update();
}

/* ---------- action plan ---------- */
const ACTIONS = [
  ['At home', ['Start a compost bin for food scraps', 'Never pour oil, paint or medicine down the drain', 'Fix leaks and collect rainwater for plants', 'Stop buying one single-use plastic item', 'Plant a native species in a pot or garden']],
  ['At school', ['Set up sorted recycling and compost bins', 'Start a school garden using compost, not synthetic fertiliser', 'Log birds and insects for a citizen science project', 'Audit how much energy and water the school uses']],
  ['In your community', ['Survey a local stream for mayflies with a net and a tray', 'Join a tree planting or river clean-up day', 'Write to local leaders about a pollution problem you measured']],
];
export function initPlan() {
  const lists = $('#planLists');
  lists.innerHTML = ACTIONS.map(([h, items]) => `<div class="plan-group"><h3>${h}</h3>${items.map((t) => `<label><input type="checkbox">${t}</label>`).join('')}</div>`).join('');
  const svg = $('#planSvg');
  const NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = `<circle cx="340" cy="52" r="25" fill="#f2b705"/><path d="M0 210 Q 110 130 220 170 T 400 150 V 260 H 0 Z" fill="#a9b86a"/><g id="planTrees"></g>`;
  const G = $('#planTrees');
  const groundY = (x) => { if (x < 220) { const t = x / 220; return (1 - t) * (1 - t) * 210 + 2 * (1 - t) * t * 130 + t * t * 170; } const t = (x - 220) / 180; return (1 - t) * (1 - t) * 170 + 2 * (1 - t) * t * 130 + t * t * 150; };
  const inputs = $$('input', lists);
  const slots = inputs.map((_, i) => 22 + ((i * 7) % inputs.length) * (356 / (inputs.length - 1)));
  const trees = slots.map((x, i) => {
    const g = document.createElementNS(NS, 'g');
    const y = groundY(x) + 3;
    const s = 1.25 + (i % 3) * .3;
    g.innerHTML = `<rect x="-3" y="-26" width="6" height="26" fill="#5d452f"/><path d="M0 -74 L19 -24 H-19 Z" fill="${i % 2 ? '#2f7a4c' : '#4f9e3c'}"/>`;
    g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
    const inner = document.createElementNS(NS, 'g');
    while (g.firstChild) inner.appendChild(g.firstChild);
    inner.style.transition = reduced ? 'none' : 'transform .45s cubic-bezier(.3,1.6,.5,1)';
    inner.style.transform = 'scale(0)';
    g.appendChild(inner);
    G.appendChild(g);
    return inner;
  });
  inputs.forEach((inp, i) => inp.addEventListener('change', () => {
    trees[i].style.transform = inp.checked ? 'scale(1)' : 'scale(0)';
    const n = inputs.filter((x) => x.checked).length;
    $('#planCount').textContent = n === 0 ? 'No actions chosen yet' : `${n} ${n === 1 ? 'action' : 'actions'} chosen, ${n} ${n === 1 ? 'tree' : 'trees'} on the hill`;
  }));
}
