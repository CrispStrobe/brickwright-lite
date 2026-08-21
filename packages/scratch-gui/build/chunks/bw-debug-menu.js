"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-debug-menu"],{

/***/ "./src/lib/bw-debug/block-menu.js":
/*!****************************************!*\
  !*** ./src/lib/bw-debug/block-menu.js ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   installBreakpointMenu: () => (/* binding */ installBreakpointMenu)
/* harmony export */ });
/* harmony import */ var _breakpoints_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./breakpoints.js */ "./src/lib/bw-debug/breakpoints.js");
/* harmony import */ var _hover_values_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./hover-values.js */ "./src/lib/bw-debug/hover-values.js");
/* harmony import */ var _condition_editor_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./condition-editor.js */ "./src/lib/bw-debug/condition-editor.js");
/**
 * "Pause here" — the debugger's one piece of input in the block editor.
 *
 * `debugger-ui.md` §3: a breakpoint is a right-click on a block, because that
 * is how every editor does it and because the alternative (a list of task and
 * state numbers) is not something a Scratch user can act on.
 *
 * Two decisions are visible here.
 *
 * **The menu item appears only for hardware projects.** The block editor is
 * shared with ordinary Scratch projects, where "Pause here" would be an item
 * that can never do anything. The gate is the same one the Circuit tab uses:
 * the project declares pins.
 *
 * **It is offered on every block, not only on yield points.** The user cannot
 * see which blocks the program can actually stop at — a `wait` and a `turn on`
 * look equally stoppable — so refusing the click on one and accepting it on its
 * neighbour reads as a broken editor. Every block can be marked; the runner
 * resolves the ones this build has a yield point for and reports the rest as
 * unreachable, which the panel shows. That is the "snap forward and say so"
 * rule from §3, with the saying-so done by the panel rather than by a dialog.
 *
 * @module
 */




const MARKED_CLASS = 'bw-breakpoint';
const TEXT = {
  en: {
    set: '⏸ Pause here',
    clear: '⏸ Don’t pause here',
    when: '⏸ Pause here when…',
    lastHere: 'last here',
    ago: 'ago',
    hereNow: 'here now',
    noVars: 'no variables in this project',
    prompt: 'Pause here only when this is true.\n\nFor example:  counter > 10\n' + 'Comparisons only (> < >= <= = !=), joined with and / or.'
  },
  de: {
    set: '⏸ Hier anhalten',
    clear: '⏸ Hier nicht anhalten',
    when: '⏸ Hier anhalten, wenn…',
    lastHere: 'zuletzt hier vor',
    ago: '',
    hereNow: 'jetzt hier',
    noVars: 'keine Variablen in diesem Projekt',
    prompt: 'Nur anhalten, wenn das zutrifft.\n\nZum Beispiel:  counter > 10\n' + 'Nur Vergleiche (> < >= <= = !=), verknüpft mit and / or.'
  }
};

/**
 * The marker. Blockly owns the block's SVG, so this only adds a class and lets
 * CSS do the rest — anything that reaches into the generated shapes would be
 * undone by the next re-render.
 */
const CSS = "\n.".concat(MARKED_CLASS, " > .blocklyPath {\n    stroke: #e74c3c;\n    stroke-width: 2px;\n}\n.bw-bp-dot {\n    pointer-events: none;\n}\n.bw-hover-values {\n    position: fixed;\n    z-index: 1000;\n    pointer-events: none;\n    background: #12121f;\n    border: 1px solid #2c3e50;\n    border-radius: 6px;\n    padding: 6px 9px;\n    font: 12px/1.45 monospace;\n    color: #ecf0f1;\n    box-shadow: 0 4px 14px rgba(0,0,0,.45);\n    max-width: 280px;\n}\n.bw-hover-values .bw-when { color: #7f8c8d; font-size: 11px; }\n.bw-hover-values .bw-name { color: #bdc3c7; }\n.bw-hover-values .bw-val  { color: #f39c12; }\n");
let installed = false;
let styleEl = null;

/**
 * Install the context-menu item and the marker.
 *
 * @param {object} ScratchBlocks the injected scratch-blocks namespace
 * @param {object} vm the scratch-vm instance, for the hardware-project gate
 * @param {() => string} getLocale
 * @returns {() => void} uninstall
 */
