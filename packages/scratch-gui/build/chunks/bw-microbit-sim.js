"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-microbit-sim"],{

/***/ "./src/components/tw-pseudocode/microbit-sim-pane.jsx":
/*!************************************************************!*\
  !*** ./src/components/tw-pseudocode/microbit-sim-pane.jsx ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! prop-types */ "./node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react_redux__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react-redux */ "./node_modules/react-redux/es/index.js");
/* harmony import */ var _lib_bw_debug_microbit_debug_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../lib/bw-debug/microbit-debug.js */ "./src/lib/bw-debug/microbit-debug.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }




const L10N = {
  en: {
    simTitle: 'micro:bit simulator',
    stop: '⏹ Stop',
    reset: '🔄 Reset',
    clear: '🗑 Clear',
    running: 'Running',
    ready: 'Ready',
    loading: 'Loading…',
    serialPlaceholder: '(serial output appears here)',
    step: '⏭ Step',
    continue: '▶ Continue',
    paused: 'Paused',
    debugging: 'Debugging',
    pausedAt: 'Paused at block',
    vars: 'Variables',
    board: 'Board',
    trace: 'Trace',
    stack: 'Stack',
    topLevel: '(top level)',
    noVars: '(no variables)',
    pauseToInspect: 'Pause to inspect state'
  },
  de: {
    simTitle: 'micro:bit-Simulator',
    stop: '⏹ Stopp',
    reset: '🔄 Zurücksetzen',
    clear: '🗑 Leeren',
    running: 'Läuft',
    ready: 'Bereit',
    loading: 'Wird geladen…',
    serialPlaceholder: '(serielle Ausgabe erscheint hier)',
    step: '⏭ Schritt',
    continue: '▶ Weiter',
    paused: 'Angehalten',
    debugging: 'Debugging',
    pausedAt: 'Angehalten bei Block',
    vars: 'Variablen',
    board: 'Board',
    trace: 'Verlauf',
    stack: 'Stapel',
    topLevel: '(oberste Ebene)',
    noVars: '(keine Variablen)',
    pauseToInspect: 'Zum Inspizieren anhalten'
  }
};
const pickLocale = () => {
  try {
    return /^de/i.test(navigator.language) ? 'de' : 'en';
  } catch (_unused) {
    return 'en';
  }
};

/**
 * MicrobitSimPane — hosts the self-hosted micro:bit MicroPython simulator
 * in an iframe and wires the postMessage protocol.
 *
 * Protocol (simulator → parent):
 *   {kind: 'ready', state}          sim loaded, waiting for flash
 *   {kind: 'request_flash'}         play button pressed, send code
 *   {kind: 'serial_output', data}   serial print output
 *   {kind: 'state_change', change}  LED/button/sensor state
 *
 * Protocol (parent → simulator):
 *   {kind: 'flash', filesystem}     send {filename: Uint8Array} to run
 *   {kind: 'serial_input', data}    write a string to the program's serial-IN
 *   {kind: 'stop'}                  stop the program
 *   {kind: 'reset'}                 reset and re-run
 *
 * ## Debugging (MICROBIT-NATIVE Stage 3, Path A)
 *
 * A DEBUG flash carries `{code, debug:true, positions}`: the code is the
 * instrumented build from `generateMicroPython(project, {debug:true,
 * breakpoints})`, which prints RS(0x1e)-prefixed position markers over serial
 * and HALTS at breakpoints on `input()`. This pane owns the iframe — hence both
 * serial directions — so it hosts the micro:bit debug controller: it feeds every
 * serial_output chunk through the controller (which splits the markers from real
 * output and highlights `positions[n].block` via `vm.runtime.glowBlock`, the
 * SAME call the 8051 debugger uses), and its Step/Continue buttons resume the
 * halted program by writing `\x1es` / `\x1ec` back over serial_input. The
 * controller is a SEPARATE lightweight thing, NOT forced into the emulator's
 * `runFor` boundary-D contract (the sim has no program clock) — see
 * microbit-debug.js.
 */

const SIM_URL = 'static/microbit-sim/simulator.html';
// The line-level (settrace) debugger loads a separate page that pulls the
// settrace-enabled debug firmware. Switching to it reloads the iframe.
const SIM_DEBUG_URL = 'static/microbit-sim/simulator-debug.html';
class MicrobitSimPane extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    this.state = {
      serial: '',
      simReady: false,
      simUrl: SIM_URL,
      // switched to SIM_DEBUG_URL for a line-level (trace) run
      running: false,
      // Mirror of the debug controller, for the render.
      dbg: {
        active: false,
        running: false,
        halted: false,
        block: null,
        index: null,
        vars: null,
        board: null,
        trace: [],
        stack: []
      }
    };
    this._iframeRef = /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createRef();
    this._pendingCode = null;
    this._pendingDebug = null; // {positions} when the pending flash is a debug run
    this._onMessage = this._onMessage.bind(this);
    this._onFlashEvent = this._onFlashEvent.bind(this);

    // The debug controller. Its highlight sink is vm.runtime.glowBlock —
    // read at call time so it survives a late-arriving vm — and its
    // serial-IN sink posts into the iframe. Kept off React state; it is a
    // controller, not render data (the render reads its snapshot via dbg).
    this._dbg = (0,_lib_bw_debug_microbit_debug_js__WEBPACK_IMPORTED_MODULE_2__.createMicrobitDebugController)({
      glow: (blockId, on) => {
        const rt = this.props.vm && this.props.vm.runtime;
        if (rt && typeof rt.glowBlock === 'function') {
          try {
            rt.glowBlock(blockId, on);
          } catch (_unused2) {/* stale block id */}
        }
      },
      sendSerialIn: text => this._serialIn(text),
      onChange: dbg => this.setState({
        dbg
      })
    });
  }
  componentDidMount() {
    window.addEventListener('message', this._onMessage);
    window.addEventListener('bw-microbit-flash', this._onFlashEvent);
    // Mount race: the importer opens the dock (mounting THIS pane) and
    // dispatches the flash in the SAME tick — before this listener exists,
    // so the event is lost and only a second Debug click worked. The
    // importer also parks the detail on a module latch; pick it up on mount
    // so the FIRST Debug click runs.
    let pending = null;
    try {
      pending = window.__bwMicrobitPendingFlash || null;
    } catch (_unused3) {/* noop */}
    if (pending) this._handleFlash(pending);
  }
  componentWillUnmount() {
    window.removeEventListener('message', this._onMessage);
    window.removeEventListener('bw-microbit-flash', this._onFlashEvent);
    // Clear any lingering block highlight when the pane goes away.
    this._dbg.stop();
  }
  _onFlashEvent(e) {
    this._handleFlash(e && e.detail || {});
  }
  _handleFlash(detail) {
    try {
      window.__bwMicrobitPendingFlash = null;
    } catch (_unused4) {/* noop */}
    const code = detail.code;
    if (!code) return;
    const debug = detail.trace ? {
      trace: true,
      lineMap: detail.lineMap || {}
    } : detail.debug ? {
      positions: detail.positions || [],
      procNames: detail.procNames || []
    } : null;
    // A line-level (trace) run needs the settrace debug firmware — a
    // different sim page. Switching src reloads the iframe.
    const targetUrl = debug && debug.trace ? SIM_DEBUG_URL : SIM_URL;
    if (this.state.simUrl !== targetUrl) {
      this.setState({
        simUrl: targetUrl,
        simReady: false
      });
    }
    // Park the run; the FLASH happens on the play gesture (request_flash),
    // never on 'ready'. board.flash before a real in-iframe user gesture
    // throws "Context must be pre-created from a user event" — the sim's own
    // audio guard, for BOTH firmwares. The play button is that gesture.
    this._pendingCode = code;
    this._pendingDebug = debug;
  }
  _onMessage(e) {
    const iframe = this._iframeRef.current;
    if (!iframe || e.source !== iframe.contentWindow) return;
    const {
      kind
    } = e.data || {};
    switch (kind) {
      case 'ready':
        // Do NOT auto-flash here: board.flash before an in-iframe user
        // gesture throws (the sim's AudioContext guard). The play button
        // (request_flash) is that gesture and drives every flash.
        this.setState({
          simReady: true
        });
        break;
      case 'request_flash':
        // User clicked the play button inside the sim
        if (this._pendingCode) {
          this._flash(this._pendingCode, this._pendingDebug);
          this._pendingCode = null;
          this._pendingDebug = null;
        }
        break;
      case 'serial_output':
        if (typeof e.data.data === 'string') {
          // Route through the debug controller: it splits RS-prefixed
          // markers out (driving the highlight/halt state) and returns
          // only the real program output. Outside a debug run it is a
          // passthrough, so this is unconditional.
          const text = this._dbg.feedSerial(e.data.data);
          if (text) this.setState(s => ({
            serial: s.serial + text
          }));
        }
        break;
      case 'state_change':
        // Could be used for LED readback, etc. — not wired yet.
        break;
    }
  }
  _flash(code, debug) {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    // A new flash ends any prior debug run (clears the old highlight).
    this._dbg.stop();
    if (debug && debug.trace) {
      this._dbg.beginTrace(debug.lineMap);
      this._wireConditions();
    } else if (debug) {
      this._dbg.begin(debug.positions, debug.procNames);
      this._wireConditions();
    }
    const encoder = new TextEncoder();
    const filesystem = {
      'main.py': encoder.encode(code)
    };
    iframe.contentWindow.postMessage({
      kind: 'flash',
      filesystem
    }, '*');
    this.setState({
      running: true,
      serial: ''
    });
  }

  /**
   * Wire conditional breakpoints for this run: the controller auto-continues
   * past a breakpoint whose condition is unmet. Reuses the SAME right-click
   * condition store (breakpoints.js) and parser (condition.js) as the 8051
   * debugger — lazy-loaded so a non-debug session never pulls the chunk.
   */
  _wireConditions() {
    Promise.all([__webpack_require__.e(/*! import() | bw-debug */ "bw-debug").then(__webpack_require__.bind(__webpack_require__, /*! ../../lib/bw-debug/breakpoints.js */ "./src/lib/bw-debug/breakpoints.js")), __webpack_require__.e(/*! import() | bw-debug */ "bw-debug").then(__webpack_require__.bind(__webpack_require__, /*! ../../lib/bw-debug/condition.js */ "./src/lib/bw-debug/condition.js"))]).then(_ref => {
      let [bp, cond] = _ref;
      const conditionOf = bp.conditionOf || (() => null);
      const parse = cond.parseCondition;
      const cache = new Map();
      this._dbg.setConditionFn(blockId => {
        const src = conditionOf(blockId);
        if (!src) return null;
        if (cache.has(src)) return cache.get(src);
        let parsed = null;
        try {
          parsed = parse(src);
        } catch (_unused5) {
          parsed = null;
        }
        // parseCondition returns {error} on bad input — no test(); treat
        // as unconditional (halt), never as a silent skip.
        const usable = parsed && typeof parsed.test === 'function' ? parsed : null;
        cache.set(src, usable);
        return usable;
      });
    }).catch(() => {/* no bw-debug chunk -> plain breakpoints only */});
  }

  /** Write a string to the program's serial-IN (the debug resume bytes). */
  _serialIn(text) {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      kind: 'serial_input',
      data: String(text)
    }, '*');
  }
  _stop() {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      kind: 'stop'
    }, '*');
    this._dbg.stop();
    this.setState({
      running: false
    });
  }
  _reset() {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      kind: 'reset'
    }, '*');
    this._dbg.stop();
    this.setState({
      serial: '',
      running: true
    });
  }
  render() {
    const t = L10N[pickLocale()];
    const {
      dbg
    } = this.state;
    const btn = {
      padding: '4px 12px',
      borderRadius: 6,
      border: 'none',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: 12,
      color: '#fff'
    };
    // Inspector pane styles (the 8051-parity state view).
    const inspHead = {
      fontWeight: 700,
      color: '#475569',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      fontSize: 10
    };
    const inspKey = {
      color: '#7c3aed',
      fontFamily: 'ui-monospace,Menlo,monospace',
      padding: '1px 6px 1px 0',
      verticalAlign: 'top',
      whiteSpace: 'nowrap'
    };
    const inspVal = {
      color: '#0f172a',
      fontFamily: 'ui-monospace,Menlo,monospace',
      padding: '1px 0',
      wordBreak: 'break-all'
    };
    const inspHint = {
      color: '#94a3b8',
      fontStyle: 'italic'
    };
    const inspBoardRow = {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 3
    };
    const inspChip = {
      background: '#e2e8f0',
      color: '#334155',
      borderRadius: 4,
      padding: '1px 5px',
      fontFamily: 'ui-monospace,Menlo,monospace',
      fontSize: 10
    };
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#f8fafc'
      },
      "data-testid": "bw-microbit-sim-pane"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '1 1 auto',
        minHeight: 200,
        position: 'relative'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("iframe", {
      ref: this._iframeRef,
      src: this.state.simUrl,
      title: t.simTitle,
      "data-testid": "bw-microbit-iframe",
      style: {
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#fff',
        borderRadius: 8
      },
      sandbox: "allow-scripts allow-same-origin"
    })), dbg.active ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        padding: '6px 8px',
        alignItems: 'center',
        flexShrink: 0,
        background: '#fef3c7',
        borderTop: '1px solid #fcd34d'
      },
      "data-testid": "bw-microbit-debug-bar"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this._dbg.step(),
      disabled: !dbg.halted,
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: dbg.halted ? '#7c3aed' : '#c4b5fd'
      }),
      "data-testid": "bw-microbit-debug-step"
    }, t.step), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this._dbg.cont(),
      disabled: !dbg.halted,
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: dbg.halted ? '#16a34a' : '#86efac'
      }),
      "data-testid": "bw-microbit-debug-continue"
    }, t.continue), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color: dbg.halted ? '#b45309' : '#166534'
      },
      "data-testid": "bw-microbit-debug-status"
    }, dbg.halted ? "".concat(t.pausedAt, " #").concat(dbg.index) : t.debugging)) : null, dbg.active ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 0,
        flexShrink: 0,
        maxHeight: 150,
        borderTop: '1px solid #e5e7eb',
        background: '#f8fafc',
        fontSize: 11
      },
      "data-testid": "bw-microbit-debug-inspector"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '1 1 34%',
        overflow: 'auto',
        padding: '6px 8px',
        borderRight: '1px solid #e5e7eb'
      },
      "data-testid": "bw-microbit-debug-vars"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHead
    }, t.vars), dbg.vars && Object.keys(dbg.vars).length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("table", {
      style: {
        borderCollapse: 'collapse',
        width: '100%'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("tbody", null, Object.keys(dbg.vars).map(k => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("tr", {
      key: k
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      style: inspKey
    }, k), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("td", {
      style: inspVal
    }, JSON.stringify(dbg.vars[k])))))) : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHint
    }, dbg.halted ? t.noVars : t.pauseToInspect)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '1 1 24%',
        overflow: 'auto',
        padding: '6px 8px',
        borderRight: '1px solid #e5e7eb'
      },
      "data-testid": "bw-microbit-debug-board"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHead
    }, t.board), dbg.board ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", null, Array.isArray(dbg.board.display) ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'inline-grid',
        gridTemplateColumns: 'repeat(5, 9px)',
        gap: 2,
        marginBottom: 4
      }
    }, dbg.board.display.map((row, y) => row.map((b, x) => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      key: "".concat(x, "-").concat(y),
      style: {
        width: 9,
        height: 9,
        borderRadius: 2,
        background: "rgba(220,38,38,".concat(Math.max(0, Math.min(9, b)) / 9, ")"),
        outline: '1px solid #fecaca'
      }
    })))) : null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspBoardRow
    }, 'buttonA' in dbg.board ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: inspChip
    }, "A:", dbg.board.buttonA) : null, 'buttonB' in dbg.board ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: inspChip
    }, "B:", dbg.board.buttonB) : null, 'temp' in dbg.board ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: inspChip
    }, dbg.board.temp, "\xB0C") : null, Array.isArray(dbg.board.accel) ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: inspChip
    }, "xyz:", dbg.board.accel.join(',')) : null)) : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHint
    }, dbg.halted ? '—' : t.pauseToInspect)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '1 1 22%',
        overflow: 'auto',
        padding: '6px 8px',
        borderRight: '1px solid #e5e7eb'
      },
      "data-testid": "bw-microbit-debug-stack"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHead
    }, t.stack), dbg.stack && dbg.stack.length ? /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }
    }, dbg.stack.map((f, i) => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      key: i,
      style: _objectSpread(_objectSpread({}, inspChip), {}, {
        alignSelf: 'flex-start',
        marginLeft: i * 8,
        background: i === dbg.stack.length - 1 ? '#7c3aed' : '#e2e8f0',
        color: i === dbg.stack.length - 1 ? '#fff' : '#334155'
      })
    }, f.name))) : /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHint
    }, t.topLevel)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '1 1 22%',
        overflow: 'auto',
        padding: '6px 8px'
      },
      "data-testid": "bw-microbit-debug-trace"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: inspHead
    }, t.trace), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 3
      }
    }, dbg.trace.slice(-24).map((tr, i, a) => /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      key: i,
      style: _objectSpread(_objectSpread({}, inspChip), {}, {
        background: i === a.length - 1 ? '#7c3aed' : '#e2e8f0',
        color: i === a.length - 1 ? '#fff' : '#334155'
      })
    }, "#", tr.n))))) : null, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        padding: '6px 8px',
        alignItems: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this._stop(),
      disabled: !this.state.running,
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: this.state.running ? '#dc2626' : '#94a3b8'
      }),
      "data-testid": "bw-microbit-stop"
    }, t.stop), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this._reset(),
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: '#2563eb'
      }),
      "data-testid": "bw-microbit-reset"
    }, t.reset), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this.setState({
        serial: ''
      }),
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: '#6b7280'
      }),
      "data-testid": "bw-microbit-clear-serial"
    }, t.clear), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        fontSize: 11,
        color: '#64748b'
      }
    }, this.state.simReady ? this.state.running ? t.running : t.ready : t.loading)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '0 0 auto',
        maxHeight: 160,
        minHeight: 60,
        overflow: 'auto',
        padding: '6px 8px',
        background: '#1e293b',
        color: '#e2e8f0',
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        fontSize: 12,
        lineHeight: 1.4,
        borderTop: '1px solid #334155',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all'
      },
      "data-testid": "bw-microbit-serial"
    }, this.state.serial || t.serialPlaceholder));
  }
}
MicrobitSimPane.propTypes = {
  vm: prop_types__WEBPACK_IMPORTED_MODULE_3___default().shape({
    runtime: (prop_types__WEBPACK_IMPORTED_MODULE_3___default().object)
  })
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ((0,react_redux__WEBPACK_IMPORTED_MODULE_1__.connect)(state => ({
  vm: state.scratchGui.vm
}))(MicrobitSimPane));

/***/ }),

