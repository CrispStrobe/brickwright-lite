# Arcade 2i part 1: dead start-script defaults of mixed globals

Status: claim and change in one PR. Owner: Arcade exporter lane (row 2i).
Base: main `a4c2b442cdf3`.

Scope: the global declaration loop in
`overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` (and its integrated
copy) and `test/arcade-startup-first-write-globals.test.mjs`. No authority,
importer, pin or workflow change. The Array-authority part of 2i comes in a
separate claim after the importer lane's animation-export change merges.

Problem: row 2i's second export carries `Game_row = (0 + 0)` because the first
export declares the mixed global `let Game_row: any = 0`, and the reimport turns
that root default into a startup write.

Change: 2e already finds globals whose saved default can never be read (every
reference in the single start script, first one a plain set that does not read
the variable) and declares a String one `= ""`. A dead global that would be
declared `let n: any = <saved>` is now declared `let n: any`, with no
initializer. Live defaults (any other reference) are unchanged.

Evidence: the first export of the named-array fixture now declares
`let Game_row: any`, and its reimport has no `set Game_row to (0 + 0)`. New
tests: a native mixed Number/String global is declared without a default and
original PXT gives the same values for the export; the same global also read by
another script keeps `let row: any = ...`. Mutation: disabling the rule fails
the first test. Row 2i itself stays TODO: `Game_row = Game_alias[2]` and the
guarded `__bwNamedArray_items` lengths still need export-side Array proofs.
