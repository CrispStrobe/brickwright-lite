const makeExt = require('../adapter');

// The STC12 / 8051 pin blocks.
//
// These opcodes have existed on the sb3-creator side for months — `stc12_setpin`,
// `stc12_writepin`, `stc12_toggle`, `stc12_read` — and every hardware example
// emits them along with `extensions: ["stc12"]`. Nothing ever registered that id
// with the VM, so loading any of those projects failed outright with
// "Unknown extension: stc12": the Code tab could show the pseudocode and the C,
// and "⇦ To blocks" could not work at all. This is the missing half.
//
// The block SHAPES are not a design choice here; they have to match what
// SB3Creator emits, or a project round-trips into blocks that read differently
// from the ones it came from:
//
//   stc12_setpin    fields PIN, STATE          (both dropdowns → fields, not inputs)
//   stc12_writepin  field  PIN, input VALUE
//   stc12_toggle    field  PIN
//   stc12_read      field  PIN, reporter
//
// A menu with acceptReporters:false compiles to a FIELD, which is what those
// blocks use; anything else would serialise as an input with a shadow block and
// no longer match.
//
// What they DO when the green flag runs: nothing to a chip, because there is no
// chip attached to a browser. They record the pin state on the runtime so the
// circuit designer and the tier-1 simulator can watch, and they read back what
// was written. Pretending to drive hardware would be the dishonest option.
module.exports = makeExt(`// Name: STC12 / 8051 pins
// ID: stc12
// Description: Drive the pins declared with PIN in the Code tab.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  /** Pin declarations live on the runtime; see the importer's loadProject. */
  function decls(runtime) {
    const stc = runtime && runtime.stc;
    return (stc && Array.isArray(stc.pins)) ? stc.pins : [];
  }

  /** The board state this extension maintains, for whoever is watching. */
  function board(runtime) {
    if (!runtime._stc12Pins) runtime._stc12Pins = Object.create(null);
    return runtime._stc12Pins;
  }

  class STC12 {
    constructor(runtime) { this.runtime = runtime; }

    getInfo() {
      return {
        id: "stc12",
        name: "STC12 / 8051 pins",
        color1: "#3d7ea6",
        color2: "#2f6383",
        blocks: [
          {
            opcode: "setpin",
            blockType: Scratch.BlockType.COMMAND,
            text: "turn [STATE] [PIN]",
            arguments: {
              STATE: { type: Scratch.ArgumentType.STRING, menu: "states" },
              PIN: { type: Scratch.ArgumentType.STRING, menu: "pins" }
            }
          },
          {
            opcode: "toggle",
            blockType: Scratch.BlockType.COMMAND,
            text: "toggle [PIN]",
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, menu: "pins" } }
          },
          {
            opcode: "writepin",
            blockType: Scratch.BlockType.COMMAND,
            text: "set [PIN] to [VALUE]",
            arguments: {
              PIN: { type: Scratch.ArgumentType.STRING, menu: "pins" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
            }
          },
          {
            opcode: "read",
            blockType: Scratch.BlockType.REPORTER,
            text: "read [PIN]",
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, menu: "pins" } }
          }
        ],
        menus: {
          // acceptReporters:false is what makes these FIELDS rather than inputs,
          // which is how sb3-creator writes them.
          pins: { acceptReporters: false, items: "pinNames" },
          states: { acceptReporters: false, items: ["on", "off", "high", "low"] }
        }
      };
    }

    /** Declared pins, or a placeholder so the palette is never an empty dropdown. */
    pinNames() {
      const names = decls(this.runtime).map(p => p.name);
      return names.length ? names : [{ text: "(declare a PIN in the Code tab)", value: "" }];
    }

    setpin(args) {
      const pin = decls(this.runtime).find(p => p.name === args.PIN);
      const state = String(args.STATE);
      // ACTIVE LOW is the whole point of the declaration: "on" writes a 0.
      const level = state === "on" ? (pin && pin.activeLow ? 0 : 1)
        : state === "off" ? (pin && pin.activeLow ? 1 : 0)
          : state === "high" ? 1 : 0;
      board(this.runtime)[args.PIN] = level;
    }

    toggle(args) {
      const b = board(this.runtime);
      b[args.PIN] = b[args.PIN] ? 0 : 1;
    }

    writepin(args) {
      board(this.runtime)[args.PIN] = Number(args.VALUE) ? 1 : 0;
    }

    read(args) {
      const b = board(this.runtime);
      return Object.prototype.hasOwnProperty.call(b, args.PIN) ? b[args.PIN] : 0;
    }
  }

  Scratch.extensions.register(new STC12(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
`);
