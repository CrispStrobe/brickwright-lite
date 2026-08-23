# Tier 3: can a lesson checkpoint's observation ever happen?

*Built and run 2026-08-23 against `4bf43f632`. Implements Tier 3 of
`docs/VERIFICATION-AUTOMATION.md`. Internal technical doc, English only.*

**79 lessons scanned · 180 checkpoints · 47 quoted quantities examined ·
6 defects found · 3 fixed · 3 open, all one app-side cause.**

## Why a detector rather than another reading pass

Two defects were found by reading the first seven lessons, and both were the
same shape: **the checkpoint asks the learner to observe something the bench it
names cannot produce.** The diode lesson asked for alternating input/output
traces from a static polarity bench; the capacitor lesson asked for discharge
from a charge-only bench. A shape that appears twice in seven is worth detecting
rather than re-reading seventy-two more times.

The detector scans the whole catalog in about six minutes. The reading pass that
preceded it took a day for twelve lessons — and, as the boundary section below
records with a measurement, the two find *different* defects. Neither replaces
the other.

## How it decides

Three checks, kept separate because their confidence is different.

**A — observable reachability.** Structural, no prose, no judgement. Each
checkpoint may carry `observe: {event}`, and each event has exactly one producer
in the app. The producers were read out of the source, not taken from PLAN.md's
list, which predates them:

| event | dispatched by | needs |
| --- | --- | --- |
| `project-run` / `project-stop` | `containers/controls.jsx` | a program is loaded |
| `circuit-ready` | `tw-pseudocode/circuit-tab.jsx` (`handleCircuitReady`) | a circuit is loaded |
| `circuit-changed` | `tw-pseudocode/circuit-tab.jsx` (`handleDeclarationChange`) | the derived **pin declarations** move |
| `debug-phase` | `tw-pseudocode/circuit-tab.jsx` (`handleRunnerChange`) | a debug session |
| `hardware-state` | `components/gui/gui.jsx` | a real peripheral connects |
| `starter-loaded` | `guided-lessons.jsx` itself | the lesson opened from a starter journey |

A `circuit-only` lesson that observes `project-run` can never see it. A
`simulation` lesson that observes `hardware-state` can never see it. Where the
answer needs a measurement rather than a lookup — does an ordinary circuit edit
move the declarations? — the circuit is loaded and the edit is actually made.

**B — demand versus measured capability.** The prose asks for an action or an
observation; `scripts/bench-capabilities.mjs` says, **by solving the circuit**,
whether the bench can supply it. It is not a part-list heuristic: "has a
capacitor" is not "can discharge", and `29-capacitor-charge` is the proof —
it has one and cannot. So `capDischarges` is true only when some capacitor's
voltage is *measured to fall*, `alternates` only when a node is measured to
cross its own mean repeatedly, `stateCount` is the number of distinct
node-voltage vectors reachable across every control setting and eight sample
times.

**C — the numeric contract.** A quantity quoted in lesson prose must be
reproducible from the bench: present in the example's `EXPECTED.md` assert
block, in the circuit as a component value, or in the solved node voltages,
branch currents and time constants. Tolerance follows the precision of the
quote — "0.07 V" claims to be nearer 0.07 than 0.06, so half a unit in its last
decimal place, not a flat percentage.

## Mutation proof

`test/lesson-defect-detector.test.mjs` and `test/lesson-numeric-contract.test.mjs`
run on every `npm test`.

The fixtures are not synthetic. They are the **actual version-1 lesson objects**
from the commit before each was repaired, vendored under
`test/fixtures/lesson-v1/` with their provenance sha and the command to
re-derive them. So what is proven is that the detector catches the two defects a
human found by reading:

```
electricity-diode v1     -> 42-diode-rectifier
   predict  "Sketch the output for positive and negative input halves"
   observe  "Compare input and output traces over a full cycle"
   explain  "Describe what happens between successive positive peaks"
   bench: stateCount 1, no controls, alternates false, timeVarying false

electricity-capacitor v1 -> 29-capacitor-charge
   observe  "Observe voltage and current during charge and discharge"
   bench: timeVarying TRUE, capDischarges false
```

The capacitor fixture is the more useful of the two: the bench *does* vary with
time, so a "is anything moving?" check would have passed it. What fails is
specifically that no capacitor voltage ever falls.

The negative half matters as much, and is asserted: both **repaired** version-2
lessons come back clean. A detector that flags the fix along with the defect
gets switched off.

Check C is mutation-proven by injecting a value no bench produces into every
lesson objective: 0 unmatched as shipped, **69 unmatched mutated**.

