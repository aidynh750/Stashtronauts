// Stashtronauts space view.
// Everything is drawn on one <canvas>. Nothing is sent to a server.

const cv = document.getElementById('space'), ctx = cv.getContext('2d');
cv.tabIndex = 0;

// People can ask their device for less motion. We check once and also listen for changes.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
motionQuery.addEventListener('change', e => { reduced = e.matches; dirty = true; });

// ---------- Small helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;
// Turns text into a number. The same text always gives the same number.
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// A tiny random number generator that gives the same sequence for the same seed.
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- Camera ----------
// The camera is the point in space at the middle of the screen, plus how far we are zoomed in.
const cam = { x: 0, y: 0, zoom: 1 };
const MIN_ZOOM = 0.25, MAX_ZOOM = 3;
let glide = null;          // where the camera is smoothly heading, if anywhere
let W = 0, H = 0, dpr = 1; // screen size in CSS pixels, and pixel density
let dirty = true;          // true when something changed and we need to redraw

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  dirty = true;
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.zoom + W / 2, y: (y - cam.y) * cam.zoom + H / 2 });
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y });

// Zoom while keeping the point under the cursor (or fingers) in the same place.
function zoomAt(sx, sy, factor) {
  const before = toWorld(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const after = toWorld(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y;
  glide = null; dirty = true;
}
function flyCamera(x, y, zoom = cam.zoom) { glide = { x, y, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }; }

// ---------- Starfield ----------
// Three layers of stars. Far layers move less than near ones when you pan (parallax),
// which makes space feel deep. Each layer is a square "tile" of stars repeated forever.
const TILE = 1024;
const starLayers = [
  { depth: 0.06, count: 160, min: 0.5, max: 1.1 },
  { depth: 0.18, count: 90, min: 0.8, max: 1.7 },
  { depth: 0.4, count: 36, min: 1.3, max: 2.4 },
].map((L, i) => {
  const r = rng(101 + i);
  L.stars = Array.from({ length: L.count }, () => ({
    x: r() * TILE, y: r() * TILE, size: lerp(L.min, L.max, r()), phase: r() * 6.28,
    color: r() < 0.18 ? (r() < 0.5 ? '#FFE3B8' : '#BFD6FF') : '#FFFFFF',
  }));
  return L;
});

function drawBackground(t) {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.8);
  g.addColorStop(0, '#18204A'); g.addColorStop(1, '#0A0E1F');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Two soft nebula clouds that drift very slowly with the camera.
  const clouds = [[-500, -300, 700, 'rgba(126,94,214,0.16)'], [700, 450, 800, 'rgba(70,170,190,0.12)']];
  for (const [cx, cy, r, col] of clouds) {
    const x = (cx - cam.x * 0.03) + W / 2, y = (cy - cam.y * 0.03) + H / 2;
    const n = ctx.createRadialGradient(x, y, 0, x, y, r);
    n.addColorStop(0, col); n.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = n; ctx.fillRect(0, 0, W, H);
  }

  for (const L of starLayers) {
    const scale = 1 + (cam.zoom - 1) * L.depth * 0.5; // near stars spread slightly as you zoom
    const tile = TILE * scale;
    for (const s of L.stars) {
      const x0 = mod((s.x - cam.x * L.depth) * scale + W / 2, tile);
      const y0 = mod((s.y - cam.y * L.depth) * scale + H / 2, tile);
      const a = reduced ? 0.85 : 0.6 + 0.4 * Math.sin(t * 0.0015 + s.phase);
      ctx.globalAlpha = a; ctx.fillStyle = s.color;
      for (let x = x0; x < W + 4; x += tile) for (let y = y0; y < H + 4; y += tile) {
        if (s.size < 1.3) ctx.fillRect(x, y, s.size, s.size);
        else { ctx.beginPath(); ctx.arc(x, y, s.size / 2, 0, 6.283); ctx.fill(); }
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- Planets from the tracker's saved goals ----------
const DATA_KEY = 'stashtronauts-v1', OLD_DATA_KEY = 'vaultcore-v3'; // must match tracker.js
const NAMES_KEY = 'stashtronauts-planets-v1'; // which mythology name and map spot each goal has
const MYTH_NAMES = ['Elysium', 'Atlas', 'Calypso', 'Vesta', 'Hyperion', 'Selene', 'Juno', 'Aurora', 'Thalassa', 'Rhea',
  'Phoebe', 'Arcadia', 'Halcyon', 'Iris', 'Tethys', 'Zephyr', 'Theia', 'Echo', 'Gaia', 'Helios', 'Avalon', 'Nyx', 'Orpheus', 'Pandora'];
const EXAMPLES = [
  { id: 'ex1', myth: 'Elysium', label: 'Car fund', target: 15000, amount: 6200, monthly: 400 },
  { id: 'ex2', myth: 'Atlas', label: 'Emergency fund', target: 5000, amount: 3100, monthly: 250 },
  { id: 'ex3', myth: 'Calypso', label: 'Trip to Japan', target: 4000, amount: 800, monthly: 200 },
  { id: 'ex4', myth: 'Vesta', label: 'New laptop', target: 1200, amount: 1200, monthly: 0 },
];

// Biomes are calm, chunky color sets. A planet's name decides which one it gets.
const BIOMES = [
  { base: '#73C47A', shade: '#3E8C5E', patches: ['#A3DA84', '#4FA56A', '#DCE9A0'], atmo: '191,245,200' },
  { base: '#4FA3D9', shade: '#2D6EA6', patches: ['#83CBEE', '#EAF3D6', '#3A85C2'], atmo: '168,220,255' },
  { base: '#E6B36A', shade: '#B9783F', patches: ['#F3CE8C', '#CC8A4D', '#F8E3B6'], atmo: '255,225,176' },
  { base: '#CFE6F2', shade: '#88AFCB', patches: ['#FFFFFF', '#A3C8DE', '#E6F4FB'], atmo: '230,247,255' },
  { base: '#EE9A98', shade: '#B9607A', patches: ['#FFC4B6', '#D47586', '#FFE2CB'], atmo: '255,208,214' },
  { base: '#9C8BE0', shade: '#5F4FAE', patches: ['#C6B8F5', '#7764C4', '#F0E7FF'], atmo: '217,204,255' },
];

// Build a planet's look from its name. Same name in, same planet out.
function makeLook(name) {
  const r = rng(hash(name));
  const biome = BIOMES[Math.floor(r() * BIOMES.length)];
  const radius = 72 + r() * 44;
  // Chunky, low-poly terrain patches: each is a lumpy polygon somewhere on the disc.
  const patches = Array.from({ length: 6 + Math.floor(r() * 5) }, () => {
    const a = r() * 6.283, d = Math.sqrt(r()) * radius * 0.85, size = radius * (0.16 + r() * 0.3);
    const n = 6 + Math.floor(r() * 3);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, color: biome.patches[Math.floor(r() * 3)],
      pts: Array.from({ length: n }, (_, i) => { const ang = i / n * 6.283 + r() * 0.4, rr = size * (0.7 + r() * 0.3); return [Math.cos(ang) * rr, Math.sin(ang) * rr]; }) };
  });
  const ring = r() < 0.35 ? { tilt: (r() - 0.5) * 0.7, color: biome.patches[Math.floor(r() * 3)] } : null;
  const moon = r() < 0.45 ? { phase: r() * 6.283, speed: 0.15 + r() * 0.2, size: radius * (0.13 + r() * 0.07) } : null;
  return { biome, radius, patches, ring, moon };
}

function readSaved(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }

let planets = [], usingExamples = false;

function loadPlanets() {
  const data = readSaved(DATA_KEY) || readSaved(OLD_DATA_KEY);
  // The tracker adds new goals to the front, so reverse to get oldest first.
  const goals = (data?.cores || []).filter(c => c.type === 'goal').reverse();
  usingExamples = goals.length === 0;
  let list;
  if (usingExamples) list = EXAMPLES.map((g, i) => ({ ...g, slot: i, example: true }));
  else {
    const names = readSaved(NAMES_KEY) || {};
    for (const id of Object.keys(names)) if (!goals.some(g => g.id === id)) delete names[id]; // goal was removed
    const taken = new Set(Object.values(names).map(n => n.myth)), slots = new Set(Object.values(names).map(n => n.slot));
    for (const g of goals) if (!names[g.id]) {
      let myth = MYTH_NAMES.find(n => !taken.has(n));
      for (let k = 2; !myth; k++) myth = MYTH_NAMES.map(n => `${n} ${k}`).find(n => !taken.has(n));
      let slot = 0; while (slots.has(slot)) slot++;
      names[g.id] = { myth, slot }; taken.add(myth); slots.add(slot);
    }
    try { localStorage.setItem(NAMES_KEY, JSON.stringify(names)); } catch (e) {}
    list = goals.map(g => ({ id: g.id, myth: names[g.id].myth, slot: names[g.id].slot, label: g.name,
      target: +g.target || 0, amount: +g.amount || 0, monthly: +g.monthly || 0 }));
  }
  planets = list.map(p => {
    // Spots spiral outward from the middle (like seeds in a sunflower), with a little wobble.
    const wobble = rng(hash(p.myth) + 7), a = p.slot * 2.39996 + wobble() * 0.3, d = p.slot ? 420 * Math.sqrt(p.slot) + wobble() * 40 : 0;
    return { ...p, x: Math.cos(a) * d, y: Math.sin(a) * d, look: makeLook(p.myth) };
  });
  cv.setAttribute('aria-label', `Space map with ${planets.length} ${usingExamples ? 'example ' : ''}planet${planets.length === 1 ? '' : 's'}. Drag to look around, scroll or pinch to zoom.`);
  document.getElementById('planetList').innerHTML = planets.map(p =>
    `<li><button data-id="${p.id}">${esc(p.myth)}: ${esc(p.label)}</button></li>`).join('');
  if (selected) selected = planets.find(p => p.id === selected.id) || null;
  if (selected) showCard(selected); else hideCard();
  dirty = true;
}

const progress = p => p.target > 0 ? clamp(p.amount / p.target, 0, 1) : 0;

function drawPlanet(p, t) {
  const { radius: R, biome, patches, ring, moon } = p.look;
  ctx.save(); ctx.translate(p.x, p.y);

  // Soft atmosphere glow
  const glow = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.35);
  glow.addColorStop(0, `rgba(${biome.atmo},${p === hovered || p === selected ? 0.42 : 0.28})`); glow.addColorStop(1, `rgba(${biome.atmo},0)`);
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, 6.283); ctx.fill();

  const moonPos = moon && (() => { const a = moon.phase + (reduced ? 0 : t * 0.001 * moon.speed); return { x: Math.cos(a) * R * 1.8, y: Math.sin(a) * R * 0.55, behind: Math.sin(a) < 0 }; })();
  if (moonPos?.behind) drawMoon(moonPos, moon.size);
  if (ring) drawRing(R, ring, true);

  // The planet body: base color, terrain patches, then flat cel-style shading on top.
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fillStyle = biome.base; ctx.fill(); ctx.clip();
  for (const pa of patches) {
    ctx.beginPath(); pa.pts.forEach(([x, y], i) => i ? ctx.lineTo(pa.x + x, pa.y + y) : ctx.moveTo(pa.x + x, pa.y + y));
    ctx.closePath(); ctx.fillStyle = pa.color; ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,18,60,0.12)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.arc(-R * 0.18, -R * 0.18, R * 1.02, 0, 6.283, true); ctx.fill('evenodd');
  ctx.fillStyle = 'rgba(20,18,60,0.14)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.arc(-R * 0.34, -R * 0.34, R * 1.0, 0, 6.283, true); ctx.fill('evenodd');
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(-R * 0.42, -R * 0.45, R * 0.28, R * 0.16, -0.7, 0, 6.283); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,40,0.35)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.stroke();

  if (ring) drawRing(R, ring, false);
  if (moonPos && !moonPos.behind) drawMoon(moonPos, moon.size);

  // Progress ring around the planet: how close this goal is to done.
  const pr = progress(p), rr = R + (ring ? 26 : 16);
  ctx.lineCap = 'round'; ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.283); ctx.stroke();
  if (pr > 0) { ctx.strokeStyle = pr >= 1 ? '#FFC56B' : '#7FE0C2'; ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + pr * 6.283); ctx.stroke(); }
  ctx.restore();
}

