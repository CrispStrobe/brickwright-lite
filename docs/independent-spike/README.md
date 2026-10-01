# Independent SPIKE simulator

Scratch and Brickwright `DEVICE SPIKE` programs now use the BSD-3-Clause independent
backend in `lib/spike-sim/independent-backend.js`. SPIKE 3 imported programs still
lower to the existing native dialect/Scratch execution path. This backend contains
no Pybricks imports, generated runtime code, assets, dependencies or build steps.
Pybricks Python keeps the separately audited WASM backend.

`VirtualSpikeHubState.backend` and `.motors` are the **same object**. Motor positions,
sensor readings, IMU, buttons and hub outputs remain in the existing shared hub.
The arena owns stepping while native programs run; standalone callers may use
`backend.pace(ms, {realtime})`. Physics uses fixed 1 ms quanta, with fractional time
carried forward. `createSpikeBackend({kind, hubState, arena, ...})` selects either
the existing native controller or the lazily loaded Pybricks adapter. During a
Python run the adapter claims exclusive motor/clock ownership, mirrors positions
at simulated ticks, advances the same arena, and feeds its sensors back. The pane
frame clock yields to that owner. Stop, failure and completion release ownership;
reset and world selection await cancellation before changing the world.

The GUI now keeps a **single arena mounted** for both choices. Open a SPIKE
program in the Code tab and choose **SPIKE arena**, then use **Simulator backend**:

- **Brickwright · Scratch / native** runs Scratch blocks, `DEVICE SPIKE` and
  imported SPIKE 3 programs through the native controller. Use the arena's Start.
- **Pybricks · Python** lazily loads the audited runtime and shows its hub/program
  output below the same arena. The Code tab's Run on SPIKE action selects this
  choice automatically and retains pending programs during loading.

Switching stops the active VM/Python program, waits for cancellation, preserves
the world object and pose, releases pressed GUI buttons, and prepares a fresh
native program start. The next native Start resets the mission as usual. Manual
step/reset and 2D/3D remain available. In Python mode the native Start is disabled;
Python runs from its own Run button or the Code tab. A failed optional runtime can
be left immediately by choosing Brickwright. English and German labels are included.

