// Stashtronauts space view, in 3D with three.js.
// You fly a small ship with W/A/S/D or the arrow keys. The camera follows behind; drag to look around the ship, scroll to zoom.
// Everything is built in code. Nothing is sent to a server.
import * as THREE from 'three';
import { load, goalsOf, planetNames, shipMoney, KEY, NAMES_KEY } from './money.js';
import { makeShip } from './ship.js';
import { MOODS } from './pilot.js';

const cv = document.getElementById('space');
cv.tabIndex = 0;

// People can ask their device for less motion. We check once and also listen for changes.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
motionQuery.addEventListener('change', e => { reduced = e.matches; });

// ---------- Small helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
// Turns text into a number. The same text always gives the same number.
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// A tiny random number generator that gives the same sequence for the same seed.
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Smooth 3D noise from a seed, used to paint planet surfaces. fbm() returns roughly -1..1.
function makeNoise(seed) {
  const r = rng(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = t => t * t * (3 - 2 * t);
  function noise(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = s(x - X), v = s(y - Y), w = s(z - Z);
    return lerp(
      lerp(lerp(at(X, Y, Z), at(X + 1, Y, Z), u), lerp(at(X, Y + 1, Z), at(X + 1, Y + 1, Z), u), v),
      lerp(lerp(at(X, Y, Z + 1), at(X + 1, Y, Z + 1), u), lerp(at(X, Y + 1, Z + 1), at(X + 1, Y + 1, Z + 1), u), v), w);
  }
  return (x, y, z, oct = 4) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { sum += (noise(x * f, y * f, z * f) - 0.5) * amp; amp *= 0.5; f *= 2.03; }
    return sum * 2.6;
  };
}

// ---------- Renderer, scene and camera ----------
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true; // for the ship's dollhouse cutaway
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 6000);
const coarse = matchMedia('(pointer: coarse)').matches; // phones and tablets get fewer pixels to draw

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // On tall phone screens, widen the view so it is never a narrow slit.
  const minWide = THREE.MathUtils.degToRad(64);
  camera.fov = Math.min(95, Math.max(60, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minWide / 2) / camera.aspect))));
  camera.updateProjectionMatrix();
}

// ---------- Light ----------
// One sun, far away, so every planet has a clear lit side and a dark side.
const SUN_DIR = new THREE.Vector3(0.62, 0.38, -0.69).normalize();
const sunLight = new THREE.DirectionalLight('#FFF1DC', 3.2);
sunLight.position.copy(SUN_DIR);
const SIDE = new THREE.Vector3().crossVectors(SUN_DIR, new THREE.Vector3(0, 1, 0)).normalize();
scene.add(sunLight);
// A faint cool fill so the dark sides stay readable instead of turning into black holes.
scene.add(new THREE.HemisphereLight('#3A4C8C', '#2A1C44', 0.2));

// ---------- The deep backdrop ----------
// The sky (nebula, stars and sun) follows the camera, so it always looks infinitely far away.
const sky = new THREE.Group();
scene.add(sky);

// Nebula clouds are painted once into a cube map at startup, then shown as the background.
// That keeps the per-frame cost tiny on phones.
const NEBULA_FRAG = `
varying vec3 vDir;
uniform vec3 sunDir;
float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += n(p) * a; p = p * 2.02 + 3.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  // Deep navy base, a touch lighter toward one side so there is no flat black anywhere.
  vec3 col = mix(vec3(0.004, 0.005, 0.014), vec3(0.012, 0.015, 0.045), 0.5 + 0.5 * d.y);
  // A soft band of faint light across the sky, like looking along a galaxy.
  vec3 bandN = normalize(vec3(0.3, 1.0, 0.25));
  float band = exp(-pow(dot(d, bandN) / 0.28, 2.0));
  float bn = fbm(d * 6.0 + 11.0);
  col += vec3(0.05, 0.048, 0.07) * band * smoothstep(0.35, 0.8, bn) * 1.6;
  // Warped noise makes wispy clouds instead of round blobs. A large-scale mask keeps big parts of the sky clear.
  vec3 q = d * 1.9 + vec3(fbm(d * 2.4 + 1.0), fbm(d * 2.4 + 7.0), fbm(d * 2.4 + 13.0)) * 1.5;
  float mask = smoothstep(0.42, 0.62, fbm(d * 0.9 + 70.0));
  float detail = fbm(d * 9.0 + 5.0);
  float purple = smoothstep(0.5, 0.85, fbm(q + 2.0)) * mask;
  float teal = smoothstep(0.52, 0.85, fbm(q * 1.3 + 21.0)) * (1.0 - mask * 0.7);
  float rose = smoothstep(0.55, 0.86, fbm(q * 0.9 + 37.0)) * mask;
  col += vec3(0.20, 0.07, 0.34) * purple * (0.35 + 0.9 * detail);
  col += vec3(0.02, 0.15, 0.20) * teal * (0.35 + 0.9 * detail);
  col += vec3(0.30, 0.07, 0.13) * rose * (0.3 + 0.8 * detail);
  // Dark dust lanes cut through the clouds for depth.
  col *= mix(1.0, 0.3, smoothstep(0.52, 0.7, fbm(d * 4.0 + 50.0)));
  // A dense veil of faint pinprick stars, thicker along the galaxy band.
  vec3 cell = floor(d * 420.0);
  float st = h(cell);
  col += vec3(0.75, 0.8, 1.0) * step(0.9965 - band * 0.004, st) * (0.08 + 0.25 * h(cell + 3.0));
  // Two far-off galaxies, tiny tilted smudges with bright cores.
  for (int i = 0; i < 2; i++) {
    vec3 c = normalize(i == 0 ? vec3(-0.55, 0.42, 0.72) : vec3(0.35, -0.6, 0.72));
    vec3 u = normalize(cross(c, vec3(0.2, 1.0, 0.1))), v = cross(c, u);
    float a = dot(d, u), b = dot(d, v), along = i == 0 ? 0.6 : -0.9;
    vec2 e = vec2(a * cos(along) - b * sin(along), a * sin(along) + b * cos(along)) / vec2(0.05, 0.016);
    float g = exp(-dot(e, e)) * step(0.0, dot(d, c));
    col += (i == 0 ? vec3(0.55, 0.48, 0.62) : vec3(0.45, 0.55, 0.65)) * (g * 0.35 + pow(g, 8.0) * 0.6);
  }
  // A warm haze around the sun.
  float s = max(dot(d, sunDir), 0.0);
  col += vec3(0.5, 0.32, 0.16) * (pow(s, 24.0) * 0.5 + pow(s, 4.0) * 0.06);
  gl_FragColor = vec4(col, 1.0);
}`;
function bakeNebula() {
  const size = coarse ? 512 : 1024;
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NEBULA_FRAG,
  })));
  new THREE.CubeCamera(1, 100, rt).update(renderer, s);
  s.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt.texture;
}

