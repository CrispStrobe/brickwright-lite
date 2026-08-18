"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-codemirror"],{

/***/ "./src/lib/cm-lang-asm.js":
/*!********************************!*\
  !*** ./src/lib/cm-lang-asm.js ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   asm: () => (/* binding */ asm)
/* harmony export */ });
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @codemirror/language */ "./node_modules/@codemirror/language/dist/index.js");
/**
 * Minimal CodeMirror 6 language mode for assembly listing output.
 * Handles 8051, AVR, ARM, and 6502 assembly from the compile service.
 */

const asmMode = {
  startState: () => ({}),
  token(stream) {
    // Comments (various assembler styles)
    if (stream.match(/^;.*/)) return 'comment';
    if (stream.match(/^\/\/.*/)) return 'comment';
    // Hex address at line start (listing format: "0000:")
    if (stream.sol() && stream.match(/^[0-9A-Fa-f]{4,8}:?\s/)) return 'number';
    // Hex literals
    if (stream.match(/^0x[0-9A-Fa-f]+/i)) return 'number';
    if (stream.match(/^[0-9A-Fa-f]+[Hh]\b/)) return 'number';
    if (stream.match(/^\$[0-9A-Fa-f]+/)) return 'number';
    if (stream.match(/#[0-9A-Fa-f]+/)) return 'number';
    // Decimal numbers
    if (stream.match(/^\d+/)) return 'number';
    // Labels (word followed by colon at start of line)
    if (stream.sol() && stream.match(/^[A-Za-z_]\w*:/)) return 'definition';
    // Directives (.db, .org, .section, etc.)
    if (stream.match(/^\.[a-zA-Z]\w*/)) return 'keyword';
    // Mnemonics — common 8051/AVR/ARM/6502 instructions
    if (stream.match(/^(mov|add|sub|inc|dec|jmp|jnz|jz|jc|jnc|jb|jnb|call|ret|reti|push|pop|nop|clr|setb|cpl|anl|orl|xrl|rl|rr|djnz|cjne|acall|ajmp|lcall|ljmp|sjmp|movx|movc|xch|swap|mul|div|da)\b/i)) return 'keyword';
    if (stream.match(/^(lda|sta|ldx|stx|ldy|sty|adc|sbc|and|ora|eor|cmp|cpx|cpy|bit|asl|lsr|rol|ror|jsr|rts|rti|brk|pha|pla|php|plp|tax|txa|tay|tya|tsx|txs|sec|clc|sei|cli|sed|cld|clv|bcc|bcs|beq|bne|bmi|bpl|bvc|bvs|inx|iny|dex|dey)\b/i)) return 'keyword';
    if (stream.match(/^(ldi|lds|sts|lpm|spm|in|out|sbi|cbi|sbic|sbis|brne|breq|brcs|brcc|rcall|rjmp|ijmp|icall|adiw|sbiw|andi|ori|com|neg|tst|cp|cpc|cpi|cpse|sbrc|sbrs|bld|bst|wdr|sleep)\b/i)) return 'keyword';
    // Register names
    if (stream.match(/^[rR]\d{1,2}\b/)) return 'variableName';
    if (stream.match(/^(SP|PC|ACC|PSW|DPTR|A|B|C|X|Y|P[0-3]|TMOD|TCON|TH[01]|TL[01]|SCON|SBUF|IE|IP|PCON)\b/)) return 'variableName';
    // Identifiers
    if (stream.match(/^[A-Za-z_]\w*/)) return null;
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: {
      line: ';'
    }
  }
};
const asm = () => _codemirror_language__WEBPACK_IMPORTED_MODULE_0__.StreamLanguage.define(asmMode);

/***/ }),

/***/ "./src/lib/cm-lang-basic.js":
/*!**********************************!*\
  !*** ./src/lib/cm-lang-basic.js ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   basic: () => (/* binding */ basic)
/* harmony export */ });
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @codemirror/language */ "./node_modules/@codemirror/language/dist/index.js");
/**
 * Minimal CodeMirror 6 language mode for BASIC (BBC BASIC / 6502 BASIC).
 * StreamLanguage — no Lezer grammar needed.
 */

