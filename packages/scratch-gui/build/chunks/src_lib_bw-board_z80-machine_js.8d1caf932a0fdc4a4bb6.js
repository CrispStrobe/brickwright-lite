"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["src_lib_bw-board_z80-machine_js"],{

/***/ "./src/lib/bw-board/ay-3-8912.js":
/*!***************************************!*\
  !*** ./src/lib/bw-board/ay-3-8912.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AY38912: () => (/* binding */ AY38912),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 * AY-3-8912 — General Instrument PSG (Programmable Sound Generator),
 * the 128K Spectrum's sound chip. Clean-room from the GI AY-3-8910/
 * 8912/8913 datasheet.
 *
 * 16 registers selected via an address/data port pair:
 *   R0/R1   Tone period channel A (12-bit, R1 upper 4)
 *   R2/R3   Tone period channel B
 *   R4/R5   Tone period channel C
 *   R6      Noise period (5-bit)
 *   R7      Mixer: bits 0-2 tone disable A/B/C, bits 3-5 noise disable
 *   R8      Volume A (4-bit + bit 4 = envelope mode)
 *   R9      Volume B
 *   R10     Volume C
 *   R11/R12 Envelope period (16-bit)
 *   R13     Envelope shape (attack, alternate, hold)
 *   R14/R15 I/O ports (unused on the 8912 single-port variant)
 *
 * Port decode for the 128K Spectrum (from the schematic):
 *   A15=1, A14=1 → $FFFD: address select (active when A1=0)
 *   A15=1, A14=0 → $BFFD: data write
 * The machine.js `out` handler does the decode; the chip sees only
 * select(reg) and write(val)/read().
 *
 * advance(cycles) clocks tone counters at clock/16 (the AY's internal
 * divider); each counter halves its period into a square wave.
 *
 * audioTone() returns per-channel {hz, on, vol} mirroring ULA.audioTone —
 * the face summary a visualiser or audio renderer consumes.
 *
 * @module
 */

const NUM_REGS = 16;
class AY38912 {
  /**
   * @param {{ clockHz?: number }} [opts] AY clock input — on the 128K
   *   Spectrum this is the CPU clock (3.5469 MHz), not half.
   */
  constructor() {
    let {
      clockHz = 3546900
    } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    this.clockHz = clockHz;
    /** @type {Uint8Array} the 16 registers */
    this.regs = new Uint8Array(NUM_REGS);
    this.regs[7] = 0x3f; // mixer: all disabled at reset
    this._selected = 0;
    // Tone counters: 12-bit period down-counters, output flip-flops
    this._toneCount = [0, 0, 0];
    this._toneOut = [0, 0, 0];
    // Noise counter
    this._noiseCount = 0;
    this._noiseOut = 0;
    this._noiseLfsr = 1; // 17-bit LFSR, seed 1
    // Envelope counter
    this._envCount = 0;
    this._envStep = 0;
    this._envHolding = false;
    // Clock accumulator (system clock → AY internal clock/16)
    this._acc = 0;
  }

  /** Select the register for the next read/write. */
  select(reg) {
    this._selected = reg & 0x0f;
  }

  /** Read the currently selected register. */
  read() {
    return this.regs[this._selected];
  }

  /** Write to the currently selected register. */
  write(val) {
    val &= 0xff;
    const r = this._selected;
    if (r >= NUM_REGS) return;
    // Mask writable bits per register
    switch (r) {
      case 1:
      case 3:
      case 5:
        val &= 0x0f;
        break;
      // tone high: 4 bits
      case 6:
        val &= 0x1f;
        break;
      // noise: 5 bits
      case 8:
      case 9:
      case 10:
        val &= 0x1f;
        break;
      // volume: 5 bits (4+M)
      case 13:
        // envelope shape: trigger reset
        this._envStep = 0;
        this._envCount = this._envPeriod();
        this._envHolding = false;
        break;
    }
    this.regs[r] = val;
  }

  // ── Period helpers ─────────────────────────────────────────────

  _tonePeriod(ch) {
    return this.regs[ch * 2] | (this.regs[ch * 2 + 1] & 0x0f) << 8 || 1;
  }
  _noisePeriod() {
    return this.regs[6] & 0x1f || 1;
  }
  _envPeriod() {
    return this.regs[11] | this.regs[12] << 8 || 1;
  }

  // ── Clock advance ─────────────────────────────────────────────

  /**
   * Advance by system-clock cycles. The AY internally divides by 16.
   * @param {number} cycles
   */
  advance(cycles) {
    this._acc += cycles;
    const div = 16;
    while (this._acc >= div) {
      this._acc -= div;
      this._tick();
    }
  }

  /** One AY internal clock tick (clock/16). */
  _tick() {
    // Tone counters
    for (let ch = 0; ch < 3; ch++) {
      if (--this._toneCount[ch] <= 0) {
        this._toneCount[ch] = this._tonePeriod(ch);
        this._toneOut[ch] ^= 1;
      }
    }
    // Noise counter
    if (--this._noiseCount <= 0) {
      this._noiseCount = this._noisePeriod();
      // 17-bit LFSR: tap bits 0 and 3, XOR into bit 16
      const bit = (this._noiseLfsr ^ this._noiseLfsr >> 3) & 1;
      this._noiseLfsr = (this._noiseLfsr >> 1 | bit << 16) & 0x1ffff;
      this._noiseOut = this._noiseLfsr & 1;
    }
    // Envelope counter
    if (!this._envHolding) {
      if (--this._envCount <= 0) {
        this._envCount = this._envPeriod();
        this._envStep++;
        const shape = this.regs[13] & 0x0f;
        if (this._envStep >= 16) {
          // Cycle/hold logic from the datasheet shape table
          const cont = shape & 0x08;
          const hold = shape & 0x01;
          if (!cont) {
            this._envStep = 0;
            this._envHolding = true;
          } else if (hold) {
            this._envStep = 15;
            this._envHolding = true;
          } else {
            this._envStep = 0;
          } // cycling
        }
      }
    }
  }

  // ── Mixer output ──────────────────────────────────────────────

  /**
   * Is channel ch currently producing output?
   * Mixer combines tone enable, noise enable, and the flip-flop states.
   */
  _channelOn(ch) {
    const mixer = this.regs[7];
    const toneDisable = mixer >> ch & 1;
    const noiseDisable = mixer >> ch + 3 & 1;
    const toneVal = toneDisable ? 1 : this._toneOut[ch];
    const noiseVal = noiseDisable ? 1 : this._noiseOut;
    return (toneVal & noiseVal) !== 0;
  }

  /** Channel volume (0-15), accounting for envelope mode. */
  _channelVol(ch) {
    const v = this.regs[8 + ch];
    if (v & 0x10) {
      // Envelope mode: use the envelope step as volume
      const shape = this.regs[13] & 0x0f;
      const attack = shape & 0x04;
      return attack ? this._envStep : 15 - this._envStep;
    }
    return v & 0x0f;
  }

  // ── Face summary ──────────────────────────────────────────────

  /**
   * Per-channel {hz, on, vol} — the face-consumable audio summary,
   * mirroring zx-ula.js audioTone(). hz is the tone frequency, on is
   * true when the channel is audible (tone or noise enabled AND volume
   * non-zero), vol is 0-15.
   */
  audioTone() {
    const out = [];
    for (let ch = 0; ch < 3; ch++) {
      const period = this._tonePeriod(ch);
      // Frequency = clockHz / (16 * period * 2) — the /2 is the
      // flip-flop halving the counter output.
      const hz = Math.round(this.clockHz / (16 * period * 2));
      const vol = this._channelVol(ch);
      const mixer = this.regs[7];
      const toneEnabled = !(mixer >> ch & 1);
      const noiseEnabled = !(mixer >> ch + 3 & 1);
      const on = (toneEnabled || noiseEnabled) && vol > 0;
      out.push({
        hz,
        on,
        vol
      });
    }
    return out;
  }

  // ── Snapshot ───────────────────────────────────────────────────

  saveState() {
    return {
      regs: Array.from(this.regs),
      _selected: this._selected,
      _toneCount: [...this._toneCount],
      _toneOut: [...this._toneOut],
      _noiseCount: this._noiseCount,
      _noiseOut: this._noiseOut,
      _noiseLfsr: this._noiseLfsr,
      _envCount: this._envCount,
      _envStep: this._envStep,
      _envHolding: this._envHolding,
      _acc: this._acc
    };
  }
  loadState(s) {
    this.regs.set(s.regs);
    this._selected = s._selected;
    this._toneCount = [...s._toneCount];
    this._toneOut = [...s._toneOut];
    this._noiseCount = s._noiseCount;
    this._noiseOut = s._noiseOut;
    this._noiseLfsr = s._noiseLfsr;
    this._envCount = s._envCount;
    this._envStep = s._envStep;
    this._envHolding = s._envHolding;
    this._acc = s._acc;
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (AY38912);

/***/ }),

