// Four hand-built 3D teaching models with clickable parts.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: .85, ...o });
const rnd = (a, b) => a + Math.random() * (b - a);
const mesh = (g, m, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(g, m); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; return k; };
const tube = (pts, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 18, r, 5), mat);

/* a stream of little balls moving along a path */
function stream(n, size, path, colorAt) {
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshStandardMaterial({ roughness: .5 }), n);
  const seeds = Array.from({ length: n }, () => ({ o: Math.random(), a: rnd(-1, 1), b: rnd(-1, 1), sp: rnd(.8, 1.2) }));
  const d = new THREE.Object3D(), c = new THREE.Color(), v = new THREE.Vector3();
  im.frustumCulled = false;
  const update = (t) => {
    seeds.forEach((s, i) => {
      const u = (s.o + t * .09 * s.sp) % 1;
      path(u, s, v);
      d.position.copy(v); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      im.setColorAt(i, colorAt(u, c));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  };
  update(0);
  return { im, update };
}

/* ---------- soil profile ---------- */
function buildSoil() {
  const g = new THREE.Group();
  const S = 8;
  const layers = [
    { h: .8, c: '#2b1e12', base: 4.1 }, // O
    { h: 2.2, c: '#4b3320', base: 1.9 }, // A
    { h: 2.3, c: '#94693a', base: -.4 }, // B
    { h: 2.3, c: '#a99a7d', base: -2.7 }, // C
    { h: 1.3, c: '#6c6a63', base: -4.0 }, // R
  ];
  const lm = layers.map((l) => {
    const m = mesh(new THREE.BoxGeometry(S, l.h, S, 12, 2, 12), M(l.c), 0, l.base + l.h / 2, 0);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getX(i)) < S / 2 && Math.abs(p.getZ(i)) < S / 2) p.setY(i, p.getY(i) + (p.getY(i) > 0 ? rnd(-.05, .12) : rnd(-.08, .05)));
    }
    p.needsUpdate = true;
    m.geometry.computeVertexNormals();
    g.add(m);
    return m;
  });
  // stones
  const stoneMat = M('#8a8880');
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const onX = i % 4 < 2;
    const s = mesh(new THREE.IcosahedronGeometry(rnd(.14, .36), 0), stoneMat);
    const a = rnd(-3.7, 3.7);
    s.position.set(onX ? side * 4 : a, rnd(-3.5, -.1), onX ? a : side * 4);
    (s.position.y < -2.7 ? lm[3] : lm[2]).attach(s);
  }
  const life = new THREE.Group();
  const rootMat = M('#e8ddc2');
  const fungiMat = M('#fbfbf2');
  const worms = M('#c9747f');
  const plants = new THREE.Group();
  for (let i = 0; i < 28; i++) {
    const x = rnd(-3.6, 3.6), z = rnd(-3.6, 3.6);
    const b = mesh(new THREE.ConeGeometry(rnd(.1, .2), rnd(.7, 1.5), 5), M(['#5da63b', '#3f8e3a', '#8aba45'][i % 3]), x, 5.3, z);
    plants.add(b);
    if (i % 2 === 0) {
      const pts = [[x, 4.9, z], [x + rnd(-.4, .4), 3.6, z + rnd(-.4, .4)], [x + rnd(-.7, .7), 2.2, z + rnd(-.7, .7)], [x + rnd(-.9, .9), rnd(.4, 1.2), z + rnd(-.9, .9)]];
      life.add(tube(pts.map(([a, y, c]) => [clamp(a, -3.98, 3.98), y, clamp(c, -3.98, 3.98)]), .05, rootMat));
    }
  }
  // roots shown on cut faces, so they read clearly
  for (let i = 0; i < 9; i++) {
    const x = -3.4 + i * .85, base = 4.9;
    life.add(tube([[x, base, 4.02], [x + rnd(-.3, .3), 3.4, 4.03], [x + rnd(-.4, .4), 2, 4.03], [x + rnd(-.5, .5), rnd(.2, 1.3), 4.03]], .05, rootMat));
    const n = 3;
    for (let k = 0; k < n; k++) life.add(tube([[x, 3.5 - k * .6, 4.03], [x + rnd(-.5, .5), 3.3 - k * .6, 4.04], [x + rnd(-1, 1), 3 - k * .6, 4.04]], .018, fungiMat));
  }
  [[-2, 3, 4.08], [1.2, 2.4, 4.08], [2.8, 3.5, 4.08]].forEach(([x, y, z], i) => {
    life.add(tube([[x - .6, y, z], [x - .2, y + .18, z], [x + .2, y - .14, z], [x + .6, y + .08, z]], .075, worms));
    if (i === 0) life.userData.w = [x, y, z];
  });
  g.add(life, plants);
  // gaps, thin versions and exploded layout handled by these controls
  let healthy = 1, explode = 0, hTarget = 1, eTarget = 0;
  const hotspots = [
    { p: () => [-3, lm[0].position.y, 4.2], t: 'Humus', d: 'Dark, decayed plant matter. It holds water and feeds soil life. Ploughing and erosion remove it first, and compost rebuilds it.' },
    { p: () => [3.2, lm[1].position.y, 4.2], t: 'Topsoil', d: 'Most roots and soil life live here. It can take centuries to form, but one storm can strip it from a bare slope.' },
    { p: () => [-1.8, lm[1].position.y + .2, 4.25], t: 'Roots and fungi', d: 'Roots bind the soil. Fine fungal threads, called mycorrhizae, trade minerals for sugar with the plant and extend its reach.' },
    { p: () => [1.2, lm[1].position.y - .1, 4.3], t: 'Earthworms', d: 'Their tunnels let air and water in, and their castings mix organic matter down into the soil. Worm numbers are a simple test of soil health.' },
    { p: () => [-1.5, lm[2].position.y, 4.2], t: 'Subsoil', d: 'Less organic matter, more clay and minerals washed down from above. It stores water that deep roots can reach in a drought.' },
    { p: () => [1.5, lm[3].position.y, 4.2], t: 'Parent material', d: 'Weathered rock that slowly breaks down into new soil. That slowness is why protecting soil beats trying to replace it.' },
  ];
  const update = (t, dt) => {
    healthy += (hTarget - healthy) * Math.min(1, dt * 4);
    explode += (eTarget - explode) * Math.min(1, dt * 6);
    const o = explode * 1.1;
    const hs = [.12 + .88 * healthy, .45 + .55 * healthy, 1, 1, 1];
    let y = -4;
    for (let i = 4; i >= 0; i--) {
      const L = layers[i], h = L.h * hs[i];
      lm[i].scale.y = hs[i];
      lm[i].position.y = y + h / 2 + (4 - i) * o;
      y += h;
    }
    life.scale.set(1, 1, 1);
    life.visible = healthy > .15;
    life.position.y = (lm[1].position.y - (1.9 + 1.1)) * .9;
    const top = lm[0].position.y + layers[0].h * hs[0] / 2;
    plants.position.y = top - 4.9;
    plants.children.forEach((b, i) => { const k = i < 6 ? Math.max(healthy, .3) : healthy; b.scale.setScalar(Math.max(k, .001)); });
    lm[1].material.color.set(healthy > .5 ? '#4b3320' : '#6e5436');
  };
  const extras = (box) => {
    box.innerHTML = `<button type="button" aria-pressed="false" id="soilToggle">Show eroded soil</button><label>Pull the layers apart<input type="range" min="0" max="1" step=".01" value="0" id="soilExplode"></label>`;
    const tog = $('#soilToggle', box);
    tog.addEventListener('click', () => { hTarget = hTarget ? 0 : 1; tog.setAttribute('aria-pressed', !hTarget); tog.textContent = hTarget ? 'Show eroded soil' : 'Show healthy soil'; });
    $('#soilExplode', box).addEventListener('input', (e) => { eTarget = +e.target.value; });
  };
  update(0, 1);
  return { g, update, hotspots, extras, cam: [14, 8, 21], target: [0, 1, 0], title: 'Soil profile', lead: 'A healthy soil is a living system built in layers. Compare it with an eroded soil to see what organic farming and reforestation are trying to protect.' };
}

