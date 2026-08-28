# Choosing hardware in the GUI

Where the device comes from, what each choice actually gets you, and why
some boards are offered as compile targets and some only as consoles.

## The one control, and the three files behind it

The device is chosen in the **Code tab's device dropdown**
(`DEVICE_GROUPS` in `components/tw-pseudocode/pseudocode-importer.jsx`).
Choosing one does two things: it writes a `DEVICE <ID>` line into the
pseudocode — so the program itself records what it was written for — and
it publishes `runtime.bwDeviceId` / `bwDeviceCore` for everything else to
read.

Three files then have to agree, and they know nothing about each other:

| file | its part |
|---|---|
| `pseudocode-importer.jsx` | the list, the `DEVICE` line, `bwDeviceId` |
| `stage-header.jsx` | which console button appears for that device |
| `gui.jsx` | which pane (`dockMode`) that button opens |

A device added to the list and nowhere else **shows up, gets selected,
and does nothing** — which reads as a broken simulator rather than three
missing lines. `test/device-choice-contract.test.mjs` is the gate for
exactly that.

## What a choice gets you — the three kinds

Not every board offers the same thing, and the difference is worth being
plain about rather than discovering by clicking.

**Compile targets** (`compile: true`) — STC12/8051, Pico, STM32F030.
Blocks become C, and there is a real path to a binary through
**stc-compiler.vercel.app**, which runs the GPL toolchains (SDCC,
avr-gcc, ca65, sdasz80) that cannot be bundled into a permissive app.
That server is the answer to "how can this be a compile target at all",
and it is why `compile: false` elsewhere is rarely about licensing.

**Simulated boards** (`compile: false`, `emulator: <engine>`) — Arduino
(avr8js), Arcade/PyBadge, ATtiny. Blocks drive a simulation; there is no
build.

**MicroPython boards** — micro:bit and **Calliope mini**. Blocks become
MicroPython and run in the bundled simulator. The Calliope shares the
micro:bit's API, so it shares the vocabulary, the simulator and the
button; it is listed separately only because a program should say which
board it was written for. A Calliope import that claimed `DEVICE
MICROBIT` was telling the reader their board was a micro:bit.

**Consoles you run rather than program** — **Arduboy**. See below.

## The Arduboy is not a compile target — but not for the reason you would guess

An earlier version of this page said the blocker was **licensing**: avr-gcc
is GPL, so it cannot ship here. That is true and irrelevant. The GPL
constrains *bundling*, and this repo settled that question long ago — the
STC12 compiles through **stc-compiler.vercel.app**, and lite already POSTs
to three of its endpoints (`/compile`, `/assemble`, `/translate`).

**avr-gcc is already running there.** `/compile` accepts `atmega328p`,
`atmega168p` and `atmega2560` today; the Code tab's C tab uses it.

So the real blocker for the Arduboy is smaller and more specific:

1. **`atmega32u4` is not a `/compile` target** — a change in stc-compiler,
   not here.
2. **Nothing emits Arduboy C.** `generateC()` targets the 8051's scheduling
   model. An Arduboy game is C++ against the Arduboy2 library —
   `drawBitmap`, `display()`, an immediate-mode frame loop — which is a
   whole emitter, not a target flag.

(2) is the real work, and it is worth being honest that it is large. What
is cheap and already true is the other direction: **compile server-side,
run client-side.** avr8js is here, so a C program compiled by
stc-compiler for an AVR could boot in the browser with no hardware at
all — the loop already closes for `atmega328p`.

So choosing Arduboy offers to **run a `.hex`**, not to build one. Open a
compiled game from the Code tab's 📂 Open and it goes straight to the
console. Full detail: [ARDUBOY.md](ARDUBOY.md).

## MicroPython and CircuitPython need no compiler at all

Worth separating from the compile question, because the instinct after
stc-compiler is to reach for a server for everything.

**MicroPython is interpreted.** Putting a program on a micro:bit or a
Calliope means appending it to a firmware image at `0x3E000` behind a
four-byte `MP` + u16-length header — which is exactly what `uflash` does.
No toolchain, so no GPL question, and nothing has to be online.
`micropython-hex.js` has read that format since the MakeCode work (it is
how a `.hex` from python.microbit.org gets imported); `appendScript()` now
writes it, and the round-trip test is our own reader accepting our own
writer byte for byte.

**CircuitPython is interpreted too**, and does not even want a hex — a
board mounts as a USB drive and you copy `code.py` onto it. There is
nothing to build.

So the ladder is not "everything needs the server". It is:

| target | how a binary is made |
|---|---|
| STC12, Pico, STM32F030, AVR | **stc-compiler**, because the toolchain is GPL |
| micro:bit, Calliope | **in the browser** — append the script, no compiler exists |
| CircuitPython boards | **nothing to make** — copy the `.py` |
| Arduboy | run a `.hex` someone else built; see above for what building one would take |

## Circuits is a different axis, not a fourth kind

This is the part that is easy to get backwards. **Circuits is not a
device choice** — it is a surface the chosen device can drive.

- The **parts library** has `microbit` (terminals p0/p1/p2/3v/gnd),
  `microbit_breakout`, `stm32f030`, `pi_pico`, `arduino_*` and ~260 other
  parts. You draw a circuit; the MNA solver runs it.
- The **program** drives that circuit through its pins. `set pin P0 to 1`
  reaches `board.setPin` — the board's own documented Boundary A
  (McuToBoard), the same entry point the Arduboy console uses.
- The **circuit extension** reads back: `voltage at`, `current through`,
  `brightness of`, `tone of`.

Until 2026-08-28 that middle step did not exist. The pin blocks were a
*vocabulary* — something for the emitter to lower to MicroPython or C,
with `digitalwrite() {}` behind them — so a micro:bit program could not
light an LED even with the part on the canvas and the solver running. It
read as "the simulation does not work" rather than "this verb is a
no-op", because everything around it already worked.

**A `.hex` does not run "in Circuits".** The Arduboy console is its own
pane with its own display and buttons; the circuit solver is a different
surface with a different job. What they share is `board.setPin`. Wiring
an emulated MCU's pins into a drawn circuit is possible on that contract
— the Arduboy adapter already speaks it — but nothing does it yet, and
saying otherwise would be describing a plan as a feature.

## What is missing, said plainly

- **Calliope has no circuit part.** `microbit.json` exists;
  `calliope.json` does not. Same shape of work: terminals plus a
  footprint.
- **SAMD51 has no circuit part either**, though `stm32f030` and
  `pi_pico` do.
- **No emulated MCU drives a drawn circuit yet.** The contract is there
  (`board.setPin` / `board.readPin`) and both halves exist separately;
  nothing joins them.
- **No demo layout ships** that pairs a board with a circuit and a
  program. That is the cheapest next thing: one example — micro:bit, an
  LED, a 220R resistor — would make the whole path legible at a glance,
  and it is the path that most needs a worked example, because the pieces
  are individually unremarkable and only interesting together.
