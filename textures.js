// Procedural textures, drawn on canvases at startup. There are no image files in this project.
import * as THREE from 'three';

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function tex(c, { color = false, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------- The hull tube ----------
// u runs around the hull (0 at the bottom, 0.25 on the right, 0.5 on top, 0.75 on the left); the canvas runs from the back (top) to the front (bottom).
// windows: [{ u, v, ru, rv }] in texture units. Returns color, bump, roughness and alpha (holes for the windows).
export function hullTextures({ main, secondary, accent, windows = [], W = 2048, H = 1024, seed = 7 }) {
  const col = canvas(W, H), bump = canvas(W, H), rough = canvas(W / 2, H / 2), alpha = canvas(W, H);
  const c = col.getContext('2d'), b = bump.getContext('2d'), r = rough.getContext('2d'), a = alpha.getContext('2d');
  const rand = rng(seed);
  // Base paint: cream above, teal along the belly, a thin coral pinstripe on each side.
  c.fillStyle = main; c.fillRect(0, 0, W, H);
  c.fillStyle = secondary; c.fillRect(0, 0, W * 0.15, H); c.fillRect(W * 0.85, 0, W * 0.15, H);
  c.fillStyle = accent; for (const u of [0.175, 0.825]) c.fillRect(W * u - 5, 0, 10, H);
  b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(140,140,140)'; r.fillRect(0, 0, W / 2, H / 2);
  a.fillStyle = '#fff'; a.fillRect(0, 0, W, H);

  // Plating: panel seams around and along the hull, with rivets along the seams.
  const rows = 16, cols = 10;
  c.strokeStyle = 'rgba(40,50,70,0.32)'; c.lineWidth = 2;
  b.strokeStyle = 'rgb(70,70,70)'; b.lineWidth = 3;
  for (let i = 0; i <= cols; i++) { const y = (i / cols) * H; for (const g of [c, b]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  for (let j = 0; j < rows; j++) {
    const x = (j / rows) * W, off = (j % 2) * (H / cols / 2);
    for (let i = 0; i < cols; i++) {
      const y0 = (i / cols) * H + off, y1 = y0 + H / cols;
      for (const g of [c, b]) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, Math.min(H, y1)); g.stroke(); }
    }
  }
  for (let i = 0; i <= cols; i++) for (let x = 6; x < W; x += 22) {
    const y = (i / cols) * H;
    for (const yy of [y - 7, y + 7]) {
      c.fillStyle = 'rgba(60,70,90,0.35)'; c.beginPath(); c.arc(x, yy, 2.2, 0, 7); c.fill();
      b.fillStyle = 'rgb(200,200,200)'; b.beginPath(); b.arc(x, yy, 2.5, 0, 7); b.fill();
    }
  }
  // Warning stripes near the back, by the engine (the top of the canvas is the back of the hull).
  const vy = H * 0.04;
  c.save(); c.beginPath(); c.rect(0, vy, W, 26); c.clip();
  c.fillStyle = '#F5C542'; c.fillRect(0, vy, W, 26); c.fillStyle = '#2B3550';
  for (let x = -40; x < W + 40; x += 36) { c.beginPath(); c.moveTo(x, vy); c.lineTo(x + 18, vy); c.lineTo(x + 44, vy + 26); c.lineTo(x + 26, vy + 26); c.fill(); }
  c.restore();
  r.fillStyle = 'rgb(90,90,90)'; r.fillRect(0, vy / 2, W / 2, 13);

  // Windows: a hole in the hull, with a raised metal frame around it.
  for (const w of windows) {
    const x = w.u * W, y = w.v * H, rx = w.ru * W, ry = w.rv * H;
    c.fillStyle = '#AEB7C8'; c.beginPath(); c.ellipse(x, y, rx * 1.28, ry * 1.28, 0, 0, 7); c.fill();
    c.fillStyle = '#7C8597'; for (let k = 0; k < 8; k++) { const t = k / 8 * 6.283; c.beginPath(); c.arc(x + Math.cos(t) * rx * 1.15, y + Math.sin(t) * ry * 1.15, 2.5, 0, 7); c.fill(); }
    b.fillStyle = 'rgb(210,210,210)'; b.beginPath(); b.ellipse(x, y, rx * 1.28, ry * 1.28, 0, 0, 7); b.fill();
    a.fillStyle = '#000'; a.beginPath(); a.ellipse(x, y, rx, ry, 0, 0, 7); a.fill();
  }

  // Character: soft scuffs, a few scratches, and a little grime low down. Kept light so it stays cozy.
  for (let i = 0; i < 70; i++) {
    const x = rand() * W, y = rand() * H, s = 10 + rand() * 50, g = c.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(70,60,50,${0.04 + rand() * 0.06})`); g.addColorStop(1, 'rgba(70,60,50,0)');
    c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2);
    r.fillStyle = `rgba(220,220,220,${0.15 + rand() * 0.2})`; r.beginPath(); r.arc(x / 2, y / 2, s / 2, 0, 7); r.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = rand() * W, y = rand() * H; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 12); c.stroke(); }
  const grime = c.createLinearGradient(0, 0, W * 0.12, 0);
  grime.addColorStop(0, 'rgba(30,40,50,0.18)'); grime.addColorStop(1, 'rgba(30,40,50,0)');
  c.fillStyle = grime; c.fillRect(0, 0, W * 0.12, H);

  return { map: tex(col, { color: true }), bumpMap: tex(bump), roughnessMap: tex(rough), alphaMap: tex(alpha) };
}

// ---------- The rounded ends of the hull ----------
// Half-sphere UVs: u runs around (phi), and the canvas runs from the tip (top edge, theta 0) to where the end meets the
// tube (bottom edge, theta PI/2). window(phi, theta) returns 1 for see-through glass, 2 for an opaque frame, 0 for hull.
export function capTextures({ base, lower = null, ring = null, seed = 3, window = null }) {
  const W = 1024, H = 512, col = canvas(W, H), bump = canvas(W, H), alpha = canvas(W, H);
  const c = col.getContext('2d'), b = bump.getContext('2d'), a = alpha.getContext('2d'), rand = rng(seed);
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  if (lower) { c.fillStyle = lower; c.fillRect(W * 0.5, H * 0.35, W * 0.5, H * 0.65); } // the lower half (phi PI..2PI), away from the tip
  b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, 0, W, H);
  a.fillStyle = '#fff'; a.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(40,50,70,0.3)'; c.lineWidth = 2; b.strokeStyle = 'rgb(70,70,70)'; b.lineWidth = 3;
  for (const f of [0.35, 0.65, 0.88]) for (const g of [c, b]) { g.beginPath(); g.moveTo(0, f * H); g.lineTo(W, f * H); g.stroke(); }
  for (let i = 0; i < 16; i++) for (const g of [c, b]) { const x = i / 16 * W; g.beginPath(); g.moveTo(x, 0.35 * H); g.lineTo(x, H); g.stroke(); }
  for (let x = 8; x < W; x += 24) for (const f of [0.65, 0.88]) {
    c.fillStyle = 'rgba(60,70,90,0.35)'; c.beginPath(); c.arc(x, f * H + 7, 2, 0, 7); c.fill();
    b.fillStyle = 'rgb(200,200,200)'; b.beginPath(); b.arc(x, f * H + 7, 2.4, 0, 7); b.fill();
  }
  if (ring) { c.fillStyle = ring.color; c.fillRect(0, H * ring.at, W, H * 0.06); } // ring: { color, at: 0..1 from the tip }
  if (window) {
    const img = c.getImageData(0, 0, W, H), al = a.getImageData(0, 0, W, H), bm = b.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const w = window(x / W * Math.PI * 2, y / H * Math.PI / 2), i = (y * W + x) * 4;
      if (w === 2) { img.data[i] = 150; img.data[i + 1] = 160; img.data[i + 2] = 178; bm.data[i] = bm.data[i + 1] = bm.data[i + 2] = 215; }
      if (w === 1) { al.data[i] = al.data[i + 1] = al.data[i + 2] = 0; }
    }
    c.putImageData(img, 0, 0); a.putImageData(al, 0, 0); b.putImageData(bm, 0, 0);
  }
  for (let i = 0; i < 25; i++) {
    const x = rand() * W, y = rand() * H, s = 10 + rand() * 30, g = c.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, 'rgba(70,60,50,0.07)'); g.addColorStop(1, 'rgba(70,60,50,0)'); c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2);
  }
  return { map: tex(col, { color: true }), bumpMap: tex(bump), alphaMap: window ? tex(alpha) : null };
}

// ---------- Small repeating textures ----------
export function metalTexture(base = '#AEB7C8') {
  const W = 256, c = canvas(W, W), g = c.getContext('2d'), rand = rng(11);
  g.fillStyle = base; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.06})`; g.fillRect(0, rand() * W, W, 1); }
  g.strokeStyle = 'rgba(30,40,60,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, W - 2);
  g.fillStyle = 'rgba(40,50,70,0.4)'; for (const [x, y] of [[10, 10], [W - 10, 10], [10, W - 10], [W - 10, W - 10]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  return tex(c, { color: true, repeat: [1, 1] });
}
export function hazardTexture() {
  const c = canvas(256, 32), g = c.getContext('2d');
  g.fillStyle = '#F5C542'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#2B3550';
  for (let x = -32; x < 288; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 48, 32); g.lineTo(x + 32, 32); g.fill(); }
  return tex(c, { color: true, repeat: [6, 1] });
}
export function solarTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#C8D0DC'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
    const grd = g.createLinearGradient(0, 0, 60, 40);
    grd.addColorStop(0, '#24427A'); grd.addColorStop(1, '#1A2F5C');
    g.fillStyle = grd; g.fillRect(4 + i * 63, 4 + j * 42, 58, 38);
    g.strokeStyle = 'rgba(160,190,255,0.25)'; g.beginPath(); g.moveTo(4 + i * 63 + 29, 4 + j * 42); g.lineTo(4 + i * 63 + 29, 42 + j * 42); g.stroke();
  }
  return tex(c, { color: true });
}
export function radiatorTexture() {
  const c = canvas(64, 256), g = c.getContext('2d');
  for (let y = 0; y < 256; y += 16) { g.fillStyle = '#C9CFDA'; g.fillRect(0, y, 64, 10); g.fillStyle = '#8E97AA'; g.fillRect(0, y + 10, 64, 6); }
  return tex(c, { color: true });
}
export function woodTexture(base = '#C9A27A') {
  const c = canvas(256, 256), g = c.getContext('2d'), rand = rng(5);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = `rgba(90,55,30,${0.08 + rand() * 0.08})`; g.fillRect(0, y, 256, 32);
    g.fillStyle = 'rgba(70,40,20,0.35)'; g.fillRect(0, y, 256, 2);
    for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(90,55,30,0.15)'; g.beginPath(); g.moveTo(0, y + 6 + rand() * 20); g.bezierCurveTo(80, y + rand() * 32, 160, y + rand() * 32, 256, y + 6 + rand() * 20); g.stroke(); }
    g.fillStyle = 'rgba(70,40,20,0.3)'; g.fillRect(Math.floor(rand() * 256), y, 2, 32);
  }
  return tex(c, { color: true, repeat: [2, 2] });
}
export function rugTexture(a = '#E9876B', b = '#FFF3DF', cc = '#3FA7B5') {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = b; g.lineWidth = 10; g.strokeRect(14, 14, 228, 228);
  g.strokeStyle = cc; g.lineWidth = 6; g.strokeRect(34, 34, 188, 188);
  g.fillStyle = b; for (let i = 0; i < 5; i++) { g.save(); g.translate(128, 128); g.rotate(i * 1.2566); g.beginPath(); g.ellipse(0, -40, 14, 34, 0, 0, 7); g.fill(); g.restore(); }
  return tex(c, { color: true });
}
export function fabricTexture(base, line) {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line; g.lineWidth = 3;
  for (let i = -128; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
  return tex(c, { color: true, repeat: [2, 2] });
}
export function panelTexture(base = '#E6DED0') {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(60,70,90,0.25)'; g.lineWidth = 3; g.strokeRect(8, 8, 240, 240);
  g.fillStyle = 'rgba(60,70,90,0.18)'; for (let y = 40; y < 100; y += 12) g.fillRect(40, y, 176, 5); // a vent
  g.fillStyle = 'rgba(60,70,90,0.35)'; for (const [x, y] of [[20, 20], [236, 20], [20, 236], [236, 236]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  return tex(c, { color: true });
}

// ---------- Words and pictures ----------
export function textTexture(text, { w = 512, h = 128, bg = null, color = '#2B3550', font = 800, size = 70, stroke = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill(); }
  g.font = `${font} ${size}px Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let s = size; while (g.measureText(text).width > w - 30 && s > 12) { s -= 4; g.font = `${font} ${s}px Nunito, system-ui, sans-serif`; }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 8; g.strokeText(text, w / 2, h / 2 + 4); }
  g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
  return tex(c, { color: true });
}
export function posterTexture(kind) {
  const c = canvas(256, 340), g = c.getContext('2d');
  if (kind === 'map') {
    g.fillStyle = '#F3E6C8'; g.fillRect(0, 0, 256, 340);
    g.strokeStyle = '#8C6040'; g.lineWidth = 4; g.strokeRect(10, 10, 236, 320);
    g.fillStyle = '#2B3550'; g.font = '800 22px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('SHIP LAYOUT', 128, 44);
    g.strokeStyle = '#3FA7B5'; g.lineWidth = 3; g.beginPath(); g.ellipse(128, 190, 80, 120, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(48, 170); g.lineTo(208, 170); g.stroke();
    g.font = '700 12px Nunito, sans-serif'; g.fillStyle = '#5A3524';
    ['FLIGHT DECK', 'HOME', 'WORKSHOP', 'AIRLOCK', 'STORAGE', 'FUEL'].forEach((s, i) => g.fillText(s, 128, i === 0 ? 120 : 190 + i * 22));
    return tex(c, { color: true });
  }
  if (kind === 'planet') {
    const sky = g.createLinearGradient(0, 0, 0, 340); sky.addColorStop(0, '#1B2350'); sky.addColorStop(1, '#4B2E6E');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 340);
    g.fillStyle = '#FFF'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 256, (i * 53) % 220, 2, 2);
    g.fillStyle = '#73C47A'; g.beginPath(); g.arc(128, 150, 70, 0, 7); g.fill();
    g.fillStyle = '#4FA3D9'; g.beginPath(); g.arc(105, 135, 30, 0, 7); g.fill(); g.beginPath(); g.arc(160, 175, 22, 0, 7); g.fill();
    g.strokeStyle = '#FFC56B'; g.lineWidth = 6; g.beginPath(); g.ellipse(128, 150, 110, 24, -0.3, 0, 7); g.stroke();
    g.fillStyle = '#FFC56B'; g.font = '800 30px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('VISIT ELYSIUM', 128, 285);
  } else if (kind === 'photo') {
    g.fillStyle = '#FFF8EC'; g.fillRect(0, 0, 256, 340);
    const sky = g.createLinearGradient(0, 20, 0, 240); sky.addColorStop(0, '#FFB38A'); sky.addColorStop(1, '#FFE0B0');
    g.fillStyle = sky; g.fillRect(20, 20, 216, 230);
    g.fillStyle = '#FFE38A'; g.beginPath(); g.arc(150, 120, 30, 0, 7); g.fill();
    g.fillStyle = '#6D8F7A'; g.beginPath(); g.moveTo(20, 250); g.lineTo(90, 140); g.lineTo(150, 220); g.lineTo(200, 160); g.lineTo(236, 250); g.fill();
    g.fillStyle = '#5A3524'; g.font = '700 22px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('home, summer', 128, 300);
  } else if (kind === 'safety') {
    g.fillStyle = '#F5C542'; g.fillRect(0, 0, 256, 340); g.fillStyle = '#2B3550'; g.fillRect(14, 14, 228, 312);
    g.fillStyle = '#F5C542'; g.font = '800 30px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('SAFETY', 128, 62); g.fillText('FIRST', 128, 96);
    g.font = '700 17px Nunito, sans-serif'; g.fillStyle = '#FFF3DF';
    ['1. Clip your tether', '2. Check the seals', '3. Tell the crew', '4. Then have fun'].forEach((t, i) => g.fillText(t, 128, 160 + i * 36));
  } else if (kind === 'diagram') {
    g.fillStyle = '#E8F1F4'; g.fillRect(0, 0, 256, 340);
    g.strokeStyle = '#3A6E8F'; g.lineWidth = 1; for (let x = 0; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 340); g.stroke(); } for (let y = 0; y < 340; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.strokeStyle = '#1E3F5A'; g.lineWidth = 3; g.strokeRect(60, 80, 136, 160); g.beginPath(); g.arc(128, 160, 40, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(60, 120); g.lineTo(20, 120); g.moveTo(196, 200); g.lineTo(236, 200); g.stroke();
    g.fillStyle = '#1E3F5A'; g.font = '800 18px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('PUMP Mk II', 128, 290);
  } else if (kind === 'band') {
    g.fillStyle = '#2B2240'; g.fillRect(0, 0, 256, 340);
    g.fillStyle = '#FF7A59'; g.beginPath(); g.arc(128, 140, 80, 0, 7); g.fill(); g.fillStyle = '#2B2240'; for (let i = 0; i < 5; i++) g.fillRect(40, 140 + i * 14, 176, 6);
    g.fillStyle = '#FFC56B'; g.font = '800 34px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('THE COMETS', 128, 270); g.font = '700 16px Nunito, sans-serif'; g.fillText('LIVE ON TITAN', 128, 300);
  } else {
    g.fillStyle = '#FFF3DF'; g.fillRect(0, 0, 256, 340);
    g.fillStyle = '#3FA7B5'; g.font = '800 26px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('SAVE A LITTLE,', 128, 60); g.fillText('OFTEN', 128, 92);
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#7FE0C2', '#FFC56B', '#FF9DAE', '#9C8BE0', '#4FA3D9'][i]; g.fillRect(40 + i * 38, 290 - (i + 1) * 30, 28, (i + 1) * 30); }
  }
  return tex(c, { color: true });
}

// ---------- Screens and displays ----------
// A tiny live line chart. update(time) advances it a few times a second.
export function screenTexture({ title = 'SAVINGS', color = '#7FE0C2' } = {}) {
  const c = canvas(256, 140), g = c.getContext('2d'), t = tex(c, { color: true });
  const pts = Array.from({ length: 24 }, (_, i) => 60 + Math.sin(i * 0.7) * 18 + i * 1.5);
  let last = 0;
  function draw(time) {
    g.fillStyle = '#0E3B45'; g.fillRect(0, 0, 256, 140);
    g.strokeStyle = 'rgba(127,224,194,0.18)'; g.lineWidth = 1;
    for (let y = 20; y < 140; y += 24) { g.beginPath(); g.moveTo(10, y); g.lineTo(246, y); g.stroke(); }
    g.strokeStyle = color; g.lineWidth = 3; g.beginPath();
    pts.forEach((v, i) => g[i ? 'lineTo' : 'moveTo'](12 + i * 10, 128 - v));
    g.stroke();
    const k = (time * 2) % pts.length | 0;
    g.fillStyle = '#FFC56B'; g.beginPath(); g.arc(12 + k * 10, 128 - pts[k], 5, 0, 7); g.fill();
    g.fillStyle = color; g.font = '700 16px Nunito, sans-serif'; g.fillText(title, 12, 20);
    t.needsUpdate = true;
  }
  draw(0);
  return { texture: t, update(time) { if (time - last > 0.25) { last = time; pts.push(Math.max(30, Math.min(112, pts[pts.length - 1] + Math.sin(time * 1.3) * 4 + (pts[pts.length - 1] > 100 ? -6 : 0.8)))); pts.shift(); draw(time); } } };
}
// A star map with a dotted route, for the navigation table and a dashboard screen.
export function starMapTexture() {
  const c = canvas(512, 300), g = c.getContext('2d'), rand = rng(21);
  g.fillStyle = '#0B1A33'; g.fillRect(0, 0, 512, 300);
  g.strokeStyle = 'rgba(127,224,194,0.15)'; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 300); g.stroke(); } for (let y = 0; y < 300; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`; g.fillRect(rand() * 512, rand() * 300, 2, 2); }
  const stops = [[60, 220], [150, 160], [260, 190], [350, 90], [450, 120]];
  g.setLineDash([6, 6]); g.strokeStyle = '#FFC56B'; g.lineWidth = 2; g.beginPath(); stops.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); g.setLineDash([]);
  ['#73C47A', '#4FA3D9', '#E6B36A', '#EE9A98', '#9C8BE0'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(...stops[i], 9, 0, 7); g.fill(); });
  return { texture: tex(c, { color: true }) };
}
export function statusTexture() {
  const c = canvas(256, 160), g = c.getContext('2d');
  g.fillStyle = '#1B2238'; g.fillRect(0, 0, 256, 160);
  g.font = '700 15px Nunito, sans-serif';
  [['ENGINE', 0.8, '#7FE0C2'], ['FUEL', 0.62, '#FFC56B'], ['O2', 0.95, '#83CBEE'], ['POWER', 0.71, '#FF9DAE']].forEach(([n, v, col], i) => {
    g.fillStyle = '#C9D3EE'; g.fillText(n, 12, 30 + i * 34);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(90, 18 + i * 34, 150, 14); g.fillStyle = col; g.fillRect(90, 18 + i * 34, 150 * v, 14);
  });
  return { texture: tex(c, { color: true }) };
}
// A framed progress card for one goal: its name, a bar, and the percentage.
export function progressTexture(name, progress, color = '#7FE0C2') {
  const c = canvas(300, 228), g = c.getContext('2d'), p = Math.max(0, Math.min(1, progress));
  g.fillStyle = '#FFF8EC'; g.fillRect(0, 0, 300, 228);
  g.fillStyle = color; g.beginPath(); g.arc(46, 52, 26, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(38, 44, 9, 0, 7); g.fill();
  g.fillStyle = '#2B3550'; g.font = '800 26px Nunito, sans-serif';
  let s = 26; while (g.measureText(name).width > 200 && s > 14) { s -= 2; g.font = `800 ${s}px Nunito, sans-serif`; }
  g.fillText(name, 84, 62);
  g.fillStyle = '#E4DCCB'; g.beginPath(); g.roundRect(24, 110, 252, 30, 15); g.fill();
  g.fillStyle = p >= 1 ? '#F5B342' : color; g.beginPath(); g.roundRect(24, 110, Math.max(30, 252 * p), 30, 15); g.fill();
  g.fillStyle = '#2B3550'; g.font = '800 40px Nunito, sans-serif'; g.textAlign = 'center';
  g.fillText(p >= 1 ? 'Done!' : Math.round(p * 100) + '%', 150, 195);
  return tex(c, { color: true });
}
export function tileTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#F4F1EA'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#C9D3DA'; g.lineWidth = 3; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return tex(c, { color: true, repeat: [2, 2] });
}
export function grateTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#9AA3B6'; g.fillRect(0, 0, 128, 128);
  g.clearRect(0, 0, 0, 0); g.globalCompositeOperation = 'destination-out';
  for (let x = 6; x < 128; x += 16) for (let y = 6; y < 128; y += 16) g.fillRect(x, y, 10, 10);
  return tex(c, { color: true, repeat: [12, 2] });
}
export function crateTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), rand = rng(17);
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) { g.fillStyle = `rgba(110,70,40,${0.08 + rand() * 0.1})`; g.fillRect(0, y, 256, 42); g.fillStyle = 'rgba(70,40,20,0.4)'; g.fillRect(0, y, 256, 3); }
  g.strokeStyle = 'rgba(70,40,20,0.55)'; g.lineWidth = 16; g.strokeRect(8, 8, 240, 240);
  g.beginPath(); g.moveTo(16, 16); g.lineTo(240, 240); g.stroke();
  return tex(c, { color: true });
}

