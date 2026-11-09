// The valley: one procedural 3D diorama whose every part responds to a state object.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- maths ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const backOut = (t) => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j;
  const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}
function fbm(x, y, o = 4) { let a = .5, s = 0; for (let k = 0; k < o; k++) { s += a * vnoise(x, y); x = x * 2.03 + 11; y = y * 2.03 + 7; a *= .5; } return s; }
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rnd();

/* ---------- terrain shape ---------- */
export const riverX = (z) => 6 * Math.sin(z * .055) + 3 * Math.sin(z * .13 + 1);
const SIZE = 120, HALF = 60, SEG = 190, GN = SEG + 1;
function profile(x, z) {
  const d = Math.abs(x - riverX(z));
  let h = 1.5 + Math.pow(Math.max(0, d - 9) / 48, 1.7) * 31;
  h += Math.pow(Math.max(0, -z - 16) / 44, 2) * 26 * sstep(0, 26, d + 6);
  return h;
}
function natural(x, z) {
  const d = Math.abs(x - riverX(z));
  return profile(x, z) + (fbm(x * .05 + 3, z * .05 + 9) - .47) * (1.2 + d * .26) + (fbm(x * .19, z * .19, 2) - .37) * (.15 + d * .035);
}
/* Flat building sites, cut gently into the hillside instead of leaving steep pits. */
const PADS = [
  { n: 'farm', x: 36, z: 33, r: 30, y: 3 },
  { n: 'town', x: -14, z: 10, r: 15, k: .8 },
  { n: 'factory', x: 17, z: -28, r: 17, k: .8 },
  { n: 'solar', x: 40, z: 5, r: 14, k: .8 },
  { n: 'landfill', x: -30, z: 39, r: 24, k: .8 },
  { n: 'wetland', x: 15, z: 7, r: 8.5, y: .55 },
];
PADS.forEach((p) => { p.y ??= natural(p.x, p.z) * p.k; });
const pad = (n) => PADS.find((p) => p.n === n);
const LF = pad('landfill');
export function terrainH(x, z) {
  const d = Math.abs(x - riverX(z));
  let h = natural(x, z);
  for (const p of PADS) h = lerp(p.y, h, sstep(p.r * .7, p.r * 1.3, Math.hypot(x - p.x, z - p.z)));
  // rubbish mound
  const ld = Math.hypot(x - LF.x, (z - LF.z) * 1.15);
  h += Math.exp(-(ld * ld) / 46) * 7;
  // the road gets a level bench, last so nothing can build over it
  h = lerp(profile(x, -8) + .05, h, sstep(1.8, 5, Math.abs(z + 8)));
  // river channel
  const w = 2.6 + sstep(-60, 60, z) * 1.6;
  return lerp(-1.3, h, sstep(w * .55, w * 2, d));
}
/* The visible ground is a triangle mesh, so anything standing on it must read this
   height rather than the smooth formula above, or it will sink or float. */
let HG = null;
function heightGrid() {
  if (HG) return HG;
  HG = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) HG[j * GN + i] = terrainH(-HALF + SIZE * i / SEG, -HALF + SIZE * j / SEG);
  return HG;
}
export function groundH(x, z) {
  const g = heightGrid();
  const fx = clamp((x + HALF) / SIZE * SEG, 0, SEG - 1e-4), fz = clamp((z + HALF) / SIZE * SEG, 0, SEG - 1e-4);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * GN + i;
  const q = g[k], r = g[k + 1], s = g[k + GN], t = g[k + GN + 1];
  return u + v <= 1 ? q + u * (r - q) + v * (s - q) : t + (1 - u) * (s - t) + (1 - v) * (r - t);
}
const slopeAt = (x, z) => Math.hypot(groundH(x + 1, z) - groundH(x - 1, z), groundH(x, z + 1) - groundH(x, z - 1)) / 2;

/* ---------- restoration sites: green spreads outward from each ---------- */
const SITES = [
  { k: 'forest', x: -36, z: 6, r: 52 },
  { k: 'corridor', x: -30, z: -26, r: 34 },
  { k: 'wetland', x: 13, z: 7, r: 25 },
  { k: 'water', x: 3, z: -24, r: 24 },
  { k: 'water', x: 2, z: 42, r: 26 },
  { k: 'air', x: 26, z: -30, r: 44 },
  { k: 'waste', x: -30, z: 39, r: 28 },
  { k: 'farm', x: 36, z: 33, r: 34 },
  { k: 'school', x: -14, z: 10, r: 19 },
  { k: 'final', x: 0, z: 0, r: 125 },
];

/* ---------- state ---------- */
export const ZERO = { forest: 0, corridor: 0, wetland: 0, pipe: 0, air: 0, waste: 0, farm: 0, school: 0, monitor: 0, final: 0, storm: 0 };
export const FULL = { forest: 1, corridor: 1, wetland: 1, pipe: 1, air: 1, waste: 1, farm: 1, school: 1, monitor: 1, final: 1, storm: 0 };
export function derive(s) {
  const water = clamp(s.pipe * .5 + s.wetland * .32 + s.farm * .12 + s.final * .06);
  const air = clamp(s.air * .82 + s.forest * .08 + s.final * .1);
  return { ...s, water, airClean: air };
}
export function scores(s0) {
  const s = derive(s0);
  return {
    air: 16 + 80 * s.airClean,
    water: 12 + 84 * s.water,
    soil: 18 + 34 * s.forest + 34 * s.farm + 8 * s.waste + 4 * s.final,
    forest: 9 + 56 * s.forest + 19 * s.corridor + 8 * s.farm + 6 * s.final,
    species: 7 + 22 * s.forest + 20 * s.corridor + 22 * s.wetland + 15 * s.farm + 6 * s.water + 6 * s.final,
  };
}

