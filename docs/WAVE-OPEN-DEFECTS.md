# What the seven lesson reviews left open

Compiled 2026-08-24 from `docs/LESSON-REVIEW-WAVE-{1..7}.md` and `PLAN.md`'s
verification-debt ledger, against lite `7ce24a619`.

The seven waves reviewed 79 lessons and found 38 defective. Almost every
**repair** landed in lesson copy; almost every **cause** did not. This document
is the other half: one table of every defect the reviews left open, with the
repo that owns the fix and the number of lessons it blocks.

**Sorted by lessons affected**, because that is the ranking that matters to a
learner. A defect that costs one lesson a hint is not the same problem as one
that makes twenty-eight checkpoints certify nothing.

Two counting rules, so the numbers are comparable:

- **Lessons affected** counts lessons whose *checkpoint wording had to
  accommodate the defect*, not lessons that merely touch the same component. A
  lesson revised to work around a gap is counted; a lesson that never asked for
  the missing thing is not.
- A defect with several owners is listed once, under the repo that owns the
  **root cause**, with the others named in the row.

## The table

| # | Defect | Owner | Lessons | Waves | State |
| --- | --- | --- | --- | --- | --- |
| **D1** | 28 checkpoints observe `circuit-ready`, which fires once when the example loads — so they tick themselves before the learner measures anything | lite (`guided-lessons.jsx`) | **28** | 1, 2, 6, 7 | **FIXED** — arming semantics |
| **D2** | **RE-WORDED 2026-08-31 — the row's premise was right and its arithmetic was not.** It said "all ten Wave 5 lessons declare `environment: "simulation"`", which reads as though that field selects the affected set. Measured at tip: **68 of 70** lessons declare it, so it selects almost everything and discriminates nothing. The set that actually could not start offline is the one whose bench needs a compiler — 41 lessons name an example with an MCU program, 25 of those on a non-8051 part. Wave 5's ten split **five 8051 / four AVR / one RP2040**, which is the real shape of the row | lite (`bw-debug/debug-runner.js`) | **12** | 5, 3, 7 | **FIXED 2026-08-31 in two halves, and the halves are different repairs.** The 8051 half is a compiler that runs in the browser (four WASM stages; see PLAN.md). The other half is D7's answer, not a smaller network call: the lesson benches whose compiler CANNOT run in a browser now SHIP their image. 13 images, 154 KB of payload plus a 9 KB manifest, one per (example, target, format), keyed on the generated C and used without the network; the panel says in words that the image is prebuilt, when it was built and with which compiler, and that an edit makes it stop applying. **The honest residue, named rather than hidden:** a program the learner has EDITED on an AVR or ARM bench is a program nobody has compiled, so it still needs the hosted service and still refuses honestly without one. That is the boundary of what a shipped image can do, and it is the reason the sentence in the panel ends where it does |
| **D3** | The Bode sweep reports no numbers: `drawBode` writes four strings on a 260×140 canvas (two dB extremes, ±180°), no frequency axis, no per-point value, no export | bw-circuit-ui | **4** | 6 | **FIXED** — axis, table and CSV |
| **D4** | The scope record is fixed at 100 kHz × 8192 = 81.92 ms; both numbers are hard-coded in `addScopeChannel` and `ScopePanel` passes neither | bw-circuit-ui (**not** bw-board — see below) | **4** | 6, 7 | **FIXED** — a record-length control |
| **D5** | Four faceplate layouts ship no `"mode": "play"`, and `ControllerPanel` defaults to `edit` where every input control renders `disabled`; the panel's own `toJSON`/`fromJSON` drop `mode` entirely, so even a corrected file is lost on the first save | sb3-creator (examples) + bw-board (`controller.js`) + lite (`gui.jsx`) | **3** | 4 | **FIXED** — three repos |
| **D6** | `bw-circuit-changed` is dispatched only when the derived **pin declarations** change, so on an MCU-less bench no wiring edit can raise it | bw-circuit-ui (`CircuitDesigner`) + lite (`circuit-tab.jsx`) | **3** | 1, 6, 7 | **FIXED** — `onCircuitEdit` |
| **D7** | Three machine benches boot with an empty ROM: no example ships an image, `sb3-creator` has no assembler, and the runner skips the build for machine targets | sb3-creator (examples) | **3** | 7 | **FIXED** — an assembler and three shipped ROMs |
| **D8** | `pc52-inductor-filter` is an RLC used as an RL bench; the L/R law holds for its first ~300 µs and then the 100 µF takes over | sb3-creator (example) | **3** | 1, 6 | **FIXED** — a new RL bench |
| **D9** | A Bode point costs 10/f seconds of simulated time (`settleCycles` 6 + `measureCycles` 4) and `SweepPanel` ran the sweep synchronously | bw-circuit-ui | **2** | 6 | **FIXED** — chunked/worker session, progress and cancellation |
| **D10** | `pc50-two-stage-rc` corners at 0.159 Hz, so the decade below the corner its own lesson asks for costs 629 s of simulation per point | sb3-creator (example) | **2** | 6 | **FIXED** — 100 µF → 100 nF |
| **D11** | `43-rc-timing` has no controls at all, so the charging step it measures happens once and cannot be repeated | sb3-creator (example) | **2** | 2, 6 | **FIXED** — a discharge switch |
| **D13** | `board.resistance(a, b)` is directional — B is the reference and ground symbols are deliberately switched out of that solve, so a real path reads as open when probed the other way | bw-board (`mna.js`) — **by design** | **2** | 2 | open — not a bug |
| **D12** | Generated ASM listings were hosted alongside the separately editable hosted assembler | lite + sb3-creator | **1** | 7 | **PARTIALLY FIXED 2026-08-31** — the STC/8051 Wave 3 listing is now linked locally from SDCC `.rst` and production-gated offline; editable ASM and the 6502 Wave 7 listing remain explicitly hosted |
| **D14** | The widget inspector edits no functional config: only `color`, `fontSize`, `src`, `text`. A button's `toggle`, a slider's `min`/`max`/`step`, a gauge's range and a matrix's `rows`/`cols` are reachable only by hand-editing `controller.json` | lite (`controller-panel-view.jsx`) | **1** | 4 | **FIXED** — Config section |
| **D15** | A widget cannot be re-bound from the app: `bindToVariable`, `bindToPart` and `bindToPin` are called from nowhere in the GUI; `WidgetCard` takes an unused `onBindPart` prop | lite (`controller-panel-view.jsx`) | **1** | 4 | **FIXED** — Binding section |
| **D16** | No simulated micro:bit sensor can be varied: the bundled simulator declares each one with its range, default and unit and accepts `{kind:'set_value', id, value}`, and `set_value` appears nowhere in lite | lite (`microbit-sim-pane.jsx`) | **1** | 4 | **FIXED** — Sensors strip |
| **D17** | `char_lcd_i2c` is the only display model in the corpus with no `control()` handler, so `74-ammeter`'s LCD stays blank under `setDeviceControl` | bw-board (`devices/i2c-parts.js`) | **1** | 2 | **FIXED** — `control()` handler |
| **D18** | The LM358 model is a damped integrator that halts once its per-round output step falls below 1 mV, leaving up to 0.667 mV of input error unamplified — realised gain 31–39 against a documented ×46.45, and it depends on the input | bw-board (`devices/analog-amps.js`) | **1** | 2 | **FIXED 2026-08-29** — a secant on the input error |
| **D19** | `branchCurrent()` returns a device model's own quantity on a device-model terminal instead of the solved branch current, and a flat zero for `switch`, `button` and `dc_motor` — the ammeter reads 43.0 mA on a collector carrying 5.8 mA | bw-board | **1** | 1 | **FIXED** — extraction agrees with the stamp |
| **D20** | The op-amp has no output limit: the follower holds 2.5000 V into 1 Ω (2.5 A) without drooping | bw-board (`devices/analog-ics.js`) | **1** | 6 | **FIXED 2026-08-29** — `rout` + a 40 mA `iShort`, GATED |
| **D21** | `model/circuit.js` filters `p.kind !== 'meter'` out of the netlist before the solve, so a probe draws exactly zero current and cannot load anything | bw-circuit-ui | **1** | 6 | **FIXED 2026-08-29** — the meter is a 10 MΩ resistor in the netlist |
| **D22** | The simulated potentiometer is bit-exact: twelve reads of a still knob give ADC count 380 every time, standard deviation exactly 0 | bw-board | **1** | 6 | open — **design filed** 2026-08-29 (bw-board `3e58fd7`, `spec-updates/seeded-measurement-noise.md`), deliberately not implemented until a consumer exists |
| **D23** | The first solve of a fresh board is a DC operating point, in which a capacitor is an open circuit — so the meter reads 5.0000 V on a capacitor the engine's own `getCapVoltage` holds at 0 | bw-board / bw-circuit-ui | **1** | 6 | **FIXED 2026-08-29** — the first solve honours stored cap state |
| **D24** | There is no FFT anywhere in the circuit UI, and the scope's ring buffer stores an interleaved (min, max) envelope rather than a sample series | bw-circuit-ui + bw-board | **1** | 6 | **FIXED 2026-08-29** — a spectrum view over a second, sample-series tap |
| **D25** | **RE-WORDED 2026-08-29 — the row named the wrong engine.** It said the 6502 target needed a cycle step. Measured: `W65C02.step()` fetches an opcode and runs `_exec` to completion, returning the instruction's cycle count; `Z80Machine.step()`, avr8js and rp2040js are the same shape. None has sub-instruction state, so a cycle step on any of them could only be an instruction step with a different label — the D5 lie. The one core that CAN is emu8051, whose `tick()` advances a single oscillator clock | emu8051-stc, then bw-board + lite (`bw-debug`) | **1** | 7 | **FIXED 2026-08-29** — a real cycle step on emu8051 (3 cycle steps vs 2 instruction steps across the same two instructions), feature-detected; the other four refuse by name with the architectural reason. The circuit-side 50 ms button is unchanged and `machines-buses` keeps its adjudicated sentinel |
| **D26** | **RE-WORDED 2026-08-29 — the row was wrong.** It said the PREFIX bitop form does not compose with a comparison and the INFIX form does not work bare (complementary holes), and located the fault in "the compiler or the referee". Isolated: **the referee's own truth test was inverted** (`num("true")` is 0), which masked a FOUR-WAY backend disagreement on a bare value in condition position — and the referee was one of the four, so every earlier measurement of this defect was taken through it. `20-shift-register-binary` shifted a constant zero because of that, not because of a bitop hole | sb3-creator (referee, then all four backends) | **1** | 7 | **FIXED 2026-08-29** — one `boolishTruthTest` on all four backends, the prefix spelling REFUSED by name; the remaining open half is `not <cond>` in VALUE position, pinned upstream |
| **D27** | `ttl-clock-module`'s step button is electrically isolated (its net carries only `r3.a`, and `r3` goes to ground), and the board has no downstream state at all | sb3-creator (example) | **1** | 7 | **FIXED 2026-08-29** — a D flip-flop as a divide-by-two on the button's own edge |
| **D28** | There is no frames-or-locals view in the debug UI; `Step Out` is real, a call stack is not | lite (`bw-debug` UI) | **1** | 5 | **FIXED 2026-08-29** — and the row's second half is now a FEATURE, not a gap. On the C target there is no call stack to show (a cooperative scheduler is not a stack machine), so the Position pane leads with that refusal in words and then shows what does exist: each task's state, deadline, symbol-table ADDRESS and block. 6502/Z80 get a real return-address stack walk, labelled as candidates because nothing on those machines marks one apart from a pushed register |
| **D29** | **RE-WORDED 2026-08-29 — the row was false, exactly as PLAN.md warned.** It said the pinned emu8051 WASM does not export `_emu_dbg_set_bp_write`. Instantiated, the pinned binary exported it all along; the claim came from a comment inside `emu8051-debug.js`, and this row, a test comment and a lesson hint were all written around it. The REAL defects were two: the halt reported no address or value at all (`struct dbg_halt_reason` carried cause/pc/bp_id/t_ns and reached JS only as an unreadable pointer), and lite's own `circuit-tab.jsx` never put `addWatchpoint` into `debugState`, so the vendored field could not render whatever the emulator supported | emu8051-stc + bw-board + lite (`circuit-tab.jsx`) | **1** | 5 | **FIXED 2026-08-29** — nine halt-reason exports, the breakpoint NAMED rather than matched by PC, `cause: 'watchpoint'` carrying space/addr/value/prev, and the consumer wired. Two real bugs found on the way: `dbg_reset` did not re-seed watch shadows (an SFR watchpoint fired on the reset's own rewrite) and `set_bp_write` accepted any space (armed and dead) |
| **D30** | `microbitplus` blocks are deliberate VM no-ops and the extension declares no `showStatusButton`, so no connection indicator is drawn | lite (`overlay/scratch-vm`) | **1** | 4 | open — see PLAN.md |
| **D31** | The scope's V/div is a single global setting, so two channels of very different amplitude cannot be scaled independently | bw-circuit-ui (`ScopePanel`) | **1** | 2 | **FIXED 2026-08-29** — per-channel V/div and centre |
| **D32** | `arduino-03-calibration` has no filter, so its lesson's "estimate filter delay" has nothing to check against | sb3-creator (example) | **1** | 4 | **FIXED 2026-08-29** — a 4-tap boxcar, as variables and not a list |
| **D37** | `machines-interrupts-performance` asks what an interrupt costs on a bench that cannot raise one: neither Z80 example wires an interrupt source. **CORRECTED 2026-08-25 by measurement** — an earlier draft of this row said the interrupt pins were unconnected. They are not: in all 7 CPU benches `/IRQ` and `/NMI` are tied to VCC, i.e. held inactive, which is correct idle wiring. The real statement is that **no interrupt-capable device OUTPUT drives any CPU interrupt input anywhere in the corpus** — no `mc6850.irqb`, no `w65c22.irqb`, no `tms9918.int`. **And the simulator does not need one:** both `M6502Machine` and `Z80Machine` poll every chip's `irqAsserted` directly, so the drawn tie is schematic. Measured on `eater6502-blink`'s own extracted machine: arming VIA T1 free-running with IER and `CLI` takes **440 interrupts in 1,806,166 cycles**, against 4095 cycles per T1 period. The interrupt machinery works; what is missing is that **no example PROGRAM uses it**, so the lesson has nothing to step through. That makes this the same shape as D7 — ship an interrupt-driven image and re-point the lesson — not the emitter/wiring job first assumed | sb3-creator (examples) + sb3-creator (emitter) | **1** | 7 | **FIXED** — `eater6502-bench` ships an interrupt program; the lesson moved to it |
| **D38** | **FOUND AND FIXED 2026-08-31.** On the AVR path `generateC` emitted the millisecond ISR and `bw_ms`, while the scheduler called an omitted `bw_now()`. Five named programs originally failed to link. The producer now promotes the scheduler's own clock dependency before helper emission (`sb3-creator` `9e7f2f0`); a mutation makes both focused contracts and all five reproducers red. A committed sequential census forces device/debug C and links **80/80** tracked AVR examples with real avr-gcc across ATmega328P/2560/168P and ATtiny88 (`5d6d83c`). Lite pins `5d6d83c`, ships `arduino-02-blink-without-delay` as image 14/14 with zero refusals (`4d4c66f9b`), and production-proves the exact `debug-timing-bugs` bench offline: provenance, scheduler state at SRAM `0x100`, advancing program time, same-pin edit miss, one blocked hosted fallback, 20/20 and zero page errors (`068c5bafc`). The general edited-AVR/ARM hosted boundary remains explicit | sb3-creator + lite | **1** | 5 | **FIXED** — upstream dependency contract, exact native census, shipped image, node execution and watched production browser proof |
| **D39** | **NEW AND FIXED 2026-08-31, found by looking at D2's own browser screenshot.** `runner.variables()` read a fixed **two bytes** for every symbol the table declares, so any variable narrower than that had its NEIGHBOUR spliced into the high byte and the result was then reported to the learner with full confidence. Seen first as a value that could not be: `bw_calm` — a one-byte flag that is 0 or 1 — rendered as **2561** in one run of the proof and **-11775** in the next. Measured at node level on the shipped `nano03-two-tasks` image: the byte holds **0**, the two-byte read gives **59136**. It affects no lesson's checkpoint, because the variables those lessons watch are `generateC`'s own 16-bit ints and were read at the right width by accident | lite (`bw-debug/debug-runner.js`) | **0** | 5 | **FIXED 2026-08-31** — the declared width is honoured, with 2 kept as the FALLBACK so an 8051 symbol table that omits `size` behaves exactly as before, and the signed reading applied ONLY at 16 bits: nothing in the table declares a sign, so reading a one-byte counter as signed would turn 255 into -1 on exactly the variables this fix exists to stop guessing about |
| **D33** | `6502-terminal/controller.json` declares widget type `terminal`, which is not in `ControllerPanel`'s `DEFAULTS`, so `addWidget` throws — and the importer removes every widget *before* adding, inside a bare `catch`, leaving the panel **empty** | bw-board (`controller.js`) + lite (importer) | **0** | 4 | **FIXED** — `terminal` type + guarded restore |
| **D34** | `dc_motor` stamps the winding's inductor companion conductance `dt/L` in parallel with `1/R` rather than in series, so its DC operating point depends on the solver step (1.801 A at 1 µs, 1.980 A at 1 ms, against 0.900 A) | bw-board (`devices/dc-motor.js`) | **0** | 1 | **EXPIRED** — re-measured, no longer reproduces |
| **D35** | The simulator driver armed every read-only pin with `driveHigh = false`, but that argument is the pull's RAIL: a quasi pin idles HIGH, so arming it low clamped 22 of the corpus's 67 wired controls to ~0 V and no button could move its own pin | sb3-creator (driver) | **0** | — | **FIXED** — `553a639`, and gated |
| **D36** | `arduino-02-digital-input-pullup` is the `pinMode(2, INPUT_PULLUP)` sketch — button to ground, no external pull — but declares `PIN btn = D2 INPUT`, i.e. active HIGH, which the driver honours as a programmed pull-DOWN; both sides of the button then sit at 0 V | sb3-creator (example) | **0** | — | **FIXED 2026-08-29** — `INPUT ACTIVE LOW`, and the read inverted to keep the sketch's printed value |