// Stars in every direction at different brightness, plus a denser band along the galaxy.
function makeStars() {
  const r = rng(424242), count = coarse ? 6000 : 9000, R = 2500;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  const bandN = new THREE.Vector3(0.3, 1, 0.25).normalize(), v = new THREE.Vector3(), c = new THREE.Color();
  const tints = ['#FFFFFF', '#FFFFFF', '#DCE6FF', '#BFD6FF', '#FFE3B8', '#FFD2A6'];
  for (let i = 0; i < count; i++) {
    v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
    v.normalize();
    // Squash a third of the stars toward the galaxy band.
    if (i % 3 === 0) { const d = v.dot(bandN); v.addScaledVector(bandN, -d * 0.85).normalize(); }
    pos.set([v.x * R, v.y * R, v.z * R], i * 3);
    const b = Math.pow(r(), 7); // most stars are dim, a few are bright
    c.set(tints[Math.floor(r() * tints.length)]).multiplyScalar(0.3 + b * 1.6);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1.3 + b * 4.5;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float pr;
      void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pr; }`,
    fragmentShader: `varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(vC * a, 1.0); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = -2; pts.frustumCulled = false;
  return pts;
}

// A soft round glow drawn into a small canvas, for the sun.
function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeSun() {
  const group = new THREE.Group();
  const add = (stops, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(stops), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, opacity, toneMapped: false }));
    s.scale.setScalar(scale); s.position.copy(SUN_DIR).multiplyScalar(2200); s.renderOrder = -1; group.add(s);
  };
  add([[0, 'rgba(255,214,160,0.5)'], [0.3, 'rgba(255,170,110,0.12)'], [1, 'rgba(255,140,90,0)']], 1500, 0.8);
  add([[0, 'rgba(255,255,245,1)'], [0.22, 'rgba(255,240,205,1)'], [0.32, 'rgba(255,205,140,0.45)'], [1, 'rgba(255,180,120,0)']], 190, 1);
  return group;
}

// Fine dust hanging still in space. It never moves, but it slides past as you fly, which sells depth.
function makeDust(radius) {
  const r = rng(777), count = coarse ? 500 : 900, pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const d = radius * Math.cbrt(r()), th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1);
    pos.set([d * Math.sin(ph) * Math.cos(th), d * Math.cos(ph), d * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#9FB2E8', size: 0.7, sizeAttenuation: true,
    map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]),
    transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
}

// ---------- Planets from the saved goals ----------
// progress is how much of the goal is saved, 0 to 1. Planets grow as it fills up.
const EXAMPLES = [
  { id: 'ex1', myth: 'Elysium', label: 'Car fund', amount: 6200, target: 15000 },
  { id: 'ex2', myth: 'Atlas', label: 'Emergency fund', amount: 3100, target: 5000 },
  { id: 'ex3', myth: 'Calypso', label: 'Trip to Japan', amount: 800, target: 4000 },
  { id: 'ex4', myth: 'Vesta', label: 'New laptop', amount: 1200, target: 1200 },
  { id: 'ex5', myth: 'Hyperion', label: 'House deposit', amount: 9000, target: 30000 },
].map((p, slot) => ({ ...p, slot, progress: p.amount / p.target }));

// Biomes are calm, chunky color sets from docs/STYLE.md. A planet's name decides which one it gets.
// kind decides the surface: 'terra' has seas and stepped land, 'mesa' is stepped rock, 'bands' is a striped giant.
const BIOMES = [
  { name: 'meadow', tint: '#73C47A', kind: 'terra', sea: -0.05, water: ['#2D6EA6', '#4FA3D9'], land: ['#E6D49A', '#73C47A', '#4FA56A', '#3E8C5E', '#DCE9A0'], cap: '#F2F7F0', atmo: '#9FE8C0' },
  { name: 'ocean', tint: '#4FA3D9', kind: 'terra', sea: 0.28, water: ['#235C93', '#3A85C2'], land: ['#F3E1AE', '#83CBA0', '#5BAF7A', '#EAF3D6'], cap: '#EAF3FB', atmo: '#8CCBFF' },
  { name: 'dune', tint: '#E6B36A', kind: 'mesa', land: ['#B9783F', '#CC8A4D', '#E6B36A', '#F3CE8C', '#F8E3B6'], atmo: '#FFD8A0' },
  { name: 'frost', tint: '#CFE6F2', kind: 'terra', sea: 0.05, water: ['#5C86B8', '#88AFCB'], land: ['#CFE6F2', '#E6F4FB', '#FFFFFF', '#A3C8DE'], cap: '#FFFFFF', atmo: '#D6F0FF' },
  { name: 'coral', tint: '#EE9A98', kind: 'bands', land: ['#EE9A98', '#FFC4B6', '#D47586', '#FFE2CB', '#B9607A', '#F6B39C'], atmo: '#FFC2CC' },
  { name: 'crystal', tint: '#9C8BE0', kind: 'mesa', land: ['#5F4FAE', '#7764C4', '#9C8BE0', '#C6B8F5', '#F0E7FF'], atmo: '#CFC2FF', crystals: '#B8F1FF' },
];

function readGoals() {
  const goals = goalsOf(load());
  if (!goals.length) return { list: EXAMPLES, examples: true };
  const names = planetNames(goals);
  return { list: goals.map(g => ({ id: g.id, myth: names[g.id].myth, slot: names[g.id].slot, label: g.name,
    progress: clamp((+g.amount || 0) / (+g.target || 1), 0, 1) })), examples: false };
}
// A planet starts at 70% of its full size and reaches full size when its goal is met.
const sizeFor = progress => 0.7 + 0.3 * progress;

// Decide a planet's look from its name. Same name in, same planet out.
// The +27 nudges the seeds so the first few planets someone makes all get different biomes.
function makeLook(name) {
  const r = rng(hash(name) + 27);
  const biome = BIOMES[Math.floor(r() * BIOMES.length)];
  const radius = biome.kind === 'bands' ? 13 + r() * 6 : 7 + r() * 5;
  const ringChance = biome.kind === 'bands' ? 0.75 : 0.3;
  return {
    biome, radius, seed: hash(name) ^ 0x9E3779B9,
    freq: 1.3 + r() * 1.1, off: [r() * 50, r() * 50, r() * 50],
    tilt: (r() - 0.5) * 0.9, spin: 0.025 + r() * 0.035, spinPhase: r() * 6.283,
    ring: r() < ringChance ? { inner: 1.45 + r() * 0.2, outer: 2.05 + r() * 0.45, tilt: (r() - 0.5) * 0.5, seed: Math.floor(r() * 1e9) } : null,
    moons: Array.from({ length: r() < 0.55 ? 1 + Math.floor(r() * 2) : 0 }, () =>
      ({ size: 0.14 + r() * 0.12, dist: 2.6 + r() * 1.6, angle: r() * 6.283, incl: (r() - 0.5) * 0.6, tint: r() })),
  };
}