const KEYWORD = /^(REM|LET|PRINT|INPUT|IF|THEN|ELSE|ENDIF|FOR|TO|STEP|NEXT|WHILE|WEND|ENDWHILE|REPEAT|UNTIL|GOTO|GOSUB|RETURN|DEF|PROC|ENDPROC|FN|END|DIM|DATA|READ|RESTORE|ON|AND|OR|NOT|MOD|DIV|TRUE|FALSE|ABS|INT|RND|SQR|SGN|ASC|CHR\$|STR\$|VAL|LEFT\$|RIGHT\$|MID\$|LEN|TIME|POKE|PEEK|CLS|STOP|RUN|NEW)$/i;
const basicMode = {
  startState: () => ({
    afterLineNum: false
  }),
  token(stream, state) {
    // At start of line, check for line number
    if (stream.sol()) {
      state.afterLineNum = false;
      if (stream.match(/^\d+/)) {
        state.afterLineNum = true;
        return 'number';
      }
    }
    // REM comment — rest of line
    if (stream.match(/^REM\b.*/i)) return 'comment';
    // Strings
    if (stream.match(/^"[^"]*"/)) return 'string';
    // Numbers
    if (stream.match(/^&[0-9A-Fa-f]+/)) return 'number';
    if (stream.match(/^\d+(\.\d+)?/)) return 'number';
    // Words
    if (stream.match(/^[A-Za-z_]\w*\$?/)) {
      const word = stream.current();
      if (KEYWORD.test(word)) return 'keyword';
      return 'variableName';
    }
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: {
      line: 'REM'
    }
  }
};
const basic = () => _codemirror_language__WEBPACK_IMPORTED_MODULE_0__.StreamLanguage.define(basicMode);

/***/ }),

/***/ "./src/lib/cm-lang-pseudocode.js":
/*!***************************************!*\
  !*** ./src/lib/cm-lang-pseudocode.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   pseudocode: () => (/* binding */ pseudocode)
/* harmony export */ });
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @codemirror/language */ "./node_modules/@codemirror/language/dist/index.js");
/**
 * Minimal CodeMirror 6 language mode for BrickWright pseudocode.
 * StreamLanguage — no Lezer grammar needed for keyword + string + comment highlighting.
 */

const STRUCTURAL = /^(SPRITE|STAGE|GLOBAL|LOCAL|LIST|SHAPE|COSTUME|BACKDROP|SOUND|WHEN|DEFINE|DEVICE|PIN|CLOCK)$/;
const CONTROL = /^(IF|THEN|ELSE|FOREVER|REPEAT|UNTIL|FAST|STOP)$/;
const KEYWORD = /^(set|change|say|think|ask|wait|move|turn|go|glide|point|broadcast|create|delete|stop|add|insert|replace|call|play|hide|show|switch|next|when|and|or|not|of|to|by|until|contains|mod|join|item|pick|random|round|sqrt|length|clone|myself|OUTPUT|INPUT|ANALOG|ACTIVE|LOW|HIGH)$/i;
const pseudocodeMode = {
  startState: () => ({}),
  token(stream) {
    // Comments
    if (stream.match(/^#.*/)) return 'comment';
    // Strings
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^'(?:[^'\\]|\\.)*'/)) return 'string';
    // Numbers
    if (stream.match(/^0x[0-9a-fA-F]+/)) return 'number';
    if (stream.match(/^\d+(\.\d+)?/)) return 'number';
    // Words
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const word = stream.current();
      if (STRUCTURAL.test(word)) return 'keyword';
      if (CONTROL.test(word)) return 'keyword';
      if (KEYWORD.test(word)) return 'variableName';
      return null;
    }
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: {
      line: '#'
    }
  }
};
const pseudocode = () => _codemirror_language__WEBPACK_IMPORTED_MODULE_0__.StreamLanguage.define(pseudocodeMode);

/***/ }),

