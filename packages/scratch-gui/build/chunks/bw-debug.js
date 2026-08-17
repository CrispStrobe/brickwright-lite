"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-debug"],{

/***/ "./src/lib/bw-debug/breakpoints.js":
/*!*****************************************!*\
  !*** ./src/lib/bw-debug/breakpoints.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   allConditions: () => (/* binding */ allConditions),
/* harmony export */   clearBreakpoints: () => (/* binding */ clearBreakpoints),
/* harmony export */   conditionOf: () => (/* binding */ conditionOf),
/* harmony export */   isBreakpoint: () => (/* binding */ isBreakpoint),
/* harmony export */   listBreakpoints: () => (/* binding */ listBreakpoints),
/* harmony export */   setCondition: () => (/* binding */ setCondition),
/* harmony export */   subscribeBreakpoints: () => (/* binding */ subscribeBreakpoints),
/* harmony export */   toggleBreakpoint: () => (/* binding */ toggleBreakpoint)
/* harmony export */ });
/**
 * Where breakpoints live.
 *
 * They are kept HERE rather than inside the runner because the two have
 * different lifetimes and the user's is the longer one: you set a breakpoint by
 * right-clicking a block, which you do before pressing ⚑, when no runner, no
 * emulator and no symbol table exist yet. A store owned by the runner would
 * drop everything set before the first run and again on every stop.
 *
 * So the model is: **the user's breakpoints are a property of the project, and
 * the runner subscribes to them.** A block id is the key, because that is the
 * thing the user actually pointed at — not a task, not a state, not an address,
 * all of which are minted afresh by every build.
 *
 * A block that is not a yield point can still be marked. The runner resolves
 * what it can when it attaches and reports the rest as unreachable, which is a
 * better answer than refusing the click on a block that looks, to the user,
 * exactly like its neighbour (`debugger-ui.md` §3).
 *
 * @module
 */

/** @type {Set<string>} block ids the user has marked. */
const marked = new Set();

/**
 * @type {Map<string, string>} block id -> condition source, for the marks that
 * have one. Kept beside the set rather than inside it so that clearing a
 * condition never clears the mark: "pause here, but only when…" and "pause
 * here" are the same breakpoint with a filter, and losing the breakpoint while
 * editing its filter would be its own small betrayal.
 */
const conditions = new Map();

/** @type {Set<(ids: string[]) => void>} */
const listeners = new Set();
function notify() {
  const ids = [...marked];
  for (const cb of listeners) cb(ids);
}

/** Is this block marked? */
function isBreakpoint(blockId) {
  return marked.has(blockId);
}

/** Every marked block, in insertion order. */
function listBreakpoints() {
  return [...marked];
}

/**
 * Mark or unmark a block.
 * @returns {boolean} true if it is now marked
 */
function toggleBreakpoint(blockId) {
  if (!blockId) return false;
  if (marked.has(blockId)) {
    marked.delete(blockId);
    conditions.delete(blockId);
  } else marked.add(blockId);
  notify();
  return marked.has(blockId);
}

/**
 * Attach (or with a falsy value, remove) a condition on a mark.
 * Marks the block if it was not marked — asking to pause when `counter > 10`
 * plainly means pause here.
 */
function setCondition(blockId, source) {
  if (!blockId) return;
  if (source) {
    marked.add(blockId);
    conditions.set(blockId, String(source));
  } else conditions.delete(blockId);
  notify();
}

/** The condition on this mark, or null. */
function conditionOf(blockId) {
  return conditions.get(blockId) || null;
}

/** Every condition, as {blockId: source}. */
function allConditions() {
  return Object.fromEntries(conditions);
}

/** Forget everything. Loading a different project should call this. */
function clearBreakpoints() {
  if (!marked.size) return;
  marked.clear();
  conditions.clear();
  notify();
}

/**
 * Watch the set. Calls back immediately with the current contents, so a
 * subscriber never has to ask separately for the state it just missed.
 * @returns {() => void} unsubscribe
 */
function subscribeBreakpoints(cb) {
  listeners.add(cb);
  cb([...marked]);
  return () => listeners.delete(cb);
}

/***/ }),

/***/ "./src/lib/bw-debug/condition.js":
/*!***************************************!*\
  !*** ./src/lib/bw-debug/condition.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   parseCondition: () => (/* binding */ parseCondition)
/* harmony export */ });
/**
 * "Pause here when counter > 10" — the condition on a pause point.
 *
 * ## Why this is a parser and not `eval`
 *
 * The obvious implementation is `new Function('counter', 'return ' + expr)`.
 * That would run arbitrary code from a project file with full page access, in
 * an editor whose whole point is that children load each other's projects. A
 * condition is a comparison between a variable and a number; nothing about it
 * needs a programming language. So this parses a grammar small enough to read
 * in one sitting and evaluates it directly.
 *
 *     condition := comparison (('and' | 'or') comparison)*
 *     comparison := operand op operand
 *     operand   := <variable name> | <number>
 *     op        := > | < | >= | <= | = | == | != | <>
 *
 * `=` means equals, because that is what a Scratch user writes; `==` is
 * accepted too rather than being a trap.
 *
 * ## What it deliberately cannot do
 *
 * No arithmetic, no parentheses, no function calls. If someone needs
 * `counter * 2 > limit` they can add a variable — and a condition that needs
 * arithmetic is usually better expressed as one. The limit is stated in the UI
 * rather than discovered by a silent wrong answer: an expression this cannot
 * parse is REJECTED with the reason, never quietly treated as true (which
 * would pause every time) or as false (which would pause never, and look like
 * a broken breakpoint).
 *
 * @module
 */

const OPS = {
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '!=': (a, b) => a !== b,
  '<>': (a, b) => a !== b,
  '==': (a, b) => a === b,
  '=': (a, b) => a === b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b
};

// Longest first, so `>=` is not read as `>` followed by a stray `=`.
const OP_ORDER = ['>=', '<=', '!=', '<>', '==', '=', '>', '<'];

/**
 * @typedef {object} Condition
 * @property {(vars: Record<string, number>) => boolean} test
 * @property {string} source
 */

/**
 * Parse a condition.
 *
 * @param {string} source
 * @returns {Condition | {error: string}}
 */
function parseCondition(source) {
  const text = String(source || '').trim();
  if (!text) return {
    error: 'empty condition'
  };

  // Split on `and` / `or` as whole words, keeping the joiners.
  const parts = text.split(/\s+(and|or)\s+/i);
  const clauses = [];
  const joiners = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      joiners.push(parts[i].toLowerCase());
      continue;
    }
    const clause = parseComparison(parts[i]);
    if (clause.error) return clause;
    clauses.push(clause);
  }
  return {
    source: text,
    /** The variables this mentions, so a caller can warn about typos. */
    names: clauses.flatMap(c => c.names),
    test(vars) {
      let result = clauses[0].test(vars);
      for (let i = 0; i < joiners.length; i++) {
        const next = clauses[i + 1].test(vars);
        result = joiners[i] === 'and' ? result && next : result || next;
      }
      return result;
    }
  };
}
function parseComparison(text) {
  const clause = text.trim();
  for (const op of OP_ORDER) {
    const at = clause.indexOf(op);
    if (at <= 0) continue;
    const left = clause.slice(0, at).trim();
    const right = clause.slice(at + op.length).trim();
    const l = parseOperand(left);
    const r = parseOperand(right);
    if (l.error) return l;
    if (r.error) return r;
    const names = [l, r].filter(o => o.name).map(o => o.name);
    return {
      names,
      test(vars) {
        const a = l.name ? valueOf(vars, l.name) : l.value;
        const b = r.name ? valueOf(vars, r.name) : r.value;
        // An unknown name makes the whole comparison false rather than
        // throwing: the variable may simply not exist in this build,
        // and a pause point that explodes is worse than one that
        // never fires. The UI warns about unknown names separately.
        if (a === null || b === null) return false;
        return OPS[op](a, b);
      }
    };
  }
  return {
    error: "no comparison in \"".concat(clause, "\" \u2014 try  counter > 10")
  };
}
function parseOperand(text) {
  // Decimals are accepted even though every variable in a generateC build is
  // a 16-bit int. `speed > 1.5` can never be an equality, but as an
  // inequality it is exactly as meaningful as `speed > 1`, and a Scratch user
  // — whose variables ARE floats — will write it. Rejecting it taught nothing.
  if (/^-?\d+(\.\d+)?$/.test(text)) return {
    value: Number(text)
  };
  if (/^[A-Za-z_][\w ]*$/.test(text)) return {
    name: text.trim()
  };
  return {
    error: "\"".concat(text, "\" is neither a number nor a variable name")
  };
}
function valueOf(vars, name) {
  const v = vars[name];
  return typeof v === 'number' ? v : null;
}

/***/ }),

/***/ "./src/lib/bw-debug/debug-runner.js":
/*!******************************************!*\
  !*** ./src/lib/bw-debug/debug-runner.js ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createDebugRunner: () => (/* binding */ createDebugRunner),
/* harmony export */   selectDebugTargetKind: () => (/* binding */ selectDebugTargetKind)
/* harmony export */ });
/* harmony import */ var _breakpoints_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./breakpoints.js */ "./src/lib/bw-debug/breakpoints.js");
/* harmony import */ var _condition_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./condition.js */ "./src/lib/bw-debug/condition.js");
/* harmony import */ var _trace_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./trace.js */ "./src/lib/bw-debug/trace.js");
/* harmony import */ var _hover_values_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./hover-values.js */ "./src/lib/bw-debug/hover-values.js");
/* harmony import */ var _opcodes_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./opcodes.js */ "./src/lib/bw-debug/opcodes.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
/**
 * The debug runner — everything between "a project" and "a glowing block".
 *
 * Design: `sb3-creator/reference/debugger-ui.md`. This is the host side of it:
 * bw-board owns the target and the session (both framework-free and tested in
 * Node), and this file owns the four things only a browser can do — build the
 * image over the network, instantiate the WASM, drive a frame loop, and light
 * up a block in the editor.
 *
 *     project  --generateC({debug:true})-->  C + @bw yield map
 *              --POST /compile{symbols}-->   .hex + symbol table
 *              --emu8051 + bw-board------->  a running, breakable program
 *              --why.tasks + yields[].block->  vm.runtime.glowBlock
 *
 * ## Why the symbol table has to come from the server
 *
 * A browser cannot run SDCC and cannot run stc_symtab.py, and the yield map
 * alone is not enough: it says WHICH BLOCK each `(task, state)` is, but not
 * where `<task>_state` lives in RAM or what code address a yield sits at. Only
 * the linker knows that. So `POST /compile {"symbols": true}` returns both, and
 * the two are joined here — by `(task, state)`, which is the one key that
 * survives the whole chain.
 *
 * ## Debug builds are not release builds, twice over
 *
 * `generateC({debug: true})` forces the cooperative scheduler even for a single
 * script (straight-line code in `main()` has no position to report), and
 * `--debug` makes SDCC stop tail-merging returns so line records map cleanly —
 * measured at 8 of 39 hex records different on a two-task program. The program
 * behaves the same; it is not the same bytes. So the image and the symbol table
 * must always come from the SAME request, and a debug image is never the thing
 * to flash.
 *
 * @module
 */







