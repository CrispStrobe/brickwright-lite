#!/usr/bin/env bash
#
# Build SmallerC (smlrpp + smlrc) to WebAssembly.
#
# WHY THIS SCRIPT EXISTS IN-TREE, unlike the SDCC build:
#   SDCC needs a full autotools cross-compile and was built by a GitHub Actions
#   workflow in another repo, then vendored. SmallerC needs neither: the core
#   compiler is one translation unit and the preprocessor is eight, so the whole
#   build is two emcc invocations and runs anywhere emcc is on PATH. Keeping it
#   here means the vendored artifact is reproducible by the person reading it.
#
# Usage:  ./build.sh [--src <smallerc-checkout>] [--out <dir>]
# Requires: emcc on PATH (see EMSCRIPTEN_VERSION below), git, python3.
#
set -euo pipefail

# --- Pinned inputs -----------------------------------------------------------
# The upstream commit is pinned by full SHA, not by a branch or tag: SmallerC
# has no release tarball, so the commit IS the version. Any change here must be
# accompanied by a re-run of the acceptance suite (see BUILD-INFO.md).
SMALLERC_REPO="https://github.com/alexfru/SmallerC.git"
SMALLERC_COMMIT="1865d79ce7a5ad3f8a9515a571437cee084b8b1d"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/dist"
SRC=""

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v emcc >/dev/null || { echo "emcc not on PATH; source emsdk_env.sh first" >&2; exit 1; }

# --- Source ------------------------------------------------------------------
if [ -z "$SRC" ]; then
  SRC="$(mktemp -d)/SmallerC"
  git clone --quiet "$SMALLERC_REPO" "$SRC"
  git -C "$SRC" checkout --quiet "$SMALLERC_COMMIT"
fi
HAVE="$(git -C "$SRC" rev-parse HEAD)"
if [ "$HAVE" != "$SMALLERC_COMMIT" ]; then
  echo "source tree is at $HAVE, expected $SMALLERC_COMMIT" >&2; exit 1
fi
V="$SRC/v0100"

# --- Link flags --------------------------------------------------------------
# STACK_SIZE is the flag that matters. Emscripten's default stack has been
# 64 KiB since emsdk 3.1.27, and smlrc is a recursive-descent parser: at 17
# levels of nested `if` the 64 KiB build stops matching native and reports a
# bogus "Undeclared identifier" for a variable declared at the top of the
# function. It is not a crash and not a stack-overflow message, which is what
# makes it dangerous. STACK_OVERFLOW_CHECK=1 turns any future overrun into a
# loud abort instead of a wrong answer. Measurements are in BUILD-INFO.md.
#
# EXIT_RUNTIME=1 is the second flag that matters, and it is not optional.
# ucpp (smlrpp) writes its output through stdio and relies on the flush that
# happens at exit; with EXIT_RUNTIME=0 that flush never runs, so smlrpp exits 0
# and leaves a ZERO-BYTE .i behind. smlrc then "succeeds" on an empty
# translation unit and emits a well-formed `bits 16` file containing no code --
# a failure that looks exactly like a pass. compiler.js additionally refuses
# empty preprocessor output so this cannot regress silently.
#
# Deliberately NOT set: -pthread (no SharedArrayBuffer requirement, so the app
# needs no cross-origin isolation headers) and any -g level (debug info would
# multiply the artifact size for no browser benefit).
COMMON=(
  -O2 -w -g0
  -sMODULARIZE=1
  -sEXPORTED_RUNTIME_METHODS=FS
  -sFORCE_FILESYSTEM=1
  -sALLOW_MEMORY_GROWTH=1
  -sSTACK_SIZE=8388608
  -sSTACK_OVERFLOW_CHECK=1
  -sINVOKE_RUN=1
  -sEXIT_RUNTIME=1
)

mkdir -p "$OUT"

# --- smlrc: the core compiler, C -> NASM ------------------------------------
# Single translation unit. cgx86.c and fp.c are #included by smlrc.c itself.
emcc "${COMMON[@]}" -sEXPORT_NAME=createSmlrc \
  "$V/smlrc.c" -o "$OUT/smlrc.js"

