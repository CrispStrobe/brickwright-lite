"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-debug-panel"],{

/***/ "./src/components/tw-pseudocode/debug-drawer.jsx":
/*!*******************************************************!*\
  !*** ./src/components/tw-pseudocode/debug-drawer.jsx ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! prop-types */ "./node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../lib/bw-debug/trace.js */ "./src/lib/bw-debug/trace.js");
/* harmony import */ var _lib_bw_debug_opcodes_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../lib/bw-debug/opcodes.js */ "./src/lib/bw-debug/opcodes.js");
/* harmony import */ var _lib_bw_debug_trace_csv_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../lib/bw-debug/trace-csv.js */ "./src/lib/bw-debug/trace-csv.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }






/**
 * "Under the hood" — parity with emu8051's TUI, as a GUI.
 *
 * ## What parity means here
 *
 * `mainview.c` draws eight boxes: a disassembly of executed instructions, a
 * register row per instruction, PSW bits, SP/ports/IP/IE, the timer and serial
 * SFRs, a memory window that cycles Low/Upr/SFR/Ext/ROM, the stack, and a
 * cycles/time readout. `memeditor.c` is a fuller hex editor on the same five
 * spaces, `logicboard.c` is the board, `options.c` the clock. The keys are:
 * step, run, speed, breakpoint at an address, go to address, reset, wipe,
 * reset the tick counter, and edit any value in place.
 *
 * Everything above is here, except the board — which is not missing, it is the
 * Circuit tab, and a second worse copy of it would be the wrong kind of parity.
 *
 * ## Where this deliberately differs, and why that is not a shortfall
 *
 * **Five of those eight boxes are one table.** They are not independent panes in
 * the TUI either: `mainview.c` keeps a single history ring and draws five
 * columns of it, scrolled together. Eight boxes across 80 columns is a terminal
 * layout constraint, not a design. Showing them as one row per instruction —
 * PC, opcode bytes, assembly, then registers, ports and timers as toggleable
 * column groups — is the same information with the relationship made visible
 * instead of implied.
 *
 * **Nothing is a bare number where a name exists.** `PSW` is eight named flags,
 * an SFR address is `TMOD` rather than `0x89` (names from stc_disasm's table),
 * and the register bank in use is marked rather than left to be decoded out of
 * PSW.4:3. The TUI's users know the 8051; this one's are learning it.
 *
 * **The trace says what it did not record.** The TUI records per instruction
 * because its loop single-steps; at speed it cannot keep up either. Here a free
 * run records at stops only, unless you ask for per-instruction tracing — and
 * the pane labels the difference rather than presenting a gap as a history.
 */

const MONO = {
  fontFamily: 'monospace',
  fontSize: 11
};
const PANE = _objectSpread(_objectSpread({
  background: '#12121f',
  border: '1px solid #2c3e50',
  borderRadius: 6,
  padding: 8
}, MONO), {}, {
  color: '#bdc3c7',
  overflow: 'auto'
});
const TITLE = {
  color: '#7f8c8d',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6
};
const CELL = {
  padding: '1px 5px',
  textAlign: 'right',
  whiteSpace: 'nowrap'
};
const BTN = _objectSpread({
  padding: '3px 8px',
  borderRadius: 3,
  border: '1px solid #2c3e50',
  background: '#16213e',
  color: '#ecf0f1',
  cursor: 'pointer'
}, MONO);
const L10N = {
  en: {
    title: 'Under the hood',
    hide: 'Hide',
    show: 'Show',
    trace: 'Execution trace',
    now: 'Registers',
    sfrs: 'Special function registers',
    memory: 'Memory',
    stack: 'Stack',
    clock: 'Clock',
    code: 'Code at the program counter',
    clickBreak: 'Click to pause here',
    codeNote: 'Anchored at the program counter and read forwards — an 8051 cannot be ' + 'disassembled backwards, because nothing marks where an instruction starts.',
    cols: 'Columns',
    regs: 'registers',
    ports: 'ports',
    timers: 'timers',
    stepInsn: 'Step instruction',
    over: 'Step over',
    out: 'Step out',
    setPc: 'Set PC',
    breakAt: 'Break at',
    reset: 'Reset',
    wipe: 'Wipe',
    stepTen: 'Step ×10',
    clear: 'Clear',
    csvTitle: 'Export the trace as CSV — every row with time, registers, SFRs and captured variables',
    tenHint: 'Ten instructions, each one a row in the trace',
    empty: 'Nothing has run yet. Press Run, then pause or hit a pause point.',
    gapNote: 'A row is recorded whenever the program stops — so stepping traces it ' + 'instruction by instruction, while a free run records only where it stopped. ' + 'Recording every instruction of a full-speed run is not possible: that is ' + 'millions a second.',
    dropped: 'older rows dropped',
    bank: 'bank',
    cycles: 'cycles',
    ms: 'ms',
    spaceNote: 'SFR and internal RAM share these addresses and are different memories.',
    editHint: 'Click a byte to edit it.'
  },
  de: {
    title: 'Unter der Haube',
    hide: 'Verbergen',
    show: 'Zeigen',
    trace: 'Ablaufprotokoll',
    now: 'Register',
    sfrs: 'Spezialregister',
    memory: 'Speicher',
    stack: 'Stapel',
    clock: 'Takt',
    code: 'Code am Programmzähler',
    clickBreak: 'Klicken, um hier anzuhalten',
    codeNote: 'Ab dem Programmzähler vorwärts gelesen — ein 8051 lässt sich nicht ' + 'rückwärts disassemblieren, da nichts den Befehlsanfang markiert.',
    cols: 'Spalten',
    regs: 'Register',
    ports: 'Ports',
    timers: 'Timer',
    stepInsn: 'Ein Befehl',
    over: 'Überspringen',
    out: 'Heraus',
    setPc: 'PC setzen',
    breakAt: 'Halt bei',
    reset: 'Reset',
    wipe: 'Löschen',
    stepTen: 'Schritt ×10',
    clear: 'Leeren',
    csvTitle: 'Trace als CSV exportieren — jede Zeile mit Zeit, Registern, SFRs und erfassten Variablen',
    tenHint: 'Zehn Befehle, jeder eine Zeile im Protokoll',
    empty: 'Es lief noch nichts. Auf Start drücken, dann anhalten.',
    gapNote: 'Eine Zeile entsteht bei jedem Anhalten — Einzelschritte protokollieren ' + 'also Befehl für Befehl, ein freier Lauf nur die Haltepunkte. Jeden Befehl eines ' + 'Laufs mit voller Geschwindigkeit aufzuzeichnen geht nicht: das sind Millionen ' + 'pro Sekunde.',
    dropped: 'ältere Zeilen verworfen',
    bank: 'Bank',
    cycles: 'Zyklen',
    ms: 'ms',
    spaceNote: 'Spezialregister und internes RAM teilen sich diese Adressen und sind ' + 'verschiedene Speicher.',
    editHint: 'Auf ein Byte klicken zum Ändern.'
  }
};

