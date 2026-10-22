# Commit Run state before asynchronous virtual-hub connection

CLAIMED — owner: user-requested PR repair sweep, isolated branch
`lane/hub-run-transition-claim-20261022`, base `2dff9a05c`.
Preserve other owners' worktrees and all existing browser/physical bounds.

Motor successor browser qualification passed API and radio hubs but timed out
in the stock EV3 case before simulation advanced. A diagnostic full suite
passed; this is an intermittent result, not qualification of the original run.
Review independently reproduced a real race in the exact `runBt` method:
React may still have a queued running-state update when a fast connection
resolves, so the method sees ready and skips both clock and green flag.

Own only connection-state transition handling in `runBt`, `runRadioHub` and
the SPIKE `run` path in
`overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx`, and new
complete controls in `test/robot-lab-run-connection.test.mjs`. Wait for the
actual running-state commit before connection; preserve Stop, session
replacement, failed-connection and greenFlag:false behavior. No stale
connection may start a replacement scene or revive a stopped run. Preserve
the existing extension/transport choice and virtual-only connection logic.

Prove the original fast-resolution race, complete fast/deferred connection
and cancellation controls against the actual methods, guarded production
build, and existing complete Chromium/WebKit API/Bluetooth/radio browser
gates. Do not relax, filter or skip any existing assertion, deadline or gate.
Require every enabled final-head hosted check before normal landing.
No supplier, solver, resource, native, firmware or release activation change.