**39 defects. Thirty-six rows are marked closed** — D1, D2, D3, D4, D5, D6, D7,
D8, D9, D10, D11, D14, D15, D16, D17, D18, D19, D20, D21, D23, D24, D25, D26,
D27, D28, D29, D31, D32, D33, D35, D36, D37, D38 and D39 by repair, D34 by re-measurement
(a different and weaker claim: it stopped reproducing between the Wave 1 vendor
and today, and this campaign only found that out), and D12 **partially**, which
its own row says out loud — the 8051 listing is linked locally and gated
offline, editable ASM and the 6502 listing are still hosted. Together they
account for **86 of the 90 lesson-slots** the table counts, and D1 alone is 28
of them. **Three are fully open**: D13, D22 and D30 — and all three are labelled
rather than broken. Every row still open is
recorded in `PLAN.md` with what blocks it and who owns it.

**D2 closed and TWO defects came out of the evidence that closed it.** D39 was
found by looking at the browser screenshot the proof produces — a variable
showing 2561 where only 0 or 1 was possible — which is the argument for making a
gate leave a picture behind rather than a pass/fail line. Building
D2's images is what found
D38: an emitter hole on the AVR path that no lesson review had reached. It is
now closed by the upstream dependency repair, 80/80 native census, fourteenth
shipped image and the exact bench's production proof. The D2 row's own
arithmetic was also wrong in a way worth keeping —
`environment: "simulation"` was offered as the thing that selected the affected
lessons, and 68 of 70 lessons declare it. A field almost everything sets cannot
be a filter, and reading it as one is how "ten Wave 5 lessons" got written down
without anyone asking which ten and on what parts.

