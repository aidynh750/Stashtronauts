// The pilot: an original, stylized person with normal human proportions (about six heads tall), built in meters.
// Separate parts (head, hair, face, outfit, accessory) so it can be customized later. Jointed shoulders, elbows,
// fingers, hips, knees and ankles let it sit, walk, climb and do everyday things aboard.
// The root sits at the feet and the character faces -Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HAIR_STYLES = ['crop', 'bob', 'curly', 'ponytail', 'bun', 'quiff', 'long'];
export const ACCESSORIES = ['none', 'headset', 'cap', 'goggles'];
export const MOODS = ['happy', 'worried', 'surprised', 'determined', 'sleepy'];
export const ANIMS = ['stand', 'walk', 'climb', 'sit', 'pilot', 'cook', 'eat', 'read', 'sleep', 'shower', 'garden', 'work', 'write', 'study', 'tidy', 'microscope', 'experiment', 'board'];
export const DEFAULT_LOOK = { skin: '#E3AD87', hair: '#4A2C20', hairStyle: 'quiff', eyes: '#3B2A1E', shirt: '#E9A93A', pants: '#3F6E8F',
  boots: '#5A3E2B', belt: '#4A3426', accessory: 'headset', accent: '#FF7A59' };

const PI = Math.PI;
export const HIP = 0.95;       // hip height standing (meters)
export const SEAT = 0.48;      // seat height the sitting poses expect
export const HEIGHT = 1.8;

const G = {
  ball: new THREE.SphereGeometry(1, 16, 12),
  smooth: new THREE.SphereGeometry(1, 28, 20),
  limb: (r0, r1, len, seg = 10) => new THREE.CylinderGeometry(r1, r0, len, seg, 1).translate(0, -len / 2, 0),
  box: (w, h, d, r = 0.008) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)),
};
const mats = new Map();
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra }));
  return mats.get(key);
}
const flat = color => { const k = 'flat' + color; if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color })); return mats.get(k); };
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getStyle();
function part(g, m, pos = [0, 0, 0], scale = 1, rot) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...pos);
  if (typeof scale === 'number') mesh.scale.setScalar(scale); else mesh.scale.set(...scale);
  if (rot) mesh.rotation.set(...rot);
  return mesh;
}
function joint(parent, pos) { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; }
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

