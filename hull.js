// The hull's shape: an angular body lofted through cross-sections ("stations") along the ship, in world units.
// The ship flies along -Z. Each station is a half profile (x >= 0) from the belly centre up to the roof centre:
// belly centre, belly edge, chine (the widest point, low down), skirt top, side, top of the windshield band,
// roof edge, roof centre. The lower hull is wide and flat; the nose is a pointed prow under a sloped cockpit canopy.
// Everything else (interior fit, things stuck on the hull) asks this file where the hull is.
import * as THREE from 'three';

const YC = -1.0; // the height sections are scaled around
const M = [[0, -3.45], [1.9, -3.45], [2.55, -2.75], [1.95, -2.2], [1.9, -0.35], [1.85, 0.8], [1.3, 1.4], [0, 1.4]];
// The back half is a later, bigger section: wider low down and raised into a hump over the workshop and engine room.
const M2 = [[0, -3.55], [2.0, -3.55], [2.7, -2.85], [2.05, -2.3], [2.0, -0.35], [2.0, 1.0], [1.45, 1.95], [0, 1.95]];
const grow = (p, k) => p.map(([x, y]) => [x * k, YC + (y - YC) * k]);
export const STATIONS = [
  { z: -9.0, p: [[0, -2.42], [0.1, -2.42], [0.2, -2.34], [0.2, -2.26], [0.16, -2.12], [0.12, -2.07], [0.06, -2.05], [0, -2.04]] },
  { z: -8.3, p: [[0, -2.62], [0.45, -2.62], [0.8, -2.38], [0.75, -2.12], [0.6, -1.78], [0.45, -1.64], [0.25, -1.56], [0, -1.53]] },
  { z: -7.5, p: [[0, -2.85], [0.95, -2.85], [1.42, -2.47], [1.25, -2.1], [1.05, -1.1], [0.8, -0.95], [0.5, -0.86], [0, -0.82]] },
  { z: -7.0, p: [[0, -3.02], [1.28, -3.02], [1.8, -2.55], [1.52, -2.12], [1.32, -0.62], [0.98, -0.42], [0.62, -0.32], [0, -0.28]] },
  { z: -6.5, p: [[0, -3.1], [1.45, -3.1], [2.0, -2.55], [1.7, -2.1], [1.6, -0.4], [1.35, 0.3], [0.9, 0.55], [0, 0.6]] },
  { z: -6.0, p: [[0, -3.35], [1.75, -3.35], [2.4, -2.7], [1.9, -2.2], [1.85, -0.35], [1.75, 0.75], [1.15, 1.25], [0, 1.25]] },
  { z: -5.6, p: M },
  { z: -4.9, p: M },
  { z: 1.5, p: M },
  { z: 1.62, p: M2 },             // a step up into the back section
  { z: 5.0, p: M2 },
  { z: 5.7, p: grow(M2, 0.95) },
  { z: 6.2, p: grow(M, 0.86) },   // the engine mount
];
export const Z_MIN = STATIONS[0].z, Z_MAX = STATIONS[STATIONS.length - 1].z, Y_MIN = -3.6, Y_MAX = 1.6;
// Windshield faces: [station interval, profile segment]. A wraparound band at cockpit eye height, plus the sloped front.
const GLASS = new Set(['3:4', '4:4', '5:4', '6:4', '3:5', '4:5', '3:6', '4:6']);

