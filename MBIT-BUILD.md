# micro:bit firmware rebuild

The shipped micro:bit simulator firmware is a pinned generated artifact. Rebuild
it only to update its provenance or required interpreter capability.

## Environment

- Ubuntu 22.04 x86-64 or equivalent container
- Emscripten 3.1.45
- GNU Make and a host C/C++ toolchain
- the pinned MicroPython source revision recorded by the artifact manifest

Do not substitute a newer Emscripten toolchain without reviewing glue output,
memory behavior, and reproducibility hashes.

## Procedure

1. Check out the pinned source in a disposable directory outside this repository.
2. Activate Emscripten 3.1.45 and warm its sysroot cache serially.
3. Build `mpy-cross` for the host.
4. Build the stock WebAssembly firmware.
5. Build the debug variant with `MICROPY_PY_SYS_SETTRACE=1`,
   `MICROPY_PERSISTENT_CODE_SAVE=1`, and `MICROPY_COMP_CONST=0`.
6. Compare exports, glue, behavior, and hashes with the checked-in manifest.
7. Update the artifact, immutable source identity, hashes, license notices, and
   verification fixture in one commit.
8. Run `npm run verify:microbit`, the focused unit tests, and the production
   lazy-loading/package gate.

The stock and debug variants are different products; do not replace one with
the other or infer equivalence from similar file sizes. Build containers may be
deleted after their image digest and exact commands are recorded.