// ---------- Hair: hundreds of thin tapered strands, merged into one mesh, over a scalp cap ----------
// Head-local space: the skull is centred at y 0.135, about 0.105 wide (radius) and 0.13 tall.
const SKULL = new THREE.Vector3(0, 0.14, 0.005), SR = new THREE.Vector3(0.112, 0.135, 0.12);
function makeHair(style, color) {
  const g = new THREE.Group(), m = mat(color, { roughness: 0.65, metalness: 0.05 }), dark = mat(shade(color, 0.75), { roughness: 0.8 });
  const rand = rng(style.length * 977 + 13), strands = [];
  const strandGeo = (len, r) => new THREE.CylinderGeometry(r * 0.25, r, len, 5, 1).translate(0, len / 2, 0);
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), s1 = new THREE.Vector3(1, 1, 1);
  // A strand rooted on the scalp at (theta from top, phi around; phi 0..PI is the back half), pointing along dir.
  function strand(theta, phi, dir, len, r = 0.009) {
    const n = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    const root = new THREE.Vector3(n.x * SR.x, n.y * SR.y, n.z * SR.z).add(SKULL).addScaledVector(n, -0.004);
    strands.push(strandGeo(len, r).applyMatrix4(m4.compose(root, q.setFromUnitVectors(up, dir.clone().normalize()), s1)));
  }
  const around = (theta, phi) => new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  const isFace = (theta, phi) => phi > PI * 1.2 && phi < PI * 1.8 && theta > PI * 0.3; // leave the face clear
  // The scalp cap, so there are no gaps between strands.
  g.add(part(new THREE.SphereGeometry(1, 18, 12, 0, PI * 2, 0, PI * 0.42), dark, SKULL.toArray(), [SR.x * 1.02, SR.y * 1.02, SR.z * 1.03]));
  g.add(part(new THREE.SphereGeometry(1, 18, 12, -0.12 * PI, 1.24 * PI, 0, PI * (style === 'crop' || style === 'quiff' ? 0.62 : 0.72)), dark, SKULL.toArray(), [SR.x * 1.03, SR.y * 1.03, SR.z * 1.03]));
  const count = style === 'curly' ? 420 : 300;
  for (let i = 0; i < count; i++) {
    const theta = Math.acos(1 - rand() * (style === 'long' || style === 'bob' ? 1.45 : 1.25)), phi = rand() * PI * 2;
    if (isFace(theta, phi)) continue;
    const n = around(theta, phi), back = new THREE.Vector3(0, -0.4, 0.6), jitter = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.5);
    let dir, len, r = 0.008 + rand() * 0.004;
    if (style === 'crop') { dir = n.clone().add(back.clone().multiplyScalar(0.8)).add(jitter); len = 0.03 + rand() * 0.02; }
    else if (style === 'quiff') {
      const front = phi > PI && theta < 0.5 * PI;
      dir = front ? n.clone().add(new THREE.Vector3(0, 1.1, 0.35)).add(jitter.multiplyScalar(0.5)) : n.clone().add(back).add(jitter);
      len = front ? 0.06 + rand() * 0.04 : 0.035 + rand() * 0.02;
    } else if (style === 'bob') { dir = n.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, -1, 0)).add(jitter.multiplyScalar(0.4)); len = 0.07 + theta * 0.06; r *= 1.2; }
    else if (style === 'long') { dir = n.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, -1, 0.15)).add(jitter.multiplyScalar(0.3)); len = 0.12 + theta * 0.18 + rand() * 0.05; r *= 1.2; }
    else if (style === 'curly') { dir = n.clone().add(jitter.multiplyScalar(2)); len = 0.025 + rand() * 0.03; r *= 1.5; }
    else { dir = n.clone().multiplyScalar(0.25).add(new THREE.Vector3(0, -0.2, 1)).add(jitter.multiplyScalar(0.3)); len = 0.05 + rand() * 0.03; } // swept back for ponytail and bun
    strand(theta, phi, dir, len, r);
  }
  if (style === 'ponytail' || style === 'bun') {
    const tie = new THREE.Vector3(0, style === 'bun' ? 0.25 : 0.16, 0.12);
    g.add(part(new THREE.TorusGeometry(0.022, 0.008, 6, 12), mat('#FF7A59'), tie.toArray(), 1, [style === 'bun' ? 1.2 : 0.4, 0, 0]));
    for (let i = 0; i < 70; i++) {
      const a = rand() * PI * 2, rr = rand() * 0.02, root = tie.clone().add(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.01));
      if (style === 'bun') { const d = new THREE.Vector3(rand() - 0.5, rand() - 0.2, rand() - 0.5); strands.push(strandGeo(0.05, 0.012).applyMatrix4(m4.compose(root, q.setFromUnitVectors(up, d.normalize()), s1))); }
      else { const d = new THREE.Vector3((rand() - 0.5) * 0.3, -1, 0.35 + rand() * 0.2); strands.push(strandGeo(0.14 + rand() * 0.06, 0.011).applyMatrix4(m4.compose(root, q.setFromUnitVectors(up, d.normalize()), s1))); }
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(strands.map(s => s.toNonIndexed())), m));
  strands.forEach(s => s.dispose());
  return g;
}

// ---------- Accessories ----------
function makeAccessory(kind, accent) {
  const g = new THREE.Group(), dark = mat('#2B3550', { roughness: 0.5 });
  if (kind === 'headset') {
    g.add(part(new THREE.TorusGeometry(0.135, 0.009, 6, 24, PI), dark, [0, 0.145, 0.01]));
    for (const s of [-1, 1]) {
      g.add(part(new THREE.CylinderGeometry(0.036, 0.036, 0.026, 16), mat(accent, { roughness: 0.5 }), [s * 0.124, 0.13, 0.005], 1, [0, 0, PI / 2]));
      g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), dark, [s * 0.11, 0.13, 0.005], 1, [0, 0, PI / 2]));
    }
    g.add(part(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6), dark, [-0.1, 0.075, -0.06], 1, [0.95, 0.45, 0.2]));
    g.add(part(G.ball, dark, [-0.065, 0.055, -0.108], 0.011));
  }
  if (kind === 'cap') {
    g.add(part(new THREE.SphereGeometry(1, 20, 12, 0, PI * 2, 0, PI * 0.45), mat(accent), SKULL.toArray(), [0.125, 0.14, 0.13]));
    g.add(part(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16, 1, false, PI / 2, PI), mat(accent), [0, 0.2, -0.1], 1, [-0.2, 0, 0]));
  }
  if (kind === 'goggles') {
    g.add(part(new THREE.TorusGeometry(0.124, 0.01, 6, 24), dark, [0, 0.22, 0], 1, [PI / 2 - 0.1, 0, 0]));
    for (const s of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), mat('#FFB547', { roughness: 0.2, emissive: '#FF9A3D', emissiveIntensity: 0.2 }), [s * 0.045, 0.235, -0.11], 1, [PI / 2 - 0.4, 0, 0]));
  }
  return g;
}

