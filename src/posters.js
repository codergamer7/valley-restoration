// Four printable posters, drawn with the Canvas API so they can be saved as images.
const W = 1500, H = 2000;
const D = 'Anybody, sans-serif', B = '"Atkinson Hyperlegible", sans-serif';

function font(x, size, weight = 900, stretch = 'normal', fam = D) {
  x.font = `${weight} ${size}px ${fam}`;
  if ('fontStretch' in x) x.fontStretch = stretch;
}
function lines(x, text, X, Y, maxW, lh) {
  const words = text.split(' ');
  let line = '', y = Y;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) { x.fillText(line, X, y); y += lh; line = w; } else line = t;
  }
  x.fillText(line, X, y);
  return y + lh;
}
// Shrinks a headline until it fits the poster, whatever the browser's font stretch does.
function title(x, text, X, Y, size, maxW, stretch = 'expanded') {
  let s = size;
  font(x, s, 900, stretch);
  while (x.measureText(text).width > maxW && s > 40) { s -= 4; font(x, s, 900, stretch); }
  x.fillText(text, X, Y);
}
let seed = 11;
const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/* 1: tree rings */
function rings(x) {
  x.fillStyle = '#123f2b'; x.fillRect(0, 0, W, H);
  const cx = W * .5, cy = H * .62;
  for (let r = 1020, i = 0; r > 12; i++) {
    const w = 10 + R() * 22;
    x.beginPath();
    for (let a = 0; a <= 6.3; a += .03) {
      const rr = r + Math.sin(a * 3 + i * .7) * r * .022 + Math.sin(a * 7 + i) * r * .008;
      const X = cx + Math.cos(a) * rr, Y = cy + Math.sin(a) * rr;
      a === 0 ? x.moveTo(X, Y) : x.lineTo(X, Y);
    }
    x.closePath();
    const t = i % 2;
    x.fillStyle = r > 900 ? '#3e2a1a' : t ? '#e0b873' : '#c9944f';
    x.fill();
    x.strokeStyle = 'rgba(70,40,15,.45)'; x.lineWidth = 2.2; x.stroke();
    r -= w;
  }
  x.fillStyle = '#fff5dc';
  title(x, 'Plant the', 80, 225, 196, W - 160);
  title(x, 'right tree', 80, 425, 196, W - 160);
  x.fillStyle = '#123f2b';
  x.fillRect(80, 1620, W - 160, 300);
  x.fillStyle = '#fff5dc';
  font(x, 50, 700, 'normal', B);
  let y = 1700;
  y = lines(x, 'Choose native species. Plant a mix. Protect what is already growing, because natural regrowth can do much of the work.', 125, y, W - 250, 66);
  font(x, 36, 400, 'normal', B);
  x.fillText('Every ring is one more year of soil held in place.', 125, y + 8);
}

