// Takes over scrolling: a speed limit for the wheel, plus Next and Back slide stops and auto-play.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* wheel: how far one wheel notch moves. max: the speed limit, in screen heights per second.
   glide: travel speed for Next and Back. */
const PROFILES = [
  { name: 'Slow', wheel: .24, max: .45, glide: .3 },
  { name: 'Normal', wheel: .4, max: .75, glide: .42 },
  { name: 'Fast', wheel: .7, max: 1.25, glide: .65 },
];

export function initScroller() {
  const $ = (id) => document.getElementById(id);
  const ui = { next: $('deckNext'), back: $('deckBack'), auto: $('toolAuto'), speed: $('deckSpeed'), title: $('deckTitle'), fill: $('deckFill'), deck: $('deck') };
  let stops = [], y = scrollY, target = y, v = 0, lastSet = y, glide = null, profile = 1;
  let shownIdx = -1, statusUntil = 0;
  const auto = { on: false, hold: 0, holdMax: 1, speed: 1 };
  const P = () => PROFILES[profile];
  const vh = () => innerHeight;
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  function setY(n) { y = clamp(n, 0, maxY()); scrollTo(0, y); lastSet = scrollY; }

  function glideTo(to, maxDur = 10) {
    to = clamp(to, 0, maxY());
    const d = Math.abs(to - y);
    if (d < 1) { if (glide) glide = null; arrived(); return; }
    glide = { from: y, to, t: 0, dur: reduced ? .001 : clamp(d / (vh() * P().glide), 1.8, maxDur) };
    v = 0;
  }
  const stopAtIndex = () => {
    let i = -1;
    for (let k = 0; k < stops.length; k++) if (stops[k].y <= y + 6) i = k; else break;
    return i;
  };
  function next() {
    const base = glide ? glide.to : y;
    const s = stops.find((q) => q.y > base + 6);
    if (s) glideTo(s.y);
    return s;
  }
  function prev() {
    const base = glide ? glide.to : y;
    let s = null;
    for (const q of stops) if (q.y < base - 6) s = q; else break;
    glideTo(s ? s.y : 0);
  }

  function status(text) { ui.title.textContent = text; statusUntil = performance.now() + 6000; }
  function setAuto(on) {
    auto.on = on;
    ui.auto.setAttribute('aria-pressed', on);
    ui.auto.textContent = on ? 'Pause' : 'Auto-play';
    ui.fill.style.transform = 'scaleX(0)';
    if (on) { auto.hold = glide ? 0 : 1; auto.holdMax = 1; statusUntil = 0; }
  }
  function arrived() {
    if (!auto.on) return;
    const s = stops[stopAtIndex()];
    if (!s) return;
    if (s.pause) { setAuto(false); status('Auto-play paused for this activity. Press Next to carry on.'); return; }
    auto.hold = auto.holdMax = s.hold;
  }

  /* the speed limit: the wheel only moves a target, and the page chases it no faster than the limit */
  addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch zoom and zooming the 3D models
    const inner = e.target.closest?.('#notesBody');
    if (inner && inner.scrollHeight > inner.clientHeight) return;
    e.preventDefault();
    if (auto.on) setAuto(false);
    if (glide) { target = y; glide = null; }
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? vh() : 1;
    const px = clamp(e.deltaY * unit, -120, 120) * P().wheel * (vh() / 800);
    target = clamp(clamp(target + px, y - vh() * .7, y + vh() * .7), 0, maxY());
  }, { passive: false, capture: true });

  /* Runs once per frame. */
  function tick(rawDt) {
    // something else moved the page (touch, a link, the browser): follow it
    if (Math.abs(scrollY - lastSet) > 2) { y = target = lastSet = scrollY; v = 0; glide = null; }
    if (glide) {
      glide.t += Math.min(rawDt, 1) / glide.dur;
      const done = glide.t >= 1;
      setY(lerp(glide.from, glide.to, ease(Math.min(1, glide.t))));
      target = y;
      if (done) { glide = null; arrived(); }
    } else if (Math.abs(target - y) > .5 || Math.abs(v) > 1) {
      const dt = Math.min(rawDt, .1), max = vh() * P().max;
      const want = clamp((target - y) * 4.5, -max, max);
      v += (want - v) * Math.min(1, dt * 9);
      setY(y + v * dt);
      if (Math.abs(target - y) < 1 && Math.abs(v) < 12) { setY(target); v = 0; }
    }
    if (auto.on && !glide) {
      auto.hold -= Math.min(rawDt, 1) * auto.speed;
      ui.fill.style.transform = `scaleX(${clamp(1 - auto.hold / auto.holdMax).toFixed(3)})`;
      if (auto.hold <= 0) {
        ui.fill.style.transform = 'scaleX(0)';
        if (!next()) setAuto(false);
      }
    }
    const i = stopAtIndex();
    if (i !== shownIdx) {
      shownIdx = i;
      ui.back.disabled = y < 2 && i <= 0;
      ui.next.disabled = i >= stops.length - 1;
    }
    if (performance.now() > statusUntil) {
      const t = stops[Math.max(i, 0)]?.title ?? '';
      if (ui.title.textContent !== t) ui.title.textContent = t;
    }
  }

  ui.next.addEventListener('click', () => { if (auto.on) setAuto(false); next(); });
  ui.back.addEventListener('click', () => { if (auto.on) setAuto(false); prev(); });
  ui.auto.addEventListener('click', () => setAuto(!auto.on));
  const cycleSpeed = () => { profile = (profile + 1) % PROFILES.length; ui.speed.textContent = `Scroll: ${P().name}`; };
  ui.speed.addEventListener('click', cycleSpeed);
  addEventListener('touchstart', () => { if (auto.on) setAuto(false); }, { passive: true });

  /* the controls dim when the mouse rests, so they don't distract from the slide */
  let idleTimer = 0;
  const wake = () => { ui.deck.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!ui.deck.matches(':hover, :focus-within')) ui.deck.classList.add('idle'); }, 3500); };
  addEventListener('pointermove', wake, { passive: true });
  wake();

  /* source links glide instead of jumping */
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a) return;
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    glideTo(el.getBoundingClientRect().top + scrollY, 2.5);
  });

  return {
    tick, next, prev, glideTo, setAuto, cycleSpeed,
    toggleAuto: () => setAuto(!auto.on),
    faster: () => { auto.speed = Math.min(3, auto.speed + .25); status(`Auto-play speed ${auto.speed}x`); },
    slower: () => { auto.speed = Math.max(.5, auto.speed - .25); status(`Auto-play speed ${auto.speed}x`); },
    nudge: (d) => { if (auto.on) setAuto(false); glide = null; target = clamp(target + d * vh() * .12, 0, maxY()); },
    setStops: (list) => { stops = list; shownIdx = -2; },
  };
}