const tmpColor = new THREE.Color();
// Pick a face color for a spot on the surface. h is terrain height (about -1..1), y is latitude (-1..1).
function surfaceColor(look, h, y, jitter) {
  const b = look.biome, L = b.land;
  let hex, step = 0;
  if (b.kind === 'bands') {
    const t = y * 4.2 + h * 0.55 + 10;
    hex = L[Math.floor(t * 1.7) % L.length];
  } else if (b.kind === 'terra') {
    if (h < b.sea) hex = h < b.sea - 0.3 ? b.water[0] : b.water[1];
    else { step = Math.min(L.length - 1, Math.floor((h - b.sea) / 0.16)); hex = L[step]; }
    if (Math.abs(y) > 0.84 - h * 0.12) hex = b.cap; // polar caps
  } else {
    step = clamp(Math.floor((h + 0.9) / 0.38), 0, L.length - 1); hex = L[step];
  }
  return tmpColor.set(hex).offsetHSL(0, 0, jitter);
}
// How far a spot sticks out, as a multiple of the radius. Stepped so the land looks chunky.
function surfaceHeight(look, h) {
  const b = look.biome;
  if (b.kind === 'bands') return 1;
  if (b.kind === 'terra') return h < b.sea ? 1 : 1 + Math.min(4, 1 + Math.floor((h - b.sea) / 0.16)) * 0.022;
  return 1 + clamp(Math.floor((h + 0.9) / 0.38), 0, 5) * 0.026;
}

// The soft glowing atmosphere is two shells: a halo behind the planet and a haze over its edge.
// Both are brighter on the side facing the sun.
const ATMO_VERT = `varying vec3 vN; varying vec3 vWN; varying vec3 vP;
void main(){ vN = normalize(normalMatrix * normal); vWN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`;
function atmosphere(color, radius) {
  const uniforms = { color: { value: new THREE.Color(color) }, sunDir: { value: SUN_DIR }, edge: { value: Math.sqrt(1 - 1 / (1.18 * 1.18)) }, boost: { value: 1 } };
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.18, 48, 32), new THREE.ShaderMaterial({
    uniforms, vertexShader: ATMO_VERT, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `uniform vec3 color; uniform vec3 sunDir; uniform float edge; uniform float boost; varying vec3 vN; varying vec3 vWN; varying vec3 vP;
      void main(){ float k = clamp(-dot(vN, normalize(-vP)) / edge, 0.0, 1.0);
        float lit = smoothstep(-0.45, 0.7, dot(normalize(vWN), sunDir));
        gl_FragColor = vec4(color * pow(k, 2.6) * (0.08 + 1.1 * lit) * boost, 1.0); }`,
  }));
  const haze = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, 48, 32), new THREE.ShaderMaterial({
    uniforms, vertexShader: ATMO_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `uniform vec3 color; uniform vec3 sunDir; uniform float boost; varying vec3 vN; varying vec3 vWN; varying vec3 vP;
      void main(){ float f = pow(1.0 - max(dot(vN, normalize(-vP)), 0.0), 2.4);
        float lit = smoothstep(-0.25, 0.8, dot(normalize(vWN), sunDir));
        gl_FragColor = vec4(color * (f * 0.9 + 0.04) * lit * boost, 1.0); }`,
  }));
  return { shells: [halo, haze], uniforms };
}

// A banded ring, painted as circles in a small canvas so its stripes follow the ring.
function makeRing(look) {
  const { inner, outer, seed } = look.ring, r = rng(seed), L = look.biome.land;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), R = 256;
  for (let rr = R; rr > R * inner / outer; rr -= 2 + r() * 7) {
    const t = (rr / R - inner / outer) / (1 - inner / outer); // 0 at the inner edge, 1 at the outer edge
    x.globalAlpha = (0.25 + r() * 0.65) * Math.min(1, t * 6, (1 - t) * 8 + 0.15);
    x.fillStyle = L[Math.floor(r() * L.length)];
    x.beginPath(); x.arc(R, R, rr, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'source-over';
  }
  // Clear the middle so the planet shows through.
  x.globalAlpha = 1; x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.arc(R, R, R * inner / outer, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new THREE.RingGeometry(look.radius * inner, look.radius * outer, 128, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide,
    depthWrite: false, roughness: 1, metalness: 0, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.22 }));
  mesh.rotation.x = -Math.PI / 2 + look.ring.tilt;
  return mesh;
}

function buildPlanet(p) {
  const look = makeLook(p.myth), N = makeNoise(look.seed), fr = rng(look.seed + 1);
  const detail = coarse ? 8 : 11;
  const geo = new THREE.IcosahedronGeometry(1, detail); // non-indexed, so every face can get its own flat color
  const pos = geo.attributes.position, n = pos.count, hs = new Float32Array(n), v = new THREE.Vector3();
  const [ox, oy, oz] = look.off, f = look.freq;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    hs[i] = N(v.x * f + ox, v.y * f + oy, v.z * f + oz);
    v.multiplyScalar(look.radius * surfaceHeight(look, hs[i]));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const h = (hs[i] + hs[i + 1] + hs[i + 2]) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / (3 * look.radius);
    const c = surfaceColor(look, h, clamp(y, -1, 1), (fr() - 0.5) * 0.05);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // tilt holds the axis tilt, body spins around it. Moons ride along with the slow spin.
  const tilt = new THREE.Group(), body = new THREE.Group();
  tilt.rotation.z = look.tilt; tilt.add(body);
  body.rotation.y = look.spinPhase;
  body.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 })));

  if (look.biome.crystals) {
    // Chunky crystal spires on the highest ground.
    const crystalMat = new THREE.MeshStandardMaterial({ color: look.biome.crystals, flatShading: true, roughness: 0.3,
      emissive: look.biome.crystals, emissiveIntensity: 0.25 });
    const spot = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let placed = 0;
    for (let i = 0; i < n && placed < 14; i += 3 * (7 + Math.floor(fr() * 40))) {
      if (hs[i] < 0.25) continue;
      spot.fromBufferAttribute(pos, i);
      const s = look.radius * (0.05 + fr() * 0.06);
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystalMat);
      m.scale.set(s * 0.5, s * 1.8, s * 0.5);
      m.position.copy(spot);
      m.quaternion.setFromUnitVectors(up, spot.clone().normalize());
      m.rotateY(fr() * 3); m.rotateZ((fr() - 0.5) * 0.5);
      body.add(m); placed++;
    }
  }

  for (const m of look.moons) {
    const pivot = new THREE.Group();
    pivot.rotation.set(m.incl, m.angle, 0);
    const mr = look.radius * m.size;
    const mg = new THREE.IcosahedronGeometry(mr, 1);
    const moon = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: tmpColor.setHSL(0.6 + m.tint * 0.15, 0.12, 0.62).clone(),
      flatShading: true, roughness: 1 }));
    moon.position.x = look.radius * m.dist;
    pivot.add(moon); body.add(pivot);
  }

  const group = new THREE.Group();
  group.add(tilt);
  const atmo = atmosphere(look.biome.atmo, look.radius);
  group.add(...atmo.shells);
  if (look.ring) tilt.add(makeRing(look));
  return { ...p, look, group, body, glow: atmo.uniforms.boost, size: sizeFor(p.progress), pulse: 0, reach: look.radius * Math.max(look.ring ? look.ring.outer : 1.2, ...look.moons.map(m => m.dist + m.size)) };
}

