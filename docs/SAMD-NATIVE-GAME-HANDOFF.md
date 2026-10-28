# SAMD engine adoption handoff — updated 2026-10-28

**Adoption is unfinished.** No SAMD engine pin or normal native SAMD GUI route has
landed. Continue `lanes/2026-10-26-samd-native-game-engine-adoption.md` and read
`lanes/PROTOCOL.md`; do not open a duplicate lane.

## Landed

[PR1456](https://github.com/CrispStrobe/brickwright-lite/pull/1456) merged on its
matched head `cf6fc849aec62c6a06845e333df931414fdd9f2f` as
`dea504b32a9a4bd43a2a9d25b587590a0ac9763f` after all enabled checks passed.
It added only the qualification infrastructure: the dispatch-only
`samd-native-game-qualification.yml`, the browser/installed/Node verifier
scripts, a focused test, the adoption doc, the lane file, `CI-POINTERS.md` and the
CI step census. No engine pin, package, native-producer or Build change.

The circuit-UX browser gate (`ADC_POINT_MODE_PUBLICATION`) failed once on that PR
and passed on a single rerun of the failed job. PR1456 did not touch the circuit
path; the failure looks like an intermittent race in that gate. Its owner is the
circuit/instrument lane (`lanes/2026-10-25-meter-adc-package-adoption.md`). If it
recurs, hand the trace to that owner via the operator; do not weaken it.

## Prerequisites still open

- **Engine release.** Waits on the
  [producer handoff](https://github.com/CrispStrobe/bw-board/blob/master/docs/SAMD-ENGINE-RELEASE-HANDOFF.md):
  an immutable bw-board release of Core `3b655aef4085082152129c84849d4e2ad5004a7f`
  with recorded tag and asset SHA-256s.
- **PR1318-first engine/package pin hold.** The 386/native-package owner asked
  that no engine/package pin be published before
  [PR1318](https://github.com/CrispStrobe/brickwright-lite/pull/1318) lands. It was
  still open at this checkpoint. Confirm with the operator that the hold is
  released before task 1. It is not a global main freeze.

## Open tasks, in order

1. **Pin the engine.** In a new owned worktree off current `origin/main`, update
   `scripts/sync-labwired-wasm.mjs` `PIN`, `TAG` and the web engine/glue/profile
   SHA-256s to the release values, and the matching identity in
   `.github/workflows/target-performance.yml`. Keep board, compiler/package pins
   and shared producer/default-profile settings unchanged. Run the focused tests
   (`node --test` on the SAMD/labwired tests; Node 22 locally). Claim and change go
   in one PR per the lane protocol.
2. **Node 22 note.** BW's suite needed `--no-turbo-inline-js-wasm-calls` on Node 22
   because V8 crashes when it inlines JS→WASM calls for this engine (see the
   producer handoff). If a Lite Node test that loads the engine crashes inside
   V8's Deoptimizer, apply the same narrow flag to that one command and say so in
   the PR; never weaken an assertion.
3. **Consumer frontend.** After the pin PR's automatic Build run passes (`build`
   job, `github-pages` artifact), dispatch the existing native executable producer
   once with `consumer`, `frontend_run` and `compile_pins` set together (compile
   pins at the reviewed defaults). Admit successful originals once; never rebuild
   a successful executable only to inspect it.
4. **Qualify.** Dispatch `samd-native-game-qualification.yml` once with exact
   `consumer`, `frontend_run`, `native_run`, `producer_run`, `producer_head`. It
   must pass first attempt with complete rosters, publisher digests and
   checkout/frontend/native/engine/profile/guest joins. Require both actual
   Chromium and installed Tauri/WebKit jobs with three fresh instances each, then
   independently review raw RGB frames, input press/release and RSS. Keep failures.
5. **Merge** the pin PR with `--match-head-commit` after every enabled final-head
   check passes; verify parents and tree. Tell the 386/native-package owner the
   landed SHA, tree and paths (via the operator). Then close the adoption lane.

The observer canvas is a controller-memory view. A normal native SAMD
compile/import/export/GUI route, active-game real-time speed and physical
panel/electrical/silicon qualification are separate scope. A pin or Node result
grants none of those claims. Private paths and evidence custody stay out of
public prose, PR bodies and workflow logs.
