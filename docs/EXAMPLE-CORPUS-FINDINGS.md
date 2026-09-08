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

## LED polarity: the retarget changes the declaration and the bench never follows

Measured 2026-09-07 against `f17f5c22e` by `scripts/led-polarity-census.mjs`,
which reports nothing until four mutations have been seen to fail. It is not a
gate yet; it becomes one when the defect below is repaired, and then it ratchets
downward only.

> **174 inverted of 792 decidable readings, in 19 examples.** 847 declared-pin
> readings were attempted and 55 could not be decided. Every bench in the corpus
> loaded.

**`21` was the earlier figure here and it was wrong — not a second measurement,
just an addition.** The two rows of the table below hold 3 examples and 18, and
`3 + 18` double-counts **`06-active-low-high`** and **`32-source-vs-sink`**, each
of which shows one polarity face on push-pull targets (8 rows apiece) and the
opposite face on the 8051s (2 rows apiece). `46-port-overcurrent` appears in the
first row only. The union of the two rows is **19**, derived by grouping every
inverted row the census printed rather than by summing the group sizes. The row
counts (72, 102, 174) were never affected.

Re-run on 2026-09-08 against lite `1d849ee9b` the census reads 846 attempted and
54 not reached for the same 792 decidable — one row moved out of the undecidable
bucket since `f17f5c22e`. The 792 and the 174 are unchanged.

### One defect with two faces

Retargeting an example to another device REWRITES the pin's polarity clause, in
both directions, and the bench transform never follows it. Measured, not inferred:

| direction | what the retarget does | rows | examples |
| --- | --- | --- | --- |
| 8051-authored → push-pull target | DROPS `ACTIVE LOW` | 72 | 3: `06-active-low-high`, `32-source-vs-sink`, `46-port-overcurrent` |
| Arduino-authored → 8051 target | ADDS `ACTIVE LOW` | 102 | 18, mostly the `arduino-*` ports — including 2 from the row above |
| **union** | | **174** | **19** |

Both rewrites are individually defensible. A quasi-bidirectional 8051 pin sinks
20 mA and sources about 230 µA, so an LED belongs on the sinking side there and
not on an AVR push-pull pin. Confirmed at the source: `PIN led = D13 OUTPUT`
retargets to `PIN led = P1.0 OUTPUT ACTIVE LOW`, and `PIN led1 = P1.0 OUTPUT
ACTIVE LOW` retargets to `PIN led1 = D13 OUTPUT`.

The benches do not move with them. An example that ships an authored `circuit.json`
gets its per-device benches from `scripts/lib/authored-transform.mjs`, which
re-wires the authored circuit onto the target's part and PRESERVES its topology.
So the program says one polarity and the circuit keeps the other, and the learner
sees the wrong LED lit.

The three examples in the first row are the ones this costs most: all three exist
to teach sinking — an active-low LED beside a plain one, a pin sinking beside a
pin sourcing, and eight LEDs sinking from one port. The clause is dropped exactly
where the clause is the lesson.

### What the census can and cannot decide

| | count |
| --- | --- |
| declared-pin readings attempted | 847 |
| **decidable** | **792** |
| undecided: no LED changed when the pin was driven | 55 |
| decidable and agreeing with the program beside them | 618 |
| **inverted** | **174** |

Not reached at all, and why: 224 examples (189 declare no `OUTPUT` pin, 35 ship no
`program.bw`) and 219 benches (no LED on the bench). **No bench failed to load**,
which is the headline change from the previous instrument.

### The instrument, and the four wrong numbers before it

An earlier version of this census reported 230, then 13, then 52. All three were
accurate about what they measured and wrong about what they claimed, and each was
more convincing than the last because the method around it improved. The faults,
kept because the next person to census this corpus will reach for the same
shortcuts:

| said | wrong because |
| --- | --- |
| 230 inverted | Compared each bench against the AUTHORED declaration. The app retargets before loading the bench, so bench and program agreed and 217 rows were an artefact of the question. |
| 13 inverted | Matched an LED to a pin by NAME, expecting `LED_<declared name>`. 312 `led` parts sat on declared pins under other ids and were written off as unmeasurable. |
| 52 inverted, 597 then 588 reached | Silently dropped readings that answered neither way. The reached total SHRANK when the matching improved, which is the only trace a silent drop leaves. |
| all of the above | Rebuilt the netlist by hand instead of calling `Circuit.fromJSON`. It refused 65 of 947 benches, and for hours those read as a fact about the corpus. |

The instrument now loads every bench the way the designer does, takes the pin from
the declaration rather than guessing a naming convention, finds the LED by asking
which one responds rather than tracing wires, and scopes its skip counters so an
example that declares no output pin is not summed with a reading that could not be
decided. Coverage went from 449 decidable of 764 to 792 of 847.

**Four mutations must fail before it prints a number**, because an instrument
other people will trust has to be made to fail on purpose: inverting every LED in
one example must flip its rows, flipping a declaration must flip agreement without
touching the bench, a bench that cannot load must be COUNTED rather than
disappearing, and removing the retarget must collapse the readings.

**Two of the four reported MISSED on their first run, and both times the MUTATION
was wrong rather than the census.** This is the trap specific to mutation testing:
a mutation that fails to break the thing looks exactly like a check that fails to
catch it, and the output is identical.

- Reversing an LED alone reverse-biases a diode, so it never lights at either
  level and the row becomes undecidable rather than flipped. Swapping the supply
  rails alone does the same from the other side. Each was a physically correct
  answer to the wrong question, and only both together turn an active-high bench
  into an active-low one — verified on `01-blink`'s Uno bench.
- The retarget mutation asserted that removing the step would bring back the 217
  phantom disagreements. That is what the PREVIOUS instrument did, because it
  matched LEDs by name and so still produced rows. This one drives the pin the
  declaration names, and an authored `P1.0` does not exist on an Uno, so the rows
  do not become wrong — they cease to exist. The mutation had been written against
  a memory of an instrument that no longer existed, and it would have failed for a
  reason that had nothing to do with the code under test.

### The repair direction, and one question that is not ours

**The transform follows the declaration, not the other way round.** The retarget's
rewrites are individually correct, and stopping them would make the program
electrically wrong rather than merely disagreeing with its picture: a learner on an
Uno would read a declaration that misdescribes their own chip, which is wrong on
its own terms rather than wrong against something else. The transform is the
incomplete half — it preserves topology while the declaration moves under it, and
the bench exists to illustrate the program. It also needs no new judgement at
repair time, because the declaration already states which level lights the LED, so
the transform has a fact to follow rather than a rule to invent.

**Open question for the owner, which does not block the repair.** For
`06-active-low-high`, `32-source-vs-sink` and `46-port-overcurrent`, whose subject
IS the sinking asymmetry, retargeting them at all is questionable. An example that
exists to teach an 8051 quirk, retargeted to a part without that quirk, has had its
lesson removed rather than translated, and a correctly wired bench does not restore
it. Fixing the transform makes them consistent; it does not make them teach
anything on those targets.
