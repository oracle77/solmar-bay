// Solmar Bay — keyboard and mouse input.
// Turns raw DOM events into one plain snapshot per frame that the simulation
// step understands: a movement vector, edge-triggered actions, and the mouse
// aim in world coordinates. The autopilot in shots.js builds the same shape
// of object by hand, so the two paths can never drift apart.

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyE', 'KeyP', 'KeyM', 'KeyC',
  'ShiftLeft', 'ShiftRight', 'Escape', 'Enter',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;

    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pressed.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  // One snapshot for this frame. aimX/aimY are world coordinates of the
  // cursor, so shooting aims where the player is pointing on the map.
  snapshot(camera) {
    const up = this.down('KeyW') || this.down('ArrowUp');
    const dn = this.down('KeyS') || this.down('ArrowDown');
    const lf = this.down('KeyA') || this.down('ArrowLeft');
    const rt = this.down('KeyD') || this.down('ArrowRight');
    return {
      mx: (rt ? 1 : 0) - (lf ? 1 : 0),
      my: (dn ? 1 : 0) - (up ? 1 : 0),
      run: this.down('ShiftLeft') || this.down('ShiftRight'),
      punch: this.hit('KeyF'),
      shoot: this.mouseClicked || this.mouseDown,
      enter: this.hit('KeyE'),
      pause: this.hit('KeyP') || this.hit('Escape'),
      confirm: this.hit('Space') || this.hit('Enter'),
      cont: this.hit('KeyC'),
      mute: this.hit('KeyM'),
      aimX: camera.x + this.mouseX,
      aimY: camera.y + this.mouseY,
    };
  }

  // Edge flags live for exactly one rendered frame.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}

// A blank input: no keys, no mouse. The title screen's living city and the
// autopilot's idle moments step with this.
export function emptyInput() {
  return {
    mx: 0, my: 0, run: false, punch: false, shoot: false, enter: false,
    pause: false, confirm: false, cont: false, mute: false,
    aimX: 0, aimY: 0,
  };
}