## What the sweep found

The first full run produced 15 findings. Seven were real; eight were false
positives in five distinct classes, each of which named a way the prose
heuristic misfires and each of which is now pinned by a regression test so the
narrowing cannot be quietly undone.

### Real, and fixed here (3)

**`signals-rc-response` v1 → v2, on `43-rc-timing`.** "Calculate voltage at 0,
0.5τ, 1τ, 2τ, and 3τ for charging **and discharging**." The bench is
VCC → 10 kΩ → 100 µF → GND with no switch and no control: `capDischarges: false`,
`controls: []`. The capacitor charges toward the supply and stays there. Fixed by
scoping the checkpoint to the charging step the bench delivers, naming
τ = 10 kΩ × 100 µF = 1 s, and pointing at the capacitor-discharge lesson for the
falling half. Measured landmarks, which the corrected text can be trusted
against: 0.5τ → 1.9673 V, 1τ → 3.1606 V, 2τ → 4.3233 V, 3τ → 4.7511 V.

**`machines-logic-levels` v1 → v2, on `06-active-low-high`.** "Predict voltage,
raw bit, and logical assertion for **press and release** on both active-high and
active-low **inputs**." The bench has no input of any kind: breadboard, VCC, GND,
two resistors, two LEDs, and an MCU whose program declares two pins, both
`OUTPUT`. There is nothing to press. The example teaches active-low versus
active-high **outputs**, and the lesson had been written about inputs. Fixed by
reframing both checkpoints onto the output pins, with the measured contrast:
P1.0 low = 0.0725 V lights the active-low LED (brightness 0.1449) while P1.1
high = 4.9275 V lights the active-high one.

**`interactive-extension-discovery` v1 → v2, on `mb05-lesson`.** Its `inspect`
checkpoint observed `starter-loaded`, which `guided-lessons.jsx` completes only
for a lesson opened from the first-run chooser. The three journeys are
`47-battery-led`, `01-blink` and `spike01-obstacle-avoid`; `mb05-lesson` is not
among them, so the observable could never fire. The dead `observe` was removed —
the checkpoint is an inspection, and its manual affordance is the honest one.

### Real, open, and all the same cause (3)

`starter-circuit-path/change`, `signals-resonance/sweep`,
`machines-contention/repair` all observe `circuit-changed` on a bench with no
MCU. That event is dispatched only from `handleDeclarationChange`, and
`CircuitDesigner` calls that only when
`JSON.stringify(circuitToDeclarations(parts, wires, resolvedNets))` **changes**.
Measured on `47-battery-led`:

```
edit                                    declarations after            event?
change the resistance 1k -> 470   {"pins":[],"ports":[],"parts":[]}    no
break one wire                    {"pins":[],"ports":[],"parts":[]}    no
delete the LED entirely           {"pins":[],"ports":[],"parts":[]}    no
```

The first two are exactly the edits `starter-circuit-path`'s hint suggests. Be
clear about severity: the learner is **not** misled and **not** blocked, only
unaided — the manual affordance still completes the checkpoint. That is why the
observables are left in place rather than deleted. The lessons' intent is right;
the app should emit `bw-circuit-changed` when the circuit changes, not only when
the derived pin declarations do. The fix belongs in `CircuitDesigner`, which is
vendored from `bw-circuit-ui` and would be reverted by the next
`npm run sync:circuitui`. All three are on the ratchet in
`test/lesson-defect-detector.test.mjs`, which fails when they stop reproducing,
so the fix cannot leave this document behind.

### False positives, and what each taught

| finding | why it was wrong | narrowing |
| --- | --- | --- |
| `starter-lego-extension`: "use the manual button" | the lesson panel's own completion control, not a bench part | `(?<!manual )\bbutton\b` |
| `electricity-motor-flyback`: "while it runs" | the motor runs, not a program | dropped from the run-a-program pattern |
| `measurement-resistance`, `signals-resonance`: "stored energy discharged", "discharge procedures" | real-hardware safety rules, not observations of this bench | a demand must share its sentence with an observation verb |
| `interactive-input-controls`, `interactive-two-way-binding`: "no button" | both are program-only with no circuit, but ship a `controller.json` faceplate — 37 button widgets across the corpus | faceplate widgets count as affordances |
| three `debug-phase` on circuit-only lessons | a `w65c02` or `z80` part on the board sets `bwDeviceCore`, so a machine bench boots from the ROM in its own circuit and is debuggable with no `program.bw` | machine-CPU kinds satisfy `debuggable` |

