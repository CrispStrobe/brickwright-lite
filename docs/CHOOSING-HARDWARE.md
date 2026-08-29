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

The button is **⬇ .hex for the board**, beside *Run on simulator* in the
micro:bit tab. It needs the MicroPython runtime, which is 1.8 MB — too
big to bundle into an app whose whole first paint is 3.8 MB, and not ours
to fetch by name at click time. So it is asked for once and kept for the
session, and there are two ways to supply it:

- pick a MicroPython `.hex` (python.microbit.org, `uflash`, or the one
  that came with the board); or
- **import one first and it never asks** — a downloaded MicroPython hex
  is runtime *plus* script, so opening one to read its Python already
  hands us the runtime.

That second path is why this is not a nuisance: the import you would do
anyway is also the setup.

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

## How a device drives pins — there are two paths, and which one a board
## gets is not a choice

Worth stating because "add pins to the PyBadge" sounds like one job and is
two different ones depending on the board.

**Path 1 — the emulator adapter.** A binary runs on an emulated core and
the adapter calls `board.setPin` per pad edge. This is how the STC12,
Arduino, Pico and STM32 reach a circuit, and it is why they need no pin
blocks at all: the *firmware* moves the pins. `emu8051-adapter.js`,
`avr8js-adapter.js`, `rp2040js-adapter.js` and `stm32-adapter.js` all
speak the same boundary A.

**Path 2 — extension blocks.** No binary is involved; a block calls
`board.setPin` directly. This is the micro:bit and Calliope path, added
2026-08-28, and it exists because their code runs as MicroPython in a
separate simulator rather than as a binary on a core the board can watch.

A board gets whichever path its execution model gives it. That decides
the PyBadge:

- Path 1 needs a **SAMD51 instruction emulator**, which does not exist.
- Path 2 needs pin blocks, and the `arcade` extension has none — it is a
  game API (sprites, score, buttons, NeoPixels), not a GPIO vocabulary.

So "a PyBadge with pins you can wire" is blocked on the emulator, not on
plumbing.

## The heavy tier as it actually ships, and what it gets wrong

STM32-PATH.md fixes **two tiers permanently**. The light tier is our own
`CortexM0Machine`: a few hundred KB of JS, always present, peripheral set
capped at what the codegen emits. The heavy tier is labwired — a firmware
simulation engine (Cortex-M, RISC-V, Xtensa) compiled to wasm. Today it
runs the STM32F030 alongside the light tier, which makes the two directly
comparable; that is what the round trip in `bw-board/LABWIRED-BRIDGE.md`
exploits, and it is how both defects below were measured rather than
guessed.

**The engine is optional, and the picker never lies about it.** The
artifact is 20 MB (about 2 MB brotli), fetched by `npm run
sync:labwiredwasm` into `static/labwired/` — sha256-verified against
`EXPECT` in the sync script, so a moved release tag or a replaced asset
fails closed rather than being trusted. `.gitignore` covers the
destination, so it is never committed and a checkout that has not run the
script still builds. `lib/labwired-engine.js` therefore answers a
*runtime* question — "is the engine here?" — and returns `null` with a
reason instead of throwing. The debug panel probes it before adding the
picker entry: **no artifact, no entry**. Both branches are gated in CI
(`verify-labwired-engine.mjs` and the same script with `--absent`, which
withholds the artifact from the same build).

**It is loaded lazily, and that is guarded.** Both call sites import the
loader into a chunk called `labwired-probe`, and the loader's own import
of the glue is `webpackIgnore`d. Two one-character edits undo either, with
nothing else noticing — so `verify-labwired-lazy-bundle.mjs` runs after
the build and fails if the loader's marker string appears in any eagerly
loaded script.

**Two caveats, both measured against the light tier as the control.**
They are stated in the debug panel next to the engine picker, because
both generate plausible wrong answers that a learner would blame on their
own program:

1. **Analog inputs are not injected.** `labwired-wasm` exports no
   per-channel ADC entry point (`Adc::set_channel_input` exists in the
   core and is simply not bound), so a pot or LDR reads the engine's own
   incrementing counter rather than the voltage our board solves. The
   bridge names each such pad in a refusal ledger instead of reporting a
   mid-rail node as a boolean; lite surfaces that ledger in the panel.
   One wasm binding upstream lifts all of it — 24 of the 85 shipped F030
   benches are waiting on it.
2. **Interrupt-counted time runs at double speed.** labwired's NVIC does
   not drop a level-pended timer line when the peripheral deasserts
   inside the handler, so the handler is entered **1.95** times per
   update event where the light tier enters **0.97**. Our generated code
   counts milliseconds in exactly that handler, so a 20 ms wait elapses in
   about 10 ms. The control isolates it: the same grid polled off
   `TIM3_SR` with the NVIC uninvolved measures 20.000 ms on the heavy tier
   against 20.001 ms on the light one. The counter, prescaler and clock
   are fine; the interrupt path is not, and the fix is upstream.

For anything analog, or anything whose timing matters, use the light tier.

## labwired will not shortcut SAMD51, and it looks like it should

labwired is the heavy tier for cores beyond Cortex-M0 — the obvious home
for a SAMD51's M4 — and it takes a **chip YAML**, which makes a new part
look like the data-file job the ATmega32U4 was for avr8js.

It is not. Every peripheral type labwired offers is STM32-specific:

```
stm32_crc  stm32_gpioport  stm32_timer  stm32f0_adc  stm32f4_rtc
stm32f7_i2c  stm32f7_usart  stm32spi  stmcan       (+ pythonperipheral)
```

A SAMD51 has PORT, SERCOM and TC/TCC, and none of them can be expressed
in those. Writing `samd51.yaml` would produce a chip whose pads never
move — the same silent failure the STM32F0 hit when its GPIO ports were
given the F1 register map, where the firmware runs, the UART talks, and
every pad reads low for ever. So SAMD51 is **upstream work in labwired**,
in Rust, not a descriptor here. `pythonperipheral` is the only escape
hatch and whether the wasm build carries it is unverified.

## What is missing, said plainly

- **Calliope has no circuit part.** `microbit.json` exists;
  `calliope.json` does not. Same shape of work: terminals plus a
  footprint.
- **SAMD51 has no circuit part and no emulator**, and the second is the
  one that matters — see the two sections above.
- **No emulated MCU drives a drawn circuit yet.** The contract is there
  (`board.setPin` / `board.readPin`) and both halves exist separately;
  nothing joins them.
- **No demo layout ships** that pairs a board with a circuit and a
  program. That is the cheapest next thing: one example — micro:bit, an
  LED, a 220R resistor — would make the whole path legible at a glance,
  and it is the path that most needs a worked example, because the pieces
  are individually unremarkable and only interesting together.
