#!/usr/bin/env bash
#
# build-pybricks-wasm.sh — Reproducible build of the SPIKE Prime simulator:
# Pybricks MicroPython compiled to WebAssembly on Brickwright's wasm HAL.
#
# Same pattern as build-mbit-debug-fw.sh (the micro:bit simulator): a pinned
# upstream MicroPython firmware, built with emscripten, run one layer above
# the chip. No chip emulation, no vendor blobs: no Bluetooth stack, no LEGO
# firmware, no ST/TI HAL. firmware/pybricks-wasm/licence_gate.py proves that
# from the compiler's own dependency files on every build.
#
# Requirements:
#   - git, make, python3 (MicroPython's qstr/codegen scripts), sha256sum
#   - emsdk checkout at $EMSDK (default ~/emsdk). This script installs and
#     activates the pinned version itself; no Docker.
#
# Produces (copied into the app):
#   overlay/scratch-gui/static/pybricks-sim/pybricks-hub.js
#   overlay/scratch-gui/static/pybricks-sim/pybricks-hub.wasm
#   overlay/scratch-gui/static/pybricks-sim/PROVENANCE.json
#
# Memory: every compile is -j1 (peak well under 1 GB).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------- pins -------------------------------------------------------------

PYBRICKS_REPO="https://github.com/pybricks/pybricks-micropython.git"
PYBRICKS_TAG="v4.0.1"
PYBRICKS_SHA="4104553405decb0384bcfb030fbfcb4b5a9854cc"
# The only submodule the build reads: Pybricks' MicroPython fork.
MICROPYTHON_SHA="13580b6ad057173f62e8b2363e01d6851bcc6699"
EMSDK_VERSION="6.0.6"
# Clean-room, MIT-only replacement for pybricks/util_mp/pb_kwarg_helper.h,
# whose upstream copy is tagged MIT AND CC-BY-SA-4.0 (macros adapted from
# Stack Overflow). Written without reading that file, from its MIT call sites
# and MicroPython's mp_arg_parse_all API, and offered to Pybricks upstream.
# The Makefile puts upstream-overlay/ ahead of the Pybricks tree, so the
# compiler never opens the upstream header; the licence gate checks that.
# Drop this once a pinned Pybricks release ships an MIT-only header.
KWARG_OVERLAY_REL="upstream-overlay/pybricks/util_mp/pb_kwarg_helper.h"
KWARG_OVERLAY_SHA256="3e47942a39a7191647cc169e4e1aa72ed9570e4a1f5f846067d17b4c7010ca10"
# The other Stack Overflow (CC BY-SA 4.0) piece: the body of
# pbio_int_math_mult_then_div() in lib/pbio/src/int_math.c. The Makefile
# compiles int_math.c with that function removed (strip_function.py) and this
# stand-in, written from the documented contract and Pybricks' own test.
INTMATH_OVERLAY_REL="upstream-overlay/lib/pbio/src/int_math_mult_then_div.c"
INTMATH_OVERLAY_SHA256="16774c6fb7b901cec9e1949a9adf73277669c8cf2a57a95c044d2692d677ac34"

SRC_DIR="${PYBRICKS_SRC_DIR:-$SCRIPT_DIR/out/pybricks-micropython}"
BUILD_DIR="${PYBRICKS_BUILD_DIR:-$SCRIPT_DIR/out/pybricks-wasm-build}"
EMSDK="${EMSDK:-$HOME/emsdk}"
WASM_DIR="$SCRIPT_DIR/firmware/pybricks-wasm"
DEST_DIR="$SCRIPT_DIR/overlay/scratch-gui/static/pybricks-sim"
MIN_AVAIL_MB=700

die()  { echo "FATAL: $*" >&2; exit 1; }
info() { echo ">>> $*"; }

avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
(( avail >= MIN_AVAIL_MB )) || die "Only ${avail} MB available (need >= ${MIN_AVAIL_MB}). Aborting to avoid OOM."
info "Memory OK: ${avail} MB available"

# ---------- source -----------------------------------------------------------

if [[ ! -d "$SRC_DIR/.git" ]]; then
  info "Cloning $PYBRICKS_REPO"
  git clone --filter=blob:none --no-checkout "$PYBRICKS_REPO" "$SRC_DIR"
fi
git -C "$SRC_DIR" fetch --quiet --tags origin "$PYBRICKS_TAG" || true
git -C "$SRC_DIR" checkout --quiet --detach "$PYBRICKS_SHA"
# Only the MicroPython submodule. Bluetooth stacks and vendor libraries
# (btstack, STM32 USB, umm_malloc) are deliberately never checked out.
git -C "$SRC_DIR" submodule update --init --quiet micropython