/**
 * How many suppressed breakpoint hits one frame will absorb before yielding to
 * the browser. A yield breakpoint on a `wait` re-fires every pass of the
 * dispatch loop, so this is routinely in the thousands.
 */
const SKIP_BUDGET = 20000;

/**
 * Route compilation to the local WASM toolchain, if the user asked for it.
 *
 * The preview flag gates a ~1.6 MiB download, so the check happens BEFORE the
 * dynamic import — a flag read inside the imported module would let webpack
 * fetch the chunk for everyone and gate nothing. That diagnosis is bw-bundle's.
 *
 * It lives here rather than in the circuit tab because the intercept patches
 * `globalThis.fetch` and only matters at the moment something compiles. Wired
 * to tab visibility, a user who opted in and pressed run without ever opening
 * the Circuit tab would silently get the hosted compiler instead — the flag
 * would appear not to work, depending on which tab they had visited.
 *
 * A failure here is reported, not swallowed. Someone who deliberately turned on
 * a preview flag is owed the reason it did not take effect; falling back to the
 * hosted compiler in silence is the same bug this file's other catch blocks
 * exist to prevent.
 *
 * @param {(phase: string, detail: string) => void} setStatus
 */
let wasmCompilerInstalled = false;
function installWasmCompilerIfOptedIn(_x) {
  return _installWasmCompilerIfOptedIn.apply(this, arguments);
}
/**
 * @param {object} opts
 * @param {object} opts.vm the scratch-vm instance (for toJSON and glowBlock)
 * @param {string} [opts.compilerUrl] the stc-compiler service
 * @param {(state: object) => void} [opts.onChange] UI state changed
 */
/**
 * Choose a faithful execution backend when the user has not explicitly
 * requested a different transport. Arduino boards are ATmega328P targets;
 * routing them through the STC emulator would make every result plausible
 * but wrong. Pico routes to the rp2040js target (the code below has
 * done so since the hosted compile chain closed) — an earlier version
 * of this comment claimed Pico was unavailable long after it wasn't,
 * and the stale claim was believed over the code (2026-08-17).
 *
 * @param {string} device project device identifier
 * @param {string} requested target picker selection
 * @returns {string}
 */
function _installWasmCompilerIfOptedIn() {
  _installWasmCompilerIfOptedIn = _asyncToGenerator(function* (setStatus) {
    if (wasmCompilerInstalled) return;
    let wanted = false;
    try {
      wanted = typeof localStorage !== 'undefined' && localStorage.getItem('bw-use-wasm-compiler') === '1';
    } catch (_unused6) {/* private browsing: no localStorage, treat as not opted in */}
    if (!wanted) return;
    try {
      const m = yield __webpack_require__.e(/*! import() | sdcc-wasm */ "sdcc-wasm").then(__webpack_require__.bind(__webpack_require__, /*! ../sdcc-wasm/intercept.js */ "./src/lib/sdcc-wasm/intercept.js"));
      m.installWasmCompilerIntercept();
      wasmCompilerInstalled = true;
    } catch (e) {
      // A missing chunk here is usually a stale build, which the page can fix.
      const recovering = typeof window !== 'undefined' && window.__bwRecoverFromStaleBuild && window.__bwRecoverFromStaleBuild(e && e.message);
      if (!recovering) {
        setStatus('building', 'local compiler unavailable — using the hosted one');
        console.warn('[brickwright] WASM compiler opted in but failed to load:', e);
      }
    }
  });
  return _installWasmCompilerIfOptedIn.apply(this, arguments);
}
function selectDebugTargetKind(device) {
  let requested = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'emulator';
  if (requested !== 'emulator') return requested;
  const normalized = String(device || '').toLowerCase();
  if (['arduino-uno', 'arduino-nano', 'atmega328p', 'atmega168p'].includes(normalized)) return 'avr8js';
  if (['arduino-mega', 'atmega2560'].includes(normalized)) return 'atmega2560';
  // Chip-specific AVR kinds — the coarse avr8js kind is an ATmega328P
  // memory map, which is NOT where an ATtiny's ports live. Falling
  // through to the 8051 emulator here fed AVR opcodes to an 8051 core
  // (the pendant's frozen 2433 ms, every pin off — owner report).
  if (normalized === 'attiny88') return 'attiny88';
  if (normalized === 'attiny85') return 'attiny85';
  if (normalized === 'pico') return 'rp2040js';
  if (['eater6502', '6502', 'w65c02'].includes(normalized)) return 'eater6502';
  if (['z80', 'zx48', 'zx128'].includes(normalized)) return 'z80';
  return requested;
}

/**
 * One-board-one-truth, with the CLOCK taken seriously: the designer board
 * and the auto-run race. An example loads its PROGRAM first (loadProject
 * fires the run token, and a cache-warm compile returns in well under a
 * second) while the circuit fetch and the designer's own render are still
 * in flight — so at attach time vm.runtime.circuitBoard can be legitimately
 * empty for a few hundred milliseconds and legitimately full right after.
 * Falling back to the inferred netlist on that first read is how the
 * pendant ran on a synthesized LED_colX bench while the real ATtiny88 +
 * matrix sat on screen (owner report, 2026-08-16). Wait briefly; fall back
 * only when the designer genuinely never shows up.
 */
function resolveNetlist(_x2, _x3, _x4) {
  return _resolveNetlist.apply(this, arguments);
}
/** Tell the UI which board the runner is actually driving. */
function _resolveNetlist() {
  _resolveNetlist = _asyncToGenerator(function (vm, stc, inferNetlist) {
    let waitMs = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 2500;
    return function* () {
      const fromDesigner = () => {
        const b = vm && vm.runtime && vm.runtime.circuitBoard;
        return b && Array.isArray(b.parts) && b.parts.length && typeof b.getNets === 'function' ? {
          parts: b.parts,
          nets: b.getNets()
        } : null;
      };
      let n = fromDesigner();
      const deadline = Date.now() + waitMs;
      while (!n && Date.now() < deadline) {
        yield new Promise(resolve => setTimeout(resolve, 100));
        n = fromDesigner();
      }
      if (!n) {
        // Distinguish "designer not mounted" from "designer REJECTED the
        // netlist": a rejected netlist leaves the board empty, and falling
        // back to inference here made the emulator drive a phantom bench of
        // auto-generated LEDs while the canvas showed the real circuit (the
        // retro console, 2026-08-16 — the 'Blink stopped blinking' family).
        // A rejection is the user's to see, never ours to paper over.
        const model = vm && vm.runtime && vm.runtime.circuitModel;
        if (model && model.netlistError) {
          throw new Error('the circuit on the canvas was rejected by the engine — ' + 'refusing to run against a phantom inferred bench. First error: ' + String(model.netlistError).split('\n')[0]);
        }
        // Second choice before inventing anything: the EXAMPLE'S OWN
        // circuit, stashed by the importer at load time. Bench files carry
        // nets directly; authored circuits carry wires, whose connected
        // components ARE the nets (union-find).
        const stash = typeof window !== 'undefined' && window.__bwExampleBench;
        if (stash && stash.benchPath) {
          try {
            const res = yield fetch("examples/".concat(stash.benchPath));
            if (res.ok) {
              const data = yield res.json();
              const built = netlistFromCircuitFile(data);
              if (built) {
                announceBoardSource(vm, 'example', stash.exampleId);
                return built;
              }
            }
          } catch (_unused7) {/* fall through to inference */}
        }
        console.warn('[bw-debug] designer board not ready after ' + waitMs + 'ms — falling back to the inferred netlist');
        // LAST resort, and loudly: the panel shows a warning strip keyed on
        // this — an inferred LED-per-pin board must never impersonate the
        // example's circuit again (owner requirement, 2026-08-17).
        announceBoardSource(vm, 'inferred');
        return inferNetlist(stc);
      }
      announceBoardSource(vm, 'designer');
      return n;
    }();
  });
  return _resolveNetlist.apply(this, arguments);
}
function announceBoardSource(vm, source, exampleId) {
  try {
    if (vm && vm.runtime) vm.runtime.bwBoardSource = source;
    if (typeof window !== 'undefined') {
      window.__bwBoardSource = {
        source,
        exampleId: exampleId || null
      };
      window.dispatchEvent(new CustomEvent('bw-board-source', {
        detail: window.__bwBoardSource
      }));
    }
  } catch (_unused) {/* announcement must never break the boot */}
}

/** Designer-format circuit file → {parts, nets}. Bench files ship nets;
 *  authored files ship wires — union-find turns endpoints into nets. */
function netlistFromCircuitFile(data) {
  if (!data || !Array.isArray(data.parts)) return null;
  const parts = data.parts.filter(p => p.kind !== 'breadboard').map(p => ({
    id: p.id,
    // Only the designer's stc*_mcu alias maps to the engine's 'mcu';
    // board kinds (pi_pico, arduino_nano, ...) are native BoardImpl
    // parts and keep their extra behavior (onboard LEDs).
    kind: /^stc\w*_mcu$/.test(p.kind) ? 'mcu' : p.kind,
    params: p.params || {},
    terminals: p.terminals || []
  }));
  if (Array.isArray(data.nets) && data.nets.length) {
    const withTerms = parts.map(p => p.terminals.length ? p : _objectSpread(_objectSpread({}, p), {}, {
      terminals: data.nets.flatMap(nn => nn.terminals).filter(t => t.part === p.id).map(t => t.terminal)
    }));
    return {
      parts: withTerms,
      nets: data.nets
    };
  }
  if (!Array.isArray(data.wires) || !data.wires.length) return null;
  const parent = new Map();
  const find = k => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    return r;
  };
  const union = (x, y) => {
    if (!parent.has(x)) parent.set(x, x);
    if (!parent.has(y)) parent.set(y, y);
    const rx = find(x),
      ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  const K = (pid, t) => "".concat(pid, "\0").concat(t);
  for (const w of data.wires) union(K(w.from, w.fromTerminal), K(w.to, w.toTerminal));
  const groups = new Map();
  for (const k of parent.keys()) {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    const [part, terminal] = k.split('\u0000');
    groups.get(r).push({
      part,
      terminal
    });
  }
  const nets = [...groups.values()].map((terminals, i) => ({
    id: "n".concat(i),
    terminals
  }));
  const termsOf = new Map();
  for (const nn of nets) for (const t of nn.terminals) {
    if (!termsOf.has(t.part)) termsOf.set(t.part, []);
    termsOf.get(t.part).push(t.terminal);
  }
  return {
    parts: parts.map(p => p.terminals.length ? p : _objectSpread(_objectSpread({}, p), {}, {
      terminals: termsOf.get(p.id) || []
    })),
    nets
  };
}

