# SmallerC WASM build provenance

**Upstream:** https://github.com/alexfru/SmallerC
**Commit:** `1865d79ce7a5ad3f8a9515a571437cee084b8b1d` (2024-12-22, "unhardcode smlrcc invocation")
**Licences:** SmallerC BSD-2-Clause (© 2012–2021 Alexey Frunze); ucpp, a
three-condition BSD variant (© 1999–2002 Thomas Pornin). See `## Licence` below.
**Emscripten:** emcc 6.0.6 (ce75e06884093bcefb86a6b8fd56a5d62a4cc245)
**Threading:** single-threaded (no `-pthread`, no SharedArrayBuffer, so the app
needs no cross-origin isolation headers)
**Patches applied:** none. Neither source tree was modified.
**Built by:** `./build.sh`, in this directory, on this machine — not by a
remote workflow. The build is two `emcc` invocations and takes about 20
seconds, which is why it lives in-tree instead of in a CI job like SDCC's.

There is no source tarball to hash: SmallerC publishes no releases, so the
commit *is* the version, and `build.sh` refuses to build a tree whose `HEAD`
is not that commit.

## What is built, and what is deliberately not

Upstream has four programs. Two are built:

| Program | Built? | Why |
| --- | --- | --- |
| `smlrc` | **yes** | the core compiler: C → NASM `bits 16` assembly |
| `smlrpp` | **yes** | the preprocessor (ucpp) — see the next section |
| `smlrl` | no | SmallerC's linker. This path stops at assembly text; the repo's own assembler is what turns that into an image. |
| `smlrcc` | no | the driver. It orchestrates the stages with **fork/exec**, which WebAssembly has no equivalent of. `compiler.js` is the driver. |

`-seg16` is the flag that makes the output 16-bit: in `cgx86.c` it selects
`FormatSegmented` with `SizeOfWord = 2`. Without it smlrc emits 32-bit code,
which is why `compiler.js` asserts on `bits 16` rather than trusting the flag.

### Why smlrpp is needed at all

smlrc has a *built-in* preprocessor, so it is tempting to ship one module. It
is not enough. Measured against this commit, the built-in one accepts:

> object-like `#define`, `#undef`, `#include`, `#ifdef`, `#ifndef`, `#else`,
> `#endif`, `#line`

and rejects, with `Invalid or unsupported preprocessor directive`:

> **function-like macros** (`#define SQ(x) ((x)*(x))`), **`#if <expr>`**,
> **`#elif`**, `#pragma`, `#error`

Function-like macros and `#if` are ordinary C, not exotica, so smlrpp ships.
`test/smallerc-wasm.test.mjs` compiles a program using exactly the rejected
constructs — a pass proves smlrpp really ran and its output reached smlrc.

## Link flags, and the two that matter

    -O2 -w -g0
    -sMODULARIZE=1 -sEXPORTED_RUNTIME_METHODS=FS -sFORCE_FILESYSTEM=1
    -sALLOW_MEMORY_GROWTH=1 -sINVOKE_RUN=1
    -sSTACK_SIZE=8388608 -sSTACK_OVERFLOW_CHECK=1
    -sEXIT_RUNTIME=1

### `STACK_SIZE` — a wrong answer, not a crash

Emscripten's default stack has been **64 KiB** since emsdk 3.1.27. smlrc is a
recursive-descent parser, and it runs out.

What it does *not* do is crash. Measured on this build, compiling a `main`
containing N levels of nested `if`, comparing against native smlrc built from
the same commit:

| nesting depth | 64 KiB stack | 8 MiB stack | native |
| ---: | --- | --- | --- |
| 12 | 3,224 bytes | 3,224 | 3,224 |
| 15 | 3,740 | 3,740 | 3,740 |
| 16 | 3,912 | 3,912 | 3,912 |
| **17** | **fails** | **4,084** | **4,084** |
| 20 | fails | 4,600 | 4,600 |
| 60 | fails | 11,503 | 11,503 |

At 16 levels the three agree exactly. At 17 the small-stack build reports

    Error in "/w/in.c" (20:12)
    Undeclared identifier 'x'

for a variable declared on **line 2** of the same function, and appends
`; Compilation failed.` to a partial listing. That is the entire symptom: a
plausible, specific, completely wrong diagnostic pointing at the program
instead of at the compiler. Nothing says "stack".

At 8 MiB the WASM output is **byte-for-byte identical to native** at every
depth in the table — `cmp` clean on the 11,503-byte case. `STACK_OVERFLOW_CHECK=1`
turns any future overrun into a loud abort rather than another wrong answer.

### `EXIT_RUNTIME` — a silent empty file that passes for success

ucpp writes its output through stdio and relies on the flush that happens at
exit. Built with `EXIT_RUNTIME=0`, smlrpp **exits 0 and leaves a zero-byte
`.i`**. smlrc then compiles that empty translation unit perfectly happily and
emits a well-formed file:

    bits 16

    ; Syntax/declaration table/stack:
    ; Bytes used: 55/15360
    …

