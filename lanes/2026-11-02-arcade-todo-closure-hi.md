# Arcade documented TODOs H and I: nested parameter captures and exporter stop lift

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane (operator-approved TODO closure, 2026-11-02).
Base: main `bc39104bd536c0eafb410a6d520f0be3d450fcc6`.

## Scope

- `overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js`:
  - `liftExporterStops`: accept only the exporter's own sprite prologue
    (`let <X>Sprite = sprites.create(img, SpriteKind.<K>)` and its
    literal-arithmetic `setPosition`), and key each script's stop-others guard
    on its own run token against the recorded pair. The shared
    `generated-helper-recognition.js` ambient proof is not widened; the
    prologue is passed as internal only to this caller.
  - New `liftNestedParameterCaptures`: a nested function declaration whose
    only captures are never-written parameters of its root function is lifted
    to the root with those parameters appended to every direct call. Writes,
    enclosing locals, escapes, defaults, deeper nesting and name collisions
    leave the program unchanged.
- Tests: `test/makecode-export-arcade.test.mjs`,
  `test/makecode-arcade-idiv-source.test.mjs` (TODO markers removed, new
  original-PXT equality and refusal controls).
- `docs/ARCADE-888-OPEN-FAILURES.md` rows H and I.

## Qualification

Focused tests plus mutation checks (pass removed, write check removed,
original stop source) fail as expected. Every enabled exact-head check must
succeed before merge.
