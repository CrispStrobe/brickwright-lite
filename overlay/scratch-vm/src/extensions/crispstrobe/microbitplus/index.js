const makeExt = require('../adapter');

// micro:bit+ — a fuller micro:bit block set than the stock extension, for the
// MicroPython path (transpile → self-hosted WASM simulator). Design + full v1
// inventory: stc/docs/MICROBIT-EXTENSION-STUDY.md. This module is the SCAFFOLD
// plus the DISPLAY group (the first block group); sensors / pins / actuators /
// radio+events land as sibling groups (fleet lanes) against this scaffold.
//
// The stock scratch3_microbit is ~9 blocks; mbit-more's envelope is ~30; our
// v1 is ~40. The display grid reuses Scratch's stock 5×5 FieldMatrix
// (ArgumentType.MATRIX) for v1 — a 25-char '0'/'1' string; the brightness-aware
// 5×5 field (modelled on FieldLed8x8) is the "later" upgrade since micro:bit
// supports per-pixel brightness 0–9.
//
// Execution model: these blocks lower to MicroPython (display.show/scroll/clear)
// and run inside the micro:bit simulator, NOT the Scratch VM stage — so the VM
// opcode methods are intentional no-ops (the stock micro:bit extension is the
// same: no device/sim connected → nothing renders in-VM). The real effect is on
// "Run on Simulator". Provenance (study §6): block ENVELOPE adapted from the MIT
// mbit-more (attribution: Koji Yokokawa, MIT); no firmware/protocol code here.
module.exports = makeExt(`// Name: micro:bit+
// ID: microbitplus
// Description: A fuller micro:bit block set — display, sensors, pins, radio — for the MicroPython simulator.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  const ES = "0".repeat(25);   // all-off 5x5

  class MicrobitPlus {
    constructor(runtime) {
      this._runtime = runtime;
    }

    getInfo() {
      const str = (name, def) => ({ [name]: { type: Scratch.ArgumentType.STRING, defaultValue: def || '' } });
      const n = (name, def) => ({ [name]: { type: Scratch.ArgumentType.NUMBER, defaultValue: def == null ? 0 : def } });
      return {
        id: 'microbitplus',
        name: 'micro:bit+',
        color1: '#00A3A3',
        color2: '#008F8F',
        color3: '#007D7D',
        blocks: [
          // ── Display ───────────────────────────────────────────────
          { opcode: 'showmatrix', blockType: Scratch.BlockType.COMMAND,
            text: 'show pattern [MATRIX]',
            arguments: { MATRIX: { type: Scratch.ArgumentType.MATRIX, defaultValue: '0101010101100010101000100' } } },
          { opcode: 'showtext', blockType: Scratch.BlockType.COMMAND,
            text: 'show text [TEXT]', arguments: str('TEXT', 'Hi') },
          { opcode: 'scrolltext', blockType: Scratch.BlockType.COMMAND,
            text: 'scroll text [TEXT] delay [MS] ms',
            arguments: { ...str('TEXT', 'hello'), ...n('MS', 120) } },
          { opcode: 'cleardisplay', blockType: Scratch.BlockType.COMMAND,
            text: 'clear display' },
          { opcode: 'plot', blockType: Scratch.BlockType.COMMAND,
            text: 'plot x [X] y [Y] [STATE]',
            arguments: {
              ...n('X', 0), ...n('Y', 0),
              STATE: { type: Scratch.ArgumentType.STRING, defaultValue: 'on',
                menu: 'onoff' } } }
        ],
        menus: {
          onoff: { acceptReporters: true, items: ['on', 'off'] }
        }
      };
    }

    // The MicroPython path renders these on the simulator; the Scratch VM stage
    // does not host a micro:bit, so these are no-ops here (parity with the stock
    // micro:bit extension when no device/sim is attached). Methods exist so saved
    // projects load and so the compiler's opcode table stays complete.
    showmatrix() {}
    showtext() {}
    scrolltext() {}
    cleardisplay() {}
    plot() {}
  }

  Scratch.extensions.register(new MicrobitPlus(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
`);
