## iOS audit: one prepared launch environment — 2026-10-19

The unwired command adapter accepts an optional prepared receiver only for an
explicit launch. Preparation records the device-set, device, bundle and directory
identity snapshots. Launch admission checks that binding, the installed file pins,
output-parent identity and receipt absence, and consumes the attempt before clock
or filesystem callbacks. Closed, already captured, unbound or previously attempted
receivers refuse. A failed spawn also consumes the attempt; there is no implicit
retry. This is an internal consistency binding, not an authenticated capability.

The adapter adds only `SIMCTL_CHILD_BW_EMBEDDED_ASSET_AUDIT_PATH`, derived from
that receiver's fixed output. Inherited audit and arbitrary child variables remain
filtered, including on ordinary launches. The binding, file pins and namespace
snapshots are rechecked after the client cleanup, with a final Stop/deadline fence
before returning its reply. This does not contain delegated services or prove
which executable ran. The transaction owner must still clean up a possibly started
app after a refused reply. No arbitrary environment dictionary, workflow caller,
launch input, signing/delivery change or actual observation is added.

Ten new controls run actual owned command processes and file descriptors with
authored responses, including a receipt capture that retains false app claims.
Five runtime mutations detect removed target binding, attempt fencing, old-output
refusal, environment assignment and final cancellation checking. Actual Xcode
prefix/path semantics, namespace ownership, Darwin monitoring, complete joins and
fresh affected candidate qualification remain open. Existing build/helper/input
ordering and the native Ready hook are preserved.
