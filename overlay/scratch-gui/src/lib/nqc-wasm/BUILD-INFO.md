# How `dist/nqc.js` and `dist/nqc.wasm` were built

NQC (Not Quite C), MPL-2.0, compiled to WebAssembly so the RCX path needs no
service and no installed toolchain. Licensing is in `THIRD-PARTY-NOTICES.md`;
this file is the provenance and the measurements.

## The pin

| | |
| --- | --- |
| Upstream | <https://github.com/jverne/nqc> |
| Commit | `21c24ec1e520c736ce78e33e4c0dafca887fc2b7` (2022-09-10) |
| Emscripten | 6.0.2 |
| Built | 2026-09-21 |
| `nqc -version` | `nqc version 3.2 r1` |
| Patches to NQC source | **none** |
| `nqc.js` | 63,891 bytes (63,864 + one appended `export default` line) |
| `nqc.wasm` | 294,117 bytes |

## The three things that are not obvious

**1. Half the build must be NATIVE, and emcc cannot do it.** NQC generates
source before it compiles any: `bin/mkdata` is a *host* tool that turns the
RCX API definitions into `compiler/rcx{1,2}_nqh.h` and the firmware nub into
`rcxlib/rcxnub.h`, and bison/flex produce `parse.cpp` and `lexer.cpp`. Build
those with `em++` and you get a WebAssembly program that cannot be executed by
`make`, and the build dies somewhere confusing. So step 1 of `build.sh` is a
native build, and only step 2 switches compilers.

**2. The transports are compiled out, not disabled.** `USBOBJ=`
`RCX_USBTowerPipe_none` and `POBJS=... PSerial_none ...` replace the IOKit and
termios implementations. This is not a limitation being worked around — it is
the right shape: WebAssembly cannot open a serial port, and this application
drives the infrared link itself from `src/lib/rcx/rcx-protocol.js`. Leaving the
real transports in would have meant linking `-framework IOKit`, which is also
why `LIBS=` is overridden to empty.

**3. `CXX=em++` has to be on the command line.** NQC's Makefile hardcodes
`c++` on Darwin, and a command-line assignment is the only thing that beats a
Makefile assignment.

## What was verified, and how

**Byte-identical to the native compiler.** `test/nqc-wasm.test.mjs` compiles
eight programs from `test/fixtures/rcx-images/*.nqc` and compares the output to
the `.rcx` files beside them, which were produced by the native `nqc` binary.
All eight match exactly. That is the property that matters: every claim
`docs/RCX-IR-PROTOCOL.md` makes about the container layout was measured against
those files, and would be about a different compiler if this build disagreed.

The same suite covers the parts a wrapper gets wrong rather than the parts a
compiler does: that a diagnostic reaches the caller with its line number rather
than being flattened to "compilation failed"; that `-T` is actually passed
(`RCX` and `RCX2` must produce different images); that an unknown target is
refused by name; and that a failed compile does not leave `process.exitCode`
set on the host — an Emscripten behaviour that turns an all-green test file red
and is documented at length in the SmallerC wrapper next door.

**The flag form is `-TRCX2`, not `-T RCX2`.** NQC's option parser takes the
target as part of the flag and rejects the separated form with a bare "Usage
error" naming no option. Cost: one debugging round.

## Rebuilding

```
git clone https://github.com/jverne/nqc /tmp/nqc
cd /tmp/nqc && git checkout 21c24ec1e520c736ce78e33e4c0dafca887fc2b7
SRC=/tmp/nqc OUT=$PWD/dist ./build.sh
```

Requires emscripten, a native C++ compiler, bison, flex and make. Copy the two
files in `dist/` here and re-run `node --test test/nqc-wasm.test.mjs`; if the
byte-identity test still passes, the new build is the same compiler.
