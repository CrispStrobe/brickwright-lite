# Wave 6 technical review — "Signals and systems"

Reviewed 2026-08-23 against `d7325a272`, and every number re-derived unchanged
against `1d10902cb` after the `bw-board` vendor that landed mid-review
(scheduled device events, gate tpd, controller floor fix — 640 changed lines
across `board.js`, `mna.js` and `ac.js`). Ten lessons, twenty checkpoints.

**9 defective of 10 · 10 revised (one to content version 3, nine to 2) · 11
defects open, every one of them in an instrument or an engine, none in a
lesson.**

Wave 6 goes back to circuits, so it goes back to Wave 1's instrument: every
number below came out of the engine the browser runs — `bw-circuit-ui`'s
`Circuit.fromJSON` over a fully-registered `bw-board` — through
`scripts/lesson-bench.mjs`. What is new is that half of this wave's checkpoints
name the **frequency-domain** instruments, so this review also drives the app's
own sweep (`model/sweep-runner.js`'s `runBode`, the call `SweepPanel` makes) and
the app's own scope tap (`board.addScopeChannel` with exactly the arguments
`ScopePanel` passes: a type and a net, and nothing else). `lesson-bench.mjs`
gained the sweep half of the engine injection for this, because without it
`runBode` refuses with "this build has no AC sweep wired" — a truthful refusal
that would have read here as a bench defect.

The Tier-3 detector found **1 blocking** on this wave, and it was right:
`signals-resonance` observes an event its bench cannot fire. The other eight
defects were found by measuring.

## The finding behind the finding

Nine of ten is a startling rate, and it has a single cause rather than nine.
This wave was written against a signals toolkit that has **three of its five
pieces**. It has a genuinely good AC sweep — log-spaced, magnitude and phase,
run on an offline copy of the board so the learner's circuit is never
teleported — and a scope with a trigger and time cursors, and both are wired
into the app. It does not have:

1. **any numeric readout on the sweep.** The Bode plot is a 260×140 canvas whose
   only labels are the two dB extremes rounded to whole decibels, and `+180°` /
   `-180°`. There is no frequency axis, no per-point value, no table, no export.
2. **any spectrum view at all.** No FFT exists anywhere in the circuit UI.
3. **any choice of scope timebase.** 100 kHz × 8192 samples is fixed in the
   engine, and the panel passes neither, so every capture in this wave is
   81.92 ms long.

Four of the wave's benches were then chosen without checking against those
limits — one corners at 0.159 Hz, one has a 1 s time constant, one is asked for
a spectrum, one is asked for noise it does not have. That is the whole story,
and it is a smaller and more fixable story than "nine broken lessons".

## Verdicts

| lesson | example | v | verdict |
| --- | --- | --- | --- |
| signals-rc-response | 43-rc-timing | 2→**3** | **defect, fixed** — the t = 0 reading the checkpoint asks for is the supply voltage, not zero |
| signals-rl-response | pc52-inductor-filter | 1→**2** | **defect, fixed** — the bench is an RLC; L/R holds only in its first 300 µs, and the hint's "total series resistance" is the wrong R |
| signals-complex-impedance | 50-rc-scope | 1→**2** | **defect, fixed** — the scope route it names cannot reach the below-cutoff point |
| signals-cutoff-phase | 50-rc-scope | 1→**2** | achievable; **revised for disclosure** — both criteria bracket the same cutoff, but the plot has no frequency axis to read one off |
| signals-bode-sweep | pc50-two-stage-rc | 1→**2** | **defect, fixed** — the corners are at 0.159 Hz, where one sweep point costs over ten minutes of simulated time |
| signals-resonance | pc52-inductor-filter | 1→**2** | **defect ×2, fixed** — as shipped the network is overdamped and has no peak; and its observable cannot fire |
| signals-loading | pc54-opamp-follower | 1→**2** | **defect, fixed** — the divider half is excellent; the follower-limit and probe-loading halves have no model behind them |
| signals-noise | arduino-03-smoothing | 1→**2** | **defect, fixed** — the simulated sensor is bit-exact, so the standard deviation is exactly zero |
| signals-aliasing-fft | 49-function-generator-sine | 1→**2** | **defect, fixed** — there is no FFT, and what the scope stores is an envelope, not a sample series |
| signals-model-measurement | pc50-two-stage-rc | 1→**2** | **defect, fixed** — "report residuals with propagated uncertainty" from an instrument that reports no numbers |

`signals-cutoff-phase` is counted as achievable: both of its search criteria
work and bracket the same answer. Nine of the other ten checkpoints that measure
something could not be completed as written.

## What works, measured