/* ---------- reed bed ---------- */
function buildWetland() {
  const g = new THREE.Group();
  const clay = M('#7a5a3c');
  g.add(mesh(new THREE.BoxGeometry(16, .5, 7), clay, 0, -2, 0));
  g.add(mesh(new THREE.BoxGeometry(16, 3, .4), clay, 0, -.6, -3.3));
  g.add(mesh(new THREE.BoxGeometry(.4, 3, 7), clay, -7.8, -.6, 0));
  g.add(mesh(new THREE.BoxGeometry(.4, 3, 7), clay, 7.8, -.6, 0));
  // gravel, visible through the open front
  const gN = 1500;
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.17, 0), M('#ffffff'), gN);
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < gN; i++) {
    d.position.set(rnd(-7.5, 7.5), rnd(-1.65, -.15), rnd(-3, 3));
    d.rotation.set(rnd(0, 3), rnd(0, 3), 0); d.scale.setScalar(rnd(.7, 1.5)); d.updateMatrix();
    gravel.setMatrixAt(i, d.matrix);
    col.setHSL(.09, .1, rnd(.42, .68));
    gravel.setColorAt(i, col);
  }
  g.add(gravel);
  const waterMesh = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.1, 6.2), new THREE.MeshStandardMaterial({ color: '#5aa7b8', transparent: true, opacity: .36, roughness: .2 }));
  waterMesh.position.y = .35; g.add(waterMesh);
  // reeds and roots
  const reed = M('#6b9b3c'), reedD = M('#8f7a3c'), root = M('#ece1c6');
  for (let i = 0; i < 68; i++) {
    const x = rnd(-6.8, 6.8), z = rnd(-2.8, 2.9), h = rnd(2.2, 4);
    g.add(mesh(new THREE.CylinderGeometry(.018, .05, h, 5), reed, x, .8 + h / 2 - .3, z));
    if (i % 3 === 0) g.add(mesh(new THREE.CapsuleGeometry(.06, .34, 2, 6), reedD, x, .8 + h - .2, z));
    const k = tube([[x, .2, z], [x + rnd(-.25, .25), -.4, z + rnd(-.25, .25)], [x + rnd(-.4, .4), -1.1, z + rnd(-.3, .3)], [x + rnd(-.5, .5), -1.65, z + rnd(-.3, .3)]], .025, root);
    g.add(k);
  }
  // pipes
  const pipeMat = M('#4a4e50');
  const pipeIn = mesh(new THREE.CylinderGeometry(.34, .34, 2.4, 10), pipeMat, -9, .35, 0); pipeIn.rotation.z = Math.PI / 2; g.add(pipeIn);
  const pipeOut = mesh(new THREE.CylinderGeometry(.34, .34, 2.4, 10), pipeMat, 9, -.9, 0); pipeOut.rotation.z = Math.PI / 2; g.add(pipeOut);
  // water particles descend through the gravel
  const path = (u, s, v) => {
    const x = -10 + u * 20;
    let y;
    if (x < -7.5) y = .35; else if (x > 7.5) y = -.9; else { const k = (x + 7.5) / 15; y = .35 - 1.25 * k + Math.sin(k * 12 + s.a * 6) * .28; }
    const w = (x < -7.5 || x > 7.5) ? .18 : 2.8;
    v.set(x, y + (x > -7.5 && x < 7.5 ? s.b * .3 : s.b * .1), s.a * w);
  };
  const dirty = new THREE.Color('#7a4f22'), clean = new THREE.Color('#25b6da');
  const parts = stream(170, .085, path, (u, c) => c.copy(dirty).lerp(clean, clamp((u - .2) / .55)));
  g.add(parts.im);
  const hotspots = [
    { p: () => [-9.2, 1.1, 0], t: 'Dirty water enters', d: 'Runoff or sewage flows in, carrying mud, nitrate, phosphate and bacteria. The flow is kept slow so it spends days in the bed.' },
    { p: () => [-3, 3.4, 1.8], t: 'Reeds', d: 'They take up nutrients as they grow, slow the water, and shelter birds and insects. They are harvested so those nutrients leave the system.' },
    { p: () => [1.2, -.7, 3.2], t: 'Roots and microbes', d: 'Roots leak oxygen into the gravel, and bacteria form films on them. Some break down organic waste. Others turn nitrate into nitrogen gas.' },
    { p: () => [4.4, -1.2, 3.2], t: 'Gravel bed', d: 'Solids get trapped between the stones, and phosphate binds to the minerals. Beds fill up over time, so they need maintenance.' },
    { p: () => [-1, -2.45, 3.6], t: 'Clay liner', d: 'A natural seal that stops polluted water from reaching the groundwater before it has been treated.' },
    { p: () => [9.2, -.2, 0], t: 'Cleaner water leaves', d: 'Across restored wetlands, median removal was about 37% of nitrogen and 46% of phosphorus. Results vary from site to site.' },
  ];
  return { g, update: (t) => parts.update(t), hotspots, cam: [6, 7, 19], target: [0, -.2, 0], title: 'Reed bed wetland', lead: 'A natural water treatment system made from gravel, plants and bacteria. It runs on sunlight and uses no chemicals. The dots show water getting cleaner as it passes through.' };
}