/***/ "./src/lib/bw-board/buffer244.js":
/*!***************************************!*\
  !*** ./src/lib/bw-board/buffer244.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Buffer244: () => (/* binding */ Buffer244),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 * 74HC244 octal buffer as a read-only input port — the input mirror of
 * Latch374. On the real breadboard, the /OE pins are strobed by IO-read
 * decode: the CPU does IN (n),A and the glue logic pulls /OE low, gating
 * the A-input pins onto the data bus through the buffer's Y outputs.
 *
 * From the machine's perspective this is one read-only port: read()
 * returns the current state of the 8 A-inputs, sampled from the board's
 * pins via a callback. write() is a no-op (the buffer has no latched
 * state — it's transparent when enabled).
 *
 * @module
 */

class Buffer244 {
  /** @param {{ onRead?: () => number }} [hooks]
   *  onRead: called on each port read, returns 8-bit sampled value */
  constructor() {
    let hooks = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    this.hooks = hooks;
  }

  /** Sample the buffer's inputs. The hook reads board pins. */
  read() {
    return this.hooks.onRead ? this.hooks.onRead() & 0xff : 0xff;
  }

  /** Write is a no-op — the 244 is a buffer, not a latch. */
  write() {}
  get irqAsserted() {
    return false;
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Buffer244);

/***/ }),

/***/ "./src/lib/bw-board/mc6845.js":
/*!************************************!*\
  !*** ./src/lib/bw-board/mc6845.js ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MC6845: () => (/* binding */ MC6845)
/* harmony export */ });
/**
 * MC6845 CRTC — Motorola/Rockwell CRT controller, the Z80 tier's
 * video chip.
 *
 * Clean-room from the Motorola MC6845 datasheet (ADI-851-R1) and the
 * Rockwell R6545 application note: 18 registers (R0-R17) addressed via
 * an address/data port pair, character-based framebuffer with
 * programmable sync geometry.
 *
 * Register map (§3.2):
 *   R0  Horizontal Total (chars per line − 1)
 *   R1  Horizontal Displayed (visible chars per line)
 *   R2  Horizontal Sync Position (char at which HSYNC starts)
 *   R3  Sync Widths (lower 4 = HSYNC width, upper 4 = VSYNC width)
 *   R4  Vertical Total (char rows per frame − 1)
 *   R5  Vertical Total Adjust (extra scan lines)
 *   R6  Vertical Displayed (visible char rows)
 *   R7  Vertical Sync Position (row at which VSYNC starts)
 *   R8  Interlace & Skew (mode bits; not modeled, stored)
 *   R9  Max Scan Line Address (scan lines per char row − 1)
 *   R10 Cursor Start (scan line + blink mode in bits 5-6)
 *   R11 Cursor End (scan line)
 *   R12 Start Address (H) — bits 13:8 of the framebuffer base
 *   R13 Start Address (L) — bits 7:0 of the framebuffer base
 *   R14 Cursor (H) — bits 13:8 of cursor position
 *   R15 Cursor (L) — bits 7:0 of cursor position
 *   R16 Light Pen (H) — read-only (returns 0)
 *   R17 Light Pen (L) — read-only (returns 0)
 *
 * Interface contract matches the machine's other chips:
 *   regs = 2 (reg 0 = address port, reg 1 = data port)
 *   read(reg)/write(reg, val), advance(cycles), videoFrame()
 *
 * Text-mode rendering: each character cell is looked up in a charset
 * (opts.charset, 256 × charH bytes, 1 bit per pixel MSB-left, like a
 * standard 8×N ROM font). The VRAM holds character codes; the charset
 * holds the glyph bitmaps.
 *
 * Deliberate v1 bounds, stated:
 * - Text mode only (the standard CP/M + Grant Searle usage).
 * - No interlace, no light pen, no cursor blink timing (cursor is
 *   always visible when enabled).
 * - Frame-grained: videoFrame() renders from the current register
 *   state, not mid-scanline.
 */

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 25;
const DEFAULT_CHAR_H = 8;

/** Default charset: 8×8 CP437 subset — printable ASCII 0x20-0x7E
 *  filled with a minimal recognizable glyph set. Full charsets are
 *  supplied via opts.charset; this is the "something shows up" fallback. */
function defaultCharset(charH) {
  const font = new Uint8Array(256 * charH);
  // Fill printable ASCII with a simple block pattern so text is visible
  // even without a real font ROM.  Character 0xDB = full block.
  for (let ch = 0x20; ch < 0x7f; ch++) {
    const base = ch * charH;
    // A crude recognizable glyph: top and bottom lines of a box,
    // with the left column set for all rows.  Not pretty, but
    // distinct per character (the column pattern varies with ch).
    font[base] = 0xff; // top line
    font[base + charH - 1] = 0xff; // bottom line
    for (let r = 1; r < charH - 1; r++) {
      font[base + r] = 0x80 | ch >> r % 7 & 0x7e;
    }
  }
  // Space = blank
  for (let r = 0; r < charH; r++) font[0x20 * charH + r] = 0;
  return font;
}

/** CGA-style default palette: white on black. */
const DEFAULT_FG = [0xaa, 0xaa, 0xaa, 255];
const DEFAULT_BG = [0, 0, 0, 255];
class MC6845 {
  /**
   * @param {{
   *   clockHz?: number,
   *   fps?: number,
   *   charset?: Uint8Array,
   *   charW?: number,
   *   fg?: number[],
   *   bg?: number[],
   *   vramSize?: number,
   * }} [opts]
   */
  constructor() {
    var _opts$charH, _opts$vramSize, _opts$charset, _opts$charW, _opts$fg, _opts$bg, _opts$clockHz, _opts$fps;
    let opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    /** @type {Uint8Array} 18 CRTC registers */
    this.regs = new Uint8Array(18);
    this._addrReg = 0; // selected register (written via port 0)

    // Sensible defaults: 80×25 text mode with 8-pixel-tall chars
    this.regs[0] = 99; // R0: horizontal total − 1 (100 chars)
    this.regs[1] = DEFAULT_COLS; // R1: horizontal displayed
    this.regs[2] = 82; // R2: hsync position
    this.regs[3] = 0x28; // R3: sync widths (H=8, V=2)
    this.regs[4] = 30; // R4: vertical total − 1 (31 rows)
    this.regs[5] = 2; // R5: vertical adjust (2 extra lines)
    this.regs[6] = DEFAULT_ROWS; // R6: vertical displayed
    this.regs[7] = 27; // R7: vsync position
    this.regs[8] = 0; // R8: interlace mode
    const initCharH = (_opts$charH = opts.charH) !== null && _opts$charH !== void 0 ? _opts$charH : DEFAULT_CHAR_H;
    this.regs[9] = initCharH - 1; // R9: max scan line
    this.regs[10] = 0; // R10: cursor start (line 0, no blink)
    this.regs[11] = initCharH - 1; // R11: cursor end
    // R12-R17: start address and cursor default to 0

    /** @type {Uint8Array} Video RAM — character codes */
    this.vram = new Uint8Array((_opts$vramSize = opts.vramSize) !== null && _opts$vramSize !== void 0 ? _opts$vramSize : 0x4000);

    /** @type {Uint8Array} Character ROM/font bitmap */
    const charH = (this.regs[9] & 0x1f) + 1;
    this.charset = (_opts$charset = opts.charset) !== null && _opts$charset !== void 0 ? _opts$charset : defaultCharset(charH);
    this.charW = (_opts$charW = opts.charW) !== null && _opts$charW !== void 0 ? _opts$charW : 8;

    /** @type {number[]} Foreground RGBA */
    this.fg = (_opts$fg = opts.fg) !== null && _opts$fg !== void 0 ? _opts$fg : [...DEFAULT_FG];
    /** @type {number[]} Background RGBA */
    this.bg = (_opts$bg = opts.bg) !== null && _opts$bg !== void 0 ? _opts$bg : [...DEFAULT_BG];

    /** Frame counter (for polling change detection) */
    this.frame = 0;
    this.writes = 0;

    // Timing
    this._cyclesPerFrame = Math.round(((_opts$clockHz = opts.clockHz) !== null && _opts$clockHz !== void 0 ? _opts$clockHz : 2000000) / ((_opts$fps = opts.fps) !== null && _opts$fps !== void 0 ? _opts$fps : 50));
    this._toFrame = this._cyclesPerFrame;
  }

  // ── CPU interface ──────────────────────────────────────────────

  /** Number of addressable I/O registers. */
  get portCount() {
    return 2;
  }

  /**
   * @param {number} reg 0 = address register, 1 = data register
   */
  read(reg) {
    if ((reg & 1) === 0) return this._addrReg;
    const r = this._addrReg & 0x1f;
    if (r >= 18) return 0;
    // R16/R17 (light pen) are read-only and always 0
    return this.regs[r];
  }

  /**
   * @param {number} reg 0 = address register, 1 = data register
   * @param {number} val
   */
  write(reg, val) {
    val &= 0xff;
    if ((reg & 1) === 0) {
      this._addrReg = val & 0x1f;
      return;
    }
    const r = this._addrReg & 0x1f;
    if (r >= 18) return;
    // R16/R17 (light pen) are read-only
    if (r === 16 || r === 17) return;
    this.regs[r] = val;
  }

  /**
   * Advance by CPU cycles; tick the frame counter.
   * @param {number} cycles
   */
  advance(cycles) {
    this._toFrame -= cycles;
    while (this._toFrame <= 0) {
      this._toFrame += this._cyclesPerFrame;
      this.frame++;
    }
  }

  // ── Derived geometry ───────────────────────────────────────────

  /** Visible columns (R1). */
  get cols() {
    return this.regs[1] || DEFAULT_COLS;
  }

