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
| **D2** | The debugger cannot start offline on any device family: `debug-runner.js` builds every image through `POST stc-compiler.vercel.app/compile`, while all ten Wave 5 lessons declare `environment: "simulation"` | lite (`bw-debug/debug-runner.js`) | **12** | 5, 3, 7 | open — see PLAN.md |
| **D3** | The Bode sweep reports no numbers: `drawBode` writes four strings on a 260×140 canvas (two dB extremes, ±180°), no frequency axis, no per-point value, no export | bw-circuit-ui | **4** | 6 | open |
| **D4** | The scope record is fixed at 100 kHz × 8192 = 81.92 ms; both numbers are hard-coded in `addScopeChannel` and `ScopePanel` passes neither | bw-board + bw-circuit-ui | **4** | 6, 7 | open — see PLAN.md |
| **D5** | Four faceplate layouts ship no `"mode": "play"`, and `ControllerPanel` defaults to `edit` where every input control renders `disabled`; the panel's own `toJSON`/`fromJSON` drop `mode` entirely, so even a corrected file is lost on the first save | sb3-creator (examples) + bw-board (`controller.js`) + lite (`gui.jsx`) | **3** | 4 | **FIXED** — three repos |
| **D6** | `bw-circuit-changed` is dispatched only when the derived **pin declarations** change, so on an MCU-less bench no wiring edit can raise it | bw-circuit-ui (`CircuitDesigner`) + lite (`circuit-tab.jsx`) | **3** | 1, 6, 7 | **FIXED** — `onCircuitEdit` |
| **D7** | Three machine benches boot with an empty ROM: no example ships an image, `sb3-creator` has no assembler, and the runner skips the build for machine targets | sb3-creator (examples) | **3** | 7 | open — see PLAN.md |
| **D8** | `pc52-inductor-filter` is an RLC used as an RL bench; the L/R law holds for its first ~300 µs and then the 100 µF takes over | sb3-creator (example) | **3** | 1, 6 | open — see PLAN.md |
| **D9** | A Bode point costs 10/f seconds of simulated time (`settleCycles` 6 + `measureCycles` 4) and `SweepPanel` runs the sweep synchronously | bw-board (`runAcSweep`) + bw-circuit-ui | **2** | 6 | open — see PLAN.md |
| **D10** | `pc50-two-stage-rc` corners at 0.159 Hz, so the decade below the corner its own lesson asks for costs 629 s of simulation per point | sb3-creator (example) | **2** | 6 | **FIXED** — 100 µF → 100 nF |
| **D11** | `43-rc-timing` has no controls at all, so the charging step it measures happens once and cannot be repeated | sb3-creator (example) | **2** | 2, 6 | **FIXED** — a discharge switch |
| **D12** | There is no ASM emitter; the Code tab's ASM view is real but both its modes go over the network (`/compile`, `/assemble`) | sb3-creator | **2** | 3, 7 | open — see PLAN.md |
| **D13** | `board.resistance(a, b)` is directional — B is the reference and ground symbols are deliberately switched out of that solve, so a real path reads as open when probed the other way | bw-board (`mna.js`) — **by design** | **2** | 2 | open — not a bug |
| **D14** | The widget inspector edits no functional config: only `color`, `fontSize`, `src`, `text`. A button's `toggle`, a slider's `min`/`max`/`step`, a gauge's range and a matrix's `rows`/`cols` are reachable only by hand-editing `controller.json` | lite (`controller-panel-view.jsx`) | **1** | 4 | **FIXED** — Config section |
| **D15** | A widget cannot be re-bound from the app: `bindToVariable`, `bindToPart` and `bindToPin` are called from nowhere in the GUI; `WidgetCard` takes an unused `onBindPart` prop | lite (`controller-panel-view.jsx`) | **1** | 4 | **FIXED** — Binding section |
| **D16** | No simulated micro:bit sensor can be varied: the bundled simulator declares each one with its range, default and unit and accepts `{kind:'set_value', id, value}`, and `set_value` appears nowhere in lite | lite (`microbit-sim-pane.jsx`) | **1** | 4 | **FIXED** — Sensors strip |
| **D17** | `char_lcd_i2c` is the only display model in the corpus with no `control()` handler, so `74-ammeter`'s LCD stays blank under `setDeviceControl` | bw-board (`devices/i2c-parts.js`) | **1** | 2 | **FIXED** — `control()` handler |
| **D18** | The LM358 model is a damped integrator that halts once its per-round output step falls below 1 mV, leaving up to 0.667 mV of input error unamplified — realised gain 31–39 against a documented ×46.45, and it depends on the input | bw-board (`devices/analog-amps.js`) | **1** | 2 | open |
| **D19** | `branchCurrent()` returns a device model's own quantity on a device-model terminal instead of the solved branch current, and a flat zero for `switch`, `button` and `dc_motor` — the ammeter reads 43.0 mA on a collector carrying 5.8 mA | bw-board | **1** | 1 | **FIXED** — extraction agrees with the stamp |
| **D20** | The op-amp has no output limit: the follower holds 2.5000 V into 1 Ω (2.5 A) without drooping | bw-board (`devices/analog-ics.js`) | **1** | 6 | open — see PLAN.md |
| **D21** | `model/circuit.js` filters `p.kind !== 'meter'` out of the netlist before the solve, so a probe draws exactly zero current and cannot load anything | bw-circuit-ui | **1** | 6 | open — see PLAN.md |
| **D22** | The simulated potentiometer is bit-exact: twelve reads of a still knob give ADC count 380 every time, standard deviation exactly 0 | bw-board | **1** | 6 | open — see PLAN.md |
| **D23** | The first solve of a fresh board is a DC operating point, in which a capacitor is an open circuit — so the meter reads 5.0000 V on a capacitor the engine's own `getCapVoltage` holds at 0 | bw-board / bw-circuit-ui | **1** | 6 | open — see PLAN.md |
| **D24** | There is no FFT anywhere in the circuit UI, and the scope's ring buffer stores an interleaved (min, max) envelope rather than a sample series | bw-circuit-ui + bw-board | **1** | 6 | open — see PLAN.md |
| **D25** | No cycle-level step: the 6502 target steps by `insn`/`over`/`out`, the circuit step button advances 50 ms (50 000 cycles at 1 MHz) | lite (`bw-debug`) + bw-circuit-ui | **1** | 7 | open — see PLAN.md |
| **D26** | The PREFIX bitop form does not compose with a comparison and the INFIX form does not work bare — complementary holes. `20-shift-register-binary` shifted a constant zero because of the first | sb3-creator (compiler or referee — not isolated) | **1** | 7 | example fixed; compiler defect open |
| **D27** | `ttl-clock-module`'s step button is electrically isolated (its net carries only `r3.a`, and `r3` goes to ground), and the board has no downstream state at all | sb3-creator (example) | **1** | 7 | open — see PLAN.md |
| **D28** | There is no frames-or-locals view in the debug UI; `Step Out` is real, a call stack is not | lite (`bw-debug` UI) | **1** | 5 | open — see PLAN.md |
| **D29** | Write watchpoints are feature-detected on `_emu_dbg_set_bp_write`, which the pinned emu8051 WASM build does not export | lite (emu8051 pin) | **1** | 5 | open — see PLAN.md |
| **D30** | `microbitplus` blocks are deliberate VM no-ops and the extension declares no `showStatusButton`, so no connection indicator is drawn | lite (`overlay/scratch-vm`) | **1** | 4 | open — see PLAN.md |
| **D31** | The scope's V/div is a single global setting, so two channels of very different amplitude cannot be scaled independently | bw-circuit-ui (`ScopePanel`) | **1** | 2 | open — see PLAN.md |
| **D32** | `arduino-03-calibration` has no filter, so its lesson's "estimate filter delay" has nothing to check against | sb3-creator (example) | **1** | 4 | open — see PLAN.md |
| **D33** | `6502-terminal/controller.json` declares widget type `terminal`, which is not in `ControllerPanel`'s `DEFAULTS`, so `addWidget` throws — and the importer removes every widget *before* adding, inside a bare `catch`, leaving the panel **empty** | bw-board (`controller.js`) + lite (importer) | **0** | 4 | **FIXED** — `terminal` type + guarded restore |
| **D34** | `dc_motor` stamps the winding's inductor companion conductance `dt/L` in parallel with `1/R` rather than in series, so its DC operating point depends on the solver step (1.801 A at 1 µs, 1.980 A at 1 ms, against 0.900 A) | bw-board (`devices/dc-motor.js`) | **0** | 1 | **EXPIRED** — re-measured, no longer reproduces |
| **D35** | The simulator driver armed every read-only pin with `driveHigh = false`, but that argument is the pull's RAIL: a quasi pin idles HIGH, so arming it low clamped 22 of the corpus's 67 wired controls to ~0 V and no button could move its own pin | sb3-creator (driver) | **0** | — | **FIXED** — `553a639`, and gated |
| **D36** | `arduino-02-digital-input-pullup` is the `pinMode(2, INPUT_PULLUP)` sketch — button to ground, no external pull — but declares `PIN btn = D2 INPUT`, i.e. active HIGH, which the driver honours as a programmed pull-DOWN; both sides of the button then sit at 0 V | sb3-creator (example) | **0** | — | open — the last of 67 |

