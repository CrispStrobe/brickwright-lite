"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["src_lib_bw-board_z80-debug_js"],{

/***/ "./src/lib/bw-board/z80-debug.js":
/*!***************************************!*\
  !*** ./src/lib/bw-board/z80-debug.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createZ80DebugTarget: () => (/* binding */ createZ80DebugTarget),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _z80_disasm_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./z80-disasm.js */ "./src/lib/bw-board/z80-disasm.js");
/* harmony import */ var _zx_sna_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./zx-sna.js */ "./src/lib/bw-board/zx-sna.js");
/* harmony import */ var _zx_z80file_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./zx-z80file.js */ "./src/lib/bw-board/zx-z80file.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Boundary-D debug target for Z80Machine — the Searle-shape breadboard
 * (and the CP/M machine) becomes breakable, steppable, inspectable.
 * Mirrors m6502-debug.js: this module owns the stepping loop with a
 * breakpoint check around each machine.step(). No symbols/yield concept
 * yet — raw Z80 programs (BASIC interpreters, CP/M) are address-level.
 *
 * @module
 */




/** @param {{ machine: import('./z80-machine.js').Z80Machine }} adapter */
function createZ80DebugTarget(adapter) {
  const machine = adapter.machine;
  const cpu = machine.cpu;
  let runState = 'halted';
  let pendingStep = null;
  const haltListeners = [];
  const breakpoints = new Map();
  let nextBpId = 1;
  const halt = info => {
    runState = 'halted';
    for (const cb of haltListeners) cb(info);
  };

  // Write watchpoints trap TRUE writes by wrapping the core's write
  // callback (installed only while a watch exists) — emu8051 parity.
  // The trap sits ABOVE the machine's ROM filter, so a store aimed at
  // ROM still fires: the program wrote, even if memory refused.
  const writeWatches = new Map(); // id → { addr, len }
  let watchHit = null;
  let origWrite = null;
  const syncWriteTrap = () => {
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
  };

  // Call-class opcodes for step-over: CALL nn, CALL cc,nn, and RST n.
  const isCallClass = op => op === 0xcd || (op & 0xc7) === 0xc4 || (op & 0xc7) === 0xc7;
  return {
    capabilities() {
      return {
        steps: ['insn', 'over', 'out'],
        breakpoints: ['code', 'write'],
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
        sp: cpu.sp,
        a: cpu.a,
        f: cpu.f,
        bc: cpu.bc,
        de: cpu.de,
        hl: cpu.hl,
        ix: cpu.ix,
        iy: cpu.iy,
        i: cpu.i,
        r: cpu.r,
        af_: cpu.af_,
        bc_: cpu.bc_,
        de_: cpu.de_,
        hl_: cpu.hl_,
        iff1: cpu.iff1,
        im: cpu.im,
        cycles: machine.cycles
      };
    },
    /** Live disassembly (vector-length-ground; reads through the bus,
     *  so a 128K machine disassembles the PAGE the CPU actually sees). */
    disasm(addr) {
      var _machine$readBus;
      const rd = (_machine$readBus = machine.readBus) !== null && _machine$readBus !== void 0 ? _machine$readBus : a => machine.mem[a & 0xffff];
      return (0,_z80_disasm_js__WEBPACK_IMPORTED_MODULE_0__.disasmZ80)(a => rd(a & 0xffff), addr & 0xffff);
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
      if (spec.kind !== 'code') return {
        unsupported: "unknown breakpoint kind: ".concat(spec.kind)
      };
      if (spec.addr == null) return {
        unsupported: 'addr required'
      };
      const id = nextBpId++;
      breakpoints.set(id, {
        kind: 'code',
        addr: spec.addr & 0xffff
      });
      return id;
    },
    clearBreakpoint(id) {
      breakpoints.delete(id);
      if (writeWatches.delete(id)) syncWriteTrap();
    },
    run() {
      runState = 'running';
      pendingStep = null;
    },
    /** The session's pause verb: stop executing NOW and tell the
     *  halt listeners why — same contract as a breakpoint hit. */
    halt() {
      halt({
        cause: 'pause'
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
      if (kind === 'over') {
        // Depth-wait only when the next opcode is call-class; a PUSH
        // must not turn step-over into run-until-someday. A false
        // conditional CALL never deepens, so the depth check falls
        // through to a single-step naturally.
        if (!isCallClass(machine.mem[cpu.pc & 0xffff])) {
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
          sp0: cpu.sp,
          entered: false
        };
        return undefined;
      }
      if (kind === 'out') {
        runState = 'running';
        pendingStep = {
          kind: 'out',
          sp0: cpu.sp
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
      const deadline = machine.tMs + budgetNs / 1e6;
      while (machine.tMs < deadline) {
        var _pendingStep, _pendingStep2;
        for (const [id, bp] of breakpoints) {
          if (bp.addr === cpu.pc) {
            halt({
              cause: 'breakpoint',
              bp: id
            });
            return 'halted';
          }
        }
        if (pendingStep) {
          if (pendingStep.kind === 'insn' && pendingStep.remaining <= 0) {
            halt({
              cause: 'step'
            });
            return 'halted';
          }
          if (pendingStep.kind === 'over' && pendingStep.entered && (cpu.sp - pendingStep.sp0 & 0x8000) === 0) {
            halt({
              cause: 'step'
            });
            return 'halted';
          }
          if (pendingStep.kind === 'out' && cpu.sp !== pendingStep.sp0 && (cpu.sp - pendingStep.sp0 & 0x8000) === 0) {
            halt({
              cause: 'step'
            });
            return 'halted';
          }
        }
        machine.step();
        if (watchHit) {
          const hit = watchHit;
          watchHit = null;
          halt(_objectSpread({
            cause: 'watchpoint'
          }, hit));
          return 'halted';
        }
        if (((_pendingStep = pendingStep) === null || _pendingStep === void 0 ? void 0 : _pendingStep.kind) === 'insn') pendingStep.remaining--;
        if (((_pendingStep2 = pendingStep) === null || _pendingStep2 === void 0 ? void 0 : _pendingStep2.kind) === 'over') pendingStep.entered = true;
      }
      return runState === 'halted' ? 'halted' : 'budget';
    },
    timeNs() {
      return BigInt(Math.round(machine.tMs * 1e6));
    },
    /** Face-input contract, joystick side: the VdpScreen button mask
     *  onto the Kempston port. False without the interface. */
    setButtons(mask) {
      return typeof machine.setButtons === 'function' ? machine.setButtons(mask) : false;
    },
    /**
     * Face-input contract, Spectrum flavor: key NAMES, not a button
     * mask — the ULA scans a real 8x5 matrix and the face's keyboard
     * focus routing passes held key names straight through. Returns
     * false when the machine has no ULA to receive them.
     */
    setKeys(names) {
      if (!machine.ula || typeof machine.ula.setKeys !== 'function') return false;
      machine.ula.setKeys(names);
      return true;
    },
    video() {
      // The ULA is the Spectrum's video chip; otherwise any chip
      // implementing the common videoFrame() contract counts (MC6845
      // and friends arrive on this same surface).
      if (machine.ula && typeof machine.ula.videoFrame === 'function') return machine.ula.videoFrame();
      for (const chip of Object.values(machine.chips || {})) {
        if (typeof chip.videoFrame === 'function') return chip.videoFrame();
      }
      return null;
    },
    /** Audio-face contract: the beeper's current {hz, on}, or null. */
    audio() {
      if (machine.ula && typeof machine.ula.audioTone === 'function') return machine.ula.audioTone();
      return null;
    },
    /** Insert a .TAP for the ROM fast-load trap; false without support. */
    insertTape(tapBuf) {
      if (typeof machine.insertTape !== 'function') return false;
      machine.insertTape(tapBuf);
      return true;
    },
    /** Load a 48K snapshot — the face's drag-a-file-in path. A 48K
     *  .SNA is exactly its fixed size; anything else is tried as .z80
     *  (all three header generations). Returns false on machines
     *  without a ULA or on formats that refuse (128K, junk). */
    loadSnapshot(buf) {
      if (!machine.ula) return false;
      try {
        if (buf.length === _zx_sna_js__WEBPACK_IMPORTED_MODULE_1__.SNA_SIZE) (0,_zx_sna_js__WEBPACK_IMPORTED_MODULE_1__.loadSNA)(machine, buf);else (0,_zx_z80file_js__WEBPACK_IMPORTED_MODULE_2__.loadZ80)(machine, buf);
        return true;
      } catch (_unused) {
        return false;
      }
    },
    readMem(space, addr, len) {
      var _machine$readBus2;
      if (space !== 'mem') return {
        unsupported: "no space '".concat(space, "' on z80")
      };
      const rd = (_machine$readBus2 = machine.readBus) !== null && _machine$readBus2 !== void 0 ? _machine$readBus2 : a => machine.mem[a & 0xffff];
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i++) out[i] = rd(addr + i & 0xffff);
      return out;
    },
    writeMem(space, addr, data) {
      if (space !== 'mem') return {
        refused: "no space '".concat(space, "' on z80")
      };
      // A debugger patches what the CPU sees, ROM included — that is
      // the point of a poke. On 128K that means the mapped ROM slot
      // and the mapped page; on 48K, flat memory as always.
      const wr = machine._zx128 ? (a, v) => {
        if (a < 0x4000) machine.roms[machine._bank.rom][a] = v;else machine.writeBus(a, v);
      } : (a, v) => {
        machine.mem[a & 0xffff] = v & 0xff;
      };
      for (let i = 0; i < data.length; i++) wr(addr + i & 0xffff, data[i] & 0xff);
      return undefined;
    }
  };
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (createZ80DebugTarget);

/***/ }),

/***/ "./src/lib/bw-board/z80-disasm.js":
/*!****************************************!*\
  !*** ./src/lib/bw-board/z80-disasm.js ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CPM_LABELS: () => (/* binding */ CPM_LABELS),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   disasmZ80: () => (/* binding */ disasmZ80)
/* harmony export */ });
/**
 * Z80 disassembler — the debugger's live pane for the Z80 machines, same
 * standard as the 6502 one: lengths ground against the SingleStepTests
 * vectors' pc-deltas, formats spot-checked against the published table.
 * Decoding follows the classic octal-field structure (x = op>>6,
 * y = (op>>3)&7, z = op&7), which keeps the four prefix pages compact.
 *
 * @module
 */

