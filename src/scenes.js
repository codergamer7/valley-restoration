// Scroll-scrubbed biology scenes: eutrophication and biomagnification.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join()})`;
export const SCENE_STOPS = {
  lake: [0, .12, .38, .62, .76],
  biomag: [0, .32, .68, .84],
};
let seed = 23;
const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * R();

function fitCanvas(c) {
  const d = Math.min(devicePixelRatio || 1, 1.5), r = c.getBoundingClientRect();
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d');
  x.setTransform(d, 0, 0, d, 0, 0);
  return { x, W: r.width, H: r.height };
}
function poly(x, pts, fill) { x.fillStyle = fill; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); }

/* Shows the caption for the current stage and fills the timeline. */
function stepper(root, stops) {
  const steps = [...root.querySelectorAll('.scene-steps li')];
  const ticks = [...root.querySelectorAll('.scene-ticks span')];
  const fill = root.querySelector('.scene-fill');
  let cur = -1;
  return (p) => {
    let i = 0;
    stops.forEach((s, k) => { if (p >= s) i = k; });
    if (i !== cur) {
      cur = i;
      steps.forEach((s, k) => s.classList.toggle('on', k === i));
      ticks.forEach((s, k) => s.classList.toggle('on', k <= i));
    }
    if (fill) fill.style.transform = `scaleX(${p.toFixed(3)})`;
  };
}