// Machine-class targets (6502, Z80) have one flat 64K space; the 8051
// list below would page through spaces their readMem refuses.
const MACHINE_SPACES = [{
  id: 'mem',
  label: 'Memory',
  size: 0x10000
}];
const SPACES = [{
  id: 'iram',
  label: 'Internal RAM',
  size: 0x100
}, {
  id: 'sfr',
  label: 'SFR',
  size: 0x100,
  base: 0x80
}, {
  id: 'xram',
  label: 'External RAM',
  size: 0x400
}, {
  id: 'code',
  label: 'Program (ROM)',
  size: 0x1000
}, {
  id: 'bit',
  label: 'Bit space',
  size: 0x100
}];
class DebugDrawer extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    this.state = {
      open: false,
      space: 'iram',
      page: 0,
      showRegs: true,
      showPorts: false,
      showTimers: false
    };
    this.toggle = this.toggle.bind(this);
  }
  tx(key) {
    const table = L10N[this.props.locale] || L10N.en;
    return table[key] || L10N.en[key];
  }
  toggle() {
    this.setState(s => ({
      open: !s.open
    }));
  }

  /** Ask the user for a hex address. A prompt is honest about being a stopgap. */
  askAddress(label, fallback) {
    const raw = window.prompt("".concat(label, " (hex)"), (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(fallback || 0));
    if (raw === null) return null;
    const n = parseInt(String(raw).replace(/^0x/i, ''), 16);
    return Number.isFinite(n) ? n & 0xFFFF : null;
  }
  renderControls() {
    const {
      runner
    } = this.props;
    const caps = this.props.ui && this.props.ui.capabilities || null;
    const can = kind => !caps || caps.steps.includes(kind);
    const off = _objectSpread(_objectSpread({}, BTN), {}, {
      color: '#4a5568',
      cursor: 'not-allowed'
    });
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 5,
        flexWrap: 'wrap',
        marginBottom: 8
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      onClick: () => runner.stepInstruction(1)
    }, this.tx('stepInsn')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: can('over') ? BTN : off,
      disabled: !can('over'),
      title: can('over') ? 'Run until SP returns to its current depth' : 'This target cannot step over',
      onClick: () => runner.stepOver()
    }, this.tx('over')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: can('out') ? BTN : off,
      disabled: !can('out'),
      onClick: () => runner.stepOut()
    }, this.tx('out')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      onClick: () => {
        const a = this.askAddress(this.tx('setPc'), this.currentPc());
        if (a !== null) runner.setPc(a);
      }
    }, this.tx('setPc')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      onClick: () => runner.resetCpu()
    }, this.tx('reset')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      onClick: () => runner.wipe()
    }, this.tx('wipe')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      title: this.tx('tenHint'),
      onClick: () => runner.stepInstruction(10)
    }, this.tx('stepTen')));
  }
  currentPc() {
    const snap = this.props.runner.inspect();
    return snap ? snap.pc : 0;
  }
  renderTrace() {
    const {
      runner
    } = this.props;
    const rows = runner.trace();
    const {
      showRegs,
      showPorts,
      showTimers
    } = this.state;
    const dropped = runner.traceDropped();
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, PANE), {}, {
        maxHeight: 260
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, TITLE), {}, {
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", null, this.tx('trace')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        marginLeft: 'auto',
        textTransform: 'none'
      }
    }, this.tx('cols'), [['showRegs', 'regs'], ['showPorts', 'ports'], ['showTimers', 'timers']].map(_ref => {
      let [key, label] = _ref;
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("label", {
        key: key,
        style: {
          marginLeft: 6
        }
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("input", {
        type: "checkbox",
        checked: this.state[key],
        onChange: () => this.setState(s => ({
          [key]: !s[key]
        }))
      }), this.tx(label));
    })), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      title: this.tx('csvTitle'),
      disabled: !rows.length,
      onClick: () => (0,_lib_bw_debug_trace_csv_js__WEBPACK_IMPORTED_MODULE_3__.downloadTraceCsv)(rows, "bw-trace-".concat(new Date().toISOString().replace(/[:.]/g, '-'), ".csv"))
    }, 'CSV'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      onClick: () => runner.clearTrace()
    }, this.tx('clear'))), !rows.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e'
      }
    }, this.tx('empty')) : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("table", {
      style: {
        borderCollapse: 'collapse',
        width: '100%'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("thead", null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("tr", {
      style: {
        color: '#7f8c8d'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      style: CELL
    }, 'PC'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      style: _objectSpread(_objectSpread({}, CELL), {}, {
        textAlign: 'left'
      })
    }, 'Opcodes'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      style: _objectSpread(_objectSpread({}, CELL), {}, {
        textAlign: 'left'
      })
    }, 'Assembly'), showRegs ? ['A', 'B', 'DPTR', 'SP', 'PSW'].map(h => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      key: h,
      style: CELL
    }, h)) : null, showRegs ? [0, 1, 2, 3, 4, 5, 6, 7].map(n => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      key: n,
      style: CELL
    }, "R".concat(n))) : null, showPorts ? _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.IO_SFRS.map(s => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      key: s.name,
      style: CELL
    }, s.name)) : null, showTimers ? _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.TIMER_SFRS.map(s => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("th", {
      key: s.name,
      style: CELL
    }, s.name)) : null)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("tbody", null, rows.slice(-200).map(row => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("tr", {
      key: row.seq,
      style: {
        color: '#ecf0f1'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      style: _objectSpread(_objectSpread({}, CELL), {}, {
        color: '#3498db'
      })
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(row.pc)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      style: _objectSpread(_objectSpread({}, CELL), {}, {
        textAlign: 'left',
        color: '#7f8c8d'
      })
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.formatBytes)(row.bytes)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      style: _objectSpread(_objectSpread({}, CELL), {}, {
        textAlign: 'left'
      })
    }, row.text), showRegs ? [/*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: "a",
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(row.a)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: "b",
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(row.b)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: "d",
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(row.dptr)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: "s",
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(row.sp)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: "p",
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(row.psw))] : null, showRegs ? row.r.map((v, n) => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: "r".concat(n),
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(v))) : null, showPorts ? _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.IO_SFRS.map(s => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: s.name,
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(row.sfr[s.name]))) : null, showTimers ? _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.TIMER_SFRS.map(s => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      key: s.name,
      style: CELL
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(row.sfr[s.name]))) : null)))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e',
        marginTop: 6,
        fontSize: 10
      }
    }, dropped ? "".concat(dropped, " ").concat(this.tx('dropped'), ". ") : '', this.tx('gapNote')));
  }

  /**
   * Write a register by writing where it LIVES. Every 8051 register is a
   * memory location — the accumulator is SFR 0xE0, R3 is internal RAM at
   * bank×8+3 — so editing one needs no new emulator API, and going through
   * the same writeMem the hex view uses means the two can never disagree
   * about what a register is.
   */
  editRegister(name, value, where) {
    const raw = window.prompt("".concat(name), where.wide ? (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(value) : (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(value));
    if (raw === null) return;
    const v = parseInt(String(raw).replace(/^0x/i, ''), 16);
    if (!Number.isFinite(v)) return;
    if (where.wide) {
      this.props.runner.writeMem(where.space, where.addr, v >> 8 & 0xFF);
      this.props.runner.writeMem(where.space, where.addr + 1, v & 0xFF);
    } else {
      this.props.runner.writeMem(where.space, where.addr, v);
    }
    this.forceUpdate();
  }

  /**
   * Where the program is, in code.
   *
   * The trace pane is history; this is the present, and every debugger has
   * one. It is anchored at the PC and walks FORWARD with the opcode length
   * table — an 8051 cannot be disassembled backwards, since instructions are
   * one to three bytes and nothing marks where one starts. Showing a window
   * that pretends to include earlier instructions would be guessing.
   *
   * Clicking a line sets or clears a breakpoint there, which is why the
   * drawer needs no "type an address" dialog for the common case.
   */
  renderCode() {
    const {
      runner,
      ui
    } = this.props;
    const snap = runner.inspect();
    if (!snap) return null;
    const rows = runner.listing(snap.pc, 12);
    // A target without a disassembler (AVR, RP2040) yields no listing —
    // say so instead of an empty pane, and never crash the app over it.
    if (!rows.length) {
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        style: _objectSpread(_objectSpread({}, PANE), {}, {
          maxHeight: 240
        })
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        style: TITLE
      }, this.tx('code')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        style: {
          opacity: 0.7,
          fontStyle: 'italic'
        }
      }, 'no disassembly on this target'));
    }
    const bps = new Set(runner.addressBreakpoints());
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, PANE), {}, {
        maxHeight: 240
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: TITLE
    }, this.tx('code')), rows.map((r, i) => {
      const here = r.addr === snap.pc;
      const marked = bps.has(r.addr);
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        key: r.addr,
        role: "button",
        tabIndex: -1,
        title: this.tx('clickBreak'),
        onClick: () => {
          runner.toggleAddressBreakpoint(r.addr);
          this.forceUpdate();
        },
        style: {
          display: 'flex',
          gap: 8,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          background: here ? '#1e3a5f' : 'transparent',
          borderLeft: "3px solid ".concat(marked ? '#e74c3c' : 'transparent'),
          paddingLeft: 4
        }
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: here ? '#f39c12' : '#5d6d7e',
          width: 12
        }
      }, here ? '▶' : marked ? '●' : ''), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#3498db'
        }
      }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(r.addr)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#5d6d7e'
        }
      }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.formatBytes)(r.bytes)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: here ? '#ecf0f1' : '#bdc3c7'
        }
      }, r.text), i === 0 && ui && ui.session && ui.session.tasks ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          marginLeft: 'auto',
          color: '#7f8c8d',
          fontSize: 10
        }
      }, ui.session.tasks.filter(t => t.state !== 0xFFFF).map(t => "".concat(t.task, ":").concat(t.state)).join(' ')) : null);
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e',
        marginTop: 6,
        fontSize: 10
      }
    }, this.tx('codeNote')));
  }
  renderNow() {
    const snap = this.props.runner.inspect();
    if (!snap) return null;
    const {
      regs
    } = snap;
    if (snap.flavor === 'generic') return this.renderNowGeneric(regs);
    const editable = (name, value, where) => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      key: name,
      role: "button",
      tabIndex: -1,
      title: this.tx('editHint'),
      style: {
        cursor: 'pointer'
      },
      onClick: () => this.editRegister(name, value, where)
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#7f8c8d'
      }
    }, "".concat(name, " ")), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#ecf0f1',
        borderBottom: '1px dotted #2c3e50'
      }
    }, where.wide ? (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(value) : (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(value)));
    // DPH is 0x83 and DPL 0x82, so a 16-bit DPTR is written high byte first
    // at 0x83 — hence `wide` writing addr then addr+1 with DPH given first.
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: PANE
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: TITLE
    }, this.tx('now')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 6
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      role: "button",
      tabIndex: -1,
      title: this.tx('setPc'),
      style: {
        cursor: 'pointer'
      },
      onClick: () => {
        const a = this.askAddress(this.tx('setPc'), regs.pc);
        if (a !== null) {
          this.props.runner.setPc(a);
          this.forceUpdate();
        }
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#7f8c8d'
      }
    }, 'PC '), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#ecf0f1',
        borderBottom: '1px dotted #2c3e50'
      }
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(regs.pc))), editable('A', regs.a, {
      space: 'sfr',
      addr: 0xE0
    }), editable('B', regs.b, {
      space: 'sfr',
      addr: 0xF0
    }), editable('DPTR', regs.dptr, {
      space: 'sfr',
      addr: 0x83,
      wide: true
    }), editable('SP', regs.sp, {
      space: 'sfr',
      addr: 0x81
    }), editable('PSW', regs.psw, {
      space: 'sfr',
      addr: 0xD0
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#f39c12'
      }
    }, "".concat(this.tx('bank'), " ").concat(regs.bank))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 6
      }
    }, regs.r.map((v, n) => editable("R".concat(n), v, {
      space: 'iram',
      addr: regs.bank * 8 + n
    }))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap'
      }
    }, _lib_bw_debug_opcodes_js__WEBPACK_IMPORTED_MODULE_2__.PSW_BITS.map(b => {
      const on = regs.psw >> b.bit & 1;
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        key: b.name,
        title: b.title,
        style: {
          padding: '1px 5px',
          borderRadius: 3,
          border: '1px solid #2c3e50',
          background: on ? '#1e5631' : 'transparent',
          color: on ? '#2ecc71' : '#5d6d7e'
        }
      }, b.name);
    })));
  }

  // The machine targets' registers, as the target names them — PC stays
  // editable (setPc is generic); everything else reads out. 16-bit when the
  // name says so or the value needs it.
  renderNowGeneric(regs) {
    const WIDE = new Set(['pc', 'sp', 'bc', 'de', 'hl', 'ix', 'iy', 'af_', 'bc_', 'de_', 'hl_', 'dptr']);
    const entries = Object.entries(regs).filter(_ref2 => {
      let [k, v] = _ref2;
      return k !== 'cycles' && (typeof v === 'number' || typeof v === 'boolean');
    });
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: PANE
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: TITLE
    }, this.tx('now')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      role: "button",
      tabIndex: -1,
      title: this.tx('setPc'),
      style: {
        cursor: 'pointer'
      },
      onClick: () => {
        const a = this.askAddress(this.tx('setPc'), regs.pc);
        if (a !== null) {
          this.props.runner.setPc(a);
          this.forceUpdate();
        }
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#7f8c8d'
      }
    }, 'PC '), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#ecf0f1',
        borderBottom: '1px dotted #2c3e50'
      }
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(regs.pc))), entries.filter(_ref3 => {
      let [k] = _ref3;
      return k !== 'pc';
    }).map(_ref4 => {
      let [k, v] = _ref4;
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        key: k
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#7f8c8d'
        }
      }, "".concat(k.toUpperCase().replace(/_$/, "'"), " ")), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#ecf0f1'
        }
      }, typeof v === 'boolean' ? v ? '1' : '0' : WIDE.has(k) || v > 0xFF ? (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(v) : (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(v)));
    })));
  }
  renderSfrs() {
    const snap = this.props.runner.inspect();
    if (!snap || !snap.sfr) return null;
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: PANE
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: TITLE
    }, this.tx('sfrs')), [['I/O', _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.IO_SFRS], ['Timers / serial', _lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.TIMER_SFRS]].map(_ref5 => {
      let [group, list] = _ref5;
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        key: group,
        style: {
          marginBottom: 6
        }
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        style: {
          color: '#5d6d7e',
          fontSize: 10
        }
      }, group), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        style: {
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap'
        }
      }, list.map(s => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        key: s.name,
        title: "".concat((0,_lib_bw_debug_opcodes_js__WEBPACK_IMPORTED_MODULE_2__.sfrName)(s.addr), " @ 0x").concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(s.addr))
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#7f8c8d'
        }
      }, "".concat(s.name, " ")), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#ecf0f1'
        }
      }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(snap.sfr[s.name]))))));
    }));
  }
  renderStack() {
    const snap = this.props.runner.inspect();
    if (!snap || !snap.stack) return null;
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, PANE), {}, {
        maxHeight: 160
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: TITLE
    }, this.tx('stack')), !snap.stack.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e'
      }
    }, 'empty') : snap.stack.slice().reverse().map(e => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      key: e.addr
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#7f8c8d'
      }
    }, "".concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(e.addr), " ")), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: e.addr === snap.regs.sp ? '#f39c12' : '#ecf0f1'
      }
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(e.value)))));
  }
  renderMemory() {
    const {
      runner
    } = this.props;
    const snap = runner.inspect();
    const spaces = snap && snap.flavor === 'generic' ? MACHINE_SPACES : SPACES;
    const spec = spaces.find(s => s.id === this.state.space) || spaces[0];
    const base = spec.base || 0;
    const perPage = 128;
    const start = base + this.state.page * perPage;
    const bytes = runner.readMem(spec.id, start, perPage);
    const rows = [];
    for (let i = 0; i < bytes.length; i += 16) rows.push({
      addr: start + i,
      data: bytes.slice(i, i + 16)
    });
    const pages = Math.ceil(spec.size / perPage);
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, PANE), {}, {
        maxHeight: 240
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, TITLE), {}, {
        display: 'flex',
        gap: 8,
        alignItems: 'center'
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", null, this.tx('memory')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("select", {
      value: spec.id,
      onChange: e => this.setState({
        space: e.target.value,
        page: 0
      }),
      style: _objectSpread(_objectSpread({}, BTN), {}, {
        textTransform: 'none'
      })
    }, spaces.map(s => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("option", {
      key: s.id,
      value: s.id
    }, s.label))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      disabled: this.state.page === 0,
      onClick: () => this.setState(s => ({
        page: Math.max(0, s.page - 1)
      }))
    }, '◀'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", null, "".concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(start), "\u2013").concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(start + perPage - 1))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: BTN,
      disabled: this.state.page >= pages - 1,
      onClick: () => this.setState(s => ({
        page: Math.min(pages - 1, s.page + 1)
      }))
    }, '▶')), rows.map(row => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      key: row.addr,
      style: {
        whiteSpace: 'nowrap'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#3498db'
      }
    }, "".concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(row.addr), "  ")), row.data.map((b, i) => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      key: i,
      role: "button",
      tabIndex: -1,
      title: "".concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(row.addr + i), " \u2014 ").concat(this.tx('editHint')),
      style: {
        color: b ? '#ecf0f1' : '#4a5568',
        cursor: 'pointer',
        padding: '0 2px'
      },
      onClick: () => {
        const raw = window.prompt("".concat(spec.label, " ").concat((0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex16)(row.addr + i)), (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(b));
        if (raw === null) return;
        const v = parseInt(String(raw).replace(/^0x/i, ''), 16);
        if (Number.isFinite(v)) {
          runner.writeMem(spec.id, row.addr + i, v);
          this.forceUpdate();
        }
      }
    }, (0,_lib_bw_debug_trace_js__WEBPACK_IMPORTED_MODULE_1__.hex8)(b))))), spec.id === 'sfr' || spec.id === 'iram' ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e',
        marginTop: 6,
        fontSize: 10
      }
    }, this.tx('spaceNote')) : null);
  }
  renderClock() {
    const snap = this.props.runner.inspect();
    if (!snap) return null;
    const ms = Number(snap.tNs) / 1e6;
    const hz = this.props.clockHz || 11059200;
    // The TUI shows "Cycles"; this emulator counts nanoseconds, so cycles
    // are derived rather than read. Stated, not silently presented as if
    // counted.
    const cycles = Math.round(Number(snap.tNs) / 1e9 * hz);
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: PANE
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: TITLE
    }, this.tx('clock')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", null, "".concat(ms.toFixed(3), " ").concat(this.tx('ms'))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#7f8c8d'
      }
    }, "".concat(cycles.toLocaleString(), " ").concat(this.tx('cycles'), " @ ").concat((hz / 1e6).toFixed(3), " MHz")));
  }
  render() {
    const {
      runner
    } = this.props;
    if (!runner) return null;
    const {
      open
    } = this.state;
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        marginTop: 8
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: _objectSpread(_objectSpread({}, BTN), {}, {
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px'
      }),
      onClick: this.toggle
    }, open ? '▾ ' : '▸ ', this.tx('title')), !open ? null : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 8
      }
    }, this.renderControls(), this.renderCode(), this.renderTrace(), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'grid',
        gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
      }
    }, this.renderNow(), this.renderSfrs(), this.renderStack(), this.renderClock()), this.renderMemory()));
  }
}
DebugDrawer.propTypes = {
  runner: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().object),
  ui: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().object),
  locale: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().string),
  clockHz: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().number)
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (DebugDrawer);

