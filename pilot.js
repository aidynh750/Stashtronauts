// The pilot: an original, stylized cartoon astronaut (not photoreal), built in meters. About 1.78 m and six heads tall:
// an egg-shaped head on a visible neck, sloping shoulders about two head-widths wide, a tapered torso, arms that reach
// mid-thigh, legs about half the height, and chunky gloves and boots. Smooth tapered limbs hang on a joint hierarchy
// (hips, spine, neck, shoulders, elbows, wrists, two-part fingers, knees, ankles), with rounded caps at every joint so
// bends stay clean. Soft toon shading in simple colour areas; every texture is drawn in code (no image files).
// Face: big simple eyes (white, iris, pupil, highlight) with thick lids that blink, brows that move, a small nose, ears,
// and a mouth and blush painted on a thin face layer, one painting per mood. Hair is a few sculpted shells that follow the
// skull (six styles). The suit is a bright orange launch-style suit; the helmet goes on only for outside chores, and a suit
// hose plugs into the seat while flying. The root sits at the feet and the character faces -Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const HAIR_STYLES = ['crop', 'sidepart', 'ponytail', 'bun', 'curly', 'long'];
export const MOODS = ['happy', 'worried', 'surprised', 'determined', 'sleepy'];
export const ANIMS = ['stand', 'walk', 'climb', 'sit', 'pilot', 'cook', 'eat', 'read', 'sleep', 'shower', 'garden', 'work', 'write', 'study', 'tidy', 'microscope', 'experiment', 'board'];
export const DEFAULT_LOOK = { skin: '#EDB892', hair: '#4A2E22', hairStyle: 'sidepart', eyes: '#3D6F8F', suit: '#F2701E', name: 'K. ORLA', blush: 0.6 };

const PI = Math.PI;
export const HEIGHT = 1.78;
export const HIP = 0.9;        // hip joint height standing (meters); legs are about half the height
export const SEAT = 0.48;      // seat height the sitting poses expect
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Materials: soft toon shading (a few gentle steps of light), cached and shared ----------
// The steps are tuned for the ship's cabin, whose lamps are bright and close: much brighter and the orange washes out to yellow.
const GRAD = (() => {
  const d = new Uint8Array([46, 66, 86, 102, 114]), t = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();
const mats = new Map();
function toon(color, o = {}, key = '') {
  const k = 'T' + color + key;
  if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...o }));
  return mats.get(k);
}
const flat = color => { const k = 'F' + color; if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color })); return mats.get(k); };
const shade = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
function part(g, m, pos = [0, 0, 0], scale = 1, rot) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...pos);
  if (typeof scale === 'number') mesh.scale.setScalar(scale); else mesh.scale.set(...scale);
  if (rot) mesh.rotation.set(...rot);
  return mesh;
}
function joint(parent, pos) { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; }
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