Valid NASM. Correct header. No error anywhere. And no program in it. A harness
that checked "did a `.asm` appear" or "does it start with `bits 16`" would
call that a pass — which is why `compiler.js` refuses an empty `.i` explicitly
rather than relying on the build flag alone, and why the test asserts that
real instructions came out.

Both of these were found by building the mutant and watching the suite go red,
not by reading the flag list.

## Acceptance

`test/smallerc-wasm.test.mjs` (9 tests) executes both WASM modules under Node
through the real `compileWithToolchain()` entry point. It covers: C → `bits 16`
with no 32-bit registers; a preprocessor-only construct set; bundled headers
resolving; hosted headers correctly absent; a bad program being *diagnosed*
(smlrc prints its errors on **stdout**, not stderr — capturing only stderr
throws the whole diagnosis away); the two canaries above; target gating; and
empty input.

**Both canaries were mutation-proved on 2026-09-04.** Rebuilding smlrc without
`STACK_SIZE` fails 6 of 9; rebuilding smlrpp with `EXIT_RUNTIME=0` fails 7 of 9.
Restoring the shipped artifacts returns 9/9.

Separately, the shipped smlrc was checked byte-for-byte against native smlrc
built from the same commit with `gcc -O2` (`cmp`, identical) on the nesting
corpus above.

## Shipped runtime

| Module | bytes | sha256 (first 16) |
| --- | ---: | --- |
| smlrc.wasm | 153,804 | `14a4cc1d6bab26d1` |
| smlrpp.wasm | 93,384 | `7fc55fcea6731aad` |
| smlrc.js | 62,537 | `fcbb61ec4936dc8d` |
| smlrpp.js | 66,630 | `80db7a0d138007a4` |
| headers.js | 8,114 | `f3fc4d82f59274a3` |

376 KB total. `build.sh` asserts no `.debug_*` sections survive.

**Reproducible:** re-running `build.sh` from the same pinned commit with the
same emcc produces all five files bit-for-bit identical to the table above
(verified 2026-09-04). That is what makes these hashes worth printing — an
artifact nobody can rebuild is pinned by nothing.

`headers.js` carries **six** headers — `stddef.h`, `stdint.h`, `limits.h`,
`float.h`, `iso646.h`, `stdarg.h` — copied verbatim from `v0100/include/`.
They are inlined into a JS module rather than fetched as a JSON pack (the way
SDCC's 3.2 MB runtime is) because 7 KB costs nothing to bundle and it means
this compiler issues **no network request whatsoever** once its two modules are
cached.

`stdio.h`, `stdlib.h`, `string.h` and `math.h` exist upstream and are
**excluded on purpose**: there is no libc and no linker on this path, so
`#include <stdio.h>` would compile clean and then die much later on an
undefined `_printf`. Failing at the `#include`, where the cause is visible, is
the kinder error, and a test pins it.

## Glue post-processing

Each modularized factory gets one line appended — `export default createSmlrc;`
/ `export default createSmlrpp;` — so the browser can load it through a
webpack-ignored dynamic `import()`. The generated program and the WASM bytes
are unchanged. `compiler.js` and the test both strip exactly that line to run
the identical source as CommonJS under Node, and the test asserts the line is
present before stripping it, so the browser entry point is proved to exist by
the same run that exercises the Node one.

## Scope — read this before wiring anything to it

This module turns C into **assembly text** and stops. It does not assemble,
link, or produce a binary.

As of 2026-09-04 **nothing in the app imports it**, deliberately. The assembler
that would consume the output, `lib/bw-board/i8086-asm.js`, is MASM-dialect: it
rejects SmallerC's output on line 1 —

    8086 asm (line 1): "BITS" is not an instruction, directive or macro this assembler knows

and `SECTION`, `RESB` and NASM's `align`/`alignb` are likewise unknown to it.
So the compiler is correct and tested on its own terms and is **not reachable
end-to-end**. Closing that gap needs a NASM front end in `i8086-asm.js`, which
lives in the **vendored** `bw-board/` tree that `npm run sync:bwboard`
overwrites wholesale — it has to land upstream, not here. ROADMAP §4.6, §3.8.2b.

## Licence

SmallerC is BSD-2-Clause; ucpp is a three-condition BSD variant with its own
copyright holder. Both are permissive, so neither raises the linking question
SDCC's GPL does — but both attach a condition to **binary** redistribution,
which a `.wasm` in the bundle is. Both full texts ship in
`static/licenses/smallerc.BSD-2-Clause.txt`, reachable from the About dialog
with no network, and both are named in `THIRD-PARTY-NOTICES.md`.
`test/notices-coverage.test.mjs` gates all of that.
