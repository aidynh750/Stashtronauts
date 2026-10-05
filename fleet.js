// The emergency fund's guardian fleet. A dark, military-style mothership holds station far from everything, like a calm
// coast guard, with a wing of small fighters that patrol space, come home to refuel, and launch again.
// Tiers by months of costs saved: a patrol frigate (under 3), a cruiser (3 to 6), a flagship carrier (6 or more).
// One fighter per "fighter unit" of the fund (a setting, $100 by default); up to 24 fly, the rest wait in reserve.
// Every design here is original. Sizes are in world units (the player's ship is about 18 long). Ships face -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHIP_LEN, WORLD } from './settings.js';
import { armorTexture, windowRowsTexture, deckTexture, fleetDecalTexture, serialTexture, rackTexture, consoleGlowTexture, softGlowTexture, dotTexture } from './textures.js';

export const MAX_ACTIVE = 24;
// Sizes are multiples of the player's ship length (settings.js). Counts of towers, antennas and buildings grow with the hull.
const MS = WORLD.mothership;
export const TIERS = {
  frigate: { label: 'Patrol frigate', mult: MS.frigate, slots: 6, segs: 3, engines: [2, 3], towers: 6, turrets: 4, officers: 3, arms: 2, dishes: 4, antennas: 160, city: 0, serial: 'GP-104', seed: 11 },
  cruiser: { label: 'Cruiser', mult: MS.cruiser, slots: 10, segs: 5, engines: [3, 4], towers: 14, turrets: 8, officers: 4, arms: 4, dishes: 7, antennas: 600, city: 1400, serial: 'GC-311', seed: 23 },
  carrier: { label: 'Flagship carrier', mult: MS.carrier, slots: 16, segs: 8, engines: [4, 6], towers: 26, turrets: 12, officers: 6, arms: 6, dishes: 12, antennas: 2000, city: 4000, serial: 'GF-001', seed: 37 },
};
for (const t of Object.values(TIERS)) t.L = t.mult * SHIP_LEN;
export const tierFor = (amount, months) => !(amount > 0) ? null : months < 3 ? 'frigate' : months < 6 ? 'cruiser' : 'carrier';

const SP = 4.6, PAD = 5.5, ASM = 6;      // hangar: space per parking slot, the launch pad, the assembly bay
const SQUAD = ['#4FD1C5', '#E9A23B', '#9BD35A', '#5AA9E6'];               // squadron stripes
const HELMETS = ['#E8E4D2', '#E06C5A', '#F2C14E', '#5AA9E6', '#9BD35A', '#C792EA', '#F28FB0', '#7FE0C2', '#F4F1EA', '#E9A23B'];
const SKIN = ['#F1C9A5', '#D9A47F', '#B07A55', '#8A5A3B', '#5E3B26', '#F5D7BD'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => t * t * (3 - 2 * t);
const hashN = n => { n = Math.imul(n ^ 0x9E3779B9, 0x85EBCA6B); n ^= n >>> 13; n = Math.imul(n, 0xC2B2AE35); return ((n ^ n >>> 16) >>> 0) / 4294967296; };

// ---------- Geometry helpers. UVs are in world units (the armour texture tiles every 8), so any size of part looks the same. ----------
function boxG(w, h, d, uvk = 1 / 8) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * uvk, uv.getY(i) * dims[f][1] * uvk); }
  return g;
}
function cylG(rt, rb, h, seg = 12, open = false, uvk = 1 / 8) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), uv = g.attributes.uv, c = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * c * uvk, uv.getY(i) * h * uvk);
  return g;
}
const at = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };
// A plane showing one region of a texture atlas: [u0, v0, u1, v1] with v measured from the top.
function decalG(w, h, r) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), 1 - r[3] + uv.getY(i) * (r[3] - r[1]));
  return g;
}
// An angular body lofted through octagons: rings [{ z, w, h, x, y }] in increasing z. Flat faces, wound outward.
function octLoft(rings, { ck = 0.22, uvk = 1 / 8, caps = true } = {}) {
  const P = [], U = [];
  const pts = rings.map(r => {
    const hw = r.w / 2, hh = r.h / 2, c = Math.min(r.c ?? Math.min(r.w, r.h) * ck, hw * 0.9, hh * 0.9), x = r.x || 0, y = r.y || 0;
    return [[hw - c, hh], [hw, hh - c], [hw, -hh + c], [hw - c, -hh], [-hw + c, -hh], [-hw, -hh + c], [-hw, hh - c], [-hw + c, hh]].map(([a, b]) => new THREE.Vector3(a + x, b + y, r.z));
  });
  const perim = pts.map(ring => { const s = [0]; for (let k = 0; k < 8; k++) s.push(s[k] + ring[k].distanceTo(ring[(k + 1) % 8])); return s; });
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), m = new THREE.Vector3();
  const tri = (a, b, c, ua, ub, uc, out) => {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(out(m)) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { P.push(v.x, v.y, v.z); U.push(u[0], u[1]); }
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = pts[i], Bp = pts[i + 1], ax = rings[i], bx = rings[i + 1];
    const out = p => { const t = (p.z - ax.z) / Math.max(1e-6, bx.z - ax.z); return new THREE.Vector3(p.x - ((ax.x || 0) + ((bx.x || 0) - (ax.x || 0)) * t), p.y - ((ax.y || 0) + ((bx.y || 0) - (ax.y || 0)) * t), 0); };
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8, ua0 = [perim[i][k] * uvk, A[k].z * uvk], ua1 = [perim[i][k + 1] * uvk, A[k1].z * uvk];
      const ub0 = [perim[i + 1][k] * uvk, Bp[k].z * uvk], ub1 = [perim[i + 1][k + 1] * uvk, Bp[k1].z * uvk];
      tri(A[k], A[k1], Bp[k1], ua0, ua1, ub1, out); tri(A[k], Bp[k1], Bp[k], ua0, ub1, ub0, out);
    }
  }
  if (caps) for (const [i, dir] of [[0, -1], [rings.length - 1, 1]]) {
    const ring = pts[i], c = new THREE.Vector3(rings[i].x || 0, rings[i].y || 0, rings[i].z);
    if (rings[i].w < 0.05) continue;
    for (let k = 0; k < 8; k++) tri(c, ring[k], ring[(k + 1) % 8], [c.x * uvk, c.y * uvk], [ring[k].x * uvk, ring[k].y * uvk], [ring[(k + 1) % 8].x * uvk, ring[(k + 1) % 8].y * uvk], () => new THREE.Vector3(0, 0, dir));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
}
// A flat shape extruded to a thin plate. pts are [a, b] pairs; plane 'xz' (wings) or 'zy' (fins).
function plateG(pts, thick, plane) {
  const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  if (plane === 'xz') g.rotateX(Math.PI / 2); else g.rotateY(-Math.PI / 2);
  return g;
}
function batch() {
  const b = {};
  return { put: (k, g) => { (b[k] ||= []).push(g.index ? g.toNonIndexed() : g); return g; }, meshes: mats => Object.entries(b).map(([k, list]) => { const m = new THREE.Mesh(mergeGeometries(list), mats[k]); m.name = k; return m; }) };
}
// Glowing dots (lamps, beacons, running lights) as one Points object.
function dots(list, tex, size, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap(d => d.p), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(list.flatMap(d => new THREE.Color(d.c).toArray()), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  p.frustumCulled = false;
  return p;
}

// ---------- A small low-poly person, about six heads tall: officers on the bridge and pilots in the hangar ----------
const personMats = new Map();
// A little of their own colour as glow, so people stay readable inside dim rooms.
const pmat = c => { if (!personMats.has(c)) personMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, emissive: new THREE.Color(c).multiplyScalar(0.3) })); return personMats.get(c); };
const PG = {
  leg: boxG(0.07, 0.3, 0.08).translate(0, -0.15, 0), boot: boxG(0.08, 0.05, 0.12).translate(0, -0.3, -0.02),
  hips: boxG(0.17, 0.09, 0.1), torso: boxG(0.2, 0.23, 0.115), arm: boxG(0.055, 0.25, 0.06).translate(0, -0.125, 0),
  hand: new THREE.IcosahedronGeometry(0.03, 0).translate(0, -0.27, 0), head: new THREE.IcosahedronGeometry(0.062, 1),
  cap: new THREE.SphereGeometry(0.066, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), brim: cylG(0.075, 0.075, 0.012, 12).translate(0, 0.005, -0.03),
  helmet: new THREE.SphereGeometry(0.078, 10, 8), visor: new THREE.SphereGeometry(0.082, 10, 6, Math.PI * 1.5 - 0.85, 1.7, 0.95, 0.75),
};
function makePerson({ suit, skin, cap = null, helmet = null }) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = (geo, c, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, pmat(c)); o.position.set(x, y, z); return o; };
  const legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(0.048 * s, 0.33, 0); l.add(m(PG.leg, suit), m(PG.boot, '#1C1E20')); body.add(l); return l; });
  const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(0.128 * s, 0.56, 0); a.add(m(PG.arm, suit), m(PG.hand, skin)); body.add(a); return a; });
  body.add(m(PG.hips, suit, 0, 0.34, 0), m(PG.torso, suit, 0, 0.47, 0), m(PG.head, skin, 0, 0.655, 0));
  if (cap) body.add(m(PG.cap, cap, 0, 0.665, 0), m(PG.brim, cap, 0, 0.665, 0));
  if (helmet) body.add(m(PG.helmet, helmet, 0, 0.66, 0), m(PG.visor, '#0F1E28', 0, 0.66, 0));
  const p = { group: g, body, legs, arms, seated: false };
  p.pose = (kind, t = 0) => {
    body.position.y = 0; for (const o of [...legs, ...arms]) o.rotation.set(0, 0, 0);
    if (kind === 'walk') { const s = Math.sin(t * 9); legs[0].rotation.x = s * 0.55; legs[1].rotation.x = -s * 0.55; arms[0].rotation.x = -s * 0.45; arms[1].rotation.x = s * 0.45; body.position.y = Math.abs(Math.cos(t * 9)) * 0.012; }
    else if (kind === 'wave') { arms[1].rotation.z = 2.6 + Math.sin(t * 9) * 0.35; arms[0].rotation.z = -0.15; }
    else if (kind === 'sit') { body.position.y = -0.13; legs[0].rotation.x = legs[1].rotation.x = 1.45; arms[0].rotation.x = arms[1].rotation.x = -0.9 + Math.sin(t * 2.3) * 0.08; }
    else if (kind === 'stand') { arms[0].rotation.x = Math.sin(t * 0.7) * 0.1; arms[1].rotation.x = -0.5; arms[1].rotation.z = -0.3; }
  };
  p.pose('stand');
  return p;
}

// ---------- Shared textures and the fighter model ----------
let TX = null;
function textures() {
  if (TX) return TX;
  const armor = armorTexture(); armor.wrapS = armor.wrapT = THREE.RepeatWrapping;
  const deck = deckTexture(); deck.wrapS = deck.wrapT = THREE.RepeatWrapping;
  const rack = rackTexture(); rack.wrapS = rack.wrapT = THREE.RepeatWrapping;
  const win = windowRowsTexture(); win.wrapS = win.wrapT = THREE.RepeatWrapping;
  return TX = { armor, deck, rack, win, decal: fleetDecalTexture(), screen: consoleGlowTexture(), glow: softGlowTexture(), dot: dotTexture() };
}
// Regions of the decal sheet (see fleetDecalTexture).
const DECAL = { badge: [0, 0, 0.25, 0.5], seal: [0.25, 0, 0.5, 0.5], chevron: [0.5, 0, 1, 0.125], letters: [0.5, 0.14, 1, 0.266], stripe: [0.5, 0.281, 1, 0.5], caution: [0, 0.531, 0.5, 0.641],
  bay: i => { const x = 512 + (i % 8) * 64, y = 272 + Math.floor(i / 8) * 56; return [x / 1024, y / 512, (x + 64) / 1024, (y + 56) / 512]; } };

// One fighter, about 3.2 long, nose to -Z, origin where it rests on its skids. Parts are split by material so every
// fighter shares one instanced mesh per part; the pilot parts all sit in fighter space so they share its matrix.
let FG = null;
function fighterGeometry() {
  if (FG) return FG;
  const uvk = 1 / 2, b = {}, put = (k, g) => (b[k] ||= []).push(g.index ? g.toNonIndexed() : g);
  const Y = 0.34;   // lift everything so the skids touch y = 0
  put('body', octLoft([{ z: -1.62, w: 0.05, h: 0.05, y: 0.02 }, { z: -1.15, w: 0.36, h: 0.3 }, { z: -0.5, w: 0.56, h: 0.46, y: 0.03 }, { z: 0.5, w: 0.66, h: 0.5 }, { z: 1.3, w: 0.58, h: 0.42 }, { z: 1.6, w: 0.44, h: 0.34 }], { uvk }));
  for (const s of [-1, 1]) {
    const wing = plateG(s > 0 ? [[0.28, -0.35], [1.45, 0.55], [1.45, 0.95], [0.28, 1.05]] : [[-0.28, -0.35], [-0.28, 1.05], [-1.45, 0.95], [-1.45, 0.55]], 0.05, 'xz');
    put('body', at(wing, 0, -0.07, 0, 0, 0, s * 0.07));
    put('body', at(plateG([[0.85, 0.12], [1.55, 0.12], [1.62, 0.72], [1.38, 0.74]], 0.04, 'zy'), s * 0.24, 0.1, 0, 0, 0, -s * 0.28));
    put('body', at(cylG(0.15, 0.17, 1.05, 10, false, uvk), s * 0.2, -0.07, 1.08, Math.PI / 2));     // engine pods
    put('dark', at(cylG(0.16, 0.13, 0.14, 10, true, uvk), s * 0.2, -0.07, 1.66, Math.PI / 2));      // nozzles
    put('dark', at(boxG(0.12, 0.16, 0.34, uvk), s * 0.33, -0.02, -0.25));                          // intakes
    put('glow', at(new THREE.CircleGeometry(0.12, 10), s * 0.2, -0.07, 1.64));
    put('stripe', at(boxG(0.06, 0.065, 0.44, uvk), s * 1.43, -0.07 + s * 0.1, 0.75));                // wingtip stripes
    put('lights', at(boxG(0.07, 0.05, 0.07), s * 0.75, -0.12, 0.2), s > 0 ? '#FFF6DA' : '#FFF6DA');
    put('dark', at(boxG(0.04, 0.24, 0.04), s * 0.22, -0.3, 0.75)); put('dark', at(boxG(0.06, 0.03, 0.22), s * 0.22, -0.42, 0.75));   // skids
  }
  put('dark', at(boxG(0.04, 0.22, 0.04), 0, -0.28, -0.85)); put('dark', at(boxG(0.06, 0.03, 0.16), 0, -0.4, -0.85));
  put('stripe', octLoft([{ z: 0.12, w: 0.69, h: 0.53 }, { z: 0.38, w: 0.69, h: 0.53 }], { uvk, caps: false }));
  put('stripe', at(boxG(0.1, 0.03, 0.7, uvk), 0, 0.255, 0.75));
  put('canopy', at(new THREE.SphereGeometry(1, 14, 8).scale(0.2, 0.17, 0.52), 0, 0.22, -0.55));
  put('dark', at(boxG(0.03, 0.03, 0.9), 0, 0.37, -0.55));                                          // canopy frame
  put('helmet', at(new THREE.SphereGeometry(0.1, 10, 8), 0, 0.27, -0.5));
  put('visor', at(new THREE.SphereGeometry(0.105, 10, 6, Math.PI * 1.5 - 0.85, 1.7, 0.95, 0.7), 0, 0.27, -0.5));
  put('suit', at(boxG(0.28, 0.12, 0.16), 0, 0.13, -0.47));
  // Wingtip running lights: blue on the left, green on the right, and a white tail light.
  const lamp = (x, y, z, c) => { const g = boxG(0.07, 0.07, 0.07).translate(x, y, z).toNonIndexed(), col = new THREE.Color(c); g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => col.toArray()).flat(), 3)); return g; };
  b.lights = [lamp(-1.47, -0.17, 0.95, '#6FB8FF'), lamp(1.47, 0.03, 0.95, '#7FF0B0'), lamp(0, 0.18, 1.62, '#FFFFFF'), lamp(-0.75, -0.12, 0.2, '#FFF6DA'), lamp(0.75, -0.12, 0.2, '#FFF6DA')];
  const far = [octLoft([{ z: -1.6, w: 0.08, h: 0.08 }, { z: -0.4, w: 0.6, h: 0.48 }, { z: 1.6, w: 0.5, h: 0.4 }], { uvk }), at(boxG(2.9, 0.06, 0.9), 0, -0.07, 0.55)];
  FG = {};
  for (const [k, list] of Object.entries(b)) FG[k] = mergeGeometries(list.map(g => { g.deleteAttribute('normal'); g.computeVertexNormals(); if (k !== 'lights' && g.attributes.color) g.deleteAttribute('color'); return g; })).translate(0, Y, 0);
  FG.far = mergeGeometries(far.map(g => g.index ? g.toNonIndexed() : g)).translate(0, Y, 0);
  return FG;
}

// ---------- The mothership, one per tier, built when first needed ----------
// Rim light and lit windows are added to the armour in the shader, so the paint stays the same: windows come in rows in
// the ship's own space (they don't slide when it moves), whole districts are lit or dark, and far away the pattern fades
// smoothly into its average glow instead of shimmering.
const HULL_UNIFORMS = { rimColor: { value: new THREE.Color('#3C4652') }, winColor: { value: new THREE.Color('#FFDCA8') } };
// Windows are person-sized on the frigate and a little larger on the bigger ships, so they still read as rows of light.
const winScale = L => clamp(Math.sqrt(L / 460), 1, 3);
const WIN_GLSL = `{
  float side = 1.0 - smoothstep(0.3, 0.55, abs(vFN.y));
  vec2 wp = vec2(abs(vFN.x) > abs(vFN.z) ? vFP.z : vFP.x, vFP.y) / winSize;   // person-sized windows (bigger on bigger ships), decks about two people tall
  vec2 cell = floor(wp), f = fract(wp);
  float deck = step(0.42, fh(vec2(cell.y, 17.0)));                 // whole decks are lit or dark: rows of light
  float lit = step(0.3, fh(cell)) * deck;
  float shape = step(0.2, f.x) * step(f.x, 0.72) * step(0.35, f.y) * step(f.y, 0.72);
  vec2 fw = fwidth(wp);
  float w = mix(lit * shape, deck * 0.7 * 0.19, smoothstep(0.35, 1.0, fw.x));      // windows blur into lit lines
  w = mix(w, 0.58 * 0.7 * 0.19, smoothstep(0.35, 1.0, fw.y));                      // lines blur into a soft even glow
  totalEmissiveRadiance += winColor * w * side * mix(1.0, 0.45, smoothstep(0.35, 1.0, fw.x));   // far away the glow is softer
}`;
function hullShader(m, windows, wk = 1) {
  const winSize = { value: new THREE.Vector2(0.8 * wk, 1.6 * wk) };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, HULL_UNIFORMS, { winSize });
    sh.vertexShader = 'varying vec3 vFP; varying vec3 vFN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fp4 = vec4(transformed, 1.0); vec3 fn3 = objectNormal;
      #ifdef USE_INSTANCING
        fp4 = instanceMatrix * fp4; fn3 = mat3(instanceMatrix) * fn3;
      #endif
      vFP = fp4.xyz; vFN = normalize(fn3);`);
    sh.fragmentShader = 'uniform vec3 rimColor; uniform vec3 winColor; uniform vec2 winSize; varying vec3 vFP; varying vec3 vFN;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n'
      + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${windows ? WIN_GLSL : ''}
      totalEmissiveRadiance += rimColor * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 4.0);`);
  };
  m.customProgramCacheKey = () => 'fleet-hull-' + (windows ? 1 : 0);
  return m;
}
function shipMaterials(tx, tier) {
  // A faint glow from the armour itself keeps the shaded side readable (panel lines and rivets still show) without lifting the dark paint.
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, map: tx.armor, roughness: 0.82, metalness: 0.2, emissive: '#1C2024', emissiveMap: tx.armor, ...o });
  const wk = winScale(TIERS[tier].L);
  return {
    black: hullShader(std('#34383C'), true, wk), steel: hullShader(std('#5C636A'), true, wk), green: hullShader(std('#3E6049'), false),
    dark: hullShader(std('#1A1C1E', { roughness: 0.6, emissive: '#0C0E10' }), false), plain: hullShader(std('#34383C'), false),
    interior: std('#6B7378', { emissive: '#3A4146', emissiveMap: tx.armor, emissiveIntensity: 0.55 }),
    deck: new THREE.MeshStandardMaterial({ map: tx.deck, roughness: 0.9, emissive: '#FFFFFF', emissiveMap: tx.deck, emissiveIntensity: 0.32 }),
    rack: new THREE.MeshStandardMaterial({ map: tx.rack, roughness: 0.8, emissive: '#FFFFFF', emissiveMap: tx.rack, emissiveIntensity: 0.4 }),
    fuel: new THREE.MeshStandardMaterial({ color: '#3E6B4A', roughness: 0.5, metalness: 0.3, emissive: '#1C3324' }),
    win: new THREE.MeshBasicMaterial({ map: tx.win }), lamp: new THREE.MeshBasicMaterial({ color: '#DDF4FF' }), lampG: new THREE.MeshBasicMaterial({ color: '#8FF0C0' }),
    engine: new THREE.MeshBasicMaterial({ color: '#A8E4FF' }), screen: new THREE.MeshBasicMaterial({ map: tx.screen }), bayGlow: new THREE.MeshBasicMaterial({ color: '#8C7A55' }),
    glass: new THREE.MeshStandardMaterial({ color: '#16303E', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.32, depthWrite: false }),
    decal: new THREE.MeshStandardMaterial({ map: tx.decal, roughness: 0.75, alphaTest: 0.5 }),
    serial: new THREE.MeshStandardMaterial({ map: serialTexture(TIERS[tier].serial), roughness: 0.75, alphaTest: 0.4 }),
  };
}
// A tower or block lofted upward: rings [{ y, w (across), d (front to back) }], centred on x, z.
const upLoft = (rings, x, z, o) => octLoft(rings.map(r => ({ z: r.y, w: r.w, h: r.d, c: r.c })), o).rotateX(-Math.PI / 2).translate(x, 0, z);
const seeded = seed => { let s = seed; return () => hashN(s++ * 7919 + 13); };