The engine itself is in excellent shape, and that is worth stating before the
defects.

**`43-rc-timing` is textbook to four decimals.** τ = 10 kΩ × 100 µF = 1 s, and
against 5(1 − e^(−t/τ)):

```
t          0.5 τ      1 τ       2 τ       3 τ
measured   1.9673    3.1606    4.3233    4.7511
model      1.96735   3.16060   4.32332   4.75107
```

**The Bode sweep is a real instrument.** On `50-rc-scope` (10 kΩ, 1 µF,
fc = 15.9155 Hz):

```
f (Hz)     1      1.78    3.16    5.62     10      17.8     31.6     56.2     100
mag (dB) -0.017  -0.054  -0.168  -0.511  -1.445  -3.518   -6.944  -11.298  -16.073
phase    -3.60°  -6.38° -11.24° -19.46° -32.14° -48.17°  -63.28°  -74.20°  -80.96°
```

The −3.010 dB crossing and the −45° crossing are both inside the same
10 Hz…17.78 Hz bracket, which is exactly the agreement `signals-cutoff-phase`
exists to test, and the lesson's two-search method finds it.

**`signals-loading`'s central contrast is exact.** A 10 kΩ pot at half travel is
2.5 V behind 2.5 kΩ. Measured through the follower, and measured again with the
op-amp removed and the load hung straight on the wiper:

```
load        1 MΩ     100 kΩ    10 kΩ     1 kΩ     100 Ω
buffered    2.5000   2.5000    2.5000    2.5000   2.5000
unbuffered  2.4938   2.4390    2.0000    0.7143   0.0962
error        0.25 %   2.4 %     20 %      71 %     96 %
```

**`pc52`'s RL window is real, and beautiful, for 300 µs.** Stepping the source
0 → 5 V, with the current taken as the hint says (resistor voltage ÷ R), against
50 mA × (1 − e^(−t/100 µs)):

```
t          50 µs     100 µs    150 µs    200 µs    300 µs
measured  19.665    31.556    38.706    42.967    46.893   mA
ideal RL  19.673    31.606    38.843    43.233    47.511   mA
ratio      0.9996    0.9984    0.9965    0.9938    0.9870
```

**And the resonance the lesson asks for is there once the learner picks a
capacitor for it.** With 0.1 µF against the 10 mH inductor, f0 = 5032.9 Hz and
the sweep peaks at **+3.872 dB** with the phase passing −81°: a clear
second-order peak.

## The defects

### 1. signals-rc-response/measure — the reading at t = 0 is the supply

The checkpoint has the learner "calculate capacitor voltage at 0, 0.5τ, 1τ, 2τ
and 3τ" and then measure all of them. Every point from 0.5τ on is textbook (see
above). The first one is not:

```
a freshly loaded board, never advanced   V(c1.a) = 5.0000 V
the engine's own getCapVoltage('c1')                  0 V
after advancing by ONE nanosecond        V(c1.a) = 0.0000 V
```

The first solve is a DC operating point, in which a capacitor is an open
circuit — so the meter reports the supply on a capacitor the engine itself holds
at zero. A learner who measures before pressing anything records a +5 V
residual at the one point where their prediction is most confident.

A second constraint belongs to the same checkpoint: the scope cannot be the
instrument here. Its record is fixed at **81.92 ms** (100 kHz × 8192, both
hard-coded in `addScopeChannel`, and `ScopePanel` passes neither) against a
1 s time constant.

**Fixed** in copy, EN and DE, version 3: the checkpoint now says to advance the
simulation before reading, explains what the first solve is and why it
disagrees with the engine, and names the meter and the clock rather than the
scope.

### 2. signals-rl-response — an RL lesson on an RLC bench

`pc52-inductor-filter` is a 5 V source, 100 Ω, 10 mH, a 100 µF capacitor and a
1 kΩ load. The lesson treats it as an RL network: "compare fitted τ with L/R",
hinting "use the total series resistance".

Measured, the L/R law holds superbly for about 300 µs (table above) — because
inside that window the capacitor is still an uncharged short, so the series
resistance is the 100 Ω resistor alone and the asymptote is 50 mA. Outside it
the capacitor owns the response:

```
t         500 µs    1 ms     2 ms      5 ms      20 ms     settled
I        48.161   46.141   41.768    31.215     9.580     4.5455  mA
```

The current **turns around** at about 500 µs, which no RL step response does,
and settles at 5 V / 1100 Ω = 4.5455 mA — a ninth of the RL asymptote the
learner was told to predict. And the hint's instruction to use the total series
resistance gives 1100 Ω, hence τ = 9.1 µs: wrong by an order of magnitude in
the one window where the model applies.

