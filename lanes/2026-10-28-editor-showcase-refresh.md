# About — Our apps refresh

Status: IMPLEMENTED in an owned candidate; final hosted/main qualification pending.
Owner: Robot Lab/editor delivery coordinator.
Branch: `lane/editor-showcase-refresh-20261028`.

Continue T7 from the editor History handoff. The read-only Apple refresh found
one changed listing, CrispTuner, plus newer Apple copies of the CrispTuner and
Brickwright icons. Refresh the listing and CrispTuner artwork from Apple's
records. Preserve Brickwright's existing icon and mark that local selection so
future refreshes keep it. No listing descriptions are invented.

Scope: `overlay/scratch-gui/src/components/menu-bar/app-showcase-data.js`,
`overlay/scratch-gui/static/app-showcase/crisptuner.png`, and this claim's status.
Use the existing read-only refresh script and its existing tests. No release,
App Store Connect write, TestFlight upload or other owners' menu changes.

Done after local catalogue/asset validation, all required hosted code checks,
matched-head source merge, and the following main run. Refresh again before a
later release; this source update is not a release authorization.


Implementation (2026-10-29): the read-only Apple refresh checked19 apps,
9 App Store entries and18 public TestFlight links. CrispTuner now has its
current App Store link and artwork. Brickwright keeps its exact existing icon,
marked `icon: 'local'` so future refreshes preserve it. Both checked PNGs are
128x128; all four existing catalogue/rendering/refresh controls pass. No Apple
records, releases or TestFlight builds were changed. This source will join the
combined delivery candidate; final hosted checks and main qualification remain.
