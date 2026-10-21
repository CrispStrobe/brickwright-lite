# Arcade: closed class effects before a definite Array overwrite

Owner: Arcade compatibility lane.
Branch: `lane/arcade-class-reset-effects-claim-20261021`.
Base: `c91fbbece50806d9f28f052b96bf00601734a5f4`.
Status: ownership claim only; implementation waits for this claim to merge.

## Problem and scope

Honest class and mixed Array declarations preserve null initialization during
export/reimport. The immutable project-JSON overwrite proof conservatively
refuses a startup path containing class allocation. Implement an independent,
closed effect proof for genuine local class allocation; do not erase resets or
infer safe effects from a class name, type annotation or result signature.

Owned paths:

- `overlay/scratch-gui/src/lib/bw-makecode/array-class-reset-effects.js` (new private helper).
- `overlay/scratch-gui/src/lib/bw-makecode/array-definite-overwrite.js`.
- `overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`.
- `test/arcade-class-reset-effects.test.mjs` (new complete control module).
- The three owned class-writer, canonical-menu and definite-overwrite test modules,
  their GUI scope ledger entries, the conversion GUI gap ledger and this claim.

The existing class writer/declaration claim remains separate and unchanged.
No runtime, dependency pin, generated table, workflow or generic value-graph
change belongs to this claim.

## Contract

Only the existing branded immutable own-descendant JSON boundary may consult
this proof. Preserve the four legacy reset/closed-effect proof bodies exactly.
The new theorem may admit a separately closed constructor effect when its
actual declaration, initializer and constructor definitions match their physical
blocks, parameter bindings, arguments and own receiver field storage.

Initially refuse inheritance, SDK classes, accessors, static/prototype changes,
foreign receivers, dynamic selectors, missing or ambiguous definitions, unknown
calls, global writes, captured values, callbacks and escaping or returning the
new receiver. Check actual argument effects too. A positive result establishes
only the absence of relevant publication before the proven overwrite; it grants
no Array producer, body, value type, receiver identity or input certificate.
Keep existing single-caller ancestry, read-before-write and currentness checks.

## Acceptance

Retain the original complete 24-control failure and full saved graphs. Exercise
the genuine mixed/class startup export, outer Code feedback and exact-files
fresh reimport. Keep raw-object refusals on graphs that require the new immutable
boundary, and retain the old raw safe-prefix case as a positive control.
Require negative constructors with global writes, callback registration, receiver
escape, accessors/inheritance, dynamic or unknown bodies, effectful arguments,
and changed definitions after analysis. No weakening assertions or thresholds.

Run complete affected modules, the complete extension-menu/SPIKE controls,
actual current SDK compilation and current execution/browser journeys before
claiming application compatibility. A named missing-SDK skip is an unqualified
prerequisite. Historical corpus totals remain unchanged until a complete census.