Nothing in the lesson or the app steps the source, either; a learner who never
does sees a settled circuit and no transient at all. (Wave 1 recorded the same
omission for `electricity-inductor` on this same bench.)

**Fixed** in copy, EN and DE, version 2: `predict` now asks for the RL
asymptote *and* the circuit's true settled current, and states that the right R
inside the window is 100 Ω; `measure` tells the learner to step the source, to
sample the first 300 µs, and that the turning point at ~500 µs is the finding
rather than a mistake.

### 3. signals-complex-impedance/measure — one of its three frequencies will not fit on the screen

The checkpoint measures "amplitude ratio and time shift at all three
frequencies" — below, at, and above cutoff — and its hint converts a scope Δt to
phase. At cutoff one cycle is 62.8 ms and fits inside the 81.92 ms record. A
decade below cutoff one cycle is **628 ms**, seven and a half records long.

**Fixed**, version 2: the below-cutoff point now comes from the sweep
instrument, the other two stay on the scope, and the hint states the record
length that forces the split.

### 4. signals-bode-sweep — the corners are outside the instrument's practical range

`pc50-two-stage-rc` is two 10 kΩ/100 µF stages: each corners at **0.159 Hz**.
The checkpoint says to run a log sweep and estimate slopes in three regions, and
its hint says "use at least a decade below and above each expected corner" —
0.0159 Hz.

`runAcSweep` measures by single-frequency correlation over `settleCycles = 6`
plus `measureCycles = 4` cycles, so **one point costs 10/f seconds of simulated
time**: 63 s at the corner, and **629 s a decade below it**. Measured wall-clock
on the review machine, for one point: 7.2 s at 10 Hz, 57 s at 1 Hz, 84 s at
0.5 Hz. (Those timings are indicative and are deliberately not pinned by the
gate; the 10/f cycle count is, because it is a property of the engine rather
than of the box.) The panel runs the sweep synchronously inside a `setTimeout`,
so a sweep near the corners freezes the tab for minutes.

The panel's own default range makes it worse before it makes it better: it
starts at 10 Hz, where this network is already at **−71.549 dB** and −177°. A
learner who clicks Sweep sees one steep line and nothing else.

What *is* measurable, and cheaply, is the lesson's actual physics — between 1 Hz
and 10 Hz:

```
f            1 Hz        10 Hz      slope
measured   -32.782 dB  -71.549 dB   -38.77 dB/decade   (two poles)
ideal unloaded cascade -32.06 dB at 1 Hz
```

so the loaded network attenuates 0.72 dB more than the product of two ideal
stages — which is precisely the "cascaded passive stages load each other"
comparison the checkpoint's `explain` promises.

**Fixed**, version 2: the sweep is now specified between 1 Hz and 10 Hz, the
hint gives the corner frequency and the ten-cycles-per-point cost, and says
plainly to stay well above the corners.

### 5. signals-resonance — overdamped as shipped, and its observable cannot fire

Two faults.

**(a) There is no peak on the shipped bench.** With the 10 mH inductor and the
shipped 100 µF, the damping is ζ ≈ 5 — heavily overdamped — and the measured
response is monotone:

```
f (Hz)      50      100      159      250      500
mag (dB) -10.371  -16.027  -20.002  -23.967  -30.301
```

At the nominal f0 = 159.155 Hz the response is 20 dB **down**, not up. A learner
following the hint's f0 = 1/(2π√LC) and sweeping around it finds nothing. The
lesson does say "Choose C", and with 0.1 µF the peak is a clean +3.872 dB at
5033 Hz — but nothing warns that the shipped capacitor must be *replaced* rather
than added to, and nothing mentions that the 1 kΩ load, not the 100 Ω series
resistor, is the dominant damper.

**(b) `circuit-changed` cannot fire here** — the Tier-3 detector's one blocking
finding, and the same app defect Wave 1 recorded for `starter-circuit-path`.
**FIXED 2026-08-24; see below.**
`guided-lessons.jsx` maps the observable to `bw-circuit-changed`, whose only
producer is `circuit-tab.jsx`'s `handleDeclarationChange`, which fires only when
the derived **pin declarations** change. `pc52` has no microcontroller, so the
declarations are `{"pins":[],"ports":[],"parts":[]}` before and after every
edit — including the two the detector tries, doubling a resistor and removing a
wire.

**Fixed**, version 2: the action now says to replace the shipped capacitor, the
hint names the overdamping, the 1 kΩ load as the dominant loss, and tells the
learner to tick the checkpoint manually because the event will not arrive.