function buildMothership(key) {
  // Small ships get a chunkier body, so the fighter-sized bay still fits inside the hull's outline.
  const t = TIERS[key], L = t.L, W = Math.max(L * 0.17, 17), H = Math.max(L * 0.075, 11), k = L / 60, tx = textures(), rnd = seeded(t.seed);

  const mats = shipMaterials(tx, key);
  const B = batch(), Bd = batch(), put = B.put, putD = Bd.put;
  const root = new THREE.Group(); root.name = 'mothership-' + key;
  const core = new THREE.Group(), detail = new THREE.Group();
  root.add(core, detail);
  // Solid volumes in ship space. `boxes` are coarse boxes the fighters steer around. `shapes` follow the hull closely and are
  // what the player's ship (and the cameras) bump into: tapered octagonal sections for the main hull, decks, keel, wings and
  // engine block (the same outlines as the armour), and boxes for towers, bay blocks, buildings, dishes and turret bases.
  const boxes = [], shapes = [];
  const solidF = (x0, y0, z0, x1, y1, z1) => boxes.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
  const shapeBox = (b, city = false) => shapes.push({ k: 0, b, city });
  const solid = (...a) => { solidF(...a); shapeBox(boxes[boxes.length - 1]); };
  // One tapered octagonal section per pair of rings, matching octLoft (rings along z, centred at x, y).
  const loftShape = (rings, ck = 0.22) => {
    const sec = r => { const hw = r.w / 2, hh = r.h / 2; return [r.x || 0, r.y || 0, hw, hh, Math.min(r.c ?? Math.min(r.w, r.h) * ck, hw * 0.9, hh * 0.9)]; };
    for (let i = 0; i < rings.length - 1; i++) shapes.push({ k: 1, z0: rings[i].z, z1: rings[i + 1].z, a: sec(rings[i]), b: sec(rings[i + 1]) });
  };
  const lift = Math.max(0.05, L * 0.00025);     // markings sit this far off the armour

  // ----- Layout. The main deck is the widest; decks above step back; a keel runs below; wings of armour on both sides. -----
  const zn = -0.3 * L, zt = 0.4 * L, eLen = 0.05 * L;
  const D = { key, L, W, H, k, boxes, radius: L * 0.56, bays: [], slots: 0, slotRefs: [] };

  // Main deck: a long pointed prow, then armoured segments with dark ribs and green bands.
  const prow = [{ z: -L / 2, w: W * 0.04, h: H * 0.12, y: -H * 0.15 }, { z: -0.42 * L, w: W * 0.4, h: H * 0.55, y: -H * 0.1 }, { z: zn, w: W, h: H }];
  put('black', octLoft(prow)); loftShape(prow); loftShape([{ z: zn, w: W, h: H }, { z: zt, w: W, h: H }]);
  const gap = 0.012 * L, segLen = (zt - zn - (t.segs - 1) * gap) / t.segs, segs = [];
  for (let i = 0; i < t.segs; i++) {
    const z0 = zn + i * (segLen + gap), z1 = z0 + segLen; segs.push([z0, z1]);
    put(i % 2 ? 'steel' : 'black', octLoft([{ z: z0, w: W * 0.95, h: H * 0.93 }, { z: z0 + 0.006 * L, w: W, h: H }, { z: z1 - 0.006 * L, w: W, h: H }, { z: z1, w: W * 0.95, h: H * 0.93 }]));
    put('green', octLoft([{ z: z0 + 0.008 * L, w: W * 1.012, h: H * 1.012 }, { z: z0 + 0.016 * L, w: W * 1.012, h: H * 1.012 }], { caps: false }));
    if (i < t.segs - 1) put('dark', octLoft([{ z: z1 - 0.1, w: W * 0.9, h: H * 0.88 }, { z: z1 + gap + 0.1, w: W * 0.9, h: H * 0.88 }], { caps: false }));
  }
  solidF(-W / 2, -H / 2, -L / 2, W / 2, H / 2, zt);
  // Keel below, and two stepped decks above, set back from the prow.
  const keel = [{ z: -0.36 * L, w: W * 0.2, h: H * 0.2, y: -H * 0.55 }, { z: -0.28 * L, w: W * 0.5, h: H * 0.4, y: -H * 0.62 }, { z: 0.38 * L, w: W * 0.5, h: H * 0.4, y: -H * 0.62 }, { z: 0.44 * L, w: W * 0.36, h: H * 0.3, y: -H * 0.58 }];
  put('black', octLoft(keel)); loftShape(keel);
  solidF(-W * 0.25, -H * 0.82, -0.36 * L, W * 0.25, -H * 0.42, 0.44 * L);
  const upper = [{ z: -0.24 * L, w: W * 0.3, h: H * 0.2, y: H * 0.52 }, { z: -0.14 * L, w: W * 0.74, h: H * 0.5, y: H * 0.72 }, { z: 0.4 * L, w: W * 0.74, h: H * 0.5, y: H * 0.72 }, { z: 0.44 * L, w: W * 0.6, h: H * 0.4, y: H * 0.68 }];
  put('steel', octLoft(upper)); loftShape(upper);
  solidF(-W * 0.37, H * 0.42, -0.24 * L, W * 0.37, H * 0.97, 0.44 * L);
  const topX = W * 0.04;
  const topDeck = [{ z: -0.04 * L, w: W * 0.24, h: H * 0.2, y: H * 1.06, x: topX }, { z: 0.02 * L, w: W * 0.46, h: H * 0.34, y: H * 1.12, x: topX }, { z: 0.34 * L, w: W * 0.46, h: H * 0.34, y: H * 1.12, x: topX }, { z: 0.38 * L, w: W * 0.36, h: H * 0.26, y: H * 1.1, x: topX }];
  put('black', octLoft(topDeck)); loftShape(topDeck);
  solidF(topX - W * 0.23, H * 0.95, -0.04 * L, topX + W * 0.23, H * 1.29, 0.38 * L);
  // Green trim bands along the step edges.
  for (const s of [-1, 1]) {
    put('green', at(boxG(W * 0.02, H * 0.03, 0.5 * L), s * W * 0.37, H * 0.95, 0.15 * L));
    put('green', at(boxG(W * 0.015, H * 0.025, 0.3 * L), topX + s * W * 0.23, H * 1.27, 0.18 * L));
  }
  // Wings of armour, slightly different on each side, as if added at different times.
  const wing = (s, z0, z1, y, span) => {
    const x = s * (W / 2 + span / 2 - W * 0.02);
    const wr = [{ z: z0, w: span * 0.3, h: H * 0.06, x: x + s * span * 0.25, y }, { z: z0 + 0.08 * L, w: span, h: H * 0.13, x, y },
      { z: z1 - 0.06 * L, w: span, h: H * 0.13, x, y }, { z: z1, w: span * 0.5, h: H * 0.08, x: x - s * span * 0.2, y }];
    put(s < 0 ? 'steel' : 'black', octLoft(wr)); loftShape(wr);
    put('green', at(boxG(span * 0.9, H * 0.02, 0.01 * L), x, y + H * 0.066, z0 + 0.1 * L));
    solidF(x - span / 2, y - H * 0.07, z0, x + span / 2, y + H * 0.07, z1);
    return x + s * span / 2;
  };
  const nb = boxes.length;
  const tipL = wing(-1, -0.16 * L, 0.24 * L, H * 0.24, W * 0.34), tipR = wing(1, -0.22 * L, 0.34 * L, H * 0.18, W * 0.42);
  const wingBoxes = boxes.slice(nb);

  // ----- The engine array: a block across the stern with many big engines in a grid. -----
  const eng = [{ z: zt - 0.01 * L, w: W * 0.98, h: H * 1.8, y: H * 0.15 }, { z: L / 2, w: W * 0.9, h: H * 1.65, y: H * 0.15 }];
  put('black', octLoft(eng)); loftShape(eng);
  solidF(-W * 0.49, -H * 0.75, zt - 0.01 * L, W * 0.49, H * 1.05, L / 2 + eLen);
  shapeBox([-W * 0.43, H * 0.15 - H * 0.74, L / 2, W * 0.43, H * 0.15 + H * 0.74, L / 2 + eLen]);   // the engine bells
  const [rows, cols] = t.engines, sx = W * 0.84 / cols, sy = H * 1.45 / rows, re = Math.min(sx, sy) * 0.43, engines = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c - (cols - 1) / 2) * sx, y = H * 0.15 + (r - (rows - 1) / 2) * sy, big = re * (r === 0 && rows > 2 ? 0.8 : 1);
    put('dark', at(cylG(big * 1.1, big * 0.9, eLen, 16, true), x, y, L / 2 + eLen / 2 - 0.003 * L, Math.PI / 2));
    put('steel', at(cylG(big * 1.18, big * 1.18, eLen * 0.3, 16), x, y, L / 2, Math.PI / 2));
    put('green', at(cylG(big * 1.2, big * 1.2, eLen * 0.06, 16, true), x, y, L / 2 + eLen * 0.25, Math.PI / 2));
    put('engine', at(new THREE.CircleGeometry(big * 0.84, 16), x, y, L / 2 + eLen * 0.5));
    engines.push({ p: [x, y, L / 2 + eLen * 0.8], c: '#7FCBFF' });
  }
  // Two smaller thrusters at the wing tips.
  for (const [x, y] of [[tipL + W * 0.04, H * 0.24], [tipR - W * 0.04, H * 0.18]]) {
    put('dark', at(cylG(H * 0.07, H * 0.06, 0.05 * L, 12, true), x, y, 0.26 * L + (x > 0 ? 0.1 * L : 0), Math.PI / 2));
    put('engine', at(new THREE.CircleGeometry(H * 0.055, 12), x, y, 0.285 * L + (x > 0 ? 0.1 * L : 0)));
    engines.push({ p: [x, y, 0.3 * L + (x > 0 ? 0.1 * L : 0)], c: '#7FCBFF' });
  }

  // ----- The command tower: a massive stepped tower on the top deck, with the bridge on its front near the top. -----
  const tzC = 0.2 * L, txC = topX + W * 0.02, base = H * 1.29;
  const tiers = [[W * 0.22, 0.13 * L, H * 0.5], [W * 0.16, 0.095 * L, H * 0.45], [W * 0.11, 0.065 * L, H * 0.38]];
  let ty = base;
  for (const [i, [w, d, h]] of tiers.entries()) {
    put(i % 2 ? 'steel' : 'black', upLoft([{ y: ty, w, d }, { y: ty + h * 0.92, w, d }, { y: ty + h, w: w * 0.9, d: d * 0.9 }], txC, tzC));
    put('green', upLoft([{ y: ty + h * 0.8, w: w * 1.01, d: d * 1.01 }, { y: ty + h * 0.84, w: w * 1.01, d: d * 1.01 }], txC, tzC, { caps: false }));
    solid(txC - w / 2, ty, tzC - d / 2, txC + w / 2, ty + h, tzC + d / 2);
    ty += h;
  }
  const towerTop = ty, [w3, d3] = tiers[2];
  // Sensor spires on top of the tower.
  const spires = [];
  for (const [ox, oz, hh] of [[-w3 * 0.3, d3 * 0.2, H * 0.7], [w3 * 0.25, -d3 * 0.1, H * 0.45], [0, d3 * 0.35, H * 0.3]]) {
    put('steel', at(cylG(L * 0.0012, L * 0.004, hh, 8), txC + ox, towerTop + hh / 2, tzC + oz));
    spires.push([txC + ox, towerTop + hh, tzC + oz]);
  }
  // The bridge: a hollow, human-sized room with a sloped glass front, lit consoles and officers inside.
  const bw = 6, bd = 4.2, bh = 1.7, by = towerTop - H * 0.12, bz = tzC - d3 / 2 - bd / 2 + 0.3, bx = txC;
  putD('steel', at(boxG(bw, 0.15, bd), bx, by + 0.075, bz));
  putD('black', at(boxG(bw + 0.4, 0.25, bd + 0.6), bx, by + bh + 0.12, bz + 0.1));
  putD('interior', at(boxG(bw, bh, 0.15), bx, by + bh / 2, bz + bd / 2));
  for (const s of [-1, 1]) putD('steel', at(boxG(0.15, bh, bd), bx + s * bw / 2, by + bh / 2, bz));
  const slope = 0.35, gh = bh * 0.8, gz = bz - bd / 2;
  putD('steel', at(boxG(bw, bh * 0.2, 0.2), bx, by + bh * 0.1, gz));
  putD('glass', at(new THREE.PlaneGeometry(bw - 0.1, gh / Math.cos(slope)), bx, by + bh * 0.2 + gh / 2, gz + Math.tan(slope) * gh / 2, -slope, Math.PI));
  for (let i = 0; i <= 4; i++) putD('black', at(boxG(0.08, gh / Math.cos(slope), 0.08), bx - bw / 2 + 0.05 + i * (bw - 0.1) / 4, by + bh * 0.2 + gh / 2, gz + Math.tan(slope) * gh / 2, slope));
  putD('lamp', at(boxG(bw * 0.8, 0.04, 0.12), bx, by + bh - 0.03, bz + bd * 0.1));
  // The authority seal on both sides of the tower.
  for (const s of [-1, 1]) putD('decal', at(decalG(H * 0.4, H * 0.4, DECAL.seal), txC + s * (tiers[0][0] / 2 + lift), base + H * 0.25, tzC, 0, s * Math.PI / 2));

  // ----- Smaller towers, grown here and there over the years. -----
  const towerSpots = [];
  for (let i = 0; i < t.towers; i++) {
    const onTop = rnd() < 0.4, x = onTop ? topX + (rnd() - 0.5) * W * 0.36 : (rnd() < 0.5 ? -1 : 1) * W * (0.2 + rnd() * 0.12);
    const z = onTop ? 0.0 * L + rnd() * 0.32 * L : -0.12 * L + rnd() * 0.5 * L;
    if (Math.abs(z - tzC) < 0.09 * L && Math.abs(x - txC) < W * 0.16) continue;
    const y0 = onTop ? H * 1.27 : H * 0.95, w = W * (0.04 + rnd() * 0.06), d = w * (0.8 + rnd() * 0.6), h = H * (0.25 + rnd() * 0.6);
    put(rnd() < 0.5 ? 'steel' : 'black', upLoft([{ y: y0, w, d }, { y: y0 + h * 0.7, w, d }, { y: y0 + h * 0.75, w: w * 0.75, d: d * 0.75 }, { y: y0 + h, w: w * 0.7, d: d * 0.7 }], x, z));
    solid(x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2);
    towerSpots.push([x, y0 + h, z]);
    if (rnd() < 0.6) { const sh = h * 0.5; put('steel', at(cylG(L * 0.0008, L * 0.0025, sh, 6), x, y0 + h + sh / 2, z)); spires.push([x, y0 + h + sh, z]); }
  }
  // Sensor spires on the prow.
  for (const [ox, h] of [[-W * 0.12, H * 0.5], [W * 0.1, H * 0.35], [0, H * 0.7]]) {
    put('steel', at(cylG(L * 0.001, L * 0.004, h, 8), ox, H * 0.45 + h / 2, -0.26 * L));
    spires.push([ox, H * 0.45 + h, -0.26 * L]);
  }
  for (const p of spires) solid(p[0] - 1, H * 0.4, p[2] - 1, p[0] + 1, p[1], p[2] + 1);

  // ----- Cargo gantries along the upper deck, with containers under them. -----
  for (let i = 0; i < Math.round(3 + L / 300); i++) {
    const z = -0.1 * L + i * 0.045 * L, span = W * 0.5, ph = H * 0.12, th = L * 0.003;
    if (Math.abs(z - tzC) < 0.09 * L) continue;
    for (const s of [-1, 1]) put('steel', at(boxG(th, ph, th), s * span / 2, H * 0.97 + ph / 2, z));
    put('steel', at(boxG(span, th * 1.5, th * 1.5), 0, H * 0.97 + ph, z));
    for (let c = 0; c < 3; c++) if (rnd() < 0.7) put(['green', 'steel', 'dark'][Math.floor(rnd() * 3)], at(boxG(span * 0.18, ph * 0.3, 0.02 * L), (c - 1) * span * 0.28, H * 0.97 + ph * 0.15, z + 0.012 * L));
  }

  // ----- Hangar bays: many, all over the hull. -----
  // Every bay is built once in its own frame: the mouth at x = 0 (out is -x), the bay going in toward +x, its floor at
  // y = 0, and parking spots side by side along z. Then it's placed on the hull and turned to face out (theta about y):
  // left flank, right flank (turned round), upper decks, under the keel, and a flight deck at the rear facing aft.
  // A bay is only built if its open mouth and its launch lane are clear of everything solid, and its block doesn't cut
  // into another bay or the wings, so no fighter ever flies through the hull.
  // Bays grow with the ship (settings.js): each is built at fighter scale in its own frame and placed with a scale BS, so a
  // big ship's bays are big enough to fly the player's ship into. Fighters and people keep their own size.
  const BH = 7, BD = 12, BF = BD + 3;       // bay height, depth, and how far its block stands out from the hull (in the bay's frame)
  const BS = MS.bayScale[key] || 1; D.BS = BS;
  const keepOut = [], bays = D.bays, YAX = new THREE.Vector3(0, 1, 0), ONE3 = new THREE.Vector3(1, 1, 1), BS3 = new THREE.Vector3(BS, BS, BS);
  const tb = (M, b) => { const a = new THREE.Vector3(b[0], b[1], b[2]).applyMatrix4(M), c = new THREE.Vector3(b[3], b[4], b[5]).applyMatrix4(M); return [Math.min(a.x, c.x), Math.min(a.y, c.y), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.y, c.y), Math.max(a.z, c.z)]; };
  const overlap = (a, b, pad = 0) => a[0] < b[3] + pad && a[3] > b[0] - pad && a[1] < b[4] + pad && a[4] > b[1] - pad && a[2] < b[5] + pad && a[5] > b[2] - pad;
  const chevrons = (p, len, h, x, y, zc, ry) => { const n = Math.max(1, Math.round(len / (h * 8))), w = len / n; for (let i = 0; i < n; i++) p('decal', at(decalG(w, h, DECAL.chevron), x, y, zc - len / 2 + w * (i + 0.5), 0, ry)); };
  const beacons = [];
  function tryBay({ origin, theta, slots: n, main = false, kind }) {
    const HL = main ? 1 + n * SP + PAD + ASM + 1 : 2 + n * SP, zs = -HL / 2, ze = HL / 2;
    const Q = new THREE.Quaternion().setFromAxisAngle(YAX, theta), M = new THREE.Matrix4().compose(origin, Q, BS3);
    const cav = tb(M, [0, 0, zs, BD, BH, ze]), lane = tb(M, [-48, -0.5, zs - 0.5, 0, 4.5, ze + 0.5]);
    const blocks = [[0, -3, zs - 4, BF + 2, 0, ze + 4], [0, BH, zs - 4, BF + 2, BH + 2.5, ze + 4], [0, 0, zs - 4, BF + 2, BH, zs], [0, 0, ze, BF + 2, BH, ze + 4], [BD, 0, zs, BF + 2, BH, ze]];
    const blocksS = blocks.map(b => tb(M, b));
    if (boxes.some(b => overlap(b, cav) || overlap(b, lane))) return null;
    if (keepOut.some(b => blocksS.some(k => overlap(b, k)))) return null;
    if (wingBoxes.some(w => blocksS.some(k => overlap(w, k, 0.5)))) return null;
    keepOut.push(cav, lane);
    const bay = { index: bays.length, kind, main, M, Minv: M.clone().invert(), Q, theta, slots: n, HL, zs, ze, BD, BH, first: D.slots,
      slotX: BD * 0.5 + 0.3, slotZ: i => zs + 1 + (i + 0.5) * SP, padZ: zs + 1 + n * SP + PAD / 2, zp: ze - 1 - ASM, zA: ze - 1 - ASM / 2 };
    bay.center = new THREE.Vector3(BD / 2, BH / 2, 0).applyMatrix4(M);
    bay.crewDoor = main ? new THREE.Vector3(BD - 0.6, 0, bay.padZ + 1.6) : new THREE.Vector3(BD - 0.6, 0, ze - 1.2);
    for (let i = 0; i < n; i++) D.slotRefs.push({ bay, i });
    D.slots += n; bays.push(bay);
    // The block around the bay (seen from far, so it's part of the main hull mesh) and its solid volumes.
    blocks.forEach((b, j) => { put(j < 2 ? 'plain' : 'dark', at(boxG(b[3] - b[0], b[4] - b[1], b[5] - b[2]), (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2).applyMatrix4(M)); boxes.push(blocksS[j]); shapeBox(blocksS[j]); });
    put('bayGlow', at(new THREE.PlaneGeometry(HL, BH * 0.9), BD - 0.02, BH / 2, 0, 0, -Math.PI / 2).applyMatrix4(M));   // a lit opening from far (behind the inside's back wall, so it's hidden up close)
    put('green', at(boxG(0.4, 0.35, HL + 8), 0.2, -0.15, 0).applyMatrix4(M)); put('green', at(boxG(0.4, 0.35, HL + 8), 0.2, BH + 0.15, 0).applyMatrix4(M));
    // Guide beacons on booms at both ends of the mouth: the moving lights you see from far away.
    for (const z of [zs - 2, ze + 2]) for (const y of [-0.4, BH + 0.4]) {
      put('steel', at(boxG(6, 0.3, 0.3), -3, y, z).applyMatrix4(M)); put('dark', at(boxG(0.5, 0.5, 0.5), -6, y, z).applyMatrix4(M));
      beacons.push({ p: new THREE.Vector3(-6, y, z).applyMatrix4(M).toArray(), c: z < 0 ? '#7FF0B0' : '#7FCBFF', bay: bay.index });
    }
    // The inside, built in the bay's own frame and drawn only when the camera is near.
    const Bi = batch(), pb = Bi.put, hmid = BD / 2;
    pb('interior', at(boxG(0.4, BH, HL), BD - 0.2, BH / 2, 0));
    chevrons(pb, HL - 1.2, 0.5, -0.02, -0.45, 0, -Math.PI / 2); chevrons(pb, HL - 1.2, 0.5, -0.02, BH + 0.45, 0, -Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const z = bay.slotZ(i), dg = new THREE.PlaneGeometry(BD - 0.4, SP), uv = dg.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getY(j), uv.getX(j));
      pb('deck', at(dg, hmid + 0.2, 0.01, z, -Math.PI / 2));
      pb('decal', at(decalG(1.1, 0.95, DECAL.bay((bay.first + i) % 16)), 1.1, 0.03, z, -Math.PI / 2));
      pb('steel', at(boxG(BD * 0.92, 0.22, 0.22), hmid, BH - 0.3, z));
      pb('dark', at(boxG(0.5, 0.25, 0.4), bay.slotX + 0.35, BH - 0.5, z));
      pb('lamp', at(boxG(BD * 0.7, 0.06, 0.22), hmid, BH - 0.05, z + SP / 2));
      if (i % 2 === 0) for (let r = 0; r < 3; r++) { pb('fuel', at(cylG(0.2, 0.2, 2.6, 10), BD - 0.55, 0.3 + r * 0.46, z, Math.PI / 2)); pb('dark', at(cylG(0.21, 0.21, 0.12, 10), BD - 0.55, 0.3 + r * 0.46, z + 1.3, Math.PI / 2)); }
      else for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) pb(c % 3 ? 'steel' : 'green', at(boxG(0.55, 0.42, 0.6), BD - 0.5, 0.22 + r * 0.46, z - 1.1 + c * 0.72));
      pb('rack', at(new THREE.PlaneGeometry(SP - 0.4, BH * 0.4), BD - 0.41, BH * 0.78, z, 0, -Math.PI / 2));
      pb('steel', at(boxG(0.1, BH * 0.55, 0.1), BD - 1.0, BH * 0.275, z + SP / 2));
    }
    const catY = BH * 0.55, catLen = HL - 2;
    pb('steel', at(boxG(1.1, 0.1, catLen), BD - 0.75, catY, 0)); pb('steel', at(boxG(0.05, 0.05, catLen), BD - 1.27, catY + 0.5, 0));
    for (let z = zs + 1.5; z < ze - 1; z += 2) pb('steel', at(boxG(0.05, 0.5, 0.05), BD - 1.27, catY + 0.25, z));
    pb('steel', at(boxG(0.9, 0.08, BH * 0.75), BD - 0.75, BH * 0.28, zs + 1.4 + BH * 0.3, Math.atan2(BH * 0.55, BH * 0.6)));
    pb('dark', at(boxG(0.1, 1.0, 0.6), BD - 0.42, 0.5, bay.crewDoor.z)); pb('lampG', at(boxG(0.06, 0.06, 0.7), BD - 0.45, 1.05, bay.crewDoor.z));
    if (main) {
      // The assembly bay at the end, behind a shutter, where new fighters roll out.
      const DW = 3.8, DH = 2.6, dx = bay.slotX; bay.DW = DW; bay.DH = DH;
      pb('black', at(boxG(dx - DW / 2, BH, 0.4), (dx - DW / 2) / 2, BH / 2, bay.zp)); pb('black', at(boxG(BD - (dx + DW / 2), BH, 0.4), (BD + dx + DW / 2) / 2, BH / 2, bay.zp));
      pb('black', at(boxG(DW, BH - DH, 0.4), dx, DH + (BH - DH) / 2, bay.zp)); chevrons(pb, DW, 0.3, dx, DH + 0.2, bay.zp - 0.21, Math.PI);
      pb('black', at(boxG(0.5, BH, ASM), 0.25, BH / 2, bay.zA)); pb('decal', at(decalG(ASM * 0.8, ASM * 0.1, DECAL.caution), -0.02, BH * 0.5, bay.zA, 0, -Math.PI / 2));
      pb('deck', at(new THREE.PlaneGeometry(BD - 0.6, ASM), hmid + 0.2, 0.01, bay.zA, -Math.PI / 2));
      for (const s2 of [-1, 1]) pb('steel', at(boxG(0.25, BH - 0.3, 0.25), dx + s2 * 2.2, (BH - 0.3) / 2, bay.zA));
      pb('steel', at(boxG(4.6, 0.25, 0.25), dx, BH - 0.4, bay.zA)); pb('lamp', at(boxG(3, 0.05, 0.3), dx, BH - 0.06, bay.zA));
      pb('decal', at(decalG(BH * 0.6, BH * 0.6, DECAL.badge), hmid, BH * 0.5, zs - 4.03, 0, Math.PI));
    }
    bay.group = new THREE.Group(); bay.group.matrixAutoUpdate = false; bay.group.matrix.copy(M); bay.group.visible = false;
    for (const m of Bi.meshes(mats)) bay.group.add(m);
    root.add(bay.group);
    return bay;
  }
  // Where bays may go: rails along the hull, each a side, a height and a stretch of hull.
  const BHw = BH * BS, BFw = BF * BS;      // the same, in ship space
  const flankY = Math.min(-0.36 * H, H * 0.11 - 1 - 2.5 * BS - BHw);   // low enough that a bay's block stays under the wings
  const RAILS = {
    portFlank: { x: -(W / 2 + BFw), y: flankY, z0: zn + 4, z1: zt - 4, theta: 0 },
    stbdFlank: { x: W / 2 + BFw, y: flankY, z0: zn + 4, z1: zt - 4, theta: Math.PI },
    portUpper: { x: -(0.37 * W + BFw), y: 0.55 * H, z0: -0.12 * L, z1: 0.42 * L, theta: 0 },
    stbdUpper: { x: 0.37 * W + BFw, y: 0.55 * H, z0: -0.12 * L, z1: 0.42 * L, theta: Math.PI },
    portUnder: { x: -(0.25 * W + BFw), y: -0.8 * H, z0: -0.27 * L, z1: 0.36 * L, theta: 0 },
    stbdUnder: { x: 0.25 * W + BFw, y: -0.8 * H, z0: -0.27 * L, z1: 0.36 * L, theta: Math.PI },
  };
  const BAY_PLAN = {
    frigate: [['portFlank', [3], true], ['stbdFlank', [3]]],
    cruiser: [['portFlank', [6, 3, 3], true], ['stbdFlank', [3, 3, 3, 3]], ['rear', [5]], ['portUnder', [3]], ['stbdUnder', [3]]],
    carrier: [['portFlank', [6, 4, 4, 4, 4, 4, 4, 4], true], ['stbdFlank', [4, 4, 4, 4, 4, 4, 4, 4]], ['rear', [6]], ['portUpper', [3, 3, 3]], ['stbdUpper', [3, 3, 3, 3]],
      ['portUnder', [3, 3, 3]], ['stbdUnder', [3, 3, 3]]],
  }[key];
  const target = { frigate: 2, cruiser: 8, carrier: 30 }[key];
  for (const [rail, sizes, hasMain] of BAY_PLAN) {
    if (bays.length >= target) break;
    if (rail === 'rear') { tryBay({ origin: new THREE.Vector3(0, H * 1.05 + 1.2 * BS, L / 2), theta: Math.PI / 2, slots: sizes[0], kind: 'rear' }); continue; }   // on top of the engine block, its lane clear above the engines
    // Spread this rail's bays evenly along its stretch of hull.
    const R0 = RAILS[rail], lens = sizes.map((n, i) => ((hasMain && i === 0 ? 1 + n * SP + PAD + ASM + 1 : 2 + n * SP) + 9) * BS);
    const free = (R0.z1 - R0.z0) - lens.reduce((a, b) => a + b, 0), gap = free / (sizes.length + 1);
    let z = R0.z0 + Math.max(0, gap);
    sizes.forEach((n, i) => {
      if (bays.length >= target) return;
      const zc = z + lens[i] / 2; z += lens[i] + Math.max(0, gap);
      if (gap < 0 && zc + lens[i] / 2 > R0.z1) return;
      tryBay({ origin: new THREE.Vector3(R0.x, R0.y, zc), theta: R0.theta, slots: n, main: hasMain && i === 0 && !bays.some(b => b.main), kind: rail });
    });
  }
  // There must always be a main bay (new fighters roll out of it): if the plan didn't fit one, put a small one wherever it fits.
  if (!bays.some(b => b.main)) for (const rail of ['portFlank', 'stbdFlank', 'portUnder', 'stbdUnder']) {
    const R0 = RAILS[rail]; let done = false;
    for (let f = 0.5; f > 0.05 && f < 0.95 && !done; f += f >= 0.5 ? -(f - 0.5) * 2 - 0.1 : (0.5 - f) * 2) done = !!tryBay({ origin: new THREE.Vector3(R0.x, R0.y, R0.z0 + (R0.z1 - R0.z0) * f), theta: R0.theta, slots: 2, main: true, kind: rail });
    if (done) break;
  }
  const mainBay = bays.find(b => b.main) || bays[0];
  if (!mainBay) throw new Error('No room for a hangar bay on the ' + key);
  // The main bay's lookout: a small tower on its block, with lit windows and a radar bar.
  const ctP = new THREE.Vector3(3, BH + 2.5, mainBay.zs - 1).applyMatrix4(mainBay.M), ct = { x: ctP.x, y: ctP.y, z: ctP.z, s: 4 * BS };
  put('black', at(boxG(ct.s, ct.s * 1.1, ct.s), ct.x, ct.y + ct.s * 0.55, ct.z));
  put('steel', at(boxG(ct.s * 1.3, ct.s * 0.5, ct.s * 1.3), ct.x, ct.y + ct.s * 1.35, ct.z));
  solid(ct.x - ct.s * 0.65, ct.y, ct.z - ct.s * 0.65, ct.x + ct.s * 0.65, ct.y + ct.s * 1.8, ct.z + ct.s * 0.65);
  const radar = new THREE.Mesh(at(boxG(ct.s * 1.1, 0.4, 0.8), 0, 0, 0), mats.steel); radar.position.set(ct.x, ct.y + ct.s * 1.75, ct.z);

  // ----- Docking arms on the right side and underneath: long trusses with clamp rings, wherever they don't block a bay. -----
  for (let i = 0; i < t.arms; i++) {
    const down = i % 3 === 2, z = -0.18 * L + (i / Math.max(1, t.arms - 1)) * 0.5 * L, len = W * (0.18 + rnd() * 0.08), th = L * 0.006;
    if (down) {
      const box = [-th * 5, -H * 0.82 - len - th * 5, z - th * 5, th * 5, -H * 0.82, z + th * 5];
      if (keepOut.some(b => overlap(b, box, 2)) || boxes.some(b => overlap(b, [box[0], box[1], box[2], box[3], box[4] - 0.5, box[5]]))) continue;
      put('steel', at(boxG(th, len, th), 0, -H * 0.82 - len / 2, z));
      for (let j = 1; j < 5; j++) put('dark', at(boxG(th * 3, th * 0.5, th * 0.5), 0, -H * 0.82 - len * j / 5, z));
      put('plain', at(new THREE.TorusGeometry(th * 4, th * 0.9, 6, 16), 0, -H * 0.82 - len, z, Math.PI / 2));
      solid(...box);
    } else {
      const y = -H * 0.18, x0 = W / 2, box = [x0, y - th * 5, z - th * 5, x0 + len + th * 5, y + th * 6, z + th * 5];
      if (keepOut.some(b => overlap(b, box, 2)) || boxes.some((b, bi) => bi > 0 && overlap(b, box))) continue;   // only the hull itself may touch it
      put('steel', at(boxG(len, th, th), x0 + len / 2, y, z)); put('steel', at(boxG(len, th, th), x0 + len / 2, y + th * 3, z));
      for (let j = 0; j <= 5; j++) put('dark', at(boxG(th * 0.5, th * 3, th * 0.5), x0 + len * j / 5, y + th * 1.5, z));
      put('plain', at(new THREE.TorusGeometry(th * 4, th * 0.9, 6, 16), x0 + len, y + th * 1.5, z, 0, Math.PI / 2));
      solid(...box);
    }
  }

  // ----- Guns: heavy twin-barrel turrets, point-defence turrets and missile batteries, all over the hull. -----
  // Mounts are picked on the decks' surfaces (upside down underneath), away from bays, lanes and each other.
  const TS = clamp(L / 150, 0.5, 40), turretList = [];   // guns grow with the ship
  const surfaces = [
    { y: H * 1.29, up: 1, x: [topX - W * 0.2, topX + W * 0.2], z: [0.03 * L, 0.36 * L], w: 3 },
    { y: H * 0.97, up: 1, x: [-W * 0.35, W * 0.35], z: [-0.13 * L, 0.42 * L], w: 5 },
    { y: H * 0.5, up: 1, x: [-W * 0.45, W * 0.45], z: [-0.3 * L, -0.25 * L], w: 1.5 },
    { y: -H * 0.82, up: -1, x: [-W * 0.22, W * 0.22], z: [-0.34 * L, 0.42 * L], w: 3 },
    { y: -H * 0.5, up: -1, x: [-W * 0.45, -W * 0.28], z: [zn, zt], w: 1.5 }, { y: -H * 0.5, up: -1, x: [W * 0.28, W * 0.45], z: [zn, zt], w: 1.5 },
    { y: H * 0.305, up: 1, x: [tipL + W * 0.04, -W / 2 - 2], z: [-0.08 * L, 0.2 * L], w: 1.5 }, { y: H * 0.245, up: 1, x: [W / 2 + 2, tipR - W * 0.04], z: [-0.14 * L, 0.3 * L], w: 1.5 },
    ...towerSpots.map(([x, y, z]) => ({ y, up: 1, x: [x - 0.5, x + 0.5], z: [z - 0.5, z + 0.5], w: 0.25, kinds: ['pd'] })),
    // Ledges of the command tower's lower tiers, and the top of the engine block.
    { y: base + tiers[0][2], up: 1, x: [txC - tiers[0][0] / 2, txC + tiers[0][0] / 2], z: [tzC - tiers[0][1] / 2, tzC + tiers[0][1] / 2], w: 1, kinds: ['pd', 'missile'] },
    { y: base + tiers[0][2] + tiers[1][2], up: 1, x: [txC - tiers[1][0] / 2, txC + tiers[1][0] / 2], z: [tzC - tiers[1][1] / 2, tzC + tiers[1][1] / 2], w: 0.6, kinds: ['pd'] },
    { y: H * 1.05, up: 1, x: [-W * 0.46, W * 0.46], z: [zt, L / 2 - 2], w: 1.5 },
    { y: -H * 0.75, up: -1, x: [-W * 0.46, W * 0.46], z: [zt, L / 2 - 2], w: 1 },
  ];
  const wsum = surfaces.reduce((a, b) => a + b.w, 0);
  const counts = { frigate: { heavy: 2, pd: 3, missile: 1 }, cruiser: { heavy: 8, pd: 16, missile: 6 }, carrier: { heavy: 30, pd: 66, missile: 24 } }[key];
  // Footprint radius and barrel reach (from the turret's centre, in TS units). Its whole sweep must be clear, so the
  // barrels can turn all the way round without passing through a tower, a building or another turret.
  const TSZ = { heavy: [2.0, 5.0], pd: [0.9, 2.0], missile: [1.4, 1.6] };
  for (const kind of ['heavy', 'missile', 'pd']) for (let n = 0, tries = 0; n < counts[kind] && tries < 4000; tries++) {
    let r = rnd() * wsum, sf = surfaces[0]; for (const s2 of surfaces) { r -= s2.w; if (r <= 0) { sf = s2; break; } }
    if (sf.kinds && !sf.kinds.includes(kind)) continue;
    const rad = TSZ[kind][0] * TS, reach = TSZ[kind][1] * TS, x = sf.x[0] + rnd() * (sf.x[1] - sf.x[0]), z = sf.z[0] + rnd() * (sf.z[1] - sf.z[0]), y = sf.y;
    if (Math.abs(z - tzC) < 0.075 * L && Math.abs(x - txC) < W * 0.13 && sf.up > 0 && y < H * 1.3) continue;      // the command tower
    // Its whole swept volume must be clear of other solids (above the surface it sits on) and of bays and lanes.
    const hgt = reach + 1.5 * TS;
    const vol = sf.up > 0 ? [x - reach, y + 0.05, z - reach, x + reach, y + hgt, z + reach] : [x - reach, y - hgt, z - reach, x + reach, y - 0.05, z + reach];
    if (boxes.some(b => overlap(b, vol)) || keepOut.some(b => overlap(b, vol, 2))) continue;
    if (turretList.some(tt => Math.hypot(tt.pos.x - x, tt.pos.y - y, tt.pos.z - z) < Math.max(tt.reach + rad, reach + tt.rad) + 0.5)) continue;
    turretList.push({ kind, pos: new THREE.Vector3(x, y, z), up: sf.up, rad, reach, baseYaw: rnd() * Math.PI * 2, phase: rnd() * 10 });
    n++;
  }
  // The city leaves room for the guns.
  const turretSpots = turretList.map(tt => [tt.pos.x, tt.pos.y, tt.pos.z, tt.reach]);

  // ----- Antenna forests and dish arrays. -----
  const ant = [];
  const nearGun = (x, y, z, pad) => turretSpots.some(([tx_, ty_, tz, tr]) => Math.abs(ty_ - y) < 2 && Math.hypot(tx_ - x, tz - z) < tr + pad);
  const forest = (cx, cy, cz, rx, rz, n) => { for (let i = 0; i < n; i++) { const x = cx + (rnd() - 0.5) * rx, z = cz + (rnd() - 0.5) * rz; if (nearGun(x, cy, z, 1)) continue; ant.push([x, cy, z, L * (0.0005 + rnd() * 0.0008), H * (0.06 + Math.pow(rnd(), 2) * 0.35)]); } };
  const perForest = Math.ceil(t.antennas / 5);
  forest(topX, H * 1.29, 0.31 * L, W * 0.3, 0.05 * L, perForest);
  forest(-W * 0.22, H * 0.97, -0.1 * L, W * 0.2, 0.05 * L, perForest);          // where the upper deck is at full height
  forest(W * 0.25, H * 0.97, 0.1 * L, W * 0.16, 0.08 * L, perForest);
  forest(tipR - W * 0.15, H * 0.25, 0.2 * L, W * 0.2, 0.08 * L, perForest);
  forest(0, H * 0.41, -0.32 * L, W * 0.25, 0.03 * L, perForest);              // on the prow's sloping top (not above it)
  const antennas = new THREE.InstancedMesh(cylG(0.5, 1, 1, 5).translate(0, 0.5, 0), mats.dark, ant.length);
  const m4b = new THREE.Matrix4();
  ant.forEach(([x, y, z, r, h], i) => antennas.setMatrixAt(i, m4b.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, h, r))));
  core.add(antennas);
  for (let i = 0; i < t.dishes; i++) {
    const x = (rnd() - 0.5) * W * 0.6, z = -0.2 * L + rnd() * 0.55 * L, onTop = Math.abs(x - topX) < W * 0.2 && z > 0.02 * L && z < 0.34 * L;
    const y0 = onTop ? H * 1.29 : H * 0.97, r = H * (0.06 + rnd() * 0.08), post = r * 1.2;
    if (Math.abs(z - tzC) < 0.09 * L && Math.abs(x - txC) < W * 0.16) continue;
    if (nearGun(x, y0, z, r + 1)) continue;
    put('steel', at(cylG(r * 0.08, r * 0.14, post, 8), x, y0 + post / 2, z));
    put('steel', at(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, 0.9), x, y0 + post + r * 0.2, z, -0.6 - rnd() * 0.5, rnd() * 6.28));
    solid(x - r, y0, z - r, x + r, y0 + post + r * 1.4, z + r);
  }

  // ----- The city on the flagship's upper decks: districts of lit buildings with streets between them. -----
  const city = { black: [], steel: [] }, roofLights = [];
  if (t.city) {
    const cs = 0.0075 * L;
    // [centre x, z from, z to, half width, surface height, keep clear of the top deck?]
    const areas = [[topX, 0.03 * L, 0.33 * L, W * 0.2, H * 1.29, false], [0, -0.12 * L, 0.39 * L, W * 0.34, H * 0.97, true],
      [-(W / 2 + W * 0.15), -0.06 * L, 0.18 * L, W * 0.13, H * 0.305, false], [W / 2 + W * 0.19, -0.12 * L, 0.28 * L, W * 0.16, H * 0.245, false]];
    let placed = 0;
    for (const [cx, z0, z1, hw, y0, skipTop] of areas) for (let z = z0 + cs; z < z1 - cs && placed < t.city; z += cs) for (let x = cx - hw + cs * 0.6; x < cx + hw - cs * 0.6 && placed < t.city; x += cs) {
      if ((Math.round((z - z0) / cs) % 6 === 0) || (Math.round((x - cx) / cs) % 5 === 0)) continue;             // streets
      if (Math.abs(z - tzC) < 0.075 * L && Math.abs(x - txC) < W * 0.13) continue;                               // the command tower
      if (skipTop && Math.abs(x - topX) < W * 0.25 && z > -0.05 * L && z < 0.39 * L) continue;                   // under the top deck
      if (towerSpots.some(([tx_, , tz]) => Math.abs(tx_ - x) < cs * 1.5 && Math.abs(tz - z) < cs * 1.5)) continue;
      if (turretSpots.some(([tx_, ty_, tz, tr]) => Math.abs(ty_ - y0) < 1 && Math.hypot(tx_ - x, tz - z) < tr * 1.3 + cs)) continue;   // the guns
      if (keepOut.some(b => overlap(b, [x - cs, y0, z - cs, x + cs, y0 + H * 0.2, z + cs], 1))) continue;                               // bays and lanes
      if (rnd() < 0.12) continue;
      const district = 0.5 + 0.5 * Math.sin(z / (0.05 * L) + x / (0.05 * W)), h = H * (0.025 + Math.pow(rnd(), 2.2) * 0.13 * (0.4 + district));
      const fw = cs * (0.6 + rnd() * 0.3), fd = cs * (0.6 + rnd() * 0.3);
      (rnd() < 0.55 ? city.black : city.steel).push([x, y0, z, fw, h, fd]);
      shapeBox([x - fw / 2, y0 - 1, z - fd / 2, x + fw / 2, y0 + h, z + fd / 2], true);
      if (rnd() < 0.12) roofLights.push({ p: [x, y0 + h + 0.5, z], c: rnd() < 0.5 ? '#FFD39A' : '#FF8A7A' });
      placed++;
    }
    for (const [cx, z0, z1, hw, y0] of areas) solidF(cx - hw, y0, z0, cx + hw, y0 + H * 0.22, z1);   // fighters keep above the whole district
    D.cityCount = placed;
  }
  const cityGeo = boxG(1, 1, 1).translate(0, 0.5, 0);
  for (const m of ['black', 'steel']) if (city[m].length) {
    const im = new THREE.InstancedMesh(cityGeo, mats[m], city[m].length);
    city[m].forEach(([x, y, z, w, h, d], i) => im.setMatrixAt(i, m4b.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d))));
    core.add(im);
  }

  // ----- Markings: badges, the patrol stripe, the serial number and warning signs, sized to the ship. -----
  const sideX = W / 2 + lift, segC = i => (segs[i][0] + segs[i][1]) / 2, last = t.segs - 1;
  // A marking on the hull side is left out where a bay's block stands in front of it.
  const putD0 = putD;
  const putDM = (key2, g) => { g.computeBoundingBox(); const bb = g.boundingBox; const box = [bb.min.x - 0.5, bb.min.y, bb.min.z, bb.max.x + 0.5, bb.max.y, bb.max.z];
    if (bays.some(b => overlap(tb(b.M, [0, -3, b.zs - 4, BF + 2, BH + 2.5, b.ze + 4]), box))) return; putD0(key2, g); };
  putDM('decal', at(decalG(Math.min(H * 1.4, segLen * 0.7), Math.min(H * 1.4, segLen * 0.7) * 0.22, DECAL.stripe), sideX, -H * 0.02, segs[0][0] + segLen * 0.4, 0, Math.PI / 2));
  putDM('decal', at(decalG(H * 0.48, H * 0.48, DECAL.badge), sideX, 0, segC(1), 0, Math.PI / 2));
  putDM('serial', at(decalG(H * 0.9, H * 0.22, [0, 0, 1, 1]), sideX, H * 0.08, segC(last), 0, Math.PI / 2));
  putDM('decal', at(decalG(H * 0.48, H * 0.48, DECAL.badge), -sideX, 0, segC(last), 0, -Math.PI / 2));
  putDM('decal', at(decalG(H * 1.6, H * 0.12, DECAL.letters), -sideX, 0, segC(last) - H * 1.3, 0, -Math.PI / 2));
  const nzA = -0.42 * L, nAng = Math.atan2(W * 0.3, zn - nzA);
  for (const s2 of [-1, 1]) putDM('decal', at(decalG((zn - nzA) / Math.cos(nAng) * 0.8, H * 0.25, DECAL.stripe), s2 * (W * 0.35 + lift), -H * 0.05, (nzA + zn) / 2, 0, s2 * (Math.PI / 2 + nAng)));
  putDM('decal', at(decalG(W * 0.5, W * 0.06, DECAL.caution), 0, H * 1.0, L / 2 + lift));
  putDM('serial', at(decalG(W * 0.3, W * 0.075, [0, 0, 1, 1]), W * 0.24, H / 2 + lift, segC(0), -Math.PI / 2, Math.PI / 2));

  for (const m of B.meshes(mats)) core.add(m);
  for (const m of Bd.meshes(mats)) detail.add(m);
  core.add(radar);

  // ----- Moving parts in every bay: the shutter (main bay), refuelling arms and hoses, landing lights that chase inward. -----
  const service = Array.from({ length: D.slots }, () => ({ arm: 0, hose: 0, want: 0, landing: false }));
  const armGeo = mergeGeometries([boxG(0.14, 1, 0.14).translate(0, -0.5, 0), boxG(0.4, 0.12, 0.3).translate(0, -1, 0)].map(g => g.toNonIndexed()));
  const armMat = new THREE.MeshStandardMaterial({ color: '#B58A2E', roughness: 0.6, map: tx.armor }), hoseMat = new THREE.MeshStandardMaterial({ color: '#2A2C2E', roughness: 0.7, emissive: '#15191B' });
  const hoseGeo = cylG(0.06, 0.06, 1, 6).translate(0, 0.5, 0);
  const bayLightMats = [];
  for (const bay of bays) {
    bay.arms = new THREE.InstancedMesh(armGeo, armMat, bay.slots); bay.hoses = new THREE.InstancedMesh(hoseGeo, hoseMat, bay.slots);
    bay.arms.frustumCulled = bay.hoses.frustumCulled = false; bay.group.add(bay.arms, bay.hoses);
    const land = []; for (let i = 0; i < bay.slots; i++) for (let j = 0; j < 4; j++) land.push({ p: [0.3 + j * 0.9, 0.08, bay.slotZ(i)], c: '#FFE6A8' });
    bay.land = dots(land, tx.glow, 0.7 * BS, 1);
    const lip = []; for (let z = bay.zs + 1; z < bay.ze - 0.5; z += 1.6) lip.push({ p: [0.05, 0.12, z], c: '#7FCBFF' }, { p: [0.05, BH - 0.1, z], c: '#7FCBFF' });
    const lipD = dots(lip, tx.glow, 0.55 * BS, 0.9);
    bay.group.add(bay.land, lipD); bayLightMats.push(bay.land.material, lipD.material);
    if (bay.main) { bay.door = new THREE.Mesh(at(boxG(bay.DW, bay.DH, 0.15), 0, bay.DH / 2, 0), mats.steel); bay.door.position.set(bay.slotX, 0, bay.zp - 0.05); bay.group.add(bay.door); }
  }
  // The beacon on the command tower: a lamp with two slowly turning beams (blue and green), and a big soft pulse.
  const bk = k * 0.6, beacon = new THREE.Group(); beacon.position.set(txC + w3 * 0.1, towerTop + 0.3 * bk, tzC - d3 * 0.1);
  const housing = new THREE.Mesh(cylG(0.35 * bk, 0.45 * bk, 0.5 * bk, 10), mats.plain); housing.position.y = -0.1 * bk;
  const lampMesh = new THREE.Mesh(cylG(0.13 * bk, 0.13 * bk, 0.25 * bk, 10), new THREE.MeshBasicMaterial({ color: '#9FE6FF' })); lampMesh.position.y = 0.3 * bk;
  const beams = new THREE.Group(); beams.position.y = 0.3 * bk;
  for (const [i, c] of ['#7FCBFF', '#7FF0B0'].entries()) beams.add(new THREE.Mesh(new THREE.ConeGeometry(0.7 * bk, 7 * bk, 16, 1, true).translate(0, -3.5 * bk, 0).rotateZ(Math.PI / 2 + i * Math.PI),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  beacon.add(housing, lampMesh, beams); core.add(beacon);
  const pulse = dots([{ p: [beacon.position.x, beacon.position.y + 0.3 * bk, beacon.position.z], c: '#9FE6FF' }], tx.glow, L * 0.035, 0.9);

  // ----- Lights: running lights along every edge and tower, engine glow, and the bays' guide beacons. -----
  const run = [], step = L / 45, ex = W / 2 - H * 0.12, ey = H * 0.5 - H * 0.05;
  for (let z = zn; z < zt; z += step) run.push({ p: [-ex - lift * 4, ey, z], c: '#7FCBFF' }, { p: [ex + lift * 4, ey, z], c: '#7FF0B0' });
  for (let z = -0.14 * L; z < 0.4 * L; z += step) run.push({ p: [-W * 0.36, H * 0.97, z], c: '#7FCBFF' }, { p: [W * 0.36, H * 0.97, z], c: '#7FF0B0' });
  for (let z = -0.14 * L; z < 0.22 * L; z += step) run.push({ p: [tipL, H * 0.24, z], c: '#7FCBFF' });
  for (let z = -0.2 * L; z < 0.32 * L; z += step) run.push({ p: [tipR, H * 0.18, z], c: '#7FF0B0' });
  run.push({ p: [0, -H * 0.15, -L / 2 - lift * 4], c: '#FFFFFF' });
  const tops = [...spires, ...towerSpots.map(([x, y, z]) => [x, y + 0.5, z])];
  for (const p of tops) run.push({ p, c: '#FF8A7A' });
  for (let i = 0; i < 3; i++) { const [w, d] = tiers[i]; let yy = base; for (let j = 0; j <= i; j++) yy += tiers[j][2]; for (const sx2 of [-1, 1]) for (const sz of [-1, 1]) run.push({ p: [txC + sx2 * w / 2, yy, tzC + sz * d / 2], c: sx2 < 0 ? '#7FCBFF' : '#7FF0B0' }); }
  const runLights = dots(run, tx.glow, L * 0.006, 0.9);
  const roof = dots(roofLights.length ? roofLights : [{ p: [0, 0, 0], c: '#000000' }], tx.glow, L * 0.004, 0.9);
  const keyLights = [...[[0, -H * 0.15, -L / 2], [tipL, H * 0.24, 0.04 * L], [tipR, H * 0.18, 0.06 * L], [0, H * 0.15, L / 2 + eLen]].map(p => ({ p, c: '#BFEFFF' })), ...tops.slice(0, 8).map(p => ({ p, c: '#FFB0A0' }))];
  const farLights = new THREE.Points(dots(keyLights, tx.dot, 1).geometry, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, map: tx.dot, vertexColors: true, transparent: true, depthWrite: false }));
  farLights.frustumCulled = false;
  const engineGlow = dots(engines, tx.glow, re * 4.5, 0.75);
  // Guide beacons blink in turn along each bay mouth, so from far away the bays read as lit openings with moving lights.
  const beaconLights = dots(beacons, tx.glow, 2.6 * BS, 1);
  core.add(runLights, roof, farLights, engineGlow, pulse, beaconLights);

  // ----- Turret meshes: each kind is a base, a head that turns, and guns that tilt, all instanced. -----
  const tcol = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const BLK = '#34383C', STL = '#5C636A', GRN = '#3E6049', DRK = '#1A1C1E', s = TS;
  const KIND = {
    heavy: { base: [tcol(cylG(1.5 * s, 1.75 * s, 0.7 * s, 14).translate(0, 0.35 * s, 0), BLK), tcol(cylG(1.58 * s, 1.58 * s, 0.14 * s, 14, true).translate(0, 0.6 * s, 0), GRN)],
      head: [tcol(boxG(2.4 * s, 1.1 * s, 2.8 * s).translate(0, 1.25 * s, 0.15 * s), STL), tcol(boxG(2.0 * s, 0.5 * s, 0.9 * s).translate(0, 1.6 * s, 1.15 * s), BLK), tcol(boxG(0.5 * s, 0.3 * s, 0.5 * s).translate(0.75 * s, 1.95 * s, 0.6 * s), DRK)],
      gun: [...[-0.45, 0.45].flatMap(o => [tcol(cylG(0.13 * s, 0.18 * s, 3.8 * s, 8).rotateX(Math.PI / 2).translate(o * s, 0, -2.8 * s), DRK), tcol(cylG(0.21 * s, 0.21 * s, 0.25 * s, 8).rotateX(Math.PI / 2).translate(o * s, 0, -2.1 * s), GRN)]),
        tcol(boxG(1.5 * s, 0.65 * s, 1.0 * s).translate(0, 0, -0.6 * s), BLK)],
      pivot: [0, 1.3 * s, -1.0 * s], muzzles: [[-0.45 * s, 0, -4.7 * s], [0.45 * s, 0, -4.7 * s]], top: 2.15 * s, rate: 0.35, cool: 0.75 },
    pd: { base: [tcol(cylG(0.7 * s, 0.8 * s, 0.4 * s, 10).translate(0, 0.2 * s, 0), BLK)],
      head: [tcol(new THREE.SphereGeometry(0.62 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.4 * s, 0), STL), tcol(boxG(0.3 * s, 0.2 * s, 0.3 * s).translate(0, 1.0 * s, 0.2 * s), DRK)],
      gun: [...[-0.12, 0.12].map(o => tcol(cylG(0.05 * s, 0.07 * s, 1.5 * s, 6).rotateX(Math.PI / 2).translate(o * s, 0, -1.0 * s), DRK)), tcol(boxG(0.5 * s, 0.32 * s, 0.5 * s), BLK)],
      pivot: [0, 0.72 * s, 0], muzzles: [[-0.12 * s, 0, -1.8 * s], [0.12 * s, 0, -1.8 * s]], top: 1.15 * s, rate: 1.0, cool: 0.5 },
    missile: { base: [tcol(cylG(1.0 * s, 1.15 * s, 0.45 * s, 12).translate(0, 0.22 * s, 0), BLK), tcol(cylG(1.03 * s, 1.03 * s, 0.1 * s, 12, true).translate(0, 0.4 * s, 0), GRN)],
      head: [tcol(boxG(1.5 * s, 0.4 * s, 1.5 * s).translate(0, 0.6 * s, 0), STL)],
      gun: [tcol(boxG(1.9 * s, 1.1 * s, 1.6 * s), BLK), tcol(boxG(1.95 * s, 0.14 * s, 1.65 * s).translate(0, 0.3 * s, 0), GRN),
        ...[0, 1, 2].flatMap(c => [0, 1].map(r => tcol(new THREE.CircleGeometry(0.2 * s, 10).rotateY(Math.PI).translate((c - 1) * 0.55 * s, (r - 0.5) * 0.45 * s, -0.81 * s), DRK)))],
      pivot: [0, 1.25 * s, 0], muzzles: [[-0.55 * s, 0.22 * s, -0.9 * s], [0.55 * s, -0.22 * s, -0.9 * s], [0, 0.22 * s, -0.9 * s]], top: 1.85 * s, rate: 0.5, cool: 4.5 },
  };
  const turretMat = hullShader(new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.armor, roughness: 0.8, metalness: 0.2, emissive: '#1C2024', emissiveMap: tx.armor }), false);
  const turretMeshes = {}, sensorPts = [];
  for (const [kind, K] of Object.entries(KIND)) {
    const list = turretList.filter(tt => tt.kind === kind); if (!list.length) continue;
    turretMeshes[kind] = {};
    for (const part of ['base', 'head', 'gun']) {
      const g = mergeGeometries(K[part].map(x => { x.deleteAttribute('normal'); x.computeVertexNormals(); return x; }));
      const im = new THREE.InstancedMesh(g, turretMat, list.length); im.frustumCulled = false; core.add(im); turretMeshes[kind][part] = im;
    }
    list.forEach((tt, i) => { tt.i = i; tt.K = K; tt.mq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tt.up > 0 ? 0 : Math.PI); tt.yaw = tt.baseYaw; tt.pitch = 0.2; tt.cd = Math.random() * 3; tt.alt = 0;
      sensorPts.push({ p: tt.pos.clone().addScaledVector(new THREE.Vector3(0, tt.up, 0), K.top).toArray(), c: '#7FF0B0' }); });
  }
  const sensors = dots(sensorPts.length ? sensorPts : [{ p: [0, 0, 0], c: '#000000' }], tx.glow, Math.max(0.6, TS * 0.6), 0.9);
  core.add(sensors);
  // Write a turret's matrices from its yaw and pitch (all in ship space).
  const hq = new THREE.Quaternion(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), hm = new THREE.Matrix4(), gm = new THREE.Matrix4(), pm = new THREE.Matrix4(), XAX = new THREE.Vector3(1, 0, 0);
  function writeTurret(tt) {
    const M3 = turretMeshes[tt.kind];
    hq.copy(tt.mq).multiply(tq.setFromAxisAngle(YAX, tt.yaw));
    hm.compose(tt.pos, hq, ONE3); M3.head.setMatrixAt(tt.i, hm);
    pm.compose(tv.set(...tt.K.pivot), tq.setFromAxisAngle(XAX, tt.pitch), ONE3); gm.multiplyMatrices(hm, pm); M3.gun.setMatrixAt(tt.i, gm);
    tt.gm = (tt.gm || new THREE.Matrix4()).copy(gm);
  }
  for (const tt of turretList) {
    turretMeshes[tt.kind].base.setMatrixAt(tt.i, hm.compose(tt.pos, tt.mq, ONE3)); writeTurret(tt);
    const y0 = tt.pos.y, y1 = tt.pos.y + tt.up * tt.K.top * 0.75;   // the base and head (the barrels swing, so they're left out)
    shapeBox([tt.pos.x - tt.rad, Math.min(y0, y1), tt.pos.z - tt.rad, tt.pos.x + tt.rad, Math.max(y0, y1), tt.pos.z + tt.rad]);
  }
  // Where a turret wants to point to aim at p (ship space): yaw and pitch in its own mount frame, and whether that's above its horizon.
  const av = new THREE.Vector3(), aq = new THREE.Quaternion();
  function aimAt(tt, p) {
    av.copy(p).sub(tt.pos).applyQuaternion(aq.copy(tt.mq).invert());
    av.y -= tt.K.pivot[1];
    return { yaw: Math.atan2(-av.x, -av.z), pitch: Math.atan2(av.y, Math.hypot(av.x, av.z)) };
  }
  // A muzzle's position and direction in ship space (alternating barrels).
  function muzzle(tt, outP, outD) {
    const m = tt.K.muzzles[tt.alt++ % tt.K.muzzles.length];
    outP.set(...m).applyMatrix4(tt.gm); outD.set(0, 0, -1).transformDirection(tt.gm);
    return outP;
  }
  const turrets = { list: turretList, aimAt, muzzle, meshes: turretMeshes, TS,
    // Turn every turret toward what it wants (idle sweep, or a target), smoothly and slowly. Only runs when the camera is near.
    update(dt, time, { calm, want }) {
      for (const tt of turretList) {
        let w = calm ? null : want(tt);
        if (!w) w = calm ? { yaw: tt.yaw, pitch: tt.pitch } : { yaw: tt.baseYaw + Math.sin(time * 0.13 + tt.phase) * 1.0, pitch: 0.22 + 0.15 * Math.sin(time * 0.09 + tt.phase * 1.7) };
        const r = tt.K.rate * dt, dy = Math.atan2(Math.sin(w.yaw - tt.yaw), Math.cos(w.yaw - tt.yaw));
        tt.yaw += clamp(dy, -r, r); tt.pitch += clamp(clamp(w.pitch, -0.05, 1.3) - tt.pitch, -r * 0.7, r * 0.7);
        tt.aimErr = Math.abs(dy) + Math.abs(clamp(w.pitch, -0.05, 1.3) - tt.pitch);
        writeTurret(tt);
      }
      for (const M3 of Object.values(turretMeshes)) { M3.head.instanceMatrix.needsUpdate = M3.gun.instanceMatrix.needsUpdate = true; }
      // Sensor lights blink softly, each at its own pace.
      const col = sensors.geometry.attributes.color;
      for (let i = 0; i < turretList.length; i++) { const on = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.7 + turretList[i].phase * 3)); col.setXYZ(i, 0.5 * on, 0.94 * on, 0.75 * on); }
      col.needsUpdate = true;
    },
    // Far away the guns are left out (the bases stay), so the far ship is cheaper.
    setNear(nearby) { for (const M3 of Object.values(turretMeshes)) M3.gun.visible = nearby; },
  };

  // ----- Near-only details: officers on the bridge and the consoles they work at. -----
  const near = new THREE.Group(); near.visible = false; root.add(near);
  const officers = [], nOff = t.officers;
  const desk = new THREE.Mesh(boxG(bw * 0.84, 0.3, 0.42), mats.steel); desk.position.set(bx, by + 0.3, gz + 0.62); near.add(desk);
  const screens = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.8, 0.26), mats.screen); screens.position.set(bx, by + 0.46, gz + 0.62); screens.rotation.set(-1.15, Math.PI, 0); near.add(screens);
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, bd * 0.8), new THREE.MeshBasicMaterial({ color: '#1E3A33' })); floorGlow.position.set(bx, by + 0.16, bz); floorGlow.rotation.x = -Math.PI / 2; near.add(floorGlow);
  for (let i = 0; i < nOff; i++) {
    const seated = i < Math.ceil(nOff * 0.66), r = hashN(i * 13 + key.length);
    const p = makePerson({ suit: i === nOff - 1 ? '#22362A' : '#2C4535', skin: SKIN[Math.floor(r * SKIN.length)], cap: i === nOff - 1 ? '#151718' : '#1F2A24' });
    if (seated) { p.group.position.set(bx - bw * 0.38 + (i + 0.5) * (bw * 0.76) / Math.ceil(nOff * 0.66), by + 0.15, gz + 1.08); p.seated = true; }
    else { p.group.position.set(bx - bw * 0.2 + (i - Math.ceil(nOff * 0.66)) * 0.8, by + 0.15, bz + bd * 0.25); p.group.rotation.y = 0.3; }
    if (seated) { const chair = new THREE.Mesh(boxG(0.22, 0.2, 0.22), mats.dark); chair.position.set(p.group.position.x, by + 0.25, gz + 1.14); near.add(chair); }
    p.phase = r * 10; officers.push(p); near.add(p.group);
  }

  const allMats = [...Object.values(mats), armMat, hoseMat, turretMat, lampMesh.material, ...beams.children.map(c => c.material), ...bayLightMats,
    ...[runLights, roof, farLights, beaconLights, engineGlow, pulse, sensors].map(p => p.material)];
  for (const m of allMats) m.userData.baseOpacity = m.opacity;
  D.bridge = new THREE.Vector3(bx, by + bh / 2, bz);
  D.mainBay = mainBay;

  // ----- A grid over the collision shapes, so a point only tests the few shapes near it. -----
  // Each shape is listed in every cell its box (grown by QPAD) touches, so any shape closer than QPAD to a point is found.
  const QPAD = WORLD.collision.radius + 3, gmin = new THREE.Vector3(Infinity, Infinity, Infinity), gmax = gmin.clone().negate();
  const aabb = sh => sh.k === 0 ? sh.b : [Math.min(sh.a[0] - sh.a[2], sh.b[0] - sh.b[2]), Math.min(sh.a[1] - sh.a[3], sh.b[1] - sh.b[3]), sh.z0,
    Math.max(sh.a[0] + sh.a[2], sh.b[0] + sh.b[2]), Math.max(sh.a[1] + sh.a[3], sh.b[1] + sh.b[3]), sh.z1];
  for (const sh of shapes) { sh.box = aabb(sh); gmin.min(new THREE.Vector3(sh.box[0], sh.box[1], sh.box[2])); gmax.max(new THREE.Vector3(sh.box[3], sh.box[4], sh.box[5])); }
  gmin.subScalar(QPAD); gmax.addScalar(QPAD);
  const CS = Math.max(10, L / 48), GN = [0, 1, 2].map(i => Math.max(1, Math.ceil((gmax.getComponent(i) - gmin.getComponent(i)) / CS)));
  const cells = new Map();
  for (const [si, sh] of shapes.entries()) {
    const lo = [0, 1, 2].map(i => clamp(Math.floor((sh.box[i] - QPAD - gmin.getComponent(i)) / CS), 0, GN[i] - 1));
    const hi = [0, 1, 2].map(i => clamp(Math.floor((sh.box[i + 3] + QPAD - gmin.getComponent(i)) / CS), 0, GN[i] - 1));
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) {
      const k = (a * GN[1] + b) * GN[2] + c; let list = cells.get(k); if (!list) cells.set(k, list = []); list.push(si);
    }
  }
  const NONE = [];
  const cellAt = (x, y, z) => {
    const a = Math.floor((x - gmin.x) / CS), b = Math.floor((y - gmin.y) / CS), c = Math.floor((z - gmin.z) / CS);
    if (a < 0 || b < 0 || c < 0 || a >= GN[0] || b >= GN[1] || c >= GN[2]) return NONE;
    return cells.get((a * GN[1] + b) * GN[2] + c) || NONE;
  };
  // Signed distance from a point (ship space) to one shape: negative inside.
  function sdShape(sh, x, y, z) {
    if (sh.k === 0) {
      const b = sh.b, qx = Math.abs(x - (b[0] + b[3]) / 2) - (b[3] - b[0]) / 2, qy = Math.abs(y - (b[1] + b[4]) / 2) - (b[4] - b[1]) / 2, qz = Math.abs(z - (b[2] + b[5]) / 2) - (b[5] - b[2]) / 2;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
    }
    const t = clamp((z - sh.z0) / (sh.z1 - sh.z0), 0, 1), A = sh.a, B = sh.b;
    const cx = A[0] + (B[0] - A[0]) * t, cy = A[1] + (B[1] - A[1]) * t, hw = A[2] + (B[2] - A[2]) * t, hh = A[3] + (B[3] - A[3]) * t, c = A[4] + (B[4] - A[4]) * t;
    const px = Math.abs(x - cx), py = Math.abs(y - cy);
    const d2 = Math.max(px - hw, py - hh, (px + py - (hw + hh - c)) * 0.7071), dz = Math.max(sh.z0 - z, z - sh.z1);
    return d2 <= 0 && dz <= 0 ? Math.max(d2, dz) : Math.hypot(Math.max(d2, 0), Math.max(dz, 0));
  }
  // Distance to the hull near a point (only exact within QPAD; Infinity if nothing is that close). n gets the way out.
  function sdNear(p, n) {
    const list = cellAt(p.x, p.y, p.z); if (!list.length) return Infinity;
    const f = (x, y, z) => { let d = Infinity; for (const i of list) { const v = sdShape(shapes[i], x, y, z); if (v < d) d = v; } return d; };
    const d = f(p.x, p.y, p.z);
    if (n && d < QPAD) { const e = 0.25; n.set(f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)); if (n.lengthSq() < 1e-12) n.set(0, 1, 0); n.normalize(); }
    return d;
  }
  // Distance to the nearest hull surface from anywhere (for the radio warnings): every big section, and the buildings
  // and small parts once close.
  function sdFar(p, closeAt) {
    let d = Infinity;
    for (const sh of shapes) if (!sh.city) { const v = sdShape(sh, p.x, p.y, p.z); if (v < d) d = v; }
    if (d < closeAt) for (const sh of shapes) if (sh.city) { const v = sdShape(sh, p.x, p.y, p.z); if (v < d) d = v; }
    return d;
  }
  D.shapes = shapes; D.sdNear = sdNear; D.sdFar = sdFar; D.QPAD = QPAD;

  // Per-frame animation of this ship's moving parts, and the level of detail.
  let doorOpen = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  const bcol = beaconLights.geometry.attributes.color;
  function animate(dt, time, { doorWant = 0, camLocal, reduced = false }) {
    // Level of detail: each bay's inside only near it, markings and small parts within about a ship length, the bridge up close.
    const dShip = camLocal.length(), dBridge = camLocal.distanceTo(D.bridge);
    detail.visible = dShip < L * 1.3 + 300;
    near.visible = dBridge < 90;
    if (!reduced) { beams.rotation.y += dt * 0.5; radar.rotation.y += dt * 0.9; }
    pulse.material.opacity = reduced ? 0.6 : 0.35 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(time * 1.6), 3);
    runLights.material.opacity = reduced ? 0.85 : 0.7 + 0.2 * Math.sin(time * 1.3);
    engineGlow.material.opacity = 0.65 + 0.1 * Math.sin(time * 3.1);
    // Guide beacons: each bay's four blink in turn, brighter while a fighter is coming in.
    beacons.forEach((b, i) => { const bay = bays[b.bay], busy = service.slice(bay.first, bay.first + bay.slots).some(s2 => s2.landing);
      const lvl = reduced ? 0.7 : (busy ? 0.4 + 0.6 * Math.max(0, Math.sin(time * 5 - i * 1.4)) : 0.25 + 0.75 * Math.max(0, Math.sin(time * 2.2 - (i % 4) * 0.9)));
      const c = new THREE.Color(b.c).multiplyScalar(lvl); bcol.setXYZ(i, c.r, c.g, c.b); });
    bcol.needsUpdate = true;
    // The refuelling arms and hoses keep time even when nobody is watching (refuelling waits for them); they're only drawn up close.
    for (const s2 of service) { s2.arm += clamp(s2.want - s2.arm, -dt * 0.8, dt * 0.8); s2.hose += clamp((s2.want && s2.arm > 0.9 ? 1 : 0) - s2.hose, -dt * 1.2, dt * 0.7); }
    doorOpen += clamp(doorWant - doorOpen, -dt * 0.9, dt * 0.9);
    for (const bay of bays) {
      bay.group.visible = camLocal.distanceTo(bay.center) < 260 * BS;
      if (!bay.group.visible) continue;
      if (bay.door) { bay.door.position.y = doorOpen * (bay.DH - 0.2); bay.door.scale.y = 1 - doorOpen * 0.85; }
      const col = bay.land.geometry.attributes.color;
      for (let i = 0; i < bay.slots; i++) {
        const s2 = service[bay.first + i], z = bay.slotZ(i);
        for (let j = 0; j < 4; j++) { const on = s2.landing ? 0.25 + 0.75 * (Math.floor(time * 6 - j) % 4 === 0 ? 1 : 0.15) : 0.35; col.setXYZ(i * 4 + j, on, on * 0.9, on * 0.66); }
        const drop = 0.25 + smooth(s2.arm) * (BH - 0.6 - 0.68 - 0.25);
        m4.compose(v1.set(bay.slotX + 0.35, BH - 0.6, z), q.identity(), sc.set(1, drop, 1)); bay.arms.setMatrixAt(i, m4);
        v1.set(BD - 0.3, 0.5, z - 1.2); v2.set(bay.slotX + 0.9, 0.42, z - 0.4);
        const dir = v2.sub(v1), len = dir.length(); q.setFromUnitVectors(up, dir.normalize());
        m4.compose(v1, q, sc.set(1, Math.max(0.001, smooth(s2.hose) * len), 1)); bay.hoses.setMatrixAt(i, m4);
      }
      col.needsUpdate = true; bay.arms.instanceMatrix.needsUpdate = bay.hoses.instanceMatrix.needsUpdate = true;
    }
    if (near.visible && !reduced) for (const p of officers) {
      if (p.seated) p.pose('sit', time + p.phase);
      else { p.pose('stand', time + p.phase); p.group.rotation.y = 0.3 + Math.sin(time * 0.25 + p.phase) * 0.6; }
    }
  }
  function setFade(a) { for (const m of allMats) { m.transparent = a < 1 || m.userData.baseOpacity < 1 || m.blending === THREE.AdditiveBlending || m === farLights.material; m.opacity = m.userData.baseOpacity * a; m.depthWrite = a >= 1 && m.userData.baseOpacity >= 1 && m.blending !== THREE.AdditiveBlending && m !== farLights.material; } }
  return { key, root, D, service, animate, setFade, mats: allMats, turrets };
}

