# Shared finite decimal source carriers

## Problem and scope

The shared TypeScript tokenizer recognizes signed scientific exponents, but
`BaseTranslator.expr` currently emits the original decimal spelling. The Code
expression parser reads the sign in `1e-7` or `1e+3` as subtraction or addition.
The emitted blocks therefore do not carry the Number from the source literal.
The micro:bit and EV3 translators inherit this Number branch; Calliope uses the
micro:bit translator. CPX currently follows a separate JavaScript import route
and is outside this claim.

This lane proposes reuse of the existing finite decimal carrier helper in the
shared Number branch. The helper spells the same finite JavaScript Number as
decimal digits without an exponent sign that the Code parser can split. The
change affects representation only; it does not add source arithmetic, Number
methods, annotations as producer authority or new target runtime behavior.

## Required behavior

- Preserve actual numeric value through source conversion, Code parsing and
  current saved blocks for positive and negative exponents, leading decimal
  points, unary negatives, zero, underflow to zero and finite subnormals.
- Preserve hexadecimal and binary normalization and ordinary decimal literals.
- Preserve member access boundaries, identifiers containing `e`, invalid
  exponent diagnostics and strings that look like scientific notation.
- Preserve actual connected edited operands through export and reimport.
  Do not restore an earlier source expression after a visible edit.
- Keep non-finite literals outside the finite helper's admission claim. Existing
  target overflow behavior must not silently become a fabricated finite Number.
  Any separate refusal or full carrier requires explicit qualification.
- Do not change target-specific integer widths, casts, precision or hardware
  semantics. Finite carrier equality does not prove cross-target hardware parity.

## Qualification

Use actual source converters and the current Code creator. Verify the connected
assignment input graph, not only emitted text or a mirror of the helper. Include
Code/SB3 and exported/reimported routes with edited numeric values. Native
execution must use the real target runtime where needed, with source and engine
bytes bound to the result. Retain the initial wrong signed-exponent blocks.
Original target compilation or guest execution requires a separately frozen
program and the normal ownership reservation; it must not replay an unchanged
successful original merely to read its result.

No compiler supplier, vocabulary, dependency pin or non-finite representation
is changed by this contract. Arcade Number-to-text remains a separate bounded
operation with its own qualification.

## Qualified boundary

The merged ownership claim precedes the two-file frontend/control change. The
shared Number branch now uses the existing finite decimal helper and explicitly
reports non-finite literal overflow instead of emitting a misleading finite
expression. Full Infinity/NaN literal representation remains follow-up work.

The focused native controls cover micro:bit, Calliope and EV3 source conversion,
actual numeric input shadows, arithmetic and aliases, tiny and maximum finite
values, subnormals, underflow, hexadecimal/binary values, unary negatives and
scientific-looking text. A genuine numeric block field is edited from 1000 to
12.5, then survives native restart, saved-project reload, target export and fresh
source reimport. The current connected field remains authoritative.

The same controls detect the old shared translator: six failures and one passing
lexical control. The fixed gate passes seven controls. Existing Calliope and
Arcade Number controls plus the explicitly selected EV3 conversion controls
also pass. Source, creator and native-engine file hashes are bound before and
after those runs. The EV3 original compiler test is outside that selected gate.

### GUI and target limits

The numeric fields are standard editable blocks; no new selector or authoring
word is introduced. This qualification uses the actual native Code/SB3 route,
not a hosted browser journey. Visible editing of tiny/exponent fields in each
target pane remains a hosted GUI acceptance item. Decimal expansion can be long
for subnormals; a more readable scientific Code grammar is separate work.

No target hardware precision, integer cast, sensor/motor operation or new target
compiler execution is inferred from these numeric carrier tests. CPX TypeScript
import, general Number methods and full non-finite carriers remain outside this
bounded change.
