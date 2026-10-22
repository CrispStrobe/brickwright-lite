# Arcade class Array writers and declaration types

Owner: Codex, Arcade compatibility lane.
Branch: `lane/arcade-class-array-writer-types-20261021`.
Base: `0a23bd8446f3cdb9a51668ea17dedb054648480a`.
Status: claim only; merge after every enabled exact-head check succeeds.

Extend the owned canonical Array export work with actual class-aware writer
facts and exported temporary/local/global declaration types. Complete causal
output exposes an Array containing a Box and a later numeric writer, while the
class model omits the numeric reporter and keeps Box-only receiver facts.
Exported temporary declarations also narrow actual Box values to Number and
Box Arrays to Number Arrays. A clean diagnostic list alone does not qualify
that TypeScript for MakeCode.

Own the necessary changes in:

- `overlay/scratch-gui/src/lib/bw-makecode/object-class-export.js`;
- `overlay/scratch-gui/src/lib/bw-makecode/scalar-export-flow.js`;
- `overlay/scratch-gui/src/lib/bw-makecode/class-primitive-export-proof.js`;
- class/Array type selection and reference initialization in
  `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`;
- `test/arcade-class-array-writer-types.test.mjs`, the two owned canonical-menu
  and definite-overwrite modules, and their existing GUI-scope ledger entries
  if a genuine dependency requires them;
- the owned Array claims and relevant Arcade conversion/GUI handoff sections.

Retain every actual Array writer, alias and possible opaque value. Numeric
facts require actual closed reporter semantics, never a type annotation or
missing graph entry. Choose class, class-Array or conservative mixed types from
complete current writer sets; preserve the distinction between primitive and
reference initialization. Do not disable all classes or discard a writer to
make a control pass. Preserve unknown selectors, source identity, callbacks,
possible Undefined, errors and currentness boundaries. No runtime, supplier,
pin, generated-table, dependency, loader or workflow change.

Keep the original 15-pass/one-failure result and all five complete causal
leaves. Appending at slot 1 does not overwrite a Box read at slot 0: retain that
original source and its complete output as a semantic control when correcting
its overbroad refusal expectation. Add actual affected-slot and Number-typed
writer controls that exercise the claimed proof boundary. Such a correction is
not permission to skip real MakeCode compilation or runtime checks.

Qualify complete affected modules with genuine dependencies, including all 15
existing Array/menu modules, the new typing module and the full existing
extension-menu/SPIKE module. Require actual current SDK/PXT compilation,
original/existing VM behavior, exact-file export/reimport, fresh SB3 and visible
Code/Blocks editing before broader compatibility claims. Keep the historical
corpus counts until an independently checked complete assessment replaces them.
No new full-CI label or duplicate dispatch for this claim.