/* ---------- river monitoring buoy ---------- */
function buildBuoy() {
  const g = new THREE.Group();
  const riverbed = mesh(new THREE.CylinderGeometry(8, 8, 1.2, 40), M('#6b5a3f'), 0, -7, 0);
  g.add(riverbed);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6.6, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#3fa8c6', transparent: true, opacity: .2, side: THREE.DoubleSide, roughness: .2, depthWrite: false }));
  side.position.y = -3.1; g.add(side);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, .05, 40), new THREE.MeshStandardMaterial({ color: '#2d98b9', transparent: true, opacity: .55, roughness: .1, depthWrite: false }));
  top.position.y = .2; g.add(top);
  const b = new THREE.Group(); g.add(b);
  const yellow = M('#f2b705'), dark = M('#2c3236'), steel = M('#9aa3a5');
  b.add(mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.6, 14), yellow, 0, .1, 0));
  b.add(mesh(new THREE.CylinderGeometry(.14, .2, 3.6, 8), steel, 0, 2.6, 0));
  const panel = mesh(new THREE.BoxGeometry(1.8, .08, 1.3), M('#1c3f6e', { roughness: .25 }), 0, 4.2, 0); panel.rotation.x = -.45; b.add(panel);
  b.add(mesh(new THREE.CylinderGeometry(.03, .03, 1.5, 5), dark, .55, 5, 0));
  const lamp = mesh(new THREE.IcosahedronGeometry(.16, 1), new THREE.MeshStandardMaterial({ color: '#ff5a36', emissive: '#ff5a36', emissiveIntensity: 1.2 }), -.5, 4.75, 0); b.add(lamp);
  // sensor cage below the waterline
  b.add(mesh(new THREE.CylinderGeometry(.12, .12, 2.6, 6), steel, 0, -1.9, 0));
  [-.55, .55].forEach((x) => [-.55, .55].forEach((z) => b.add(mesh(new THREE.CylinderGeometry(.04, .04, 1.5, 5), steel, x, -3, z))));
  [-2.3, -3.7].forEach((y) => { const r = mesh(new THREE.TorusGeometry(.78, .04, 6, 16), steel, 0, y, 0); r.rotation.x = Math.PI / 2; b.add(r); });
  const blue = M('#2679b5'), green = M('#3f9e58');
  b.add(mesh(new THREE.CapsuleGeometry(.17, .8, 3, 8), blue, -.28, -3, .12));
  b.add(mesh(new THREE.CapsuleGeometry(.17, .8, 3, 8), green, .28, -3, -.1));
  b.add(mesh(new THREE.CapsuleGeometry(.12, .6, 3, 8), M('#b84a2c'), 0, -3, -.4));
  // anchor line
  const chain = tube([[0, -3.7, 0], [1.1, -4.8, .6], [1.6, -5.8, .9], [2.1, -6.3, 1.2]], .035, dark);
  g.add(chain);
  g.add(mesh(new THREE.BoxGeometry(1.2, .55, 1.2), M('#4b4a46'), 2.2, -6.15, 1.3));
  // fish, plus mayfly larvae on the stones
  const fishMat = M('#c4d6db');
  const fish = [0, 1, 2, 3].map((i) => { const f = mesh(new THREE.IcosahedronGeometry(.3, 0).scale(.45, .65, 1.6), fishMat); g.add(f); return { f, r: 3.2 + i * .8, y: -1.6 - i * .85, p: i * 1.5, sp: .45 - i * .05 }; });
  for (let i = 0; i < 18; i++) g.add(mesh(new THREE.IcosahedronGeometry(rnd(.18, .55), 0), M('#8a8880'), rnd(-6, 6), -6.25, rnd(-6, 6)));
  const hotspots = [
    { p: () => [1.5, 4.4, 0], t: 'Solar panel', d: 'Keeps the batteries charged, so the buoy can run for months without a visit.' },
    { p: () => [.55, 5.9, 0], t: 'Radio antenna', d: 'Sends readings every few minutes. The team sees a pollution spike the day it happens, not at the next sampling trip.' },
    { p: () => [-.9, -3, .4], t: 'Oxygen sensor', d: 'Dissolved oxygen is the key measure of river health. Most fish struggle when it falls too low, usually after a pollution event or an algal bloom.' },
    { p: () => [.95, -3, -.1], t: 'Nitrate and cloudiness', d: 'A nitrate spike after rain points to farm runoff. Cloudy water points to erosion. Together they show which upstream method is working.' },
    { p: () => [2.3, -5.4, 1.3], t: 'Anchor', d: 'A long line lets the buoy rise and fall with the river without drifting away, including during floods.' },
  ];
  const update = (t) => {
    b.position.y = Math.sin(t * 1.1) * .13;
    b.rotation.z = Math.sin(t * .8) * .025;
    lamp.material.emissiveIntensity = (t % 2) < .3 ? 3 : .3;
    fish.forEach((o) => { const a = t * o.sp + o.p; o.f.position.set(Math.cos(a) * o.r, o.y, Math.sin(a) * o.r); o.f.rotation.y = -a; });
  };
  return { g, update, hotspots, cam: [15, 3, 23], target: [0, -.6, 0], title: 'River monitoring buoy', lead: 'Monitoring tells us whether our methods are working. This buoy watches the river all day and all night, then reports back by radio.' };
}