const h2 = v => v.toString(16).toUpperCase().padStart(2, '0');
const h4 = v => v.toString(16).toUpperCase().padStart(4, '0');
const R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
const ROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const X0Z7 = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
const BLOCK = {
  0xa0: 'LDI',
  0xa1: 'CPI',
  0xa2: 'INI',
  0xa3: 'OUTI',
  0xa8: 'LDD',
  0xa9: 'CPD',
  0xaa: 'IND',
  0xab: 'OUTD',
  0xb0: 'LDIR',
  0xb1: 'CPIR',
  0xb2: 'INIR',
  0xb3: 'OTIR',
  0xb8: 'LDDR',
  0xb9: 'CPDR',
  0xba: 'INDR',
  0xbb: 'OTDR'
};

/** Well-known CP/M page-zero entry points — useful labels even for
 *  symbol-less binaries like BBCBASIC.COM. */
const CPM_LABELS = new Map([[0x0000, 'WBOOT'], [0x0005, 'BDOS'], [0x0100, 'TPA']]);

/**
 * @param {(a:number)=>number} read @param {number} pc
 * @param {{ labels?: Map<number,string> }} [opts] — addresses render as
 *   their label (`CALL BDOS` instead of `CALL $0005`) when one is known.
 * @returns {{ text: string, bytes: number[], length: number }}
 */