  /** Visible rows (R6). */
  get rows() {
    return this.regs[6] || DEFAULT_ROWS;
  }

  /** Scan lines per character row (R9 + 1). */
  get charH() {
    return (this.regs[9] & 0x1f) + 1;
  }

  /** Start address (R12:R13). */
  get startAddr() {
    return (this.regs[12] & 0x3f) << 8 | this.regs[13];
  }

  /** Cursor position (R14:R15). */
  get cursorAddr() {
    return (this.regs[14] & 0x3f) << 8 | this.regs[15];
  }

  /** Cursor start scan line (R10 bits 4:0). */
  get cursorStart() {
    return this.regs[10] & 0x1f;
  }

  /** Cursor end scan line (R11 bits 4:0). */
  get cursorEnd() {
    return this.regs[11] & 0x1f;
  }

  /** Cursor enabled (R10 bits 6:5 !== 01 = cursor off). */
  get cursorEnabled() {
    return (this.regs[10] >> 5 & 0x03) !== 1;
  }

  // ── Rendering ─────────────────────────────────────────────────

  /**
   * Render the text framebuffer to RGBA.
   * @returns {Uint8ClampedArray}
   */
  rgba() {
    const cols = this.cols;
    const rows = this.rows;
    const charH = this.charH;
    const charW = this.charW;
    const w = cols * charW;
    const h = rows * charH;
    const out = new Uint8ClampedArray(w * h * 4);
    const start = this.startAddr;
    const curPos = this.cursorAddr;
    const curOn = this.cursorEnabled;
    const curS = this.cursorStart;
    const curE = this.cursorEnd;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const addr = start + row * cols + col & this.vram.length - 1;
        const ch = this.vram[addr];
        const isCursor = curOn && addr === curPos;
        for (let scanLine = 0; scanLine < charH; scanLine++) {
          var _this$charset;
          // Glyph bitmap: charset[ch * charH + scanLine]
          const glyphByte = (_this$charset = this.charset[ch * charH + scanLine]) !== null && _this$charset !== void 0 ? _this$charset : 0;
          const cursorLine = isCursor && scanLine >= curS && scanLine <= curE;
          const py = row * charH + scanLine;
          for (let px = 0; px < charW; px++) {
            const bit = glyphByte >> charW - 1 - px & 1;
            const on = cursorLine ? !bit : !!bit; // cursor inverts
            const color = on ? this.fg : this.bg;
            const oi = (py * w + col * charW + px) * 4;
            out[oi] = color[0];
            out[oi + 1] = color[1];
            out[oi + 2] = color[2];
            out[oi + 3] = color[3];
          }
        }
      }
    }
    return out;
  }

  /**
   * The common video-face contract (TMS9918/SimpleVGA/ILI9341):
   * {width, height, rgba, frame, signal}.
   */
  videoFrame() {
    const cols = this.cols;
    const rows = this.rows;
    const charH = this.charH;
    return {
      width: cols * this.charW,
      height: rows * charH,
      rgba: this.rgba(),
      frame: this.frame,
      mode: 'text',
      signal: true
    };
  }

  /**
   * Snapshot CRTC state for machine save. The vram is a live subarray
   * view of system memory — the machine's mem.slice() already carries
   * it, so we snapshot only registers and frame-related state.
   */
  saveState() {
    return {
      regs: Array.from(this.regs),
      _addrReg: this._addrReg,
      frame: this.frame,
      writes: this.writes,
      _toFrame: this._toFrame
    };
  }

  /** Restore from a saveState() snapshot. */
  loadState(s) {
    this.regs.set(s.regs);
    this._addrReg = s._addrReg;
    this.frame = s.frame;
    this.writes = s.writes;
    this._toFrame = s._toFrame;
  }
}

/***/ }),

/***/ "./src/lib/bw-board/mc6850.js":
/*!************************************!*\
  !*** ./src/lib/bw-board/mc6850.js ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MC6850: () => (/* binding */ MC6850),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 * MC6850 ACIA — the Z80 breadboard scene's serial chip (Grant Searle's
 * minimal design, RC2014 and their descendants all speak it). Our own
 * model, from the Motorola datasheet: two registers selected by RS —
 * control (write) / status (read) at RS=0, TX / RX data at RS=1.
 *
 * Status: bit0 RDRF, bit1 TDRE (always set here — the emulated wire is
 * infinitely fast; the pacing caveats of the 6551 world do not apply to
 * the 6850's polling idiom), bit7 IRQ. Control: bits 5-6 TX interrupt
 * modes (unused here), bit7 RX interrupt enable; the divide/format bits
 * are stored but do not change behavior at instruction resolution.
 * Master reset (control = 0x03) clears the receiver.
 *
 * @module
 */

class MC6850 {
  /** @param {{ onTx?: (byte:number)=>void, onIrqChange?: (a:boolean)=>void }} [hooks] */
  constructor() {
    let hooks = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    this.hooks = hooks;
    this.reset();
  }
  reset() {
    this.rx = [];
    this.rdrf = false;
    this.overrun = false;
    this.control = 0;
    this._rxByte = 0;
    this._irq = false;
  }
  _syncIrq() {
    const asserted = !!(this.control & 0x80) && this.rdrf;
    if (asserted !== this._irq) {
      this._irq = asserted;
      if (this.hooks.onIrqChange) this.hooks.onIrqChange(asserted);
    }
  }

  /** Machine-side: a byte arrives on RX. */
  rxPush(byte) {
    if (this.rdrf) {
      this.overrun = true;
      this.rx.push(byte & 0xff);
    } else {
      this._rxByte = byte & 0xff;
      this.rdrf = true;
    }
    this._syncIrq();
  }

  /** @param {0|1} rs */
  read(rs) {
    if (rs === 0) {
      return (this.rdrf ? 0x01 : 0) | 0x02 /* TDRE */ | (this.overrun ? 0x20 : 0) | (this._irq ? 0x80 : 0);
    }
    const b = this._rxByte;
    this.rdrf = this.rx.length > 0;
    if (this.rdrf) this._rxByte = this.rx.shift();
    this.overrun = false;
    this._syncIrq();
    return b;
  }

  /** @param {0|1} rs @param {number} v */
  write(rs, v) {
    if (rs === 0) {
      this.control = v & 0xff;
      if ((v & 0x03) === 0x03) this.reset(); // master reset
      this._syncIrq();
      return;
    }
    if (this.hooks.onTx) this.hooks.onTx(v & 0xff);
  }
  get irqAsserted() {
    return this._irq;
  }
  saveState() {
    return {
      rx: this.rx.slice(),
      rdrf: this.rdrf,
      overrun: this.overrun,
      control: this.control,
      _rxByte: this._rxByte,
      _irq: this._irq
    };
  }
  loadState(s) {
    var _s$_irq;
    this.rx = s.rx.slice();
    this.rdrf = s.rdrf;
    this.overrun = s.overrun;
    this.control = s.control;
    this._rxByte = s._rxByte;
    this._irq = (_s$_irq = s._irq) !== null && _s$_irq !== void 0 ? _s$_irq : false;
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (MC6850);

/***/ }),

/***/ "./src/lib/bw-board/z80-ctc.js":
/*!*************************************!*\
  !*** ./src/lib/bw-board/z80-ctc.js ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Z80CTC: () => (/* binding */ Z80CTC),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/**
 * Z8430 CTC — the Z80 family's counter/timer, four channels.
 *
 * Clean-room from the Zilog Z8430/Z84C30 CTC datasheet (the control
 * word, §"CTC Operating Modes" and the programming section):
 *
 * - Each channel has one 8-bit control register, an 8-bit time
 *   constant (TC), and an 8-bit down-counter readable at any time.
 * - Control word (bit 0 = 1 distinguishes it from a vector write):
 *     bit7 interrupt enable      bit3 timer trigger (wait for CLK/TRG)
 *     bit6 mode: 1=counter,0=timer  bit2 TC follows this word
 *     bit5 prescaler: 1=256,0=16 bit1 software reset
 *     bit4 CLK/TRG edge          bit0 = 1 (control)
 * - A write with bit 0 = 0 to CHANNEL 0 sets the interrupt vector
 *   base; on acknowledge the CTC supplies base | (channel << 1)
 *   (IM2 daisy chain; channel 0 has highest priority).
 * - Timer mode: the down-counter is clocked by the SYSTEM clock
 *   through the prescaler; reaching zero reloads TC and pulses
 *   ZC/TO + raises the interrupt (if enabled). TC = 0 means 256.
 * - Counter mode counts external CLK/TRG edges. No external sources
 *   are modelled yet, so a counter-mode channel simply does not
 *   advance — a NAMED limitation (state.notes), not silent wrongness.
 *
 * The scheduler timebase pattern this enables (the Z80 flavor's
 * bw_now, mirroring the 6502's VIA-T1 polling): program a timer
 * channel with prescaler 256; poll the down-counter; a read LARGER
 * than the previous read means the counter reloaded — count reloads,
 * each worth TC*prescale/clockHz seconds. ISR-free.
 */

class Z80CTC {
  /** @param {{ clockHz?: number }} [opts] system clock feeding the prescaler */
  constructor() {
    let {
      clockHz = 4000000
    } = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    this.clockHz = clockHz;
    this.vector = 0;
    this.notes = [];
    this.ch = Array.from({
      length: 4
    }, () => ({
      control: 0,
      tc: 0,
      // programmed time constant (0 = 256)
      count: 0,
      // live down-counter
      running: false,
      expectTc: false,
      // next write is the time constant
      irq: false,
      // zero-count reached with IE set
      _acc: 0 // sub-prescale cycle accumulator
    }));
  }

