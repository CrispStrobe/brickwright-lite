# Arcade native addition: actual refusal details and author feedback

Owner: Arcade compatibility lane.
Branch: `lane/arcade-refusal-details-source-20261021`.
Base: `e260e1fef2c00b6f7c0dd7f1ada4b1bb2303602c`.
Status: merged claim; complete 15-control diagnostics group passes; visible browser and compiler acceptance pending.

## Problem and existing reporting route

A shared native-addition refusal can arise from different emitted operands.
The current domain result discards the actual rejected call and its observed
type/initialization facts. The exporter cannot recover them without repeating
analysis. A common reason is not evidence that every affected case has one
cause or that a neighboring source fix resolves it.

Use the existing exporter result and the existing expandable `conversionReport`
panel. Arcade export/run currently reports unsupported counts in status text;
authors need the actual reasons and available block/operand context too. Keep
Blocks/Code reporting intact. The conversion journey already retains the full
returned export through its lossless observation graph, so no compatibility
report or admission schema change is included in this claim.

## Owned implementation paths

- `overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js`:
  refusal-only plain diagnostic data from the actual existing failure branch.
- `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`: actual emission-site
  provenance, optional refusal details, and exact candidate-source retention.
- `overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx`:
  Arcade export/run handoff and display through the existing conversion report.
- New complete `test/arcade-native-addition-refusal-details.test.mjs` and
  `test/arcade-export-refusal-report.test.mjs` control modules.
- `test/conversion-failure-diagnostics.test.mjs`: preserve the existing report,
  original errors and current editor/asset ownership across the new handoff.
- `scripts/verify-arcade-numeric-authoring-gui.mjs`: focused visible reporting
  acceptance in the existing verifier, retaining its original journey assertions.
- `scripts/lib/gui-scope-allowed.json`: only the two new test consumers, if
  needed, under the existing procedure-constraint-model key; no new key,
  provider or fallback.
- `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md` and this claim.

No runtime, supplier, dependency pin, generic value graph, workflow, conversion
journey, compatibility-report schema or report-admission change is authorized.
Normally compose the current implementation source before implementation;
this claim-only base is not evidence that a later integrated source qualifies.

## Diagnostic contract and authority limits

Preserve every existing reason string, refusal, guard, threshold, code path,
short-circuit order, proof/currentness boundary and successful return shape.
Do not recompute a proof or query an operand again to fill a diagnostic. Return
only per-invocation, plain refusal data from observations already made: actual
helper name and source-call ordinal, left/right operand position, safe type-kind
labels, and initialization/captured-scalar statuses. A predicate not reached by
the original short circuit is `NOT_EVALUATED`, never guessed false or true.
Retain each branch's existing behavior; this work does not admit an operand.

Keep original-call provenance through the existing private transformation.
Only join it to an actual emission-site/block/operand socket when that mapping
is established. Distinguish an exact rejecting site from candidate sites. Report
an absent source range, class/slot association or physical origin as unavailable;
never invent a location from a name, annotation or a neighboring call. Use no
new guest evaluation, source getter/coercion, callback, last-failure cache or
public proof/token API. Never return callable/AST objects or private identity
tokens. No diagnostic supplies input, Array, body or receiver
authority, and no refusal state may leak onto a later clean or unrelated export.

Existing unsupported string lists remain unchanged and complete. Add optional
structured details only to refusal results; success APIs remain unchanged.
Keep original thrown errors if diagnostic capture fails. Retain the complete
actual candidate draft, current project, exported files and original errors in
bounded failure artifacts when admitted, without console dumping, slicing or
substituting a reconstructed draft for the actual one.

## Author-facing behavior

Reuse the existing report's expand/dismiss and unsupported-list structure.
Show the original reason plus available block, operation and operand context;
keep unavailable context explicit. Provide export-specific outcome wording:
saving a partial project is not “generated and loaded”, compilation success or
behavioral preservation. Retain original-source export, download/run behavior,
compiler/error identities, asynchronous editor ownership and current assets.
An old report cannot be presented as the result of a later export or edit.
Do not add a class graphics editor or broaden class/argument authoring here.

## Qualification before a compatibility claim

Require complete new modules and complete affected existing domain/export/report
modules, with controls for two distinct rejected calls, left/right positions,
empty/opaque type sets, initialization versus captured-scalar fallback, and
`NOT_EVALUATED` short circuits. Check actual original call/block mappings,
unavailable locations, nested once-only operands, unchanged refusal messages,
currentness, unrelated later exports, and original-error preservation when the
observer fails. Include actual export-to-report handoff and unchanged clean,
original-source, Blocks/Code and asset-bearing paths; no fabricated type facts.

Run the existing visible authoring verifier with actual unsupported reasons and
context available to an author, expand/dismiss behavior, a subsequent clean
export, and current assets preserved. Keep the complete earlier affected suite
and current native/SDK/browser gates mandatory. Original and emitted-file SDK
compilation must actually run; a named missing-runtime skip is not acceptance.
Preserve all earlier product/resource failures. No unchanged local retry,
filtering, new shard or raised cap is justified by this claim; use the complete
coherent hosted qualification. Historical project totals do not change without
a complete admitted application assessment.


## Source candidate boundary

The candidate records the existing operand-refusal short circuit and retains
its original reason. Exact source call ordinal and owning ordinary procedure
come from the held helper/binding traversal; ranges and class/slot context are
unavailable. Emission sites include actual physical IDs and input links, but are
labelled candidates rather than a selected-block certificate. Other refusal
branches without retained predicate observations report unavailable facts.

The existing report panel receives export/run-specific outcomes and details;
report-only ownership does not change downloads, compiler calls, player events
or asset handling. The complete three-module diagnostics group passes all 15 controls with no
skips or TODOs, using the genuine normal VM, Storage, JSZip and model roles.
The additional visible browser journey and complete affected hosted/native/
compiler gates remain pending. Prior failures, resource limits and historical totals remain.

Physical emission candidates are collected only through the actual owned JSON
root and its own descendant graph edges. Direct caller-object exports retain
unavailable physical provenance and gain no new getter/Proxy observations from
the collector. Collection failures cannot replace the original export outcome.

The tracked pseudocode-importer component counterpart in `packages/scratch-gui`
is synchronized byte for byte under the repository mirror protocol. It adds no
separate behavior or dependency role.

## Qualification boundary

All 15 domain/report/conversion controls pass as complete modules, including
queued React update ownership, observer failures, unchanged original source
export and preserved asset/export errors. The original 13-pass/two-failure run
is retained; its relative-import test context and unqualified positive fixture
were repaired without changing a product guard. Unassigned scalar operands
remain conservatively refused and need a separate semantics/entry proof before
widening; a type annotation alone gives no authority. This result does not
resolve the 158 hosted refusal sites or change the historical app count.
