# Arcade: closed class effects before a definite Array overwrite

Owner: Arcade compatibility lane.
Branch: `lane/arcade-class-reset-effects-claim-20261021`.
Base: `c91fbbece50806d9f28f052b96bf00601734a5f4`.
Status: ownership merged; source candidate awaits independent review and actual qualification.

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

## Source candidate boundary

The private helper is consulted only after the existing project-JSON brand and
own-descendant audit. It binds actual local class declarations to unique physical
initializer, constructor and method definitions and argument mappings. Actual
constructor arguments and all selected own-field bodies must be closed primitive
effects; declaration type names supply no facts. Method receivers follow actual
allocation/writer chains, with conservative complete heap-writer alternatives for
Array elements. Unknown producers, cycles, missing writers, effectful receiver
expressions and SDK or accessor/inherited paths refuse. Primitive alternatives
can only fail native object-heap ownership; JavaScript member dispatch is not
admitted. No Array, type, body or receiver identity certificate is returned.

The entire legacy Array-reference authority is unchanged, preserving all four
old reset/effect proof bodies. The proposed development invocation contains four
complete modules, 32 controls, including the genuine compiler prerequisite.
A missing-SDK control remains an explicit absence, never a compile or complete
acceptance. The complete 17-module affected selection, native, compiler, full
getInfo/SPIKE, fresh SB3 and visible authoring acceptance remain mandatory.
The original 24-control attempt remains 17 pass, six fail, one SDK_ABSENT; no
new execution or historical project-count change is claimed by this source.

## Preserved development failure and source follow-up

The complete four-module attempt recorded 24 passes, seven failures and one
SDK_ABSENT control. Its final cumulative child-plus-observer CPU exceeded the
25-second budget. It is preserved as both product and resource failure; no local
repeat, filtering, sharding or budget increase qualifies it.

The source follow-up checks every actual writer alternative independently,
including primitive resets followed by class allocation. Canonical native
null/undefined fields retain absence facts; malformed or conflicting selectors
remain opaque. The new immutable-only overwrite theorem can bind an ancestor
reset only through the same exact single-caller, zero-argument, straight-line
ancestry. All legacy reset/effect bodies remain unchanged.

Genuine allocation flow may replace stale declaration syntax, but ordinary
parameter/result hints remain conservative `any`, with explicit primitive
constraints first. These hints issue no operand, Array, receiver or body proof;
annotations alone issue no hint. Source scalar Any declarations are neutral
binding commands, not value evidence. A harmless pure constructor before an
overwrite is a positive control, paired with constructor publication and callback
refusals. Full failure captures now also cover the class-effect round trips.

Next qualification is the complete hosted 32-control selection with its genuine
SDK prerequisite. Compiler validity of mixed Array method access, the complete
17 affected modules, native/current execution and GUI journeys remain pending.
Historical project totals are unchanged.

This source follow-up is unexecuted. Independent source review is not runtime,
compiler, complete-suite or GUI qualification.
