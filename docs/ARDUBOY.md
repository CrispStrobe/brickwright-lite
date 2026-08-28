# Arduboy — running a compiled game

Everything else the Code tab imports is a *parsing* problem. MakeCode
embeds the project source in every artefact it writes, so bringing a
micro:bit or Arcade project in means finding that source and translating
it. An Arduboy `.hex` has nothing in it but AVR machine code. There is no
source to find, and there never will be.

So this is the other kind of support: we run it.

## Why this was cheap, when MakeCode Arcade was not

Arcade games are Cortex-M4 binaries drawing to a 128x160 screen, and
[docs/MAKECODE.md](MAKECODE.md) explains at length why emulating one is
not on the table. Arduboy is the opposite case on every axis that matters:

| | Arcade cartridge | Arduboy `.hex` |
|---|---|---|
| CPU | Cortex-M4 | **ATmega32U4 — and we already ship an AVR emulator** |
| emulator | none in tree | `avr8js` 0.21, MIT, already used for the 328P |
| display | 128x160 colour, ST7735 | **128x64 SSD1306 — already modelled in `bw-board/devices`** |
| source | embedded in the artefact | absent, and irrelevant |

Nothing here needed a new emulator. avr8js ships a generic AVR core and
**no chip definitions at all** — the 328P beside it is a data file — so
the ATmega32U4 is ports B–F, three timers, and a 43-entry vector table in
`bw-board/avr-chips.js`. Timer4 is deliberately left out: it is the 10-bit
high-speed one with a register layout avr8js's timer model does not
describe, and the Arduboy does not drive the pins the Arduino core uses it
for.

## The one register, and why the answer looks like "hopeless" until you look

Every Arduboy game hangs three instructions into the Arduino core, before
a line of game code runs:

```
IN   r0, 0x29     ; PLLCSR
SBRS r0, 0        ; PLOCK
RJMP -3
```

The core brings up USB before `setup()`, and its first act is to wait for
the USB PLL to report lock. avr8js has no PLL, so PLOCK never sets.

Read from outside, this is "USB is not emulated, so the 32U4 is a dead
end" — which is the received wisdom about this chip, and it is wrong. It
is **one bit**. `lib/bw-arduboy` installs a write hook on PLLCSR that sets
PLOCK when PLLE is written, and that is the entire USB story: nothing else
is modelled and nothing else needs to be, because a game never enumerates.
It just wants the clock.

`test/arduboy.test.mjs` pins this from both sides — that a game runs, and
that removing the bit stops it dead on those three instructions.

## What is here

| | |
|---|---|
| `lib/bw-board/avr-chips.js` | the `ATMEGA32U4` definition |
| `lib/bw-board/devices/ssd1306.js` | gained a **SPI front end**. The SSD1306 is one chip with two front ends — I2C wraps each byte in a control byte, SPI puts command/data on a pin — so `createSSD1306SPI()` shares the command decode, the addressing modes and the GDDRAM with the I2C device rather than describing the controller twice |
| `lib/bw-arduboy/index.js` | the console: the board that answers the MCU's pins, the display on the far end of its SPI bus, the PLL hook, and `advance(ms)` |
| `components/tw-pseudocode/arduboy-pane.jsx` | 128x64 canvas, six buttons, keyboard, pause and reset. No iframe — the CPU runs in this page, so the frame is drawn straight out of GDDRAM |

Opening a `.hex` routes through the existing importer. MakeCode is tried
**first**, always, so a MakeCode hex can never be mistaken for a game; only
when that finds no embedded source does `looksLikeAvrHex` get a say, and
what it answers is deliberately weak — "Intel HEX holding AVR code that
fits a 32U4", not "an Arduboy game", because nothing in the file records
which console it was built for.

## Evidence

Measured against [obono/ArduboyWorks](https://github.com/obono/ArduboyWorks)
(**MIT**), which ships **19 prebuilt `.hex` files** in `_hexs/` — so no
avr-gcc is involved anywhere in this, and the GPL question that keeps SDCC
server-side for the STC12 never arises:

- all 19 boot, initialise the display with the same 14 SPI commands, and
  sustain **60–62 frames per second**
- `rysk` and `hollow` render their real title screens, version strings and
  all

`rysk.hex` is committed as a fixture for exactly the reason the rest of
`test/fixtures/` exists to contrast with: it is 15 KB of machine code with
no source of any kind, so "it parsed" is not available as an answer. The
only way to know it works is to run it and look at the screen, which is
what the tests and `scripts/verify-arduboy.mjs` do — the gate reads pixels
back off the canvas and checks they keep changing, because one frame and a
freeze is exactly what a stalled boot looks like.

## Sound

There is no frequency register worth reading — a game is free to make
noise however it likes, and `MyArduboy2` in the corpus does not use stock
`ArduboyTones` — so what gets measured is the thing that is actually true
of a tone: **the speaker pin toggles, and at some rate**. `takeSpeaker()`
returns the edges since it was last called and the simulated milliseconds
they happened over; a cycle is two edges. Reading resets, because the
caller is sampling a rate and a total that is never cleared only ever
goes up.

The pane follows that with one square-wave oscillator, ramped rather than
switched so a note does not start and end with a click. The audio context
is created on the **first button press and not before**: browsers refuse
to start audio without a gesture, and one made at mount would be
suspended for ever with nothing on screen to say why.

RYSK answers a button press with a tone that measures ~370 Hz — F#4,
which is a real note and the best evidence available that the mechanism
is right rather than merely producing numbers.

## The RGB LED

Common-anode — the pin is pulled **low** to light it — and driven by PWM,
so the level at any instant says almost nothing: read it at the wrong
moment and a game's dim red is either full red or off. What means
something is the fraction of the window the pin spent low, so `takeLed()`
integrates time-weighted duty per channel and resets, exactly as the
speaker does.

RYSK drives it during play, and the measured duty lands at **~0.063** —
which is level 16 of 255, and `LED_LEVEL_START 16` is what its source
asks for. That number matching is the evidence the integration is right;
the pane's dot applies a gamma-ish curve on top purely so a 6% duty is
visible to an eye rather than a black circle.

## Where it sits in the GUI

`Arduboy (run .hex)` in the Code tab's device dropdown, `compile: false` —
see [CHOOSING-HARDWARE.md](CHOOSING-HARDWARE.md) for why that flag is the
important half. Choosing it puts an **Arduboy Console** button in the
stage header, which opens the pane; opening a compiled `.hex` from 📂 Open
goes straight there without choosing anything first.

It is **not** a Circuits surface. The console has its own display and
buttons; the circuit solver is a different pane with a different job. What
they share is `board.setPin`, so wiring an emulated Arduboy into a drawn
circuit is possible on that contract — nothing does it yet.

## What is not here

**Anything to do with source.** Arduboy games *are* published with source —
ArduboyWorks is MIT — but that source is C++ using immediate-mode drawing
(`clear()`, `drawBitmap()`, `display()`, sixty times a second) with no
scene graph. MakeCode Arcade mapped onto Scratch sprites because it *has*
sprites, velocities and `overlapsWith`. A faithful Scratch port of an
Arduboy game would be pen-drawing a 128x64 bitmap at 60 fps, which Scratch
will not do well. What the source could cheaply buy is the artwork: the
`PROGMEM` bitmaps are 1-bit column-major, the same shape as the GDDRAM and
the same problem `bw-makecode/arcade-assets.js` already solves.
