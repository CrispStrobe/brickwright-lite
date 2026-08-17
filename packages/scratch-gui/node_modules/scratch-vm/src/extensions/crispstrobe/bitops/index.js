const makeExt = require('../adapter');

// Bitwise operators — the six opcodes sb3-creator has always emitted for
// `bitand`/`bitor`/`bitxor`/`bitnot`/`shiftleft`/`shiftright` pseudocode.
//
// Until 2026-08-10 nothing registered this id, so every generated project
// declaring it fell through to the SANDBOXED loader: an extension worker
// called importScripts('bitops'), 404'd as a page error, and the blocks
// were silently dropped from the workspace (found working through the
// example gallery: 02-dimmer, 08-led-chaser, 20-shift-register, 53-servo).
//
// Semantics mirror the generated C and Python: operands go through
// (x | 0)-style 32-bit signed coercion, exactly what >>> / | give us.
module.exports = makeExt(`// Name: Bit operations
// ID: bitops
// Description: Bitwise AND, OR, XOR, NOT and shifts for hardware code.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";
  const int = (v) => Number(v) | 0;
  class BitOps {
    getInfo () {
      const num = (name) => ({ [name]: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 } });
      const two = { NUM1: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                    NUM2: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 } };
      return {
        id: "bitops",
        name: "Bit operations",
        color1: "#8e44ad",
        blocks: [
          { opcode: "and", blockType: Scratch.BlockType.REPORTER, text: "[NUM1] bitand [NUM2]", arguments: two },
          { opcode: "or", blockType: Scratch.BlockType.REPORTER, text: "[NUM1] bitor [NUM2]", arguments: two },
          { opcode: "xor", blockType: Scratch.BlockType.REPORTER, text: "[NUM1] bitxor [NUM2]", arguments: two },
          { opcode: "not", blockType: Scratch.BlockType.REPORTER, text: "bitnot [NUM]", arguments: num("NUM") },
          { opcode: "shl", blockType: Scratch.BlockType.REPORTER, text: "[NUM1] shiftleft [NUM2]", arguments: two },
          { opcode: "shr", blockType: Scratch.BlockType.REPORTER, text: "[NUM1] shiftright [NUM2]", arguments: two }
        ]
      };
    }
    and (a) { return int(a.NUM1) & int(a.NUM2); }
    or (a) { return int(a.NUM1) | int(a.NUM2); }
    xor (a) { return int(a.NUM1) ^ int(a.NUM2); }
    not (a) { return ~int(a.NUM); }
    shl (a) { return int(a.NUM1) << int(a.NUM2); }
    shr (a) { return int(a.NUM1) >> int(a.NUM2); }
  }
  Scratch.extensions.register(new BitOps());
})(Scratch);
`);
