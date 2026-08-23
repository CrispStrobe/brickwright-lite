# Brickwright Lite improvement plan

Status: active execution plan  
Started: 2026-08-21  
Product promise: **Build circuits. Program machines. See how they work.**

Brickwright Lite is a native, open-source visual computing workbench. It combines
block programming, editable structured code, circuit design and simulation,
debugging, and direct control of supported LEGO hubs. It is not a TurboWarp fork.
It uses upstream Scratch components where they are useful, alongside Brickwright's
own editor, code model, circuit engine, device runtimes, and native shell.

This document turns the product review into an ordered implementation plan.
`ROADMAP.md` remains the detailed engineering backlog and historical record; this
file defines the user outcomes, sequencing, and release gates.

## How this plan is executed

Work proceeds in the numbered order below. A milestone is complete only when its
acceptance criteria and proportional automated checks pass. Every milestone should
leave the app releasable; large features use an internal flag until their complete
path is usable. Existing user work and local settings must remain readable.

The primary success measure is time to a meaningful result, not feature count:

- A new user can run or interact with something useful in under three minutes.
- Switching representation never silently changes the meaning of a project.
- Simulation and connected hardware explain their current state and failures.
- A project can be saved, reopened, shared, and recovered with no missing pieces.

## Milestone 0 — What we already ship is correct

Status: **open — takes precedence over new breadth (added 2026-08-22)**

This milestone did not exist, and its absence is the plan's main structural fault. Milestones 1–10
all describe things to *add*. Nothing in the plan owns the question *is what we already ship
right*, so that work — which has consumed most of the last week — appears only as scattered
acceptance criteria and as entries in the execution log after the fact.

The evidence that it needs to be first, not folded into the others:

- **Five gates were found that could not fail** (sb3-creator/bw-circuit-ui/bw-board audit,
  `test/GATE-AUDIT-REPORT.md`): assertions reading removed properties, a path typo that made two
  tests report "skipped" forever, a glob that never matched the primary `circuit.json`, and
  `assert.ok(true)` on both branches of an if/else. Every one had been green for weeks.
- **Five gallery examples were green and inert** — `set variable X to Y` assigns a variable *named*
  "variable X" while reads say `X`. `bw check` passed on all of them. Syntax-valid, semantically
  dead.
- **A shipped extension is missing 8 opcodes the emitter emits**, affecting three shipped examples,
  and the gate that would catch it skips in CI by construction. See `ROADMAP.md` §5.1.
- **Lessons were teaching observations their example cannot produce.** The first two put to
  technical review both failed that way (the diode lesson asked for alternating traces from a
  static polarity bench; the capacitor lesson asked for discharge from a charge-only bench).
  The full Wave 1 pass that followed found the same fault in five of its twelve lessons —
  see the ledger below and `docs/LESSON-REVIEW-WAVE-1.md`. Sixty-seven lessons remain unreviewed.

The common shape: **breadth shipped ahead of verification, and the verification that existed could
not fail.** Adding more content on that base multiplies the debt rather than the value.

Scope:

- Every shipped example is proven to *run*, not merely to parse: executed in the real VM, and
  — where it targets a device — its blocks resolved against the extension that device loads.
- Every shipped lesson's checkpoints are proven achievable against the example it names.
- Every gate is mutation-proven: re-introduce the defect it guards, confirm red, restore. A gate
  that cannot be shown to fail is treated as absent.
- Cross-repo gates either run in CI or fail loudly where they cannot. A skip is not a pass.
- No new content wave starts while its predecessor's review debt is open (see the ledger below).

Acceptance criteria:

- The example corpus gate executes every shipped program and every shipped circuit variant, and a
  deliberately broken example makes it red.
  - **Programs: done 2026-08-23.** `test/example-vm-execution.test.mjs` runs all 257
    program-bearing examples in the real Scratch VM with lite's bundled extensions; 114 are
    circuit-only placeholders and are asserted to BE placeholders, 143 carry the execution burden,
    117 execute clean. Eight mutations proven red and restored, including this milestone's own
    `set variable X to Y` re-introduced into `05-counter`. Findings and the coverage the gate does
    NOT have: `docs/EXAMPLE-CORPUS-FINDINGS.md`.
  - **Circuit variants: still open.** `test/schematic-*.test.mjs` renders all 1,034 and checks
    mechanical legibility; nothing asserts a variant is electrically what the simulator solves
    (§6).
- Extension conformance runs in CI for every device family the gallery targets, with no
  environment in which it silently skips.
- The verification-debt ledger below has no open wave older than the newest shipped wave.
- Every entry in the dead-module exclusion list is either tracked as a roadmap item or removed
  (`ROADMAP.md` §4).

**How this milestone gets executed:** see `docs/VERIFICATION-AUTOMATION.md`.
The short version, measured rather than assumed: 244 of 275 examples already
carry machine-readable `assert` blocks, `test/assert-physics.test.mjs` already
parses them, and it checks 242 assertions while **skipping 115** as "unknown
kind". Those 115 are claims already written down and never verified. Extending
that parser, plus a declared-pins-equal-wired-pins invariant, verifies far more
of the corpus than reading it example by example — and the reading pass is
demonstrably unreliable where it matters, since the 6502 terminal's
repeated-key bug survived a careful read and a clean `bw check` and died the
moment the program was executed. Build detectors, batch-fix what they flag,
read only the residue.