function disasmZ80(read, pc) {
  let opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  const bytes = [];
  let i = 0;
  const next = () => {
    const b = read(pc + i & 0xffff) & 0xff;
    bytes.push(b);
    i++;
    return b;
  };
  const n8 = () => "$".concat(h2(next()));
  const n16 = () => {
    const lo = next();
    const hi = next();
    return "$".concat(h4(lo | hi << 8));
  };
  const rel = () => {
    const d = next();
    return "$".concat(h4(pc + i + (d << 24 >> 24) & 0xffff));
  };
  const done = text => {
    if (opts.labels) {
      text = text.replace(/\$([0-9A-F]{4})/g, (m0, hex) => {
        var _opts$labels$get;
        return (_opts$labels$get = opts.labels.get(parseInt(hex, 16))) !== null && _opts$labels$get !== void 0 ? _opts$labels$get : m0;
      });
    }
    return {
      text,
      bytes,
      length: i
    };
  };
  let ixMode = null; // 'IX' | 'IY'
  let op = next();
  if (op === 0xdd || op === 0xfd) {
    ixMode = op === 0xdd ? 'IX' : 'IY';
    op = next();
  }

  // Substituted register names under DD/FD.
  const disp = () => {
    const d = next() << 24 >> 24;
    return "(".concat(ixMode).concat(d >= 0 ? '+' : '-', "$").concat(h2(Math.abs(d)), ")");
  };
  const rr = (k, memForm) => {
    if (!ixMode) return R[k];
    if (k === 6) return memForm || R[6];
    if (k === 4) return "".concat(ixMode, "H");
    if (k === 5) return "".concat(ixMode, "L");
    return R[k];
  };
  const HLn = () => ixMode || 'HL';
  if (op === 0xcb) {
    // CB page — or DDCB/FDCB with the displacement BEFORE the sub-op.
    const mem = ixMode ? disp() : '(HL)';
    const sub = next();
    const x = sub >> 6;
    const y = sub >> 3 & 7;
    const z = sub & 7;
    const tgt = z === 6 || ixMode ? mem : R[z];
    const copy = ixMode && z !== 6 ? ",".concat(R[z]) : '';
    if (x === 0) return done("".concat(ROT[y], " ").concat(tgt).concat(copy));
    if (x === 1) return done("BIT ".concat(y, ",").concat(tgt));
    return done("".concat(x === 2 ? 'RES' : 'SET', " ").concat(y, ",").concat(tgt).concat(copy));
  }
  if (op === 0xed) {
    const sub = next();
    if (BLOCK[sub]) return done(BLOCK[sub]);
    const y = sub >> 3 & 7;
    const z = sub & 7;
    if (sub >= 0x40 && sub <= 0x7f) {
      switch (z) {
        case 0:
          return done(y === 6 ? 'IN (C)' : "IN ".concat(R[y], ",(C)"));
        case 1:
          return done(y === 6 ? 'OUT (C),0' : "OUT (C),".concat(R[y]));
        case 2:
          return done("".concat(sub & 8 ? 'ADC' : 'SBC', " HL,").concat(RP[y >> 1]));
        case 3:
          {
            const nn = n16();
            return done(sub & 8 ? "LD ".concat(RP[y >> 1], ",(").concat(nn, ")") : "LD (".concat(nn, "),").concat(RP[y >> 1]));
          }
        case 4:
          return done('NEG');
        case 5:
          return done(sub === 0x4d ? 'RETI' : 'RETN');
        case 6:
          return done("IM ".concat([0, 0, 1, 2][y & 3]));
        default:
          return done({
            0x47: 'LD I,A',
            0x4f: 'LD R,A',
            0x57: 'LD A,I',
            0x5f: 'LD A,R',
            0x67: 'RRD',
            0x6f: 'RLD'
          }[sub] || 'NONI');
      }
    }
    return done('NONI');
  }
  const x = op >> 6;
  const y = op >> 3 & 7;
  const z = op & 7;
  if (x === 0) {
    switch (z) {
      case 0:
        if (y === 0) return done('NOP');
        if (y === 1) return done("EX AF,AF'");
        if (y === 2) return done("DJNZ ".concat(rel()));
        if (y === 3) return done("JR ".concat(rel()));
        return done("JR ".concat(CC[y - 4], ",").concat(rel()));
      case 1:
        if (op & 8) return done("ADD ".concat(HLn(), ",").concat(y >> 1 === 2 ? HLn() : RP[y >> 1]));
        return done("LD ".concat(y >> 1 === 2 ? HLn() : RP[y >> 1], ",").concat(n16()));
      case 2:
        {
          const table = {
            0x02: 'LD (BC),A',
            0x0a: 'LD A,(BC)',
            0x12: 'LD (DE),A',
            0x1a: 'LD A,(DE)'
          };
          if (table[op]) return done(table[op]);
          const nn = n16();
          if (op === 0x22) return done("LD (".concat(nn, "),").concat(HLn()));
          if (op === 0x2a) return done("LD ".concat(HLn(), ",(").concat(nn, ")"));
          if (op === 0x32) return done("LD (".concat(nn, "),A"));
          return done("LD A,(".concat(nn, ")"));
        }
      case 3:
        return done("".concat(op & 8 ? 'DEC' : 'INC', " ").concat(y >> 1 === 2 ? HLn() : RP[y >> 1]));
      case 4:
        return done("INC ".concat(y === 6 && ixMode ? disp() : rr(y)));
      case 5:
        return done("DEC ".concat(y === 6 && ixMode ? disp() : rr(y)));
      case 6:
        {
          if (y === 6 && ixMode) {
            const m = disp();
            return done("LD ".concat(m, ",").concat(n8()));
          }
          return done("LD ".concat(rr(y), ",").concat(n8()));
        }
      default:
        return done(X0Z7[y]);
    }
  }
  if (x === 1) {
    if (op === 0x76) return done('HALT');
    if (ixMode && (y === 6 || z === 6)) {
      const m = disp();
      return done(y === 6 ? "LD ".concat(m, ",").concat(R[z]) : "LD ".concat(R[y], ",").concat(m));
    }
    return done("LD ".concat(rr(y), ",").concat(rr(z)));
  }
  if (x === 2) {
    if (z === 6 && ixMode) return done("".concat(ALU[y]).concat(disp()).trim());
    return done("".concat(ALU[y]).concat(rr(z)).trim());
  }
  switch (z) {
    case 0:
      return done("RET ".concat(CC[y]));
    case 1:
      if (op & 8) return done(['RET', 'EXX', "JP (".concat(HLn(), ")"), "LD SP,".concat(HLn())][y >> 1]);
      return done("POP ".concat(y >> 1 === 2 ? HLn() : RP2[y >> 1]));
    case 2:
      return done("JP ".concat(CC[y], ",").concat(n16()));
    case 3:
      switch (y) {
        case 0:
          return done("JP ".concat(n16()));
        case 2:
          return done("OUT (".concat(n8(), "),A"));
        case 3:
          return done("IN A,(".concat(n8(), ")"));
        case 4:
          return done("EX (SP),".concat(HLn()));
        case 5:
          return done('EX DE,HL');
        case 6:
          return done('DI');
        default:
          return done('EI');
      }
    case 4:
      return done("CALL ".concat(CC[y], ",").concat(n16()));
    case 5:
      if (op & 8) return done("CALL ".concat(n16()));
      return done("PUSH ".concat(y >> 1 === 2 ? HLn() : RP2[y >> 1]));
    case 6:
      return done("".concat(ALU[y]).concat(n8()).trim());
    default:
      return done("RST $".concat(h2(y * 8)));
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (disasmZ80);

/***/ }),

