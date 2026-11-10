# Arcade 2e: exported String receivers and dead start-script defaults

Status: claim and change in one PR. Owner: Arcade lane, exporter side of row
2e (assigned by the coordinator; the importer rows 2d, 2f stay with their
owner). Base: main `4b2f5047dde6`.

Scope: `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` (and its
integrated copy), `arcade-runtime.js` (the `sdkStrings` helper group is split),
new `startup-first-write-globals.js`, `test/makecode-string-conversion-roundtrip.test.mjs`,
new `test/arcade-startup-first-write-globals.test.mjs`, the 2e row (and one new
row) of `lanes/2026-11-03-arcade-pending-after-1643.md` and the matching row of
`docs/ARCADE-888-OPEN-FAILURES.md`. No importer, proof-engine, pin or workflow
change.

Change: the export wrote `let f: any = 0` and `h = __bwSdkConcat(<any>f, g)`.
The flow-insensitive reimport then sees `f` as {Number 0, String} behind an
opaque cast and refuses `__bwSdkConcat.left`.
1. A global whose every reference lies in the single program-start script, and
   whose first top-level statement referencing it is a plain `set` not reading
   it, has an unobservable saved default. When the export type graph proves
   its writers String it is declared `let f = ""`. Other globals are unchanged
   (the exporter's coarse kind inference is not trusted for this).
2. `__bwSdkConcat(left, right)` is `left.concat(right)`. A string-literal
   receiver, or a global finally declared string, is called directly as
   `x.concat(<any>y)`; any other receiver keeps the helper. The helper is a
   separate runtime group, so an unused one is no longer emitted beside
   `__bwSdkCharCode`.

Evidence: the TODO test `original UTF-16 and nullable primitive strings survive
source, Code, original export, reimport and fresh SB3` passes with its marker
removed (original PXT on source and export, VM, Code, reimport, fresh SB3).
New tests: PXT comparison of a direct-concat export, a near miss whose global
is also read by a procedure (keeps its default and the cast helper, PXT agrees),
and first-write analysis controls (read first, self-reading set, nested first
reference, reference in another script, two start scripts, name used as menu
text, ineligible variable). Mutations: no dead defaults, no direct global
concat, no direct literal concat, no helper fallback, no name-as-text
reference: each fails a test.

Not covered here: the named-array second export (`row`, `alias`) leftovers from
2d need export-side Array authority proofs, recorded as row 2i.
