# Code-to-circuit inspection — step 1 (the Blink LED) — HANDOFF

**Status:** NOT IMPLEMENTED. Scoped and ready to start.
**Lane:** `lane/code-to-circuit-inspect` (claim on `main` as `5af0f7c47`).
**Worktree:** `/Users/christianstrobele/code/lego/wt-bw-inspect`.
**Base:** `61118ce7a`.
**Claimed by:** Hermes TUI / Christian, 2026-09-18.
**Why this file exists:** the implementing session died on a provider error
(`HTTP 404 … Unbiased's Pareto` — the model was retired mid-run) after doing
reconnaissance only. Zero feature code was written. The tree is clean at the
claim commit. This document is that session's reconnaissance, so the next agent
does not pay for it again.

Constraint carried from the owner: **feature changes stay UNMERGED for review.**
Publish work on the lane branch; do not merge to `main`.

---

## 1. The user-visible goal (step 1 only)

Selecting a thing on one surface reveals the corresponding thing on the other:

- a **source line / block** that drives a pin → the **part(s) on that pin** are
  selected/highlighted on the circuit board;
- selecting a **part** on the board → the **source that controls it** is revealed.

Scope this to **one LED driven by one pin** (the `Program a board` / Blink
starter), verified end to end. Everything else is deliberately deferred (§6).
Where the mapping cannot be established, the UI must say so honestly rather than
highlight nothing or highlight the wrong part.

---

## 2. Verified seams (measured, with locations)

Facts below were read out of the tree at the base commit. Re-verify before
editing, but do not re-derive from scratch.

### 2.1 The selection plumbing ALREADY exists

`node_modules/bw-circuit-ui/src/components/CircuitDesigner.jsx`:

- `:225` — `const [selectedParts, setSelectedParts] = useState(new Set());`
- `:230` — `const selectedPart = selectedParts.size === 1 ? [...selectedParts][0] : null;`
- `:232` — `handleSelectPart(id, additive)` sets the set; `additive` toggles
  (shift-click), a falsy `id` clears, and it also clears `selectedWire`.
- `:1457` / `:1459` — passed down as `onSelectPart={handleSelectPart}` and
  `selectedParts={selectedParts}`.
- `BoardCanvas.jsx:312` — `SvgParts({parts, selectedParts, onSelectPart, …})`;
  `:318` `const isSelected = selectedParts?.has(id)`; `:319` a selected part is
  stroked `#f1c40f` at `strokeWidth 3`. This is the visible highlight.

**Consequence:** no new rendering code is needed to highlight a part. The
missing piece is driving `selectedParts` from debug/selection state.

### 2.2 Lite already enriches the task list with block ids

`overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (~`:1566`)
maps the runner's task list to include `blockId`, a resolved human `label`, and
`kind`:

```js
const enriched = tasks && tasks.map(t => {
    const blockId = ui && ui.blockOfTask ? ui.blockOfTask[`${t.task}/${t.state}`] : undefined;
    return {...t, blockId, label: blockId ? this.labelForBlock(blockId) : undefined,
        kind: blockId && kinds ? kinds[blockId] : undefined};
});
```

So the block id for the currently-executing task is **already available**. The
comment above it records the trap to avoid: the designer previously received
`undefined` for `tasks`/`capabilities` and its highlight silently rendered
nothing — do not reintroduce that by adding another field the designer does not
actually read.

### 2.3 The designer does NOT yet consume `tasks`

`grep -n "tasks\|blockId"` over `CircuitDesigner.jsx` returns **no hits**.
`:18` documents only `debugState?: {halted: boolean, skewNs?: bigint}`. The
designer currently reads `halted`, `skewNs`, `audio()`, `video()`,
`capabilities`, `step`, `addWatchpoint`.

**Consequence:** the seam to build is a new, explicit input (a selection/inspect
descriptor) from Lite into the designer — not a new field smuggled onto
`debugState`.

### 2.4 No pin→part helper exists anywhere in bw-circuit-ui

`grep -rn "pinPart\|partForPin\|pinsForPart\|terminalPin" node_modules/bw-circuit-ui/src`
returns nothing. There is an existing "active-part highlight" mentioned in a
`circuit-tab.jsx` comment (`:1552-1558`) but no reusable mapping function.

**Consequence:** the pin↔part mapping is Lite-owned glue. That is consistent
with the claim's declared scope (`overlay/scratch-gui/src/...` plus a focused
`lib/bw-debug` helper). **Do not add it to bw-circuit-ui and do not move a
package pin.**

### 2.5 The block highlight already exists, in the other direction

`overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx` (`:47`)
notes the glow lands in the Blocks tab via `vm.runtime.glowBlock`, and that it
does not care which tab is open. Use the same mechanism for part→source reveal
rather than inventing a second highlight.

---

## 3. Environment — read this before running anything

- **Node:** `v26.4.0` locally. Root deps installed in this worktree.
- **`npm ci` MUST pass `--include=dev`.** The machine has global
  `omit=dev`, so a plain `npm ci` prunes devDependencies and
  `npm run check:setup` then fails with *"Missing root jszip@3.10.1"*.
  Working command:
  `npm ci --include=dev --ignore-scripts --no-audit --no-fund` (~6 min — git
  deps are fetched over ssh).
- **`npm run check:setup`** must print
  `Test prerequisites ready: Node 26.4.0, root jszip.` before any test run.
- **The GUI build tree is NOT prepared** in this worktree (no
  `packages/scratch-gui/build`). Browser proofs (`scripts/verify-*.mjs`) will
  refuse. Preparing it means `vendor` → `integrate` → GUI dependency install →
  VM/paint/render overlays → build, per `README.md`. Budget for it or stay on
  source tests.
- **Tests:** `node --test --import ./scripts/lib/register-gui-scope.mjs test/<file>.test.mjs`.
  A single file is fine and is the fast loop; `npm run test:source` is the
  bounded source-only suite.
- **Test style in this repo:** most gates are **source-contract assertions** —
  `readFileSync` a file and `assert.match` a distinctive string or regex. See
  `test/circuit-designer-ux-contract.test.mjs`, which already reads BOTH
  `node_modules/bw-circuit-ui/src/components/CircuitDesigner.jsx` and
  `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx`. Follow
  that shape; it needs no build.

---

## 4. Task 1 — the bounded slice, TDD

Each step is one action. Watch the test fail before writing the code.

**Task 1.1 — the mapping helper (pure, testable in node).**

- Create `overlay/scratch-gui/src/lib/bw-debug/code-circuit-map.js`, exporting a
  pure function that, given (a) a pin declaration set (`stc.pins`-shaped) and
  (b) a resolved block/verb for a task, returns the part ids on that pin — or an
  explicit "unmapped" result carrying the reason.
- Test first: `test/code-circuit-map.test.mjs`.
  - `RED` — run it; fails on the missing module.
  - Assert: a declared output pin driving an LED returns that LED's part id.
  - Assert: an undeclared pin returns unmapped **with a reason**, not an empty
    list — an empty list is how "we could not tell" turns into "there is
    nothing", which is the exact failure `circuit-tab.jsx:1552-1558` records.
  - Assert the honest-failure direction: a task whose verb touches no pin
    (a `wait`, a variable write) returns *not applicable*, distinguishable from
    *could not resolve*.
  - `GREEN` — minimal implementation. Run the file; then run the suite.

**Task 1.2 — feed the current task from Lite into the designer.**

- Modify `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` to
  pass an inspect descriptor derived from the already-enriched `tasks` (2.2)
  down to `CircuitDesigner`, and mirror the change into the tracked
  `packages/scratch-gui/src/...` copy **via `node scripts/integrate.mjs`**, not
  by hand — the overlay/mirror equality test checks committed copies.
- Test: extend the source-contract style — assert the host passes the descriptor
  and that the designer's prop list declares it. Both sides, one file, so a
  rename cannot pass.

**Task 1.3 — drive `selectedParts` from the descriptor.**

- In `CircuitDesigner.jsx` … **STOP.** This file is inside
  `node_modules/bw-circuit-ui`, an upstream package installed from an exact SHA.
  Editing it is a **fork**, and `docs/VENDORING-REGIME.md` requires shared
  behaviour to land upstream first and reach Lite through a pin move.
- So: either (a) land the designer-side change upstream in `bw-circuit-ui` as
  its own lane and take it as a pin move, or (b) keep the whole feature
  Lite-side by bypassing the designer — e.g. Lite owns a thin overlay that sets
  the selection through the designer's existing public surface.
- **Decide this before writing Task 1.1**, because it decides the helper's
  interface. Option (b) is the smaller first slice and needs no upstream lane;
  option (a) is the correct long-term home. Do not do both.

**Task 1.4 — the reverse direction (part → source).**

- On part selection, resolve the controlling block and call the existing
  `vm.runtime.glowBlock` path (2.5). Test the resolution, not the glow.

**Task 1.5 — cleanup and honesty.**

- Selecting nothing, changing tabs, switching projects, and unmounting must
  clear the highlight. Test that a project change clears it — a stale highlight
  next to a different circuit is worse than none.
- Localize any new user-facing string in **English and German** (the repo ships
  both; `debug-panel.jsx` and `circuit-tab.jsx` both carry `L10N`-style maps).

**Task 1.6 — the browser proof, when a build exists.**

- `scripts/verify-*.mjs` is the pattern (`scripts/verify-debug-run-to-inspection.mjs`
  is the closest one — it is CI-only unless `BW_ALLOW_LOCAL_BROWSER_PROOF=1`).
- **A source-text gate is NOT sufficient for a layout/highlight change.** The
  LANES entry for the FPGA surface records that a scroll fix passed its gate and
  did not fix the browser. If you cannot build, say the browser proof is
  *unrun*, not *passing*.

---

## 5. Definition of done for step 1

- One LED/pin↔source inspection path works, verified by a real run.
- The unmapped cases produce a **named** honest state, tested.
- Highlight clears on project change and unmount, tested.
- Both mirrors (`overlay/` and `packages/scratch-gui/`) agree after
  `integrate.mjs`.
- New strings exist in English and German.
- No upstream package edited; no pin moved; nothing merged to `main`.
- The plan file and the `LANES.md` row updated with what actually happened —
  including what remains unverified.

---

## 6. The remaining five ideas — scoped, NOT started

Ordered as proposed; each wants its own lane and its own claim.

1. **Project preflight.** Before running or flashing, state what will execute,
   what is unsupported, and whether a compiler download or a connected device is
   needed. Build on `overlay/scratch-gui/src/lib/bw-matrix/capabilities.js`
   (the language×device matrix) rather than a second source of truth.
   *Acceptance:* an unsupported route names its blocker **before** compilation
   starts.
2. **Guided fault-finding lessons.** Deliberately broken circuits (missing
   ground, reversed LED, floating input, wrong pin) diagnosed with instruments,
   extending the existing prediction/observation lesson waves in
   `overlay/scratch-gui/src/components/gui/lesson-waves/`.
3. **Experiment comparison.** Save a baseline reading, change one value, compare.
   Start with saved measurement comparison, not universal emulator rewind.
4. **Classroom handoff bundle.** Project + lesson position + required extensions
   + offline-readiness report in one artifact, no account.
5. **Real-hardware journey qualification.** For a small set of board/LEGO
   combinations, prove connect → run → disconnect → reconnect → save/reopen on
   real devices, and show which combinations were actually hardware-tested.

Keep full Technic simulation, additional CPU families, and broad language
expansion out of scope until the above are convincing — `PLAN.md` already
records those as longer-term.

---

## 7. Closing note on the failed attempt

The implementing subagent completed reconnaissance, produced the locations in §2,
and was killed by its model being retired server-side. It wrote no code. Nothing
in this document is a claim that the feature exists — §2 is what was **read**,
and every "the designer does not do X" above is an absence established by grep
at `61118ce7a`, which is the direction that decays: re-check before relying on it.
