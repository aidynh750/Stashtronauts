// The player's ship: a big, angular, much-modified two-story spaceship that is also the pilot's home.
// It flies along -Z. The hull shape is in hull.js, everything on the outside in exterior.js, the rooms in interior.js. From normal distance it's a solid, closed vehicle: you see the pilot only through the windshield and
// portholes. Zoom in close (or press "Look closer") and the near hull panels and roof slide away to show both decks
// like a dollhouse. The engine is always solid and never part of the cutaway.
// Units: the hull is in world units. The interior and the pilot are built in meters inside a group scaled by S.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePilot } from './pilot.js';
import { makeCrew } from './crew.js';
import * as T from './textures.js';
import { buildInterior } from './interior.js';
import { buildExterior } from './exterior.js';
import { halfWidth, zRange, onHull } from './hull.js';

// The outside is rugged and rustic: weathered khaki and olive panels, rust, charcoal trim, a few burnt-orange accents.
export const SHIP_COLORS = { main: '#9A9470', secondary: '#5E6447', accent: '#B4592C', rust: '#7A4528', trim: '#2E3032' };
const PI = Math.PI;
// Interior, in meters: lower floor at 0, its ceiling at 3; upper floor at 3.5, its ceiling at 6.5.
const S = 0.456, Y0 = -2.3;
const LOW = 0, UP = 3.5, CEIL = 6.5;
const ROOF_Y = Y0 + (CEIL - 0.1) * S;        // where the roof is cut when open (just under the upper ceiling)
const toY = h => Y0 + h * S;
// Porthole positions along the hull (world units), placed where the rooms inside have free wall: bathroom, galley,
// lounge (over the desk) and the science lab on the lower deck; the bridge on the upper deck.
const LOW_WINDOWS = [-3.352, -2.098, 0.137, 1.368], UP_WINDOWS = [-3.466];
// Landing-gear wells in the belly (world units, x is the distance from the centre line).
const BAYS = [{ z0: -5.05, z1: -2.4, x0: 0.7, x1: 1.85 }, { z0: 2.55, z1: 5.2, x0: 0.7, x1: 1.85 }];

// ---------- Materials ----------
// "Hull" materials are clipped by the cutaway planes. Everything else (engine, interior props, tow pod) never is.
const cutPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e5), new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e5)];
const cache = new Map();
const once = (key, make) => cache.has(key) ? cache.get(key) : (cache.set(key, make()), cache.get(key));
// The cache key covers every option's value (textures by id), so two different looks never share a material.
const keyOf = extra => Object.entries(extra).map(([k, v]) => k + ':' + (v?.uuid ?? (typeof v === 'object' ? '' : v))).join();
const hullMat = (color, extra = {}) => once('h' + color + keyOf(extra), () =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, clippingPlanes: cutPlanes, ...extra }));
const solid = (color, extra = {}) => once('s' + color + keyOf(extra), () =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra }));
const basic = (color, clip = false) => once('b' + color + clip, () => new THREE.MeshBasicMaterial({ color, clippingPlanes: clip ? cutPlanes : null }));

const geo = {
  box: (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)),
  cyl: (r0, r1, h, seg = 16) => new THREE.CylinderGeometry(r0, r1, h, seg),
  ball: new THREE.SphereGeometry(1, 16, 12),
};
function mesh(g, m, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...pos); o.rotation.set(...rot);
  if (typeof scale === 'number') o.scale.setScalar(scale); else o.scale.set(...scale);
  return o;
}

// Static props are merged into one mesh per material, so the whole interior costs a handful of draw calls.
function makeBatch() {
  const byMat = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  return {
    add(g, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
      m4.compose(p.set(...pos), q.setFromEuler(e.set(...rot)), typeof scale === 'number' ? s.setScalar(scale) : s.set(...scale));
      const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
      for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
      if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
      if (!byMat.has(material)) byMat.set(material, []);
      byMat.get(material).push(c);
    },
    addMesh(o) { o.updateMatrix(); this.add(o.geometry, o.material, o.position.toArray(), [o.rotation.x, o.rotation.y, o.rotation.z], o.scale.toArray()); },
    build(parent) {
      for (const [m, list] of byMat) { const merged = mergeGeometries(list, false); parent.add(new THREE.Mesh(merged, m)); list.forEach(g => g.dispose()); }
      byMat.clear();
    },
  };
}