export function profileAt(z) {
  if (z < Z_MIN || z > Z_MAX) return null;
  let i = 0; while (i < STATIONS.length - 2 && STATIONS[i + 1].z < z) i++;
  const a = STATIONS[i], b = STATIONS[i + 1], t = (z - a.z) / (b.z - a.z);
  return a.p.map(([x, y], k) => [x + (b.p[k][0] - x) * t, y + (b.p[k][1] - y) * t]);
}
// Half width of the hull at height y and position z (0 outside it).
export function halfWidth(y, z) {
  const p = profileAt(z);
  if (!p || y < p[0][1] || y > p[7][1]) return 0;
  for (let k = 0; k < 7; k++) { const [x0, y0] = p[k], [x1, y1] = p[k + 1]; if (y1 > y0 && y >= y0 && y <= y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0); }
  return p[1][0];
}
// Height of the hull's upper surface above x (roof, shoulders, then the top of the skirt out to the chine).
export function topY(x, z) {
  const p = profileAt(z); if (!p) return null;
  x = Math.abs(x);
  for (let k = 7; k > 2; k--) { const [x0, y0] = p[k], [x1, y1] = p[k - 1]; if (x1 > x0 && x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return null;
}
export function bottomY(x, z) {
  const p = profileAt(z); if (!p) return null;
  x = Math.abs(x);
  if (x <= p[1][0]) return p[0][1];
  const [x0, y0] = p[1], [x1, y1] = p[2];
  return x <= x1 ? y0 + (y1 - y0) * (x - x0) / (x1 - x0) : null;
}
// The z range where the hull reaches height y (used to shape the decks).
export function zRange(y, minHalf = 0.2) {
  let z0 = null, z1 = null;
  for (let z = Z_MIN; z <= Z_MAX; z += 0.02) if (halfWidth(y, z) > minHalf) { if (z0 === null) z0 = z; z1 = z; }
  return [z0 ?? 0, z1 ?? 0];
}

const E = 0.01;
const sideNormal = (x, y, z) => new THREE.Vector3(Math.sign(x) || 1, -(halfWidth(y + E, z) - halfWidth(y - E, z)) / (2 * E), -(halfWidth(y, z + E) - halfWidth(y, z - E)) / (2 * E)).normalize();
// Put something on the hull's side (side -1 or 1) at height y, facing outward (+Z of the object), lifted a little.
export function onHull(obj, side, y, z, lift = 0) {
  const x = side * halfWidth(y, z), n = sideNormal(x, y, z);
  obj.position.set(x, y, z).addScaledVector(n, lift);
  obj.lookAt(obj.position.clone().add(n));
  return obj;
}
// On the upper surface above x, facing up and out.
export function onTop(obj, x, z, lift = 0) {
  const y = topY(x, z) ?? 0, s = Math.sign(x) || 1;
  const n = new THREE.Vector3(-(topY(x + E * s, z) - topY(x - E * s, z)) / (2 * E) * s, 1, -(topY(x, z + E) - topY(x, z - E)) / (2 * E)).normalize();
  obj.position.set(x, y, z).addScaledVector(n, lift);
  obj.lookAt(obj.position.clone().add(n));
  return obj;
}
// On the belly below x, facing down.
export function onBottom(obj, x, z, lift = 0) {
  const y = bottomY(x, z) ?? Y_MIN;
  obj.position.set(x, y - lift, z);
  obj.lookAt(obj.position.clone().add(new THREE.Vector3(0, -1, 0)));
  return obj;
}

// UVs: the canvas is split into the sides (by z and height), the roof and the belly (by z and x).
export const UV = {
  side: y => 0.35 + 0.65 * (y - Y_MIN) / (Y_MAX - Y_MIN),
  roof: x => 0.275 + 0.07 * x / 1.5,
  belly: x => 0.1 + 0.095 * x / 2.1,
  u: z => (z - Z_MIN) / (Z_MAX - Z_MIN),
};

// The lofted shell, split into the painted hull and the windshield glass. Faces are flat, for an angular, plated look.
export function hullGeometry() {
  const hull = { p: [], uv: [] }, glass = { p: [], uv: [] };
  const uvOf = (j, x, y, z) => [UV.u(z), j === 0 ? UV.belly(x) : j === 6 ? UV.roof(x) : UV.side(y)];
  const push = (g, j, pts) => { for (const [x, y, z] of pts) { g.p.push(x, y, z); g.uv.push(...uvOf(j, x, y, z)); } };
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const A = STATIONS[i], B = STATIONS[i + 1];
    for (let j = 0; j < 7; j++) for (const s of [-1, 1]) {
      const a0 = [s * A.p[j][0], A.p[j][1], A.z], a1 = [s * A.p[j + 1][0], A.p[j + 1][1], A.z];
      const b0 = [s * B.p[j][0], B.p[j][1], B.z], b1 = [s * B.p[j + 1][0], B.p[j + 1][1], B.z];
      const g = GLASS.has(i + ':' + j) ? glass : hull;
      // Wind every face outward.
      push(g, j, s > 0 ? [a0, b1, b0, a0, a1, b1] : [a0, b0, b1, a0, b1, a1]);
    }
  }
  // End caps: a fan from the middle of the first and last sections.
  for (const [st, front] of [[STATIONS[0], true], [STATIONS[STATIONS.length - 1], false]]) {
    const ring = [...st.p.map(([x, y]) => [x, y]), ...st.p.slice().reverse().map(([x, y]) => [-x, y])], c = [0, YC, st.z];
    for (let k = 0; k < ring.length - 1; k++) {
      const p = [ring[k][0], ring[k][1], st.z], q = [ring[k + 1][0], ring[k + 1][1], st.z];
      push(hull, 3, front ? [c, q, p] : [c, p, q]);
    }
  }
  const make = g => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2)); geo.computeVertexNormals(); return geo; };
  return { hull: make(hull), glass: make(glass), glassEdges: glassEdges() };
}
// The windshield frame: every edge of the glass faces, as line segments [a, b].
function glassEdges() {
  const seen = new Set(), out = [];
  const add = (a, b) => { const k = [a, b].map(v => v.map(n => n.toFixed(3)).join(',')).sort().join('|'); if (!seen.has(k)) { seen.add(k); out.push([a, b]); } };
  for (const key of GLASS) {
    const [i, j] = key.split(':').map(Number), A = STATIONS[i], B = STATIONS[i + 1];
    for (const s of [-1, 1]) {
      const a0 = [s * A.p[j][0], A.p[j][1], A.z], a1 = [s * A.p[j + 1][0], A.p[j + 1][1], A.z], b0 = [s * B.p[j][0], B.p[j][1], B.z], b1 = [s * B.p[j + 1][0], B.p[j + 1][1], B.z];
      add(a0, a1); add(b0, b1); add(a0, b0); add(a1, b1);
    }
  }
  return out;
}