function drawRing(R, ring, back) {
  ctx.save(); ctx.rotate(ring.tilt);
  ctx.lineWidth = R * 0.16; ctx.strokeStyle = ring.color; ctx.globalAlpha = back ? 0.55 : 0.9;
  ctx.beginPath(); ctx.ellipse(0, 0, R * 1.6, R * 0.38, 0, back ? Math.PI : 0, back ? 2 * Math.PI : Math.PI); ctx.stroke();
  ctx.restore();
}
function drawMoon(pos, size) {
  ctx.fillStyle = '#C9C6DA'; ctx.beginPath(); ctx.arc(pos.x, pos.y, size, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(20,18,60,0.25)'; ctx.beginPath(); ctx.arc(pos.x, pos.y, size, 0, 6.283); ctx.arc(pos.x - size * 0.35, pos.y - size * 0.35, size, 0, 6.283, true); ctx.fill('evenodd');
}

// Names and labels are drawn in screen space so the text stays readable at any zoom.
function drawLabels() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const p of planets) {
    const s = toScreen(p.x, p.y + p.look.radius + (p.look.ring ? 34 : 24));
    if (s.x < -200 || s.x > W + 200 || s.y < -60 || s.y > H + 60) continue;
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#EEF3FF'; ctx.font = '800 16px Nunito, system-ui, sans-serif';
    ctx.fillText(p.myth, s.x, s.y);
    if (cam.zoom > 0.3) {
      ctx.fillStyle = '#A9B5D6'; ctx.font = '600 14px Nunito, system-ui, sans-serif';
      ctx.fillText(`${p.label} · ${Math.round(progress(p) * 100)}%`, s.x, s.y + 20);
    }
    ctx.shadowBlur = 0;
  }
}

