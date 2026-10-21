## Proposed 386 Board HDD adoption handoff — 2026-10-16

PROPOSED / DOCS ONLY — Codex x86, branch
`docs/386-board-hdd-handoff-20261016`. Own only this ledger and
`docs/X86-NEXT-LANES.md` for the
[serialized adoption handoff](docs/X86-NEXT-LANES.md#proposed-386-board-hdd-adoption-handoff).
This proposal reserves no implementation or dependency surface. A recorded
handoff from the existing adoption owners and a merged implementation claim
must precede any supplier, package, lock, generated output or shared runner edit.

Preserve the STM32 adoption owner in PR975 (merged claim PR969), including its
Board/SB3 pins, specifications, locks, notices, generated outputs and STM32
`debug-runner` changes. PR975 is explicitly not for agent merge. Preserve the
CUI adoption owner in PR965 (merged claim PR961), including its lock ownership;
coordinate one serialized dependency writer. This proposal authorizes neither
merging those PRs nor changing their pins or sequencing.

Next work must select an exact qualified Board revision containing PR623's
master-disk snapshot API, retain the qualified PR625/PR627 CLI persistence
boundary, and review the complete installed blob graph and component diff.
Compose the pending x86 consumers without dropping STM32, SB3 or CUI changes;
qualify genuine hosted GUI download and fresh chooser reload through that exact
supplier. Supplier checks, source controls and historical CLI results do not
qualify an installed consumer. No source, pin, lock, notice, workflow or package
change belongs to this docs-only proposal; all other owners retain their lanes.
