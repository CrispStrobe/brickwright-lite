# Shipped example corpus — what is actually broken

Measured 2026-08-23 against `1d8b0d174`, by `test/example-vm-execution.test.mjs`
(real Scratch VM + bundled extensions) and `test/example-execution.test.mjs`
(lite's trace referee). Every number here is produced by a gate that runs in CI,
so this file is a snapshot of a live measurement, not a survey someone did once.

## What the gates asserted BEFORE this work

Taken one file at a time, because the headline finding is structural rather than
about any single test: **before 2026-08-23 no gate in this repo opened a
`program.bw`.** Seven test files touch `overlay/scratch-gui/examples/`. All seven
assert metadata, schema, or geometry.

| file | what it opens | what it asserts | parse? | transpile? | execute? |
| --- | --- | --- | --- | --- | --- |
| `test/lessons.test.mjs` | `index.json` + the 8 lesson JSON files | a lesson's `exampleId` is present in the index; ids unique; copy bilingual; checkpoints well-formed; prerequisites resolve | no | no | no |
| `test/starter-journeys.test.mjs` | `index.json` + `starter-journeys.json` | each journey's example exists and its `files` map has the keys its `mode` implies (`files.program` is a KEY CHECK, not a read) | no | no | no |
| `test/circuit-corpus-invariants.test.mjs` | every `circuit*.json` | every wire endpoint resolves to a real net; controller placement is physically possible | no | no | no |
| `test/schematic-visual-baselines.test.mjs` | 4 named `circuit*.json` | the rendered SVG is byte-identical to a reviewed baseline | no | no | no |
| `test/eater6502-examples.test.mjs` | 2 `circuit.json` + 4 `intro.md` | the 6502 extractor accepts one bench and reports bus contention on the other; intro files carry their `teaches` tags | no | no | no |
| `test/controller-board-face.test.mjs` | `17-comparator` circuit | the Arduino face uses the declared source; the bench powers real board pins | no | no | no |
| `test/circuit-designer-ux-contract.test.mjs` | GUI sources (mentions examples) | UI contract — toggles, panes, controls | no | no | no |
| `test/example-bench.test.mjs` | nothing on disk | `resolveExampleBench` on a hand-written literal | no | no | no |
| `test/corpus-differential.test.mjs` | the corpus, via a network oracle | 6 rotating sample pairs agree | yes | yes | no — and **`skip` unless `CORPUS_DIFFERENTIAL=1`, which CI does not set** |

`test/retarget.test.mjs` and `test/sb3-creator-motion-target.test.mjs` do exercise
the compiler, but on inline source strings, not on anything shipped.

So the corpus was covered for: does the index point at files that exist, do the
circuits resolve electrically, do the schematics render the same as last time.
It was not covered for: does the program parse, does it produce blocks, do those
blocks exist, does pressing the green flag do anything. The five inert gallery
examples PLAN.md opens with passed every one of those nine files, and would
still pass all nine today.

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

## LED polarity: two places where the bench contradicts the program it runs

Measured 2026-09-07 against `e3a1f960e` by `scripts/led-polarity-census.mjs`. It
reports and does not gate. When the repair lands it becomes the gate, and it
ratchets downward only.

**A first version of this section said 230 of 394, across ten of eleven device
families. That number was wrong and it is recorded here rather than quietly
replaced.** It compared each generated bench against the AUTHORED declaration.
The app does not do that: picking a device retargets the program through
`SB3Creator.retargetPseudocode` before loading that device's bench
(`circuit-tab.jsx` `loadExampleProgram`), and the bench generator retargets
through the same function. Retargeting an 8051 `ACTIVE LOW` pin to a `d13` on an
Uno DELIBERATELY drops the clause, because the sink asymmetry that forces
active-low on a quasi-bidirectional 8051 pin does not exist on an AVR push-pull
one. So bench and program agree, and 217 of those rows were an artefact of asking
the wrong question. The census now retargets per device and compares the pair a
learner actually sees.

**The corrected finding.**

| | count |
| --- | --- |
| declared output pins reached | 597 |
| of those, carrying a discrete LED this census can drive | 394 |
| **not measurable** — 7-seg digits, LED banks, matrices, shift outputs | **203** |
| measurable and agreeing with the program beside them | 381 |
| **inverted** | **13, in 3 examples** |

**13 is a FLOOR over discrete LEDs, not a total.** A declared output pin is only
measurable here if its bench carries an `led` part named for it. Two hundred and
three declared output pins are not that: seven-segment digit commons, LED banks,
matrices and shift-register outputs are all `OUTPUT` and none of them is a
discrete LED. Whether their polarity agrees is unmeasured, and saying so is the
point — the previous version of this section reported a confident number without
saying what it could not see.

The census asks the solver rather than reading the wires: drive each declared
output pin low, read the LED, drive it high, read again, compare the level that
lit it against the declaration. A bench reaches its rails through breadboard
columns, seats and jumpers, and the solver already resolves all three; a topology
pattern-match would have to re-implement them.

### Defect 1 — the retarget drops ACTIVE LOW where it is the entire subject

Ten rows, two examples, five AVR devices each:

| example | pin | devices |
| --- | --- | --- |
| `06-active-low-high` | `led_low` | `arduino-uno`, `arduino-nano`, `arduino-mega`, `atmega168p`, `attiny85` |
| `32-source-vs-sink` | `led_sink` | the same five |

Both examples declare two LEDs on purpose, one `OUTPUT ACTIVE LOW` and one plain
`OUTPUT`, and exist to teach the difference. Both ship an authored circuit, so
their per-device benches come from `transformAuthored`, which preserves the
authored topology — the sinking LED stays wired to sink. The program beside it
comes from `retargetPseudocode`, which drops the clause. The two producers
disagree, and they disagree in the one place where a learner is being shown that
the clause matters: on those five devices `led_low` and `led_sink` light when the
lesson says they are off.

Dropping the clause is right for `01-blink`, where an active-low 8051 wiring is a
quirk of the chip. It is wrong for an example whose subject IS the quirk. The
repair has to distinguish those, not pick one globally.

**A candidate rule, measured and then rejected as stated.** "Preserve the clause
when a program declares BOTH an `ACTIVE LOW` and a plain `OUTPUT` pin, because the
contrast is then deliberate" separates `01-blink` from these two cleanly. It does
not select only these two: six examples declare mixed polarity — also
`09-relay-clicker`, `60-retro-console`, `61-console-pong` and `76-multimeter`. The
four extra ones are mostly seven-segment digit commons and a buzzer, which is
exactly the population this census cannot see. So the rule cannot be adopted on
today's evidence: it would change four more examples whose current state is
UNMEASURED. **Extending the census past discrete LEDs is a prerequisite of the
repair, not a follow-up to it.**

### Defect 2 — an authored bench is inverted

Three rows, one example, all three 8051 parts including the authored one:

| example | pin | devices |
| --- | --- | --- |
| `arduino-sk-p15-hacking-buttons` | `opto` | `stc12c5a60s2`, `stc15f2k60s2`, `stc89c52rc` |

No retarget is involved for `stc12c5a60s2` — that is the device the example is
authored for, and retargeting to the other two 8051 parts preserves the clause.
The declaration says `ACTIVE LOW` and the bench sources. This is a straight data
defect in one authored circuit and its transforms, not a generator rule.

### The producer, named

`CrispStrobe/sb3-creator`, `scripts/gen-device-benches.mjs`. It has two paths and
the distinction is what defect 1 turns on:

- an example WITH an authored `circuit.json` goes through
  `scripts/lib/authored-transform.mjs`, which re-wires the authored circuit onto
  the target's part and preserves its topology;
- an example without one goes through `inferNetlist`, which branches on
  `pin.activeLow` and builds the wiring the declaration asks for.

Both netlist inferrers were asked directly rather than read:
`lib/bw-board/infer-netlist.js` and `lib/bw-circuit-ui/model/infer-seated.js` each
produce `LED.cathode → pin` for an active-low declaration, on 8051, Uno and Pico
alike. Neither is wrong. The disagreement is between the transform, which keeps
the wiring, and the retarget, which changes the declaration.

**Why it is not cosmetic.** These are teaching examples, and both examples in
defect 1 are the ones whose entire lesson is which state lights the LED: that a
quasi-bidirectional pin sinks 20 mA and sources about 230 µA, so writing a 0 turns
it on. The corpus is small here and the placement is unlucky — of all the examples
to invert, these are the two where the inversion IS the subject.
