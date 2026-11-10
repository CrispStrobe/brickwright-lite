# Arcade 2i part 2: named-array second export Array proofs

Status: claim and change in one PR, stacked on 2i part 1 (#1707). Owner:
Arcade exporter lane (row 2i). Base: main `dcca8d037eb7` plus #1707.

Scope: `overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`
(and its integrated copy): a new `truthyGuarded` beside `falsyGuarded`, its use
in `cellTypesAt` and `initializedCell`, and one clause in `slotsAt`'s named
mutation condition. The TODO marker in `test/makecode-arcade-named-arrays.test.mjs`,
new `test/arcade-truthy-guard-array-authority.test.mjs`, GUI-scope listing,
the 2i rows. Reuses the per-slot facts of #1704 (`slotsAt`); no parallel
mechanism. No importer, pin or workflow change.

Problem: the second export of `named arrays retain scalar items ...` refused
`arrays_referenceLength` on `__bwNamedArray_items` (three reads, each in
`if truthy(items) then n = items.length else ...`, while the cell also has
`null` resets for delete) and `arrays_mutateReference` on `row = alias[2]`
(the slot read of the re-created named Array failed because the earlier reset
`delete array "items"` counted as a named write before the read).

Change:
1. `truthyGuarded(c, at)`: the read is in the FIRST statement of the
   then-branch of `if truthy(x)` (`control_if` or `control_if_else`) testing
   this same cell, and that statement contains no call. No code runs between
   the test and the read, so null/undefined reset writers and the
   possibly-absent type of x cannot reach it. Every other writer still needs
   its own proof.
2. `slotsAt` on a named allocation: a named write that runs once before the
   allocation is created (same once-only scope) cannot touch its slots, like
   writes after the read.

Evidence: the TODO test passes unchanged, including original PXT on the first
and second exports. New tests: a guarded read is admitted; an unguarded read,
a read after a null write inside the branch, a guard on another variable, a
read in the else branch and a negated guard stay refused; a named delete
before the re-creation keeps slot facts, a named write after creation does
not. Mutations (guard off; no first-statement check; no cell identity; else
branch allowed; no before-creation clause; any named write allowed) each fail
a test. The no-call condition has no separate control.
