const makeExt = require('../adapter');

// Shared game-console blocks. The original extension described a micro:bit
// 5x5 game API but implemented every VM method as a no-op. Keep its opcodes
// compatible while making them useful in Scratch, MakeCode Arcade, PyBadge
// and SAMD51 projects; the GUI console reads the same runtime state.
module.exports = makeExt(`// Name: Arcade
// ID: arcade
// Description: Game controls, sprites, score and badge hardware for micro:bit and Arcade boards.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  class Arcade {
    constructor(runtime) {
      this._runtime = runtime;
      this._fallbackState = null;
    }

    getInfo() {
      const str = (name, def) => ({ [name]: { type: Scratch.ArgumentType.STRING, defaultValue: def || '' } });
      const n = (name, def) => ({ [name]: { type: Scratch.ArgumentType.NUMBER, defaultValue: def == null ? 0 : def } });
      return {
        id: 'arcade',
        name: 'Arcade',
        color1: '#E64980',
        color2: '#D63878',
        color3: '#C42870',
        blocks: [
          { opcode: 'whenButton', blockType: Scratch.BlockType.HAT,
            text: 'when [BUTTON] button pressed', isEdgeActivated: false,
            arguments: { BUTTON: {type: Scratch.ArgumentType.STRING, menu: 'buttons', defaultValue: 'a'} } },
          { opcode: 'buttonPressed', blockType: Scratch.BlockType.BOOLEAN,
            text: '[BUTTON] button pressed?',
            arguments: { BUTTON: {type: Scratch.ArgumentType.STRING, menu: 'buttons', defaultValue: 'a'} } },
          { opcode: 'lightLevel', blockType: Scratch.BlockType.REPORTER, text: 'light level' },
          { opcode: 'tilt', blockType: Scratch.BlockType.REPORTER, text: 'tilt [AXIS]',
            arguments: { AXIS: {type: Scratch.ArgumentType.STRING, menu: 'axes', defaultValue: 'x'} } },
          { opcode: 'setPixel', blockType: Scratch.BlockType.COMMAND,
            text: 'set badge pixel [INDEX] to [COLOR]',
            arguments: { INDEX: {type: Scratch.ArgumentType.NUMBER, defaultValue: 0},
              COLOR: {type: Scratch.ArgumentType.COLOR, defaultValue: '#00ff88'} } },
          { opcode: 'clearPixels', blockType: Scratch.BlockType.COMMAND, text: 'clear badge pixels' },

          // ── Sprite creation ──────────────────────────────────────
          { opcode: 'createsprite', blockType: Scratch.BlockType.COMMAND,
            text: 'create sprite [NAME] at x [X] y [Y]',
            arguments: { ...str('NAME', 'player'), ...n('X', 2), ...n('Y', 2) } },
          { opcode: 'deletesprite', blockType: Scratch.BlockType.COMMAND,
            text: 'delete sprite [NAME]',
            arguments: str('NAME', 'player') },

          // ── Movement ─────────────────────────────────────────────
          '---',
          { opcode: 'movesprite', blockType: Scratch.BlockType.COMMAND,
            text: 'move sprite [NAME] by dx [DX] dy [DY]',
            arguments: { ...str('NAME', 'player'), ...n('DX', 1), ...n('DY', 0) } },
          { opcode: 'setspritepos', blockType: Scratch.BlockType.COMMAND,
            text: 'set sprite [NAME] to x [X] y [Y]',
            arguments: { ...str('NAME', 'player'), ...n('X', 2), ...n('Y', 2) } },
          { opcode: 'spritex', blockType: Scratch.BlockType.REPORTER,
            text: 'sprite [NAME] x',
            arguments: str('NAME', 'player') },
          { opcode: 'spritey', blockType: Scratch.BlockType.REPORTER,
            text: 'sprite [NAME] y',
            arguments: str('NAME', 'player') },

          // ── Collision ────────────────────────────────────────────
          '---',
          { opcode: 'touching', blockType: Scratch.BlockType.BOOLEAN,
            text: 'sprite [A] touching [B]?',
            arguments: { ...str('A', 'player'), ...str('B', 'enemy') } },
          { opcode: 'touchingedge', blockType: Scratch.BlockType.BOOLEAN,
            text: 'sprite [NAME] touching edge?',
            arguments: str('NAME', 'player') },

          // ── Score ────────────────────────────────────────────────
          '---',
          { opcode: 'setscore', blockType: Scratch.BlockType.COMMAND,
            text: 'set score to [N]',
            arguments: n('N', 0) },
          { opcode: 'changescore', blockType: Scratch.BlockType.COMMAND,
            text: 'change score by [N]',
            arguments: n('N', 1) },
          { opcode: 'getscore', blockType: Scratch.BlockType.REPORTER,
            text: 'score' },
          { opcode: 'showscore', blockType: Scratch.BlockType.COMMAND,
            text: 'show score' },

          // ── Display ──────────────────────────────────────────────
          '---',
          { opcode: 'drawsprites', blockType: Scratch.BlockType.COMMAND,
            text: 'draw all sprites' },
          { opcode: 'clearscreen', blockType: Scratch.BlockType.COMMAND,
            text: 'clear game screen' },
          { opcode: 'setbrightness', blockType: Scratch.BlockType.COMMAND,
            text: 'set sprite [NAME] brightness [B]',
            arguments: { ...str('NAME', 'player'), ...n('B', 9) } },

          // ── Game flow ────────────────────────────────────────────
          '---',
          { opcode: 'gameover', blockType: Scratch.BlockType.COMMAND,
            text: 'game over' },
          { opcode: 'countdown', blockType: Scratch.BlockType.COMMAND,
            text: 'countdown from [N]',
            arguments: n('N', 3) }
        ],
        menus: {
          buttons: {acceptReporters: true, items: [
            {text: 'A', value: 'a'}, {text: 'B', value: 'b'},
            {text: 'up', value: 'up'}, {text: 'down', value: 'down'},
            {text: 'left', value: 'left'}, {text: 'right', value: 'right'},
            {text: 'Start', value: 'start'}, {text: 'Select / menu', value: 'select'}
          ]},
          axes: {acceptReporters: true, items: ['x', 'y']}
        }
      };
    }

    _state() {
      if (this._runtime) {
        if (!this._runtime.bwArcadeDeviceState) this._runtime.bwArcadeDeviceState = {};
        const state = this._runtime.bwArcadeDeviceState;
        if (!state.buttons) state.buttons = {};
        if (!state.sprites) state.sprites = {};
        if (!Array.isArray(state.neopixels)) state.neopixels = Array(5).fill('#111827');
        if (!Number.isFinite(state.score)) state.score = 0;
        return state;
      }
      if (!this._fallbackState) this._fallbackState = {buttons: {}, sprites: {}, neopixels: Array(5).fill('#111827'), score: 0};
      return this._fallbackState;
    }

    _changed() {
      if (this._runtime && this._runtime.emit) this._runtime.emit('ARCADE_DEVICE_CHANGED', this._state());
      if (this._runtime && this._runtime.requestRedraw) this._runtime.requestRedraw();
    }

    _bounds() {
      const device = String((this._runtime && (this._runtime.bwDeviceId || (this._runtime.stc && this._runtime.stc.device))) || 'arcade');
      return device === 'microbit' ? {x: 4, y: 4} : {x: 159, y: 119};
    }

    _sprite(name) { return this._state().sprites[String(name)] || null; }
    _clamp(value, max) { return Math.max(0, Math.min(max, Number(value) || 0)); }

    whenButton(args) { return this.buttonPressed(args); }
    buttonPressed(args) { return Boolean(this._state().buttons[String(args.BUTTON).toLowerCase()]); }
    lightLevel() { return Number(this._state().light) || 0; }
    tilt(args) { return Number(this._state()[String(args.AXIS).toLowerCase() === 'y' ? 'tiltY' : 'tiltX']) || 0; }
    setPixel(args) {
      const state = this._state();
      const index = Math.max(0, Math.min(state.neopixels.length - 1, Math.floor(Number(args.INDEX) || 0)));
      let color = args.COLOR;
      if (typeof color === 'number') color = '#' + (color >>> 0).toString(16).padStart(6, '0').slice(-6);
      state.neopixels[index] = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : '#000000';
      this._changed();
    }
    clearPixels() { this._state().neopixels.fill('#111827'); this._changed(); }
    createsprite(args) {
      const bounds = this._bounds();
      this._state().sprites[String(args.NAME)] = {x: this._clamp(args.X, bounds.x), y: this._clamp(args.Y, bounds.y), brightness: 9};
      this._changed();
    }
    deletesprite(args) { delete this._state().sprites[String(args.NAME)]; this._changed(); }
    movesprite(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return;
      const bounds = this._bounds();
      sprite.x = this._clamp(sprite.x + Number(args.DX || 0), bounds.x);
      sprite.y = this._clamp(sprite.y + Number(args.DY || 0), bounds.y);
      this._changed();
    }
    setspritepos(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return;
      const bounds = this._bounds();
      sprite.x = this._clamp(args.X, bounds.x); sprite.y = this._clamp(args.Y, bounds.y); this._changed();
    }
    spritex(args) { const sprite = this._sprite(args.NAME); return sprite ? sprite.x : 0; }
    spritey(args) { const sprite = this._sprite(args.NAME); return sprite ? sprite.y : 0; }
    touching(args) {
      const a = this._sprite(args.A); const b = this._sprite(args.B);
      return Boolean(a && b && a.x === b.x && a.y === b.y);
    }
    touchingedge(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return false;
      const bounds = this._bounds(); return sprite.x <= 0 || sprite.x >= bounds.x || sprite.y <= 0 || sprite.y >= bounds.y;
    }
    setscore(args) { this._state().score = Number(args.N) || 0; this._changed(); }
    changescore(args) { this._state().score += Number(args.N) || 0; this._changed(); }
    getscore() { return this._state().score; }
    showscore() { this._state().scoreVisible = true; this._changed(); }
    drawsprites() { this._state().screenCleared = false; this._changed(); }
    clearscreen() { this._state().screenCleared = true; this._changed(); }
    setbrightness(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return;
      sprite.brightness = this._clamp(args.B, 9); this._changed();
    }
    gameover() {
      this._state().gameOver = true; this._changed();
      if (this._runtime && this._runtime.stopAll) this._runtime.stopAll();
    }
    countdown(args) {
      const seconds = Math.max(0, Number(args.N) || 0);
      this._state().countdown = seconds; this._changed();
      return new Promise(resolve => setTimeout(() => { this._state().countdown = 0; this._changed(); resolve(); }, seconds * 1000));
    }
  }

  Scratch.extensions.register(new Arcade(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
`);