/***/ "./src/lib/codemirror-editor.jsx":
/*!***************************************!*\
  !*** ./src/lib/codemirror-editor.jsx ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! prop-types */ "./node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_14___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_14__);
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @codemirror/view */ "./node_modules/@codemirror/view/dist/index.js");
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @codemirror/state */ "./node_modules/@codemirror/state/dist/index.js");
/* harmony import */ var _codemirror_commands__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! @codemirror/commands */ "./node_modules/@codemirror/commands/dist/index.js");
/* harmony import */ var _codemirror_search__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! @codemirror/search */ "./node_modules/@codemirror/search/dist/index.js");
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! @codemirror/language */ "./node_modules/@codemirror/language/dist/index.js");
/* harmony import */ var _codemirror_autocomplete__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! @codemirror/autocomplete */ "./node_modules/@codemirror/autocomplete/dist/index.js");
/* harmony import */ var _codemirror_theme_one_dark__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! @codemirror/theme-one-dark */ "./node_modules/@codemirror/theme-one-dark/dist/index.js");
/* harmony import */ var _codemirror_lang_cpp__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @codemirror/lang-cpp */ "./node_modules/@codemirror/lang-cpp/dist/index.js");
/* harmony import */ var _codemirror_lang_python__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @codemirror/lang-python */ "./node_modules/@codemirror/lang-python/dist/index.js");
/* harmony import */ var _codemirror_lang_javascript__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! @codemirror/lang-javascript */ "./node_modules/@codemirror/lang-javascript/dist/index.js");
/* harmony import */ var _cm_lang_pseudocode_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./cm-lang-pseudocode.js */ "./src/lib/cm-lang-pseudocode.js");
/* harmony import */ var _cm_lang_basic_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./cm-lang-basic.js */ "./src/lib/cm-lang-basic.js");
/* harmony import */ var _cm_lang_asm_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./cm-lang-asm.js */ "./src/lib/cm-lang-asm.js");
/**
 * CodeMirror 6 React wrapper for BrickWright's Code tab.
 *
 * Lazy-loaded via React.lazy() in pseudocode-importer.jsx so blocks-only
 * users never download the ~200 KB CM chunk.
 *
 * Design:
 * - CM6 is uncontrolled internally; we sync external `value` changes via
 *   dispatch and prevent feedback loops with an `_updating` flag.
 * - `setHighlightedLine(n)` for debugger use (line decoration).
 * - Theme follows `bw-circuit-theme` localStorage (light/dark).
 * - Language modes switch when the `lang` prop changes.
 * - Auto-indent rule: increase indent after lines ending with a colon
 *   (pseudocode structural pattern).
 */



















// ── Highlighted-line decoration (for debugger) ─────────────────────
const setHighlightEffect = _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.StateEffect.define();
const highlightedLineField = _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.StateField.define({
  create: () => _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.Decoration.none,
  update(decos, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlightEffect)) {
        if (e.value === null) return _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.Decoration.none;
        const line = tr.state.doc.line(Math.min(e.value, tr.state.doc.lines));
        const deco = _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.Decoration.line({
          class: 'cm-bw-highlighted-line'
        }).range(line.from);
        return _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.Decoration.set([deco]);
      }
    }
    return decos.map(tr.changes);
  },
  provide: f => _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.decorations.from(f)
});

// ── Language picker ────────────────────────────────────────────────
function langExtension(lang) {
  switch (lang) {
    case 'c':
      return (0,_codemirror_lang_cpp__WEBPACK_IMPORTED_MODULE_6__.cpp)();
    case 'python':
    case 'micropython':
      return (0,_codemirror_lang_python__WEBPACK_IMPORTED_MODULE_7__.python)();
    case 'javascript':
      return (0,_codemirror_lang_javascript__WEBPACK_IMPORTED_MODULE_8__.javascript)();
    case 'basic':
      return (0,_cm_lang_basic_js__WEBPACK_IMPORTED_MODULE_2__.basic)();
    case 'asm':
      return (0,_cm_lang_asm_js__WEBPACK_IMPORTED_MODULE_3__.asm)();
    case 'pseudocode':
    default:
      return (0,_cm_lang_pseudocode_js__WEBPACK_IMPORTED_MODULE_1__.pseudocode)();
  }
}