**The debugger wave of 2026-08-29 closed three, and two of the three rows were
wrong about what was broken.** D29 said an export was missing from the pinned
WASM; it had been there all along, and the row, a test comment and a lesson
hint had all been written from a source comment nobody had instantiated. D25
named the 6502 as the engine needing a cycle step; that core executes whole
instructions and cannot have one, and the engine that could was emu8051. Both
rows are re-worded above rather than quietly ticked, because a row's wrong
premise is the part a later reader most needs. D28 is the third and its row was
right — but its fix is a REFUSAL: on the C target there is no call stack, and
the pane says so instead of listing one.

**Ten closed on 2026-08-29**, in one campaign across three repos, and they are
not ten independent repairs: six are the instrument family this document's
"shape of it" section named, and four came out of one sb3-creator wave.

The six engine-side ones, which are the family: D18 (the LM358 secant), D20 (the
op-amp's 40 mA output limit, filed under bw-board's MNA gate with hand-computed
oracles in the same commit), D23 (the first solve honours stored capacitor
state) and D22's *design* landed in bw-board `999eb66`+`187694f`+`18555e7`+
`f87adcc`+`3e58fd7`; D21 (a placed meter is a real 10 MΩ in the netlist), D31
(per-channel V/div) and D24 (a spectrum view over a second, sample-series scope
tap) in bw-circuit-ui `3f1d194`+`7696656` with bw-board `9441e4f`+`2169d9b`
supplying `capture: 'sample'`. Lite vendored all of it at bw-board `4ae89b5` /
bw-circuit-ui `60fd117` and re-measured every number before restoring the
lesson copy — the measurements are in `docs/LESSON-REVIEW-WAVE-2.md` §3 and
`docs/LESSON-REVIEW-WAVE-6.md` §1, §6 and §8.

**D21 was two defects, and only one of them was on this table.** The row said a
filtered-out meter draws no current. What the repair measured is worse: leaving
the meter's probe terminals in the nets while filtering the meter out of `parts`
made bw-board's validator reject the WHOLE netlist, so a bench went from 5
engine parts to 0 the moment the probes were wired and the meter then read a
fabricated "0 V" off an empty board. Wiring the instrument destroyed the circuit
it was pointed at. That is worth recording because the ledger's own counting
rule — one row per root cause — hid it: the same missing step caused both, so it
is still one row, but the row understated it.