/* 2: mayfly */
function mayfly(x) {
  x.fillStyle = '#0b6f8e'; x.fillRect(0, 0, W, H);
  // ripples
  x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 5;
  for (let i = 1; i < 11; i++) { x.beginPath(); x.ellipse(W / 2, 1150, i * 118, i * 58, 0, 0, 6.3); x.stroke(); }
  x.fillStyle = '#ffffff';
  title(x, 'Ask the', 80, 240, 228, W - 160);
  x.fillStyle = '#ffd34a';
  title(x, 'mayfly', 80, 455, 228, W - 160);
  // insect, drawn from above
  x.save(); x.translate(W / 2, 1100); x.rotate(-.14);
  const wing = (s) => {
    x.save(); x.scale(s, 1);
    x.beginPath(); x.moveTo(20, -150); x.bezierCurveTo(250, -470, 560, -420, 570, -280); x.bezierCurveTo(560, -130, 240, -40, 20, -60); x.closePath();
    x.fillStyle = 'rgba(232,248,255,.82)'; x.fill();
    x.strokeStyle = '#123f4e'; x.lineWidth = 6; x.stroke();
    x.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(20, -125 + i * 5); x.quadraticCurveTo(280, -300 + i * 25, 545 - i * 22, -350 + i * 34); x.stroke(); }
    for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(110 + i * 28, -295 + Math.abs(i - 7) * 8); x.lineTo(115 + i * 25, -110 - i * 3); x.stroke(); }
    x.beginPath(); x.moveTo(25, -60); x.bezierCurveTo(160, -40, 250, 30, 200, 90); x.bezierCurveTo(130, 130, 40, 40, 20, -20); x.closePath();
    x.fillStyle = 'rgba(232,248,255,.76)'; x.fill(); x.lineWidth = 5; x.stroke();
    x.restore();
  };
  wing(1); wing(-1);
  // tails
  x.strokeStyle = '#123f4e'; x.lineWidth = 7; x.lineCap = 'round';
  [-1, 0, 1].forEach((d) => { x.beginPath(); x.moveTo(0, 340); x.bezierCurveTo(d * 30, 480, d * 150, 590, d * 190 + (d ? 0 : 12), 720); x.stroke(); });
  // body
  x.fillStyle = '#123f4e';
  for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(0, 40 + i * 37, 38 - i * 2.8, 26, 0, 0, 6.3); x.fill(); x.fillStyle = i % 2 ? '#123f4e' : '#ffd34a'; }
  x.fillStyle = '#123f4e';
  x.beginPath(); x.ellipse(0, -80, 52, 100, 0, 0, 6.3); x.fill();
  x.beginPath(); x.ellipse(0, -205, 42, 38, 0, 0, 6.3); x.fill();
  x.fillStyle = '#ffd34a';
  x.beginPath(); x.arc(-29, -218, 15, 0, 6.3); x.arc(29, -218, 15, 0, 6.3); x.fill();
  x.lineWidth = 6;
  [[-1], [1]].forEach(([s]) => {
    x.beginPath(); x.moveTo(s * 40, -120); x.lineTo(s * 110, -180); x.lineTo(s * 170, -310); x.stroke();
    x.beginPath(); x.moveTo(s * 42, -70); x.lineTo(s * 130, -30); x.lineTo(s * 240, 25); x.stroke();
    x.beginPath(); x.moveTo(s * 34, -20); x.lineTo(s * 110, 70); x.lineTo(s * 190, 190); x.stroke();
  });
  x.restore();
  x.fillStyle = '#ffffff';
  font(x, 50, 700, 'normal', B);
  lines(x, 'Mayfly larvae are sensitive to pollution. Finding many in a stream suggests clean water. All you need is a net, a tray and a good look.', 80, 1825, W - 160, 62);
}

/* 3: soil */
function soil(x) {
  const bands = [[0, '#bfe6f2'], [760, '#2b1e12'], [930, '#4b3320'], [1260, '#94693a'], [1620, '#a99a7d'], [1860, '#6c6a63']];
  bands.forEach(([y, c], i) => { x.fillStyle = c; x.fillRect(0, y, W, (bands[i + 1]?.[0] ?? H) - y); });
  // plants and roots
  for (let i = 0; i < 28; i++) {
    const X = 35 + i * 53 + R() * 15, hh = 80 + R() * 140, deep = 180 + R() * 620;
    x.strokeStyle = i % 3 ? '#3f8e3a' : '#6db33f'; x.lineWidth = 13; x.lineCap = 'round';
    x.beginPath(); x.moveTo(X, 765); x.quadraticCurveTo(X + (R() - .5) * 50, 765 - hh * .6, X + (R() - .5) * 40, 765 - hh); x.stroke();
    x.strokeStyle = '#eadfc4'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(X, 765);
    x.bezierCurveTo(X + (R() - .5) * 90, 765 + deep * .3, X + (R() - .5) * 150, 765 + deep * .7, X + (R() - .5) * 180, 765 + deep); x.stroke();
    x.lineWidth = 2.6;
    for (let k = 0; k < 4; k++) { const y0 = 800 + k * deep * .2; x.beginPath(); x.moveTo(X, y0); x.quadraticCurveTo(X + (R() - .5) * 90, y0 + 35, X + (R() - .5) * 150, y0 + 80); x.stroke(); }
  }
  // worms
  x.strokeStyle = '#d07c84'; x.lineWidth = 16;
  [[220, 1080], [780, 1160], [1180, 1010], [520, 1350]].forEach(([X, Y]) => { x.beginPath(); x.moveTo(X, Y); x.bezierCurveTo(X + 60, Y - 55, X + 90, Y + 55, X + 170, Y); x.stroke(); });
  // stones
  for (let i = 0; i < 44; i++) { x.fillStyle = i % 2 ? '#7c7a72' : '#928f85'; x.beginPath(); x.ellipse(R() * W, 1650 + R() * 340, 18 + R() * 38, 12 + R() * 24, R() * 3, 0, 6.3); x.fill(); }
  x.fillStyle = '#17261f';
  title(x, 'Feed', 80, 270, 250, W - 160);
  title(x, 'the soil', 80, 500, 250, W - 160);
  font(x, 48, 700, 'normal', B);
  x.fillStyle = '#17261f';
  x.fillText('It feeds everything else.', 85, 590);
  x.fillStyle = 'rgba(23,38,31,.86)'; x.fillRect(80, 1560, W - 160, 355);
  x.fillStyle = '#fff5dc';
  font(x, 48, 700, 'normal', B);
  ['Add compost in place of synthetic fertiliser', 'Cover bare ground in winter', 'Rotate crops with legumes', 'Leave hedges for helpful insects'].forEach((t, i) => {
    x.beginPath(); x.arc(135, 1632 + i * 75, 14, 0, 6.3); x.fillStyle = '#ffd34a'; x.fill();
    x.fillStyle = '#fff5dc'; x.fillText(t, 175, 1648 + i * 75);
  });
}

