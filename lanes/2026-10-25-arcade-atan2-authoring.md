# Arcade atan2 through source, Blocks and runtime

Status: CLAIMED; merge before implementation. Owner: Arcade integration,
continuing PR #1128 after its SDK scalar proof repair.
Base: `1496b3f4291f4ec0000c1422e869c23872e914ec`.

## Measured gap

The fresh canonical retained-context source scan reports `Math.atan2() as a
value` in five contexts with historical original-compiler successes. Current
source import and Creator results are separate from those compiler originals;
no whole application is counted complete. Closing this API does not erase the
other diagnosed gaps in those contexts.

## Package ownership and exact paths

Claim both boundaries: upstream `CrispStrobe/sb3-creator` owns
`src/utils/arcadeDialect.js`; Lite owns its importer, exporter, runtime and IDE.
The upstream repository has no lane registry at the inspected current main.
Use an isolated upstream branch and qualify/land it before moving Lite's exact
supplier pin. No private Lite fork of the dialect or manual mirror patch.

Upstream scope: the existing binary-math reporter's fixed operation vocabulary,
a focused dialect parse/spell test and capability documentation if necessary.

Lite scope:

- `overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js` and
  `export-arcade.js`: exact unshadowed two-argument Math.atan2 import and export;
  preserve left-to-right argument evaluation, reference diagnostics and actual
  radians. Keep ordinary source arithmetic distinct from native coercion.
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js`: the existing
  mathBinary reporter and its fixed menu; implement genuine atan2(y,x) numeric
  behavior, including quadrants, axes, signed zero and non-finite values.
  Preserve the existing value adapter and unknown-operation refusals.
- Upstream-first pin/sync: `vendor-pins.json`, the normal sb3-creator provenance
  outputs, and map-derived dialect copies through the existing sync command.
  Change only the reviewed qualified supplier selection and its derived bytes;
  preserve unrelated suppliers and licence notices.
- New `test/arcade-math-atan2.test.mjs`, existing binary-math integration tests
  where needed, and exact new GUI-scope census rows. Use actual original and
  emitted PXT, real VM, current Code, saved-project reload and reimport. Retain
  all existing assertion programs, thresholds and negative controls.
- `test/fixtures/arcade-numeric-authoring-game.mjs` and
  `scripts/verify-arcade-numeric-authoring-gui.mjs`: add a real visible atan2
  menu-edit journey without removing earlier journeys; restore earlier choices
  when subsequent assertions expect them. Observe genuine controller/runtime
  state, Code feedback, export and fresh reopen, without injected guest state.
- This claim, `docs/ARCADE-AGENT-HANDOFF.md`,
  `docs/ARCADE-COMPATIBILITY-NEXT-STEPS.md`, and
  `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md` record each acceptance boundary.

No workflow, timeout, baseline or unsupported-feature suppression. No raw
private corpus, evidence, machine details or licensed input publication.

## Acceptance

Qualify the upstream complete affected dialect controls and all enabled exact
head checks before its matched-head merge; verify landed tree and parents.
Then adopt normally, run focused source controls and meaningful negative or
mutation checks, and use hosted original/emitted SDK, native runtime and real
GUI qualification. Preserve pending original intake and do not duplicate live
jobs or one-shot events. Final integration needs every enabled final-head check
and actual affected authoring/runtime evidence; source-only success does not
close GUI rows. Remeasure affected unchanged corpus inputs, keeping original
invalid inputs and resource-unavailable contexts distinct.
