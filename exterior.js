// The outside of the ship, in world units: the lofted hull with its windshield and portholes, and everything bolted on.
// It reads as a working ship that has been added to over the years: a dorsal spine with pipes, stub wings carrying two
// thruster nacelles, cargo pods strapped to the left flank, an added-on module on the right, an observation dome,
// radiator fins, folded solar wings, mismatched antennas and dishes, a plated belly with sensor pods, and four
// landing legs that fold into wells in the belly.
// Everything here, landing gear included, uses hull materials, so the near side slides away in the cutaway.
import * as THREE from 'three';
import { STATIONS, profileAt, halfWidth, topY, bottomY, onHull, onTop, onBottom, hullGeometry, UV } from './hull.js';

const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pose = o => [o.position.toArray(), [o.rotation.x, o.rotation.y, o.rotation.z]];

export function buildExterior(body, K) {
  const { C, hullMat, solid, basic, geo, mesh, makeBatch, T, cutPlanes, windows, windowR } = K;
  const ext = makeBatch();
  const metalTex = T.metalTexture();
  const metalClip = hullMat('#AEB7C8', { map: metalTex, metalness: 0.55, roughness: 0.35 });
  const steelClip = hullMat('#8E97AA', { metalness: 0.5, roughness: 0.4 });
  const darkClip = hullMat('#2B3550', { roughness: 0.7 }), blackClip = hullMat('#151A26', { roughness: 0.8 });
  const accentClip = hullMat(C.accent), secondClip = hullMat(C.secondary), creamClip = hullMat('#E9E0CE');
  const tealGrey = hullMat('#7FA3A8', { roughness: 0.6 }), mustardClip = hullMat('#F2B33D');
  const hazard = hullMat('#FFFFFF', { map: T.hazardTexture() });
  const solarMat = hullMat('#FFFFFF', { map: T.solarTexture(), metalness: 0.3, roughness: 0.3 });
  const radMat = hullMat('#FFFFFF', { map: T.radiatorTexture(), metalness: 0.4, roughness: 0.35 });
  for (const m of [accentClip, secondClip]) { m.emissive = m.color.clone(); m.emissiveIntensity = 0.1; }
  const put = (g, m, pos, rot = [0, 0, 0], scale = 1) => ext.add(g, m, pos, rot, scale);
  const box = (w, h, d, r) => geo.box(w, h, d, r ?? Math.min(0.04, w / 4, h / 4, d / 4));
  // A cylinder from a to b.
  const beam = (a, b, r, m, seg = 8, r1 = r) => {
    const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()), e = new THREE.Euler().setFromQuaternion(q);
    put(geo.cyl(r1, r, d.length(), seg), m, a.clone().add(b).multiplyScalar(0.5).toArray(), [e.x, e.y, e.z]);
  };
  const tube = (pts, r, m, seg = 40) => put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8), m);
  const runningLights = [];

  // ---------- The shell, the windshield and the portholes ----------
  const shellGeo = hullGeometry();
  const tex = T.loftTextures({ main: C.main, secondary: C.secondary, accent: C.accent, u: UV.u, side: UV.side, roof: UV.roof, belly: UV.belly,
    windows: windows.map(w => ({ z: w.z, y: w.y, r: windowR })), bays: K.bays, seamsZ: [-5.6, -4.9, 1.56, 5.0, 5.7] });
  const shellMat = hullMat(C.main, { color: '#FFFFFF', map: tex.map, bumpMap: tex.bumpMap, bumpScale: 1.2, roughnessMap: tex.roughnessMap, alphaMap: tex.alphaMap, alphaTest: 0.5 });
  shellMat.emissive = new THREE.Color('#FFFFFF'); shellMat.emissiveMap = tex.map; shellMat.emissiveIntensity = 0.13;
  const shell = new THREE.Mesh(shellGeo.hull, shellMat); body.add(shell);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#9FD8EE', transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.35, depthWrite: false, side: THREE.DoubleSide,
    emissive: '#FFB866', emissiveIntensity: 0.05, clippingPlanes: cutPlanes });
  const windshield = new THREE.Mesh(shellGeo.glass, glassMat); windshield.renderOrder = 3; body.add(windshield);
  for (const [a, b] of shellGeo.glassEdges) beam(V(...a), V(...b), 0.055, darkClip, 6);
  const paneGeo = new THREE.PlaneGeometry(windowR * 2, windowR * 2);
  for (const w of windows) {
    const pane = onHull(mesh(paneGeo, glassMat), w.side, w.y, w.z, -0.03); pane.renderOrder = 3; body.add(pane);
    const f = onHull(new THREE.Object3D(), w.side, w.y, w.z, 0.03);
    for (const [dx, dy, bw, bh] of [[0, windowR + 0.05, windowR * 2 + 0.2, 0.1], [0, -windowR - 0.05, windowR * 2 + 0.2, 0.1], [windowR + 0.05, 0, 0.1, windowR * 2], [-windowR - 0.05, 0, 0.1, windowR * 2]]) {
      const o = f.clone(); o.translateX(dx); o.translateY(dy); put(box(bw, bh, 0.07, 0.03), steelClip, ...pose(o));
    }
    const hood = f.clone(); hood.translateY(windowR + 0.13); hood.translateZ(0.08); hood.rotateX(0.5); put(box(windowR * 2 + 0.25, 0.04, 0.22, 0.015), darkClip, ...pose(hood)); // a little sun hood
  }

  // ---------- Collars where the hull sections join (stepped, layered look) ----------
  function collar(z, width, out, m) {
    const p = profileAt(z), k = 1 + out / 2.2, g = p.map(([x, y]) => [x * k, -1 + (y + 1) * k]);
    const pts = [];
    const quad = (a, b, c, d) => pts.push(a, b, c, a, c, d);
    for (const s of [-1, 1]) for (let j = 0; j < 7; j++) {
      const A0 = V(s * g[j][0], g[j][1], z - width / 2), A1 = V(s * g[j + 1][0], g[j + 1][1], z - width / 2);
      const B0 = V(s * g[j][0], g[j][1], z + width / 2), B1 = V(s * g[j + 1][0], g[j + 1][1], z + width / 2);
      const I0 = V(s * p[j][0], p[j][1], z - width / 2), I1 = V(s * p[j + 1][0], p[j + 1][1], z - width / 2);
      const J0 = V(s * p[j][0], p[j][1], z + width / 2), J1 = V(s * p[j + 1][0], p[j + 1][1], z + width / 2);
      quad(A0, B0, B1, A1); quad(I0, A0, A1, I1); quad(J0, J1, B1, B0);
    }
    const geo2 = new THREE.BufferGeometry().setFromPoints(pts); geo2.computeVertexNormals();
    put(geo2, m);
    // Bolts around it.
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) for (let t = 0.25; t < 1; t += 0.5) {
      const x = g[k][0] + (g[k + 1][0] - g[k][0]) * t, y = g[k][1] + (g[k + 1][1] - g[k][1]) * t;
      put(geo.cyl(0.035, 0.035, width + 0.04, 6), darkClip, [s * x, y, z], [PI / 2, 0, 0]);
    }
  }
  collar(-4.9, 0.22, 0.05, metalClip);
  collar(1.56, 0.2, 0.08, steelClip);
  collar(5.0, 0.25, 0.06, metalClip);
  collar(5.85, 0.18, 0.04, darkClip);

  // ---------- Armour plates on the skirt and the prow ----------
  for (const s of [-1, 1]) {
    for (let z = -5.2; z < 5.2; z += 1.25) {
      if (s < 0 && Math.abs(z - 3.37) < 0.8) continue; // leave the airlock clear
      const o = onHull(new THREE.Object3D(), s, -2.45, z + 0.6, 0.06);
      put(box(1.15, 0.42, 0.1, 0.03), z > 1.6 ? tealGrey : secondClip, ...pose(o));
      for (const dx of [-0.48, 0.48]) { const b = o.clone(); b.translateX(dx); b.translateZ(0.06); b.rotateX(PI / 2); put(geo.cyl(0.03, 0.03, 0.04, 6), darkClip, ...pose(b)); }
    }
    for (const [y, z, w, h] of [[-1.9, -6.75, 0.55, 0.5], [-1.4, -6.2, 0.7, 0.45], [-2.3, -6.0, 0.8, 0.3]]) { const o = onHull(new THREE.Object3D(), s, y, z, 0.05); put(box(w, h, 0.09, 0.03), creamClip, ...pose(o)); }
    // A pipe run and a cable along each side, under the upper windows.
    const pts = [], cab = [];
    for (let z = -4.6; z <= 5.4; z += 0.5) { pts.push(V(s * (halfWidth(-0.55, z) + 0.08), -0.55, z)); cab.push(V(s * (halfWidth(-0.72, z) + 0.06), -0.72 + Math.sin(z * 2) * 0.03, z)); }
    tube(pts, 0.06, metalClip, 50); tube(cab, 0.035, accentClip, 50);
    for (let z = -4.2; z < 5.4; z += 1.1) { const o = onHull(new THREE.Object3D(), s, -0.62, z, 0.05); put(box(0.08, 0.3, 0.08, 0.02), darkClip, ...pose(o)); }
    // Vents low on the back section, by the fuel room.
    for (const z of [4.9, 5.45]) {
      const v = onHull(new THREE.Object3D(), s, -1.2, z, 0.04); put(box(0.42, 0.7, 0.06, 0.04), darkClip, ...pose(v));
      for (let i = -2; i <= 2; i++) { const o = v.clone(); o.translateY(i * 0.12); o.translateZ(0.04); put(box(0.36, 0.05, 0.06, 0.015), steelClip, ...pose(o)); }
    }
    // Headlights on the prow.
    const l = onHull(new THREE.Object3D(), s, -2.05, -7.25, 0.03);
    put(geo.cyl(0.17, 0.2, 0.12, 14), darkClip, l.position.toArray(), [l.rotation.x + PI / 2, l.rotation.y, l.rotation.z]);
    body.add(mesh(new THREE.CircleGeometry(0.14, 14), basic('#FFF4D6', true), l.clone().translateZ(0.07).position.toArray(), [l.rotation.x, l.rotation.y, l.rotation.z]));
  }

  // ---------- Cargo doors (hangar-style bays) over the junk bay, both sides ----------
  for (const s of [-1, 1]) {
    const d = onHull(new THREE.Object3D(), s, -1.3, 4.4, 0.04);
    put(box(1.25, 1.55, 0.06, 0.04), hazard, ...pose(d));
    const door = d.clone(); door.translateZ(0.04); put(box(1.1, 1.4, 0.08, 0.04), steelClip, ...pose(door));
    for (let i = -3; i <= 3; i++) { const r = door.clone(); r.translateY(i * 0.19); r.translateZ(0.05); put(box(1.05, 0.06, 0.05, 0.02), metalClip, ...pose(r)); }
    for (const dx of [-0.6, 0.6]) { const r = door.clone(); r.translateX(dx); r.translateZ(0.06); put(box(0.08, 1.5, 0.1, 0.03), darkClip, ...pose(r)); }
  }

  // ---------- The outer airlock hatch (left side, level with the airlock inside), with a hand wheel and handholds ----------
  { const h = onHull(new THREE.Object3D(), -1, K.airlockY, K.airlockZ, 0.04), at = (dz, extra = []) => { const o = h.clone(); o.translateZ(dz); return [...pose(o), ...extra]; };
    put(new THREE.TorusGeometry(0.42, 0.07, 10, 28), metalClip, ...at(0));
    put(new THREE.CircleGeometry(0.4, 28), steelClip, ...at(0.01));
    put(new THREE.TorusGeometry(0.52, 0.04, 8, 28), hazard, ...at(0.005));
    put(new THREE.TorusGeometry(0.16, 0.028, 8, 20), hullMat('#E05A4F'), ...at(0.06));
    for (let i = 0; i < 3; i++) { const o = h.clone(); o.translateZ(0.06); o.rotateZ(i * PI / 3); put(box(0.34, 0.03, 0.03, 0.01), metalClip, ...pose(o)); }
    for (const dx of [-0.72, 0.72]) { const o = h.clone(); o.translateX(dx); o.translateZ(0.1); put(new THREE.TorusGeometry(0.16, 0.025, 6, 12, PI), mustardClip, ...pose(o)); } }

  // ---------- Dorsal spine: modules along the roof with pipes and conduits, ending in a tail fin ----------
  const spineX = 0.28;
  for (const [z0, z1, h] of [[-4.6, -3.2, 0.36], [-3.1, -1.5, 0.44], [-1.4, 0.2, 0.4], [0.3, 1.45, 0.48], [1.7, 3.3, 0.5], [3.4, 5.3, 0.42]]) {
    const zc = (z0 + z1) / 2, y = topY(spineX, zc);
    put(box(0.72, h, z1 - z0, 0.06), zc > 1.6 ? tealGrey : creamClip, [spineX, y + h / 2, zc]);
    put(box(0.78, 0.08, z1 - z0 + 0.04, 0.03), metalClip, [spineX, y + h, zc]);
    for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.55) put(box(0.3, 0.05, 0.18, 0.02), darkClip, [spineX + 0.12, y + h + 0.05, z]);
  }
  put(new THREE.CylinderGeometry(0.01, 0.42, 0.9, 4, 1).rotateX(-PI / 2).rotateZ(PI / 4).scale(1, 0.5, 1), creamClip, [spineX, topY(spineX, -4.9) + 0.18, -4.95]); // nose of the spine
  for (const [dx, dy, r, m] of [[-0.48, 0.12, 0.07, metalClip], [-0.6, 0.08, 0.045, accentClip], [0.47, 0.1, 0.06, steelClip], [0.58, 0.06, 0.035, secondClip]]) {
    const pts = []; for (let z = -4.5; z <= 5.2; z += 0.4) pts.push(V(spineX + dx, topY(spineX + dx, z) + dy, z));
    tube(pts, r, m, 60);
  }
  for (let z = -4.2; z < 5.2; z += 0.8) for (const dx of [-0.52, 0.52]) put(box(0.18, 0.2, 0.1, 0.02), darkClip, [spineX + dx, topY(spineX + dx, z) + 0.1, z]);
  { const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(2.4, 0); fin.lineTo(2.3, 0.45); fin.lineTo(1.75, 2.1); fin.lineTo(1.2, 2.1); fin.lineTo(0.4, 0.5); fin.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -0.06).rotateY(-PI / 2);
    const y = topY(spineX, 4.3) + 0.42;
    put(g, accentClip, [spineX, y, 3.4]);
    const tip = mesh(geo.ball, basic('#FFFFFF', true), [spineX, y + 2.15, 3.4 + 1.5], [0, 0, 0], 0.09); body.add(tip); runningLights.push(tip);
    put(box(0.1, 0.06, 0.45, 0.02), hazard, [spineX, y + 1.95, 4.85]); }

  // ---------- Observation dome on the roof, over the lab ----------
  { const x = -0.78, z = -0.9, y = topY(x, z);
    put(geo.cyl(0.66, 0.72, 0.18, 24), metalClip, [x, y + 0.06, z]);
    const dome = mesh(new THREE.SphereGeometry(0.58, 24, 12, 0, 2 * PI, 0, PI / 2), glassMat, [x, y + 0.15, z]); dome.renderOrder = 3; body.add(dome);
    for (let i = 0; i < 4; i++) put(new THREE.TorusGeometry(0.585, 0.025, 6, 20, PI), darkClip, [x, y + 0.15, z], [0, i * PI / 4, 0]);
    put(new THREE.TorusGeometry(0.6, 0.04, 6, 24), darkClip, [x, y + 0.17, z], [PI / 2, 0, 0]);
    put(geo.cyl(0.1, 0.12, 0.35, 10), darkClip, [x, y + 0.3, z], [0.5, 0.4, 0]); } // the lab's telescope, peeking

  // ---------- Stub wings and side thruster nacelles ----------
  const nacelleGlow = [];
  const wing = new THREE.Shape(); wing.moveTo(0, 0.1); wing.lineTo(0, 4.0); wing.lineTo(2.35, 4.3); wing.lineTo(2.35, 2.7); wing.lineTo(0, 0.1);
  const wingGeo = new THREE.ExtrudeGeometry(wing, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }).rotateX(PI / 2);
  const nacLathe = new THREE.LatheGeometry([[0.36, -1.95], [0.5, -1.9], [0.6, -1.7], [0.64, -1.4], [0.64, 1.1], [0.58, 1.4], [0.44, 1.55]].map(([r, y]) => new THREE.Vector2(r, y)), 24).rotateX(PI / 2);
  const bell = new THREE.LatheGeometry([[0.26, 0], [0.32, 0.18], [0.44, 0.45], [0.54, 0.68], [0.5, 0.68], [0.4, 0.45], [0.28, 0.18], [0.22, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 18).rotateX(PI / 2);
  for (const s of [-1, 1]) {
    // A stub wing from the chine, swept back and angled down a little, with the nacelle on its tip.
    const wg = wingGeo.clone(); if (s < 0) wg.scale(-1, 1, 1);
    put(wg, s > 0 ? secondClip : tealGrey, [s * 2.5, -2.7, 0], [0, 0, -s * 0.12]);
    put(box(0.14, 0.05, 2.0, 0.02), hazard, [s * 3.6, -2.87, 3.2], [0, s * 0.1, -s * 0.12]);
    for (const z of [0.8, 2.2, 3.5]) beam(V(s * (halfWidth(-1.9, z) - 0.05), -1.9, z), V(s * 3.9, -2.93, Math.min(4.0, z + 0.4)), 0.055, metalClip); // struts up to the hull
    const nx = s * 4.95, ny = -3.12, nz = 2.6;
    put(nacLathe, creamClip, [nx, ny, nz]);
    for (const dz of [-1.2, 0.0, 0.85]) put(new THREE.TorusGeometry(0.65, 0.05, 6, 24), dz > 0.5 ? accentClip : metalClip, [nx, ny, nz + dz]);
    put(new THREE.TorusGeometry(0.42, 0.07, 8, 22), darkClip, [nx, ny, nz - 1.93]);
    put(new THREE.CircleGeometry(0.4, 22), blackClip, [nx, ny, nz - 1.9], [0, PI, 0]);
    put(new THREE.ConeGeometry(0.16, 0.45, 12).rotateX(-PI / 2), metalClip, [nx, ny, nz - 2.05]);                          // intake spike
    put(bell, steelClip, [nx, ny, nz + 1.5]);
    const g = mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: '#3A2420', clippingPlanes: cutPlanes }), [nx, ny, nz + 1.58]);
    body.add(g); nacelleGlow.push(g);
    put(box(0.55, 0.22, 2.3, 0.05), darkClip, [nx, ny + 0.6, nz - 0.1]);
    for (const dz of [-0.6, 0.4]) put(box(0.08, 0.3, 0.5, 0.02), darkClip, [nx + s * 0.62, ny, nz + dz]);                    // little vents on the outside
    const tipLight = mesh(geo.ball, basic(s < 0 ? '#FF5A5A' : '#5AFF8A', true), [nx + s * 0.66, ny + 0.25, nz - 0.9], [0, 0, 0], 0.1); body.add(tipLight); runningLights.push(tipLight);
  }

  // ---------- Left flank: strapped-on cargo pods. Right flank: an added-on module (asymmetric, built later) ----------
  for (const [z, len, r, m] of [[2.4, 1.5, 0.36, accentClip], [4.0, 1.4, 0.36, creamClip]]) {
    const x = -(halfWidth(0.1, z) + r + 0.05), y = 0.15;
    put(geo.cyl(r, r, len, 16), m, [x, y, z], [PI / 2, 0, 0]);
    for (const e of [-1, 1]) put(new THREE.SphereGeometry(r, 16, 8, 0, 2 * PI, 0, PI / 2), m, [x, y, z + e * len / 2], [e * PI / 2, 0, 0], [1, 0.45, 1]);
    for (const dz of [-0.45, 0.45]) { put(new THREE.TorusGeometry(r + 0.02, 0.035, 6, 20), darkClip, [x, y, z + dz]); put(box(0.4, 0.1, 0.1, 0.02), darkClip, [x + 0.3, y, z + dz]); }
  }
  put(box(0.55, 0.5, 0.75, 0.05), hullMat('#C9A27A'), [-(halfWidth(-1.0, 1.0) + 0.3), -0.95, 1.0]);
  for (const dz of [-0.2, 0.2]) put(box(0.6, 0.53, 0.05, 0.01), darkClip, [-(halfWidth(-1.0, 1.0) + 0.3), -0.95, 1.0 + dz]);
  { const z0 = -2.95, z1 = -1.15, x = halfWidth(0.1, -2) + 0.32;
    put(box(0.66, 1.3, z1 - z0, 0.08), tealGrey, [x, 0.1, (z0 + z1) / 2]);
    put(box(0.72, 0.1, z1 - z0 + 0.1, 0.03), metalClip, [x, 0.8, (z0 + z1) / 2]);
    put(box(0.72, 0.1, z1 - z0 + 0.1, 0.03), metalClip, [x, -0.6, (z0 + z1) / 2]);
    for (let z = z0 + 0.15; z < z1; z += 0.3) put(geo.cyl(0.03, 0.03, 0.06, 6), darkClip, [x + 0.34, 0.75, z], [0, 0, PI / 2]);
    put(geo.cyl(0.2, 0.2, 0.05, 16), steelClip, [x + 0.34, 0.15, -2.05], [0, 0, PI / 2]);
    const pane = mesh(new THREE.CircleGeometry(0.15, 16), glassMat, [x + 0.37, 0.15, -2.05], [0, PI / 2, 0]); pane.renderOrder = 3; body.add(pane);
    for (const z of [-2.7, -1.4]) put(box(0.08, 0.5, 0.25, 0.02), darkClip, [x + 0.35, -0.2, z]);
    beam(V(x, 0.75, -1.7), V(x + 0.25, 1.5, -1.55), 0.02, metalClip, 5); beam(V(x, 0.75, -1.7), V(x + 0.45, 1.35, -1.95), 0.02, metalClip, 5); } // rabbit ears

  // ---------- Radiator fins on the back of the roof ----------
  for (const [x, lean] of [[-0.42, -0.25], [-0.75, -0.3], [-1.05, -0.38], [1.0, 0.32]]) {
    const z = 2.75, y = topY(x, z);
    put(box(0.06, 0.95, 1.5, 0.02), radMat, [x + lean * 0.5, y + 0.5, z], [0, 0, -lean]);
    put(box(0.12, 0.1, 1.55, 0.02), darkClip, [x, y + 0.04, z]);
  }

  // ---------- Folded solar wings on the shoulders ----------
  for (const s of [-1, 1]) {
    const z = -2.9, o = onHull(new THREE.Object3D(), s, 1.0, z, 0.05);
    put(box(2.5, 0.16, 0.16, 0.04), darkClip, ...pose(o));                        // the hinge rail
    for (let k = 0; k < 3; k++) {                                                   // three panels, folded flat and fanned a little
      const p = o.clone(); p.translateZ(0.1 + k * 0.06); p.translateY(0.3); p.rotateX(-0.06 * k);
      put(box(2.3, 0.62, 0.035, 0.012), solarMat, ...pose(p));
      put(box(2.34, 0.04, 0.045, 0.01), steelClip, ...pose(p.clone().translateY(0.32)));
    }
  }

  // ---------- Antennas and dishes, all different ----------
  const dishGeo = r => new THREE.LatheGeometry([[0, 0], [0.5, 0.08], [0.85, 0.28], [1, 0.42], [0.95, 0.43], [0.48, 0.14], [0, 0.06]].map(([x, y]) => new THREE.Vector2(x * r, y * r)), 22);
  { const x = 0.95, z = 4.4, y = topY(x, z);                                   // big dish on a lattice mast
    for (const [dx, dz] of [[-0.18, -0.15], [0.18, -0.15], [0, 0.2]]) beam(V(x + dx, y, z + dz), V(x, y + 1.1, z), 0.025, metalClip, 5);
    for (const h of [0.35, 0.7]) put(new THREE.TorusGeometry(0.14 * (1.1 - h), 0.012, 4, 3), metalClip, [x, y + h, z], [PI / 2, 0, 0]);
    put(dishGeo(0.85), steelClip, [x, y + 1.15, z], [-0.7, 0.5, 0.25]);
    beam(V(x, y + 1.25, z), V(x + 0.25, y + 1.75, z + 0.45), 0.018, metalClip, 4); put(geo.ball, darkClip, [x + 0.25, y + 1.77, z + 0.46], [0, 0, 0], 0.06); }
  { const x = -0.85, z = -4.3, y = topY(x, z);                                 // small dish up front
    put(geo.cyl(0.05, 0.07, 0.45, 8), metalClip, [x, y + 0.22, z]); put(dishGeo(0.32), creamClip, [x, y + 0.45, z], [0.6, -0.4, 0]); }
  { const x = -0.3, z = 0.55, y = topY(x, z);                                  // tall whip with a blinking light
    put(geo.cyl(0.025, 0.05, 2.3, 6), metalClip, [x, y + 1.15, z]);
    const l = mesh(geo.ball, basic('#FF7A59', true), [x, y + 2.32, z], [0, 0, 0], 0.09); body.add(l); runningLights.push(l); }
  { const x = 0.85, z = -3.7, y = topY(x, z);                                  // comms mast with crossbars
    put(geo.cyl(0.035, 0.045, 1.5, 6), metalClip, [x, y + 0.75, z]);
    for (const [h, w] of [[0.8, 0.7], [1.15, 0.5], [1.4, 0.3]]) put(geo.cyl(0.018, 0.018, w, 5), metalClip, [x, y + h, z], [0, 0, PI / 2]); }
  { const z = -8.0, y = topY(0, z);                                            // sensor pod on the prow
    put(geo.cyl(0.04, 0.06, 0.35, 6), metalClip, [0, y + 0.15, z]); put(box(0.3, 0.16, 0.22, 0.05), darkClip, [0, y + 0.38, z]);
    put(new THREE.CircleGeometry(0.05, 10), basic('#7FE0C2', true), [0, y + 0.38, z - 0.115], [0, PI, 0]); }
  { const x = 1.1, z = 0.2, y = topY(x, z);                                    // a stubby sensor mast
    put(geo.cyl(0.08, 0.1, 0.4, 8), darkClip, [x, y + 0.2, z]); put(geo.ball, creamClip, [x, y + 0.48, z], [0, 0, 0], 0.13); }

  // ---------- Belly: keel, pipes, hatches with handles, sensor pods, ventral fins ----------
  const yb = bottomY(0, 0);
  put(box(0.3, 0.12, 11.6, 0.04), steelClip, [0, yb - 0.05, -0.2]);
  for (const s of [-1, 1]) {
    const pts = []; for (let z = -5.6; z <= 5.6; z += 0.5) pts.push(V(s * 0.55, bottomY(0.55, z) - 0.08, z));
    tube(pts, 0.06, metalClip, 40);
    for (let z = -5.2; z < 5.6; z += 1.0) put(box(0.18, 0.08, 0.12, 0.02), darkClip, [s * 0.55, bottomY(0.55, z) - 0.04, z]);
  }
  for (const [z, x] of [[-4.6, 0], [-0.6, -0.9], [0.8, 0.5], [5.3, 0]]) put(box(0.36, 0.05, 0.06, 0.02), darkClip, [x, bottomY(x, z) - 0.04, z]);
  for (const [x, z, r] of [[0, -6.3, 0.22], [0.0, 1.9, 0.26], [-1.15, -0.6, 0.16], [1.15, 0.6, 0.18]]) {   // sensor domes
    const y = bottomY(x, z);
    put(geo.cyl(r * 1.25, r * 1.3, 0.08, 16), darkClip, [x, y - 0.03, z]);
    const d = mesh(new THREE.SphereGeometry(r, 16, 8, 0, 2 * PI, PI / 2, PI / 2), hullMat('#1E2638', { metalness: 0.6, roughness: 0.15 }), [x, y - 0.06, z]); body.add(d);
  }
  for (const s of [-1, 1]) { const x = s * 1.5, z = -0.2, y = bottomY(x, z);                                   // a pod with a lens each side
    put(geo.cyl(0.14, 0.14, 0.7, 12), creamClip, [x, y - 0.18, z], [PI / 2, 0, 0]); put(new THREE.CircleGeometry(0.1, 12), basic('#83CBEE', true), [x, y - 0.18, z - 0.36], [0, PI, 0]);
    put(box(0.08, 0.16, 0.3, 0.02), darkClip, [x, y - 0.06, z]); }
  { const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(1.4, 0); fin.lineTo(1.25, -0.55); fin.lineTo(0.75, -0.55); fin.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }).translate(0, 0, -0.04).rotateY(-PI / 2);
    for (const s of [-1, 1]) put(g, accentClip, [s * 1.05, bottomY(1.05, 5.0), 4.6], [0, 0, s * 0.45]); }

  // ---------- Landing gear: four legs that fold into the belly wells ----------
  // Clipped like the hull, so the near legs don't stand in front of the cutaway.
  const gearMetal = hullMat('#8E97AA', { metalness: 0.55, roughness: 0.35, map: metalTex }), gearDark = hullMat('#3A4252', { metalness: 0.4, roughness: 0.5 });
  const chrome = hullMat('#D9E1EA', { metalness: 0.9, roughness: 0.15 }), padMat = hullMat('#4A5266', { roughness: 0.7 }), gearHaz = hazard;
  const bolt = geo.cyl(0.035, 0.035, 0.05, 6);
  const legs = [], doors = [];
  for (const bay of K.bays) for (const s of [-1, 1]) {
    const front = bay.z1 < 0, x = s * (bay.x0 + bay.x1) / 2, hingeZ = front ? bay.z1 - 0.15 : bay.z0 + 0.15, hingeY = -2.98;
    const yb = bottomY(x, (bay.z0 + bay.z1) / 2);
    // The well: a dark box inside the hull above the hole (all four hinges at the same height, so the ship sits level).
    put(box(bay.x1 - bay.x0, -2.45 - yb, bay.z1 - bay.z0, 0.02), blackClip, [x, (yb - 2.45) / 2, (bay.z0 + bay.z1) / 2]);
    const splay = new THREE.Group(); splay.position.set(x, hingeY, hingeZ); splay.scale.setScalar(1.35); body.add(splay); // big, sturdy legs
    const swing = new THREE.Group(); splay.add(swing);
    const dir = front ? -1 : 1;                                     // which way the leg folds (along z)
    swing.add(mesh(geo.box(0.36, 0.3, 0.42, 0.06), gearDark));                                         // hinge block
    swing.add(mesh(geo.cyl(0.09, 0.09, 0.5, 12), gearMetal, [0, 0, 0], [0, 0, PI / 2]));              // hinge pin
    for (const sx of [-1, 1]) swing.add(mesh(bolt, chrome, [sx * 0.26, 0, 0], [0, 0, PI / 2]));
    swing.add(mesh(geo.cyl(0.15, 0.15, 1.0, 14), gearMetal, [0, -0.6, 0]));                          // hydraulic cylinder
    for (const h of [-0.2, -0.95]) swing.add(mesh(geo.cyl(0.17, 0.17, 0.08, 14), gearDark, [0, h, 0]));
    swing.add(mesh(geo.box(0.22, 0.12, 0.05, 0.01), gearHaz, [0, -0.5, 0.15 * -dir]));
    const rod = mesh(geo.cyl(0.08, 0.08, 0.8, 12), chrome, [0, -1.25, 0]); swing.add(rod);             // piston rod
    swing.add(mesh(geo.cyl(0.03, 0.03, 0.7, 6), gearDark, [0.12, -0.55, 0]));                          // hydraulic line
    const ankle = new THREE.Group(); ankle.position.set(0, -1.65, 0); swing.add(ankle);
    ankle.add(mesh(geo.ball, gearDark, [0, 0, 0], [0, 0, 0], 0.12));
    for (const sx of [-1, 1]) ankle.add(mesh(bolt, chrome, [sx * 0.12, 0, 0], [0, 0, PI / 2]));
    const pad = new THREE.Group(); ankle.add(pad);
    pad.add(mesh(geo.cyl(0.38, 0.42, 0.1, 20), padMat, [0, -0.13, 0]), mesh(geo.cyl(0.25, 0.3, 0.08, 16), gearMetal, [0, -0.06, 0]), mesh(geo.box(0.1, 0.16, 0.1, 0.02), gearDark, [0, 0.02, 0]));
    for (let k = 0; k < 6; k++) { const a = k / 6 * 2 * PI; pad.add(mesh(bolt, chrome, [Math.cos(a) * 0.3, -0.07, Math.sin(a) * 0.3])); }
    // Diagonal brace from a bracket on the hinge block down to the cylinder, with bolted ends.
    const b0 = V(0, -0.05, 0.38 * dir), b1 = V(0, -0.85, 0.02 * dir), d = b1.clone().sub(b0);
    const brace = mesh(geo.cyl(0.05, 0.05, d.length(), 8), gearMetal, b0.clone().add(b1).multiplyScalar(0.5).toArray());
    brace.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); swing.add(brace);
    swing.add(mesh(geo.box(0.16, 0.14, 0.14, 0.03), gearDark, b0.toArray()), mesh(geo.box(0.12, 0.12, 0.12, 0.03), gearDark, b1.toArray()));
    for (const p of [b0, b1]) swing.add(mesh(bolt, chrome, [0.09, p.y, p.z], [0, 0, PI / 2]));
    legs.push({ splay, swing, pad, ankle, rod, dir, s });
    // Two doors over the well, hinged along its long edges.
    for (const e of [-1, 1]) {
      const hx = x + e * (bay.x1 - bay.x0) / 2, hinge = new THREE.Group(); hinge.position.set(hx, yb - 0.005, (bay.z0 + bay.z1) / 2); body.add(hinge);
      const w = (bay.x1 - bay.x0) / 2;
      hinge.add(mesh(geo.box(w, 0.05, bay.z1 - bay.z0, 0.015), hullMat('#56707C'), [-e * w / 2, -0.025, 0]));
      hinge.add(mesh(geo.box(0.05, 0.04, bay.z1 - bay.z0 - 0.1, 0.01), gearHaz, [-e * w * 0.85, -0.06, 0]));
      doors.push({ hinge, e });
    }
  }
  ext.build(body);

  let gear = 0, gearTarget = 0, still = 0;
  function setGear(g) {
    const doorOpen = Math.min(1, g / 0.25), legOut = Math.max(0, Math.min(1, (g - 0.25) / 0.75)), e = legOut * legOut * (3 - 2 * legOut);
    for (const d of doors) { d.hinge.rotation.z = d.e * doorOpen * 1.75; d.hinge.visible = true; }
    for (const L of legs) {
      const ang = L.dir * (1 - e) * (PI / 2) * -1 + L.dir * e * -0.28; // retracted: lying along z; out: down and a little forward/back
      L.swing.rotation.x = ang;
      L.splay.rotation.z = L.s * 0.2 * e;
      L.rod.position.y = -1.05 - 0.2 * e; L.ankle.position.y = -1.45 - 0.2 * e;
      L.pad.rotation.set(-ang, 0, -L.s * 0.2 * e);
    }
  }
  setGear(0);

  return {
    shell, windshield, runningLights, nacelleGlow,
    get gear() { return gear; },
    // Legs come down while the ship hovers still, and fold away as soon as it moves.
    updateGear(dt, { moving, reduced }) {
      still = moving ? 0 : still + dt;
      gearTarget = still > 1.2 ? 1 : 0;
      const prev = gear;
      gear = reduced ? gearTarget : gear + Math.sign(gearTarget - gear) * Math.min(Math.abs(gearTarget - gear), dt * (gearTarget ? 0.55 : 0.9));
      if (gear !== prev || dt === 0) setGear(gear);
    },
    setGear(v) { gear = gearTarget = v; setGear(v); },
  };
}