// ---------- Hands: palm, four two-part fingers with nails, and a thumb. curl() bends the fingers. ----------
function makeHand(skin, side) {
  const hand = new THREE.Group(), segs = [], nail = mat('#F1C9B4', { roughness: 0.3 });
  hand.add(part(G.box(0.068, 0.072, 0.026, 0.011), skin, [0, -0.036, 0]));
  for (let i = 0; i < 4; i++) {
    const len = 0.04 - Math.abs(i - 1.5) * 0.005;
    const a = joint(hand, [-0.025 + i * 0.0167, -0.072, 0]);
    a.add(part(G.box(0.0135, len * 0.55, 0.015, 0.006), skin, [0, -len * 0.26, 0]));
    const b = joint(a, [0, -len * 0.55, 0]);
    b.add(part(G.box(0.0125, len * 0.48, 0.014, 0.006), skin, [0, -len * 0.22, 0]));
    b.add(part(G.box(0.009, 0.011, 0.003, 0.002), nail, [0, -len * 0.36, 0.0075]));
    segs.push(a, b);
  }
  const thumb = joint(hand, [side * 0.033, -0.028, -0.008]);
  thumb.add(part(G.box(0.016, 0.036, 0.017, 0.007), skin, [0, -0.016, 0]));
  const tip = joint(thumb, [0, -0.034, 0]);
  tip.add(part(G.box(0.015, 0.024, 0.016, 0.006), skin, [0, -0.011, 0]), part(G.box(0.01, 0.01, 0.003, 0.002), nail, [0, -0.017, 0.009]));
  thumb.rotation.set(-0.35, 0, side * 0.55);
  return { hand, curl(k) { segs.forEach((s, i) => { s.rotation.x = k * (i % 2 ? 1.1 : 0.9); }); thumb.rotation.x = -0.35 - k * 0.6; tip.rotation.x = k * 0.5; } };
}

// ---------- Moods ----------
// brow: inner end up when positive. browY: brow height above the eyes. eyeOpen: how far the lids are open. mouth: shape.
const MOOD = {
  happy: { brow: 0.15, browY: 0.033, eyeOpen: 0.85, mouth: 'smile' },
  worried: { brow: 0.45, browY: 0.038, eyeOpen: 1, mouth: 'frown' },
  surprised: { brow: 0, browY: 0.046, eyeOpen: 1.15, mouth: 'o' },
  determined: { brow: -0.4, browY: 0.026, eyeOpen: 0.7, mouth: 'line' },
  sleepy: { brow: -0.1, browY: 0.027, eyeOpen: 0.3, mouth: 'sleepy' },
};

