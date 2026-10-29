# Align the official GUI consumer with its supported events

Owner: Circuit/editor integration maintainer, coordinating the CI audit boundary.
Status: CLAIMED; implementation waits for registration. No active collision was identified in the bounded ownership review.
Base: `54df780e909db9652db16e928d05f4b5a220947d`.

## Observed failure and preserved boundary

Build offers full manual qualification, but its unconditional official-build
numeric consumer uses an artifact validator accepting only reviewed push/PR
events. Independent execution of the actual pure validator refuses an authored
manual-event fixture before archive acquisition, even with exact owned source
and an associated PR. Necessary manual run `40856189963` at `d32860b8` was
cancelled with both jobs queued and zero running children. It produced no
application qualification or archive.

Preserve the artifact event roster. The fast PR and normal main-push numeric
consumer remain required. The manual full workflow supplies separate browser,
FPGA and profiling coverage; its unsupported numeric-consumer route is explicitly
skipped. Do not infer artifact review authority from a run's PR association.

## Exact envelope

After registration, own only the following bounded extension of the historical
CI audit source contract:

- `.github/workflows/build.yml`: the `arcade-numeric-authoring` job guard only.
  Require a successful build and a supported `push` or `pull_request` event;
  skip manual/unknown events and unsuccessful dependencies.
- `scripts/lib/official-gui-artifact.mjs`: require that exact source guard in
  `guiRunnerProducerSource`. All metadata admission predicates stay byte-held.
- `test/official-gui-runner-producer.test.mjs`: execute the actual source guard's
  event/result matrix and detect absent, weakened or unconditional guards.
  Retain genuine push/PR admission, CLI, zero-GET, manifest/digest/archive and
  failure controls without importing another test.
- This claim leaf only for status and evidence.

No producer command, output packet, tier/shard selector, dependency, label,
permission, action pin, timeout, threshold, stored census, archive format,
application/model, SDK/pin, native guest or deployment change is owned. Arcade
feature/PXT work and its optional evidence capture stay separately owned.
Registering this claim selects no original archive acquisition.

## Qualification

Preserve the before-fix refusal. Check actual source selection for push, PR,
manual, unknown events and successful/failed/skipped dependencies; detect real
source-guard mutations. Prove all metadata admission and unrelated workflow bytes
unchanged. Require every enabled final-head fast check, its supported official
numeric consumer and one necessary source-bound full application qualification,
with the manual skip explicitly accounted for. A fixture or cancelled original
does not qualify an application. No unchanged dispatch repeat, consumed-study
replay, full-tier label, second original GET, threshold relaxation or deployment
claim is authorized.

## Additional dependent wiring test — unit shard 2

The once-retained original for fast run `40845058229`, unit job `123370936203`,
contains one true TAP failure in `test/ci-browser-scope.test.mjs`: its CLI/wiring
case still expects the deliberately removed no-browser admission message.
Quoted workflow comments and the final repeated failure summary are not extra
test failures. This is not an observed LM741 or numerical-model failure.

Extend the exact envelope by only `test/ci-browser-scope.test.mjs`. Replace the
obsolete diagnostic-message assertion with checks that real classifier output
reaches `GITHUB_OUTPUT`, maps through the scope job's outputs and feeds the
existing matrix/FPGA/browser selectors. Preserve its actual CLI false-output
case, all classifier/import-closure behavior and shard-selection assertions.
Do not restore the old empty-tier admission bypass or delete the wiring test.
This is test maintenance for the separately registered selected-tier policy;
it changes no application, data, numerical predicate, threshold or supplier.