// Scatter planets through a big volume: above, below, behind, near and far.
// Each spot comes from the planet's name. Planets are placed in the order their goals were made, each one only
// avoiding the ones before it, so adding a goal never moves the planets that are already out there.
let volume = 200;
const spreadFor = slot => 110 + 40 * Math.sqrt(slot + 1);
function layout(planets) {
  volume = spreadFor(Math.max(0, ...planets.map(p => p.slot)));
  const placed = [];
  for (const p of [...planets].sort((a, b) => a.slot - b.slot)) {
    const r = rng(hash(p.myth) + 11), v = new THREE.Vector3();
    let spread = spreadFor(p.slot);
    for (let tries = 0; ; tries++) {
      const th = r() * Math.PI * 2, y = r() * 1.6 - 0.8, d = lerp(40 + p.reach * 1.8, spread, Math.pow(r(), 0.8));
      v.set(Math.cos(th) * Math.sqrt(1 - y * y), y, Math.sin(th) * Math.sqrt(1 - y * y)).multiplyScalar(d);
      if (placed.every(q => q.group.position.distanceTo(v) > q.reach + p.reach + 25)) break;
      if (tries > 40) spread *= 1.03; // crowded: let it drift a little further out
    }
    p.group.position.copy(v);
    placed.push(p);
  }
}

// ---------- The player's ship and the chase camera ----------
const ship = makeShip();
scene.add(ship.root, ...ship.world);
const MAX_SPEED = 36, MAX_BACK = 9, MAX_CLIMB = 10, TURN_RATE = 0.9;
const flight = { yaw: 0, speed: 0, yawVel: 0, climb: 0, accel: 0, turnTo: null };
// Default view: behind, above and a little to the right of the ship (a back three-quarter view).
const PITCH_REST = 0.3, YAW_REST = 0.7, FAR = 26;
// Camera and hull share one state machine: outside -> entering -> inside -> leaving -> outside.
// Only this machine opens or closes the hull. Scrolling in past ENTER_AT (1x the ship's length) enters; inside, only
// scrolling out past EXIT_AT (1.8x) or the "Back outside" button leaves. Both measure the camera's target distance.
const SHIP_LEN = 18.4, ENTER_AT = SHIP_LEN * 1.0, EXIT_AT = SHIP_LEN * 1.8;
const IN_DIST = 15, IN_YAW = 1.45, IN_PITCH = 0.12, GLIDE = 1.4;   // where the camera settles inside, and how long the glide takes
const view = { mode: 'outside', t: 0, from: null, to: null };
const chase = { dist: FAR, tDist: FAR, yaw: YAW_REST, pitch: PITCH_REST, dragging: false, ready: false };
const fwd = new THREE.Vector3(), tmpV = new THREE.Vector3(), pivot = new THREE.Vector3(), desired = new THREE.Vector3(), head = new THREE.Vector3();
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// Pilot moods can be set from code: window.stashPilot.setMood('worried'), or a 'stash:mood' event. null goes back to automatic.
window.stashPilot = { moods: MOODS, setMood: m => ship.pilot.setMood(m), get mood() { return ship.pilot.mood; } };
addEventListener('stash:mood', e => ship.pilot.setMood(e.detail?.mood ?? null));

// Keys: W/A/S/D or arrows to fly, Space to rise, C or Ctrl to sink, Shift to boost. F toggles the free camera.
// Everything is ignored while the console (or any dialog) is open or a text field has focus.
const FLIGHT_KEYS = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'up', KeyC: 'down', ControlLeft: 'down', ControlRight: 'down', ShiftLeft: 'boost', ShiftRight: 'boost' };
// In the free camera the same hands fly the camera instead: W/A/S/D, Q and E for down and up, Shift for faster.
const FREE_KEYS = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'up', Space: 'up', KeyQ: 'down', ShiftLeft: 'fast', ShiftRight: 'fast' };
const keys = new Set(), freeKeys = new Set();    // held key codes
const held = (map, set, action) => { for (const c of set) if (map[c] === action) return 1; return 0; };
const dialogOpen = () => !!document.querySelector('dialog[open]');
const busy = (e) => { const el = e.target; return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); };
addEventListener('keydown', e => {
  // On a Mac, keys released while Cmd is held never send a key-up, which used to leave a turn key "held" and the ship circling.
  if (e.metaKey || e.key === 'Meta') { keys.clear(); freeKeys.clear(); return; }
  if (e.altKey || dialogOpen() || busy(e)) return;
  // Ctrl sinks the ship, so while it's held, keep Ctrl+key from reaching the browser's shortcuts (where the browser lets a page do that).
  if (e.ctrlKey) e.preventDefault();
  if (/^(BUTTON|A)$/.test(e.target?.tagName) && (FLIGHT_KEYS[e.code] || FREE_KEYS[e.code])) e.target.blur(); // never "click" a focused HUD button
  hideHint();
  if (e.code === 'KeyF' && !e.ctrlKey) { if (!e.repeat) toggleFree(); e.preventDefault(); return; }
  if (e.code === 'Escape' && view.mode === 'free') { leaveFree(); e.preventDefault(); return; }
  // DEBUG (temporary): L extends and retracts the landing gear, until landing on planets is built (it will call ship.setLandingGear).
  if (e.code === 'KeyL' && !e.ctrlKey) { if (!e.repeat) ship.setLandingGear(!ship.landingGear); return; }
  if (view.mode === 'free') { if (FREE_KEYS[e.code]) { freeKeys.add(e.code); e.preventDefault(); } return; }
  if (!FLIGHT_KEYS[e.code]) return;
  if (view.mode !== 'outside') leaveInside();   // flying starts once the camera is back outside
  keys.add(e.code); flight.turnTo = null; e.preventDefault();
});
addEventListener('keyup', e => { if (e.key === 'Meta') keys.clear(); keys.delete(e.code); freeKeys.delete(e.code); });
addEventListener('blur', () => { keys.clear(); freeKeys.clear(); });
document.addEventListener('visibilitychange', () => { keys.clear(); freeKeys.clear(); });

// A small controls hint, shown on the first visit only.
const hint = document.getElementById('hint');
let hintSeen = false; try { hintSeen = !!localStorage.getItem('stashtronauts-hint'); } catch (e) {}
if (hint && !hintSeen) { hint.hidden = false; setTimeout(hideHint, 15000); }
function hideHint() { if (!hint || hint.hidden) return; hint.hidden = true; try { localStorage.setItem('stashtronauts-hint', '1'); } catch (e) {} }