/* ---------- wet limestone scrubber ---------- */
function buildScrubber() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(17, .4, 11), M('#9aa39d'), -2, -4.45, 1));
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 8.5, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#a9d8d4', transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false, roughness: .2 }));
  shell.position.y = .3; g.add(shell);
  const steel = M('#6c7477'), rust = M('#7d776d');
  [4.55, -3.95].forEach((y) => { const r = mesh(new THREE.TorusGeometry(2.6, .1, 6, 28), steel, 0, y, 0); r.rotation.x = Math.PI / 2; g.add(r); });
  // slurry sump
  const sump = mesh(new THREE.CylinderGeometry(2.55, 2.55, 1.4, 28), M('#d6d0ba'), 0, -3.2, 0); g.add(sump);
  g.add(mesh(new THREE.CylinderGeometry(2.8, 2.8, .3, 28), steel, 0, -4.1, 0));
  // inlet duct
  const duct = mesh(new THREE.BoxGeometry(5, 1.8, 1.8), rust, -5, -1.3, 0); g.add(duct);
  // stack
  g.add(mesh(new THREE.CylinderGeometry(.85, 2.2, 1.6, 20), steel, 0, 5.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(.85, .85, 3.5, 20), M('#dce4e3'), 0, 7.8, 0));
  // spray bars
  const bars = [2.2, 1, -.1];
  bars.forEach((y) => {
    const a = mesh(new THREE.CylinderGeometry(.08, .08, 5, 8), steel, 0, y, 0); a.rotation.z = Math.PI / 2; g.add(a);
    for (let x = -2; x <= 2; x += .8) g.add(mesh(new THREE.ConeGeometry(.13, .22, 6), steel, x, y - .15, 0));
  });
  // mist catcher
  const mist = mesh(new THREE.CylinderGeometry(2.5, 2.5, .3, 28), M('#7ea3a2', { transparent: true, opacity: .7 }), 0, 3.6, 0); g.add(mist);
  // pump loop and gypsum
  g.add(tube([[2.6, -3.3, 0], [4, -3.4, 0], [4.2, 0, 0], [4, 2.2, 0], [2.6, 2.2, 0]], .13, M('#3c7fb0')));
  g.add(mesh(new THREE.BoxGeometry(1, 1.3, 1), M('#3c7fb0'), 4, -3.3, 0));
  g.add(tube([[-2.3, -3.4, 2], [-3, -3.8, 3], [-4, -3.8, 3.4]], .13, steel));
  const pile = mesh(new THREE.ConeGeometry(1.1, 1, 8), M('#f1eee2'), -5, -3.75, 3.6); g.add(pile);
  // gas: rises from the duct through the tower
  const gasPath = (u, s, v) => {
    if (u < .22) { const k = u / .22; v.set(-7.2 + k * 6, -1.3 + s.b * .55, s.a * .6); }
    else { const k = (u - .22) / .78; const y = -1.3 + k * 10.8; const r = y > 4.6 ? .6 : 2.1; const k2 = Math.min(1, k * 4); v.set((-1.2 + s.b * .4) * (1 - k2) + s.b * r * k2, y, s.a * r); }
  };
  const dirtyG = new THREE.Color('#403a30'), cleanG = new THREE.Color('#f5fbfa');
  const gas = stream(170, .13, gasPath, (u, c) => c.copy(dirtyG).lerp(cleanG, clamp((u - .3) / .32)));
  g.add(gas.im);
  // limestone droplets fall
  const dropPath = (u, s, v) => {
    const r = 2.2;
    v.set(s.a * r, 2 - u * 4.7, s.b * r * .9);
  };
  const dropCol = new THREE.Color('#e8e4d2');
  const drops = stream(190, .065, dropPath, (u, c) => c.copy(dropCol));
  g.add(drops.im);
  const hotspots = [
    { p: () => [-6.2, -.1, 1], t: 'Flue gas enters', d: 'Hot smoke from burning coal arrives carrying sulphur dioxide (SO₂), the gas that causes acid rain.' },
    { p: () => [2.5, 1, 1], t: 'Limestone spray', d: 'Nozzles spray a slurry of ground limestone in water. The gas rises through the falling droplets, so they mix well.' },
    { p: () => [0, -1.8, 2.6], t: 'The reaction', d: 'SO₂ dissolves in the droplets and reacts with calcium carbonate. With oxygen added, it forms solid calcium sulphate, known as gypsum.' },
    { p: () => [4.7, -3.3, 0], t: 'Pump loop', d: 'Slurry collects at the bottom and is pumped back up to the sprays, so the limestone gets used efficiently.' },
    { p: () => [-5, -2.9, 3.6], t: 'Gypsum', d: 'A by-product that can be made into plasterboard, so some of this waste becomes a useful material.' },
    { p: () => [1.2, 8, 0], t: 'Cleaner gas leaves', d: 'Most of the SO₂ is gone, and mostly water vapour is visible. Carbon dioxide still escapes, which is why switching to clean energy comes next.' },
  ];
  return { g, update: (t) => { gas.update(t); drops.update(t); }, hotspots, cam: [16, 6, 27], target: [-.8, 2.2, 0], title: 'Stack scrubber', lead: 'This cutaway shows how a power station traps sulphur before it reaches the sky. The dots show dark smoke turning clean as it rises through a limestone spray.' };
}

