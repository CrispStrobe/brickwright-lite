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

Status: **in progress**

Extend selected examples with a small, versioned lesson schema: objective,
prerequisites, ordered checkpoints, hints, success conditions, and optional hardware
steps. Render one instruction at a time alongside the live editor; never replace the
editor with documentation.

Acceptance criteria:

- At least one lesson exists for each starter journey.
- Checkpoints can observe circuit state, program/runtime state, and connection state.
- Progress persists locally per lesson version and can be reset.
- Every checkpoint has a manual fallback when automatic detection is unavailable.
- Lesson content and referenced files are validated as part of the examples gate.

## Milestone 3 — Clear product identity and language

Status: planned

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

Status: planned

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

## Current execution log

- [x] Corrected TestFlight/App Store descriptions and release notes for 0.1.4.
- [x] Updated sibling repository inputs and shipped 0.1.4 to external TestFlight.
- [x] Defined this ordered implementation and release plan.
- [x] Implemented Milestone 1: bilingual first-run chooser, three canonical starter
  paths, persistent dismissal, Settings reopen action, local-only event history,
  accessible keyboard behavior, responsive layout, and visible transactional errors.
- [x] Verified Milestone 1 with the production webpack build, the complete repository
  test suite, starter-data validation, and Playwright at desktop and compact sizes.
- [ ] Implement and verify Milestone 2.