/***/ "./src/lib/bw-debug/microbit-debug.js":
/*!********************************************!*\
  !*** ./src/lib/bw-debug/microbit-debug.js ***!
  \********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createMarkerSplitter: () => (/* binding */ createMarkerSplitter),
/* harmony export */   createMicrobitDebugController: () => (/* binding */ createMicrobitDebugController)
/* harmony export */ });
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * The micro:bit instrumentation debugger — a SEPARATE lightweight controller.
 *
 * MICROBIT-NATIVE.md Stage 3 (the CORRECTION): the WASM MicroPython sim is a
 * black-box real-time VM in an iframe. It has no program clock to budget and no
 * single-stepping, so it does NOT fit the boundary-D `DebugTarget` contract the
 * 8051/AVR/6502 emulators satisfy (`runFor(budgetNs)`, `insn` stepping). Forcing
 * it into that contract would be a front end that lies. Instead, the compiler
 * INSTRUMENTS the program: `generateMicroPython(project, {debug:true,
 * breakpoints:[<blockId>...]})` emits `_bw_pos(n)` markers that print position
 * over the sim's existing serial channel before each block runs, and HALT (spin
 * on `input()`) at a breakpoint. This is the same lever the 8051 monitor's
 * Level-1 position uses (read state, do not VM-step) — DEBUG-CONTROL-MODEL §2.
 *
 * This controller owns:
 *   - the serial marker parser (RS-prefixed control tokens split from real
 *     print() output — the one genuinely testable core, see createMarkerSplitter);
 *   - the live position → source-block highlight, via the SAME call the 8051
 *     debugger uses: `vm.runtime.glowBlock(blockId, on)`;
 *   - the halt/step/continue state machine, driving the sim's serial-IN.
 *
 * capabilities() reports `steps: ['block']`, `breakpoints: ['block']`, and
 * refuses `insn`/`line`/`over`/`out` — exactly as the on-chip 8051 monitor
 * refuses what it cannot do (MICROBIT-NATIVE §2). It is the honest first
 * micro:bit debugger: block-level position and block breakpoints, over the sim
 * we already ship, no VM changes.
 *
 * ## The wire protocol (the codegen contract this consumes)
 *
 * Over serial-OUT, the debug build prints, BEFORE each block runs:
 *   `\x1e<n>\n`     — position marker: block index n is about to run
 *   `\x1e!<n>\n`    — HALT marker: paused at block n (breakpoint or pending step)
 * and, immediately after a HALT, one state frame each (the 8051-parity panes):
 *   `\x1eV<json>\n` — VARIABLES: {name: value} of the user's variables/lists
 *   `\x1eB<json>\n` — BOARD: micro:bit snapshot {display, buttonA/B, accel, temp}
 * and, around every procedure call (the call-stack pane):
 *   `\x1e>k\n`      — ENTER procedure index k (push a frame)
 *   `\x1e<\n`       — EXIT (pop the innermost frame)
 * `procNames[k]` maps a frame index to its display name.
 * The `V`/`B` payloads are single-line JSON (no `\n`, no RS), so the newline
 * delimiter is unambiguous. `\x1e` is RS (0x1e, 0o036). Markers interleave with
 * real `print()` output and MUST be split out. The host resumes over serial-IN:
 *   `\x1es\r`       — step: run to the next block, then halt again
 *   `\x1ec\r`       — continue: run until the next breakpoint (or end)
 * `positions[n] = {block: <scratch block id>}` maps a marker back to the block
 * to highlight.
 *
 * ## Resume line discipline — verified against the shipped WASM sim (2026-08-19)
 *
 * The generated `_bw_pos` resumes by reading a LINE via `input()`. Driving the
 * real `micropython-microbit-v2-simulator` from Playwright showed its `input()`
 * behaves like a cooked terminal, NOT a raw byte pipe:
 *   - the line terminator MUST be `\r` (CR) — a bare `\n` (LF) never completes
 *     the read and the program stays blocked (a silent deadlock);
 *   - the RS byte `\x1e` is STRIPPED before `input()` returns — sending
 *     `\x1es\r` makes `input()` return `'s'`, not `'\x1es'`.
 * So this controller terminates every resume with `\r`. The RS prefix is kept
 * (harmless, and it documents intent), but the codegen's comparison must not
 * rely on it surviving — see the KNOWN CODEGEN DEPENDENCY note on step()/cont().
 *
 * @module
 */

