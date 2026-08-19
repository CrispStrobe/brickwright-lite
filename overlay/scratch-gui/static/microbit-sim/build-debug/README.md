# Debug firmware (settrace-enabled)

`firmware.wasm` here is the micro:bit MicroPython v2 simulator firmware built
with `MICROPY_PY_SYS_SETTRACE=1` (+ its prerequisites `MICROPY_PERSISTENT_CODE_SAVE=1`
and `MICROPY_COMP_CONST=0`), for the line-level (Tier-1) debugger. `firmware.js`
is its matching Emscripten glue.

**The glue is version-locked to the wasm.** It is NOT interchangeable with the
stock `build/firmware.js` — that one is from a different emsdk, and the settrace
wasm under it dies with `LinkError: emscripten_memcpy_big`. So both the debug
glue AND wasm live here, and `simulator-debug.html` loads *this* glue (verified
end-to-end via `scripts/settrace-smoke.mjs`).

Size vs stock: +14,136 B raw (1.13%), +6,428 B gzipped (1.18%).

Built in the pinned toolchain container (upstream's own: emscripten 3.1.25 +
Python 3.8), which is the ONLY combination that builds this 2022 source —
newer emsdk/Python break `makeqstrdefs`. Serial (`-j1`) build to avoid an
x86-clang-under-arm64 emulation crash. Rebuild: `emscripten/emsdk:3.1.25`
container, set the three defines in `src/mpconfigport.h`, `make -C src -j1`.
