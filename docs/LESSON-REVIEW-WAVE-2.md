# Wave 2 technical review — "Measure rather than guess"

Reviewed 2026-08-23 against `3e87340f5`; re-measured the same day against
`a3f30be6b` after lite main moved under the review. Ten lessons, thirty
checkpoints.

**5 defective of 10 · 6 lessons revised to content version 2 · 4 defects open,
1 resolved upstream mid-review, none of them in a lesson.**

> **Every finding here is dated to a sha, and one of them expired in the hours it
> took to write this.** `6f8d11c5c` (bw-board bump: sparse solver and
> `setDeviceControl`) and `802fc1050` (eleven OLED/TFT opcodes) landed while the
> review was in flight and fixed one of the instrument defects outright. A
> measurement without a sha is a rumour by the time it reaches a second person —
> this document learned that the expensive way, and so did two other sessions.

Wave 2 is the instrument wave, so the question sharpens. For Wave 1 it was *can
the bench do the thing the checkpoint waits for*. Here it is also **is the
reading the learner is told to take trustworthy** — and three times the answer
is no for a reason that has nothing to do with the lesson.

Every number below came out of the engine the browser runs, via
`scripts/lesson-bench.mjs` over lite's own vendored `bw-circuit-ui` +
`bw-board`. `test/lesson-bench-claims-wave2.test.mjs` re-derives all of it on
every run, and is mutation-proven: changing the ammeter's shunt from 10 Ω to
22 Ω makes it red, and so does reverting the function generator's `freq` key to
`frequency`.

## Verdicts

| lesson | example | v | verdict |
| --- | --- | --- | --- |
| measurement-continuity | 76-multimeter | 1 | achievable |
| measurement-voltage | 73-voltmeter | 1→**2** | defect at `3e87340f5`, **resolved upstream** by `802fc1050`; copy restored |
| measurement-current-burden | 74-ammeter | 1→**2** | **defect, still open** — narrower than first reported: one display model lacks a handler |
| measurement-resistance | 22-series-parallel | 1→**2** | **defect** — the parallel-resistor formula has nothing to apply to |
| measurement-range-error | 76-multimeter | 1→**2** | **defect** — the amps gain is 31–39, not the documented 46.45 |
| measurement-function-generator | 49-function-generator-sine | 1 | achievable (was not, before the `freq` fix) |
| measurement-scope-probes-scale | 50-rc-scope | 1 | achievable, with one caveat below |
| measurement-scope-timebase | 49-function-generator-sine | 1→**2** | minor — named three windows the scope does not offer |
| measurement-scope-trigger | 49-function-generator-sine | 1 | achievable |
| measurement-rc-cursors | 43-rc-timing | 1→**2** | **defect** — the step it measures happens once and cannot be repeated |

The Tier-3 detector scanned all ten and reported **nothing**. That is the
expected result and worth stating: none of these five is a demand for a
capability the bench lacks, which is the only class it understands. They were
found by measuring.

## The defects

### 1. Two lessons told the learner to read a display that could not render

At `3e87340f5` both were dead, for different reasons and with the same learner
experience: a blank screen and no way to tell whether they had done something
wrong. One is now fixed; the other is not, and is narrower than I first said.

**`73-voltmeter` — was undefined, now works.** At the review tree the program's
`oled clear` / `oled set cursor` / `oled print` mapped to opcodes the `devices`
extension did not declare: 37 opcodes, not one oled verb. An undefined opcode is
silent in scratch-vm, so the block simply never ran.

`802fc1050` added eleven OLED/TFT opcodes (37 → 48) and `6f8d11c5c` vendored the
`setDeviceControl` dispatcher they call. Re-measured on `a3f30be6b` by executing
the dispatcher against the lesson's own bench, not by looking symbols up:

```
73-voltmeter, part oled1, kind ssd1306
  board.setDeviceControl exists?              true
  setDeviceControl(oled1, 'clear',  1)     -> true
  setDeviceControl(oled1, 'cursor', [0,0]) -> true
  setDeviceControl(oled1, 'print',  '…')   -> true
  device state changed?                       true
```