/** RS — the control-byte prefix. 0x1e. */
const RS = '\x1e';

/**
 * A stateful splitter that separates RS-prefixed control tokens from real
 * program output across a CHUNKED stream. The serial arrives in arbitrary
 * fragments — an RS may land in one chunk and its digits (or newline) in the
 * next — so a partial token is retained in the buffer until its terminating
 * newline arrives.
 *
 * This is deliberately a pure, DOM-free function so it can be unit-tested
 * against a chunked stream with interleaved real output (the acceptance test
 * MICROBIT-NATIVE Stage-3 asks for when a full E2E is too much).
 *
 * @returns {{feed: (chunk: string) => {text: string, events: Array<{type:'pos'|'halt', n:number}>}, reset: () => void}}
 */
function createMarkerSplitter() {
  let buf = '';
  return {
    /**
     * Feed a chunk. Returns the real (non-control) text it contained and the
     * control events it completed. A control token split across this and a
     * future chunk yields no event yet — it stays buffered.
     */
    feed(chunk) {
      buf += String(chunk);
      let text = '';
      const events = [];
      for (;;) {
        const rs = buf.indexOf(RS);
        if (rs === -1) {
          // No control byte left: everything is real output.
          text += buf;
          buf = '';
          break;
        }
        // Everything before the RS is real output.
        text += buf.slice(0, rs);
        const nl = buf.indexOf('\n', rs);
        if (nl === -1) {
          // Partial control token — retain from RS for the next chunk.
          buf = buf.slice(rs);
          break;
        }
        const token = buf.slice(rs + 1, nl); // between RS and the newline
        const kind = token.charCodeAt(0);
        if (kind === 0x21 /* ! */) {
          events.push({
            type: 'halt',
            n: parseInt(token.slice(1), 10)
          });
        } else if (kind === 0x56 /* V */ || kind === 0x42 /* B */) {
          // State frame: the rest of the token is single-line JSON.
          let data = null;
          try {
            data = JSON.parse(token.slice(1));
          } catch (_unused) {
            data = null;
          }
          if (data !== null) {
            events.push({
              type: kind === 0x56 ? 'vars' : 'board',
              data
            });
          }
        } else if (kind === 0x3e /* > */) {
          events.push({
            type: 'enter',
            n: parseInt(token.slice(1), 10)
          });
        } else if (kind === 0x3c /* < */) {
          events.push({
            type: 'exit'
          });
        } else if (kind === 0x4c /* L */) {
          // settrace line event: position is a Python line number.
          events.push({
            type: 'line',
            n: parseInt(token.slice(1), 10)
          });
        } else if (kind === 0x4b /* K */) {
          // settrace call stack: a JSON list of frame names (innermost first).
          let data = null;
          try {
            data = JSON.parse(token.slice(1));
          } catch (_unused2) {
            data = null;
          }
          if (data !== null) events.push({
            type: 'kstack',
            data
          });
        } else {
          events.push({
            type: 'pos',
            n: parseInt(token, 10)
          });
        }
        buf = buf.slice(nl + 1);
      }
      return {
        text,
        events
      };
    },
    reset() {
      buf = '';
    }
  };
}

