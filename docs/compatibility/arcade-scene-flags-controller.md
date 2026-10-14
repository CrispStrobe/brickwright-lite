# Scene flags and controller user events

Status: scoped implementation checkpoint; original/native and authoring qualification pending.

This continuation uses the merged native text-dialog claim for controller gating and scene composition, the class/reference claim [#889](https://github.com/CrispStrobe/brickwright-lite/pull/889) for typed scene authoring, and the scheduler claim [#881](https://github.com/CrispStrobe/brickwright-lite/pull/881) for scene/render lifecycle. It preserves the existing scene-reference kind and actual source timing.

## Source contract

The selected MIT Arcade SDK defines `scene.Flag.NeedsSorting = 1`, `SeeThrough = 2`, and `IsRendering = 4`. A Scene starts with flags zero. Rendering returns immediately if IsRendering is set; otherwise it sets that bit, draws its previous scene when SeeThrough is set, conditionally sorts scene sprites when NeedsSorting is set and clears that bit, draws sprites, then clears IsRendering. Changing a BaseSprite's z sets NeedsSorting on the *current* scene, including when that sprite belongs to a suspended scene. An unchanged z does not set it. Camera code does not own another Scene flag. Popping a scene and destroying it are distinct SDK operations.

`controller._setUserEventsEnabled(enabled)` controls user button events. Physical held-button state and controller connection changes remain available; disabled button events use the SDK's separate system-event path. Exposing only an inert Boolean field or suppressing all controller events does not meet this contract.

## Ownership and authoring

This slice owns three native/Code/Blocks operations: read flags from a Scene reference, set its flags, and enable/disable user controller events. It owns narrowly coordinated Scene renderer/order, sprite-z dirty flag, controller gate, metadata, source lowering, exporter, and focused test hunks. Matching producer additions use a separate branch preserving the reviewed array-copy vocabulary. Other SDK object bridges, array conversion, browser observer repairs, source event-bus/multiplayer registrations and unrelated GUI/device lanes remain with their owners.

Implementation paths are the Arcade extension's `index.js` and new scoped helpers, `arcade-translate.js`, `export-arcade.js`, the shared producer `src/utils/arcadeDialect.js`, and new focused tests. Native inputs must retain real Scene ownership and live Boolean/numeric values. No new generic value kind, frame delay, source pruning or renderer shortcut is part of this contract.

## Required qualification

Actual selected-original and native controls must cover raw flag read/write and compound evaluation order; z dirtying and conditional stable draw order; parent visibility and all screen pixels; IsRendering suppression/reentrancy; saved scene references through push/pop; gate disable/enable with real button edges and held-state queries; system versus user callbacks; cancellation/restart/load; Code, original export/reimport and same/fresh SB3. Actual production GUI authoring remains separately required.

The multiplayer custom-splash project also has event-bus, multiplayer controller registration, console inspection, and a remaining namespace call diagnostic. This slice does not promote that whole project or change the corpus census. Unsupported operations retain diagnostics.
