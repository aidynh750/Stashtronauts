// The inside of the ship, built in meters (the ship scales it into place).
// UPPER DECK: the bridge, up front under the canopy.
// LOWER DECK, front to back: living quarters (bunk room, bathroom, galley, lounge with a desk), science lab, suit and
// workshop room, airlock, storage room. Behind the bridge the lower rooms are double height, up to the roof.
// BOTTOM DECK (the belly): fuel and data only. Fuel tanks, pipes, pumps, valves, gauges, a glowing coolant line and a
// catwalk, plus rows of server racks that hold the ship's data.
// Floors stay clear: every item sits on a shelf, hook, rack, table, in a crate or in a locker. At most one rug per room.
// Two ladders (bridge to lower deck, lower deck to bottom deck) go through hatches; the crew climbs them rung by rung.
// Static props are merged per material; repeated small things are instanced.
import * as THREE from 'three';

const PI = Math.PI;
const IN = 3.4;              // inner side walls (x = ±IN)
const FACE = -IN + 0.06;     // the room-side face of the far inner wall
const WALK = 1.1;            // the walkway runs along here, through every doorway
const DOOR = [0.5, 1.7];     // doorway span in every cross wall (x)
const COCKPIT = -10.6;       // in front of this the bridge opens out to the canopy glass
const CTRL_END = -4.0;       // the bridge ends here; behind it the lower rooms are double height
const REAR = 12.6;           // rear bulkhead, in front of the engine
const SVC = -2.35;           // the bottom deck's floor, under the lower floor
// Rooms on the lower deck (z, meters).
const Z = { bunk: -9.2, bath: -6.8, lab: 1.2, suit: 4.8, airlock: 8.6, storage: 10.4 };
// Ladders: hole in the floor above [x0, x1, z0, z1]; the ladder stands on the hole's front edge and the climber faces -z.
const LADDERS = [
  { name: 'upper', hole: [2.0, 3.2, -5.75, -4.3], bottom: 0, top: 3.5 },
  { name: 'lower', hole: [2.0, 3.2, -3.6, -2.4], bottom: SVC, top: 0 },
];

