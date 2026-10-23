# Robot Lab measurement refinements

CLAIMED — Codex, continuation requested by the user. Isolated branch
`lane/robot-lab-measurement-refinements-20261023`, base `0e11f66d5`.
This is the same owner's follow-up to live measurements PR1255. Preserve that
PR's running qualification; implement on an isolated stacked branch after this
claim merges, then compose its qualified parent normally before landing.

Own refinements inside `lib/bw-sim/measurements/`, the measurement panel and
narrow measurement integration in `sim-lab-pane.jsx`, focused measurement and
browser controls, project-persistence controls, and measurement usage docs.

A source-level analytical boundary already reproduces preset rejection when
350 valid part IDs produce an 8,071-character joint binding beyond the existing
4,096-character bound. Fix compact deterministic binding identity, preserve
legacy saved definitions and target-change refusal, and keep validation limits.
Improve target descriptions and publish final paused readings without leaving
sub-sample motion stale. Add a configured model-mass reading with explicit
membership rules that exclude world/mat scenery and count split motor bodies
exactly once. No additional solver or teaching-library dependency is needed.

Require independent digest/identity controls, legacy project roundtrips,
large-assembly admission and negative retarget controls; model-mass checks
against independent known totals; actual Jolt/worker parity and normal
run/pause/reset/replay and browser add/remove/model-switch behavior. Preserve
all original failures, deadlines, physical assertions and resource bounds.
Every enabled final-head check and affected clean guest qualification precede
matched-head landing. No core, compiler, model, pin, firmware or workflow edits;
no hardware-accuracy or general timing closure claim. Keep raw evidence private.