/***/ "./src/lib/bw-board/zx-sna.js":
/*!************************************!*\
  !*** ./src/lib/bw-board/zx-sna.js ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SNA128_SIZE: () => (/* binding */ SNA128_SIZE),
/* harmony export */   SNA_SIZE: () => (/* binding */ SNA_SIZE),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   loadSNA: () => (/* binding */ loadSNA),
/* harmony export */   loadSNA128: () => (/* binding */ loadSNA128),
/* harmony export */   saveSNA: () => (/* binding */ saveSNA),
/* harmony export */   saveSNA128: () => (/* binding */ saveSNA128)
/* harmony export */ });
/**
 * .SNA — the oldest and simplest ZX Spectrum snapshot format (48K
 * variant), as documented across the emulation world for decades:
 * a 27-byte register header followed by the 48K RAM dump
 * ($4000-$FFFF). PC is not in the header; the saver pushes it onto
 * the stack and the loader pops it (the real-hardware trick was an
 * NMI button and RETN).
 *
 * Header layout (offsets):
 *   0 I | 1-2 HL' | 3-4 DE' | 5-6 BC' | 7-8 AF' | 9-10 HL | 11-12 DE
 *   13-14 BC | 15-16 IY | 17-18 IX | 19 IFF2 (bit 2) | 20 R
 *   21-22 AF | 23-24 SP | 25 IM | 26 border
 * All 16-bit values little-endian (low byte first: F before A).
 *
 * This gives our Spectrum the whole archive of real-world software
 * as loadable content, and lets any machine state travel to and from
 * other emulators. 128K .SNA and the .Z80 format are later steps.
 */

const SNA_SIZE = 27 + 49152;

