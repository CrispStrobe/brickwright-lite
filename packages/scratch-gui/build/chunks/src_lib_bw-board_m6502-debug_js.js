"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["src_lib_bw-board_m6502-debug_js"],{

/***/ "./src/lib/bw-board/m6502-debug.js":
/*!*****************************************!*\
  !*** ./src/lib/bw-board/m6502-debug.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createM6502DebugTarget: () => (/* binding */ createM6502DebugTarget)
/* harmony export */ });
/* harmony import */ var _w65c02_disasm_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./w65c02-disasm.js */ "./src/lib/bw-board/w65c02-disasm.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Boundary-D debug target for M6502Machine — the 6502 breadboard computer
 * becomes a breakable, steppable, inspectable program.
 *
 * Like avr8js-debug.js, this module owns the stepping loop: a breakpoint
 * check wraps each machine.step() call. The adapter provides boundary-A
 * (pin edges), this module provides boundary-D (debugger control).
 *
 * @module
 */

/**
 * @param {import('./m6502-adapter.js').createM6502Adapter} adapter
 * @param {object} [opts]
 * @param {object} [opts.symbols] — { scheduler: { tasks: [...] } }
 */

function createM6502DebugTarget(adapter) {
  var _opts$symbols;
  let opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  const machine = adapter.machine;
  const cpu = machine.cpu;
  const symbols = (_opts$symbols = opts.symbols) !== null && _opts$symbols !== void 0 ? _opts$symbols : null;
  let runState = 'halted'; // 'halted' | 'running'
  let pendingStep = null; // { kind: 'insn'|'block'|'over'|'out', ... }
  const haltListeners = [];
  const breakpoints = new Map();
  let nextBpId = 1;
  function halt(info) {
    runState = 'halted';
    for (const cb of haltListeners) cb(info);
  }

  // Write watchpoints trap TRUE writes (any store to a watched address,
  // same-value included) by wrapping the core's write callback — the
  // same semantics emu8051's _emu_dbg_set_bp_write gives. The wrap is
  // installed only while at least one watch exists, so the fast path
  // stays untouched.
  const writeWatches = new Map(); // id → { addr, len }
  let watchHit = null;
  let origWrite = null;
  function syncWriteTrap() {
    if (writeWatches.size && !origWrite) {
      origWrite = cpu.write;
      cpu.write = (a, v) => {
        const aa = a & 0xffff;
        for (const [id, w] of writeWatches) {
          if (aa >= w.addr && aa < w.addr + w.len) watchHit = {
            bp: id,
            addr: aa,
            value: v & 0xff
          };
        }
        return origWrite(a, v);
      };
    } else if (!writeWatches.size && origWrite) {
      cpu.write = origWrite;
      origWrite = null;
    }
  }
  return {
    capabilities() {
      return {
        steps: [...(symbols ? ['insn', 'block'] : ['insn']), 'over', 'out'],
        breakpoints: [...(symbols ? ['code', 'yield'] : ['code']), 'write'],
        timeFreezes: true,
        consumes: []
      };
    },
    state() {
      return runState;
    },
    regs() {
      return {
        pc: cpu.pc,
        a: cpu.a,
        x: cpu.x,
        y: cpu.y,
        sp: cpu.s,
        p: cpu.p,
        cycles: machine.cycles
      };
    },
    /** Live disassembly at addr (vector-length-ground table; reads the
     *  machine's memory, so POKEd code disassembles too). Returns
     *  { text, bytes, length } — parity-plus with emu8051's disasm(). */
    disasm(addr) {
      return (0,_w65c02_disasm_js__WEBPACK_IMPORTED_MODULE_0__.disasm6502)(a => machine.mem[a & 0xffff], addr & 0xffff);
    },
    onHalt(cb) {
      haltListeners.push(cb);
      // The session treats the return value as an unsubscribe and
      // CALLS it on destroy — push()'s return (the new length) made
      // every bench teardown throw 'h is not a function'.
      return () => {
        const i = haltListeners.indexOf(cb);
        if (i >= 0) haltListeners.splice(i, 1);
      };
    },
    setBreakpoint(spec) {
      if (spec.kind === 'code') {
        if (spec.addr == null) return {
          unsupported: 'addr required'
        };
        const id = nextBpId++;
        breakpoints.set(id, {
          kind: 'code',
          addr: spec.addr
        });
        return id;
      }
      if (spec.kind === 'yield') {
        var _symbols$scheduler, _task$yields;
        if (!symbols) return {
          unsupported: 'no symbols for yield breakpoints'
        };
        const task = (_symbols$scheduler = symbols.scheduler) === null || _symbols$scheduler === void 0 || (_symbols$scheduler = _symbols$scheduler.tasks) === null || _symbols$scheduler === void 0 ? void 0 : _symbols$scheduler.find(t => t.name === spec.task);
        if (!task) return {
          unsupported: "unknown task: ".concat(spec.task)
        };
        const y = (_task$yields = task.yields) === null || _task$yields === void 0 ? void 0 : _task$yields.find(yy => yy.state === spec.state);
        if (!y) return {
          unsupported: "unknown yield state ".concat(spec.state)
        };
        const id = nextBpId++;
        breakpoints.set(id, {
          kind: 'yield',
          addr: y.addr,
          task: spec.task,
          state: spec.state
        });
        return id;
      }
      if (spec.kind === 'write') {
        var _spec$len;
        if (spec.addr == null) return {
          unsupported: 'addr required'
        };
        const id = nextBpId++;
        writeWatches.set(id, {
          addr: spec.addr & 0xffff,
          len: (_spec$len = spec.len) !== null && _spec$len !== void 0 ? _spec$len : 1
        });
        syncWriteTrap();
        return id;
      }
      return {
        unsupported: "unknown breakpoint kind: ".concat(spec.kind)
      };
    },
    clearBreakpoint(id) {
      breakpoints.delete(id);
      if (writeWatches.delete(id)) syncWriteTrap();
    },
    run() {
      runState = 'running';
      pendingStep = null;
    },
    /** The session's pause verb — same contract as a breakpoint hit. */
    halt() {
      halt({
        cause: 'pause'
      });
    },
    /** Reboot through the reset vector at $FFFC. */
    reset() {
      pendingStep = null;
      machine.reset();
      runState = 'halted';
    },
    halt() {
      halt({
        cause: 'user'
      });
    },
    step(kind) {
      let count = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
      if (kind === 'insn') {
        runState = 'running';
        pendingStep = {
          kind: 'insn',
          remaining: count
        };
        return undefined;
      }
      if (kind === 'block') {
        if (!symbols) return {
          unsupported: 'block step requires symbols'
        };
        runState = 'running';
        pendingStep = {
          kind: 'block'
        };
        return undefined;
      }
      if (kind === 'over') {
        // Depth-wait only when the NEXT opcode is call-class (JSR/BRK);
        // anything else is a plain instruction step — a lone PHA must
        // not turn step-over into run-until-someday.
        const op = machine.mem[cpu.pc & 0xffff];
        if (op !== 0x20 && op !== 0x00) {
          runState = 'running';
          pendingStep = {
            kind: 'insn',
            remaining: 1
          };
          return undefined;
        }
        runState = 'running';
        pendingStep = {
          kind: 'over',
          sp0: cpu.s,
          entered: false
        };
        return undefined;
      }
      if (kind === 'out') {
        // Run until the current frame returns: RTS/RTI pops lift the
        // (descending) stack pointer above where it stands now.
        runState = 'running';
        pendingStep = {
          kind: 'out',
          sp0: cpu.s
        };
        return undefined;
      }
      return {
        unsupported: "step kind '".concat(kind, "' not supported")
      };
    },
    /** Spend up to budgetNs of simulated time. Returns 'halted' or 'budget'. */
    runFor(budgetNs) {
      if (runState !== 'running') return 'halted';
      const budgetMs = budgetNs / 1e6;
      const deadline = machine.tMs + budgetMs;
      while (machine.tMs < deadline) {
        var _pendingStep, _pendingStep2;
        // Check breakpoints BEFORE executing
        for (const [id, bp] of breakpoints) {
          if (bp.addr === cpu.pc) {
            const tasks = this.position();
            halt({
              cause: 'breakpoint',
              bp: id,
              bpKind: bp.kind,
              tasks
            });
            return 'halted';
          }
        }

        // Check pending step completion BEFORE executing
        if (pendingStep) {
          if (pendingStep.kind === 'insn') {
            if (pendingStep.remaining <= 0) {
              halt({
                cause: 'step'
              });
              return 'halted';
            }
          }
          if (pendingStep.kind === 'block') {
            // Check if we're at a yield address
            const pos = this.position();
            if (pos.length > 0 && pendingStep.started) {
              halt({
                cause: 'step',
                tasks: pos
              });
              return 'halted';
            }
            pendingStep.started = true;
          }
          if (pendingStep.kind === 'over' && pendingStep.entered && cpu.s >= pendingStep.sp0) {
            halt({
              cause: 'step'
            });
            return 'halted';
          }
          if (pendingStep.kind === 'out' && cpu.s > pendingStep.sp0) {
            halt({
              cause: 'step'
            });
            return 'halted';
          }
        }
        const n = machine.step();
        if (n === 0) {
          // STP — machine stopped
          halt({
            cause: 'stopped'
          });
          return 'halted';
        }
        if (watchHit) {
          const hit = watchHit;
          watchHit = null;
          halt(_objectSpread({
            cause: 'watchpoint'
          }, hit));
          return 'halted';
        }
        if (((_pendingStep = pendingStep) === null || _pendingStep === void 0 ? void 0 : _pendingStep.kind) === 'insn') {
          pendingStep.remaining--;
        }
        if (((_pendingStep2 = pendingStep) === null || _pendingStep2 === void 0 ? void 0 : _pendingStep2.kind) === 'over') pendingStep.entered = true;
      }
      return runState === 'halted' ? 'halted' : 'budget';
    },
    /**
     * The machine's video output, when the config declared a TMS9918
     * (CHIP vdp = TMS9918 AT $addr): the last VBLANK's frame as RGBA
     * for a canvas face, plus mode and frame counter so a poller can
     * skip unchanged frames. null when the machine has no VDP — the
     * UI shows no screen rather than a black lie.
     */
    /**
     * Face-input contract, write side: the face (VdpScreen with
     * keyboard focus, on-screen buttons) reports the pressed-button
     * mask; the machine maps it onto the snake hookup (active-low
     * PA0..3). Returns false when the machine has no VIA to receive it.
     */
    setButtons(mask) {
      return typeof machine.setButtons === 'function' ? machine.setButtons(mask) : false;
    },
    video() {
      // Any chip implementing the common videoFrame() contract counts —
      // TMS9918, simplevga, and whatever video hardware comes next.
      for (const chip of Object.values(machine.chips || {})) {
        if (typeof chip.videoFrame === 'function') return chip.videoFrame();
      }
      return null;
    },
    position() {
      var _symbols$scheduler2;
      if (!(symbols !== null && symbols !== void 0 && (_symbols$scheduler2 = symbols.scheduler) !== null && _symbols$scheduler2 !== void 0 && _symbols$scheduler2.tasks)) return [];
      const result = [];
      for (const task of symbols.scheduler.tasks) {
        if (!task.yields) continue;
        // Check state variable if present
        if (task.state) {
          var _task$state$size;
          const addr = task.state.addr;
          const size = (_task$state$size = task.state.size) !== null && _task$state$size !== void 0 ? _task$state$size : 1;
          let val = 0;
          for (let i = size - 1; i >= 0; i--) val = val << 8 | machine.mem[addr + i];
          const y = task.yields.find(yy => yy.state === val);
          if (y) result.push({
            task: task.name,
            state: val
          });
        }
      }
      return result;
    },
    timeNs() {
      return adapter.timeNs();
    },
    readMem(space, addr, len) {
      if (space !== 'mem') return {
        unsupported: "no space '".concat(space, "' on 6502")
      };
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i++) out[i] = machine.mem[addr + i & 0xffff];
      return out;
    },
    writeMem(space, addr, data) {
      if (space !== 'mem') return {
        refused: "no space '".concat(space, "' on 6502")
      };
      for (let i = 0; i < data.length; i++) machine.mem[addr + i & 0xffff] = data[i];
      return undefined;
    }
  };
}

