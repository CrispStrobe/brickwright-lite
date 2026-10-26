# Screw clutch: bound transmitted load after recognized slip

Status: CLAIMED — continuation of the bytecode/files/crane work in #1415.
Owner: Codex, user-authorized Robot Lab gap closure.
Base: `59728c3aa125c97bd466663adb2d17672c4a32fc`.

The screw coupling recognizes sustained overload using its existing averaged
load and clutch-force threshold, but still derives spindle reaction torque
from the uncapped slider reaction after that slip branch runs. A bounded mock
of the actual source demonstrates transmitted torque above the configured
clutch equivalent. This establishes a source contract mismatch; it does not
establish the cause of the crane's reverse-only launch.

Scope: only `overlay/scratch-gui/src/lib/bw-sim/physics/screw.js`, focused pure
source controls in `test/bw-sim-screw-clutch.test.mjs`, narrowly necessary
existing linear-actuator regressions in `test/bw-sim-linear-actuator.test.mjs`,
the screw-clutch explanation in `docs/ROBOT-LAB-ARCHITECTURE.md`, and this claim.
Implement a bounded transmitted-load rule after recognized slip. Preserve the
existing averaging interval, slip threshold, shaft sign, efficiency, end-stop
and reversal behavior, and checkpoint state. Do not change physics constants,
solver iteration counts, motor targets, time limits, dependency pins, workflows,
model registries, shared panes, native or API code. No other physics file is
claimed.

Merge this claim before implementation. Use actual-source pure positive,
transient, overload, signed-reversal and restoration controls with meaningful
mutations. Require clean affected hosted actuator and crane/Jolt qualification,
independent retained-original review without producer imports or successful-case
replay, every enabled exact-head check and normal matched-head landing with
reviewed/predicted/landed parents and tree. Preserve the original crane failures
and every existing motion/accuracy assertion. Broader launch-cause or physical
calibration claims require their own observed evidence.
