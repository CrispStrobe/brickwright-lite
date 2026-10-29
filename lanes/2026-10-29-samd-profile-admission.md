# Explicit SAMD software-profile admission

Owner: Codex SAMD continuation. Status: DONE — admission boundary and focused controls complete; GUI integration remains separate. Base: current Main at claim.

The qualified SAMD software profile is an authored simulation assembly, distinct
from the existing PyBadge board descriptor. Prepare a narrow, explicit profile
admission boundary for a future normal debugger route: validate the pinned
profile bytes and its closed source/input bindings, and refuse mismatches before
constructing an engine. Do not silently substitute the historical PyBadge model,
change existing default board selection, or claim physical-board equivalence.

Scope: a new focused profile-admission helper and tests under the debugger's
LabWired boundary, its necessary tracked mirror, and this claim. Preserve all
other owners' existing debugger work. Integration into the normal GUI route,
compiler/import/export, input/display interactions and installed acceptance
remain separate follow-up work until independently qualified.

Qualify exact approved bytes, corruption, missing/extra fields and wrong engine
identity with meaningful negative controls. Preserve successful guest originals;
no replay merely to inspect them. Run focused controls and enabled fast checks
before a normal matched-head landing. No ci:full label.

The browser-side reader verifies the pinned profile, exact source YAML bindings,
closed authored inputs and field unions. Synthetic positive and negative controls
pass; the retained original release profile also admitted with its exact digest.
No guest was replayed and no default board or product route was changed.