  /** @param {number} n channel 0-3 @param {number} val byte */
  write(n, val) {
    const c = this.ch[n & 3];
    val &= 0xff;
    if (c.expectTc) {
      c.expectTc = false;
      c.tc = val;
      // Timer mode without the trigger bit starts on TC load.
      if ((c.control & 0x40) === 0 && (c.control & 0x08) === 0) {
        // TC 0 means 256: starting at 0, the &0xff decrement
        // walk makes the full-length period emerge naturally.
        c.count = val;
        c._acc = 0;
        c.running = true;
      } else if (c.control & 0x40) {
        if (!this.notes.includes('counter-mode')) {
          this.notes.push('counter-mode'); // named: no external CLK/TRG modelled
        }
      }
      return;
    }
    if ((val & 0x01) === 0) {
      // Vector write — channel 0 only per the datasheet; other
      // channels ignore it (their bit 0 = 0 writes are no-ops).
      if ((n & 3) === 0) this.vector = val & 0xf8;
      return;
    }
    c.control = val;
    if (val & 0x02) {
      // software reset: stop, clear pending state
      c.running = false;
      c.irq = false;
    }
    if (val & 0x04) c.expectTc = true;
  }

  /** Reading a channel returns the live down-count (datasheet). */
  read(n) {
    const c = this.ch[n & 3];
    return c.count & 0xff;
  }

  /** IM2 vector for the highest-priority interrupting channel. */
  ackVector() {
    for (let n = 0; n < 4; n++) {
      if (this.ch[n].irq) {
        this.ch[n].irq = false;
        return this.vector | n << 1;
      }
    }
    return this.vector;
  }
  get irqAsserted() {
    return this.ch.some(c => c.irq && c.control & 0x80);
  }

  /** @param {number} cycles system-clock cycles elapsed */
  advance(cycles) {
    for (const c of this.ch) {
      if (!c.running || c.control & 0x40) continue; // stopped or counter mode
      const prescale = c.control & 0x20 ? 256 : 16;
      c._acc += cycles;
      while (c._acc >= prescale) {
        c._acc -= prescale;
        c.count = c.count - 1 & 0xff;
        if (c.count === 0) {
          c.count = c.tc; // reload (0 rolls as 256 via the & 0xff walk)
          if (c.control & 0x80) c.irq = true;
        }
      }
    }
  }
  saveState() {
    return {
      vector: this.vector,
      ch: this.ch.map(c => ({
        control: c.control,
        tc: c.tc,
        count: c.count,
        running: c.running,
        expectTc: c.expectTc,
        irq: c.irq,
        _acc: c._acc
      }))
    };
  }
  loadState(s) {
    this.vector = s.vector;
    for (let i = 0; i < 4; i++) {
      const c = this.ch[i];
      const sc = s.ch[i];
      c.control = sc.control;
      c.tc = sc.tc;
      c.count = sc.count;
      c.running = sc.running;
      c.expectTc = sc.expectTc;
      c.irq = sc.irq;
      c._acc = sc._acc;
    }
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Z80CTC);

/***/ }),

/***/ "./src/lib/bw-board/z80-machine.js":
/*!*****************************************!*\
  !*** ./src/lib/bw-board/z80-machine.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CPM64K: () => (/* binding */ CPM64K),
