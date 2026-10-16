# Custom loop block media follows the current editor theme

## Claim and observed gap

Proposed narrow editor ownership contract. Merge this claim before source
implementation. This repairs the displayed loop arrow of VM-generated extension
blocks; it changes no program or VM execution semantics.

The pinned VM generates a custom loop block image using
`./static/blocks-media/repeat.svg`. The frontend publishes that image beneath
the theme directories `blocks-media/default` and `blocks-media/high-contrast`.
The bare image URL therefore fails when an imported game displays custom loop
blocks. A request failure is a real editor gap, even when the blocks themselves
load. Keep that failure; serving a test-only resource alias is not a fix.

## Owned source surface

- The current extension block registration call in
  `overlay/scratch-gui/src/containers/blocks.jsx` and its tracked integrated
  mirror, only to pass the workspace's actual configured media location.
- The extension theme helper in
  `overlay/scratch-gui/src/lib/themes/blockHelpers.js` and its tracked
  `packages/scratch-gui/src/lib/themes/blockHelpers.js` mirror. Add an owned
  overlay for the existing helper if necessary.
- A small adjacent pure presentation helper if separating the loop-image
  adjustment makes the existing theme behavior clearer.
- Focused controls, the affected visible editor/theme checks and documentation.

Other owners retain their importer, graphics, runtime, supplier, workflow and
packaging surfaces. No dependency pin or global VM-generated JSON change belongs
here. Preserve normal headless VM use without any GUI dependency.

## Required implementation

Use the GUI's actual media setting, including its deployment base path and
current theme. The existing GUI computes that setting from
`themeMap[theme].blocksMediaFolder`, and remounts the Blocks workspace when the
theme changes. The extension-registration/theme boundary is the appropriate
place to adapt the known VM loop-arrow field before defining editor blocks.

Bind the change to the actual generated loop-arrow JSON shape and its existing
legacy image URI. Change only that presentation field. Preserve the block's
opcode, sockets, mutation, text, all non-image fields and third-party icons.
Do not mutate the VM's retained block descriptions or store a themed image path
in the user's program. Unknown or unrelated image fields retain their existing
behavior; their URLs must not be rewritten by a broad suffix rule.

Apply the media correction for the default theme too. Preserve existing
extension colors and category/menu icons for default, dark and high-contrast
themes. A theme switch must rebuild both workspace and flyout loop images from
the current media setting; stale closures must not keep an earlier theme path.
Do not introduce loop images into dynamic blocks that do not currently have
that field, or expand dynamic block semantics as part of this repair.

No static default-only image path, duplicated build asset, server fallback,
network-error filter or resource whitelist may replace the current theme
binding. Preserve public source mirrors and the existing integration flow.

## Acceptance

1. Pure controls use real generated loop-arrow shapes and the actual theme
   helper. Check default, dark and high-contrast paths, a nonempty deployment
   base path, immutable source JSON, and every remaining field's preservation.
   Retain unrelated icons, malformed/lookalike fields and dynamic blocks.
2. Exercise the actual registration call and a real default → high-contrast →
   default workspace rebuild. Verify both existing blocks and flyout images use
   the current configured media path and actual correct image bytes.
3. Use a fresh official frontend artifact from the source candidate for a
   visible import of an affected current game. Retain the full loaded program
   and artwork, actual image requests, screenshots and every error/refusal.
   Show that no request goes to the missing bare loop-image URL, and that the
   themed resources are served from the official artifact with their exact
   bytes. Do not reuse an older artifact's success as this fix's evidence.
4. Preserve Code, save/reopen and execution behavior. Source controls alone do
   not qualify the visible editor, guest behavior or full game compatibility.

This lane closes a presentation/resource defect only. Device-load observation,
CLI package resolution, generated browser code provenance and remaining Arcade
conversion gaps keep their separate gates. See the
[Arcade handoff](ARCADE-AGENT-HANDOFF.md).