/* ---------- eutrophication ---------- */
export function initLake(root) {
  const c = root.querySelector('canvas');
  const step = stepper(root, SCENE_STOPS.lake);
  const bars = Object.fromEntries(['nut', 'light', 'oxy', 'fish'].map((k) => [k, root.querySelector(`[data-l=${k}]`)]));
  const fish = Array.from({ length: 9 }, (_, i) => ({ d: i / 9, y: rr(.3, .85), x: R(), v: rr(.02, .05) * (i % 2 ? 1 : -1), s: rr(.8, 1.3) }));
  const weeds = Array.from({ length: 26 }, () => ({ x: R(), h: rr(.25, .6), o: R() * 6 }));
  const scum = Array.from({ length: 70 }, () => ({ x: R(), r: rr(5, 15), o: R() * 6, t: R() }));
  const dead = Array.from({ length: 60 }, () => ({ x: R(), o: R(), v: rr(.05, .12) }));
  const bugs = Array.from({ length: 90 }, () => ({ x: R(), y: R(), t: R() }));
  const pellets = Array.from({ length: 34 }, () => ({ o: R(), v: rr(.14, .26), c: R() < .5 ? '#f2b705' : '#d0553a' }));
  const reeds = Array.from({ length: 34 }, () => ({ x: R(), h: rr(.5, 1), t: R() }));

  return (p, time) => {
    const { x, W, H } = fitCanvas(c);
    step(p);
    const nutrient = ss(.12, .26, p) * (1 - ss(.78, .92, p));
    const algae = ss(.22, .42, p) * (1 - ss(.84, 1, p));
    const light = 1 - .86 * algae;
    const plants = (1 - ss(.38, .52, p)) + ss(.9, 1, p) * .85;
    const deadOn = ss(.44, .56, p) * (1 - ss(.86, 1, p));
    const bact = ss(.5, .62, p) * (1 - ss(.88, 1, p) * .85);
    const oxygen = 1 - .87 * ss(.52, .7, p) + .75 * ss(.84, 1, p);
    const living = (1 - ss(.62, .74, p)) + ss(.93, 1, p) * .75;
    const reed = ss(.76, .85, p);
    const set = (k, v) => { if (bars[k]) bars[k].style.transform = `scaleX(${clamp(v).toFixed(3)})`; };
    set('nut', nutrient * .95 + .05); set('light', light); set('oxy', oxygen); set('fish', living);

    const sea = H * (W < 860 ? .56 : .36), bx0 = W * .24, bx1 = W * 1.02, by = H * .96;
    const sky = x.createLinearGradient(0, 0, 0, sea);
    sky.addColorStop(0, '#6db8e0'); sky.addColorStop(1, '#dff3f3');
    x.fillStyle = sky; x.fillRect(0, 0, W, sea + 2);
    x.fillStyle = '#ffe28a'; x.beginPath(); x.arc(W * .42, H * .1, Math.min(W, H) * .05, 0, 7); x.fill();
    // water
    const wg = x.createLinearGradient(0, sea, 0, by);
    wg.addColorStop(0, mix([84, 182, 212], [120, 148, 64], algae));
    wg.addColorStop(1, mix([20, 92, 134], [44, 56, 34], Math.max(algae, deadOn * .9)));
    x.fillStyle = wg; x.fillRect(0, sea, W, H - sea);
    // sun rays reach only as deep as the light allows
    if (light > .2) {
      x.globalAlpha = .13 * light;
      x.fillStyle = '#fffbe0';
      for (let i = 0; i < 6; i++) {
        const X = bx0 + (i + .5) * (W - bx0) / 6, Y = lerp(sea + 20, by, light);
        poly(x, [[X - 16, sea], [X + 16, sea], [X + 58, Y], [X - 18, Y]], '#fffbe0');
      }
      x.globalAlpha = 1;
    }
    // submerged plants
    x.lineCap = 'round';
    const bedY = (u) => lerp(by - H * .02, by, Math.sin(u * 3.1));
    weeds.forEach((w) => {
      const X = lerp(bx0 + W * .12, W, w.x), Y = bedY(w.x), hh = (by - sea) * w.h * clamp(plants) * .75;
      if (hh < 4) return;
      x.strokeStyle = '#4c9a58'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(X, Y);
      x.quadraticCurveTo(X + Math.sin(time + w.o) * 16, Y - hh * .5, X + Math.sin(time * 1.2 + w.o) * 22, Y - hh); x.stroke();
    });
    // dead algae rains down
    if (deadOn > .01) dead.forEach((d, i) => {
      if (i / 60 > deadOn) return;
      const u = (d.o + time * d.v) % 1;
      x.fillStyle = '#5f6d33'; x.beginPath(); x.arc(lerp(bx0, W, d.x) + Math.sin(u * 9 + d.o * 6) * 8, lerp(sea + 6, by, u), 3, 0, 7); x.fill();
    });
    // decomposer bacteria bloom near the bottom
    if (bact > .01) bugs.forEach((b) => {
      if (b.t > bact) return;
      x.fillStyle = 'rgba(230,214,150,.9)';
      x.beginPath(); x.ellipse(lerp(bx0, W, b.x) + Math.sin(time + b.y * 9) * 5, lerp(by - H * .24, by - 6, b.y), 4, 2.2, b.y * 3, 0, 7); x.fill();
    });
    // fish, belly-up at the surface once oxygen runs out
    fish.forEach((f) => {
      const alive = f.d < living;
      const X = alive ? bx0 + ((f.x + time * f.v) % 1 + 1) % 1 * (W - bx0) : bx0 + f.x * (W - bx0);
      const Y = alive ? lerp(sea + 30, by - 34, f.y) + Math.sin(time * 1.3 + f.x * 8) * 7 : sea + 6 + Math.sin(time + f.x * 9) * 2;
      const dir = alive ? Math.sign(f.v) : 1, S = 15 * f.s * Math.min(W / 900, 1.25);
      x.save(); x.translate(X, Y); x.scale(dir, alive ? 1 : -1);
      x.fillStyle = alive ? '#d9e8ea' : '#a8ab96';
      x.beginPath(); x.ellipse(0, 0, S, S * .42, 0, 0, 7); x.fill();
      poly(x, [[-S * .85, 0], [-S * 1.5, -S * .45], [-S * 1.5, S * .45]], x.fillStyle);
      x.fillStyle = '#17261f'; x.beginPath(); x.arc(S * .55, -S * .08, S * .09, 0, 7); x.fill();
      x.restore();
    });
    // algae scum on the surface
    scum.forEach((b) => {
      if (b.t > algae) return;
      x.fillStyle = b.t > .5 ? '#7fae3f' : '#94bd4b';
      x.beginPath(); x.ellipse(lerp(bx0, W, b.x) + Math.sin(time * .4 + b.o) * 6, sea + 2, b.r * (1 + algae), 4 + algae * 5, 0, 0, 7); x.fill();
    });
    x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(bx0, sea - 1, W, 2);
    // the bank and field
    x.fillStyle = '#6b5436';
    x.beginPath(); x.moveTo(0, sea * .52); x.lineTo(bx0 * .8, sea * .78); x.lineTo(bx0 + W * .06, sea + 2); x.quadraticCurveTo(bx0 + W * .13, by - H * .05, bx0 + W * .34, by);
    x.lineTo(W, by); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
    x.fillStyle = '#4b3a25'; x.fillRect(0, by, W, H - by);
    x.fillStyle = mix([190, 170, 90], [108, 160, 70], reed);
    x.beginPath(); x.moveTo(0, sea * .5); x.lineTo(bx0 * .8, sea * .76); x.lineTo(bx0 + W * .06, sea + 2); x.lineTo(bx0 + W * .06, sea + 9); x.lineTo(bx0 * .8, sea * .76 + 10); x.lineTo(0, sea * .5 + 12); x.closePath(); x.fill();
    for (let i = 0; i < 16; i++) {
      const u = i / 16, X = u * bx0 * .72 + 10, Y = lerp(sea * .5, sea * .72, u);
      x.strokeStyle = '#a3983f'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(X, Y); x.lineTo(X, Y - 22); x.stroke();
      x.fillStyle = '#d9b23c'; x.beginPath(); x.ellipse(X, Y - 26, 3, 7, 0, 0, 7); x.fill();
    }
    // fertiliser washing down the slope
    pellets.forEach((q) => {
      const strength = nutrient * (1 - reed);
      if (q.o > strength) return;
      const u = (q.o + time * q.v) % 1, X = u * (bx0 + W * .1), Y = u < .78 ? lerp(sea * .52, sea, u / .78) + 3 : lerp(sea, sea + H * .12, (u - .78) / .22);
      x.fillStyle = q.c; x.beginPath(); x.arc(X, Y, 3.6, 0, 7); x.fill();
    });
    // the reed bed that stops it
    if (reed > .01) reeds.forEach((r) => {
      if (r.t > reed) return;
      const X = bx0 * .68 + r.x * W * .1, Y = lerp(sea * .7, sea + 2, clamp((X - bx0 * .68) / (W * .13)));
      x.strokeStyle = '#6b9b3c'; x.lineWidth = 3.4;
      const hh = H * .1 * r.h;
      x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.sin(time + r.x * 6) * 3, Y - hh); x.stroke();
      x.fillStyle = '#7a5a30'; x.beginPath(); x.ellipse(X + Math.sin(time + r.x * 6) * 3, Y - hh, 2.8, 7, 0, 0, 7); x.fill();
    });
  };
}