/**
 * Create a micro:bit debug controller.
 *
 * @param {object} opts
 * @param {(blockId: string, on: boolean) => void} [opts.glow] highlight a block
 *   — the injected `vm.runtime.glowBlock`. Injected rather than imported so the
 *   controller stays DOM/VM-free and testable.
 * @param {(text: string) => void} [opts.sendSerialIn] write to the sim's
 *   serial-IN (resume bytes). Injected because the iframe is owned by the pane.
 * @param {(state: object) => void} [opts.onChange] called whenever UI state changes.
 */
function createMicrobitDebugController() {
  let opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  let glowFn = opts.glow || null;
  let sendFn = opts.sendSerialIn || null;
  // condFn(blockId) -> a parsed condition ({test(vars)}) or null. Injected so
  // the controller reuses the shared 8051 condition parser/store without
  // importing it (stays DOM/VM-free). A conditional breakpoint is an ordinary
  // breakpoint (the codegen halts on it) that the host auto-continues past
  // when the condition is unmet — evaluated against the \x1eV variables frame.
  let condFn = opts.condition || null;
  const onChange = opts.onChange || (() => {});
  const splitter = createMarkerSplitter();
  /** @type {Array<{block: string}>} n -> {block} from generateMicroPython. */
  let positions = [];
  /** @type {string[]} k -> proc display name, from generateMicroPython. */
  let procNames = [];
  /** 'marker' (\x1e<n> block-level) or 'trace' (\x1eL line-level, settrace). */
  let mode = 'marker';
  /** @type {Object<number,string>} python line -> block id, settrace mode. */
  let lineMap = {};
  /** The block currently lit, so a re-glow is a no-op and stop clears exactly one. */
  let litBlock = null;

  /** Cap the retained trace so a long run cannot grow the panel unbounded. */
  const TRACE_CAP = 500;
  let state = {
    active: false,
    // a debug run is in progress
    running: false,
    // program is advancing
    halted: false,
    // paused at a breakpoint / after a step
    block: null,
    // scratch block id of the current position
    index: null,
    // position marker index n
    vars: null,
    // {name: value} snapshot from the last halt (the memory pane)
    board: null,
    // micro:bit board snapshot from the last halt (pin/sensor pane)
    trace: [],
    // execution history: [{n, block}, …] (most recent last, capped)
    stack: [] // call stack: [{k, name}, …] (outermost first) from enter/exit
  };
  function snapshot() {
    return _objectSpread({}, state);
  }
  function emit() {
    onChange(snapshot());
  }
  function setGlow(block) {
    if (block === litBlock) return;
    if (litBlock && glowFn) {
      try {
        glowFn(litBlock, false);
      } catch (_unused3) {/* stale id */}
    }
    if (block && glowFn) {
      try {
        glowFn(block, true);
      } catch (_unused4) {/* stale id */}
    }
    litBlock = block;
  }

  // Send a resume byte and mark the program running again. Shared by the
  // Step/Continue buttons and the conditional-breakpoint auto-continue.
  function doResume(byte) {
    if (sendFn) sendFn("".concat(RS).concat(byte, "\r"));
    state.halted = false;
    state.running = true;
    emit();
  }

  // A halt at `block` should stick only if there is no condition, or the
  // condition (evaluated against the just-arrived variables) is met. Returns
  // true when the host should silently continue instead of pausing.
  function conditionUnmet(block, vars) {
    if (!condFn) return false;
    let cond = null;
    try {
      cond = condFn(block);
    } catch (_unused5) {
      cond = null;
    }
    if (!cond) return false;
    try {
      return !cond.test(vars || {});
    } catch (_unused6) {
      return false;
    } // eval error -> pause (safe)
  }
  return {
    /** Inject the highlight sink (needs the VM, owned by the panel/pane). */
    setGlowFn(fn) {
      glowFn = fn;
    },
    /** Inject the serial-IN sink (needs the iframe, owned by the pane). */
    setSerialInFn(fn) {
      sendFn = fn;
    },
    /** Inject the condition lookup (blockId -> {test(vars)} | null). */
    setConditionFn(fn) {
      condFn = fn;
    },
    /**
     * Begin a debug run: adopt the positions map from generateMicroPython
     * and reset the marker parser. The flash itself is the pane's job.
     */
    begin(pos, procs) {
      mode = 'marker';
      positions = Array.isArray(pos) ? pos : [];
      procNames = Array.isArray(procs) ? procs : [];
      splitter.reset();
      setGlow(null);
      state = {
        active: true,
        running: true,
        halted: false,
        block: null,
        index: null,
        vars: null,
        board: null,
        trace: [],
        stack: []
      };
      emit();
    },
    /**
     * Begin a LINE-LEVEL (settrace) debug run. Position arrives as a Python
     * line number (\x1eL) mapped to a block via `map` ({line: blockId}); the
     * program halts on a breakpoint line or a step, signalled by the \x1eV
     * state frame (there is no separate halt marker — _bw_halt blocks on
     * input() right after dumping state). Needs the debug firmware.
     */
    beginTrace(map) {
      mode = 'trace';
      lineMap = map && typeof map === 'object' ? map : {};
      positions = [];
      procNames = [];
      splitter.reset();
      setGlow(null);
      state = {
        active: true,
        running: true,
        halted: false,
        block: null,
        index: null,
        vars: null,
        board: null,
        trace: [],
        stack: []
      };
      emit();
    },
    /**
     * Feed a serial-OUT chunk. Returns the REAL program output to display;
     * control markers are consumed and drive the highlight / halt state.
     * When no debug run is active it is a passthrough, so the pane can route
     * every chunk through it unconditionally.
     */
    feedSerial(chunk) {
      if (!state.active) return String(chunk);
      const {
        text,
        events
      } = splitter.feed(chunk);
      let changed = false;
      let autoContinue = false;
      for (const ev of events) {
        if (ev.type === 'vars') {
          // State frame — attaches to the halt we are already paused at,
          // no position change. The last frame of a name wins. This is
          // also when a conditional breakpoint is decided: the variables
          // it tests have just arrived. In TRACE mode there is no \x1e!
          // marker: \x1eV itself signals the halt (_bw_halt blocks on
          // input() right after printing it).
          state.vars = ev.data;
          if (mode === 'trace') {
            state.halted = true;
            state.running = false;
          }
          changed = true;
          if (state.halted && conditionUnmet(state.block, state.vars)) autoContinue = true;
          continue;
        }
        if (ev.type === 'board') {
          state.board = ev.data;
          changed = true;
          continue;
        }
        if (ev.type === 'line') {
          // settrace position: a Python line number -> block via lineMap.
          const block = lineMap[ev.n] || null;
          state.index = ev.n;
          state.block = block;
          // A fresh line while halted means we resumed and moved on.
          state.halted = false;
          state.running = true;
          state.trace.push({
            n: ev.n,
            block
          });
          if (state.trace.length > TRACE_CAP) state.trace.shift();
          setGlow(block);
          changed = true;
          continue;
        }
        if (ev.type === 'kstack') {
          // settrace call stack: [innermost..outermost] frame names.
          // Store outermost-first, matching the marker stack's order.
          state.stack = (Array.isArray(ev.data) ? ev.data : []).map(name => ({
            name: String(name)
          })).reverse();
          changed = true;
          continue;
        }
        if (ev.type === 'enter') {
          // Push a call-stack frame (a procedure was entered).
          state.stack = state.stack.concat({
            k: ev.n,
            name: procNames[ev.n] || "proc ".concat(ev.n)
          });
          changed = true;
          continue;
        }
        if (ev.type === 'exit') {
          // Pop the innermost frame (the procedure returned/closed).
          state.stack = state.stack.slice(0, -1);
          changed = true;
          continue;
        }
        const entry = positions[ev.n];
        const block = entry && entry.block || null;
        state.index = ev.n;
        state.block = block;
        if (ev.type === 'halt') {
          state.halted = true;
          state.running = false;
        } else {
          // A fresh position marker while halted means the program
          // resumed and moved on (step landed / continue ran).
          state.halted = false;
          state.running = true;
          // Record the step into the execution trace (position pane).
          state.trace.push({
            n: ev.n,
            block
          });
          if (state.trace.length > TRACE_CAP) state.trace.shift();
        }
        setGlow(block);
        changed = true;
      }
      if (autoContinue) {
        // Conditional breakpoint not met: resume silently. doResume()
        // flips halted->false and emits, so the pause never surfaces.
        doResume('c');
      } else if (changed) {
        emit();
      }
      return text;
    },
    /**
     * ⏭ — step to the next block, which re-halts (the codegen latches).
     *
     * KNOWN CODEGEN DEPENDENCY: `\r` (not `\n`) is required to complete the
     * sim's `input()`, and the sim STRIPS the leading `\x1e`, so `input()`
     * returns `'s'`. The upstream `_bw_pos` must therefore compare the
     * RS-stripped char (e.g. `c[-1:] == 's'`), not `c == '\x1es'`. Verified
     * end-to-end 2026-08-19 (scripts/probe-microbit-resume.mjs).
     */
    step() {
      if (!state.active) return;
      doResume('s');
    },
    /** ▶ — continue to the next breakpoint (or program end). Clears paused. */
    cont() {
      if (!state.active) return;
      doResume('c');
    },
    /** ⏹ — end the debug run and clear the highlight. */
    stop() {
      splitter.reset();
      setGlow(null);
      state = {
        active: false,
        running: false,
        halted: false,
        block: null,
        index: null,
        vars: null,
        board: null,
        trace: [],
        stack: []
      };
      emit();
    },
    /**
     * The capability column for this target (MICROBIT-NATIVE §2). Block-level
     * only; `insn`/`line`/`over`/`out` are refused honestly so a shared panel
     * greys them out rather than pretending.
     */
    capabilities() {
      // Trace mode (settrace, debug firmware) steps by source LINE with
      // real frames; marker mode (stock firmware) steps by block. Honest
      // either way — insn/over/out are refused; there is no VM stepping.
      const line = mode === 'trace';
      return {
        steps: [line ? 'line' : 'block'],
        breakpoints: [line ? 'line' : 'block'],
        insn: false,
        line,
        over: false,
        out: false,
        consumes: []
      };
    },
    state: snapshot,
    get active() {
      return state.active;
    },
    get halted() {
      return state.halted;
    }
  };
}

/***/ })

}]);