/**
 * @param {object} [opts.machineConfig] wired-extractor {regions, chips} from
 *   Build Machine (bw-machine-extracted) — threads into createDebugTarget
 *   so the bench boots the machine the user wired, not a hardcoded preset.
 * @param {object} [opts.bootMedia] {slot, bytes, profile, name} from the
 *   Machine Loader / ASM tab — the image the machine boots WITH, so the
 *   reset vector is read from real bytes. profile 'py65mon'/'eater'/'cpm'
 *   names the machine shape a preset image was built for; absent, the
 *   extracted config (or the target's default map) is used.
 */
function createDebugRunner(_ref) {
  let {
    vm,
    compilerUrl = 'https://stc-compiler.vercel.app',
    targetKind = 'emulator',
    machineConfig = null,
    bootMedia = null,
    onChange = () => {}
  } = _ref;
  let session = null;
  let target = null;
  let _board = null;
  let _symbols = null;
  /** `${task}/${state}` -> block id, joined from the two halves. */
  let blockOf = new Map();
  /** block id -> `${task}/${state}`, for setting a breakpoint by block. */
  let yieldOf = new Map();
  /** Block ids currently lit. Several, because several tasks are somewhere. */
  let glowing = new Set();
  let rafId = null;
  let status = {
    phase: 'idle',
    message: ''
  };
  /**
   * block id -> the target's handle. Mirrors the shared store (breakpoints.js),
   * which is where the USER's breakpoints live: they are set by right-clicking a
   * block long before a target exists, and they outlive every stop.
   */
  const bps = new Map();
  let unsubscribeBps = null;
  /** The execution history the drawer renders. See trace.js. */
  const _trace = (0,_trace_js__WEBPACK_IMPORTED_MODULE_2__.createTrace)();
  /** The user's own variables: {name, space, addr, size}. From the symbol table. */
  let variableTable = [];
  /** The project's declared pins, for the physical view. */
  let pinTable = [];
  /** Conditions that failed to parse, surfaced rather than silently ignored. */
  let conditionErrors = {};
  /** Serial output buffer — bytes received from adapter.onSerial, decoded as UTF-8. */
  let serialLines = [];
  /** How many conditional hits were skipped, so the UI can show it happened. */
  let skipped = 0;
  /** Set by the halt handler when a stop should not be shown; read by pumpFrame. */
  let skipRequested = false;
  /** Address breakpoints, which the drawer sets by number rather than by block. */
  const addrBps = new Map();
  function setStatus(phase) {
    let message = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    status = {
      phase,
      message
    };
    emit();
  }

  /**
   * What the UI renders.
   *
   * `phase` is DERIVED from the session whenever there is one, never stored
   * alongside it. Keeping a second copy here was the first version, and it
   * drifted immediately: a breakpoint halt reached the session but the
   * runner still said "running", so the panel showed a running program that
   * was not moving. `status.phase` now only covers the states the session
   * cannot know about — before it exists, and when the build failed.
   */
  function snapshot() {
    const sess = session ? session.state() : null;
    let phase = status.phase;
    if (sess && phase !== 'error') {
      phase = sess.intent === 'paused' ? 'paused' : sess.intent === 'running' ? sess.stepping ? 'stepping' : 'running' : 'idle';
    }
    return {
      phase,
      message: status.message,
      session: sess,
      capabilities: target ? target.capabilities() : null,
      breakpoints: (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.listBreakpoints)(),
      /** Marked blocks the current build has no yield point for. */
      unreachableBreakpoints: (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.listBreakpoints)().filter(id => yieldOf.size && !yieldOf.has(id)),
      /**
       * The cooperative scheduler's millisecond tick, straight from RAM.
       *
       * bw-bundle's DebugStatus panel destructures this and showed "—"
       * because the runner held the target privately and never published
       * it. Sixth instance of the producer/consumer pattern, and the
       * second where I am the producer — the consumer was written
       * correctly against a value that did not exist.
       *
       * undefined before a symbol table exists, which is honest: without
       * one there is no `bw_ms` address to read and a zero would be a
       * fabrication.
       */
      // Machine-bench targets (z80/6502 debug) have no scheduler
      // tick — bwMs is an 8051/AVR concept. Guard by capability,
      // not by kind (snapshot() must never take the panel down).
      bwMs: target && typeof target.bwMs === 'function' ? target.bwMs() : undefined,
      conditions: (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.allConditions)(),
      conditionErrors,
      skippedHits: skipped,
      /** `<task>/<state>` -> block id, so a consumer can name a position. */
      blockOfTask: Object.fromEntries(blockOf),
      /** block id -> `wait` / `forever` / … so a list can name them, not hash them. */
      yieldKinds: Object.fromEntries([...yieldOf].map(_ref2 => {
        let [id, y] = _ref2;
        return [id, y.kind];
      })),
      glowing: [...glowing],
      yieldBlocks: [...yieldOf.keys()],
      /** Serial output lines from the AVR USART (print statements). */
      serialOutput: serialLines.length ? [...serialLines] : undefined
    };
  }
  function emit() {
    onChange(snapshot());
  }

  // ─── glow ────────────────────────────────────────────────────────────

  /**
   * Light up the block the program is sitting on.
   *
   * Level 1 is yield-to-yield, so this marks the block whose yield we are AT,
   * not necessarily the statement about to run — `debugger-ui.md` §2.2. The
   * UI must not imply more precision than that.
   */
  function glow(tasks) {
    // EVERY task, not one. A cooperative scheduler really does have several
    // scripts each sitting somewhere, and Scratch itself glows every running
    // script rather than choosing between them. Picking "the first task that
    // resolves" was the first version of this, and it lit the other script's
    // hat when a breakpoint stopped task 1 — confidently pointing at the
    // wrong block, which is worse than pointing at none.
    // A finished task (state 0xFFFF) has no block and simply drops out.
    const next = new Set((tasks || []).map(t => blockOf.get("".concat(t.task, "/").concat(t.state))).filter(Boolean));
    for (const id of glowing) if (!next.has(id)) safeGlow(id, false);
    for (const id of next) if (!glowing.has(id)) safeGlow(id, true);
    glowing = next;
  }
  function clearGlow() {
    for (const id of glowing) safeGlow(id, false);
    glowing = new Set();
  }
  function safeGlow(blockId, on) {
    try {
      vm.runtime.glowBlock(blockId, on);
    } catch (_unused2) {
      // A block id from a stale build is not worth throwing over; the
      // worst case is a block that does not light up.
    }
  }

  // ─── build ───────────────────────────────────────────────────────────

  /**
   * The project's own hardware declarations.
   *
   * NOT from `vm.toJSON().stc`, which is always undefined: scratch-vm's sb3
   * serializer emits targets/monitors/extensions/meta and drops every other
   * top-level key, so the `stc` block SB3Creator writes into the .sb3 never
   * comes back out. The runtime keeps it instead. Reading the serialised copy
   * is why the circuit designer opened empty for every project, and it would
   * have sent every debug build to the HOST C target — `generateC` picks
   * device-vs-host on `project.stc.pins`, so a missing table does not fail
   * loudly, it silently compiles a different program.
   */
  function projectStc(project) {
    if (vm && vm.runtime && vm.runtime.stc) return vm.runtime.stc;
    return project && project.stc || null;
  }

  /** The project as the emitter needs it: serialised, with the runtime's stc put back. */
  function projectForEmit() {
    const project = JSON.parse(vm.toJSON());
    const stc = projectStc(project);
    if (stc) project.stc = stc;
    return project;
  }

  /**
   * blocks -> C -> .hex + symbol table. Returns everything the attach step
   * needs, or throws with a message meant to be shown to a person.
   */
  function build() {
    return _build.apply(this, arguments);
  } // ─── attach ──────────────────────────────────────────────────────────
  function _build() {
    _build = _asyncToGenerator(function* () {
      setStatus('building', 'reading the project…');
      const project = projectForEmit();
      const stc = project.stc;
      if (!stc || !(stc.pins || []).length) {
        throw new Error('This project declares no pins, so there is no hardware to debug. ' + 'Add DEVICE / PIN declarations in the Code tab first.');
      }
      const {
        default: SB3Creator
      } = yield Promise.all(/*! import() | sb3-creator */[__webpack_require__.e("src_lib_sb3-creator-scratchruntime_js"), __webpack_require__.e("sb3-creator")]).then(__webpack_require__.bind(__webpack_require__, /*! ../sb3-creator.js */ "./src/lib/sb3-creator.js"));
      const {
        readYieldMap
      } = yield __webpack_require__.e(/*! import() | sb3-creator-c */ "sb3-creator-c").then(__webpack_require__.bind(__webpack_require__, /*! ../sb3-creator-c.js */ "./src/lib/sb3-creator-c.js"));
      const creator = new SB3Creator();
      const c = creator.generateC(project, {
        debug: true
      });
      const yields = readYieldMap(c);
      if (!yields.length) {
        throw new Error('This project has no green-flag script, so there is nothing to run.');
      }
      setStatus('building', 'compiling…');
      yield installWasmCompilerIfOptedIn(setStatus);
      // The compiler accepts chip names (atmega328p, stc12c5a60s2), not board
      // names (arduino-nano). Map the user-facing device to the compile target.
      const COMPILE_TARGET = {
        'arduino-nano': 'atmega328p',
        'arduino-uno': 'atmega328p',
        'atmega328p': 'atmega328p',
        'atmega168p': 'atmega168p',
        'arduino-mega': 'atmega2560',
        'pico': 'rp2040',
        'eater6502': 'eater6502'
      };
      const deviceLower = (stc.device || 'stc12c5a60s2').toLowerCase();
      const compileTarget = COMPILE_TARGET[deviceLower] || deviceLower;
      const res = yield fetch("".concat(compilerUrl, "/compile"), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: c,
          language: 'c',
          target: compileTarget,
          // 'bin' — the service's name for the raw SRAM image. It
          // refuses 'uf2' outright ("format must be ihx, hex or bin"),
          // which made every Pico compile fail with status stuck on the
          // stale RUNNING label (found by the production probe).
          format: deviceLower === 'pico' ? 'bin' : 'ihx',
          // Both, from the SAME request — see the header.
          symbols: true
        })
      });
      const out = yield res.json();
      if (!out.success) throw new Error(out.error || 'the compiler refused this program');
      const isPico = String(stc.device || '').toLowerCase() === 'pico';
      if (!out.symbols && !isPico) {
        throw new Error("the image built but carries no symbol table, so the debugger cannot " + "say where it is: ".concat(out.symbols_error || 'no reason given'));
      }

      // The join. The emitter knows (task, state) -> block; the linker knows
      // (task, state) -> address. Neither knows the other, and (task, state)
      // is the only key both speak.
      blockOf = new Map();
      yieldOf = new Map();
      for (const y of yields) {
        blockOf.set("".concat(y.task, "/").concat(y.state), y.block);
        // A block can hold only one yield, so this direction is 1:1.
        yieldOf.set(y.block, {
          task: y.task,
          state: y.state,
          kind: y.kind
        });
      }

      // For Pico the compile response is a raw SRAM binary, not Intel HEX.
      // Convert base64 → Uint8Array → Uint16Array (little-endian halfwords).
      let image = null;
      if (isPico) {
        const bytes = Uint8Array.from(atob(out.base64), c => c.charCodeAt(0));
        // Pad to even length if needed
        const padded = bytes.length & 1 ? new Uint8Array([...bytes, 0]) : bytes;
        image = new Uint16Array(padded.buffer, padded.byteOffset, padded.length / 2);
      }
      return {
        hex: isPico ? null : atob(out.base64),
        image,
        symbols: out.symbols,
        c,
        bytes: out.bytes,
        f_cpu: out.f_cpu || out.fcpu || out.clockHz,
        format: out.format || (isPico ? 'bin' : 'ihx')
      };
    });
    return _build.apply(this, arguments);
  }
  function attach(_x5) {
    return _attach.apply(this, arguments);
  } // ── AVR attach path ─────────────────────────────────────────────────
  // avr8js is pure JS — no WASM, no callback-pointer gymnastics. The
  // adapter drives the board through the same boundary A as emu8051.
  // Boundary D currently supports run/pause/resume and instruction stepping.
  // It does not claim block-level positions until AVR symbols are mapped.
  function _attach() {
    _attach = _asyncToGenerator(function* (built) {
      var _projectStc2;
      const device = String(((_projectStc2 = projectStc(null)) === null || _projectStc2 === void 0 ? void 0 : _projectStc2.device) || '').toLowerCase();
      const selectedTargetKind = selectDebugTargetKind(device, targetKind);
      // The picker offers two targets and only one of them can be honoured
      // here yet. Refusing with the reason is the house rule: silently
      // running the emulator when the user picked "Live board" would be the
      // worst outcome available — they would debug a simulation believing it
      // was their board, and every reading would be plausible and wrong.
      if (selectedTargetKind === 'serial') {
        throw new Error('Live board debugging needs a serial connection, and this build has no ' + 'transport wired up yet. The target itself is implemented and tested ' + '(bw-board serial-debug.js, driven through the real firmware inside the ' + 'emulator) — what is missing is Web Serial port selection in the browser, ' + 'which cannot be written blind. Choose "Simulated (emu8051)" for now.');
      }
      if (selectedTargetKind === 'z80') {
        return attachZ80();
      }
      if (selectedTargetKind === 'eater6502') {
        return attachEater6502();
      }
      if (selectedTargetKind === 'rp2040js') {
        return attachRp2040js(built);
      }

      // All AVR-family kinds share one attach path; the kind picks the
      // chip in the factory (memory map, ports, timers). Listing only
      // 'avr8js' here made every chip-specific kind — including a
      // user's explicit picker choice of ATtiny88/85 or ATmega2560 —
      // fall through to the 8051 emulator below, which then ran the
      // AVR image as 8051 opcodes on an inferred STC bench. The picker
      // said ATtiny88, the run was an 8051: plausible and wrong, twice.
      if (selectedTargetKind === 'avr8js' || selectedTargetKind === 'atmega2560' || selectedTargetKind === 'attiny85' || selectedTargetKind === 'attiny88') {
        return attachAvr8js(built, selectedTargetKind);
      }
      setStatus('attaching', 'starting the emulator…');
      const [{
        createEmu8051DebugTarget,
        createDebugSession,
        createEmu8051Adapter,
        BoardImpl,
        inferNetlist
      }, createEmu8051] = yield Promise.all([Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../bw-board/index.js */ "./src/lib/bw-board/index.js")), __webpack_require__.e(/*! import() | emu8051 */ "emu8051").then(__webpack_require__.t.bind(__webpack_require__, /*! ../emu8051/emu8051.js */ "./src/lib/emu8051/emu8051.js", 23)).then(m => m.default || m)]);

      // Emscripten resolves the .wasm relative to the script that loaded it,
      // which for a lazy chunk is `chunks/` — where the file is not. Webpack
      // copies it to `static/` (see the CopyWebpackPlugin entry), and
      // document.baseURI keeps this correct under GitHub Pages, where the app
      // is served from a subpath rather than the root.
      const wasm = yield createEmu8051({
        locateFile: file => new URL("static/".concat(file), document.baseURI).href
      });
      const stc = projectStc(null);
      const fosc = Number(stc.clock) || 11059200;

      // ORDER MATTERS, and getting it wrong fails silently.
      //
      // `emu_init` frees and re-callocs code memory and re-runs dbg_init. The
      // adapter's constructor calls it. So the adapter must come BEFORE the
      // image, or the image is wiped — and the symptom is not an error: the
      // CPU NOP-sleds through 64 KB of zeroes, reaches whatever address a
      // breakpoint sits at, and halts there with every task still at state 0.
      // It looks like a working debugger pointing at the wrong block. The
      // assertion below is what makes it loud instead.
      //
      //   1. adapter  — inits the emulator, sets the clock and Vcc
      //   2. board    — attached before anything runs, so no edge is missed
      //   3. image    — after the last emu_init
      //   4. target   — symbols last; nothing may re-init behind it
      // part: DEVICE STC15F2K60S2 must reach the emulator or console
      // firmware loses P5 silently (adapter warns until the wasm ships
      // _emu_set_part — the ABI is documented at the adapter).
      // ALL ports. The adapter's default is [1, 3] — a relic that meant
      // ports 0, 2, 4 and 5 were NEVER published to the board: the I2C
      // bus on P2 sat silent (sda/scl 'off forever', blank LCD while the
      // program visibly counted), P0 display buses never lit, the STC15
      // buzzer on P5 never sounded. Push mode is callback-driven, so
      // unused ports cost nothing. (First application of this fix was
      // reverted by a concurrent reset --hard before it was committed.)
      const adapter = createEmu8051Adapter(wasm, {
        fosc,
        ports: [0, 1, 2, 3, 4, 5],
        part: String(stc.device || '').toLowerCase()
      });

      // The board, so the LEDs light and the buzzer sounds while debugging.
      // It is driven by the emulator through boundary A and knows nothing
      // about the debugger: a halted MCU simply stops calling advanceTo.
      //
      // ONE BOARD, ONE TRUTH: the netlist comes from the DESIGNER's solved
      // board when there is one — the canvas's actual part ids and the
      // breadboard's merged strip nets. Building from the abstract pin
      // inference here is how Blink stopped blinking (2026-08-10): the
      // designer showed a seated bench whose LED id the runner's private
      // board had never heard of, so every brightness lookup returned 0
      // while the emulator dutifully toggled a phantom LED. The inference
      // remains only as the fallback for a project that never opened the
      // Circuit tab's designer.
      const netlist = yield resolveNetlist(vm, stc, inferNetlist);
      _board = new BoardImpl();
      _board.setNetlist(netlist.parts, netlist.nets);
      _board.setPower(true);
      adapter.attachBoard(_board);

      // ccall marshals the string itself. Nothing here may touch a heap view:
      // no emu8051 build exports one (debugger-ui.md §7b).
      wasm.ccall('emu_load_hex', 'number', ['string', 'number'], [built.hex, built.hex.length]);

      // A real 8051 image begins with a jump over the interrupt vectors, so
      // all-zero code at the reset vector means nothing was loaded.
      if (!wasm._emu_get_code(0) && !wasm._emu_get_code(1) && !wasm._emu_get_code(2)) {
        throw new Error('the image did not reach the emulator — code memory is empty at the ' + 'reset vector. Something re-initialised the emulator after the load.');
      }

      // The block editor asks for hover values through this, because the
      // workspace and the runner are in different component trees.
      (0,_hover_values_js__WEBPACK_IMPORTED_MODULE_3__.setValueResolver)(blockId => runner.valuesAtBlock(blockId));

      // The condition editor (block-menu.js) offers a list of variable names
      // to pick from. It falls back to the stage's Scratch variables, which
      // are CLOSE but not the same list: this one is what the current build
      // actually located, so a variable the linker dropped is absent rather
      // than offered. Offering a name that is not in the build produces a
      // condition that parses, never fires, and looks like a broken pause
      // point — the exact failure setCondition() warns about.
      if (vm && vm.runtime) vm.runtime._bwDebugVariables = () => runner.variables();
      _symbols = built.symbols;
      variableTable = (_symbols.variables || []).filter(v => v.space);
      pinTable = stc.pins || [];
      target = createEmu8051DebugTarget(wasm, {
        symbols: _symbols
      });
      session = createDebugSession(target, {
        onChange: st => {
          if (st.halted) {
            // A conditional pause point whose condition is false is not
            // a stop at all: resume before anything observes it, so the
            // glow does not flicker, the trace is not polluted with
            // hits the user asked not to see, and the UI never shows a
            // pause that immediately un-pauses.
            // Not resumed here: the frame loop does it, so that many
            // skips can be absorbed inside ONE frame. Resuming from
            // here cost a whole frame per skipped hit, and since a
            // yield breakpoint re-fires within microseconds the program
            // advanced by microseconds per frame — 1765 skips and the
            // wait had barely started.
            if (shouldSkip(st)) {
              skipped++;
              skipRequested = true;
              return;
            }
            glow(st.tasks);
            // One row per stop, always. The drawer's trace pane is the
            // TUI's history ring; this is the cheap half of filling it.
            _trace.record(target, st.why ? st.why.cause : 'halt', {
              variables: runner.variables(),
              tasks: st.tasks
            });
          } else clearGlow();
          emit();
        }
      });
      setStatus('ready', "".concat(built.bytes, " bytes, ").concat(blockOf.size, " yield points"));
      return session;
    });
    return _attach.apply(this, arguments);
  }
  function attachAvr8js(_x6) {
    return _attachAvr8js.apply(this, arguments);
  } // ── Pico attach path ──────────────────────────────────────────────
  // rp2040js is pure JS — same pattern as avr8js. The program is raw
  // Thumb halfwords into SRAM, not Intel HEX or UF2.
  function _attachAvr8js() {
    _attachAvr8js = _asyncToGenerator(function (built) {
      let avrKind = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'avr8js';
      return function* () {
        setStatus('attaching', 'starting the AVR emulator…');
        const {
          createDebugTarget,
          createDebugSession,
          BoardImpl,
          inferNetlist
        } = yield Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../bw-board/index.js */ "./src/lib/bw-board/index.js"));
        const stc = projectStc(null);

        // F_CPU from the compile response, never hard-coded. The compile
        // endpoint owns the clock and echoes it so the simulator does not
        // guess — this project already documents that failure mode for 1T
        // versus 12T cores.
        const clockHz = built.f_cpu || built.clockHz || 16000000;

        // Board — same one-board-one-truth rule as emu8051.
        const netlist = yield resolveNetlist(vm, stc, inferNetlist);
        _board = new BoardImpl();
        _board.setNetlist(netlist.parts, netlist.nets);
        _board.setPower(true);

        // The factory creates the adapter, attaches the board, parses the
        // Intel HEX into Uint16Array words, loads the program, and — if
        // symbols are present — creates the boundary-D debug target with
        // yield breakpoints and block-level position reporting.
        const {
          target: avrTarget,
          adapter: avrAdapter
        } = yield createDebugTarget(avrKind, {
          board: _board,
          hex: built.hex,
          symbols: built.symbols,
          clockHz
        });

        // Wire serial output: each byte from the AVR's USART0 (print
        // statements) accumulates into lines. The snapshot exposes them
        // so the UI can show a serial monitor.
        if (avrAdapter && avrAdapter.onSerial) {
          let lineBuf = '';
          serialLines = [];
          avrAdapter.onSerial(byte => {
            const ch = String.fromCharCode(byte);
            if (ch === '\n') {
              serialLines.push(lineBuf);
              lineBuf = '';
              // Cap at 200 lines to avoid unbounded growth
              if (serialLines.length > 200) serialLines.shift();
            } else if (ch !== '\r') {
              lineBuf += ch;
            }
          });
        }

        // Same value-resolver and variable wiring as the emu8051 path.
        (0,_hover_values_js__WEBPACK_IMPORTED_MODULE_3__.setValueResolver)(blockId => runner.valuesAtBlock(blockId));
        if (vm && vm.runtime) vm.runtime._bwDebugVariables = () => runner.variables();
        _symbols = built.symbols;
        variableTable = (_symbols.variables || []).filter(v => v.space);
        pinTable = stc.pins || [];
        target = avrTarget;
        session = createDebugSession(target, {
          onChange: st => {
            if (st.halted) {
              if (shouldSkip(st)) {
                skipped++;
                skipRequested = true;
                return;
              }
              glow(st.tasks);
              _trace.record(target, st.why ? st.why.cause : 'halt', {
                variables: runner.variables(),
                tasks: st.tasks
              });
            } else clearGlow();
            emit();
          }
        });
        setStatus('ready', "".concat(built.bytes, " bytes (AVR), ").concat(blockOf.size, " yield points"));
        return session;
      }();
    });
    return _attachAvr8js.apply(this, arguments);
  }
  function attachRp2040js(_x7) {
    return _attachRp2040js.apply(this, arguments);
  }
  /** The extractors publish {regions, chips|ports} but no clock — the
   *  machines require one (M6502Machine/Z80Machine read config.clockHz
   *  with no default). 1 MHz / 4 MHz are the canonical bench clocks. */
  function _attachRp2040js() {
    _attachRp2040js = _asyncToGenerator(function* (built) {
      setStatus('attaching', 'starting the Pico emulator…');
      const {
        createDebugTarget,
        createDebugSession,
        BoardImpl,
        inferNetlist
      } = yield Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../bw-board/index.js */ "./src/lib/bw-board/index.js"));
      const stc = projectStc(null);
      const clockHz = built.f_cpu || built.clockHz || 125000000;

      // Board — one-board-one-truth, same as AVR.
      const netlist = yield resolveNetlist(vm, stc, inferNetlist);
      _board = new BoardImpl(3.3);
      _board.setNetlist(netlist.parts, netlist.nets);
      _board.setPower(true);

      // Convert raw binary to Uint16Array halfwords (Thumb).
      // The compile response returns base64 of the raw SRAM image.
      const program = built.image instanceof Uint16Array ? built.image : null;
      const {
        target: picoTarget,
        adapter: picoAdapter
      } = yield createDebugTarget('rp2040js', {
        board: _board,
        program,
        symbols: built.symbols,
        clockHz
      });

      // Wire serial output — same accumulator pattern as AVR.
      if (picoAdapter && picoAdapter.onSerial) {
        let lineBuf = '';
        serialLines = [];
        picoAdapter.onSerial(byte => {
          const ch = String.fromCharCode(byte);
          if (ch === '\n') {
            serialLines.push(lineBuf);
            lineBuf = '';
            if (serialLines.length > 200) serialLines.shift();
          } else if (ch !== '\r') {
            lineBuf += ch;
          }
        });
      }

      // Value resolver and variable wiring — same as AVR.
      (0,_hover_values_js__WEBPACK_IMPORTED_MODULE_3__.setValueResolver)(blockId => runner.valuesAtBlock(blockId));
      if (vm && vm.runtime) vm.runtime._bwDebugVariables = () => runner.variables();
      _symbols = built.symbols;
      variableTable = (_symbols && _symbols.variables || []).filter(v => v.space);
      pinTable = stc.pins || [];
      target = picoTarget;
      session = createDebugSession(target, {
        onChange: st => {
          if (st.halted) {
            if (shouldSkip(st)) {
              skipped++;
              skipRequested = true;
              return;
            }
            glow(st.tasks);
            _trace.record(target, st.why ? st.why.cause : 'halt', {
              variables: runner.variables(),
              tasks: st.tasks
            });
          } else clearGlow();
          emit();
        }
      });
      setStatus('ready', "".concat(built.bytes, " bytes (Pico), ").concat(blockOf.size, " yield points"));
      return session;
    });
    return _attachRp2040js.apply(this, arguments);
  }
  const benchConfig6502 = () => _objectSpread({
    clockHz: 1000000,
    chips: []
  }, machineConfig);
  const benchConfigZ80 = () => _objectSpread({
    clockHz: 4000000
  }, machineConfig);

  /** Boot media as {bytes, origin}: Intel HEX text (file picker accepts
   *  .hex/.ihx and hands over raw file bytes) is parsed; binaries pass
   *  through with no origin, so the machine's own ROM base applies. */
  function resolveMediaImage(_x8) {
    return _resolveMediaImage.apply(this, arguments);
  }
  /** Shared wiring for the machine benches: serial face, session,
   *  keyboard input, video face (when the machine's chips include one),
   *  and a hot loadRom for media applied to a live machine. */
  function _resolveMediaImage() {
    _resolveMediaImage = _asyncToGenerator(function* (media) {
      const bytes = media.bytes;
      if (bytes.length > 1 && bytes[0] === 0x3a) {
        // ':' — Intel HEX text
        const {
          parseIhex
        } = yield Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../bw-board/machine-media.js */ "./src/lib/bw-board/machine-media.js"));
        const parsed = parseIhex(new TextDecoder().decode(bytes));
        return {
          bytes: parsed.bytes,
          origin: parsed.origin
        };
      }
      return {
        bytes,
        origin: null
      };
    });
    return _resolveMediaImage.apply(this, arguments);
  }
  function wireMachineBench(result, createDebugSession) {
    target = result.target;
    const adapter = result.adapter || result;
    if (adapter.onSerial) {
      // LINE-buffer the byte stream: one array entry per byte rendered
      // "B\nB\nC\n…" in the console. CR is display noise; LF ends a line.
      adapter.onSerial(byte => {
        const ch = String.fromCharCode(byte & 0x7f);
        if (ch === '\r') return;
        if (ch === '\n' || serialLines.length === 0) serialLines.push('');
        if (ch !== '\n') serialLines[serialLines.length - 1] += ch;
        if (serialLines.length > 500) serialLines.splice(0, serialLines.length - 500);
      });
    }
    session = createDebugSession(target, {
      onHalt: snapshot => {
        setStatus('paused', "PC=$".concat(snapshot.pc.toString(16).padStart(4, '0')));
      },
      onRun: () => setStatus('running')
    });

    // RX into the machine. Accepts a STRING (a typed line) or a single
    // BYTE — bw-circuit-ui's SerialConsole calls its sendSerialFn one
    // keycode at a time, and a number reaching the string branch used to
    // send nothing at all (`(5).length` is undefined, the loop never runs,
    // no error). Same producer/consumer shape mismatch this codebase keeps
    // paying for, so both shapes are honoured rather than assumed.
    runner.sendSerial = data => {
      if (!adapter.sendSerial) return;
      if (typeof data === 'number') {
        adapter.sendSerial(data & 0xff);
        return;
      }
      const text = String(data);
      for (let i = 0; i < text.length; i++) {
        adapter.sendSerial(text.charCodeAt(i));
      }
    };

    // Diagnosis hook, same stance as window.__activeBoard: production
    // incidents get measured, not guessed at. The bench target carries
    // regs/readMem/video — everything a probe needs to say what the
    // machine is actually doing.
    if (typeof window !== 'undefined') window.__benchTarget = target;

    // Video face: only exposed when the machine actually has a chip
    // answering the videoFrame() contract (TMS9918, simplevga, …) —
    // the panel mounts VdpScreen on the presence of runner.video, and
    // a dead screen on a serial-only machine would be a lie.
    if (target && typeof target.video === 'function' && target.video()) {
      runner.video = () => target && target.video ? target.video() : null;
    } else {
      delete runner.video;
    }

    // Media applied to a LIVE machine (loader while running). A boot
    // image should arrive via bootMedia instead — recreating the
    // runner is what makes the reset vector come from the real bytes.
    runner.loadRom = (bytes, at) => {
      const load = adapter.loadRom || adapter.load;
      if (load) load.call(adapter, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), at);
      if (target && target.reset) target.reset();
    };
    return adapter;
  }

  // The designer's own board, when it holds real parts: machine boots
  // attach it so VIA/port edges (chip-qualified pin ids, engine
  // 26efcbd5c) light whatever the bench wires to them — the Eater
  // build's HD44780 above all. No board, or an empty one, keeps the
  // proven board-less stub: never boot against a phantom.
  function designerBoard() {
    const b = vm && vm.runtime && vm.runtime.circuitBoard;
    let board = null;
    let why = 'no designer board';
    if (b && typeof b.setPin === 'function' && typeof b.advanceTo === 'function') {
      try {
        const parts = typeof b.getParts === 'function' ? b.getParts() : b.parts;
        if (parts && parts.length) {
          board = b;
          why = "designer board attached (".concat(parts.length, " parts)");
        } else {
          why = 'designer board empty';
        }
      } catch (e) {
        why = "designer board unreadable: ".concat(e && e.message);
      }
    }
    // Truth hook: the decision is invisible from outside otherwise —
    // probes and bug reports read this instead of guessing.
    if (typeof window !== 'undefined') window.__bwMachineBoard = {
      why,
      board
    };
    return {
      board,
      why
    };
  }

  // ── 6502 machine bench ──────────────────────────────────────────────
  // Boot precedence: a preset's own profile ('py65mon' — Tali Forth;
  // 'eater' — MS BASIC on the default Eater map) wins, because those
  // images were built for those maps and would run into open bus on
  // anything else. Otherwise the wired-extractor config boots the
  // user's own machine with the delivered image; with nothing at all,
  // the default remains Tali Forth 2 on py65mon.
  function attachEater6502() {
    return _attachEater.apply(this, arguments);
  } // ── Z80 machine bench ───────────────────────────────────────────────
  // A CP/M .COM (BBC BASIC — slot 'com' / profile 'cpm') boots over the
  // BDOS shim regardless of the wiring: the shim IS its machine. A raw
  // ROM boots the extracted config (or the default Searle map). With no
  // media at all, the default remains BBC BASIC.
  function _attachEater() {
    _attachEater = _asyncToGenerator(function* () {
      const {
        createDebugTarget,
        createDebugSession
      } = yield Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../bw-board/index.js */ "./src/lib/bw-board/index.js"));
      const targetOpts = {};
      let readyMsg;
      if (bootMedia) {
        setStatus('attaching', "booting ".concat(bootMedia.name || 'image', "\u2026"));
        const img = yield resolveMediaImage(bootMedia);
        targetOpts.rom = img.bytes;
        if (img.origin != null) targetOpts.romAt = img.origin;
        if (bootMedia.profile === 'py65mon') {
          targetOpts.py65mon = true;
          readyMsg = "".concat(bootMedia.name || 'image', " on the py65mon console map");
        } else if (machineConfig && bootMedia.profile !== 'eater') {
          targetOpts.config = benchConfig6502();
          readyMsg = "".concat(bootMedia.name || 'image', " on the extracted machine (").concat((machineConfig.chips || []).map(c => c.kind).join(', ') || 'ram/rom', ")");
        } else {
          readyMsg = "".concat(bootMedia.name || 'image', " on the Eater map (VIA $6000, ACIA $5000)");
        }
      } else if (machineConfig) {
        setStatus('attaching', 'booting extracted 6502 machine…');
        targetOpts.config = benchConfig6502();
        readyMsg = 'extracted machine booted with an empty ROM — load a program (presets, file, or ASM tab)';
      } else {
        setStatus('attaching', 'loading Tali Forth 2…');
        const res = yield fetch(new URL('static/roms/taliforth-py65mon.bin', document.baseURI).href);
        if (!res.ok) throw new Error("Failed to load taliforth-py65mon.bin: HTTP ".concat(res.status));
        targetOpts.rom = new Uint8Array(yield res.arrayBuffer());
        targetOpts.py65mon = true;
        readyMsg = 'Tali Forth 2 — type at the ok prompt';
      }
      const db = designerBoard();
      if (db.board) targetOpts.board = db.board;
      readyMsg += " \u2014 ".concat(db.why);
      const result = yield createDebugTarget('eater6502', targetOpts);
      wireMachineBench(result, createDebugSession);
      setStatus('ready', readyMsg);
      return session;
    });
    return _attachEater.apply(this, arguments);
  }
  function attachZ80() {
    return _attachZ.apply(this, arguments);
  }
  /**
   * Should this halt be swallowed?
   *
   * Only for a breakpoint hit on a block carrying a condition that evaluates
   * false. Everything else — a step, a pause, an unconditional breakpoint, a
   * condition that will not parse — stops. Erring towards stopping is
   * deliberate: a pause point that silently never fires looks exactly like a
   * broken debugger, while one that fires too often is merely annoying and
   * is visibly the user's own condition.
   */
  function _attachZ() {
    _attachZ = _asyncToGenerator(function* () {
      const {
        createDebugTarget,
        createDebugSession
      } = yield Promise.all(/*! import() | bw-board */[__webpack_require__.e("vendors-node_modules_avr8js_dist_esm_index_js"), __webpack_require__.e("bw-board")]).then(__webpack_require__.bind(__webpack_require__, /*! ../bw-board/index.js */ "./src/lib/bw-board/index.js"));
      const targetOpts = {};
      let readyMsg;
      const isCom = bootMedia && (bootMedia.slot === 'com' || bootMedia.profile === 'cpm');
      if (isCom) {
        setStatus('attaching', "booting ".concat(bootMedia.name || '.com', " over the CP/M shim\u2026"));
        targetOpts.cpm = {
          com: (yield resolveMediaImage(bootMedia)).bytes
        };
        readyMsg = "".concat(bootMedia.name || 'CP/M program', " \u2014 type at the prompt");
      } else if (bootMedia) {
        setStatus('attaching', "booting ".concat(bootMedia.name || 'ROM', "\u2026"));
        const img = yield resolveMediaImage(bootMedia);
        targetOpts.rom = img.bytes;
        if (img.origin != null) targetOpts.romAt = img.origin;
        if (machineConfig) targetOpts.config = benchConfigZ80();
        readyMsg = "".concat(bootMedia.name || 'ROM', " on ").concat(machineConfig ? 'the extracted machine' : 'the Searle map');
      } else if (machineConfig) {
        setStatus('attaching', 'booting extracted Z80 machine…');
        targetOpts.config = benchConfigZ80();
        readyMsg = 'extracted machine booted with an empty ROM — load a program (presets, file, or ASM tab)';
      } else {
        setStatus('attaching', 'loading BBC BASIC…');
        const res = yield fetch(new URL('static/roms/bbcbasic.com', document.baseURI).href);
        if (!res.ok) throw new Error("Failed to load bbcbasic.com: HTTP ".concat(res.status));
        targetOpts.cpm = {
          com: new Uint8Array(yield res.arrayBuffer())
        };
        readyMsg = 'BBC BASIC (Z80) — type at the > prompt';
      }
      const db = designerBoard();
      if (db.board) targetOpts.board = db.board;
      readyMsg += " \u2014 ".concat(db.why);
      const result = yield createDebugTarget('z80', targetOpts);
      wireMachineBench(result, createDebugSession);
      setStatus('ready', readyMsg);
      return session;
    });
    return _attachZ.apply(this, arguments);
  }
  function shouldSkip(st) {
    var _find;
    const why = st.why;
    if (!why || why.cause !== 'breakpoint' || why.bp === undefined) return false;

    // A yield breakpoint is a code address at a `case` label, and the
    // scheduler re-enters that label on EVERY pass of the dispatch loop
    // while the task sits in it. A pause point on a `wait 0.3 seconds`
    // therefore fires thousands of times during that one wait — measured
    // at 1749 hits before this — so "resume" appears to do nothing and a
    // condition never gets the chance to become true.
    //
    // The task itself already knows the difference: while it is waiting,
    // `<task>_until` is in the future, and the C's own test is a
    // wraparound-safe 16-bit compare. Reuse it. One stop per visit, on the
    // pass where the wait is over — which is also the moment the user means
    // by "pause here".
    if (stillWaiting(why)) return true;
    const blockId = (_find = [...bps].find(_ref3 => {
      let [, handle] = _ref3;
      return handle === why.bp;
    })) === null || _find === void 0 ? void 0 : _find[0];
    if (!blockId) return false;
    const source = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.conditionOf)(blockId);
    if (!source) return false;
    const parsed = (0,_condition_js__WEBPACK_IMPORTED_MODULE_1__.parseCondition)(source);
    if (parsed.error) return false; // reported in the snapshot, and it stops
    const vars = Object.fromEntries(runner.variables().map(v => [v.name, v.value]));
    try {
      return !parsed.test(vars);
    } catch (_unused3) {
      return false; // never let a condition trap the debugger
    }
  }

  /**
   * Is the task we stopped in still counting down a wait?
   *
   * Mirrors the generated C exactly: `(int)(bw_now() - <task>_until) < 0`,
   * a 16-bit wraparound-safe compare. A task with no deadline (`until`
   * absent, which is how the target reports a task that is not waiting or
   * has finished) is never "still waiting".
   */
  function stillWaiting(why) {
    if (!target || !why || !why.tasks) return false;
    if (typeof target.bwMs !== 'function') return false;
    const ms = target.bwMs();
    if (ms === undefined) return false;
    for (const t of why.tasks) {
      if (t.until === undefined) continue;
      const delta = ms - t.until & 0xFFFF;
      const signed = delta > 0x7FFF ? delta - 0x10000 : delta;
      if (signed < 0) return true;
    }
    return false;
  }

  // ─── the frame loop ──────────────────────────────────────────────────

  function pumpFrame() {
    rafId = null;
    if (!session) return;
    let outcome = session.pump();

    // Absorb skipped hits in this frame rather than one per frame. Bounded,
    // because a pause point inside a tight loop with a condition that never
    // becomes true would otherwise never hand the browser back: at the cap
    // we simply return and try again next frame, which is slow but alive.
    for (let n = 0; skipRequested && n < SKIP_BUDGET; n++) {
      skipRequested = false;
      session.resume();
      outcome = session.pump();
    }
    if (skipRequested) {
      skipRequested = false;
      session.resume();
      schedule();
      return;
    }
    // Boundary A's clock. The emulator pushes PIN CHANGES to the board by
    // itself (emu_set_board_callbacks), but nothing pushes TIME: the debug
    // run path never calls on_advance, and the board integrates time to get
    // LED brightness and buzzer frequency. Without this the pins toggle
    // correctly and the LED never changes, which looks like a dead board.
    //
    // Doing it HERE, only when the pump actually ran, is also what makes
    // DEBUG-CONTROL-MODEL §3.1 fall out for free: a halted MCU stops
    // pumping, so board time stops with program time, and resume continues
    // from where it stopped rather than catching up on wall-clock.
    if (_board && outcome !== 'idle') _board.advanceTo(target.timeNs());
    // Keep going while there is anything to do. A halted session stops
    // asking for frames entirely, which is what makes a paused program cost
    // nothing rather than spin.
    if (outcome === 'ran') schedule();
    emit();
  }
  function schedule() {
    if (rafId === null && typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(pumpFrame);
    }
  }
  function unschedule() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ─── the verbs ───────────────────────────────────────────────────────

  const runner = {
    state: snapshot,
    /** Build, attach, and run. The ⚑ of the debug world. */
    start() {
      return _asyncToGenerator(function* () {
        try {
          if (!session) {
            var _projectStc;
            const device = String(((_projectStc = projectStc(null)) === null || _projectStc === void 0 ? void 0 : _projectStc.device) || '').toLowerCase();
            const selectedKind = selectDebugTargetKind(device, targetKind);
            // Z80/6502 interactive interpreters: no compile step
            const built = selectedKind === 'z80' || selectedKind === 'eater6502' ? null : yield build();
            yield attach(built);
            // The user's breakpoints only became SETTABLE now: until a
            // target exists there is nothing to set them on, and until
            // this build exists nothing knows which (task, state) a
            // block is. Subscribing rather than reading once keeps a
            // right-click during a run working.
            unsubscribeBps = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.subscribeBreakpoints)(syncBreakpoints);
          }
          session.start();
          setStatus('running');
          schedule();
        } catch (e) {
          unschedule();
          // A failed lazy chunk (emu8051, bw-board) inside this try is
          // exactly the caught-import blind spot the page recovery
          // documents: the rejection is handled here, so the global
          // unhandledrejection listener never sees it, and the user got
          // 'Loading chunk 344 failed' as a dead debugger (owner report,
          // 2026-08-16). Ask the recovery first; only show the error if
          // this is not a stale build.
          const recovering = typeof window !== 'undefined' && window.__bwRecoverFromStaleBuild && window.__bwRecoverFromStaleBuild(e && e.message);
          if (recovering) setStatus('attaching', 'app updated — reloading the new build…');else setStatus('error', e.message);
        }
      })();
    },
    pause() {
      if (!session) return;
      session.pause();
      unschedule();
      setStatus('paused');
    },
    resume() {
      if (!session) return;
      session.resume();
      setStatus('running');
      schedule();
    },
    /** One block by default — the granularity every target supports. */
    step() {
      let kind = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'block';
      if (!session) return {
        unsupported: 'nothing is running yet'
      };
      const refusal = session.step(kind);
      if (refusal) {
        setStatus('paused', refusal.unsupported);
        return refusal;
      }
      setStatus('stepping');
      schedule();
      return undefined;
    },
    stop() {
      unschedule();
      if (session) session.stop();
      clearGlow();
      setStatus('idle');
    },
    setSpeed(x) {
      if (session) session.setSpeed(x);
    },
    /**
     * Is this block a place the program can be stopped at?
     *
     * The user cannot see which blocks are yield points, so a UI should ask
     * before offering "Pause here" — and where the answer is no, snap to
     * the next one rather than refusing (debugger-ui.md §3).
     */
    isYieldBlock: blockId => yieldOf.has(blockId),
    /** What a halt at this block would be called: `wait`, `forever`, … */
    yieldKind: blockId => (yieldOf.get(blockId) || {}).kind,
    /**
     * Mark or unmark a block. Delegates to the shared store, so the change
     * is visible to the editor's context menu and survives a stop — the
     * subscription above pushes it into the target when there is one.
     */
    toggleBreakpoint(blockId) {
      const now = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.toggleBreakpoint)(blockId);
      emit();
      return now;
    },
    /**
     * "Pause here when counter > 10".
     *
     * Validated on the way in, so a typo is reported where it was typed
     * rather than becoming a pause point that mysteriously never fires.
     * Returns the parse error, or undefined on success.
     */
    setCondition(blockId, source) {
      if (source) {
        const parsed = (0,_condition_js__WEBPACK_IMPORTED_MODULE_1__.parseCondition)(source);
        if (parsed.error) {
          conditionErrors = _objectSpread(_objectSpread({}, conditionErrors), {}, {
            [blockId]: parsed.error
          });
          emit();
          return {
            error: parsed.error
          };
        }
        // A name the build does not have is not fatal — the variable may
        // appear after an edit — but it IS worth saying, because the
        // commonest condition that never fires is a misspelt name.
        //
        // `variables()` returns [] in two different situations: before
        // the first build, when we genuinely cannot judge a name, and
        // after a build of a program that declares none. Gating the
        // warning on the set being non-empty conflated them, so a
        // condition in a variable-less program silently never fired —
        // the exact shape of bug this file is supposed to prevent. The
        // distinguisher is whether we have BUILT, not whether the set
        // happens to have anything in it.
        const known = new Set(runner.variables().map(v => v.name));
        const unknown = parsed.names.filter(n => !known.has(n));
        conditionErrors = _objectSpread({}, conditionErrors);
        delete conditionErrors[blockId];
        if (unknown.length && target) {
          conditionErrors[blockId] = known.size ? "no variable named ".concat(unknown.join(', ')) : 'this program has no variables, so this can never be true';
        }
      } else {
        conditionErrors = _objectSpread({}, conditionErrors);
        delete conditionErrors[blockId];
      }
      (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.setCondition)(blockId, source);
      emit();
      return undefined;
    },
    conditionOf: _breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.conditionOf,
    // ─── the engineer's view ─────────────────────────────────────
    //
    // Everything below exists so the drawer can show what emu8051's TUI
    // shows. It is deliberately a thin pass-through: the target already
    // implements boundary D, and a second layer of interpretation here
    // would be a second place for the two to disagree.

    /** Registers, the SFRs the TUI names, and the stack — one sample. */
    inspect() {
      if (!target) return null;
      const regs = target.regs();
      // The SFR window and the 0x08..SP stack walk below are 8051
      // anatomy. A machine target (6502, Z80) answers a different regs
      // shape — on the Z80, `r` is the REFRESH register, a number, and
      // mapping over it crashed the drawer. The 8051 shape is the one
      // with the bank-register array; anything else inspects as
      // 'generic' with no sfr/stack, and the drawer renders what the
      // target actually has instead of what an 8051 would have.
      if (!Array.isArray(regs.r)) {
        return {
          regs,
          sfr: null,
          stack: null,
          pc: regs.pc,
          tNs: target.timeNs(),
          flavor: 'generic'
        };
      }
      const sfr = {};
      for (const {
        name,
        addr
      } of [..._trace_js__WEBPACK_IMPORTED_MODULE_2__.IO_SFRS, ..._trace_js__WEBPACK_IMPORTED_MODULE_2__.TIMER_SFRS]) {
        sfr[name] = target.readMem('sfr', addr, 1)[0];
      }
      // The stack grows UP on an 8051 and SP points at the last byte
      // pushed, so the live entries are 0x08..SP — 0x07 is where SP sits
      // after a reset, below the first push.
      const stack = [];
      for (let a = 0x08; a <= regs.sp && a <= 0xFF; a++) {
        stack.push({
          addr: a,
          value: target.readMem('iram', a, 1)[0]
        });
      }
      return {
        regs,
        sfr,
        stack,
        pc: regs.pc,
        tNs: target.timeNs(),
        flavor: '8051'
      };
    },
    /** Raw bytes, for the hex view. Returns [] rather than throwing. */
    readMem(space, addr, len) {
      if (!target) return [];
      const out = target.readMem(space, addr, len);
      return out instanceof Uint8Array ? [...out] : [];
    },
    /** Edit one byte. `code` is writable here, as it is in the TUI. */
    writeMem(space, addr, value) {
      if (!target) return {
        refused: 'nothing is loaded'
      };
      return target.writeMem(space, addr, Uint8Array.from([value & 0xFF]));
    },
    /** The instruction at an address, as text. Capability, not assumption:
     * only the 8051 targets carry a disassembler; an AVR/RP2040 target
     * without one must yield '' — calling through unconditionally crashed
     * the whole app from "under the hood" on the pendant (owner report,
     * 2026-08-16). */
    disasm(addr) {
      return target && typeof target.disasm === 'function' ? target.disasm(addr) : '';
    },
    /**
     * A short listing from `addr`, walking with the opcode length table.
     * The TUI has no such pane — its code window is the trace — but a
     * listing around the PC is what a GUI reader expects, and the length
     * table makes it free.
     */
    listing(addr) {
      let count = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 16;
      // No disassembler (or no code-space reads) on this target → no
      // listing. Same crash as disasm() above; the instruction-length
      // walk below is 8051-shaped anyway.
      if (!target || typeof target.disasm !== 'function' || typeof target.readMem !== 'function') return [];
      // Capability at the DATA, not just the method: the z80 target
      // has both methods but its readMem answers a refusal object,
      // and spreading a non-iterable crashed the whole app from
      // 'under the hood' (owner report #2 of this crash family —
      // the method-presence guard was the pendant fix and it was
      // not enough). Anything that is not real bytes ends the
      // listing; the drawer then says 'no disassembly on this
      // target' instead of dying.
      const rows = [];
      let a = addr & 0xFFFF;
      try {
        for (let i = 0; i < count; i++) {
          // The machine targets (6502, Z80) return self-describing
          // rows — { text, bytes, length } — so the walk needs no
          // readMem and no 8051 length table. Prefer that shape.
          const d = target.disasm(a);
          if (d && typeof d === 'object' && Array.isArray(d.bytes) && d.length >= 1) {
            var _d$text;
            rows.push({
              addr: a,
              bytes: d.bytes.slice(),
              text: String((_d$text = d.text) !== null && _d$text !== void 0 ? _d$text : '')
            });
            a = a + d.length & 0xFFFF;
            continue;
          }
          const head = target.readMem('code', a, 1);
          if (!head || typeof head[Symbol.iterator] !== 'function' || head.length < 1) break;
          const len = (0,_opcodes_js__WEBPACK_IMPORTED_MODULE_4__.instructionLength)(head[0]);
          const bytes = target.readMem('code', a, len);
          if (!bytes || typeof bytes[Symbol.iterator] !== 'function') break;
          rows.push({
            addr: a,
            bytes: [...bytes],
            text: String(d !== null && d !== void 0 ? d : '')
          });
          a = a + len & 0xFFFF;
        }
      } catch (_unused4) {
        return [];
      }
      return rows;
    },
    /** Move the PC. The TUI's `g`. */
    setPc(addr) {
      return target ? target.setPc(addr) : {
        refused: 'nothing is loaded'
      };
    },
    /** Reset registers only, or reset and clear RAM. The TUI's R) and W). */
    resetCpu() {
      if (target) {
        target.reset();
        _trace.record(target, 'reset', {
          variables: runner.variables()
        });
        emit();
      }
    },
    wipe() {
      if (target) {
        target.wipe();
        _trace.record(target, 'reset', {
          variables: runner.variables()
        });
        emit();
      }
    },
    /** A breakpoint at a code ADDRESS, which blocks cannot express. */
    addressBreakpoints: () => [...addrBps.keys()],
    toggleAddressBreakpoint(addr) {
      if (!target) return false;
      const a = addr & 0xFFFF;
      if (addrBps.has(a)) {
        target.clearBreakpoint(addrBps.get(a));
        addrBps.delete(a);
      } else {
        const handle = target.setBreakpoint({
          kind: 'code',
          addr: a
        });
        if (typeof handle !== 'number') return false;
        addrBps.set(a, handle);
      }
      emit();
      return addrBps.has(a);
    },
    /** The execution history. Newest last. */
    trace: () => _trace.rows(),
    traceDropped: () => _trace.dropped(),
    clearTrace() {
      _trace.clear();
      emit();
    },
    /**
     * One instruction, synchronously. The TUI's space bar.
     *
     * Each step ends in a halt, and the halt handler records a trace row —
     * so stepping IS how an instruction-by-instruction trace gets built,
     * and nothing extra is recorded here. An earlier version recorded again
     * from this loop and produced two rows per step.
     *
     * A free run does NOT trace every instruction, and cannot: a row is
     * about thirty WASM calls, against eleven million instructions a second.
     * emu8051's TUI has the same limit from the other side — it records per
     * instruction because its loop single-steps, and at speed it stops
     * keeping up too. The trace pane says which it is showing rather than
     * presenting the gap as a complete history.
     */
    stepInstruction() {
      let count = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
      if (!target) return {
        unsupported: 'nothing is running yet'
      };
      for (let i = 0; i < count; i++) {
        const refusal = target.step('insn', 1);
        if (refusal) return refusal;
        // Pump until the step lands. One instruction is a handful of
        // cycles, so this is bounded and fast.
        for (let n = 0; n < 4096 && target.state() === 'running'; n++) {
          target.runFor(1000);
        }
      }
      emit();
      return undefined;
    },
    /** `over` and `out`, which the target defines in terms of SP. */
    stepOver() {
      return session ? session.step('over') : {
        unsupported: 'not running'
      };
    },
    stepOut() {
      return session ? session.step('out') : {
        unsupported: 'not running'
      };
    },
    /**
     * The user's OWN variables, by the name they typed.
     *
     * This is the pane a debugger for this audience should lead with. Not
     * A/B/DPTR — `counter`, with the value in it. Every one is a 16-bit
     * signed int because that is what generateC emits, and SDCC stores
     * them little-endian.
     */
    variables() {
      if (!target) return [];
      return variableTable.map(v => {
        const bytes = target.readMem(v.space, v.addr, 2);
        const raw = bytes[1] << 8 | bytes[0];
        return {
          name: v.name,
          sprite: v.sprite || null,
          // Scratch's numbers are signed; 0xFFFF is -1, not 65535.
          value: raw > 0x7FFF ? raw - 0x10000 : raw,
          where: "".concat(v.space, " 0x").concat(v.addr.toString(16).toUpperCase())
        };
      });
    },
    /**
     * Each declared pin as a PHYSICAL fact, not a register bit.
     *
     * The board is the authority: it knows the resolved level and what is
     * wired there, and it already applies the active-low inversion. An
     * ANALOG pin reports volts, because that is what the part does — the
     * conversion to counts is the MCU's business (boundary A).
     */
    pins() {
      if (!_board) return [];
      return pinTable.map(p => {
        const id = p.where ? p.where.toLowerCase() : "P".concat(p.port, ".").concat(p.bit);
        const out = {
          name: p.name,
          pin: id,
          direction: p.direction,
          activeLow: !!p.activeLow
        };
        try {
          if (p.direction === 'analog') {
            out.volts = _board.readAnalog(id);
          } else {
            const level = _board.readPin(id);
            out.level = level;
            // What the USER called it: an active-low LED driven
            // low is ON, and saying "0" here would teach the
            // opposite of the thing this board exists to teach.
            out.on = p.activeLow ? level === 0 : level === 1;
          }
        } catch (_unused5) {/* a pin with nothing wired to it has no reading */}
        return out;
      });
    },
    /** LED brightnesses by part id, so the panel can show them lit. */
    leds() {
      if (!_board) return [];
      return _board.getLeds().map(id => ({
        id,
        brightness: _board.ledBrightness(id)
      }));
    },
    /**
     * What the program looked like the last time it was AT this block.
     *
     * The debugger's answer to "what was `counter` here?", which is the
     * question a learner actually has and the one a live-values pane
     * cannot answer: by the time you look, the program has moved on.
     * Every recorded stop already carries a full variable snapshot and the
     * position it was taken at, so this is a lookup, not new machinery.
     *
     * Returns null when this block has never been stopped at — which is
     * the honest answer, and different from "all its variables were zero".
     *
     * @param {string} blockId
     * @returns {{variables: Array, tNs: bigint, agoMs: number, why: string} | null}
     */
    valuesAtBlock(blockId) {
      const y = yieldOf.get(blockId);
      if (!y) return null;
      const rows = _trace.rows();
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (!row.variables || !row.tasks) continue;
        // The row was taken while this task sat in this state — which
        // is exactly "the program was at this block".
        const here = row.tasks.some(t => t.task === y.task && t.state === y.state);
        if (!here) continue;
        const now = target ? target.timeNs() : row.tNs;
        return {
          variables: row.variables,
          tNs: row.tNs,
          // Clamped: when the program is paused AT this block, now
          // and the row are the same instant, and `-0 ms ago` is a
          // JS artefact rather than a fact about the program.
          agoMs: Math.max(0, Number(now - row.tNs) / 1e6),
          why: row.why,
          kind: y.kind
        };
      }
      return null;
    },
    /** Program time, in ms, or null before anything has run. */
    timeMs: () => target ? Number(target.timeNs()) / 1e6 : null,
    /** The board, so a circuit panel can render what the program is doing. */
    board: () => _board,
    symbols: () => _symbols,
    destroy() {
      (0,_hover_values_js__WEBPACK_IMPORTED_MODULE_3__.setValueResolver)(null);
      if (vm && vm.runtime) delete vm.runtime._bwDebugVariables;
      unschedule();
      if (unsubscribeBps) {
        unsubscribeBps();
        unsubscribeBps = null;
      }
      clearGlow();
      if (session) session.destroy();
      // Machine-bench targets carry no destroy (nothing to free — the
      // machine is plain JS); the 8051 target's tears down WASM state.
      if (target && typeof target.destroy === 'function') target.destroy();
      session = target = _board = _symbols = null;
    }
  };

  /**
   * Bring the target's breakpoints in line with the user's.
   *
   * Called on every change to the shared store, and once when a target first
   * exists. A marked block with no yield point in THIS build is left
   * unresolved rather than dropped: the store is the user's intent, and a
   * later build may well give it an address (`unreachableBreakpoints` in the
   * snapshot is what a UI shows for those).
   */
  function syncBreakpoints(ids) {
    if (!target) return;
    const wanted = new Set(ids);
    for (const [blockId, handle] of [...bps]) {
      if (wanted.has(blockId)) continue;
      if (handle !== null) target.clearBreakpoint(handle);
      bps.delete(blockId);
    }
    for (const blockId of wanted) {
      if (bps.has(blockId)) continue;
      const y = yieldOf.get(blockId);
      if (!y) continue; // no yield point in this build
      const handle = target.setBreakpoint({
        kind: 'yield',
        task: y.task,
        state: y.state
      });
      bps.set(blockId, typeof handle === 'number' ? handle : null);
    }
  }
  return runner;
}

