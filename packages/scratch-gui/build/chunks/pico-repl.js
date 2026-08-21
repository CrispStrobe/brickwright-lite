"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["pico-repl"],{

/***/ "./src/lib/pico-repl.js":
/*!******************************!*\
  !*** ./src/lib/pico-repl.js ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createPicoRepl: () => (/* binding */ createPicoRepl),
/* harmony export */   pyBytesLiteral: () => (/* binding */ pyBytesLiteral),
/* harmony export */   webSerialTransport: () => (/* binding */ webSerialTransport)
/* harmony export */ });
/* provided dependency */ var Buffer = __webpack_require__(/*! buffer */ "./node_modules/buffer/index.js")["Buffer"];
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
// picoRepl — MicroPython raw-REPL upload protocol, transport-agnostic.
//
/* global Buffer */ // Node global; this util also runs under the node transport + tests.
//
// The app's path from blocks to a live Pico over USB: generateMicroPython
// gives main.py, THIS speaks the wire protocol, and the transport is
// whatever can move bytes — the browser's WebSerial port, a node serial
// stream, or the scripted mock in the tests. It is exactly the dance
// mpremote and Thonny do:
//
//   Ctrl-C Ctrl-C   interrupt whatever runs
//   Ctrl-A          enter raw REPL        → "raw REPL; CTRL-B to exit"
//   <code> Ctrl-D   execute               → "OK" then output, then \x04
//   Ctrl-B          back to friendly REPL
//
// Deployment writes main.py via a small exec'd program (open/write/close),
// then soft-reboots so the stored file runs standalone — surviving
// unplug/replug, like a flashed firmware.
//
// Browser wiring (Chromium only — Safari has no WebSerial, which is why
// the app must ALSO offer the main.py download and the `bw flash` CLI):
//
//   const port = await navigator.serial.requestPort({
//     filters: [{ usbVendorId: 0x2e8a }]   // Raspberry Pi
//   });
//   await port.open({ baudRate: 115200 });
//   const repl = createPicoRepl(webSerialTransport(port));
//   await repl.deployMainPy(py);

const CTRL_A = '\x01';
const CTRL_B = '\x02';
const CTRL_C = '\x03';
const CTRL_D = '\x04';

/**
 * @typedef {object} Transport
 * @property {(text: string) => Promise<void>} write
 * @property {() => Promise<string>} read — resolves with the next chunk
 */

/**
 * Wrap a WebSerial port into the Transport this module speaks.
 * Lives here so the app's glue stays one call — but the module never
 * touches navigator itself, which is what keeps it testable in node.
 * @param {*} port — an open WebSerial SerialPort
 * @returns {Transport & {close: () => Promise<void>}}
 */
function webSerialTransport(port) {
  const writer = port.writable.getWriter();
  const reader = port.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    write(text) {
      return _asyncToGenerator(function* () {
        yield writer.write(enc.encode(text));
      })();
    },
    read() {
      return _asyncToGenerator(function* () {
        const {
          value,
          done
        } = yield reader.read();
        return done ? '' : dec.decode(value);
      })();
    },
    close() {
      return _asyncToGenerator(function* () {
        writer.releaseLock();
        yield reader.cancel().catch(() => {});
        reader.releaseLock();
        yield port.close();
      })();
    }
  };
}

/**
 * @param {Transport} transport
 * @param {{ timeoutMs?: number }} [opts]
 */
function createPicoRepl(transport) {
  var _opts$timeoutMs;
  let opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  const timeoutMs = (_opts$timeoutMs = opts.timeoutMs) !== null && _opts$timeoutMs !== void 0 ? _opts$timeoutMs : 5000;
  let buffer = '';
  /** Read until the buffer contains `marker`; returns everything up to and
   *  including it, consuming it from the buffer. */
  function readUntil(_x) {
    return _readUntil.apply(this, arguments);
  }
  function _readUntil() {
    _readUntil = _asyncToGenerator(function* (marker) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const i = buffer.indexOf(marker);
        if (i >= 0) {
          const out = buffer.slice(0, i + marker.length);
          buffer = buffer.slice(i + marker.length);
          return out;
        }
        if (Date.now() > deadline) {
          throw new Error("timeout waiting for ".concat(JSON.stringify(marker), " \u2014 got ").concat(JSON.stringify(buffer.slice(-80))));
        }
        buffer += yield transport.read();
      }
    });
    return _readUntil.apply(this, arguments);
  }
  function enterRaw() {
    return _enterRaw.apply(this, arguments);
  }
  /** Execute code in raw REPL; returns its stdout. Throws on a traceback. */
  function _enterRaw() {
    _enterRaw = _asyncToGenerator(function* () {
      yield transport.write(CTRL_C + CTRL_C); // interrupt a running program
      yield transport.write('\r' + CTRL_A);
      yield readUntil('raw REPL; CTRL-B to exit');
    });
    return _enterRaw.apply(this, arguments);
  }
  function exec(_x2) {
    return _exec.apply(this, arguments);
  }
  function _exec() {
    _exec = _asyncToGenerator(function* (code) {
      yield transport.write(code + CTRL_D);
      yield readUntil('OK');
      // Output ends with \x04, then the error channel, then another \x04.
      const out = yield readUntil(CTRL_D);
      const err = yield readUntil(CTRL_D);
      const errText = err.slice(0, -1);
      if (errText.trim()) throw new Error("device error: ".concat(errText.trim()));
      return out.slice(0, -1);
    });
    return _exec.apply(this, arguments);
  }
  return {
    enterRaw,
    exec,
    /** The whole deployment: write main.py, verify the byte count, reboot
     *  so the stored program runs standalone. */
    deployMainPy(py) {
      return _asyncToGenerator(function* () {
        yield enterRaw();
        // Write in chunks through a file handle — a single exec string
        // holding the WHOLE program would need escaping it into a literal
        // anyway, so do exactly that, but chunked to respect the device's
        // raw-REPL input buffer.
        yield exec('f = open("main.py", "wb")');
        const CHUNK = 512;
        for (let i = 0; i < py.length; i += CHUNK) {
          const part = py.slice(i, i + CHUNK);
          yield exec("f.write(".concat(pyBytesLiteral(part), ")"));
        }
        yield exec('f.close()');
        const size = yield exec('import os\nprint(os.stat("main.py")[6])');
        const written = parseInt(size.trim(), 10);
        const expected = utf8Length(py);
        if (written !== expected) {
          throw new Error("main.py is ".concat(written, " bytes on the device, expected ").concat(expected));
        }
        // Leave raw REPL, then hard-reset via machine — main.py boots.
        yield transport.write(CTRL_B);
        yield transport.write('\r' + CTRL_A);
        yield readUntil('raw REPL; CTRL-B to exit');
        yield transport.write('import machine\nmachine.reset()' + CTRL_D);
        return written;
      })();
    }
  };
}