The independent agent received functional contracts and synthetic observations,
without inherited conversation history or original behavioral implementations.
Isolation was **instruction-based** because kernel namespace isolation was denied.
The coordinator audited all actual tool calls. See [the independence record](INDEPENDENCE.md),
[contract](CONTRACT.md), [private execution archive](https://github.com/CrispStrobe/brickwright-firmware-private/tree/audit/independent-spike-20260930/audits/independent-spike/2026-09-30),
and [private licence evidence](https://github.com/CrispStrobe/brickwright-firmware-private/tree/audit/independent-spike-20260930/audits/independent-spike/2026-09-30/evidence/licences.json). Retained hub/arena/compiler/protocol
code is licensed infrastructure, outside the independent controller authorship claim.

| Tested scope | Observable behavior |
|---|---|
| Motors | Signed degrees, absolute targets, speed/time control, device speed limits, acceleration/deceleration, reversal and concurrent ports |
| Stop actions | Configured defaults, brake/coast deceleration, persistent hold, hard disconnect/reset cancellation |
| Load/stall | Explicit synthetic partial load and locked shaft, finite position completion with `stalled`, continuous stalled command |
| Scheduling | Shared simulated time, concurrent waits, abort signals, replacement, exactly-once settlement, disposal, paced execution and ownership handover |
| Sensors | Shared arena colour/reflection/raw RGB, distance mm, force, IMU and buttons; copy isolation and mismatched-device errors |
| Outputs | Matrix 0..9, centre light, volume, distance lights, timed beeps/waveforms and sound cancellation |
| Program integration | Real Scratch VM, shipped extension, BLE and Classic adapters, native `.bw` missions, imported SPIKE 3 Python, same arena for Pybricks Python |
| Oracle | Fifteen matching motor scenarios and twelve further speed-sweep scenarios, plus normalized sensors/IMU/buttons/matrix/beep, observable failure/stop cases; fixtures pinned to shipped WASM hash |

Motor observations come from `probe-independent-spike-oracle.mjs`, using the
shipped audited WASM, explicit acceleration 1500 deg/s² and speed limit 1110 deg/s.
The implementer received twelve initial scenarios; the coordinator added finite
command replacement and oversized-speed observations after implementation. Those programs are identical external
command schedules, mapped onto each backend's public API, rather than internal
control algorithms. Sensor comparisons explicitly normalize units and colour ids.

Position comparisons allow 12° during motion, 15° during reversal, and 2° after
settling. Transient speeds allow 110°/s because the oracle's reported speed lags
shaft angle observations; settled finite-motion and original low-speed steady comparisons use 5°/s.
The expanded continuous-speed sweep uses the existing 110°/s moving-speed bound. Finite completion
bounds allow 150 ms beyond the oracle's sampled transition interval. Synthetic
physics checks additionally test signs, limits, target settlement, deterministic
chunking and shared state. These tolerances detect disabled motion and removed
acceleration; a corrupted sensor read also fails comparison. The test diagnostics
record mutation failures, and existing arena checker mutations remain tested.

Intentional differences and limits:

- This is a tested functional subset, **not complete Pybricks equivalence or
  physical SPIKE accuracy**. Pybricks supplies behavioral observations on
  Brickwright simulated hardware. No Pybricks Python interpreter is provided by
  the native backend; Python-only programs use the retained WASM.
- Native target/time trajectories use an independent controller and may finish
  exactly on target; oracle readings settle about 1° short in the supplied cases.
  Immediate zero-distance completion differs from the oracle's asynchronous done
  transition. Continuous native `done()` waits for its speed ramp; oracle `done()`
  may already be true. Native zero-speed timed tasks still wait their duration.
- Native coast travels farther than brake, and hold returns to its captured angle.
  In the shipped oracle's measured stop/coast/brake cases, travel coincides. Only
  eventual rest and action observability are compared for those scenarios.
- Medium motor device 48 now applies an independently authored synthetic shaft
  envelope of 950°/s while retaining the nominal 1110°/s API/percent scale. All
  fifteen original trajectories and twelve speed-sweep scenarios match the moving
  tolerances. The sweep covers negative and positive requests through ±5000°/s,
  with 60 samples through 2500 ms; maximum shaft-angle error is 4.812° and speed
  error is 81°/s. The oracle's reported high-speed velocity remains about 942°/s;
  exact velocity-estimator equivalence is not claimed. This measured envelope is
  specific to synthetic device 48; unmeasured devices retain their nominal bounds.
  Original failed observations remain archived, and removing the new envelope
  causes the unchanged trajectory comparisons to fail.
- Load/stall is a synthetic normalized control, not an electrical or torque model.
  Arena contact retains the existing wheel-slip model; it does not automatically
  lock the shaft. No measured load/stall equivalence is claimed.
- Sensors use the retained arena models without noise. RGB-to-colour classification
  is supplied by that arena; the backend reads its shared colour id. The normalized
  sensor comparison does not establish equivalence for arbitrary RGB surfaces.
- Error types, port attachment and validation are native API behavior. Native
  invalid pixels reject; the observed oracle ignores an out-of-range pixel. Native
  missing sensor reads fail immediately; an oracle missing-motor probe waited for
  attachment and was terminated by the coordinator, without an equivalence claim.
- Media-file sound playback, arbitrary REPL/Python, filesystem commands, unmodelled
  extension operations and full Python compatibility remain outside this contract.
  Unsupported tunnel statements remain explicitly recorded by the existing adapter.
  Beeps expose shared speaker state and an optional frequency callback; this change
  does not add native audio synthesis. Other Pybricks outputs beyond matrix/motors/
  speaker retain the existing bridge's coverage.
- Only one backend controls motors at a time. Native motor commands reject during
  Pybricks execution. The UI's shared-hub mode remains selected while attached.
  Clock ownership is cooperative, not a process security boundary.
- Finite acceleration changed a lesson's sensor sampling: its equality-at-20-cm
  wrong example happened to pass at 30%. The example now uses 60%, demonstrably
  skipping that reading, and the EN/DE hint accurately says equality can be missed.

Use Node 22 or newer. Prepare the repository's declared GUI dependencies through
its normal vendor/integration workflow for VM/pane tests; the independent backend
and controller tests themselves need no packages. No WASM rebuild is required.

```sh
export BW_SPIKE_EVIDENCE_DIR=/path/to/brickwright-firmware-private/audits/independent-spike/2026-10-01-relocation/evidence
export BW_SPIKE_REQUIRE_PRIVATE_EVIDENCE=1
node scripts/probe-independent-spike-oracle.mjs
node scripts/probe-independent-spike-sensors.mjs
node --test test/independent-spike-controller.test.mjs test/independent-spike-backend.test.mjs
node scripts/verify-independent-spike.mjs
node --test --import ./scripts/lib/register-gui-scope.mjs \
  test/spike*.test.mjs test/virtual-spike*.test.mjs \
  test/pybricks*.test.mjs test/independent-spike*.test.mjs
```

The absence gate renames only this worktree's `static/pybricks-sim` directory for
the child test run, restores it in `finally`, and records a TAP log and restoration
result. It must run separately from oracle/Pybricks tests. Evidence was produced
on Node 22.14.0 using existing prepared GUI dependencies, linked read-only by
convention in this worktree, plus the already-declared `three@0.186.1` package
installed locally for pane tests; no other worktree was modified.

Validation results and exact artifact hashes are in the private archive
(`evidence/validation.json` and `evidence/independence-audit.json`). **317 broader SPIKE checks passed before the speed-envelope followup**; the final absence-gate count is recorded in
that validation file. Full-suite and assets-absent TAP logs preserve
coverage and mutation diagnostics. No changes were posted to Pybricks upstream.

GUI validation also renders the actual React components with the real WASM,
covering pending loader cancellation, missing assets, rapid selection, button
release, shared IMU readout and world preservation. The full integrated GUI webpack
build is checked, and `scripts/verify-spike-simulator-browser.mjs` runs the shipped
application in headless Chromium with software WebGL. It completes a reference
Scratch mission, drives the same world with Python, cancels a Python loop by GUI
selection, renders the 3D view and completes a native mission with runtime asset
requests forced to 404. Service workers are blocked in the browser proof so cached
optional assets cannot hide the missing-assets condition. Screenshots and receipts
are in the private archive under `evidence/gui-browser/`.

```sh
npm run integrate
npm run build:gui
node scripts/verify-spike-simulator-browser.mjs
```

The browser script accepts `BW_SPIKE_BUILD_ROOT` for an alternate build location.
All capture scripts require `BW_SPIKE_EVIDENCE_DIR` outside the public checkout;
there is no default output path into this repository. It needs the declared Playwright dependency
and a matching Chromium installation. Local evidence used isolated pinned
`bw-board`, `bw-circuit-ui`, `three` and `@xterm/xterm` dependency copies in this
worktree; no manifest or lockfile changes were needed. Build outputs/cache were
moved to `/tmp` after the shared volume filled. An initial build also wrote the
shared prepared webpack cache through a dependency symlink; that symlink was
replaced with a local cache before subsequent builds. Other worktree sources and
tracked files were not changed.

Raw evidence, JSON fixtures, transcripts, screenshots and execution logs are
excluded from the current public branch and archived privately. Previously pushed
commits may remain accessible through GitHub retained objects; this relocation
does not claim to erase those copies. Public unit/integration tests run without
that checkout and explicitly skip private oracle comparisons. To require and run
all comparisons, provide `BW_SPIKE_EVIDENCE_DIR` and
`BW_SPIKE_REQUIRE_PRIVATE_EVIDENCE=1`; missing or invalid private fixtures fail
that run. The production native backend has no dependency on the archive.

On 2026-10-01, the post-relocation suite passed 317 checks with private comparisons
required, the absence gate passed 123 checks, and 12 focused GUI checks passed.
The arena now invalidates pending unit loads on unmount, preventing late scene
publication. The public evidence-path guard tests also passed. New receipts are
in the private archive under `2026-10-01-relocation/evidence/`.

The 2026-10-01 speed-envelope followup uses a fresh agent with no inherited
history. Its five actual shell calls ran through a verified bubblewrap filesystem
and network namespace wrapper. The coordinator audited all five calls; the tool
layer remained instruction restricted. The agent received only a functional
contract, normalized synthetic observations and a neutral pure-function scaffold.
The coordinator wired the authored function into continuous, position and timed
commands. Its operational transcript, five authored tests, wrapper, observations,
source hash and mutation receipt are private under `2026-10-01-followup/`.

The final post-envelope SPIKE suite passed **319 checks**, with private evidence
required and no skipped comparisons.
