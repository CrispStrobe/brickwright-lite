# Arcade native-frame custom kind effects — scope amendment

Status: CLAIMED; merge before implementation. Owner: Arcade integration.
Branch: `lane/arcade-native-frame-custom-kind-claim-20261023`.
Base: `c5be666c2faf24dbc5711069b5b79f8b83267c07`.
Continue the same owner's merged claim #1283 and source continuation in
[PR #1128](https://github.com/CrispStrobe/brickwright-lite/pull/1128).
Preserve its live head, originals and qualification; no takeover or duplicate
hosted event. Existing source candidates are not asserted as landed on main.

## Concrete missing behavior

The frame effect interpreter recognizes four immutable built-in kind literals,
but refuses the existing native kind allocator and ordered custom-name binder.
The translator, runtime and exporter already support those operations. A game
using a genuine custom kind before its later Array allocation therefore needs a
proper effect proof, without inventing an Array or initialized-value fact.

## Exact source and test envelope

- `overlay/scratch-gui/src/lib/bw-makecode/array-native-frame-reset.js`: private
  effect transfer for actual zero-input `arcade_createSpriteKind`, exact literal
  safe-name/numeric-kind `arcade_bindSpriteKind`, and custom-name lookup only
  where a real earlier binding remains proved on every normal path.
- `test/fixtures/arcade-frame-source-project.mjs`: extract the existing genuine
  source/artwork conversion fixture from the current frame regression module;
  expose no producer/currentness/type certificates or cached proof verdicts.
- `test/array-native-frame-reset.test.mjs`: fixture-only reuse; retain all 11
  existing groups, actual producer/consumer and unsafe control assertions.
- `test/array-native-frame-custom-kind.test.mjs`: new complete bounded module.
  Existing full frame controls are near their local CPU cap, so do not filter
  them, drop controls or increase limits to combine unrelated test cases.
- Associated status and self-contained tasks in
  `docs/ARCADE-NATIVE-FRAME-RESET.md`,
  `docs/ARCADE-COMPATIBILITY-NEXT-STEPS.md`,
  `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md` and this claim.

No translator/parser, emitter, runtime, SDK, supplier, pin, workflow, policy or
browser fixture changes. Read actual native kind allocation/binding/lookup and
lifecycle implementations; do not execute SDK/reference code for this slice.
Stop for a precise amendment if another production path is needed.

## Semantic requirements

A native allocation advances its private numeric kind allocator and cannot
publish or read the current params frame. No exact integer ID is assumed.
Validate the actual empty input/field/mutation schema and native contract;
a number annotation, opcode prefix or saved value grants no authority.

Binding must use its actual fixed safe identifier and an independently proved
primitive Number operand. Reject coercing/dynamic/prototype names and readonly
built-in/library collisions. Treat it only as an ordered registry effect, never
an Array, Sprite, element, source-cell or initialized-input certificate.

For a custom name reporter, require the actual earlier binding in the current
execution prefix. Track private primitive-domain facts through the existing
zero-iteration loop join and complete callback/caller activation boundary.
A later declaration, another scope or ambiguous branch cannot supply a prior
binding. Conflicting or unknown effects refuse. Do not remove existing writer,
source-entry, ownership, declaration-role, prototype or permanent expiration
checks. Preserve the four older reset routes unchanged.

## Acceptance and unsafe counterparts

Use actual TypeScript namespace declarations and variable kind allocations
through real artwork installation, initial clean export, emitted-file reimport,
Code decompile/reparse and final clean export. Exercise real resulting blocks;
never inject a reset, change image dimensions or attach a type certificate.
Add a complete custom-kind module with positives and paired unknown/missing/
late binding, dynamic/coercing name or kind, builtin rebind, malformed schema,
loop zero-path, early callback/capture and second-writer refusals. Preserve
consumer IDs in negative graph edits and retain exact original failures.

The shared fixture extraction must preserve source construction, asset bytes
and per-exact-project asset association. Existing 11 groups must still pass
as a whole, with their full assertions. Separate SOURCE qualification from
actual SDK/native/GUI/controller/save-reopen acceptance and corpus completions.
All enabled final-head checks and existing affected clean guest gates remain
required before merging implementation; no partial-count claim from source
success alone.