// ── Auto-indent after colon (pseudocode pattern) ──────────────────
// CM6 indentOnInput handles the re-indent on typing; this adds the
// "increase after colon" rule via a simple language data facet.
// We override indent for pseudocode: if the previous non-empty line
// ends with ":", indent one level deeper.
const pseudocodeIndent = _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.updateListener.of(update => {
  // Only act on user input that produces a newline
  if (!update.docChanged) return;
  for (const tr of update.transactions) {
    if (!tr.isUserEvent('input')) continue;
    tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      const text = inserted.toString();
      if (text !== '\n' && text !== '\r\n') return;
      // Find the line we just left (the one before the cursor)
      const pos = fromB + text.length;
      const state = update.state;
      const curLine = state.doc.lineAt(pos);
      if (curLine.number <= 1) return;
      const prevLine = state.doc.line(curLine.number - 1);
      const prevText = prevLine.text;
      const prevIndent = prevText.match(/^(\s*)/)[1];
      const trimmed = prevText.trimEnd();
      if (trimmed.endsWith(':')) {
        const newIndent = prevIndent + '  ';
        // Only add indent if the current line doesn't already have it
        if (!curLine.text.startsWith(newIndent) || curLine.text === '') {
          update.view.dispatch({
            changes: {
              from: curLine.from,
              to: curLine.from + curLine.text.match(/^\s*/)[0].length,
              insert: newIndent
            }
          });
        }
      }
    });
  }
});

