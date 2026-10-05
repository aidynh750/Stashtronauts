// Stashtronauts space view, in 3D with three.js.
// You fly a small ship with W/A/S/D or the arrow keys. The camera follows behind; drag to look around the ship, scroll to zoom.
// Everything is built in code. Nothing is sent to a server.
import * as THREE from 'three';
import { load, goalsOf, planetNames, shipMoney, isEmergencyFund, fmt, KEY, NAMES_KEY } from './money.js';
import { makeShip } from './ship.js';
import { makeFleet } from './fleet.js';
import { airProfile, airLevels, makeAirFX } from './atmosphere.js';
import { makeSurface, SURF_ORIGIN, CLOUD_BASE, EXIT_ALT, ENTRY_ALT } from './surface.js';
import { MOODS } from './pilot.js';
import { WORLD, SHIP_LEN } from './settings.js';

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
// A logarithmic depth buffer keeps depth precise from the pilot's cabin (centimetres) to the guardian carrier (kilometres away),
// so nothing flickers or clips. Custom shaders below include three's logdepth chunks for it.
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true; // for the ship's dollhouse cutaway
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, WORLD.camera.near, WORLD.camera.far);
// Floating origin: everything in the world (planets, ships, the fleet, the camera) lives in `universe`, whose position is
// moved now and then so the camera stays near the real origin. Positions in code stay in universe space; only what the
// GPU sees is re-centred, so nothing jitters however far you fly. The sky and the sun stay outside it, around the camera.
const universe = new THREE.Group(), origin = new THREE.Vector3();
scene.add(universe); universe.add(camera);
const camWorld = new THREE.Vector3(), lookTmp = new THREE.Vector3();
const camLookAt = v => camera.lookAt(lookTmp.copy(v).add(universe.position));   // lookAt wants world space
let baseFov = 60;
// Calm space (a console setting, and always on with reduced motion): the guardian fleet's guns hold still and fire nothing.
let calmSpace = false;
// What the air around the ship is doing (filled in by atmosphere.js each frame; see makeAirFX below).
let air = { maxSpeed: Infinity, flare: 0, shake: new THREE.Vector3(), fov: 0, starFade: 1, layer: null };
const coarse = matchMedia('(pointer: coarse)').matches; // phones and tablets get fewer pixels to draw

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // On tall phone screens, widen the view so it is never a narrow slit.
  const minWide = THREE.MathUtils.degToRad(64);
  camera.fov = baseFov = Math.min(95, Math.max(60, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minWide / 2) / camera.aspect))));
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
  const r = rng(424242), count = coarse ? 6000 : 9000, R = WORLD.camera.starDistance;   // far beyond any planet, so nothing is ever behind the stars
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
    uniforms: { pr: { value: 1 }, fade: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float pr;
      void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pr;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
      varying vec3 vC; uniform float fade;
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(vC * a * fade, 1.0); }`,
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
    const D = WORLD.camera.sunDistance; s.scale.setScalar(scale * 20 * D / 44000); s.position.copy(SUN_DIR).multiplyScalar(D); s.renderOrder = -1; group.add(s);
  };
  add([[0, 'rgba(255,214,160,0.5)'], [0.3, 'rgba(255,170,110,0.12)'], [1, 'rgba(255,140,90,0)']], 1500, 0.8);
  add([[0, 'rgba(255,255,245,1)'], [0.22, 'rgba(255,240,205,1)'], [0.32, 'rgba(255,205,140,0.45)'], [1, 'rgba(255,180,120,0)']], 190, 1);
  return group;
}

// Fine dust hanging still in space. It never moves, but it slides past as you fly, which sells depth and speed.
// It fills a box around the camera; specks that fall out of the box wrap round to the other side (see wrapDust).
const DUST_BOX = 700;
function makeDust() {
  const r = rng(777), count = coarse ? 500 : 900, pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = (r() - 0.5) * DUST_BOX;
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
  { id: 'ex3', myth: 'Calypso', label: 'Trip to Japan', amount: 800, target: 4000 },
  { id: 'ex4', myth: 'Vesta', label: 'New laptop', amount: 1200, target: 1200 },
  { id: 'ex5', myth: 'Hyperion', label: 'House deposit', amount: 9000, target: 30000 },
].map((p, slot) => ({ ...p, slot, progress: p.amount / p.target }));
// An example debt, shown as a stormy planet when there's no saved data yet.
const EXAMPLE_DEBT = { id: 'debt-ex', myth: 'Tempest', label: 'Credit card', slot: 1000, progress: 0.55, debt: true, storm: 0.7 };
const EXAMPLE_FUND = 3100;   // the example emergency fund: $3,100, guarded by the fleet instead of a planet

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

// The emergency fund is not a planet: it's the guardian fleet (fleet.js). It keeps its name and slot, so nothing moves.
// Debts are stormy planets: the storm is how much is still owed compared with the most ever owed on that debt.
const STORM_NAMES = ['Tempest', 'Typhon', 'Nimbus', 'Squall', 'Maelstrom', 'Gale', 'Cyclone', 'Thunderhead', 'Brontes', 'Aeolus'];
const DEBT_PEAKS_KEY = 'stashtronauts-debt-peaks';
function debtPlanets(S, taken) {
  let peaks = {}; try { peaks = JSON.parse(localStorage.getItem(DEBT_PEAKS_KEY)) || {}; } catch (e) {}
  const out = S.debts.filter(d => +d.balance > 0).map((d, i) => {
    const bal = +d.balance; peaks[d.id] = Math.max(+peaks[d.id] || 0, bal);
    let k = hash(d.id) % STORM_NAMES.length, myth = STORM_NAMES[k];
    for (let n = 2; taken.has(myth); k++) myth = STORM_NAMES[k % STORM_NAMES.length] + (k >= STORM_NAMES.length ? ' ' + n++ : '');
    taken.add(myth);
    return { id: 'debt-' + d.id, myth, slot: 1000 + i, label: d.name, progress: 0.55, debt: true, storm: clamp(bal / peaks[d.id], 0.15, 1) };
  });
  try { localStorage.setItem(DEBT_PEAKS_KEY, JSON.stringify(peaks)); } catch (e) {}
  return out;
}
function readGoals() {
  const S = load(), goals = goalsOf(S);
  if (!goals.length) return { list: [...EXAMPLES, EXAMPLE_DEBT], examples: true };
  const names = planetNames(goals);
  const list = goals.filter(g => !isEmergencyFund(g)).map(g => ({ id: g.id, myth: names[g.id].myth, slot: names[g.id].slot, label: g.name,
    progress: clamp((+g.amount || 0) / (+g.target || 1), 0, 1) }));
  return { list: [...list, ...debtPlanets(S, new Set(list.map(p => p.myth)))], examples: false };
}
const STORM_BIOME = { name: 'storm', tint: '#5A5470', kind: 'bands', land: ['#3E3A52', '#4A4560', '#5A5470', '#36324A', '#6A6382', '#433E58'], atmo: '#8A80B8' };
// A planet starts at a fraction of its full size (settings.js) and reaches full size when its goal is met.
const PW = WORLD.planets;
const sizeFor = progress => PW.startSize + (1 - PW.startSize) * progress;

// Decide a planet's look from its name. Same name in, same planet out.
// The +27 nudges the seeds so the first few planets someone makes all get different biomes.
// Planets are huge (settings.js): the smallest is at least 100 ship lengths across even when its goal has only just
// started, and the largest about 500 at full size. (old is the planet's seeded size from before, 7 to 19.)
const R_MIN = PW.smallestDiameter * SHIP_LEN / 2 / PW.startSize, R_MAX = PW.largestDiameter * SHIP_LEN / 2;
const PLANET_R = old => R_MIN + clamp((old - 7) / 12, 0, 1) * (R_MAX - R_MIN);
function makeLook(name, debt = false) {
  const r = rng(hash(name) + 27);
  let biome = BIOMES[Math.floor(r() * BIOMES.length)];
  const radius = PLANET_R(biome.kind === 'bands' ? 13 + r() * 6 : 7 + r() * 5);
  if (debt) biome = STORM_BIOME;
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
const ATMO_VERT = `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vWN; varying vec3 vP;
void main(){ vN = normalize(normalMatrix * normal); vWN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const LOGDEPTH_FRAG = '#include <logdepthbuf_pars_fragment>\n';
function atmosphere(color, radius, haloK = 1.18) {
  const uniforms = { color: { value: new THREE.Color(color) }, sunDir: { value: SUN_DIR }, edge: { value: Math.sqrt(1 - 1 / (haloK * haloK)) }, boost: { value: 1 } };
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * haloK, 64, 40), new THREE.ShaderMaterial({
    uniforms, vertexShader: ATMO_VERT, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: LOGDEPTH_FRAG + `uniform vec3 color; uniform vec3 sunDir; uniform float edge; uniform float boost; varying vec3 vN; varying vec3 vWN; varying vec3 vP;
      void main(){
        #include <logdepthbuf_fragment>
        float k = clamp(-dot(vN, normalize(-vP)) / edge, 0.0, 1.0);
        float lit = smoothstep(-0.45, 0.7, dot(normalize(vWN), sunDir));
        gl_FragColor = vec4(color * pow(k, 2.6) * (0.08 + 1.1 * lit) * boost, 1.0); }`,
  }));
  const haze = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, 64, 40), new THREE.ShaderMaterial({
    uniforms, vertexShader: ATMO_VERT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: LOGDEPTH_FRAG + `uniform vec3 color; uniform vec3 sunDir; uniform float boost; varying vec3 vN; varying vec3 vWN; varying vec3 vP;
      void main(){
        #include <logdepthbuf_fragment>
        float f = pow(1.0 - max(dot(vN, normalize(-vP)), 0.0), 2.4);
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
  const geo = new THREE.RingGeometry(look.radius * inner, look.radius * outer, 256, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide,
    depthWrite: false, roughness: 1, metalness: 0, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.22 }));
  mesh.rotation.x = -Math.PI / 2 + look.ring.tilt;
  return mesh;
}

// One surface mesh at a given detail. The same noise at every detail, so all levels show the same seeded planet.
function surfaceGeometry(look, N, detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail); // non-indexed, so every face can get its own flat color
  const pos = geo.attributes.position, n = pos.count, hs = new Float32Array(n), v = new THREE.Vector3(), fr = rng(look.seed + 1);
  const [ox, oy, oz] = look.off, f = look.freq, cache = new Map();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // Shared corners appear up to six times; work each one out once.
    const key = Math.round(v.x * 1e5) * 4e10 + Math.round(v.y * 1e5) * 2e5 + Math.round(v.z * 1e5);
    let h = cache.get(key); if (h === undefined) { h = N(v.x * f + ox, v.y * f + oy, v.z * f + oz); cache.set(key, h); }
    hs[i] = h;
    v.multiplyScalar(look.radius * surfaceHeight(look, h));
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
  return { geo, hs, pos, n };
}
// A sphere of cloud above the planet: seeded noise painted onto a canvas (seamless, since it's sampled on the sphere).
function cloudShell(look, air, radius) {
  const W = coarse ? 256 : 512, H = W / 2, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), N = makeNoise(look.seed + 99), cover = air.coverage;
  for (let y = 0; y < H; y++) {
    const lat = (y / H - 0.5) * Math.PI, cy = Math.sin(-lat), cr = Math.cos(lat);
    for (let x = 0; x < W; x++) {
      const lon = x / W * Math.PI * 2, px = Math.cos(lon) * cr, pz = Math.sin(lon) * cr;
      const n = N(px * 2.2 + 5, cy * 4.5 + 9, pz * 2.2 + 1, 4) * 0.5 + 0.5;
      const a = clamp((n - (1 - cover)) / 0.22, 0, 1), o = (y * W + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * a * 235;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), new THREE.MeshStandardMaterial({ map: tex, color: air.cloudTint,
    transparent: true, depthWrite: false, side: THREE.FrontSide, roughness: 1, metalness: 0, emissive: air.cloudTint, emissiveIntensity: 0.06 }));
  m.renderOrder = 1;
  return m;
}

function buildPlanet(p) {
  const look = makeLook(p.myth, p.debt), N = makeNoise(look.seed), fr = rng(look.seed + 1);
  const air = airProfile(look, rng(look.seed + 5), p.debt ? p.storm : 0);
  // Level of detail: a coarse ball far away, finer as you come close, and the two finest only built once you're near.
  const DETAIL = coarse ? [8, 18, 30, 40] : [10, 24, 44, 64];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  const mid = surfaceGeometry(look, N, DETAIL[1]);
  const lod = new THREE.LOD();
  lod.addLevel(new THREE.Mesh(mid.geo, mat), look.radius * 3.2);
  lod.addLevel(new THREE.Mesh(surfaceGeometry(look, N, DETAIL[0]).geo, mat), look.radius * 9);
  // The finer levels are built the first time someone comes close (see the frame loop), so start-up stays quick.
  let fine = null;
  const refine = () => { fine = { distance: 0, object: new THREE.Mesh(surfaceGeometry(look, N, DETAIL[2]).geo, mat) }; lod.addLevel(fine.object, 0); lod.levels.sort((a, b) => a.distance - b.distance); };
  const refine2 = () => {
    const lvl = lod.levels.find(l => l.object === fine?.object); if (lvl) lvl.distance = look.radius * PW.finestWithin;
    lod.addLevel(new THREE.Mesh(surfaceGeometry(look, N, DETAIL[3]).geo, mat), 0); lod.levels.sort((a, b) => a.distance - b.distance);
  };
  const { hs, pos, n } = mid;

  // tilt holds the axis tilt, body spins around it. Moons ride along with the slow spin.
  const tilt = new THREE.Group(), body = new THREE.Group();
  tilt.rotation.z = look.tilt; tilt.add(body);
  body.rotation.y = look.spinPhase;
  body.add(lod);

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

  const moons = [];
  for (const m of look.moons) {
    const pivot = new THREE.Group();
    pivot.rotation.set(m.incl, m.angle, 0);
    const mr = look.radius * m.size;
    const mg = new THREE.IcosahedronGeometry(mr, 1);
    const moon = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: tmpColor.setHSL(0.6 + m.tint * 0.15, 0.12, 0.62).clone(),
      flatShading: true, roughness: 1 }));
    moon.position.x = look.radius * m.dist;
    pivot.add(moon); body.add(pivot); moons.push({ mesh: moon, r: mr * 1.05 });
  }

  const group = new THREE.Group();
  group.add(tilt);
  // The glow ring sits just outside the cloud tops; the cloud shell turns a little faster than the ground.
  // (The same heights as airLevels, worked out at the planet's starting size.)
  const R0 = look.radius * sizeFor(p.progress), deck0 = Math.max(R0 * (air.surf + 0.05), R0 * air.surf + 2 * 9.5 + 6);
  const cloudR = (deck0 + Math.max(R0 * air.cloud, 35)) / sizeFor(p.progress), clouds = cloudShell(look, air, cloudR);
  const atmo = atmosphere(look.biome.atmo, look.radius, cloudR / look.radius + 0.06);
  group.add(...atmo.shells);
  tilt.add(clouds);
  if (look.ring) tilt.add(makeRing(look));
  const airTop = air.surf + 0.05 + air.cloud + air.upper + air.glow;
  return { ...p, look, air, group, body, clouds, lod, refine, refine2, refined: 0, moons, glow: atmo.uniforms.boost, size: sizeFor(p.progress), pulse: 0, airGlow: 1,
    reach: look.radius * Math.max(look.ring ? look.ring.outer : 1.2, airTop, ...look.moons.map(m => m.dist + m.size)) };
}

// Scatter planets through a big volume: above, below, behind, near and far.
// Each spot comes from the planet's name. Planets are placed in the order their goals were made, each one only
// avoiding the ones before it, so adding a goal never moves the planets that are already out there.
// Planets are far apart, with big empty space between them (each one's reach includes its air, rings and moons).
// Debt planets are placed after all the goal planets.
let volume = 3000;
const spreadFor = slot => PW.spreadBase + PW.spreadPerSlot * Math.sqrt(slot + 1);
function layout(planets) {
  const goalMax = Math.max(0, ...planets.filter(p => !p.debt).map(p => p.slot));
  for (const p of planets) p.spreadSlot = p.debt ? goalMax + 1 + (p.slot - 1000) : p.slot;
  volume = spreadFor(Math.max(0, ...planets.map(p => p.spreadSlot)));
  const placed = [];
  for (const p of [...planets].sort((a, b) => a.slot - b.slot)) {
    const r = rng(hash(p.myth) + 11), v = new THREE.Vector3();
    let spread = spreadFor(p.spreadSlot);
    for (let tries = 0; ; tries++) {
      const th = r() * Math.PI * 2, y = r() * 1.6 - 0.8, d = lerp(PW.nearest + p.reach, spread, Math.pow(r(), 0.8));
      v.set(Math.cos(th) * Math.sqrt(1 - y * y), y, Math.sin(th) * Math.sqrt(1 - y * y)).multiplyScalar(d);
      if (placed.every(q => q.group.position.distanceTo(v) > q.reach + p.reach + PW.minGap)) break;
      if (tries > 40) spread *= 1.03; // crowded: let it drift a little further out
    }
    p.group.position.copy(v);
    placed.push(p);
  }
}

// ---------- The player's ship and the chase camera ----------
const ship = makeShip();
universe.add(ship.root); scene.add(...ship.world);   // the trail and tow pod are drawn in render space (see rebase)
// The emergency fund's guardian fleet: a mothership and its fighters, far from everything.
const fleet = makeFleet({ planets: () => planets, clearance: p => autoClear(p), shipPos: ship.root.position, shipRadius: ship.radius,
  volume: () => volume, toast: msg => toast(msg) });
universe.add(fleet.root, fleet.fx);   // the mothership, and its tracers, missiles, smoke and practice drones
const airFX = makeAirFX({ universe, camera, shipRadius: ship.radius });
// Below the clouds: the surface of the planet you've flown down into (surface.js).
const surface = makeSurface({ universe, scene, camera, sun: sunLight, makeNoise, rng });
const veilEl = document.getElementById('cloudVeil'), layerEl = document.getElementById('layerLine');
// descent: going down ('down', the clouds closing in) or null. noDescend: a planet just left, until the ship is clear of its clouds.
const descent = { phase: null, planet: null, dir: new THREE.Vector3() };
let noDescend = null, veil = 0, veilWant = 0, gearZone = 'high';
const SURF_AIR = { maxSpeed: 180, flare: 0, shake: new THREE.Vector3(), fov: 0, starFade: 1, layer: 'Surface' };
const surfLocal = new THREE.Vector3(), surfCam = new THREE.Vector3();
// Speeds (settings.js): a comfortable top speed near things, Shift for a fast boost, and far from everything Shift keeps
// ramping up into a very fast cruise that slows down by itself as anything comes near.
const SP = WORLD.speed, GRAV = WORLD.gravity, COL = WORLD.collision;
const MAX_SPEED = SP.top, MAX_BACK = SP.back, MAX_CLIMB = SP.climb, TURN_RATE = SP.turn, BOOST_MAX = SP.boost;
// The ship flies in its own frame: flight.q turns it; shipUp is its up and shipFwd its nose. Outside every planet's gravity
// zone its up drifts back to the world's up; inside one it turns smoothly to point away from the planet's centre, so the belly
// faces the ground, the horizon levels out, and Space / C mean away from / toward the planet. A/D always turn about the
// ship's own up. sink is momentum toward the planet that carries on as a fading descent; push is a soft bump off a hull.
const flight = { q: new THREE.Quaternion(), speed: 0, yawVel: 0, climb: 0, sink: 0, accel: 0, turnTo: null, push: new THREE.Vector3(), bump: 0,
  gravity: 0, room: Infinity, hullDist: Infinity, sparkT: 0, touchT: 9 };
const WORLD_UP = new THREE.Vector3(0, 1, 0), shipUp = new THREE.Vector3(0, 1, 0), shipFwd = new THREE.Vector3(0, 0, -1), camUp = new THREE.Vector3(0, 1, 0);
const fq1 = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), fv1 = new THREE.Vector3(), fv2 = new THREE.Vector3(), fv3 = new THREE.Vector3(), fm = new THREE.Matrix4();
function frameVectors() { shipUp.set(0, 1, 0).applyQuaternion(flight.q); shipFwd.set(0, 0, -1).applyQuaternion(flight.q); fwd.copy(shipFwd); }
// The signed angle (about the ship's up) from its nose to a direction.
function headingTo(dir) {
  fv1.copy(dir).addScaledVector(shipUp, -dir.dot(shipUp)); if (fv1.lengthSq() < 1e-12) return 0; fv1.normalize();
  return Math.atan2(fv2.crossVectors(shipFwd, fv1).dot(shipUp), shipFwd.dot(fv1));
}
// Level the ship with a given up, nose as close to a given direction as it can be.
function setFrame(up, forward) {
  const f = fv1.copy(forward).addScaledVector(up, -forward.dot(up));
  if (f.lengthSq() < 1e-10) f.copy(Math.abs(up.y) < 0.9 ? WORLD_UP : fv2.set(1, 0, 0)).cross(up);
  f.normalize(); const r = fv2.crossVectors(f, up).normalize();
  flight.q.setFromRotationMatrix(fm.makeBasis(r, fv3.copy(up), f.negate())); frameVectors();
}
const setHeading = yaw => { flight.q.setFromAxisAngle(WORLD_UP, yaw); frameVectors(); };
// Default view: behind, above and a little to the right of the ship (a back three-quarter view).
const PITCH_REST = 0.3, YAW_REST = 0.7, FAR = 26;
// Camera and hull share one state machine: outside -> entering -> inside -> leaving -> outside.
// Only this machine opens or closes the hull. Scrolling in past ENTER_AT (1x the ship's length) enters; inside, only
// scrolling out past EXIT_AT (1.8x) or the "Back outside" button leaves. Both measure the camera's target distance.
const ENTER_AT = SHIP_LEN * 1.0, EXIT_AT = SHIP_LEN * 1.8;
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
  if (e.code === 'Escape' && fleetView()) { leaveFleet(); e.preventDefault(); return; }
  // DEBUG (temporary): L extends and retracts the landing gear, until landing on planets is built (it will call ship.setLandingGear).
  if (e.code === 'KeyL' && !e.ctrlKey) { if (!e.repeat) ship.setLandingGear(!ship.landingGear); return; }
  // X: skip straight back up to space from a planet's surface (or from the clouds on the way down).
  if (e.code === 'KeyX' && !e.ctrlKey && (surface.active || descent.phase)) { if (!e.repeat) skipToSpace(); e.preventDefault(); return; }
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
  if (fleetView()) { fleetCam.dist = clamp(d, fleetCam.close ? 2 : fleet.size.L * 0.08, fleet.size.L * 3.5); return; }
  if (view.mode === 'entering' || view.mode === 'leaving' || view.mode === 'free') return;   // the glide owns the camera; extra scrolling can't flip it
  if (view.mode === 'outside') {
    chase.tDist = clamp(d, ENTER_AT, 70);
    if (d < ENTER_AT) enterInside();
  } else {
    chase.tDist = clamp(d, 1, EXIT_AT + 1);
    if (d > EXIT_AT) leaveInside(Math.min(70, d));
  }
}
const zoom = f => setZoom((fleetView() ? fleetCam.dist : chase.tDist) * f);
const lookBtn = document.getElementById('lookCloser');
const freeBtn = document.getElementById('freeCam');
function updateLookBtn() {
  const inside = view.mode === 'inside' || view.mode === 'entering';
  lookBtn.textContent = fleetView() ? 'Back to ship' : inside ? 'Back outside' : 'Look closer';
  lookBtn.setAttribute('aria-pressed', inside);
  lookBtn.hidden = view.mode === 'free';
  freeBtn.hidden = fleetView();
  fleetGo.textContent = fleetView() ? 'Back to ship' : 'Show the fleet';
  freeBtn.textContent = view.mode === 'free' ? 'Back to ship' : 'Free camera';
  freeBtn.setAttribute('aria-pressed', view.mode === 'free');
}
// Glide the camera from where it is now to a new distance, angle and centre, easing in and out.
function glide(to, dur = GLIDE) {
  view.from = { dist: chase.dist, yaw: chase.yaw, pitch: chase.pitch, pivot: pivot.clone() };
  view.to = to; view.t = 0; view.dur = dur;
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
  if (fleetView()) { leaveFleet(); return; }
  if (view.mode === 'outside' || view.mode === 'leaving') return;
  view.mode = 'leaving'; view.closeLate = false; ship.setOpen(false);
  const d = clamp(dist, ENTER_AT + 2, 70);
  glide({ dist: d, yaw: YAW_REST, pitch: PITCH_REST });
  chase.tDist = d; updateLookBtn();
}
lookBtn.addEventListener('click', () => (view.mode === 'inside' || view.mode === 'entering' || fleetView()) ? leaveInside() : enterInside());
freeBtn.addEventListener('click', () => toggleFree());

// ---------- Free camera: detach from the ship and fly the camera anywhere, through the open hull into every room ----------
const free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 5, side: 1 };
const camDir = new THREE.Vector3(), camLocal = new THREE.Vector3(), qInv = new THREE.Quaternion();
function toggleFree() { if (surface.active) return; if (fleetView()) return leaveFleet(); view.mode === 'free' ? leaveFree() : enterFree(); }
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
  off.applyQuaternion(qInv.copy(flight.q).invert());   // into the ship's own frame
  chase.dist = d; chase.pitch = Math.asin(clamp(off.y / d, -1, 1)); chase.yaw = Math.atan2(off.x, off.z);
  freeKeys.clear();
  view.mode = 'leaving'; view.closeLate = true;
  glide({ dist: clamp(Math.max(FAR, d), ENTER_AT + 2, 70), yaw: YAW_REST, pitch: PITCH_REST });
  chase.tDist = view.to.dist; updateLookBtn();
}
// ---------- Fleet view: the camera flies over to the guardian mothership and circles it ----------
// focus is the point it circles, in the mothership's own space (its middle unless set).
const fleetCam = { yaw: 0, pitch: 0.3, dist: 80, t: 0, from: new THREE.Vector3(), fromLook: new THREE.Vector3(), look: new THREE.Vector3(), focus: new THREE.Vector3(), close: false };
const fleetView = () => view.mode === 'toFleet' || view.mode === 'fleet';
function enterFleet() {
  if (!fleet.present || fleetView() || surface.active) return;
  if (view.mode !== 'outside') { ship.setOpen(false); ship.setCutSide(null); }
  keys.clear(); freeKeys.clear(); auto.active = false; auto.idle = 0; flight.turnTo = null; chase.dragging = false;
  fleetCam.from.copy(camera.position); camera.getWorldDirection(camDir); fleetCam.fromLook.copy(camera.position).addScaledVector(camDir, 30);
  // A three-quarter view of the open hangar side, from a little above and in front.
  fleetCam.yaw = Math.atan2(-0.85, -0.55) + fleet.yaw; fleetCam.pitch = 0.32; fleetCam.dist = fleet.size.L * 1.15; fleetCam.t = 0;
  view.mode = 'toFleet'; updateLookBtn();
}
function leaveFleet() {
  if (!fleetView()) return;
  // Glide back to the ship from wherever the camera is, like leaving the free camera.
  pivot.copy(fleetCam.look);
  const off = camera.position.clone().sub(pivot), d = Math.max(1, off.length());
  off.applyQuaternion(qInv.copy(flight.q).invert());   // into the ship's own frame
  chase.dist = d; chase.pitch = Math.asin(clamp(off.y / d, -1, 1)); chase.yaw = Math.atan2(off.x, off.z);
  view.mode = 'leaving'; view.closeLate = false;
  glide({ dist: FAR, yaw: YAW_REST, pitch: PITCH_REST }, reduced ? GLIDE : 2.6);
  chase.tDist = FAR; updateLookBtn();
}
const fleetDir = new THREE.Vector3(), fleetPos = new THREE.Vector3(), fleetC = new THREE.Vector3();
function followFleet(dt) {
  if (!fleet.present) { leaveFleet(); return; }
  const c = fleet.toWorld(fleetCam.focus, fleetC), cp = Math.cos(fleetCam.pitch);
  fleetDir.set(Math.sin(fleetCam.yaw) * cp, Math.sin(fleetCam.pitch), Math.cos(fleetCam.yaw) * cp);
  fleetPos.copy(c).addScaledVector(fleetDir, fleetCam.dist);
  keepClear(fleetPos, 2, !fleetCam.close, false);   // never inside a planet or the hull
  if (view.mode === 'toFleet') {
    fleetCam.t = reduced ? 1 : Math.min(1, fleetCam.t + dt / 3);
    const e = fleetCam.t * fleetCam.t * (3 - 2 * fleetCam.t);
    camera.position.lerpVectors(fleetCam.from, fleetPos, e);
    fleetCam.look.lerpVectors(fleetCam.fromLook, c, e);
    if (fleetCam.t >= 1) { view.mode = 'fleet'; updateLookBtn(); }
  } else {
    camera.position.lerp(fleetPos, reduced ? 1 : 1 - Math.exp(-dt * 4));
    fleetCam.look.lerp(c, reduced ? 1 : 1 - Math.exp(-dt * 4));
  }
  camLookAt(fleetCam.look);
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
  if (pointers.size === 1 && fleetView()) {
    fleetCam.yaw -= (e.clientX - p.x) * 0.0045; fleetCam.pitch = clamp(fleetCam.pitch + (e.clientY - p.y) * 0.004, -0.9, 1.3);
  } else if (pointers.size === 1 && view.mode === 'free') {
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
  if (view.mode === 'free') { free.speed = clamp(free.speed * Math.exp(-px * 0.0015), 0.5, WORLD.camera.freeMaxSpeed); return; } // scroll sets the free camera's speed (up to fast enough to cross between planets)
  zoom(Math.exp(px * 0.0012));
}, { passive: false });

// Cameras never go below a planet's highest ground; the ship has its own gentle hold at the cloud deck (see holdAtDeck).
// The autopilot and the fighters keep well outside the air (autoClear). Nothing drifts off into nowhere.
const surfaceClear = p => airLevels(p, ship.radius).surf;
const autoClear = p => { const L = airLevels(p, ship.radius); return L.upperTop + L.R * 0.2; };
function keepClear(pos, pad, withFleet = true, bounded = true, withPlanets = true) {
  if (withPlanets) for (const p of planets) {
    tmpV.copy(pos).sub(p.group.position);
    const min = surfaceClear(p) + pad;
    if (tmpV.length() < min) pos.copy(p.group.position).addScaledVector(tmpV.normalize(), min); // slide along it
  }
  if (withFleet) fleet.keepClear(pos, pad);   // and never into the guardian mothership
  if (bounded && pos.length() > camReach() * 1.3) pos.setLength(camReach() * 1.3);
}
// The cameras (not the ship) may go far enough out to see the whole guardian fleet.
const camReach = () => Math.max(volume * 1.5, fleet.reach);

// ---------- Autopilot: when nobody is steering, cruise between waypoints, hover a while, and go somewhere new ----------
const AUTO_AFTER = 3, CRUISE = 30, ARRIVE = WORLD.autopilot.arrive;
const auto = { idle: 0, active: false, target: null, state: 'pick', hover: 0, travel: 0, heading: null, askedCrew: false };
// Distance from point c to the segment a-b.
function segDist(a, b, c) {
  const ab = tmpV.copy(b).sub(a), t = clamp(c.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(c);
}
function pickWaypoint() {
  const pos = ship.root.position, margin = ship.radius + 10;
  // Left inside a planet's air by the pilot? Climb straight back out first.
  for (const p of planets) {
    const rel = pos.clone().sub(p.group.position), c = autoClear(p);
    if (rel.length() < c) { auto.heading = rel.clone().normalize(); return p.group.position.clone().addScaledVector(auto.heading, c + 250); }
  }
  for (let tries = 0; tries < 60; tries++) {
    let cand;
    if (planets.length && Math.random() < 0.3) {
      // Cruise past a planet, keeping a comfortable distance.
      const p = planets[Math.floor(Math.random() * planets.length)], a = Math.random() * Math.PI * 2;
      cand = p.group.position.clone().add(new THREE.Vector3(Math.cos(a), (Math.random() - 0.5) * 0.4, Math.sin(a)).normalize().multiplyScalar(autoClear(p) + margin + p.look.radius * (0.1 + Math.random() * 0.5)));
    } else {
      // A clearly different direction from the last trip, a good distance away.
      const turn = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 1.6), AP = WORLD.autopilot, d = AP.legMin + Math.random() * (AP.legMax - AP.legMin);
      cand = shipFwd.clone().applyAxisAngle(shipUp, turn).addScaledVector(shipUp, (Math.random() - 0.5) * 0.35).normalize().multiplyScalar(d).add(pos);
    }
    if (cand.length() > volume * 1.25 || cand.distanceTo(pos) < WORLD.autopilot.legMin * 0.5) continue;
    const dir = cand.clone().sub(pos).normalize();
    if (auto.heading && dir.dot(auto.heading) > 0.65) continue; // not the same way again
    if (planets.some(p => segDist(pos, cand, p.group.position) < autoClear(p) + margin)) continue;
    if (fleet.blocks(pos, cand, margin)) continue;
    auto.heading = dir;
    return cand;
  }
  // Nothing good nearby (crowded or near the edge): head back toward the middle.
  const back = pos.clone().multiplyScalar(-1).setLength(600).add(pos);
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
    const diff = headingTo(to);
    // Slow right down for big turns (so it turns in place instead of looping), and ease in when arriving.
    const align = Math.max(0, Math.cos(diff)) ** 2;
    // Long legs are flown fast and the last stretch slowly, so trips between far planets don't drag. Like the pilot, it
    // never goes faster than the room ahead allows.
    const speed = Math.min(clamp(dist * 0.22, 20, SP.autopilot), Math.max(20, flight.room * SP.cruiseReach)) * align;
    if (dist < ARRIVE || auto.travel > 150) {
      auto.state = 'hover'; auto.hover = 5 + Math.random() * 4; auto.askedCrew = false;
    }
    return { speed, turn: clamp(diff * 1.1, -1, 1), climb: clamp(to.dot(shipUp) / Math.max(12, dist * 0.15), -1, 1), cruising: true };
  }
  // Hover: a few seconds, or as long as the pilot is busy with something. Sometimes the pilot gets up for a while.
  auto.hover -= dt;
  if (!auto.askedCrew && auto.hover < 3) { auto.askedCrew = true; if (Math.random() < 0.6) ship.crew.start(); }
  if (auto.hover <= 0 && ship.atControls) auto.state = 'pick';
  return { speed: 0, turn: 0, climb: 0, cruising: false };
}

// How much room there is around a point: to the nearest planet's cloud deck, moon, or the mothership's hull. Cruise and
// climb speeds are limited by it, so the ship always slows down by itself as anything comes near.
function roomAt(pos) {
  let c = Infinity;
  if (!surface.active) for (const p of planets) {
    c = Math.min(c, pos.distanceTo(p.group.position) - airLevels(p, ship.radius).deck);
    for (const m of p.moons) c = Math.min(c, m.mesh.getWorldPosition(fv3).sub(universe.position).distanceTo(pos) - m.r * p.group.scale.x - ship.radius);
  }
  flight.hullDist = fleet.present && !surface.active ? fleet.hullSurfaceDist(pos, WORLD.warnings.level2 * SHIP_LEN * 1.5) : Infinity;
  return Math.max(0, Math.min(c, flight.hullDist));
}
// The gravity zone: from the top of a planet's air down to the ground. Returns how strongly the ship's up should point
// away from the nearest planet (0 to 1, a smoothstep down through the outer glow and upper air) and sets gravUp to that way.
const gravUp = new THREE.Vector3(), targetUp = new THREE.Vector3(), radialBefore = new THREE.Vector3();
let gravPlanet = null;
function gravityAt(pos) {
  let best = 0, bp = null;
  if (!surface.active) for (const p of planets) {
    const L = airLevels(p, ship.radius), d = pos.distanceTo(p.group.position);
    if (d > L.glowTop) continue;
    const w = smooth01(L.upperTop + (L.glowTop - L.upperTop) * (1 - GRAV.alignFrom), L.cloudTop, d);
    if (w > best || !bp) { best = w; bp = p; }
  }
  if (bp) gravUp.copy(pos).sub(bp.group.position).normalize();
  gravPlanet = best > 0 ? bp : null;
  return best;
}
// Smooth acceleration, gentle slowdown, and turning that eases in and out.
function fly(dt) {
  const on = k => held(FLIGHT_KEYS, keys, k);
  const live = view.mode === 'outside';
  let ahead = live ? on('fwd') - on('back') : 0, turnIn = live ? on('left') - on('right') : 0, climbIn = live ? on('up') - on('down') : 0;
  const outside = view.mode === 'outside';
  const steering = (on('fwd') || on('back') || on('left') || on('right') || on('up') || on('down')) > 0 && outside;
  const boosting = live && on('boost') && ahead > 0;   // Shift + forward: boost, and far from everything a very fast cruise
  // Any key takes over at once; letting go hands back to the autopilot after a few quiet seconds.
  auto.idle = steering || flight.turnTo !== null ? 0 : auto.idle + dt;
  if (boosting) thrustBoost = 1; else thrustBoost = 0;
  if (steering) { auto.active = false; auto.state = 'pick'; auto.heading = null; }
  else if (!auto.active && auto.idle > AUTO_AFTER && !reduced && outside && !surface.active && !descent.phase) auto.active = true;
  if (reduced || !outside || surface.active || descent.phase) auto.active = false;   // inside, on a surface or going down, the ship stays put
  if (!outside) insideLife(dt);
  const pos = ship.root.position;
  flight.room = surface.active ? Infinity : roomAt(pos);

  // Gravity: ease the ship's up toward the planet's "away" (or back to the world's up), turning the whole frame the least
  // amount, so the nose stays level with the new horizon. Motion that pointed down at the planet carries on as a descent.
  const w = gravityAt(pos);
  flight.gravity = w;
  if (w > 0) targetUp.copy(WORLD_UP).applyQuaternion(fq2.identity().slerp(fq1.setFromUnitVectors(WORLD_UP, gravUp), w));
  else targetUp.copy(WORLD_UP);
  if (shipUp.dot(targetUp) < 0.999999) {
    fq1.setFromUnitVectors(shipUp, targetUp);
    fq2.identity().slerp(fq1, 1 - Math.exp(-dt / GRAV.alignSeconds));
    const before = fv3.copy(shipFwd).multiplyScalar(flight.speed);
    flight.q.premultiply(fq2).normalize(); frameVectors();
    if (w > 0) flight.sink += before.dot(shipUp);
  }

  const before = flight.speed;
  let cruising = false, thrust = ahead > 0 ? Math.min(1, 0.8 + 0.2 * thrustBoost) : 0;
  // Until the pilot is back in the seat, the ship only speeds up gently, so nobody gets left behind.
  const limit = ship.atControls ? 1 : 0.2;
  // Far from everything Shift keeps ramping up; near anything the top speed shrinks with the room left.
  const boostCap = Math.min(clamp(flight.room * SP.cruiseReach, MAX_SPEED, SP.cruise) * limit, Math.max(air.maxSpeed, 1));
  if (auto.active) {
    const a = autopilot(dt);
    cruising = a.cruising;
    const want = Math.min(a.speed * limit, air.maxSpeed), rate = Math.max(want > flight.speed ? 5 : 7, flight.speed * 0.6);
    flight.speed += clamp(want - flight.speed, -rate * dt, rate * dt);
    turnIn = a.turn; climbIn = a.climb;
    thrust = want > flight.speed + 0.5 ? 0.9 : flight.speed > 2 ? 0.35 : 0;
  } else if (boosting && flight.speed <= boostCap) flight.speed = Math.min(boostCap, flight.speed + (40 + Math.max(0, flight.speed) * 1.3) * dt);
  else if (boosting) flight.speed = Math.max(boostCap, flight.speed - (30 + flight.speed * 1.4) * dt);
  else if (ahead > 0 && flight.speed > MAX_SPEED * limit) flight.speed = Math.max(MAX_SPEED * limit, flight.speed - (30 + flight.speed * 1.4) * dt); // ease down after a boost
  else if (ahead > 0) flight.speed = Math.min(MAX_SPEED * limit, flight.speed + (flight.speed < 0 ? 40 : 18 + 10 * Math.max(0, 1 - flight.speed / MAX_SPEED)) * dt);
  else if (flight.speed > MAX_SPEED) flight.speed = Math.max(0, flight.speed - (30 + flight.speed * 1.4) * dt);
  else if (ahead < 0) flight.speed = Math.max(-MAX_BACK, flight.speed - (flight.speed > 0 ? 24 : 7) * dt);
  else { flight.speed *= Math.exp(-dt * 1.1); if (Math.abs(flight.speed) < 0.02) flight.speed = 0; }
  // Thicker air slows the ship, so it always arrives at the cloud deck gently; so does running out of room.
  const cap = Math.min(air.maxSpeed, Math.max(MAX_SPEED, flight.room * SP.cruiseReach));
  if (flight.speed > cap) flight.speed += (cap - flight.speed) * (1 - Math.exp(-dt * 2.5));
  flight.accel = (flight.speed - before) / Math.max(dt, 1e-4);
  let want = turnIn * TURN_RATE * (ship.atControls ? 1 : 0.5);
  if (flight.turnTo !== null && !steering) {
    const diff = headingTo(flight.turnTo);
    want = clamp(diff * 2, -TURN_RATE, TURN_RATE);
    if (Math.abs(diff) < 0.004) flight.turnTo = null;
  }
  flight.yawVel += (want - flight.yawVel) * (1 - Math.exp(-dt * 3));
  flight.q.premultiply(fq1.setFromAxisAngle(shipUp, flight.yawVel * dt)).normalize(); frameVectors();
  // Up and down: faster with room to spare (big layers of air go by quickly), slow and careful near anything.
  const maxClimb = surface.active ? MAX_CLIMB * 2.4 : clamp(flight.room * SP.climbReach, MAX_CLIMB, SP.climbMax);
  flight.climb += (climbIn * maxClimb - flight.climb) * (1 - Math.exp(-dt * 2));
  // The carried-on descent fades, faster if you ask to climb, and never outruns the air or the room below.
  const sinkCap = Math.min(air.maxSpeed, Math.max(MAX_CLIMB, flight.room * SP.cruiseReach));
  flight.sink = clamp(flight.sink * Math.exp(-dt / GRAV.sinkSeconds * (climbIn > 0 ? 6 : 1)), -sinkCap, sinkCap);
  if (surface.active) flight.sink = 0;
  if (gravPlanet) radialBefore.copy(pos).sub(gravPlanet.group.position).normalize();
  pos.addScaledVector(shipFwd, flight.speed * dt).addScaledVector(shipUp, (flight.climb + flight.sink) * dt).addScaledVector(flight.push, dt);
  // Level flight follows the planet's curve: as the ship moves round it, its frame turns with it exactly (no lag), so
  // flying level keeps the same height above the ground instead of slowly climbing away along a straight line.
  if (gravPlanet) { fq1.setFromUnitVectors(radialBefore, fv1.copy(pos).sub(gravPlanet.group.position).normalize()); flight.q.premultiply(fq2.identity().slerp(fq1, w)).normalize(); frameVectors(); }
  ship.root.quaternion.copy(flight.q);
  flight.push.multiplyScalar(Math.exp(-dt * 2));
  if (surface.active) flyLow(dt);
  else { collide(dt); stayInWorld(pos); holdAtDeck(dt); checkDescent(); }
  if (Math.abs(flight.speed) > 3) thrust = Math.min(1.25, thrust + air.flare);   // the engine flares a little in thin air
  ship.update(dt, { thrust, flying: steering, cruising: cruising || (auto.active && Math.abs(flight.speed) > 1), stopped: Math.abs(flight.speed) < 1,
    visible: shipOnScreen(), turn: clamp(flight.yawVel / TURN_RATE, -1, 1), turnVel: flight.yawVel,
    accel: flight.accel, speedFrac: Math.min(1, Math.abs(flight.speed) / CRUISE), climb: clamp((flight.climb + flight.sink) / MAX_CLIMB, -1.5, 1.5), reduced });
}
// Real, harmless collisions with the mothership: the ship bumps, slides along the hull and slows, with a small shake and
// a few soft sparks (neither with reduced motion). It is always pushed back out, so it can never get stuck.
const shipSpheres = WORLD.collision.spheres.map(() => new THREE.Vector3()), fvN = new THREE.Vector3();
function collide(dt) {
  const pos = ship.root.position;
  WORLD.collision.spheres.forEach((z, i) => shipSpheres[i].set(0, 0, z).applyQuaternion(flight.q).add(pos));
  const hit = fleet.collideShip(shipSpheres, COL.radius);
  // Moons are solid too.
  for (const p of planets) for (const m of p.moons) {
    const c = m.mesh.getWorldPosition(fv3).sub(universe.position), min = m.r * p.group.scale.x + ship.radius;
    fv2.copy(pos).sub(c); const l = fv2.length(); if (l < min && l > 1e-6) pos.addScaledVector(fv2, (min - l) / l);
  }
  flight.sparkT -= dt; flight.touchT += dt;
  if (!hit) return;
  pos.add(hit.push);
  const n = hit.normal, v = fv1.copy(shipFwd).multiplyScalar(flight.speed).addScaledVector(shipUp, flight.climb + flight.sink), vn = v.dot(n);
  const sliding = v.length(), fresh = flight.touchT > 0.4;
  flight.touchT = 0;
  if (vn < 0) {
    // Being pushed back out every frame turns the motion into a slide along the hull. Scraping slows the ship, more the
    // more head-on it is (straight in, it stops; at a glancing angle it keeps most of its speed).
    const into = Math.max(0, -shipFwd.dot(n)), intoUp = -shipUp.dot(n);
    flight.speed *= Math.exp(-dt * COL.scrape * (0.2 + 1.2 * into));
    if (intoUp * (flight.climb + flight.sink) > 0) { flight.climb *= Math.exp(-dt * 6); flight.sink = 0; }
    // A fresh knock gives a soft bump back out and a small shake; staying pressed against the hull just slides.
    if (fresh && vn < -2) { flight.push.addScaledVector(n, -vn * COL.bounce); flight.bump = Math.max(flight.bump, Math.min(1, -vn / 40)); flight.speed *= 1 - 0.6 * into; }
  }
  if (flight.push.dot(n) < 0) flight.push.addScaledVector(n, -flight.push.dot(n));
  if (!reduced && flight.sparkT <= 0 && (sliding > 2 || vn < -1)) { flight.sparkT = 0.09; fleet.contactSparks(hit.point, n, Math.min(1, 0.15 + sliding / 60 - vn / 30)); }
}
// The player can fly anywhere the world has something to see, out to just past the mothership.
function stayInWorld(pos) { const b = camReach() * 1.25; if (pos.length() > b) pos.setLength(b); }

// The surface doesn't exist yet, so the ship is held at the bottom of the cloud layer: a soft spring that eases it back
// up, with a hard floor well above the highest ground so it can never touch or pass through the planet.
function holdAtDeck(dt) {
  for (const p of planets) {
    const L = airLevels(p, ship.radius), rel = tmpV.copy(ship.root.position).sub(p.group.position), d = rel.length();
    if (d >= L.deck) continue;
    // Reaching the deck starts the way down (checkDescent); until the clouds have closed in, the deck still holds the ship.
    const nd = Math.max(d + (L.deck - d) * (1 - Math.exp(-dt * 6)), L.surf + ship.radius + 6);
    ship.root.position.copy(p.group.position).addScaledVector(rel.normalize(), nd);
    flight.climb *= Math.exp(-dt * 4); flight.sink *= Math.exp(-dt * 4);
  }
}
// ---------- Down to the surface and back ----------
// Keep flying down through the cloud layer: at the deck the clouds close in completely (the veil), the space view is
// swapped for the planet's surface underneath it, and you come out below the clouds. Climbing up past the cloud ceiling
// (or X) does the same in reverse, and you come out at the same spot on the planet in space. The swap is never seen.
function checkDescent() {
  if (descent.phase) return;
  for (const p of planets) {
    const L = airLevels(p, ship.radius), rel = tmpV.copy(ship.root.position).sub(p.group.position), d = rel.length();
    if (noDescend === p) { if (d > L.deck + 30) noDescend = null; continue; }
    if (d < L.deck + 3) { descent.phase = 'down'; descent.planet = p; descent.dir.copy(rel).normalize(); return; }
  }
}
// The heading is kept across the swap: measured against the planet's east and north where you went down, and the
// surface's east (+x) and north (-z).
const east = new THREE.Vector3(), north = new THREE.Vector3();
function tangentBasis(up) { east.crossVectors(WORLD_UP, up); if (east.lengthSq() < 1e-6) east.set(1, 0, 0); east.normalize(); north.crossVectors(up, east); }
function enterSurface(p) {
  descent.phase = null;
  tangentBasis(descent.dir);
  const h = Math.atan2(shipFwd.dot(east), shipFwd.dot(north));
  setFrame(WORLD_UP, fv3.set(Math.sin(h), 0, -Math.cos(h))); flight.sink = 0; flight.push.set(0, 0, 0);
  surface.enter(p);
  world.visible = false; fleet.root.visible = false; fleet.fx.visible = false; sky.visible = false; airFX.hide();
  ship.root.position.copy(SURF_ORIGIN).y += ENTRY_ALT;
  flight.climb = Math.min(flight.climb, -12); flight.speed = Math.min(flight.speed, 40);
  ship.clearTrail(); chase.ready = false; gearZone = 'high';
}
function exitSurface() {
  const p = surface.planet, L = airLevels(p, ship.radius);
  surface.exit();
  world.visible = true; fleet.root.visible = true; fleet.fx.visible = true; sky.visible = true;
  ship.root.position.copy(p.group.position).addScaledVector(descent.dir, L.deck + 14);
  tangentBasis(descent.dir);
  const h = Math.atan2(shipFwd.x, -shipFwd.z);
  setFrame(descent.dir, fv3.copy(east).multiplyScalar(Math.sin(h)).addScaledVector(north, Math.cos(h))); camUp.copy(shipUp);
  flight.climb = Math.max(flight.climb, 6); flight.sink = 0;
  noDescend = p; ship.setLandingGear(false);
  ship.clearTrail(); chase.ready = false;
  if (layerEl) layerEl.hidden = true;
}
function skipToSpace() {
  if (descent.phase) { descent.phase = null; noDescend = descent.planet; return; }
  veil = 1; exitSurface();
}
// Flying low: a soft ground limit that looks ahead (so the ship lifts smoothly over rising ground and never touches it),
// gentle storm wind, the landing gear on the final approach, and the way back up through the clouds.
function flyLow(dt) {
  const pos = ship.root.position, local = surfLocal.copy(pos).sub(SURF_ORIGIN);
  const ahead = Math.max(0, flight.speed) * 0.7;
  let ground = surface.floorAt(local.x, local.z);
  for (const k of [-9, 9, ahead + 9]) ground = Math.max(ground, surface.floorAt(local.x + fwd.x * k, local.z + fwd.z * k));
  const floor = ground + 9, soft = floor + 28;
  if (local.y < soft && flight.climb < 0) flight.climb *= clamp((local.y - floor) / (soft - floor), 0, 1);   // ease the sink near the ground
  if (local.y < floor) local.y += (floor - local.y) * (1 - Math.exp(-dt * 5));                              // lift over rising ground
  local.y = Math.max(local.y, ground + 6);                                                                   // and never into it
  const w = surface.state.storm ? surfOut.wind : null;
  if (w) { local.x += w.x * dt; local.z += w.z * dt; }
  pos.copy(SURF_ORIGIN).add(local);
  // Landing gear: down on the final approach (low and slow), up again on the climb out. L still toggles it by hand.
  const alt = local.y - surface.floorAt(local.x, local.z);
  if (gearZone === 'high' && alt < 70 && Math.abs(flight.speed) < 35) { gearZone = 'low'; ship.setLandingGear(true); }
  else if (gearZone === 'low' && (alt > 110 || Math.abs(flight.speed) > 50)) { gearZone = 'high'; ship.setLandingGear(false); }
  if (local.y > EXIT_ALT) { veil = Math.max(veil, 0.99); exitSurface(); }
}
let surfOut = { wind: new THREE.Vector3(), veil: 0, alt: 0 };

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
// The camera's up eases toward the ship's up (or the world's up for the fleet view), so it never snaps.
function easeCamUp(want, dt) { camUp.lerp(want, reduced ? 1 : 1 - Math.exp(-dt * 5)).normalize(); camera.up.copy(camUp); }
function follow(dt) {
  if (fleetView()) { easeCamUp(WORLD_UP, dt); followFleet(dt); ship.setView(camera); return; }
  if (view.mode === 'free') {
    const f = a => held(FREE_KEYS, freeKeys, a), sp = free.speed * (f('fast') ? 3 : 1) * dt, cp = Math.cos(free.pitch);
    camDir.set(-Math.sin(free.yaw) * cp, Math.sin(free.pitch), -Math.cos(free.yaw) * cp);
    free.pos.addScaledVector(camDir, (f('fwd') - f('back')) * sp);
    free.pos.x += Math.cos(free.yaw) * (f('right') - f('left')) * sp; free.pos.z -= Math.sin(free.yaw) * (f('right') - f('left')) * sp;
    free.pos.y += (f('up') - f('down')) * sp;
    camUp.copy(WORLD_UP); camera.up.copy(WORLD_UP);
    keepClear(free.pos, 0.5, true, false);                        // never below a planet's ground or inside the mothership's hull
    if (free.pos.length() > camReach()) free.pos.setLength(camReach());   // never lost in the void
    camera.position.copy(free.pos); camera.rotation.set(free.pitch, free.yaw, 0, 'YXZ');
    // The cut stays on one side; it only moves to the other side once the camera is well clear of the hull over there.
    camLocal.copy(free.pos).sub(ship.root.position).applyQuaternion(qInv.copy(ship.root.quaternion).invert());
    if (Math.abs(camLocal.x) > 7 && Math.sign(camLocal.x) !== free.side) { free.side = Math.sign(camLocal.x); ship.setCutSide(free.side); }
    ship.setView(camera);
    return;
  }
  const target = cameraTargets(tmpV);
  if (view.mode === 'entering' || view.mode === 'leaving') {
    view.t = reduced ? 1 : Math.min(1, view.t + dt / (view.dur || GLIDE));
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
  // The camera sits in the ship's own frame (behind, above, a little to the side), and its up follows the ship's up, so
  // in a planet's gravity the horizon stays level on screen.
  const cp = Math.cos(chase.pitch);
  desired.set(Math.sin(chase.yaw) * cp, Math.sin(chase.pitch), Math.cos(chase.yaw) * cp).applyQuaternion(flight.q);
  if (view.mode !== 'outside') {
    // Keep the camera outside the ship's outline (measured in the ship's own frame), so it never clips into a wall.
    local.copy(desired).applyQuaternion(qShip.copy(ship.root.quaternion).invert());
    const minD = insideRadius(local);
    if (chase.dist < minD) { chase.dist = minD; chase.tDist = Math.max(chase.tDist, minD); }
  }
  desired.multiplyScalar(chase.dist).add(pivot);
  if (surface.active) { surfCam.copy(desired).sub(SURF_ORIGIN); desired.y = Math.max(desired.y, SURF_ORIGIN.y + surface.floorAt(surfCam.x, surfCam.z) + 4); }
  else keepClear(desired, 1.5);
  if (!chase.ready || reduced) { camera.position.copy(desired); camUp.copy(shipUp); chase.ready = true; }
  else camera.position.lerp(desired, 1 - Math.exp(-dt * (view.mode === 'outside' ? 5 + Math.abs(flight.speed) / 12 : 12)));
  easeCamUp(shipUp, dt);
  camLookAt(tmpV.copy(pivot).addScaledVector(fwd, 1.5 * Math.cos(chase.yaw) * look));
  ship.setView(camera);
}
// While the camera is inside, the ship hovers in place and the pilot keeps living their life.
let lifeT = 0, look = 1, thrustBoost = 0;
function insideLife(dt) {
  flight.speed *= Math.exp(-dt * 3); if (Math.abs(flight.speed) < 0.05) flight.speed = 0;
  flight.climb *= Math.exp(-dt * 3); flight.sink *= Math.exp(-dt * 3);
  lifeT += dt;
  if (lifeT > 6 && !reduced && ship.atControls && !flight.speed) { lifeT = 0; if (Math.random() < 0.7) ship.crew.start(); }
}

// The pilot only animates while the ship is on screen.
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), shipSphere = new THREE.Sphere();
function shipOnScreen() {
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return frustum.intersectsSphere(shipSphere.set(ship.root.getWorldPosition(shipSphere.center), ship.radius));
}

// "Show in space" from the console: the ship turns to face that planet (the autopilot waits until it has).
function showPlanet(p) {
  leaveInside();
  flight.turnTo = p.group.position.clone().sub(ship.root.position).normalize();
  auto.active = false; auto.idle = 0; auto.state = 'pick';
  if (reduced) { flight.q.premultiply(fq1.setFromAxisAngle(shipUp, headingTo(flight.turnTo))); frameVectors(); flight.turnTo = null; }
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
universe.add(world);
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
  if (!dust) { dust = makeDust(); world.add(dust); }
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
    if (best) {
      ship.root.position.copy(best.pos);
      const d = best.p.group.position.clone().sub(best.pos);
      ship.root.position.y = best.p.group.position.y; // level with it, so it sits ahead of the ship
      setHeading(Math.atan2(-d.x, -d.z) + 0.22);
    }
  }
  refreshShip(examples, first);
}

// The money shown on the ship: from saved data, or from the example planets when there is none yet.
const PEAK_KEY = 'stashtronauts-debt-peak'; // the most ever owed, so the tow pod can shrink as debt is paid
function refreshShip(examples, first = false) {
  const tint = id => planets.find(p => p.id === id)?.look.biome.tint;
  let info;
  if (examples) {
    info = { totalSaved: EXAMPLES.reduce((t, e) => t + e.amount, 0) + EXAMPLE_FUND, goals: EXAMPLES.map(e => ({ id: e.id, name: e.label, progress: e.progress })),
      emergencyMonths: EXAMPLE_FUND / 2000, emergencyAmount: EXAMPLE_FUND, hasEmergencyFund: true, debt: 0, towPod: false };
  } else info = shipMoney(load());
  calmSpace = !!load().ship?.calmSpace;
  fleet.setFund({ has: info.hasEmergencyFund, amount: info.emergencyAmount, months: info.emergencyMonths, unit: load().ship?.fighterUnit || 100, first });
  updateFleetHud();
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
addEventListener('stash:show', e => {
  const p = planets.find(q => q.id === e.detail?.id);
  if (p) showPlanet(p);
  else if (goalsOf(load()).some(g => g.id === e.detail?.id && isEmergencyFund(g))) enterFleet();   // the fund is the fleet
});

// ---------- The fleet's HUD: a shield button with a plain-English line, and a button that shows the fleet ----------
const fleetHud = document.getElementById('fleetHud'), fleetBtn = document.getElementById('fleetBtn'), fleetLine = document.getElementById('fleetLine'), fleetGo = document.getElementById('fleetGo');
function updateFleetHud() {
  const f = fleet.info();
  if (!f.has) fleetLine.innerHTML = 'No emergency fund set yet. <span>Make a savings goal called "Emergency fund" and a guardian ship will come to keep watch.</span>';
  else if (!f.tier) fleetLine.innerHTML = `Emergency fund: ${fmt(f.amount)} saved so far. <span>A patrol ship arrives with your first deposit.</span>`;
  else {
    const months = f.months >= 0.95 ? `about ${Math.round(f.months * 10) / 10} months` : 'part of a month';
    fleetLine.innerHTML = `Emergency fund: ${fmt(f.amount)} saved. ${f.label} on duty, ${f.total} fighter${f.total === 1 ? '' : 's'} (${f.active} on patrol, ${f.reserve} in reserve).`
      + `<span>That covers ${months} of costs. An emergency fund is money kept aside for surprises, like a car repair. One fighter for every ${fmt(f.unit)}.</span>`;
  }
  fleetGo.hidden = !f.tier;
  fleetBtn.classList.toggle('on', !!f.tier);
}
fleetBtn.addEventListener('click', () => { const open = !fleetHud.classList.contains('open'); fleetHud.classList.toggle('open', open); fleetBtn.setAttribute('aria-expanded', open); });
fleetGo.addEventListener('click', () => { fleetView() ? leaveFleet() : enterFleet(); fleetHud.classList.remove('open'); fleetBtn.setAttribute('aria-expanded', false); });
addEventListener('pointerdown', e => { if (!fleetHud.contains(e.target)) { fleetHud.classList.remove('open'); fleetBtn.setAttribute('aria-expanded', false); } });
// A short message near the top, for things like "New fighter added".
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 6500); updateFleetHud(); }
addEventListener('pageshow', e => { if (e.persisted) loadPlanets(); });
addEventListener('resize', resize);

// ---------- Radio warnings near the mothership (instead of a shield) ----------
// A calm, coast-guard style message that escalates as you come closer to the guardian ship's hull: shown once per level
// (again if you leave and come back), with a soft chime. It never pushes the ship, never fires, and has no penalty.
// Nothing is said while you're lined up in a hangar's approach lane. Lingering at the last level brings two fighters over
// to keep you company at a polite distance, weapons stowed, until you move away. Reduced motion: no chime, no fighters.
const WARN = WORLD.warnings;
const RADIO = ['', 'Guardian vessel ahead. Please maintain a safe distance.', 'Warning: restricted airspace. Back up, this is a military vessel.', 'Final notice: please reverse course now.'];
const cruiseEl = document.getElementById('cruiseLine'), radioEl = document.getElementById('radio'), radioText = document.getElementById('radioText');
const warn = { level: 0, shown: 0, l3: 0, away: 0, escort: false, timer: 0 };
function updateWarnings(dt) {
  const th = [Infinity, WARN.level1, WARN.level2, WARN.level3].map(x => x * SHIP_LEN);
  let lvl = 0;
  if (fleet.present && !surface.active && Number.isFinite(flight.hullDist)) {
    const d = flight.hullDist;
    for (let i = 3; i >= 1; i--) if (d <= th[i]) { lvl = i; break; }
    if (lvl < warn.level && d <= th[warn.level] * WARN.resetFactor) lvl = warn.level;   // a level holds until you're clearly past it
    if (lvl && fleet.inApproachLane(ship.root.position, shipFwd)) lvl = 0;
  }
  if (lvl > warn.shown) showRadio(lvl);
  warn.shown = lvl;
  warn.level = lvl;
  // Two fighters come over after a while at the last level, and leave once you've moved away.
  warn.l3 = lvl === 3 ? warn.l3 + dt : Math.max(0, warn.l3 - dt * 0.5);
  if (!warn.escort && warn.l3 > WARN.shadowAfter && !reduced) warn.escort = true;
  warn.away = lvl <= 1 ? warn.away + dt : 0;
  if (warn.escort && (warn.away > 2 || reduced || surface.active)) { warn.escort = false; warn.l3 = 0; }
}
function showRadio(lvl) {
  if (!radioEl) return;
  radioText.textContent = RADIO[lvl]; radioEl.dataset.level = lvl;
  radioEl.hidden = false; radioEl.classList.remove('show'); void radioEl.offsetWidth; radioEl.classList.add('show');
  clearTimeout(warn.timer); warn.timer = setTimeout(() => { radioEl.classList.remove('show'); setTimeout(() => { if (!radioEl.classList.contains('show')) radioEl.hidden = true; }, 700); }, WARN.showSeconds * 1000);
  if (!reduced) chime(lvl);
}
// A soft two- or three-note chime, made on the spot (no sound files).
let audioCtx = null;
function chime(lvl) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = lvl === 1 ? [659, 880] : lvl === 2 ? [587, 784, 587] : [523, 698, 880], t0 = audioCtx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i * 0.16;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.55);
    });
  } catch (e) {}
}

// ---------- Planet portraits for the console ----------
// Each planet is photographed once into a small picture, seen from the same sunny side as in the world.
// It is drawn into a corner of the main canvas just before a normal frame, copied out, then drawn over.
const THUMB_W = 320, THUMB_H = 200;
const thumbScene = new THREE.Scene();
thumbScene.background = new THREE.Color('#0B1228');
thumbScene.add(new THREE.HemisphereLight('#3A4C8C', '#2A1C44', 0.2));
const thumbSun = new THREE.DirectionalLight('#FFF1DC', 3.2);
thumbSun.position.copy(SUN_DIR); thumbScene.add(thumbSun);
const thumbCam = new THREE.PerspectiveCamera(30, THUMB_W / THUMB_H, 1, 400000);
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
let elapsed = 0, rebases = 0;
// Keep the dust in a box around the camera: specks that leave it come back in on the other side.
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function wrapDust() {
  const a = dust.geometry.attributes.position, h = DUST_BOX / 2, c = camera.position;
  for (let i = 0; i < a.count; i++) for (let k = 0; k < 3; k++) {
    const o = i * 3 + k, cc = k === 0 ? c.x : k === 1 ? c.y : c.z; let v = a.array[o] - cc;
    if (v > h || v < -h) { v = ((v + h) % DUST_BOX + DUST_BOX) % DUST_BOX - h; a.array[o] = cc + v; }
  }
  a.needsUpdate = true;
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (dialogOpen()) keys.clear(); // no flying while the console is open
  fly(dt);
  updateWarnings(dt);
  // Cruise: going faster than a boost, far from everything. It slows down by itself near anything.
  if (cruiseEl) {
    const on = flight.speed > BOOST_MAX * 1.02 && view.mode === 'outside', text = on ? `Cruise · ${Math.round(flight.speed / SHIP_LEN / 10) * 10} ship lengths a second` : '';
    if (cruiseEl.textContent !== text) { cruiseEl.textContent = text; cruiseEl.hidden = !on; }
  }
  try { fleet.update(dt, { camera, reduced, calm: calmSpace, player: { pos: ship.root.position, q: flight.q, speed: Math.max(0, flight.speed) }, escort: warn.escort }); } catch (e) { console.error(e); }   // a fleet hiccup must never stop the whole scene
  follow(dt);
  if (surface.active) {
    surfOut = surface.update(dt, { shipLocal: surfLocal.copy(ship.root.position).sub(SURF_ORIGIN), camLocal: surfCam.copy(camera.position).sub(SURF_ORIGIN), reduced });
    air = SURF_AIR; veilWant = surfOut.veil;
    const text = `${surface.state.storm ? 'Stormy surface' : 'Surface'} · ${surface.planet.myth} · X back to space`;
    if (layerEl && layerEl.textContent !== text) { layerEl.textContent = text; } if (layerEl) layerEl.hidden = false;
  } else {
    air = airFX.update(dt, { planets, shipPos: ship.root.position, reduced, speed: Math.abs(flight.speed), following: !fleetView() && view.mode !== 'free' });
    // In the clouds the veil thickens toward the deck; going down it closes completely, then the surface takes over.
    const st = airFX.state, L = st.levels;
    veilWant = st.planet && L ? smooth01(L.deck + 22, L.deck, st.dist) * 0.85 : 0;
    if (descent.phase === 'down') { veilWant = 1; if (veil > 0.985) enterSurface(descent.planet); }
  }
  veil += clamp(veilWant - veil, -dt * 1.6, dt * (descent.phase ? 3 : 1.6));
  if (veilEl) { veilEl.style.opacity = veil.toFixed(3); if (surface.active || descent.planet) veilEl.style.background = '#' + (surface.planet || descent.planet).air.cloudTint.clone().lerp(new THREE.Color('#FFFFFF'), 0.4).getHexString(); }
  // In the clouds: a soft shake and a faint shimmer (both zero with reduced motion), only for the follow camera.
  const fov = view.mode === 'outside' ? baseFov + air.fov : baseFov;
  if (view.mode === 'outside') camera.position.add(air.shake);
  // A small shake when the ship bumps the hull (none with reduced motion).
  if (flight.bump > 0.001) {
    if (view.mode === 'outside' && !reduced) { const k = flight.bump * COL.shake, t = elapsed * 40; camera.position.addScaledVector(camUp, Math.sin(t) * k).addScaledVector(fv1.crossVectors(camUp, shipFwd), Math.sin(t * 1.3 + 1) * k); }
    flight.bump *= Math.exp(-dt * 5);
  }
  if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // Planets grow toward their size, glow brighter as you approach their air, and pulse for a moment when their goal changes.
  for (const p of planets) {
    const target = sizeFor(p.progress), s = p.group.scale.x;
    if (Math.abs(target - s) > 1e-4) p.group.scale.setScalar(reduced ? target : s + (target - s) * (1 - Math.exp(-dt * 2.5)));
    if (p.pulse > 0) p.pulse = reduced ? 0 : Math.max(0, p.pulse - dt / 2.2);
    p.glow.value = p.airGlow * (1 + Math.sin(p.pulse * Math.PI) * 1.4);
    // Clouds are seen from outside, or from underneath once the camera is inside them (never their far inner side through the gaps).
    const camD = camera.position.distanceTo(p.group.position), inside = camD < p.clouds.geometry.parameters.radius * p.group.scale.x;
    p.clouds.material.side = inside ? THREE.BackSide : THREE.FrontSide;
    // The finer surfaces are built the first time the camera comes close (one per frame at most).
    if (p.refined === 0 && camD < p.look.radius * 4.5) { p.refined = 1; p.refine(); }
    else if (p.refined === 1 && camD < p.look.radius * PW.finestWithin * 1.35) { p.refined = 2; p.refine2(); }
  }
  if (!reduced) {
    elapsed += dt;
    for (const p of planets) { p.body.rotation.y = p.look.spinPhase + elapsed * p.look.spin; p.clouds.rotation.y = elapsed * p.look.spin * 1.35; }
  }
  if (thumbQueue.length) photograph(thumbQueue.shift());
  wrapDust();
  // Floating origin: once the camera is 2,000 units from the render origin, move the origin to the camera.
  if (camera.position.distanceTo(origin) > WORLD.camera.rebase) {
    const delta = camera.position.clone().sub(origin);
    origin.copy(camera.position); universe.position.copy(origin).negate();
    ship.rebase(delta); rebases++;
  }
  universe.updateMatrixWorld();
  sky.position.copy(camera.getWorldPosition(camWorld));
  stars.material.uniforms.pr.value = renderer.getPixelRatio();
  stars.material.uniforms.fade.value = air.starFade;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
loadPlanets(true);
requestAnimationFrame(frame);