/** A Python bytes literal for arbitrary text, UTF-8 encoded. */
function pyBytesLiteral(text) {
  const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text) : Buffer.from(text, 'utf8');
  let out = 'b"';
  for (const b of bytes) {
    if (b === 0x22) out += '\\"';else if (b === 0x5c) out += '\\\\';else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);else if (b === 0x0a) out += '\\n';else if (b === 0x0d) out += '\\r';else if (b === 0x09) out += '\\t';else out += '\\x' + b.toString(16).padStart(2, '0');
  }
  return out + '"';
}
function utf8Length(text) {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : Buffer.byteLength(text, 'utf8');
}

/***/ }),

/***/ "./src/lib/pico-tauri-transport.js":
/*!*****************************************!*\
  !*** ./src/lib/pico-tauri-transport.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   available: () => (/* binding */ available),
/* harmony export */   bootselVolume: () => (/* binding */ bootselVolume),
/* harmony export */   flashUf2: () => (/* binding */ flashUf2),
/* harmony export */   listPorts: () => (/* binding */ listPorts),
/* harmony export */   openTransport: () => (/* binding */ openTransport)
/* harmony export */ });
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
// Brickwright: the Tauri half of Pico deploy. picoRepl (sb3-creator's
// transport-agnostic MicroPython raw-REPL codec) speaks {write, read, close};
// on the web that transport is WebSerial, here it is four invoke() commands
// backed by the Rust serialport crate — which is what makes deploy work on
// Safari-engine webviews and on Windows without drivers.
//
// The UI side decides when to call this; everything here is a no-op outside
// Tauri (window.__TAURI__ absent → available() is false).

const invoke = function invoke() {
  return window.__TAURI__.core.invoke(...arguments);
};
const available = () => typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core);

/** @returns {Promise<string[]>} candidate serial ports (callout devices only) */
const listPorts = () => invoke('pico_serial_list');

/** True when a Pico in BOOTSEL mode is mounted (its RPI-RP2 volume found). */
const bootselVolume = () => invoke('pico_bootsel_volume');

/**
 * Write a .uf2 to the mounted BOOTSEL volume — first-time flashing
 * (MicroPython itself, or a baked firmware+littlefs image).
 * @param {Uint8Array} uf2
 * @returns {Promise<string>} human-readable result
 */
const flashUf2 = uf2 => {
  let binary = '';
  for (let i = 0; i < uf2.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, uf2.subarray(i, i + 0x8000));
  }
  return invoke('pico_flash_uf2', {
    uf2Base64: btoa(binary)
  });
};

/**
 * Open a port and wrap it in the Transport shape picoRepl consumes.
 * The Rust read has a 50 ms timeout returning '' — picoRepl polls, so map
 * empty reads to a small delay to avoid a hot loop.
 * @param {string} path — one of listPorts()
 * @param {number} [baud]
 */
const openTransport = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(function* (path, baud) {
    yield invoke('pico_serial_open', {
      path,
      baud
    });
    return {
      write: data => invoke('pico_serial_write', {
        data
      }),
      read: function () {
        var _read = _asyncToGenerator(function* () {
          const chunk = yield invoke('pico_serial_read');
          if (chunk === '') {
            yield new Promise(resolve => setTimeout(resolve, 20));
          }
          return chunk;
        });
        function read() {
          return _read.apply(this, arguments);
        }
        return read;
      }(),
      close: () => invoke('pico_serial_close')
    };
  });
  return function openTransport(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();

/***/ })

}]);