// The emergency fund's guardian fleet. A dark, military-style mothership holds station far from everything, like a calm
// coast guard, with a wing of small fighters that patrol space, come home to refuel, and launch again.
// Tiers by months of costs saved: a patrol frigate (under 3), a cruiser (3 to 6), a flagship carrier (6 or more).
// One fighter per "fighter unit" of the fund (a setting, $100 by default); up to 24 fly, the rest wait in reserve.
// Every design here is original. Sizes are in world units (the player's ship is about 18 long). Ships face -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { armorTexture, windowRowsTexture, deckTexture, fleetDecalTexture, serialTexture, rackTexture, consoleGlowTexture, softGlowTexture } from './textures.js';

export const MAX_ACTIVE = 24;
export const TIERS = {
  frigate: { label: 'Patrol frigate', L: 60, W: 12, H: 9, HD: 8, HH: 4.6, slots: 6, segs: 3, engines: 2, turrets: 2, officers: 3, serial: 'GP-104' },
  cruiser: { label: 'Cruiser', L: 92, W: 17, H: 12, HD: 9, HH: 5.2, slots: 10, segs: 4, engines: 3, turrets: 4, officers: 4, serial: 'GC-311' },
  carrier: { label: 'Flagship carrier', L: 145, W: 26, H: 17, HD: 10, HH: 6, slots: 16, segs: 5, engines: 4, turrets: 6, officers: 6, serial: 'GF-001' },
};
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
  return TX = { armor, deck, rack, win, decal: fleetDecalTexture(), screen: consoleGlowTexture(), glow: softGlowTexture() };
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
function shipMaterials(tx, tier) {
  // A faint glow from the armour itself keeps the shaded side readable (panel lines and rivets still show) without lifting the dark paint.
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, map: tx.armor, roughness: 0.82, metalness: 0.2, emissive: '#1C2024', emissiveMap: tx.armor, ...o });
  return {
    black: std('#34383C'), steel: std('#5C636A'), green: std('#3E6049'), dark: std('#1A1C1E', { roughness: 0.6, emissive: '#0C0E10' }),
    interior: std('#6B7378', { emissive: '#3A4146', emissiveMap: tx.armor, emissiveIntensity: 0.55 }),
    deck: new THREE.MeshStandardMaterial({ map: tx.deck, roughness: 0.9, emissive: '#FFFFFF', emissiveMap: tx.deck, emissiveIntensity: 0.32 }),
    rack: new THREE.MeshStandardMaterial({ map: tx.rack, roughness: 0.8, emissive: '#FFFFFF', emissiveMap: tx.rack, emissiveIntensity: 0.4 }),
    fuel: new THREE.MeshStandardMaterial({ color: '#3E6B4A', roughness: 0.5, metalness: 0.3, emissive: '#1C3324' }),
    win: new THREE.MeshBasicMaterial({ map: tx.win }), lamp: new THREE.MeshBasicMaterial({ color: '#DDF4FF' }), lampG: new THREE.MeshBasicMaterial({ color: '#8FF0C0' }),
    engine: new THREE.MeshBasicMaterial({ color: '#A8E4FF' }), screen: new THREE.MeshBasicMaterial({ map: tx.screen }),
    glass: new THREE.MeshStandardMaterial({ color: '#16303E', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.32, depthWrite: false }),
    decal: new THREE.MeshStandardMaterial({ map: tx.decal, roughness: 0.75, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    serial: new THREE.MeshStandardMaterial({ map: serialTexture(TIERS[tier].serial), roughness: 0.75, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
}

function buildMothership(key) {
  const t = TIERS[key], { L, W, H, HD, HH, slots } = t, k = L / 60, tx = textures();
  const mats = shipMaterials(tx, key), B = batch(), put = B.put;
  const root = new THREE.Group(); root.name = 'mothership-' + key;
  // Layout of the hangar: a big bay on the left (port) side, open to space, with its back against the hull.
  const zn = -L / 2 + L * 0.2, zt = L / 2 - L * 0.07, gap = 0.9 * k;
  const HL = 1 + slots * SP + PAD + ASM + 1, hz = Math.max(-L * 0.04, zn + 1.5 + HL / 2), zs = hz - HL / 2, ze = hz + HL / 2;
  const xo = -W / 2 - HD, xi = -W / 2, deckY = -H * 0.22, ceilY = deckY + HH;
  const D = { key, L, W, H, HD, HH, HL, hz, zs, ze, xo, xi, deckY, ceilY, k, slots,
    slotX: xo + HD * 0.5 + 0.3, slotY: deckY, slotZ: i => zs + 1 + (i + 0.5) * SP, padZ: zs + 1 + slots * SP + PAD / 2,
    zp: ze - 1 - ASM, zA: ze - 1 - ASM / 2, R: Math.max(W / 2 + HD, H * 0.95) + 2, ex: [W / 2 + HD + 3, H * 1.2 + 4, L / 2 + 4] };

  // ----- The hull: a pointed prow, then armoured segments with dark ribs and green bands, then the engine block. -----
  put('black', octLoft([{ z: -L / 2, w: W * 0.16, h: H * 0.2, y: -H * 0.14 }, { z: -L / 2 + L * 0.09, w: W * 0.64, h: H * 0.62, y: -H * 0.08 }, { z: zn, w: W, h: H }]));
  const segLen = (zt - zn - (t.segs - 1) * gap) / t.segs, segs = [];
  for (let i = 0; i < t.segs; i++) {
    const z0 = zn + i * (segLen + gap), z1 = z0 + segLen; segs.push([z0, z1]);
    put(i % 2 ? 'steel' : 'black', octLoft([{ z: z0, w: W * 0.95, h: H * 0.93 }, { z: z0 + 0.5 * k, w: W, h: H }, { z: z1 - 0.5 * k, w: W, h: H }, { z: z1, w: W * 0.95, h: H * 0.93 }]));
    put('green', octLoft([{ z: z0 + 0.7 * k, w: W * 1.012, h: H * 1.012 }, { z: z0 + 1.15 * k, w: W * 1.012, h: H * 1.012 }], { caps: false }));
    if (i < t.segs - 1) put('dark', octLoft([{ z: z1 - 0.1, w: W * 0.9, h: H * 0.88 }, { z: z1 + gap + 0.1, w: W * 0.9, h: H * 0.88 }], { caps: false }));
  }
  put('steel', octLoft([{ z: zt - 0.2, w: W * 0.96, h: H * 0.92 }, { z: L / 2, w: W * 0.86, h: H * 0.8 }]));
  // Keel under the belly and a raised spine on top.
  put('black', octLoft([{ z: zn - 2 * k, w: W * 0.2, h: H * 0.12, y: -H * 0.52 }, { z: zn + 4 * k, w: W * 0.42, h: H * 0.32, y: -H * 0.6 }, { z: zt - 5 * k, w: W * 0.42, h: H * 0.32, y: -H * 0.6 }, { z: zt, w: W * 0.3, h: H * 0.2, y: -H * 0.54 }]));
  put('steel', octLoft([{ z: -L / 2 + L * 0.12, w: W * 0.1, h: H * 0.08, y: H * 0.42 }, { z: zn, w: W * 0.34, h: H * 0.24, y: H * 0.56 }, { z: L * 0.3, w: W * 0.34, h: H * 0.24, y: H * 0.56 }, { z: L * 0.4, w: W * 0.2, h: H * 0.12, y: H * 0.5 }]));
  // Armour plates bolted along the starboard side, and vents.
  for (const [z0, z1] of segs.slice(3)) for (let z = z0 + 2 * k; z < z1 - 2 * k; z += 3.2 * k) put('steel', at(boxG(0.3, H * 0.28, 2.6 * k), W / 2 + 0.1, -H * 0.12, z + 1.3 * k));

  // ----- Engines: big nozzles with a soft blue glow. -----
  const ne = t.engines, re = Math.min(H * 0.24, W * 0.84 / (ne * 2)), eLen = L * 0.07, engines = [];
  for (let i = 0; i < ne; i++) {
    const x = (i - (ne - 1) / 2) * re * 2.15, y = -H * 0.05 + (ne > 3 && (i === 0 || i === ne - 1) ? -H * 0.12 : 0);
    put('dark', at(cylG(re * 1.08, re * 0.92, eLen, 14, true), x, y, L / 2 + eLen / 2 - 0.6 * k, Math.PI / 2));
    put('steel', at(cylG(re * 1.18, re * 1.18, eLen * 0.35, 14), x, y, L / 2 - 0.2 * k, Math.PI / 2));
    put('green', at(cylG(re * 1.2, re * 1.2, 0.35 * k, 14, true), x, y, L / 2 + eLen * 0.2, Math.PI / 2));
    put('engine', at(new THREE.CircleGeometry(re * 0.82, 14), x, y, L / 2 + eLen * 0.45));
    engines.push({ p: [x, y, L / 2 + eLen * 0.75], c: '#7FCBFF' });
  }

  // ----- The hangar module on the port side, open to space. -----
  const hmid = xo + HD / 2;
  put('steel', at(boxG(HD, 0.8, HL), hmid, deckY - 0.4, hz));                                       // floor slab
  put('black', at(boxG(HD + 0.6, 0.9 * k, HL + 0.6), hmid - 0.3, ceilY + 0.45 * k, hz));           // roof slab
  put('black', octLoft([{ z: zs + 1, w: HD * 0.7, h: H * 0.2, x: hmid + HD * 0.1, y: deckY - 0.8 - H * 0.1 }, { z: ze - 1, w: HD * 0.7, h: H * 0.2, x: hmid + HD * 0.1, y: deckY - 0.8 - H * 0.1 }]));
  for (const z of [zs + 0.4, ze - 0.4]) put('black', at(boxG(HD + 0.6, HH + 0.2, 0.8), hmid - 0.3, deckY + HH / 2, z));  // fore and aft walls
  put('interior', at(boxG(0.4, HH, HL), xi - 0.2, deckY + HH / 2, hz));                              // back wall
  for (let i = 0; i < 6; i++) put('steel', at(boxG(0.5, H * 0.32, 0.6), xi - 0.6 - i % 2 * 0.2, deckY - 0.8 - H * 0.12, zs + 3 + i * (HL - 6) / 5, 0, 0, 0.5)); // struts under
  // Lip trims along the mouth, with hazard chevrons.
  put('green', at(boxG(0.4, 0.35, HL), xo + 0.2, deckY - 0.05, hz));
  put('green', at(boxG(0.4, 0.35 * k, HL), xo - 0.1, ceilY + 0.05, hz));
  const chevrons = (len, h, x, y, zc, ry) => { const n = Math.max(1, Math.round(len / (h * 8))), w = len / n; for (let i = 0; i < n; i++) put('decal', at(decalG(w, h, DECAL.chevron), x, y, zc - len / 2 + w * (i + 0.5), 0, ry)); };
  chevrons(HL - 1.2, 0.5, xo - 0.02, deckY - 0.45, hz, -Math.PI / 2);
  chevrons(HL - 1.2, 0.5 * k, xo - 0.32, ceilY + 0.45 * k, hz, -Math.PI / 2);
  // Interior: deck plates with parking boxes and bay numbers, ceiling lamps, gantry beams, fuel and ammo racks, a catwalk.
  for (let i = 0; i < slots; i++) {
    const z = D.slotZ(i), dg = new THREE.PlaneGeometry(HD - 0.4, SP), uv = dg.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getY(j), uv.getX(j));   // the taxi line runs across the bay, toward the mouth
    put('deck', at(dg, hmid + 0.2, deckY + 0.01, z, -Math.PI / 2));
    put('decal', at(decalG(1.1, 0.95, DECAL.bay(i)), xo + 1.1, deckY + 0.03, z, -Math.PI / 2));
    put('steel', at(boxG(HD * 0.92, 0.22, 0.22), hmid, ceilY - 0.3, z));                             // gantry beam
    put('dark', at(boxG(0.5, 0.25, 0.4), D.slotX + 0.35, ceilY - 0.5, z));                           // trolley
    put('lamp', at(boxG(HD * 0.7, 0.06, 0.22), hmid, ceilY - 0.05, z + SP / 2));
    // Racks against the back wall, under the catwalk: fuel cells in even bays, ammunition crates in odd ones.
    if (i % 2 === 0) for (let r = 0; r < 3; r++) { put('fuel', at(cylG(0.2, 0.2, 2.6, 10), xi - 0.55, deckY + 0.3 + r * 0.46, z, Math.PI / 2)); put('dark', at(cylG(0.21, 0.21, 0.12, 10), xi - 0.55, deckY + 0.3 + r * 0.46, z + 1.3, Math.PI / 2)); }
    else for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) put(c % 3 ? 'steel' : 'green', at(boxG(0.55, 0.42, 0.6), xi - 0.5, deckY + 0.22 + r * 0.46, z - 1.1 + c * 0.72));
    put('rack', at(new THREE.PlaneGeometry(SP - 0.4, HH * 0.4), xi - 0.41, deckY + HH * 0.78, z, 0, -Math.PI / 2));
    put('steel', at(boxG(0.1, HH * 0.55, 0.1), xi - 1.0, deckY + HH * 0.275, z + SP / 2));          // rack posts hold the catwalk
  }
  const catY = deckY + HH * 0.55, catLen = HL - 2;
  put('steel', at(boxG(1.1, 0.1, catLen), xi - 0.75, catY, hz));
  put('steel', at(boxG(0.05, 0.05, catLen), xi - 1.27, catY + 0.5, hz));
  for (let z = zs + 1.5; z < ze - 1; z += 2) put('steel', at(boxG(0.05, 0.5, 0.05), xi - 1.27, catY + 0.25, z));
  put('steel', at(boxG(0.9, 0.08, catY * 0 + HH * 0.75), xi - 0.75, deckY + HH * 0.28, zs + 1.4 + HH * 0.3, Math.atan2(HH * 0.55, HH * 0.6)));   // stairs
  // The crew door at the back of the pad, where pilots come out.
  put('dark', at(boxG(0.1, 1.0, 0.6), xi - 0.42, deckY + 0.5, D.padZ + 1.6));
  put('lampG', at(boxG(0.06, 0.06, 0.7), xi - 0.45, deckY + 1.05, D.padZ + 1.6));
  // The partition to the assembly bay, with a shutter opening, and the closed outer wall of the bay.
  const DW = 3.8, DH = Math.min(2.6, HH - 0.6), dx = D.slotX;
  put('black', at(boxG(dx - DW / 2 - xo, HH, 0.4), (xo + dx - DW / 2) / 2, deckY + HH / 2, D.zp));
  put('black', at(boxG(xi - (dx + DW / 2), HH, 0.4), (xi + dx + DW / 2) / 2, deckY + HH / 2, D.zp));
  put('black', at(boxG(DW, HH - DH, 0.4), dx, deckY + DH + (HH - DH) / 2, D.zp));
  chevrons(DW, 0.3, dx, deckY + DH + 0.2, D.zp - 0.21, Math.PI);
  put('black', at(boxG(0.5, HH, ASM), xo + 0.25, deckY + HH / 2, D.zA));
  put('decal', at(decalG(ASM * 0.8, ASM * 0.1, DECAL.caution), xo - 0.02, deckY + HH * 0.5, D.zA, 0, -Math.PI / 2));
  put('deck', at(new THREE.PlaneGeometry(HD - 0.6, ASM), hmid + 0.2, deckY + 0.01, D.zA, -Math.PI / 2));
  for (const s of [-1, 1]) put('steel', at(boxG(0.25, HH - 0.3, 0.25), dx + s * 2.2, deckY + (HH - 0.3) / 2, D.zA));   // assembly frame
  put('steel', at(boxG(4.6, 0.25, 0.25), dx, deckY + HH - 0.4, D.zA));
  put('lamp', at(boxG(3, 0.05, 0.3), dx, ceilY - 0.06, D.zA));
  // Guide beacons on booms at both ends of the mouth.
  const beacons = [];
  for (const z of [zs + 0.4, ze - 0.4]) for (const y of [deckY - 0.2, ceilY + 0.3 * k]) {
    put('steel', at(boxG(6 * k, 0.3, 0.3), xo - 3 * k, y, z));
    put('dark', at(boxG(0.5, 0.5, 0.5), xo - 6 * k, y, z));
    beacons.push({ p: [xo - 6 * k, y, z], c: z < hz ? '#7FF0B0' : '#7FCBFF' });
  }
  // The hangar's control tower: a small lookout on the roof at the front end, with lit windows and a radar bar.
  const ct = { x: xo + 2.2 * k, y: ceilY + 0.9 * k, z: zs + 2.4 * k, s: 2.6 * k };
  put('black', at(boxG(ct.s, ct.s * 1.1, ct.s), ct.x, ct.y + ct.s * 0.55, ct.z));
  put('steel', at(boxG(ct.s * 1.3, ct.s * 0.5, ct.s * 1.3), ct.x, ct.y + ct.s * 1.35, ct.z));
  for (const [ox, oz, ry] of [[-ct.s * 0.66, 0, -Math.PI / 2], [0, -ct.s * 0.66, Math.PI]]) put('win', at(new THREE.PlaneGeometry(ct.s * 1.1, ct.s * 0.3), ct.x + ox, ct.y + ct.s * 1.38, ct.z + oz, 0, ry));
  const radar = new THREE.Mesh(at(boxG(ct.s * 1.1, 0.12 * k, 0.25 * k), 0, 0, 0), mats.steel); radar.position.set(ct.x, ct.y + ct.s * 1.75, ct.z);

  // ----- The command tower and the bridge on top of it. -----
  const tz = L * 0.14, ty0 = H * 0.5, tw = W * 0.36;
  put('black', octLoft([{ z: tz - L * 0.09, w: tw * 0.7, h: H * 0.5, y: ty0 + H * 0.2 }, { z: tz - L * 0.05, w: tw, h: H * 0.62, y: ty0 + H * 0.26 }, { z: tz + L * 0.08, w: tw, h: H * 0.62, y: ty0 + H * 0.26 }, { z: tz + L * 0.1, w: tw * 0.8, h: H * 0.5, y: ty0 + H * 0.2 }]));
  const uy = ty0 + H * 0.57, uh = H * 0.32, uw = tw * 0.82, ud = L * 0.1;
  put('steel', at(boxG(uw, uh, ud), 0, uy + uh / 2, tz));
  for (const s of [-1, 1]) for (let r = 0; r < 2; r++) put('win', at(new THREE.PlaneGeometry(ud * 0.85, uh * 0.32), s * (uw / 2 + 0.02), uy + uh * (0.3 + r * 0.42), tz, 0, s * Math.PI / 2));
  put('win', at(new THREE.PlaneGeometry(uw * 0.8, uh * 0.3), 0, uy + uh * 0.7, tz - ud / 2 - 0.02, 0, Math.PI));
  for (const s of [-1, 1]) put('decal', at(decalG(H * 0.42, H * 0.42, DECAL.seal), s * (tw / 2 + 0.03), ty0 + H * 0.28, tz + L * 0.02, 0, s * Math.PI / 2));
  // The bridge: a hollow room with a sloped glass front, lit consoles and officers inside.
  const bw = W * 0.5, bd = Math.max(4.2, L * 0.065), bh = Math.max(1.7, H * 0.17), by = uy + uh, bz = tz - ud * 0.1;
  put('steel', at(boxG(bw, 0.15, bd), 0, by + 0.075, bz));
  put('black', at(boxG(bw + 0.4, 0.25, bd + 0.6), 0, by + bh + 0.12, bz + 0.1));
  put('interior', at(boxG(bw, bh, 0.15), 0, by + bh / 2, bz + bd / 2));
  for (const s of [-1, 1]) { put('steel', at(boxG(0.15, bh, bd), s * bw / 2, by + bh / 2, bz)); put('win', at(new THREE.PlaneGeometry(bd * 0.7, bh * 0.25), s * (bw / 2 + 0.08), by + bh * 0.6, bz, 0, s * Math.PI / 2)); }
  const slope = 0.35, gh = bh * 0.8, gz = bz - bd / 2;
  put('steel', at(boxG(bw, bh * 0.2, 0.2), 0, by + bh * 0.1, gz));
  put('glass', at(new THREE.PlaneGeometry(bw - 0.1, gh / Math.cos(slope)), 0, by + bh * 0.2 + gh / 2, gz + Math.tan(slope) * gh / 2, -slope, Math.PI));
  for (let i = 0; i <= 4; i++) put('black', at(boxG(0.08, gh / Math.cos(slope), 0.08), -bw / 2 + 0.05 + i * (bw - 0.1) / 4, by + bh * 0.2 + gh / 2, gz + Math.tan(slope) * gh / 2, slope));
  put('lamp', at(boxG(bw * 0.8, 0.04, 0.12), 0, by + bh - 0.03, bz + bd * 0.1));
  // On the roof: the authority beacon, antennas and a sensor array; a dish on the right.
  const roofY = by + bh + 0.25;
  for (const [x, h] of [[-bw * 0.32, 3.2 * k], [-bw * 0.2, 4.6 * k], [bw * 0.34, 2.4 * k]]) put('steel', at(cylG(0.05 * k, 0.09 * k, h, 6), x, roofY + h / 2, bz + bd * 0.25));
  put('steel', at(boxG(bw * 0.4, 0.8 * k, 0.12), bw * 0.1, roofY + 0.5 * k, bz + bd * 0.38));
  put('rack', at(new THREE.PlaneGeometry(bw * 0.38, 0.7 * k), bw * 0.1, roofY + 0.5 * k, bz + bd * 0.38 - 0.07, 0, Math.PI));
  put('steel', at(cylG(0.12 * k, 0.18 * k, 2.2 * k, 8), W * 0.28, H / 2 + 1.1 * k, tz - L * 0.13));
  put('steel', at(new THREE.SphereGeometry(1.3 * k, 12, 6, 0, Math.PI * 2, 0, 0.9), W * 0.28, H / 2 + 2.5 * k, tz - L * 0.13, -0.9));
  // Sensor block on the nose.
  put('steel', at(boxG(W * 0.2, H * 0.1, L * 0.06), 0, H * 0.4, -L * 0.33));
  put('rack', at(new THREE.PlaneGeometry(W * 0.18, H * 0.08), 0, H * 0.4, -L * 0.33 - L * 0.03 - 0.02, 0, Math.PI));

  // ----- Turret-like emitters: a base, a dome and twin barrels. Nothing fires (yet). -----
  const turretSpots = [[0, H * 0.68, -L * 0.3], [0, H * 0.68, L * 0.33], [W / 2 + 0.2, -H * 0.2, -L * 0.14], [W / 2 + 0.2, -H * 0.2, L * 0.22], [0, -H * 0.78, -L * 0.1], [0, -H * 0.78, L * 0.2]];
  for (const [i, [x, y, z]] of turretSpots.slice(0, t.turrets).entries()) {
    const side = x > 0 ? 1 : 0, down = y < 0 ? -1 : 1, s = k * (key === 'carrier' ? 0.8 : 1);
    const g = [cylG(1.0 * s, 1.15 * s, 0.4 * s, 10), new THREE.SphereGeometry(0.85 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.2 * s, 0)];
    for (const o of [-0.28, 0.28]) g.push(cylG(0.08 * s, 0.1 * s, 2.4 * s, 6).rotateX(Math.PI / 2).translate(o * s, 0.55 * s, -1.4 * s));
    for (const geo of g) { if (side) geo.rotateZ(-Math.PI / 2); if (down < 0) geo.rotateX(Math.PI); put(i % 2 ? 'steel' : 'black', geo.translate(x, y, z)); }
    const tip = new THREE.SphereGeometry(0.12 * s, 6, 4); for (const o of [-0.28, 0.28]) { const g2 = tip.clone().translate(o * s, 0.55 * s, -2.6 * s); if (side) g2.rotateZ(-Math.PI / 2); if (down < 0) g2.rotateX(Math.PI); put('lampG', g2.translate(x, y, z)); }
  }
  // A closed reserve hangar on the starboard side, to balance the open one.
  put('black', octLoft([{ z: hz - HL * 0.3, w: HD * 0.5, h: HH * 0.7, x: W / 2 + HD * 0.2, y: deckY + HH * 0.3 }, { z: hz - HL * 0.25, w: HD * 0.6, h: HH * 0.85, x: W / 2 + HD * 0.25, y: deckY + HH * 0.35 }, { z: hz + HL * 0.3, w: HD * 0.6, h: HH * 0.85, x: W / 2 + HD * 0.25, y: deckY + HH * 0.35 }, { z: hz + HL * 0.35, w: HD * 0.5, h: HH * 0.7, x: W / 2 + HD * 0.2, y: deckY + HH * 0.3 }]));
  const sx = W / 2 + HD * 0.55 + 0.03;
  put('decal', at(decalG(HL * 0.36, HL * 0.045, DECAL.letters), sx, deckY + HH * 0.55, hz, 0, Math.PI / 2));
  put('green', at(boxG(0.1, HH * 0.12, HL * 0.55), sx - 0.02, deckY + HH * 0.2, hz));

  // ----- Markings: badges, the patrol stripe, the serial number and warning signs. -----
  // Starboard: the patrol stripe on the first segment, the badge on the second, the serial on the third.
  const sideX = W / 2 + 0.04, seg = i => (segs[i][0] + segs[i][1]) / 2, stripeLen = Math.min(H * 1.5, segLen * 0.8);
  put('decal', at(decalG(stripeLen, stripeLen * 0.22, DECAL.stripe), sideX, -H * 0.02, segs[0][0] + 1.5 * k + stripeLen / 2, 0, Math.PI / 2));
  put('decal', at(decalG(H * 0.5, H * 0.5, DECAL.badge), sideX, H * 0.02, seg(1), 0, Math.PI / 2));
  put('serial', at(decalG(H * 0.9, H * 0.22, [0, 0, 1, 1]), sideX, H * 0.1, seg(2), 0, Math.PI / 2));
  // Port side: the badge on the front of the hangar.
  put('decal', at(decalG(HH * 0.6, HH * 0.6, DECAL.badge), hmid - 0.3, deckY + HH * 0.5, zs - 0.03, 0, Math.PI));
  // The nose's sloped sides: the patrol stripe on both.
  const nzA = -L / 2 + L * 0.09, nAng = Math.atan2(W * 0.18, zn - nzA);
  for (const s of [-1, 1]) put('decal', at(decalG((zn - nzA) / Math.cos(nAng) * 0.9, H * 0.3, DECAL.stripe), s * (W * 0.41 + 0.05), -H * 0.04, (nzA + zn) / 2, 0, s * (Math.PI / 2 + nAng)));
  put('decal', at(decalG(W * 0.5, W * 0.06, DECAL.caution), 0, H * 0.3, L / 2 + 0.03));
  // Top deck: the serial big enough to read from above.
  put('serial', at(decalG(W * 0.42, W * 0.105, [0, 0, 1, 1]), W * 0.27, H / 2 + 0.03, seg(1), -Math.PI / 2, Math.PI / 2));

  for (const m of B.meshes(mats)) root.add(m);
  root.add(radar);

  // ----- Moving parts: the shutter, the refuelling arms and hoses, the beacon. -----
  const door = new THREE.Mesh(at(boxG(DW, DH, 0.15), 0, DH / 2, 0), mats.steel); door.position.set(dx, deckY, D.zp - 0.05); root.add(door);
  const armGeo = mergeGeometries([boxG(0.14, 1, 0.14).translate(0, -0.5, 0), boxG(0.4, 0.12, 0.3).translate(0, -1, 0)].map(g => g.toNonIndexed()));
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ color: '#B58A2E', roughness: 0.6, map: tx.armor }), slots);
  const hoses = new THREE.InstancedMesh(cylG(0.06, 0.06, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#2A2C2E', roughness: 0.7, emissive: '#15191B' }), slots);
  arms.frustumCulled = hoses.frustumCulled = false; root.add(arms, hoses);
  const service = Array.from({ length: slots }, () => ({ arm: 0, hose: 0, want: 0 }));
  // The beacon: a lamp with two slowly turning beams, one blue and one green.
  const beacon = new THREE.Group(); beacon.position.set(-bw * 0.05, roofY + 0.3 * k, bz - bd * 0.1);
  const housing = new THREE.Mesh(cylG(0.35 * k, 0.45 * k, 0.5 * k, 10), mats.black); housing.position.y = -0.1 * k;
  const lampMesh = new THREE.Mesh(cylG(0.13 * k, 0.13 * k, 0.25 * k, 10), new THREE.MeshBasicMaterial({ color: '#9FE6FF' })); lampMesh.position.y = 0.3 * k;
  const beams = new THREE.Group(); beams.position.y = 0.3 * k;
  for (const [i, c] of [['#7FCBFF', 0], ['#7FF0B0', 1]].map(([c], i) => [i, c])) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7 * k, 7 * k, 16, 1, true).translate(0, -3.5 * k, 0).rotateZ(Math.PI / 2 + i * Math.PI),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beams.add(cone);
  }
  beacon.add(housing, lampMesh, beams); root.add(beacon);

  // ----- Lights: running lights along the hull (blue on the left, green on the right), hangar lamps, engine glow. -----
  const run = [];
  const rx = W / 2 - Math.min(W, H) * 0.17 + 0.15, ry = H * 0.45 + 0.15;
  for (let z = zn + 1; z < zt; z += L / 12) run.push({ p: [-rx, ry, z], c: '#7FCBFF' }, { p: [rx, ry, z], c: '#7FF0B0' });
  run.push({ p: [0, -H * 0.1, -L / 2 - 0.3], c: '#FFFFFF' }, { p: [-tw / 2, uy + uh, tz + ud / 2], c: '#7FCBFF' }, { p: [tw / 2, uy + uh, tz + ud / 2], c: '#7FF0B0' });
  for (const [x, h] of [[-bw * 0.32, 3.2 * k], [-bw * 0.2, 4.6 * k]]) run.push({ p: [x, roofY + h, bz + bd * 0.25], c: '#FF8A7A' });
  const runLights = dots(run, tx.glow, 1.4 * k, 0.85);
  // Landing lights: a row across the deck lip in front of each bay, and lamps along the mouth.
  const land = [];
  for (let i = 0; i < slots; i++) for (let j = 0; j < 4; j++) land.push({ p: [xo + 0.3 + j * 0.9, deckY + 0.08, D.slotZ(i)], c: '#FFE6A8' });
  const landLights = dots(land, tx.glow, 0.7, 1);
  const lip = []; for (let z = zs + 1; z < ze - 0.5; z += 1.6) lip.push({ p: [xo + 0.05, deckY + 0.12, z], c: '#7FCBFF' }, { p: [xo - 0.2, ceilY + 0.1, z], c: '#7FCBFF' });
  const lipLights = dots(lip, tx.glow, 0.55, 0.9);
  const beaconLights = dots(beacons, tx.glow, 2.4 * k, 1);
  const engineGlow = dots(engines, tx.glow, re * 4.2, 0.7);
  root.add(runLights, landLights, lipLights, beaconLights, engineGlow);

  // ----- Near-only details: officers on the bridge and the consoles they work at. -----
  const near = new THREE.Group(); near.visible = false; root.add(near);
  const officers = [];
  const nOff = t.officers, deskMat = mats.steel;
  const desk = new THREE.Mesh(boxG(bw * 0.84, 0.3, 0.42), deskMat); desk.position.set(0, by + 0.3, gz + 0.62); near.add(desk);
  const screens = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.8, 0.26), mats.screen); screens.position.set(0, by + 0.46, gz + 0.62); screens.rotation.set(-1.15, Math.PI, 0); near.add(screens);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, bd * 0.8), new THREE.MeshBasicMaterial({ color: '#1E3A33' })); glow.position.set(0, by + 0.16, bz); glow.rotation.x = -Math.PI / 2; near.add(glow);
  for (let i = 0; i < nOff; i++) {
    const seated = i < Math.ceil(nOff * 0.66), r = hashN(i * 13 + key.length);
    const p = makePerson({ suit: i === nOff - 1 ? '#22362A' : '#2C4535', skin: SKIN[Math.floor(r * SKIN.length)], cap: i === nOff - 1 ? '#151718' : '#1F2A24' });
    if (seated) { p.group.position.set(-bw * 0.38 + (i + 0.5) * (bw * 0.76) / Math.ceil(nOff * 0.66), by + 0.15, gz + 1.08); p.group.rotation.y = 0; p.seated = true; }
    else { p.group.position.set(-bw * 0.2 + (i - Math.ceil(nOff * 0.66)) * 0.8, by + 0.15, bz + bd * 0.25); p.group.rotation.y = 0.3; }
    if (seated) { const chair = new THREE.Mesh(boxG(0.22, 0.2, 0.22), mats.dark); chair.position.set(p.group.position.x, by + 0.25, gz + 1.14); near.add(chair); }
    p.phase = r * 10; officers.push(p); near.add(p.group);
  }

  const allMats = [...Object.values(mats), arms.material, hoses.material, lampMesh.material, ...beams.children.map(c => c.material), ...[runLights, landLights, lipLights, beaconLights, engineGlow].map(p => p.material)];
  for (const m of allMats) m.userData.baseOpacity = m.opacity;
  D.bridge = new THREE.Vector3(0, by + bh / 2, bz);
  D.crewDoor = new THREE.Vector3(xi - 0.6, deckY, D.padZ + 1.6);

  // Per-frame animation of this ship's moving parts.
  let doorOpen = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  function animate(dt, time, { doorWant = 0, cameraNear = false, reduced = false }) {
    if (!reduced) { beams.rotation.y += dt * 0.7; radar.rotation.y += dt * 0.9; }
    doorOpen += clamp(doorWant - doorOpen, -dt * 0.9, dt * 0.9);
    door.position.y = deckY + doorOpen * (DH - 0.2); door.scale.y = 1 - doorOpen * 0.85;
    runLights.material.opacity = 0.65 + 0.25 * Math.sin(time * 1.3);
    beaconLights.material.opacity = 0.5 + 0.5 * Math.max(0, Math.sin(time * 2.2));
    engineGlow.material.opacity = 0.55 + 0.1 * Math.sin(time * 3.1);
    // Landing lights chase toward the bays that have a fighter coming in.
    const col = landLights.geometry.attributes.color;
    for (let i = 0; i < slots; i++) for (let j = 0; j < 4; j++) {
      const on = service[i].landing ? 0.25 + 0.75 * (Math.floor(time * 6 - j) % 4 === 0 ? 1 : 0.15) : 0.35;
      col.setXYZ(i * 4 + j, on, on * 0.9, on * 0.66);
    }
    col.needsUpdate = true;
    // Refuelling arms come down and hoses reach out while a fighter is refuelling.
    for (let i = 0; i < slots; i++) {
      const s = service[i], z = D.slotZ(i);
      s.arm += clamp(s.want - s.arm, -dt * 0.8, dt * 0.8); s.hose += clamp((s.want && s.arm > 0.9 ? 1 : 0) - s.hose, -dt * 1.2, dt * 0.7);
      const drop = 0.25 + smooth(s.arm) * (ceilY - 0.6 - (deckY + 0.68) - 0.25);
      m4.compose(v1.set(D.slotX + 0.35, ceilY - 0.6, z), q.identity(), sc.set(1, drop, 1)); arms.setMatrixAt(i, m4);
      v1.set(xi - 0.3, deckY + 0.5, z - 1.2); v2.set(D.slotX + 0.9, deckY + 0.42, z - 0.4);
      const dir = v2.sub(v1), len = dir.length(); q.setFromUnitVectors(up, dir.normalize());
      m4.compose(v1, q, sc.set(1, Math.max(0.001, smooth(s.hose) * len), 1)); hoses.setMatrixAt(i, m4);
    }
    arms.instanceMatrix.needsUpdate = hoses.instanceMatrix.needsUpdate = true;
    near.visible = cameraNear;
    if (cameraNear && !reduced) for (const p of officers) {
      if (p.seated) p.pose('sit', time + p.phase);
      else { p.pose('stand', time + p.phase); p.group.rotation.y = 0.3 + Math.sin(time * 0.25 + p.phase) * 0.6; }
    }
  }
  function setFade(a) { for (const m of allMats) { m.transparent = a < 1 || m.userData.baseOpacity < 1 || m.blending === THREE.AdditiveBlending; m.opacity = m.userData.baseOpacity * a; m.depthWrite = a >= 1 && m.userData.baseOpacity >= 1 && m.blending !== THREE.AdditiveBlending; } }
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
  const region = () => opts.volume() * 1.25;
  const cellOf = p => { const R = region(); const i = clamp(Math.floor((p.x / R + 1) / 2 * GX), 0, GX - 1), j = clamp(Math.floor((p.y / (R * 0.5) + 1) / 2 * GY), 0, GY - 1), k = clamp(Math.floor((p.z / R + 1) / 2 * GZ), 0, GZ - 1); return (i * GY + j) * GZ + k; };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4(), UPV = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
  const msQ = new THREE.Quaternion(), msQi = new THREE.Quaternion();
  function okPoint(p, pad) {
    if (p.distanceTo(opts.shipPos) < opts.shipRadius + 40) return false;
    for (const pl of opts.planets()) if (p.distanceTo(pl.group.position) < opts.clearance(pl) + pad) return false;
    if (ms && capsuleDist(p) < ms.D.R + pad) return false;
    return true;
  }
  function pickPatrol(f) {
    const R = region(); let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 14; tries++) {
      const c = Math.floor(Math.random() * cells.length), i = Math.floor(c / (GY * GZ)), j = Math.floor(c / GZ) % GY, k = c % GZ;
      const p = new THREE.Vector3(((i + Math.random()) / GX * 2 - 1) * R, ((j + Math.random()) / GY * 2 - 1) * R * 0.5, ((k + Math.random()) / GZ * 2 - 1) * R);
      if (p.distanceTo(f.pos) < 60 || !okPoint(p, 25)) continue;
      const score = Math.min(time - cells[c], 600) + Math.random() * 40;
      if (score > bestScore) { bestScore = score; best = { p, c }; }
    }
    if (!best) { const p = f.pos.clone().multiplyScalar(-0.5); return p; }
    cells[best.c] = time;
    return best.p;
  }
  // Distance from p to the mothership's long axis (a capsule around it).
  function capsuleDist(p) {
    tmp.copy(p).sub(root.position).applyQuaternion(msQi);
    const hl = ms.D.L / 2; tmp.z = tmp.z - clamp(tmp.z, -hl, hl);
    return tmp.length();
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
    f.pos.copy(pickPatrol(f)); f.vel.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).setLength(f.speed);
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
      const add = fund.total - have, shown = Math.min(add, 4);
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
    if (first && old) { old.root.visible = false; fading = null; }
  }

  // ----- Where the mothership waits: far from the player's ship and every planet -----
  function pickStation(from, relax = 1) {
    const vol = opts.volume(), planets = opts.planets(), R = TIERS.carrier.L * 0.6 * relax;
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 120; tries++) {
      const a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 0.5, d = vol * (0.7 + Math.random() * 0.5) / Math.max(relax, 0.6);
      const p = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize().multiplyScalar(d);
      if (p.distanceTo(opts.shipPos) < R + 110) continue;
      if (planets.some(pl => p.distanceTo(pl.group.position) < opts.clearance(pl) + R + 40)) continue;
      let score = Math.random() * 20;
      if (from) {
        const len = p.distanceTo(from); if (len < vol * 0.6) continue;
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

  let reduced = false;
  function moveStation(dt) {
    station.drift += dt;
    const mv = station.move;
    if (mv) {
      // Very slow speed-up and slow-down, and a gentle turn toward where it's going. It waits if the player is in the way.
      const A = 0.07, VMAX = 6, left = mv.len - mv.s;
      const blocked = tmp.copy(opts.shipPos).sub(station.pos), ahead = blocked.dot(mv.dir) > 0 && blocked.length() < (ms?.D.R || 30) + 70;
      const want = ahead ? 0 : Math.min(VMAX, Math.sqrt(2 * A * Math.max(0, left)) + 0.05);
      mv.v += clamp(want - mv.v, -A * 2 * dt, A * dt);
      mv.s = Math.min(mv.len, mv.s + mv.v * dt);
      station.pos.copy(mv.from).addScaledVector(mv.dir, mv.s);
      const turnT = smooth(clamp(mv.s / (mv.len * 0.45), 0, 1));
      station.yaw = mv.yaw0 + Math.atan2(Math.sin(mv.yaw1 - mv.yaw0), Math.cos(mv.yaw1 - mv.yaw0)) * turnT;
      if (mv.len - mv.s < 0.05 && mv.v < 0.1) { station.move = null; station.next = 180 + Math.random() * 240; }
    } else if (!reduced && ms && (station.next -= dt) <= 0) {
      if (!pickStation(station.pos.clone())) station.next = 30;
    }
    const d = reduced ? 0 : 1, s = station.drift;
    root.position.set(station.pos.x + Math.sin(s * 0.11) * 0.7 * d, station.pos.y + Math.sin(s * 0.07) * 0.45 * d, station.pos.z + Math.cos(s * 0.09) * 0.7 * d);
    root.rotation.set(0, station.yaw, Math.sin(s * 0.05) * 0.008 * d);
    msQ.setFromEuler(root.rotation); msQi.copy(msQ).invert();
  }

  // ----- Flight in open space: steer toward a target, keep apart, stay clear of ships and planets -----
  const desired = new THREE.Vector3(), away = new THREE.Vector3(), fwd = new THREE.Vector3(), prevFwd = new THREE.Vector3(), lookM = new THREE.Matrix4(), rollQ = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  function steer(f, target, speed) {
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
    if (ms) { const l = capsuleDist(f.pos); if (l < ms.D.R + 14) { tmp.copy(f.pos).sub(root.position).applyQuaternion(msQi); tmp.z -= clamp(tmp.z, -ms.D.L / 2, ms.D.L / 2); tmp.applyQuaternion(msQ).normalize(); desired.addScaledVector(tmp, (ms.D.R + 14 - l) * 2.5); } }
    f.steer.copy(desired);
  }
  function hardClear(f) {
    const push = (center, R) => { away.copy(f.pos).sub(center); const l = away.length(); if (l < R) f.pos.copy(center).addScaledVector(away.normalize(), R); };
    push(opts.shipPos, opts.shipRadius + 3);
    for (const pl of opts.planets()) push(pl.group.position, opts.clearance(pl) + 2);
    if (ms) { const l = capsuleDist(f.pos); if (l < ms.D.R) { tmp.copy(f.pos).sub(root.position).applyQuaternion(msQi); const cz = clamp(tmp.z, -ms.D.L / 2, ms.D.L / 2); tmp2.set(tmp.x, tmp.y, tmp.z - cz).setLength(ms.D.R); tmp2.z += cz; f.pos.copy(tmp2.applyQuaternion(msQ).add(root.position)); } }
  }
  function integrate(f, dt) {
    prevFwd.copy(f.vel).normalize();
    tmp.copy(f.steer).sub(f.vel); const A = 11 * dt; if (tmp.length() > A) tmp.setLength(A);
    f.vel.add(tmp);
    const sp = f.vel.length(); if (sp < 6) f.vel.setLength(6); if (sp > f.speed * 1.4) f.vel.setLength(f.speed * 1.4);
    f.pos.addScaledVector(f.vel, dt);
    hardClear(f);
    // Never closer than a few lengths to another fighter (wingmen fly a little closer, but never touch).
    for (const g of fighters) {
      if (g === f || isLocal(g)) continue;
      const min = (f.lead === g || g.lead === f) ? 3.5 : 6;
      away.copy(f.pos).sub(g.pos); const l = away.length();
      if (l < min) f.pos.addScaledVector(l > 1e-4 ? away.divideScalar(l) : away.set(0, 1, 0), min - l);
    }
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
        let target, speed = f.speed;
        if (f.state === 'patrol') {
          if (f.lead) { target = tmp2.set(4.5, 0, 3).applyQuaternion(f.lead.q).add(f.lead.pos).clone(); speed = f.lead.speed * 1.15; }
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
          target = toWorld(tmp2.set(D.xo - 70 - (f.id % 3) * 14, 16 + (f.id % 6) * 9, D.hz + ((f.id % 5) - 2) * 16), new THREE.Vector3()); speed = 9;
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
    if (fading) { fading.t -= dt / 2.5; fading.root.scale.setScalar(0.94 + 0.06 * fading.t); fading.setFade(Math.max(0, fading.t)); if (fading.t <= 0) { fading.root.visible = false; fading.setFade(1); fading.root.scale.setScalar(1); fading = null; } }
    if (!ms) { for (const k in inst) inst[k].count = 0; exhaust.geometry.setDrawRange(0, 0); navLights.geometry.setDrawRange(0, 0); people.visible = false; return; }
    if (transition < 1) { transition = Math.min(1, transition + dt / 3); ms.setFade(smooth(transition)); ms.root.scale.setScalar(0.9 + 0.1 * smooth(transition)); }
    moveStation(fdt);
    root.updateMatrixWorld();
    const camD = camera.position.distanceTo(root.position);
    toLocal(camera.position, camLocal);
    const nearBridge = camLocal.distanceTo(ms.D.bridge) < ms.D.L * 0.7;
    const nearHangar = camD < ms.D.L * 1.6;

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
    ms.animate(fdt, time, { doorWant: rolling && rolling.t < 4.8 ? 1 : 0, cameraNear: nearBridge, reduced });

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
    const l = capsuleDist(pos), R = ms.D.R + pad;
    if (l >= R) return;
    tmp.copy(pos).sub(root.position).applyQuaternion(msQi); const cz = clamp(tmp.z, -ms.D.L / 2, ms.D.L / 2);
    tmp2.set(tmp.x, tmp.y, tmp.z - cz); if (tmp2.lengthSq() < 1e-6) tmp2.set(0, 1, 0);
    tmp2.setLength(R); tmp2.z += cz; pos.copy(tmp2.applyQuaternion(msQ).add(root.position));
  }
  // Does the straight line a-b pass near the mothership?
  function blocks(a, b, margin) { if (!ms) return false; return segDist(a, b, root.position) < ms.D.L * 0.6 + margin; }
  // How close the camera may come in a direction (fleet space), so it never goes inside the hull.
  function minDist(dirWorld) { if (!ms) return 10; const d = tmp.copy(dirWorld).applyQuaternion(msQi), [rx, ry, rz] = ms.D.ex; return 1 / Math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2 + (d.z / rz) ** 2); }
  function info() {
    const active = fund.total ? Math.min(MAX_ACTIVE, fund.total) : 0;
    return { has: fund.has, amount: fund.amount, months: fund.months, unit: fund.unit, tier: tierKey, label: tierKey ? TIERS[tierKey].label : null,
      total: fund.total, active, reserve: Math.max(0, fund.total - active), moving: !!station.move };
  }
  const debug = {
    relocate: () => pickStation(station.pos.clone()), fighters, station, cells, get ms() { return ms; },
    roll: (n = 1) => { rollQueue += n; },
  };
  return { root, setFund, update, keepClear, blocks, minDist, info, debug, get present() { return !!ms; }, get size() { return ms?.D; }, get yaw() { return station.yaw; }, quaternion: msQ, toWorld };
}