/* ---------- biomagnification: a persistent poison climbs the food chain ---------- */
export function initBiomag(root) {
  const c = root.querySelector('canvas');
  const step = stepper(root, SCENE_STOPS.biomag);
  const ppm = root.querySelector('[data-b=ppm]'), where = root.querySelector('[data-b=where]');
  const TIERS = [
    { name: 'Water', label: '0.000003 ppm', n: 2 },
    { name: 'Plankton', label: '0.04 ppm', n: 7 },
    { name: 'Small fish', label: 'Higher again', n: 13 },
    { name: 'Large fish', label: 'About 2 ppm', n: 22 },
    { name: 'Gull', label: 'Up to 75 ppm', n: 44 },
  ];
  const seeds = TIERS.map((t) => Array.from({ length: t.n }, () => [R() * 2 - 1, R() * 2 - 1]));
  const plankton = Array.from({ length: 34 }, () => [R() * 2 - 1, R() * 2 - 1, R() * 6]);
  const fishShape = (x, X, Y, S, col, flip = 1) => {
    x.save(); x.translate(X, Y); x.scale(flip, 1);
    x.fillStyle = col;
    x.beginPath(); x.ellipse(0, 0, S, S * .46, 0, 0, 7); x.fill();
    poly(x, [[-S * .82, 0], [-S * 1.5, -S * .5], [-S * 1.5, S * .5]], col);
    x.fillStyle = '#17261f'; x.beginPath(); x.arc(S * .6, -S * .1, S * .08, 0, 7); x.fill();
    x.restore();
  };
  const dots = (x, list, cx, cy, rx, ry, n, r) => {
    x.fillStyle = '#d0301c';
    for (let i = 0; i < n; i++) {
      const [a, b] = list[i], m = Math.hypot(a, b) > 1 ? Math.hypot(a, b) : 1;
      x.beginPath(); x.arc(cx + a / m * rx * .85, cy + b / m * ry * .8, r, 0, 7); x.fill();
    }
  };
  return (p, time) => {
    const { x, W, H } = fitCanvas(c);
    step(p);
    const narrow = W < 860;
    const sea = H * (narrow ? .62 : .42);
    const clean = ss(.86, 1, p);
    const sky = x.createLinearGradient(0, 0, 0, sea);
    sky.addColorStop(0, '#6db8e0'); sky.addColorStop(1, '#e2f3f1');
    x.fillStyle = sky; x.fillRect(0, 0, W, sea);
    const wg = x.createLinearGradient(0, sea, 0, H);
    wg.addColorStop(0, mix([70, 150, 170], [60, 176, 206], clean)); wg.addColorStop(1, mix([16, 62, 86], [16, 88, 128], clean));
    x.fillStyle = wg; x.fillRect(0, sea, W, H - sea);
    x.fillStyle = '#4b3a25'; x.fillRect(0, H * .95, W, H);
    const x0 = narrow ? W * .2 : W * .42, x1 = W * (narrow ? .8 : .9);
    const pts = TIERS.map((_, i) => {
      const u = i / 4;
      return { X: lerp(x0, x1, u), Y: i === 4 ? sea - H * (narrow ? .09 : .17) : lerp(H * .74, sea + H * (narrow ? .06 : .1), u / .75) };
    });
    const on = [ss(0, .03, p), ss(.15, .2, p), ss(.32, .37, p), ss(.5, .55, p), ss(.68, .73, p)];
    // the food chain links draw themselves
    x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.75)'; x.setLineDash([9, 9]);
    for (let i = 0; i < 4; i++) {
      const g = on[i + 1]; if (g < .02) continue;
      const a = pts[i], b = pts[i + 1];
      x.beginPath(); x.moveTo(a.X, a.Y); x.lineTo(lerp(a.X, b.X, g), lerp(a.Y, b.Y, g)); x.stroke();
    }
    x.setLineDash([]);
    const u = Math.min(W, H) / 800, faded = 1 - clean * .82;
    // water sample
    if (on[0] > .02) {
      const { X, Y } = pts[0], r = 44 * u * on[0];
      x.fillStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
      x.globalAlpha = faded; dots(x, seeds[0], X, Y, r * .7, r * .7, TIERS[0].n, 2.4 * u); x.globalAlpha = 1;
    }
    if (on[1] > .02) {
      const { X, Y } = pts[1];
      plankton.forEach(([a, b, o]) => {
        const px = X + a * 58 * u + Math.sin(time + o) * 3, py = Y + b * 38 * u + Math.cos(time * .8 + o) * 3;
        x.fillStyle = '#a6d152'; x.beginPath(); x.arc(px, py, 4.4 * u * on[1], 0, 7); x.fill();
      });
      x.globalAlpha = faded; dots(x, seeds[1], X, Y, 56 * u, 36 * u, TIERS[1].n, 2.6 * u); x.globalAlpha = 1;
    }
    if (on[2] > .02) {
      const { X, Y } = pts[2], S = 38 * u * on[2], yy = Y + Math.sin(time * 1.2) * 4;
      fishShape(x, X, yy, S, '#d9e8ea');
      x.globalAlpha = faded; dots(x, seeds[2], X, yy, S * .78, S * .36, TIERS[2].n, 2.2 * u); x.globalAlpha = 1;
    }
    if (on[3] > .02) {
      const { X, Y } = pts[3], S = 70 * u * on[3], yy = Y + Math.sin(time) * 5;
      fishShape(x, X, yy, S, '#a9bcc2', -1);
      x.globalAlpha = faded; dots(x, seeds[3], X, yy, S * .8, S * .36, TIERS[3].n, 2.5 * u); x.globalAlpha = 1;
    }
    if (on[4] > .02) {
      const { X, Y } = pts[4], S = 58 * u * on[4], fl = Math.sin(time * 3) * .3;
      x.fillStyle = '#f4f6f4';
      poly(x, [[X - S * .1, Y - S * .1], [X - S * 1.5, Y - S * (.75 + fl)], [X - S * .75, Y + S * .1]], '#dfe5e4');
      poly(x, [[X + S * .1, Y - S * .1], [X + S * 1.5, Y - S * (.75 + fl)], [X + S * .75, Y + S * .1]], '#dfe5e4');
      x.fillStyle = '#f7f9f8'; x.beginPath(); x.ellipse(X, Y, S * .85, S * .36, 0, 0, 7); x.fill();
      x.beginPath(); x.arc(X + S * .78, Y - S * .2, S * .24, 0, 7); x.fill();
      poly(x, [[X + S * .98, Y - S * .24], [X + S * 1.3, Y - S * .15], [X + S * .98, Y - S * .08]], '#e8a317');
      x.fillStyle = '#17261f'; x.beginPath(); x.arc(X + S * .86, Y - S * .27, S * .04, 0, 7); x.fill();
      x.globalAlpha = faded; dots(x, seeds[4], X, Y, S * .76, S * .28, TIERS[4].n, 2.4 * u); x.globalAlpha = 1;
    }
    // labels
    x.textAlign = 'center';
    TIERS.forEach((t, i) => {
      if (on[i] < .5) return;
      const { X, Y } = pts[i];
      // on narrow screens the labels take turns above and below, so they don't collide
      const dy = narrow ? (i === 4 ? -60 * u : i % 2 ? -44 * u : 62 * u) : i === 4 ? -78 * u : i === 3 ? 58 * u : 62 * u;
      const fs = Math.max(narrow ? 11 : 13, 17 * u);
      x.font = `700 ${fs}px "Atkinson Hyperlegible", sans-serif`;
      const w = Math.max(x.measureText(t.label).width, x.measureText(t.name).width) + 16;
      x.fillStyle = 'rgba(23,38,31,.86)';
      x.fillRect(X - w / 2, Y + dy - fs * 1.15, w, fs * 2.55);
      x.fillStyle = '#fff'; x.fillText(t.name, X, Y + dy);
      x.fillStyle = '#ffd34a'; x.fillText(clean > .5 && i > 0 ? 'Falling' : t.label, X, Y + dy + fs * 1.15);
    });
    x.textAlign = 'left';
    const idx = on.reduce((m, v, i) => (v > .5 ? i : m), 0);
    if (ppm) { ppm.textContent = clean > .5 ? 'Falling' : TIERS[idx].label; where.textContent = clean > .5 ? 'after the ban' : TIERS[idx].name; }
  };
}
