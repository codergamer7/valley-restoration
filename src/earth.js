// The opening shot: a 3D Earth with real continents, then a dive down through the clouds.
import * as THREE from 'three';
import { feature } from 'topojson-client';
import landData from 'world-atlas/land-110m.json';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => t * t * (3 - 2 * t);

/* Where the camera dives. The valley is imaginary, so this only sets the view of the globe. */
const TARGET = { lat: 28 * Math.PI / 180, lon: 96 * Math.PI / 180 };

const NOISE = `
  float h31(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p, int o){ float a=.5, s=0., n=0.; for(int i=0;i<8;i++){ if(i>=o) break; s+=a*vn(p); n+=a; p=p*2.03+vec3(7.1,3.3,1.7); a*=.5; } return s/n; }
`;

/* Draws the continents flat, unwrapping shapes that cross the date line or circle a pole. */
function drawLand(ctx, W, H) {
  const X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
  const geo = feature(landData, landData.objects.land);
  const polys = [];
  (geo.features || [geo]).forEach((f) => {
    const g = f.geometry;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
  });
  ctx.fillStyle = '#fff';
  for (const offset of [-360, 0, 360]) {
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        let shift = 0, prev = ring[0][0], sumLat = 0;
        const pts = ring.map(([lon, lat]) => {
          const d = lon - prev;
          if (d > 180) shift -= 360; else if (d < -180) shift += 360;
          prev = lon; sumLat += lat;
          return [lon + shift, lat];
        });
        if (shift !== 0) { // the ring goes right round the globe, so close it along the pole
          const pole = sumLat < 0 ? -90 : 90;
          pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole]);
        }
        pts.forEach(([lon, lat], i) => (i ? ctx.lineTo(X(lon + offset), Y(lat)) : ctx.moveTo(X(lon + offset), Y(lat))));
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
  }
}
function landTexture(W, H, blur) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  if ('filter' in x) x.filter = `blur(${blur}px)`;
  drawLand(x, W, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export function createEarth(renderer) {
  const size = Math.min(4096, renderer.capabilities.maxTextureSize);

  /* ---------- paint the planet once, on the graphics card, at load ---------- */
  const quadG = new THREE.PlaneGeometry(2, 2);
  const flatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function bake(fragment, uniforms, w, h, mips) {
    const rt = new THREE.WebGLRenderTarget(w, h, { wrapS: THREE.RepeatWrapping, generateMipmaps: mips, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const m = new THREE.Mesh(quadG, new THREE.ShaderMaterial({
      uniforms, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `precision highp float; varying vec2 vUv; ${NOISE} ${fragment}`,
    }));
    const s = new THREE.Scene(); s.add(m);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(s, flatCam);
    renderer.setRenderTarget(before);
    m.material.dispose();
    return rt.texture;
  }
  const SPHERE = `
    const float PI = 3.14159265;
    vec3 sph(vec2 uv){ float lon = (uv.x-.5)*2.*PI, lat = (uv.y-.5)*PI; return vec3(cos(lat)*cos(lon), sin(lat), -cos(lat)*sin(lon)); }
  `;
  const sharp = landTexture(2048, 1024, 1.2), wide = landTexture(1024, 512, 11);
  const surface = bake(`
    uniform sampler2D uSharp, uWide;
    ${SPHERE}
    float ss(float a, float b, float v){ return smoothstep(a, b, v); }
    void main(){
      vec3 P = sph(vUv);
      float latd = abs(vUv.y-.5)*180.;
      float n = fbm(P*2.6+1.3, 5), n2 = fbm(P*8.+5.1, 5), n3 = fbm(P*30., 4);
      vec2 w = vec2(fbm(P*15., 4)-.5, fbm(P*15.+9., 4)-.5)*.007;
      float m = texture2D(uSharp, vUv+w).r;
      float land = ss(.42, .58, m + (n3-.5)*.2);
      float coast = texture2D(uWide, vUv).r;
      float arid = exp(-pow((latd-24.)/11., 2.))*1.05 + (n-.5)*1.9 - .34;
      vec3 c = mix(vec3(.10,.33,.12), vec3(.25,.43,.19), ss(10.,36.,latd));
      c = mix(c, vec3(.15,.30,.20), ss(46.,60.,latd));
      c = mix(c, vec3(.47,.47,.38), ss(62.,72.,latd));
      c = mix(c, vec3(.50,.50,.28), ss(.3,.58,arid));
      c = mix(c, vec3(.72,.60,.40), ss(.58,.9,arid));
      float ridge = 1.-abs(n2*2.-1.);
      c *= .8 + n2*.42;
      c = mix(c, c*.68 + vec3(.05), ss(.72,.95,ridge)*.6);
      float north = vUv.y > .5 ? 1. : 0.;
      float ice = ss(mix(71.,67.,1.-north), mix(77.,71.,1.-north), latd + (n2-.5)*14.);
      c = mix(c, vec3(.92,.94,.97), ice);
      vec3 o = mix(vec3(.015,.075,.22), vec3(.04,.30,.46), ss(.04,.75,coast)*.85);
      o *= .88 + n*.24;
      o = mix(o, vec3(.86,.91,.95), ss(mix(74.,66.,1.-north), mix(82.,72.,1.-north), latd + (n2-.5)*10.));
      gl_FragColor = vec4(mix(o, c, land), land);
    }`, { uSharp: { value: sharp }, uWide: { value: wide } }, size, size / 2, true);
  const cloudsTex = bake(`
    ${SPHERE}
    void main(){
      vec3 P = sph(vUv);
      vec3 q = P*3.4 + vec3(fbm(P*2.6, 4), fbm(P*2.6+4., 4), fbm(P*2.6+8., 4))*1.9;
      float a = fbm(q, 8);
      float lat = abs(vUv.y-.5)*2.;
      float bands = .05*sin(lat*11.) + .04*smoothstep(.4,.7,lat);
      gl_FragColor = vec4(vec3(smoothstep(.535, .64, a + bands)), 1.);
    }`, {}, 2048, 1024, true);
  sharp.dispose(); wide.dispose();

  /* ---------- the globe ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .0008, 200);
  const sunDir = new THREE.Vector3(-.5, .34, .8).normalize();
  const tDir = new THREE.Vector3(Math.cos(TARGET.lat) * Math.cos(TARGET.lon), Math.sin(TARGET.lat), -Math.cos(TARGET.lat) * Math.sin(TARGET.lon));
  const U = {
    uSurface: { value: surface }, uClouds: { value: cloudsTex }, uSun: { value: sunDir }, uZoom: { value: 0 }, uDrift: { value: 0 },
    uFade: { value: 0 }, uMark: { value: 0 }, uMarkR: { value: .1 }, uTarget: { value: tDir }, uTime: { value: 0 }, uCloudAmt: { value: 1 },
  };
  const VERT = `
    varying vec2 vUv; varying vec3 vO, vN, vW;
    void main(){ vUv = uv; vO = position; vN = mat3(modelMatrix)*normal; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
  const earthMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uSurface, uClouds; uniform vec3 uSun, uTarget; uniform float uZoom, uDrift, uFade, uMark, uMarkR, uTime;
      varying vec2 vUv; varying vec3 vO, vN, vW;
      ${NOISE}
      float ridges(vec3 p){ float a=.5, r=0., n=0.; for(int i=0;i<5;i++){ r += a*(1.-abs(vn(p)*2.-1.)); n += a; p = p*2.07 + vec3(3.1,1.7,5.3); a *= .5; } return r/n; }
      void main(){
        vec3 N = normalize(vN), P = normalize(vO), V = normalize(cameraPosition - vW);
        vec4 a = texture2D(uSurface, vUv);
        vec3 col = pow(a.rgb, vec3(2.2));
        if (uZoom > .002) {
          // close up, the land becomes mountains: ridges catch the sun and valleys fall into shadow
          vec3 T1 = normalize(cross(P, vec3(0.,1.,0.))), T2 = cross(P, T1);
          float eps = .0016;
          float h0 = ridges(P*64.), h1 = ridges((P+T1*eps)*64.), h2 = ridges((P+T2*eps)*64.);
          float shade = clamp(1. + (h0-h1)*5. + (h0-h2)*3., .55, 1.45);
          float fine = fbm(P*1300., 3);
          vec3 forest = mix(vec3(.035,.135,.05), vec3(.09,.24,.08), fine);
          vec3 upland = mix(vec3(.20,.24,.10), vec3(.34,.30,.17), fine);
          vec3 rock = mix(vec3(.30,.27,.23), vec3(.46,.43,.38), fine);
          vec3 ground = mix(forest, upland, smoothstep(.42,.62,h0));
          ground = mix(ground, rock, smoothstep(.66,.84,h0));
          // keep each region's own character: deserts stay dry and ice stays white
          float pale = dot(col, vec3(.33));
          ground = mix(ground, col*1.05, smoothstep(.2,.5,pale)*.55);
          ground *= shade;
          col = mix(col, mix(col*(.85+fine*.3), ground, a.a), uZoom);
        }
        float sh = texture2D(uClouds, vUv + vec2(uDrift - .0025, -.002)).r;
        col *= 1. - sh*.38;
        float nl = dot(N, uSun);
        float day = smoothstep(-.12, .24, nl);
        vec3 c = col*(.018 + 1.75*clamp(nl*.9+.12, 0., 1.)*day);
        vec3 H = normalize(uSun + V);
        c += (1.-a.a)*vec3(1.,.93,.78)*(pow(max(dot(N,H),0.), 420.)*.55 + pow(max(dot(N,H),0.), 40.)*.035)*day;
        float fres = pow(1.-max(dot(N,V),0.), 3.2);
        c += vec3(.20,.46,1.)*fres*.85*(.08+day);
        c += vec3(1.,.42,.18)*.08*exp(-pow(nl*7., 2.))*(1.-a.a*.3);
        if (uMark > .001) {
          float d = acos(clamp(dot(P, uTarget), -1., 1.));
          float pulse = fract(uTime*.5);
          float ring = smoothstep(uMarkR*.09, 0., abs(d-uMarkR)) + smoothstep(uMarkR*.06, 0., abs(d-uMarkR*(.4+pulse*1.3)))*(1.-pulse)*.8;
          ring += smoothstep(uMarkR*.16, uMarkR*.08, d);
          c = mix(c, pow(vec3(.95,.72,.02), vec3(2.2)), clamp(ring, 0., 1.)*uMark);
        }
        gl_FragColor = vec4(c*uFade, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const globe = new THREE.Group();
  scene.add(globe);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 160, 110), earthMat));
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, transparent: true, depthWrite: false,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uClouds; uniform vec3 uSun; uniform float uDrift, uFade, uCloudAmt;
      varying vec2 vUv; varying vec3 vN, vW;
      void main(){
        vec3 N = normalize(vN);
        float s = texture2D(uClouds, vUv + vec2(uDrift, 0.)).r;
        s = pow(s, 1.15);
        float nl = dot(N, uSun), day = smoothstep(-.1, .22, nl);
        vec3 c = vec3(1.)*(.03 + 1.25*clamp(nl*.9+.15, 0., 1.)*day);
        c = mix(c, c*vec3(1.,.62,.42), exp(-pow(nl*6., 2.))*.7);
        gl_FragColor = vec4(c, s*.92*uFade*uCloudAmt);
        #include <colorspace_fragment>
      }`,
  });
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.006, 140, 96), cloudMat));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 90, 64), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: VERT, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `
      precision highp float;
      uniform vec3 uSun; uniform float uFade;
      varying vec3 vN, vW;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        float rim = pow(clamp(dot(-N, V)*1.0 + .38, 0., 1.), 5.)*2.4;
        float inner = smoothstep(0., .34, dot(-N, V) + .02);
        float lit = smoothstep(-.42, .3, dot(-N, uSun)*-1.);
        gl_FragColor = vec4(vec3(.28,.56,1.)*rim*lit*(1.-inner*.65)*uFade, 1.);
      }`,
  }));
  scene.add(atmo);

  /* stars */
  {
    const n = 2400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const z = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 80, r * Math.sin(a) * 80, z * 80], i * 3);
      const b = Math.pow(Math.random(), 3) * .85 + .15, warm = Math.random();
      col.set([b * (warm > .8 ? 1 : .86), b * .9, b * (warm < .2 ? 1 : .86)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
    scene.add(stars);
  }

  /* ---------- the layer of cloud the camera falls through ---------- */
  const oU = { uA: { value: 0 }, uZ: { value: 0 }, uAspect: { value: 1 }, uDirty: { value: 0 } };
  const ovScene = new THREE.Scene();
  ovScene.add(new THREE.Mesh(quadG, new THREE.ShaderMaterial({
    uniforms: oU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      precision highp float;
      uniform float uA, uZ, uAspect, uDirty; varying vec2 vUv;
      ${NOISE}
      float layer(vec2 p, float seed){ return fbm(vec3(p*2.2, seed), 4); }
      void main(){
        vec2 p = (vUv-.5)*vec2(uAspect, 1.);
        // three cloud layers rushing outward from the centre of the screen
        float sum = 0., w = 0.;
        for (int i = 0; i < 3; i++) {
          float f = fract(uZ + float(i)/3.);
          float weight = sin(f*3.14159);
          sum += layer(p*(3.2 - f*2.7), float(i)*9.1 + floor(uZ + float(i)/3.)*3.3)*weight;
          w += weight;
        }
        float n = sum/w;
        float a = smoothstep(.98 - uA*1.3, 1.16 - uA*1.3, n + .12);
        vec3 bright = mix(vec3(1.), vec3(.86,.76,.52), uDirty);
        vec3 dark = mix(vec3(.72,.80,.90), vec3(.54,.46,.32), uDirty);
        vec3 c = mix(dark, bright, smoothstep(.34, .66, n));
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  })));

  let W = 1, H = 1, narrow = false;
  const baseTheta = -Math.PI / 2 - TARGET.lon;
  return {
    resize(w, h) { W = w; H = h; narrow = w < 860; camera.aspect = w / h; oU.uAspect.value = w / h; camera.fov = narrow ? 44 : 32; camera.updateProjectionMatrix(); },
    /* e: progress through the opening, 0 to 1 */
    render(e, t, fade) {
      const align = sstep(clamp(e / .24));
      const zoom = sstep(clamp((e - .2) / .56));
      // the planet turns on its own, then scrolling swings the target round to face the camera
      const spin = baseTheta - 1.25 + t * .035;
      const diff = ((baseTheta - spin + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      globe.rotation.set(lerp(.22, TARGET.lat, align), spin + diff * align, (1 - align) * .3, 'XYZ');
      const dist = 1 + 2.75 * Math.pow(.022 / 2.75, zoom);
      const alt = dist - 1;
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
      const k = 1 - clamp(zoom * 2.2);
      camera.setViewOffset(W, H, (narrow ? 0 : -.2) * k * W, (narrow ? -.17 : -.03) * k * H, W, H);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      U.uZoom.value = clamp((.4 - alt) / .32);
      U.uDrift.value = t * .0016;
      U.uTime.value = t;
      U.uFade.value = fade;
      U.uMark.value = sstep(clamp((e - .12) / .1)) * (1 - sstep(clamp((e - .46) / .12)));
      U.uMarkR.value = clamp(alt * .085, .004, .12);
      U.uCloudAmt.value = 1 - clamp((.09 - alt) / .07) * .4;
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
    },
    /* draws the rushing cloud over whatever is on screen */
    overlay(amount, z, dirty) {
      if (amount <= .003) return;
      oU.uA.value = amount; oU.uZ.value = z; oU.uDirty.value = dirty;
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      renderer.render(ovScene, flatCam);
      renderer.autoClear = auto;
    },
  };
}
