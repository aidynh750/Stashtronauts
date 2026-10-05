// Below the clouds: a simple seeded surface for the planet you've flown down into.
// The surface is a separate little world, far away from everything else in universe space (SURF_ORIGIN), so nothing in
// space can ever touch it. Only it is drawn while you're down here; the planets, the fleet and the stars are hidden.
// Local coordinates: x and z along the ground, y up, sea level at y = 0. The ship is held a safe height above the ground.
// Terrain is built in square chunks around the camera with three levels of detail, and bends down toward a curved
// horizon that flattens as you come down. Debt planets keep their storm down here (rain, wind, soft lightning glows).
import * as THREE from 'three';

export const SURF_ORIGIN = new THREE.Vector3(0, -200000, 0);
export const CLOUD_BASE = 520, EXIT_ALT = 760, ENTRY_ALT = 700;   // underside of the clouds, where you leave for space, where you arrive
const CHUNK = 600, RINGS = 4, LODS = [[1, 48], [2, 24], [RINGS, 8]];   // chunk size; [ring up to, segments]
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Bend everything toward a curved horizon: y drops with the square of the distance from the camera.
const CURVE = { curveCam: { value: new THREE.Vector3() }, curveK: { value: 0 } };
function curved(m, key) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, CURVE);
    sh.vertexShader = 'uniform vec3 curveCam; uniform float curveK;\n' + sh.vertexShader.replace('#include <project_vertex>', `{
      vec4 cw = modelMatrix * vec4(transformed, 1.0); vec2 dxz = cw.xz - curveCam.xz;
      transformed.y -= dot(dxz, dxz) * curveK; }
      #include <project_vertex>`);
  };
  m.customProgramCacheKey = () => 'curved-' + key;
  return m;
}

