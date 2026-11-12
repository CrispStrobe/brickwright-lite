# Ordinary-class scalar Any consumers

Status: IMPLEMENTED in the integration candidate; final exact-head runtime/editor
qualification pending. Owner: Arcade integration,
continuing PR #1128. Preserve the separately claimed Math integration.
Base: `e7cc6678b5d0b8e887192142146f0cb945ecdba6`.

## Measured failure

A source reconstruction of the unchanged public Image/class callback fixture
passes the actual importer and direct Creator, then refuses current export.
The emitter produces `let width: any = 0` and `let height: any = 0`; ordinary
class flow rejects those actual Number initializers against named `any`.
This is a consumer-constraint failure before later Image dimension assignments,
not evidence that unknown Image producers should be accepted. A reconstruction
does not establish identity with the original failed VM-consumed graph.

## Exact scope

- `overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js`:
  only the private constrain rule for expected named `any`. Consume an
  independently established concrete Number/String/Boolean/Undefined scalar,
  returning the original actual value unchanged. Preserve generic-origin
  refusal before the rule and existing recursive alternative checks.
- New complete `test/class-callable-scalar-any-consumer.test.mjs`: actual
  parser/class proof and direct importer/Creator/exporter. Keep original public
  fixture bodies and assertions. Source tests do not load the VM or SDK.
- If the new test reaches the canonical procedure constraint model, add only
  its exact test name to the existing matching GUI-scope key.
- This claim and the existing Arcade handoff, next-steps and GUI ledger.

Do not add any to supported field/parameter/return types, create a Number from
an annotation, change declaration/default initialization or emitter inference,
or alter unknown/reference/class/Image/callable/generic constraints. Arbitrary
objects and references are outside this measured scalar-only repair. No pin,
SDK, workflow, runtime, parser or existing test-baseline change.

## Required proof

An unknown or actual Any producer must still fail concrete Number consumers.
After `let value:any=0`, a later String writer remains String and cannot inherit
the initial Number. Check real captures, conditional alternatives and changed
writers. Keep an explicit Any constraint distinct from the actual value;
unknown alternatives and generic origins cannot be discarded or narrowed.

Preserve the original Image fixture through initial export, Code feedback,
current export and fresh emitted-file import. Run the complete new module,
`test/makecode-class-callable-source-gate.test.mjs` and
`test/makecode-class-callable-conditional-source.test.mjs`. Mutations must catch
removed acceptance, replacing the actual value with the expected type, and
freezing a Number across a later String write where applicable.

Keep the original Image default/current-authority/class export, primitive-global,
parameter-property and conditional-original native/SDK tests unchanged for
hosted qualification. Require every enabled final-head check and affected
actual runtime/editor evidence before landing. One repaired reconstruction does
not close the historical class-initializer failures or change corpus counts.