// ---------- Poses ----------
// Arms are [forward swing, outward spread, elbow bend]; legs are [thigh, knee] (knee bends negative).
// tx<0 leans forward, hx<0 looks down, hipY raises or drops the body, hipX shifts the weight side to side.
const SITTING = { hipY: -(HIP - SEAT), hipZ: 0.04, tx: 0.05, lL: [1.5, -1.45], lR: [1.45, -1.4] };
const STANDING = { tx: 0.03, hx: -0.04 }; // chest up, chin slightly down: a relaxed upright posture
const POSES = {
  stand: t => ({ ...STANDING, hipX: Math.sin(t * 0.6) * 0.018, lL: [0.02, -0.03], lR: [-0.03, -0.12], aL: [0.04, 0.09, 0.18], aR: [0.06, 0.09, 0.25], curl: 0.35 }),
  walk: (t, o) => {
    const p = t * o.stride, s = Math.sin(p), c = Math.cos(p), s2 = Math.sin(2 * p);
    return {
      tx: -0.04, hx: -0.02,
      hipY: -0.018 + 0.018 * Math.cos(2 * p), hipX: s * 0.022, hipRy: s * 0.09, tRy: -s * 0.13, tz: -s * 0.025,
      lL: [s * 0.48, -0.08 - Math.max(0, -c) * 0.85], lR: [-s * 0.48, -0.08 - Math.max(0, c) * 0.85],
      aL: [-s * 0.42, 0.11, 0.3 + Math.max(0, -s) * 0.35], aR: [s * 0.42, 0.11, 0.3 + Math.max(0, s) * 0.35], curl: 0.4, bob: s2,
    };
  },
  climb: t => {
    const s = Math.sin(t * 5);
    return { lL: [0.75 + s * 0.4, -1.2], lR: [0.75 - s * 0.4, -1.2], aL: [2.75 + s * 0.2, 0.25, 0.35 - s * 0.2], aR: [2.75 - s * 0.2, 0.25, 0.35 + s * 0.2], hx: 0.3, tx: -0.08, curl: 0.9 };
  },
  sit: () => ({ ...SITTING, aL: [0.35, 0.1, 0.9], aR: [0.35, 0.1, 0.9], curl: 0.35 }),
  pilot: (t, o) => ({ ...SITTING, aL: [0.75, 0.12, 0.85], aR: [0.75, 0.12, 0.85], curl: 0.85,
    tz: Math.max(-1, Math.min(1, o.turn)) * 0.12, hy: o.turn * 0.55, tx: -0.05 - Math.min(0.15, Math.max(0, o.accel) * 0.01) }),
  cook: t => ({ ...STANDING, hipX: Math.sin(t * 0.9) * 0.015, aL: [0.75, 0.05, 1.2], aR: [0.95 + Math.sin(t * 5) * 0.1, 0.05 + Math.cos(t * 5) * 0.12, 1.1], hx: -0.35, tx: -0.12, curl: 0.8, lL: [0.02, -0.05], lR: [-0.04, -0.12] }),
  eat: t => {
    const bite = Math.max(0, Math.sin(t * 2.0)) ** 2;
    return { ...SITTING, aL: [0.55, 0.1, 1.1], aR: [0.6 + bite * 0.4, 0.15, 1.0 + bite * 1.2], hx: -0.2 + bite * 0.12, tx: -0.08, curl: 0.7 };
  },
  read: t => ({ ...SITTING, aL: [0.55, -0.25, 1.65], aR: [0.55, -0.25, 1.65], hx: -0.4, hy: Math.sin(t * 0.6) * 0.1, tx: 0.1, curl: 0.6 }),
  sleep: () => ({ lie: 1, aL: [0.15, 0.15, 0.4], aR: [0.1, 0.1, 0.3], hy: 0.4, lL: [0.1, -0.15], lR: [0.05, -0.05], curl: 0.4 }),
  shower: t => { const s = Math.sin(t * 4); return { ...STANDING, aL: [2.5 + s * 0.15, 0.45, 1.7], aR: [2.5 - s * 0.15, 0.45, 1.75], hx: 0.25, curl: 0.5, hipX: s * 0.01 }; },
  garden: t => ({ tx: -0.35, hx: -0.4, lL: [0.25, -0.35], lR: [0.15, -0.3], hipY: -0.04, aL: [0.95, 0.1, 0.6], aR: [1.05 + Math.sin(t * 1.5) * 0.12, 0.05, 0.5 + Math.sin(t * 1.5) * 0.15], curl: 0.7 }),
  work: t => { const hit = Math.max(0, Math.sin(t * 6)) ** 3; return { ...STANDING, tx: -0.2, hx: -0.45, aL: [0.85, 0.15, 1.1], aR: [1.25 + hit * 0.45, 0.05, 1.3 - hit * 0.5], curl: 0.85, lL: [0.05, -0.08], lR: [-0.05, -0.12] }; },
  write: t => ({ ...SITTING, tx: -0.15, hx: -0.4, aL: [0.65, 0.18, 1.35], aR: [0.72 + Math.sin(t * 7) * 0.03, 0.1, 1.25 + Math.sin(t * 9) * 0.04], curl: 0.75 }),
  study: t => ({ tx: -0.32, hx: -0.55, aL: [0.75, 0.3, 0.25], aR: [0.75, 0.3, 0.25 + Math.max(0, Math.sin(t * 0.8)) * 0.6], curl: 0.2, lL: [0.1, -0.05], lR: [-0.1, -0.05], hy: Math.sin(t * 0.5) * 0.2 }),
  microscope: t => ({ ...STANDING, tx: -0.42, hx: -0.5, hy: Math.sin(t * 0.3) * 0.04, aL: [0.95, 0.2, 1.2], aR: [0.9, 0.25, 1.35 + Math.sin(t * 1.3) * 0.08], curl: 0.6, lL: [0.04, -0.06], lR: [-0.06, -0.12] }),
  experiment: t => { const s = Math.sin(t * 1.4); return { ...STANDING, tx: -0.18, hx: -0.4 + s * 0.08, hy: s * 0.25, hipX: s * 0.02, aL: [0.9 + s * 0.15, 0.15, 1.15], aR: [1.0 - s * 0.15, 0.1 + s * 0.08, 1.05], curl: 0.75, lL: [0.03, -0.05], lR: [-0.05, -0.1] }; },
  board: t => { const w = Math.sin(t * 5), pause = Math.sin(t * 0.7) > 0.4 ? 0 : 1; return { ...STANDING, hx: 0.12 - pause * 0.05, hy: Math.sin(t * 0.35) * 0.15, tRy: 0.08, aR: [1.9 + w * 0.06 * pause, 0.25 + Math.cos(t * 4) * 0.08 * pause, 0.75], aL: [0.15, 0.12, 0.6], curl: 0.8, lL: [0.02, -0.03], lR: [-0.03, -0.1] }; },
  tidy: t => { const lift = (Math.sin(t * 1.6) + 1) / 2; return { hipY: -0.32 * (1 - lift), tx: -0.5 + lift * 0.35, hx: -0.3, lL: [1.05 * (1 - lift) + 0.1, -1.6 * (1 - lift) - 0.1], lR: [0.95 * (1 - lift) + 0.05, -1.5 * (1 - lift) - 0.1], aL: [0.9 + lift * 0.3, 0.2, 0.5 + lift * 0.8], aR: [0.9 + lift * 0.3, 0.2, 0.5 + lift * 0.8], curl: 0.9 }; },
};
const ZERO = { tx: 0, tz: 0, tRy: 0, hx: 0, hy: 0, hz: 0, hipY: 0, hipX: 0, hipZ: 0, hipRy: 0, lie: 0, curl: 0, bob: 0,
  aL: [0, 0, 0], aR: [0, 0, 0], lL: [0, 0], lR: [0, 0] };

