# Stashtronauts

A friendly money tracker where savings goals are planets in a calm 3D space scene, and you fly between them in a small ship that is also your pilot's home.

## Platform: desktop first
- Design and test for a wide landscape browser window with a mouse and keyboard (check at about 1440 by 900).
- No on-screen joystick or touch controls for now. Do not design screens like a phone: no bottom sheets, slide-up tabs, or single-column stacks as the main layout.
- A phone layout is a separate, later task. Until then, narrow windows only get a plain fallback so nothing breaks (the `max-width:900px` block in `console.css`).

## Overall vision
- Static site: plain HTML, CSS and JavaScript ES modules, three.js from a CDN through the import map in `index.html`, no build step, `localStorage` for data.
- Look and feel: chunky, colorful, stylized, calm and toy-like, inspired by the feel of Astroneer. Never copy anyone's characters or assets.
- The pilot is a human-proportioned person (about six heads tall), stylized low-poly, not round or bubbly. This replaces the earlier "round Tomodachi style" idea for the pilot.
- Words: plain English, warm, never shaming. Explain any finance term in friendly words.
- Motion: respect `prefers-reduced-motion` (no autopilot, no walking: the pilot stays seated). Planets rotate slowly. When nobody is steering, the ship cruises on autopilot between random waypoints and hovers between trips (this reverses the earlier idea that the ship only moves when steered). Other ships and objects appear only when something is happening.

## Build order (build one phase at a time, then stop for feedback)
- **Phase A (built):** the player's ship and pilot: a big, old, much-modified two-story ship that is the pilot's home.
  - Hull (`hull.js`): an angular body lofted through cross-sections, not a tube. Pointed prow under a cockpit canopy with a wraparound windshield, a wide flat lower hull with a chine, a stepped and raised back section, collars between sections, armour plates. Bolted on (`exterior.js`): dorsal spine with pipes, tail fin, stub wings with two thruster nacelles, cargo pods on the left flank and an added-on module on the right (deliberately asymmetric), observation dome, radiator fins, folded solar wings, mismatched antennas and dishes, cargo doors, a plated belly with hatches, sensor pods and ventral fins. Nothing is drawn around the hull (the old shield bubble and the "ghost" outline are gone).
  - Landing gear: four big legs (hydraulic cylinder and piston, diagonal brace, bolted joints, wide pads) that fold into belly wells behind opening doors. Down while hovering still, up as soon as the ship moves. All four hinge at one height, so the ship would sit level.
  - Interior (`interior.js`, meters): rooms are 6.8 m wide (inner walls 3.4 m either side of centre, short tunnels out to square portholes). Upper deck: control room under the canopy (dashboard, nose console, seats with harnesses, overhead panel, racks, nav table, comms with a headset, lockers, ladder), then the science lab (bench, microscope, centrifuge, sealed plant jars, specimen tanks, whiteboard, terminals, sample freezer, hazard cabinet, telescope, holographic star chart). Lower deck, front to back: bunk room, bathroom, galley with the pantry, lounge with desk and hydroponics, workshop and suit room, airlock, junk bay, fuel room. Under it, a service deck: batteries, water tanks, pumps, heater, pipes, cable trays, gear wells, crawl hatches.
  - Clutter: every static prop marks the floor it covers on a grid; the walking paths (from the waypoint graph) and the walkway are kept clear; then each room's free floor is filled from that room's theme (boxes, laundry, tools, papers, toys, bags, coils), all instanced. Plus overflowing shelves, things hung from the ceiling, cables on the floor. `ship.blockedPaths` lists anything solid on a path (it should only list the destination furniture: seat, bed, sofa, chairs).
  - Money shows inside only: savings jar, a progress frame per goal on the lounge wall, trophies for finished goals, and the pantry, whose fullness is the emergency fund. The old goal pods under the hull are gone. Optional debt tow pod stays.
  - Camera and hull: one state machine in `space.js`, outside -> entering -> inside -> leaving. "Look closer" (or scrolling in past 1x the ship length) enters: the camera glides in and the hull opens. Inside, the ship holds still (no autopilot), you can drag to orbit and scroll to zoom, and the camera is kept outside the ship's outline so it never passes through a wall. "Back outside" (the same button), scrolling out past 1.8x the ship length, or any flight key leaves: the camera glides back and the hull closes, and flying starts only once it's back outside. Scrolling during a glide is ignored, so nothing flickers at the thresholds. Only this machine opens or closes the hull.
  - The pilot lives aboard: seated at the controls while the ship moves, and doing activities while it hovers (cook then eat, nap, read, shower, garden, workbench, desk, star map, tidy, and in the lab: experiment, microscope, whiteboard), walking on waypoints and climbing the ladder. Activities are data in `crew.js`.
  - The console opens only from the Console button or a click on the middle dashboard screen; never by itself.
  - Autopilot cruising when idle outside; W/A/S/D or arrows take over at once, and the autopilot returns a few seconds after you let go.
