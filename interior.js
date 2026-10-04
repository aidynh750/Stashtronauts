// The inside of the ship, built in meters (the ship scales it into place).
// Upper deck: the control room up front under the canopy, then the science lab. Lower deck, front to back: living
// quarters (bunk room, bathroom, galley, lounge with a desk, hydroponics), workshop and suit room, airlock, junk bay,
// and the fuel room. Under the lower floor: a service deck with batteries, water tanks, pipes and cable trays.
// Rooms are a realistic 6.8 m wide: panelled inner walls stand 3.4 m either side of the centre, with short window
// tunnels out to the portholes. Static props are merged per material; repeated small things are instanced.
// Clutter: every static prop marks the floor it covers on a grid; the walking paths (from the waypoint graph) are kept
// clear; then the free floor of every room is filled with boxes, laundry, tools, papers and so on, room by room.
import * as THREE from 'three';

const PI = Math.PI;
const IN = 3.4;              // inner side walls (x = ±IN)
const FACE = -IN + 0.06;     // the room-side face of the far inner wall
const WALK = 1.1;            // the walkway runs along here, through every doorway
const DOOR = [0.5, 1.7];     // doorway span in every cross wall (x)
const COCKPIT = -10.6;       // in front of this the upper deck opens out to the canopy glass
const CTRL_END = -4.0;       // the control room ends here; the science lab is behind it
const UPPER_END = 2.6;       // the upper deck ends here; behind it the rooms are double height
const REAR = 12.6;           // rear bulkhead, in front of the engine
const SVC = -2.35;           // the service deck's grating, under the lower floor

