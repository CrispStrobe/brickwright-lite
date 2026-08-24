# Re-measuring what the Pocket Calculator repair invalidated

Compiled 2026-08-24/25 against lite `1311898d5`, after the calculator report
closed at `39b83a1f9`.

A repair invalidates review findings. Any checkpoint whose wording accommodated
a defect is wrong text the moment that defect is fixed — the shift-register
lesson is the campaign's own example, revised to say "the data line never
moves" and then repaired upstream the next day. So the question this pass asks
of all seven waves is narrow and mechanical:

> **for every finding whose CAUSE has since been fixed, is the lesson's current
> text still true?**

## The answer, in one line

Every wave finding whose cause is now fixed had **already been re-worded**, on
2026-08-24, by the sessions that did the fixing — and every checkpoint still
carrying a workaround has a cause that is still open, each one asserted to
**still reproduce** by a green `OPEN DEFECT:` sentinel. So the premise this pass
started from ("Wave 4 and Wave 7 checkpoints were revised around dead controls
that no longer exist") is measurably false for this tree: Wave 4's control
revisions were restored to version 3 the same day, and Wave 7's control finding
is a topology defect the calculator repair does not touch.

What the pass found instead is that **the repair itself was half of one**, and
that its own defect class had no gate in this repo at all. That is below.

## The table

Everything whose cause changed since its wave's "measured against" sha.
"Still true?" is the lesson's text as it stands, not as the review first wrote
it.

| # | Finding | Lesson(s) | Cause fixed by | Text still true? | What I did |
| --- | --- | --- | --- | --- | --- |
| D1 | 28 checkpoints tick themselves on `circuit-ready` | 28, across waves 1·2·6·7 | lite, arming semantics in `guided-lessons.jsx` | n/a — no lesson wording accommodated it; the wave docs record it FIXED | re-ran the pin (`lesson-bench-claims`), green |
| D5 | four faceplates open in edit mode, every control `disabled` | interactive-input-controls, interactive-displays | sb3-creator `65db1dd` + bw-board `controller.js` + lite `gui.jsx` | **no — already restored.** v3 reads "This panel opens in Play, so the controls are live straight away" | confirmed; nothing to restore |
| D14 | inspector edits no functional config | interactive-input-controls | lite `controller-panel-view.jsx` | **no — already restored.** v3 sends the learner to the inspector's Config section | confirmed |
| D15 | a widget cannot be re-bound from the app | interactive-two-way-binding | lite, same file | **no — already restored.** v3 makes re-binding the action | confirmed |
| D16 | no simulated micro:bit sensor can be varied | interactive-sensor-capability | lite `microbit-sim-pane.jsx` | **no — already restored.** v3 names all seven sensors and their ranges | confirmed |
| D6 | `bw-circuit-changed` cannot fire on an MCU-less bench | starter-circuit-path, signals-resonance, machines-contention | bw-circuit-ui `onCircuitEdit` + lite `circuit-tab.jsx` | n/a — the observable, not the copy | pinned in three wave gates, all green |
| D17 | `char_lcd_i2c` has no `control()` handler | measurement-2's LCD lessons | bw-board `devices/i2c-parts.js` | yes, and the doc says FIXED | gate green |
| D19 | `branchCurrent()` on a device terminal returns the model's own quantity | electricity-transistor-switch | bw-board | **already restored** — v3 quotes 5.83 mA and 0.43 mA, both pinned | gate green |
| D26 | the shift register was fed a constant zero | machines-gates-registers | sb3-creator example (prefix → infix bit test) | **already restored** — v3 quotes data 0 → 32 edges | gate green |
| D33 | `terminal` widget type emptied the panel | none | bw-board + lite | n/a | gate green |
| D34 | `dc_motor` inductor companion stamped in parallel | none | expired on re-measurement | n/a | gate green |
| — | engine motion: bw-board `b5c02b1` (vsource `rInternal`, PNP base junction, FET region extraction), `a301937` (buzzer KCL-visible), `88e96681` | every circuit lesson in waves 1·2·6·7 | landed AFTER every wave's "measured against" sha | **yes — every pinned number still holds** | re-derived: the whole lite suite at `b8afbc5e3` (`eed6fcc73` plus a LANES row — no test input differs), 993 pass / 0 fail / 1 skip. The ledger's shas are refreshed to say so |
| **NEW** | the simulator driver arms a quasi pin at zero, so no 8051 button can move its own pin | none directly; 12 benches, 3 of them Wave 5's | **this pass** — sb3-creator `553a639`, vendored here | the repair at `0777a17` was half of one | **D35**: fixed upstream, new gate, 43 → 22 → 1 (below) |
| **NEW** | `arduino-02-digital-input-pullup` declares an active-HIGH input for an `INPUT_PULLUP` bench | none | open | n/a | recorded as **D36**, ratcheted in the new gate so it can only shrink |
| D10 | the Bode bench corners at 0.159 Hz, where a sweep point costs 629 s of simulated time | signals-bode-sweep, signals-model-measurement | **this pass** — sb3-creator `776a96e` | **no longer true** | bench 100 µF → 100 nF; `signals-model-measurement` → v3, `signals-bode-sweep` → v4 after a parallel session's further correction (below) |
| D4 | the scope record is fixed at 100 kHz × 8192 = 81.92 ms | signals-rc-response, signals-complex-impedance, signals-aliasing-fft, machines-clocks (all 4) | **this pass** — bw-circuit-ui `29f6da6` | **no longer true** | a record-length control; the ledger's "bw-board + bw-circuit-ui" owner was wrong — the engine always took both parameters |
| D3 | the Bode sweep plots a curve and reports no numbers | signals-cutoff-phase, signals-model-measurement (2 of the 4 D3 is counted against) | **this pass** — bw-circuit-ui `2c66851` | **no longer true** | frequency axis, a twelve-row table and a full-precision CSV; `signals-cutoff-phase` → v3, `signals-model-measurement` → v4 |
| D11 | `43-rc-timing` has no control, so its charging step happens once and cannot be repeated | measurement-rc-cursors, signals-rc-response | **this pass** — sb3-creator `ac83352` | **no longer true** | a DISCHARGE switch, not the charge switch PLAN proposed — see below; `measurement-rc-cursors` → v3, `signals-rc-response` → v4 |

### The checkpoints still carrying a workaround, and why each one stays

Each of these was checked against the sentinel that pins its cause. All green,
so every one of these sentences is still true and must not be "restored".

| lesson | the wording | cause | still reproduces? |
| --- | --- | --- | --- |
| machines-clocks | "the board's push button is wired to a pull resistor and to nothing else" | D27, example topology | yes |
| signals-loading | "it holds its output at 2.5 V into a one-ohm load"; "the meter is removed from the netlist" | D20, D21 | yes — `devices/analog-amps.js` and the op-amp stamp are unchanged since Wave 6's sha |
| signals-noise | "the simulated potentiometer is bit-exact" | D22 | yes |
| signals-rc-response | "the meter says 5 V on a capacitor the engine itself holds at 0 V" | D23 | yes — the 81.92 ms half went with D4 |
| signals-rl-response | "the RL law holds to about 1 % out to 300 microseconds" | D8 | yes |
| machines-logic-levels | "this bench has no button" | topology, by design | yes |
| measurement-resistance | "probe that last one the other way round and the meter reports an open circuit" | D13, by design | yes |
| measurement-range-error | "its ×46.5 stage is where the next checkpoint finds a discrepancy" | D18 | yes |
| interactive-extension-discovery | "the green flag runs no-ops" | D30, deliberate | yes |

## A second collision, and what it cost

`LANES.md` exists because two sessions did one repair twice. This lane collided
again, differently, and the honest account is worth more than the tidy one.

Pushing D10 left lite's CI **red**: `signals-bode-sweep`'s restored hint quoted
`159.155 Hz`, and check C had no frequency dimension to match it in. A parallel
session picked that red up and fixed it — `e51bda00a` — and did it better than
this lane then did, deriving corner frequencies AND the adjacent decades so a
lesson can still name its sweep endpoints, and adding a sentence-scoped
instrument-context exclusion so "0.63 s of simulation" is allowed as a fact about
the run budget rather than about the circuit. Four mutations, including one that
proves what the exclusion costs. Their version is what is in the tree; mine was
dropped in the rebase.

Two things follow, and only one of them is comfortable.

**The claim protocol worked and the push discipline did not.** The row in
`LANES.md` was current and named this work, so nobody duplicated the lane. What
went wrong is upstream of that: a red pushed to `main` is an open invitation for
someone else to fix it, and they are right to. "Push at every checkpoint" and
"push only green" are in tension, and the resolution is not to push less often —
it is to run the gate that the change plausibly touches BEFORE the push rather
than in the suite afterwards. Check C is the gate that reads lesson prose; a
commit that rewrites lesson prose should run it first. It takes twenty minutes,
which is exactly the reason it got deferred, and exactly why it should not have
been.

**And the parallel repair carried a defect of its own**, found by re-measuring it
rather than by reading it: their restored `measurement-rc-cursors` hint said the
capacitor "falls to about 0.45 V in a tenth of a second". A tenth of a second is
the discharge time constant; the fall settles toward 0.45 V rather than 0 V, so
one time constant leaves it at **1.8847 V** — wrong by 1.4 V at the instant it
names. Check C cannot see it: both quantities are individually producible on that
bench, and the check compares quantities, not the sentence's claim that they go
together. Corrected here in both languages, with the correction pinned. That
gap — a sentence whose parts each check out and whose whole does not — is the
next thing check C is missing, and it is recorded here rather than fixed because
fixing it means teaching the check to read sentences.

## Closing D3, and counting a repair by what it repaired

`D3` is recorded as costing **4 lessons**, and it was tempting to report four
restorations. Only **two** of the four carry text that was written around the
gap — `signals-cutoff-phase`'s "no frequency axis and no per-point readout" and
`signals-model-measurement`'s "no numeric readout and no export … record it by
hand". The other two were affected without their copy ever being changed, so
there is nothing in them to restore. The lessons-affected count is a measure of
what the DEFECT cost; using it as the size of the REPAIR would be the same
species of error as a denominator that quietly counts the wrong population.

The repair itself was small because the engine was never wrong: `runBode`
returned every point it measured and `drawBode` discarded all of them. What is
worth keeping from it is one judgement — the dB labels went from whole decibels
to one decimal, because `-3.010 dB` and `-3.5 dB` both rendered as `-3dB`, and
those are two different answers to "where is the corner", which is the question
`signals-cutoff-phase` is built on. The gate asserts both that they differ now
and that rounding really did collapse them, so the reason survives the fix.

### The word that turned a green push red

Recorded because it is the third failure of the same family in this lane, and my
first two statements of the rule were both too narrow.

The restored `signals-model-measurement` hint said "the CSV **button** copies all
of them". The Tier-3 detector's `press-a-button` demand matches the bare word
`button` and then asks whether the bench the lesson names has one;
`pc50-two-stage-rc` does not. Blocking, and correct by the detector's own rule.
Reworded to "the CSV control" in both languages, which is the honest word anyway
— the affordance is app chrome, not a part.

**The detector's pattern is deliberately NOT softened.** It cannot tell app
chrome from a bench part, and that limitation is real. But "button" in lesson
prose almost always means the bench's, and loosening a pattern that guards 79
lessons to accommodate one sentence trades a gate for a phrasing. Changing the
sentence costs nothing.

The process failure underneath it: **"the gate" is not singular.** Lesson prose
is read by TWO gates — check C (`lesson-numeric-contract`) and the Tier-3
detector (`lesson-defect-detector`). I ran check C before pushing, saw green, and
treated it as covering the class. The detector takes ten minutes, which is
exactly why it only ever ran inside the full suite, and exactly why it was the
one skipped. The three statements of the rule, in the order they were earned:

1. run the gate a change touches BEFORE the push, not in the suite after it;
2. a suite run owns the worktree until it exits;
3. enumerate the gates that read what you changed, and run all of them.

## Closing D11, and the fix that would have hidden a defect

`PLAN.md` proposed a **charge switch** for `43-rc-timing`, and that would have
been the wrong part. A charge switch open at rest makes the capacitor read 0 V in
the first DC operating point — and `43-rc-timing` is the bench that demonstrates
the engine reading the **supply** there (D23, still open, with its own sentinel
in `lesson-bench-claims-wave6` and its own sentence in `signals-rc-response`'s
hint). The obvious fix would have made a live defect stop reproducing on the only
bench that shows it, without repairing anything — the same species as the Class H
finding this repo already recorded, where a fix relocated a defect past its own
gate.

A **discharge** switch closes D11 and touches nothing else. Every number the two
lessons pin is unchanged to four decimals (an open switch stamps 1e-12 S), and
the repeat is better than a reset because it is not one: the charging resistor
stays connected, so the drain settles toward the 0.4545 V divider floor and the
next rise starts from there — which is exactly what
V(t) = Vf + (V0 − Vf)·e^(−t/RC) is for, and what `signals-rc-response`'s own
python variant already told the learner to use.

## The finding this pass exists for

`js-driver-oled-chain`, the gate written as the calculator repair landed, covers
the 70-calculator. The 70-calculator is a Pico. The repair had two halves — a
board-class pin-mode mapping and an arming loop — and the arming loop it added
reads

```js
b.setPin(p.pin, _mod(p), false)
```

where the third argument is the pull's **rail**, not a drive. `input-pullup` and
`input-pulldown` carry their own rail in bw-board's `pin-model.js` and ignore
it. `quasi` does not: a quasi pin idles HIGH — that IS the 8051 weak pull-up —
so arming it low clamps the net to ~0 V and no button on it can move the reading
again.

Measured over every example that ships both a `program.bw` declaring an INPUT
pin and a `circuit.json` (resolved through `index.json`) carrying a button or
switch on that pin's net — **33 benches, 67 such pins** — counting pins whose
`readPin` does **not change** when their own control is operated:

| arming rule | dead |
| --- | --- |
| no arming at all (before sb3-creator `0777a17`) | **43 / 67** |
| armed with `driveHigh = false` (`0777a17`) | **22 / 67** |
| armed at the pull's own rail (`553a639`) | **1 / 67** |

The 22 are the whole 8051 side: `05-counter`, `11-toggle-button`,
`18-logic-and-gate`, `19-logic-or-gate`, `25-reaction-timer`, `26-debounce`,
`27-led-dice`, `60-retro-console`, `61-console-pong`, `76-multimeter`,
`78-a2-calculator`, `arduino-02-digital-input-pullup`. Three of those are Wave 5
lesson benches, so it is not only a corpus fact — though it is worth being exact
about the blast radius, and the exactness matters because the first version of
this paragraph was too loose.

**No Wave 5 checkpoint's wording became false.** The defect lives in ONE route:
the Code tab's Run with the simulated-board driver. Wave 5's four press
checkpoints observe two other things — `debug-watches/watch` and
`debug-conditional-breakpoints/halt` wait on `debug-phase: paused`, which is
emu8051 over compiled C; `debug-reproduce-minimize/minimize` and
`debug-pins-signals/trace` wait on `project-run`, which is the green flag and
therefore the Scratch VM's own extension methods. Neither is the JS driver. What
the defect cost was a third route a learner can take on those same benches, and
on it they would have seen the calculator's symptom exactly — a key that reads
pressed from boot and cannot be released.

### Two things the new gate got wrong before it got them right

Both are kept in its comments, because both are the same species as the defect
it catches.

1. **It asserted "an unpressed key reads 0", and called `26-debounce` a
   defect.** `26-debounce` declares `PIN btn = P3.2 INPUT` and inverts in the
   program (`wait until read btn = 0`); `05-counter` declares `INPUT ACTIVE LOW`
   and lets the driver invert. Both are correct. A gate written around one
   convention condemns the other. What no correct bench can do is fail to
   CHANGE, so that is the invariant it settled on — declaration-agnostic by
   construction.
2. **It passed its own `mode === 'quasi'` rule into the sweep**, so reverting the
   emitter left it green: it was measuring the rule that had been typed into the
   test, not the one the app emits. It now extracts and *executes* the emitted
   `_mod` and `_bw_arm`. Mutation-proved three ways afterwards — reverting the
   quasi rail, deleting the arming loop, and reverting the board-class half —
   each turns it red, and the third is caught only by the corpus sweep, which is
   the division of labour the two assertions exist for.

## What the gates could not settle, and is therefore not claimed

- **`declared-pins-wired.test.mjs` asks whether a declared pad is WIRED**, and
  all 67 of these were. Polarity — whether a pad is wired the way its
  declaration claims — is still ungated, and the new gate does not close it: it
  asks a weaker and more robust question on purpose. `D35` is the one case where
  the two answers differ.
- **No browser.** Everything here is the engine the browser runs, driven through
  the same calls, not a rendered page. The canvas half of the calculator repair
  (a press releasing itself after ~80 ms via pointer-capture retargeting) is
  therefore outside what this pass can measure at all, and is taken on the
  report's own end-to-end browser verification.
- **The German copy** for the two restored lessons was written alongside the
  English and is not independently reviewed.
