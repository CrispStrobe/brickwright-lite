# Devices across the modules — what exists, what is missing

The goal is Arduino Uno, Arduino Nano, Raspberry Pi Pico and BBC micro:bit
supported *throughout* BrickWright, beside the STC12 that everything was built
for. This is the survey that scopes that, done by reading the code rather than
the intentions, on 2026-08-09.

The short version: **the compiler now speaks five families; every other module
speaks one.** Today's work added Arduino, AVR and micro:bit targets to
`stc-compiler` with full feature parity, and nothing upstream or downstream of
it knows they exist. The Pico is absent everywhere, including the compiler.

---

## Where it stands

| module | where | size | devices it knows |
|---|---|---|---|
| **compiler** | `stc-compiler` | — | STC12 ×2, STC15, STC89, ATmega328P/168P, Arduino Uno/Nano, micro:bit |
| **AST / dialect** | `stc-compiler/stc_pseudocode.py` | 2.9k lines | same nine, via `TARGETS` |
| **blocks** | `overlay/scratch-vm/.../crispstrobe/stc12/` | 581 lines | **STC12 only** — one extension, named for the part |
| **circuits** | `overlay/.../lib/bw-circuit-ui/` | 5.6k lines | **STC12 only** — one board model |
| **transpilers** | `overlay/.../lib/sb3-creator-c.js` | — | infers `stc12c5a60s2`, `stc15f2k60s2`, `stc89c52rc` from `#include` |
| | `overlay/.../lib/sb3-creator-python.js` | — | **STC12 only** |
| **code ⇄ AST** | `sb3-creator/src/utils/` | 17.7k lines | device C (8051), host C, Python, JavaScript |
| **debugger** | `overlay/.../lib/bw-debug/`, `bw-board/` | 7.4k lines | **8051 only** (`emu8051-adapter.js`) |

Two things that survey corrects, because both are stale in the CLAUDE.md files:

- `generateC()` is **not** missing from `sb3-creator`. It exists and has "always"
  emitted bare-metal 8051; there is also a separate *host C* target that runs
  the project like `generatePython` does. The roadmap note describing it as
  unbuilt predates the work.
- The device-C and host-C targets share nothing but the language. Adding a
  board affects device C only.

---

## What each module would need

Ordered by cost, cheapest first. The ratio is stark: three of the four boards
are already done at the compiler and undone everywhere else, so the expensive
work is not the chips.

### 1. Compiler — the Pico is the only hole

Uno, Nano and micro:bit landed today. The RP2040 has two routes:

- **MicroPython.** The Pico runs it, exactly as the micro:bit does, and needs
  no compiler at all — the `.py` is the artefact. `MicrobitTarget` already
  proves the shape: its own `emit`, generators instead of a Duff's device,
  because MicroPython has no `goto`. A `PicoTarget` is mostly a pin table and
  a peripheral vocabulary.
- **C, via the pico-sdk.** arm-none-eabi plus CMake plus a 100 MB SDK, against
  a 250 MB function limit that already holds a 32 MB AVR toolchain. Not worth
  it for what it buys.

MicroPython, then. Flashing is also nearly free: the Pico presents the same
serial REPL, so `flashMicrobit` generalises to `flashMicroPython`. (Installing
MicroPython itself is UF2 drag-and-drop, which is a file save, not a protocol.)

### 2. Transpilers — teach them the other headers

`sb3-creator-c.js` infers the device from `#include <stc12.h>` and friends. It
needs to recognise `<avr/io.h>` and `<Arduino.h>` and map them to the right
`DEVICE`. `sb3-creator-python.js` needs the MicroPython shape at all — right
now Python means one thing there, and `from microbit import *` is not it.

Both are pure additions to a lookup and a few regexes. Neither changes an AST.

### 3. Blocks — one extension per board, or one with a device picker

The current extension is `crispstrobe/stc12`, named for the part, with pin
blocks whose dropdowns are STC12 port names. Two ways forward:

- **A device picker in one extension.** One block palette, a `DEVICE` block
  that changes what the pin dropdowns offer. Less code, and the project stays
  loadable when the board changes.
- **One extension per board.** Matches how Scratch does micro:bit and EV3,
  keeps each palette honest, and duplicates the plumbing four times.

The picker is the better fit here, because the *dialect* already carries
`DEVICE` and every target already declares its own pins and capabilities. The
extension can ask the target rather than hard-code a dropdown — the same
`supports` set that makes the compiler refuse PWM on a pin without a timer.

### 4. Circuits — a board model per device

`bw-circuit-ui` models one board. It needs a pinout, a package outline and a
power story per device, and the part library it already has (74HC595, LEDs,
buttons, buzzers, capacitors) carries over unchanged — those are components,
not boards.

The honest complication is that a micro:bit and a Pico are *modules*, not DIP
chips on a breadboard: their "circuit" is an edge connector and a pin header,
which the current model has no vocabulary for.

### 5. Debugger — out of scope, and worth saying so

`bw-board` wraps an 8051 emulator. Nothing about it generalises: an AVR needs
a different emulator, a Pico or micro:bit needs a different one again, and the
Cortex-M parts have real on-chip debug (CMSIS-DAP) that a browser could drive
over WebUSB — a different project, not an extension of this one.

`docs/DEBUG-CONTROL-MODEL.md` in the lab repo already says the three targets
are not equal. Adding boards makes that more true, not less.

---

## The order this should happen in

1. **Pico as a MicroPython target in the compiler.** Completes the four-board
   set at the layer that already has five, and reuses a proven shape.
2. **Pico + micro:bit flashing over the shared REPL path.** Small, and it makes
   the Pico end-to-end from the browser without a toolchain.
3. **Transpiler device inference.** Cheap, and it unblocks importing existing
   Arduino and MicroPython code rather than only emitting it.
4. **Blocks with a device picker**, asking the target for its pins.
5. **Circuit board models**, starting with the two that are DIP-shaped.
6. **Debugger: nothing.** Record why.

Steps 1–3 are additive and testable without hardware. Step 4 is where the
module boundaries actually get tested, because it is the first place a block
has to ask a target what it can do instead of assuming an STC12.
