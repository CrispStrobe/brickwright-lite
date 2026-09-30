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
# The argument-helper dependency is eliminated from a private prepared tree:
# call sites become explicit MicroPython API calls. The original checkout is
# unchanged, and no header with the old basename exists in the prepared tree.
# Contract-only component hashes are verified before conversion/compilation.
CONTRACT_MANIFEST_REL="contract-only/implementation.json"

SRC_DIR="${PYBRICKS_SRC_DIR:-$SCRIPT_DIR/out/pybricks-micropython}"
BUILD_DIR="${PYBRICKS_BUILD_DIR:-$SCRIPT_DIR/out/pybricks-wasm-build}"
EMSDK="${EMSDK:-$HOME/emsdk}"
WASM_DIR="$SCRIPT_DIR/firmware/pybricks-wasm"
DEST_DIR="$SCRIPT_DIR/overlay/scratch-gui/static/pybricks-sim"
MIN_AVAIL_MB=700

die()  { echo "FATAL: $*" >&2; exit 1; }
info() { echo ">>> $*"; }

if [[ -r /proc/meminfo ]]; then
  avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
else
  avail=$(python3 - <<'PYMEM'
import subprocess
import re
page = int(subprocess.check_output(["sysctl", "-n", "hw.pagesize"], text=True))
vm = subprocess.check_output(["vm_stat"], text=True)
counts = {k: int(v) for k, v in re.findall(r"^(Pages [^:]+):\s*(\d+)\.", vm, re.M)}
print((counts.get("Pages free", 0) + counts.get("Pages inactive", 0)) * page // (1024 * 1024))
PYMEM
)
fi
(( avail >= MIN_AVAIL_MB )) || die "Only ${avail} MB available (need >= ${MIN_AVAIL_MB}). Aborting to avoid OOM."
info "Memory OK: ${avail} MB available"

# ---------- source -----------------------------------------------------------

if [[ ! -e "$SRC_DIR/.git" ]]; then
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
python3 - "$WASM_DIR/$CONTRACT_MANIFEST_REL" "$WASM_DIR" <<'PYVERIFY'
import hashlib, json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
root = pathlib.Path(sys.argv[2])
for path, want in manifest["implementation_sha256"].items():
    got = hashlib.sha256((root / path).read_bytes()).hexdigest()
    if got != want:
        raise SystemExit(f"Contract-only implementation changed: {path}: {got} != {want}")
print("Contract-only implementation hashes verified")
PYVERIFY

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
python3 "$WASM_DIR/prepare_source.py" "$SRC_DIR" "$BUILD_DIR/source"
make -C "$WASM_DIR" -j1 PBTOP="$BUILD_DIR/source" UPSTREAM_PBTOP="$SRC_DIR" BUILD="$BUILD_DIR"

info "Licence gate over every file the compiler read"
python3 "$WASM_DIR/licence_gate.py" "$BUILD_DIR" "$BUILD_DIR/source" "$WASM_DIR" --toolchain-root "$EMSDK/upstream" --json "$BUILD_DIR/licence-gate.json" >"$BUILD_DIR/licence-gate.log"

python3 "$WASM_DIR/bundle_notices.py" "$BUILD_DIR/licence-gate.json" "$SCRIPT_DIR/overlay/scratch-gui/static/licenses/pybricks-micropython.MIT.txt" "$EMSDK/upstream"

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
    "dependency_elimination": {
        "removed_header": "pybricks/util_mp/pb_kwarg_helper.h",
        "strategy": "MIT caller sources converted to explicit MicroPython API calls; no replacement helper header",
        "caller_conversion": json.load(open("$BUILD_DIR/source/argument-conversion.json")),
        "contract_only_implementation": json.load(open("$WASM_DIR/$CONTRACT_MANIFEST_REL")),
        "numeric_components": ["contract-only/numeric_scale.c", "contract-only/integer_width.h"],
        "device_timing": "contract-only/device_timing.c",
    },
    "provenance_review": {
        "date": "2026-09-30",
        "status": "documented contract-only replacement; previous PR #508 remains unverified",
        "claim_scope": "fresh agent contexts, recorded input/tool restrictions and separate reviewer integration; no OS filesystem jail or assertion about model training data",
        "old_replacement_compiled": False,
    },
    "not_included": ["pybricks/util_mp/pb_kwarg_helper.h", "pybricks/iodevices/pb_type_iodevices_xbox_controller.c", "lib/btstack", "lib/ble5stack", "lib/BlueNRG-MS", "lib/STM32_USB_Device_Library",
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
echo "  pybricks-hub.js   : $(wc -c < "$DEST_DIR/pybricks-hub.js") bytes  sha256 $js_sha"
echo "  pybricks-hub.wasm : $(wc -c < "$DEST_DIR/pybricks-hub.wasm") bytes  sha256 $wasm_sha"
echo "============================================"
info "Installed into $DEST_DIR"