### Verification-debt ledger

Waves 1–7 are all recorded in the execution log as engineering/content drafts **complete**. Wave 1's
technical review is now closed; the other six are still open. Stated plainly, so it cannot read as
finished work:

| Wave | Lessons | Draft | Technical review | Translation review | Learner field test |
| --- | --- | --- | --- | --- | --- |
| 1 Electricity you can see | 12 | done | **full, done 2026-08-23** — 5 of 12 defective; 4 fixed, 2 open engine/app defects | open | open |
| 2 Measure rather than guess | 10 | done | **full, done 2026-08-23** — 5 of 10 defective; 6 revised to v2, 5 open engine defects | open | open |
| 3 One idea, several languages | 12 | done | scanned; **full review open** | open | open |
| 4 Interactive systems | 8 | done | scanned; **full review open** | open | open |
| 5 Debug with evidence | 10 | done | scanned; **full review open** | open | open |
| 6 Signals and systems | 10 | done | scanned; **full review open** | open | open |
| 7 Computers from wires upward | 10 | done | scanned; **full review open** | open | open |

"Scanned" and "reviewed" are different claims and the table keeps them apart.
**Scanned** means all 79 lessons and all 180 checkpoints went through the Tier-3
detector (`docs/LESSON-ACHIEVABILITY-SWEEP.md`), which decides one question
mechanically: can this checkpoint's observation ever happen on the example it
names? **Reviewed** means a human worked through every checkpoint against a
solved bench, which is what Wave 1 got and what found the other four classes of
defect the detector cannot see.

**57 of 79 lessons have had no full technical review**, though all 79 are now machine-scanned for
the one defect class that detector understands. Treat this table as the plan's real critical path:
a lesson that teaches an observation its bench cannot produce is worse than a missing lesson,
because a learner blames themselves.

### Wave 2, and what the instrument wave turned up

Reviewed 2026-08-23 — `docs/LESSON-REVIEW-WAVE-2.md`. **10 lessons, 30 checkpoints, 5 defective,
6 revised to content version 2, 4 defects open and none of them in a lesson.** The Tier-3 detector
reported nothing on this wave, which is the expected result: none of the five is a demand for a
missing capability, so all five were found by measuring.

Three of the four open defects are the same discovery from different angles — **the simulator
cannot show a reading to a learner**:

- `73-voltmeter`'s OLED never renders: the program's `oled clear/set cursor/print` map to opcodes
  the bundled `devices` extension does not declare at all, and an undefined opcode is silent.
- `74-ammeter`'s LCD never renders for a harder-to-see reason: `lcdprint`/`lcdcursor`/`lcdclear`
  ARE declared and implemented, but each body is `if (b && b.setDeviceControl) b.setDeviceControl(…)`
  and `setDeviceControl` is defined nowhere in the repository. Twelve actuator verbs share the
  shape — servo, motor, relay, neopixel, matrix — so the whole actuator surface of that extension
  is an unconditional no-op that passes every opcode-resolution check. First reported by bw-bundle,
  re-derived here rather than taken on trust.
- `76-multimeter`'s current amplifier delivers a gain of 31–39 against a documented ×46.45, and
  the realised figure depends on the input. bw-board's LM358 is a damped integrator that halts once
  its per-round output step drops below 1 mV, leaving up to 0.667 mV of input error unamplified — a
  third of a 2 mV shunt signal. The example's own EXPECTED.md is self-inconsistent as a result: it
  documents ×46.5 and records a display of `067` for a current measuring 99.96 mA.

A fifth, found while re-checking my own continuity verdict: `board.resistance(a, b)` is **not
symmetric**. The solver makes `testNodeB` the reference and then skips the gnd-symbol merge, so on
22-series-parallel the whole network reads 2191.6 Ω probed one way and 333 MΩ — an open circuit —
probed the other. It corrected a verdict I had already written down, and the measurement-resistance
hint now tells the learner which way round to hold the probes.

The fourth is a bench, not an engine: `43-rc-timing` has no controls at all, so the charging step
its cursor lesson measures happens once and cannot be repeated — power-off freezes the capacitor
rather than discharging it, and power-on resumes from where it stopped.

The two lessons that needed no engine change were straightforwardly wrong and are fixed:
`measurement-resistance` told the learner to apply 1/R = 1/R1 + 1/R2 to a pair of parallel
resistors that does not exist on its bench (every branch carries an LED; the whole network reads
2192 Ω rail to rail and the two branch tops are the same node), and `measurement-scope-timebase`
asked for cycle counts in 1/10/100 ms windows when the scope offers 4.096/20.48/81.92 ms.

### The Tier-3 detector, and what it changes about the estimate

Built and run 2026-08-23 — `docs/VERIFICATION-AUTOMATION.md` Tier 3, written up in
`docs/LESSON-ACHIEVABILITY-SWEEP.md`. **79 lessons, 180 checkpoints, 47 quoted quantities,
6 defects found, 3 fixed, 3 open.** It is mutation-proven against the two known version-1
defects — the actual lesson objects read out of git history, not synthetic ones — and asserted
not to flag either repair.