`true` from that dispatcher means a device model accepted the verb. The copy
change is therefore **reverted**: the lesson asks for its three-way comparison
again, with the 200 ms refresh caveat it always had.

**`74-ammeter` — still blank, and the reason is one device model.** My original
report said the whole actuator surface was inert because `setDeviceControl` was
defined nowhere. That was true of `3e87340f5` and is false now. What survives is
much narrower, and I would not have found it without re-measuring:

```
kind            registered   has control()
  ssd1306          yes           yes
  hd44780          yes           yes
  char_lcd         yes           yes
  char_lcd_i2c     yes           NO
```

`char_lcd_i2c` is the only one of the four display models in this corpus with no
`control()` handler — and it is exactly the kind `74-ammeter` seats. Calling each
model's handler directly confirms the gap is the *kind*, not the verb:

```
char_lcd      clear=true  cursor=true  print=true
char_lcd_i2c  no control() handler at all
hd44780       clear=true  cursor=true  print=true
ssd1306       clear=true  cursor=true  print=true
```

and through the board, on the lesson's own bench, all three verbs return `false`
with the display state unchanged.

The benches themselves were always fine, and that remains the frustrating part:

```
73-voltmeter  wiper   0% -> 0.0005 V (0 counts)    the lesson predicts 0
                     50% -> 2.5000 V (511 counts)                    2.5 V
                    100% -> 4.9995 V (1023 counts)                     5 V
              1 LSB = 5000/1023 = 4.888 mV — the lesson says "about 4.9 mV"

74-ammeter    load  25% -> I 6.579 mA, Vshunt 65.8 mV, Vshunt/I = 10.0000 Ω
                    50% -> I 9.804 mA, Vshunt 98.0 mV, Vshunt/I = 10.0000 Ω
                    75% -> I 19.231 mA, Vshunt 192.3 mV, Vshunt/I = 10.0000 Ω
              and I = 5 V / (500 + 10) = 9.804 mA, exactly the lesson's formula
```

**Fixed** in copy, EN and DE. `measurement-voltage` is back to the three-way
comparison. `measurement-current-burden` has the learner measure the shunt
voltage and work the current back out of it — the better exercise anyway — and
now names the real reason its screen is blank rather than the one since fixed.

**How this nearly went wrong**, because the shape is worth more than the finding.
The original defect was reported to me by bw-bundle and I confirmed it
independently. Both of us then re-measured on a tree that had *moved*, got a
different answer, and bw-bundle initially retracted the whole finding as an error
of instrument — GNU grep silently treats `board.js` as binary, because
`6f8d11c5c` introduced a literal NUL byte at line 1412 as a composite-key
separator in the same commit that added the method. bw-cui2 caught the
over-correction. The truth, measured by byte counts at four tips rather than by
grep at one:

```
3e87340f5   118242 bytes   setDeviceControl: absent   NUL bytes: 0   oled opcodes: 0
6f8d11c5c   121346 bytes   defined, line 1376         NUL bytes: 1   oled opcodes: 0
802fc1050   121346 bytes   defined, line 1376         NUL bytes: 1   oled opcodes: 6
a3f30be6b   121346 bytes   defined, line 1376         NUL bytes: 1   oled opcodes: 6
```

So the finding was **true when reported and resolved by `6f8d11c5c`** — not
false, and not a shared instrument fault. There was no NUL in the file I read, so
my grep searched it correctly and correctly found nothing. Three sessions spent
an hour deciding whether an instrument or a subject had changed, when the answer
was in the timestamps the whole time.

The pinned test earned its place: it reads bytes rather than shelling out to
grep, so when `setDeviceControl` appeared it went **red** with a message naming
this document and the lesson hint to update. A grep-based version of the same
assertion would have gone from true-negative to permanently-false-negative in one
commit and never failed again.

### 2. measurement-resistance applies a formula to a pair that is not there

