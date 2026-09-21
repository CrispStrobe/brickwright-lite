#!/usr/bin/env bash
# Build NQC (MPL-2.0) to WebAssembly.
# Requires: emscripten (emcc/em++), a native C++ compiler, bison, flex, make.
set -euo pipefail
SRC=${SRC:-$PWD/nqc}          # path to a clone of https://github.com/jverne/nqc
OUT=${OUT:-$PWD/dist}
cd "$SRC"

# --- Step 1: host-side code generation (must be NATIVE, not emcc) --------
# parse.cpp/parse.tab.h come from bison, lexer.cpp from flex; the *_nqh.h
# headers and rcxnub.h are produced by bin/mkdata, a HOST tool that must run.
make bin
make bin/mkdata                # native c++
make nqh nub                   # runs bin/mkdata -> compiler/rcx{1,2}_nqh.h, rcxlib/rcxnub.h
make compiler/parse.cpp compiler/lexer.cpp

# --- Step 2: compile every translation unit with em++ --------------------
# Overrides vs. the stock Makefile:
#   CXX=em++            (Makefile hardcodes c++ on Darwin; cmdline wins)
#   LIBS=               (drop -framework IOKit/CoreFoundation)
#   USBOBJ=RCX_USBTowerPipe_none    (no USB tower)
#   POBJS=... PSerial_none ...      (no serial port; replaces PSerial_unix)
rm -f ./*/*.o
make -j8 CXX=em++ LIBS= \
     USBOBJ=RCX_USBTowerPipe_none \
     POBJS="PStream PSerial_none PHashTable PListS PDebug" \
     bin/nqc

# --- Step 3: link as a reusable WASM module ------------------------------
mkdir -p "$OUT"
em++ -O3 -o "$OUT/nqc.js" nqc/*.o compiler/*.o rcxlib/*.o platform/*.o \
  -sMODULARIZE=1 -sEXPORT_NAME=createNQC \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain \
  -sALLOW_MEMORY_GROWTH=1 \
  -sENVIRONMENT=web,worker,node     # use "web,worker" for a browser-only build
ls -la "$OUT"

# --- Step 4: make the UMD glue importable as an ES module ----------------
# Emscripten's MODULARIZE output is UMD: it assigns to `module.exports` or
# calls `define`, and in a browser's module scope it does NEITHER, so a bare
# `import()` of it resolves to an empty namespace. One appended line fixes
# that without touching the generated body, and Node still gets the CommonJS
# shape by evaluating the same source with this line stripped — which is what
# makes the test suite drive the byte-identical program the browser runs.
# Same treatment, same reason, as src/lib/smallerc-wasm.
printf '\nexport default createNQC;\n' >> "$OUT/nqc.js"