// ---------- Where the hull is (the shape itself lives in hull.js) ----------
// A deck floor shaped to fit inside the hull, in meters, with an optional ladder hole [x0, x1, z0, z1].
const hwM = (h, z) => halfWidth(toY(h), z * S) / S;
function deckGeometry(h, thick, hole, zFrom = -Infinity, zTo = Infinity) {
  const [za, zb] = zRange(toY(h)), z0 = Math.max(za / S + 0.1, zFrom), z1 = Math.min(zb / S - 0.1, zTo), N = 80, pts = [];
  for (let i = 0; i <= N; i++) { const z = z0 + (z1 - z0) * i / N; pts.push(new THREE.Vector2(Math.max(0.05, hwM(h, z) - 0.1), -z)); }
  for (let i = N; i >= 0; i--) { const z = z0 + (z1 - z0) * i / N; pts.push(new THREE.Vector2(-Math.max(0.05, hwM(h, z) - 0.1), -z)); }
  const shape = new THREE.Shape(pts);
  if (hole) { const [x0, x1, z0, z1] = hole; shape.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x0, -z1), new THREE.Vector2(x1, -z1), new THREE.Vector2(x1, -z0)])); }
  return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 4 }).rotateX(-PI / 2).translate(0, h - thick, 0);
}

export function makeShip(colors = SHIP_COLORS) {
  const C = { ...SHIP_COLORS, ...colors };
  const root = new THREE.Group();   // position and heading
  const body = new THREE.Group();   // bank, bob and lean
  root.add(body);
  const metalTex = T.metalTexture();
  const metal = solid('#AEB7C8', { map: metalTex, metalness: 0.55, roughness: 0.35 });
  const darkMetal = solid('#4A5266', { metalness: 0.5, roughness: 0.45 });

  // ---------- Outside: the lofted hull, windshield, portholes and everything bolted on (exterior.js) ----------
  const windows = [];
  for (const side of [-1, 1]) {
    for (const z of LOW_WINDOWS) windows.push({ side, y: toY(1.6), z });   // lower deck, at eye height
    for (const z of UP_WINDOWS) windows.push({ side, y: toY(5.1), z });    // upper deck
  }
  const outside = buildExterior(body, { C, hullMat, solid, basic, geo, mesh, makeBatch, T, cutPlanes, windows, windowR: 0.3, bays: BAYS,
    airlockY: toY(1.25), airlockZ: 9.5 * S });
  const runningLights = outside.runningLights;
  // Ship name on both sides of the lower hull, and the registration up by the nose.
  for (const side of [-1, 1]) {
    nameDecals.push(onHull(mesh(new THREE.PlaneGeometry(1.75, 0.32), new THREE.MeshStandardMaterial({ transparent: true, clippingPlanes: cutPlanes, roughness: 0.6, alphaTest: 0.1 })), side, -1.05, -1.0, 0.03));
    const reg = onHull(mesh(new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshStandardMaterial({ map: T.textTexture('SN-0042', { color: '#2B3550', size: 80 }), transparent: true, clippingPlanes: cutPlanes, alphaTest: 0.1 })), side, -1.35, -4.5, 0.03);
    body.add(nameDecals[nameDecals.length - 1], reg);
  }

  // ---------- Engine: always solid (never clipped), housing, radiators, nozzle bell, turbine and inner glow ----------
  const engine = new THREE.Group();
  const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(PI / 2);
  engine.add(mesh(lathe([[2.05, 5.2], [2.4, 5.6], [2.52, 6.3], [2.45, 7.0], [2.2, 7.35], [1.75, 7.45]]), metal));        // housing
  engine.add(mesh(new THREE.CylinderGeometry(2.56, 2.56, 0.32, 48, 1, true).rotateX(PI / 2), solid('#FFFFFF', { map: T.hazardTexture(), side: THREE.DoubleSide }), [0, 0, 6.4]));
  engine.add(mesh(lathe([[1.5, 7.3], [1.62, 7.7], [1.85, 8.3], [2.1, 8.85], [2.15, 8.95], [2.0, 8.95], [1.75, 8.4], [1.45, 7.75], [1.35, 7.35]]), solid('#6E7689', { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }))); // bell
  for (let i = 0; i < 4; i++) {                                                                                             // radiators
    const a = i * PI / 2 + PI / 4, r = solid('#FFFFFF', { map: T.radiatorTexture(), metalness: 0.4, roughness: 0.35 });
    engine.add(mesh(geo.box(0.12, 1.2, 1.4, 0.04), r, [Math.cos(a) * 2.9, Math.sin(a) * 2.9, 6.4], [0, 0, a - PI / 2]));
  }
  for (let i = 0; i < 4; i++) { const a = i * PI / 2; engine.add(mesh(new THREE.ConeGeometry(0.16, 0.35, 10, 1, true), darkMetal, [Math.cos(a) * 2.45, Math.sin(a) * 2.45, 6.95], [PI / 2, 0, 0])); } // small thrusters
  const blades = new THREE.InstancedMesh(geo.box(0.08, 1.2, 0.2, 0.02), darkMetal, 18);
  { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; blades.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 7.42), q.setFromEuler(e.set(0, 0.5, a - PI / 2)), new THREE.Vector3(1, 1, 1))); } }
  engine.add(blades);
  engine.add(mesh(geo.cyl(0.35, 0.35, 0.4, 16), darkMetal, [0, 0, 7.35], [PI / 2, 0, 0]));                               // hub
  const coreMat = new THREE.MeshBasicMaterial({ color: '#3A2420' }), CORE_COLD = new THREE.Color('#3A2420'), CORE_HOT = new THREE.Color('#FFB066');
  engine.add(mesh(new THREE.CircleGeometry(1.5, 32), coreMat, [0, 0, 7.31]));                                             // inner glow
  const engineLight = mesh(geo.ball, basic('#FFFFFF'), [0, 2.55, 6.2], [0, 0, 0], 0.13); engine.add(engineLight); runningLights.push(engineLight);
  engine.position.set(0, -1.0, 0.45); engine.scale.set(0.85, 0.85, 1);  // centred on the hull, just behind it
  body.add(engine);
  const flameRoot = new THREE.Group(); flameRoot.position.set(0, -1.0, 9.4); flameRoot.scale.setScalar(2.9); body.add(flameRoot);
  const flame = new THREE.Group(); flameRoot.add(flame);
  const outer = mesh(new THREE.ConeGeometry(0.32, 1.4, 18, 1, true), new THREE.MeshBasicMaterial({ color: '#FF8A3D', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), [0, 0, 0.7], [PI / 2, 0, 0]);
  const innerFlame = mesh(new THREE.ConeGeometry(0.17, 0.85, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#FFF1C2', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), [0, 0, 0.42], [PI / 2, 0, 0]);
  const flameGlow = sprite('#FF9A4D', 1.8, 0.9); flameGlow.position.z = 0.2;
  flame.add(outer, innerFlame, flameGlow);

  // ---------- Interior (meters, scaled by S) ----------
  const inside = new THREE.Group(); inside.position.y = Y0; inside.scale.setScalar(S); body.add(inside);
  const nameDecalsUpdate = name => { const t = T.textTexture(name || 'Stashtronaut One', { color: '#2B3550', size: 74, stroke: '#F3EADB' }); for (const d of nameDecals) { d.material.map?.dispose(); d.material.map = t; d.material.needsUpdate = true; } };
  const interior = buildInterior(inside, { S, UP, LOW, CEIL, hwM, deckGeometry, hullMat, solid, basic, geo, mesh, makeBatch, sprite, T, goldMat,
    wins: { low: LOW_WINDOWS.map(z => z / S), up: UP_WINDOWS.map(z => z / S) } });
  const pilot = makePilot();
  inside.add(pilot.group);
  const crew = makeCrew({ pilot, layout: interior.layout, props: interior.props });


  // ---------- World-space things: the trail and the tow pod ----------
  const TRAIL = 700, trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3), trailAge = new Float32Array(TRAIL).fill(99);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: 3.2, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false;
  let trailNext = 0, trailLast = null;
  const towPod = makePod({ color: '#9C8FA6', label: 'Debt', metal });
  const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#AEB7C8', transparent: true, opacity: 0.7 }));
  tether.frustumCulled = false; towPod.group.visible = tether.visible = false;
  let podScale = 1, podReady = false;

  // ---------- Money in ----------
  function setMoney({ totalSaved = 0, goals = [], emergencyMonths = 0, hasEmergencyFund = false, debt = 0, debtPeak = 0, towPod: tow = false, shipName } = {}) {
    // Money shows inside: the savings jar, a progress frame per goal with trophies for finished ones, and the pantry
    // (how full it is shows the emergency fund). Nothing is drawn around the hull.
    interior.setGems(totalSaved);
    interior.setGoals(goals);
    interior.setPantry(emergencyMonths, hasEmergencyFund);

    towPod.group.visible = tether.visible = tow && debt > 0;
    podScale = 1.6 * (0.4 + 0.6 * Math.sqrt(Math.min(1, debt / Math.max(debt, debtPeak, 1))));
    towPod.group.scale.setScalar(podScale);
    if (shipName !== undefined) nameDecalsUpdate(shipName);
  }
  nameDecalsUpdate();

  // ---------- The cutaway: open (1) slides the near hull and roof away; closed (0) is a solid ship ----------
  let open = 0, openTarget = 0, cutSide = null;
  const center = new THREE.Vector3(), up = new THREE.Vector3(), toShip = new THREE.Vector3(), qBody = new THREE.Quaternion()
  const camW = new THREE.Vector3();
  function setView(camera) {
    body.updateMatrixWorld();
    center.setFromMatrixPosition(body.matrixWorld);
    up.set(0, 1, 0).applyQuaternion(body.getWorldQuaternion(qBody));
    if (cutSide) toShip.set(-cutSide, 0, 0).applyQuaternion(qBody);    // free camera: the cut stays on one side of the ship
    else { toShip.copy(center).sub(camera.getWorldPosition(camW)); toShip.addScaledVector(up, -toShip.dot(up)).normalize(); }
    const e = open * open * (3 - 2 * open);                        // smoothstep, so the panels ease in and out
    const sideCut = (1 - e) * 30, roofCut = ROOF_Y + (1 - e) * 30; // closed: far outside the ship (nose to engine), so nothing is clipped
    cutPlanes[0].setFromNormalAndCoplanarPoint(toShip, center.clone().addScaledVector(toShip, -sideCut));
    cutPlanes[1].setFromNormalAndCoplanarPoint(up.clone().negate(), center.clone().addScaledVector(up, roofCut));
  }

  // ---------- Every frame ----------
  let t = 0, flameLevel = 0, blinkT = 0;
  const tmp = new THREE.Vector3(), anchor = new THREE.Vector3(), tail = new THREE.Vector3();
  function update(dt, { thrust = 0, flying = false, cruising = false, stopped = true, turn = 0, turnVel = 0, accel = 0, speedFrac = 0, climb = 0, visible = true, reduced = false } = {}) {
    t += dt;
    open += (openTarget - open) * (reduced ? 1 : 1 - Math.exp(-dt * 3.5));
    if (Math.abs(openTarget - open) < 0.001) open = openTarget;
    flameLevel += (thrust - flameLevel) * (1 - Math.exp(-dt * (thrust > flameLevel ? 10 : 4)));
    flame.visible = flameLevel > 0.02;
    const flicker = reduced ? 1 : 1 + Math.sin(t * 37) * 0.06 + Math.sin(t * 23) * 0.05;
    flame.scale.set(0.8 + flameLevel * 0.2, 0.8 + flameLevel * 0.2, flameLevel * flicker);
    outer.material.opacity = 0.85 * Math.min(1, flameLevel * 1.5); innerFlame.material.opacity = Math.min(1, flameLevel * 1.5);
    flameGlow.material.opacity = 0.9 * flameLevel;
    coreMat.color.lerpColors(CORE_COLD, CORE_HOT, Math.min(1, flameLevel * 1.2));
    for (const g of outside.nacelleGlow) g.material.color.copy(coreMat.color);
    outside.updateGear(dt, { reduced });

    body.position.y = reduced ? 0 : Math.sin(t * 1.0) * 0.2 * (1 - speedFrac);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3);
    body.rotation.z += (turnVel * 0.3 - body.rotation.z) * k;
    body.rotation.x += (climb * 0.09 - Math.max(0, accel) * 0.002 - body.rotation.x) * k;   // nose up when climbing, down when descending

    blinkT += dt;
    runningLights.forEach((l, i) => { const on = reduced || ((blinkT + i * 0.4) % 2) < 1.4; l.visible = on || i === 2; });
    interior.update(dt, { reduced, visible });
    crew.update(dt, { flying, cruising, stopped, visible, reduced, turn, accel });

    root.updateMatrixWorld();
    tail.set(0, -1.0, 9.7).applyMatrix4(body.matrixWorld);
    if (flameLevel > 0.3 && !reduced) {
      const from = trailLast || tail, steps = Math.min(20, Math.max(1, Math.ceil(from.distanceTo(tail) / 0.7)));   // more points at speed, so the trail stays a line
      for (let i = 1; i <= steps; i++) {
        tmp.lerpVectors(from, tail, i / steps);
        trailPos.set([tmp.x, tmp.y, tmp.z], trailNext * 3); trailAge[trailNext] = (steps - i) / steps * dt;
        trailNext = (trailNext + 1) % TRAIL;
      }
      trailLast = (trailLast || new THREE.Vector3()).copy(tail);
    } else trailLast = null;
    for (let i = 0; i < TRAIL; i++) { trailAge[i] += dt; const a = Math.max(0, 1 - trailAge[i] / 1.3) ** 1.5 * 0.5; trailCol.set([a, 0.5 * a, 0.2 * a], i * 3); }
    trailGeo.attributes.position.needsUpdate = trailGeo.attributes.color.needsUpdate = true;

    if (towPod.group.visible) {
      anchor.set(0, -1.2, 12 + podScale).applyMatrix4(root.matrixWorld);
      if (!podReady || reduced) { towPod.group.position.copy(anchor); podReady = true; } else towPod.group.position.lerp(anchor, 1 - Math.exp(-dt * 3));
      towPod.group.quaternion.slerp(root.quaternion, 1 - Math.exp(-dt * 3));
      tmp.set(0, -1.2, 8.6).applyMatrix4(root.matrixWorld);
      tether.geometry.attributes.position.setXYZ(0, tmp.x, tmp.y, tmp.z);
      tether.geometry.attributes.position.setXYZ(1, towPod.group.position.x, towPod.group.position.y, towPod.group.position.z);
      tether.geometry.attributes.position.needsUpdate = true;
    }
  }

  // The trail and the tow pod live in render space; when the world is re-centred (space.js), shift them with it.
  function rebase(d) {
    for (let i = 0; i < TRAIL; i++) { trailPos[i * 3] -= d.x; trailPos[i * 3 + 1] -= d.y; trailPos[i * 3 + 2] -= d.z; }
    trailGeo.attributes.position.needsUpdate = true;
    if (trailLast) trailLast.sub(d);
    towPod.group.position.sub(d);
  }
  const headPos = new THREE.Vector3();
  return {
    root, body, pilot, crew, gear: outside, world: [trail, towPod.group, tether], radius: 9.5, setMoney, setView, update, rebase,
    clickables: interior.clickables, blockedPaths: interior.blocked, checkExterior: () => outside.check(), // the dashboard screen: clicking it opens the console
    // 0 = solid hull, 1 = fully open cutaway. Set the target; it eases there.
    get open() { return open; }, get openTarget() { return openTarget; }, setOpen(v) { openTarget = v ? 1 : 0; },
    // Free camera: keep the cutaway on one side of the ship (1 = +x, -1 = -x), or null to face the camera again.
    setCutSide(side) { cutSide = side; },
    // Landing gear. The legs stay in their wells in flight and while hovering; landing on a planet (Phase E) will call
    // setLandingGear(true) on final approach and setLandingGear(false) after take-off. For now the L key tests it.
    setLandingGear(down) { outside.setGearTarget(down); }, get landingGear() { return outside.gearTarget; },
    pilotHead(target = headPos) { pilot.head.updateMatrixWorld(); return pilot.head.getWorldPosition(target); },
    get flameLevel() { return flameLevel; },
    get atControls() { return crew.atControls; },
  };
}
const nameDecals = [];