/***/ }),

/***/ "./src/lib/bw-board/w65c02-disasm.js":
/*!*******************************************!*\
  !*** ./src/lib/bw-board/w65c02-disasm.js ***!
  \*******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   disasm6502: () => (/* binding */ disasm6502),
/* harmony export */   symbolsFromLd65Labels: () => (/* binding */ symbolsFromLd65Labels)
/* harmony export */ });
/**
 * W65C02 disassembler — the debugger's live pane for the 6502 machines,
 * held to the 8051 standard (emu_disasm was verified 237/0 against an
 * independent table). Verification here: instruction LENGTHS are ground
 * against the SingleStepTests vectors' pc-deltas across every opcode
 * (the same 2.54M-vector suite the core passed), mnemonics against the
 * published WDC table. Live disassembly reads MEMORY, so it works on
 * hand-poked code — a listing cannot.
 *
 * @module
 */

// mode → [operand byte count, formatter]
const MODES = {
  imp: [0, () => ''],
  acc: [0, () => 'A'],
  imm: [1, o => "#$".concat(h2(o[0]))],
  zp: [1, o => "$".concat(h2(o[0]))],
  zpx: [1, o => "$".concat(h2(o[0]), ",X")],
  zpy: [1, o => "$".concat(h2(o[0]), ",Y")],
  abs: [2, o => "$".concat(h4(o[0] | o[1] << 8))],
  abx: [2, o => "$".concat(h4(o[0] | o[1] << 8), ",X")],
  aby: [2, o => "$".concat(h4(o[0] | o[1] << 8), ",Y")],
  ind: [2, o => "($".concat(h4(o[0] | o[1] << 8), ")")],
  iax: [2, o => "($".concat(h4(o[0] | o[1] << 8), ",X)")],
  izx: [1, o => "($".concat(h2(o[0]), ",X)")],
  izy: [1, o => "($".concat(h2(o[0]), "),Y")],
  zpi: [1, o => "($".concat(h2(o[0]), ")")],
  rel: [1, (o, pc) => "$".concat(h4(pc + 2 + (o[0] << 24 >> 24) & 0xffff))],
  zpr: [2, (o, pc) => "$".concat(h2(o[0]), ",$").concat(h4(pc + 3 + (o[1] << 24 >> 24) & 0xffff))]
};
const h2 = v => v.toString(16).toUpperCase().padStart(2, '0');
const h4 = v => v.toString(16).toUpperCase().padStart(4, '0');