Three lessons were repaired from its findings and bumped to content version 2:
`signals-rc-response` asked for a discharge curve on a bench with no discharge path;
`machines-logic-levels` asked the learner to predict "press and release" on a bench with no
input of any kind, whose program declares two output pins; `interactive-extension-discovery`
hung a checkpoint on `starter-loaded`, which only fires for the three first-run journeys and
its example is not one of them.

Three remain open and share one cause: `bw-circuit-changed` is dispatched only when the derived
**pin declarations** move, so on an MCU-less bench no circuit edit can raise it — measured, and
ratcheted in `test/lesson-defect-detector.test.mjs`. It needs a `CircuitDesigner` change in
bw-circuit-ui. The learner is unaided rather than misled, so the lessons keep their intent.

**The estimate this changes, and the one it does not.** The detector understands exactly one
class: a checkpoint demanding a capability its bench does not have. Fed the version-1 forms of
the five defects Wave 1's reading pass found, **it flags none of them** — a wrong component name,
a false conservation equation, two nodes 0.2 mV apart, a condition to verify "while powered" on an
unpowered bench, an instrument reading 43.0 mA where its branch carries 5.8 mA. So the sweep
retires one class across all seven waves and leaves the rest of the debt exactly where it was.
Waves 2–7 still need reading; they now need it for fewer things.

Wave 1 is now reviewed in full — `docs/LESSON-REVIEW-WAVE-1.md`, every verdict backed by a
measurement taken from the engine the browser runs and re-derived on every test run by
`test/lesson-bench-claims.test.mjs` (mutation-proven: breaking a shipped circuit makes it red).
It found **five defective lessons out of twelve**, which is close to the rate the first two
predicted and is the reason waves 2–7 come before any new content:

- `electricity-polarity` asked the learner to identify two LED directions on a bench where both
  LEDs are forward-biased; the reversed part is a diode. Fixed, v2.
- `electricity-series-parallel` told the learner to write `Isource = Ibranch1 + Ibranch2`, which
  is false there by 3.158 mA at every node — all three branches share the supply rail. Fixed, v2.
- `electricity-inductor` asked to compare the signal before and after the inductor at a DC
  operating point where the two nodes are 0.2 mV apart, and never told the learner to make an
  edge. Fixed, v2.
- `electricity-motor-flyback` asked to verify the diode is reverse-biased "while powered" on a
  bench that opens with the switch off and every node at 0 V. Fixed, v2.
- `electricity-transistor-switch` switches correctly, but an ammeter on the transistor's
  collector reads 43.0 mA against 5.8 mA in its own series branch. Copy steered to the load
  resistor, v2; the engine defect is open.

Two defects could not be fixed from the lesson side and stay open, both pinned by tests that
fail when they are fixed: `branchCurrent()` reports a device model's internal quantity rather
than the solved branch current (and a flat zero for `switch`, `button`, `dc_motor`), and
`bw-circuit-changed` fires only on pin-declaration changes, so `starter-circuit-path`'s "change
one thing" checkpoint can never tick itself on an MCU-less bench. A third, found in passing:
`dc_motor` stamps its winding inductance in parallel with the winding resistance, so its DC
operating point depends on the solver's time step and its declared `windingR: 10` behaves as
4.5–5.0 Ω.

One finding is structural rather than per-lesson: ten of Wave 1's twelve lessons hang their
measuring checkpoint on `circuit-ready`, which fires when the example finishes loading. Those
checkpoints tick themselves before the learner has measured anything. Read waves 2–7 knowing
that, rather than rediscovering it seven times.

## Milestone 1 — First useful result

Status: **complete (2026-08-21)**

Create a first-run chooser with three outcome-oriented starter journeys:

1. **Build a circuit** opens a safe circuit-only battery and LED example.
2. **Program a board** opens the Blink program and its matching simulated board.
3. **Control LEGO** opens a LEGO hub project and explains that real hardware is
   optional until the connect step.

Scope:

- Show the chooser once on first use, after the editor is ready.
- Make it dismissible without blocking normal editing.
- Add “Getting started…” to Settings so it is never a one-shot surface.
- Reuse the canonical examples index and existing example loading pipeline.
- Localize the experience in English and German.
- Preserve the existing confirmation before a starter replaces project content.
- Record only local, anonymous journey events unless telemetry is explicitly on.

Acceptance criteria:

- Each card names the outcome, required hardware, and expected time.
- Choosing a journey selects the Circuit tab and loads the matching shipped entry.
- Missing index entries or files produce an actionable visible error.
- Dismissal survives reload; reopening from Settings always works.
- Keyboard focus is trapped sensibly in the dialog, Escape closes it, and all
  controls have accessible names.
- The starter IDs are validated against `examples/index.json` in CI/tests.

Non-goals: a multi-page tutorial engine, accounts, cloud progress, or mandatory
hardware pairing.

## Milestone 2 — Examples become guided lessons

Status: **79-lesson engineering draft complete; reviewed curriculum active**

Extend selected examples with a small, versioned lesson schema: objective,
prerequisites, ordered checkpoints, hints, success conditions, and optional hardware
steps. Render one instruction at a time alongside the live editor; never replace the
editor with documentation.

### Legacy Scratch tutorial decision