/** Serialize a running 48K machine to .SNA bytes. */
function saveSNA(machine) {
  const cpu = machine.cpu;
  const out = new Uint8Array(SNA_SIZE);
  // Push PC like the NMI saver did: SP drops 2, PC lands there.
  const sp = cpu.sp - 2 & 0xffff;
  const mem = machine.mem.slice(); // do not disturb the live machine
  mem[sp] = cpu.pc & 0xff;
  mem[sp + 1 & 0xffff] = cpu.pc >> 8;
  const w = (off, v) => {
    out[off] = v & 0xff;
    out[off + 1] = v >> 8 & 0xff;
  };
  out[0] = cpu.i;
  w(1, cpu.hl_);
  w(3, cpu.de_);
  w(5, cpu.bc_);
  w(7, cpu.af_);
  w(9, cpu.hl);
  w(11, cpu.de);
  w(13, cpu.bc);
  w(15, cpu.iy);
  w(17, cpu.ix);
  out[19] = cpu.iff2 ? 0x04 : 0x00;
  out[20] = cpu.r;
  w(21, cpu.af);
  w(23, sp);
  out[25] = cpu.im;
  out[26] = machine.ula ? machine.ula.border : 0;
  out.set(mem.subarray(0x4000, 0x10000), 27);
  return out;
}

/** Restore .SNA bytes onto a 48K machine (ROM already loaded). */
function loadSNA(machine, buf) {
  if (buf.length < SNA_SIZE) throw new Error("not a 48K .SNA: ".concat(buf.length, " bytes, expected ").concat(SNA_SIZE));
  const cpu = machine.cpu;
  const r16 = off => buf[off] | buf[off + 1] << 8;
  cpu.i = buf[0];
  cpu.hl_ = r16(1);
  cpu.de_ = r16(3);
  cpu.bc_ = r16(5);
  cpu.af_ = r16(7);
  cpu.hl = r16(9);
  cpu.de = r16(11);
  cpu.bc = r16(13);
  cpu.iy = r16(15);
  cpu.ix = r16(17);
  cpu.iff1 = cpu.iff2 = buf[19] & 0x04 ? 1 : 0;
  cpu.r = buf[20];
  cpu.af = r16(21);
  cpu.sp = r16(23);
  cpu.im = buf[25];
  if (machine.ula) machine.ula.border = buf[26] & 0x07;
  machine.mem.set(buf.subarray(27, 27 + 49152), 0x4000);
  // RETN: pop PC, SP rises past it.
  cpu.pc = machine.mem[cpu.sp] | machine.mem[cpu.sp + 1 & 0xffff] << 8;
  cpu.sp = cpu.sp + 2 & 0xffff;
  cpu.halted = 0;
  cpu.eiLatch = 0;
}

/** 128K SNA: 131103 bytes. */
const SNA128_SIZE = 27 + 49152 + 4 + 5 * 16384;

/** Restore a 128K .SNA onto a zx128 machine. */
function loadSNA128(machine, buf) {
  if (buf.length < SNA128_SIZE) {
    throw new Error("not a 128K .SNA: ".concat(buf.length, " bytes, expected ").concat(SNA128_SIZE));
  }
  if (!machine._zx128) {
    throw new Error('128K .SNA requires a zx128 machine (config.zx128 = true)');
  }
  const cpu = machine.cpu;
  const r16 = off => buf[off] | buf[off + 1] << 8;

  // Header (same as 48K)
  cpu.i = buf[0];
  cpu.hl_ = r16(1);
  cpu.de_ = r16(3);
  cpu.bc_ = r16(5);
  cpu.af_ = r16(7);
  cpu.hl = r16(9);
  cpu.de = r16(11);
  cpu.bc = r16(13);
  cpu.iy = r16(15);
  cpu.ix = r16(17);
  cpu.iff1 = cpu.iff2 = buf[19] & 0x04 ? 1 : 0;
  cpu.r = buf[20];
  cpu.af = r16(21);
  cpu.sp = r16(23);
  cpu.im = buf[25];
  if (machine.ula) machine.ula.border = buf[26] & 0x07;

  // 48K RAM: pages 5 ($4000), 2 ($8000), and the banked page at $C000
  machine.mem.set(buf.subarray(27, 27 + 49152), 0x4000);

  // Extension header at 49179
  const ext = 27 + 49152;
  cpu.pc = r16(ext);
  const port7ffd = buf[ext + 2];
  // byte ext+3 = TRDOS flag (ignored)

  // The banked page at $C000 in the 48K dump
  const bankedPage = port7ffd & 0x07;

  // Copy the $C000 portion of the 48K dump into the correct bank
  // (it's already in machine.mem at $C000, but we need it in pages[])
  machine.pages[bankedPage].set(buf.subarray(27 + 32768, 27 + 49152) // $C000-$FFFF from the dump
  );

  // Remaining 5 banks follow the extension, in order 0-7 skipping
  // pages 5, 2, and the currently banked page
  const skip = new Set([5, 2, bankedPage]);
  let off = ext + 4;
  for (let b = 0; b < 8; b++) {
    if (skip.has(b)) continue;
    machine.pages[b].set(buf.subarray(off, off + 16384));
    off += 16384;
  }

  // Apply banking
  machine._bank.locked = 0;
  machine._setBank(port7ffd);
  cpu.halted = 0;
  cpu.eiLatch = 0;
}

