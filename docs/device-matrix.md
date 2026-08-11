# Devices across the modules — what exists, what is missing

The goal is Arduino Uno, Arduino Nano, Raspberry Pi Pico and BBC micro:bit
supported *throughout* BrickWright, beside the STC12 that everything was built
for. This is the survey that scopes that, done by reading the code rather than
the intentions, on 2026-08-09.

The short version: **the compiler and runtime now cover more families, but not
with equal fidelity.** Arduino AVR and RP2040 execution have separate MIT
adapters; the Pico path currently accepts raw UF2/flash images and exposes
GPIO/debug state, while MicroPython compilation and source symbols remain open.

---

## Where it stands

| module | where | size | devices it knows |
|---|---|---|---|
| **compiler** | `stc-compiler` | — | STC12 ×2, STC15, STC89, ATmega328P/168P, Arduino Uno/Nano, micro:bit |
| **AST / dialect** | `stc-compiler/stc_pseudocode.py` | 2.9k lines | same nine, via `TARGETS` |
| **blocks** | `overlay/scratch-vm/.../crispstrobe/stc12/` | 305 lines | pin menus are already device-neutral; the extension is named for the part |
| **circuits** | `overlay/.../lib/bw-circuit-ui/` | 5.6k lines | **STC12 only** — one board model |
| **transpilers** | `overlay/.../lib/sb3-creator-c.js` | — | infers `stc12c5a60s2`, `stc15f2k60s2`, `stc89c52rc` from `#include` |
| | `overlay/.../lib/sb3-creator-python.js` | — | **STC12 only** |
| **code ⇄ AST** | `sb3-creator/src/utils/` | 17.7k lines | device C (8051 **and Arduino**), host C, Python, JavaScript |
| **debugger** | `overlay/.../lib/bw-debug/`, `bw-board/` | — | 8051, ATmega328P, and RP2040 targets with per-device capabilities |

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

### 1. Compiler — the Pico remains the MicroPython hole

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

### 3. Blocks — smaller than it looks, and the reason is worth knowing

**Corrected on inspection (2026-08-09).** The first draft of this document
assumed the pin dropdowns were STC12 port names. They are not:

    pins: { acceptReporters: false, items: "pinNames" }

`pinNames()` reads the pins the *program* declared, off `runtime.stc`. So the
palette already follows whatever board the `DEVICE` line names, and always
has. `runtime.stc.device` reaches the runtime too — `bw-debug/debug-runner.js`
already reads it.

And a block a board cannot do is already refused, with a message naming the
board, because the refusal lives in the dialect rather than in the palette:

    PORT k = P2 OUTPUT   on a micro:bit
    -> a whole-port PORT is not available on the BBC micro:bit.
       Devices that have it: ATmega168P, ATmega328P, STC12C5A16S2, ...

So there is no correctness gap here to close. What is left is presentation and
naming, and both carry a compatibility cost that makes them a decision rather
than a task:

- The extension's **id is `stc12`**, which is in every saved `.sb3` that uses
  it, and a conformance test in `sb3-creator` asserts the gallery copy and the
  bundled copy agree on it. Renaming it to something board-neutral breaks
  saved projects unless the old id is kept as an alias.
- **Greying out** a block the current device cannot do means `getInfo()`
  varying with project state, which Scratch re-reads only on refresh. Refusing
  at translation time — which already happens — is more reliable than a
  palette that lies less often.

The honest recommendation is therefore: leave the palette alone, keep the
refusal where it is, and treat the rename as a separate compatibility
decision with an id alias. That is a smaller and better-founded piece of work
than the device picker this document originally proposed.

### 4. Circuits — a board model per device

`bw-circuit-ui` models one board. It needs a pinout, a package outline and a
power story per device, and the part library it already has (74HC595, LEDs,
buttons, buzzers, capacitors) carries over unchanged — those are components,
not boards.

The honest complication is that a micro:bit and a Pico are *modules*, not DIP
chips on a breadboard: their "circuit" is an edge connector and a pin header,
which the current model has no vocabulary for.

### 5. Debugger — per-device capability boundaries

`bw-board` now has separate targets: `emu8051` for STC, `avr8js` for ATmega328P,
and `rp2040js` for raw RP2040 images. They share the debug-session contract but
advertise different capabilities. The RP2040 target supports GPIO feedback,
instruction stepping, raw XIP code breakpoints, registers, and code/SRAM
memory access; it does not yet claim ELF symbols, yield points, or complete
peripheral parity.

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
4. **Blocks: nothing, or a rename behind an id alias.** The palette already
   follows the declared pins and the dialect already refuses what a board
   cannot do. See above for why the first draft of this list was wrong.
5. **Circuit board models**, starting with the two that are DIP-shaped.
6. **Debugger capability parity.** AVR boundary-D is complete; extend RP2040
   symbols, source mapping, and peripheral coverage only when their contracts
   are verified.

Steps 1, 2 and 3 are done (2026-08-09). The pin discovery step 3 needed is
built: an Arduino pin is a bare number that nothing declares, so it is
discovered from the calls that use it, strongest evidence first. `pinMode`,
`digitalWrite`/`digitalRead`, `analogRead`/`analogWrite` and `tone` all
translate; `setup()` + `loop()` reassemble into one script with a `FOREVER`,
which is the shape the dialect emits going the other way. `INPUT_PULLUP`
gives ACTIVE LOW *stated by the sketch* rather than inferred from an `_ON`
idiom — better evidence than the 8051 path ever gets.

Step 4 turned out to be mostly already true, which is the useful kind of
survey result.

### What step 3 turned up that this survey had wrong

The survey treated the modules as independent. They are not, and the reader
found the seam: **`sb3-creator`'s own parser knows five STC parts and one pin
syntax.** `PIN led = D13 OUTPUT` is not a line it can read, and
`DEVICE ARDUINO-UNO` is not a device it knows. So an imported sketch produces
correct pseudocode that this repository cannot turn back into a project.

That splits the remaining work in two, and the halves are nothing like the
same size:

- **Accepting the syntax** — the Arduino boards in `STC_PARTS`, and a `PIN`
  regex that takes `D13`/`A0` beside `P1.0`. Small, and it is what makes
  sketch → pseudocode → *blocks* work, which is the actual BrickWright use
  case.
- **Generating Arduino C from a project** — `generateC()` is 8051 all the way
  down. This is the fifth target the roadmap already names, and it should
  *adopt* `stc-compiler`'s `ArduinoTarget`/`AvrTarget` rather than grow a
  second implementation that can disagree with it.

Nothing above changes the recommendation for **circuits**, which is still the
one module with a real gap and no compatibility trap in front of it: it
models one board, and the two DIP-shaped ones (Uno, Nano) are the cheapest to
add.