/***/ }),

/***/ "./src/components/tw-pseudocode/debug-inspector.jsx":
/*!**********************************************************!*\
  !*** ./src/components/tw-pseudocode/debug-inspector.jsx ***!
  \**********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! prop-types */ "./node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_1__);
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }



/**
 * What is happening — the layer a debugger for this audience should LEAD with.
 *
 * The drawer next door is emu8051's TUI: PC, A, DPTR, SFRs, hex. It is correct
 * and it is the wrong first thing to show someone who has just written
 * `change counter by 1`. Every mature debugger — DevTools, VS Code — puts the
 * user's own nouns first and the machine's underneath, and the only reason this
 * one could not was that nothing knew which memory held `counter`. Now the
 * symbol table carries the name the user typed, so it can.
 *
 * Three ideas, in the order they earn their place:
 *
 * 1. **Their nouns, not the machine's.** Variables by the name they typed; pins
 *    as physical facts — `led1 is on`, `pot is at 2.47 V` — with the active-low
 *    inversion already applied, because "P1.0 = 0" teaches the opposite of what
 *    the board is for.
 *
 * 2. **Change, not just state.** A value that moved since the last stop is
 *    marked, with its previous value beside it. Seeing WHAT CHANGED is most of
 *    debugging; a wall of identical numbers is not.
 *
 * 3. **Time travel.** The trace already records a full snapshot at every stop,
 *    so the timeline can scrub back through them. This is the one genuinely
 *    modern debugger idea (Redux DevTools, Replay, rr) and here it is nearly
 *    free — the recording exists, it only needed an axis. Scrubbing is
 *    explicitly READ-ONLY and says so: the program is not being rewound, you
 *    are looking at what was recorded. Claiming otherwise would be the same
 *    class of lie as a multimeter reading ohms on a live circuit.
 */

