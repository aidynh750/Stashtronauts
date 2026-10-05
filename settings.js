// ===================================================================================================================
// WORLD SCALE SETTINGS: every number that sets the size and pace of the world, in one place to tune.
// Lengths are world units unless they say "ship lengths" (the player's ship is SHIP_LEN = 18.4 units long).
// Speeds are units per second. Change a number here and reload the page.
// ===================================================================================================================
export const SHIP_LEN = 18.4;

export const WORLD = {
  planets: {
    smallestDiameter: 100,   // ship lengths across: the smallest planet, even when its goal has only just started
    largestDiameter: 500,    // ship lengths across: the largest planet at full size
    startSize: 0.7,          // a planet starts at this fraction of its full size and grows to full size as its goal fills
    nearest: 30000,          // the closest any planet sits to the middle of the world
    spreadBase: 60000,       // planet number n sits at most spreadBase + spreadPerSlot * sqrt(n + 1) from the middle
    spreadPerSlot: 40000,
    minGap: 25000,           // empty space kept between any two planets' reach (their air, rings and moons)
    finestWithin: 1.6,       // the finest surface detail is built when the camera comes within this many radii
  },

  mothership: {
    frigate: 25, cruiser: 80, carrier: 250,                 // length in ship lengths
    bayScale: { frigate: 1.5, cruiser: 2.4, carrier: 3.6 },   // hangar bays grow with the ship (fighters keep their size)
    shellGap: 4000,          // space between the edge of the planets' space and the mothership's hull
    hopMin: 2, hopMax: 8,    // a relocation moves it this many of its own lengths along its parking shell
    patrolReach: 1.4,        // fighters patrol within this many hull lengths (+ 2000) of the mothership
  },

  speed: {
    top: 70,                 // W: normal top speed
    back: 15,                // S: reverse
    turn: 0.9,               // A/D: turn rate, radians per second
    boost: 3000,             // Shift + W: boost top speed
    cruise: 40000,           // Shift + W far from everything: the fastest cruise
    cruiseReach: 0.8,        // cruise is limited to this many times the distance to the nearest planet's air or hull,
                             // so it slows down by itself as you approach anything (about 1.25 s to cover the gap)
    climb: 25,               // Space / C: up and down near things
    climbReach: 0.2,         // ...faster with room to spare (big layers of air): this many times the distance to the nearest surface
    climbMax: 150,
    autopilot: 1500,         // the autopilot's top speed (also limited by cruiseReach)
  },

  // Top speeds inside a planet's air (atmosphere.js). They ease smoothly from one layer to the next.
  air: { glow: 400, upper: 400, upperLow: 120, cloud: 120, deck: 40 },

  gravity: {
    alignFrom: 0.4,          // the ship starts turning its belly to the planet this far down through the outer glow (0 = its top)
                             // and is fully aligned at the bottom of the upper atmosphere (the cloud tops)
    alignSeconds: 1.6,       // how gently "up" follows the planet (time constant)
    sinkSeconds: 5,          // momentum toward the planet carries on as a descent that fades over about this long
  },

  warnings: {
    level1: 30, level2: 12, level3: 4,   // ship lengths from the mothership's nearest hull surface
    resetFactor: 1.2,        // a level clears once you're this much further out than it (so it doesn't flicker)
    showSeconds: 6,          // how long a radio message stays up
    laneLength: 3,           // a hangar's approach lane reaches this many lane lengths out from its mouth (no warnings in it)
    shadowAfter: 10,         // seconds at level 3 before two fighters come over to keep you company
    shadowDistance: 3,       // ship lengths: how far beside you they fly
  },

  collision: {
    radius: 4.3,             // the player's ship is three spheres of this radius along its length
    spheres: [-5.5, 0.5, 6.5],
    bounce: 0.25,            // a little of the speed into the hull comes back as a soft bump
    scrape: 1.4,             // how quickly sliding along the hull slows you down
    shake: 0.35,             // the most the camera shakes on a bump
  },

  camera: {
    near: 0.2, far: 4e6,     // logarithmic depth keeps both precise
    rebase: 2000,            // floating origin: re-centre the world once the camera is this far from the origin
    starDistance: 2e6, sunDistance: 1.8e6,
    freeMaxSpeed: 40000,     // the free camera's fastest scroll speed
  },

  autopilot: { legMin: 3000, legMax: 20000, arrive: 60 },

  surface: {
    origin: -1e7,            // the surface world sits this far below everything (y), out of sight
    cloudBase: 520, exitAlt: 760, entryAlt: 700, chunk: 600,
  },
};