// ── Theme styles ──────────────────────────────────────────────────
const bwLightTheme = _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.theme({
  // Fill the flex container so CM6's own scroller handles overflow
  '&': {
    fontSize: '13px',
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
    height: '100%'
  },
  '.cm-scroller': {
    overflow: 'auto'
  },
  '.cm-content': {
    padding: '8px 0'
  },
  '.cm-gutters': {
    background: '#f8fafc',
    borderRight: '1px solid #e2e8f0',
    color: '#94a3b8'
  },
  '.cm-activeLine': {
    background: 'hsla(215, 100%, 95%, 0.5)'
  },
  '.cm-bw-highlighted-line': {
    background: 'hsla(45, 100%, 85%, 0.6)'
  },
  '&.cm-focused': {
    outline: '2px solid #4c97ff'
  },
  '.cm-selectionBackground': {
    background: 'hsla(215, 100%, 85%, 0.4) !important'
  }
});
const bwDarkTheme = _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.theme({
  '.cm-bw-highlighted-line': {
    background: 'hsla(45, 80%, 30%, 0.5)'
  }
}, {
  dark: true
});
class CodeMirrorEditor extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    this._ref = /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createRef();
    this._view = null;
    this._updating = false; // prevent feedback loop
    this._langCompartment = new _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.Compartment();
    this._themeCompartment = new _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.Compartment();
    this._readOnlyCompartment = new _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.Compartment();
    this._onSettingsChange = this._onSettingsChange.bind(this);
  }
  componentDidMount() {
    const dark = this._isDark();
    const extensions = [(0,_codemirror_view__WEBPACK_IMPORTED_MODULE_5__.lineNumbers)(), (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_5__.highlightActiveLine)(), (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_5__.highlightSpecialChars)(), (0,_codemirror_commands__WEBPACK_IMPORTED_MODULE_9__.history)(), (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_5__.drawSelection)(), (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_5__.rectangularSelection)(), (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_10__.bracketMatching)(), (0,_codemirror_autocomplete__WEBPACK_IMPORTED_MODULE_11__.closeBrackets)(), (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_10__.indentOnInput)(), _codemirror_language__WEBPACK_IMPORTED_MODULE_10__.indentUnit.of('  '), (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_10__.foldGutter)(), (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_10__.syntaxHighlighting)(_codemirror_language__WEBPACK_IMPORTED_MODULE_10__.defaultHighlightStyle, {
      fallback: true
    }), _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.keymap.of([..._codemirror_autocomplete__WEBPACK_IMPORTED_MODULE_11__.closeBracketsKeymap, ..._codemirror_commands__WEBPACK_IMPORTED_MODULE_9__.defaultKeymap, ..._codemirror_commands__WEBPACK_IMPORTED_MODULE_9__.historyKeymap, ..._codemirror_search__WEBPACK_IMPORTED_MODULE_12__.searchKeymap, _codemirror_commands__WEBPACK_IMPORTED_MODULE_9__.indentWithTab]), highlightedLineField, pseudocodeIndent, this._langCompartment.of(langExtension(this.props.lang)), this._themeCompartment.of(dark ? [_codemirror_theme_one_dark__WEBPACK_IMPORTED_MODULE_13__.oneDark, bwDarkTheme] : [bwLightTheme]), this._readOnlyCompartment.of(_codemirror_state__WEBPACK_IMPORTED_MODULE_4__.EditorState.readOnly.of(!!this.props.readOnly)), _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.updateListener.of(update => {
      if (update.docChanged && !this._updating && this.props.onChange) {
        this._updating = true;
        this.props.onChange(update.state.doc.toString());
        this._updating = false;
      }
    }), _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.lineWrapping];
    this._view = new _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView({
      state: _codemirror_state__WEBPACK_IMPORTED_MODULE_4__.EditorState.create({
        doc: this.props.value || '',
        extensions
      }),
      parent: this._ref.current
    });
    window.addEventListener('bw-settings-change', this._onSettingsChange);
  }
  componentDidUpdate(prevProps) {
    if (!this._view) return;

    // External value change (tab switch, example load, from-blocks, etc.)
    if (this.props.value !== prevProps.value && !this._updating) {
      const current = this._view.state.doc.toString();
      if (this.props.value !== current) {
        this._updating = true;
        this._view.dispatch({
          changes: {
            from: 0,
            to: current.length,
            insert: this.props.value || ''
          }
        });
        this._updating = false;
      }
    }

    // Language change
    if (this.props.lang !== prevProps.lang) {
      this._view.dispatch({
        effects: this._langCompartment.reconfigure(langExtension(this.props.lang))
      });
    }

    // ReadOnly change
    if (this.props.readOnly !== prevProps.readOnly) {
      this._view.dispatch({
        effects: this._readOnlyCompartment.reconfigure(_codemirror_state__WEBPACK_IMPORTED_MODULE_4__.EditorState.readOnly.of(!!this.props.readOnly))
      });
    }
  }
  componentWillUnmount() {
    window.removeEventListener('bw-settings-change', this._onSettingsChange);
    if (this._view) {
      this._view.destroy();
      this._view = null;
    }
  }
  _isDark() {
    try {
      return localStorage.getItem('bw-circuit-theme') === 'dark';
    } catch (_unused) {
      return false;
    }
  }
  _onSettingsChange(e) {
    if (!e.detail || e.detail.key !== 'bw-circuit-theme' || !this._view) return;
    const dark = e.detail.value === 'dark';
    this._view.dispatch({
      effects: this._themeCompartment.reconfigure(dark ? [_codemirror_theme_one_dark__WEBPACK_IMPORTED_MODULE_13__.oneDark, bwDarkTheme] : [bwLightTheme])
    });
  }

  /** Imperative API for the debugger: highlight line n (1-based), or null to clear. */
  setHighlightedLine(n) {
    if (!this._view) return;
    this._view.dispatch({
      effects: setHighlightEffect.of(n)
    });
    // Scroll the highlighted line into view
    if (n !== null && n >= 1 && n <= this._view.state.doc.lines) {
      const line = this._view.state.doc.line(n);
      this._view.dispatch({
        effects: _codemirror_view__WEBPACK_IMPORTED_MODULE_5__.EditorView.scrollIntoView(line.from, {
          y: 'center'
        })
      });
    }
  }

  /** Imperative API: focus the editor. */
  focus() {
    if (this._view) this._view.focus();
  }
  render() {
    // flex:1 + minHeight:0 is the classic flex column trick: it makes
    // this container take remaining space, and minHeight:0 overrides
    // the default min-height:auto that prevents shrinking below content.
    // CM6's .cm-editor gets height:100% so its .cm-scroller scrolls.
    const style = {
      flex: '1 1 0',
      minHeight: 0,
      width: '100%',
      border: this.props.readOnly ? '1px solid #e2e8f0' : '1px solid #cbd5e1',
      borderRadius: 8,
      overflow: 'hidden'
    };
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      ref: this._ref,
      style: style,
      "data-testid": "bw-codemirror"
    });
  }
}
CodeMirrorEditor.propTypes = {
  value: (prop_types__WEBPACK_IMPORTED_MODULE_14___default().string),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_14___default().func),
  readOnly: (prop_types__WEBPACK_IMPORTED_MODULE_14___default().bool),
  lang: (prop_types__WEBPACK_IMPORTED_MODULE_14___default().string)
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (CodeMirrorEditor);

/***/ })

}]);