The `predict` checkpoint said "For two parallel resistors use 1/R = 1/R1 + 1/R2",
which on `22-series-parallel`'s two 470 Ω branches gives 235 Ω. Measured with
the power off, as the lesson instructs:

```
one 470 Ω resistor alone                          470.0 Ω
one LED alone (under the ohmmeter's 1 mA test)   ~2.01 kΩ
the whole network, rail to rail                  2181.8 Ω
across the two parallel branch tops                 0.0 Ω  — they are the same node
```

Every branch carries an LED, so no bare resistor pair is exposed to the probes;
and the two "parallel" branches hang off the supply rail together with the
series branch, so probing across them is probing the whole network. 235 Ω is not
available anywhere.

The lesson's own `explain` is the right idea — "the meter sees every conductive
path between its probes, not the label on one selected resistor" — so this is a
hint that contradicts its own explanation.

**Fixed**, version 2: the formula stays (it is correct physics) but is now
followed by "then look at what is actually in each branch here", and the
`measure` hint quotes the three measured readings.

Confirmed working, and worth recording because the lesson claims it: the
ohmmeter returns `requires-power-off` while powered rather than inventing a
value.

### 3. measurement-range-error teaches a gain the bench does not deliver

The volts front end is exact. The 30 kΩ/10 kΩ divider measures a ratio of
**4.0000** at three different source settings, so "use ÷4 for volts" is right to
four figures.

The amps front end is not. `EXPECTED.md` documents "LM358 non-inverting ×46.5
(100 kΩ/2.2 kΩ)". Measured:

```
load  25%   I  66.65 mA   Vshunt 1.333 mV   Vout  45.74 mV   gain 34.31
load  50%   I  99.96 mA   Vshunt 1.999 mV   Vout  62.10 mV   gain 31.06
load  75%   I 199.84 mA   Vshunt 3.997 mV   Vout 155.50 mV   gain 38.91
load 100%   I   4.90  A   Vshunt 98.04 mV   Vout   3.50  V   gain 35.67
documented: 1 + 100000/2200 = 46.45
```

The cause is in `bw-board/devices/analog-amps.js`, and the model documents its
own mechanism honestly enough to diagnose from: the op-amp is a *damped
integrator* whose output moves `G_STEP × (v+ − v−)` per settle round and which
**stops when that step falls below 1 mV**. That leaves up to
`1 mV / G_STEP = 0.667 mV` of input error unamplified. On a 2 mV shunt signal
that is a third of the input, so the realised gain falls short — and because the
halting point depends on where the integrator started, it is not even a
constant.

The arithmetic checks out at the fixed point: at load 50% the amplifier sits with
`v+ − v− = 1.999 − 1.337 = 0.662 mV`, one hair under the 0.667 mV halt
threshold, and `46.45 × (1 − 0.662/1.999) = 31.07` against a measured **31.06**.
The gain is stable in time — 40 successive advances leave it at 31.0615 — so this
is a wrong fixed point, not slow convergence.

Two consequences worth writing down:

- The example's own documentation is self-inconsistent: it states ×46.5 *and*
  records the observed display as `067` for a current that measures 99.96 mA. The
  `067` is the bench being wrong, not the doc being stale.
- The model's source comment says "a follower (β = 1) lands within millivolts in
  ten rounds, resistor-gain stages faster". That is backwards. A gain stage has
  *small* β, so it converges *slower*: here β = 2.2k/102.2k = 0.0215, the
  contraction per round is |1 − 1.5 × 0.0215| = 0.9677, and closing 99% of the
  error would take 141 rounds against the ten the settle loop allows.

**Fixed** in the lesson, version 2, by not asking for a prediction the bench
cannot honour: the `predict` checkpoint now quantifies the volts path only and
asks what the amps gain stage is *for*, and the `test` checkpoint turns the
discrepancy into the exercise — "report the disagreement rather than the
datasheet number". The engine defect is open and pinned.

### 4. measurement-rc-cursors measures a step that happens once

τ and the 63.2 % landmark are both exactly right, which is why this took
measuring to find:

```
0.5τ  1.9673 V      1τ  3.1606 V   (the lesson quotes 3.16 V)
  2τ  4.3233 V      3τ  4.7511 V   (τ = 10 kΩ × 100 µF = 1 s)
```

But `43-rc-timing` is VCC → 10 kΩ → 100 µF → GND with **no controls at all**
(`getControls()` returns `[]`), and the charging step therefore happens exactly
once, in the first few seconds after the example opens. It cannot be repeated:

```
after 4 s                         Vcap 4.7511 V
setPower(false), wait 3 s         Vcap 4.7511 V   — frozen, not discharged
setPower(true), wait 1 s          Vcap rising from 4.7511 — it resumes, it does not restart
```

The checkpoint says "Place one cursor at the step start" and "Use HOLD after a
clean transition". A learner who reads the objective, sets up channels, picks a
timebase and then looks for the step finds a flat 5 V line and no control that
brings it back.

**Fixed**, version 2: set the scope up first, and the hint now says the charge is
one-shot and that reloading the example is the way to see it again. Pinned by an
OPEN DEFECT test that fails if a control ever appears on that bench — the real
fix is a charge switch, which is a bench change rather than a lesson change.

### 5. The ohmmeter is directional, by design

Found while checking my own continuity verdict, and it corrected it.
`board.resistance(a, b)` gives a different answer depending on which probe is
which:

```
22-series-parallel, whole network, power off
  resistance(+rail, −rail)   2181.8 Ω      the real path
  resistance(−rail, +rail)    333 MΩ       reads as an open circuit

76-multimeter, MODE button released
  resistance(btn.a, btn.b)   5×10⁸ MΩ      open, correct
  resistance(btn.b, btn.a)    102.4 kΩ
```

The mechanism is in `mna.js` and it is **deliberate** — bw-bundle's correction to
my first write-up, and the right one. For a power-off resistance measurement the
solver makes `testNodeB` the reference node and then skips the gnd-symbol merge
on purpose; the comment at `mna.js:354` gives the reason: "gnd symbols are
deliberately inactive (the T-network test's contract: a dangling gnd must not
become a shunt path)". Probe with ground as B and the circuit is whole; probe
with ground as A and it fragments, so a real path can read as open.

So the rule to write down is *"resistance() is directional; B is the reference;
put the black probe on ground"*, not *"resistance() is broken"*. My first draft
called it "a known simulator fault" **in learner-facing copy**, which was wrong;
the lesson hint now explains the reference rule instead.

Three of the five pairs I checked agree in both orders (220 Ω segment resistor,
2.3 kΩ divider, 49.7 Ω rail-to-rail), and a pair with no ground symbol on either
side is symmetric to the digit — which is what makes this the ground rule rather
than a general solver asymmetry. The disagreements are all ground-referenced.

**What it changes, proportionately.** For `measurement-continuity` the task is to
*classify* pairs as connected or open, and both readings of every ambiguous pair
sit far above any sane continuity threshold — so the classification survives and
the verdict stays achievable. For `measurement-resistance` it does not survive:
2181.8 Ω versus 333 MΩ is the difference between "the three branches in
parallel" and "nothing is connected", on the exact measurement the lesson asks
for. The v2 hint now tells the learner to put the black probe on ground and says
the other direction is a known simulator fault.

This also caught a bug in my own tooling: the numeric-contract prober enumerated
net pairs one way only, so it never saw 2181.8 Ω and flagged a correct hint. It
now probes both orders.

### 6. measurement-scope-timebase named windows the scope does not have — minor

The scope offers exactly three: Slow, Medium, Fast = 1, 0.25, 0.05 of an
8192-sample buffer taken at 10 µs, i.e. **81.92 / 20.48 / 4.096 ms**. The
`predict` checkpoint asked the learner to count 1 kHz cycles in "1 ms, 10 ms, and
100 ms", none of which the instrument offers, and the next checkpoint then says
"try slow, medium, and fast windows". The two steps did not join up.

