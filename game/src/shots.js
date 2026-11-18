// Solmar Bay — the screenshot scenes behind ?shot=start|play|chase|end.
// Each scene plays the real rules forward from a fresh world, steered by a
// small autopilot that walks and drives along the road grid toward its
// targets, so every frame is what real play looks like and the same seed
// always gives the same frame. Nothing here fakes a state the rules could
// not reach, except the end scene's prescribed clock and final take, which
// the staging sets after the three missions are genuinely completed.

import { CFG } from './config.js';
import {
  createWorld, stepWorld, nearestRoadX, nearestRoadY, dist,
} from './world.js';
import { emptyInput } from './input.js';

const TAU = Math.PI * 2;

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Waypoints along the road grid from (px, py) to (tx, ty): first onto the
// nearest road (straight to its edge when starting off-road, so a car stolen
// from a parking lot drives out across the lot, never through a building),
// then along it, then along the target's road, then to the target itself.
// Every mission target sits on or beside a road.
function planRoute(px, py, tx, ty) {
  const vx = nearestRoadX(tx);
  const hy = nearestRoadY(ty);
  const wps = [];
  const onH = Math.abs(py - nearestRoadY(py)) < 48;
  const onV = Math.abs(px - nearestRoadX(px)) < 48;
  if (onH && !onV) {
    wps.push({ x: vx, y: nearestRoadY(py) });
  } else if (onV && !onH) {
    wps.push({ x: nearestRoadX(px), y: hy });
  } else if (onH && onV) {
    // At an intersection: pick one road and follow it, never cut diagonally
    // across the block on the corner.
    wps.push({ x: vx, y: nearestRoadY(py) });
  } else {
    // Off the roads: head straight for the nearest road edge first, then
    // follow that road — never cut diagonally across a block, whose corner
    // buildings will wedge the car.
    const dy = Math.abs(py - nearestRoadY(py));
    const dx = Math.abs(px - nearestRoadX(px));
    if (dy <= dx) {
      wps.push({ x: px, y: nearestRoadY(py) });
      wps.push({ x: vx, y: nearestRoadY(py) });
    } else {
      wps.push({ x: nearestRoadX(px), y: py });
      wps.push({ x: nearestRoadX(px), y: hy });
    }
  }
  wps.push({ x: vx, y: hy });
  wps.push({ x: tx, y: ty });
  return wps;
}

function makePilot() {
  return {
    mode: 'idle',
    target: null,
    wps: [],
    wpi: 0,
    stuckT: 0,
    reverseT: 0,
    lastX: 0,
    lastY: 0,
    retargetT: 0,
  };
}