The four sb3-creator ones are D26 (re-worded, below), D27 (`ttl-clock-module`
grew a D flip-flop as a divide-by-two on the step button's own edge — Q toggles
0.0000/4.4643 V and HOLDS after the press, so `machines-clocks` gets both its
single-step and downstream-transition halves back at v4), D32
(`arduino-03-calibration` grew a 4-tap boxcar, written as four VARIABLES because
list ops lower to `0 /* item */` on the device — settling 4 × 20 ms = 80 ms, lag
(N−1)/2 = 30 ms, staircase 24/49/74/100 %, `interactive-calibration-control` →
v3) and D36 (`INPUT ACTIVE LOW`, with the program's own read inverted so the
sketch still prints the RAW pin). **D36 takes `EXPECTED_DEAD` in
`test/simulator-driver-controls-respond.test.mjs` to EMPTY** — 67 wired controls
dead → 43 → 22 → 1 → 0 across four repairs in three repos — and it took the
counterfactual "armed low" number from 22 to 21 with it, which corrected a small
untruth in that file: the 22 were not "the 8051 side specifically", they were 21
quasi-pin benches plus the one Arduino bench that was dead under every rail. At
21 the sentence is exactly true.

**D26 is RE-WORDED, not merely closed, and the row it replaces was wrong twice.**
Wave 7 read it as "a bitops reporter compared against a number is false". A
later re-measurement read it as two spellings with complementary holes. Both
were descriptions of a shadow: **the referee's own truth test was inverted**
(`num("true")` is 0), which masked a four-way disagreement between the backends
about what a bare value means in condition position — and the referee is the
instrument every earlier measurement of this defect was taken through. One
`boolishTruthTest` now serves all four backends, and the prefix spelling
`bitand a b` is REFUSED by name (it is a reference to a variable nothing writes)
rather than silently read as zero; 0 false positives over 280 programs. Measured
here after the vendor: all three prefix forms refused with the naming warning,
all three infix forms firing including the bare one, and `not` correct in both
directions in condition position. **The remaining open half is a different
shape**: `not <cond>` in VALUE position is a phantom variable and
`cToPseudocode` emits that shape, so it needs a dialect decision rather than a
patch. It is pinned as an OPEN DEFECT test in sb3-creator, which is where the
decision belongs.

**D24 closed further than "partially".** The expectation carried into this pass
was that the FFT and the sample capture would exist upstream while lite still
had wiring to do. Measured, there is none: lite's ScopePanel *is* the vendored
`bw-circuit-ui` panel, the spectrum view opens its own `capture: 'sample'`
channels, and `test/lesson-bench-claims-wave6.test.mjs` drives the whole path
from the bench through `model/fft.js`. The only thing that did not change is
that the drawing ring is still a min/max envelope — and that is a design
decision, not a residue: the envelope is what keeps a narrow pulse visible at a
coarse timebase, so the fix is a second tap, and asking for a transform of an
envelope is refused by name rather than answered.

**D35 and D36 were added on 2026-08-25** by the post-repair re-check
(`docs/POST-REPAIR-RECHECK.md`), which went looking for lesson findings the
Pocket Calculator repair had invalidated and found instead that the repair was
half of one. D35 is closed in the same pass; D36 is the residue it left, named
rather than tolerated, and ratcheted by
`test/simulator-driver-controls-respond.test.mjs` so it can only shrink.

**D8 was closed on 2026-08-25** (sb3-creator `4512354`) with a NEW bench,
`pc89-rl-step` — `src → 100 Ω → 10 mH → gnd` and nothing else — because the
obvious fix would have opened another defect while looking like it closed one.

The obvious fix was to change `pc52`'s capacitor, the same one-parameter move
that closed D10. Measured, C = 0.1 µF gives `signals-resonance` exactly the peak
the Wave 6 review predicted (**+3.871 dB at 5032.9 Hz**, and the response stops
being monotone). It also destroys the RL window: ratio **0.676 at 50 µs** and
**0.193 at 100 µs**, because the current rings at 5 kHz instead of rising.
**The two open defects on `pc52` want opposite capacitors.**

And the failure would have been silent. The old RL sentinel asserted "L/R holds
only in its first 300 µs" — after that change it would still have been true,
more so. So the conflict is now pinned as its own `OPEN DEFECT:` test, and the
mutation proves it: changing `pc52`'s capacitor fires two tests today where it
would have fired none.

On `pc89` the RL law holds to within **0.01 %** at every point out to 5τ, against
0.987 at 300 µs and a reversal by 2 ms on `pc52`. τ = L/R = 100 µs and
I∞ = V/R = 50 mA are the numbers `signals-rl-response` already taught, so its
arithmetic is untouched and only the caveat goes.

**One of D8's three lessons moved, not three.** `electricity-inductor` teaches
the RLC contrast on purpose — "the 100 µF capacitor on the load node owns the
slow tail; the inductor owns the fast jump" — and `signals-resonance` needs the
capacitor. Both stay on `pc52` and both are correct about the bench they name.
Only `signals-rl-response` was being taught on the wrong one; it is version 3 and
points at `pc89-rl-step`.

**D4 was closed on 2026-08-25** (bw-circuit-ui `29f6da6`), and **this row's owner
column was wrong.** It read "bw-board + bw-circuit-ui". `addScopeChannel` has
always accepted `sampleRateHz` and `depth`, and every read inside the engine uses
`ch.intervalNs` and `ch.depth` rather than a constant — so passing a rate through
has always changed the record length. Measured on `43-rc-timing` through the real
engine:

| rate × depth | record | sample interval | what the capture reaches |
| --- | --- | --- | --- |
| 100 kHz × 8192 | 0.082 s | 10 000 ns | 0.649…0.987 V — the first instant |
| 10 kHz × 8192 | 0.819 s | 100 000 ns | 0.310…2.926 V — the rise |
| 1 kHz × 8192 | 8.192 s | 1 000 000 ns | 2.886…4.999 V — the charged tail |
| 100 Hz × 8192 | 81.920 s | 10 000 000 ns | 4.999…5.000 V — long settled |

The whole defect was that `ScopePanel` called `addScopeChannel({type, netId})`
and passed neither, while its own header already claimed the UI "owns timebase".
It owned the *zoom into* the ring and never chose the ring's length. One repo.

The control is labelled by **record length** rather than sample rate, because the
question is "does the thing I want to see fit" and a rate does not answer it. The
panel states the record and the visible span in seconds, so "it does not fit"
became a reading. 100 kHz stays on offer, so a bench that was fine is unchanged.

All **four** of D4's lessons carried text written around it and all four are
restored — `signals-rc-response` → v5, `signals-complex-impedance` → v3,
`signals-aliasing-fft` → v3, `machines-clocks` → v3. Unlike D3, where only two of
four did.

**One sentinel was split rather than deleted.** `OPEN DEFECT: there is no FFT,
and the samples an FFT would need are an envelope` bundled three claims: no
spectrum view, a min/max envelope instead of a sample series, and "the panel
never states its cadence or record length, so the predict step lacks its
inputs". Only the third healed. Following its own delete-me instruction would
have dropped two defects that still reproduce (D24); keeping it whole would have
asserted one that no longer does. It is two tests now, with the boundary written
into both.

**D3 was closed on 2026-08-25** (bw-circuit-ui `2c66851`), and it was the
cheapest of the three big instrument gaps because the engine never had a
problem: `runBode` always returned every `{f, magDb, phaseDeg}` it measured and
`drawBode` discarded all of them. The panel now keeps the rows, labels the
frequency axis the plot never had, renders a table of up to twelve points, and
copies every point as CSV at full precision. Two notes worth keeping:

- the dB labels went from WHOLE decibels to one decimal, because `-3.010 dB` and
  `-3.5 dB` both rendered as `-3dB` — two different answers to "where is the
  corner", which is the question `signals-cutoff-phase` is built on;
- the CSV carries full precision while the table stays readable, because a
  residual analysis that starts from three significant figures is measuring the
  formatter rather than the circuit — and residuals are exactly what
  `signals-model-measurement` asks for.