// ---------- A soft glow for lights, steam and the trail ----------
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (glowTex = new THREE.CanvasTexture(c));
}
function sprite(color, size, opacity = 1, normal = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

// ---------- A goal pod: a streamlined cargo capsule with a nose cone, metal band, fill gauge, label plate and clamps ----------
const podShape = new THREE.LatheGeometry([[0, 0.78], [0.1, 0.74], [0.2, 0.64], [0.28, 0.5], [0.32, 0.36], [0.32, -0.42], [0.29, -0.58], [0.2, -0.7], [0.08, -0.76], [0, -0.77]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(-PI / 2);
const noseShape = new THREE.LatheGeometry([[0, 0.8], [0.11, 0.76], [0.21, 0.66], [0.29, 0.52], [0.33, 0.4], [0.33, 0.36]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(-PI / 2);
const labelCache = new Map();
function makePod({ color, label = '', progress = 0, done = false, side = 1, metal }) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 });
  g.add(mesh(podShape, paint));
  g.add(mesh(noseShape, solidCream()));
  g.add(mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.12, 24, 1, true).rotateX(PI / 2), done ? goldMat() : metal, [0, 0, 0.05]));
  for (const z of [-0.35, 0.42]) g.add(mesh(new THREE.TorusGeometry(0.335, 0.035, 8, 24), metal, [0, 0, z]));          // clamps
  for (const z of [-0.35, 0.42]) g.add(mesh(new RoundedBoxGeometry(0.1, 0.36, 0.1, 2, 0.03), metal, [-side * 0.12, 0.42, z], [0, 0, side * 0.3])); // struts up to the rail
  // Fill gauge: a dark slot on the outside, with a glowing bar that fills front-to-back with progress.
  const gauge = new THREE.Group();
  gauge.add(mesh(new RoundedBoxGeometry(0.05, 0.13, 0.66, 2, 0.02), new THREE.MeshStandardMaterial({ color: '#1E2638', roughness: 0.4 })));
  const fill = Math.max(0.02, Math.min(1, progress));
  gauge.add(mesh(new THREE.BoxGeometry(0.03, 0.09, 0.6 * fill), new THREE.MeshBasicMaterial({ color }), [side * 0.012, 0, 0.3 - 0.3 * fill]));
  gauge.position.set(side * 0.31, -0.02, -0.02); g.add(gauge);
  // Label plate with the goal's name.
  if (label) {
    if (!labelCache.has(label)) labelCache.set(label, T.textTexture(label, { w: 512, h: 128, bg: '#F3EADB', color: '#2B3550', size: 64 }));
    g.add(mesh(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshStandardMaterial({ map: labelCache.get(label), roughness: 0.6 }), [side * 0.325, 0.16, 0.1], [0, side * PI / 2, 0]));
  }
  if (done) g.add(mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 24), goldMat(), [0, 0, -0.15]));
  return { group: g };
}
let creamMat = null, gold = null;
const solidCream = () => creamMat || (creamMat = new THREE.MeshStandardMaterial({ color: '#F3EADB', roughness: 0.45 }));
const goldMat = () => gold || (gold = new THREE.MeshStandardMaterial({ color: '#FFC56B', metalness: 0.7, roughness: 0.3, emissive: '#FFB347', emissiveIntensity: 0.25 }));