Retain the useful interaction idea from Scratch's legacy Cards—small guidance beside
the live workspace, previous/next navigation, and a Tutorials library—but do not use
its deck schema as Brickwright's curriculum format. Legacy decks are JSX containing
static image or hosted-video steps. They have no stable content format, prerequisites,
learner model, language variants, live success checks, progress versioning, circuit or
instrument state, hardware state, or offline guarantee. Brickwright lessons use
versioned JSON and can be adapted into a legacy Card renderer later; Scratch decks can
likewise be imported as `presentation`-only lessons through an adapter.

### Curriculum model

Lessons are organized on independent axes rather than equating age with difficulty:

- **Domain:** computing concepts, circuits, electronic components, instruments,
  control/widgets, extensions and hardware, representation/languages, debugging,
  embedded systems, and computer architecture.
- **Depth:** discover, foundation, practitioner, advanced, research. “Discover” uses
  concrete language and pictures suitable for roughly age 9+, while “research” may
  expect calculus, signal theory, data sheets, and experimental uncertainty.
- **Representation:** Blocks, Brickwright Code, Python, JavaScript, C, BASIC, and ASM.
  A lesson names a canonical semantic task and supplies only the variants it can teach
  honestly. Generated previews are not described as independently editable source.
- **Environment:** simulation, optional hardware, or hardware required. A simulation
  fallback and manual checkpoint are explicit where physical observation cannot be
  detected reliably.
- **Pedagogy:** predict, build, run, observe, explain, change, diagnose, and extend.
  Lessons should ask learners to make and test a claim rather than merely click Next.

The initial curriculum map is:

| Strand | Discover / foundation | Practitioner | Advanced / research |
| --- | --- | --- | --- |
| Circuits | closed paths, polarity, LED + resistor, series/parallel | dividers, RC time constant, transistor/motor drive | impedance, filters, loading, stability, uncertainty |
| Instruments | continuity and voltage | current, sweep, oscilloscope triggering | Bode plots, phase, FFT/noise, probe loading |
| Code | events, sequence, loops, variables | functions, state machines, concurrency, protocols | memory, timing, interrupts, optimization |
| Representations | Blocks ↔ Code correspondence | Python/JS/C variants and conversion limits | ABI, generated C, BASIC and ASM correspondence |
| Debugging | pause, step, watch one value | breakpoints, conditions, call stack, pin trace | instruction trace, buses, races, timing faults |
| Control | buttons, sliders, gauges | two-way widget binding and dashboards | HMI design, sampling, calibration, safety |
| Hardware/extensions | simulated sensors, extension blocks | connect/deploy/reconnect and capabilities | transport protocols, latency, firmware boundaries |
| Machines | MCU pins and peripherals | 6502/Z80 buses and memory maps | contention, decode logic, timing and architecture |

### Lesson schema and runtime

Each lesson has a stable id, schema version, content version, localized title and
objective, domains, depth, age guidance (advisory only), prerequisites, estimated
time, required/optional hardware, an example id, supported language variants, and
ordered checkpoints. A checkpoint includes an action, explanation, hint, observable
condition, and an always-available manual completion label. Conditions use a small
declarative vocabulary (`starter-loaded`, `project-run`, `project-stop`,
`circuit-ready`, `circuit-changed`, `debug-phase`, `hardware-state`)—never arbitrary
code from lesson data.

Progress is stored locally under lesson id plus content version. Updating content can
migrate deliberately or starts a clean attempt; it never mislabels obsolete progress
as complete. The runner shows one checkpoint beside the editor, records automatic or
manual completion distinctly, allows previous/next, reveals hints on demand, can be
closed and resumed, and can reset progress. Automatic observation is assistance, not
assessment: every step remains manually confirmable.

### Exemplary vertical slice

The first implementation proves the architecture with curated lessons spanning:

- a battery–resistor–LED closed-path lesson for discover/foundation learners;
- Blink represented in Blocks, Brickwright Code, Python, JavaScript, and C;
- voltage-divider and RC oscilloscope instrument lessons;
- a controller-widget binding lesson;
- a breakpoint/step/watch debugger lesson;
- an impedance/filter investigation for advanced learners; and
- a 6502 bus-contention diagnosis that can extend toward ASM instruction tracing.

Only the three onboarding lessons are initially launched automatically. The remaining
catalog entries establish validated curriculum breadth and are selectable from the
Lessons library in File or Settings. Content depth then grows strand by
strand; breadth must not be faked with duplicate prose under different level labels.

### Content production waves

Each wave ends with learner testing, technical review, English/German review, and an
example/lesson validation gate. Target counts describe distinct learning experiences,
not translations or language variants counted as extra lessons.

1. **Electricity you can see (12 lessons):** closed paths, polarity, resistance,
   Ohm's law, series/parallel, voltage dividers, buttons, capacitors, inductors,
   diodes, transistor switching, and safe motor/flyback circuits. Provide discover
   and foundation tracks with concrete prediction and observation.
   **Implementation status:** all twelve bilingual lesson sequences are shipped in
   the catalog and validated against real examples; technical and learner field
   review remains before the wave is considered editorially final.
2. **Measure rather than guess (10 lessons):** continuity, voltage, current and
   burden voltage, resistance, multimeter range/error, function generator, scope
   probes, vertical scale, sweep/timebase, triggering, cursors, and RC measurement.
   **Implementation status:** all ten bilingual sequences are in the catalog. The
   scope now supplies the controls they teach—manual vertical scale and position,
   edge/level trigger with explicit wait state, and sample-derived time cursors.
   Technical and learner field review remains before editorial finalization.