function planetAt(sx, sy) {
  const w = toWorld(sx, sy), slack = 10 / cam.zoom;
  return planets.find(p => Math.hypot(w.x - p.x, w.y - p.y) < p.look.radius + slack) || null;
}

// ---------- Planet info card ----------
let hovered = null, selected = null;
const card = document.getElementById('card'), banner = document.getElementById('banner');
const fmt = n => '$' + Math.round(n).toLocaleString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dateIn = m => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };

function showCard(p) {
  const pr = progress(p), left = p.target - p.amount;
  const when = left <= 0 ? 'Goal reached. Nice work!' : p.monthly > 0 ? `At ${fmt(p.monthly)} a month, you'll get there around ${dateIn(Math.ceil(left / p.monthly))}.` : 'Add a monthly amount in the tracker to see a finish date.';
  card.innerHTML = `<button class="close" aria-label="Close">&times;</button>
    <p class="kind">${p.example ? 'Example planet' : 'Your planet'}</p>
    <h2>${esc(p.myth)}: <span>${esc(p.label)}</span></h2>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pr * 100)}" aria-label="Progress"><i style="width:${pr * 100}%"></i></div>
    <p><b>${fmt(p.amount)}</b> saved of ${fmt(p.target)} (${Math.round(pr * 100)}%)</p>
    <p class="kind">${when}</p>
    <a class="pill" href="tracker.html">${p.example ? 'Add your own goal' : 'Open in tracker'}</a>`;
  card.hidden = false; banner.hidden = true;
  card.querySelector('.close').onclick = () => { hideCard(); cv.focus(); };
}
function hideCard() { card.hidden = true; banner.hidden = !usingExamples; selected = null; dirty = true; }

