// Solmar Bay — boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between six screens: title, play, paused,
// busted, wasted and story complete.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages
// that scene, paints it twice and sets window.__shotReady.

import { CFG } from './config.js';
import {
  createWorld, stepWorld, saveGame, loadSave, hasSave, applySave,
} from './world.js';
import { Input, emptyInput } from './input.js';
import { SoundBank } from './audio.js';
import {
  createCamera, updateCamera, drawGame, drawHUD,
  drawTitle, drawPaused, drawBusted, drawWasted, drawComplete,
} from './render.js';
import { stageShot } from './shots.js';
import { seedFromParam } from './random.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const shotName = params.get('shot');
const seed = seedFromParam(seedParam);

const game = {
  screen: 'title', // title | play | paused | busted | wasted | complete
  world: createWorld(seed),
  camera: createCamera(),
  saveExists: hasSave(),
  input: new Input(canvas),
  sound: new SoundBank(),
  acc: 0,
  last: performance.now(),
};
window.__game = game;

function setStatus() {
  if (!statusEl) return;
  const w = game.world;
  const p = w.player;
  statusEl.textContent =
    `Solmar Bay — ${game.screen}. Money $${p.money}. Health ${Math.ceil(p.hp)}. ` +
    `Wanted ${w.wanted} stars. Mission ${Math.min(w.mission.index + 1, 3)} of 3.`;
}

function newGame(freshSeed) {
  game.world = createWorld(freshSeed);
  game.screen = 'play';
  setStatus();
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  const world = createWorld(save.seed);
  applySave(world, save);
  game.world = world;
  game.screen = 'play';
  setStatus();
}

function pauseGame() {
  saveGame(game.world);
  game.screen = 'paused';
  setStatus();
}

// First gesture unlocks the audio context.
function unlockAudio() {
  game.sound.unlock();
}
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play') pauseGame();
});

function playSounds(ev) {
  const s = game.sound;
  if (ev.shot) s.gunshot();
  if (ev.punch) s.punch();
  if (ev.pickup) s.pickup();
  if (ev.reload) s.reloadClick();
  if (ev.mission) {
    s.missionDone();
    saveGame(game.world);
  }
  if (ev.story) {
    s.missionDone();
    saveGame(game.world);
  }
}

function updateAudio() {
  const s = game.sound;
  const p = game.world.player;
  const driving = !!p.car;
  const speed01 = driving ? Math.min(1, Math.abs(p.car.speed) / CFG.car.topSpeed) : 0;
  s.setEngine(speed01, driving);
  s.setSiren(game.world.wanted > 0 && game.screen === 'play');
}

function render() {
  const w = game.world;
  updateCamera(game.camera, w);
  ctx.clearRect(0, 0, CFG.viewW, CFG.viewH);
  drawGame(ctx, w, game.camera);
  if (game.screen === 'play') {
    drawHUD(ctx, w);
  } else if (game.screen === 'title') {
    drawTitle(ctx, w, game.saveExists);
  } else if (game.screen === 'paused') {
    drawHUD(ctx, w);
    drawPaused(ctx, w);
  } else if (game.screen === 'busted') {
    drawBusted(ctx, w);
  } else if (game.screen === 'wasted') {
    drawWasted(ctx, w);
  } else if (game.screen === 'complete') {
    drawComplete(ctx, w);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, Math.max(0, (now - game.last) / 1000));
  game.last = now;
  const inp = game.input.snapshot(game.camera);

  if (inp.mute) {
    const muted = game.sound.toggleMute();
    if (statusEl) statusEl.textContent = muted ? 'Sound muted.' : 'Sound on.';
  }

  if (game.screen === 'title') {
    stepWorld(game.world, emptyInput(), CFG.step);
    if (inp.confirm) newGame(seedParam ? seed : ((Math.random() * 0xffffffff) >>> 0));
    else if (inp.cont && game.saveExists) continueGame();
  } else if (game.screen === 'play') {
    if (inp.pause) {
      pauseGame();
    } else {
      game.acc += dt;
      let guard = 0;
      while (game.acc >= CFG.step && guard < 16) {
        const ev = stepWorld(game.world, inp, CFG.step);
        playSounds(ev);
        if (ev.busted) {
          game.screen = 'busted';
          game.sound.busted();
          game.sound.setSiren(false);
          setStatus();
        } else if (ev.wasted) {
          game.screen = 'wasted';
          game.sound.wasted();
          game.sound.setSiren(false);
          setStatus();
        } else if (ev.story) {
          game.screen = 'complete';
          setStatus();
        }
        // Edge-triggered actions fire once, on the first step of the frame.
        inp.punch = false;
        inp.shoot = false;
        inp.enter = false;
        game.acc -= CFG.step;
        guard++;
        if (game.screen !== 'play') {
          game.acc = 0;
          break;
        }
      }
      if (guard >= 16) game.acc = 0;
      updateAudio();
    }
  } else if (game.screen === 'paused') {
    if (inp.pause || inp.confirm) {
      game.screen = 'play';
      setStatus();
    }
  } else if (game.screen === 'busted' || game.screen === 'wasted') {
    if (inp.confirm) newGame(seedParam ? seed : ((Math.random() * 0xffffffff) >>> 0));
  } else if (game.screen === 'complete') {
    if (inp.confirm) {
      game.screen = 'play';
      setStatus();
    }
  }

  render();
  game.input.endFrame();
}

// Shot mode: stage the scene, paint it twice, and say so. No live loop
// runs afterwards, so the staged frame is exactly the one captured.
if (shotName) {
  const staged = stageShot(shotName, seed);
  game.world = staged.world;
  game.screen = staged.screen;
  game.saveExists = staged.saveExists;
  setStatus();
  render();
  render();
  window.__shotReady = true;
} else {
  setStatus();
  requestAnimationFrame(frame);
}