3. **One idea, several languages (12 semantic tasks):** sequence, events, loops,
   conditions, variables, procedures, concurrency, state machines, arrays/data,
   messages, pins/peripherals, and protocols. Blocks and Brickwright Code lead;
   Python/JavaScript/C variants explain runtime and conversion differences. BASIC
   and ASM enter where their machine model makes the concept clearer.
   **Implementation status:** all twelve bilingual engineering drafts are in the
   catalog. They compare semantic and runtime contracts rather than surface syntax,
   cover Blocks, Brickwright Code, Python, JavaScript, C, and targeted ASM, and use
   shipped projects to test boundaries, timing, state, data, hardware mapping, and
   interface waveforms. Technical, translation, and learner field review remains.
4. **Interactive systems (8 lessons):** extension discovery, sensor capability,
   LEGO connection/deployment/recovery, buttons/sliders/joysticks, displays/gauges,
   two-way binding, dashboards, calibration, sampling, and control-loop safety.
   **Implementation status:** all eight bilingual engineering drafts are in the
   catalog. They cover capability and failure-state contracts, optional LEGO hardware,
   discrete and continuous controls, honest displays, directed bindings, operational
   dashboard design, calibration, sampling delay, clamping, and fail-safe behavior.
   Hardware, accessibility, translation, and learner field review remains.
5. **Debug with evidence (10 lessons):** reproduce/minimize, pause/step, watches,
   conditional breakpoints, call stack, task scheduling, pins/signals, serial trace,
   timing bugs, and comparing simulation with hardware. Every lesson starts with a
   question the debugger can answer.
   **Implementation status:** all ten bilingual engineering drafts are in the catalog.
   Each starts with an explicit question and collects evidence from the smallest useful
   combination of debugger state, watches, task/call state, pin and serial traces,
   circuit instruments, timestamps, or optional hardware. Target-specific capability,
   translation, and learner field review remains.
6. **Signals and systems (10 lessons):** RC/RL response, impedance, complex models,
   cutoff and phase, Bode sweeps, resonance, loading, noise, aliasing, FFT limits,
   uncertainty, and model-versus-measurement analysis.
   **Implementation status:** all ten bilingual engineering drafts are in the catalog.
   They progress from time-domain RC/RL measurements through complex response, Bode
   sweeps, resonance, loading and noise to sampling/FFT limitations and a reproducible
   competing-model study. Every lesson predicts first and qualifies measurements with
   uncertainty, assumptions, residuals, error, or explicit limits. Technical,
   translation, numerical-method, and learner field review remains.
7. **Computers from wires upward (10 lessons):** logic levels, gates/registers,
   clocks, buses, memory maps, address decoding, 6502/Z80 execution, ASM/source
   correspondence, contention, interrupts, and performance/timing tradeoffs.
   **Implementation status:** all ten bilingual engineering drafts are in the catalog.
   They connect logical meaning to measured voltages, clocked storage and transactions,
   derive memory/decode behavior, cross-check instruction and bus traces, label lossy
   source/ASM boundaries honestly, and finish with safe contention diagnosis and
   measured interrupt tradeoffs. Architecture, electrical, translation, and learner
   field review remains.

Lesson quality rubric:

- The objective names an observable capability, not “understand” or “learn about.”
- Every lesson contains prediction, action, observation, and explanation; advanced
  lessons also require uncertainty, assumptions, or competing models.
- Safety-relevant physical steps state limits and a simulation alternative.
- Every code variant is executed or round-trip tested where supported, and labels
  generated/read-only representations honestly.
- Automatic checks cannot reward an unrelated state; uncertain checks remain manual.
- Hints reveal strategy progressively without giving away the conclusion immediately.
- A nine-year-old track avoids unexplained notation; a research track does not dilute
  rigor merely to share the same example asset.

Acceptance criteria:

- At least one lesson exists for each starter journey.
- Checkpoints can observe circuit state, program/runtime state, and connection state.
- Progress persists locally per lesson version and can be reset.
- Every checkpoint has a manual fallback when automatic detection is unavailable.
- Lesson content and referenced files are validated as part of the examples gate.

## Milestone 3 — Clear product identity and language

Status: **in progress — product copy and bilingual store metadata complete**

Apply one accurate product story everywhere: in-app welcome and About surfaces,
README, App Store/TestFlight metadata, website copy, screenshots, empty states, and
release notes. Explain the relationship to Scratch components precisely without
describing Brickwright Lite as a TurboWarp fork.

Acceptance criteria:

- The first screen explains the app in one sentence and demonstrates all three core
  outcomes visually.
- No active user-facing copy contains the incorrect fork claim.
- App Store screenshots and captions show circuits, code/blocks, debugging, and LEGO.
- English and German core product strings receive the same review.

## Milestone 4 — Trustworthy representation switching

Status: **in progress — representation capability contract visible**

Make the relationship among Blocks, Brickwright Code, Python, and JavaScript visible
and honest. Show the corresponding construct when switching, distinguish editable
source from generated previews, and surface unsupported or lossy constructs before
conversion.

Acceptance criteria:

- Selection/cursor correspondence works for the supported common subset.
- Conversion reports unsupported, changed, and preserved constructs.
- No tab implies round-trip editing if it cannot preserve semantics.
- A round-trip corpus covers starter projects, devices, control flow, variables,
  procedures, events, pins, and supported part bindings.

## Milestone 5 — One run and debug model

Status: planned

Unify run, stop, pause, step, speed, breakpoints, watches, pin activity, circuit time,
and hardware state into one coherent model. Complete the compact debugger strip
already tracked in `ROADMAP.md`, then use it consistently across workspaces.

Acceptance criteria:

- One obvious run/stop control governs the active simulated or connected target.
- Source, variables, pins, signals, and circuit time agree at every paused step.
- The UI states why stepping is unavailable or why execution stopped.
- A deterministic integration suite covers pause/resume, x10 stepping, reset,
  device changes, and movement of the debugger between docks.

## Milestone 6 — Faster circuit construction

Status: planned

Reduce friction in the circuit editor: searchable parts, recently used parts,
keyboard placement, alignment/distribution, clearer wire routing, net highlighting,
pin compatibility hints, and fixes for the outstanding layout issues in `ROADMAP.md`.

Acceptance criteria:

- A keyboard-and-mouse user can assemble and run a basic LED circuit in two minutes.
- Invalid power, shorts, open nets, and incompatible pins are explained at the
  component and net involved, with a suggested correction.
- Undo/redo covers every construction action and survives switching panels.
- Representative small, dense, and retro-computer circuits pass visual regression.

## Milestone 7 — Hardware that explains itself

Status: planned

Replace the generic Bluetooth journey with explicit device state: not supported,
permission needed, scanning, found, connecting, connected, incompatible firmware,
busy, disconnected, and simulation fallback. Include capability discovery and a
non-destructive diagnostic export.

Acceptance criteria:

- Supported LEGO families and limitations are visible before scanning.
- Every failure state has a next action and preserves the project.
- Reconnect is predictable after sleep, range loss, and app restart.
- A hardware test matrix covers current supported hubs on current macOS releases.
- Simulation remains usable when hardware is absent or disconnects.

## Milestone 8 — Task-oriented workspaces

Status: planned

Turn the existing flexible pane system into named presets—Learn, Blocks, Code,
Circuit, Debug, and Controller—while keeping custom layouts. Each preset prioritizes
the active task and reduces chrome without hiding state.

Acceptance criteria:

- Presets switch without remounting or losing editor/runtime state.
- Window sizes from compact laptop to large desktop remain usable.
- Pane choices persist per project where appropriate and have a global default.
- Full-screen modes always expose one consistent exit and restore the prior layout.

## Milestone 9 — Project integrity and recovery

Status: planned

Define and enforce a versioned Brickwright project contract containing all authored
representations, circuit/controller data, device choice, assets, and migration
metadata. Add autosave, crash recovery, recent projects, and a readable compatibility
report for old or newer files.

Acceptance criteria:

- Save/reopen round trips every part of each starter and regression project.
- Forced termination loses at most the documented autosave interval.
- Import never silently drops unknown data; export is atomic.
- Migrations are fixture-tested and preserve the original until success.

## Milestone 10 — Release-quality feedback and polish

Status: planned

Add an in-app feedback path that can attach an explicitly reviewed diagnostic bundle,
then close accessibility, localization, performance, packaging, privacy, and store
presentation gaps. Use staged TestFlight cohorts before each production submission.

Acceptance criteria:

- Feedback never includes project source, identifiers, or hardware details without
  a preview and explicit consent.
- Core workflows pass keyboard, screen-reader, contrast, and reduced-motion checks.
- Cold launch, example load, tab switch, and simulation targets have regression
  budgets measured on a baseline Mac.
- Release automation validates version/build numbers, signing, notarization,
  metadata, screenshots, privacy text, and rollback notes.
- External TestFlight feedback is triaged against the milestone success measures.

## Milestone 11 — Measurement depth and interchange

Status: scoped (2026-08-23) — the work items live upstream and land here by vendoring.

Deepen the circuit engine to measurement-grade and open the format surface both ways.
Fully-scoped items: `../../bw-board/ROADMAP.md` (E0–E4: correctness fixes, sparse
solver with factorization reuse, adaptive transient, exponential junctions, true
small-signal AC, model depth, scheduled digital events — mna.js items gated on the
spec-updates filed there) and `../../bw-circuit-ui/ROADMAP.md` (X0–X2: export-path
defect fixes, document export, SPICE-netlist import, breadboard-format and
applet-text interchange, LaTeX schematic export, FFT / tolerance / parameter-stepping
instruments in workers). Lite-side integration items: `ROADMAP.md` §3.5.

Acceptance criteria:

- An exported SPICE deck from any starter circuit runs unmodified in the CI oracle
  simulator and matches the in-app operating point within stated model tolerance.
- The frequency-response view is computed by small-signal analysis and agrees with
  the time-domain measurement on linear fixtures — shown side by side as a lesson.
- A student can save a schematic as SVG/PNG and a scope trace as CSV for a lab
  report without leaving the app.
- A published breadboard-format or applet-text file imports with zero silent drops
  (every unmapped part is named), and our own exports round-trip through our own
  importers with identical net partitions.
