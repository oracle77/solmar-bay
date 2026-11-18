// Solmar Bay — the canvas renderer. World state in, pixels out.
// Top-down view: the city, its cars and people, the HUD with its minimap,
// and every screen (title, pause, busted, wasted, story complete). The
// camera follows Marco and never shows outside the world.

import { CFG, PALETTE } from './config.js';
import { ROADS_V, ROADS_H, BEACH_Y, WATER_Y, currentObjective } from './world.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createCamera() {
  return { x: 0, y: 0 };
}

export function updateCamera(camera, world) {
  const p = world.player;
  camera.x = Math.max(0, Math.min(CFG.worldW - CFG.viewW, p.x - CFG.viewW / 2));
  camera.y = Math.max(0, Math.min(CFG.worldH - CFG.viewH, p.y - CFG.viewH / 2));
}

function text(ctx, str, x, y, size, color, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function shadowed(ctx, str, x, y, size, color, align = 'left', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(str, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// Daylight: how bright and how warm the light is at this hour.
export function dayTint(clockH) {
  if (clockH >= 7 && clockH < 17) return null;
  if (clockH >= 17 && clockH < 19.5) return 'rgba(255,110,40,0.13)';
  if (clockH >= 19.5 || clockH < 5.5) return 'rgba(8,16,52,0.34)';
  return 'rgba(255,150,80,0.10)';
}

export function formatClock(clockH) {
  const h = Math.floor(clockH) % 24;
  const m = Math.floor((clockH - Math.floor(clockH)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

function drawCity(ctx, world, camera) {
  const x0 = camera.x - 60;
  const y0 = camera.y - 60;
  const x1 = camera.x + CFG.viewW + 60;
  const y1 = camera.y + CFG.viewH + 60;

  // Grass base.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // The park.
  const park = world.park;
  ctx.fillStyle = PALETTE.park;
  ctx.fillRect(park.x, park.y, park.w, park.h);
  ctx.fillStyle = '#3f8fbf';
  ctx.beginPath();
  ctx.ellipse(world.pond.x, world.pond.y, world.pond.rx, world.pond.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Beach and water along the south edge.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(Math.max(x0, 0), BEACH_Y, CFG.worldW, WATER_Y - BEACH_Y);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(Math.max(x0, 0), WATER_Y, CFG.worldW, CFG.worldH - WATER_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const wy = WATER_Y + 14 + i * 18;
    ctx.beginPath();
    for (let x = Math.max(x0, 0); x <= Math.min(x1, CFG.worldW); x += 40) {
      const yy = wy + Math.sin((x + world.time * 30 + i * 90) * 0.02) * 3;
      if (x === Math.max(x0, 0)) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // Sidewalks, then asphalt, then lane dashes.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const c of ROADS_V) ctx.fillRect(c - CFG.roadW / 2 - 14, y0, CFG.roadW + 28, y1 - y0);
  for (const c of ROADS_H) ctx.fillRect(x0, c - CFG.roadW / 2 - 14, x1 - x0, CFG.roadW + 28);
  ctx.fillStyle = PALETTE.asphalt;
  for (const c of ROADS_V) ctx.fillRect(c - CFG.roadW / 2, y0, CFG.roadW, y1 - y0);
  for (const c of ROADS_H) ctx.fillRect(x0, c - CFG.roadW / 2, x1 - x0, CFG.roadW);

  ctx.fillStyle = PALETTE.laneMark;
  for (const c of ROADS_V) {
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
      ctx.fillRect(c - 2, y, 4, 22);
    }
  }
  for (const c of ROADS_H) {
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
      ctx.fillRect(x, c - 2, 22, 4);
    }
  }

  // Buildings: shadow, walls, roof, windows.
  for (const b of world.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    if (b.roofKind === 'peak') {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.h * 0.55);
      ctx.lineTo(b.x + b.w / 2, b.y + 6);
      ctx.lineTo(b.x + b.w, b.y + b.h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(b.x, b.y + b.h * 0.55, b.w, b.h * 0.45);
    } else if (b.roofKind === 'round') {
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h * 0.4, b.w / 2, b.h * 0.32, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(b.x, b.y + b.h * 0.4, b.w, b.h * 0.6);
    } else {
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    }
    // Windows along the walls.
    ctx.fillStyle = 'rgba(255,244,200,0.85)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j) % 2 === 0) continue;
        ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 10, 12);
      }
    }
    if (b.hotel) {
      ctx.fillStyle = '#fff8dc';
      ctx.fillRect(b.x + b.w / 2 - 16, b.y - 14, 32, 12);
      text(ctx, 'HOTEL', b.x + b.w / 2, b.y - 4, 9, '#2e5f8a', 'center', 800);
    }
  }

  // Trees.
  for (const t of world.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.treeLight;
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cash pickups.
  for (const c of world.cash) {
    if (c.taken) continue;
    if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const pulse = 1 + Math.sin(world.time * 5 + c.x) * 0.15;
    ctx.fillStyle = PALETTE.cash;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 11 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c3d20';
    text(ctx, '$', c.x, c.y + 5, 13, '#0c3d20', 'center', 900);
  }
}

function drawCar(ctx, car, isPlayer, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const len = car.kind === 'truck' ? 58 : 46;
  const wid = car.kind === 'truck' ? 26 : 23;
  // Wheels.
  ctx.fillStyle = '#14161a';
  ctx.fillRect(-len / 2 + 4, -wid / 2 - 3, 12, 5);
  ctx.fillRect(-len / 2 + 4, wid / 2 - 2, 12, 5);
  ctx.fillRect(len / 2 - 16, -wid / 2 - 3, 12, 5);
  ctx.fillRect(len / 2 - 16, wid / 2 - 2, 12, 5);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.fill();
  if (car.kind === 'police') {
    ctx.fillStyle = PALETTE.policeStripe;
    ctx.fillRect(-len / 2 + 6, -3, len - 12, 6);
    const flash = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-6, -wid / 2 - 2, 6, 5);
    ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(0, -wid / 2 - 2, 6, 5);
  }
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(-4, -wid / 2 - 4, 10, 5);
  }
  // Windshield and roof.
  ctx.fillStyle = 'rgba(20,30,45,0.75)';
  ctx.fillRect(len / 2 - 16, -wid / 2 + 4, 8, wid - 8);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-8, -wid / 2 + 3, 14, wid - 6);
  if (car.disabled) {
    ctx.strokeStyle = 'rgba(120,120,120,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -wid / 2);
    ctx.quadraticCurveTo(-14, -wid / 2 - 14, -8, -wid / 2 - 24);
    ctx.stroke();
  }
  ctx.restore();
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 32, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPed(ctx, ped) {
  if (ped.dead) return;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(ped.x + 2, ped.y + 3, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c49a';
  ctx.beginPath();
  ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.car) return; // the car drawing carries the player
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(p.x + 2, p.y + 3, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.playerDark;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick and a hint of a jacket.
  ctx.fillStyle = '#e8c49a';
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.angle) * 5, p.y + Math.sin(p.angle) * 5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
  ctx.stroke();
  if (p.punchAnim > 0) {
    ctx.strokeStyle = 'rgba(255,220,120,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 30, p.angle - 0.7, p.angle + 0.7);
    ctx.stroke();
  }
  if (p.muzzle > 0) {
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarker(ctx, world, camera, obj) {
  if (!obj.marker) return;
  const m = obj.marker;
  const pulse = 1 + Math.sin(world.time * 4) * 0.12;
  const sx = m.x - camera.x;
  const sy = m.y - camera.y;
  if (sx > 0 && sx < CFG.viewW && sy > 0 && sy < CFG.viewH) {
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = m.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Off-screen arrow at the view's edge.
    const cx = CFG.viewW / 2;
    const cy = CFG.viewH / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const ax = cx + Math.cos(a) * 300;
    const ay = cy + Math.sin(a) * 190;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(ctx, `${Math.round(Math.hypot(m.x - world.player.x, m.y - world.player.y))}m`, ax, ay - 18, 13, '#fff', 'center');
  }
}

export function drawGame(ctx, world, camera) {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawCity(ctx, world, camera);
  drawMarker(ctx, world, camera, currentObjective(world));
  for (const car of world.cars) {
    if (car.x < camera.x - 80 || car.x > camera.x + CFG.viewW + 80) continue;
    if (car.y < camera.y - 80 || car.y > camera.y + CFG.viewH + 80) continue;
    drawCar(ctx, car, car === world.player.car, world.time);
  }
  for (const ped of world.peds) {
    if (ped.x < camera.x - 40 || ped.x > camera.x + CFG.viewW + 40) continue;
    if (ped.y < camera.y - 40 || ped.y > camera.y + CFG.viewH + 40) continue;
    drawPed(ctx, ped);
  }
  drawPlayer(ctx, world);
  // Bullets.
  ctx.strokeStyle = '#ffe27a';
  ctx.lineWidth = 3;
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Day / night light over everything.
  const tint = dayTint(world.clockH);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, CFG.viewW, CFG.viewH);
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function drawMinimap(ctx, world) {
  const mw = 200;
  const mh = 150;
  const ox = CFG.viewW - mw - 16;
  const oy = 16;
  const sx = mw / CFG.worldW;
  const sy = mh / CFG.worldH;
  ctx.fillStyle = 'rgba(10,14,20,0.72)';
  roundRect(ctx, ox - 4, oy - 4, mw + 8, mh + 8, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, ox, oy, mw, mh, 6);
  ctx.clip();
  ctx.fillStyle = '#4a7a3a';
  ctx.fillRect(ox, oy, mw, mh);
  ctx.fillStyle = '#2e7fb5';
  ctx.fillRect(ox, oy + WATER_Y * sy, mw, (CFG.worldH - WATER_Y) * sy);
  ctx.fillStyle = '#e6cf96';
  ctx.fillRect(ox, oy + BEACH_Y * sy, mw, (WATER_Y - BEACH_Y) * sy);
  ctx.strokeStyle = 'rgba(220,220,220,0.7)';
  ctx.lineWidth = 1;
  for (const c of ROADS_V) {
    ctx.beginPath();
    ctx.moveTo(ox + c * sx, oy);
    ctx.lineTo(ox + c * sx, oy + mh);
    ctx.stroke();
  }
  for (const c of ROADS_H) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + c * sy);
    ctx.lineTo(ox + mw, oy + c * sy);
    ctx.stroke();
  }
  const obj = currentObjective(world);
  if (obj.marker) {
    ctx.fillStyle = obj.marker.color;
    ctx.beginPath();
    ctx.arc(ox + obj.marker.x * sx, oy + obj.marker.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#c9c9c9';
  for (const car of world.cars) {
    if (car.kind === 'police') continue;
    ctx.fillRect(ox + car.x * sx - 1, oy + car.y * sy - 1, 2, 2);
  }
  const flash = Math.floor(world.time * 4) % 2 === 0;
  for (const car of world.cars) {
    if (car.kind !== 'police') continue;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.beginPath();
    ctx.arc(ox + car.x * sx, oy + car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = world.player;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ox + p.x * sx, oy + p.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  text(ctx, 'SOLMAR BAY', ox + mw / 2, oy + mh + 18, 11, 'rgba(255,255,255,0.85)', 'center', 700);
}

export function drawHUD(ctx, world) {
  const p = world.player;
  const m = world.mission;

  // Money and health, top left.
  shadowed(ctx, `$${p.money.toLocaleString('en-US')}`, 20, 36, 30, '#7dff9e');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 20, 48, 190, 16, 8);
  ctx.fill();
  ctx.fillStyle = p.hp > 30 ? '#37d67a' : '#ff4a3d';
  roundRect(ctx, 22, 50, 186 * Math.max(0, p.hp / 100), 12, 6);
  ctx.fill();
  text(ctx, `${Math.ceil(p.hp)}`, 218, 62, 13, '#fff', 'left', 700);

  // Wanted stars.
  for (let i = 0; i < 5; i++) {
    const sx = 22 + i * 30;
    const sy = 84;
    ctx.font = '700 24px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = i < world.wanted ? '#ffd23f' : 'rgba(255,255,255,0.35)';
    ctx.fillText('★', sx, sy);
  }
  if (world.wanted > 0) {
    text(ctx, world.wanted >= 3 ? 'POLICE ARE SHOOTING' : 'WANTED', 22, 108, 12, '#ff6a5a', 'left', 800);
  }

  // Clock, top centre.
  const night = world.clockH >= 19.5 || world.clockH < 5.5;
  const dusk = world.clockH >= 17 && world.clockH < 19.5;
  shadowed(ctx, `${night ? '☾' : dusk ? '◐' : '☀'} ${formatClock(world.clockH)}`, CFG.viewW / 2, 34, 22, '#fff', 'center');

  // Mission objective panel.
  const obj = currentObjective(world);
  const missionName = m.index < 3 ? CFG.missions[m.index].name : 'Story complete';
  ctx.fillStyle = 'rgba(10,14,20,0.62)';
  roundRect(ctx, 16, 118, 330, 56, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(16, 118, 4, 56);
  text(ctx, `MISSION ${Math.min(m.index + 1, 3)}/3 — ${missionName}`, 30, 140, 13, '#ffd23f', 'left', 800);
  text(ctx, obj.text, 30, 162, 14, '#fff', 'left', 600);

  // Toast message.
  if (world.messageT > 0 && world.message) {
    ctx.fillStyle = 'rgba(10,14,20,0.7)';
    const w = ctx.measureText(world.message).width + 40;
    ctx.font = `600 15px ${FONT}`;
    const tw = ctx.measureText(world.message).width + 40;
    roundRect(ctx, CFG.viewW / 2 - tw / 2, 52, tw, 30, 15);
    ctx.fill();
    text(ctx, world.message, CFG.viewW / 2, 73, 15, '#fff', 'center', 600);
  }

  // Ammo and speed, bottom right.
  if (p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.12);
    shadowed(ctx, `${mph}`, CFG.viewW - 24, CFG.viewH - 56, 44, '#fff', 'right');
    text(ctx, 'mph', CFG.viewW - 24, CFG.viewH - 30, 14, 'rgba(255,255,255,0.8)', 'right', 600);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, CFG.viewW - 224, CFG.viewH - 22, 200, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    roundRect(ctx, CFG.viewW - 222, CFG.viewH - 20, 196 * Math.min(1, Math.abs(p.car.speed) / CFG.car.topSpeed), 4, 2);
    ctx.fill();
  } else {
    text(ctx, `PISTOL  ${p.ammo} / ${CFG.player.ammo}`, CFG.viewW - 24, CFG.viewH - 52, 16, '#fff', 'right', 700);
    if (p.reloadT > 0) text(ctx, 'RELOADING…', CFG.viewW - 24, CFG.viewH - 30, 13, '#ffd23f', 'right', 700);
  }

  // Controls hint, bottom left.
  text(ctx, 'WASD move · Shift run · F punch · Click shoot · E enter car · P pause · M mute', 20, CFG.viewH - 18, 13, 'rgba(255,255,255,0.65)', 'left', 600);

  drawMinimap(ctx, world);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(6,10,18,${alpha})`;
  ctx.fillRect(0, 0, CFG.viewW, CFG.viewH);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,12,20,0.78)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,63,0.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
}

export function drawTitle(ctx, world, saveExists) {
  dim(ctx, 0.45);
  ctx.fillStyle = 'rgba(255,122,26,0.9)';
  roundRect(ctx, CFG.viewW / 2 - 150, 108, 300, 8, 4);
  ctx.fill();
  shadowed(ctx, 'SOLMAR BAY', CFG.viewW / 2, 196, 84, '#fff', 'center', 900);
  shadowed(ctx, 'A sun-soaked open-world crime story', CFG.viewW / 2, 236, 22, '#ffd23f', 'center', 600);
  text(ctx, 'Marco came home to Solmar Bay with nothing but a name and a grudge.', CFG.viewW / 2, 288, 17, '#e8ecf2', 'center', 500);
  text(ctx, 'Steal a car. Run a package. Lose the heat. Own the city.', CFG.viewW / 2, 314, 17, '#e8ecf2', 'center', 500);

  panel(ctx, CFG.viewW / 2 - 330, 350, 660, 190);
  text(ctx, 'HOW TO PLAY', CFG.viewW / 2, 384, 16, '#ffd23f', 'center', 800);
  const lines = [
    'WASD / Arrows — walk and drive      Shift — run',
    'Mouse — aim the pistol      Click — shoot      F — punch',
    'E — steal a car / step out      P or Esc — pause & save      M — mute',
    'Missions pay cash. Stars bring the police. Don\'t get busted.',
  ];
  lines.forEach((l, i) => text(ctx, l, CFG.viewW / 2, 416 + i * 28, 15, '#e8ecf2', 'center', 500));

  shadowed(ctx, 'SPACE — NEW GAME', CFG.viewW / 2, 596, 24, '#fff', 'center', 800);
  if (saveExists) {
    shadowed(ctx, 'C — CONTINUE YOUR SAVE', CFG.viewW / 2, 632, 20, '#7dff9e', 'center', 800);
  }
  text(ctx, 'An original game. No Rockstar names, maps or assets.', CFG.viewW / 2, 686, 13, 'rgba(255,255,255,0.6)', 'center', 500);
}

export function drawPaused(ctx, world) {
  dim(ctx, 0.55);
  panel(ctx, CFG.viewW / 2 - 260, CFG.viewH / 2 - 130, 520, 260);
  shadowed(ctx, 'PAUSED', CFG.viewW / 2, CFG.viewH / 2 - 62, 52, '#fff', 'center', 900);
  text(ctx, 'Your game has been saved.', CFG.viewW / 2, CFG.viewH / 2 - 14, 17, '#7dff9e', 'center', 600);
  text(ctx, `Money $${world.player.money.toLocaleString('en-US')}  ·  Mission ${Math.min(world.mission.index + 1, 3)}/3`, CFG.viewW / 2, CFG.viewH / 2 + 18, 15, '#e8ecf2', 'center', 500);
  text(ctx, 'P or Esc — resume      Space — resume', CFG.viewW / 2, CFG.viewH / 2 + 62, 15, '#ffd23f', 'center', 700);
}

export function drawBusted(ctx, world) {
  dim(ctx, 0.6);
  const flash = Math.floor(world.time * 3) % 2 === 0;
  ctx.fillStyle = flash ? 'rgba(255,46,46,0.18)' : 'rgba(46,107,255,0.18)';
  ctx.fillRect(0, 0, CFG.viewW, CFG.viewH);
  shadowed(ctx, 'BUSTED', CFG.viewW / 2, 320, 88, '#fff', 'center', 900);
  text(ctx, 'The Solmar Bay police took Marco in.', CFG.viewW / 2, 372, 20, '#e8ecf2', 'center', 500);
  text(ctx, `Money kept: $${world.player.money.toLocaleString('en-US')}`, CFG.viewW / 2, 404, 16, '#7dff9e', 'center', 600);
  shadowed(ctx, 'SPACE — TRY AGAIN', CFG.viewW / 2, 470, 22, '#ffd23f', 'center', 800);
}

export function drawWasted(ctx, world) {
  dim(ctx, 0.65);
  shadowed(ctx, 'WASTED', CFG.viewW / 2, 320, 88, '#ff4a3d', 'center', 900);
  text(ctx, 'Marco didn\'t make it out of Solmar Bay.', CFG.viewW / 2, 372, 20, '#e8ecf2', 'center', 500);
  text(ctx, `Money kept: $${world.player.money.toLocaleString('en-US')}`, CFG.viewW / 2, 404, 16, '#7dff9e', 'center', 600);
  shadowed(ctx, 'SPACE — TRY AGAIN', CFG.viewW / 2, 470, 22, '#ffd23f', 'center', 800);
}

export function drawComplete(ctx, world) {
  dim(ctx, 0.5);
  panel(ctx, CFG.viewW / 2 - 330, 150, 660, 380);
  shadowed(ctx, 'STORY COMPLETE', CFG.viewW / 2, 226, 56, '#ffd23f', 'center', 900);
  text(ctx, 'Hot Wheels. The Drop. Heat Wave. All done.', CFG.viewW / 2, 268, 18, '#fff', 'center', 600);
  text(ctx, 'Marco owns the night in Solmar Bay —', CFG.viewW / 2, 296, 17, '#e8ecf2', 'center', 500);
  text(ctx, 'and the city knows his name now.', CFG.viewW / 2, 322, 17, '#e8ecf2', 'center', 500);
  const mins = Math.floor(world.time / 60);
  const secs = Math.floor(world.time % 60);
  text(ctx, `Final take: $${world.player.money.toLocaleString('en-US')}`, CFG.viewW / 2, 380, 20, '#7dff9e', 'center', 800);
  text(ctx, `Time in the city: ${mins}:${String(secs).padStart(2, '0')}   ·   Health ${Math.ceil(world.player.hp)}`, CFG.viewW / 2, 412, 16, '#e8ecf2', 'center', 600);
  text(ctx, 'Free roam continues — the streets are still yours.', CFG.viewW / 2, 452, 15, '#e8ecf2', 'center', 500);
  shadowed(ctx, 'SPACE — KEEP PLAYING', CFG.viewW / 2, 500, 22, '#fff', 'center', 800);
}