/** Serialize a running 128K machine as 128K .SNA. */
function saveSNA128(machine) {
  if (!machine._zx128) throw new Error('saveSNA128 needs a zx128 machine');
  const cpu = machine.cpu;
  const out = new Uint8Array(SNA128_SIZE);
  const w = (off, v) => {
    out[off] = v & 0xff;
    out[off + 1] = v >> 8 & 0xff;
  };

  // Header (same as 48K but NO pushed PC — 128K stores it in the extension)
  out[0] = cpu.i;
  w(1, cpu.hl_);
  w(3, cpu.de_);
  w(5, cpu.bc_);
  w(7, cpu.af_);
  w(9, cpu.hl);
  w(11, cpu.de);
  w(13, cpu.bc);
  w(15, cpu.iy);
  w(17, cpu.ix);
  out[19] = cpu.iff2 ? 0x04 : 0x00;
  out[20] = cpu.r;
  w(21, cpu.af);
  w(23, cpu.sp);
  out[25] = cpu.im;
  out[26] = machine.ula ? machine.ula.border : 0;

  // 48K RAM dump: pages 5 ($4000) + 2 ($8000) + banked ($C000)
  out.set(machine.mem.subarray(0x4000, 0x10000), 27);
  // $C000 region comes from the currently banked page
  const bankedPage = machine._bank.page;
  out.set(machine.pages[bankedPage], 27 + 32768);

  // Extension
  const ext = 27 + 49152;
  w(ext, cpu.pc);
  const port7ffd = bankedPage | machine._bank.shadow << 3 | machine._bank.rom << 4 | machine._bank.locked << 5;
  out[ext + 2] = port7ffd;
  out[ext + 3] = 0; // TRDOS flag

  // Remaining 5 banks
  const skip = new Set([5, 2, bankedPage]);
  let off = ext + 4;
  for (let b = 0; b < 8; b++) {
    if (skip.has(b)) continue;
    out.set(machine.pages[b], off);
    off += 16384;
  }
  return out;
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  saveSNA,
  loadSNA,
  SNA_SIZE,
  loadSNA128,
  saveSNA128,
  SNA128_SIZE
});

/***/ }),

/***/ "./src/lib/bw-board/zx-z80file.js":
/*!****************************************!*\
  !*** ./src/lib/bw-board/zx-z80file.js ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   compressZ80: () => (/* binding */ compressZ80),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   loadZ80: () => (/* binding */ loadZ80),
/* harmony export */   parseZ80: () => (/* binding */ parseZ80),
/* harmony export */   saveZ80: () => (/* binding */ saveZ80)
/* harmony export */ });
/**
 * .Z80 — the archive's dominant Spectrum snapshot format, all three
 * header generations. 48K and 128K machines.
 *
 * v1: 30-byte header, then the whole 48K ($4000-$FFFF), optionally
 *     ED-ED run-compressed, terminated by 00 ED ED 00.
 * v2/v3: header PC == 0 flags an extra header (length word at 30,
 *     real PC at 32, hardware mode at 34), then PAGES: each is
 *     [len:word][page#][data], len $FFFF meaning 16384 bytes stored
 *     uncompressed.
 *     48K page numbers: 8 → $4000, 4 → $8000, 5 → $C000.
 *     128K page numbers: 3-10 → banks 0-7 (page# - 3 = bank).
 *     Byte 35: last OUT $7FFD (bank switching state).
 *     Bytes 39-55: AY register contents (17 bytes, when the chip exists).
 *
 * Compression, both directions: ED ED nn vv = nn repeats of vv. A run
 * is only encoded at length 5+, EXCEPT runs of ED which encode from
 * length 2 (two literal EDs would read as a run marker); a single
 * literal ED forces the following byte literal, per the spec.
 *
 * loadZ80/saveZ80 mirror zx-sna.js: registers onto machine.cpu, RAM
 * into machine.mem, border to the ULA. saveZ80 writes v1 compressed —
 * every emulator since 1989 reads that.
 */

const RAM_BASE = 0x4000;
const RAM_LEN = 49152;

/** ED-ED run compression (v1 body rules). */
function compressZ80(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === v && run < 255) run++;
    if (v === 0xed && run >= 2) {
      out.push(0xed, 0xed, run, v);
      i += run;
    } else if (v === 0xed) {
      out.push(v);
      i++;
      if (i < data.length) {
        out.push(data[i]);
        i++;
      } // literal after lone ED
    } else if (run >= 5) {
      out.push(0xed, 0xed, run, v);
      i += run;
    } else {
      for (let k = 0; k < run; k++) out.push(v);
      i += run;
    }
  }
  return Uint8Array.from(out);
}

/** @param {Uint8Array} buf @param {Uint8Array} out fills out, returns bytes consumed
 *  @param {boolean} v1End stop at the 00 ED ED 00 end marker */
function decompress(buf, start, out, v1End) {
  let i = start;
  let o = 0;
  while (i < buf.length && o < out.length) {
    if (v1End && buf[i] === 0x00 && buf[i + 1] === 0xed && buf[i + 2] === 0xed && buf[i + 3] === 0x00) {
      i += 4;
      break;
    }
    if (buf[i] === 0xed && buf[i + 1] === 0xed) {
      const n = buf[i + 2];
      const v = buf[i + 3];
      for (let k = 0; k < n && o < out.length; k++) out[o++] = v;
      i += 4;
    } else {
      out[o++] = buf[i++];
    }
  }
  return i - start;
}
const V2_PAGE_AT_48K = {
  8: 0x0000,
  4: 0x4000,
  5: 0x8000
}; // offsets into the 48K block

