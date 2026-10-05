// Flying into a planet's air. Each planet has layers, measured from its centre in multiples of its (scaled) radius:
//   outer glow   from glowTop down to upperTop: the atmosphere ring brightens and the rim lights up as you approach
//   upper layer  from upperTop down to cloudTop: a faint haze in the planet's sky colour, stars dim, the engine flares a little
//   cloud layer  from cloudTop down to the deck: moving cloud sheets around the ship, soft shake, a light shimmer
//   cloud deck   the bottom of the clouds: going below it hands over to the surface world (surface.js), hidden by a cloud veil
// Everything grows smoothly with depth. Debt planets are stormy: darker clouds, rain and soft distant lightning, scaled by
// how much is still owed. With reduced motion there is no shake, shimmer or rain movement: only gentle fades.
import * as THREE from 'three';
import { WORLD } from './settings.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// A planet's air, from its seeded look. r() is the planet's own random sequence, so the same name gives the same air.
// surf is the highest ground (crystal spires stick up further), so the deck always stays clear of it.
export function airProfile(look, r, storm = 0) {
  const surf = look.biome.crystals ? 1.36 : look.biome.kind === 'mesa' ? 1.15 : look.biome.kind === 'terra' ? 1.1 : 1.03;
  const cloud = (storm ? 0.16 : 0.09) + r() * 0.07, upper = 0.16 + r() * 0.14;
  const sky = new THREE.Color(look.biome.atmo), tint = storm ? new THREE.Color('#4A4560').lerp(new THREE.Color('#2A2638'), storm) : new THREE.Color('#FFFFFF').lerp(sky, 0.18);
  return { surf, cloud, upper, glow: 0.9, sky, cloudTint: tint, coverage: storm ? 0.62 + storm * 0.2 : 0.3 + r() * 0.18, storm };
}
// Distances (from the centre, in world units) for a planet at its current size. The deck is at least a ship's size above
// the highest ground.
export function airLevels(p, shipRadius) {
  const R = p.look.radius * p.group.scale.x, a = p.air, surf = R * a.surf;
  const deck = Math.max(R * (a.surf + 0.05), surf + shipRadius * 2 + 6);
  // Each layer is thick enough to fly through and feel, even on the smallest planet.
  const cloudTop = deck + Math.max(R * a.cloud, 35), upperTop = cloudTop + Math.max(R * a.upper, 45), glowTop = upperTop + R * a.glow;
  return { R, surf, deck, cloudTop, upperTop, glowTop };
}

// A soft, lumpy cloud puff for the sheets around the ship.
function puffTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x = S * (0.25 + r() * 0.5), y = S * (0.3 + r() * 0.4), rad = S * (0.12 + r() * 0.2), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowDot() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

