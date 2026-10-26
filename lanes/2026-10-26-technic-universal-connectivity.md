# Universal-joint structural connectivity diagnostic

Status: CLAIMED — merge before implementation.
Owner: Codex, nine-Technic-intake follow-up.
Branch: `docs/technic-physical-connectivity-claim-20261026`.
Base: `bafc9f91a`.

The loose-part traversal counts ordinary joints and ropes but omits universal
joint couplings, even though those couplings physically retain both fork bodies
at their pivot. A correctly connected double-Cardan intermediate shaft is thus
reported as disconnected. Preserve this actual source-level counterexample.

Scope: only the loose-group adjacency construction in
`overlay/scratch-gui/src/lib/bw-sim/mech/compile.js`, a focused
`test/bw-sim-universal-connectivity.test.mjs`, its GUI dependency-scope row, and
this claim. Add only the structural connectivity of existing validated
`universalJoint` body pairs. Do not treat gear meshes, chains or angle-ratio
constraints as bearings, suppress genuine detached parts, add rescue welds,
change physical constraints, collision handling, solver settings, tolerances,
dependency pins, shared session/worker/API protocols or other owners' code.

Require a real single and double Cardan assembly to retain its intermediate
shaft, physical fork removal to restore a loose diagnostic, an unrelated loose
part to remain diagnosed, and an angle-only coupling to grant no structural
support. Existing mechanism regressions and all enabled exact-head hosted checks
must pass before a normal matched-head landing. Carry the qualified source into
the nine-model intake normally, preserving original diagnostics and reports.