- **Stage 2 (next, waiting for go):** rebuild the pilot as a grounded, realistic working astronaut (7.5 heads, skinned mesh on a skeleton, realistic face, eyes and hair cards, worn jumpsuit). The round Tomodachi style no longer applies to the pilot once that's done. If code alone can't reach a believable look, stop and propose a licensed rigged glTF model before downloading anything.
- **Stage 3 (after that):** the ship gets old and rusty (peeling paint, rust, scorch, grime, patch panels, duct tape, flickering lights) with junk hanging off it; a real rocket engine (bell nozzle with throat and ribs, glow ring, turbopump, gimbal, smaller nacelle versions, always visible); outside chores (suit up, airlock cycle, tether, fix a visible job, come back), and the ship never flies while someone is outside ("Waiting for crew to get back inside"). Skipped with reduced motion.
- **Phase B:** tap a planet for a card with "Fly there" and "Add money", auto-flight with camera follow, and a Land button.
- **Phase C:** folded into Phase A and Stages 2 and 3 (the cutaway, the living pilot, the spacewalk chores).
- **Phase D:** customization (ship colors, name decal, interior theme, decor, pilot look) in the console's "Ship and pilot" section with a live preview. Decor unlocks from completed goals.
- **Phase E:** planet surfaces and landing by descending through layered clouds (never parking on a visible sphere). A calm descent for savings planets, a steady sunny one for the emergency fund, and a stormy one for debt planets whose storm scales with the balance and thins as it's paid. It never fails or crashes, lightning is soft, and Skip is always available.
- **Later:** residents, deposits arriving as cargo pods, transfers by ship, asteroids for unplanned withdrawals, the paranoid guide with a cluttered junk ship, creatures, and a calm-guide setting.

## How it's built
- `space.js`: the 3D world, camera and flight. Planets come from saved goals and are generated from their mythology name.
- `ship.js`: puts the ship together (materials, cutaway planes, engine, flame and trail, tow pod, money). `hull.js`: the hull's shape and where things sit on it. `exterior.js`: the hull mesh, windshield and everything outside, including the landing gear. `interior.js`: the rooms, clutter, waypoints and spots. The interior and pilot are built in meters inside a group scaled by `S`.
- `pilot.js`: the pilot, built from swappable parts (head, 7 hair styles, face, outfit, accessory) with five moods and jointed poses. `crew.js`: waypoints, pathfinding and the activity list.
- `textures.js`: every texture, drawn on canvases at startup (there are no image files).
- `console.js` / `console.css`: the ship console, a tablet that opens over the world. Money is entered in the keypad dialog (`#pad`).
- `money.js`: saved data, plain-English money formatting, the payoff simulation (`sim()`), and the ship's money summary (`shipMoney()`), shared by everything.
- Parts talk through window events: `stash:change`, `stash:show`, `stash:thumb`, `stash:thumbs`, `stash:mood`, `stash:console` (the dashboard screen asks for the console).

## Rules worth keeping
- Saved data lives in `localStorage` under `stashtronauts-v1` (older data under `vaultcore-v3` is migrated). Never break existing saved data.
- Every field has a label, focus stays inside open dialogs, and flight keys are ignored while the console is open or you're typing.
- Keep it light for a laptop: low-poly, shared geometry and materials, instancing for repeated small things.
- Art direction is in `docs/STYLE.md`.