function selectPlanet(p) {
  selected = p; showCard(p);
  const zoom = clamp(Math.min(W, H) * 0.2 / p.look.radius, 0.7, 2);
  // On narrow screens the card sits at the bottom, so put the planet a bit higher.
  flyCamera(p.x, p.y + (W < 700 ? H * 0.17 / zoom : 0), zoom);
}

// ---------- Drawing ----------
function draw(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(t);
  // Switch to world coordinates: everything below is placed in space, not on the screen.
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));
  for (const p of planets) drawPlanet(p, t);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels();
}

// ---------- Input: drag, pinch, scroll, keys ----------
const pointers = new Map();
let press = null; // where a single-finger/mouse press started, used to tell taps from drags
let pinchPrev = null;

function pinchInfo() {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  glide = null;
  if (pointers.size === 1) press = { x: e.clientX, y: e.clientY, moved: false };
  else { press = null; pinchPrev = pinchInfo(); }
});

cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) { onHover(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom; dirty = true;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) { press.moved = true; cv.classList.add('dragging'); }
  } else if (pointers.size === 2 && pinchPrev) {
    const now = pinchInfo();
    cam.x -= (now.x - pinchPrev.x) / cam.zoom; cam.y -= (now.y - pinchPrev.y) / cam.zoom;
    zoomAt(now.x, now.y, now.dist / pinchPrev.dist);
    pinchPrev = now;
  }
});

