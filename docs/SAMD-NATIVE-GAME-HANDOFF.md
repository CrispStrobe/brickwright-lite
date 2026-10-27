# SAMD engine adoption handoff — 2026-10-27

**Adoption is unfinished.** No SAMD engine pin or normal native SAMD GUI route
landed. [PR1456](https://github.com/CrispStrobe/brickwright-lite/pull/1456), remote
reviewed head `cf6fc849aec62c6a06845e333df931414fdd9f2f`, remains unmerged.
Continue `lanes/2026-10-26-samd-native-game-engine-adoption.md` and read
`lanes/PROTOCOL.md`; do not open a duplicate lane.

## Prepared work and evidence

The dispatch-only qualifier admits official frontend/native/engine originals,
checks source/archive identities, and drives three fresh simulator instances
in Chromium and three in installed Tauri/WebKit. Independent RGB checks require
moving frames, targets and press/release. Collectors distinguish JS heap from
sampled process-tree RSS, including observer/shared-page limits. 28 focused
source/gate/census checks passed. Actual browser/installed SAMD acceptance is
still pending. Supplier prerequisites are the
[Core handoff](https://github.com/CrispStrobe/labwired-core/blob/main/docs/engineering/samd-software-profile-handoff.md)
and [producer handoff](https://github.com/CrispStrobe/bw-board/blob/master/docs/SAMD-ENGINE-RELEASE-HANDOFF.md).

## Current enabled failure

[Browser-light job122000439786](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40446187634/job/122000439786)
failed `Browser gate — circuit UX`: `ADC_POINT_MODE_PUBLICATION` after selecting
sample mode, with `channels=[]` and `publicationReady=false`. Cause remains
unestablished. This is not a SAMD qualifier result, but blocks the infrastructure
merge. Its original log is retained; reuse it rather than download it again.

Refresh main and coordinate with the existing circuit/386 owner before repairs.
Compare qualified main's verifier with the exact tested checkout. Preserve lane
ownership, assertions, publication/ownership fences and wait bounds; no unchanged
rerun or shared-native-producer edit to conceal this failure.

## Ordered completion

1. Refresh exact PR/main heads and all enabled checks. Resolve the circuit gate
   with its owner, then qualify the final infrastructure. Preserve all CI
   pointers/census observations. Disjoint Markdown composition follows the lean
   protocol; do not repeat a full hosted cycle solely for prose. A real failure
   still stops landing.
2. Merge with `--match-head-commit` only after all checks; prove parents/tree and
   notify the 386/native-package owner of landed SHA/tree/paths. The separate
   **PR1318-first engine/package pin publication hold remains unreleased**.
   This is not a global main hold; confirm release before publishing the pin.
3. After the qualified supplier's immutable release, update exact `PIN`, `TAG`,
   web engine/glue/profile SHA256s in `scripts/sync-labwired-wasm.mjs` and the
   matching `.github/workflows/target-performance.yml` identity. Preserve board,
   compiler/package pins and shared producer/default-profile settings.
4. Finalize consumer source first. Use its successful automatic Build run
   (`build` job, `github-pages`). Dispatch the existing native executable producer
   with all three overrides together: `consumer`, `frontend_run`, `compile_pins`,
   keeping reviewed default compile pins. Admit successful originals once;
   do not rebuild a successful executable simply to inspect it.
5. Dispatch registered `samd-native-game-qualification.yml` once with exact
   `consumer`, `frontend_run`, `native_run`, `producer_run`, `producer_head`.
   Admission requires first-attempt success, complete bounded rosters, publisher
   digests and actual checkout/frontend/native/engine/profile/guest joins.
   Unexpected executable composition fails closed; only declared Markdown
   composition is allowed.
6. Require both actual Chromium and installed Tauri/WebKit jobs, three fresh
   instances each, independent raw RGB/input/RSS review and all final-head
   checks. Preserve failures. Then merge normally and close the adoption claim
   with receipts already available.

The observer canvas is a controller-memory view. A normal native SAMD
compile/import/export/GUI route needs separate scope for target selection,
configuration, supported-format/refusal, input/display and installed interaction.
Active-game real-time speed and physical panel/electrical/silicon qualification
are also separate. A pin or Node result grants none of those claims.

Private paths, evidence custody and watcher details stay in the ignored local
handoff, never public prose, PR bodies or workflow logs.
