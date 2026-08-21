"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-vdu-terminal"],{

/***/ "./src/components/tw-pseudocode/vdu-terminal.jsx":
/*!*******************************************************!*\
  !*** ./src/components/tw-pseudocode/vdu-terminal.jsx ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var _lib_bw_board_vdu_decoder_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../lib/bw-board/vdu-decoder.js */ "./src/lib/bw-board/vdu-decoder.js");



/**
 * VduTerminal — BBC BASIC VDU terminal with canvas graphics.
 *
 * The BBC's graphics are a BYTE PROTOCOL: MOVE/DRAW/PLOT/COLOUR are
 * VDU control sequences on the same stream as printed text. This
 * component feeds the raw serial output through VduDecoder and renders:
 * - text as a character grid (MODE 7 style: 40 cols × 25 rows)
 * - graphics (DRAW/MOVE/PLOT) as lines on a canvas overlay
 *
 * BBC BASIC screen coordinates: origin at bottom-left, Y increases
 * upward, 1280×1024 logical units in MODE 0-6.
 */

// BBC BASIC 8-colour palette (physical colours 0-7)
const PALETTE = ['#000000', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
const L10N = {
  en: {
    vduTitle: 'BBC BASIC screen'
  },
  de: {
    vduTitle: 'BBC-BASIC-Bildschirm'
  }
};
const pickLocale = () => {
  try {
    return /^de/i.test(navigator.language) ? 'de' : 'en';
  } catch (_unused) {
    return 'en';
  }
};
class VduTerminal extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    this._canvasRef = /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createRef();
    this._decoder = new _lib_bw_board_vdu_decoder_js__WEBPACK_IMPORTED_MODULE_1__.VduDecoder();
    this._gx = 0; // graphics cursor x (logical 0-1279)
    this._gy = 0; // graphics cursor y (logical 0-1023)
    this._gcol = 7; // graphics foreground colour
    this._textCol = 7; // text foreground colour
    this._bgCol = 0; // background colour
    this._cx = 0; // text cursor column
    this._cy = 0; // text cursor row
    this._processed = 0; // bytes already processed from props.output
  }
  componentDidMount() {
    this._draw();
  }
  componentDidUpdate(prevProps) {
    if (this.props.output !== prevProps.output) {
      this._processNew();
    }
  }
  _processNew() {
    const output = this.props.output || '';
    if (output.length <= this._processed) return;
    const newBytes = output.slice(this._processed);
    this._processed = output.length;
    for (let i = 0; i < newBytes.length; i++) {
      const events = this._decoder.push(newBytes.charCodeAt(i));
      for (const ev of events) this._handleEvent(ev);
    }
  }
  _handleEvent(ev) {
    const canvas = this._canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    // Map BBC logical coords (1280×1024, origin bottom-left) to canvas
    const mapX = x => x / 1280 * W;
    const mapY = y => H - y / 1024 * H;
    switch (ev.type) {
      case 'char':
        ctx.fillStyle = PALETTE[this._textCol & 7];
        ctx.font = '12px monospace';
        ctx.fillText(ev.char, this._cx * 8 + 2, this._cy * 16 + 13);
        this._cx++;
        if (this._cx >= 40) {
          this._cx = 0;
          this._cy++;
        }
        break;
      case 'newline':
        this._cy++;
        this._cx = 0;
        break;
      case 'cr':
        this._cx = 0;
        break;
      case 'cls':
        ctx.fillStyle = PALETTE[this._bgCol & 7];
        ctx.fillRect(0, 0, W, H);
        this._cx = 0;
        this._cy = 0;
        break;
      case 'clg':
        ctx.fillStyle = PALETTE[this._bgCol & 7];
        ctx.fillRect(0, 0, W, H);
        break;
      case 'move':
        this._gx = ev.x;
        this._gy = ev.y;
        break;
      case 'draw':
        ctx.strokeStyle = PALETTE[this._gcol & 7];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mapX(this._gx), mapY(this._gy));
        ctx.lineTo(mapX(ev.x), mapY(ev.y));
        ctx.stroke();
        this._gx = ev.x;
        this._gy = ev.y;
        break;
      case 'plot':
        // Generic PLOT: for now, treat as DRAW for triangle fill modes
        // and as MOVE for move modes. Full PLOT decode is future.
        if (ev.mode <= 3) {
          this._gx = ev.x;
          this._gy = ev.y;
        } else {
          ctx.strokeStyle = PALETTE[this._gcol & 7];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mapX(this._gx), mapY(this._gy));
          ctx.lineTo(mapX(ev.x), mapY(ev.y));
          ctx.stroke();
          this._gx = ev.x;
          this._gy = ev.y;
        }
        break;
      case 'colour':
        if (ev.n >= 128) this._bgCol = ev.n & 7;else this._textCol = ev.n & 7;
        break;
      case 'gcol':
        this._gcol = ev.colour & 7;
        break;
      case 'mode':
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        this._cx = 0;
        this._cy = 0;
        this._gx = 0;
        this._gy = 0;
        break;
      case 'home':
        this._cx = 0;
        this._cy = 0;
        break;
      case 'origin':
        // TODO: set graphics origin offset
        break;
    }
  }
  _draw() {
    const canvas = this._canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  render() {
    const t = L10N[pickLocale()];
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        background: '#000',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid #333',
        display: 'inline-block',
        marginTop: 8
      },
      "data-testid": "bw-vdu-terminal"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("canvas", {
      ref: this._canvasRef,
      width: 320,
      height: 256,
      title: t.vduTitle,
      style: {
        width: 320,
        height: 256,
        imageRendering: 'pixelated',
        display: 'block'
      }
    }));
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (VduTerminal);

