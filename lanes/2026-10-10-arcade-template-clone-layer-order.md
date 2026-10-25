## Arcade template-clone layer order — 2026-10-10

Continues the documented Arcade lane on `lane/arcade-main-sync-20261010`
(origin/main merged into the PR773 stack top). Hosted light-browser run
38025509301 timed out waiting for the red front sprite: its screenshot shows
the z=0 yellow sprite drawn over the z=1 red one. Cause: native drawable
ordering returned early unless a sprite owned a native drawable, so games whose
Arcade sprites are all template clones kept Scratch clone order and ignored z.
Fix orders clones by z then creation, including on clone creation; new
`test/arcade-template-clone-layers.test.mjs` fails before and passes after.
Full Arcade test files: 757/759 under concurrency 2; the two failures pass
serially with and without the fix. Hosted browser qualification pending.
