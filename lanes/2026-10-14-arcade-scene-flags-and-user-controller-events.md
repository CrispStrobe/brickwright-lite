## Arcade Scene flags and user controller events — 2026-10-14

CLAIMED continuation — existing merged native text-dialog, PR889 reference and
PR881 scene lifecycle envelopes. Contract:
[Scene flags and controller events](docs/compatibility/arcade-scene-flags-controller.md).
Own narrow Scene flag getter/setter, real conditional render ordering/visibility/
guard, current-scene z dirtying and controller user-event gating hunks, with
matching producer and original/native/Code/export/SB3 controls. Coordinate shared
index/converter/exporter hunks; preserve SDK object, Arrays, browser observer and
independent GUI/device owners. Event-bus, multiplayer registration and console
inspection remain separate followups. No source pruning, inert flag adapter,
render bypass, guessed delay or whole-project promotion.