/***/ }),

/***/ "./src/lib/bw-board/vdu-decoder.js":
/*!*****************************************!*\
  !*** ./src/lib/bw-board/vdu-decoder.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   VduDecoder: () => (/* binding */ VduDecoder),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 * VDU stream decoder — the logic half of the VDU terminal.
 *
 * The BBC's whole graphics system is a BYTE PROTOCOL: MOVE/DRAW/PLOT/COLOUR
 * are sugar over VDU control sequences on the same stream as printed text
 * (that is why a serial BBC BASIC can draw). This decoder turns the raw
 * ACIA byte stream into typed events; a canvas face renders them, tests
 * assert on them, and neither needs video hardware emulated.
 *
 * The grammar is the classic VDU parameter-count table: codes 0-31 take a
 * fixed number of parameter bytes (VDU 25 = PLOT takes 5: mode, x lo/hi,
 * y lo/hi as SIGNED 16-bit), 32-126 are printable characters, 127 is
 * delete. Codes this decoder understands get typed events (plot/move/draw,
 * mode, colour, gcol, origin, tab, cls/clg, newline, bell); the rest come
 * out as {type:'vdu', code, params} so nothing is dropped silently.
 *
 * Feed it bytes in any chunking — state carries across pushes.
 *
 * @module
 */

/** Parameter byte counts for VDU 0-31 (the BBC MOS table). */
const PARAM_COUNT = [0, 1, 0, 0, 0, 0, 0, 0,
// 0 nul, 1 next-to-printer, 2 printer on, 3 off, 4 text@text, 5 text@graphics, 6 enable, 7 bell
0, 0, 0, 0, 0, 0, 0, 0,
// 8 back, 9 fwd, 10 lf, 11 up, 12 cls, 13 cr, 14 page-on, 15 page-off
0, 1, 2, 5, 0, 0, 1, 9,
// 16 clg, 17 colour, 18 gcol, 19 palette, 20 default-cols, 21 vdu-off, 22 mode, 23 udg
8, 5, 0, 0, 4, 4, 0, 2 // 24 gwindow, 25 plot, 26 default-windows, 27 -, 28 twindow, 29 origin, 30 home, 31 tab
];
const s16 = (lo, hi) => {
  const v = lo | hi << 8;
  return v >= 0x8000 ? v - 0x10000 : v;
};
class VduDecoder {
  constructor() {
    this.code = null; // control code awaiting parameters
    this.params = [];
    this.need = 0;
  }

  /**
   * Push one byte; returns an array of decoded events (possibly empty —
   * a parameter byte mid-sequence produces nothing yet).
   */
  push(byte) {
    byte &= 0xff;
    if (this.code !== null) {
      this.params.push(byte);
      if (this.params.length < this.need) return [];
      const ev = this._finish(this.code, this.params);
      this.code = null;
      this.params = [];
      this.need = 0;
      return ev;
    }
    if (byte >= 32 && byte !== 127) return [{
      type: 'char',
      code: byte,
      char: String.fromCharCode(byte)
    }];
    if (byte === 127) return [{
      type: 'delete'
    }];
    const need = PARAM_COUNT[byte];
    if (need === 0) return this._finish(byte, []);
    this.code = byte;
    this.need = need;
    return [];
  }

  /** Convenience: push many bytes, collect all events. */
  pushAll(bytes) {
    const out = [];
    for (const b of bytes) out.push(...this.push(b));
    return out;
  }
  _finish(code, p) {
    switch (code) {
      case 7:
        return [{
          type: 'bell'
        }];
      case 8:
        return [{
          type: 'cursor',
          dx: -1,
          dy: 0
        }];
      case 9:
        return [{
          type: 'cursor',
          dx: 1,
          dy: 0
        }];
      case 10:
        return [{
          type: 'newline'
        }];
      case 11:
        return [{
          type: 'cursor',
          dx: 0,
          dy: -1
        }];
      case 12:
        return [{
          type: 'cls'
        }];
      case 13:
        return [{
          type: 'cr'
        }];
      case 16:
        return [{
          type: 'clg'
        }];
      case 17:
        return [{
          type: 'colour',
          n: p[0]
        }];
      case 18:
        return [{
          type: 'gcol',
          mode: p[0],
          colour: p[1]
        }];
      case 22:
        return [{
          type: 'mode',
          n: p[0]
        }];
      case 25:
        {
          const mode = p[0];
          const x = s16(p[1], p[2]);
          const y = s16(p[3], p[4]);
          // 0-7 relative/absolute line family: 4 = MOVE, 5 = DRAW —
          // the two BASIC keywords are exactly these plot modes.
          const name = mode === 4 ? 'move' : mode === 5 ? 'draw' : 'plot';
          return [{
            type: name,
            mode,
            x,
            y
          }];
        }
      case 29:
        return [{
          type: 'origin',
          x: s16(p[0], p[1]),
          y: s16(p[2], p[3])
        }];
      case 30:
        return [{
          type: 'home'
        }];
      case 31:
        return [{
          type: 'tab',
          x: p[0],
          y: p[1]
        }];
      default:
        return [{
          type: 'vdu',
          code,
          params: p
        }];
    }
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (VduDecoder);

/***/ })

}]);