# --- smlrpp: the preprocessor (ucpp) ----------------------------------------
# Needed because smlrc's built-in preprocessor handles only object-like
# #define, #include, #ifdef/#ifndef/#else/#endif, #undef and #line. It rejects
# function-like macros, #if <expr>, #elif, #pragma and #error -- all of which
# ordinary C uses. See BUILD-INFO.md for the measured boundary.
emcc "${COMMON[@]}" -sEXPORT_NAME=createSmlrpp \
  -DSTAND_ALONE -DUCPP_CONFIG \
  "$V/ucpp/arith.c" "$V/ucpp/assert.c" "$V/ucpp/cpp.c" "$V/ucpp/eval.c" \
  "$V/ucpp/lexer.c" "$V/ucpp/macro.c" "$V/ucpp/mem.c" "$V/ucpp/nhash.c" \
  -o "$OUT/smlrpp.js"

# --- ES-module export -------------------------------------------------------
# Same post-processing as the SDCC build: the browser loads these through a
# webpack-ignored dynamic import(), which needs a default export. The generated
# program and the WASM bytes are untouched; only this one line is appended.
# compiler.js strips it again when running the identical source under Node.
for name in smlrc smlrpp; do
  export_name="create$(python3 -c "print('$name'.capitalize())")"
  grep -q "^export default $export_name;" "$OUT/$name.js" \
    || printf '\nexport default %s;\n' "$export_name" >> "$OUT/$name.js"
done

# --- Freestanding headers ---------------------------------------------------
# Only the headers that are pure declarations and need NO runtime. SmallerC
# also ships stdio.h/stdlib.h/string.h/math.h, and those are deliberately
# EXCLUDED: this path has no libc and no linker, so `#include <stdio.h>`
# would compile happily and then die much later with an undefined _printf.
# Failing at the #include, where the learner can see why, is the kinder error.
#
# These are inlined into a JS module rather than fetched as a JSON pack (the
# way the much larger SDCC runtime is): 7 KB of text costs nothing to bundle,
# and it keeps the compiler free of any network fetch at all.
python3 - "$V/include" "$OUT/headers.js" <<'PYGEN'
import json, sys, os
inc, out = sys.argv[1], sys.argv[2]
NAMES = ["stddef.h", "stdint.h", "limits.h", "float.h", "iso646.h", "stdarg.h"]
files = {}
for n in NAMES:
    with open(os.path.join(inc, n), encoding="utf-8") as fh:
        files[n] = fh.read()
with open(out, "w", encoding="utf-8") as fh:
    fh.write("// GENERATED by build.sh from SmallerC v0100/include -- do not edit.\n")
    fh.write("// SmallerC is BSD-2-Clause, (c) 2012-2021 Alexey Frunze; see\n")
    fh.write("// static/licenses/smallerc.BSD-2-Clause.txt and THIRD-PARTY-NOTICES.md.\n")
    fh.write("// Freestanding headers only: this path ships no libc, so the hosted\n")
    fh.write("// headers (stdio/stdlib/string/math) are intentionally not here.\n")
    fh.write("export const HEADERS = Object.freeze(")
    fh.write(json.dumps(files, indent=4, sort_keys=True))
    fh.write(");\nexport default HEADERS;\n")
print("headers.js: %d headers" % len(files))
PYGEN

# --- Assert no debug sections survived --------------------------------------
# The SDCC build once shipped 11 MB of DWARF because a make-time flag put -ggdb
# ahead of what configure was handed. Cheap to check, so check.
for w in "$OUT/smlrc.wasm" "$OUT/smlrpp.wasm"; do
  if command -v llvm-objdump >/dev/null && llvm-objdump -h "$w" 2>/dev/null | grep -q '\.debug_'; then
    echo "debug sections survived in $w" >&2; exit 1
  fi
done

echo "emcc: $(emcc --version | head -1)"
echo "SmallerC commit: $SMALLERC_COMMIT"
ls -l "$OUT"/smlrc.js "$OUT"/smlrc.wasm "$OUT"/smlrpp.js "$OUT"/smlrpp.wasm "$OUT"/headers.js
