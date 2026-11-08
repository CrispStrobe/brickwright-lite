# Arcade second export of root Array globals reset before `__bwStartup` (item 2b)

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane. Base: main `3865c95e7b74`.

Scope: `overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`
(one new global reset rule), `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`
and its tracked `packages/scratch-gui` copy (green-flag local declarations),
`test/makecode-arcade-sprite-collections.test.mjs` (TODO marker removed),
new `test/makecode-arcade-startup-null-reset.test.mjs`, the 2b row of
`lanes/2026-11-03-arcade-pending-after-1643.md` and the matching row of
`docs/ARCADE-888-OPEN-FAILURES.md`. No pin, workflow, importer or
connected-authoring (#1674) file.

## What blocked the second export

Two different dead null resets, in the reimported first export:

1. Globals `actors`, `alias`, `another`, `currentFood`: the root
   `let X: Sprite[] = null` becomes a green-flag `set X to null`, followed by
   `CALL __bwStartup`, whose body overwrites X before reading it. The global
   reset rule only killed a reset whose overwrite is in the same script.
2. Staged locals `__bwPxtValue1..4`: the first export hoists them to the top
   of `__bwStartup` as `let v: T = null` and assigns them much later, after
   calls. The local reset rule deliberately keeps a reset across calls,
   yields and lifecycle commands (`makecode-array-local-reset-proof`); that
   rule is not changed (widening it was tried before and breaks 17 refusals).

## Change

1. Authority: a global null reset written by a green-flag script is dead at a
   read inside a parameterless procedure whose only call site is a direct
   call in that same script, once a writer of that procedure has executed on
   every path to the read. Reason: the script is one thread; while it is
   inside the procedure it cannot run the reset, and no other thread runs the
   script or (single call site) the procedure. The overwrite's own value
   still goes through the ordinary all-writers initialization proof.
2. Exporter: in the green-flag script only, a hoisted `    let v: T = null`
   moves to v's first mention when that mention is the whole top-level
   statement `    v = e` (indent four, outside a template literal, e not
   mentioning v and not ending open). Nothing could observe the null, so PXT
   behaviour is identical; the reimport then has no dead local reset.

## Evidence

- The 2b test passes without its TODO marker: original PXT, native VM, Code,
  first export in PXT, reimport in the VM, second export in PXT (all 19
  values equal), fresh SB3 restart.
- New test file: positive PXT/export comparison, and nine near-miss controls
  that stay refused (read before the overwrite, conditional overwrite, a
  second call, an extra handler call, a handler as the only caller, a handler
  that resets and calls, a handler writing null again, an overwrite copying
  the reset value, a reader outside the procedure), plus unit cases for the
  declaration sinking (earlier read, nested line, self reference, multi-line
  value, open template literal, template-quote ending, non-assignment first
  mention, non-null or non-top-level declaration).
- Mutations (each run against both test files): removing the whole rule, the
  single-caller rule, the same-script caller rule, or the executed-before
  condition is detected; removing the sinking, its first-mention, self
  reference, open-value, template-parity or declaration-shape checks is
  detected. The green-flag-script condition survives: every TS-expressible
  handler variant keeps the root declaration's own green-flag reset, which
  is still live when the procedure's only caller is a handler. It is kept as
  defense against a project-only input.
- Unchanged and passing: `makecode-array-local-reset-proof`,
  `makecode-export-arcade`, `makecode-arcade-sprite-collections`.
