# Score completion observation in the owned control

Status: DONE implementation candidate; actual SDK/native qualification pending.
Owner: Arcade integration. Claim PR #1396 merged at
`2fbfb542a759f7fda3a2d425b746567c380d41c0` before implementation.
Base: `45504c856322232e81e3f58f40248df45a57174d`. Separate from SDK constructor effects and the active
PR #1128 publisher; do not modify another worker's source tree.

Implementation: `1731e5a6556b1ead4fb2050a123c63b4f3e9ec01`. The raw source
string is unchanged. Nine complete source controls pass across observation,
numeric ingress and score export; cuts detect an early marker, omitted final
store and changed game operation. The actual runtime test retains every
existing state/trace/Stop assertion, requires main completion explicitly and
checks both emitted Boolean marker stores using the same compilation observer.
No actual SDK/native result is claimed from these source controls.

## Observed boundary

The retained score control's original simulator failure already reports the
expected game trace, nested/live callbacks, integer score and scene values,
while its requested ready global is absent. Its fixture ends with an unused,
pure `let ready=true`. Selected PXT13.2.1 emits unused pure globals on demand;
this is a concrete observational lead, not proof that main returned or a
complete diagnosis of the retained timeout. Keep the old failure.

## Exact implementation scope

- `test/fixtures/arcade-score-threshold.mjs`: retain the exact existing
  independently authored raw fixture. Add an explicitly named observed control
  variant with a unique ready=false declaration before the unchanged game
  operations and ready=true assignment after them. Keep every threshold,
  callback, score, scene and player operation in its original order. Check that
  the auxiliary binding has no other reads, writes or collision in the core.
  Do not transform arbitrary apps or substitute the raw corpus input.
- `test/makecode-arcade-score-threshold-native.test.mjs`: execute that declared
  observed control through the same required SDK/native/Code/SB3/export routes.
  Preserve EVERY existing value, trace, suspension and Stop assertion, the
  genuine main-completion requirement and the unchanged timeout. Use the
  existing compilation observer to check that the actual observed ready binding
  is emitted; retain only bounded hashed diagnostics on failure. No guest retry,
  clock change, injected runtime value or ready predicate relaxation.
- New `test/arcade-score-completion-observation.test.mjs`: meaningful complete
  source authoring/export/reimport and saved-project control. Verify the entire
  game-operation AST is unchanged and that only the declared observation
  instrumentation differs. Add only its exact GUI-scope entry if needed.
- This claim and existing Arcade handoff, next-step and GUI ledgers.

No product runtime, SDK/compiler, parser, dataflow authority, supplier pins,
workflow, test selection, baseline, thresholds or timeout changes. Never claim
that source instrumentation repaired a game feature or that an absent raw
runtime value was observed. Existing source numeric-shadow ingress remains a
separate product candidate requiring actual native qualification.

## Acceptance

Retain raw source/hash and historical failure separately from the explicitly
instrumented control. Pure source checks do not establish original execution.
On the one normal composed qualification, require actual emitted-marker
presence, genuine original main completion, all existing game-state assertions,
native registration/suspension/Stop, Code, same/fresh SB3 and current export.
An early or omitted marker must fail the completion witness; a changed game
operation must fail the source-equivalence control. Every enabled exact-head
check and matched merge tree/parents remains mandatory before landing. If main
still does not complete, retain that failure; do not remove its assertion or
extend a timeout. No new full-CI label or manual dispatch is needed.