const CARD = {
  background: '#12121f',
  border: '1px solid #2c3e50',
  borderRadius: 8,
  padding: 10
};
const LABEL = {
  color: '#7f8c8d',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 8
};
const NAME = {
  color: '#bdc3c7',
  fontFamily: 'inherit'
};
const VALUE = {
  fontFamily: 'monospace',
  fontSize: 15,
  color: '#ecf0f1',
  fontWeight: 600
};
const CHANGED = _objectSpread(_objectSpread({}, VALUE), {}, {
  color: '#f39c12'
});
const L10N = {
  en: {
    vars: 'Variables',
    pins: 'Pins',
    timeline: 'Timeline',
    noVars: 'This project has no variables yet.',
    noPins: 'No pins declared.',
    was: 'was',
    on: 'on',
    off: 'off',
    live: 'live',
    past: 'looking at the past',
    now: 'Now',
    stops: 'stops recorded',
    scrubHint: 'Drag to look back through recorded stops. The program is not rewound — ' + 'this is what was recorded then.',
    activeLow: 'active low: the pin drives 0 to turn it on',
    analog: 'analog input',
    input: 'input',
    output: 'output',
    nothing: 'Run the program to see values here.'
  },
  de: {
    vars: 'Variablen',
    pins: 'Pins',
    timeline: 'Zeitachse',
    noVars: 'Dieses Projekt hat noch keine Variablen.',
    noPins: 'Keine Pins deklariert.',
    was: 'war',
    on: 'an',
    off: 'aus',
    live: 'aktuell',
    past: 'Blick in die Vergangenheit',
    now: 'Jetzt',
    stops: 'Haltepunkte aufgezeichnet',
    scrubHint: 'Ziehen, um aufgezeichnete Haltepunkte anzusehen. Das Programm wird nicht ' + 'zurückgespult — das ist, was damals aufgezeichnet wurde.',
    activeLow: 'aktiv niedrig: der Pin schreibt 0 zum Einschalten',
    analog: 'Analogeingang',
    input: 'Eingang',
    output: 'Ausgang',
    nothing: 'Programm starten, um hier Werte zu sehen.'
  }
};
class DebugInspector extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    // null = live. A number = an index into the trace, i.e. the past.
    this.state = {
      scrubIndex: null
    };
    this.onScrub = this.onScrub.bind(this);
    this.toLive = this.toLive.bind(this);
  }
  tx(key) {
    const table = L10N[this.props.locale] || L10N.en;
    return table[key] || L10N.en[key];
  }
  onScrub(e) {
    const rows = this.props.runner.trace();
    const i = Number(e.target.value);
    this.setState({
      scrubIndex: i >= rows.length - 1 ? null : i
    });
  }
  toLive() {
    this.setState({
      scrubIndex: null
    });
  }

  /**
   * The values to render, and the ones before them.
   *
   * Live: current values, compared against the last recorded stop. Scrubbed:
   * the chosen row, compared against the row before it — so "what changed"
   * means the same thing in both, which is what makes the timeline readable.
   */
  valuesAndPrevious() {
    const {
      runner
    } = this.props;
    const rows = runner.trace().filter(r => r.variables);
    const {
      scrubIndex
    } = this.state;
    if (scrubIndex === null) {
      return {
        variables: runner.variables(),
        previous: rows.length ? rows[rows.length - 1].variables : null,
        live: true,
        rows
      };
    }
    const i = Math.min(scrubIndex, rows.length - 1);
    return {
      variables: rows[i] ? rows[i].variables : [],
      previous: i > 0 ? rows[i - 1].variables : null,
      live: false,
      rows,
      row: rows[i]
    };
  }
  renderTimeline(rows, live) {
    if (rows.length < 2) return null;
    const value = this.state.scrubIndex === null ? rows.length - 1 : this.state.scrubIndex;
    const row = rows[Math.min(value, rows.length - 1)];
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, CARD), {}, {
        marginBottom: 8
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: _objectSpread(_objectSpread({}, LABEL), {}, {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", null, this.tx('timeline')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        marginLeft: 'auto',
        textTransform: 'none',
        letterSpacing: 0,
        color: live ? '#2ecc71' : '#f39c12'
      }
    }, live ? this.tx('live') : this.tx('past')), live ? null : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      onClick: this.toLive,
      style: {
        padding: '2px 8px',
        borderRadius: 3,
        cursor: 'pointer',
        border: '1px solid #2c3e50',
        background: '#16213e',
        color: '#ecf0f1',
        fontSize: 11,
        textTransform: 'none'
      }
    }, "\u21E5 ".concat(this.tx('now')))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("input", {
      type: "range",
      min: 0,
      max: rows.length - 1,
      value: value,
      onChange: this.onScrub,
      style: {
        width: '100%'
      },
      "aria-label": this.tx('timeline')
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        fontSize: 11,
        color: '#7f8c8d'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", null, "".concat(rows.length, " ").concat(this.tx('stops'))), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        marginLeft: 'auto',
        fontFamily: 'monospace'
      }
    }, row ? "".concat((Number(row.tNs) / 1e6).toFixed(2), " ms \xB7 ").concat(row.why) : '')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        fontSize: 11,
        color: '#5d6d7e',
        marginTop: 4
      }
    }, this.tx('scrubHint')));
  }
  renderVariables(variables, previous) {
    const prev = new Map((previous || []).map(v => [v.name, v.value]));
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: CARD
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: LABEL
    }, this.tx('vars')), !variables.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e',
        fontSize: 12
      }
    }, this.tx('noVars')) : variables.map(v => {
      const before = prev.has(v.name) ? prev.get(v.name) : null;
      const moved = before !== null && before !== v.value;
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        key: "".concat(v.sprite || '').concat(v.name),
        style: {
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          padding: '3px 0'
        },
        title: v.where
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: NAME
      }, v.name), v.sprite ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#5d6d7e',
          fontSize: 11
        }
      }, v.sprite) : null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          marginLeft: 'auto',
          textAlign: 'right'
        }
      }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: moved ? CHANGED : VALUE
      }, v.value), moved ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#5d6d7e',
          fontSize: 11,
          marginLeft: 6
        }
      }, "".concat(this.tx('was'), " ").concat(before)) : null));
    }));
  }
  renderPins() {
    const pins = this.props.runner.pins();
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: CARD
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: LABEL
    }, this.tx('pins')), !pins.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e',
        fontSize: 12
      }
    }, this.tx('noPins')) : pins.map(p => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      key: p.pin,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 0'
      },
      title: p.activeLow ? this.tx('activeLow') : ''
    }, p.direction === 'analog' ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: 2,
        background: '#3498db',
        display: 'inline-block'
      }
    }) : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        display: 'inline-block',
        background: p.on ? '#2ecc71' : '#2c3e50',
        boxShadow: p.on ? '0 0 6px #2ecc71' : 'none'
      }
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: NAME
    }, p.name), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#5d6d7e',
        fontSize: 11,
        fontFamily: 'monospace'
      }
    }, p.pin), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: _objectSpread(_objectSpread({
        marginLeft: 'auto'
      }, VALUE), {}, {
        fontSize: 13
      })
    }, p.direction === 'analog' ? p.volts === undefined ? '—' : "".concat(p.volts.toFixed(2), " V") : p.on === undefined ? '—' : p.on ? this.tx('on') : this.tx('off')), p.activeLow ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#5d6d7e',
        fontSize: 10
      }
    }, '⌄0') : null)));
  }
  render() {
    const {
      runner
    } = this.props;
    if (!runner) return null;
    const {
      variables,
      previous,
      live,
      rows
    } = this.valuesAndPrevious();
    const started = rows.length > 0 || variables.length > 0;
    if (!started) {
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        style: _objectSpread(_objectSpread({}, CARD), {}, {
          color: '#5d6d7e',
          fontSize: 12
        })
      }, this.tx('nothing'));
    }
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", null, this.renderTimeline(rows, live), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'grid',
        gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
      }
    }, this.renderVariables(variables, previous), live ? this.renderPins() : null));
  }
}
DebugInspector.propTypes = {
  runner: (prop_types__WEBPACK_IMPORTED_MODULE_1___default().object),
  locale: (prop_types__WEBPACK_IMPORTED_MODULE_1___default().string)
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (DebugInspector);

/***/ }),

/***/ "./src/components/tw-pseudocode/debug-panel.jsx":
/*!******************************************************!*\
  !*** ./src/components/tw-pseudocode/debug-panel.jsx ***!
  \******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! prop-types */ "./node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react_redux__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react-redux */ "./node_modules/react-redux/es/index.js");
/* harmony import */ var _debug_drawer_jsx__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./debug-drawer.jsx */ "./src/components/tw-pseudocode/debug-drawer.jsx");
/* harmony import */ var _debug_inspector_jsx__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./debug-inspector.jsx */ "./src/components/tw-pseudocode/debug-inspector.jsx");
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }






// VDP screen — lazy-loaded, only renders when the runner has video output.
const VdpScreen = /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.lazy(() => Promise.all(/*! import() | bw-circuit-ui */[__webpack_require__.e("vendors-node_modules_wokwi_elements_dist_esm_7segment-element_js-node_modules_wokwi_elements_-6e1c0c"), __webpack_require__.e("bw-circuit-ui")]).then(__webpack_require__.bind(__webpack_require__, /*! ../../lib/bw-circuit-ui/components/VdpScreen.jsx */ "./src/lib/bw-circuit-ui/components/VdpScreen.jsx")).then(m => ({
  default: m.VdpScreen
})));

/**
 * The debugger's controls: ⚑ ⏸ ⏭ ⏹, a speed dial, and what the program is doing.
 *
 * Design: `sb3-creator/reference/debugger-ui.md`. Two things it deliberately gets right:
 *
 * 1. **`block` is the only step verb here.** It is the one kind every target supports —
 *    emulator, ucsim, and the on-chip monitor — and "run to the next yield" is what a
 *    Scratch user means by "next". `insn` / `over` / `out` belong in the advanced drawer,
 *    which does not exist yet; `line` is refused outright by the target and is not offered.
 * 2. **A control that cannot work says why.** Capabilities are queried, never assumed, and
 *    a disabled button carries its reason in the tooltip. A dead button that explains
 *    itself teaches the hardware; a dead button that does not reads as a bug.
 *
 * **Why it lives in the Circuit tab rather than the stage header**, which is what the design
 * note describes: the stage header is shown for EVERY project, including pure Scratch ones,
 * where a debugger strip is meaningless. Putting it there means teaching shared chrome to
 * detect hardware projects. The Circuit tab is already the hardware surface, already gated,
 * and already shows the board you want to watch while stepping. The glow lands in the Blocks
 * tab either way — `vm.runtime.glowBlock` does not care which tab is open. Moving the strip
 * into the stage header, once the chrome knows what an STC project is, changes nothing here.
 */

