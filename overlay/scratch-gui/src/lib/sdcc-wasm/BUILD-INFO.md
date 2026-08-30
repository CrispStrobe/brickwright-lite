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
**Glue post-processing:** each modularized factory has an ES-module default
export appended so the browser can load it through a webpack-ignored URL. The
generated program and WASM bytes are unchanged; the integration gate executes
the same glue through its Node branch and asserts that the browser export exists.

## Shipped runtime

`cc1` preprocesses, `sdcc --c1mode` generates assembly, `sdas8051` assembles,
and `sdld` links against the bundled small-model mcs51 runtime. The browser
loads the headers and libraries from `runtime.json`; it does not contact a CDN.

| Module | WASM bytes |
| --- | ---: |
| cc1 | 853,793 |
| sdcc | 2,839,908 |
| sdas8051 | 659,154 |
| sdld | 1,008,609 |

## Licence

SDCC is GPL-2+. This WASM build is a distribution of SDCC.
The corresponding source is the tarball above, plus any patches
listed. No modifications beyond build-system changes for
Emscripten cross-compilation.

## Scope

8051/mcs51 only. AVR (avr-gcc) is NOT included and stays
server-side.
