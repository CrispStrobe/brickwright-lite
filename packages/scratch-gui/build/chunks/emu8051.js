(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["emu8051"],{

/***/ "./src/lib/emu8051/emu8051.js":
/*!************************************!*\
  !*** ./src/lib/emu8051/emu8051.js ***!
  \************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var __filename = "/index.js";
var __dirname = "/";
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var createEmu8051 = (_globalThis$document => {
  var _scriptName = (_globalThis$document = globalThis.document) === null || _globalThis$document === void 0 || (_globalThis$document = _globalThis$document.currentScript) === null || _globalThis$document === void 0 ? void 0 : _globalThis$document.src;
  return /*#__PURE__*/_asyncToGenerator(function () {
    let moduleArg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return function* (_globalThis$process, _globalThis$process2) {
      var moduleRtn;
      var Module = moduleArg;
      var ENVIRONMENT_IS_WEB = !!globalThis.window;
      var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
      var ENVIRONMENT_IS_NODE = ((_globalThis$process = globalThis.process) === null || _globalThis$process === void 0 || (_globalThis$process = _globalThis$process.versions) === null || _globalThis$process === void 0 ? void 0 : _globalThis$process.node) && ((_globalThis$process2 = globalThis.process) === null || _globalThis$process2 === void 0 ? void 0 : _globalThis$process2.type) != "renderer";
      var programArgs = [];
      var thisProgram = "./this.program";
      var quit_ = (status, toThrow) => {
        throw toThrow;
      };
      if (true) {
        _scriptName = __filename;
      } else {}
      var scriptDirectory = "";
      function locateFile(path) {
        if (Module["locateFile"]) {
          return Module["locateFile"](path, scriptDirectory);
        }
        return scriptDirectory + path;
      }
      var readAsync, readBinary;
      if (ENVIRONMENT_IS_NODE) {
        var fs = __webpack_require__(/*! node:fs */ "?1b16");
        scriptDirectory = __dirname + "/";
        readBinary = filename => {
          filename = isFileURI(filename) ? new URL(filename) : filename;
          var ret = fs.readFileSync(filename);
          return ret;
        };
        readAsync = /*#__PURE__*/function () {
          var _ref2 = _asyncToGenerator(function (filename) {
            let binary = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
            return function* () {
              filename = isFileURI(filename) ? new URL(filename) : filename;
              var ret = fs.readFileSync(filename, binary ? undefined : "utf8");
              return ret;
            }();
          });
          return function readAsync(_x) {
            return _ref2.apply(this, arguments);
          };
        }();
        if (process.argv.length > 1) {
          thisProgram = process.argv[1].replace(/\\/g, "/");
        }
        programArgs = process.argv.slice(2);
        quit_ = (status, toThrow) => {
          process.exitCode = status;
          throw toThrow;
        };
      } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
        try {
          scriptDirectory = new URL(".", _scriptName).href;
        } catch (_unused) {}
        {
          if (ENVIRONMENT_IS_WORKER) {
            readBinary = url => {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, false);
              xhr.responseType = "arraybuffer";
              xhr.send(null);
              return new Uint8Array(xhr.response);
            };
          }
          readAsync = /*#__PURE__*/function () {
            var _ref3 = _asyncToGenerator(function* (url) {
              var response = yield fetch(url, {
                credentials: "same-origin"
              });
              if (response.ok) {
                return response.arrayBuffer();
              }
              throw new Error(response.status + " : " + response.url);
            });
            return function readAsync(_x2) {
              return _ref3.apply(this, arguments);
            };
          }();
        }
      } else {}
      var out = console.log.bind(console);
      var err = console.error.bind(console);
      var wasmBinary;
      var ABORT = false;
      var isFileURI = filename => filename.startsWith("file://");
      class EmscriptenEH {}
      class EmscriptenSjLj extends EmscriptenEH {}
      var readyPromiseResolve, readyPromiseReject;
      var runtimeInitialized = false;
      function updateMemoryViews() {
        var b = wasmMemory.buffer;
        HEAP8 = new Int8Array(b);
        HEAP16 = new Int16Array(b);
        Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
        HEAPU16 = new Uint16Array(b);
        HEAP32 = new Int32Array(b);
        Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
        HEAPF32 = new Float32Array(b);
        HEAPF64 = new Float64Array(b);
        HEAP64 = new BigInt64Array(b);
        HEAPU64 = new BigUint64Array(b);
      }
      function preRun() {
        if (Module["preRun"]) {
          if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
          while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift());
          }
        }
        callRuntimeCallbacks(onPreRuns);
      }
      function initRuntime() {
        runtimeInitialized = true;
        wasmExports["__wasm_call_ctors"]();
      }
      function postRun() {
        if (Module["postRun"]) {
          if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
          while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift());
          }
        }
        callRuntimeCallbacks(onPostRuns);
      }
      function abort(what) {
        var _Module$onAbort, _readyPromiseReject;
        (_Module$onAbort = Module["onAbort"]) === null || _Module$onAbort === void 0 || _Module$onAbort.call(Module, what);
        what = "Aborted(".concat(what, ")");
        err(what);
        ABORT = true;
        what += ". Build with -sASSERTIONS for more info.";
        var e = new WebAssembly.RuntimeError(what);
        (_readyPromiseReject = readyPromiseReject) === null || _readyPromiseReject === void 0 || _readyPromiseReject(e);
        throw e;
      }
      var wasmBinaryFile;
      function findWasmBinary() {
        return locateFile("emu8051.wasm");
      }
      function getBinarySync(file) {
        if (file == wasmBinaryFile && wasmBinary) {
          return new Uint8Array(wasmBinary);
        }
        if (readBinary) {
          return readBinary(file);
        }
        throw "both async and sync fetching of the wasm failed";
      }
      function getWasmBinary(_x3) {
        return _getWasmBinary.apply(this, arguments);
      }
      function _getWasmBinary() {
        _getWasmBinary = _asyncToGenerator(function* (binaryFile) {
          if (!wasmBinary) {
            try {
              var response = yield readAsync(binaryFile);
              return new Uint8Array(response);
            } catch (_unused2) {}
          }
          return getBinarySync(binaryFile);
        });
        return _getWasmBinary.apply(this, arguments);
      }
      function instantiateArrayBuffer(_x4, _x5) {
        return _instantiateArrayBuffer.apply(this, arguments);
      }
      function _instantiateArrayBuffer() {
        _instantiateArrayBuffer = _asyncToGenerator(function* (binaryFile, imports) {
          try {
            var binary = yield getWasmBinary(binaryFile);
            var instance = yield WebAssembly.instantiate(binary, imports);
            return instance;
          } catch (reason) {
            err("failed to asynchronously prepare wasm: ".concat(reason));
            abort(reason);
          }
        });
        return _instantiateArrayBuffer.apply(this, arguments);
      }
      function instantiateAsync(_x6, _x7, _x8) {
        return _instantiateAsync.apply(this, arguments);
      }
      function _instantiateAsync() {
        _instantiateAsync = _asyncToGenerator(function* (binary, binaryFile, imports) {
          if (!binary && !ENVIRONMENT_IS_NODE) {
            try {
              var response = fetch(binaryFile, {
                credentials: "same-origin"
              });
              var instantiationResult = yield WebAssembly.instantiateStreaming(response, imports);
              return instantiationResult;
            } catch (reason) {
              err("wasm streaming compile failed: ".concat(reason));
              err("falling back to ArrayBuffer instantiation");
            }
          }
          return instantiateArrayBuffer(binaryFile, imports);
        });
        return _instantiateAsync.apply(this, arguments);
      }
      function getWasmImports() {
        var imports = {
          env: wasmImports,
          wasi_snapshot_preview1: wasmImports
        };
        return imports;
      }
      function createWasm() {
        return _createWasm.apply(this, arguments);
      }
      function _createWasm() {
        _createWasm = _asyncToGenerator(function* () {
          var _wasmBinaryFile;
          function receiveInstance(instance, module) {
            wasmExports = instance.exports;
            assignWasmExports(wasmExports);
            updateMemoryViews();
            return wasmExports;
          }
          function receiveInstantiationResult(result) {
            return receiveInstance(result["instance"]);
          }
          var info = getWasmImports();
          if (Module["instantiateWasm"]) {
            return new Promise((resolve, reject) => {
              Module["instantiateWasm"](info, (inst, mod) => {
                resolve(receiveInstance(inst, mod));
              });
            });
          }
          (_wasmBinaryFile = wasmBinaryFile) !== null && _wasmBinaryFile !== void 0 ? _wasmBinaryFile : wasmBinaryFile = findWasmBinary();
          var result = yield instantiateAsync(wasmBinary, wasmBinaryFile, info);
          var exports = receiveInstantiationResult(result);
          return exports;
        });
        return _createWasm.apply(this, arguments);
      }
      class ExitStatus {
        constructor(status) {
          _defineProperty(this, "name", "ExitStatus");
          this.message = "Program terminated with exit(".concat(status, ")");
          this.status = status;
        }
      }
      var HEAP16;
      var HEAP32;
      var HEAP64;
      var HEAP8;
      var HEAPF32;
      var HEAPF64;
      var HEAPU16;
      var HEAPU32;
      var HEAPU64;
      var HEAPU8;
      var callRuntimeCallbacks = callbacks => {
        while (callbacks.length > 0) {
          callbacks.shift()(Module);
        }
      };
      var onPostRuns = [];
      var addOnPostRun = cb => onPostRuns.push(cb);
      var onPreRuns = [];
      var addOnPreRun = cb => onPreRuns.push(cb);
      var noExitRuntime = true;
      var stackRestore = val => __emscripten_stack_restore(val);
      var stackSave = () => _emscripten_stack_get_current();
      var getHeapMax = () => 2147483648;
      var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
      var growMemory = size => {
        var oldHeapSize = wasmMemory.buffer.byteLength;
        var pages = (size - oldHeapSize + 65535) / 65536 | 0;
        try {
          wasmMemory.grow(pages);
          updateMemoryViews();
          return 1;
        } catch (e) {}
      };
      var _emscripten_resize_heap = requestedSize => {
        var oldSize = HEAPU8.length;
        requestedSize >>>= 0;
        var maxHeapSize = getHeapMax();
        if (requestedSize > maxHeapSize) {
          return false;
        }
        for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
          var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
          overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
          var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
          var replacement = growMemory(newSize);
          if (replacement) {
            return true;
          }
        }
        return false;
      };
      var getCFunc = ident => {
        var func = Module["_" + ident];
        return func;
      };
      var writeArrayToMemory = (array, buffer) => {
        HEAP8.set(array, buffer);
      };
      var lengthBytesUTF8 = str => {
        var len = 0;
        for (var i = 0; i < str.length; ++i) {
          var c = str.charCodeAt(i);
          if (c <= 127) {
            len++;
          } else if (c <= 2047) {
            len += 2;
          } else if (c >= 55296 && c <= 57343) {
            len += 4;
            ++i;
          } else {
            len += 3;
          }
        }
        return len;
      };
      var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
        if (!(maxBytesToWrite > 0)) return 0;
        var startIdx = outIdx;
        var endIdx = outIdx + maxBytesToWrite - 1;
        for (var i = 0; i < str.length; ++i) {
          var u = str.codePointAt(i);
          if (u <= 127) {
            if (outIdx >= endIdx) break;
            heap[outIdx++] = u;
          } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx) break;
            heap[outIdx++] = 192 | u >> 6;
            heap[outIdx++] = 128 | u & 63;
          } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx) break;
            heap[outIdx++] = 224 | u >> 12;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63;
          } else {
            if (outIdx + 3 >= endIdx) break;
            heap[outIdx++] = 240 | u >> 18;
            heap[outIdx++] = 128 | u >> 12 & 63;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63;
            i++;
          }
        }
        heap[outIdx] = 0;
        return outIdx - startIdx;
      };
      var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
      var stackAlloc = sz => __emscripten_stack_alloc(sz);
      var stringToUTF8OnStack = str => {
        var size = lengthBytesUTF8(str) + 1;
        var ret = stackAlloc(size);
        stringToUTF8(str, ret, size);
        return ret;
      };
      var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
      var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
        var maxIdx = idx + maxBytesToRead;
        if (ignoreNul) return maxIdx;
        while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
        return idx;
      };
      var UTF8ArrayToString = function UTF8ArrayToString(heapOrArray) {
        let idx = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        let maxBytesToRead = arguments.length > 2 ? arguments[2] : undefined;
        let ignoreNul = arguments.length > 3 ? arguments[3] : undefined;
        var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
        if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
          return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
        }
        var str = "";
        while (idx < endPtr) {
          var u0 = heapOrArray[idx++];
          if (!(u0 & 128)) {
            str += String.fromCharCode(u0);
            continue;
          }
          var u1 = heapOrArray[idx++] & 63;
          if ((u0 & 224) == 192) {
            str += String.fromCharCode((u0 & 31) << 6 | u1);
            continue;
          }
          var u2 = heapOrArray[idx++] & 63;
          if ((u0 & 240) == 224) {
            u0 = (u0 & 15) << 12 | u1 << 6 | u2;
          } else {
            u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
          }
          if (u0 < 65536) {
            str += String.fromCharCode(u0);
          } else {
            var ch = u0 - 65536;
            str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
          }
        }
        return str;
      };
      var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
      var ccall = (ident, returnType, argTypes, args, opts) => {
        var toC = {
          string: str => {
            var ret = 0;
            if (str !== null && str !== undefined && str !== 0) {
              ret = stringToUTF8OnStack(str);
            }
            return ret;
          },
          array: arr => {
            var ret = stackAlloc(arr.length);
            writeArrayToMemory(arr, ret);
            return ret;
          }
        };
        function convertReturnValue(ret) {
          if (returnType === "string") {
            return UTF8ToString(ret);
          }
          if (returnType === "boolean") return Boolean(ret);
          return ret;
        }
        var func = getCFunc(ident);
        var cArgs = [];
        var stack = 0;
        if (args) {
          for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
              if (stack === 0) stack = stackSave();
              cArgs[i] = converter(args[i]);
            } else {
              cArgs[i] = args[i];
            }
          }
        }
        var ret = func(...cArgs);
        function onDone(ret) {
          if (stack !== 0) stackRestore(stack);
          return convertReturnValue(ret);
        }
        ret = onDone(ret);
        return ret;
      };
      var cwrap = (ident, returnType, argTypes, opts) => {
        var numericArgs = !argTypes || argTypes.every(type => type === "number" || type === "boolean");
        var numericRet = returnType !== "string";
        if (numericRet && numericArgs && !opts) {
          return getCFunc(ident);
        }
        return function () {
          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          return ccall(ident, returnType, argTypes, args, opts);
        };
      };
      var wasmTableMirror = [];
      var getWasmTableEntry = funcPtr => {
        var func = wasmTableMirror[funcPtr];
        if (!func) {
          wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
        }
        return func;
      };
      var updateTableMap = (offset, count) => {
        if (functionsInTableMap) {
          for (var i = offset; i < offset + count; i++) {
            var item = getWasmTableEntry(i);
            if (item) {
              functionsInTableMap.set(item, i);
            }
          }
        }
      };
      var functionsInTableMap;
      var getFunctionAddress = func => {
        if (!functionsInTableMap) {
          functionsInTableMap = new WeakMap();
          updateTableMap(0, wasmTable.length);
        }
        return functionsInTableMap.get(func) || 0;
      };
      var freeTableIndexes = [];
      var getEmptyTableSlot = () => {
        if (freeTableIndexes.length) {
          return freeTableIndexes.pop();
        }
        return wasmTable["grow"](1);
      };
      var setWasmTableEntry = (idx, func) => {
        wasmTable.set(idx, func);
        wasmTableMirror[idx] = wasmTable.get(idx);
      };
      var uleb128EncodeWithLen = arr => {
        const n = arr.length;
        return [n % 128 | 128, n >> 7, ...arr];
      };
      var wasmTypeCodes = {
        i: 127,
        p: 127,
        j: 126,
        f: 125,
        d: 124,
        e: 111
      };
      var generateTypePack = types => uleb128EncodeWithLen(Array.from(types, type => {
        var code = wasmTypeCodes[type];
        return code;
      }));
      var convertJsFunctionToWasm = (func, sig) => {
        var bytes = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...uleb128EncodeWithLen([1, 96, ...generateTypePack(sig.slice(1)), ...generateTypePack(sig[0] === "v" ? "" : sig[0])]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
        var module = new WebAssembly.Module(bytes);
        var instance = new WebAssembly.Instance(module, {
          e: {
            f: func
          }
        });
        var wrappedFunc = instance.exports["f"];
        return wrappedFunc;
      };
      var addFunction = (func, sig) => {
        var rtn = getFunctionAddress(func);
        if (rtn) {
          return rtn;
        }
        var ret = getEmptyTableSlot();
        try {
          setWasmTableEntry(ret, func);
        } catch (err) {
          if (!(err instanceof TypeError)) {
            throw err;
          }
          var wrapped = convertJsFunctionToWasm(func, sig);
          setWasmTableEntry(ret, wrapped);
        }
        functionsInTableMap.set(func, ret);
        return ret;
      };
      var removeFunction = index => {
        functionsInTableMap.delete(getWasmTableEntry(index));
        setWasmTableEntry(index, null);
        freeTableIndexes.push(index);
      };
      {
        if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
        if (Module["print"]) out = Module["print"];
        if (Module["printErr"]) err = Module["printErr"];
        if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
        if (Module["arguments"]) programArgs = Module["arguments"];
        if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
        if (Module["preInit"]) {
          if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
          while (Module["preInit"].length > 0) {
            Module["preInit"].shift()();
          }
        }
      }
      Module["ccall"] = ccall;
      Module["cwrap"] = cwrap;
      Module["addFunction"] = addFunction;
      Module["removeFunction"] = removeFunction;
      Module["UTF8ToString"] = UTF8ToString;
      Module["stringToUTF8"] = stringToUTF8;
      var _emu_init, _emu_reset, _emu_set_part, _emu_get_flash_size, _emu_get_xram_size, _emu_tick, _emu_run, _emu_load_hex, _emu_get_sfr, _emu_set_sfr, _emu_get_iram, _emu_set_iram, _emu_get_code, _emu_get_xdata, _emu_set_xdata, _emu_get_pc, _emu_set_pc, _emu_disasm, _emu_set_adc_input, _emu_set_port_input, _emu_set_fosc, _emu_get_pin_mode, _emu_get_pin_drive, _emu_set_pin_input, _emu_set_adc_voltage, _emu_advance_to_ns, _emu_get_time_ns_lo, _emu_get_time_ns_hi, _emu_set_vcc, _emu_set_board_callbacks, _emu_set_serial_callback, _emu_serial_write, _emu_serial_read_buf, _emu_serial_read_idx, _emu_get_interrupt_active, _emu_dbg_state, _emu_dbg_run, _emu_dbg_halt, _emu_dbg_step, _emu_dbg_reset, _emu_dbg_tick, _emu_dbg_run_until_ns, _emu_dbg_set_bp_code, _emu_dbg_set_bp_yield, _emu_dbg_set_bp_write, _emu_dbg_clear_bp, _emu_dbg_read_mem, _emu_dbg_write_mem, _emu_dbg_pc, _emu_dbg_acc, _emu_dbg_b, _emu_dbg_dptr, _emu_dbg_sp, _emu_dbg_psw, _emu_dbg_rn, _emu_dbg_bw_ms, _emu_dbg_task_state, _emu_dbg_task_until, _emu_dbg_set_bw_ms_addr, _emu_dbg_set_task, _emu_dbg_set_on_halt, _emu_dbg_profile_start, _emu_dbg_profile_stop, _emu_dbg_profile_get, _emu_dbg_profile_total, _emu_pin_history_enable, _emu_pin_history_count, _emu_pin_history_head, _emu_pin_history_get, _emu_pin_event_size, _emu_serial2_write, _emu_set_serial2_callback, _emu_dbg_consumes_count, _emu_capabilities, _emu_version, _free, _malloc, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, memory, __indirect_function_table, wasmMemory, wasmTable;
      function assignWasmExports(wasmExports) {
        _emu_init = Module["_emu_init"] = wasmExports["emu_init"];
        _emu_reset = Module["_emu_reset"] = wasmExports["emu_reset"];
        _emu_set_part = Module["_emu_set_part"] = wasmExports["emu_set_part"];
        _emu_get_flash_size = Module["_emu_get_flash_size"] = wasmExports["emu_get_flash_size"];
        _emu_get_xram_size = Module["_emu_get_xram_size"] = wasmExports["emu_get_xram_size"];
        _emu_tick = Module["_emu_tick"] = wasmExports["emu_tick"];
        _emu_run = Module["_emu_run"] = wasmExports["emu_run"];
        _emu_load_hex = Module["_emu_load_hex"] = wasmExports["emu_load_hex"];
        _emu_get_sfr = Module["_emu_get_sfr"] = wasmExports["emu_get_sfr"];
        _emu_set_sfr = Module["_emu_set_sfr"] = wasmExports["emu_set_sfr"];
        _emu_get_iram = Module["_emu_get_iram"] = wasmExports["emu_get_iram"];
        _emu_set_iram = Module["_emu_set_iram"] = wasmExports["emu_set_iram"];
        _emu_get_code = Module["_emu_get_code"] = wasmExports["emu_get_code"];
        _emu_get_xdata = Module["_emu_get_xdata"] = wasmExports["emu_get_xdata"];
        _emu_set_xdata = Module["_emu_set_xdata"] = wasmExports["emu_set_xdata"];
        _emu_get_pc = Module["_emu_get_pc"] = wasmExports["emu_get_pc"];
        _emu_set_pc = Module["_emu_set_pc"] = wasmExports["emu_set_pc"];
        _emu_disasm = Module["_emu_disasm"] = wasmExports["emu_disasm"];
        _emu_set_adc_input = Module["_emu_set_adc_input"] = wasmExports["emu_set_adc_input"];
        _emu_set_port_input = Module["_emu_set_port_input"] = wasmExports["emu_set_port_input"];
        _emu_set_fosc = Module["_emu_set_fosc"] = wasmExports["emu_set_fosc"];
        _emu_get_pin_mode = Module["_emu_get_pin_mode"] = wasmExports["emu_get_pin_mode"];
        _emu_get_pin_drive = Module["_emu_get_pin_drive"] = wasmExports["emu_get_pin_drive"];
        _emu_set_pin_input = Module["_emu_set_pin_input"] = wasmExports["emu_set_pin_input"];
        _emu_set_adc_voltage = Module["_emu_set_adc_voltage"] = wasmExports["emu_set_adc_voltage"];
        _emu_advance_to_ns = Module["_emu_advance_to_ns"] = wasmExports["emu_advance_to_ns"];
        _emu_get_time_ns_lo = Module["_emu_get_time_ns_lo"] = wasmExports["emu_get_time_ns_lo"];
        _emu_get_time_ns_hi = Module["_emu_get_time_ns_hi"] = wasmExports["emu_get_time_ns_hi"];
        _emu_set_vcc = Module["_emu_set_vcc"] = wasmExports["emu_set_vcc"];
        _emu_set_board_callbacks = Module["_emu_set_board_callbacks"] = wasmExports["emu_set_board_callbacks"];
        _emu_set_serial_callback = Module["_emu_set_serial_callback"] = wasmExports["emu_set_serial_callback"];
        _emu_serial_write = Module["_emu_serial_write"] = wasmExports["emu_serial_write"];
        _emu_serial_read_buf = Module["_emu_serial_read_buf"] = wasmExports["emu_serial_read_buf"];
        _emu_serial_read_idx = Module["_emu_serial_read_idx"] = wasmExports["emu_serial_read_idx"];
        _emu_get_interrupt_active = Module["_emu_get_interrupt_active"] = wasmExports["emu_get_interrupt_active"];
        _emu_dbg_state = Module["_emu_dbg_state"] = wasmExports["emu_dbg_state"];
        _emu_dbg_run = Module["_emu_dbg_run"] = wasmExports["emu_dbg_run"];
        _emu_dbg_halt = Module["_emu_dbg_halt"] = wasmExports["emu_dbg_halt"];
        _emu_dbg_step = Module["_emu_dbg_step"] = wasmExports["emu_dbg_step"];
        _emu_dbg_reset = Module["_emu_dbg_reset"] = wasmExports["emu_dbg_reset"];
        _emu_dbg_tick = Module["_emu_dbg_tick"] = wasmExports["emu_dbg_tick"];
        _emu_dbg_run_until_ns = Module["_emu_dbg_run_until_ns"] = wasmExports["emu_dbg_run_until_ns"];
        _emu_dbg_set_bp_code = Module["_emu_dbg_set_bp_code"] = wasmExports["emu_dbg_set_bp_code"];
        _emu_dbg_set_bp_yield = Module["_emu_dbg_set_bp_yield"] = wasmExports["emu_dbg_set_bp_yield"];
        _emu_dbg_set_bp_write = Module["_emu_dbg_set_bp_write"] = wasmExports["emu_dbg_set_bp_write"];
        _emu_dbg_clear_bp = Module["_emu_dbg_clear_bp"] = wasmExports["emu_dbg_clear_bp"];
        _emu_dbg_read_mem = Module["_emu_dbg_read_mem"] = wasmExports["emu_dbg_read_mem"];
        _emu_dbg_write_mem = Module["_emu_dbg_write_mem"] = wasmExports["emu_dbg_write_mem"];
        _emu_dbg_pc = Module["_emu_dbg_pc"] = wasmExports["emu_dbg_pc"];
        _emu_dbg_acc = Module["_emu_dbg_acc"] = wasmExports["emu_dbg_acc"];
        _emu_dbg_b = Module["_emu_dbg_b"] = wasmExports["emu_dbg_b"];
        _emu_dbg_dptr = Module["_emu_dbg_dptr"] = wasmExports["emu_dbg_dptr"];
        _emu_dbg_sp = Module["_emu_dbg_sp"] = wasmExports["emu_dbg_sp"];
        _emu_dbg_psw = Module["_emu_dbg_psw"] = wasmExports["emu_dbg_psw"];
        _emu_dbg_rn = Module["_emu_dbg_rn"] = wasmExports["emu_dbg_rn"];
        _emu_dbg_bw_ms = Module["_emu_dbg_bw_ms"] = wasmExports["emu_dbg_bw_ms"];
        _emu_dbg_task_state = Module["_emu_dbg_task_state"] = wasmExports["emu_dbg_task_state"];
        _emu_dbg_task_until = Module["_emu_dbg_task_until"] = wasmExports["emu_dbg_task_until"];
        _emu_dbg_set_bw_ms_addr = Module["_emu_dbg_set_bw_ms_addr"] = wasmExports["emu_dbg_set_bw_ms_addr"];
        _emu_dbg_set_task = Module["_emu_dbg_set_task"] = wasmExports["emu_dbg_set_task"];
        _emu_dbg_set_on_halt = Module["_emu_dbg_set_on_halt"] = wasmExports["emu_dbg_set_on_halt"];
        _emu_dbg_profile_start = Module["_emu_dbg_profile_start"] = wasmExports["emu_dbg_profile_start"];
        _emu_dbg_profile_stop = Module["_emu_dbg_profile_stop"] = wasmExports["emu_dbg_profile_stop"];
        _emu_dbg_profile_get = Module["_emu_dbg_profile_get"] = wasmExports["emu_dbg_profile_get"];
        _emu_dbg_profile_total = Module["_emu_dbg_profile_total"] = wasmExports["emu_dbg_profile_total"];
        _emu_pin_history_enable = Module["_emu_pin_history_enable"] = wasmExports["emu_pin_history_enable"];
        _emu_pin_history_count = Module["_emu_pin_history_count"] = wasmExports["emu_pin_history_count"];
        _emu_pin_history_head = Module["_emu_pin_history_head"] = wasmExports["emu_pin_history_head"];
        _emu_pin_history_get = Module["_emu_pin_history_get"] = wasmExports["emu_pin_history_get"];
        _emu_pin_event_size = Module["_emu_pin_event_size"] = wasmExports["emu_pin_event_size"];
        _emu_serial2_write = Module["_emu_serial2_write"] = wasmExports["emu_serial2_write"];
        _emu_set_serial2_callback = Module["_emu_set_serial2_callback"] = wasmExports["emu_set_serial2_callback"];
        _emu_dbg_consumes_count = Module["_emu_dbg_consumes_count"] = wasmExports["emu_dbg_consumes_count"];
        _emu_capabilities = Module["_emu_capabilities"] = wasmExports["emu_capabilities"];
        _emu_version = Module["_emu_version"] = wasmExports["emu_version"];
        _free = Module["_free"] = wasmExports["free"];
        _malloc = Module["_malloc"] = wasmExports["malloc"];
        __emscripten_stack_restore = wasmExports["_emscripten_stack_restore"];
        __emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"];
        _emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"];
        memory = wasmMemory = wasmExports["memory"];
        __indirect_function_table = wasmTable = wasmExports["__indirect_function_table"];
      }
      var wasmImports = {
        emscripten_resize_heap: _emscripten_resize_heap
      };
      function run() {
        preRun();
        function doRun() {
          var _readyPromiseResolve, _Module$onRuntimeInit;
          Module["calledRun"] = true;
          if (ABORT) return;
          initRuntime();
          (_readyPromiseResolve = readyPromiseResolve) === null || _readyPromiseResolve === void 0 || _readyPromiseResolve(Module);
          (_Module$onRuntimeInit = Module["onRuntimeInitialized"]) === null || _Module$onRuntimeInit === void 0 || _Module$onRuntimeInit.call(Module);
          postRun();
        }
        if (Module["setStatus"]) {
          Module["setStatus"]("Running...");
          setTimeout(() => {
            setTimeout(() => Module["setStatus"](""), 1);
            doRun();
          }, 1);
        } else {
          doRun();
        }
      }
      var wasmExports;
      wasmExports = yield createWasm();
      run();
      if (runtimeInitialized) {
        moduleRtn = Module;
      } else {
        moduleRtn = new Promise((resolve, reject) => {
          readyPromiseResolve = resolve;
          readyPromiseReject = reject;
        });
      }
      ;
      return moduleRtn;
    }();
  });
})();
if (true) {
  module.exports = createEmu8051;
  module.exports["default"] = createEmu8051;
} else {}

/***/ }),

/***/ "?1b16":
/*!*************************!*\
  !*** node:fs (ignored) ***!
  \*************************/
/***/ (() => {

/* (ignored) */

/***/ })

}]);