# SDCC WASM build provenance

**SDCC version:** 4.5.0
**Source tarball:** https://sourceforge.net/projects/sdcc/files/sdcc/4.5.0/sdcc-src-4.5.0.tar.bz2/download
**Source SHA-256:** d5030437fb436bb1d93a8dbdbfb46baaa60613318f4fb3f5871d72815d1eed80
**Emscripten:** emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.61 (67fa4c16496b157a7fc3377afd69ee0445e8a6e3)
**Ports:** mcs51 only
**Threading:** single-threaded (no -pthread, no SharedArrayBuffer)
**Patches applied:** (none / list here if any)

## Licence

SDCC is GPL-2+. This WASM build is a distribution of SDCC.
The corresponding source is the tarball above, plus any patches
listed. No modifications beyond build-system changes for
Emscripten cross-compilation.

## Scope

8051/mcs51 only. AVR (avr-gcc) is NOT included and stays
server-side.