function installBreakpointMenu(ScratchBlocks, vm) {
  let getLocale = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : () => 'en';
  let onCondition = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
  const inert = {
    repaint() {},
    uninstall() {}
  };
  if (!ScratchBlocks || !ScratchBlocks.BlockSvg) return inert;

  // CSS injection is idempotent — only done once even across remounts.
  // The element is MODULE-scoped: it used to be a const inside this if,
  // while uninstall() referenced it unconditionally — any remount (second
  // install) left `style` undeclared in the closure and teardown threw
  // ReferenceError, finishing off an app that a render error had already
  // wounded (the Step x10 total-crash chain, owner report 2026-08-17).
  if (!installed) {
    installed = true;
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  /**
   * Does this project have hardware to debug?
   *
   * This gate was `vm.runtime.stc.pins.length` alone, and that made the whole
   * feature unreachable in the commonest flow. bw-blocks found it by driving
   * a real browser rather than reading the code: write pseudocode, press
   * "To blocks", right-click a `turn on led1` — and the menu shows only
   * Duplicate / Add Comment / Delete. `runtime.stc` is populated by a full
   * project load, not by the importer, so a freshly converted project has
   * pins on screen, the STC12 palette visible, and no gate.
   *
   * The consequence was larger than a missing menu item: everything
   * downstream is gated behind it, so **0 of 6 breakpoint-decoration cases
   * could be tested** — the decoration never renders if the mark can never
   * be set.
   *
   * So ask the question three ways, cheapest first, and pass if any says yes.
   * All three are things the user can already see:
   *
   *   1. `runtime.stc` — set after a load. The fast path, unchanged.
   *   2. the stc12 extension being loaded — which is exactly why the palette
   *      shows an STC12 category. If the blocks are offerable, the project is
   *      a hardware project.
   *   3. the Stage comment the serializer now carries declarations in
   *      (sb3-creator e7d739d), for a project loaded from a file. The marker
   *      is `_stcconfig_` (SB3Creator.STC_MAGIC) under comment id
   *      `stcconfig` — checked against the source rather than guessed, having
   *      first written `@bw-stc` here, which matches nothing.
   *
   * None of these serialises the project; a right-click must stay cheap.
   */
  const isHardwareProject = () => {
    const runtime = vm && vm.runtime;
    if (!runtime) return false;
    const stc = runtime.stc;
    if (stc && stc.pins && stc.pins.length) return true;
    // The Code tab publishes the device id to the runtime; any non-null
    // device means the user has chosen a hardware target.
    if (runtime.bwDeviceId) return true;
    const em = vm.extensionManager;
    if (em && typeof em.isExtensionLoaded === 'function') {
      try {
        if (em.isExtensionLoaded('stc12') || em.isExtensionLoaded('stc12live')) return true;
      } catch (_unused) {/* an extension manager mid-load is not an error here */}
    }
    try {
      const stage = runtime.getTargetForStage && runtime.getTargetForStage();
      const comments = stage && stage.comments;
      if (comments) {
        if (comments.stcconfig) return true;
        for (const id of Object.keys(comments)) {
          const text = comments[id] && comments[id].text;
          if (text && text.indexOf('_stcconfig_') !== -1) return true;
        }
      }
    } catch (_unused2) {/* no stage yet */}
    return false;
  };

  // Why NOT customContextMenu (the obvious choice): defining it on the
  // prototype breaks Blockly — Block.mixin() refuses a mixin whose members
  // already exist, and the check `this[key] !== undefined` is satisfied by an
  // inherited prototype property. So a prototype-level customContextMenu makes
  // every block type that legitimately defines one (procedure calls do) throw
  // "Mixin will overwrite block members" at load.
  //
  // Why NOT generateContextMenu (what this used to hook): this scratch-blocks
  // fork never calls it for block context menus — verified in-browser, the
  // override fired zero times. The menu is built inline in showContextMenu_.
  // So we wrap showContextMenu_ instead (below).
  // This scratch-blocks fork does NOT route block context menus through
  // generateContextMenu (verified: the override there never fires). Its
  // BlockSvg.prototype.showContextMenu_ builds the option list INLINE
  // (Duplicate/Comment/Delete) and calls Blockly.ContextMenu.show directly.
  // So we wrap showContextMenu_ and, for the duration of that one call, patch
  // ContextMenu.show to append our debug items to the list it built. (A
  // prototype-level customContextMenu is out — Block.mixin() rejects it; see
  // the note above.) The append is idempotent, so the shadow-block recursion
  // (parentBlock_.showContextMenu_) cannot double-add.
  const CM = ScratchBlocks.ContextMenu;
  const previousShow = ScratchBlocks.BlockSvg.prototype.showContextMenu_;
  ScratchBlocks.BlockSvg.prototype.showContextMenu_ = function (e) {
    const block = this;
    const origCMShow = CM.show;
    CM.show = function (ev, options, rtl) {
      try {
        block.bwAddDebugMenu(options);
      } catch (_unused3) {/* never block the menu */}
      return origCMShow.call(this, ev, options, rtl);
    };
    try {
      return previousShow.call(this, e);
    } finally {
      CM.show = origCMShow;
    }
  };
  ScratchBlocks.BlockSvg.prototype.bwAddDebugMenu = function (options) {
    if (!isHardwareProject()) return;
    if (options.__bwDebugAdded) return; // idempotent across the shadow recursion
    options.__bwDebugAdded = true;
    const words = TEXT[getLocale()] || TEXT.en;
    const marked = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.isBreakpoint)(this.id);
    options.push({
      enabled: true,
      text: marked ? words.clear : words.set,
      callback: () => {
        (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.toggleBreakpoint)(this.id);
        paint(this.workspace);
      }
    });
    // The conditional form is a SEPARATE item rather than a mode, so the
    // plain one stays a single click. A condition already set is offered
    // back for editing instead of making the user retype it.
    options.push({
      enabled: true,
      text: words.when,
      callback: () => {
        const existing = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.conditionOf)(this.id) || '';
        let varNames = [];
        if (vm && vm.runtime && vm.runtime._bwDebugVariables) {
          varNames = vm.runtime._bwDebugVariables().map(v => v.name);
        } else if (vm) {
          const stage = vm.runtime && vm.runtime.getTargetForStage && vm.runtime.getTargetForStage();
          if (stage && stage.variables) {
            varNames = Object.values(stage.variables).map(v => v.name);
          }
        }
        const svg = this.getSvgRoot && this.getSvgRoot();
        const box = svg ? svg.getBoundingClientRect() : {
          right: 200,
          top: 200
        };
        (0,_condition_editor_js__WEBPACK_IMPORTED_MODULE_2__.showConditionEditor)({
          x: box.right + 8,
          y: box.top,
          variables: varNames,
          existing,
          locale: getLocale(),
          onDone: source => {
            if (source === null) return;
            if (onCondition) onCondition(this.id, source.trim());
            paint(this.workspace);
          }
        });
      }
    });
  };

  // ─── hover: what was `counter` HERE? ─────────────────────────────────
  //
  // The question a learner actually has, and the one a live-values pane
  // cannot answer — by the time you look, the program has moved on. Every
  // recorded stop carries a full variable snapshot and the position it was
  // taken at, so hovering a block can show what was true the last time the
  // program was there.
  //
  // It says WHEN, always. A value with no timestamp beside it reads as
  // current, and the whole point is that it is not.

  let tip = null;
  /** Blocks that already have listeners, so repainting does not stack them. */
  const wired = new WeakSet();
  function hideTip() {
    if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    tip = null;
  }
  function showTip(block, at) {
    hideTip();
    const words = TEXT[getLocale()] || TEXT.en;
    tip = document.createElement('div');
    tip.className = 'bw-hover-values';
    const when = at.agoMs < 1 ? words.hereNow : "".concat(words.lastHere, " ").concat(at.agoMs < 1000 ? "".concat(at.agoMs.toFixed(0), " ms") : "".concat((at.agoMs / 1000).toFixed(1), " s"), " ").concat(words.ago);
    const rows = at.variables.length ? at.variables.map(v => "<div><span class=\"bw-name\">".concat(escapeHtml(v.name), "</span> ") + "<span class=\"bw-val\">".concat(v.value, "</span></div>")).join('') : "<div class=\"bw-when\">".concat(words.noVars, "</div>");
    tip.innerHTML = "<div class=\"bw-when\">".concat(when, "</div>").concat(rows);
    document.body.appendChild(tip);
    const svg = block.getSvgRoot();
    const box = svg.getBoundingClientRect();
    tip.style.left = "".concat(Math.min(box.right + 8, window.innerWidth - tip.offsetWidth - 8), "px");
    tip.style.top = "".concat(Math.max(8, box.top), "px");
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    })[ch]);
  }

  /**
   * Put the marker + red dot on every marked block, and wire hover.
   *
   * Called on every Blockly workspace change event (addChangeListener in
   * blocks.jsx), so the dot survives drag, undo/redo, collapse/expand and
   * workspace reload. The dot is in the block's local SVG coordinate space,
   * so it scales correctly with zoom.
   *
   * The dot is re-created (not moved) on every paint, because Blockly may
   * replace a block's SVG root element entirely. querySelector finds any
   * existing dot and skips re-creation; if the SVG was rebuilt, the old dot
   * is gone and a new one is appended.
   */
  function paint(workspace) {
    if (!workspace || !workspace.getAllBlocks) return;
    // Prune marks on blocks that no longer exist (deleted, or project
    // switched without clearing). A stale mark is harmless for the dot
    // but the runner would still try to resolve it.
    const allIds = new Set(workspace.getAllBlocks().map(b => b.id));
    for (const id of (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.listBreakpoints)()) {
      if (!allIds.has(id)) (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.toggleBreakpoint)(id);
    }
    for (const block of workspace.getAllBlocks()) {
      const svg = block.getSvgRoot && block.getSvgRoot();
      if (!svg || !svg.classList) continue;
      const isBp = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.isBreakpoint)(block.id);
      svg.classList.toggle(MARKED_CLASS, isBp);

      // Red dot: an SVG circle at the left edge of the block.
      // Re-created on every paint because Blockly rebuilds the SVG.
      let dot = svg.querySelector('.bw-bp-dot');
      if (isBp && !dot) {
        dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', 'bw-bp-dot');
        dot.setAttribute('cx', '6');
        dot.setAttribute('cy', '14');
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', '#e74c3c');
        dot.setAttribute('stroke', '#c0392b');
        dot.setAttribute('stroke-width', '1');
        svg.appendChild(dot);
      } else if (!isBp && dot) {
        dot.remove();
      }
      if (wired.has(svg)) continue;
      wired.add(svg);
      svg.addEventListener('mouseenter', () => {
        const at = (0,_hover_values_js__WEBPACK_IMPORTED_MODULE_1__.valuesAtBlock)(block.id);
        // No recording at this block is a real answer, and a tooltip
        // saying nothing would be worse than none at all.
        if (at) showTip(block, at);
      });
      svg.addEventListener('mouseleave', hideTip);
    }
  }

  // Re-paint whenever the set changes or the workspace redraws. Blockly
  // rebuilds SVG on load, drag and undo, and a class set once would quietly
  // disappear on any of them.
  let workspaceRef = null;
  const unsubscribe = (0,_breakpoints_js__WEBPACK_IMPORTED_MODULE_0__.subscribeBreakpoints)(() => paint(workspaceRef));
  const repaint = workspace => {
    workspaceRef = workspace;
    paint(workspace);
  };
  return {
    repaint,
    uninstall() {
      hideTip();
      unsubscribe();
      ScratchBlocks.BlockSvg.prototype.showContextMenu_ = previousShow;
      delete ScratchBlocks.BlockSvg.prototype.bwAddDebugMenu;
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
      installed = false;
    }
  };
}

