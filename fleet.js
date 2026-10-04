// The emergency fund's guardian fleet. A dark, military-style mothership holds station far from everything, like a calm
// coast guard, with a wing of small fighters that patrol space, come home to refuel, and launch again.
// Tiers by months of costs saved: a patrol frigate (under 3), a cruiser (3 to 6), a flagship carrier (6 or more).
// One fighter per "fighter unit" of the fund (a setting, $100 by default); up to 24 fly, the rest wait in reserve.
// Every design here is original. Sizes are in world units (the player's ship is about 18 long). Ships face -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { armorTexture, windowRowsTexture, deckTexture, fleetDecalTexture, serialTexture, rackTexture, consoleGlowTexture, softGlowTexture, dotTexture } from './textures.js';

export const MAX_ACTIVE = 24;
// Sizes are multiples of the player's ship length (18.4). The carrier is about as long as the largest planet is wide.
export const SHIP_LEN = 18.4;
export const TIERS = {
  frigate: { label: 'Patrol frigate', mult: 4, slots: 6, segs: 3, engines: [2, 3], towers: 4, turrets: 4, officers: 3, arms: 2, dishes: 3, antennas: 60, city: 0, serial: 'GP-104', seed: 11 },
  cruiser: { label: 'Cruiser', mult: 10.7, slots: 10, segs: 5, engines: [3, 4], towers: 8, turrets: 8, officers: 4, arms: 4, dishes: 5, antennas: 220, city: 220, serial: 'GC-311', seed: 23 },
  carrier: { label: 'Flagship carrier', mult: 32, slots: 16, segs: 8, engines: [4, 6], towers: 14, turrets: 12, officers: 6, arms: 6, dishes: 8, antennas: 700, city: 1600, serial: 'GF-001', seed: 37 },
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
const WIN_GLSL = `{
  float side = 1.0 - smoothstep(0.3, 0.55, abs(vFN.y));
  vec2 wp = vec2(abs(vFN.x) > abs(vFN.z) ? vFP.z : vFP.x, vFP.y) / vec2(0.8, 1.6);   // person-sized windows, decks about two people tall
  vec2 cell = floor(wp), f = fract(wp);
  float deck = step(0.42, fh(vec2(cell.y, 17.0)));                 // whole decks are lit or dark: rows of light
  float lit = step(0.3, fh(cell)) * deck;
  float shape = step(0.2, f.x) * step(f.x, 0.72) * step(0.35, f.y) * step(f.y, 0.72);
  vec2 fw = fwidth(wp);
  float w = mix(lit * shape, deck * 0.7 * 0.19, smoothstep(0.35, 1.0, fw.x));      // windows blur into lit lines
  w = mix(w, 0.58 * 0.7 * 0.19, smoothstep(0.35, 1.0, fw.y));                      // lines blur into a soft even glow
  totalEmissiveRadiance += winColor * w * side * mix(1.0, 0.45, smoothstep(0.35, 1.0, fw.x));   // far away the glow is softer
}`;
function hullShader(m, windows) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, HULL_UNIFORMS);
    sh.vertexShader = 'varying vec3 vFP; varying vec3 vFN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fp4 = vec4(transformed, 1.0); vec3 fn3 = objectNormal;
      #ifdef USE_INSTANCING
        fp4 = instanceMatrix * fp4; fn3 = mat3(instanceMatrix) * fn3;
      #endif
      vFP = fp4.xyz; vFN = normalize(fn3);`);
    sh.fragmentShader = 'uniform vec3 rimColor; uniform vec3 winColor; varying vec3 vFP; varying vec3 vFN;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n'
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
  return {
    black: hullShader(std('#34383C'), true), steel: hullShader(std('#5C636A'), true), green: hullShader(std('#3E6049'), false),
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
  const HD = 10, HH = 6, FD = HD + 3, slots = t.slots;
  const mats = shipMaterials(tx, key);
  const B = batch(), Bd = batch(), Bb = batch(), put = B.put, putD = Bd.put, putB = Bb.put;
  const root = new THREE.Group(); root.name = 'mothership-' + key;
  const core = new THREE.Group(), detail = new THREE.Group(), bayGroup = new THREE.Group();
  root.add(core, detail, bayGroup);
  // Solid volumes in ship space, used to keep fighters, the player's ship and cameras out of the hull.
  const boxes = [], solid = (x0, y0, z0, x1, y1, z1) => boxes.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
  const lift = Math.max(0.05, L * 0.00025);     // markings sit this far off the armour

  // ----- Layout. The main deck is the widest; decks above step back; a keel runs below; wings of armour on both sides. -----
  const zn = -0.3 * L, zt = 0.4 * L, eLen = 0.05 * L;
  const deckY = -0.36 * H, ceilY = deckY + HH, xo = -W / 2 - FD, xi = xo + HD;
  const HL = 1 + slots * SP + PAD + ASM + 1, hz = -0.05 * L, zs = hz - HL / 2, ze = hz + HL / 2;
  const D = { key, L, W, H, HD, HH, HL, hz, zs, ze, xo, xi, deckY, ceilY, k, slots, boxes,
    slotX: xo + HD * 0.5 + 0.3, slotY: deckY, slotZ: i => zs + 1 + (i + 0.5) * SP, padZ: zs + 1 + slots * SP + PAD / 2,
    zp: ze - 1 - ASM, zA: ze - 1 - ASM / 2, radius: L * 0.56 };
  D.bayCenter = new THREE.Vector3(xo + HD / 2, deckY + HH / 2, hz);

  // Main deck: a long pointed prow, then armoured segments with dark ribs and green bands.
  put('black', octLoft([{ z: -L / 2, w: W * 0.04, h: H * 0.12, y: -H * 0.15 }, { z: -0.42 * L, w: W * 0.4, h: H * 0.55, y: -H * 0.1 }, { z: zn, w: W, h: H }]));
  const gap = 0.012 * L, segLen = (zt - zn - (t.segs - 1) * gap) / t.segs, segs = [];
  for (let i = 0; i < t.segs; i++) {
    const z0 = zn + i * (segLen + gap), z1 = z0 + segLen; segs.push([z0, z1]);
    put(i % 2 ? 'steel' : 'black', octLoft([{ z: z0, w: W * 0.95, h: H * 0.93 }, { z: z0 + 0.006 * L, w: W, h: H }, { z: z1 - 0.006 * L, w: W, h: H }, { z: z1, w: W * 0.95, h: H * 0.93 }]));
    put('green', octLoft([{ z: z0 + 0.008 * L, w: W * 1.012, h: H * 1.012 }, { z: z0 + 0.016 * L, w: W * 1.012, h: H * 1.012 }], { caps: false }));
    if (i < t.segs - 1) put('dark', octLoft([{ z: z1 - 0.1, w: W * 0.9, h: H * 0.88 }, { z: z1 + gap + 0.1, w: W * 0.9, h: H * 0.88 }], { caps: false }));
  }
  solid(-W / 2, -H / 2, -L / 2, W / 2, H / 2, zt);
  // Keel below, and two stepped decks above, set back from the prow.
  put('black', octLoft([{ z: -0.36 * L, w: W * 0.2, h: H * 0.2, y: -H * 0.55 }, { z: -0.28 * L, w: W * 0.5, h: H * 0.4, y: -H * 0.62 }, { z: 0.38 * L, w: W * 0.5, h: H * 0.4, y: -H * 0.62 }, { z: 0.44 * L, w: W * 0.36, h: H * 0.3, y: -H * 0.58 }]));
  solid(-W * 0.25, -H * 0.82, -0.36 * L, W * 0.25, -H * 0.42, 0.44 * L);
  put('steel', octLoft([{ z: -0.24 * L, w: W * 0.3, h: H * 0.2, y: H * 0.52 }, { z: -0.14 * L, w: W * 0.74, h: H * 0.5, y: H * 0.72 }, { z: 0.4 * L, w: W * 0.74, h: H * 0.5, y: H * 0.72 }, { z: 0.44 * L, w: W * 0.6, h: H * 0.4, y: H * 0.68 }]));
  solid(-W * 0.37, H * 0.42, -0.24 * L, W * 0.37, H * 0.97, 0.44 * L);
  const topX = W * 0.04;
  put('black', octLoft([{ z: -0.04 * L, w: W * 0.24, h: H * 0.2, y: H * 1.06, x: topX }, { z: 0.02 * L, w: W * 0.46, h: H * 0.34, y: H * 1.12, x: topX }, { z: 0.34 * L, w: W * 0.46, h: H * 0.34, y: H * 1.12, x: topX }, { z: 0.38 * L, w: W * 0.36, h: H * 0.26, y: H * 1.1, x: topX }]));
  solid(topX - W * 0.23, H * 0.95, -0.04 * L, topX + W * 0.23, H * 1.29, 0.38 * L);
  // Green trim bands along the step edges.
  for (const s of [-1, 1]) {
    put('green', at(boxG(W * 0.02, H * 0.03, 0.5 * L), s * W * 0.37, H * 0.95, 0.15 * L));
    put('green', at(boxG(W * 0.015, H * 0.025, 0.3 * L), topX + s * W * 0.23, H * 1.27, 0.18 * L));
  }
  // Wings of armour, slightly different on each side, as if added at different times.
  const wing = (s, z0, z1, y, span) => {
    const x = s * (W / 2 + span / 2 - W * 0.02);
    put(s < 0 ? 'steel' : 'black', octLoft([{ z: z0, w: span * 0.3, h: H * 0.06, x: x + s * span * 0.25, y }, { z: z0 + 0.08 * L, w: span, h: H * 0.13, x, y },
      { z: z1 - 0.06 * L, w: span, h: H * 0.13, x, y }, { z: z1, w: span * 0.5, h: H * 0.08, x: x - s * span * 0.2, y }]));
    put('green', at(boxG(span * 0.9, H * 0.02, 0.01 * L), x, y + H * 0.066, z0 + 0.1 * L));
    solid(x - span / 2, y - H * 0.07, z0, x + span / 2, y + H * 0.07, z1);
    return x + s * span / 2;
  };
  const tipL = wing(-1, -0.16 * L, 0.24 * L, H * 0.24, W * 0.34), tipR = wing(1, -0.22 * L, 0.34 * L, H * 0.18, W * 0.42);

  // ----- The engine array: a block across the stern with many big engines in a grid. -----
  put('black', octLoft([{ z: zt - 0.01 * L, w: W * 0.98, h: H * 1.8, y: H * 0.15 }, { z: L / 2, w: W * 0.9, h: H * 1.65, y: H * 0.15 }]));
  solid(-W * 0.49, -H * 0.75, zt - 0.01 * L, W * 0.49, H * 1.05, L / 2 + eLen);
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

  // ----- Docking arms on the right side and underneath: long trusses with clamp rings. -----
  for (let i = 0; i < t.arms; i++) {
    const down = i % 3 === 2, z = -0.18 * L + (i / Math.max(1, t.arms - 1)) * 0.5 * L, len = W * (0.18 + rnd() * 0.08), th = L * 0.006;
    if (down) {
      put('steel', at(boxG(th, len, th), 0, -H * 0.82 - len / 2, z));
      for (let j = 1; j < 5; j++) put('dark', at(boxG(th * 3, th * 0.5, th * 0.5), 0, -H * 0.82 - len * j / 5, z));
      put('plain', at(new THREE.TorusGeometry(th * 4, th * 0.9, 6, 16), 0, -H * 0.82 - len, z, Math.PI / 2));
      solid(-th * 5, -H * 0.82 - len - th * 5, z - th * 5, th * 5, -H * 0.82, z + th * 5);
    } else {
      const y = -H * 0.18, x0 = W / 2;
      put('steel', at(boxG(len, th, th), x0 + len / 2, y, z)); put('steel', at(boxG(len, th, th), x0 + len / 2, y + th * 3, z));
      for (let j = 0; j <= 5; j++) put('dark', at(boxG(th * 0.5, th * 3, th * 0.5), x0 + len * j / 5, y + th * 1.5, z));
      put('plain', at(new THREE.TorusGeometry(th * 4, th * 0.9, 6, 16), x0 + len, y + th * 1.5, z, 0, Math.PI / 2));
      solid(x0, y - th * 5, z - th * 5, x0 + len + th * 5, y + th * 6, z + th * 5);
    }
  }
  // ----- Cargo gantries along the upper deck, with containers under them. -----
  for (let i = 0; i < Math.round(3 + L / 300); i++) {
    const z = -0.1 * L + i * 0.045 * L, span = W * 0.5, ph = H * 0.12, th = L * 0.003;
    if (Math.abs(z - tzC) < 0.09 * L) continue;
    for (const s of [-1, 1]) put('steel', at(boxG(th, ph, th), s * span / 2, H * 0.97 + ph / 2, z));
    put('steel', at(boxG(span, th * 1.5, th * 1.5), 0, H * 0.97 + ph, z));
    for (let c = 0; c < 3; c++) if (rnd() < 0.7) put(['green', 'steel', 'dark'][Math.floor(rnd() * 3)], at(boxG(span * 0.18, ph * 0.3, 0.02 * L), (c - 1) * span * 0.28, H * 0.97 + ph * 0.15, z + 0.012 * L));
  }

  // ----- The hangar: a bay recessed into the left flank, human- and fighter-sized, with its own block around it. -----
  const fx1 = -W / 2 + 2, fy0 = deckY - 4, fy1 = ceilY + 4, fz0 = zs - 6, fz1 = ze + 6;
  const block = (x0, y0, z0, x1, y1, z1, m = 'dark') => { put(m, at(boxG(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); solid(x0, y0, z0, x1, y1, z1); };
  block(xo, fy0, fz0, fx1, deckY, fz1, 'plain'); block(xo, ceilY, fz0, fx1, fy1, fz1, 'plain');
  block(xo, deckY, fz0, fx1, ceilY, zs); block(xo, deckY, ze, fx1, ceilY, fz1); block(xi, deckY, zs, fx1, ceilY, ze);
  put('bayGlow', at(new THREE.PlaneGeometry(HL, HH * 0.9), xi - 0.5, deckY + HH / 2, hz, 0, -Math.PI / 2));    // lit opening, seen from far
  const hmid = xo + HD / 2;
  putB('green', at(boxG(0.4, 0.35, HL), xo + 0.2, deckY - 0.05, hz));
  putB('green', at(boxG(0.4, 0.35, HL), xo + 0.2, ceilY + 0.05, hz));
  putB('interior', at(boxG(0.4, HH, HL), xi - 0.2, deckY + HH / 2, hz));
  const chevrons = (p, len, h, x, y, zc, ry) => { const n = Math.max(1, Math.round(len / (h * 8))), w = len / n; for (let i = 0; i < n; i++) p('decal', at(decalG(w, h, DECAL.chevron), x, y, zc - len / 2 + w * (i + 0.5), 0, ry)); };
  chevrons(putB, HL - 1.2, 0.5, xo - 0.02, deckY - 0.45, hz, -Math.PI / 2);
  chevrons(putB, HL - 1.2, 0.5, xo - 0.02, ceilY + 0.45, hz, -Math.PI / 2);
  for (let i = 0; i < slots; i++) {
    const z = D.slotZ(i), dg = new THREE.PlaneGeometry(HD - 0.4, SP), uv = dg.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getY(j), uv.getX(j));
    putB('deck', at(dg, hmid + 0.2, deckY + 0.01, z, -Math.PI / 2));
    putB('decal', at(decalG(1.1, 0.95, DECAL.bay(i)), xo + 1.1, deckY + 0.03, z, -Math.PI / 2));
    putB('steel', at(boxG(HD * 0.92, 0.22, 0.22), hmid, ceilY - 0.3, z));
    putB('dark', at(boxG(0.5, 0.25, 0.4), D.slotX + 0.35, ceilY - 0.5, z));
    putB('lamp', at(boxG(HD * 0.7, 0.06, 0.22), hmid, ceilY - 0.05, z + SP / 2));
    if (i % 2 === 0) for (let r = 0; r < 3; r++) { putB('fuel', at(cylG(0.2, 0.2, 2.6, 10), xi - 0.55, deckY + 0.3 + r * 0.46, z, Math.PI / 2)); putB('dark', at(cylG(0.21, 0.21, 0.12, 10), xi - 0.55, deckY + 0.3 + r * 0.46, z + 1.3, Math.PI / 2)); }
    else for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) putB(c % 3 ? 'steel' : 'green', at(boxG(0.55, 0.42, 0.6), xi - 0.5, deckY + 0.22 + r * 0.46, z - 1.1 + c * 0.72));
    putB('rack', at(new THREE.PlaneGeometry(SP - 0.4, HH * 0.4), xi - 0.41, deckY + HH * 0.78, z, 0, -Math.PI / 2));
    putB('steel', at(boxG(0.1, HH * 0.55, 0.1), xi - 1.0, deckY + HH * 0.275, z + SP / 2));
  }
  const catY = deckY + HH * 0.55, catLen = HL - 2;
  putB('steel', at(boxG(1.1, 0.1, catLen), xi - 0.75, catY, hz));
  putB('steel', at(boxG(0.05, 0.05, catLen), xi - 1.27, catY + 0.5, hz));
  for (let z = zs + 1.5; z < ze - 1; z += 2) putB('steel', at(boxG(0.05, 0.5, 0.05), xi - 1.27, catY + 0.25, z));
  putB('steel', at(boxG(0.9, 0.08, HH * 0.75), xi - 0.75, deckY + HH * 0.28, zs + 1.4 + HH * 0.3, Math.atan2(HH * 0.55, HH * 0.6)));
  putB('dark', at(boxG(0.1, 1.0, 0.6), xi - 0.42, deckY + 0.5, D.padZ + 1.6));
  putB('lampG', at(boxG(0.06, 0.06, 0.7), xi - 0.45, deckY + 1.05, D.padZ + 1.6));
  const DW = 3.8, DH = Math.min(2.6, HH - 0.6), dx = D.slotX;
  putB('black', at(boxG(dx - DW / 2 - xo, HH, 0.4), (xo + dx - DW / 2) / 2, deckY + HH / 2, D.zp));
  putB('black', at(boxG(xi - (dx + DW / 2), HH, 0.4), (xi + dx + DW / 2) / 2, deckY + HH / 2, D.zp));
  putB('black', at(boxG(DW, HH - DH, 0.4), dx, deckY + DH + (HH - DH) / 2, D.zp));
  chevrons(putB, DW, 0.3, dx, deckY + DH + 0.2, D.zp - 0.21, Math.PI);
  putB('black', at(boxG(0.5, HH, ASM), xo + 0.25, deckY + HH / 2, D.zA));
  putB('decal', at(decalG(ASM * 0.8, ASM * 0.1, DECAL.caution), xo - 0.02, deckY + HH * 0.5, D.zA, 0, -Math.PI / 2));
  putB('deck', at(new THREE.PlaneGeometry(HD - 0.6, ASM), hmid + 0.2, deckY + 0.01, D.zA, -Math.PI / 2));
  for (const s of [-1, 1]) putB('steel', at(boxG(0.25, HH - 0.3, 0.25), dx + s * 2.2, deckY + (HH - 0.3) / 2, D.zA));
  putB('steel', at(boxG(4.6, 0.25, 0.25), dx, deckY + HH - 0.4, D.zA));
  putB('lamp', at(boxG(3, 0.05, 0.3), dx, ceilY - 0.06, D.zA));
  putB('decal', at(decalG(HH * 0.6, HH * 0.6, DECAL.badge), hmid, deckY + HH * 0.5, fz0 - 0.03, 0, Math.PI));
  // Guide beacons on booms at both ends of the mouth.
  const beacons = [];
  for (const z of [zs - 1, ze + 1]) for (const y of [deckY - 0.2, ceilY + 0.3]) {
    putB('steel', at(boxG(6, 0.3, 0.3), xo - 3, y, z)); putB('dark', at(boxG(0.5, 0.5, 0.5), xo - 6, y, z));
    beacons.push({ p: [xo - 6, y, z], c: z < hz ? '#7FF0B0' : '#7FCBFF' });
  }
  // The bay's control tower: a small lookout on the flank at the front end, with lit windows and a radar bar.
  const ct = { x: xo + 3, y: fy1, z: fz0 + 3, s: 4 };
  put('black', at(boxG(ct.s, ct.s * 1.1, ct.s), ct.x, ct.y + ct.s * 0.55, ct.z));
  put('steel', at(boxG(ct.s * 1.3, ct.s * 0.5, ct.s * 1.3), ct.x, ct.y + ct.s * 1.35, ct.z));
  for (const [ox, oz, ry] of [[-ct.s * 0.66, 0, -Math.PI / 2], [0, -ct.s * 0.66, Math.PI]]) put('win', at(new THREE.PlaneGeometry(ct.s * 1.1, ct.s * 0.3), ct.x + ox, ct.y + ct.s * 1.38, ct.z + oz, 0, ry));
  solid(ct.x - ct.s * 0.65, ct.y, ct.z - ct.s * 0.65, ct.x + ct.s * 0.65, ct.y + ct.s * 1.8, ct.z + ct.s * 0.65);
  const radar = new THREE.Mesh(at(boxG(ct.s * 1.1, 0.4, 0.8), 0, 0, 0), mats.steel); radar.position.set(ct.x, ct.y + ct.s * 1.75, ct.z);

  // ----- Turret-like emitters along the decks (nothing fires yet; the guns come in the next stage). -----
  const s = k * 0.9;
  const turretSpots = [[0, H * 0.5, -0.36 * L], [0, H * 0.97, -0.18 * L], [W * 0.2, H * 0.97, 0.36 * L], [-W * 0.25, H * 0.97, 0.05 * L], [0, -H * 0.82, -0.2 * L], [0, -H * 0.82, 0.25 * L],
    [topX, H * 1.29, 0.06 * L], [topX - W * 0.15, H * 1.29, 0.3 * L], [W * 0.3, H * 0.97, -0.08 * L], [-W * 0.3, H * 0.97, 0.3 * L], [W * 0.12, -H * 0.82, 0.05 * L], [-W * 0.12, -H * 0.82, 0.35 * L]];
  for (const [i, [x, y, z]] of turretSpots.slice(0, t.turrets).entries()) {
    const down = y < 0 ? -1 : 1;
    const g = [cylG(1.0 * s, 1.15 * s, 0.4 * s, 10), new THREE.SphereGeometry(0.85 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2 * s, 0)];
    for (const o of [-0.28, 0.28]) g.push(cylG(0.08 * s, 0.1 * s, 2.4 * s, 6).rotateX(Math.PI / 2).translate(o * s, 0.55 * s, -1.4 * s));
    for (const geo of g) { if (down < 0) geo.rotateX(Math.PI); put(i % 2 ? 'steel' : 'plain', geo.translate(x, y, z)); }
  }

  // ----- Antenna forests and dish arrays. -----
  const ant = [];
  const forest = (cx, cy, cz, rx, rz, n) => { for (let i = 0; i < n; i++) ant.push([cx + (rnd() - 0.5) * rx, cy, cz + (rnd() - 0.5) * rz, L * (0.0005 + rnd() * 0.0008), H * (0.06 + Math.pow(rnd(), 2) * 0.35)]); };
  const perForest = Math.ceil(t.antennas / 5);
  forest(topX, H * 1.29, 0.31 * L, W * 0.3, 0.05 * L, perForest);
  forest(-W * 0.22, H * 0.97, -0.17 * L, W * 0.2, 0.05 * L, perForest);
  forest(W * 0.25, H * 0.97, 0.1 * L, W * 0.16, 0.08 * L, perForest);
  forest(tipR - W * 0.15, H * 0.25, 0.2 * L, W * 0.2, 0.08 * L, perForest);
  forest(0, H * 0.5, -0.33 * L, W * 0.3, 0.04 * L, perForest);
  const antennas = new THREE.InstancedMesh(cylG(0.5, 1, 1, 5).translate(0, 0.5, 0), mats.dark, ant.length);
  const m4b = new THREE.Matrix4();
  ant.forEach(([x, y, z, r, h], i) => antennas.setMatrixAt(i, m4b.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, h, r))));
  core.add(antennas);
  for (let i = 0; i < t.dishes; i++) {
    const x = (rnd() - 0.5) * W * 0.6, z = -0.2 * L + rnd() * 0.55 * L, onTop = Math.abs(x - topX) < W * 0.2 && z > 0.02 * L && z < 0.34 * L;
    const y0 = onTop ? H * 1.29 : H * 0.97, r = H * (0.06 + rnd() * 0.08), post = r * 1.2;
    if (Math.abs(z - tzC) < 0.09 * L && Math.abs(x - txC) < W * 0.16) continue;
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
      if (rnd() < 0.12) continue;
      const district = 0.5 + 0.5 * Math.sin(z / (0.05 * L) + x / (0.05 * W)), h = H * (0.025 + Math.pow(rnd(), 2.2) * 0.13 * (0.4 + district));
      const fw = cs * (0.6 + rnd() * 0.3), fd = cs * (0.6 + rnd() * 0.3);
      (rnd() < 0.55 ? city.black : city.steel).push([x, y0, z, fw, h, fd]);
      if (rnd() < 0.12) roofLights.push({ p: [x, y0 + h + 0.5, z], c: rnd() < 0.5 ? '#FFD39A' : '#FF8A7A' });
      placed++;
    }
    for (const [cx, z0, z1, hw, y0] of areas) solid(cx - hw, y0, z0, cx + hw, y0 + H * 0.22, z1);
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
  putD('decal', at(decalG(Math.min(H * 1.4, segLen * 0.7), Math.min(H * 1.4, segLen * 0.7) * 0.22, DECAL.stripe), sideX, -H * 0.02, segs[0][0] + segLen * 0.4, 0, Math.PI / 2));
  putD('decal', at(decalG(H * 0.48, H * 0.48, DECAL.badge), sideX, 0, segC(1), 0, Math.PI / 2));
  putD('serial', at(decalG(H * 0.9, H * 0.22, [0, 0, 1, 1]), sideX, H * 0.08, segC(last), 0, Math.PI / 2));
  putD('decal', at(decalG(H * 0.48, H * 0.48, DECAL.badge), -sideX, 0, segC(last), 0, -Math.PI / 2));
  putD('decal', at(decalG(H * 1.6, H * 0.12, DECAL.letters), -sideX, 0, segC(last) - H * 1.3, 0, -Math.PI / 2));
  const nzA = -0.42 * L, nAng = Math.atan2(W * 0.3, zn - nzA);
  for (const s2 of [-1, 1]) putD('decal', at(decalG((zn - nzA) / Math.cos(nAng) * 0.8, H * 0.25, DECAL.stripe), s2 * (W * 0.35 + lift), -H * 0.05, (nzA + zn) / 2, 0, s2 * (Math.PI / 2 + nAng)));
  putD('decal', at(decalG(W * 0.5, W * 0.06, DECAL.caution), 0, H * 1.0, L / 2 + lift));
  putD('serial', at(decalG(W * 0.3, W * 0.075, [0, 0, 1, 1]), W * 0.24, H / 2 + lift, segC(0), -Math.PI / 2, Math.PI / 2));

  for (const m of B.meshes(mats)) core.add(m);
  for (const m of Bd.meshes(mats)) detail.add(m);
  for (const m of Bb.meshes(mats)) bayGroup.add(m);
  bayGroup.add(radar);

  // ----- Moving parts: the shutter, the refuelling arms and hoses, the beacon. -----
  const door = new THREE.Mesh(at(boxG(DW, DH, 0.15), 0, DH / 2, 0), mats.steel); door.position.set(dx, deckY, D.zp - 0.05); bayGroup.add(door);
  const armGeo = mergeGeometries([boxG(0.14, 1, 0.14).translate(0, -0.5, 0), boxG(0.4, 0.12, 0.3).translate(0, -1, 0)].map(g => g.toNonIndexed()));
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ color: '#B58A2E', roughness: 0.6, map: tx.armor }), slots);
  const hoses = new THREE.InstancedMesh(cylG(0.06, 0.06, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#2A2C2E', roughness: 0.7, emissive: '#15191B' }), slots);
  arms.frustumCulled = hoses.frustumCulled = false; bayGroup.add(arms, hoses);
  const service = Array.from({ length: slots }, () => ({ arm: 0, hose: 0, want: 0 }));
  // The beacon on the command tower: a lamp with two slowly turning beams (blue and green), and a big soft pulse.
  const bk = k * 0.6, beacon = new THREE.Group(); beacon.position.set(txC + w3 * 0.1, towerTop + 0.3 * bk, tzC - d3 * 0.1);
  const housing = new THREE.Mesh(cylG(0.35 * bk, 0.45 * bk, 0.5 * bk, 10), mats.plain); housing.position.y = -0.1 * bk;
  const lampMesh = new THREE.Mesh(cylG(0.13 * bk, 0.13 * bk, 0.25 * bk, 10), new THREE.MeshBasicMaterial({ color: '#9FE6FF' })); lampMesh.position.y = 0.3 * bk;
  const beams = new THREE.Group(); beams.position.y = 0.3 * bk;
  for (const [i, c] of ['#7FCBFF', '#7FF0B0'].entries()) beams.add(new THREE.Mesh(new THREE.ConeGeometry(0.7 * bk, 7 * bk, 16, 1, true).translate(0, -3.5 * bk, 0).rotateZ(Math.PI / 2 + i * Math.PI),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  beacon.add(housing, lampMesh, beams); core.add(beacon);
  const pulse = dots([{ p: [beacon.position.x, beacon.position.y + 0.3 * bk, beacon.position.z], c: '#9FE6FF' }], tx.glow, L * 0.035, 0.9);

  // ----- Lights: running lights along every edge and tower, engine glow, and the bay's lamps. -----
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
  // From very far, a few key lights keep a fixed size on screen so the outline still reads.
  const keyLights = [...[[0, -H * 0.15, -L / 2], [tipL, H * 0.24, 0.04 * L], [tipR, H * 0.18, 0.06 * L], [0, H * 0.15, L / 2 + eLen]].map(p => ({ p, c: '#BFEFFF' })), ...tops.slice(0, 8).map(p => ({ p, c: '#FFB0A0' }))];
  const farLights = new THREE.Points(dots(keyLights, tx.dot, 1).geometry, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, map: tx.dot, vertexColors: true, transparent: true, depthWrite: false }));
  farLights.frustumCulled = false;
  const engineGlow = dots(engines, tx.glow, re * 4.5, 0.75);
  core.add(runLights, roof, farLights, engineGlow, pulse);
  const land = [];
  for (let i = 0; i < slots; i++) for (let j = 0; j < 4; j++) land.push({ p: [xo + 0.3 + j * 0.9, deckY + 0.08, D.slotZ(i)], c: '#FFE6A8' });
  const landLights = dots(land, tx.glow, 0.7, 1);
  const lip = []; for (let z = zs + 1; z < ze - 0.5; z += 1.6) lip.push({ p: [xo + 0.05, deckY + 0.12, z], c: '#7FCBFF' }, { p: [xo + 0.05, ceilY - 0.1, z], c: '#7FCBFF' });
  const lipLights = dots(lip, tx.glow, 0.55, 0.9);
  const beaconLights = dots(beacons, tx.glow, 2.4, 1);
  bayGroup.add(landLights, lipLights);
  core.add(beaconLights);   // the guide beacons are seen from far: they mark where the bay is

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

  const allMats = [...Object.values(mats), arms.material, hoses.material, lampMesh.material, ...beams.children.map(c => c.material),
    ...[runLights, roof, farLights, landLights, lipLights, beaconLights, engineGlow, pulse].map(p => p.material)];
  for (const m of allMats) m.userData.baseOpacity = m.opacity;
  D.bridge = new THREE.Vector3(bx, by + bh / 2, bz);
  D.crewDoor = new THREE.Vector3(xi - 0.6, deckY, D.padZ + 1.6);

  // Per-frame animation of this ship's moving parts, and the level of detail.
  let doorOpen = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  function animate(dt, time, { doorWant = 0, camLocal, reduced = false }) {
    // Level of detail: the fighter-sized bay and the bridge only when close, markings and small parts within about a ship length.
    const dShip = camLocal.length(), dBay = camLocal.distanceTo(D.bayCenter), dBridge = camLocal.distanceTo(D.bridge);
    bayGroup.visible = dBay < 400; mats.bayGlow.visible = !bayGroup.visible;
    detail.visible = dShip < L * 1.3 + 300;
    near.visible = dBridge < 90;
    if (!reduced) { beams.rotation.y += dt * 0.5; radar.rotation.y += dt * 0.9; }
    pulse.material.opacity = reduced ? 0.6 : 0.35 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(time * 1.6), 3);
    runLights.material.opacity = reduced ? 0.85 : 0.7 + 0.2 * Math.sin(time * 1.3);
    beaconLights.material.opacity = 0.5 + 0.5 * Math.max(0, Math.sin(time * 2.2));
    engineGlow.material.opacity = 0.65 + 0.1 * Math.sin(time * 3.1);
    // The refuelling arms and hoses keep time even when nobody is watching (refuelling waits for them); they're only drawn up close.
    for (const s of service) { s.arm += clamp(s.want - s.arm, -dt * 0.8, dt * 0.8); s.hose += clamp((s.want && s.arm > 0.9 ? 1 : 0) - s.hose, -dt * 1.2, dt * 0.7); }
    doorOpen += clamp(doorWant - doorOpen, -dt * 0.9, dt * 0.9);
    if (!bayGroup.visible) return;
    door.position.y = deckY + doorOpen * (DH - 0.2); door.scale.y = 1 - doorOpen * 0.85;
    const col = landLights.geometry.attributes.color;
    for (let i = 0; i < slots; i++) for (let j = 0; j < 4; j++) {
      const on = service[i].landing ? 0.25 + 0.75 * (Math.floor(time * 6 - j) % 4 === 0 ? 1 : 0.15) : 0.35;
      col.setXYZ(i * 4 + j, on, on * 0.9, on * 0.66);
    }
    col.needsUpdate = true;
    for (let i = 0; i < slots; i++) {
      const s = service[i], z = D.slotZ(i);
      const drop = 0.25 + smooth(s.arm) * (ceilY - 0.6 - (deckY + 0.68) - 0.25);
      m4.compose(v1.set(D.slotX + 0.35, ceilY - 0.6, z), q.identity(), sc.set(1, drop, 1)); arms.setMatrixAt(i, m4);
      v1.set(xi - 0.3, deckY + 0.5, z - 1.2); v2.set(D.slotX + 0.9, deckY + 0.42, z - 0.4);
      const dir = v2.sub(v1), len = dir.length(); q.setFromUnitVectors(up, dir.normalize());
      m4.compose(v1, q, sc.set(1, Math.max(0.001, smooth(s.hose) * len), 1)); hoses.setMatrixAt(i, m4);
    }
    arms.instanceMatrix.needsUpdate = hoses.instanceMatrix.needsUpdate = true;
    if (near.visible && !reduced) for (const p of officers) {
      if (p.seated) p.pose('sit', time + p.phase);
      else { p.pose('stand', time + p.phase); p.group.rotation.y = 0.3 + Math.sin(time * 0.25 + p.phase) * 0.6; }
    }
  }
  function setFade(a) { for (const m of allMats) { m.transparent = a < 1 || m.userData.baseOpacity < 1 || m.blending === THREE.AdditiveBlending || m === farLights.material; m.opacity = m.userData.baseOpacity * a; m.depthWrite = a >= 1 && m.userData.baseOpacity >= 1 && m.blending !== THREE.AdditiveBlending && m !== farLights.material; } }
  return { key, root, D, service, animate, setFade, mats: allMats };
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
  const exhaust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 1.0, map: tx.glow, color: '#7FC8F0', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
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
    from: new THREE.Vector3(), c1: new THREE.Vector3(), c2: new THREE.Vector3(), steer: new THREE.Vector3(), tick: Math.floor(hashN(id) * 4), walker: null, thrust: 0 });

  // Coarse grid over the patrol region; each cell remembers when someone last went there.
  const GX = 6, GY = 3, GZ = 6, cells = new Float32Array(GX * GY * GZ).fill(-1e9);
  // The patrol region spans the planets' space and the space around the mothership, which waits far outside it.
  const rMin = new THREE.Vector3(), rMax = new THREE.Vector3();
  function region() {
    const R0 = opts.volume() * 1.25, Rs = ms ? ms.D.L * 0.75 : 0, c = station.pos;
    rMin.set(Math.min(-R0, c.x - Rs), Math.min(-R0 * 0.5, c.y - Rs * 0.5), Math.min(-R0, c.z - Rs));
    rMax.set(Math.max(R0, c.x + Rs), Math.max(R0 * 0.5, c.y + Rs * 0.5), Math.max(R0, c.z + Rs));
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
  const slotPos = (i, out) => out.set(ms.D.slotX, ms.D.slotY, ms.D.slotZ(i));
  const padPos = out => out.set(ms.D.slotX, ms.D.slotY, ms.D.padZ);
  const NOSE_OUT = Math.PI / 2, NOSE_IN = -Math.PI / 2;     // fighter yaw in mothership space: nose to -X (out) or +X (in)
  function freeSlot() {
    if (!ms) return -1;
    const used = new Set(fighters.map(f => f.slot));
    for (let i = 0; i < ms.D.slots; i++) if (!used.has(i)) return i;
    return -1;
  }
  const docked = () => fighters.filter(f => ['docked', 'turn', 'refuel', 'ready', 'board'].includes(f.state)).length;
  const isLocal = f => ['docked', 'turn', 'refuel', 'ready', 'board', 'launch', 'approach', 'rollout'].includes(f.state);

  function dock(f, slot, state = 'refuel') {
    f.slot = slot; f.state = state; slotPos(slot, f.lp); yawQ(NOSE_OUT, f.lq); f.t = 0; f.dur = 7 + Math.random() * 5; f.pilot = false;
    if (state === 'refuel') f.fuel = Math.min(f.fuel, 0.3);
  }
  function startPatrol(f) { f.state = 'patrol'; f.target = pickPatrol(f); f.lead = null; }
  function launch(f) { f.state = 'launch'; f.t = 0; f.from.copy(f.lp); f.pilot = true; if (f.slot >= 0) ms.service[f.slot].want = 0; }
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
      fighters.forEach((f, i) => { if (i < nDock) { dock(f, i, i % 2 ? 'ready' : 'refuel'); f.fuel = i % 2 ? 1 : 0.4; f.t = Math.random() * 4; } else place(f); });
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
      spdK = (1 + ms.D.L / 800) * Math.sqrt(Math.max(1, opts.volume() / 300));   // a bigger world needs faster patrols
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
        else { f.slot = -1; f.vel.set(0, 0, 0); f.pos.copy(toWorld(tmp.set(ms.D.xo - 30, 0, ms.D.slotZ(0)), tmp2)); startPatrol(f); }
      }
      rolling = null;
    }
    if (first && old) { old.root.visible = false; old.root.position.set(0, 0, 0); fading = null; }
  }

  // ----- Where the mothership waits: far from the player's ship and every planet -----
  // The player's ship never goes further out than 1.5x the planets' space, so a station whose whole hull stays outside
  // that can never overlap a planet or trap the player.
  const hullR = () => TIERS[tierKey || 'frigate'].L * 0.56;
  const shellR = () => opts.volume() * 1.5 + 150 + hullR();
  function pickStation(from, relax = 1) {
    const vol = opts.volume(), planets = opts.planets(), R = hullR(), r0 = shellR(), keepOut = vol * 1.5 + R + 40;
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 160; tries++) {
      const a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 0.6, d = r0 * (1 + Math.random() * 0.15);
      const p = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize().multiplyScalar(d);
      if (p.distanceTo(opts.shipPos) < R + 200) continue;
      if (planets.some(pl => p.distanceTo(pl.group.position) < opts.clearance(pl) + R + 60)) continue;
      let score = Math.random() * 20;
      if (from) {
        const len = p.distanceTo(from); if (len < r0 * 0.3) continue;
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

  let reduced = false, spdK = 1;
  function moveStation(dt) {
    station.drift += dt;
    const mv = station.move;
    if (mv) {
      // Very slow speed-up and slow-down, and a gentle turn toward where it's going. It waits if the player is in the way.
      const VMAX = Math.max(6, (ms?.D.L || 0) / 250), A = VMAX / 60, left = mv.len - mv.s;
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
    const sp = f.vel.length(); if (sp < 6) f.vel.setLength(6); if (sp > f.speed * spdK * 1.4) f.vel.setLength(f.speed * spdK * 1.4);
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
          if ((f.fuel < 0.18 || f.retire) && !f.lead) { f.state = 'return'; f.slot = freeSlot(); if (f.slot < 0) f.state = 'hold'; for (const g of fighters) if (g.lead === f) g.lead = null; }
        }
        let target, speed = f.speed * spdK;
        if (f.state === 'patrol') {
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
          target = toWorld(tmp2.set(D.xo - 70 - (f.id % 3) * 14, D.deckY + 3 - (f.id % 6) * 8, D.hz + ((f.id % 5) - 2) * 16), new THREE.Vector3()); speed = 9;
          if ((f.t += dt) > 1) { f.t = 0; const s = freeSlot(); if (s >= 0) { f.slot = s; f.state = 'return'; } }
        } else if (!(f.slot >= 0 && f.slot < D.slots)) { f.state = 'hold'; f.slot = -1; f.t = 0; return; }
        else {
          // Coming home: aim for a point straight out from the bay's mouth.
          target = toWorld(tmp2.set(D.xo - 42, D.slotY + 3, D.slotZ(f.slot)), new THREE.Vector3());
          if (f.pos.distanceTo(target) < 9) {
            f.state = 'approach'; f.t = 0; f.dur = 8; ms.service[f.slot].landing = true;
            toLocal(f.pos, f.from); f.lq.copy(msQi).multiply(f.q);
            const dirL = tmp.copy(f.vel).applyQuaternion(msQi).normalize();
            f.c1.copy(f.from).addScaledVector(dirL, 12); f.c2.set(D.xo - 10, D.slotY + 0.6, D.slotZ(f.slot));
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
        if (u >= 1) { f.state = 'turn'; f.t = 0; ms.service[f.slot].landing = false; f.lq.copy(yawQ(NOSE_IN)); }
        break;
      }
      case 'turn': {
        // The bay's turntable turns the fighter round to face the mouth again.
        f.t += dt; const u = smooth(clamp(f.t / 2.2, 0, 1)); f.thrust = 0;
        yawQ(NOSE_IN + Math.PI * u, f.lq);
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
        f.t += dt; const a = 4.5, x = f.from.x - 0.5 * a * f.t * f.t, out = Math.max(0, D.xo - x);
        f.lp.set(x, f.from.y + out * 0.12, f.from.z); yawQ(NOSE_OUT, f.lq).multiply(tmpQ.setFromAxisAngle(tmp.set(1, 0, 0), Math.min(0.12, out * 0.01)));
        f.thrust = 1;
        if (x < D.xo - 26) {
          toWorld(f.lp, f.pos); f.q.copy(msQ).multiply(f.lq);
          f.vel.set(0, 0, -1).applyQuaternion(f.q).multiplyScalar(a * f.t);
          f.slot = -1; startPatrol(f);
        }
        break;
      }
      case 'rollout': {
        // A new fighter: the shutter opens, it rolls out of the assembly bay, turns to face space, the pilot waves, sparkles.
        f.t += dt; const T1 = 1.2, T2 = T1 + 3.6, T3 = T2 + 1.4, T4 = T3 + 3.2;
        const from = tmp.set(D.slotX, D.slotY, D.zA), pad = padPos(tmp2.clone());
        if (f.t < T2) { const u = smooth(clamp((f.t - T1) / (T2 - T1), 0, 1)); f.lp.lerpVectors(from, pad, u); yawQ(0, f.lq); }
        else { if (!f.cheered) { f.cheered = true; burst(tmp.copy(pad)); }
          f.lp.copy(pad); yawQ(NOSE_OUT * smooth(clamp((f.t - T2) / (T3 - T2), 0, 1)), f.lq); }
        f.thrust = 0;
        if (f.t > T4) { f.pilot = true; rolling = null; f.from.copy(f.lp); f.state = 'launch'; f.t = 0; f.slot = -1; }
        break;
      }
    }
  }

  // ----- Every frame -----
  const camLocal = new THREE.Vector3();
  function update(dt, { camera, reduced: red = false }) {
    reduced = red;
    time += dt;
    const fdt = reduced ? dt * 0.15 : dt;
    // Tier change: the old ship fades as the new one powers up.
    if (fading) { fading.t -= dt / 2.5; fading.root.scale.setScalar(0.94 + 0.06 * fading.t); fading.setFade(Math.max(0, fading.t)); if (fading.t <= 0) { fading.root.visible = false; fading.setFade(1); fading.root.scale.setScalar(1); fading.root.position.set(0, 0, 0); fading = null; } }
    if (!ms) { for (const k in inst) inst[k].count = 0; exhaust.geometry.setDrawRange(0, 0); navLights.geometry.setDrawRange(0, 0); people.visible = false; return; }
    if (transition < 1) { transition = Math.min(1, transition + dt / 3); ms.setFade(smooth(transition)); ms.root.scale.setScalar(0.9 + 0.1 * smooth(transition)); }
    moveStation(fdt);
    root.updateMatrixWorld();
    const camD = camera.position.distanceTo(root.position);
    toLocal(camera.position, camLocal);
    const nearHangar = camLocal.distanceTo(ms.D.bayCenter) < 300;

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

    // Hangar crew: a pilot walking to each fighter that's boarding, and the new fighter's pilot waving.
    let ci = 0;
    if (nearHangar) for (const f of fighters) {
      if (ci >= crew.length) break;
      if (f.state === 'board') {
        const p = crew[ci++], u = smooth(clamp(f.t / 3, 0, 1)), door = ms.D.crewDoor, to = tmp.set(f.lp.x + 0.5, ms.D.deckY, f.lp.z - 1.0);
        p.group.position.lerpVectors(door, to, u); p.group.position.y = ms.D.deckY;
        p.group.rotation.y = Math.atan2(-(to.x - door.x), -(to.z - door.z)); p.pose('walk', time); p.group.visible = u < 0.98;
      } else if (f.state === 'rollout' && f.t > 4.8) {
        const p = crew[ci++], pad = padPos(tmp.clone()); p.group.visible = true;
        p.group.position.set(pad.x - 0.6, ms.D.deckY, pad.z - 1.9); p.group.rotation.y = Math.PI * 0.75;
        if (f.t < 8.2) p.pose('wave', time); else { p.pose('walk', time); p.group.position.z += (f.t - 8.2) * 0.8; }
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
      spare--; toWorld(slotPos(i, wpos), wpos); wq.copy(msQ).multiply(yawQ(NOSE_OUT, tmpQ2));
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
  function keepClear(pos, pad) {
    if (!ms || !ms.root.visible) return;
    // A few passes, since pushing out of one box can land in the next one.
    pushOut(pos, pad);
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
    roll: (n = 1) => { rollQueue += n; },
  };
  // How far out anything might need to go to see the fleet (for the free camera's range).
  const reach = () => ms ? station.pos.length() + ms.D.L * 0.8 : 0;
  return { root, setFund, update, keepClear, blocks, info, get reach() { return reach(); }, debug, get present() { return !!ms; }, get size() { return ms?.D; }, get yaw() { return station.yaw; }, quaternion: msQ, toWorld };
}