// Mouse: drag to swing the camera around the ship (it eases back on release). Scroll or pinch to zoom.
const pointers = new Map();
let pinchDist = 0;
const pinch = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
function setZoom(d) {
  if (view.mode === 'entering' || view.mode === 'leaving' || view.mode === 'free') return;   // the glide owns the camera; extra scrolling can't flip it
  if (view.mode === 'outside') {
    chase.tDist = clamp(d, ENTER_AT, 70);
    if (d < ENTER_AT) enterInside();
  } else {
    chase.tDist = clamp(d, 1, EXIT_AT + 1);
    if (d > EXIT_AT) leaveInside(Math.min(70, d));
  }
}
const zoom = f => setZoom(chase.tDist * f);
const lookBtn = document.getElementById('lookCloser');
const freeBtn = document.getElementById('freeCam');
function updateLookBtn() {
  const inside = view.mode === 'inside' || view.mode === 'entering';
  lookBtn.textContent = inside ? 'Back outside' : 'Look closer';
  lookBtn.setAttribute('aria-pressed', inside);
  lookBtn.hidden = view.mode === 'free';
  freeBtn.textContent = view.mode === 'free' ? 'Back to ship' : 'Free camera';
  freeBtn.setAttribute('aria-pressed', view.mode === 'free');
}
// Glide the camera from where it is now to a new distance, angle and centre, easing in and out.
function glide(to) {
  view.from = { dist: chase.dist, yaw: chase.yaw, pitch: chase.pitch, pivot: pivot.clone() };
  view.to = to; view.t = 0;
  chase.dragging = false;
}
function enterInside() {
  if (view.mode === 'inside' || view.mode === 'entering') return;
  view.mode = 'entering'; ship.setOpen(true);
  keys.clear(); auto.active = false; auto.idle = 0; flight.turnTo = null;
  glide({ dist: IN_DIST, yaw: wrapAngle(IN_YAW), pitch: IN_PITCH });
  chase.tDist = IN_DIST; updateLookBtn();
}
function leaveInside(dist = FAR) {
  if (view.mode === 'outside' || view.mode === 'leaving') return;
  view.mode = 'leaving'; view.closeLate = false; ship.setOpen(false);
  const d = clamp(dist, ENTER_AT + 2, 70);
  glide({ dist: d, yaw: YAW_REST, pitch: PITCH_REST });
  chase.tDist = d; updateLookBtn();
}
lookBtn.addEventListener('click', () => (view.mode === 'inside' || view.mode === 'entering') ? leaveInside() : enterInside());
freeBtn.addEventListener('click', () => toggleFree());

// ---------- Free camera: detach from the ship and fly the camera anywhere, through the open hull into every room ----------
const free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 5, side: 1 };
const camDir = new THREE.Vector3(), camLocal = new THREE.Vector3(), qInv = new THREE.Quaternion();
function toggleFree() { view.mode === 'free' ? leaveFree() : enterFree(); }
function enterFree() {
  if (view.mode === 'free') return;
  view.mode = 'free'; view.closeLate = false;
  keys.clear(); freeKeys.clear(); auto.active = false; auto.idle = 0; flight.turnTo = null;
  // Cut the hull on the side the camera is on now, and keep that cut fixed, so flying inside never flips it.
  camLocal.copy(camera.position).sub(ship.root.position).applyQuaternion(qInv.copy(ship.root.quaternion).invert());
  free.side = camLocal.x >= 0 ? 1 : -1; ship.setCutSide(free.side); ship.setOpen(true);
  free.pos.copy(camera.position);
  camera.getWorldDirection(camDir); free.yaw = Math.atan2(-camDir.x, -camDir.z); free.pitch = Math.asin(clamp(camDir.y, -1, 1));
  chase.dragging = false; updateLookBtn();
}
function leaveFree() {
  if (view.mode !== 'free') return;
  // Turn wherever the camera is into follow-camera terms, then glide back out; the hull closes once the camera is clear.
  cameraTargets(pivot);
  const off = camera.position.clone().sub(pivot), d = Math.max(0.5, off.length());
  chase.dist = d; chase.pitch = Math.asin(clamp(off.y / d, -1, 1)); chase.yaw = wrapAngle(Math.atan2(off.x, off.z) - flight.yaw);
  freeKeys.clear();
  view.mode = 'leaving'; view.closeLate = true;
  glide({ dist: clamp(Math.max(FAR, d), ENTER_AT + 2, 70), yaw: YAW_REST, pitch: PITCH_REST });
  chase.tDist = view.to.dist; updateLookBtn();
}
// A click (not a drag) on the dashboard screen opens the console.
const clickStart = { x: 0, y: 0, t: 0 }, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
cv.addEventListener('pointerup', e => {
  if (Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) > 6 || performance.now() - clickStart.t > 500) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.intersectObjects(ship.clickables, false).length) dispatchEvent(new CustomEvent('stash:console'));
});
cv.addEventListener('pointerdown', e => {
  Object.assign(clickStart, { x: e.clientX, y: e.clientY, t: performance.now() });
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchDist = pinch();
  chase.dragging = true; cv.classList.add('dragging');
});
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1 && view.mode === 'free') {
    free.yaw -= (e.clientX - p.x) * 0.0035; free.pitch = clamp(free.pitch - (e.clientY - p.y) * 0.0035, -1.5, 1.5);
  } else if (pointers.size === 1) {
    chase.yaw -= (e.clientX - p.x) * 0.0045;
    if (view.mode === 'entering' || view.mode === 'leaving') { p.x = e.clientX; p.y = e.clientY; return; }
    chase.pitch = clamp(chase.pitch + (e.clientY - p.y) * 0.004, view.mode === 'inside' ? -0.4 : -0.9, view.mode === 'inside' ? 1.2 : 1.35);
  }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) { const d = pinch(); zoom(pinchDist / d); pinchDist = d; }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 2) pinchDist = pinch();
  if (!pointers.size) { chase.dragging = false; cv.classList.remove('dragging'); }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  if (view.mode === 'free') { free.speed = clamp(free.speed * Math.exp(-px * 0.0015), 0.5, 60); return; } // scroll sets the free camera's speed
  zoom(Math.exp(px * 0.0012));
}, { passive: false });

// Never fly into a planet, and never drift off into nowhere.
const clearance = p => p.look.radius * p.group.scale.x * 1.12;
function keepClear(pos, pad) {
  for (const p of planets) {
    tmpV.copy(pos).sub(p.group.position);
    const min = clearance(p) + pad;
    if (tmpV.length() < min) pos.copy(p.group.position).addScaledVector(tmpV.normalize(), min); // slide along it
  }
  if (pos.length() > volume * 1.5) pos.setLength(volume * 1.5);
}