Not serious — the arithmetic is the point and it is correct — but easy to fix, so
fixed: `predict` now names the three real windows. The `adjust` step's target of
"two to five cycles" is satisfiable: Fast at 4.096 ms holds 4.1 cycles of a 1 kHz
sine.

## The five that hold up, and what was measured

- **measurement-continuity** / `76-multimeter`: the ohmmeter refuses while
  powered (`requires-power-off`), and with power off the bench offers both kinds
  of pair the lesson asks for — connected: 220 Ω across a segment resistor, 49.7 Ω
  rail to rail, 2.28 kΩ across the volts divider; open: 331 MΩ between two
  unrelated MCU pins and 5 × 10⁸ MΩ across the released MODE button. The 2.28 kΩ
  across a nominal 40 kΩ divider is itself the lesson's teaching point about
  parallel paths, arriving free.
- **measurement-function-generator** / `49-function-generator-sine`: 0.0000 V
  valley, 5.0000 V peak, 999.9 µs period. All three controls the checkpoint names
  are live — amplitude 2.5 → 1.0 gives 2.0 Vpp, `freq` 1000 → 250 gives 3999.9 µs.
  This lesson was **not** achievable before the `freq` fix earlier in this
  campaign: `mna.js` reads `p.freq ?? 1000` and the file declared `frequency`, so
  the frequency control in the UI moved nothing.
- **measurement-scope-probes-scale** / `50-rc-scope`: input 5.0000 Vpp, output
  0.7862 Vpp centred on 2.4984 V — matching the 0.78 V its own `EXPECTED.md`
  predicts, also only since the `freq` fix (before it the bench ran at 1000.1 Hz
  and delivered 0.0844 Vpp). *Caveat, recorded not fixed:* the lesson suggests
  "1 V/div centered at 2.5 V", at which the input fills the screen exactly and
  the output is a 0.79-division squiggle. The checkpoint's own explain warns that
  "a trace that is tiny wastes vertical resolution" — but the scope's V/div is a
  single global setting, so the learner cannot scale the two channels
  independently to fix it. The comparison the lesson wants is still possible; the
  advice is just incomplete.
- **measurement-scope-trigger** / `49-function-generator-sine`: rising and
  falling modes both exist with a numeric level, and a TRIG/WAIT indicator that
  goes amber when no crossing is found — so "force WAIT with an impossible level"
  works by setting a level outside 0–5 V.
- **measurement-voltage** and **measurement-current-burden**'s electrical halves,
  quoted under defect 1 above, are exact.

## What I could not check

- **The German copy.** I revised it alongside the English for all six version-2
  lessons, but a translation review is a separate skill and stays open in the
  ledger.
- **Pedagogy** — whether these are the right ten lessons, and whether the
  instrument wave should come second.
- **The compiled/emulated path.** The two dead displays are dead in the SIM path,
  which is the path `measurement-voltage` explicitly names ("Choose SIM"). Whether
  the same programs drive an OLED or LCD through `generateC` → emu8051/avr8js is
  a different question and I did not test it.
- **`76-multimeter`'s seven-segment display**, beyond noting that it is driven
  electrically from MCU pins rather than through the `devices` extension, so the
  `setDeviceControl` defect does not touch it. Its full chain needs sdcc plus the
  emu8051 WASM build, which its own `EXPECTED.md` says are env-gated.
- **Whether the ×46.5 stage would be correct on hardware.** The finding is that
  the simulated op-amp does not reach its closed-loop gain. The schematic itself
  looks right.

## Reproducing

```
node --test test/lesson-bench-claims-wave2.test.mjs
```

Four of its thirteen tests are named `OPEN DEFECT` and assert that a defect
**still reproduces**; one is named `RESOLVED UPSTREAM` and guards a fix instead.
The open four are meant to fail the day `char_lcd_i2c` gains a control handler,
the op-amp reaches its gain, `43-rc-timing` grows a switch, or the ohmmeter stops
being directional — and each failure message names the document and the lesson
hint to update.

Two of them already have. The OLED pair fired within hours of being written,
which is the only reason this document is right.