const C = (h) => new THREE.Color(h);
const matCache = {};
const M = (hex, o = {}) => {
  const key = hex + JSON.stringify(o);
  return (matCache[key] ||= new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: .92, metalness: 0, ...o }));
};
/* geometry helpers: everything merged must be non-indexed with the same attributes */
const flat = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (...gs) => mergeGeometries(gs.map(flat));
/* roughens a shape, keeping seams closed because the offset depends only on position */
function lump(g, a) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash(x * 13.1 + z * 7.3, y * 9.7 + x * 3.1) - .5) * a;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
/* darker at the bottom and lighter on top, which reads as soft shading on low-poly plants */
function paint(g, lo = .62, hi = 1.08) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = lerp(lo, hi, (p.getY(i) - min.y) / Math.max(.001, max.y - min.y));
    c.set([v, v, v], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function prism(w, h, d, peak = .5) { // a triangular roof, ridge along z, sitting on y = 0
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(-w / 2 + w * peak, h); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

export function createValley(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let dpr = Math.min(devicePixelRatio || 1, 1.75);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb3a372, .008);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 700);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x665533, 1.5);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-55, 90, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 240 });
  sun.shadow.bias = -.0006;
  sun.shadow.normalBias = .4;
  scene.add(hemi, sun);

  /* ---------- terrain ---------- */
  const uSites = { value: SITES.map((s) => new THREE.Vector4(s.x, s.z, s.r, 0)) };
  {
    const n = GN, pos = new Float32Array(n * n * 3), cD = new Float32Array(n * n * 3), cR = new Float32Array(n * n * 3), nz = new Float32Array(n * n);
    const idx = [];
    const G = heightGrid();
    const col = {
      dA: C('#a48c5c'), dB: C('#826d4e'), gully: C('#66523d'), dRock: C('#8b8478'), dFarm: C('#b39c62'), dWet: C('#8a7650'),
      dDump: C('#5e5a52'), dTown: C('#8d8676'), bed: C('#4a3e2d'),
      rA: C('#86b84e'), rB: C('#55993f'), rSteep: C('#3f8040'), rHigh: C('#6c8f58'), rRock: C('#a2a89a'), rFarm: C('#5c4730'),
      rWet: C('#3e8d58'), rDump: C('#93c655'), rTown: C('#8fb06c'), rBed: C('#5c6c52'), rBank: C('#3d9150'),
    };
    const a = new THREE.Color(), b = new THREE.Color();
    const inField = (x, z) => Math.max(Math.abs(x - 36) - 17, Math.abs(z - 33) - 17);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -HALF + SIZE * i / SEG, z = -HALF + SIZE * j / SEG, k = j * n + i;
      const h = G[k], sl = slopeAt(x, z), nn = fbm(x * .11, z * .11, 3);
      const d = Math.abs(x - riverX(z));
      pos.set([x, h, z], k * 3);
      nz[k] = fbm(x * .09 + 40, z * .09, 3) - .5 + (hash(i, j) - .5) * .25;
      a.copy(col.dA).lerp(col.dB, sstep(.3, .62, nn));
      b.copy(col.rA).lerp(col.rB, sstep(.32, .62, nn));
      if (sl > .55) { a.lerp(col.gully, sstep(.55, 1.15, sl)); b.lerp(col.rSteep, sstep(.55, 1.1, sl)); }
      if (h > 20) { a.lerp(col.dRock, sstep(20, 28, h)); b.lerp(col.rHigh, sstep(20, 26, h)); }
      if (h > 29) b.lerp(col.rRock, sstep(29, 36, h));
      const near = (p, t = .78) => 1 - sstep(p.r * (t - .1), p.r * t, Math.hypot(x - p.x, z - p.z));
      let m;
      const fm = 1 - sstep(-1, 1.5, inField(x, z));
      if (fm > 0) { a.lerp(col.dFarm, fm); b.lerp(col.rFarm, fm); }
      if ((m = near(pad('wetland')))) { a.lerp(col.dWet, m); b.lerp(col.rWet, m); }
      if ((m = near(LF, .85))) { a.lerp(col.dDump, m); b.lerp(col.rDump, m); }
      if ((m = near(pad('town')))) { a.lerp(col.dTown, m); b.lerp(col.rTown, m); }
      if (h < 1.05) { const q = 1 - sstep(-.4, 1.05, h); b.lerp(col.rBank, 1 - q); a.lerp(col.bed, q * .9); b.lerp(col.rBed, q); }
      else if (d < 8) b.lerp(col.rBank, (1 - sstep(4, 8, d)) * .75);
      const jit = (hash(i * 3.1, j * 1.7) - .5) * .05;
      cD.set([a.r + jit, a.g + jit, a.b + jit], k * 3);
      cR.set([b.r + jit, b.g + jit, b.b + jit], k * 3);
      if (i < SEG && j < SEG) { const q = k, r = k + 1, s = k + n, t = k + n + 1; idx.push(q, s, r, r, s, t); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aD', new THREE.BufferAttribute(cD, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(cR, 3));
    g.setAttribute('aN', new THREE.BufferAttribute(nz, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSites = uSites;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aD; attribute vec3 aR; attribute float aN; uniform vec4 uSites[${SITES.length}]; varying vec3 vT;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float rr = 0.;
          for (int i = 0; i < ${SITES.length}; i++) { vec4 s = uSites[i];
            if (s.w > .001) { float dd = distance(position.xz, s.xy) + aN * 12.; float R = s.z * s.w * 1.15;
              rr = max(rr, 1. - smoothstep(R - 5., R + .5, dd)); } }
          vT = mix(aD, aR, rr);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vT;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vT;');
    };
    const terrain = new THREE.Mesh(g, mat);
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    terrain.userData.skip = true;
    scene.add(terrain);
  }

  /* ---------- diorama walls: exposed soil strata, matching the terrain edge exactly ---------- */
  {
    const bands = [['#33261a', 0, -.7], ['#5d4730', -.7, -2.6], ['#94703f', -2.6, -5.2], ['#a8a08a', -5.2, -7.6], ['#6f6c63', -7.6, -10]];
    const pos = [], col = [], idx = [];
    const tmp = new THREE.Color();
    const edge = (fn) => {
      const start = pos.length / 3, N = SEG, R = bands.length * 2;
      for (let i = 0; i <= N; i++) {
        const [x, z] = fn(i / N);
        const top = groundH(x, z);
        const wob = (b) => (hash(i * .2 + b, b * 3.3) - .5) * .5;
        bands.forEach(([c, a, b], r) => {
          tmp.set(c);
          const yA = r === 0 ? top : Math.min(top - .05, Math.min(top, 1.2) + a + wob(r));
          const yB = r === bands.length - 1 ? -10 : Math.min(top - .05, Math.min(top, 1.2) + b + wob(r + 1));
          pos.push(x, yA, z, x, yB, z);
          col.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
        });
      }
      for (let i = 0; i < N; i++) for (let r = 0; r < R - 1; r++) {
        const a = start + i * R + r, b = a + 1, c = a + R, d = c + 1;
        idx.push(a, b, c, c, b, d);
      }
    };
    edge((t) => [lerp(-HALF, HALF, t), HALF]);
    edge((t) => [HALF, lerp(HALF, -HALF, t)]);
    edge((t) => [lerp(HALF, -HALF, t), -HALF]);
    edge((t) => [-HALF, lerp(-HALF, HALF, t)]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const walls = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 1 }));
    walls.userData.skip = true;
    scene.add(walls);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(SIZE, .5, SIZE), M('#44423c'));
    bottom.position.y = -10;
    bottom.userData.skip = true;
    scene.add(bottom);
  }

  /* ---------- water ---------- */
  const uWater = {
    uTime: { value: 0 }, uClean: { value: 0 }, uFogCol: { value: C('#b3a372') }, uFogD: { value: .008 }, uSun: { value: 0 },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: uWater,
    vertexShader: `varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vDepth=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `
      uniform float uTime,uClean,uFogD,uSun; uniform vec3 uFogCol; varying vec3 vW; varying float vDepth;
      float n(vec2 p){ return sin(p.x*1.3+uTime*.9)*.4 + sin(p.y*2.7-uTime*1.1+sin(p.x*.7)*2.)*.6 + sin((p.x-p.y)*.8+uTime*.6)*.4; }
      void main(){
        float front = mix(-85., 85., uClean);
        float cl = 1. - smoothstep(front-14., front+10., vW.z + sin(vW.x*.6)*2.);
        if(uClean>.995) cl = 1.;
        vec3 dirty = vec3(.25,.20,.09); vec3 scum = vec3(.33,.27,.11);
        vec3 clean = vec3(.05,.46,.62); vec3 glint = vec3(.72,.93,.96);
        float r = n(vW.xz*1.6);
        vec3 c = mix(mix(dirty,scum,smoothstep(.2,1.3,r)), mix(clean,glint,smoothstep(.9,1.35,r)*.8), cl);
        float f = 1.-exp(-uFogD*uFogD*vDepth*vDepth);
        gl_FragColor = vec4(mix(c,uFogCol,f),1.);
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.userData.skip = true;
  scene.add(water);
  {
    // the waterfall is exactly as wide as the river where it leaves the block
    let x0 = riverX(HALF), x1 = x0;
    while (groundH(x0 - .1, HALF) < 0) x0 -= .1;
    while (groundH(x1 + .1, HALF) < 0) x1 += .1;
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 10), waterMat);
    fall.position.set((x0 + x1) / 2, -5, HALF + .05);
    fall.userData.skip = true;
    scene.add(fall);
  }

  /* ---------- helper builders ---------- */
  const pops = [];
  const addPop = (o, k, a = 0, b = 1, invert = false) => { o.userData.s = o.scale.clone(); pops.push({ o, k, a, b, invert }); return o; };
  const mesh = (g, hex, x = 0, y = 0, z = 0, opt = {}) => {
    const m = new THREE.Mesh(g, opt.mat || M(hex, opt.m || {}));
    m.position.set(x, y, z);
    m.castShadow = opt.cast !== false;
    m.receiveShadow = true;
    return m;
  };
  const box = (w, h, d, hex, x, y, z, opt) => mesh(new THREE.BoxGeometry(w, h, d), hex, x, y + h / 2, z, opt);
  const cyl = (r1, r2, h, hex, x, y, z, seg = 10, opt) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg), hex, x, y + h / 2, z, opt);
  const group = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); if (kids.length) g.add(...kids); scene.add(g); return g; };
  /* land the map keeps clear of trees */
  const occ = [];
  const claim = (x0, x1, z0, z1) => occ.push([x0, x1, z0, z1]);
  const isFree = (x, z, m = .5) => !occ.some(([a, b, c, d]) => x > a - m && x < b + m && z > c - m && z < d + m);
  /* A foundation: top sits just above the highest ground in the footprint, bottom below the
     lowest, so a building neither sinks into a slope nor floats over it. */
  function footing(x, z, hw, hd, hex = '#8b8578') {
    let lo = Infinity, hi = -Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const h = groundH(x + i / 2 * hw, z + j / 2 * hd);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    const top = hi + .08, bottom = lo - .5;
    claim(x - hw, x + hw, z - hd, z + hd);
    const m = box(hw * 2, top - bottom, hd * 2, hex, 0, bottom - top, 0);
    m.userData.footing = true;
    return { y: top, m };
  }
  /* A ribbon draped over the ground, with sides, for roads and ditches. */
  function drape(pts, width, hex, lift, floorY = -Infinity) {
    const pos = [], idx = [];
    const n = pts.length;
    pts.forEach(([x, z], i) => {
      const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(n - 1, i + 1)];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * width, nz = dx / L * width;
      let y = floorY;
      for (const t of [-1, -.5, 0, .5, 1]) y = Math.max(y, groundH(x + nx * t, z + nz * t));
      y += lift;
      pos.push(x - nx, y - .5, z - nz, x - nx, y, z - nz, x + nx, y, z + nz, x + nx, y - .5, z + nz);
      if (i < n - 1) { const a = i * 4; idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5, a + 1, a + 5, a + 2, a + 2, a + 5, a + 6, a + 2, a + 6, a + 3, a + 3, a + 6, a + 7); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M(hex, { side: THREE.DoubleSide }));
    m.receiveShadow = true;
    m.userData.skip = true;
    scene.add(m);
    return m;
  }
  const glass = '#2e4a58';
  function house(x, z, turn, wall, roof) {
    const w = 2.5, d = 2.1, f = footing(x, z, Math.max(w, d) / 2 + .15, Math.max(w, d) / 2 + .15, '#7c7668');
    const g = group(x, f.y, z, f.m, box(w, 1.5, d, wall, 0, 0, 0));
    const r = mesh(prism(d + .35, .95, w + .3), roof, 0, 1.5, 0);
    r.rotation.y = Math.PI / 2;
    g.add(r,
      box(.42, .85, .05, '#5b3a26', .35, 0, d / 2 + .02),
      box(.42, .42, .05, glass, -.6, .62, d / 2 + .02),
      box(.05, .42, .42, glass, w / 2 + .02, .62, 0),
      box(.05, .42, .42, glass, -w / 2 - .02, .62, 0),
      box(.26, .85, .26, '#6e5a4a', -.65, 1.5, -.3));
    g.rotation.y = turn * Math.PI / 2;
    return g;
  }

  /* ---------- road, bridge, town ---------- */
  {
    const pts = [];
    for (let i = 0; i <= SEG; i++) pts.push([lerp(-HALF, HALF, i / SEG), -8]);
    drape(pts, 1.2, '#55524b', .14, 1.15);
    const rx = riverX(-8), roadY = 1.29;
    const deck = box(9, .22, 2.8, '#7c776c', rx, roadY - .2, -8); deck.userData.skip = true; scene.add(deck);
    for (const dx of [-3, 0, 3]) { const p = box(.5, 2.8, 2.4, '#6b675d', rx + dx, -1.6, -8); p.userData.skip = true; scene.add(p); }
    for (const s of [-1, 1]) { const q = box(9, .3, .1, '#8f8a7e', rx, roadY + .02, -8 + s * 1.36); q.userData.skip = true; scene.add(q); }
    claim(-60, 60, -11, -5);
    [[-9, 5, 0, '#c7bfae', '#7a4a3a'], [-6, 9, 1, '#b9b09d', '#6e5a4a'], [-13, 4, 0, '#d0c7b5', '#874f3c'], [-17.5, 5, 1, '#bfb6a4', '#74503f'], [-7, 13.5, 2, '#cabfac', '#6e5a4a'], [-24, 6.5, 1, '#c7bfae', '#874f3c'], [-10, 16.5, 3, '#b5ad9b', '#7a4a3a']]
      .forEach((a) => house(...a));
  }

  /* ---------- factory ---------- */
  const F = pad('factory');
  const stacks = [[11, -38.8], [14.5, -38.8], [18, -38.8]];
  {
    const f = footing(F.x, F.z - 1.5, 10, 7.5);
    const g = group(F.x, f.y, F.z - 1.5, f.m, box(16, 4.6, 8, '#7a7368', 0, 0, 2), box(7, 6.5, 5, '#676157', 3.5, 0, -4.2), box(6, 3.4, 4.4, '#857d70', -6, 0, -4.4));
    for (let i = 0; i < 6; i++) g.add(mesh(prism(2.66, 1.05, 8, .9), '#5a554c', -6.65 + i * 2.66, 4.6, 2));
    for (let i = 0; i < 7; i++) g.add(box(1.3, 1.5, .06, glass, -6.3 + i * 2.1, 1.7, 6.04));
    g.add(box(2.4, 2.1, .08, '#5c6a70', 0, 0, 6.06), box(.06, 1.2, 1.2, glass, 8.04, 1.8, 3), box(.06, 1.2, 1.2, glass, 8.04, 1.8, .5));
    // silos against the back wall
    g.add(cyl(.9, .9, 5.4, '#9a9488', 8, 0, -5), cyl(.9, .9, 5.4, '#8f897d', 8, 0, -2.6), mesh(new THREE.ConeGeometry(.9, .55, 10), '#6d675d', 8, 5.68, -5), mesh(new THREE.ConeGeometry(.9, .55, 10), '#6d675d', 8, 5.68, -2.6));
    stacks.forEach(([x, z], i) => {
      const sf = footing(x, z, 1.6, 1.6);
      group(x, sf.y, z, sf.m, cyl(1.0, 1.45, 15.6, '#7d776d', 0, 0, 0, 14), cyl(1.06, 1.06, .8, '#b23a22', 0, 12.8, 0, 14), cyl(1.05, 1.05, .8, '#f0ebe0', 0, 13.8, 0, 14), cyl(1.5, 1.6, .8, '#6a655b', 0, 0, 0, 14));
      // scrubbers stand behind each stack, clear of the walls, joined by a duct
      const tx = x, tz = z - 3.4, tf = footing(tx, tz, 1.25, 1.25);
      const t = group(tx, tf.y, tz, tf.m, cyl(1.05, 1.05, 6.4, '#2a9d8f', 0, 0, 0, 12), mesh(new THREE.ConeGeometry(1.05, .6, 12), '#237f75', 0, 6.7, 0), cyl(.24, .24, 1.6, '#cfe9e3', 0, 6.8, 0, 8));
      const link = mesh(new THREE.CylinderGeometry(.2, .2, 2.4, 8), '#237f75', 0, 5.2, 1.5); link.rotation.x = Math.PI / 2; t.add(link);
      addPop(t, 'air', .05 + i * .1, .35 + i * .1);
    });
    // roof solar sits along the sawtooth slopes
    for (let i = 0; i < 6; i++) {
      const p = box(2.2, .1, 7, '#1c3f6e', -6.45 + i * 2.66, 5.2, 2, { m: { roughness: .35, metalness: .3 } });
      p.rotation.z = .42;
      g.add(p);
      addPop(p, 'air', .4 + i * .03, .55 + i * .03);
    }
    // outfall pipe follows the ground down to the river
    const pz = F.z + 3, rx = riverX(pz), wall = F.x - 7.9, pts = [];
    for (let x = wall; x > rx + 1.2; x -= 1.4) pts.push(new THREE.Vector3(x, Math.max(groundH(x, pz), .2) + .62, pz));
    pts.push(new THREE.Vector3(rx + .6, .62, pz));
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .46, 8), M('#4a4640'));
    pipe.castShadow = true; pipe.userData.skip = true;
    scene.add(pipe);
    const collar = cyl(.62, .62, .6, '#6b675d', 0, 0, 0, 10); collar.rotation.z = Math.PI / 2; collar.position.set(rx + .9, .62, pz); collar.userData.skip = true; scene.add(collar);
    claim(rx, wall, pz - 1, pz + 1);
    // treatment works (pipe)
    const tz = F.z + 10.2;
    [-6, -1.6, 2.8].forEach((dx, i) => {
      const x = F.x + dx, ft = footing(x, tz, 2.1, 2.1, '#a8a496');
      const t = group(x, ft.y, tz, ft.m, cyl(1.9, 1.9, 1.05, '#b9b6a8', 0, 0, 0, 18), cyl(1.68, 1.68, .05, '#3ca6c4', 0, 1.03, 0, 18, { cast: false }), box(3.2, .12, .2, '#6e6a5e', 0, 1.14, 0));
      addPop(t, 'pipe', .05 + i * .12, .35 + i * .12);
    });
  }
  /* solar field */
  {
    const S = pad('solar');
    claim(S.x - 8.4, S.x + 8.4, S.z - 4, S.z + 4);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const x = S.x - 7 + c * 2.8, z = S.z - 2.6 + r * 2.6, y = groundH(x, z);
      const g = new THREE.Group();
      g.position.set(x, y - .1, z);
      const p = box(2.5, .08, 1.7, '#1c3f6e', 0, .78, 0, { m: { roughness: .3, metalness: .3 } });
      p.rotation.x = .5;
      g.add(p, cyl(.07, .09, .9, '#62625c', 0, 0, 0, 6));
      scene.add(g);
      addPop(g, 'air', .35 + (r * 6 + c) * .016, .5 + (r * 6 + c) * .016);
    }
  }
  /* turbines */
  const blades = [];
  const bladeG = new THREE.CylinderGeometry(.03, .17, 4.7, 4).translate(0, 2.45, 0).scale(1, 1, .45);
  [[50, -46], [47, -33], [53, -20], [51, -12], [55, 18]].forEach(([x, z], i) => {
    const y = groundH(x, z);
    const rotor = new THREE.Group();
    rotor.position.set(0, 9.4, .62);
    for (let b = 0; b < 3; b++) {
      const bl = mesh(bladeG, '#f3f5f1');
      bl.rotation.z = b * 2.094; rotor.add(bl);
    }
    rotor.add(mesh(new THREE.ConeGeometry(.22, .5, 8).rotateX(Math.PI / 2), '#e5e8e2', 0, 0, .1));
    const g = group(x, y - .4, z, cyl(.13, .34, 9.4, '#f0f2ee', 0, 0, 0, 10), box(.42, .42, 1.1, '#e0e3de', 0, 9.2, .1), rotor);
    g.rotation.y = -.3 + i * .05;
    blades.push({ rotor, k: i });
    addPop(g, 'air', .45 + i * .08, .7 + i * .06);
  });

  /* ---------- wetland ---------- */
  const W = pad('wetland');
  const wetWater = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.ShaderMaterial({
    uniforms: uWater,
    vertexShader: waterMat.vertexShader,
    fragmentShader: waterMat.fragmentShader.replace('if(uClean>.995) cl = 1.;', 'cl = 1.;'),
  }));
  wetWater.rotation.x = -Math.PI / 2;
  wetWater.position.set(W.x, W.y + .12, W.z);
  wetWater.scale.set(7, 6, 1);
  wetWater.userData.skip = true;
  scene.add(wetWater);
  addPop(wetWater, 'wetland', .02, .3);
  claim(W.x - 8.6, W.x + 8.6, W.z - 8, W.z + 8);
  const nR = 300, reedPos = [];
  for (let i = 0; i < nR; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 7.2;
    const x = W.x + Math.cos(a) * r * 1.05, z = W.z + Math.sin(a) * r * .9;
    if (Math.hypot(x - W.x - 1, z - W.z) < 2.6 && rnd() < .8) { reedPos.push(null); continue; }
    reedPos.push({ x, y: groundH(x, z) - .1, z, s: rr(.75, 1.4), t: rr(.2, .75), r: rnd() * 6 });
  }

  /* ---------- plants share one material, so wind moves them as a whole ---------- */
  const uWind = { value: 0 };
  const swayMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: .92, vertexColors: true });
  swayMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 iP = instanceMatrix[3].xz;
          float bend = max(transformed.y, 0.) * max(transformed.y, 0.) * .012;
          transformed.x += bend * (sin(uWind * 1.3 + iP.x * .35 + iP.y * .2) + .5 * sin(uWind * 2.9 + iP.y * .7));
          transformed.z += bend * .6 * sin(uWind * 1.05 + iP.y * .4);
        #endif`);
  };
  const reedG = paint(merge(
    new THREE.CylinderGeometry(.018, .05, 1.5, 4).translate(0, .6, 0),
    new THREE.CylinderGeometry(.055, .055, .3, 5).translate(0, 1.32, 0),
    new THREE.ConeGeometry(.05, .75, 3).translate(.05, .42, 0).rotateZ(-.28),
    new THREE.ConeGeometry(.05, .65, 3).translate(-.05, .38, .03).rotateZ(.3),
  ), .7, 1);
  const reedM = new THREE.InstancedMesh(reedG, swayMat, nR);
  reedPos.forEach((r, i) => { reedM.setColorAt(i, C(['#a6d152', '#86c04a', '#b8c95a'][i % 3])); });
  reedM.castShadow = true; reedM.frustumCulled = false; scene.add(reedM);
  /* herons wade in the shallows */
  [[W.x + 4.6, W.z - 3.2, .4], [W.x - 4, W.z + 3.4, 2.4], [W.x + 1.5, W.z + 4.2, 1.2]].forEach(([x, z, r], i) => {
    const neck = cyl(.045, .07, .85, '#c9d2d6', 0, 1.02, .16, 5);
    neck.rotation.x = .28;
    const bill = mesh(new THREE.ConeGeometry(.045, .42, 4), '#d9a23c', 0, 1.9, .55);
    bill.rotation.x = Math.PI / 2;
    const g = group(x, groundH(x, z) - .02, z,
      cyl(.022, .022, .85, '#6e6a58', -.07, 0, 0, 4), cyl(.022, .022, .85, '#6e6a58', .07, 0, 0, 4),
      mesh(new THREE.IcosahedronGeometry(.27, 1).scale(.72, .8, 1.4), '#8fa1ab', 0, 1, 0),
      neck, mesh(new THREE.IcosahedronGeometry(.11, 1), '#e8edee', 0, 1.88, .3), bill);
    g.rotation.y = r;
    addPop(g, 'wetland', .55 + i * .08, .75 + i * .08);
  });

  /* ---------- the green bridge is draped over the land, so its ramps meet the ground ---------- */
  const OV = { x: -30, z: -8, hw: 3.8, top: profile(-30, -8) + .05 + 3.5 };
  const bridgeTop = (x, z) => {
    const g = groundH(x, z), t = 1 - sstep(3, 10.5, Math.abs(z - OV.z));
    return Math.max(lerp(g, OV.top, t), g) + .07;
  };
  const onBridge = (x, z) => Math.abs(x - OV.x) < OV.hw && Math.abs(z - OV.z) < 10.5;
  {
    const NX = 8, NZ = 42, top = [], sides = [], topI = [], sideI = [];
    const gy = groundH(OV.x, OV.z);
    const zAt = (j) => lerp(OV.z - 11, OV.z + 11, j / NZ), xAt = (i) => lerp(OV.x - OV.hw, OV.x + OV.hw, i / NX);
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      top.push(xAt(i) - OV.x, bridgeTop(xAt(i), zAt(j)) - gy, zAt(j) - OV.z);
      if (i < NX && j < NZ) { const k = j * (NX + 1) + i, n = NX + 1; topI.push(k, k + n, k + 1, k + 1, k + n, k + n + 1); }
    }
    // side walls, open underneath across the road
    [-1, 1].forEach((s) => {
      const start = sides.length / 3;
      for (let j = 0; j <= NZ; j++) {
        const x = OV.x + s * OV.hw, z = zAt(j), t = bridgeTop(x, z);
        const open = Math.abs(z - OV.z) < 2.6;
        const under = open ? t - 1 : groundH(x, z) - .4;
        sides.push(s * OV.hw, t - gy, z - OV.z, s * OV.hw, under - gy, z - OV.z);
        if (j < NZ) { const a = start + j * 2; sideI.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      }
    });
    const gTop = new THREE.BufferGeometry();
    gTop.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); gTop.setIndex(topI); gTop.computeVertexNormals();
    const gSide = new THREE.BufferGeometry();
    gSide.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3)); gSide.setIndex(sideI); gSide.computeVertexNormals();
    const topM = new THREE.Mesh(gTop, M('#6ea34c', { side: THREE.DoubleSide })); topM.receiveShadow = true; topM.castShadow = true; topM.userData.skip = true;
    const sideM = new THREE.Mesh(gSide, M('#5f8a45', { side: THREE.DoubleSide })); sideM.castShadow = true; sideM.userData.skip = true;
    const deckY = OV.top - gy;
    const under = box(OV.hw * 2, .9, 5.6, '#8d8a7d', 0, deckY - .9, 0); under.userData.skip = true;
    const wallA = box(OV.hw * 2, deckY + .4, .5, '#7c7a6e', 0, -.4, -2.85), wallB = box(OV.hw * 2, deckY + .4, .5, '#7c7a6e', 0, -.4, 2.85);
    wallA.userData.skip = wallB.userData.skip = true;
    const g = group(OV.x, gy, OV.z, topM, sideM, under, wallA, wallB);
    for (let i = 0; i < 7; i++) {
      const x = OV.x + (i % 2 ? -3.1 : 3.1) + rr(-.2, .2), z = OV.z + (i - 3) * 1.9;
      const b = mesh(lump(new THREE.IcosahedronGeometry(.56, 1).scale(1, .82, 1), .14), '#5fb048', x - OV.x, bridgeTop(x, z) - gy + .34, z - OV.z);
      b.userData.skip = true;
      g.add(b);
    }
    addPop(g, 'corridor', .3, .62);
    claim(OV.x - OV.hw - .5, OV.x + OV.hw + .5, OV.z - 12, OV.z + 12);
    // the deer trail
    claim(OV.x - 3.6, OV.x + 3.6, -31, 15);
  }

  /* ---------- deer: bodies face +z, legs swing from the hip ---------- */
  const deerBody = merge(
    lump(new THREE.IcosahedronGeometry(.3, 1).scale(.82, .85, 1.75), .05).translate(0, .78, 0),
    new THREE.CylinderGeometry(.09, .15, .52, 6).rotateX(.55).translate(0, 1.08, .42),
    new THREE.IcosahedronGeometry(.13, 1).scale(.9, .9, 1.35).translate(0, 1.32, .58),
    new THREE.ConeGeometry(.06, .16, 5).rotateX(Math.PI / 2).translate(0, 1.29, .78),
    new THREE.ConeGeometry(.05, .17, 4).rotateZ(-.75).translate(.13, 1.46, .52),
    new THREE.ConeGeometry(.05, .17, 4).rotateZ(.75).translate(-.13, 1.46, .52),
    new THREE.ConeGeometry(.05, .17, 4).rotateX(-2.2).translate(0, .94, -.56),
  );
  const nDeer = 6;
  const deerM = new THREE.InstancedMesh(deerBody, M('#ffffff'), nDeer);
  const LEGH = .62;
  const legM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045, .03, LEGH, 5).translate(0, -LEGH / 2, 0), M('#6b4a2c'), nDeer * 4);
  const antlerG = merge(
    new THREE.CylinderGeometry(.012, .022, .34, 4).rotateZ(-.45).translate(.12, 1.58, .5),
    new THREE.CylinderGeometry(.012, .022, .34, 4).rotateZ(.45).translate(-.12, 1.58, .5),
    new THREE.CylinderGeometry(.008, .016, .18, 4).rotateX(.7).translate(.17, 1.62, .58),
    new THREE.CylinderGeometry(.008, .016, .18, 4).rotateX(.7).translate(-.17, 1.62, .58),
  );
  const antM = new THREE.InstancedMesh(antlerG, M('#cdb78e'), 1);
  [deerM, legM, antM].forEach((m) => { m.castShadow = true; m.frustumCulled = false; scene.add(m); });
  for (let i = 0; i < nDeer; i++) deerM.setColorAt(i, C(['#a2703f', '#b07c47', '#94663a'][i % 3]));
  const deerSize = [1.08, 1, .95, .7, 1, .66];
  const hips = [[.15, .34], [-.15, .34], [.15, -.34], [-.15, -.34]];
  const deerPath = (u) => { // a closed loop over the bridge, so they never have to reverse
    const a = u * Math.PI * 2;
    return [OV.x + Math.sin(a) * 1.9, -9 + Math.cos(a) * 21];
  };
  const walkH = (x, z) => (onBridge(x, z) ? bridgeTop(x, z) : groundH(x, z));

  /* ---------- landfill ---------- */
  const L = LF;
  const nTrash = 300;
  const trash = [];
  const trashCols = ['#c7c1b0', '#3f6db3', '#c9472f', '#d9b23c', '#e6e3da', '#2f3030', '#4c9a88'];
  for (let i = 0; i < nTrash; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 10;
    const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r * .9;
    trash.push({ x, y: groundH(x, z) + .1, z, s: rr(.22, .62), rot: rnd() * 6.28, t: rnd() });
  }
  const trashM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .55, .8), M('#ffffff'), nTrash);
  trash.forEach((t, i) => trashM.setColorAt(i, C(trashCols[i % trashCols.length])));
  trashM.castShadow = true; trashM.frustumCulled = false; scene.add(trashM);
  claim(L.x - 12, L.x + 12, L.z - 11, L.z + 11);
  {
    const sx = L.x + 13, sz = L.z + 7;
    const f = footing(sx, sz, 3.4, 2.4);
    const shed = group(sx, f.y, sz, f.m, box(6.2, 2.6, 4.2, '#2f7fb3', 0, 0, 0), box(6.6, .24, 4.6, '#e9eee9', 0, 2.6, 0), box(2.2, 1.9, .06, '#22506e', -1, 0, 2.12), box(1, .7, .06, glass, 1.6, 1.2, 2.12));
    addPop(shed, 'waste', .3, .55);
    const bf = footing(sx, sz + 3.5, 3.6, .85, '#9c9585');
    addPop(group(sx, bf.y, sz + 3.5, bf.m), 'waste', .4, .55);
    ['#2f7fb3', '#d9b23c', '#3c8a3f', '#b84a2c'].forEach((c, i) => {
      addPop(group(sx - 2.55 + i * 1.7, bf.y, sz + 3.5, box(1.2, 1.05, 1.2, c, 0, 0, 0), box(1.28, .1, 1.28, '#2a2e2c', 0, 1.05, 0)), 'waste', .45 + i * .04, .6 + i * .04);
    });
    for (let i = 0; i < 3; i++) {
      const x = sx - 2.6 + i * 3, z = sz - 4.8, hp = mesh(lump(new THREE.IcosahedronGeometry(1, 1).scale(1.25, .62, .9), .12), '#54402a', x, groundH(x, z) + .28, z);
      addPop(hp, 'waste', .35 + i * .06, .6 + i * .06);
    }
    claim(sx - 4.4, sx + 4, sz - 6, sz - 3.6);
  }

  /* ---------- farm ---------- */
  const FM = { x0: 19.5, x1: 53, z0: 16.5, z1: 49.5 };
  const HEDGES = [25.8, 36.2, 46.6];
  claim(FM.x0 - .4, FM.x1 + .4, FM.z0 - .4, FM.z1 + .4);
  const bandCols = ['#74a83a', '#d9b43c', '#9a7ccc', '#3f8e3a', '#e4cd63', '#c9785c'].map(C);
  const crops = [];
  for (let x = FM.x0; x < FM.x1; x += .98) for (let z = FM.z0; z < FM.z1; z += .98) {
    if (HEDGES.some((h) => Math.abs(x - h) < .7)) continue;
    const b = Math.floor((x - FM.x0) / (FM.x1 - FM.x0) * 6);
    const cx = x + rr(-.08, .08), cz = z + rr(-.08, .08);
    crops.push({ x: cx, z: cz, y: groundH(cx, cz) - .03, b, j: rr(.85, 1.15), r: rnd() * 6, t: Math.hypot(x - 36, z - 33) / 26 * .75 + rnd() * .1 });
  }
  const cropG = paint(merge(
    new THREE.ConeGeometry(.2, 1, 4).translate(0, .5, 0),
    new THREE.ConeGeometry(.16, .86, 4).translate(.2, .43, .05).rotateZ(-.2),
    new THREE.ConeGeometry(.16, .82, 4).translate(-.17, .41, .12).rotateZ(.22),
    new THREE.ConeGeometry(.15, .78, 4).translate(.02, .39, -.2).rotateX(-.2),
  ), .55, 1.1);
  const cropM = new THREE.InstancedMesh(cropG, swayMat, crops.length);
  cropM.castShadow = true; cropM.frustumCulled = false; scene.add(cropM);
  const monoC = C('#bfa84b'), _c0 = new THREE.Color();
  crops.forEach((c, i) => cropM.setColorAt(i, _c0.copy(monoC)));
  // a recognisable tractor: forward is +z
  const tractor = group(0, 0, 0,
    box(1.1, .7, 1.7, '#c0392b', 0, .62, .35),
    box(1.2, .22, 1.2, '#8f2a20', 0, .55, -.7),
    box(1.05, .42, 1.05, '#c0392b', 0, .78, -.65),
    box(1, .64, 1, '#bfe0e6', 0, 1.2, -.65),
    box(1.14, .08, 1.14, '#8f2a20', 0, 1.84, -.65),
    cyl(.07, .07, .55, '#303030', .3, 1.3, .7, 6),
  );
  const wheel = (x, z, r, w) => { const m = mesh(new THREE.CylinderGeometry(r, r, w, 14), '#232323', x, r, z); m.rotation.z = Math.PI / 2; tractor.add(m); const hub = mesh(new THREE.CylinderGeometry(r * .5, r * .5, w + .03, 10), '#d9b23c', x, r, z); hub.rotation.z = Math.PI / 2; tractor.add(hub); };
  wheel(.82, -.75, .62, .38); wheel(-.82, -.75, .62, .38); wheel(.68, .95, .34, .26); wheel(-.68, .95, .34, .26);
  const boom = box(4.2, .08, .16, '#e4e4dc', 0, 1.1, -1.95);
  const boomTank = cyl(.42, .42, .9, '#e8e6db', 0, .75, -1.75, 10);
  boomTank.rotation.z = Math.PI / 2;
  tractor.add(boom, boomTank);
  tractor.traverse((o) => { o.userData.skip = true; });
  addPop(boomTank, 'farm', .1, .3, true);
  addPop(boom, 'farm', .1, .3, true);
  {
    // chemical store by the field gate
    for (let i = 0; i < 8; i++) {
      const x = 53.4 + (i % 4) * .85, z = 13.2 - (i > 3 ? .85 : 0);
      addPop(group(x, groundH(x, z) - .04, z, cyl(.34, .34, .92, '#2f62a8', 0, 0, 0, 10), cyl(.35, .35, .06, '#1f4476', 0, .92, 0, 10)), 'farm', .05 + i * .02, .2 + i * .02, true);
    }
    for (let i = 0; i < 6; i++) {
      const x = 54.6 - (i % 3) * 1.3, z = 43 + Math.floor(i / 3) * 1.4, y = groundH(x, z);
      addPop(group(x, y - .05, z, box(.72, .6, .72, '#e9dfc7', 0, .22, 0), box(.84, .08, .84, '#b98a3d', 0, .82, 0), cyl(.04, .04, .24, '#6b5a3a', .26, 0, .26, 4), cyl(.04, .04, .24, '#6b5a3a', -.26, 0, -.26, 4), cyl(.04, .04, .24, '#6b5a3a', .26, 0, -.26, 4), cyl(.04, .04, .24, '#6b5a3a', -.26, 0, .26, 4)), 'farm', .55 + i * .03, .72 + i * .03);
    }
    [[20, 52], [23.2, 52.4]].forEach(([x, z], i) => addPop(mesh(lump(new THREE.IcosahedronGeometry(1, 1).scale(1.5, .72, 1), .12), '#4a3421', x, groundH(x, z) + .3, z), 'farm', .3 + i * .1, .55 + i * .1));
    claim(52.8, 56.6, 11.8, 13.8);
    claim(19, 25, 50.6, 53.6);
    claim(51.6, 55.4, 42.4, 46.4);
  }

  /* ---------- school ---------- */
  {
    const sx = -17, sz = 12.5, f = footing(sx - .4, sz + .7, 5.3, 3.9, '#a39a86');
    const g = group(sx, f.y, sz, f.m);
    f.m.position.x = -.4; f.m.position.z = .7;
    g.add(box(8, 2.6, 3.4, '#f2d5a0', 0, 0, -1), box(3.4, 2.6, 3.4, '#f2d5a0', -2.4, 0, 2.2));
    const r1 = mesh(prism(3.9, 1, 8.5), '#b84a2c', 0, 2.6, -1); r1.rotation.y = Math.PI / 2; g.add(r1);
    g.add(mesh(prism(3.9, 1, 3.9), '#a63f24', -2.4, 2.6, 2.2));
    for (let i = 0; i < 4; i++) g.add(box(.85, 1, .05, glass, .55 + i * 1, 1.05, .72));
    for (let i = 0; i < 2; i++) g.add(box(.05, 1, .85, glass, -.68, 1.05, 1.45 + i * 1.3));
    g.add(box(1.1, 1.7, .06, '#5b3a26', -2.4, 0, 3.92), box(.9, .12, .06, '#d9b23c', -2.4, 1.9, 3.92));
    g.add(cyl(.05, .06, 5.2, '#dcdcd4', 4.6, 0, 2.6, 6), box(1.1, .68, .04, '#2a9d8f', 5.16, 4.4, 2.6));
    addPop(g, 'school', .05, .35);
    // greenhouse and garden, each set on the ground where it stands
    const hx = sx + 6.6, hz = sz + 7.2, hf = footing(hx, hz, 1.7, 1.2, '#a39a86');
    const roofG = mesh(prism(2.1, .75, 3.05), '#bfe6df', 0, 1.2, 0, { m: { transparent: true, opacity: .6 } });
    roofG.rotation.y = Math.PI / 2;
    const gh = group(hx, hf.y, hz, hf.m, box(3, 1.2, 2, '#c8ece5', 0, 0, 0, { m: { transparent: true, opacity: .55 } }), roofG);
    addPop(gh, 'school', .3, .5);
    // the garden is a level terrace, so every bed sits flat
    const tf = footing(sx + 2.5, sz + 6.1, 3, 2, '#7a6a4a');
    addPop(group(sx + 2.5, tf.y, sz + 6.1, tf.m), 'school', .3, .45);
    for (let i = 0; i < 6; i++) {
      const x = sx + .8 + (i % 3) * 1.7, z = sz + 5.2 + Math.floor(i / 3) * 1.8, y = tf.y + .06;
      const plants = [];
      for (let k = 0; k < 5; k++) plants.push(mesh(new THREE.ConeGeometry(.13, .42, 4), ['#6db33f', '#d9b23c', '#3f8e3a'][i % 3], (k % 3 - 1) * .32, .56, (k - 2) * .22));
      addPop(group(x, y - .06, z, box(1.3, .32, 1.3, '#6a4d2d', 0, 0, 0), box(1.14, .05, 1.14, '#3b2a1a', 0, .32, 0), ...plants), 'school', .35 + i * .03, .5 + i * .03);
    }
  }
  const person = (x, z, shirt, k, a, b) => {
    const y = groundH(x, z);
    const g = group(x, y - .03, z, cyl(.17, .2, .72, shirt, 0, .34, 0, 7), cyl(.085, .085, .4, '#2f3a4a', -.09, 0, 0, 5), cyl(.085, .085, .4, '#2f3a4a', .09, 0, 0, 5), mesh(new THREE.IcosahedronGeometry(.17, 1), '#c99a6b', 0, 1.22, 0));
    addPop(g, k, a, b);
    claim(x - .4, x + .4, z - .4, z + .4);
    return g;
  };
  [[-13.2, 21.6, '#e0653e'], [-15, 22, '#3b82c4'], [-11.6, 22, '#e5b83a'], [-17.6, 21.6, '#7d55b4'], [-9.8, 22.6, '#3f9e58'], [-19.4, 20, '#d85a8e']]
    .forEach(([x, z, c], i) => person(x, z, c, 'school', .4 + i * .04, .55 + i * .04));
  [[riverX(24) - 5, 24, '#e0653e'], [riverX(26) - 5.4, 26, '#3b82c4'], [riverX(22) - 5.2, 22, '#e5b83a']].forEach(([x, z, c], i) => person(x, z, c, 'monitor', .1 + i * .05, .3 + i * .05));

  /* ---------- monitoring ---------- */
  const buoy = group(riverX(20), 0, 20,
    mesh(new THREE.CylinderGeometry(.55, .75, .7, 12), '#f2b705', 0, .1, 0),
    cyl(.05, .07, 1.9, '#555', 0, .4, 0, 6),
    box(.6, .05, .4, '#1c3f6e', 0, 2.3, 0),
    mesh(new THREE.IcosahedronGeometry(.12, 1), '#ff5a36', 0, 2.5, 0, { m: { emissive: '#ff5a36', emissiveIntensity: 1 } }),
  );
  buoy.traverse((o) => { o.userData.skip = true; });
  addPop(buoy, 'monitor', .05, .3);
  const pulse = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  pulse.rotation.x = -Math.PI / 2; pulse.position.set(buoy.position.x, .12, 20); pulse.userData.skip = true; scene.add(pulse);
  [[9.5, 30], [-2, -14], [-35, -14]].forEach(([x, z], i) => {
    const y = groundH(x, z);
    addPop(group(x, y - .25, z, cyl(.06, .08, 2.9, '#444', 0, 0, 0, 6), box(.8, .05, .6, '#1c3f6e', 0, 2.9, 0), box(.32, .4, .26, '#e8e6db', 0, 1.8, .1)), 'monitor', .2 + i * .1, .4 + i * .1);
    claim(x - .6, x + .6, z - .6, z + .6);
  });
  const drone = group(0, 0, 0, box(.8, .16, .8, '#25282a', 0, 0, 0));
  const props = [];
  for (const [x, z] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) {
    const p = mesh(new THREE.CylinderGeometry(.42, .42, .03, 10), '#c9d4d4', x, .12, z, { cast: false, m: { transparent: true, opacity: .7 } });
    props.push(p); drone.add(p);
  }
  drone.traverse((o) => { o.userData.skip = true; });
  addPop(drone, 'monitor', .3, .5);

  /* ---------- trees: crown and trunk share one origin, so leaves can't leave the trunk ---------- */
  const conifer = paint(merge(
    lump(new THREE.ConeGeometry(1, 1.35, 8), .1).translate(0, 1.2, 0),
    lump(new THREE.ConeGeometry(.82, 1.25, 8), .1).translate(0, 1.85, 0),
    lump(new THREE.ConeGeometry(.62, 1.15, 7), .1).translate(0, 2.5, 0),
    lump(new THREE.ConeGeometry(.42, 1.05, 7), .08).translate(0, 3.1, 0),
  ));
  const broad = paint(merge(
    lump(new THREE.IcosahedronGeometry(1, 1), .2).scale(1, .9, 1).translate(0, 1.9, 0),
    lump(new THREE.IcosahedronGeometry(.68, 0), .15).translate(.52, 1.48, .26),
    lump(new THREE.IcosahedronGeometry(.62, 0), .15).translate(-.5, 1.52, -.3),
    lump(new THREE.IcosahedronGeometry(.5, 0), .15).translate(.1, 1.45, -.6),
  ));
  const trunkG = paint(merge(
    new THREE.CylinderGeometry(.11, .2, 2.1, 6).translate(0, .65, 0),
    new THREE.CylinderGeometry(.04, .07, .75, 4).rotateZ(-.85).translate(.3, 1.3, .1),
    new THREE.CylinderGeometry(.04, .07, .7, 4).rotateZ(.85).translate(-.28, 1.34, -.15),
  ), .75, 1);
  const trees = [];
  const addTree = (x, z, k, t0, sc = 1) => {
    const kind = rnd() < .42 ? 0 : 1;
    trees.push({ x, y: groundH(x, z) - .02, z, k, t0, s: sc * rr(.72, 1.25), sq: rr(.9, 1.14), rot: rnd() * 6.28, kind, shade: rnd() });
  };
  const tryTree = (x, z, k, t0, sc, minD = 5) => {
    if (Math.abs(x) > 58.5 || Math.abs(z) > 58.5) return false;
    const h = groundH(x, z);
    if (h < 1.1 || !isFree(x, z) || Math.abs(x - riverX(z)) < minD || slopeAt(x, z) > 1.2) return false;
    addTree(x, z, k, t0, sc); return true;
  };
  const siteOf = (k) => SITES.find((s) => s.k === k);
  const scatter = (k, n, sample, minD) => {
    const s = siteOf(k);
    for (let i = 0, g = 0; i < n && g < n * 9; g++) {
      const [x, z] = sample();
      const t0 = clamp(Math.hypot(x - s.x, z - s.z) / s.r) * .72 + rnd() * .1;
      if (tryTree(x, z, k, t0, 1, minD)) i++;
    }
  };
  scatter('forest', 760, () => [rr(-59, -13), rr(-3, 32)]);
  scatter('forest', 110, () => [rr(-59, -46), rr(30, 59)]);
  scatter('corridor', 230, () => [rr(-46, -16), rr(-40, -3)]);
  // remnant forest that survives on the high ridge from year 0
  for (let i = 0, g = 0; i < 70 && g < 800; g++) { if (tryTree(rr(-52, -22), rr(-59, -42), 'always', 0, 1)) i++; }
  // riparian buffer
  for (let i = 0; i < 170; i++) {
    const z = rr(-58, 58), side = rnd() < .5 ? -1 : 1, x = riverX(z) + side * rr(3.8, 8.6);
    tryTree(x, z, 'wetland', (Math.abs(z - 7) / 66) * .8 + rnd() * .12, .85, 3.6);
  }
  // hedgerows on the farm: planted in gaps left in the crop rows
  for (const hx of HEDGES) for (let z = FM.z0; z < FM.z1; z += 1.9) addTree(hx + rr(-.2, .2), z + rr(-.3, .3), 'farm', .35 + (z - 16) / 33 * .4, .5);
  for (let x = FM.x0; x < FM.x1; x += 1.9) addTree(x + rr(-.2, .2), FM.z0 - 1.5, 'farm', .4 + rnd() * .3, .5);
  scatter('waste', 50, () => [rr(-46, -14), rr(52, 59)]);
  scatter('school', 40, () => [rr(-27, -3), rr(0, 24)], 5);
  scatter('final', 330, () => [rr(-20, 59), rr(-59, 12)]);
  scatter('final', 60, () => [rr(-12, 18), rr(20, 59)]);

  const nT = trees.length;
  const cons = trees.filter((t) => t.kind === 0), bros = trees.filter((t) => t.kind === 1);
  cons.forEach((t, i) => { t.i = i; }); bros.forEach((t, i) => { t.i = i; });
  const conM = new THREE.InstancedMesh(conifer, swayMat, cons.length);
  const broM = new THREE.InstancedMesh(broad, swayMat, bros.length);
  const truM = new THREE.InstancedMesh(trunkG, swayMat, nT);
  [conM, broM, truM].forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); });
  const cCon = [C('#3f8f5c'), C('#4aa066'), C('#2f7d5a')], cBro = [C('#5fb048'), C('#7fc44c'), C('#4c9f4a'), C('#9ccb52')];
  const trunkC = C('#6b4f36');
  {
    const tc = new THREE.Color();
    cons.forEach((t) => conM.setColorAt(t.i, tc.copy(cCon[Math.floor(t.shade * cCon.length)])));
    bros.forEach((t) => broM.setColorAt(t.i, tc.copy(cBro[Math.floor(t.shade * cBro.length)])));
    trees.forEach((t, i) => truM.setColorAt(i, trunkC));
  }
  // stumps on the cleared slopes
  const stumps = trees.filter((t) => t.k === 'forest' || t.k === 'corridor').filter((_, i) => i % 3 === 0);
  const stuM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .28, .6, 6).translate(0, .2, 0), M('#59432e'), stumps.length);
  stuM.castShadow = true; stuM.frustumCulled = false; scene.add(stuM);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
  const setInst = (im, i, x, y, z, sx, sy = sx, sz = sx, ry = 0) => {
    _p.set(x, y, z); _s.set(sx, sy, sz); _q.setFromAxisAngle(_up, ry);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
  };
  function updateTrees(s) {
    trees.forEach((t, i) => {
      const v = t.k === 'always' ? 1 : (s[t.k] ?? 0);
      const g = t.k === 'always' ? 1 : backOut(clamp((v - t.t0) / .24));
      t.g = g;
      const w = v > 0 || t.k === 'always' ? Math.max(g * t.s, 0) : 0;
      const wy = w * t.sq;
      setInst(t.kind === 0 ? conM : broM, t.i, t.x, t.y, t.z, w, wy, w, t.rot);
      setInst(truM, i, t.x, t.y, t.z, w, wy, w, t.rot);
    });
    stumps.forEach((t, i) => { const k = 1 - clamp((t.g ?? 0) * 3); setInst(stuM, i, t.x, t.y - .1, t.z, k * 1.05 * t.s, k, k * 1.05 * t.s); });
    conM.instanceMatrix.needsUpdate = broM.instanceMatrix.needsUpdate = truM.instanceMatrix.needsUpdate = stuM.instanceMatrix.needsUpdate = true;
  }
  function updateCrops(v) {
    crops.forEach((c, i) => {
      const k = clamp((v - c.t) / .25);
      _c.copy(monoC).lerp(bandCols[c.b], k);
      cropM.setColorAt(i, _c);
      const h = lerp(.6, .9 + c.b % 3 * .22, k) * c.j;
      setInst(cropM, i, c.x, c.y, c.z, lerp(.8, 1.05, k), h, lerp(.8, 1.05, k), c.r);
    });
    cropM.instanceMatrix.needsUpdate = true;
    cropM.instanceColor.needsUpdate = true;
  }

  /* ---------- particles: smoke, spray, litter, birds, fish, clouds ---------- */
  const nSmoke = 170;
  const smokeM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: .42, depthWrite: false }), nSmoke);
  smokeM.frustumCulled = false; scene.add(smokeM);
  const emitters = stacks.map(([x, z]) => ({ x, y: groundH(x, z) + 15.8, z, kind: 'stack' }));
  emitters.push({ x: L.x + 2, y: groundH(L.x + 2, L.z) + .6, z: L.z, kind: 'burn' });
  emitters.push({ x: 0, y: 2.4, z: 0, kind: 'spray' });
  const parts = Array.from({ length: nSmoke }, (_, i) => ({ e: i < 118 ? i % 3 : i < 144 ? 3 : 4, ph: hash(i, 3), sp: rr(.055, .1), dx: rr(-1, 1), dz: rr(-1, 1), sc: rr(.75, 1.35) }));
  const smokeDirty = C('#6a6256'), smokeClean = C('#ffffff'), burnC = C('#7a7266'), sprayC = C('#e4dd70');

  const nLitter = 90;
  const litterM = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .14, .4), M('#ffffff'), nLitter);
  const litter = Array.from({ length: nLitter }, (_, i) => { litterM.setColorAt(i, C(trashCols[i % 7])); return { z: rr(-24, 58), o: rr(-1.7, 1.7), sp: rr(.2, .55), r: rnd() * 6 }; });
  litterM.frustumCulled = false; scene.add(litterM);

  const birdG = new THREE.BufferGeometry();
  birdG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .35, 0, 0, -.35, -1, 1, 0, 0, 0, .35, 1, 1, 0, 0, 0, -.35], 3));
  birdG.computeVertexNormals();
  const birdMat = new THREE.MeshStandardMaterial({ color: '#2a2f33', side: THREE.DoubleSide, flatShading: true });
  const nBirds = 48;
  const birdM = new THREE.InstancedMesh(birdG, birdMat, nBirds);
  birdM.frustumCulled = false; scene.add(birdM);
  const birdCfg = Array.from({ length: nBirds }, (_, i) => {
    const f = i % 3, c = [[-30, 26, 8], [13, 16, 7], [20, 28, -30]][f];
    return { c, f, r: rr(7, 17), sp: rr(.25, .42) * (i % 2 ? 1 : -1), ph: rnd() * 6.28, dy: rr(-2.5, 3), t: i / nBirds };
  });
  const flyM = new THREE.InstancedMesh(birdG, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 60);
  flyM.frustumCulled = false; scene.add(flyM);
  const flyCfg = Array.from({ length: 60 }, (_, i) => { flyM.setColorAt(i, C(['#f5a623', '#fff2c2', '#e8604c', '#f5d90a'][i % 4])); const x = rr(FM.x0, FM.x1), z = rr(FM.z0, FM.z1); return { x, z, y: groundH(x, z) + 1.6, ph: rnd() * 6.28, sp: rr(.4, .9), t: i / 60 }; });

  const fish = [0, 1, 2, 3].map((i) => { const f = mesh(new THREE.IcosahedronGeometry(.3, 0).scale(.5, .6, 1.5), '#c4d6db'); f.visible = false; f.userData.skip = true; scene.add(f); return { f, z: [-34, 12, 32, 48][i], ph: i * 1.7 }; });

  const nCl = 56;
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: .92 });
  const cloudM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), cloudMat, nCl);
  cloudM.frustumCulled = false; cloudM.castShadow = false; scene.add(cloudM);
  const cl = Array.from({ length: 14 }, () => ({ x: rr(-90, 90), y: rr(36, 50), z: rr(-75, 40), s: rr(1.3, 2.9), sp: rr(.35, .8) }));
  const clOff = Array.from({ length: nCl }, (_, i) => ({ c: i % 14, dx: rr(-1.7, 1.7), dy: rr(-.25, .3), dz: rr(-.9, .9), s: rr(.55, 1.05) }));

  /* rain for the storm scene */
  const nRain = 700;
  const rainM = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, 2.1, .08), new THREE.MeshBasicMaterial({ color: '#dfe7e4', transparent: true, opacity: .55, depthWrite: false }), nRain);
  rainM.frustumCulled = false; rainM.count = 0; scene.add(rainM);
  const rain = Array.from({ length: nRain }, () => ({ x: rr(-62, 62), y: rr(0, 46), z: rr(-62, 62), v: rr(36, 52) }));

  /* ---------- colour moods ---------- */
  const moods = {
    fogD: C('#b6a56f'), fogC: C('#cfe5e2'),
    sunD: C('#ffdf9e'), sunC: C('#fff6e0'),
    skyD: C('#c9bd8c'), skyC: C('#cfeaf7'),
    gndD: C('#6a5a3a'), gndC: C('#6f8d52'),
    cloudD: C('#9a917a'), cloudC: C('#ffffff'),
  };
  let cur = null, sig = '', air = 0, waterC = 0, spraySt = 1;

  function apply(s0) {
    const s = derive(s0);
    const key = Object.values(s0).map((v) => v.toFixed(3)).join();
    if (key === sig) return false;
    sig = key; cur = s;
    SITES.forEach((st, i) => { uSites.value[i].w = st.k === 'water' ? s.water : (s[st.k] ?? 0); });
    uWater.uClean.value = s.water;
    air = s.airClean; waterC = s.water; spraySt = 1 - clamp(s.farm * 1.7);
    updateTrees(s);
    updateCrops(s.farm);
    reedPos.forEach((r, i) => {
      if (!r) { setInst(reedM, i, 0, -99, 0, 0); return; }
      const g = Math.max(backOut(clamp((s.wetland - r.t * .7) / .3)), 0);
      setInst(reedM, i, r.x, r.y, r.z, g * r.s, g * r.s * 1.2, g * r.s, r.r);
    });
    reedM.instanceMatrix.needsUpdate = true;
    trash.forEach((t, i) => { const k = 1 - clamp((s.waste - t.t * .55) / .3); setInst(trashM, i, t.x, t.y, t.z, k * t.s, k * t.s, k * t.s, t.rot); });
    trashM.instanceMatrix.needsUpdate = true;
    for (const p of pops) {
      const v = s[p.k] ?? 0;
      let t = clamp((v - p.a) / (p.b - p.a));
      t = p.invert ? 1 - t : backOut(t);
      const u = p.o.userData.s;
      p.o.visible = t > .001;
      p.o.scale.set(u.x * Math.max(t, .0001), u.y * Math.max(t, .0001), u.z * Math.max(t, .0001));
    }
    const fogT = air * .85 + s.final * .15;
    scene.fog.color.copy(moods.fogD).lerp(moods.fogC, fogT);
    scene.fog.density = lerp(.0042, .0009, Math.pow(fogT, .8)) + s.storm * .0035;
    uWater.uFogCol.value.copy(scene.fog.color);
    uWater.uFogD.value = scene.fog.density;
    sun.color.copy(moods.sunD).lerp(moods.sunC, fogT);
    sun.intensity = lerp(2.1, 3, fogT) * (1 - s.storm * .55);
    hemi.color.copy(moods.skyD).lerp(moods.skyC, fogT);
    hemi.groundColor.copy(moods.gndD).lerp(moods.gndC, fogT);
    hemi.intensity = lerp(1.15, 1.6, fogT) * (1 - s.storm * .3);
    cloudMat.color.copy(moods.cloudD).lerp(moods.cloudC, fogT);
    cloudMat.opacity = lerp(.7, .95, fogT);
    renderer.shadowMap.needsUpdate = true;
    return true;
  }

  const _base = new THREE.Matrix4(), _leg = new THREE.Matrix4(), _e = new THREE.Euler();
  const TRACKS = [29, 31, 33];
  let lastT = 0;
  function animate(t) {
    if (!cur) return;
    lastT = t;
    uWater.uTime.value = t;
    uWind.value = t * (1 + cur.storm * 1.2);
    rainM.count = cur.storm > .02 ? Math.round(nRain * cur.storm) : 0;
    if (rainM.count) {
      for (let i = 0; i < rainM.count; i++) {
        const q = rain[i], y = 46 - ((q.y + t * q.v) % 46);
        setInst(rainM, i, q.x - (46 - y) * .12, y, q.z, 1, 1, 1);
      }
      rainM.instanceMatrix.needsUpdate = true;
    }
    // the tractor drives up and back between hedges, turning to face where it is going
    const c = t * .045, cyc = Math.floor(c), ph = c - cyc;
    const toward = ph < .5; // first half heads to +z
    const zPos = toward ? lerp(18.5, 47, sstep(0, .5, ph)) : lerp(47, 18.5, sstep(.5, 1, ph));
    const xPos = lerp(TRACKS[cyc % 3], TRACKS[(cyc + 1) % 3], sstep(.96, 1, ph));
    tractor.position.set(xPos, groundH(xPos, zPos) - .02, zPos);
    tractor.rotation.y = toward ? 0 : Math.PI;
    emitters[4].x = xPos; emitters[4].z = zPos + (toward ? -2 : 2); emitters[4].y = tractor.position.y + 1.1;

    const smokeSt = 1 - air;
    parts.forEach((p, i) => {
      const e = emitters[p.e];
      const life = (p.ph + t * p.sp) % 1;
      let str, col, rise = 15, spread = 3.5 + 7 * life, wind = 12;
      if (e.kind === 'stack') {
        const dirty = clamp(smokeSt * 1.2);
        str = lerp(.28, 1, dirty);
        col = _c.copy(smokeClean).lerp(smokeDirty, dirty * (1 - life * .25));
        if (air > .85) str *= lerp(1, .42, (air - .85) / .15);
      } else if (e.kind === 'burn') {
        str = 1 - clamp((cur.waste) * 2);
        col = _c.copy(burnC); rise = 11; wind = 7;
      } else {
        str = spraySt; col = _c.copy(sprayC); rise = 1.2; spread = 2.6 * (.4 + life); wind = 0;
      }
      if (str <= .001) { setInst(smokeM, i, 0, -99, 0, 0); return; }
      const x = e.x + p.dx * spread * .5 + wind * life;
      const y = e.y + rise * life;
      const z = e.z + p.dz * spread * .35 - wind * .3 * life;
      const sc = (e.kind === 'spray' ? .24 + life * .34 : .7 + life * 2.1) * p.sc * str * (1 - sstep(.82, 1, life));
      setInst(smokeM, i, x, y, z, sc);
      smokeM.setColorAt(i, col);
    });
    smokeM.instanceMatrix.needsUpdate = true;
    smokeM.instanceColor.needsUpdate = true;

    litter.forEach((l, i) => {
      const z = -24 + ((l.z + 24 + t * l.sp) % 84);
      const k = clamp((1 - waterC * 1.5));
      setInst(litterM, i, riverX(z) + l.o, .05, z, k, k, k, l.r + t * .1);
    });
    litterM.instanceMatrix.needsUpdate = true;

    blades.forEach((b) => { b.rotor.rotation.z = t * (.9 + b.k * .06); });
    const life = cur.forest * .45 + cur.corridor * .25 + cur.wetland * .3;
    birdCfg.forEach((b, i) => {
      const on = life > b.t ? 1 : 0;
      const a = b.ph + t * b.sp;
      const x = b.c[0] + Math.cos(a) * b.r, z = b.c[2] + Math.sin(a) * b.r;
      const fl = .35 + Math.sin(t * 9 + b.ph * 3) * .7;
      setInst(birdM, i, x, b.c[1] + b.dy + Math.sin(a * 2) * .7, z, .52 * on, .52 * fl * on, .52 * on, -a + (b.sp > 0 ? 0 : Math.PI));
    });
    birdM.instanceMatrix.needsUpdate = true;
    const flyLife = clamp((cur.farm - .45) * 2);
    flyCfg.forEach((b, i) => {
      const on = flyLife > b.t ? .17 : 0;
      const x = b.x + Math.sin(t * b.sp + b.ph) * 2, z = b.z + Math.cos(t * b.sp * 1.3 + b.ph) * 2;
      setInst(flyM, i, x, b.y + Math.sin(t * 1.4 + b.ph) * .7, z, on, on * (.3 + Math.sin(t * 16 + b.ph)), on, b.ph);
    });
    flyM.instanceMatrix.needsUpdate = true;

    // deer walk a loop: heading comes from their actual movement, so they always face forwards
    const deerOn = clamp((cur.corridor - .55) * 3);
    for (let i = 0; i < nDeer; i++) {
      const u = (t * .0085 + i * .035 + (i > 2 ? .4 : 0)) % 1;
      const [x, z] = deerPath(u), [ax, az] = deerPath(u + .004), [bx, bz] = deerPath(u - .004);
      const dx = ax - bx, dz = az - bz, L2 = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx, dz);
      const h = walkH(x, z), h1 = walkH(x + dx / L2 * .45, z + dz / L2 * .45), h0 = walkH(x - dx / L2 * .45, z - dz / L2 * .45);
      const k = deerOn * deerSize[i];
      const gait = t * 7.5 / Math.max(deerSize[i], .75) + i;
      _e.set(clamp(-Math.atan2(h1 - h0, .9), -.3, .3), yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(x, h + Math.abs(Math.sin(gait)) * .025 * k, z);
      _s.setScalar(Math.max(k, .0001));
      _base.compose(_p, _q, _s);
      deerM.setMatrixAt(i, _base);
      if (i === 0) antM.setMatrixAt(0, _base);
      hips.forEach(([hx, hz], l) => {
        const swing = Math.sin(gait + (l === 0 || l === 3 ? 0 : Math.PI)) * .42;
        _e.set(swing, 0, 0, 'XYZ');
        _q.setFromEuler(_e);
        _p.set(hx, LEGH, hz);
        _s.set(1, 1, 1);
        _leg.compose(_p, _q, _s).premultiply(_base);
        legM.setMatrixAt(i * 4 + l, _leg);
      });
    }
    deerM.instanceMatrix.needsUpdate = legM.instanceMatrix.needsUpdate = antM.instanceMatrix.needsUpdate = true;

    fish.forEach((f) => {
      const q = (t * .32 + f.ph) % 3;
      f.f.visible = waterC > .72 && q < 1;
      if (f.f.visible) {
        const x = riverX(f.z);
        f.f.position.set(x, -0.1 + Math.sin(q * Math.PI) * 1.5, f.z + (q - .5) * 2.2);
        f.f.rotation.x = (q - .5) * 2;
      }
    });

    clOff.forEach((o, i) => {
      const k = cl[o.c];
      let x = k.x + t * k.sp; x = ((x + 100) % 200 + 200) % 200 - 100;
      setInst(cloudM, i, x + o.dx * k.s, k.y + o.dy * k.s, k.z + o.dz * k.s, o.s * k.s, o.s * k.s * .62, o.s * k.s);
    });
    cloudM.instanceMatrix.needsUpdate = true;

    buoy.position.y = Math.sin(t * 1.5) * .07;
    const lp = (t * .45) % 1;
    pulse.scale.setScalar(.6 + lp * 7 * (cur.monitor > .2 ? 1 : 0));
    pulse.material.opacity = cur.monitor > .2 ? (1 - lp) * .85 : 0;
    const a = t * .22;
    drone.position.set(6 + Math.cos(a) * 22, 18 + Math.sin(t * .7) * 1.2, 16 + Math.sin(a) * 20);
    props.forEach((p) => { p.rotation.y = t * 22; });
  }

  /* ---------- camera ---------- */
  const look = new THREE.Vector3(), _d = new THREE.Vector3();
  let W_ = 1, H_ = 1;
  function setPose(px, py, pz, lx, ly, lz, sx = 0, sy = 0) {
    const ground = groundH(clamp(px, -59, 59), clamp(pz, -59, 59));
    camera.position.set(px, Math.max(py, ground + 2.5), pz);
    look.set(lx, ly, lz);
    camera.lookAt(look);
    camera.setViewOffset(W_, H_, sx * W_, sy * H_, W_, H_);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function resize(w, h) {
    W_ = w; H_ = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 50 : 38;
    camera.updateProjectionMatrix();
  }
  function setDPR(v) { dpr = v; renderer.setPixelRatio(dpr); renderer.setSize(W_, H_, false); }
  function project(x, y, z) {
    _d.set(x, y, z).project(camera);
    return { x: (_d.x * .5 + .5) * W_, y: (-_d.y * .5 + .5) * H_, on: _d.z < 1 };
  }
  function render() {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W_, H_);
    renderer.render(scene, camera);
  }
  function renderWipe(a, b, x) {
    const X = Math.round(clamp(x) * W_);
    renderer.setScissorTest(true);
    renderer.clear();
    // each side needs its own animals, smoke and machines, not just its own colours
    apply(a); animate(lastT); renderer.shadowMap.needsUpdate = true;
    if (X > 0) { renderer.setScissor(0, 0, X, H_); renderer.render(scene, camera); }
    apply(b); animate(lastT); renderer.shadowMap.needsUpdate = true;
    if (X < W_) { renderer.setScissor(X, 0, W_ - X, H_); renderer.render(scene, camera); }
    renderer.setScissorTest(false);
  }

  return { apply, animate, setPose, resize, render, renderWipe, project, setDPR, get dpr() { return dpr; }, renderer };
}
