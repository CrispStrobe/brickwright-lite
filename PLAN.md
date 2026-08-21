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

## Release sequence

- **0.1.x — Find the product:** Milestones 1–3.
- **0.2.x — Trust the model:** Milestones 4–5.
- **0.3.x — Build fluently:** Milestones 6–8.
- **0.4.x — Keep and share work:** Milestones 9–10.

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
- [ ] Add reviewed visual baselines for representative simple, dense, analog, and
  retro-machine examples. Pin-labelled rectangles for MCUs, memories, logic ICs,
  and modules are conventional schematic symbols, not missing pictorial artwork;
  only replace a box where a standardized non-box symbol communicates more truth.