// ---------- Geometry helpers ----------
const GEO = new Map();
const cached = (k, make) => { if (!GEO.has(k)) GEO.set(k, make()); return GEO.get(k); };
const BALL = cached('ball', () => new THREE.SphereGeometry(1, 20, 14));
// A smooth tapered limb hanging down from its joint: radius r0 at the top, r1 at the bottom, rounded at both ends.
function limb(r0, r1, len, seg = 18) {
  return cached(`limb${r0}|${r1}|${len}`, () => {
    const pts = [], n = 6;
    for (let i = 0; i <= n; i++) { const a = PI / 2 - (i / n) * PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
    for (let i = 1; i <= n; i++) { const a = -(i / n) * PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1)); }
    pts.unshift(new THREE.Vector2(0, r0)); pts.push(new THREE.Vector2(0, -len - r1));
    return new THREE.LatheGeometry(pts.reverse(), seg);
  });
}
// A thin ring around a limb (bearings, glove rings, reflective bands).
const ring = (r, tube) => cached(`ring${r}|${tube}`, () => new THREE.TorusGeometry(r, tube, 8, 24).rotateX(PI / 2));
const band = (r, h) => cached(`band${r}|${h}`, () => new THREE.CylinderGeometry(r, r, h, 24, 1, true));
// A grid surface p = fn(u, v); `ref` is a point it should face away from (its normals point outward from it).
function surface(fn, nu, nv, ref, seamU = false) {
  const pos = [], uv = [], idx = [], p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  const mid = (Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2)), P = g.attributes.position, N = g.attributes.normal;
  const out = new THREE.Vector3(P.getX(mid), P.getY(mid), P.getZ(mid)).sub(ref);
  if (out.x * N.getX(mid) + out.y * N.getY(mid) + out.z * N.getZ(mid) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  if (seamU) for (let j = 0; j <= nv; j++) {   // weld the normals across the wrap-around seam
    const a = j * (nu + 1), b = a + nu, n = new THREE.Vector3(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize();
    N.setXYZ(a, n.x, n.y, n.z); N.setXYZ(b, n.x, n.y, n.z);
  }
  return g;
}

// ---------- The head: an egg, a little wider at the crown, narrowing to a soft jaw and chin ----------
// Head-local space: origin at the top of the neck. theta runs from the crown (0) to under the chin (PI); phi = PI is the face.
const HC = new THREE.Vector3(0, 0.145, 0), HA = 0.089, HB = 0.14, HD = 0.095;
function headPoint(theta, phi, out, inflate = 0) {
  const ct = Math.cos(theta), st = Math.sin(theta);
  const k = 1 + 0.06 * ct - 0.16 * Math.max(0, -ct) ** 2;
  const front = Math.max(0, -Math.cos(phi)), low = Math.max(0, -ct);
  out.set(st * Math.sin(phi) * HA * k, ct * HB, st * Math.cos(phi) * HD * k - 0.016 * front * low * low);
  if (inflate) { const l = out.length() || 1; out.multiplyScalar(1 + inflate / l); }
  return out.add(HC);
}
// The point on the face at (x, y), and the way out of the skin there.
function facePoint(x, y, inflate = 0) {
  const theta = Math.acos(clamp((y - HC.y) / HB, -1, 1)), st = Math.sin(theta), ct = Math.cos(theta);
  const k = 1 + 0.06 * ct - 0.16 * Math.max(0, -ct) ** 2, phi = PI - Math.asin(clamp(x / (HA * k * st), -1, 1));
  const p = headPoint(theta, phi, new THREE.Vector3()), n = p.clone().sub(HC);
  n.set(n.x / (HA * HA), n.y / (HB * HB), n.z / (HD * HD)).normalize();
  return { p: p.addScaledVector(n, inflate), n };
}

// ---------- Painted face: mouth shapes and blush, one canvas per mood ----------
// The face layer maps x -0.1..0.1 and y 0..0.28 (head-local) onto the canvas.
const FW = 512, FH = Math.round(512 * 0.28 / 0.2), FX = x => (x + 0.1) / 0.2 * FW, FY = y => (1 - y / 0.28) * FH;
function faceCanvas(mood, blush) {
  const c = document.createElement('canvas'); c.width = FW; c.height = FH;
  const g = c.getContext('2d'), mx = FX(0), my = FY(0.057), w = 0.016 * FW / 0.2;
  for (const s of [-1, 1]) {   // soft blush on the cheeks
    const cx = FX(s * 0.05), cy = FY(0.088), r = 0.024 * FW / 0.2, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const a = blush * (mood === 'happy' ? 0.42 : mood === 'surprised' ? 0.3 : 0.26);
    gr.addColorStop(0, `rgba(240,110,110,${a})`); gr.addColorStop(1, 'rgba(240,110,110,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#5E2A2E'; g.fillStyle = '#5E2A2E'; g.lineWidth = 7;
  if (mood === 'happy') {
    g.beginPath(); g.moveTo(mx - w, my - 4); g.quadraticCurveTo(mx, my + w * 1.25, mx + w, my - 4); g.quadraticCurveTo(mx, my + w * 0.35, mx - w, my - 4); g.fill(); g.stroke();
    g.fillStyle = '#E8707A'; g.beginPath(); g.ellipse(mx, my + w * 0.52, w * 0.42, w * 0.18, 0, 0, PI * 2); g.fill();
  } else if (mood === 'worried') {
    g.beginPath(); g.moveTo(mx - w * 0.8, my + 8); g.bezierCurveTo(mx - w * 0.4, my - 4, mx - w * 0.1, my + 6, mx, my + 1); g.bezierCurveTo(mx + w * 0.15, my - 4, mx + w * 0.45, my - 6, mx + w * 0.8, my + 8); g.stroke();
  } else if (mood === 'surprised') {
    g.beginPath(); g.ellipse(mx, my + 4, w * 0.42, w * 0.55, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#E8707A'; g.beginPath(); g.ellipse(mx, my + 4 + w * 0.28, w * 0.25, w * 0.14, 0, 0, PI * 2); g.fill();
  } else if (mood === 'determined') {
    g.beginPath(); g.moveTo(mx - w * 0.85, my + 3); g.quadraticCurveTo(mx, my - 1, mx + w * 0.85, my - 3); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(mx + w * 0.85, my - 3); g.lineTo(mx + w * 0.95, my - 9); g.stroke();
  } else {   // sleepy: a small, soft, slightly open mouth
    g.beginPath(); g.ellipse(mx, my + 3, w * 0.3, w * 0.2, 0, 0, PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- Suit fabric: orange with seams, a zipper line, soft creases and a little wear, drawn once ----------
let suitTex = null, plainTex = null;
function suitTexture(plain = false) {
  if (plain && plainTex) return plainTex;
  if (!plain && suitTex) return suitTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), r = rng(42);
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,60,20' : '255,255,255'},${0.03 + r() * 0.04})`; g.fillRect(r() * S, r() * S, 2, 2); }   // fabric speckle
  for (let i = 0; i < 9; i++) { const x = r() * S, y = r() * S, gr = g.createRadialGradient(x, y, 0, x, y, 20 + r() * 30); gr.addColorStop(0, 'rgba(90,50,30,0.13)'); gr.addColorStop(1, 'rgba(90,50,30,0)'); g.fillStyle = gr; g.fillRect(x - 60, y - 60, 120, 120); }   // wear
  if (plain) { plainTex = new THREE.CanvasTexture(c); plainTex.colorSpace = THREE.SRGBColorSpace; plainTex.anisotropy = 4; return plainTex; }
  g.strokeStyle = 'rgba(110,45,10,0.45)'; g.lineWidth = 3;
  for (const u of [0.25, 0.75]) { g.beginPath(); g.moveTo(u * S, 0); g.lineTo(u * S, S); g.stroke(); }          // side seams
  for (const v of [0.33, 0.68]) { g.beginPath(); g.moveTo(0, v * S); g.lineTo(S, v * S); g.stroke(); }          // panel seams
  g.setLineDash([5, 6]); g.strokeStyle = 'rgba(255,240,220,0.35)'; g.lineWidth = 1.5;                            // stitching
  for (const u of [0.25, 0.75]) { g.beginPath(); g.moveTo(u * S + 5, 0); g.lineTo(u * S + 5, S); g.stroke(); }
  g.setLineDash([]); g.strokeStyle = 'rgba(110,45,10,0.22)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y + 6 - r() * 12, x + 28, y + 2); g.stroke(); }   // creases
  suitTex = new THREE.CanvasTexture(c); suitTex.colorSpace = THREE.SRGBColorSpace; suitTex.wrapS = suitTex.wrapT = THREE.RepeatWrapping; suitTex.anisotropy = 4;
  return suitTex;
}
// Small painted patches: an original mission patch, a ship emblem, and the name tape.
function patchTexture(kind, text = '') {
  const c = document.createElement('canvas'); c.width = kind === 'name' ? 256 : 128; c.height = kind === 'name' ? 64 : 128;
  const g = c.getContext('2d');
  if (kind === 'name') {
    g.fillStyle = '#2E3440'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#E9ECEF'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 56);
    g.fillStyle = '#F4F1EA'; g.font = '700 34px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
  } else if (kind === 'mission') {
    g.fillStyle = '#1F3A5C'; g.beginPath(); g.arc(64, 64, 60, 0, PI * 2); g.fill();
    g.strokeStyle = '#F2C14E'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#7FE0C2'; g.beginPath(); g.arc(50, 72, 22, 0, PI * 2); g.fill();                              // a small planet
    g.strokeStyle = '#F4F1EA'; g.lineWidth = 4; g.beginPath(); g.ellipse(50, 72, 34, 9, -0.35, 0, PI * 2); g.stroke();
    g.fillStyle = '#F4F1EA'; for (const [x, y] of [[88, 38], [96, 70], [76, 30]]) { g.beginPath(); g.arc(x, y, 3.5, 0, PI * 2); g.fill(); }
  } else {
    g.fillStyle = '#F4F1EA'; g.beginPath(); g.moveTo(64, 8); g.lineTo(118, 30); g.lineTo(108, 92); g.lineTo(64, 122); g.lineTo(20, 92); g.lineTo(10, 30); g.closePath(); g.fill();
    g.fillStyle = '#E0603A'; g.beginPath(); g.moveTo(64, 18); g.lineTo(108, 36); g.lineTo(100, 88); g.lineTo(64, 112); g.lineTo(28, 88); g.lineTo(20, 36); g.closePath(); g.fill();
    g.fillStyle = '#F4F1EA'; g.beginPath(); g.moveTo(64, 34); g.lineTo(76, 68); g.lineTo(64, 96); g.lineTo(52, 68); g.closePath(); g.fill();   // a rising ship
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- Hair: a few sculpted shells that follow the skull, with a clean silhouette ----------
// The hairline: how far down from the crown (theta) the hair reaches, all the way round (phi = PI is the face).
function hairline(phi, front, side, back, tilt = 0) {
  const c = Math.cos(phi), wf = Math.max(0, -c), wb = Math.max(0, c), ws = 1 - wf - wb;
  return wf * (front + tilt * Math.sin(phi)) + wb * back + ws * side;
}
function hairShell(thick, line, nu = 56, nv = 18, extra = () => 0) {
  const p = new THREE.Vector3();
  return surface((u, v, out) => {
    const phi = u * PI * 2, tmax = line(phi), theta = v * tmax;
    const edge = 1 - Math.pow(v, 6);                                  // tapers to a soft rounded edge at the hairline
    headPoint(theta, phi, out, (thick * edge + extra(theta, phi)) + 0.0015);
    return out;
  }, nu, nv, HC, true);
}
function makeHair(style, color) {
  const g = new THREE.Group(), m = toon(color, {}, 'hair'), dark = toon(shade(color, 0.78), {}, 'hairD'), tieM = toon('#E0603A', {}, 'tie');
  const R = rng(7 + style.length * 31);
  const add = (geo, mat = m) => { const mesh = new THREE.Mesh(geo, mat); g.add(mesh); return mesh; };
  // A sculpted lock: a long rounded shape lying on the skull at (theta, phi), its length along the hair's flow.
  // size is [width, thickness, length]; lift is how far its middle sits above the skin.
  const locks = [], lockGeo = cached('lock', () => new THREE.SphereGeometry(1, 16, 10));
  // Each lock is bent to follow the skull (every point is pushed back onto the head's curve), so its ends never lift off.
  const skullR = d => { const ct = d.y, k = 1 + 0.06 * ct - 0.16 * Math.max(0, -ct) ** 2; return 1 / Math.sqrt((d.x / (HA * k)) ** 2 + (d.y / HB) ** 2 + (d.z / (HD * k)) ** 2); };
  const lock = (theta, phi, size, flow, lift = 0.012) => {
    const p = headPoint(theta, phi, new THREE.Vector3()), n = p.clone().sub(HC);
    n.set(n.x / (HA * HA), n.y / (HB * HB), n.z / (HD * HD)).normalize();
    const f = new THREE.Vector3(...flow).normalize(), tg = f.addScaledVector(n, -f.dot(n)).normalize(), b = new THREE.Vector3().crossVectors(n, tg);
    const geo = lockGeo.clone(), P = geo.attributes.position, q = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      q.copy(p).addScaledVector(b, x * size[0]).addScaledVector(tg, z * size[2]);
      d.copy(q).sub(HC).normalize();
      q.copy(HC).addScaledVector(d, skullR(d) + lift + y * size[1]);
      P.setXYZ(i, q.x, q.y, q.z);
    }
    geo.computeVertexNormals(); locks.push(geo);
  };
  // A free-hanging lock (long hair below the head), as a rounded shape tilted out a little.
  const hang = (pos, size, rx = 0, rz = 0) => locks.push(lockGeo.clone().scale(...size).rotateX(rx).rotateZ(rz).translate(...pos));
  const addLocks = (mat = m) => { if (locks.length) add(mergeGeometries(locks), mat); };
  if (style === 'crop') {
    add(hairShell(0.012, phi => hairline(phi, 0.3 * PI, 0.47 * PI, 0.66 * PI), 56, 16, (t) => 0.004 * Math.cos(t)));
    for (const [th, ph] of [[0.26, 0.9], [0.26, 1.0], [0.26, 1.1], [0.14, 0.95], [0.14, 1.12], [0.06, 1.0]]) lock(th * PI, ph * PI, [0.03, 0.012, 0.045], [0, 0.4, 1], 0.011);
    addLocks();
  } else if (style === 'sidepart') {
    // Swept to one side from a parting, with a soft lift over the forehead.
    const part = PI * 0.83;
    add(hairShell(0.018, phi => hairline(phi, 0.29 * PI, 0.46 * PI, 0.64 * PI, 0.05 * PI), 64, 18, (t, ph) => {
      const d = Math.abs(Math.atan2(Math.sin(ph - part), Math.cos(ph - part)));
      return 0.008 * Math.sin(t * 2.2) * (ph > part || ph < 0.3 ? 1 : 0.4) - 0.006 * Math.exp(-(d * d) / 0.004) * (t < 0.9 ? 1 : 0);
    }));
    // Swoops from the parting (on the left of the forehead) across the top and down the right side.
    for (const [th, ph, w, l] of [[0.22, 0.93, 0.05, 0.1], [0.24, 1.05, 0.05, 0.1], [0.27, 1.16, 0.045, 0.09], [0.12, 0.98, 0.05, 0.1], [0.12, 1.15, 0.05, 0.1], [0.3, 1.27, 0.04, 0.08], [0.05, 1.3, 0.05, 0.09]])
      lock(th * PI, ph * PI, [w, 0.016, l * 0.9], [-1, -0.3, 0.25], 0.013);
    for (const [th, ph] of [[0.15, 0.68], [0.28, 0.6], [0.15, 1.5], [0.3, 1.42]]) lock(th * PI, ph * PI, [0.045, 0.011, 0.075], [0, -1, 0.5], 0.009);   // sides, lying flat
    for (const [th, ph] of [[0.25, 0.08], [0.42, 0.0], [0.25, 1.92]]) lock(th * PI, ph * PI, [0.05, 0.012, 0.08], [0, -1, 0.3], 0.009);   // back
    addLocks();
  } else if (style === 'curly') {
    add(hairShell(0.012, phi => hairline(phi, 0.3 * PI, 0.48 * PI, 0.66 * PI), 48, 14), dark);
    // Round curls all over the cap: a lumpy, soft silhouette.
    const curls = [], p = new THREE.Vector3(), n = 110;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 1.45, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
      const theta = Math.acos(clamp(y, -1, 1)), phi = (a % (PI * 2) + PI * 2) % (PI * 2);
      if (theta > hairline(phi, 0.3 * PI, 0.47 * PI, 0.64 * PI)) continue;
      headPoint(theta, phi, p, 0.017 + R() * 0.004);
      const s = 0.017 + R() * 0.006;
      curls.push(new THREE.SphereGeometry(s, 10, 8).translate(p.x, p.y, p.z));
      void rr;
    }
    add(mergeGeometries(curls));
  } else if (style === 'ponytail' || style === 'bun') {
    add(hairShell(0.01, phi => hairline(phi, 0.29 * PI, 0.47 * PI, 0.66 * PI), 56, 16, (t, ph) => 0.003 * Math.max(0, Math.cos(ph))));
    const tie = headPoint(style === 'bun' ? 0.32 * PI : 0.52 * PI, 0, new THREE.Vector3(), 0.012);
    for (const [th, ph] of [[0.27, 0.92], [0.27, 1.08], [0.17, 0.8], [0.17, 1.2], [0.3, 0.68], [0.3, 1.32]]) lock(th * PI, ph * PI, [0.04, 0.009, 0.09], [0, style === 'bun' ? 0.6 : 0.1, 1], 0.007);
    addLocks();
    const tieRing = part(new THREE.TorusGeometry(0.02, 0.0065, 8, 16), tieM, tie.toArray(), 1, [style === 'bun' ? 1.0 : 0.25, 0, 0]);
    g.add(tieRing);
    if (style === 'bun') {
      g.add(part(BALL, m, [tie.x, tie.y + 0.012, tie.z + 0.03], [0.042, 0.038, 0.04]));
      g.add(part(new THREE.TorusGeometry(0.03, 0.009, 8, 18), dark, [tie.x, tie.y + 0.012, tie.z + 0.03], 1, [1.0, 0, 0]));
    } else {
      // The tail: three tapering rounded pieces that swing a little (see update).
      const tail = joint(g, tie.toArray()); tail.userData.swing = true;
      let at = tail;
      for (const [r0, r1, len] of [[0.032, 0.03, 0.06], [0.03, 0.022, 0.07], [0.022, 0.009, 0.075]]) {
        at.add(part(limb(r0, r1, len, 14), m, [0, 0, 0]));
        at = joint(at, [0, -len, 0.004]); at.rotation.x = 0.16;
      }
      tail.rotation.x = 0.35;
    }
  } else {   // long: shoulder length, falling behind the ears and down the back of the neck
    add(hairShell(0.016, phi => hairline(phi, 0.29 * PI, 0.5 * PI, 0.6 * PI, 0.04 * PI), 64, 18, (t) => 0.006 * Math.sin(t * 2)));
    for (const [th, ph, fx] of [[0.25, 0.9, 1], [0.25, 1.1, -1], [0.14, 0.85, 1], [0.14, 1.15, -1], [0.38, 0.62, 0.3], [0.38, 1.38, -0.3]]) lock(th * PI, ph * PI, [0.05, 0.018, 0.1], [fx, -0.6, 0.2], 0.016);
    addLocks();
    // Shoulder-length locks hanging behind the ears and down the back of the neck.
    for (let k = 0; k < 9; k++) {
      const a = (k / 8 - 0.5) * PI * 1.15, r = 0.1, x = Math.sin(a) * r, z = Math.cos(a) * r * 0.95 + 0.012;
      hang([x, 0.07, z], [0.034, 0.1, 0.026], -0.12 * Math.cos(a), -Math.sin(a) * 0.18);
    }
  }
  return g;
}

// ---------- Hands: chunky gloves, a palm, four two-part fingers and a thumb, all rounded. curl() bends them. ----------
function makeHand(gloveM, side) {
  const hand = new THREE.Group(), segs = [];
  hand.add(part(limb(0.037, 0.035, 0.035, 16), gloveM, [0, 0.01, 0]));                    // cuff
  hand.add(part(BALL, gloveM, [0, -0.052, 0], [0.043, 0.05, 0.024]));                     // palm
  for (let i = 0; i < 4; i++) {
    const len = 0.032 - Math.abs(i - 1.4) * 0.004;
    const a = joint(hand, [-0.027 + i * 0.018, -0.088, -0.002]);
    a.add(part(limb(0.0108, 0.0102, len, 10), gloveM));
    const b = joint(a, [0, -len, 0]);
    b.add(part(limb(0.0102, 0.0095, len * 0.8, 10), gloveM));
    segs.push(a, b);
  }
  const thumb = joint(hand, [side * 0.036, -0.04, -0.012]);
  thumb.add(part(limb(0.0125, 0.0115, 0.028, 10), gloveM));
  const tip = joint(thumb, [0, -0.028, 0]);
  tip.add(part(limb(0.0115, 0.0105, 0.022, 10), gloveM));
  thumb.rotation.set(-0.5, 0, side * 0.6);
  return { hand, curl(k) { segs.forEach((s, i) => { s.rotation.x = k * (i % 2 ? 1.15 : 0.85); }); thumb.rotation.x = -0.5 - k * 0.45; tip.rotation.x = k * 0.55; } };
}

// ---------- Moods ----------
// brow: inner end up (+) or down (-). browY: brow lift. open: how open the upper lids are. lower: how far the lower lids rise
// (smiling eyes). pupil: pupil size. tilt: a small head tilt.
const MOOD = {
  happy: { brow: 0.12, browY: 0.004, open: 0.85, lower: 0.35, pupil: 1, tilt: 0.06 },
  worried: { brow: 0.5, browY: 0.009, open: 0.95, lower: 0.05, pupil: 0.9, tilt: -0.05 },
  surprised: { brow: 0.08, browY: 0.02, open: 1.15, lower: 0, pupil: 0.7, tilt: 0 },
  determined: { brow: -0.38, browY: -0.004, open: 0.62, lower: 0.2, pupil: 1, tilt: 0 },
  sleepy: { brow: -0.08, browY: -0.003, open: 0.28, lower: 0.12, pupil: 1, tilt: 0.12 },
};

// ---------- Poses ----------
// Arms are [forward swing, outward spread, elbow bend]; legs are [thigh, knee] (knee bends negative); fL/fR tip the feet
// (heel-to-toe). tx<0 leans forward, hx<0 looks down, hipY raises or drops the body, hipX shifts the weight side to side.
const SITTING = { hipY: -(HIP - SEAT), hipZ: 0.05, tx: 0.08, lL: [1.52, -1.5], lR: [1.48, -1.45] };
const STANDING = { tx: 0.02, hx: -0.03 };
const POSES = {
  stand: t => ({ ...STANDING, hipX: Math.sin(t * 0.55) * 0.02, tz: Math.sin(t * 0.55 + 0.6) * 0.012, lL: [0.02, -0.03], lR: [-0.04, -0.13], aL: [0.04, 0.15, 0.18], aR: [0.06, 0.15, 0.24], curl: 0.4 }),
  walk: (t, o) => {
    const p = t * o.stride, s = Math.sin(p), c = Math.cos(p), s2 = Math.cos(2 * p);
    // Heel strike with the toe up as a leg swings forward, rolling to the toe as it pushes off behind.
    const heelToe = ph => Math.sin(ph) > 0 ? 0.3 * Math.max(0, Math.cos(ph + 0.6)) : -0.35 * Math.max(0, -Math.cos(ph - 0.4));
    return {
      tx: -0.05, hx: -0.02,
      hipY: -0.026 + 0.026 * s2, hipX: s * 0.026, hipRy: s * 0.1, tRy: -s * 0.14, tz: -s * 0.03,
      lL: [s * 0.5, -0.08 - Math.max(0, -c) * 0.9], lR: [-s * 0.5, -0.08 - Math.max(0, c) * 0.9], fL: heelToe(p), fR: heelToe(p + PI),
      aL: [-s * 0.45, 0.13, 0.32 + Math.max(0, -s) * 0.38], aR: [s * 0.45, 0.13, 0.32 + Math.max(0, s) * 0.38], curl: 0.45, bob: s2,
    };
  },
  // Ladder climbing, one rung per step: phase runs 0..1 through a step, parity says which diagonal pair moves (right hand
  // with left foot, then left hand with right foot), dir is +1 going up and -1 going down. The moving hand reaches to
  // the next rung while the other one holds; the body shifts towards the holding side and the head follows the moving hand.
  climb: (t, o) => {
    const c = o.climb || { phase: 0, parity: 0, dir: 1 }, f = c.phase, lift = Math.sin(f * Math.PI);
    const mover = c.dir >= 0 ? f : 1 - f, holder = 1 - mover, right = c.parity === 0;
    const arm = (e, l) => [2.0 + 0.62 * e + l * 0.08, 0.22, 1.0 - 0.6 * e + l * 0.3];
    const leg = (e, l) => [0.3 + 0.75 * e + l * 0.18, -(0.4 + 1.05 * e) - l * 0.4];
    return {
      tx: -0.06, hipZ: 0.02, hipX: (right ? -1 : 1) * 0.035 * lift, tz: (right ? 1 : -1) * 0.04 * lift,
      aR: arm(right ? mover : holder, right ? lift : 0), aL: arm(right ? holder : mover, right ? 0 : lift),
      lL: leg(right ? mover : holder, right ? lift : 0), lR: leg(right ? holder : mover, right ? 0 : lift),
      hx: c.dir >= 0 ? 0.32 : -0.35, hy: (right ? -1 : 1) * 0.16 * lift, curl: 0.95,
    };
  },
  sit: () => ({ ...SITTING, aL: [0.35, 0.12, 0.9], aR: [0.35, 0.12, 0.9], curl: 0.4 }),
  pilot: (t, o) => ({ ...SITTING, aL: [0.72, 0.16, 0.95], aR: [0.72, 0.16, 0.95], curl: 0.85,
    tz: Math.max(-1, Math.min(1, o.turn)) * 0.1, hy: o.turn * 0.55, tx: 0.04 - Math.min(0.12, Math.max(0, o.accel) * 0.01) }),
  cook: t => ({ ...STANDING, hipX: Math.sin(t * 0.9) * 0.015, aL: [0.75, 0.08, 1.2], aR: [0.95 + Math.sin(t * 5) * 0.1, 0.08 + Math.cos(t * 5) * 0.12, 1.1], hx: -0.35, tx: -0.12, curl: 0.8, lL: [0.02, -0.05], lR: [-0.04, -0.12] }),
  eat: t => {
    const bite = Math.max(0, Math.sin(t * 2.0)) ** 2;
    return { ...SITTING, aL: [0.55, 0.12, 1.1], aR: [0.6 + bite * 0.4, 0.17, 1.0 + bite * 1.2], hx: -0.2 + bite * 0.12, tx: -0.08, curl: 0.7 };
  },
  read: t => ({ ...SITTING, aL: [0.55, -0.2, 1.65], aR: [0.55, -0.2, 1.65], hx: -0.4, hy: Math.sin(t * 0.6) * 0.1, tx: 0.1, curl: 0.6 }),
  sleep: () => ({ lie: 1, aL: [0.15, 0.17, 0.4], aR: [0.1, 0.12, 0.3], hy: 0.4, lL: [0.1, -0.15], lR: [0.05, -0.05], curl: 0.4 }),
  shower: t => { const s = Math.sin(t * 4); return { ...STANDING, aL: [2.5 + s * 0.15, 0.45, 1.7], aR: [2.5 - s * 0.15, 0.45, 1.75], hx: 0.25, curl: 0.5, hipX: s * 0.01 }; },
  garden: t => ({ tx: -0.35, hx: -0.4, lL: [0.25, -0.35], lR: [0.15, -0.3], hipY: -0.04, aL: [0.95, 0.12, 0.6], aR: [1.05 + Math.sin(t * 1.5) * 0.12, 0.08, 0.5 + Math.sin(t * 1.5) * 0.15], curl: 0.7 }),
  work: t => { const hit = Math.max(0, Math.sin(t * 6)) ** 3; return { ...STANDING, tx: -0.2, hx: -0.45, aL: [0.85, 0.17, 1.1], aR: [1.25 + hit * 0.45, 0.08, 1.3 - hit * 0.5], curl: 0.85, lL: [0.05, -0.08], lR: [-0.05, -0.12] }; },
  write: t => ({ ...SITTING, tx: -0.15, hx: -0.4, aL: [0.65, 0.2, 1.35], aR: [0.72 + Math.sin(t * 7) * 0.03, 0.12, 1.25 + Math.sin(t * 9) * 0.04], curl: 0.75 }),
  study: t => ({ tx: -0.32, hx: -0.55, aL: [0.75, 0.3, 0.25], aR: [0.75, 0.3, 0.25 + Math.max(0, Math.sin(t * 0.8)) * 0.6], curl: 0.2, lL: [0.1, -0.05], lR: [-0.1, -0.05], hy: Math.sin(t * 0.5) * 0.2 }),
  microscope: t => ({ ...STANDING, tx: -0.42, hx: -0.5, hy: Math.sin(t * 0.3) * 0.04, aL: [0.95, 0.22, 1.2], aR: [0.9, 0.27, 1.35 + Math.sin(t * 1.3) * 0.08], curl: 0.6, lL: [0.04, -0.06], lR: [-0.06, -0.12] }),
  experiment: t => { const s = Math.sin(t * 1.4); return { ...STANDING, tx: -0.18, hx: -0.4 + s * 0.08, hy: s * 0.25, hipX: s * 0.02, aL: [0.9 + s * 0.15, 0.17, 1.15], aR: [1.0 - s * 0.15, 0.12 + s * 0.08, 1.05], curl: 0.75, lL: [0.03, -0.05], lR: [-0.05, -0.1] }; },
  board: t => { const w = Math.sin(t * 5), pause = Math.sin(t * 0.7) > 0.4 ? 0 : 1; return { ...STANDING, hx: 0.12 - pause * 0.05, hy: Math.sin(t * 0.35) * 0.15, tRy: 0.08, aR: [1.9 + w * 0.06 * pause, 0.27 + Math.cos(t * 4) * 0.08 * pause, 0.75], aL: [0.15, 0.14, 0.6], curl: 0.8, lL: [0.02, -0.03], lR: [-0.03, -0.1] }; },
  tidy: t => { const lift = (Math.sin(t * 1.6) + 1) / 2; return { hipY: -0.32 * (1 - lift), tx: -0.5 + lift * 0.35, hx: -0.3, lL: [1.05 * (1 - lift) + 0.1, -1.6 * (1 - lift) - 0.1], lR: [0.95 * (1 - lift) + 0.05, -1.5 * (1 - lift) - 0.1], aL: [0.9 + lift * 0.3, 0.22, 0.5 + lift * 0.8], aR: [0.9 + lift * 0.3, 0.22, 0.5 + lift * 0.8], curl: 0.9 }; },
};
const ZERO = { tx: 0, tz: 0, tRy: 0, hx: 0, hy: 0, hz: 0, hipY: 0, hipX: 0, hipZ: 0, hipRy: 0, lie: 0, curl: 0, bob: 0, fL: 0, fR: 0,
  aL: [0, 0, 0], aR: [0, 0, 0], lL: [0, 0], lR: [0, 0] };

export function makePilot(look = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  const skin = toon(L.skin, {}, 'skin'), skinDark = toon(shade(L.skin, 0.84), {}, 'skinD');
  const suit = toon('#FFFFFF', { map: suitTexture(), color: new THREE.Color(L.suit) }, 'suit' + L.suit), suitDark = toon(shade(L.suit, 0.72), {}, 'suitD');
  const suitPlain = toon('#FFFFFF', { map: suitTexture(true), color: new THREE.Color(L.suit) }, 'suitP' + L.suit);   // no seams, for the rounded joints
  const glove = toon('#E7EAEE', {}, 'glove'), gloveDark = toon('#B9C0C8', {}, 'gloveD'), sole = toon('#3A3E46', {}, 'sole');
  const metal = toon('#A9B3BD', {}, 'metal'), metalDark = toon('#6C7680', {}, 'metalD');
  const stripe = toon('#EEF4F8', { emissive: '#B8C4CC', emissiveIntensity: 0.35 }, 'stripe');
  const group = new THREE.Group();
  const posture = joint(group, [0, 0, 0]);
  const hips = joint(posture, [0, HIP, 0]);

  // ----- Pelvis and legs -----
  hips.add(part(BALL, suitPlain, [0, 0.014, 0.004], [0.126, 0.058, 0.076]));
  // Hose connectors at the hip: one blue, one red.
  for (const [y, c] of [[-0.005, '#4F8FD6'], [-0.05, '#D65A4F']]) {
    hips.add(part(cached('conn', () => new THREE.CylinderGeometry(0.014, 0.016, 0.03, 14).rotateX(PI / 2)), metal, [0.085, y, -0.085]));
    hips.add(part(cached('cap', () => new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14).rotateX(PI / 2)), toon(c, {}, 'c' + c), [0.085, y, -0.103]));
  }
  // The suit hose to the seat, plugged in only while flying.
  const hoseCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.085, -0.005, -0.11), new THREE.Vector3(0.18, -0.01, -0.15), new THREE.Vector3(0.29, -0.07, -0.04), new THREE.Vector3(0.31, -0.22, 0.12)]);   // over the seat's side edge to a socket on its side
  const hose = part(new THREE.TubeGeometry(hoseCurve, 24, 0.011, 8), toon('#3E4A5A', {}, 'hose')); hose.visible = false; hips.add(hose);
  const legs = [-1, 1].map(s => {
    const thigh = joint(hips, [s * 0.074, -0.03, 0]);
    thigh.add(part(BALL, suitPlain, [0, 0.01, 0], [0.08, 0.075, 0.078]));
    thigh.add(part(limb(0.079, 0.06, 0.4), suit));
    thigh.add(part(band(0.0735, 0.018), stripe, [0, -0.17, 0]));                               // reflective stripe
    const shin = joint(thigh, [0, -0.42, 0]);
    shin.add(part(BALL, suitPlain, [0, 0, 0], 0.06));
    shin.add(part(BALL, suitDark, [0, 0.005, -0.03], [0.05, 0.055, 0.035]));                 // knee pad
    shin.add(part(limb(0.058, 0.05, 0.33), suit));
    shin.add(part(band(0.0555, 0.016), stripe, [0, -0.15, 0]));
    // Chunky boots: a padded shaft, a rounded foot with a toe cap, and a thick sole.
    shin.add(part(limb(0.064, 0.067, 0.1, 16), glove, [0, -0.27, 0]));
    shin.add(part(ring(0.065, 0.008), gloveDark, [0, -0.27, 0]));
    const foot = joint(shin, [0, -0.38, 0]);
    foot.add(part(cached('boot', () => new RoundedBoxGeometry(0.115, 0.085, 0.24, 3, 0.038)), glove, [0, -0.022, -0.04]));
    foot.add(part(cached('toe', () => new RoundedBoxGeometry(0.11, 0.05, 0.08, 3, 0.022)), gloveDark, [0, -0.035, -0.12]));
    foot.add(part(cached('sole', () => new RoundedBoxGeometry(0.122, 0.028, 0.255, 2, 0.012)), sole, [0, -0.061, -0.042]));
    return { thigh, shin, foot };
  });

  // ----- Torso: a tapered, slightly flattened shape (chest, waist, hips), with the suit's hardware -----
  const torso = joint(hips, [0, 0.06, 0]);
  const torsoGeo = cached('torso', () => new THREE.LatheGeometry([[0, -0.03], [0.1, -0.03], [0.103, 0.04], [0.1, 0.1], [0.112, 0.17], [0.128, 0.24], [0.13, 0.29], [0.12, 0.35], [0.1, 0.395], [0.07, 0.43], [0.048, 0.44], [0, 0.44]].map(([r, y]) => new THREE.Vector2(r, y)), 28));
  torso.add(part(torsoGeo, suit, [0, 0, 0], [1, 1, 0.7]));
  torso.add(part(ring(0.112, 0.008), suitDark, [0, 0.02, 0], [1, 1, 0.72]));                     // waist seam
  // Chest control panel: a few switches, a dial and two small lights.
  const panel = joint(torso, [0, 0.25, -0.092]); panel.rotation.x = -0.12;
  panel.add(part(cached('panel', () => new RoundedBoxGeometry(0.115, 0.075, 0.022, 2, 0.008)), metalDark));
  for (let i = 0; i < 3; i++) panel.add(part(cached('sw', () => new THREE.CylinderGeometry(0.004, 0.004, 0.016, 8).rotateX(PI / 2 - 0.4)), metal, [-0.04 + i * 0.016, 0.012, -0.015]));
  panel.add(part(cached('dial', () => new THREE.CylinderGeometry(0.016, 0.016, 0.008, 18).rotateX(PI / 2)), toon('#E9ECEF', {}, 'dial'), [0.03, 0.004, -0.013]));
  panel.add(part(cached('needle', () => new THREE.BoxGeometry(0.002, 0.012, 0.002)), flat('#D65A4F'), [0.03, 0.008, -0.018], 1, [0, 0, -0.6]));
  for (const [x, c] of [[-0.04, '#6EF0A0'], [-0.024, '#FFC56B']]) panel.add(part(BALL, flat(c), [x, -0.017, -0.012], 0.0045));
  // Name tape and patches.
  const tape = part(new THREE.PlaneGeometry(0.085, 0.021), toon('#FFFFFF', { map: patchTexture('name', L.name) }, 'name' + L.name), [-0.058, 0.335, -0.085], 1, [0, PI, 0]);
  tape.rotation.set(-0.15, PI + 0.32, 0); torso.add(tape);
  // Neck ring, where the helmet locks on, and the neck itself.
  torso.add(part(ring(0.068, 0.014), metal, [0, 0.44, 0]));
  torso.add(part(ring(0.062, 0.006), metalDark, [0, 0.455, 0]));
  torso.add(part(limb(0.046, 0.048, 0.05, 16), skin, [0, 0.5, 0]));
  const helmetSlot = joint(torso, [0, 0.485, 0]);

  // ----- Arms: shoulder bearing, upper arm, elbow joint, forearm, glove ring, glove -----
  const arms = [-1, 1].map(s => {
    const shoulder = joint(torso, [s * 0.15, 0.375, 0]);
    shoulder.add(part(BALL, suitPlain, [0, -0.004, 0], [0.052, 0.05, 0.051]));
    shoulder.add(part(ring(0.052, 0.009), metal, [0, -0.042, 0]));                           // shoulder bearing
    shoulder.add(part(limb(0.05, 0.044, 0.27), suit));
    shoulder.add(part(band(0.0485, 0.016), stripe, [0, -0.15, 0]));
    const patch = part(new THREE.CircleGeometry(0.026, 24), toon('#FFFFFF', { map: patchTexture(s < 0 ? 'mission' : 'emblem') }, 'patch' + s), [s * 0.0505, -0.085, 0], 1, [0, s * PI / 2, 0]);
    shoulder.add(patch);
    const elbow = joint(shoulder, [0, -0.29, 0]);
    elbow.add(part(BALL, suitPlain, [0, 0, 0], 0.046));
    elbow.add(part(ring(0.047, 0.008), metal, [0, 0.014, 0]));                               // elbow bearing
    elbow.add(part(limb(0.045, 0.038, 0.235), suit));
    const wrist = joint(elbow, [0, -0.255, 0]);
    wrist.add(part(ring(0.043, 0.011), metal, [0, 0.012, 0]));                               // glove ring
    const h = makeHand(glove, s); h.hand.rotation.y = s * PI / 2 * 0.85; wrist.add(h.hand);
    return { shoulder, elbow, wrist, hand: h };
  });

  // ----- Head: skin, painted face, eyes, lids, brows, nose, ears, hair -----
  const head = joint(torso, [0, 0.478, 0]); head.scale.setScalar(1.06);   // about six heads tall overall
  head.add(new THREE.Mesh(cached('head', () => surface((u, v, out) => headPoint(v * PI, u * PI * 2, out), 48, 32, HC, true)), skin));
  const faces = Object.fromEntries(MOODS.map(m => [m, faceCanvas(m, L.blush)]));
  const faceMat = new THREE.MeshToonMaterial({ map: faces.happy, transparent: true, gradientMap: GRAD, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const faceGeo = cached('face', () => {
    const g = surface((u, v, out) => headPoint(lerp(0.36, 0.97, v) * PI, PI + (u - 0.5) * 1.9, out, 0.0006), 30, 26, HC);
    const P = g.attributes.position, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) + 0.1) / 0.2, P.getY(i) / 0.28);
    return g;
  });
  head.add(new THREE.Mesh(faceGeo, faceMat));
  const nose = facePoint(0, 0.1); head.add(part(BALL, skin, nose.p.addScaledVector(nose.n, 0.004).toArray(), [0.012, 0.012, 0.011]));
  for (const s of [-1, 1]) {
    const ear = headPoint(0.53 * PI, PI / 2 * (s > 0 ? 1 : 3), new THREE.Vector3());
    head.add(part(BALL, skin, ear.toArray(), [0.011, 0.026, 0.018]));
    head.add(part(BALL, skinDark, [ear.x + s * 0.004, ear.y, ear.z], [0.006, 0.017, 0.011]));
  }
  const eyes = [];
  const whiteM = flat('#FBF8F3'), irisM = flat(L.eyes), pupilM = flat('#141418'), lash = flat('#2A1E1C');
  for (const s of [-1, 1]) {
    const at = facePoint(s * 0.036, 0.128, -0.0105);
    const eye = joint(head, at.p.toArray());
    eye.rotation.y = -s * 0.18;                                                               // facing a touch outward, like a real face
    eye.add(part(BALL, whiteM, [0, 0, 0], [0.0215, 0.026, 0.012]));
    const look = joint(eye, [0, 0, 0]);                                                       // turns to dart and follow
    const iris = joint(look, [0, -0.001, -0.0124]);
    iris.add(part(cached('iris', () => new THREE.CircleGeometry(1, 24)), irisM, [0, 0, 0], [0.0112, 0.013, 1], [0, PI, 0]));
    const pupil = part(cached('iris', () => new THREE.CircleGeometry(1, 24)), pupilM, [0, 0, -0.0004], [0.0058, 0.0068, 1], [0, PI, 0]);
    iris.add(pupil);
    iris.add(part(cached('iris', () => new THREE.CircleGeometry(1, 24)), flat('#FFFFFF'), [-0.004, 0.0055, -0.0008], [0.0032, 0.0032, 1], [0, PI, 0]));
    iris.add(part(cached('iris', () => new THREE.CircleGeometry(1, 24)), flat('#FFFFFF'), [0.004, -0.004, -0.0008], [0.0014, 0.0014, 1], [0, PI, 0]));
    // Thick upper and lower lids (skin-coloured caps that roll over the eye), with a dark lash line on the upper one.
    const upper = joint(eye, [0, 0, 0]);
    upper.add(part(cached('capU', () => new THREE.SphereGeometry(1, 22, 10, 0, PI * 2, 0, PI / 2)), skin, [0, 0, 0], [0.0225, 0.0275, 0.0138]));
    upper.add(part(cached('lash', () => new THREE.TorusGeometry(1, 0.11, 6, 28, PI).rotateX(-PI / 2)), lash, [0, 0, 0], [0.0228, 0.02, 0.014], [0, 0, 0]));
    const lower = joint(eye, [0, 0, 0]);
    lower.add(part(cached('capL', () => new THREE.SphereGeometry(1, 22, 10, 0, PI * 2, PI / 2, PI / 2)), skin, [0, 0, 0], [0.0222, 0.027, 0.0136]));
    const brow = part(cached('brow', () => new THREE.CapsuleGeometry(0.0055, 0.024, 4, 10).rotateZ(PI / 2)), toon(shade(L.hair, 0.85), {}, 'brow'), [0, 0, 0]);
    const bp = facePoint(s * 0.037, 0.171, 0.004); brow.position.copy(bp.p); brow.userData = { base: bp.p.clone(), s };
    brow.rotation.y = -s * 0.25; head.add(brow);
    eyes.push({ eye, look, pupil, upper, lower, brow, s });
  }
  let hair = makeHair(L.hairStyle, L.hair); head.add(hair);

  // ----- Helmet: a comms cap, a shell with a reflective visor, and a ring seal. Off inside the ship. -----
  const helmet = new THREE.Group(); helmet.visible = false; helmetSlot.add(helmet);
  const capM = toon('#3B4250', {}, 'commsCap');
  const commsCap = new THREE.Group(); commsCap.visible = false; head.add(commsCap);
  commsCap.add(new THREE.Mesh(cached('commsCap', () => hairShell(0.007, phi => hairline(phi, 0.3 * PI, 0.62 * PI, 0.66 * PI), 48, 14)), capM));
  for (const s of [-1, 1]) commsCap.add(part(BALL, capM, headPoint(0.53 * PI, PI / 2 * (s > 0 ? 1 : 3), new THREE.Vector3(), 0.012).toArray(), [0.016, 0.028, 0.024]));
  commsCap.add(part(cached('mic', () => new THREE.CapsuleGeometry(0.003, 0.07, 3, 6)), capM, [-0.075, 0.085, -0.05], 1, [0.2, 0.3, 1.2]));
  const shellM = toon('#F3F5F7', {}, 'shell');
  const HR = 0.178, hc = [0, 0.135, 0.008];
  const win = [PI * 1.5 - 0.95, 1.9], winT = [0.27 * PI, 0.37 * PI];
  helmet.add(part(cached('shellBack', () => new THREE.SphereGeometry(HR, 40, 24, win[0] + win[1], PI * 2 - win[1], 0, 0.8 * PI)), shellM, hc));
  helmet.add(part(cached('shellTop', () => new THREE.SphereGeometry(HR, 20, 8, win[0], win[1], 0, winT[0])), shellM, hc));
  helmet.add(part(cached('shellLow', () => new THREE.SphereGeometry(HR, 20, 6, win[0], win[1], winT[0] + winT[1], 0.8 * PI - winT[0] - winT[1])), shellM, hc));
  const visorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#5C86B8'); gr.addColorStop(0.55, '#24365A'); gr.addColorStop(1, '#151E33');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(40, 38, 30, 9, -0.5, 0, PI * 2); g.fill();   // a soft reflection streak
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.ellipse(86, 30, 10, 4, -0.5, 0, PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  helmet.add(part(cached('visor', () => new THREE.SphereGeometry(HR + 0.002, 24, 12, win[0] - 0.02, win[1] + 0.04, winT[0] - 0.02, winT[1] + 0.04)),
    new THREE.MeshBasicMaterial({ map: visorTex, transparent: true, opacity: 0.72, depthWrite: false }), hc));
  helmet.add(part(ring(0.106, 0.016), metal, [0, -0.012, 0]));                                // ring seal
  helmet.add(part(cached('collar', () => new THREE.CylinderGeometry(0.104, 0.074, 0.06, 28, 1, true)), metalDark, [0, -0.045, 0]));   // down to the neck ring
  helmet.add(part(BALL, metalDark, [0.15, 0.17, 0.02], [0.018, 0.03, 0.03]));                  // lamp housing
  helmet.add(part(BALL, flat('#FFF4D6'), [0.162, 0.17, 0.002], 0.008));

  // A book to hold while reading.
  const book = new THREE.Group();
  book.add(part(new THREE.BoxGeometry(0.2, 0.15, 0.022), toon('#3FA7B5', {}, 'book')), part(new THREE.BoxGeometry(0.19, 0.14, 0.024), toon('#FFF6E4', {}, 'pages'), [0, 0, -0.003]));
  book.position.set(0, 0.25, -0.3); book.rotation.x = -0.6; book.visible = false;
  torso.add(book);

  // ---------- Life ----------
  let override = null, blinkIn = 2 + Math.random() * 3, blink = 0, t = 0, animT = 0, lastAnim = 'pilot', helmetOn = false, faceMood = 'happy';
  let dartIn = 1.5, dart = new THREE.Vector2(), dartNow = new THREE.Vector2(), headLagY = 0, headLagX = 0, tailVel = 0, tailAng = 0, prevHeadY = 0;
  const cur = { ...MOOD.happy, name: 'happy' }, pose = structuredClone(ZERO);
  const ease = (a, b, k) => a + (b - a) * k;
  const tailOf = () => hair.children.find(c => c.userData.swing);

  return {
    group, head, torso, look: L,
    get mood() { return override || cur.name; },
    get helmet() { return helmetOn; },
    // Set a mood from code: setMood('worried'). setMood(null) goes back to automatic.
    setMood(m) { override = MOODS.includes(m) ? m : null; },
    // The helmet goes on for outside chores (it lives in the suit room otherwise). Short and tied-back hair fits under it;
    // with the helmet on, the hair is tucked under the comms cap.
    setHelmet(on) { helmetOn = !!on; helmet.visible = helmetOn; commsCap.visible = helmetOn; hair.visible = !helmetOn; },
    setHair(style, color = L.hair) { head.remove(hair); L.hairStyle = HAIR_STYLES.includes(style) ? style : L.hairStyle; L.hair = color; hair = makeHair(L.hairStyle, color); hair.visible = !helmetOn; head.add(hair); },
    update(dt, { anim = 'pilot', mood = 'happy', turn = 0, accel = 0, stride = 6.5, climb = null, reduced = false } = {}) {
      t += dt;
      if (anim !== lastAnim) { animT = 0; lastAnim = anim; }
      animT += dt;
      const name = override || mood, want = MOOD[name], k = 1 - Math.exp(-dt * 10);
      cur.name = name;
      for (const key of ['brow', 'browY', 'open', 'lower', 'pupil', 'tilt']) cur[key] = ease(cur[key], want[key], k);
      if (faceMood !== name) { faceMood = name; faceMat.map = faces[name]; faceMat.needsUpdate = true; }
      // Blinks, and small darts of the eyes now and then (none with reduced motion).
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 0.14; blinkIn = 2.2 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt);
      dartIn -= dt;
      if (dartIn <= 0 && !reduced) { dart.set((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.08); dartIn = 0.8 + Math.random() * 2.2; }
      dartNow.lerp(dart, 1 - Math.exp(-dt * 25));
      const asleep = anim === 'sleep', closed = asleep || blink > 0 ? 1 : 1 - clamp(cur.open, 0, 1);
      const follow = -clamp(turn, -1, 1) * 0.22;
      for (const e of eyes) {
        e.upper.rotation.x = lerp(1.15 - Math.max(0, cur.open - 1) * 0.6, -1.5, closed);      // rolls down over the eye
        e.lower.rotation.x = lerp(-1.05, -0.45, clamp(cur.lower + (asleep ? 0.3 : 0), 0, 1));
        e.look.rotation.set(-dartNow.y, follow + dartNow.x, 0);
        e.pupil.scale.set(0.0058 * cur.pupil, 0.0068 * cur.pupil, 1);
        e.brow.position.copy(e.brow.userData.base); e.brow.position.y += cur.browY;
        e.brow.rotation.z = cur.brow * -e.s;
      }

      const target = { ...ZERO, ...POSES[anim](reduced ? 0 : animT, { turn, accel, stride, climb }) };
      const pk = reduced ? 1 : 1 - Math.exp(-dt * 9), ak = reduced ? 1 : 1 - Math.exp(-dt * 6.5);   // arms follow through a beat later
      for (const key of Object.keys(ZERO)) {
        const kk = key[0] === 'a' ? ak : pk;
        if (Array.isArray(ZERO[key])) pose[key] = pose[key].map((v, i) => ease(v, target[key][i], kk));
        else pose[key] = ease(pose[key], target[key], kk);
      }
      const breath = reduced || anim === 'walk' || anim === 'climb' ? 0 : Math.sin(t * (asleep ? 1.1 : 1.7)) * 0.012;

      posture.rotation.x = pose.lie * PI / 2;
      hips.position.set(pose.hipX, HIP + pose.hipY, pose.hipZ);
      hips.rotation.set(0, pose.hipRy, -pose.hipX * 1.5);       // the pelvis tilts a little with the weight shift
      torso.rotation.set(pose.tx, pose.tRy, pose.tz + pose.hipX * 1.2);
      torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath);
      // The head lags a touch behind the body and settles (a little cartoon follow-through).
      const hk = reduced ? 1 : 1 - Math.exp(-dt * 7);
      headLagY = ease(headLagY, pose.hy - pose.tRy * 0.6, hk); headLagX = ease(headLagX, pose.hx - (name === 'sleepy' && !asleep ? 0.2 : 0), hk);
      head.rotation.set(headLagX + (anim === 'walk' && !reduced ? pose.bob * 0.025 : 0), headLagY, pose.hz - pose.hipX * 0.8 + cur.tilt * 0.5);
      arms.forEach((a, i) => {
        const p = i ? pose.aR : pose.aL, s = i ? 1 : -1;
        // Arms reaching forward swing out a little more, so the shoulder ring and upper arm clear the chest.
        a.shoulder.rotation.set(p[0], 0, s * (p[1] + 0.16 * clamp(p[0], 0, 1.4) / 1.4)); a.elbow.rotation.x = p[2]; a.hand.curl(pose.curl);
        a.wrist.rotation.x = -p[2] * 0.15;
      });
      legs.forEach((l, i) => {
        const p = i ? pose.lR : pose.lL, f = i ? pose.fR : pose.fL;
        l.thigh.rotation.x = p[0]; l.shin.rotation.x = p[1];
        l.foot.rotation.x = -(p[0] + p[1]) * (anim === 'walk' ? 0.9 : 0.95) + f;              // soles flat, rolling heel to toe when walking
      });
      // The ponytail swings with the head and settles.
      const tail = tailOf();
      if (tail) {
        const turnRate = (head.rotation.y - prevHeadY) / Math.max(dt, 1e-4); prevHeadY = head.rotation.y;
        const push = reduced ? 0 : -turnRate * 0.05 + (anim === 'walk' ? pose.bob * 0.6 : 0);
        tailVel += (-tailAng * 40 - tailVel * 6 + push * 20) * dt; tailAng += tailVel * dt; tailAng = clamp(tailAng, -0.5, 0.5);
        tail.rotation.set(0.35 + Math.max(0, -pose.tx) * 0.6 + (anim === 'walk' ? 0.06 : 0), 0, tailAng);
      }
      book.visible = anim === 'read';
      hose.visible = anim === 'pilot';
    },
  };
}
