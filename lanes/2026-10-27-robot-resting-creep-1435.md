# Robot Lab resting-frame creep — issue #1435

Status: CLAIMED — bind and diagnose the reported unpowered resting frame.
Owner: Codex, Robot Lab resting-frame lane.
Branch: `lane/robot-resting-creep-1435-20261027`.
Base: `7b4f2f84ac55e238bbb75663acbdc1e26f3d0358` (qualified floor #1445).

Own new fixtures under `test/fixtures/bw-sim/resting-creep/`,
`test/bw-sim-resting-creep.test.mjs`,
`scripts/verify-sim-resting-creep.mjs`,
`docs/ROBOT-LAB-RESTING-CREEP.md`, and this claim.
This first lane is diagnostic: no physics implementation is authorized by it.
A justified solver correction requires a separately coordinated scope extension.

Freeze the exact shipped Obliquity Orrery model and SDK/core identities.
Preserve the shipped raised-support mitigation; change only `base_rail_0` y
back to 200 in a test-only copy. Keep the original complete input alongside
any explicitly enumerated stripped-frame input. PR #1455 changes the shipped
model and is a separate owner's work: do not edit its model, program, catalogue,
qualification harness, Circuit verifier, session, or worker paths.

Before actual observation, define fixed-step clocks, finite duration, settling
policy, displacement/yaw/vertical/rocking metrics and acceptance interpretation.
Bind mass, COM and collider inputs; identify ordinary standing controls from
actual source rather than inventing the report's unnamed sixteen-model census.
Retain native transforms and report an absent reproduction honestly. No solver,
SDK pin, global floor/material/sleep policy, model mitigation or observer clamp
may change to obtain a passing diagnosis. Do not remove tiny parts opportunistically.

Read source and run pure controls locally. Actual engine runs use existing
hosted qualification infrastructure in the owned repository; any existing
actual-test entry point or workflow change needs coordinated scope first.
Acquire official originals once after metadata admission and audit with an
independent reader without producer imports or engine replay. Preserve failures,
existing floor eight cases, Sarrus judges and ordinary motion/rollback checks.
Merge this claim before implementation; source landing needs every enabled
exact-head check and a normal matched-head merge with parent/tree verification.
No physical-accuracy, general stability, release or performance claim.