const L10N = {
  en: {
    run: 'Run',
    pause: 'Pause',
    step: 'Step',
    stop: 'Stop',
    speed: 'Speed',
    idle: 'not running',
    building: 'building…',
    attaching: 'starting…',
    ready: 'ready',
    running: 'running',
    paused: 'paused',
    stepping: 'stepping…',
    error: 'error',
    stepHint: 'Run to the next block boundary',
    serialHint: 'type a line, Enter sends it',
    serialSend: 'Send this line to the machine (ends with CR)',
    consumes: 'Debugging this board uses:',
    pausedAt: 'Paused at',
    afterMs: 'after',
    noPins: 'Declare pins in the Code tab to debug this project.',
    bps: 'Pause points',
    noBps: 'Right-click a block and choose “Pause here”.',
    skipped: 'hits passed over — a wait is re-entered constantly, and conditions filter the rest',
    unreachable: 'cannot be stopped at',
    unreachableWhy: 'The program only stops at a wait or a loop, so these marks have ' + 'nowhere to land in this build. They are kept in case a later edit gives them one.',
    yieldNote: 'The program can only stop at a wait or a loop — so the highlight marks ' + 'the last one it passed, not every block in between.'
  },
  de: {
    run: 'Start',
    pause: 'Pause',
    step: 'Schritt',
    stop: 'Stopp',
    speed: 'Tempo',
    idle: 'läuft nicht',
    building: 'wird gebaut…',
    attaching: 'startet…',
    ready: 'bereit',
    running: 'läuft',
    paused: 'angehalten',
    stepping: 'Schritt…',
    error: 'Fehler',
    stepHint: 'Bis zur nächsten Blockgrenze laufen',
    serialHint: 'Zeile eingeben, Enter sendet',
    serialSend: 'Diese Zeile an die Maschine senden (endet mit CR)',
    consumes: 'Das Debuggen dieser Platine belegt:',
    pausedAt: 'Angehalten bei',
    afterMs: 'nach',
    noPins: 'Für das Debuggen im Code-Tab Pins deklarieren.',
    bps: 'Haltepunkte',
    noBps: 'Rechtsklick auf einen Block, dann „Hier anhalten“.',
    skipped: 'übergangene Treffer — ein Warten wird ständig neu betreten, Bedingungen filtern den Rest',
    unreachable: 'nicht anhaltbar',
    unreachableWhy: 'Das Programm hält nur bei einem Warten oder einer Schleife an; diese ' + 'Markierungen haben in diesem Build keinen Platz. Sie bleiben erhalten, falls eine ' + 'spätere Änderung einen schafft.',
    yieldNote: 'Das Programm kann nur bei einem Warten oder einer Schleife anhalten — die ' + 'Markierung zeigt also die letzte solche Stelle, nicht jeden Block dazwischen.'
  }
};
const BTN = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid #2c3e50',
  background: '#16213e',
  color: '#ecf0f1',
  fontFamily: 'monospace',
  fontSize: 12,
  cursor: 'pointer'
};
const OFF = _objectSpread(_objectSpread({}, BTN), {}, {
  color: '#4a5568',
  cursor: 'not-allowed'
});
class DebugPanel extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    // The target is chosen BEFORE a runner exists, so it lives here rather
    // than in the runner: picking "Live board" and then pressing Run is the
    // order a user works in.
    this.state = {
      runner: null,
      ui: {
        phase: 'idle',
        message: ''
      },
      kind: 'emulator',
      kinds: null,
      machineConfig: null,
      serialInput: ''
    };
    this.onStart = this.onStart.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onStep = this.onStep.bind(this);
    this.onStop = this.onStop.bind(this);
    this.onSpeed = this.onSpeed.bind(this);
    this.onSerialInput = this.onSerialInput.bind(this);
    this.onSerialKeyDown = this.onSerialKeyDown.bind(this);
    this.onSerialSend = this.onSerialSend.bind(this);
    this.syncProjectTokens = this.syncProjectTokens.bind(this);
    this._onMachineExtracted = this._onMachineExtracted.bind(this);
    this._onMediaLoad = this._onMediaLoad.bind(this);
    this._onAsmRomReady = this._onAsmRomReady.bind(this);
    /** Boot image handed over by the Machine Loader / ASM tab —
     *  {slot, bytes, profile, name}. Kept off state: the bytes are
     *  runner input, not render input. */
    this._bootMedia = null;
    /** STABLE identity, bound once: the panel re-renders on every
     *  runner emit (rAF cadence), and an inline arrow here gave
     *  VdpScreen a new videoFn each render — its paint effect then
     *  cancelled and rescheduled its own rAF every frame, so the
     *  paint callback never once ran and the screen stayed black
     *  while the machine rendered perfect frames behind it. */
    this._videoFn = () => {
      const r = this.state.runner;
      return r && typeof r.video === 'function' ? r.video() : null;
    };
  }

  /** Build Machine succeeded: the bus extractor's {regions, chips}.
   *  Stored, and any live runner destroyed, so the NEXT boot threads
   *  the config into createDebugTarget — the machine the user wired,
   *  not a hardcoded preset. */
  _onMachineExtracted(e) {
    const detail = e.detail || {};
    if (!detail.config) return;
    this._teardownRunner();
    this._bootMedia = null;
    const kind = detail.kind === 'z80' ? 'z80' : detail.kind === 'eater6502' || detail.kind === '6502' ? 'eater6502' : this.state.kind;
    this.setState({
      machineConfig: detail.config,
      kind,
      runner: null,
      ui: {
        phase: 'idle',
        message: 'machine extracted — load a program (presets, file, or ASM tab)'
      }
    });
  }

  /** Machine Loader (presets / file picker) delivered an image. The
   *  runner is recreated rather than hot-patched: config and image
   *  must boot TOGETHER so the CPU reads its reset vector from the
   *  real bytes, not from a zero-filled ROM it booted with earlier. */
  _onMediaLoad(e) {
    var _this = this;
    return _asyncToGenerator(function* () {
      const {
        slotId,
        bytes,
        kind,
        profile,
        name
      } = e.detail || {};
      if (!bytes) return;
      _this._teardownRunner();
      _this._bootMedia = {
        slot: slotId,
        bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
        profile: profile || null,
        name: name || null
      };
      const nextKind = kind === 'z80' ? 'z80' : kind === 'eater6502' || kind === '6502' ? 'eater6502' : _this.state.kind;
      yield new Promise(resolve => _this.setState({
        kind: nextKind,
        runner: null,
        ui: {
          phase: 'idle',
          message: ''
        }
      }, resolve));
      const runner = yield _this.runner();
      yield runner.start();
    })();
  }

  /** ASM tab assembled a binary — same delivery path as the loader. */
  _onAsmRomReady(e) {
    const {
      rom,
      target
    } = e.detail || {};
    if (!rom) return;
    this._onMediaLoad({
      detail: {
        slotId: 'rom',
        bytes: rom,
        kind: target === 'z80' ? 'z80' : 'eater6502',
        name: 'assembled image'
      }
    });
  }
  componentDidMount() {
    this.syncDeviceKind();
    // A NEW PROGRAM must not debug through the OLD program's runner:
    // loading an example kept the previous runner alive whenever the
    // device stayed the same, and the PINS panel showed the former
    // example's pins (owner report, 2026-08-17). Keyed on the pin
    // SIGNATURE, not the event alone — PROJECT_CHANGED also fires on
    // every block edit, and killing a live run for an unrelated edit
    // would be worse than the staleness.
    const rt0 = this.props.vm && this.props.vm.runtime;
    this._pinSig = JSON.stringify(rt0 && rt0.stc && rt0.stc.pins || []);
    this._onProjectChanged = () => {
      const rt = this.props.vm && this.props.vm.runtime;
      const sig = JSON.stringify(rt && rt.stc && rt.stc.pins || []);
      if (sig === this._pinSig) return;
      this._pinSig = sig;
      this._teardownRunner();
      this.setState({
        runner: null,
        ui: {
          phase: 'idle',
          message: ''
        }
      });
    };
    if (rt0 && rt0.on) rt0.on('PROJECT_CHANGED', this._onProjectChanged);
    // The runner announces WHICH board it drives (designer / example /
    // inferred). An inferred LED-per-pin board must announce itself in
    // red instead of impersonating the example's circuit.
    this._onBoardSource = e => this.setState({
      boardSource: e.detail && e.detail.source || null
    });
    window.addEventListener('bw-board-source', this._onBoardSource);
    if (window.__bwBoardSource) this.setState({
      boardSource: window.__bwBoardSource.source
    });
    // The machine-bench pipeline: Build Machine → config; Machine
    // Loader / ASM tab → image; both meet in _onMediaLoad's reboot.
    window.addEventListener('bw-machine-extracted', this._onMachineExtracted);
    window.addEventListener('bw-machine-media-load', this._onMediaLoad);
    window.addEventListener('bw-asm-rom-ready', this._onAsmRomReady);
    // Replay what was dispatched before this panel existed: the panel
    // mounts LAZILY in response to bw-machine-extracted, so the first
    // of these events is structurally always gone by the time the
    // listeners above are registered. circuit-tab stashes them.
    if (window.__bwMachineExtracted && window.__bwMachineExtracted.config && !this.state.machineConfig) {
      this._onMachineExtracted({
        detail: window.__bwMachineExtracted
      });
    }
    // The stash is deliberately NOT cleared on consumption: the runner
    // dies with this panel (tab switches remount the whole designer),
    // and a bench that forgets its program on every tab switch is a
    // bench the ASM workflow cannot use. Replaying the last program is
    // the bench's continuity — same stance as the config replay above.
    const pending = window.__bwPendingMedia;
    if (pending) {
      if (pending.type === 'asm') this._onAsmRomReady({
        detail: pending.detail
      });else this._onMediaLoad({
        detail: pending.detail
      });
    }
    // AFTER the replays: an example's auto-run token fired onStart()
    // here, BEFORE the config/media replays ran — so the token built a
    // second runner with neither, and on a machine bench that runner
    // booted the extracted machine with an EMPTY ROM, won state.runner,
    // and put a black VDP on screen while the real program ran unseen.
    this.syncProjectTokens({}, true);
    // The menu comes from bw-board, not from a list duplicated here: it owns
    // which targets exist and what each one is called.
    Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../../lib/bw-board/index.js */ "./src/lib/bw-board/index.js")).then(m => {
      if (m.getTargetKinds) this.setState({
        kinds: m.getTargetKinds()
      });
    }).catch(e => {
      // Degrading to "no picker" is the right call for a genuine
      // failure, but swallowing the reason is not: if the chunk is
      // missing because the deploy moved on, this catch hides it from
      // the global stale-build recovery (which only sees UNHANDLED
      // rejections) and the user gets a silently reduced UI. Ask the
      // recovery first, and if it declines, at least say why the
      // picker is absent instead of pretending it was never there.
      const recovering = typeof window !== 'undefined' && window.__bwRecoverFromStaleBuild && window.__bwRecoverFromStaleBuild(e && e.message);
      if (!recovering) console.warn('[brickwright] target picker unavailable:', e);
    });
  }
  componentDidUpdate(prevProps) {
    this.syncDeviceKind();
    this.syncProjectTokens(prevProps, false);
  }

  // When the project's DEVICE declaration changes, switch the default
  // target kind to match the architecture. The user can still override
  // it via the picker — this only sets the default so an Arduino project
  // does not start with "Simulated (emu8051)" selected.
  syncDeviceKind() {
    const rt = this.props.vm && this.props.vm.runtime;
    if (!rt) return;
    const core = rt.bwDeviceCore;
    const dev = rt.bwDeviceId;
    const key = "".concat(core, "/").concat(dev);
    if (key === this._lastCore) return;
    this._lastCore = key;
    // Device-specific engines first: an ATtiny88 on the coarse
    // core→kind map landed on avr8js (ATmega328P memory map) — or,
    // when no core was published at all, stayed on the 8051 emulator
    // and the pendant's matrix never lit (owner report, 3791c09).
    const DEVICE_TO_KIND = {
      attiny88: 'attiny88',
      attiny85: 'attiny85',
      'arduino-mega': 'atmega2560',
      atmega2560: 'atmega2560',
      pico: 'rp2040js',
      eater6502: 'eater6502',
      z80: 'z80',
      zx48: 'z80',
      zx128: 'z80'
    };
    const CORE_TO_KIND = {
      '8051': 'emulator',
      arduino: 'avr8js',
      rp2040: 'rp2040js',
      micropython: 'rp2040js',
      w65c02: 'eater6502',
      z80: 'z80'
    };
    const kind = DEVICE_TO_KIND[dev] || CORE_TO_KIND[core];
    if (kind && kind !== this.state.kind) {
      // Changing the kind while a runner exists would leave it on the
      // wrong engine. Destroy it so the next Start creates a fresh one.
      this._teardownRunner();
      this.setState({
        kind,
        runner: null,
        ui: {
          phase: 'idle',
          message: ''
        }
      });
    }
  }
  syncProjectTokens(prevProps, initial) {
    if (this.props.runToken && (initial || this.props.runToken !== prevProps.runToken)) {
      this.onStart();
    }
    if (!initial && this.props.stopToken && this.props.stopToken !== prevProps.stopToken) {
      this.onStop();
    }
  }
  componentWillUnmount() {
    const rt = this.props.vm && this.props.vm.runtime;
    if (rt && rt.off && this._onProjectChanged) rt.off('PROJECT_CHANGED', this._onProjectChanged);else if (rt && rt.removeListener && this._onProjectChanged) rt.removeListener('PROJECT_CHANGED', this._onProjectChanged);
    window.removeEventListener('bw-machine-extracted', this._onMachineExtracted);
    if (this._onBoardSource) window.removeEventListener('bw-board-source', this._onBoardSource);
    window.removeEventListener('bw-machine-media-load', this._onMediaLoad);
    window.removeEventListener('bw-asm-rom-ready', this._onAsmRomReady);
    this._teardownRunner();
  }
  tx(key) {
    const table = L10N[this.props.locale] || L10N.en;
    return table[key] || L10N.en[key];
  }

  /** Destroy whatever runner exists OR is still being created. The
   *  creation is async (a chunk import), so a plain state check races —
   *  two concurrent runner() calls once produced two live machines. */
  _teardownRunner() {
    const p = this._runnerPromise;
    this._runnerPromise = null;
    if (p) {
      p.then(r => {
        if (r) r.destroy();
      }).catch(() => {});
    } else if (this.state.runner) {
      this.state.runner.destroy();
    }
  }
  runner() {
    var _this2 = this;
    return _asyncToGenerator(function* () {
      if (_this2._runnerPromise) return _this2._runnerPromise;
      _this2._runnerPromise = _this2._createRunner();
      return _this2._runnerPromise;
    })();
  }
  _createRunner() {
    var _this3 = this;
    return _asyncToGenerator(function* () {
      const {
        createDebugRunner
      } = yield __webpack_require__.e(/*! import() | bw-debug */ "bw-debug").then(__webpack_require__.bind(__webpack_require__, /*! ../../lib/bw-debug/debug-runner.js */ "./src/lib/bw-debug/debug-runner.js"));
      const runner = createDebugRunner({
        vm: _this3.props.vm,
        targetKind: _this3.state.kind,
        machineConfig: _this3.state.machineConfig,
        bootMedia: _this3._bootMedia,
        onChange: ui => {
          _this3.setState({
            ui
          });
          // The board only exists after attach, and the tab has to be told:
          // until it is, the designer is showing a board of its own that
          // nothing drives. See circuit-tab.jsx.
          if (_this3.props.onRunnerChange) _this3.props.onRunnerChange(runner, ui);
        }
      });
      if (_this3.props.onRunnerChange) _this3.props.onRunnerChange(runner, _this3.state.ui);
      // setState is async, so hand the instance back directly rather than
      // reading it out of state on the very next line.
      _this3.setState({
        runner
      });
      return runner;
    })();
  }
  onStart() {
    var _this4 = this;
    return _asyncToGenerator(function* () {
      const runner = yield _this4.runner();
      const phase = _this4.state.ui.phase;
      if (phase === 'paused') runner.resume();else yield runner.start();
    })();
  }
  onSerialInput(e) {
    this.setState({
      serialInput: e.target.value
    });
  }
  onSerialKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    this.onSerialSend();
  }

  /** Send the typed line to the machine's UART, terminated with CR.
   *
   *  CR (0x0d), not LF: that is what an ACIA monitor and every BASIC on
   *  these benches read as "line ends here" — bw-circuit-ui's SerialConsole
   *  defaults to the same byte.
   *
   *  NO local echo. BBC BASIC, Tali Forth and the Searle monitor all echo
   *  what they receive, so painting the line here too would double every
   *  character. The console shows what the MACHINE said; if nothing comes
   *  back, that is a fact about the machine worth seeing, not one to hide
   *  behind an echo the UI invented. */
  onSerialSend() {
    const runner = this.state.runner;
    const line = this.state.serialInput;
    if (!runner || typeof runner.sendSerial !== 'function') return;
    runner.sendSerial("".concat(line, "\r"));
    this.setState({
      serialInput: ''
    });
  }
  onPause() {
    if (this.state.runner) this.state.runner.pause();
  }
  onStop() {
    if (this.state.runner) this.state.runner.stop();
  }
  onStep() {
    var _this5 = this;
    return _asyncToGenerator(function* () {
      (yield _this5.runner()).step('block');
    })();
  }
  onSpeed(e) {
    if (this.state.runner) this.state.runner.setSpeed(Number(e.target.value));
  }
  render() {
    const {
      ui
    } = this.state;
    const {
      phase,
      message
    } = ui;
    const running = phase === 'running' || phase === 'stepping';
    const paused = phase === 'paused';
    const busy = phase === 'building' || phase === 'attaching';
    const why = ui.session && ui.session.why;

    // Capabilities decide what is offered — never an assumption about which
    // target is attached. Before one is attached there is nothing to ask,
    // so the buttons reflect the phase alone.
    const caps = ui.capabilities;
    const canStep = !caps || caps.steps.includes('block');
    // A capability, asked of the runner — the same stance as the step
    // buttons. An 8051 that only prints has no sendSerial and gets no
    // input line rather than a dead one.
    const canSendSerial = !!(this.state.runner && typeof this.state.runner.sendSerial === 'function');
    const inferredBoard = this.state.boardSource === 'inferred';
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        background: '#1a1a2e',
        border: '1px solid #2c3e50',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#bdc3c7'
      }
    }, inferredBoard ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      "data-inferred-board-warning": true,
      role: "alert",
      style: {
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        background: '#7f1d1d',
        border: '1px solid #ef4444',
        borderRadius: 6,
        padding: '6px 8px',
        color: '#fecaca',
        fontWeight: 700
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      "aria-hidden": true,
      style: {
        fontSize: 14
      }
    }, '\u26a0'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", null, /^de/i.test(String(this.props.locale || typeof navigator !== 'undefined' && navigator.language || 'en')) ? 'IMPROVISIERTES Testboard: Der Debugger hat aus den PIN-Zeilen ein Ersatzboard erraten — das ist NICHT die Schaltung des Beispiels. Öffne den Circuit-Tab, um das echte Board zu laden.' : 'IMPROVISED test board: the debugger guessed a stand-in from the PIN lines — this is NOT the example\u2019s circuit. Open the Circuit tab to load the real board.')) : null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: running || busy ? OFF : _objectSpread(_objectSpread({}, BTN), {}, {
        borderColor: '#2ecc71',
        color: '#2ecc71'
      }),
      disabled: running || busy,
      onClick: this.onStart,
      title: paused ? 'Resume' : 'Build, load and run'
    }, '▶ ', this.tx('run')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: running ? BTN : OFF,
      disabled: !running,
      onClick: this.onPause
    }, '⏸ ', this.tx('pause')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: canStep && !busy ? BTN : OFF,
      disabled: !canStep || busy,
      onClick: this.onStep,
      title: canStep ? this.tx('stepHint') : 'This target cannot step one block'
    }, '⏭ ', this.tx('step')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      style: running || paused ? _objectSpread(_objectSpread({}, BTN), {}, {
        borderColor: '#c0392b',
        color: '#e74c3c'
      }) : OFF,
      disabled: !running && !paused,
      onClick: this.onStop
    }, '⏹ ', this.tx('stop')), this.state.kinds && this.state.kinds.length > 1 ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("select", {
      value: this.state.kind,
      disabled: running || paused || busy,
      title: (this.state.kinds.find(k => k.kind === this.state.kind) || {}).description,
      onChange: e => this.setState({
        kind: e.target.value
      }),
      style: _objectSpread(_objectSpread({}, BTN), {}, {
        padding: '3px 6px'
      })
    }, this.state.kinds.map(k => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("option", {
      key: k.kind,
      value: k.kind
    }, k.label)))) : null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        marginLeft: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("label", {
      htmlFor: "bw-debug-speed"
    }, this.tx('speed')), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("select", {
      id: "bw-debug-speed",
      defaultValue: "1",
      onChange: this.onSpeed,
      style: _objectSpread(_objectSpread({}, BTN), {}, {
        padding: '3px 6px'
      })
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("option", {
      value: "0.1"
    }, '0.1×'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("option", {
      value: "0.5"
    }, '0.5×'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("option", {
      value: "1"
    }, '1×'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("option", {
      value: "4"
    }, '4×')))), caps && caps.consumes && caps.consumes.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#f39c12',
        fontSize: 11
      }
    }, "".concat(this.tx('consumes'), " ").concat(caps.consumes.join(', '))) : null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 10,
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("strong", {
      style: {
        color: phase === 'error' ? '#e74c3c' : running ? '#2ecc71' : paused ? '#f39c12' : '#7f8c8d'
      }
    }, this.tx(phase) || phase), message ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#7f8c8d'
      }
    }, message) : null), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        borderTop: '1px solid #2c3e50',
        paddingTop: 8
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#7f8c8d',
        marginBottom: 4
      }
    }, this.tx('bps'), ui.breakpoints && ui.breakpoints.length ? " (".concat(ui.breakpoints.length, ")") : ''), !ui.breakpoints || !ui.breakpoints.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#5d6d7e'
      }
    }, this.tx('noBps')) : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#95a5a6'
      }
    }, ui.breakpoints.map(id => {
      const dead = (ui.unreachableBreakpoints || []).includes(id);
      return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
        key: id,
        style: {
          color: dead ? '#7f8c8d' : '#ecf0f1'
        }
      }, '● ', ui.yieldKinds && ui.yieldKinds[id] || id.slice(0, 8), ui.conditions && ui.conditions[id] ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#3498db',
          marginLeft: 6
        }
      }, "when ".concat(ui.conditions[id])) : null, ui.conditionErrors && ui.conditionErrors[id] ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
        style: {
          color: '#e74c3c',
          marginLeft: 6
        }
      }, ui.conditionErrors[id]) : null, dead ? " \u2014 ".concat(this.tx('unreachable')) : '');
    }), ui.skippedHits ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        fontSize: 11,
        marginTop: 4,
        color: '#5d6d7e'
      }
    }, "".concat(ui.skippedHits.toLocaleString(), " ").concat(this.tx('skipped'))) : null, (ui.unreachableBreakpoints || []).length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        fontSize: 11,
        marginTop: 4,
        color: '#7f8c8d'
      }
    }, this.tx('unreachableWhy')) : null)), this.state.runner && typeof this.state.runner.video === 'function' ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(react__WEBPACK_IMPORTED_MODULE_0__.Suspense, {
      fallback: null
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(VdpScreen, {
      videoFn: this._videoFn,
      lang: this.props.locale,
      "data-testid": "bw-vdp-screen"
    })) : null, this.state.runner ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(_debug_inspector_jsx__WEBPACK_IMPORTED_MODULE_3__["default"], {
      runner: this.state.runner,
      locale: this.props.locale
    }) : null, this.state.runner ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement(_debug_drawer_jsx__WEBPACK_IMPORTED_MODULE_2__["default"], {
      runner: this.state.runner,
      ui: ui,
      locale: this.props.locale,
      clockHz: this.props.clockHz
    }) : null, ui.serialOutput && ui.serialOutput.length || canSendSerial ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        borderTop: '1px solid #2c3e50',
        paddingTop: 8
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#7f8c8d',
        marginBottom: 4
      }
    }, 'Serial', ui.serialOutput && ui.serialOutput.length ? " (".concat(ui.serialOutput.length, ")") : ''), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("pre", {
      "data-testid": "bw-serial-console",
      style: {
        margin: 0,
        padding: 6,
        maxHeight: 120,
        overflow: 'auto',
        background: '#0d1117',
        color: '#2ecc71',
        fontSize: 11,
        borderRadius: 4,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        fontFamily: 'monospace'
      }
    }, (ui.serialOutput || []).join('\n')), canSendSerial ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        marginTop: 4,
        alignItems: 'center'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        color: '#2ecc71'
      }
    }, '>'), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("input", {
      "data-testid": "bw-serial-input",
      type: "text",
      value: this.state.serialInput,
      onChange: this.onSerialInput,
      onKeyDown: this.onSerialKeyDown,
      placeholder: this.tx('serialHint'),
      "aria-label": this.tx('serialSend'),
      style: {
        flex: '1 1 auto',
        minWidth: 0,
        padding: '4px 6px',
        background: '#0d1117',
        color: '#2ecc71',
        border: '1px solid #2c3e50',
        borderRadius: 4,
        fontFamily: 'monospace',
        fontSize: 11
      }
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      "data-testid": "bw-serial-send",
      style: _objectSpread(_objectSpread({}, BTN), {}, {
        padding: '3px 10px'
      }),
      onClick: this.onSerialSend,
      title: this.tx('serialSend')
    }, '⏎')) : null) : null, paused && why ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        color: '#95a5a6'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", null, this.tx('pausedAt'), ' ', /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("code", {
      style: {
        color: '#ecf0f1'
      }
    }, "PC ".concat(Number.isFinite(why.pc) ? '0x' + why.pc.toString(16).padStart(4, '0') : '?')), ' ', this.tx('afterMs'), ' ', "".concat((Number(why.tNs) / 1e6).toFixed(2), " ms")), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        fontSize: 11,
        marginTop: 4
      }
    }, this.tx('yieldNote'))) : null);
  }
}
DebugPanel.propTypes = {
  clockHz: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().number),
  onRunnerChange: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().func),
  runToken: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().number),
  stopToken: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().number),
  locale: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().string),
  vm: prop_types__WEBPACK_IMPORTED_MODULE_4___default().shape({
    toJSON: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().func),
    runtime: (prop_types__WEBPACK_IMPORTED_MODULE_4___default().object)
  }).isRequired
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ((0,react_redux__WEBPACK_IMPORTED_MODULE_1__.connect)(state => ({
  vm: state.scratchGui.vm,
  locale: state.locales.locale
}))(DebugPanel));