// 128K hardware modes per .z80 spec
const HW_128K_V2 = new Set([3, 4]); // v2: mode 3 = 128K, 4 = 128K+IF1
const HW_128K_V3 = new Set([4, 5, 6, 12]); // v3: mode 4 = 128K, 5 = 128K+IF1, 6 = +3, 12 = +2/+2A

/**
 * Parse a .z80 of any version into either:
 *   48K: { version, regs, border, mem48k, is128: false }
 *   128K: { version, regs, border, banks: Uint8Array[8], port7ffd, ayRegs, is128: true }
 */
function parseZ80(buf) {
  if (buf.length < 30) throw new Error('not a .z80 file: shorter than the v1 header');
  const r16 = o => buf[o] | buf[o + 1] << 8;
  let flags12 = buf[12];
  if (flags12 === 0xff) flags12 = 1; // spec: 255 means 1 (ancient files)
  const regs = {
    a: buf[0],
    f: buf[1],
    bc: r16(2),
    hl: r16(4),
    pc: r16(6),
    sp: r16(8),
    i: buf[10],
    r: buf[11] & 0x7f | (flags12 & 1) << 7,
    de: r16(13),
    bc_: r16(15),
    de_: r16(17),
    hl_: r16(19),
    af_: buf[21] << 8 | buf[22],
    iy: r16(23),
    ix: r16(25),
    iff1: buf[27] ? 1 : 0,
    iff2: buf[28] ? 1 : 0,
    im: buf[29] & 0x03
  };
  const border = flags12 >> 1 & 0x07;
  if (regs.pc !== 0) {
    // v1: one block, always 48K.
    const mem48k = new Uint8Array(RAM_LEN);
    if (flags12 & 0x20) decompress(buf, 30, mem48k, true);else mem48k.set(buf.subarray(30, 30 + RAM_LEN));
    return {
      version: 1,
      regs,
      border,
      mem48k,
      is128: false
    };
  }

  // v2/v3: extra header, then pages.
  const extra = r16(30);
  regs.pc = r16(32);
  const hw = buf[34];
  const version = extra === 23 ? 2 : 3;

  // Determine if 128K
  const is128 = version === 2 ? HW_128K_V2.has(hw) : HW_128K_V3.has(hw);
  if (!is128) {
    // 48K mode
    const ok48 = version === 2 ? [0, 1] : [0, 1, 3];
    if (!ok48.includes(hw)) {
      throw new Error(".z80 hardware mode ".concat(hw, " (version ").concat(version, ") is not a recognized 48K or 128K machine"));
    }
    const mem48k = new Uint8Array(RAM_LEN);
    let i = 32 + extra;
    while (i + 3 <= buf.length) {
      const len = r16(i);
      const page = buf[i + 2];
      i += 3;
      const at = V2_PAGE_AT_48K[page];
      if (at === undefined) {
        i += len === 0xffff ? 16384 : len;
        continue;
      }
      const dst = mem48k.subarray(at, at + 16384);
      if (len === 0xffff) {
        dst.set(buf.subarray(i, i + 16384));
        i += 16384;
      } else {
        decompress(buf, i, dst, false);
        i += len;
      }
    }
    return {
      version,
      regs,
      border,
      mem48k,
      is128: false
    };
  }

  // 128K mode
  const port7ffd = buf[35];
  // AY state: byte 38 = last-selected register, bytes 39-54 = R0-R15.
  const aySelected = extra >= 25 ? buf[38] & 0x0f : 0;
  const ayRegs = extra >= 25 ? buf.slice(39, 55) : new Uint8Array(16);
  const banks = Array.from({
    length: 8
  }, () => new Uint8Array(16384));
  let i = 32 + extra;
  while (i + 3 <= buf.length) {
    const len = r16(i);
    const page = buf[i + 2];
    i += 3;
    // 128K pages: 3-10 → banks 0-7
    const bank = page - 3;
    if (bank >= 0 && bank < 8) {
      if (len === 0xffff) {
        banks[bank].set(buf.subarray(i, i + 16384));
        i += 16384;
      } else {
        decompress(buf, i, banks[bank], false);
        i += len;
      }
    } else {
      // ROM pages or unknown: skip
      i += len === 0xffff ? 16384 : len;
    }
  }
  return {
    version,
    regs,
    border,
    banks,
    port7ffd,
    ayRegs,
    aySelected,
    is128: true
  };
}

/** Restore a .z80 onto a machine (ROM already loaded).
 *  128K snapshots require machine._zx128 = true. */
