#!/usr/bin/env bash
#
# build-mbit-debug-fw.sh — Reproducible micro:bit MicroPython-v2 simulator
# firmware build (stock + settrace-enabled debug variant).
#
# Requirements:
#   - Docker with image emscripten/emsdk:3.1.25 pulled
#   - Docker image store on /mnt/volume1 (data-root: /mnt/volume1/docker)
#     to keep the system disk free — see /etc/docker/daemon.json
#   - Source tree at SRC_DIR (default: sibling mbit-fw-src)
#
# Produces:
#   ./out/fw-off.wasm   — stock firmware
#   ./out/fw-on.wasm    — settrace-enabled debug firmware (firmware-debug.wasm)
#   ./out/firmware.js   — emscripten glue (identical for both variants)
#
# Memory safety: all emcc builds use -j1 to stay within ~1.5 GB peak.
# Docker is started before the build and stopped after to free ~400 MB RSS.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="${SRC_DIR:-$(dirname "$SCRIPT_DIR")/mbit-fw-src}"
OUT_DIR="${SCRIPT_DIR}/out"
IMAGE="emscripten/emsdk:3.1.25"
MIN_AVAIL_MB=300

# ---------- helpers ----------------------------------------------------------

die()  { echo "FATAL: $*" >&2; exit 1; }
info() { echo ">>> $*"; }

check_mem() {
  local avail
  avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
  if (( avail < MIN_AVAIL_MB )); then
    die "Only ${avail} MB available (need ≥${MIN_AVAIL_MB}). Aborting to avoid OOM."
  fi
  info "Memory OK: ${avail} MB available"
}

# ---------- pre-flight -------------------------------------------------------

[[ -d "$SRC_DIR/src" ]] || die "Source tree not found at $SRC_DIR"
mkdir -p "$OUT_DIR"
command -v docker >/dev/null 2>&1 || die "Docker not installed"

# Start Docker if not running
if ! sudo docker info >/dev/null 2>&1; then
  info "Starting Docker daemon…"
  sudo systemctl start docker
  sleep 2
fi

check_mem

# ---------- build inside container -------------------------------------------

info "Building firmware (stock + settrace) inside $IMAGE …"

sudo docker run --rm \
  -v "${SRC_DIR}:/src" \
  -v "${OUT_DIR}:/out" \
  -w /src \
  "$IMAGE" bash -c '
set -euo pipefail

echo "=== [1/6] Patch Makefile: drop simulator-js prereq ==="
sed -i "s| simulator-js||" src/Makefile

echo "=== [2/6] Warm emscripten sysroot cache (single-threaded) ==="
echo "int main(void){return 0;}" > /tmp/w.c
emcc -O3 -c /tmp/w.c -o /tmp/w.o

echo "=== [3/6] Build mpy-cross (host, -j2) ==="
make -C lib/micropython-microbit-v2/lib/micropython/mpy-cross -j2

echo "=== [4/6] Backup pristine config ==="
cp src/mpconfigport.h /tmp/pristine.h

echo "=== [5/6] Build stock (OFF) firmware (-j1) ==="
make -C src clean
make -C src -j1
cp src/build/firmware.wasm /out/fw-off.wasm
cp src/build/firmware.js   /out/firmware.js

echo "=== [6/6] Build settrace (ON) firmware (-j1) ==="
cp /tmp/pristine.h src/mpconfigport.h
sed -i "s|#define MICROPY_ENABLE_SOURCE_LINE              (1)|#define MICROPY_ENABLE_SOURCE_LINE              (1)\n#define MICROPY_PY_SYS_SETTRACE                 (1)\n#define MICROPY_PERSISTENT_CODE_SAVE            (1)\n#define MICROPY_COMP_CONST                      (0)|" src/mpconfigport.h
make -C src clean
make -C src -j1
cp src/build/firmware.wasm /out/fw-on.wasm

echo "=== Restore pristine config ==="
cp /tmp/pristine.h src/mpconfigport.h

echo "=== DONE ==="
'

# ---------- validate ---------------------------------------------------------

info "Build complete. Validating…"

OFF_SIZE=$(stat -c%s "$OUT_DIR/fw-off.wasm")
ON_SIZE=$(stat -c%s "$OUT_DIR/fw-on.wasm")
DELTA=$((ON_SIZE - OFF_SIZE))
ON_SHA=$(sha256sum "$OUT_DIR/fw-on.wasm" | awk '{print $1}')

OFF_GZ=$(gzip -c "$OUT_DIR/fw-off.wasm" | wc -c)
ON_GZ=$(gzip -c "$OUT_DIR/fw-on.wasm" | wc -c)
DELTA_GZ=$((ON_GZ - OFF_GZ))

echo ""
echo "============================================"
echo "  fw-off.wasm : ${OFF_SIZE} bytes"
echo "  fw-on.wasm  : ${ON_SIZE} bytes  (sha256: ${ON_SHA})"
echo "  delta raw   : +${DELTA} bytes"
echo "  delta gzip  : +${DELTA_GZ} bytes"
echo "============================================"
echo ""

# Sanity check: fw-on.wasm should be ~1,259,735 ± a few hundred bytes
if (( ON_SIZE < 1250000 || ON_SIZE > 1270000 )); then
  echo "WARNING: fw-on.wasm size ${ON_SIZE} outside expected range [1,250,000 – 1,270,000]"
else
  info "Size validation PASSED (within expected range)"
fi

# ---------- cleanup ----------------------------------------------------------

info "Stopping Docker daemon to free RAM…"
sudo systemctl stop docker

info "All done. Debug firmware: ${OUT_DIR}/fw-on.wasm"