/* harmony export */   SEARLE: () => (/* binding */ SEARLE),
/* harmony export */   Z80Machine: () => (/* binding */ Z80Machine),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _z80_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./z80.js */ "./src/lib/bw-board/z80.js");
/* harmony import */ var _mc6850_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./mc6850.js */ "./src/lib/bw-board/mc6850.js");
/* harmony import */ var _z80_ctc_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./z80-ctc.js */ "./src/lib/bw-board/z80-ctc.js");
/* harmony import */ var _mc6845_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./mc6845.js */ "./src/lib/bw-board/mc6845.js");
/* harmony import */ var _zx_ula_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./zx-ula.js */ "./src/lib/bw-board/zx-ula.js");
/* harmony import */ var _zx_tape_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./zx-tape.js */ "./src/lib/bw-board/zx-tape.js");
/* harmony import */ var _ay_3_8912_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./ay-3-8912.js */ "./src/lib/bw-board/ay-3-8912.js");
/* harmony import */ var _latch374_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./latch374.js */ "./src/lib/bw-board/latch374.js");
/* harmony import */ var _buffer244_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./buffer244.js */ "./src/lib/bw-board/buffer244.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * The composable Z80 machine — the 6502 machine's pattern with the Z80's
 * twist: chips live in PORT space (IORQ), memory regions in MEMORY space
 * (MREQ), because that is how the real breadboard decodes. A config is
 * { clockHz, regions, ports }; the SEARLE preset is the canonical
 * minimal build the whole scene descends from (Grant Searle's 7-chip
 * design, RC2014's ancestor): ROM low, RAM high, an MC6850 ACIA at
 * ports $80/$81. The design facts are architecture (freely modeled);
 * his ROM software is NOT ours to ship — the machine boots whatever
 * image the caller provides.
 *
 * Interrupts: IM 1 (the scene's idiom) — any chip asserting IRQ makes
 * the CPU take RST $38 when IFF1 is set; IM 0/2 and NMI can come later
 * with a config knob. The core itself stays interrupt-agnostic; delivery
 * lives here.
 *
 * @module
 */









const SEARLE = Object.freeze({
  clockHz: 7372800,
  regions: [{
    kind: 'rom',
    start: 0x0000,
    end: 0x1fff
  }, {
    kind: 'ram',
    start: 0x2000,
    end: 0xffff
  }],
  ports: [{
    kind: 'acia6850',
    name: 'acia1',
    at: 0x80
  } // $80 ctrl/status, $81 data
  ]
});

/** CP/M 64K preset — all RAM (CP/M needs to write page zero at $0000),
 *  MC6850 ACIA at $80/$81 for console, same clock as the SEARLE board.
 *  Disk I/O uses ports $10–$15 handled by the host (not modeled here). */
const CPM64K = Object.freeze({
  clockHz: 7372800,
  regions: [{
    kind: 'ram',
    start: 0x0000,
    end: 0xffff
  }],
  ports: [{
    kind: 'acia6850',
    name: 'acia1',
    at: 0x80
  }]
});
class Z80Machine {
  /** @param {typeof SEARLE} [config]
   *  @param {{ onSerial?: (byte:number, tMs:number)=>void,
   *            onPinChange?: (pin:string, level:0|1, tMs:number)=>void }} [hooks] */
  constructor() {
    var _this = this,
      _config$kempston;
    let config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : SEARLE;
    let hooks = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    this.config = config;
    this.hooks = hooks;
    this.clockHz = config.clockHz;
    this.mem = new Uint8Array(65536);
    this.cycles = 0;
    /** @type {Record<string, MC6850>} */
    this.chips = {};
    this._portMap = new Map();
    // Direction-aware port slots: a read-strobed chip (74HC244 IN) and
    // a write-strobed chip (74HC374 OUT) legally share one port — IN
    // and OUT decode to different silicon on real boards, and the
    // extractor's contention rules allow exactly that pair. A single
    // last-wins slot sent OUT (0),A into the buffer's no-op write and
    // the LEDs never lit. Level-selected chips claim both sides.
    const mapPort = function mapPort(port, entry) {
      let sides = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'rw';
      const key = port & 0xff;
      const slot = _this._portMap.get(key) || {};
      if (sides.includes('r')) slot.r = entry;
      if (sides.includes('w')) slot.w = entry;
      _this._portMap.set(key, slot);
    };
    for (const p of config.ports || []) {
      if (p.kind === 'acia6850') {
        const chip = new _mc6850_js__WEBPACK_IMPORTED_MODULE_1__.MC6850({
          onTx: b => {
            if (this.hooks.onSerial) this.hooks.onSerial(b, this.tMs);
          }
        });
        this.chips[p.name] = chip;
        mapPort(p.at, {
          chip,
          rs: 0
        });
        mapPort(p.at + 1, {
          chip,
          rs: 1
        });
      } else if (p.kind === 'crtc') {
        var _p$vramAt, _p$vramSize;
        // MC6845: address/data port pair. On the real board the
        // CRTC only GENERATES addresses — the framebuffer is
        // shared system RAM — so the chip's vram becomes a live
        // subarray view of machine memory at p.vramAt: CPU
        // stores appear on screen with no copying, exactly like
        // the silicon. vramSize must be a power of two (the
        // chip masks addresses with length-1).
        const vramAt = (_p$vramAt = p.vramAt) !== null && _p$vramAt !== void 0 ? _p$vramAt : 0xf000;
        const vramSize = (_p$vramSize = p.vramSize) !== null && _p$vramSize !== void 0 ? _p$vramSize : 0x0800;
        const charset = p.charset instanceof Uint8Array ? p.charset : undefined;
        const chip = new _mc6845_js__WEBPACK_IMPORTED_MODULE_3__.MC6845({
          clockHz: config.clockHz,
          vramSize,
          charH: p.charH,
          charset
        });
        chip.vram = this.mem.subarray(vramAt, vramAt + vramSize);
        this.chips[p.name] = chip;
        mapPort(p.at, {
          chip,
          rs: 0
        });
        mapPort(p.at + 1, {
          chip,
          rs: 1
        });
      } else if (p.kind === 'latch') {
        // 74HC374 as a write-only OUT port — the first program of
        // every Searle-lineage build: OUT (n),A lights eight LEDs.
        // Same chip class and the same Q-pin emission contract as
        // the 6502 machine's latch, so an attached board's
        // chip-qualified pins light whatever the bench wires to Q.
        const chip = new _latch374_js__WEBPACK_IMPORTED_MODULE_7__.Latch374({
          onChange: (value, prev) => this._latchChange(p.name, value, prev)
        });
        this.chips[p.name] = chip;
        mapPort(p.at, {
          chip,
          rs: 0
        }, 'w');
      } else if (p.kind === 'buffer') {
        // 74HC244 as a read-only IN port — the input mirror of
        // the '374 latch. read() samples the board's pins via
        // the onRead hook; the adapter wires the hook to
        // board.readPin for each A-input.
        const chip = new _buffer244_js__WEBPACK_IMPORTED_MODULE_8__.Buffer244({
          onRead: () => {
            if (!this.hooks.onBufferRead) return 0xff;
            return this.hooks.onBufferRead(p.name);
          }
        });
        this.chips[p.name] = chip;
        mapPort(p.at, {
          chip,
          rs: 0
        }, 'r');
      } else if (p.kind === 'ctc') {
        // Z8430: four consecutive ports, one per channel. The
        // scheduler timebase the Z80 emitter axis waits on.
        const chip = new _z80_ctc_js__WEBPACK_IMPORTED_MODULE_2__.Z80CTC({
          clockHz: config.clockHz
        });
        this.chips[p.name] = chip;
        for (let ch = 0; ch < 4; ch++) {
          mapPort(p.at + ch, {
            chip,
            rs: ch
          });
        }
      } else {
        throw new Error("unknown port chip kind: ".concat(p.kind));
      }
    }
    // A Spectrum-shaped machine: config.ula = true attaches the ULA,
    // which decodes ONLY A0 (every even port) and shares the
    // machine's memory for the live screen.
    //
    // config.zx128 = true builds the 128K memory model on top:
    // 8×16K RAM pages, two 16K ROMs, port $7FFD banking. The flat
    // 64K keeps holding the two FIXED windows — page 5 at $4000 and
    // page 2 at $8000 are subarray VIEWS into it, so the 48K screen
    // path, tape trap and debug reads stay truthful there — while
    // $C000 pages and the ROM window go through the bus closures.
    this._zx128 = !!config.zx128;
    if (this._zx128) {
      this.pages = Array.from({
        length: 8
      }, (_, i) => i === 5 ? this.mem.subarray(0x4000, 0x8000) : i === 2 ? this.mem.subarray(0x8000, 0xc000) : new Uint8Array(16384));
      this.roms = [new Uint8Array(16384), new Uint8Array(16384)];
      this._bank = {
        page: 0,
        rom: 0,
        shadow: 0,
        locked: 0
      };
    }
    this.ula = config.ula || this._zx128 ? new _zx_ula_js__WEBPACK_IMPORTED_MODULE_4__.ZXULA(this.mem, this._zx128 ? {
      frameTstates: 70908
    } : {}) : null;
    if (this.ula) this.chips.ula = this.ula;
    // Kempston joystick (config.kempston, default ON with the ULA):
    // the interface most archive games probe. Decoded the classic
    // way — A5 low on an ODD port (the ULA owns even ports) — and
    // read as 000FUDLR active-HIGH, idle $00.
    this._kempston = ((_config$kempston = config.kempston) !== null && _config$kempston !== void 0 ? _config$kempston : !!config.ula) ? 0 : null;
    // AY-3-8912 PSG: always present on 128K machines. Port decode
    // per the 128K schematic: $FFFD (A15=1,A14=1,A1=0) = select/read,
    // $BFFD (A15=1,A14=0,A1=0) = data write.
    this.ay = this._zx128 ? new _ay_3_8912_js__WEBPACK_IMPORTED_MODULE_6__.AY38912({
      clockHz: config.clockHz
    }) : null;
    if (this.ay) this.chips.ay = this.ay;
    this.tape = null; // insertTape() attaches; the $0556 trap consumes
    // Generic PC traps — the $0556 tape trap's mechanism, opened up:
    // addr → handler(machine) returning the cycles consumed (>0 =
    // handled, instruction skipped; falsy = fall through and execute
    // normally). The CP/M BDOS console shim is the first tenant.
    this.pcTraps = new Map();
    this._romRanges = (config.regions || []).filter(r => r.kind === 'rom');
    const read48 = a => this.mem[a & 0xffff];
    const write48 = (a, v) => {
      a &= 0xffff;
      for (const r of this._romRanges) if (a >= r.start && a <= r.end) return;
      this.mem[a] = v & 0xff;
    };
    const read128 = a => {
      a &= 0xffff;
      if (a < 0x4000) return this.roms[this._bank.rom][a];
      if (a < 0xc000) return this.mem[a];
      return this.pages[this._bank.page][a - 0xc000];
    };
    const write128 = (a, v) => {
      a &= 0xffff;
      if (a < 0x4000) return; // ROM
      if (a < 0xc000) {
        this.mem[a] = v & 0xff;
        return;
      }
      this.pages[this._bank.page][a - 0xc000] = v & 0xff;
    };
    this.readBus = this._zx128 ? read128 : read48;
    this.writeBus = this._zx128 ? write128 : write48;

    // Contention: opt-in via config.contention. Wraps bus callbacks
    // to add ULA wait-state penalties on contended-range accesses.
    // Per-instruction approximation (see spec-updates/ula-contention.md).
    this._contention = !!(config.contention && this.ula);
    const isContended = this._zx128 ? a => {
      // 128K: pages 1,3,5,7 are contended
      a &= 0xffff;
      if (a >= 0x4000 && a < 0x8000) return true; // page 5 (always mapped)
      if (a >= 0xc000) return (this._bank.page & 1) === 1;
      return false;
    } : a => (a & 0xffff) >= 0x4000 && (a & 0xffff) < 0x8000;
    const applyContention = a => {
      if (!this._contention || !isContended(a)) return;
      const penalty = this.ula.contend(this.cycles % this.ula._frameTstates);
      if (penalty > 0) this.cycles += penalty;
    };
    const readContended = a => {
      applyContention(a);
      return this.readBus(a);
    };
    const writeContended = (a, v) => {
      applyContention(a);
      return this.writeBus(a, v);
    };
    const readFn = this._contention ? readContended : this.readBus;
    const writeFn = this._contention ? writeContended : this.writeBus;
    this.cpu = new _z80_js__WEBPACK_IMPORTED_MODULE_0__.Z80({
      read: readFn,
      write: writeFn,
      in: port => {
        // Port contention: even ports (ULA-decoded) are contended
        if (this._contention && (port & 1) === 0) applyContention(0x4000);
        if (this.ula && (port & 1) === 0) return this.ula.in(port);
        if (this._kempston !== null && (port & 0x21) === 0x01) return this._kempston;
        // AY read: $FFFD (A15=1, A14=1, A1=0)
        if (this.ay && (port & 0xc002) === 0xc000) return this.ay.read();
        const slot = this._portMap.get(port & 0xff);
        const e = slot && (slot.r || slot.w);
        return e ? e.chip.read(e.rs) : 0xff;
      },
      out: (port, v) => {
        if (this._contention && (port & 1) === 0) applyContention(0x4000);
        if (this.ula && (port & 1) === 0) {
          this.ula.out(port, v, this.cycles);
          return;
        }
        // 128K banking: $7FFD partial decode (A15 and A1 low),
        // write-only, dead once the lock bit has been set.
        if (this._zx128 && (port & 0x8002) === 0) {
          this._setBank(v);
          return;
        }
        // AY select: $FFFD (A15=1, A14=1, A1=0)
        if (this.ay && (port & 0xc002) === 0xc000) {
          this.ay.select(v);
          return;
        }
        // AY data: $BFFD (A15=1, A14=0, A1=0)
        if (this.ay && (port & 0xc002) === 0x8000) {
          this.ay.write(v);
          return;
        }
        const slot = this._portMap.get(port & 0xff);
        const e = slot && (slot.w || slot.r);
        if (e) e.chip.write(e.rs, v);
      }
    });
  }
  get tMs() {
    return this.cycles * 1000 / this.clockHz;
  }

  /** Latch outputs as pin edges — Q, not P: a '374 output is always
   *  driven, no DDR exists. Identical contract to the 6502 machine. */
  _latchChange(chipName, value, prev) {
    if (!this.hooks.onPinChange) return;
    for (let bit = 0; bit < 8; bit++) {
      const mask = 1 << bit;
      if ((value & mask) === (prev & mask)) continue;
      this.hooks.onPinChange("".concat(chipName, ".Q").concat(bit), value & mask ? 1 : 0, this.tMs);
    }
  }

  /** Load an image into memory (ROM regions included — loading is not a bus write). */
  load(bytes) {
    let at = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    this.mem.set(bytes.subarray ? bytes.subarray(0, 65536 - at) : bytes, at);
  }

  /** Insert a .TAP; the $0556 trap serves blocks in order. */
  insertTape(tapBuf) {
    this.tape = new _zx_tape_js__WEBPACK_IMPORTED_MODULE_5__.ZXTape(tapBuf);
  }

  /** OUT $7FFD: bits 0-2 page at $C000, bit 3 shadow screen (page 7),
   *  bit 4 ROM select, bit 5 lock-until-reset. */
  _setBank(v) {
    if (this._bank.locked) return;
    this._bank.page = v & 0x07;
    this._bank.rom = v >> 4 & 1;
    const shadow = v >> 3 & 1;
    if (shadow !== this._bank.shadow) {
      this._bank.shadow = shadow;
      this.ula.screen = shadow ? this.pages[7] : this.mem.subarray(0x4000, 0x8000);
    }
    this._bank.locked = v >> 5 & 1;
  }

  /** Load a 16K ROM image into slot 0 (128 editor) or 1 (48 BASIC). */
  loadRom128(slot, bytes) {
    if (!this._zx128) throw new Error('loadRom128 needs a zx128 machine');
    this.roms[slot & 1].set(bytes.subarray(0, 16384));
  }

  /**
   * Face-input contract, joystick side: the same button mask the
   * 6502 machines take (bit0 down, bit1 up, bit2 right, bit3 left,
   * bit4 fire) mapped onto Kempston bit order (000FUDLR). False
   * when the machine has no Kempston interface.
   */
  setButtons(mask) {
    if (this._kempston === null) return false;
    this._kempston = mask >> 2 & 1 // right
    | (mask >> 3 & 1) << 1 // left
    | (mask & 1) << 2 // down
    | (mask >> 1 & 1) << 3 // up
    | mask & 0x10; // fire
    return true;
  }

  /**
   * Snapshot the whole machine — CPU, memory, ULA, tape position —
   * as a plain JSON-able object (mem is a Uint8Array; the caller
   * chooses the encoding). The point: a 7-emulated-minute boot
   * (Abersoft compiling tron from tape) becomes a one-time cost,
   * restored in milliseconds. Chips with their own saveState()
   * are included; chips without are skipped, so restore only a
   * machine whose transient chip state doesn't matter — or teach
   * the chip to snapshot.
   */
  saveState() {
    const cpu = {};
    for (const k of Z80Machine.CPU_STATE) {
      var _this$cpu$k;
      cpu[k] = (_this$cpu$k = this.cpu[k]) !== null && _this$cpu$k !== void 0 ? _this$cpu$k : 0;
    }
    const chips = {};
    for (const [name, c] of Object.entries(this.chips)) {
      if (typeof c.saveState === 'function') chips[name] = c.saveState();
    }
    return {
      v: 1,
      cpu,
      cycles: this.cycles,
      mem: this.mem.slice(),
      tapePos: this.tape ? this.tape.pos : null,
      chips,
      // 128K: the six real pages (5 and 2 live in mem) + banking.
      // ROMs are load-time configuration, like the 48K ROM.
      zx128: this._zx128 ? {
        pages: [0, 1, 3, 4, 6, 7].map(i => this.pages[i].slice()),
        bank: _objectSpread({}, this._bank)
      } : null
    };
  }

  /** Restore a saveState() snapshot onto an identically-built machine
   *  (same config, same ROM load, same insertTape call). */
  loadState(s) {
    if (s.v !== 1) throw new Error("unknown machine state version ".concat(s.v));
    for (const k of Z80Machine.CPU_STATE) {
      var _s$cpu$k;
      this.cpu[k] = (_s$cpu$k = s.cpu[k]) !== null && _s$cpu$k !== void 0 ? _s$cpu$k : 0;
    }
    this.cycles = s.cycles;
    this.mem.set(s.mem);
    if (s.tapePos != null) {
      if (!this.tape) throw new Error('snapshot has a tape position but no tape is inserted');
      this.tape.pos = s.tapePos;
    }
    for (const [name, cs] of Object.entries((_s$chips = s.chips) !== null && _s$chips !== void 0 ? _s$chips : {})) {
      var _s$chips;
      const c = this.chips[name];
      if (c && typeof c.loadState === 'function') c.loadState(cs);
    }
    if (s.zx128 && this._zx128) {
      [0, 1, 3, 4, 6, 7].forEach((page, i) => this.pages[page].set(s.zx128.pages[i]));
      this._bank.locked = 0; // let _setBank apply
      this._setBank(s.zx128.bank.page | s.zx128.bank.shadow << 3 | s.zx128.bank.rom << 4 | s.zx128.bank.locked << 5);
    }
  }

  /**
   * Attach a non-bus device that needs machine time (a PS/2 capture
   * chain, a sensor with its own pacing). It gets advance(cycles) in
   * step with the chips but owns no addresses — its outputs reach the
   * CPU through chip inputs or port reads, like the bench.
   */
  attachDevice(name, dev) {
    this.devices = this.devices || {};
    this.devices[name] = dev;
    return dev;
  }
  _advanceChips(n) {
    for (const k of Object.keys(this.chips)) {
      const c = this.chips[k];
      if (typeof c.advance === 'function') c.advance(n);
    }
    if (this.devices) {
      for (const k of Object.keys(this.devices)) {
        const d = this.devices[k];
        if (typeof d.advance === 'function') d.advance(n);
      }
    }
  }
  _anyIrq() {
    for (const k of Object.keys(this.chips)) if (this.chips[k].irqAsserted) return true;
    return false;
  }

  /** One instruction; IM 1 delivery when a chip asserts and IFF1 is set. */
  step() {
    if (this.cpu.halted && !(this._anyIrq() && this.cpu.iff1)) {
      this.cycles += 4; // HALT burns NOPs until an interrupt
      this._advanceChips(4);
      return 4;
    }
    if (this._anyIrq() && this.cpu.iff1 && !this.cpu.eiLatch) {
      this.cpu.halted = false;
      this.cpu.iff1 = 0;
      this.cpu.iff2 = 0;
      this.cpu._push16(this.cpu.pc);
      if (this.cpu.im === 2) {
        // IM 2: the interrupting chip supplies the vector byte
        // (Z8430 daisy chain — ackVector also clears the
        // channel); the handler address comes from the table at
        // I:vector. 19 cycles per the Z80 manual.
        let vec = 0xff;
        for (const k of Object.keys(this.chips)) {
          const c = this.chips[k];
          if (c.irqAsserted && typeof c.ackVector === 'function') {
            vec = c.ackVector();
            break;
          }
        }
        const at = (this.cpu.i & 0xff) << 8 | vec & 0xfe;
        this.cpu.pc = this.mem[at] | this.mem[at + 1] << 8;
        this.cpu.wz = this.cpu.pc;
        this.cycles += 19;
        this._advanceChips(19);
        return 19;
      }
      // IM 1 acknowledge: RST $38, 13 cycles.
      this.cpu.pc = 0x0038;
      this.cpu.wz = 0x0038;
      this.cycles += 13;
      this._advanceChips(13);
      return 13;
    }
    const trap = this.pcTraps.get(this.cpu.pc);
    if (trap) {
      const n = trap(this);
      if (n > 0) {
        this.cycles += n;
        this._advanceChips(n);
        return n;
      }
    }
    // LD-BYTES fast-load trap: with a tape inserted, entering the
    // ROM's loader at $0556 loads the next block instantly and RETs.
    // On a 128K machine the address only means LD-BYTES when the
    // 48 BASIC ROM (slot 1) is mapped — the 128 editor ROM has
    // different code at $0556 and must not be trapped.
    if (this.tape && this.cpu.pc === 0x0556 && this.ula && (!this._zx128 || this._bank.rom === 1)) {
      this.tape.trap(this.cpu, this.mem, this.writeBus);
      this.cpu.pc = this.cpu._pop16();
      this.cycles += 100; // a token cost; the real routine took minutes
      this._advanceChips(100);
      return 100;
    }
    const n = this.cpu.step();
    this.cycles += n;
    this._advanceChips(n);
    return n;
  }
  advanceToMs(tMs) {
    const target = Math.ceil(tMs * this.clockHz / 1000);
    while (this.cycles < target) this.step();
  }
}
/** Every scalar the core carries — the snapshot contract. */
_defineProperty(Z80Machine, "CPU_STATE", ['a', 'f', 'b', 'c', 'd', 'e', 'h', 'l', 'a_', 'f_', 'b_', 'c_', 'd_', 'e_', 'h_', 'l_', 'ix', 'iy', 'sp', 'pc', 'i', 'r', 'wz', 'iff1', 'iff2', 'im', 'q', 'eiLatch', 'halted', 'cycles']);
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Z80Machine);

/***/ }),