// ---------- Autopilot: when nobody is steering, cruise between waypoints, hover a while, and go somewhere new ----------
const AUTO_AFTER = 3, CRUISE = 15, ARRIVE = 5;
const auto = { idle: 0, active: false, target: null, state: 'pick', hover: 0, travel: 0, heading: null, askedCrew: false };
// Distance from point c to the segment a-b.
function segDist(a, b, c) {
  const ab = tmpV.copy(b).sub(a), t = clamp(c.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(c);
}
function pickWaypoint() {
  const pos = ship.root.position, margin = ship.radius + 10;
  for (let tries = 0; tries < 60; tries++) {
    let cand;
    if (planets.length && Math.random() < 0.3) {
      // Cruise past a planet, keeping a comfortable distance.
      const p = planets[Math.floor(Math.random() * planets.length)], a = Math.random() * Math.PI * 2;
      cand = p.group.position.clone().add(new THREE.Vector3(Math.cos(a), (Math.random() - 0.5) * 0.4, Math.sin(a)).normalize().multiplyScalar(clearance(p) + margin + 12 + Math.random() * 15));
    } else {
      // A clearly different direction from the last trip, a good distance away.
      const turn = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 1.6), yaw = flight.yaw + turn, d = 60 + Math.random() * 80;
      cand = pos.clone().add(new THREE.Vector3(-Math.sin(yaw), (Math.random() - 0.5) * 0.35, -Math.cos(yaw)).multiplyScalar(d));
    }
    if (cand.length() > volume * 1.25 || cand.distanceTo(pos) < 40) continue;
    const dir = cand.clone().sub(pos).normalize();
    if (auto.heading && dir.dot(auto.heading) > 0.65) continue; // not the same way again
    if (planets.some(p => segDist(pos, cand, p.group.position) < clearance(p) + margin)) continue;
    auto.heading = dir;
    return cand;
  }
  // Nothing good nearby (crowded or near the edge): head back toward the middle.
  const back = pos.clone().multiplyScalar(-1).setLength(60).add(pos);
  auto.heading = back.clone().sub(pos).normalize();
  return back;
}
// Returns the inputs the autopilot wants this frame: forward speed target, turn (-1..1) and climb (-1..1).
function autopilot(dt) {
  if (auto.state === 'pick') { auto.target = pickWaypoint(); auto.state = 'travel'; auto.travel = 0; }
  const pos = ship.root.position;
  if (auto.state === 'travel') {
    auto.travel += dt;
    const to = auto.target.clone().sub(pos), dist = to.length();
    const diff = wrapAngle(Math.atan2(-to.x, -to.z) - flight.yaw);
    // Slow right down for big turns (so it turns in place instead of looping), and ease in when arriving.
    const align = Math.max(0, Math.cos(diff)) ** 3;
    const speed = CRUISE * align * clamp(dist / 35, 0.12, 1);
    if (dist < ARRIVE || auto.travel > 45) {
      auto.state = 'hover'; auto.hover = 5 + Math.random() * 4; auto.askedCrew = false;
    }
    return { speed, turn: clamp(diff * 1.6, -1, 1), climb: clamp(to.y / 12, -1, 1), cruising: true };
  }
  // Hover: a few seconds, or as long as the pilot is busy with something. Sometimes the pilot gets up for a while.
  auto.hover -= dt;
  if (!auto.askedCrew && auto.hover < 3) { auto.askedCrew = true; if (Math.random() < 0.6) ship.crew.start(); }
  if (auto.hover <= 0 && ship.atControls) auto.state = 'pick';
  return { speed: 0, turn: 0, climb: 0, cruising: false };
}