// ---------- The fleet ----------
// opts: { planets(), clearance(p), shipPos, shipRadius, volume(), camera, toast(msg) }
export function makeFleet(opts) {
  const root = new THREE.Group(); root.name = 'fleet';
  const tiers = {}, built = k => tiers[k] ||= buildMothership(k);
  let ms = null, fading = null;               // the current ship, and the one fading out after a tier change
  const station = { pos: new THREE.Vector3(), yaw: 0, set: false, move: null, next: 200 + Math.random() * 200, drift: Math.random() * 100 };
  const fund = { has: false, amount: 0, months: 0, unit: 100, total: 0 };
  let tierKey = null, time = 0, transition = 1;
  const tx = textures(), fg = fighterGeometry();

  // ----- Instanced fighters: every part one InstancedMesh, near detail and far stand-ins. -----
  const CAP = 48;
  const fMats = {
    body: new THREE.MeshStandardMaterial({ color: '#5A6168', map: tx.armor, roughness: 0.7, metalness: 0.25, emissive: '#1C2024', emissiveMap: tx.armor }),
    dark: new THREE.MeshStandardMaterial({ color: '#141618', roughness: 0.6 }),
    stripe: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.6 }),
    canopy: new THREE.MeshStandardMaterial({ color: '#7FB8D0', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.3, depthWrite: false, emissive: '#16303A' }),
    glow: new THREE.MeshBasicMaterial({ color: '#A8E4FF' }), lights: new THREE.MeshBasicMaterial({ vertexColors: true }),
    helmet: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 }), visor: new THREE.MeshStandardMaterial({ color: '#0B1A22', roughness: 0.15, metalness: 0.8 }),
    suit: new THREE.MeshStandardMaterial({ color: '#3A4A3E', roughness: 0.8 }), far: new THREE.MeshStandardMaterial({ color: '#4A5157', roughness: 0.7 }),
  };
  const inst = {};
  for (const k of ['body', 'dark', 'stripe', 'glow', 'lights', 'helmet', 'visor', 'suit', 'canopy', 'far']) {
    const m = new THREE.InstancedMesh(fg[k], fMats[k], CAP); m.count = 0; m.frustumCulled = false; inst[k] = m;
    if (k === 'stripe' || k === 'helmet') m.setColorAt(0, new THREE.Color());
    root.add(m);
  }
  inst.canopy.renderOrder = 2;
  const exhaust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 2.2, map: tx.glow, color: '#8FD4F8', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  exhaust.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(CAP * 3), 3)); exhaust.frustumCulled = false;
  root.add(exhaust);
  // Far away a fighter is smaller than a pixel, so it shows a small steady navigation light instead.
  const navLights = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, color: '#5FF2C0', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
  // Drawn on top, so a light hides itself when a planet or the mothership is between it and the camera.
  const hidden = (from, to) => {
    for (const pl of opts.planets()) if (segDist(from, to, pl.group.position) < pl.look.radius * pl.group.scale.x) return true;
    return ms && segDist(from, to, root.position) < ms.D.H * 0.6;
  };
  navLights.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(CAP * 3), 3)); navLights.frustumCulled = false;
  root.add(navLights);

  // Sparkles for a new fighter.
  const SPK = 90, spk = { pos: new Float32Array(SPK * 3), vel: new Float32Array(SPK * 3), life: 0 };
  const spkGeo = new THREE.BufferGeometry(); spkGeo.setAttribute('position', new THREE.BufferAttribute(spk.pos, 3));
  spkGeo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: SPK }, (_, i) => new THREE.Color(['#FFE08A', '#7FE0C2', '#FFFFFF', '#F28FB0', '#7FCBFF'][i % 5]).toArray()).flat(), 3));
  const sparkles = new THREE.Points(spkGeo, new THREE.PointsMaterial({ size: 0.6, map: tx.glow, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkles.frustumCulled = false; sparkles.visible = false;
  function burst(local) {
    for (let i = 0; i < SPK; i++) {
      spk.pos.set([local.x + (Math.random() - 0.5) * 2.5, local.y + 0.3 + Math.random() * 1.2, local.z + (Math.random() - 0.5) * 2.5], i * 3);
      const a = Math.random() * 6.283, s = 0.4 + Math.random() * 1.2;
      spk.vel.set([Math.cos(a) * s, 1 + Math.random() * 1.6, Math.sin(a) * s], i * 3);
    }
    spk.life = 2.6; sparkles.visible = true;
  }

  // People in the hangar: pilots walking to their fighters, and the pilot of a brand-new fighter waving.
  const crew = Array.from({ length: 4 }, (_, i) => { const p = makePerson({ suit: '#3A4A3E', skin: SKIN[i % SKIN.length], helmet: HELMETS[i] }); p.group.visible = false; return p; });
  const people = new THREE.Group(); people.add(...crew.map(p => p.group), sparkles); root.add(people);

  // ----- Fighters -----
  const fighters = [];       // the active ones (at most 24)
  let nextId = 0, rollQueue = 0, rolling = null, lastToast = 0;
  const reserveIds = [];     // ids waiting in the reserve hangar
  const mk = id => ({ id, state: 'docked', slot: -1, lp: new THREE.Vector3(), lq: new THREE.Quaternion(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(),
    fuel: 1, t: 0, dur: 1, pilot: true, speed: 16 + hashN(id * 7 + 1) * 12, endurance: 70 + hashN(id * 3 + 5) * 80, target: null, lead: null, pairT: 0, roll: 0, retire: false,
    from: new THREE.Vector3(), c1: new THREE.Vector3(), c2: new THREE.Vector3(), steer: new THREE.Vector3(), tick: Math.floor(hashN(id) * 4), walker: null, thrust: 0, escort: 0 });

  // Coarse grid over the patrol region; each cell remembers when someone last went there.
  const GX = 6, GY = 3, GZ = 6, cells = new Float32Array(GX * GY * GZ).fill(-1e9);
  // The patrol region is the space around the mothership (the planets are far too far apart to patrol between them).
  const rMin = new THREE.Vector3(), rMax = new THREE.Vector3();
  function region() {
    const Rs = (ms ? ms.D.L : 400) * MS.patrolReach + 2000, c = station.pos;
    rMin.set(c.x - Rs, c.y - Rs * 0.5, c.z - Rs); rMax.set(c.x + Rs, c.y + Rs * 0.5, c.z + Rs);
  }
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4(), UPV = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  const msQ = new THREE.Quaternion(), msQi = new THREE.Quaternion();
  function okPoint(p, pad) {
    if (p.distanceTo(opts.shipPos) < opts.shipRadius + 40) return false;
    for (const pl of opts.planets()) if (p.distanceTo(pl.group.position) < opts.clearance(pl) + pad) return false;
    if (ms && hullDist(p) < pad) return false;
    return true;
  }
  function pickPatrol(f) {
    region(); let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 14; tries++) {
      const c = Math.floor(Math.random() * cells.length), i = Math.floor(c / (GY * GZ)), j = Math.floor(c / GZ) % GY, k = c % GZ;
      const p = new THREE.Vector3(rMin.x + (i + Math.random()) / GX * (rMax.x - rMin.x), rMin.y + (j + Math.random()) / GY * (rMax.y - rMin.y), rMin.z + (k + Math.random()) / GZ * (rMax.z - rMin.z));
      if (p.distanceTo(f.pos) < 60 || !okPoint(p, 25)) continue;
      const score = Math.min(time - cells[c], 600) + Math.random() * 40;
      if (score > bestScore) { bestScore = score; best = { p, c }; }
    }
    if (!best) { const p = f.pos.clone().multiplyScalar(-0.5); return p; }
    cells[best.c] = time;
    return best.p;
  }
  // Distance from p to the hull's solid volumes (boxes in ship space); negative inside. hullNormal is the way out, in world space.
  const hullNormal = new THREE.Vector3(), hp = new THREE.Vector3();
  function hullDist(p) {
    hp.copy(p).sub(root.position).applyQuaternion(msQi);
    let best = Infinity;
    for (const [x0, y0, z0, x1, y1, z1] of ms.D.boxes) {
      const cx = clamp(hp.x, x0, x1), cy = clamp(hp.y, y0, y1), cz = clamp(hp.z, z0, z1);
      let d, nx = hp.x - cx, ny = hp.y - cy, nz = hp.z - cz;
      if (nx === 0 && ny === 0 && nz === 0) {
        // Inside: the nearest face is the way out.
        const pen = [hp.x - x0, x1 - hp.x, hp.y - y0, y1 - hp.y, hp.z - z0, z1 - hp.z], m = Math.min(...pen), a = pen.indexOf(m);
        d = -m; nx = a === 0 ? -1 : a === 1 ? 1 : 0; ny = a === 2 ? -1 : a === 3 ? 1 : 0; nz = a === 4 ? -1 : a === 5 ? 1 : 0;
      } else d = Math.hypot(nx, ny, nz);
      if (d < best) { best = d; hullNormal.set(nx, ny, nz); }
    }
    hullNormal.normalize().applyQuaternion(msQ);
    return best;
  }
  // Push a point (world space) out of the whole hull, not just its nearest box: boxes overlap, and pushing out of one
  // must not land inside another. Tries the six straight directions and takes the shortest way out. Returns true if moved.
  const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], pq = new THREE.Vector3();
  function pushOut(p, pad) {
    hp.copy(p).sub(root.position).applyQuaternion(msQi);
    const inside = (x, y, z) => ms.D.boxes.find(([x0, y0, z0, x1, y1, z1]) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad && z > z0 - pad && z < z1 + pad);
    if (!inside(hp.x, hp.y, hp.z)) return false;
    let bestT = Infinity, bestA = null;
    for (const a of AX) {
      let t = 0;
      for (let n = 0; n < 12; n++) {
        const b = inside(hp.x + a[0] * t, hp.y + a[1] * t, hp.z + a[2] * t); if (!b) break;
        const i = a[0] ? 0 : a[1] ? 1 : 2, v = [hp.x, hp.y, hp.z][i], sgn = a[0] + a[1] + a[2];
        t = (sgn > 0 ? b[i + 3] + pad - v : v - (b[i] - pad)) + 0.01;
      }
      if (t < bestT) { bestT = t; bestA = a; }
    }
    pq.set(...bestA).multiplyScalar(bestT); hp.add(pq);
    p.copy(hp).applyQuaternion(msQ).add(root.position);
    return true;
  }
  // Does the straight line a-b (ship space) pass through any hull box?
  function segHits(a, b) {
    for (const [x0, y0, z0, x1, y1, z1] of ms.D.boxes) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [o, d, lo, hi] of [[a.x, b.x - a.x, x0, x1], [a.y, b.y - a.y, y0, y1], [a.z, b.z - a.z, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  // Where to steer next on the way to a target (world space): straight there if the hull isn't in the way, otherwise
  // down under the keel first, then across underneath, then up to the target.
  const ra = new THREE.Vector3(), rb = new THREE.Vector3();
  function route(f, target) {
    if (!ms) return target;
    toLocal(f.pos, ra); toLocal(target, rb);
    if (!segHits(ra, rb)) return target;
    const under = Math.min(...ms.D.boxes.map(b => b[1])) - 60;
    if (ra.y > under + 10) { rb.set(ra.x, under, ra.z); if (segHits(ra, rb)) rb.set(ra.x + Math.sign(ra.x || 1) * 80, ra.y, ra.z); }
    else rb.set(rb.x, under, rb.z);
    return toWorld(rb, new THREE.Vector3());
  }
  const toWorld = (lp, out) => out.copy(lp).applyQuaternion(msQ).add(root.position);
  const toLocal = (wp, out) => out.copy(wp).sub(root.position).applyQuaternion(msQi);
  const yawQ = (y, out = new THREE.Quaternion()) => out.setFromAxisAngle(UPV, y);
  // Bays: each has its own frame (mouth at x = 0, out is -x, floor at y = 0, spots along z). Slots are numbered across all bays.
  const NOSE_OUT = Math.PI / 2, NOSE_IN = -Math.PI / 2;     // fighter yaw in a bay's frame: nose out of the mouth (-x) or in (+x)
  const ref = k => ms.D.slotRefs[k];
  const L2S = (bay, x, y, z, out) => out.set(x, y, z).applyMatrix4(bay.M);
  const bayQ = (bay, a, out = new THREE.Quaternion()) => out.copy(bay.Q).multiply(tmpQ3.setFromAxisAngle(UPV, a));
  const slotPos = (k, out) => { const r = ref(k); return L2S(r.bay, r.bay.slotX, 0, r.bay.slotZ(r.i), out); };
  const padPos = out => { const b = ms.D.mainBay; return L2S(b, b.slotX, 0, b.padZ, out); };
  const entryPos = (k, out) => { const r = ref(k); return L2S(r.bay, -42, 3, r.bay.slotZ(r.i), out); };
  const tmpQ3 = new THREE.Quaternion(), tmpE = new THREE.Vector3(), tmpL = new THREE.Vector3();
  // A free spot near a point (ship space): nearby bays win, but busy bays count against them and there's a little chance
  // in it, so landings and launches spread over the whole hull instead of all using the same bay. Any spot if no point.
  function freeSlot(near = null) {
    if (!ms) return -1;
    const used = new Set(fighters.map(f => f.slot)), load = new Map();
    for (const f of fighters) if (f.slot >= 0) { const b = ref(f.slot).bay; load.set(b, (load.get(b) || 0) + 1); }
    let best = -1, bd = Infinity;
    for (let k = 0; k < ms.D.slots; k++) {
      if (used.has(k)) continue;
      const d = near ? entryPos(k, tmpE).distanceTo(near) * (0.6 + Math.random() * 0.8) + (load.get(ref(k).bay) || 0) * ms.D.L * 0.15 : Math.random();
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  const nearestBay = near => ms.D.bays.reduce((a, b) => b.center.distanceTo(near) < a.center.distanceTo(near) ? b : a, ms.D.bays[0]);
  const docked = () => fighters.filter(f => ['docked', 'turn', 'refuel', 'ready', 'board'].includes(f.state)).length;
  const isLocal = f => ['docked', 'turn', 'refuel', 'ready', 'board', 'launch', 'approach', 'rollout'].includes(f.state);

  function dock(f, slot, state = 'refuel') {
    f.slot = slot; f.state = state; slotPos(slot, f.lp); bayQ(ref(slot).bay, NOSE_OUT, f.lq); f.t = 0; f.dur = 7 + Math.random() * 5; f.pilot = false;
    if (state === 'refuel') f.fuel = Math.min(f.fuel, 0.3);
  }
  function startPatrol(f) { f.state = 'patrol'; f.target = pickPatrol(f); f.lead = null; }
  // Launch straight out of a bay's mouth: from a spot (or the main bay's pad), given in that bay's frame.
  function launch(f) { const r = ref(f.slot); launchFrom(f, r.bay, r.bay.slotX, r.bay.slotZ(r.i)); ms.service[f.slot].want = 0; }
  function launchFrom(f, bay, x, z) { f.state = 'launch'; f.t = 0; f.lb = bay; f.from.set(x, 0, z); f.pilot = true; }
  function place(f) {
    // Start somewhere out on patrol, spread over the region.
    f.pos.copy(pickPatrol(f)); f.vel.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).setLength(f.speed * spdK);
    f.fuel = 0.35 + Math.random() * 0.65; startPatrol(f);
  }

  // ----- Money in: set the fund, the tier and the number of fighters -----
  function setFund({ has, amount, months, unit = 100, first = false }) {
    unit = Math.max(1, +unit || 100);
    Object.assign(fund, { has, amount: Math.max(0, amount || 0), months: months || 0, unit });
    const total = has ? Math.floor(fund.amount / unit) : 0, key = has ? tierFor(fund.amount, fund.months) : null;
    if (key !== tierKey) setTier(key, first);
    const before = fund.total; fund.total = key ? total : 0;
    const target = Math.min(MAX_ACTIVE, fund.total);
    if (!ms) { fighters.length = 0; reserveIds.length = 0; rollQueue = 0; rolling = null; return; }
    if (first || before === 0 && fighters.length === 0 && !rolling) {
      // Arriving: no fanfare, the wing is simply out there already.
      fighters.length = 0; reserveIds.length = 0; nextId = 0;
      for (let i = 0; i < target; i++) fighters.push(mk(nextId++));
      for (let i = target; i < fund.total; i++) reserveIds.push(nextId++);
      const nDock = Math.min(ms.D.slots, Math.max(target ? 1 : 0, Math.round(target * 0.25)));
      fighters.forEach((f, i) => { if (i < nDock) { dock(f, freeSlot(), i % 2 ? 'ready' : 'refuel'); f.fuel = i % 2 ? 1 : 0.4; f.t = Math.random() * 4; } else place(f); });   // spread over the bays
      if (reduced) for (const f of fighters) f.thrust = 0;
      if (!first && fund.total > 0) say(fund.total === 1 ? 'New fighter added' : `${fund.total} new fighters added`);
      return;
    }
    const have = fighters.filter(f => !f.retire).length + reserveIds.length + rollQueue;
    if (fund.total > have) {
      // New fighters roll out of the assembly bay one after another (a few at most; the rest go straight to the reserve).
      const add = fund.total - have, shown = Math.min(add, 40);
      rollQueue += shown; for (let i = shown; i < add; i++) reserveIds.push(nextId++);
      say(add === 1 ? 'New fighter added' : `${add} new fighters added`);
    } else if (fund.total < have) {
      // Fewer: quietly move the extras to the reserve hangar, and then out of the count. No messages.
      let extra = have - fund.total;
      const cut = Math.min(extra, rollQueue); rollQueue -= cut; extra -= cut;
      const cutR = Math.min(extra, reserveIds.length); reserveIds.splice(reserveIds.length - cutR, cutR); extra -= cutR;
      const order = fighters.filter(f => !f.retire).sort((a, b) => (isLocal(b) ? 1 : 0) - (isLocal(a) ? 1 : 0));
      for (const f of order) { if (extra <= 0) break; extra--; if (['docked', 'refuel', 'ready', 'turn'].includes(f.state)) { if (f.slot >= 0) ms.service[f.slot].want = 0; fighters.splice(fighters.indexOf(f), 1); } else f.retire = true; }
    }
  }
  function say(msg) { if (time - lastToast > 1.5 || !lastToast) { lastToast = time || 0.001; opts.toast?.(msg); } }

  function setTier(key, first) {
    const old = ms; tierKey = key;
    ms = key ? built(key) : null;
    if (old && old !== ms) { fading = old; fading.t = 1; }
    if (ms) {
      spdK = 1 + ms.D.L / 800;   // fighters fly faster around bigger ships
      if (station.set && !first) {
        const before = station.pos.clone(), r = shellR();
        if (Math.abs(before.length() - r) > r * 0.1) {
          station.pos.setLength(r * 1.05); station.move = null;
          if (fading) fading.root.position.copy(before).sub(station.pos).applyQuaternion(msQi);
          moveStation(0);
        }
      }
      if (!root.children.includes(ms.root)) root.add(ms.root);
      ms.root.visible = true; transition = first || reduced ? 1 : 0; ms.setFade(transition);
      if (!station.set) { if (!pickStation(null)) station.pos.set(0, 0, -opts.volume() * 1.4); station.set = true; moveStation(0); }
      // Fighters in the hangar get bays on the new ship, or head out to wait for one. Ones flying home to a bay the
      // new ship doesn't have wait outside for a free one.
      for (const s of ms.service) { s.want = 0; s.landing = false; }
      for (const f of fighters) if (!isLocal(f) && f.slot >= ms.D.slots) { f.slot = -1; if (f.state === 'return') { f.state = 'hold'; f.t = 0; } }
      for (const f of fighters) if (isLocal(f)) {
        toWorld(f.lp, f.pos);
        if (f.slot >= 0 && f.slot < ms.D.slots && f.state !== 'launch' && f.state !== 'approach' && f.state !== 'rollout') dock(f, f.slot, 'ready');
        else { f.slot = -1; f.vel.set(0, 0, 0); f.pos.copy(toWorld(L2S(ms.D.mainBay, -30, 0, 0, tmp), tmp2)); startPatrol(f); }
      }
      rolling = null;
    }
    if (first && old) { old.root.visible = false; old.root.position.set(0, 0, 0); fading = null; }
  }

  // ----- Where the mothership waits: far from the player's ship and every planet -----
  // The player's ship never goes further out than 1.5x the planets' space, so a station whose whole hull stays outside
  // that can never overlap a planet or trap the player.
  const hullR = () => TIERS[tierKey || 'frigate'].L * 0.56;
  const shellR = () => opts.volume() * 1.5 + MS.shellGap + hullR();
  function pickStation(from, relax = 1) {
    const vol = opts.volume(), planets = opts.planets(), R = hullR(), r0 = shellR(), keepOut = vol * 1.5 + R + 40;
    let best = null, bestScore = -Infinity;
    const Lh = TIERS[tierKey || 'frigate'].L;
    for (let tries = 0; tries < 160; tries++) {
      const a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 0.6, d = r0 * (1 + Math.random() * 0.15);
      const p = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize().multiplyScalar(d);
      // A relocation is a hop of a few hull lengths along the parking shell.
      if (from) { tmp.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5); tmp.addScaledVector(from, -tmp.dot(from) / from.lengthSq()).normalize();
        p.copy(from).addScaledVector(tmp, Lh * (MS.hopMin + Math.random() * (MS.hopMax - MS.hopMin))).setLength(d); }
      if (p.distanceTo(opts.shipPos) < R + 200) continue;
      if (planets.some(pl => p.distanceTo(pl.group.position) < opts.clearance(pl) + R + 60)) continue;
      let score = Math.random() * 20;
      if (from) {
        const len = p.distanceTo(from); if (len < Lh * MS.hopMin * 0.8) continue;
        if (segDist(from, p, tmp.set(0, 0, 0)) < keepOut * Math.min(1, relax + 0.3)) continue;
        if (planets.some(pl => segDist(from, p, pl.group.position) < opts.clearance(pl) + R + 15)) continue;
        if (segDist(from, p, opts.shipPos) < R + 60) continue;
        const want = Math.atan2(-(p.x - from.x), -(p.z - from.z)), turn = Math.abs(Math.atan2(Math.sin(want - station.yaw), Math.cos(want - station.yaw)));
        if (turn > 1.0 / relax) continue;   // only a gentle turn (more allowed only if space is crowded)
        score -= turn * 40;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return relax > 0.3 ? pickStation(from, relax * 0.7) : false;
    if (!from) { station.pos.copy(best); station.yaw = Math.random() * Math.PI * 2; return true; }
    const dir = best.clone().sub(from), len = dir.length();
    station.move = { from: from.clone(), dir: dir.normalize(), len, s: 0, v: 0, yaw0: station.yaw, yaw1: Math.atan2(-dir.x, -dir.z) };
    return true;
  }
  function segDist(a, b, c) { const ab = tmp2.copy(b).sub(a), t = clamp(tmp.copy(c).sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1); return tmp.copy(a).addScaledVector(ab, t).distanceTo(c); }

  let reduced = false, spdK = 1, calmNow = false, player = null;
  function moveStation(dt) {
    station.drift += dt;
    const mv = station.move;
    if (mv) {
      // Very slow speed-up and slow-down, and a gentle turn toward where it's going. It waits if the player is in the way.
      const VMAX = Math.max(6, (ms?.D.L || 0) / 150), A = VMAX / 60, left = mv.len - mv.s;
      const blocked = tmp.copy(opts.shipPos).sub(station.pos), ahead = blocked.dot(mv.dir) > 0 && blocked.length() < hullR() + 70;
      const want = ahead ? 0 : Math.min(VMAX, Math.sqrt(2 * A * Math.max(0, left)) + 0.05);
      mv.v += clamp(want - mv.v, -A * 2 * dt, A * dt);
      mv.s = Math.min(mv.len, mv.s + mv.v * dt);
      station.pos.copy(mv.from).addScaledVector(mv.dir, mv.s);
      const turnT = smooth(clamp(mv.s / (mv.len * 0.45), 0, 1));
      station.yaw = mv.yaw0 + Math.atan2(Math.sin(mv.yaw1 - mv.yaw0), Math.cos(mv.yaw1 - mv.yaw0)) * turnT;
      if (mv.len - mv.s < 0.05 && mv.v < 0.1) { station.move = null; station.next = 300 + Math.random() * 300; }
    } else if (!reduced && ms && (station.next -= dt) <= 0) {
      if (!pickStation(station.pos.clone())) station.next = 30;
    }
    const d = reduced ? 0 : 1 + (ms ? ms.D.L / 400 : 0), s = station.drift;
    root.position.set(station.pos.x + Math.sin(s * 0.11) * 0.7 * d, station.pos.y + Math.sin(s * 0.07) * 0.45 * d, station.pos.z + Math.cos(s * 0.09) * 0.7 * d);
    root.rotation.set(0, station.yaw, Math.sin(s * 0.05) * 0.004 * (reduced ? 0 : 1));
    msQ.setFromEuler(root.rotation); msQi.copy(msQ).invert();
  }

  // ----- Flight in open space: steer toward a target, keep apart, stay clear of ships and planets -----
  const desired = new THREE.Vector3(), away = new THREE.Vector3(), fwd = new THREE.Vector3(), prevFwd = new THREE.Vector3(), lookM = new THREE.Matrix4(), rollQ = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  function steer(f, target, speed) {
    target = route(f, target);
    desired.copy(target).sub(f.pos);
    const dist = desired.length();
    desired.setLength(speed * (f.state === 'return' ? clamp(dist / 30, 0.45, 1) : 1));
    for (const g of fighters) {
      if (g === f || isLocal(g)) continue;
      away.copy(f.pos).sub(g.pos); const l = away.length(), min = (f.lead === g || g.lead === f) ? 4 : 14;
      if (l < min && l > 1e-4) desired.addScaledVector(away, (min - l) / l * 3);
    }
    const avoid = (center, R) => { away.copy(f.pos).sub(center); const l = away.length(); if (l < R && l > 1e-4) desired.addScaledVector(away, (R - l) / l * 2.5); };
    avoid(opts.shipPos, opts.shipRadius + 26);
    for (const pl of opts.planets()) avoid(pl.group.position, opts.clearance(pl) + 26);
    if (ms) {
      // Look ahead in proportion to speed; gently when lining up for the bay, which sits close to the hull.
      const homing = f.state !== 'patrol' && f.pos.distanceTo(target) < 150;
      const look = homing ? f.pos : tmp2.copy(f.pos).addScaledVector(f.vel, 1.2), reach = homing ? 10 : 18 + f.vel.length() * 0.8, l = hullDist(look);
      if (l < reach) desired.addScaledVector(hullNormal, (reach - l) / reach * speed * 3);
    }
    f.steer.copy(desired);
  }
  function hardClear(f) {
    const push = (center, R) => { away.copy(f.pos).sub(center); const l = away.length(); if (l < R) f.pos.copy(center).addScaledVector(away.normalize(), R); };
    push(opts.shipPos, opts.shipRadius + 3);
    for (const pl of opts.planets()) push(pl.group.position, opts.clearance(pl) + 2);
    if (ms && pushOut(f.pos, 2)) {
      // Slide along the hull instead of into it.
      toLocal(f.pos, ra); hullDist(f.pos); const into = f.vel.dot(hullNormal); if (into < 0) f.vel.addScaledVector(hullNormal, -into);
    }
  }
  function integrate(f, dt) {
    prevFwd.copy(f.vel).normalize();
    tmp.copy(f.steer).sub(f.vel); const A = 11 * spdK * dt; if (tmp.length() > A) tmp.setLength(A);
    f.vel.add(tmp);
    const sp = f.vel.length(); if (sp < 6 && !f.escort) f.vel.setLength(6); if (sp > f.speed * spdK * 1.5) f.vel.setLength(f.speed * spdK * 1.5);
    f.pos.addScaledVector(f.vel, dt);
    hardClear(f);
    // Never closer than a few lengths to another fighter (wingmen fly a little closer, but never touch).
    for (const g of fighters) {
      if (g === f || isLocal(g)) continue;
      const min = (f.lead === g || g.lead === f) ? 3.5 : 6;
      away.copy(f.pos).sub(g.pos); const l = away.length();
      if (l < min) f.pos.addScaledVector(l > 1e-4 ? away.divideScalar(l) : away.set(0, 1, 0), min - l);
    }
    if (ms) pushOut(f.pos, 2);
    fwd.copy(f.vel).normalize();
    if (f.escort && player && f.vel.length() < 4) { fwd.set(0, 0, -1).applyQuaternion(player.q); prevFwd.copy(fwd); }   // hovering alongside: face the way the player faces
    const turn = prevFwd.cross(fwd).y / Math.max(dt, 1e-4);
    f.roll += (clamp(turn * 1.2, -0.9, 0.9) - f.roll) * (1 - Math.exp(-dt * 3));
    lookM.lookAt(f.pos, tmp.copy(f.pos).add(fwd), UPV); f.q.setFromRotationMatrix(lookM).multiply(rollQ.setFromAxisAngle(Z, f.roll));
    f.thrust = 1;
  }

  // Cubic curve helpers for the landing approach (in mothership space).
  const bez = (a, b, c, d, t, out) => { const u = 1 - t; return out.copy(a).multiplyScalar(u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t); };
  const bezD = (a, b, c, d, t, out) => { const u = 1 - t; return out.copy(b).sub(a).multiplyScalar(3 * u * u).addScaledVector(tmp2.copy(c).sub(b), 6 * u * t).addScaledVector(tmp.copy(d).sub(c), 3 * t * t); };

  function think(f, dt, far) {
    const D = ms.D;
    switch (f.state) {
      case 'patrol': case 'return': case 'hold': {
        if (f.state === 'patrol') {
          f.fuel -= dt / f.endurance;
          if (f.lead) { if ((f.pairT -= dt) <= 0 || f.lead.state !== 'patrol') { f.lead = null; f.target = pickPatrol(f); } }
          // Home to the bay nearest to where it is now.
          if ((f.fuel < 0.18 || f.retire) && !f.lead) { f.state = 'return'; f.slot = freeSlot(toLocal(f.pos, tmpL)); if (f.slot < 0) { f.state = 'hold'; f.t = 0; } for (const g of fighters) if (g.lead === f) g.lead = null; }
        }
        let target, speed = f.speed * spdK;
        if (f.threat && (!f.threat.alive || f.state !== 'patrol' || calmNow || f.escort)) f.threat = null;
        if (f.escort && (f.state !== 'patrol' || !player)) f.escort = 0;
        if (f.state === 'patrol' && f.escort) {
          // Keeping the player company: beside the ship at a polite distance, matching its pace, weapons stowed.
          const D3 = WORLD.warnings.shadowDistance * SHIP_LEN;
          target = cv1.set(f.escort * D3, D3 * 0.25, D3 * 0.35).applyQuaternion(player.q).add(player.pos).clone();
          const dist = f.pos.distanceTo(target);
          speed = clamp(dist * 0.8 + player.speed, 0, f.speed * spdK * 1.5);
        } else if (f.state === 'patrol' && f.threat) {
          // Engaging: hold a stand-off point near the target (on the side away from the player), and fire when lined up and safe.
          const th = f.threat; cv1.copy(f.pos).sub(th.pos); if (cv1.lengthSq() < 1) cv1.set(0, 1, 0);
          cv1.applyAxisAngle(UPV, (f.id % 6) * 1.05).y += ((f.id % 3) - 1) * 0.4;   // each fighter its own side, so two never share a spot
          target = cv1.setLength(70).add(th.pos).clone(); speed = f.speed * spdK * 0.8;
          if ((f.fireT -= dt) <= 0 && f.pos.distanceTo(th.pos) < 320) {
            f.fireT = 1.1 + Math.random() * 0.6; const dir = cv2.copy(th.pos).sub(f.pos).normalize(), fw = cv3.set(0, 0, -1).applyQuaternion(f.q);
            if (fw.dot(dir) > 0.9 && safeShot(f.pos, dir, f.pos.distanceTo(th.pos) + 100)) fireTracer(f.pos.clone().addScaledVector(dir, 3), dir.clone(), 'fighter');
          }
        } else if (f.state === 'patrol') {
          if (f.lead) { target = tmp2.set(4.5, 0, 3).applyQuaternion(f.lead.q).add(f.lead.pos).clone(); speed = f.lead.speed * spdK * 1.15; }
          else {
            if (f.pos.distanceTo(f.target) < 18) {
              f.target = pickPatrol(f);
              // Now and then a nearby fighter joins as a wingman for a short leg.
              if (Math.random() < 0.25) { const mate = fighters.find(g => g !== f && g.state === 'patrol' && !g.lead && !fighters.some(h => h.lead === g) && g.pos.distanceTo(f.pos) < 120 && g.fuel > 0.4); if (mate) { mate.lead = f; mate.pairT = 14 + Math.random() * 12; } }
            }
            target = f.target;
          }
        } else if (f.state === 'hold') {
          // No free bay yet: wait a little way out from the mouth.
          const hb = nearestBay(toLocal(f.pos, tmpL));
          target = toWorld(L2S(hb, -70 - (f.id % 3) * 14, 3 - (f.id % 6) * 6, ((f.id % 5) - 2) * 10, tmp2), new THREE.Vector3()); speed = 9;
          if ((f.t += dt) > 1) { f.t = 0; const s = freeSlot(toLocal(f.pos, tmpL)); if (s >= 0) { f.slot = s; f.state = 'return'; } }
        } else if (!(f.slot >= 0 && f.slot < D.slots)) { f.state = 'hold'; f.slot = -1; f.t = 0; return; }
        else {
          // Coming home: aim for a point straight out from the bay's mouth.
          target = toWorld(entryPos(f.slot, tmp2), new THREE.Vector3());
          if (f.pos.distanceTo(target) < 9) {
            f.state = 'approach'; f.t = 0; f.dur = 8; ms.service[f.slot].landing = true;
            toLocal(f.pos, f.from); f.lq.copy(msQi).multiply(f.q);
            const dirL = tmp.copy(f.vel).applyQuaternion(msQi).normalize();
            const rr = ref(f.slot); f.c1.copy(f.from).addScaledVector(dirL, 12); L2S(rr.bay, -10, 0.6, rr.bay.slotZ(rr.i), f.c2);
            f.lp.copy(f.from); f.walk = 0;
            return;
          }
        }
        if (!far || f.tick === 0 || f.steer.lengthSq() === 0) steer(f, target, speed);
        integrate(f, dt);
        f.fuel = Math.max(0.02, f.fuel);
        break;
      }
      case 'approach': {
        f.t += dt; const u = clamp(f.t / f.dur, 0, 1), e = 1 - Math.pow(1 - u, 2.2);
        const end = slotPos(f.slot, tmp2.clone());
        bez(f.from, f.c1, f.c2, end, e, f.lp);
        const d = bezD(f.from, f.c1, f.c2, end, Math.min(e, 0.999), new THREE.Vector3()); d.y *= 0.3;
        const aim = new THREE.Quaternion().setFromRotationMatrix(lookM.lookAt(tmp.set(0, 0, 0), d.normalize(), UPV));
        f.lq.slerp(aim, clamp(dt * 3, 0, 1));
        f.thrust = 1 - u;
        if (u >= 1) { f.state = 'turn'; f.t = 0; ms.service[f.slot].landing = false; bayQ(ref(f.slot).bay, NOSE_IN, f.lq); }
        break;
      }
      case 'turn': {
        // The bay's turntable turns the fighter round to face the mouth again.
        f.t += dt; const u = smooth(clamp(f.t / 2.2, 0, 1)); f.thrust = 0;
        bayQ(ref(f.slot).bay, NOSE_IN + Math.PI * u, f.lq);
        if (u >= 1) {
          if (f.retire) { ms.service[f.slot].want = 0; fighters.splice(fighters.indexOf(f), 1); return; }
          f.state = 'refuel'; f.t = 0; f.dur = 8 + Math.random() * 4; f.pilot = false; ms.service[f.slot].want = 1;
        }
        break;
      }
      case 'refuel': {
        ms.service[f.slot].want = 1; f.thrust = 0;
        if (ms.service[f.slot].hose > 0.95) f.fuel = Math.min(1, f.fuel + dt / f.dur * 1.4);
        if (f.fuel >= 1) {
          ms.service[f.slot].want = 0; f.state = 'ready'; f.t = 0; f.dur = 3 + Math.random() * 9;
          // Rotate crews: the fighter goes to the reserve and a rested one takes its place in the bay.
          if (reserveIds.length && Math.random() < 0.5) { reserveIds.push(f.id); f.id = reserveIds.shift(); }
        }
        break;
      }
      case 'docked': case 'ready': {
        f.t += dt;
        // Someone always stays home: a fighter only leaves if enough others are parked and not already boarding.
        const minDocked = fighters.length >= 12 ? 2 : fighters.length >= 3 ? 1 : 0;
        const staying = fighters.filter(g => ['docked', 'turn', 'refuel', 'ready'].includes(g.state)).length;
        if (f.t > f.dur && staying - 1 >= minDocked && ms.service[f.slot].arm < 0.05) { f.state = 'board'; f.t = 0; f.walk = 0; }
        break;
      }
      case 'board': {
        // A pilot walks out of the crew door to the fighter, climbs in, and off they go.
        f.t += dt; if (f.t > 3.2) { f.pilot = true; launch(f); }
        break;
      }
      case 'launch': {
        // Straight out along the bay's lane, gently at first (more gently still in calm space).
        f.t += dt; const a = calmNow ? 1.6 : 4.5, x = f.from.x - 0.5 * a * f.t * f.t, out = Math.max(0, -x);
        L2S(f.lb, x, f.from.y + out * 0.12, f.from.z, f.lp); bayQ(f.lb, NOSE_OUT, f.lq).multiply(tmpQ.setFromAxisAngle(tmp.set(1, 0, 0), Math.min(0.12, out * 0.01)));
        f.thrust = 1;
        if (x < -26) {
          toWorld(f.lp, f.pos); f.q.copy(msQ).multiply(f.lq);
          f.vel.set(0, 0, -1).applyQuaternion(f.q).multiplyScalar(a * f.t);
          f.slot = -1; startPatrol(f);
        }
        break;
      }
      case 'rollout': {
        // A new fighter: the shutter opens, it rolls out of the assembly bay, turns to face space, the pilot waves, sparkles.
        f.t += dt; const T1 = 1.2, T2 = T1 + 3.6, T3 = T2 + 1.4, T4 = T3 + 3.2;
        const mb = ms.D.mainBay, from = L2S(mb, mb.slotX, 0, mb.zA, tmp), pad = padPos(tmp2.clone());
        if (f.t < T2) { const u = smooth(clamp((f.t - T1) / (T2 - T1), 0, 1)); f.lp.lerpVectors(from, pad, u); bayQ(mb, 0, f.lq); }
        else { if (!f.cheered) { f.cheered = true; burst(tmp.copy(pad)); }
          f.lp.copy(pad); bayQ(mb, NOSE_OUT * smooth(clamp((f.t - T2) / (T3 - T2), 0, 1)), f.lq); }
        f.thrust = 0;
        if (f.t > T4) { f.pilot = true; rolling = null; f.slot = -1; launchFrom(f, mb, mb.slotX, mb.padZ); }
        break;
      }
    }
  }

  // ----- Weapons: soft tracer bolts, missiles with smoke, practice drones, and the interception hook -----
  // Everything here lives in universe space, in `fx` (space.js adds it to the world). Pools are fixed in size and reused.
  // The guns only ever fire at threats (practice drones now, asteroids later), and only when the line of fire points away
  // from the player's ship and every planet, misses every fighter, and doesn't cross the mothership's own hull.
  const fx = new THREE.Group(); fx.name = 'fleet-fx';
  const glowMat = (color, size, o = {}) => new THREE.PointsMaterial({ size, map: tx.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o });
  const pool = (n, size, color, alpha = false) => {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * (alpha ? 4 : 3));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, alpha ? 4 : 3)); g.setDrawRange(0, 0);
    const p = new THREE.Points(g, glowMat('#FFFFFF', size, { vertexColors: true, blending: alpha ? THREE.NormalBlending : THREE.AdditiveBlending })); p.frustumCulled = false; fx.add(p);
    return { p, g, pos, col, items: [] };
  };
  // Tracer bolts: short glowing streaks, instanced.
  const TRC = 160, tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), TRC);
  tracerMesh.frustumCulled = false; tracerMesh.count = 0; tracerMesh.setColorAt(0, new THREE.Color()); fx.add(tracerMesh);
  const tracers = [];
  // Missiles: small dark bodies with a soft exhaust glow, leaving grey smoke.
  const MSL = 24, missileGeo = mergeGeometries([cylG(0.3, 0.3, 2.4, 8).rotateX(Math.PI / 2), new THREE.ConeGeometry(0.3, 0.8, 8).rotateX(-Math.PI / 2).translate(0, 0, -1.6).toNonIndexed(), boxG(0.9, 0.05, 0.4).translate(0, 0, 1.0), boxG(0.05, 0.9, 0.4).translate(0, 0, 1.0)].map(g => (g.index ? g.toNonIndexed() : g)));
  const missileMesh = new THREE.InstancedMesh(missileGeo, new THREE.MeshStandardMaterial({ color: '#3A3F44', roughness: 0.6, emissive: '#1C2024' }), MSL);
  missileMesh.frustumCulled = false; missileMesh.count = 0; fx.add(missileMesh);
  const missiles = [], smoke = pool(900, 5, '#FFFFFF', true), sparks = pool(360, 1.6, '#FFFFFF'), glows = pool(64, 3.5, '#FFFFFF');
  // Practice drones: small orange-lit targets that drift around a training zone.
  const DRN = 12, droneMesh = new THREE.InstancedMesh(mergeGeometries([new THREE.OctahedronGeometry(1.6, 0), new THREE.TorusGeometry(2.0, 0.18, 6, 16).rotateX(Math.PI / 2).toNonIndexed()].map(g => (g.index ? g.toNonIndexed() : g))),
    new THREE.MeshStandardMaterial({ color: '#4A4F55', roughness: 0.5, emissive: '#FF8A5A', emissiveIntensity: 0.35, flatShading: true }), DRN);
  droneMesh.frustumCulled = false; droneMesh.count = 0; fx.add(droneMesh);
  const droneLights = pool(DRN, 4, '#FF9A6A');
  const threats = [], stats = { hits: 0, kills: 0, missiles: 0 };          // threats: { pos, vel, radius, hp, kind, alive, load, cap, zone, t }
  const segD = (a, b, c) => { const ab = cv1.copy(b).sub(a), t = clamp(cv2.copy(c).sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1); return cv2.copy(a).addScaledVector(ab, t).distanceTo(c); };
  const cv1 = new THREE.Vector3(), cv2 = new THREE.Vector3(), cv3 = new THREE.Vector3(), cv4 = new THREE.Vector3(), cq = new THREE.Quaternion(), cm = new THREE.Matrix4(), ZF = new THREE.Vector3(0, 0, -1);
  // Is it safe to fire from p (universe) along dir (unit) for len? Away from the player, the planets and every fighter, not through our hull.
  function safeShot(p, dir, len) {
    cv3.copy(opts.shipPos).sub(p); const dp = cv3.length();
    if (dir.dot(cv3) / Math.max(dp, 1e-6) > 0.5) return false;                                          // never toward the player's ship (within 60°)
    cv4.copy(p).addScaledVector(dir, len);
    if (segD(p, cv4, opts.shipPos) < opts.shipRadius + 150) return false;
    for (const pl of opts.planets()) { cv3.copy(pl.group.position).sub(p); if (dir.dot(cv3.normalize()) > 0.85 || segD(p, cv4, pl.group.position) < opts.clearance(pl) + 50) return false; }
    for (const f of fighters) if (!isLocal(f) && segD(p, cv4, f.pos) < 15) return false;
    if (ms) { toLocal(cv3.copy(p).addScaledVector(dir, 3), ra); toLocal(cv4.copy(p).addScaledVector(dir, Math.min(len, 600)), rb); if (segHits(ra, rb)) return false; }
    return true;
  }
  function fireTracer(p, dir, kind) {
    if (tracers.length >= TRC) return;
    const sp = kind === 'heavy' ? 420 : kind === 'pd' ? 520 : 380, size = kind === 'heavy' ? Math.max(0.35, ms.turrets.TS * 0.18) : 0.22;
    tracers.push({ pos: p.clone(), vel: dir.clone().multiplyScalar(sp), life: 3.2, max: 3.2, len: kind === 'heavy' ? 9 : 5, w: size, dmg: kind === 'heavy' ? 2 : 1,
      color: new THREE.Color(kind === 'heavy' ? '#9FF0D0' : kind === 'pd' ? '#FFE6A8' : '#9FD8FF') });
    puff(glows, p, kind === 'heavy' ? '#BFF5DF' : '#FFF0C8', 0.25, 0, 0.7);
  }
  function fireMissile(p, dir, target) {
    if (missiles.length >= MSL) return;
    missiles.push({ pos: p.clone(), vel: dir.clone().multiplyScalar(40), target, life: 14, smokeT: 0 }); stats.missiles++;
    puff(glows, p, '#FFD9A8', 0.35, 0, 0.6);
  }
  // Add a particle to a pool: smoke drifts and grows dim, sparks fly out, glows fade fast. Never a harsh flash.
  function puff(P, p, color, life, speed = 0, alpha = 1) {
    if (P.items.length >= P.pos.length / 3) P.items.shift();
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
    P.items.push({ pos: p.clone(), vel: v, age: 0, life, color: new THREE.Color(color), alpha });
  }
  function burstAt(p, big) { for (let i = 0; i < (big ? 40 : 14); i++) puff(sparks, p, i % 3 ? '#FFC98A' : '#FFF2D8', 0.8 + Math.random() * 0.7, big ? 22 : 12, 1); puff(glows, p, '#FFD9A8', 0.9, 0, big ? 0.9 : 0.5); }
  function stepPool(P, dt, smokeLike) {
    let n = 0;
    for (let i = P.items.length - 1; i >= 0; i--) { const it = P.items[i]; it.age += dt; if (it.age >= it.life) P.items.splice(i, 1); }
    for (const it of P.items) {
      it.pos.addScaledVector(it.vel, dt); it.vel.multiplyScalar(Math.exp(-dt * (smokeLike ? 0.6 : 1.8)));
      const k = 1 - it.age / it.life;
      P.pos.set([it.pos.x, it.pos.y, it.pos.z], n * 3);
      if (smokeLike) P.col.set([it.color.r, it.color.g, it.color.b, k * 0.45 * it.alpha], n * 4); else P.col.set([it.color.r * k * it.alpha, it.color.g * k * it.alpha, it.color.b * k * it.alpha], n * 3);
      n++;
    }
    P.g.setDrawRange(0, n); P.g.attributes.position.needsUpdate = P.g.attributes.color.needsUpdate = true;
  }
  // The interception hook. Anything dangerous (practice drones now, asteroids later) is handed in here; turrets, missile
  // batteries and fighters all engage it, and bigger targets draw more firepower (more turrets and fighters at once).
  function intercept({ pos, vel = new THREE.Vector3(), radius = 2, hp = 4, kind = 'asteroid' }) {
    const th = { pos: pos.clone(), vel: vel.clone(), radius, hp, kind, alive: true, load: 0, cap: clamp(Math.ceil(radius / 2) * 3, 3, 24), t: 0, wander: pos.clone() };
    threats.push(th);
    // Fighters: one per few units of size (at least one), from those out on patrol, nearest first.
    const nF = kind === 'drone' ? (threats.filter(x => x.kind === 'drone').length <= 2 ? 1 : 0) : clamp(Math.ceil(radius / 8), 1, 6);
    fighters.filter(f => f.state === 'patrol' && !f.threat && f.fuel > 0.35).sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos)).slice(0, nF).forEach(f => { f.threat = th; f.lead = null; f.fireT = 1 + Math.random(); });
    return th;
  }
  // Practice drill: a few drones in a training zone beyond the mothership, on the side away from the player and the planets.
  let drill = null, drillT = 90 + Math.random() * 90;
  function startDrill() {
    if (!ms) return false;
    const L0 = ms.D.L, out = root.position.clone().normalize(), awayShip = root.position.clone().sub(opts.shipPos).normalize();
    for (let tries = 0; tries < 20; tries++) {
      const dir = out.clone().add(awayShip).add(new THREE.Vector3(Math.random() - 0.5, 0.3 + Math.random() * 0.3, Math.random() - 0.5).multiplyScalar(0.8)).normalize();
      const zone = root.position.clone().addScaledVector(dir, L0 * 0.8 + 320);
      if (zone.distanceTo(opts.shipPos) < 700 || opts.planets().some(pl => zone.distanceTo(pl.group.position) < opts.clearance(pl) + 400)) continue;
      const n = 4 + Math.floor(Math.random() * 4);
      drill = { zone, t: 0, drones: [] };
      // Tougher drones for bigger ships, so a drill lasts long enough to watch on every tier.
      const hp = 6 + ms.turrets.list.length / 4;
      for (let i = 0; i < n; i++) drill.drones.push(intercept({ pos: zone.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(160)), radius: 2.2, hp, kind: 'drone' }));
      for (const d of drill.drones) d.zone = zone;
      return true;
    }
    return false;
  }
  let combatOn = false;
  function stepCombat(dt, { calm, near }) {
    // Drills: now and then, only when the camera is near enough to see them, never in calm space.
    if (!calm && ms && near && !drill && !threats.length && (drillT -= dt) <= 0) { startDrill(); drillT = 120 + Math.random() * 150; }
    if (drill) { drill.t += dt; if (drill.drones.every(d => !d.alive) || drill.t > 80) { for (const d of drill.drones) if (d.alive) { d.alive = false; puff(glows, d.pos, '#FFB08A', 0.8, 0, 0.4); } drill = null; } }
    // Threats move: drones wander around their zone.
    for (const th of threats) {
      if (!th.alive) continue; th.t += dt;
      if (th.kind === 'drone') { if (th.pos.distanceTo(th.wander) < 10 || th.t > 8) { th.t = 0; th.wander.copy(th.zone).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(220)); }
        cv1.copy(th.wander).sub(th.pos).setLength(16); th.vel.lerp(cv1, 1 - Math.exp(-dt * 0.8)); }
      th.pos.addScaledVector(th.vel, dt);
    }
    for (let i = threats.length - 1; i >= 0; i--) if (!threats[i].alive) { threats[i].load = 0; threats.splice(i, 1); }
    // Turrets: pick a target in range (spreading the load), lead it, and fire when lined up and safe.
    if (ms && near) {
      const T = ms.turrets, range = { heavy: 1400 + ms.D.L, pd: 600 + ms.D.L * 0.5, missile: 2400 + ms.D.L };
      // Guns and missile batteries each have their own share of a target, so both always join in.
      for (const th of threats) { th.load = 0; th.mload = 0; }
      for (const tt of T.list) if (tt.target?.alive) tt.target[tt.kind === 'missile' ? 'mload' : 'load']++; else tt.target = null;
      T.update(dt, time, { calm, want: tt => {
        if (calm) return null;
        tt.retarget = (tt.retarget || 0) - dt;
        const tw = toWorld(tt.pos, cv1);
        if (!tt.target && tt.retarget <= 0 && threats.length) {
          tt.retarget = 0.6;
          let best = null, bd = Infinity;
          const mis = tt.kind === 'missile';
          // Only targets it can see: in range and above its own horizon (a gun under the hull can't shoot over it).
          for (const th of threats) { const d = th.pos.distanceTo(tw); if (th.alive && d < range[tt.kind] && (mis ? (th.mload || 0) < Math.max(2, th.cap / 3) : th.load < th.cap) && d < bd
            && T.aimAt(tt, toLocal(th.pos, cv3)).pitch > 0.1) { bd = d; best = th; } }
          if (best) { tt.target = best; if (mis) best.mload = (best.mload || 0) + 1; else best.load++; }
        }
        if (!tt.target) return null;
        if (T.aimAt(tt, toLocal(tt.target.pos, cv3)).pitch < 0.05) { tt.target = null; return null; }   // it slipped below the horizon
        const d = tt.target.pos.distanceTo(tw), lead = d / (tt.kind === 'missile' ? 200 : tt.kind === 'heavy' ? 420 : 520);
        const aimW = cv2.copy(tt.target.pos).addScaledVector(tt.target.vel, lead);
        return T.aimAt(tt, toLocal(aimW, cv3));
      } });
      if (!calm) for (const tt of T.list) {
        tt.cd -= dt;
        if (!tt.target || tt.cd > 0 || tt.aimErr > 0.06 || tt.pitch < 0.05) continue;
        const pL = T.muzzle(tt, new THREE.Vector3(), cv4), dirW = cv4.clone().applyQuaternion(msQ).normalize(), pW = toWorld(pL, new THREE.Vector3());
        const len = tt.target.pos.distanceTo(pW) + 200;
        if (!safeShot(pW, dirW, len)) { tt.cd = 0.5; continue; }
        if (tt.kind === 'missile') fireMissile(pW, dirW, tt.target); else fireTracer(pW, dirW, tt.kind);
        tt.cd = tt.K.cool * (0.8 + Math.random() * 0.4);
      }
    }
    // Tracers fly straight, fade at the end, and stop at the first threat they reach.
    for (let i = tracers.length - 1; i >= 0; i--) {
      const b = tracers[i]; b.pos.addScaledVector(b.vel, dt); b.life -= dt;
      let hit = false;
      for (const th of threats) if (th.alive && th.pos.distanceTo(b.pos) < th.radius + 2) { th.hp -= b.dmg; hit = true; stats.hits++; puff(sparks, b.pos, '#FFE0B0', 0.5, 8, 0.8); if (th.hp <= 0) { th.alive = false; stats.kills++; burstAt(th.pos, th.radius > 4); } break; }
      if (hit || b.life <= 0) tracers.splice(i, 1);
    }
    // Missiles: speed up, turn toward their target, trail smoke; if the target is gone they fly on and fade out.
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i]; m.life -= dt;
      const sp = Math.min(240, m.vel.length() + 90 * dt);
      if (m.target?.alive) { cv1.copy(m.target.pos).sub(m.pos).normalize(); cv2.copy(m.vel).normalize(); const a = Math.min(1, 2.2 * dt / Math.max(0.01, cv2.angleTo(cv1))); cv2.lerp(cv1, a).normalize(); m.vel.copy(cv2).multiplyScalar(sp); }
      else m.vel.setLength(sp);
      m.pos.addScaledVector(m.vel, dt);
      if ((m.smokeT -= dt) <= 0) { m.smokeT = 0.035; puff(smoke, cv1.copy(m.vel).setLength(-1.8).add(m.pos), '#B8BCC2', 2.6, 1.5, 1); }
      if (m.target?.alive && m.pos.distanceTo(m.target.pos) < m.target.radius + 3) { m.target.hp -= 3; stats.hits++; burstAt(m.pos, false); if (m.target.hp <= 0) { m.target.alive = false; stats.kills++; burstAt(m.target.pos, m.target.radius > 4); } missiles.splice(i, 1); continue; }
      if (m.life <= 0) { puff(glows, m.pos, '#FFD9A8', 0.6, 0, 0.4); missiles.splice(i, 1); }
    }
    // Draw everything.
    tracerMesh.count = tracers.length;
    tracers.forEach((b, i) => { cq.setFromUnitVectors(ZF, cv1.copy(b.vel).normalize()); const k = Math.min(1, b.life / 0.4);
      cm.compose(b.pos, cq, cv2.set(b.w, b.w, b.len * k)); tracerMesh.setMatrixAt(i, cm); tracerMesh.setColorAt(i, b.color); });
    tracerMesh.instanceMatrix.needsUpdate = true; if (tracerMesh.instanceColor) tracerMesh.instanceColor.needsUpdate = true;
    missileMesh.count = missiles.length;
    missiles.forEach((m, i) => { cq.setFromUnitVectors(ZF, cv1.copy(m.vel).normalize()); cm.compose(m.pos, cq, cv2.set(1, 1, 1)); missileMesh.setMatrixAt(i, cm); puff(glows, cv1.copy(m.vel).setLength(-1.4).add(m.pos), '#FFD9A8', 0.08, 0, 0.5); });
    missileMesh.instanceMatrix.needsUpdate = true;
    const drones = threats.filter(t2 => t2.kind === 'drone' && t2.alive);
    droneMesh.count = Math.min(DRN, drones.length);
    drones.slice(0, DRN).forEach((d, i) => { cm.compose(d.pos, cq.setFromAxisAngle(UPV, time * 0.8 + i), cv2.set(1, 1, 1)); droneMesh.setMatrixAt(i, cm);
      droneLights.pos.set([d.pos.x, d.pos.y + 2.2, d.pos.z], i * 3); const on = 0.4 + 0.6 * Math.max(0, Math.sin(time * 2 + i)); droneLights.col.set([on, on * 0.6, on * 0.4], i * 3); });
    droneMesh.instanceMatrix.needsUpdate = true; droneLights.g.setDrawRange(0, droneMesh.count); droneLights.g.attributes.position.needsUpdate = droneLights.g.attributes.color.needsUpdate = true;
    stepPool(smoke, dt, true); stepPool(sparks, dt, false); stepPool(glows, dt, false);
    combatOn = threats.length > 0 || tracers.length > 0 || missiles.length > 0;
  }

  // ----- Every frame -----
  const camLocal = new THREE.Vector3();
  // calm: calm space or reduced motion. The guns hold still and fire nothing, there are no drills, fighters launch slowly.
  function update(dt, { camera, reduced: red = false, calm = false, player: pl = null, escort = false }) {
    calmNow = calm || red;
    reduced = red;
    player = pl;
    time += dt;
    // Two fighters keep the player company while they linger right by the hull (space.js decides when), then leave.
    const esc = fighters.filter(f => f.escort), wantEscort = escort && !red && !!pl;
    if (wantEscort && esc.length < 2) {
      const cands = fighters.filter(f => f.state === 'patrol' && !f.escort && !f.threat && f.fuel > 0.3).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos));
      for (const sd of [1, -1]) if (!esc.some(f => f.escort === sd)) { const f = cands.shift(); if (!f) break; f.escort = sd; f.lead = null; for (const g of fighters) if (g.lead === f) g.lead = null; }
    } else if (!wantEscort) for (const f of esc) { f.escort = 0; f.target = pickPatrol(f); }
    const fdt = reduced ? dt * 0.15 : dt;
    // Tier change: the old ship fades as the new one powers up.
    if (fading) { fading.t -= dt / 2.5; fading.root.scale.setScalar(0.94 + 0.06 * fading.t); fading.setFade(Math.max(0, fading.t)); if (fading.t <= 0) { fading.root.visible = false; fading.setFade(1); fading.root.scale.setScalar(1); fading.root.position.set(0, 0, 0); fading = null; } }
    if (!ms) { for (const k in inst) inst[k].count = 0; exhaust.geometry.setDrawRange(0, 0); navLights.geometry.setDrawRange(0, 0); people.visible = false; return; }
    if (transition < 1) { transition = Math.min(1, transition + dt / 3); ms.setFade(smooth(transition)); ms.root.scale.setScalar(0.9 + 0.1 * smooth(transition)); }
    moveStation(fdt);
    root.updateMatrixWorld();
    const camD = camera.position.distanceTo(root.position);
    toLocal(camera.position, camLocal);
    const nearHangar = ms.D.bays.some(b => camLocal.distanceTo(b.center) < 300 * ms.D.BS);

    // Keep the right number flying: promote reserves, start the next rollout.
    const want = Math.min(MAX_ACTIVE, fund.total);
    if (!rolling && rollQueue > 0 && fighters.length < CAP - 1) {
      rollQueue--;
      const f = mk(nextId++); f.state = 'rollout'; f.t = 0; f.cheered = false; f.slot = -1; f.pilot = false; f.fuel = 1;
      if (fighters.filter(g => !g.retire).length >= MAX_ACTIVE) {
        // The wing is full: the fighter that has been in the bay longest goes to the reserve to make room.
        const g = fighters.find(g => g.state === 'ready' || g.state === 'refuel');
        if (g) { reserveIds.push(g.id); ms.service[g.slot].want = 0; fighters.splice(fighters.indexOf(g), 1); } else { reserveIds.push(f.id); f.id = -1; }
      }
      if (f.id >= 0) { fighters.push(f); rolling = f; }
    }
    const act = fighters.filter(f => !f.retire).length;
    if (act < want && reserveIds.length && !rolling && !rollQueue) { const s = freeSlot(); if (s >= 0) { const f = mk(reserveIds.shift()); dock(f, s, 'ready'); f.fuel = 1; f.dur = 1 + Math.random() * 3; fighters.push(f); } }

    for (const f of [...fighters]) {
      const far = f.pos.distanceTo(camera.position) > 260 && !isLocal(f);
      if (far) f.tick = (f.tick + 1) % 4;
      think(f, fdt, far);
      if (f.slot >= 0 && f.state !== 'patrol' && !isLocal(f)) { /* still heading home */ }
    }
    ms.animate(fdt, time, { doorWant: rolling && rolling.t < 4.8 ? 1 : 0, camLocal, reduced });
    // Guns and drills only while the camera is near enough to see them; far away the guns' barrels are left out.
    const nearGuns = camD < ms.D.L * 2.5 + 800;
    ms.turrets.setNear(camD < ms.D.L * 3 + 600);
    if (nearGuns || combatOn) stepCombat(fdt, { calm: calmNow, near: nearGuns });

    // Hangar crew: a pilot walking to each fighter that's boarding, and the new fighter's pilot waving.
    let ci = 0;
    if (nearHangar) for (const f of fighters) {
      if (ci >= crew.length) break;
      if (f.state === 'board' && f.slot >= 0) {
        // From the bay's crew door to the fighter's side, in that bay's frame.
        const r = ref(f.slot), b = r.bay; if (camLocal.distanceTo(b.center) > 300 * ms.D.BS) continue;
        const p = crew[ci++], u = smooth(clamp(f.t / 3, 0, 1)), door = L2S(b, b.crewDoor.x, 0, b.crewDoor.z, new THREE.Vector3()), to = L2S(b, b.slotX + 0.5, 0, b.slotZ(r.i) - 1.0, tmp);
        p.group.position.lerpVectors(door, to, u);
        p.group.rotation.y = Math.atan2(-(to.x - door.x), -(to.z - door.z)); p.pose('walk', time); p.group.visible = u < 0.98;
      } else if (f.state === 'rollout' && f.t > 4.8) {
        const b = ms.D.mainBay, p = crew[ci++]; p.group.visible = true;
        L2S(b, b.slotX - 0.6, 0, b.padZ - 1.9 + Math.max(0, f.t - 8.2) * 0.8, p.group.position); p.group.rotation.y = b.theta + Math.PI * 0.75;
        if (f.t < 8.2) p.pose('wave', time); else p.pose('walk', time);
      }
    }
    for (; ci < crew.length; ci++) crew[ci].group.visible = false;
    // People and sparkles live in mothership space.
    people.visible = true;
    if (spk.life > 0) {
      spk.life -= dt;
      for (let i = 0; i < SPK; i++) { spk.vel[i * 3 + 1] -= dt * 1.2; for (let j = 0; j < 3; j++) spk.pos[i * 3 + j] += spk.vel[i * 3 + j] * dt * 0.8; }
      spkGeo.attributes.position.needsUpdate = true; sparkles.material.opacity = clamp(spk.life / 1.2, 0, 1);
      if (spk.life <= 0) sparkles.visible = false;
    }

    // ----- Draw: active fighters, then spare fighters parked in empty bays -----
    let n = 0, np = 0, nf = 0, ne = 0, nn = 0;
    const lp = new THREE.Vector3(), lq = new THREE.Quaternion();
    const draw = (pos, q, f, pilot, thrust) => {
      if (n + nf >= CAP) return;
      const d = pos.distanceTo(camera.position);
      // The instanced meshes are children of the fleet, so their matrices are in fleet space.
      toLocal(pos, lp); lq.copy(msQi).multiply(q); m4.compose(lp, lq, ONE);
      if (d > 230) { if (d > 400 && !hidden(camera.position, pos)) navLights.geometry.attributes.position.setXYZ(nn++, lp.x, lp.y, lp.z); inst.far.setMatrixAt(nf++, m4); }
      else {
        for (const k of ['body', 'dark', 'stripe', 'glow', 'lights', 'canopy']) inst[k].setMatrixAt(n, m4);
        inst.stripe.setColorAt(n, tmpColor.set(SQUAD[f % SQUAD.length]));
        n++;
        if (pilot && d < 70) { for (const k of ['helmet', 'visor', 'suit']) inst[k].setMatrixAt(np, m4); inst.helmet.setColorAt(np, tmpColor.set(HELMETS[Math.floor(hashN(f + 99) * HELMETS.length)])); np++; }
      }
      if (thrust > 0.05) { tmp.set(0, 0.27, 1.85).applyQuaternion(lq).add(lp); exhaust.geometry.attributes.position.setXYZ(ne++, tmp.x, tmp.y, tmp.z); }
    };
    const wpos = new THREE.Vector3(), wq = new THREE.Quaternion();
    for (const f of fighters) {
      if (isLocal(f)) { toWorld(f.lp, wpos); wq.copy(msQ).multiply(f.lq); f.pos.copy(wpos); f.q.copy(wq); }
      draw(f.pos, f.q, f.id, f.pilot, f.thrust);
    }
    const used = new Set(fighters.map(f => f.slot).filter(s => s >= 0));
    let spare = reserveIds.length;
    for (let i = ms.D.slots - 1; i >= 0 && spare > 0; i--) {
      if (used.has(i)) continue;
      spare--; toWorld(slotPos(i, wpos), wpos); wq.copy(msQ).multiply(bayQ(ref(i).bay, NOSE_OUT, tmpQ2));
      draw(wpos, wq, reserveIds[spare], false, 0);
    }
    for (const k of ['body', 'dark', 'stripe', 'glow', 'lights', 'canopy']) { inst[k].count = n; inst[k].instanceMatrix.needsUpdate = true; }
    for (const k of ['helmet', 'visor', 'suit']) { inst[k].count = np; inst[k].instanceMatrix.needsUpdate = true; }
    inst.far.count = nf; inst.far.instanceMatrix.needsUpdate = true;
    inst.stripe.instanceColor.needsUpdate = inst.helmet.instanceColor.needsUpdate = true;
    exhaust.geometry.attributes.position.needsUpdate = true; exhaust.geometry.setDrawRange(0, ne);
    navLights.material.opacity = 0.65 + 0.35 * Math.sin(time * 2.4);
    navLights.geometry.attributes.position.needsUpdate = true; navLights.geometry.setDrawRange(0, nn);
  }
  const tmpColor = new THREE.Color(), tmpQ2 = new THREE.Quaternion();

  // ----- For the rest of the world -----
  // Cameras: kept just outside the hull's real shape (not the fighters' coarse boxes), so they can follow the ship anywhere
  // it can fly, into bays and along the hull.
  const kcN = new THREE.Vector3(), kcP = new THREE.Vector3();
  function keepClear(pos, pad) {
    if (!ms || !ms.root.visible) return;
    toLocal(pos, kcP);
    for (let i = 0; i < 4; i++) { const d = ms.D.sdNear(kcP, kcN); if (d >= pad) break; kcP.addScaledVector(kcN, pad - d + 0.01); }
    toWorld(kcP, pos);
  }
  // The player's ship against the hull and parked fighters: a few spheres along the ship (world space in `centers`, radius r).
  // Returns how far to move the ship to get clear (world), the way out, and where it touched; null if nothing touches.
  // Several passes, so a ship wedged between two parts (or one the mothership has moved into) always ends up outside.
  const cN = new THREE.Vector3(), cL = new THREE.Vector3(), cPush = new THREE.Vector3(), cOut = { push: new THREE.Vector3(), normal: new THREE.Vector3(), point: new THREE.Vector3(), depth: 0 };
  function collideShip(centers, r) {
    if (!ms || !ms.root.visible) return null;
    cOut.push.set(0, 0, 0); cOut.depth = 0; let hit = false;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const c of centers) {
        toLocal(cL.copy(c).add(cOut.push), cL);
        const d = ms.D.sdNear(cL, cN);
        if (d < r) {
          cPush.copy(cN).applyQuaternion(msQ).multiplyScalar(r - d + 0.01); cOut.push.add(cPush); moved = hit = true;
          if (r - d > cOut.depth) { cOut.depth = r - d; cOut.normal.copy(cN).applyQuaternion(msQ); cOut.point.copy(c).add(cOut.push).addScaledVector(cOut.normal, -r); }
        }
        // Fighters sitting in a bay can't move out of the way, so the ship bumps them gently too (flying ones steer clear).
        for (const f of fighters) {
          if (!isLocal(f)) continue;
          cPush.copy(c).add(cOut.push).sub(f.pos); const l = cPush.length(), min = r + 2.4;
          if (l < min && l > 1e-4) { cPush.multiplyScalar((min - l) / l); cOut.push.add(cPush); moved = hit = true;
            if (min - l > cOut.depth) { cOut.depth = min - l; cOut.normal.copy(cPush).normalize(); cOut.point.copy(f.pos); } }
        }
      }
      if (!moved) break;
    }
    return hit ? cOut : null;
  }
  // Distance from a point (world) to the nearest hull surface, and whether it's lined up in a hangar's approach lane.
  const hdP = new THREE.Vector3();
  function hullSurfaceDist(pos, closeAt = 300) {
    if (!ms || !ms.root.visible) return Infinity;
    toLocal(pos, hdP);
    const rough = hdP.length() - ms.D.L * 0.75;
    if (rough > closeAt * 4) return rough;
    return ms.D.sdFar(hdP, closeAt);
  }
  const lnP = new THREE.Vector3(), lnD = new THREE.Vector3();
  function inApproachLane(pos, dir) {
    if (!ms || !ms.root.visible) return false;
    const reach = 48 * WORLD.warnings.laneLength;
    for (const b of ms.D.bays) {
      toLocal(pos, lnP).applyMatrix4(b.Minv); lnD.copy(dir).applyQuaternion(msQi).applyQuaternion(tmpQ4.copy(b.Q).invert());
      if (lnP.x < -reach || lnP.x > b.BD + 1 || lnP.y < -4 || lnP.y > b.BH + 4 || lnP.z < b.zs - 4 || lnP.z > b.ze + 4) continue;
      if (lnP.x > -6 || lnD.x > 0.35) return true;    // at the mouth or inside, or heading in
    }
    return false;
  }
  const tmpQ4 = new THREE.Quaternion();
  // A few soft sparks where the ship scrapes the hull (never a flash).
  function contactSparks(p, n, k = 1) {
    for (let i = 0; i < Math.round(3 + 6 * k); i++) { puff(sparks, p, i % 3 ? '#FFC98A' : '#FFF2D8', 0.4 + Math.random() * 0.5, 4 + 8 * k, 0.8); sparks.items[sparks.items.length - 1].vel.addScaledVector(n, 3 + 4 * k); }
    if (k > 0.4) puff(glows, p, '#FFD9A8', 0.4, 0, 0.35 * k);
  }
  // Does the straight line a-b pass near the mothership?
  function blocks(a, b, margin) { if (!ms) return false; return segDist(a, b, root.position) < ms.D.L * 0.56 + margin; }
  function info() {
    const active = fund.total ? Math.min(MAX_ACTIVE, fund.total) : 0;
    return { has: fund.has, amount: fund.amount, months: fund.months, unit: fund.unit, tier: tierKey, label: tierKey ? TIERS[tierKey].label : null,
      total: fund.total, active, reserve: Math.max(0, fund.total - active), moving: !!station.move };
  }
  const debug = {
    relocate: () => pickStation(station.pos.clone()), fighters, station, cells, hullDist, hullNormal, get ms() { return ms; },
    drill: () => { drillT = 0; return startDrill(); }, threats, tracers, missiles, stats,
    // For testing: park a patrolling fighter in each of these bays and send it straight back out.
    launchFrom: bayIdx => { for (const bi of bayIdx) { const b = ms.D.bays[bi], used = new Set(fighters.map(f => f.slot)); let k = -1;
      for (let i = 0; i < b.slots; i++) if (!used.has(b.first + i)) { k = b.first + i; break; }
      const f = fighters.find(g => g.state === 'patrol' && !g.threat); if (k < 0 || !f) continue; dock(f, k, 'ready'); f.fuel = 1; f.state = 'board'; f.t = 3.1; } },
    roll: (n = 1) => { rollQueue += n; },
  };
  // How far out anything might need to go to see the fleet (for the free camera's range).
  const reach = () => ms ? station.pos.length() + ms.D.L * 0.8 : 0;
  return { root, fx, intercept, setFund, update, keepClear, collideShip, hullSurfaceDist, inApproachLane, contactSparks, blocks, info, get reach() { return reach(); }, debug, get present() { return !!ms; }, get size() { return ms?.D; }, get yaw() { return station.yaw; }, quaternion: msQ, toWorld };
}