// opts: { universe, scene, camera, sun, makeNoise, rng }
export function makeSurface({ universe, scene, camera, sun, makeNoise, rng }) {
  const group = new THREE.Group(); group.position.copy(SURF_ORIGIN); group.visible = false; universe.add(group);
  // Soft light from the sky under the clouds, so slopes facing away from the sun stay readable (only on while down here).
  const skyLight = new THREE.HemisphereLight('#FFFFFF', '#556070', 1.1); group.add(skyLight);
  const terrainMat = curved(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }), 'terrain');
  const waterMat = curved(new THREE.MeshStandardMaterial({ color: '#3A85C2', roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 }), 'water');
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK * (RINGS * 2 + 2), CHUNK * (RINGS * 2 + 2), 48, 48).rotateX(-Math.PI / 2), waterMat);
  group.add(water);
  // Sky: a dome with a soft gradient, always around the camera (no fog on it).
  const skyGeo = new THREE.SphereGeometry(4000, 24, 16), skyCol = new Float32Array(skyGeo.attributes.position.count * 3);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  const skyDome = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyDome.renderOrder = -10; group.add(skyDome);
  // The cloud ceiling overhead: a tiled, translucent layer, anchored to the ground as you fly under it.
  const cloudTex = cloudTileTexture(makeNoise);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(5, 5);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK * 10, CHUNK * 10, 24, 24).rotateX(Math.PI / 2),
    curved(new THREE.MeshStandardMaterial({ map: cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, emissive: '#FFFFFF', emissiveIntensity: 0.25 }), 'cloud'));
  ceiling.position.y = CLOUD_BASE + 30; group.add(ceiling);
  // Rain and soft lightning, for stormy planets.
  const RAIN = 700, rainPos = new Float32Array(RAIN * 6), rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#B8C4E0', transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
  rain.frustumCulled = false; rain.visible = false; group.add(rain);
  const bolt = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#D8D0FF', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  bolt.visible = false; group.add(bolt);

  const S = { active: false, planet: null, look: null, storm: 0, sea: 0, lava: false, dry: false, N: null, N2: null, cr: null, chunks: new Map(), queue: [], time: 0,
    sky: new THREE.Color(), fog: new THREE.Color(), flash: { t: 0, next: 6, lvl: 0 }, wind: new THREE.Vector3(), saved: null };
  const v = new THREE.Vector3(), tmpC = new THREE.Color();

  // ----- The ground: one height function per planet, from its name -----
  // Layered noise for hills and valleys, ridged noise for mountain ranges in some places, and craters on rocky worlds.
  function heightAt(x, z) {
    const { N, N2, look } = S, k = look.biome.kind;
    let h = N(x * 0.0011, 0.5, z * 0.0011, 5) * 90;                                   // rolling hills and broad valleys
    const ridge = 1 - Math.abs(N2(x * 0.0026 + 11, 3.1, z * 0.0026, 3));
    h += Math.pow(Math.max(0, ridge), 3) * 170 * smooth(-0.1, 0.35, N2(x * 0.0005, 7.7, z * 0.0005, 2));   // mountain ranges
    if (k === 'mesa' || S.look.biome.name === 'frost') {
      // Craters: at most one per cell, seeded by the cell, a bowl with a raised rim.
      const cs = 900, ci = Math.floor(x / cs), cj = Math.floor(z / cs);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const r = S.cr(i * 73856093 ^ j * 19349663); if (r[0] > 0.4) continue;
        const cx = (i + 0.2 + r[1] * 0.6) * cs, cz = (j + 0.2 + r[2] * 0.6) * cs, rad = 90 + r[3] * 200, d = Math.hypot(x - cx, z - cz);
        if (d < rad) h -= (1 - (d / rad) ** 2) * rad * 0.35;
        h += Math.exp(-(((d - rad) / (rad * 0.22)) ** 2)) * rad * 0.12;
      }
    }
    h += S.bias;
    return h * 0.45 + Math.round(h / 14) * 14 * 0.55;                                 // terraced, like the planets seen from space
  }
  // The highest of the ground and the water (or lava), where the ship can be.
  const floorAt = (x, z) => Math.max(heightAt(x, z), S.dry ? -1e9 : S.sea);

  function colorFor(h, slope) {
    const b = S.look.biome, L = b.land;
    if (!S.dry && h < S.sea - 2) return tmpC.set(S.lava ? '#3A1E1A' : b.water ? b.water[0] : '#35304A').multiplyScalar(0.8);
    const t = clamp((h - S.sea) / 260, 0, 0.999);
    tmpC.set(L[Math.floor(t * L.length)]);
    if (b.cap && h > 190) tmpC.set(b.cap);
    if (slope > 0.9) tmpC.multiplyScalar(0.78);                                       // cliffs a little darker
    return tmpC;
  }
  // A square of terrain, flat-shaded, with skirts hanging down its edges so different detail levels never show gaps.
  function buildChunk(i, j, segs) {
    const x0 = i * CHUNK, z0 = j * CHUNK, st = CHUNK / segs, n = segs + 1, hs = new Float32Array(n * n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) hs[a * n + b] = heightAt(x0 + b * st, z0 + a * st);
    const P = [], C = [], fr = rng((i * 92821 + j * 68917) ^ S.look.seed);
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, skirt) => {
      const hAvg = (ay + by + cy) / 3, slope = skirt ? 1 : Math.max(Math.abs(ay - by), Math.abs(by - cy), Math.abs(ay - cy)) / st;
      const c = colorFor(hAvg, slope).offsetHSL(0, 0, (fr() - 0.5) * 0.04);
      P.push(ax, ay, az, bx, by, bz, cx, cy, cz); for (let k = 0; k < 3; k++) C.push(c.r, c.g, c.b);
    };
    for (let a = 0; a < segs; a++) for (let b = 0; b < segs; b++) {
      const xA = b * st, xB = xA + st, zA = a * st, zB = zA + st;
      const h00 = hs[a * n + b], h01 = hs[a * n + b + 1], h10 = hs[(a + 1) * n + b], h11 = hs[(a + 1) * n + b + 1];
      tri(xA, h00, zA, xA, h10, zB, xB, h01, zA); tri(xB, h01, zA, xA, h10, zB, xB, h11, zB);
    }
    // Skirts along the four edges.
    const D = 60, edge = (pts) => { for (let k = 0; k < pts.length - 1; k++) { const [ax, ah, az] = pts[k], [bx, bh, bz] = pts[k + 1];
      tri(ax, ah, az, bx, bh, bz, ax, ah - D, az, true); tri(bx, bh, bz, bx, bh - D, bz, ax, ah - D, az, true); } };
    const row = a => Array.from({ length: n }, (_, b) => [b * st, hs[a * n + b], a * st]), col = b => Array.from({ length: n }, (_, a) => [b * st, hs[a * n + b], a * st]);
    edge(row(0)); edge(row(segs).reverse()); edge(col(0).reverse()); edge(col(segs));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, terrainMat); m.position.set(x0, 0, z0);
    m.material.side = THREE.DoubleSide;
    // HOOK (residents and buildings): when the surface gets life, place it per chunk here, e.g. populateChunk(planet, i, j, m).
    return m;
  }
  const ringOf = (i, j, ci, cj) => Math.max(Math.abs(i - ci), Math.abs(j - cj));
  const segsFor = ring => LODS.find(([r]) => ring <= r)[1];
  // Keep the chunks around the camera at the right detail; build at most `budget` per call, nearest first.
  function refresh(lx, lz, budget) {
    const ci = Math.floor(lx / CHUNK), cj = Math.floor(lz / CHUNK), want = new Map();
    for (let i = ci - RINGS; i <= ci + RINGS; i++) for (let j = cj - RINGS; j <= cj + RINGS; j++) want.set(i + ',' + j, segsFor(ringOf(i, j, ci, cj)));
    for (const [k, c] of S.chunks) if (!want.has(k)) { group.remove(c.mesh); c.mesh.geometry.dispose(); S.chunks.delete(k); }
    const todo = [...want].filter(([k, segs]) => S.chunks.get(k)?.segs !== segs)
      .map(([k, segs]) => { const [i, j] = k.split(',').map(Number); return { k, i, j, segs, d: ringOf(i, j, ci, cj) }; }).sort((a, b) => a.d - b.d);
    for (const c of todo.slice(0, budget)) {
      const old = S.chunks.get(c.k), mesh = buildChunk(c.i, c.j, c.segs);
      group.add(mesh); if (old) { group.remove(old.mesh); old.mesh.geometry.dispose(); }
      S.chunks.set(c.k, { segs: c.segs, mesh });
    }
    return todo.length;
  }

  // ----- Going down and coming back up -----
  // planet: the planet object from space.js (look, air, myth, debt, storm). hide/show: what to hide while down here.
  function enter(planet) {
    S.active = true; S.planet = planet; S.look = planet.look; S.storm = planet.debt ? planet.air.storm : 0;
    S.N = makeNoise(planet.look.seed + 777); S.N2 = makeNoise(planet.look.seed + 991);
    S.cr = seed => { const r = rng(seed ^ planet.look.seed); return [r(), r(), r(), r()]; };
    const b = planet.look.biome;
    // Water, lava or dry ground, from the planet's look.
    S.lava = b.name === 'crystal'; S.dry = b.name === 'dune';
    S.sea = 0; S.bias = b.kind === 'terra' ? 40 - (b.sea || 0) * 260 : b.kind === 'bands' ? 25 : S.lava ? 20 : 60;
    waterMat.color.set(S.lava ? '#E0562A' : planet.debt ? '#3A3F5A' : b.water ? b.water[1] : '#C88AA0');
    waterMat.emissive.set(S.lava ? '#C2401E' : '#000000'); waterMat.emissiveIntensity = S.lava ? 0.6 : 0;
    water.visible = !S.dry;
    // Sky and fog: the planet's own air colour; soft and bright when calm, low and dim in a storm.
    S.sky.set(b.atmo).lerp(new THREE.Color('#FFFFFF'), 0.25);
    if (S.storm) S.sky.set('#5A5470').lerp(new THREE.Color('#2E2A3C'), S.storm * 0.7);
    S.fog.copy(S.sky);
    ceiling.material.color.copy(planet.air.cloudTint); ceiling.material.emissive.copy(planet.air.cloudTint);
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 4000; tmpC.copy(S.sky).multiplyScalar(y > 0 ? 1 - 0.35 * y : 1); skyCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3); }
    skyGeo.attributes.color.needsUpdate = true;
    S.saved = { bg: scene.background, fog: scene.fog, sun: sun.intensity };
    scene.background = S.sky.clone();
    scene.fog = new THREE.Fog(S.fog.clone(), S.storm ? 250 : 700, S.storm ? 1700 - 500 * S.storm : 2700);
    sun.intensity = S.saved.sun * (S.storm ? 1 - 0.55 * S.storm : 1.05);
    skyLight.color.copy(S.sky).lerp(new THREE.Color('#FFFFFF'), 0.5); skyLight.groundColor.set(planet.look.biome.land[0]).multiplyScalar(0.5);
    skyLight.intensity = S.storm ? 0.8 : 1.1;
    for (const c of S.chunks.values()) { group.remove(c.mesh); c.mesh.geometry.dispose(); } S.chunks.clear();
    group.visible = true;
    refresh(0, 0, 999);   // all at once, while the clouds hide everything
  }
  function exit() {
    S.active = false; group.visible = false;
    scene.background = S.saved.bg; scene.fog = S.saved.fog; sun.intensity = S.saved.sun;
    for (const c of S.chunks.values()) { group.remove(c.mesh); c.mesh.geometry.dispose(); } S.chunks.clear();
  }

  // ----- Every frame while down here -----
  // shipLocal: the ship's position in surface coordinates. Returns what the flight code needs.
  const out = { ground: 0, alt: 0, veil: 0, wind: new THREE.Vector3(), flash: 0 };
  function update(dt, { shipLocal, camLocal, reduced }) {
    S.time += dt;
    refresh(camLocal.x, camLocal.z, 2);
    // The horizon curves more the higher you are, and flattens as you come down.
    const alt = shipLocal.y - floorAt(shipLocal.x, shipLocal.z);
    CURVE.curveK.value = 1 / (2 * (3000 + 60000 * (1 - smooth(60, ENTRY_ALT, shipLocal.y))));
    camera.getWorldPosition(CURVE.curveCam.value);
    water.position.set(camLocal.x, S.sea, camLocal.z);
    skyDome.position.copy(camLocal);
    ceiling.position.x = camLocal.x; ceiling.position.z = camLocal.z;
    cloudTex.offset.set(camLocal.x / (CHUNK * 2), -camLocal.z / (CHUNK * 2));
    // Weather: storms push gently, rain falls, and now and then a soft glow lights the clouds.
    const st = S.storm;
    if (st && !reduced) out.wind.set(Math.sin(S.time * 0.21) + 0.4 * Math.sin(S.time * 0.53), 0, Math.cos(S.time * 0.17)).multiplyScalar(5 * st);
    else out.wind.set(0, 0, 0);
    rain.visible = st > 0 && !reduced;
    if (rain.visible) {
      const n = Math.floor(RAIN * clamp(st, 0.25, 1)); rainGeo.setDrawRange(0, n * 2);
      for (let i = 0; i < n; i++) {
        const o = i * 6; v.set(rainPos[o], rainPos[o + 1], rainPos[o + 2]);
        if (v.distanceTo(camLocal) > 90 || v.y < camLocal.y - 60) v.set(camLocal.x + (Math.random() - 0.5) * 170, camLocal.y + Math.random() * 80 - 20, camLocal.z + (Math.random() - 0.5) * 170);
        v.y -= dt * 70; v.x += out.wind.x * dt * 3; v.z += out.wind.z * dt * 3;
        rainPos.set([v.x, v.y, v.z, v.x - out.wind.x * 0.25, v.y + 5, v.z - out.wind.z * 0.25], o);
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.material.opacity = 0.25 + 0.3 * st;
    }
    const F = S.flash;
    if (st > 0) {
      F.next -= dt;
      if (F.next <= 0 && F.t <= 0) {
        F.t = 1e-6; F.peak = 0.4 + 0.5 * st; F.rise = reduced ? 0.8 : 0.3; F.fall = reduced ? 2.5 : 1.3; F.next = (6 + Math.random() * 7) / (0.4 + st);
        const a = Math.random() * Math.PI * 2, d = 700 + Math.random() * 900; bolt.position.set(camLocal.x + Math.cos(a) * d, CLOUD_BASE - 40, camLocal.z + Math.sin(a) * d);
        const s = 500 + Math.random() * 400; bolt.scale.set(s, s * 0.6, 1);
      }
      if (F.t > 0) { F.t += dt; F.lvl = F.t < F.rise ? F.t / F.rise : Math.max(0, 1 - (F.t - F.rise) / F.fall); if (F.t > F.rise + F.fall) { F.t = 0; F.lvl = 0; } }
    } else F.lvl = 0;
    bolt.visible = F.lvl > 0.01; bolt.material.opacity = F.lvl * F.peak * 0.8;
    // Lightning brightens the sky and the fog a touch: a swell and a fade, never a strobe.
    tmpC.copy(S.sky).lerp(new THREE.Color('#C8C0F0'), F.lvl * (F.peak || 0) * 0.25);
    scene.background.copy(tmpC); scene.fog.color.copy(tmpC);
    out.alt = alt; out.ground = floorAt(shipLocal.x, shipLocal.z); out.flash = F.lvl;
    // Inside the cloud band near the top, the clouds close in completely.
    out.veil = smooth(CLOUD_BASE + 20, ENTRY_ALT + 30, shipLocal.y);
    return out;
  }
  return { group, enter, exit, update, heightAt, floorAt, get active() { return S.active; }, get planet() { return S.planet; }, state: S };
}

function glowTex() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s); return new THREE.CanvasTexture(c);
}
// A seamless tile of soft cloud for the ceiling (noise sampled on a torus so it wraps).
function cloudTileTexture(makeNoise) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), N = makeNoise(4242);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = x / S * Math.PI * 2, b = y / S * Math.PI * 2;
    const n = N(Math.cos(a) * 1.6, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, Math.sin(b) * 1.6, 4) * 0.5 + 0.5;
    const o = (y * S + x) * 4, al = clamp((n - 0.35) / 0.4, 0, 1);
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = 120 + al * 135;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
