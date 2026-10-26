# Fixed-step physics observations for the crane investigation

Status: DONE (implementation) — combined hosted qualification and landing pending.
Owner: Codex, user-authorized Robot Lab gap closure.
Base: `1f9316df8a53d8c049b116faa74ca31b31d4d069`.

Retained crane observations show actuator-loop closure diverging before the
visible launch. The existing 30 Hz capture cannot identify the intervening
native steps. Preserve the original failures and expose complete existing
fixed-step observations without changing the integration or solver.

Scope: `overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js` for opt-in
completed-fixed-step subscriptions and copied current contact-pair/screw-state
readers; matching tests in `test/bw-sim-physics-core.test.mjs`,
`test/bw-sim-linear-actuator.test.mjs` and `test/bw-sim-crane.test.mjs`; the
observation explanation in `docs/ROBOT-LAB-ARCHITECTURE.md`; and this claim.
Use the current pinned native getters. No engine/dependency/pin adoption,
contact listener or collision-filter change, worker protocol, shared pane,
model registry, physics coefficient, iteration count, timestep, motor target,
existing acceptance limit or replay is authorized by this diagnostic claim.

Merge the claim before implementation. Observers must be off by default,
bounded by the test consumer, removable, cleared on disposal and separate from
physical checkpoint state. Require actual hosted observed/unobserved native
trajectory equality, subscription/disposal controls, positive actual contact
readback, and affected actuator/crane qualification with every enabled exact-head
check. Independently audit retained originals without producer imports or
successful-case replay. Merge normally with an exact head guard and verified
predicted/landed parents and tree. These observations do not themselves fix or
qualify the launch, and do not establish physical calibration.

Implementation provides completed-step subscriptions, current native body-contact
pairs and copied screw state/target readings. The crane keeps its existing 30 Hz
record and adds a bounded 5 ms window with native contacts, effort and direct
clutch state. Native observed/unobserved trajectory equality, contact readback,
reentry/disposal controls and driven slip-state controls are hosted gates; they
have not been run locally. Existing solver parameters and motion limits remain
unchanged, and the launch cause remains unqualified.