/***/ "./src/lib/bw-board/zx-tape.js":
/*!*************************************!*\
  !*** ./src/lib/bw-board/zx-tape.js ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ZXTape: () => (/* binding */ ZXTape),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   parseTap: () => (/* binding */ parseTap)
/* harmony export */ });
/**
 * ZX Spectrum tape: TAP container + the LD-BYTES fast-load trap.
 *
 * A .TAP file is the simplest of the tape containers: a sequence of
 * [len:word][flag:byte][data...][checksum:byte] blocks, where len
 * counts flag+data+checksum. Header blocks (flag $00, 17 data bytes)
 * describe the next data block (flag $FF).
 *
 * Loading is done the way every serious emulator does it: a ROM TRAP.
 * The 48K ROM's LD-BYTES routine lives at $0556 and its contract is
 * registers, documented exhaustively: IX = destination, DE = length,
 * A' = expected flag byte, carry set = LOAD (reset = VERIFY). When PC
 * hits $0556 with a tape attached, the machine copies the next
 * matching block directly into memory, sets carry for success, and
 * returns — skipping the pilot-tone minutes a bit-level EAR stream
 * would cost. Bit-level EAR playback (for turbo/custom loaders) is a
 * stated later step, not pretended here.
 */

/** Parse a .TAP buffer into blocks: [{flag, data(Uint8Array)}...] */
function parseTap(buf) {
  const blocks = [];
  let i = 0;
  while (i + 2 <= buf.length) {
    const len = buf[i] | buf[i + 1] << 8;
    i += 2;
    if (len < 2 || i + len > buf.length) break;
    blocks.push({
      flag: buf[i],
      data: buf.subarray(i + 1, i + len - 1)
    });
    i += len;
  }
  return blocks;
}
class ZXTape {
  /** @param {Uint8Array} tapBuf raw .TAP contents */
  constructor(tapBuf) {
    this.blocks = parseTap(tapBuf);
    this.pos = 0;
  }
  rewind() {
    this.pos = 0;
  }