**Two of the four, not four.** D3 is counted at 4 lessons, and that count is
about lessons the gap AFFECTED. Only two carry text that was written around it —
`signals-cutoff-phase` ("no frequency axis and no per-point readout") and
`signals-model-measurement` ("no numeric readout and no export … record it by
hand"). Those two are restored, to versions 3 and 4. The other two were never
re-worded, so there is nothing in them to restore, and saying "four
restorations" would be counting the defect's cost as the repair's size.

**D11 was closed on 2026-08-25** the same way, and the interesting part is what
it deliberately did NOT do. `43-rc-timing` grew `sw_discharge` + a 1 kΩ
`r_discharge` across the capacitor, so the step repeats. The obvious design — a
CHARGE switch — was rejected: open at rest it would make this bench read 0 V in
its first DC operating point, and this is the bench that demonstrates the engine
reading the supply there (D23, still open, with its own sentinel and its own
sentence in `signals-rc-response`'s hint). A bench change that hides a defect
from the gate that pins it is not a fix, and this repo has already recorded one
of those. Every number both lessons pin is unchanged to four decimals, because an
open switch stamps 1e-12 S. `measurement-rc-cursors` goes to content version 3
and `signals-rc-response` to 4.

**D10 was closed on 2026-08-25** by moving the bench rather than the
instrument — `pc50-two-stage-rc`'s two stages went from 10 kΩ/100 µF to
10 kΩ/100 nF, which moves both corners from 0.159 Hz to 159.155 Hz and takes a
point a decade below the corner from 629 s of simulated time to 0.63 s. The
transfer function depends on R·C, so only the frequency axis moved: the same two
points the Wave 6 review measured at 1 Hz and 10 Hz now read the same
magnitudes, to the millibel, at 1 kHz and 10 kHz, and that equality is what the
gate asserts. `signals-bode-sweep` and `signals-model-measurement` are restored
to content version 3, and a paired gate refuses a bench repaired without its
lesson.

## Why these thirty-four, and not thirty-eight

The reviews report 38 *defective lessons*. This table has 34 *defects*, and the
two numbers count different things. Several lessons were defective for a reason
that is now entirely repaired in copy and has no residue anywhere else —
`electricity-polarity` named the wrong component, `measurement-resistance`
applied a formula to a pair that is not on its bench, `signals-rl-response`
named the wrong R. Those are closed. What survives here is the subset with a
cause outside the lesson.

Conversely, D1 appears in no wave's defect list at all. Wave 1 recorded it as "a
structural note that belongs to the whole catalog, not to Wave 1", and no wave
counted it — so the largest open defect in the campaign, by a factor of two, was
never on anyone's list. It is first here because the ranking is by lessons
affected and nothing else.

## Grouped by owner

| Owner | Defects | Lessons | Closed here |
| --- | --- | --- | --- |
| bw-board | D9·D13·D17·D18·D19·D20·D22·D23·D33·D34 | 12 | D17, D18, D19, D20, D23, D33, D34 |
| lite | D1·D2·D14·D15·D16·D25·D28·D29·D30·D39 | 46 | D1, D2, D5, D14, D15, D16, D25, D28, D29, D33, D39 |
| bw-circuit-ui | D3·D4·D6·D9·D21·D24·D31 | 15 | D3, D4, D6, D21, D24, D31 |
| sb3-creator | D5·D7·D8·D10·D11·D12·D26·D27·D32·D35·D36·D38 | 19 | D5, D7, D8, D10, D11, D26, D27, D32, D35, D36, D38 |

Rows appear under every owner that must change, so the columns oversum: D6,
D9 and D33 each need two repos (D4 was listed as needing two and did not —
measured 2026-08-25, the engine already took both parameters) and D5 needed three — the example file, the panel
model's persistence, and the host's restore path. Fixing only the example would
have been undone by the first save.

## The shape of it

Three families account for twenty-eight of the thirty-four.

**The instruments report pictures, not numbers.** The Bode sweep draws a curve
with no axis (D3), the scope has one fixed record length (D4) and one global
V/div (D31), there is no spectrum view (D24), and the meter is filtered out of
the netlist before the solve so it cannot load anything (D21). Every one of
these is a *readout* gap on top of an engine that computes the right answer —
`43-rc-timing` matches 5(1 − e^(−t/τ)) to four decimals, and the sweep's −3 dB
and −45° crossings bracket the same cutoff. The physics is not the problem.

**All five of that family are now closed** (D3 and D4 on 2026-08-25, D21, D24
and D31 on 2026-08-29), and the family held: not one of them needed a change to
the solver. D21 came closest and still did not — the meter is stamped as the
resistor it physically is, and the numbers it then reads are the ones the
existing MNA already produced.

**The interactive surfaces are younger than the lesson copy.** The widget
inspector edits decoration and nothing else (D14), a widget cannot be re-bound
(D15), the micro:bit simulator declares sensor ranges nobody varies (D16), the
faceplates open in edit mode (D5), and a widget type an example ships is not a
type the panel has (D33). Wave 4 said this in its own words and Wave 5 said it
about the debugger: *six of its eight lessons describe a surface slightly richer
than the one that exists.*

**Three benches were chosen against limits nobody checked.** `pc50-two-stage-rc`
corners below the sweep's practical range (D10), `pc52-inductor-filter` is an
RLC asked to be an RL (D8), `43-rc-timing` has no control to repeat its own step
(D11), and three machine benches boot with no ROM (D7). **D10, D11 and D8 are now
closed**; D7 is not — and D8 was the one that did NOT yield to a parameter
change, because `pc52` is wanted as an RLC by two other lessons. These are the cheapest
of the lot to fix and the ones most likely to be fixed by *changing the bench*
rather than the instrument.

That prediction held for the two that were tried: **D10 was closed by a
two-character change to a capacitor value**, and it was the right change rather
than the cheap one — the instrument's cost model (10/f seconds of simulated time
per sweep point) is a property of correlation measurement and not a defect, so
the bench was the thing in the wrong place. The measured proof that only the
axis moved is in D10's note above.

## Reproducing the counts

```
node --test test/wave-open-defects.test.mjs
```

A note on the neighbouring gate, because it fired during this work and the
answer is not to touch it. `test/lesson-numeric-contract.test.mjs` refuses a
number in lesson prose that the named bench cannot produce, and it also refuses
to trust its own result when too many benches outran their 15 s measurement
budget. On a box carrying four other agents' test suites — load 34 on four
cores, 25 node processes — eight benches outran it against a ceiling of four,
and the gate's own classifier reported `COMPUTING, not starved: … Compare
against a quiet run before touching either number.`

That is the gate working. Raising the ceiling to make it pass would destroy the
only thing it does.

Two measurements settle what it could not settle for itself, and neither needed
a quiet box:

- **The claims it protects pass.** `checkLesson` run directly over the five
  lessons this campaign revised examines thirteen quantities and matches all
  thirteen — `10 Ω`, `10.000 Ω`, `9.804 mA`, `98.0 mV`, `4.950 mA`, `49.5 mV`,
  `0.005 V`, `0.0 mA`, `0.696 V`, `0.201 V`, `5.83 mA`, `5.83 mA`, `0.43 mA`.
  Nothing unmatched. What fails is the gate's coverage guard, not its subject.
- **The overrun is the box, not this branch.** Running the same truncation probe
  over all 51 lesson benches on lite `7ce24a619` and on this branch, back to
  back under the same load, gives the SAME set both times:
  `eater6502-full-build` and `ttl-clock-module`. Zero additional truncation from
  these changes. That comparison is the right instrument precisely because it
  does not need a quiet machine — both halves see the same one.
- **And the gate then agreed with itself.** Re-run once the other agents' suites
  drained — two node processes instead of twenty-five — it passes: `3 tests,
  3 pass, 0 fail`. So of the two possibilities its message names, it was the
  second: the box was slow, not the benches. Nothing was changed to make that
  happen, which is the point.

The gate re-derives this table's lesson counts from the wave JSON rather than
trusting the prose, so a lesson that stops naming a defective bench takes the
count down with it. Each fixed row is asserted **fixed**, and each open row is
asserted to **still reproduce** by the wave gate that already pins it.

## D-SMOKE1 — the debugger smoke test cannot run, and its skip hid three defects (2026-09-03)

`scripts/smoke-debugger.mjs` runs on every build via `npm run smoke:debugger`, and the step
downgrades exit 2 ("missing local tool") to a warning. Given sdcc and a stc-compiler checkout it
does NOT pass — it has been unable to run since sdcc-wasm landed, and the skip was the only
thing anyone ever saw. Found by widening `gate-coverage`'s inventory, then giving it its tools.

Reproduced locally with sdcc 4.2.0 and `/mnt/volume1/code/stc-compiler`.

**1. FIXED — the fetch stub crashed on any non-POST request.** It did `JSON.parse(init.body)`
unconditionally, and `compiler.js:31` fetches its runtime pack as `fetch(url)` with no `init`.
The result was `Cannot read properties of undefined (reading 'body')`, reported as "local WASM
compilation failed", which reads like a compiler fault. The stub now serves the toolchain's own
assets from the build directory that `document.baseURI` already points at, and names a missing
asset instead of dereferencing undefined. **The error message now identifies the real cause.**

**2. RESOLVED 2026-09-03 — the sdcc-wasm toolchain runs under Node.** Recorded as needing "a
Node-targeted build of the toolchain, not a shim", on the strength of a third failure
(`memory access out of bounds`) read as the module misbehaving. It was not: the first two
failures (`require is not defined`, `__dirname is not defined`) were the module being loaded as
an ES import when it is CommonJS, and the third followed from a STALE toolchain in `build/` —
the pre-2026-08-31 64 KiB-stack build whose stack overflow corrupts SDCC's own static data.
`compiler.js` now loads the Emscripten glue through a Node branch that evaluates it as CommonJS
with a real `require`/`__filename`/`__dirname`, and the smoke resolves the toolchain from the
tree rather than from `build/`.

Measured directly, outside the smoke harness — a staged app root, a `file:`-capable `fetch`, and
`compile(src, {target: 'stc12c5a60s2'})` — returns `success=true bytes=528` and real Intel HEX.
The lesson is the one the D29 header already carries: the third failure was a consequence of the
first two being worked around in the wrong place, and "the module is misbehaving" was a
conclusion drawn one step before the environment was actually correct.

**3. CORRECTED 2026-09-03 — filed as a product bug, it is mostly a deliberate trade-off.**
bw-ci challenged this and was right on every point. Recorded in full because the original
version of this entry would have sent someone to "fix" a decision.

What I wrote: `createCompilerFetch` returns `compileLocal(...).then(...)` with no `.catch`, so a
runtime failure of the in-browser toolchain fails the `/compile` request outright instead of
falling through to the hosted compiler.

What the code says, in the first six lines of the file I was diagnosing — I read from line 10:

    * A supported request never silently falls back after a local failure: that
    * would turn offline/debug failures into surprising network traffic.

So the missing `.catch` is the STATED INTENT with a reason. "Compilation fails instead of
degrading to the hosted compiler" is a fair description of the behaviour and an unfair
description of the decision: degrading is exactly what the author refused, so that a learner
working offline or in the debugger does not have a local failure quietly become a network round
trip. **Do not add a `.catch`** — that silently reverses a recorded choice.

Two further specifics of mine were simply wrong:

- It does NOT install unconditionally. `debug-runner.js:626` is
  `if (LOCAL_8051_TARGETS.has(compileTarget)) await installWasmCompilerRouting(setStatus)`,
  and `localTargetSupported(body.target)` gates each request again inside the intercept.
  `installWasmCompilerIntercept()` is unconditional once CALLED, which is a different claim.
- Therefore the blast radius is five parts, not every build.

**What survives, and it is the better finding: there is no opt-out.** `LOCAL_TARGETS`
(`compiler.js:4-10`) is a frozen allowlist of five STC parts with no flag, so for those five a
broken or half-cached toolchain cannot be bypassed at all. That is a real gap, and a DIFFERENT
gap from the missing `.catch`. The repair is a design call in someone else's feature, and the
two shapes that satisfy the header rather than reversing it are:

  (i) a LOUD fallback — fall back to hosted AND tell the user it happened, which honours
      "never *silently*"; or
  (ii) an explicit opt-out, so a stuck user can force the hosted compiler.

**CLOSED 2026-09-03 with shape (ii).** `localCompilerOptedOut()` in `debug-runner.js` reads
`?localCompiler=off` from the URL, or `localStorage.bwLocalCompiler = 'off'` to persist it, and
the compile path skips installing the in-page intercept when it is set — so the request reaches
the compiler service by the ordinary route. The status line says
`in-page 8051 compiler off by request — using the compiler service`, because the header's
objection is to a *silent* fallback and this one is asked for out loud.

Shape (ii) rather than (i) deliberately: it leaves the default behaviour and the header's promise
exactly as they were, and adds only a door. An automatic fallback, however loud, changes what
happens to every learner whose local build fails — which is the decision `intercept.js` made on
purpose and which is not mine to reverse.

The default is what most of `test/local-compiler-opt-out.test.mjs` is about: an absent, empty,
unrelated or unreadable preference must all mean "use the in-page compiler", since anything else
quietly puts a failed local build on the network. `?localCompiler=on` overrides a stored `off`,
and an empty `?localCompiler=` is present-but-unset rather than a request. Mutation-proved four
ways, including one that unwires the call site — a predicate nothing consults would have been no
feature at all, which is species 16 applied to this repair.

Owner: still whoever owns sdcc-wasm; this is the smaller of the two shapes that record allows,
and it is reversible in one condition if they want (i) instead.

The lesson for me: I read a function's error path without reading its file's header, and the
header governed it. That is the mirror of the mistake in the other direction — treating a comment
as evidence about code it does not govern. Here the comment governs the code directly beneath it,
and skipping nine lines turned a trade-off into a bug report.

**RE-ENABLED IN CI 2026-09-03, and it needed neither of the things this paragraph assumed.**
The note said re-enabling required (2) plus an sdcc install. (2) is resolved above — and the sdcc
install was never needed at all.

Instrumenting the smoke's own fetch stub showed the native-sdcc fallback is **not called once**
in a full run: every supported 8051 target is compiled by the in-tree WASM toolchain. Confirmed
by removing sdcc from `PATH` entirely, whereupon the script still exits 0. So the startup check
`execFileSync('sdcc', ['--version'])` — which exits 2, which CI downgraded to a warning — was
shadowing every assertion in the file over a tool the file does not use. It is now checked at the
point of use, inside the fallback, where the answer matters.

What CI actually needed was the stc-compiler checkout, for the independent disassembly oracle.
That is one `actions/checkout` step. With it, the smoke step no longer swallows anything: the
`|| { … -eq 2 … }` branch is gone, and `KNOWN_SWALLOWED` in `test/gate-coverage.test.mjs` is now
**empty** — its only entry was this step, whose own excuse called itself "a promise to come back,
not a resolution". Mutation-proved: re-introducing the swallow fails
`a step that swallows a gate failure has to say why`.

The structural lesson stands and is now sharper: a prerequisite check that exits before the
assertions shadows them indefinitely, a step that downgrades that exit to a warning makes the
shadow permanent — and nobody had checked whether the prerequisite was even real. It was not.


## D-EMU-BP — the three "emulator breakpoint" defects, resolved (2026-09-03)

D-SMOKE1 recorded three defects that the un-runnable smoke test had been hiding. With the
test running, all three were reproduced directly against the vendored WASM. **One was real
and is fixed, one was real, differently caused, and is fixed, and one did not exist.** They
are written up separately because they failed for unrelated reasons and only looked like one
family — "breakpoints don't work" — from the outside.

### D-EMU-BP1 — `emu_dbg_set_bp_code` never halts. **This defect does not exist.**

Filed as: breakpoints at `0x233`, `0x15e` and `0x186` do not stop the program, while
`toggleAddressBreakpoint` reports success.

Both halves are wrong, and the second half is what made the first look like a product bug.
Against the vendored build, a code breakpoint halts at both layers — the raw export and the
adapter:

    raw _emu_dbg_set_bp_code(0x0003) -> 1 ; run -> pc=0x3, halt_bp=1
    adapter setBreakpoint({kind:'code',addr:3}) -> 1 ; run -> halted, pc=0x3, cause 'breakpoint'

Addresses above `0xFF` are not special either. On a program whose only executed instructions
are at `0x233` and `0x234`, a breakpoint at `0x233` halts and breakpoints at `0x15e`, `0x186`,
`0x100` and `0xff` do not — because **those addresses are never executed**. That is the
breakpoint working, reported as the breakpoint failing.

The observation was real; the inference was not. `toggleAddressBreakpoint` "reporting success"
is also correct behaviour: arming a breakpoint at an address is a different claim from that
address being reached, and the store deliberately keeps marks the current build cannot resolve
(`unreachableBreakpoints`). What was missing was anything that checked the address was on the
execution path — see the note on the smoke script's hardcoded addresses below.

Pinned by `test/emu8051-readmem-length.test.mjs`'s sibling reasoning and by the fact that
D-EMU-BP2's repair is now demonstrated by a code breakpoint at `0x180` halting in 1 ms.

### D-EMU-BP2 — a pause point on a `repeat` loop top never fires. **Real. Fixed.**

Filed as: yield breakpoints fire for the `wait` state but not the loop-top state
(`bw_task1` state 1 at `0x180`).

Accurate, and the cause is in neither the emulator nor the adapter. Instrumenting the pump
showed the breakpoint firing correctly on the very first frame and then being thrown away:

    pump#1 budget=16666667 pc=0x180 stopped=true state=0    <- the breakpoint hit
    pump#2 budget=16666667 pc=0x233 stopped=false state=0    <- and the run continued

`debug-runner.js`'s `shouldSkip()` swallows a halt when `stillWaiting()` says the task is
mid-`wait`. That suppression exists for a good reason — a yield breakpoint sits on a `case`
label the scheduler re-enters on every pass, so a pause point on `wait 0.3 seconds` fires
thousands of times during one wait — but it was asking the wrong question in two ways:

1. It looped over **every** task and returned true if **any** of them was waiting, while its
   own doc comment said "the task we stopped in". With two scripts running, one sitting in a
   `wait 1 seconds` swallowed every breakpoint in the project for as long as it waited.
2. It applied to **every** breakpoint hit, not only to pause points that are themselves a
   `wait`. A `repeat` loop top has no deadline of its own and should never have been tested
   against one.

The halt at `0x180` was hit by both: the mark is a `repeat`, and the *other* task
(`bw_task0`, `until:150`) was mid-wait. `stillWaiting()` now resolves the halt's block, returns
early unless that block's yield kind is `wait`, and compares only that block's own task:

    position: [{"task":"bw_task0","state":2,"until":150},{"task":"bw_task1","state":1}]
    pc 0x180, cause breakpoint            <- halts on frame 1, with task0 still waiting

Pinned by `test/debug-runner-wait-skip.test.mjs`. The predicate was lifted out of the runner's
closure into an exported pure function (`waitStillPending`) specifically so that gate can exist:
the only thing that caught this defect is `npm run smoke:debugger`, which exits 2 and is SKIPPED
in CI for want of SDCC, so a closure-private fix would have shipped with no gate that runs
anywhere. Mutation-proved in both directions — restoring "is ANY task waiting?" fails one
assertion, and dropping the "is this block a `wait`?" guard fails another. The second mutation
initially passed, because the first draft's `repeat` task carried no deadline at all and so
returned false for the wrong reason; the added case gives that task a *leftover* `until` from
the wait it has already left, which is what the generated C actually reports.

One repair closed all seven of the smoke test's failing assertions — never paused, wrong halt
reason, no glow, neither task lit, `glowBlock` never called, no recorded values, and the editor
bridge returning nothing — which is the evidence that this was the single cause behind them.
Conditional pause points still skip correctly (`1800 earlier hits skipped`), so the suppression
this narrows is still doing its job.

### D-EMU-BP3 — `readMem('code', 0, 0x10000)` silently short-reads. **Real. Fixed.**

Filed as: about 270 correct bytes followed by zeroes, worked around by chunking in the smoke
script.

Real, and worse than filed: it was not specific to the smoke script, and the seam is at exactly
256 bytes, not ~270.

`emu_dbg_read_mem` answers out of a fixed 256-byte scratch buffer in C and does **not** clamp
the length it is handed. The adapter passed `len` straight through and then wrapped the full
requested length around the returned pointer, so a caller got 256 bytes of program followed by
whatever the heap happened to hold — no error, no short count, nothing to test:

    readMem(code,0,256) -> first wrong byte at none
    readMem(code,0,257) -> first wrong byte at 256
    readMem(code,0,2048) -> first wrong byte at 256

Every bulk reader was exposed, not just the smoke script: the hex view and the disassembler both
issue reads far larger than 256 bytes, and a 64 KB code read came back looking like an erased
chip. The adapter now issues the read one bufferful at a time, advancing both the output offset
and the address, and falls through to the byte-at-a-time path if a chunk ever returns null.

Pinned by `test/emu8051-readmem-length.test.mjs`, which reads *across* the 256-byte seam in
three ways — a long read, a read compared byte-for-byte against the slow path, and a read that
starts past the seam so a chunking loop that forgot to advance the address cannot pass.
Mutation-proved: restoring the unchunked read fails all three; the fix passes all three.

### The test defect underneath D-EMU-BP1

`scripts/smoke-debugger.mjs` sets its address breakpoint at a **hardcoded** `0x0170` and its PC
at a hardcoded `0x0100`, neither of which it checks is an instruction the loaded program
reaches. It already has the material to do better — it disassembles the image it just loaded
into `oracle`, with real instruction boundaries. A hardcoded address that happens to be
unreachable produces exactly D-EMU-BP1: an armed breakpoint, a successful-looking toggle, and no
halt, reported as an emulator fault. This is the same species as the gates-that-cannot-fail
family, inverted: not a gate that cannot fail, but one that fails for a reason unrelated to what
it claims to test.

## D-CORPUS1 — the corpus differential had never run, and the first run failed (2026-09-03)

`test/corpus-differential.test.mjs` compares the emitter against the trace oracle over a rotating
sample of the gallery. It is env-gated on `CORPUS_DIFFERENTIAL=1`, and **nothing has ever set
it.** Measured rather than assumed: the unit-test step of the last green CI build reports exactly
one skip over 1804 tests, and it is this one. Its own header says "Enable in CI with:", and its
sample offset is derived from day-of-year so that "successive CI runs cover different parts of the
gallery" — a rotation that has never had a second run.

That is species 16 in its politest form. Unlike the debugger smoke, this skip is *honest*: it uses
node:test's `{skip: reason}` and prints `# SKIP CORPUS_DIFFERENTIAL not set`. Visible and
permanent is still zero coverage.

### Two defects in the harness itself, both fixed

**The sample could be empty, and an empty sample passed.** `pairs.slice(offset, offset + count)`
does not wrap, so an offset at or past the end returns `[]`, the comparison loop runs zero times,
the failure flag stays false and the process exits 0 — a run that reports success having compared
nothing. That is precisely the defect this differential exists to catch in the emitter, and it was
the harness's own behaviour. It could not be gated where it lived, inside a network-bound CLI that
ends in `process.exit`, so the rule moved to `scripts/corpus-sample.mjs` and is pinned by
`test/corpus-sample.test.mjs` — the same lesson as D-EMU-BP2.

**The rotation could not reach the end of the corpus.** The caller wrapped at a hardcoded 200
("to stay in range") while the gallery yields **224** eligible pairs, so pairs 200–223 were
unreachable. Only the corpus walk knows that bound, so the wrap belongs there and the caller now
passes the raw rotation. Mutation-proved three ways: the original slice fails five of six
assertions, a sign-preserving single modulo fails the negative-offset case, and accepting
`count < 1` fails the refusal case.

### What the first real run found — owner: sb3-creator

With the gate enabled, today's offset failed **6 of 6 pairs**, in two distinct ways:

    arduino-08-string-append -> nano: main.c:35:24: warning: left shift count >= width of type
                                      static char bw_arena[1 << 16];
    arduino-08-string-append -> pico: main.c:7:10: fatal error: stdio.h: No such file or directory

Both come from `cHostRuntime.js` — the **host** C runtime, being compiled for a microcontroller.
`int` is 16 bits on AVR, so `1 << 16` overflows; bare-metal ARM has no `stdio.h`.

The emitter is behaving as documented. `sb3-creator.js:8243` states the rule in its own words:
*"Which target a project gets is decided by the project — declared pins mean the chip, everything
else means the host."* `arduino-08-string-append` declares `DEVICE ARDUINO-UNO`, binds no pins and
only prints strings, so it is a host program by that rule and gets host C.

**The mismatch is in the computed `devices` list**, which claims device targets the emitter's own
rule makes unbuildable. That example lists eleven, including `arduino-nano` and `pico`. Across the
gallery, **24 of the 113 examples claiming nano/pico bind no hardware at all** (no `PIN`, `PART`
or `CHIP`): fourteen `arduino-04/08-*` string and character programs, eight micro:bit `mb0*`, and
`spike01-obstacle-avoid`. `mb01-display` declares `DEVICE MICROBIT` and lists eleven other chips,
which is what shows the list is computed rather than curated.

Stated with its limits: **six pairs were compiled and all six failed; the other 24 examples match
the structural pattern and were not individually compiled.** The count of 24 is also a correction
of my own first pass, which said 25 by looking only for `PIN` — `08-led-chaser-595` binds its pins
through `PART leds = 74HC595 data P1.0 …`, and counting it would have inflated the claim in a
filing that exists to complain about inflated claims.

### The pairing was a category error, and that half IS fixed here

The first draft of this entry said the gate could not be enabled until sb3-creator corrected the
lists. That was too quick. Pairing a host program with a microcontroller is a mistake the HARNESS
makes, not a defect it detects: host C fails to compile for AVR and bare-metal ARM every time, for
every one of those programs, and reporting that as emitter-vs-oracle disagreement is measuring its
own input. The differential now asks the same question the emitter asks — does this program bind a
`PIN`, `PART` or `CHIP`? — and only pairs device programs with devices. 224 candidate pairs become
**176 real ones**, and the 24 host-only programs are named on stdout, never dropped silently.

`bindsHardware()` is pinned by `test/corpus-sample.test.mjs`, including the case that caught my own
first count: `08-led-chaser-595` binds three pins through `PART leds = 74HC595 data P1.0 …` and no
`PIN` line, so a PIN-only test would have dropped a real device program — the expensive direction
of this mistake. Mutation-proved both ways: PIN-only fails, and an unanchored match that lets the
word in a comment promote a host program fails.

The `devices` computation is still wrong and still sb3-creator's: a list that claims eleven chips
for a program binding nothing is over-claiming whatever the harness does about it.

### What the gate finds — DIAGNOSED 2026-09-04, and my first two readings were both wrong

40 pairs from offset 0, in 44 seconds: **31 AGREE, 9 DIFF, 0 ERROR.** Every disagreement is a
timing one, and **all nine have a single cause, which is not an emitter defect.**

**The referee models program execution as instantaneous; a real device spends time.**
`interpretTrace` walks the project's blocks and charges nothing for the walk, so a bit-banging
inner loop completes at `t=0`. The compiled program on avr8js or rp2040js pays for every
instruction. The divergence is therefore a function of how much work a program's inner loop does
per unit of simulated time, which is why it lands on exactly the PWM, shift-register, dimmer and
motor programs and on nothing else.

The evidence is one dump of both traces, event by event, rather than the comparator's summary:

    20-shift-register-binary -> pico
      ref    224 events   clock@0=1 clock@0=0 clock@0=1 clock@0=0 …   (the whole shift, at t=0)
      actual 204 events   clock@0=1 clock@0=0 clock@1=1 clock@1=0 …   (the same shift, over ms)

Same 2500 ms horizon, 20 fewer toggles completed. And the device-speed prediction holds where it
can be checked against itself: `24-pwm-fade` drifts **+1 % linearly** on the nano (+1 ms at ref
100, +2 at 200, +6 at 600, **+24 at 2400**) and matches the referee **exactly** on the pico, which
does the same work about ten times faster and stays inside the 5 ms tolerance.

### Two corrections to my own entries above, of the same shape

**I reported the skew as "a constant +6 ms, not a drift". It is a drift — 1 %.** The error was in
where I read: `compareTraces` reports only the first three disagreements *past* its tolerance, so
every value I saw was from the tail of an accumulating error, after it crossed 5 ms. The +6 at ref
600 and the +6 at ref 1000 looked like the same fixed offset; the +1 at ref 100 and +2 at ref 200
were below tolerance and never printed. **I read a filtered view as if it were the data**, which is
the same mistake as reading two fields of a probe and ignoring the third.

**I then reported "two signatures pointing in opposite directions … unlikely to share a cause".**
There is one cause. The 692 ms item was not a second signature: with fewer iterations completed
inside the horizon, the per-pin sequences end at different points, and comparing the Nth entry of
each is comparing different moments in the program. It is the same instantaneous-referee gap seen
from the end of the trace instead of the middle.

Both corrections were available from one command — printing `ref` and `actual` side by side — and
I filed twice before running it. The lesson is the one this document keeps re-learning in new
costumes: **a comparator's diff list is not the measurement, it is the comparator's opinion about
the measurement.** Ask the two sides directly.

### What this means for the gate, and a dead option that was built for exactly this

The nine DIFFs are not emitter bugs, so there is nothing here for sb3-creator to repair. What is
missing is a budget for a modelling gap that is known and documented — and `compareTraces` already
has the knobs, added with measured comments citing the 6502 (`~9 ms/s under cc65 -O`, `main ~8 ms
after reset`):

    const driftPerSec = opts.driftPerSecMs ?? 0;
    const startup     = opts.startupMs ?? 0;

**No caller anywhere in the repository passes either.** Both corpus call sites pass only `tolMs`
and `serialMsPerByte`, and `test/oracle-trace.test.mjs` passes nothing at all. They are dead
parameters: a capability built for this exact situation, never wired, and therefore never able to
help the one gate that needed it.

Wiring them is the repair, and it is deliberately NOT done here, because the number matters more
than the mechanism. A per-device `driftPerSecMs` has to be measured across the corpus and then
justified, and one chosen to turn today's nine red pairs green would hide every future emitter
regression smaller than itself — which is precisely the move the rest of this document exists to
prevent. It needs a measured budget with the measurement written down, not a number that makes the
build pass.
