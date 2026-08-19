# micro:bit Firmware Provenance

Reproducibility audit of the two MicroPython→WASM firmwares that
brickwright-lite vendors for the micro:bit simulator.

## Toolchain

| Component | Version | Why pinned |
|-----------|---------|------------|
| Emscripten | 3.1.25 | Only emsdk that builds this 2022 MicroPython source |
| Python | 3.8 (bundled in image) | Newer Python breaks `makeqstrdefs` at `emcc -E` |
| Docker image | `emscripten/emsdk:3.1.25` | Bundles both; runs native on x86_64 |

Source: `micropython-microbit-v2-simulator` commit `07b1ed7` (with `--recursive`
submodules).

## Build invocation

```bash
# Prerequisite: sed -i "s| simulator-js||" src/Makefile
# Prerequisite: warm emscripten cache single-threaded to avoid race:
#   echo "int main(void){return 0;}" > /tmp/w.c && emcc -O3 -c /tmp/w.c -o /tmp/w.o
# Prerequisite: make -C lib/micropython-microbit-v2/lib/micropython/mpy-cross -j2

# STOCK (OFF) build — no config changes:
make -C src clean && make -C src -j1

# SETTRACE (ON) build — three defines in src/mpconfigport.h after MICROPY_ENABLE_SOURCE_LINE:
#   #define MICROPY_PY_SYS_SETTRACE        (1)
#   #define MICROPY_PERSISTENT_CODE_SAVE    (1)
#   #define MICROPY_COMP_CONST              (0)
make -C src clean && make -C src -j1
```

Full automated script: `build-mbit-debug-fw.sh` (Docker-wrapped, memory-safe).

## Reproducibility results (2026-08-19, VPS x86_64)

### Debug firmware (settrace ON)

| | Vendored (`feat/microbit-settrace`) | VPS rebuild |
|---|---|---|
| **firmware.wasm** | 1,259,735 B | 1,259,735 B |
| **sha256** | `ec6e535b…a1a850` | `ec6e535b…a1a850` |
| **Match** | **BYTE-IDENTICAL** | |

Full sha256: `ec6e535b781323afa174fd4b5952a7ddde5a05e37ac13f1934b52aa9fba1a850`

Settrace delta vs stock: +14,136 B raw / +6,406 B gzipped (~1.18%).

### Stock firmware (OFF)

| | Vendored on `main` | VPS rebuild |
|---|---|---|
| **firmware.wasm** | 1,091,643 B | 1,245,599 B |
| **sha256** | `000728eb…1bdb8` | `59a40b89…61f17` |
| **Match** | **NO — ancient build, not from this source** | |

| | Vendored on `main` | VPS rebuild |
|---|---|---|
| **firmware.js** | 101,806 B | 107,189 B |
| **sha256** | `74bdaab6…25fd` | `600b4894…25fd` |
| **Match** | **NO — ancient build** | |

The vendored stock firmware on `main` is a much older build (154 KB smaller wasm,
5.4 KB smaller JS glue) that predates the current source pin. The VPS rebuild
from `07b1ed7` with `emscripten/emsdk:3.1.25` produces the correct replacement
(~1,245,599 B wasm / ~107,189 B JS). The user confirmed this replacement
"replaced the ancient vendored one that OOB'd on `for v in g():` task loops."

### Staged rebuild artifacts

Located at `out/` (gitignored):

| File | Size | sha256 |
|------|------|--------|
| `fw-off.wasm` | 1,245,599 B | `59a40b89c281ac40dac745d7de45075c3f394b8abc455cabbaf4b114e9a61f17` |
| `fw-on.wasm` | 1,259,735 B | `ec6e535b781323afa174fd4b5952a7ddde5a05e37ac13f1934b52aa9fba1a850` |
| `firmware.js` | 107,189 B | `600b489a4879452617229136036453ca17abe5822c31cac364c8a7219bcd25fd` |

The main session should fold `fw-off.wasm` + `firmware.js` into
`overlay/scratch-gui/static/microbit-sim/build/` to replace the ancient
vendored stock firmware.
