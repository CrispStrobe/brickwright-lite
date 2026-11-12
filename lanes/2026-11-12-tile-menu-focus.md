# Preserve submenu focus during rapid selection

Status: CLAIMED. Owner: editor delivery maintainer.

A deferred keyboard submenu focus can overwrite a newer focus selection. Own the
shared menu component and its mirrored package copy, plus focused menu keyboard
controls. Preserve keyboard opening, submenu navigation, accessibility and all
existing editor actions. Include a control that opens a real submenu, moves focus
before the scheduled callback and proves the newer focus is retained; also prove
normal keyboard opening still focuses the first item. Preserve the original
browser failure and verify the affected tilemap journey on a qualified build.
Do not modify thresholds, unrelated editors, pins or workflows.
