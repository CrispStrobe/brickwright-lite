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
| **D2** | **RE-WORDED 2026-08-31 — the row's premise was right and its arithmetic was not.** It said "all ten Wave 5 lessons declare `environment: "simulation"`", which reads as though that field selects the affected set. Measured at tip: **68 of 70** lessons declare it, so it selects almost everything and discriminates nothing. The set that actually could not start offline is the one whose bench needs a compiler — 41 lessons name an example with an MCU program, 25 of those on a non-8051 part. Wave 5's ten split **five 8051 / four AVR / one RP2040**, which is the real shape of the row | lite (`bw-debug/debug-runner.js`) | **12** | 5, 3, 7 | **FIXED 2026-08-31 in two halves, and the halves are different repairs.** The 8051 half is a compiler that runs in the browser (four WASM stages; see PLAN.md). The other half is D7's answer, not a smaller network call: the lesson benches whose compiler CANNOT run in a browser now SHIP their image. 13 images, 204 KB, one per (example, target, format), keyed on the generated C and used without the network; the panel says in words that the image is prebuilt, when it was built and with which compiler, and that an edit makes it stop applying. **The honest residue, named rather than hidden:** a program the learner has EDITED on an AVR or ARM bench is a program nobody has compiled, so it still needs the hosted service and still refuses honestly without one. That is the boundary of what a shipped image can do, and it is the reason the sentence in the panel ends where it does |
| **D3** | The Bode sweep reports no numbers: `drawBode` writes four strings on a 260×140 canvas (two dB extremes, ±180°), no frequency axis, no per-point value, no export | bw-circuit-ui | **4** | 6 | **FIXED** — axis, table and CSV |
| **D4** | The scope record is fixed at 100 kHz × 8192 = 81.92 ms; both numbers are hard-coded in `addScopeChannel` and `ScopePanel` passes neither | bw-circuit-ui (**not** bw-board — see below) | **4** | 6, 7 | **FIXED** — a record-length control |
| **D5** | Four faceplate layouts ship no `"mode": "play"`, and `ControllerPanel` defaults to `edit` where every input control renders `disabled`; the panel's own `toJSON`/`fromJSON` drop `mode` entirely, so even a corrected file is lost on the first save | sb3-creator (examples) + bw-board (`controller.js`) + lite (`gui.jsx`) | **3** | 4 | **FIXED** — three repos |
| **D6** | `bw-circuit-changed` is dispatched only when the derived **pin declarations** change, so on an MCU-less bench no wiring edit can raise it | bw-circuit-ui (`CircuitDesigner`) + lite (`circuit-tab.jsx`) | **3** | 1, 6, 7 | **FIXED** — `onCircuitEdit` |
| **D7** | Three machine benches boot with an empty ROM: no example ships an image, `sb3-creator` has no assembler, and the runner skips the build for machine targets | sb3-creator (examples) | **3** | 7 | **FIXED** — an assembler and three shipped ROMs |
| **D8** | `pc52-inductor-filter` is an RLC used as an RL bench; the L/R law holds for its first ~300 µs and then the 100 µF takes over | sb3-creator (example) | **3** | 1, 6 | **FIXED** — a new RL bench |
| **D9** | A Bode point costs 10/f seconds of simulated time (`settleCycles` 6 + `measureCycles` 4) and `SweepPanel` ran the sweep synchronously | bw-circuit-ui | **2** | 6 | **FIXED** — chunked/worker session, progress and cancellation |
| **D10** | `pc50-two-stage-rc` corners at 0.159 Hz, so the decade below the corner its own lesson asks for costs 629 s of simulation per point | sb3-creator (example) | **2** | 6 | **FIXED** — 100 µF → 100 nF |
| **D11** | `43-rc-timing` has no controls at all, so the charging step it measures happens once and cannot be repeated | sb3-creator (example) | **2** | 2, 6 | **FIXED** — a discharge switch |
| **D12** | There is no ASM emitter; the Code tab's ASM view is real but both its modes go over the network (`/compile`, `/assemble`) | sb3-creator | **2** | 3, 7 | open — see PLAN.md |
| **D13** | `board.resistance(a, b)` is directional — B is the reference and ground symbols are deliberately switched out of that solve, so a real path reads as open when probed the other way | bw-board (`mna.js`) — **by design** | **2** | 2 | open — not a bug |
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
| **D38** | **NEW 2026-08-31, found by building the D2 images.** On the AVR path `generateC` emits the millisecond ISR and `bw_ms`, and `main()`'s idle fast-forward calls `bw_now()` twice — but the AVR preamble only DEFINES `bw_now()` when something in the program set `_cUses.now`, which `wait` does and `timer` does not. A program with a cooperative task and no `wait` therefore emits C that calls a function it never declares, and avr-gcc refuses it at the link (`undefined reference to 'bw_now'`). **5 of the 80 AVR examples** reproduce: `arduino-02-blink-without-delay`, `arduino-02-button`, `arduino-02-debounce`, `arduino-08-string-addition`, `arduino-sk-p09-motorized-pinwheel`. The first is `debug-timing-bugs`'s own bench, so that lesson has never had a buildable image — with or without a network, before or after D2. It is the only one of D2's fourteen that could not be shipped | sb3-creator (emitter, AVR preamble) | **1** | 5 | open — named refusal in `static/lesson-images/manifest.json`, ratcheted by `test/shipped-lesson-images.test.mjs`. Lite must not patch a vendored file; the fix is one gate in the AVR preamble upstream |
| **D33** | `6502-terminal/controller.json` declares widget type `terminal`, which is not in `ControllerPanel`'s `DEFAULTS`, so `addWidget` throws — and the importer removes every widget *before* adding, inside a bare `catch`, leaving the panel **empty** | bw-board (`controller.js`) + lite (importer) | **0** | 4 | **FIXED** — `terminal` type + guarded restore |
| **D34** | `dc_motor` stamps the winding's inductor companion conductance `dt/L` in parallel with `1/R` rather than in series, so its DC operating point depends on the solver step (1.801 A at 1 µs, 1.980 A at 1 ms, against 0.900 A) | bw-board (`devices/dc-motor.js`) | **0** | 1 | **EXPIRED** — re-measured, no longer reproduces |
| **D35** | The simulator driver armed every read-only pin with `driveHigh = false`, but that argument is the pull's RAIL: a quasi pin idles HIGH, so arming it low clamped 22 of the corpus's 67 wired controls to ~0 V and no button could move its own pin | sb3-creator (driver) | **0** | — | **FIXED** — `553a639`, and gated |
| **D36** | `arduino-02-digital-input-pullup` is the `pinMode(2, INPUT_PULLUP)` sketch — button to ground, no external pull — but declares `PIN btn = D2 INPUT`, i.e. active HIGH, which the driver honours as a programmed pull-DOWN; both sides of the button then sit at 0 V | sb3-creator (example) | **0** | — | **FIXED 2026-08-29** — `INPUT ACTIVE LOW`, and the read inverted to keep the sketch's printed value |

