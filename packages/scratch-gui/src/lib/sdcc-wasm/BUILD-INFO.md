# SDCC WASM build provenance

**SDCC version:** 4.5.0
**Source tarball:** https://sourceforge.net/projects/sdcc/files/sdcc/4.5.0/sdcc-src-4.5.0.tar.bz2/download
**Source SHA-256:** d5030437fb436bb1d93a8dbdbfb46baaa60613318f4fb3f5871d72815d1eed80
**Emscripten:** emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.61 (67fa4c16496b157a7fc3377afd69ee0445e8a6e3)
**Ports:** mcs51 only
**Threading:** single-threaded (no -pthread, no SharedArrayBuffer)
**Architecture:** four isolated single-threaded MEMFS stages; artifacts are copied explicitly
between stages because WebAssembly has no fork/exec.
**Patch applied:** libiberty `psignal` conflict (`HAVE_PSIGNAL`)
**Built by:** `CrispStrobe/emu8051-stc` → `.github/workflows/build-sdcc-wasm.yml`
(workflow_dispatch), run `33351025168`.
**Glue post-processing:** each modularized factory has an ES-module default
export appended so the browser can load it through a webpack-ignored URL. The
generated program and WASM bytes are unchanged; the integration gate executes
the same glue through its Node branch and asserts that the browser export exists.

## Link flags, and the one that matters

    -sUSE_ZLIB -sINITIAL_MEMORY=67108864 -sFORCE_FILESYSTEM
    -sMODULARIZE=1 -sEXPORT_NAME=createSDCC -sEXPORTED_RUNTIME_METHODS=FS
    -sSTACK_SIZE=8388608 -sSTACK_OVERFLOW_CHECK=1

`STACK_SIZE` is the repair of 2026-08-31, and it is worth writing down because
the symptom pointed everywhere except at the cause.

Emscripten's default stack has been **64 KiB** since emsdk 3.1.27 (it was 5 MB
before, which is why nobody had hit this). SDCC decorates its AST by recursion
with large frames and goes **~158 KB deep** on a program with a few levels of
nested control flow. With `ASSERTIONS=0` nothing checks, so the walk simply ran
the stack pointer out of its region and overwrote SDCC's own static data —
measured, not inferred: `emscripten_stack_get_current()` read at the trap
returned `0xc3730` against a stack of `[0xda110, 0xea110]`, 95 KB past the
bottom, inside data segments ending at `0xca7f8`.

Every reported symptom was that one corruption in a different costume:
`null function or function signature mismatch` (a clobbered pointer reaching
`call_indirect`), `memory access out of bounds`, `error 20: Undefined
identifier` for a symbol declared three lines up, `FATAL Compiler Internal
Error ... SDCCast.c line 3528`, a bogus `error 101: too many parameters`, and
one hang. **17 of the app's 44 generated 8051 example programs failed**; native
SDCC 4.5.0, with its 8 MB stack, compiles all of them in silence, and built
with `clang -fsanitize=function` it reports no function-type mismatch anywhere
on this path — so there was never a function-pointer cast to blame.

The stack is now native's own 8 MB, and `STACK_OVERFLOW_CHECK=1` turns a future
overflow into a loud abort instead of silent corruption. Neither flag changes
the code SDCC generates, which the acceptance set below demonstrates rather
than assumes.

## Acceptance

Every program in `emu8051-stc/sdcc-wasm/byte-identity-suite.js` is compiled by
both this WASM build and native SDCC 4.5.0 and the decoded memory images are
compared byte for byte; any difference, any WASM-side compile failure, or any
fixture native itself rejects fails the build.

The set used to be ten hand-written fixtures, and **all ten passed through the
build that could not compile the app's own output** — they are short and flat,
and generated code nests. It now also carries three real `generateC()` programs
(`emu8051-stc/sdcc-wasm/acceptance/`), one of them 76-multimeter, which has two
cooperative tasks and therefore the idle fast-forward block (`bw_calm`,
`PCON |= 0x01`) that was failing. A nested-control-flow canary runs first so a
stack regression states itself in one line.

## Shipped runtime

`cc1` preprocesses, `sdcc --c1mode` generates assembly, `sdas8051` assembles,
and `sdld` links against the bundled small-model mcs51 runtime. The browser
loads the headers and libraries from `runtime.json`; it does not contact a CDN.

| Module | WASM bytes |
| --- | ---: |
| cc1 | 840,689 |
| sdcc | 1,830,464 |
| sdas8051 | 122,680 |
| sdld | 142,118 |

Debug sections are stripped in the build (`emstrip`) and the job asserts none
survive: SDCC's own build puts `-ggdb` ahead of whatever configure is handed,
and a build that stopped overriding the make-time flags shipped 11 MB of DWARF
in `sdcc.wasm` before this check existed.

## Licence

SDCC is GPL-2+. This WASM build is a distribution of SDCC.
The corresponding source is the tarball above, plus any patches
listed. No modifications beyond build-system changes for
Emscripten cross-compilation.

## Scope

8051/mcs51 only. AVR (avr-gcc) is NOT included and stays
server-side.