/***/ }),

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

/***/ "./src/lib/bw-debug/condition-editor.js":
/*!**********************************************!*\
  !*** ./src/lib/bw-debug/condition-editor.js ***!
  \**********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   showConditionEditor: () => (/* binding */ showConditionEditor)
/* harmony export */ });
/**
 * Condition editor — the replacement for `window.prompt`.
 *
 * A small popup with dropdowns for variable names and operators, plus a number
 * input. The grammar is deliberately tiny (condition.js) and the editor makes
 * it impossible to violate: every selectable combination is valid.
 *
 * Multiple clauses are joined with and/or via an "add clause" button.
 *
 * @module
 */

const OPS = ['>', '<', '>=', '<=', '=', '!='];
const STYLES = "\n.bw-cond-editor {\n    position: fixed;\n    z-index: 10000;\n    background: #1a1a2e;\n    border: 2px solid #3d7ea6;\n    border-radius: 8px;\n    padding: 12px 14px;\n    font: 13px/1.5 -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n    color: #ecf0f1;\n    box-shadow: 0 6px 20px rgba(0,0,0,.5);\n    min-width: 260px;\n    max-width: 360px;\n}\n.bw-cond-editor .bw-cond-title {\n    font-weight: 600;\n    margin-bottom: 8px;\n    color: #bdc3c7;\n    font-size: 12px;\n}\n.bw-cond-editor .bw-cond-row {\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    margin-bottom: 6px;\n}\n.bw-cond-editor .bw-cond-joiner {\n    font-size: 11px;\n    color: #7f8c8d;\n    margin: 2px 0 4px 4px;\n}\n.bw-cond-editor select,\n.bw-cond-editor input[type=\"number\"] {\n    background: #16213e;\n    border: 1px solid #2c3e50;\n    border-radius: 4px;\n    color: #ecf0f1;\n    padding: 4px 6px;\n    font: inherit;\n    font-size: 12px;\n}\n.bw-cond-editor select { flex: 1; min-width: 0; }\n.bw-cond-editor input[type=\"number\"] { width: 64px; }\n.bw-cond-editor .bw-cond-buttons {\n    display: flex;\n    gap: 6px;\n    margin-top: 10px;\n    justify-content: flex-end;\n}\n.bw-cond-editor button {\n    background: #2c3e50;\n    border: 1px solid #3d5a80;\n    border-radius: 4px;\n    color: #ecf0f1;\n    padding: 5px 12px;\n    font: inherit;\n    font-size: 12px;\n    cursor: pointer;\n}\n.bw-cond-editor button:hover { background: #34495e; }\n.bw-cond-editor button.bw-cond-ok { background: #2980b9; border-color: #3498db; }\n.bw-cond-editor button.bw-cond-ok:hover { background: #3498db; }\n.bw-cond-editor .bw-cond-add {\n    font-size: 11px;\n    color: #3498db;\n    cursor: pointer;\n    margin-top: 2px;\n}\n.bw-cond-editor .bw-cond-add:hover { text-decoration: underline; }\n.bw-cond-editor .bw-cond-remove {\n    cursor: pointer;\n    color: #e74c3c;\n    font-size: 14px;\n    line-height: 1;\n    padding: 0 2px;\n}\n.bw-cond-editor .bw-cond-error {\n    color: #e74c3c;\n    font-size: 11px;\n    margin-top: 4px;\n}\n";
let styleInjected = false;
const TEXT = {
  en: {
    title: 'Pause here when:',
    addClause: '+ add condition',
    ok: 'Set',
    cancel: 'Cancel',
    clear: 'Remove',
    noVars: '(no variables)'
  },
  de: {
    title: 'Hier anhalten, wenn:',
    addClause: '+ Bedingung hinzufügen',
    ok: 'Setzen',
    cancel: 'Abbrechen',
    clear: 'Entfernen',
    noVars: '(keine Variablen)'
  }
};

