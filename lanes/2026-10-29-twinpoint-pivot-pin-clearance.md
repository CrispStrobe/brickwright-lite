# Twinpoint pivot-pin axial clearance

Status: SOURCE CANDIDATE — pure construction controls pass; fresh affected
native and GUI/worker/save-reopen qualification and exact-head CI are pending.
No repaired-physics acceptance or landing is claimed.
Owner: Codex, user-authorized ordered Robot Lab continuation.
Claim merged in PR #1560 at `da720b01fcc2b737b65859bf1174277f0578daa7`.
Implementation starts from that exact landed tree. Intervening main changes
are not treated as independently qualified by this model's construction tests.

The candidate changes only the declared Twinpoint generator block and generated
pin placement, with its new focused test and construction note. Seven pure
controls pass, including regeneration, topology, stock-profile retention and
deliberate counterexamples. The original programme and all qualification guards
remain unchanged. See [the construction boundary](../docs/ROBOT-LAB-TWINPOINT-PIN-CLEARANCE.md).

Own a narrowly scoped successor for the Twinpoint model's central pivot pin.
The current 2L frictionless pin has zero nominal axial gap to the two crank
faces. Evaluate the existing stock 3/4 pin with its connector centre preserved,
without suppressing collisions or changing the original programme or criteria.
This is a construction candidate, not a causal or hardware-accuracy claim.

## Owned path envelope

- `scripts/adapt-seven-machines.mjs`: only the `id === 'twinpoint'` adaptation
  block. Preserve its reviewed original-input hash, every other model branch,
  attribution, validation and serialization.
- `overlay/scratch-gui/static/sim-lab/models/twinpoint.ldr`: the reproducibly
  generated Twinpoint output; only `hingeP`'s stock part and required axial
  placement may change.
- `test/bw-sim-twinpoint-pin-clearance.test.mjs`: a new focused source and
  construction regression, including connector, retention and regeneration
  counterexamples. Reuse the existing programme and qualification guards.
- `docs/ROBOT-LAB-TWINPOINT-PIN-CLEARANCE.md`: the construction and qualification
  boundary for this candidate.
- This lane record, `lanes/2026-10-29-twinpoint-pivot-pin-clearance.md`.

Do not edit the compiler, parser, core, other part metadata, catalog generator,
shared qualification or GUI-consumer registries, other models, contact policy,
material settings, solver, motor commands, timestep, iteration counts, dependency
pins, programme, original captures, judges or acceptance limits. These shared
regions have other owners. If a required registration or shared generated record
needs a change, obtain the owner's explicit delegation and amend the scope first;
do not bypass regeneration or silently take the file.

## Candidate and source proof

The candidate replaces `hingeP`'s `3673.dat` with the already catalogued
`32002.dat`. Move its origin by +5 LDU along its unchanged local X axis so the
new pin connector at local X = -5 remains at exactly the old connector centre.
The pin's ID, direction, frictionless connector and both connected thin links
remain the same. Use the stock part's existing mass and collider metadata.

Independently verify both complete 10 LDU hole engagements, the collar and lip
seating in the existing 2 LDU counterbores, both retaining ends, all intended
connector matches, the five-joint topology, model roles and all 117 pieces.
The source geometry supports a nominal 30 LDU pin span across the two thin
links. This does not establish pull-out force, manufacturing tolerances or a
watertight solid-clearance proof. Stop if either link cannot be retained.

The nominal gap to each crank becomes 2 mm, which equals the existing
speculative-contact distance. Pair processing may therefore remain; absence
of contact callbacks is not an acceptance criterion. Do not shrink a collider,
exclude the crank/pin pair or substitute a predicted motion to obtain a pass.

## Qualification and landing

Before source implementation, normally merge this scope after every enabled
claim-head source-policy/docs check succeeds and verify the actual merge tree
and parents. Preserve other owners' source exactly.

Then prove repeatable adaptation, unchanged connections and existing construction
checks. Qualify the actual changed model at its bound source and adopted package
with the full unchanged 90-second programme and original 0.55 mm closure limit,
finite motion, hub completion and other existing guards. Preserve every failure;
no tolerance, horizon, programme or baseline relaxation is allowed. Prior results
for the old pin do not qualify the candidate. A pass would qualify the changed
construction within its observed boundary, not prove the sole cause of the old
failure or establish hardware accuracy.

Follow the operator's selected-fast-tier queue policy: no `ci:full` request,
dispatch or guard waiver. Require all actually enabled final-head checks and
fresh affected native and GUI/worker/save-reopen acceptance before normal
matched-head landing, with declared skips and exact source/tree provenance.
Coordinate required shared records with their owner. The overall physics and
final-documentation work remains open.