### One finding that went missing, and how

Between two runs the `43-rc-timing` discharge defect disappeared. It had not
been fixed. `sentenceAround` split on a bare `.`, so "Calculate voltage at 0,
**0.**5τ …" was cut at the decimal point, the observation verb "Calculate" fell
outside the fragment, and the finding was silently suppressed. Only adjudicating
the *disappearance* — not just the appearances — caught it. It is now pinned as
its own mutation test.

## The boundary, measured rather than asserted

The hand review of Wave 1 that preceded this (`docs/LESSON-REVIEW-WAVE-1.md`)
found five defects in twelve lessons. **The detector catches none of them.**
That is not a guess; each version-1 form was fed to it:

```
electricity-polarity           v1  not flagged
electricity-series-parallel    v1  not flagged
electricity-inductor           v1  not flagged
electricity-motor-flyback      v1  not flagged
electricity-transistor-switch  v1  not flagged
```

Those five are: a lesson naming the wrong component (LED where the bench
reverses a diode), a conservation equation that is false on its bench by
3.158 mA, a comparison of two nodes that sit 0.2 mV apart at the state the
lesson opens, a condition to verify "while powered" on a bench that opens
unpowered, and an instrument that reports 43.0 mA where its own series branch
carries 5.8 mA. None is a demand for a capability the bench lacks, which is the
only class this detector understands.

So the honest summary is: **the detector covers one defect class across all 79
lessons; reading covers many classes across as many lessons as someone has time
for.** Six defects from the detector, five from reading twelve lessons, and no
overlap. Both are needed.

## What this cannot check, stated so it cannot be assumed

- **Pedagogy.** Whether the concept is worth teaching, and whether this example
  is the right vehicle for it.
- **Prose quality**, and **the German copy**. Check B and Check C read English
  only. A German translation that asks for something different is invisible
  here. That is deliberate — a detector that appeared to cover the translations
  would be worse than none — and it leaves the translation review genuinely
  open in PLAN.md's ledger.
- **Which side to fix.** Every finding says a lesson and a bench disagree. It
  never says which is wrong: `signals-rc-response` was fixed in the lesson,
  `machines-logic-levels` could equally have been repointed at a bench with a
  button, and the `circuit-changed` three are app bugs.
- **A checkpoint with no `observe` clause**, under Check A. Ninety-nine of the
  180 have none, by design — "explain it in your own words" has no observable —
  so they are reachable only through Checks B and C.
- **The first instance of any novel class.** Detectors are written from named
  classes, and something has to name them. That is what reading is for.
- **Numeric coverage is narrow.** Only 13 of 79 lessons quote an electrical
  quantity in English prose at all, 47 quantities in total. Check C protects
  that seam and says nothing about the other 66 lessons.
- **Ten lessons were skipped by Check C** with a stated reason, never silently:
  nine are program-only and have no bench to quote numbers from, and one machine
  bench outruns the 15 s measurement budget. Check B reports the same truncation
  as `partial` and downgrades any finding on that bench from blocking to review,
  because "not measured" is not "cannot happen".

## Running it

```
node scripts/detect-lesson-defects.mjs              # all 79, human-readable
node scripts/detect-lesson-defects.mjs <lesson-id>… # one or a few
node --test test/lesson-defect-detector.test.mjs    # mutation proofs + corpus ratchet
node --test test/lesson-numeric-contract.test.mjs   # Check C, with its coverage assertion
```

### Why the fixtures are vendored rather than read from git

The first version of the gate ran `git show <rev>^:…` to fetch them. That passes
on a developer checkout and **failed on every CI run**: `actions/checkout@v4`
clones at depth 1, `.github/workflows/build.yml` sets no `fetch-depth`, so the
parent commit is not in the runner's object store and git exits with
`fatal: invalid object name`. It was the only failing file on lite main, and it
was mine — reported by bw-bundle, who diffed the failing-test locations on their
branch against main's.

Vendoring fixes more than the clone depth: a gate that reads git history also
breaks on the next squash, rebase or force-push, and these two objects are the
evidence the whole detector rests on.

The fix is proven both ways, by putting a `git` on PATH that exits 128 on every
call: the old version goes red with exactly the CI error, the new one passes
13/13. No other gate in this campaign shells out to a subprocess.

### Running the ratchet

The ratchet in `test/lesson-defect-detector.test.mjs` holds the three open
findings and fails in **both** directions: a new unachievable checkpoint fails
it, and so does an entry that stops reproducing — so a fix has to delete its
ratchet entry and update this document in the same commit.