**Defect (b) fixed 2026-08-24** (bw-circuit-ui, vendored here). `CircuitDesigner`
gained an `onCircuitEdit` callback beside `onDeclarationChange`, fired from a
STRUCTURAL signature of the circuit — part ids, kinds and params, plus wire
endpoints — so replacing a capacitor is visible to the host on a bench with no
microcontroller. Position is deliberately excluded: dragging a part changes the
drawing, not the circuit, and a host that treated it as an edit would fire on
every pointermove. Lite's `circuit-tab.jsx` now dispatches `bw-circuit-changed`
from that callback instead of from the declaration change, which strictly
subsumes the old producer since declarations derive from the same parts and
wires. The hint's "tick it manually" sentence is now belt-and-braces rather than
a workaround, and is left as it is — a learner who mis-clicks still needs the
button. `docs/WAVE-OPEN-DEFECTS.md` D6.

### 6. signals-loading — two of its three regimes have no model behind them

The divider half is the best-measured thing in the wave (table above). The other
two demands are not on this bench:

- **"identify where follower output limits replace divider error."** The op-amp
  model is ideal apart from its rails. Measured: with a **1 Ω** load it holds
  2.5000 V, which is 2.5 A of output current, with no droop at all. There is no
  load at which the output limit takes over, because there is no output limit.
- **"including probe input impedance."** `model/circuit.js` filters
  `p.kind !== 'meter'` out of the engine netlist before the solve, in both of
  its build paths. A probe therefore draws exactly zero current and cannot load
  anything.

**Fixed**, version 2: the checkpoint now asks the learner to *say what a real
follower would do* at the smallest load that this model does not, and the hint
states both idealisations with the 2.5 A measurement behind the first.

### 7. signals-noise — there is no noise

The checkpoint asks the learner to "report standard deviation" for raw and
filtered series at three window sizes. Twelve reads of a still potentiometer,
5 ms apart, through the same `readAnalog` path the program uses:

```
V(a0)   1.855000 ×12          counts   380 ×12          standard deviation   0.000000
```

The simulated sensor is bit-exact. A moving average of a constant is that
constant, so the noise-reduction half of the experiment has nothing to reduce
and the comparison between window sizes is empty.

The delay half survives, and is worth keeping: `arduino-03-smoothing`'s program
is a genuine ten-sample moving average over a list, with `print average`, and
`numReadings` is a variable the learner can change — so window-versus-lag is
measurable by stepping the knob and counting samples until the average catches
up.

**Fixed**, version 2: the checkpoint now has the learner record that the raw
readings are identical to the count, and measure the delay instead.

### 8. signals-aliasing-fft — there is no FFT

The checkpoint says "compare time trace and **FFT** with rectangular and tapered
**windows**". Searching the whole circuit UI for a spectrum view finds nothing:
no FFT, no Fourier transform, no window function. `ScopePanel` has a timebase,
a vertical scale, an edge trigger and two **time** cursors reporting Δt.

There is a second, more interesting obstacle behind the first. The scope's ring
buffer stores an **interleaved (min, max) pair per bucket** — the engine's own
comment says so — which is the right structure for drawing a waveform and the
wrong one for transforming it. Even with an FFT bolted on, the stored data is a
peak-detect envelope, not the sample series a transform consumes.

The `predict` step is nearly salvageable on its own: from the cadence and record
length it asks for Nyquist (50 kHz) and bin spacing (12.207 Hz), and both are
exact. But neither the 10 µs cadence nor the 8192-sample depth is displayed
anywhere in the app, and neither is adjustable, so the learner has no way to
obtain the inputs.

**Fixed**, version 2: the checkpoint now makes the aliasing argument from the
time traces and the sample cadence — which is legitimate, since aliasing happens
in the sampling and an above-Nyquist tone already *looks* like its alias on the
trace — states the three fixed numbers, and says that windowing and leakage stay
a paper exercise here.

### 9. signals-model-measurement — residuals from an instrument that reports no numbers

The checkpoint asks for repeated magnitude/phase sweeps, a fit on training
points, prediction of reserved points, and "residuals with propagated
uncertainty". Its Python variant says to "export or transcribe sweep rows".

There is nothing to export and almost nothing to transcribe. `drawBode` writes
exactly four strings onto the canvas: `${dbHi}dB`, `${dbLo}dB` — rounded to
whole decibels — and `+180°`, `-180°`. The frequency axis is unlabelled. There
is no download, no CSV, no clipboard, no row list. The panel's status line says
"25 points" and stops there.

It also inherits defect 4's cost wall, since it names the same bench.

**Fixed**, version 2: the checkpoint now works between 1 Hz and 10 Hz and reads
one frequency at a time by setting the sweep's start and end to the same value —
which is the only way to attach a number to a point on that canvas — and the
hint says why.

