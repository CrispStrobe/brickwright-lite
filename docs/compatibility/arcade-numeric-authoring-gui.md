# Numeric, settings and source-loop GUI acceptance

## Status

`scripts/verify-arcade-numeric-authoring-gui.mjs` is a prepared **full production IDE** journey. Preparing it and checking its owned fixture with the original simulator does **not** qualify the GUI. The matching official hosted build must run it successfully before recording acceptance. No whole-game compatibility count changes follow from this bounded fixture.

The fixture is owned code and four-pixel art in `test/fixtures/arcade-numeric-authoring-game.mjs`. Its portable StringArray settings helper retains MPL-2.0 attribution. It uses the pinned original Arcade 4.2.1 / PXT 13.2.1 SDK. It contains no private corpus application or unverified-license BetterSettings source.

## Required identity

Run from the exact reviewed consumer checkout. Set `PROOF_URL` to a server serving the sole admitted official full-app artifact, `BW_GUI_BUILD_ARCHIVE` to that already acquired archive, and `BW_GUI_BUILD_RECEIPT` to its independently reviewed JSON receipt. This script does not acquire artifacts, dispatch builds or assert that supplied metadata independently proves GitHub provenance. The operator must first admit the original run, successful build job, actual checkout, artifact ID and archive hash using official GitHub metadata.

Receipt shape:

```json
{
  "sourceSha": "full reviewed consumer SHA",
  "producerSha": "full matching sb3-creator pin",
  "arraysValuesSha": "full matching arrays-values pin",
  "sdk": {
    "version": "4.2.1",
    "pxtVersion": "13.2.1",
    "targetCommit": "2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea",
    "targetSha256": "SHA256 of exact original SDK target.json",
    "workerSha256": "SHA256 of exact original SDK pxtworker.js"
  },
  "build": {
    "runId": "numeric official run ID",
    "jobId": "numeric successful official build job ID",
    "artifactId": "numeric original artifact ID",
    "runUrl": "https://github.com/CrispStrobe/brickwright-lite/actions/runs/RUN_ID",
    "conclusion": "success",
    "checkoutSha": "same reviewed consumer SHA",
    "archiveSha256": "SHA256 of original acquired ZIP"
  },
  "assets": {
    "gui.js": "SHA256 of this original extracted artifact member"
  }
}
```

Inventory every served JavaScript asset and the Arcade SDK target.json using its URL path relative to `PROOF_URL`, including lazy chunks. The original comparison SDK must match the admitted target and worker hashes. The runner refuses an unlisted or different actual response body. Keep the receipt, acquisition mapping, source paths and raw reports private when they include local operational data. Public acceptance records should link the official [Actions runs](https://github.com/CrispStrobe/brickwright-lite/actions) and reviewed source, with the exact tested pins and boundary.

## Actual user journey

1. Open the owned MakeCode project using Code actions; choose Arcade and use **To blocks**. Observe real random fraction, min/max/randomRange, percent chance, clamp, settings read/write and source-while blocks.
2. Run via green flag. Verify the Stage's actual presented sprite/HUD pixels against the original simulator. Use the visible controller **A**; score and sprite position change.
3. Stop. Scroll the actual Arcade toolbox to clamp, drag a new reporter into the workspace, then delete the selected orphan through the keyboard.
4. Edit the actual clamp maximum number from 10 to 12. Change the actual math menu from min to max. Open the real settings read menu and select String, then StringArray. Verify available choices and resulting fields through read-only observations.
5. Run the edited project and use A. Stop. Use **From blocks**, then ordinary CodeMirror keyboard input to change the stored Unicode text to PLAY. Use **To blocks**, run and use A again.
6. Use **File → Save to your computer**. Close the browser context; load the actual downloaded SB3 through **File → Load from your computer** in a fresh context. Run and use A.
7. Use the actual MakeCode Arcade export action. Compile and run those exact downloaded files in the original SDK. Import the actual exported file back through the UI, reconstruct blocks, run and use A.

All VM and Blockly accesses only observe variables, errors, field coordinates, types and actual presented canvas pixels. They never load a program, create a block, call an Arcade primitive, teleport a sprite, set a field, dispatch a green flag, replace entropy or change the clock. Input actions use real page controls, mouse/keyboard and file choosers. Original-SDK controller inputs belong to the separate reference comparison, not the production user flow.

Math.random consumes real entropy. It is checked only for `[0,1)`; independent random draws are never required to match. Equal randomRange bounds and percent chance 0/100 provide deterministic visible-state assertions. The fixture deliberately keeps random samples out of the Stage pixels.

## Review and next steps

The owned fixture preflight is `test/arcade-numeric-authoring-fixture.test.mjs`. It checks ordinary source conversion admission and original simulator behavior for baseline and edited variants with and without A. It is not a substitute for running the full IDE journey.

Execution writes `current.json`, exact saved/exported files and a success or failure screenshot under `BW_NUMERIC_GUI_REPORT_DIR` (default `test-results/arcade-numeric-authoring-gui`). Retain failures. Add an enabled hosted workflow step only after reviewing the script and exact build receipt integration. A failure identifies an actual UI step to fix; do not substitute a component proxy or direct VM operation.
