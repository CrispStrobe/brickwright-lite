# Shipped example corpus — what is actually broken

Measured 2026-08-23 against `1d8b0d174`, by `test/example-vm-execution.test.mjs`
(real Scratch VM + bundled extensions) and `test/example-execution.test.mjs`
(lite's trace referee). Every number here is produced by a gate that runs in CI,
so this file is a snapshot of a live measurement, not a survey someone did once.

## The corpus

| | count |
| --- | --- |
| entries in `overlay/scratch-gui/examples/index.json` | 259 |
| ship a `program.bw` | 257 |
| circuit-only, no program at all | 2 |
| `kind: "circuit"` — program is a placeholder (`# Pure circuit — no MCU`) | 114 |
| carry the execution burden (`kind: "program"` or `"full"`, plus one `circuit` that really runs) | 143 |
| **execute, compute, and carry no known defect** | **117** |

`33-inductive-no-flyback` is declared `kind: "circuit"` but ships a real MCU
program with `stc12` blocks. Not a defect; recorded because it is the one
example whose kind does not predict whether it runs.

## Finding 1 — 8 examples author opcodes no bundled extension defines

The ROADMAP §5.1 class. An authored block whose extension does not define it
loads into the project and then does nothing: in node it is not dropped
(79-a2-sampler loads all 51 of its blocks), it is simply never dispatched.

### 1a. `stc12` — lite's bundled copy is 8 opcodes behind the reference

`overlay/scratch-vm/src/extensions/crispstrobe/stc12/index.js` defines 20
opcodes. `sb3-creator/reference/extensions/stc12.js` defines all of them plus
`whenkey`, `seg_shownum`, `seg_showdigit`, `seg_setsegs`, `seg_clear`,
`led_set`, `led_only`, `keypad`. So this is a vendoring lag: the fix exists
upstream and has not been carried across.

| example | undefined opcodes it authors |
| --- | --- |
| `79-a2-sampler` | `stc12_whenkey`, `stc12_keypad`, `stc12_seg_shownum`, `stc12_seg_clear`, `stc12_led_only` |

**ROADMAP §5.1 names three affected examples — `77-keypad-keyshow`,
`78-a2-calculator`, `79-a2-sampler`. Only the third is affected.** The other two
author `stc12_setport` and `stc12_tableindex`, and the bundled extension defines
both. What they hit instead is a *referee* limitation (`stc12_setport` is not a
verb lite's trace oracle speaks), which is a different problem with a different
fix. Corrected here rather than in passing, because the §5.1 count is the number
that decides how urgent the re-vendor is.

### 1b. `devices` — the OLED and TFT verbs exist in no extension at all

Not previously recorded anywhere. The emitter emits eleven of them —
`devices_oled{clear,cursor,hline,pixel,print,show}` and
`devices_tft{clear,cursor,fill,pixel,print}` — and **neither lite's bundled
`devices` extension nor sb3-creator's `reference/extensions/devices.js` defines a
single one.** Both copies stop at the LCD verbs. This is not a vendoring lag;
there is nothing to vendor.

| example | undefined opcodes it authors |
| --- | --- |
| `55-oled-hello` | `devices_oledclear`, `devices_oledcursor`, `devices_oledprint` |
| `70-calculator` | + `devices_oledhline`, `devices_oledshow` |
| `70-calculator-simple` | `devices_oledclear`, `devices_oledcursor`, `devices_oledprint` |
| `72-pico-oled-hello` | `devices_oledclear`, `devices_oledcursor`, `devices_oledprint` |
| `73-voltmeter` | `devices_oledclear`, `devices_oledcursor`, `devices_oledprint` |
| `75-battery-tester` | `devices_oledclear`, `devices_oledcursor`, `devices_oledprint` |
| `51-tft-pixels` | `devices_tftclear`, `devices_tftfill`, `devices_tftpixel` |

Three of these — `55-oled-hello`, `72-pico-oled-hello`, `51-tft-pixels` — reach
NO extension method at all over 24 frames, because the OLED/TFT verbs are the
only hardware verbs they have. Their whole point does not happen.

`74-ammeter` and `49-lcd-hello` use the LCD verbs and are conformant.

Two independent methods agree, as §5.1 required for the stc12 half: executing
each extension's `getInfo()` against the example's own declarations, and grepping
the source for the opcode strings. Neither finds them. The device-gating trap was
checked: `devices` gates blocks with `hideFromPalette`, which keeps a block
defined — these are not defined.

## Finding 2 — 19 examples turn a hardware verb into a variable

The defect PLAN.md opens with, in its second spelling. `set pwm <pin> to N`,
`set tone <pin> to N` and `set <pin> brightness to N` are not verbs the compiler
knows, so it does the only other thing it can: it assigns a VARIABLE named
`"pwm led"`, `"tone speaker"`, `"led1 brightness"`. The program parses, loads,
runs, and never touches the pin.

`avr02-dimmer` · `arduino-01-fade` · `arduino-02-tone-melody` ·
`arduino-02-tone-keyboard` · `arduino-02-tone-multiple` ·
`arduino-02-tone-pitch-follower` · `arduino-03-analog-in-out-serial` ·
`arduino-03-analog-write-mega` · `arduino-03-calibration` · `arduino-03-fading` ·
`arduino-04-dimmer` · `arduino-04-read-ascii-string` ·
`arduino-05-while-statement` · `arduino-sk-p04-color-mixing` ·
`arduino-sk-p05-servo-mood` · `arduino-sk-p06-light-theremin` ·
`arduino-sk-p07-keyboard` · `arduino-sk-p10-zoetrope` ·
`arduino-sk-p12-knock-lock`

**Six of these execution alone cannot see**, and this is the load-bearing point
about why the gate needs a static layer as well as a running one:
`arduino-02-tone-keyboard`, `arduino-02-tone-pitch-follower`,
`arduino-03-analog-in-out-serial`, `arduino-03-calibration`,
`arduino-05-while-statement`, `arduino-sk-p10-zoetrope` and
`arduino-sk-p12-knock-lock` still call their OTHER hardware verbs, so they look
perfectly alive on every liveness measure. Only the shape of the lost write
gives them away.

Every one of them is an Arduino-family example. The Arduino wave shipped with a
PWM/tone vocabulary the compiler does not implement.

## Finding 3 — 9 examples run and reach no hardware at all

Declare an output/PWM/tone pin, execute for 24 frames in the real VM, and invoke
zero extension methods. Six are Finding 2; three are Finding 1b.

`arduino-01-fade` · `arduino-02-blink-without-delay` · `arduino-02-tone-melody` ·
`arduino-03-analog-write-mega` · `arduino-03-fading` · `arduino-sk-p08-hourglass`
· `55-oled-hello` · `51-tft-pixels` · `72-pico-oled-hello`

`arduino-02-blink-without-delay` and `arduino-sk-p08-hourglass` are found ONLY by
execution — they are not on the shadowed-write list and lite's trace referee
refuses both as `busy-loop:zero-time-spin`, so before this gate nothing in either
repo could see them.

## Finding 4 — 2 examples declared `kind: "full"` compile to zero blocks

`eater6502-bench` and `eater6502-vdp-hello`. Their `program.bw` is a board
declaration (`DEVICE EATER6502`, `MAP RAM …`, `CHIP via1 = …`) with no code, so
the Code tab opens empty on an example whose index entry promises a program. The
metadata is wrong, the examples are not.

## What the gates do not cover

Stated because a silent cap that looks like full coverage is the failure mode
this milestone exists to fix.

- **Rendering, sound, and every motion/looks block.** node has no renderer and no
  storage module, so costumes and sounds do not load and those blocks are inert.
  A graphics-only defect passes.
- **Browser-only extension-block deserialization.** node's `sb3.js` keeps blocks
  whose extension prefix is unknown; the browser drops them (CLAUDE.md; confirmed
  again here). The undefined-opcode class is therefore covered by the static
  conformance layer, which does not involve the VM, and NOT by the load step.
- **The 114 placeholder programs.** Asserted to BE placeholders — a circuit
  example that grew a hat block fails — but never executed.
- **32 examples the trace referee refuses** (see the referee gate's own report):
  11 `busy-loop:zero-time-spin`, the rest verbs it does not speak
  (`devices_oled*`, `microbitplus_*`, `spikeprime_*`, `stc12_setport`). All 32
  ARE executed by the real-VM gate, so they are not uncovered overall — but the
  referee's serial/PWM/tone observations do not reach them.
- **Circuit variants.** Milestone 0's acceptance criteria also name "every
  shipped circuit variant". `test/schematic-*.test.mjs` renders all 1,034 and
  checks mechanical legibility; nothing yet asserts a schematic is electrically
  the circuit the simulator solves (ROADMAP §6). Not addressed here.
- **Lesson checkpoints.** Milestone 0 also requires every shipped lesson's
  checkpoints to be achievable against the example it names. `test/lessons.test.mjs`
  checks that a lesson references a shipped example and is well-formed; nothing
  yet executes an example against its checkpoints. Not addressed here.

## Mutation proofs

A gate that cannot be shown to fail is treated as absent. Each of these was run
against a green tree, confirmed red, and restored byte-for-byte.

| # | mutation | result |
| --- | --- | --- |
| A | `01-blink`: `turn on led1` → `set led1 brightness to 100` | RED — "declares output pin(s) [led1:output] but no bundled extension method was ever invoked" |
| B | `05-counter`: `set count to 0` → `set variable count to 0` (**PLAN.md's exact defect**) | RED — "a hardware verb became a variable. \"variable count\" is written, never read, and shadows the variable \"count\"" |
| C | `stc12/index.js`: delete the `toggle` opcode and its method | RED on `11-toggle-button` |
| D | pad `KNOWN_INERT` with `01-blink`, which is not broken | RED — "is on KNOWN_INERT but now drives its hardware (1 extension calls)" |
| E | append a byte to the integrated `sb3-creator.js` so it diverges from the overlay | RED on the instrument check |
| F | add `no-such-example` to `KNOWN_INERT` | RED on the ratchet — an entry that names nothing cannot hide there |
| G | remove `examples/index.json` | RED — the previous gate called `process.exit(0)` here and reported the whole file as passing |

## Instrument faults found while building this

- **The installed extension copy is stale.**
  `packages/scratch-gui/node_modules/scratch-vm/src/extensions/crispstrobe/` is
  written by `apply-vm-overlay.mjs` at install time. Three extensions (`stc12`,
  `stc12live`, `controller`) differed from the overlay, and the stale `stc12`
  reported **12** opcodes where the shipped one has **20**. A conformance gate
  reading that copy would have accused eight correct opcodes of being missing.
  The loader reads `overlay/` for exactly this reason, and an instrument test
  asserts the probe sees all 20.
- **Constructing all bundled extensions does not terminate.** Several LEGO BLE
  extensions start a reconnect or poll loop in their constructor; a full sweep
  ran past ten minutes. Ids are resolved statically from source and only the
  extensions an example needs are ever built. Timers created during a run are
  captured and cleared, or node:test finishes every assertion and then hangs —
  which reads as a broken gate rather than a result.
- **`getInfo()` is runtime-dependent.** `stc12` gates its port and matrix blocks
  on `runtime.stc`, so a probe against an empty runtime under-reports. Every
  probe is given the declarations the example itself produces.
