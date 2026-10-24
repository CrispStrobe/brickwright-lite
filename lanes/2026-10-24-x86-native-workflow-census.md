# x86 native font workflow census — 2026-10-24

Owner: Codex, x86 native font and current GUI lane.
Base: `48bf48a242808b81c15f45c503df3aee60ed2b40`.
Status: claim merged in PR1329. Scoped source repair is prepared in PR1318's
branch; final exact-head CI and normal merge remain pending. No native job or
actual font event has run.

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

## Prepared source checkpoint — 2026-10-24

The scoped generator recorded three completed source-control runs,
40061993566, 40052583855 and 40051869439. The first is at PR1318's prior
head; all three skipped `native-font-selection`. The refreshed census retains
all unrelated workflow and run rows plus main provenance, and the three dated
pointers state where the owner-only guarded job and two steps could run. The
unchanged generator check and all seven focused census tests, including their
mutation cases, pass locally under Node 22.23.2. Hosted exact-head CI still
must qualify the final combined source. The previous native and GUI offline
requests bind older source heads and cannot authorize an event.