/** opcode → [mnemonic, mode]; built from compact group tables below. */
const TABLE = new Array(256);
{
  const set = (op, m, mode) => {
    TABLE[op] = [m, mode];
  };
  const alu = ['ORA', 'AND', 'EOR', 'ADC', 'STA', 'LDA', 'CMP', 'SBC'];
  alu.forEach((m, i) => {
    const b = i << 5;
    set(b | 0x09, m, 'imm');
    set(b | 0x05, m, 'zp');
    set(b | 0x15, m, 'zpx');
    set(b | 0x0d, m, 'abs');
    set(b | 0x1d, m, 'abx');
    set(b | 0x19, m, 'aby');
    set(b | 0x01, m, 'izx');
    set(b | 0x11, m, 'izy');
    set(b | 0x12, m, 'zpi');
  });
  TABLE[0x89] = ['BIT', 'imm'];
  delete TABLE[0x89]; // placed below with BIT group
  set(0x89, 'BIT', 'imm');
  // STA #imm does not exist: 0x89 is BIT #imm (handled above).
  const rmw = ['ASL', 'ROL', 'LSR', 'ROR'];
  rmw.forEach((m, i) => {
    const b = i << 5;
    set(b | 0x0a, m, 'acc');
    set(b | 0x06, m, 'zp');
    set(b | 0x16, m, 'zpx');
    set(b | 0x0e, m, 'abs');
    set(b | 0x1e, m, 'abx');
  });
  set(0xa2, 'LDX', 'imm');
  set(0xa6, 'LDX', 'zp');
  set(0xb6, 'LDX', 'zpy');
  set(0xae, 'LDX', 'abs');
  set(0xbe, 'LDX', 'aby');
  set(0xa0, 'LDY', 'imm');
  set(0xa4, 'LDY', 'zp');
  set(0xb4, 'LDY', 'zpx');
  set(0xac, 'LDY', 'abs');
  set(0xbc, 'LDY', 'abx');
  set(0x86, 'STX', 'zp');
  set(0x96, 'STX', 'zpy');
  set(0x8e, 'STX', 'abs');
  set(0x84, 'STY', 'zp');
  set(0x94, 'STY', 'zpx');
  set(0x8c, 'STY', 'abs');
  set(0x64, 'STZ', 'zp');
  set(0x74, 'STZ', 'zpx');
  set(0x9c, 'STZ', 'abs');
  set(0x9e, 'STZ', 'abx');
  set(0x24, 'BIT', 'zp');
  set(0x2c, 'BIT', 'abs');
  set(0x34, 'BIT', 'zpx');
  set(0x3c, 'BIT', 'abx');
  set(0x04, 'TSB', 'zp');
  set(0x0c, 'TSB', 'abs');
  set(0x14, 'TRB', 'zp');
  set(0x1c, 'TRB', 'abs');
  set(0xe6, 'INC', 'zp');
  set(0xf6, 'INC', 'zpx');
  set(0xee, 'INC', 'abs');
  set(0xfe, 'INC', 'abx');
  set(0xc6, 'DEC', 'zp');
  set(0xd6, 'DEC', 'zpx');
  set(0xce, 'DEC', 'abs');
  set(0xde, 'DEC', 'abx');
  set(0x1a, 'INC', 'acc');
  set(0x3a, 'DEC', 'acc');
  set(0xe0, 'CPX', 'imm');
  set(0xe4, 'CPX', 'zp');
  set(0xec, 'CPX', 'abs');
  set(0xc0, 'CPY', 'imm');
  set(0xc4, 'CPY', 'zp');
  set(0xcc, 'CPY', 'abs');
  set(0x4c, 'JMP', 'abs');
  set(0x6c, 'JMP', 'ind');
  set(0x7c, 'JMP', 'iax');
  set(0x20, 'JSR', 'abs');
  set(0x60, 'RTS', 'imp');
  set(0x40, 'RTI', 'imp');
  set(0x00, 'BRK', 'imm'); // BRK consumes its padding byte
  const br = {
    0x10: 'BPL',
    0x30: 'BMI',
    0x50: 'BVC',
    0x70: 'BVS',
    0x90: 'BCC',
    0xb0: 'BCS',
    0xd0: 'BNE',
    0xf0: 'BEQ',
    0x80: 'BRA'
  };
  for (const [op, m] of Object.entries(br)) set(Number(op), m, 'rel');
  const imp = {
    0x18: 'CLC',
    0x38: 'SEC',
    0x58: 'CLI',
    0x78: 'SEI',
    0xb8: 'CLV',
    0xd8: 'CLD',
    0xf8: 'SED',
    0xaa: 'TAX',
    0xa8: 'TAY',
    0x8a: 'TXA',
    0x98: 'TYA',
    0xba: 'TSX',
    0x9a: 'TXS',
    0x48: 'PHA',
    0x68: 'PLA',
    0x08: 'PHP',
    0x28: 'PLP',
    0xda: 'PHX',
    0xfa: 'PLX',
    0x5a: 'PHY',
    0x7a: 'PLY',
    0xea: 'NOP',
    0xcb: 'WAI',
    0xdb: 'STP'
  };
  for (const [op, m] of Object.entries(imp)) set(Number(op), m, 'imp');
  for (let i = 0; i < 8; i++) {
    set(0x07 | i << 4, "RMB".concat(i), 'zp');
    set(0x87 | i << 4, "SMB".concat(i), 'zp');
    set(0x0f | i << 4, "BBR".concat(i), 'zpr');
    set(0x8f | i << 4, "BBS".concat(i), 'zpr');
  }
  // Undefined NOPs, lengths per the vector suite (the core's own map).
  for (let op = 0; op < 256; op++) {
    if (TABLE[op]) continue;
    const col = op & 0x0f;
    if (col === 0x03 || col === 0x0b) set(op, 'NOP', 'imp');else if ([0x02, 0x22, 0x42, 0x62, 0x82, 0xc2, 0xe2, 0x44, 0x54, 0xd4, 0xf4].includes(op)) set(op, 'NOP', 'imm');else if ([0x5c, 0xdc, 0xfc].includes(op)) set(op, 'NOP', 'abs');else set(op, 'NOP', 'imp');
  }
}

