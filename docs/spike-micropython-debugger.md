# Native MicroPython debugger attachment

The native owner can start an admitted canonical application through
`RenodeDebugger::start_micropython_image`. It uses compile-time runtime/support
pins and private application-data staging. The common debugger attachment checks
firmware identity, canonical image SHA-256, UART generation and readiness before
accepting the session. Startup errors tear down the owned process and capsules.

The session retains admitted bytes and a typed launch recipe. Reset makes fresh
image/configuration capsules and a new process-local UART generation, rechecks the
support package and restarts the debugger without reopening the source image.
Old-generation UART requests are refused before transmission. Generations correlate
sessions; they do not authenticate callers. Pause, registers, run and close use the
same existing debugger operations as the guest/NuttX paths.

An already staged support profile can be frozen with:

```sh
node scripts/prepare-spike-micropython-pins.mjs SUPPORT_DIRECTORY RENODE_EXECUTABLE NEW_OUTPUT_DIRECTORY
node --test test/native-spike-micropython-pins.test.mjs test/workflow-trigger-coverage.test.mjs
```

The tool copies only the closed 16-file support manifest, verifies digests before
and after copying, and writes compile-time `BW_RENODE_*` pins. It never copies
adjacent application images or replaces an existing directory. It does not assemble
models from source or produce a portable installed runtime bundle. The native build
owner supplies the pins as environment variables when compiling Rust. Changing a
support file requires rebuilding its manifest and the pinned native application.

Local qualification used the actual production compile-time startup entry and
actual debugger/state/UART code with a locally supplied MicroPython 1.26.1 image.
Arithmetic, infinite-loop interruption, pause/register inspection, resume, reset
following deletion of the test source file, fresh generation, stale-generation
rejection, arithmetic after reset, close and capsule cleanup passed. The staging
tool's output was used in a second live qualification. A constant-generation
mutation is detected by the reset recipe test. Generated packages, firmware bytes,
logs, test harnesses and complete transcripts are retained privately.

This is native debugger integration, not a GUI selection claim. The chooser and
Code-tab selection, public source assembly/portable packaging and robot Python
bindings remain pending. The tested image lacks `hub` and `motor`. The live support
profile uses the previously qualified local candidate electrical model; this does
not qualify the stock model, original LEGO firmware or physical hub equivalence.
Non-Unix capsule staging remains unsupported. New components use BSD-3-Clause;
retained model sources keep MIT attribution.