function loadZ80(machine, buf) {
  const snap = parseZ80(buf);
  const cpu = machine.cpu;
  for (const [k, v] of Object.entries(snap.regs)) cpu[k] = v;
  cpu.halted = 0;
  cpu.eiLatch = 0;
  if (machine.ula) machine.ula.border = snap.border;
  if (!snap.is128) {
    // 48K loading (the original path)
    if (machine._zx128) {
      // 48K snapshot on a 128K machine: load into the visible 48K
      machine.mem.set(snap.mem48k, RAM_BASE);
    } else {
      machine.mem.set(snap.mem48k, RAM_BASE);
    }
    return;
  }

  // 128K loading
  if (!machine._zx128) {
    throw new Error('128K .z80 snapshot requires a zx128 machine (config.zx128 = true)');
  }

  // Load all 8 banks. Pages 5 and 2 are subarrays of machine.mem,
  // so setting them updates the flat memory automatically.
  for (let b = 0; b < 8; b++) {
    machine.pages[b].set(snap.banks[b]);
  }

  // Apply the banking state
  machine._bank.locked = 0; // allow _setBank to apply
  machine._setBank(snap.port7ffd);

  // AY registers
  if (machine.ay && snap.ayRegs) {
    var _snap$aySelected;
    for (let r = 0; r < 16 && r < snap.ayRegs.length; r++) {
      machine.ay.select(r);
      machine.ay.write(snap.ayRegs[r]);
    }
    // Byte 38: the register the last OUT $FFFD selected.
    machine.ay.select((_snap$aySelected = snap.aySelected) !== null && _snap$aySelected !== void 0 ? _snap$aySelected : 0);
  }
}

/** Serialize a machine: 48K → v1 compressed; zx128 → v3 with banks. */
function saveZ80(machine) {
  if (machine._zx128) return saveZ80v3(machine);
  const cpu = machine.cpu;
  const h = new Uint8Array(30);
  const w16 = (o, v) => {
    h[o] = v & 0xff;
    h[o + 1] = v >> 8 & 0xff;
  };
  h[0] = cpu.a;
  h[1] = cpu.f;
  w16(2, cpu.bc);
  w16(4, cpu.hl);
  w16(6, cpu.pc);
  w16(8, cpu.sp);
  h[10] = cpu.i;
  h[11] = cpu.r & 0x7f;
  h[12] = cpu.r >> 7 & 1 | ((machine.ula ? machine.ula.border : 0) & 7) << 1 | 0x20;
  w16(13, cpu.de);
  w16(15, cpu.bc_);
  w16(17, cpu.de_);
  w16(19, cpu.hl_);
  h[21] = cpu.af_ >> 8 & 0xff;
  h[22] = cpu.af_ & 0xff;
  w16(23, cpu.iy);
  w16(25, cpu.ix);
  h[27] = cpu.iff1 ? 1 : 0;
  h[28] = cpu.iff2 ? 1 : 0;
  h[29] = cpu.im & 0x03;
  const body = compressZ80(machine.mem.subarray(RAM_BASE, RAM_BASE + RAM_LEN));
  const out = new Uint8Array(30 + body.length + 4);
  out.set(h, 0);
  out.set(body, 30);
  out.set([0x00, 0xed, 0xed, 0x00], 30 + body.length);
  return out;
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  parseZ80,
  loadZ80,
  saveZ80,
  compressZ80
});

/** v3 128K writer: 30-byte base (PC = 0 sentinel), 55-byte extra
 *  header (hw mode 4, port $7FFD, AY state), banks 0-7 as pages 3-10,
 *  each ED-ED compressed. Readable by every v3-aware emulator. */
function saveZ80v3(machine) {
  const cpu = machine.cpu;
  const h = new Uint8Array(30 + 2 + 55);
  const w16 = (o, v) => {
    h[o] = v & 0xff;
    h[o + 1] = v >> 8 & 0xff;
  };
  h[0] = cpu.a;
  h[1] = cpu.f;
  w16(2, cpu.bc);
  w16(4, cpu.hl);
  w16(6, 0); // PC = 0: the v2/v3 sentinel
  w16(8, cpu.sp);
  h[10] = cpu.i;
  h[11] = cpu.r & 0x7f;
  h[12] = cpu.r >> 7 & 1 | ((machine.ula ? machine.ula.border : 0) & 7) << 1;
  w16(13, cpu.de);
  w16(15, cpu.bc_);
  w16(17, cpu.de_);
  w16(19, cpu.hl_);
  h[21] = cpu.af_ >> 8 & 0xff;
  h[22] = cpu.af_ & 0xff;
  w16(23, cpu.iy);
  w16(25, cpu.ix);
  h[27] = cpu.iff1 ? 1 : 0;
  h[28] = cpu.iff2 ? 1 : 0;
  h[29] = cpu.im & 0x03;
  w16(30, 55); // v3 extra header length
  w16(32, cpu.pc); // the real PC
  h[34] = 4; // hardware: 128K
  h[35] = machine._bank.page | machine._bank.shadow << 3 | machine._bank.rom << 4 | machine._bank.locked << 5;
  if (machine.ay) {
    h[37] = 0x04; // flags: AY in use
    h[38] = machine.ay._selected & 0x0f;
    h.set(machine.ay.regs.subarray(0, 16), 39);
  }
  const parts = [h];
  for (let bank = 0; bank < 8; bank++) {
    const body = compressZ80(machine.pages[bank]);
    const blk = new Uint8Array(3 + body.length);
    blk[0] = body.length & 0xff;
    blk[1] = body.length >> 8 & 0xff;
    blk[2] = bank + 3; // page number
    blk.set(body, 3);
    parts.push(blk);
  }
  const total = parts.reduce((n, p2) => n + p2.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p2 of parts) {
    out.set(p2, off);
    off += p2.length;
  }
  return out;
}

/***/ })

}]);