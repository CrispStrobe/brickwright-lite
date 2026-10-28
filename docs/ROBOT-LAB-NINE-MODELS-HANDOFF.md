# Nine Technic models: checkpoint and continuation

This is a user-requested source checkpoint, not completed model admission or a
release. All nine repaired models, programs, BSD-3-Clause/CrispStrobe notices,
EN/DE lessons, source fixtures and test harnesses are committed. They remain
**experimental**, accessible through **Examples → Include experimental** and
the model selector. No model in this intake has earned a “Simulation checked”
label yet. Do not mistake an enabled example for a qualified one.

Read this file first for continuation. Machine-specific locations, running
services and private evidence are recorded only in the gitignored `CLAUDE.md`.
Use a new isolated checkout and preserve other owners' worktrees and claims.

## Models and repairs

| Example ID | Explicit placements | Main repair or mechanism |
|---|---:|---|
| `helixgate` | 20 | Worm reduction, passive 24:1 output |
| `looprelay` | 54 | Compound chain transmission, passive −2/9 output |
| `paritydial` | 31 | Opposite dial phases, −1/3 and +1/3 ratios |
| `counterslide` | 44 | Fully seated drive axle and opposed racks |
| `toggle-press` | 142 | Retained shafts, tower clearance, sufficient guide travel |
| `footfall` | 120 | Motor phasing, fixed pivot bearing, physically connected frame |
| `phasekeeper` | 81 | Retained and correctly phased double Cardan transmission |
| `vectorsum` | 122 | Differential geometry, connected frame, shaft-tip clearance |
| `pointweaver` | 128 | Keyed input arms, corrected target signs, bounded precision controls |

Phasekeeper also requires two inferred real Cardan crosses: **83 physical
pieces**, rather than 81 placements. Counts are deliberately not padded to meet
the generic builder's >50-piece requirement. The two CounterSlide archives have
identical model/program inputs and represent one model.

Assets are under `overlay/scratch-gui/static/sim-lab/{models,programs,lessons,licenses}`.
Registry/details are in `model/experimental-models.js` beneath the simulator
source directory. Original supplied bytes and hashes remain under
`test/fixtures/model-files/nine-technic-source/`. Per-model provenance and
qualification state are in [the intake record](data/robot-lab-nine-intakes-20261026.json).

## Implemented harness and physics corrections

- `scripts/check-robot-lab-intake.mjs` checks actual retained/keyed drive paths,
  fixed housings, overlaps and recorded completion. `--drive=PORT:PART` and
  `--fixed=PORT,...` declare separate expectations; a deliberately moving motor
  housing must not be silently treated as fixed. This preflight is not a
  passive-motion qualification.
- `scripts/lib/sim-lab-nine-intake-judge.mjs` contains independently reviewed
  passive laws, world-space foundation checks, closure and terminal hold.
- `test/bw-sim-nine-intake-motion.test.mjs` runs the actual VM/native simulator
  at two cadences, removes essential real transmission parts, and rejects frozen
  passive outputs and translated foundations. Raw records include model,
  program and catalogue hashes and are saved before judgement.
- `test/bw-sim-nine-intake-assets.test.mjs` checks original hashes, equivalent
  MPDs, connected individual build additions, counts, programs and both lessons.
- The compiler's loose-part analysis now recognizes real Cardan retention;
  no new physical constraint is introduced. Its independent regression test is
  `test/bw-sim-universal-connectivity.test.mjs`.
- The ordinary 3L shaft `4519.dat` now has a cylindrical collision envelope with
  measured radius 6 LDU, retaining its original nominal half-length 30 LDU,
  connectors and mass. The original rotating square reached 8.485 LDU and
  displaced CounterSlide. Mesh, actual floor/obstruction contact and restoration
  of the old square are tested in `test/bw-sim-stock-axle-envelope.test.mjs`.
  A trial shortening the half-length to 29.5 LDU regressed Pivot Rover; that
  trial was corrected. Keep the existing Pivot Rover VM steering test.
- Complete browser journeys are wired into the normal entry point, one model
  per eight-minute CI step across `robotaddon10`, `robotaddon11`, `robotaddon12`.
  Job limits remain thirty minutes. The original three-model grouped step hit
  its wall limit; its partial results are preserved, not counted as a pass.

## Evidence and boundaries