// opts: { universe (group the planets live in), camera, shipRadius }
export function makeAirFX({ universe, camera, shipRadius }) {
  const tint = document.getElementById('skyTint'), line = document.getElementById('layerLine');
  // Cloud sheets: billboards that hang still in the air (the ship moves through them), recycled around the camera.
  const N = 36, puffTex = puffTexture(), puffs = [];
  const puffGroup = new THREE.Group(); universe.add(puffGroup);
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; s.userData.drift = new THREE.Vector3(); puffGroup.add(s); puffs.push(s);
  }
  // Rain: short streaks falling toward the planet, around the camera.
  const RAIN = 420, rainPos = new Float32Array(RAIN * 6), rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#B8C4E0', transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; universe.add(rain);
  // Lightning: a soft glow deep in the clouds that swells and fades. Never a strobe.
  const bolt = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowDot(), color: '#D8D0FF', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  bolt.visible = false; universe.add(bolt);
  const flash = { t: 0, next: 4, peak: 0, rise: 0.25, fall: 1.1 };

  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3();
  let current = null, shown = '', time = 0, inited = false;
  const state = { layer: null, planet: null, glow: 0, upper: 0, cloud: 0, deck: false, maxSpeed: Infinity, flare: 0, shake: new THREE.Vector3(), fov: 0, starFade: 1 };

  function placePuff(s, center, L, around, anywhere) {
    // Somewhere near the camera, inside the cloud band, mostly ahead of where it's heading.
    v.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize().multiplyScalar(anywhere ? 80 + Math.random() * 160 : 190 + Math.random() * 50);
    v.add(around);
    v2.copy(v).sub(center); const d = clamp(v2.length(), L.deck + 4, L.cloudTop - 4); v.copy(center).addScaledVector(v2.normalize(), d);
    s.position.copy(v);
    const size = 45 + Math.random() * 90; s.scale.set(size * (1.4 + Math.random()), size, 1);
    s.material.rotation = Math.random() * 6.28;
    s.userData.drift.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(4);
    s.userData.base = 0.55 + Math.random() * 0.45;
  }

  // planets: [{ group, look, air, myth, debt }], shipPos in universe space. Returns the state for the flight code.
  // following: whether the camera is with the ship (the tint and the layer line only show then).
  function update(dt, { planets, shipPos, reduced, speed = 0, following = true }) {
    time += dt;
    // The planet whose air we're in (or nearest to it).
    let best = null, bestK = Infinity, L = null;
    for (const p of planets) {
      const lv = airLevels(p, shipRadius), d = shipPos.distanceTo(p.group.position), k = (d - lv.deck) / lv.R;
      if (k < bestK) { bestK = k; best = p; L = lv; }
    }
    const camPos = camera.position;
    let g = 0, u = 0, c = 0, d = Infinity;
    if (best) {
      d = shipPos.distanceTo(best.group.position);
      g = smooth(L.glowTop, L.upperTop, d);
      u = smooth(L.upperTop, L.cloudTop, d);
      c = smooth(L.cloudTop, L.cloudTop - (L.cloudTop - L.deck) * 0.5, d);
    }
    const storm = best?.air.storm || 0;
    state.planet = best; state.levels = L; state.glow = g; state.upper = u; state.cloud = c; state.dist = d;
    state.deck = best && d < L.deck + 8;
    state.layer = !best || g <= 0.001 ? null : state.deck ? 'Cloud deck' : c > 0.02 ? 'Cloud layer' : u > 0.02 ? 'Upper atmosphere' : 'Outer glow';
    // Slower in thicker air, so arriving at the deck is always gentle.
    // The limits ease from one layer to the next, with no step anywhere (settings.js: WORLD.air).
    const A = WORLD.air;
    state.maxSpeed = c > 0 ? A.deck + (1 - c) * (A.cloud - A.deck) : u > 0 ? A.upper - (A.upper - A.upperLow) * u : g > 0 ? A.glow / Math.max(g * g, 1e-4) : Infinity;
    state.flare = u * 0.3 + c * 0.15;
    state.starFade = Math.max(0.05, 1 - 0.55 * u - 0.45 * c);
    // Every planet's ring of air brightens as you come close, and fades once you're inside it.
    for (const p of planets) {
      const lv = airLevels(p, shipRadius), dd = camPos.distanceTo(p.group.position);
      p.airGlow = (1 + 0.9 * smooth(lv.glowTop * 1.6, lv.upperTop, dd)) * (1 - 0.8 * smooth(lv.upperTop, lv.cloudTop, dd));   // dims once you're in the air
    }

    // Sky tint, with a little extra light when lightning glows.
    const fl = flashLevel(dt, storm, c + u * 0.5, reduced);
    if (tint) {
      // Thick enough in the clouds to hide the faint stars painted into the far backdrop; thicker on stormy planets.
      const a = (0.12 * u + (0.34 + 0.16 * storm) * c) * (best && following ? 1 : 0);
      if (best && best !== current) tint.style.background = '#' + best.air.sky.getHexString();
      tint.style.opacity = Math.min(0.75, a + fl * 0.14).toFixed(3);
    }
    current = best;
    // The HUD line: which layer, and a gentle note at the deck.
    const text = state.layer && following ? (state.layer === 'Cloud deck' ? `Cloud deck · ${best.myth} · keep going down to land` : `${state.layer} · ${best.myth}`) : '';
    if (line && text !== shown) { shown = text; line.textContent = text; line.hidden = !text; }

    // Cloud sheets around the camera.
    const showClouds = best && (c > 0.01 || u > 0.7);
    puffGroup.visible = !!showClouds;
    if (showClouds) {
      const center = best.group.position, op = c * 1.0 + Math.max(0, u - 0.7) * 0.6;
      for (const s of puffs) {
        if (!s.visible || s.position.distanceTo(camPos) > 260 || !inited) { placePuff(s, center, L, camPos, !inited || !s.visible); s.visible = true; }
        if (!reduced) s.position.addScaledVector(s.userData.drift, dt);
        s.material.color.copy(best.air.cloudTint);
        // Sheets fade out as they come close, so none ever cuts across the ship or the camera.
        s.material.opacity = op * s.userData.base * smooth(55, 110, s.position.distanceTo(camPos)) * smooth(30, 70, s.position.distanceTo(shipPos));
      }
      inited = true;
    } else { for (const s of puffs) s.visible = false; inited = false; }

    // Rain on stormy planets, inside the clouds. With reduced motion it simply doesn't fall.
    const rainOn = best && storm > 0 && c > 0.05 && !reduced;
    rain.visible = !!rainOn;
    if (rainOn) {
      const center = best.group.position, n = Math.floor(RAIN * clamp(storm, 0.25, 1));
      rainGeo.setDrawRange(0, n * 2);
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        v.set(rainPos[o], rainPos[o + 1], rainPos[o + 2]);
        if (v.distanceTo(camPos) > 70 || (v.x === 0 && v.y === 0 && v.z === 0)) v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(130).add(camPos);
        up.copy(v).sub(center).normalize();
        v.addScaledVector(up, -dt * 60);
        rainPos.set([v.x, v.y, v.z, v.x + up.x * 5, v.y + up.y * 5, v.z + up.z * 5], o);
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.material.opacity = 0.6 * c * clamp(storm, 0.3, 1);
    }
    // Lightning glow somewhere in the clouds.
    bolt.visible = fl > 0.01;
    bolt.material.opacity = fl * 0.85;

    // Camera feel: a soft shake and a faint shimmer in the clouds (none with reduced motion).
    if (reduced || !best) { state.shake.set(0, 0, 0); state.fov = 0; }
    else {
      const amp = (0.05 + 0.08 * storm) * c * (0.5 + Math.min(1, speed / 40));
      state.shake.set(Math.sin(time * 13.1) + Math.sin(time * 7.3) * 0.6, Math.sin(time * 11.7 + 1) + Math.sin(time * 5.9) * 0.5, Math.sin(time * 9.3 + 2)).multiplyScalar(amp);
      state.fov = Math.sin(time * 17) * 0.18 * c;
    }
    return state;
  }

  function flashLevel(dt, storm, depth, reduced) {
    if (!storm || depth < 0.15 || !current) { flash.t = 0; return 0; }
    flash.next -= dt;
    if (flash.next <= 0 && flash.t <= 0) {
      // Start a new glow: somewhere off to the side, deep in the clouds, a few hundred units away.
      flash.t = 1e-6; flash.peak = 0.5 + 0.5 * storm; flash.rise = reduced ? 0.8 : 0.25; flash.fall = reduced ? 2.4 : 1.2;
      const L = airLevels(current, shipRadius), center = current.group.position;
      // Somewhere ahead of the camera (so it's seen), off to one side, a few hundred units away.
      camera.getWorldDirection(v2); v.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.5, Math.random() - 0.5).multiplyScalar(0.9).add(v2).normalize().multiplyScalar(250 + Math.random() * 300).add(camera.position);
      v2.copy(v).sub(center); v.copy(center).addScaledVector(v2.normalize(), (L.deck + L.cloudTop) / 2);
      bolt.position.copy(v); const s = 260 + Math.random() * 260; bolt.scale.set(s, s, 1);
      flash.next = (5 + Math.random() * 6) / (0.4 + storm);
    }
    if (flash.t <= 0) return 0;
    flash.t += dt;
    const lvl = flash.t < flash.rise ? flash.t / flash.rise : Math.max(0, 1 - (flash.t - flash.rise) / flash.fall);
    if (flash.t > flash.rise + flash.fall) flash.t = 0;
    return lvl * flash.peak;
  }
  // While the ship is down on a surface: hide everything here and let the line be rewritten from scratch afterwards.
  function hide() { puffGroup.visible = false; rain.visible = false; bolt.visible = false; if (tint) tint.style.opacity = '0'; shown = '\u0000'; inited = false; }
  return { update, state, hide };
}
