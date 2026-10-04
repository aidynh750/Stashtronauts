// Life aboard: the pilot's routine when the ship is idle.
// The ship describes its floor plan as waypoints (where you can walk) and spots (where things happen).
// Activities are lists of steps: go to a spot, play an animation there for a while, maybe show some props.
// To add an activity, add an entry to ACTIVITIES and, if it needs a new place, a spot in the ship's layout.
import * as THREE from 'three';

export const ACTIVITIES = [
  { id: 'cook', steps: [
    { spot: 'stove', anim: 'cook', time: [7, 10], props: ['pan', 'steam'] },
    { spot: 'dining', anim: 'eat', time: [6, 9], props: ['bowl'] },
  ] },
  { id: 'nap', steps: [{ spot: 'bunk', anim: 'sleep', time: [12, 18], mood: 'sleepy' }] },
  { id: 'read', steps: [{ spot: 'sofa', anim: 'read', time: [9, 14] }] },
  { id: 'shower', steps: [{ spot: 'shower', anim: 'shower', time: [7, 10], props: ['showerSteam'] }] },
  { id: 'garden', steps: [{ spot: 'hydro', anim: 'garden', time: [7, 11] }] },
  { id: 'workbench', steps: [{ spot: 'bench', anim: 'work', time: [8, 12], mood: 'determined' }] },
  { id: 'desk', steps: [{ spot: 'desk', anim: 'write', time: [8, 12] }] },
  { id: 'starmap', steps: [{ spot: 'navtable', anim: 'study', time: [6, 9] }] },
  { id: 'tidy', steps: [{ spot: 'storage', anim: 'tidy', time: [8, 12], mood: 'determined' }] },
  // Down the ladder to the bottom deck: read the fuel gauges, then check the data racks.
  { id: 'shipcheck', steps: [{ spot: 'fuel', anim: 'study', time: [5, 8] }, { spot: 'servers', anim: 'study', time: [5, 8], mood: 'determined' }] },
  // The science lab, at the back of the upper deck.
  { id: 'experiment', steps: [{ spot: 'labBench', anim: 'experiment', time: [8, 12], props: ['bubbles'], mood: 'determined' }] },
  { id: 'microscope', steps: [{ spot: 'microscope', anim: 'microscope', time: [7, 11], mood: 'surprised' }] },
  { id: 'whiteboard', steps: [{ spot: 'whiteboard', anim: 'board', time: [8, 12] }] },
];

const WALK = 1.3, HURRY = 2.8, STEP_ON = 0.6;  // meters per second; STEP_ON is stepping on and off a ladder
const RUNG_TIME = 0.55, RUNG_HURRY = 0.32;   // seconds per rung
const IDLE_PAUSE = 3;      // seconds stopped before the pilot gets up
const REST = [6, 12];      // seconds in the pilot seat between activities
const COOLDOWN = 45;       // an activity won't be picked again this soon after it ended
const rand = ([a, b]) => a + Math.random() * (b - a);