/**
 * @typedef {object} Clause
 * @property {string} variable
 * @property {string} op
 * @property {number} value
 * @property {string} joiner  'and' | 'or' (ignored for first clause)
 */

/**
 * Parse an existing condition source back into clauses for editing.
 * @param {string} source
 * @param {string[]} variables
 * @returns {Clause[]}
 */
function parseClauses(source, variables) {
  if (!source) return [{
    variable: variables[0] || '',
    op: '>',
    value: 0,
    joiner: 'and'
  }];
  const parts = source.split(/\s+(and|or)\s+/i);
  const clauses = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      if (clauses.length) clauses[clauses.length - 1].joiner = parts[i].toLowerCase();
      continue;
    }
    const m = parts[i].match(/^(.+?)\s*(>=|<=|!=|<>|==|=|>|<)\s*(.+)$/);
    if (m) {
      clauses.push({
        variable: m[1].trim(),
        op: m[2] === '==' ? '=' : m[2] === '<>' ? '!=' : m[2],
        value: Number(m[3]) || 0,
        joiner: 'and'
      });
    }
  }
  return clauses.length ? clauses : [{
    variable: variables[0] || '',
    op: '>',
    value: 0,
    joiner: 'and'
  }];
}

/**
 * Serialize clauses back to condition source.
 * @param {Clause[]} clauses
 * @returns {string}
 */