/* 4: waste funnel */
function funnel(x) {
  x.fillStyle = '#f2b705'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#17261f';
  title(x, 'Stop it at', 70, 220, 190, W - 140);
  title(x, 'the source', 70, 420, 190, W - 140);
  const items = [['Refuse', 'Say no to what you don’t need', 1340, '#123f2b'], ['Reduce', 'Use less of what you do', 1120, '#1f6b42'], ['Reuse', 'Repair it and keep it going', 900, '#2a8a78'], ['Recycle', 'Only about 9% of plastic gets recycled', 690, '#0b6f8e'], ['Compost', 'Turn scraps into soil', 500, '#7a4f22'], ['Dump', 'The last resort', 310, '#b23a22']];
  const top = 510, step = 208;
  items.forEach(([t, s, w, c], i) => {
    const nextW = items[i + 1]?.[2] ?? w * .7;
    const y = top + i * step;
    x.fillStyle = c;
    x.beginPath();
    x.moveTo((W - w) / 2, y); x.lineTo((W + w) / 2, y); x.lineTo((W + nextW) / 2, y + step - 12); x.lineTo((W - nextW) / 2, y + step - 12);
    x.closePath(); x.fill();
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    font(x, i < 4 ? 82 : 60, 900, 'expanded');
    x.fillText(t, W / 2, y + (i < 4 ? 88 : 72));
    if (w > 480) { font(x, i < 3 ? 38 : 30, 400, 'normal', B); x.fillText(s, W / 2, y + (i < 3 ? 148 : 128)); } else { font(x, 28, 400, 'normal', B); x.fillText(s.length < 26 ? s : '', W / 2, y + 122); }
    x.textAlign = 'left';
  });
  x.fillStyle = '#17261f';
  font(x, 50, 700, 'normal', B);
  lines(x, 'The higher you act, the less there is to clean up.', 70, 1840, W - 140, 62);
}

export async function initPosters() {
  const track = document.getElementById('posterTrack');
  const items = [['Plant the right tree', rings, 'plant-the-right-tree'], ['Ask the mayfly', mayfly, 'ask-the-mayfly'], ['Feed the soil', soil, 'feed-the-soil'], ['Stop it at the source', funnel, 'stop-it-at-the-source']];
  try {
    await Promise.all(['900 40px Anybody', '700 40px "Atkinson Hyperlegible"', '400 40px "Atkinson Hyperlegible"'].map((f) => document.fonts.load(f)));
  } catch { /* fall back to system fonts */ }
  items.forEach(([title, draw, file]) => {
    const wrap = document.createElement('div');
    wrap.className = 'poster-item';
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `Poster: ${title}`);
    draw(c.getContext('2d'));
    const b = document.createElement('button');
    b.className = 'btn';
    b.type = 'button';
    b.textContent = `Save "${title}" as an image`;
    b.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `${file}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    });
    // Embedded viewers block downloads, so only offer saving when the page runs on its own.
    wrap.append(c);
    if (window.self === window.top) wrap.append(b);
    track.appendChild(wrap);
  });
}