export function buildInterior(inside, K) {
  const { UP, LOW, CEIL, hwM, deckGeometry, hullMat, solid, basic, geo, mesh, makeBatch, sprite, T, goldMat, wins } = K;
  const b = makeBatch(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), vv = new THREE.Vector3(), ss = new THREE.Vector3();
  const box = (w, h, d, r) => geo.box(w, h, d, r ?? Math.min(0.03, w / 4, h / 4, d / 4));
  const cyl = (r0, r1, h, seg = 16) => geo.cyl(r0, r1, h, seg);
  const sphere = new THREE.SphereGeometry(1, 16, 12), lowBall = new THREE.IcosahedronGeometry(1, 0), blob = new THREE.IcosahedronGeometry(1, 1);
  let rs = 1234567; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647); // seeded, so the clutter is the same every visit
  const pick = a => a[Math.floor(rnd() * a.length)];

  // ---------- Floor grid: what's covered, and what must stay clear ----------
  const CELL = 0.25, GX0 = -4.75, GZ0 = -16.5, NX = 38, NZ = 122;
  const DECKS = { svc: SVC, low: LOW, up: UP };
  const grid = { svc: new Uint8Array(NX * NZ), low: new Uint8Array(NX * NZ), up: new Uint8Array(NX * NZ) }; // 0 free, 1 covered, 2 path, 3 keep empty
  const deckOf = y => Object.keys(DECKS).find(k => y >= DECKS[k] - 0.15 && y < DECKS[k] + 1.15);
  const cellRange = (a0, a1, g0, n) => [Math.max(0, Math.floor((a0 - g0) / CELL)), Math.min(n - 1, Math.floor((a1 - g0) / CELL))];
  function mark(deck, x0, x1, z0, z1, v = 1) {
    if (!deck) return;
    const g = grid[deck], [i0, i1] = cellRange(x0, x1, GX0, NX), [k0, k1] = cellRange(z0, z1, GZ0, NZ);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) g[k * NX + i] = Math.max(g[k * NX + i], v);
  }
  const free = (deck, i, k) => i >= 0 && k >= 0 && i < NX && k < NZ && grid[deck][k * NX + i] === 0;
  const bb = new THREE.Box3();
  function cover(g, pos, rot, scale) {
    if (!g.boundingBox) g.computeBoundingBox();
    m4.compose(vv.set(...pos), qq.setFromEuler(ee.set(...rot)), typeof scale === 'number' ? ss.setScalar(scale) : ss.set(...scale));
    bb.copy(g.boundingBox).applyMatrix4(m4);
    const deck = deckOf(bb.min.y);
    if (deck && bb.max.y - bb.min.y > 0.05) mark(deck, bb.min.x, bb.max.x, bb.min.z, bb.max.z);
  }
  const put = (g, m, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) => { cover(g, pos, rot, scale); b.add(g, m, pos, rot, scale); };
  function inst(g, m, list, { covers = true } = {}) {
    const im = new THREE.InstancedMesh(g, m, Math.max(1, list.length));
    list.forEach((it, i) => {
      const rot = it.rot || [0, 0, 0], sc = it.scale ?? [1, 1, 1];
      if (covers) cover(g, it.pos, rot, sc);
      im.setMatrixAt(i, m4.compose(vv.set(...it.pos), qq.setFromEuler(ee.set(...rot)), typeof sc === 'number' ? ss.setScalar(sc) : ss.set(...sc)));
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
  const cream = solid('#FFF3DF'), white = solid('#FFFFFF', { roughness: 0.35 }), tile = solid('#FFFFFF', { map: T.tileTexture(), roughness: 0.3 });
  const steel = solid('#AEB7C8', { metalness: 0.55, roughness: 0.35 }), darkSteel = solid('#59627A', { metalness: 0.5, roughness: 0.45 });
  const dark = solid('#2B3550', { roughness: 0.6 }), teal = solid('#3FA7B5'), coral = solid('#FF7A59'), mustard = solid('#F2B33D'), red = solid('#E05A4F');
  const tealFab = solid('#FFFFFF', { map: T.fabricTexture('#3FA7B5', '#4FB9C7'), roughness: 0.9 });
  const coralFab = solid('#FFFFFF', { map: T.fabricTexture('#F08A66', '#F59C7C'), roughness: 0.9 });
  const greyFab = solid('#FFFFFF', { map: T.fabricTexture('#8E97AA', '#9AA3B6'), roughness: 0.95 });
  const leaf = solid('#5BAF6A', { roughness: 0.8, flatShading: true }), leaf2 = solid('#3E8C5E', { roughness: 0.8, flatShading: true }), pot = solid('#C9744A');
  const counterTop = solid('#DCE3EC', { roughness: 0.3 }), tarp = solid('#5E8C8C', { roughness: 0.95, flatShading: true });
  const glass = solid('#BFE9FF', { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const glow = c => basic(c), hazard = solid('#FFFFFF', { map: T.hazardTexture() });
  const grate = solid('#FFFFFF', { map: T.grateTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.4 });
  const crateMat = solid('#FFFFFF', { map: T.crateTexture(), roughness: 0.85 });
  const paint = solid('#FFFFFF', { roughness: 0.6 });                     // instanced things that take their own colour

  // ---------- Floors, ceilings and walls ----------
  const hole = [2.0, 3.2, -5.75, -4.3];
  inside.add(new THREE.Mesh(deckGeometry(LOW, 0.3, null, -12.7, REAR + 0.1), plate));
  inside.add(new THREE.Mesh(deckGeometry(UP, 0.5, hole, -Infinity, UPPER_END), floorMat));
  inside.add(new THREE.Mesh(deckGeometry(CEIL + 0.12, 0.12, null, -13.0, UPPER_END), hullMat('#E9E1D3'))); // opens with the hull
  inside.add(new THREE.Mesh(deckGeometry(SVC, 0.06, null, -12.7, REAR + 0.1), grate));
  // Inner side walls, made of panels, with an opening and a short tunnel out to each porthole.
  function sideWall(s, h0, h1, z0, z1, winH, winZ) {
    for (let z = z0; z < z1 - 0.01; z += 1.2) {
      const zc = z + 0.6;
      if (!winZ.some(w => Math.abs(w - zc) < 1.0)) { b.add(box(0.12, h1 - h0, 1.18, 0.03), innerWall, [s * IN, (h0 + h1) / 2, zc]); mark(deckOf(h0), s * IN - 0.1, s * IN + 0.1, z, z + 1.2); continue; }
      b.add(box(0.12, winH - 0.75 - h0, 1.18, 0.03), innerWall, [s * IN, (h0 + winH - 0.75) / 2, zc]);
      b.add(box(0.12, h1 - winH - 0.75, 1.18, 0.03), innerWall, [s * IN, (winH + 0.75 + h1) / 2, zc]);
      mark(deckOf(h0), s * IN - 0.1, s * IN + 0.1, z, z + 1.2);
    }
    for (const w of winZ) if (w > z0 && w < z1) {                        // the tunnel out to the porthole
      const outer = hwM(winH, w) - 0.05, len = outer - IN, xc = s * (IN + len / 2);
      for (const dh of [-0.68, 0.68]) b.add(box(len, 0.06, 1.42, 0.01), innerWall, [xc, winH + dh, w]);
      for (const dz of [-0.68, 0.68]) b.add(box(len, 1.42, 0.06, 0.01), innerWall, [xc, winH, w + dz]);
      b.add(box(0.14, 0.08, 1.5, 0.02), darkWood, [s * (IN + 0.03), winH - 0.72, w]);   // a little sill
    }
  }
  for (const s of [-1, 1]) {
    sideWall(s, LOW, 3.0, -12.6, 6.45, 1.6, wins.low);
    sideWall(s, 3.0, 6.5, UPPER_END, 6.45, 5.1, []);
    sideWall(s, UP, CEIL, COCKPIT, UPPER_END, 5.1, wins.up);
    b.add(box(0.2, CEIL - UP, 0.2, 0.04), steel, [s * IN, (UP + CEIL) / 2, COCKPIT]);    // where the canopy opens out
  }
  // A cross wall shaped to the hull at z, from h0 to h1, with a doorway on the walkway (or nothing).
  function crossWall(z, h0, h1, { door = true, x0 = -Infinity, x1 = Infinity, m = wall } = {}) {
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
      for (const x of DOOR) b.add(box(0.12, 2.25, 0.2, 0.03), steel, [x, h0 + 1.12, z]);
      b.add(box(DOOR[1] - DOOR[0] + 0.24, 0.12, 0.2, 0.03), steel, [(DOOR[0] + DOOR[1]) / 2, h0 + 2.2, z]);
    }
  }
  crossWall(-12.6, LOW, 3.0, { door: false });                  // front of the lower deck
  crossWall(-13.0, CEIL, 7.7, { door: false, m: innerWall });   // the header over the cockpit
  crossWall(-9.2, LOW, 3.0);                                     // bunk room | bathroom
  crossWall(-6.8, LOW, 3.0);                                     // bathroom | galley
  crossWall(UPPER_END, LOW, 3.0);                                // living quarters | workshop
  crossWall(CTRL_END, UP, CEIL);                                 // control room | science lab
  crossWall(UPPER_END, UP, CEIL, { door: false });               // back of the lab
  crossWall(10.8, LOW, 6.5);                                     // junk bay | fuel room
  crossWall(REAR, LOW, 7.2, { door: false, m: solid('#D9D2C3', { side: THREE.DoubleSide }) });

  // A worn rubber runner down the lower walkway and along the upper deck.
  for (const [h, z0, z1] of [[LOW, -12.5, 12.4], [UP, -11.2, 2.5]]) b.add(new THREE.PlaneGeometry(1.05, z1 - z0), solid('#FFFFFF', { map: T.rugTexture('#5E6A7A', '#4A5566', '#F2B33D'), roughness: 0.9 }), [WALK, h + 0.008, (z0 + z1) / 2], [-PI / 2, 0, 0]);
  // ---------- Lights, pipes and cable trays ----------
  for (const [h, z] of [[2.7, -9.5], [2.7, -2.5], [2.7, 5], [5.8, 10.5], [6.1, -10], [6.1, -1.5], [-0.6, -5], [-0.6, 5]]) { const l = new THREE.PointLight('#FFE2B8', h < 0 ? 3 : 7, 8, 1.4); l.position.set(0, h, z); inside.add(l); }
  for (let z = -11; z < 2.5; z += 3.0) b.add(cyl(0.2, 0.24, 0.05, 16), glow('#FFE9C2'), [0, 2.97, z]);
  for (let z = -11.5; z < 2.5; z += 3.0) b.add(cyl(0.2, 0.24, 0.05, 16), hullMat('#FFE9C2', { emissive: '#FFE9C2', emissiveIntensity: 1 }), [0, CEIL, z]);
  for (const [h, z0, z1] of [[2.78, -12.4, 6.4], [6.28, -12.8, 2.5]]) {
    for (const [dx, r, m] of [[0.12, 0.07, steel], [0.34, 0.05, coral], [0.52, 0.04, darkSteel], [0.68, 0.025, dark]]) b.add(cyl(r, r, z1 - z0, 8), m, [-IN + dx, h, (z0 + z1) / 2], [PI / 2, 0, 0]);
    for (let z = z0 + 0.5; z < z1; z += 2.0) b.add(box(0.75, 0.04, 0.08, 0.01), dark, [-IN + 0.4, h - 0.1, z]);
  }
  const labels = [];
  const label = (text, x, h, z, ry, w = 0.5) => labels.push([text, x, h, z, ry, w]);
  const posterTex = new Map(), posterOf = kind => posterTex.get(kind) || (posterTex.set(kind, T.posterTexture(kind)), posterTex.get(kind));
  function poster(x, y, z, kind, ry, scale = 0.6, tilt = 0) {
    const o = Math.sin(ry), c = Math.cos(ry);
    b.add(box(0.05, 1.25 * scale, 1.0 * scale, 0.015), darkWood, [x + o * 0.02, y, z + c * 0.02], [tilt, ry - PI / 2, 0]);
    b.add(new THREE.PlaneGeometry(0.86 * scale, 1.12 * scale), solid('#FFFFFF', { map: posterOf(kind) }), [x + o * 0.05, y, z + c * 0.05], [0, ry, tilt]);
  }
  // Unframed posters taped up, overlapping a little.
  function taped(x, y, z, kind, ry, scale = 0.5, tilt = 0, off = 0) {
    b.add(new THREE.PlaneGeometry(0.86 * scale, 1.12 * scale), solid('#FFFFFF', { map: posterOf(kind), side: THREE.DoubleSide }), [x + Math.sin(ry) * (0.015 + off), y, z + Math.cos(ry) * (0.015 + off)], [0, ry, tilt]);
  }

  // ================= UPPER DECK: CONTROL ROOM (under the canopy) =================
  // The nose console fills the floor out to the glass; the dashboard faces the seats.
  for (let z = -13.0; z > -16.5; z -= 0.3) {
    let hgt = 0.8; while (hgt > 0.2 && hwM(UP + hgt + 0.05, z - 0.3) < 0.6) hgt -= 0.1;
    const w = Math.min(hwM(UP + 0.02, z - 0.3), hwM(UP + hgt + 0.05, z - 0.3)) - 0.15; if (w < 0.4) break;
    b.add(box(2 * w, hgt, 0.32, 0.04), dark, [0, UP + hgt / 2, z - 0.15]);
    b.add(box(2 * w - 0.1, 0.05, 0.3, 0.02), solid('#3A4560'), [0, UP + hgt + 0.02, z - 0.15]);
  }
  mark('up', -4, 4, -16, -12.95);
  const DZ = -12.95;                                    // the face of the dashboard
  b.add(box(5.6, 0.95, 0.85, 0.12), dark, [0, UP + 0.47, DZ - 0.42]);
  b.add(box(5.5, 0.07, 0.95, 0.03), solid('#3A4560'), [0, UP + 0.98, DZ - 0.42], [0.3, 0, 0]);
  const dashY = z => UP + 1.02 + (DZ - 0.42 - z) * 0.31;  // the sloped top, higher towards the glass
  const switches = [], dials = [], sliders = [];
  for (let i = 0; i < 32; i++) { const x = -2.5 + (i % 16) * 0.1, z = DZ - 0.25 - Math.floor(i / 16) * 0.13; switches.push({ pos: [x, dashY(z) + 0.02, z], rot: [0.3 + (i % 3 ? 0.3 : -0.3), 0, 0], color: ['#E8E2D4', '#FF7A59', '#7FE0C2'][i % 3] }); }
  for (let i = 0; i < 18; i++) { const x = 0.95 + (i % 9) * 0.17, z = DZ - 0.25 - Math.floor(i / 9) * 0.14; switches.push({ pos: [x, dashY(z) + 0.02, z], rot: [0.3 + (i % 2 ? 0.3 : -0.3), 0, 0], color: '#E8E2D4' }); }
  inst(box(0.025, 0.06, 0.025, 0.008), paint, switches, { covers: false });
  for (const x of [-2.3, -1.95, 2.0, 2.35]) dials.push({ pos: [x, dashY(DZ - 0.6) + 0.03, DZ - 0.6], rot: [0.3, 0, 0] });
  inst(cyl(0.12, 0.12, 0.03, 20), solid('#F5F1E8'), dials, { covers: false });
  for (const d of dials) b.add(box(0.012, 0.012, 0.09, 0.003), red, [d.pos[0] + 0.02, d.pos[1] + 0.022, d.pos[2] + 0.01], [0.3, 0.7, 0]);
  for (let i = 0; i < 6; i++) { const x = -1.4 + i * 0.12, z = DZ - 0.2; b.add(box(0.03, 0.01, 0.28, 0.005), dark, [x, dashY(z) + 0.01, z], [0.3, 0, 0]); sliders.push({ pos: [x, dashY(z + 0.1 * (i % 3 - 1)) + 0.03, z + 0.1 * (i % 3 - 1)], rot: [0.3, 0, 0], color: ['#7FE0C2', '#FFC56B', '#FF9DAE'][i % 3] }); }
  inst(box(0.06, 0.035, 0.05, 0.01), paint, sliders, { covers: false });
  const chart = T.screenTexture(), navTex = T.starMapTexture(), statusTex = T.statusTexture();
  const screens = [];
  for (const [x, tex, ry] of [[-1.1, navTex.texture, 0.25], [0, chart.texture, 0], [1.1, statusTex.texture, -0.25]]) {
    const z = DZ - 0.72 + Math.abs(x) * 0.12;
    b.add(box(0.95, 0.56, 0.06, 0.03), dark, [x, UP + 1.33, z - 0.035], [-0.3, ry, 0]);
    const sc = mesh(new THREE.PlaneGeometry(0.85, 0.48), new THREE.MeshBasicMaterial({ map: tex }), [x, UP + 1.33, z], [-0.3, ry, 0]);
    inside.add(sc); screens.push(sc);
  }
  for (const s of [-1, 1]) {                                                       // side consoles in the canopy wings
    b.add(box(0.75, 0.85, 1.8, 0.06), dark, [s * 3.35, UP + 0.43, -11.9]);
    b.add(box(0.7, 0.05, 1.75, 0.02), solid('#3A4560'), [s * 3.33, UP + 0.88, -11.9], [0, 0, s * 0.35]);
    b.add(new THREE.PlaneGeometry(0.4, 0.55), new THREE.MeshBasicMaterial({ map: s < 0 ? statusTex.texture : navTex.texture }), [s * 3.3, UP + 0.92, -11.9], [-PI / 2, 0, s * 0.35]);
    for (let i = 0; i < 6; i++) b.add(cyl(0.03, 0.03, 0.04, 8), [coral, teal, mustard][i % 3], [s * (3.15 + (i % 2) * 0.18), UP + 0.93, -12.6 + Math.floor(i / 2) * 0.2]);
  }
  for (const [x, main] of [[-0.8, true], [0.9, false]]) {                      // pilot and co-pilot seats with harnesses
    const z = -12.0;
    b.add(cyl(0.12, 0.16, 0.3, 10), darkSteel, [x, UP + 0.15, z]);
    b.add(box(0.6, 0.12, 0.58, 0.06), dark, [x, UP + 0.33, z]);
    b.add(box(0.62, 0.1, 0.6, 0.05), main ? tealFab : greyFab, [x, UP + 0.43, z]);
    b.add(box(0.6, 0.95, 0.14, 0.07), main ? tealFab : greyFab, [x, UP + 0.95, z + 0.34], [-0.1, 0, 0]);
    b.add(box(0.34, 0.22, 0.14, 0.06), main ? tealFab : greyFab, [x, UP + 1.55, z + 0.38], [-0.1, 0, 0]);
    for (const s of [-1, 1]) {
      b.add(box(0.07, 0.06, 0.5, 0.02), dark, [x + s * 0.34, UP + 0.64, z]);
      b.add(box(0.035, 0.5, 0.012, 0.005), solid('#E59A2E'), [x + s * 0.08, UP + 0.86, main ? z - 0.16 : z + 0.26], [0.05, 0, s * 0.3]);
    }
    b.add(box(0.1, 0.08, 0.03, 0.01), steel, [x, UP + 0.62, main ? z - 0.18 : z + 0.24]);
    mark('up', x - 0.33, x + 0.33, z - 0.3, z + 0.45);
  }
  b.add(cyl(0.035, 0.045, 0.55, 8), steel, [-0.8, UP + 0.65, -12.62], [0.4, 0, 0]);   // control yoke
  b.add(new THREE.TorusGeometry(0.17, 0.03, 8, 18, PI), dark, [-0.8, UP + 0.92, -12.55], [0.4, 0, PI]);
  b.add(cyl(0.04, 0.05, 0.3, 8), steel, [0.9, UP + 0.6, -12.62], [0.3, 0, 0]); b.add(sphere, dark, [0.9, UP + 0.78, -12.66], [0, 0, 0], 0.05);
  b.add(cyl(0.05, 0.045, 0.1, 12), coral, [2.2, UP + 1.03, DZ - 0.2]); b.add(new THREE.TorusGeometry(0.035, 0.01, 6, 10), coral, [2.26, UP + 1.03, DZ - 0.2]); // a mug on the dash
  for (const [x, ry] of [[-2.55, 0.3], [2.5, -0.2]]) b.add(lowBall, solid(x < 0 ? '#FFC56B' : '#FF9DAE', { flatShading: true }), [x, UP + 1.06, DZ - 0.15], [0, ry, 0], [0.05, 0.05, 0.05]); // dashboard trinkets
  // Overhead panel over the seats.
  b.add(box(3.0, 0.22, 0.75, 0.06), dark, [0, CEIL - 0.6, -12.3]);
  for (const x of [-1.3, 1.3]) b.add(cyl(0.03, 0.03, 0.5, 6), steel, [x, CEIL - 0.25, -12.3]);
  const overhead = [];
  for (let i = 0; i < 24; i++) overhead.push({ pos: [-1.3 + (i % 12) * 0.22, CEIL - 0.72, -12.5 + Math.floor(i / 12) * 0.3], color: ['#7FE0C2', '#FFC56B', '#FF9DAE', '#83CBEE'][i % 4] });
  inst(box(0.06, 0.03, 0.06, 0.01), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), overhead, { covers: false });
  // Equipment racks with blinking lights against the far wall.
  const leds = [];
  for (const z of [-10.1, -9.5, -8.9]) {
    b.add(box(0.6, 2.2, 0.58, 0.03), darkSteel, [-IN + 0.36, UP + 1.1, z]); mark('up', -IN, -IN + 0.66, z - 0.3, z + 0.3);
    for (let r = 0; r < 8; r++) { b.add(box(0.02, 0.18, 0.5, 0.005), dark, [-IN + 0.67, UP + 0.3 + r * 0.24, z]); for (let i = 0; i < 4; i++) leds.push({ pos: [-IN + 0.685, UP + 0.33 + r * 0.24, z - 0.18 + i * 0.07], color: ['#7FE0C2', '#FFC56B', '#7FE0C2', '#FF5A5A'][(r + i) % 4] }); }
  }
  const ledMesh = inst(new THREE.BoxGeometry(0.01, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), leds, { covers: false });
  // Navigation table with a glowing star map and a hologram.
  put(box(2.0, 0.85, 1.2, 0.06), dark, [-1.75, UP + 0.43, -7.6]);
  b.add(box(2.05, 0.06, 1.25, 0.03), steel, [-1.75, UP + 0.88, -7.6]);
  inside.add(mesh(new THREE.PlaneGeometry(1.85, 1.08), new THREE.MeshBasicMaterial({ map: navTex.texture }), [-1.75, UP + 0.915, -7.6], [-PI / 2, 0, 0]));
  const holo = mesh(new THREE.TorusGeometry(0.28, 0.008, 6, 40), new THREE.MeshBasicMaterial({ color: '#7FE0C2', transparent: true, opacity: 0.7 }), [-1.75, UP + 1.25, -7.6], [PI / 2, 0, 0]);
  const holoPlanet = mesh(sphere, new THREE.MeshBasicMaterial({ color: '#7FE0C2', transparent: true, opacity: 0.35, wireframe: true }), [-1.75, UP + 1.25, -7.6], [0, 0, 0], 0.13);
  inside.add(holo, holoPlanet);
  // Comms station: desk, radios, a screen, a microphone, a chair, and a headset on a hook.
  put(box(0.75, 0.75, 1.55, 0.04), darkWood, [-IN + 0.43, UP + 0.375, -5.42]);
  b.add(box(0.5, 0.25, 0.6, 0.03), darkSteel, [-IN + 0.33, UP + 0.88, -5.8]); b.add(box(0.45, 0.2, 0.5, 0.03), steel, [-IN + 0.33, UP + 1.1, -5.8]);
  for (const z of [-5.95, -5.65]) b.add(cyl(0.035, 0.035, 0.03, 12), solid('#F5F1E8'), [-IN + 0.6, UP + 0.88, z], [0, 0, PI / 2]);
  b.add(box(0.06, 0.38, 0.56, 0.02), dark, [-IN + 0.1, UP + 1.3, -5.05]);
  inside.add(mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ map: statusTex.texture }), [-IN + 0.14, UP + 1.3, -5.05], [0, PI / 2, 0]));
  b.add(cyl(0.012, 0.012, 0.25, 6), steel, [-IN + 0.6, UP + 0.87, -5.0], [0, 0, 0.3]); b.add(sphere, dark, [-IN + 0.64, UP + 1.0, -5.0], [0, 0, 0], 0.03);
  chair(-IN + 1.3, -5.42, PI / 2, false, false, UP);
  b.add(box(0.04, 0.04, 0.12, 0.01), steel, [FACE + 0.02, UP + 1.55, -6.6]);
  b.add(new THREE.TorusGeometry(0.1, 0.012, 6, 16, PI), dark, [FACE + 0.08, UP + 1.47, -6.6], [0, PI / 2, PI]);
  for (const s of [-1, 1]) b.add(cyl(0.04, 0.04, 0.03, 12), coral, [FACE + 0.08, UP + 1.38, -6.6 + s * 0.1], [PI / 2, 0, 0]);
  // Lockers on the back wall, the ladder (with its hole railing), a wall chart, cables and warning labels.
  for (let i = 0; i < 3; i++) { const x = -3.0 + i * 0.6; put(box(0.55, 2.0, 0.5, 0.03), teal, [x, UP + 1.0, CTRL_END - 0.31]); b.add(box(0.05, 0.25, 0.02, 0.01), steel, [x + 0.15, UP + 1.1, CTRL_END - 0.57]); for (let v = 0; v < 3; v++) b.add(box(0.3, 0.02, 0.01, 0.005), dark, [x, UP + 1.6 + v * 0.05, CTRL_END - 0.565]); }
  for (const [x, z, w, d] of [[2.6, -5.75, 1.25, 0.06], [3.2, -5.0, 0.06, 1.45]]) b.add(box(w, 0.05, d, 0.02), mustard, [x, UP + 1.0, z]);
  for (const [x, z] of [[2.0, -5.75], [3.2, -5.75], [3.2, -4.3]]) b.add(cyl(0.025, 0.025, 1.0, 8), steel, [x, UP + 0.5, z]);
  for (const x of [2.25, 2.95]) b.add(cyl(0.03, 0.03, UP + 1.1, 8), steel, [x, (UP + 1.1) / 2, -4.45]);     // ladder rails
  for (let h = 0.3; h < UP + 0.1; h += 0.3) b.add(cyl(0.022, 0.022, 0.7, 6), steel, [2.6, h, -4.45], [0, 0, PI / 2]);
  b.add(new THREE.TorusGeometry(0.35, 0.03, 6, 12, PI), steel, [2.6, UP + 1.1, -4.45]);
  poster(-0.7, UP + 1.6, CTRL_END - 0.07, 'map', PI);
  for (const [z, h] of [[-10.0, UP + 2.2], [-6.0, UP + 2.0]]) tube([[-IN + 0.15, h + 0.8, z - 0.6], [-IN + 0.15, h, z], [-IN + 0.15, h + 0.3, z + 0.6], [-IN + 0.15, h + 0.85, z + 1.0]], 0.02, dark, 16);
  label('CAUTION: HOT', FACE, UP + 2.4, -9.5, PI / 2); label('FLIGHT DECK', FACE, UP + 2.45, -6.9, PI / 2, 0.7); label('MIND THE LADDER', 2.6, UP + 1.25, -5.78, PI, 0.55);
  // Near-wall storage in the control room: a low cabinet with a fire extinguisher and a first-aid box on top.
  put(box(0.55, 0.9, 2.2, 0.04), solid('#8E97AA'), [IN - 0.33, UP + 0.45, -8.4]);
  b.add(cyl(0.08, 0.08, 0.45, 12), red, [IN - 0.25, UP + 1.13, -9.2]); b.add(box(0.3, 0.22, 0.25, 0.04), white, [IN - 0.3, UP + 1.01, -8.4]); b.add(box(0.06, 0.16, 0.02, 0.01), red, [IN - 0.44, UP + 1.01, -8.4]);

  // ================= UPPER DECK: SCIENCE LAB =================
  put(box(0.75, 0.9, 3.4, 0.03), solid('#E8EEF2'), [-3.0, UP + 0.45, -1.55]);      // the lab bench along the far wall
  b.add(box(0.8, 0.06, 3.45, 0.02), solid('#2F3B4C', { roughness: 0.3 }), [-3.0, UP + 0.93, -1.55]);
  for (let z = -3.1; z < 0; z += 0.55) { b.add(box(0.02, 0.7, 0.5, 0.02), solid('#CBD6DE'), [-2.62, UP + 0.45, z + 0.27]); b.add(box(0.02, 0.03, 0.15, 0.01), steel, [-2.6, UP + 0.7, z + 0.27]); }
  { const z = -2.55, y = UP + 0.96;                                                 // microscope
    b.add(box(0.22, 0.04, 0.28, 0.02), dark, [-3.05, y + 0.02, z]); b.add(box(0.06, 0.32, 0.06, 0.02), dark, [-3.13, y + 0.18, z]);
    b.add(cyl(0.035, 0.03, 0.22, 10), white, [-3.02, y + 0.33, z], [0, 0, -0.5]); b.add(cyl(0.02, 0.02, 0.1, 8), dark, [-2.95, y + 0.47, z], [0, 0, -0.5]);
    b.add(box(0.12, 0.02, 0.12, 0.01), steel, [-3.0, y + 0.12, z]); b.add(box(0.07, 0.005, 0.02, 0.002), glass, [-3.0, y + 0.135, z]); }
  const rotor = new THREE.Group(); rotor.position.set(-3.05, UP + 1.13, -1.45);    // centrifuge, spins during experiments
  { b.add(cyl(0.2, 0.22, 0.2, 18), white, [-3.05, UP + 1.06, -1.45]); b.add(box(0.12, 0.05, 0.02, 0.01), glow('#7FE0C2'), [-2.85, UP + 1.06, -1.45], [0, PI / 2, 0]);
    rotor.add(mesh(cyl(0.15, 0.15, 0.03, 16), glass)); for (let i = 0; i < 6; i++) rotor.add(mesh(cyl(0.015, 0.015, 0.08, 6), solid(['#FF9DAE', '#7FE0C2', '#FFC56B'][i % 3]), [Math.cos(i) * 0.1, 0.02, Math.sin(i) * 0.1], [0.4 * Math.sin(i), 0, 0.4 * Math.cos(i)]));
    inside.add(rotor); }
  for (let i = 0; i < 4; i++) {                                                     // plants in sealed jars
    const x = -3.12 + (i % 2) * 0.22, z = -0.5 + Math.floor(i / 2) * 0.28, y = UP + 0.96;
    b.add(cyl(0.09, 0.09, 0.24, 14), glass, [x, y + 0.12, z]); b.add(cyl(0.095, 0.095, 0.04, 14), steel, [x, y + 0.26, z]);
    b.add(cyl(0.08, 0.08, 0.04, 12), solid('#4A3426'), [x, y + 0.02, z]);
    for (let k = 0; k < 4; k++) b.add(lowBall, k % 2 ? leaf : leaf2, [x + Math.cos(k * 1.7) * 0.03, y + 0.09 + k * 0.025, z + Math.sin(k * 1.7) * 0.03], [k, k * 2, 0], [0.025, 0.06, 0.02]);
  }
  const vials = [];
  for (let i = 0; i < 10; i++) vials.push({ pos: [-2.75, UP + 1.03, -2.0 + i * 0.05], color: ['#FF9DAE', '#7FE0C2', '#FFC56B', '#83CBEE'][i % 4] });
  b.add(box(0.1, 0.06, 0.55, 0.01), darkSteel, [-2.75, UP + 0.99, -1.78]);
  inst(cyl(0.015, 0.015, 0.12, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), vials, { covers: false });
  for (const [z, c] of [[-1.0, '#7FE0C2'], [-0.85, '#FFC56B'], [-0.7, '#9C8BE0']]) { b.add(new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.065, 0.02], [0.03, 0.12], [0.02, 0.18], [0.025, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 12), glass, [-2.85, UP + 0.96, z]); b.add(cyl(0.05, 0.06, 0.05, 10), glow(c), [-2.85, UP + 0.99, z]); }
  const bubbles = new THREE.Group(); bubbles.position.set(-2.85, UP + 1.12, -0.85); inside.add(bubbles);
  for (let i = 0; i < 5; i++) { const s = sprite('#BFFFE8', 0.08, 0.8); s.userData = { t: i / 5 }; bubbles.add(s); }
  b.add(box(0.3, 0.035, 2.8, 0.01), wood, [-3.2, UP + 1.95, -1.6]);                // a shelf over the bench
  for (const z of [-2.6, -0.6]) b.add(box(0.25, 0.04, 0.04, 0.01), steel, [-3.2, UP + 1.92, z]);
  // Terminals, a sample freezer and a hazard cabinet against the front wall.
  put(box(0.75, 1.0, 0.65, 0.04), white, [-2.95, UP + 0.5, -3.6]);
  b.add(box(0.7, 0.02, 0.02, 0.01), steel, [-2.95, UP + 0.85, -3.27]); b.add(box(0.2, 0.08, 0.02, 0.01), glow('#83CBEE'), [-2.95, UP + 0.93, -3.27]);
  for (let i = 0; i < 3; i++) b.add(lowBall, solid('#DDEFFF', { flatShading: true }), [-3.15 + i * 0.2, UP + 1.03, -3.6 + (i - 1) * 0.08], [i, i, 0], 0.04); // frost
  label('SAMPLES −80°', -2.95, UP + 0.7, -3.26, 0, 0.45);
  put(box(0.6, 1.9, 0.45, 0.04), solid('#F5C542'), [-2.05, UP + 0.95, -3.72]);
  for (const s of [-1, 1]) b.add(box(0.27, 1.8, 0.02, 0.01), mustard, [-2.05 + s * 0.15, UP + 0.95, -3.49]);
  b.add(new THREE.PlaneGeometry(0.36, 0.36), solid('#FFFFFF', { map: T.textTexture('⚠', { w: 128, h: 128, bg: '#F5C542', color: '#2B3550', size: 100 }) }), [-2.05, UP + 1.4, -3.475]);
  label('HAZARDOUS', -2.05, UP + 1.05, -3.475, 0, 0.45);
  put(box(1.4, 0.75, 0.65, 0.04), darkWood, [-0.95, UP + 0.375, -3.62]);
  for (const [x, ry] of [[-1.25, 0.15], [-0.65, -0.15]]) {
    b.add(box(0.55, 0.38, 0.05, 0.02), dark, [x, UP + 1.1, -3.75], [0, ry, 0]); b.add(box(0.06, 0.3, 0.06, 0.02), dark, [x, UP + 0.9, -3.78]);
    inside.add(mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ map: x < -1 ? T.screenTexture({ title: 'SPECTRUM', color: '#9C8BE0' }).texture : statusTex.texture }), [x, UP + 1.1, -3.72], [0, ry, 0]));
  }
  b.add(box(0.45, 0.02, 0.15, 0.01), dark, [-0.95, UP + 0.76, -3.45]);
  chair(-0.95, -2.95, 0, false, false, UP);
  // Glowing specimen tanks against the back wall.
  const tankGlow = [];
  for (const [x, c] of [[-3.0, '#7FE0C2'], [-2.3, '#9C8BE0']]) {
    put(cyl(0.32, 0.34, 0.2, 18), darkSteel, [x, UP + 0.1, 2.15]); b.add(cyl(0.32, 0.32, 0.12, 18), darkSteel, [x, UP + 1.86, 2.15]);
    const liquid = mesh(cyl(0.27, 0.27, 1.5, 18), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55 }), [x, UP + 0.98, 2.15]); inside.add(liquid); tankGlow.push(liquid);
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 1.58, 18, 1, true), glass, [x, UP + 0.98, 2.15]);
    b.add(lowBall, solid('#E8D3B0', { flatShading: true }), [x, UP + 1.0, 2.15], [0.3, 0.5, 0], [0.09, 0.14, 0.07]);  // something floating inside
    for (let k = 0; k < 3; k++) b.add(lowBall, leaf, [x + 0.05 * (k - 1), UP + 0.55 + k * 0.08, 2.15], [k, 0, 0], [0.04, 0.12, 0.02]);
  }
  // The whiteboard on the back wall, with a marker tray.
  b.add(box(1.7, 1.15, 0.04, 0.02), steel, [-0.7, UP + 1.5, UPPER_END - 0.08]);
  b.add(new THREE.PlaneGeometry(1.6, 1.0), solid('#FFFFFF', { map: T.whiteboardTexture(), roughness: 0.25 }), [-0.7, UP + 1.5, UPPER_END - 0.105], [0, PI, 0]);
  b.add(box(1.4, 0.04, 0.08, 0.01), steel, [-0.7, UP + 0.9, UPPER_END - 0.14]);
  for (const [x, c] of [[-1.0, '#1F4E8C'], [-0.85, '#C0392B'], [-0.6, '#2E7D4F']]) b.add(cyl(0.01, 0.01, 0.12, 6), solid(c), [x, UP + 0.93, UPPER_END - 0.14], [0, 0, PI / 2]);
  // A small telescope on a tripod at the porthole, and the holographic star chart in the middle.
  { const x = -2.75, z = 1.15, h = UP + 1.3;
    for (const a of [0, 2.1, 4.2]) b.add(cyl(0.015, 0.015, 1.35, 6), dark, [x + Math.cos(a) * 0.15, UP + 0.65, z + Math.sin(a) * 0.15], [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]);
    b.add(cyl(0.07, 0.055, 0.75, 14), white, [x - 0.15, h + 0.12, z + 0.2], [0, 0, 1.15]); b.add(cyl(0.075, 0.075, 0.05, 14), dark, [x - 0.48, h + 0.26, z + 0.2], [0, 0, 1.15]);
    mark('up', x - 0.25, x + 0.25, z - 0.25, z + 0.3); }
  put(cyl(0.4, 0.45, 0.85, 20), darkSteel, [-1.25, UP + 0.43, 0.45]);
  b.add(cyl(0.38, 0.38, 0.03, 20), glow('#2B6E7A'), [-1.25, UP + 0.87, 0.45]);
  const holoChart = new THREE.Group(); holoChart.position.set(-1.25, UP + 1.35, 0.45); inside.add(holoChart);
  { const hm = new THREE.MeshBasicMaterial({ color: '#9FE8FF', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    holoChart.add(mesh(new THREE.SphereGeometry(0.4, 16, 10), new THREE.MeshBasicMaterial({ color: '#7FE0C2', wireframe: true, transparent: true, opacity: 0.25 })));
    for (let i = 0; i < 40; i++) { const a = rnd() * 2 * PI, r = 0.1 + rnd() * 0.33, y = (rnd() - 0.5) * 0.5; holoChart.add(mesh(sphere, hm, [Math.cos(a) * r, y, Math.sin(a) * r], [0, 0, 0], 0.012 + rnd() * 0.012)); }
    holoChart.add(mesh(new THREE.TorusGeometry(0.42, 0.005, 4, 40), hm, [0, 0, 0], [PI / 2, 0, 0])); }
  // Near-side lab storage: low shelves with sample boxes and a half-built probe.
  put(box(0.5, 1.0, 2.6, 0.03), steel, [IN - 0.3, UP + 0.5, -0.9]);
  for (const h of [0.35, 0.68, 1.0]) b.add(box(0.48, 0.03, 2.55, 0.01), steel, [IN - 0.3, UP + h, -0.9]);
  put(box(0.5, 0.5, 0.5, 0.06), steel, [IN - 0.35, UP + 0.25, 1.5]);
  b.add(sphere, solid('#E8E2D4', { metalness: 0.4 }), [IN - 0.35, UP + 0.68, 1.5], [0, 0, 0], 0.2);
  for (let i = 0; i < 3; i++) b.add(cyl(0.01, 0.01, 0.5, 4), steel, [IN - 0.35 + Math.cos(i * 2.1) * 0.15, UP + 0.85, 1.5 + Math.sin(i * 2.1) * 0.15], [Math.sin(i * 2.1) * 0.6, 0, -Math.cos(i * 2.1) * 0.6]);
  label('SCIENCE LAB', 1.1, UP + 2.4, CTRL_END + 0.07, 0, 0.6); label('NO FOOD IN THE LAB', FACE, UP + 2.2, 0.3, PI / 2, 0.6);
  taped(FACE, UP + 2.0, -2.9, 'diagram', PI / 2, 0.42, 0.05); taped(FACE, UP + 1.9, -2.55, 'safety', PI / 2, 0.4, -0.08, 0.004);

  // ================= LOWER DECK =================
  // ----- Bunk room: bed, locker, clothes rail, bedside table and lamp, rug, a shelf, a laundry line -----
  put(box(2.1, 0.4, 1.0, 0.05), darkWood, [-2.35, 0.2, -11.0]);
  b.add(box(2.0, 0.2, 0.92, 0.08), cream, [-2.35, 0.5, -11.0]);
  b.add(box(1.35, 0.07, 0.96, 0.03), tealFab, [-1.8, 0.63, -11.0]); b.add(box(0.14, 0.1, 0.98, 0.04), tealFab, [-2.47, 0.66, -11.0]);
  b.add(box(0.5, 0.15, 0.68, 0.07), white, [-3.0, 0.68, -11.0]);
  b.add(box(0.1, 0.95, 1.0, 0.04), darkWood, [-3.35, 0.65, -11.0]);
  put(box(0.6, 2.0, 0.6, 0.04), teal, [-3.0, 1.0, -12.2]); for (const s of [-1, 1]) b.add(box(0.27, 1.8, 0.02, 0.01), solid('#4FB9C7'), [-3.0 + s * 0.15, 1.0, -11.89]);
  for (let v = 0; v < 4; v++) b.add(box(0.2, 0.015, 0.01, 0.005), dark, [-2.85, 1.7 + v * 0.04, -11.88]);
  put(box(0.45, 0.45, 0.45, 0.04), wood, [-3.05, 0.225, -10.05]); b.add(cyl(0.07, 0.09, 0.05, 12), dark, [-3.05, 0.47, -10.05]);
  b.add(cyl(0.015, 0.015, 0.28, 6), steel, [-3.05, 0.63, -10.05]); b.add(cyl(0.09, 0.16, 0.16, 12), glow('#FFD9A0'), [-3.05, 0.83, -10.05]);
  b.add(box(0.1, 0.08, 0.14, 0.02), solid('#9C8BE0'), [-2.95, 0.5, -9.95], [0, 0.5, 0]);                                 // alarm clock
  b.add(cyl(0.025, 0.025, 1.5, 8), steel, [-1.6, 1.75, -9.55], [0, 0, PI / 2]);
  for (const x of [-2.3, -0.9]) put(cyl(0.02, 0.02, 1.75, 6), steel, [x, 0.875, -9.55]);
  ['#E9A93A', '#3FA7B5', '#F3EADB', '#9C8BE0'].forEach((c, i) => {
    const x = -2.1 + i * 0.35;
    b.add(new THREE.TorusGeometry(0.1, 0.008, 4, 12, PI), steel, [x, 1.67, -9.55], [0, PI / 2, 0]);
    b.add(box(0.1, 0.62, 0.38, 0.04), solid(c), [x, 1.32, -9.55]);
    b.add(box(0.1, 0.2, 0.12, 0.03), solid(c), [x, 1.48, -9.77], [0.4, 0, 0]); b.add(box(0.1, 0.2, 0.12, 0.03), solid(c), [x, 1.48, -9.33], [-0.4, 0, 0]);
  });
  b.add(new THREE.PlaneGeometry(1.8, 1.2), solid('#FFFFFF', { map: T.rugTexture('#3FA7B5', '#FFF3DF', '#F2B33D') }), [-0.7, 0.006, -11.0], [-PI / 2, 0, 0]);
  b.add(box(0.3, 0.035, 1.6, 0.01), wood, [-3.2, 1.95, -11.0]);
  poster(-1.4, 1.6, -9.26, 'planet', PI); poster(FACE, 1.7, -10.0, 'photo', PI / 2, 0.42);
  taped(-0.6, 1.75, -12.53, 'band', 0, 0.5, 0.06); taped(-0.25, 1.6, -12.53, 'motto', 0, 0.42, -0.1, 0.004); taped(-2.1, 1.9, -12.53, 'planet', 0, 0.4, 0.04);
  tube([[0.2, 2.5, -12.4], [0.25, 2.35, -11.2], [0.2, 2.5, -9.6]], 0.008, white, 12);                                        // a laundry line
  const pegged = [];
  for (let i = 0; i < 5; i++) pegged.push({ pos: [0.22, 2.2, -12.0 + i * 0.5], rot: [0, 0, (i % 2) * 0.05], scale: [0.03, 0.32 + (i % 3) * 0.08, 0.28], color: ['#FF9DAE', '#F3EADB', '#83CBEE', '#FFC56B', '#7FE0C2'][i] });
  inst(new THREE.BoxGeometry(1, 1, 1), paint, pegged, { covers: false });

  // ----- Bathroom: shower, toilet cubicle, sink with mirror -----
  b.add(box(1.2, 0.08, 1.2, 0.03), tile, [-2.75, 0.04, -8.5]);
  b.add(box(0.06, 2.3, 1.2, 0.02), tile, [-3.32, 1.15, -8.5]);
  b.add(box(1.2, 2.3, 0.04, 0.01), glass, [-2.75, 1.15, -7.88]);
  b.add(cyl(0.012, 0.012, 1.2, 6), steel, [-2.15, 2.2, -8.5], [PI / 2, 0, 0]);
  b.add(box(0.03, 1.8, 0.4, 0.01), solid('#F3EADB', { side: THREE.DoubleSide }), [-2.17, 1.3, -8.95]);
  b.add(cyl(0.012, 0.012, 0.5, 6), steel, [-3.2, 1.95, -8.5], [0, 0, 0.3]); b.add(cyl(0.08, 0.1, 0.04, 14), steel, [-3.05, 2.13, -8.5], [0, 0, -0.5]);
  b.add(box(0.08, 0.04, 0.3, 0.01), steel, [-3.25, 1.2, -8.2]); for (const [z, c] of [[-8.28, '#7FE0C2'], [-8.12, '#FF9DAE']]) b.add(cyl(0.03, 0.03, 0.12, 8), solid(c), [-3.22, 1.28, z]);
  mark('low', -3.4, -2.1, -9.15, -7.85, 3);
  put(box(1.2, 2.0, 0.06, 0.02), white, [-2.75, 1.0, -7.75]);                            // cubicle wall
  put(box(0.05, 1.9, 0.72, 0.02), solid('#E8DCC8'), [-2.0, 0.95, -7.05], [0, 0.55, 0]);  // cubicle door, ajar
  put(new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.22, 0.2], [0.24, 0.4], [0.2, 0.42], [0, 0.42]].map(([x, y]) => new THREE.Vector2(x, y)), 18), white, [-2.95, 0, -7.3], [0, 0, 0], [1, 1, 1.25]);
  b.add(box(0.18, 0.4, 0.42, 0.04), white, [-3.24, 0.62, -7.3]); b.add(box(0.4, 0.04, 0.5, 0.02), white, [-2.95, 0.44, -7.3]);
  b.add(cyl(0.06, 0.06, 0.1, 12), white, [-3.25, 0.89, -7.05]);
  put(box(0.8, 0.85, 0.45, 0.04), wood, [-0.9, 0.43, -7.06]); b.add(box(0.82, 0.05, 0.48, 0.02), counterTop, [-0.9, 0.88, -7.06]);
  b.add(cyl(0.18, 0.15, 0.06, 18), white, [-0.9, 0.9, -7.08]); b.add(cyl(0.015, 0.015, 0.15, 6), steel, [-0.9, 0.98, -6.9]);
  b.add(box(0.6, 0.75, 0.02, 0.01), solid('#DDE9F0', { metalness: 0.9, roughness: 0.05 }), [-0.9, 1.6, -6.88]);
  b.add(box(0.66, 0.81, 0.03, 0.01), darkWood, [-0.9, 1.6, -6.865]);
  b.add(cyl(0.03, 0.03, 0.12, 8), teal, [-1.15, 0.97, -6.95]); b.add(cyl(0.008, 0.008, 0.15, 5), white, [-1.15, 1.05, -6.95], [0, 0, 0.2]);
  b.add(cyl(0.012, 0.012, 0.5, 6), steel, [-1.5, 1.3, -9.13], [0, 0, PI / 2]); b.add(box(0.4, 0.5, 0.03, 0.01), solid('#7FE0C2'), [-1.5, 1.08, -9.11]);
  b.add(box(0.25, 0.03, 0.9, 0.01), wood, [-3.25, 1.75, -7.3]);                                                             // shelf over the toilet
  b.add(new THREE.PlaneGeometry(0.8, 0.5), solid('#FFFFFF', { map: T.rugTexture('#7FA7B0', '#FFF3DF', '#FFFFFF') }), [-1.4, 0.006, -8.2], [-PI / 2, 0, 0]);
  put(cyl(0.2, 0.17, 0.45, 14), solid('#C9B79C', { roughness: 0.95 }), [0.12, 0.23, -8.95]);                                // laundry basket, overflowing
  for (let i = 0; i < 4; i++) b.add(blob, solid(['#E9A93A', '#9C8BE0', '#F3EADB', '#3FA7B5'][i], { flatShading: true, roughness: 0.95 }), [0.12 + (i - 1.5) * 0.06, 0.48 + (i % 2) * 0.04, -8.95 + (i % 2 - 0.5) * 0.08], [i, i * 2, 0], [0.12, 0.05, 0.1]);

  // ----- Galley -----
  put(box(0.72, 1.9, 0.68, 0.06), cream, [-3.0, 0.95, -6.35]); b.add(box(0.02, 0.5, 0.04, 0.01), steel, [-2.63, 1.3, -6.1]); b.add(box(0.02, 0.3, 0.04, 0.01), steel, [-2.63, 0.6, -6.1]);
  b.add(box(0.01, 0.01, 0.6, 0.005), dark, [-2.64, 1.0, -6.35]);
  for (const [i, c] of ['#FF9DAE', '#7FE0C2', '#FFC56B'].entries()) b.add(box(0.01, 0.06, 0.06, 0.01), solid(c), [-2.635, 1.6 - i * 0.1, -6.5 + i * 0.12]);
  b.add(new THREE.PlaneGeometry(0.15, 0.2), solid('#FFFFFF', { map: posterOf('photo') }), [-2.632, 1.35, -6.2], [0, PI / 2, 0.1]);   // a photo on the fridge
  put(box(0.72, 0.88, 2.6, 0.03), wood, [-3.0, 0.44, -4.65]);
  for (let z = -5.85; z < -3.4; z += 0.52) { b.add(box(0.02, 0.7, 0.48, 0.02), teal, [-2.63, 0.44, z + 0.26]); b.add(box(0.02, 0.03, 0.12, 0.01), steel, [-2.61, 0.66, z + 0.26]); }
  b.add(box(0.78, 0.05, 2.65, 0.02), counterTop, [-3.0, 0.905, -4.65]);
  b.add(box(0.6, 0.02, 0.8, 0.02), dark, [-3.0, 0.94, -5.35]);
  for (const [dx, dz] of [[-0.15, -0.2], [-0.15, 0.2], [0.15, -0.2], [0.15, 0.2]]) b.add(new THREE.TorusGeometry(0.1, 0.012, 6, 18), solid('#555E70'), [-3.0 + dx, 0.955, -5.35 + dz], [PI / 2, 0, 0]);
  b.add(box(0.02, 0.4, 0.6, 0.02), dark, [-2.63, 0.45, -5.35]); b.add(box(0.02, 0.03, 0.4, 0.01), steel, [-2.61, 0.68, -5.35]);
  b.add(cyl(0.11, 0.1, 0.12, 16), darkSteel, [-2.85, 1.02, -5.15]); b.add(box(0.02, 0.02, 0.18, 0.01), darkSteel, [-2.85, 1.07, -4.97]);
  b.add(new THREE.LatheGeometry([[0, 0], [0.11, 0], [0.13, 0.07], [0.11, 0.17], [0.05, 0.2], [0.02, 0.24], [0, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)), 14), coral, [-3.15, 0.96, -5.15]);
  b.add(box(0.18, 0.025, 0.035, 0.01), dark, [-3.15, 1.18, -5.15]);
  b.add(box(0.55, 0.06, 0.5, 0.02), darkSteel, [-3.0, 0.9, -3.9]); b.add(box(0.5, 0.04, 0.44, 0.01), solid('#3A4252'), [-3.0, 0.91, -3.9]);
  tube([[-3.25, 0.93, -3.9], [-3.25, 1.15, -3.9], [-3.1, 1.22, -3.9], [-2.95, 1.12, -3.9]], 0.015, steel, 12);
  b.add(box(0.36, 0.025, 0.48, 0.01), wood, [-2.9, 0.94, -4.5]);
  for (const [dz, c] of [[-0.12, '#F28B3D'], [0.0, '#5BAF6A'], [0.12, '#E85A5A']]) b.add(lowBall, solid(c, { flatShading: true }), [-2.9, 0.98, -4.5 + dz], [0, 0, 0], 0.04);
  b.add(cyl(0.05, 0.05, 0.16, 10), steel, [-3.2, 1.01, -4.25]); for (let i = 0; i < 3; i++) b.add(cyl(0.01, 0.01, 0.2, 5), darkWood, [-3.2 + (i - 1) * 0.02, 1.15, -4.25], [0, 0, (i - 1) * 0.2]);
  for (const [z0, z1] of [[-5.95, -5.32], [-3.88, -3.35]]) {                      // upper cupboards either side of the window
    b.add(box(0.45, 0.65, z1 - z0, 0.03), wood, [-3.12, 2.2, (z0 + z1) / 2]);
    b.add(box(0.02, 0.58, z1 - z0 - 0.06, 0.02), cream, [-2.89, 2.2, (z0 + z1) / 2]); b.add(box(0.02, 0.12, 0.03, 0.01), steel, [-2.87, 1.98, (z0 + z1) / 2]);
  }
  // Dirty dishes: a stack in the sink, a pot on the counter, mugs everywhere.
  const plates = [], mugs = [];
  for (let i = 0; i < 5; i++) plates.push({ pos: [-3.0 + (i % 2) * 0.03, 0.94 + i * 0.018, -3.9 + (i % 3) * 0.02], rot: [0.08 * (i % 2), i, 0.05], color: '#FFFFFF' });
  for (let i = 0; i < 3; i++) plates.push({ pos: [-2.85, 0.94 + i * 0.016, -4.0 + i * 0.01], rot: [0, i, 0.04], color: '#F5D9C0' });
  for (let i = 0; i < 2; i++) { b.add(box(0.06, 0.01, 0.01, 0.003), steel, [-2.93, 1.84, -5.8 + i * 0.35]); mugs.push({ pos: [-2.93, 1.74, -5.8 + i * 0.35], color: ['#FF7A59', '#3FA7B5'][i] }); }
  mugs.push({ pos: [-2.8, 0.985, -3.55], color: '#FFFFFF' }, { pos: [-2.75, 0.985, -3.42], color: '#F2B33D' }, { pos: [-3.2, 0.985, -3.5], color: '#9C8BE0' }, { pos: [-2.8, 0.985, -4.85], color: '#FF9DAE' });
  b.add(cyl(0.12, 0.1, 0.14, 14), darkSteel, [-3.15, 0.99, -4.9]);                                                         // a pot left out
  label('GALLEY', FACE, 2.7, -4.6, PI / 2, 0.45);
  // The pantry: open shelves on the galley wall. How full it is shows the emergency fund.
  put(box(1.7, 2.0, 0.35, 0.03), darkWood, [-1.4, 1.0, -6.57]);
  for (const h of [0.45, 0.9, 1.35, 1.8]) b.add(box(1.62, 0.04, 0.32, 0.01), wood, [-1.4, h, -6.55]);
  label('PANTRY', -1.4, 2.12, -6.39, 0, 0.5);
  const pantrySlots = [];
  for (const h of [0.47, 0.92, 1.37, 1.82]) for (let i = 0; i < 9; i++) pantrySlots.push([-2.1 + i * 0.17, h, -6.52]);
  const jarColors = ['#F2B33D', '#E9876B', '#5BAF6A', '#C9A27A', '#E05A4F', '#F3EADB', '#9C8BE0'];
  const pantry = inst(cyl(0.06, 0.06, 0.16, 10), solid('#FFFFFF', { roughness: 0.4 }), pantrySlots.map((p, i) => ({ pos: [p[0], p[1] + 0.08, p[2]], color: jarColors[i % 7] })), { covers: false });
  pantry.count = 0;
  // Dining table with three chairs, plates, crumbs and a pendant lamp.
  put(box(1.4, 0.05, 0.85, 0.02), wood, [-1.0, 0.76, -3.4]);
  for (const [dx, dz] of [[-0.62, -0.36], [0.62, -0.36], [-0.62, 0.36], [0.62, 0.36]]) b.add(cyl(0.03, 0.03, 0.74, 8), darkWood, [-1.0 + dx, 0.37, -3.4 + dz]);
  for (const [x, z, ry] of [[0.12, -3.4, PI / 2], [-2.1, -3.4, -PI / 2], [-1.0, -4.18, PI]]) chair(x, z, ry);
  for (const [x, z] of [[-1.5, -3.4], [-0.9, -3.65], [-1.3, -3.15]]) plates.push({ pos: [x, 0.79, z], color: '#FFFFFF' });
  mugs.push({ pos: [-0.75, 0.835, -3.2], color: '#3FA7B5' });
  b.add(box(0.21, 0.01, 0.3, 0.003), white, [-1.6, 0.79, -3.65], [0, 0.4, 0]);                                              // a letter
  b.add(cyl(0.12, 0.16, 0.18, 14), glow('#FFE2A8'), [-1.0, 2.2, -3.4]); b.add(cyl(0.008, 0.008, 0.8, 4), dark, [-1.0, 2.6, -3.4]);
  b.add(new THREE.PlaneGeometry(2.2, 1.6), solid('#FFFFFF', { map: T.rugTexture('#E9876B', '#FFF3DF', '#3FA7B5') }), [-1.0, 0.006, -3.4], [-PI / 2, 0, 0]);
  inst(cyl(0.12, 0.12, 0.012, 18), solid('#FFFFFF', { roughness: 0.3 }), plates, { covers: false });
  inst(cyl(0.045, 0.04, 0.1, 12), solid('#FFFFFF'), mugs, { covers: false });
  // Hanging pans over the walkway side of the galley.
  b.add(cyl(0.015, 0.015, 1.6, 6), steel, [-2.2, 2.6, -4.6], [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) { const z = -5.2 + i * 0.4; b.add(cyl(0.006, 0.006, 0.2, 4), steel, [-2.2, 2.5, z]); b.add(cyl(0.12 - i * 0.015, 0.1 - i * 0.015, 0.06, 14), i % 2 ? darkSteel : coral, [-2.2, 2.3 - i * 0.02, z], [PI / 2 - 0.1, 0, 0]); }

  // ----- Lounge -----
  put(box(0.4, 2.2, 1.1, 0.03), darkWood, [-3.12, 1.1, -2.55]);
  for (const h of [0.4, 0.85, 1.3, 1.75]) b.add(box(0.36, 0.035, 1.04, 0.01), wood, [-3.08, h, -2.55]);
  const books = [];
  const bookColors = ['#3FA7B5', '#FF7A59', '#F2B33D', '#7FA7B0', '#9C8BE0', '#E9876B', '#5BAF6A', '#2B3550', '#F3EADB'];
  for (const h of [0.42, 0.87, 1.32, 1.77]) for (let z = -3.05, i = 0; z < -2.08; i++) {
    const tall = 0.24 + ((i * 37 + h * 10) % 7) * 0.025, thick = 0.035 + (i % 3) * 0.012, lean = i % 11 === 7 ? 0.22 : 0;
    books.push({ pos: [-3.08, h + tall / 2, z], rot: [lean, 0, 0], scale: [1, tall, thick / 0.05], color: bookColors[(i * 5 + Math.round(h * 10)) % 9] });
    z += thick + 0.004 + (i % 9 === 8 ? 0.02 : 0);
  }
  for (let i = 0; i < 6; i++) books.push({ pos: [-3.05, 2.2 + i * 0.045, -2.55 + (i % 2) * 0.05], rot: [PI / 2, 0, i * 0.3], scale: [1, 0.25, 0.8], color: bookColors[i] }); // piled on top
  inst(box(0.24, 1, 0.05, 0.004), solid('#FFFFFF', { roughness: 0.8 }), books, { covers: false });
  put(box(0.85, 0.42, 2.1, 0.1), coralFab, [-2.95, 0.21, -0.85]);
  b.add(box(0.75, 0.12, 1.9, 0.06), coralFab, [-2.92, 0.47, -0.85]);
  b.add(box(0.22, 0.6, 2.1, 0.1), coralFab, [-3.22, 0.7, -0.85]);
  for (const z of [-1.85, 0.15]) b.add(box(0.85, 0.3, 0.18, 0.08), coralFab, [-2.95, 0.55, z]);
  for (const [z, m] of [[-1.45, tealFab], [-0.25, solid('#FFFFFF', { map: T.fabricTexture('#F2B33D', '#F5C35A') })]]) b.add(box(0.18, 0.38, 0.38, 0.1), m, [-3.05, 0.72, z], [0, 0, 0.25]);
  b.add(box(0.6, 0.04, 0.7, 0.02), tealFab, [-2.75, 0.55, -0.3], [0, 0.1, 0.05]);
  put(box(1.0, 0.05, 0.6, 0.02), wood, [-1.6, 0.42, -0.85]); for (const [dx, dz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) b.add(cyl(0.025, 0.025, 0.4, 6), darkWood, [-1.6 + dx, 0.2, -0.85 + dz]);
  b.add(cyl(0.05, 0.045, 0.1, 10), teal, [-1.4, 0.5, -0.9]); b.add(box(0.2, 0.03, 0.15, 0.01), coral, [-1.75, 0.46, -0.75], [0, 0.4, 0]);
  for (let i = 0; i < 4; i++) b.add(box(0.21, 0.008, 0.29, 0.002), white, [-1.85 + i * 0.02, 0.45 + i * 0.008, -1.0], [0, i * 0.3, 0]);                // papers on the coffee table
  b.add(new THREE.PlaneGeometry(2.6, 2.0), solid('#FFFFFF', { map: T.rugTexture() }), [-1.8, 0.006, -0.85], [-PI / 2, 0, 0]);
  plant([-3.0, 0, 0.45], 1.3);
  { const gz = 0.72; b.add(sphere, solid('#C77B3F', { roughness: 0.5 }), [-3.24, 0.32, gz], [0, 0, 0.18], [0.07, 0.22, 0.17]);   // guitar
    b.add(sphere, solid('#C77B3F', { roughness: 0.5 }), [-3.2, 0.55, gz], [0, 0, 0.18], [0.065, 0.15, 0.13]);
    b.add(cyl(0.03, 0.03, 0.04, 14), dark, [-3.17, 0.42, gz], [0, 0, PI / 2 + 0.18]);
    b.add(box(0.04, 0.6, 0.06, 0.01), darkWood, [-3.09, 0.95, gz], [0, 0, 0.18]); b.add(box(0.05, 0.14, 0.08, 0.01), darkWood, [-3.03, 1.3, gz], [0, 0, 0.18]); mark('low', -3.35, -2.95, gz - 0.2, gz + 0.2); }
  // Desk with a lamp, a glowing budget chart, a notebook, a chair, and the trophy shelf.
  put(box(0.7, 0.05, 1.0, 0.02), wood, [-3.0, 0.75, 1.4]); put(box(0.68, 0.72, 0.3, 0.02), darkWood, [-3.0, 0.37, 1.07]); b.add(box(0.68, 0.72, 0.03, 0.01), darkWood, [-3.0, 0.37, 1.88]);
  b.add(box(0.06, 0.4, 0.55, 0.02), dark, [-3.25, 1.05, 1.4]);
  const budget = T.screenTexture({ title: 'BUDGET', color: '#FFC56B' });
  inside.add(mesh(new THREE.PlaneGeometry(0.5, 0.33), new THREE.MeshBasicMaterial({ map: budget.texture }), [-3.215, 1.05, 1.4], [0, PI / 2, 0]));
  b.add(cyl(0.06, 0.08, 0.03, 12), dark, [-3.15, 0.79, 1.8]); b.add(cyl(0.012, 0.012, 0.35, 6), steel, [-3.1, 0.95, 1.8], [0, 0, -0.3]); b.add(cyl(0.05, 0.1, 0.1, 12), glow('#FFE2A8'), [-3.0, 1.1, 1.8]);
  b.add(box(0.22, 0.015, 0.3, 0.005), teal, [-2.8, 0.785, 1.3]); b.add(box(0.2, 0.017, 0.28, 0.004), white, [-2.8, 0.79, 1.3]);
  b.add(cyl(0.008, 0.008, 0.14, 5), dark, [-2.75, 0.8, 1.5], [PI / 2, 0, 0.4]);
  for (let i = 0; i < 6; i++) b.add(box(0.21, 0.008, 0.29, 0.002), i % 3 ? white : solid('#FFF3B0'), [-2.95 + (i % 2) * 0.03, 0.78 + i * 0.008, 1.0 + (i % 3) * 0.02], [0, i * 0.15, 0]); // paper stack
  chair(-2.25, 1.4, PI / 2);
  b.add(box(0.3, 0.03, 0.95, 0.01), wood, [-3.18, 2.35, 1.4]);
  poster(FACE, 1.75, 2.2, 'motto', PI / 2, 0.4);
  taped(FACE, 1.65, -1.95, 'band', PI / 2, 0.38, 0.08); taped(FACE, 1.15, 1.95, 'photo', PI / 2, 0.3, -0.12);
  // Progress frames for each goal (filled in by setGoals), on the wall above the sofa.
  const frames = new THREE.Group(); inside.add(frames);
  // The savings jar: a big glass jar that fills with gems as total savings grow.
  const jar = new THREE.Group(); jar.position.set(2.65, 0, -1.8); inside.add(jar); mark('low', 2.25, 3.05, -2.2, -1.4);
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
  label('SAVINGS', 2.65, 1.12, -1.48, 0, 0.4);
  const trophies = new THREE.Group(); inside.add(trophies);
  const cup = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.06, 0.02], [0.02, 0.05], [0.02, 0.1], [0.08, 0.14], [0.09, 0.22], [0.075, 0.22], [0.065, 0.16], [0, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 16);

  // ----- Hydroponics corner: a rack of plants under purple grow lights -----
  put(box(2.0, 1.9, 0.4, 0.03), steel, [-2.35, 0.95, 2.3]);
  for (const h of [0.35, 0.95, 1.55]) {
    b.add(box(1.9, 0.12, 0.35, 0.02), solid('#4A3426'), [-2.35, h, 2.29]);
    b.add(box(1.85, 0.03, 0.06, 0.01), glow('#D07BFF'), [-2.35, h + 0.5, 2.2]);
    for (let i = 0; i < 6; i++) plant([-3.2 + i * 0.34, h + 0.06, 2.28], 0.38, false);
  }
  put(box(0.3, 0.25, 0.2, 0.04), teal, [-0.95, 0.12, 2.35]); b.add(cyl(0.02, 0.02, 0.25, 6), teal, [-0.8, 0.28, 2.35], [0, 0, -0.9]); // watering can
  label('HYDROPONICS', -2.35, 2.05, 2.08, PI, 0.7);

  // ----- Workshop and suit room -----
  put(box(0.75, 0.9, 2.4, 0.03), darkWood, [-3.0, 0.45, 4.2]); b.add(box(0.8, 0.06, 2.5, 0.02), wood, [-3.0, 0.93, 4.2]);
  b.add(box(0.06, 1.1, 2.4, 0.02), solid('#E8D3B0'), [FACE + 0.03, 1.65, 4.2]);
  const tools = [];
  const toolColors = ['#FF7A59', '#AEB7C8', '#3FA7B5', '#F2B33D', '#E05A4F'];
  for (let i = 0; i < 14; i++) tools.push({ pos: [FACE + 0.08, 1.4 + (i % 2) * 0.45, 3.2 + Math.floor(i / 2) * 0.3], rot: [0, 0, (i % 3 - 1) * 0.3], scale: [1, 0.6 + (i % 4) * 0.25, 1], color: toolColors[i % 5] });
  for (let i = 0; i < 6; i++) tools.push({ pos: [-2.8 + (i % 2) * 0.12, 0.975, 3.3 + i * 0.22], rot: [PI / 2, (i % 3) * 0.6, 0], scale: [1, 0.8, 1], color: toolColors[(i + 2) % 5] });
  inst(box(0.03, 0.3, 0.05, 0.01), solid('#FFFFFF', { metalness: 0.3, roughness: 0.5 }), tools, { covers: false });
  b.add(box(0.3, 0.2, 0.35, 0.03), steel, [-2.95, 1.06, 3.15]); b.add(box(0.1, 0.12, 0.3, 0.02), dark, [-2.8, 1.2, 3.15]);
  b.add(box(0.55, 0.55, 0.5, 0.03), dark, [-2.95, 1.24, 5.05]);
  b.add(box(0.5, 0.5, 0.45, 0.01), glass, [-2.95, 1.24, 5.05]); b.add(box(0.1, 0.05, 0.1, 0.01), steel, [-2.95, 1.38, 5.05]);
  b.add(box(0.08, 0.06, 0.08, 0.01), glow('#FF8A3D'), [-2.95, 1.33, 5.05]); b.add(box(0.18, 0.08, 0.14, 0.02), solid('#7FE0C2'), [-2.95, 1.03, 5.05]);
  label('3D PRINTER', -2.67, 1.4, 5.05, PI / 2, 0.4);
  // A half-finished project on the bench: a little robot with its chest open.
  b.add(box(0.22, 0.26, 0.18, 0.04), mustard, [-2.85, 1.09, 4.3]); b.add(box(0.16, 0.14, 0.14, 0.04), mustard, [-2.85, 1.31, 4.3]);
  b.add(box(0.02, 0.2, 0.16, 0.01), mustard, [-2.7, 1.09, 4.45], [0, 0.9, 0]); for (let i = 0; i < 4; i++) b.add(cyl(0.006, 0.006, 0.2, 4), [red, teal, mustard, white][i], [-2.8, 1.05 + i * 0.02, 4.4], [0.3 * i, 0, 1.2]);
  for (const s of [-1, 1]) b.add(sphere, glow('#7FE0C2'), [-2.78, 1.33, 4.3 + s * 0.04], [0, 0, 0], 0.015);
  const bins = [];
  for (let r = 0; r < 3; r++) { b.add(box(0.35, 0.03, 2.4, 0.01), steel, [-IN + 0.21, 2.35 + r * 0.32, 4.2]); for (let i = 0; i < 8; i++) bins.push({ pos: [-IN + 0.25, 2.45 + r * 0.32, 3.2 + i * 0.29], color: ['#FF7A59', '#3FA7B5', '#F2B33D', '#9C8BE0'][(i + r) % 4] }); }
  inst(box(0.28, 0.17, 0.25, 0.02), solid('#FFFFFF', { roughness: 0.6 }), bins, { covers: false });
  put(box(0.7, 0.45, 0.4, 0.06), red, [-1.6, 0.23, 5.6]); b.add(box(0.3, 0.05, 0.06, 0.02), dark, [-1.6, 0.48, 5.6]);
  chair(-2.1, 3.2, PI / 2, true);
  put(box(0.6, 1.3, 0.4, 0.06), red, [2.9, 0.65, 6.15]); b.add(box(0.3, 0.08, 0.02, 0.01), white, [2.9, 0.95, 5.94]); b.add(box(0.08, 0.3, 0.02, 0.01), white, [2.9, 0.95, 5.94]);
  label('REPAIR KIT', 2.9, 1.42, 5.94, PI, 0.5);
  b.add(cyl(0.03, 0.03, 2.8, 8), steel, [-2.0, 2.15, 6.24], [0, 0, PI / 2]);
  [-3.0, -2.15, -1.3].forEach((x, i) => suit(x, 6.17, i));
  mark('low', -3.4, -0.9, 5.85, 6.45);
  put(cyl(0.12, 0.12, 0.55, 14), white, [-0.5, 0.3, 6.2]);
  for (const x of [-2.6, -1.7]) { b.add(cyl(0.02, 0.02, 0.1, 6), steel, [x, 2.65, 6.32], [PI / 2, 0, 0]); b.add(new THREE.TorusGeometry(0.15, 0.03, 6, 16), solid('#6B4A33'), [x, 2.5, 6.3]); }
  for (const x of [-3.1, -0.6]) { b.add(cyl(0.2, 0.2, 0.15, 18), mustard, [x, 2.6, 6.3], [PI / 2, 0, 0]); b.add(new THREE.TorusGeometry(0.16, 0.025, 6, 18), dark, [x, 2.6, 6.22]); }
  label('SUITS', -2.0, 2.85, 6.32, PI, 0.4);
  taped(FACE, 2.3, 2.95, 'diagram', PI / 2, 0.45, -0.06); taped(FACE, 2.2, 5.6, 'safety', PI / 2, 0.42, 0.05);
  // A chain hoist with a hook, hanging from the workshop's high ceiling.
  b.add(box(0.3, 0.15, 0.3, 0.04), darkSteel, [-1.6, 5.9, 4.2]); for (let i = 0; i < 14; i++) b.add(new THREE.TorusGeometry(0.03, 0.008, 4, 8), steel, [-1.6, 5.8 - i * 0.07, 4.2], [0, (i % 2) * PI / 2, 0]);
  b.add(new THREE.TorusGeometry(0.07, 0.015, 6, 10, PI * 1.4), mustard, [-1.6, 4.75, 4.2]);

  // ----- Airlock: sealed chamber out to the hull, inner door in a glass wall, outer hatch with a hand wheel -----
  crossWall(6.45, LOW, 3.0, { door: false, x1: -0.8 });
  crossWall(8.35, LOW, 3.0, { door: false, x1: -0.8 });
  const awFar = hwM(1.5, 7.4);
  b.add(box(awFar - 0.8, 0.12, 1.95, 0.02), wall, [-(awFar + 0.8) / 2, 3.0, 7.4]);
  b.add(box(0.06, 3.0, 1.95, 0.01), glass, [-0.8, 1.5, 7.4]);
  for (const z of [6.45, 8.35]) b.add(box(0.14, 3.0, 0.14, 0.02), steel, [-0.8, 1.5, z]);
  b.add(box(0.14, 0.14, 1.95, 0.02), steel, [-0.8, 2.95, 7.4]);
  mark('low', -5, -0.7, 6.4, 8.4, 3);
  const innerDoor = new THREE.Group(); innerDoor.position.set(-0.8, 1.1, 7.4); innerDoor.rotation.y = PI / 2; inside.add(innerDoor);
  innerDoor.add(mesh(new THREE.TorusGeometry(0.6, 0.08, 10, 32), steel), mesh(new THREE.CircleGeometry(0.56, 32), solid('#5E7F8C', { side: THREE.DoubleSide })), mesh(new THREE.CircleGeometry(0.15, 20), glass, [0, 0.25, 0.01]));
  const hatchX = -(hwM(1.25, 7.4) - 0.12);
  const hatch = new THREE.Group(); hatch.position.set(hatchX, 1.25, 7.4); hatch.rotation.y = PI / 2; inside.add(hatch);
  hatch.add(mesh(new THREE.TorusGeometry(0.7, 0.1, 10, 32), darkSteel), mesh(new THREE.CircleGeometry(0.66, 32), solid('#8E97AA', { metalness: 0.5 })), mesh(new THREE.TorusGeometry(0.82, 0.05, 8, 32), hazard));
  const wheel = new THREE.Group(); wheel.position.z = 0.08; hatch.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 24), red)); for (let i = 0; i < 3; i++) wheel.add(mesh(box(0.5, 0.03, 0.03, 0.01), steel, [0, 0, 0], [0, 0, i * PI / 3]));
  for (const z of [6.75, 8.05]) { b.add(box(2.6, 0.45, 0.4, 0.05), darkSteel, [-2.3, 0.23, z]); b.add(box(2.6, 0.06, 0.42, 0.03), tealFab, [-2.3, 0.48, z]); }
  for (const [x, h, z, ry] of [[-1.6, 1.4, 6.52, 0], [-3.4, 1.4, 6.52, 0], [-1.6, 1.4, 8.28, PI], [-3.4, 1.4, 8.28, PI]]) b.add(new THREE.TorusGeometry(0.15, 0.02, 6, 14, PI), mustard, [x, h, z], [0, ry, 0]);
  for (const x of [-2.0, -3.0]) { b.add(cyl(0.11, 0.11, 0.04, 18), solid('#F5F1E8'), [x, 2.2, 8.26], [PI / 2, 0, 0]); b.add(box(0.01, 0.08, 0.008, 0.003), red, [x + 0.02, 2.22, 8.235], [0, 0, -0.8]); }
  const statusRed = mesh(sphere, basic('#FF4A4A'), [-0.8, 2.45, 6.9], [0, 0, 0], 0.06), statusGreen = mesh(sphere, basic('#2F6B45'), [-0.8, 2.45, 7.9], [0, 0, 0], 0.06);
  inside.add(statusRed, statusGreen);
  b.add(new THREE.PlaneGeometry(1.4, 1.4), hazard, [-2.6, 0.008, 7.4], [-PI / 2, 0, 0]);
  label('AIRLOCK', -0.78, 2.7, 7.4, PI / 2, 0.6);

  // ----- Junk bay -----
  const crates = [];
  const Cr = (x, y, z, s, ry, c) => { crates.push({ pos: [x, y + s / 2, z], rot: [0, ry, 0], scale: s, color: c }); if (y < 0.1) mark('low', x - s / 2, x + s / 2, z - s / 2, z + s / 2); };
  Cr(-4.2, 0, 8.8, 0.9, 0.1, '#C9A27A'); Cr(-4.1, 0.9, 8.85, 0.75, 0.3, '#B98E66'); Cr(-4.2, 1.65, 8.8, 0.6, -0.2, '#C9A27A');
  Cr(-3.3, 0, 8.75, 0.7, -0.15, '#8C6040'); Cr(-4.3, 0, 10.35, 0.8, 0.2, '#C9A27A'); Cr(-4.25, 0.8, 10.3, 0.6, -0.1, '#AEB7C8');
  Cr(-3.3, 0, 10.4, 0.55, 0.4, '#C9A06A'); Cr(3.2, 0, 10.2, 0.8, 0.1, '#C9A27A'); Cr(3.2, 0.8, 10.2, 0.6, 0.5, '#B98E66'); Cr(2.6, 0, 8.8, 0.6, -0.3, '#C9A06A');
  Cr(3.6, 0, 9.2, 0.5, 0.2, '#AEB7C8'); Cr(-2.9, 0, 10.45, 0.4, 0.1, '#C9A06A'); Cr(-3.6, 2.25, 8.8, 0.45, 0.6, '#AEB7C8');
  inst(box(1, 1, 1, 0.04), crateMat, crates, { covers: false });
  put(new THREE.SphereGeometry(1, 10, 7), tarp, [3.6, 0.35, 8.7], [0, 0.4, 0], [0.7, 0.5, 0.55]);
  put(new THREE.SphereGeometry(1, 10, 7), solid('#9C8FA6', { flatShading: true, roughness: 0.95 }), [-3.3, 0.9, 8.75], [0.2, 0, 0.1], [0.45, 0.3, 0.38]);
  put(box(0.7, 0.6, 0.5, 0.04), solid('#7FA7B0'), [2.5, 0.3, 10.4], [0, 0.3, 0]); b.add(box(0.02, 0.4, 0.3, 0.01), dark, [2.85, 0.35, 10.35], [0, 0.3, 0.4]);
  b.add(cyl(0.25, 0.25, 0.08, 16), steel, [2.4, 0.66, 10.4], [0.3, 0, 0.2]);
  put(box(0.5, 0.4, 0.35, 0.03), dark, [-2.6, 0.2, 10.5], [0, -0.3, 0]); b.add(box(0.4, 0.28, 0.02, 0.01), solid('#3A4252'), [-2.5, 0.22, 10.32], [0, -0.3, 0]);
  chair(-3.9, 9.8, 0, false, true);
  put(box(0.15, 1.8, 0.9, 0.08), greyFab, [-4.9, 0.95, 9.6], [0, 0, 0.15]);
  put(cyl(0.12, 0.14, 0.04, 14), dark, [3.4, 0.02, 9.6]); b.add(cyl(0.015, 0.015, 1.2, 6), steel, [3.0, 0.15, 9.6], [0, 0, 1.3]); b.add(cyl(0.1, 0.18, 0.2, 12), mustard, [2.45, 0.2, 9.55], [0, 0, 1.3]);
  tube([[-4.6, 0.02, 9.2], [-3.8, 0.08, 9.0], [-3.3, 0.02, 9.25], [-3.0, 0.3, 9.1], [-3.6, 0.6, 8.85], [-3.0, 0.75, 8.6]], 0.03, dark, 50);
  tube([[3.8, 0.02, 9.8], [3.0, 0.1, 10.0], [2.8, 0.02, 9.4], [3.3, 0.4, 9.05], [2.9, 0.82, 8.95]], 0.04, red, 40);
  tube([[-4.4, 0.02, 10.0], [-3.7, 0.12, 10.1], [-3.2, 0.02, 9.95], [-2.9, 0.05, 10.2]], 0.025, mustard, 30);
  b.add(cyl(0.18, 0.22, 0.2, 14), darkSteel, [3.2, 1.5, 10.2]);                                       // old robot arm
  b.add(box(0.12, 0.6, 0.12, 0.04), mustard, [3.05, 1.75, 10.15], [0, 0, 0.7]); b.add(sphere, darkSteel, [2.85, 1.96, 10.15], [0, 0, 0], 0.08);
  b.add(box(0.1, 0.5, 0.1, 0.03), mustard, [2.65, 1.8, 10.15], [0, 0, -0.9]); b.add(box(0.14, 0.08, 0.1, 0.02), darkSteel, [2.45, 1.67, 10.15]);
  for (const s of [-1, 1]) b.add(box(0.03, 0.12, 0.04, 0.01), darkSteel, [2.38, 1.6, 10.15 + s * 0.04], [0, 0, 0.3]);
  { const bx = -4.2, by = 2.25, bz = 8.8, fur = solid('#B98059', { roughness: 1 });                  // a stuffed bear
    b.add(sphere, fur, [bx, by + 0.12, bz], [0, 0, 0], [0.12, 0.14, 0.11]); b.add(sphere, fur, [bx, by + 0.32, bz - 0.02], [0, 0, 0], 0.1);
    for (const s of [-1, 1]) { b.add(sphere, fur, [bx + s * 0.07, by + 0.41, bz - 0.02], [0, 0, 0], 0.04); b.add(sphere, fur, [bx + s * 0.1, by + 0.06, bz - 0.08], [0, 0, 0], [0.05, 0.05, 0.08]); b.add(sphere, fur, [bx + s * 0.13, by + 0.18, bz - 0.03], [0, 0, 0], [0.04, 0.08, 0.04]); }
    b.add(sphere, solid('#E8C9A8'), [bx, by + 0.3, bz - 0.1], [0, 0, 0], [0.04, 0.035, 0.03]); for (const s of [-1, 1]) b.add(sphere, dark, [bx + s * 0.035, by + 0.35, bz - 0.09], [0, 0, 0], 0.012); }
  for (const z of [4.2, 9.6]) { b.add(box(6.9, 0.22, 0.14, 0.02), darkSteel, [0, 6.3, z]); b.add(box(6.9, 0.04, 0.3, 0.01), darkSteel, [0, 6.19, z]); } // ceiling beams in the tall rooms
  label('STORAGE', 1.1, 2.6, 8.42, PI, 0.55);

  // ----- Fuel room -----
  const tankMat = solid('#E7E2D6', { metalness: 0.3, roughness: 0.4 });
  for (const [x, z] of [[-3.0, 11.55], [-1.15, 11.75]]) {
    put(cyl(0.8, 0.8, 4.0, 24), tankMat, [x, 2.2, z]);
    b.add(sphere, tankMat, [x, 4.2, z], [0, 0, 0], [0.8, 0.35, 0.8]); b.add(sphere, tankMat, [x, 0.2, z], [0, 0, 0], [0.8, 0.25, 0.8]);
    for (const h of [1.0, 3.4]) b.add(new THREE.TorusGeometry(0.81, 0.04, 6, 30), darkSteel, [x, h, z], [PI / 2, 0, 0]);
    b.add(box(1.62, 0.3, 0.02, 0.01), hazard, [x, 2.2, z - 0.8]);
    b.add(cyl(0.12, 0.12, 0.04, 18), solid('#F5F1E8'), [x + 0.3, 1.6, z - 0.81], [PI / 2, 0, 0]); b.add(box(0.01, 0.09, 0.008, 0.003), red, [x + 0.32, 1.62, z - 0.835], [0, 0, -0.5]);
  }
  label('FUEL', -3.0, 2.8, 10.73, 0, 0.5); label('FUEL', -1.15, 2.8, 10.93, 0, 0.5);
  for (const [pts, r] of [[[[-3.0, 4.5, 11.55], [-3.0, 5.0, 11.6], [-2.0, 5.1, 12.0], [-1.15, 4.5, 11.75]], 0.07], [[[-1.15, 4.4, 11.75], [-0.4, 4.9, 12.2], [0.6, 4.9, 12.35], [1.6, 3.6, 12.4]], 0.07],
    [[[-3.0, 0.5, 11.55], [-2.2, 0.15, 12.3], [-0.5, 0.15, 12.35], [1.0, 0.4, 12.35], [2.0, 0.5, 11.6]], 0.06], [[[-1.15, 3.8, 11.75], [-0.2, 3.9, 12.45], [0.8, 2.4, 12.45], [2.2, 1.0, 11.6]], 0.05]])
    tube(pts, r, steel, 30);
  tube([[-3.8, 0.3, 12.3], [-3.0, 0.4, 12.45], [-1.5, 0.6, 12.48], [0, 1.4, 12.48], [1.4, 2.6, 12.48], [2.0, 4.2, 12.45]], 0.04, glow('#5FF0E0'), 40);
  for (const z of [11.2, 12.1]) { put(box(0.6, 0.5, 0.5, 0.04), teal, [2.6, 0.25, z]); b.add(cyl(0.18, 0.18, 0.45, 14), darkSteel, [2.6, 0.62, z], [0, 0, PI / 2]); }
  for (const [x, h, z] of [[-2.0, 0.15, 12.3], [0.8, 2.4, 12.45], [-0.4, 4.9, 12.2]]) { b.add(new THREE.TorusGeometry(0.12, 0.02, 6, 16), red, [x, h + 0.12, z - 0.12]); b.add(cyl(0.02, 0.02, 0.12, 6), steel, [x, h + 0.12, z - 0.06], [PI / 2, 0, 0]); }
  b.add(box(5.0, 0.06, 0.8, 0.01), grate, [-0.3, 3.0, 12.1]);
  for (const x of [-2.7, -0.3, 2.1]) b.add(cyl(0.03, 0.03, 3.0, 8), steel, [x, 1.5, 11.75]);
  b.add(cyl(0.02, 0.02, 5.0, 6), mustard, [-0.3, 3.95, 11.72], [0, 0, PI / 2]); b.add(cyl(0.02, 0.02, 5.0, 6), mustard, [-0.3, 3.5, 11.72], [0, 0, PI / 2]);
  for (const x of [1.95, 2.45]) b.add(cyl(0.03, 0.03, 3.4, 8), steel, [x, 1.7, 12.3]);
  for (let h = 0.3; h < 3.0; h += 0.3) b.add(cyl(0.022, 0.022, 0.5, 6), steel, [2.2, h, 12.3], [0, 0, PI / 2]);
  mark('low', -4, 3, 11.65, 12.6);
  const access = new THREE.Group(); access.position.set(-0.3, 3.75, REAR - 0.07); access.rotation.y = PI; inside.add(access);
  access.add(mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 28), darkSteel), mesh(new THREE.CircleGeometry(0.46, 28), solid('#8E97AA', { metalness: 0.5, side: THREE.DoubleSide })), mesh(new THREE.TorusGeometry(0.58, 0.04, 8, 28), hazard));
  label('ENGINE ACCESS', -0.3, 4.45, REAR - 0.08, PI, 0.75); label('DANGER: HIGH PRESSURE', 0.9, 1.5, REAR - 0.08, PI, 0.8);

  // ================= SERVICE DECK (under the lower floor) =================
  const S0 = SVC;
  // Crawlspace hatches in the lower floor, with a short ladder down under one of them.
  for (const [x, z] of [[2.7, -2.4], [2.7, 4.6], [-0.2, -10.9]]) {
    b.add(box(0.7, 0.02, 0.7, 0.01), darkSteel, [x, 0.012, z]); b.add(box(0.6, 0.025, 0.6, 0.01), plate, [x, 0.014, z]);
    b.add(new THREE.TorusGeometry(0.06, 0.012, 6, 10, PI), steel, [x + 0.2, 0.03, z], [PI / 2, 0, 0]);
  }
  for (const x of [2.45, 2.95]) b.add(cyl(0.025, 0.025, 2.3, 6), steel, [x, S0 + 1.15, 4.6]);
  for (let h = S0 + 0.3; h < -0.1; h += 0.3) b.add(cyl(0.018, 0.018, 0.5, 6), steel, [2.7, h, 4.6], [0, 0, PI / 2]);
  // Battery banks with status lights, along the middle at the front.
  const batLeds = [];
  for (let z = -11.2; z < -6.2; z += 0.75) {
    put(box(1.2, 1.3, 0.65, 0.04), solid('#3A4252'), [0.9, S0 + 0.65, z]);
    b.add(box(1.22, 0.06, 0.67, 0.02), mustard, [0.9, S0 + 1.32, z]);
    for (let i = 0; i < 5; i++) batLeds.push({ pos: [1.51, S0 + 0.4 + i * 0.16, z], color: i < 3 ? '#7FE0C2' : '#FFC56B' });
  }
  inst(new THREE.BoxGeometry(0.01, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), batLeds, { covers: false });
  tube([[0.4, S0 + 1.45, -11.4], [0.45, S0 + 1.5, -8.7], [0.4, S0 + 1.45, -6.0], [0.9, S0 + 1.6, -4.5]], 0.05, red, 30);
  label('BATTERIES', 1.52, S0 + 1.15, -8.7, PI / 2, 0.6);
  // Water tanks lying on their sides.
  for (const [x, c] of [[1.1, '#7FA7B0'], [2.5, '#83CBEE']]) {
    put(cyl(0.6, 0.6, 4.6, 20), solid(c, { metalness: 0.3, roughness: 0.4 }), [x, S0 + 0.7, -2.4], [PI / 2, 0, 0]);
    for (const z of [-4.2, -2.4, -0.6]) b.add(new THREE.TorusGeometry(0.61, 0.04, 6, 24), darkSteel, [x, S0 + 0.7, z]);
    for (const z of [-3.4, -1.4]) b.add(box(0.9, 0.1, 0.2, 0.02), darkSteel, [x, S0 + 0.05, z]);
  }
  label('POTABLE WATER', 2.5, S0 + 0.7, 0.05, 0, 0.6);
  // Pumps, a filter bank and a heater in the middle; pipes and cable trays the whole length.
  for (const z of [1.2, 2.3]) { put(box(0.7, 0.6, 0.6, 0.05), teal, [1.1, S0 + 0.3, z]); b.add(cyl(0.2, 0.2, 0.55, 14), darkSteel, [1.1, S0 + 0.8, z], [0, 0, PI / 2]); }
  for (let i = 0; i < 4; i++) put(cyl(0.13, 0.13, 0.8, 12), white, [1.6 + i * 0.32, S0 + 0.4, 3.6]);
  put(cyl(0.35, 0.35, 1.3, 16), coral, [2.7, S0 + 0.65, 1.6]);
  label('WATER HEATER', 2.7, S0 + 1.1, 1.23, 0, 0.5);
  for (const [x, h, r, m] of [[-3.3, S0 + 1.75, 0.08, steel], [-3.0, S0 + 1.8, 0.05, coral], [-0.1, S0 + 1.85, 0.06, steel], [1.4, S0 + 1.8, 0.04, mustard], [3.0, S0 + 1.75, 0.07, steel]])
    b.add(cyl(r, r, 23, 8), m, [x, h, 0.2], [PI / 2, 0, 0]);
  for (const x of [-2.0, 2.2]) {
    b.add(box(0.5, 0.03, 23, 0.01), grate, [x, S0 + 1.95, 0.2]);
    for (let k = 0; k < 4; k++) b.add(cyl(0.025, 0.025, 23, 5), [dark, coral, teal, mustard][k], [x - 0.15 + k * 0.1, S0 + 1.99, 0.2], [PI / 2, 0, 0]);
  }
  for (let z = -11; z < 11.5; z += 1.5) for (const x of [-2.0, 2.2]) b.add(cyl(0.015, 0.015, 0.35, 4), steel, [x, S0 + 2.1, z]);
  for (const z of [-7.8, 7.8]) for (const s of [-1, 1]) label('GEAR WELL', s * 2.9, S0 + 1.9, z + (z < 0 ? 2.3 : -2.3), z < 0 ? 0 : PI, 0.5);
  for (const z of [-10.5, -4.0, 6.0, 9.0]) {                                                     // maintenance panels on the far side
    b.add(box(0.06, 0.8, 1.0, 0.02), solid('#8E97AA'), [-hwM(-1.4, z) + 0.15, S0 + 1.0, z], [0, 0, -0.3]);
    b.add(box(0.07, 0.25, 0.35, 0.01), glow(z > 0 ? '#7FE0C2' : '#FFC56B'), [-hwM(-1.4, z) + 0.2, S0 + 1.1, z], [0, 0, -0.3]);
  }
  for (const z of [6.0, 7.2, 8.4]) put(box(0.6, 0.5, 0.5, 0.04), z === 7.2 ? crateMat : solid('#3A4252'), [0.9, S0 + 0.25, z]);
  put(cyl(0.45, 0.45, 0.9, 18), solid('#9C8FA6', { metalness: 0.3 }), [0.7, S0 + 0.45, 11.0]);
  label('SUMP', 0.7, S0 + 0.95, 10.54, 0, 0.35);
  // Crawl lights along the service deck.
  const crawl = []; for (let z = -11; z < 11.5; z += 1.1) crawl.push({ pos: [-0.95, S0 + 0.04, z], color: '#FFD9A0' });
  inst(new THREE.BoxGeometry(0.06, 0.02, 0.25), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), crawl, { covers: false });

  // ---------- Labels: little warning and room plates ----------
  for (const [text, x, h, z, ry, w] of labels)
    b.add(new THREE.PlaneGeometry(w, w * 0.22), solid('#FFFFFF', { map: T.textTexture(text, { w: 512, h: 112, bg: '#F5C542', color: '#2B3550', size: 60 }), roughness: 0.6 }), [x + Math.sin(ry) * 0.015, h, z + Math.cos(ry) * 0.015], [0, ry, 0]);

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

  // ---------- Where the pilot can walk (waypoints) and where things happen (spots), in meters ----------
  const N = (pos, links) => ({ pos, links });
  const layout = {
    nodes: {
      seatSide: N([0.1, UP, -11.1], ['U_nav']),
      U_nav: N([0.8, UP, -7.6], ['seatSide', 'U_ladder']),
      U_ladder: N([1.1, UP, -4.85], ['U_nav', 'ladderTop', 'U_lab']),
      ladderTop: N([2.6, UP, -4.85], ['U_ladder', 'ladderBot']),
      ladderBot: N([2.6, LOW, -4.85], ['ladderTop', 'L_galley']),
      U_lab: N([1.1, UP, -2.0], ['U_ladder', 'Lab_in', 'U_lab2']),
      Lab_in: N([-0.7, UP, -2.0], ['U_lab']),
      U_lab2: N([1.1, UP, 1.6], ['U_lab']),
      L_sleep: N([WALK, LOW, -11.0], ['L_bath']),
      L_bath: N([WALK, LOW, -8.0], ['L_sleep', 'L_galley', 'B_in']),
      B_in: N([-0.9, LOW, -8.5], ['L_bath']),
      L_galley: N([WALK, LOW, -5.0], ['L_bath', 'L_lounge', 'G_in', 'D_in', 'ladderBot']),
      G_in: N([-0.6, LOW, -5.35], ['L_galley']),
      D_in: N([0.85, LOW, -3.4], ['L_galley', 'L_lounge']),
      L_lounge: N([WALK, LOW, -0.8], ['L_galley', 'D_in', 'Lo_in', 'De_in', 'L_hydro']),
      Lo_in: N([-0.6, LOW, -0.1], ['L_lounge']),
      De_in: N([-0.8, LOW, 1.4], ['L_lounge', 'L_hydro']),
      L_hydro: N([WALK, LOW, 1.9], ['L_lounge', 'De_in', 'Hy_in', 'L_work']),
      Hy_in: N([-0.4, LOW, 1.85], ['L_hydro']),
      L_work: N([WALK, LOW, 4.2], ['L_hydro', 'W_in', 'L_air']),
      W_in: N([-0.6, LOW, 4.2], ['L_work']),
      L_air: N([WALK, LOW, 7.4], ['L_work', 'L_junk']),
      L_junk: N([WALK, LOW, 9.6], ['L_air', 'L_fuel']),
      L_fuel: N([WALK, LOW, 11.0], ['L_junk']),
    },
    climbs: [['ladderTop', 'ladderBot']],
    climbYaw: PI,
    spots: {
      seat: { node: 'seatSide', pos: [-0.8, UP, -12.0], yaw: 0 },
      navtable: { node: 'U_nav', pos: [-0.5, UP, -7.6], yaw: PI / 2 },
      microscope: { node: 'Lab_in', pos: [-2.2, UP, -2.55], yaw: PI / 2 },
      labBench: { node: 'Lab_in', pos: [-2.2, UP, -1.45], yaw: PI / 2 },
      whiteboard: { node: 'U_lab2', pos: [-0.7, UP, 1.95], yaw: PI },
      bunk: { node: 'L_sleep', pos: [-1.45, 0.72, -11.0], yaw: -PI / 2 },
      shower: { node: 'B_in', pos: [-2.75, 0.08, -8.5], yaw: -PI / 2 },
      stove: { node: 'G_in', pos: [-2.2, LOW, -5.35], yaw: PI / 2 },
      dining: { node: 'D_in', pos: [0.12, LOW, -3.4], yaw: PI / 2 },
      sofa: { node: 'Lo_in', pos: [-2.72, LOW, -0.85], yaw: -PI / 2 },
      desk: { node: 'De_in', pos: [-2.25, LOW, 1.4], yaw: PI / 2 },
      hydro: { node: 'Hy_in', pos: [-2.0, LOW, 1.85], yaw: PI },
      bench: { node: 'W_in', pos: [-2.2, LOW, 4.2], yaw: PI / 2 },
      junk: { node: 'L_junk', pos: [-2.3, LOW, 9.6], yaw: PI / 2 },
    },
  };

  // ---------- Clutter: keep the paths clear, then fill the free floor room by room ----------
  const deckFor = y => y > UP - 0.5 ? 'up' : 'low';
  function clearSeg(deck, a, c, r) {
    const [i0, i1] = cellRange(Math.min(a[0], c[0]) - r, Math.max(a[0], c[0]) + r, GX0, NX), [k0, k1] = cellRange(Math.min(a[2], c[2]) - r, Math.max(a[2], c[2]) + r, GZ0, NZ);
    const dx = c[0] - a[0], dz = c[2] - a[2], L2 = dx * dx + dz * dz || 1e-6;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (k + 0.5) * CELL, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / L2));
      if (Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz) < r && grid[deck][k * NX + i] !== 1) grid[deck][k * NX + i] = 2;
    }
  }
  // Anything solid closer than the pilot's half-width to a path is a layout mistake: list it (see blocked() below).
  const blocked = [];
  function checkSeg(deck, a, c, r, what) {
    const dx = c[0] - a[0], dz = c[2] - a[2], L2 = dx * dx + dz * dz || 1e-6;
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (grid[deck][k * NX + i] === 1) {
      const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (k + 0.5) * CELL, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / L2));
      if (t > 0.02 && t < 0.98 && Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz) < r) blocked.push(what + ' @ ' + x.toFixed(2) + ',' + z.toFixed(2));
    }
  }
  for (const [id, n] of Object.entries(layout.nodes)) for (const l of n.links) { const m = layout.nodes[l]; if (Math.abs(m.pos[1] - n.pos[1]) < 0.1) checkSeg(deckFor(n.pos[1]), n.pos, m.pos, 0.2, id + '-' + l); }
  for (const [id, sp] of Object.entries(layout.spots)) { const n = layout.nodes[sp.node]; checkSeg(deckFor(n.pos[1]), n.pos, sp.pos, 0.15, id); }
  for (const [id, n] of Object.entries(layout.nodes)) for (const l of n.links) { const m = layout.nodes[l]; if (Math.abs(m.pos[1] - n.pos[1]) < 0.1) clearSeg(deckFor(n.pos[1]), n.pos, m.pos, 0.5); }
  for (const s of Object.values(layout.spots)) { const n = layout.nodes[s.node]; clearSeg(deckFor(n.pos[1]), n.pos, s.pos, 0.42); }
  for (const deck of ['low', 'up']) mark(deck, 1.9, 3.3, -5.85, -4.2, 3);           // around the ladder
  mark('low', DOOR[0] - 0.1, DOOR[1] + 0.1, -13, 12.6, 3);                             // the walkway itself stays bare floor
  mark('up', DOOR[0] - 0.1, DOOR[1] + 0.1, -11.5, UPPER_END, 3);
  mark('svc', -1.6, -0.3, -12, 12, 3);                                                   // a crawl path along the service deck
  for (const bay of [[-11.1, -5.2], [5.55, 11.45]]) for (const s of [-1, 1]) mark('svc', s > 0 ? 1.5 : -4.1, s > 0 ? 4.1 : -1.5, bay[0], bay[1], 1); // gear wells

  const kits = {};
  const kit = (name, g, m) => kits[name] || (kits[name] = { g, m, list: [] });
  const add = (name, g, m, pos, rot, scale, color) => kit(name, g, m).list.push({ pos, rot, scale, color });
  const unit = new THREE.BoxGeometry(1, 1, 1), uCyl = new THREE.CylinderGeometry(1, 1, 1, 10), uTorus = new THREE.TorusGeometry(1, 0.28, 6, 14);
  const card = ['#C9A06A', '#BF955E', '#D2AE7A', '#B98E66'], fabric = ['#E9A93A', '#3FA7B5', '#F3EADB', '#9C8BE0', '#FF9DAE', '#7FA7B0', '#E05A4F', '#5E8C8C'];
  const kitsOf = {
    cardBox: (x, f, z, big) => { const w = big ? 0.32 + rnd() * 0.12 : 0.18 + rnd() * 0.08, h = w * (0.6 + rnd() * 0.5); add('box', unit, paint, [x, f + h / 2, z], [0, rnd() * PI, 0], [w, h, w * (0.8 + rnd() * 0.3)], pick(card)); return h; },
    stack: (x, f, z, big, low) => { let y = f; const n = low ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 2); for (let k = 0; k < n; k++) { const w = 0.4 - k * 0.06 + rnd() * 0.04, h = 0.22 + rnd() * 0.14; add('box', unit, paint, [x + (rnd() - 0.5) * 0.05, y + h / 2, z + (rnd() - 0.5) * 0.05], [0, rnd() * 0.6, 0], [w, h, w * 0.85], pick(card)); y += h; } },
    openBox: (x, f, z) => { const w = 0.36 + rnd() * 0.08, h = 0.26 + rnd() * 0.1, r = rnd() * PI; add('box', unit, paint, [x, f + h / 2, z], [0, r, 0], [w, h, w * 0.85], pick(card));
      for (const s of [-1, 1]) add('flap', unit, paint, [x + Math.cos(r) * s * (w / 2 + 0.08), f + h + 0.04, z - Math.sin(r) * s * (w / 2 + 0.08)], [0, r, s * 0.9], [0.2, 0.012, w * 0.85], '#C29A62');
      for (let k = 0; k < 3; k++) add('blob', blob, paint, [x + (rnd() - 0.5) * w * 0.4, f + h + 0.02, z + (rnd() - 0.5) * w * 0.4], [rnd(), rnd(), 0], [0.07, 0.05, 0.06], pick(fabric)); },
    crate: (x, f, z) => { const s = 0.4 + rnd() * 0.08; add('crate', unit, crateMat, [x, f + s / 2, z], [0, rnd() * 0.5, 0], [s, s, s]); },
    bag: (x, f, z) => { const c = pick(['#2E3A33', '#2B3550', '#3A3A3A', '#4A5A3A']); add('bag', blob, solid('#FFFFFF', { roughness: 0.4, flatShading: true }), [x, f + 0.2, z], [rnd() * 0.3, rnd() * PI, 0], [0.2, 0.22, 0.18], c); add('tie', blob, paint, [x, f + 0.43, z], [0, 0, 0], [0.04, 0.05, 0.04], c); },
    laundry: (x, f, z) => { for (let k = 0; k < 3; k++) add('cloth', blob, solid('#FFFFFF', { roughness: 0.95, flatShading: true }), [x + (rnd() - 0.5) * 0.2, f + 0.05 + k * 0.05, z + (rnd() - 0.5) * 0.2], [rnd(), rnd() * PI, rnd()], [0.17, 0.05, 0.12], pick(fabric)); },
    papers: (x, f, z) => { const n = 2 + Math.floor(rnd() * 6), r = rnd() * PI; for (let k = 0; k < n; k++) add('paper', unit, paint, [x + (rnd() - 0.5) * 0.04, f + 0.005 + k * 0.012, z + (rnd() - 0.5) * 0.04], [0, r + (rnd() - 0.5) * 0.4, 0], [0.21, 0.01, 0.29], k % 4 === 3 ? '#FFF3B0' : '#F7F5F0'); },
    books: (x, f, z) => { const n = 2 + Math.floor(rnd() * 4); for (let k = 0; k < n; k++) add('book', unit, paint, [x, f + 0.02 + k * 0.04, z], [0, rnd() * PI, 0], [0.16, 0.035, 0.23], pick(bookColors)); },
    tools: (x, f, z) => { for (let k = 0; k < 2; k++) { const r = rnd() * PI; add('tool', unit, solid('#FFFFFF', { metalness: 0.4, roughness: 0.4 }), [x + (rnd() - 0.5) * 0.12, f + 0.015, z + (rnd() - 0.5) * 0.12], [0, r, 0], [0.04, 0.03, 0.22], pick(toolColors)); } },
    parts: (x, f, z) => { add('gear', uTorus, solid('#8E97AA', { metalness: 0.6, roughness: 0.4 }), [x, f + 0.025, z], [PI / 2, 0, 0], [0.07, 0.07, 0.07]); add('can', uCyl, solid('#FFFFFF', { metalness: 0.4, roughness: 0.4 }), [x + 0.08, f + 0.06, z + 0.06], [0, 0, rnd() < 0.4 ? PI / 2 : 0], [0.05, 0.12, 0.05], pick(['#AEB7C8', '#59627A', '#E05A4F', '#F2B33D'])); },
    coil: (x, f, z) => { add('coil', uTorus, solid('#FFFFFF', { roughness: 0.7 }), [x, f + 0.04, z], [PI / 2, 0, 0], [0.16, 0.16, 0.16], pick(['#2B3550', '#E05A4F', '#F2B33D', '#3A3A3A', '#3FA7B5'])); },
    toy: (x, f, z) => { const c = pick(['#B98059', '#FF9DAE', '#9C8BE0', '#7FE0C2']), r = rnd() * PI;
      add('toy', blob, solid('#FFFFFF', { roughness: 1 }), [x, f + 0.09, z], [0, r, 0], [0.09, 0.1, 0.08], c); add('toy', blob, solid('#FFFFFF', { roughness: 1 }), [x, f + 0.22, z], [0, r, 0], [0.07, 0.07, 0.07], c);
      for (const s of [-1, 1]) add('toy', blob, solid('#FFFFFF', { roughness: 1 }), [x + Math.cos(r) * s * 0.05, f + 0.28, z - Math.sin(r) * s * 0.05], [0, 0, 0], [0.025, 0.025, 0.025], c); },
    bottles: (x, f, z) => { for (let k = 0; k < 3; k++) add('bottle', uCyl, solid('#FFFFFF', { roughness: 0.3 }), [x + (k - 1) * 0.07, f + 0.1, z + (rnd() - 0.5) * 0.08], [0, 0, rnd() < 0.2 ? PI / 2 : 0], [0.03, 0.2, 0.03], pick(['#7FE0C2', '#83CBEE', '#E9876B', '#F3EADB'])); },
    bucket: (x, f, z) => { add('bucket', new THREE.CylinderGeometry(1, 0.8, 1, 12, 1, true), solid('#FFFFFF', { side: THREE.DoubleSide }), [x, f + 0.15, z], [0, 0, 0], [0.15, 0.3, 0.15], pick(['#3FA7B5', '#FF7A59', '#F2B33D'])); },
    shoes: (x, f, z) => { const r = rnd() * PI; for (const s of [-1, 1]) add('shoe', unit, solid('#FFFFFF', { roughness: 0.8 }), [x + Math.cos(r) * s * 0.06, f + 0.04, z - Math.sin(r) * s * 0.06], [0, r + s * 0.2, 0], [0.09, 0.08, 0.26], '#6B4A33'); },
  };
  const THEMES = {
    bunk: { big: ['laundry', 'stack', 'openBox', 'bag', 'toy', 'cardBox'], small: ['books', 'shoes', 'papers', 'laundry', 'toy'], density: [0.8, 0.45] },
    bath: { big: ['laundry', 'bucket'], small: ['bottles', 'laundry'], density: [0.55, 0.3] },
    galley: { big: ['cardBox', 'bag', 'crate', 'openBox', 'stack'], small: ['bottles', 'bucket', 'papers', 'shoes'], density: [0.7, 0.35] },
    lounge: { big: ['stack', 'openBox', 'laundry', 'toy', 'cardBox'], small: ['books', 'papers', 'toy', 'laundry', 'shoes'], density: [0.8, 0.45] },
    control: { big: ['cardBox', 'crate', 'openBox'], small: ['papers', 'coil', 'parts', 'tools', 'bottles'], density: [0.55, 0.35] },
    lab: { big: ['crate', 'cardBox', 'openBox'], small: ['papers', 'bottles', 'parts', 'coil', 'books'], density: [0.65, 0.4] },
    work: { big: ['crate', 'openBox', 'stack', 'coil'], small: ['tools', 'parts', 'coil', 'parts', 'bucket'], density: [0.85, 0.5] },
    junk: { big: ['stack', 'crate', 'bag', 'openBox', 'coil', 'toy'], small: ['parts', 'tools', 'coil', 'bottles', 'books'], density: [0.95, 0.6] },
    fuel: { big: ['crate', 'coil', 'bucket'], small: ['parts', 'tools', 'coil'], density: [0.7, 0.4] },
    svc: { big: ['coil', 'crate', 'bucket'], small: ['parts', 'coil', 'tools', 'bottles'], density: [0.3, 0.2] },
  };
  const ROOMS = [
    ['low', -3.3, 3.3, -12.5, -9.3, 'bunk'], ['low', -3.3, 3.3, -9.1, -6.9, 'bath'], ['low', -3.3, 3.3, -6.7, -2.7, 'galley'],
    ['low', -3.3, 3.3, -2.7, 2.5, 'lounge'], ['low', -3.3, 3.3, 2.7, 6.4, 'work'], ['low', -4.6, 4.6, 8.45, 10.7, 'junk'],
    ['low', -4.0, 3.5, 10.9, 12.5, 'fuel'], ['low', -0.6, 3.3, 6.5, 8.3, 'work'],
    ['up', -3.3, 3.3, -11.4, -4.1, 'control'], ['up', -3.3, 3.3, -3.9, 2.5, 'lab'],
    ['svc', -4.2, 4.2, -11.8, 11.8, 'svc'],
  ];
  // Cables and hoses snaking across the floor between the furniture (never across a path).
  for (const [deck, x0, x1, z0, z1] of [['low', -3.2, -0.4, -12.4, 6.3], ['up', -3.2, -0.3, -11.3, 2.4], ['low', -4.4, -0.5, 8.5, 10.6], ['svc', -4, -0.3, -11.5, 11.5]]) {
    for (let n = 0; n < 6; n++) {
      const pts = []; let x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), ok = true;
      for (let k = 0; k < 5 && ok; k++) {
        const [i] = cellRange(x, x, GX0, NX), [kk] = cellRange(z, z, GZ0, NZ);
        if (grid[deck][kk * NX + i] !== 0) { ok = k > 1; break; }
        pts.push([x, DECKS[deck] + 0.02, z]); x += (rnd() - 0.5) * 0.7; z += (rnd() - 0.3) * 0.8;
      }
      if (pts.length > 2) tube(pts, 0.018 + rnd() * 0.015, pick([dark, coral, mustard, teal, darkSteel]), 24);
    }
  }
  for (const [deck, x0, x1, z0, z1, theme] of ROOMS) {
    const th = THEMES[theme], f = DECKS[deck];
    const [i0, i1] = cellRange(x0, x1, GX0, NX), [k0, k1] = cellRange(z0, z1, GZ0, NZ);
    const inHull = (i, k) => { const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (k + 0.5) * CELL; return Math.abs(x) < hwM(f + 0.3, z) - 0.35 && Math.abs(x) < hwM(f + 1.0, z) - 0.3; };
    const blocks = [];
    for (let k = k0; k < k1; k += 2) for (let i = i0; i < i1; i += 2) blocks.push([i, k]);
    blocks.sort(() => rnd() - 0.5);
    for (const [i, k] of blocks) {                                                       // big things in 0.5 m blocks
      if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, c]) => free(deck, i + a, k + c) && inHull(i + a, k + c))) continue;
      if (rnd() > th.density[0]) continue;
      const x = GX0 + (i + 1) * CELL, z = GZ0 + (k + 1) * CELL;
      kitsOf[pick(th.big)](x, f, z, true, x > 1.8);                                       // keep it low on the near side, for the cutaway
      for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) grid[deck][(k + c) * NX + i + a] = 1;
    }
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {                       // small things in what's left
      if (!free(deck, i, k) || !inHull(i, k) || rnd() > th.density[1]) continue;
      kitsOf[pick(th.small)](GX0 + (i + 0.5) * CELL, f, GZ0 + (k + 0.5) * CELL, false);
      grid[deck][k * NX + i] = 1;
    }
  }
  // Overflowing wall shelves, and things hung from the ceiling.
  const shelfStuff = [];
  for (const [x, h, z0, z1] of [[-3.2, 1.95, -11.8, -10.2], [-3.25, 1.75, -7.7, -6.9], [-3.2, 2.35, 0.95, 1.85], [-3.2, UP + 1.95, -2.95, -0.25], [-3.2, UP + 2.4, -10.4, -8.6], [-3.2, 2.0, 11.0, 12.3]]) {
    if (z1 - z0 > 0) for (let z = z0 + 0.06; z < z1 - 0.05; z += 0.09 + rnd() * 0.08) {
      const k = rnd(), w = 0.08 + rnd() * 0.1, hh = 0.1 + rnd() * 0.22;
      shelfStuff.push({ pos: [x + (rnd() - 0.5) * 0.08, h + 0.02 + hh / 2, z], rot: [k < 0.15 ? 0.3 : 0, rnd(), 0], scale: [w, hh, 0.06 + rnd() * 0.1], color: pick([...card, ...bookColors, ...fabric]) });
      if (rnd() < 0.3) shelfStuff.push({ pos: [x, h + hh + 0.06, z], rot: [0, rnd(), 0], scale: [0.12, 0.08, 0.1], color: pick(card) });
    }
  }
  inst(unit, paint, shelfStuff, { covers: false });
  const hang = [];
  for (const [h, x0, x1, z0, z1, L0, L1] of [[3.0, -2.5, 0.2, -12.2, -9.6, 0.25, 0.5], [3.0, -2.5, 0.2, -2.5, 1.8, 0.25, 0.5], [CEIL, -2.5, 0.2, -3.4, 2.0, 0.25, 0.5],
    [6.08, -2.8, 0.2, 4.2, 4.2, 1.0, 1.8], [6.08, -3.0, 2.0, 9.6, 9.6, 1.2, 2.0], [CEIL, -2.5, -0.2, -10.2, -5.0, 0.25, 0.5], [3.0, -2.5, 0.2, -6.5, -3.4, 0.25, 0.45]]) {
    for (let n = 0; n < 4; n++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), len = L0 + rnd() * (L1 - L0), kind = Math.floor(rnd() * 4);
      b.add(cyl(0.006, 0.006, len, 4), dark, [x, h - len / 2, z]);
      const y = h - len;
      if (kind === 0) { b.add(cyl(0.12, 0.09, 0.14, 10), pot, [x, y - 0.07, z]); for (let k = 0; k < 6; k++) hang.push({ pos: [x + Math.cos(k) * 0.1, y - 0.12 - (k % 3) * 0.08, z + Math.sin(k) * 0.1], rot: [0.5, k, 0], scale: [0.04, 0.16, 0.03], color: k % 2 ? '#5BAF6A' : '#3E8C5E' }); }
      else if (kind === 1) { b.add(cyl(0.07, 0.12, 0.12, 12), glow('#FFE2A8'), [x, y - 0.06, z]); }
      else if (kind === 2) { b.add(new THREE.SphereGeometry(0.18, 8, 6), solid('#6B5B45', { wireframe: true }), [x, y - 0.18, z]); for (let k = 0; k < 3; k++) hang.push({ pos: [x + (k - 1) * 0.06, y - 0.2, z], rot: [k, k, 0], scale: 0.07, color: pick(fabric) }); }
      else { for (let k = 0; k < 3; k++) hang.push({ pos: [x, y - 0.05 - k * 0.07, z + (k - 1) * 0.03], rot: [0, k, 0.3], scale: [0.03, 0.12, 0.03], color: pick(['#7FA35A', '#C9A27A', '#E9876B']) }); }
    }
  }
  inst(blob, solid('#FFFFFF', { roughness: 0.85, flatShading: true }), hang, { covers: false });
  for (const k of Object.values(kits)) inst(k.g, k.m, k.list, { covers: false });

  b.build(inside);

  // ---------- Helpers ----------
  function chair(x, z, ry, stool = false, upsideDown = false, floor = LOW) {
    const g = new THREE.Group();
    g.add(mesh(box(0.44, 0.05, 0.44, 0.02), stool ? coralFab : wood, [0, 0.46, 0]));
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.add(mesh(cyl(0.022, 0.022, 0.45, 6), steel, [dx, 0.225, dz]));
    if (!stool) g.add(mesh(box(0.42, 0.45, 0.04, 0.02), wood, [0, 0.72, 0.2]));
    g.position.set(x, floor + (upsideDown ? 0.95 : 0), z); g.rotation.set(upsideDown ? PI : 0, ry, 0); g.updateMatrixWorld();
    g.traverse(o => { if (o.isMesh) { const w = new THREE.Mesh(o.geometry, o.material); w.applyMatrix4(o.matrixWorld); b.addMesh(w); } });
    mark(deckOf(floor), x - 0.26, x + 0.26, z - 0.26, z + 0.26);
  }
  function plant([x, y, z], size, withPot = true) {
    if (withPot) { put(cyl(0.2 * size, 0.15 * size, 0.35 * size, 12), pot, [x, y + 0.175 * size, z]); b.add(new THREE.TorusGeometry(0.2 * size, 0.025 * size, 6, 16), pot, [x, y + 0.35 * size, z], [PI / 2, 0, 0]); }
    const base = y + (withPot ? 0.35 : 0) * size;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, h = 0.15 + (i % 3) * 0.12;
      b.add(lowBall, i % 2 ? leaf : leaf2, [x + Math.cos(a) * 0.12 * size, base + h * size, z + Math.sin(a) * 0.12 * size], [0.6 * Math.cos(a), a, 0.6 * Math.sin(a)], [0.07 * size, 0.2 * size, 0.04 * size]);
    }
  }
  function suit(x, z, i) {
    const s = solid('#EDE6D6', { roughness: 0.85 }), dk = solid('#8E8A80', { roughness: 0.9 });
    b.add(new THREE.CapsuleGeometry(0.24, 0.35, 6, 14), s, [x, 1.45, z - 0.05], [0, 0, 0], [1, 1, 0.75]);
    b.add(box(0.42, 0.55, 0.22, 0.06), solid('#C9C2B2'), [x, 1.5, z + 0.12]);
    for (const sx of [-1, 1]) {
      b.add(new THREE.CapsuleGeometry(0.09, 0.45, 4, 10), s, [x + sx * 0.3, 1.25, z - 0.05], [0, 0, sx * 0.08]);
      b.add(sphere, dk, [x + sx * 0.32, 0.95, z - 0.05], [0, 0, 0], [0.07, 0.08, 0.07]);
      b.add(new THREE.CapsuleGeometry(0.1, 0.45, 4, 10), s, [x + sx * 0.12, 0.6, z - 0.05]);
      b.add(box(0.16, 0.12, 0.26, 0.04), dk, [x + sx * 0.12, 0.08, z - 0.08]);
    }
    b.add(sphere, s, [x, 2.0, z - 0.05], [0, 0, 0], 0.2);
    b.add(new THREE.SphereGeometry(1, 16, 10, PI * 1.15, PI * 0.7, PI * 0.3, PI * 0.35), solid('#E3A93A', { metalness: 0.7, roughness: 0.15 }), [x, 2.0, z - 0.05], [0, 0, 0], 0.205);
    b.add(cyl(0.05, 0.05, 0.04, 12), solid(['#FF7A59', '#3FA7B5', '#F2B33D'][i]), [x - 0.14, 1.6, z - 0.24], [PI / 2, 0, 0]);
    b.add(new THREE.TorusGeometry(0.2, 0.035, 6, 16), solid('#6B4A33'), [x, 1.12, z - 0.05], [PI / 2, 0, 0]);
    b.add(new THREE.TorusGeometry(0.12, 0.012, 4, 12, PI), steel, [x, 2.15, z + 0.02], [0, PI / 2, 0]);
  }
  function puffGroup(x, y, z, rise) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i < 6; i++) { const s = sprite('#FFFFFF', 0.3, 0.3, true); s.userData = { t: i / 6, rise }; g.add(s); }
    return g;
  }

  // ---------- Live bits ----------
  let t = 0, framesKey = '';
  return {
    layout, props: { pan, steam, bowl, showerSteam, bubbles }, clickables: [screens[1]], blocked,
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
      for (let i = 0; i < Math.min(5, done); i++) trophies.add(mesh(cup, goldMat(), [-3.18, 2.365, 1.05 + i * 0.18]));
    },
    update(dt, { reduced, visible }) {
      t += dt;
      if (!visible) return;
      if (!reduced) {
        chart.update(t); budget.update(t + 3);
        holo.rotation.z += dt * 0.4; holoPlanet.rotation.y += dt * 0.3; holoChart.rotation.y += dt * 0.15;
        ledMesh.visible = (t % 2.2) > 0.15;
        for (const [i, l] of tankGlow.entries()) l.material.opacity = 0.5 + Math.sin(t * 0.8 + i * 2) * 0.08;
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
