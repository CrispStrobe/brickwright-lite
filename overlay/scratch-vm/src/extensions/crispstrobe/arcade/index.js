const makeExt = require('../adapter');

// Arcade — sprite-based game blocks for the micro:bit 5×5 LED matrix.
// Create sprites (single LED pixels), move them, detect collisions, keep
// score. Designed for simple games (snake, pong, dodge) on the 5×5 grid.
//
// Execution model: like microbitPlus, these blocks lower to MicroPython
// and run on the micro:bit simulator. The VM-side methods are no-ops.
// The real rendering happens via display.set_pixel() calls in the sim.
module.exports = makeExt(`// Name: Arcade
// ID: arcade
// Description: Sprite-based game blocks for the micro:bit 5×5 LED matrix.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  class Arcade {
    constructor(runtime) {
      this._runtime = runtime;
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
        menus: {}
      };
    }

    // All no-ops — the sim renders via transpiled MicroPython
    createsprite() {}
    deletesprite() {}
    movesprite() {}
    setspritepos() {}
    spritex() { return 0; }
    spritey() { return 0; }
    touching() { return false; }
    touchingedge() { return false; }
    setscore() {}
    changescore() {}
    getscore() { return 0; }
    showscore() {}
    drawsprites() {}
    clearscreen() {}
    setbrightness() {}
    gameover() {}
    countdown() {}
  }

  Scratch.extensions.register(new Arcade(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
`);