function serializeClauses(clauses) {
  return clauses.map((c, i) => {
    const cmp = "".concat(c.variable, " ").concat(c.op, " ").concat(c.value);
    return i === 0 ? cmp : "".concat(c.joiner, " ").concat(cmp);
  }).join(' ');
}

/**
 * Show the condition editor popup near a screen position.
 *
 * @param {object} opts
 * @param {number} opts.x  screen X to anchor near
 * @param {number} opts.y  screen Y to anchor near
 * @param {string[]} opts.variables  available variable names
 * @param {string} opts.existing  current condition source, or ''
 * @param {string} opts.locale  'en' | 'de'
 * @param {(source: string | null) => void} opts.onDone  null = cancelled, '' = cleared
 */
function showConditionEditor(_ref) {
  let {
    x,
    y,
    variables,
    existing,
    locale,
    onDone
  } = _ref;
  if (!styleInjected) {
    const s = document.createElement('style');
    s.textContent = STYLES;
    document.head.appendChild(s);
    styleInjected = true;
  }
  const words = TEXT[locale] || TEXT.en;
  const vars = variables.length ? variables : [];

  // Remove any existing editor.
  const old = document.querySelector('.bw-cond-editor');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'bw-cond-editor';
  document.body.appendChild(el);
  let clauses = parseClauses(existing, vars);
  function render() {
    el.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'bw-cond-title';
    title.textContent = words.title;
    el.appendChild(title);
    clauses.forEach((clause, idx) => {
      // Joiner between clauses
      if (idx > 0) {
        const joinerRow = document.createElement('div');
        joinerRow.className = 'bw-cond-row';
        const joinerSel = document.createElement('select');
        joinerSel.style.width = '60px';
        joinerSel.style.flex = 'none';
        for (const j of ['and', 'or']) {
          const opt = document.createElement('option');
          opt.value = j;
          opt.textContent = j;
          if (clause.joiner === j) opt.selected = true;
          joinerSel.appendChild(opt);
        }
        joinerSel.addEventListener('change', () => {
          clause.joiner = joinerSel.value;
        });
        joinerRow.appendChild(joinerSel);
        const remove = document.createElement('span');
        remove.className = 'bw-cond-remove';
        remove.textContent = '×';
        remove.title = 'remove';
        remove.addEventListener('click', () => {
          clauses.splice(idx, 1);
          render();
        });
        joinerRow.appendChild(remove);
        el.appendChild(joinerRow);
      }
      const row = document.createElement('div');
      row.className = 'bw-cond-row';

      // Variable dropdown
      const varSel = document.createElement('select');
      if (!vars.length) {
        const opt = document.createElement('option');
        opt.textContent = words.noVars;
        opt.disabled = true;
        varSel.appendChild(opt);
      }
      for (const v of vars) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (clause.variable === v) opt.selected = true;
        varSel.appendChild(opt);
      }
      varSel.addEventListener('change', () => {
        clause.variable = varSel.value;
      });
      row.appendChild(varSel);

      // Operator dropdown
      const opSel = document.createElement('select');
      opSel.style.width = '50px';
      opSel.style.flex = 'none';
      for (const op of OPS) {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        if (clause.op === op) opt.selected = true;
        opSel.appendChild(opt);
      }
      opSel.addEventListener('change', () => {
        clause.op = opSel.value;
      });
      row.appendChild(opSel);

      // Number input
      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.value = clause.value;
      numInput.addEventListener('input', () => {
        clause.value = Number(numInput.value) || 0;
      });
      row.appendChild(numInput);
      el.appendChild(row);
    });

    // Add clause link
    const add = document.createElement('div');
    add.className = 'bw-cond-add';
    add.textContent = words.addClause;
    add.addEventListener('click', () => {
      clauses.push({
        variable: vars[0] || '',
        op: '>',
        value: 0,
        joiner: 'and'
      });
      render();
    });
    el.appendChild(add);

    // Buttons
    const buttons = document.createElement('div');
    buttons.className = 'bw-cond-buttons';
    if (existing) {
      const clearBtn = document.createElement('button');
      clearBtn.textContent = words.clear;
      clearBtn.addEventListener('click', () => {
        cleanup();
        onDone('');
      });
      buttons.appendChild(clearBtn);
    }
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = words.cancel;
    cancelBtn.addEventListener('click', () => {
      cleanup();
      onDone(null);
    });
    buttons.appendChild(cancelBtn);
    const okBtn = document.createElement('button');
    okBtn.className = 'bw-cond-ok';
    okBtn.textContent = words.ok;
    okBtn.addEventListener('click', () => {
      const source = serializeClauses(clauses);
      cleanup();
      onDone(source);
    });
    buttons.appendChild(okBtn);
    el.appendChild(buttons);
  }
  function cleanup() {
    el.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      cleanup();
      onDone(null);
    }
    if (e.key === 'Enter') {
      const source = serializeClauses(clauses);
      cleanup();
      onDone(source);
    }
  }
  document.addEventListener('keydown', onKey);
  render();

  // Position near the click, keeping it on screen.
  const rect = el.getBoundingClientRect();
  el.style.left = "".concat(Math.min(x, window.innerWidth - rect.width - 12), "px");
  el.style.top = "".concat(Math.min(y, window.innerHeight - rect.height - 12), "px");
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

/***/ })

}]);