export function makePilot(look = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  // Skin is smooth-shaded with a little warmth; clothes are soft fabric with darker seams and creases.
  const skin = mat(L.skin, { roughness: 0.62, emissive: L.skin, emissiveIntensity: 0.06 });
  const skinShadow = mat(shade(L.skin, 0.86), { roughness: 0.65 }), lipMat = mat('#C47A6E', { roughness: 0.45 });
  const shirt = mat(L.shirt), shirtDark = mat(shade(L.shirt, 0.72)), pants = mat(L.pants), pantsDark = mat(shade(L.pants, 0.72));
  const boot = mat(L.boots, { roughness: 0.6 }), sole = mat('#2A211C', { roughness: 0.9 }), metal = mat('#D9B65C', { metalness: 0.6, roughness: 0.35 });
  const group = new THREE.Group();
  const posture = joint(group, [0, 0, 0]);
  const hips = joint(posture, [0, HIP, 0]);

  // Pelvis, belt with loops and buckle, back pockets.
  hips.add(part(G.smooth, pants, [0, -0.03, 0], [0.155, 0.11, 0.105]));
  hips.add(part(new THREE.CylinderGeometry(0.158, 0.158, 0.045, 20), mat(L.belt, { roughness: 0.5 }), [0, 0.065, 0], [1, 1, 0.7]));
  hips.add(part(G.box(0.05, 0.038, 0.012, 0.004), metal, [0, 0.065, -0.112]));
  for (const x of [-0.1, -0.05, 0.05, 0.1]) hips.add(part(G.box(0.012, 0.05, 0.006, 0.002), pantsDark, [x, 0.065, -0.108 + Math.abs(x) * 0.2]));
  for (const s of [-1, 1]) hips.add(part(G.box(0.07, 0.07, 0.008, 0.004), pantsDark, [s * 0.07, -0.02, 0.105]));
  // Legs: thigh with a side pocket and seam, knee crease, shin, and sturdy laced boots.
  const legs = [-1, 1].map(s => {
    const thigh = joint(hips, [s * 0.085, -0.04, 0]);
    thigh.add(part(G.limb(0.078, 0.06, 0.44), pants));
    thigh.add(part(G.box(0.07, 0.08, 0.016, 0.006), pantsDark, [s * 0.062, -0.2, 0], 1, [0, s * PI / 2, 0]));
    thigh.add(part(G.box(0.004, 0.42, 0.006, 0.002), pantsDark, [s * 0.071, -0.22, 0]));                   // outer seam
    thigh.add(part(new THREE.TorusGeometry(0.058, 0.008, 6, 14), pantsDark, [0, -0.42, -0.01], 1, [PI / 2, 0, 0])); // knee crease
    const shin = joint(thigh, [0, -0.44, 0]);
    shin.add(part(G.limb(0.058, 0.046, 0.32), pants));
    shin.add(part(G.limb(0.062, 0.058, 0.13, 12), boot, [0, -0.3, 0]));                                    // boot shaft
    shin.add(part(new THREE.TorusGeometry(0.063, 0.01, 6, 14), pantsDark, [0, -0.3, 0], 1, [PI / 2, 0, 0])); // trouser cuff
    const foot = joint(shin, [0, -0.43, 0]);
    foot.add(part(G.box(0.105, 0.085, 0.25, 0.035), boot, [0, -0.03, -0.045]));
    foot.add(part(G.box(0.11, 0.028, 0.265, 0.01), sole, [0, -0.072, -0.045]));
    foot.add(part(G.box(0.1, 0.04, 0.06, 0.018), mat(shade(L.boots, 0.8)), [0, -0.035, -0.15]));          // toe cap
    for (let i = 0; i < 3; i++) foot.add(part(G.box(0.05, 0.005, 0.006, 0.002), mat('#E8DCC8'), [0, 0.005 - i * 0.018, -0.06 - i * 0.02], 1, [0.8, 0, 0])); // laces
    return { thigh, shin, foot };
  });

  // Torso: shirt with side seams, a buttoned placket, chest pocket with flap, collar, and creases.
  const torso = joint(hips, [0, 0.08, 0]);
  const chest = new THREE.CylinderGeometry(1, 0.82, 1, 20, 1);
  torso.add(part(chest, shirt, [0, 0.21, 0], [0.19, 0.44, 0.122]));
  torso.add(part(G.smooth, shirt, [0, 0.4, 0], [0.205, 0.06, 0.125]));                                    // shoulders
  for (const s of [-1, 1]) torso.add(part(G.box(0.004, 0.42, 0.01, 0.002), shirtDark, [s * 0.172, 0.21, 0]));
  torso.add(part(G.box(0.012, 0.36, 0.006, 0.003), shirtDark, [0, 0.22, -0.118]));
  for (let i = 0; i < 4; i++) torso.add(part(G.ball, mat('#F3EADB'), [0, 0.08 + i * 0.085, -0.122], [0.007, 0.007, 0.003]));
  torso.add(part(G.box(0.07, 0.07, 0.01, 0.005), shirtDark, [0.075, 0.3, -0.118]));
  torso.add(part(G.box(0.074, 0.022, 0.014, 0.005), shirt, [0.075, 0.34, -0.121]));                       // pocket flap
  torso.add(part(G.ball, mat(L.accent), [-0.08, 0.32, -0.12], [0.018, 0.018, 0.006]));                   // mission badge
  for (const [x, y, r] of [[-0.07, 0.13, 0.4], [0.06, 0.1, -0.35], [-0.04, 0.05, 0.2]]) torso.add(part(G.box(0.07, 0.004, 0.006, 0.002), shirtDark, [x, y, -0.117], 1, [0, 0, r]));
  for (const s of [-1, 1]) torso.add(part(G.box(0.075, 0.012, 0.055, 0.004), shirt, [s * 0.045, 0.465, -0.05], 1, [0.5, s * 0.25, s * 0.55])); // collar points
  torso.add(part(new THREE.TorusGeometry(0.058, 0.014, 8, 18), shirt, [0, 0.47, 0], 1, [PI / 2, 0, 0]));
  torso.add(part(new THREE.CylinderGeometry(0.046, 0.05, 0.09, 14), skin, [0, 0.5, 0]));                // neck

  // Arms: shoulder, rolled sleeve with cuff, elbow crease, forearm, wrist, hand.
  const arms = [-1, 1].map(s => {
    const shoulder = joint(torso, [s * 0.2, 0.4, 0]);
    shoulder.add(part(G.smooth, shirt, [0, -0.01, 0], 0.058));
    shoulder.add(part(G.limb(0.054, 0.046, 0.25), shirt));
    shoulder.add(part(new THREE.TorusGeometry(0.047, 0.012, 6, 14), shirtDark, [0, -0.25, 0], 1, [PI / 2, 0, 0])); // sleeve cuff
    const elbow = joint(shoulder, [0, -0.29, 0]);
    shoulder.add(part(G.limb(0.044, 0.04, 0.05), skin, [0, -0.25, 0]));
    elbow.add(part(G.smooth, skinShadow, [0, 0, 0.005], 0.041));                                           // elbow
    elbow.add(part(G.limb(0.04, 0.03, 0.25), skin));
    const wrist = joint(elbow, [0, -0.25, 0]);
    wrist.add(part(G.limb(0.031, 0.031, 0.02), mat('#3A3F4A', { metalness: 0.3 }), [0, 0.0, 0]));          // wristwatch
    const h = makeHand(skin, s); wrist.add(h.hand);
    return { shoulder, elbow, wrist, hand: h };
  });

  // Head: skull and jaw (smooth), brow ridge, nose with bridge and nostrils, ears with inner folds, eyes with lids.
  const head = joint(torso, [0, 0.53, 0]);
  head.add(part(G.smooth, skin, [0, 0.14, 0], [0.104, 0.128, 0.114]));
  head.add(part(G.smooth, skin, [0, 0.075, -0.016], [0.083, 0.074, 0.094]));                            // jaw and cheeks
  head.add(part(G.smooth, skin, [0, 0.03, -0.06], [0.04, 0.03, 0.045]));                                // chin
  head.add(part(G.box(0.1, 0.018, 0.03, 0.009), skin, [0, 0.172, -0.098], 1, [-0.15, 0, 0]));            // brow ridge
  head.add(part(G.box(0.018, 0.05, 0.022, 0.008), skin, [0, 0.135, -0.112], 1, [-0.2, 0, 0]));          // nose bridge
  head.add(part(G.smooth, skin, [0, 0.107, -0.125], [0.019, 0.016, 0.02]));                             // nose tip
  for (const s of [-1, 1]) {
    head.add(part(G.smooth, skin, [s * 0.012, 0.102, -0.118], [0.011, 0.009, 0.011]));                  // nostril wings
    head.add(part(G.ball, flat('#5A3428'), [s * 0.008, 0.096, -0.124], [0.004, 0.003, 0.003]));          // nostrils
    head.add(part(G.smooth, skin, [s * 0.104, 0.13, 0.008], [0.013, 0.03, 0.022]));                     // ear
    head.add(part(G.smooth, skinShadow, [s * 0.11, 0.13, 0.006], [0.006, 0.02, 0.013]));                // ear fold
  }
  const eyes = [], pupils = [], lids = [];
  for (const s of [-1, 1]) {
    const eye = joint(head, [s * 0.041, 0.147, -0.1]);
    eye.add(part(G.smooth, flat('#F7F3EE'), [0, 0, 0], [0.019, 0.013, 0.008]));
    const pupil = joint(eye, [0, 0, -0.006]);
    pupil.add(part(G.ball, flat(L.eyes), [0, -0.001, 0], [0.0095, 0.0095, 0.003]));
    pupil.add(part(G.ball, flat('#14100E'), [0, -0.001, -0.002], [0.005, 0.005, 0.002]));
    pupil.add(part(G.ball, flat('#FFFFFF'), [-0.003, 0.003, -0.003], 0.0022));
    // Upper eyelid with lashes: it slides down over the eye to blink and to show sleepy or determined looks.
    const lid = joint(eye, [0, 0.013, -0.002]);
    lid.add(part(G.smooth, skin, [0, -0.0, 0], [0.021, 0.012, 0.0095]));
    lid.add(part(G.box(0.036, 0.0025, 0.004, 0.001), flat('#2A1C16'), [0, -0.011, -0.007]));
    eye.add(part(G.box(0.03, 0.002, 0.003, 0.001), skinShadow, [0, -0.014, -0.006]));                   // lower lid line
    eyes.push(eye); pupils.push(pupil); lids.push(lid);
  }
  const brows = [-1, 1].map(s => { const b = part(G.box(0.036, 0.007, 0.008, 0.003), flat(shade(L.hair, 0.8)), [s * 0.043, 0.18, -0.112]); b.userData.side = s; head.add(b); return b; });
  // Lips: an upper and lower lip that change shape with the mood, plus a dark mouth line.
  const mouth = joint(head, [0, 0.074, -0.104]);
  const upperLip = part(G.smooth, lipMat, [0, 0.006, 0], [0.021, 0.0055, 0.008]);
  const lowerLip = part(G.smooth, lipMat, [0, -0.006, 0.001], [0.019, 0.0065, 0.008]);
  const line = part(new THREE.TorusGeometry(0.019, 0.0028, 5, 14, PI).rotateZ(PI), flat('#5A2A26'), [0, 0, -0.006]);
  const open = part(G.ball, flat('#4A1E1E'), [0, -0.002, -0.004], [0.011, 0.013, 0.004]);
  mouth.add(upperLip, lowerLip, line, open);
  head.add(makeHair(L.hairStyle, L.hair), makeAccessory(L.accessory, L.accent));

  // A book to hold while reading.
  const book = new THREE.Group();
  book.add(part(G.box(0.2, 0.15, 0.022, 0.004), mat('#3FA7B5'), [0, 0, 0]), part(G.box(0.19, 0.14, 0.024, 0.003), mat('#FFF6E4'), [0, 0, -0.003]));
  book.position.set(0, 0.25, -0.3); book.rotation.x = -0.6; book.visible = false;
  torso.add(book);

  // ---------- Life ----------
  let override = null, blinkIn = 2 + Math.random() * 3, blink = 0, t = 0, animT = 0, lastAnim = 'pilot';
  const cur = { ...MOOD.happy, name: 'happy' }, pose = structuredClone(ZERO);
  const ease = (a, b, k) => a + (b - a) * k;
  function setMouth(name) {
    const smile = name === 'smile', o = name === 'o', frown = name === 'frown';
    line.visible = !o;
    line.rotation.z = frown ? PI : 0;
    line.scale.set(name === 'line' ? 1.1 : name === 'sleepy' ? 0.5 : 1, smile ? 1 : 0.35, 1);
    line.position.y = frown ? -0.008 : 0;
    open.visible = o;
    upperLip.position.y = o ? 0.012 : 0.006; lowerLip.position.y = o ? -0.014 : smile ? -0.008 : -0.006;
  }

  return {
    group, head, torso, look: L,
    get mood() { return override || cur.name; },
    // Set a mood from code: setMood('worried'). setMood(null) goes back to automatic.
    setMood(m) { override = MOODS.includes(m) ? m : null; },
    update(dt, { anim = 'pilot', mood = 'happy', turn = 0, accel = 0, stride = 6.5, reduced = false } = {}) {
      t += dt;
      if (anim !== lastAnim) { animT = 0; lastAnim = anim; }
      animT += dt;
      const name = override || mood, want = MOOD[name], k = 1 - Math.exp(-dt * 10);
      cur.name = name;
      cur.brow = ease(cur.brow, want.brow, k); cur.browY = ease(cur.browY, want.browY, k); cur.eyeOpen = ease(cur.eyeOpen, want.eyeOpen, k);
      setMouth(want.mouth);
      for (const b of brows) { b.rotation.z = cur.brow * -b.userData.side; b.position.y = 0.147 + cur.browY; }
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.13; blinkIn = 2.2 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt);
      const closed = anim === 'sleep' || blink > 0 ? 1 : 1 - Math.min(1, cur.eyeOpen);
      for (const lid of lids) { lid.position.y = 0.013 - closed * 0.013; lid.scale.y = 0.6 + closed * 0.6; }
      for (const e of eyes) e.scale.y = Math.min(1.12, Math.max(0.9, cur.eyeOpen));
      for (const p of pupils) p.position.x = ease(p.position.x, -Math.max(-1, Math.min(1, turn)) * 0.006, k);

      const target = { ...ZERO, ...POSES[anim](reduced ? 0 : animT, { turn, accel, stride }) };
      const pk = reduced ? 1 : 1 - Math.exp(-dt * 8);
      for (const key of Object.keys(ZERO)) {
        if (Array.isArray(ZERO[key])) pose[key] = pose[key].map((v, i) => ease(v, target[key][i], pk));
        else pose[key] = ease(pose[key], target[key], pk);
      }
      const breath = reduced || anim === 'walk' || anim === 'climb' ? 0 : Math.sin(t * (anim === 'sleep' ? 1.1 : 1.7)) * 0.01;

      posture.rotation.x = pose.lie * PI / 2;
      hips.position.set(pose.hipX, HIP + pose.hipY, pose.hipZ);
      hips.rotation.set(0, pose.hipRy, -pose.hipX * 1.5);       // the pelvis tilts a little with the weight shift
      torso.rotation.set(pose.tx, pose.tRy, pose.tz + pose.hipX * 1.2);
      torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath);
      head.rotation.set(pose.hx - (name === 'sleepy' && anim !== 'sleep' ? 0.2 : 0), pose.hy - pose.tRy * 0.6, pose.hz - pose.hipX * 0.8 + (name === 'sleepy' ? 0.1 : 0));
      arms.forEach((a, i) => {
        const p = i ? pose.aR : pose.aL, s = i ? 1 : -1;
        a.shoulder.rotation.set(p[0], 0, s * p[1]); a.elbow.rotation.x = p[2]; a.hand.curl(pose.curl);
        a.wrist.rotation.x = -p[2] * 0.15;
      });
      legs.forEach((l, i) => {
        const p = i ? pose.lR : pose.lL;
        l.thigh.rotation.x = p[0]; l.shin.rotation.x = p[1];
        l.foot.rotation.x = -(p[0] + p[1]) * (anim === 'walk' ? 0.75 : 0.95); // keep the soles flat, rolling a little while walking
      });
      book.visible = anim === 'read';
    },
  };
}