**38 defects. Thirty-three are closed** — D1, D2, D3, D4, D5, D6, D7, D8, D9,
D10, D11, D14, D15, D16, D17, D18, D19, D20, D21, D23, D24, D25, D26, D27, D28,
D29, D31, D32, D33, D35, D36 and D37 by repair, and D34 by re-measurement, which
is a different and weaker claim: it stopped reproducing between the Wave 1
vendor and today, and this campaign only found that out. Together they account
for **84 of the 91 lesson-slots** the table counts, and D1 alone is 28 of them.
**Five are open**: D12, D13, D22, D30 and D38 — and three of those five (D13,
D22 and D30) are labelled rather than broken. Every row still open is recorded
in `PLAN.md` with what blocks it and who owns it.

**The count of open rows did not move, and that is the useful part.** D2 closed
and D38 opened in the same pass, because building D2's images is what found
D38: an emitter hole on the AVR path that no lesson review had reached, sitting
under a bench (`debug-timing-bugs`) whose lesson has never had a buildable
image. The D2 row's own arithmetic was also wrong in a way worth keeping —
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
| lite | D1·D2·D14·D15·D16·D25·D28·D29·D30 | 46 | D1, D2, D5, D14, D15, D16, D25, D28, D29, D33 |
| bw-circuit-ui | D3·D4·D6·D9·D21·D24·D31 | 15 | D3, D4, D6, D21, D24, D31 |
| sb3-creator | D5·D7·D8·D10·D11·D12·D26·D27·D32·D35·D36·D38 | 19 | D5, D7, D8, D10, D11, D26, D27, D32, D35, D36 |

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