/***/ }),

/***/ "./src/lib/bw-debug/hover-values.js":
/*!******************************************!*\
  !*** ./src/lib/bw-debug/hover-values.js ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   setValueResolver: () => (/* binding */ setValueResolver),
/* harmony export */   valuesAtBlock: () => (/* binding */ valuesAtBlock)
/* harmony export */ });
/**
 * The bridge between the block editor and whatever knows the values.
 *
 * The editor's blocks and the debugger's runner live in different component
 * trees — the workspace is mounted by `containers/blocks.jsx`, the runner by the
 * Circuit tab's panel — and neither is the other's parent. Threading a runner
 * through the GUI to reach a hover handler would couple most of the editor to
 * the debugger for one tooltip.
 *
 * So the runner publishes a lookup here and the editor asks. One function, no
 * state of its own beyond the current resolver, and an editor with no debugger
 * attached simply gets null and shows nothing.
 *
 * @module
 */

/** @type {((blockId: string) => object | null) | null} */
let resolver = null;

/** The runner calls this when it attaches, and with null when it goes away. */
function setValueResolver(fn) {
  resolver = typeof fn === 'function' ? fn : null;
}

/** What was recorded at this block, or null. Never throws at the caller. */
function valuesAtBlock(blockId) {
  if (!resolver || !blockId) return null;
  try {
    return resolver(blockId);
  } catch (_unused) {
    return null;
  }
}

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