/* ---------- viewer ---------- */
export function initLab() {
  const canvas = $('#labCanvas');
  const wrap = canvas.parentElement;
  const pinsEl = $('#labPins');
  const tabs = $('#labTabs');
  const extra = $('#labExtra');
  const builders = [['Soil profile', buildSoil], ['Reed bed wetland', buildWetland], ['River buoy', buildBuoy], ['Stack scrubber', buildScrubber]];
  tabs.innerHTML = builders.map(([t], i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-i="${i}">${t}</button>`).join('');

  let renderer, scene, camera, controls, current = null, cache = {}, pins = [], running = false, last = 0;
  function ensure() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch { return false; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, .1, 200);
    scene.add(new THREE.HemisphereLight('#ffffff', '#6e7d6e', 1.7));
    const sun = new THREE.DirectionalLight('#fff4dd', 2.3);
    sun.position.set(10, 20, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    sun.shadow.bias = -.001;
    scene.add(sun);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = .08;
    controls.enablePan = false;
    controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.autoRotateSpeed = .7;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    controls.zoomToCursor = false;
    // leave wheel to page scroll unless ctrl is held, so the model doesn't trap scrolling
    canvas.addEventListener('wheel', (e) => { if (!e.ctrlKey) e.stopImmediatePropagation(); }, { capture: true });
    new ResizeObserver(size).observe(wrap);
    size();
    return true;
  }
  function size() {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  function detail(i) {
    pins.forEach((p, j) => p.el.classList.toggle('on', j === i));
    const h = current.hotspots[i];
    $('#labDetail').innerHTML = `<b>${h.t}</b><p>${h.d}</p>`;
  }
  function show(i) {
    if (!ensure()) { wrap.innerHTML = '<p style="padding:1rem">3D models need WebGL, which this browser has turned off.</p>'; return; }
    [...tabs.children].forEach((b, j) => b.setAttribute('aria-selected', j === i));
    if (current) scene.remove(current.g);
    current = cache[i] ||= builders[i][1]();
    scene.add(current.g);
    const fit = camera.aspect < 1 ? 1.5 : 1;
    camera.position.set(current.cam[0] * fit, current.cam[1] * fit, current.cam[2] * fit);
    controls.target.set(...current.target);
    controls.minDistance = 7;
    controls.maxDistance = 46;
    controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.update();
    $('#labTitle').textContent = current.title;
    $('#labLead').textContent = current.lead;
    extra.innerHTML = '';
    current.extras?.(extra);
    pinsEl.innerHTML = '';
    pins = current.hotspots.map((h, k) => {
      const el = document.createElement('button');
      el.className = 'lab-pin';
      el.type = 'button';
      el.textContent = k + 1;
      el.setAttribute('aria-label', h.t);
      el.addEventListener('click', () => detail(k));
      pinsEl.appendChild(el);
      return { el, h };
    });
    detail(0);
  }
  const v = new THREE.Vector3();
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const t = now / 1000, dt = Math.min(.1, t - last); last = t;
    controls.update();
    current.update?.(t, dt);
    renderer.render(scene, camera);
    const r = canvas.getBoundingClientRect();
    pins.forEach((p) => {
      v.set(...p.h.p());
      v.project(camera);
      const x = (v.x * .5 + .5) * r.width, y = (-v.y * .5 + .5) * r.height;
      p.el.style.transform = `translate(${x}px,${y}px)`;
    });
  }
  [...tabs.children].forEach((b) => b.addEventListener('click', () => show(+b.dataset.i)));
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      if (!current) show(0);
      if (!running && current) { running = true; last = performance.now() / 1000; requestAnimationFrame(loop); }
    } else running = false;
  }, { rootMargin: '10% 0px' }).observe(wrap);
}
