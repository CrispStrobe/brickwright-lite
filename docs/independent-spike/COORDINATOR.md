# Coordinator record

Started from current origin/main `13d0912ce7fc044d2bf9303b66927c4b3e5cf054`
in `/mnt/volume1/code/lego/wt-independent-spike-sim`, branch
`feat/independent-spike-sim-20260930`. The user's macOS path was unavailable;
the equivalent mounted checkout was used. Existing worktrees and their dirty
files were preserved. No Pybricks upstream communication or contribution occurred.

Inspected the retained Pybricks host/bridge/pane, virtual hub/commands/motor model,
BLE/Classic adapters, arena/clock, actual extension command emission, native
runtime registry, imported SPIKE 3 route and existing tests. No Pybricks source
was needed for new controller implementation. Ran the shipped audited WASM as a
black-box oracle; motor fixtures pin its SHA-256. Probe scripts preserve exact
synthetic programs and measurements. The first missing-device probe waited for
attachment and was terminated after approximately four minutes; it was replaced
with bounded invalid-port/pixel observations, and no missing-device equivalence
is claimed.

Created a neutral handoff directory, functional contract, input/output-only
observations and a data-only scaffold. Started the independent implementation
agent with no inherited history. Namespace restrictions were denied, so the
instruction-based boundary and full transcript/tool-call audit are retained.
All controller changes, including follow-up configured stop defaults and beep
support, remained in that same role and access boundary. Integration errors were
resolved using functional descriptions rather than supplying original code.

The coordinator replaced the hub's model import with the independent backend,
retained the old import path as a re-export, and integrated backend selection,
shared clock ownership, tick-based Pybricks/arena feedback, safe reset/cancellation
and common display/speed units. The Pybricks bridge's matrix now uses hub levels
0..9; the Python pane still renders the host's native 0..100 snapshot. Corrected
the retained SPIKE 3 `motor.run` velocity conversion and the BLE motor end-state
mapping. Added parser mappings for configured stop actions and beeps. Existing
sensor/world/compiler/protocol implementations remain licensed infrastructure.

Validation found and resolved: old tests assuming instantaneous speed; initial
controller hold release under disturbance (fixed by implementer); a lesson wrong
example that happened to observe its equality threshold after acceleration changed
sampling (speed and EN/DE hint adjusted); and lost Pybricks cancellation during
boot/startup (fixed by coordinator adapter, with deterministic early-cancel test).
Both views' pane tests pass and both changed JSX files parse with the declared
Babel dependency. The native asset-absence test includes actual Scratch/native
missions and imported SPIKE 3 programs, rather than only isolated controller tests.

Validation used Node 22.14.0. GUI dependencies already prepared in the original
checkout were linked into this worktree for tests, without writes to that checkout.
The existing declared three@0.186.1 dependency was missing in that prepared tree,
so its registry tarball was fetched with scripts disabled and unpacked locally.
No dependency manifest/lockfile changed. Independent controller tests need only
Node builtins. Initial validation covered full tests and browser-shaped React pane tests;
full GUI build and real WebGL browser validation were added in the follow-up below.

Oracle comparisons and explicit mutations are in independent-spike-backend.test.mjs;
controller lifecycle/limits/load/hold/scheduling tests are independent-spike-controller.test.mjs.
The full SPIKE suite retains the existing arena checker mutations and reference/wrong
mission pairs. Exact commands, passed counts and artifact hashes are recorded in
validation.json and the TAP logs. The branch is intended for fork review, not merge.


Follow-up GUI integration: the prior mutually exclusive Pybricks/arena dock
branches replaced one another, so a Python program could not retain the mounted
world in the real GUI. Both now render one persistent SpikeSimulatorPane with a
localized backend selector. Pybricks loads lazily only when selected, and native
Start is disabled while Python owns the selected route. Switching awaits the
active completion and prepares a fresh native start without replacing the arena.
Fixed pending run readiness, stale async work after unmount, shared button writes
and release, and actual shared IMU readout. All controller bytes and the independent
agent transcript remain unchanged; these are coordinator-authored integration fixes.

Further oracle probes at requests ±5000°/s exposed saturation near ±942°/s in the
oracle versus the native published ±1110°/s limit. Preserved the strict failed
comparisons and added characterization checks; matching coverage remains the
original thirteen schedules. This is a recorded gap, not a relaxed tolerance or
a claim that the two oversized-speed trajectories match.

A full integrated GUI webpack build and real Chromium/software-WebGL proof now
supplement the React and VM checks. Browser setup was corrected to wait for the
lazy Code editor, use the documented DEVICE SPIKE program route, read the arena's
actual `webgl` status, and block service workers for a genuine asset-404 test.
Local prepared dependencies had an old bw-board and missing xterm; fetched the
exact existing pins/versions into isolated local directories. The first build
hit shared-volume ENOSPC; moved owned outputs/cache to /tmp. Initial webpack cache
writes followed a prepared dependency symlink into the original checkout's cache;
subsequent builds use an isolated cache. No other tracked/source files were modified.
The final build preflight used the script's explicit threshold override of 4 per
CPU (observed 2.75) while concurrent work kept the normal load threshold exceeded.

Privacy relocation on 2026-10-01: raw JSON evidence, transcripts and logs are archived in the private repository. Public comparisons accept an explicit private evidence directory; capture tools reject public-checkout outputs. The two simulator commits were replaced on their own review branch to exclude evidence from its history. Public main is not history-rewritten.
