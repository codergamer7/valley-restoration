// All sound is synthesised in the browser, so the site stays one offline file.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
let ctx = null, master, gHum, gWind, gRiver, gRain, birdBus;
let on = false, birdLevel = 0, birdTimer = null;

function noise(kind) {
  const n = ctx.sampleRate * 4, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true; s.start();
  return s;
}
const filter = (type, f, q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = gain(0); master.connect(ctx.destination);
  // factory drone
  gHum = gain(); gHum.connect(master);
  noise('brown').connect(filter('lowpass', 210)).connect(gHum);
  [49, 98.5].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = gain(i ? .012 : .03); o.connect(filter('lowpass', 320)).connect(g).connect(gHum); o.start(); });
  // wind, slowly swelling
  gWind = gain(); gWind.connect(master);
  const lfo = ctx.createOscillator(), lfoG = gain(.018); lfo.frequency.value = .09; lfo.connect(lfoG).connect(gWind.gain); lfo.start();
  noise('white').connect(filter('bandpass', 430, .5)).connect(gWind);
  // river
  gRiver = gain(); gRiver.connect(master);
  noise('white').connect(filter('bandpass', 1500, .35)).connect(filter('highpass', 500)).connect(gRiver);
  // rain
  gRain = gain(); gRain.connect(master);
  noise('white').connect(filter('highpass', 2600)).connect(gRain);
  // birds sit in a small echo so they feel far away
  birdBus = gain(.7); birdBus.connect(master);
  const delay = ctx.createDelay(1); delay.delayTime.value = .27;
  const fb = gain(.28); birdBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(filter('highpass', 900)).connect(master);
}

function note(t, f0, f1, dur, vol, pan) {
  const o = ctx.createOscillator(), g = gain(0);
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * .2);
  g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  let tail = g;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
  o.connect(g); tail.connect(birdBus);
  o.start(t); o.stop(t + dur + .02);
}
function birdCall() {
  const t = ctx.currentTime + .02, pan = Math.random() * 1.6 - .8, v = .022 + Math.random() * .02, kind = Math.floor(Math.random() * 4);
  if (kind === 0) { // falling trill
    const n = 5 + Math.floor(Math.random() * 6), base = 3000 + Math.random() * 1400;
    for (let i = 0; i < n; i++) note(t + i * .085, base - i * 90, base - i * 90 - 260, .07, v, pan);
  } else if (kind === 1) { // two-note whistle
    const f = 2100 + Math.random() * 700;
    note(t, f, f * 1.04, .22, v, pan); note(t + .28, f * .8, f * .78, .28, v, pan);
  } else if (kind === 2) { // warble
    let f = 2600 + Math.random() * 900;
    for (let i = 0; i < 7; i++) { const g = f * (1 + (Math.random() - .5) * .26); note(t + i * .1, f, g, .09, v * .85, pan); f = g; }
  } else { // single chirps
    const f = 3800 + Math.random() * 1200;
    for (let i = 0; i < 3; i++) note(t + i * .17, f, f * .7, .09, v, pan);
  }
}
function scheduleBirds() {
  clearTimeout(birdTimer);
  const wait = birdLevel > .05 ? (900 + Math.random() * 3200) / (.35 + birdLevel) : 1500;
  birdTimer = setTimeout(() => {
    if (on && birdLevel > .08 && Math.random() < birdLevel + .2) birdCall();
    if (on) scheduleBirds();
  }, wait);
}

export function toggleSound() {
  on = !on;
  if (on) {
    if (!ctx) build();
    ctx.resume();
    master.gain.setTargetAtTime(.9, ctx.currentTime, .4);
    scheduleBirds();
  } else if (ctx) {
    master.gain.setTargetAtTime(0, ctx.currentTime, .2);
    clearTimeout(birdTimer);
  }
  return on;
}
export const soundOn = () => on;

/* Called every frame with the valley's health scores (0 to 100). */
export function updateSound(sc, storm, quiet) {
  if (!on || !ctx) return;
  const t = ctx.currentTime, k = quiet ? .22 : 1;
  gHum.gain.setTargetAtTime(clamp((70 - sc.air) / 55) * .24 * k, t, .3);
  gWind.gain.setTargetAtTime((.045 + storm * .05) * k, t, .3);
  gRiver.gain.setTargetAtTime(clamp((sc.water - 25) / 70) * .05 * k, t, .4);
  gRain.gain.setTargetAtTime(storm * .075 * k, t, .25);
  birdLevel = clamp((sc.species - 22) / 70) * (quiet ? .35 : 1);
}

/* Small confirmation tones for quiz answers. */
export function blip(ok) {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  (ok ? [660, 880] : [300, 220]).forEach((f, i) => {
    const o = ctx.createOscillator(), g = gain(0);
    o.type = ok ? 'triangle' : 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(.0005, t + i * .11);
    g.gain.linearRampToValueAtTime(.09, t + i * .11 + .015);
    g.gain.exponentialRampToValueAtTime(.0005, t + i * .11 + .18);
    o.connect(g).connect(master); o.start(t + i * .11); o.stop(t + i * .11 + .2);
  });
}