// ---------- The lofted hull ----------
// The canvas is split by v: belly (0-0.2, by z and x), roof (0.2-0.35, by z and x), sides (0.35-1, by z and height).
// u(z) gives u; side(y), roof(x), belly(x) give v. windows: [{ z, y, r }] square portholes (holes in the alpha map).
// bays: [{ z0, z1, x0, x1 }] belly hatches for the landing-gear wells. hot: z range near the engines (scorch marks).
// The paint is old and worked: mismatched replacement panels, faded and peeling paint, rust streaks and patches,
// oil and grime runs, scratches, and scorch marks near the engines.
export function loftTextures({ main, secondary, accent, rust = '#7A4528', trim = '#2E3032', u, side, roof, belly, windows = [], bays = [], seamsZ = [], hot = [4.6, 6.4], W = 2048, H = 1024, seed = 11 }) {
  const col = canvas(W, H), bump = canvas(W, H), rough = canvas(W / 2, H / 2), alpha = canvas(W, H);
  const c = col.getContext('2d'), b = bump.getContext('2d'), r = rough.getContext('2d'), a = alpha.getContext('2d'), rand = rng(seed);
  const X = z => u(z) * W, Y = v => (1 - v) * H;
  const band = (v0, v1, fill) => { c.fillStyle = fill; c.fillRect(0, Y(v1), W, Y(v0) - Y(v1)); };
  const tint = (hex, k, dr = 0, dg = 0, db = 0) => { const n = parseInt(hex.slice(1), 16); const ch = (v, d) => Math.max(0, Math.min(255, Math.round(v * k + d)));
    return `rgb(${ch(n >> 16, dr)},${ch((n >> 8) & 255, dg)},${ch(n & 255, db)})`; };
  b.fillStyle = 'rgb(128,128,128)'; b.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(175,175,175)'; r.fillRect(0, 0, W / 2, H / 2);
  a.fillStyle = '#fff'; a.fillRect(0, 0, W, H);
  // Base paint: khaki body, olive lower hull and skirt, a faded burnt-orange pinstripe, charcoal trim along the roof edge.
  band(side(-2.2), 1, main);
  band(0.35, side(-2.2), secondary);
  band(side(-2.25), side(-2.1), tint(accent, 0.85));
  band(side(0.86), side(0.95), trim);
  band(0.2, 0.35, tint(main, 0.92));
  for (const x of [-0.25, 0.25]) band(roof(x) - 0.004, roof(x) + 0.004, trim);
  band(0, 0.2, tint(secondary, 0.72));
  // Panels: staggered plates. Some are replacements in a slightly different shade; some have lost their paint.
  const plates = (v0, v1, rows, w, base) => {
    const h = (Y(v0) - Y(v1)) / rows;
    for (let row = 0; row < rows; row++) {
      const y0 = Y(v1) + row * h, off = (row % 2) * w / 2;
      for (let x = -off; x < W; x += w) {
        const k = rand();
        if (k < 0.14) { c.fillStyle = tint(base(y0 + h / 2), 0.86 + rand() * 0.2, rand() * 12 - 4, rand() * 10 - 2, -rand() * 8); c.fillRect(x + 2, y0 + 2, w - 4, h - 4); } // replacement panel
        else if (k < 0.2) { c.fillStyle = tint(rust, 0.95 + rand() * 0.2); c.fillRect(x + 2, y0 + 2, w - 4, h - 4); }                                 // a rusty patch panel
        else if (k < 0.5) { c.fillStyle = `rgba(${rand() < 0.5 ? '30,28,20' : '230,225,200'},${0.03 + rand() * 0.06})`; c.fillRect(x + 2, y0 + 2, w - 4, h - 4); }
        for (const g of [c, b]) { g.strokeStyle = g === c ? 'rgba(25,22,18,0.5)' : 'rgb(55,55,55)'; g.lineWidth = g === c ? 2 : 3; g.strokeRect(x, y0, w, h); }
        for (let i = 0; i < 4; i++) for (const [px, py] of [[x + 7 + i * (w - 14) / 3, y0 + 6], [x + 7 + i * (w - 14) / 3, y0 + h - 6]]) {
          c.fillStyle = 'rgba(40,35,28,0.55)'; c.beginPath(); c.arc(px, py, 2, 0, 7); c.fill();
          b.fillStyle = 'rgb(205,205,205)'; b.beginPath(); b.arc(px, py, 2.4, 0, 7); b.fill();
          if (rand() < 0.12) { const g = c.createLinearGradient(px, py, px, py + 40 + rand() * 60); g.addColorStop(0, 'rgba(120,60,25,0.5)'); g.addColorStop(1, 'rgba(120,60,25,0)'); c.fillStyle = g; c.fillRect(px - 2, py, 4, 100); } // rust bleeding from a rivet
        }
      }
    }
  };
  const sideBase = py => py > Y(side(-2.2)) ? secondary : main;
  plates(0.35, 1, 9, 118, sideBase);
  plates(0.2, 0.35, 3, 150, () => main);
  plates(0, 0.2, 4, 170, () => secondary);
  for (const z of seamsZ) for (const g of [c, b]) { g.fillStyle = g === c ? 'rgba(25,22,18,0.6)' : 'rgb(40,40,40)'; g.fillRect(X(z) - 4, 0, 8, H); }
  // Faded, chalky paint in broad patches (sun-bleached), and peeling paint showing grey primer and bare metal.
  for (let i = 0; i < 90; i++) {
    const x = rand() * W, y = rand() * H, s = 30 + rand() * 120, g = c.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(215,210,185,${0.05 + rand() * 0.08})`); g.addColorStop(1, 'rgba(215,210,185,0)'); c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const blob = (x, y, s, fill, g2 = null, k = 0) => { c.fillStyle = fill; c.beginPath(); for (let i = 0; i < 14; i++) { const t = i / 14 * 6.283, rr = s * (0.55 + rand() * 0.6); c.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.7); } c.closePath(); c.fill();
    if (g2) { g2.fillStyle = `rgb(${k},${k},${k})`; g2.beginPath(); for (let i = 0; i < 14; i++) { const t = i / 14 * 6.283, rr = s * (0.5 + rand() * 0.6); g2.lineTo(x / (g2 === r ? 2 : 1) + Math.cos(t) * rr / (g2 === r ? 2 : 1), y / (g2 === r ? 2 : 1) + Math.sin(t) * rr * 0.7 / (g2 === r ? 2 : 1)); } g2.closePath(); g2.fill(); } };
  for (let i = 0; i < 70; i++) { const x = rand() * W, y = rand() * H * 0.98, s = 6 + rand() * 22; blob(x, y, s * 1.25, 'rgba(25,22,18,0.35)'); blob(x, y, s, rand() < 0.6 ? '#8C8A80' : '#A6A39A', b, 110); } // peeled paint (with an edge)
  // Rust: patches and long streaks running down from seams and openings.
  for (let i = 0; i < 55; i++) { const x = rand() * W, y = rand() * H, s = 5 + rand() * 20; blob(x, y, s, tint(rust, 0.8 + rand() * 0.4)); blob(x + 2, y + 1, s * 0.5, tint(rust, 0.55)); blob(x, y, s, null || tint(rust, 0.9), r, 230); }
  for (let i = 0; i < 160; i++) {
    const x = rand() * W, y = rand() * H * 0.9, len = 30 + rand() * 160, w = 2 + rand() * 6, g = c.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, `rgba(${rand() < 0.75 ? '125,62,26' : '35,30,24'},${0.25 + rand() * 0.35})`); g.addColorStop(1, 'rgba(120,60,25,0)');
    c.fillStyle = g; c.fillRect(x, y, w, len);
  }
  // Oil and grime runs: darker drips, heavier low down on the sides and under the vents.
  for (let i = 0; i < 70; i++) { const x = rand() * W, y = Y(side(-0.6 + rand() * 1.8)), len = 40 + rand() * 120, g = c.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, 'rgba(20,18,14,0.45)'); g.addColorStop(1, 'rgba(20,18,14,0)'); c.fillStyle = g; c.fillRect(x, y, 3 + rand() * 5, len); }
  const grime = c.createLinearGradient(0, Y(side(-1.6)), 0, Y(0.35));
  grime.addColorStop(0, 'rgba(30,26,18,0)'); grime.addColorStop(1, 'rgba(30,26,18,0.45)');
  c.fillStyle = grime; c.fillRect(0, Y(side(-1.6)), W, Y(0.35) - Y(side(-1.6)));
  // Scratches: thin bright lines through the paint.
  c.lineWidth = 1;
  for (let i = 0; i < 260; i++) { const x = rand() * W, y = rand() * H, l = 10 + rand() * 70, ang = (rand() - 0.5) * 0.9;
    c.strokeStyle = `rgba(${rand() < 0.5 ? '205,200,185' : '60,55,45'},${0.3 + rand() * 0.4})`; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); c.stroke();
    b.strokeStyle = 'rgb(105,105,105)'; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); b.stroke(); }
  // Scorch marks near the engines: soot fading forward from the back of the hull.
  const sx0 = X(hot[0]), sx1 = X(hot[1]), soot = c.createLinearGradient(sx0, 0, sx1, 0);
  soot.addColorStop(0, 'rgba(15,12,10,0)'); soot.addColorStop(1, 'rgba(15,12,10,0.7)'); c.fillStyle = soot; c.fillRect(sx0, 0, sx1 - sx0, H);
  for (let i = 0; i < 30; i++) { const x = sx0 + rand() * (sx1 - sx0), y = rand() * H, s = 20 + rand() * 60, g = c.createRadialGradient(x, y, 0, x, y, s); g.addColorStop(0, 'rgba(10,8,6,0.4)'); g.addColorStop(1, 'rgba(10,8,6,0)'); c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2); }
  // Belly: hazard-striped hatches over the gear wells (the wells are behind them), service hatches and vent grilles.
  const hazard = (x, y, w, h) => {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = '#B8962E'; c.fillRect(x, y, w, h); c.fillStyle = '#26241F';
    for (let k = -h; k < w + h; k += 24) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k + 12, y); c.lineTo(x + k + 12 + h, y + h); c.lineTo(x + k + h, y + h); c.fill(); }
    c.fillStyle = 'rgba(40,30,20,0.35)'; c.fillRect(x, y, w, h); c.restore();
  };
  for (const s of [-1, 1]) for (const bay of bays) {
    const x0 = X(bay.z0), x1 = X(bay.z1), ya = Y(belly(s * bay.x0)), yb = Y(belly(s * bay.x1)), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
    hazard(x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24);
    b.fillStyle = 'rgb(200,200,200)'; b.fillRect(x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24);
    a.fillStyle = '#000'; a.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  for (const [z, x, w, h] of [[-4.6, 0, 0.9, 0.7], [-0.6, -0.9, 0.7, 0.6], [0.8, 0.5, 1.2, 0.8], [5.3, 0, 0.8, 0.8]]) {
    const x0 = X(z - w / 2), x1 = X(z + w / 2), y0 = Y(belly(x + h / 2)), y1 = Y(belly(x - h / 2));
    c.fillStyle = tint(secondary, 0.62); c.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (const g of [c, b]) { g.strokeStyle = g === c ? 'rgba(20,18,14,0.7)' : 'rgb(40,40,40)'; g.lineWidth = 4; g.strokeRect(x0, y0, x1 - x0, y1 - y0); }
  }
  for (const [z, x] of [[-2.0, 0.6], [-2.0, -0.6], [3.0, 0], [-5.8, 0.9], [-5.8, -0.9]]) {
    const x0 = X(z - 0.35), y0 = Y(belly(x + 0.25)), w = X(z + 0.35) - x0, h = Y(belly(x - 0.25)) - y0;
    c.fillStyle = trim; c.fillRect(x0, y0, w, h);
    for (let k = 4; k < w - 4; k += 9) { c.fillStyle = '#6E6A60'; c.fillRect(x0 + k, y0 + 3, 4, h - 6); b.fillStyle = 'rgb(200,200,200)'; b.fillRect(x0 + k, y0 + 3, 4, h - 6); }
  }
  // Square portholes: a hole with a raised, bolted frame, and a rust stain running from the bottom corners.
  for (const w of windows) {
    const x0 = X(w.z - w.r), x1 = X(w.z + w.r), y0 = Y(side(w.y + w.r)), y1 = Y(side(w.y - w.r)), m = 14;
    c.fillStyle = '#5E5C55'; c.beginPath(); c.roundRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m, 14); c.fill();
    b.fillStyle = 'rgb(215,215,215)'; b.beginPath(); b.roundRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m, 14); b.fill();
    c.fillStyle = '#3B3A35'; for (const [px, py] of [[x0 - 7, y0 - 7], [x1 + 7, y0 - 7], [x0 - 7, y1 + 7], [x1 + 7, y1 + 7], [(x0 + x1) / 2, y0 - 7], [(x0 + x1) / 2, y1 + 7]]) { c.beginPath(); c.arc(px, py, 3, 0, 7); c.fill(); }
    for (const px of [x0, x1]) { const g = c.createLinearGradient(px, y1, px, y1 + 90); g.addColorStop(0, 'rgba(125,62,26,0.6)'); g.addColorStop(1, 'rgba(125,62,26,0)'); c.fillStyle = g; c.fillRect(px - 3, y1 + m, 6, 90); }
    a.fillStyle = '#000'; a.beginPath(); a.roundRect(x0, y0, x1 - x0, y1 - y0, 8); a.fill();
  }
  // Roughness: paint is matte; rust is rougher, oil a little shinier.
  for (let i = 0; i < 160; i++) { const x = rand() * W / 2, y = rand() * H / 2, s = 4 + rand() * 18; r.fillStyle = `rgba(${rand() < 0.7 ? '235,235,235' : '120,120,120'},${0.2 + rand() * 0.3})`; r.beginPath(); r.arc(x, y, s, 0, 7); r.fill(); }
  return { map: tex(col, { color: true }), bumpMap: tex(bump), roughnessMap: tex(rough), alphaMap: tex(alpha) };
}

// Weathered paint for the parts bolted onto the hull (wings, pods, spine modules, nacelles): faded base colour,
// replacement-panel blocks, rust streaks and patches, grime, scratches. Cached per colour.
const wornCache = new Map();
export function wornTexture(color, seed = 5) {
  const key = color + seed; if (wornCache.has(key)) return wornCache.get(key);
  const S = 256, cv = canvas(S, S), c = cv.getContext('2d'), rand = rng(seed + color.length * 7);
  c.fillStyle = color; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(${rand() < 0.5 ? '25,22,16' : '225,220,195'},${0.06 + rand() * 0.08})`; c.fillRect(rand() * S, rand() * S, 40 + rand() * 90, 30 + rand() * 70); }
  c.strokeStyle = 'rgba(20,18,14,0.45)'; c.lineWidth = 1.5; c.strokeRect(6, 6, S - 12, S - 12);
  for (let i = 0; i < 14; i++) { const x = rand() * S, y = rand() * S * 0.7, len = 20 + rand() * 90, g = c.createLinearGradient(x, y, x, y + len); g.addColorStop(0, 'rgba(125,62,26,0.5)'); g.addColorStop(1, 'rgba(125,62,26,0)'); c.fillStyle = g; c.fillRect(x, y, 2 + rand() * 4, len); }
  for (let i = 0; i < 8; i++) { const x = rand() * S, y = rand() * S, s = 3 + rand() * 10; c.fillStyle = `rgba(118,62,30,${0.5 + rand() * 0.4})`; c.beginPath(); c.ellipse(x, y, s, s * 0.7, rand() * 3, 0, 7); c.fill(); }
  for (let i = 0; i < 6; i++) { const x = rand() * S, y = rand() * S, s = 3 + rand() * 9; c.fillStyle = '#8E8B80'; c.beginPath(); c.ellipse(x, y, s, s * 0.6, rand() * 3, 0, 7); c.fill(); }
  c.lineWidth = 1; for (let i = 0; i < 30; i++) { const x = rand() * S, y = rand() * S, l = 6 + rand() * 30, a = (rand() - 0.5); c.strokeStyle = `rgba(210,205,190,${0.25 + rand() * 0.3})`; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  const g = c.createLinearGradient(0, S * 0.5, 0, S); g.addColorStop(0, 'rgba(25,22,16,0)'); g.addColorStop(1, 'rgba(25,22,16,0.3)'); c.fillStyle = g; c.fillRect(0, 0, S, S);
  const t = tex(cv, { color: true }); wornCache.set(key, t); return t;
}

// A whiteboard covered in formulas, arrows and a little orbit sketch.
export function whiteboardTexture() {
  const c = canvas(640, 400), g = c.getContext('2d'), rand = rng(5);
  g.fillStyle = '#F7F9FA'; g.fillRect(0, 0, 640, 400);
  g.font = '600 26px "Comic Sans MS", Nunito, sans-serif';
  const lines = [['#1F4E8C', 'F = G m1 m2 / r²'], ['#C0392B', 'Δv = ve ln(m0 / mf)'], ['#1F4E8C', 'T² ∝ a³'], ['#2E7D4F', 'pH 6.2 → 5.8 ?'], ['#1F4E8C', 'E = ½ m v²'], ['#C0392B', 'save 10% → 3.2 yrs!']];
  lines.forEach(([col, t], i) => { g.fillStyle = col; g.save(); g.translate(24 + (i % 2) * 300, 50 + Math.floor(i / 2) * 120); g.rotate((rand() - 0.5) * 0.06); g.fillText(t, 0, 0); g.restore(); });
  g.strokeStyle = '#1F4E8C'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(520, 300, 80, 40, -0.2, 0, 7); g.stroke(); g.beginPath(); g.arc(520, 300, 14, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(240, 130); g.quadraticCurveTo(290, 170, 330, 140); g.stroke(); g.beginPath(); g.moveTo(330, 140); g.lineTo(318, 136); g.lineTo(324, 148); g.stroke();
  g.strokeStyle = '#2E7D4F'; g.beginPath(); for (let x = 30; x < 280; x += 4) g.lineTo(x, 330 - Math.sin(x / 30) * 30 - x * 0.12); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 30; g.beginPath(); g.moveTo(380, 60); g.lineTo(560, 80); g.stroke(); // a half-wiped smudge
  return tex(c, { color: true });
}

// ---------- Animated bridge screens (each redraws a few times a second at most) ----------
const screenFrame = (g, w, h, title, color) => {
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; for (let y = 0; y < h; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } // faint scanlines
  g.fillStyle = color; g.font = '700 14px Nunito, sans-serif'; g.fillText(title, 10, 18);
};
// A radar: a slow sweep with blips that fade after it passes.
export function radarTexture() {
  const W = 256, H = 200, c = canvas(W, H), g = c.getContext('2d'), t = tex(c, { color: true }), rand = rng(44);
  const blips = Array.from({ length: 7 }, () => ({ a: rand() * 6.283, r: 20 + rand() * 65 }));
  let last = -1;
  function draw(time) {
    g.fillStyle = '#081C14'; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + 8, R = 82, sweep = (time * 0.9) % 6.283;
    g.strokeStyle = 'rgba(110,220,150,0.25)'; g.lineWidth = 1;
    for (const r of [R / 3, R * 2 / 3, R]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    for (let k = 0; k < 18; k++) { const a = sweep - k * 0.04; g.strokeStyle = `rgba(110,230,150,${0.35 * (1 - k / 18)})`; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
    for (const b of blips) { const since = (sweep - b.a + 6.283) % 6.283, al = Math.max(0, 1 - since / 4); if (al <= 0) continue; g.fillStyle = `rgba(150,255,180,${al})`; g.beginPath(); g.arc(cx + Math.cos(b.a) * b.r, cy + Math.sin(b.a) * b.r, 3, 0, 7); g.fill(); }
    screenFrame(g, W, H, 'RADAR', '#8FE6A8');
    t.needsUpdate = true;
  }
  draw(0);
  return { texture: t, update(time) { if (time - last > 0.1) { last = time; draw(time); } } };
}
// A rear camera feed: drifting stars past the engine, with a timestamp.
export function cameraFeedTexture() {
  const W = 256, H = 160, c = canvas(W, H), g = c.getContext('2d'), t = tex(c, { color: true }), rand = rng(52);
  const stars = Array.from({ length: 60 }, () => ({ x: rand() * W, y: rand() * H, s: 0.5 + rand() * 1.5 }));
  let last = -1;
  function draw(time) {
    g.fillStyle = '#0A0D12'; g.fillRect(0, 0, W, H);
    for (const s of stars) { const x = (s.x + time * 12 * s.s) % W; g.fillStyle = `rgba(220,230,255,${0.35 + s.s * 0.3})`; g.fillRect(x, s.y, s.s, s.s); }
    g.fillStyle = '#3A3C36'; g.beginPath(); g.moveTo(W, H); g.lineTo(W * 0.55, H); g.lineTo(W * 0.7, H * 0.62); g.lineTo(W, H * 0.55); g.fill(); // the hull edge in frame
    g.fillStyle = 'rgba(255,170,90,0.35)'; g.beginPath(); g.arc(W * 0.86, H * 0.86, 10 + Math.sin(time * 6) * 1.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(200,210,190,0.06)'; g.fillRect(0, (time * 40) % H, W, 6);   // a rolling bar
    screenFrame(g, W, H, 'CAM 2  AFT', '#D9DDD2');
    g.fillStyle = '#FF6A5A'; g.beginPath(); g.arc(W - 16, 14, 4, 0, 7); g.fill();
    g.fillStyle = '#C9CFC0'; g.font = '600 11px monospace'; g.fillText('T+' + (1000 + time | 0), W - 72, H - 8);
    t.needsUpdate = true;
  }
  draw(0);
  return { texture: t, update(time) { if (time - last > 0.12) { last = time; draw(time); } } };
}
// A systems diagram: boxes for the ship's systems, joined by lines, with gently blinking status dots.
export function systemsTexture() {
  const W = 256, H = 180, c = canvas(W, H), g = c.getContext('2d'), t = tex(c, { color: true });
  const nodes = [['POWER', 40, 50], ['FUEL', 40, 110], ['ENGINE', 128, 80], ['O2', 216, 50], ['DATA', 216, 110], ['NAV', 128, 150]];
  const links = [[0, 2], [1, 2], [2, 3], [2, 4], [2, 5], [4, 5]];
  let last = -1;
  function draw(time) {
    g.fillStyle = '#141B2A'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(131,203,238,0.5)'; g.lineWidth = 2;
    for (const [a, b] of links) { g.beginPath(); g.moveTo(nodes[a][1], nodes[a][2]); g.lineTo(nodes[b][1], nodes[b][2]); g.stroke(); }
    nodes.forEach(([n, x, y], i) => {
      g.fillStyle = '#22304A'; g.fillRect(x - 30, y - 12, 60, 24); g.strokeStyle = '#83CBEE'; g.strokeRect(x - 30, y - 12, 60, 24);
      g.fillStyle = '#C9D9EE'; g.font = '700 10px Nunito, sans-serif'; g.fillText(n, x - 24, y + 4);
      const on = Math.sin(time * 1.6 + i * 1.3) > -0.6; g.fillStyle = i === 1 ? (on ? '#FFC56B' : '#6A5530') : (on ? '#7FE0C2' : '#2F5A50'); g.beginPath(); g.arc(x + 22, y, 3.5, 0, 7); g.fill();
    });
    screenFrame(g, W, H, 'SYSTEMS', '#83CBEE');
    t.needsUpdate = true;
  }
  draw(0);
  return { texture: t, update(time) { if (time - last > 0.2) { last = time; draw(time); } } };
}
// The navigation map with the ship's marker creeping along the route.
export function navMapTexture() {
  const base = starMapTexture().texture.image, W = base.width, H = base.height, c = canvas(W, H), g = c.getContext('2d'), t = tex(c, { color: true });
  const stops = [[60, 220], [150, 160], [260, 190], [350, 90], [450, 120]];
  let last = -1;
  function draw(time) {
    g.drawImage(base, 0, 0);
    const u = (time * 0.03) % 1 * (stops.length - 1), i = Math.floor(u), f = u - i, a = stops[i], b = stops[i + 1];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9 + Math.sin(time * 3) * 2, 0, 7); g.stroke();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y + 5); g.lineTo(x - 5, y + 5); g.fill();
    screenFrame(g, W, H, 'NAVIGATION', '#7FE0C2');
    t.needsUpdate = true;
  }
  draw(0);
  return { texture: t, update(time) { if (time - last > 0.15) { last = time; draw(time); } } };
}
// A small printed label (white or yellow) for boxes, bins and shelves.
const labelCache = new Map();
export function boxLabelTexture(text, bg = '#E8E2D2') {
  const key = text + bg; if (labelCache.has(key)) return labelCache.get(key);
  const c = canvas(128, 48), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#26241F'; g.font = '800 22px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 26);
  const t = tex(c, { color: true }); labelCache.set(key, t); return t;
}
