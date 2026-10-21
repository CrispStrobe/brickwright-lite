## Arcade classes and mutable object semantics — 2026-10-13

CLAIMED — Codex Arcade class integration; claim PR889 is merged. Contract:
[classes and objects](docs/ARCADE-CLASS-AND-OBJECT-SEMANTICS.md).
Envelope: an explicit reference/descriptor helper alongside existing Arcade and
Arrays values; Arcade-only AST lowering and native object operations; scoped
shared dialect producer additions with reviewed pin adoption; Code/Blocks and
export/reimport authoring; tests and GUI closure records. Preserve other target
translators, independent device/arena work and the separately claimed frame
scheduler. No global scheduler hook is owned by this lane.
Check concurrent ownership before continuing the ordered implementation.
Constructor ordering, reference identity, alias mutation and original execution
must qualify before class admission; source parsing alone is insufficient.