// layout: { nodes: { id: { pos: [x, y, z], links: [ids] } }, spots: { id: { node, pos, yaw, anim } } with a 'seat' spot,
//           ladders: [{ topLand, top, bottom, bottomLand, yaw, rung }] }.
// On a ladder the pilot always faces it (yaw): turn to face it on the landing, step on (backwards at the top, forwards at
// the bottom), climb one rung at a time with hands and feet alternating, then step off. Every ladder works the same way.
// props: { name: object3D } shown only during the steps that list them.
export function makeCrew({ pilot, layout, props = {} }) {
  const P = id => new THREE.Vector3(...layout.nodes[id].pos);
  const segs = {};                       // 'a>b' -> { kind: 'mount' | 'climb' | 'dismount', L }
  for (const L of layout.ladders || []) {
    Object.assign(segs, { [L.top + '>' + L.bottom]: { kind: 'climb', L }, [L.bottom + '>' + L.top]: { kind: 'climb', L },
      [L.topLand + '>' + L.top]: { kind: 'mount', L }, [L.bottomLand + '>' + L.bottom]: { kind: 'mount', L },
      [L.top + '>' + L.topLand]: { kind: 'dismount', L }, [L.bottom + '>' + L.bottomLand]: { kind: 'dismount', L } });
  }
  // Waypoint ids -> path entries, each knowing how it is reached from the one before.
  const entries = (from, ids) => ids.map((id, i) => ({ p: P(id), id, ...(segs[(i ? ids[i - 1] : from) + '>' + id] || { kind: 'walk' }) }));
  let climbPose = { phase: 0, parity: 0, dir: 1 }, turning = false;
  const seat = layout.spots.seat;
  const root = pilot.group;

  let mode = 'seated';          // seated | moving | doing
  let path = [], seg = 0, segT = 0, hurry = false;
  let node = seat.node;         // the waypoint nearest to where the pilot is now
  let spot = seat, act = null, stepIndex = 0, doFor = 0, idleFor = 0, restFor = rand(REST), lastAct = null;
  const lastDone = {};
  let anim = 'pilot', mood = 'happy', glanceIn = 4, glanceFor = 0;
  place(seat);

  function place(s) { root.position.set(...s.pos); root.rotation.y = s.yaw; }
  function showProps(names = []) { for (const [k, o] of Object.entries(props)) o.visible = names.includes(k); }

  // Shortest route along the waypoints (Dijkstra; the graph is tiny).
  function route(from, to) {
    const dist = { [from]: 0 }, prev = {}, open = new Set(Object.keys(layout.nodes));
    while (open.size) {
      let u = null;
      for (const n of open) if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n;
      if (u === null || u === to) break;
      open.delete(u);
      for (const v of layout.nodes[u].links) {
        const d = dist[u] + P(u).distanceTo(P(v));
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    const ids = [to];
    while (ids[0] !== from && prev[ids[0]]) ids.unshift(prev[ids[0]]);
    return ids;
  }
  // Walk from the current spot, along the waypoints, into the next spot.
  function goTo(next, fast) {
    const ids = route(node, next.node);
    path = [{ p: root.position.clone() }, ...entries(null, ids), { p: new THREE.Vector3(...next.pos), id: next.node, kind: 'walk' }];
    seg = 0; segT = 0; hurry = fast; spot = next; mode = 'moving'; showProps([]);
  }
  function startStep() {
    const step = act.steps[stepIndex];
    goTo(layout.spots[step.spot], false);
  }
  function arrive() {
    place(spot); node = spot.node;
    if (spot === seat) { mode = 'seated'; anim = 'pilot'; mood = 'happy'; act = null; restFor = rand(REST); showProps([]); return; }
    const step = act.steps[stepIndex];
    mode = 'doing'; anim = step.anim; mood = step.mood || 'happy'; doFor = rand(step.time); showProps(step.props);
  }
  function pickActivity() {
    const now = performance.now() / 1000;
    let choices = ACTIVITIES.filter(a => a.id !== lastAct && !(now - (lastDone[a.id] ?? -1e9) < COOLDOWN));
    if (!choices.length) choices = ACTIVITIES.filter(a => a.id !== lastAct);
    return choices[Math.floor(Math.random() * choices.length)];
  }

  return {
    get atControls() { return mode === 'seated'; },
    get anim() { return anim; },
    get activity() { return act?.id || null; },
    // Start an activity now, by id, or a random one (for the autopilot's stops, testing, or other parts of the game later).
    start(id) {
      const next = id ? ACTIVITIES.find(x => x.id === id) : pickActivity();
      if (!next || mode === 'moving') return false;
      act = next; lastAct = next.id; stepIndex = 0; startStep();
      return true;
    },
    // flying: a flight key is held. cruising: the autopilot is moving the ship. visible: the ship is on screen.
    update(dt, { flying = false, cruising = false, stopped = true, visible = true, reduced = false, turn = 0, accel = 0 } = {}) {
      const piloting = flying || cruising;
      // Reduced motion, or nobody watching while you fly: just be in the seat.
      if (reduced || (!visible && piloting && mode !== 'seated')) {
        if (mode !== 'seated') { mode = 'seated'; spot = seat; node = seat.node; act = null; place(seat); showProps([]); }
        anim = 'pilot';
      }
      if (!visible && !reduced) return;

      if (mode === 'seated') {
        anim = 'pilot';
        mood = flying ? 'determined' : 'happy';
        idleFor = piloting || !stopped ? 0 : idleFor + dt;
        // Now and then, look back over the shoulder at the camera (and you).
        glanceIn -= dt; if (glanceIn <= 0) { glanceFor = 2.2; glanceIn = 7 + Math.random() * 5; }
        glanceFor = piloting ? 0 : Math.max(0, glanceFor - dt);
        if (!reduced && idleFor > IDLE_PAUSE) {
          restFor -= dt;
          if (restFor <= 0) { act = pickActivity(); lastAct = act.id; stepIndex = 0; startStep(); }
        }
      } else if (piloting && !hurry) {
        // A flight key: drop what you're doing and hurry back to the controls.
        if (act) lastDone[act.id] = performance.now() / 1000;
        act = null; mood = flying ? 'determined' : 'happy';
        if (mode === 'moving') {
          // Finish the current stretch (so we never cut through a wall), then reroute to the seat.
          const to = path[seg + 1];
          node = to?.id || node;
          const ids = route(node, seat.node);
          path = [{ p: root.position.clone() }, ...(to ? [to] : []), ...entries(node, ids.slice(1)), { p: new THREE.Vector3(...seat.pos), id: seat.node, kind: 'walk' }];
          seg = 0; segT = 0; hurry = true; spot = seat; showProps([]);
        } else { goTo(seat, true); }
      }

      if (mode === 'doing') {
        doFor -= dt;
        if (doFor <= 0) {
          stepIndex++;
          if (stepIndex < act.steps.length) startStep();
          else { lastDone[act.id] = performance.now() / 1000; goTo(seat, false); act = null; }
        }
      }

      if (mode === 'moving') {
        const a = path[seg], b = path[seg + 1];
        if (!b) { arrive(); }
        else if (b.kind === 'climb') {
          // One rung at a time: the body rises (or lowers) a rung per step, easing in and out, with the limbs alternating.
          const dir = Math.sign(b.p.y - a.p.y), n = Math.max(1, Math.round(Math.abs(b.p.y - a.p.y) / b.L.rung));
          segT = Math.min(1, segT + dt / (n * (hurry ? RUNG_HURRY : RUNG_TIME)));
          const steps = segT * n, k = Math.min(n - 1, Math.floor(steps)), f = segT >= 1 ? 1 : steps - k, e = f * f * (3 - 2 * f);
          root.position.set(a.p.x, a.p.y + dir * b.L.rung * (k + e), a.p.z);
          root.rotation.y = b.L.yaw; anim = 'climb'; climbPose = { phase: f, parity: k % 2, dir };
          if (segT >= 1) { root.position.copy(b.p); seg++; segT = 0; node = b.id; }
        } else if (b.kind === 'mount' || b.kind === 'dismount') {
          // Face the ladder first (on the landing), then step on or off it slowly, hands on the rails.
          const diff = Math.atan2(Math.sin(b.L.yaw - root.rotation.y), Math.cos(b.L.yaw - root.rotation.y));
          if (b.kind === 'mount' && Math.abs(diff) > 0.03 && segT === 0) {
            root.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), dt * 3.2); anim = 'stand'; turning = true;
          } else {
            turning = false; root.rotation.y = b.L.yaw;
            const len = a.p.distanceTo(b.p) || 1e-3;
            segT = Math.min(1, segT + dt * STEP_ON * (hurry ? 1.6 : 1) / len);
            const e = segT * segT * (3 - 2 * segT);
            root.position.lerpVectors(a.p, b.p, e);
            anim = 'climb'; climbPose = { phase: 0, parity: 0, dir: b.p.y === a.p.y && b.kind === 'mount' ? (b.id === b.L.top ? -1 : 1) : 1 };
            if (segT >= 1) { seg++; segT = 0; node = b.id; }
          }
        } else {
          const len = a.p.distanceTo(b.p) || 1e-3;
          segT = Math.min(1, segT + dt * (hurry ? HURRY : WALK) / len);
          root.position.lerpVectors(a.p, b.p, segT);
          anim = 'walk';
          const dx = b.p.x - a.p.x, dz = b.p.z - a.p.z;
          if (dx * dx + dz * dz > 1e-4) {
            const want = Math.atan2(-dx, -dz);
            const diff = Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y));
            root.rotation.y += diff * (1 - Math.exp(-dt * 12));
          }
          if (segT >= 1) { seg++; segT = 0; if (b.id) node = b.id; }
        }
      }

      const look = mode === 'seated' ? (glanceFor > 0 && !reduced ? -2.2 : turn) : 0;
      pilot.update(dt, { anim, mood, turn: look, accel, stride: hurry ? 10 : 7, climb: climbPose, reduced });
    },
  };
}