  /**
   * The LD-BYTES trap body. Call when PC = $0556.
   * @param {import('./z80.js').Z80} cpu
   * @param {Uint8Array} mem
   * @param {(a: number, v: number) => void} [write] bus write — a 128K
   *   machine passes its banked writeBus so a load into the $C000
   *   window lands in the mapped PAGE, not the flat array.
   * @returns {boolean} true when handled (caller RETs the CPU)
   */
  trap(cpu, mem, write) {
    if (this.pos >= this.blocks.length) {
      // No tape left: report failure the way BREAK does — carry
      // reset — so the ROM prints its error instead of hanging.
      cpu.f &= ~0x01;
      return true;
    }
    // At the $0556 ENTRY the flag byte and load/verify carry are in
    // CURRENT AF — the routine's own EX AF,AF' sits two bytes in
    // ($0558), so shadow AF still holds caller junk here. Measured
    // the hard way: the shadow read made every load a VERIFY.
    const wantFlag = cpu.a;
    const load = (cpu.f & 0x01) !== 0;
    const block = this.blocks[this.pos++];
    if (block.flag !== wantFlag) {
      cpu.f &= ~0x01; // flag mismatch: error, block consumed (real tape moves on)
      return true;
    }
    const dest = cpu.ix & 0xffff;
    const len = cpu.d << 8 | cpu.e;
    const n = Math.min(len, block.data.length);
    if (load) {
      const w = write !== null && write !== void 0 ? write : (a, v) => {
        mem[a] = v;
      };
      for (let i = 0; i < n; i++) w(dest + i & 0xffff, block.data[i]);
    }
    // Register state a successful LD-BYTES leaves behind, per the
    // ROM listing: IX past the end, DE zero, carry set.
    cpu.ix = dest + n & 0xffff;
    cpu.d = 0;
    cpu.e = 0;
    cpu.f |= 0x01;
    return true;
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ZXTape);

/***/ }),

/***/ "./src/lib/bw-board/zx-ula.js":
/*!************************************!*\
  !*** ./src/lib/bw-board/zx-ula.js ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ZXULA: () => (/* binding */ ZXULA),
/* harmony export */   ZX_BORDER: () => (/* binding */ ZX_BORDER),
/* harmony export */   ZX_H: () => (/* binding */ ZX_H),
/* harmony export */   ZX_PALETTE: () => (/* binding */ ZX_PALETTE),
/* harmony export */   ZX_W: () => (/* binding */ ZX_W),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   zxScreenText: () => (/* binding */ zxScreenText)
/* harmony export */ });
/**
 * ZX Spectrum ULA — the 48K machine's video/keyboard/beeper chip.
 *
 * Clean-room from the public documentation of the most-documented 8-bit
 * machine there is (the community timing/format references; Chris
 * Smith's ULA book is the deep source of record). What v1 models:
 *
 * - VIDEO: bitmap $4000-$57FF with the famous interleaved line order —
 *   address bits arrange as [010 Y7Y6 Y2Y1Y0 Y5Y4Y3 X4..X0], so line
 *   N+1 of a character row is 256 bytes away, not 32. Attributes
 *   $5800-$5AFF, one byte per 8x8 cell: FLASH|BRIGHT|PAPER(3)|INK(3).
 *   Border color from OUT (bits 0-2). videoFrame() renders 256x192
 *   plus a 16px border frame like a real TV picture.
 * - PORT $FE (every EVEN port — the ULA decodes only A0): OUT sets
 *   border(0-2)/MIC(3)/SPEAKER(4); IN reads the keyboard half-row(s)
 *   selected by ZERO bits in A8-A15, keys active-LOW in bits 0-4,
 *   EAR in bit 6 (idle high on real hardware with no tape).
 * - KEYBOARD: the 8x5 matrix, addressed by half-row. setKeys() takes
 *   a set of key names ('a'..'z','0'..'9','enter','space','caps',
 *   'sym') — the face's focus-routing contract feeds this.
 * - 50 Hz FRAME INTERRUPT: INT asserted each 69888 T-states (48K
 *   timing at 3.5 MHz), held ~32 T-states like the real pulse.
 * - BEEPER: speaker-bit edges recorded with timestamps for a future
 *   audio face (the buzzerEdges pattern).
 *
 * Stated v1 bounds: NO memory contention (timing-honest emulation of
 * contended RAM is a later, separate effort), no FLASH phase swap yet,
 * EAR/tape always idle.
 */

const ZX_W = 256;
const ZX_H = 192;
const ZX_BORDER = 16;

/** The Spectrum palette: normal 0-7, bright 8-15 (GRB bit order). */
const ZX_PALETTE = Array.from({
  length: 16
}, (_, i) => {
  const v = i & 0x08 ? 255 : 205;
  return [i & 0x02 ? v : 0,
  // R (bit 1)
  i & 0x04 ? v : 0,
  // G (bit 2)
  i & 0x01 ? v : 0,
  // B (bit 0)
  255];
});

/** key name → [halfRow (A8..A15 index), bit] per the 48K matrix. */
const MATRIX = {
  caps: [0, 0],
  z: [0, 1],
  x: [0, 2],
  c: [0, 3],
  v: [0, 4],
  a: [1, 0],
  s: [1, 1],
  d: [1, 2],
  f: [1, 3],
  g: [1, 4],
  q: [2, 0],
  w: [2, 1],
  e: [2, 2],
  r: [2, 3],
  t: [2, 4],
  1: [3, 0],
  2: [3, 1],
  3: [3, 2],
  4: [3, 3],
  5: [3, 4],
  0: [4, 0],
  9: [4, 1],
  8: [4, 2],
  7: [4, 3],
  6: [4, 4],
  p: [5, 0],
  o: [5, 1],
  i: [5, 2],
  u: [5, 3],
  y: [5, 4],
  enter: [6, 0],
  l: [6, 1],
  k: [6, 2],
  j: [6, 3],
  h: [6, 4],
  space: [7, 0],
  sym: [7, 1],
  m: [7, 2],
  n: [7, 3],
  b: [7, 4]
};
const CLOCK_HZ = 3500000; // the 48K machine's fixed clock
const FRAME_TSTATES = 69888; // 48K frame at 3.5 MHz → 50.08 Hz
const INT_LENGTH = 32;
class ZXULA {
  /**
   * @param {Uint8Array} mem the machine's 64K (screen read live)
   * @param {{frameTstates?: number, screen?: Uint8Array}} [opts]
   *   frameTstates: 69888 (48K, default) or 70908 (128K timing).
   *   screen: a 16K view the bitmap+attrs live in; defaults to the
   *   $4000 window of mem. The 128K machine swaps this on OUT $7FFD
   *   bit 3 — the shadow screen in page 7.
   */
  constructor(mem) {
    var _opts$frameTstates, _opts$screen;
    let opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    this.mem = mem;
    this._frameTstates = (_opts$frameTstates = opts.frameTstates) !== null && _opts$frameTstates !== void 0 ? _opts$frameTstates : FRAME_TSTATES;
    this.screen = (_opts$screen = opts.screen) !== null && _opts$screen !== void 0 ? _opts$screen : mem.subarray(0x4000, 0x8000);
    this.border = 7; // boots white
    this.speaker = 0;
    this.speakerEdges = []; // [tStateStamp, level]
    this.rows = new Uint8Array(8).fill(0x1f); // active-low, idle high
    this._toFrame = this._frameTstates;
    this._intLeft = 0;
    this.frame = 0;
    this.tStates = 0; // total T-states, the edge clock
    // EAR input: a timed pulse list from the tape engine. Each entry
    // is { tStates, level } — the EAR bit flips at that T-state.
    // Between edges, the last level holds. Idle = 1 (high).
    this._earEdges = [];
    this._earIdx = 0;
    this._earLevel = 1;
  }