/**
 * Disassemble one instruction.
 * @param {(a:number)=>number} read
 * @param {number} pc
 * @param {{ labels?: Map<number,string> }} [opts] — addresses render as
 *   their label (`JSR reset` instead of `JSR $8000`) when one is known.
 * @returns {{ text: string, bytes: number[], length: number }}
 */
function disasm6502(read, pc) {
  let opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  const op = read(pc) & 0xff;
  const [mn, mode] = TABLE[op];
  const [n, fmt] = MODES[mode];
  const operands = [];
  for (let i = 0; i < n; i++) operands.push(read(pc + 1 + i & 0xffff) & 0xff);
  let arg = fmt(operands, pc);
  if (opts.labels && arg) {
    arg = arg.replace(/\$([0-9A-F]{4})/g, (m0, hex) => {
      var _opts$labels$get;
      return (_opts$labels$get = opts.labels.get(parseInt(hex, 16))) !== null && _opts$labels$get !== void 0 ? _opts$labels$get : m0;
    });
  }
  return {
    text: arg ? "".concat(mn, " ").concat(arg) : mn,
    bytes: [op, ...operands],
    length: 1 + n
  };
}

/**
 * Parse ld65's VICE label file (`ld65 -Ln labels.txt`) into the pieces the
 * debugger wants: a labels map for the disassembler, and — when the @bw
 * naming convention is present (`_bw_task0_state` etc. from generateC via
 * cc65) — the scheduler-symbols object m6502-debug's yield breakpoints,
 * block stepping and position() consume.
 * Line shape: `al 00F00A .some_label`
 * @param {string} text
 * @returns {{ labels: Map<number,string>, scheduler: { tasks: Array<{name: string, state: {addr: number, size: number}}> } }}
 */
function symbolsFromLd65Labels(text) {
  const labels = new Map();
  const tasks = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^al\s+([0-9A-Fa-f]+)\s+\.(.+)$/);
    if (!m) continue;
    const addr = parseInt(m[1], 16) & 0xffff;
    const name = m[2].replace(/^_/, '');
    if (!labels.has(addr)) labels.set(addr, name);
    const t = name.match(/^(bw_task\d+)_state$/);
    // The scheduler state vars are `unsigned int` on cc65: 2 bytes.
    if (t) tasks.push({
      name: t[1],
      state: {
        addr,
        size: 2
      }
    });
  }
  tasks.sort((a, b) => a.name.localeCompare(b.name));
  return {
    labels,
    scheduler: {
      tasks
    }
  };
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (disasm6502);

/***/ })

}]);