function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinchPrev = null;
  if (pointers.size === 0) {
    if (press && !press.moved && e.type === 'pointerup') onTap(e.clientX, e.clientY);
    press = null; cv.classList.remove('dragging');
  }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);

cv.addEventListener('wheel', e => {
  e.preventDefault();
  const lines = e.deltaMode === 1 ? 16 : 1;
  // Trackpad pinches arrive as wheel events with ctrlKey held, and need a stronger factor.
  const speed = e.ctrlKey ? 0.01 : 0.0015;
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * lines * speed));
}, { passive: false });

addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea, select, a, button')) return;
  const step = 80 / cam.zoom;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) { flyCamera(cam.x + moves[e.key][0], cam.y + moves[e.key][1]); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') flyCamera(cam.x, cam.y, cam.zoom * 1.3);
  else if (e.key === '-' || e.key === '_') flyCamera(cam.x, cam.y, cam.zoom / 1.3);
  else if (e.key === '0' || e.key === 'Home') showAll();
});

document.getElementById('zoomIn').onclick = () => flyCamera(cam.x, cam.y, cam.zoom * 1.3);
document.getElementById('zoomOut').onclick = () => flyCamera(cam.x, cam.y, cam.zoom / 1.3);
document.getElementById('home').onclick = () => showAll();

// Fit every planet on screen.
function showAll(instant) {
  hideCard();
  if (!planets.length) return flyCamera(0, 0, 1);
  const pad = 170, xs = planets.map(p => p.x), ys = planets.map(p => p.y);
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad + 90;
  // Leave room for the title bar and banner at the top of the screen.
  const top = usingExamples ? 110 : 64, zoom = clamp(Math.min(W / (maxX - minX), (H - top) / (maxY - minY)), MIN_ZOOM, 1.1);
  flyCamera((minX + maxX) / 2, (minY + maxY) / 2 - top / 2 / zoom, zoom);
  if (instant) { Object.assign(cam, glide); glide = null; }
}
function onHover(sx, sy) {
  const p = planetAt(sx, sy);
  if (p !== hovered) { hovered = p; cv.classList.toggle('over', !!p); dirty = true; }
}
function onTap(sx, sy) {
  const p = planetAt(sx, sy);
  if (p) selectPlanet(p); else if (selected) hideCard();
}

document.getElementById('planetList').onclick = e => {
  const b = e.target.closest('button'); if (b) selectPlanet(planets.find(p => p.id === b.dataset.id));
};
addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) { hideCard(); cv.focus(); } });
// If the tracker changes in another tab, or we come back from it, rebuild the planets.
addEventListener('storage', e => { if (e.key === DATA_KEY) loadPlanets(); });
addEventListener('pageshow', e => { if (e.persisted) loadPlanets(); });

// ---------- Main loop ----------
let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (glide) {
    // Ease toward the target. With reduced motion we jump straight there.
    const k = reduced ? 1 : 1 - Math.pow(0.002, dt);
    cam.x = lerp(cam.x, glide.x, k); cam.y = lerp(cam.y, glide.y, k);
    cam.zoom = lerp(cam.zoom, glide.zoom, k);
    if (Math.abs(cam.x - glide.x) < 0.5 && Math.abs(cam.y - glide.y) < 0.5 && Math.abs(cam.zoom - glide.zoom) < 0.002) {
      cam.x = glide.x; cam.y = glide.y; cam.zoom = glide.zoom; glide = null;
    }
    dirty = true;
  }
  // Twinkling stars mean we redraw every frame, unless motion is reduced.
  if (dirty || !reduced) { draw(t); dirty = false; }
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
resize();
loadPlanets();
showAll(true);
requestAnimationFrame(frame);