// Smooth acceleration, gentle slowdown, and turning that eases in and out.
function fly(dt) {
  const on = k => held(FLIGHT_KEYS, keys, k);
  const live = view.mode === 'outside';
  let ahead = live ? on('fwd') - on('back') : 0, turnIn = live ? on('left') - on('right') : 0, climbIn = live ? on('up') - on('down') : 0;
  const outside = view.mode === 'outside';
  const steering = (on('fwd') || on('back') || on('left') || on('right') || on('up') || on('down')) > 0 && outside;
  const boost = live && on('boost') ? 1.8 : 1;   // Shift: a faster top speed and a harder push   // keys pressed while inside wait until the camera is back out
  // Any key takes over at once; letting go hands back to the autopilot after a few quiet seconds.
  auto.idle = steering || flight.turnTo !== null ? 0 : auto.idle + dt;
  if (on('boost') && live && ahead > 0) thrustBoost = 1; else thrustBoost = 0;
  if (steering) { auto.active = false; auto.state = 'pick'; auto.heading = null; }
  else if (!auto.active && auto.idle > AUTO_AFTER && !reduced && outside) auto.active = true;
  if (reduced || !outside) auto.active = false;   // inside, the ship stays put
  if (!outside) insideLife(dt);
  const before = flight.speed;
  let cruising = false, thrust = ahead > 0 ? Math.min(1, 0.8 + 0.2 * thrustBoost) : 0;
  // Until the pilot is back in the seat, the ship only speeds up gently, so nobody gets left behind.
  const limit = ship.atControls ? 1 : 0.2;
  if (auto.active) {
    const a = autopilot(dt);
    cruising = a.cruising;
    const want = a.speed * limit, rate = want > flight.speed ? 5 : 7;
    flight.speed += clamp(want - flight.speed, -rate * dt, rate * dt);
    turnIn = a.turn; climbIn = a.climb;
    thrust = want > flight.speed + 0.5 ? 0.9 : flight.speed > 2 ? 0.35 : 0;
  } else if (ahead > 0) flight.speed = Math.min(MAX_SPEED * limit * boost, flight.speed + (flight.speed < 0 ? 24 : (12 + 6 * Math.max(0, 1 - flight.speed / MAX_SPEED)) * boost) * dt);
  else if (flight.speed > MAX_SPEED * limit * boost) flight.speed = Math.max(MAX_SPEED * limit * boost, flight.speed - 9 * dt); // ease down after a boost
  else if (ahead < 0) flight.speed = Math.max(-MAX_BACK, flight.speed - (flight.speed > 0 ? 24 : 7) * dt);
  else { flight.speed *= Math.exp(-dt * 1.1); if (Math.abs(flight.speed) < 0.02) flight.speed = 0; }
  flight.accel = (flight.speed - before) / Math.max(dt, 1e-4);
  let want = turnIn * TURN_RATE * (ship.atControls ? 1 : 0.5);
  if (flight.turnTo !== null && !steering) {
    const diff = wrapAngle(flight.turnTo - flight.yaw);
    want = clamp(diff * 2, -TURN_RATE, TURN_RATE);
    if (Math.abs(diff) < 0.004) flight.turnTo = null;
  }
  flight.yawVel += (want - flight.yawVel) * (1 - Math.exp(-dt * 3));
  flight.yaw += flight.yawVel * dt;
  flight.climb += (climbIn * MAX_CLIMB - flight.climb) * (1 - Math.exp(-dt * 2));
  ship.root.rotation.y = flight.yaw;
  fwd.set(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
  ship.root.position.addScaledVector(fwd, flight.speed * dt);
  ship.root.position.y += flight.climb * dt;
  keepClear(ship.root.position, ship.radius + 2);
  ship.update(dt, { thrust, flying: steering, cruising: cruising || (auto.active && Math.abs(flight.speed) > 1), stopped: Math.abs(flight.speed) < 1,
    visible: shipOnScreen(), turn: clamp(flight.yawVel / TURN_RATE, -1, 1), turnVel: flight.yawVel,
    accel: flight.accel, speedFrac: Math.min(1, Math.abs(flight.speed) / CRUISE), climb: flight.climb / MAX_CLIMB, reduced });
}

// Outside: third person, behind, above and a little to the side, following with a slight lag and easing back after a drag.
// Inside: the ship holds still and the camera orbits its centre with no ease-back. It never comes closer than the ship's
// outline in that direction, so it can't pass through a wall. Entering and leaving are timed glides between the two.
const insideRadius = dir => 1 / Math.sqrt((dir.x / 5.9) ** 2 + (dir.y / 4.6) ** 2 + (dir.z / 10.2) ** 2) + 1.2;
const local = new THREE.Vector3(), qShip = new THREE.Quaternion();
function cameraTargets(out) {
  // The centre the camera looks at: the ship, a little lower when inside so both decks and the belly show.
  out.copy(ship.root.position).y += view.mode === 'outside' || view.mode === 'leaving' ? 0.3 : -0.9;
  return out;
}
function follow(dt) {
  if (view.mode === 'free') {
    const f = a => held(FREE_KEYS, freeKeys, a), sp = free.speed * (f('fast') ? 3 : 1) * dt, cp = Math.cos(free.pitch);
    camDir.set(-Math.sin(free.yaw) * cp, Math.sin(free.pitch), -Math.cos(free.yaw) * cp);
    free.pos.addScaledVector(camDir, (f('fwd') - f('back')) * sp);
    free.pos.x += Math.cos(free.yaw) * (f('right') - f('left')) * sp; free.pos.z -= Math.sin(free.yaw) * (f('right') - f('left')) * sp;
    free.pos.y += (f('up') - f('down')) * sp;
    keepClear(free.pos, 0.5);                                     // never inside a planet, never lost in the void
    if (free.pos.distanceTo(ship.root.position) > 160) free.pos.sub(ship.root.position).setLength(160).add(ship.root.position);
    camera.position.copy(free.pos); camera.rotation.set(free.pitch, free.yaw, 0, 'YXZ');
    // The cut stays on one side; it only moves to the other side once the camera is well clear of the hull over there.
    camLocal.copy(free.pos).sub(ship.root.position).applyQuaternion(qInv.copy(ship.root.quaternion).invert());
    if (Math.abs(camLocal.x) > 7 && Math.sign(camLocal.x) !== free.side) { free.side = Math.sign(camLocal.x); ship.setCutSide(free.side); }
    ship.setView(camera);
    return;
  }
  const target = cameraTargets(tmpV);
  if (view.mode === 'entering' || view.mode === 'leaving') {
    view.t = reduced ? 1 : Math.min(1, view.t + dt / GLIDE);
    const e = view.t * view.t * (3 - 2 * view.t), f = view.from, to = view.to;
    chase.dist = f.dist + (to.dist - f.dist) * e;
    chase.yaw = f.yaw + wrapAngle(to.yaw - f.yaw) * e;
    chase.pitch = f.pitch + (to.pitch - f.pitch) * e;
    pivot.copy(f.pivot).lerp(target, e);
    look = view.mode === 'entering' ? 1 - e : e;   // the outside view looks a little ahead of the ship; inside looks at its centre
    if (view.closeLate && view.t > 0.5 && ship.openTarget) ship.setOpen(false);   // leaving the free camera: close once clear of the hull
    if (view.t >= 1) { if (view.mode === 'leaving') ship.setCutSide(null); view.mode = view.mode === 'entering' ? 'inside' : 'outside'; chase.tDist = chase.dist; updateLookBtn(); }
  } else {
    if (view.mode === 'outside' && !chase.dragging) {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 2.2);
      chase.yaw = YAW_REST + wrapAngle(chase.yaw - YAW_REST) * (1 - k); chase.pitch += (PITCH_REST - chase.pitch) * k;
    }
    chase.dist += (chase.tDist - chase.dist) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    pivot.copy(target);
    look = view.mode === 'outside' ? 1 : 0;
  }
  const a = flight.yaw + chase.yaw, cp = Math.cos(chase.pitch);
  desired.set(Math.sin(a) * cp, Math.sin(chase.pitch), Math.cos(a) * cp);
  if (view.mode !== 'outside') {
    // Keep the camera outside the ship's outline (measured in the ship's own frame), so it never clips into a wall.
    local.copy(desired).applyQuaternion(qShip.copy(ship.root.quaternion).invert());
    const minD = insideRadius(local);
    if (chase.dist < minD) { chase.dist = minD; chase.tDist = Math.max(chase.tDist, minD); }
  }
  desired.multiplyScalar(chase.dist).add(pivot);
  keepClear(desired, 1.5);
  if (!chase.ready || reduced) { camera.position.copy(desired); chase.ready = true; }
  else camera.position.lerp(desired, 1 - Math.exp(-dt * (view.mode === 'outside' ? 5 : 12)));
  camera.lookAt(tmpV.copy(pivot).addScaledVector(fwd, 1.5 * Math.cos(chase.yaw) * look));
  ship.setView(camera);
}
// While the camera is inside, the ship hovers in place and the pilot keeps living their life.
let lifeT = 0, look = 1, thrustBoost = 0;
function insideLife(dt) {
  flight.speed *= Math.exp(-dt * 3); if (Math.abs(flight.speed) < 0.05) flight.speed = 0;
  flight.climb *= Math.exp(-dt * 3);
  lifeT += dt;
  if (lifeT > 6 && !reduced && ship.atControls && !flight.speed) { lifeT = 0; if (Math.random() < 0.7) ship.crew.start(); }
}

// The pilot only animates while the ship is on screen.
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), shipSphere = new THREE.Sphere();
function shipOnScreen() {
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return frustum.intersectsSphere(shipSphere.set(ship.root.position, ship.radius));
}

// "Show in space" from the console: the ship turns to face that planet (the autopilot waits until it has).
function showPlanet(p) {
  leaveInside();
  const d = p.group.position.clone().sub(ship.root.position);
  flight.turnTo = Math.atan2(-d.x, -d.z);
  auto.active = false; auto.idle = 0; auto.state = 'pick';
  if (reduced) { flight.yaw = flight.turnTo; flight.turnTo = null; }
}

// A spot to start from: near a planet, about 70 degrees off the sun so its dark side shows.
const UP2 = new THREE.Vector3().crossVectors(SIDE, SUN_DIR);
function viewSpots(p, perps = [SIDE, SIDE.clone().negate(), UP2, UP2.clone().negate()]) {
  return perps.map(perp => {
    const out = SUN_DIR.clone().multiplyScalar(0.35).addScaledVector(perp, 0.94).normalize();
    return p.group.position.clone().addScaledVector(out, p.look.radius * 3.6 + 38);
  });
}

// ---------- Building the world ----------
let planets = [];
const world = new THREE.Group();
scene.add(world);
const stars = makeStars();
sky.add(stars, makeSun());
scene.background = bakeNebula();
let dust = null;