- No copyleft code enters the shipped dependency graph; the licence tripwire fails
  the build if it does. Solver upgrades keep the full oracle suite green.

## Release sequence

- **Continuous — Milestone 0.** Not a release band. It gates every other band: a release does not
  ship while a Milestone 0 acceptance criterion is failing, and no content wave starts while its
  predecessor's review debt is open.
- **0.1.x — Find the product:** Milestones 1–3.
- **0.2.x — Trust the model:** Milestones 4–5.
- **0.3.x — Build fluently:** Milestones 6–8.
- **0.4.x — Keep and share work:** Milestones 9–10.
- **0.5.x — Measure and exchange:** Milestone 11 (upstream engine/format campaign;
  individual items may ship earlier when their vendored landings are green).

Version numbers are targets, not promises; readiness gates control shipping. Critical
data-loss, conversion, hardware-safety, accessibility-blocking, or signing defects
stop a release. Cosmetic work does not displace a broken starter journey.

Large local builds also have an operational readiness gate: `npm run build:gui`
checks one-minute load normalized by logical CPU count and exits before webpack when
the system is already saturated. `BW_MAX_LOAD_PER_CPU` can tune the threshold;
`build:gui:force` is reserved for an intentional operator override.

## Current execution log

- [x] Corrected TestFlight/App Store descriptions and release notes for 0.1.4.
- [x] Updated sibling repository inputs and shipped 0.1.4 to external TestFlight.
- [x] Defined this ordered implementation and release plan.
- [x] Implemented Milestone 1: bilingual first-run chooser, three canonical starter
  paths, persistent dismissal, Settings reopen action, local-only event history,
  accessible keyboard behavior, responsive layout, and visible transactional errors.
- [x] Verified Milestone 1 with the production webpack build, the complete repository
  test suite, starter-data validation, and Playwright at desktop and compact sizes.
- [x] Implemented the Milestone 2 vertical slice: versioned bilingual JSON schema,
  nine-lesson cross-domain catalog, prerequisite graph, selectable language concept
  lenses, language/depth/environment metadata, live sidecar runner, local resume/reset,
  hints, observable checkpoints,
  and manual fallbacks.
- [x] Verified the lesson slice with schema/breadth tests, full repository tests,
  production webpack build, component lint, and browser workflows for the library,
  automatic completion, manual persistence, and all starter-to-lesson transitions.
- [x] Produce the full 79-lesson bilingual engineering draft across all seven content
  waves above; editorial finalization remains gated by each wave's explicit reviews.
- [x] Implemented the Wave 1 engineering/content draft: twelve distinct electricity
  lessons, real example mappings, explicit prediction and observation, progressive
  prerequisites, hardware safety boundaries, and searchable level-filtered discovery.
- [ ] Complete Wave 1 technical, translation, and learner field review, then revise
  lesson versions from the evidence gathered.
- [x] Applied the first Wave 1 technical-review revisions. The diode lesson had
  requested alternating input/output traces from a static polarity example; it now
  opens the reversible four-diode bridge and teaches its conducting paths and
  two-forward-drop cost. The capacitor lesson had requested discharge observations
  from a charge-only bench; it now opens the two-switch stored-energy experiment and
  explains its non-ideal LED-threshold tail. Both advance to content version 2 and
  have curriculum/example contract tests. Corrected linked copy that made the same
  nonexistent-waveform claim. Translation and learner field review remain.
- [x] Implemented the Wave 2 engineering/content draft and the previously missing
  oscilloscope controls: V/div, vertical center, rising/falling trigger, trigger
  level/status, dual time cursors, and measured Δt.
- [ ] Complete Wave 2 instrument verification, translation review, and learner field
  testing, then revise controls and lesson versions from observed use.
- [x] Rewrote the canonical English and German App Store/TestFlight descriptions
  for 0.1.5 around circuits, honest representation boundaries, guided lessons,
  evidence-based debugging, native/offline use, and supported LEGO hardware.
- [x] Shipped the signed native macOS 0.1.5 build to the public external TestFlight
  group with bilingual testing notes. App Store Connect build
  `6ab579dc-f98b-4a7c-9927-f3fd21b1e239` is valid and its Beta App Review
  submission is `WAITING_FOR_REVIEW` (2026-08-21).
- [x] Started Wave 3 with four bilingual, cross-representation lessons covering
  sequence, events, boundary conditions, and state machines against shipped projects.
- [x] Completed the Wave 3 engineering/content draft with twelve distinct semantic
  tasks, including loops, variables, procedures, concurrency, arrays/data, messages,
  pins/peripherals, protocols, and targeted ASM-level timing.
- [ ] Complete Wave 3 runtime/round-trip verification, translation review, and learner
  field testing, then revise content versions from the evidence gathered.
- [x] Implemented the Wave 4 engineering/content draft with eight bilingual lessons
  for extensions, sensors, LEGO recovery, controls, displays, bindings, dashboards,
  calibration, sampling, and control-loop safety.
- [ ] Complete Wave 4 hardware/recovery verification, accessibility and translation
  review, and learner field testing, then revise content versions from the evidence.
- [x] Implemented the Wave 5 engineering/content draft with ten bilingual,
  question-led debugging lessons spanning reproduction through aligned
  simulation-versus-hardware diagnosis.