/***/ }),

/***/ "./src/lib/bw-debug/opcodes.js":
/*!*************************************!*\
  !*** ./src/lib/bw-debug/opcodes.js ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PSW_BITS: () => (/* binding */ PSW_BITS),
/* harmony export */   SFR_NAMES: () => (/* binding */ SFR_NAMES),
/* harmony export */   instructionLength: () => (/* binding */ instructionLength),
/* harmony export */   sfrName: () => (/* binding */ sfrName)
/* harmony export */ });
/**
 * 8051 opcode lengths and SFR names.
 *
 * GENERATED from `stc-compiler/stc_disasm.py` — do not hand-edit; regenerate
 * from the same source if it changes.
 *
 * Why not ask the emulator. `emu_disasm(addr)` gives the mnemonic but not the
 * instruction's LENGTH, and the trace pane needs the length to show the opcode
 * bytes of each executed instruction. Adding a `emu_disasm_len` export would
 * mean rebuilding and re-pinning the WASM by hash, for a fact that is already
 * written down — and written down in the one place with an oracle behind it:
 * stc_disasm round-trips 380/380 images byte-exactly, which is only possible if
 * every length is right. `bench/` cross-checks this copy against that source.
 *
 * @module
 */

/** Length in bytes of the instruction starting with each opcode, 0x00..0xFF. */
const LENGTHS = '12311211111111113231121111111111' + '32112211111111113211221111111111' + '22232211111111112223221111111111' + '22232211111111112221232222222222' + '22211322222222223221221111111111' + '22211122222222222221333333333333' + '22211211111111112221131122222222' + '12111211111111111211121111111111';