function disposeTree(o) {
  o.traverse(c => { c.geometry?.dispose(); for (const m of [].concat(c.material || [])) { m.map?.dispose(); m.dispose(); } });
}
// Bring the world in line with the saved goals. Planets that still exist are kept (and just resized),
// new goals get new planets, and removed goals lose theirs.
function loadPlanets(first) {
  const { list, examples } = readGoals();
  const old = new Map(planets.map(p => [p.id + '|' + p.myth, p]));
  planets = list.map(item => {
    const p = old.get(item.id + '|' + item.myth);
    if (!p) { const fresh = buildPlanet(item); thumbQueue.push(fresh); return fresh; }
    old.delete(item.id + '|' + item.myth);
    if (item.progress !== p.progress && !first) p.pulse = 1; // a soft glow when money comes in or goes out
    return Object.assign(p, item);
  });
  for (const p of old.values()) { world.remove(p.group); disposeTree(p.group); }
  const before = volume;
  layout(planets);
  for (const p of planets) if (!p.group.parent) { p.group.scale.setScalar(p.size); world.add(p.group); }
  if (!dust || before !== volume) {
    if (dust) { world.remove(dust); disposeTree(dust); }
    dust = makeDust(volume * 1.3); world.add(dust);
  }
  document.getElementById('banner').hidden = !examples;
  cv.setAttribute('aria-label', `Space view with your ship and ${planets.length} ${examples ? 'example ' : ''}planet${planets.length === 1 ? '' : 's'}. The ship flies itself when you're not steering. Fly with W, A, S, D or the arrow keys. Drag to look around the ship, scroll to zoom in and see inside.`);
  if (first) {
    // Start the ship near one planet, level with it and seen from the side, with as many other planets as possible ahead.
    let best = null;
    for (const p of planets) for (const pos of viewSpots(p, [SIDE, SIDE.clone().negate()])) {
      const dir = p.group.position.clone().sub(pos).normalize();
      const seen = planets.filter(q => q !== p && q.group.position.clone().sub(pos).normalize().dot(dir) > 0.75).length;
      if (!best || seen > best.seen) best = { p, pos, seen };
    }
    ship.root.position.copy(best.pos);
    const d = best.p.group.position.clone().sub(best.pos);
    ship.root.position.y = best.p.group.position.y; // level with it, so it sits ahead of the ship
    flight.yaw = Math.atan2(-d.x, -d.z) + 0.22;
  }
  refreshShip(examples);
}

// The money shown on the ship: from saved data, or from the example planets when there is none yet.
const PEAK_KEY = 'stashtronauts-debt-peak'; // the most ever owed, so the tow pod can shrink as debt is paid
function refreshShip(examples) {
  const tint = id => planets.find(p => p.id === id)?.look.biome.tint;
  let info;
  if (examples) {
    info = { totalSaved: EXAMPLES.reduce((t, e) => t + e.amount, 0), goals: EXAMPLES.map(e => ({ id: e.id, name: e.label, progress: e.progress })),
      emergencyMonths: 3100 / 2000, hasEmergencyFund: true, debt: 0, towPod: false };
  } else info = shipMoney(load());
  info.shipName = load().ship?.name || '';
  info.goals = info.goals.map(g => ({ ...g, color: tint(g.id) }));
  let peak = 0;
  try { peak = +localStorage.getItem(PEAK_KEY) || 0; if (info.debt > peak) localStorage.setItem(PEAK_KEY, peak = info.debt); } catch (e) {}
  info.debtPeak = peak;
  ship.setMoney(info);
}

addEventListener('storage', e => { if (e.key === KEY || e.key === NAMES_KEY) loadPlanets(); });
// Messages from the ship console.
addEventListener('stash:change', () => loadPlanets());
addEventListener('stash:thumbs', () => { for (const p of planets) if (!thumbQueue.includes(p)) thumbQueue.push(p); });
addEventListener('stash:show', e => { const p = planets.find(q => q.id === e.detail?.id); if (p) showPlanet(p); });
addEventListener('pageshow', e => { if (e.persisted) loadPlanets(); });
addEventListener('resize', resize);

// ---------- Planet portraits for the console ----------
// Each planet is photographed once into a small picture, seen from the same sunny side as in the world.
// It is drawn into a corner of the main canvas just before a normal frame, copied out, then drawn over.
const THUMB_W = 320, THUMB_H = 200;
const thumbScene = new THREE.Scene();
thumbScene.background = new THREE.Color('#0B1228');
thumbScene.add(new THREE.HemisphereLight('#3A4C8C', '#2A1C44', 0.2));
const thumbSun = new THREE.DirectionalLight('#FFF1DC', 3.2);
thumbSun.position.copy(SUN_DIR); thumbScene.add(thumbSun);
const thumbCam = new THREE.PerspectiveCamera(30, THUMB_W / THUMB_H, 0.5, 2000);
const thumbCanvas = Object.assign(document.createElement('canvas'), { width: THUMB_W, height: THUMB_H });
const thumbQueue = [], thumbUrls = new Map();
function photograph(p) {
  const g = p.group, home = g.position.clone(), scale = g.scale.x, parent = g.parent;
  if (!parent) return;
  thumbScene.add(g); g.position.set(0, 0, 0); g.scale.setScalar(1);
  const r = p.look.radius, span = r * (p.look.ring ? p.look.ring.outer : 1.25), half = THREE.MathUtils.degToRad(15);
  const dist = Math.max(r * 1.3 / Math.tan(half), span * 1.12 / (Math.tan(half) * thumbCam.aspect));
  const out = SUN_DIR.clone().multiplyScalar(0.5).addScaledVector(SIDE, 0.86).normalize();
  thumbCam.position.copy(out).multiplyScalar(dist); thumbCam.lookAt(0, 0, 0);
  const before = renderer.getViewport(new THREE.Vector4());
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, THUMB_W, THUMB_H); renderer.setViewport(0, 0, THUMB_W, THUMB_H);
  renderer.render(thumbScene, thumbCam);
  const pr = renderer.getPixelRatio();
  thumbCanvas.getContext('2d').drawImage(cv, 0, cv.height - THUMB_H * pr, THUMB_W * pr, THUMB_H * pr, 0, 0, THUMB_W, THUMB_H);
  renderer.setScissorTest(false); renderer.setViewport(before);
  parent.add(g); g.position.copy(home); g.scale.setScalar(scale);
  const id = p.id;
  thumbCanvas.toBlob(blob => {
    if (!blob) return;
    if (thumbUrls.has(id)) URL.revokeObjectURL(thumbUrls.get(id));
    thumbUrls.set(id, URL.createObjectURL(blob));
    dispatchEvent(new CustomEvent('stash:thumb', { detail: { id, url: thumbUrls.get(id) } }));
  }, 'image/jpeg', 0.9);
}

// ---------- Frame loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (dialogOpen()) keys.clear(); // no flying while the console is open
  fly(dt);
  follow(dt);
  // Planets grow toward their size, and glow softly for a moment after their goal changes.
  for (const p of planets) {
    const target = sizeFor(p.progress), s = p.group.scale.x;
    if (Math.abs(target - s) > 1e-4) p.group.scale.setScalar(reduced ? target : s + (target - s) * (1 - Math.exp(-dt * 2.5)));
    if (p.pulse > 0) { p.pulse = reduced ? 0 : Math.max(0, p.pulse - dt / 2.2); p.glow.value = 1 + Math.sin(p.pulse * Math.PI) * 1.4; }
  }
  if (!reduced) {
    elapsed += dt;
    for (const p of planets) p.body.rotation.y = p.look.spinPhase + elapsed * p.look.spin;
  }
  if (thumbQueue.length) photograph(thumbQueue.shift());
  sky.position.copy(camera.position);
  stars.material.uniforms.pr.value = renderer.getPixelRatio();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
loadPlanets(true);
requestAnimationFrame(frame);
