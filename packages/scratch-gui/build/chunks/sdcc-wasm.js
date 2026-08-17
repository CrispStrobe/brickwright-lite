"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["sdcc-wasm"],{

/***/ "./src/lib/sdcc-wasm/compiler.js":
/*!***************************************!*\
  !*** ./src/lib/sdcc-wasm/compiler.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   compile: () => (/* binding */ compile),
/* harmony export */   isEnabled: () => (/* binding */ isEnabled)
/* harmony export */ });
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
/**
 * SDCC 4.5.0 as WebAssembly — lazy-loaded, behind a flag.
 *
 * NOT the default compiler. Byte-identity with native SDCC is not yet verified.
 * Enabled by: localStorage.setItem('bw-use-wasm-compiler', '1')
 *
 * The WASM artifacts (sdcc.js/wasm, sdas8051.js/wasm, sdld.js/wasm, include/)
 * are served as static assets from the build, fetched on first compile, and
 * immutably cached. Total: ~1.6 MiB gzip.
 *
 * The compile function matches the server API shape so the debug-runner can
 * consume it without modification — it returns { success, hex, symbols, ... }.
 *
 * Licence: SDCC is GPL-2+. This is a distribution of SDCC. Source tarball SHA-256
 * in BUILD-INFO.md. mcs51 port only.
 */

let loaded = false;
let sdcc = null;
let sdas = null;
let sdld = null;

/**
 * Whether the WASM compiler flag is set.
 */
function isEnabled() {
  try {
    return localStorage.getItem('bw-use-wasm-compiler') === '1';
  } catch (_unused) {
    return false;
  }
}

/**
 * Load the WASM toolchain. Called once on first compile.
 * @param {string} base - base URL for the static assets (e.g. document.baseURI)
 */
function loadToolchain(_x) {
  return _loadToolchain.apply(this, arguments);
}
/**
 * Compile C source to Intel HEX using the WASM toolchain.
 *
 * Matches the server's POST /compile response shape:
 *   { success, hex?, error?, symbols?, symbols_error? }
 *
 * @param {string} code - C source
 * @param {object} opts
 * @param {string} opts.target - device target (e.g. 'stc12c5a60s2')
 * @param {boolean} opts.symbols - whether to extract symbol table
 * @returns {Promise<object>}
 */
function _loadToolchain() {
  _loadToolchain = _asyncToGenerator(function* (base) {
    if (loaded) return;
    const resolve = name => new URL("static/sdcc-wasm/".concat(name), base).href;

    // Each Emscripten module is a factory function that returns a promise
    const [sdccMod, sdasMod, sdldMod] = yield Promise.all([import(/* webpackIgnore: true */resolve('sdcc.js')), import(/* webpackIgnore: true */resolve('sdas8051.js')), import(/* webpackIgnore: true */resolve('sdld.js'))]);

    // Initialise each with locateFile pointing at the static dir
    const locateFile = name => resolve(name);
    sdcc = yield (sdccMod.default || sdccMod)({
      locateFile
    });
    sdas = yield (sdasMod.default || sdasMod)({
      locateFile
    });
    sdld = yield (sdldMod.default || sdldMod)({
      locateFile
    });
    loaded = true;
  });
  return _loadToolchain.apply(this, arguments);
}
function compile(_x2) {
  return _compile.apply(this, arguments);
}
function _compile() {
  _compile = _asyncToGenerator(function (code) {
    let {
      target = 'stc12c5a60s2',
      symbols = false
    } = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return function* () {
      try {
        yield loadToolchain(document.baseURI);
      } catch (e) {
        return {
          success: false,
          error: "WASM toolchain failed to load: ".concat(e.message)
        };
      }
      try {
        // Write source to the virtual filesystem
        sdcc.FS.writeFile('/input.c', code);

        // Run sdcc: compile C → .asm
        const sdccArgs = ['-mmcs51', "--model-".concat(target.includes('stc89') ? 'small' : 'small'), '-c', '/input.c', '-o', '/input.rel'];
        const sdccResult = sdcc.callMain(sdccArgs);
        if (sdccResult !== 0) {
          const stderr = ''; // TODO: capture stderr from Emscripten
          return {
            success: false,
            error: "sdcc exited with code ".concat(sdccResult, ". ").concat(stderr)
          };
        }

        // Run sdas8051: assemble (sdcc already does this, but if needed)
        // For the mcs51 port, sdcc calls the assembler internally

        // Run sdld: link → .ihx
        const sdldArgs = ['-nui', '-i', '/output.ihx', '/input.rel'];
        const sdldResult = sdld.callMain(sdldArgs);
        if (sdldResult !== 0) {
          return {
            success: false,
            error: "sdld exited with code ".concat(sdldResult)
          };
        }

        // Read the output
        const hex = sdcc.FS.readFile('/output.ihx', {
          encoding: 'utf8'
        });
        const result = {
          success: true,
          hex,
          base64: btoa(hex)
        };

        // Symbol extraction (stub — needs stc_symtab.py equivalent in JS)
        if (symbols) {
          result.symbols = null;
          result.symbols_error = 'WASM compiler does not yet extract symbols (use server for debugging)';
        }
        return result;
      } catch (e) {
        return {
          success: false,
          error: "WASM compilation failed: ".concat(e.message)
        };
      }
    }();
  });
  return _compile.apply(this, arguments);
}

/***/ }),

/***/ "./src/lib/sdcc-wasm/intercept.js":
/*!****************************************!*\
  !*** ./src/lib/sdcc-wasm/intercept.js ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   installWasmCompilerIntercept: () => (/* binding */ installWasmCompilerIntercept)
/* harmony export */ });
/* harmony import */ var _compiler_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./compiler.js */ "./src/lib/sdcc-wasm/compiler.js");
/**
 * WASM compiler fetch intercept — routes /compile requests to the local
 * WASM toolchain when the flag is set. Non-invasive: patches globalThis.fetch
 * and restores the original for non-compile requests.
 *
 * Call installWasmCompilerIntercept() once at app startup. It is a no-op
 * when the flag is not set.
 *
 * NOT the default. Enabled by: localStorage.setItem('bw-use-wasm-compiler', '1')
 */


let installed = false;
function installWasmCompilerIntercept() {
  if (installed || !(0,_compiler_js__WEBPACK_IMPORTED_MODULE_0__.isEnabled)()) return;
  installed = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input === null || input === void 0 ? void 0 : input.url;

    // Only intercept POST /compile to the stc-compiler service
    if (url && url.includes('/compile') && (init === null || init === void 0 ? void 0 : init.method) === 'POST') {
      try {
        const body = JSON.parse(init.body);
        if (body.language === 'c' && body.code) {
          console.log('[sdcc-wasm] intercepting /compile — using local WASM compiler (preview, not verified)');
          return (0,_compiler_js__WEBPACK_IMPORTED_MODULE_0__.compile)(body.code, {
            target: body.target,
            symbols: body.symbols
          }).then(result => new Response(JSON.stringify(result), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          }));
        }
      } catch (_unused) {
        // Fall through to server on parse failure
      }
    }
    return originalFetch.call(globalThis, input, init);
  };
  console.log('[sdcc-wasm] WASM compiler intercept installed (preview — byte-identity not verified)');
}

/***/ })

}]);