// Solmar Bay — the world and its rules. No drawing and no browser in here:
// the seeded city, the player on foot and behind the wheel, traffic,
// pedestrians, police, the wanted level, the three missions, cash pickups and
// saving. stepWorld advances one fixed step and returns what happened as
// plain flags, so the caller can play sounds without the world knowing about
// screens or speakers.

import { CFG, PALETTE } from './config.js';
import { makeRng, range, int, pick } from './random.js';

// Road centre lines: every 400 px across the 3200 x 2400 city.
export const ROADS_V = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROADS_H = [200, 600, 1000, 1400, 1800, 2200];

const TAU = Math.PI * 2;

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function turnToward(angle, target, maxStep) {
  const d = angDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function nearestRoadX(x) {
  let best = ROADS_V[0];
  for (const c of ROADS_V) if (Math.abs(c - x) < Math.abs(best - x)) best = c;
  return best;
}

export function nearestRoadY(y) {
  let best = ROADS_H[0];
  for (const c of ROADS_H) if (Math.abs(c - y) < Math.abs(best - y)) best = c;
  return best;
}

// True when a circle of radius r at (x, y) overlaps a building.
export function hitsBuilding(world, x, y, r) {
  for (const b of world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Where the beach starts: south of the last road the sand runs to the water.
export const BEACH_Y = 2248;
export const WATER_Y = 2340;

// A person may walk the beach but not into the water; a car may not leave the
// roads for the sand at all.
export function blockedForPerson(world, x, y, r) {
  if (x < r + 4 || y < r + 4 || x > CFG.worldW - r - 4 || y > WATER_Y - r) return true;
  return hitsBuilding(world, x, y, r);
}

export function blockedForCar(world, x, y, r) {
  if (x < r + 4 || y < r + 4 || x > CFG.worldW - r - 4 || y > BEACH_Y - r) return true;
  return hitsBuilding(world, x, y, r);
}

// Line of sight: sample the segment; a building in the way blocks the view.
export function losClear(world, x0, y0, x1, y1) {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (hitsBuilding(world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// City generation
// ---------------------------------------------------------------------------

// The strips of land between road edges, as [start, end] pairs.
function landStrips(centres, lo, hi) {
  const strips = [];
  let prev = lo;
  for (const c of centres) {
    strips.push([prev, c - CFG.roadW / 2]);
    prev = c + CFG.roadW / 2;
  }
  strips.push([prev, hi]);
  return strips;
}

function buildCity(world, rng) {
  const xs = landStrips(ROADS_V, 0, CFG.worldW);
  const ys = landStrips(ROADS_H, 0, BEACH_Y);
  world.blocks = [];
  for (let ci = 0; ci < xs.length; ci++) {
    for (let ri = 0; ri < ys.length; ri++) {
      const [x0, x1] = xs[ci];
      const [y0, y1] = ys[ri];
      world.blocks.push({ x0, y0, x1, y1, col: ci, row: ri });
    }
  }

  // One block is the park, one row near the beach is the hotel strip.
  const park = world.blocks.find((b) => b.col === 3 && b.row === 2);
  world.park = { x: park.x0, y: park.y0, w: park.x1 - park.x0, h: park.y1 - park.y0 };
  world.pond = {
    x: park.x0 + (park.x1 - park.x0) * 0.62,
    y: park.y0 + (park.y1 - park.y0) * 0.55,
    rx: 62, ry: 40,
  };

  const carColors = ['#c94f42', '#3f7fb5', '#d9a441', '#6fae8e', '#8a7fb5', '#c9c9c9', '#4a4a52', '#b56a7d'];
  world.buildings = [];
  world.trees = [];
  let carId = 0;

  for (const b of world.blocks) {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    if (b === park) {
      for (let i = 0; i < 11; i++) {
        world.trees.push({
          x: range(rng, b.x0 + 16, b.x1 - 16),
          y: range(rng, b.y0 + 16, b.y1 - 16),
          r: range(rng, 10, 16),
        });
      }
      continue;
    }
    const hotelRow = b.row === 5 && b.col >= 2 && b.col <= 4;
    if (!hotelRow && rng() < 0.22) {
      // A parking lot instead of buildings: a few parked cars, no walls.
      for (let i = 0; i < int(rng, 2, 4); i++) {
        world.cars.push(makeCar(world, rng, carId++, {
          x: range(rng, b.x0 + 24, b.x1 - 24),
          y: range(rng, b.y0 + 24, b.y1 - 24),
          angle: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
          color: pick(rng, carColors),
          parked: true,
        }));
      }
      continue;
    }
    // Split the block into a small grid and put one building in each cell.
    const cols = w > 240 ? 2 : 1;
    const rows = h > 240 ? 2 : 1;
    for (let gx = 0; gx < cols; gx++) {
      for (let gy = 0; gy < rows; gy++) {
        if (rng() < 0.18) continue;
        const cw = w / cols;
        const ch = h / rows;
        const bw = range(rng, 64, Math.min(150, cw - 26));
        const bh = range(rng, 64, Math.min(150, ch - 26));
        // Keep a clear apron around the block so a car on the road's edge
        // never clips a wall: buildings stay 26 px inside the block.
        let bx = b.x0 + gx * cw + (cw - bw) / 2 + range(rng, -8, 8);
        let by = b.y0 + gy * ch + (ch - bh) / 2 + range(rng, -8, 8);
        bx = Math.max(b.x0 + 26, Math.min(bx, b.x1 - 26 - bw));
        by = Math.max(b.y0 + 26, Math.min(by, b.y1 - 26 - bh));
        world.buildings.push({
          x: bx, y: by, w: bw, h: bh,
          color: hotelRow ? PALETTE.hotel : pick(rng, PALETTE.building),
          roof: hotelRow ? PALETTE.hotelRoof : pick(rng, PALETTE.roof),
          hotel: hotelRow,
          roofKind: pick(rng, ['flat', 'peak', 'round']),
        });
      }
    }
    // A couple of street trees on the block's edge.
    for (let i = 0; i < int(rng, 0, 2); i++) {
      world.trees.push({
        x: range(rng, b.x0 + 10, b.x1 - 10),
        y: range(rng, b.y0 + 10, b.y1 - 10),
        r: range(rng, 9, 13),
      });
    }
  }
}

function makeCar(world, rng, id, opts) {
  return {
    id,
    x: opts.x, y: opts.y,
    angle: opts.angle,
    speed: opts.speed || 0,
    color: opts.color,
    kind: opts.kind || 'sedan',
    parked: !!opts.parked,
    driver: opts.parked ? null : true,
    hp: 60,
    disabled: false,
    axis: opts.axis || 'h',
    dir: opts.dir || 1,
    turnCd: 0,
    shootCd: 0,
    stolen: false,
  };
}

function laneOffset(axis, dir) {
  // Right-hand traffic: the lane sits one lane-width to the right of the
  // centre line for the direction of travel.
  if (axis === 'h') return dir > 0 ? CFG.lane : -CFG.lane;
  return dir > 0 ? -CFG.lane : CFG.lane;
}

function spawnTraffic(world, rng) {
  const carColors = ['#c94f42', '#3f7fb5', '#d9a441', '#6fae8e', '#8a7fb5', '#c9c9c9', '#4a4a52', '#b56a7d'];
  let id = world.cars.length;
  for (let i = 0; i < CFG.traffic.count; i++) {
    const axis = rng() < 0.5 ? 'h' : 'v';
    const line = axis === 'h' ? pick(rng, ROADS_H) : pick(rng, ROADS_V);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = range(rng, 120, axis === 'h' ? CFG.worldW - 120 : CFG.worldH - 320);
    const off = laneOffset(axis, dir);
    const angle = axis === 'h' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    world.cars.push(makeCar(world, rng, id++, {
      x: axis === 'h' ? along : line + off,
      y: axis === 'h' ? line + off : along,
      angle,
      speed: range(rng, 110, 175),
      color: rng() < 0.14 ? '#f2c230' : pick(rng, carColors),
      kind: rng() < 0.14 ? 'taxi' : (rng() < 0.12 ? 'truck' : 'sedan'),
      axis, dir,
    }));
  }
  for (let i = 0; i < CFG.traffic.parked; i++) {
    const axis = rng() < 0.5 ? 'h' : 'v';
    const line = axis === 'h' ? pick(rng, ROADS_H) : pick(rng, ROADS_V);
    const along = range(rng, 160, axis === 'h' ? CFG.worldW - 160 : CFG.worldH - 360);
    const side = rng() < 0.5 ? 1 : -1;
    const off = side * (CFG.roadW / 2 - 13);
    const angle = axis === 'h' ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    world.cars.push(makeCar(world, rng, id++, {
      x: axis === 'h' ? along : line + off,
      y: axis === 'h' ? line + off : along,
      angle,
      color: pick(rng, carColors),
      parked: true,
    }));
  }
}

function spawnPeds(world, rng) {
  const shirt = ['#e8e8e8', '#3f7fb5', '#d95f4a', '#6fae5a', '#b58ad9', '#e8c46a', '#5a5a66', '#e8a2b8'];
  for (let i = 0; i < CFG.peds.count; i++) {
    const axis = rng() < 0.5 ? 'h' : 'v';
    const line = axis === 'h' ? pick(rng, ROADS_H) : pick(rng, ROADS_V);
    const along = range(rng, 80, axis === 'h' ? CFG.worldW - 80 : CFG.worldH - 300);
    const side = rng() < 0.5 ? 1 : -1;
    const off = side * (CFG.roadW / 2 + 16);
    const angle = axis === 'h' ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    world.peds.push({
      x: axis === 'h' ? along : line + off,
      y: axis === 'h' ? line + off : along,
      angle,
      speed: CFG.peds.walk,
      state: 'walk',
      color: pick(rng, shirt),
      hp: 30,
      fleeT: 0,
      fleeX: 0, fleeY: 0,
      turnCd: range(rng, 0, 3),
      dead: false,
    });
  }
}

function spawnCash(world, rng) {
  for (let i = 0; i < CFG.cash.count; i++) {
    const axis = rng() < 0.5 ? 'h' : 'v';
    const line = axis === 'h' ? pick(rng, ROADS_H) : pick(rng, ROADS_V);
    const along = range(rng, 100, axis === 'h' ? CFG.worldW - 100 : CFG.worldH - 320);
    const side = rng() < 0.5 ? 1 : -1;
    const off = side * (CFG.roadW / 2 + 16);
    world.cash.push({
      x: axis === 'h' ? along : line + off,
      y: axis === 'h' ? line + off : along,
      amount: int(rng, CFG.cash.min, CFG.cash.max),
      taken: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createWorld(seed) {
  const rng = makeRng(seed);
  const world = {
    seed,
    time: 0,
    clockH: CFG.clock.startH,
    buildings: [],
    trees: [],
    cars: [],
    peds: [],
    cash: [],
    bullets: [],
    particles: [],
    park: null,
    pond: null,
    garage: { x: 1800, y: 2200 },
    docks: { x: 2900, y: 2200 },
    packageSpot: { x: 1000, y: 1052 },
    player: {
      x: 600, y: 652, angle: 0,
      hp: CFG.player.hp,
      money: 0,
      ammo: CFG.player.ammo,
      car: null,
      punchCd: 0,
      shootCd: 0,
      reloadT: 0,
      hurtCd: 0,
      punchAnim: 0,
      muzzle: 0,
    },
    wanted: 0,
    unseenTime: 0,
    decayTimer: 0,
    bustTimer: 0,
    mission: { index: 0, stage: 'getcar', packageHeld: false, done: [false, false, false] },
    lastShot: null,
    message: '',
    messageT: 0,
  };
  buildCity(world, rng);
  spawnTraffic(world, rng);
  spawnPeds(world, rng);
  spawnCash(world, rng);
  return world;
}

// ---------------------------------------------------------------------------
// Wanted level
// ---------------------------------------------------------------------------

function desiredPolice(wanted) {
  if (wanted <= 0) return 0;
  return Math.min(CFG.police.maxPursuit, wanted + 1);
}

function policeCars(world) {
  return world.cars.filter((c) => c.kind === 'police');
}

function spawnPolice(world, rng) {
  const p = world.player;
  const heading = p.car ? p.car.angle : p.angle;
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  // Try a few spots: never drop a cruiser right in front of the player's
  // path, where the player would rear-end it at full speed.
  let x = 0;
  let y = 0;
  let axis = 'h';
  for (let attempt = 0; attempt < 6; attempt++) {
    axis = rng() < 0.5 ? 'h' : 'v';
    const line = axis === 'h' ? pick(rng, ROADS_H) : pick(rng, ROADS_V);
    const a = range(rng, 0, TAU);
    const d = range(rng, 700, 900);
    x = p.x + Math.cos(a) * d;
    y = p.y + Math.sin(a) * d;
    x = Math.max(80, Math.min(CFG.worldW - 80, x));
    y = Math.max(80, Math.min(BEACH_Y - 80, y));
    if (axis === 'h') y = line;
    else x = line;
    const dx = x - p.x;
    const dy = y - p.y;
    const ahead = dx * hx + dy * hy;
    const side = Math.abs(dx * -hy + dy * hx);
    if (!(ahead > 0 && ahead < 900 && side < 120)) break;
  }
  const car = makeCar(world, rng, world.cars.length, {
    x, y,
    angle: Math.atan2(p.y - y, p.x - x),
    speed: 200,
    color: PALETTE.policeBody,
    kind: 'police',
    axis, dir: 1,
  });
  car.lastSeenX = p.x;
  car.lastSeenY = p.y;
  car.searchT = 0;
  world.cars.push(car);
  return car;
}

function addWanted(world, n, rng) {
  if (n <= 0) return;
  world.wanted = Math.min(5, world.wanted + n);
  world.unseenTime = 0;
  world.decayTimer = 0;
  while (policeCars(world).length < desiredPolice(world.wanted)) spawnPolice(world, rng);
}

function copSeesPlayer(world, cop) {
  const p = world.player;
  if (dist(cop.x, cop.y, p.x, p.y) > CFG.police.sight) return false;
  return losClear(world, cop.x, cop.y, p.x, p.y);
}

// ---------------------------------------------------------------------------
// Helpers used by the step
// ---------------------------------------------------------------------------

function addParticles(world, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = speed * (0.4 + Math.random() * 0.8);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
      color, size: 2 + Math.random() * 3,
    });
  }
}

function hurtPlayer(world, amount, ev) {
  const p = world.player;
  if (p.hurtCd > 0 || p.hp <= 0) return;
  p.hp = Math.max(0, p.hp - amount);
  p.hurtCd = 0.5;
  ev.hit = true;
  if (p.hp <= 0) ev.wasted = true;
}

function killPed(world, ped, ev, rng) {
  if (ped.dead) return;
  ped.dead = true;
  addParticles(world, ped.x, ped.y, PALETTE.blood, 10, 120);
  addWanted(world, 2, rng);
  ev.hit = true;
}

function setMessage(world, text) {
  world.message = text;
  world.messageT = 4;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export function currentObjective(world) {
  const m = world.mission;
  if (m.index === 0) {
    if (m.stage === 'getcar') return { text: 'Steal a car — any car will do', marker: null };
    return { text: 'Bring the car to the yellow garage', marker: { x: world.garage.x, y: world.garage.y, color: PALETTE.garage } };
  }
  if (m.index === 1) {
    if (m.stage === 'pickup') return { text: 'Pick up the package at the gold marker', marker: { x: world.packageSpot.x, y: world.packageSpot.y, color: PALETTE.package } };
    return { text: 'Drive the package to the blue docks', marker: { x: world.docks.x, y: world.docks.y, color: PALETTE.docks } };
  }
  if (m.index === 2) return { text: 'Lose the heat — stay out of sight until it cools', marker: null };
  return { text: 'Story complete — Solmar Bay is yours, Marco', marker: null };
}

function completeMission(world, ev, rng) {
  const m = world.mission;
  const pay = CFG.missions[m.index].pay;
  world.player.money += pay;
  m.done[m.index] = true;
  ev.mission = true;
  if (m.index === 0) {
    m.index = 1;
    m.stage = 'pickup';
    setMessage(world, `Hot Wheels done — +$${pay}. A package is waiting by the park.`);
  } else if (m.index === 1) {
    m.index = 2;
    m.stage = 'hide';
    world.wanted = 3;
    world.unseenTime = 0;
    world.decayTimer = 0;
    while (policeCars(world).length < desiredPolice(3)) spawnPolice(world, rng);
    setMessage(world, `The Drop done — +$${pay}. The heat is on: lose 3 stars.`);
  } else {
    m.index = 3;
    m.stage = 'done';
    ev.story = true;
    setMessage(world, `Heat Wave done — +$${pay}. Solmar Bay is yours.`);
  }
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export function stepWorld(world, inp, dt) {
  const ev = {
    shot: false, punch: false, hit: false, mission: false, pickup: false,
    busted: false, wasted: false, story: false, reload: false, steal: false,
  };
  const rng = makeRng((world.seed ^ (Math.floor(world.time * 60) + 7919)) >>> 0);
  const p = world.player;
  world.time += dt;
  world.clockH = (world.clockH + CFG.clock.hoursPerSecond * dt) % 24;
  if (world.messageT > 0) world.messageT -= dt;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  p.punchAnim = Math.max(0, p.punchAnim - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.ammo = CFG.player.ammo;
      ev.reload = true;
    }
  }

  if (p.car) stepDriving(world, inp, dt, ev, rng);
  else stepOnFoot(world, inp, dt, ev, rng);

  stepBullets(world, dt, ev, rng);
  stepTraffic(world, dt, rng);
  stepPolice(world, dt, ev, rng);
  stepPeds(world, dt, rng);
  stepWanted(world, dt, rng);
  stepMissions(world, ev, rng);
  stepCash(world, ev);
  stepParticles(world, dt);

  return ev;
}

function stepOnFoot(world, inp, dt, ev, rng) {
  const p = world.player;
  const speed = inp.run ? CFG.player.run : CFG.player.walk;
  let mx = inp.mx;
  let my = inp.my;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  if (len > 0) p.angle = Math.atan2(my, mx);
  const nx = p.x + mx * speed * dt;
  const ny = p.y + my * speed * dt;
  if (!blockedForPerson(world, nx, p.y, CFG.player.radius)) p.x = nx;
  if (!blockedForPerson(world, p.x, ny, CFG.player.radius)) p.y = ny;

  // Aim with the mouse while shooting; otherwise face where we walk.
  if (inp.shoot && (inp.aimX !== 0 || inp.aimY !== 0)) {
    p.angle = Math.atan2(inp.aimY - p.y, inp.aimX - p.x);
  }

  // Punch: a short swing in front of Marco.
  if (inp.punch && p.punchCd <= 0) {
    p.punchCd = CFG.player.punchCooldown;
    p.punchAnim = 0.18;
    ev.punch = true;
    let best = null;
    let bestD = CFG.player.punchReach + 12;
    for (const ped of world.peds) {
      if (ped.dead) continue;
      const d = dist(p.x, p.y, ped.x, ped.y);
      if (d > bestD) continue;
      const a = Math.abs(angDiff(p.angle, Math.atan2(ped.y - p.y, ped.x - p.x)));
      if (a > 1.1) continue;
      best = ped;
      bestD = d;
    }
    if (best) {
      best.hp -= CFG.player.punchDamage;
      addParticles(world, best.x, best.y, '#e8d8b0', 5, 90);
      if (best.hp <= 0) killPed(world, best, ev, rng);
    }
  }

  // Shoot the pistol toward the cursor.
  if (inp.shoot && p.shootCd <= 0 && p.reloadT <= 0) {
    if (p.ammo > 0) {
      p.shootCd = CFG.player.shootCooldown;
      p.ammo -= 1;
      p.muzzle = 0.07;
      const a = Math.atan2(inp.aimY - p.y, inp.aimX - p.x);
      world.bullets.push({
        x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
        vx: Math.cos(a) * CFG.player.bulletSpeed,
        vy: Math.sin(a) * CFG.player.bulletSpeed,
        life: 1.1, police: false, damage: CFG.player.bulletDamage,
      });
      world.lastShot = { x: p.x, y: p.y, t: 0 };
      ev.shot = true;
      addWanted(world, 1, rng);
      if (p.ammo === 0) {
        p.reloadT = CFG.player.reloadTime;
        ev.reload = true;
      }
    }
  }

  // Enter a car: parked cars are stolen, moving ones are carjacked.
  if (inp.enter) {
    let best = null;
    let bestD = 60;
    for (const car of world.cars) {
      if (car.disabled) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (best) stealCar(world, best, ev, rng);
  }

  // A speeding car can run Marco down.
  for (const car of world.cars) {
    if (car.parked || car.disabled) continue;
    if (Math.abs(car.speed) < 150) continue;
    if (dist(p.x, p.y, car.x, car.y) < 30) {
      hurtPlayer(world, Math.min(22, (Math.abs(car.speed) - 150) / 18), ev);
      const a = Math.atan2(p.y - car.y, p.x - car.x);
      p.x += Math.cos(a) * 26;
      p.y += Math.sin(a) * 26;
    }
  }
}

function stealCar(world, car, ev, rng) {
  const p = world.player;
  const wasParked = car.parked;
  const wasPolice = car.kind === 'police';
  if (!wasParked && car.driver) {
    // Pull the driver out onto the sidewalk; they run for it.
    world.peds.push({
      x: car.x + 26, y: car.y + 26, angle: 0, speed: CFG.peds.flee,
      state: 'flee', color: '#d95f4a', hp: 30, fleeT: 2.5,
      fleeX: car.x + 200, fleeY: car.y + 200, turnCd: 0, dead: false,
    });
    car.driver = null;
  }
  car.parked = false;
  car.stolen = true;
  car.speed = 0;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  ev.steal = true;
  // A witness in view calls it in.
  let seen = false;
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (dist(p.x, p.y, ped.x, ped.y) < CFG.wanted.witnessRange &&
        losClear(world, ped.x, ped.y, p.x, p.y)) { seen = true; break; }
  }
  if (!seen) {
    for (const other of world.cars) {
      if (other === car || other.parked) continue;
      if (dist(p.x, p.y, other.x, other.y) < CFG.wanted.witnessRange &&
          losClear(world, other.x, other.y, p.x, p.y)) { seen = true; break; }
    }
  }
  if (seen) addWanted(world, 1, rng);
  if (wasPolice) addWanted(world, 1, rng);
  if (world.mission.index === 0 && world.mission.stage === 'getcar') {
    world.mission.stage = 'deliver';
    setMessage(world, 'Car stolen — take it to the yellow garage.');
  }
}

function stepDriving(world, inp, dt, ev, rng) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  const top = car.kind === 'police' ? CFG.car.policeTop : CFG.car.topSpeed;
  const throttle = -inp.my; // W is up: my = -1 while held
  const steer = inp.mx;

  if (throttle > 0 && !car.disabled) {
    car.speed += CFG.car.accel * dt;
  } else if (throttle < 0 && !car.disabled) {
    if (car.speed > 25) car.speed -= CFG.car.brake * dt;
    else if (throttle < -0.7) car.speed -= CFG.car.accel * 0.6 * dt;
    else {
      // Gentle brake to a full stop, never reverses: a half pull on the
      // brake brings the car to rest instead of flipping it into reverse.
      const s = Math.sign(car.speed);
      car.speed -= s * Math.min(Math.abs(car.speed), 600 * dt);
    }
  } else {
    car.speed -= car.speed * 0.35 * dt;
  }
  car.speed = Math.max(-CFG.car.reverseTop, Math.min(top, car.speed));
  if (car.disabled) car.speed = 0;

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 180 + 0.25);
  // At a crawl the car steers the same way whether it is creeping forward
  // or back: a small bounce off a wall must not flip the steering and undo
  // a turn the driver is making.
  const speedSign = Math.abs(car.speed) < 30 ? 1 : Math.sign(car.speed);
  car.angle += steer * CFG.car.steerRate * steerAuthority * dt * speedSign;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (blockedForCar(world, nx, ny, CFG.car.radius)) {
    if (Math.abs(car.speed) > 300) {
      hurtPlayer(world, Math.min(24, (Math.abs(car.speed) - 300) / 22), ev);
      addParticles(world, car.x, car.y, '#f2c230', 8, 160);
    }
    car.speed *= -0.28;
  } else {
    car.x = nx;
    car.y = ny;
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  // Collisions with other cars.
  for (const other of world.cars) {
    if (other === car || other.disabled) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 44 && d > 0.01) {
      const push = (44 - d) / 2;
      const a = Math.atan2(car.y - other.y, car.x - other.x);
      const ox = car.x;
      const oy = car.y;
      const oox = other.x;
      const ooy = other.y;
      car.x += Math.cos(a) * push;
      car.y += Math.sin(a) * push;
      other.x -= Math.cos(a) * push;
      other.y -= Math.sin(a) * push;
      // A shove never pushes a car through a wall or onto the beach.
      if (blockedForCar(world, car.x, car.y, CFG.car.radius)) { car.x = ox; car.y = oy; }
      if (blockedForCar(world, other.x, other.y, CFG.car.radius)) { other.x = oox; other.y = ooy; }
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 250) {
        hurtPlayer(world, Math.min(16, (rel - 250) / 25), ev);
        addParticles(world, (car.x + other.x) / 2, (car.y + other.y) / 2, '#f2c230', 8, 150);
        other.speed *= 0.4;
        car.speed *= 0.6;
      }
    }
  }

  // Running over pedestrians.
  for (const ped of world.peds) {
    if (ped.dead) continue;
    const dPed = dist(car.x, car.y, ped.x, ped.y);
    // A fast car bearing down on a pedestrian sends them running early;
    // only a truly hard hit kills.
    if (dPed < 220 && Math.abs(car.speed) > 300) {
      const ahead = (ped.x - car.x) * Math.cos(car.angle) + (ped.y - car.y) * Math.sin(car.angle);
      if (ahead > 0) {
        ped.state = 'flee';
        ped.fleeT = 2;
        ped.fleeX = ped.x + (ped.x - car.x) * 4;
        ped.fleeY = ped.y + (ped.y - car.y) * 4;
      }
    }
    if (dPed < 34) {
      if (Math.abs(car.speed) > 320) {
        killPed(world, ped, ev, rng);
      } else {
        ped.state = 'flee';
        ped.fleeT = 2;
        ped.fleeX = ped.x + (ped.x - car.x) * 4;
        ped.fleeY = ped.y + (ped.y - car.y) * 4;
      }
    }
  }

  // Step out with E.
  if (inp.enter) {
    const side = car.angle + Math.PI / 2;
    const px = car.x + Math.cos(side) * 32;
    const py = car.y + Math.sin(side) * 32;
    if (!blockedForPerson(world, px, py, CFG.player.radius)) {
      p.x = px;
      p.y = py;
    } else {
      p.x = car.x - Math.cos(side) * 32;
      p.y = car.y - Math.sin(side) * 32;
    }
    car.parked = true;
    car.speed = 0;
    p.car = null;
  }
}

function stepBullets(world, dt, ev, rng) {
  const p = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && hitsBuilding(world, b.x, b.y, 2)) {
      addParticles(world, b.x, b.y, '#e8e1cd', 4, 90);
      dead = true;
    }
    if (!dead && !b.police) {
      for (const ped of world.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          ped.hp -= b.damage;
          if (ped.hp <= 0) killPed(world, ped, ev, rng);
          else {
            ped.state = 'flee';
            ped.fleeT = 2;
            ped.fleeX = ped.x + (ped.x - p.x) * 3;
            ped.fleeY = ped.y + (ped.y - p.y) * 3;
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const car of world.cars) {
          if (car === p.car) continue;
          if (dist(b.x, b.y, car.x, car.y) < 24) {
            car.hp -= b.damage;
            if (car.hp <= 0 && !car.disabled) {
              car.disabled = true;
              car.speed = 0;
              addParticles(world, car.x, car.y, '#888888', 12, 130);
            }
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.police) {
      if (dist(b.x, b.y, p.x, p.y) < 16) {
        hurtPlayer(world, b.damage, ev);
        dead = true;
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

function stepTraffic(world, dt, rng) {
  for (const car of world.cars) {
    if (car.parked || car.disabled || car.kind === 'police') continue;
    if (car === world.player.car) continue;
    car.turnCd = Math.max(0, car.turnCd - dt);
    // Stop for the car ahead in the same lane.
    let target = CFG.car.trafficSpeed;
    const hx = Math.cos(car.angle);
    const hy = Math.sin(car.angle);
    for (const other of world.cars) {
      if (other === car || other.disabled) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * hx + dy * hy;
      const side = Math.abs(dx * -hy + dy * hx);
      if (along > 0 && along < 85 && side < 26) {
        if (along < 52) target = 0;
        else target = Math.min(target, Math.abs(other.speed) * 0.85);
      }
    }
    if (car.speed < target) car.speed = Math.min(target, car.speed + CFG.car.trafficAccel * dt);
    else car.speed = Math.max(target, car.speed - CFG.car.brake * 0.5 * dt);
    const nx = car.x + hx * car.speed * dt;
    const ny = car.y + hy * car.speed * dt;
    if (!blockedForCar(world, nx, ny, CFG.car.radius)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.speed = 0;
    }
    // Turn at an intersection sometimes.
    if (car.turnCd <= 0) {
      const nearV = nearestRoadX(car.x);
      const nearH = nearestRoadY(car.y);
      const onCrossing = Math.abs(car.x - nearV) < 34 && Math.abs(car.y - nearH) < 34;
      if (onCrossing && rng() < 0.28) {
        if (car.axis === 'h') {
          car.axis = 'v';
          car.dir = rng() < 0.5 ? 1 : -1;
          car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.x = nearV + laneOffset('v', car.dir);
          car.y = nearH;
        } else {
          car.axis = 'h';
          car.dir = rng() < 0.5 ? 1 : -1;
          car.angle = car.dir > 0 ? 0 : Math.PI;
          car.y = nearH + laneOffset('h', car.dir);
          car.x = nearV;
        }
        car.turnCd = 2;
      }
    }
    // Scare nearby pedestrians with speed.
    if (Math.abs(car.speed) > 190) {
      for (const ped of world.peds) {
        if (ped.dead || ped.state === 'flee') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 150) {
          ped.state = 'flee';
          ped.fleeT = 1.6;
          ped.fleeX = ped.x + (ped.x - car.x) * 3;
          ped.fleeY = ped.y + (ped.y - car.y) * 3;
        }
      }
    }
  }
}

function stepPolice(world, dt, ev, rng) {
  const p = world.player;
  // Keep the pursuit sized to the heat; cruisers drift off when it cools.
  while (policeCars(world).length < desiredPolice(world.wanted)) spawnPolice(world, rng);
  for (let i = world.cars.length - 1; i >= 0; i--) {
    const car = world.cars[i];
    if (car.kind !== 'police') continue;
    if (world.wanted === 0) {
      if (dist(car.x, car.y, p.x, p.y) > 1200) {
        world.cars.splice(i, 1);
        continue;
      }
    }
    car.shootCd = Math.max(0, car.shootCd - dt);
    // A cruiser remembers where it last saw Marco. While it can see him it
    // chases; once the sight line breaks it drives to that last spot, then
    // searches the streets around it instead of homing in on him through
    // walls. That is what makes losing the heat possible.
    const sees = copSeesPlayer(world, car);
    if (sees) {
      car.lastSeenX = p.x;
      car.lastSeenY = p.y;
      car.searchT = 0;
    } else {
      car.searchT = (car.searchT || 0) + dt;
    }
    let targetX;
    let targetY;
    let topSpeed = CFG.car.policeTop;
    if (sees || car.searchT < 2) {
      targetX = sees ? p.x : car.lastSeenX;
      targetY = sees ? p.y : car.lastSeenY;
    } else {
      if (car.searchX === undefined || dist(car.x, car.y, car.searchX, car.searchY) < 70) {
        const a = rng() * TAU;
        const d = range(rng, 150, 420);
        car.searchX = nearestRoadX(Math.max(120, Math.min(CFG.worldW - 120, car.lastSeenX + Math.cos(a) * d)));
        car.searchY = nearestRoadY(Math.max(120, Math.min(BEACH_Y - 120, car.lastSeenY + Math.sin(a) * d)));
      }
      targetX = car.searchX;
      targetY = car.searchY;
      topSpeed = 210;
    }
    const targetAngle = Math.atan2(targetY - car.y, targetX - car.x);
    car.angle = turnToward(car.angle, targetAngle, 3.1 * dt);
    if (!car.disabled) {
      car.speed = Math.min(topSpeed, car.speed + CFG.car.accel * dt);
    } else car.speed = 0;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!blockedForCar(world, nx, ny, CFG.car.radius)) {
      car.x = nx;
      car.y = ny;
    } else {
      car.speed *= 0.35;
    }
    // Ram, bust and shoot only when the cruiser can actually see Marco.
    const d = dist(car.x, car.y, p.x, p.y);
    if (sees && d < 46) {
      if (p.car) {
        if (Math.abs(car.speed) > 250) {
          hurtPlayer(world, CFG.police.ramDamage, ev);
          car.speed *= 0.5;
        }
      } else if (Math.abs(car.speed) < 90) {
        world.bustTimer += dt;
        if (world.bustTimer > CFG.police.bustTime) {
          ev.busted = true;
          world.bustTimer = 0;
        }
      }
    }
    // A slow player in a car gets busted too when a cruiser sits on them.
    if (sees && p.car && d < CFG.police.bustRange && Math.abs(p.car.speed) < 70) {
      world.bustTimer += dt;
      if (world.bustTimer > CFG.police.bustTime) {
        ev.busted = true;
        world.bustTimer = 0;
      }
    }
    // At 3 stars and up the cruisers open fire.
    if (sees && world.wanted >= 3 && d < CFG.police.shootRange && car.shootCd <= 0) {
      car.shootCd = CFG.police.shootCooldown;
      const a = targetAngle + (rng() - 0.5) * 0.24;
      world.bullets.push({
        x: car.x + Math.cos(a) * 22, y: car.y + Math.sin(a) * 22,
        vx: Math.cos(a) * 780, vy: Math.sin(a) * 780,
        life: 1.2, police: true, damage: CFG.police.bulletDamage,
      });
      ev.shot = true;
    }
  }
  if (policeCars(world).every((c) => dist(c.x, c.y, p.x, p.y) > CFG.police.bustRange + 8)) {
    world.bustTimer = Math.max(0, world.bustTimer - dt * 2);
  }
}

function stepPeds(world, dt, rng) {
  if (world.lastShot) {
    world.lastShot.t -= dt;
    if (world.lastShot.t <= -1) world.lastShot = null;
  }
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (world.lastShot && dist(ped.x, ped.y, world.lastShot.x, world.lastShot.y) < 460) {
      ped.state = 'flee';
      ped.fleeT = 2.2;
      ped.fleeX = ped.x + (ped.x - world.lastShot.x) * 3;
      ped.fleeY = ped.y + (ped.y - world.lastShot.y) * 3;
    }
    let speed = CFG.peds.walk;
    if (ped.state === 'flee') {
      speed = CFG.peds.flee;
      ped.fleeT -= dt;
      ped.angle = Math.atan2(ped.fleeY - ped.y, ped.fleeX - ped.x);
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else {
      ped.turnCd -= dt;
      if (ped.turnCd <= 0) {
        const nearV = nearestRoadX(ped.x);
        const nearH = nearestRoadY(ped.y);
        if (Math.abs(ped.x - nearV) < 60 && Math.abs(ped.y - nearH) < 60 && rng() < 0.4) {
          ped.angle = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
          ped.turnCd = range(rng, 2, 5);
        } else {
          ped.turnCd = 0.8;
        }
      }
    }
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    if (!blockedForPerson(world, nx, ped.y, 10)) ped.x = nx;
    else ped.angle += Math.PI / 2;
    if (!blockedForPerson(world, ped.x, ny, 10)) ped.y = ny;
    else ped.angle += Math.PI / 2;
  }
}

function stepWanted(world, dt) {
  if (world.wanted <= 0) return;
  const seen = policeCars(world).some((c) => copSeesPlayer(world, c));
  if (seen) {
    world.unseenTime = 0;
    world.decayTimer = 0;
  } else {
    world.unseenTime += dt;
    if (world.unseenTime > CFG.wanted.loseSight) {
      world.decayTimer += dt;
      if (world.decayTimer >= CFG.wanted.decayEvery) {
        world.wanted -= 1;
        world.decayTimer = 0;
        world.unseenTime = CFG.wanted.loseSight;
      }
    }
  }
}

function stepMissions(world, ev, rng) {
  const m = world.mission;
  const p = world.player;
  if (m.index === 0 && m.stage === 'deliver' && p.car) {
    if (dist(p.x, p.y, world.garage.x, world.garage.y) < 78) completeMission(world, ev, rng);
  } else if (m.index === 1) {
    if (m.stage === 'pickup' && dist(p.x, p.y, world.packageSpot.x, world.packageSpot.y) < 42) {
      m.packageHeld = true;
      m.stage = 'dropoff';
      setMessage(world, 'Package grabbed — run it to the blue docks.');
    } else if (m.stage === 'dropoff' && dist(p.x, p.y, world.docks.x, world.docks.y) < 88) {
      completeMission(world, ev, rng);
    }
  } else if (m.index === 2 && m.stage === 'hide' && world.wanted === 0) {
    completeMission(world, ev, rng);
  }
}

function stepCash(world, ev) {
  const p = world.player;
  for (const c of world.cash) {
    if (c.taken) continue;
    if (dist(p.x, p.y, c.x, c.y) < 30) {
      c.taken = true;
      p.money += c.amount;
      ev.pickup = true;
      addParticles(world, c.x, c.y, PALETTE.cash, 8, 110);
    }
  }
}

function stepParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export function saveGame(world) {
  try {
    const p = world.player;
    localStorage.setItem(CFG.saveKey, JSON.stringify({
      v: 1, seed: world.seed,
      x: Math.round(p.x), y: Math.round(p.y),
      hp: p.hp, money: p.money, ammo: p.ammo,
      missionIndex: world.mission.index,
      missionStage: world.mission.stage,
      missionDone: world.mission.done,
      wanted: world.wanted,
      clockH: world.clockH,
    }));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(world, save) {
  const p = world.player;
  p.x = save.x;
  p.y = save.y;
  p.hp = save.hp;
  p.money = save.money;
  p.ammo = save.ammo;
  world.mission.index = save.missionIndex;
  world.mission.stage = save.missionStage;
  world.mission.done = save.missionDone.slice(0, 3);
  world.mission.packageHeld = save.missionStage === 'dropoff';
  world.wanted = save.wanted;
  world.clockH = save.clockH;
  if (world.mission.index === 2 && world.mission.stage === 'hide' && world.wanted === 0) {
    world.wanted = 3;
  }
}
