// Stashtronauts space view, in 3D with three.js.
// You sit inside the scene: drag to look around, scroll or pinch to fly forward and back.
// Everything is built in code. Nothing is sent to a server.
import * as THREE from 'three';
import { load, goalsOf, planetNames, KEY, NAMES_KEY } from './money.js';

const cv = document.getElementById('space');
cv.tabIndex = 0;

// People can ask their device for less motion. We check once and also listen for changes.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
motionQuery.addEventListener('change', e => { reduced = e.matches; dirty = true; });

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
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 6000);
const coarse = matchMedia('(pointer: coarse)').matches; // phones and tablets get fewer pixels to draw

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // On tall phone screens, widen the view so it is never a narrow slit.
  const minWide = THREE.MathUtils.degToRad(64);
  camera.fov = Math.min(95, Math.max(60, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minWide / 2) / camera.aspect))));
  camera.updateProjectionMatrix();
  dirty = true;
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
  { id: 'ex1', myth: 'Elysium', label: 'Car fund', progress: 0.41 },
  { id: 'ex2', myth: 'Atlas', label: 'Emergency fund', progress: 0.62 },
  { id: 'ex3', myth: 'Calypso', label: 'Trip to Japan', progress: 0.2 },
  { id: 'ex4', myth: 'Vesta', label: 'New laptop', progress: 1 },
  { id: 'ex5', myth: 'Hyperion', label: 'House deposit', progress: 0.3 },
].map((p, slot) => ({ ...p, slot }));

// Biomes are calm, chunky color sets from docs/STYLE.md. A planet's name decides which one it gets.
// kind decides the surface: 'terra' has seas and stepped land, 'mesa' is stepped rock, 'bands' is a striped giant.
const BIOMES = [
  { name: 'meadow', kind: 'terra', sea: -0.05, water: ['#2D6EA6', '#4FA3D9'], land: ['#E6D49A', '#73C47A', '#4FA56A', '#3E8C5E', '#DCE9A0'], cap: '#F2F7F0', atmo: '#9FE8C0' },
  { name: 'ocean', kind: 'terra', sea: 0.28, water: ['#235C93', '#3A85C2'], land: ['#F3E1AE', '#83CBA0', '#5BAF7A', '#EAF3D6'], cap: '#EAF3FB', atmo: '#8CCBFF' },
  { name: 'dune', kind: 'mesa', land: ['#B9783F', '#CC8A4D', '#E6B36A', '#F3CE8C', '#F8E3B6'], atmo: '#FFD8A0' },
  { name: 'frost', kind: 'terra', sea: 0.05, water: ['#5C86B8', '#88AFCB'], land: ['#CFE6F2', '#E6F4FB', '#FFFFFF', '#A3C8DE'], cap: '#FFFFFF', atmo: '#D6F0FF' },
  { name: 'coral', kind: 'bands', land: ['#EE9A98', '#FFC4B6', '#D47586', '#FFE2CB', '#B9607A', '#F6B39C'], atmo: '#FFC2CC' },
  { name: 'crystal', kind: 'mesa', land: ['#5F4FAE', '#7764C4', '#9C8BE0', '#C6B8F5', '#F0E7FF'], atmo: '#CFC2FF', crystals: '#B8F1FF' },
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

// ---------- Camera: look around and fly ----------
const look = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 };
let speed = 0;           // forward speed in units per second, eases back to zero
let dirty = true;        // true when something changed and we need to draw again
const forward = new THREE.Vector3();

function aimAt(target, instant) {
  const d = target.clone().sub(camera.position).normalize();
  look.tYaw = Math.atan2(-d.x, -d.z); look.tPitch = Math.asin(clamp(d.y, -1, 1));
  if (instant) { look.yaw = look.tYaw; look.pitch = look.tPitch; }
}
function turn(dx, dy) {
  glide = null;
  const perPx = THREE.MathUtils.degToRad(camera.fov) / innerHeight;
  look.tYaw += dx * perPx; look.tPitch = clamp(look.tPitch + dy * perPx, -1.55, 1.55);
  dirty = true;
}
function push(amount) {
  glide = null;
  if (reduced) { moveBy(amount * 0.35); return; }
  speed = clamp(speed + amount, -140, 140);
  dirty = true;
}
function moveBy(dist) {
  camera.getWorldDirection(forward);
  camera.position.addScaledVector(forward, dist);
  keepClear();
  dirty = true;
}
// Never fly inside a planet, and never drift off into nowhere.
function keepClear(skip) {
  for (const p of planets) {
    if (p === skip) continue;
    const d = camera.position.clone().sub(p.group.position), min = p.look.radius * 1.45 + 2;
    if (d.length() < min) { camera.position.copy(p.group.position).addScaledVector(d.normalize(), min); speed *= 0.5; }
  }
  if (camera.position.length() > volume * 1.5) { camera.position.setLength(volume * 1.5); speed = 0; }
}

