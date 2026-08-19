# micro:bit Debug Firmware Build Environment

Reproducible build for the micro:bit MicroPython-v2 simulator firmware,
specifically the **settrace-enabled debug variant** needed by the line-level
debugger.

## Prerequisites

- Linux x86_64 (tested on Ubuntu 24.04)
- Docker with image `emscripten/emsdk:3.1.25` pulled
- Source tree: `micropython-microbit-v2-simulator` (commit `07b1ed7`) cloned
  with `--recursive` at `../mbit-fw-src` relative to this directory

## Why this specific toolchain?

The simulator source (2022 vintage) builds **only** with Emscripten 3.1.25 +
Python 3.8. Newer Emscripten or Python versions break MicroPython's
`makeqstrdefs` at the `emcc -E` preprocessing step. The official Docker image
`emscripten/emsdk:3.1.25` bundles both.

## Quick start

```bash
# One-time setup
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo docker pull emscripten/emsdk:3.1.25
git clone --recursive https://github.com/microbit-foundation/micropython-microbit-v2-simulator ../mbit-fw-src

# Build
./build-mbit-debug-fw.sh
```

## Output

| File | Description |
|------|-------------|
| `out/fw-off.wasm` | Stock firmware (~1,245,599 B) |
| `out/fw-on.wasm` | Settrace-enabled debug firmware (~1,259,735 B) |
| `out/firmware.js` | Emscripten glue (identical for both variants) |

The settrace variant enables `MICROPY_PY_SYS_SETTRACE`,
`MICROPY_PERSISTENT_CODE_SAVE`, and disables `MICROPY_COMP_CONST` (required
for settrace to work).

## Memory safety

All `emcc` builds use `-j1` to cap peak memory at ~1.5 GB. The script checks
available memory before starting and stops the Docker daemon after building to
free ~400 MB RSS.