**36 defects. Thirteen are closed** — D1, D5, D6, D10, D11, D14, D15, D16, D17,
D19, D33 and D35 by repair, and D34 by re-measurement, which is a different and
weaker claim: it stopped reproducing between the Wave 1 vendor and today, and
this campaign only found that out. Together they account for **43 of the 89
lesson-slots** the table counts, and D1 alone is 28 of them. Every row still open
is recorded in `PLAN.md` with what blocks it and who owns it.

**D35 and D36 were added on 2026-08-25** by the post-repair re-check
(`docs/POST-REPAIR-RECHECK.md`), which went looking for lesson findings the
Pocket Calculator repair had invalidated and found instead that the repair was
half of one. D35 is closed in the same pass; D36 is the residue it left, named
rather than tolerated, and ratcheted by
`test/simulator-driver-controls-respond.test.mjs` so it can only shrink.

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
| bw-board | D4·D9·D13·D17·D18·D19·D20·D22·D23·D33·D34 | 12 | D17, D19, D33, D34 |
| lite | D1·D2·D14·D15·D16·D25·D28·D29·D30 | 46 | D1, D5, D14, D15, D16, D33 |
| bw-circuit-ui | D3·D4·D6·D9·D21·D24·D31 | 15 | D6 |
| sb3-creator | D5·D7·D8·D10·D11·D12·D26·D27·D32·D35·D36 | 18 | D5, D10, D11, D35 |

Rows appear under every owner that must change, so the columns oversum: D4, D6,
D9 and D33 each need two repos and D5 needed three — the example file, the panel
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
(D11), and three machine benches boot with no ROM (D7). **D10 and D11 are now
closed**; D8 and D7 are not. These are the cheapest
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