All nine have passed both native cadences and actual-part removal controls on
the refined nominal-length catalogue. Earlier focused runs also passed mesh,
collision, catalogue, canonical-frame, Cardan, lesson and CI partition checks.
Current main's separately owned floor-contact changes have now been composed;
the focused checkpoint rerun passed all mechanical checks. Its only failure
was an overly strict search-result-count assertion, subsequently corrected and
rerun separately. Production-browser admission of this changed composition
still remains pending. Exact local receipts are in the private handoff.

Preliminary Chromium evidence completed the entire PointWeaver journey,
including both lessons and fresh-context full SB3 replay. A later production
candidate completed HelixGate and LoopRelay including both lessons, and
ParityDial through full saved-program replay before the grouped deadline cut
off its lesson checks. These are **partial, source-specific results**. The
final eighteen Chromium/WebKit model journeys are not complete.

The broad simulator suite was interrupted at the requested checkpoint and has
no all-suite verdict. Its earlier run exposed the now-corrected Pivot Rover
regression. No full exact-head hosted qualification, release, TestFlight upload,
or physical LEGO building verdict is claimed.

Existing main examples have a separate [audit](ROBOT-LAB-MAIN-AUDIT-20261026.md):
43 program-only completions, 11 unfinished summaries, four program faults and
15 overlapping wall timeouts among 61 attempts. Three summaries are missing.
Those results are not mechanical qualification; preserve their source hashes.

## Continue in this order

1. Read `lanes/PROTOCOL.md`, this handoff and the private local handoff if present.
   Fetch current main, inspect active claims, and claim the remaining browser/
   admission work before changing implementation. This checkpoint releases the
   previous intake ownership; other owners' physics work is preserved.
2. Use Node 22 and `node scripts/worktree-deps.mjs link`, then `verify`. Follow
   `docs/VENDORING-REGIME.md`; do not borrow another worktree's installed modules
   or introduce a local fork of a pinned package.
3. Run the focused native suite with a **fresh** evidence directory:

   ```sh
   BW_MODEL_QUALIFY_EVIDENCE_DIR=artifacts/nine-native-next \
   node --test --test-concurrency=1 --import ./scripts/lib/register-gui-scope.mjs \
     test/bw-sim-nine-intake-motion.test.mjs \
     test/bw-sim-nine-intake-assets.test.mjs \
     test/bw-sim-nine-intake-checks.test.mjs \
     test/bw-sim-stock-axle-envelope.test.mjs \
     test/bw-sim-mechanics-machines.test.mjs
   ```

4. Integrate and build normally. Preserve known generated translation originals
   if required by the repository handoff. Check source/package mirror identity,
   startup payload and the build's source manifest.
5. Run **one model per invocation**, in both engines, from that production
   build. For example:

   ```sh
   BW_SIMLAB_BROWSER=chromium node scripts/verify-sim-lab-browser.mjs \
     --part=examples --examples=helixgate
   ```

   Repeat for all nine IDs and `BW_SIMLAB_BROWSER=webkit`. Each invocation writes
   `artifacts/sim-lab`; move it into a unique evidence directory immediately,
   including on failure, before starting another invocation. Keep the existing
   eight-minute step bound. Do not run both engines concurrently against the
   same checkout/artifact directory. The shared helpers deliberately use the
   real experimental checkbox while these models remain unqualified.
6. Every journey must pass actual worker/passive motion and hold, manual controls,
   EN/DE lessons, connected instructions/BOM, raw LDR/MPD imports, actual GUI SB3
   export and complete fresh-context replay. Browser poses do not prove contact
   force; retain native contact checks. Preserve any failed recording before
   repairing source; do not weaken tolerances or rerun an unchanged failure.
7. Export fixed pairs with `scripts/export-robot-lab-library.mjs` and explicit
   `--models=` selection. Verify exported placements/rotor semantics and replay
   relevant exports in the app. Keep original authors' LDraw notices alongside
   CrispStrobe's BSD models. Do not introduce noncommercial licences.
8. Only after all checks pass, set `simulationChecked: true` for the admitted
   entries, update their records, and test default-gallery discovery. The UI
   supports this status already; the checkpoint intentionally sets none.
   Keep other experimental entries opt-in and do not relax builder admission.
9. Finish broad affected simulator regressions, compose then-current main,
   record final source identities and run the normal single exact-head hosted
   qualification set. Land normally with matching-head guards. Audit/fix the
   older examples in separately claimed work; do not silently mark their
   program-only completions as mechanical passes.

Known limit: removing one LoopRelay chain link alone still leaves an inferred
coupling. Its current causal control removes the driving sprocket. The harness
cannot be advertised as catching every possible construction defect.
