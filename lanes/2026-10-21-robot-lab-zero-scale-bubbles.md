# Hidden-stage speech bubbles during Robot Lab programs

CLAIMED — Codex, within the owner's Robot Lab model delivery. An actual browser
run captures `TextBubbleSkin.getTexture` calling `getImageData` on a zero-width
canvas while the Scratch stage is hidden. The unchanged method also reproduces
this deterministically at zero scale and clears its dirty flag before throwing.
The model programs and measured mechanisms pass; this renderer exception still
fails browser acceptance and must be repaired.

Own `scripts/apply-render-overlay.mjs`, a small pure patch helper under
`scripts/lib/`, and focused regression/browser controls. Use the existing
canonical renderer-overlay mechanism, preserving its lazy-font patch and the
pinned dependency versions. Preserve all other owners' worktrees. No direct
mutation of a shared dependency store, package-source bypass or caught-and-hidden
browser exception is permitted.

For an unrenderable scale, retain the current texture and pending dirty state;
render the current text normally when the stage becomes visible again. Verify
zero scale before and after a cached texture, text changes while hidden,
positive and flipped scales, normal texture reuse, idempotence and refusal of
unknown patch anchors. Retain the original failing source and browser evidence.
Rebuild through managed dependency provenance and verify actual native programs,
hide/show transitions, automatic project conversion and browser error capture.
CI remains mandatory before source/release integration.
