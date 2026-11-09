# Arcade TODO row 2d: named-array helper library on reimport

Status: DONE in the implementing PR (claim and change together), except one
row that now stops at the second export (see below).
Owner: Arcade lane (row 2d of `lanes/2026-11-03-arcade-pending-after-1643.md`).
Base: main `c24e1326aec4fbfde729971d151f87da8099fb72`.

## Cause

The reimport recognizes the exporter's named-array helpers only if the shared
ambient proof shows every call outside the selected helpers has a builtin
effect. Two exported shapes failed it although original PXT compiles both as
the builtin Array method (which faults on a non-Array):

- `__bwArrayAccess(x).push(...)` with an unprovable `x`, emitted for
  "mutate array reference";
- `array.indexOf(...)`, `array.pop()`, `array.removeAt(...)` and
  `array.insertAt(...)` on the passive helpers' formal `array: any[]`.

With the proof false, no helper was removed and their bodies reached the
ordinary translator (default-parameter protocol, `isNaN` as a value,
`charCodeAt`, `control.panic`, `Array.isArray`).

## Scope

- `overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js`:
  in `ambient()`, a builtin Array method call is also admitted on (a) a call
  of the exact canonical internal `__bwArrayAccess` (return type and local
  both `any[]`) and (b) an identifier bound to a formal declared `any[]`. No
  value or type fact is inferred from either.
- New `test/generated-helper-typed-array-receivers.test.mjs`: both admitted
  shapes, and near misses that stay refused (helper not internal, result
  `any`, local `any`, non-builtin method, formal `any` or `number`, a local
  `any[]` of the same name).
- TODO markers removed: `makecode-arcade-named-arrays` "named operations
  evaluate their arguments once..." and `makecode-arcade-source-typeof-roundtrip`
  "E15 text versus JSON aggregate helper...".
- `docs/ARCADE-888-OPEN-FAILURES.md`: C rows only.

Mutations: dropping (a) fails the typeof roundtrip test; dropping (b) fails
the named-operations test; the new test's two positive cases fail on the
original source.

## Still open

`makecode-arcade-named-arrays` "named arrays retain scalar items..." keeps a
TODO with a new reason: the reimport and its VM run now pass, but the second
export refuses the reimported Array references (`Array reference
arrays_referenceItem ... requires an actual initialized Array producer and
compatible all writers`, and "Named Array getter registry escapes to an
unproved writer"). That is export-side Array authority work; coordinate with
whoever holds `array-reference-export-authority.js`.