  /**
   * The audio-face contract, shaped like the buzzer's {hz, on}: the
   * dominant beeper frequency over the recent window, estimated from
   * speaker edges. Fewer than 4 edges in the window = silence — a
   * lone level change is a click, not a tone.
   * @param {number} [windowTs] look-back in T-states (default 50 ms)
   */
  audioTone() {
    let windowTs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 175000;
    const since = this.tStates - windowTs;
    const e = this.speakerEdges;
    let first = e.length;
    while (first > 0 && e[first - 1][0] >= since) first--;
    const n = e.length - first;
    if (n < 4) return {
      hz: 0,
      on: false
    };
    const span = e[e.length - 1][0] - e[first][0];
    if (span <= 0) return {
      hz: 0,
      on: false
    };
    // n edges bound n-1 half-periods; a full period is two of them.
    const hz = CLOCK_HZ / (2 * (span / (n - 1)));
    return {
      hz: Math.round(hz),
      on: true
    };
  }

  /** Machine-snapshot hooks. Held keys and recorded speaker edges
   *  are transients and reset; timing state carries over exactly. */
  saveState() {
    return {
      border: this.border,
      speaker: this.speaker,
      frame: this.frame,
      tStates: this.tStates,
      toFrame: this._toFrame,
      intLeft: this._intLeft
    };
  }
  loadState(s) {
    this.border = s.border;
    this.speaker = s.speaker;
    this.frame = s.frame;
    this.tStates = s.tStates;
    this._toFrame = s.toFrame;
    this._intLeft = s.intLeft;
    this.rows.fill(0x1f);
    this.speakerEdges.length = 0;
    this._earEdges = [];
    this._earIdx = 0;
    this._earLevel = 1;
  }

  // ── Contention ─────────────────────────────────────────────────
  // Per-instruction approximation: given the current T-state position
  // in the frame, return the wait-state penalty from the 8-T-state
  // contention pattern. Returns 0 during border/blanking time.
  // The contention table: pattern offset 0→6, 1→5, ..., 6→0, 7→0.

  /** @type {number} T-states per scan line (224 for 48K, 228 for 128K) */
  get _lineTstates() {
    return this._frameTstates === 70908 ? 228 : 224;
  }

  /** @type {number} first contended scan line (48K: 64, 128K: 63) */
  get _firstContendedLine() {
    return this._frameTstates === 70908 ? 63 : 64;
  }

  /** @type {number} last contended scan line (exclusive) */
  get _lastContendedLine() {
    return this._firstContendedLine + 192;
  }

  /**
   * Memory contention penalty for a bus access at the current frame
   * position. Returns 0 when not in the contended display area.
   * @param {number} frameTs — T-states into the current frame
   *   (typically machine.cycles % frameTstates)
   * @returns {number} wait states (0-6)
   */
  contend(frameTs) {
    const lineTs = this._lineTstates;
    const line = Math.floor(frameTs / lineTs);
    if (line < this._firstContendedLine || line >= this._lastContendedLine) return 0;
    const col = frameTs % lineTs;
    // Only the first 128 T-states of each line are contended
    // (the pixel/attr fetch area)
    if (col >= 128) return 0;
    const pattern = col & 7; // 0-7 position in the 8-T-state cycle
    return pattern < 6 ? 6 - pattern : 0;
  }

  /**
   * Feed a list of timed EAR edges for bit-level tape playback.
   * Each entry: { tStates: number, level: 0|1 }. The list must be
   * sorted by tStates. Called by the TZX pulse scheduler.
   * @param {Array<{tStates: number, level: 0|1}>} edges
   */
  setEarEdges(edges) {
    this._earEdges = edges;
    this._earIdx = 0;
    this._earLevel = 1; // idle high before first edge
  }

  /** Clear the EAR input (tape stopped/ejected). */
  clearEar() {
    this._earEdges = [];
    this._earIdx = 0;
    this._earLevel = 1;
  }

  /** Face-input contract: the currently held key names. */
  setKeys(names) {
    this.rows.fill(0x1f);
    for (const n of names) {
      const m = MATRIX[String(n).toLowerCase()];
      if (m) this.rows[m[0]] &= ~(1 << m[1]);
    }
  }

  /** IN from any even port: keyboard half-rows selected by ZERO bits
   *  of the high address byte, ANDed together like the real matrix. */
  in(port) {
    const high = port >> 8 & 0xff;
    let v = 0x1f;
    for (let r = 0; r < 8; r++) {
      if ((high >> r & 1) === 0) v &= this.rows[r];
    }
    // Advance EAR state to the current T-state position
    while (this._earIdx < this._earEdges.length && this.tStates >= this._earEdges[this._earIdx].tStates) {
      this._earLevel = this._earEdges[this._earIdx].level;
      this._earIdx++;
    }
    const ear = this._earLevel ? 0x40 : 0x00;
    return 0xa0 | ear | v; // bit7/5 float high, bit6 = EAR
  }

  /** OUT to any even port. */
  out(_port, val, tStates) {
    this.border = val & 0x07;
    const spk = val >> 4 & 1;
    if (spk !== this.speaker) {
      this.speaker = spk;
      this.speakerEdges.push([tStates, spk]);
      if (this.speakerEdges.length > 4096) this.speakerEdges.splice(0, 2048);
    }
  }

  /** @param {number} t T-states elapsed */
  advance(t) {
    this.tStates += t;
    if (this._intLeft > 0) this._intLeft = Math.max(0, this._intLeft - t);
    this._toFrame -= t;
    while (this._toFrame <= 0) {
      this._toFrame += this._frameTstates;
      this._intLeft = INT_LENGTH;
      this.frame++;
    }
  }

  /** Level-triggered like the real pulse: ~32 T-states per frame. */
  get irqAsserted() {
    return this._intLeft > 0;
  }

  /** The screen (with border frame) as palette indices. */
  renderFrame() {
    const W = ZX_W + 2 * ZX_BORDER,
      H = ZX_H + 2 * ZX_BORDER;
    const indices = new Uint8Array(W * H).fill(this.border);
    // FLASH: attribute bit 7 swaps ink/paper for 16 frames of
    // every 32 — the real ULA's cursor blink.
    const flashPhase = this.frame >> 4 & 1;
    for (let y = 0; y < ZX_H; y++) {
      // The interleave: bits [7:6]=Y7Y6, [5:3]=Y2Y1Y0, [2:0]=Y5Y4Y3
      const addr = (y & 0xc0) << 5 // Y7Y6 → A12..A11
      | (y & 0x07) << 8 // Y2Y1Y0 → A10..A8
      | (y & 0x38) << 2; // Y5Y4Y3 → A7..A5
      for (let cx = 0; cx < 32; cx++) {
        const bits = this.screen[addr + cx];
        const attr = this.screen[0x1800 + (y >> 3) * 32 + cx];
        const bright = attr & 0x40 ? 8 : 0;
        let ink = (attr & 0x07) + bright;
        let paper = (attr >> 3 & 0x07) + bright;
        if (attr & 0x80 && flashPhase) {
          const s = ink;
          ink = paper;
          paper = s;
        }
        const row = (y + ZX_BORDER) * W + ZX_BORDER + cx * 8;
        for (let b = 0; b < 8; b++) {
          indices[row + b] = bits >> 7 - b & 1 ? ink : paper;
        }
      }
    }
    return {
      width: W,
      height: H,
      indices,
      signal: true
    };
  }

  /** The common video-face contract. */
  videoFrame() {
    const f = this.renderFrame();
    const rgba = new Uint8ClampedArray(f.indices.length * 4);
    for (let i = 0; i < f.indices.length; i++) rgba.set(ZX_PALETTE[f.indices[i]], i * 4);
    return {
      width: f.width,
      height: f.height,
      rgba,
      frame: this.frame,
      signal: true
    };
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ZXULA);

/**
 * Decode the bitmap screen back to text by matching each 8x8 cell
 * against the ROM character set (chars 32-127 at ROM $3D00). Cells
 * that match no glyph (graphics, UDGs, inverse video) become '?'.
 * This turns every Spectrum acceptance test from pixel-counting into
 * string assertion — the same jump the HD44780's text state gave.
 * @param {Uint8Array} mem the machine's 64K (ROM font + screen)
 * @param {{font?: Uint8Array}} [opts] the 768-byte character set
 *   (chars 32-127 × 8 rows). Defaults to mem's $3D00 — right for a
 *   48K machine; a BANKED machine's flat mem has no ROM, so pass
 *   machine.roms[1].subarray(0x3d00, 0x4000) there.
 */
function zxScreenText(mem) {
  var _opts$font;
  let opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  const font = (_opts$font = opts.font) !== null && _opts$font !== void 0 ? _opts$font : mem.subarray(0x3d00, 0x4000);
  const lines = [];
  for (let row = 0; row < 24; row++) {
    let line = '';
    for (let col = 0; col < 32; col++) {
      const y0 = row * 8;
      const cell = [];
      for (let dy = 0; dy < 8; dy++) {
        const y = y0 + dy;
        const addr = 0x4000 | (y & 0xc0) << 5 | (y & 0x07) << 8 | (y & 0x38) << 2 | col;
        cell.push(mem[addr]);
      }
      let ch = '?';
      if (cell.every(b => b === 0)) {
        ch = ' ';
      } else {
        for (let c = 32; c < 128; c++) {
          const g = (c - 32) * 8;
          let ok = true;
          for (let dy = 0; dy < 8; dy++) if (font[g + dy] !== cell[dy]) {
            ok = false;
            break;
          }
          if (ok) {
            ch = String.fromCharCode(c);
            break;
          }
        }
      }
      line += ch;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/***/ })

}]);