# Consistent editor workspaces and remaining menu coverage

Owner: editor UX maintainer. Status: SOURCE IMPLEMENTED; qualification pending in PR #1536.

Implement the requested editor UI pass: compact Pixel foreground/background
colour controls and palette popover; a single horizontally scrollable Paint
command row with Fill/Outline first, helpful numeric-control labels, a single
scrollable tool column, and genuinely regular polygons. Preserve authoring,
selection, save, undo and drag-modifier semantics except the requested correction
from elliptically stretched polygons to symmetric geometry.

Extend menu access for Robot Lab, vector/costume, sound and Circuit using actual
existing callbacks and explicit active-editor/currentness guards. Reuse Robot
Lab's existing action descriptors and Popup visual/keyboard design for Code and
FPGA. Replace FPGA example/action button walls with selectors and a few primary
actions; hide explanation prose behind labelled information controls while
keeping failures, safety boundaries and results visible.

Own the affected GUI editor components/containers, Paint toolbar/shape UI and
geometry helper, shared menu/action helpers, labels, mirrors, focused controls
and affected hosted browser journeys. No physics, firmware, compiler, simulator,
history service, provider admission, dependency pin or release/event changes.
Circuit supplier UI changes require a separate claim in the owned CUI repository;
no hidden Lite copy or silent pin move. Coordinate exact shared owner hunks.

Qualification: source routing, layout, symmetric geometry and currentness
controls; hosted affected browser/build checks before matched-head product merge.
Use the existing bounded shared-VPS policy; no large local build or SDK install.

Checkpoint `276245968d1` implements this scope. Continue with
[the editor UX handoff](../docs/EDITOR-WORKSPACE-UX-HANDOFF.md); hosted affected
browser/build checks and separately qualified Circuit adoption remain pending.