## Checkpoint ledger

| checkpoint | settled by |
| --- | --- |
| signals-rc-response/predict | off-bench (calculate five points) |
| signals-rc-response/measure | **defect 1**, measured |
| signals-rl-response/predict | **defect 2**, the wrong R named; measured |
| signals-rl-response/measure | **defect 2**, measured over the first millisecond |
| signals-complex-impedance/predict | off-bench (derive Z_C and H(jω)) |
| signals-complex-impedance/measure | **defect 3**, scope record measured against the period |
| signals-cutoff-phase/predict | off-bench (calculate fc, gain, phase, period) |
| signals-cutoff-phase/measure | achievable — both crossings bracketed by sweep |
| signals-bode-sweep/predict | off-bench (sketch asymptotes) |
| signals-bode-sweep/sweep | **defect 4**, cost model + measured response |
| signals-resonance/predict | off-bench (choose C, calculate f0 and Q) |
| signals-resonance/sweep | **defect 5a + 5b**, measured and detector-confirmed |
| signals-loading/predict | off-bench (predict three load cases) |
| signals-loading/measure | **defect 6**, measured buffered and unbuffered |
| signals-noise/predict | off-bench (predict mean, spread, delay) |
| signals-noise/measure | **defect 7**, measured |
| signals-aliasing-fft/predict | **defect 8**, the inputs are not displayed |
| signals-aliasing-fft/measure | **defect 8**, no FFT exists |
| signals-model-measurement/predict | off-bench (pre-register two models) |
| signals-model-measurement/compare | **defect 9**, panel labels enumerated |

All twenty accounted for. The ten `predict` checkpoints are genuinely off-bench —
each asks for a written prediction before touching anything — except the two
noted above, where the prediction needs a number the app does not supply.

## A note on Check C, which pushed back on this copy six times

`test/lesson-numeric-contract.test.mjs` refuses any quantity in English lesson
prose that the named bench cannot produce, and it rejected six of this review's
revisions in a row. Five of those objections were correct and the copy was
rewritten: a scope record length, a chosen replacement capacitance, a
hypothetical one-ohm probe load and two sample intervals are not things
`43-rc-timing` or `pc54-opamp-follower` produce, and quoting them with a unit
made them look like bench readings.

The sixth is a genuine blind spot, and it is recorded here rather than worked
around silently. **A frequency the learner is told to DRIVE is not a claim about
the bench.** `pc50-two-stage-rc`'s source is DC, so the gate's frequency pool for
it is empty and every `Hz` in that lesson's prose is rejected — including "sweep
between 1 Hz and 10 Hz", which is an instruction, not a measurement. The copy now
expresses the range relative to the stage corner (`R × C = 1 s`, a quantity the
bench does have) instead, which is better pedagogy anyway. But a lesson that
legitimately needs to name a drive frequency on a DC-source bench cannot, and
that is Check C's limitation, not the lesson's.

## What I could not check

- **No browser.** The sweep and the scope were driven through the same functions
  the panels call, not through a rendered page. That is decisive for what the
  instruments compute and for what `drawBode` writes on the canvas (it is one
  function, and every `fillText` in it is enumerated by the gate); it is not
  decisive for whether a curve is legible at 260×140.
- **Wall-clock sweep timings** are from one loaded machine and are not pinned.
  The cost model behind them is.
- **Whether a learner can drive the generator above Nyquist.** `InlineEditor`
  will accept any number for `fg1.freq`, but I did not measure what the engine's
  transient integrator does with a 60 kHz sine, and `signals-aliasing-fft`'s
  revised copy does not depend on it.
- **The German copy**, revised alongside the English, is not independently
  reviewed.
- **Pedagogy** — in particular whether `pc50-two-stage-rc` should be rescaled
  (10 kΩ/100 nF would corner at 159 Hz and sweep in milliseconds) rather than
  worked around in lesson copy. That is the right fix and it belongs upstream;
  it is recorded in `PLAN.md`.

## Reproducing this

```
node --test test/lesson-bench-claims-wave6.test.mjs
```

Eleven of its eighteen tests are named `OPEN DEFECT` and assert that a defect
**still reproduces**. They fail the day the sweep grows a readout, the scope
grows a spectrum or a timebase, the op-amp grows an output limit, the meter
stops being filtered out, the pot grows noise, or a bench is rescaled — and each
message names the lesson hint to soften and this document to update.

The gate is mutation-proven: changing `50-rc-scope`'s capacitor from 1 µF to
2 µF turns two tests red (the cutoff bracket and the scope-record comparison),
and reverting restores them.