/**
 * How many bytes the instruction at this opcode occupies (1, 2 or 3).
 * Every one of the 256 opcodes has an entry — the 8051 has no undefined ones
 * (0xA5 is the sole reserved opcode and is one byte).
 */
function instructionLength(opcode) {
  return Number(LENGTHS[opcode & 0xFF]);
}

/**
 * SFR names by address, for the STC12 family.
 *
 * Numerically these overlap `iram` and are a DIFFERENT memory — the trap
 * DEBUG-CONTROL-MODEL §6 calls out. A UI that lists them must say which space
 * it is showing.
 */
const SFR_NAMES = {
  '128': 'P0',
  '129': 'SP',
  '130': 'DPL',
  '131': 'DPH',
  '135': 'PCON',
  '136': 'TCON',
  '137': 'TMOD',
  '138': 'TL0',
  '139': 'TL1',
  '140': 'TH0',
  '141': 'TH1',
  '142': 'AUXR',
  '144': 'P1',
  '145': 'P1M1',
  '146': 'P1M0',
  '147': 'P0M1',
  '148': 'P0M0',
  '149': 'P2M1',
  '150': 'P2M0',
  '151': 'CLK_DIV',
  '152': 'SCON',
  '153': 'SBUF',
  '154': 'S2CON',
  '155': 'S2BUF',
  '156': 'BRT',
  '157': 'P1ASF',
  '160': 'P2',
  '162': 'AUXR1',
  '168': 'IE',
  '169': 'SADDR',
  '176': 'P3',
  '177': 'P3M1',
  '178': 'P3M0',
  '179': 'P4M1',
  '180': 'P4M0',
  '182': 'IP2H',
  '183': 'IPH',
  '184': 'IP',
  '185': 'SADEN',
  '187': 'P4SW',
  '188': 'ADC_CONTR',
  '189': 'ADC_RES',
  '190': 'ADC_RESL',
  '192': 'P4',
  '200': 'P5',
  '201': 'P5M1',
  '202': 'P5M0',
  '208': 'PSW',
  '216': 'CCON',
  '217': 'CMOD',
  '218': 'CCAPM0',
  '219': 'CCAPM1',
  '224': 'ACC',
  '233': 'CL',
  '240': 'B',
  '242': 'PCA_PWM0',
  '243': 'PCA_PWM1',
  '249': 'CH',
  '250': 'CCAP0H',
  '251': 'CCAP1H'
};

/** Name for an SFR address, or its hex if this part does not define one. */
function sfrName(addr) {
  return SFR_NAMES[addr] || "0x".concat(addr.toString(16).toUpperCase().padStart(2, '0'));
}