- [ ] Complete Wave 5 target-capability verification, translation review, and learner
  field testing, then revise content versions from the evidence gathered.
- [x] Implemented the Wave 6 engineering/content draft with ten bilingual signals-and-
  systems investigations from first-order response through research-level model
  comparison and sampling limitations.
- [ ] Complete Wave 6 numerical/instrument verification, translation review, and
  learner field testing, then revise content versions from the evidence gathered.
- [x] Implemented the Wave 7 engineering/content draft with ten bilingual lessons
  connecting logic levels, buses, memory, execution, ASM, contention, interrupts,
  and timing to live electrical and debugger evidence.
- [ ] Complete Wave 7 architecture/electrical verification, translation review, and
  learner field testing, then revise content versions from the evidence gathered.
- [x] Started Milestone 4 with an always-visible bilingual capability contract for
  every Code tab: supported-subset editable conversion, generated read-only
  micro:bit/ASM views, and one-way editable ASM are labeled before conversion.
- [x] Added a persistent bilingual conversion report after Code ↔ Blocks operations,
  separating preserved project loading, reported semantic changes, unsupported
  constructs, and complete conversion failure.
- [x] Began the 2026-08-21 regression repair pass: moved guided lessons away from
  the right-pane run controls, restored debugger dock affordances for declared MCU
  programs, made Circuit SIM start authored MCU code, separated the embedded circuit
  toolbar from the green-flag row, repaired light-theme status contrast, and taught
  the voltage-on-wires control in the voltage lesson.
- [x] Added `npm run render:schematic -- --example ID [--format svg|png|both]`
  so the gallery's actual schematic projection can be inspected without manually
  navigating the app; it also writes a machine-readable render report.
- [x] Finished the regression pass with browser proof that the debugger keeps running
  while hidden and across view/dock changes, Blocks + Circuit + Debugger coexist,
  green flag and SIM both start MCU code, schematic fit/pan/zoom work at contrasting
  pane aspect ratios, example titles replace the generic project title, and no
  ResizeObserver error reaches the user.
- [x] Rendered all 246 circuit examples through the new CLI, fixed its omitted-wire
  and false VCC/GND-short defects, bounded pathological single-column layouts
  (worst height reduced from 3,356 to under 1,000 units), and reviewed simple,
  analog, 8-bit-bank, and retro-machine output.
- [x] Re-audited every schematic as a PNG contact-sheet corpus instead of relying
  on spot checks. Dense MCU/retro examples now use conventional repeated net labels
  rather than overlapping full-height trunks; tall packages are placed using their
  connected-pin height and wrapped into columns capped near one viewport. Across
  all 246 examples the largest projection is now 1,290 × 910 units.
- [x] Made the schematic CLI load sidecars and pass each example through the same
  legacy-wire normalization and breadboard strip/jumper resolution as the live
  Circuit Designer. Its PNG/SVG output is now an electrical audit, not merely a
  renderer test that can silently omit board-hole connections.
- [x] Corrected the scope of that audit after a Pico motor example exposed the
  missing dimension: the earlier 246-file pass covered only each example's default
  circuit and checked size/overlap, not whether a wire crossed a foreign symbol or
  whether a terminal met the artwork it named.
- [x] Extended the CLI with `--circuit FILE`, `--all-variants`, and `--check` and
  audited all 1,034 `circuit*.json` files. The report now records direct wires,
  labelled collision fallbacks, wire/symbol crossings, and symbol overlaps; the
  corpus gate fails if either mechanical legibility invariant is non-zero.
- [x] Added terminal-aware anchors for NPN/PNP base, collector, and emitter;
  NMOS/PMOS gate, drain, and source; and potentiometer ends and top wiper. Routes
  that would cross any symbol body now use conventional repeated net labels. The
  1,034-variant gate reports zero remaining wire/symbol crossings and zero symbol
  overlaps, including `10-motor-speed/circuit.pico.json` from the reported defect.
- [x] Added reviewed, byte-stable SVG baselines for representative simple, dense,
  analog, and retro-machine examples, with a test that requires explicit visual
  review before accepting layout drift. Added obstacle-avoiding Manhattan detours
  for two-pin teaching nets: after the corpus repair, 2,126 nets are drawn through
  explicit detours and only 1,379 require collision-label fallback; corpus labels
  fell from 14,842 to 10,269 while all 1,034 variants retain zero wire/symbol
  crossings and zero symbol overlaps. Pin-labelled rectangles for
  MCUs, memories, logic ICs, and modules remain conventional schematic symbols;
  only replace a box where standardized non-box artwork communicates more truth.
- [x] Closed the regression tranche at deployed checkpoint `5e044cf03`: all unit,
  circuit UX, 1,034-variant rendering/placement, view-button, editor, debugger
  dock/serial, Pages deployment, and deployed-GUI gates are green. Right-docking
  now opens the optional pane without remounting or stopping the running target.
- [x] Shipped 0.1.6 to the existing external TestFlight group on 2026-08-21.
  Signed macOS build `38909d58-f93a-4446-abda-06b8ed74454f` is `VALID`, has
  export compliance declared, carries bilingual testing notes covering schematic
  legibility, the voltage overlay, three-pane lessons, dock-preserved execution,
  green-flag/SIM start, and the retro-machine serial workflow, and is
  `WAITING_FOR_REVIEW` in the public group.