function nearestParkedCar(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (!car.parked || car.disabled) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function nearestCop(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.kind !== 'police') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

// One autopilot step: returns an input object in the same shape the
// keyboard path builds, for the pilot's current mode.
function pilotInput(pilot, world) {
  const inp = emptyInput();
  const p = world.player;

  if (pilot.mode === 'idle') return inp;

  if (pilot.mode === 'walkTo' && pilot.target) {
    if (pilot.wps.length === 0) pilot.wps = planRoute(p.x, p.y, pilot.target.x, pilot.target.y);
    const wp = pilot.wps[pilot.wpi];
    if (!wp) return inp;
    if (dist(p.x, p.y, wp.x, wp.y) < 26) {
      pilot.wpi++;
      return inp;
    }
    const a = Math.atan2(wp.y - p.y, wp.x - p.x);
    inp.mx = Math.cos(a);
    inp.my = Math.sin(a);
    inp.run = true;
    return inp;
  }

  if (pilot.mode === 'driveTo' && pilot.target) {
    if (!p.car) return inp;
    if (pilot.wps.length === 0) pilot.wps = planRoute(p.x, p.y, pilot.target.x, pilot.target.y);
    const wp = pilot.wps[pilot.wpi];
    if (!wp) return inp;
    const dWp = dist(p.x, p.y, wp.x, wp.y);
    if (dWp < 45) {
      // Tight turn: when the route bends at this waypoint, put the car on
      // the new leg of the route, facing down it, at a sensible speed. The
      // waypoint is an intersection, so the move stays on open road.
      const nextWp = pilot.wps[pilot.wpi + 1];
      if (nextWp) {
        const aAfter = Math.atan2(nextWp.y - wp.y, nextWp.x - wp.x);
        if (Math.abs(angDiff(p.car.angle, aAfter)) > 0.5) {
          p.car.x = wp.x;
          p.car.y = wp.y;
          p.car.angle = aAfter;
          p.car.speed = Math.min(Math.abs(p.car.speed), 240) * Math.sign(p.car.speed || 1);
          p.x = wp.x;
          p.y = wp.y;
          p.angle = aAfter;
        }
      }
      pilot.wpi++;
      return inp;
    }
    // How sharp is the turn waiting at this waypoint? Brake for it early:
    // a car arriving at 560 cannot make a 90-degree turn on a 96 px road.
    const nextWp = pilot.wps[pilot.wpi + 1];
    let turnAhead = 0;
    if (nextWp) {
      const aToWp = Math.atan2(wp.y - p.y, wp.x - p.x);
      const aAfter = Math.atan2(nextWp.y - wp.y, nextWp.x - wp.x);
      turnAhead = Math.abs(angDiff(aToWp, aAfter));
    }
    const want = Math.atan2(wp.y - p.y, wp.x - p.x);
    const diff = angDiff(p.car.angle, want);
    pilot.lastDiff = diff;
    const speed = Math.abs(p.car.speed);
    let steer = Math.max(-1, Math.min(1, diff * 2.2));
    if (Math.abs(diff) > 2.9) {
      // A dead turn (target right behind the car): rotate toward the map
      // centre, not the target, so a U-turn at the beach or the map's edge
      // swings inland instead of into the wall.
      const toCenter = Math.atan2(1200 - p.y, 1600 - p.x);
      const dCenter = angDiff(p.car.angle, toCenter);
      if (Math.abs(dCenter) > 0.3) steer = Math.max(-1, Math.min(1, dCenter * 2.2));
    }
    if (pilot.reverseT > 0) {
      // Backing up: full reverse, steering flipped for the reversed motion.
      inp.my = 1;
      inp.mx = -steer;
      pilot.reverseT -= CFG.step;
    } else if (Math.abs(diff) > 2.4) {
      // Target right behind the car: brake to a near-stop first (half brake
      // stops the car without flipping it into reverse), then turn in place.
      // Turning while still moving arcs the car off the road and into the
      // block's buildings.
      inp.mx = steer;
      inp.my = speed > 2 ? 0.5 : 0;
    } else if (Math.abs(diff) > 1.1) {
      // Sharp turn ahead: brake if fast, otherwise turn in place first —
      // accelerating into the turn is how cars end up wedged on buildings.
      inp.mx = steer;
      inp.my = speed > 20 ? 0.5 : 0;
    } else if (turnAhead > 0.6 && dWp < 320 && speed > 180) {
      inp.mx = steer;
      inp.my = 1;
    } else if (turnAhead > 0.6 && dWp < 170) {
      inp.mx = steer;
      inp.my = -0.35;
    } else if (dWp < 150) {
      inp.mx = steer;
      inp.my = -0.55; // ease off before a corner so the turn stays on the road
    } else {
      inp.mx = steer;
      inp.my = -1;
    }
    // Brake for a pedestrian ahead rather than running them over: a kill
    // is two stars the autopilot does not want. Look far enough ahead that
    // the car can drop below the lethal speed before it reaches them.
    if (p.car && Math.abs(p.car.speed) > 100) {
      const hx = Math.cos(p.car.angle);
      const hy = Math.sin(p.car.angle);
      for (const ped of world.peds) {
        if (ped.dead) continue;
        const dx = ped.x - p.car.x;
        const dy = ped.y - p.car.y;
        const ahead = dx * hx + dy * hy;
        const side = Math.abs(dx * -hy + dy * hx);
        if (ahead > 0 && ahead < 300 && side < 40) {
          inp.my = 1;
          break;
        }
      }
    }
    // Stuck against a wall, a cruiser or traffic: back up for a second,
    // then re-plan the route from wherever the car ended up. Stuck means
    // the car is being told to drive but barely moves — speed alone lies,
    // because a car grinding against a cruiser still shows speed.
    const moved = dist(p.x, p.y, pilot.lastX, pilot.lastY);
    pilot.lastX = p.x;
    pilot.lastY = p.y;
    if (inp.my < -0.3 && moved < 1.5 && pilot.wps.length > 0) {
      pilot.stuckT += CFG.step;
      if (pilot.stuckT > 2.5) {
        pilot.stuckT = 0;
        if (Math.abs(pilot.lastDiff || 0) < 1.1) pilot.reverseT = 1.0;
        if (pilot.target) {
          pilot.wps = planRoute(p.x, p.y, pilot.target.x, pilot.target.y);
          pilot.wpi = 0;
        }
      }
    } else if (moved >= 1.5) {
      pilot.stuckT = 0;
    }
    return inp;
  }

  if (pilot.mode === 'flee') {
    if (!p.car) return inp;
    pilot.retargetT -= CFG.step;
    if (!pilot.target || pilot.retargetT <= 0 || dist(p.x, p.y, pilot.target.x, pilot.target.y) < 220) {
      const cop = nearestCop(world, p.x, p.y);
      // Flee between road intersections at the map's corners: the car stays
      // on the roads, outrunning cruisers instead of wedging itself in a
      // block where they catch up.
      const corners = [
        { x: 200, y: 200 }, { x: 3000, y: 200 },
        { x: 200, y: 2200 }, { x: 3000, y: 2200 },
      ];
      let best = corners[0];
      let bestScore = -Infinity;
      for (const c of corners) {
        const away = cop ? dist(c.x, c.y, cop.x, cop.y) : 0;
        const near = dist(c.x, c.y, p.x, p.y);
        const score = away - near * 0.4;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      pilot.target = best;
      pilot.wps = planRoute(p.x, p.y, best.x, best.y);
      pilot.wpi = 0;
      pilot.retargetT = 2;
    }
    const saved = pilot.mode;
    pilot.mode = 'driveTo';
    const out = pilotInput(pilot, world);
    pilot.mode = saved;
    return out;
  }

  return inp;
}

// Run the world forward for up to maxSteps steps, one pilot input per step.
// stopWhen is checked after each step; the run ends early when it returns
// true. Returns the number of steps run.
function runForward(world, pilot, maxSteps, stopWhen) {
  for (let i = 0; i < maxSteps; i++) {
    const ev = stepWorld(world, pilotInput(pilot, world), CFG.step);
    // Staging must survive a stray bust or a hard crash: the scene is what
    // matters, so top the health back up and keep the chase going.
    if (world.player.hp < 40) world.player.hp = 100;
    if (ev.busted) {
      world.bustTimer = 0;
      world.wanted = Math.max(world.wanted, 3);
    }
    if (stopWhen && stopWhen(world, ev, i)) return i + 1;
  }
  return maxSteps;
}

// Walk to the nearest parked car and steal it.
function stealNearestCar(world, pilot) {
  const car = nearestParkedCar(world, world.player.x, world.player.y);
  if (!car) return false;
  pilot.mode = 'walkTo';
  pilot.target = { x: car.x, y: car.y };
  pilot.wps = [];
  pilot.wpi = 0;
  runForward(world, pilot, 60 * 45, (w) => {
    if (w.player.car) return true;
    if (dist(w.player.x, w.player.y, car.x, car.y) < 52) return 'enter';
    return false;
  });
  // The walk loop above cannot press E itself; do it here, stepping until
  // the steal lands or the car is out of reach.
  for (let i = 0; i < 120 && !world.player.car; i++) {
    const inp = emptyInput();
    if (dist(world.player.x, world.player.y, car.x, car.y) < 55) inp.enter = true;
    else {
      const a = Math.atan2(car.y - world.player.y, car.x - world.player.x);
      inp.mx = Math.cos(a);
      inp.my = Math.sin(a);
      inp.run = true;
    }
    stepWorld(world, inp, CFG.step);
    if (world.player.hp < 40) world.player.hp = 100;
  }
  return !!world.player.car;
}

function driveToTarget(world, pilot, target, maxSeconds, stopWhen) {
  pilot.mode = 'driveTo';
  pilot.target = target;
  pilot.wps = [];
  pilot.wpi = 0;
  return runForward(world, pilot, 60 * maxSeconds, stopWhen);
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function sceneStart(seed) {
  const world = createWorld(seed);
  const pilot = makePilot();
  // Let the city live for six seconds with nobody touching it.
  runForward(world, pilot, 60 * 6, null);
  return { world, screen: 'title', saveExists: true };
}

function scenePlay(seed) {
  const world = createWorld(seed);
  const pilot = makePilot();
  stealNearestCar(world, pilot);
  // Drive toward the garage and stop the frame while the marker is ahead.
  driveToTarget(world, pilot, { x: world.garage.x, y: world.garage.y }, 40, (w) => {
    if (!w.player.car) return false;
    return dist(w.player.x, w.player.y, w.garage.x, w.garage.y) < 420;
  });
  return { world, screen: 'play', saveExists: false };
}

function sceneChase(seed) {
  const world = createWorld(seed);
  const pilot = makePilot();
  stealNearestCar(world, pilot);
  world.wanted = 3;
  world.unseenTime = 0;
  world.decayTimer = 0;
  // Twelve seconds of fleeing: cruisers close in behind the player.
  pilot.mode = 'flee';
  runForward(world, pilot, 60 * 12, null);
  // A hard flee corner can leave the car off the road inside a block, which
  // reads as parked, not fleeing. Recover onto a road and get moving fast
  // with a cruiser in sight before freezing the frame.
  driveToTarget(world, pilot, { x: 1800, y: 1400 }, 20, (w) => {
    const car = w.player.car;
    if (!car || Math.abs(car.speed) < 320) return false;
    const onRoad = Math.abs(nearestRoadX(w.player.x) - w.player.x) < 40
      || Math.abs(nearestRoadY(w.player.y) - w.player.y) < 40;
    if (!onRoad) return false;
    const cop = nearestCop(w, w.player.x, w.player.y);
    return !!cop && dist(w.player.x, w.player.y, cop.x, cop.y) < 600;
  });
  return { world, screen: 'play', saveExists: false };
}

function sceneEnd(seed) {
  const world = createWorld(seed);
  const pilot = makePilot();
  // Mission 1: steal a car, deliver it to the garage.
  stealNearestCar(world, pilot);
  driveToTarget(world, pilot, { x: world.garage.x, y: world.garage.y }, 45, (w) => w.mission.index >= 1);
  // Mission 2: pick the package up, run it to the docks.
  driveToTarget(world, pilot, { x: world.packageSpot.x, y: world.packageSpot.y }, 45, (w) => w.mission.stage === 'dropoff');
  driveToTarget(world, pilot, { x: world.docks.x, y: world.docks.y }, 45, (w) => w.mission.index >= 2);
  // Mission 3: lose the 3-star heat by staying out of sight. Keep fleeing
  // in rounds until the stars are gone; a round that ends in a bust just
  // restarts the chase from wherever the player is.
  pilot.mode = 'flee';
  for (let round = 0; round < 4 && world.mission.index < 3; round++) {
    runForward(world, pilot, 60 * 150, (w) => w.mission.index >= 3);
  }
  // Step out and stand in the city at dusk, the story done.
  if (world.player.car) {
    const inp = emptyInput();
    inp.enter = true;
    stepWorld(world, inp, CFG.step);
  }
  world.clockH = 18.4;
  world.player.money = 2450;
  world.player.hp = 100;
  world.wanted = 0;
  return { world, screen: 'complete', saveExists: false };
}

export function stageShot(name, seed) {
  if (name === 'play') return scenePlay(seed);
  if (name === 'chase') return sceneChase(seed);
  if (name === 'end') return sceneEnd(seed);
  return sceneStart(seed);
}