// A good spot to look at a planet from: close, about 70 degrees off the sun so its dark side shows.
const UP2 = new THREE.Vector3().crossVectors(SIDE, SUN_DIR);
function viewSpots(p) {
  return [SIDE, SIDE.clone().negate(), UP2, UP2.clone().negate()].map(perp => {
    const out = SUN_DIR.clone().multiplyScalar(0.35).addScaledVector(perp, 0.94).normalize();
    return p.group.position.clone().addScaledVector(out, p.look.radius * 3.6 + 8);
  });
}
// Glide the camera over to a planet. With reduced motion it jumps there instead.
let glide = null;
function showPlanet(p) {
  const to = viewSpots(p).reduce((a, b) => a.distanceTo(camera.position) < b.distanceTo(camera.position) ? a : b);
  const d = p.group.position.clone().sub(to).normalize();
  let yaw = Math.atan2(-d.x, -d.z);
  yaw += Math.round((look.yaw - yaw) / (Math.PI * 2)) * Math.PI * 2; // turn the short way round
  const pitch = Math.asin(clamp(d.y, -1, 1));
  speed = 0;
  if (reduced) { camera.position.copy(to); look.yaw = look.tYaw = yaw; look.pitch = look.tPitch = pitch; glide = null; }
  else glide = { p, from: camera.position.clone(), to, yaw0: look.yaw, pitch0: look.pitch, yaw, pitch, t: 0,
    dur: clamp(camera.position.distanceTo(to) / 110, 1.2, 2.8) };
  dirty = true;
}

const pointers = new Map();
let pinchDist = 0;
function pinchInfo() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchDist = pinchInfo().d;
  cv.classList.add('dragging');
});
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) { turn(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; return; }
  const before = pinchInfo();
  p.x = e.clientX; p.y = e.clientY;
  const after = pinchInfo();
  turn(after.x - before.x, after.y - before.y);
  push((after.d - pinchDist) * 0.9); pinchDist = after.d;
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 2) pinchDist = pinchInfo().d;
  if (!pointers.size) cv.classList.remove('dragging');
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  push(-px * 0.5);
}, { passive: false });
// Keyboard: arrow keys look around, + and - fly forward and back.
cv.addEventListener('keydown', e => {
  const k = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
  if (k) { turn(k[0], k[1]); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { push(40); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { push(-40); e.preventDefault(); }
});

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
  cv.setAttribute('aria-label', `Space view with ${planets.length} ${examples ? 'example ' : ''}planet${planets.length === 1 ? '' : 's'}. Drag to look around, scroll or pinch to fly forward and back.`);
  if (first) {
    // Open on one planet up close, seen from its sunny side, with as many other planets as possible behind it.
    // Each planet is tried from four sides, always about 70 degrees off the sun, so the terminator shows.
    let best = null;
    for (const p of planets) for (const pos of viewSpots(p)) {
      const dir = p.group.position.clone().sub(pos).normalize();
      const dots = planets.filter(q => q !== p).map(q => q.group.position.clone().sub(pos).normalize().dot(dir));
      // Mostly we want planets ahead, but a few behind too, so looking back is not empty.
      const seen = Math.min(3, dots.filter(x => x > 0.8).length) * 3 + Math.min(2, dots.filter(x => x < -0.4).length) * 2;
      if (!best || seen > best.seen) best = { p, pos, seen };
    }
    const hero = best.p;
    camera.position.copy(best.pos);
    aimAt(hero.group.position, true);
    look.yaw = look.tYaw += 0.18; look.pitch = look.tPitch -= 0.05;
  }
  dirty = true;
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
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, THUMB_W, THUMB_H); renderer.setViewport(0, 0, THUMB_W, THUMB_H);
  renderer.render(thumbScene, thumbCam);
  const pr = renderer.getPixelRatio();
  thumbCanvas.getContext('2d').drawImage(cv, 0, cv.height - THUMB_H * pr, THUMB_W * pr, THUMB_H * pr, 0, 0, THUMB_W, THUMB_H);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
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
  // Ease the view toward where the pointer asked it to look.
  const ease = reduced ? 1 : 1 - Math.exp(-dt * 14);
  const dYaw = look.tYaw - look.yaw, dPitch = look.tPitch - look.pitch;
  if (Math.abs(dYaw) + Math.abs(dPitch) > 1e-5) { look.yaw += dYaw * ease; look.pitch += dPitch * ease; dirty = true; }
  if (glide) {
    glide.t = Math.min(1, glide.t + dt / glide.dur);
    const e = glide.t * glide.t * (3 - 2 * glide.t);
    camera.position.lerpVectors(glide.from, glide.to, e);
    keepClear(glide.p);
    look.yaw = look.tYaw = lerp(glide.yaw0, glide.yaw, e); look.pitch = look.tPitch = lerp(glide.pitch0, glide.pitch, e);
    if (glide.t >= 1) glide = null;
    dirty = true;
  }
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  // Planets grow toward their size, and glow softly for a moment after their goal changes.
  for (const p of planets) {
    const target = sizeFor(p.progress), s = p.group.scale.x;
    if (Math.abs(target - s) > 1e-4) { p.group.scale.setScalar(reduced ? target : s + (target - s) * (1 - Math.exp(-dt * 2.5))); dirty = true; }
    if (p.pulse > 0) { p.pulse = reduced ? 0 : Math.max(0, p.pulse - dt / 2.2); p.glow.value = 1 + Math.sin(p.pulse * Math.PI) * 1.4; dirty = true; }
  }
  if (Math.abs(speed) > 0.05) { moveBy(speed * dt); speed *= Math.exp(-dt * 2.6); } else speed = 0;

  if (!reduced) {
    elapsed += dt;
    for (const p of planets) p.body.rotation.y = p.look.spinPhase + elapsed * p.look.spin;
    dirty = true;
  }
  if (thumbQueue.length) { photograph(thumbQueue.shift()); dirty = true; }
  if (dirty) {
    sky.position.copy(camera.position);
    stars.material.uniforms.pr.value = renderer.getPixelRatio();
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

resize();
loadPlanets(true);
requestAnimationFrame(frame);
