# Arcade editor startup dependency boundary

The Costumes tab currently imports the full tilemap editor to decide whether to
show its Tile maps button. That editor imports the MakeCode TypeScript parser,
although finding an original target's modern or legacy tilemap command requires
no decoding. The full painter still needs its existing decode and validation path.

After the claim merges, introduce a pure block-presence query and use it for
this visibility decision. Preserve original-target filtering, modern and legacy
command detection, malformed and connected-data visibility, the active painter
state and the loaded Arcade-extension fallback. Do not change map editing, saves,
resource identity, undo/redo, sprite placement or the startup budget.

Acceptance: compare the lightweight query against the existing finder over real
block graphs including valid, malformed, computed, legacy, clone-only and empty
projects; run the unchanged hosted P17 emitted-byte gate and matching painter/UI
journeys. Source dependency separation alone is preparation, not bundle evidence.