/** PSW bits, most significant first — the order emu8051's TUI prints them. */
const PSW_BITS = [{
  bit: 7,
  name: 'C',
  title: 'Carry'
}, {
  bit: 6,
  name: 'AC',
  title: 'Auxiliary carry'
}, {
  bit: 5,
  name: 'F0',
  title: 'User flag 0'
}, {
  bit: 4,
  name: 'RS1',
  title: 'Register bank select 1'
}, {
  bit: 3,
  name: 'RS0',
  title: 'Register bank select 0'
}, {
  bit: 2,
  name: 'OV',
  title: 'Overflow'
}, {
  bit: 1,
  name: 'F1',
  title: 'User flag 1'
}, {
  bit: 0,
  name: 'P',
  title: 'Parity of the accumulator'
}];

/***/ }),

/***/ "./src/lib/bw-debug/trace-csv.js":
/*!***************************************!*\
  !*** ./src/lib/bw-debug/trace-csv.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   downloadTraceCsv: () => (/* binding */ downloadTraceCsv),
/* harmony export */   traceToCsv: () => (/* binding */ traceToCsv)
/* harmony export */ });
/**
 * Trace → CSV. The debugger's execution trace is a time series (every row
 * carries machine time, registers, SFRs and the captured user variables),
 * and a time series belongs in tools built for time series — spreadsheets,
 * pandas, gnuplot. One function, no UI: the drawer's export button and any
 * future headless use serialize through the same code.
 *
 * Column policy, deliberate: `t_ms` is decimal milliseconds (plotting
 * software's native axis), machine words are hex with the 0x prefix
 * (register values are bit patterns, not quantities — 0x80 in PSW is a
 * flag, not "128"), user VARIABLES are decimal (they are the program's
 * own quantities), and variable columns are the UNION across all rows —
 * a variable that appears mid-run gets empty cells before its first
 * capture rather than silently vanishing from the export.
 *
 * @module
 */

const hex = (v, w) => v === undefined || v === null ? '' : "0x".concat(Number(v).toString(16).toUpperCase().padStart(w, '0'));
const quote = s => {
  const str = String(s !== null && s !== void 0 ? s : '');
  return /[",\n]/.test(str) ? "\"".concat(str.replace(/"/g, '""'), "\"") : str;
};

/**
 * @param {Array<object>} rows createTrace()'s rows
 * @returns {string} CSV text, header first, newest row last
 */
function traceToCsv(rows) {
  const sfrNames = [];
  const varNames = [];
  for (const row of rows) {
    for (const name of Object.keys(row.sfr || {})) {
      if (!sfrNames.includes(name)) sfrNames.push(name);
    }
    for (const name of Object.keys(row.variables || {})) {
      if (!varNames.includes(name)) varNames.push(name);
    }
  }
  const header = ['seq', 't_ms', 'why', 'pc', 'bytes', 'asm', 'a', 'b', 'dptr', 'sp', 'psw', 'bank', ...Array.from({
    length: 8
  }, (_, i) => "r".concat(i)), ...sfrNames, ...varNames.map(n => "var_".concat(n))];
  const lines = [header.map(quote).join(',')];
  for (const row of rows) {
    var _row$why, _row$bank;
    const asm = typeof row.text === 'object' && row.text ? row.text.text : row.text;
    const cells = [row.seq, row.tNs === undefined ? '' : (Number(row.tNs) / 1e6).toFixed(6), (_row$why = row.why) !== null && _row$why !== void 0 ? _row$why : '', hex(row.pc, 4), (row.bytes || []).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '), asm !== null && asm !== void 0 ? asm : '', hex(row.a, 2), hex(row.b, 2), hex(row.dptr, 4), hex(row.sp, 2), hex(row.psw, 2), (_row$bank = row.bank) !== null && _row$bank !== void 0 ? _row$bank : '', ...Array.from({
      length: 8
    }, (_, i) => hex(row.r ? row.r[i] : undefined, 2)), ...sfrNames.map(n => hex(row.sfr ? row.sfr[n] : undefined, 2)), ...varNames.map(n => row.variables && n in row.variables ? row.variables[n] : '')];
    lines.push(cells.map(quote).join(','));
  }
  return "".concat(lines.join('\n'), "\n");
}

/** Trigger a browser download of the CSV. Kept beside the serializer so
 *  the drawer stays one line; harmless to import headlessly (unused). */
function downloadTraceCsv(rows) {
  let filename = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'bw-trace.csv';
  const blob = new Blob([traceToCsv(rows)], {
    type: 'text/csv'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (traceToCsv);

/***/ }),

/***/ "./src/lib/bw-debug/trace.js":
/*!***********************************!*\
  !*** ./src/lib/bw-debug/trace.js ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   IO_SFRS: () => (/* binding */ IO_SFRS),
/* harmony export */   TIMER_SFRS: () => (/* binding */ TIMER_SFRS),
/* harmony export */   createTrace: () => (/* binding */ createTrace),
/* harmony export */   formatBytes: () => (/* binding */ formatBytes),
/* harmony export */   hex16: () => (/* binding */ hex16),
/* harmony export */   hex8: () => (/* binding */ hex8)
/* harmony export */ });
/* harmony import */ var _opcodes_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./opcodes.js */ "./src/lib/bw-debug/opcodes.js");
/**
 * The execution trace — emu8051's history ring, which is the thing its TUI is
 * really built around.
 *
 * That TUI looks like eight independent panes and is not: `mainview.c` keeps one
 * ring buffer holding the PC and a full register snapshot per executed
 * instruction, and the disassembly, register, PSW, port and timer panes are five
 * *columns of the same table*, scrolled together. Reproducing it as five
 * separate widgets would lose the only property that makes it useful — that a
 * row of registers is the row belonging to that instruction.
 *
 * So this records rows, and the GUI renders them as one table. That is also the
 * one place where the GUI can be plainly better than the TUI: eight panes across
 * an 80-column terminal is a layout constraint, not a design.
 *
 * ## What a row costs, and what that means for "trace everything"
 *
 * A row is about thirty WASM calls. That is free when stepping and impossible at
 * a million instructions a second, which is exactly the TUI's own limit: it
 * records per instruction because its run loop single-steps, and at high speed
 * it cannot keep up either. Hence two modes, and the UI says which is on:
 *
 *   - **on halt** (default) — a row whenever the program stops. Cheap, always on.
 *   - **every instruction** — the runner single-steps and records each one.
 *     Truthful and slow, for when you are looking at a handful of instructions.
 *
 * A free run at speed records nothing in between, and the pane says so rather
 * than presenting a gap as a complete history.
 *
 * @module
 */



/** How many instructions to keep. emu8051's HISTORY_LINES is the same idea. */
const DEFAULT_CAPACITY = 512;

/** The SFRs the TUI's timer/serial pane shows, in its order. */
const TIMER_SFRS = [{
  name: 'TMOD',
  addr: 0x89
}, {
  name: 'TCON',
  addr: 0x88
}, {
  name: 'TH0',
  addr: 0x8C
}, {
  name: 'TL0',
  addr: 0x8A
}, {
  name: 'TH1',
  addr: 0x8D
}, {
  name: 'TL1',
  addr: 0x8B
}, {
  name: 'SCON',
  addr: 0x98
}, {
  name: 'PCON',
  addr: 0x87
}];

/** The SFRs the TUI's I/O pane shows, in its order. */
const IO_SFRS = [{
  name: 'SP',
  addr: 0x81
}, {
  name: 'P0',
  addr: 0x80
}, {
  name: 'P1',
  addr: 0x90
}, {
  name: 'P2',
  addr: 0xA0
}, {
  name: 'P3',
  addr: 0xB0
}, {
  name: 'IP',
  addr: 0xB8
}, {
  name: 'IE',
  addr: 0xA8
}];

/**
 * A trace ring.
 *
 * @param {object} opts
 * @param {number} [opts.capacity]
 */
function createTrace() {
  let {
    capacity = DEFAULT_CAPACITY
  } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  /** @type {Array<object>} */
  let _rows = [];
  let _dropped = 0;
  let seq = 0;
  return {
    /**
     * Sample the target now and append a row.
     *
     * @param {object} target a DebugTarget
     * @param {string} why what caused this row: 'step' | 'halt' | 'trace'
     */
    record(target) {
      let why = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'halt';
      let extra = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
      const regs = target.regs();
      const pc = regs.pc;
      const len = (0,_opcodes_js__WEBPACK_IMPORTED_MODULE_0__.instructionLength)(target.readMem('code', pc, 1)[0]);
      const bytes = [...target.readMem('code', pc, len)];
      const row = {
        seq: seq++,
        why,
        pc,
        bytes,
        text: target.disasm ? target.disasm(pc) : '',
        a: regs.a,
        b: regs.b,
        r: regs.r,
        bank: regs.bank,
        dptr: regs.dptr,
        sp: regs.sp,
        psw: regs.psw,
        tNs: target.timeNs(),
        sfr: {}
      };
      // One read per SFR of interest rather than a 0x80..0xFF sweep: the
      // sweep is 128 calls a row and nothing renders the rest.
      for (const {
        name,
        addr
      } of [...IO_SFRS, ...TIMER_SFRS]) {
        row.sfr[name] = target.readMem('sfr', addr, 1)[0];
      }

      // The user's own variables, captured WITH the row. This is what
      // makes the timeline a time machine rather than a log: scrubbing
      // back shows what `counter` was then, not what it is now.
      if (extra && extra.variables) row.variables = extra.variables;
      if (extra && extra.tasks) row.tasks = extra.tasks;
      _rows.push(row);
      if (_rows.length > capacity) {
        _dropped += _rows.length - capacity;
        _rows = _rows.slice(-capacity);
      }
      return row;
    },
    /** Newest last, which is how the TUI scrolls. */
    rows: () => _rows,
    /** How many rows fell off the end — shown, never silently discarded. */
    dropped: () => _dropped,
    last: () => _rows[_rows.length - 1] || null,
    clear() {
      _rows = [];
      _dropped = 0;
      seq = 0;
    }
  };
}

/** `E5 82` → `"E5 82   "`, padded to three bytes as the TUI does. */
function formatBytes(bytes) {
  const hex = bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0'));
  while (hex.length < 3) hex.push('  ');
  return hex.join(' ');
}

/** `0x1F` → `"1F"`. */
function hex8(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

/** `0x1F` → `"001F"`. */
function hex16(v) {
  return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/***/ })

}]);