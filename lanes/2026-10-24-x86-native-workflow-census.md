# x86 native font workflow census — 2026-10-24

Owner: Codex, x86 native font and current GUI lane.
Base: `48bf48a242808b81c15f45c503df3aee60ed2b40`.
Status: claim only. Merge this claim before editing the census or pointers.

## Exact scope

- `docs/generated/ci-step-census.json`: add only the scoped
  `i80386-native-font-selection.yml` workflow and its actual completed source
  controls runs, including the latest run at PR1318 head
  `289308756e3be34a63dba3f2ce48535bc6df8dfb`. Preserve every other
  workflow row, run, date, main source revision and newest-main-run identity.
- `CI-POINTERS.md`: add dated, explicit rows only if the refreshed verdict
  requires them for the guarded `native-font-selection` job and its two named
  steps, `Refuse until selected font, tool, cache and event review` and
  `Retain bounded original only after separately reviewed activation`.
  Identify the owner-only label condition and state that this job has not run.
- This claim file.

The existing `scripts/gen-ci-steps.mjs` supports a scoped workflow refresh and
preserves unrelated readings. Use its scoped mode after this claim merges and
independently compare the recorded runs with official metadata. A completed
source controls run proves that the workflow exists and its pure controls ran;
it does not prove that the guarded native job, `fc-match`, browser or guest ran.
Never dispatch an actual metadata event to populate the census.

## Qualification

The current exact-head unit failure reports this workflow missing from the
generated census. Preserve that failure. Run the unchanged census test and
generator check, including their mutation controls; keep all assertions,
classifiers, thresholds and existing pointers. Check that unrelated dated
rows and main provenance are byte-identical after the scoped refresh. The
claim and later source fix each require their own applicable exact-head CI
before a normal merge. Regenerate the native and GUI offline requests after
any new source head; older requests grant no event or installed qualification.

No generator, test, workflow, guard, supplier pin, actual-event, browser,
Arcade or other owner's source path is claimed here.