head_sha=$(git -C "$SRC_DIR" rev-parse HEAD)
mp_sha=$(git -C "$SRC_DIR/micropython" rev-parse HEAD)
tag_sha=$(git -C "$SRC_DIR" rev-parse "refs/tags/$PYBRICKS_TAG^{commit}" 2>/dev/null || echo missing)
[[ "$head_sha" == "$PYBRICKS_SHA" ]] || die "pybricks-micropython HEAD $head_sha != pinned $PYBRICKS_SHA"
[[ "$tag_sha" == "$PYBRICKS_SHA" ]] || die "tag $PYBRICKS_TAG resolves to $tag_sha, not $PYBRICKS_SHA"
[[ "$mp_sha" == "$MICROPYTHON_SHA" ]] || die "micropython submodule $mp_sha != pinned $MICROPYTHON_SHA"
[[ -z "$(git -C "$SRC_DIR" status --porcelain --untracked-files=no)" ]] || die "pybricks-micropython tree is modified"
[[ -z "$(git -C "$SRC_DIR/micropython" status --porcelain --untracked-files=no)" ]] || die "micropython tree is modified"
grep -q "^MIT License" "$SRC_DIR/LICENSE" || die "pybricks-micropython LICENSE is not MIT"
grep -q "The MIT License (MIT)" "$SRC_DIR/micropython/LICENSE" || die "micropython LICENSE is not MIT"
info "Source verified: pybricks-micropython $PYBRICKS_TAG ($head_sha), micropython $mp_sha"
for pair in "$KWARG_OVERLAY_REL=$KWARG_OVERLAY_SHA256" "$INTMATH_OVERLAY_REL=$INTMATH_OVERLAY_SHA256"; do
  rel=${pair%%=*}; want=${pair#*=}
  got=$(sha256sum "$WASM_DIR/$rel" | awk '{print $1}')
  [[ "$got" == "$want" ]] || die "$rel sha256 $got != pinned $want"
  info "Overlay verified: $rel ($got)"
done

# ---------- toolchain --------------------------------------------------------

[[ -x "$EMSDK/emsdk" ]] || die "emsdk not found at $EMSDK"
"$EMSDK/emsdk" install "$EMSDK_VERSION" >/dev/null
"$EMSDK/emsdk" activate "$EMSDK_VERSION" >/dev/null
# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
emcc_version=$(emcc --version | head -1)
[[ "$emcc_version" == *" $EMSDK_VERSION "* ]] || die "emcc is not $EMSDK_VERSION: $emcc_version"
info "Toolchain: $emcc_version"

# ---------- build ------------------------------------------------------------

rm -rf "$BUILD_DIR"
make -C "$WASM_DIR" -j1 PBTOP="$SRC_DIR" BUILD="$BUILD_DIR"

info "Licence gate over every file the compiler read"
python3 "$WASM_DIR/licence_gate.py" "$BUILD_DIR" "$SRC_DIR" "$WASM_DIR" --json "$BUILD_DIR/licence-gate.json" >/dev/null

# ---------- install + provenance ---------------------------------------------

mkdir -p "$DEST_DIR"
cp "$BUILD_DIR/pybricks-hub.js" "$BUILD_DIR/pybricks-hub.wasm" "$DEST_DIR/"
js_sha=$(sha256sum "$DEST_DIR/pybricks-hub.js" | awk '{print $1}')
wasm_sha=$(sha256sum "$DEST_DIR/pybricks-hub.wasm" | awk '{print $1}')
python3 - "$DEST_DIR/PROVENANCE.json" "$BUILD_DIR/licence-gate.json" <<EOF
import json, sys
gate = json.load(open(sys.argv[2]))
json.dump({
    "what": "Pybricks MicroPython (SPIKE Prime hub API) compiled to WebAssembly on the Brickwright wasm HAL",
    "recipe": "build-pybricks-wasm.sh",
    "upstream": {
        "pybricks-micropython": {"repo": "$PYBRICKS_REPO", "tag": "$PYBRICKS_TAG", "commit": "$PYBRICKS_SHA", "license": "MIT"},
        "micropython": {"repo": "https://github.com/pybricks/micropython", "commit": "$MICROPYTHON_SHA", "license": "MIT"},
    },
    "toolchain": {"emsdk": "$EMSDK_VERSION", "emcc": "$emcc_version"},
    "brickwright_sources": "firmware/pybricks-wasm (HAL, platform, Makefile)",
    "upstream_overlay": {
        "pybricks/util_mp/pb_kwarg_helper.h": {
            "path": "firmware/pybricks-wasm/$KWARG_OVERLAY_REL",
            "sha256": "$KWARG_OVERLAY_SHA256",
            "license": "MIT",
            "why": "clean-room replacement for the upstream header tagged MIT AND CC-BY-SA-4.0; the upstream copy is not compiled",
        },
        "lib/pbio/src/int_math.c": {
            "path": "firmware/pybricks-wasm/$INTMATH_OVERLAY_REL",
            "sha256": "$INTMATH_OVERLAY_SHA256",
            "license": "BSD-3-Clause",
            "why": "int_math.c is compiled with pbio_int_math_mult_then_div() removed (its body is adapted from a CC BY-SA 4.0 Stack Overflow answer) and this stand-in in its place",
        },
    },
    "not_included": ["lib/btstack", "lib/ble5stack", "lib/BlueNRG-MS", "lib/STM32_USB_Device_Library",
                     "lib/umm_malloc", "lib/lsm6ds3tr_c_STdC", "lib/tiam1808", "LEGO firmware", "TI Bluetooth patch"],
    "licence_gate": gate,
    "assets": {
        "pybricks-hub.js": {"sha256": "$js_sha"},
        "pybricks-hub.wasm": {"sha256": "$wasm_sha"},
    },
}, open(sys.argv[1], "w"), indent=2)
open(sys.argv[1], "a").write("\n")
EOF

echo ""
echo "============================================"
echo "  pybricks-hub.js   : $(stat -c%s "$DEST_DIR/pybricks-hub.js") bytes  sha256 $js_sha"
echo "  pybricks-hub.wasm : $(stat -c%s "$DEST_DIR/pybricks-hub.wasm") bytes  sha256 $wasm_sha"
echo "============================================"
info "Installed into $DEST_DIR"