export function buildInterior(inside, K) {
  const { UP, LOW, CEIL, hwM, deckGeometry, hullMat, solid, basic, geo, mesh, makeBatch, sprite, T, goldMat, wins } = K;
  const b = makeBatch(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), vv = new THREE.Vector3(), ss = new THREE.Vector3();
  const box = (w, h, d, r) => geo.box(w, h, d, r ?? Math.min(0.03, w / 4, h / 4, d / 4));
  const cyl = (r0, r1, h, seg = 16) => geo.cyl(r0, r1, h, seg);
  const sphere = new THREE.SphereGeometry(1, 16, 12), lowBall = new THREE.IcosahedronGeometry(1, 0);
  let rs = 1234567; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const yawTilt = (yaw, tilt = 0) => { const e = new THREE.Euler(tilt, yaw, 0, 'YXZ'); e.reorder('XYZ'); return [e.x, e.y, e.z]; };

  // ---------- Floor grid: what stands on each deck, so the walking paths can be checked (see blocked below) ----------
  const CELL = 0.25, GX0 = -4.75, GZ0 = -16.5, NX = 38, NZ = 122;
  const DECKS = { svc: SVC, low: LOW, up: UP };
  const grid = { svc: new Uint8Array(NX * NZ), low: new Uint8Array(NX * NZ), up: new Uint8Array(NX * NZ) };
  const deckOf = y => Object.keys(DECKS).find(k => y >= DECKS[k] - 0.15 && y < DECKS[k] + 1.15);
  const cellRange = (a0, a1, g0, n) => [Math.max(0, Math.floor((a0 - g0) / CELL)), Math.min(n - 1, Math.floor((a1 - g0) / CELL))];
  function mark(deck, x0, x1, z0, z1) {
    if (!deck) return;
    const [i0, i1] = cellRange(x0, x1, GX0, NX), [k0, k1] = cellRange(z0, z1, GZ0, NZ);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) grid[deck][k * NX + i] = 1;
  }
  const bb = new THREE.Box3();
  function cover(g, pos, rot, scale) {
    if (!g.boundingBox) g.computeBoundingBox();
    m4.compose(vv.set(...pos), qq.setFromEuler(ee.set(...rot)), typeof scale === 'number' ? ss.setScalar(scale) : ss.set(...scale));
    bb.copy(g.boundingBox).applyMatrix4(m4);
    const deck = deckOf(bb.min.y);
    if (deck && bb.max.y - bb.min.y > 0.05) mark(deck, bb.min.x, bb.max.x, bb.min.z, bb.max.z);
  }
  const put = (g, m, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) => { cover(g, pos, rot, scale); b.add(g, m, pos, rot, scale); };
  function inst(g, m, list) {
    const im = new THREE.InstancedMesh(g, m, Math.max(1, list.length));
    list.forEach((it, i) => {
      im.setMatrixAt(i, m4.compose(vv.set(...it.pos), qq.setFromEuler(ee.set(...(it.rot || [0, 0, 0]))), typeof it.scale === 'number' ? ss.setScalar(it.scale) : ss.set(...(it.scale || [1, 1, 1]))));
      if (it.color) im.setColorAt(i, new THREE.Color(it.color));
    });
    im.count = list.length; inside.add(im); return im;
  }
  const tube = (pts, r, m, seg = 40) => b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 8), m);

  // ---------- Materials ----------
  const wood = solid('#FFFFFF', { map: T.woodTexture('#C9A27A'), roughness: 0.7 });
  const darkWood = solid('#FFFFFF', { map: T.woodTexture('#8C6040'), roughness: 0.7 });
  const floorTex = T.woodTexture('#B98E66'); floorTex.repeat.set(0.25, 0.25);
  const floorMat = solid('#FFFFFF', { map: floorTex, roughness: 0.75 });
  const plateTex = T.metalTexture('#8FB0B6'); plateTex.repeat.set(0.6, 0.6); plateTex.wrapS = plateTex.wrapT = THREE.RepeatWrapping;
  const plate = solid('#FFFFFF', { map: plateTex, roughness: 0.6 });
  const wallTex = T.panelTexture('#E9E1D3'); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(0.8, 0.8);
  const wall = solid('#FFFFFF', { map: wallTex, roughness: 0.7, side: THREE.DoubleSide });
  const innerWall = hullMat('#FFFFFF', { map: T.panelTexture('#EDE6D8'), roughness: 0.7 }); // side walls open with the hull
  const sillMat = hullMat('#FFFFFF', { map: T.woodTexture('#8C6040'), roughness: 0.7 });
  const wallCut = hullMat('#FFFFFF', { map: wallTex, roughness: 0.7 }), steelCut = hullMat('#AEB7C8', { metalness: 0.55, roughness: 0.35 }); // so do the room walls
  const cream = solid('#FFF3DF'), white = solid('#FFFFFF', { roughness: 0.35 }), tile = solid('#FFFFFF', { map: T.tileTexture(), roughness: 0.3 });
  const steel = solid('#AEB7C8', { metalness: 0.55, roughness: 0.35 }), darkSteel = solid('#59627A', { metalness: 0.5, roughness: 0.45 });
  const dark = solid('#2B3550', { roughness: 0.6 }), panelDark = solid('#323B52', { roughness: 0.55 }), teal = solid('#3FA7B5'), coral = solid('#FF7A59'), mustard = solid('#F2B33D'), red = solid('#E05A4F');
  const tealFab = solid('#FFFFFF', { map: T.fabricTexture('#3FA7B5', '#4FB9C7'), roughness: 0.9 });
  const coralFab = solid('#FFFFFF', { map: T.fabricTexture('#F08A66', '#F59C7C'), roughness: 0.9 });
  const greyFab = solid('#FFFFFF', { map: T.fabricTexture('#8E97AA', '#9AA3B6'), roughness: 0.95 });
  const leaf = solid('#5BAF6A', { roughness: 0.8, flatShading: true }), leaf2 = solid('#3E8C5E', { roughness: 0.8, flatShading: true }), pot = solid('#C9744A');
  const counterTop = solid('#DCE3EC', { roughness: 0.3 });
  const glass = solid('#BFE9FF', { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const glow = c => basic(c), hazard = solid('#FFFFFF', { map: T.hazardTexture() });
  const grate = solid('#FFFFFF', { map: T.grateTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.4 });
  const crateMat = solid('#FFFFFF', { map: T.crateTexture(), roughness: 0.85 });
  const paint = solid('#FFFFFF', { roughness: 0.6 });
  // Bottom-deck machinery. The cutaway looks down into the near half of this deck (the far half is under the lower floor).
  const tankMat = solid('#D9D3C4', { metalness: 0.35, roughness: 0.45 }), rackMat = solid('#2A2F3A', { metalness: 0.3, roughness: 0.6 }), pipeMat = solid('#9AA3B2', { metalness: 0.6, roughness: 0.35 });

  // ---------- Floors, ceilings and walls ----------
  inside.add(new THREE.Mesh(deckGeometry(LOW, 0.3, LADDERS[1].hole, -12.7, REAR + 0.1), plate));
  inside.add(new THREE.Mesh(deckGeometry(UP, 0.5, LADDERS[0].hole, -Infinity, CTRL_END + 0.06), floorMat));
  inside.add(new THREE.Mesh(deckGeometry(CEIL + 0.12, 0.12, null, -13.0, REAR), hullMat('#E9E1D3'))); // opens with the hull
  inside.add(new THREE.Mesh(deckGeometry(SVC, 0.06, null, -11.9, 11.9), plate));
  // Inner side walls, in panels, with an opening and a short tunnel out to each porthole.
  function sideWall(s, h0, h1, z0, z1, winH, winZ) {
    const n = Math.max(1, Math.round((z1 - z0) / 1.2)), w = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const zc = z0 + (i + 0.5) * w;
      if (!winZ.some(q => Math.abs(q - zc) < w * 0.85)) { b.add(box(0.12, h1 - h0, w - 0.02, 0.03), innerWall, [s * IN, (h0 + h1) / 2, zc]); continue; }
      b.add(box(0.12, winH - 0.75 - h0, w - 0.02, 0.03), innerWall, [s * IN, (h0 + winH - 0.75) / 2, zc]);
      b.add(box(0.12, h1 - winH - 0.75, w - 0.02, 0.03), innerWall, [s * IN, (winH + 0.75 + h1) / 2, zc]);
    }
    mark(deckOf(h0), s * IN - 0.1, s * IN + 0.1, z0, z1);
    for (const q of winZ) if (q > z0 && q < z1) {
      const outer = hwM(winH, q) - 0.05, len = outer - IN, xc = s * (IN + len / 2);
      for (const dh of [-0.68, 0.68]) b.add(box(len, 0.06, 1.42, 0.01), innerWall, [xc, winH + dh, q]);
      for (const dz of [-0.68, 0.68]) b.add(box(len, 1.42, 0.06, 0.01), innerWall, [xc, winH, q + dz]);
      b.add(box(0.14, 0.08, 1.5, 0.02), sillMat, [s * (IN + 0.03), winH - 0.72, q]);
    }
  }
  for (const s of [-1, 1]) {
    sideWall(s, LOW, 3.0, -12.6, CTRL_END, 1.6, wins.low);
    if (s > 0) sideWall(s, LOW, CEIL, CTRL_END, REAR, 1.6, wins.low);
    else { sideWall(s, LOW, CEIL, CTRL_END, Z.airlock, 1.6, wins.low); sideWall(s, 3.0, CEIL, Z.airlock, Z.storage, 5, []); sideWall(s, LOW, CEIL, Z.storage, REAR, 1.6, []); }
    sideWall(s, UP, CEIL, COCKPIT, CTRL_END, 5.1, wins.up);
    b.add(box(0.2, CEIL - UP, 0.2, 0.04), steel, [s * IN, (UP + CEIL) / 2, COCKPIT]);
  }
  function crossWall(z, h0, h1, { door = true, x0 = -Infinity, x1 = Infinity, m = wallCut } = {}) {
    const pts = [], hw = h => Math.max(0.2, hwM(h, z) - 0.12);
    const L = h => Math.max(-hw(h), x0), R = h => Math.min(hw(h), x1);
    pts.push(new THREE.Vector2(L(h0), h0));
    if (door) pts.push(new THREE.Vector2(DOOR[0], h0), new THREE.Vector2(DOOR[0], h0 + 2.15), new THREE.Vector2(DOOR[1], h0 + 2.15), new THREE.Vector2(DOOR[1], h0));
    for (let h = h0; h <= h1 + 1e-6; h += (h1 - h0) / 12) pts.push(new THREE.Vector2(R(h), h));
    for (let h = h1; h >= h0 - 1e-6; h -= (h1 - h0) / 12) pts.push(new THREE.Vector2(L(h), h));
    b.add(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.12, bevelEnabled: false }), m, [0, 0, z - 0.06]);
    const deck = deckOf(h0);
    if (deck) { mark(deck, Math.max(-5, L(h0)), door ? DOOR[0] : Math.min(5, R(h0)), z - 0.1, z + 0.1); if (door) mark(deck, DOOR[1], Math.min(5, R(h0)), z - 0.1, z + 0.1); }
    if (door) {
      for (const x of DOOR) b.add(box(0.12, 2.25, 0.2, 0.03), steelCut, [x, h0 + 1.12, z]);
      b.add(box(DOOR[1] - DOOR[0] + 0.24, 0.12, 0.2, 0.03), steelCut, [(DOOR[0] + DOOR[1]) / 2, h0 + 2.2, z]);
    }
  }
  crossWall(-12.6, LOW, 3.0, { door: false });
  crossWall(-13.0, CEIL, 7.7, { door: false, m: innerWall });
  crossWall(Z.bunk, LOW, 3.0);
  crossWall(Z.bath, LOW, 3.0);
  crossWall(CTRL_END, UP, CEIL, { door: false });
  crossWall(Z.lab, LOW, CEIL);
  crossWall(Z.suit, LOW, CEIL);
  crossWall(Z.storage, LOW, CEIL);
  crossWall(REAR, LOW, 7.2, { door: false, m: solid('#D9D2C3', { side: THREE.DoubleSide }) });
  crossWall(-11.9, SVC, -0.3, { door: false, m: plate });
  crossWall(11.9, SVC, -0.3, { door: false, m: plate });
  b.add(box(7.0, 0.5, 0.2, 0.04), steel, [0, 3.25, CTRL_END + 0.05]);                 // the edge of the bridge deck, seen from the tall rooms

  // ---------- Lights ----------
  for (const [h, z, k] of [[2.7, -10, 6], [2.7, -6, 6], [5.0, -0.5, 9], [5.0, 4.5, 9], [5.0, 10.5, 8], [6.1, -11, 6], [6.1, -7, 6], [-0.7, -6, 3], [-0.7, 5, 3]]) {
    const l = new THREE.PointLight('#FFE2B8', k, 8, 1.4); l.position.set(0, h, z); inside.add(l);
  }
  for (const z of [-11, -8, -5.2]) b.add(cyl(0.2, 0.24, 0.05, 16), glow('#FFE9C2'), [0, 2.97, z]);
  for (const z of [-11.5, -8.5, -5.5, -1, 3, 7, 11.5]) b.add(cyl(0.22, 0.26, 0.05, 16), hullMat('#FFE9C2', { emissive: '#FFE9C2', emissiveIntensity: 1 }), [0, CEIL, z]);
  for (const z of [-9, -2, 5, 10]) b.add(box(1.2, 0.04, 0.08, 0.01), glow('#FFE2B0'), [0, -0.33, z]);                // strip lights on the bottom deck
  for (const [h, z0, z1] of [[2.78, -12.4, CTRL_END], [6.28, -12.8, REAR - 0.2]]) {
    for (const [dx, r, m] of [[0.12, 0.07, steel], [0.34, 0.05, coral], [0.52, 0.04, darkSteel], [0.68, 0.025, dark]]) b.add(cyl(r, r, z1 - z0, 8), m, [-IN + dx, h, (z0 + z1) / 2], [PI / 2, 0, 0]);
    for (let z = z0 + 0.5; z < z1; z += 2.0) b.add(box(0.75, 0.04, 0.08, 0.01), dark, [-IN + 0.4, h - 0.1, z]);
  }
  const labels = [];
  const label = (text, x, h, z, ry, w = 0.5, bg = '#F5C542') => labels.push([text, x, h, z, ry, w, bg]);
  const posterTex = new Map(), posterOf = kind => posterTex.get(kind) || (posterTex.set(kind, T.posterTexture(kind)), posterTex.get(kind));
  function poster(x, y, z, kind, ry, scale = 0.6, tilt = 0) {
    const o = Math.sin(ry), c = Math.cos(ry);
    b.add(box(0.05, 1.25 * scale, 1.0 * scale, 0.015), darkWood, [x + o * 0.02, y, z + c * 0.02], [tilt, ry - PI / 2, 0]);
    b.add(new THREE.PlaneGeometry(0.86 * scale, 1.12 * scale), solid('#FFFFFF', { map: posterOf(kind) }), [x + o * 0.05, y, z + c * 0.05], [0, ry, tilt]);
  }
  const rug = (x, z, w, d, a, bcol, ccol, y = LOW) => b.add(new THREE.PlaneGeometry(w, d), solid('#FFFFFF', { map: T.rugTexture(a, bcol, ccol) }), [x, y + 0.006, z], [-PI / 2, 0, 0]);
  // Shelf contents: rows of small boxes, jars and books standing on a shelf at height h. Along z at x, or along x at z.
  const shelfStuff = [];
  function stock(at, h, p0, p1, depth = 0.25, kinds = ['box', 'jar', 'book'], alongZ = true) {
    for (let p = p0 + 0.04; p < p1 - 0.06;) {
      const kind = pick(kinds), w = kind === 'book' ? 0.03 + rnd() * 0.02 : 0.08 + rnd() * 0.1, hh = kind === 'book' ? 0.2 + rnd() * 0.08 : kind === 'jar' ? 0.12 + rnd() * 0.06 : 0.08 + rnd() * 0.16;
      const pos = alongZ ? [at + (rnd() - 0.5) * 0.04, h + hh / 2, p + w / 2] : [p + w / 2, h + hh / 2, at + (rnd() - 0.5) * 0.04];
      shelfStuff.push({ pos, scale: alongZ ? [depth * (0.6 + rnd() * 0.3), hh, w] : [w, hh, depth * (0.6 + rnd() * 0.3)], color: kind === 'book' ? pick(['#3FA7B5', '#FF7A59', '#F2B33D', '#7FA7B0', '#9C8BE0', '#2B3550', '#5BAF6A']) : kind === 'jar' ? pick(['#E9876B', '#F2B33D', '#C9A27A', '#7FE0C2']) : pick(['#C9A06A', '#B98E66', '#D2AE7A', '#AEB7C8']) });
      p += w + 0.01;
    }
  }

  // ================= UPPER DECK: THE BRIDGE =================
  // A wide curved console around the seats, with screens on its raised back and controls packed across its top.
  const AC = new THREE.Vector3(0, UP, -11.35), R0 = 1.25, R1 = 2.05, SEGS = 13, A0 = -1.38, A1 = 1.38;
  const at = (theta, r, h) => new THREE.Vector3(AC.x + Math.sin(theta) * r, h, AC.z - Math.cos(theta) * r);
  const switches = [], buttons = [], sliders = [], dials = [], keypad = [], lamps = [];
  const local = (theta, tilt, r, h, dx, dz) => { // a point on the sloped console top: dx across, dz towards the back
    const o = new THREE.Object3D(); o.position.copy(at(theta, r, h)); o.rotation.set(tilt, -theta, 0, 'YXZ'); o.updateMatrix();
    return new THREE.Vector3(dx, 0, -dz).applyMatrix4(o.matrix);
  };
  for (let i = 0; i < SEGS; i++) {
    const th = A0 + (A1 - A0) * (i + 0.5) / SEGS, w = (R0 + R1) / 2 * (A1 - A0) / SEGS + 0.02;
    put(box(w, 0.84, R1 - R0, 0.05), dark, at(th, (R0 + R1) / 2, UP + 0.42).toArray(), yawTilt(-th));
    b.add(box(w, 0.05, R1 - R0 - 0.05, 0.02), panelDark, at(th, (R0 + R1) / 2 - 0.05, UP + 0.88).toArray(), yawTilt(-th, 0.32));
    b.add(box(w, 0.03, 0.06, 0.01), steel, at(th, R0 + 0.01, UP + 0.84).toArray(), yawTilt(-th));
    const tilt = 0.32, r = (R0 + R1) / 2 - 0.05, h = UP + 0.91, cols = 4;
    for (let k = 0; k < cols * 2; k++) { const p = local(th, tilt, r, h, -w / 2 + 0.06 + (k % cols) * (w - 0.12) / (cols - 1), -0.28 + Math.floor(k / cols) * 0.09); switches.push({ pos: p.toArray(), rot: yawTilt(-th, tilt + (k % 3 ? 0.35 : -0.35)), color: pick(['#E8E2D4', '#E8E2D4', '#FF7A59', '#7FE0C2']) }); }
    for (let k = 0; k < 6; k++) { const p = local(th, tilt, r, h, -w / 2 + 0.05 + (k % 3) * (w - 0.1) / 2, -0.08 + Math.floor(k / 3) * 0.07); buttons.push({ pos: p.toArray(), rot: yawTilt(-th, tilt), color: pick(['#E05A4F', '#F2B33D', '#3FA7B5', '#E8E2D4', '#7FE0C2']) }); }
    if (i % 3 === 0) for (let k = 0; k < 4; k++) { const p = local(th, tilt, r, h, -w / 2 + 0.06 + k * (w - 0.12) / 3, 0.1 + (k % 2) * 0.04); sliders.push({ pos: p.toArray(), rot: yawTilt(-th, tilt), color: pick(['#7FE0C2', '#FFC56B', '#FF9DAE']) }); }
    if (i % 3 === 1) dials.push({ pos: local(th, tilt, r, h, 0, 0.12).toArray(), rot: yawTilt(-th, tilt) });
    if (i % 3 === 2) for (let k = 0; k < 12; k++) keypad.push({ pos: local(th, tilt, r, h, -0.06 + (k % 3) * 0.06, 0.06 + Math.floor(k / 3) * 0.045).toArray(), rot: yawTilt(-th, tilt), color: k === 11 ? '#7FE0C2' : '#C9CFD8' });
    for (let k = 0; k < 3; k++) lamps.push({ pos: local(th, tilt, r, h, -w / 2 + 0.08 + k * (w - 0.16) / 2, -0.36).toArray(), color: pick(['#7FE0C2', '#FFC56B', '#83CBEE', '#FF9DAE']) });
    b.add(box(w, 0.3, 0.14, 0.03), dark, at(th, R1 - 0.05, UP + 1.0).toArray(), yawTilt(-th));                       // the raised back
  }
  mark('up', -2.2, 2.2, -13.5, -11.9);
  // Side consoles beside both seats.
  for (const s of [-1, 1]) {
    const x = s * 1.75, z = -11.15;
    put(box(0.5, 0.8, 1.1, 0.05), dark, [x, UP + 0.4, z]);
    b.add(box(0.48, 0.05, 1.05, 0.02), panelDark, [x, UP + 0.83, z], [0, 0, s * 0.25]);
    for (let i = 0; i < 8; i++) switches.push({ pos: [x + (i % 2 - 0.5) * 0.18, UP + 0.88, z + 0.12 + Math.floor(i / 2) * 0.08], rot: [0.35, 0, 0], color: '#E8E2D4' });
    b.add(box(0.06, 0.04, 0.16, 0.02), steel, [x, UP + 0.88, z + 0.42]);
  }
  inst(box(0.022, 0.05, 0.022, 0.007), paint, switches);
  inst(cyl(0.016, 0.016, 0.018, 10), paint, buttons);
  inst(box(0.05, 0.025, 0.04, 0.01), paint, sliders);
  inst(cyl(0.05, 0.05, 0.02, 18), solid('#F5F1E8'), dials);
  inst(box(0.04, 0.012, 0.035, 0.008), paint, keypad);
  const lampMesh = inst(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85 }), lamps);
  // The nose console fills the floor out to the glass.
  for (let z = -13.4; z > -16.5; z -= 0.3) {
    let hgt = 0.8; while (hgt > 0.2 && hwM(UP + hgt + 0.05, z - 0.3) < 0.6) hgt -= 0.1;
    const w = Math.min(hwM(UP + 0.02, z - 0.3), hwM(UP + hgt + 0.05, z - 0.3)) - 0.15; if (w < 0.4) break;
    b.add(box(2 * w, hgt, 0.32, 0.04), dark, [0, UP + hgt / 2, z - 0.15]);
    b.add(box(2 * w - 0.1, 0.05, 0.3, 0.02), solid('#3A4560'), [0, UP + hgt + 0.02, z - 0.15]);
  }
  mark('up', -4, 4, -16.5, -13.3);
  // Screens of different sizes on the raised back: camera feed, engine graphs, navigation, the budget chart in the
  // middle (clicking it opens the console), radar, systems, and power.
  const screensTex = { nav: T.navMapTexture(), radar: T.radarTexture(), engine: T.screenTexture({ title: 'ENGINE', color: '#FFC56B' }), systems: T.systemsTexture(), camera: T.cameraFeedTexture(), budget: T.screenTexture({ title: 'BUDGET', color: '#7FE0C2' }), power: T.screenTexture({ title: 'POWER', color: '#FF9DAE' }) };
  const screens = {};
  for (const [name, th, w, h, y] of [['camera', -1.05, 0.42, 0.28, 1.36], ['engine', -0.62, 0.5, 0.32, 1.38], ['nav', -0.28, 0.66, 0.42, 1.42], ['budget', 0.05, 0.8, 0.48, 1.45], ['radar', 0.42, 0.5, 0.4, 1.42], ['systems', 0.78, 0.52, 0.36, 1.38], ['power', 1.12, 0.36, 0.24, 1.34]]) {
    const p = at(th, R1 - 0.05, UP + y);
    b.add(box(w + 0.05, h + 0.05, 0.05, 0.02), dark, p.clone().add(new THREE.Vector3(Math.sin(th), 0, -Math.cos(th)).multiplyScalar(0.03)).toArray(), yawTilt(-th, -0.15));
    b.add(box(0.04, y - 1.1, 0.04, 0.01), darkSteel, at(th, R1 - 0.02, UP + 1.1 + (y - 1.1) / 2 - 0.1).toArray());
    const sc = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: screensTex[name].texture, color: '#DDDDDD' }), p.toArray(), yawTilt(-th, -0.15));
    inside.add(sc); screens[name] = sc;
  }
  for (const s of [-1, 1]) b.add(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshBasicMaterial({ map: (s < 0 ? screensTex.systems : screensTex.radar).texture, color: '#CCCCCC' }), [s * 1.75, UP + 0.865, -11.35], [-PI / 2, 0, s * 0.25]);
  // Seats with harnesses, the pilot's yoke and the co-pilot's stick.
  for (const [x, main] of [[-0.55, true], [0.62, false]]) {
    const z = -11.55;
    put(cyl(0.12, 0.16, 0.3, 10), darkSteel, [x, UP + 0.15, z]);
    b.add(box(0.6, 0.12, 0.58, 0.06), dark, [x, UP + 0.33, z]);
    b.add(box(0.62, 0.1, 0.6, 0.05), main ? tealFab : greyFab, [x, UP + 0.43, z]);
    b.add(box(0.6, 0.95, 0.14, 0.07), main ? tealFab : greyFab, [x, UP + 0.95, z + 0.34], [-0.1, 0, 0]);
    b.add(box(0.34, 0.22, 0.14, 0.06), main ? tealFab : greyFab, [x, UP + 1.55, z + 0.38], [-0.1, 0, 0]);
    for (const s of [-1, 1]) {
      b.add(box(0.07, 0.06, 0.5, 0.02), dark, [x + s * 0.34, UP + 0.64, z]);
      b.add(box(0.035, 0.5, 0.012, 0.005), solid('#E59A2E'), [x + s * 0.08, UP + 0.86, main ? z - 0.16 : z + 0.26], [0.05, 0, s * 0.3]);
    }
    mark('up', x - 0.33, x + 0.33, z - 0.3, z + 0.45);
  }
  b.add(cyl(0.035, 0.045, 0.45, 8), steel, [-0.55, UP + 0.6, -12.1], [0.4, 0, 0]);
  b.add(new THREE.TorusGeometry(0.15, 0.028, 8, 18, PI), dark, [-0.55, UP + 0.84, -12.03], [0.4, 0, PI]);
  b.add(cyl(0.04, 0.05, 0.28, 8), steel, [0.62, UP + 0.55, -12.1], [0.3, 0, 0]); b.add(sphere, dark, [0.62, UP + 0.72, -12.14], [0, 0, 0], 0.045);
  // Overhead panel packed with switches and lamps.
  b.add(box(2.2, 0.16, 0.9, 0.05), dark, [0, CEIL - 0.55, -11.7]);
  for (const x of [-1.0, 1.0]) b.add(cyl(0.03, 0.03, 0.45, 6), steel, [x, CEIL - 0.25, -11.7]);
  const over = [];
  for (let i = 0; i < 80; i++) over.push({ pos: [-0.98 + (i % 20) * 0.103, CEIL - 0.64, -12.05 + Math.floor(i / 20) * 0.22], rot: [PI + (i % 3 ? 0.4 : -0.4), 0, 0], color: i % 7 === 0 ? '#FF7A59' : '#E8E2D4' });
  inst(box(0.02, 0.05, 0.02, 0.006), paint, over);
  const overLamps = []; for (let i = 0; i < 20; i++) overLamps.push({ pos: [-0.98 + i * 0.103, CEIL - 0.64, -11.35], color: pick(['#7FE0C2', '#FFC56B', '#83CBEE']) });
  const overLampMesh = inst(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85 }), overLamps);
  // Equipment racks, the navigation table with a hologram, the comms station, lockers, a near-side cabinet.
  const leds = [];
  for (const z of [-10.1, -9.5, -8.9]) {
    put(box(0.6, 2.2, 0.58, 0.03), darkSteel, [-IN + 0.36, UP + 1.1, z]);
    for (let r = 0; r < 8; r++) { b.add(box(0.02, 0.18, 0.5, 0.005), dark, [-IN + 0.67, UP + 0.3 + r * 0.24, z]); for (let i = 0; i < 4; i++) leds.push({ pos: [-IN + 0.685, UP + 0.33 + r * 0.24, z - 0.18 + i * 0.07], color: ['#7FE0C2', '#FFC56B', '#7FE0C2', '#FF9DAE'][(r + i) % 4] }); }
  }
  const ledMesh = inst(new THREE.BoxGeometry(0.01, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.8 }), leds);
  put(box(2.0, 0.85, 1.2, 0.06), dark, [-1.75, UP + 0.43, -7.6]);
  b.add(box(2.05, 0.06, 1.25, 0.03), steel, [-1.75, UP + 0.88, -7.6]);
  inside.add(mesh(new THREE.PlaneGeometry(1.85, 1.08), new THREE.MeshBasicMaterial({ map: screensTex.nav.texture, color: '#CCCCCC' }), [-1.75, UP + 0.915, -7.6], [-PI / 2, 0, 0]));
  const holo = mesh(new THREE.TorusGeometry(0.28, 0.008, 6, 40), new THREE.MeshBasicMaterial({ color: '#7FE0C2', transparent: true, opacity: 0.55 }), [-1.75, UP + 1.25, -7.6], [PI / 2, 0, 0]);
  const holoPlanet = mesh(sphere, new THREE.MeshBasicMaterial({ color: '#7FE0C2', transparent: true, opacity: 0.3, wireframe: true }), [-1.75, UP + 1.25, -7.6], [0, 0, 0], 0.13);
  inside.add(holo, holoPlanet);
  put(box(0.75, 0.75, 1.55, 0.04), darkWood, [-IN + 0.43, UP + 0.375, -5.42]);
  b.add(box(0.5, 0.25, 0.6, 0.03), darkSteel, [-IN + 0.33, UP + 0.88, -5.8]); b.add(box(0.45, 0.2, 0.5, 0.03), steel, [-IN + 0.33, UP + 1.1, -5.8]);
  for (const z of [-5.95, -5.65]) b.add(cyl(0.035, 0.035, 0.03, 12), solid('#F5F1E8'), [-IN + 0.6, UP + 0.88, z], [0, 0, PI / 2]);
  b.add(box(0.06, 0.38, 0.56, 0.02), dark, [-IN + 0.1, UP + 1.3, -5.05]);
  inside.add(mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ map: screensTex.power.texture, color: '#CCCCCC' }), [-IN + 0.14, UP + 1.3, -5.05], [0, PI / 2, 0]));
  b.add(cyl(0.012, 0.012, 0.25, 6), steel, [-IN + 0.6, UP + 0.87, -5.0], [0, 0, 0.3]); b.add(sphere, dark, [-IN + 0.64, UP + 1.0, -5.0], [0, 0, 0], 0.03);
  chair(-IN + 1.3, -5.42, PI / 2, false, UP);
  b.add(box(0.04, 0.04, 0.12, 0.01), steel, [FACE + 0.02, UP + 1.55, -6.6]);
  b.add(new THREE.TorusGeometry(0.1, 0.012, 6, 16, PI), dark, [FACE + 0.08, UP + 1.47, -6.6], [0, PI / 2, PI]);
  for (const s of [-1, 1]) b.add(cyl(0.04, 0.04, 0.03, 12), coral, [FACE + 0.08, UP + 1.38, -6.6 + s * 0.1], [PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) { const x = -3.0 + i * 0.6; put(box(0.55, 2.0, 0.5, 0.03), teal, [x, UP + 1.0, CTRL_END - 0.31]); b.add(box(0.05, 0.25, 0.02, 0.01), steel, [x + 0.15, UP + 1.1, CTRL_END - 0.57]); }
  put(box(0.55, 0.9, 2.2, 0.04), solid('#8E97AA'), [IN - 0.33, UP + 0.45, -8.4]);
  b.add(cyl(0.08, 0.08, 0.45, 12), red, [IN - 0.25, UP + 1.13, -9.2]); b.add(box(0.3, 0.22, 0.25, 0.04), white, [IN - 0.3, UP + 1.01, -8.4]); b.add(box(0.06, 0.16, 0.02, 0.01), red, [IN - 0.44, UP + 1.01, -8.4]);
  poster(-0.7, UP + 1.6, CTRL_END - 0.07, 'map', PI);
  label('CAUTION: HOT', FACE, UP + 2.4, -9.5, PI / 2); label('FLIGHT DECK', FACE, UP + 2.45, -6.9, PI / 2, 0.7); label('MIND THE HATCH', 2.6, UP + 1.25, -4.33, PI, 0.55);
  label('NO SMOKING', -2.3, UP + 1.95, CTRL_END - 0.08, PI, 0.45); label('O2 VALVE', FACE, UP + 1.0, -10.3, PI / 2, 0.35, '#E8E2D2');
  rug(0.05, -9.0, 1.6, 2.4, '#5E6A7A', '#4A5566', '#F2B33D', UP);

  // ================= LADDERS AND HATCHES =================
  const ladderInfo = LADDERS.map(L => {
    const [hx0, hx1, hz0, hz1] = L.hole, H = L.top - L.bottom, n = Math.round(H / 0.3), sp = H / n, x = (hx0 + hx1) / 2, zl = hz0 + 0.05;
    for (const rx of [x - 0.35, x + 0.35]) b.add(cyl(0.028, 0.028, H + 1.1, 8), steel, [rx, L.bottom + (H + 1.1) / 2, zl]);
    for (let k = 1; k <= n; k++) b.add(cyl(0.02, 0.02, 0.7, 6), steel, [x, L.bottom + k * sp, zl], [0, 0, PI / 2]);
    b.add(new THREE.TorusGeometry(0.35, 0.028, 6, 12, PI), steel, [x, L.top + 1.1, zl]);
    // A hatch frame around the hole, the hatch lid swung up against the back railing, and railings on three sides.
    b.add(box(hx1 - hx0 + 0.1, 0.06, 0.05, 0.01), hazard, [x, L.top + 0.005, hz0 - 0.02]);
    for (const [px, pz, w, d] of [[hx0, (hz0 + hz1) / 2, 0.05, hz1 - hz0], [hx1, (hz0 + hz1) / 2, 0.05, hz1 - hz0], [x, hz1, hx1 - hx0, 0.05]]) {
      b.add(box(w, 0.05, d, 0.02), mustard, [px, L.top + 1.0, pz]); b.add(box(w, 0.05, d, 0.02), mustard, [px, L.top + 0.5, pz]);
    }
    for (const [px, pz] of [[hx0, hz1], [hx1, hz1], [hx0, hz0], [hx1, hz0]]) b.add(cyl(0.025, 0.025, 1.0, 8), steel, [px, L.top + 0.5, pz]);
    b.add(box(hx1 - hx0 - 0.1, 0.6, 0.04, 0.02), darkSteel, [x, L.top + 0.33, hz1 + 0.06]);
    mark(deckOf(L.top), hx0 - 0.05, hx1 + 0.05, hz0, hz1 + 0.1);
    return { name: L.name, x, zFace: zl, bottom: L.bottom, top: L.top, rung: sp, rungs: n };
  });

  // ================= LOWER DECK: LIVING QUARTERS =================
  // ----- Bunk room: bed, locker (a duffel bag on top), bedside table with lamp and clock, a clothes rail with a shoe shelf, shelves -----
  put(box(2.1, 0.4, 1.0, 0.05), darkWood, [-2.35, 0.2, -11.0]);
  b.add(box(2.0, 0.2, 0.92, 0.08), cream, [-2.35, 0.5, -11.0]);
  b.add(box(1.35, 0.07, 0.96, 0.03), tealFab, [-1.8, 0.63, -11.0]); b.add(box(0.14, 0.1, 0.98, 0.04), tealFab, [-2.47, 0.66, -11.0]);
  b.add(box(0.5, 0.15, 0.68, 0.07), white, [-3.0, 0.68, -11.0]);
  b.add(box(0.1, 0.95, 1.0, 0.04), darkWood, [-3.35, 0.65, -11.0]);
  put(box(0.6, 2.0, 0.6, 0.04), teal, [-3.0, 1.0, -12.2]); for (const s of [-1, 1]) b.add(box(0.27, 1.8, 0.02, 0.01), solid('#4FB9C7'), [-3.0 + s * 0.15, 1.0, -11.89]);
  b.add(box(0.5, 0.3, 0.38, 0.06), solid('#6B4A33'), [-3.0, 2.15, -12.2]); b.add(box(0.2, 0.05, 0.04, 0.02), dark, [-3.0, 2.32, -12.2]);
  put(box(0.45, 0.45, 0.45, 0.04), wood, [-3.05, 0.225, -10.05]); b.add(cyl(0.07, 0.09, 0.05, 12), dark, [-3.05, 0.47, -10.05]);
  b.add(cyl(0.015, 0.015, 0.28, 6), steel, [-3.05, 0.63, -10.05]); b.add(cyl(0.09, 0.16, 0.16, 12), glow('#FFD9A0'), [-3.05, 0.83, -10.05]);
  b.add(box(0.1, 0.08, 0.14, 0.02), solid('#9C8BE0'), [-2.92, 0.49, -9.92], [0, 0.5, 0]);
  b.add(cyl(0.025, 0.025, 1.5, 8), steel, [-1.6, 1.75, -9.55], [0, 0, PI / 2]);
  for (const x of [-2.3, -0.9]) put(cyl(0.02, 0.02, 1.75, 6), steel, [x, 0.875, -9.55]);
  put(box(1.5, 0.04, 0.4, 0.01), steel, [-1.6, 0.25, -9.55]);
  for (let i = 0; i < 2; i++) for (const s of [-1, 1]) b.add(box(0.09, 0.08, 0.24, 0.03), solid(i ? '#6B4A33' : '#3A3F4A'), [-2.0 + i * 0.5 + s * 0.06, 0.31, -9.55]);
  ['#E9A93A', '#3FA7B5', '#F3EADB', '#9C8BE0'].forEach((c, i) => {
    const x = -2.1 + i * 0.35;
    b.add(new THREE.TorusGeometry(0.1, 0.008, 4, 12, PI), steel, [x, 1.67, -9.55], [0, PI / 2, 0]);
    b.add(box(0.1, 0.62, 0.38, 0.04), solid(c), [x, 1.32, -9.55]);
    b.add(box(0.1, 0.2, 0.12, 0.03), solid(c), [x, 1.48, -9.77], [0.4, 0, 0]); b.add(box(0.1, 0.2, 0.12, 0.03), solid(c), [x, 1.48, -9.33], [-0.4, 0, 0]);
  });
  rug(-0.7, -11.0, 1.8, 1.2, '#3FA7B5', '#FFF3DF', '#F2B33D');
  b.add(box(0.3, 0.035, 1.6, 0.01), wood, [-3.2, 1.95, -11.0]); stock(-3.2, 1.97, -11.75, -10.25, 0.25, ['book', 'book', 'box']);
  b.add(box(1.3, 0.035, 0.3, 0.01), wood, [-0.3, 1.85, -12.4]); stock(-12.4, 1.87, -0.9, 0.3, 0.25, ['jar', 'box', 'book'], false);
  poster(-1.4, 1.6, -9.26, 'planet', PI); poster(FACE, 1.7, -10.0, 'photo', PI / 2, 0.42);

  // ----- Bathroom: shower, toilet cubicle, sink with mirror, towel rail, shelf -----
  b.add(box(1.2, 0.08, 1.2, 0.03), tile, [-2.75, 0.04, -8.5]);
  b.add(box(0.06, 2.3, 1.2, 0.02), tile, [-3.32, 1.15, -8.5]);
  b.add(box(1.2, 2.3, 0.04, 0.01), glass, [-2.75, 1.15, -7.88]);
  b.add(cyl(0.012, 0.012, 1.2, 6), steel, [-2.15, 2.2, -8.5], [PI / 2, 0, 0]);
  b.add(box(0.03, 1.8, 0.4, 0.01), solid('#F3EADB', { side: THREE.DoubleSide }), [-2.17, 1.3, -8.95]);
  b.add(cyl(0.012, 0.012, 0.5, 6), steel, [-3.2, 1.95, -8.5], [0, 0, 0.3]); b.add(cyl(0.08, 0.1, 0.04, 14), steel, [-3.05, 2.13, -8.5], [0, 0, -0.5]);
  b.add(box(0.08, 0.04, 0.3, 0.01), steel, [-3.25, 1.2, -8.2]); for (const [z, c] of [[-8.28, '#7FE0C2'], [-8.12, '#FF9DAE']]) b.add(cyl(0.03, 0.03, 0.12, 8), solid(c), [-3.22, 1.28, z]);
  mark('low', -3.4, -2.1, -9.15, -7.85);
  put(box(1.2, 2.0, 0.06, 0.02), white, [-2.75, 1.0, -7.75]);
  put(box(0.05, 1.9, 0.72, 0.02), solid('#E8DCC8'), [-2.0, 0.95, -7.05], [0, 0.55, 0]);
  put(new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.22, 0.2], [0.24, 0.4], [0.2, 0.42], [0, 0.42]].map(([x, y]) => new THREE.Vector2(x, y)), 18), white, [-2.95, 0, -7.3], [0, 0, 0], [1, 1, 1.25]);
  b.add(box(0.18, 0.4, 0.42, 0.04), white, [-3.24, 0.62, -7.3]); b.add(box(0.4, 0.04, 0.5, 0.02), white, [-2.95, 0.44, -7.3]);
  b.add(box(0.25, 0.03, 0.9, 0.01), wood, [-3.25, 1.75, -7.3]); stock(-3.25, 1.77, -7.7, -6.9, 0.2, ['jar', 'box']);
  put(box(0.8, 0.85, 0.45, 0.04), wood, [-0.9, 0.43, -7.06]); b.add(box(0.82, 0.05, 0.48, 0.02), counterTop, [-0.9, 0.88, -7.06]);
  b.add(cyl(0.18, 0.15, 0.06, 18), white, [-0.9, 0.9, -7.08]); b.add(cyl(0.015, 0.015, 0.15, 6), steel, [-0.9, 0.98, -6.9]);
  b.add(box(0.6, 0.75, 0.02, 0.01), solid('#DDE9F0', { metalness: 0.9, roughness: 0.05 }), [-0.9, 1.6, -6.88]);
  b.add(box(0.66, 0.81, 0.03, 0.01), darkWood, [-0.9, 1.6, -6.865]);
  b.add(cyl(0.03, 0.03, 0.12, 8), teal, [-1.15, 0.97, -6.95]); b.add(cyl(0.008, 0.008, 0.15, 5), white, [-1.15, 1.05, -6.95], [0, 0, 0.2]);
  b.add(cyl(0.012, 0.012, 0.5, 6), steel, [-1.5, 1.3, -9.13], [0, 0, PI / 2]); b.add(box(0.4, 0.5, 0.03, 0.01), solid('#7FE0C2'), [-1.5, 1.08, -9.11]);
  rug(-1.4, -8.2, 0.8, 0.5, '#7FA7B0', '#FFF3DF', '#FFFFFF');

  // ----- Galley -----
  put(box(0.72, 1.9, 0.68, 0.06), cream, [-3.0, 0.95, -6.35]); b.add(box(0.02, 0.5, 0.04, 0.01), steel, [-2.63, 1.3, -6.1]); b.add(box(0.02, 0.3, 0.04, 0.01), steel, [-2.63, 0.6, -6.1]);
  b.add(new THREE.PlaneGeometry(0.15, 0.2), solid('#FFFFFF', { map: posterOf('photo') }), [-2.632, 1.35, -6.2], [0, PI / 2, 0.1]);
  put(box(0.72, 0.88, 2.6, 0.03), wood, [-3.0, 0.44, -4.65]);
  for (let z = -5.85; z < -3.4; z += 0.52) { b.add(box(0.02, 0.7, 0.48, 0.02), teal, [-2.63, 0.44, z + 0.26]); b.add(box(0.02, 0.03, 0.12, 0.01), steel, [-2.61, 0.66, z + 0.26]); }
  b.add(box(0.78, 0.05, 2.65, 0.02), counterTop, [-3.0, 0.905, -4.65]);
  b.add(box(0.6, 0.02, 0.8, 0.02), dark, [-3.0, 0.94, -5.35]);
  for (const [dx, dz] of [[-0.15, -0.2], [-0.15, 0.2], [0.15, -0.2], [0.15, 0.2]]) b.add(new THREE.TorusGeometry(0.1, 0.012, 6, 18), solid('#555E70'), [-3.0 + dx, 0.955, -5.35 + dz], [PI / 2, 0, 0]);
  b.add(box(0.02, 0.4, 0.6, 0.02), dark, [-2.63, 0.45, -5.35]);
  b.add(cyl(0.11, 0.1, 0.12, 16), darkSteel, [-2.85, 1.02, -5.15]);
  b.add(new THREE.LatheGeometry([[0, 0], [0.11, 0], [0.13, 0.07], [0.11, 0.17], [0.05, 0.2], [0.02, 0.24], [0, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)), 14), coral, [-3.15, 0.96, -5.15]);
  b.add(box(0.55, 0.06, 0.5, 0.02), darkSteel, [-3.0, 0.9, -3.9]); b.add(box(0.5, 0.04, 0.44, 0.01), solid('#3A4252'), [-3.0, 0.91, -3.9]);
  tube([[-3.25, 0.93, -3.9], [-3.25, 1.15, -3.9], [-3.1, 1.22, -3.9], [-2.95, 1.12, -3.9]], 0.015, steel, 12);
  b.add(box(0.36, 0.025, 0.48, 0.01), wood, [-2.9, 0.94, -4.5]);
  for (const [dz, c] of [[-0.12, '#F28B3D'], [0.0, '#5BAF6A'], [0.12, '#E85A5A']]) b.add(lowBall, solid(c, { flatShading: true }), [-2.9, 0.98, -4.5 + dz], [0, 0, 0], 0.04);
  b.add(cyl(0.05, 0.05, 0.16, 10), steel, [-3.2, 1.01, -4.25]); for (let i = 0; i < 3; i++) b.add(cyl(0.01, 0.01, 0.2, 5), darkWood, [-3.2 + (i - 1) * 0.02, 1.15, -4.25], [0, 0, (i - 1) * 0.2]);
  for (const [z0, z1] of [[-5.95, -5.32], [-3.88, -3.35]]) {
    b.add(box(0.45, 0.65, z1 - z0, 0.03), wood, [-3.12, 2.2, (z0 + z1) / 2]);
    b.add(box(0.02, 0.58, z1 - z0 - 0.06, 0.02), cream, [-2.89, 2.2, (z0 + z1) / 2]); b.add(box(0.02, 0.12, 0.03, 0.01), steel, [-2.87, 1.98, (z0 + z1) / 2]);
  }
  const plates = [], mugs = [];
  for (let i = 0; i < 4; i++) plates.push({ pos: [-3.0, 0.94 + i * 0.018, -3.9], rot: [0, i, 0.03], color: '#FFFFFF' });
  for (let i = 0; i < 2; i++) { b.add(box(0.06, 0.01, 0.01, 0.003), steel, [-2.93, 1.84, -5.8 + i * 0.35]); mugs.push({ pos: [-2.93, 1.74, -5.8 + i * 0.35], color: ['#FF7A59', '#3FA7B5'][i] }); }
  mugs.push({ pos: [-2.8, 0.985, -3.55], color: '#FFFFFF' }, { pos: [-2.75, 0.985, -3.42], color: '#F2B33D' });
  label('GALLEY', FACE, 2.7, -4.6, PI / 2, 0.45);
  put(box(1.7, 2.0, 0.04, 0.01), darkWood, [-1.4, 1.0, -6.72]); for (const x of [-2.25, -0.55]) b.add(box(0.04, 2.0, 0.35, 0.01), darkWood, [x, 1.0, -6.57]); b.add(box(1.7, 0.04, 0.35, 0.01), darkWood, [-1.4, 2.0, -6.57]); // open pantry shelves
  for (const h of [0.45, 0.9, 1.35, 1.8]) b.add(box(1.62, 0.04, 0.32, 0.01), wood, [-1.4, h, -6.55]);
  label('PANTRY', -1.4, 2.12, -6.39, 0, 0.5);
  const pantrySlots = [];
  for (const h of [0.47, 0.92, 1.37, 1.82]) for (let i = 0; i < 9; i++) pantrySlots.push([-2.1 + i * 0.17, h, -6.52]);
  const jarColors = ['#F2B33D', '#E9876B', '#5BAF6A', '#C9A27A', '#E05A4F', '#F3EADB', '#9C8BE0'];
  const pantry = inst(cyl(0.06, 0.06, 0.16, 10), solid('#FFFFFF', { roughness: 0.4 }), pantrySlots.map((p, i) => ({ pos: [p[0], p[1] + 0.08, p[2]], color: jarColors[i % 7] })));
  pantry.count = 0;
  put(box(1.4, 0.05, 0.85, 0.02), wood, [-1.0, 0.76, -3.4]);
  for (const [dx, dz] of [[-0.62, -0.36], [0.62, -0.36], [-0.62, 0.36], [0.62, 0.36]]) b.add(cyl(0.03, 0.03, 0.74, 8), darkWood, [-1.0 + dx, 0.37, -3.4 + dz]);
  for (const [x, z, ry] of [[0.12, -3.4, PI / 2], [-2.1, -3.4, -PI / 2], [-1.0, -4.18, PI]]) chair(x, z, ry);
  for (const [x, z] of [[-1.5, -3.4], [-0.9, -3.65]]) plates.push({ pos: [x, 0.79, z], color: '#FFFFFF' });
  mugs.push({ pos: [-0.75, 0.835, -3.2], color: '#3FA7B5' });
  b.add(cyl(0.12, 0.16, 0.18, 14), glow('#FFE2A8'), [-1.0, 2.2, -3.4]); b.add(cyl(0.008, 0.008, 0.8, 4), dark, [-1.0, 2.6, -3.4]);
  rug(-1.0, -3.4, 2.2, 1.6, '#E9876B', '#FFF3DF', '#3FA7B5');
  inst(cyl(0.12, 0.12, 0.012, 18), solid('#FFFFFF', { roughness: 0.3 }), plates);
  inst(cyl(0.045, 0.04, 0.1, 12), solid('#FFFFFF'), mugs);
  b.add(cyl(0.015, 0.015, 1.6, 6), steel, [-2.2, 2.6, -4.6], [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) { const z = -5.2 + i * 0.4; b.add(cyl(0.006, 0.006, 0.2, 4), steel, [-2.2, 2.5, z]); b.add(cyl(0.12 - i * 0.015, 0.1 - i * 0.015, 0.06, 14), i % 2 ? darkSteel : coral, [-2.2, 2.3 - i * 0.02, z], [PI / 2 - 0.1, 0, 0]); }

  // ----- Lounge: bookshelf, sofa, coffee table, a plant on its stand, the guitar on a wall hook, and the desk -----
  put(box(0.04, 2.2, 1.1, 0.01), darkWood, [-3.3, 1.1, -2.55]); for (const z of [-3.1, -2.0]) b.add(box(0.4, 2.2, 0.04, 0.01), darkWood, [-3.12, 1.1, z]); b.add(box(0.4, 0.04, 1.1, 0.01), darkWood, [-3.12, 2.2, -2.55]); // open bookshelf
  for (const h of [0.4, 0.85, 1.3, 1.75]) { b.add(box(0.36, 0.035, 1.04, 0.01), wood, [-3.08, h, -2.55]); stock(-3.08, h + 0.018, -3.08, -2.02, 0.24, ['book', 'book', 'book', 'box']); }
  put(box(0.85, 0.42, 2.1, 0.1), coralFab, [-2.95, 0.21, -0.85]);
  b.add(box(0.75, 0.12, 1.9, 0.06), coralFab, [-2.92, 0.47, -0.85]);
  b.add(box(0.22, 0.6, 2.1, 0.1), coralFab, [-3.22, 0.7, -0.85]);
  for (const z of [-1.85, 0.15]) b.add(box(0.85, 0.3, 0.18, 0.08), coralFab, [-2.95, 0.55, z]);
  for (const [z, m] of [[-1.45, tealFab], [-0.25, solid('#FFFFFF', { map: T.fabricTexture('#F2B33D', '#F5C35A') })]]) b.add(box(0.18, 0.38, 0.38, 0.1), m, [-3.05, 0.72, z], [0, 0, 0.25]);
  b.add(box(0.6, 0.04, 0.7, 0.02), tealFab, [-2.75, 0.55, -0.3], [0, 0.1, 0.05]);
  put(box(1.0, 0.05, 0.6, 0.02), wood, [-1.6, 0.42, -0.85]); for (const [dx, dz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) b.add(cyl(0.025, 0.025, 0.4, 6), darkWood, [-1.6 + dx, 0.2, -0.85 + dz]);
  b.add(cyl(0.05, 0.045, 0.1, 10), teal, [-1.4, 0.5, -0.9]); for (let i = 0; i < 3; i++) b.add(box(0.21, 0.008, 0.29, 0.002), white, [-1.85 + i * 0.02, 0.45 + i * 0.008, -1.0], [0, i * 0.3, 0]);
  rug(-1.8, -0.85, 2.6, 2.0, '#E9876B', '#FFF3DF', '#3FA7B5');
  put(cyl(0.16, 0.18, 0.5, 12), darkWood, [-0.3, 0.25, 0.85]); plant([-0.3, 0.5, 0.85], 0.9);
  const DZ = 0.6;                                                                                  // the desk, against the far wall
  put(box(0.7, 0.05, 0.9, 0.02), wood, [-3.0, 0.75, DZ]);
  b.add(box(0.68, 0.72, 0.25, 0.02), darkWood, [-3.0, 0.37, DZ - 0.32]); b.add(box(0.68, 0.72, 0.03, 0.01), darkWood, [-3.0, 0.37, DZ + 0.43]);
  b.add(box(0.05, 0.36, 0.55, 0.02), dark, [-3.15, 1.03, DZ]); b.add(cyl(0.02, 0.02, 0.1, 6), darkSteel, [-3.17, 0.82, DZ]); b.add(box(0.14, 0.02, 0.2, 0.01), darkSteel, [-3.17, 0.785, DZ]); // monitor on a stand, under the porthole
  const budget = T.screenTexture({ title: 'BUDGET', color: '#FFC56B' });
  inside.add(mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshBasicMaterial({ map: budget.texture }), [-3.12, 1.03, DZ], [0, PI / 2, 0]));
  b.add(cyl(0.06, 0.08, 0.03, 12), dark, [-3.15, 0.79, DZ + 0.32]); b.add(cyl(0.012, 0.012, 0.35, 6), steel, [-3.1, 0.95, DZ + 0.32], [0, 0, -0.3]); b.add(cyl(0.05, 0.1, 0.1, 12), glow('#FFE2A8'), [-3.0, 1.1, DZ + 0.32]);
  b.add(box(0.22, 0.015, 0.3, 0.005), teal, [-2.8, 0.785, DZ - 0.1]); b.add(box(0.2, 0.017, 0.28, 0.004), white, [-2.8, 0.79, DZ - 0.1]);
  for (let i = 0; i < 5; i++) b.add(box(0.21, 0.008, 0.29, 0.002), i % 3 ? white : solid('#FFF3B0'), [-2.95 + (i % 2) * 0.02, 0.78 + i * 0.008, DZ + 0.12], [0, i * 0.12, 0]);
  chair(-2.3, DZ, PI / 2);
  b.add(box(0.3, 0.03, 0.95, 0.01), wood, [-3.18, 2.35, -0.1]);
  // The guitar hangs on a hook on the lab wall.
  { const gy = 1.45, gx = -2.2, gz = Z.lab - 0.12;
    b.add(box(0.06, 0.06, 0.05, 0.01), steel, [gx, gy + 0.62, Z.lab - 0.08]);
    b.add(sphere, solid('#C77B3F', { roughness: 0.5 }), [gx, gy - 0.18, gz], [0, 0, 0], [0.17, 0.22, 0.05]); b.add(sphere, solid('#C77B3F', { roughness: 0.5 }), [gx, gy + 0.06, gz], [0, 0, 0], [0.13, 0.15, 0.05]);
    b.add(cyl(0.03, 0.03, 0.02, 14), dark, [gx, gy - 0.08, gz - 0.05], [PI / 2, 0, 0]); b.add(box(0.04, 0.45, 0.04, 0.01), darkWood, [gx, gy + 0.38, gz]); }
  poster(-0.7, 1.7, Z.lab - 0.07, 'motto', PI, 0.45);
  const frames = new THREE.Group(); inside.add(frames);
  const jar = new THREE.Group(); jar.position.set(2.65, 0, -1.6); inside.add(jar); mark('low', 2.25, 3.05, -2.0, -1.2);
  jar.add(mesh(cyl(0.32, 0.36, 0.15, 20), darkWood, [0, 0.075, 0]));
  jar.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 24, 1, true), glass, [0, 0.53, 0]));
  jar.add(mesh(cyl(0.22, 0.24, 0.08, 20), coral, [0, 0.95, 0]));
  const slots = [];
  for (let y = 0.2; y < 0.86; y += 0.06) for (let x = -0.25; x <= 0.25; x += 0.065) for (let z = -0.25; z <= 0.25; z += 0.065) if (x * x + z * z < 0.06) slots.push([x + Math.sin(y * 50 + z * 30) * 0.01, y, z]);
  const gemColors = ['#3FD0A6', '#FFB93D', '#A68CF0', '#4FB4F0', '#FF8FA8'];
  const gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), slots.length);
  slots.forEach((s, i) => { gems.setMatrixAt(i, m4.compose(vv.set(...s), qq.setFromEuler(ee.set(i, i * 0.7, i * 2.1)), ss.setScalar(0.85 + (i % 5) * 0.08))); gems.setColorAt(i, new THREE.Color(gemColors[(i * 3) % 5])); });
  gems.count = 0; jar.add(gems);
  const jarGlow = sprite('#9FF0D6', 1.0, 0); jarGlow.position.y = 0.5; jar.add(jarGlow);
  label('SAVINGS', 2.65, 1.12, -1.28, 0, 0.4);
  const trophies = new THREE.Group(); inside.add(trophies);
  const cup = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.06, 0.02], [0.02, 0.05], [0.02, 0.1], [0.08, 0.14], [0.09, 0.22], [0.075, 0.22], [0.065, 0.16], [0, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 16);

  // ================= LOWER DECK: SCIENCE LAB =================
  put(box(0.75, 0.9, 2.0, 0.03), solid('#E8EEF2'), [-3.0, 0.45, 3.0]);
  b.add(box(0.8, 0.06, 2.05, 0.02), solid('#2F3B4C', { roughness: 0.3 }), [-3.0, 0.93, 3.0]);
  for (let z = 2.05; z < 3.95; z += 0.5) { b.add(box(0.02, 0.7, 0.46, 0.02), solid('#CBD6DE'), [-2.62, 0.45, z + 0.24]); b.add(box(0.02, 0.03, 0.15, 0.01), steel, [-2.6, 0.7, z + 0.24]); }
  { const z = 2.4, y = 0.96;
    b.add(box(0.22, 0.04, 0.28, 0.02), dark, [-3.05, y + 0.02, z]); b.add(box(0.06, 0.32, 0.06, 0.02), dark, [-3.13, y + 0.18, z]);
    b.add(cyl(0.035, 0.03, 0.22, 10), white, [-3.02, y + 0.33, z], [0, 0, -0.5]); b.add(cyl(0.02, 0.02, 0.1, 8), dark, [-2.95, y + 0.47, z], [0, 0, -0.5]);
    b.add(box(0.12, 0.02, 0.12, 0.01), steel, [-3.0, y + 0.12, z]); }
  const rotor = new THREE.Group(); rotor.position.set(-3.05, 1.13, 3.3);
  { b.add(cyl(0.2, 0.22, 0.2, 18), white, [-3.05, 1.06, 3.3]); b.add(box(0.12, 0.05, 0.02, 0.01), glow('#7FE0C2'), [-2.85, 1.06, 3.3], [0, PI / 2, 0]);
    rotor.add(mesh(cyl(0.15, 0.15, 0.03, 16), glass)); for (let i = 0; i < 6; i++) rotor.add(mesh(cyl(0.015, 0.015, 0.08, 6), solid(['#FF9DAE', '#7FE0C2', '#FFC56B'][i % 3]), [Math.cos(i) * 0.1, 0.02, Math.sin(i) * 0.1], [0.4 * Math.sin(i), 0, 0.4 * Math.cos(i)]));
    inside.add(rotor); }
  for (let i = 0; i < 4; i++) {
    const x = -3.18 + (i % 2) * 0.22, z = 3.6 + Math.floor(i / 2) * 0.22, y = 0.96;
    b.add(cyl(0.09, 0.09, 0.24, 14), glass, [x, y + 0.12, z]); b.add(cyl(0.095, 0.095, 0.04, 14), steel, [x, y + 0.26, z]);
    b.add(cyl(0.08, 0.08, 0.04, 12), solid('#4A3426'), [x, y + 0.02, z]);
    for (let k = 0; k < 4; k++) b.add(lowBall, k % 2 ? leaf : leaf2, [x + Math.cos(k * 1.7) * 0.03, y + 0.09 + k * 0.025, z + Math.sin(k * 1.7) * 0.03], [k, k * 2, 0], [0.025, 0.06, 0.02]);
  }
  for (const [z, c] of [[2.75, '#7FE0C2'], [2.9, '#FFC56B']]) { b.add(new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.065, 0.02], [0.03, 0.12], [0.02, 0.18], [0.025, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 12), glass, [-2.85, 0.96, z]); b.add(cyl(0.05, 0.06, 0.05, 10), glow(c), [-2.85, 0.99, z]); }
  const bubbles = new THREE.Group(); bubbles.position.set(-2.85, 1.12, 2.82); inside.add(bubbles);
  for (let i = 0; i < 5; i++) { const s = sprite('#BFFFE8', 0.08, 0.8); s.userData = { t: i / 5 }; bubbles.add(s); }
  b.add(box(0.06, 0.32, 0.45, 0.02), dark, [-3.3, 1.18, 2.12]);
  inside.add(mesh(new THREE.PlaneGeometry(0.4, 0.27), new THREE.MeshBasicMaterial({ map: T.screenTexture({ title: 'SPECTRUM', color: '#9C8BE0' }).texture }), [-3.265, 1.18, 2.12], [0, PI / 2, 0]));
  b.add(box(0.3, 0.035, 2.0, 0.01), wood, [-3.2, 2.35, 3.0]); for (const z of [2.2, 3.8]) b.add(box(0.25, 0.04, 0.04, 0.01), steel, [-3.2, 2.32, z]);
  stock(-3.2, 2.37, 2.05, 3.95, 0.22, ['jar', 'box', 'book']);
  const tankGlow = [];
  for (const [x, c] of [[-3.0, '#7FE0C2'], [-2.3, '#9C8BE0']]) {
    put(cyl(0.32, 0.34, 0.2, 18), darkSteel, [x, 0.1, 1.62]); b.add(cyl(0.32, 0.32, 0.12, 18), darkSteel, [x, 1.86, 1.62]);
    const liquid = mesh(cyl(0.27, 0.27, 1.5, 18), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5 }), [x, 0.98, 1.62]); inside.add(liquid); tankGlow.push(liquid);
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 1.58, 18, 1, true), glass, [x, 0.98, 1.62]);
    b.add(lowBall, solid('#E8D3B0', { flatShading: true }), [x, 1.0, 1.62], [0.3, 0.5, 0], [0.09, 0.14, 0.07]);
  }
  b.add(box(1.7, 1.15, 0.04, 0.02), steel, [-0.75, 1.5, Z.lab + 0.08]);
  b.add(new THREE.PlaneGeometry(1.6, 1.0), solid('#FFFFFF', { map: T.whiteboardTexture(), roughness: 0.25 }), [-0.75, 1.5, Z.lab + 0.105]);
  b.add(box(1.4, 0.04, 0.08, 0.01), steel, [-0.75, 0.9, Z.lab + 0.14]);
  for (const [x, c] of [[-1.0, '#1F4E8C'], [-0.85, '#C0392B'], [-0.6, '#2E7D4F']]) b.add(cyl(0.01, 0.01, 0.12, 6), solid(c), [x, 0.93, Z.lab + 0.14], [0, 0, PI / 2]);
  put(box(1.9, 1.9, 0.4, 0.03), steel, [-2.35, 0.95, Z.suit - 0.26]);                                                    // hydroponics rack
  for (const h of [0.35, 0.95, 1.55]) {
    b.add(box(1.8, 0.12, 0.35, 0.02), solid('#4A3426'), [-2.35, h, Z.suit - 0.27]);
    b.add(box(1.75, 0.03, 0.06, 0.01), glow('#D07BFF'), [-2.35, h + 0.5, Z.suit - 0.36]);
    for (let i = 0; i < 5; i++) plant([-3.1 + i * 0.37, h + 0.06, Z.suit - 0.27], 0.38, false);
  }
  label('HYDROPONICS', -2.35, 2.05, Z.suit - 0.48, PI, 0.7);
  put(box(0.6, 1.9, 0.45, 0.04), solid('#F5C542'), [-0.6, 0.95, Z.suit - 0.29]);
  for (const s of [-1, 1]) b.add(box(0.27, 1.8, 0.02, 0.01), mustard, [-0.6 + s * 0.15, 0.95, Z.suit - 0.52]);
  b.add(new THREE.PlaneGeometry(0.36, 0.36), solid('#FFFFFF', { map: T.textTexture('⚠', { w: 128, h: 128, bg: '#F5C542', color: '#2B3550', size: 100 }) }), [-0.6, 1.4, Z.suit - 0.535], [0, PI, 0]);
  label('HAZARDOUS', -0.6, 1.05, Z.suit - 0.535, PI, 0.45);
  put(box(0.7, 0.9, 0.75, 0.04), white, [2.95, 0.45, 1.85]);
  b.add(box(0.7, 0.04, 0.75, 0.02), steel, [2.95, 0.92, 1.85]); label('SAMPLES -80°', 2.59, 0.6, 1.85, -PI / 2, 0.45);
  rug(-1.2, 3.0, 1.6, 1.2, '#7FA7B0', '#E9E1D3', '#3FA7B5');
  label('SCIENCE LAB', -0.4, 2.45, Z.lab + 0.08, 0, 0.6);

  // ================= LOWER DECK: SUIT AND WORKSHOP ROOM =================
  // The mechanic's workbench on the front wall, with a pegboard, a small 3D printer and labeled parts bins.
  put(box(2.3, 0.9, 0.7, 0.03), darkWood, [-2.15, 0.45, Z.suit + 0.41]); b.add(box(2.35, 0.06, 0.75, 0.02), wood, [-2.15, 0.93, Z.suit + 0.41]);
  b.add(box(2.2, 1.0, 0.04, 0.02), solid('#E8D3B0'), [-2.15, 1.55, Z.suit + 0.08]);
  const tools = [], toolColors = ['#FF7A59', '#AEB7C8', '#3FA7B5', '#F2B33D', '#E05A4F'];
  for (let i = 0; i < 18; i++) tools.push({ pos: [-3.1 + (i % 9) * 0.23, 1.35 + Math.floor(i / 9) * 0.42, Z.suit + 0.12], rot: [0, 0, (i % 3 - 1) * 0.3], scale: [1, 0.6 + (i % 4) * 0.25, 1], color: toolColors[i % 5] });
  for (let i = 0; i < 4; i++) tools.push({ pos: [-1.9 + i * 0.12, 0.975, Z.suit + 0.6], rot: [PI / 2, (i % 3) * 0.6, 0], scale: [1, 0.8, 1], color: toolColors[(i + 2) % 5] });
  inst(box(0.03, 0.3, 0.05, 0.01), solid('#FFFFFF', { metalness: 0.3, roughness: 0.5 }), tools);
  b.add(box(0.3, 0.2, 0.35, 0.03), steel, [-2.95, 1.06, Z.suit + 0.4]); b.add(box(0.1, 0.12, 0.3, 0.02), dark, [-2.8, 1.2, Z.suit + 0.4]);
  b.add(box(0.5, 0.5, 0.45, 0.03), dark, [-1.25, 1.21, Z.suit + 0.35]); b.add(box(0.45, 0.45, 0.4, 0.01), glass, [-1.25, 1.21, Z.suit + 0.35]);
  b.add(box(0.08, 0.06, 0.08, 0.01), glow('#FF8A3D'), [-1.25, 1.3, Z.suit + 0.35]); b.add(box(0.16, 0.07, 0.12, 0.02), solid('#7FE0C2'), [-1.25, 1.0, Z.suit + 0.35]);
  label('3D PRINTER', -1.25, 1.5, Z.suit + 0.58, 0, 0.4);
  b.add(box(2.3, 0.03, 0.32, 0.01), steel, [-2.15, 2.25, Z.suit + 0.2]);
  const bins = [];
  ['BOLTS', 'NUTS', 'FUSES', 'WIRE', 'SEALS', 'CLAMPS', 'BITS', 'TAPE'].forEach((t, i) => { bins.push({ pos: [-3.15 + i * 0.29, 2.36, Z.suit + 0.22], color: ['#FF7A59', '#3FA7B5', '#F2B33D', '#9C8BE0'][i % 4] });
    b.add(new THREE.PlaneGeometry(0.2, 0.06), solid('#FFFFFF', { map: T.boxLabelTexture(t) }), [-3.15 + i * 0.29, 2.36, Z.suit + 0.355]); });
  inst(box(0.26, 0.17, 0.26, 0.02), solid('#FFFFFF', { roughness: 0.6 }), bins);
  // Suits hanging on the far wall: helmets on a shelf above, oxygen packs and tether reels on hooks, boots on a rack below,
  // and a bench in front.
  const SZ = [5.95, 6.65, 7.35];
  b.add(cyl(0.03, 0.03, 2.2, 8), steel, [FACE + 0.12, 2.15, 6.65], [PI / 2, 0, 0]);
  SZ.forEach((z, i) => suit(-3.0, z, i));
  b.add(box(0.35, 0.035, 2.3, 0.01), steel, [-3.17, 2.45, 6.65]);
  SZ.forEach(z => { b.add(sphere, solid('#EDE6D6', { roughness: 0.6 }), [-3.12, 2.62, z], [0, 0, 0], 0.15);
    b.add(new THREE.SphereGeometry(1, 16, 10, PI * 1.15, PI * 0.7, PI * 0.3, PI * 0.35), solid('#E3A93A', { metalness: 0.7, roughness: 0.15 }), [-3.12, 2.62, z], [0, -PI / 2, 0], 0.155); });
  put(box(0.4, 0.2, 2.3, 0.03), steel, [-3.12, 0.1, 6.65]);
  SZ.forEach(z => { for (const s of [-1, 1]) b.add(box(0.26, 0.14, 0.11, 0.04), solid('#8E8A80', { roughness: 0.9 }), [-3.1, 0.27, z + s * 0.08]); });
  for (const z of [5.5, 7.8]) { b.add(box(0.05, 0.05, 0.1, 0.01), steel, [FACE + 0.03, 1.6, z]); b.add(box(0.2, 0.42, 0.3, 0.05), solid('#C9C2B2'), [-3.22, 1.35, z]); b.add(cyl(0.05, 0.05, 0.36, 10), white, [-3.13, 1.35, z + 0.08]); }
  for (const z of [6.3, 7.0]) { b.add(cyl(0.02, 0.02, 0.1, 6), steel, [FACE + 0.05, 2.25, z], [0, 0, PI / 2]); b.add(cyl(0.16, 0.16, 0.1, 18), mustard, [-3.22, 2.25, z], [0, 0, PI / 2]); b.add(new THREE.TorusGeometry(0.12, 0.022, 6, 16), dark, [-3.16, 2.25, z], [0, PI / 2, 0]); }
  put(box(0.38, 0.42, 1.3, 0.04), darkWood, [-2.45, 0.21, 6.9]); b.add(box(0.38, 0.06, 1.3, 0.03), tealFab, [-2.45, 0.45, 6.9]);
  label('SUITS', -3.3, 3.0, 6.65, PI / 2, 0.4);
  // Lockers against the airlock wall: two open, showing hoses, patch kits and tools, and the welding gear and spare parts.
  const LZ = Z.airlock - 0.29;
  for (let i = 0; i < 4; i++) {
    const x = -3.0 + i * 0.6, isOpen = i === 1 || i === 2;
    put(box(0.56, 2.0, 0.5, 0.03), i === 3 ? red : solid('#5E7F8C'), [x, 1.0, LZ]);
    if (isOpen) {
      b.add(box(0.5, 1.9, 0.02, 0.005), dark, [x, 1.0, LZ + 0.24]);
      for (const h of [0.68, 1.33]) b.add(box(0.5, 0.02, 0.44, 0.005), darkSteel, [x, h, LZ]);
      b.add(box(0.52, 1.9, 0.03, 0.01), solid('#5E7F8C'), [x - 0.26 + Math.cos(0.9) * 0.26, 1.0, LZ - 0.25 - Math.sin(0.9) * 0.26], [0, 0.9, 0]); // the door swung open
      if (i === 1) {
        for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(0.1, 0.025, 6, 14), red, [x, 1.4 + k * 0.03, LZ], [PI / 2, 0, 0]);
        b.add(box(0.18, 0.1, 0.3, 0.02), solid('#F2B33D'), [x - 0.1, 0.75, LZ]); b.add(box(0.15, 0.08, 0.25, 0.02), solid('#E05A4F'), [x + 0.12, 0.73, LZ]);
        for (let k = 0; k < 5; k++) b.add(box(0.03, 0.22, 0.05, 0.01), solid(toolColors[k]), [x - 0.18 + k * 0.09, 0.13, LZ]);
      } else {
        b.add(cyl(0.08, 0.08, 0.55, 12), solid('#2E7D4F'), [x - 0.1, 0.29, LZ]); b.add(cyl(0.03, 0.03, 0.08, 8), steel, [x - 0.1, 0.6, LZ]);
        b.add(box(0.2, 0.18, 0.12, 0.03), dark, [x + 0.12, 1.43, LZ]); b.add(box(0.14, 0.08, 0.02, 0.01), solid('#2A3A2A', { metalness: 0.5, roughness: 0.2 }), [x + 0.12, 1.46, LZ - 0.07]);
        b.add(cyl(0.012, 0.012, 0.25, 6), steel, [x + 0.05, 0.8, LZ], [0, 0, 0.4]); for (let k = 0; k < 6; k++) b.add(cyl(0.025, 0.025, 0.04, 8), steel, [x - 0.15 + (k % 3) * 0.08, 0.71, LZ - 0.1 + Math.floor(k / 3) * 0.1]);
      }
    } else { b.add(box(0.05, 0.25, 0.02, 0.01), steel, [x + 0.15, 1.1, LZ - 0.26]); for (let v = 0; v < 3; v++) b.add(box(0.3, 0.02, 0.01, 0.005), dark, [x, 1.6 + v * 0.05, LZ - 0.255]); }
  }
  label('REPAIR KIT', -1.2, 2.1, LZ - 0.26, PI, 0.45);
  label('MAINTENANCE', -2.1, 2.1, LZ - 0.26, PI, 0.6);
  rug(0.3, 6.6, 1.0, 1.6, '#5E6A7A', '#4A5566', '#F2B33D');

  // ================= LOWER DECK: AIRLOCK =================
  crossWall(Z.airlock, LOW, 3.0, { door: false, x1: -0.8 });
  const AZ = (Z.airlock + Z.storage) / 2, awFar = hwM(1.5, AZ);
  b.add(box(awFar - 0.8, 0.12, Z.storage - Z.airlock, 0.02), wall, [-(awFar + 0.8) / 2, 3.0, AZ]);
  b.add(box(0.06, 3.0, Z.storage - Z.airlock, 0.01), glass, [-0.8, 1.5, AZ]);
  for (const z of [Z.airlock, Z.storage]) b.add(box(0.14, 3.0, 0.14, 0.02), steel, [-0.8, 1.5, z]);
  b.add(box(0.14, 0.14, Z.storage - Z.airlock, 0.02), steel, [-0.8, 2.95, AZ]);
  mark('low', -5, -0.7, Z.airlock, Z.storage);
  const innerDoor = new THREE.Group(); innerDoor.position.set(-0.8, 1.1, AZ); innerDoor.rotation.y = PI / 2; inside.add(innerDoor);
  innerDoor.add(mesh(new THREE.TorusGeometry(0.6, 0.08, 10, 32), steel), mesh(new THREE.CircleGeometry(0.56, 32), solid('#5E7F8C', { side: THREE.DoubleSide })), mesh(new THREE.CircleGeometry(0.15, 20), glass, [0, 0.25, 0.01]));
  const hatchX = -(hwM(1.25, AZ) - 0.12);
  const hatch = new THREE.Group(); hatch.position.set(hatchX, 1.25, AZ); hatch.rotation.y = PI / 2; inside.add(hatch);
  hatch.add(mesh(new THREE.TorusGeometry(0.7, 0.1, 10, 32), darkSteel), mesh(new THREE.CircleGeometry(0.66, 32), solid('#8E97AA', { metalness: 0.5 })), mesh(new THREE.TorusGeometry(0.82, 0.05, 8, 32), hazard));
  const wheel = new THREE.Group(); wheel.position.z = 0.08; hatch.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 24), red)); for (let i = 0; i < 3; i++) wheel.add(mesh(box(0.5, 0.03, 0.03, 0.01), steel, [0, 0, 0], [0, 0, i * PI / 3]));
  for (const z of [Z.airlock + 0.3, Z.storage - 0.3]) { b.add(box(2.4, 0.45, 0.4, 0.05), darkSteel, [-2.2, 0.23, z]); b.add(box(2.4, 0.06, 0.42, 0.03), tealFab, [-2.2, 0.48, z]); }
  for (const [x, z, ry] of [[-1.6, Z.airlock + 0.08, 0], [-3.0, Z.airlock + 0.08, 0], [-1.6, Z.storage - 0.08, PI], [-3.0, Z.storage - 0.08, PI]]) b.add(new THREE.TorusGeometry(0.15, 0.02, 6, 14, PI), mustard, [x, 1.4, z], [0, ry, 0]);
  for (const x of [-2.0, -3.0]) { b.add(cyl(0.11, 0.11, 0.04, 18), solid('#F5F1E8'), [x, 2.2, Z.storage - 0.08], [PI / 2, 0, 0]); b.add(box(0.01, 0.08, 0.008, 0.003), red, [x + 0.02, 2.22, Z.storage - 0.105], [0, 0, -0.8]); }
  const statusRed = mesh(sphere, basic('#FF4A4A'), [-0.8, 2.45, AZ - 0.5], [0, 0, 0], 0.05), statusGreen = mesh(sphere, basic('#2F6B45'), [-0.8, 2.45, AZ + 0.5], [0, 0, 0], 0.05);
  inside.add(statusRed, statusGreen);
  b.add(new THREE.PlaneGeometry(1.2, 1.0), hazard, [-2.6, 0.008, AZ], [-PI / 2, 0, 0]);
  label('AIRLOCK', -0.78, 2.7, AZ, PI / 2, 0.6);

  // ================= LOWER DECK: STORAGE ROOM =================
  // Floor-to-ceiling racks along the far and back walls, a low shelf on the near side, crates on a pallet, and the
  // junk and overflow from the rest of the ship. A clear path runs through the middle.
  const crates = [], boxes = [], storeLabels = ['SPARES', 'FOOD', 'FILTERS', 'CABLES', 'MEDICAL', 'TOOLS', 'SEEDS', 'MISC', 'FUSES', 'PAPERS', 'WATER', 'O-RINGS'];
  const levelY = (h, levels, l) => 0.12 + l * (h - 0.2) / (levels - 1);
  function rack(x, z, w, d, h, levels, alongZ) {
    const sx = alongZ ? d : w, sz = alongZ ? w : d;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(box(0.05, h, 0.05, 0.01), darkSteel, [x + dx * sx / 2, h / 2, z + dz * sz / 2]);
    mark('low', x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2);
    for (let l = 0; l < levels; l++) {
      const y = levelY(h, levels, l);
      b.add(box(sx, 0.04, sz, 0.01), steel, [x, y, z]);
      if (l === levels - 1) continue;
      const room = (h - 0.2) / (levels - 1) - 0.1;
      for (let p = -w / 2 + 0.05; p < w / 2 - 0.2;) {
        const s = 0.22 + rnd() * 0.2, hh = Math.min(room, 0.2 + rnd() * 0.25), isCrate = rnd() < 0.3;
        const pos = alongZ ? [x + (rnd() - 0.5) * 0.04, y + 0.02 + hh / 2, z + p + s / 2] : [x + p + s / 2, y + 0.02 + hh / 2, z + (rnd() - 0.5) * 0.04];
        (isCrate ? crates : boxes).push({ pos, scale: alongZ ? [d * 0.8, hh, s] : [s, hh, d * 0.8], color: isCrate ? null : pick(['#C9A06A', '#BF955E', '#D2AE7A', '#B98E66']) });
        if (!isCrate && rnd() < 0.7) {
          if (alongZ) { const sg = Math.sign(-x) || 1; b.add(new THREE.PlaneGeometry(0.12, 0.045), solid('#FFFFFF', { map: T.boxLabelTexture(pick(storeLabels)) }), [pos[0] + sg * (d * 0.4 + 0.003), pos[1], pos[2]], [0, sg * PI / 2, 0]); }
          else b.add(new THREE.PlaneGeometry(0.12, 0.045), solid('#FFFFFF', { map: T.boxLabelTexture(pick(storeLabels)) }), [pos[0], pos[1], pos[2] - d * 0.4 - 0.003], [0, PI, 0]);
        }
        p += s + 0.03;
      }
    }
  }
  rack(-3.05, 11.5, 2.0, 0.55, 4.6, 6, true);                    // far wall, floor to ceiling
  rack(-1.25, 12.25, 2.1, 0.5, 4.6, 6, false);                   // back wall
  rack(2.95, 11.5, 1.8, 0.5, 1.3, 3, true);                      // a low shelf on the near side
  b.add(box(0.06, 4.6, 0.06, 0.01), steel, [-2.62, 2.3, 10.6]); b.add(box(0.06, 4.6, 0.06, 0.01), steel, [-2.62, 2.3, 11.0]); // rolling ladder for the top shelves
  for (let k = 0; k < 14; k++) b.add(cyl(0.015, 0.015, 0.4, 5), steel, [-2.62, 0.3 + k * 0.3, 10.8], [PI / 2, 0, 0]);
  // Junk and overflow, on the shelves: an old robot arm, a stuffed bear, a broken radio and a coil of hose.
  { const y = levelY(4.6, 6, 3) + 0.02; b.add(cyl(0.14, 0.18, 0.16, 14), darkSteel, [-3.05, y + 0.08, 12.1]); b.add(box(0.1, 0.5, 0.1, 0.03), mustard, [-3.05, y + 0.36, 12.1], [0.5, 0, 0]); }
  { const bx = -1.6, by = levelY(4.6, 6, 4) + 0.02, bz = 12.2, fur = solid('#B98059', { roughness: 1 });
    b.add(sphere, fur, [bx, by + 0.12, bz], [0, 0, 0], [0.12, 0.14, 0.11]); b.add(sphere, fur, [bx, by + 0.32, bz - 0.02], [0, 0, 0], 0.1);
    for (const s of [-1, 1]) { b.add(sphere, fur, [bx + s * 0.07, by + 0.41, bz - 0.02], [0, 0, 0], 0.04); b.add(sphere, fur, [bx + s * 0.1, by + 0.06, bz - 0.08], [0, 0, 0], [0.05, 0.05, 0.08]); }
    b.add(sphere, solid('#E8C9A8'), [bx, by + 0.3, bz - 0.1], [0, 0, 0], [0.04, 0.035, 0.03]); }
  { const y = levelY(1.3, 3, 1) + 0.02; b.add(box(0.3, 0.22, 0.4, 0.04), solid('#7FA7B0'), [2.95, y + 0.11, 12.1]); b.add(cyl(0.07, 0.07, 0.02, 12), steel, [2.79, y + 0.13, 12.0], [0, 0, PI / 2]); }
  { b.add(box(1.0, 0.12, 0.75, 0.02), wood, [0.75, 0.06, 12.0]); crates.push({ pos: [0.55, 0.12 + 0.275, 12.0], scale: 0.55 }, { pos: [1.03, 0.12 + 0.22, 12.05], scale: 0.44 }, { pos: [0.6, 0.67 + 0.2, 12.0], scale: 0.4 }); mark('low', 0.25, 1.25, 11.62, 12.38); } // crates on a pallet, by the back wall
  inst(box(1, 1, 1, 0.03), crateMat, crates);
  inst(box(1, 1, 1, 0.02), paint, boxes);
  label('STORAGE', -0.4, 2.45, Z.storage - 0.08, PI, 0.55);

  // ================= BOTTOM DECK: FUEL AND DATA =================
  const S0 = SVC;
  // A grated catwalk down the middle, with a glowing coolant line along its side.
  b.add(box(1.1, 0.06, 22.6, 0.01), grate, [0, S0 + 0.08, 0]);
  for (const s of [-1, 1]) b.add(box(0.04, 0.12, 22.6, 0.01), mustard, [s * 0.55, S0 + 0.12, 0]);
  tube([[-0.68, S0 + 0.12, -11.5], [-0.68, S0 + 0.12, 11.5]], 0.035, glow('#5FF0E0'), 8);
  for (let z = -11; z < 11.5; z += 1.5) b.add(box(0.1, 0.08, 0.08, 0.02), darkSteel, [-0.68, S0 + 0.08, z]);
  // Server racks in two rows facing the catwalk, with blinking status lights and cable trays overhead.
  const serverLeds = [];
  for (const s of [-1, 1]) for (let z = -10.8; z < -5.5; z += 0.62) {
    const x = s * 1.0;
    b.add(box(0.6, 1.75, 0.58, 0.02), rackMat, [x, S0 + 0.9, z]);
    for (let r = 0; r < 10; r++) {
      b.add(box(0.02, 0.12, 0.52, 0.005), solid('#11151C'), [x - s * 0.305, S0 + 0.22 + r * 0.155, z]);
      for (let i = 0; i < 3; i++) serverLeds.push({ pos: [x - s * 0.318, S0 + 0.22 + r * 0.155, z - 0.18 + i * 0.05], color: (r + i) % 5 === 0 ? '#FFC56B' : '#7FE0C2' });
    }
  }
  const serverLedMesh = inst(new THREE.BoxGeometry(0.006, 0.018, 0.02), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.75 }), serverLeds);
  for (const s of [-1, 1]) { b.add(box(0.5, 0.03, 5.6, 0.01), grate, [s * 1.0, -0.42, -8.1]); for (let k = 0; k < 4; k++) b.add(cyl(0.02, 0.02, 5.6, 5), [dark, coral, teal, mustard][k], [s * 1.0 - 0.15 + k * 0.1, -0.38, -8.1], [PI / 2, 0, 0]); }
  label('DATA CORE', 0, S0 + 1.7, -11.83, 0, 0.6, '#E8E2D2');
  // Fuel tanks lying along the ship: two on the far side, one on the near side, behind the ladder.
  const fuelTank = (x, z0, z1) => {
    const zc = (z0 + z1) / 2, len = z1 - z0, y = S0 + 0.95, sg = Math.sign(x);
    b.add(cyl(0.85, 0.85, len, 28), tankMat, [x, y, zc], [PI / 2, 0, 0]);
    for (const e of [-1, 1]) b.add(new THREE.SphereGeometry(0.85, 28, 10, 0, 2 * PI, 0, PI / 2), tankMat, [x, y, zc + e * len / 2], [e * PI / 2, 0, 0], [1, 0.35, 1]);
    for (const z of [z0 + 0.4, zc, z1 - 0.4]) b.add(new THREE.TorusGeometry(0.86, 0.04, 6, 32), solid('#59627A', { metalness: 0.5 }), [x, y, z]);
    for (const z of [z0 + 0.6, z1 - 0.6]) b.add(box(0.3, 0.12, 0.12, 0.02), darkSteel, [x, S0 + 0.06, z]);
    b.add(box(0.02, 0.2, 1.6, 0.01), hazard, [x - sg * 0.86, y, zc]);
    const gx = x - sg * 0.87;
    for (const z of [z0 + 1.0, z1 - 1.0]) { b.add(cyl(0.09, 0.09, 0.03, 18), solid('#F5F1E8'), [gx, y + 0.35, z], [0, 0, PI / 2]); b.add(box(0.008, 0.07, 0.008, 0.002), red, [gx - sg * 0.018, y + 0.36, z], [0.6, 0, 0]); }
    label('FUEL', gx - sg * 0.005, y + 0.62, zc, sg < 0 ? PI / 2 : -PI / 2, 0.5);
  };
  fuelTank(-2.65, -5.0, -0.4); fuelTank(-2.65, 0.2, 5.2); fuelTank(2.65, -1.6, 5.2);
  // Pipes between the tanks and the pumps, with red valve wheels.
  for (const [x, h] of [[-1.6, S0 + 1.75], [1.6, S0 + 1.75], [-1.45, S0 + 0.25]]) tube([[x, h, -5.0], [x, h, 9.5]], 0.06, pipeMat, 30);
  tube([[-1.6, S0 + 1.75, 6.0], [-0.9, S0 + 1.8, 6.4], [0.9, S0 + 1.8, 6.4], [1.6, S0 + 1.75, 6.0]], 0.05, pipeMat, 20);
  for (const [x, z] of [[-1.6, -3.0], [-1.6, 2.6], [1.6, 1.0], [-1.45, 4.5]]) { const y = x === -1.45 ? S0 + 0.25 : S0 + 1.75, sg = Math.sign(-x); b.add(new THREE.TorusGeometry(0.11, 0.018, 6, 16), red, [x + sg * 0.12, y, z], [0, PI / 2, 0]); b.add(cyl(0.015, 0.015, 0.12, 6), steel, [x + sg * 0.06, y, z], [0, 0, PI / 2]); }
  // Pump station and coolant exchanger towards the back; the engine access hatch in the rear bulkhead.
  for (const z of [7.0, 8.2]) { b.add(box(0.7, 0.6, 0.6, 0.05), solid('#3F8C8F'), [-1.0, S0 + 0.3, z]); b.add(cyl(0.2, 0.2, 0.55, 14), solid('#59627A', { metalness: 0.5 }), [-1.0, S0 + 0.8, z], [0, 0, PI / 2]); }
  b.add(cyl(0.38, 0.38, 1.4, 18), solid('#C9744A'), [1.0, S0 + 0.75, 7.6]); label('COOLANT', 0.6, S0 + 1.1, 7.6, -PI / 2, 0.45);
  for (let k = 0; k < 6; k++) b.add(new THREE.TorusGeometry(0.4, 0.03, 6, 20), glow('#5FF0E0'), [1.0, S0 + 0.3 + k * 0.18, 7.6], [PI / 2, 0, 0]);
  const access = new THREE.Group(); access.position.set(0, S0 + 0.95, 11.82); access.rotation.y = PI; inside.add(access);
  access.add(mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 28), darkSteel), mesh(new THREE.CircleGeometry(0.46, 28), solid('#8E97AA', { metalness: 0.5, side: THREE.DoubleSide })), mesh(new THREE.TorusGeometry(0.58, 0.04, 8, 28), hazard));
  label('ENGINE ACCESS', 0, S0 + 1.65, 11.8, PI, 0.7); label('DANGER: HIGH PRESSURE', -1.5, S0 + 1.0, 11.8, PI, 0.8);
  for (const z of [-7.8, 7.8]) for (const s of [-1, 1]) label('GEAR WELL', s * 2.9, S0 + 1.5, z + (z < 0 ? 2.6 : -2.6), z < 0 ? 0 : PI, 0.5);

  // ---------- High up in the tall rooms: a ventilation duct, cable trays and wall cabinets above head height ----------
  b.add(box(0.42, 0.42, Z.storage - CTRL_END - 0.2, 0.04), solid('#B8BEC6', { metalness: 0.4, roughness: 0.5 }), [-IN + 0.3, 5.2, (CTRL_END + Z.storage) / 2]);
  for (let z = CTRL_END + 0.6; z < Z.storage - 0.3; z += 1.6) { b.add(box(0.05, 0.3, 0.5, 0.01), dark, [-IN + 0.53, 5.2, z]); for (let k = 0; k < 5; k++) b.add(box(0.06, 0.02, 0.44, 0.005), steel, [-IN + 0.55, 5.08 + k * 0.06, z]); }
  for (const [z0, z1] of [[-3.8, -2.0], [-1.7, 1.0], [1.4, 4.6], [5.0, 8.4]]) {
    b.add(box(0.42, 0.75, z1 - z0, 0.03), wood, [-IN + 0.27, 3.9, (z0 + z1) / 2]);                     // wall cabinets
    for (let z = z0; z < z1 - 0.05; z += 0.6) { b.add(box(0.02, 0.68, Math.min(0.56, z1 - z - 0.04), 0.01), cream, [-IN + 0.49, 3.9, z + Math.min(0.3, (z1 - z) / 2)]); b.add(box(0.02, 0.12, 0.03, 0.01), steel, [-IN + 0.51, 3.7, z + 0.28]); }
    b.add(box(0.35, 0.035, z1 - z0, 0.01), steel, [-IN + 0.25, 4.55, (z0 + z1) / 2]); stock(-IN + 0.25, 4.57, z0, z1, 0.25, ['box', 'jar', 'book']);  // an open shelf above
  }
  for (const z of [Z.lab, Z.suit, Z.storage]) for (const s2 of [-1, 1]) b.add(box(1.4, 0.06, 0.08, 0.02), steel, [-1.8, 3.4 + (s2 > 0 ? 1.6 : 0), z + s2 * 0.0 - 0.1]);  // trim rails on the cross walls
  for (const [x, z] of [[-1.0, -1.0], [-1.0, 3.0], [-1.0, 6.6], [0.8, 11.4]]) { b.add(cyl(0.006, 0.006, 1.2, 4), dark, [x, CEIL - 0.6, z]); b.add(cyl(0.16, 0.24, 0.2, 14), glow('#FFE2A8'), [x, CEIL - 1.25, z]); } // pendant lights
  // ---------- Labels ----------
  for (const [text, x, h, z, ry, w, bg] of labels)
    b.add(new THREE.PlaneGeometry(w, w * 0.22), solid('#FFFFFF', { map: T.textTexture(text, { w: 512, h: 112, bg, color: '#2B3550', size: 60 }), roughness: 0.6 }), [x + Math.sin(ry) * 0.015, h, z + Math.cos(ry) * 0.015], [0, ry, 0]);
  inst(box(1, 1, 1, 0.01), paint, shelfStuff);

  // ---------- Things the pilot uses ----------
  const pan = new THREE.Group();
  pan.add(mesh(cyl(0.16, 0.13, 0.05, 18), dark), mesh(box(0.28, 0.025, 0.045, 0.01), dark, [0.26, 0.01, 0]), mesh(lowBall, solid('#F2B33D', { flatShading: true }), [0, 0.025, 0], [0, 0, 0], [0.12, 0.02, 0.12]));
  pan.position.set(-3.15, 0.97, -5.55); pan.rotation.y = PI;
  const steam = puffGroup(-3.15, 1.02, -5.55, 0.75);
  const bowl = new THREE.Group();
  bowl.add(mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, PI * 2, PI / 2, PI / 2), solid('#FFFFFF', { side: THREE.DoubleSide }), [0, 0.11, 0]), mesh(sphere, solid('#F2B33D'), [0, 0.095, 0], [0, 0, 0], [0.09, 0.015, 0.09]));
  bowl.position.set(-0.5, 0.78, -3.4);
  const showerSteam = puffGroup(-2.75, 1.2, -8.5, 1.4);
  inside.add(pan, steam, bowl, showerSteam);

  // ---------- Waypoints (where the pilot can walk) and spots (where things happen), in meters ----------
  const N = (pos, links) => ({ pos, links });
  const [LU, LL] = ladderInfo;
  const layout = {
    nodes: {
      seatSide: N([0.05, UP, -10.6], ['U_nav']),
      U_nav: N([0.8, UP, -7.6], ['seatSide', 'luTopLand']),
      // Bridge ladder: from the top landing, step back onto the ladder, climb down, step back off at the bottom.
      luTopLand: N([LU.x, UP, LU.zFace - 0.45], ['U_nav', 'luTop']),
      luTop: N([LU.x, UP, LU.zFace + 0.35], ['luTopLand', 'luBot']),
      luBot: N([LU.x, LOW, LU.zFace + 0.35], ['luTop', 'luBotLand']),
      luBotLand: N([LU.x, LOW, LU.zFace + 0.75], ['luBot', 'L_galley', 'llTopLand']),
      // The ladder down to the bottom deck.
      llTopLand: N([LL.x, LOW, LL.zFace - 0.45], ['luBotLand', 'L_galley', 'llTop']),
      llTop: N([LL.x, LOW, LL.zFace + 0.35], ['llTopLand', 'llBot']),
      llBot: N([LL.x, SVC, LL.zFace + 0.35], ['llTop', 'llBotLand']),
      llBotLand: N([LL.x, SVC, LL.zFace + 0.75], ['llBot', 'B_mid']),
      B_mid: N([0, SVC, LL.zFace + 0.75], ['llBotLand', 'B_servers', 'B_tanks']),
      B_servers: N([0, SVC, -8.0], ['B_mid']),
      B_tanks: N([0, SVC, 2.0], ['B_mid']),
      L_sleep: N([WALK, LOW, -11.0], ['L_bath']),
      L_bath: N([WALK, LOW, -8.0], ['L_sleep', 'L_galley', 'B_in']),
      B_in: N([-0.9, LOW, -8.5], ['L_bath']),
      L_galley: N([WALK, LOW, -5.0], ['L_bath', 'L_lounge', 'G_in', 'D_in', 'luBotLand', 'llTopLand']),
      G_in: N([-0.6, LOW, -5.35], ['L_galley']),
      D_in: N([0.85, LOW, -3.4], ['L_galley', 'L_lounge']),
      L_lounge: N([WALK, LOW, -0.8], ['L_galley', 'D_in', 'Lo_in', 'De_in', 'L_lab']),
      Lo_in: N([-0.6, LOW, -0.1], ['L_lounge']),
      De_in: N([-1.3, LOW, DZ], ['L_lounge']),
      L_lab: N([WALK, LOW, 2.3], ['L_lounge', 'Lab_in', 'L_suit']),
      Lab_in: N([-1.0, LOW, 2.8], ['L_lab']),
      L_suit: N([WALK, LOW, 6.3], ['L_lab', 'W_in', 'L_air']),
      W_in: N([-0.9, LOW, 5.95], ['L_suit']),
      L_air: N([WALK, LOW, 9.5], ['L_suit', 'L_store']),
      L_store: N([WALK, LOW, 11.2], ['L_air', 'S_in']),
      S_in: N([-0.5, LOW, 11.2], ['L_store']),
    },
    // Ladder segments: turn to face the ladder (yaw 0, facing -z), mount, climb rung by rung, and dismount.
    ladders: [
      { topLand: 'luTopLand', top: 'luTop', bottom: 'luBot', bottomLand: 'luBotLand', yaw: 0, rung: LU.rung },
      { topLand: 'llTopLand', top: 'llTop', bottom: 'llBot', bottomLand: 'llBotLand', yaw: 0, rung: LL.rung },
    ],
    spots: {
      seat: { node: 'seatSide', pos: [-0.55, UP, -11.55], yaw: 0 },
      navtable: { node: 'U_nav', pos: [-0.5, UP, -7.6], yaw: PI / 2 },
      bunk: { node: 'L_sleep', pos: [-1.45, 0.72, -11.0], yaw: -PI / 2 },
      shower: { node: 'B_in', pos: [-2.75, 0.08, -8.5], yaw: -PI / 2 },
      stove: { node: 'G_in', pos: [-2.2, LOW, -5.35], yaw: PI / 2 },
      dining: { node: 'D_in', pos: [0.12, LOW, -3.4], yaw: PI / 2 },
      sofa: { node: 'Lo_in', pos: [-2.72, LOW, -0.85], yaw: -PI / 2 },
      desk: { node: 'De_in', pos: [-2.3, LOW, DZ], yaw: PI / 2 },
      microscope: { node: 'Lab_in', pos: [-2.2, LOW, 2.4], yaw: PI / 2 },
      labBench: { node: 'Lab_in', pos: [-2.2, LOW, 3.3], yaw: PI / 2 },
      whiteboard: { node: 'L_lab', pos: [-0.75, LOW, Z.lab + 0.6], yaw: 0 },
      hydro: { node: 'Lab_in', pos: [-2.0, LOW, Z.suit - 0.85], yaw: PI },
      bench: { node: 'W_in', pos: [-1.95, LOW, Z.suit + 1.15], yaw: 0 },
      storage: { node: 'S_in', pos: [-2.15, LOW, 11.2], yaw: PI / 2 },
      fuel: { node: 'B_tanks', pos: [-0.45, SVC, 2.0], yaw: PI / 2 },
      servers: { node: 'B_servers', pos: [0.0, SVC, -8.0], yaw: PI / 2 },
    },
  };
  // Anything standing on a walking path is a layout mistake: list it (ship.blockedPaths). Destination furniture (seat,
  // bed, sofa, chairs) is expected at the very end of a spot's approach.
  const blocked = [];
  const deckFor = y => y > UP - 0.5 ? 'up' : y < -1 ? 'svc' : 'low';
  function checkSeg(deck, a, c, r, what) {
    const dx = c[0] - a[0], dz = c[2] - a[2], L2 = dx * dx + dz * dz || 1e-6;
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (grid[deck][k * NX + i]) {
      const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (k + 0.5) * CELL, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / L2));
      if (t > 0.02 && t < 0.98 && Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz) < r) blocked.push(what + ' @ ' + x.toFixed(2) + ',' + z.toFixed(2));
    }
  }
  const ladderNodes = new Set(layout.ladders.flatMap(l => [l.top, l.bottom]));
  for (const [id, n] of Object.entries(layout.nodes)) for (const l of n.links) { const m = layout.nodes[l]; if (Math.abs(m.pos[1] - n.pos[1]) < 0.1 && !ladderNodes.has(id) && !ladderNodes.has(l)) checkSeg(deckFor(n.pos[1]), n.pos, m.pos, 0.2, id + '-' + l); }
  for (const [id, sp] of Object.entries(layout.spots)) { const n = layout.nodes[sp.node]; checkSeg(deckFor(n.pos[1]), n.pos, sp.pos, 0.15, id); }

  b.build(inside);

  // ---------- Helpers ----------
  function chair(x, z, ry, stool = false, floor = LOW) {
    const g = new THREE.Group();
    g.add(mesh(box(0.44, 0.05, 0.44, 0.02), stool ? coralFab : wood, [0, 0.46, 0]));
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.add(mesh(cyl(0.022, 0.022, 0.45, 6), steel, [dx, 0.225, dz]));
    if (!stool) g.add(mesh(box(0.42, 0.45, 0.04, 0.02), wood, [0, 0.72, 0.2]));
    g.position.set(x, floor, z); g.rotation.set(0, ry, 0); g.updateMatrixWorld();
    g.traverse(o => { if (o.isMesh) { const w = new THREE.Mesh(o.geometry, o.material); w.applyMatrix4(o.matrixWorld); b.addMesh(w); } });
    mark(deckOf(floor), x - 0.26, x + 0.26, z - 0.26, z + 0.26);
  }
  function plant([x, y, z], size, withPot = true) {
    if (withPot) { b.add(cyl(0.2 * size, 0.15 * size, 0.35 * size, 12), pot, [x, y + 0.175 * size, z]); b.add(new THREE.TorusGeometry(0.2 * size, 0.025 * size, 6, 16), pot, [x, y + 0.35 * size, z], [PI / 2, 0, 0]); }
    const base = y + (withPot ? 0.35 : 0) * size;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, h = 0.15 + (i % 3) * 0.12;
      b.add(lowBall, i % 2 ? leaf : leaf2, [x + Math.cos(a) * 0.12 * size, base + h * size, z + Math.sin(a) * 0.12 * size], [0.6 * Math.cos(a), a, 0.6 * Math.sin(a)], [0.07 * size, 0.2 * size, 0.04 * size]);
    }
  }
  function suit(x, z, i) {
    const s = solid('#EDE6D6', { roughness: 0.85 }), dk = solid('#8E8A80', { roughness: 0.9 });
    b.add(new THREE.CapsuleGeometry(0.24, 0.35, 6, 14), s, [x, 1.45, z], [0, 0, 0], [0.75, 1, 1]);
    b.add(box(0.22, 0.55, 0.42, 0.06), solid('#C9C2B2'), [x - 0.13, 1.5, z]);
    for (const sz of [-1, 1]) {
      b.add(new THREE.CapsuleGeometry(0.09, 0.45, 4, 10), s, [x, 1.25, z + sz * 0.3], [sz * 0.08, 0, 0]);
      b.add(sphere, dk, [x, 0.95, z + sz * 0.32], [0, 0, 0], [0.07, 0.08, 0.07]);
      b.add(new THREE.CapsuleGeometry(0.1, 0.45, 4, 10), s, [x, 0.75, z + sz * 0.12]);
    }
    b.add(cyl(0.05, 0.05, 0.04, 12), solid(['#FF7A59', '#3FA7B5', '#F2B33D'][i]), [x + 0.2, 1.6, z - 0.12], [0, 0, PI / 2]);
    b.add(new THREE.TorusGeometry(0.2, 0.035, 6, 16), solid('#6B4A33'), [x, 1.12, z], [PI / 2, 0, 0]);
    b.add(new THREE.TorusGeometry(0.12, 0.012, 4, 12, PI), steel, [x, 1.98, z]);
  }
  function puffGroup(x, y, z, rise) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i < 6; i++) { const s = sprite('#FFFFFF', 0.3, 0.3, true); s.userData = { t: i / 6, rise }; g.add(s); }
    return g;
  }

  // ---------- Live bits ----------
  let t = 0, framesKey = '';
  const blinkers = [lampMesh, overLampMesh, ledMesh, serverLedMesh];
  return {
    layout, ladders: ladderInfo, props: { pan, steam, bowl, showerSteam, bubbles }, clickables: [screens.budget], blocked,
    airlock: { innerDoor, hatch, wheel, statusRed, statusGreen },
    setGems(total) { gems.count = Math.round(slots.length * (1 - Math.exp(-total / 15000))); jarGlow.material.opacity = gems.count ? 0.2 + 0.3 * gems.count / slots.length : 0; },
    setPantry(months, has) { pantry.count = has ? Math.min(pantrySlots.length, Math.round(pantrySlots.length * Math.min(1, months / 6))) : 0; },
    setGoals(goals) {
      const key = JSON.stringify(goals.map(g => [g.name, Math.round(g.progress * 100), g.color]));
      if (key !== framesKey) {
        framesKey = key; frames.clear();
        goals.slice(0, 6).forEach((g, i) => {
          const zc = -1.55 + (i % 2) * 0.72, h = 2.5 - Math.floor(i / 2) * 0.58;
          frames.add(mesh(box(0.04, 0.5, 0.64, 0.015), darkWood, [FACE + 0.02, h, zc]));
          frames.add(mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ map: T.progressTexture(g.name, g.progress, g.color) }), [FACE + 0.045, h, zc], [0, PI / 2, 0]));
        });
      }
      trophies.clear();
      const done = goals.filter(g => g.progress >= 1).length;
      for (let i = 0; i < Math.min(5, done); i++) trophies.add(mesh(cup, goldMat(), [-3.18, 2.365, -0.45 + i * 0.18]));
    },
    update(dt, { reduced, visible }) {
      t += dt;
      if (!visible) return;
      if (!reduced) {
        for (const s of Object.values(screensTex)) s.update?.(t);
        budget.update(t + 3);
        holo.rotation.z += dt * 0.4; holoPlanet.rotation.y += dt * 0.3;
        // Subtle blinking: the lamps dim a little now and then; nothing flashes.
        blinkers.forEach((m, i) => { m.material.opacity = 0.72 + 0.13 * Math.sin(t * (0.9 + i * 0.37) + i * 2); });
        for (const [i, l] of tankGlow.entries()) l.material.opacity = 0.45 + Math.sin(t * 0.8 + i * 2) * 0.06;
        if (bubbles.visible) rotor.rotation.y += dt * 25;
      }
      for (const g of [steam, showerSteam]) if (g.visible && !reduced) for (const s of g.children) {
        s.userData.t = (s.userData.t + dt * 0.45) % 1; const u = s.userData.t;
        s.position.set(Math.sin(u * 9 + s.id) * 0.08, u * s.userData.rise, Math.cos(u * 7 + s.id) * 0.05); s.scale.setScalar(0.2 + u * 0.4); s.material.opacity = 0.7 * Math.sin(u * PI);
      }
      if (bubbles.visible && !reduced) for (const s of bubbles.children) { s.userData.t = (s.userData.t + dt * 0.6) % 1; const u = s.userData.t; s.position.set(Math.sin(u * 13 + s.id) * 0.02, u * 0.3, 0); s.material.opacity = 0.8 * Math.sin(u * PI); }
    },
  };
}
